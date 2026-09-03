/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Dropdown de sugestões para o formulário "Chegada de Transporte": conforme
 * o vigilante digita a placa, empresa ou motorista, busca lançamentos
 * anteriores; ao selecionar um, o formulário é preenchido de uma vez.
 *
 * Renderize dentro de um contêiner `position: relative` logo após o <input>.
 */

import { useEffect, useRef, useState } from 'react';
import { History } from 'lucide-react';
import type { PortRegistroTransporte } from '../../types';
import * as api from '../../lib/portariaApi';

interface Props {
  /** Valor atual do campo (o que foi digitado). */
  termo: string;
  /** Chamado com o registro escolhido — o pai preenche o formulário. */
  aoSelecionar: (registro: PortRegistroTransporte) => void;
  /** `false` desliga a busca (ex.: logo após um preenchimento). Padrão: true. */
  ativo?: boolean;
}

export default function SugestoesChegadaTransporte({ termo, aoSelecionar, ativo = true }: Props) {
  const [itens, setItens] = useState<PortRegistroTransporte[]>([]);
  const [aberto, setAberto] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const t = termo.trim();
    if (!ativo || t.length < 2) {
      setItens([]);
      setAberto(false);
      return;
    }

    let vivo = true;
    const id = window.setTimeout(async () => {
      try {
        const resultados = await api.buscarTransportesAnteriores(t);
        if (!vivo) return;
        setItens(resultados);
        setAberto(resultados.length > 0);
      } catch {
        if (vivo) {
          setItens([]);
          setAberto(false);
        }
      }
    }, 250);

    return () => {
      vivo = false;
      window.clearTimeout(id);
    };
  }, [termo, ativo]);

  useEffect(() => {
    if (!aberto) return;
    const aoClicarFora = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setAberto(false);
      }
    };
    document.addEventListener('mousedown', aoClicarFora);
    return () => document.removeEventListener('mousedown', aoClicarFora);
  }, [aberto]);

  if (!aberto || itens.length === 0) return null;

  return (
    <div
      ref={boxRef}
      className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900"
    >
      <div className="flex items-center gap-1.5 border-b border-slate-100 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:border-slate-800 dark:text-slate-500">
        <History className="h-3 w-3" />
        Chegadas já registradas — clique para preencher
      </div>
      <ul className="max-h-56 overflow-y-auto py-1 text-sm">
        {itens.map((r) => (
          <li key={r.id}>
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                setAberto(false);
                aoSelecionar(r);
              }}
              className="flex w-full flex-col gap-0.5 px-3 py-2 text-left hover:bg-blue-50 dark:hover:bg-blue-950/40"
            >
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs font-bold text-slate-900 dark:text-slate-100">{r.placa}</span>
                <span className="text-slate-700 dark:text-slate-300">{r.empresa}</span>
                {r.rota && (
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    {r.rota}
                  </span>
                )}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {r.motorista} · {r.veiculo} · últ. lançamento {r.data.split('-').reverse().join('/')}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
