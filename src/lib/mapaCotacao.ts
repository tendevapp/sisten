/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Mapa comparativo de cotações — lógica pura: montar a matriz
 * item × fornecedor a partir das propostas já salvas, o modelo de custo que
 * transforma preço cotado em desembolso efetivo (IPI somado, ICMS/PIS/COFINS
 * creditados quando o regime permite, frete) e os cenários de compra que o
 * comprador compara antes de decidir.
 *
 * O agrupamento tem duas fontes, nesta ordem:
 *  1. o vínculo com o item de RM (`processo_item_id`) — quando existe, é
 *     verdade declarada e ganha de qualquer heurística;
 *  2. similaridade de descrição, para as cotações avulsas (sem escopo de RM)
 *     e para os itens que ninguém vinculou. Sem isso a matriz vira uma lista
 *     diagonal: cada fornecedor numa linha só sua, comparando nada.
 *
 * Nada aqui importa de `db/` — é a camada com cobertura de teste
 * (`mapaCotacao.test.ts`).
 */

import { normalizarDescricao } from './cotacoes';
import type { CotacaoProcessoItem, CotacaoPropostaDraft, CotacaoPropostaItemDraft } from '../types';

// =====================================================================
// Similaridade de descrição
// =====================================================================

/**
 * Palavras que aparecem em quase toda descrição de material e por isso não
 * distinguem nada. `X` entra na lista porque é separador de dimensão
 * ("19MM X 20M"), não conteúdo.
 */
const STOPWORDS = new Set([
  'DE', 'DA', 'DO', 'DAS', 'DOS', 'E', 'COM', 'SEM', 'PARA', 'EM', 'A', 'O', 'AS', 'OS',
  'P', 'X', 'OU', 'NO', 'NA', 'TIPO', 'MARCA', 'MODELO', 'REF', 'COD', 'UN', 'UND',
  'UNID', 'UNIDADE', 'PC', 'PCS', 'PECA', 'PECAS', 'CX', 'CJ', 'ITEM',
]);

/** Unidades que grudam no número anterior: "19 MM" e "19MM" têm que virar o mesmo token. */
const UNIDADES = new Set([
  'MM', 'CM', 'M', 'KM', 'KG', 'G', 'MG', 'T', 'L', 'ML', 'V', 'W', 'KW', 'A', 'MA',
  'CV', 'HP', 'POL', 'POLEGADAS', 'BAR', 'PSI', 'RPM', 'AH', 'VA', 'KVA', 'MCA', 'GB', 'MB',
]);

/**
 * Quebra a descrição em tokens comparáveis. Preserva medidas ("19MM",
 * "1/2", "12V") porque são justamente o que separa dois materiais que, em
 * texto, são a mesma coisa — fita isolante de 19mm e de 12mm.
 */
export function tokensDescricao(descricao: string | null | undefined): string[] {
  if (!descricao) return [];
  const base = normalizarDescricao(String(descricao))
    .replace(/[^A-Z0-9/.,]+/g, ' ')
    .replace(/,(\d)/g, '.$1')      // "19,5" -> "19.5"
    .replace(/[.,](?!\d)/g, ' ')   // ponto/vírgula que não é decimal é pontuação
    .trim();
  if (!base) return [];

  const brutos = base.split(/\s+/).filter(Boolean);
  const tokens: string[] = [];
  for (let i = 0; i < brutos.length; i++) {
    const t = brutos[i];
    const proximo = brutos[i + 1];
    // "19" + "MM" -> "19MM"
    if (/^\d+(\.\d+)?$/.test(t) && proximo && UNIDADES.has(proximo)) {
      tokens.push(`${t}${proximo}`);
      i++;
      continue;
    }
    tokens.push(t);
  }

  return tokens
    .filter(t => {
      if (STOPWORDS.has(t)) return false;
      if (/\d/.test(t)) return true;      // qualquer coisa com número é medida, sempre relevante
      return t.length >= 3;
    })
    .map(singularizar);
}

/**
 * Plural cru: cada fornecedor escreve "PILHA" ou "PILHAS", "PARAFUSO" ou
 * "PARAFUSOS", e sem isso as duas linhas nunca se encontram. Só a partir de
 * 4 letras para não comer palavra curta legítima ("GAS", "INOX").
 */
