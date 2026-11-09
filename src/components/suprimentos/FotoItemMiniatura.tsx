/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Miniatura da foto do item ao lado da descrição, na Central de Compras.
 *
 * - Uma foto: o clique abre o visualizador (`useLightbox`) com "Copiar imagem".
 * - Mais de uma: abre o álbum — grade com todas, origem de cada uma
 *   (Solicitação / Cadastro de Itens) e botão de copiar; clicar numa foto
 *   amplia no visualizador, com navegação entre elas.
 *
 * A URL só é assinada quando a linha entra na tela (a Central lista centenas
 * de itens), e a imagem carrega com `loading="lazy"`.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Copy, Image as ImageIcon, Images, Loader2 } from 'lucide-react';
import Modal, { ModalBody, ModalHeader } from '../ui/Modal';
import { useLightbox } from '../ui/Lightbox';
import { assinarFotoItem, ROTULO_ORIGEM_FOTO, type FotoItemCompra } from '../../lib/fotosItemCompra';
import { copiarImagemParaAreaDeTransferencia } from '../../lib/copiarImagem';
import { useToast } from '../ui/Toast';

const TAMANHO = { sm: 'h-10 w-10', md: 'h-14 w-14' } as const;

/** Assina a URL quando o elemento fica visível (com folga de 200 px). */
function useUrlQuandoVisivel(path: string | undefined) {
  const ref = useRef<HTMLButtonElement | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [falhou, setFalhou] = useState(false);

  useEffect(() => {
    setUrl(null);
    setFalhou(false);
    const el = ref.current;
    if (!path || !el) return;
    let cancelado = false;
    const assinar = () => {
      assinarFotoItem(path).then(u => {
        if (cancelado) return;
        if (u) setUrl(u); else setFalhou(true);
      });
    };
    if (typeof IntersectionObserver === 'undefined') {
      assinar();
      return () => { cancelado = true; };
    }
    const obs = new IntersectionObserver(entradas => {
      if (entradas.some(e => e.isIntersecting)) {
        obs.disconnect();
        assinar();
      }
    }, { rootMargin: '200px' });
    obs.observe(el);
    return () => { cancelado = true; obs.disconnect(); };
  }, [path]);

  return { ref, url, falhou };
}

