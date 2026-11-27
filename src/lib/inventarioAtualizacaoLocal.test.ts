import { describe, expect, it } from 'vitest';
import { aplicarInventarioRelido } from './inventarioAtualizacaoLocal';

const inv = (id: string, status = 'aberto', itens: any[] = []) => ({ id, data: '2026-11-27', status, itens }) as any;
const item = (material: string, status: string, contagens: string[] = []) =>
  ({ material, deposito: '0004', status, contagens: contagens.map((id) => ({ id })) });

describe('depois de contar, só o inventário em uso é relido (27/11: a lista inteira era ~380 KB por contagem)', () => {
  it('troca o inventário na lista sem mexer nos outros', () => {
    const outro = inv('b');
    const r = aplicarInventarioRelido([inv('a'), outro], null, inv('a', 'concluido'));
    expect(r.inventarios.map((i) => [i.id, i.status])).toEqual([['a', 'concluido'], ['b', 'aberto']]);
    expect(r.inventarios[1]).toBe(outro);
  });
  it('atualiza o histórico (cobertura, "já contado") com os itens novos', () => {
    const historico = [{ id: 'a', data: '2026-11-27', itens: [item('1', 'pendente')] }, { id: 'x', data: '2026-11-01', itens: [] }];
    const relido = inv('a', 'aberto', [{ ...item('1', 'conferido', ['c1']), id: 'i1', qtd_final: 3 }]);
    const r = aplicarInventarioRelido([inv('a')], historico as any, relido);
    expect(r.historico).toEqual([
      { id: 'a', data: '2026-11-27', itens: [item('1', 'conferido', ['c1'])] },
      { id: 'x', data: '2026-11-01', itens: [] },
    ]);
  });
  it('inventário que não estava na lista entra no topo; histórico ainda não carregado fica nulo', () => {
    const r = aplicarInventarioRelido([inv('b')], null, inv('a'));
    expect(r.inventarios.map((i) => i.id)).toEqual(['a', 'b']);
    expect(r.historico).toBeNull();
  });
});
