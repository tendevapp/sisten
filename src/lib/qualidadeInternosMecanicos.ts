import { supabase } from '../db/supabaseClient';
import type { Profile } from '../types';
import { comprimirImagemUpload } from './imageCompression';
import { gerarCodigoFormulario, proximoIndiceCodigo } from './codigosFormulario';
import { estaOffline } from './rede';
import {
  erroDeArquivoJaExistente, infoOffline, inserirComCodigoUnico,
  type AssinaturaOffline, type FotoOffline, type InfoOffline, type PendenciaOffline, type SalvarProgresso,
} from './qualidadeOffline';

export const INTERNOS_BUCKET = 'qua-internos-mecanicos';
export const INTERNOS_PREFIXO = 'IMC';
export const INTERNOS_CAMPOS_CABECALHO = ['projeto', 'tramo', 'sequencial', 'responsavel_producao', 'responsavel_qualidade', 'instrumentos_utilizados'] as const;
export const INTERNOS_PAPEIS = [
  { papel: 'PRODUCAO', label: 'Produção / Production' },
  { papel: 'QUALIDADE', label: 'Qualidade / Quality' },
] as const;

export type InternosCampoCabecalho = typeof INTERNOS_CAMPOS_CABECALHO[number];
export type InternosPapel = typeof INTERNOS_PAPEIS[number]['papel'];
export type InternosResposta = 'CONFORME' | 'NAO_CONFORME' | 'NA';
// RASCUNHO: Produção preenchendo. AGUARDANDO_QUALIDADE: Produção concluiu e a
// Qualidade ainda não fechou a dupla verificação. FINALIZADO: vai para o histórico.
export type InternosStatus = 'RASCUNHO' | 'AGUARDANDO_QUALIDADE' | 'FINALIZADO';
export type InternosEtapa = 'PRODUCAO' | 'QUALIDADE' | 'LEITURA';
export type InternosAssinaturaTipo = 'DESENHO' | 'SELFIE';

export interface InternosItemModelo {
  chave: string;
  numero: number;
  grupo: string;
  numero_peca: string;
  descricao: string;
  ilustracoes: string[];
  indicadores: string[];
}

export interface InternosModelo {
  id: string;
  nome: string;
  sheet: string;
  formulario: string;
  projeto_padrao: string;
  tramo_padrao: string;
  items: InternosItemModelo[];
}

export function caminhoIlustracaoPdfInternos(modeloId: string, itemChave: string): string {
  return `/qualidade-internos-mecanicos/recortes-pdf/${modeloId}/${itemChave}.png`;
}

export interface CatalogoInternos {
  version: string;
  models: InternosModelo[];
}

export interface InternosRespostaItem {
  /** Verificação da Produção. */
  resposta: InternosResposta | null;
  /** Quem marcou o item na Produção — vem do usuário logado, não é digitado. */
  responsavel: string;
  responsavel_id?: string | null;
  verificado_em?: string | null;
  observacao: string;
  /** Dupla verificação da Qualidade: CONFORME = verificação final (✓). */
  qualidade_resposta?: InternosResposta | null;
  quantidade_nao_conforme: string;
  qualidade_responsavel?: string;
  qualidade_verificado_em?: string | null;
  observacao_qualidade?: string;
}

export interface InternosValidacao {
  resposta: 'SIM' | 'NAO' | null;
  identificacao: string;
}

export interface InternosFoto {
  id: string;
  checklist_id: string;
  item_chave: string;
  path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  preview_url?: string;
  /** Foto só no aparelho, ainda não enviada. */
  local?: FotoOffline;
}

export interface InternosAssinatura {
  id: string;
  checklist_id: string;
  papel: InternosPapel;
  nome: string;
  setor: string | null;
  data_assinatura: string | null;
  /** Momento da captura da assinatura (data e hora). */
  assinado_em: string | null;
  tipo: InternosAssinaturaTipo;
  path: string;
  mime_type: string;
  preview_url?: string;
  local?: AssinaturaOffline;
}

interface InternosIlustracaoStorage {
  asset_key: string;
  path: string;
}

