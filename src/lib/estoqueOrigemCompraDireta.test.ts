import { describe, it, expect } from 'vitest';
import type { Request, RequestItem } from '../types';
import { setoresCompraDireta, indexarSetoresCompraDireta, criarResolvedorCompraDireta } from './estoqueOrigemCompraDireta';

const setores = [
  { id: '1', name: 'Produção' },
  { id: '2', name: 'Qualidade' },
];

const req = (over: Partial<Request>): Request => ({
  id: 'r1', number: '3000001', type: 'compra', status: 'aprovada', criticality: 3,
  solicitante_id: 'u', solicitante_name: 'U', solicitante_sector_id: '1',
  created_at: '2026-09-01T10:00:00Z', updated_at: '2026-09-01T10:00:00Z',
  tipo_compra: 'Direta', ...over,
} as Request);

const item = (over: Partial<RequestItem>): RequestItem => ({
  id: 'i1', request_id: 'r1', description: 'x', sap_code: '000123', has_no_sap_code: false,
  quantity: 1, unit: 'UN', estimated_value: 0, ...over,
});

describe('setoresCompraDireta', () => {
  it('agrupa por setor e ignora zeros à esquerda no código', () => {
    const r = setoresCompraDireta('123', [
      req({ id: 'r1' }),
      req({ id: 'r2', number: '3000002', created_at: '2026-09-10T10:00:00Z' }),
      req({ id: 'r3', solicitante_sector_id: '2' }),
    ], [item({}), item({ id: 'i2', request_id: 'r2' }), item({ id: 'i3', request_id: 'r3', sap_code: '123' })], setores);
    expect(r.map(s => [s.setor, s.solicitacoes])).toEqual([['Produção', 2], ['Qualidade', 1]]);
    expect(r[0].ultimaNumero).toBe('3000002');
  });

  it('ignora compra de estoque, rascunho e cancelada', () => {
    const r = setoresCompraDireta('123', [
      req({ id: 'r1', tipo_compra: 'Estoque' }),
      req({ id: 'r2', status: 'rascunho' }),
      req({ id: 'r3', status: 'cancelada' }),
    ], [item({ request_id: 'r1' }), item({ id: 'i2', request_id: 'r2' }), item({ id: 'i3', request_id: 'r3' })], setores);
    expect(r).toEqual([]);
  });

  it('indexa os setores por material normalizado, só de compra direta válida', () => {
    const mapa = indexarSetoresCompraDireta(
      [req({ id: 'r1' }), req({ id: 'r2', solicitante_sector_id: '2' }), req({ id: 'r3', tipo_compra: 'Estoque' })],
      [item({}), item({ id: 'i2', request_id: 'r2', sap_code: '123' }), item({ id: 'i3', request_id: 'r3', sap_code: '999' })],
    );
    expect([...(mapa.get('123') ?? [])].sort()).toEqual(['1', '2']);
    expect(mapa.has('999')).toBe(false);
  });

  it('devolve vazio sem material', () => {
    expect(setoresCompraDireta('', [req({})], [item({})], setores)).toEqual([]);
  });
});

describe('criarResolvedorCompraDireta', () => {
  const reqs = [
    req({ id: 'rd', number: '3000010', linked_rm_number: '0010001234' }),
    req({ id: 're', number: '3000011', tipo_compra: 'Estoque', linked_rm_number: '10005678', solicitante_sector_id: '2' }),
  ];
  const its = [
    item({ id: 'a', request_id: 'rd', sap_code: '555' }),
    item({ id: 'b', request_id: 're', sap_code: '555' }),
    item({ id: 'c', request_id: 'rd', sap_code: '777' }),
  ];
  const resolver = criarResolvedorCompraDireta(reqs, its, setores);

  it('confirma pela RM + material, tolerando zeros à esquerda', () => {
    expect(resolver('10001234', '000555')).toEqual({ setores: ['Produção'], solicitacao: '3000010', exata: true });
  });

  it('RM de solicitação de estoque não leva tag, mesmo que o material tenha sido compra direta noutra RM', () => {
    expect(resolver('10005678', '555')).toBeNull();
  });

  it('sem RM vinculada infere pelo material', () => {
    expect(resolver(null, '777')).toEqual({ setores: ['Produção'], solicitacao: null, exata: false });
    expect(resolver('99999', '777')?.exata).toBe(false);
  });

  it('material nunca pedido em compra direta não tem tag', () => {
    expect(resolver('10001234', '888')).toBeNull();
  });
});
