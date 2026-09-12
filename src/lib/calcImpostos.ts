/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Motor de calculo tributario e fiscal para precificacao e apuracao
 * de compras destinadas a Uso e Consumo ou Ativo Imobilizado.
 * Regras tributarias brasileiras (ICMS, PIS, COFINS, IPI).
 */

export interface CalcImpostosInputs {
  /** Preco com ICMS, PIS e COFINS (R$) - obrigatorio */
  precoComImpostos: number;
  /** Aliquota de ICMS em porcentagem (ex: 18 para 18%) */
  aliqIcms: number;
  /** Aliquota de PIS em porcentagem (ex: 1.65 para 1.65%) */
  aliqPis: number;
  /** Aliquota de COFINS em porcentagem (ex: 7.60 para 7.60%) */
  aliqCofins: number;
  /** Fator de reducao da base de calculo do ICMS (0 a 1; padrao 1 = 100% da base) */
  fatorReducao: number;
  /** Aliquota de IPI em porcentagem (ex: 10 para 10%) */
  aliqIpi: number;
  /** Quantidade de itens (padrao 1) */
  quantidade: number;
  /** Unidade de preco no ERP / Price Unit (ex: 1, 100, 1000 - padrao 1) */
  unidadePreco: number;
}

export interface ImpostoLinhaDiscriminada {
  codigo: 'IPI' | 'ICMS' | 'PIS' | 'COFINS';
  nome: string;
  baseCalculo: number;
  aliquotaNominal: number;
  aliquotaEfetiva: number;
  valorApurado: number;
  tipoIncidencia: 'por_fora' | 'por_dentro';
  observacao?: string;
}

export interface CalculoImpostosResultado {
  /** 1. Preco Bruto (Valor total da NF com IPI) */
  precoBruto: number;
  /** 2. IPI Apurado */
  ipiApurado: number;
  /** 3. Base de Calculo do ICMS */
  baseIcms: number;
  /** 4. ICMS Apurado */
  icmsApurado: number;
  /** 5. PIS Apurado */
  pisApurado: number;
  /** 6. COFINS Apurado */
  cofinsApurado: number;
  /** Fator Efetivo de ICMS considerando reducao e incorporacao do IPI */
  fatorEfetivoIcms: number;
  /** Carga Total por Dentro (ICMS efetivo + PIS + COFINS) */
  cargaTotalPorDentro: number;
  /** 7. Preco Liquido Total (Deducao dos impostos) */
  precoLiquido: number;
  /** 8. Preco Liquido Unitario (considerando quantidade e unidade de preco) */
  precoLiquidoUnitario: number;
  /** Soma de todos os impostos apurados */
  totalImpostos: number;
  /** Carga tributaria percentual sobre o Preco Bruto */
  cargaTributariaPercentualSobreBruto: number;
  /** Linhas detalhadas para cada imposto */
  linhasImpostos: ImpostoLinhaDiscriminada[];
  /** Indicador se houve reducao de base no ICMS */
  temReducaoBaseIcms: boolean;
  /** Percentual de desoneracao / reducao da base */
  percentualReducaoBase: number;
}

export interface CodigoFiscalPreset {
  codigo: string;
  titulo: string;
  descricao: string;
  aliqIcms: number;
  aliqPis: number;
  aliqCofins: number;
  aliqIpi: number;
  fatorReducao: number;
}