export interface InternosChecklist {
  id: string;
  codigo_registro: string;
  modelo_id: string;
  modelo_nome: string;
  versao_formulario: string;
  status: InternosStatus;
  projeto: string;
  tramo: string;
  sequencial: string;
  responsavel_producao: string | null;
  responsavel_qualidade: string | null;
  instrumentos_utilizados: string | null;
  respostas: Record<string, InternosRespostaItem>;
  validacoes: Record<string, InternosValidacao>;
  observacao_final: string | null;
  aprovacao_final_qualidade: boolean;
  criado_por: string | null;
  criado_por_nome: string | null;
  created_at: string;
  producao_concluida_por: string | null;
  producao_concluida_por_nome: string | null;
  producao_concluida_em: string | null;
  qualidade_por: string | null;
  qualidade_por_nome: string | null;
  qualidade_iniciada_em: string | null;
  finalizado_em: string | null;
  updated_at?: string;
  fotos: InternosFoto[];
  assinaturas: InternosAssinatura[];
  /** Presente quando há alterações só no aparelho (ver qualidadeOffline.ts). */
  offline?: InfoOffline;
}

export interface InternosChecklistInput {
  modelo_id: string;
  modelo_nome: string;
  versao_formulario: string;
  projeto: string;
  tramo: string;
  sequencial: string;
  responsavel_producao: string;
  responsavel_qualidade: string;
  instrumentos_utilizados: string;
  respostas: Record<string, InternosRespostaItem>;
  validacoes: Record<string, InternosValidacao>;
  observacao_final: string;
  aprovacao_final_qualidade: boolean;
}

const db = (table: string) => (supabase as any).from(table);
let catalogoPromise: Promise<CatalogoInternos> | null = null;

function uid(prefix: string): string {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}

function extensao(mimeType: string): string {
  if (mimeType.includes('png')) return 'png';
  if (mimeType.includes('webp')) return 'webp';
  if (mimeType.includes('heif')) return 'heif';
  if (mimeType.includes('heic')) return 'heic';
  return 'jpg';
}

function assetKey(url: string): string {
  return url.split('/').pop() || url;
}

async function urlsAssinadas<T extends { path: string }>(rows: T[]): Promise<(T & { preview_url?: string })[]> {
  if (!rows.length) return [];
  const { data } = await supabase.storage.from(INTERNOS_BUCKET).createSignedUrls(rows.map(row => row.path), 60 * 60 * 24);
  const byPath = new Map((data || []).map((item: any) => [item.path, item.signedUrl]));
  return rows.map(row => ({ ...row, preview_url: byPath.get(row.path) }));
}

export async function carregarCatalogoInternos(): Promise<CatalogoInternos> {
  if (!catalogoPromise) {
    catalogoPromise = fetch('/qualidade-internos-mecanicos/modelos.json')
      .then(response => {
        if (!response.ok) throw new Error('Não foi possível carregar os modelos de internos mecânicos.');
        return response.json() as Promise<CatalogoInternos>;
      })
      .then(catalogo => ({
        ...catalogo,
        models: catalogo.models.map(modelo => ({
          ...modelo,
          items: modelo.items.map(item => ({
            ...item,
            ilustracoes: [caminhoIlustracaoPdfInternos(modelo.id, item.chave)],
          })),
        })),
      }));
    // Falhou (ex.: sem rede no primeiro acesso): não guarda a promessa
    // rejeitada, para a próxima chamada tentar de novo.
    catalogoPromise.catch(() => { catalogoPromise = null; });
  }
  return catalogoPromise;
}

/**
 * Baixa uma vez as ilustrações dos itens (~1,6 MB) para o service worker
 * guardá-las — sem isso, o checklist aberto sem rede mostra os itens sem
 * figura. Só com service worker ativo e rede; repete quando o catálogo muda
 * de versão.
 */
export async function prepararIlustracoesOffline(catalogo: CatalogoInternos): Promise<void> {
  if (typeof navigator === 'undefined' || !navigator.serviceWorker?.controller || estaOffline()) return;
  const chave = `sisten_qua_internos_ilustracoes_${catalogo.version}`;
  try {
    if (localStorage.getItem(chave)) return;
  } catch {
    return;
  }
  const urls = [...new Set(catalogo.models.flatMap(modelo => modelo.items.flatMap(item => item.ilustracoes)))];
  for (let inicio = 0; inicio < urls.length; inicio += 6) {
    await Promise.allSettled(urls.slice(inicio, inicio + 6).map(url => fetch(url)));
    if (estaOffline()) return;
  }
  try { localStorage.setItem(chave, new Date().toISOString()); } catch { /* sem storage: baixa de novo na próxima */ }
}

