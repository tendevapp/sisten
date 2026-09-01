/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Chamadas de rede do formulário "Logística - Expedição" — Supabase direto,
 * no mesmo padrão de `cotacoesApi.ts` (dado write-heavy, por carregamento,
 * lido por poucos usuários; o localDb existe para cache de leitura de dado de
 * referência compartilhado, que não é o caso aqui).
 *
 * Uma decisão estrutural atravessa este módulo: **carregamento e tramo são
 * criados no banco no instante em que o usuário os adiciona**, antes de
 * qualquer campo ser preenchido. O motivo é a foto: ela sobe na hora (é um
 * arquivo, não texto) e sua linha referencia `tramo_id` por chave estrangeira
 * — um tramo que só existisse na memória da tela quebraria esse vínculo. Como
 * efeito colateral bem-vindo, o formulário sobrevive a fechar o navegador no
 * meio do preenchimento, que é exatamente o fluxo pedido (portaria de manhã,
 * pátio ao meio-dia, expedição à tarde).
 */

import { supabase } from '../db/supabaseClient';
import type {
  EtapaExpedicao, ExpedicaoCarregamento, ExpedicaoCarregamentoCompleto,
  ExpedicaoCarregamentoResumo, ExpedicaoFoto, ExpedicaoTramo, Tramo,
} from '../types';
import { apenasVigentes, marcarExcluido, marcarRestaurado, semExcluidos } from './softDelete';

const BUCKET = 'expedicao-fotos';

/** TTL das miniaturas na tela. Curto: a URL é reassinada de graça a cada visita. */
const TTL_MINIATURA_SEGUNDOS = 60 * 60;

/**
 * TTL dos links que vão dentro do e-mail. Longo porque quem recebe abre a
 * mensagem dias depois, e um link vencido transformaria o registro em texto
 * sem prova. O bucket é privado — este é o único caminho de leitura externo.
 */
export const TTL_EMAIL_SEGUNDOS = 60 * 60 * 24 * 90;

// =====================================================================
// Carregamentos
// =====================================================================

function gerarNumero(): string {
  const ano = new Date().getFullYear();
  const sufixo = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `EXP-${ano}-${sufixo}`;
}

export async function listarCarregamentos(incluirExcluidos = false): Promise<ExpedicaoCarregamentoResumo[]> {
  let query = supabase
    .from('expedicao_carregamentos')
    // As relações vão nomeadas pela constraint: `expedicao_fotos` alcança
    // `expedicao_carregamentos` por dois caminhos (direto e via tramo), e sem
    // a dica o PostgREST recusa o embed por ambiguidade.
    .select(`
      *,
      tramos:expedicao_tramos!expedicao_tramos_carregamento_id_fkey (id, tramo, ordem, hora_chegada_portaria, hora_entrada_patio, hora_expedicao, excluido_em),
      fotos:expedicao_fotos!expedicao_fotos_carregamento_id_fkey (id, excluido_em)
    `)
    .order('created_at', { ascending: false })
    .limit(200);

  query = apenasVigentes(query, incluirExcluidos);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return (data || []).map((row: any) => ({
    ...row,
    tramos: semExcluidos(row.tramos, incluirExcluidos).sort((a: any, b: any) => a.ordem - b.ordem),
    total_fotos: semExcluidos(row.fotos, incluirExcluidos).length,
  })) as ExpedicaoCarregamentoResumo[];
}

/**
 * Numera cada carregamento dentro da sua sequencia historica de tramo +
 * transportadora — o "1o T4 - TRANSPES", "2o T4 - TRANSPES" da lista.
 *
 * Vai numa consulta propria, enxuta, porque `listarCarregamentos` para nos 200
 * mais recentes: a posicao de um carregamento depende de todos os que vieram
 * antes dele, inclusive os que a lista nao mostra mais.
 *
 * A ordem e a data do tramo — o dado que a equipe controla — com o instante de
 * criacao como desempate entre dois do mesmo dia.
 */
