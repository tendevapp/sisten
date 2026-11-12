/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Borda do Monitor de Desempenho no navegador: mede as chamadas ao Supabase
 * (`medirFetch`, que envolve o fetch do cliente), os travamentos da tela (long
 * tasks), os arquivos do Storage carregados por <img>/PDF e as visitas a cada
 * página. Tudo cai no acumulador único deste módulo; quem manda ao servidor é
 * `reporterDesempenho.ts`.
 *
 * Fica separado do reporter porque `db/supabaseClient.ts` importa este arquivo
 * e o reporter importa o cliente — juntos virariam importação circular.
 *
 * Custo: um `performance.now()` por chamada e, quando a resposta não traz
 * Content-Length (PostgREST comprimido), uma cópia do corpo lida em paralelo
 * só para contar os bytes.
 */

import { AcumuladorDesempenho, chaveEndpoint, normalizarPagina } from './acumulador';

const URL_SUPABASE = String(import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const RPC_PROPRIA = 'RPC registrar_desempenho_cliente';

export const acumuladorDesempenho = new AcumuladorDesempenho(Date.now());

let ultimaPagina = '';

/** Página atual (normalizada); conta uma visita quando ela muda. */
export function paginaAtual(): string {
  const pagina = typeof window === 'undefined' ? '/' : normalizarPagina(window.location.pathname);
  if (pagina !== ultimaPagina) {
    ultimaPagina = pagina;
    acumuladorDesempenho.registrarVisita(pagina);
  }
  return pagina;
}

function bytesDoCabecalho(resposta: Response): number | null {
  const valor = resposta.headers.get('content-length');
  if (valor === null) return null;
  const n = Number(valor);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function medirFetch(base: typeof fetch): typeof fetch {
  return async (entrada: RequestInfo | URL, init?: RequestInit) => {
    const url = entrada instanceof Request ? entrada.url : String(entrada);
    const metodo = init?.method || (entrada instanceof Request ? entrada.method : 'GET');
    const endpoint = chaveEndpoint(url, metodo, URL_SUPABASE);
    if (!endpoint || endpoint === RPC_PROPRIA) return base(entrada, init);

    const pagina = paginaAtual();
    const inicio = performance.now();
    try {
      const resposta = await base(entrada, init);
      const ms = performance.now() - inicio;
      const erro = resposta.status >= 500 || resposta.status === 429 || resposta.status === 0;
      const tamanho = bytesDoCabecalho(resposta);
      acumuladorDesempenho.registrarChamada({ endpoint, pagina, ms, erro, bytes: tamanho ?? 0 });
      if (tamanho === null && resposta.body && resposta.status !== 204 && metodo.toUpperCase() !== 'HEAD') {
        try {
          void resposta
            .clone()
            .blob()
            .then(b => acumuladorDesempenho.adicionarBytes(endpoint, pagina, b.size))
            .catch(() => {});
        } catch {
          /* corpo já consumido: fica sem bytes */
        }
      }
      return resposta;
    } catch (e) {
      // Abortada pelo próprio app (troca de tela) não é erro do servidor.
      const abortada = e instanceof DOMException && e.name === 'AbortError';
      acumuladorDesempenho.registrarChamada({ endpoint, pagina, ms: performance.now() - inicio, erro: !abortada });
      throw e;
    }
  };
}

let observando = false;

/** Liga os observadores de travamento e de arquivos do Storage (uma vez). */
export function observarNavegador(): void {
  if (observando || typeof window === 'undefined' || typeof PerformanceObserver === 'undefined') return;
  observando = true;
  const tipos = PerformanceObserver.supportedEntryTypes || [];

  if (tipos.includes('longtask')) {
    try {
      new PerformanceObserver(lista => {
        const pagina = paginaAtual();
        for (const entrada of lista.getEntries()) acumuladorDesempenho.registrarTravamento(entrada.duration, pagina);
      }).observe({ type: 'longtask', buffered: true });
    } catch {
      /* navegador sem long tasks (Safari): fica sem travamentos */
    }
  }

  if (tipos.includes('resource') && URL_SUPABASE) {
    const prefixo = `${URL_SUPABASE}/storage/v1/`;
    try {
      new PerformanceObserver(lista => {
        for (const e of lista.getEntries() as PerformanceResourceTiming[]) {
          // As chamadas via fetch já passaram pelo medirFetch.
          if (!e.name.startsWith(prefixo) || e.initiatorType === 'fetch' || e.initiatorType === 'xmlhttprequest') continue;
          // Sem Timing-Allow-Origin o navegador zera os tamanhos: conta o arquivo, sem bytes.
          acumuladorDesempenho.registrarArquivo(e.transferSize || e.encodedBodySize || 0);
        }
      }).observe({ type: 'resource', buffered: false });
    } catch {
      /* sem resource timing */
    }
  }
}
