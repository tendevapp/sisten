/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  ETIQUETA_ALTURA,
  ETIQUETA_LARGURA,
  ETIQUETAS_POR_FOLHA,
  codigoDoQr,
  conteudoQrEtiqueta,
  dadosEtiquetaDoItem,
  posicaoDaEtiqueta,
} from './etiquetaMaterial';

describe('QR da etiqueta', () => {
  it('leva só a identificação do item, sem link', () => {
    expect(conteudoQrEtiqueta(' 1437274 ')).toBe('SISTEN-ITEM:1437274');
  });

  it('o leitor tira o código do QR da etiqueta', () => {
    expect(codigoDoQr('SISTEN-ITEM:1437274')).toBe('1437274');
    expect(codigoDoQr(conteudoQrEtiqueta('1418654'))).toBe('1418654');
    expect(codigoDoQr('sisten-item:1418654')).toBe('1418654');
  });

  it('aceita as etiquetas de teste (link com ?item=) e o código de barras das etiquetas antigas', () => {
    expect(codigoDoQr('https://sisten.site/#/formularios/almoxarifado-requisicao-balcao?item=1437274')).toBe('1437274');
    expect(codigoDoQr('http://localhost:3000/#/formularios/almoxarifado-requisicao-balcao?item=1418654')).toBe('1418654');
    expect(codigoDoQr('1427577')).toBe('1427577');
  });

  it('recusa QR que não é de item (link qualquer, texto livre, vazio)', () => {
    expect(codigoDoQr('https://fornecedor.com/produto/123')).toBeNull();
    expect(codigoDoQr('PASTILHA INTERC')).toBeNull();
    expect(codigoDoQr('SISTEN-ITEM:')).toBeNull();
    expect(codigoDoQr('   ')).toBeNull();
  });
});

describe('dadosEtiquetaDoItem', () => {
  it('usa o que foi editado no cadastro antes do texto do SAP', () => {
    const d = dadosEtiquetaDoItem(
      {
        codigo_sap: '1437274',
        descricao: 'BITS JG 2PC ACLG FOSF MAKITA',
        url_foto: null,
        item_catalogo: { etiqueta_descricao: 'BITS JG 2PC ACLG FOSF', etiqueta_aplicacao: 'PRODUÇÃO' },
      },
      '104240309',
    );
    expect(d).toMatchObject({ descricao: 'BITS JG 2PC ACLG FOSF', aplicacao: 'PRODUÇÃO', localizacao: '104240309' });
  });

  it('sem cadastro, sai a descrição do SAP e a aplicação em branco', () => {
    const d = dadosEtiquetaDoItem({ codigo_sap: '1418654', descricao: 'ADAPTADOR CT PEAD 3/4" AZ' }, '');
    expect(d).toMatchObject({ descricao: 'ADAPTADOR CT PEAD 3/4" AZ', aplicacao: '', localizacao: '' });
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
    expect(lido?.data).toBe('SISTEN-ITEM:1437274');
    expect(codigoDoQr(lido!.data)).toBe('1437274');
  });
});
