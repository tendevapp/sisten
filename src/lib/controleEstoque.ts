import type { ControleEstoqueItem } from '../types';

export type StatusControleEstoque = 'CRITICO' | 'ALERTA' | 'OK' | 'SEM_DADOS';
export type OrigemParametroControleEstoque = 'CALCULADO' | 'OVERRIDE';

export interface ControleEstoqueCalculoInput {
  consumoTotal: number | null;
  diasUteis: number | null;
  leadTimeDias: number | null;
  intervaloCompraDias: number | null;
  saldoAtual: number;
  precoUnitario: number | null;
  quantidadePorTorre: number | null;
  estoqueMinimoManual?: number | null;
  estoqueMaximoManual?: number | null;
}

export interface FaixaPlanilha {
  consumoDia: number | null;
  estoqueMinimo: number | null;
  estoqueMaximo: number | null;
  quantidadeComprar: number | null;
  valorComprar: number | null;
  status: StatusControleEstoque;
  coberturaDias: number | null;
  autonomiaTorres: number | null;
  origemMinimo: OrigemParametroControleEstoque;
  origemMaximo: OrigemParametroControleEstoque;
}

export interface ControleEstoqueAnalise {
  item: ControleEstoqueItem;
  faixa: FaixaPlanilha;
}

export interface MovimentoControleEstoque {
  tipoMovimento: string;
  quantidade: number;
}

export interface TotaisMovimentoControleEstoque {
  entrada: number;
  baixaDireta: number;
  producao: number;
  consumo: number;
}

export interface LinhaDepositoControleEstoque {
  material: string;
  descricao: string | null;
  deposito: string | null;
  saldoAtual: number;
  valorEstoque: number;
}

export interface DepositoControleEstoque {
  deposito: string | null;
  saldoAtual: number;
  valorEstoque: number;
}

export interface ControleEstoqueMaterialConsolidado {
  material: string;
  descricao: string | null;
  saldoAtual: number;
  valorEstoque: number;
  quantidadeDepositos: number;
  depositos: DepositoControleEstoque[];
}

const arredondar = (valor: number, casas = 6): number => {
  const fator = 10 ** casas;
  return Math.round((valor + Number.EPSILON) * fator) / fator;
};

