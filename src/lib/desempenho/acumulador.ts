/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Acumulador do Monitor de Desempenho, do lado do aparelho. Junta, numa janela
 * de ~5 min, o que o navegador viveu: cada chamada ao Supabase (endpoint,
 * tempo, erro, volume baixado), os travamentos da tela (long tasks) e as
 * visitas a cada página. O reporter (`reporterDesempenho.ts`) extrai o resumo e
 * manda pela RPC `registrar_desempenho_cliente`.
 *
 * Puro: sem rede, sem DOM. Tudo com teto — um aparelho com uma tela em laço
 * não pode montar um resumo de megabytes.
 */

/** A partir daqui a chamada conta como "lenta" para o usuário. */
export const LIMITE_LENTA_MS = 3_000;
/** Tarefa da thread principal acima disso é "travamento" (a tela não responde). */
export const LIMITE_TRAVAMENTO_MS = 200;

export const MAX_ENDPOINTS = 120;
export const MAX_PAGINAS = 40;
export const MAX_PAGINAS_POR_ENDPOINT = 5;
export const CHAVE_OUTROS = 'OUTROS';

export interface DadosEndpoint {
  /** chamadas */
  n: number;
  /** tempo somado (ms) */
  ms: number;
  /** maior tempo (ms) */
  mx: number;
  /** lentas */
  l: number;
  /** erros (5xx, 429, falha de rede) */
  e: number;
  /** bytes baixados (descompactados) */
  b: number;
  /** de quais páginas saíram as chamadas */
  p: Record<string, number>;
}

export interface DadosPagina {
  /** visitas (entrou na página) */
  v: number;
  n: number;
  ms: number;
  l: number;
  e: number;
  b: number;
  /** travamentos */
  tv: number;
  /** tempo travado (ms) */
  tms: number;
}

export interface SnapshotDesempenho {
  inicio: number;
  fim: number;
  requisicoes: number;
  tempo_ms: number;
  lentas: number;
  erros: number;
  bytes: number;
  travamentos: number;
  travamento_ms: number;
  travamento_max_ms: number;
  storage_n: number;
  storage_bytes: number;
  endpoints: Record<string, DadosEndpoint>;
  paginas: Record<string, DadosPagina>;
}

export interface ChamadaMedida {
  endpoint: string;
  pagina: string;
  ms: number;
  erro: boolean;
  bytes?: number;
}

const SEGMENTO_ID = /^(\d+|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{24,})$/i;