export async function listarSequenciasTramo(): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from('expedicao_carregamentos')
    .select(`
      id, empresa, created_at,
      tramos:expedicao_tramos!expedicao_tramos_carregamento_id_fkey (tramo, ordem, data, excluido_em)
    `)
    .is('excluido_em', null);

  if (error) throw new Error(error.message);

  const linhas = (data || []).map((row: any) => {
    const tramos = semExcluidos(row.tramos).slice().sort((a: any, b: any) => a.ordem - b.ordem);
    return {
      id: row.id as string,
      // Os carregamentos antigos podem ter mais de um tramo; a chave usa o
      // rotulo inteiro para bater com o que o titulo do card mostra.
      chave: `${tramos.map((t: any) => t.tramo).join(' + ')}|${(row.empresa || '').trim().toUpperCase()}`,
      data: (tramos[0]?.data as string | null) || row.created_at,
      criadoEm: row.created_at as string,
    };
  });

  linhas.sort((a, b) => (a.data === b.data ? a.criadoEm.localeCompare(b.criadoEm) : a.data.localeCompare(b.data)));

  const contador: Record<string, number> = {};
  const sequencias: Record<string, number> = {};
  for (const linha of linhas) {
    contador[linha.chave] = (contador[linha.chave] || 0) + 1;
    sequencias[linha.id] = contador[linha.chave];
  }
  return sequencias;
}

