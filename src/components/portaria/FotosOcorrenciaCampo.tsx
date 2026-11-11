/**
 * Campo de fotos do lançamento do Relatório de Ocorrências: câmera ou galeria,
 * várias fotos, miniaturas com remover. As fotos novas ficam como File até o
 * salvar — a compressão acontece no upload (subirFotosOcorrencia →
 * comprimirImagemUpload), nunca o arquivo cru da câmera.
 */
import React, { useRef } from 'react';
import { Camera, Loader2, Trash2, Upload } from 'lucide-react';
import type { PortAlcoolemiaFoto } from '../../types';

export interface FotoNova {
  key: string;
  file: File;
  /** Object URL para a prévia — revogar ao descartar. */
  url: string;
}

interface Props {
  titulo: string;
  ajuda?: string;
  obrigatorio?: boolean;
  /** Foto antiga em base64 (`foto_url`), só no registro principal. */
  legado?: { url: string | null; carregando: boolean; onRemover: () => void } | null;
  salvas: PortAlcoolemiaFoto[];
  novas: FotoNova[];
  onAdicionar: (arquivos: File[]) => void;
  onRemoverSalva: (id: string) => void;
  onRemoverNova: (key: string) => void;
  onAbrir: (urls: string[], indice: number) => void;
  tom?: 'purple' | 'emerald';
}

export default function FotosOcorrenciaCampo({
  titulo, ajuda, obrigatorio, legado, salvas, novas, onAdicionar, onRemoverSalva, onRemoverNova, onAbrir, tom = 'purple',
}: Props) {
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const galeriaRef = useRef<HTMLInputElement | null>(null);

  const escolher = (e: React.ChangeEvent<HTMLInputElement>) => {
    const arquivos = Array.from(e.target.files || []);
    e.target.value = '';
    if (arquivos.length) onAdicionar(arquivos);
  };

  const itens: { chave: string; url: string; carregando?: boolean; remover: () => void; rotulo: string }[] = [
    ...(legado ? [{ chave: 'legado', url: legado.url || '', carregando: legado.carregando, remover: legado.onRemover, rotulo: 'Remover foto anterior' }] : []),
    ...salvas.map((f, i) => ({ chave: `s-${f.id}`, url: f.preview_url || '', remover: () => onRemoverSalva(f.id), rotulo: `Remover foto ${i + 1}` })),
    ...novas.map((f, i) => ({ chave: `n-${f.key}`, url: f.url, remover: () => onRemoverNova(f.key), rotulo: `Remover foto nova ${i + 1}` })),
  ];
  const urls = itens.map((i) => i.url);
  const botaoPrincipal = tom === 'emerald'
    ? 'bg-emerald-600 hover:bg-emerald-500'
    : 'bg-purple-600 hover:bg-purple-500';

  return (
    <div>
      <p className="mb-1 text-xs font-bold text-slate-700 dark:text-slate-300">
        {titulo} {obrigatorio ? <span className="text-rose-600">*</span> : <span className="font-medium text-slate-500">(opcional)</span>}
      </p>
      {ajuda && <p className="mb-2 text-[11px] text-slate-500 dark:text-slate-400">{ajuda}</p>}

      {itens.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-2">
          {itens.map((it, i) => (
            <li key={it.chave} className="relative">
              <button
                type="button"
                onClick={() => it.url && onAbrir(urls.filter(Boolean), urls.filter(Boolean).indexOf(it.url))}
                aria-label={`Ver foto ${i + 1}`}
                className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800"
              >
                {it.carregando ? (
                  <Loader2 className="h-4 w-4 animate-spin text-slate-500" />
                ) : it.url ? (
                  <img src={it.url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Camera className="h-5 w-5 text-slate-400" aria-hidden="true" />
                )}
              </button>
              <button
                type="button"
                onClick={it.remover}
                aria-label={it.rotulo}
                className="absolute -right-1.5 -top-1.5 rounded-full border border-rose-200 bg-white p-1 text-rose-600 shadow-sm hover:bg-rose-50 dark:border-rose-900 dark:bg-slate-900 dark:hover:bg-rose-950/50"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => cameraRef.current?.click()}
          className={`inline-flex min-h-10 items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold text-white shadow-xs active:scale-95 ${botaoPrincipal}`}
        >
          <Camera className="h-4 w-4" />
          Tirar foto
        </button>
        <button
          type="button"
          onClick={() => galeriaRef.current?.click()}
          className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
        >
          <Upload className="h-4 w-4 text-purple-600 dark:text-purple-400" />
          Galeria
        </button>
      </div>

      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={escolher} />
      <input ref={galeriaRef} type="file" accept="image/*" multiple className="hidden" onChange={escolher} />
    </div>
  );
}
