/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Inventário Cíclico × "Baixa pendente" (a tag do Cadastro de Itens).
 *
 * O material com retirada do balcão (normal ou extraordinária) ainda sem doc.
 * SAP pode ser contado, mas a ZL0024 não abateu a saída: a contagem diverge
 * sem ser falta. Por isso o item cuja ÚLTIMA contagem foi feita com baixa
 * pendente sai da acuracidade e fica numa lista à parte, para validar depois
 * que as baixas forem regularizadas.
 *
 * O retrato vem gravado na contagem (`alm_inventario_contagens.baixa_pendente`,
 * gatilho da migration 20261124140000), por material — igual à tag. Recontar
 * depois de regularizar grava retrato vazio e o item volta para a acuracidade.
 */

import { normalizeCode } from './almoxarifado';
import type { BaixaPendenteMaterial, MovimentoSemBaixa } from './baixasPendentesCatalogo';

/** Movimento como fica gravado na contagem (sem o material, que é o do item). */
export type MovimentoRetrato = Omit<MovimentoSemBaixa, 'material'>;

interface ComContagens {
  contagens: { numero: number; baixa_pendente?: MovimentoRetrato[] | null }[];
}

/** Retrato da última contagem do item; `null` = contado sem baixa pendente (ou nunca contado). */
export function baixaPendenteDoItem(item: ComContagens): MovimentoRetrato[] | null {
  let ultima: ComContagens['contagens'][number] | null = null;
  for (const c of item.contagens) if (!ultima || c.numero > ultima.numero) ultima = c;
  const r = ultima?.baixa_pendente;
  return Array.isArray(r) && r.length > 0 ? r : null;
}

const dep = (d: string | null | undefined) => (d ? String(d).trim().padStart(4, '0') : '');

/**
 * Quanto do material saiu (fisicamente) do depósito contado sem o SAP saber:
 * saída e transferência a partir dele somam; transferência para ele subtrai
 * (chegou e o SAP ainda não sabe). Extraordinária sem depósito conta como
 * saída do depósito contado.
 */
export function pendenteNoDeposito(movimentos: MovimentoRetrato[], deposito: string): number {
  const alvo = dep(deposito);
  let liquido = 0;
  for (const m of movimentos) {
    const q = Number(m.quantidade) || 0;
    const origem = dep(m.deposito);
    if (!origem || origem === alvo) liquido += q;
    if (m.tipo_movimento === 'transferencia' && dep(m.deposito_destino) === alvo) liquido -= q;
  }
  return Math.round(liquido * 1000) / 1000;
}

export type SituacaoRegularizacao = 'pendente' | 'parcial' | 'regularizada' | 'desconhecida';

export const ROTULO_SITUACAO_REGULARIZACAO: Record<SituacaoRegularizacao, string> = {
  pendente: 'Ainda sem baixa',
  parcial: 'Baixa parcial',
  regularizada: 'Regularizada — validar',
  desconhecida: '—',
};

/**
 * Compara os documentos do retrato com o que está sem baixa AGORA.
 * `agora` nulo = não deu para ler (sem rede): situação desconhecida.
 */
export function situacaoRegularizacao(
  material: string,
  movimentos: MovimentoRetrato[],
  agora: Map<string, BaixaPendenteMaterial> | null,
): SituacaoRegularizacao {
  if (!agora) return 'desconhecida';
  const ainda = new Set((agora.get(normalizeCode(material))?.movimentos ?? []).map((m) => m.codigo));
  const codigos = [...new Set(movimentos.map((m) => m.codigo))];
  const pendentes = codigos.filter((c) => ainda.has(c)).length;
  if (pendentes === 0) return 'regularizada';
  return pendentes === codigos.length ? 'pendente' : 'parcial';
}

/** "RQB-161126-66, RSS-201126-03" */
export function codigosDoRetrato(movimentos: MovimentoRetrato[]): string {
  return [...new Set(movimentos.map((m) => m.codigo))].join(', ');
}