export async function obterCarregamento(id: string, incluirExcluidos = false): Promise<ExpedicaoCarregamentoCompleto | null> {
  const { data, error } = await supabase
    .from('expedicao_carregamentos')
    .select('*, tramos:expedicao_tramos!expedicao_tramos_carregamento_id_fkey (*), fotos:expedicao_fotos!expedicao_fotos_carregamento_id_fkey (*)')
    .eq('id', id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  const row = data as any;
  return {
    ...row,
    tramos: semExcluidos(row.tramos, incluirExcluidos).sort((a: ExpedicaoTramo, b: ExpedicaoTramo) => a.ordem - b.ordem),
    fotos: semExcluidos(row.fotos, incluirExcluidos),
  } as ExpedicaoCarregamentoCompleto;
}

export async function criarCarregamento(params: {
  usuarioId: string;
  usuarioNome: string;
}): Promise<ExpedicaoCarregamento> {
  const { data, error } = await supabase
    .from('expedicao_carregamentos')
    .insert({
      numero: gerarNumero(),
      empresa: '',
      criado_por: params.usuarioId,
      criado_por_nome: params.usuarioNome,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as ExpedicaoCarregamento;
}

/** Salva o cabeçalho. Os tramos têm sua própria chamada — ver `salvarTramo`. */
export async function salvarCarregamento(
  id: string,
  patch: Partial<Pick<ExpedicaoCarregamento, 'empresa' | 'observacoes' | 'status' | 'enviado_em'>>,
): Promise<void> {
  const { error } = await supabase
    .from('expedicao_carregamentos')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

/**
 * Exclusão lógica do carregamento: grava `excluido_em` e o registro some das
 * listagens. Tramos e fotos filhos continuam no banco (e os arquivos no bucket
 * são preservados) — o conjunto volta inteiro num `restaurarCarregamento`.
 */
export async function excluirCarregamento(id: string, excluidoPor?: string): Promise<void> {
  const { error } = await supabase
    .from('expedicao_carregamentos')
    .update(marcarExcluido(excluidoPor))
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function restaurarCarregamento(id: string): Promise<void> {
  const { error } = await supabase
    .from('expedicao_carregamentos')
    .update(marcarRestaurado())
    .eq('id', id);
  if (error) throw new Error(error.message);
}

// =====================================================================
// Tramos
// =====================================================================

export async function criarTramo(params: {
  carregamentoId: string;
  tramo: Tramo;
  ordem: number;
}): Promise<ExpedicaoTramo> {
  const { data, error } = await supabase
    .from('expedicao_tramos')
    .insert({
      carregamento_id: params.carregamentoId,
      tramo: params.tramo,
      ordem: params.ordem,
      data: new Date().toISOString().slice(0, 10),
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as ExpedicaoTramo;
}

type TramoEditavel = Pick<ExpedicaoTramo,
  'tramo' | 'numero_tramo' | 'numero_nf' | 'motorista' | 'cavalo_placa' | 'cavalo_uf' | 'carreta_placa' | 'carreta_uf'
  | 'dolly_placa' | 'dolly_uf' | 'data' | 'ordem'
  | 'data_chegada_portaria' | 'data_entrada_patio' | 'data_expedicao'
  | 'hora_chegada_portaria' | 'hora_entrada_patio' | 'hora_expedicao'
  | 'obs_chegada_portaria' | 'obs_entrada_patio' | 'obs_expedicao'>;

export async function salvarTramo(id: string, patch: Partial<TramoEditavel>): Promise<void> {
  const { error } = await supabase
    .from('expedicao_tramos')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function excluirTramo(id: string, excluidoPor?: string): Promise<void> {
  const { error } = await supabase
    .from('expedicao_tramos')
    .update(marcarExcluido(excluidoPor))
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function restaurarTramo(id: string): Promise<void> {
  const { error } = await supabase
    .from('expedicao_tramos')
    .update(marcarRestaurado())
    .eq('id', id);
  if (error) throw new Error(error.message);
}

// =====================================================================
// Fotos
// =====================================================================

/**
 * Reduz a foto antes de subir. Uma câmera de celular entrega 3–8 MB por
 * imagem, e o formulário é preenchido no pátio, com a rede que houver — sem
 * isso, anexar três fotos de um tramo vira minutos de espera. 1600px no maior
 * lado preserva a leitura de placa e de painel de relógio, que é o que estas
 * fotos precisam provar.
 */
async function comprimirImagem(file: File): Promise<Blob> {
  const LADO_MAXIMO = 1600;

  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;

  const escala = Math.min(1, LADO_MAXIMO / Math.max(bitmap.width, bitmap.height));
  const largura = Math.round(bitmap.width * escala);
  const altura = Math.round(bitmap.height * escala);

  const canvas = document.createElement('canvas');
  canvas.width = largura;
  canvas.height = altura;
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, largura, altura);
  bitmap.close();

  const blob = await new Promise<Blob | null>(resolve => {
    canvas.toBlob(resolve, 'image/jpeg', 0.82);
  });

  // Se a compressão não rendeu (imagem já pequena, formato exótico), sobe o
  // original em vez de arriscar entregar um arquivo pior que o de origem.
  return blob && blob.size < file.size ? blob : file;
}

export async function enviarFoto(params: {
  file: File;
  carregamentoId: string;
  tramoId: string;
  etapa: EtapaExpedicao;
  usuarioId: string;
}): Promise<ExpedicaoFoto> {
  const blob = await comprimirImagem(params.file);
  const ehJpeg = blob !== params.file;
  const extensao = ehJpeg ? 'jpg' : (params.file.name.split('.').pop() || 'jpg').toLowerCase();
  const path = `${params.carregamentoId}/${params.tramoId}/${params.etapa}-${Date.now()}.${extensao}`;

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: ehJpeg ? 'image/jpeg' : params.file.type, upsert: false });
  if (upErr) throw new Error(upErr.message);

  const { data, error } = await supabase
    .from('expedicao_fotos')
    .insert({
      carregamento_id: params.carregamentoId,
      tramo_id: params.tramoId,
      etapa: params.etapa,
      storage_path: path,
      nome_arquivo: params.file.name,
      criado_por: params.usuarioId,
    })
    .select()
    .single();

  if (error) {
    // Sem a linha, o arquivo viraria lixo invisível no bucket.
    await supabase.storage.from(BUCKET).remove([path]);
    throw new Error(error.message);
  }
  return data as ExpedicaoFoto;
}

export async function excluirFoto(foto: ExpedicaoFoto, excluidoPor?: string): Promise<void> {
  // Exclusão lógica: o arquivo permanece no bucket para permitir restauração.
  const { error } = await supabase
    .from('expedicao_fotos')
    .update(marcarExcluido(excluidoPor))
    .eq('id', foto.id);
  if (error) throw new Error(error.message);
}

export async function restaurarFoto(id: string): Promise<void> {
  const { error } = await supabase
    .from('expedicao_fotos')
    .update(marcarRestaurado())
    .eq('id', id);
  if (error) throw new Error(error.message);
}

const cacheUrls = new Map<string, { url: string; expiraEm: number }>();

/** URL assinada da foto, cacheada em memória por metade do TTL (mesma tática de `localDb.getAttachmentUrl`). */
export async function urlFoto(path: string, ttlSegundos = TTL_MINIATURA_SEGUNDOS): Promise<string | null> {
  const chave = `${path}:${ttlSegundos}`;
  const cached = cacheUrls.get(chave);
  if (cached && cached.expiraEm > Date.now()) return cached.url;

  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, ttlSegundos);
  if (error || !data?.signedUrl) {
    console.error('Falha ao gerar URL da foto de expedição.', error);
    return null;
  }

  cacheUrls.set(chave, { url: data.signedUrl, expiraEm: Date.now() + (ttlSegundos / 2) * 1000 });
  return data.signedUrl;
}
