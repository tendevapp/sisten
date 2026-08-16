/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useRef, useState } from 'react';
import {
  Search, BookOpen, ShoppingCart, Package, Truck, ClipboardList, Wallet, ShieldCheck,
  UploadCloud, History, ChevronRight, X, AlertTriangle, Database, FileText
} from 'lucide-react';
import { DIRETRIZES, CHANGELOG, DiretrizesDominio, DiretrizesPagina } from '../../data/diretrizes';

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  BookOpen, ShoppingCart, Package, Truck, ClipboardList, Wallet, ShieldCheck, UploadCloud
};

function normalize(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function highlight(text: string, term: string): React.ReactNode {
  if (!term) return text;
  const idx = normalize(text).indexOf(normalize(term));
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-amber-200 dark:bg-amber-500/40 text-inherit rounded px-0.5">
        {text.slice(idx, idx + term.length)}
      </mark>
      {text.slice(idx + term.length)}
    </>
  );
}

function paginaMatches(pagina: DiretrizesPagina, term: string): boolean {
  if (!term) return true;
  const n = normalize(term);
  if (normalize(pagina.nome).includes(n)) return true;
  if (pagina.arquivo && normalize(pagina.arquivo).includes(n)) return true;
  return pagina.secoes.some(
    sec => normalize(sec.titulo).includes(n) || sec.itens.some(item => normalize(item).includes(n))
  );
}

