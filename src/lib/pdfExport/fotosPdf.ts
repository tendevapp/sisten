/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Imagens dentro dos PDFs: cada uma entra no tamanho em que aparece na página
 * e só é baixada do Storage uma vez por aparelho.
 *
 * Tamanho do arquivo — a foto guardada tem até 1600 px (regra 1 do CLAUDE.md),
 * mas numa etiqueta ela ocupa 2 cm. Embutir o arquivo cru punha ~250 KB por
 * foto no PDF. Aqui a imagem é reduzida ao maior lado do uso (`LADO_FOTO`) e
 * regravada em JPEG; a que já cabe e já é JPEG/PNG entra como está.
 *
 * Egress — a URL assinada muda a cada assinatura, o arquivo não (o Storage
 * grava com nome único e sem sobrescrever). A chave do cache é a URL sem a
 * query. Primeiro a memória (regerar o PDF, trocar a cor da etiqueta), depois o
 * IndexedDB (exportar de novo outro dia). O que fica no aparelho é a versão já
 * reduzida, com limite de tamanho e validade; o logout apaga.
 *
 * Assinatura e selfie não vão para o IndexedDB (`persistir: false`).
 */

import { clear, createStore, del, entries, get, set, type UseStore } from 'idb-keyval';
import type { PDFDocument, PDFImage } from 'pdf-lib';

/** Maior lado, em px, de cada uso: tamanho na página (pt) / 72 × 150 a 300 dpi. */
export const LADO_FOTO = {
  /** Página de anexo (até 515 × 620 pt), ~150 dpi. */
  PAGINA: 1280,
  /** Grade de fotos em 2 ou 3 colunas (~250 × 150 pt), ~200 dpi. */
  GRADE: 720,
  /** Assinatura e selfie (até ~250 × 44 pt). */
  ASSINATURA: 480,
  /** Logo do cabeçalho (até ~110 × 44 pt). */
  LOGO: 480,
  /** Imagem da etiqueta de 90 × 54 mm (~120 × 55 pt), ~300 dpi para impressão. */
  ETIQUETA: 320,
  /** Miniatura de 20 pt do catálogo. */
  MINIATURA: 120,
} as const;

const QUALIDADE_JPEG = 0.8;

export interface OpcoesFotoPdf {
  /** Guarda a versão reduzida no IndexedDB. Padrão: só imagens do Storage. */
  persistir?: boolean;
  /** Reduz mantendo PNG (logo: transparência e bordas nítidas). */
  png?: boolean;
}

interface Reduzida {
  bytes: Uint8Array;
  png: boolean;
}

const ehPng = (b: Uint8Array) => b.length > 3 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
const ehJpeg = (b: Uint8Array) => b.length > 2 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
const ehDoStorage = (url: string) => url.includes('/storage/v1/object/');

/** URL sem a query: a assinatura muda a cada pedido, o arquivo não. */
export function chaveFoto(url: string): string {
  if (url.startsWith('data:')) return url;
  const i = url.indexOf('?');
  return i >= 0 ? url.slice(0, i) : url;
}

/**
 * Reduz ao maior lado `ladoMax`. Imagem que já cabe e já é JPEG/PNG volta como
 * está (sem perder qualidade numa segunda compressão). Sem canvas (testes no
 * node) ou com formato que o navegador não abre, JPEG/PNG voltam como estão e
 * o resto vira null. `forcar` regrava mesmo assim (JPEG que o pdf-lib recusa).
 */
export async function reduzirImagem(blob: Blob, ladoMax: number, png = false, forcar = false): Promise<Reduzida | null> {
  const original = new Uint8Array(await blob.arrayBuffer());
  const comoEsta: Reduzida | null = ehJpeg(original) || ehPng(original) ? { bytes: original, png: ehPng(original) } : null;
  if (typeof createImageBitmap === 'undefined' || typeof document === 'undefined') return comoEsta;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob);
  } catch {
    return comoEsta;
  }
  try {
    const maior = Math.max(bitmap.width, bitmap.height);
    if (!forcar && comoEsta && maior <= ladoMax) return comoEsta;
    const escala = Math.min(1, ladoMax / maior);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * escala));
    canvas.height = Math.max(1, Math.round(bitmap.height * escala));
    const ctx = canvas.getContext('2d');
    if (!ctx) return comoEsta;
    if (!png) {
      // JPEG não tem transparência: sem fundo branco, o transparente vira preto.
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const saida = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, png ? 'image/png' : 'image/jpeg', QUALIDADE_JPEG));
    if (!saida) return comoEsta;
    const bytes = new Uint8Array(await saida.arrayBuffer());
    if (!forcar && comoEsta && bytes.length >= original.length) return comoEsta;
    return { bytes, png };
  } finally {
    bitmap.close();
  }
}

