import { describe, expect, it } from 'vitest';
import type { FornecedorMaterialRow } from '../types';
import { mesclarFornecedoresMaterial, origensDe, sugestaoDeItemCotado, type SugestaoFornecedor } from './fornecedoresMaterial';

const linha = (extra: Partial<FornecedorMaterialRow>): FornecedorMaterialRow => ({
  cod_forn: '—', cnpj: '—', fornecedor: 'X', regiao_uf: '—', telefone: '—', email: '—', classificacao: '—', ultima_data: '—', ...extra,
});

const sug = (origem: SugestaoFornecedor['origem'], row: Partial<FornecedorMaterialRow>): SugestaoFornecedor =>
  ({ materialNorm: '1', origem, row: linha(row) });

describe('mesclarFornecedoresMaterial', () => {
  it('marca PO e acrescenta cotação e catálogo de fornecedores novos', () => {
    const r = mesclarFornecedoresMaterial(
      [linha({ fornecedor: 'ACME', cnpj: '11222333000144', cod_forn: '100' })],
      [sug('COTACAO', { fornecedor: 'BETA', cnpj: '99888777000166' }), sug('CATALOGO', { fornecedor: 'RITEC' })],
    );
    expect(r.map(f => [f.fornecedor, f.origens])).toEqual([['ACME', ['PO']], ['BETA', ['COTACAO']], ['RITEC', ['CATALOGO']]]);
  });

  it('une o mesmo fornecedor por CNPJ e completa campos vazios sem sobrescrever o PO', () => {
    const r = mesclarFornecedoresMaterial(
      [linha({ fornecedor: 'ACME LTDA', cnpj: '11222333000144', cod_forn: '100', preco_liquido: 10 })],
      [sug('COTACAO', { fornecedor: 'Acme', cnpj: '11.222.333/0001-44', email: 'v@acme.com', preco_liquido: 8 })],
    );
    expect(r).toHaveLength(1);
    expect(r[0].origens).toEqual(['PO', 'COTACAO']);
    expect(r[0].email).toBe('v@acme.com');
    expect(r[0].preco_liquido).toBe(10);
  });

  it('une por código SAP ignorando zeros à esquerda', () => {
    const r = mesclarFornecedoresMaterial(
      [linha({ fornecedor: 'ACME', cod_forn: '0000100' })],
      [sug('CATALOGO', { fornecedor: 'OUTRO NOME', cod_forn: '100' })],
    );
    expect(r).toHaveLength(1);
    expect(r[0].origens).toEqual(['PO', 'CATALOGO']);
  });

  it('une cotação e catálogo do mesmo fornecedor quando não há PO', () => {
    const r = mesclarFornecedoresMaterial([], [sug('CATALOGO', { fornecedor: 'RITEC' }), sug('COTACAO', { fornecedor: 'Ritec' })]);
    expect(r).toHaveLength(1);
    expect(r[0].origens).toEqual(['COTACAO', 'CATALOGO']);
  });
});

describe('origensDe', () => {
  it('assume PO quando a linha não traz origens', () => {
    expect(origensDe(linha({}))).toEqual(['PO']);
  });
});

describe('sugestaoDeItemCotado', () => {
  const proposta = { fornecedor_razao_social: 'BETA SA', fornecedor_cnpj: '99888777000166', cod_vendor: '0000200', data_emissao: '2026-09-01' };

  it('ignora item desconsiderado, fora de escopo ou sem fornecedor', () => {
    expect(sugestaoDeItemCotado({ material_code: '1', desconsiderado: true, proposta }, new Map())).toBeNull();
    expect(sugestaoDeItemCotado({ material_code: '1', fora_escopo: true, proposta }, new Map())).toBeNull();
    expect(sugestaoDeItemCotado({ material_code: '1', proposta: { fornecedor_razao_social: ' ' } }, new Map())).toBeNull();
  });

  it('monta a sugestão com preço e data da proposta', () => {
    const s = sugestaoDeItemCotado({ material_code: '000123', preco_unitario: '12.5', proposta }, new Map())!;
    expect(s.materialNorm).toBe('123');
    expect(s.origem).toBe('COTACAO');
    expect(s.row.preco_liquido).toBe(12.5);
    expect(s.row.ultima_data).toBe('2026-09-01');
  });
});
