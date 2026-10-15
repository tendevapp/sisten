/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  CORES_ETIQUETA,
  ORDEM_CORES_ETIQUETA,
  ehCorEtiqueta,
  hexParaRgb01,
  ETIQUETA_ALTURA,
  ETIQUETA_LARGURA,
  ETIQUETAS_POR_FOLHA,
  codigoDoQr,
  consumirItemInventarioPendente,
  consumirItemQrEscolha,
  guardarItemQrEscolha,
  consumirItemQrPendente,
  conteudoQrEtiqueta,
  dadosEtiquetaDoItem,
  guardarItemInventarioPendente,
  guardarItemQrPendente,
  haItemQrPendente,
  hashSemItem,
  itemDaRota,
  numeroOuNull,
  posicaoDaEtiqueta,
} from './etiquetaMaterial';

describe('QR da etiqueta', () => {
  it('leva o link curto de produção (sisten.site), nunca localhost', () => {
    expect(conteudoQrEtiqueta(' 1437274 ')).toBe('https://sisten.site/#/balcao?item=1437274');
  });

  it('o leitor do formulário tira o código do link do QR', () => {
    expect(codigoDoQr(conteudoQrEtiqueta('1418654'))).toBe('1418654');
    expect(codigoDoQr('https://sisten.site/#/formularios/almoxarifado-requisicao-balcao?item=1437274')).toBe('1437274');
  });

  it('aceita a 1ª leva (SISTEN-ITEM:) e o código de barras das etiquetas antigas', () => {
    expect(codigoDoQr('SISTEN-ITEM:1437274')).toBe('1437274');
    expect(codigoDoQr('sisten-item:1418654')).toBe('1418654');
    expect(codigoDoQr('1427577')).toBe('1427577');
  });

  it('recusa QR que não é de item (link qualquer, texto livre, vazio)', () => {
    expect(codigoDoQr('https://fornecedor.com/produto/123')).toBeNull();
    expect(codigoDoQr('PASTILHA INTERC')).toBeNull();
    expect(codigoDoQr('SISTEN-ITEM:')).toBeNull();
    expect(codigoDoQr('   ')).toBeNull();
  });

  it('lê e tira o item do hash da rota', () => {
    expect(itemDaRota('#/balcao?item=1437274')).toBe('1437274');
    expect(itemDaRota('#/formularios/almoxarifado-requisicao-balcao')).toBeNull();
    expect(hashSemItem('#/f/balcao?x=2&item=1')).toBe('#/f/balcao?x=2');
    expect(hashSemItem('#/f/balcao?item=1')).toBe('#/f/balcao');
  });
});

describe('item do QR pendente (sobrevive ao login)', () => {
  const memoria = new Map<string, string>();
  beforeEach(() => {
    memoria.clear();
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      value: {
        getItem: (k: string) => memoria.get(k) ?? null,
        setItem: (k: string, v: string) => { memoria.set(k, v); },
        removeItem: (k: string) => { memoria.delete(k); },
      },
    });
  });

  it('guarda, avisa que há pendente e entrega uma vez só', () => {
    guardarItemQrPendente('1437274', 1_000);
    expect(haItemQrPendente(2_000)).toBe(true);
    expect(consumirItemQrPendente(2_000)).toBe('1437274');
    expect(consumirItemQrPendente(2_000)).toBeNull();
    expect(haItemQrPendente(2_000)).toBe(false);
  });

  it('expira em 30 minutos', () => {
    guardarItemQrPendente('1437274', 0);
    expect(haItemQrPendente(31 * 60 * 1000)).toBe(false);
    expect(consumirItemQrPendente(31 * 60 * 1000)).toBeNull();
  });

  it('o pendente do inventário é separado do da baixa no balcão', () => {
    guardarItemInventarioPendente('1437274', 1_000);
    expect(haItemQrPendente(2_000)).toBe(false);
    expect(consumirItemQrPendente(2_000)).toBeNull();
    expect(consumirItemInventarioPendente(2_000)).toBe('1437274');
    expect(consumirItemInventarioPendente(2_000)).toBeNull();
  });

  it('o item a escolher (link da câmera) é separado dos demais e entra uma vez só', () => {
    guardarItemQrEscolha('1437274', 1_000);
    expect(haItemQrPendente(2_000)).toBe(false);
    expect(consumirItemInventarioPendente(2_000)).toBeNull();
    expect(consumirItemQrEscolha(2_000)).toBe('1437274');
    expect(consumirItemQrEscolha(2_000)).toBeNull();
    guardarItemQrEscolha('1437274', 0);
    expect(consumirItemQrEscolha(31 * 60 * 1000)).toBeNull();
  });

  it('o pendente do inventário também expira em 30 minutos', () => {
    guardarItemInventarioPendente('1437274', 0);
    expect(consumirItemInventarioPendente(31 * 60 * 1000)).toBeNull();
  });
});

