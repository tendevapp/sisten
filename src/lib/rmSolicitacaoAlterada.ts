/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Solicitação de compra que mudou depois de virar RM no SAP.
 *
 * Três casos, todos lidos da marca de exportação
 * (`almox_rm_exportacao_solicitacoes`):
 * - editada: `reaberto_motivo` (reabertura automática de `saveRequestEdit`);
 *   o ajuste é o grupo "Editar no SAP" de Abrir RM;
 * - cancelada / excluída: `solicitacao_situacao`, carimbado pelo gatilho
 *   `trg_core_solicitacoes_rm_encerrada`; a RM tem de ser eliminada no SAP,
 *   grupo "Eliminar no SAP".
 *
 * Abrir RM usa a lista de pendências; a Central de Compras usa a situação
 * para marcar a tag "SISTEN #número" da RM.
 */

import type { AlmoxRmExportacao, AlmoxRmExportacaoSolicitacao, Request } from '../types';
import { formatDateTimeBR } from './format';

type Marca = AlmoxRmExportacaoSolicitacao;

/** `request_id` → marcas da solicitação, da mais recente para a mais antiga. */
export function agruparMarcasPorRequest(marcas: Marca[]): Map<string, Marca[]> {
  const ordenadas = [...marcas].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const mapa = new Map<string, Marca[]>();
  for (const m of ordenadas) {
    const lista = mapa.get(m.request_id);
    if (lista) lista.push(m);
    else mapa.set(m.request_id, [m]);
  }
  return mapa;
}

/**
 * Canceladas/excluídas cuja RM ainda não foi eliminada no SAP — só a última
 * exportação de cada solicitação conta (é nela que o gatilho carimba).
 * Mais recentes primeiro.
 */
export function pendentesEliminarNoSap(marcas: Marca[]): Marca[] {
  const saida: Marca[] = [];
  for (const lista of agruparMarcasPorRequest(marcas).values()) {
    const ultima = lista[0];
    if (ultima.solicitacao_situacao && !ultima.sap_baixa_em) saida.push(ultima);
  }
  return saida.sort((a, b) =>
    (b.solicitacao_situacao_em || b.created_at).localeCompare(a.solicitacao_situacao_em || a.created_at));
}

export interface ItemPlanilhaRm {
  item: string;
  material: string;
  quantidade: string;
}

/**
 * Itens da solicitação como saíram na planilha do lote — a solicitação
 * excluída não tem mais itens no banco, e é isso que se procura no SAP.
 */
export function itensDaPlanilhaRm(lote: Pick<AlmoxRmExportacao, 'linhas'> | undefined, requestNumber: string): ItemPlanilhaRm[] {
  const alvo = `#${String(requestNumber).replace(/^#/, '').trim()}`;
  return (lote?.linhas || [])
    .filter(l => String(l['ID Req'] ?? '').trim() === alvo)
    .map(l => ({
      item: String(l['Item'] ?? ''),
      material: String(l['Material (MATNR)'] ?? ''),
      quantidade: String(l['Quantidade (MENGE)'] ?? ''),
    }));
}

export type TipoAlteracaoRm = 'cancelada' | 'editada';

export interface SituacaoSolicitacaoRm {
  tipo: TipoAlteracaoRm;
  /** Ainda falta mexer no SAP (eliminar a RM ou ajustá-la). */
  pendenteSap: boolean;
  /** Texto para o title/aria da tag. */
  detalhe: string;
}

/**
 * O que a tag da RM na Central diz sobre a solicitação de origem.
 * Cancelada vence editada. `null` quando nada mudou depois da exportação.
 */
export function situacaoSolicitacaoRm(
  request: Pick<Request, 'status'>,
  marcasDaSolicitacao: Marca[] | undefined,
): SituacaoSolicitacaoRm | null {
  const marcas = marcasDaSolicitacao || [];
  const ultima = marcas[0];

  if (request.status === 'cancelada') {
    const quem = ultima?.solicitacao_situacao_por_nome;
    const quando = ultima?.solicitacao_situacao_em;
    const base = `Solicitação cancelada${quem ? ` por ${quem}` : ''}${quando ? ` em ${formatDateTimeBR(quando)}` : ''}.`;
    if (ultima?.sap_baixa_em) {
      return {
        tipo: 'cancelada',
        pendenteSap: false,
        detalhe: `${base} RM eliminada no SAP por ${ultima.sap_baixa_por_nome || 'usuário não identificado'} em ${formatDateTimeBR(ultima.sap_baixa_em)}.`,
      };
    }
    return { tipo: 'cancelada', pendenteSap: true, detalhe: `${base} A RM precisa ser eliminada no SAP (Abrir RM).` };
  }

  const editada = marcas.find(m => m.reaberto_em && m.reaberto_motivo);
  if (!editada) return null;
  const base = `Solicitação editada por ${editada.reaberto_por_nome || 'usuário não identificado'}`
    + `${editada.reaberto_em ? ` em ${formatDateTimeBR(editada.reaberto_em)}` : ''}: ${editada.reaberto_motivo}.`;
  // Pendente enquanto a edição é a última exportação e ninguém deu o desfecho.
  const pendenteSap = editada === ultima && !editada.concluido_em && !editada.liberado_exportar_em;
  const desfecho = editada.concluido_em
    ? ` RM ajustada no SAP por ${editada.concluido_por_nome || 'usuário não identificado'} em ${formatDateTimeBR(editada.concluido_em)}.`
    : editada !== ultima
      ? ' Reexportada depois da edição.'
      : editada.liberado_exportar_em
        ? ' Voltou para a fila de exportação.'
        : ' Ajuste da RM no SAP pendente (Abrir RM › Editar no SAP).';
  return { tipo: 'editada', pendenteSap, detalhe: base + desfecho };
}

function chaveRm(rm: string | null | undefined): string {
  const s = (rm || '').trim();
  return s.replace(/^0+/, '') || s;
}

/**
 * RM → marca da solicitação excluída. A excluída sai do cache local e a
 * Central perde o vínculo item a item; resta casar pela RM gravada no carimbo.
 */
export function indexarExcluidasPorRm(marcas: Marca[]): Map<string, Marca> {
  const mapa = new Map<string, Marca>();
  for (const lista of agruparMarcasPorRequest(marcas).values()) {
    const ultima = lista[0];
    if (ultima.solicitacao_situacao !== 'excluida' || !ultima.rm_numero) continue;
    const chave = chaveRm(ultima.rm_numero);
    if (!mapa.has(chave)) mapa.set(chave, ultima);
  }
  return mapa;
}

export function buscarExcluidaPorRm(mapa: Map<string, Marca>, rm: string | null | undefined): Marca | null {
  return mapa.get(chaveRm(rm)) || null;
}

/** Texto da tag para a solicitação excluída. */
export function detalheExcluida(m: Marca): string {
  const base = `Solicitação #${m.request_number} excluída${m.solicitacao_situacao_por_nome ? ` por ${m.solicitacao_situacao_por_nome}` : ''}`
    + `${m.solicitacao_situacao_em ? ` em ${formatDateTimeBR(m.solicitacao_situacao_em)}` : ''}.`;
  return m.sap_baixa_em
    ? `${base} RM eliminada no SAP por ${m.sap_baixa_por_nome || 'usuário não identificado'} em ${formatDateTimeBR(m.sap_baixa_em)}.`
    : `${base} A RM precisa ser eliminada no SAP (Abrir RM).`;
}
