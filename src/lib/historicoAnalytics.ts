/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Análises do histórico de compras.
 *
 * Cálculo puro sobre `vw_historico_pedidos`, que já chega ao cache local
 * agregada por material + fornecedor + pedido e recortada em `data_doc >=
 * 2026-01-01`. Os valores estão em BRL (ver nota de moeda em
 * `criar_view_historico_pedidos.sql`).
 *
 * O recorte é pequeno e denso — cerca de 650 linhas, 118 fornecedores, 105
 * grupos de mercadoria e 48 cidades em cinco meses. Isso guia o que faz
 * sentido calcular: distribuição, concentração e risco de fonte respondem bem
 * nesse volume; série temporal mensal, com ~280 pedidos espalhados, não
 * responde — e por isso não existe aqui.
 */

import { HistoricoPedidoView } from '../types';

/* Utilitários ------------------------------------------------------------ */

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const txt = (v: unknown): string => String(v ?? '').trim();

/** Rótulo de dimensão vazia. Some do gráfico seria pior: o gasto existe. */
export const NAO_INFORMADO = 'Não informado';

export interface FatiaValor {
  chave: string;
  valor: number;
  itens: number;
  /** Pedidos distintos. */
  pedidos: number;
  /** Participação no total, 0..100. */
  participacao: number;
  /** Participação acumulada na ordem decrescente de valor, 0..100. */
  acumulado: number;
}

/**
 * Agrega por uma dimensão qualquer e já devolve participação e acumulado.
 *
 * O acumulado vem calculado aqui, e não no componente, porque depende da
 * ordenação por valor — deixar isso para a camada visual convidaria cada
 * gráfico a reordenar por conta própria e exibir uma curva de Pareto que não
 * corresponde às barras ao lado.
 */
export function agregarPor(
  linhas: HistoricoPedidoView[],
  dimensao: (l: HistoricoPedidoView) => string
): FatiaValor[] {
  const mapa = new Map<string, { valor: number; itens: number; pedidos: Set<string> }>();

  for (const l of linhas) {
    const chave = dimensao(l) || NAO_INFORMADO;
    let a = mapa.get(chave);
    if (!a) {
      a = { valor: 0, itens: 0, pedidos: new Set() };
      mapa.set(chave, a);
    }
    a.valor += num(l.valor_liquido);
    a.itens++;
    if (l.doc_compra) a.pedidos.add(l.doc_compra);
  }

  const fatias = Array.from(mapa.entries())
    .map(([chave, a]) => ({
      chave,
      valor: a.valor,
      itens: a.itens,
      pedidos: a.pedidos.size,
      participacao: 0,
      acumulado: 0,
    }))
    .sort((x, y) => y.valor - x.valor);

  const total = fatias.reduce((s, f) => s + f.valor, 0);
  let acum = 0;
  for (const f of fatias) {
    f.participacao = total > 0 ? (f.valor / total) * 100 : 0;
    acum += f.participacao;
    f.acumulado = acum;
  }
  return fatias;
}

/* Dimensões nomeadas ----------------------------------------------------- */

export const porFornecedor = (l: HistoricoPedidoView) => txt(l.fornecedor);
/**
 * UF real do fornecedor.
 * Prioridade: estado_uf (cidadeforn, via coluna Rg da ZL0132) > regiao_uf
 * (pedidosforn, coluna Rg da ZL0132 — mas pode ser codigo numerico estrangeiro).
 */
export const porUF = (l: HistoricoPedidoView) =>
  txt(l.estado_uf || l.regiao_uf);
export const porCidade = (l: HistoricoPedidoView) => txt(l.cidade || l.localidade);
export const porPais = (l: HistoricoPedidoView) => txt(l.pais);

/* Geografia -------------------------------------------------------------- */

