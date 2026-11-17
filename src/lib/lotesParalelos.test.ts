import { describe, expect, it } from 'vitest';
import { enviarEmLotesParalelos } from './lotesParalelos';

const esperar = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

describe('enviarEmLotesParalelos', () => {
  it('manda tudo em lotes, no máximo N ao mesmo tempo, e avisa o avanço', async () => {
    const recebidos: number[][] = [];
    let noAr = 0;
    let picoNoAr = 0;
    const avancos: number[] = [];
    await enviarEmLotesParalelos(
      Array.from({ length: 10 }, (_, i) => i),
      async (lote) => {
        noAr++;
        picoNoAr = Math.max(picoNoAr, noAr);
        await esperar(5);
        recebidos.push(lote);
        noAr--;
      },
      { tamanho: 3, paralelo: 2, onAvanco: (n) => avancos.push(n) },
    );
    expect(recebidos.flat().sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(recebidos.map((l) => l.length).sort()).toEqual([1, 3, 3, 3]);
    expect(picoNoAr).toBe(2);
    expect(avancos[avancos.length - 1]).toBe(10);
  });

  it('para no primeiro erro e relança', async () => {
    let chamadas = 0;
    await expect(enviarEmLotesParalelos([1, 2, 3, 4, 5, 6], async (lote) => {
      chamadas++;
      if (lote[0] === 1) throw new Error('falhou');
      await esperar(1);
    }, { tamanho: 1, paralelo: 1 })).rejects.toThrow('falhou');
    expect(chamadas).toBe(1);
  });

  it('lista vazia não chama nada', async () => {
    let chamadas = 0;
    await enviarEmLotesParalelos([], async () => { chamadas++; });
    expect(chamadas).toBe(0);
  });
});
