/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Admin → Central de Sincronização. Mostra, por aparelho, o que ficou na fila
 * offline (formulários, checklists da Qualidade, outbox da Produção): quantos
 * itens, há quanto tempo, e o último erro que o servidor devolveu.
 *
 * Os dados vêm de `ops_sincronizacao_aparelhos`, que cada aparelho alimenta
 * sozinho (lib/offline/reporterSincronizacao.ts). Um aparelho sem sinal não
 * consegue reportar: ele aparece com o último estado conhecido e a marca
 * "Sem reportar", em vez de parecer em dia.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, CloudOff, Hourglass, Loader2, RefreshCw, RefreshCcwDot, WifiOff } from 'lucide-react';
import type { Profile } from '../../types';
import { supabase } from '../../db/supabaseClient';
import KpiCard from '../../components/charts/KpiCard';
import {
  TableBody, TableCardRow, TableCards, TableDesktop, TableEmpty, TableHeadRow, TableShell, Td, Th, Tr,
} from '../../components/ui/DataTable';
import {
  PRIORIDADE_ESTADO,
  ROTULO_ESTADO,
  classificarAparelho,
  formatarIdade,
  type ContagemFila,
  type EstadoAparelho,
} from '../../lib/offline/snapshotSincronizacao';

interface Props {
  user: Profile;
}

interface LinhaBanco {
  device_id: string;
  user_id: string;
  user_name: string | null;
  plataforma: string | null;
  online: boolean;
  pendentes: number;
  com_erro: number;
  mais_antigo_em: string | null;
  ultimo_erro: string | null;
  ultimo_erro_rotulo: string | null;
  detalhes: Partial<Record<'formularios' | 'qualidade' | 'producao', ContagemFila>> | null;
  reportado_em: string;
}

interface Aparelho extends LinhaBanco {
  estado: EstadoAparelho;
}

const ATUALIZAR_MS = 30_000;

const COR_ESTADO: Record<EstadoAparelho, string> = {
  erro: 'var(--status-critical)',
  parado: 'var(--status-warning)',
  sumiu: 'var(--status-warning)',
  pendente: 'var(--ink-muted)',
  ok: 'var(--status-good)',
};

const CLASSE_BADGE: Record<EstadoAparelho, string> = {
  erro: 'bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300',
  parado: 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300',
  sumiu: 'bg-orange-100 text-orange-800 dark:bg-orange-950/50 dark:text-orange-300',
  pendente: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  ok: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300',
};

const ROTULO_FILA: Record<'formularios' | 'qualidade' | 'producao', string> = {
  formularios: 'Formulários',
  qualidade: 'Qualidade',
  producao: 'Produção',
};

