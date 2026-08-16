/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Agregações das Movimentações de Estoque (SAP MB51) para a aba Visão Geral.
 *
 * O join TMV -> descrição e a classificação funcional do movimento vivem em
 * `vw_mb51_classificado` (ver db/sql/views/movimentacoes_analise.sql), não
 * aqui: as views de FIFO e giro dependem da mesma classificação, e mantê-la
 * em dois lugares faria os números das abas divergirem entre si.
 *
 * A regra que atravessa este arquivo: fluxo de estoque só conta movimento com
 * `movimenta_estoque`. Transferência interna (TMV 311 e afins) gera um par
 * negativo/positivo do mesmo material e soma zero — na base atual são ~46% das
 * linhas. Contá-la inflava entradas e saídas em milhões sem que nada tivesse
 * entrado ou saído do almoxarifado.
 */

import { MB51Classificado, CategoriaMovimento } from '../types';

/** Categorias que aumentam o saldo do almoxarifado. */
const CATEGORIAS_ENTRADA: CategoriaMovimento[] = ['entrada_compra', 'entrada_sem_pedido'];

/** Categorias que reduzem o saldo por consumo (o que o giro mede). */
const CATEGORIAS_CONSUMO: CategoriaMovimento[] = ['consumo'];

export function isEntrada(m: MB51Classificado): boolean {
  return m.movimenta_estoque && CATEGORIAS_ENTRADA.includes(m.categoria);
}

export function isConsumo(m: MB51Classificado): boolean {
  return m.movimenta_estoque && CATEGORIAS_CONSUMO.includes(m.categoria);
}

/** Rótulo legível de cada categoria, para filtros e legendas. */
export const ROTULO_CATEGORIA: Record<CategoriaMovimento, string> = {
  entrada_compra: 'Entrada de compra',
  entrada_sem_pedido: 'Entrada sem pedido',
  estorno_entrada: 'Estorno de entrada',
  consumo: 'Consumo',
  estorno_consumo: 'Estorno de consumo',
  devolucao_fornecedor: 'Devolução a fornecedor',
  estorno_devolucao: 'Estorno de devolução',
  saida_remessa: 'Saída / remessa',
  estorno_remessa: 'Estorno de remessa',
  baixa_sucata: 'Baixa por sucata',
  estorno_sucata: 'Estorno de sucata',
  ajuste_inventario: 'Ajuste de inventário',
  transferencia: 'Transferência interna',
  outros: 'Outros',
};

export interface MovimentacoesKpi {
  totalMovimentacoes: number;
  /** Linhas de transferência interna, excluídas do fluxo. Exibidas para o
   *  usuário entender por que o total não bate com entradas + saídas. */
  qtdTransferencias: number;
  valorTransferencias: number;
  qtdEntradas: number;
  qtdSaidas: number;
  valorEntradas: number;
  valorSaidas: number;
  saldoValor: number;
  materiais: number;
  periodoInicio: string | null;
  periodoFim: string | null;
}

export function calcularKpisMovimentacoes(movs: MB51Classificado[]): MovimentacoesKpi {
  const materiais = new Set<string>();
  let qtdEntradas = 0;
  let qtdSaidas = 0;
  let valorEntradas = 0;
  let valorSaidas = 0;
  let qtdTransferencias = 0;
  let valorTransferencias = 0;
  let periodoInicio: string | null = null;
  let periodoFim: string | null = null;

  movs.forEach(m => {
    if (m.material) materiais.add(m.material.trim());
    const valor = Math.abs(m.montante_mi ?? 0);

    if (!m.movimenta_estoque) {
      // Conta só uma perna do par para não dobrar o volume da transferência.
      if (m.sinal === 'saida') {
        qtdTransferencias += 1;
        valorTransferencias += valor;
      }
    } else if (isEntrada(m)) {
      qtdEntradas += 1;
      valorEntradas += valor;
    } else if (m.sinal === 'saida') {
      qtdSaidas += 1;
      valorSaidas += valor;
    }

    if (m.data_lancamento) {
      if (!periodoInicio || m.data_lancamento < periodoInicio) periodoInicio = m.data_lancamento;
      if (!periodoFim || m.data_lancamento > periodoFim) periodoFim = m.data_lancamento;
    }
  });

  return {
    totalMovimentacoes: movs.length,
    qtdTransferencias,
    valorTransferencias,
    qtdEntradas,
    qtdSaidas,
    valorEntradas,
    valorSaidas,
    saldoValor: valorEntradas - valorSaidas,
    materiais: materiais.size,
    periodoInicio,
    periodoFim,
  };
}

export interface AgregadoMovimentacao {
  chave: string;
  /** Rótulo de exibição quando difere da chave (ex.: "101 — EM Entrada mercador."). */
  rotulo?: string;
  qtdMovimentacoes: number;
  valorEntradas: number;
  valorSaidas: number;
  valorAbsoluto: number;
}

