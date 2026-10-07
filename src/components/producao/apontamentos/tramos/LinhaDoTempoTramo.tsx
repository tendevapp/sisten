/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Linha do tempo de um tramo: os 5 marcos com os dias entre eles e todos os
 * lançamentos (inclusive os corrigidos, riscados, com o motivo). Corrigir ou
 * excluir pede motivo e é só do autor ou de admin — o banco confere de novo.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { History, Loader2, Pencil, Trash2 } from 'lucide-react';
import { useToast } from '../../../ui/Toast';
import {
  MARCOS_TRAMO,
  ROTULO_MARCO,
  dataCurta,
  diasEntre,
  situacoesDaEtapa,
  type EventoTramo,
  type SituacaoTramo,
  type TramoAtual,
} from '../../../../lib/producaoTramos';
import { corrigirEventoTramo, listarEventosTramo, nomesUsuarios } from '../../../../lib/producaoTramosApi';
import { btnPerigo, btnPrimario, btnSecundario, inputCls, labelCls } from '../estilos';
import type { Profile } from '../../../../types';

interface Props {
  tramo: TramoAtual;
  situacoes: SituacaoTramo[];
  hoje: string;
  user: Profile;
  onCorrigido: (offline: boolean) => void;
}

function descricao(e: EventoTramo): string {
  if (e.tipo === 'marco' && e.marco) return ROTULO_MARCO[e.marco];
  if (e.tipo === 'reparo') return `+${e.reparosSolda} reparo(s) de solda`;
  return [e.setor, e.atividade].filter(Boolean).join(' · ') || 'Situação';
}

function FormCorrecao({ evento, situacoes, hoje, onFeito, onCancelar }: {
  evento: EventoTramo;
  situacoes: SituacaoTramo[];
  hoje: string;
  onFeito: (offline: boolean) => void;
  onCancelar: () => void;
}) {
  const toast = useToast();
  const [data, setData] = useState(evento.dataOperacional);
  const [situacaoId, setSituacaoId] = useState(evento.situacaoId ?? '');
  const [reparos, setReparos] = useState(evento.reparosSolda ?? 1);
  const [motivo, setMotivo] = useState('');
  const [salvando, setSalvando] = useState(false);
  const etapaSituacao = situacoes.find(s => s.id === evento.situacaoId)?.etapa;
  const opcoes = etapaSituacao ? situacoesDaEtapa(situacoes, etapaSituacao) : situacoes.filter(s => s.ativo);

  const enviar = async (excluir: boolean) => {
    if (motivo.trim().length < 3) {
      toast.error('Informe o motivo da correção.');
      return;
    }
    setSalvando(true);
    try {
      const r = await corrigirEventoTramo({
        eventoId: evento.id,
        motivo,
        excluir,
        dataOperacional: data,
        situacaoId: evento.tipo === 'situacao' ? situacaoId || undefined : undefined,
        reparos: evento.tipo === 'reparo' ? reparos : undefined,
      });
      toast.success(r.offline ? 'Correção salva no aparelho; sobe quando a rede voltar.' : excluir ? 'Lançamento excluído.' : `Corrigido (${r.codigo}).`);
      onFeito(r.offline);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível corrigir.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="mt-2 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/60">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <span className={labelCls}>Data</span>
          <input type="date" value={data} max={hoje} onChange={e => setData(e.target.value)} className={inputCls} />
        </div>
        {evento.tipo === 'situacao' && (
          <div>
            <span className={labelCls}>Situação</span>
            <select value={situacaoId} onChange={e => setSituacaoId(e.target.value)} className={inputCls}>
              {!evento.situacaoId && <option value="">{descricao(evento)}</option>}
              {opcoes.map(s => (
                <option key={s.id} value={s.id}>
                  {s.setor} · {s.atividade}
                </option>
              ))}
            </select>
          </div>
        )}
        {evento.tipo === 'reparo' && (
          <div>
            <span className={labelCls}>Reparos</span>
            <input type="number" min={1} value={reparos} onChange={e => setReparos(Math.max(1, Math.floor(Number(e.target.value) || 1)))} className={inputCls} />
          </div>
        )}
      </div>
      <div>
        <span className={labelCls}>Motivo (obrigatório)</span>
        <input value={motivo} onChange={e => setMotivo(e.target.value)} className={inputCls} placeholder="Ex.: data digitada errada" />
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onCancelar} className={btnSecundario}>Cancelar</button>
        <button type="button" onClick={() => enviar(true)} disabled={salvando} className={btnPerigo}>
          <Trash2 className="h-3.5 w-3.5" /> Excluir
        </button>
        <button type="button" onClick={() => enviar(false)} disabled={salvando} className={btnPrimario}>
          {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Pencil className="h-3.5 w-3.5" />} Salvar correção
        </button>
      </div>
    </div>
  );
}

