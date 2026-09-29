/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Checklists da Qualidade offline (Expedição e Internos Mecânicos).
 *
 * Os dois checklists são preenchidos no pátio/dentro da torre, muitas vezes
 * sem sinal. Em vez de gravar direto no Supabase (e perder tudo quando a rede
 * cai), cada checklist salvo vira uma **pendência** no aparelho — conteúdo,
 * fotos já comprimidas e assinaturas — e sobe quando a conexão volta.
 *
 * Diferente do outbox da Produção (`outbox.ts`, fila de mutações imutáveis),
 * aqui a pendência é um rascunho vivo: o inspetor reabre, edita, tira mais
 * fotos, coleta assinaturas — sempre sobre a mesma pendência, uma por
 * checklist.
 *
 * Idempotência:
 *   - O `id` do checklist é gerado no aparelho (`gerarUUID()`) e vira o id
 *     definitivo da linha no banco — reenvio não duplica.
 *   - Cada etapa concluída da sincronização (conteúdo, cada foto, cada
 *     assinatura, a mudança de status) é tirada da pendência na hora
 *     (`salvarProgresso`); se a rede cai no meio, a próxima rodada continua
 *     de onde parou.
 *   - Foto tem path determinístico (`.../foto-<id>.jpg`): upload repetido cai
 *     em "já existe" e é tratado como sucesso.
 *
 * Armazenamento: IndexedDB em um banco próprio (`sisten-qualidade-offline`) e
 * não no store padrão do idb-keyval — o `localDb` hidrata o store padrão
 * inteiro em memória no boot, e aqui há blobs de foto.
 *
 * A parte de IndexedDB não é testada por vitest (ambiente Node, sem
 * IndexedDB — mesmo motivo de `outbox.ts`); a lógica pura de mesclar
 * pendência com o registro do servidor fica nas libs de cada checklist.
 */

import { createStore, get, set, del, keys, type UseStore } from 'idb-keyval';
import { pareceFalhaDeRede } from './rede';
import { gerarUUID } from './ids';
import { comprimirImagemUpload } from './imageCompression';

export type ModuloOffline = 'qua_expedicao' | 'qua_internos';
export type EstadoPendencia = 'pendente' | 'sincronizando' | 'erro';

export interface ArquivoOffline {
  id: string;
  blob: Blob;
  nome: string;
  mimeType: string;
}

export interface FotoOffline extends ArquivoOffline {
  itemChave: string;
}

export interface AssinaturaOffline extends ArquivoOffline {
  papel: string;
  nomePessoa: string;
  tipo: 'DESENHO' | 'SELFIE';
  /** Momento da captura — é o que tela e PDF mostram, não o do upload. */
  assinadoEm: string;
  setor?: string;
  coletadoPorNome?: string | null;
}

/** Foto/assinatura que já está no servidor e foi removida no aparelho. */
export interface RemocaoOffline {
  id: string;
  path: string;
}

export interface PendenciaOffline<TInput = unknown, TAcao extends string = string, TBase = unknown> {
  /** Id definitivo do checklist — gerado no aparelho quando o checklist nasce offline. */
  id: string;
  modulo: ModuloOffline;
  /** Dono da pendência: só ele sincroniza (a RLS confere `auth.uid()`). */
  usuarioId: string;
  usuarioNome: string;
  /** Ainda não existe no servidor. */
  novo: boolean;
  /** Conteúdo a gravar; `null` = não mexe no conteúdo (ex.: só assinaturas num checklist fechado). */
  input: TInput | null;
  /** Mudança de status pendente (fechar, concluir, finalizar…). */
  acao: TAcao | null;
  fotosNovas: FotoOffline[];
  fotosRemovidas: RemocaoOffline[];
  assinaturasNovas: AssinaturaOffline[];
  assinaturasRemovidas: RemocaoOffline[];
  /** Último retrato do registro no servidor — para listar e reabrir sem rede. */
  base: TBase | null;
  criadoEm: string;
  atualizadoEm: string;
  estado: EstadoPendencia;
  tentativas: number;
  ultimoErro: string | null;
  ultimaTentativaEm: string | null;
}

