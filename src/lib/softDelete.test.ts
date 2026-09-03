import { describe, it, expect } from 'vitest';
import {
  marcarExcluido,
  marcarRestaurado,
  apenasVigentes,
  semExcluidos,
  CAMPO_EXCLUIDO,
} from './softDelete';

describe('softDelete', () => {
  it('CAMPO_EXCLUIDO deve ser excluido_em', () => {
    expect(CAMPO_EXCLUIDO).toBe('excluido_em');
  });

  it('marcarExcluido deve preencher excluido_em com ISO date e excluido_por', () => {
    const res = marcarExcluido('user-123');
    expect(res.excluido_por).toBe('user-123');
    expect(typeof res.excluido_em).toBe('string');
    expect(new Date(res.excluido_em).getTime()).not.toBeNaN();
  });

  it('marcarExcluido deve aceitar excluido_por nulo', () => {
    const res = marcarExcluido(null);
    expect(res.excluido_por).toBeNull();
    expect(typeof res.excluido_em).toBe('string');
  });

  it('marcarRestaurado deve anular excluido_em e excluido_por', () => {
    const res = marcarRestaurado();
    expect(res.excluido_em).toBeNull();
    expect(res.excluido_por).toBeNull();
  });

  it('apenasVigentes deve chamar .is("excluido_em", null) quando incluirExcluidos for falso', () => {
    let campoChamado = '';
    let valorChamado: any = 'inicial';
    const mockQuery = {
      is: (campo: string, val: any) => {
        campoChamado = campo;
        valorChamado = val;
        return mockQuery;
      },
    };

    const resultado = apenasVigentes(mockQuery, false);
    expect(campoChamado).toBe('excluido_em');
    expect(valorChamado).toBeNull();
    expect(resultado).toBe(mockQuery);
  });

  it('apenasVigentes nao deve chamar .is() quando incluirExcluidos for verdadeiro', () => {
    let foiChamado = false;
    const mockQuery = {
      is: () => {
        foiChamado = true;
        return mockQuery;
      },
    };

    const resultado = apenasVigentes(mockQuery, true);
    expect(foiChamado).toBe(false);
    expect(resultado).toBe(mockQuery);
  });

  it('semExcluidos deve filtrar itens com excluido_em preenchido quando incluirExcluidos for falso', () => {
    const itens = [
      { id: '1', excluido_em: null },
      { id: '2', excluido_em: '2026-09-03T12:00:00Z' },
      { id: '3' },
    ];
    const filtrados = semExcluidos(itens, false);
    expect(filtrados.map((x) => x.id)).toEqual(['1', '3']);
  });

  it('semExcluidos deve retornar todos os itens quando incluirExcluidos for verdadeiro', () => {
    const itens = [
      { id: '1', excluido_em: null },
      { id: '2', excluido_em: '2026-09-03T12:00:00Z' },
    ];
    const filtrados = semExcluidos(itens, true);
    expect(filtrados.length).toBe(2);
  });
});
