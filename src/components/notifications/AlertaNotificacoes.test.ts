import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import AlertaNotificacoes, { tipoDoAviso, type ItemAviso } from './AlertaNotificacoes';

const aviso = (tipo: string): ItemAviso => ({
  id: 'n1',
  tipo: tipo as ItemAviso['tipo'],
  titulo: 'Reprovação de UT aguardando correção',
  descricao: 'Torre 12',
  permanente: false,
  rotuloAcao: 'Abrir',
});

describe('tipoDoAviso', () => {
  it('mantém os tipos conhecidos', () => {
    for (const t of ['info', 'success', 'alert', 'critical', 'resumo']) expect(tipoDoAviso(t)).toBe(t);
  });

  it('warning (gravado pela Produção e pelo almoxarifado) vira alert', () => {
    expect(tipoDoAviso('warning')).toBe('alert');
  });

  it('tipo desconhecido ou vazio vira info', () => {
    expect(tipoDoAviso('qualquer')).toBe('info');
    expect(tipoDoAviso(null)).toBe('info');
    expect(tipoDoAviso(undefined)).toBe('info');
    expect(tipoDoAviso('toString')).toBe('info');
  });
});

describe('AlertaNotificacoes', () => {
  it('não quebra com tipo fora da lista (derrubava a tela inteira)', () => {
    const noop = () => {};
    const html = renderToStaticMarkup(
      React.createElement(AlertaNotificacoes, { itens: [aviso('warning'), aviso('inventado')], onAbrir: noop, onDispensar: noop, onDispensarTodos: noop }),
    );
    expect(html).toContain('Reprovação de UT aguardando correção');
  });
});
