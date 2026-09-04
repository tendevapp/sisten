/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { calcularNovaOrdenacao } from './facilitiesApi';
import type { FacServico } from '../types';

const mockServico = (id: string, nome: string, ordem: number): FacServico => ({
  id,
  nome,
  descricao: `Descricao ${nome}`,
  ordem,
  ativo: true,
  created_at: '2026-09-04T00:00:00Z',
  updated_at: '2026-09-04T00:00:00Z',
});

describe('calcularNovaOrdenacao', () => {
  const servicosBase: FacServico[] = [
    mockServico('1', 'Eletrica', 1),
    mockServico('2', 'Hidraulica', 2),
    mockServico('3', 'Climatizacao', 3),
    mockServico('4', 'Mobiliario', 4),
    mockServico('5', 'Chaves/Acesso', 5),
    mockServico('6', 'Limpeza', 6),
    mockServico('7', 'Viagem', 7),
    mockServico('99', 'Outro', 99),
  ];

  it('deve mover o primeiro item para baixo trocando com o vizinho', () => {
    const { novosServicos, itensAlterados } = calcularNovaOrdenacao(
      servicosBase,
      servicosBase[0],
      1,
    );

    expect(novosServicos[0].nome).toBe('Hidraulica');
    expect(novosServicos[0].ordem).toBe(1);

    expect(novosServicos[1].nome).toBe('Eletrica');
    expect(novosServicos[1].ordem).toBe(2);

    expect(itensAlterados).toEqual([
      { id: '2', ordem: 1 },
      { id: '1', ordem: 2 },
    ]);
  });

  it('deve mover um item intermediario para cima', () => {
    const { novosServicos, itensAlterados } = calcularNovaOrdenacao(
      servicosBase,
      servicosBase[2], // Climatizacao (3)
      -1,
    );

    expect(novosServicos[1].nome).toBe('Climatizacao');
    expect(novosServicos[1].ordem).toBe(2);

    expect(novosServicos[2].nome).toBe('Hidraulica');
    expect(novosServicos[2].ordem).toBe(3);

    expect(itensAlterados).toEqual([
      { id: '3', ordem: 2 },
      { id: '2', ordem: 3 },
    ]);
  });

  it('nao deve mover alem do topo (indice 0 com direcao -1)', () => {
    const { novosServicos, itensAlterados } = calcularNovaOrdenacao(
      servicosBase,
      servicosBase[0],
      -1,
    );

    expect(itensAlterados).toHaveLength(0);
    expect(novosServicos[0].id).toBe('1');
  });

  it('nao deve mover alem do final (ultimo indice com direcao 1)', () => {
    const { novosServicos, itensAlterados } = calcularNovaOrdenacao(
      servicosBase,
      servicosBase[7], // Outro
      1,
    );

    expect(itensAlterados).toHaveLength(0);
    expect(novosServicos[7].id).toBe('99');
  });

  it('ao subir o item Outro, ele deve assumir numero ordinal comum e nao 99', () => {
    const { novosServicos, itensAlterados } = calcularNovaOrdenacao(
      servicosBase,
      servicosBase[7], // Outro
      -1,
    );

    expect(novosServicos[6].nome).toBe('Outro');
    expect(novosServicos[6].ordem).toBe(7);

    expect(novosServicos[7].nome).toBe('Viagem');
    expect(novosServicos[7].ordem).toBe(8);

    expect(itensAlterados).toEqual([
      { id: '99', ordem: 7 },
      { id: '7', ordem: 8 },
    ]);
  });

  it('ao descer o item Outro de volta para a ultima posicao, ele volta a ser 99', () => {
    const listaComOutroNoMeio: FacServico[] = [
      mockServico('1', 'Eletrica', 1),
      mockServico('99', 'Outro', 7),
      mockServico('7', 'Viagem', 8),
    ];

    const { novosServicos, itensAlterados } = calcularNovaOrdenacao(
      listaComOutroNoMeio,
      listaComOutroNoMeio[1], // Outro
      1,
    );

    expect(novosServicos[1].nome).toBe('Viagem');
    expect(novosServicos[1].ordem).toBe(2);

    expect(novosServicos[2].nome).toBe('Outro');
    expect(novosServicos[2].ordem).toBe(99);

    expect(itensAlterados).toContainEqual({ id: '7', ordem: 2 });
    expect(itensAlterados).toContainEqual({ id: '99', ordem: 99 });
  });

  it('deve curar ordens duplicadas garantindo sequencia unica', () => {
    const listaComDuplicatas: FacServico[] = [
      mockServico('a', 'Servico A', 2),
      mockServico('b', 'Servico B', 2),
      mockServico('c', 'Servico C', 3),
      mockServico('d', 'Outro', 99),
    ];

    const { novosServicos } = calcularNovaOrdenacao(
      listaComDuplicatas,
      listaComDuplicatas[0], // Servico A
      1,
    );

    expect(novosServicos[0].nome).toBe('Servico B');
    expect(novosServicos[0].ordem).toBe(1);

    expect(novosServicos[1].nome).toBe('Servico A');
    expect(novosServicos[1].ordem).toBe(2);

    expect(novosServicos[2].nome).toBe('Servico C');
    expect(novosServicos[2].ordem).toBe(3);

    expect(novosServicos[3].nome).toBe('Outro');
    expect(novosServicos[3].ordem).toBe(99);
  });
});
