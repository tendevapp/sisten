/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Módulo Produção — acesso ao Supabase (etapas, recursos, filas, lançamentos).
 *
 * Segue o padrão dos módulos próprios (`recebimentoAlmoxApi`, `projetosApi`):
 * Supabase direto, `.from()`/`.rpc()` com `as any` porque as tabelas/funções
 * novas ainda não estão em `database.types.ts`, exclusão lógica
 * (`softDelete.ts`).
 *
 * Offline-first: `registrarLancamento` tenta enviar na hora; se a falha for
 * de rede (não de validação), a mutação entra na fila do outbox
 * (`lib/outbox.ts`) com um `client_id` gerado no aparelho, e volta a ser
 * tentada em `processarFilaLancamentos()` — chamada no boot do módulo, ao
 * voltar `online` e ao ganhar foco. A RPC `prod_registrar_lancamento` é
 * idempotente por esse mesmo client_id: um reenvio não duplica o registro.
 */

import { supabase } from '../db/supabaseClient';
import { apenasVigentes } from './softDelete';
import type { PreparedAttachment } from './imageCompression';
import { gerarUUID } from './ids';
import * as outbox from './outbox';
import type { StatusLancamento } from './producao';
import { calcularRelatorioDiario, type RelatorioDiarioLinha } from './producao';
import type {
  ApontamentoChecklistLiberacao,
  EtapaChecklistLiberacao,
  TramoEntrega,
} from './producaoEntrega';

const db = (tabela: string) => (supabase.from as any)(tabela);
const rpc = (nome: string, args: Record<string, unknown>) => supabase.rpc(nome as any, args as any);

const BUCKET = 'prod-evidencias';
const TIPO_OUTBOX = 'prod_lancamento';

// ---------------------------------------------------------------------------
// Tipos de linha (tabelas ainda fora de database.types.ts)
// ---------------------------------------------------------------------------

export interface EtapaProducao {
  id: string;
  nome: string;
  prefixo_codigo: string;
  ordem: number;
  etapa_anterior_id: string | null;
  exige_medicao: boolean;
  ativa: boolean;
}

export interface RecursoProducao {
  id: string;
  tipo: 'corte' | 'calandra' | 'saw' | 'outro';
  nome: string;
  ativo: boolean;
}

export interface FilaItemProducao {
  virola_id: string;
  torre_numero: number;
  tramo: string;
  virola: string;
  rastreabilidade_herdada: string | null;
  corrigir: boolean;
  ultimo_lancamento_id: string | null;
}

export interface AnexoProducao {
  path: string;
  nome: string;
  tipo: string;
}

export interface LancamentoProducao {
  id: string;
  codigo: string;
  client_id: string;
  etapa_id: string;
  virola_id: string;
  projeto: string;
  torre_numero: number;
  tramo: string;
  virola: string;
  data_digitacao: string;
  data_liberacao: string;
  hora: string | null;
  turno: string | null;
  status: StatusLancamento;
  rastreabilidade: string | null;
  recurso_id: string | null;
  execucao_empresa: string | null;
  executante_pessoa_id: string | null;
  executante_nome: string | null;
  inspetor_pessoa_id: string | null;
  inspetor_nome: string | null;
  observacao: string | null;
  evidencias: AnexoProducao[];
  anterior_id: string | null;
  tentativa: number;
  criado_por: string | null;
  criado_por_nome: string | null;
  excluido_em: string | null;
  created_at: string;
  updated_at: string;
}

export interface PendenciaProducao {
  virola_id: string;
  etapa_id: string;
  etapa_nome: string;
  lancamento_id: string;
  codigo: string;
  status: string;
  projeto: string;
  torre_numero: number;
  tramo: string;
  virola: string;
  observacao: string | null;
  created_at: string;
}

export interface AlteracaoProducao {
  id: string;
  lancamento_id: string;
  codigo: string | null;
  alteracoes: { campo: string; de: string | null; para: string | null }[];
  resumo: string | null;
  alterado_por_nome: string | null;
  created_at: string;
}

export interface EntregaTramoProducao {
  projeto: string;
  subprojeto_id: string | null;
  torre_numero: number;
  tramo: string;
  total_virolas: number;
  virolas_liberadas: number;
  pronto_expedicao: boolean;
}