/** Marca que o registro na tela tem alterações só no aparelho. */
export interface InfoOffline {
  estado: EstadoPendencia;
  novo: boolean;
  erro: string | null;
  atualizadoEm: string;
}

export function infoOffline(p: Pick<PendenciaOffline, 'estado' | 'novo' | 'ultimoErro' | 'atualizadoEm'>): InfoOffline {
  return { estado: p.estado, novo: p.novo, erro: p.ultimoErro, atualizadoEm: p.atualizadoEm };
}

/** Pendência vazia para um checklist — o chamador preenche o que mudou. */
export function novaPendencia<TInput, TAcao extends string, TBase>(
  modulo: ModuloOffline,
  id: string,
  usuario: { id: string; name: string },
  campos: Partial<PendenciaOffline<TInput, TAcao, TBase>> = {},
): PendenciaOffline<TInput, TAcao, TBase> {
  const agora = new Date().toISOString();
  return {
    id,
    modulo,
    usuarioId: usuario.id,
    usuarioNome: usuario.name,
    novo: false,
    input: null,
    acao: null,
    fotosNovas: [],
    fotosRemovidas: [],
    assinaturasNovas: [],
    assinaturasRemovidas: [],
    base: null,
    criadoEm: agora,
    atualizadoEm: agora,
    estado: 'pendente',
    tentativas: 0,
    ultimoErro: null,
    ultimaTentativaEm: null,
    ...campos,
  };
}

/** Pendência sem mais nada a enviar (tudo já subiu). */
export function pendenciaVazia(p: PendenciaOffline): boolean {
  return !p.novo && !p.input && !p.acao && !p.fotosNovas.length && !p.fotosRemovidas.length && !p.assinaturasNovas.length && !p.assinaturasRemovidas.length;
}

/** "3 fotos · 1 assinatura · fechar" — o que ainda falta subir. */
export function descreverPendencia(p: PendenciaOffline, rotulosAcao: Record<string, string> = {}): string {
  const partes: string[] = [];
  if (p.novo) partes.push('checklist novo');
  else if (p.input) partes.push('respostas');
  if (p.fotosNovas.length) partes.push(`${p.fotosNovas.length} ${p.fotosNovas.length === 1 ? 'foto' : 'fotos'}`);
  if (p.assinaturasNovas.length) partes.push(`${p.assinaturasNovas.length} ${p.assinaturasNovas.length === 1 ? 'assinatura' : 'assinaturas'}`);
  const remocoes = p.fotosRemovidas.length + p.assinaturasRemovidas.length;
  if (remocoes) partes.push(`${remocoes} ${remocoes === 1 ? 'remoção' : 'remoções'}`);
  if (p.acao) partes.push(rotulosAcao[p.acao] || p.acao);
  return partes.join(' · ') || 'nada pendente';
}

/**
 * Registros do servidor com as pendências do aparelho aplicadas por cima; as
 * que ainda não existem no servidor entram no topo, mais recentes primeiro.
 */
export function mesclarComPendencias<T extends { id: string }, P extends PendenciaOffline>(
  servidor: T[],
  pendencias: P[],
  aplicar: (base: T | null, p: P) => T,
): T[] {
  const porId = new Map(pendencias.map(p => [p.id, p]));
  const noServidor = new Set(servidor.map(item => item.id));
  const soNoAparelho = pendencias
    .filter(p => !noServidor.has(p.id))
    .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm))
    .map(p => aplicar((p.base as T | null) ?? null, p));
  return [...soNoAparelho, ...servidor.map(item => {
    const p = porId.get(item.id);
    return p ? aplicar(item, p) : item;
  })];
}

/** Foto tirada no checklist: comprime já na captura (regra 1 do CLAUDE.md) e fica pronta para guardar no aparelho. */
export async function prepararFotoOffline(itemChave: string, file: File): Promise<FotoOffline> {
  const blob = await comprimirImagemUpload(file);
  return { id: gerarUUID(), itemChave, blob, nome: file.name, mimeType: blob.type || file.type || 'image/jpeg' };
}