export default function FotoItemMiniatura({
  fotos, titulo, tamanho = 'sm',
}: {
  fotos: FotoItemCompra[];
  /** Título do álbum — código e descrição do item. */
  titulo: string;
  tamanho?: keyof typeof TAMANHO;
}) {
  const primeira = fotos[0];
  const { ref, url, falhou } = useUrlQuandoVisivel(primeira?.path);
  const lightbox = useLightbox();
  const [albumAberto, setAlbumAberto] = useState(false);

  if (!primeira) return null;
  const varias = fotos.length > 1;

  const abrir = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (varias) { setAlbumAberto(true); return; }
    if (url) lightbox.abrir([{ url, legenda: `${ROTULO_ORIGEM_FOTO[primeira.origem]} · ${primeira.legenda}` }], 0, { copiar: true });
  };

  return (
    <>
      <button
        ref={ref}
        type="button"
        onClick={abrir}
        className={`relative shrink-0 ${TAMANHO[tamanho]} rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 overflow-hidden cursor-pointer hover:ring-2 hover:ring-[#0056c6]/40 transition-shadow`}
        title={varias ? `Ver as ${fotos.length} fotos do item` : `Ver foto (${ROTULO_ORIGEM_FOTO[primeira.origem]})`}
        aria-label={varias ? `Abrir álbum com ${fotos.length} fotos` : 'Ampliar foto do item'}
      >
        {url ? (
          <img src={url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-slate-500">
            {falhou ? <ImageIcon className="h-4 w-4" /> : <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          </span>
        )}
        {varias && (
          <span className="absolute bottom-0 right-0 flex items-center gap-0.5 rounded-tl-md bg-slate-900/75 px-1 text-[10px] font-bold leading-4 text-white">
            <Images className="h-2.5 w-2.5" />
            {fotos.length}
          </span>
        )}
      </button>

      {/* Portal + stopPropagation: o evento sintético do React sobe pela árvore
          de componentes mesmo saindo do DOM da linha, e a linha/cartão abre o
          detalhe SAP no clique. */}
      {(albumAberto || lightbox.elemento) && createPortal(
        <div onClick={e => e.stopPropagation()}>
          {albumAberto && (
            <AlbumFotosItem
              fotos={fotos}
              titulo={titulo}
              onClose={() => setAlbumAberto(false)}
              onAmpliar={(urls, indice) => lightbox.abrir(urls, indice, { copiar: true })}
            />
          )}
          {lightbox.elemento}
        </div>,
        document.body,
      )}
    </>
  );
}

function AlbumFotosItem({
  fotos, titulo, onClose, onAmpliar,
}: {
  fotos: FotoItemCompra[];
  titulo: string;
  onClose: () => void;
  onAmpliar: (imagens: { url: string; legenda: string }[], indice: number) => void;
}) {
  const toast = useToast();
  const [urls, setUrls] = useState<Array<string | null | undefined>>(() => fotos.map(() => undefined));
  const [copiada, setCopiada] = useState<number | null>(null);

  // A lista chega recriada a cada render da Central; os caminhos é que importam.
  const caminhos = fotos.map(f => f.path).join('|');
  useEffect(() => {
    let cancelado = false;
    caminhos.split('|').forEach((path, i) => {
      assinarFotoItem(path).then(u => {
        if (!cancelado) setUrls(prev => { const n = [...prev]; n[i] = u; return n; });
      });
    });
    return () => { cancelado = true; };
  }, [caminhos]);

  const ampliar = useCallback((i: number) => {
    const disponiveis = fotos
      .map((f, idx) => ({ idx, url: urls[idx], legenda: `${ROTULO_ORIGEM_FOTO[f.origem]} · ${f.legenda}` }))
      .filter((x): x is { idx: number; url: string; legenda: string } => !!x.url);
    const pos = disponiveis.findIndex(x => x.idx === i);
    if (pos >= 0) onAmpliar(disponiveis.map(({ url, legenda }) => ({ url, legenda })), pos);
  }, [fotos, urls, onAmpliar]);

  const copiar = async (i: number) => {
    const url = urls[i];
    if (!url) return;
    try {
      await copiarImagemParaAreaDeTransferencia(url);
      setCopiada(i);
      setTimeout(() => setCopiada(atual => (atual === i ? null : atual)), 2000);
    } catch (err) {
      console.error('Falha ao copiar imagem:', err);
      toast.error('Não foi possível copiar a imagem. Amplie a foto e copie manualmente.');
    }
  };

  return (
    <Modal onClose={onClose} maxWidth="max-w-3xl" ariaLabel="Fotos do item">
      <ModalHeader onClose={onClose}>
        <p className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate" title={titulo}>{titulo}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">{fotos.length} fotos</p>
      </ModalHeader>
      <ModalBody>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {fotos.map((f, i) => {
            const url = urls[i];
            return (
              <div key={f.path} className="flex flex-col gap-1.5">
                <button
                  type="button"
                  onClick={() => ampliar(i)}
                  disabled={!url}
                  className="aspect-square w-full overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 cursor-pointer hover:opacity-90 transition-opacity disabled:cursor-default"
                  title="Ampliar"
                >
                  {url ? (
                    <img src={url} alt={f.legenda} decoding="async" className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-slate-500">
                      {url === null ? <ImageIcon className="h-5 w-5" /> : <Loader2 className="h-4 w-4 animate-spin" />}
                    </span>
                  )}
                </button>
                <span
                  className={`self-start rounded px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${
                    f.origem === 'solicitacao'
                      ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300'
                      : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                  }`}
                >
                  {ROTULO_ORIGEM_FOTO[f.origem]}
                </span>
                <button
                  type="button"
                  onClick={() => copiar(i)}
                  disabled={!url}
                  className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-bold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-default ${
                    copiada === i
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400'
                      : 'bg-emerald-600 text-white hover:bg-emerald-700'
                  }`}
                >
                  {copiada === i ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copiada === i ? 'Copiada!' : 'Copiar imagem'}
                </button>
              </div>
            );
          })}
        </div>
      </ModalBody>
    </Modal>
  );
}
