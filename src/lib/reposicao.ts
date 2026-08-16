/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Sugestão de estoque mínimo (ponto de reposição).
 *
 * ---------------------------------------------------------------------------
 * POR QUE NÃO É A FÓRMULA CLÁSSICA
 * ---------------------------------------------------------------------------
 * A fórmula de livro — `mínimo = consumo médio no lead time + Z × desvio` —
 * pressupõe demanda aproximadamente normal. Classificando a carteira pelos
 * dois eixos de Syntetos-Boylan (intervalo médio entre demandas e variação do
 * tamanho do lote), NENHUM material tem demanda suave ou errática: 100% é
 * intermitente ou irregular, com intervalo médio de ~6,6 meses entre demandas.
 *
 * Aplicar a normal a demanda intermitente gera um número com aparência
 * estatística e sem lastro: o desvio-padrão de 2 ou 3 observações esparsas não
 * descreve distribuição nenhuma. Pior, erra para baixo justamente onde dói —
 * a demanda intermitente falha por um saque grande e isolado, não por um
 * desvio suave em torno da média.
 *
 * ---------------------------------------------------------------------------
 * O QUE É USADO NO LUGAR
 * ---------------------------------------------------------------------------
 *     mínimo = consumo_diário × lead_time + p90 das saídas
 *
 * A primeira parcela cobre o consumo esperado enquanto a reposição não chega.
 * A segunda é a proteção, empírica de propósito: com demanda irregular o risco
 * concreto é uma retirada grande de uma vez, não uma variação suave.
 *
 * A proteção usa o percentil 90 das saídas, e NÃO a maior observada. Cobrir o
 * máximo parecia mais seguro e na prática inflava o mínimo de item caro: no
 * material 92229 (componente de torre, R$ 9,4 mil/un) uma única retirada valia
 * metade de todo o consumo do período, e bufferizá-la para sempre pedia
 * R$ 741 mil de compra. O p90 cobre uma saída alta plausível sem perseguir o
 * evento isolado — nos itens de demanda distribuída o máximo é 2,3x o p75.
 *
 * O lead time é MEDIDO (data do pedido → entrada no estoque), não o prazo
 * prometido pelo fornecedor: o que evita ruptura é quanto a reposição demora
 * de verdade.
 *
 * ---------------------------------------------------------------------------
 * ONDE O MÉTODO SE RECUSA A RESPONDER
 * ---------------------------------------------------------------------------
 * Material com 1 a 3 saídas em toda a janela de produção não tem padrão a
 * estimar. Para esses a resposta é "comprar sob demanda", com o lead time à
 * vista — e não um número inventado. Fabricar mínimo para item sem demanda
 * recorrente é exatamente como se acumula estoque morto, que nesta base já
 * soma R$ 9,0 milhões.
 */

import { EstoqueReposicao } from '../types';

/* --------------------------------------------------------------------- */
/* Parâmetros de política                                                 */
/* --------------------------------------------------------------------- */

/** Eventos de consumo a partir dos quais o padrão começa a ser estimável. */
export const MIN_EVENTOS_PARA_MINIMO = 4;
/** Eventos a partir dos quais a estimativa é considerada firme. */
export const EVENTOS_CONFIANCA_ALTA = 12;
/** Acima deste múltiplo do mínimo, o saldo é excesso a revisar. */
export const MULTIPLO_EXCESSO = 3;

/**
 * Fração do consumo total concentrada numa única retirada a partir da qual a
 * demanda deixa de ser fluxo e passa a ser evento de projeto.
 *
 * Acima disso, ponto de reposição estatístico não se aplica: o item é puxado
 * pelo cronograma de produção, não por uma taxa. Dar-lhe um mínimo produziria
 * compra grande para bufferizar um evento que talvez não se repita — e é assim
 * que se acumula estoque morto. Na base atual isso separa 79 dos 305 materiais
 * com demanda suficiente.
 */
export const CONCENTRACAO_PROJETO = 0.4;

/** Fronteiras de Syntetos-Boylan para classificar o padrão de demanda. */
export const ADI_CORTE = 1.32;
export const CV2_CORTE = 0.49;

/* --------------------------------------------------------------------- */
/* Padrão de demanda                                                      */
/* --------------------------------------------------------------------- */

export type PadraoDemanda = 'suave' | 'erratica' | 'intermitente' | 'irregular' | 'sem_demanda';

export const ROTULO_PADRAO: Record<PadraoDemanda, string> = {
  suave: 'Suave',
  erratica: 'Errática',
  intermitente: 'Intermitente',
  irregular: 'Irregular',
  sem_demanda: 'Sem demanda',
};