// ---------------------------------------------------------------------------
// Cache no aparelho (IndexedDB), só da versão reduzida
// ---------------------------------------------------------------------------

const LIMITE_BYTES = 40 * 1024 * 1024;
const VALIDADE_MS = 30 * 24 * 60 * 60 * 1000;
const UM_DIA_MS = 24 * 60 * 60 * 1000;

interface Guardada {
  blob: Blob;
  png: boolean;
  usadoEm: number;
}

let loja: UseStore | null | undefined;
function lojaFotos(): UseStore | null {
  if (loja === undefined) loja = typeof indexedDB === 'undefined' ? null : createStore('sisten-fotos-pdf', 'fotos');
  return loja;
}

async function lerGuardada(chave: string): Promise<Reduzida | null> {
  const s = lojaFotos();
  if (!s) return null;
  try {
    const g = await get<Guardada>(chave, s);
    if (!g?.blob) return null;
    const agora = Date.now();
    if (agora - g.usadoEm > VALIDADE_MS) return null;
    // Marca o uso no máximo uma vez por dia, para a poda saber o que é antigo.
    if (agora - g.usadoEm > UM_DIA_MS) void set(chave, { ...g, usadoEm: agora }, s).catch(() => {});
    return { bytes: new Uint8Array(await g.blob.arrayBuffer()), png: g.png };
  } catch {
    return null;
  }
}

let podaAgendada: ReturnType<typeof setTimeout> | null = null;

/** Apaga o vencido e, do mais antigo para o mais novo, o que passar do limite. */
async function podar(): Promise<void> {
  const s = lojaFotos();
  if (!s) return;
  try {
    const todas = (await entries<string, Guardada>(s)).sort((a, b) => (b[1]?.usadoEm ?? 0) - (a[1]?.usadoEm ?? 0));
    const agora = Date.now();
    let total = 0;
    for (const [chave, g] of todas) {
      total += g?.blob?.size ?? 0;
      if (!g?.blob || total > LIMITE_BYTES || agora - g.usadoEm > VALIDADE_MS) await del(chave, s);
    }
  } catch (err) {
    console.warn('[fotosPdf] Falha ao podar o cache de fotos:', err);
  }
}

async function guardar(chave: string, r: Reduzida): Promise<void> {
  const s = lojaFotos();
  if (!s) return;
  try {
    const blob = new Blob([r.bytes as BlobPart], { type: r.png ? 'image/png' : 'image/jpeg' });
    await set(chave, { blob, png: r.png, usadoEm: Date.now() } satisfies Guardada, s);
    if (!podaAgendada) {
      podaAgendada = setTimeout(() => {
        podaAgendada = null;
        void podar();
      }, 3000);
    }
  } catch {
    // Sem espaço ou IndexedDB bloqueado: só não guarda.
  }
}

// ---------------------------------------------------------------------------
// Cache da sessão (memória) e download
// ---------------------------------------------------------------------------

const MAX_MEMORIA = 300;
const memoria = new Map<string, Promise<Reduzida | null>>();

function lembrar(chave: string, valor: Promise<Reduzida | null>): void {
  memoria.delete(chave);
  memoria.set(chave, valor);
  if (memoria.size > MAX_MEMORIA) memoria.delete(memoria.keys().next().value as string);
}

async function baixar(url: string): Promise<Blob | null> {
  try {
    const resposta = await fetch(url);
    if (!resposta.ok) return null;
    const bytes = new Uint8Array(await resposta.arrayBuffer());
    // Blob sem tipo pode travar o createImageBitmap (visto no Chrome headless): sempre informa o MIME.
    const tipo = ehJpeg(bytes) ? 'image/jpeg' : ehPng(bytes) ? 'image/png' : resposta.headers?.get?.('content-type') || 'image/*';
    return new Blob([bytes as BlobPart], { type: tipo });
  } catch (err) {
    console.warn('[fotosPdf] Imagem não entrou no PDF:', err);
    return null;
  }
}

/**
 * Original baixado nesta sessão: a mesma foto em outro tamanho (etiqueta e
 * depois catálogo) sai daqui, sem novo download. Só memória, com teto.
 */
const MAX_ORIGINAIS_BYTES = 40 * 1024 * 1024;
const originais = new Map<string, Promise<Blob | null>>();
const tamanhoOriginal = new Map<string, number>();
let bytesOriginais = 0;

