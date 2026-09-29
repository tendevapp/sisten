import { describe, expect, it } from 'vitest';
import {
  adicionarChipsKeywords,
  casarPalavrasChave,
  casarTokens,
  criarFiltroPalavrasChave,
  extrairPalavrasChave,
  normalizarParaBusca,
  removerChipKeyword,
} from './buscaKeywords';

describe('buscaKeywords - Busca por Palavras-Chave', () => {
  it('normaliza acentos e caixa alta/baixa', () => {
    expect(normalizarParaBusca('Válvula Esférica')).toBe('valvula esferica');
    expect(normalizarParaBusca('LÂMPADA LED')).toBe('lampada led');
    expect(normalizarParaBusca('aço carbono')).toBe('aco carbono');
    expect(normalizarParaBusca('')).toBe('');
    expect(normalizarParaBusca(null)).toBe('');
  });

  it('extrai palavras-chave individuais separadas por espaço', () => {
    expect(extrairPalavrasChave('parafuso sextavado m16')).toEqual(['parafuso', 'sextavado', 'm16']);
    expect(extrairPalavrasChave('  cabo   flexivel  ')).toEqual(['cabo', 'flexivel']);
  });

  it('mantém intactas frases entre aspas duplas', () => {
    expect(extrairPalavrasChave('"fita dupla face" 3m')).toEqual(['fita dupla face', '3m']);
    expect(extrairPalavrasChave('chave "biela 13mm"')).toEqual(['biela 13mm', 'chave']);
  });

  it('retorna array vazio para strings vazias ou somente espaços', () => {
    expect(extrairPalavrasChave('')).toEqual([]);
    expect(extrairPalavrasChave('   ')).toEqual([]);
    expect(extrairPalavrasChave(null)).toEqual([]);
    expect(extrairPalavrasChave(undefined)).toEqual([]);
  });

  it('casa palavras-chave em qualquer ordem', () => {
    const texto = 'PARAFUSO SEXTAVADO ACO INOX M16X50';
    expect(casarPalavrasChave(texto, 'm16 parafuso')).toBe(true);
    expect(casarPalavrasChave(texto, 'inox parafuso 50')).toBe(true);
    expect(casarPalavrasChave(texto, 'm16x50 sextavado')).toBe(true);
  });

  it('rejeita quando alguma palavra-chave estiver ausente', () => {
    const texto = 'PARAFUSO SEXTAVADO ACO INOX M16X50';
    expect(casarPalavrasChave(texto, 'parafuso m12')).toBe(false);
    expect(casarPalavrasChave(texto, 'arruela')).toBe(false);
  });

  it('funciona com array de campos múltiplos (material, descrição, fornecedor, po)', () => {
    const campos = [
      '1413010',
      'LUMINARIA RES EMB BR 1X48W',
      'PALACIO COM. DE MAT. ELETRICO',
      '4100469640',
      '1100327972',
    ];

    expect(casarPalavrasChave(campos, '1413010')).toBe(true);
    expect(casarPalavrasChave(campos, 'luminaria 48w')).toBe(true);
    expect(casarPalavrasChave(campos, 'palacio luminaria')).toBe(true);
    expect(casarPalavrasChave(campos, '4100469640 eletrico')).toBe(true);
    expect(casarPalavrasChave(campos, '1100327972 br')).toBe(true);
    expect(casarPalavrasChave(campos, 'palacio schneider')).toBe(false);
  });

  it('insensível a acentuação cruzada (com acento na busca e sem no alvo, ou vice-versa)', () => {
    expect(casarPalavrasChave('VALVULA ESFERICA INOX', 'válvula esférica')).toBe(true);
    expect(casarPalavrasChave('Válvula Esférica Inox', 'valvula esferica')).toBe(true);
  });

  it('filtro pré-otimizado com criarFiltroPalavrasChave funciona corretamente', () => {
    const itens = [
      { cod: '1001', desc: 'PARAFUSO SEXTAVADO M16', forn: 'FORNECEDOR A' },
      { cod: '1002', desc: 'PARAFUSO SEXTAVADO M12', forn: 'FORNECEDOR B' },
      { cod: '1003', desc: 'PORCA SEXTAVADA M16', forn: 'FORNECEDOR A' },
      { cod: '1004', desc: 'ARRUELA LISA M16', forn: 'FORNECEDOR C' },
    ];

    const filtroM16 = criarFiltroPalavrasChave('parafuso m16', i => [i.cod, i.desc, i.forn]);
    const resM16 = itens.filter(filtroM16);
    expect(resM16).toHaveLength(1);
    expect(resM16[0].cod).toBe('1001');

    const filtroSextavadoA = criarFiltroPalavrasChave('sextavad "fornecedor a"', i => [i.cod, i.desc, i.forn]);
    const resSextavadoA = itens.filter(filtroSextavadoA);
    expect(resSextavadoA).toHaveLength(2);
    expect(resSextavadoA.map(i => i.cod)).toEqual(['1001', '1003']);

    // Busca vazia retorna todos
    const filtroVazio = criarFiltroPalavrasChave('', i => [i.cod, i.desc]);
    expect(itens.filter(filtroVazio)).toHaveLength(4);
  });

  describe('Gestão de Chips de Palavras-Chave (adicionarChipsKeywords / removerChipKeyword)', () => {
    it('adiciona palavras individuais sem duplicatas', () => {
      const chips = ['parafuso'];
      const atualizados = adicionarChipsKeywords(chips, 'sextavado m16 parafuso');
      expect(atualizados).toEqual(['parafuso', 'sextavado', 'm16']);
    });

    it('adiciona expressões entre aspas preservadas como chip único', () => {
      const chips = ['3m'];
      const atualizados = adicionarChipsKeywords(chips, '"fita dupla face" cola');
      expect(atualizados).toEqual(['3m', 'fita dupla face', 'cola']);
    });

    it('ignora adições vazias ou com apenas espaços', () => {
      const chips = ['parafuso'];
      expect(adicionarChipsKeywords(chips, '')).toBe(chips);
      expect(adicionarChipsKeywords(chips, '   ')).toBe(chips);
    });

    it('remove chip com insensibilidade a maiúsculas/minúsculas', () => {
      const chips = ['parafuso', 'SEXTAVADO', 'M16'];
      expect(removerChipKeyword(chips, 'sextavado')).toEqual(['parafuso', 'M16']);
      expect(removerChipKeyword(chips, 'inexistente')).toEqual(['parafuso', 'SEXTAVADO', 'M16']);
    });
  });
});

