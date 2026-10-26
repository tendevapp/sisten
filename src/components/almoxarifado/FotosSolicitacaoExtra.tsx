/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Fotos dos itens e assinatura de quem retira, na Solicitação Extraordinária.
 *
 * - `SeletorFotosSolExtra`: câmera/galeria; cada foto passa por
 *   `prepararFotoCarimbada` (1600px, JPEG, data/hora na imagem) antes de
 *   subir — regra 1 do CLAUDE.md.
 * - `GaleriaFotosSolExtra`: miniaturas que abrem no visualizador do app.
 * - `CampoAssinaturaRetirante`: assinatura desenhada na tela (PNG), com prévia
 *   e "Refazer".
 */

import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { Camera, Loader2, PenTool, RotateCcw, X } from 'lucide-react';
import { useToast } from '../ui/Toast';
import { useLightbox } from '../ui/Lightbox';
import SignaturePadModal from '../portaria/SignaturePadModal';
import { prepararFotoCarimbada } from '../../lib/carimboFoto';
import { AnexoInvalidoError, type PreparedAttachment } from '../../lib/imageCompression';
import { MAX_FOTOS_SOL_EXTRA, type FotoSolExtra } from '../../lib/solicitacaoExtra';
import { assinarFotosSolExtra } from '../../lib/solicitacaoExtraApi';

/** URLs assinadas das fotos gravadas (somem quando a lista muda). */
function useUrlsFotos(fotos: FotoSolExtra[]): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const chave = fotos.map(f => f.path).join('|');
  useEffect(() => {
    let ativo = true;
    if (!chave) { setUrls({}); return; }
    assinarFotosSolExtra(chave.split('|')).then(m => { if (ativo) setUrls(m); }).catch(() => { if (ativo) setUrls({}); });
    return () => { ativo = false; };
  }, [chave]);
  return urls;
}

const miniatura = 'h-16 w-16 rounded-lg border border-slate-200 object-cover dark:border-slate-700';

