import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '../db/supabaseClient';
import {
  criarPayloadConfigControleEstoque,
  criarPayloadInativacaoOverride,
  criarPayloadOverrideControleEstoque,
  filtrarControleEstoque,
  listarControleEstoque,
  normalizarLinhaControleEstoque,
  validarOverrideControleEstoque,
} from './controleEstoqueApi';

vi.mock('../db/supabaseClient', () => ({
  supabase: { from: vi.fn() },
}));

describe('controleEstoqueApi', () => {
  beforeEach(() => vi.clearAllMocks());

  it('monta configuração auditada sem aceitar autoria enviada pelo formulário', () => {
    expect(criarPayloadConfigControleEstoque({
      centro: ' TEN2 ',
      janela_inicio: '2026-03-03',
      janela_fim: null,
      lead_time_padrao_dias: 15,
      intervalo_compra_dias: 30,
    }, { id: 'user-1' })).toEqual({
      centro: 'TEN2',
      janela_inicio: '2026-03-03',
      janela_fim: null,
      lead_time_padrao_dias: 15,
      intervalo_compra_dias: 30,
      ativo: true,
      updated_by: 'user-1',
    });
  });

  it('monta override preservando null e autoria', () => {
    expect(criarPayloadOverrideControleEstoque({
      material: ' 000000001234 ',
      centro: ' TEN2 ',
      tipo_gestao: null,
      lead_time_dias: 20,
      intervalo_compra_dias: null,
      estoque_minimo: null,
      estoque_maximo: 120,
      quantidade_por_torre: null,
      justificativa: 'Ajuste validado pelo almoxarifado',
    }, { id: 'user-2' })).toEqual({
      material: '000000001234',
      centro: 'TEN2',
      tipo_gestao: null,
      lead_time_dias: 20,
      intervalo_compra_dias: null,
      estoque_minimo: null,
      estoque_maximo: 120,
      quantidade_por_torre: null,
      justificativa: 'Ajuste validado pelo almoxarifado',
      ativo: true,
      updated_by: 'user-2',
    });
  });

  it('gera soft delete auditado para override', () => {
    expect(criarPayloadInativacaoOverride({ id: 'user-3' })).toEqual({
      ativo: false,
      updated_by: 'user-3',
    });
  });

  it.each([
    [{ estoque_minimo: -1 }, 'Estoque mínimo não pode ser negativo.'],
    [{ estoque_minimo: 10, estoque_maximo: 9 }, 'Estoque máximo não pode ser menor que o mínimo.'],
    [{ quantidade_por_torre: 0 }, 'Quantidade por torre deve ser maior que zero.'],
    [{ justificativa: 'abc' }, 'Informe uma justificativa com pelo menos 5 caracteres.'],
  ])('valida override inválido %o', (alteracao, mensagem) => {
    const base = {
      material: '1',
      centro: 'TEN2',
      tipo_gestao: null,
      lead_time_dias: null,
      intervalo_compra_dias: null,
      estoque_minimo: null,
      estoque_maximo: null,
      quantidade_por_torre: null,
      justificativa: 'Justificativa válida',
    };
    expect(() => validarOverrideControleEstoque({ ...base, ...alteracao })).toThrow(mensagem);
  });

  it('normaliza números e preserva null nos campos indisponíveis', () => {
    const row = normalizarLinhaControleEstoque({
      material: '1',
      centro: 'TEN2',
      saldo_total: '10.5',
      saldo_reposicao: '9.5',
      valor_estoque: '100.20',
      preco_medio_sap: null,
      dias_uteis: 150,
      lead_time_dias: '15',
      intervalo_compra_dias: '30',
      consumo_total: '0',
      quantidade_por_torre: null,
      depositos: null,
      rms: null,
      pedidos: null,
      movimentos_mensais: null,
      opcoes_quantidade_por_torre: null,
    });

    expect(row.saldo_total).toBe(10.5);
    expect(row.preco_medio_sap).toBeNull();
    expect(row.quantidade_por_torre).toBeNull();
    expect(row.depositos).toEqual([]);
    expect(row.rms).toEqual([]);
  });

  it('filtra em memória pelo mesmo conjunto usado por KPIs, tabela e exportação', () => {
    const base = { descricao: 'PARAFUSO', centro: 'TEN2', categoria: 'FIXACAO', saldo_total: 10, saldo_reposicao: 10 };
    const itens = [
      normalizarLinhaControleEstoque({
        ...base, material: 'A1', rms_abertas: 2, pos_abertas: 0, quantidade_recebida: 5,
        depositos: [{ deposito: 'D1', saldo: 10, valor: 1 }],
      }),
      normalizarLinhaControleEstoque({
        ...base, material: 'B2', descricao: 'PORCA', categoria: 'OUTRA', rms_abertas: 0, pos_abertas: 1, quantidade_recebida: 0,
        depositos: [{ deposito: 'D2', saldo: 10, valor: 1 }],
      }),
    ];

    expect(filtrarControleEstoque(itens, {}).length).toBe(2);
    expect(filtrarControleEstoque(itens, { palavrasChave: ['porca'] }).map(i => i.material)).toEqual(['B2']);
    expect(filtrarControleEstoque(itens, { palavrasChave: ['por', 'parafuso'] })).toEqual([]);
    expect(filtrarControleEstoque(itens, { palavrasChave: ['fixacao', 'parafuso'] }).map(i => i.material)).toEqual(['A1']);
    expect(filtrarControleEstoque(itens, { temRm: true }).map(i => i.material)).toEqual(['A1']);
    expect(filtrarControleEstoque(itens, { temPo: true }).map(i => i.material)).toEqual(['B2']);
    expect(filtrarControleEstoque(itens, { recebimento: 'SEM_RECEBIMENTO' }).map(i => i.material)).toEqual(['B2']);
    expect(filtrarControleEstoque(itens, { categoria: 'FIXACAO', deposito: 'D1' }).map(i => i.material)).toEqual(['A1']);
    expect(filtrarControleEstoque(itens, { deposito: 'D9' })).toEqual([]);

    const itensComProjeto = [
      ...itens,
      normalizarLinhaControleEstoque({
        ...base,
        material: '100000000000047981',
        descricao: 'PARAFUSO PROJETO',
        depositos: [{ deposito: 'D1', saldo: 5, valor: 1 }],
      }),
    ];
    expect(filtrarControleEstoque(itensComProjeto, { tipoItem: 'projeto' }).map(i => i.material)).toEqual(['100000000000047981']);
    expect(filtrarControleEstoque(itensComProjeto, { tipoItem: 'consumo' }).map(i => i.material)).toEqual(['A1', 'B2']);
  });

  it('propaga falha da view em vez de retornar cache ou lista vazia', async () => {
    const range = vi.fn().mockResolvedValue({ data: null, error: { message: 'view indisponível' } });
    const order = vi.fn().mockReturnValue({ range });
    const select = vi.fn().mockReturnValue({ order });
    (supabase.from as any).mockReturnValue({ select });

    await expect(listarControleEstoque()).rejects.toThrow('view indisponível');
    expect(supabase.from).toHaveBeenCalledWith('vw_almox_controle_estoque');
  });
});
