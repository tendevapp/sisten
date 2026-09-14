/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Campo de busca para escolher um código de uma tabela de referência
 * (DDP, imposto) mostrando "código-descrição" — as tabelas reais têm dezenas
 * a mais de cem entradas (`sup_ddp` sozinha tem 100), então um `<select>`
 * nativo vira uma lista rolável cega. Digitar parte do código ou da
 * descrição encontra a opção sem varrer a lista inteira.
 *
 * A lista sai por `createPortal` para `document.body`, em `position: fixed`
 * calculado por `getBoundingClientRect()` — este campo mora dentro de uma
 * tabela com `overflow-x-auto` (e essa, dentro do corpo rolável do modal);
 * uma lista posicionada normalmente ficava cortada pela primeira borda com
 * overflow no caminho, sempre que o campo estava perto do fim da tabela.
 *
 * Sem seleção default: o comprador digita e escolhe, ou deixa em branco —
 * ver `exportSapCotacao.ts` sobre por que nada aqui vem pré-preenchido.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, X } from 'lucide-react';

export interface OpcaoCodigo {
  codigo: string;
  descricao: string;
}

interface SeletorBuscaCodigoProps {
  opcoes: OpcaoCodigo[];
  /** Código selecionado — `''` quando nada foi escolhido ainda. */
  valor: string;
  onSelecionar: (codigo: string, descricao: string) => void;
  placeholder?: string;
  /** Renderizado como última opção da lista, sempre visível — usado para "+ Cadastrar novo...". */
  acaoExtra?: { rotulo: string; onClick: () => void };
  /** Realce vermelho quando nada foi escolhido ainda — ver validação antes de exportar. */
  vazio?: boolean;
}

function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

const MAX_SUGESTOES = 30;

export default function SeletorBuscaCodigo({ opcoes, valor, onSelecionar, placeholder = 'Buscar...', acaoExtra, vazio }: SeletorBuscaCodigoProps) {
  const selecionada = opcoes.find(o => o.codigo === valor) ?? null;
  const [busca, setBusca] = useState('');
  const [aberto, setAberto] = useState(false);
  const [posicao, setPosicao] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const painelRef = useRef<HTMLUListElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const atualizarPosicao = () => {
      const el = containerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const espacoAbaixo = window.innerHeight - r.bottom - 8;
      setPosicao({ top: r.bottom, left: r.left, width: Math.max(r.width, 220), maxHeight: Math.max(120, Math.min(280, espacoAbaixo)) });
    };
    atualizarPosicao();
    window.addEventListener('scroll', atualizarPosicao, true);
    window.addEventListener('resize', atualizarPosicao);
    return () => {
      window.removeEventListener('scroll', atualizarPosicao, true);
      window.removeEventListener('resize', atualizarPosicao);
    };
  }, [aberto]);

  useEffect(() => {
    if (!aberto) return;
    const aoClicarFora = (e: MouseEvent) => {
      const alvo = e.target as Node;
      if (containerRef.current?.contains(alvo)) return;
      if (painelRef.current?.contains(alvo)) return;
      setAberto(false);
    };
    document.addEventListener('mousedown', aoClicarFora);
    return () => document.removeEventListener('mousedown', aoClicarFora);
  }, [aberto]);

  const sugestoes = useMemo(() => {
    const q = normalizar(busca.trim());
    if (!q) return opcoes.slice(0, MAX_SUGESTOES);
    return opcoes
      .filter(o => normalizar(o.codigo).includes(q) || normalizar(o.descricao).includes(q))
      .slice(0, MAX_SUGESTOES);
  }, [busca, opcoes]);

  const selecionar = (opcao: OpcaoCodigo) => {
    onSelecionar(opcao.codigo, opcao.descricao);
    setBusca('');
    setAberto(false);
  };

  const limpar = () => {
    onSelecionar('', '');
    setBusca('');
    inputRef.current?.focus();
  };

  return (
    <div ref={containerRef} className="relative">
      {selecionada && !aberto ? (
        <button
          type="button"
          onClick={() => { setAberto(true); setTimeout(() => inputRef.current?.focus(), 0); }}
          title={`${selecionada.codigo}-${selecionada.descricao}`}
          className="flex w-full items-center justify-between gap-1 rounded border border-slate-200 bg-white px-1.5 py-1.5 text-left text-xs dark:border-slate-700 dark:bg-slate-900"
        >
          <span className="truncate">
            <span className="font-semibold">{selecionada.codigo}</span>
            <span className="text-slate-400"> — {selecionada.descricao}</span>
          </span>
          <X className="h-3 w-3 shrink-0 text-slate-300 hover:text-rose-500" onClick={e => { e.stopPropagation(); limpar(); }} />
        </button>
      ) : (
        <div className="relative">
          <Search className="pointer-events-none absolute left-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400" />
          <input
            ref={inputRef}
            type="text"
            value={busca}
            onChange={e => { setBusca(e.target.value); setAberto(true); }}
            onFocus={() => setAberto(true)}
            placeholder={placeholder}
            className={`w-full rounded border bg-white py-1.5 pl-5.5 pr-1.5 text-xs outline-none focus:border-indigo-400 dark:bg-slate-900 dark:text-slate-200 ${
              vazio ? 'border-rose-400 bg-rose-50/60 dark:border-rose-700 dark:bg-rose-950/20' : 'border-slate-200 dark:border-slate-700'
            }`}
          />
        </div>
      )}

      {aberto && posicao && createPortal(
        <ul
          ref={painelRef}
          style={{ position: 'fixed', top: posicao.top, left: posicao.left, width: posicao.width, maxHeight: posicao.maxHeight }}
          className="z-[200] overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900"
        >
          {sugestoes.length === 0 && (
            <li className="px-2.5 py-2 text-[11px] text-slate-400">Nenhum resultado.</li>
          )}
          {sugestoes.map(o => (
            <li key={o.codigo}>
              <button
                type="button"
                onMouseDown={e => { e.preventDefault(); selecionar(o); }}
                className="flex w-full items-start gap-1.5 px-2.5 py-1.5 text-left text-xs hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <span className="shrink-0 font-mono font-semibold text-slate-700 dark:text-slate-200">{o.codigo}</span>
                <span className="text-slate-500 dark:text-slate-400">{o.descricao}</span>
              </button>
            </li>
          ))}
          {acaoExtra && (
            <li className="border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onMouseDown={e => { e.preventDefault(); acaoExtra.onClick(); setAberto(false); }}
                className="w-full px-2.5 py-1.5 text-left text-xs font-semibold text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-950/30"
              >
                {acaoExtra.rotulo}
              </button>
            </li>
          )}
        </ul>,
        document.body,
      )}
    </div>
  );
}
