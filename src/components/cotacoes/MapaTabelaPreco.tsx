/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Mapa de preço: a planilha comparativa clássica — um valor por fornecedor,
 * melhor preço em verde, sem cotação em pêssego, cabeçalho com UF/condição/
 * prazo/frete/referência de cada fornecedor (mesma leitura da planilha que
 * o comprador já monta hoje), e as colunas de veredito (melhor preço,
 * fornecedor vencedor, valor total) à direita.
 *
 * Marcar a compra funciona aqui igual à Visão Detalhada — clicar na célula
 * do fornecedor vencedor marca aquele item para comprar dele; clicar de
 * novo desmarca. Uma célula marcada nunca é "sem cotação": não tem o que
 * marcar ali.
 */

import React from 'react';
import { Ban, ShoppingCart, Check } from 'lucide-react';
import { formatBRL, formatQtd } from '../../lib/format';
import { nomeFornecedorCurto } from '../../lib/cotacoes';
import type { CelulaMapa, LinhaMapa, ResumoFornecedor } from '../../lib/mapaCotacao';
import type { CotacaoPropostaDraft } from '../../types';

const FRETE_LABEL: Record<string, string> = { CIF: 'CIF', FOB: 'FOB', OUTRO: 'a combinar' };

interface MapaTabelaPrecoProps {
  linhas: LinhaMapa[];
  resumos: ResumoFornecedor[];
  propostasPorKey: Map<string, CotacaoPropostaDraft>;
  selecionados: Set<string>;
  onMarcar: (celula: CelulaMapa, linha: LinhaMapa, marcar: boolean) => void;
}

