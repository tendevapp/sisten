/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Modo offline dos formulários, no transporte do Supabase.
 *
 * O `supabase` do app usa `fetchOffline` como `fetch` (ver
 * `db/supabaseClient.ts`). Com isso, sem mudar as telas:
 *
 *   - **Leituras** (GET no PostgREST) guardam a última resposta no aparelho;
 *     sem rede, a tela recebe essa cópia. As gravações ainda na fila são
 *     aplicadas por cima (com os filtros da consulta), então o registro feito
 *     offline aparece na lista — e some da lista "no pátio" quando a saída é
 *     registrada.
 *   - **Gravações** nas tabelas/RPCs/buckets dos formulários
 *     (`configFormularios.ts`) que não chegam ao servidor viram uma operação
 *     na fila do aparelho, e a tela recebe uma resposta provisória no formato
 *     de sempre. Inserções ganham `id` uuid gerado aqui — é o id definitivo,
 *     então passos encadeados (relatório → ocorrências) já usam o id certo.
 *     RPCs que criam registro devolvem um id provisório, trocado pelo real
 *     nas operações seguintes quando a RPC é enviada.
 *   - A fila é enviada na ordem em que nasceu. Para no primeiro erro do
 *     servidor (ordem importa: a ocorrência depende do relatório) e mostra o
 *     motivo; o usuário tenta de novo ou descarta.
 *
 * Os checklists da Qualidade (Expedição e Internos) têm modo offline próprio
 * (`lib/qualidadeOffline.ts`) e não passam por aqui.
 *
 * Não testado por vitest (IndexedDB); a lógica pura está em `postgrest.ts`.
 */

import { createStore, del, get, keys, set, type UseStore } from 'idb-keyval';
import { gerarUUID } from '../ids';
import { estaOffline, pareceFalhaDeRede } from '../rede';
import {
  aplicarEfeitos, corpoNoFormato, idDoFiltro, lerConsulta, lerFiltros, linhasAfetadas, recursoRest, substituirIds, tocaConsulta,
  type EfeitoPendente, type Linha,
} from './postgrest';
import { configBucket, configRpc, configTabela, rpcDeLeitura } from './configFormularios';

// =====================================================================
// Tipos
// =====================================================================

type CorpoGuardado =
  | { tipo: 'texto'; texto: string }
  | { tipo: 'form'; partes: [string, string | Blob, string | undefined][] }
  | { tipo: 'blob'; blob: Blob };

export type EstadoOperacao = 'pendente' | 'enviando' | 'erro';

export interface OperacaoFila {
  id: string;
  usuarioId: string;
  criadoEm: string;
  metodo: string;
  /** Caminho + query, relativo à URL do Supabase. */
  caminho: string;
  cabecalhos: Record<string, string>;
  corpo: CorpoGuardado | null;
  tipo: 'insert' | 'upsert' | 'update' | 'delete' | 'rpc' | 'upload' | 'remover-arquivo';
  tabela?: string;
  rpc?: string;
  /** Efeito sobre as leituras enquanto não sobe. */
  efeito?: EfeitoPendente;
  /** RPC que cria registro: id devolvido à tela, trocado pelo real no envio. */
  idProvisorio?: string;
  /** Formulário ("Chegada de transportes") e o que identifica o registro ("ABC1D23 · Transportadora X"). */
  rotulo: string;
  resumo: string;
  estado: EstadoOperacao;
  tentativas: number;
  erro: string | null;
}

export interface ResultadoFila {
  enviadas: number;
  semRede: boolean;
  /** Primeira operação recusada pelo servidor — a fila para nela. */
  erro: { operacao: OperacaoFila; mensagem: string } | null;
}

// =====================================================================
// Configuração (injetada por db/supabaseClient.ts — evita import circular)
// =====================================================================

interface ConfigFila {
  urlSupabase: string;
  chaveAnon: string;
  fetchReal: typeof fetch;
  /** Token atual da sessão (renova se preciso). */
  obterToken: () => Promise<string | null>;
  renovarToken: () => Promise<string | null>;
}

let config: ConfigFila | null = null;

export function configurarFilaOffline(c: ConfigFila): void {
  config = c;
}

// =====================================================================
// IndexedDB — banco próprio: o localDb hidrata o store padrão inteiro no boot
// =====================================================================

