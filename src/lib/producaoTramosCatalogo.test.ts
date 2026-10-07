import { describe, expect, it } from 'vitest';
import { compararCadastroTramos, type CatalogoTramo } from './producaoTramosCatalogo';
import type { CadastroTorreTramo } from './producaoTramosImportacao';

function cadastro(torreNumero: number, tramo: CadastroTorreTramo['tramo'], sequencial: number): CadastroTorreTramo {
  return { torreNumero, tramo, sequencial };
}

function catalogo(torreNumero: number, tramo: CatalogoTramo['tramo'], serie: number): CatalogoTramo {
  return { id: `${tramo}-${serie}`, torreNumero, tramo, serie, subprojetoId: 'SP01' };
}

describe('compararCadastroTramos', () => {
  it('identifica mudança de torre e ausência sem alterar a identidade da série', () => {
    const divergencias = compararCadastroTramos(
      [cadastro(2, 'T1', 3153), cadastro(8, 'T5', 3202)],
      [catalogo(3, 'T1', 3153), catalogo(8, 'T5', 3102)],
    );

    expect(divergencias).toContainEqual({
      tipo: 'TORRE_DIVERGENTE', serie: 3153, tramo: 'T1', esperado: 2, atual: 3,
    });
    expect(divergencias).toContainEqual({
      tipo: 'SERIE_AUSENTE', serie: 3202, tramo: 'T5', esperado: 8, atual: null,
    });
  });
});
