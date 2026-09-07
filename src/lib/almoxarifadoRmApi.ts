/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Almoxarifado > Abrir RM — log das exportações no Supabase.
 *
 * Duas tabelas (ver a migration `create_almox_rm_exportacoes`):
 * `almox_rm_exportacoes` guarda o lote (arquivo, quem, quando) e
 * `almox_rm_exportacao_solicitacoes` guarda quais solicitações saíram nele —
 * é esta segunda que responde ao filtro "já exportada?" da tela.
 */

import { supabase } from '../db/supabaseClient';
import type { AlmoxRmExportacao, AlmoxRmExportacaoSolicitacao } from '../types';

/** As duas tabelas ainda não estão em `database.types.ts` — mesmo atalho de `facilitiesApi`. */
const dbExportacoes = () => (supabase.from as any)('almox_rm_exportacoes');
const dbExportacaoSolicitacoes = () => (supabase.from as any)('almox_rm_exportacao_solicitacoes');

export interface SolicitacaoExportadaInput {
  request_id: string;
  request_number: string;
  total_itens: number;
}

/**
 * Grava um lote exportado: uma linha do lote e uma por solicitação.
 *
 * Se as filhas falharem, o lote é apagado antes de propagar o erro — meio log
 * gravado é pior que nenhum, porque a tela passaria a mostrar "exportada"
 * para solicitações que não constam de exportação alguma.
 */
export async function registrarExportacaoRm(dados: {
  arquivo: string;
  exportado_por_id?: string | null;
  exportado_por_nome: string;
  observacao?: string | null;
  solicitacoes: SolicitacaoExportadaInput[];
}): Promise<AlmoxRmExportacao> {
  const totalItens = dados.solicitacoes.reduce((acc, s) => acc + s.total_itens, 0);

  const { data, error } = await dbExportacoes()
    .insert({
      arquivo: dados.arquivo,
      exportado_por_id: dados.exportado_por_id || null,
      exportado_por_nome: dados.exportado_por_nome,
      total_solicitacoes: dados.solicitacoes.length,
      total_itens: totalItens,
      observacao: dados.observacao || null,
    })
    .select()
    .single();

  if (error) {
    console.error('Erro ao registrar a exportação de RM:', error);
    throw new Error(error.message);
  }

  const exportacao = data as AlmoxRmExportacao;

  if (dados.solicitacoes.length > 0) {
    const { error: erroFilhas } = await dbExportacaoSolicitacoes().insert(
      dados.solicitacoes.map(s => ({
        exportacao_id: exportacao.id,
        request_id: s.request_id,
        request_number: s.request_number,
        total_itens: s.total_itens,
      })),
    );
    if (erroFilhas) {
      console.error('Erro ao registrar as solicitações da exportação de RM:', erroFilhas);
      await dbExportacoes().delete().eq('id', exportacao.id);
      throw new Error(erroFilhas.message);
    }
  }

  return exportacao;
}

/** Lotes exportados, do mais recente para o mais antigo. */
export async function listarExportacoesRm(limite = 100): Promise<AlmoxRmExportacao[]> {
  const { data, error } = await dbExportacoes()
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limite);

  if (error) {
    console.error('Erro ao listar as exportações de RM:', error);
    throw new Error(error.message);
  }
  return (data || []) as AlmoxRmExportacao[];
}

/** Solicitações que saíram num lote — usado para abrir o detalhe do log. */
export async function listarSolicitacoesDaExportacaoRm(
  exportacaoId: string,
): Promise<AlmoxRmExportacaoSolicitacao[]> {
  const { data, error } = await dbExportacaoSolicitacoes()
    .select('*')
    .eq('exportacao_id', exportacaoId)
    .order('request_number', { ascending: true });

  if (error) {
    console.error('Erro ao listar as solicitações da exportação de RM:', error);
    throw new Error(error.message);
  }
  return (data || []) as AlmoxRmExportacaoSolicitacao[];
}

/** Toda marca de exportação, sem recorte de lote. Alimenta o filtro da tela. */
export async function listarMarcasExportacaoRm(): Promise<AlmoxRmExportacaoSolicitacao[]> {
  const { data, error } = await dbExportacaoSolicitacoes()
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Erro ao carregar as marcas de exportação de RM:', error);
    throw new Error(error.message);
  }
  return (data || []) as AlmoxRmExportacaoSolicitacao[];
}

/**
 * `request_id` → exportação mais recente daquela solicitação, reaberta ou não.
 *
 * A lista vem ordenada da mais nova para a mais antiga e o Map só grava a
 * primeira ocorrência de cada chave, então o que sobra é a última exportação.
 * É o que responde "esta solicitação já saiu alguma vez?" — inclusive depois
 * de reaberta, que é justamente quando a tela precisa dizer por quem e quando.
 */
