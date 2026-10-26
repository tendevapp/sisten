/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Renderiza as paginas de um PDF em <canvas> via pdf.js.
 * Usado no celular, onde o navegador (Chrome Android, Safari iOS) nao exibe
 * PDF dentro de iframe e mostra so um botao "Abrir".
 */

import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';

interface Props {
  bytes: Uint8Array;
}

/** true quando o navegador nao consegue mostrar PDF embutido (tipico de celular). */
export function navegadorSemPdfEmbutido(): boolean {
  if (typeof navigator === 'undefined') return false;
  if (navigator.pdfViewerEnabled === false) return true;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export default function PdfPaginasCanvas({ bytes }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    let tarefa: { destroy: () => Promise<void> } | null = null;
    const container = containerRef.current;
    if (!container) return;
    container.replaceChildren();
    setCarregando(true);
    setErro(null);

    (async () => {
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
      const worker = (await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')).default;
      pdfjs.GlobalWorkerOptions.workerSrc = worker;

      // pdf.js transfere o buffer ao worker; passa uma copia para nao esvaziar os bytes do modal.
      const carga = pdfjs.getDocument({ data: bytes.slice() });
      tarefa = carga;
      const pdf = await carga.promise;
      const largura = container.clientWidth || window.innerWidth;
      const escalaTela = Math.min(window.devicePixelRatio || 1, 2);

      for (let n = 1; n <= pdf.numPages; n++) {
        if (!ativo) return;
        const pagina = await pdf.getPage(n);
        const base = pagina.getViewport({ scale: 1 });
        const escala = largura / base.width;
        const viewport = pagina.getViewport({ scale: escala * escalaTela });

        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width = '100%';
        canvas.style.height = 'auto';
        canvas.className = 'mb-2 bg-white shadow';
        container.appendChild(canvas);

        await pagina.render({ canvas, viewport }).promise;
        if (n === 1) setCarregando(false);
      }
      setCarregando(false);
    })().catch((e: unknown) => {
      console.error('Falha ao desenhar o PDF no celular:', e);
      if (ativo) {
        setErro('Nao foi possivel exibir o PDF aqui. Use "Nova aba" ou "Baixar PDF".');
        setCarregando(false);
      }
    });

    return () => {
      ativo = false;
      void tarefa?.destroy();
    };
  }, [bytes]);

  return (
    <div className="h-full min-h-[70vh] w-full overflow-auto p-2">
      {carregando && (
        <div className="flex items-center justify-center gap-2 py-10 text-xs font-semibold text-slate-600 dark:text-slate-300">
          <Loader2 className="h-5 w-5 animate-spin text-blue-600" /> Montando visualizacao…
        </div>
      )}
      {erro && <p className="p-4 text-center text-xs text-slate-600 dark:text-slate-300">{erro}</p>}
      <div ref={containerRef} />
    </div>
  );
}