export interface ToleranciaProducaoDb {
  id: string;
  etapa_id: string;
  tramo: string | null;
  virola: string | null;
  medida: string;
  minimo: number | null;
  maximo: number | null;
  unidade: string;
  ativa: boolean;
}

export interface DefeitoProducao {
  id: string;
  codigo: string;
  nome: string;
  descricao: string | null;
  ativo: boolean;
}

// ---------------------------------------------------------------------------
// Cadastros (leitura)
// ---------------------------------------------------------------------------

export async function listarEtapas(): Promise<EtapaProducao[]> {
  const { data, error } = await db('prod_etapas').select('*').order('ordem');
  if (error) throw new Error(error.message);
  return (data ?? []) as EtapaProducao[];
}

/** Só as etapas já implementadas na tela (Blocos 1-2: corte/chanfro/calandra/solda). */
export async function listarEtapasAtivas(): Promise<EtapaProducao[]> {
  return (await listarEtapas()).filter(e => e.ativa);
}

export async function listarRecursos(tipo?: RecursoProducao['tipo']): Promise<RecursoProducao[]> {
  let query = db('prod_recursos').select('*').eq('ativo', true).order('nome');
  if (tipo) query = query.eq('tipo', tipo);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as RecursoProducao[];
}

export async function listarTolerancias(etapaId = 'evs'): Promise<ToleranciaProducaoDb[]> {
  const { data, error } = await db('prod_tolerancias')
    .select('*')
    .eq('etapa_id', etapaId)
    .eq('ativa', true)
    .order('medida');
  if (error) throw new Error(error.message);
  return (data ?? []) as ToleranciaProducaoDb[];
}

export async function listarDefeitos(): Promise<DefeitoProducao[]> {
  const { data, error } = await db('prod_defeitos').select('*').eq('ativo', true).order('nome');
  if (error) throw new Error(error.message);
  return (data ?? []) as DefeitoProducao[];
}

export async function criarDefeito(dados: Pick<DefeitoProducao, 'codigo' | 'nome' | 'descricao'>): Promise<DefeitoProducao> {
  const { data, error } = await db('prod_defeitos').insert({ codigo: dados.codigo.trim().toUpperCase(), nome: dados.nome.trim(), descricao: dados.descricao?.trim() || null }).select('*').single();
  if (error) throw new Error(error.message);
  return data as DefeitoProducao;
}