export const PRESETS_CODIGOS_FISCAIS: CodigoFiscalPreset[] = [
  {
    codigo: 'C1',
    titulo: 'C1 - Geral / Interna (18%)',
    descricao: 'Operacao interna padrao com ICMS 18%, PIS 1,65%, COFINS 7,60% e sem IPI',
    aliqIcms: 18,
    aliqPis: 1.65,
    aliqCofins: 7.60,
    aliqIpi: 0,
    fatorReducao: 1,
  },
  {
    codigo: 'C2',
    titulo: 'C2 - Interestadual Sul/Sudeste (12%)',
    descricao: 'Aliquota interestadual de 12% (origem Sul/Sudeste exceto ES para BA)',
    aliqIcms: 12,
    aliqPis: 1.65,
    aliqCofins: 7.60,
    aliqIpi: 0,
    fatorReducao: 1,
  },
  {
    codigo: 'C3',
    titulo: 'C3 - Interestadual Norte/NE/CO (7%)',
    descricao: 'Aliquota interestadual de 7% (origem Norte/Nordeste/Centro-Oeste e ES para BA)',
    aliqIcms: 7,
    aliqPis: 1.65,
    aliqCofins: 7.60,
    aliqIpi: 0,
    fatorReducao: 1,
  },
  {
    codigo: 'C4',
    titulo: 'C4 - Importados Res. 13/12 (4%)',
    descricao: 'Aliquota interestadual de 4% para produtos com conteudo de importacao superior a 40%',
    aliqIcms: 4,
    aliqPis: 1.65,
    aliqCofins: 7.60,
    aliqIpi: 0,
    fatorReducao: 1,
  },
  {
    codigo: 'C5',
    titulo: 'C5 - Industrializado c/ IPI (10%)',
    descricao: 'Operacao com IPI (10%) incorporado a base do ICMS para Uso/Consumo',
    aliqIcms: 18,
    aliqPis: 1.65,
    aliqCofins: 7.60,
    aliqIpi: 10,
    fatorReducao: 1,
  },
  {
    codigo: 'A3',
    titulo: 'A3 - Ativo Imobilizado / Reducao Base',
    descricao: 'Convenio ICMS 52/91: Fator 0,6667 (reducao de 33,33% na base de calculo)',
    aliqIcms: 12,
    aliqPis: 1.65,
    aliqCofins: 7.60,
    aliqIpi: 0,
    fatorReducao: 0.6667,
  },
  {
    codigo: 'ISENTO',
    titulo: 'Isento / Simples / Desonerado',
    descricao: 'Operacoes sem incidencia ou desoneradas de ICMS, PIS, COFINS e IPI',
    aliqIcms: 0,
    aliqPis: 0,
    aliqCofins: 0,
    aliqIpi: 0,
    fatorReducao: 1,
  },
];

export const INPUTS_PADRAO: CalcImpostosInputs = {
  precoComImpostos: 1000,
  aliqIcms: 18,
  aliqPis: 1.65,
  aliqCofins: 7.60,
  fatorReducao: 1,
  aliqIpi: 0,
  quantidade: 1,
  unidadePreco: 1,
};

/**
 * Valida os inputs da calculadora fiscal e retorna eventuais mensagens de erro.
 */
export function validarInputsCalcImpostos(inputs: Partial<CalcImpostosInputs>): Record<string, string> {
  const erros: Record<string, string> = {};

  if (inputs.precoComImpostos === undefined || inputs.precoComImpostos === null || Number.isNaN(inputs.precoComImpostos)) {
    erros.precoComImpostos = 'Informe o preco com impostos.';
  } else if (inputs.precoComImpostos < 0) {
    erros.precoComImpostos = 'O preco nao pode ser negativo.';
  }

  if (inputs.aliqIcms !== undefined && (inputs.aliqIcms < 0 || inputs.aliqIcms > 100)) {
    erros.aliqIcms = 'Aliquota de ICMS deve estar entre 0% e 100%.';
  }

  if (inputs.aliqPis !== undefined && (inputs.aliqPis < 0 || inputs.aliqPis > 100)) {
    erros.aliqPis = 'Aliquota de PIS deve estar entre 0% e 100%.';
  }

  if (inputs.aliqCofins !== undefined && (inputs.aliqCofins < 0 || inputs.aliqCofins > 100)) {
    erros.aliqCofins = 'Aliquota de COFINS deve estar entre 0% e 100%.';
  }

  if (inputs.aliqIpi !== undefined && (inputs.aliqIpi < 0 || inputs.aliqIpi > 100)) {
    erros.aliqIpi = 'Aliquota de IPI deve estar entre 0% e 100%.';
  }

  if (inputs.fatorReducao !== undefined && (inputs.fatorReducao < 0 || inputs.fatorReducao > 1)) {
    erros.fatorReducao = 'Fator de reducao deve ser um decimal entre 0 e 1 (ex: 0,6667 ou 1).';
  }

  if (inputs.quantidade !== undefined && inputs.quantidade <= 0) {
    erros.quantidade = 'A quantidade deve ser maior que zero.';
  }

  if (inputs.unidadePreco !== undefined && inputs.unidadePreco <= 0) {
    erros.unidadePreco = 'A unidade de preco deve ser maior que zero.';
  }

  return erros;
}