/**
 * Assinatura coletada no tablet, pronta para guardar no aparelho. Não
 * comprime aqui: o envio passa pela mesma função de gravação de assinatura
 * de sempre, que já comprime.
 */
export function prepararAssinaturaOffline(
  papel: string,
  coletada: { nome: string; tipo: 'DESENHO' | 'SELFIE'; arquivo: File | Blob; assinadoEm: string },
  extra: { setor?: string; coletadoPorNome?: string | null } = {},
): AssinaturaOffline {
  return {
    id: gerarUUID(),
    papel,
    nomePessoa: coletada.nome,
    tipo: coletada.tipo,
    blob: coletada.arquivo,
    nome: coletada.arquivo instanceof File ? coletada.arquivo.name : `${papel}.jpg`,
    mimeType: coletada.arquivo.type || 'image/jpeg',
    assinadoEm: coletada.assinadoEm,
    ...extra,
  };
}

/**
 * Insere com código de registro gerado na hora do envio (offline não dá para
 * saber o próximo índice). Se outro aparelho pegou o mesmo código no meio
 * tempo, a unique de `codigo_registro` recusa e gera de novo.
 */
export async function inserirComCodigoUnico(
  gerarCodigo: () => Promise<string>,
  inserir: (codigo: string) => Promise<{ error: { message: string; code?: string } | null }>,
): Promise<void> {
  for (let tentativa = 1; ; tentativa++) {
    const { error } = await inserir(await gerarCodigo());
    if (!error) return;
    const codigoRepetido = error.code === '23505' && /codigo_registro/i.test(error.message);
    if (!codigoRepetido || tentativa >= 3) throw new Error(error.message);
  }
}

// =====================================================================
// IndexedDB
// =====================================================================

const PREFIXO_PENDENCIA = 'pend:';
const PREFIXO_CACHE = 'cache:';

// Criado sob demanda: `createStore` abre o IndexedDB na hora da chamada, e o
// módulo também é importado pelos testes (Node, sem IndexedDB).
let store: UseStore | null = null;
function banco(): UseStore {
  if (!store) store = createStore('sisten-qualidade-offline', 'kv');
  return store;
}

const chavePendencia = (modulo: ModuloOffline, id: string) => `${PREFIXO_PENDENCIA}${modulo}:${id}`;
const chaveCache = (modulo: ModuloOffline, chave: string) => `${PREFIXO_CACHE}${modulo}:${chave}`;

const ouvintes = new Set<() => void>();
function notificar(): void {
  ouvintes.forEach(fn => fn());
}

/** Assina mudanças nas pendências (entrou, saiu, mudou de estado). Devolve o cancelamento. */
export function assinarPendencias(fn: () => void): () => void {
  ouvintes.add(fn);
  return () => { ouvintes.delete(fn); };
}

export async function listarPendencias<P extends PendenciaOffline = PendenciaOffline>(modulo: ModuloOffline, usuarioId?: string): Promise<P[]> {
  const prefixo = `${PREFIXO_PENDENCIA}${modulo}:`;
  const todas = (await keys(banco())).filter((k): k is string => typeof k === 'string' && k.startsWith(prefixo));
  const itens = (await Promise.all(todas.map(k => get<P>(k, banco())))) as (P | undefined)[];
  return itens
    .filter((p): p is P => !!p && (!usuarioId || p.usuarioId === usuarioId))
    .sort((a, b) => a.criadoEm.localeCompare(b.criadoEm));
}

export async function obterPendencia<P extends PendenciaOffline = PendenciaOffline>(modulo: ModuloOffline, id: string): Promise<P | null> {
  return (await get<P>(chavePendencia(modulo, id), banco())) || null;
}

/** Grava a pendência (substitui). Volta o estado para `pendente` — foi editada, merece nova tentativa. */
export async function salvarPendencia<P extends PendenciaOffline>(p: P): Promise<P> {
  const registro = { ...p, estado: 'pendente' as const, ultimoErro: null, atualizadoEm: new Date().toISOString() };
  await set(chavePendencia(p.modulo, p.id), registro, banco());
  notificar();
  return registro;
}

