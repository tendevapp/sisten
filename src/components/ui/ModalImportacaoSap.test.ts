import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import ModalImportacaoSap from './ModalImportacaoSap';

describe('ModalImportacaoSap', () => {
  it('mostra a transação, a etapa e o progresso num diálogo que bloqueia o cancelamento', () => {
    const html = renderToStaticMarkup(createElement(ModalImportacaoSap, {
      sigla: 'ME5A', descricao: 'Requisições de compra SAP', ocupado: true,
      progresso: 32, mensagem: 'Enviando os dados…',
    }));
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-label="Importar ME5A"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('aria-valuenow="32"');
    expect(html).toContain('Enviando os dados…');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Cancelar<\/button>/);
  });

  it('libera fechar e mostra o resultado quando a importação termina', () => {
    const html = renderToStaticMarkup(createElement(ModalImportacaoSap, {
      sigla: 'ZL0136', descricao: 'Notas fiscais SAP', ocupado: false,
      progresso: 100, concluido: true, children: 'Importação concluída.',
    }));
    expect(html).toContain('Importação concluída.');
    expect(html).toContain('>Fechar</button>');
    expect(html).not.toContain('disabled=""');
    expect(html).not.toContain('role="progressbar"');
  });
});
