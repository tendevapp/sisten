import { describe, expect, it } from 'vitest';
import { interpretarPosicao } from './gembaEndereco';
import {
  ESTANTES,
  GALPAO,
  METROS_POR_PX,
  ZONAS,
  acharBloco,
  caixaDoAndar,
  caixaDoVao,
  caixaDoRetangulo,
  caixaDaEstante,
  localizar,
  vistasRapidas,
  quantidadeVaos,
  type Caixa,
} from './gembaLayout';

const [gx1, gz1, gx2, gz2] = GALPAO.map(v => v * METROS_POR_PX);

function dentroDoGalpao(c: Caixa): boolean {
  const [x, , z] = c.centro;
  const [w, , d] = c.tamanho;
  return x - w / 2 >= gx1 && x + w / 2 <= gx2 && z - d / 2 >= gz1 && z + d / 2 <= gz2;
}

function contem(fora: Caixa, dentro: Caixa): boolean {
  return [0, 1, 2].every(k =>
    dentro.centro[k] - dentro.tamanho[k] / 2 >= fora.centro[k] - fora.tamanho[k] / 2 - 1e-9
    && dentro.centro[k] + dentro.tamanho[k] / 2 <= fora.centro[k] + fora.tamanho[k] / 2 + 1e-9);
}

function sobrepoe(a: Caixa, b: Caixa): boolean {
  return [0, 2].every(k => Math.abs(a.centro[k] - b.centro[k]) < (a.tamanho[k] + b.tamanho[k]) / 2 - 1e-6);
}

const ENDERECOS_REAIS = [
  '104.130218', '104.020100', '104.440200', '104.120300', '104.330100', '104.320330', '104.280201', '104.140100',
  '102.010200', '102.120600', '102.050000', '101.030100', '101.140300', '101.040000',
];

describe('gembaLayout - estrutura', () => {
  it('toda estante e zona cabe no galpão', () => {
    for (const e of ESTANTES) expect(dentroDoGalpao(caixaDaEstante(e)), e.id).toBe(true);
    for (const z of ZONAS) for (const r of z.retangulos) expect(dentroDoGalpao(caixaDoRetangulo(r)), z.id).toBe(true);
  });

  it('estantes não se sobrepõem', () => {
    for (let i = 0; i < ESTANTES.length; i++) {
      for (let j = i + 1; j < ESTANTES.length; j++) {
        expect(sobrepoe(caixaDaEstante(ESTANTES[i]), caixaDaEstante(ESTANTES[j])), `${ESTANTES[i].id} × ${ESTANTES[j].id}`).toBe(false);
      }
    }
  });

  it('cada bloco endereçado existe em uma só estante e cabe no comprimento desenhado', () => {
    const vistos = new Set<string>();
    for (const e of ESTANTES) {
      expect(quantidadeVaos(e)).toBeGreaterThanOrEqual(e.blocos.length);
      for (const b of e.blocos) {
        const chave = `${e.deposito}.${b}`;
        expect(vistos.has(chave), chave).toBe(false);
        vistos.add(chave);
      }
    }
  });
});

describe('gembaLayout - numeração confirmada no galpão', () => {
  it('Bloco 01 fica do lado da Entrada (direita, x maior) e cresce para a esquerda', () => {
    for (const dep of ['0004', '0002', '0001']) {
      const b1 = acharBloco(dep, dep === '0001' ? 3 : 1)!;
      const b2 = acharBloco(dep, dep === '0001' ? 4 : 2)!;
      expect(caixaDoVao(b1.estante, b1.indice).centro[0]).toBeGreaterThan(caixaDoVao(b2.estante, b2.indice).centro[0]);
    }
  });

  it('Rua 04: depois do bloco 12 vem o 33 (13–32 estão no Anexo)', () => {
    const b12 = acharBloco('0004', 12)!;
    const b33 = acharBloco('0004', 33)!;
    expect(b12.estante.id).toBe('rua_04');
    expect(b33.estante.id).toBe('rua_04');
    expect(b33.indice).toBe(b12.indice + 1);
  });

  it('Blocos 13 a 32 do 0004 caem no Anexo, 5 por estante', () => {
    for (let b = 13; b <= 32; b++) {
      const achado = acharBloco('0004', b)!;
      expect(achado.estante.id).toBe(`anexo_${Math.floor((b - 13) / 5) + 1}`);
    }
  });
});

