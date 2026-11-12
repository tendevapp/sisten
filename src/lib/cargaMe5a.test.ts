import { describe, expect, it } from 'vitest';
import { avaliarCargaMe5a, mensagemCargaParcialMe5a } from './cargaMe5a';

const cab = ['Requisição de compra', 'Item ReqC', 'Grupo de compradores', 'Material'];
const linhas = (n: number, grupo: string) => Array.from({ length: n }, (_, i) => ['1100', String(i), grupo, '1']);

describe('trava da carga da ME5A', () => {
  it('arquivo bem menor que as cargas recentes é parcial e conta os grupos', () => {
    const a = avaliarCargaMe5a([cab, ...linhas(320, '575'), ...linhas(5, '323'), ['', '', '', '']], 3479);
    expect(a.linhas).toBe(325);
    expect(a.parcial).toBe(true);
    expect(a.grupos).toEqual([{ grupo: '575', linhas: 320 }, { grupo: '323', linhas: 5 }]);
    expect(mensagemCargaParcialMe5a(a)).toContain('575 (320)');
  });

  it('carga completa ou sem histórico passa', () => {
    expect(avaliarCargaMe5a([cab, ...linhas(3400, '575')], 3479).parcial).toBe(false);
    expect(avaliarCargaMe5a([cab, ...linhas(10, '575')], 0).parcial).toBe(false);
  });

  it('acha a coluna abreviada do grupo', () => {
    const a = avaliarCargaMe5a([['Requisição de compra', 'Grp.compradores'], ['1', '610']], 0);
    expect(a.grupos).toEqual([{ grupo: '610', linhas: 1 }]);
  });
});