export default function LinhaDoTempoTramo({ tramo, situacoes, hoje, user, onCorrigido }: Props) {
  const toast = useToast();
  const [eventos, setEventos] = useState<EventoTramo[] | null>(null);
  const [nomes, setNomes] = useState<Map<string, string>>(new Map());
  const [corrigindo, setCorrigindo] = useState<string | null>(null);
  const [verCorrigidos, setVerCorrigidos] = useState(false);
  const ehAdmin = (user.roles as string[]).includes('admin');

  useEffect(() => {
    let ativo = true;
    listarEventosTramo(tramo.tramoId)
      .then(async lista => {
        if (!ativo) return;
        setEventos(lista);
        setNomes(await nomesUsuarios(lista.map(e => e.criadoPor)));
      })
      .catch(e => toast.error(e instanceof Error ? e.message : 'Não foi possível ler a linha do tempo.'));
    return () => {
      ativo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tramo.tramoId]);

  const visiveis = useMemo(() => (eventos ?? []).filter(e => verCorrigidos || !e.excluidoEm), [eventos, verCorrigidos]);
  const corrigidos = (eventos ?? []).filter(e => e.excluidoEm).length;

  return (
    <section className="space-y-3 border-t border-slate-200 pt-4 dark:border-slate-800">
      <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
        <History className="h-4 w-4" /> Linha do tempo
      </h3>

      <ol className="grid grid-cols-5 gap-1 text-center">
        {MARCOS_TRAMO.map((marco, i) => {
          const data = tramo.marcos[marco];
          const anterior = i > 0 ? tramo.marcos[MARCOS_TRAMO[i - 1]] : undefined;
          return (
            <li key={marco} className={`rounded-lg px-1 py-2 ${data ? 'bg-emerald-50 dark:bg-emerald-950/40' : 'bg-slate-50 dark:bg-slate-800/60'}`}>
              <span className="block text-[10px] font-semibold leading-tight text-slate-500">{ROTULO_MARCO[marco].replace('Liberado p/ ', '→ ')}</span>
              <span className="block font-mono text-xs font-bold text-slate-800 dark:text-slate-100">{data ? dataCurta(data).slice(0, 5) : '—'}</span>
              {data && anterior && <span className="block text-[10px] text-slate-500">{diasEntre(anterior, data)} d</span>}
            </li>
          );
        })}
      </ol>

      {!eventos ? (
        <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
      ) : (
        <>
          <ul className="space-y-2">
            {visiveis.map(e => {
              const podeCorrigir = !e.excluidoEm && (ehAdmin || e.criadoPor === user.id);
              return (
                <li key={e.id} className={`rounded-xl border px-3 py-2 text-xs ${e.excluidoEm ? 'border-dashed border-slate-300 opacity-70 dark:border-slate-700' : 'border-slate-200 dark:border-slate-800'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className={`font-semibold text-slate-800 dark:text-slate-100 ${e.excluidoEm ? 'line-through' : ''}`}>
                        {dataCurta(e.dataOperacional)} — {descricao(e)}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {e.codigo} · {nomes.get(e.criadoPor) || 'usuário'}
                        {e.origem === 'importacao' ? ' · importado da planilha' : ''}
                        {e.corrigeEventoId ? ' · correção' : ''}
                      </p>
                      {e.observacao && <p className="mt-0.5 text-[11px] italic text-slate-600 dark:text-slate-300">{e.observacao}</p>}
                      {e.excluidoEm && <p className="mt-0.5 text-[11px] text-rose-700 dark:text-rose-300">Corrigido/excluído: {e.motivoExclusao}</p>}
                    </div>
                    {podeCorrigir && corrigindo !== e.id && (
                      <button type="button" onClick={() => setCorrigindo(e.id)} className="shrink-0 rounded-lg px-2 py-1 font-bold text-blue-700 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-950/40">
                        Corrigir
                      </button>
                    )}
                  </div>
                  {corrigindo === e.id && (
                    <FormCorrecao
                      evento={e}
                      situacoes={situacoes}
                      hoje={hoje}
                      onCancelar={() => setCorrigindo(null)}
                      onFeito={offline => {
                        setCorrigindo(null);
                        onCorrigido(offline);
                      }}
                    />
                  )}
                </li>
              );
            })}
            {!visiveis.length && <li className="text-xs text-slate-500">Nenhum apontamento ainda.</li>}
          </ul>
          {corrigidos > 0 && (
            <button type="button" onClick={() => setVerCorrigidos(v => !v)} className="text-[11px] font-semibold text-slate-500 hover:underline">
              {verCorrigidos ? 'Ocultar' : 'Mostrar'} {corrigidos} lançamento(s) corrigido(s)
            </button>
          )}
        </>
      )}
    </section>
  );
}
