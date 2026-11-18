import { describe, expect, it } from 'vitest';
import { buscarComRmAberta, indexarRmAbertas, materiaisSemRmAberta, rotuloRmAberta, type LinhaRmAberta } from './rmAberta';
import type { MaterialDisponivel } from './requisicaoBalcao';

const linha = (o: Partial<LinhaRmAberta>): LinhaRmAberta => ({
  material: '1393228', descricao: 'LENCOL BORRACHA', unidade: 'M', rm: '1200095365/10', pedido: '4100474328',
  situacao: 'em_pedido', data_solicitacao: '2026-10-01', ...o,
});
const mat = (material: string, descricao: string): MaterialDisponivel => ({ material, descricao, unidade: 'UN', saldo: 0 });

describe('RM aberta na Solicitação Extraordinária', () => {
  const rms = indexarRmAbertas([
    linha({}),
    linha({ rm: '1200099999/20', pedido: null, situacao: 'sem_pedido' }),
    linha({ material: '0001460759', descricao: 'BACIA DE CONTENCAO 50L', unidade: 'UN', rm: '1200011111/10', pedido: null, situacao: 'sem_pedido' }),
  ]);

  it('agrupa por material (sem zeros à esquerda) e monta o rótulo', () => {
    expect([...rms.keys()]).toEqual(['1393228', '1460759']);
    expect(rotuloRmAberta(rms.get('1393228')!)).toBe('RM 1200095365/10 +1 · PO 4100474328');
    expect(rotuloRmAberta(rms.get('1460759')!)).toBe('RM 1200011111/10 · sem pedido');
  });

  it('busca põe primeiro o que tem RM e acha material com RM fora do cadastro', () => {
    const catalogo = [mat('1000001', 'BACIA PLASTICA'), mat('1393228', 'LENCOL BORRACHA NBR')];
    const r = buscarComRmAberta(catalogo, rms, 'bacia');
    expect(r.map(x => [x.item.material, !!x.rm])).toEqual([['1460759', true], ['1000001', false]]);
    // Sem a lista de RMs: busca normal.
    expect(buscarComRmAberta(catalogo, null, 'bacia').map(x => x.item.material)).toEqual(['1000001']);
  });

  it('lista os materiais sem RM, ignorando os já gravados no registro', () => {
    expect(materiaisSemRmAberta(['01393228', '777', '777', '888'], rms, ['888'])).toEqual(['777']);
  });
});
