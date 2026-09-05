/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * PMM movimentado: preço médio recalculado a partir das entradas registradas
 * na MB51, ao lado do PMM que vem pronto do SAP (`estoque.preco_medio`).
 *
 * Por que os dois convivem: o PMM do ZL0024 carrega o custo do estoque que
 * atravessou a parada da fábrica (2023–2026) — compra antiga, câmbio e
 * fornecedor de outra época. O PMM movimentado olha só o que entrou desde a
 * reabertura, que é o custo de reposição praticado hoje. Nenhum dos dois é
 * "o certo": divergência entre eles é justamente o sinal que o painel de
 * Divergência de PMM procura, então substituir um pelo outro apagaria a
 * informação.
 *
 * Regras da conta, e o motivo de cada uma:
 *  - só linhas com `movimenta_estoque`: o TMV 311 (transferência interna) é
 *    ~46% da MB51 e soma zero — entra e sai a mesma quantidade. Contá-lo
 *    dobraria a quantidade e puxaria o preço para baixo;
 *  - só entradas (quantidade > 0): saída é consumo, não formação de preço;
 *  - só entrada com valor positivo: entrada a custo zero (ajuste, doação,
 *    devolução sem valor) derrubaria a média sem representar compra;
 *  - toda a janela da MB51, que começa na reabertura. Não há corte fixo por
 *    ano: 2027 continuaria valendo sem ninguém lembrar de mexer aqui.
 */

import type { MB51Classificado } from '../types';
import { normalizeCode } from './almoxarifado';

export interface PmmMovimentadoItem {
  material: string;
  /** Valor total das entradas ÷ quantidade total. */
  pmm: number;
  quantidade: number;
  valor: number;
  /** Quantos lançamentos de entrada sustentam a média. */
  entradas: number;
  primeiraEntrada: string | null;
  ultimaEntrada: string | null;
}

/** `true` quando a linha forma preço (entrada real, com valor, que move estoque). */
export function contaParaPmm(m: MB51Classificado): boolean {
  if (!m.movimenta_estoque) return false;
  const qtd = m.qtd_um_registro ?? 0;
  const valor = m.montante_mi ?? 0;
  return qtd > 0 && valor > 0 && Boolean(m.material);
}

/** PMM movimentado por material, indexado pelo código normalizado. */
export function calcularPmmMovimentado(movs: MB51Classificado[]): Map<string, PmmMovimentadoItem> {
  const mapa = new Map<string, PmmMovimentadoItem>();

  movs.forEach(m => {
    if (!contaParaPmm(m)) return;
    const material = normalizeCode(m.material);
    if (!material) return;

    let item = mapa.get(material);
    if (!item) {
      item = {
        material,
        pmm: 0,
        quantidade: 0,
        valor: 0,
        entradas: 0,
        primeiraEntrada: null,
        ultimaEntrada: null,
      };
      mapa.set(material, item);
    }

    item.quantidade += m.qtd_um_registro ?? 0;
    item.valor += m.montante_mi ?? 0;
    item.entradas += 1;

    // Datas comparadas como string ISO: `new Date('2026-09-01')` volta como
    // 31/08 em UTC-3 e trocaria a ordem em lançamentos de virada de mês.
    const data = m.data_lancamento ? m.data_lancamento.slice(0, 10) : null;
    if (data) {
      if (!item.primeiraEntrada || data < item.primeiraEntrada) item.primeiraEntrada = data;
      if (!item.ultimaEntrada || data > item.ultimaEntrada) item.ultimaEntrada = data;
    }
  });

  mapa.forEach(item => {
    item.pmm = item.quantidade > 0 ? item.valor / item.quantidade : 0;
  });

  return mapa;
}

/**
 * Variação do PMM movimentado sobre o PMM do SAP, em fração assinada:
 * 0,35 = movimentado 35% acima do contábil. `null` quando falta um dos lados.
 */
export function variacaoPmm(pmmSap?: number | null, pmmMov?: number | null): number | null {
  if (!pmmSap || !(pmmSap > 0)) return null;
  if (!pmmMov || !(pmmMov > 0)) return null;
  return (pmmMov - pmmSap) / pmmSap;
}
