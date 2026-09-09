import { describe, expect, it } from 'vitest';
import {
  buscarVinculoSistenRm, formatarItemCotacao, indexarVinculosSistenPorRm, textoTecnicoParaCotacao,
  type VinculoSistenRm,
} from './centralComprasSisten';
import type { Request, RequestItem } from '../types';

function req(over: Partial<Request> = {}): Request {
  return {
    id: 'r1',
    number: '2001004',
    type: 'compra',
    status: 'aprovada',
    criticality: 2,
    solicitante_id: 'u1',
    solicitante_name: 'Jamille Souza',
    solicitante_sector_id: 'set-1',
    created_at: '2026-09-01T10:00:00Z',
    updated_at: '2026-09-01T10:00:00Z',
    linked_rm_number: '4500001234',
    ...over,
  } as Request;
}

function item(over: Partial<RequestItem> = {}): RequestItem {
  return {
    id: 'i1',
    request_id: 'r1',
    description: 'Peça genérica',
    sap_code: '1456972',
    has_no_sap_code: false,
    quantity: 10,
    unit: 'UN',
    estimated_value: 0,
    ...over,
  } as RequestItem;
}

describe('indexarVinculosSistenPorRm', () => {
  it('indexa pela RM e pelo material do item', () => {
    const r = req();
    const it1 = item({ id: 'i1', sap_code: '1456972' });
    const indice = indexarVinculosSistenPorRm([r], new Map([[r.id, [it1]]]));

    expect(indice.get('4500001234::1456972')).toEqual({ requestNumber: '2001004', item: it1 });
  });

  it('ignora solicitação sem RM vinculada', () => {
    const r = req({ linked_rm_number: undefined });
    const it1 = item();
    const indice = indexarVinculosSistenPorRm([r], new Map([[r.id, [it1]]]));
    expect(indice.size).toBe(0);
  });

  it('ignora item sem código SAP', () => {
    const r = req();
    const it1 = item({ sap_code: undefined });
    const indice = indexarVinculosSistenPorRm([r], new Map([[r.id, [it1]]]));
    expect(indice.size).toBe(0);
  });

  it('tolera zero à esquerda no material, dos dois lados', () => {
    const r = req();
    const it1 = item({ sap_code: '01456972' });
    const indice = indexarVinculosSistenPorRm([r], new Map([[r.id, [it1]]]));
    expect(indice.has('4500001234::1456972')).toBe(true);
  });

  it('a primeira ocorrência vale quando duas linhas colidem na mesma chave', () => {
    const r1 = req({ id: 'r1', number: '1000001' });
    const r2 = req({ id: 'r2', number: '2000002' });
    const it1 = item({ id: 'i1', request_id: 'r1', sap_code: '1456972' });
    const it2 = item({ id: 'i2', request_id: 'r2', sap_code: '1456972' });

    const indice = indexarVinculosSistenPorRm(
      [r1, r2],
      new Map([['r1', [it1]], ['r2', [it2]]]),
    );
    expect(indice.get('4500001234::1456972')?.requestNumber).toBe('1000001');
  });
});

describe('buscarVinculoSistenRm', () => {
  it('encontra tolerando zero à esquerda no lado da consulta', () => {
    const r = req();
    const it1 = item({ sap_code: '1456972' });
    const indice = indexarVinculosSistenPorRm([r], new Map([[r.id, [it1]]]));

    expect(buscarVinculoSistenRm(indice, '4500001234', '01456972')?.requestNumber).toBe('2001004');
    expect(buscarVinculoSistenRm(indice, '0004500001234', '1456972')).toBeTruthy();
  });

  it('devolve null quando não há vínculo', () => {
    const indice = indexarVinculosSistenPorRm([], new Map());
    expect(buscarVinculoSistenRm(indice, '4500001234', '1456972')).toBeNull();
  });
});

