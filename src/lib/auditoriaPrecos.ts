/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Auditoria de preços: as compras de 2026 contra o preço que o mesmo material
 * custou no passado, cada compra passada trazida a valor de hoje pelo IPCA.
 *
 * O cálculo pesado (percentis sobre 66 mil linhas históricas) fica no Postgres,
 * em `mv_benchmark_material` e `vw_auditoria_compras` — o histórico inteiro não
 * cabe no navegador. Este módulo só reclassifica e agrega o que a view devolve.
 *
 * A duplicação das regras (aqui e em SQL) é deliberada e estreita: as funções de
 * classificação existem no cliente para as linhas continuarem legíveis quando o
 * cache local for anterior a uma mudança de corte na view, e para os testes
 * poderem exercitar as fronteiras sem ida ao banco. Cortes em CORTES_CONFIANCA e
 * FATOR_LOTE_ATIPICO são a fonte da verdade dos dois lados.
 *
 * Ver docs/superpowers/specs/2026-08-08-auditoria-precos-ipca-design.md.
 */

import { AuditoriaCompra, ConfiancaBenchmark, VereditoCompra } from '../types';

/**
 * Um material só tem referência confiável quando foi comprado vezes suficientes
 * E os preços dessas compras conversam entre si. As duas condições importam: 20
 * compras de um código genérico continuam não sendo referência, e uma única
 * compra consistente consigo mesma também não.
 *
 * A dispersão é medida no LOG do preço, não no preço, porque é a medida que trata
 * "dobrou" e "caiu pela metade" como o mesmo desvio. Foi ela que separou os 35
 * materiais genéricos da base (TRANSPORTE RODOVIÁRIO, com 1.274 compras entre
 * R$ 0,93 e R$ 61.669 a unidade) dos 95 com preço estável.
 */
export const CORTES_CONFIANCA = {
  alta:  { nMinimo: 5, sdLogMaximo: 0.35 },
  media: { nMinimo: 3, sdLogMaximo: 0.80 },
} as const;

/**
 * Fora de [mediana/3, mediana×3] o lote é atípico. Preço unitário de lote grande
 * cai por escala, não por negociação — medido na própria base: lote 3× maior
 * paga 0,69 da referência, lote comparável paga 0,84.
 *
 * A marca é informativa, nunca desconta o valor. Normalizar exigiria uma curva de
 * elasticidade que o dado não sustenta, e um número ajustado por modelo invisível
 * é pior para auditoria que um número cru com a ressalva ao lado.
 */
export const FATOR_LOTE_ATIPICO = 3;

/** Só estes dois graus entram no número de manchete. */
const CONFIANCA_CONFIAVEL: ReadonlySet<string> = new Set<ConfiancaBenchmark>(['Alta', 'Média']);

export const ehConfiavel = (c: ConfiancaBenchmark): boolean => CONFIANCA_CONFIAVEL.has(c);

/**
 * Traz um valor da data da compra até o mês de referência da série.
 *
 * `indices` é o mapa mês ('AAAA-MM') → número-índice. Data anterior ao início da
 * série cai no primeiro índice disponível: subestima a correção e portanto a
 * economia, que é o erro seguro numa auditoria. Data posterior ao último mês
 * publicado (compra do mês corrente, antes de o IBGE divulgar) devolve 1 — não
 * há inflação medida a aplicar.
 */
export function fatorIpca(
  dataCompra: string | Date,
  indices: ReadonlyMap<string, number>,
): number {
  if (indices.size === 0) return 1;

  const meses = [...indices.keys()].sort();
  const indiceRef = indices.get(meses[meses.length - 1])!;

  const d = dataCompra instanceof Date ? dataCompra : new Date(dataCompra);
  if (isNaN(d.getTime())) return 1;
  const mesCompra = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

  // Maior mês da série que não passa do mês da compra.
  let indiceCompra: number | undefined;
  for (const mes of meses) {
    if (mes <= mesCompra) indiceCompra = indices.get(mes);
    else break;
  }
  if (indiceCompra === undefined) indiceCompra = indices.get(meses[0])!;

  return indiceCompra > 0 ? indiceRef / indiceCompra : 1;
}

/** Grau de confiança da referência de um material. */
export function classificarConfianca(nCompras: number, sdLog: number): ConfiancaBenchmark {
  const { alta, media } = CORTES_CONFIANCA;
  if (nCompras >= alta.nMinimo && sdLog < alta.sdLogMaximo) return 'Alta';
  if (nCompras >= media.nMinimo && sdLog < media.sdLogMaximo) return 'Média';
  return 'Baixa';
}

/**
 * Veredito de uma compra contra a faixa esperada. Fora da faixa P25–P75, não
 * contra a mediana: chamar de "cara" toda compra um centavo acima da mediana
 * transformaria metade das linhas em achado e nenhuma em prioridade.
 */