function singularizar(token: string): string {
  if (/\d/.test(token)) return token;
  return token.length >= 4 && token.endsWith('S') ? token.slice(0, -1) : token;
}

const ehMedida = (t: string) => /\d/.test(t);

function dice(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let comuns = 0;
  for (const t of a) if (b.has(t)) comuns++;
  return (2 * comuns) / (a.size + b.size);
}

/**
 * Similaridade 0..1 entre duas descrições de material.
 *
 * A conta é dominada pelo texto (o que a coisa É) e só ajustada pelas
 * medidas (qual variante da coisa), porque as duas falham de formas
 * opostas e o mapa não sobrevive a nenhuma delas:
 *
 * - se a medida pesasse como texto, "FITA ISOLANTE 19MM" e "FITA DUPLA FACE
 *   19MM" — que só têm em comum a palavra FITA e a largura — cairiam na
 *   mesma linha, e o comprador compararia o preço de dois produtos
 *   diferentes achando que compara fornecedores;
 * - se a medida fosse ignorada, "FITA ISOLANTE 19MM" e "FITA ISOLANTE 12MM"
 *   seriam idênticas.
 *
 * Daí: score = Dice do texto, +10% quando as medidas batem, ×0,5 quando os
 * dois lados declaram medida e nenhuma coincide. Erra deliberadamente para o
 * lado de separar demais — separar a mais custa um clique de "juntar
 * linhas"; juntar a mais custa uma decisão de compra errada.
 */
export function similaridadeDescricao(a: string | null | undefined, b: string | null | undefined): number {
  const ta = tokensDescricao(a);
  const tb = tokensDescricao(b);
  if (ta.length === 0 || tb.length === 0) return 0;

  const setA = new Set(ta);
  const setB = new Set(tb);

  const textoA = new Set([...setA].filter(t => !ehMedida(t)));
  const textoB = new Set([...setB].filter(t => !ehMedida(t)));
  const medidasA = new Set([...setA].filter(ehMedida));
  const medidasB = new Set([...setB].filter(ehMedida));

  // Descrição que é só medida (raro, mas acontece em item tipo "1/2 X 3/4"):
  // sem texto para comparar, compara o conjunto inteiro.
  const base = textoA.size === 0 || textoB.size === 0 ? dice(setA, setB) : dice(textoA, textoB);

  if (medidasA.size === 0 || medidasB.size === 0) return base;

  const concordancia = dice(medidasA, medidasB);
  if (concordancia === 0) return base * 0.5;
  return Math.min(1, base + 0.1 * concordancia);
}

/** Similaridade entre dois itens cotados: código de produto igual é prova, não pista; senão cai na descrição. */
export function similaridadeItens(a: CotacaoPropostaItemDraft, b: CotacaoPropostaItemDraft): number {
  const ca = (a.codigo_produto ?? '').trim().toUpperCase();
  const cb = (b.codigo_produto ?? '').trim().toUpperCase();
  if (ca && ca === cb) return 1;
  return similaridadeDescricao(a.descricao_produto, b.descricao_produto);
}

/** Acima disto dois itens vão para a mesma linha da matriz. Calibrado para errar para o lado de separar demais. */
export const LIMIAR_SIMILARIDADE_PADRAO = 0.55;

// =====================================================================
// Modelo de custo
// =====================================================================

export interface OpcoesCusto {
  /** O IPI destacado na proposta é somado ao preço (padrão de mercado: o preço cotado vem sem IPI). */
  ipiSomado: boolean;
  /** A empresa credita o ICMS destacado — não credita em compra para uso/consumo, o caso mais comum em obra. */
  creditaIcms: boolean;
  creditaPisCofins: boolean;
  /** Só quem é contribuinte de IPI credita — raro fora de indústria. */
  creditaIpi: boolean;
  /** Rateia o frete da proposta entre os itens, proporcional ao valor, só para a comparação célula a célula. */
  ratearFrete: boolean;
}

export const OPCOES_CUSTO_PADRAO: OpcoesCusto = {
  ipiSomado: true,
  creditaIcms: false,
  creditaPisCofins: false,
  creditaIpi: false,
  ratearFrete: true,
};