describe('textoTecnicoParaCotacao', () => {
  it('sem vínculo, devolve null', () => {
    expect(textoTecnicoParaCotacao(null)).toBeNull();
  });

  it('item não genérico, devolve null mesmo com observação', () => {
    const vinculo: VinculoSistenRm = {
      requestNumber: '2001004',
      item: item({ is_generic: false, observation: 'Aceita similar' }),
    };
    expect(textoTecnicoParaCotacao(vinculo)).toBeNull();
  });

  it('item genérico com observação: devolve a observação', () => {
    const vinculo: VinculoSistenRm = {
      requestNumber: '2001004',
      item: item({ is_generic: true, observation: 'Rolamento 6204, similar aceito' }),
    };
    expect(textoTecnicoParaCotacao(vinculo)).toBe('Rolamento 6204, similar aceito');
  });

  it('item genérico sem observação (vazia ou ausente): devolve null', () => {
    expect(textoTecnicoParaCotacao({
      requestNumber: '2001004', item: item({ is_generic: true, observation: '' }),
    })).toBeNull();
    expect(textoTecnicoParaCotacao({
      requestNumber: '2001004', item: item({ is_generic: true, observation: undefined }),
    })).toBeNull();
  });
});

describe('formatarItemCotacao', () => {
  it('formata item genérico substituindo a descrição pela observação, aplicando tag [IG] e deixando texto técnico em branco', () => {
    const vinculo: VinculoSistenRm = {
      requestNumber: '2001004',
      item: item({
        is_generic: true,
        observation: 'ITEM GENÉRICO: CHAVE COMBINADA 13MM',
      }),
    };

    const resultado = formatarItemCotacao({
      idx: 9, // 10º item
      materialCode: '1477274',
      textoBreve: 'CHAVE COMBINADA DE 8 MM',
      rm: '1200094199',
      unidadeMedida: 'UN',
      qtdRequisicao: 2,
      rawTechText: 'ESPECIFICACAO DO CATALOGO SAP',
      vinculo,
    });

    const esperado = [
      '10) Material: 1477274 — CHAVE COMBINADA 13MM [IG]',
      '   RM: 1200094199   |   Unidade: UN   |   Quantidade: 2',
      '   Texto Técnico: ',
    ].join('\n');

    expect(resultado).toBe(esperado);
  });

  it('formata item genérico com observação sem o prefixo ITEM GENÉRICO:', () => {
    const vinculo: VinculoSistenRm = {
      requestNumber: '2001004',
      item: item({
        is_generic: true,
        observation: 'PARAFUSO INOX 316 M10X50',
      }),
    };

    const resultado = formatarItemCotacao({
      idx: 0,
      materialCode: '1000100',
      textoBreve: 'PARAFUSO COMUM',
      rm: '1200094200',
      unidadeMedida: 'PC',
      qtdRequisicao: 10,
      vinculo,
    });

    expect(resultado).toContain('1) Material: 1000100 — PARAFUSO INOX 316 M10X50 [IG]');
    expect(resultado).toContain('   Texto Técnico: \n'.trimEnd());
  });

  it('item genérico sem observação mantém texto breve com tag [IG] e texto técnico em branco', () => {
    const vinculo: VinculoSistenRm = {
      requestNumber: '2001004',
      item: item({
        is_generic: true,
        observation: '',
      }),
    };

    const resultado = formatarItemCotacao({
      idx: 1,
      materialCode: '1000101',
      textoBreve: 'MATERIAL GENERICO',
      rm: '1200094201',
      unidadeMedida: 'UN',
      qtdRequisicao: 1,
      vinculo,
    });

    expect(resultado).toContain('2) Material: 1000101 — MATERIAL GENERICO [IG]');
    expect(resultado).toContain('   Texto Técnico: \n'.trimEnd());
  });

  it('formata item comum (não-genérico) com texto técnico e sem tag [IG]', () => {
    const resultado = formatarItemCotacao({
      idx: 0,
      materialCode: '1456972',
      textoBreve: 'DISJUNTOR BIPOLAR 20A',
      rm: '1200094199',
      unidadeMedida: 'UN',
      qtdRequisicao: 5,
      rawTechText: 'CURVA C 5KA 220V',
      vinculo: null,
    });

    const esperado = [
      '1) Material: 1456972 — DISJUNTOR BIPOLAR 20A',
      '   RM: 1200094199   |   Unidade: UN   |   Quantidade: 5',
      '   Texto Técnico: CURVA C 5KA 220V',
    ].join('\n');

    expect(resultado).toBe(esperado);
  });

  it('formata item comum sem texto técnico exibindo travessão', () => {
    const resultado = formatarItemCotacao({
      idx: 0,
      materialCode: '1456972',
      textoBreve: 'DISJUNTOR BIPOLAR 20A',
      rm: '1200094199',
      unidadeMedida: 'UN',
      qtdRequisicao: 5,
      rawTechText: null,
      vinculo: null,
    });

    expect(resultado).toContain('   Texto Técnico: —');
  });
});