export function indexarUltimaExportacao(
  marcas: AlmoxRmExportacaoSolicitacao[],
): Map<string, AlmoxRmExportacaoSolicitacao> {
  const mapa = new Map<string, AlmoxRmExportacaoSolicitacao>();
  for (const m of marcas) {
    if (!mapa.has(m.request_id)) mapa.set(m.request_id, m);
  }
  return mapa;
}

/**
 * `request_id` → exportação **vigente**: a mais recente que ninguém reabriu.
 *
 * Esta é a que decide o status da fila e o filtro Exportadas/Não exportadas.
 * Reabrir tira a solicitação daqui sem tirá-la de `indexarUltimaExportacao`,
 * e é essa diferença que produz o estado "de volta à fila, mas já exportada
 * antes".
 */
export function indexarExportacaoVigente(
  marcas: AlmoxRmExportacaoSolicitacao[],
): Map<string, AlmoxRmExportacaoSolicitacao> {
  return indexarUltimaExportacao(marcas.filter(m => !m.reaberto_em));
}

/** Marcas de um lote, agrupadas por `exportacao_id`, para o detalhe do log. */
export function agruparMarcasPorExportacao(
  marcas: AlmoxRmExportacaoSolicitacao[],
): Map<string, AlmoxRmExportacaoSolicitacao[]> {
  const mapa = new Map<string, AlmoxRmExportacaoSolicitacao[]>();
  for (const m of marcas) {
    const lista = mapa.get(m.exportacao_id);
    if (lista) lista.push(m);
    else mapa.set(m.exportacao_id, [m]);
  }
  for (const lista of mapa.values()) {
    lista.sort((a, b) => a.request_number.localeCompare(b.request_number, 'pt-BR'));
  }
  return mapa;
}

interface UsuarioReabertura {
  id?: string | null;
  nome: string;
}

/**
 * Devolve à fila as solicitações de um lote que ainda não tinham sido
 * reabertas. Não apaga nada: carimba quem reabriu, quando e (se informado)
 * por quê.
 *
 * Devolve quantas marcas foram carimbadas — zero significa que o lote inteiro
 * já estava reaberto, o que a tela reporta em vez de fingir sucesso.
 */
export async function reabrirExportacaoRm(
  exportacaoId: string,
  usuario: UsuarioReabertura,
  motivo?: string,
): Promise<number> {
  const { data, error } = await dbExportacaoSolicitacoes()
    .update({
      reaberto_em: new Date().toISOString(),
      reaberto_por_id: usuario.id || null,
      reaberto_por_nome: usuario.nome,
      reaberto_motivo: motivo || null,
    })
    .eq('exportacao_id', exportacaoId)
    .is('reaberto_em', null)
    .select('id');

  if (error) {
    console.error('Erro ao reabrir a exportação de RM:', error);
    throw new Error(error.message);
  }
  return (data || []).length;
}

/** Reabre uma solicitação só, sem mexer no resto do lote. */
export async function reabrirSolicitacaoExportadaRm(
  marcaId: string,
  usuario: UsuarioReabertura,
  motivo?: string,
): Promise<void> {
  const { error } = await dbExportacaoSolicitacoes()
    .update({
      reaberto_em: new Date().toISOString(),
      reaberto_por_id: usuario.id || null,
      reaberto_por_nome: usuario.nome,
      reaberto_motivo: motivo || null,
    })
    .eq('id', marcaId)
    .is('reaberto_em', null);

  if (error) {
    console.error('Erro ao reabrir a solicitação exportada:', error);
    throw new Error(error.message);
  }
}

/**
 * Reabre a exportação vigente de uma solicitação pelo `request_id` — usada
 * quando quem editou a solicitação não é o almoxarife na tela de RM, mas o
 * próprio solicitante em Nova Solicitação (ver `saveRequestEdit`).
 *
 * `request_id` + `reaberto_em is null` é no máximo uma linha: cada reabertura
 * (manual ou automática) cria o carimbo que tira a marca anterior da vigência,
 * e uma reexportação futura grava uma marca nova — nunca duas vigentes ao
 * mesmo tempo para a mesma solicitação.
 *
 * Devolve `true` quando havia uma exportação vigente e ela foi reaberta;
 * `false` quando a solicitação não estava exportada — nesse caso não há nada
 * a fazer, e o chamador não deve tratar isso como erro.
 */
