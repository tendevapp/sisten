/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Aviso de versão nova do SISTEN publicada.
 *
 * Uma aba aberta antes do deploy segue rodando o código antigo até alguém
 * recarregar — em 28/10/2026 as abas antigas continuaram fazendo as consultas
 * que tinham derrubado o banco horas depois da correção estar no ar. A cada
 * 10 min (com a aba visível) compara o pacote principal desta página com o do
 * `index.html` publicado; se mudou, pede ao service worker para atualizar e
 * mostra a faixa "Recarregar". Não recarrega sozinho: pode haver formulário
 * preenchido na tela.
 */

import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';

const INTERVALO_MS = 10 * 60_000;

/** `src` do script de entrada (`/assets/index-<hash>.js`) num HTML. */
function scriptPrincipal(html: string): string | null {
  return html.match(/<script[^>]+type="module"[^>]+src="([^"]*\/assets\/index-[^"]+\.js)"/)?.[1] ?? null;
}

function scriptDestaPagina(): string | null {
  const el = document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/index-"]');
  return el ? new URL(el.src).pathname : null;
}

export default function NovaVersaoAviso() {
  const [novaVersao, setNovaVersao] = useState(false);

  useEffect(() => {
    if (import.meta.env.DEV) return;
    const atual = scriptDestaPagina();
    if (!atual) return;

    const conferir = async () => {
      if (document.hidden) return;
      try {
        const resp = await fetch('/', { cache: 'no-store' });
        if (!resp.ok) return;
        const publicado = scriptPrincipal(await resp.text());
        if (publicado && new URL(publicado, location.origin).pathname !== atual) {
          setNovaVersao(true);
          navigator.serviceWorker?.getRegistration().then(r => r?.update()).catch(() => {});
        }
      } catch {
        /* sem rede: confere na próxima */
      }
    };

    const timer = window.setInterval(conferir, INTERVALO_MS);
    document.addEventListener('visibilitychange', conferir);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', conferir); };
  }, []);

  if (!novaVersao) return null;
  return (
    <div className="fixed bottom-4 left-1/2 z-[120] -translate-x-1/2 flex items-center gap-3 rounded-xl border border-blue-300 bg-white px-4 py-2.5 text-sm shadow-lg dark:border-blue-800 dark:bg-slate-900">
      <span className="font-semibold text-slate-800 dark:text-slate-100">Há uma versão nova do SISTEN.</span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="inline-flex items-center gap-1.5 rounded-lg bg-[#0056c6] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#004bb0]"
      >
        <RefreshCw className="h-3.5 w-3.5" /> Recarregar
      </button>
    </div>
  );
}
