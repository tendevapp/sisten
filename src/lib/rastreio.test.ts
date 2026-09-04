import { describe, expect, it } from 'vitest';
import type { EnrichedSAPRecord } from '../types';
import { buildRastreioRows, groupRowsByPo } from './rastreio';

function registro(over: Partial<EnrichedSAPRecord> = {}): EnrichedSAPRecord {
  const base = {
    ri: '120009412500010', requisicao_de_compra: '1200094125', item_reqc: '10',
    material_code: '1437514', texto_breve: 'CHAVE DE IMPACTO', qtd_requisicao: 5, unidade_medida: 'UN',
    grupo_comprador: '314', data_solicitacao: '2026-08-20', data_remessa: '',
    requisitante_name: 'Ana', tipo_documento: 'ZR01', codigo_de_eliminacao: false,
    presente_ultima_carga: true, campos_extras: {},
    documento_compra: '4100465946', fornecedor_name: 'COMERCIAL DE MATERIAIS',
    data_pedido: '2026-08-26',
    natureza: 'Normal', status_requisicao: 'Processado', lead_time_compras_meta: 15,
    dias_em_aberto: 0, atraso_comprador: 0, faixa_atraso: '', alerta: '', status_atualizado: '',
    ...over,
  } as EnrichedSAPRecord;
  return { ...base, ri_po: over.ri_po || `${base.ri}-${base.documento_compra || 'SEM-PO'}` };
}

// Uma RM/item pode ter sido comprada em mais de um pedido (quantidade dividida
// entre fornecedores, saldo, reemissão). Antes, o banco entregava um PO só por
// item e os demais sumiam da tela — inclusive o que já tinha MIGO.
describe('buildRastreioRows com mais de um PO no mesmo item de RM', () => {
  const linhas = () => buildRastreioRows([
    registro({ ri_po: 'r-1', documento_compra: '4100465946', qtd_po: 1, fornecedor_name: 'COMERCIAL' }),
    registro({ ri_po: 'r-2', documento_compra: '4100465955', qtd_po: 1, fornecedor_name: 'FERIMPORT' }),
    registro({ ri_po: 'r-3', documento_compra: '4100466020', qtd_po: 3, fornecedor_name: 'ANHANGUERA', data_migo: '2026-09-03' }),
  ]);

  it('rende uma linha por pedido, com identidade própria', () => {
    const rows = linhas();
    expect(rows.map(r => r.po)).toEqual(['4100465946', '4100465955', '4100466020']);
    expect(new Set(rows.map(r => r.riPo)).size).toBe(3);
    // A RM continua a mesma nas três linhas — quem muda é o pedido.
    expect(new Set(rows.map(r => r.rm))).toEqual(new Set(['1200094125']));
  });

  it('usa a quantidade do pedido, não a da RM inteira', () => {
    expect(linhas().map(r => r.qtd)).toEqual([1, 1, 3]);
  });

  it('mantém a entrega no pedido que realmente chegou', () => {
    const rows = linhas();
    expect(rows.map(r => r.status)).toEqual(['Sem status', 'Sem status', 'Entregue']);
    expect(rows.filter(r => r.dataEntrega !== '—').map(r => r.po)).toEqual(['4100466020']);
  });

  it('o cronograma separa os pedidos em blocos distintos', () => {
    const grupos = groupRowsByPo(linhas());
    expect(grupos.map(g => g.po)).toEqual(['4100465946', '4100465955', '4100466020']);
    expect(grupos.map(g => g.rows.length)).toEqual([1, 1, 1]);
  });
});

describe('quantidade fornecida na linha do Rastreio', () => {
  it('traz o fornecido do pedido e o % atendido quando falta saldo', () => {
    const [row] = buildRastreioRows([
      registro({ qtd_requisicao: 115, qtd_po: 115, qtd_fornecida_po: 80, qtd_fornecida_total: 80 }),
    ]);
    expect(row.qtdFornecida).toBe(80);
    expect(row.entrega?.parcial).toBe(true);
    expect(row.entrega?.percentual).toBeCloseTo(69.57, 2);
  });

  it('entrega completa não vira alerta', () => {
    const [row] = buildRastreioRows([
      registro({ qtd_requisicao: 115, qtd_po: 115, qtd_fornecida_po: 115, qtd_fornecida_total: 115 }),
    ]);
    expect(row.entrega?.parcial).toBe(false);
    expect(row.entrega?.excedente).toBe(false);
  });

  it('sem informação de fornecimento, a coluna fica vazia e não há alerta', () => {
    const [row] = buildRastreioRows([registro()]);
    expect(row.qtdFornecida).toBeUndefined();
    expect(row.entrega).toBeNull();
  });
});

describe('buildRastreioRows sem PO', () => {
  it('cai para a quantidade da RM e marca a chave como SEM-PO', () => {
    const [row] = buildRastreioRows([
      registro({ ri_po: undefined, documento_compra: undefined, status_requisicao: 'Sem PO' }),
    ]);
    expect(row.po).toBe('—');
    expect(row.qtd).toBe(5);
    expect(row.riPo).toBe('120009412500010-SEM-PO');
  });
});