/** Chave de comparação de texto livre: sem acento, sem caixa, sem espaço duplo. */
export function normalizarTexto(s: string): string {
  return s
    // NFD separa a letra do acento; `\p{Diacritic}` então remove só os sinais,
    // preservando a letra base. Escrito assim, e não como faixa de code points,
    // o arquivo fica em ASCII puro — uma faixa literal `[U+0300-U+036F]` traz
    // caracteres combinantes invisíveis no fonte, que qualquer reformatação ou
    // troca de codificação pode corromper sem deixar rastro.
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Canonicalizador de nome de cidade.
 *
 * A base traz a mesma cidade em grafias diferentes — `Jacobina` e `JACOBINA`,
 * `Juazeiro` e `JUAZEIRO` — e agrupar pelo texto cru parte a cidade em duas
 * linhas do ranking, cada uma com metade do valor. Jacobina, que é a praça de
 * maior volume do recorte, era a mais afetada.
 *
 * Agrupa pela forma normalizada e exibe a variante mais frequente, para o
 * rótulo continuar sendo um nome que existe no dado em vez de uma invenção.
 * Empate resolve por ordem alfabética, só para o resultado ser estável entre
 * execuções.
 */
export function criarCanonicalizadorCidade(
  linhas: HistoricoPedidoView[]
): (l: HistoricoPedidoView) => string {
  const contagem = new Map<string, Map<string, number>>();

  for (const l of linhas) {
    const bruto = porCidade(l);
    if (!bruto) continue;
    const chave = normalizarTexto(bruto);
    let variantes = contagem.get(chave);
    if (!variantes) {
      variantes = new Map();
      contagem.set(chave, variantes);
    }
    variantes.set(bruto, (variantes.get(bruto) || 0) + 1);
  }

  const canonico = new Map<string, string>();
  for (const [chave, variantes] of contagem) {
    const melhor = Array.from(variantes.entries()).sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR')
    )[0][0];
    canonico.set(chave, melhor);
  }

  return (l: HistoricoPedidoView) => {
    const bruto = porCidade(l);
    if (!bruto) return '';
    return canonico.get(normalizarTexto(bruto)) ?? bruto;
  };
}

export interface FatiaCidadeHierarquica extends FatiaValor {
  estado: string;
  cidade: string;
}

export interface GrupoEstadoHierarquico {
  estado: string;
  valorTotal: number;
  participacao: number;
  pedidos: number;
  itens: number;
  cidades: FatiaCidadeHierarquica[];
}

/**
 * Retorna a UF do estado (nível 1) para fornecedores brasileiros,
 * ou 'Exterior' para fornecedores internacionais / sem estado.
 */
export function porEstado(l: HistoricoPedidoView): string {
  if (ehBrasil(l)) {
    const uf = txt(l.estado_uf || l.regiao_uf);
    if (uf && /^[A-Za-z]{2}$/.test(uf)) {
      return uf.toUpperCase();
    }
  }
  return 'Exterior';
}

/**
 * Retorna a chave composta 'UF / Cidade' (ou 'Exterior / País').
 */
export function porLocalizacaoComEstado(
  l: HistoricoPedidoView,
  canonicalizarCidade?: (l: HistoricoPedidoView) => string
): string {
  const est = porEstado(l);
  let cid = canonicalizarCidade ? canonicalizarCidade(l) : porCidade(l);
  if (!cid) {
    if (est === 'Exterior') {
      const pais = porPaisNome(l);
      cid = pais && pais !== 'Exterior' ? pais : 'Não informada';
    } else {
      cid = 'Não informada';
    }
  }
  return `${est} / ${cid}`;
}

/**
 * Agrupa os dados em 2 níveis hierárquicos:
 * Nível 1: Estado (ou 'Exterior')
 * Nível 2: Cidades pertencentes a cada estado.
 */
export function calcHierarquiaGeografica(
  linhas: HistoricoPedidoView[],
  canonicalizarCidade?: (l: HistoricoPedidoView) => string
): GrupoEstadoHierarquico[] {
  const totalGeral = linhas.reduce(
    (s, l) => s + (typeof l.valor_liquido === 'number' ? l.valor_liquido : 0),
    0
  );

  const mapaEstado = new Map<
    string,
    {
      valorTotal: number;
      pedidosSet: Set<string>;
      itensCount: number;
      mapaCidades: Map<
        string,
        { valor: number; pedidosSet: Set<string>; itensCount: number }
      >;
    }
  >();

  for (const l of linhas) {
    const est = porEstado(l);
    let cid = canonicalizarCidade ? canonicalizarCidade(l) : porCidade(l);
    if (!cid) {
      if (est === 'Exterior') {
        const pais = porPaisNome(l);
        cid = pais && pais !== 'Exterior' ? pais : 'Não informada';
      } else {
        cid = 'Não informada';
      }
    }

    const val = typeof l.valor_liquido === 'number' ? l.valor_liquido : 0;
    const pedKey = `${l.doc_compra || ''}_${l.reqc || ''}_${l.data_doc || ''}`;

    let regEst = mapaEstado.get(est);
    if (!regEst) {
      regEst = {
        valorTotal: 0,
        pedidosSet: new Set(),
        itensCount: 0,
        mapaCidades: new Map(),
      };
      mapaEstado.set(est, regEst);
    }

    regEst.valorTotal += val;
    regEst.itensCount += 1;
    if (pedKey) regEst.pedidosSet.add(pedKey);

    let regCid = regEst.mapaCidades.get(cid);
    if (!regCid) {
      regCid = { valor: 0, pedidosSet: new Set(), itensCount: 0 };
      regEst.mapaCidades.set(cid, regCid);
    }
    regCid.valor += val;
    regCid.itensCount += 1;
    if (pedKey) regCid.pedidosSet.add(pedKey);
  }

  const resultado: GrupoEstadoHierarquico[] = [];

  for (const [est, dadosEst] of mapaEstado.entries()) {
    const cidadesList: FatiaCidadeHierarquica[] = [];
    for (const [cid, dadosCid] of dadosEst.mapaCidades.entries()) {
      cidadesList.push({
        chave: `${est} / ${cid}`,
        estado: est,
        cidade: cid,
        valor: dadosCid.valor,
        participacao: totalGeral > 0 ? (dadosCid.valor / totalGeral) * 100 : 0,
        acumulado: 0,
        pedidos: dadosCid.pedidosSet.size,
        itens: dadosCid.itensCount,
      });
    }

    cidadesList.sort((a, b) => b.valor - a.valor);
    let acumEst = 0;
    for (const c of cidadesList) {
      acumEst += c.participacao;
      c.acumulado = Math.min(100, acumEst);
    }

    resultado.push({
      estado: est,
      valorTotal: dadosEst.valorTotal,
      participacao: totalGeral > 0 ? (dadosEst.valorTotal / totalGeral) * 100 : 0,
      pedidos: dadosEst.pedidosSet.size,
      itens: dadosEst.itensCount,
      cidades: cidadesList,
    });
  }

  resultado.sort((a, b) => b.valorTotal - a.valorTotal);
  return resultado;
}

