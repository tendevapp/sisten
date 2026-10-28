/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Financeiro > Mercado Livre — adiantamento por compra e baixas parciais.
 *
 * Uma compra do ML (nº gravado pelo comprador na Central de Compras) gera um
 * boleto pago como adiantamento. Depois cada loja emite a sua NF, a NF vira
 * PO no SAP, o item chega no almoxarifado e recebe MIGO — item a item, em
 * datas diferentes. O Financeiro baixa o adiantamento por item à medida que
 * ele se comprova. Aqui ficam as regras puras; o I/O está em
 * `finMercadoLivreApi.ts` e o cruzamento com SAP/almox na view
 * `vw_fin_ml_itens`.
 */

import { lerValorMl } from './detalheCompraMl';

/** Linha de `vw_fin_ml_itens`: item do ML com PO, recebimento, MIGO e baixado. */
export interface ItemFinMl {
  ri: string;
  rm: string | null;
  item_reqc: string | null;
  material_code: string | null;
  texto_breve: string | null;
  qtd: number | null;
  unidade: string | null;
  link: string | null;
  numero_compra: string;
  compra_registrada_em: string | null;
  compra_registrada_por_nome: string | null;
  pedidos: string[] | null;
  fornecedores: string[] | null;
  valor_pedido: number | null;
  qtd_pedido: number | null;
  qtd_fornecida: number | null;
  data_pedido: string | null;
  data_migo: string | null;
  qtd_recebida: number | null;
  data_recebimento: string | null;
  notas_fiscais: string[] | null;
  data_chegada: string | null;
  valor_baixado: number;
  ultima_baixa: string | null;
}

/**
 * `fin_ml_compras`: o boleto (adiantamento) de uma compra. Os dados da compra
 * e o boleto (valor, vencimento, linha digitável) chegam do comprador na
 * Central de Compras; pagamento e documento SAP, do Financeiro.
 */
export interface CompraFinMl {
  numero_compra: string;
  valor_boleto: number | null;
  vencimento: string | null;
  linha_digitavel?: string | null;
  pago_em: string | null;
  doc_adiantamento: string | null;
  observacao: string | null;
  data_compra?: string | null;
  qtd_produtos?: number | null;
  valor_produtos?: number | null;
  valor_frete?: number | null;
  valor_total?: number | null;
  forma_pagamento?: string | null;
  numero_pagamento?: string | null;
  status_pagamento_ml?: string | null;
  endereco_entrega?: string | null;
  pacotes?: { descricao: string; valor: number | null; quantidade: number | null }[] | null;
  detalhe_registrado_por_nome?: string | null;
  detalhe_registrado_em?: string | null;
  atualizado_por_nome: string | null;
  updated_at: string;
}

/** `fin_ml_baixas`: baixa parcial. `ri` nulo = avulsa (frete, diferença). */
export interface BaixaFinMl {
  id: string;
  numero_compra: string;
  ri: string | null;
  valor: number;
  data_baixa: string;
  nota_fiscal: string | null;
  doc_compensacao: string | null;
  observacao: string | null;
  criado_por_id: string;
  criado_por_nome: string | null;
  created_at: string;
  estornado_em: string | null;
  estornado_por_nome: string | null;
  motivo_estorno: string | null;
}

/** Diferença de centavos que não conta como saldo (arredondamento do SAP). */
const TOLERANCIA = 0.01;

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

const arred = (v: number): number => Math.round(v * 100) / 100;

/**
 * Onde o item está no caminho compra → NF/PO → almoxarifado → MIGO → baixa.
 * A etapa é a mais adiantada já comprovada; a baixa só conta como etapa
 * quando cobre o valor do PO.
 */
export type EtapaItemMl = 'comprado' | 'pedido' | 'recebido' | 'migo' | 'baixado';

export const ETAPAS_ITEM_ML: { id: EtapaItemMl; rotulo: string }[] = [
  { id: 'comprado', rotulo: 'Comprado' },
  { id: 'pedido', rotulo: 'NF / PO' },
  { id: 'recebido', rotulo: 'Almox' },
  { id: 'migo', rotulo: 'MIGO' },
  { id: 'baixado', rotulo: 'Baixado' },
];

export function temPedido(item: ItemFinMl): boolean {
  return (item.pedidos?.length ?? 0) > 0;
}

export function foiRecebido(item: ItemFinMl): boolean {
  return num(item.qtd_recebida) > 0 || !!item.data_chegada || !!item.data_recebimento;
}

