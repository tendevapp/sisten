import { describe, it, expect } from 'vitest';
import {
  criteriosFiscaisItem, calcularCustoCompraItem, somarCustoCompra,
  aplicarCustoNoItem, precoCotadoItem,
} from './custoCompra';
import { calcularImpostos, inferirCodigoFiscal } from './calcImpostos';
import type { CotacaoPropostaItemDraft } from '../types';

let seq = 0;
function item(p: Partial<CotacaoPropostaItemDraft> = {}): CotacaoPropostaItemDraft {
  seq += 1;
  return {
    _key: p._key ?? `it${seq}`,
    processo_item_id: null, fora_escopo: false, vinculo_origem: 'manual', vinculo_score: null,
    ri: null, material_code: null, item_numero: null, codigo_produto: null,
    descricao_produto: 'Parafuso M8', marca_fabricante: null, unidade_medida: 'UN',
    ncm: null, cst: null, cfop: null,
    quantidade: 10, preco_unitario: 100, preco_total_item: 1000,
    aliquota_icms_pct: null, aliquota_pis_pct: null, aliquota_cofins_pct: null, aliquota_ipi_pct: null,
    desconsiderado: false, vinculo_divergencias: [],
    peso_unitario_kg: null, peso_origem: null, frete_teorico: null,
    codigo_fiscal: null, preco_liquido_unitario: null, preco_liquido_total: null, custo_total_item: null,
    extraido_raw: {} as any,
    ...p,
  };
}

describe('inferirCodigoFiscal', () => {
  it('usa a alíquota interna quando a origem é a própria Bahia', () => {
    expect(inferirCodigoFiscal('BA')).toBe('C1');
  });

  it('aplica 12% para Sul/Sudeste e 7% para o resto', () => {
    expect(inferirCodigoFiscal('SP')).toBe('C2');
    expect(inferirCodigoFiscal('RS')).toBe('C2');
    expect(inferirCodigoFiscal('PE')).toBe('C3');
    expect(inferirCodigoFiscal('GO')).toBe('C3');
    // ES fica fora da regra de 12% mesmo sendo Sudeste.
    expect(inferirCodigoFiscal('ES')).toBe('C3');
  });

  it('escolhe o preset com IPI em operação interna quando o item destaca IPI', () => {
    expect(inferirCodigoFiscal('BA', { temIpi: true })).toBe('C5');
  });
});

describe('criteriosFiscaisItem', () => {
  it('a alíquota destacada na proposta ganha do preset — é ela que vai na nota', () => {
    const { inputs } = criteriosFiscaisItem(item({ aliquota_icms_pct: 4 }), { fornecedor_uf: 'SP' });
    expect(inputs.aliqIcms).toBe(4);
  });

  it('o preset preenche o que o fornecedor não destacou', () => {
    const { codigoFiscal, inputs } = criteriosFiscaisItem(item(), { fornecedor_uf: 'SP' });
    expect(codigoFiscal).toBe('C2');
    expect(inputs.aliqIcms).toBe(12);
    expect(inputs.aliqPis).toBe(1.65);
    expect(inputs.aliqCofins).toBe(7.6);
  });

  it('nunca inventa IPI: preset com IPI não cria imposto em nota que não tem', () => {
    const { inputs } = criteriosFiscaisItem(item(), { fornecedor_uf: 'BA' }, { codigoFiscal: 'C5' });
    expect(inputs.aliqIpi).toBe(0);
  });

  it('respeita o código fiscal gravado no item', () => {
    const { codigoFiscal, inputs } = criteriosFiscaisItem(item({ codigo_fiscal: 'A3' }), { fornecedor_uf: 'SP' });
    expect(codigoFiscal).toBe('A3');
    expect(inputs.fatorReducao).toBeCloseTo(0.6667, 4);
  });

  it('trata quantidade ausente como uma unidade, para não dividir por zero', () => {
    const { inputs } = criteriosFiscaisItem(item({ quantidade: null }), { fornecedor_uf: 'BA' });
    expect(inputs.quantidade).toBe(1);
  });
});

