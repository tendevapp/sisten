/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Aplicar a versão nova do app sem ninguém precisar recarregar.
 *
 * O service worker se atualiza sozinho (vite-plugin-pwa `autoUpdate`), mas a
 * aba aberta segue com o JavaScript antigo até recarregar — e o navegador só
 * procura versão nova ao navegar ou a cada 24 h. Monitor de Desempenho,
 * 25–26/11/2026: aparelhos ainda liam a view pesada de requisições
 * (~4 MB por leitura) dois dias depois da troca para a cópia pronta; a TV
 * nunca recarrega. Correções (como a do app travado em rede muda) não
 * chegavam a quem mais precisava.
 *
 * Agora: procura versão a cada 30 min e ao voltar à tela; quando a nova
 * assume, recarrega num momento seguro (`momentoDeAtualizar`).
 */

/** Escondida por menos que isto é câmera/outro app rápido: recarregar perderia o preenchimento. */
export const OCULTA_MINIMO_MS = 15 * 60_000;
const VERIFICAR_A_CADA_MS = 30 * 60_000;

export type MotivoAvaliacao = 'tick' | 'navegacao' | 'voltou';

export function momentoDeAtualizar(p: {
  versaoNovaPronta: boolean;
  ehTv: boolean;
  motivo: MotivoAvaliacao;
  /** Há quanto tempo a página está (ou ficou, se acabou de voltar) escondida. */
  ocultaHaMs: number;
  visivel: boolean;
}): boolean {
  if (!p.versaoNovaPronta) return false;
  if (p.ehTv) return true;
  if (p.motivo === 'navegacao') return true;
  if (p.motivo === 'voltou') return p.ocultaHaMs >= OCULTA_MINIMO_MS;
  return !p.visivel && p.ocultaHaMs >= OCULTA_MINIMO_MS;
}

// ---------------------------------------------------------------------------
// Borda (service worker, visibilidade) — sem teste de unidade.
// ---------------------------------------------------------------------------

let versaoNovaPronta = false;
let ocultaDesde: number | null = null;
let ehTvAtual = () => false;

function recarregar(): void {
  try { window.location.reload(); } catch { /* ignora */ }
}

function avaliar(motivo: MotivoAvaliacao, ocultaHaMs?: number): boolean {
  const visivel = document.visibilityState === 'visible';
  const ha = ocultaHaMs ?? (ocultaDesde !== null ? Date.now() - ocultaDesde : 0);
  const sim = momentoDeAtualizar({ versaoNovaPronta, ehTv: ehTvAtual(), motivo, ocultaHaMs: ha, visivel });
  if (sim) recarregar();
  return sim;
}

/**
 * Troca de tela no app: com versão nova pronta, faz a navegação e recarrega
 * (a pessoa já está saindo da tela atual). Devolve se recarregou.
 */
export function navegarComAtualizacao(navegar: () => void): boolean {
  if (!momentoDeAtualizar({ versaoNovaPronta, ehTv: ehTvAtual(), motivo: 'navegacao', ocultaHaMs: 0, visivel: true })) return false;
  navegar();
  recarregar();
  return true;
}

export function iniciarAtualizacaoApp(opcoes: { ehTv: () => boolean }): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  ehTvAtual = opcoes.ehTv;
  // Primeira instalação também troca o controlador: só é "versão nova" se já havia um.
  const tinhaControlador = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!tinhaControlador) return;
    versaoNovaPronta = true;
    avaliar('tick');
  });

  const procurar = () => {
    navigator.serviceWorker.getRegistration().then(r => r?.update()).catch(() => {});
  };
  window.setInterval(() => { procurar(); avaliar('tick'); }, VERIFICAR_A_CADA_MS);
  // Timers de aba escondida rodam no máx. 1×/min: confere de minuto em minuto.
  window.setInterval(() => { if (document.visibilityState === 'hidden') avaliar('tick'); }, 60_000);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      ocultaDesde = Date.now();
      return;
    }
    const ficou = ocultaDesde !== null ? Date.now() - ocultaDesde : 0;
    ocultaDesde = null;
    if (!avaliar('voltou', ficou)) procurar();
  });
}
