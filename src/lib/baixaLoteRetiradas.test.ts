import { describe, it, expect } from 'vitest';
import { agruparPorMaterial, atalhosSelecao, itensQueFicam, itensQueSaem, podeEntrarNoLote, resumirResultado } from './baixaLoteRetiradas';
import type { SaldoParaRegularizar } from './retiradaSemSaldoBaixa';

const luva = { material: '1355906', descricao: 'LUVA TAM 9', unidade: 'UN', quantidade: 1 };
const pincel = { material: '1166536', descricao: 'PINCEL 1"', unidade: 'UN', quantidade: 3 };

const reg = (id: string, itens = [luva], extra: Record<string, unknown> = {}) => ({
  id, codigo: `RSS-${id}`, status: 'PENDENTE' as const, itens, aprovacao_status: 'APROVADA' as const, aplicacao_pep: 'TEN001', ...extra,
});
const pronta = (n = 1): SaldoParaRegularizar => ({ prontidao: 'pronta', itensComSaldo: n, totalItens: n });

describe('baixa em lote', () => {
  it('só entra pendente com código', () => {
    expect(podeEntrarNoLote({ codigo: 'RSS-1', status: 'PENDENTE' })).toBe(true);
    expect(podeEntrarNoLote({ codigo: null, status: 'PENDENTE' })).toBe(false);
    expect(podeEntrarNoLote({ codigo: 'RSS-1', status: 'REGULARIZADA' })).toBe(false);
  });

  it('agrupa por material somando quantidade e contando a retirada uma vez', () => {
    const g = agruparPorMaterial([reg('1'), reg('2'), reg('3', [pincel, { ...pincel, quantidade: 2 }])]);
    expect(g[0]).toMatchObject({ material: '1355906', quantidade: 2, retiradas: 2 });
    expect(g[1]).toMatchObject({ material: '1166536', quantidade: 5, retiradas: 1 });
  });

  it('atalhos: prontas, prontas aprovadas e por material', () => {
    const registros = [
      reg('1'), reg('2'), reg('3', [luva], { aprovacao_status: 'PENDENTE' }),
      reg('4', [pincel]), reg('5', [luva, pincel]), reg('6'),
    ];
    const saldo = new Map<string, SaldoParaRegularizar>([
      ['1', pronta()], ['2', pronta()], ['3', pronta()], ['4', pronta()], ['5', pronta(2)],
      ['6', { prontidao: 'aguardando', itensComSaldo: 0, totalItens: 1 }],
    ]);
    const a = atalhosSelecao(registros, saldo);
    expect(a.prontas).toEqual(['1', '2', '3', '4', '5']);
    expect(a.prontasAprovadas).toEqual(['1', '2', '4', '5']);
    expect(a.porMaterial).toEqual([{ material: '1355906', descricao: 'LUVA TAM 9', ids: ['1', '2', '3'] }]);
  });

  it('parcial: sai o que tem saldo e não saiu ainda; fica o resto', () => {
    const r = reg('9', [luva, pincel, { ...luva, material: '1352181' }]);
    const cobertura = new Map([['9', [true, false, true]]]);
    const baixados = new Map([['9', [false, false, true]]]);
    expect(itensQueSaem(r, cobertura, baixados).map(i => i.material)).toEqual(['1355906']);
    expect(itensQueFicam(r, cobertura, baixados).map(i => i.material)).toEqual(['1166536']);
    expect(itensQueSaem(r, null, null)).toHaveLength(3);
    const saldo = new Map<string, SaldoParaRegularizar>([['9', { prontidao: 'parcial', itensComSaldo: 1, totalItens: 2 }]]);
    expect(atalhosSelecao([r], saldo).parciais).toEqual(['9']);
  });

  it('sem saldo lido, nenhuma pronta', () => {
    expect(atalhosSelecao([reg('1')], null).prontas).toEqual([]);
  });

  it('resume o retorno do banco', () => {
    const r = resumirResultado([
      { rss: 'RSS-1', rqb: 'RQB-1', id: 'a', ok: true },
      { rss: 'RSS-2', rqb: 'RQB-2', ok: false, erro: 'Sem PEP' },
      { rss: 'RSS-3', rqb: 'RQB-3', id: 'c', ok: true, parcial: true, itens_restantes: 1 },
    ]);
    expect(r.parciais).toHaveLength(1);
    expect(r.idsConfirmados).toEqual(['a', 'c']);
    expect(r.falhas).toHaveLength(1);
  });
});