export const BRASIL = 'BR';

/**
 * Identifica se a compra é nacional (Brasil).
 * Retorna true se pais for 'BR' ou se houver estado/cidade do Brasil cadastrados.
 */
export const ehBrasil = (l: HistoricoPedidoView): boolean => {
  const p = txt(l.pais).toUpperCase();
  if (p) return p === BRASIL;
  const uf = txt(l.estado_uf || l.regiao_uf);
  if (uf && /^[A-Za-z]{2}$/.test(uf)) return true;
  if (l.cidade || l.localidade) return true;
  return false;
};

/** Nome do país para exibição; o código cru quando não há tradução conhecida. */
const PAIS_NOME: Record<string, string> = {
  BR: 'Brasil',
  CN: 'China',
  IT: 'Itália',
  US: 'Estados Unidos',
  DE: 'Alemanha',
  PT: 'Portugal',
  ES: 'Espanha',
  FR: 'França',
  JP: 'Japão',
  AR: 'Argentina',
  DK: 'Dinamarca',
  CA: 'Canadá',
  FI: 'Finlândia',
  GB: 'Reino Unido',
  KR: 'Coreia do Sul',
  PL: 'Polônia',
  LV: 'Letônia',
};

export const porPaisNome = (l: HistoricoPedidoView) => {
  const c = txt(l.pais).toUpperCase();
  if (c) return PAIS_NOME[c] ?? c;
  if (ehBrasil(l)) return 'Brasil';
  return NAO_INFORMADO;
};

export const porOrigem = (l: HistoricoPedidoView) => {
  return ehBrasil(l) ? 'Brasil' : 'Exterior';
};

/**
 * Regiao de origem, unificando o eixo geografico.
 */
export const porRegiao = (l: HistoricoPedidoView) => {
  if (ehBrasil(l)) {
    const uf = txt(l.estado_uf || l.regiao_uf);
    return uf && /^[A-Za-z]{2}$/.test(uf) ? uf.toUpperCase() : 'Brasil · sem UF';
  }
  const pais = porPaisNome(l);
  return pais && pais !== NAO_INFORMADO ? `Exterior · ${pais}` : 'Exterior';
};
export const porGrupoCodigo = (l: HistoricoPedidoView) => txt(l.grp_mercads);

export const porGrupo = (l: HistoricoPedidoView) => {
  const desc = txt(l.grp_mercads_desc);
  if (desc) return desc;
  return txt(l.grp_mercads) || NAO_INFORMADO;
};

export type TipoItem = 'Projeto' | 'Consumo';

/**
 * Natureza do item. A view já classifica pelo padrão do código de material,
 * mas o fallback local mantém a mesma regra para linhas de cache antigas,
 * gravadas antes da coluna existir — sem ele elas cairiam todas em "Não
 * informado" e sumiriam de qualquer filtro.
 */
export const porTipoItem = (l: HistoricoPedidoView): string =>
  txt(l.tipo_item) || (String(l.material ?? '').startsWith('100000000') ? 'Projeto' : 'Consumo');

/**
 * Ramo do grupo de mercadoria: o primeiro caractere do código SAP (B, E, M, S)
 * separa as famílias — consumível, equipamento, material, serviço. Com 105
 * grupos distintos em cinco meses, o ramo dá a leitura de topo que a lista
 * completa não dá.
 */