export async function reabrirSolicitacaoPorRequestId(
  requestId: string,
  usuario: UsuarioReabertura,
  motivo?: string,
): Promise<boolean> {
  const { data, error } = await dbExportacaoSolicitacoes()
    .update({
      reaberto_em: new Date().toISOString(),
      reaberto_por_id: usuario.id || null,
      reaberto_por_nome: usuario.nome,
      reaberto_motivo: motivo || null,
    })
    .eq('request_id', requestId)
    .is('reaberto_em', null)
    .select('id');

  if (error) {
    console.error('Erro ao reabrir a exportação de RM da solicitação editada:', error);
    throw new Error(error.message);
  }
  return (data || []).length > 0;
}

/**
 * Fecha o sinalizador "Editar no SAP" de uma ou várias solicitações — quem
 * corrigiu a RM direto no SAP confirma aqui, sem precisar reexportar.
 *
 * Só afeta marcas que estão de fato reabertas e ainda não concluídas
 * (`reaberto_em` preenchido, `concluido_em` vazio); pedir para concluir uma
 * solicitação que não está nesse estado simplesmente não muda nada — não é
 * erro, só não bate mais linha nenhuma.
 *
 * Devolve quantas marcas foram carimbadas, para a tela avisar se algo
 * mudou por fora entre a seleção e o clique (outra pessoa já concluiu, ou
 * reexportou).
 */
export async function concluirAjusteSapRm(
  requestIds: string[],
  usuario: UsuarioReabertura,
): Promise<number> {
  if (requestIds.length === 0) return 0;

  const { data, error } = await dbExportacaoSolicitacoes()
    .update({
      concluido_em: new Date().toISOString(),
      concluido_por_id: usuario.id || null,
      concluido_por_nome: usuario.nome,
    })
    .in('request_id', requestIds)
    .not('reaberto_em', 'is', null)
    .is('concluido_em', null)
    .select('id');

  if (error) {
    console.error('Erro ao concluir o ajuste no SAP:', error);
    throw new Error(error.message);
  }
  return (data || []).length;
}

/**
 * Tira uma ou várias solicitações do grupo "Editar no SAP" pela outra saída
 * possível: a RM nunca chegou a existir no SAP, então não há o que corrigir
 * lá — a solicitação só precisa voltar para a fila normal de exportação.
 *
 * Só afeta marcas reabertas e ainda sem desfecho (nem concluídas, nem já
 * liberadas antes); pedir para liberar algo que não está nesse estado não dá
 * erro, só não muda nada.
 */
export async function liberarParaExportarRm(
  requestIds: string[],
  usuario: UsuarioReabertura,
): Promise<number> {
  if (requestIds.length === 0) return 0;

  const { data, error } = await dbExportacaoSolicitacoes()
    .update({
      liberado_exportar_em: new Date().toISOString(),
      liberado_exportar_por_id: usuario.id || null,
      liberado_exportar_por_nome: usuario.nome,
    })
    .in('request_id', requestIds)
    .not('reaberto_em', 'is', null)
    .is('concluido_em', null)
    .is('liberado_exportar_em', null)
    .select('id');

  if (error) {
    console.error('Erro ao liberar a solicitação para exportar:', error);
    throw new Error(error.message);
  }
  return (data || []).length;
}

/**
 * Busca o grupo de mercadorias no catálogo SAP (`sap_zl0169_162_catalogo`)
 * para uma lista de códigos de material (MATNR).
 *
 * Como o catálogo SAP possui mais de 450 mil linhas e não fica no cache do cliente
 * por razões de performance e volume de dados (egress), esta função busca sob demanda
 * no Supabase apenas os códigos dos itens presentes nas solicitações a serem exportadas.
 */
export async function buscarGruposMercadoriaPorCodigosSap(
  codigosSap: string[],
): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  const unicos = Array.from(
    new Set(codigosSap.map(c => (c || '').trim()).filter(Boolean)),
  );
  if (unicos.length === 0) return mapa;

  const BATCH_SIZE = 500;
  for (let i = 0; i < unicos.length; i += BATCH_SIZE) {
    const lote = unicos.slice(i, i + BATCH_SIZE);
    const { data, error } = await supabase
      .from('sap_zl0169_162_catalogo')
      .select('material_code, grupo_mercadoria_codigo')
      .in('material_code', lote);

    if (error) {
      console.warn('Falha ao buscar grupos de mercadorias no catálogo SAP:', error);
      continue;
    }

    data?.forEach((row: any) => {
      const mat = (row.material_code || '').trim();
      const grupo = (row.grupo_mercadoria_codigo || '').trim();
      if (mat && grupo) {
        mapa.set(mat, grupo);
        const semZero = mat.replace(/^0+/, '');
        const comZero = mat.padStart(8, '0');
        if (semZero) mapa.set(semZero, grupo);
        if (comZero) mapa.set(comZero, grupo);
      }
    });
  }

  return mapa;
}

