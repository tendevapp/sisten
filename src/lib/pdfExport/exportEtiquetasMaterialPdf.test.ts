/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { gerarPdfEtiquetasMaterial } from './exportEtiquetasMaterialPdf';
import type { DadosEtiqueta } from '../etiquetaMaterial';

const etiqueta = (i: number): DadosEtiqueta => ({
  codigo_sap: String(1437274 + i),
  descricao: i === 0 ? 'BITS JG 2PC ACLG FOSF' : `ADAPTADOR CT PEAD 3/4" AZ — DESCRIÇÃO MUITO LONGA PARA CABER NA ETIQUETA ${i}`,
  localizacao: '104240309',
  aplicacao: i % 2 ? '' : 'PRODUÇÃO',
  minimo: i === 0 ? 5 : i === 2 ? 2.5 : null,
  url_foto: null,
});

describe('gerarPdfEtiquetasMaterial', () => {
  it('põe 10 etiquetas por folha e abre a segunda folha na 11ª', async () => {
    const doc = await gerarPdfEtiquetasMaterial(Array.from({ length: 11 }, (_, i) => etiqueta(i)));
    expect(doc.getPageCount()).toBe(2);
    const bytes = await doc.save();
    expect(bytes.length).toBeGreaterThan(1000);
    if (process.env.ETIQUETA_AMOSTRA) {
      const { writeFileSync } = await import('node:fs');
      writeFileSync(process.env.ETIQUETA_AMOSTRA, bytes);
    }
  });

  it('gera nas seis cores', async () => {
    for (const cor of ['cinza', 'azul', 'vermelho', 'preto', 'amarelo', 'verde'] as const) {
      const doc = await gerarPdfEtiquetasMaterial([etiqueta(0), etiqueta(1)], cor);
      expect(doc.getPageCount()).toBe(1);
      const bytes = await doc.save();
      if (process.env.ETIQUETA_AMOSTRA_CORES) {
        const { writeFileSync } = await import('node:fs');
        writeFileSync(`${process.env.ETIQUETA_AMOSTRA_CORES}-${cor}.pdf`, bytes);
      }
    }
  });

  it('sem etiqueta, sai sem páginas', async () => {
    const doc = await gerarPdfEtiquetasMaterial([]);
    expect(doc.getPageCount()).toBe(0);
  });
});
