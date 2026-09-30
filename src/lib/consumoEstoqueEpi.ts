/**
 * Consumo do ESTOQUE do depósito 0002 (EPIs + Consumíveis): o que realmente saiu
 * do almoxarifado, lido das baixas da MB51 — diferente da análise de consumo da
 * Ficha de EPI, que conta o que foi entregue e assinado em ficha.
 *
 * Saída = baixa de consumo (TMV 221, 201, 261…) líquida do estorno (222, 202,
 * 262…). Transferência (311/312), entrada e devolução a fornecedor não contam:
 * não tiram o material da fábrica por uso.
 */

import { casarTokens } from './buscaKeywords';

export const DEPOSITO_EPI = '0002';

/** Mesma família de consumo de `vw_mb51_classificado` (categorias consumo/estorno_consumo). */
export const TMV_CONSUMO = ['201', '221', '231', '241', '251', '261', '281', '291'] as const;
export const TMV_ESTORNO_CONSUMO = ['202', '222', '232', '242', '252', '262', '282', '292'] as const;
export const TMV_SAIDA_ESTOQUE: string[] = [...TMV_CONSUMO, ...TMV_ESTORNO_CONSUMO];

export const SEM_FINALIDADE = 'SEM DESCRIÇÃO';

export interface SaidaEstoque {
  id: string;
  material: string;
  descricao: string | null;
  /** YYYY-MM-DD */
  data: string;
  tipo: string;
  /** Como na MB51: baixa é negativa, estorno é positivo. */
  quantidade: number;
  valor: number;
  documento: string | null;
  /** Texto do cabeçalho do documento ("BAIXA EPIs", "BAIXA MATERIAIS"…). */
  finalidade: string;
  pep: string | null;
  usuario: string | null;
  estorno: boolean;
}

export interface SaldoEstoque {
  material: string;
  descricao: string | null;
  umb: string | null;
  saldo: number;
  valor: number;
}

export interface FiltrosSaidaEstoque {
  inicio: string | null;
  fim: string | null;
  /** Vazio = todas as finalidades. */
  finalidade: string | null;
  palavras: string[];
}

export interface JanelaAnalise {
  inicio: string;
  fim: string;
}

export interface LinhaItemSaida {
  material: string;
  descricao: string | null;
  umb: string | null;
  saldo: number;
  valorEstoque: number;
  /** Saída líquida de estorno, em quantidade positiva. */
  quantidade: number;
  valor: number;
  lancamentos: number;
  estornos: number;
  mediaMensal: number;
  /** Dias que o saldo cobre no ritmo do período; null sem saída. */
  coberturaDias: number | null;
  primeiraSaida: string | null;
  ultimaSaida: string | null;
  finalidades: string[];
}

export interface MesSaida {
  mes: string;
  quantidade: number;
  valor: number;
  lancamentos: number;
}

export interface FinalidadeSaida {
  finalidade: string;
  quantidade: number;
  valor: number;
  lancamentos: number;
}

export interface ResumoSaidas {
  itensComSaida: number;
  quantidade: number;
  valor: number;
  lancamentos: number;
  estornos: number;
  mediaMensalValor: number;
  dias: number;
  valorEstoque: number;
  itensEmEstoque: number;
  itensParados: number;
  valorParado: number;
}

export interface AnaliseSaidas {
  resumo: ResumoSaidas;
  porItem: LinhaItemSaida[];
  porMes: MesSaida[];
  porFinalidade: FinalidadeSaida[];
}

const DIA_MS = 86_400_000;
const DIAS_POR_MES = 30.4375;
const arredondar = (valor: number, casas = 4) => {
  const fator = 10 ** casas;
  return Math.round((valor + Number.EPSILON) * fator) / fator;
};

