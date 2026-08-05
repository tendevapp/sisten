/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { segmentarDocumentoUnificado, dividirBlocoParaExtracao } from './segmentar';
import { DOCUMENTO_UNIFICADO_REAL } from './__fixtures__/documentoUnificadoReal';

describe('segmentarDocumentoUnificado', () => {
  it('detecta os 4 blocos do documento unificado real', () => {
    const blocos = segmentarDocumentoUnificado(DOCUMENTO_UNIFICADO_REAL);
    expect(blocos).toHaveLength(4);
    expect(blocos.map(b => b.numero)).toEqual([1, 2, 3, 4]);
  });

  it('preserva o nome de arquivo original de cada bloco', () => {
    const blocos = segmentarDocumentoUnificado(DOCUMENTO_UNIFICADO_REAL);
    expect(blocos[0].nomeArquivo).toBe('489d7c4b-cc50-4df4-b681-1d377021801c.PDF');
    expect(blocos[3].nomeArquivo).toBe('d2af7dd9-4334-412f-9a9b-f118359c6907.pdf');
  });

  it('concatena as páginas de um mesmo arquivo no mesmo bloco (os checksums só fecham no documento inteiro)', () => {
    const blocos = segmentarDocumentoUnificado(DOCUMENTO_UNIFICADO_REAL);
    // Manglog tem itens na Página 1 (1-15) e na Página 2 (16-26) — ambos devem
    // aparecer no mesmo bloco.
    expect(blocos[0].conteudo).toContain('FURADEIRA DE IMPACTO BOSCH GSB 20-2 RE 800W');
    expect(blocos[0].conteudo).toContain('CHAVE CATRACA REDSTRIPE 1/2');
    expect(blocos[0].conteudo).toContain('### Página 2');
  });

  it('cada bloco identifica seu fornecedor pelo conteúdo (o nome do arquivo é um UUID, inútil)', () => {
    const blocos = segmentarDocumentoUnificado(DOCUMENTO_UNIFICADO_REAL);
    expect(blocos[0].conteudo).toContain('MANGLOG PRODUTOS INDUSTRIAIS');
    expect(blocos[1].conteudo).toContain('GurgelMix Máquinas e Ferramentas');
    expect(blocos[2].conteudo).toContain('ANHANGUERA COMERCIO DE FERRAMENTAS');
    expect(blocos[3].conteudo).toContain('FERIMPORT COMERCIO REP E IMPORTACAO');
  });

  it('remove separadores "---" e âncoras "<a id=...>" da borda entre blocos', () => {
    const blocos = segmentarDocumentoUnificado(DOCUMENTO_UNIFICADO_REAL);
    for (const bloco of blocos) {
      expect(bloco.conteudo).not.toMatch(/^---\s*$/m);
      expect(bloco.conteudo).not.toMatch(/<a id="arquivo-\d+">/);
    }
  });

  it('não inclui o preâmbulo/índice antes do primeiro "## N."', () => {
    const blocos = segmentarDocumentoUnificado(DOCUMENTO_UNIFICADO_REAL);
    expect(blocos[0].conteudo).not.toContain('Mapa de cotação — documento unificado');
    expect(blocos[0].conteudo).not.toContain('## Índice');
  });

  it('trata markdown colado sem cabeçalhos "## N." como uma proposta única', () => {
    const texto = 'FORNECEDOR X LTDA\nCNPJ: 00.000.000/0001-00\n\nItem 1 — Parafuso M8, 10 UN, R$ 2,50';
    const blocos = segmentarDocumentoUnificado(texto);
    expect(blocos).toHaveLength(1);
    expect(blocos[0].nomeArquivo).toBeNull();
    expect(blocos[0].conteudo).toContain('FORNECEDOR X LTDA');
  });

  it('retorna lista vazia para texto vazio ou só espaços', () => {
    expect(segmentarDocumentoUnificado('')).toEqual([]);
    expect(segmentarDocumentoUnificado('   \n\n  ')).toEqual([]);
  });

  it('não confunde o cabeçalho de tabela markdown do Ferimport ("## CÓD DESCRIÇÃO...") com um separador de arquivo', () => {
    const blocos = segmentarDocumentoUnificado(DOCUMENTO_UNIFICADO_REAL);
    // Ferimport é o bloco 4; a linha "## CÓD DESCRIÇÃO ..." não é "## N. arquivo"
    // (N precisa ser dígito) e deve permanecer dentro do bloco 4, não abrir um 5º bloco.
    expect(blocos).toHaveLength(4);
    expect(blocos[3].conteudo).toContain('## CÓD DESCRIÇÃO');
  });
});

