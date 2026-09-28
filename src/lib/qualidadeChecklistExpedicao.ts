import { supabase } from '../db/supabaseClient';
import type {
  Profile,
  QuaChecklistAssinatura,
  QuaChecklistAssinaturaTipo,
  QuaChecklistExpedicao,
  QuaChecklistFoto,
  QuaChecklistPapel,
  QuaChecklistResposta,
} from '../types';
import { comprimirImagemUpload } from './imageCompression';
import { gerarCodigoFormulario, proximoIndiceCodigo } from './codigosFormulario';

export const CHECKLIST_BUCKET = 'qua-checklist-expedicao';
export const CHECKLIST_PREFIXO = 'EXP';

// Textos no formato "Português / English" (ver separarBilingue).
export const CHECKLIST_ITENS = [
  { chave: 'item_01', numero: 1, descricao: 'Fotografia Etiqueta de Identificação do tramo (QR CODE). / Photograph of the section identification tag.' },
  { chave: 'item_02', numero: 2, descricao: 'Fotografia da Placa do Veículo (Carreta). / Photograph of the Vehicle License Plate (Trailer).' },
  { chave: 'item_03', numero: 3, descricao: 'Fotografia Estado da Lona Inferior - Barra Estabilizadora. / Photograph of Lower Canvas Condition - Stabilizer Bar.' },
  { chave: 'item_04', numero: 4, descricao: 'Fotografia Estado da Lona Superior - Barra Estabilizadora. / Photo: Upper Canvas Status - Stabilizer Bar.' },
  { chave: 'item_05', numero: 5, descricao: 'Fotografia dos itens em anexo na estrutura da escada. / Photograph of the items attached to the staircase structure.' },
  { chave: 'item_06', numero: 6, descricao: 'Fotografia Interna do Tramo isento de arranhões, danos e sujeira no costado do tramo. / Interior photograph of the section, showing the side free of scratches, damage, and dirt.' },
  { chave: 'item_07', numero: 7, descricao: 'Fotografia Externa do Tramo LD, ausente de danos, arranhões, marcas de rolos e cintas e excesso de poeira. / External photograph of the LD section.' },
  { chave: 'item_08', numero: 8, descricao: 'Fotografia Externa do Tramo LE, ausente de danos, arranhões, marcas de rolos e cintas e excesso de poeira. / External photograph of the LE section.' },
  { chave: 'item_19', numero: 19, descricao: 'Fotografia da ovalização do top flange LD. / Photograph showing the ovalization of the top flange.' },
  { chave: 'item_20', numero: 20, descricao: 'Fotografia da ovalização do top flange LE. / Photograph showing the ovalization of the top flange.' },
] as const;

export const CHECKLIST_OBSERVACOES = [
  { chave: 'obs_01', numero: 1, descricao: 'AUSÊNCIAS DE OXIDAÇÃO, GRAXA, MORSAS, MARCA DE ROLOS E DANOS NAS LONAS. / ABSENCES OF OXIDATION, GREASE, WALRUS, ROLLER MARK AND DAMAGE TO THE CANVASES.' },
  { chave: 'obs_02', numero: 2, descricao: 'CHECK AUSÊNCIA DE DANOS NOS CABOS ELÉTRICOS E CONECTORES E SE ESTÃO EMBALADOS. / CHECK FOR DAMAGE TO ELECTRICAL CABLES AND CONNECTORS AND IF THEY ARE PACKED.' },
  { chave: 'obs_03', numero: 3, descricao: 'CHECK FLANGES SEM MARCAS MECÂNICAS, ARRANHÕES, OXIDAÇÃO. / CHECK FLANGES WITHOUT MECHANICAL MARKS, SCRATCHES, OXIDATION.' },
  { chave: 'obs_04', numero: 4, descricao: 'CHECK ESCADAS E PLATAFORMAS SEM DANOS MECÂNICOS, ALINHADAS E ISENTAS DE IMPREGNAÇÕES. / CHECK STAIRS AND PLATFORMS WITHOUT MECHANICAL DAMAGE, ALIGNED AND FREE OF IMPREGNATIONS.' },
] as const;

export const CHECKLIST_PAPEIS: { papel: QuaChecklistPapel; label: string }[] = [
  { papel: 'QUALIDADE', label: 'Qualidade / Quality' },
  { papel: 'PRODUCAO', label: 'Responsável Produção / Production Manager' },
  { papel: 'CLIENTE', label: 'Responsável Cliente / Client Responsible' },
  { papel: 'TRANSPORTADOR', label: 'Transportador / Transporter' },
];

