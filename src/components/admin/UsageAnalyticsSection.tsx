/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Análise de logs de uso das APIs de IA — dentro de Gestão de APIs
 * (/admin/apis). Une o histórico das três fontes de telemetria do projeto
 * (ver src/lib/apiUsageApi.ts) e agrega por modelo: quantas chamadas, com
 * que modelo, quantos tokens, custo estimado e taxa de sucesso.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { BarChart3, RefreshCw, Coins, DollarSign, CheckCircle2, XCircle, Loader2, User } from 'lucide-react';
import { listarUsoApis, type ApiUsoRegistro, type PeriodoUso } from '../../lib/apiUsageApi';
import { formatDuration, formatCustoBrl, formatDateTimeBR } from '../../lib/format';
import { TableShell, TableHeadRow, Th, TableBody, Tr, Td, TableEmpty } from '../ui/DataTable';

const PERIODOS: { valor: PeriodoUso; label: string }[] = [
  { valor: '24h', label: '24 horas' },
  { valor: '7d', label: '7 dias' },
  { valor: '30d', label: '30 dias' },
  { valor: 'tudo', label: 'Tudo' },
];

interface UsageAnalyticsSectionProps {
  /** id da API (ver APIS_DISPONIVEIS em ApiManagement.tsx) → nome amigável, para rotular a coluna "API" da tabela de chamadas recentes. */
  nomesPorApiId: Record<string, string>;
}