function Badge({ estado }: { estado: EstadoAparelho }) {
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${CLASSE_BADGE[estado]}`}>
      {ROTULO_ESTADO[estado]}
    </span>
  );
}

/** "Formulários 2 · Qualidade 1": só as filas que têm algo. */
function resumoDasFilas(a: Aparelho): string {
  const partes = (Object.keys(ROTULO_FILA) as (keyof typeof ROTULO_FILA)[])
    .map(k => ({ k, n: a.detalhes?.[k]?.pendentes ?? 0 }))
    .filter(p => p.n > 0)
    .map(p => `${ROTULO_FILA[p.k]} ${p.n}`);
  return partes.join(' · ');
}

function textoErro(a: Aparelho): string {
  if (!a.ultimo_erro) return '—';
  return a.ultimo_erro_rotulo ? `${a.ultimo_erro_rotulo}: ${a.ultimo_erro}` : a.ultimo_erro;
}

const idCurto = (a: Aparelho) => a.device_id.slice(0, 8);

export default function CentralSincronizacao({ user: _user }: Props) {
  const [linhas, setLinhas] = useState<LinhaBanco[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [agora, setAgora] = useState(() => Date.now());
  const [soProblema, setSoProblema] = useState(true);

  const carregar = useCallback(async () => {
    setCarregando(true);
    const { data, error } = await (supabase.from as any)('ops_sincronizacao_aparelhos')
      .select('*')
      .order('reportado_em', { ascending: false })
      .limit(500);
    if (error) {
      setErro(error.message || 'Não foi possível carregar os aparelhos.');
    } else {
      setErro(null);
      setLinhas((data ?? []) as LinhaBanco[]);
    }
    setAgora(Date.now());
    setCarregando(false);
  }, []);

  useEffect(() => {
    void carregar();
    const id = window.setInterval(() => void carregar(), ATUALIZAR_MS);
    return () => window.clearInterval(id);
  }, [carregar]);

  const aparelhos: Aparelho[] = useMemo(
    () =>
      (linhas ?? [])
        .map(l => ({
          ...l,
          estado: classificarAparelho(
            { pendentes: l.pendentes, comErro: l.com_erro, maisAntigoEm: l.mais_antigo_em, online: l.online, reportadoEm: l.reportado_em },
            agora,
          ),
        }))
        .sort(
          (a, b) =>
            PRIORIDADE_ESTADO[a.estado] - PRIORIDADE_ESTADO[b.estado] ||
            b.pendentes - a.pendentes ||
            b.reportado_em.localeCompare(a.reportado_em),
        ),
    [linhas, agora],
  );

  const contagem = useMemo(() => {
    const por = (e: EstadoAparelho) => aparelhos.filter(a => a.estado === e).length;
    return {
      erro: por('erro'),
      parado: por('parado'),
      sumiu: por('sumiu'),
      pendencias: aparelhos.reduce((s, a) => s + a.pendentes, 0),
    };
  }, [aparelhos]);

  const visiveis = soProblema ? aparelhos.filter(a => a.estado !== 'ok') : aparelhos;

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-5 dark:border-slate-800">
        <div>
          <h2 className="flex items-center gap-2.5 text-2xl font-extrabold text-slate-850 dark:text-slate-50">
            <RefreshCcwDot className="h-7 w-7 text-emerald-600 dark:text-emerald-500" />
            Central de Sincronização
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-555 dark:text-slate-400">
            O que cada aparelho ainda tem na fila offline. Cada aparelho reporta sozinho; um aparelho sem sinal não consegue,
            então aparece com o último estado conhecido e a marca “Sem reportar”.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void carregar()}
          disabled={carregando}
          className="flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-bold disabled:opacity-60"
          style={{ borderColor: 'var(--hairline)', color: 'var(--ink-primary)', background: 'var(--surface-card)' }}
        >
          {carregando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Atualizar
        </button>
      </div>

      {erro ? (
        <TableEmpty icon={AlertTriangle} title="Não foi possível carregar a central" hint={erro} />
      ) : !linhas ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="skeleton h-24 rounded-xl" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard label="Com erro" value={contagem.erro} icon={AlertTriangle} accent="var(--status-critical)" detail="O servidor recusou algo" emphasize={contagem.erro > 0} />
            <KpiCard label="Parados" value={contagem.parado} icon={Hourglass} accent="var(--status-warning)" detail="Online, fila parada há mais de 30 min" />
            <KpiCard label="Sem reportar" value={contagem.sumiu} icon={WifiOff} accent="var(--status-warning)" detail="Com fila e calados há mais de 30 min" />
            <KpiCard label="Itens na fila" value={contagem.pendencias} icon={CloudOff} detail={`${aparelhos.length} aparelhos monitorados`} />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold" style={{ color: 'var(--ink-secondary)' }}>
              <input type="checkbox" checked={soProblema} onChange={e => setSoProblema(e.target.checked)} className="h-4 w-4 rounded" />
              Só com problema ou fila
            </label>
            <span className="text-xs tabular" style={{ color: 'var(--ink-muted)' }}>
              Atualizado {formatarIdade(new Date(agora).toISOString(), Date.now())} · a cada 30 s
            </span>
          </div>

          {visiveis.length === 0 ? (
            <TableEmpty
              icon={CheckCircle2}
              title={aparelhos.length === 0 ? 'Nenhum aparelho reportou ainda' : 'Nenhum aparelho com fila ou problema'}
              hint={
                aparelhos.length === 0
                  ? 'Os aparelhos começam a reportar ao abrir o SISTEN. Se ninguém aparece, a migration da central pode ainda não ter sido aplicada.'
                  : 'Todos os aparelhos que reportaram estão com a fila vazia. Desmarque o filtro para ver todos.'
              }
            />
          ) : (
            <>
              <TableCards>
                {visiveis.map(a => (
                  <TableCardRow key={`${a.device_id}:${a.user_id}`} accent={COR_ESTADO[a.estado]}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold" style={{ color: 'var(--ink-primary)' }}>{a.user_name || 'Usuário'}</p>
                        <p className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>{a.plataforma || 'Dispositivo'} · {idCurto(a)}</p>
                      </div>
                      <Badge estado={a.estado} />
                    </div>
                    <p className="text-xs" style={{ color: 'var(--ink-secondary)' }}>
                      <strong>{a.pendentes}</strong> na fila{a.com_erro > 0 ? ` · ${a.com_erro} com erro` : ''}
                      {a.mais_antigo_em ? ` · a mais antiga ${formatarIdade(a.mais_antigo_em, agora)}` : ''}
                    </p>
                    {resumoDasFilas(a) && <p className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>{resumoDasFilas(a)}</p>}
                    {a.ultimo_erro && <p className="break-words text-[11px] text-rose-600 dark:text-rose-400">{textoErro(a)}</p>}
                    <p className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
                      Último report {formatarIdade(a.reportado_em, agora)} · {a.online ? 'online' : 'sem rede'}
                    </p>
                  </TableCardRow>
                ))}
              </TableCards>

              <TableDesktop>
                <TableShell>
                  <table className="w-full text-xs">
                    <TableHeadRow>
                      <Th label="Estado" />
                      <Th label="Usuário" />
                      <Th label="Aparelho" />
                      <Th label="Na fila" align="right" />
                      <Th label="Mais antiga" />
                      <Th label="Último erro" />
                      <Th label="Último report" />
                    </TableHeadRow>
                    <TableBody>
                      {visiveis.map(a => (
                        <Tr key={`${a.device_id}:${a.user_id}`} accent={COR_ESTADO[a.estado]}>
                          <Td><Badge estado={a.estado} /></Td>
                          <Td strong>{a.user_name || 'Usuário'}</Td>
                          <Td>
                            <span className="block">{a.plataforma || 'Dispositivo'}</span>
                            <span className="font-mono text-[10px]" style={{ color: 'var(--ink-muted)' }}>{idCurto(a)}</span>
                          </Td>
                          <Td align="right" numeric title={resumoDasFilas(a)}>
                            <strong>{a.pendentes}</strong>
                            {a.com_erro > 0 && <span className="ml-1 text-rose-600 dark:text-rose-400">({a.com_erro} erro)</span>}
                            {resumoDasFilas(a) && <span className="block text-[10px]" style={{ color: 'var(--ink-muted)' }}>{resumoDasFilas(a)}</span>}
                          </Td>
                          <Td>{a.mais_antigo_em ? formatarIdade(a.mais_antigo_em, agora) : '—'}</Td>
                          <Td truncate title={textoErro(a)}>{textoErro(a)}</Td>
                          <Td>
                            {formatarIdade(a.reportado_em, agora)}
                            <span className="block text-[10px]" style={{ color: 'var(--ink-muted)' }}>{a.online ? 'online' : 'sem rede'}</span>
                          </Td>
                        </Tr>
                      ))}
                    </TableBody>
                  </table>
                </TableShell>
              </TableDesktop>
            </>
          )}
        </>
      )}
    </div>
  );
}
