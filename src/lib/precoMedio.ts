/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Preço médio unitário de um item, lido do histórico de pedidos (PO) ou do
 * histórico de cotações.
 *
 * As duas fontes têm formatos diferentes — o pedido chega agregado por
 * material + fornecedor + pedido, em BRL; a cotação chega por item de
 * proposta, com o preço de etiqueta do fornecedor. Cada fonte tem o seu
 * adaptador (`amostrasDePedidos`, `amostrasDeCotacoes`) e daí em diante o
 * cálculo é um só, sobre `AmostraPreco`.
 *
 * O preço "médio" de manchete é ponderado pela quantidade: um lote de 1.000
 * unidades a R$ 2 e outro de 1 unidade a R$ 20 custam em média R$ 2,02 por
 * unidade, não R$ 11. A média simples e a mediana ficam ao lado para quem quer
 * ler o preço "típico" sem o peso dos lotes grandes.
 */

import { HistoricoPedidoView } from '../types';
import {
  NAO_INFORMADO,
  ehCompraDeMaterial,
  normalizarDescricaoItem,
  periodoChave,
  porGrupo,
} from './historicoAnalytics';

export type FontePreco = 'pedidos' | 'cotacoes';
export type ChavePreco = 'material' | 'similar';

/** Um preço unitário observado: uma linha de pedido ou um item cotado. */
export interface AmostraPreco {
  /** AAAA-MM-DD. */
  data: string;
  fornecedor: string;
  /** Preço unitário (BRL no pedido; moeda da proposta na cotação). */
  preco: number;
  qtd: number;
  /** Número do pedido ou da proposta, para o detalhe. */
  documento: string;
  material: string;
  descricao: string;
  grupo: string;
  unidade: string;
  /** Chave de agrupamento por código SAP. */
  chaveMaterial: string;
  /** Chave de agrupamento por descrição normalizada (+ grupo, no pedido). */
  chaveSimilar: string;
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const txt = (v: unknown): string => String(v ?? '').trim();

/* Adaptadores ------------------------------------------------------------ */

/**
 * Pedido → amostra. O preço é valor ÷ quantidade da linha (o que a view já
 * entrega em `preco_liquido_unit`), recalculado aqui para não depender de o
 * cache local ter a coluna. Linha sem data, sem quantidade ou sem valor não
 * dá preço e fica de fora; serviço e contrato-quadro também.
 */
export function amostrasDePedidos(linhas: readonly HistoricoPedidoView[]): AmostraPreco[] {
  const out: AmostraPreco[] = [];
  for (const l of linhas) {
    if (!ehCompraDeMaterial(l)) continue;
    const data = txt(l.data_doc).slice(0, 10);
    const qtd = num(l.qtd_pedido);
    const valor = num(l.valor_liquido);
    if (!data || qtd <= 0 || valor <= 0) continue;

    const descricao = txt(l.txt_breve);
    const material = txt(l.material);
    out.push({
      data,
      fornecedor: txt(l.fornecedor) || NAO_INFORMADO,
      preco: valor / qtd,
      qtd,
      documento: txt(l.doc_compra),
      material,
      descricao,
      grupo: porGrupo(l) || NAO_INFORMADO,
      unidade: '',
      chaveMaterial: material || NAO_INFORMADO,
      chaveSimilar: `${txt(l.grp_mercads)}::${normalizarDescricaoItem(descricao)}`,
    });
  }
  return out;
}

/** Item de cotação como vem de `buscarItensCotacaoParaPreco`. */
export interface ItemCotacaoPreco {
  id: string;
  material_code: string | null;
  descricao_produto: string;
  unidade_medida: string | null;
  quantidade: number | null;
  preco_unitario: number | null;
  data: string | null;
  fornecedor: string | null;
  numero_proposta: string | null;
}

/** Prefixo da chave de um item cotado que ainda não foi vinculado a código SAP. */
export const SEM_VINCULO_SAP = 'SEM-VINCULO::';

/**
 * Cotação → amostra. Item sem vínculo SAP não é descartado: agrupa pela
 * descrição normalizada com o prefixo `SEM_VINCULO_SAP`, para o preço dele
 * aparecer — só não se mistura com as descrições diferentes que os outros
 * fornecedores deram ao mesmo produto (isso é o que o vínculo resolve).
 */
export function amostrasDeCotacoes(itens: readonly ItemCotacaoPreco[]): AmostraPreco[] {
  const out: AmostraPreco[] = [];
  for (const i of itens) {
    const data = txt(i.data).slice(0, 10);
    const preco = num(i.preco_unitario);
    if (!data || preco <= 0) continue;

    const descricao = txt(i.descricao_produto);
    const material = txt(i.material_code);
    const norm = normalizarDescricaoItem(descricao);
    out.push({
      data,
      fornecedor: txt(i.fornecedor) || NAO_INFORMADO,
      preco,
      // Cotação sem quantidade pesa 1: entra na média, sem distorcê-la.
      qtd: num(i.quantidade) > 0 ? num(i.quantidade) : 1,
      documento: txt(i.numero_proposta),
      material,
      descricao,
      grupo: NAO_INFORMADO,
      unidade: txt(i.unidade_medida),
      chaveMaterial: material || `${SEM_VINCULO_SAP}${norm}`,
      chaveSimilar: norm,
    });
  }
  return out;
}

/* Estatística ------------------------------------------------------------ */

export function mediana(valores: readonly number[]): number {
  if (valores.length === 0) return 0;
  const s = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[meio - 1] + s[meio]) / 2 : s[meio];
}