export const porRamoGrupo = (l: HistoricoPedidoView) => {
  const g = txt(l.grp_mercads);
  return g ? g.charAt(0).toUpperCase() : '';
};

export const RAMO_LABEL: Record<string, string> = {
  B: 'B — Consumível',
  E: 'E — Equipamento',
  M: 'M — Material',
  S: 'S — Serviço',
};

/* Curva ABC -------------------------------------------------------------- */

export type ClasseABC = 'A' | 'B' | 'C';

export interface FatiaABC extends FatiaValor {
  classe: ClasseABC;
}

/**
 * Classificação ABC pelo acumulado: A até 80% do valor, B até 95%, C o resto.
 *
 * O corte é feito no acumulado *inclusive* — o item que cruza a linha dos 80%
 * entra em A. Excluí-lo deixaria a classe A somando menos que 80%, que é
 * justamente o que a classificação promete cobrir.
 */
export function classificarABC(fatias: FatiaValor[]): FatiaABC[] {
  let anterior = 0;
  return fatias.map(f => {
    const classe: ClasseABC = anterior >= 95 ? 'C' : anterior >= 80 ? 'B' : 'A';
    anterior = f.acumulado;
    return { ...f, classe };
  });
}

/** Quantos itens da ponta somam `alvo`% do valor — a leitura de Pareto. */
export function quantosPara(fatias: FatiaValor[], alvo = 80): number {
  const idx = fatias.findIndex(f => f.acumulado >= alvo);
  return idx >= 0 ? idx + 1 : fatias.length;
}

/* Risco de fonte única --------------------------------------------------- */

export interface RiscoGrupo {
  grupo: string;
  fornecedores: number;
  valor: number;
  itens: number;
  /** Nome do fornecedor quando há um só — quem seria o ponto de falha. */
  fornecedorUnico?: string;
  /** Participação do maior fornecedor no gasto do grupo, 0..100. */
  dominancia: number;
  participacao: number;
}

/**
 * Grupos de mercadoria por quantidade de fornecedores.
 *
 * É a análise que costuma surpreender: um grupo comprado de um único
 * fornecedor é ponto de falha de suprimento *e* compra sem cotação. Vem
 * ordenado por valor, não por número de fornecedores — um grupo monofornecedor
 * de R$ 2 mil não é o problema; um de R$ 400 mil é.
 *
 * `dominancia` cobre o caso intermediário que a contagem de fornecedores
 * esconde: três fornecedores no grupo, mas um deles com 97% do gasto, é
 * concentração disfarçada de pluralidade.
 */
export function calcRiscoFonte(linhas: HistoricoPedidoView[]): RiscoGrupo[] {
  const mapa = new Map<string, { valor: number; itens: number; porForn: Map<string, number> }>();

  for (const l of linhas) {
    const grupo = porGrupo(l) || NAO_INFORMADO;
    let a = mapa.get(grupo);
    if (!a) {
      a = { valor: 0, itens: 0, porForn: new Map() };
      mapa.set(grupo, a);
    }
    const v = num(l.valor_liquido);
    const forn = txt(l.fornecedor) || NAO_INFORMADO;
    a.valor += v;
    a.itens++;
    a.porForn.set(forn, (a.porForn.get(forn) || 0) + v);
  }

  const totalGeral = Array.from(mapa.values()).reduce((s, a) => s + a.valor, 0);

  return Array.from(mapa.entries())
    .map(([grupo, a]) => {
      const fornecedores = Array.from(a.porForn.entries()).sort((x, y) => y[1] - x[1]);
      const maior = fornecedores[0];
      return {
        grupo,
        fornecedores: fornecedores.length,
        valor: a.valor,
        itens: a.itens,
        fornecedorUnico: fornecedores.length === 1 ? fornecedores[0][0] : undefined,
        dominancia: a.valor > 0 && maior ? (maior[1] / a.valor) * 100 : 0,
        participacao: totalGeral > 0 ? (a.valor / totalGeral) * 100 : 0,
      };
    })
    .sort((x, y) => y.valor - x.valor);
}

/* Fragmentação de compra ------------------------------------------------- */

export interface Fragmentacao {
  fornecedor: string;
  pedidos: number;
  itens: number;
  valor: number;
  /** Valor médio por pedido — o eixo que revela compra picada. */
  ticketMedio: number;
  uf: string;
}

/**
 * Fornecedor por número de pedidos contra ticket médio.
 *
 * Muitos pedidos de valor baixo com o mesmo fornecedor é custo de processo
 * puro: cada pedido consome cotação, aprovação, recebimento e pagamento,
 * independentemente do valor. É o candidato natural a contrato guarda-chuva ou
 * pedido consolidado — e só aparece quando as duas grandezas são lidas juntas.
 */