async function gravarSemNotificar<P extends PendenciaOffline>(p: P): Promise<void> {
  await set(chavePendencia(p.modulo, p.id), p, banco());
}

export async function removerPendencia(modulo: ModuloOffline, id: string): Promise<void> {
  await del(chavePendencia(modulo, id), banco());
  liberarUrlsDe(id);
  notificar();
}

/** Guarda um valor para leitura offline (lista, detalhe, opções, catálogo). */
export async function guardarCache<T>(modulo: ModuloOffline, chave: string, valor: T): Promise<void> {
  try {
    await set(chaveCache(modulo, chave), { valor, salvoEm: new Date().toISOString() }, banco());
  } catch (erro) {
    console.warn('Qualidade offline: não foi possível guardar cache', erro);
  }
}

export async function lerCache<T>(modulo: ModuloOffline, chave: string): Promise<{ valor: T; salvoEm: string } | null> {
  try {
    return (await get<{ valor: T; salvoEm: string }>(chaveCache(modulo, chave), banco())) || null;
  } catch {
    return null;
  }
}

/**
 * Busca no servidor e guarda para uso offline; sem rede, devolve a última
 * cópia guardada (`doCache: true`). Erro que não é de rede sobe como está.
 */
export async function comCache<T>(modulo: ModuloOffline, chave: string, buscar: () => Promise<T>): Promise<{ valor: T; doCache: boolean; salvoEm: string | null }> {
  try {
    const valor = await buscar();
    void guardarCache(modulo, chave, valor);
    return { valor, doCache: false, salvoEm: null };
  } catch (erro) {
    if (!pareceFalhaDeRede(erro)) throw erro;
    const cache = await lerCache<T>(modulo, chave);
    if (!cache) throw erro;
    return { valor: cache.valor, doCache: true, salvoEm: cache.salvoEm };
  }
}

// =====================================================================
// URLs de pré-visualização dos blobs guardados
// =====================================================================

// Uma URL por arquivo, reaproveitada entre renderizações; liberada quando a
// pendência sai do aparelho.
const urls = new Map<string, { url: string; dono: string }>();

export function urlLocal(arquivo: ArquivoOffline, donoId = ''): string {
  const existente = urls.get(arquivo.id);
  if (existente) return existente.url;
  const url = URL.createObjectURL(arquivo.blob);
  urls.set(arquivo.id, { url, dono: donoId });
  return url;
}

function liberarUrlsDe(donoId: string): void {
  for (const [id, item] of urls) {
    if (item.dono === donoId) {
      URL.revokeObjectURL(item.url);
      urls.delete(id);
    }
  }
}

// =====================================================================
// Sincronização
// =====================================================================

/**
 * Tira da pendência o que já subiu. Recebe a pendência como está no banco
 * agora (pode ter sido editada durante o envio) — filtre por id, nunca
 * reescreva listas a partir da cópia antiga.
 */
export type SalvarProgresso<P extends PendenciaOffline> = (alterar: (atual: P) => Partial<P>) => Promise<P>;
export type SincronizadorPendencia<P extends PendenciaOffline> = (p: P, salvarProgresso: SalvarProgresso<P>) => Promise<void>;

export interface ResultadoSincronizacao {
  enviados: string[];
  /** Falhou por falta de rede — continua pendente, sem alarde. */
  semRede: string[];
  /** O servidor recusou — fica marcado com erro até o usuário agir. */
  erros: { id: string; mensagem: string }[];
}

const emAndamento = new Map<ModuloOffline, Promise<unknown>>();

/** Está sincronizando este módulo agora (evita rodadas sobrepostas). */
export function sincronizandoModulo(modulo: ModuloOffline): boolean {
  return emAndamento.has(modulo);
}

/**
 * Envia as pendências do usuário, uma por vez, na ordem em que nasceram
 * (o código de registro segue a ordem de envio). Uma rodada por módulo:
 * chamada concorrente automática (evento `online` + foco + intervalo) devolve
 * vazio; a pedida pelo usuário (`aguardar`) espera a rodada atual e roda em
 * seguida — o salvar precisa saber se o SEU checklist subiu.
 */
