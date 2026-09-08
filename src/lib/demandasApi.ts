/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Módulo Demandas — I/O no Supabase (tabelas `dem_*`).
 *
 * Segue o padrão dos módulos próprios (`facilitiesApi.ts`, `ssmaApi.ts`):
 * Supabase direto, sem passar pelo cache do `localDb`; `.from()` usa `as any`
 * porque as tabelas novas ainda não estão em `database.types.ts`. Exclusão é
 * lógica (`softDelete.ts`). As regras de quem vê o quê estão em
 * `demandasAcesso.ts` e são aplicadas na tela.
 */

import { supabase } from '../db/supabaseClient';
import type {
  DemAnexo, DemBucket, DemChecklistItem, DemPrioridade, DemQuadro, DemStatus,
  DemTarefa, DemTarefaAtividade, Profile,
} from '../types';
import { apenasVigentes, marcarExcluido, marcarRestaurado } from './softDelete';
import { prepareAttachment } from './imageCompression';
import { gerarCodigoTarefa, proximaOrdem } from './demandasQuadro';

const BUCKET_ANEXOS = 'dem-anexos';

const db = (nome: string) => (supabase.from as any)(nome);

/** Buckets criados junto com todo quadro novo. */
const BUCKETS_PADRAO = ['A fazer', 'Fazendo', 'Concluído'];

function erro(contexto: string, error: { message?: string } | null): never {
  console.error(`Demandas: ${contexto}`, error);
  throw new Error(error?.message || contexto);
}

/* ==================================================================== */
/* Quadros                                                              */
/* ==================================================================== */

export async function listarQuadros(incluirArquivados = false): Promise<DemQuadro[]> {
  let query = db('dem_quadros').select('*').order('ordem').order('nome');
  query = apenasVigentes(query);
  if (!incluirArquivados) query = query.eq('arquivado', false);
  const { data, error } = await query;
  if (error) erro('falha ao listar quadros', error);
  return (data || []).map(normalizarQuadro);
}

function normalizarQuadro(row: any): DemQuadro {
  return { ...row, membros_extra: row.membros_extra || [] } as DemQuadro;
}

export async function criarQuadro(
  dados: { nome: string; descricao?: string; setor_id: string; cor?: string | null },
  user: Pick<Profile, 'id'>,
): Promise<DemQuadro> {
  const existentes = await listarQuadros(true);
  const { data, error } = await db('dem_quadros')
    .insert({
      nome: dados.nome.trim(),
      descricao: dados.descricao?.trim() || null,
      setor_id: dados.setor_id,
      cor: dados.cor || null,
      ordem: proximaOrdem(existentes),
      criado_por: user.id,
    })
    .select('*')
    .single();
  if (error) erro('falha ao criar quadro', error);

  const quadro = normalizarQuadro(data);
  // Buckets iniciais — um quadro sem colunas não serve para nada.
  await db('dem_buckets').insert(
    BUCKETS_PADRAO.map((nome, i) => ({ quadro_id: quadro.id, nome, ordem: i })),
  );
  return quadro;
}

export async function atualizarQuadro(
  id: string,
  patch: Partial<Pick<DemQuadro, 'nome' | 'descricao' | 'cor' | 'arquivado' | 'ordem' | 'membros_extra'>>,
  aviso?: { quadroAnterior: DemQuadro; autor: Pick<Profile, 'id' | 'name'> },
): Promise<void> {
  const update: Record<string, unknown> = {};
  if (patch.nome !== undefined) update.nome = patch.nome.trim();
  if (patch.descricao !== undefined) update.descricao = patch.descricao?.trim() || null;
  if (patch.cor !== undefined) update.cor = patch.cor || null;
  if (patch.arquivado !== undefined) update.arquivado = patch.arquivado;
  if (patch.ordem !== undefined) update.ordem = patch.ordem;
  if (patch.membros_extra !== undefined) update.membros_extra = patch.membros_extra;
  const { error } = await db('dem_quadros').update(update).eq('id', id);
  if (error) erro('falha ao atualizar quadro', error);

  // Notifica quem entrou agora na lista de compartilhamento (@usuário).
  if (patch.membros_extra && aviso) {
    const novos = patch.membros_extra.filter(uid => !aviso.quadroAnterior.membros_extra.includes(uid));
    if (novos.length > 0) await notificarCompartilhamentoQuadro(aviso.quadroAnterior, novos, aviso.autor);
  }
}