describe('dadosEtiquetaDoItem', () => {
  it('usa o que foi editado no cadastro antes do texto do SAP', () => {
    const d = dadosEtiquetaDoItem(
      {
        codigo_sap: '1437274',
        descricao: 'BITS JG 2PC ACLG FOSF MAKITA',
        url_foto: null,
        item_catalogo: { etiqueta_descricao: 'BITS JG 2PC ACLG FOSF', etiqueta_aplicacao: 'PRODUÇÃO', estoque_minimo: '5' },
      },
      '104240309',
    );
    expect(d).toMatchObject({ descricao: 'BITS JG 2PC ACLG FOSF', aplicacao: 'PRODUÇÃO', localizacao: '104240309', minimo: 5 });
  });

  it('sem cadastro, sai a descrição do SAP e a aplicação em branco', () => {
    const d = dadosEtiquetaDoItem({ codigo_sap: '1418654', descricao: 'ADAPTADOR CT PEAD 3/4" AZ' }, '');
    expect(d).toMatchObject({ descricao: 'ADAPTADOR CT PEAD 3/4" AZ', aplicacao: '', localizacao: '', minimo: null });
  });

  it('estoque mínimo aceita vírgula e recusa vazio, negativo e texto', () => {
    expect(numeroOuNull('2,5')).toBe(2.5);
    expect(numeroOuNull(10)).toBe(10);
    expect(numeroOuNull('0')).toBe(0);
    expect(numeroOuNull('')).toBeNull();
    expect(numeroOuNull('  ')).toBeNull();
    expect(numeroOuNull('-3')).toBeNull();
    expect(numeroOuNull('abc')).toBeNull();
    expect(numeroOuNull(null)).toBeNull();
  });
});

describe('posicaoDaEtiqueta', () => {
  it('cabe 10 por folha A4, sem sair da página nem sobrepor', () => {
    expect(ETIQUETAS_POR_FOLHA).toBe(10);
    const posicoes = Array.from({ length: 10 }, (_, i) => posicaoDaEtiqueta(i));
    for (const p of posicoes) {
      expect(p.pagina).toBe(0);
      expect(p.x).toBeGreaterThan(0);
      expect(p.y).toBeGreaterThan(0);
      expect(p.x + ETIQUETA_LARGURA).toBeLessThan(595.28);
      expect(p.y + ETIQUETA_ALTURA).toBeLessThan(841.89);
    }
    // 1ª linha no topo, esquerda → direita
    expect(posicoes[1].x).toBeGreaterThan(posicoes[0].x);
    expect(posicoes[1].y).toBe(posicoes[0].y);
    expect(posicoes[2].y).toBeLessThan(posicoes[0].y - ETIQUETA_ALTURA + 0.01);
  });

  it('a 11ª vai para a segunda folha, na mesma posição da 1ª', () => {
    expect(posicaoDaEtiqueta(10)).toEqual({ ...posicaoDaEtiqueta(0), pagina: 1 });
  });
});

describe('QR impresso × leitor do formulário', () => {
  it('o QR gerado para a etiqueta é decodificado de volta no código do item', async () => {
    const QRCode = (await import('qrcode')).default;
    const jsQR = (await import('jsqr')).default;
    const qr = QRCode.create(conteudoQrEtiqueta('1437274'), { errorCorrectionLevel: 'M' });
    const n = qr.modules.size;
    const escala = 6;
    const margem = 4;
    const lado = (n + margem * 2) * escala;
    const rgba = new Uint8ClampedArray(lado * lado * 4).fill(255);
    for (let y = 0; y < lado; y += 1) {
      for (let x = 0; x < lado; x += 1) {
        const lin = Math.floor(y / escala) - margem;
        const col = Math.floor(x / escala) - margem;
        if (lin >= 0 && col >= 0 && lin < n && col < n && qr.modules.get(lin, col)) {
          const i = (y * lado + x) * 4;
          rgba[i] = 0; rgba[i + 1] = 0; rgba[i + 2] = 0;
        }
      }
    }
    const lido = jsQR(rgba, lado, lado);
    expect(lido?.data).toBe('https://sisten.site/#/balcao?item=1437274');
    expect(codigoDoQr(lido!.data)).toBe('1437274');
  });
});

describe('cores da etiqueta', () => {
  it('oferece as seis cores pedidas, na ordem do seletor', () => {
    expect(ORDEM_CORES_ETIQUETA.map(c => CORES_ETIQUETA[c].rotulo)).toEqual(['Cinza', 'Azul', 'Vermelho', 'Preto', 'Amarelo', 'Verde']);
  });

  it('amarelo usa texto preto (contraste); as demais, branco', () => {
    expect(CORES_ETIQUETA.amarelo.texto).toBe('#000000');
    for (const c of ORDEM_CORES_ETIQUETA.filter(c => c !== 'amarelo')) expect(CORES_ETIQUETA[c].texto).toBe('#ffffff');
  });

  it('converte hex para o rgb do PDF e valida a cor lembrada no aparelho', () => {
    expect(hexParaRgb01('#ffffff')).toEqual([1, 1, 1]);
    expect(hexParaRgb01('#000000')).toEqual([0, 0, 0]);
    expect(ehCorEtiqueta('azul')).toBe(true);
    expect(ehCorEtiqueta('roxo')).toBe(false);
    expect(ehCorEtiqueta(null)).toBe(false);
  });
});