export async function sincronizarPendencias<P extends PendenciaOffline>(
  modulo: ModuloOffline,
  usuarioId: string,
  sincronizar: SincronizadorPendencia<P>,
  opcoes: { ids?: string[]; ignorar?: string[]; aguardar?: boolean } = {},
): Promise<ResultadoSincronizacao> {
  while (emAndamento.has(modulo)) {
    if (!opcoes.aguardar) return { enviados: [], semRede: [], erros: [] };
    await emAndamento.get(modulo)!.catch(() => {});
  }
  const rodada = executarRodada(modulo, usuarioId, sincronizar, opcoes);
  emAndamento.set(modulo, rodada);
  notificar();
  try {
    return await rodada;
  } finally {
    emAndamento.delete(modulo);
    notificar();
  }
}

async function executarRodada<P extends PendenciaOffline>(
  modulo: ModuloOffline,
  usuarioId: string,
  sincronizar: SincronizadorPendencia<P>,
  opcoes: { ids?: string[]; ignorar?: string[] },
): Promise<ResultadoSincronizacao> {
  const resultado: ResultadoSincronizacao = { enviados: [], semRede: [], erros: [] };
  const pendencias = (await listarPendencias<P>(modulo, usuarioId))
    .filter(p => !opcoes.ids || opcoes.ids.includes(p.id))
    .filter(p => !opcoes.ignorar?.includes(p.id));
  for (const inicial of pendencias) {
    let atual: P = { ...inicial, estado: 'sincronizando', ultimaTentativaEm: new Date().toISOString() };
    await gravarSemNotificar(atual);
    notificar();
    const salvarProgresso: SalvarProgresso<P> = async alterar => {
      // Relê antes de gravar: o usuário pode ter editado a pendência
      // (nova foto, nova assinatura) enquanto esta rodada subia outra coisa.
      const doBanco = (await obterPendencia<P>(modulo, atual.id)) || atual;
      const patch = alterar(doBanco);
      // Conteúdo/ação regravados durante o envio são mais novos que o que
      // subiu: continuam pendentes para a próxima rodada.
      if (doBanco.atualizadoEm !== inicial.atualizadoEm) {
        delete patch.input;
        delete patch.acao;
      }
      atual = { ...doBanco, ...patch, estado: 'sincronizando' };
      await gravarSemNotificar(atual);
      return atual;
    };
    try {
      await sincronizar(atual, salvarProgresso);
      const final = (await obterPendencia<P>(modulo, atual.id)) || atual;
      if (final.atualizadoEm === inicial.atualizadoEm || pendenciaVazia(final)) {
        await del(chavePendencia(modulo, atual.id), banco());
        liberarUrlsDe(atual.id);
      } else {
        // Editada durante o envio: o que entrou depois fica para a próxima rodada.
        await gravarSemNotificar({ ...final, estado: 'pendente', ultimoErro: null });
      }
      resultado.enviados.push(atual.id);
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      const semRede = pareceFalhaDeRede(erro);
      const final = (await obterPendencia<P>(modulo, atual.id)) || atual;
      await gravarSemNotificar({
        ...final,
        estado: semRede ? 'pendente' : 'erro',
        tentativas: final.tentativas + 1,
        ultimoErro: semRede ? 'Sem conexão com o servidor.' : mensagem,
      });
      if (semRede) {
        resultado.semRede.push(atual.id);
        // Sem rede para um, sem rede para todos: não insiste nos demais.
        break;
      }
      resultado.erros.push({ id: atual.id, mensagem });
    }
    notificar();
  }
  return resultado;
}

/** Upload em Storage que tolera "já existe" (reenvio da mesma foto). */
export function erroDeArquivoJaExistente(erro: { message?: string; statusCode?: string | number } | null | undefined): boolean {
  if (!erro) return false;
  return String(erro.statusCode) === '409' || /already exists|duplicate/i.test(erro.message || '');
}