export async function compartilharQuadro(
  quadro: DemQuadro, userId: string, autor?: Pick<Profile, 'id' | 'name'>,
): Promise<string[]> {
  if (quadro.membros_extra.includes(userId)) return quadro.membros_extra;
  const proximo = [...quadro.membros_extra, userId];
  await atualizarQuadro(
    quadro.id,
    { membros_extra: proximo },
    autor ? { quadroAnterior: quadro, autor } : undefined,
  );
  return proximo;
}

export async function removerMembroQuadro(quadro: DemQuadro, userId: string): Promise<string[]> {
  const proximo = quadro.membros_extra.filter(id => id !== userId);
  await atualizarQuadro(quadro.id, { membros_extra: proximo });
  return proximo;
}

export async function excluirQuadro(id: string, user: Pick<Profile, 'id'>): Promise<void> {
  const { error } = await db('dem_quadros').update(marcarExcluido(user.id)).eq('id', id);
  if (error) erro('falha ao excluir quadro', error);
}

export async function restaurarQuadro(id: string): Promise<void> {
  const { error } = await db('dem_quadros').update(marcarRestaurado()).eq('id', id);
  if (error) erro('falha ao restaurar quadro', error);
}

/* ==================================================================== */
/* Buckets                                                             */
/* ==================================================================== */

export async function listarBuckets(quadroId: string): Promise<DemBucket[]> {
  const query = apenasVigentes(
    db('dem_buckets').select('*').eq('quadro_id', quadroId).order('ordem'),
  );
  const { data, error } = await query;
  if (error) erro('falha ao listar buckets', error);
  return (data || []) as DemBucket[];
}

export async function criarBucket(
  quadroId: string, nome: string, ordem?: number, cor?: string | null,
): Promise<DemBucket> {
  const posicao = ordem ?? proximaOrdem(await listarBuckets(quadroId));
  const { data, error } = await db('dem_buckets')
    .insert({ quadro_id: quadroId, nome: nome.trim() || 'Nova coluna', ordem: posicao, cor: cor ?? null })
    .select('*')
    .single();
  if (error) erro('falha ao criar bucket', error);
  return data as DemBucket;
}

export async function atualizarBucket(
  id: string, patch: { nome?: string; cor?: string | null },
): Promise<void> {
  const update: Record<string, unknown> = {};
  if (patch.nome !== undefined) update.nome = patch.nome.trim() || 'Coluna';
  if (patch.cor !== undefined) update.cor = patch.cor;
  if (Object.keys(update).length === 0) return;
  const { error } = await db('dem_buckets').update(update).eq('id', id);
  if (error) erro('falha ao atualizar bucket', error);
}

export async function reordenarBuckets(itens: { id: string; ordem: number }[]): Promise<void> {
  const resultados = await Promise.all(
    itens.map(it => db('dem_buckets').update({ ordem: it.ordem }).eq('id', it.id)),
  );
  const falha = resultados.find(r => r.error);
  if (falha?.error) erro('falha ao reordenar buckets', falha.error);
}

/** Exclui um bucket (soft) e solta as tarefas dele para "sem coluna". */
export async function excluirBucket(id: string): Promise<void> {
  const solta = await db('dem_tarefas').update({ bucket_id: null }).eq('bucket_id', id);
  if (solta.error) erro('falha ao soltar tarefas do bucket', solta.error);
  const { error } = await db('dem_buckets').update({ excluido_em: new Date().toISOString() }).eq('id', id);
  if (error) erro('falha ao excluir bucket', error);
}

/* ==================================================================== */
/* Tarefas                                                             */
/* ==================================================================== */

export async function listarTarefas(quadroId: string): Promise<DemTarefa[]> {
  const query = apenasVigentes(
    db('dem_tarefas').select('*').eq('quadro_id', quadroId).order('ordem'),
  );
  const { data, error } = await query;
  if (error) erro('falha ao listar tarefas', error);
  return (data || []).map(normalizarTarefa);
}