/**
 * As três perguntas que o comprador faz, nesta ordem, e que o mapa responde
 * trocando a base da matriz inteira:
 *
 * - `cotado`     — "quem cotou mais barato?" O número da proposta, cru, sem
 *                  nada somado: é o que o comprador confere contra o PDF.
 * - `desembolso` — "quanto sai do caixa?" Soma o IPI destacado e o frete.
 *                  É o padrão, porque é a pergunta que decide a compra.
 * - `liquido`    — "quanto custa de verdade?" Desconta os tributos que a
 *                  empresa recupera como crédito. Muda o vencedor quando os
 *                  fornecedores estão em regimes ou UFs diferentes.
 */
export type BaseComparacao = 'cotado' | 'desembolso' | 'liquido';

export interface CreditosHabilitados {
  icms: boolean;
  pisCofins: boolean;
  ipi: boolean;
}

export function opcoesDaBase(base: BaseComparacao, creditos: CreditosHabilitados): OpcoesCusto {
  if (base === 'cotado') {
    return { ipiSomado: false, creditaIcms: false, creditaPisCofins: false, creditaIpi: false, ratearFrete: false };
  }
  return {
    ipiSomado: true,
    ratearFrete: true,
    creditaIcms: base === 'liquido' && creditos.icms,
    creditaPisCofins: base === 'liquido' && creditos.pisCofins,
    creditaIpi: base === 'liquido' && creditos.ipi,
  };
}

export interface CustoItem {
  quantidade: number | null;
  precoUnitario: number | null;
  /** preço × quantidade, como o fornecedor cotou. */
  bruto: number | null;
  ipi: number;
  creditoIcms: number;
  creditoPisCofins: number;
  creditoIpi: number;
  creditos: number;
  /** Desembolso do item, sem frete: bruto + IPI − créditos. É o número que compara duas propostas. */
  liquido: number | null;
  /** Parcela do frete da proposta atribuída a este item (proporcional ao valor). */
  freteRateado: number;
  /** `liquido` + frete rateado quando a opção está ligada — o que a célula exibe e ordena. */
  comparavel: number | null;
  unitarioComparavel: number | null;
  /** `true` quando faltou preço ou quantidade: a célula existe mas não entra em conta nenhuma. */
  incompleto: boolean;
}

const fracao = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? 0 : v / 100);

/** Valor bruto de um item cotado — usa `preco_total_item` quando o fornecedor informou, senão preço × qtd. */
export function brutoDoItem(item: CotacaoPropostaItemDraft): number | null {
  if (item.preco_total_item != null) return item.preco_total_item;
  if (item.preco_unitario != null && item.quantidade != null) return item.preco_unitario * item.quantidade;
  return null;
}

export function calcularCustoItem(
  item: CotacaoPropostaItemDraft,
  opcoes: OpcoesCusto,
  freteRateado = 0,
): CustoItem {
  const bruto = brutoDoItem(item);
  const incompleto = bruto == null;

  const base = bruto ?? 0;
  const ipi = opcoes.ipiSomado ? base * fracao(item.aliquota_ipi_pct) : 0;
  const creditoIcms = opcoes.creditaIcms ? base * fracao(item.aliquota_icms_pct) : 0;
  const creditoPisCofins = opcoes.creditaPisCofins
    ? base * (fracao(item.aliquota_pis_pct) + fracao(item.aliquota_cofins_pct))
    : 0;
  const creditoIpi = opcoes.creditaIpi ? ipi : 0;
  const creditos = creditoIcms + creditoPisCofins + creditoIpi;

  const liquido = incompleto ? null : base + ipi - creditos;
  const comparavel = liquido == null ? null : liquido + (opcoes.ratearFrete ? freteRateado : 0);
  const qtd = item.quantidade;

  return {
    quantidade: qtd,
    precoUnitario: item.preco_unitario,
    bruto,
    ipi,
    creditoIcms,
    creditoPisCofins,
    creditoIpi,
    creditos,
    liquido,
    freteRateado,
    comparavel,
    unitarioComparavel: comparavel != null && qtd != null && qtd !== 0 ? comparavel / qtd : null,
    incompleto,
  };
}

