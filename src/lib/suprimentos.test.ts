import { describe, expect, it } from 'vitest';
import type { EnrichedSAPRecord } from '../types';
import type { CompradorInfo } from './demandas';
import { calcCarteiraPorComprador, umRegistroPorItem } from './suprimentos';

const reg = (extra: Partial<EnrichedSAPRecord>): EnrichedSAPRecord => ({
  ri: 'ri', status_requisicao: 'Sem PO', grupo_comprador: '358', dias_em_aberto: 0, ...extra,
} as EnrichedSAPRecord);

const compradores: CompradorInfo[] = [
  { grupo_compras: '358', nome_comprador: 'Isadora', usuario_sistema: 'ISANTOS', ativo: true },
  { grupo_compras: '602', nome_comprador: 'Jamille', usuario_sistema: 'JSBATISTA', ativo: false },
];

// RM de gás: um item, três pedidos.
const gas = ['2026-03-10', '2026-02-01', '2026-04-05'].map((data, i) => reg({
  ri: 'GAS', status_requisicao: 'Processado', criado_por_pedido: 'ISANTOS', data_pedido: data,
  documento_compra: `410000000${i}`, valor_total: 100,
}));

describe('umRegistroPorItem', () => {
  it('fica a linha do primeiro pedido do item', () => {
    const unicos = umRegistroPorItem([...gas, reg({ ri: 'ABERTO' })]);
    expect(unicos).toHaveLength(2);
    expect(unicos.find(r => r.ri === 'GAS')!.data_pedido).toBe('2026-02-01');
  });
});

describe('calcCarteiraPorComprador', () => {
  it('conta itens de RM, mas o spend soma todos os pedidos', () => {
    const [isadora] = calcCarteiraPorComprador([...gas, reg({ ri: 'A1', dias_em_aberto: 40 })], compradores);
    expect(isadora).toMatchObject({ comprador: 'Isadora', processados: 1, abertos: 1, total: 2, conversao: 50, criticos: 1, spend: 300 });
  });

  it('quem não compra mais vai para Outros', () => {
    const linhas = calcCarteiraPorComprador([
      reg({ ri: 'J1', status_requisicao: 'Processado', criado_por_pedido: 'JSBATISTA', valor_total: 10 }),
      reg({ ri: 'W1', status_requisicao: 'Processado', criado_por_pedido: 'WNETO', valor_total: 5 }),
    ], compradores);
    expect(linhas).toEqual([expect.objectContaining({ comprador: 'Outros', processados: 2, spend: 15 })]);
  });
});
