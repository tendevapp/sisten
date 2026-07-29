import { describe, expect, it } from 'vitest';
import { normalizarTermo, resumoSinais, type MaterialResultado } from './materiais';

describe('normalizarTermo', () => {
  it('quebra em tokens, em qualquer ordem, para casar descrição do SAP', () => {
    // O catálogo grava "PARAFUSO M12 SEXTAVADO"; a pessoa digita na ordem dela.
    expect(normalizarTermo('parafuso sextavado m12')).toEqual({
      tipo: 'texto',
      normalizado: 'PARAFUSO SEXTAVADO M12',
      tokens: ['PARAFUSO', 'SEXTAVADO', 'M12'],
    });
  });

  it('remove acento — o catálogo grava VALVULA, a pessoa digita válvula', () => {
    expect(normalizarTermo('válvula esfera').normalizado).toBe('VALVULA ESFERA');
  });

  it('colapsa espaço repetido e ignora borda', () => {
    expect(normalizarTermo('  luva   npt  ').tokens).toEqual(['LUVA', 'NPT']);
  });

  it('reconhece termo só de dígitos como código de material', () => {
    expect(normalizarTermo('10318').tipo).toBe('codigo');
  });

  it('preserva a fração, que é atributo real de tubulação', () => {
    expect(normalizarTermo('luva 1/2 npt').tokens).toEqual(['LUVA', '1/2', 'NPT']);
  });

  it('marca como curto o que não vale consultar', () => {
    // Um caractere casaria com meio catálogo; a UI não deve nem consultar.
    expect(normalizarTermo('l').tipo).toBe('curto');
    expect(normalizarTermo('   ').tipo).toBe('curto');
    expect(normalizarTermo('l').tokens).toEqual([]);
  });

  it('exige 3 caracteres de texto — piso do índice trigram (pg_trgm não usa índice abaixo disso)', () => {
    expect(normalizarTermo('lu').tipo).toBe('curto');
    expect(normalizarTermo('luv').tipo).toBe('texto');
  });

  it('exige 4 dígitos para tratar como código', () => {
    // Abaixo disso o prefixo devolveria milhares de linhas sem utilidade.
    expect(normalizarTermo('103').tipo).toBe('curto');
    expect(normalizarTermo('1031').tipo).toBe('codigo');
  });
});

const base: MaterialResultado = {
  materialCode: '1031825',
  description: 'LUVA FM FM197 1/2" NPT 300#',
  technicalText: 'GALVANIZADO FOGO',
  unit: 'UN',
  qtdEstoque: null,
  depositos: null,
  rms12m: null,
  ultimaRm: null,
  rmsSemPedido: null,
  rmAberta: null,
  pedidoAberto: null,
  chegaEm: null,
  pedidoPelaArea: false,
};

describe('resumoSinais', () => {
  it('não inventa sinal quando não há dado', () => {
    expect(resumoSinais(base)).toEqual([]);
  });

  it('mostra saldo com o depósito', () => {
    const chips = resumoSinais({ ...base, qtdEstoque: 45, depositos: ['CD01'] });
    expect(chips).toEqual([{ texto: '45 UN em CD01', tom: 'estoque' }]);
  });

  it('mostra RM aberta sem pedido — alguém já pediu e não virou compra', () => {
    const chips = resumoSinais({ ...base, rmsSemPedido: 1, rmAberta: '0012345' });
    expect(chips).toContainEqual({ texto: 'RM 0012345 aberta, sem pedido', tom: 'demanda' });
  });

  it('mostra pedido a caminho com a data de remessa', () => {
    const chips = resumoSinais({ ...base, pedidoAberto: '4500123', chegaEm: '2026-08-12' });
    expect(chips).toContainEqual({ texto: 'Pedido 4500123 · chega 12/08/2026', tom: 'pedido' });
  });

  it('mostra frequência de uso', () => {
    const chips = resumoSinais({ ...base, rms12m: 12 });
    expect(chips).toContainEqual({ texto: '12 RMs em 12 meses', tom: 'uso' });
  });

  it('nunca mostra "0x" — ausência de dado não é informação', () => {
    const chips = resumoSinais({ ...base, rms12m: 0, qtdEstoque: 0, pedidoPelaArea: false });
    expect(chips).toEqual([]);
  });

  it('acrescenta o recorte da área só quando a área pediu de fato', () => {
    const chips = resumoSinais({ ...base, rms12m: 12, pedidoPelaArea: true });
    expect(chips).toContainEqual({ texto: 'sua área já pediu', tom: 'uso' });
  });
});