// =====================================================================
// Matriz
// =====================================================================

export type OrigemLinha = 'escopo' | 'similaridade' | 'manual';

export interface CelulaMapa {
  propostaKey: string;
  item: CotacaoPropostaItemDraft;
  custo: CustoItem;
  /** Confiança do agrupamento (1 quando veio de vínculo com RM ou de código de produto igual). */
  score: number;
  /** Diferença percentual para a melhor célula da linha; 0 na melhor, `null` quando não dá para comparar. */
  deltaPct: number | null;
  melhor: boolean;
}

export interface LinhaMapa {
  key: string;
  origem: OrigemLinha;
  titulo: string;
  ri: string | null;
  materialCode: string | null;
  processoItemId: string | null;
  qtdSolicitada: number | null;
  unidade: string | null;
  celulas: CelulaMapa[];
  /** Menor confiança de agrupamento da linha — abaixo de 1 o comprador precisa conferir se é o mesmo material. */
  confiancaMinima: number;
  melhorCusto: number | null;
  piorCusto: number | null;
  /** Quanto se ganha comprando a melhor oferta em vez da pior desta linha. */
  dispersao: number | null;
  /** Quantidades divergentes entre fornecedores (ou contra a RM) — comparar total de quantidades diferentes engana. */
  quantidadeDivergente: boolean;
  unidadeDivergente: boolean;
}

/** Uma proposta como o mapa a enxerga. */
export interface PropostaMapa {
  key: string;
  proposta: CotacaoPropostaDraft;
}

function tituloDoItem(item: CotacaoPropostaItemDraft): string {
  return (item.descricao_produto || item.codigo_produto || 'Item sem descrição').trim();
}

/** Soma o valor bruto de uma proposta — base do rateio de frete. */
function brutoDaProposta(p: CotacaoPropostaDraft): number {
  return p.itens.reduce((soma, it) => soma + (brutoDoItem(it) ?? 0), 0);
}

export interface ParamsAgrupamento {
  escopo: CotacaoProcessoItem[];
  propostas: PropostaMapa[];
  opcoes: OpcoesCusto;
  limiar?: number;
  /** Correções manuais do comprador: chave do item cotado -> chave da linha em que ele deve ficar. */
  overrides?: Record<string, string>;
  /** Frete por proposta informado no mapa. */
  fretePorProposta?: Record<string, number | null>;
}

interface LinhaEmMontagem {
  key: string;
  origem: OrigemLinha;
  titulo: string;
  ri: string | null;
  materialCode: string | null;
  processoItemId: string | null;
  qtdSolicitada: number | null;
  unidade: string | null;
  celulas: { propostaKey: string; item: CotacaoPropostaItemDraft; score: number }[];
}

/**
 * Monta as linhas da matriz. Cada linha aceita no máximo um item por
 * proposta — dois itens do mesmo fornecedor na mesma linha significariam
 * "este fornecedor cotou o mesmo material duas vezes", que na prática é
 * agrupamento errado; o segundo abre linha nova e o comprador reconcilia.
 */