export default function Diretrizes() {
  const [search, setSearch] = useState('');
  const [activeDomain, setActiveDomain] = useState<string>(DIRETRIZES[0].id);
  const contentRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Record<string, HTMLElement | null>>({});

  const filtered: DiretrizesDominio[] = useMemo(() => {
    if (!search.trim()) return DIRETRIZES;
    return DIRETRIZES.map(dom => ({
      ...dom,
      paginas: dom.paginas.filter(p => paginaMatches(p, search))
    })).filter(dom => dom.paginas.length > 0);
  }, [search]);

  const scrollToPagina = (domainId: string, paginaId: string) => {
    setActiveDomain(domainId);
    const el = pageRefs.current[paginaId];
    if (el && contentRef.current) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const scrollToChangelog = () => {
    const el = pageRefs.current['__changelog__'];
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6 min-h-[70vh]">
      {/* Sidebar de navegação */}
      <aside className="lg:w-72 shrink-0 lg:sticky lg:top-4 lg:self-start lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
        <div className="mb-4">
          <h2 className="text-xl font-extrabold text-slate-850 dark:text-slate-50 flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-[#0056c6] dark:text-blue-500" />
            Diretrizes
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Manual técnico do SISTEN: regras de negócio, exibição, permissões e importação de cada página.
          </p>
        </div>

        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar regra, página, tabela..."
            className="w-full pl-9 pr-8 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#0056c6]/40"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              aria-label="Limpar busca"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <nav className="space-y-4">
          {filtered.length === 0 && (
            <p className="text-xs text-slate-400 px-1">Nenhum resultado para "{search}".</p>
          )}
          {filtered.map(dom => {
            const Icon = ICONS[dom.icone] || FileText;
            return (
              <div key={dom.id}>
                <div className="flex items-center gap-2 px-1 mb-1.5">
                  <Icon className="h-4 w-4 text-[#0056c6] dark:text-blue-500 shrink-0" />
                  <span className="text-[11px] font-extrabold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {highlight(dom.nome, search)}
                  </span>
                </div>
                <ul className="space-y-0.5 ml-1 border-l border-slate-200 dark:border-slate-800 pl-3">
                  {dom.paginas.map(pagina => (
                    <li key={pagina.id}>
                      <button
                        onClick={() => scrollToPagina(dom.id, pagina.id)}
                        className={`w-full text-left text-xs py-1 px-2 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                          activeDomain === dom.id
                            ? 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                            : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        <ChevronRight className="h-3 w-3 shrink-0 opacity-50" />
                        <span className="truncate">{highlight(pagina.nome, search)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}

          <div>
            <button
              onClick={scrollToChangelog}
              className="w-full flex items-center gap-2 px-1 py-1.5 rounded-lg text-[11px] font-extrabold uppercase tracking-wide text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              <History className="h-4 w-4 text-[#0056c6] dark:text-blue-500" />
              Histórico de Versões
            </button>
          </div>
        </nav>
      </aside>

      {/* Conteúdo */}
      <div ref={contentRef} className="flex-1 min-w-0 space-y-10">
        {filtered.map(dom => {
          const Icon = ICONS[dom.icone] || FileText;
          return (
            <section key={dom.id} id={`dom-${dom.id}`}>
              <div className="flex items-start gap-3 mb-5 pb-3 border-b-2 border-slate-100 dark:border-slate-800">
                <div className="h-10 w-10 rounded-xl bg-blue-50 dark:bg-blue-950/40 flex items-center justify-center shrink-0">
                  <Icon className="h-5 w-5 text-[#0056c6] dark:text-blue-500" />
                </div>
                <div>
                  <h3 className="text-lg font-extrabold text-slate-850 dark:text-slate-50">
                    {highlight(dom.nome, search)}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{dom.resumo}</p>
                </div>
              </div>

              <div className="space-y-5">
                {dom.paginas.map(pagina => (
                  <div
                    key={pagina.id}
                    ref={el => { pageRefs.current[pagina.id] = el; }}
                    className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs overflow-hidden scroll-mt-4"
                  >
                    <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-850/40">
                      <h4 className="text-sm font-extrabold text-slate-800 dark:text-slate-100">
                        {highlight(pagina.nome, search)}
                      </h4>
                      {pagina.arquivo && (
                        <p className="text-[11px] font-mono text-slate-400 dark:text-slate-500 mt-0.5">
                          {pagina.arquivo}
                        </p>
                      )}
                    </div>
                    <div className="px-5 py-4 space-y-4">
                      {pagina.secoes.map((sec, i) => {
                        const isWarning = sec.titulo.includes('⚠️');
                        const isDbSection = /tabela|banco/i.test(sec.titulo);
                        return (
                          <div key={i}>
                            <h5 className={`text-xs font-bold uppercase tracking-wide mb-1.5 flex items-center gap-1.5 ${
                              isWarning ? 'text-amber-600 dark:text-amber-400' : 'text-[#0056c6] dark:text-blue-400'
                            }`}>
                              {isWarning ? (
                                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                              ) : isDbSection ? (
                                <Database className="h-3.5 w-3.5 shrink-0" />
                              ) : null}
                              {sec.titulo.replace('⚠️ ', '')}
                            </h5>
                            <ul
                              className={`space-y-1.5 text-sm leading-relaxed text-slate-600 dark:text-slate-300 ${
                                isWarning ? 'bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 rounded-lg p-3' : ''
                              }`}
                            >
                              {sec.itens.map((item, j) => (
                                <li key={j} className="flex gap-2">
                                  <span className="text-slate-300 dark:text-slate-600 shrink-0">•</span>
                                  <span>{highlight(item, search)}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        })}

        {/* Histórico de versões */}
        <section
          id="changelog"
          ref={el => { pageRefs.current['__changelog__'] = el; }}
          className="scroll-mt-4"
        >
          <div className="flex items-start gap-3 mb-5 pb-3 border-b-2 border-slate-100 dark:border-slate-800">
            <div className="h-10 w-10 rounded-xl bg-blue-50 dark:bg-blue-950/40 flex items-center justify-center shrink-0">
              <History className="h-5 w-5 text-[#0056c6] dark:text-blue-500" />
            </div>
            <div>
              <h3 className="text-lg font-extrabold text-slate-850 dark:text-slate-50">Histórico de Versões</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Cada mudança de regra de negócio documentada nesta página deve vir acompanhada de uma entrada aqui — data + resumo da alteração.
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs overflow-hidden">
            <ol className="divide-y divide-slate-100 dark:divide-slate-800">
              {CHANGELOG.map((entry, i) => (
                <li key={i} className="px-5 py-3.5 flex gap-4">
                  <span className="shrink-0 text-xs font-mono font-bold text-slate-400 dark:text-slate-500 w-24 pt-0.5">
                    {new Date(entry.data + 'T00:00:00').toLocaleDateString('pt-BR')}
                  </span>
                  <span className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{entry.resumo}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>
      </div>
    </div>
  );
}
