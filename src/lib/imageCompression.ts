/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Preparo de anexo para upload — validação + compressão de imagem.
 *
 * Uma responsabilidade só: receber um `File` do input e devolver um blob pronto
 * para subir. Não conhece Supabase nem React, para poder ser usado por qualquer
 * tela que precise anexar arquivo.
 *
 * A compressão roda no navegador via canvas, sem lib nova: uma foto de celular
 * de 4 MB vira ~150 KB, o que mantém o Storage e o egress do projeto baratos
 * (ver documentos/superpowers/specs/2026-07-28-anexos-imagens-design.md).
 */

/** Lado maior da imagem após o redimensionamento. Nunca amplia. */
const MAX_DIMENSAO = 1200;

/** Qualidade do encoder com perdas (WebP, ou JPEG no fallback). */
const QUALIDADE = 0.7;

/** Teto do arquivo de origem. Acima disso o navegador trava para decodificar. */
export const TAMANHO_MAXIMO_BYTES = 10 * 1024 * 1024;

/** Quantos anexos cabem por item de compra / por solicitação de cadastro SAP. */
export const MAX_ANEXOS = 3;

const TIPO_PDF = 'application/pdf';

/** O que o input aceita: qualquer imagem (o navegador filtra pelo MIME real) + PDF. */
export const ACCEPT_ANEXO = ['image/*', TIPO_PDF].join(',');

export interface PreparedAttachment {
  blob: Blob;
  /** Nome final; a extensão muda quando o arquivo é convertido para WebP. */
  name: string;
  mimeType: string;
  sizeOriginal: number;
  sizeCompressed: number;
  /** Object URL para a miniatura. Quem consome é responsável por revogar. */
  previewUrl: string;
}

/** Erro de validação, com mensagem já em português pronta para a UI. */
export class AnexoInvalidoError extends Error {}

function trocarExtensao(nome: string, novaExt: string): string {
  const semExt = nome.replace(/\.[^.]+$/, '');
  return `${semExt}.${novaExt}`;
}

/**
 * `canvas.toBlob` é callback-based e devolve `null` quando o navegador não sabe
 * codificar o tipo pedido — por isso o resultado é nulável aqui em vez de
 * rejeitar a promise.
 */
function canvasParaBlob(canvas: HTMLCanvasElement, tipo: string): Promise<Blob | null> {
  return new Promise(resolve => canvas.toBlob(resolve, tipo, QUALIDADE));
}

/**
 * Redimensiona e recodifica. Devolve `null` quando o navegador não consegue
 * decodificar a imagem (caso típico: HEIC do iPhone fora do Safari), deixando o
 * chamador decidir pelo fallback de subir o original.
 */
async function comprimirImagem(file: File): Promise<{ blob: Blob; mimeType: string } | null> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return null;
  }

  try {
    const escala = Math.min(1, MAX_DIMENSAO / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * escala));
    canvas.height = Math.max(1, Math.round(bitmap.height * escala));

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    // Navegador sem encoder WebP devolve null ou entrega um PNG com outro
    // mimeType; nos dois casos cai para JPEG, que é universal.
    let blob = await canvasParaBlob(canvas, 'image/webp');
    if (blob && blob.type === 'image/webp') {
      return { blob, mimeType: 'image/webp' };
    }

    blob = await canvasParaBlob(canvas, 'image/jpeg');
    return blob ? { blob, mimeType: 'image/jpeg' } : null;
  } finally {
    bitmap.close();
  }
}

/**
 * Compressão de foto para upload direto ao Storage.
 *
 * REGRA DO APP: nenhum módulo sobe foto ou captura de câmera sem passar por
 * aqui. Uma câmera de celular entrega 3–8 MB por imagem e o formulário costuma
 * ser preenchido em campo, na rede que houver; sem reduzir, anexar três fotos
 * vira minutos de espera e o egress do Supabase paga a conta.
 *
 * Diferente de `prepareAttachment`, devolve só o blob e não cria preview — é o
 * que as APIs de módulo (expedição, SSMA/RID) precisam antes do `upload()`.
 * Devolve o próprio arquivo quando o navegador não decodifica o formato (HEIC
 * fora do Safari) ou quando o resultado ficaria maior que o original.
 *
 * O padrão de 1600px em JPEG 0,82 é o das fotos de evidência, onde ainda é
 * preciso ler placa, painel e etiqueta na imagem reduzida.
 */
export async function comprimirImagemUpload(
  file: File,
  opcoes: { maxDimensao?: number; qualidade?: number } = {},
): Promise<Blob> {
  const maxDimensao = opcoes.maxDimensao ?? 1600;
  const qualidade = opcoes.qualidade ?? 0.82;

  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;

  try {
    const escala = Math.min(1, maxDimensao / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * escala));
    canvas.height = Math.max(1, Math.round(bitmap.height * escala));

    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>(resolve => {
      canvas.toBlob(resolve, 'image/jpeg', qualidade);
    });

    return blob && blob.size < file.size ? blob : file;
  } finally {
    bitmap.close();
  }
}

/**
 * Valida e prepara um arquivo para upload.
 *
 * PDF passa sem tocar nos bytes. Imagem é redimensionada e recodificada, com
 * duas redes de segurança: se o navegador não decodificar o formato, ou se o
 * resultado ficar maior que o original (acontece com PNG pequeno já otimizado),
 * o arquivo original é mantido.
 *
 * @throws {AnexoInvalidoError} tipo não suportado ou acima do teto de tamanho.
 */
export async function prepareAttachment(file: File): Promise<PreparedAttachment> {
  const ehImagem = file.type.startsWith('image/');
  const ehPdf = file.type === TIPO_PDF;

  if (!ehImagem && !ehPdf) {
    throw new AnexoInvalidoError('Formato não aceito. Envie uma imagem ou PDF.');
  }
  if (file.size > TAMANHO_MAXIMO_BYTES) {
    throw new AnexoInvalidoError('Arquivo acima de 10 MB. Reduza o tamanho antes de anexar.');
  }

  const original: PreparedAttachment = {
    blob: file,
    name: file.name,
    mimeType: file.type || 'application/octet-stream',
    sizeOriginal: file.size,
    sizeCompressed: file.size,
    previewUrl: URL.createObjectURL(file),
  };

  if (ehPdf) return original;

  const comprimido = await comprimirImagem(file);
  if (!comprimido || comprimido.blob.size >= file.size) {
    return original;
  }

  URL.revokeObjectURL(original.previewUrl);
  return {
    blob: comprimido.blob,
    name: trocarExtensao(file.name, comprimido.mimeType === 'image/webp' ? 'webp' : 'jpg'),
    mimeType: comprimido.mimeType,
    sizeOriginal: file.size,
    sizeCompressed: comprimido.blob.size,
    previewUrl: URL.createObjectURL(comprimido.blob),
  };
}
