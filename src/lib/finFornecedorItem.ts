export type StatusPagamentoRastreado =
  | 'SEM_VINCULO_FBL1N'
  | 'PAGO_PARCIAL'
  | 'PAGO_TOTAL'
  | 'PAGAMENTO_SUPERIOR_A_NF';

export type AgrupamentoPreco = 'dia' | 'semana' | 'mes';

export interface LinhaHistoricoPreco {
  dataDocumento: string | null;
  precoUnitario: number | null;
  quantidade: number | null;
  numeroNf: string;
}

export interface PontoHistoricoPreco {
  periodo: string;
  precoUnitario: number;
  quantidade: number;
  qtdNfs: number;
}

export interface LinhaValorPorPeriodo {
  dataDocumento: string | null;
  valorFaturado: number | null;
  valorPagoRastreado: number | null;
}

export interface PontoValorAcumulado {
  periodo: string;
  valorFaturado: number;
  valorPagoRastreado: number;
  faturadoAcumulado: number;
  pagoAcumulado: number;
}

export interface PrecoUnitarioFiscalInput {
  precoLiquido: number | null | undefined;
  total: number | null | undefined;
  quantidade: number | null | undefined;
}

export interface LinhaFornecedorItem {
  id: number;
  fornecedorCodigo: string;
  fornecedorNome: string;
  itemChave: string;
  descricaoItem: string;
  tipoItem: 'MATERIAL' | 'SERVICO' | 'SEM_ITEM';
  dataDocumento: string | null;
  quantidade: number | null;
  valorItemNf: number | null;
  valorPagoRateado: number | null;
  precoUnitario: number | null;
  numeroNf: string;
  statusPagamento: StatusPagamentoRastreado;
}

export interface ResumoFornecedorItem {
  fornecedorCodigo: string;
  fornecedorNome: string;
  itemChave: string;
  descricaoItem: string;
  tipoItem: LinhaFornecedorItem['tipoItem'];
  quantidade: number;
  valorFaturado: number;
  valorPagoRastreado: number;
  qtdNfs: number;
  precoUnitarioAtual: number | null;
  precoUnitarioAnterior: number | null;
  variacaoPrecoPct: number | null;
  statusPagamento: StatusPagamentoRastreado;
  dataUltimaCompra: string | null;
}

const EPSILON = 0.01;

const numberOrZero = (value: number | null | undefined) => Number.isFinite(value) ? Number(value) : 0;

export function chaveFornecedorItem(fornecedorCodigo: string, itemChave: string): string {
  return `${fornecedorCodigo}::${itemChave}`;
}

function inicioDaSemanaISO(dataISO: string): string {
  const [ano, mes, dia] = dataISO.split('-').map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  const ajuste = (data.getUTCDay() + 6) % 7;
  data.setUTCDate(data.getUTCDate() - ajuste);
  return data.toISOString().slice(0, 10);
}

export function rotuloSemanaISO(dataISO: string): string {
  const [ano, mes, dia] = dataISO.split('-').map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  const diaDaSemana = data.getUTCDay() || 7;
  data.setUTCDate(data.getUTCDate() + 4 - diaDaSemana);
  const inicioAno = new Date(Date.UTC(data.getUTCFullYear(), 0, 1));
  const semana = Math.ceil((((data.getTime() - inicioAno.getTime()) / 86_400_000) + 1) / 7);
  return `W${String(semana).padStart(2, '0')}`;
}

export function periodoDoAgrupamento(dataISO: string, agrupamento: AgrupamentoPreco): string {
  if (agrupamento === 'dia') return dataISO;
  if (agrupamento === 'semana') return inicioDaSemanaISO(dataISO);
  return dataISO.slice(0, 7);
}

export function agruparHistoricoPreco(linhas: LinhaHistoricoPreco[], agrupamento: AgrupamentoPreco): PontoHistoricoPreco[] {
  const grupos = new Map<string, { somaPonderada: number; quantidadePonderada: number; somaPrecos: number; quantidade: number; registros: number; nfs: Set<string> }>();

  linhas.forEach(linha => {
    const preco = numberOrZero(linha.precoUnitario);
    if (!linha.dataDocumento || preco <= 0) return;
    const periodo = periodoDoAgrupamento(linha.dataDocumento, agrupamento);
    const atual = grupos.get(periodo) || { somaPonderada: 0, quantidadePonderada: 0, somaPrecos: 0, quantidade: 0, registros: 0, nfs: new Set<string>() };
    const quantidade = numberOrZero(linha.quantidade);
    if (quantidade > 0) {
      atual.somaPonderada += preco * quantidade;
      atual.quantidadePonderada += quantidade;
      atual.quantidade += quantidade;
    }
    atual.somaPrecos += preco;
    atual.registros += 1;
    atual.nfs.add(linha.numeroNf);
    grupos.set(periodo, atual);
  });

  return Array.from(grupos.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([periodo, grupo]) => ({
      periodo,
      precoUnitario: grupo.quantidadePonderada > 0 ? grupo.somaPonderada / grupo.quantidadePonderada : grupo.somaPrecos / grupo.registros,
      quantidade: grupo.quantidade,
      qtdNfs: grupo.nfs.size,
    }));
}

