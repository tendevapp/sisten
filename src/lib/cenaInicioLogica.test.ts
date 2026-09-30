import { describe, it, expect } from 'vitest';
import { faseDoDia, misturarCor, propagarGantt, type BarraGantt } from './cenaInicioLogica';

describe('faseDoDia', () => {
  it('meio-dia é dia pleno e meia-noite é noite fechada', () => {
    expect(faseDoDia(12).luz).toBe(1);
    expect(faseDoDia(0).luz).toBe(0);
    expect(faseDoDia(23.9).luz).toBe(0);
  });

  it('o crepúsculo alaranja o céu perto de 6h e 18h, não ao meio-dia', () => {
    expect(faseDoDia(6).crepusculo).toBeGreaterThan(0.9);
    expect(faseDoDia(18).crepusculo).toBeGreaterThan(0.9);
    expect(faseDoDia(12).crepusculo).toBe(0);
  });

  it('a luz cresce da madrugada até o meio-dia', () => {
    const luz = [4, 5.5, 6, 7, 9, 12].map(h => faseDoDia(h).luz);
    for (let i = 1; i < luz.length; i++) expect(luz[i]).toBeGreaterThanOrEqual(luz[i - 1]);
  });

  it('sol e lua fazem o arco nas suas horas e dão a volta em 24', () => {
    expect(faseDoDia(12).solFrac).toBeCloseTo(0.5);
    expect(faseDoDia(0).luaFrac).toBeCloseTo(0.5);
    expect(faseDoDia(36).luz).toBe(faseDoDia(12).luz);
    expect(faseDoDia(-12).luz).toBe(faseDoDia(12).luz);
  });
});

describe('misturarCor', () => {
  it('interpola canal a canal e limita t', () => {
    expect(misturarCor('#000000', '#ffffff', 0)).toBe('#000000');
    expect(misturarCor('#000000', '#ffffff', 1)).toBe('#ffffff');
    expect(misturarCor('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(misturarCor('#102030', '#ffffff', 5)).toBe('#ffffff');
    expect(misturarCor('#102030', '#ffffff', -1)).toBe('#102030');
  });
});

describe('propagarGantt', () => {
  const cadeia = (): BarraGantt[] => [
    { id: 'a', inicio: 0, dur: 4 },
    { id: 'b', inicio: 4, dur: 3, dep: 'a' },
    { id: 'c', inicio: 8, dur: 2, dep: 'b' },
    { id: 'x', inicio: 1, dur: 2 },
  ];
  const inicios = (bs: BarraGantt[]) => Object.fromEntries(bs.map(b => [b.id, b.inicio]));

  it('leva as dependentes junto, mantendo a folga, e não mexe nas independentes', () => {
    const r = propagarGantt(cadeia(), 'a', 2, 20);
    expect(inicios(r)).toEqual({ a: 2, b: 6, c: 10, x: 1 });
  });

  it('mover uma barra do meio arrasta só quem vem depois', () => {
    const r = propagarGantt(cadeia(), 'b', 1, 20);
    expect(inicios(r)).toEqual({ a: 0, b: 5, c: 9, x: 1 });
  });

  it('não deixa ninguém passar do fim do cronograma', () => {
    const r = propagarGantt(cadeia(), 'a', 50, 12);
    expect(inicios(r)).toEqual({ a: 2, b: 6, c: 10, x: 1 });
  });

  it('não deixa ninguém ficar antes de zero', () => {
    const r = propagarGantt(cadeia(), 'a', -3, 20);
    expect(inicios(r)).toEqual(inicios(cadeia()));
  });

  it('a barra não começa antes do fim da predecessora', () => {
    const r = propagarGantt(cadeia(), 'b', -3, 20);
    expect(inicios(r)).toEqual(inicios(cadeia()));
  });

  it('devolve as mesmas barras quando nada muda ou o id não existe', () => {
    const base = cadeia();
    expect(propagarGantt(base, 'a', 0, 20)).toBe(base);
    expect(propagarGantt(base, 'zzz', 3, 20)).toBe(base);
  });

  it('não altera o vetor original', () => {
    const base = cadeia();
    propagarGantt(base, 'a', 2, 20);
    expect(base[0].inicio).toBe(0);
  });
});
