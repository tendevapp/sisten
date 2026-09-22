/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Ficha de EPI — FRM.SEG-0008 (Termo de Responsabilidade de EPI).
 * Três abas: lançar uma entrega, consultar as fichas emitidas e analisar o
 * consumo que as fichas acumulam.
 */

import { useState } from 'react';
import { BarChart3, ChevronLeft, ClipboardList, HardHat, Plus } from 'lucide-react';
import type { Profile } from '../../types';
import NovaFichaEpi from '../../components/ssma/fichaEpi/NovaFichaEpi';
import FichasEpiLista from '../../components/ssma/fichaEpi/FichasEpiLista';
import AnaliseConsumoEpi from '../../components/ssma/fichaEpi/AnaliseConsumoEpi';
import type { ColaboradorFichaEpi } from '../../lib/ssmaFichaEpiApi';

interface Props {
  user: Profile;
  onBack: () => void;
}

type Aba = 'nova' | 'fichas' | 'analise';

const ABAS: { id: Aba; rotulo: string; icone: typeof Plus }[] = [
  { id: 'nova', rotulo: 'Nova ficha', icone: Plus },
  { id: 'fichas', rotulo: 'Fichas emitidas', icone: ClipboardList },
  { id: 'analise', rotulo: 'Análise de consumo', icone: BarChart3 },
];

export default function SsmaFichaEpiView({ user, onBack }: Props) {
  const [aba, setAba] = useState<Aba>('nova');
  const [pessoaParaLancar, setPessoaParaLancar] = useState<ColaboradorFichaEpi | null>(null);
  const [buscaFichas, setBuscaFichas] = useState('');
  // Remonta a nova ficha quando vem um colaborador de outra aba.
  const [chaveNova, setChaveNova] = useState(0);

  const lancarPara = (pessoa: ColaboradorFichaEpi) => {
    setPessoaParaLancar(pessoa);
    setChaveNova(k => k + 1);
    setAba('nova');
  };

  const verFichasDe = (pessoa: ColaboradorFichaEpi) => {
    setBuscaFichas(pessoa.registro);
    setAba('fichas');
  };

  return (
    <div className="mx-auto max-w-7xl space-y-5 pb-16">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-2 text-xs font-bold text-slate-600 hover:text-emerald-700 dark:text-slate-300 dark:hover:text-emerald-400">
        <ChevronLeft className="h-4 w-4" /> Voltar ao SSMA
      </button>

      <header className="flex items-start gap-3.5">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-sm shadow-emerald-500/25">
          <HardHat className="h-6 w-6" />
        </span>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-slate-50">Ficha de EPI</h1>
            <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-400">FRM.SEG-0008</span>
          </div>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-400">
            Entrega de EPI com assinatura do colaborador. A lista vem da matriz EPI por função e cada ficha alimenta a análise de consumo.
          </p>
        </div>
      </header>

      <nav className="flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-800" aria-label="Seções da Ficha de EPI">
        {ABAS.map(({ id, rotulo, icone: Icone }) => (
          <button
            key={id}
            type="button"
            onClick={() => setAba(id)}
            aria-current={aba === id ? 'page' : undefined}
            className={`-mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-bold transition-colors ${
              aba === id
                ? 'border-emerald-600 text-emerald-700 dark:border-emerald-400 dark:text-emerald-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Icone className="h-4 w-4" /> {rotulo}
          </button>
        ))}
      </nav>

      {/* A nova ficha fica montada para não perder o preenchimento ao consultar outra aba. */}
      <div hidden={aba !== 'nova'}>
        <NovaFichaEpi key={chaveNova} user={user} pessoaInicial={pessoaParaLancar} onVerFichas={verFichasDe} />
      </div>
      {aba === 'fichas' && <FichasEpiLista key={buscaFichas} user={user} buscaInicial={buscaFichas} />}
      {aba === 'analise' && <AnaliseConsumoEpi onLancarFicha={lancarPara} />}
    </div>
  );
}