export { separarBilingue } from './textoBilingue';

export function nomeSetor(setores: { id: string; name: string }[], sectorId?: string | null): string {
  return setores.find(setor => setor.id === sectorId)?.name || '';
}

/** Espelha public.qua_internos_eh_qualidade(): setor Qualidade ou admin. */
export function ehUsuarioQualidade(user: Pick<Profile, 'roles' | 'sector_id'>, setores: { id: string; name: string }[]): boolean {
  if (user.roles.includes('admin')) return true;
  return nomeSetor(setores, user.sector_id).trim().toLowerCase() === 'qualidade';
}

export function etapaDoChecklist(status: InternosStatus | null | undefined): InternosEtapa {
  if (status === 'AGUARDANDO_QUALIDADE') return 'QUALIDADE';
  if (status === 'FINALIZADO') return 'LEITURA';
  return 'PRODUCAO';
}

/** Fila da Qualidade: concluídos pela Produção, os mais antigos primeiro. */
export function pendentesQualidade<T extends Pick<InternosChecklist, 'status' | 'producao_concluida_em' | 'created_at'>>(lista: T[]): T[] {
  return lista
    .filter(item => item.status === 'AGUARDANDO_QUALIDADE')
    .sort((a, b) => (a.producao_concluida_em || a.created_at).localeCompare(b.producao_concluida_em || b.created_at));
}

export function resumoRespostas(respostas: Record<string, InternosRespostaItem> | null | undefined) {
  const valores = Object.values(respostas || {});
  return {
    producaoNc: valores.filter(item => item.resposta === 'NAO_CONFORME').length,
    qualidadeNc: valores.filter(item => item.qualidade_resposta === 'NAO_CONFORME').length,
    qualidadeRespondidos: valores.filter(item => !!item.qualidade_resposta).length,
  };
}