export function calcFragmentacao(linhas: HistoricoPedidoView[]): Fragmentacao[] {
  const mapa = new Map<string, { pedidos: Set<string>; itens: number; valor: number; uf: string }>();

  for (const l of linhas) {
    const forn = txt(l.fornecedor) || NAO_INFORMADO;
    let a = mapa.get(forn);
    if (!a) {
      a = { pedidos: new Set(), itens: 0, valor: 0, uf: txt(l.regiao_uf) };
      mapa.set(forn, a);
    }
    if (l.doc_compra) a.pedidos.add(l.doc_compra);
    a.itens++;
    a.valor += num(l.valor_liquido);
    if (!a.uf) a.uf = txt(l.regiao_uf);
  }

  return Array.from(mapa.entries())
    .map(([fornecedor, a]) => {
      const pedidos = a.pedidos.size;
      return {
        fornecedor,
        pedidos,
        itens: a.itens,
        valor: a.valor,
        ticketMedio: pedidos > 0 ? a.valor / pedidos : 0,
        uf: a.uf || NAO_INFORMADO,
      };
    })
    .sort((x, y) => y.pedidos - x.pedidos);
}

/* Matriz cruzada --------------------------------------------------------- */

export interface Matriz {
  linhas: string[];
  colunas: string[];
  /** valores[linha][coluna] em BRL. */
  valores: Record<string, Record<string, number>>;
  totalLinha: Record<string, number>;
  totalColuna: Record<string, number>;
  total: number;
  /** Maior célula — base da escala de intensidade do heatmap. */
  maximo: number;
}

/**
 * Cruza duas dimensões, mantendo só as `topLinhas` maiores de cada eixo.
 *
 * O que não cabe no corte é somado em "Outros" em vez de descartado: uma
 * matriz cujas margens não fecham com o total da página faz o leitor
 * desconfiar dos dois números, e com razão.
 */
export function calcMatriz(
  linhas: HistoricoPedidoView[],
  dimLinha: (l: HistoricoPedidoView) => string,
  dimColuna: (l: HistoricoPedidoView) => string,
  topLinhas = 12,
  topColunas = 8
): Matriz {
  const OUTROS = 'Outros';

  const manterTopo = (fatias: FatiaValor[], n: number): Set<string> =>
    new Set(fatias.slice(0, n).map(f => f.chave));

  const topL = manterTopo(agregarPor(linhas, dimLinha), topLinhas);
  const topC = manterTopo(agregarPor(linhas, dimColuna), topColunas);

  const valores: Record<string, Record<string, number>> = {};
  const totalLinha: Record<string, number> = {};
  const totalColuna: Record<string, number> = {};
  let total = 0;

  for (const l of linhas) {
    const bruteL = dimLinha(l) || NAO_INFORMADO;
    const bruteC = dimColuna(l) || NAO_INFORMADO;
    const chaveL = topL.has(bruteL) ? bruteL : OUTROS;
    const chaveC = topC.has(bruteC) ? bruteC : OUTROS;
    const v = num(l.valor_liquido);

    valores[chaveL] ??= {};
    valores[chaveL][chaveC] = (valores[chaveL][chaveC] || 0) + v;
    totalLinha[chaveL] = (totalLinha[chaveL] || 0) + v;
    totalColuna[chaveC] = (totalColuna[chaveC] || 0) + v;
    total += v;
  }

  // "Outros" sempre no fim, independentemente do seu valor — é um agregado de
  // resto, não um item que compete no ranking.
  const ordenar = (chaves: string[], totais: Record<string, number>) =>
    chaves.sort((a, b) => {
      if (a === OUTROS) return 1;
      if (b === OUTROS) return -1;
      return (totais[b] || 0) - (totais[a] || 0);
    });

  const maximo = Object.values(valores).reduce(
    (m, linha) => Math.max(m, ...Object.values(linha)),
    0
  );

  return {
    linhas: ordenar(Object.keys(totalLinha), totalLinha),
    colunas: ordenar(Object.keys(totalColuna), totalColuna),
    valores,
    totalLinha,
    totalColuna,
    total,
    maximo,
  };
}

/* Resumo ----------------------------------------------------------------- */

export interface ResumoHistorico {
  valorTotal: number;
  itens: number;
  pedidos: number;
  fornecedores: number;
  grupos: number;
  ufs: number;
  cidades: number;
  ticketMedio: number;
  /** Fornecedores que somam 80% do gasto. */
  fornecedoresPara80: number;
  /** Gasto em grupos atendidos por um único fornecedor. */
  valorFonteUnica: number;
  gruposFonteUnica: number;
  periodoDe?: string;
  periodoAte?: string;
}