export function agruparLinhasMapa(params: ParamsAgrupamento): LinhaMapa[] {
  const { escopo, propostas, opcoes } = params;
  const limiar = params.limiar ?? LIMIAR_SIMILARIDADE_PADRAO;
  const overrides = params.overrides ?? {};

  const linhas: LinhaEmMontagem[] = escopo.map(e => ({
    key: `esc:${e.id}`,
    origem: 'escopo' as OrigemLinha,
    titulo: e.texto_breve || e.material_code || e.ri,
    ri: e.ri,
    materialCode: e.material_code,
    processoItemId: e.id,
    qtdSolicitada: e.qtd_solicitada,
    unidade: e.unidade_medida,
    celulas: [],
  }));
  const porChave = new Map(linhas.map(l => [l.key, l]));

  const novaLinha = (key: string, origem: OrigemLinha, item: CotacaoPropostaItemDraft): LinhaEmMontagem => {
    const linha: LinhaEmMontagem = {
      key,
      origem,
      titulo: tituloDoItem(item),
      ri: item.ri,
      materialCode: item.material_code,
      processoItemId: item.processo_item_id,
      qtdSolicitada: item.quantidade,
      unidade: item.unidade_medida,
      celulas: [],
    };
    linhas.push(linha);
    porChave.set(key, linha);
    return linha;
  };

  const temProposta = (l: LinhaEmMontagem, propostaKey: string) => l.celulas.some(c => c.propostaKey === propostaKey);

  for (const { key: propostaKey, proposta } of propostas) {
    for (const item of proposta.itens) {
      // Item desconsiderado não existe para o mapa: não abre linha, não
      // ocupa a coluna do fornecedor e não disputa o menor preço.
      if (item.desconsiderado) continue;

      // 1. Correção manual do comprador ganha de tudo.
      const alvo = overrides[item._key];
      if (alvo) {
        const linha = porChave.get(alvo) ?? novaLinha(alvo, 'manual', item);
        if (!temProposta(linha, propostaKey)) {
          linha.celulas.push({ propostaKey, item, score: 1 });
          continue;
        }
      }

      // 2. Vínculo com o item de RM — verdade declarada, não heurística.
      if (item.processo_item_id) {
        const chave = `esc:${item.processo_item_id}`;
        const linha = porChave.get(chave) ?? novaLinha(chave, 'escopo', item);
        if (!temProposta(linha, propostaKey)) {
          linha.celulas.push({ propostaKey, item, score: 1 });
          continue;
        }
      }

      // 3. Similaridade contra as linhas que ainda não têm este fornecedor.
      let melhorLinha: LinhaEmMontagem | null = null;
      let melhorScore = 0;
      for (const linha of linhas) {
        if (temProposta(linha, propostaKey)) continue;
        let score = linha.celulas.length > 0
          ? Math.max(...linha.celulas.map(c => similaridadeItens(c.item, item)))
          : 0;
        if (linha.origem === 'escopo') {
          // Linha de RM ainda sem oferta: compara contra o texto da própria RM.
          score = Math.max(score, similaridadeDescricao(linha.titulo, item.descricao_produto));
        }
        if (score > melhorScore) { melhorScore = score; melhorLinha = linha; }
      }

      if (melhorLinha && melhorScore >= limiar) {
        melhorLinha.celulas.push({ propostaKey, item, score: melhorScore });
      } else {
        novaLinha(`sim:${item._key}`, 'similaridade', item).celulas.push({ propostaKey, item, score: 1 });
      }
    }
  }

  // Frete rateado por proposta, proporcional ao valor bruto de cada item.
  // Quando o comprador ainda não informou o frete cotado, cada item entra com
  // o frete teórico que a tabela da Bahia Sul previu pelo peso (só existe em
  // proposta FOB) — sem isso, a proposta FOB aparece artificialmente mais
  // barata que a CIF na mesma matriz.
  const rateio = new Map<string, number>();
  const usaFreteTeorico = new Set<string>();
  for (const { key, proposta } of propostas) {
    const frete = params.fretePorProposta?.[key] ?? null;
    const total = brutoDaProposta(proposta);
    rateio.set(key, frete != null && total > 0 ? frete / total : 0);
    if (frete == null) usaFreteTeorico.add(key);
  }

  const resultado: LinhaMapa[] = linhas
    .filter(l => l.celulas.length > 0 || l.origem === 'escopo')
    .map(l => {
      const celulas: CelulaMapa[] = l.celulas.map(c => {
        const fator = rateio.get(c.propostaKey) ?? 0;
        const frete = usaFreteTeorico.has(c.propostaKey)
          ? (c.item.frete_teorico ?? 0)
          : (brutoDoItem(c.item) ?? 0) * fator;
        const custo = calcularCustoItem(c.item, opcoes, frete);
        return { propostaKey: c.propostaKey, item: c.item, custo, score: c.score, deltaPct: null, melhor: false };
      });

      const comparaveis = celulas.map(c => c.custo.comparavel).filter((n): n is number => n != null && n > 0);
      const melhorCusto = comparaveis.length ? Math.min(...comparaveis) : null;
      const piorCusto = comparaveis.length ? Math.max(...comparaveis) : null;

      for (const c of celulas) {
        if (c.custo.comparavel == null || melhorCusto == null || melhorCusto === 0) continue;
        c.deltaPct = ((c.custo.comparavel - melhorCusto) / melhorCusto) * 100;
        c.melhor = c.custo.comparavel === melhorCusto;
      }

      const qtds = new Set(celulas.map(c => c.custo.quantidade).filter((q): q is number => q != null));
      if (l.qtdSolicitada != null && l.origem === 'escopo') qtds.add(l.qtdSolicitada);
      const unidades = new Set(
        celulas.map(c => (c.item.unidade_medida ?? '').trim().toUpperCase()).filter(Boolean),
      );

      return {
        key: l.key,
        origem: l.origem,
        titulo: l.titulo,
        ri: l.ri,
        materialCode: l.materialCode,
        processoItemId: l.processoItemId,
        qtdSolicitada: l.qtdSolicitada,
        unidade: l.unidade,
        celulas,
        confiancaMinima: celulas.length ? Math.min(...celulas.map(c => c.score)) : 1,
        melhorCusto,
        piorCusto,
        dispersao: melhorCusto != null && piorCusto != null ? piorCusto - melhorCusto : null,
        quantidadeDivergente: qtds.size > 1,
        unidadeDivergente: unidades.size > 1,
      };
    });

  // Ordem interna estável (RM antes de similaridade, mais disputadas
  // primeiro): serve de desempate e de base para quem ainda não escolheu uma
  // ordenação — a ordem que a tela realmente usa é `ordenarLinhas`, abaixo.
  return resultado.sort((a, b) => {
    if (a.origem === 'escopo' && b.origem !== 'escopo') return -1;
    if (b.origem === 'escopo' && a.origem !== 'escopo') return 1;
    if (a.origem === 'escopo' && b.origem === 'escopo') return (a.ri ?? '').localeCompare(b.ri ?? '');
    if (b.celulas.length !== a.celulas.length) return b.celulas.length - a.celulas.length;
    return a.titulo.localeCompare(b.titulo);
  });
}