export const EXPLICACAO_PADRAO: Record<PadraoDemanda, string> = {
  suave: 'Sai com regularidade e em quantidades parecidas. É o único padrão em que a fórmula estatística clássica seria adequada.',
  erratica: 'Sai com regularidade, mas a quantidade varia muito de uma vez para outra.',
  intermitente: 'Fica meses sem sair e volta em quantidades parecidas. Estimar por média diária isolada subestima o pico.',
  irregular: 'Fica meses sem sair e, quando sai, a quantidade varia muito. É o padrão mais difícil de prever.',
  sem_demanda: 'Nenhuma saída registrada desde o início da produção.',
};

export function classificarPadrao(r: EstoqueReposicao): PadraoDemanda {
  if (r.eventos_consumo <= 0) return 'sem_demanda';
  const adi = r.adi;
  const cv2 = r.cv2;
  // Sem ADI ou CV² não há como posicionar nos eixos; com demanda registrada,
  // o caso conservador é o mais difícil de prever.
  if (adi === null || adi === undefined || cv2 === null || cv2 === undefined) return 'irregular';
  if (adi < ADI_CORTE) return cv2 < CV2_CORTE ? 'suave' : 'erratica';
  return cv2 < CV2_CORTE ? 'intermitente' : 'irregular';
}

/* --------------------------------------------------------------------- */
/* Confiança                                                              */
/* --------------------------------------------------------------------- */

export type Confianca = 'alta' | 'media' | 'baixa' | 'nenhuma';

export const ROTULO_CONFIANCA: Record<Confianca, string> = {
  alta: 'Alta',
  media: 'Média',
  baixa: 'Baixa',
  nenhuma: 'Sem base',
};

export function classificarConfianca(r: EstoqueReposicao): Confianca {
  if (r.eventos_consumo <= 0) return 'nenhuma';
  if (r.eventos_consumo >= EVENTOS_CONFIANCA_ALTA) return 'alta';
  if (r.eventos_consumo >= MIN_EVENTOS_PARA_MINIMO) return 'media';
  return 'baixa';
}

/* --------------------------------------------------------------------- */
/* Recomendação                                                           */
/* --------------------------------------------------------------------- */

export type Recomendacao =
  | 'repor_agora'      // abaixo do mínimo: risco de parar a produção
  | 'manter_minimo'    // saldo adequado; o mínimo vira parâmetro de controle
  | 'reduzir'          // muito acima do mínimo: capital preso
  | 'planejar_projeto' // demanda dirigida por evento; planejar pelo cronograma
  | 'sob_demanda'      // demanda rara demais para justificar estoque parado
  | 'revisar_obsoleto' // saldo parado sem nenhuma demanda desde a produção
  | 'sem_acao';        // sem saldo e sem demanda

export interface FaixaRecomendacao {
  id: Recomendacao;
  rotulo: string;
  cor: string;
  /** Ordem de urgência para o comprador. */
  prioridade: number;
}

export const FAIXAS_RECOMENDACAO: Record<Recomendacao, FaixaRecomendacao> = {
  repor_agora:     { id: 'repor_agora',     rotulo: 'Repor agora',        cor: 'var(--status-critical)', prioridade: 0 },
  reduzir:         { id: 'reduzir',         rotulo: 'Reduzir',            cor: 'var(--status-warning)',  prioridade: 1 },
  revisar_obsoleto:{ id: 'revisar_obsoleto',rotulo: 'Revisar obsoleto',   cor: 'var(--status-serious)',  prioridade: 2 },
  manter_minimo:   { id: 'manter_minimo',   rotulo: 'Manter mínimo',      cor: 'var(--status-good)',     prioridade: 3 },
  planejar_projeto:{ id: 'planejar_projeto',rotulo: 'Planejar por projeto',cor: 'var(--series-5)',       prioridade: 4 },
  sob_demanda:     { id: 'sob_demanda',     rotulo: 'Comprar sob demanda',cor: 'var(--series-3)',        prioridade: 5 },
  sem_acao:        { id: 'sem_acao',        rotulo: 'Sem ação',           cor: 'var(--ink-muted)',       prioridade: 6 },
};

/* --------------------------------------------------------------------- */
/* Cálculo                                                                */
/* --------------------------------------------------------------------- */

export interface SugestaoReposicao {
  material: string;
  descricao?: string | null;
  grupo_mercadorias?: string | null;
  umb?: string | null;
  saldo_atual: number;
  valor_estoque: number;
  precoMedio: number | null;

  padrao: PadraoDemanda;
  confianca: Confianca;
  recomendacao: Recomendacao;

