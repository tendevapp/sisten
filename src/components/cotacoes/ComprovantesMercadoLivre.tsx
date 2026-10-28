import React, { useState } from 'react';
import { assinarArquivoCotacao } from '../../lib/cotacoesApi';
import type { CotacaoProcessoItem } from '../../types';
import { useLightbox } from '../ui/Lightbox';

/** Exibe o comprovante preservado de cada item ao criar o processo. */
export default function ComprovantesMercadoLivre({ itens }: { itens: CotacaoProcessoItem[] }) {
  const lb = useLightbox();
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const comPrint = itens.filter(i => i.comprovante_ml?.path);
  if (!comPrint.length) return null;

  const abrir = async (item: CotacaoProcessoItem) => {
    setCarregando(true);
    setErro('');
    try {
      const url = await assinarArquivoCotacao(item.comprovante_ml!.path);
      if (!url) throw new Error('Falha ao abrir o print.');
      lb.abrir([{ url, legenda: `RM ${item.rm ?? ''} / Item ${item.item_reqc ?? item.ri} — ${item.texto_breve ?? ''}` }], 0);
    } catch { setErro('Não foi possível abrir o print. Tente novamente.'); }
    finally { setCarregando(false); }
  };

  return <section className="space-y-2 rounded-xl border border-yellow-300 bg-yellow-50/50 p-3 dark:border-yellow-800 dark:bg-yellow-950/20">
    <p className="text-xs font-bold text-slate-700 dark:text-slate-200">Comprovantes do Mercado Livre</p>
    <div className="flex flex-wrap gap-2">
      {comPrint.map(i => <button key={i.id} type="button" disabled={carregando} onClick={() => void abrir(i)}
        className="rounded-lg border border-yellow-300 px-2 py-1 text-xs text-yellow-900 hover:bg-yellow-100 disabled:opacity-50 dark:border-yellow-700 dark:text-yellow-200">
        Ver print · RM {i.rm ?? '—'} / Item {i.item_reqc ?? i.ri}
      </button>)}
    </div>
    {erro && <p role="alert" className="text-xs text-rose-600">{erro}</p>}
    {lb.elemento}
  </section>;
}
