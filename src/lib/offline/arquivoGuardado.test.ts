import { describe, expect, it } from 'vitest';
import { deGuardado, ehArquivoGuardado, guardarArquivo, lerArquivo, paraGuardar } from './arquivoGuardado';

describe('foto guardada como bytes (Blob no IndexedDB do iPhone volta vazio)', () => {
  it('guarda os bytes, o tipo e o nome, e remonta o arquivo igual', async () => {
    const original = new Blob(['conteudo da foto'], { type: 'image/jpeg' });
    const guardado = await guardarArquivo(original, 'foto.jpg');
    expect(ehArquivoGuardado(guardado)).toBe(true);
    expect(guardado.bytes).toBeInstanceOf(ArrayBuffer);
    expect(guardado).toMatchObject({ tipo: 'image/jpeg', nome: 'foto.jpg', tamanho: 16 });
    const remontado = await lerArquivo(guardado);
    expect(remontado.type).toBe('image/jpeg');
    expect(await remontado!.text()).toBe('conteudo da foto');
  });
  it('registro antigo, ainda com Blob: lê se tiver conteúdo', async () => {
    const antigo = new Blob(['abc'], { type: 'image/png' });
    expect(await (await lerArquivo(antigo)).text()).toBe('abc');
  });
  it('arquivo que voltou vazio do aparelho falha com motivo claro', async () => {
    await expect(lerArquivo(new Blob([], { type: 'image/jpeg' }))).rejects.toThrow(/foto ficou vazia/i);
    await expect(lerArquivo({ __arquivoGuardado: true, bytes: new ArrayBuffer(0), tipo: 'image/jpeg', nome: null, tamanho: 0 })).rejects.toThrow(/foto ficou vazia/i);
  });
  it('objeto inteiro (pendência, outbox, rascunho): Blobs viram bytes ao gravar e voltam ao ler', async () => {
    const foto = new File(['abc'], 'frente.jpg', { type: 'image/jpeg' });
    const registro = { id: 'c1', fotos: [{ itemChave: 'i1', blob: foto }], assinatura: new Blob(['xy'], { type: 'image/png' }), n: 2, data: null };
    const gravado = await paraGuardar(registro) as any;
    expect(ehArquivoGuardado(gravado.fotos[0].blob)).toBe(true);
    expect(ehArquivoGuardado(gravado.assinatura)).toBe(true);
    expect(gravado.n).toBe(2);
    const lido = deGuardado(gravado) as any;
    expect(await lido.fotos[0].blob.text()).toBe('abc');
    expect(lido.fotos[0].blob.name).toBe('frente.jpg');
    expect(lido.assinatura.type).toBe('image/png');
    expect(lido.data).toBeNull();
  });
  it('gravar de novo o que já está em bytes não muda nada', async () => {
    const g = await guardarArquivo(new Blob(['z']));
    expect(await paraGuardar({ a: g })).toEqual({ a: g });
  });
  it('reconhece só o formato guardado', () => {
    expect(ehArquivoGuardado({})).toBe(false);
    expect(ehArquivoGuardado('texto')).toBe(false);
  });
});