export function contarDiasUteis(inicioISO: string | null, fimISO: string | null): number | null {
  if (!inicioISO || !fimISO) return null;

  const inicio = new Date(`${inicioISO.slice(0, 10)}T12:00:00Z`);
  const fim = new Date(`${fimISO.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fim.getTime()) || inicio > fim) return null;

  let dias = 0;
  for (const atual = new Date(inicio); atual <= fim; atual.setUTCDate(atual.getUTCDate() + 1)) {
    const diaSemana = atual.getUTCDay();
    if (diaSemana !== 0 && diaSemana !== 6) dias += 1;
  }
  return dias;
}

export function calcularConsumoMovimentos(
  movimentos: MovimentoControleEstoque[],
): TotaisMovimentoControleEstoque {
  let entradaLiquida = 0;
  let baixaDiretaLiquida = 0;
  let producaoLiquida = 0;

  for (const movimento of movimentos) {
    const tipo = movimento.tipoMovimento.trim();
    const quantidade = Number.isFinite(movimento.quantidade) ? movimento.quantidade : 0;
    if (tipo === '101' || tipo === '102') entradaLiquida += quantidade;
    if (tipo === '221' || tipo === '222') baixaDiretaLiquida += quantidade;
    if (tipo === '311' || tipo === '312') producaoLiquida += quantidade;
  }

  const baixaDireta = Math.max(0, -baixaDiretaLiquida);
  const producao = Math.max(0, -producaoLiquida);
  return {
    entrada: arredondar(entradaLiquida),
    baixaDireta: arredondar(baixaDireta),
    producao: arredondar(producao),
    consumo: arredondar(baixaDireta + producao),
  };
}

export function calcularFaixaPlanilha(input: ControleEstoqueCalculoInput): FaixaPlanilha {
  const podeCalcularConsumo = input.consumoTotal !== null
    && Number.isFinite(input.consumoTotal)
    && input.diasUteis !== null
    && Number.isFinite(input.diasUteis)
    && input.diasUteis > 0;
  const consumoDia = podeCalcularConsumo
    ? arredondar(Math.max(0, input.consumoTotal as number) / (input.diasUteis as number))
    : null;
  const diasCobertura = input.leadTimeDias !== null
    && input.intervaloCompraDias !== null
    && input.leadTimeDias >= 0
    && input.intervaloCompraDias >= 0
    ? input.leadTimeDias + input.intervaloCompraDias
    : null;

  const minimoCalculado = consumoDia !== null && diasCobertura !== null
    ? Math.ceil(consumoDia * diasCobertura)
    : null;
  const estoqueMinimo = input.estoqueMinimoManual ?? minimoCalculado;
  const origemMinimo: OrigemParametroControleEstoque = input.estoqueMinimoManual != null
    ? 'OVERRIDE'
    : 'CALCULADO';

  const maximoCalculado = consumoDia !== null && diasCobertura !== null && estoqueMinimo !== null
    ? Math.floor(estoqueMinimo + consumoDia * diasCobertura)
    : null;
  const estoqueMaximo = input.estoqueMaximoManual ?? maximoCalculado;
  const origemMaximo: OrigemParametroControleEstoque = input.estoqueMaximoManual != null
    ? 'OVERRIDE'
    : 'CALCULADO';

  const quantidadeComprar = estoqueMaximo === null
    ? null
    : arredondar(Math.max(estoqueMaximo - input.saldoAtual, 0));
  const valorComprar = quantidadeComprar === null || input.precoUnitario === null
    ? null
    : arredondar(quantidadeComprar * input.precoUnitario, 2);

  let status: StatusControleEstoque = 'SEM_DADOS';
  if (estoqueMinimo !== null && estoqueMaximo !== null) {
    status = input.saldoAtual < estoqueMinimo
      ? 'CRITICO'
      : input.saldoAtual < estoqueMaximo
        ? 'ALERTA'
        : 'OK';
  }

  return {
    consumoDia,
    estoqueMinimo,
    estoqueMaximo,
    quantidadeComprar,
    valorComprar,
    status,
    coberturaDias: consumoDia !== null && consumoDia > 0
      ? Math.floor(input.saldoAtual / consumoDia)
      : null,
    autonomiaTorres: input.quantidadePorTorre !== null && input.quantidadePorTorre > 0
      ? arredondar(input.saldoAtual / input.quantidadePorTorre)
      : null,
    origemMinimo,
    origemMaximo,
  };
}

export function calcularFaixaDoItem(item: ControleEstoqueItem): FaixaPlanilha {
  return calcularFaixaPlanilha({
    consumoTotal: item.consumo_total,
    diasUteis: item.dias_uteis,
    leadTimeDias: item.lead_time_dias,
    intervaloCompraDias: item.intervalo_compra_dias,
    saldoAtual: item.saldo_reposicao,
    precoUnitario: item.preco_medio_sap,
    quantidadePorTorre: item.quantidade_por_torre,
    estoqueMinimoManual: item.estoque_minimo_override,
    estoqueMaximoManual: item.estoque_maximo_override,
  });
}

export function deduplicarControleEstoque(
  linhas: LinhaDepositoControleEstoque[],
): ControleEstoqueMaterialConsolidado[] {
  const materiais = new Map<string, {
    descricao: string | null;
    depositos: Map<string, DepositoControleEstoque>;
  }>();

  for (const linha of linhas) {
    const material = linha.material.trim();
    if (!material) continue;
    const atual = materiais.get(material) ?? {
      descricao: linha.descricao,
      depositos: new Map<string, DepositoControleEstoque>(),
    };
    if (!atual.descricao && linha.descricao) atual.descricao = linha.descricao;

    const chaveDeposito = linha.deposito ?? '__SEM_DEPOSITO__';
    const depositoAtual = atual.depositos.get(chaveDeposito) ?? {
      deposito: linha.deposito,
      saldoAtual: 0,
      valorEstoque: 0,
    };
    depositoAtual.saldoAtual = arredondar(depositoAtual.saldoAtual + linha.saldoAtual);
    depositoAtual.valorEstoque = arredondar(depositoAtual.valorEstoque + linha.valorEstoque, 2);
    atual.depositos.set(chaveDeposito, depositoAtual);
    materiais.set(material, atual);
  }

  return Array.from(materiais.entries()).map(([material, valor]) => {
    const depositos = Array.from(valor.depositos.values());
    return {
      material,
      descricao: valor.descricao,
      saldoAtual: arredondar(depositos.reduce((total, deposito) => total + deposito.saldoAtual, 0)),
      valorEstoque: arredondar(
        depositos.reduce((total, deposito) => total + deposito.valorEstoque, 0),
        2,
      ),
      quantidadeDepositos: depositos.length,
      depositos,
    };
  });
}