export const CHECKLIST_CAMPOS_CABECALHO = ['cliente', 'projeto', 'tramo_sequencial', 'numero_serie', 'site', 'inspetor_qualidade', 'etiqueta_secao'] as const;
export type ChecklistCampoCabecalho = typeof CHECKLIST_CAMPOS_CABECALHO[number];

export type ChecklistObservacao = { resposta: QuaChecklistResposta | null; texto: string };

const db = (table: string) => (supabase as any).from(table);

function uid(prefix = 'id'): string {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}

function extensao(mimeType: string): string {
  if (mimeType.includes('png')) return 'png';
  if (mimeType.includes('webp')) return 'webp';
  if (mimeType.includes('heif')) return 'heif';
  if (mimeType.includes('heic')) return 'heic';
  return 'jpg';
}

export function hojeLocal(): string {
  const agora = new Date();
  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`;
}

export interface ChecklistInput {
  cliente: string;
  projeto: string;
  tramo_sequencial: string;
  numero_serie: string;
  data_expedicao: string;
  site: string;
  inspetor_qualidade: string;
  etiqueta_secao: string;
  respostas: Record<string, QuaChecklistResposta | null>;
  observacoes: Record<string, ChecklistObservacao>;
  validacao_nomes: Record<QuaChecklistPapel, string>;
}

/** O que falta para fechar: itens e observações sem resposta (números). */
export function faltasParaFechar(
  respostas: Record<string, QuaChecklistResposta | null | undefined>,
  observacoes: Record<string, ChecklistObservacao | undefined>,
): { itens: number[]; observacoes: number[] } {
  return {
    itens: CHECKLIST_ITENS.filter(item => !respostas[item.chave]).map(item => item.numero),
    observacoes: CHECKLIST_OBSERVACOES.filter(item => !observacoes[item.chave]?.resposta).map(item => item.numero),
  };
}

export function papeisAssinados(checklist: Pick<QuaChecklistExpedicao, 'assinaturas'>): Set<QuaChecklistPapel> {
  return new Set(checklist.assinaturas.map(item => item.papel));
}

export function papeisPendentes(checklist: Pick<QuaChecklistExpedicao, 'assinaturas'>): QuaChecklistPapel[] {
  const assinados = papeisAssinados(checklist);
  return CHECKLIST_PAPEIS.map(item => item.papel).filter(papel => !assinados.has(papel));
}

/** Fila de assinaturas: fechados, os mais antigos primeiro. */
export function filaAssinaturas<T extends Pick<QuaChecklistExpedicao, 'status' | 'fechado_em' | 'created_at'>>(lista: T[]): T[] {
  return lista
    .filter(item => item.status === 'AGUARDANDO_ASSINATURAS')
    .sort((a, b) => (a.fechado_em || a.created_at).localeCompare(b.fechado_em || b.created_at));
}

/**
 * Espelha qua_checklist_exp_pode_assinar(): no rascunho só o autor (coleta
 * durante o preenchimento); fechado, o autor, o setor Qualidade ou admin.
 */
export function podeColetarAssinaturas(
  user: Pick<Profile, 'id' | 'roles' | 'sector_id'>,
  checklist: Pick<QuaChecklistExpedicao, 'status' | 'criado_por'>,
  setores: { id: string; name: string }[],
): boolean {
  if (user.roles.includes('admin')) return true;
  if (checklist.status === 'RASCUNHO') return checklist.criado_por === user.id;
  if (checklist.status !== 'AGUARDANDO_ASSINATURAS') return false;
  if (checklist.criado_por === user.id) return true;
  return (setores.find(setor => setor.id === user.sector_id)?.name || '').trim().toLowerCase() === 'qualidade';
}

// Índice reinicia por mês da data de expedição.
export async function obterProximoNumeroChecklist(dataISO: string): Promise<string> {
  const [ano, mes] = dataISO.slice(0, 10).split('-');
  const ultimoDia = new Date(Number(ano), Number(mes), 0).getDate();
  const { data } = await db('qua_checklist_expedicoes')
    .select('codigo_registro')
    .gte('data_expedicao', `${ano}-${mes}-01`)
    .lte('data_expedicao', `${ano}-${mes}-${String(ultimoDia).padStart(2, '0')}`);
  const indice = proximoIndiceCodigo(CHECKLIST_PREFIXO, (data || []).map((row: any) => row.codigo_registro));
  return gerarCodigoFormulario(CHECKLIST_PREFIXO, dataISO, indice);
}

async function assinarUrls<T extends { path: string }>(rows: T[]): Promise<(T & { preview_url?: string })[]> {
  if (!rows.length) return [];
  const { data } = await supabase.storage.from(CHECKLIST_BUCKET).createSignedUrls(rows.map(row => row.path), 60 * 60 * 24);
  const porPath = new Map((data || []).map((item: any) => [item.path, item.signedUrl]));
  return rows.map(row => ({ ...row, preview_url: porPath.get(row.path) }));
}

async function carregarArquivos(checklistId: string) {
  const [{ data: fotos, error: fotosError }, { data: assinaturas, error: assinaturasError }] = await Promise.all([
    db('qua_checklist_expedicao_fotos').select('*').eq('checklist_id', checklistId).order('created_at'),
    db('qua_checklist_expedicao_assinaturas').select('*').eq('checklist_id', checklistId).order('created_at'),
  ]);
  if (fotosError) throw new Error(fotosError.message);
  if (assinaturasError) throw new Error(assinaturasError.message);
  return {
    fotos: await assinarUrls((fotos || []) as QuaChecklistFoto[]),
    assinaturas: await assinarUrls((assinaturas || []) as QuaChecklistAssinatura[]),
  };
}

/** Lista com as assinaturas (sem URL) para a fila mostrar quem já assinou. */
export async function listarChecklists(): Promise<QuaChecklistExpedicao[]> {
  const { data, error } = await db('qua_checklist_expedicoes')
    .select('*').is('excluido_em', null).order('data_expedicao', { ascending: false }).order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  const rows = (data || []) as QuaChecklistExpedicao[];
  const ids = rows.filter(row => row.status !== 'RASCUNHO').map(row => row.id);
  const porChecklist = new Map<string, QuaChecklistAssinatura[]>();
  if (ids.length) {
    const { data: assinaturas } = await db('qua_checklist_expedicao_assinaturas')
      .select('id, checklist_id, papel, nome, tipo, path, mime_type, created_at, assinado_em, coletado_por_nome').in('checklist_id', ids);
    for (const assinatura of (assinaturas || []) as QuaChecklistAssinatura[]) {
      porChecklist.set(assinatura.checklist_id, [...(porChecklist.get(assinatura.checklist_id) || []), assinatura]);
    }
  }
  return rows.map(row => ({ ...row, fotos: [], assinaturas: porChecklist.get(row.id) || [] }));
}

export async function obterChecklist(id: string): Promise<QuaChecklistExpedicao> {
  const { data, error } = await db('qua_checklist_expedicoes').select('*').eq('id', id).single();
  if (error) throw new Error(error.message);
  const arquivos = await carregarArquivos(id);
  return { ...data, ...arquivos } as QuaChecklistExpedicao;
}

export async function salvarChecklist(input: ChecklistInput, user: Profile, id?: string): Promise<QuaChecklistExpedicao> {
  const payload = { ...input, updated_at: new Date().toISOString() };
  let registroId = id;
  if (!registroId) {
    const codigo = await obterProximoNumeroChecklist(input.data_expedicao);
    const { data, error } = await db('qua_checklist_expedicoes')
      .insert({ ...payload, status: 'RASCUNHO', criado_por: user.id, criado_por_nome: user.name, codigo_registro: codigo }).select().single();
    if (error) throw new Error(error.message);
    registroId = data.id;
  } else {
    const { error } = await db('qua_checklist_expedicoes').update(payload).eq('id', registroId);
    if (error) throw new Error(error.message);
  }
  await recordarCabecalhos(input);
  return obterChecklist(registroId);
}

async function atualizarChecklist(id: string, campos: Record<string, unknown>): Promise<void> {
  const { error } = await db('qua_checklist_expedicoes').update({ ...campos, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error(error.message);
}

/** Trava o conteúdo e manda para a fila de assinaturas. */
export async function fecharChecklist(id: string, user: Profile): Promise<void> {
  await atualizarChecklist(id, { status: 'AGUARDANDO_ASSINATURAS', fechado_por: user.id, fechado_por_nome: user.name, fechado_em: new Date().toISOString() });
}

/** Volta para rascunho — o banco só aceita enquanto ninguém assinou. */
export async function reabrirChecklist(id: string): Promise<void> {
  await atualizarChecklist(id, { status: 'RASCUNHO', fechado_por: null, fechado_por_nome: null, fechado_em: null });
}

export async function listarOpcoesCabecalho(campo: ChecklistCampoCabecalho): Promise<string[]> {
  const { data, error } = await db('qua_checklist_cabecalho_opcoes')
    .select('valor').eq('campo', campo).order('ultimo_uso_em', { ascending: false }).limit(40);
  if (error) return [];
  return (data || []).map((row: any) => row.valor).filter(Boolean);
}

export async function recordarCabecalhos(input: Pick<ChecklistInput, ChecklistCampoCabecalho>): Promise<void> {
  for (const campo of CHECKLIST_CAMPOS_CABECALHO) {
    const valor = String(input[campo] || '').trim();
    if (!valor) continue;
    const { data: existente } = await db('qua_checklist_cabecalho_opcoes').select('id, uso_count').eq('campo', campo).eq('valor', valor).maybeSingle();
    if (existente) {
      await db('qua_checklist_cabecalho_opcoes').update({ uso_count: (existente.uso_count || 0) + 1, ultimo_uso_em: new Date().toISOString() }).eq('id', existente.id);
    } else {
      await db('qua_checklist_cabecalho_opcoes').insert({ campo, valor });
    }
  }
}

export async function uploadChecklistFoto(checklistId: string, itemChave: string, file: File): Promise<QuaChecklistFoto> {
  const blob = await comprimirImagemUpload(file);
  const mimeType = blob.type || file.type || 'image/jpeg';
  const path = `${checklistId}/${itemChave}/${uid('foto')}.${extensao(mimeType)}`;
  const { error: uploadError } = await supabase.storage.from(CHECKLIST_BUCKET).upload(path, blob, { contentType: mimeType, upsert: false });
  if (uploadError) throw new Error(uploadError.message);
  const row = { checklist_id: checklistId, item_chave: itemChave, path, file_name: file.name, mime_type: mimeType, size_bytes: blob.size };
  const { data, error } = await db('qua_checklist_expedicao_fotos').insert(row).select().single();
  if (error) throw new Error(error.message);
  return (await assinarUrls([data as QuaChecklistFoto]))[0];
}

export async function removerChecklistFoto(foto: QuaChecklistFoto): Promise<void> {
  await supabase.storage.from(CHECKLIST_BUCKET).remove([foto.path]);
  const { error } = await db('qua_checklist_expedicao_fotos').delete().eq('id', foto.id);
  if (error) throw new Error(error.message);
}

/**
 * Grava a assinatura de um papel (substitui a anterior). O nome vai também para
 * validacao_nomes antes do insert — a 4ª assinatura finaliza o checklist no
 * banco e, depois disso, o registro não aceita mais update.
 */
export async function salvarChecklistAssinatura(
  checklistId: string,
  papel: QuaChecklistPapel,
  nome: string,
  tipo: QuaChecklistAssinaturaTipo,
  file: File | Blob,
  coletadoPor?: Profile,
  assinadoEm?: string,
): Promise<QuaChecklistAssinatura> {
  const { data: atual } = await db('qua_checklist_expedicoes').select('validacao_nomes').eq('id', checklistId).single();
  await atualizarChecklist(checklistId, { validacao_nomes: { ...(atual?.validacao_nomes || {}), [papel]: nome } });
  const { data: anterior } = await db('qua_checklist_expedicao_assinaturas').select('*').eq('checklist_id', checklistId).eq('papel', papel).maybeSingle();
  if (anterior) {
    await supabase.storage.from(CHECKLIST_BUCKET).remove([anterior.path]);
    await db('qua_checklist_expedicao_assinaturas').delete().eq('id', anterior.id);
  }
  const blob = await comprimirImagemUpload(new File([file], `${papel}.jpg`, { type: file.type || 'image/jpeg' }));
  const mimeType = blob.type || file.type || 'image/jpeg';
  const path = `${checklistId}/assinaturas/${papel}-${uid('ass')}.${extensao(mimeType)}`;
  const { error: uploadError } = await supabase.storage.from(CHECKLIST_BUCKET).upload(path, blob, { contentType: mimeType, upsert: false });
  if (uploadError) throw new Error(uploadError.message);
  const { data, error } = await db('qua_checklist_expedicao_assinaturas')
    .insert({ checklist_id: checklistId, papel, nome, tipo, path, mime_type: mimeType, coletado_por_nome: coletadoPor?.name || null, assinado_em: assinadoEm || new Date().toISOString() }).select().single();
  if (error) throw new Error(error.message);
  return (await assinarUrls([data as QuaChecklistAssinatura]))[0];
}

export async function removerChecklistAssinatura(assinatura: QuaChecklistAssinatura): Promise<void> {
  await supabase.storage.from(CHECKLIST_BUCKET).remove([assinatura.path]);
  const { error } = await db('qua_checklist_expedicao_assinaturas').delete().eq('id', assinatura.id);
  if (error) throw new Error(error.message);
}
