/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { sanitizeText, wrapText } from './core';

describe('sanitizeText', () => {
  it('troca TAB por espaço e tira os caracteres de controle que o WinAnsi não desenha', () => {
    expect(sanitizeText('PARAFUSO\tSEXT\t M8')).toBe('PARAFUSO SEXT  M8');
    expect(sanitizeText('linha 1\r\nlinha 2\rlinha 3')).toBe('linha 1\nlinha 2\nlinha 3');
    expect(sanitizeText('a\u0000b\u001Fc\u0085d')).toBe('abcd');
  });

  it('mantém acentos do português e a quebra de linha', () => {
    expect(sanitizeText('AÇÃO — CONEXÃO “3/4”\nFIM')).toBe('AÇÃO - CONEXÃO "3/4"\nFIM');
  });

  it('o texto limpo pode ser medido e desenhado pela Helvetica (Cadastro SAP com TAB colado)', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const bruto = 'Texto técnico colado do SAP:\tDIAM 3/4"\tPEAD\u000B azul';
    expect(() => font.widthOfTextAtSize('a\tb', 8)).toThrow();
    const linhas = wrapText(sanitizeText(bruto), font, 8.5, 200);
    expect(() => linhas.forEach((l) => font.widthOfTextAtSize(l, 8.5))).not.toThrow();
  });
});
