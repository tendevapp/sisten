/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  calcularImpostos,
  validarInputsCalcImpostos,
  gerarTextoMemoriaCalculo,
  PRESETS_CODIGOS_FISCAIS,
  INPUTS_PADRAO,
  type CalcImpostosInputs,
} from './calcImpostos';

describe('Motor de Calculo Tributario (calcImpostos)', () => {
  it('calcula corretamente uma operacao padrao sem IPI e sem reducao de base (Preset C1)', () => {
    const inputs: CalcImpostosInputs = {
      precoComImpostos: 1000,
      aliqIcms: 18,
      aliqPis: 1.65,
      aliqCofins: 7.60,
      fatorReducao: 1,
      aliqIpi: 0,
      quantidade: 1,
      unidadePreco: 1,
    };

    const res = calcularImpostos(inputs);

    // 1. Preco Bruto = 1000 * (1 + 0) = 1000
    expect(res.precoBruto).toBe(1000);

    // 2. IPI Apurado = (1000 / 1) * 0 = 0
    expect(res.ipiApurado).toBe(0);

    // 3. Base ICMS = 1000 (sem reducao)
    expect(res.baseIcms).toBe(1000);

    // 4. ICMS Apurado = 1000 * 0.18 = 180
    expect(res.icmsApurado).toBe(180);

    // 5. PIS Apurado = 1000 * 0.0165 = 16.50
    expect(res.pisApurado).toBeCloseTo(16.50, 4);

    // 6. COFINS Apurado = 1000 * 0.0760 = 76.00
    expect(res.cofinsApurado).toBeCloseTo(76.00, 4);

    // 7. Carga Total por Dentro = (1 * 0.18 * 1) + 0.0165 + 0.0760 = 0.2725 (27.25%)
    expect(res.cargaTotalPorDentro).toBeCloseTo(0.2725, 4);

    // Preco Liquido = 1000 * (1 - 0.2725) = 727.50
    expect(res.precoLiquido).toBeCloseTo(727.50, 4);

    // 8. Preco Liquido Unitario = 727.50 / 1 * 1 = 727.50
    expect(res.precoLiquidoUnitario).toBeCloseTo(727.50, 4);
  });

  it('calcula operacao com incidencia de IPI (IPI compoe base do ICMS para Uso/Consumo)', () => {
    const inputs: CalcImpostosInputs = {
      precoComImpostos: 1000,
      aliqIcms: 18,
      aliqPis: 1.65,
      aliqCofins: 7.60,
      fatorReducao: 1,
      aliqIpi: 10, // 10% de IPI
      quantidade: 1,
      unidadePreco: 1,
    };

    const res = calcularImpostos(inputs);

    // 1. Preco Bruto = 1000 * (1 + 0.10) = 1100
    expect(res.precoBruto).toBeCloseTo(1100, 4);

    // 2. IPI Apurado = (1100 / 1.10) * 0.10 = 100
    expect(res.ipiApurado).toBeCloseTo(100, 4);

    // 3. Base de Calculo do ICMS = Preco Bruto (1100, pois IPI integra base de Uso/Consumo)
    expect(res.baseIcms).toBeCloseTo(1100, 4);

    // 4. ICMS Apurado = 1100 * 0.18 = 198
    expect(res.icmsApurado).toBeCloseTo(198, 4);

    // 5. PIS Apurado = 1000 * 0.0165 = 16.50
    expect(res.pisApurado).toBeCloseTo(16.50, 4);

    // 6. COFINS Apurado = 1000 * 0.076 = 76.00
    expect(res.cofinsApurado).toBeCloseTo(76.00, 4);

    // 7. Fator Efetivo ICMS = 1 * 0.18 * 1.10 = 0.198 (19.8%)
    expect(res.fatorEfetivoIcms).toBeCloseTo(0.198, 4);

    // Carga Total por Dentro = 0.198 + 0.0165 + 0.0760 = 0.2905
    expect(res.cargaTotalPorDentro).toBeCloseTo(0.2905, 4);

    // Preco Liquido = (1100 / 1.10) * (1 - 0.2905) = 1000 * 0.7095 = 709.50
    expect(res.precoLiquido).toBeCloseTo(709.50, 4);
    expect(res.precoLiquidoUnitario).toBeCloseTo(709.50, 4);
  });

  it('calcula reducao de base do ICMS (Preset A3 - Convenio 52/91, fator 0.6667)', () => {
    const inputs: CalcImpostosInputs = {
      precoComImpostos: 1000,
      aliqIcms: 12,
      aliqPis: 1.65,
      aliqCofins: 7.60,
      fatorReducao: 0.6667,
      aliqIpi: 0,
      quantidade: 1,
      unidadePreco: 1,
    };

    const res = calcularImpostos(inputs);

    expect(res.precoBruto).toBe(1000);
    expect(res.temReducaoBaseIcms).toBe(true);

    // Base ICMS = 1000 * 0.6667 = 666.70
    expect(res.baseIcms).toBeCloseTo(666.70, 2);

    // ICMS Apurado = 666.70 * 0.12 = 80.004
    expect(res.icmsApurado).toBeCloseTo(80.004, 3);

    // Fator Efetivo ICMS = 0.6667 * 0.12 * 1 = 0.080004 (8.00%)
    expect(res.fatorEfetivoIcms).toBeCloseTo(0.080004, 5);

    // Carga Total por Dentro = 0.080004 + 0.0165 + 0.0760 = 0.172504
    expect(res.cargaTotalPorDentro).toBeCloseTo(0.172504, 5);

    // Preco Liquido = 1000 * (1 - 0.172504) = 827.496
    expect(res.precoLiquido).toBeCloseTo(827.496, 3);
  });

  it('calcula preco unitario com quantidade maior que 1 e unidade de preco 100 ou 1000', () => {
    const inputs: CalcImpostosInputs = {
      precoComImpostos: 5000,
      aliqIcms: 18,
      aliqPis: 1.65,
      aliqCofins: 7.60,
      fatorReducao: 1,
      aliqIpi: 0,
      quantidade: 50, // 50 unidades
      unidadePreco: 1, // Preco unitario por 1 UN
    };

    const res = calcularImpostos(inputs);

    // Preco liquido total = 5000 * (1 - 0.2725) = 3637.50
    expect(res.precoLiquido).toBeCloseTo(3637.50, 4);

    // Preco liquido unitario = 3637.50 / 50 = 72.75
    expect(res.precoLiquidoUnitario).toBeCloseTo(72.75, 4);

    // Testando com unidade de preco = 100 (ex: cotacao por cento)
    const resPorCento = calcularImpostos({
      ...inputs,
      unidadePreco: 100,
    });
    expect(resPorCento.precoLiquidoUnitario).toBeCloseTo(7275, 2);
  });

  it('trata com seguranca divisao por zero (quantidade = 0 ou unidadePreco = 0)', () => {
    const inputs: CalcImpostosInputs = {
      precoComImpostos: 1000,
      aliqIcms: 18,
      aliqPis: 1.65,
      aliqCofins: 7.60,
      fatorReducao: 1,
      aliqIpi: 0,
      quantidade: 0,
      unidadePreco: 0,
    };

    const res = calcularImpostos(inputs);

    expect(Number.isFinite(res.precoLiquidoUnitario)).toBe(true);
    expect(res.precoLiquidoUnitario).toBeGreaterThan(0);
  });

  it('todos os presets fiscais oficiais funcionam e geram valores validos', () => {
    for (const preset of PRESETS_CODIGOS_FISCAIS) {
      const inputs: CalcImpostosInputs = {
        precoComImpostos: 1000,
        aliqIcms: preset.aliqIcms,
        aliqPis: preset.aliqPis,
        aliqCofins: preset.aliqCofins,
        aliqIpi: preset.aliqIpi,
        fatorReducao: preset.fatorReducao,
        quantidade: 1,
        unidadePreco: 1,
      };

      const res = calcularImpostos(inputs);

      expect(res.precoBruto).toBeGreaterThanOrEqual(1000);
      expect(res.precoLiquido).toBeGreaterThan(0);
      expect(res.linhasImpostos.length).toBe(4);
    }
  });

  it('valida inputs invalidos e retorna mensagens adequadas', () => {
    const errosPrecoNegativo = validarInputsCalcImpostos({
      precoComImpostos: -50,
      aliqIcms: 150,
      fatorReducao: 1.5,
    });

    expect(errosPrecoNegativo.precoComImpostos).toContain('nao pode ser negativo');
    expect(errosPrecoNegativo.aliqIcms).toContain('entre 0% e 100%');
    expect(errosPrecoNegativo.fatorReducao).toContain('entre 0 e 1');

    const errosVazios = validarInputsCalcImpostos(INPUTS_PADRAO);
    expect(Object.keys(errosVazios).length).toBe(0);
  });

  it('garante que o preset inicial INPUTS_PADRAO inicia com todos os tributos em 0%', () => {
    expect(INPUTS_PADRAO.aliqIcms).toBe(0);
    expect(INPUTS_PADRAO.aliqPis).toBe(0);
    expect(INPUTS_PADRAO.aliqCofins).toBe(0);
    expect(INPUTS_PADRAO.aliqIpi).toBe(0);
    expect(INPUTS_PADRAO.fatorReducao).toBe(1);

    const res = calcularImpostos(INPUTS_PADRAO);
    expect(res.cargaTotalPorDentro).toBe(0);
    expect(res.icmsApurado).toBe(0);
    expect(res.pisApurado).toBe(0);
    expect(res.cofinsApurado).toBe(0);
    expect(res.ipiApurado).toBe(0);
    expect(res.precoLiquido).toBe(INPUTS_PADRAO.precoComImpostos);
  });

  it('gera texto legivel e completo da memoria de calculo para exportacao', () => {
    const res = calcularImpostos(INPUTS_PADRAO);
    const texto = gerarTextoMemoriaCalculo(INPUTS_PADRAO, res);

    expect(texto).toContain('MEMORIA DE CALCULO FISCAL');
    expect(texto).toContain('PRECO BRUTO (VALOR DA NF)');
    expect(texto).toContain('PRECO LIQUIDO TOTAL');
    expect(texto).toContain('ICMS Apurado');
    expect(texto).toContain('PIS Apurado');
    expect(texto).toContain('COFINS Apurado');
  });
});
