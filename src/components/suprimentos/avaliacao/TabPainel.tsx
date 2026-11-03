/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Aba "Painel de fornecedores": X pedidos/itens comprados (ZL0132) × Y
 * ocorrências registradas no período, com OTD do SAP, nota média e última
 * avaliação FRM. Clique abre a ficha do fornecedor (histórico + relatório).
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import {
  TableBody, TableCardRow, TableCards, TableDesktop, TableHeadRow, TableShell, Td, Th, Tr, SortableTh, type SortDir,
} from '../../ui/DataTable';
import { useToast } from '../../ui/Toast';
import {
  CATEGORIA_POR_ID, faixaDaNota, normalizarBusca, otd, subtrairMeses, taxaPedidosComOcorrencia,
  type CategoriaOcorrencia, type LinhaPainel,
} from '../../../lib/avaliacaoFornecedores';
import { carregarPainel, type FornecedorOpcao } from '../../../lib/avaliacaoFornecedoresApi';
import { formatBRLCompacto, formatInt } from '../../../lib/format';
import { formatarDataBR, hojeISO } from '../../../lib/fichaEpi';
import { Chip, Estrelas, inputCls } from './ui';

type Coluna = 'fornecedor' | 'pedidos' | 'itens' | 'valor' | 'otd' | 'ocorrencias' | 'taxa' | 'estrelas' | 'frm';

const pct = (n: number | null) => (n == null ? '—' : `${(n * 100).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%`);

function valorColuna(l: LinhaPainel, c: Coluna): number | string {
  switch (c) {
    case 'fornecedor': return l.fornecedor_nome;
    case 'pedidos': return l.pedidos;
    case 'itens': return l.itens;
    case 'valor': return l.valor;
    case 'otd': return otd(l) ?? -1;
    case 'ocorrencias': return l.ocorrencias;
    case 'taxa': return taxaPedidosComOcorrencia(l) ?? -1;
    case 'estrelas': return l.estrelas_media ?? -1;
    case 'frm': return l.frm_nota ?? -1;
  }
}