/**
 * Agrega por um campo de texto. `valorAbsoluto` soma sem sinal — é o que
 * ranqueia por relevância sem que entrada e saída se cancelem.
 *
 * `apenasFluxo` (padrão) descarta transferência interna. Passe `false` só
 * quando a intenção for justamente medir movimentação física interna.
 */
export function agregarMovimentacoesPor(
  movs: MB51Classificado[],
  campo: (m: MB51Classificado) => string | null | undefined,
  rotuloVazio = 'Não informado',
  apenasFluxo = true
): AgregadoMovimentacao[] {
  const mapa = new Map<string, AgregadoMovimentacao>();
  movs.forEach(m => {
    if (apenasFluxo && !m.movimenta_estoque) return;
    const chave = String(campo(m) ?? '').trim() || rotuloVazio;
    let atual = mapa.get(chave);
    if (!atual) {
      atual = { chave, qtdMovimentacoes: 0, valorEntradas: 0, valorSaidas: 0, valorAbsoluto: 0 };
      mapa.set(chave, atual);
    }
    const valor = Math.abs(m.montante_mi ?? 0);
    atual.qtdMovimentacoes += 1;
    if (m.sinal === 'entrada') atual.valorEntradas += valor;
    else if (m.sinal === 'saida') atual.valorSaidas += valor;
    atual.valorAbsoluto += valor;
  });
  return Array.from(mapa.values()).sort((a, b) => b.valorAbsoluto - a.valorAbsoluto);
}

export function topNMovimentacoes(
  agregados: AgregadoMovimentacao[], n: number, rotuloResto = 'Outros'
): AgregadoMovimentacao[] {
  if (agregados.length <= n) return agregados;
  const topo = agregados.slice(0, n);
  const resto = agregados.slice(n);
  return [...topo, {
    chave: rotuloResto,
    qtdMovimentacoes: resto.reduce((a, r) => a + r.qtdMovimentacoes, 0),
    valorEntradas: resto.reduce((a, r) => a + r.valorEntradas, 0),
    valorSaidas: resto.reduce((a, r) => a + r.valorSaidas, 0),
    valorAbsoluto: resto.reduce((a, r) => a + r.valorAbsoluto, 0),
  }];
}

export interface SeriePeriodo {
  mes: string;
  valorEntradas: number;
  valorSaidas: number;
  qtdMovimentacoes: number;
}

/** Série mensal (AAAA-MM) de entradas x saídas reais, sem transferência. */
export function serieMensal(movs: MB51Classificado[]): SeriePeriodo[] {
  const mapa = new Map<string, SeriePeriodo>();
  movs.forEach(m => {
    if (!m.data_lancamento || !m.movimenta_estoque) return;
    const mes = m.data_lancamento.slice(0, 7);
    let atual = mapa.get(mes);
    if (!atual) {
      atual = { mes, valorEntradas: 0, valorSaidas: 0, qtdMovimentacoes: 0 };
      mapa.set(mes, atual);
    }
    const valor = Math.abs(m.montante_mi ?? 0);
    atual.qtdMovimentacoes += 1;
    if (isEntrada(m)) atual.valorEntradas += valor;
    else if (m.sinal === 'saida') atual.valorSaidas += valor;
  });
  return Array.from(mapa.values()).sort((a, b) => a.mes.localeCompare(b.mes));
}

/**
 * Defasagem entre a data do documento (nota fiscal) e o lançamento no SAP
 * (MIGO), por entrada de compra. Mede a demora do recebimento em registrar
 * a mercadoria — enquanto não é lançada, o saldo não existe para o MRP.
 */
export interface LagRecebimento {
  mediaDias: number;
  medianaDias: number;
  maxDias: number;
  amostras: number;
  acimaDe30Dias: number;
}

export function calcularLagRecebimento(movs: MB51Classificado[]): LagRecebimento | null {
  const lags: number[] = [];
  movs.forEach(m => {
    if (m.categoria !== 'entrada_compra') return;
    if (!m.data_lancamento || !m.data_documento) return;
    const lanc = Date.parse(m.data_lancamento);
    const doc = Date.parse(m.data_documento);
    if (Number.isNaN(lanc) || Number.isNaN(doc)) return;
    const dias = Math.round((lanc - doc) / 86400000);
    // Lançamento anterior à nota é inconsistência de digitação, não defasagem.
    if (dias >= 0) lags.push(dias);
  });

  if (lags.length === 0) return null;
  lags.sort((a, b) => a - b);
  const soma = lags.reduce((a, b) => a + b, 0);
  const meio = Math.floor(lags.length / 2);
  return {
    mediaDias: soma / lags.length,
    medianaDias: lags.length % 2 === 0 ? (lags[meio - 1] + lags[meio]) / 2 : lags[meio],
    maxDias: lags[lags.length - 1],
    amostras: lags.length,
    acimaDe30Dias: lags.filter(d => d > 30).length,
  };
}