const paraMs = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`).getTime();

export function diasEntre(inicio: string, fim: string): number {
  const dias = Math.round((paraMs(fim) - paraMs(inicio)) / DIA_MS) + 1;
  return Number.isFinite(dias) ? Math.max(1, dias) : 1;
}

export function normalizarFinalidade(texto: string | null | undefined): string {
  const limpo = texto?.trim().replace(/\s+/g, ' ');
  return limpo ? limpo.toUpperCase() : SEM_FINALIDADE;
}

export function ehEstornoConsumo(tipo: string): boolean {
  return (TMV_ESTORNO_CONSUMO as readonly string[]).includes(tipo.trim());
}

export function filtrarSaidas(saidas: SaidaEstoque[], filtros: FiltrosSaidaEstoque): SaidaEstoque[] {
  return saidas.filter(saida => {
    if (filtros.inicio && saida.data < filtros.inicio) return false;
    if (filtros.fim && saida.data > filtros.fim) return false;
    if (filtros.finalidade && saida.finalidade !== filtros.finalidade) return false;
    if (filtros.palavras.length > 0 && !casarTokens([saida.material, saida.descricao, saida.finalidade], filtros.palavras)) return false;
    return true;
  });
}

/** Saldo de materiais que casam com as palavras-chave; sem palavras, todos. */
export function filtrarSaldos(saldos: SaldoEstoque[], palavras: string[]): SaldoEstoque[] {
  if (palavras.length === 0) return saldos;
  return saldos.filter(saldo => casarTokens([saldo.material, saldo.descricao], palavras));
}

export function analisarSaidas(
  saidas: SaidaEstoque[],
  saldos: SaldoEstoque[],
  janela: JanelaAnalise,
): AnaliseSaidas {
  const dias = diasEntre(janela.inicio, janela.fim);
  const meses = dias / DIAS_POR_MES;

  const saldoPorMaterial = new Map(saldos.map(saldo => [saldo.material, saldo]));
  const itens = new Map<string, {
    descricao: string | null;
    quantidade: number;
    valor: number;
    lancamentos: number;
    estornos: number;
    primeira: string | null;
    ultima: string | null;
    finalidades: Set<string>;
  }>();
  const mesesMapa = new Map<string, MesSaida>();
  const finalidadesMapa = new Map<string, FinalidadeSaida>();

  for (const saida of saidas) {
    // MB51: baixa negativa, estorno positivo. A saída líquida é o oposto da soma.
    const quantidade = -saida.quantidade;
    const valor = -saida.valor;

    const item = itens.get(saida.material) ?? {
      descricao: saida.descricao, quantidade: 0, valor: 0, lancamentos: 0, estornos: 0,
      primeira: null, ultima: null, finalidades: new Set<string>(),
    };
    if (!item.descricao && saida.descricao) item.descricao = saida.descricao;
    item.quantidade += quantidade;
    item.valor += valor;
    if (saida.estorno) item.estornos += 1; else item.lancamentos += 1;
    if (!saida.estorno) {
      if (!item.primeira || saida.data < item.primeira) item.primeira = saida.data;
      if (!item.ultima || saida.data > item.ultima) item.ultima = saida.data;
    }
    item.finalidades.add(saida.finalidade);
    itens.set(saida.material, item);

    const mes = saida.data.slice(0, 7);
    const mesAtual = mesesMapa.get(mes) ?? { mes, quantidade: 0, valor: 0, lancamentos: 0 };
    mesAtual.quantidade += quantidade;
    mesAtual.valor += valor;
    if (!saida.estorno) mesAtual.lancamentos += 1;
    mesesMapa.set(mes, mesAtual);

    const fin = finalidadesMapa.get(saida.finalidade) ?? { finalidade: saida.finalidade, quantidade: 0, valor: 0, lancamentos: 0 };
    fin.quantidade += quantidade;
    fin.valor += valor;
    if (!saida.estorno) fin.lancamentos += 1;
    finalidadesMapa.set(saida.finalidade, fin);
  }

  const porItem: LinhaItemSaida[] = Array.from(itens.entries()).map(([material, item]) => {
    const saldo = saldoPorMaterial.get(material);
    const quantidade = arredondar(item.quantidade);
    const porDia = quantidade / dias;
    return {
      material,
      descricao: saldo?.descricao ?? item.descricao,
      umb: saldo?.umb ?? null,
      saldo: saldo?.saldo ?? 0,
      valorEstoque: saldo?.valor ?? 0,
      quantidade,
      valor: arredondar(item.valor, 2),
      lancamentos: item.lancamentos,
      estornos: item.estornos,
      mediaMensal: arredondar(quantidade / meses, 2),
      coberturaDias: porDia > 0 && saldo ? Math.floor(saldo.saldo / porDia) : null,
      primeiraSaida: item.primeira,
      ultimaSaida: item.ultima,
      finalidades: Array.from(item.finalidades).sort(),
    };
  }).sort((a, b) => b.valor - a.valor || b.quantidade - a.quantidade);

  const comSaida = new Set(porItem.map(item => item.material));
  const emEstoque = saldos.filter(saldo => saldo.saldo > 0);
  const parados = emEstoque.filter(saldo => !comSaida.has(saldo.material));
  const valor = arredondar(porItem.reduce((total, item) => total + item.valor, 0), 2);

  return {
    resumo: {
      itensComSaida: porItem.length,
      quantidade: arredondar(porItem.reduce((total, item) => total + item.quantidade, 0)),
      valor,
      lancamentos: porItem.reduce((total, item) => total + item.lancamentos, 0),
      estornos: porItem.reduce((total, item) => total + item.estornos, 0),
      mediaMensalValor: arredondar(valor / meses, 2),
      dias,
      valorEstoque: arredondar(saldos.reduce((total, saldo) => total + saldo.valor, 0), 2),
      itensEmEstoque: emEstoque.length,
      itensParados: parados.length,
      valorParado: arredondar(parados.reduce((total, saldo) => total + saldo.valor, 0), 2),
    },
    porItem,
    porMes: Array.from(mesesMapa.values())
      .map(mes => ({ ...mes, quantidade: arredondar(mes.quantidade), valor: arredondar(mes.valor, 2) }))
      .sort((a, b) => a.mes.localeCompare(b.mes)),
    porFinalidade: Array.from(finalidadesMapa.values())
      .map(fin => ({ ...fin, quantidade: arredondar(fin.quantidade), valor: arredondar(fin.valor, 2) }))
      .sort((a, b) => b.valor - a.valor),
  };
}

/** Itens em estoque sem saída na janela: capital parado no depósito. */
export function itensSemSaida(saldos: SaldoEstoque[], porItem: LinhaItemSaida[]): LinhaItemSaida[] {
  const comSaida = new Set(porItem.map(item => item.material));
  return saldos
    .filter(saldo => saldo.saldo > 0 && !comSaida.has(saldo.material))
    .map(saldo => ({
      material: saldo.material,
      descricao: saldo.descricao,
      umb: saldo.umb,
      saldo: saldo.saldo,
      valorEstoque: saldo.valor,
      quantidade: 0,
      valor: 0,
      lancamentos: 0,
      estornos: 0,
      mediaMensal: 0,
      coberturaDias: null,
      primeiraSaida: null,
      ultimaSaida: null,
      finalidades: [],
    }))
    .sort((a, b) => b.valorEstoque - a.valorEstoque);
}
