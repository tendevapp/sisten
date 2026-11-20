import { describe, expect, it } from 'vitest';
import { buscaNoHistorico, faixaForaDaLista, lotesNoPeriodo, mesclarRequisicoes } from './requisicaoBalcaoHistorico';

describe('buscaNoHistorico', () => {
  it('código RQB, com ou sem hífen, completo ou pelo começo', () => {
    expect(buscaNoHistorico('RQB-101126-17')).toEqual({ tipo: 'codigo', prefixo: 'RQB-101126-17' });
    expect(buscaNoHistorico(' rqb-101126-1 ')).toEqual({ tipo: 'codigo', prefixo: 'RQB-101126-1' });
    expect(buscaNoHistorico('RQB101126')).toEqual({ tipo: 'codigo', prefixo: 'RQB-101126' });
    expect(buscaNoHistorico('RQB-101126-')).toEqual({ tipo: 'codigo', prefixo: 'RQB-101126-' });
  });

  it('doc. SAP pelos dígitos; material (7) e texto ficam na lista', () => {
    expect(buscaNoHistorico('4904120006')).toEqual({ tipo: 'doc', doc: '4904120006' });
    expect(buscaNoHistorico('1443652')).toBeNull();
    expect(buscaNoHistorico('RQB-1')).toBeNull();
    expect(buscaNoHistorico('adriano')).toBeNull();
    expect(buscaNoHistorico('')).toBeNull();
  });
});

describe('faixaForaDaLista', () => {
  const desde = '2026-11-11';
  it('lista completa ou período vazio: nada a buscar', () => {
    expect(faixaForaDaLista({ base: 'criacao', de: '2026-11-01', ate: '' }, '')).toBeNull();
    expect(faixaForaDaLista({ base: 'criacao', de: '', ate: '' }, desde)).toBeNull();
  });
  it('período todo depois do corte: a lista já tem', () => {
    expect(faixaForaDaLista({ base: 'criacao', de: '2026-11-12', ate: '' }, desde)).toBeNull();
  });
  it('busca só a parte anterior, com o dia do corte', () => {
    expect(faixaForaDaLista({ base: 'criacao', de: '2026-11-10', ate: '2026-11-19' }, desde)).toEqual({ de: '2026-11-10', ate: desde });
    expect(faixaForaDaLista({ base: 'criacao', de: '2026-11-11', ate: '' }, desde)).toEqual({ de: desde, ate: desde });
    expect(faixaForaDaLista({ base: 'criacao', de: '', ate: '2026-10-31' }, desde)).toEqual({ de: '', ate: '2026-10-31' });
  });
  it('base exportação vai pelos lotes', () => {
    expect(faixaForaDaLista({ base: 'exportacao', de: '2026-11-10', ate: '' }, desde)).toBeNull();
  });
});

describe('lotesNoPeriodo', () => {
  const lotes = [
    { id: 'a', created_at: '2026-11-19T19:26:05Z' },
    { id: 'b', created_at: '2026-11-11T13:27:21Z' },
  ];
  it('pelo dia local da exportação', () => {
    expect(lotesNoPeriodo({ base: 'exportacao', de: '2026-11-19', ate: '2026-11-19' }, lotes)).toEqual(['a']);
    expect(lotesNoPeriodo({ base: 'criacao', de: '2026-11-19', ate: '' }, lotes)).toEqual([]);
  });
});

describe('mesclarRequisicoes', () => {
  it('a versão do banco vence e a ordem segue data e criação', () => {
    const lista = [
      { id: '1', data: '2026-11-19', created_at: '2026-11-19T10:00:00Z', doc_sap: null as string | null },
      { id: '2', data: '2026-11-18', created_at: '2026-11-18T10:00:00Z', doc_sap: null },
    ];
    const extras = [
      { id: '3', data: '2026-11-10', created_at: '2026-11-10T16:28:38Z', doc_sap: '4904120006' },
      { id: '2', data: '2026-11-18', created_at: '2026-11-18T10:00:00Z', doc_sap: '4904119999' },
    ];
    const r = mesclarRequisicoes(lista, extras);
    expect(r.map((x) => x.id)).toEqual(['1', '2', '3']);
    expect(r[1].doc_sap).toBe('4904119999');
    expect(mesclarRequisicoes(lista, [])).toBe(lista);
  });
});