function hojeLocal(): string {
  const agora = new Date();
  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`;
}

export function respostaVazia(): InternosRespostaItem {
  return { resposta: null, responsavel: '', quantidade_nao_conforme: '', observacao: '' };
}

export function respostasVazias(modelo: InternosModelo): Record<string, InternosRespostaItem> {
  return Object.fromEntries(modelo.items.map(item => [item.chave, respostaVazia()]));
}

export function validacoesVazias(): Record<string, InternosValidacao> {
  return {
    nao_conformidade: { resposta: null, identificacao: '' },
    sdr_aberto: { resposta: null, identificacao: '' },
  };
}

export async function listarChecklistsInternos(): Promise<InternosChecklist[]> {
  const { data, error } = await db('qua_internos_mecanicos_checklists')
    .select('*').is('excluido_em', null).order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []).map((item: any) => ({ ...item, fotos: [], assinaturas: [] })) as InternosChecklist[];
}

export async function obterChecklistInternos(id: string): Promise<InternosChecklist> {
  const [{ data: checklist, error }, { data: fotos, error: fotosError }, { data: assinaturas, error: assinaturasError }] = await Promise.all([
    db('qua_internos_mecanicos_checklists').select('*').eq('id', id).single(),
    db('qua_internos_mecanicos_fotos').select('*').eq('checklist_id', id).order('created_at'),
    db('qua_internos_mecanicos_assinaturas').select('*').eq('checklist_id', id).order('created_at'),
  ]);
  if (error) throw new Error(error.message);
  if (fotosError) throw new Error(fotosError.message);
  if (assinaturasError) throw new Error(assinaturasError.message);
  return {
    ...checklist,
    fotos: await urlsAssinadas((fotos || []) as InternosFoto[]),
    assinaturas: await urlsAssinadas((assinaturas || []) as InternosAssinatura[]),
  } as InternosChecklist;
}

// Índice reinicia por dia (a data já está no próprio código). `dia` é o dia
// em que o checklist foi feito — offline, o envio pode acontecer dias depois.
export async function obterProximoCodigoInternos(dia: string = hojeLocal()): Promise<string> {
  const seguinte = new Date(`${dia}T12:00:00`);
  seguinte.setDate(seguinte.getDate() + 1);
  const { data } = await db('qua_internos_mecanicos_checklists').select('codigo_registro')
    .gte('created_at', `${dia}T00:00:00`).lt('created_at', `${dataLocalDe(seguinte.toISOString())}T00:00:00`);
  return gerarCodigoFormulario(INTERNOS_PREFIXO, dia, proximoIndiceCodigo(INTERNOS_PREFIXO, (data || []).map((row: any) => row.codigo_registro)));
}

async function atualizarChecklist(id: string, campos: Record<string, unknown>): Promise<void> {
  const { error } = await db('qua_internos_mecanicos_checklists').update({ ...campos, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function concluirProducaoInternos(id: string, user: Pick<Profile, 'id' | 'name'>): Promise<void> {
  await atualizarChecklist(id, {
    status: 'AGUARDANDO_QUALIDADE',
    producao_concluida_por: user.id,
    producao_concluida_por_nome: user.name,
    producao_concluida_em: new Date().toISOString(),
  });
}

/** Marca quem da Qualidade pegou o registro (a fila mostra "em verificação por"). */
export async function assumirQualidadeInternos(checklist: Pick<InternosChecklist, 'id' | 'qualidade_por'>, user: Profile): Promise<void> {
  if (checklist.qualidade_por === user.id) return;
  await atualizarChecklist(checklist.id, { qualidade_por: user.id, qualidade_por_nome: user.name, qualidade_iniciada_em: new Date().toISOString() });
}

export async function finalizarQualidadeInternos(id: string, user: Pick<Profile, 'id' | 'name'>): Promise<void> {
  await atualizarChecklist(id, {
    status: 'FINALIZADO',
    qualidade_por: user.id,
    qualidade_por_nome: user.name,
    finalizado_em: new Date().toISOString(),
  });
}

export async function listarOpcoesInternos(campo: InternosCampoCabecalho): Promise<string[]> {
  const { data, error } = await db('qua_internos_mecanicos_cabecalho_opcoes')
    .select('valor').eq('campo', campo).order('ultimo_uso_em', { ascending: false }).limit(40);
  if (error) return [];
  return (data || []).map((row: any) => row.valor).filter(Boolean);
}

export async function lembrarCabecalhosInternos(input: Pick<InternosChecklistInput, InternosCampoCabecalho>): Promise<void> {
  for (const campo of INTERNOS_CAMPOS_CABECALHO) {
    const valor = String(input[campo] || '').trim();
    if (!valor) continue;
    const { data: existente } = await db('qua_internos_mecanicos_cabecalho_opcoes').select('id, uso_count').eq('campo', campo).eq('valor', valor).maybeSingle();
    if (existente) {
      await db('qua_internos_mecanicos_cabecalho_opcoes').update({ uso_count: (existente.uso_count || 0) + 1, ultimo_uso_em: new Date().toISOString() }).eq('id', existente.id);
    } else {
      await db('qua_internos_mecanicos_cabecalho_opcoes').insert({ campo, valor });
    }
  }
}

export async function removerFotoInternos(foto: Pick<InternosFoto, 'id' | 'path'>): Promise<void> {
  await supabase.storage.from(INTERNOS_BUCKET).remove([foto.path]);
  const { error } = await db('qua_internos_mecanicos_fotos').delete().eq('id', foto.id);
  if (error) throw new Error(error.message);
}

export async function salvarAssinaturaInternos(
  checklistId: string,
  papel: InternosPapel,
  nome: string,
  setor: string,
  assinadoEm: string,
  tipo: InternosAssinaturaTipo,
  file: File | Blob,
): Promise<InternosAssinatura> {
  const momento = new Date(assinadoEm);
  const dataAssinatura = Number.isNaN(momento.getTime())
    ? null
    : `${momento.getFullYear()}-${String(momento.getMonth() + 1).padStart(2, '0')}-${String(momento.getDate()).padStart(2, '0')}`;
  const { data: anterior } = await db('qua_internos_mecanicos_assinaturas').select('*').eq('checklist_id', checklistId).eq('papel', papel).maybeSingle();
  if (anterior) {
    await supabase.storage.from(INTERNOS_BUCKET).remove([anterior.path]);
    await db('qua_internos_mecanicos_assinaturas').delete().eq('id', anterior.id);
  }
  const blob = await comprimirImagemUpload(new File([file], `${papel}.jpg`, { type: file.type || 'image/jpeg' }));
  const mimeType = blob.type || file.type || 'image/jpeg';
  const path = `${checklistId}/assinaturas/${papel}-${uid('assinatura')}.${extensao(mimeType)}`;
  const { error: uploadError } = await supabase.storage.from(INTERNOS_BUCKET).upload(path, blob, { contentType: mimeType, upsert: false });
  if (uploadError) throw new Error(uploadError.message);
  const { data, error } = await db('qua_internos_mecanicos_assinaturas')
    .insert({ checklist_id: checklistId, papel, nome, setor: setor || null, data_assinatura: dataAssinatura, assinado_em: Number.isNaN(momento.getTime()) ? new Date().toISOString() : momento.toISOString(), tipo, path, mime_type: mimeType }).select().single();
  if (error) throw new Error(error.message);
  return (await urlsAssinadas([data]))[0] as InternosAssinatura;
}

export async function removerAssinaturaInternos(assinatura: Pick<InternosAssinatura, 'id' | 'path'>): Promise<void> {
  await supabase.storage.from(INTERNOS_BUCKET).remove([assinatura.path]);
  const { error } = await db('qua_internos_mecanicos_assinaturas').delete().eq('id', assinatura.id);
  if (error) throw new Error(error.message);
}

export async function sincronizarIlustracoesInternos(catalogo: CatalogoInternos): Promise<Record<string, string>> {
  const sources = [...new Set(catalogo.models.flatMap(modelo => modelo.items.flatMap(item => item.ilustracoes)))].filter(source => !source.includes('/recortes-pdf/'));
  if (!sources.length) return {};
  const keys = sources.map(assetKey);
  const { data } = await db('qua_internos_mecanicos_ilustracoes').select('*').in('asset_key', keys);
  const existentes = new Map((data || []).map((item: any) => [item.asset_key, item]));
  for (const source of sources.filter(item => !existentes.has(assetKey(item)))) {
    try {
      const response = await fetch(source);
      if (!response.ok) continue;
      const file = new File([await response.blob()], assetKey(source), { type: response.headers.get('content-type') || 'image/png' });
      const blob = await comprimirImagemUpload(file);
      const mimeType = blob.type || file.type || 'image/png';
      const key = assetKey(source);
      const path = `ilustracoes/${key.replace(/\.[^.]+$/, '')}.${extensao(mimeType)}`;
      const { error: uploadError } = await supabase.storage.from(INTERNOS_BUCKET).upload(path, blob, { contentType: mimeType, upsert: false });
      if (uploadError) continue;
      const { data: inserted } = await db('qua_internos_mecanicos_ilustracoes')
        .insert({ asset_key: key, path, mime_type: mimeType, size_bytes: blob.size }).select().single();
      if (inserted) existentes.set(key, inserted);
    } catch {
    }
  }
  const rows = [...existentes.values()] as InternosIlustracaoStorage[];
  const signed = await urlsAssinadas(rows);
  return Object.fromEntries(signed.map(item => [item.asset_key, item.preview_url || '']));
}

// =====================================================================
// OFFLINE — preenchimento sem rede (ver qualidadeOffline.ts)
// =====================================================================

export type AcaoInternosOffline = 'concluir' | 'finalizar';
export const ROTULOS_ACAO_INTERNOS: Record<AcaoInternosOffline, string> = {
  concluir: 'concluir e enviar à Qualidade',
  finalizar: 'finalizar checklist',
};
export type PendenciaInternos = PendenciaOffline<InternosChecklistInput, AcaoInternosOffline, InternosChecklist>;

/** Data local (YYYY-MM-DD) de um instante ISO — o dia em que o checklist foi feito no aparelho. */
export function dataLocalDe(iso: string): string {
  const momento = new Date(iso);
  if (Number.isNaN(momento.getTime())) return hojeLocal();
  return `${momento.getFullYear()}-${String(momento.getMonth() + 1).padStart(2, '0')}-${String(momento.getDate()).padStart(2, '0')}`;
}

function registroVazioInternos(p: PendenciaInternos): InternosChecklist {
  return {
    id: p.id, codigo_registro: '', modelo_id: p.input?.modelo_id || '', modelo_nome: p.input?.modelo_nome || '',
    versao_formulario: p.input?.versao_formulario || '', status: 'RASCUNHO',
    projeto: '', tramo: '', sequencial: '', responsavel_producao: null, responsavel_qualidade: null, instrumentos_utilizados: null,
    respostas: {}, validacoes: {}, observacao_final: null, aprovacao_final_qualidade: false,
    criado_por: p.usuarioId, criado_por_nome: p.usuarioNome, created_at: p.criadoEm,
    producao_concluida_por: null, producao_concluida_por_nome: null, producao_concluida_em: null,
    qualidade_por: null, qualidade_por_nome: null, qualidade_iniciada_em: null, finalizado_em: null,
    fotos: [], assinaturas: [],
  };
}

/**
 * Aplica a pendência do aparelho sobre o registro do servidor (ou cria o
 * registro, se nasceu offline). Concluído/finalizado no aparelho já aparece
 * na etapa seguinte — é o que o servidor fará ao receber.
 */
export function aplicarPendenciaInternos(
  base: InternosChecklist | null,
  p: PendenciaInternos,
  urlDe: (arquivo: FotoOffline | AssinaturaOffline) => string,
): InternosChecklist {
  const registro = base || registroVazioInternos(p);
  const removidas = new Set([...p.fotosRemovidas, ...p.assinaturasRemovidas].map(item => item.id));
  const papeisNovos = new Set(p.assinaturasNovas.map(item => item.papel));
  const concluidoAqui = !!p.acao && registro.status === 'RASCUNHO';
  const finalizadoAqui = p.acao === 'finalizar' && registro.status !== 'FINALIZADO';
  const status: InternosStatus = finalizadoAqui ? 'FINALIZADO' : concluidoAqui ? 'AGUARDANDO_QUALIDADE' : registro.status;
  return {
    ...registro,
    ...(p.input || {}),
    status,
    producao_concluida_por: concluidoAqui ? p.usuarioId : registro.producao_concluida_por,
    producao_concluida_por_nome: concluidoAqui ? p.usuarioNome : registro.producao_concluida_por_nome,
    producao_concluida_em: concluidoAqui ? p.atualizadoEm : registro.producao_concluida_em,
    qualidade_por: finalizadoAqui ? p.usuarioId : registro.qualidade_por,
    qualidade_por_nome: finalizadoAqui ? p.usuarioNome : registro.qualidade_por_nome,
    finalizado_em: finalizadoAqui ? p.atualizadoEm : registro.finalizado_em,
    fotos: [
      ...registro.fotos.filter(foto => !removidas.has(foto.id)),
      ...p.fotosNovas.map(foto => ({
        id: foto.id, checklist_id: p.id, item_chave: foto.itemChave, path: '', file_name: foto.nome,
        mime_type: foto.mimeType, size_bytes: foto.blob.size, preview_url: urlDe(foto), local: foto,
      })),
    ],
    assinaturas: [
      ...registro.assinaturas.filter(item => !removidas.has(item.id) && !papeisNovos.has(item.papel)),
      ...p.assinaturasNovas.map(item => ({
        id: item.id, checklist_id: p.id, papel: item.papel as InternosPapel, nome: item.nomePessoa, setor: item.setor || null,
        data_assinatura: dataLocalDe(item.assinadoEm), assinado_em: item.assinadoEm, tipo: item.tipo,
        path: '', mime_type: item.mimeType, preview_url: urlDe(item), local: item,
      })),
    ],
    offline: infoOffline(p),
  };
}

/** Path determinístico: reenviar a mesma foto cai em "já existe" em vez de duplicar. */
async function enviarFotoOfflineInternos(checklistId: string, foto: FotoOffline): Promise<void> {
  const path = `${checklistId}/itens/${foto.itemChave}/foto-${foto.id}.${extensao(foto.mimeType)}`;
  const { error: uploadError } = await supabase.storage.from(INTERNOS_BUCKET).upload(path, foto.blob, { contentType: foto.mimeType, upsert: false });
  if (uploadError && !erroDeArquivoJaExistente(uploadError as { message?: string; statusCode?: string })) throw new Error(uploadError.message);
  const { data: existente, error: consultaError } = await db('qua_internos_mecanicos_fotos').select('id').eq('path', path).maybeSingle();
  if (consultaError) throw new Error(consultaError.message);
  if (existente) return;
  const { error } = await db('qua_internos_mecanicos_fotos')
    .insert({ id: foto.id, checklist_id: checklistId, item_chave: foto.itemChave, path, file_name: foto.nome, mime_type: foto.mimeType, size_bytes: foto.blob.size });
  if (error) throw new Error(error.message);
}

/**
 * Sobe uma pendência: conteúdo → remoções → fotos → assinaturas → status.
 * O status muda por último, depois de fotos e assinaturas (a RLS tira a
 * edição da Produção assim que o registro vai para a Qualidade). Cada passo
 * sai da pendência assim que o servidor confirma.
 */
export async function sincronizarPendenciaInternos(p: PendenciaInternos, salvarProgresso: SalvarProgresso<PendenciaInternos>): Promise<void> {
  const usuario = { id: p.usuarioId, name: p.usuarioNome };
  if (p.input) {
    const input = p.input;
    const { data: atual, error } = await db('qua_internos_mecanicos_checklists').select('id, status').eq('id', p.id).maybeSingle();
    if (error) throw new Error(error.message);
    const payload = { ...input, updated_at: new Date().toISOString() };
    if (!atual) {
      await inserirComCodigoUnico(
        // O código leva o dia em que o checklist foi feito, não o do envio.
        () => obterProximoCodigoInternos(dataLocalDe(p.criadoEm)),
        codigo => db('qua_internos_mecanicos_checklists').insert({
          ...payload, id: p.id, status: 'RASCUNHO', criado_por: usuario.id, criado_por_nome: usuario.name, codigo_registro: codigo, created_at: p.criadoEm,
        }),
      );
    } else {
      if (atual.status === 'FINALIZADO') throw new Error('Este checklist já foi finalizado no servidor — as respostas alteradas no aparelho não podem mais ser aplicadas. Descarte a cópia do aparelho.');
      const { data, error: updateError } = await db('qua_internos_mecanicos_checklists').update(payload).eq('id', p.id).select('id');
      if (updateError) throw new Error(updateError.message);
      if (!data?.length) throw new Error('O servidor não aceitou a alteração: o checklist mudou de etapa ou você não tem permissão para editá-lo.');
    }
    await lembrarCabecalhosInternos(input).catch(() => {});
    await salvarProgresso(() => ({ input: null, novo: false }));
  }
  for (const remocao of p.fotosRemovidas) {
    await removerFotoInternos(remocao);
    await salvarProgresso(atual => ({ fotosRemovidas: atual.fotosRemovidas.filter(item => item.id !== remocao.id) }));
  }
  for (const foto of p.fotosNovas) {
    await enviarFotoOfflineInternos(p.id, foto);
    await salvarProgresso(atual => ({ fotosNovas: atual.fotosNovas.filter(item => item.id !== foto.id) }));
  }
  for (const remocao of p.assinaturasRemovidas) {
    await removerAssinaturaInternos(remocao);
    await salvarProgresso(atual => ({ assinaturasRemovidas: atual.assinaturasRemovidas.filter(item => item.id !== remocao.id) }));
  }
  for (const assinatura of p.assinaturasNovas) {
    await salvarAssinaturaInternos(p.id, assinatura.papel as InternosPapel, assinatura.nomePessoa, assinatura.setor || '', assinatura.assinadoEm, assinatura.tipo, assinatura.blob);
    await salvarProgresso(atual => ({ assinaturasNovas: atual.assinaturasNovas.filter(item => item.id !== assinatura.id) }));
  }
  if (p.acao) {
    const { data, error } = await db('qua_internos_mecanicos_checklists').select('status').eq('id', p.id).single();
    if (error) throw new Error(error.message);
    let status = data.status as InternosStatus;
    if (status === 'RASCUNHO') {
      await concluirProducaoInternos(p.id, usuario);
      status = 'AGUARDANDO_QUALIDADE';
    }
    if (p.acao === 'finalizar' && status === 'AGUARDANDO_QUALIDADE') await finalizarQualidadeInternos(p.id, usuario);
    await salvarProgresso(() => ({ acao: null }));
  }
}
