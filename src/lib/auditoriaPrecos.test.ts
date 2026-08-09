/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  fatorIpca,
  classificarConfianca,
  classificarVeredito,
  ehLoteAtipico,
  ehConfiavel,
  resumirAuditoria,
  normalizarCompra,
  FATOR_LOTE_ATIPICO,
} from './auditoriaPrecos';
import { AuditoriaCompra } from '../types';

// Recorte real da série do IBGE (agregada 1737, variável 2266) usada pela
// migration. Mantido com valores verdadeiros para os fatores conferirem contra
// uma calculadora de correção monetária.
const INDICES = new Map<string, number>([
  ['2014-10', 4008.0],
  ['2015-01', 4110.2],
  ['2015-06', 4310.39],
  ['2020-12', 5560.59],
  ['2023-12', 6773.27],
  ['2026-06', 7652.37],
]);

describe('fatorIpca', () => {
  it('traz o valor da data da compra até o último mês da série', () => {
    // jun/2015 → jun/2026: 7652,37 / 4310,39 = 1,7754…
    expect(fatorIpca('2015-06-15', INDICES)).toBeCloseTo(7652.37 / 4310.39, 6);
  });

  it('usa o último mês da série disponível, não o mês seguinte à compra', () => {
    expect(fatorIpca('2020-12-31', INDICES)).toBeCloseTo(7652.37 / 5560.59, 6);
  });

  it('devolve 1 para compra no próprio mês de referência', () => {
    expect(fatorIpca('2026-06-20', INDICES)).toBeCloseTo(1, 10);
  });

  it('cai no mês anterior mais próximo quando o mês exato não está na série', () => {
    // set/2015 não existe no recorte; o índice aplicável é o de jun/2015.
    expect(fatorIpca('2015-09-10', INDICES)).toBeCloseTo(7652.37 / 4310.39, 6);
  });

  it('usa o primeiro índice da série para compra anterior ao seu início', () => {
    // Subestima a correção — o erro seguro numa auditoria.
    expect(fatorIpca('2010-03-01', INDICES)).toBeCloseTo(7652.37 / 4008.0, 6);
  });

  it('não extrapola para compra posterior ao último mês publicado', () => {
    // O IBGE publica com ~10 dias de atraso; não há inflação medida a aplicar.
    expect(fatorIpca('2026-08-01', INDICES)).toBeCloseTo(1, 10);
  });

  it('devolve 1 quando a série está vazia ou a data é inválida', () => {
    expect(fatorIpca('2015-06-15', new Map())).toBe(1);
    expect(fatorIpca('data quebrada', INDICES)).toBe(1);
  });
});

describe('classificarConfianca', () => {
  it('exige volume E consistência para o grau Alta', () => {
    expect(classificarConfianca(5, 0.34)).toBe('Alta');
    expect(classificarConfianca(4, 0.10)).toBe('Média'); // consistente, mas pouco volume
    expect(classificarConfianca(50, 0.36)).toBe('Média'); // muito volume, disperso demais
  });

  it('rebaixa o item genérico a Baixa por mais compras que tenha', () => {
    // TRANSPORTE RODOVIÁRIO: 1.274 compras entre R$ 0,93 e R$ 61.669 a unidade.
    expect(classificarConfianca(1274, 2.4)).toBe('Baixa');
  });

  it('trata duas compras como insuficiente qualquer que seja a dispersão', () => {
    expect(classificarConfianca(2, 0.0)).toBe('Baixa');
  });

  it('é exclusivo no limite superior da dispersão', () => {
    expect(classificarConfianca(10, 0.35)).toBe('Média');
    expect(classificarConfianca(10, 0.80)).toBe('Baixa');
  });
});

describe('ehConfiavel', () => {
  it('conta só Alta e Média para a manchete', () => {
    expect(ehConfiavel('Alta')).toBe(true);
    expect(ehConfiavel('Média')).toBe(true);
    expect(ehConfiavel('Baixa')).toBe(false);
    expect(ehConfiavel('Sem referência')).toBe(false);
  });
});

describe('classificarVeredito', () => {
  it('julga contra a faixa P25–P75, não contra a mediana', () => {
    expect(classificarVeredito(80, 100, 200)).toBe('Bom');
    expect(classificarVeredito(150, 100, 200)).toBe('Na faixa');
    expect(classificarVeredito(250, 100, 200)).toBe('Atenção');
  });

  it('mantém dentro da faixa quem está exatamente no limite', () => {
    expect(classificarVeredito(100, 100, 200)).toBe('Na faixa');
    expect(classificarVeredito(200, 100, 200)).toBe('Na faixa');
  });

  it('devolve Sem referência quando não há faixa', () => {
    expect(classificarVeredito(150, null, null)).toBe('Sem referência');
    expect(classificarVeredito(150, 100, undefined)).toBe('Sem referência');
  });
});