  eventos: number;
  consumoDiario: number;
  leadDias: number;
  leadProprio: boolean;
  maiorLote: number;

  /** Nulo quando o método se recusa a estimar (demanda insuficiente). */
  minimoSugerido: number | null;
  /** Parcela de consumo durante o ressuprimento. */
  consumoNoLead: number | null;
  /** Parcela de proteção (maior saque observado). */
  protecao: number | null;
  /** Quanto comprar para voltar ao mínimo. Zero quando o saldo já cobre. */
  compraSugerida: number | null;
  /** Valor da compra sugerida, quando há preço médio. */
  valorCompraSugerida: number | null;
  /** Dias que o mínimo cobre no ritmo atual. */
  diasCobertosPeloMinimo: number | null;

  explicacao: string;
}

const arred = (v: number): number => Math.round(v * 100) / 100;

/**
 * Converte os fatos medidos em sugestão + explicação.
 *
 * A explicação é gerada junto com o número de propósito: um mínimo sem a
 * conta à vista é ordem para obedecer; com a conta à vista é argumento que o
 * comprador pode conferir e contestar.
 */
export function calcularSugestao(r: EstoqueReposicao): SugestaoReposicao {
  const saldo = r.saldo_atual ?? 0;
  const consumoDiario = r.consumo_diario ?? 0;
  const leadDias = r.lead_dias ?? 0;
  const maiorLote = r.maior_lote ?? 0;
  const padrao = classificarPadrao(r);
  const confianca = classificarConfianca(r);

  const base = {
    material: r.material,
    descricao: r.descricao,
    grupo_mercadorias: r.grupo_mercadorias,
    umb: r.umb,
    saldo_atual: saldo,
    valor_estoque: r.valor_estoque ?? 0,
    precoMedio: r.preco_medio ?? null,
    padrao,
    confianca,
    eventos: r.eventos_consumo,
    consumoDiario,
    leadDias,
    leadProprio: r.lead_proprio,
    maiorLote,
  };

  const origemLead = r.lead_proprio
    ? `lead time de ${fmt(leadDias)} dias medido em ${r.lead_amostras} compra(s) deste material`
    : `lead time de ${fmt(leadDias)} dias (mediana da fábrica — este material não tem compra rastreável)`;

  // Sem nenhuma demanda desde o início da produção.
  if (r.eventos_consumo <= 0) {
    const temSaldo = saldo > 0;
    return {
      ...base,
      recomendacao: temSaldo ? 'revisar_obsoleto' : 'sem_acao',
      minimoSugerido: null, consumoNoLead: null, protecao: null,
      compraSugerida: null, valorCompraSugerida: null, diasCobertosPeloMinimo: null,
      explicacao: temSaldo
        ? `Nenhuma saída desde o início da produção, mas há ${fmt(saldo)} ${r.umb || 'un'} em estoque. `
          + `Não há demanda que justifique estoque mínimo — o caso aqui é inventário físico e decisão sobre obsolescência, não reposição.`
        : `Sem saldo e sem nenhuma saída desde o início da produção. Nada a repor nem a revisar.`,
    };
  }

  // Demanda existe, mas rara demais para estimar um padrão.
  if (r.eventos_consumo < MIN_EVENTOS_PARA_MINIMO) {
    return {
      ...base,
      recomendacao: 'sob_demanda',
      minimoSugerido: null, consumoNoLead: null, protecao: null,
      compraSugerida: null, valorCompraSugerida: null, diasCobertosPeloMinimo: null,
      explicacao: `Apenas ${r.eventos_consumo} saída(s) desde o início da produção — pouco para estimar um padrão de consumo. `
        + `Fixar um mínimo aqui seria chute com aparência de cálculo, e é assim que se acumula estoque parado. `
        + `Recomendação: comprar quando surgir a necessidade, considerando ${origemLead}. `
        + `Saldo atual: ${fmt(saldo)} ${r.umb || 'un'}.`,
    };
  }

  // Demanda dirigida por evento de projeto: uma única retirada responde por
  // boa parte de tudo que saiu. Um ponto de reposição aqui mandaria comprar
  // grande para bufferizar um evento que talvez não se repita.
  const concentracao = r.concentracao_maior_lote ?? 0;
  if (concentracao >= CONCENTRACAO_PROJETO) {
    return {
      ...base,
      recomendacao: 'planejar_projeto',
      minimoSugerido: null, consumoNoLead: null, protecao: null,
      compraSugerida: null, valorCompraSugerida: null, diasCobertosPeloMinimo: null,
      explicacao: `Uma única retirada de ${fmt(maiorLote)} ${r.umb || 'un'} responde por `
        + `${Math.round(concentracao * 100)}% de tudo que saiu desde o início da produção — `
        + `a demanda é puxada por evento de projeto, não por um ritmo constante. `
        + `Ponto de reposição não se aplica: definir mínimo aqui mandaria comprar grande para cobrir `
        + `um evento que pode não se repetir. O caminho é planejar contra o cronograma de produção, `
        + `com ${origemLead}. Saldo atual: ${fmt(saldo)} ${r.umb || 'un'}.`,
    };
  }

  // Há base suficiente: calcula o mínimo.
  // Proteção pelo p90 e não pelo máximo — o máximo persegue o outlier isolado
  // e infla o mínimo de item caro. Cai para o máximo se o p90 não vier.
  const consumoNoLead = arred(consumoDiario * leadDias);
  const protecao = arred(r.lote_p90 ?? maiorLote);
  const minimo = arred(consumoNoLead + protecao);
  const compra = saldo < minimo ? arred(minimo - saldo) : 0;
  const diasCobertos = consumoDiario > 0 ? arred(minimo / consumoDiario) : null;

  let recomendacao: Recomendacao;
  if (saldo < minimo) recomendacao = 'repor_agora';
  else if (minimo > 0 && saldo > minimo * MULTIPLO_EXCESSO) recomendacao = 'reduzir';
  else recomendacao = 'manter_minimo';

  const ressalvaConfianca = confianca === 'media'
    ? ` Base ainda curta (${r.eventos_consumo} saídas): revise o número quando houver mais histórico.`
    : '';

  const veredito =
    recomendacao === 'repor_agora'
      ? `O saldo de ${fmt(saldo)} está ABAIXO do mínimo — comprar ${fmt(compra)} ${r.umb || 'un'} para recompor.`
      : recomendacao === 'reduzir'
        ? `O saldo de ${fmt(saldo)} é mais de ${MULTIPLO_EXCESSO}x o mínimo — há capital parado além do necessário.`
        : `O saldo de ${fmt(saldo)} cobre o mínimo.`;

  return {
    ...base,
    recomendacao,
    minimoSugerido: minimo,
    consumoNoLead,
    protecao,
    compraSugerida: compra,
    valorCompraSugerida: r.preco_medio ? arred(compra * r.preco_medio) : null,
    diasCobertosPeloMinimo: diasCobertos,
    explicacao:
      `Mínimo de ${fmt(minimo)} ${r.umb || 'un'} = ${fmt(consumoNoLead)} de consumo durante a reposição `
      + `(${fmt(consumoDiario)}/dia × ${fmt(leadDias)} dias) + ${fmt(protecao)} de proteção. `
      + `A proteção cobre 9 de cada 10 saídas observadas (a maior foi ${fmt(maiorLote)}) — com demanda `
      + `${ROTULO_PADRAO[padrao].toLowerCase()}, o risco real é um saque grande de uma vez, não uma `
      + `variação suave; usar a maior saída como buffer permanente inflaria o estoque por um evento isolado. `
      + `Baseado em ${r.eventos_consumo} saídas desde o início da produção e ${origemLead}. `
      + veredito + ressalvaConfianca,
  };
}