/** Como a matriz pode ser ordenada — escolha do comprador, alfabética por padrão. */
export type OrdenacaoMapa = 'alfabetica' | 'disputa' | 'dispersao' | 'ri';

/** Reordena as linhas já montadas por `agruparLinhasMapa`, sem afetar o agrupamento em si. */
export function ordenarLinhas(linhas: LinhaMapa[], modo: OrdenacaoMapa): LinhaMapa[] {
  const porTitulo = (a: LinhaMapa, b: LinhaMapa) => a.titulo.localeCompare(b.titulo, 'pt-BR', { sensitivity: 'base' });
  const copia = [...linhas];

  switch (modo) {
    case 'disputa':
      return copia.sort((a, b) => b.celulas.length - a.celulas.length || porTitulo(a, b));
    case 'dispersao':
      return copia.sort((a, b) => (b.dispersao ?? -1) - (a.dispersao ?? -1) || porTitulo(a, b));
    case 'ri':
      // RI vazio ('￿' força pro fim) — cotação avulsa sem RM fica depois de quem tem.
      return copia.sort((a, b) => (a.ri || '￿').localeCompare(b.ri || '￿') || porTitulo(a, b));
    case 'alfabetica':
    default:
      return copia.sort(porTitulo);
  }
}

// =====================================================================
// Resumo por fornecedor
// =====================================================================

export interface ResumoFornecedor {
  propostaKey: string;
  nome: string;
  cnpj: string | null;
  /** Linhas do mapa que este fornecedor cotou, sobre o total de linhas. */
  itensCotados: number;
  totalLinhas: number;
  cobertura: number;
  /** Em quantas linhas é a melhor oferta. */
  melhorEm: number;
  totalBruto: number;
  totalIpi: number;
  totalCreditos: number;
  /** Soma dos itens sem frete (bruto + IPI − créditos). */
  totalLiquido: number;
  frete: number | null;
  /** `totalLiquido` + frete — o desembolso se comprar tudo deste fornecedor. */
  totalComFrete: number;
  prazoEntregaDias: number | null;
  condicaoPagamento: string | null;
  /** Dias até a proposta vencer; negativo = vencida; `null` = sem data de validade. */
  validadeDias: number | null;
  faturamentoMinimo: number | null;
  /** `null` quando o fornecedor não impõe mínimo. */
  atingeFaturamentoMinimo: boolean | null;
}