/** Tarefas em que o usuário é responsável, de todos os quadros (tela "Minhas tarefas"). */
export async function listarTarefasDoUsuario(userId: string): Promise<DemTarefa[]> {
  const query = apenasVigentes(
    db('dem_tarefas').select('*').contains('responsaveis', [userId]).order('data_vencimento', { nullsFirst: false }),
  );
  const { data, error } = await query;
  if (error) erro('falha ao listar tarefas do usuário', error);
  return (data || []).map(normalizarTarefa);
}

function normalizarTarefa(row: any): DemTarefa {
  return {
    ...row,
    responsaveis: row.responsaveis || [],
    checklist: (row.checklist || []) as DemChecklistItem[],
    anexos: (row.anexos || []) as DemAnexo[],
  } as DemTarefa;
}

async function codigosDoMesCorrente(): Promise<string[]> {
  const agora = new Date();
  const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1).toISOString();
  const { data } = await db('dem_tarefas')
    .select('codigo')
    .gte('created_at', inicioMes);
  return (data || []).map((r: any) => r.codigo).filter(Boolean);
}

export async function criarTarefa(
  dados: {
    quadro_id: string;
    bucket_id?: string | null;
    titulo: string;
    descricao?: string;
    responsaveis?: string[];
    data_inicio?: string | null;
    data_vencimento?: string | null;
    prioridade?: DemPrioridade;
    status?: DemStatus;
  },
  user: Pick<Profile, 'id' | 'name'>,
): Promise<DemTarefa> {
  const irmas = dados.bucket_id
    ? (await listarTarefas(dados.quadro_id)).filter(t => t.bucket_id === dados.bucket_id)
    : [];
  const hojeISO = new Date().toISOString().slice(0, 10);
  const codigo = gerarCodigoTarefa(hojeISO, await codigosDoMesCorrente());

  const { data, error } = await db('dem_tarefas')
    .insert({
      quadro_id: dados.quadro_id,
      bucket_id: dados.bucket_id || null,
      titulo: dados.titulo.trim(),
      descricao: dados.descricao?.trim() || null,
      responsaveis: dados.responsaveis || [],
      data_inicio: dados.data_inicio || null,
      data_vencimento: dados.data_vencimento || null,
      prioridade: dados.prioridade || 'media',
      status: dados.status || 'nao_iniciado',
      ordem: proximaOrdem(irmas),
      codigo,
      criado_por: user.id,
    })
    .select('*')
    .single();
  if (error) erro('falha ao criar tarefa', error);

  const tarefa = normalizarTarefa(data);
  if (tarefa.responsaveis.length > 0) {
    await notificarAtribuicao(tarefa, tarefa.responsaveis, user);
  }
  return tarefa;
}

type PatchTarefa = Partial<Pick<DemTarefa,
  'titulo' | 'descricao' | 'responsaveis' | 'data_inicio' | 'data_vencimento'
  | 'status' | 'prioridade' | 'checklist' | 'bucket_id' | 'ordem'
>>;

export async function atualizarTarefa(
  tarefa: DemTarefa,
  patch: PatchTarefa,
  user: Pick<Profile, 'id' | 'name'>,
): Promise<DemTarefa> {
  const update: Record<string, unknown> = {};
  if (patch.titulo !== undefined) update.titulo = patch.titulo.trim();
  if (patch.descricao !== undefined) update.descricao = patch.descricao?.trim() || null;
  if (patch.responsaveis !== undefined) update.responsaveis = patch.responsaveis;
  if (patch.data_inicio !== undefined) update.data_inicio = patch.data_inicio || null;
  if (patch.data_vencimento !== undefined) update.data_vencimento = patch.data_vencimento || null;
  if (patch.prioridade !== undefined) update.prioridade = patch.prioridade;
  if (patch.checklist !== undefined) update.checklist = patch.checklist;
  if (patch.bucket_id !== undefined) update.bucket_id = patch.bucket_id || null;
  if (patch.ordem !== undefined) update.ordem = patch.ordem;
  if (patch.status !== undefined) {
    update.status = patch.status;
    update.concluida_em = patch.status === 'concluida' ? new Date().toISOString() : null;
  }

  const { data, error } = await db('dem_tarefas').update(update).eq('id', tarefa.id).select('*').single();
  if (error) erro('falha ao atualizar tarefa', error);
  const atualizada = normalizarTarefa(data);

  // Notifica só quem entrou agora na lista de responsáveis.
  if (patch.responsaveis) {
    const novos = patch.responsaveis.filter(id => !tarefa.responsaveis.includes(id));
    if (novos.length > 0) await notificarAtribuicao(atualizada, novos, user);
  }
  if (patch.status && patch.status !== tarefa.status) {
    await registrarAtividadeSistema(tarefa.id, `Status alterado para "${patch.status}".`, user);
  }
  return atualizada;
}