let store: UseStore | null = null;
function banco(): UseStore {
  if (!store) store = createStore('sisten-offline-formularios', 'kv');
  return store;
}

const PREFIXO_OP = 'op:';
const PREFIXO_GET = 'get:';
const CHAVE_MAPA_IDS = 'mapa-ids';
const LIMITE_CORPO_CACHE = 2 * 1024 * 1024;
const LIMITE_ENTRADAS_CACHE = 500;

// Espelho em memória da fila: toda leitura consulta os efeitos pendentes, e
// ler o IndexedDB a cada GET seria caro.
let fila: OperacaoFila[] | null = null;
let carregandoFila: Promise<OperacaoFila[]> | null = null;

async function operacoes(): Promise<OperacaoFila[]> {
  if (fila) return fila;
  if (!carregandoFila) {
    carregandoFila = (async () => {
      try {
        const chaves = (await keys(banco())).filter((k): k is string => typeof k === 'string' && k.startsWith(PREFIXO_OP));
        const itens = await Promise.all(chaves.map(k => get<OperacaoFila>(k, banco())));
        fila = itens.filter((op): op is OperacaoFila => !!op).sort((a, b) => a.criadoEm.localeCompare(b.criadoEm));
      } catch {
        fila = [];
      }
      return fila;
    })();
  }
  return carregandoFila;
}

async function gravarOperacao(op: OperacaoFila): Promise<void> {
  const lista = await operacoes();
  const indice = lista.findIndex(item => item.id === op.id);
  if (indice >= 0) lista[indice] = op; else lista.push(op);
  await set(`${PREFIXO_OP}${op.id}`, op, banco());
  notificar();
}

async function apagarOperacao(id: string): Promise<void> {
  const lista = await operacoes();
  fila = lista.filter(item => item.id !== id);
  await del(`${PREFIXO_OP}${id}`, banco());
  notificar();
}

// =====================================================================
// Ouvintes (indicador na tela)
// =====================================================================

const ouvintes = new Set<() => void>();
const ouvintesEnfileirado = new Set<(op: OperacaoFila) => void>();

function notificar(): void {
  ouvintes.forEach(fn => fn());
}

export function assinarFilaOffline(fn: () => void): () => void {
  ouvintes.add(fn);
  return () => { ouvintes.delete(fn); };
}

/** Avisado a cada gravação que foi para a fila em vez do servidor. */
export function assinarEnfileirado(fn: (op: OperacaoFila) => void): () => void {
  ouvintesEnfileirado.add(fn);
  return () => { ouvintesEnfileirado.delete(fn); };
}

export async function listarOperacoes(usuarioId?: string): Promise<OperacaoFila[]> {
  return (await operacoes()).filter(op => !usuarioId || op.usuarioId === usuarioId);
}

/** Argumentos das chamadas de uma RPC ainda na fila — a tela marca o que já foi feito offline. */
export async function argumentosNaFila(rpc: string): Promise<Record<string, unknown>[]> {
  return (await operacoes())
    .filter(op => op.rpc === rpc && op.corpo?.tipo === 'texto')
    .map(op => {
      try { return JSON.parse((op.corpo as { texto: string }).texto); } catch { return {}; }
    });
}

export async function descartarOperacao(id: string): Promise<void> {
  await apagarOperacao(id);
}

// =====================================================================
// Utilidades de requisição
// =====================================================================