function obterOriginal(url: string): Promise<Blob | null> {
  if (url.startsWith('data:')) return baixar(url);
  const chave = chaveFoto(url);
  const lembrado = originais.get(chave);
  if (lembrado) return lembrado;
  const promessa = baixar(url);
  originais.set(chave, promessa);
  void promessa.then((blob) => {
    if (originais.get(chave) !== promessa) return;
    if (!blob) {
      originais.delete(chave);
      return;
    }
    tamanhoOriginal.set(chave, blob.size);
    bytesOriginais += blob.size;
    for (const antiga of originais.keys()) {
      if (bytesOriginais <= MAX_ORIGINAIS_BYTES || antiga === chave) break;
      bytesOriginais -= tamanhoOriginal.get(antiga) ?? 0;
      tamanhoOriginal.delete(antiga);
      originais.delete(antiga);
    }
  });
  return promessa;
}

async function baixarEReduzir(url: string, ladoMax: number, png: boolean): Promise<Reduzida | null> {
  const blob = await obterOriginal(url);
  return blob ? reduzirImagem(blob, ladoMax, png) : null;
}

function obterReduzida(url: string, ladoMax: number, opcoes: OpcoesFotoPdf): Promise<Reduzida | null> {
  const png = Boolean(opcoes.png);
  // data: já está na memória de quem chamou; não há download a evitar.
  if (url.startsWith('data:')) return baixarEReduzir(url, ladoMax, png);

  const chave = `${chaveFoto(url)}@${ladoMax}${png ? 'p' : ''}`;
  const lembrada = memoria.get(chave);
  if (lembrada) {
    lembrar(chave, lembrada);
    return lembrada;
  }

  const persistir = opcoes.persistir ?? ehDoStorage(url);
  const promessa = (async () => {
    if (persistir) {
      const guardada = await lerGuardada(chave);
      if (guardada) return guardada;
    }
    const reduzida = await baixarEReduzir(url, ladoMax, png);
    if (reduzida && persistir) void guardar(chave, reduzida);
    return reduzida;
  })();
  lembrar(chave, promessa);
  // Falha (rede, 404) não fica lembrada: a próxima tentativa baixa de novo.
  void promessa.then((r) => {
    if (!r && memoria.get(chave) === promessa) memoria.delete(chave);
  });
  return promessa;
}

const porDocumento = new WeakMap<PDFDocument, Map<string, Promise<PDFImage | null>>>();

/**
 * Embute a imagem da URL (ou data:) no PDF, reduzida a `ladoMax` px. A mesma
 * imagem no mesmo documento entra uma vez só. Falha vira null, nunca exceção:
 * quem chama desenha o aviso de "sem foto".
 */
export function embutirFotoPdf(
  doc: PDFDocument,
  url: string | null | undefined,
  ladoMax: number,
  opcoes: OpcoesFotoPdf = {},
): Promise<PDFImage | null> {
  if (!url) return Promise.resolve(null);
  let doDocumento = porDocumento.get(doc);
  if (!doDocumento) {
    doDocumento = new Map();
    porDocumento.set(doc, doDocumento);
  }
  const chave = `${chaveFoto(url)}@${ladoMax}${opcoes.png ? 'p' : ''}`;
  let imagem = doDocumento.get(chave);
  if (!imagem) {
    imagem = obterReduzida(url, ladoMax, opcoes).then(async (r) => {
      if (!r) return null;
      try {
        return r.png ? await doc.embedPng(r.bytes) : await doc.embedJpg(r.bytes);
      } catch {
        // JPEG que o pdf-lib não lê (CMYK, marcadores raros): regrava pelo canvas.
        const tipo = r.png ? 'image/png' : 'image/jpeg';
        const regravada = await reduzirImagem(new Blob([r.bytes as BlobPart], { type: tipo }), ladoMax, r.png, true).catch(() => null);
        if (!regravada || regravada.bytes === r.bytes) return null;
        try {
          return regravada.png ? await doc.embedPng(regravada.bytes) : await doc.embedJpg(regravada.bytes);
        } catch (err) {
          console.warn('[fotosPdf] Imagem não pôde ser embutida:', err);
          return null;
        }
      }
    });
    doDocumento.set(chave, imagem);
  }
  return imagem;
}

/** Logo do cabeçalho reduzido, em PNG (mantém o recorte e a nitidez). */
export function embutirLogoPdf(doc: PDFDocument, caminho = '/logo-adm.png'): Promise<PDFImage | null> {
  return embutirFotoPdf(doc, caminho, LADO_FOTO.LOGO, { png: true, persistir: false });
}

/** Apaga as fotos guardadas para PDF (memória e aparelho). Chamado no logout. */
export async function limparCacheFotosPdf(): Promise<void> {
  memoria.clear();
  originais.clear();
  tamanhoOriginal.clear();
  bytesOriginais = 0;
  const s = lojaFotos();
  if (s) await clear(s).catch(() => {});
}
