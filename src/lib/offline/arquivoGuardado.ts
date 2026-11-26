/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Foto/anexo guardado na fila offline como BYTES, não como Blob.
 *
 * 26/11/2026: num iPhone, as fotos do Cadastro de Itens guardadas na fila
 * voltaram vazias e o Storage recusou com "No content provided" — no Android
 * as mesmas subiram. O Safari/WebKit perde o conteúdo de Blob guardado no
 * IndexedDB (principalmente depois que o iOS congela ou recarrega o app).
 * ArrayBuffer é guardado por valor e não tem esse problema. O arquivo é
 * remontado na hora do envio.
 */

export interface ArquivoGuardado {
  __arquivoGuardado: true;
  bytes: ArrayBuffer;
  tipo: string;
  nome: string | null;
  tamanho: number;
}

export function ehArquivoGuardado(valor: unknown): valor is ArquivoGuardado {
  return !!valor && typeof valor === 'object' && (valor as { __arquivoGuardado?: unknown }).__arquivoGuardado === true;
}

/** Lê os bytes agora, enquanto o arquivo ainda está na memória. */
export async function guardarArquivo(blob: Blob, nome?: string | null): Promise<ArquivoGuardado> {
  const bytes = await blob.arrayBuffer();
  return { __arquivoGuardado: true, bytes, tipo: blob.type || 'application/octet-stream', nome: nome ?? null, tamanho: bytes.byteLength };
}

function ehBlob(valor: unknown): valor is Blob {
  return typeof Blob !== 'undefined' && valor instanceof Blob;
}

/**
 * Para gravar no IndexedDB: troca todo Blob/File dentro do objeto por bytes.
 * Usado pelas outras filas do aparelho (checklists da Qualidade, outbox da
 * Produção, rascunhos) — mesma falha do Safari.
 */
export async function paraGuardar(valor: unknown): Promise<unknown> {
  if (ehBlob(valor)) return guardarArquivo(valor, 'name' in valor ? (valor as File).name : null);
  if (ehArquivoGuardado(valor) || valor === null || typeof valor !== 'object' || valor instanceof Date || valor instanceof ArrayBuffer) return valor;
  if (Array.isArray(valor)) return Promise.all(valor.map(paraGuardar));
  const saida: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(valor as Record<string, unknown>)) saida[k] = await paraGuardar(v);
  return saida;
}

/** Ao ler do IndexedDB: remonta os arquivos (File quando havia nome). Blob antigo passa como está. */
export function deGuardado(valor: unknown): unknown {
  if (ehArquivoGuardado(valor)) {
    return valor.nome && typeof File !== 'undefined'
      ? new File([valor.bytes], valor.nome, { type: valor.tipo })
      : new Blob([valor.bytes], { type: valor.tipo });
  }
  if (valor === null || typeof valor !== 'object' || ehBlob(valor) || valor instanceof Date || valor instanceof ArrayBuffer) return valor;
  if (Array.isArray(valor)) return valor.map(deGuardado);
  const saida: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(valor as Record<string, unknown>)) saida[k] = deGuardado(v);
  return saida;
}

const MENSAGEM_VAZIA ='A foto ficou vazia neste aparelho (o navegador não guardou o arquivo). Tire a foto de novo e descarte este registro.';

/** Remonta o arquivo para enviar. Aceita o Blob dos registros antigos; vazio falha com o motivo. */
export async function lerArquivo(valor: ArquivoGuardado | Blob): Promise<Blob> {
  if (ehArquivoGuardado(valor)) {
    if (!valor.bytes || valor.bytes.byteLength === 0) throw new Error(MENSAGEM_VAZIA);
    return new Blob([valor.bytes], { type: valor.tipo });
  }
  let bytes: ArrayBuffer;
  try {
    bytes = await valor.arrayBuffer();
  } catch {
    throw new Error(MENSAGEM_VAZIA);
  }
  if (bytes.byteLength === 0) throw new Error(MENSAGEM_VAZIA);
  return new Blob([bytes], { type: valor.type });
}