function usuarioDoToken(cabecalhos: Headers): string | null {
  const auth = cabecalhos.get('authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  const partes = token.split('.');
  if (partes.length < 2) return null;
  try {
    const json = JSON.parse(atob(partes[1].replace(/-/g, '+').replace(/_/g, '/')));
    return json.sub || null;
  } catch {
    return null;
  }
}

function cabecalhosGuardaveis(cabecalhos: Headers): Record<string, string> {
  const guardar: Record<string, string> = {};
  for (const nome of ['prefer', 'accept', 'content-type', 'content-profile', 'accept-profile', 'x-upsert', 'cache-control', 'x-client-info']) {
    const valor = cabecalhos.get(nome);
    if (valor) guardar[nome] = valor;
  }
  return guardar;
}

async function guardarCorpo(corpo: BodyInit | null | undefined): Promise<CorpoGuardado | null> {
  if (corpo === null || corpo === undefined) return null;
  if (typeof corpo === 'string') return { tipo: 'texto', texto: corpo };
  if (typeof FormData !== 'undefined' && corpo instanceof FormData) {
    const partes: [string, string | Blob, string | undefined][] = [];
    corpo.forEach((valor, nome) => {
      partes.push([nome, valor, typeof valor !== 'string' && 'name' in valor ? (valor as File).name : undefined]);
    });
    return { tipo: 'form', partes };
  }
  if (typeof Blob !== 'undefined' && corpo instanceof Blob) return { tipo: 'blob', blob: corpo };
  if (corpo instanceof ArrayBuffer || ArrayBuffer.isView(corpo)) return { tipo: 'blob', blob: new Blob([corpo as ArrayBuffer]) };
  return { tipo: 'texto', texto: String(corpo) };
}

function montarCorpo(corpo: CorpoGuardado | null, mapa: Record<string, string>): BodyInit | undefined {
  if (!corpo) return undefined;
  if (corpo.tipo === 'texto') {
    try {
      return JSON.stringify(substituirIds(JSON.parse(corpo.texto), mapa));
    } catch {
      return corpo.texto;
    }
  }
  if (corpo.tipo === 'blob') return corpo.blob;
  const form = new FormData();
  for (const [nome, valor, arquivo] of corpo.partes) {
    if (typeof valor === 'string') form.append(nome, substituirIds(valor, mapa));
    else if (arquivo) form.append(nome, valor, arquivo);
    else form.append(nome, valor);
  }
  return form;
}

function respostaJson(corpo: unknown, status = 200): Response {
  const texto = corpo === undefined ? '' : JSON.stringify(corpo);
  return new Response(status === 204 ? null : texto, {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'x-sisten-offline': '1' },
  });
}

async function mapaIds(): Promise<Record<string, string>> {
  return (await get<Record<string, string>>(CHAVE_MAPA_IDS, banco())) || {};
}

// =====================================================================
// Leituras — cópia no aparelho + efeitos da fila
// =====================================================================

const chaveGet = (usuarioId: string, url: string) => `${PREFIXO_GET}${usuarioId}:${url}`;

interface RespostaGuardada {
  corpo: string;
  status: number;
  contentType: string;
  contentRange: string | null;
  salvoEm: string;
}

let gravacoesCache = 0;

async function guardarLeitura(usuarioId: string, url: string, resposta: RespostaGuardada): Promise<void> {
  if (resposta.corpo.length > LIMITE_CORPO_CACHE) return;
  try {
    await set(chaveGet(usuarioId, url), resposta, banco());
    // De vez em quando, poda as cópias mais antigas.
    if (++gravacoesCache % 50 === 0) void podarCache();
  } catch { /* cota cheia: segue sem cópia */ }
}

async function podarCache(): Promise<void> {
  const chaves = (await keys(banco())).filter((k): k is string => typeof k === 'string' && k.startsWith(PREFIXO_GET));
  if (chaves.length <= LIMITE_ENTRADAS_CACHE) return;
  const datadas = await Promise.all(chaves.map(async chave => ({ chave, salvoEm: (await get<RespostaGuardada>(chave, banco()))?.salvoEm || '' })));
  datadas.sort((a, b) => a.salvoEm.localeCompare(b.salvoEm));
  await Promise.all(datadas.slice(0, chaves.length - LIMITE_ENTRADAS_CACHE).map(item => del(item.chave, banco())));
}

async function efeitosDoUsuario(usuarioId: string): Promise<EfeitoPendente[]> {
  return (await operacoes()).filter(op => op.usuarioId === usuarioId && op.efeito).map(op => op.efeito!);
}

/** Tudo o que o aparelho conhece de uma tabela: cópias de leituras + inserções pendentes. */
async function linhasConhecidas(usuarioId: string, tabela: string): Promise<Linha[]> {
  const prefixo = chaveGet(usuarioId, `${config!.urlSupabase}/rest/v1/${tabela}?`);
  const chaves = (await keys(banco())).filter((k): k is string => typeof k === 'string' && k.startsWith(prefixo));
  const linhas: Linha[] = [];
  for (const chave of chaves) {
    const resposta = await get<RespostaGuardada>(chave, banco());
    try {
      const corpo = JSON.parse(resposta?.corpo || '[]');
      if (Array.isArray(corpo)) linhas.push(...corpo); else if (corpo && typeof corpo === 'object') linhas.push(corpo);
    } catch { /* ignora */ }
  }
  const efeitos = await efeitosDoUsuario(usuarioId);
  return aplicarEfeitos(linhas, { tabela, filtros: [], ordem: [], embeds: [] }, efeitos);
}

