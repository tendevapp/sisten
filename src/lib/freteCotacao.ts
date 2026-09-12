/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Frete teórico de uma proposta de cotação: quanto custaria trazer a carga
 * até Jacobina pela tabela contratual da Bahia Sul, **antes** de o
 * fornecedor cotar frete.
 *
 * Por que existe: numa proposta FOB o frete é por conta da TEN e não aparece
 * em lugar nenhum do PDF — o comprador compara R$ 1.000 FOB de São Paulo com
 * R$ 1.100 CIF de Feira de Santana como se fossem a mesma coisa, e o frete
 * decide a compra depois, quando não dá mais para voltar atrás. Com o peso
 * estimado pela IA dá para simular esse número na hora da análise.
 *
 * O cálculo do frete em si não mora aqui: é `calcularFreteTabela`
 * (src/lib/bahiasul.ts), a mesma função que audita o CTe emitido. Aqui só
 * mora o que é específico da cotação — quanto pesa a carga inteira, e como
 * essa conta única volta para cada item.
 *
 * Nada importa de `db/`: camada pura, testada em `freteCotacao.test.ts`.
 */

import { calcularFreteTabela, matchRotaTabelaFrete, mediaRotaPorUf } from './bahiasul';
import type { FreteTabelaResultado, VeiculoDedicado } from './bahiasul';
import type { CotacaoPropostaDraft, CotacaoPropostaItemDraft, TabelaFrete } from '../types';

/** Destino padrão da fábrica — toda cotação deste app entrega em Jacobina. */
export const DESTINO_PADRAO = 'JACOBINA/BA';

/**
 * Acima deste peso a carga fracionada deixa de fazer sentido e a tabela
 * cobra por veículo. Passar disso sem trocar de modalidade produz um número
 * irreal (a tarifa por quilo da faixa aberta não tem teto).
 */
export const PESO_LIMITE_FRACIONADO_KG = 3000;

export type MotivoSemFrete =
  | 'nao_fob'
  | 'sem_origem'
  | 'rota_nao_encontrada'
  | 'sem_peso'
  | 'sem_tabela';

export const ROTULO_SEM_FRETE: Record<MotivoSemFrete, string> = {
  nao_fob: 'Frete por conta do fornecedor (CIF) — nada a simular.',
  sem_origem: 'A proposta não diz a cidade do fornecedor.',
  rota_nao_encontrada: 'A cidade de origem não está na tabela da Bahia Sul, e a UF do fornecedor também não tem nenhuma rota cadastrada.',
  sem_peso: 'Nenhum item tem peso estimado.',
  sem_tabela: 'Tabela de frete da Bahia Sul não carregada.',
};

export interface SimulacaoFreteCotacao {
  rota: TabelaFrete | null;
  origem: string | null;
  destino: string;
  modalidade: 'fracionado' | 'dedicado';
  pesoTotalKg: number;
  valorMercadoria: number;
  detalhe: FreteTabelaResultado | null;
  /** `true` quando a cidade do fornecedor não está na tabela e o cálculo usou a média das rotas cadastradas para a UF — aproximação, não a tarifa real da cidade. */
  rotaAproximada: boolean;
  /** Frete total da carga, com ICMS — `null` quando não deu para simular. */
  freteTotal: number | null;
  /** Parcela do frete por item (`_key` do item cotado), somando exatamente `freteTotal`. */
  fretePorItem: Record<string, number>;
  /** Itens que entram na carga mas estão sem peso estimado — o frete deles sai por valor, não por peso. */
  itensSemPeso: string[];
  motivo: MotivoSemFrete | null;
}

/** Peso total do item: peso unitário estimado × quantidade cotada. Quantidade ausente conta como 1. */
export function pesoTotalItem(item: CotacaoPropostaItemDraft): number | null {
  if (item.peso_unitario_kg == null || !Number.isFinite(item.peso_unitario_kg)) return null;
  const qtd = item.quantidade != null && item.quantidade > 0 ? item.quantidade : 1;
  return item.peso_unitario_kg * qtd;
}

/** Valor cotado do item — `preco_total_item` quando o fornecedor informou, senão preço × quantidade. */
function valorDoItem(item: CotacaoPropostaItemDraft): number {
  if (item.preco_total_item != null) return item.preco_total_item;
  if (item.preco_unitario != null && item.quantidade != null) return item.preco_unitario * item.quantidade;
  return 0;
}

/** Itens que entram na carga: os desconsiderados não são comprados, logo não são transportados. */
export function itensTransportados(itens: CotacaoPropostaItemDraft[]): CotacaoPropostaItemDraft[] {
  return itens.filter(i => !i.desconsiderado);
}

/**
 * Rateia um valor único entre chaves conforme pesos relativos, fechando a
 * soma exata no centavo: o resto do arredondamento vai para a maior parcela,
 * senão a soma dos fretes por item não bate com o frete da carga e a
 * diferença aparece como centavo perdido no total do pedido.
 */
export function ratear(total: number, pesos: { key: string; peso: number }[]): Record<string, number> {
  const resultado: Record<string, number> = {};
  if (pesos.length === 0) return resultado;

  const somaPesos = pesos.reduce((s, p) => s + Math.max(0, p.peso), 0);
  const totalCentavos = Math.round(total * 100);

  if (somaPesos <= 0) {
    // Sem base de rateio, divide igualmente — melhor que jogar tudo no primeiro item.
    const base = Math.floor(totalCentavos / pesos.length);
    pesos.forEach(p => { resultado[p.key] = base / 100; });
    const sobra = totalCentavos - base * pesos.length;
    if (sobra !== 0) resultado[pesos[0].key] = (base + sobra) / 100;
    return resultado;
  }

  let acumulado = 0;
  let maiorKey = pesos[0].key;
  let maiorPeso = -Infinity;
  for (const p of pesos) {
    const centavos = Math.floor((totalCentavos * Math.max(0, p.peso)) / somaPesos);
    resultado[p.key] = centavos / 100;
    acumulado += centavos;
    if (p.peso > maiorPeso) { maiorPeso = p.peso; maiorKey = p.key; }
  }

  const sobra = totalCentavos - acumulado;
  if (sobra !== 0) resultado[maiorKey] = Math.round(resultado[maiorKey] * 100 + sobra) / 100;
  return resultado;
}

