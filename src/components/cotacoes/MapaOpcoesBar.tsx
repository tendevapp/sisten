/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Barra de controle do mapa comparativo. Três decisões ficam aqui porque
 * mudam a matriz inteira e a resposta certa depende da compra:
 *
 *  1. a base de comparação (preço cotado, desembolso ou custo líquido de
 *     créditos) — trocar a base pode trocar o vencedor, e o comprador
 *     precisa ver isso acontecer;
 *  2. quais tributos a empresa recupera, quando a base é o custo líquido;
 *  3. a sensibilidade do agrupamento por similaridade, para quando a
 *     heurística separou demais (ou de menos) as linhas.
 */

import React, { useState } from 'react';
import { Percent, SlidersHorizontal, Save, Download, Loader2, Info, ArrowUpDown, Search, X } from 'lucide-react';
import type { BaseComparacao, CreditosHabilitados, OrdenacaoMapa } from '../../lib/mapaCotacao';

const BASES: { id: BaseComparacao; rotulo: string; ajuda: string }[] = [
  { id: 'cotado', rotulo: 'Preço cotado', ajuda: 'O número que está na proposta, sem IPI e sem frete — para conferir contra o PDF.' },
  { id: 'desembolso', rotulo: 'Desembolso', ajuda: 'Preço + IPI destacado + frete rateado por valor. O que sai do caixa.' },
  { id: 'liquido', rotulo: 'Custo líquido', ajuda: 'Desembolso menos os tributos que a empresa recupera como crédito.' },
];

const ORDENACOES: { id: OrdenacaoMapa; rotulo: string }[] = [
  { id: 'alfabetica', rotulo: 'Ordem alfabética' },
  { id: 'disputa', rotulo: 'Mais ofertas primeiro' },
  { id: 'dispersao', rotulo: 'Maior diferença de preço' },
  { id: 'ri', rotulo: 'RI da requisição' },
];

interface MapaOpcoesBarProps {
  base: BaseComparacao;
  onBase: (b: BaseComparacao) => void;
  creditos: CreditosHabilitados;
  onCreditos: (c: CreditosHabilitados) => void;
  limiar: number;
  onLimiar: (v: number) => void;
  ordenacao: OrdenacaoMapa;
  onOrdenacao: (o: OrdenacaoMapa) => void;
  /** Filtra as linhas da matriz por descrição, RI ou código — ver `normalizarDescricao` em cotacoes.ts. */
  busca: string;
  onBusca: (v: string) => void;
  itensSelecionados: number;
  alteracoesPendentes: boolean;
  salvando: boolean;
  onSalvar: () => void;
  onExportar: () => void;
}

function Segmento({ ativo, onClick, children, title }: { ativo: boolean; onClick: () => void; children: React.ReactNode; title: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
        ativo
          ? 'bg-white text-indigo-700 shadow-sm dark:bg-slate-700 dark:text-indigo-300'
          : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
      }`}
    >
      {children}
    </button>
  );
}

function Caixa({ marcado, onChange, children }: { marcado: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
      <input
        type="checkbox"
        checked={marcado}
        onChange={e => onChange(e.target.checked)}
        className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800"
      />
      {children}
    </label>
  );
}

export default function MapaOpcoesBar({
  base, onBase, creditos, onCreditos, limiar, onLimiar, ordenacao, onOrdenacao, busca, onBusca,
  itensSelecionados, alteracoesPendentes, salvando, onSalvar, onExportar,
}: MapaOpcoesBarProps) {
  const [ajustesAbertos, setAjustesAbertos] = useState(false);

  return (
    <div className="sticky top-0 z-30 space-y-3 rounded-xl border border-slate-200 bg-white/95 p-3 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={busca}
          onChange={e => onBusca(e.target.value)}
          placeholder="Buscar por descrição, RI ou código..."
          className="w-full rounded-xl border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-8 text-xs text-slate-700 outline-none transition-colors focus:border-indigo-400 focus:bg-white dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200 dark:focus:bg-slate-800"
        />
        {busca && (
          <button
            type="button"
            onClick={() => onBusca('')}
            title="Limpar busca"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800/80">
          {BASES.map(b => (
            <Segmento key={b.id} ativo={base === b.id} onClick={() => onBase(b.id)} title={b.ajuda}>
              {b.rotulo}
            </Segmento>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setAjustesAbertos(v => !v)}
          className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors ${
            ajustesAbertos
              ? 'border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300'
              : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
          }`}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Ajustes
        </button>

        <label className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-300">
          <ArrowUpDown className="h-3.5 w-3.5 text-slate-400" />
          <select
            value={ordenacao}
            onChange={e => onOrdenacao(e.target.value as OrdenacaoMapa)}
            title="Ordem das linhas da matriz"
            className="cursor-pointer bg-transparent text-xs font-semibold text-slate-600 outline-none dark:text-slate-300 dark:[color-scheme:dark]"
          >
            {ORDENACOES.map(o => (
              <option key={o.id} value={o.id}>{o.rotulo}</option>
            ))}
          </select>
        </label>

        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {itensSelecionados} {itensSelecionados === 1 ? 'item marcado' : 'itens marcados'}
          </span>
          <button
            type="button"
            onClick={onExportar}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            Exportar
          </button>
          <button
            type="button"
            onClick={onSalvar}
            disabled={salvando || !alteracoesPendentes}
            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm shadow-indigo-600/20 transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Salvar decisão
          </button>
        </div>
      </div>

      {base === 'liquido' && (
        <div className="flex flex-wrap items-center gap-4 rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 dark:border-amber-900/60 dark:bg-amber-950/20">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-800 dark:text-amber-300">
            <Percent className="h-3.5 w-3.5" />
            Tributos que a empresa recupera
          </span>
          <Caixa marcado={creditos.icms} onChange={v => onCreditos({ ...creditos, icms: v })}>ICMS</Caixa>
          <Caixa marcado={creditos.pisCofins} onChange={v => onCreditos({ ...creditos, pisCofins: v })}>PIS/COFINS</Caixa>
          <Caixa marcado={creditos.ipi} onChange={v => onCreditos({ ...creditos, ipi: v })}>IPI</Caixa>
          <span className="inline-flex items-center gap-1 text-[11px] text-amber-700/80 dark:text-amber-400/80">
            <Info className="h-3 w-3" />
            Compra para uso e consumo normalmente não gera crédito — deixe desmarcado na dúvida.
          </span>
        </div>
      )}

      {ajustesAbertos && (
        <div className="flex flex-wrap items-center gap-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-900/60">
          <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
            <span className="font-semibold">Agrupamento por similaridade</span>
            <input
              type="range"
              min={0.3}
              max={0.9}
              step={0.05}
              value={limiar}
              onChange={e => onLimiar(Number(e.target.value))}
              className="h-1 w-40 cursor-pointer accent-indigo-600"
            />
            <span className="w-10 tabular-nums text-slate-500">{Math.round(limiar * 100)}%</span>
          </label>
          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            Mais à esquerda junta itens com descrições menos parecidas; mais à direita separa. Itens vinculados a uma RM não são afetados.
          </span>
        </div>
      )}
    </div>
  );
}