function comEfeitos(texto: string, url: URL, accept: string | null, efeitos: EfeitoPendente[]): { corpo: string; status: number } | null {
  const consulta = lerConsulta(url);
  if (!consulta || !tocaConsulta(consulta, efeitos)) return null;
  let dados: unknown;
  try { dados = JSON.parse(texto || '[]'); } catch { return null; }
  const linhas = Array.isArray(dados) ? dados as Linha[] : dados && typeof dados === 'object' ? [dados as Linha] : [];
  const resultado = corpoNoFormato(aplicarEfeitos(linhas, consulta, efeitos), accept);
  return { corpo: JSON.stringify(resultado.corpo), status: resultado.status };
}

const TEMPO_ESPERA_LEITURA_MS = 10_000;

/** O corpo foi relido/reescrito: tamanho e compressão originais não valem mais. */
function semTamanho(cabecalhos: Headers): Headers {
  const copia = new Headers(cabecalhos);
  copia.delete('content-length');
  copia.delete('content-encoding');
  return copia;
}

async function lerRest(url: URL, init: RequestInit, cabecalhos: Headers, usuarioId: string): Promise<Response> {
  const cfg = config!;
  const accept = cabecalhos.get('accept');
  const efeitos = await efeitosDoUsuario(usuarioId);

  const doAparelho = async (erroOriginal: unknown): Promise<Response> => {
    const guardada = await get<RespostaGuardada>(chaveGet(usuarioId, url.href), banco()).catch(() => undefined);
    const consulta = lerConsulta(url);
    if (!guardada) {
      // Sem cópia, mas o registro pedido pode ter nascido offline (abrir o que acabou de criar).
      if (consulta && efeitos.some(efeito => efeito.tabela === consulta.tabela)) {
        const linhas = aplicarEfeitos([], consulta, efeitos);
        if (linhas.length) {
          const r = corpoNoFormato(linhas, accept);
          return respostaJson(r.corpo, r.status);
        }
      }
      throw erroOriginal;
    }
    const aplicado = comEfeitos(guardada.corpo, url, accept, efeitos);
    const headers: Record<string, string> = { 'content-type': guardada.contentType, 'x-sisten-offline': '1' };
    if (guardada.contentRange) headers['content-range'] = guardada.contentRange;
    if (aplicado) return new Response(aplicado.corpo, { status: aplicado.status, headers });
    return new Response(guardada.corpo, { status: guardada.status, headers });
  };

  if (estaOffline()) return doAparelho(new TypeError('Failed to fetch'));

  let resposta: Response;
  try {
    // Rede "de pátio": conectada, mas sem resposta. Depois de alguns segundos,
    // se houver cópia, a tela segue com ela (a busca continua e atualiza a cópia).
    const busca = cfg.fetchReal(url.href, init);
    const tempo = new Promise<'tempo'>(resolve => setTimeout(() => resolve('tempo'), TEMPO_ESPERA_LEITURA_MS));
    // Só nas tabelas dos formulários: relatório pesado (SAP) pode levar mais
    // que isso com rede boa e não deve receber cópia velha.
    const tabela = recursoRest(url.pathname) || '';
    const primeira = configTabela(tabela) ? await Promise.race([busca, tempo]) : await busca;
    if (primeira === 'tempo') {
      const guardada = await get<RespostaGuardada>(chaveGet(usuarioId, url.href), banco()).catch(() => undefined);
      if (guardada) {
        void busca.then(async r => {
          if (r.ok) await guardarLeitura(usuarioId, url.href, { corpo: await r.text(), status: r.status, contentType: r.headers.get('content-type') || 'application/json', contentRange: r.headers.get('content-range'), salvoEm: new Date().toISOString() });
        }).catch(() => {});
        return doAparelho(new TypeError('Failed to fetch'));
      }
      resposta = await busca;
    } else {
      resposta = primeira;
    }
  } catch (erro) {
    if (!pareceFalhaDeRede(erro)) throw erro;
    return doAparelho(erro);
  }

  const contentType = resposta.headers.get('content-type') || '';
  if (!resposta.ok || !contentType.includes('json')) return resposta;
  const texto = await resposta.text();
  void guardarLeitura(usuarioId, url.href, { corpo: texto, status: resposta.status, contentType, contentRange: resposta.headers.get('content-range'), salvoEm: new Date().toISOString() });
  const aplicado = comEfeitos(texto, url, accept, efeitos);
  if (!aplicado) return new Response(texto, { status: resposta.status, statusText: resposta.statusText, headers: semTamanho(resposta.headers) });
  return new Response(aplicado.corpo, { status: aplicado.status, headers: semTamanho(resposta.headers) });
}