export function classificarVeredito(
  precoUnit: number,
  p25: number | null | undefined,
  p75: number | null | undefined,
): VereditoCompra {
  if (p25 == null || p75 == null) return 'Sem referência';
  if (precoUnit < p25) return 'Bom';
  if (precoUnit > p75) return 'Atenção';
  return 'Na faixa';
}

/** Quantidade fora da faixa de lote habitual do material. */
export function ehLoteAtipico(qtd: number, qtdMediana: number | null | undefined): boolean {
  if (qtdMediana == null || qtdMediana <= 0) return false;
  return qtd > qtdMediana * FATOR_LOTE_ATIPICO || qtd < qtdMediana / FATOR_LOTE_ATIPICO;
}

export interface ResumoAuditoria {
  /** Todas as compras do recorte, inclusive as sem referência. */
  totalCompras: number;
  valorTotal: number;
  /** Compras com referência de confiança Alta ou Média — a base da manchete. */
  comprasConfiaveis: number;
  valorConfiavel: number;
  valorReferencia: number;
  /** valorConfiavel − valorReferencia. Negativo = comprou abaixo do histórico. */
  deltaValor: number;
  deltaPct: number | null;
  /** Fração do valor total com alguma referência (qualquer confiança). */
  coberturaValor: number;
  acimaDaFaixa: number;
  abaixoDaFaixa: number;
  lotesAtipicos: number;
  semReferencia: number;
  valorSemReferencia: number;
  /** Valor de confiança Baixa — listado na tela, fora da manchete. */
  valorBaixaConfianca: number;
}

/**
 * Agrega as linhas em KPIs.
 *
 * A manchete (`deltaValor`) soma só Alta e Média. As demais grandezas contam a
 * base inteira de propósito: uma tela de auditoria que reporta economia sobre
 * 30% do valor sem dizer isso na mesma linha de visão está mentindo por omissão,
 * então `coberturaValor`, `valorSemReferencia` e `valorBaixaConfianca` saem daqui
 * já prontos para virar KPI, não nota de rodapé.
 */
export function resumirAuditoria(compras: readonly AuditoriaCompra[]): ResumoAuditoria {
  const r: ResumoAuditoria = {
    totalCompras: compras.length,
    valorTotal: 0,
    comprasConfiaveis: 0,
    valorConfiavel: 0,
    valorReferencia: 0,
    deltaValor: 0,
    deltaPct: null,
    coberturaValor: 0,
    acimaDaFaixa: 0,
    abaixoDaFaixa: 0,
    lotesAtipicos: 0,
    semReferencia: 0,
    valorSemReferencia: 0,
    valorBaixaConfianca: 0,
  };

  let valorComReferencia = 0;

  for (const c of compras) {
    const valor = Number(c.valor) || 0;
    r.valorTotal += valor;

    if (c.veredito === 'Sem referência' || c.ref_p50 == null) {
      r.semReferencia += 1;
      r.valorSemReferencia += valor;
      continue;
    }

    valorComReferencia += valor;
    if (c.veredito === 'Atenção') r.acimaDaFaixa += 1;
    if (c.veredito === 'Bom') r.abaixoDaFaixa += 1;
    if (c.lote_atipico) r.lotesAtipicos += 1;

    if (ehConfiavel(c.confianca)) {
      r.comprasConfiaveis += 1;
      r.valorConfiavel += valor;
      r.valorReferencia += (Number(c.ref_p50) || 0) * (Number(c.qtd) || 0);
    } else {
      r.valorBaixaConfianca += valor;
    }
  }

  r.deltaValor = r.valorConfiavel - r.valorReferencia;
  r.deltaPct = r.valorReferencia > 0 ? r.deltaValor / r.valorReferencia : null;
  r.coberturaValor = r.valorTotal > 0 ? valorComReferencia / r.valorTotal : 0;

  return r;
}

/**
 * Reclassifica uma linha da view com as regras locais.
 *
 * Serve ao cache antigo: uma linha gravada antes de a view ganhar `veredito` ou
 * `lote_atipico` chegaria com o campo indefinido e a tela mostraria "—" onde há
 * dado suficiente para decidir. Linha completa passa direto.
 */
export function normalizarCompra(c: AuditoriaCompra): AuditoriaCompra {
  const precoUnit = Number(c.preco_unit) || 0;
  const temBenchmark = c.ref_p50 != null;

  return {
    ...c,
    confianca: c.confianca
      ?? (temBenchmark
        ? classificarConfianca(Number(c.n_compras) || 0, Number(c.sd_log) || 0)
        : 'Sem referência'),
    veredito: c.veredito ?? classificarVeredito(precoUnit, c.ref_p25, c.ref_p75),
    lote_atipico: c.lote_atipico ?? ehLoteAtipico(Number(c.qtd) || 0, c.qtd_mediana),
    delta_pct: c.delta_pct
      ?? (temBenchmark && Number(c.ref_p50) > 0 ? precoUnit / Number(c.ref_p50) - 1 : null),
    delta_valor: c.delta_valor
      ?? (temBenchmark ? (precoUnit - Number(c.ref_p50)) * (Number(c.qtd) || 0) : null),
  };
}