describe('dividirBlocoParaExtracao', () => {
  it('não divide um bloco pequeno (evita chamadas extras desnecessárias)', () => {
    const texto = 'FORNECEDOR X\nitem 1 — parafuso, R$ 2,50';
    expect(dividirBlocoParaExtracao(texto)).toEqual([texto]);
  });

  it('divide o bloco da Manglog (2 páginas reais, 26 itens) nas quebras de página do documento', () => {
    const blocos = segmentarDocumentoUnificado(DOCUMENTO_UNIFICADO_REAL);
    const manglog = blocos[0].conteudo; // ~4000 caracteres, 2 páginas de ~2200/1700 — excedia o teto de 150s em uma chamada só
    const lotes = dividirBlocoParaExtracao(manglog, 2500); // acima do tamanho de cada página real — só divide por página, sem cair no fallback por linha
    expect(lotes.length).toBeGreaterThan(1);
    // cada página real do Manglog repete o cabeçalho do fornecedor — nenhum lote fica sem contexto.
    for (const lote of lotes) {
      expect(lote).toContain('MANGLOG PRODUTOS INDUSTRIAIS');
    }
    // nenhum item se perde na divisão: os primeiros e últimos itens de cada página aparecem em algum lote.
    expect(lotes.some(l => l.includes('FURADEIRA DE IMPACTO BOSCH'))).toBe(true);
    expect(lotes.some(l => l.includes('CHAVE CATRACA REDSTRIPE'))).toBe(true);
  });

  it('não divide quando o bloco não tem marcador de página reconhecível (evita cortar item sem uma unidade segura)', () => {
    const semPaginas = 'FORNECEDOR Y\n' + 'item de teste com bastante texto para passar do limite de caracteres. '.repeat(60);
    expect(semPaginas.length).toBeGreaterThan(3000);
    expect(dividirBlocoParaExtracao(semPaginas)).toEqual([semPaginas]);
  });

  it('cai no fallback por linha quando uma única página ainda excede o limite', () => {
    const paginaGrande = '### Página 1\n' + Array.from({ length: 40 }, (_, i) => `linha de item número ${i} com texto suficiente para ocupar espaço`).join('\n');
    const lotes = dividirBlocoParaExtracao(paginaGrande, 500);
    expect(lotes.length).toBeGreaterThan(1);
    // nenhuma linha original é perdida na divisão por linha.
    const totalLinhasNosLotes = lotes.reduce((acc, l) => acc + l.split('\n').length, 0);
    expect(totalLinhasNosLotes).toBe(paginaGrande.split('\n').length);
  });

  it('com o limiar padrão, uma página real de 15 itens (que travou 140s numa chamada só) é subdividida em pedaços pequenos', () => {
    // Medido ao vivo contra a Edge Function de produção: 15 itens numa
    // chamada só nunca terminou dentro de 140s; 8 itens terminou em 475ms.
    // O padrão (1200 caracteres) precisa manter cada lote bem abaixo do
    // tamanho de uma página inteira (~2180 caracteres para 15 itens).
    const blocos = segmentarDocumentoUnificado(DOCUMENTO_UNIFICADO_REAL);
    const manglog = blocos[0].conteudo;
    const lotes = dividirBlocoParaExtracao(manglog); // usa o padrão de produção
    expect(lotes.length).toBeGreaterThan(2); // mais que 1 por página — cada página também é subdividida
    for (const lote of lotes) {
      expect(lote.length).toBeLessThanOrEqual(1200);
    }
  });
});
