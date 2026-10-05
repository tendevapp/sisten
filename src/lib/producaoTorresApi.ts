/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Módulo de Produção — Apontamentos de Torres Eólicas
 * Acesso ao Supabase (Tramos, Apontamentos Operacionais e Upload com Compressão).
 */

import { supabase } from '../db/supabaseClient';
import { gerarCodigoFormulario, proximoIndiceCodigo } from './codigosFormulario';
import { comprimirImagemUpload, prepareAttachment, type PreparedAttachment } from './imageCompression';
import {
  calcularProgressoTramo,
  determinarProximoEstagio,
  normalizarCodigoTramo,
  validarFormatoTramo,
  type EstagioTramo,
  type FabricaNave1Id,
  type NaveProducaoId,
} from './producaoTorres';

const db = (tabela: string) => (supabase.from as any)(tabela);
const BUCKET = 'prod-evidencias';

export interface FotoApontamento {
  path: string;
  nome: string;
  url?: string;
}

export interface TramoProducaoDb {
  id: string;
  codigo_tramo: string;
  virola_origem: string | null;
  op_origem: string | null;
  estagio_atual: EstagioTramo;
  percentual_conclusao: number;
  liberado_nave2_em: string | null;
  liberado_white_em: string | null;
  liberado_almoxarifado_em: string | null;
  criado_por: string | null;
  criado_por_nome: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApontamentoOperacaoDb {
  id: string;
  codigo: string;
  nave: NaveProducaoId;
  fabrica: FabricaNave1Id | null;
  processo_id: string;
  processo_nome: string;
  virola_numero: string | null;
  op_numero: string | null;
  tramo_codigo: string | null;
  tramo_id: string | null;
  realizado: boolean;
  data_apontamento: string;
  observacao: string | null;
  fotos: FotoApontamento[];
  criado_por: string | null;
  criado_por_nome: string | null;
  created_at: string;
}

export interface SalvarApontamentoPayload {
  nave: NaveProducaoId;
  fabrica?: FabricaNave1Id;
  processoId: string;
  processoNome: string;
  virolaNumero?: string;
  opNumero?: string;
  tramoCodigo?: string;
  observacao?: string;
  realizado?: boolean;
  usuarioId?: string;
  usuarioNome?: string;
}

/**
 * Faz upload de imagens comprimidas para o bucket `prod-evidencias`.
 * Cumpre a Regra 1 do AGENTS.md (compressão a 1600px, JPEG 0.82 antes do envio).
 */
export async function subirFotosApontamento(
  arquivos: (File | PreparedAttachment)[],
  pastaPrefixo: string = 'apontamentos',
): Promise<FotoApontamento[]> {
  if (!arquivos || arquivos.length === 0) return [];

  const resultados: FotoApontamento[] = [];

  for (let i = 0; i < arquivos.length; i++) {
    const item = arquivos[i];
    let preparado: PreparedAttachment;

    if (item instanceof File) {
      preparado = await prepareAttachment(item);
    } else if (item && 'blob' in item) {
      preparado = item;
    } else {
      continue;
    }

    const extensao = preparado.name.split('.').pop() || 'jpg';
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 7);
    const path = `${pastaPrefixo}/${timestamp}_${random}_${i + 1}.${extensao}`;

    const { error } = await supabase.storage.from(BUCKET).upload(path, preparado.blob, {
      contentType: preparado.mimeType || 'image/jpeg',
      upsert: false,
    });

    if (error) {
      console.warn('Falha no upload de foto da produção:', error.message);
      continue;
    }

    // Gerar URL assinada válida por 24h
    const { data: signedData } = await supabase.storage.from(BUCKET).createSignedUrl(path, 86400);

    resultados.push({
      path,
      nome: preparado.name,
      url: signedData?.signedUrl,
    });
  }

  return resultados;
}

/**
 * Lista todos os tramos da produção com seus percentuais e estágios.
 */
export async function listarTramosProducao(filtros?: {
  estagio?: EstagioTramo;
  busca?: string;
}): Promise<TramoProducaoDb[]> {
  let query = db('prod_apt_tramos')
    .select('*')
    .order('updated_at', { ascending: false });

  if (filtros?.estagio) {
    query = query.eq('estagio_atual', filtros.estagio);
  }

  if (filtros?.busca?.trim()) {
    const termo = normalizarCodigoTramo(filtros.busca);
    query = query.ilike('codigo_tramo', `%${termo}%`);
  }

  const { data, error } = await query;
  if (error) {
    console.warn('Tabela prod_apt_tramos não encontrada ou erro na consulta:', error.message);
    return [];
  }
  return (data || []) as TramoProducaoDb[];
}