describe('gembaLayout - localizar', () => {
  it('todo endereço real tem caixa dentro do galpão e sem aproximação', () => {
    for (const p of ENDERECOS_REAIS) {
      const loc = localizar(interpretarPosicao(p)!);
      expect(loc, p).not.toBeNull();
      expect(loc!.aproximado, p).toBe(false);
      for (const c of loc!.caixas) expect(dentroDoGalpao(c), p).toBe(true);
    }
  });

  it('104.130218 → Anexo, Estante 1, Bloco 13, Andar 02, Apto 18, dentro do andar 02', () => {
    const loc = localizar(interpretarPosicao('104.130218')!)!;
    expect(loc.trilha).toEqual(['Anexo 0004', 'Estante 1', 'Bloco 13', 'Andar 02', 'Apto 18']);
    const { estante, indice } = acharBloco('0004', 13)!;
    expect(contem(caixaDoAndar(estante, indice, 2)!, loc.caixas[0])).toBe(true);
    expect(loc.caixas[0].tamanho[1]).toBeLessThan(caixaDoAndar(estante, indice, 2)!.tamanho[1]);
  });

  it('andar 00 é o chão do bloco', () => {
    const loc = localizar(interpretarPosicao('101.040000')!)!;
    expect(loc.trilha).toEqual(['Depósito 0001', 'Bloco 04', 'Chão']);
    expect(loc.caixas[0].centro[1] - loc.caixas[0].tamanho[1] / 2).toBe(0);
  });

  it('andar ou bloco fora do mapa acende o que se sabe e avisa', () => {
    expect(localizar(interpretarPosicao('104.020900')!)).toMatchObject({ aproximado: true, estruturas: ['rua_04'] });
    expect(localizar(interpretarPosicao('104.990100')!)).toMatchObject({ aproximado: true });
    expect(localizar(interpretarPosicao('110.080316')!)).toBeNull();
  });

  it('posições com nome e depósitos', () => {
    expect(localizar(interpretarPosicao('102.ANEXO')!)).toMatchObject({ estruturas: ['apoio_manutencao'] });
    expect(localizar(interpretarPosicao('102.ANEXO')!)!.caixas).toHaveLength(2);
    expect(localizar(interpretarPosicao('104.CABOS')!)).toMatchObject({ estruturas: ['rua_04'] });
    expect(localizar(interpretarPosicao('101.ARAMES')!)).toMatchObject({ estruturas: ['dep_0001'], aproximado: true });
    expect(localizar(interpretarPosicao('DEPVIRTUAL')!)).toBeNull();
  });

  it('no anexo a câmera fica no corredor, sem passar para trás da estante vizinha', () => {
    for (let b = 13; b <= 32; b++) {
      const loc = localizar(interpretarPosicao(`104.${String(b).padStart(2, '0')}0201`)!)!;
      const { estante } = acharBloco('0004', b)!;
      const n = Number(estante.id.slice(-1));
      const vizinha = ESTANTES.find(e => e.id === `anexo_${n - 1}`);
      // Face oeste: a câmera fica a oeste do alvo, mas a leste das costas da estante vizinha.
      expect(loc.vista.camera[0], `bloco ${b}`).toBeLessThan(loc.vista.alvo[0]);
      if (vizinha) expect(loc.vista.camera[0], `bloco ${b}`).toBeGreaterThan(vizinha.inicio[0] * METROS_POR_PX);
    }
  });

  it('a câmera fica no corredor, do lado da face da estante', () => {
    const rua04 = localizar(interpretarPosicao('104.020100')!)!;
    expect(rua04.vista.camera[2]).toBeGreaterThan(rua04.vista.alvo[2]); // face sul
    const anexo = localizar(interpretarPosicao('104.130218')!)!;
    expect(anexo.vista.camera[0]).toBeLessThan(anexo.vista.alvo[0]); // face oeste
  });
});

describe('gembaLayout - vistasRapidas', () => {
  it('tem as ruas, o anexo e o apoio, com o alvo dentro do galpão', () => {
    const v = vistasRapidas();
    expect(v.map(x => x.id)).toEqual(expect.arrayContaining(['rua_04', 'rua_02', 'dep_0001', 'anexo', 'apoio_manutencao']));
    for (const x of v) {
      expect(x.vista.alvo[0]).toBeGreaterThan(gx1);
      expect(x.vista.alvo[0]).toBeLessThan(gx2);
    }
  });
});
