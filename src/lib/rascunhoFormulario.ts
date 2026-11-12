/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Rascunho de formulário guardado no aparelho.
 *
 * Na portaria o formulário se perdia sempre que a página recarregava no meio
 * do preenchimento: o Android fecha a aba do navegador para liberar memória
 * quando abre a câmera ou outro aplicativo, o logoff da meia-noite derruba a
 * sessão do turno da noite, e o aviso de versão nova pede para recarregar.
 * O estado do formulário vivia só na memória da página.
 *
 * Aqui ele vai para o IndexedDB (fotos e assinaturas inclusas) a cada
 * alteração e, sem esperar, quando a tela sai de vista — é nesse instante que
 * o sistema pode matar a aba. Ao voltar, a tela reaplica o rascunho e, se o
 * formulário estava aberto, reabre.
 *
 * As fotos (Blob/File) ficam em chaves próprias, gravadas uma vez só: o texto
 * é regravado a cada tecla, a foto crua de 3–8 MB não.
 *
 * Só as funções puras são testadas (vitest roda em Node, sem IndexedDB).
 */

import { createStore, del, get, keys, set, type UseStore } from 'idb-keyval';

/** Rascunho mais velho que isto é descartado ao abrir a tela. */
export const VALIDADE_RASCUNHO_MS = 3 * 24 * 60 * 60 * 1000;

const SEPARADOR_BLOB = '#blob:';

export interface RascunhoGuardado<T> {
  dados: T;
  /** O formulário estava aberto quando o rascunho foi gravado (a página caiu no meio). */
  aberto: boolean;
  /** ISO — hora da última gravação. */
  salvoEm: string;
}

interface RegistroGuardado {
  versao: 1;
  dados: unknown;
  aberto: boolean;
  salvoEm: string;
  blobs: string[];
}

interface MarcaBlob { __rascunhoBlob: string }

// ---------------------------------------------------------------------------
// Funções puras
// ---------------------------------------------------------------------------

function ehBlob(v: unknown): v is Blob {
  return typeof Blob !== 'undefined' && v instanceof Blob;
}

/** Identidade estável de um arquivo — não lê o conteúdo. */
export function idBlob(b: Blob): string {
  const f = b as Partial<File>;
  return `${b.size}-${b.type}-${f.name ?? ''}-${f.lastModified ?? ''}`.replace(/[^\w.-]/g, '_');
}

/**
 * Assinatura textual dos dados, barata de comparar: arquivos entram pela
 * identidade, não pelo conteúdo. Serve para só regravar quando algo mudou.
 */
export function assinaturaRascunho(dados: unknown): string {
  try {
    return JSON.stringify(dados, (_k, v) => (ehBlob(v) ? `blob:${idBlob(v)}` : v)) ?? '';
  } catch {
    return String(Date.now());
  }
}

/** Troca cada arquivo por uma marca e devolve os arquivos à parte. */
export function separarBlobs(valor: unknown, blobs: Map<string, Blob>): unknown {
  if (ehBlob(valor)) {
    const id = idBlob(valor);
    blobs.set(id, valor);
    return { __rascunhoBlob: id } satisfies MarcaBlob;
  }
  if (Array.isArray(valor)) return valor.map((v) => separarBlobs(v, blobs));
  if (valor && typeof valor === 'object' && Object.getPrototypeOf(valor) === Object.prototype) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(valor as Record<string, unknown>)) out[k] = separarBlobs(v, blobs);
    return out;
  }
  return valor;
}

/** Inverso de `separarBlobs`. Marca sem arquivo correspondente vira `null`. */
export function juntarBlobs(valor: unknown, blobs: Map<string, Blob>): unknown {
  if (Array.isArray(valor)) return valor.map((v) => juntarBlobs(v, blobs));
  if (valor && typeof valor === 'object') {
    const marca = (valor as Partial<MarcaBlob>).__rascunhoBlob;
    if (typeof marca === 'string') return blobs.get(marca) ?? null;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(valor as Record<string, unknown>)) out[k] = juntarBlobs(v, blobs);
    return out;
  }
  return valor;
}

