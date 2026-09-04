/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import type { SsmaRidFoto } from '../types';

describe('SSMA RID Fotos Antes e Depois', () => {
  const mockFoto = (id: string, tipo?: 'antes' | 'depois'): SsmaRidFoto => ({
    id,
    path: `desvio-123/${tipo || 'antes'}_${id}.jpg`,
    name: `foto_${id}.jpg`,
    size: 102400,
    mime_type: 'image/jpeg',
    preview_url: `https://storage.mock/${id}.jpg`,
    tipo,
    created_at: '2026-09-04T12:00:00Z',
  });

  it('deve segregar corretamente fotos do antes e do depois', () => {
    const fotos: SsmaRidFoto[] = [
      mockFoto('1', 'antes'),
      mockFoto('2', 'depois'),
      mockFoto('3', 'antes'),
      mockFoto('4', 'depois'),
    ];

    const fotosAntes = fotos.filter((f) => f.tipo !== 'depois');
    const fotosDepois = fotos.filter((f) => f.tipo === 'depois');

    expect(fotosAntes).toHaveLength(2);
    expect(fotosAntes.map((f) => f.id)).toEqual(['1', '3']);

    expect(fotosDepois).toHaveLength(2);
    expect(fotosDepois.map((f) => f.id)).toEqual(['2', '4']);
  });

  it('fotos legadas sem campo tipo devem ser agrupadas no antes por padrao', () => {
    const fotosMistas: SsmaRidFoto[] = [
      mockFoto('legada-1', undefined),
      mockFoto('nova-antes', 'antes'),
      mockFoto('nova-depois', 'depois'),
    ];

    const fotosAntes = fotosMistas.filter((f) => f.tipo !== 'depois');
    const fotosDepois = fotosMistas.filter((f) => f.tipo === 'depois');

    expect(fotosAntes).toHaveLength(2);
    expect(fotosAntes.some((f) => f.id === 'legada-1')).toBe(true);
    expect(fotosDepois).toHaveLength(1);
    expect(fotosDepois[0].id).toBe('nova-depois');
  });

  it('deve alternar o tipo da foto de antes para depois e vice-versa', () => {
    interface FotoItemForm {
      file: { name: string };
      tipo: 'antes' | 'depois';
    }

    let fotosForm: FotoItemForm[] = [
      { file: { name: 'foto1.jpg' }, tipo: 'antes' },
      { file: { name: 'foto2.jpg' }, tipo: 'depois' },
    ];

    // Alternar foto1 de antes para depois
    fotosForm = fotosForm.map((f, idx) =>
      idx === 0 ? { ...f, tipo: f.tipo === 'antes' ? 'depois' : 'antes' } : f
    );

    expect(fotosForm[0].tipo).toBe('depois');

    // Alternar de volta para antes
    fotosForm = fotosForm.map((f, idx) =>
      idx === 0 ? { ...f, tipo: f.tipo === 'antes' ? 'depois' : 'antes' } : f
    );

    expect(fotosForm[0].tipo).toBe('antes');
  });

  it('deve contar corretamente o total e a quantidade por categoria', () => {
    const fotos: SsmaRidFoto[] = [
      mockFoto('1', 'antes'),
      mockFoto('2', 'antes'),
      mockFoto('3', 'depois'),
    ];

    const total = fotos.length;
    const qtdAntes = fotos.filter((f) => f.tipo !== 'depois').length;
    const qtdDepois = fotos.filter((f) => f.tipo === 'depois').length;

    expect(total).toBe(3);
    expect(qtdAntes).toBe(2);
    expect(qtdDepois).toBe(1);
  });
});
