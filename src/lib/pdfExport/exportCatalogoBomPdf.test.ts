import { afterEach, describe, expect, it, vi } from 'vitest';
import { gerarPdfCatalogoBom } from './exportCatalogoBomPdf';
import { montarCatalogoBom, type LinhaBomCatalogo } from '../catalogoBom';

const META = { projeto: 'GW JACOBINA', emitidoPor: 'Almoxarifado Teste' };

/** Torre com N peças em S1 e N em S2, cada uma com descrição longa para forçar quebra de linha e de página. */
function bomGrande(n: number): LinhaBomCatalogo[] {
  const linhas: LinhaBomCatalogo[] = [
    { id: 1, ordem: 1, level: 1, part_number: '100', secao: 'S1', grupo: 'Estrutural', description: 'Tower 120HH', descricao: null, qtd_por_torre: 1, uom: 'each', cod_sap: null, codigo_equivalente_qingdao: null },
  ];
  for (let i = 0; i < n; i += 1) {
    const secao = i % 2 === 0 ? 'S1' : 'S2';
    linhas.push({
      id: 10 + i, ordem: 10 + i, level: 2, part_number: `${1000 + i}`, secao, grupo: 'Escada de acesso',
      description: `Stair part ${i} with a very long english name to test truncation in the table cell`,
      descricao: `Peça ${i} com um nome em português bem comprido para testar o corte do texto na célula`,
      qtd_por_torre: 2, uom: 'each', cod_sap: `1053${i}`, codigo_equivalente_qingdao: `60.13.${i}-A`,
    });
  }
  return linhas;
}

describe('gerarPdfCatalogoBom', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('gera o catálogo com várias páginas, cabeçalho e um capítulo por seção', async () => {
    const catalogo = montarCatalogoBom(bomGrande(160));
    const pdf = await gerarPdfCatalogoBom(catalogo, META);
    expect(pdf.doc!.getPageCount()).toBeGreaterThan(3);
    expect(pdf.bytes.length).toBeGreaterThan(5000);
    expect(pdf.nomeArquivo).toMatch(/^catalogo-bom-gw-jacobina-\d{4}-\d{2}-\d{2}\.pdf$/);

    // Para conferir o desenho: PDF_CATALOGO_BOM=<caminho.pdf> npx vitest run ...
    const destino = process.env.PDF_CATALOGO_BOM;
    if (destino) (await import('node:fs')).writeFileSync(destino, pdf.bytes);
  });

  it('não derruba o PDF quando as fotos não carregam', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('offline');
    }));
    const linhas = bomGrande(4).map((l) => ({ ...l }));
    const catalogo = montarCatalogoBom(linhas, new Map([
      ['1000', { url_imagem: 'https://storage/foto-1000.jpg', posicao_estoque: '101.A1' }],
      ['1001', { url_imagem: 'https://storage/foto-1001.jpg' }],
    ]));
    const pdf = await gerarPdfCatalogoBom(catalogo, META);
    expect(pdf.doc!.getPageCount()).toBeGreaterThan(1);
    expect(pdf.bytes.length).toBeGreaterThan(5000);
  });

  it('gera mesmo com a BOM vazia (só o resumo)', async () => {
    const pdf = await gerarPdfCatalogoBom(montarCatalogoBom([]), META);
    expect(pdf.doc!.getPageCount()).toBe(1);
  });
});
