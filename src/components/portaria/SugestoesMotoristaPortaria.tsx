import { useEffect, useMemo, useRef } from 'react';
import { History, IdCard } from 'lucide-react';
import {
  filtrarMotoristasPortaria,
  type MotoristaSalvoPortaria,
} from '../../lib/motoristasPortaria';

interface Props {
  termo: string;
  motoristas: MotoristaSalvoPortaria[];
  aberto: boolean;
  onFechar: () => void;
  aoSelecionar: (motorista: MotoristaSalvoPortaria) => void;
}

export default function SugestoesMotoristaPortaria({
  termo,
  motoristas,
  aberto,
  onFechar,
  aoSelecionar,
}: Props) {
  const boxRef = useRef<HTMLDivElement | null>(null);

  const resultados = useMemo(
    () => filtrarMotoristasPortaria(motoristas, termo, 10),
    [motoristas, termo],
  );

  useEffect(() => {
    if (!aberto) return;
    const aoClicarFora = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        onFechar();
      }
    };
    document.addEventListener('mousedown', aoClicarFora);
    return () => document.removeEventListener('mousedown', aoClicarFora);
  }, [aberto, onFechar]);

  if (!aberto || resultados.length === 0) return null;

  return (
    <div
      ref={boxRef}
      className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900"
    >
      <div className="flex items-center gap-1.5 border-b border-slate-100 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:text-slate-400">
        <History className="h-3 w-3" />
        Motoristas já lançados — clique para preencher
      </div>
      <ul className="max-h-56 overflow-y-auto py-1 text-sm">
        {resultados.map((m) => (
          <li key={m.nome}>
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                onFechar();
                aoSelecionar(m);
              }}
              className="flex w-full flex-col gap-0.5 px-3 py-2 text-left hover:bg-blue-50 dark:hover:bg-blue-950/40"
            >
              <span className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                  {m.nome}
                </span>
                {m.docCompleto ? (
                  <span className="inline-flex items-center gap-1 rounded bg-blue-50 px-1.5 py-0.5 font-mono text-[10px] font-bold text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
                    <IdCard className="h-3 w-3" />
                    {m.docCompleto}
                  </span>
                ) : (
                  <span className="text-[10px] text-slate-400">Sem documento</span>
                )}
              </span>
              {(m.empresa || m.ultimaData) && (
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  {[
                    m.empresa,
                    m.ultimaData ? `últ. registro ${m.ultimaData.split('-').reverse().join('/')}` : '',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