export function saldoItem(item: ItemFinMl): number {
  return arred(Math.max(0, num(item.valor_pedido) - num(item.valor_baixado)));
}

export function etapaItem(item: ItemFinMl): EtapaItemMl {
  const valor = num(item.valor_pedido);
  if (valor > 0 && num(item.valor_baixado) >= valor - TOLERANCIA) return 'baixado';
  if (item.data_migo) return 'migo';
  if (foiRecebido(item)) return 'recebido';
  if (temPedido(item)) return 'pedido';
  return 'comprado';
}

/**
 * Quanto do valor do PO já está comprovado e pode ser baixado. A entrega pode
 * ser parcial dentro do próprio item: com MIGO conta a quantidade fornecida
 * da ZL0132 (MIGO sem quantidade = item inteiro); sem MIGO ainda, conta o que
 * a conferência do almoxarifado recebeu. Desconta o que já foi baixado.
 */
export function valorLiberadoParaBaixa(item: ItemFinMl): number {
  const valor = num(item.valor_pedido);
  if (valor <= 0) return 0;
  const qtdPedido = num(item.qtd_pedido) || num(item.qtd);
  let fracao = 0;
  if (item.data_migo) {
    const forn = num(item.qtd_fornecida);
    fracao = forn > 0 && qtdPedido > 0 ? forn / qtdPedido : 1;
  } else if (foiRecebido(item)) {
    const rec = num(item.qtd_recebida);
    fracao = rec > 0 && qtdPedido > 0 ? rec / qtdPedido : 0;
  }
  const liberado = valor * Math.min(1, fracao);
  return arred(Math.max(0, liberado - num(item.valor_baixado)));
}

export type SituacaoCompraMl = 'sem_boleto' | 'aguardando_pagamento' | 'em_aberto' | 'quitada';

export const ROTULO_SITUACAO_COMPRA: Record<SituacaoCompraMl, string> = {
  sem_boleto: 'Sem boleto',
  aguardando_pagamento: 'Boleto a pagar',
  em_aberto: 'Adiantamento em aberto',
  quitada: 'Baixada',
};

export interface ResumoCompraFinMl {
  numero: string;
  compra: CompraFinMl | null;
  itens: ItemFinMl[];
  baixas: BaixaFinMl[];
  rms: string[];
  fornecedores: string[];
  registradaEm: string | null;
  registradaPor: string | null;
  /** Soma do valor dos POs dos itens que já têm PO. */
  valorPedidos: number;
  itensSemPedido: number;
  itensComMigo: number;
  /** Baixas válidas (não estornadas), por item e avulsas. */
  valorBaixado: number;
  /** Boleto − baixado; nulo enquanto o valor do boleto não foi informado. */
  saldoAdiantamento: number | null;
  /** Valor já comprovado (MIGO/almox) e ainda não baixado. */
  prontoParaBaixa: number;
  itensProntos: number;
  situacao: SituacaoCompraMl;
}

export function situacaoCompra(compra: CompraFinMl | null, saldo: number | null): SituacaoCompraMl {
  if (!compra || compra.valor_boleto == null) return 'sem_boleto';
  if (!compra.pago_em) return 'aguardando_pagamento';
  if (saldo != null && saldo <= TOLERANCIA) return 'quitada';
  return 'em_aberto';
}