/**
 * Busca um tramo específico pelo código (ex: TX-XXXX) junto com seu histórico de apontamentos.
 */
export async function buscarTramoComApontamentos(codigoTramo: string): Promise<{
  tramo: TramoProducaoDb | null;
  apontamentos: ApontamentoOperacaoDb[];
}> {
  const codigo = normalizarCodigoTramo(codigoTramo);
  if (!codigo) return { tramo: null, apontamentos: [] };

  const { data: tramoData } = await db('prod_apt_tramos')
    .select('*')
    .eq('codigo_tramo', codigo)
    .maybeSingle();

  const { data: aptsData } = await db('prod_apt_operacoes')
    .select('*')
    .eq('tramo_codigo', codigo)
    .order('data_apontamento', { ascending: true });

  const apontamentos = (aptsData || []) as ApontamentoOperacaoDb[];

  // Re-assinar URLs de fotos que possam ter expirado
  for (const apt of apontamentos) {
    if (apt.fotos && apt.fotos.length > 0) {
      for (const foto of apt.fotos) {
        if (!foto.url && foto.path) {
          const { data } = await supabase.storage.from(BUCKET).createSignedUrl(foto.path, 86400);
          if (data?.signedUrl) foto.url = data.signedUrl;
        }
      }
    }
  }

  return {
    tramo: (tramoData as TramoProducaoDb) || null,
    apontamentos,
  };
}

/**
 * Lista os apontamentos operacionais mais recentes para visualização no feed da fábrica.
 */
export async function listarApontamentosRecentes(nave?: NaveProducaoId, limite: number = 50): Promise<ApontamentoOperacaoDb[]> {
  let query = db('prod_apt_operacoes')
    .select('*')
    .order('data_apontamento', { ascending: false })
    .limit(limite);

  if (nave) {
    query = query.eq('nave', nave);
  }

  const { data, error } = await query;
  if (error) {
    console.warn('Erro ao listar apontamentos recentes:', error.message);
    return [];
  }

  const apontamentos = (data || []) as ApontamentoOperacaoDb[];

  // Enriquecer com signed URLs
  for (const apt of apontamentos) {
    if (apt.fotos && apt.fotos.length > 0) {
      for (const f of apt.fotos) {
        if (!f.url && f.path) {
          const { data: s } = await supabase.storage.from(BUCKET).createSignedUrl(f.path, 86400);
          if (s?.signedUrl) f.url = s.signedUrl;
        }
      }
    }
  }

  return apontamentos;
}

/**
 * Registra um novo apontamento de processo e avança a esteira conforme as regras de negócio:
 * - Se for no Marco-Porta e informar código TX-XXXX: cadastra o tramo em `prod_apt_tramos` e libera para Nave 2.
 * - Se for processo de transição na Nave 2: libera para Nave White.
 * - Se for Montagem Final na Nave White: libera para Pátio / Almoxarifado.
 * - Recalcula o percentual acumulado do tramo.
 */