describe('calcularCustoCompraItem', () => {
  it('apura pelo mesmo motor da Calc Impostos', () => {
    const it1 = item({ aliquota_icms_pct: 12, aliquota_pis_pct: 1.65, aliquota_cofins_pct: 7.6 });
    const custo = calcularCustoCompraItem(it1, { fornecedor_uf: 'SP' });
    const direto = calcularImpostos({
      precoComImpostos: 1000, aliqIcms: 12, aliqPis: 1.65, aliqCofins: 7.6,
      aliqIpi: 0, fatorReducao: 1, quantidade: 10, unidadePreco: 1,
    });
    expect(custo.precoLiquido).toBeCloseTo(direto.precoLiquido, 2);
  });

  it('compõe o custo como preço líquido + frete teórico', () => {
    const custo = calcularCustoCompraItem(
      item({ aliquota_icms_pct: 12, frete_teorico: 150 }),
      { fornecedor_uf: 'SP' },
    );
    expect(custo.custoTotal).toBeCloseTo(custo.precoLiquido + 150, 2);
    expect(custo.custoUnitario).toBeCloseTo(custo.custoTotal / 10, 4);
  });

  it('o desembolso soma o IPI e o frete ao preço cotado', () => {
    const custo = calcularCustoCompraItem(
      item({ aliquota_ipi_pct: 10, frete_teorico: 50 }),
      { fornecedor_uf: 'BA' },
    );
    expect(custo.precoBruto).toBeCloseTo(1100, 2);
    expect(custo.desembolso).toBeCloseTo(1150, 2);
  });

  it('mesma etiqueta, UF diferente, custo líquido diferente', () => {
    const sp = calcularCustoCompraItem(item(), { fornecedor_uf: 'SP' });
    const ba = calcularCustoCompraItem(item(), { fornecedor_uf: 'BA' });
    expect(sp.precoCotado).toBe(ba.precoCotado);
    // ICMS de 18% na operação interna devolve mais crédito que os 12% interestaduais.
    expect(ba.precoLiquido).toBeLessThan(sp.precoLiquido);
  });

  it('marca como incompleto o item sem preço', () => {
    const custo = calcularCustoCompraItem(
      item({ preco_unitario: null, preco_total_item: null }),
      { fornecedor_uf: 'SP' },
    );
    expect(custo.incompleto).toBe(true);
    expect(precoCotadoItem(item({ preco_unitario: null, preco_total_item: null }))).toBeNull();
  });
});

describe('somarCustoCompra', () => {
  it('soma as parcelas e ignora item incompleto', () => {
    const ok = calcularCustoCompraItem(item({ frete_teorico: 100 }), { fornecedor_uf: 'SP' });
    const semPreco = calcularCustoCompraItem(
      item({ preco_unitario: null, preco_total_item: null, frete_teorico: 999 }),
      { fornecedor_uf: 'SP' },
    );
    const totais = somarCustoCompra([ok, semPreco]);
    expect(totais.frete).toBe(100);
    expect(totais.precoLiquido).toBeCloseTo(ok.precoLiquido, 2);
    expect(totais.custoTotal).toBeCloseTo(ok.custoTotal, 2);
  });
});

describe('aplicarCustoNoItem', () => {
  it('congela a apuração no item, para o histórico não mudar com a alíquota', () => {
    const base = item({ frete_teorico: 100 });
    const custo = calcularCustoCompraItem(base, { fornecedor_uf: 'SP' });
    const gravado = aplicarCustoNoItem(base, custo);

    expect(gravado.codigo_fiscal).toBe('C2');
    expect(gravado.preco_liquido_total).toBeCloseTo(custo.precoLiquido, 2);
    expect(gravado.custo_total_item).toBeCloseTo(custo.custoTotal, 2);
  });

  it('não grava número em item incompleto', () => {
    const base = item({ preco_unitario: null, preco_total_item: null });
    const gravado = aplicarCustoNoItem(base, calcularCustoCompraItem(base, { fornecedor_uf: 'SP' }));
    expect(gravado.preco_liquido_total).toBeNull();
    expect(gravado.custo_total_item).toBeNull();
  });
});