/** Agrupa itens, boletos e baixas por nº de compra — a compra mais recente primeiro. */
export function resumirComprasFinMl(
  itens: ItemFinMl[],
  compras: CompraFinMl[],
  baixas: BaixaFinMl[],
): ResumoCompraFinMl[] {
  const compraPorNumero = new Map(compras.map(c => [c.numero_compra, c]));
  const numeros = new Set<string>();
  const itensPorNumero = new Map<string, ItemFinMl[]>();
  for (const it of itens) {
    numeros.add(it.numero_compra);
    const lista = itensPorNumero.get(it.numero_compra) ?? [];
    lista.push(it);
    itensPorNumero.set(it.numero_compra, lista);
  }
  const baixasPorNumero = new Map<string, BaixaFinMl[]>();
  for (const b of baixas) {
    numeros.add(b.numero_compra);
    const lista = baixasPorNumero.get(b.numero_compra) ?? [];
    lista.push(b);
    baixasPorNumero.set(b.numero_compra, lista);
  }
  // Boleto lançado sem item na Central (compra desfeita lá) continua visível.
  for (const c of compras) numeros.add(c.numero_compra);

  const resumos: ResumoCompraFinMl[] = [];
  for (const numero of numeros) {
    const lista = (itensPorNumero.get(numero) ?? []).slice()
      .sort((a, b) => (a.rm ?? '').localeCompare(b.rm ?? '') || a.ri.localeCompare(b.ri));
    const bx = (baixasPorNumero.get(numero) ?? []).slice()
      .sort((a, b) => b.data_baixa.localeCompare(a.data_baixa) || b.created_at.localeCompare(a.created_at));
    const compra = compraPorNumero.get(numero) ?? null;
    const valorBaixado = arred(bx.filter(b => !b.estornado_em).reduce((s, b) => s + num(b.valor), 0));
    const saldo = compra?.valor_boleto != null ? arred(num(compra.valor_boleto) - valorBaixado) : null;
    const liberados = lista.map(valorLiberadoParaBaixa);
    const registradas = (lista.map(i => i.compra_registrada_em).filter(Boolean) as string[]).sort();
    const maisRecente = registradas.length ? registradas[registradas.length - 1] : null;
    resumos.push({
      numero,
      compra,
      itens: lista,
      baixas: bx,
      rms: Array.from(new Set(lista.map(i => i.rm).filter(Boolean) as string[])).sort(),
      fornecedores: Array.from(new Set(lista.flatMap(i => i.fornecedores ?? []))).sort(),
      registradaEm: maisRecente,
      registradaPor: lista.find(i => i.compra_registrada_em === maisRecente)?.compra_registrada_por_nome ?? null,
      valorPedidos: arred(lista.reduce((s, i) => s + num(i.valor_pedido), 0)),
      itensSemPedido: lista.filter(i => !temPedido(i)).length,
      itensComMigo: lista.filter(i => !!i.data_migo).length,
      valorBaixado,
      saldoAdiantamento: saldo,
      prontoParaBaixa: arred(liberados.reduce((s, v) => s + v, 0)),
      itensProntos: liberados.filter(v => v > 0).length,
      situacao: situacaoCompra(compra, saldo),
    });
  }
  return resumos.sort((a, b) =>
    (b.registradaEm ?? '').localeCompare(a.registradaEm ?? '') || b.numero.localeCompare(a.numero));
}

export type FiltroCompraFinMl = 'abertas' | 'prontas' | 'quitadas' | 'todas';

export function passaFiltroCompraFinMl(r: ResumoCompraFinMl, filtro: FiltroCompraFinMl): boolean {
  switch (filtro) {
    case 'abertas': return r.situacao !== 'quitada';
    case 'prontas': return r.prontoParaBaixa > 0;
    case 'quitadas': return r.situacao === 'quitada';
    default: return true;
  }
}

/** Busca livre: nº da compra, RM, PO, NF, material, descrição ou loja. */
export function casaBuscaCompraFinMl(r: ResumoCompraFinMl, termo: string): boolean {
  const q = termo.trim().toLowerCase();
  if (!q) return true;
  const digitos = q.replace(/\D/g, '');
  if (digitos.length >= 4 && r.numero.includes(digitos)) return true;
  const textos = [
    r.numero, ...r.rms, ...r.fornecedores,
    ...r.baixas.flatMap(b => [b.nota_fiscal, b.doc_compensacao]),
    r.compra?.doc_adiantamento, r.compra?.numero_pagamento,
    ...(r.compra?.pacotes ?? []).map(p => p.descricao),
    ...r.itens.flatMap(i => [i.ri, i.material_code, i.texto_breve, ...(i.pedidos ?? []), ...(i.notas_fiscais ?? [])]),
  ];
  return textos.some(t => t && t.toLowerCase().includes(q));
}

/**
 * Valor digitado ("1.234,56", "1234.56", "R$ 15,37") em número; null se
 * inválido. Também corrige o valor colado do ML sem a vírgula ("1.87874").
 */
export function lerValorBRL(texto: string): number | null {
  if (!(texto ?? '').trim()) return null;
  if (!/^[R$\s\d.,]+$/.test(texto.trim())) return null;
  return lerValorMl(texto);
}

/** Linha digitável em blocos para leitura (47 dígitos do boleto bancário). */
export function formatarLinhaDigitavel(digitos: string | null | undefined): string {
  const d = (digitos ?? '').replace(/\D/g, '');
  if (d.length !== 47) return d;
  return `${d.slice(0, 5)}.${d.slice(5, 10)} ${d.slice(10, 15)}.${d.slice(15, 21)} ${d.slice(21, 26)}.${d.slice(26, 32)} ${d.slice(32, 33)} ${d.slice(33)}`;
}