/** Média ponderada pela quantidade. Sem quantidade nenhuma, cai na simples. */
export function mediaPonderada(amostras: readonly AmostraPreco[]): number {
  if (amostras.length === 0) return 0;
  let valor = 0;
  let qtd = 0;
  for (const a of amostras) {
    valor += a.preco * a.qtd;
    qtd += a.qtd;
  }
  return qtd > 0 ? valor / qtd : amostras.reduce((s, a) => s + a.preco, 0) / amostras.length;
}

export interface PrecoFornecedor {
  fornecedor: string;
  n: number;
  precoMedio: number;
  menor: number;
  ultimo: number;
  dataUltimo: string;
}

export interface PrecoItem {
  chave: string;
  material: string;
  descricao: string;
  grupo: string;
  unidade: string;
  /** Item cotado sem código SAP (só existe na fonte cotações). */
  semVinculo: boolean;
  /** Em ordem cronológica. */
  amostras: AmostraPreco[];
  n: number;
  qtdTotal: number;
  /** Preço médio ponderado pela quantidade — o número de manchete. */
  precoMedio: number;
  precoMedioSimples: number;
  precoMediana: number;
  menor: number;
  maior: number;
  fornecedorMenor: string;
  /** (maior − menor) ÷ menor, em %. */
  amplitudePct: number;
  ultimo: number;
  dataUltimo: string;
  fornecedorUltimo: string;
  /** Último preço contra a média ponderada das compras anteriores, em %. `null` com 1 amostra. */
  variacaoUltimoPct: number | null;
  fornecedores: PrecoFornecedor[];
}

const maisFrequente = (contagem: Map<string, number>): string => {
  let melhor = '';
  let max = -1;
  for (const [k, v] of contagem) {
    if (v > max) {
      max = v;
      melhor = k;
    }
  }
  return melhor;
};

function resumirFornecedores(amostras: readonly AmostraPreco[]): PrecoFornecedor[] {
  const mapa = new Map<string, AmostraPreco[]>();
  for (const a of amostras) {
    const lista = mapa.get(a.fornecedor) || [];
    lista.push(a);
    mapa.set(a.fornecedor, lista);
  }
  return Array.from(mapa, ([fornecedor, lista]) => {
    const ult = lista[lista.length - 1];
    return {
      fornecedor,
      n: lista.length,
      precoMedio: mediaPonderada(lista),
      menor: Math.min(...lista.map(a => a.preco)),
      ultimo: ult.preco,
      dataUltimo: ult.data,
    };
  }).sort((a, b) => a.precoMedio - b.precoMedio);
}

/**
 * Agrupa as amostras por item e calcula o preço médio de cada um. O resultado
 * sai por número de amostras, do mais comprado para o menos — o item com mais
 * histórico é onde a média diz alguma coisa.
 *
 * `minAmostras` descarta item com pouco histórico (padrão 1 = tudo).
 */
