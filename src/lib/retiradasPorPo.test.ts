import { describe, expect, it } from 'vitest';
import { agruparPorPo, itensAguardandoNf, situacaoGrupoPo, textoListaPos, type ItemAguardandoNf } from './retiradasPorPo';
import type { PendenciaNfMaterial, PoAguardandoNf } from './relatorioSolExtra';

const item = (o: Partial<ItemAguardandoNf>): ItemAguardandoNf => ({
  registroId: 'r1', codigo: 'RSS-01', data: '2026-10-01', material: '100', descricao: 'BACIA', unidade: 'UN', quantidade: 1, ...o,
});
const po = (o: Partial<PoAguardandoNf>): PoAguardandoNf => ({
  pedido: '4500000001/10', fornecedor: 'FORN A', remessaPrevista: '2026-11-20', quantidadePendente: 10, chegouSemMigo: false, ...o,
});

describe('itensAguardandoNf', () => {
  it('pula o item que o saldo já cobre e normaliza o material', () => {
    const r = [{ id: 'a', codigo: 'RSS-1', data: '2026-10-02', itens: [
      { material: '000100', descricao: 'X', unidade: 'UN', quantidade: 2 },
      { material: '200', descricao: 'Y', unidade: 'UN', quantidade: 1 },
    ] }];
    expect(itensAguardandoNf(r, new Map([['a', [false, true]]])).map(i => i.material)).toEqual(['100']);
    // Sem leitura da ZL0024: tudo espera NF.
    expect(itensAguardandoNf(r, null)).toHaveLength(2);
  });
});

describe('agruparPorPo', () => {
  it('agrupa pelo número do PO e soma as retiradas do mesmo material', () => {
    const pend = new Map<string, PendenciaNfMaterial>([['100', { pedidos: [po({})], rmsSemPedido: [] }]]);
    const g = agruparPorPo([item({}), item({ registroId: 'r2', codigo: 'RSS-02', quantidade: 2 })], pend);
    expect(g).toHaveLength(1);
    expect(g[0].pedido).toBe('4500000001');
    expect(g[0].linhas[0].quantidade).toBe(3);
    expect(g[0].totalRetiradas).toBe(2);
  });

  it('consome o pendente do PO e o que sobra vai para o próximo PO, depois para "sem PO"', () => {
    const pend = new Map<string, PendenciaNfMaterial>([['100', {
      pedidos: [po({ quantidadePendente: 2 }), po({ pedido: '4500000002/10', quantidadePendente: 1 })],
      rmsSemPedido: ['1100000001/10'],
    }]]);
    const g = agruparPorPo([item({ quantidade: 2 }), item({ registroId: 'r2', codigo: 'RSS-02', data: '2026-10-05', quantidade: 3 })], pend);
    expect(g.map(x => [x.tipo, x.pedido, x.linhas[0].quantidade])).toEqual([
      ['po', '4500000001', 2], ['po', '4500000002', 1], ['rm_sem_po', '', 2],
    ]);
    expect(g[2].rms).toEqual(['1100000001/10']);
  });

  it('material sem PO nem RM cai em "sem PO"; chegou sem MIGO vem primeiro', () => {
    const pend = new Map<string, PendenciaNfMaterial>([
      ['100', { pedidos: [po({})], rmsSemPedido: [] }],
      ['200', { pedidos: [po({ pedido: '4500000009/20', chegouSemMigo: true })], rmsSemPedido: [] }],
    ]);
    const g = agruparPorPo([item({}), item({ material: '200', data: '2026-10-09' }), item({ material: '300' })], pend);
    expect(g.map(x => x.pedido || x.tipo)).toEqual(['4500000009', '4500000001', 'sem_po']);
    expect(textoListaPos(g)).toBe('4500000009 — FORN A — 1 item — chegou, falta MIGO\n4500000001 — FORN A — 1 item');
  });

  it('PO já entregue perto da retirada vai para "po_entregue" com a saída do SAP; PO antigo não conta', () => {
    const pend = new Map<string, PendenciaNfMaterial>([
      ['1270185', {
        pedidos: [], rmsSemPedido: [],
        entregues: [{ pedido: '4100472528/30', fornecedor: 'F', entradaEm: '2026-11-05', quantidade: 2 }],
        ultimaSaida: { data: '2026-11-06', tipo: '221', descricao: 'SM para projeto', quantidade: 2 },
      }],
      ['41081', {
        pedidos: [], rmsSemPedido: [],
        entregues: [{ pedido: '4100171294/30', fornecedor: 'F', entradaEm: '2017-10-19', quantidade: 2 }],
      }],
    ]);
    const g = agruparPorPo([
      item({ material: '1270185', data: '2026-11-05', quantidade: 2 }),
      item({ material: '41081', data: '2026-11-03' }),
    ], pend);
    expect(g.map(x => x.tipo)).toEqual(['po_entregue', 'sem_po']);
    expect(g[0].linhas[0]).toMatchObject({ itemPedido: '4100472528/30', entradaEm: '2026-11-05', saidaSap: { tipo: '221' } });
  });

  it('situação do PO', () => {
    expect(situacaoGrupoPo({ chegouSemMigo: true, remessaPrevista: null }, '2026-11-18')).toBe('chegou');
    expect(situacaoGrupoPo({ chegouSemMigo: false, remessaPrevista: '2026-11-01' }, '2026-11-18')).toBe('atrasado');
    expect(situacaoGrupoPo({ chegouSemMigo: false, remessaPrevista: '2026-11-30' }, '2026-11-18')).toBe('aguardando');
  });
});
