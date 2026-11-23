/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Log do Cadastro de Itens e atividade dos Jovens Aprendizes.
 *
 * O banco grava toda mudança feita no catálogo em `alm_catalogo_itens_log`
 * (trigger, com autor e antes/depois). A RPC `alm_atividade_jovens` junta esse
 * log às contagens do Inventário Cíclico feitas por quem tem cargo de Jovem
 * Aprendiz — sem quantidade contada nem saldo (a contagem é cega).
 * Migration: 20261123120000_alm_catalogo_itens_log_jovens.sql.
 */

import { supabase } from '../db/supabaseClient';
import { normalizeCode } from './almoxarifado';

export type OrigemAtividade = 'cadastro' | 'contagem';

export type AcaoAtividade =
  | 'cadastro'
  | 'alteracao'
  | 'etiqueta_impressa'
  | 'foto_adicional'
  | 'foto_adicional_removida'
  | 'exclusao'
  | 'contagem';

export interface AtividadeJovem {
  ocorrido_em: string;
  usuario_id: string | null;
  usuario_nome: string | null;
  origem: OrigemAtividade;
  acao: AcaoAtividade | string;
  codigo_sap: string;
  descricao: string | null;
  campos: string[];
  /** Código do inventário (contagens). */
  referencia: string | null;
  detalhe: {
    antes?: Record<string, unknown>;
    depois?: Record<string, unknown>;
    numero?: number;
    deposito?: string;
    endereco?: string;
    duracao_segundos?: number;
    causa?: string;
  } | null;
}

/** Erro de leitura quando a migration ainda não foi aplicada. */
export class LogJovensIndisponivelError extends Error {}

/** Quem tem cargo de Jovem Aprendiz no cadastro de usuários. */
export function ehJovemAprendiz(perfil: { cargo?: string | null } | null | undefined): boolean {
  return /aprendiz/i.test(perfil?.cargo || '');
}

const PAGINA = 1000; // PostgREST corta em 1.000 linhas sem avisar

/**
 * Atividade dos Jovens Aprendizes, mais recente primeiro. `desde`/`ate` são
 * instantes ISO (o `ate` é exclusivo).
 */
export async function listarAtividadeJovens(desde?: string | null, ate?: string | null): Promise<AtividadeJovem[]> {
  if (!supabase) return [];
  const todas: AtividadeJovem[] = [];
  for (let inicio = 0; ; inicio += PAGINA) {
    const { data, error } = await (supabase as any)
      .rpc('alm_atividade_jovens', { p_desde: desde || null, p_ate: ate || null })
      .range(inicio, inicio + PAGINA - 1);
    if (error) {
      const msg = String(error.message || '');
      if (/alm_atividade_jovens|schema cache|does not exist|PGRST202/i.test(msg) || error.code === 'PGRST202') {
        throw new LogJovensIndisponivelError(
          'O log dos Jovens ainda não existe no banco. Aplique a migration 20261123120000_alm_catalogo_itens_log_jovens.sql.',
        );
      }
      throw error;
    }
    const lote = (data || []) as AtividadeJovem[];
    todas.push(...lote.map(l => ({ ...l, campos: l.campos || [] })));
    if (lote.length < PAGINA) break;
  }
  return todas;
}

/** Códigos SAP (normalizados) em que algum jovem mexeu ou contou. */
export function codigosDaAtividade(atividades: AtividadeJovem[], usuarioId?: string | null): Set<string> {
  const codigos = new Set<string>();
  for (const a of atividades) {
    if (usuarioId && a.usuario_id !== usuarioId) continue;
    if (a.acao === 'exclusao') continue;
    codigos.add(normalizeCode(a.codigo_sap));
  }
  return codigos;
}

/** Jovens que aparecem na atividade, por nome. */
export function jovensDaAtividade(atividades: AtividadeJovem[]): { id: string; nome: string }[] {
  const porId = new Map<string, string>();
  for (const a of atividades) {
    if (a.usuario_id && !porId.has(a.usuario_id)) porId.set(a.usuario_id, a.usuario_nome || a.usuario_id);
  }
  return [...porId.entries()]
    .map(([id, nome]) => ({ id, nome }))
    .sort((x, y) => x.nome.localeCompare(y.nome, 'pt-BR'));
}

const ROTULOS_ACAO: Record<string, string> = {
  cadastro: 'Cadastrou o item',
  alteracao: 'Alterou o cadastro',
  etiqueta_impressa: 'Imprimiu etiqueta',
  foto_adicional: 'Adicionou foto',
  foto_adicional_removida: 'Removeu foto',
  exclusao: 'Excluiu do catálogo',
  contagem: 'Contou no inventário',
};

export function rotuloAcao(acao: string): string {
  return ROTULOS_ACAO[acao] || acao;
}

const ROTULOS_CAMPO: Record<string, string> = {
  imagem_path: 'foto principal',
  posicao_estoque: 'localização',
  etiqueta_descricao: 'descrição da etiqueta',
  etiqueta_aplicacao: 'aplicação',
  estoque_minimo: 'estoque mínimo',
  observacao: 'observação',
  lotes_validade: 'lotes/validade',
  lote: 'lote',
  validade: 'validade',
  etiqueta_impressa_em: 'etiqueta impressa',
  foto_adicional: 'foto adicional',
};

/** Resumo de uma linha do que foi feito, para a lista do log. */
export function resumoAtividade(a: AtividadeJovem): string {
  if (a.origem === 'contagem') {
    const partes = [
      a.referencia,
      a.detalhe?.numero ? `${a.detalhe.numero}ª contagem` : null,
      a.detalhe?.deposito ? `dep. ${a.detalhe.deposito}` : null,
      a.detalhe?.endereco ? `end. ${a.detalhe.endereco}` : null,
    ].filter(Boolean);
    return partes.join(' · ');
  }
  const campos = a.campos.filter(c => c !== 'etiqueta_impressa_em' || a.acao !== 'etiqueta_impressa');
  return campos.map(c => ROTULOS_CAMPO[c] || c).join(', ');
}

/** Contagem por ação de cada jovem — o placar do topo do log. */
export function resumoPorJovem(atividades: AtividadeJovem[]): {
  id: string; nome: string; itens: number; alteracoes: number; etiquetas: number; contagens: number;
}[] {
  const mapa = new Map<string, { id: string; nome: string; codigos: Set<string>; alteracoes: number; etiquetas: number; contagens: number }>();
  for (const a of atividades) {
    const id = a.usuario_id || '—';
    let r = mapa.get(id);
    if (!r) {
      r = { id, nome: a.usuario_nome || id, codigos: new Set(), alteracoes: 0, etiquetas: 0, contagens: 0 };
      mapa.set(id, r);
    }
    r.codigos.add(normalizeCode(a.codigo_sap));
    if (a.acao === 'contagem') r.contagens++;
    else if (a.acao === 'etiqueta_impressa') r.etiquetas++;
    else r.alteracoes++;
  }
  return [...mapa.values()]
    .map(({ codigos, ...r }) => ({ ...r, itens: codigos.size }))
    .sort((x, y) => x.nome.localeCompare(y.nome, 'pt-BR'));
}