export function calcResumo(linhas: HistoricoPedidoView[]): ResumoHistorico {
  const pedidos = new Set<string>();
  const fornecedores = new Set<string>();
  const grupos = new Set<string>();
  const ufs = new Set<string>();
  const cidades = new Set<string>();
  let valorTotal = 0;
  let de: string | undefined;
  let ate: string | undefined;

  for (const l of linhas) {
    valorTotal += num(l.valor_liquido);
    if (l.doc_compra) pedidos.add(l.doc_compra);
    if (txt(l.fornecedor)) fornecedores.add(txt(l.fornecedor));
    if (txt(l.grp_mercads)) grupos.add(txt(l.grp_mercads));
    if (txt(l.regiao_uf)) ufs.add(txt(l.regiao_uf));
    const cid = txt(l.cidade || l.localidade);
    if (cid) cidades.add(cid);
    const d = txt(l.data_doc);
    if (d) {
      if (!de || d < de) de = d;
      if (!ate || d > ate) ate = d;
    }
  }

  const risco = calcRiscoFonte(linhas);
  const unicos = risco.filter(r => r.fornecedores === 1 && r.grupo !== NAO_INFORMADO);

  return {
    valorTotal,
    itens: linhas.length,
    pedidos: pedidos.size,
    fornecedores: fornecedores.size,
    grupos: grupos.size,
    ufs: ufs.size,
    cidades: cidades.size,
    ticketMedio: pedidos.size > 0 ? valorTotal / pedidos.size : 0,
    fornecedoresPara80: quantosPara(agregarPor(linhas, porFornecedor), 80),
    valorFonteUnica: unicos.reduce((s, r) => s + r.valor, 0),
    gruposFonteUnica: unicos.length,
    periodoDe: de,
    periodoAte: ate,
  };
}

/* Recorrência de compras --------------------------------------------------
 *
 * Identifica compras repetidas de um mesmo material (chave 'material') ou de
 * itens parecidos dentro do mesmo grupo de mercadoria (chave 'similar' —
 * agrupa por grupo + descrição normalizada, já que não existe hoje um
 * cadastro de equivalência material-a-material). Serve de base tanto para o
 * ranking/série temporal quanto para os alertas de auditoria abaixo.
 */

export type ChaveRecorrencia = 'material' | 'similar';

const DIA_MS = 24 * 60 * 60 * 1000;

function diasEntre(a: string, b: string): number {
  return Math.round((new Date(`${b}T00:00:00`).getTime() - new Date(`${a}T00:00:00`).getTime()) / DIA_MS);
}

/**
 * Descrição normalizada para agrupar itens parecidos — mesma ideia de
 * `public.f_norm_cotacao` no banco: além do que `normalizarTexto` já resolve
 * (acento, caixa, espaço duplo), colapsa pontuação e símbolos soltos (ex.:
 * "Nº42" e "N 42" caem na mesma chave).
 */
