import { describe, expect, it } from 'vitest';
import { analisarConsumo, dataRuptura, inclinacao, prioridadeAnalise, semanasCompletas } from './alertaConsumo';

const repetir = (v: number, n: number) => Array.from({ length: n }, () => v);
const semEstoque = null;
/** 16 semanas de base a 10/sem. */
const base10 = repetir(10, 16);

describe('analisarConsumo — aumento', () => {
  it('consumo que dobrou nas últimas 8 semanas é aumento crítico, com o motivo', () => {
    const a = analisarConsumo([...base10, 20, 22, 18, 20, 20, 22, 18, 20], semEstoque, 'PC');
    const aumento = a.alertas.find(x => x.tipo === 'AUMENTO');
    expect(aumento?.grau).toBe('CRITICO');
    expect(aumento?.motivo).toContain('2× a média');
    expect(a.variacao).toBeCloseTo(2);
  });

  it('1,5× é atenção', () => {
    const a = analisarConsumo([...base10, ...repetir(15, 8)], semEstoque);
    expect(a.alertas.find(x => x.tipo === 'AUMENTO')?.grau).toBe('ATENCAO');
  });

  it('saída isolada não dispara aumento (base sem semanas ativas)', () => {
    const a = analisarConsumo([...repetir(0, 23), 50], semEstoque);
    expect(a.alertas).toEqual([]);
  });

  it('fechamento de mês concentrado (1 semana forte a cada 4) não vira aumento', () => {
    const mensal = (n: number) => Array.from({ length: n }, (_, i) => (i % 4 === 3 ? 40 : 2));
    const a = analisarConsumo(mensal(24), semEstoque);
    expect(a.alertas.some(x => x.tipo === 'AUMENTO')).toBe(false);
  });

  it('poucas semanas de saída no recorte recente não é aumento, mas o pico aparece', () => {
    const a = analisarConsumo([...base10, 0, 0, 0, 0, 0, 0, 0, 90], semEstoque);
    expect(a.alertas.some(x => x.tipo === 'AUMENTO')).toBe(false);
    expect(a.alertas.some(x => x.tipo === 'PICO')).toBe(true);
  });

  it('consumo estável não gera alerta', () => {
    expect(analisarConsumo(repetir(10, 24), semEstoque).alertas).toEqual([]);
  });
});

describe('analisarConsumo — tendência', () => {
  it('estável e depois subindo devagar vira tendência (sem chegar a 1,5×)', () => {
    const a = analisarConsumo([...base10, 9, 10, 11, 12, 12, 13, 14, 15], semEstoque);
    expect(a.alertas.map(x => x.tipo)).toContain('TENDENCIA');
  });
});

describe('analisarConsumo — estoque', () => {
  it('ruptura quando o saldo acaba antes do lead time', () => {
    // 20/sem = 4/dia útil; saldo 40 = 10 dias; lead 15.
    const a = analisarConsumo(repetir(20, 24), { saldo: 40, minimo: 200, leadTimeDias: 15, intervaloCompraDias: 10 });
    expect(a.alertas[0]).toMatchObject({ tipo: 'RUPTURA', grau: 'CRITICO' });
    expect(a.coberturaDiasUteis).toBe(10);
  });

  it('mínimo defasado usa a fórmula do Controle de Estoque (consumo/dia × (lead + intervalo))', () => {
    // 8 semanas a 20 depois de 16 a 10: ritmo 20/sem = 4/dia; (15+10) × 4 = 100.
    const a = analisarConsumo([...base10, ...repetir(20, 8)], { saldo: 500, minimo: 50, leadTimeDias: 15, intervaloCompraDias: 10 });
    expect(a.minimoSugerido).toBe(100);
    expect(a.alertas.find(x => x.tipo === 'MINIMO_DEFASADO')?.grau).toBe('CRITICO');
  });

  it('mínimo perto do sugerido não alerta', () => {
    const a = analisarConsumo(repetir(10, 24), { saldo: 500, minimo: 48, leadTimeDias: 15, intervaloCompraDias: 10 });
    expect(a.minimoSugerido).toBe(50);
    expect(a.alertas).toEqual([]);
  });

  it('estoque zerado com consumo recente é ruptura', () => {
    const a = analisarConsumo(repetir(10, 24), { saldo: 0, minimo: 50, leadTimeDias: 15, intervaloCompraDias: 10 });
    expect(a.alertas[0].motivo).toContain('zerado');
  });
});

describe('prioridadeAnalise', () => {
  it('ruptura antes de aumento; sem alerta por último', () => {
    const ruptura = analisarConsumo(repetir(20, 24), { saldo: 10, minimo: 100, leadTimeDias: 15, intervaloCompraDias: 10 });
    const aumento = analisarConsumo([...base10, ...repetir(20, 8)], semEstoque);
    const nada = analisarConsumo(repetir(10, 24), semEstoque);
    expect(prioridadeAnalise(ruptura)).toBeLessThan(prioridadeAnalise(aumento));
    expect(prioridadeAnalise(aumento)).toBeLessThan(prioridadeAnalise(nada));
  });
});

describe('auxiliares', () => {
  it('inclinação de série crescente', () => {
    expect(inclinacao([1, 2, 3, 4])).toBeCloseTo(1);
  });

  it('semana do último lançamento só conta se for domingo', () => {
    const semanas = ['2026-10-12', '2026-10-19', '2026-10-26'];
    expect(semanasCompletas(semanas, '2026-10-27')).toBe(2);
    expect(semanasCompletas(semanas, '2026-11-01')).toBe(3);
  });

  it('data de ruptura pula fim de semana', () => {
    // terça 27/10 + 5 dias úteis = terça 03/11
    expect(dataRuptura(5, '2026-10-27')).toBe('2026-11-03');
  });
});
