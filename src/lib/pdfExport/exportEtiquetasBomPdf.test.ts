import { describe, expect, it } from 'vitest';
import { gerarPdfEtiquetasBom } from './exportEtiquetasBomPdf';
import type { DadosEtiquetaBom } from '../etiquetaBom';

const exemplo: DadosEtiquetaBom = {
  partNumber: '60.13.06262',
  descricao: 'Suporte de cabo L=295',
  descricaoEn: 'Cable bracket L=295',
  localizacao: '101.A2',
  qingdao: '60.13.06261A-6',
  secoes: [
    { secao: 'S1', grupo: 'SOLDAVEL', quantidade: 5 },
    { secao: 'S2', grupo: 'SOLDAVEL', quantidade: 11 },
    { secao: 'S3', grupo: 'SOLDAVEL', quantidade: 14 },
    { secao: 'S4', grupo: 'SOLDAVEL', quantidade: 15 },
    { secao: 'S5', grupo: 'SOLDAVEL', quantidade: 12 },
  ],
  url_foto: null,
};

describe('gerarPdfEtiquetasBom', () => {
  it('gera 10 etiquetas por folha A4, inclusive com peça sem Qingdao, sem foto e com mais linhas que a grade', async () => {
    const semQingdao: DadosEtiquetaBom = { ...exemplo, partNumber: 'ISO 7089-10', descricaoEn: '', qingdao: '', localizacao: '', secoes: [{ secao: 'S2', grupo: 'ESCADA', quantidade: 2.5 }] };
    const muitas: DadosEtiquetaBom = {
      ...exemplo,
      secoes: Array.from({ length: 6 }, (_, i) => ({ secao: `S${(i % 5) + 1}`, grupo: `GRUPO ${i}`, quantidade: i + 1 })),
    };
    const lista = [exemplo, semQingdao, muitas, ...Array.from({ length: 8 }, () => exemplo)];
    const doc = await gerarPdfEtiquetasBom(lista, 'azul');
    expect(doc.getPageCount()).toBe(2);
    const bytes = await doc.save();
    expect(bytes.length).toBeGreaterThan(1000);
    // Para conferir o desenho: PDF_ETIQUETA_BOM=<caminho.pdf> npx vitest run ...
    const destino = process.env.PDF_ETIQUETA_BOM;
    if (destino) (await import('node:fs')).writeFileSync(destino, bytes);
  });
});