export default function TabPainel({
  painel12, onFornecedor, versao,
}: { painel12: LinhaPainel[]; onFornecedor: (f: FornecedorOpcao) => void; versao: number }) {
  const toast = useToast();
  const [meses, setMeses] = useState(12);
  const [linhas, setLinhas] = useState<LinhaPainel[]>(painel12);
  const [carregando, setCarregando] = useState(false);
  const [busca, setBusca] = useState('');
  const [soComOcorrencia, setSoComOcorrencia] = useState(false);
  const [ordem, setOrdem] = useState<{ col: Coluna; dir: SortDir }>({ col: 'ocorrencias', dir: 'desc' });

  useEffect(() => {
    if (meses === 12) { setLinhas(painel12); return; }
    let vivo = true;
    setCarregando(true);
    const fim = hojeISO();
    carregarPainel(subtrairMeses(fim, meses), fim)
      .then(l => vivo && setLinhas(l))
      .catch(e => toast.error(e?.message || 'Falha ao carregar o painel.'))
      .finally(() => vivo && setCarregando(false));
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meses, painel12, versao]);

  const visiveis = useMemo(() => {
    const t = normalizarBusca(busca);
    const lista = linhas.filter(l => {
      if (soComOcorrencia && l.ocorrencias === 0) return false;
      if (t && !normalizarBusca(`${l.fornecedor_nome} ${l.fornecedor_codigo} ${l.cnpj}`).includes(t)) return false;
      return true;
    });
    const sinal = ordem.dir === 'asc' ? 1 : -1;
    return lista.sort((a, b) => {
      const va = valorColuna(a, ordem.col);
      const vb = valorColuna(b, ordem.col);
      const cmp = typeof va === 'string' ? va.localeCompare(vb as string, 'pt-BR') : (va as number) - (vb as number);
      return cmp * sinal || b.valor - a.valor;
    });
  }, [linhas, busca, soComOcorrencia, ordem]);

  const totais = useMemo(() => ({
    fornecedores: linhas.filter(l => l.pedidos > 0).length,
    itens: linhas.reduce((s, l) => s + l.itens, 0),
    ocorrencias: linhas.reduce((s, l) => s + l.ocorrencias, 0),
    comOcorrencia: linhas.filter(l => l.ocorrencias > 0).length,
  }), [linhas]);

  const ordenar = (col: string) =>
    setOrdem(o => (o.col === col ? { col: col as Coluna, dir: o.dir === 'asc' ? 'desc' : 'asc' } : { col: col as Coluna, dir: col === 'fornecedor' ? 'asc' : 'desc' }));
  const forn = (l: LinhaPainel): FornecedorOpcao => ({ fornecedor_codigo: l.fornecedor_codigo, fornecedor_nome: l.fornecedor_nome, cnpj: l.cnpj });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-lg border p-1" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)' }}>
          {[3, 6, 12, 24].map(m => (
            <button key={m} type="button" onClick={() => setMeses(m)} className="rounded-md px-2.5 py-1 text-xs font-bold"
              style={meses === m ? { background: 'var(--surface-card)', color: 'var(--brand)' } : { color: 'var(--ink-muted)' }}>
              {m} meses
            </button>
          ))}
        </div>
        <label className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--ink-muted)' }} />
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Fornecedor, código SAP, CNPJ…" className={`${inputCls} pl-9`} />
        </label>
        <Chip compacto ativo={soComOcorrencia} onClick={() => setSoComOcorrencia(v => !v)}>Só com ocorrência</Chip>
        {carregando && <Loader2 className="h-4 w-4 animate-spin" style={{ color: 'var(--ink-muted)' }} />}
      </div>
      <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>
        {formatInt(totais.fornecedores)} fornecedores com pedido · {formatInt(totais.itens)} itens comprados ·{' '}
        <b style={{ color: totais.ocorrencias ? '#b45309' : undefined }}>{formatInt(totais.ocorrencias)} ocorrências</b> em {totais.comOcorrencia} fornecedor(es)
      </p>

      {visiveis.length === 0 ? (
        <div className="rounded-xl border py-12 text-center text-sm" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-muted)' }}>Nada com esses filtros.</div>
      ) : (
        <>
          <TableCards>
            {visiveis.slice(0, 300).map(l => (
              <TableCardRow key={l.chave} onClick={() => onFornecedor(forn(l))} accent={l.ocorrencias ? '#d97706' : undefined}>
                <div className="text-sm font-bold" style={{ color: 'var(--ink-primary)' }}>{l.fornecedor_nome}</div>
                <div className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
                  {formatInt(l.pedidos)} PO · {formatInt(l.itens)} itens · {formatBRLCompacto(l.valor)} · OTD {pct(otd(l))}
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold" style={{ color: l.ocorrencias ? '#b45309' : 'var(--ink-muted)' }}>{l.ocorrencias} ocorrência(s)</span>
                  {l.estrelas_media != null && <Estrelas valor={l.estrelas_media} tamanho="sm" />}
                </div>
                <BarraCategorias l={l} />
              </TableCardRow>
            ))}
          </TableCards>
          <TableDesktop>
            <TableShell maxHeight="65vh">
              <table className="w-full text-xs">
                <TableHeadRow>
                  <SortableTh col="fornecedor" label="Fornecedor" sortColumn={ordem.col} sortDir={ordem.dir} onSort={ordenar} />
                  <SortableTh col="pedidos" label="Pedidos" align="right" sortColumn={ordem.col} sortDir={ordem.dir} onSort={ordenar} />
                  <SortableTh col="itens" label="Itens" align="right" sortColumn={ordem.col} sortDir={ordem.dir} onSort={ordenar} />
                  <SortableTh col="valor" label="Valor" align="right" sortColumn={ordem.col} sortDir={ordem.dir} onSort={ordenar} />
                  <SortableTh col="otd" label="OTD" align="right" sortColumn={ordem.col} sortDir={ordem.dir} onSort={ordenar} />
                  <SortableTh col="ocorrencias" label="Ocorrências" align="right" sortColumn={ordem.col} sortDir={ordem.dir} onSort={ordenar} />
                  <Th label="Por categoria" width="w-36" />
                  <SortableTh col="taxa" label="% POs" align="right" sortColumn={ordem.col} sortDir={ordem.dir} onSort={ordenar} />
                  <SortableTh col="estrelas" label="Nota" sortColumn={ordem.col} sortDir={ordem.dir} onSort={ordenar} />
                  <SortableTh col="frm" label="Última FRM" sortColumn={ordem.col} sortDir={ordem.dir} onSort={ordenar} />
                </TableHeadRow>
                <TableBody>
                  {visiveis.slice(0, 500).map(l => {
                    const taxa = taxaPedidosComOcorrencia(l);
                    const o = otd(l);
                    return (
                      <Tr key={l.chave} onClick={() => onFornecedor(forn(l))} accent={l.ocorrencias ? '#d97706' : undefined}>
                        <Td truncate title={l.fornecedor_nome}>
                          <button type="button" className="font-semibold hover:underline text-left" style={{ color: 'var(--ink-primary)' }} onClick={e => { e.stopPropagation(); onFornecedor(forn(l)); }}>
                            {l.fornecedor_nome}
                          </button>
                          <div className="font-mono text-[10px]" style={{ color: 'var(--ink-muted)' }}>{l.fornecedor_codigo}</div>
                        </Td>
                        <Td align="right" numeric>{formatInt(l.pedidos)}</Td>
                        <Td align="right" numeric>{formatInt(l.itens)}</Td>
                        <Td align="right" numeric>{formatBRLCompacto(l.valor)}</Td>
                        <Td align="right" numeric>
                          <span style={{ color: o == null ? 'var(--ink-muted)' : o >= 0.9 ? 'var(--status-good)' : o >= 0.7 ? '#d97706' : 'var(--status-critical)' }}>{pct(o)}</span>
                        </Td>
                        <Td align="right" numeric strong>{l.ocorrencias || <span style={{ color: 'var(--ink-muted)' }}>0</span>}</Td>
                        <Td><BarraCategorias l={l} /></Td>
                        <Td align="right" numeric>{pct(taxa)}</Td>
                        <Td>{l.estrelas_media != null ? <Estrelas valor={l.estrelas_media} tamanho="sm" /> : <span style={{ color: 'var(--ink-muted)' }}>—</span>}</Td>
                        <Td>
                          {l.frm_nota != null ? (
                            <span className="whitespace-nowrap">
                              <b style={{ color: faixaDaNota(l.frm_nota).cor }}>{pct(l.frm_nota)}</b>
                              <span className="ml-1 text-[10px]" style={{ color: 'var(--ink-muted)' }}>{formatarDataBR(l.frm_data)}</span>
                            </span>
                          ) : <span style={{ color: 'var(--ink-muted)' }}>—</span>}
                        </Td>
                      </Tr>
                    );
                  })}
                </TableBody>
              </table>
            </TableShell>
          </TableDesktop>
        </>
      )}
    </div>
  );
}

function BarraCategorias({ l }: { l: LinhaPainel }) {
  const entradas = Object.entries(l.por_categoria || {});
  const total = entradas.reduce((s, [, n]) => s + n, 0);
  if (!total) return null;
  return (
    <span className="flex h-2 w-full min-w-[80px] overflow-hidden rounded-full" style={{ background: 'var(--surface-raised)' }}
      title={entradas.map(([c, n]) => `${CATEGORIA_POR_ID[c as CategoriaOcorrencia]?.rotulo || c}: ${n}`).join(' · ')}>
      {entradas.map(([c, n]) => (
        <span key={c} style={{ width: `${(n / total) * 100}%`, background: CATEGORIA_POR_ID[c as CategoriaOcorrencia]?.cor || '#64748b' }} />
      ))}
    </span>
  );
}
