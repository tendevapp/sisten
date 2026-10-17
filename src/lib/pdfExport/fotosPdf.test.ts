import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { chaveFoto, embutirFotoPdf, LADO_FOTO, limparCacheFotosPdf } from './fotosPdf';

// PNG 1x1
const PNG = Uint8Array.from(atob(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
), (c) => c.charCodeAt(0));

const STORAGE = 'https://proj.supabase.co/storage/v1/object/sign/request-attachments/almox-bom/peca-1.png';

function stubFetch(corpo: () => Response | Promise<Response>) {
  const fetchMock = vi.fn(async () => corpo());
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('fotosPdf', () => {
  beforeEach(async () => {
    await limparCacheFotosPdf();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('chave da foto é a URL sem a assinatura', () => {
    expect(chaveFoto(`${STORAGE}?token=abc`)).toBe(STORAGE);
    expect(chaveFoto('data:image/png;base64,AAA')).toBe('data:image/png;base64,AAA');
  });

  it('a mesma foto com outra assinatura não é baixada de novo (outro PDF da mesma sessão)', async () => {
    const fetchMock = stubFetch(() => new Response(PNG));
    const a = await embutirFotoPdf(await PDFDocument.create(), `${STORAGE}?token=1`, LADO_FOTO.ETIQUETA);
    const b = await embutirFotoPdf(await PDFDocument.create(), `${STORAGE}?token=2`, LADO_FOTO.ETIQUETA);
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('a mesma foto em outro tamanho (etiqueta, depois catálogo) também não é baixada de novo', async () => {
    const fetchMock = stubFetch(() => new Response(PNG));
    await embutirFotoPdf(await PDFDocument.create(), `${STORAGE}?token=1`, LADO_FOTO.ETIQUETA);
    await embutirFotoPdf(await PDFDocument.create(), `${STORAGE}?token=2`, LADO_FOTO.MINIATURA);
    await embutirFotoPdf(await PDFDocument.create(), `${STORAGE}?token=3`, LADO_FOTO.PAGINA);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('no mesmo documento a foto entra uma vez só', async () => {
    const fetchMock = stubFetch(() => new Response(PNG));
    const doc = await PDFDocument.create();
    const [a, b] = await Promise.all([
      embutirFotoPdf(doc, `${STORAGE}?token=1`, LADO_FOTO.GRADE),
      embutirFotoPdf(doc, `${STORAGE}?token=2`, LADO_FOTO.GRADE),
    ]);
    expect(a).toBe(b);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('falha de rede vira null e não fica lembrada: a próxima tentativa baixa de novo', async () => {
    let falhar = true;
    const fetchMock = stubFetch(() => {
      if (falhar) throw new TypeError('offline');
      return new Response(PNG);
    });
    expect(await embutirFotoPdf(await PDFDocument.create(), STORAGE, LADO_FOTO.GRADE)).toBeNull();
    falhar = false;
    expect(await embutirFotoPdf(await PDFDocument.create(), STORAGE, LADO_FOTO.GRADE)).not.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('resposta que não é imagem e 404 viram null', async () => {
    stubFetch(() => new Response('<html>erro</html>'));
    expect(await embutirFotoPdf(await PDFDocument.create(), `${STORAGE}-texto`, LADO_FOTO.GRADE)).toBeNull();
    stubFetch(() => new Response('', { status: 404 }));
    expect(await embutirFotoPdf(await PDFDocument.create(), `${STORAGE}-404`, LADO_FOTO.GRADE)).toBeNull();
  });

  it('aceita data: URL e URL vazia', async () => {
    const dataUrl = `data:image/png;base64,${btoa(String.fromCharCode(...PNG))}`;
    expect(await embutirFotoPdf(await PDFDocument.create(), dataUrl, LADO_FOTO.ASSINATURA)).not.toBeNull();
    expect(await embutirFotoPdf(await PDFDocument.create(), null, LADO_FOTO.ASSINATURA)).toBeNull();
  });

  it('limpar o cache (logout) faz baixar de novo', async () => {
    const fetchMock = stubFetch(() => new Response(PNG));
    await embutirFotoPdf(await PDFDocument.create(), STORAGE, LADO_FOTO.ETIQUETA);
    await limparCacheFotosPdf();
    await embutirFotoPdf(await PDFDocument.create(), STORAGE, LADO_FOTO.ETIQUETA);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
