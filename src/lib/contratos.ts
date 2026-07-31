/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Agregação de contratos (ME3N).
 *
 * A tabela `me3n_contratos` traz uma linha por item de contrato — vários itens
 * compartilham o mesmo `documento_compras`, com vigência e fornecedor
 * repetidos em cada linha. Para a tela de acompanhamento, o contrato (não o
 * item) é a unidade de análise: aqui as linhas são agrupadas por documento e
 * os valores somados, mantendo os itens originais para o detalhamento.
 */

import { ContratoME3N, ContratoDetalhes, ContratoStatus } from '../types';
import { toDate } from './format';

export type StatusVigencia = 'Vigente' | 'Vencendo em breve' | 'Vencido' | 'Sem vigência informada';

// Janela de antecedência do alerta "Vencendo em breve", decidida com o time de
// Suprimentos: contratos costumam ter renegociação lenta, então 90 dias dá
// tempo de reação sem inflar o alerta com tudo que ainda não é urgente.
export const DIAS_ALERTA_VENCIMENTO = 90;

export interface Contrato {
  documento_compras: string;
  fornecedor: string;
  centro: string;
  requisitante: string;
  criado_por: string;
  moeda: string;
  data_documento: string | null;
  inicio_validade: string | null;
  fim_validade: string | null;
  dias_para_vencer: number | null;
  status_vigencia: StatusVigencia;
  valor_solicitado: number;
  valor_efetivo: number;
  valor_pendente: number;
  valor_liquido_pedido: number;
  itens: ContratoME3N[];
}

function diasParaVencer(fimValidade: string | null, hoje: Date): number | null {
  const fim = toDate(fimValidade);
  if (!fim) return null;
  const msPorDia = 24 * 60 * 60 * 1000;
  const inicioHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  return Math.round((fim.getTime() - inicioHoje.getTime()) / msPorDia);
}

export function calcStatusVigencia(fimValidade: string | null, hoje: Date = new Date()): { status: StatusVigencia; dias: number | null } {
  const dias = diasParaVencer(fimValidade, hoje);
  if (dias === null) return { status: 'Sem vigência informada', dias: null };
  if (dias < 0) return { status: 'Vencido', dias };
  if (dias <= DIAS_ALERTA_VENCIMENTO) return { status: 'Vencendo em breve', dias };
  return { status: 'Vigente', dias };
}

/**
 * Item com código de eliminação "L" (Löschkennzeichen — marcado para exclusão
 * no SAP): o item saiu do contrato e não deve aparecer na tela nem entrar nas
 * somas. Itens sem código, ou com outro código, continuam aparecendo.
 */
function itemEliminado(l: ContratoME3N): boolean {
  return (l.codigo_eliminacao || '').trim().toUpperCase() === 'L';
}

/** Agrupa as linhas de item por `documento_compras` e soma os valores do contrato. */
export function agruparContratos(linhas: ContratoME3N[], hoje: Date = new Date()): Contrato[] {
  const porDocumento = new Map<string, ContratoME3N[]>();
  linhas.filter(l => !itemEliminado(l)).forEach(l => {
    const doc = l.documento_compras;
    if (!doc) return;
    const grupo = porDocumento.get(doc);
    if (grupo) grupo.push(l);
    else porDocumento.set(doc, [l]);
  });

  const contratos: Contrato[] = [];
  porDocumento.forEach((itens, documento_compras) => {
    // Vigência/fornecedor: pega o primeiro valor não vazio entre os itens —
    // eles se repetem por linha, mas nem toda importação garante 100%
    // preenchido em toda linha.
    const primeiroComVigencia = itens.find(i => i.fim_validade) || itens[0];
    const fim_validade = primeiroComVigencia.fim_validade ?? null;
    const inicio_validade = itens.find(i => i.inicio_validade)?.inicio_validade ?? null;
    const { status, dias } = calcStatusVigencia(fim_validade, hoje);

    contratos.push({
      documento_compras,
      fornecedor: itens.find(i => i.fornecedor)?.fornecedor || '—',
      centro: itens.find(i => i.centro)?.centro || '—',
      requisitante: itens.find(i => i.requisitante)?.requisitante || '—',
      criado_por: itens.find(i => i.criado_por)?.criado_por || '—',
      moeda: itens.find(i => i.moeda)?.moeda || '—',
      data_documento: itens.find(i => i.data_documento)?.data_documento ?? null,
      inicio_validade,
      fim_validade,
      dias_para_vencer: dias,
      status_vigencia: status,
      valor_solicitado: itens.reduce((s, i) => s + (i.valor_solicitado || 0), 0),
      valor_efetivo: itens.reduce((s, i) => s + (i.valor_efetivo || 0), 0),
      valor_pendente: itens.reduce((s, i) => s + (i.valor_pendente || 0), 0),
      valor_liquido_pedido: itens.reduce((s, i) => s + (i.valor_liquido_pedido || 0), 0),
      itens,
    });
  });

  return contratos;
}

/**
 * Sugestão de Status quando ninguém ainda editou o contrato: deriva da
 * vigência (Vigente/Vencendo → Ativo, Vencido/Sem informação → Inativo). É só
 * o valor inicial — uma vez que `contratos_detalhes.status` existe, ele manda,
 * inclusive para "Em Processamento", que a vigência sozinha não produz.
 */
export function statusSugerido(statusVigencia: StatusVigencia): ContratoStatus {
  return statusVigencia === 'Vigente' || statusVigencia === 'Vencendo em breve' ? 'Ativo' : 'Inativo';
}

export interface ContratoComDetalhes extends Contrato {
  detalhes: ContratoDetalhes | undefined;
  status_exibido: ContratoStatus;
}

/** Combina os contratos (ME3N) com os campos complementares editáveis, por `documento_compras`. */
export function mesclarDetalhes(contratos: Contrato[], detalhesList: ContratoDetalhes[]): ContratoComDetalhes[] {
  const porDocumento = new Map(detalhesList.map(d => [d.documento_compras, d]));
  return contratos.map(c => {
    const detalhes = porDocumento.get(c.documento_compras);
    return {
      ...c,
      detalhes,
      status_exibido: detalhes?.status || statusSugerido(c.status_vigencia),
    };
  });
}