export function rascunhoExpirado(salvoEm: string, agora: number = Date.now(), validadeMs = VALIDADE_RASCUNHO_MS): boolean {
  const t = Date.parse(salvoEm);
  return !Number.isFinite(t) || agora - t > validadeMs;
}

/**
 * `true` se algum campo de texto do objeto tem conteúdo, fora os que nascem
 * preenchidos (data, hora, nome do vigilante…).
 */
export function algumTextoPreenchido(obj: Record<string, unknown> | null | undefined, ignorar: readonly string[] = []): boolean {
  if (!obj) return false;
  return Object.entries(obj).some(([k, v]) => {
    if (ignorar.includes(k)) return false;
    if (typeof v === 'string') return v.trim() !== '';
    if (typeof v === 'number') return Number.isFinite(v) && v !== 0;
    if (Array.isArray(v)) return v.length > 0;
    return false;
  });
}

/** Chave do rascunho: um por usuário e formulário. */
export function chaveRascunho(usuarioId: string | null | undefined, formulario: string): string | null {
  return usuarioId ? `${usuarioId}:${formulario}` : null;
}

// ---------------------------------------------------------------------------
// IndexedDB
// ---------------------------------------------------------------------------

let loja: UseStore | null = null;
function store(): UseStore | null {
  if (typeof indexedDB === 'undefined') return null;
  if (!loja) loja = createStore('sisten-rascunhos', 'rascunhos');
  return loja;
}

export async function lerRascunho<T>(chave: string): Promise<RascunhoGuardado<T> | null> {
  const s = store();
  if (!s) return null;
  try {
    const reg = await get<RegistroGuardado>(chave, s);
    if (!reg || reg.versao !== 1) return null;
    if (rascunhoExpirado(reg.salvoEm)) {
      await apagarRascunho(chave);
      return null;
    }
    const blobs = new Map<string, Blob>();
    for (const id of reg.blobs) {
      const b = await get<Blob>(`${chave}${SEPARADOR_BLOB}${id}`, s);
      if (b) blobs.set(id, b);
    }
    return { dados: juntarBlobs(reg.dados, blobs) as T, aberto: reg.aberto, salvoEm: reg.salvoEm };
  } catch {
    return null;
  }
}

export async function gravarRascunho<T>(chave: string, dados: T, aberto: boolean): Promise<string | null> {
  const s = store();
  if (!s) return null;
  try {
    const blobs = new Map<string, Blob>();
    const semBlobs = separarBlobs(dados, blobs);
    const anterior = await get<RegistroGuardado>(chave, s);
    const jaGravados = new Set(anterior?.blobs ?? []);
    for (const [id, b] of blobs) {
      if (!jaGravados.has(id)) await set(`${chave}${SEPARADOR_BLOB}${id}`, b, s);
    }
    const salvoEm = new Date().toISOString();
    const reg: RegistroGuardado = { versao: 1, dados: semBlobs, aberto, salvoEm, blobs: [...blobs.keys()] };
    await set(chave, reg, s);
    for (const id of jaGravados) {
      if (!blobs.has(id)) await del(`${chave}${SEPARADOR_BLOB}${id}`, s);
    }
    return salvoEm;
  } catch {
    // Aparelho sem espaço ou IndexedDB bloqueado: segue sem rascunho.
    return null;
  }
}

export async function apagarRascunho(chave: string): Promise<void> {
  const s = store();
  if (!s) return;
  try {
    await del(chave, s);
    const todas = await keys(s);
    for (const k of todas) {
      if (typeof k === 'string' && k.startsWith(`${chave}${SEPARADOR_BLOB}`)) await del(k, s);
    }
  } catch {
    /* ignore */
  }
}