/** Move a tarefa para outro bucket/posição — caminho enxuto usado no arrasto. */
export async function moverTarefa(
  tarefa: DemTarefa,
  bucketId: string | null,
  ordem: number,
  user: Pick<Profile, 'id' | 'name'>,
): Promise<void> {
  const { error } = await db('dem_tarefas')
    .update({ bucket_id: bucketId, ordem })
    .eq('id', tarefa.id);
  if (error) erro('falha ao mover tarefa', error);
  if (tarefa.bucket_id !== bucketId) {
    await registrarAtividadeSistema(tarefa.id, 'Cartão movido de coluna.', user);
  }
}

export async function excluirTarefa(id: string, user: Pick<Profile, 'id'>): Promise<void> {
  const { error } = await db('dem_tarefas').update(marcarExcluido(user.id)).eq('id', id);
  if (error) erro('falha ao excluir tarefa', error);
}

export async function restaurarTarefa(id: string): Promise<void> {
  const { error } = await db('dem_tarefas').update(marcarRestaurado()).eq('id', id);
  if (error) erro('falha ao restaurar tarefa', error);
}

/* ==================================================================== */
/* Atividade / comentários                                             */
/* ==================================================================== */

export async function listarAtividades(tarefaId: string): Promise<DemTarefaAtividade[]> {
  const { data, error } = await db('dem_tarefa_atividades')
    .select('*')
    .eq('tarefa_id', tarefaId)
    .order('created_at', { ascending: false });
  if (error) erro('falha ao listar atividades', error);
  return (data || []) as DemTarefaAtividade[];
}

export async function adicionarComentario(
  tarefaId: string,
  texto: string,
  user: Pick<Profile, 'id' | 'name'>,
): Promise<DemTarefaAtividade> {
  const { data, error } = await db('dem_tarefa_atividades')
    .insert({ tarefa_id: tarefaId, tipo: 'comentario', texto: texto.trim(), criado_por: user.id, criado_por_nome: user.name })
    .select('*')
    .single();
  if (error) erro('falha ao comentar', error);
  return data as DemTarefaAtividade;
}

export async function registrarAtividadeSistema(
  tarefaId: string,
  texto: string,
  user: Pick<Profile, 'id' | 'name'>,
): Promise<void> {
  const { error } = await db('dem_tarefa_atividades')
    .insert({ tarefa_id: tarefaId, tipo: 'sistema', texto, criado_por: user.id, criado_por_nome: user.name });
  if (error) console.error('Demandas: falha ao registrar atividade de sistema', error);
}

/* ==================================================================== */
/* Anexos (bucket privado `dem-anexos`)                                */
/* ==================================================================== */

