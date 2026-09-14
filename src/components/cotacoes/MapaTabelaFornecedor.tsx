/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tabela por fornecedor: cada fornecedor vira um bloco de colunas (descrição
 * cotada, preço unitário, preço total), lado a lado. Onde o "mapa de preço"
 * só mostra o número, esta view mostra também COMO o fornecedor descreveu o
 * item — o comprador confere se o agrupamento juntou o material certo sem
 * abrir card nenhum, só olhando a descrição ao lado do preço.
 *
 * Clicar em qualquer célula do bloco de um fornecedor marca aquele item
 * para comprar dele — mesmo gesto da Visão Detalhada, só que sem o card.
 */

import React from 'react';
import { ShoppingCart, Check } from 'lucide-react';
import { formatBRL, formatQtd } from '../../lib/format';
import { nomeFornecedorCurto } from '../../lib/cotacoes';
import type { CelulaMapa, LinhaMapa, ResumoFornecedor } from '../../lib/mapaCotacao';

interface MapaTabelaFornecedorProps {
  linhas: LinhaMapa[];
  resumos: ResumoFornecedor[];
  selecionados: Set<string>;
  onMarcar: (celula: CelulaMapa, linha: LinhaMapa, marcar: boolean) => void;
}

export default function MapaTabelaFornecedor({ linhas, resumos, selecionados, onMarcar }: MapaTabelaFornecedorProps) {
  if (linhas.length === 0) return null;

  return (
    <div className="overflow-x-auto custom-scrollbar rounded-b-2xl border border-t-0 border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <table className="w-full min-w-max border-collapse text-xs">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/60">
            <th rowSpan={2} className="sticky left-0 z-10 min-w-[220px] bg-slate-50 p-2 text-left align-bottom font-semibold text-slate-500 dark:bg-slate-800/80 dark:text-slate-400">
              Item cotado
            </th>
            <th rowSpan={2} className="min-w-[70px] p-2 text-right align-bottom font-semibold text-slate-500 dark:text-slate-400">Qtd</th>
            {resumos.map(r => (
              <th key={r.propostaKey} colSpan={3} className="border-l border-slate-200 p-2 text-center font-semibold text-slate-600 dark:border-slate-800 dark:text-slate-300" title={r.nome}>
                {nomeFornecedorCurto(r.nome)}
              </th>
            ))}
          </tr>
          <tr className="border-b border-slate-200 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-800/40">
            {resumos.map(r => (
              <React.Fragment key={r.propostaKey}>
                <th className="border-l border-slate-200 p-1.5 text-left text-[10px] font-medium uppercase tracking-wide text-slate-400 dark:border-slate-800">Desc. cotada</th>
                <th className="p-1.5 text-right text-[10px] font-medium uppercase tracking-wide text-slate-400">Preço unit.</th>
                <th className="p-1.5 text-right text-[10px] font-medium uppercase tracking-wide text-slate-400">Preço total</th>
              </React.Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map(linha => (
            <tr key={linha.key} className="border-b border-slate-100 last:border-0 dark:border-slate-800/70">
              <td className="sticky left-0 z-10 max-w-[260px] bg-white p-2 align-top dark:bg-slate-900">
                <div className="truncate font-medium text-slate-800 dark:text-slate-100" title={linha.titulo}>{linha.titulo}</div>
                <div className="text-[10px] text-slate-400">{linha.ri || 'sem RI'}</div>
              </td>
              <td className="p-2 text-right align-top tabular-nums text-slate-500 dark:text-slate-400">
                {linha.qtdSolicitada != null ? `${formatQtd(linha.qtdSolicitada)} ${linha.unidade || ''}` : '—'}
              </td>
              {resumos.map(r => {
                const celula = linha.celulas.find(c => c.propostaKey === r.propostaKey);
                if (!celula) {
                  return (
                    <td key={r.propostaKey} colSpan={3} className="border-l border-slate-100 bg-orange-50/60 p-2 text-center align-top italic text-orange-400 dark:border-slate-800 dark:bg-orange-950/10 dark:text-orange-400/70">
                      sem cotação
                    </td>
                  );
                }
                const marcado = selecionados.has(celula.item._key);
                const tom = marcado
                  ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-200'
                  : celula.melhor
                    ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-300'
                    : 'text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800/60';
                const clicar = () => onMarcar(celula, linha, !marcado);
                return (
                  <React.Fragment key={r.propostaKey}>
                    <td
                      onClick={clicar}
                      title={marcado ? 'Clique para desmarcar' : 'Clique para marcar este item deste fornecedor para compra'}
                      className={`cursor-pointer border-l border-slate-100 p-2 align-top transition-colors dark:border-slate-800 ${tom}`}
                    >
                      <span className="flex items-center gap-1">
                        {marcado ? <Check className="h-3 w-3 shrink-0" /> : <ShoppingCart className="h-3 w-3 shrink-0 opacity-30" />}
                        <span className="line-clamp-2 max-w-[180px] text-[11px]" title={celula.item.descricao_produto || undefined}>
                          {celula.item.descricao_produto || 'sem descrição'}
                        </span>
                      </span>
                    </td>
                    <td onClick={clicar} className={`cursor-pointer p-2 text-right align-top tabular-nums transition-colors ${tom} ${celula.melhor || marcado ? 'font-semibold' : ''}`}>
                      {celula.custo.unitarioComparavel != null ? formatBRL(celula.custo.unitarioComparavel) : '—'}
                    </td>
                    <td onClick={clicar} className={`cursor-pointer p-2 text-right align-top tabular-nums transition-colors ${tom} ${celula.melhor || marcado ? 'font-semibold' : ''}`}>
                      {celula.custo.comparavel != null ? formatBRL(celula.custo.comparavel) : '—'}
                    </td>
                  </React.Fragment>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