export function acumularValoresPorPeriodo(linhas: LinhaValorPorPeriodo[], agrupamento: AgrupamentoPreco): PontoValorAcumulado[] {
  const grupos = new Map<string, { valorFaturado: number; valorPagoRastreado: number }>();

  linhas.forEach(linha => {
    if (!linha.dataDocumento) return;
    const periodo = periodoDoAgrupamento(linha.dataDocumento, agrupamento);
    const atual = grupos.get(periodo) || { valorFaturado: 0, valorPagoRastreado: 0 };
    atual.valorFaturado += numberOrZero(linha.valorFaturado);
    atual.valorPagoRastreado += numberOrZero(linha.valorPagoRastreado);
    grupos.set(periodo, atual);
  });

  let faturadoAcumulado = 0;
  let pagoAcumulado = 0;
  return Array.from(grupos.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([periodo, grupo]) => {
      faturadoAcumulado += grupo.valorFaturado;
      pagoAcumulado += grupo.valorPagoRastreado;
      return { periodo, ...grupo, faturadoAcumulado, pagoAcumulado };
    });
}

export function calcularPrecoUnitarioFiscal({ precoLiquido, total, quantidade }: PrecoUnitarioFiscalInput): number | null {
  if (numberOrZero(precoLiquido) > 0) return Number(precoLiquido);
  if (numberOrZero(quantidade) > 0) return numberOrZero(total) / Number(quantidade);
  return null;
}

export function statusPagamentoRastreado(valorNf: number | null | undefined, valorPagoBruto: number | null | undefined): StatusPagamentoRastreado {
  const nf = numberOrZero(valorNf);
  const pago = numberOrZero(valorPagoBruto);
  if (pago <= 0) return 'SEM_VINCULO_FBL1N';
  if (pago > nf + EPSILON) return 'PAGAMENTO_SUPERIOR_A_NF';
  if (pago >= nf - EPSILON) return 'PAGO_TOTAL';
  return 'PAGO_PARCIAL';
}

function prioridadeStatus(status: StatusPagamentoRastreado): number {
  switch (status) {
    case 'PAGAMENTO_SUPERIOR_A_NF': return 4;
    case 'PAGO_PARCIAL': return 3;
    case 'SEM_VINCULO_FBL1N': return 2;
    case 'PAGO_TOTAL': return 1;
  }
}

export function resumirFornecedorItem(linhas: LinhaFornecedorItem[]): ResumoFornecedorItem[] {
  const groups = new Map<string, LinhaFornecedorItem[]>();
  for (const linha of linhas) {
    const key = chaveFornecedorItem(linha.fornecedorCodigo, linha.itemChave);
    const current = groups.get(key) || [];
    current.push(linha);
    groups.set(key, current);
  }

  return Array.from(groups.values()).map(group => {
    const ordered = [...group].sort((a, b) =>
      (a.dataDocumento || '').localeCompare(b.dataDocumento || '') || a.id - b.id,
    );
    const latest = ordered.at(-1)!;
    const precosValidos = ordered.filter(row => numberOrZero(row.precoUnitario) > 0);
    const ultimoPreco = precosValidos.at(-1)?.precoUnitario ?? null;
    const precoAnterior = precosValidos.length > 1 ? precosValidos.at(-2)?.precoUnitario ?? null : null;
    const piorStatus = ordered.reduce((current, row) =>
      prioridadeStatus(row.statusPagamento) > prioridadeStatus(current) ? row.statusPagamento : current,
      ordered[0].statusPagamento,
    );

    return {
      fornecedorCodigo: latest.fornecedorCodigo,
      fornecedorNome: latest.fornecedorNome,
      itemChave: latest.itemChave,
      descricaoItem: latest.descricaoItem,
      tipoItem: latest.tipoItem,
      quantidade: ordered.reduce((sum, row) => sum + numberOrZero(row.quantidade), 0),
      valorFaturado: ordered.reduce((sum, row) => sum + numberOrZero(row.valorItemNf), 0),
      valorPagoRastreado: ordered.reduce((sum, row) => sum + numberOrZero(row.valorPagoRateado), 0),
      qtdNfs: new Set(ordered.map(row => row.numeroNf)).size,
      precoUnitarioAtual: ultimoPreco,
      precoUnitarioAnterior: precoAnterior,
      variacaoPrecoPct: ultimoPreco && precoAnterior ? ((ultimoPreco / precoAnterior) - 1) * 100 : null,
      statusPagamento: piorStatus,
      dataUltimaCompra: latest.dataDocumento,
    };
  });
}