function fmt(v: number): string {
  return v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}

/* --------------------------------------------------------------------- */
/* Agregação                                                              */
/* --------------------------------------------------------------------- */

export interface ResumoReposicao {
  recomendacao: Recomendacao;
  rotulo: string;
  cor: string;
  materiais: number;
  /** Investimento necessário para recompor os itens abaixo do mínimo. */
  valorCompra: number;
  /** Capital preso nos itens acima do necessário. */
  valorEstoque: number;
}

export function resumirReposicao(sugestoes: SugestaoReposicao[]): ResumoReposicao[] {
  const mapa = new Map<Recomendacao, ResumoReposicao>();
  (Object.keys(FAIXAS_RECOMENDACAO) as Recomendacao[]).forEach(id => {
    const f = FAIXAS_RECOMENDACAO[id];
    mapa.set(id, { recomendacao: id, rotulo: f.rotulo, cor: f.cor, materiais: 0, valorCompra: 0, valorEstoque: 0 });
  });

  sugestoes.forEach(s => {
    const r = mapa.get(s.recomendacao)!;
    r.materiais += 1;
    r.valorCompra += s.valorCompraSugerida ?? 0;
    r.valorEstoque += s.valor_estoque;
  });

  return Array.from(mapa.values())
    .filter(r => r.materiais > 0)
    .sort((a, b) => FAIXAS_RECOMENDACAO[a.recomendacao].prioridade - FAIXAS_RECOMENDACAO[b.recomendacao].prioridade);
}