export function diasAteValidade(validadeISO: string | null, hojeISO?: string): number | null {
  if (!validadeISO) return null;
  const hoje = hojeISO ?? new Date().toISOString().slice(0, 10);
  const ms = Date.parse(`${validadeISO}T00:00:00Z`) - Date.parse(`${hoje}T00:00:00Z`);
  if (!Number.isFinite(ms)) return null;
  return Math.round(ms / 86_400_000);
}

export function resumirFornecedores(params: {
  linhas: LinhaMapa[];
  propostas: PropostaMapa[];
  fretePorProposta?: Record<string, number | null>;
  hojeISO?: string;
}): ResumoFornecedor[] {
  const { linhas, propostas } = params;

  return propostas.map(({ key, proposta }) => {
    const celulas = linhas.flatMap(l => l.celulas.filter(c => c.propostaKey === key));
    const totalBruto = celulas.reduce((s, c) => s + (c.custo.bruto ?? 0), 0);
    const totalIpi = celulas.reduce((s, c) => s + c.custo.ipi, 0);
    const totalCreditos = celulas.reduce((s, c) => s + c.custo.creditos, 0);
    const totalLiquido = celulas.reduce((s, c) => s + (c.custo.liquido ?? 0), 0);
    // Sem frete cotado, o resumo mostra a soma do frete teórico das células —
    // é o mesmo número que entrou em cada custo comparável da coluna.
    const freteTeorico = celulas.reduce((s, c) => s + c.custo.freteRateado, 0);
    const freteInformado = params.fretePorProposta?.[key] ?? null;
    const frete = freteInformado ?? (freteTeorico > 0 ? freteTeorico : null);
    const minimo = proposta.faturamento_minimo;

    return {
      propostaKey: key,
      nome: proposta.fornecedor_razao_social || 'Fornecedor não identificado',
      cnpj: proposta.fornecedor_cnpj,
      itensCotados: celulas.length,
      totalLinhas: linhas.length,
      cobertura: linhas.length > 0 ? celulas.length / linhas.length : 0,
      melhorEm: celulas.filter(c => c.melhor).length,
      totalBruto,
      totalIpi,
      totalCreditos,
      totalLiquido,
      frete,
      totalComFrete: totalLiquido + (frete ?? 0),
      prazoEntregaDias: proposta.prazo_entrega_dias,
      condicaoPagamento: proposta.condicao_pagamento,
      validadeDias: diasAteValidade(proposta.validade_data, params.hojeISO),
      faturamentoMinimo: minimo,
      atingeFaturamentoMinimo: minimo == null || minimo === 0 ? null : totalBruto >= minimo,
    };
  });
}

// =====================================================================
// Cenários de compra
// =====================================================================

export interface ParcelaCenario {
  propostaKey: string;
  nome: string;
  itens: number;
  subtotal: number;
  frete: number;
  total: number;
  /** Fornecedor exige faturamento mínimo que esta parcela não atinge. */
  abaixoDoMinimo: boolean;
}

export interface Cenario {
  id: 'menor_preco' | 'fornecedor_unico' | 'selecao';
  nome: string;
  descricao: string;
  itensAtendidos: number;
  totalLinhas: number;
  parcelas: ParcelaCenario[];
  total: number;
  alertas: string[];
}

/**
 * Total exato de um conjunto de células escolhidas. O frete NÃO é rateado
 * aqui: frete é custo fixo por fornecedor — quem compra 2 dos 6 itens paga o
 * frete inteiro do mesmo jeito. O rateio de `CustoItem.freteRateado` serve
 * só para a comparação célula a célula não premiar quem esconde custo no
 * frete.
 */