export async function atualizarDefeito(id: string, patch: Partial<Pick<DefeitoProducao, 'codigo' | 'nome' | 'descricao' | 'ativo'>>): Promise<void> {
  const update: Record<string, unknown> = {};
  if (patch.codigo !== undefined) update.codigo = patch.codigo.trim().toUpperCase();
  if (patch.nome !== undefined) update.nome = patch.nome.trim();
  if (patch.descricao !== undefined) update.descricao = patch.descricao?.trim() || null;
  if (patch.ativo !== undefined) update.ativo = patch.ativo;
  if (!Object.keys(update).length) return;
  const { error } = await db('prod_defeitos').update(update).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function criarTolerancia(dados: Omit<Pick<ToleranciaProducaoDb, 'etapa_id' | 'tramo' | 'virola' | 'medida' | 'minimo' | 'maximo' | 'unidade'>, never>): Promise<ToleranciaProducaoDb> {
  const { data, error } = await db('prod_tolerancias').insert({ ...dados, medida: dados.medida.trim(), unidade: dados.unidade.trim() || 'mm' }).select('*').single();
  if (error) throw new Error(error.message);
  return data as ToleranciaProducaoDb;
}

export async function atualizarTolerancia(id: string, patch: Partial<Pick<ToleranciaProducaoDb, 'etapa_id' | 'tramo' | 'virola' | 'medida' | 'minimo' | 'maximo' | 'unidade' | 'ativa'>>): Promise<void> {
  const update: Record<string, unknown> = { ...patch };
  if (patch.medida !== undefined) update.medida = patch.medida.trim();
  if (patch.unidade !== undefined) update.unidade = patch.unidade.trim() || 'mm';
  const { error } = await db('prod_tolerancias').update(update).eq('id', id);
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Fila e pendências
// ---------------------------------------------------------------------------

export async function listarFilaEtapa(etapaId: string, subprojetoId?: string | null): Promise<FilaItemProducao[]> {
  const { data, error } = await rpc('prod_fila_etapa', {
    p_etapa_id: etapaId,
    p_projeto: 'GW_JACOBINA',
    p_subprojeto_id: subprojetoId ?? null,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as FilaItemProducao[];
}

/** Contagem por etapa, para o badge dos cards do hub — uma chamada por etapa ativa. */
export async function contarFilaPorEtapa(etapaIds: string[], subprojetoId?: string | null): Promise<Record<string, number>> {
  const entradas = await Promise.all(
    etapaIds.map(async id => [id, (await listarFilaEtapa(id, subprojetoId)).length] as const),
  );
  return Object.fromEntries(entradas);
}

export async function listarPendencias(): Promise<PendenciaProducao[]> {
  const { data, error } = await db('prod_pendencias').select('*').order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as PendenciaProducao[];
}

export async function listarMatrizEntrega(subprojetoId?: string): Promise<EntregaTramoProducao[]> {
  let query = db('prod_entrega_matriz').select('*').eq('projeto', 'GW_JACOBINA').order('torre_numero').order('tramo');
  if (subprojetoId) query = query.eq('subprojeto_id', subprojetoId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as EntregaTramoProducao[];
}

export async function listarTramosEntrega(subprojetoId?: string): Promise<TramoEntrega[]> {
  let query = db('prod_tramos_entrega')
    .select('*')
    .eq('projeto', 'GW_JACOBINA')
    .order('torre_numero')
    .order('tramo');
  if (subprojetoId) query = query.eq('subprojeto_id', subprojetoId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as TramoEntrega[];
}

export async function atualizarTramoEntrega(
  id: string,
  campos: Partial<TramoEntrega>,
): Promise<void> {
  const payload = { ...campos, updated_at: new Date().toISOString() };
  const { error } = await db('prod_tramos_entrega').update(payload).eq('id', id);
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Checklist de Liberação do tramo (White → Expedido) — apontamento à parte,
// com histórico, independente da categoria cromática do cilindro.
// ---------------------------------------------------------------------------

/** Busca em lote (evita N+1) — usado pela Visão Expedição, que lista vários tramos de uma vez. */
export async function listarChecklistLiberacaoLote(
  tramoEntregaIds: string[],
): Promise<ApontamentoChecklistLiberacao[]> {
  if (tramoEntregaIds.length === 0) return [];
  const { data, error } = await db('prod_tramos_entrega_checklist')
    .select('*')
    .in('tramo_entrega_id', tramoEntregaIds)
    .is('excluido_em', null);
  if (error) throw new Error(error.message);
  return (data ?? []) as ApontamentoChecklistLiberacao[];
}

export async function marcarEtapaChecklist(
  tramoEntregaId: string,
  etapaCodigo: EtapaChecklistLiberacao,
  concluidaPor: string | null,
): Promise<ApontamentoChecklistLiberacao> {
  const { data, error } = await db('prod_tramos_entrega_checklist')
    .insert({
      tramo_entrega_id: tramoEntregaId,
      etapa_codigo: etapaCodigo,
      concluida_por: concluidaPor?.trim() || null,
    })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data as ApontamentoChecklistLiberacao;
}

export async function desmarcarEtapaChecklist(apontamentoId: string): Promise<void> {
  const { error } = await db('prod_tramos_entrega_checklist')
    .update({ excluido_em: new Date().toISOString() })
    .eq('id', apontamentoId);
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Evidências (regra 1 do CLAUDE.md — nada sobe cru)
// ---------------------------------------------------------------------------

/** Path determinístico (`etapa/clientId-indice.ext`): um reenvio do outbox sobrescreve em vez de duplicar. */
async function subirEvidencia(
  clientId: string,
  etapaId: string,
  indice: number,
  arquivo: PreparedAttachment,
): Promise<AnexoProducao> {
  const extensao = (arquivo.name.split('.').pop() || 'jpg').toLowerCase();
  const path = `${etapaId}/${clientId}-${indice}.${extensao}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, arquivo.blob, { contentType: arquivo.mimeType, upsert: true });
  if (error) throw new Error(`Falha no upload da evidência: ${error.message}`);
  return { path, nome: arquivo.name, tipo: arquivo.mimeType };
}

export async function assinarEvidencias(paths: string[]): Promise<Record<string, string>> {
  if (!paths.length) return {};
  const { data } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 60 * 60 * 24);
  const mapa: Record<string, string> = {};
  (data ?? []).forEach((item: any) => {
    if (item?.path && item?.signedUrl) mapa[item.path] = item.signedUrl;
  });
  return mapa;
}

// ---------------------------------------------------------------------------
// Registrar lançamento — offline-first
// ---------------------------------------------------------------------------

export interface RegistrarLancamentoInput {
  etapaId: string;
  virolaId: string;
  status: StatusLancamento;
  dataLiberacao: string;
  hora?: string | null;
  turno?: string | null;
  recursoId?: string | null;
  execucaoEmpresa?: string | null;
  rastreabilidade?: string | null;
  executantePessoaId?: string | null;
  executanteNome?: string | null;
  inspetorPessoaId?: string | null;
  inspetorNome?: string | null;
  observacao?: string | null;
  criadoPorNome?: string | null;
  criadoPorId?: string | null;
  detalhes?: {
    evs?: Record<string, number | null>;
    flange?: { raiz_1?: number | null; raiz_2?: number | null; raiz_3?: number | null; raiz_4?: number | null; offsets?: Record<string, number | null>; aceite_pendencia?: boolean };
    defeitoId?: string | null;
    motivoRefugo?: string | null;
    utReparos?: Array<{ defeitoId?: string | null; largura?: number | null; comprimento?: number | null; profundidade?: number | null; procedimento?: string | null }>;
    assinaturaInspetor?: string | null;
  };
}

interface OutboxPayload {
  clientId: string;
  input: RegistrarLancamentoInput;
}

/** `TypeError: Failed to fetch` (Chrome/Edge) e afins — falha de conectividade, não de validação. */
function pareceFalhaDeRede(erro: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const msg = erro instanceof Error ? erro.message : String(erro);
  return /failed to fetch|networkerror|network request failed|load failed|err_internet|err_network/i.test(msg);
}

function montarPayloadRpc(input: RegistrarLancamentoInput, clientId: string, evidencias: AnexoProducao[]) {
  return {
    client_id: clientId,
    etapa_id: input.etapaId,
    virola_id: input.virolaId,
    status: input.status,
    data_liberacao: input.dataLiberacao,
    hora: input.hora ?? null,
    turno: input.turno ?? null,
    recurso_id: input.recursoId ?? null,
    execucao_empresa: input.execucaoEmpresa ?? null,
    rastreabilidade: input.rastreabilidade ?? null,
    executante_pessoa_id: input.executantePessoaId ?? null,
    executante_nome: input.executanteNome ?? null,
    inspetor_pessoa_id: input.inspetorPessoaId ?? null,
    inspetor_nome: input.inspetorNome ?? null,
    observacao: input.observacao ?? null,
    evidencias,
    criado_por_nome: input.criadoPorNome ?? null,
  };
}

async function enviarAoServidor(
  clientId: string,
  input: RegistrarLancamentoInput,
  anexos: PreparedAttachment[],
): Promise<{ id: string; codigo: string; jaExistia: boolean }> {
  const evidencias = await Promise.all(anexos.map((a, i) => subirEvidencia(clientId, input.etapaId, i, a)));
  const { data, error } = await rpc('prod_registrar_lancamento', { p: montarPayloadRpc(input, clientId, evidencias) });
  if (error) throw new Error(error.message);
  if (input.detalhes) {
    const { error: detalhesErro } = await rpc('prod_salvar_detalhes_lancamento', {
      p_lancamento_id: data.id,
      p_detalhes: input.detalhes,
    });
    if (detalhesErro) throw new Error(detalhesErro.message);
    if (input.detalhes.assinaturaInspetor) {
      const { error: assinaturaErro } = await db('prod_lancamentos').update({
        assinatura_inspetor: input.detalhes.assinaturaInspetor,
        assinatura_inspetor_por: input.criadoPorId ?? null,
        assinatura_inspetor_em: new Date().toISOString(),
      }).eq('id', data.id);
      if (assinaturaErro) throw new Error(assinaturaErro.message);
    }
  }
  if ((input.etapaId === 'ut' && (input.status === 'reprovado' || input.status === 'refugado')) && data?.id) {
    await notificarPendenciaUt(String(data.id), input).catch(err => console.warn('Produção: falha ao notificar UT', err));
  }
  return { id: data.id, codigo: data.codigo, jaExistia: data.ja_existia };
}

/** Notifica administradores e usuários explicitamente habilitados para lançar UT.
 * O id determinístico evita duplicidade quando o outbox reenvia o mesmo client_id. */
async function notificarPendenciaUt(lancamentoId: string, input: RegistrarLancamentoInput): Promise<void> {
  const { data: perfis, error } = await db('core_perfis').select('id,roles,page_access');
  if (error) throw new Error(error.message);
  const destinatarios = (perfis ?? []).filter((p: any) => {
    const roles = Array.isArray(p.roles) ? p.roles : [];
    return roles.includes('admin') || p.page_access?.prod_lancar_ut === true;
  });
  const rows = destinatarios
    .filter((p: any) => p.id && p.id !== input.criadoPorId)
    .map((p: any) => ({
      id: `prod-ut-${lancamentoId}-${p.id}`,
      user_id: p.id,
      title: input.status === 'refugado' ? 'Virola refugada no UT' : 'Reprovação de UT aguardando correção',
      description: `Torre ${input.virolaId}: a inspeção UT exige atenção no Controle de Liberações.`,
      type: 'warning',
      is_read: false,
      request_id: null,
      request_number: null,
      context_key: `producao:pendencias:${lancamentoId}`,
      created_at: new Date().toISOString(),
    }));
  if (rows.length) {
    const { error: insertError } = await supabase.from('core_notificacoes').upsert(rows as any, { onConflict: 'id', ignoreDuplicates: true });
    if (insertError) throw new Error(insertError.message);
  }
}

export interface ResultadoRegistro {
  enfileirado: boolean;
  clientId: string;
  /** Só presente quando enviado com sucesso na hora. */
  codigo?: string;
}

/**
 * Registra um lançamento. Tenta enviar na hora; se a rede falhar, guarda no
 * outbox (com as fotos já comprimidas/carimbadas, prontas para subir quando a
 * conexão voltar) e devolve `enfileirado: true` — a tela mostra "Aguardando
 * envio" em vez do código definitivo.
 */
export async function registrarLancamento(
  input: RegistrarLancamentoInput,
  anexos: PreparedAttachment[] = [],
): Promise<ResultadoRegistro> {
  const clientId = gerarUUID();
  try {
    const { codigo } = await enviarAoServidor(clientId, input, anexos);
    return { enfileirado: false, clientId, codigo };
  } catch (erro) {
    if (!pareceFalhaDeRede(erro)) throw erro;
    await outbox.enfileirar<OutboxPayload>({
      id: clientId,
      tipo: TIPO_OUTBOX,
      payload: { clientId, input },
      arquivos: anexos.map((a, i) => ({
        campo: `evidencias[${i}]`,
        blob: a.blob,
        nome: a.name,
        mimeType: a.mimeType,
      })),
    });
    return { enfileirado: true, clientId };
  }
}

/**
 * Reenvia a fila do outbox. Chamar no boot do módulo, em `online` e em
 * `focus`/`visibilitychange` — mesma cadência do `syncFromSupabase` do core.
 */
export async function processarFilaLancamentos(): Promise<{ enviados: number; falharam: number }> {
  return outbox.processarFila<OutboxPayload>(TIPO_OUTBOX, async item => {
    const anexos: PreparedAttachment[] = (item.arquivos ?? []).map(a => ({
      blob: a.blob,
      name: a.nome,
      mimeType: a.mimeType,
      sizeOriginal: a.blob.size,
      sizeCompressed: a.blob.size,
      previewUrl: '',
    }));
    await enviarAoServidor(item.payload.clientId, item.payload.input, anexos);
  });
}

export async function contarPendentesOutbox(): Promise<number> {
  return outbox.contarPendentes(TIPO_OUTBOX);
}

export function assinarMudancasOutbox(fn: () => void): () => void {
  return outbox.subscribe(fn);
}

export async function descartarPendenteOutbox(clientId: string): Promise<void> {
  await outbox.remover(clientId);
}

// ---------------------------------------------------------------------------
// Editar / consultar
// ---------------------------------------------------------------------------

export async function editarLancamento(
  id: string,
  campos: Partial<{
    status: StatusLancamento;
    dataLiberacao: string;
    hora: string | null;
    turno: string | null;
    rastreabilidade: string | null;
    recursoId: string | null;
    execucaoEmpresa: string | null;
    executantePessoaId: string | null;
    executanteNome: string | null;
    inspetorPessoaId: string | null;
    inspetorNome: string | null;
    observacao: string | null;
    evidencias: AnexoProducao[];
  }>,
  alteradoPorNome: string,
): Promise<{ alteracoes: { campo: string; de: string | null; para: string | null }[] }> {
  const payload: Record<string, unknown> = {};
  if (campos.status !== undefined) payload.status = campos.status;
  if (campos.dataLiberacao !== undefined) payload.data_liberacao = campos.dataLiberacao;
  if (campos.hora !== undefined) payload.hora = campos.hora;
  if (campos.turno !== undefined) payload.turno = campos.turno;
  if (campos.rastreabilidade !== undefined) payload.rastreabilidade = campos.rastreabilidade;
  if (campos.recursoId !== undefined) payload.recurso_id = campos.recursoId;
  if (campos.execucaoEmpresa !== undefined) payload.execucao_empresa = campos.execucaoEmpresa;
  if (campos.executantePessoaId !== undefined) payload.executante_pessoa_id = campos.executantePessoaId;
  if (campos.executanteNome !== undefined) payload.executante_nome = campos.executanteNome;
  if (campos.inspetorPessoaId !== undefined) payload.inspetor_pessoa_id = campos.inspetorPessoaId;
  if (campos.inspetorNome !== undefined) payload.inspetor_nome = campos.inspetorNome;
  if (campos.observacao !== undefined) payload.observacao = campos.observacao;
  if (campos.evidencias !== undefined) payload.evidencias = campos.evidencias;

  const { data, error } = await rpc('prod_editar_lancamento', {
    p_id: id,
    p_campos: payload,
    p_alterado_por_nome: alteradoPorNome,
  });
  if (error) throw new Error(error.message);
  return { alteracoes: data.alteracoes ?? [] };
}

/** Ficha da virola: linha do tempo completa, mais antigo primeiro. */
export async function listarLancamentosPorVirola(virolaId: string): Promise<LancamentoProducao[]> {
  const { data, error } = await apenasVigentes(
    db('prod_lancamentos').select('*').eq('virola_id', virolaId).order('created_at', { ascending: true }),
  );
  if (error) throw new Error(error.message);
  return (data ?? []) as LancamentoProducao[];
}

export interface FiltrosConsultaProducao {
  etapaId?: string;
  status?: StatusLancamento;
  torreNumero?: number;
  dataInicial?: string;
  dataFinal?: string;
  termo?: string;
}

export async function listarLancamentos(filtros: FiltrosConsultaProducao = {}): Promise<LancamentoProducao[]> {
  let query = db('prod_lancamentos').select('*');
  query = apenasVigentes(query);
  if (filtros.etapaId) query = query.eq('etapa_id', filtros.etapaId);
  if (filtros.status) query = query.eq('status', filtros.status);
  if (filtros.torreNumero) query = query.eq('torre_numero', filtros.torreNumero);
  if (filtros.dataInicial) query = query.gte('data_liberacao', filtros.dataInicial);
  if (filtros.dataFinal) query = query.lte('data_liberacao', filtros.dataFinal);
  query = query.order('created_at', { ascending: false }).limit(500);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  let linhas = (data ?? []) as LancamentoProducao[];
  if (filtros.termo?.trim()) {
    const termo = filtros.termo.trim().toLowerCase();
    linhas = linhas.filter(l =>
      [l.codigo, l.virola, l.rastreabilidade, l.observacao].some(v => v?.toLowerCase().includes(termo)),
    );
  }
  return linhas;
}

export async function listarRelatorioDiario(filtros: Pick<FiltrosConsultaProducao, 'dataInicial' | 'dataFinal'> = {}): Promise<RelatorioDiarioLinha[]> {
  const linhas = await listarLancamentos(filtros);
  return calcularRelatorioDiario(linhas);
}

export async function listarAlteracoes(lancamentoId: string): Promise<AlteracaoProducao[]> {
  const { data, error } = await db('prod_alteracoes')
    .select('*')
    .eq('lancamento_id', lancamentoId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as AlteracaoProducao[];
}
