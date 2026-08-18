/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * "8 itens no processo · 6 cotados por este fornecedor · 2 sem oferta" —
 * responde a pergunta real do comprador (cotaram tudo?) e é o LEFT JOIN que
 * o vínculo por coluna torna trivial.
 */

import React from 'react';
import { ListChecks, AlertCircle } from 'lucide-react';
import { coberturaEscopo } from '../../lib/cotacoes';
import type { CotacaoProcessoItem, CotacaoPropostaItemDraft } from '../../types';

interface CoberturaEscopoPanelProps {
  escopo: CotacaoProcessoItem[];
  itens: CotacaoPropostaItemDraft[];
}

export default function CoberturaEscopoPanel({ escopo, itens }: CoberturaEscopoPanelProps) {
  if (escopo.length === 0) return null;
  const { cobertos, semOferta } = coberturaEscopo(escopo, itens);

  return (
    <div className="flex flex-wrap items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs dark:border-slate-800 dark:bg-slate-900">
      <ListChecks className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
      <span className="text-slate-600 dark:text-slate-300">
        {escopo.length} {escopo.length === 1 ? 'item no processo' : 'itens no processo'} ·{' '}
        <strong className="text-emerald-600 dark:text-emerald-400">{cobertos.length} cotado(s)</strong> por este fornecedor
        {semOferta.length > 0 && (
          <> · <strong className="text-amber-600 dark:text-amber-400">{semOferta.length} sem oferta</strong></>
        )}
      </span>
      {semOferta.length > 0 && (
        <div className="mt-1 flex w-full items-start gap-1.5 text-slate-500 dark:text-slate-400">
          <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
          <span>Sem oferta: {semOferta.map(e => e.texto_breve || e.ri).join(', ')}</span>
        </div>
      )}
    </div>
  );
}