describe('ehLoteAtipico', () => {
  it('marca lote muito maior ou muito menor que o habitual', () => {
    expect(ehLoteAtipico(100 * FATOR_LOTE_ATIPICO + 1, 100)).toBe(true);
    expect(ehLoteAtipico(100 / FATOR_LOTE_ATIPICO - 1, 100)).toBe(true);
    expect(ehLoteAtipico(150, 100)).toBe(false);
  });

  it('não marca quem está exatamente no limite', () => {
    expect(ehLoteAtipico(300, 100)).toBe(false);
    expect(ehLoteAtipico(100 / 3, 100)).toBe(false);
  });

  it('não marca nada quando o material não tem lote de referência', () => {
    expect(ehLoteAtipico(999, null)).toBe(false);
    expect(ehLoteAtipico(999, 0)).toBe(false);
  });
});

// Compras sintéticas na cardinalidade e na forma das linhas reais da view.
const compra = (over: Partial<AuditoriaCompra>): AuditoriaCompra => ({
  material: '1286874',
  qtd: 10,
  valor: 1000,
  preco_unit: 100,
  confianca: 'Alta',
  veredito: 'Na faixa',
  ref_p25: 90,
  ref_p50: 100,
  ref_p75: 110,
  n_compras: 8,
  sd_log: 0.2,
  qtd_mediana: 10,
  lote_atipico: false,
  ...over,
});

describe('resumirAuditoria', () => {
  it('soma a manchete só com Alta e Média', () => {
    const r = resumirAuditoria([
      compra({ confianca: 'Alta',  qtd: 10, valor: 1000, preco_unit: 100, ref_p50: 120 }),
      compra({ confianca: 'Média', qtd: 10, valor: 1000, preco_unit: 100, ref_p50: 90 }),
      // Baixa entra no valor total, mas não na conta da economia.
      compra({ confianca: 'Baixa', qtd: 10, valor: 5000, preco_unit: 500, ref_p50: 50 }),
    ]);

    expect(r.comprasConfiaveis).toBe(2);
    expect(r.valorConfiavel).toBe(2000);
    expect(r.valorReferencia).toBe(10 * 120 + 10 * 90); // 2100
    expect(r.deltaValor).toBe(-100);
    expect(r.deltaPct).toBeCloseTo(-100 / 2100, 10);
    expect(r.valorBaixaConfianca).toBe(5000);
    expect(r.valorTotal).toBe(7000);
  });

  it('separa ausência de referência de referência ruim', () => {
    const r = resumirAuditoria([
      compra({ confianca: 'Alta', valor: 1000 }),
      compra({
        confianca: 'Sem referência', veredito: 'Sem referência', valor: 3000,
        ref_p25: null, ref_p50: null, ref_p75: null, n_compras: null,
      }),
    ]);

    expect(r.semReferencia).toBe(1);
    expect(r.valorSemReferencia).toBe(3000);
    // Cobertura é do VALOR, não da contagem — é o número que a tela precisa
    // mostrar junto da economia para ela não mentir por omissão.
    expect(r.coberturaValor).toBeCloseTo(0.25, 10);
    // A linha sem referência não pode contaminar a manchete.
    expect(r.valorConfiavel).toBe(1000);
  });

  it('conta vereditos e lotes atípicos apenas entre as linhas com referência', () => {
    const r = resumirAuditoria([
      compra({ veredito: 'Atenção', lote_atipico: true }),
      compra({ veredito: 'Atenção' }),
      compra({ veredito: 'Bom', confianca: 'Baixa' }),
      compra({
        veredito: 'Sem referência', confianca: 'Sem referência',
        lote_atipico: true, ref_p50: null,
      }),
    ]);

    expect(r.acimaDaFaixa).toBe(2);
    expect(r.abaixoDaFaixa).toBe(1);
    expect(r.lotesAtipicos).toBe(1);
  });

  it('não divide por zero na base vazia', () => {
    const r = resumirAuditoria([]);
    expect(r.deltaPct).toBeNull();
    expect(r.coberturaValor).toBe(0);
    expect(r.valorTotal).toBe(0);
  });
});

describe('normalizarCompra', () => {
  it('reclassifica linha de cache antigo, sem os campos derivados', () => {
    const crua = {
      material: '1286874', qtd: 30, valor: 3600, preco_unit: 120,
      ref_p25: 90, ref_p50: 100, ref_p75: 110,
      n_compras: 8, sd_log: 0.2, qtd_mediana: 5,
    } as unknown as AuditoriaCompra;

    const c = normalizarCompra(crua);

    expect(c.confianca).toBe('Alta');
    expect(c.veredito).toBe('Atenção');
    expect(c.lote_atipico).toBe(true); // 30 contra mediana 5
    expect(c.delta_pct).toBeCloseTo(0.2, 10);
    expect(c.delta_valor).toBeCloseTo(600, 10);
  });

  it('rotula ausência de histórico como Sem referência, não como Baixa', () => {
    const crua = {
      material: '9999999', qtd: 1, valor: 500, preco_unit: 500,
      ref_p25: null, ref_p50: null, ref_p75: null, n_compras: null,
    } as unknown as AuditoriaCompra;

    const c = normalizarCompra(crua);

    expect(c.confianca).toBe('Sem referência');
    expect(c.veredito).toBe('Sem referência');
    expect(c.delta_valor).toBeNull();
  });

  it('preserva o que a view já decidiu', () => {
    const c = normalizarCompra(compra({ veredito: 'Bom', confianca: 'Média' }));
    expect(c.veredito).toBe('Bom');
    expect(c.confianca).toBe('Média');
  });
});
