/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Modal de composição — genérico, reaproveitado por todos os dashboards que
 * abrem uma janela de detalhe ao clicar num gráfico (Suprimentos hoje;
 * Contas a Pagar e Almoxarifado têm implementações próprias, anteriores a
 * este componente, com a mesma UI).
 *
 * Não sabe nada do domínio: quem abre o modal decide o agrupamento, a coluna
 * de valor e as colunas de detalhe. Isso permite reusar a mesma casca tanto
 * para `EnrichedSAPRecord` (RIs/pedidos) quanto para `HistoricoPedidoView`
 * (histórico de compras), que não têm um campo em comum.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { X, Search, ArrowUp, ArrowDown, ChevronRight, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { formatPct } from '../../lib/format';
import { TableShell, TableHeadRow, TableBody, Td } from '../ui/DataTable';

export interface ComposicaoColuna<T> {
  header: string;
  align?: 'left' | 'right' | 'center';
  render: (item: T) => React.ReactNode;
  width?: string;
}

export interface ComposicaoModalConfig<T> {
  title: string;
  badge: string;
  subtitle?: string;
  items: T[];
  /** Nome do grupo (linha-mãe da tabela) — ex.: fornecedor, comprador, área. */
  groupBy: (item: T) => string;
  /** Rótulo da dimensão de agrupamento — ex.: "Fornecedor", "Comprador". */
  groupLabelHeader: string;
  /** Valor de cada item — soma por grupo e ordena os grupos. */
  valueOf: (item: T) => number;
  formatValue: (n: number) => string;
  /** Rótulo da coluna/KPI de valor — ex.: "Valor Total", "Qtd. Itens". */
  valueHeader: string;
  /** Unidade dos itens individuais — ex.: "RI(ns)", "item(ns)", "pedido(s)". */
  unidadeItem: string;
  detailColumns: ComposicaoColuna<T>[];
  searchPredicate: (item: T, query: string) => boolean;
  searchPlaceholder?: string;
  itemKey: (item: T, idx: number) => string | number;
  onIrParaPainel?: () => void;
  irParaPainelLabel?: string;
}

interface ComposicaoModalProps<T> {
  config: ComposicaoModalConfig<T> | null;
  onClose: () => void;
}

interface Grupo<T> {
  nome: string;
  itens: T[];
  total: number;
}

export default function ComposicaoModal<T>({ config, onClose }: ComposicaoModalProps<T>) {
  const [query, setQuery] = useState('');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');
  const [expandido, setExpandido] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (config) {
      setQuery('');
      setSortDir('desc');
    }
  }, [config]);

  const grupos: Grupo<T>[] = useMemo(() => {
    if (!config) return [];
    let itens = config.items;
    if (query.trim()) {
      const q = query.toLowerCase().trim();
      itens = itens.filter(item => config.searchPredicate(item, q));
    }
    const mapa = new Map<string, Grupo<T>>();
    itens.forEach(item => {
      const nome = config.groupBy(item) || 'Não informado';
      let g = mapa.get(nome);
      if (!g) {
        g = { nome, itens: [], total: 0 };
        mapa.set(nome, g);
      }
      g.itens.push(item);
      g.total += config.valueOf(item);
    });
    mapa.forEach(g => g.itens.sort((a, b) => config.valueOf(b) - config.valueOf(a)));
    return Array.from(mapa.values()).sort((a, b) => (sortDir === 'desc' ? b.total - a.total : a.total - b.total));
  }, [config, query, sortDir]);

  // Expande todos os grupos por padrão quando o modal abre ou a lista de grupos muda.
  useEffect(() => {
    if (config && grupos.length > 0) {
      const init: Record<string, boolean> = {};
      grupos.forEach(g => { init[g.nome] = true; });
      setExpandido(init);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, grupos.length]);

  if (!config) return null;

  const totalItens = grupos.reduce((acc, g) => acc + g.itens.length, 0);
  const totalValor = grupos.reduce((acc, g) => acc + g.total, 0);

  return (
    <div
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="rounded-2xl shadow-2xl w-full max-w-[98vw] max-h-[95vh] flex flex-col overflow-hidden select-text border"
        style={{ background: 'var(--surface-card)', borderColor: 'var(--hairline)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Cabeçalho */}
        <div
          className="px-6 py-4 border-b flex items-center justify-between"
          style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)' }}
        >
          <div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full shrink-0" style={{ background: 'var(--brand)' }} aria-hidden="true" />
              <h3 className="text-lg font-bold" style={{ color: 'var(--ink-primary)' }}>{config.title}</h3>
              <span
                className="px-2.5 py-0.5 rounded-full text-xs font-bold"
                style={{ background: 'var(--surface-sunken)', color: 'var(--ink-secondary)' }}
              >
                {config.badge}
              </span>
            </div>
            {config.subtitle && (
              <p className="text-xs mt-1" style={{ color: 'var(--ink-muted)' }}>{config.subtitle}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg transition-colors duration-150 cursor-pointer hover:bg-[var(--surface-sunken)]"
            style={{ color: 'var(--ink-muted)' }}
            title="Fechar janela"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Corpo */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {/* KPIs resumidos */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl border" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-sunken)' }}>
              <span className="text-[11px] font-semibold" style={{ color: 'var(--ink-muted)' }}>{config.valueHeader}</span>
              <p className="text-base font-extrabold mt-0.5" style={{ color: 'var(--ink-primary)' }}>{config.formatValue(totalValor)}</p>
            </div>
            <div className="p-3 rounded-xl border" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-sunken)' }}>
              <span className="text-[11px] font-semibold" style={{ color: 'var(--ink-muted)' }}>Qtd. {config.groupLabelHeader}</span>
              <p className="text-base font-extrabold mt-0.5" style={{ color: 'var(--ink-primary)' }}>{grupos.length}</p>
            </div>
            <div className="p-3 rounded-xl border" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-sunken)' }}>
              <span className="text-[11px] font-semibold" style={{ color: 'var(--ink-muted)' }}>Total de {config.unidadeItem}</span>
              <p className="text-base font-extrabold mt-0.5" style={{ color: 'var(--ink-primary)' }}>{totalItens}</p>
            </div>
            <div className="p-3 rounded-xl border flex items-center justify-between gap-2" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-sunken)' }}>
              <button
                onClick={() => {
                  const nomes = grupos.map(g => g.nome);
                  const todosExpandidos = nomes.every(n => !!expandido[n]);
                  const next: Record<string, boolean> = {};
                  nomes.forEach(n => { next[n] = !todosExpandidos; });
                  setExpandido(next);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-xs font-semibold cursor-pointer transition-colors duration-150 hover:bg-[var(--surface-raised)]"
                style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}
              >
                <ChevronsUpDown className="h-3.5 w-3.5" style={{ color: 'var(--ink-muted)' }} />
                Expandir / Recolher
              </button>
              {config.onIrParaPainel && (
                <button
                  onClick={() => { const fn = config.onIrParaPainel; onClose(); fn?.(); }}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer shadow-sm transition-colors duration-150 hover:opacity-90"
                  style={{ background: 'var(--brand)', color: '#ffffff' }}
                >
                  {config.irParaPainelLabel || 'Ir p/ Painel'}
                </button>
              )}
            </div>
          </div>

          {/* Busca e ordenação */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'var(--ink-muted)' }} />
              <input
                type="text"
                placeholder={config.searchPlaceholder || 'Pesquisar...'}
                value={query}
                onChange={e => setQuery(e.target.value)}
                className="w-full pl-9 pr-8 py-2 text-xs border rounded-lg outline-none transition-all focus:ring-2"
                style={{ borderColor: 'var(--hairline)', background: 'var(--surface-sunken)', color: 'var(--ink-primary)' }}
              />
              {query && (
                <button
                  onClick={() => setQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 cursor-pointer"
                  style={{ color: 'var(--ink-muted)' }}
                  title="Limpar pesquisa"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs font-medium" style={{ color: 'var(--ink-muted)' }}>
                Exibindo <strong>{grupos.length}</strong> {config.groupLabelHeader.toLowerCase()}(s)
              </span>
              <button
                type="button"
                onClick={() => setSortDir(prev => (prev === 'desc' ? 'asc' : 'desc'))}
                className="flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-xs font-bold cursor-pointer transition-colors duration-150 hover:bg-[var(--surface-raised)]"
                style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}
              >
                <span>Ordenar por {config.valueHeader}:</span>
                {sortDir === 'desc' ? (
                  <span className="flex items-center gap-1" style={{ color: 'var(--brand)' }}>Maior p/ Menor <ArrowDown className="h-3.5 w-3.5" /></span>
                ) : (
                  <span className="flex items-center gap-1" style={{ color: 'var(--brand)' }}>Menor p/ Maior <ArrowUp className="h-3.5 w-3.5" /></span>
                )}
              </button>
            </div>
          </div>

          {/* Tabela agrupada */}
          {grupos.length === 0 ? (
            <div className="text-center py-12 text-sm" style={{ color: 'var(--ink-muted)' }}>
              {query ? 'Nenhum item encontrado para a pesquisa informada.' : 'Nenhum item encontrado para esta seleção.'}
            </div>
          ) : (
            <TableShell maxHeight="58vh" className="w-full">
              <table className="w-full text-xs border-collapse">
                <TableHeadRow>
                  <th className="px-4 py-3 text-left font-bold" style={{ color: 'var(--ink-muted)' }}>{config.groupLabelHeader}</th>
                  <th className="px-4 py-3 text-center font-bold w-28" style={{ color: 'var(--ink-muted)' }}>Qtd. {config.unidadeItem}</th>
                  <th className="px-4 py-3 text-right font-bold w-44" style={{ color: 'var(--ink-muted)' }}>{config.valueHeader}</th>
                  <th className="px-4 py-3 text-right font-bold w-24" style={{ color: 'var(--ink-muted)' }}>% do Total</th>
                </TableHeadRow>
                <TableBody>
                  {grupos.map(grupo => {
                    const isExpanded = !!expandido[grupo.nome];
                    const pct = totalValor > 0 ? (grupo.total / totalValor) * 100 : 0;
                    return (
                      <React.Fragment key={grupo.nome}>
                        <tr
                          onClick={() => setExpandido(prev => ({ ...prev, [grupo.nome]: !prev[grupo.nome] }))}
                          className="transition-colors duration-150 cursor-pointer select-none border-b"
                          style={{
                            borderColor: 'var(--hairline)',
                            background: isExpanded ? 'color-mix(in srgb, var(--brand) 8%, transparent)' : 'transparent',
                          }}
                        >
                          <Td>
                            <div className="flex items-center gap-2.5 py-0.5">
                              <span className="p-1 rounded shrink-0">
                                {isExpanded
                                  ? <ChevronDown className="h-4 w-4" style={{ color: 'var(--brand)' }} />
                                  : <ChevronRight className="h-4 w-4" style={{ color: 'var(--ink-muted)' }} />}
                              </span>
                              <span className="font-bold text-sm block truncate" style={{ color: 'var(--ink-primary)' }} title={grupo.nome}>
                                {grupo.nome}
                              </span>
                            </div>
                          </Td>
                          <Td align="right">
                            <span
                              className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold"
                              style={{ background: 'var(--surface-sunken)', color: 'var(--ink-secondary)' }}
                            >
                              {grupo.itens.length}
                            </span>
                          </Td>
                          <Td align="right" numeric strong>
                            {config.formatValue(grupo.total)}
                          </Td>
                          <Td align="right" numeric className="font-bold">
                            {formatPct(pct)}
                          </Td>
                        </tr>

                        {isExpanded && (
                          <tr>
                            <td colSpan={4} className="p-0 border-b-2" style={{ borderColor: 'var(--brand)' }}>
                              <div className="py-2.5 px-4 sm:px-8 border-l-4" style={{ borderColor: 'var(--brand)', background: 'var(--surface-sunken)' }}>
                                <div
                                  className="overflow-x-auto rounded-lg border shadow-inner"
                                  style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}
                                >
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="text-[11px]" style={{ background: 'var(--surface-raised)', color: 'var(--ink-secondary)' }}>
                                        {config.detailColumns.map(col => (
                                          <th
                                            key={col.header}
                                            className={`px-3 py-2 font-bold ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'} ${col.width || ''}`}
                                          >
                                            {col.header}
                                          </th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y" style={{ borderColor: 'var(--hairline)' }}>
                                      {grupo.itens.map((item, idx) => (
                                        <tr key={config.itemKey(item, idx)} className="transition-colors duration-150 hover:bg-[var(--surface-raised)]">
                                          {config.detailColumns.map(col => (
                                            <td
                                              key={col.header}
                                              className={`px-3 py-2 ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'}`}
                                              style={{ color: 'var(--ink-secondary)' }}
                                            >
                                              {col.render(item)}
                                            </td>
                                          ))}
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </TableBody>
              </table>
            </TableShell>
          )}
        </div>
      </div>
    </div>
  );
}