function semFrete(motivo: MotivoSemFrete, extra: Partial<SimulacaoFreteCotacao> = {}): SimulacaoFreteCotacao {
  return {
    rota: null,
    origem: null,
    destino: DESTINO_PADRAO,
    modalidade: 'fracionado',
    pesoTotalKg: 0,
    valorMercadoria: 0,
    detalhe: null,
    rotaAproximada: false,
    freteTotal: null,
    fretePorItem: {},
    itensSemPeso: [],
    motivo,
    ...extra,
  };
}

export interface ParamsSimulacaoFrete {
  proposta: CotacaoPropostaDraft;
  tabela: TabelaFrete[];
  /** Força a modalidade; por padrão é fracionado e só vira dedicado acima de `PESO_LIMITE_FRACIONADO_KG`. */
  modalidade?: 'fracionado' | 'dedicado';
  veiculo?: VeiculoDedicado;
  destino?: string;
}

/**
 * Simula o frete da proposta inteira e devolve a parcela de cada item.
 *
 * A carga é simulada de uma vez, e não item a item, porque a tabela é
 * escalonada: 10 itens de 5 kg enviados juntos pagam a faixa de 50 kg, não
 * dez vezes a faixa de 10 kg. Depois o número volta rateado **por peso** —
 * é o peso que faz o frete, então é ele que reparte a conta; só quando
 * nenhum item tem peso estimado o rateio cai para o valor.
 *
 * Só simula proposta FOB: em CIF o frete já está no preço do fornecedor e
 * somar de novo contaria a mesma despesa duas vezes.
 */
export function simularFreteCotacao(params: ParamsSimulacaoFrete): SimulacaoFreteCotacao {
  const { proposta, tabela } = params;
  const destino = params.destino ?? DESTINO_PADRAO;

  if (proposta.frete_modalidade !== 'FOB') return semFrete('nao_fob', { destino });
  if (!tabela || tabela.length === 0) return semFrete('sem_tabela', { destino });

  const cidade = (proposta.fornecedor_cidade ?? '').trim();
  if (!cidade) return semFrete('sem_origem', { destino });
  const origem = proposta.fornecedor_uf ? `${cidade}/${proposta.fornecedor_uf}` : cidade;

  // Cidade cadastrada ganha sempre; sem ela, cai para a média das rotas da
  // UF do fornecedor — aproximação melhor que nenhum frete simulado, mas só
  // vale para a estimativa da cotação (a auditoria do CTe emitido nunca usa
  // essa média, ver `mediaRotaPorUf`).
  const rotaExata = matchRotaTabelaFrete(origem, destino, tabela);
  const rota = rotaExata ?? mediaRotaPorUf(proposta.fornecedor_uf, tabela);
  if (!rota) return semFrete('rota_nao_encontrada', { origem, destino });
  const rotaAproximada = !rotaExata;

  const itens = itensTransportados(proposta.itens);
  const pesos = itens.map(i => ({ item: i, peso: pesoTotalItem(i) }));
  const pesoTotalKg = pesos.reduce((s, p) => s + (p.peso ?? 0), 0);
  const valorMercadoria = itens.reduce((s, i) => s + valorDoItem(i), 0);
  const itensSemPeso = pesos.filter(p => p.peso == null).map(p => p.item._key);

  if (pesoTotalKg <= 0) {
    return semFrete('sem_peso', { rota, origem, destino, valorMercadoria, itensSemPeso, rotaAproximada });
  }

  const modalidade = params.modalidade
    ?? (pesoTotalKg > PESO_LIMITE_FRACIONADO_KG ? 'dedicado' : 'fracionado');

  const detalhe = calcularFreteTabela(rota, {
    pesoKg: pesoTotalKg,
    valorMercadoria,
    modalidade,
    veiculo: params.veiculo,
  });

  // Rateio por peso; item sem peso estimado entra pelo valor convertido à
  // densidade média da carga, para não sair de graça só por falta de dado.
  const densidade = valorMercadoria > 0 ? pesoTotalKg / valorMercadoria : 0;
  const basesRateio = pesos.map(({ item, peso }) => ({
    key: item._key,
    peso: peso ?? (densidade > 0 ? valorDoItem(item) * densidade : 0),
  }));

  return {
    rota,
    origem,
    destino,
    modalidade,
    pesoTotalKg,
    valorMercadoria,
    detalhe,
    rotaAproximada,
    freteTotal: detalhe.totalComIcms,
    fretePorItem: ratear(detalhe.totalComIcms, basesRateio),
    itensSemPeso,
    motivo: null,
  };
}

/** Aplica o resultado da simulação nos itens: `frete_teorico` preenchido, nulo no que não entra na carga. */
export function aplicarFreteTeorico(
  itens: CotacaoPropostaItemDraft[],
  simulacao: SimulacaoFreteCotacao,
): CotacaoPropostaItemDraft[] {
  return itens.map(item => {
    const valor = simulacao.fretePorItem[item._key];
    const novo = item.desconsiderado || valor == null ? null : valor;
    return novo === item.frete_teorico ? item : { ...item, frete_teorico: novo };
  });
}
