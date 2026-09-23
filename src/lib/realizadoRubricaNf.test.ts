import { describe, expect, it } from 'vitest';
import type { FinRubrica } from '../types';
import {
  baldeDaLinha,
  coletarIdsComDescendentes,
  consolidarPorFornecedor,
  consolidarPorItem,
  filtrarPorPeriodo,
  LinhaNfRealizado,
  montarRelatorio,
  resumirPorNatureza,
} from './realizadoRubricaNf';

let proximoId = 1;
function linha(parcial: Partial<LinhaNfRealizado>): LinhaNfRealizado {
  return {
    id: proximoId++,
    fornecedor_codigo: 'F1',
    fornecedor_nome: 'Fornecedor 1',
    cnpj_fornecedor: null,
    numero_nf: '100',
    serie_nf: '1',
    categoria_nota_fiscal: 'Z1',
    cfop: '1556/AA',
    data_documento: '2026-03-10',
    data_lancamento: '2026-03-12',
    numero_pedido: null,
    item_pedido: null,
    material: 'M1',
    numero_servico: null,
    tipo_item: 'MATERIAL',
    descricao_item: 'Luva',
    quantidade: 1,
    unidade_medida: 'UN',
    centro: null,
    natureza: 'USO_CONSUMO',
    entra_realizado: true,
    valor: 100,
    grupo_mercadoria_codigo: null,
    grupo_mercadoria_nome: null,
    classificacao_nivel1: null,
    classificacao_nivel2: null,
    origem_grupo: null,
    rubrica_id: null,
    rubrica_nome: null,
    origem_rubrica: null,
    valor_pago_rateado: 0,
    status_pagamento: null,
    data_ultimo_pagamento: null,
    excluido_por_material: false,
    ...parcial,
  };
}

const rubrica = (id: string, ordem: number, pai: string | null = null): FinRubrica => ({
  id, codigo: id, nome: id.toUpperCase(), rubrica_pai_id: pai, ordem,
});

describe('baldeDaLinha', () => {
  it('separa custo com rubrica, material de produção sem rubrica, sem rubrica e o que não é custo', () => {
    expect(baldeDaLinha({ entra_realizado: true, rubrica_id: 'r', natureza: 'USO_CONSUMO' })).toBe('rubrica');
    expect(baldeDaLinha({ entra_realizado: true, rubrica_id: null, natureza: 'MATERIAL_PRODUCAO' })).toBe('material_producao');
    expect(baldeDaLinha({ entra_realizado: true, rubrica_id: null, natureza: 'SERVICO' })).toBe('sem_rubrica');
    expect(baldeDaLinha({ entra_realizado: false, rubrica_id: 'r', natureza: 'REMESSA_RETORNO' })).toBe('fora');
  });
});

describe('montarRelatorio', () => {
  const rubricas = [rubrica('manut', 10), rubrica('predial', 11, 'manut'), rubrica('epi', 20)];

  it('faz rollup do filho no pai e conta NFs distintas, não somadas', () => {
    const linhas = [
      linha({ rubrica_id: 'manut', valor: 50, numero_nf: '1' }),
      linha({ rubrica_id: 'predial', valor: 30, numero_nf: '1' }),
      linha({ rubrica_id: 'predial', valor: 20, numero_nf: '2', fornecedor_codigo: 'F2' }),
    ];
    const rel = montarRelatorio(rubricas, linhas);
    const manut = rel.arvore.find(l => l.rubrica.id === 'manut')!;
    expect(manut.valor).toBe(100);
    expect(manut.qtdNfs).toBe(2);
    expect(manut.qtdFornecedores).toBe(2);
    expect(manut.filhos[0].valor).toBe(50);
    expect(rel.arvore.find(l => l.rubrica.id === 'epi')!.valor).toBe(0);
  });

  it('fecha o realizado = rubricas + material de produção + sem rubrica, e ignora o que não é custo', () => {
    const linhas = [
      linha({ rubrica_id: 'epi', valor: 10 }),
      linha({ natureza: 'MATERIAL_PRODUCAO', valor: 1000 }),
      linha({ natureza: 'SERVICO', valor: 5 }),
      linha({ natureza: 'DEVOLUCAO', rubrica_id: 'epi', valor: -3 }),
      linha({ natureza: 'REMESSA_RETORNO', entra_realizado: false, valor: 9999 }),
    ];
    const rel = montarRelatorio(rubricas, linhas);
    expect(rel.realizado.valor).toBe(1012);
    expect(rel.emRubricas.valor).toBe(7);
    expect(rel.materialProducao.valor).toBe(1000);
    expect(rel.semRubrica.valor).toBe(5);
    expect(rel.emRubricas.valor + rel.materialProducao.valor + rel.semRubrica.valor).toBe(rel.realizado.valor);
  });

  it('coleta a rubrica e todos os descendentes', () => {
    const rel = montarRelatorio(rubricas, []);
    expect(coletarIdsComDescendentes(rel.arvore[0])).toEqual(['manut', 'predial']);
  });
});