/**
 * Executa o calculo tributario seguindo estritamente as formulas fiscais para
 * operacoes de Uso e Consumo ou Ativo Imobilizado.
 */
export function calcularImpostos(inputs: CalcImpostosInputs): CalculoImpostosResultado {
  // Normalizacao segura das entradas
  const precoComImpostos = Math.max(0, Number(inputs.precoComImpostos) || 0);
  const aliqIcmsDec = Math.max(0, Number(inputs.aliqIcms) || 0) / 100;
  const aliqPisDec = Math.max(0, Number(inputs.aliqPis) || 0) / 100;
  const aliqCofinsDec = Math.max(0, Number(inputs.aliqCofins) || 0) / 100;
  const aliqIpiDec = Math.max(0, Number(inputs.aliqIpi) || 0) / 100;

  const fatorReducaoRaw = Number(inputs.fatorReducao);
  const fatorReducao = Number.isFinite(fatorReducaoRaw) && fatorReducaoRaw >= 0 && fatorReducaoRaw <= 1
    ? fatorReducaoRaw
    : 1;

  const quantidade = inputs.quantidade > 0 ? inputs.quantidade : 1;
  const unidadePreco = inputs.unidadePreco > 0 ? inputs.unidadePreco : 1;

  // 1. Preco Bruto (Valor da NF):
  // Preco_Bruto = Preco_com_ICMS_PIS_COFINS * (1 + Aliq_IPI)
  const divisorIpi = 1 + aliqIpiDec;
  const precoBruto = precoComImpostos * divisorIpi;

  // 2. IPI Apurado:
  // IPI_Apurado = (Preco_Bruto / (1 + Aliq_IPI)) * Aliq_IPI
  const ipiApurado = divisorIpi > 0 ? (precoBruto / divisorIpi) * aliqIpiDec : 0;

  // 3. Base de Calculo do ICMS:
  // Se Fator_Reducao > 0 E Fator_Reducao < 1: Base_ICMS = Preco_Bruto * Fator_Reducao
  // Caso contrario: Base_ICMS = Preco_Bruto
  const temReducaoBaseIcms = fatorReducao > 0 && fatorReducao < 1;
  const baseIcms = temReducaoBaseIcms ? precoBruto * fatorReducao : precoBruto;

  // 4. ICMS Apurado:
  // ICMS_Apurado = Base_ICMS * Aliq_ICMS
  const icmsApurado = baseIcms * aliqIcmsDec;

  // 5. PIS Apurado:
  // PIS_Apurado = Preco_com_ICMS_PIS_COFINS * Aliq_PIS
  const pisApurado = precoComImpostos * aliqPisDec;

  // 6. COFINS Apurado:
  // COFINS_Apurado = Preco_com_ICMS_PIS_COFINS * Aliq_COFINS
  const cofinsApurado = precoComImpostos * aliqCofinsDec;

  // 7. Preco Liquido (Deducao de Impostos):
  // Fator_Efetivo_ICMS = (Fator_Reducao > 0 ? Fator_Reducao : 1) * Aliq_ICMS * (1 + Aliq_IPI)
  // Carga_Total_Por_Dentro = Fator_Efetivo_ICMS + Aliq_PIS + Aliq_COFINS
  // Preco_Liquido = (Preco_Bruto / (1 + Aliq_IPI)) * (1 - Carga_Total_Por_Dentro)
  const fatorEfetivoIcms = (fatorReducao > 0 ? fatorReducao : 1) * aliqIcmsDec * divisorIpi;
  const cargaTotalPorDentro = fatorEfetivoIcms + aliqPisDec + aliqCofinsDec;
  const precoLiquido = divisorIpi > 0 ? (precoBruto / divisorIpi) * (1 - cargaTotalPorDentro) : 0;

  // 8. Preco Liquido Unitario:
  // Tratar divisao por zero caso Quantidade seja 0 ou vazia (assumir Quantidade = 1)
  // Fator_Unitario = Unidade_de_Preco > 0 ? Unidade_de_Preco : 1
  // Preco_Liquido_Unitario = (Preco_Liquido / Quantidade) * Fator_Unitario
  const precoLiquidoUnitario = (precoLiquido / quantidade) * unidadePreco;

  // Totais e consolidacoes
  const totalImpostos = ipiApurado + icmsApurado + pisApurado + cofinsApurado;
  const cargaTributariaPercentualSobreBruto = precoBruto > 0 ? (totalImpostos / precoBruto) * 100 : 0;
  const percentualReducaoBase = temReducaoBaseIcms ? (1 - fatorReducao) * 100 : 0;

  // Montagem discriminada das linhas de cada tributo
  const linhasImpostos: ImpostoLinhaDiscriminada[] = [
    {
      codigo: 'IPI',
      nome: 'IPI (Imposto sobre Produtos Industrializados)',
      baseCalculo: precoComImpostos,
      aliquotaNominal: inputs.aliqIpi,
      aliquotaEfetiva: inputs.aliqIpi,
      valorApurado: ipiApurado,
      tipoIncidencia: 'por_fora',
      observacao: aliqIpiDec > 0 ? 'Incide por fora sobre o preco da mercadoria e integra a base do ICMS' : 'Sem incidencia de IPI',
    },
    {
      codigo: 'ICMS',
      nome: 'ICMS (Operacao Própria)',
      baseCalculo: baseIcms,
      aliquotaNominal: inputs.aliqIcms,
      aliquotaEfetiva: divisorIpi > 0 ? (icmsApurado / (precoBruto / divisorIpi)) * 100 : inputs.aliqIcms,
      valorApurado: icmsApurado,
      tipoIncidencia: 'por_dentro',
      observacao: temReducaoBaseIcms
        ? `Base reduzida em ${percentualReducaoBase.toFixed(2)}% (Fator ${fatorReducao.toFixed(4)})`
        : aliqIpiDec > 0
          ? 'Base de calculo inclui o valor do IPI (Uso/Consumo)'
          : 'Base integral sem reducao',
    },
    {
      codigo: 'PIS',
      nome: 'PIS (Programa de Integracao Social)',
      baseCalculo: precoComImpostos,
      aliquotaNominal: inputs.aliqPis,
      aliquotaEfetiva: inputs.aliqPis,
      valorApurado: pisApurado,
      tipoIncidencia: 'por_dentro',
      observacao: 'Regime nao-cumulativo (padrao 1,65%)',
    },
    {
      codigo: 'COFINS',
      nome: 'COFINS (Financiamento da Seguridade Social)',
      baseCalculo: precoComImpostos,
      aliquotaNominal: inputs.aliqCofins,
      aliquotaEfetiva: inputs.aliqCofins,
      valorApurado: cofinsApurado,
      tipoIncidencia: 'por_dentro',
      observacao: 'Regime nao-cumulativo (padrao 7,60%)',
    },
  ];

  return {
    precoBruto,
    ipiApurado,
    baseIcms,
    icmsApurado,
    pisApurado,
    cofinsApurado,
    fatorEfetivoIcms,
    cargaTotalPorDentro,
    precoLiquido,
    precoLiquidoUnitario,
    totalImpostos,
    cargaTributariaPercentualSobreBruto,
    linhasImpostos,
    temReducaoBaseIcms,
    percentualReducaoBase,
  };
}