export default function MapaTabelaPreco({ linhas, resumos, propostasPorKey, selecionados, onMarcar }: MapaTabelaPrecoProps) {
  if (linhas.length === 0) return null;

  return (
    <div className="overflow-x-auto custom-scrollbar rounded-b-2xl border border-t-0 border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <table className="w-full min-w-max border-collapse text-xs">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/60">
            <th rowSpan={2} className="sticky left-0 z-10 bg-slate-50 p-2 text-left align-bottom font-semibold text-slate-500 dark:bg-slate-800/80 dark:text-slate-400">Item cotado</th>
            <th rowSpan={2} className="p-2 text-left align-bottom font-semibold text-slate-500 dark:text-slate-400">RI</th>
            <th rowSpan={2} className="p-2 text-right align-bottom font-semibold text-slate-500 dark:text-slate-400">Qtd</th>
            {resumos.map(r => {
              const proposta = propostasPorKey.get(r.propostaKey);
              return (
                <th key={r.propostaKey} className="min-w-[130px] border-l border-slate-200 p-2 text-right align-bottom font-semibold text-slate-600 dark:border-slate-800 dark:text-slate-300" title={r.nome}>
                  <div className="truncate">{nomeFornecedorCurto(r.nome)}</div>
                  <div className="mt-1 space-y-0.5 text-right text-[9px] font-normal normal-case text-slate-400">
                    <div>{proposta?.fornecedor_uf || '—'}</div>
                    <div className="truncate" title={r.condicaoPagamento ?? undefined}>{r.condicaoPagamento || '—'}</div>
                    <div>{r.prazoEntregaDias != null ? `${r.prazoEntregaDias}d entrega` : 'prazo n/i'}</div>
                    <div>{proposta?.frete_modalidade ? FRETE_LABEL[proposta.frete_modalidade] ?? proposta.frete_modalidade : '—'}</div>
                    {proposta?.numero_proposta && <div className="truncate" title={proposta.numero_proposta}>ref. {proposta.numero_proposta}</div>}
                  </div>
                </th>
              );
            })}
            <th rowSpan={2} className="min-w-[110px] border-l border-slate-200 bg-emerald-50/60 p-2 text-right align-bottom font-semibold text-emerald-700 dark:border-slate-800 dark:bg-emerald-950/20 dark:text-emerald-300">Melhor preço</th>
            <th rowSpan={2} className="min-w-[140px] border-l border-slate-200 bg-emerald-50/60 p-2 text-left align-bottom font-semibold text-emerald-700 dark:border-slate-800 dark:bg-emerald-950/20 dark:text-emerald-300">Fornecedor vencedor</th>
            <th rowSpan={2} className="min-w-[110px] border-l border-slate-200 bg-emerald-50/60 p-2 text-right align-bottom font-semibold text-emerald-700 dark:border-slate-800 dark:bg-emerald-950/20 dark:text-emerald-300">Vlr. total</th>
          </tr>
          <tr />
        </thead>
        <tbody>
          {linhas.map(linha => {
            const vencedora = linha.celulas.find(c => c.melhor);
            return (
              <tr key={linha.key} className="border-b border-slate-100 last:border-0 dark:border-slate-800/70">
                <td className="sticky left-0 z-10 max-w-[280px] bg-white p-2 align-top dark:bg-slate-900">
                  <div className="truncate font-medium text-slate-800 dark:text-slate-100" title={linha.titulo}>{linha.titulo}</div>
                </td>
                <td className="p-2 align-top text-slate-500 dark:text-slate-400">{linha.ri || '—'}</td>
                <td className="p-2 text-right align-top tabular-nums text-slate-500 dark:text-slate-400">
                  {linha.qtdSolicitada != null ? `${formatQtd(linha.qtdSolicitada)} ${linha.unidade || ''}` : '—'}
                </td>
                {resumos.map(r => {
                  const celula = linha.celulas.find(c => c.propostaKey === r.propostaKey);
                  if (!celula) {
                    return (
                      <td key={r.propostaKey} className="border-l border-slate-100 bg-orange-50/60 p-2 text-right align-top italic text-orange-400 dark:border-slate-800 dark:bg-orange-950/10 dark:text-orange-400/70">
                        sem cotação
                      </td>
                    );
                  }
                  const marcado = selecionados.has(celula.item._key);
                  return (
                    <td
                      key={r.propostaKey}
                      onClick={() => onMarcar(celula, linha, !marcado)}
                      title={marcado ? 'Clique para desmarcar' : 'Clique para marcar este item deste fornecedor para compra'}
                      className={`cursor-pointer border-l border-slate-100 p-2 text-right align-top tabular-nums transition-colors dark:border-slate-800 ${
                        marcado
                          ? 'bg-indigo-100 font-semibold text-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-200'
                          : celula.melhor
                            ? 'bg-emerald-50 font-semibold text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-300'
                            : 'text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800/60'
                      }`}
                    >
                      <span className="inline-flex items-center gap-1">
                        {marcado ? <Check className="h-3 w-3 shrink-0" /> : <ShoppingCart className="h-3 w-3 shrink-0 opacity-30" />}
                        {celula.custo.unitarioComparavel != null ? formatBRL(celula.custo.unitarioComparavel) : '—'}
                      </span>
                    </td>
                  );
                })}
                <td className="border-l border-slate-100 bg-emerald-50/40 p-2 text-right align-top font-bold tabular-nums text-emerald-700 dark:border-slate-800 dark:bg-emerald-950/10 dark:text-emerald-300">
                  {linha.melhorCusto != null ? formatBRL(linha.melhorCusto) : '—'}
                </td>
                <td className="border-l border-slate-100 bg-emerald-50/40 p-2 align-top font-medium text-emerald-700 dark:border-slate-800 dark:bg-emerald-950/10 dark:text-emerald-300">
                  {vencedora ? nomeFornecedorCurto(resumos.find(r => r.propostaKey === vencedora.propostaKey)?.nome ?? '') : (
                    <span className="inline-flex items-center gap-1 font-normal text-rose-400"><Ban className="h-3 w-3" />sem cotação</span>
                  )}
                </td>
                <td className="border-l border-slate-100 bg-emerald-50/40 p-2 text-right align-top font-bold tabular-nums text-emerald-700 dark:border-slate-800 dark:bg-emerald-950/10 dark:text-emerald-300">
                  {vencedora?.custo.comparavel != null ? formatBRL(vencedora.custo.comparavel) : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