export function calcPrecoMedio(
  amostras: readonly AmostraPreco[],
  chaveDe: ChavePreco,
  minAmostras = 1,
): PrecoItem[] {
  const grupos = new Map<string, AmostraPreco[]>();
  for (const a of amostras) {
    const chave = (chaveDe === 'material' ? a.chaveMaterial : a.chaveSimilar) || NAO_INFORMADO;
    const lista = grupos.get(chave) || [];
    lista.push(a);
    grupos.set(chave, lista);
  }

  const resultado: PrecoItem[] = [];
  for (const [chave, lista] of grupos) {
    if (lista.length < minAmostras) continue;

    // Estável: na mesma data, mantém a ordem de entrada.
    const ord = [...lista].sort((a, b) => a.data.localeCompare(b.data));
    const precos = ord.map(a => a.preco);
    const menorAmostra = ord.reduce((m, a) => (a.preco < m.preco ? a : m), ord[0]);
    const ultima = ord[ord.length - 1];
    const menor = menorAmostra.preco;
    const maior = Math.max(...precos);

    const descricoes = new Map<string, number>();
    const materiais = new Map<string, number>();
    const unidades = new Map<string, number>();
    for (const a of ord) {
      if (a.descricao) descricoes.set(a.descricao, (descricoes.get(a.descricao) || 0) + 1);
      if (a.material) materiais.set(a.material, (materiais.get(a.material) || 0) + 1);
      if (a.unidade) unidades.set(a.unidade, (unidades.get(a.unidade) || 0) + 1);
    }

    const anteriores = ord.slice(0, -1);
    const refAnterior = anteriores.length > 0 ? mediaPonderada(anteriores) : 0;

    resultado.push({
      chave,
      material: maisFrequente(materiais),
      descricao: maisFrequente(descricoes),
      grupo: ord[0].grupo,
      unidade: maisFrequente(unidades),
      semVinculo: chave.startsWith(SEM_VINCULO_SAP),
      amostras: ord,
      n: ord.length,
      qtdTotal: ord.reduce((s, a) => s + a.qtd, 0),
      precoMedio: mediaPonderada(ord),
      precoMedioSimples: precos.reduce((s, p) => s + p, 0) / precos.length,
      precoMediana: mediana(precos),
      menor,
      maior,
      fornecedorMenor: menorAmostra.fornecedor,
      amplitudePct: menor > 0 ? ((maior - menor) / menor) * 100 : 0,
      ultimo: ultima.preco,
      dataUltimo: ultima.data,
      fornecedorUltimo: ultima.fornecedor,
      variacaoUltimoPct: refAnterior > 0 ? (ultima.preco / refAnterior - 1) * 100 : null,
      fornecedores: resumirFornecedores(ord),
    });
  }

  return resultado.sort((a, b) => b.n - a.n || b.qtdTotal - a.qtdTotal);
}

/* Série temporal --------------------------------------------------------- */

export interface PontoSeriePreco {
  periodo: string;
  /** Preço médio ponderado do período. `null` num mês sem nenhum preço. */
  precoMedio: number | null;
  /** Mediana dos preços do período — o valor que o gráfico rotula. */
  mediana: number | null;
  menor: number | null;
  maior: number | null;
  /** Observações no período; 0 marca um mês sem compra ou cotação. */
  n: number;
  /** Preço médio contra o do período anterior com dados, em %. `null` no primeiro. */
  variacaoPct: number | null;
}

/** Próximo mês de 'AAAA-MM'. */
function mesSeguinte(ym: string): string {
  const [a, m] = ym.split('-').map(Number);
  return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`;
}

/**
 * Evolução do preço médio, por semana ou mês.
 *
 * Na visão mensal os meses sem nenhum preço entram na série com `n = 0` e
 * valores `null`: numa linha do tempo, o buraco precisa aparecer como buraco —
 * pular direto de janeiro para abril desenharia três meses como se fossem um.
 */
export function serieTemporalPreco(
  amostras: readonly AmostraPreco[],
  granularidade: 'semana' | 'mes',
): PontoSeriePreco[] {
  const mapa = new Map<string, AmostraPreco[]>();
  for (const a of amostras) {
    const p = periodoChave(a.data, granularidade);
    const lista = mapa.get(p) || [];
    lista.push(a);
    mapa.set(p, lista);
  }
  const periodos = Array.from(mapa.keys()).sort();

  if (granularidade === 'mes' && periodos.length > 1) {
    const ultimo = periodos[periodos.length - 1];
    for (let ym = periodos[0]; ym < ultimo; ym = mesSeguinte(ym)) {
      if (!mapa.has(ym)) mapa.set(ym, []);
    }
  }

  let anterior: number | null = null;
  return Array.from(mapa.keys())
    .sort()
    .map(periodo => {
      const lista = mapa.get(periodo)!;
      if (lista.length === 0) {
        return { periodo, precoMedio: null, mediana: null, menor: null, maior: null, n: 0, variacaoPct: null };
      }
      const precoMedio = mediaPonderada(lista);
      const variacaoPct = anterior !== null && anterior > 0 ? (precoMedio / anterior - 1) * 100 : null;
      anterior = precoMedio;
      return {
        periodo,
        precoMedio,
        mediana: mediana(lista.map(a => a.preco)),
        menor: Math.min(...lista.map(a => a.preco)),
        maior: Math.max(...lista.map(a => a.preco)),
        n: lista.length,
        variacaoPct,
      };
    });
}
