import { describe, expect, it } from 'vitest';
import {
  buscarVinculoSistenRm, indexarVinculosSistenPorRm, textoTecnicoParaCotacao,
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
