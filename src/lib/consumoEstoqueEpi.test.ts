import { describe, expect, it } from 'vitest';
import {
  TMV_SAIDA_ESTOQUE,
  analisarSaidas,
  diasEntre,
  filtrarSaidas,
  filtrarSaldos,
  itensSemSaida,
  normalizarFinalidade,
  type SaidaEstoque,
  type SaldoEstoque,
} from './consumoEstoqueEpi';

const saida = (extra: Partial<SaidaEstoque>): SaidaEstoque => ({
  id: String(Math.random()), material: '1020040', descricao: 'OCULOS CONV', data: '2026-09-01', tipo: '221',
  quantidade: -1, valor: -10, documento: '4900000001', finalidade: 'BAIXA EPIS', pep: null, usuario: 'X', estorno: false,
  ...extra,
});

const saldo = (extra: Partial<SaldoEstoque>): SaldoEstoque => ({
  material: '1020040', descricao: 'OCULOS CONV PC', umb: 'UN', saldo: 30, valor: 300, ...extra,
});

const janela = { inicio: '2026-09-01', fim: '2026-09-30' };

describe('consumoEstoqueEpi', () => {
  it('só considera baixas de consumo e seus estornos, não transferência nem entrada', () => {
    expect(TMV_SAIDA_ESTOQUE).toContain('221');
    expect(TMV_SAIDA_ESTOQUE).toContain('222');
    expect(TMV_SAIDA_ESTOQUE).not.toContain('311');
    expect(TMV_SAIDA_ESTOQUE).not.toContain('101');
    expect(TMV_SAIDA_ESTOQUE).not.toContain('122');
  });

  it('conta dias corridos da janela incluindo as duas pontas', () => {
    expect(diasEntre('2026-09-01', '2026-09-30')).toBe(30);
    expect(diasEntre('2026-09-01', '2026-09-01')).toBe(1);
    expect(diasEntre('2026-09-10', '2026-09-01')).toBe(1);
  });

  it('normaliza a finalidade do documento', () => {
    expect(normalizarFinalidade('  baixa  epis ')).toBe('BAIXA EPIS');
    expect(normalizarFinalidade(null)).toBe('SEM DESCRIÇÃO');
    expect(normalizarFinalidade('   ')).toBe('SEM DESCRIÇÃO');
  });

  it('soma a saída líquida descontando o estorno e guarda datas só das baixas', () => {
    const { porItem, resumo, porMes } = analisarSaidas([
      saida({ quantidade: -10, valor: -100, data: '2026-09-02' }),
      saida({ quantidade: -5, valor: -50, data: '2026-09-20' }),
      saida({ tipo: '222', estorno: true, quantidade: 2, valor: 20, data: '2026-09-21' }),
    ], [saldo({})], janela);

    expect(porItem).toHaveLength(1);
    expect(porItem[0]).toMatchObject({
      quantidade: 13, valor: 130, lancamentos: 2, estornos: 1, primeiraSaida: '2026-09-02', ultimaSaida: '2026-09-20',
    });
    expect(resumo).toMatchObject({ itensComSaida: 1, quantidade: 13, valor: 130, lancamentos: 2, estornos: 1, dias: 30 });
    expect(porMes).toEqual([{ mes: '2026-09', quantidade: 13, valor: 130, lancamentos: 2 }]);
  });

  it('calcula média mensal e cobertura pelo ritmo da janela', () => {
    const { porItem } = analisarSaidas(
      [saida({ quantidade: -30, valor: -300 })],
      [saldo({ saldo: 20, valor: 200 })],
      janela,
    );
    // 30 un. em 30 dias = 1 un./dia → saldo 20 cobre 20 dias.
    expect(porItem[0].coberturaDias).toBe(20);
    expect(porItem[0].mediaMensal).toBeCloseTo(30.44, 1);
  });

  it('não inventa cobertura quando o saldo é desconhecido ou a saída líquida é zero', () => {
    const semSaldo = analisarSaidas([saida({})], [], janela).porItem[0];
    expect(semSaldo.coberturaDias).toBeNull();
    expect(semSaldo.saldo).toBe(0);

    const zerada = analisarSaidas([
      saida({ quantidade: -3, valor: -30 }),
      saida({ tipo: '222', estorno: true, quantidade: 3, valor: 30 }),
    ], [saldo({})], janela).porItem[0];
    expect(zerada.quantidade).toBe(0);
    expect(zerada.coberturaDias).toBeNull();
  });

  it('agrupa por finalidade e por mês, ordenando pelo valor', () => {
    const { porFinalidade, porMes } = analisarSaidas([
      saida({ finalidade: 'BAIXA EPIS', valor: -10, data: '2026-08-15' }),
      saida({ finalidade: 'BAIXA MATERIAIS', valor: -90, data: '2026-09-15' }),
    ], [], { inicio: '2026-08-01', fim: '2026-09-30' });

    expect(porFinalidade.map(f => f.finalidade)).toEqual(['BAIXA MATERIAIS', 'BAIXA EPIS']);
    expect(porMes.map(m => m.mes)).toEqual(['2026-08', '2026-09']);
  });

  it('separa o capital parado: itens com saldo e sem nenhuma saída na janela', () => {
    const saldos = [
      saldo({ material: 'A', saldo: 10, valor: 100 }),
      saldo({ material: 'B', saldo: 5, valor: 500 }),
      saldo({ material: 'C', saldo: 0, valor: 0 }),
    ];
    const { resumo, porItem } = analisarSaidas([saida({ material: 'A' })], saldos, janela);
    expect(resumo).toMatchObject({ itensEmEstoque: 2, itensParados: 1, valorParado: 500, valorEstoque: 600 });
    expect(itensSemSaida(saldos, porItem).map(i => i.material)).toEqual(['B']);
  });

  it('filtra por período, finalidade e palavras-chave (AND, sem acento)', () => {
    const base = [
      saida({ data: '2026-08-10', material: 'A', descricao: 'LUVA NITRILICA', finalidade: 'BAIXA EPIS' }),
      saida({ data: '2026-09-10', material: 'B', descricao: 'FILME STRETCH', finalidade: 'BAIXA MATERIAIS' }),
      saida({ data: '2026-09-11', material: 'C', descricao: 'LUVA VAQUETA', finalidade: 'BAIXA EPIS' }),
    ];
    const vazio = { inicio: null, fim: null, finalidade: null, palavras: [] as string[] };

    expect(filtrarSaidas(base, vazio)).toHaveLength(3);
    expect(filtrarSaidas(base, { ...vazio, inicio: '2026-09-01' }).map(s => s.material)).toEqual(['B', 'C']);
    expect(filtrarSaidas(base, { ...vazio, fim: '2026-08-31' }).map(s => s.material)).toEqual(['A']);
    expect(filtrarSaidas(base, { ...vazio, finalidade: 'BAIXA MATERIAIS' }).map(s => s.material)).toEqual(['B']);
    expect(filtrarSaidas(base, { ...vazio, palavras: ['luva', 'vaqueta'] }).map(s => s.material)).toEqual(['C']);
    expect(filtrarSaidas(base, { ...vazio, palavras: ['nitrilica'] }).map(s => s.material)).toEqual(['A']);
  });

  it('restringe o saldo às mesmas palavras-chave', () => {
    const saldos = [saldo({ material: 'A', descricao: 'LUVA' }), saldo({ material: 'B', descricao: 'BOTA' })];
    expect(filtrarSaldos(saldos, [])).toHaveLength(2);
    expect(filtrarSaldos(saldos, ['luva']).map(s => s.material)).toEqual(['A']);
  });
});