/** RPC que só lê: guarda a resposta por (RPC + argumentos) e usa a cópia sem rede. */
async function lerRpc(url: URL, init: RequestInit, usuarioId: string): Promise<Response> {
  const chave = `${url.href}#${typeof init.body === 'string' ? init.body : ''}`;
  const daCopia = async (erro: unknown) => {
    const guardada = await get<RespostaGuardada>(chaveGet(usuarioId, chave), banco()).catch(() => undefined);
    if (!guardada) throw erro;
    return new Response(guardada.corpo, { status: guardada.status, headers: { 'content-type': guardada.contentType, 'x-sisten-offline': '1' } });
  };
  if (estaOffline()) return daCopia(new TypeError('Failed to fetch'));
  let resposta: Response;
  try {
    resposta = await config!.fetchReal(url.href, init);
  } catch (erro) {
    if (!pareceFalhaDeRede(erro)) throw erro;
    return daCopia(erro);
  }
  if (!resposta.ok) return resposta;
  const texto = await resposta.text();
  const contentType = resposta.headers.get('content-type') || 'application/json';
  void guardarLeitura(usuarioId, chave, { corpo: texto, status: resposta.status, contentType, contentRange: null, salvoEm: new Date().toISOString() });
  return new Response(texto, { status: resposta.status, headers: semTamanho(resposta.headers) });
}

// =====================================================================
// Gravações — fila
// =====================================================================

function agoraISO(): string {
  return new Date().toISOString();
}