export function SeletorFotosSolExtra({
  existentes, onRemoverExistente, novas, setNovas, disabled,
}: {
  existentes: FotoSolExtra[];
  onRemoverExistente: (path: string) => void;
  novas: PreparedAttachment[];
  setNovas: Dispatch<SetStateAction<PreparedAttachment[]>>;
  disabled?: boolean;
}) {
  const toast = useToast();
  const lightbox = useLightbox();
  const urls = useUrlsFotos(existentes);
  const [preparando, setPreparando] = useState(false);
  const total = existentes.length + novas.length;

  // A prévia é Object URL: revoga ao sair.
  useEffect(() => () => novas.forEach(n => URL.revokeObjectURL(n.previewUrl)), []); // eslint-disable-line react-hooks/exhaustive-deps

  const anexar = async (lista: FileList | null) => {
    if (!lista?.length) return;
    const restante = MAX_FOTOS_SOL_EXTRA - total;
    if (restante <= 0) { toast.warning(`Máximo de ${MAX_FOTOS_SOL_EXTRA} fotos.`); return; }
    setPreparando(true);
    try {
      for (const file of Array.from(lista).slice(0, restante)) {
        if (!file.type.startsWith('image/')) { toast.warning(`${file.name}: só fotos.`); continue; }
        try {
          const preparado = await prepararFotoCarimbada(file);
          setNovas(a => [...a, preparado]);
        } catch (err) {
          toast.error(err instanceof AnexoInvalidoError ? err.message : `Não foi possível anexar ${file.name}.`);
        }
      }
    } finally {
      setPreparando(false);
    }
  };

  const todasUrls = [...existentes.map(f => urls[f.path]).filter(Boolean), ...novas.map(n => n.previewUrl)];

  return (
    <div className="flex flex-wrap items-center gap-2">
      {existentes.map((f, i) => (
        <div key={f.path} className="relative">
          <button type="button" onClick={() => lightbox.abrir(todasUrls, i)} className="block">
            {urls[f.path] ? <img src={urls[f.path]} alt={f.nome} className={miniatura} /> : <span className={`${miniatura} block bg-slate-100 dark:bg-slate-800`} />}
          </button>
          {!disabled && (
            <button type="button" onClick={() => onRemoverExistente(f.path)} aria-label="Remover foto" className="absolute -right-1.5 -top-1.5 rounded-full bg-rose-500 p-0.5 text-white">
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      ))}
      {novas.map((n, i) => (
        <div key={n.previewUrl} className="relative">
          <button type="button" onClick={() => lightbox.abrir(todasUrls, existentes.filter(f => urls[f.path]).length + i)} className="block">
            <img src={n.previewUrl} alt={n.name} className={miniatura} />
          </button>
          {!disabled && (
            <button
              type="button"
              onClick={() => { URL.revokeObjectURL(n.previewUrl); setNovas(x => x.filter(y => y !== n)); }}
              aria-label="Remover foto"
              className="absolute -right-1.5 -top-1.5 rounded-full bg-rose-500 p-0.5 text-white"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      ))}
      {total < MAX_FOTOS_SOL_EXTRA && !disabled && (
        <label className="flex h-16 w-16 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-lg border-2 border-dashed border-slate-300 text-slate-500 hover:border-blue-400 hover:text-blue-700 dark:border-slate-700 dark:text-slate-400">
          {preparando ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
          <span className="text-[9px] font-bold">{total ? `${total}/${MAX_FOTOS_SOL_EXTRA}` : 'Foto'}</span>
          <input type="file" accept="image/*" capture="environment" multiple hidden onChange={e => { void anexar(e.target.files); e.target.value = ''; }} />
        </label>
      )}
      {lightbox.elemento}
    </div>
  );
}

/** Fotos gravadas, só para ver. */
export function GaleriaFotosSolExtra({ fotos }: { fotos: FotoSolExtra[] }) {
  const lightbox = useLightbox();
  const urls = useUrlsFotos(fotos);
  if (!fotos.length) return null;
  const lista = fotos.map(f => urls[f.path]).filter(Boolean);
  return (
    <div className="flex flex-wrap gap-2">
      {fotos.map(f => (
        <button key={f.path} type="button" onClick={() => lightbox.abrir(lista, Math.max(0, lista.indexOf(urls[f.path])))} className="block">
          {urls[f.path] ? <img src={urls[f.path]} alt={f.nome} className={miniatura} /> : <span className={`${miniatura} block animate-pulse bg-slate-100 dark:bg-slate-800`} />}
        </button>
      ))}
      {lightbox.elemento}
    </div>
  );
}

/** Assinatura desenhada por quem retira. */
export function CampoAssinaturaRetirante({
  valor, nome, onChange, disabled,
}: {
  valor: string | null;
  nome?: string | null;
  onChange: (dataUrl: string | null) => void;
  disabled?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  return (
    <div>
      {valor ? (
        <div className="flex items-center gap-3">
          <img src={valor} alt="Assinatura de quem retira" className="h-16 max-w-[14rem] rounded-lg border border-slate-200 bg-white object-contain p-1 dark:border-slate-700" />
          {!disabled && (
            <div className="flex flex-col gap-1">
              <button type="button" onClick={() => setAberto(true)} className="inline-flex items-center gap-1 text-xs font-bold text-blue-700 hover:underline dark:text-blue-400">
                <RotateCcw className="h-3.5 w-3.5" /> Refazer
              </button>
              <button type="button" onClick={() => onChange(null)} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-rose-600">
                <X className="h-3.5 w-3.5" /> Remover
              </button>
            </div>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAberto(true)}
          disabled={disabled}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 px-4 py-3 text-sm font-bold text-slate-600 hover:border-blue-400 hover:text-blue-700 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300"
        >
          <PenTool className="h-4 w-4" /> Coletar assinatura de quem retira
        </button>
      )}
      <SignaturePadModal
        isOpen={aberto}
        onClose={() => setAberto(false)}
        onSave={dataUrl => { onChange(dataUrl); setAberto(false); }}
        title="Assinatura de quem retira"
        subtitle={nome ? `${nome} — assine no campo abaixo` : 'Assine no campo abaixo com o dedo ou o mouse'}
      />
    </div>
  );
}
