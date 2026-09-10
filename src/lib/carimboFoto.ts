/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Foto de recebimento com carimbo de data/hora "queimado" na imagem.
 *
 * Uma passada só de canvas: redimensiona (evidência, 1600px no maior lado),
 * desenha a foto, escreve `DD/MM/AAAA HH:MM` num tarja no canto inferior e
 * codifica em JPEG. O blob já sai comprimido — `subirEvidencia` sobe direto,
 * sem re-encodar (regra 1 do CLAUDE.md).
 *
 * PDF e formatos que o navegador não decodifica (HEIC fora do Safari) caem
 * no `prepareAttachment` normal, sem carimbo.
 */

import { prepareAttachment, type PreparedAttachment } from './imageCompression';

const MAX_DIMENSAO = 1600;
const QUALIDADE = 0.82;

/** `2026-09-10T14:32:…` → `10/09/2026 14:32`. */
function textoCarimbo(quando: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(quando.getDate())}/${p(quando.getMonth() + 1)}/${quando.getFullYear()} ${p(quando.getHours())}:${p(quando.getMinutes())}`;
}

/**
 * Prepara uma foto de recebimento com o carimbo de data/hora.
 * `quando` default = agora (momento em que a foto entra no formulário).
 */
export async function prepararFotoCarimbada(file: File, quando: Date = new Date()): Promise<PreparedAttachment> {
  if (!file.type.startsWith('image/')) {
    // PDF ou outro: sem carimbo, caminho padrão.
    return prepareAttachment(file);
  }

  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return prepareAttachment(file);

  try {
    const escala = Math.min(1, MAX_DIMENSAO / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * escala));
    const h = Math.max(1, Math.round(bitmap.height * escala));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return prepareAttachment(file);

    ctx.drawImage(bitmap, 0, 0, w, h);

    // Tarja proporcional ao menor lado, com piso legível.
    const fonte = Math.max(16, Math.round(Math.min(w, h) * 0.032));
    const pad = Math.round(fonte * 0.5);
    const texto = textoCarimbo(quando);
    ctx.font = `700 ${fonte}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
    ctx.textBaseline = 'bottom';
    const largura = ctx.measureText(texto).width;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(w - largura - pad * 3, h - fonte - pad * 2, largura + pad * 3, fonte + pad * 2);

    ctx.fillStyle = '#fff';
    ctx.fillText(texto, w - largura - pad * 1.5, h - pad);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', QUALIDADE));
    if (!blob) return prepareAttachment(file);

    const nome = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return {
      blob,
      name: nome,
      mimeType: 'image/jpeg',
      sizeOriginal: file.size,
      sizeCompressed: blob.size,
      previewUrl: URL.createObjectURL(blob),
    };
  } finally {
    bitmap.close();
  }
}
