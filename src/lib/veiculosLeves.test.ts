/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  filtrarVeiculosLeves,
  normalizarModeloVeiculoLeve,
  normalizarPlacaVeiculoLeve,
  obterStatusLicenciamento,
} from './veiculosLeves';

describe('Veículos leves', () => {
  it('normaliza modelo e placa para o padrão usado no cadastro', () => {
    expect(normalizarModeloVeiculoLeve('  Toyota Corolla  ')).toBe('TOYOTA COROLLA');
    expect(normalizarPlacaVeiculoLeve('abc-1d23')).toBe('ABC1D23');
  });

  it('busca por modelo ou placa e mantém somente veículos ativos', () => {
    const veiculos = [
      { id: '1', modelo: 'TOYOTA COROLLA', placa: 'ABC1D23', ativo: true },
      { id: '2', modelo: 'FIAT CRONOS', placa: 'DEF2G34', ativo: false },
      { id: '3', modelo: 'VW POLO', placa: 'GHI3J45', ativo: true },
    ];

    expect(filtrarVeiculosLeves(veiculos, 'corolla').map((v) => v.id)).toEqual(['1']);
    expect(filtrarVeiculosLeves(veiculos, 'ghi3j45').map((v) => v.id)).toEqual(['3']);
    expect(filtrarVeiculosLeves(veiculos, '').map((v) => v.id)).toEqual(['1', '3']);
  });

  it('classifica o licenciamento por proximidade, vencimento e ausência de data', () => {
    expect(obterStatusLicenciamento('2026-09-13', '2026-09-14')).toMatchObject({ status: 'vencido', diasRestantes: -1 });
    expect(obterStatusLicenciamento('2026-10-14', '2026-09-14')).toMatchObject({ status: 'proximo', diasRestantes: 30 });
    expect(obterStatusLicenciamento('2026-10-15', '2026-09-14')).toMatchObject({ status: 'regular', diasRestantes: 31 });
    expect(obterStatusLicenciamento(null, '2026-09-14')).toMatchObject({ status: 'sem_data', diasRestantes: null });
  });
});