describe('resumirPorNatureza', () => {
  it('ordena a ponte na ordem de leitura e marca o que entra no realizado', () => {
    const res = resumirPorNatureza([
      linha({ natureza: 'OUTRAS_ENTRADAS', entra_realizado: false, valor: 7 }),
      linha({ natureza: 'MATERIAL_PRODUCAO', valor: 3 }),
    ]);
    expect(res.map(r => r.natureza)).toEqual(['MATERIAL_PRODUCAO', 'OUTRAS_ENTRADAS']);
    expect(res[1].entraRealizado).toBe(false);
  });
});

describe('consolidarPorFornecedor', () => {
  it('soma por fornecedor e lista as rubricas atingidas', () => {
    const res = consolidarPorFornecedor([
      linha({ fornecedor_codigo: 'A', valor: 10, rubrica_nome: 'EPIS' }),
      linha({ fornecedor_codigo: 'A', valor: 5, rubrica_nome: null }),
      linha({ fornecedor_codigo: 'B', valor: 50 }),
    ]);
    expect(res[0].fornecedorCodigo).toBe('B');
    expect(res[1]).toMatchObject({ valor: 15, rubricas: ['EPIS', 'Sem rubrica'] });
  });
});

describe('consolidarPorItem', () => {
  it('agrupa pelo código SAP e só soma quantidade em unidade única', () => {
    const res = consolidarPorItem([
      linha({ material: 'M1', quantidade: 2, valor: 20 }),
      linha({ material: 'M1', quantidade: 3, valor: 30 }),
      linha({ material: null, numero_servico: 'S1', tipo_item: 'SERVICO', quantidade: 1, unidade_medida: 'UN', valor: 5 }),
      linha({ material: null, numero_servico: 'S1', tipo_item: 'SERVICO', quantidade: 2, unidade_medida: 'H', valor: 5 }),
    ]);
    expect(res[0]).toMatchObject({ chave: 'M1', quantidade: 5, valor: 50, qtdItens: 2 });
    expect(res[1].chave).toBe('SERVICO:S1');
    expect(Number.isNaN(res[1].quantidade)).toBe(true);
  });
});

describe('filtrarPorPeriodo', () => {
  it('recorta pelo mês de lançamento, inclusive nas pontas', () => {
    const linhas = [
      linha({ data_lancamento: '2026-01-31' }),
      linha({ data_lancamento: '2026-02-01' }),
      linha({ data_lancamento: '2026-03-01' }),
    ];
    expect(filtrarPorPeriodo(linhas, '2026-02', '2026-03')).toHaveLength(2);
    expect(filtrarPorPeriodo(linhas, '', '2026-01')).toHaveLength(1);
    expect(filtrarPorPeriodo(linhas, '', '')).toHaveLength(3);
  });
});