export default function UsageAnalyticsSection({ nomesPorApiId }: UsageAnalyticsSectionProps) {
  const [periodo, setPeriodo] = useState<PeriodoUso>('7d');
  const [registros, setRegistros] = useState<ApiUsoRegistro[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = async (p: PeriodoUso) => {
    setCarregando(true);
    setErro(null);
    try {
      setRegistros(await listarUsoApis(p));
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => { carregar(periodo); }, [periodo]);

  const totais = useMemo(() => {
    const totalChamadas = registros.length;
    const sucessos = registros.filter(r => r.sucesso).length;
    const tokens = registros.reduce((soma, r) => soma + (r.tokens ?? 0), 0);
    let custoBrl = 0;
    let temCusto = false;
    for (const r of registros) {
      const c = r.custoBrl ?? (r.custoUsd != null ? r.custoUsd * 6 : null);
      if (c != null) { custoBrl += c; temCusto = true; }
    }
    return {
      totalChamadas,
      taxaSucesso: totalChamadas > 0 ? sucessos / totalChamadas : null,
      tokens,
      custoBrl: temCusto ? custoBrl : null,
    };
  }, [registros]);

  const porModelo = useMemo(() => {
    const mapa = new Map<string, {
      modelo: string; chamadas: number; sucessos: number; tokens: number;
      custoBrl: number; temCusto: boolean; duracaoSomaMs: number; duracaoQtd: number;
    }>();
    for (const r of registros) {
      const chave = r.modelo ?? '(modelo não informado)';
      const entrada = mapa.get(chave) ?? { modelo: chave, chamadas: 0, sucessos: 0, tokens: 0, custoBrl: 0, temCusto: false, duracaoSomaMs: 0, duracaoQtd: 0 };
      entrada.chamadas += 1;
      if (r.sucesso) entrada.sucessos += 1;
      entrada.tokens += r.tokens ?? 0;
      const c = r.custoBrl ?? (r.custoUsd != null ? r.custoUsd * 6 : null);
      if (c != null) { entrada.custoBrl += c; entrada.temCusto = true; }
      if (r.duracaoMs != null) { entrada.duracaoSomaMs += r.duracaoMs; entrada.duracaoQtd += 1; }
      mapa.set(chave, entrada);
    }
    return Array.from(mapa.values()).sort((a, b) => b.chamadas - a.chamadas);
  }, [registros]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-200">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-800">Logs de Uso & Análise por Modelo</h3>
            <p className="text-xs text-slate-500">Chamadas reais às APIs de IA — qual modelo atendeu, tokens e custo estimado.</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-slate-200 p-0.5">
            {PERIODOS.map(p => (
              <button
                key={p.valor}
                type="button"
                onClick={() => setPeriodo(p.valor)}
                className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors cursor-pointer ${
                  periodo === p.valor ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-100'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => carregar(periodo)} disabled={carregando} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-indigo-600 disabled:opacity-50">
            <RefreshCw className={`h-3.5 w-3.5 ${carregando ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {erro && (
        <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800">{erro}</div>
      )}

      {carregando ? (
        <div className="flex items-center justify-center py-12 text-slate-400">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : registros.length === 0 ? (
        <TableEmpty icon={BarChart3} title="Nenhuma chamada registrada neste período" hint="Use o Playground acima ou converta um arquivo por IA para gerar o primeiro registro." />
      ) : (
        <>
          {/* Cartões de resumo */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-xl border border-slate-200 p-3">
              <p className="text-[11px] text-slate-400">Chamadas</p>
              <p className="text-lg font-bold text-slate-800">{totais.totalChamadas.toLocaleString('pt-BR')}</p>
            </div>
            <div className="rounded-xl border border-slate-200 p-3">
              <p className="text-[11px] text-slate-400">Taxa de sucesso</p>
              <p className={`text-lg font-bold ${totais.taxaSucesso != null && totais.taxaSucesso < 0.9 ? 'text-amber-600' : 'text-emerald-600'}`}>
                {totais.taxaSucesso != null ? `${Math.round(totais.taxaSucesso * 100)}%` : '—'}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 p-3">
              <p className="flex items-center gap-1 text-[11px] text-slate-400"><Coins className="h-3 w-3" /> Tokens</p>
              <p className="text-lg font-bold text-slate-800">{totais.tokens.toLocaleString('pt-BR')}</p>
            </div>
            <div className="rounded-xl border border-slate-200 p-3">
              <p className="flex items-center gap-1 text-[11px] text-slate-400"><DollarSign className="h-3 w-3" /> Custo estimado (R$)</p>
              <p className="text-lg font-bold text-slate-800">{totais.custoBrl != null ? formatCustoBrl(totais.custoBrl) : '—'}</p>
            </div>
          </div>

          {/* Por modelo */}
          <div>
            <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Por modelo de IA</h4>
            <TableShell maxHeight="40vh">
              <table className="w-full text-xs">
                <TableHeadRow>
                  <Th label="Modelo" />
                  <Th label="Chamadas" align="right" />
                  <Th label="Sucesso" align="right" />
                  <Th label="Tokens" align="right" />
                  <Th label="Custo (R$)" align="right" />
                  <Th label="Duração média" align="right" />
                </TableHeadRow>
                <TableBody>
                  {porModelo.map(m => (
                    <Tr key={m.modelo}>
                      <Td mono>{m.modelo}</Td>
                      <Td align="right" numeric>{m.chamadas.toLocaleString('pt-BR')}</Td>
                      <Td align="right" numeric>{Math.round((m.sucessos / m.chamadas) * 100)}%</Td>
                      <Td align="right" numeric>{m.tokens.toLocaleString('pt-BR')}</Td>
                      <Td align="right" numeric>{m.temCusto ? formatCustoBrl(m.custoBrl) : '—'}</Td>
                      <Td align="right" numeric>{m.duracaoQtd > 0 ? formatDuration(m.duracaoSomaMs / m.duracaoQtd) : '—'}</Td>
                    </Tr>
                  ))}
                </TableBody>
              </table>
            </TableShell>
          </div>

          {/* Chamadas recentes */}
          <div>
            <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Chamadas recentes</h4>
            <TableShell maxHeight="45vh">
              <table className="w-full text-xs">
                <TableHeadRow>
                  <Th label="Quando" />
                  <Th label="Usuário" />
                  <Th label="API" />
                  <Th label="Modelo" />
                  <Th label="Tokens" align="right" />
                  <Th label="Custo (R$)" align="right" />
                  <Th label="Duração" align="right" />
                  <Th label="Status" />
                </TableHeadRow>
                <TableBody>
                  {registros.slice(0, 100).map((r, idx) => (
                    <Tr key={idx}>
                      <Td>{formatDateTimeBR(r.createdAt)}</Td>
                      <Td>
                        <span className="inline-flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-200" title={r.userName ?? 'Sistema'}>
                          <User className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          <span className="truncate max-w-[130px]">{r.userName || 'Sistema'}</span>
                        </span>
                      </Td>
                      <Td>{nomesPorApiId[r.apiId] ?? r.apiId}</Td>
                      <Td mono>{r.modelo ?? '—'}</Td>
                      <Td align="right" numeric>{r.tokens != null ? r.tokens.toLocaleString('pt-BR') : '—'}</Td>
                      <Td align="right" numeric>{formatCustoBrl(r.custoBrl ?? (r.custoUsd != null ? r.custoUsd * 6 : null))}</Td>
                      <Td align="right" numeric>{formatDuration(r.duracaoMs)}</Td>
                      <Td>
                        {r.sucesso ? (
                          <span className="inline-flex items-center gap-1 text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" /> OK</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-rose-600"><XCircle className="h-3.5 w-3.5" /> Falhou</span>
                        )}
                      </Td>
                    </Tr>
                  ))}
                </TableBody>
              </table>
            </TableShell>
            {registros.length > 100 && (
              <p className="mt-1.5 text-[11px] text-slate-400">Mostrando as 100 mais recentes de {registros.length.toLocaleString('pt-BR')}.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