function montarCenario(
  id: Cenario['id'],
  nome: string,
  descricao: string,
  escolhidas: CelulaMapa[],
  linhas: LinhaMapa[],
  resumos: ResumoFornecedor[],
): Cenario {
  const porFornecedor = new Map<string, CelulaMapa[]>();
  for (const c of escolhidas) {
    const lista = porFornecedor.get(c.propostaKey) ?? [];
    lista.push(c);
    porFornecedor.set(c.propostaKey, lista);
  }

  const parcelas: ParcelaCenario[] = [...porFornecedor.entries()].map(([propostaKey, celulas]) => {
    const resumo = resumos.find(r => r.propostaKey === propostaKey);
    const subtotal = celulas.reduce((s, c) => s + (c.custo.liquido ?? 0), 0);
    const bruto = celulas.reduce((s, c) => s + (c.custo.bruto ?? 0), 0);
    const frete = resumo?.frete ?? 0;
    const minimo = resumo?.faturamentoMinimo ?? null;
    return {
      propostaKey,
      nome: resumo?.nome ?? 'Fornecedor',
      itens: celulas.length,
      subtotal,
      frete,
      total: subtotal + frete,
      abaixoDoMinimo: minimo != null && minimo > 0 && bruto < minimo,
    };
  }).sort((a, b) => b.total - a.total);

  const escolhidasSet = new Set(escolhidas);
  const linhasAtendidas = linhas.filter(l => l.celulas.some(c => escolhidasSet.has(c))).length;

  const alertas: string[] = [];
  const semOferta = linhas.length - linhasAtendidas;
  if (semOferta > 0) {
    alertas.push(`${semOferta} ${semOferta === 1 ? 'item fica' : 'itens ficam'} sem fornecedor neste cenário.`);
  }
  for (const p of parcelas) {
    if (p.abaixoDoMinimo) alertas.push(`${p.nome} exige faturamento mínimo acima do valor desta compra.`);
  }
  if (parcelas.length > 1) {
    alertas.push(`Compra dividida entre ${parcelas.length} fornecedores — ${parcelas.length} pedidos e ${parcelas.length} fretes.`);
  }

  return {
    id,
    nome,
    descricao,
    itensAtendidos: linhasAtendidas,
    totalLinhas: linhas.length,
    parcelas,
    total: parcelas.reduce((s, p) => s + p.total, 0),
    alertas,
  };
}

/** Melhor preço item a item, aceitando dividir o pedido entre quantos fornecedores forem necessários. */
export function cenarioMenorPreco(linhas: LinhaMapa[], resumos: ResumoFornecedor[]): Cenario {
  const escolhidas = linhas
    .map(l => l.celulas.find(c => c.melhor))
    .filter((c): c is CelulaMapa => !!c);
  return montarCenario(
    'menor_preco',
    'Menor preço item a item',
    'Cada item com quem cotou mais barato, dividindo o pedido.',
    escolhidas, linhas, resumos,
  );
}

/**
 * Melhor fornecedor único. Prefere quem cobre mais linhas; entre os de mesma
 * cobertura, o de menor desembolso — um fornecedor 2% mais caro que fecha o
 * pedido inteiro costuma ganhar de dois pedidos 2% mais baratos.
 */
export function cenarioFornecedorUnico(linhas: LinhaMapa[], resumos: ResumoFornecedor[]): Cenario | null {
  const candidatos = [...resumos].sort((a, b) => {
    if (b.itensCotados !== a.itensCotados) return b.itensCotados - a.itensCotados;
    return a.totalComFrete - b.totalComFrete;
  });
  const vencedor = candidatos[0];
  if (!vencedor || vencedor.itensCotados === 0) return null;

  const escolhidas = linhas.flatMap(l => l.celulas.filter(c => c.propostaKey === vencedor.propostaKey));
  return montarCenario(
    'fornecedor_unico',
    'Fornecedor único',
    `Tudo o que ${vencedor.nome} cotou, num pedido só.`,
    escolhidas, linhas, resumos,
  );
}

/** O que o comprador marcou na matriz. */
export function cenarioSelecao(linhas: LinhaMapa[], resumos: ResumoFornecedor[], selecionados: Set<string>): Cenario {
  const escolhidas = linhas.flatMap(l => l.celulas.filter(c => selecionados.has(c.item._key)));
  return montarCenario(
    'selecao',
    'Sua seleção',
    'Os itens que você marcou na matriz.',
    escolhidas, linhas, resumos,
  );
}