export function normalizarDescricaoItem(s: string): string {
  return normalizarTexto(s)
    .replace(/[^A-Z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface RecorrenciaItem {
  /** material (chave 'material') ou `${grupo}::${descNormalizada}` (chave 'similar'). */
  chave: string;
  /** Código de material mais frequente do grupo — o próprio, se chave='material'. */
  material: string;
  descricao: string;
  grupoDesc: string;
  tipoItem: string;
  valor: number;
  qtdTotal: number;
  /** Pedidos (doc_compra) distintos. */
  pedidosDistintos: number;
  areas: string[];
  fornecedores: string[];
  /** Datas de pedido distintas, ordenadas cronologicamente. */
  datasCompra: string[];
  intervaloMedioDias: number | null;
  menorIntervaloDias: number | null;
  /** Linhas originais — base para drill-down (ComposicaoModal) e exportação. */
  itens: HistoricoPedidoView[];
}

export function calcRecorrencia(linhas: HistoricoPedidoView[], chaveDe: ChaveRecorrencia): RecorrenciaItem[] {
  const dimensao = (l: HistoricoPedidoView): string =>
    chaveDe === 'material' ? txt(l.material) : `${txt(l.grp_mercads)}::${normalizarDescricaoItem(txt(l.txt_breve))}`;

  interface Acc {
    materiais: Map<string, number>;
    descricoes: Map<string, number>;
    grupoDesc: string;
    tipoItem: string;
    valor: number;
    qtdTotal: number;
    pedidos: Set<string>;
    areas: Set<string>;
    fornecedores: Set<string>;
    datas: Set<string>;
    itens: HistoricoPedidoView[];
  }

  const mapa = new Map<string, Acc>();

  for (const l of linhas) {
    const chave = dimensao(l) || NAO_INFORMADO;
    let a = mapa.get(chave);
    if (!a) {
      a = {
        materiais: new Map(),
        descricoes: new Map(),
        grupoDesc: porGrupo(l),
        tipoItem: porTipoItem(l),
        valor: 0,
        qtdTotal: 0,
        pedidos: new Set(),
        areas: new Set(),
        fornecedores: new Set(),
        datas: new Set(),
        itens: [],
      };
      mapa.set(chave, a);
    }
    const mat = txt(l.material);
    if (mat) a.materiais.set(mat, (a.materiais.get(mat) || 0) + 1);
    const desc = txt(l.txt_breve);
    if (desc) a.descricoes.set(desc, (a.descricoes.get(desc) || 0) + 1);
    a.valor += num(l.valor_liquido);
    a.qtdTotal += num(l.qtd_pedido);
    if (l.doc_compra) a.pedidos.add(l.doc_compra);
    const area = txt(l.area_solicitante);
    if (area) a.areas.add(area);
    const forn = txt(l.fornecedor);
    if (forn) a.fornecedores.add(forn);
    const data = txt(l.data_doc);
    if (data) a.datas.add(data);
    a.itens.push(l);
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

  const resultado: RecorrenciaItem[] = [];
  for (const [chave, a] of mapa) {
    const datasOrdenadas = Array.from(a.datas).sort();
    let intervaloMedioDias: number | null = null;
    let menorIntervaloDias: number | null = null;
    if (datasOrdenadas.length >= 2) {
      const intervalos: number[] = [];
      for (let i = 1; i < datasOrdenadas.length; i++) {
        intervalos.push(diasEntre(datasOrdenadas[i - 1], datasOrdenadas[i]));
      }
      intervaloMedioDias = intervalos.reduce((s, d) => s + d, 0) / intervalos.length;
      menorIntervaloDias = Math.min(...intervalos);
    }

    resultado.push({
      chave,
      material: maisFrequente(a.materiais),
      descricao: maisFrequente(a.descricoes),
      grupoDesc: a.grupoDesc || NAO_INFORMADO,
      tipoItem: a.tipoItem,
      valor: a.valor,
      qtdTotal: a.qtdTotal,
      pedidosDistintos: a.pedidos.size,
      areas: Array.from(a.areas).sort(),
      fornecedores: Array.from(a.fornecedores).sort(),
      datasCompra: datasOrdenadas,
      intervaloMedioDias,
      menorIntervaloDias,
      itens: a.itens,
    });
  }

  return resultado.sort((x, y) => y.valor - x.valor);
}

/* Série temporal ----------------------------------------------------------
 * Bucket semanal (ISO) ou mensal a partir de data_doc — usada no drill-down
 * de um material/item selecionado no ranking, não como visão geral (o volume
 * do recorte inteiro é denso demais para uma linha do tempo legível, mas um
 * material específico tem poucos pontos e a pergunta "quando compramos isso"
 * é exatamente temporal).
 */

export interface PontoSerieRecorrencia {
  periodo: string;
  valor: number;
  qtd: number;
  pedidos: number;
}

function periodoChave(dataISO: string, granularidade: 'semana' | 'mes'): string {
  if (granularidade === 'mes') return dataISO.slice(0, 7);

  const d = new Date(`${dataISO}T00:00:00`);
  const alvo = new Date(d.getTime());
  const diaSemana = (alvo.getDay() + 6) % 7; // 0 = segunda
  alvo.setDate(alvo.getDate() - diaSemana + 3); // quinta-feira da semana
  const anoISO = alvo.getFullYear();
  const primeiraQuinta = new Date(anoISO, 0, 4);
  const diaSemanaPrimeira = (primeiraQuinta.getDay() + 6) % 7;
  primeiraQuinta.setDate(primeiraQuinta.getDate() - diaSemanaPrimeira + 3);
  const semana = 1 + Math.round((alvo.getTime() - primeiraQuinta.getTime()) / (7 * DIA_MS));
  return `${anoISO}-W${String(semana).padStart(2, '0')}`;
}

export function serieTemporalRecorrencia(
  linhas: HistoricoPedidoView[],
  granularidade: 'semana' | 'mes'
): PontoSerieRecorrencia[] {
  const mapa = new Map<string, { valor: number; qtd: number; pedidos: Set<string> }>();

  for (const l of linhas) {
    const data = txt(l.data_doc);
    if (!data) continue;
    const periodo = periodoChave(data, granularidade);
    let a = mapa.get(periodo);
    if (!a) {
      a = { valor: 0, qtd: 0, pedidos: new Set() };
      mapa.set(periodo, a);
    }
    a.valor += num(l.valor_liquido);
    a.qtd += num(l.qtd_pedido);
    if (l.doc_compra) a.pedidos.add(l.doc_compra);
  }

  return Array.from(mapa.entries())
    .map(([periodo, a]) => ({ periodo, valor: a.valor, qtd: a.qtd, pedidos: a.pedidos.size }))
    .sort((x, y) => x.periodo.localeCompare(y.periodo));
}

/* Alertas de auditoria ------------------------------------------------------
 *
 * Heurísticas explícitas (não é ML) — cada uma documentada e auditável, no
 * mesmo espírito do resto do arquivo. Espera-se receber só recorrências de
 * itens de Consumo: separar o Projeto é responsabilidade de quem chama, não
 * desta função — consumo contínuo de projeto nunca deveria virar alerta.
 */

export type TipoAlerta = 'maior_valor' | 'mais_repetido' | 'intervalo_curto' | 'aumento_anormal' | 'concentracao';

export interface AlertaAuditoria {
  tipo: TipoAlerta;
  severidade: 'atencao' | 'critico';
  item: RecorrenciaItem;
  justificativa: string;
}

export function detectarAlertasAuditoria(recorrencias: RecorrenciaItem[]): AlertaAuditoria[] {
  const alertas: AlertaAuditoria[] = [];

  // 1) Maior valor total comprado — top 5, sempre relevante para priorização.
  const porValor = [...recorrencias].sort((a, b) => b.valor - a.valor).slice(0, 5);
  for (const item of porValor) {
    if (item.valor <= 0) continue;
    alertas.push({
      tipo: 'maior_valor',
      severidade: 'atencao',
      item,
      justificativa: `Maior valor total comprado no período (${item.pedidosDistintos} pedido(s)).`,
    });
  }

  for (const item of recorrencias) {
    // 2) Mais repetido: 4+ pedidos distintos no período filtrado.
    if (item.pedidosDistintos >= 4) {
      alertas.push({
        tipo: 'mais_repetido',
        severidade: item.pedidosDistintos >= 6 ? 'critico' : 'atencao',
        item,
        justificativa: `${item.pedidosDistintos} compras distintas no período — recorrência acima do esperado.`,
      });
    }

    // 3) Intervalo curto entre compras: menos de 7 dias entre duas compras.
    if (item.menorIntervaloDias !== null && item.menorIntervaloDias < 7 && item.pedidosDistintos >= 2) {
      alertas.push({
        tipo: 'intervalo_curto',
        severidade: item.menorIntervaloDias <= 2 ? 'critico' : 'atencao',
        item,
        justificativa: `Duas compras com apenas ${item.menorIntervaloDias} dia(s) de intervalo — possível fracionamento de demanda.`,
      });
    }

    // 4) Aumento anormal: última compra (por data) > 2x a média das anteriores.
    if (item.itens.length >= 3) {
      const ordenados = item.itens
        .filter(l => txt(l.data_doc))
        .sort((a, b) => txt(a.data_doc).localeCompare(txt(b.data_doc)));
      if (ordenados.length >= 3) {
        const ultimo = ordenados[ordenados.length - 1];
        const anteriores = ordenados.slice(0, -1);
        const mediaValorAnterior = anteriores.reduce((s, l) => s + num(l.valor_liquido), 0) / anteriores.length;
        const mediaQtdAnterior = anteriores.reduce((s, l) => s + num(l.qtd_pedido), 0) / anteriores.length;
        const valorUltimo = num(ultimo.valor_liquido);
        const qtdUltimo = num(ultimo.qtd_pedido);
        const estourouValor = mediaValorAnterior > 0 && valorUltimo > mediaValorAnterior * 2;
        const estourouQtd = mediaQtdAnterior > 0 && qtdUltimo > mediaQtdAnterior * 2;
        if (estourouValor || estourouQtd) {
          alertas.push({
            tipo: 'aumento_anormal',
            severidade: 'atencao',
            item,
            justificativa: estourouValor
              ? `Última compra custou ${(valorUltimo / mediaValorAnterior).toFixed(1)}x a média das anteriores.`
              : `Última compra pediu ${(qtdUltimo / mediaQtdAnterior).toFixed(1)}x a quantidade média das anteriores.`,
          });
        }
      }
    }

    // 5) Concentração: 3+ pedidos, todos da mesma área ou do mesmo fornecedor.
    if (item.pedidosDistintos >= 3 && (item.areas.length === 1 || item.fornecedores.length === 1)) {
      const alvo =
        item.areas.length === 1 && item.areas[0]
          ? `área "${item.areas[0]}"`
          : item.fornecedores.length === 1 && item.fornecedores[0]
          ? `fornecedor "${item.fornecedores[0]}"`
          : null;
      if (alvo) {
        alertas.push({
          tipo: 'concentracao',
          severidade: 'atencao',
          item,
          justificativa: `${item.pedidosDistintos} compras concentradas na mesma ${alvo}.`,
        });
      }
    }
  }

  return alertas;
}