export async function uploadAnexo(tarefa: DemTarefa, file: File): Promise<DemTarefa> {
  // Passa pela função única do app: valida tipo/tamanho, comprime imagem e
  // deixa PDF intacto (CLAUDE.md §1).
  const prep = await prepareAttachment(file);
  try { URL.revokeObjectURL(prep.previewUrl); } catch { /* noop */ }
  const ext = (prep.name.split('.').pop() || 'bin').toLowerCase();
  const fileId = Math.random().toString(36).slice(2, 10);
  const path = `${tarefa.id}/${fileId}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from(BUCKET_ANEXOS)
    .upload(path, prep.blob, { contentType: prep.mimeType, upsert: false });
  if (upErr) erro('falha no upload do anexo', upErr);

  let preview_url = '';
  try {
    const { data } = await supabase.storage.from(BUCKET_ANEXOS).createSignedUrl(path, 60 * 60 * 24);
    if (data?.signedUrl) preview_url = data.signedUrl;
  } catch { /* segue sem preview */ }

  const anexo: DemAnexo = {
    id: fileId,
    path,
    name: prep.name,
    size: prep.blob.size,
    mime_type: prep.mimeType,
    created_at: new Date().toISOString(),
    preview_url,
  };
  const anexos = [...tarefa.anexos, anexo];
  const { data, error } = await db('dem_tarefas').update({ anexos }).eq('id', tarefa.id).select('*').single();
  if (error) erro('falha ao gravar anexo na tarefa', error);
  return normalizarTarefa(data);
}

export async function removerAnexo(tarefa: DemTarefa, anexo: DemAnexo): Promise<DemTarefa> {
  try { await supabase.storage.from(BUCKET_ANEXOS).remove([anexo.path]); }
  catch (e) { console.warn('Demandas: falha ao apagar arquivo do storage', e); }
  const anexos = tarefa.anexos.filter(a => a.id !== anexo.id);
  const { data, error } = await db('dem_tarefas').update({ anexos }).eq('id', tarefa.id).select('*').single();
  if (error) erro('falha ao remover anexo', error);
  return normalizarTarefa(data);
}

/** Resolve URLs assinadas para os anexos de uma lista de tarefas. */
export async function assinarAnexosDeTarefas(tarefas: DemTarefa[]): Promise<DemTarefa[]> {
  const paths = tarefas.flatMap(t => (t.anexos || []).filter(a => a.path && !a.preview_url).map(a => a.path));
  if (paths.length === 0) return tarefas;

  const mapa: Record<string, string> = {};
  try {
    const { data } = await supabase.storage.from(BUCKET_ANEXOS).createSignedUrls(paths, 60 * 60 * 24);
    (data || []).forEach(item => { if (item.path && item.signedUrl) mapa[item.path] = item.signedUrl; });
  } catch (e) {
    console.warn('Demandas: falha ao assinar anexos', e);
  }
  return tarefas.map(t => ({
    ...t,
    anexos: (t.anexos || []).map(a => (a.preview_url ? a : { ...a, preview_url: mapa[a.path] || '' })),
  }));
}

/* ==================================================================== */
/* Notificações (@usuário)                                             */
/* ==================================================================== */

/**
 * Grava notificações direto em `core_notificacoes` (a política de INSERT é
 * aberta a `authenticated`; cada destinatário só lê as próprias). O clique é
 * roteado por `notificationRouting.ts` a partir do `context_key`.
 */
async function notificarUsuarios(
  destinatarios: string[],
  autorId: string,
  title: string,
  description: string,
  contextKey: string,
): Promise<void> {
  const alvos = Array.from(new Set(destinatarios)).filter(id => id && id !== autorId);
  if (!supabase || alvos.length === 0) return;
  const rows = alvos.map(uid => ({
    id: 'n_' + Math.random().toString(36).slice(2, 11),
    user_id: uid,
    title,
    description,
    type: 'info',
    is_read: false,
    request_id: null,
    context_key: contextKey,
    request_number: null,
    created_at: new Date().toISOString(),
  }));
  const { error } = await supabase.from('core_notificacoes').insert(rows as any);
  if (error) console.error('Demandas: falha ao gravar notificações', error);
}

/** Avisa quem foi posto como responsável de uma tarefa. */
function notificarAtribuicao(
  tarefa: DemTarefa,
  destinatarios: string[],
  autor: Pick<Profile, 'id' | 'name'>,
): Promise<void> {
  return notificarUsuarios(
    destinatarios,
    autor.id,
    'Você foi atribuído a uma tarefa',
    `${autor.name} atribuiu "${tarefa.titulo}" a você.`,
    `demanda:${tarefa.id}`,
  );
}

/** Avisa quem foi adicionado ao compartilhamento de um quadro (@usuário). */
function notificarCompartilhamentoQuadro(
  quadro: DemQuadro,
  destinatarios: string[],
  autor: Pick<Profile, 'id' | 'name'>,
): Promise<void> {
  return notificarUsuarios(
    destinatarios,
    autor.id,
    'Você foi adicionado a um quadro',
    `${autor.name} compartilhou o quadro "${quadro.nome}" com você.`,
    `demanda-quadro:${quadro.id}`,
  );
}
