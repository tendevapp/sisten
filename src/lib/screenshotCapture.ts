/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Captura de tela para o reporte de bug. Mesma estratégia de compressão de
 * `imageCompression.ts` (canvas + WebP 0.7, fallback JPEG), aplicada sobre o
 * canvas que o html2canvas devolve em vez de um File do usuário.
 */

const MAX_DIMENSAO = 1600;
const QUALIDADE = 0.7;

export function computeScaledDimensions(width: number, height: number, max: number): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
  return new Promise(resolve => canvas.toBlob(resolve, type, QUALIDADE));
}

/**
 * Devolve `null` em qualquer falha (elemento não encontrado, encoder
 * indisponível) — o chamador deve seguir o fluxo sem screenshot, nunca travar
 * o envio do reporte por causa disso.
 */
export async function captureViewport(target: HTMLElement = document.body): Promise<Blob | null> {
  try {
    const { default: html2canvas } = await import('html2canvas');
    const rendered = await html2canvas(target, { logging: false, useCORS: true });
    const { width, height } = computeScaledDimensions(rendered.width, rendered.height, MAX_DIMENSAO);

    const scaled = document.createElement('canvas');
    scaled.width = width;
    scaled.height = height;
    const ctx = scaled.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(rendered, 0, 0, width, height);

    let blob = await canvasToBlob(scaled, 'image/webp');
    if (!blob || blob.type !== 'image/webp') {
      blob = await canvasToBlob(scaled, 'image/jpeg');
    }
    return blob;
  } catch (err) {
    console.error('Falha ao capturar a tela para o reporte.', err);
    return null;
  }
}
