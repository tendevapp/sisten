import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import ProgressoImportacao from './ProgressoImportacao';

const html = (pct: number, mensagem?: string) => renderToStaticMarkup(createElement(ProgressoImportacao, { pct, mensagem }));

describe('ProgressoImportacao', () => {
  it('mostra a porcentagem e expõe o avanço como progressbar', () => {
    const out = html(42, 'Gravando lote 3');
    expect(out).toContain('role="progressbar"');
    expect(out).toContain('aria-valuenow="42"');
    expect(out).toContain('aria-label="Gravando lote 3"');
    expect(out).toContain('>42%<');
    expect(out).toContain('Gravando lote 3');
  });

  it('limita o valor entre 0 e 100 e arredonda', () => {
    expect(html(180)).toContain('aria-valuenow="100"');
    expect(html(-5)).toContain('aria-valuenow="0"');
    expect(html(33.6)).toContain('aria-valuenow="34"');
  });

  it('trata valor inválido como 0%', () => {
    expect(html(Number.NaN)).toContain('aria-valuenow="0"');
  });

  it('usa rótulo padrão quando não há mensagem', () => {
    expect(html(10)).toContain('aria-label="Progresso da importação"');
  });
});