/**
 * Formata um resumo textual completo da memoria de calculo para exportacao
 * ou copia rapida para area de transferencia (clipboard).
 */
export function gerarTextoMemoriaCalculo(inputs: CalcImpostosInputs, resultado: CalculoImpostosResultado): string {
  const formataMoeda = (v: number) =>
    v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const formataPct = (v: number) => `${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

  return [
    '================================================================',
    '       MEMORIA DE CALCULO FISCAL - USO E CONSUMO / IMOBILIZADO',
    '       SISTEN - Modulo de Suprimentos & Engenharia Tributaria',
    '================================================================',
    '',
    '1. PARAMETROS DE ENTRADA:',
    `   - Preco com ICMS, PIS e COFINS: ${formataMoeda(inputs.precoComImpostos)}`,
    `   - Aliquota de ICMS: ${formataPct(inputs.aliqIcms)}`,
    `   - Aliquota de PIS: ${formataPct(inputs.aliqPis)}`,
    `   - Aliquota de COFINS: ${formataPct(inputs.aliqCofins)}`,
    `   - Aliquota de IPI: ${formataPct(inputs.aliqIpi)}`,
    `   - Fator de Reducao da Base do ICMS: ${inputs.fatorReducao}${resultado.temReducaoBaseIcms ? ` (Reducao de ${resultado.percentualReducaoBase.toFixed(2)}%)` : ' (Sem reducao)'}`,
    `   - Quantidade: ${inputs.quantidade}`,
    `   - Unidade de Preco (Price Unit): ${inputs.unidadePreco}`,
    '',
    '2. APURACAO DOS TRIBUTOS:',
    `   - IPI Apurado (Base: ${formataMoeda(inputs.precoComImpostos)} x ${formataPct(inputs.aliqIpi)}): ${formataMoeda(resultado.ipiApurado)}`,
    `   - Base de Calculo do ICMS: ${formataMoeda(resultado.baseIcms)}`,
    `   - ICMS Apurado (Base: ${formataMoeda(resultado.baseIcms)} x ${formataPct(inputs.aliqIcms)}): ${formataMoeda(resultado.icmsApurado)}`,
    `   - PIS Apurado (Base: ${formataMoeda(inputs.precoComImpostos)} x ${formataPct(inputs.aliqPis)}): ${formataMoeda(resultado.pisApurado)}`,
    `   - COFINS Apurado (Base: ${formataMoeda(inputs.precoComImpostos)} x ${formataPct(inputs.aliqCofins)}): ${formataMoeda(resultado.cofinsApurado)}`,
    `   - Total de Tributos Apurados: ${formataMoeda(resultado.totalImpostos)}`,
    '',
    '3. RESULTADOS FINAIS DE PRECIFICAO:',
    `   - PRECO BRUTO (VALOR DA NF): ${formataMoeda(resultado.precoBruto)}`,
    `   - Carga Total de Tributos por Dentro: ${formataPct(resultado.cargaTotalPorDentro * 100)}`,
    `   - PRECO LIQUIDO TOTAL (Deducao Impostos): ${formataMoeda(resultado.precoLiquido)}`,
    `   - PRECO LIQUIDO UNITARIO: ${formataMoeda(resultado.precoLiquidoUnitario)} (por ${inputs.unidadePreco} UN)`,
    '',
    '4. FORMULAS APLICADAS:',
    '   * Preco_Bruto = Preco_com_Impostos * (1 + Aliq_IPI)',
    '   * IPI_Apurado = (Preco_Bruto / (1 + Aliq_IPI)) * Aliq_IPI',
    '   * Base_ICMS = Preco_Bruto * Fator_Reducao',
    '   * ICMS_Apurado = Base_ICMS * Aliq_ICMS',
    '   * PIS_Apurado = Preco_com_Impostos * Aliq_PIS',
    '   * COFINS_Apurado = Preco_com_Impostos * Aliq_COFINS',
    '   * Fator_Efetivo_ICMS = Fator_Reducao * Aliq_ICMS * (1 + Aliq_IPI)',
    '   * Carga_Total_Por_Dentro = Fator_Efetivo_ICMS + Aliq_PIS + Aliq_COFINS',
    '   * Preco_Liquido = (Preco_Bruto / (1 + Aliq_IPI)) * (1 - Carga_Total_Por_Dentro)',
    '   * Preco_Liquido_Unitario = (Preco_Liquido / Quantidade) * Unidade_de_Preco',
    '================================================================',
  ].join('\n');
}
