import { describe, it, expect } from 'vitest';
import { montarAssuntoColeta, montarCorpoColeta, LinhaColeta } from './coletaEmail';

const linha = (over: Partial<LinhaColeta> = {}): LinhaColeta => ({
  dataColeta: '2026-09-10',
  fornecedor: 'ACME LTDA',
  rm: '10012345 / 10',
  po: '4500123456',
  codigoItem: '100234',
  material: 'PARAFUSO SEXTAVADO M12',
  quantidade: 10,
  unidade: 'UN',
  valor: 1234.5,
  ...over,
});

describe('montarAssuntoColeta', () => {
  it('inclui transportadora e contagem de itens', () => {
    expect(montarAssuntoColeta({ transportadora: 'RODOTEN', quantidadeItens: 3 }))
      .toBe('Coleta Jacobina — RODOTEN (3 itens)');
  });

  it('usa singular com um item e omite transportadora vazia', () => {
    expect(montarAssuntoColeta({ quantidadeItens: 1 })).toBe('Coleta Jacobina (1 item)');
  });

  it('respeita o assunto configurado no painel de e-mails', () => {
    expect(montarAssuntoColeta({ assuntoBase: 'Coleta Semanal', quantidadeItens: 2 }))
      .toBe('Coleta Semanal (2 itens)');
  });
});

describe('montarCorpoColeta', () => {
  it('lista todos os campos pedidos pela logística', () => {
    const corpo = montarCorpoColeta({ linhas: [linha()], transportadora: 'RODOTEN', solicitante: 'André' });
    expect(corpo).toContain('Transportadora: RODOTEN');
    expect(corpo).toContain('FORNECEDOR: ACME LTDA');
    expect(corpo).toContain('Data da coleta: 10/09/2026');
    expect(corpo).toContain('RM: 10012345 / 10');
    expect(corpo).toContain('PO: 4500123456');
    expect(corpo).toContain('Código: 100234');
    expect(corpo).toContain('Material: PARAFUSO SEXTAVADO M12');
    expect(corpo).toContain('Qtd: 10 UN');
    expect(corpo).toMatch(/Valor: R\$\s?1\.234,50/);
    expect(corpo).toContain('Solicitado por: André');
  });

  it('agrupa por fornecedor em ordem alfabética', () => {
    const corpo = montarCorpoColeta({
      linhas: [linha({ fornecedor: 'ZETA' }), linha({ fornecedor: 'BETA' })],
    });
    expect(corpo.indexOf('FORNECEDOR: BETA')).toBeLessThan(corpo.indexOf('FORNECEDOR: ZETA'));
  });

  it('ordena itens do fornecedor pela data de coleta, com sem-data no fim', () => {
    const corpo = montarCorpoColeta({
      linhas: [
        linha({ dataColeta: null, po: 'SEM-DATA' }),
        linha({ dataColeta: '2026-09-20', po: 'DEPOIS' }),
        linha({ dataColeta: '2026-09-01', po: 'ANTES' }),
      ],
    });
    expect(corpo.indexOf('PO: ANTES')).toBeLessThan(corpo.indexOf('PO: DEPOIS'));
    expect(corpo.indexOf('PO: DEPOIS')).toBeLessThan(corpo.indexOf('PO: SEM-DATA'));
  });

  it('não inventa dado: item sem previsão sai como "a definir" e vazios como travessão', () => {
    const corpo = montarCorpoColeta({
      linhas: [linha({ dataColeta: null, rm: '', quantidade: null, valor: null })],
    });
    expect(corpo).toContain('Data da coleta: a definir');
    expect(corpo).toContain('RM: —');
    expect(corpo).toContain('Qtd: —');
    expect(corpo).toContain('Valor: —');
  });

  it('soma o valor total dos itens', () => {
    const corpo = montarCorpoColeta({ linhas: [linha({ valor: 100 }), linha({ valor: 50.5 })] });
    expect(corpo).toMatch(/Valor total: R\$\s?150,50/);
    expect(corpo).toContain('Itens: 2');
  });
});
