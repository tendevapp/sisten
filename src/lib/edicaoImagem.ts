/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Edição de foto antes de subir (recorte, giro, brilho, contraste, saturação).
 * Módulo puro: a tela (`components/ui/EditorImagem.tsx`) desenha no canvas e
 * chama estas contas. A prévia e o arquivo final passam pela MESMA conta de
 * pixels (`aplicarAjustesPixels`), então o que se vê é o que sobe.
 *
 * O arquivo editado ainda passa pela compressão única (CLAUDE.md §1) no envio.
 */

/** 1 = sem mudança. */
export interface AjustesImagem {
  brilho: number;
  contraste: number;
  saturacao: number;
}

export const AJUSTES_NEUTROS: AjustesImagem = { brilho: 1, contraste: 1, saturacao: 1 };
export const FAIXA_AJUSTE = { min: 0.4, max: 2, passo: 0.02 } as const;

/** Retângulo em frações (0–1) da imagem já girada. */
export interface Recorte {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const RECORTE_INTEIRO: Recorte = { x: 0, y: 0, w: 1, h: 1 };
/** Menor lado do recorte, em fração — não deixa o retângulo sumir. */
export const RECORTE_MINIMO = 0.05;

export type Canto = 'nw' | 'ne' | 'sw' | 'se';
export type Rotacao = 0 | 90 | 180 | 270;

export function girar(r: Rotacao, sentido: 1 | -1): Rotacao {
  return (((r + sentido * 90) % 360) + 360) % 360 as Rotacao;
}

/** Largura × altura depois de girar. */
export function dimensoesGiradas(w: number, h: number, r: Rotacao): { w: number; h: number } {
  return r === 90 || r === 270 ? { w: h, h: w } : { w, h };
}

export function ehNeutro(a: AjustesImagem): boolean {
  return a.brilho === 1 && a.contraste === 1 && a.saturacao === 1;
}

const limitar = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/**
 * Brilho → contraste → saturação, nessa ordem, como as funções de filtro do
 * CSS (multiplica; afasta do cinza médio; matriz de saturação da Filter
 * Effects), limitando a 0–255 em cada passo. Altera `dados` no lugar.
 */
export function aplicarAjustesPixels(dados: Uint8ClampedArray, a: AjustesImagem): void {
  if (ehNeutro(a)) return;
  const { brilho: b, contraste: c, saturacao: s } = a;
  const intercepto = 127.5 * (1 - c);
  const m00 = 0.213 + 0.787 * s, m01 = 0.715 - 0.715 * s, m02 = 0.072 - 0.072 * s;
  const m10 = 0.213 - 0.213 * s, m11 = 0.715 + 0.285 * s, m12 = 0.072 - 0.072 * s;
  const m20 = 0.213 - 0.213 * s, m21 = 0.715 - 0.715 * s, m22 = 0.072 + 0.928 * s;
  for (let i = 0; i < dados.length; i += 4) {
    let r = limitar(dados[i] * b, 0, 255);
    let g = limitar(dados[i + 1] * b, 0, 255);
    let bl = limitar(dados[i + 2] * b, 0, 255);
    r = limitar(r * c + intercepto, 0, 255);
    g = limitar(g * c + intercepto, 0, 255);
    bl = limitar(bl * c + intercepto, 0, 255);
    dados[i] = m00 * r + m01 * g + m02 * bl;
    dados[i + 1] = m10 * r + m11 * g + m12 * bl;
    dados[i + 2] = m20 * r + m21 * g + m22 * bl;
  }
}

/**
 * "Iluminar": leva a luminância média para perto de 0,5 e dá um leve
 * contraste. Foto escura de almoxarifado é o caso comum; foto já clara quase
 * não muda.
 */
export function ajustesAutomaticos(dados: Uint8ClampedArray): AjustesImagem {
  let soma = 0;
  let n = 0;
  // Amostra 1 de cada 16 pixels: sobra para a média.
  for (let i = 0; i < dados.length; i += 64) {
    soma += 0.2126 * dados[i] + 0.7152 * dados[i + 1] + 0.0722 * dados[i + 2];
    n++;
  }
  const media = n > 0 ? soma / n / 255 : 0.5;
  const brilho = media > 0.01 ? limitar(0.52 / media, 0.8, 1.8) : 1.8;
  const arred = (v: number) => Math.round(v / FAIXA_AJUSTE.passo) * FAIXA_AJUSTE.passo;
  return { brilho: arred(brilho), contraste: 1.1, saturacao: 1.05 };
}

/** Mantém o recorte dentro da imagem e com tamanho mínimo. */
export function limitarRecorte(r: Recorte): Recorte {
  const w = limitar(r.w, RECORTE_MINIMO, 1);
  const h = limitar(r.h, RECORTE_MINIMO, 1);
  return { x: limitar(r.x, 0, 1 - w), y: limitar(r.y, 0, 1 - h), w, h };
}

export function moverRecorte(r: Recorte, dx: number, dy: number): Recorte {
  return limitarRecorte({ ...r, x: r.x + dx, y: r.y + dy });
}

/**
 * Arrasta um canto. Com `proporcao` (largura/altura em pixels), a altura segue
 * a largura; `aspectoBase` = largura/altura da imagem, para converter.
 */
export function redimensionarRecorte(
  r: Recorte, canto: Canto, dx: number, dy: number, proporcao: number | null, aspectoBase: number,
): Recorte {
  const oeste = canto === 'nw' || canto === 'sw';
  const norte = canto === 'nw' || canto === 'ne';
  // Lado fixo (o oposto ao canto arrastado).
  const fixoX = oeste ? r.x + r.w : r.x;
  const fixoY = norte ? r.y + r.h : r.y;
  let w = limitar(oeste ? r.w - dx : r.w + dx, RECORTE_MINIMO, oeste ? fixoX : 1 - fixoX);
  let h = limitar(norte ? r.h - dy : r.h + dy, RECORTE_MINIMO, norte ? fixoY : 1 - fixoY);
  if (proporcao) {
    // Em fração: h = w × aspectoBase / proporcao.
    const fator = aspectoBase / proporcao;
    const hMax = norte ? fixoY : 1 - fixoY;
    const wMax = oeste ? fixoX : 1 - fixoX;
    h = w * fator;
    if (h > hMax) { h = hMax; w = h / fator; }
    if (w > wMax) { w = wMax; h = w * fator; }
    if (w < RECORTE_MINIMO || h < RECORTE_MINIMO) return r;
  }
  return { x: oeste ? fixoX - w : fixoX, y: norte ? fixoY - h : fixoY, w, h };
}

/** Maior recorte centrado com a proporção pedida (null = imagem inteira). */
export function recorteComProporcao(proporcao: number | null, aspectoBase: number): Recorte {
  if (!proporcao) return { ...RECORTE_INTEIRO };
  const fator = aspectoBase / proporcao; // h em fração por unidade de w
  let w = 1;
  let h = fator;
  if (h > 1) { h = 1; w = 1 / fator; }
  return { x: (1 - w) / 2, y: (1 - h) / 2, w, h };
}

/** Recorte em pixels inteiros sobre a imagem girada de `largura` × `altura`. */
export function recorteEmPixels(r: Recorte, largura: number, altura: number) {
  const sx = Math.round(r.x * largura);
  const sy = Math.round(r.y * altura);
  const sw = Math.max(1, Math.min(largura - sx, Math.round(r.w * largura)));
  const sh = Math.max(1, Math.min(altura - sy, Math.round(r.h * altura)));
  return { sx, sy, sw, sh };
}

/** Reduz para caber em `maxLado` sem aumentar. */
export function dimensoesSaida(w: number, h: number, maxLado: number): { w: number; h: number } {
  const escala = Math.min(1, maxLado / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * escala)), h: Math.max(1, Math.round(h * escala)) };
}

/** "foto.heic" → "foto-editada.jpg". */
export function nomeArquivoEditado(nome: string | undefined | null): string {
  const base = (nome || 'foto').replace(/\.[^.]+$/, '').replace(/-editada$/, '') || 'foto';
  return `${base}-editada.jpg`;
}