/** "/compras/solicitacao/123" → "/compras/solicitacao/:id". Sem query nem hash. */
export function normalizarPagina(caminho: string): string {
  const semQuery = (caminho || '/').split(/[?#]/)[0];
  const partes = semQuery.split('/').filter(Boolean).map(p => (SEGMENTO_ID.test(p) ? ':id' : p));
  const pagina = '/' + partes.join('/');
  return pagina.length > 80 ? pagina.slice(0, 80) : pagina;
}

/**
 * Nome curto do que foi chamado, para agrupar. `null` quando a URL não é do
 * Supabase ou não interessa (ex.: realtime).
 *
 *   GET  /rest/v1/vw_x?select=*          → "GET vw_x"
 *   POST /rest/v1/rpc/buscar_materiais   → "RPC buscar_materiais"
 *   POST /storage/v1/object/sign/fotos/… → "STORAGE assinar fotos"
 *   POST /auth/v1/token?grant_type=…     → "AUTH token"
 *   POST /functions/v1/enviar-email      → "FUNÇÃO enviar-email"
 */
export function chaveEndpoint(url: string, metodo: string, urlSupabase: string): string | null {
  if (!urlSupabase || !url.startsWith(urlSupabase)) return null;
  let caminho: string;
  try {
    caminho = new URL(url).pathname;
  } catch {
    return null;
  }
  const m = (metodo || 'GET').toUpperCase();

  const rest = caminho.match(/^\/rest\/v1\/(.+)$/);
  if (rest) {
    const recurso = decodeURIComponent(rest[1]).replace(/\/$/, '');
    if (recurso.startsWith('rpc/')) return `RPC ${recurso.slice(4)}`;
    return `${m} ${recurso}`;
  }

  const storage = caminho.match(/^\/storage\/v1\/object\/(?:(sign|public|authenticated|list|info|upload\/sign)\/)?([^/]+)/);
  if (storage) {
    const [, tipo, bucket] = storage;
    const op =
      tipo === 'sign' ? 'assinar'
        : tipo === 'list' ? 'listar'
          : tipo === 'upload/sign' ? 'enviar'
            : m === 'POST' || m === 'PUT' ? 'enviar'
              : m === 'DELETE' ? 'remover'
                : 'baixar';
    return `STORAGE ${op} ${bucket}`;
  }

  const auth = caminho.match(/^\/auth\/v1\/([^/]+)/);
  if (auth) return `AUTH ${auth[1]}`;

  const funcao = caminho.match(/^\/functions\/v1\/([^/]+)/);
  if (funcao) return `FUNÇÃO ${funcao[1]}`;

  return null;
}

function novaPagina(): DadosPagina {
  return { v: 0, n: 0, ms: 0, l: 0, e: 0, b: 0, tv: 0, tms: 0 };
}

export class AcumuladorDesempenho {
  private s: SnapshotDesempenho;

  constructor(inicio: number) {
    this.s = AcumuladorDesempenho.vazio(inicio);
  }

  static vazio(inicio: number): SnapshotDesempenho {
    return {
      inicio,
      fim: inicio,
      requisicoes: 0,
      tempo_ms: 0,
      lentas: 0,
      erros: 0,
      bytes: 0,
      travamentos: 0,
      travamento_ms: 0,
      travamento_max_ms: 0,
      storage_n: 0,
      storage_bytes: 0,
      endpoints: {},
      paginas: {},
    };
  }

  private pagina(chave: string): DadosPagina {
    const existente = this.s.paginas[chave];
    if (existente) return existente;
    const destino = Object.keys(this.s.paginas).length >= MAX_PAGINAS ? CHAVE_OUTROS : chave;
    return (this.s.paginas[destino] ??= novaPagina());
  }

  private endpoint(chave: string): DadosEndpoint {
    const existente = this.s.endpoints[chave];
    if (existente) return existente;
    const destino = Object.keys(this.s.endpoints).length >= MAX_ENDPOINTS ? CHAVE_OUTROS : chave;
    return (this.s.endpoints[destino] ??= { n: 0, ms: 0, mx: 0, l: 0, e: 0, b: 0, p: {} });
  }

  registrarChamada(c: ChamadaMedida): void {
    const ms = Math.max(0, Math.round(c.ms));
    const bytes = Math.max(0, Math.round(c.bytes ?? 0));
    const lenta = ms >= LIMITE_LENTA_MS;

    this.s.requisicoes += 1;
    this.s.tempo_ms += ms;
    this.s.bytes += bytes;
    if (lenta) this.s.lentas += 1;
    if (c.erro) this.s.erros += 1;

    const e = this.endpoint(c.endpoint);
    e.n += 1;
    e.ms += ms;
    e.mx = Math.max(e.mx, ms);
    e.b += bytes;
    if (lenta) e.l += 1;
    if (c.erro) e.e += 1;
    if (e.p[c.pagina] !== undefined) e.p[c.pagina] += 1;
    else if (Object.keys(e.p).length < MAX_PAGINAS_POR_ENDPOINT) e.p[c.pagina] = 1;

    const p = this.pagina(c.pagina);
    p.n += 1;
    p.ms += ms;
    p.b += bytes;
    if (lenta) p.l += 1;
    if (c.erro) p.e += 1;
  }

  /** Bytes que só chegam depois (corpo lido à parte, sem Content-Length). */
  adicionarBytes(endpoint: string, pagina: string, bytes: number): void {
    const b = Math.max(0, Math.round(bytes));
    if (!b) return;
    this.s.bytes += b;
    const e = this.s.endpoints[endpoint] ?? this.s.endpoints[CHAVE_OUTROS];
    if (e) e.b += b;
    const p = this.s.paginas[pagina] ?? this.s.paginas[CHAVE_OUTROS];
    if (p) p.b += b;
  }

  registrarTravamento(ms: number, pagina: string): void {
    const d = Math.round(ms);
    if (d < LIMITE_TRAVAMENTO_MS) return;
    this.s.travamentos += 1;
    this.s.travamento_ms += d;
    this.s.travamento_max_ms = Math.max(this.s.travamento_max_ms, d);
    const p = this.pagina(pagina);
    p.tv += 1;
    p.tms += d;
  }

  registrarVisita(pagina: string): void {
    this.pagina(pagina).v += 1;
  }

  registrarArquivo(bytes: number): void {
    this.s.storage_n += 1;
    this.s.storage_bytes += Math.max(0, Math.round(bytes));
  }

  temDados(): boolean {
    return this.s.requisicoes > 0 || this.s.travamentos > 0 || this.s.storage_n > 0 || Object.keys(this.s.paginas).length > 0;
  }

  /** Devolve a janela fechada e começa outra. */
  extrair(agora: number): SnapshotDesempenho {
    const fechado = { ...this.s, fim: agora };
    this.s = AcumuladorDesempenho.vazio(agora);
    return fechado;
  }

  /** Devolve ao acumulador uma janela que não conseguiu subir. */
  mesclar(o: SnapshotDesempenho): void {
    const s = this.s;
    s.inicio = Math.min(s.inicio, o.inicio);
    s.requisicoes += o.requisicoes;
    s.tempo_ms += o.tempo_ms;
    s.lentas += o.lentas;
    s.erros += o.erros;
    s.bytes += o.bytes;
    s.travamentos += o.travamentos;
    s.travamento_ms += o.travamento_ms;
    s.travamento_max_ms = Math.max(s.travamento_max_ms, o.travamento_max_ms);
    s.storage_n += o.storage_n;
    s.storage_bytes += o.storage_bytes;

    for (const [chave, d] of Object.entries(o.endpoints || {})) {
      const e = this.endpoint(chave);
      e.n += d.n;
      e.ms += d.ms;
      e.mx = Math.max(e.mx, d.mx);
      e.l += d.l;
      e.e += d.e;
      e.b += d.b || 0;
      for (const [pg, n] of Object.entries(d.p || {})) {
        if (e.p[pg] !== undefined) e.p[pg] += n;
        else if (Object.keys(e.p).length < MAX_PAGINAS_POR_ENDPOINT) e.p[pg] = n;
      }
    }
    for (const [chave, d] of Object.entries(o.paginas || {})) {
      const p = this.pagina(chave);
      p.v += d.v || 0;
      p.n += d.n;
      p.ms += d.ms;
      p.l += d.l;
      p.e += d.e;
      p.b += d.b || 0;
      p.tv += d.tv;
      p.tms += d.tms;
    }
  }
}
