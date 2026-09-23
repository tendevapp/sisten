import { describe, expect, it } from 'vitest';
import type { LinhaNfRealizado } from './realizadoRubricaNf';
import {
  LinhaPlanilhaFornecedor, mesesAte, montarExportFornecedores, resumirItens, rotuloMes,
} from './fornecedoresPlanilha';

let id = 1;
function nf(parcial: Partial<LinhaNfRealizado>): LinhaNfRealizado {
  return {
    id: id++, fornecedor_codigo: 'F1', fornecedor_nome: 'FORNECEDOR 1', cnpj_fornecedor: null,
    numero_nf: '1', serie_nf: '1', categoria_nota_fiscal: 'Z1', cfop: '1556', data_documento: '2026-01-10',
    data_lancamento: '2026-01-12', numero_pedido: null, item_pedido: null, material: 'M1', numero_servico: null,
    tipo_item: 'MATERIAL', descricao_item: 'LUVA', quantidade: 1, unidade_medida: 'UN', centro: null,
    natureza: 'USO_CONSUMO', entra_realizado: true, valor: 100, grupo_mercadoria_codigo: null,
    grupo_mercadoria_nome: null, classificacao_nivel1: null, classificacao_nivel2: null, origem_grupo: null,
    rubrica_id: 'r', rubrica_nome: 'EPIS', origem_rubrica: 'grupo_mercadoria', valor_pago_rateado: 0,
    status_pagamento: null, data_ultimo_pagamento: null, excluido_por_material: false,
    ...parcial,
  };
}

function linha(parcial: Partial<LinhaPlanilhaFornecedor>): LinhaPlanilhaFornecedor {
  return {
    id: String(id++), secao: 'ADM', ordem: 10, nome_planilha: 'FORNECEDOR 1', tipo: 'fornecedor',
    fornecedor_codigos: ['F1'], filtro_tipo_item: null, observacao: null, ...parcial,
  };
}

describe('meses', () => {
  it('lista de jan/26 até o mês final e rotula sem usar Date', () => {
    expect(mesesAte('2026-03')).toEqual(['2026-01', '2026-02', '2026-03']);
    expect(rotuloMes('2026-09')).toBe('set/26');
  });
});

describe('resumirItens', () => {
  it('mostra os maiores itens com participação e conta o resto', () => {
    const r = resumirItens([
      nf({ descricao_item: 'A', valor: 60 }), nf({ descricao_item: 'B', valor: 30 }),
      nf({ descricao_item: 'C', valor: 5 }), nf({ descricao_item: 'D', valor: 5 }),
    ], 2);
    expect(r).toBe('A (60%); B (30%); +2 itens');
  });
});

describe('montarExportFornecedores', () => {
  it('distribui por mês de lançamento e separa o que não é custo', () => {
    const res = montarExportFornecedores([linha({})], [
      nf({ data_lancamento: '2026-01-05', valor: 100 }),
      nf({ data_lancamento: '2026-02-05', valor: 50 }),
      nf({ data_lancamento: '2026-02-06', natureza: 'REMESSA_RETORNO', entra_realizado: false, valor: 999 }),
      nf({ data_lancamento: '2026-04-01', valor: 7 }),
    ], '2026-03');
    const l = res.linhas[0];
    expect(res.meses).toEqual(['2026-01', '2026-02', '2026-03']);
    expect(l.valoresMes).toEqual({ '2026-01': 100, '2026-02': 50, '2026-03': 0 });
    expect(l.total).toBe(150);
    expect(l.foraDoRealizado).toBe(999);
    expect(l.situacao).toBe('com_nf');
  });

  it('aplica o filtro de tipo de item e marca a mesma linha repetida sem somar duas vezes', () => {
    const planilha = [
      linha({ ordem: 10, nome_planilha: 'AIR - locação', filtro_tipo_item: 'SERVICO' }),
      linha({ ordem: 20, nome_planilha: 'AIR - gás', filtro_tipo_item: 'MATERIAL' }),
      linha({ ordem: 30, nome_planilha: 'AQUA', fornecedor_codigos: ['F2'] }),
      linha({ ordem: 40, nome_planilha: 'AQUA', secao: 'CONTRATOS', fornecedor_codigos: ['F2'] }),
    ];
    const res = montarExportFornecedores(planilha, [
      nf({ tipo_item: 'SERVICO', valor: 10 }),
      nf({ tipo_item: 'MATERIAL', valor: 20 }),
      nf({ fornecedor_codigo: 'F2', valor: 5 }),
    ], '2026-01');
    expect(res.linhas.map(l => l.total)).toEqual([10, 20, 5, 5]);
    expect(res.linhas[3].observacao).toContain('não somar duas vezes');
    expect(res.totalListaSemDuplicidade).toBe(35);
  });

  it('distingue sem vínculo, lançamento financeiro e lista fornecedores fora da planilha', () => {
    const res = montarExportFornecedores([
      linha({ ordem: 10, fornecedor_codigos: [] }),
      linha({ ordem: 20, tipo: 'lancamento_sem_nf', fornecedor_codigos: [] }),
    ], [nf({ fornecedor_codigo: 'X', fornecedor_nome: 'OUTRO', valor: 42 })], '2026-01');
    expect(res.linhas.map(l => l.situacao)).toEqual(['sem_vinculo', 'lancamento_sem_nf']);
    expect(res.foraDaLista).toMatchObject([{ codigo: 'X', nome: 'OUTRO', total: 42 }]);
    expect(res.totalRealizadoGeral).toBe(42);
  });
});
