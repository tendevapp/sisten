/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi, afterEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import MarkdownPreview from './MarkdownPreview';

function render(markdown: string): string {
  return renderToStaticMarkup(React.createElement(MarkdownPreview, { markdown }));
}

describe('MarkdownPreview', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('não gera keys duplicadas ao alternar títulos, parágrafos, tabelas e citações', () => {
    const erros: unknown[][] = [];
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => { erros.push(args); });

    // Sequência que reproduz o bug: título seguido de tabela (heading usa um
    // padrão de key diferente do bloco de tabela) repetida algumas vezes,
    // intercalada com parágrafo e citação.
    const markdown = [
      '# Arquivo 1', '',
      '| Item | Preço |',
      '| --- | --- |',
      '| 1 | 10 |',
      '', '## Seção', '',
      'Um parágrafo qualquer.',
      '> Uma citação',
      '# Arquivo 2', '',
      '| Item | Preço |',
      '| --- | --- |',
      '| 2 | 20 |',
      '',
    ].join('\n');

    render(markdown);

    const avisosDeKeyDuplicada = erros.filter(a => String(a[0] ?? '').includes('same key'));
    expect(avisosDeKeyDuplicada).toEqual([]);
  });

  it('renderiza tabela, negrito e separador sem lançar', () => {
    const markdown = '# Título\n\n| A | B |\n| --- | --- |\n| 1 | **dois** |\n\n---\n\n_(vazio)_\n';
    const html = render(markdown);
    expect(html).toContain('<table');
    expect(html).toContain('<strong');
    expect(html).toContain('<hr');
  });
});