async function enfileirar(
  url: URL, init: RequestInit, cabecalhos: Headers, usuarioId: string,
  alvo: { tipo: OperacaoFila['tipo']; tabela?: string; rpc?: string; bucket?: string },
): Promise<Response> {
  const metodo = (init.method || 'GET').toUpperCase();
  const accept = cabecalhos.get('accept');
  const representacao = /return=representation/.test(cabecalhos.get('prefer') || '');
  const corpo = await guardarCorpo(init.body);
  const base: OperacaoFila = {
    id: gerarUUID(),
    usuarioId,
    criadoEm: agoraISO(),
    metodo,
    caminho: url.pathname + url.search,
    cabecalhos: cabecalhosGuardaveis(cabecalhos),
    corpo,
    tipo: alvo.tipo,
    tabela: alvo.tabela,
    rpc: alvo.rpc,
    rotulo: '',
    resumo: '',
    estado: 'pendente',
    tentativas: 0,
    erro: null,
  };
  let resposta: Response;

  if (alvo.tipo === 'insert' || alvo.tipo === 'upsert') {
    const cfg = configTabela(alvo.tabela!)!;
    const bruto = corpo?.tipo === 'texto' ? JSON.parse(corpo.texto) : {};
    const lista: Linha[] = Array.isArray(bruto) ? bruto : [bruto];
    // O id nasce aqui e é o definitivo: o reenvio não duplica (a pkey recusa)
    // e os passos seguintes (filhos, fotos) já apontam para ele.
    const agora = agoraISO();
    const paraTela: Linha[] = lista.map(linha => ({ created_at: agora, updated_at: agora, ...linha }));
    const comId = paraTela.filter(linha => linha.id);
    if (comId.length) base.efeito = { tabela: alvo.tabela!, tipo: alvo.tipo, linhas: comId };
    base.rotulo = cfg.rotulo;
    base.resumo = cfg.resumo?.(paraTela[0]) || '';
    const r = corpoNoFormato(paraTela, accept);
    resposta = representacao ? respostaJson(r.corpo, r.status === 200 ? 201 : r.status) : respostaJson(undefined, 201);
  } else if (alvo.tipo === 'update' || alvo.tipo === 'delete') {
    const cfg = configTabela(alvo.tabela!)!;
    const filtros = lerFiltros(url.searchParams);
    const patch: Linha = alvo.tipo === 'update' && corpo?.tipo === 'texto' ? JSON.parse(corpo.texto) : {};
    base.efeito = { tabela: alvo.tabela!, tipo: alvo.tipo, linhas: [patch], filtros };
    let afetadas = linhasAfetadas(await linhasConhecidas(usuarioId, alvo.tabela!), filtros);
    if (!afetadas.length && idDoFiltro(filtros)) afetadas = [{ id: idDoFiltro(filtros) }];
    const resultado = alvo.tipo === 'update' ? afetadas.map(linha => ({ ...linha, ...patch })) : afetadas;
    base.rotulo = cfg.rotulo;
    base.resumo = [alvo.tipo === 'delete' ? 'exclusão' : cfg.rotuloAtualizacao?.(patch) || 'alteração', cfg.resumo?.(resultado[0] || patch)].filter(Boolean).join(' · ');
    const r = corpoNoFormato(resultado, accept);
    resposta = representacao ? respostaJson(r.corpo, r.status) : respostaJson(undefined, 204);
  } else if (alvo.tipo === 'rpc') {
    const cfg = configRpc(alvo.rpc!)!;
    const args = corpo?.tipo === 'texto' ? JSON.parse(corpo.texto || '{}') : {};
    const idProvisorio = gerarUUID();
    base.idProvisorio = cfg.criaRegistro ? idProvisorio : undefined;
    base.rotulo = cfg.rotulo;
    base.resumo = cfg.resumo?.(args) || '';
    const provisorio = cfg.respostaProvisoria(args, idProvisorio);
    resposta = respostaJson(provisorio === undefined ? null : provisorio, 200);
  } else {
    const cfg = configBucket(alvo.bucket!)!;
    base.rotulo = cfg.rotulo;
    base.resumo = alvo.tipo === 'upload' ? 'foto / anexo' : 'remoção de arquivo';
    const caminho = url.pathname.replace(/^.*\/storage\/v1\/object\//, '');
    resposta = respostaJson(alvo.tipo === 'upload' ? { Key: caminho, Id: gerarUUID() } : [], 200);
  }

  await gravarOperacao(base);
  ouvintesEnfileirado.forEach(fn => fn(base));
  agendarEnvio();
  return resposta;
}

/**
 * Inserção ganha `id` antes da primeira tentativa: se a rede cair depois de
 * o servidor gravar, o reenvio bate na pkey e conta como enviado — não
 * duplica. Upsert só quando o conflito é pelo próprio `id` (noutro caso o
 * id novo trocaria a pkey da linha existente).
 */
function comIdsNovos(corpo: BodyInit | null | undefined, tipo: OperacaoFila['tipo'], url: URL): BodyInit | null | undefined {
  if (typeof corpo !== 'string') return corpo;
  if (tipo !== 'insert' && !(tipo === 'upsert' && (url.searchParams.get('on_conflict') || 'id') === 'id')) return corpo;
  try {
    const dados = JSON.parse(corpo);
    const preencher = (linha: Linha) => (linha && typeof linha === 'object' && !linha.id ? { id: gerarUUID(), ...linha } : linha);
    return JSON.stringify(Array.isArray(dados) ? dados.map(preencher) : preencher(dados));
  } catch {
    return corpo;
  }
}

const TEMPO_GRAVACAO_MS = 25_000;
const TEMPO_UPLOAD_MS = 90_000;

/** Decide o destino de uma gravação: servidor agora, ou fila do aparelho. */
async function gravar(
  url: URL, initOriginal: RequestInit, cabecalhos: Headers, usuarioId: string,
  alvo: { tipo: OperacaoFila['tipo']; tabela?: string; rpc?: string; bucket?: string },
): Promise<Response> {
  const init: RequestInit = { ...initOriginal, body: comIdsNovos(initOriginal.body, alvo.tipo, url) };
  // Com operações na fila, esta entra atrás delas: a ordem importa (a
  // ocorrência depende do relatório, a saída depende da entrada).
  const temFila = (await listarOperacoes(usuarioId)).length > 0;
  if (estaOffline() || temFila) return enfileirar(url, init, cabecalhos, usuarioId, alvo);
  // Rede de pátio "conectada" mas muda: depois do limite, a gravação vai para a fila.
  const controle = new AbortController();
  let esgotou = false;
  const relogio = setTimeout(() => { esgotou = true; controle.abort(); }, alvo.tipo === 'upload' ? TEMPO_UPLOAD_MS : TEMPO_GRAVACAO_MS);
  initOriginal.signal?.addEventListener('abort', () => controle.abort());
  try {
    return await config!.fetchReal(url.href, { ...init, signal: controle.signal });
  } catch (erro) {
    if (!esgotou && !pareceFalhaDeRede(erro)) throw erro;
    return enfileirar(url, init, cabecalhos, usuarioId, alvo);
  } finally {
    clearTimeout(relogio);
  }
}

function tipoGravacaoRest(metodo: string, cabecalhos: Headers, url: URL): OperacaoFila['tipo'] | null {
  if (metodo === 'PATCH') return 'update';
  if (metodo === 'DELETE') return 'delete';
  if (metodo === 'POST') {
    const prefer = cabecalhos.get('prefer') || '';
    return /resolution=/.test(prefer) || url.searchParams.has('on_conflict') ? 'upsert' : 'insert';
  }
  return null;
}

/**
 * `fetch` do cliente Supabase do app. Fora do que os formulários usam, é o
 * `fetch` de sempre.
 */
export async function fetchOffline(entrada: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const cfg = config;
  if (!cfg || entrada instanceof Request) return (cfg?.fetchReal || fetch)(entrada, init);
  const url = new URL(String(entrada));
  if (!url.href.startsWith(cfg.urlSupabase)) return cfg.fetchReal(entrada, init);
  const cabecalhos = new Headers(init.headers);
  const usuarioId = usuarioDoToken(cabecalhos);
  if (!usuarioId) return cfg.fetchReal(entrada, init);
  const metodo = (init.method || 'GET').toUpperCase();

  const recurso = recursoRest(url.pathname);
  if (recurso !== null) {
    if (metodo === 'GET') return lerRest(url, init, cabecalhos, usuarioId);
    if (recurso.startsWith('rpc/')) {
      const rpc = recurso.slice(4);
      if (metodo === 'POST' && configRpc(rpc)) return gravar(url, init, cabecalhos, usuarioId, { tipo: 'rpc', rpc });
      if (metodo === 'POST' && rpcDeLeitura(rpc)) return lerRpc(url, init, usuarioId);
      return cfg.fetchReal(entrada, init);
    }
    const tipo = tipoGravacaoRest(metodo, cabecalhos, url);
    if (tipo && configTabela(recurso)) return gravar(url, init, cabecalhos, usuarioId, { tipo, tabela: recurso });
    return cfg.fetchReal(entrada, init);
  }

  const storage = url.pathname.match(/\/storage\/v1\/object\/(?!sign\/|public\/|authenticated\/|list\/|info\/)([^/]+)(\/.*)?$/);
  if (storage && configBucket(storage[1])) {
    if (metodo === 'POST' && storage[2]) return gravar(url, init, cabecalhos, usuarioId, { tipo: 'upload', bucket: storage[1] });
    if (metodo === 'DELETE') return gravar(url, init, cabecalhos, usuarioId, { tipo: 'remover-arquivo', bucket: storage[1] });
  }
  return cfg.fetchReal(entrada, init);
}

// =====================================================================
// Envio da fila
// =====================================================================

let envioAgendado: ReturnType<typeof setTimeout> | null = null;
function agendarEnvio(): void {
  if (envioAgendado || estaOffline()) return;
  envioAgendado = setTimeout(() => {
    envioAgendado = null;
    void sincronizarFilaOffline({ automatico: true });
  }, 1500);
}

let rodada: Promise<ResultadoFila> | null = null;

export function sincronizandoFila(): boolean {
  return !!rodada;
}

/**
 * Envia a fila do usuário logado na ordem em que nasceu. Automática: não
 * insiste em operação já recusada pelo servidor (espera o usuário). Manual:
 * tenta tudo de novo.
 */
export async function sincronizarFilaOffline(opcoes: { automatico?: boolean } = {}): Promise<ResultadoFila> {
  while (rodada) {
    if (opcoes.automatico) return { enviadas: 0, semRede: false, erro: null };
    await rodada.catch(() => {});
  }
  rodada = executarRodada(!!opcoes.automatico);
  notificar();
  try {
    return await rodada;
  } finally {
    rodada = null;
    notificar();
  }
}

async function executarRodada(automatico: boolean): Promise<ResultadoFila> {
  const resultado: ResultadoFila = { enviadas: 0, semRede: false, erro: null };
  const cfg = config;
  if (!cfg) return resultado;
  let token = await cfg.obterToken().catch(() => null);
  if (!token) return { ...resultado, semRede: estaOffline() };
  const usuarioId = usuarioDoToken(new Headers({ authorization: `Bearer ${token}` }));
  const pendentes = (await operacoes()).filter(op => op.usuarioId === usuarioId);
  if (automatico && pendentes[0]?.estado === 'erro') return { ...resultado, erro: { operacao: pendentes[0], mensagem: pendentes[0].erro || '' } };

  for (const inicial of pendentes) {
    let op: OperacaoFila = { ...inicial, estado: 'enviando', tentativas: inicial.tentativas + 1 };
    await gravarOperacao(op);
    try {
      let tentativasCodigo = 0;
      let renovou = false;
      for (;;) {
        const mapa = await mapaIds();
        const cabecalhos = new Headers(op.cabecalhos);
        cabecalhos.set('apikey', cfg.chaveAnon);
        cabecalhos.set('authorization', `Bearer ${token}`);
        const resposta = await cfg.fetchReal(`${cfg.urlSupabase}${substituirIds(op.caminho, mapa)}`, {
          method: op.metodo,
          headers: cabecalhos,
          body: montarCorpo(op.corpo, mapa),
        });
        if (resposta.ok) {
          if (op.idProvisorio) {
            const corpo = await resposta.json().catch(() => null);
            const real = typeof corpo === 'string' ? corpo : corpo?.id;
            if (real) await set(CHAVE_MAPA_IDS, { ...mapa, [op.idProvisorio]: String(real) }, banco());
          }
          break;
        }
        const texto = await resposta.text();
        let erro: { code?: string; message?: string; error?: string; statusCode?: string } = {};
        try { erro = JSON.parse(texto); } catch { erro = { message: texto }; }
        const mensagem = erro.message || erro.error || `HTTP ${resposta.status}`;
        // Já tinha subido (a resposta se perdeu no caminho): o id/arquivo existe.
        if ((erro.code === '23505' && /_pkey/.test(mensagem)) || ((op.tipo === 'upload') && (resposta.status === 409 || /already exists|duplicate/i.test(mensagem)))) break;
        if (resposta.status === 401 && !renovou) {
          renovou = true;
          token = await cfg.renovarToken().catch(() => null);
          if (token) continue;
        }
        // Código de registro calculado offline colidiu: gera de novo, como o online faria.
        if (erro.code === '23505' && tentativasCodigo < 3) {
          const novo = await regenerarCodigo(op, mensagem);
          if (novo) {
            op = novo;
            tentativasCodigo++;
            await gravarOperacao(op);
            continue;
          }
        }
        throw Object.assign(new Error(mensagem), { recusado: true });
      }
      await apagarOperacao(op.id);
      resultado.enviadas++;
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      const semRede = !(erro as { recusado?: boolean }).recusado && pareceFalhaDeRede(erro);
      await gravarOperacao({ ...op, estado: semRede ? 'pendente' : 'erro', erro: semRede ? null : mensagem });
      if (semRede) resultado.semRede = true;
      else resultado.erro = { operacao: { ...op, estado: 'erro', erro: mensagem }, mensagem };
      break;
    }
  }
  return resultado;
}

async function regenerarCodigo(op: OperacaoFila, mensagem: string): Promise<OperacaoFila | null> {
  if (op.corpo?.tipo !== 'texto') return null;
  const regra = op.tabela ? configTabela(op.tabela)?.codigo : op.rpc ? configRpc(op.rpc)?.codigo : undefined;
  if (!regra || !mensagem.includes(regra.coluna)) return null;
  const dados = JSON.parse(op.corpo.texto);
  const novos = await regra.regenerar(dados);
  if (!novos) return null;
  const texto = JSON.stringify(novos);
  return {
    ...op,
    corpo: { tipo: 'texto', texto },
    efeito: op.efeito && (op.tipo === 'insert' || op.tipo === 'upsert')
      ? { ...op.efeito, linhas: op.efeito.linhas.map((linha, i) => ({ ...linha, ...(Array.isArray(novos) ? novos[i] : novos) })) }
      : op.efeito,
  };
}