export async function salvarApontamentoOperacao(
  payload: SalvarApontamentoPayload,
  fotosArquivos: (File | PreparedAttachment)[] = [],
): Promise<{ ok: boolean; codigo: string; tramoId?: string }> {
  // 1. Normalizar e validar código do tramo se informado ou obrigatório
  const tramoNormalizado: string | null = payload.tramoCodigo ? normalizarCodigoTramo(payload.tramoCodigo) : null;

  // Validação: no Marco-Porta da 3ª fábrica da Nave 1, o código TX-XXXX é obrigatório
  if (payload.processoId === 'marco_porta') {
    if (!tramoNormalizado || !validarFormatoTramo(tramoNormalizado)) {
      throw new Error('A numeração do Tramo (formato TX-XXXX, ex: T1-3143) é obrigatória para liberar o Marco-Porta.');
    }
  }

  const agoraISO = new Date().toISOString();
  const hoje = agoraISO.slice(0, 10);

  // 2. Gerar o código sequencial único padrão MODULO-DDMMYY-INDICE (APT-DDMMYY-NN)
  const { data: ultimosCodigos } = await db('prod_apt_operacoes')
    .select('codigo')
    .gte('data_apontamento', `${hoje}T00:00:00.000Z`)
    .limit(500);

  const listaCodigos = (ultimosCodigos || []).map((c: { codigo: string }) => c.codigo);
  const proximoIndice = proximoIndiceCodigo('APT', listaCodigos);
  const codigoOperacao = gerarCodigoFormulario('APT', hoje, proximoIndice);

  // 3. Upload de fotos comprimidas
  const fotosGravadas = await subirFotosApontamento(fotosArquivos, `apontamentos/${payload.nave}`);

  let tramoId: string | null = null;

  // Se houver código de tramo, garantir registro na tabela `prod_apt_tramos`
  if (tramoNormalizado) {
    const { data: tramoExistente } = await db('prod_apt_tramos')
      .select('id, estagio_atual, percentual_conclusao')
      .eq('codigo_tramo', tramoNormalizado)
      .maybeSingle();

    if (tramoExistente) {
      tramoId = tramoExistente.id;
    } else {
      // Criar tramo
      const novoEstagio: EstagioTramo = 'nave2'; // Criado na Nave 1 e liberado para Nave 2
      const { data: novoTramo, error: errCriarTramo } = await db('prod_apt_tramos')
        .insert({
          codigo_tramo: tramoNormalizado,
          virola_origem: payload.virolaNumero || null,
          op_origem: payload.opNumero || null,
          estagio_atual: novoEstagio,
          percentual_conclusao: 0,
          liberado_nave2_em: agoraISO,
          criado_por: payload.usuarioId || null,
          criado_por_nome: payload.usuarioNome || null,
        })
        .select('id')
        .single();

      if (!errCriarTramo && novoTramo) {
        tramoId = novoTramo.id;
      }
    }
  }

  // 4. Salvar o registro da operação em `prod_apt_operacoes`
  const { error: errApt } = await db('prod_apt_operacoes').insert({
    codigo: codigoOperacao,
    nave: payload.nave,
    fabrica: payload.fabrica || null,
    processo_id: payload.processoId,
    processo_nome: payload.processoNome,
    virola_numero: payload.virolaNumero || null,
    op_numero: payload.opNumero || null,
    tramo_codigo: tramoNormalizado,
    tramo_id: tramoId,
    realizado: payload.realizado ?? true,
    data_apontamento: agoraISO,
    observacao: payload.observacao?.trim() || null,
    fotos: fotosGravadas,
    criado_por: payload.usuarioId || null,
    criado_por_nome: payload.usuarioNome || null,
  });

  if (errApt) {
    throw new Error(`Falha ao registrar apontamento: ${errApt.message}`);
  }

  // 5. Se houver tramo associado, recalcular seu percentual e verificar transições de estágio
  if (tramoNormalizado) {
    // Buscar todos os processos já apontados para este tramo
    const { data: todosApts } = await db('prod_apt_operacoes')
      .select('processo_id')
      .eq('tramo_codigo', tramoNormalizado)
      .eq('realizado', true);

    const listaProcessos: string[] = (todosApts || [])
      .map((a: { processo_id?: string | null }) => String(a?.processo_id || ''))
      .filter(Boolean);
    const idsConcluidos: string[] = Array.from(new Set<string>(listaProcessos));
    const progresso = calcularProgressoTramo(idsConcluidos);

    const updatesTramo: Record<string, unknown> = {
      percentual_conclusao: progresso.percentual,
      updated_at: agoraISO,
    };

    // Verificar se este processo aciona transição de estágio
    const proximoEstagio = determinarProximoEstagio(payload.processoId);
    if (proximoEstagio) {
      updatesTramo.estagio_atual = proximoEstagio;
      if (proximoEstagio === 'white') updatesTramo.liberado_white_em = agoraISO;
      if (proximoEstagio === 'expedicao_almoxarifado') updatesTramo.liberado_almoxarifado_em = agoraISO;
    }

    await db('prod_apt_tramos')
      .update(updatesTramo)
      .eq('codigo_tramo', tramoNormalizado);
  }

  return {
    ok: true,
    codigo: codigoOperacao,
    tramoId: tramoId || undefined,
  };
}
