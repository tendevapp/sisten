/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Treinamentos › setor — as trilhas de um setor ou de uma área que agrupa
 * setores (`?setor=<core_setores.id | 'contab-fin'>`)
 * com o progresso do colaborador. Quem gerencia (admin ou `trein_gerenciar`)
 * cadastra, edita, ativa/desativa e vê os participantes.
 */

import React from 'react';
import {
  ArrowLeft, CheckCircle2, Clock, Eye, EyeOff, Layers, Loader2, Pencil, PlayCircle, Plus, RotateCcw, Star, Users,
} from 'lucide-react';
import { useToast } from '../../components/ui/Toast';
import { canGerenciarTreinamentos } from '../../lib/pages';
import { localDb } from '../../db/localDb';
import { alterarAtivoTrilha, listarMeuProgresso, listarTrilhas } from '../../lib/treinamentosApi';
import {
  resumirProgresso, STATUS_TRILHA_ROTULO, type ProgressoMissao, type TrilhaTreinamento,
} from '../../lib/treinamentos';
import { areaIdDoSetor, areaTreinamento, parametroDoHash, visualSetor } from '../../components/treinamentos/setoresVisual';
import TrilhaFormModal from '../../components/treinamentos/TrilhaFormModal';
import ParticipantesTrilhaModal from '../../components/treinamentos/ParticipantesTrilhaModal';
import type { Profile } from '../../types';

interface Props {
  user: Profile;
  onNavigate: (path: string) => void;
}

const STATUS_COR = {
  nao_iniciada: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  em_andamento: 'bg-orange-100 text-orange-800 dark:bg-orange-950/60 dark:text-orange-300',
  concluida: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300',
} as const;

export default function TreinamentosSetor({ user, onNavigate }: Props) {
  const toast = useToast();
  const gerencia = canGerenciarTreinamentos(user);
  // Trocar de setor muda só a query: a rota é a mesma e a tela não remonta.
  const [, redesenhar] = React.useReducer((x: number) => x + 1, 0);
  React.useEffect(() => {
    window.addEventListener('hashchange', redesenhar);
    return () => window.removeEventListener('hashchange', redesenhar);
  }, []);
  const param = parametroDoHash('setor') ?? '';
  const area = areaTreinamento(param, localDb.getSectors());
  const areaId = area?.id ?? param;
  const setorIds = React.useMemo(() => area?.setorIds ?? [param], [area?.id, param]);
  const vis = area?.visual ?? visualSetor(param);
  const Icon = vis.icon;

  const [trilhas, setTrilhas] = React.useState<TrilhaTreinamento[]>([]);
  const [progresso, setProgresso] = React.useState<ProgressoMissao[]>([]);
  const [carregando, setCarregando] = React.useState(true);
  const [editando, setEditando] = React.useState<TrilhaTreinamento | 'nova' | null>(null);
  const [participantes, setParticipantes] = React.useState<TrilhaTreinamento | null>(null);

  const carregar = React.useCallback(() => {
    setCarregando(true);
    Promise.all([listarTrilhas(), listarMeuProgresso(user.id)])
      .then(([t, p]) => {
        setTrilhas(t.filter(x => setorIds.includes(x.setor_id) && (x.ativo || gerencia)));
        setProgresso(p);
      })
      .catch(err => toast.error(`Não foi possível carregar as trilhas: ${err?.message ?? err}`))
      .finally(() => setCarregando(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id, setorIds, gerencia]);

  React.useEffect(carregar, [carregar]);

  const alternarAtivo = async (t: TrilhaTreinamento) => {
    try {
      await alterarAtivoTrilha(t.id, !t.ativo);
      toast.success(t.ativo ? 'Trilha desativada: some para os colaboradores.' : 'Trilha ativada.');
      carregar();
    } catch (err: any) {
      toast.error(`Não foi possível alterar: ${err?.message ?? err}`);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-16">
      <div>
        <button
          type="button"
          onClick={() => onNavigate('/treinamentos')}
          className="group mb-3 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-bold text-slate-700 shadow-xs transition hover:border-blue-400 hover:text-blue-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
        >
          <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-1" />
          Voltar para Treinamentos
        </button>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className={`flex h-11 w-11 items-center justify-center rounded-2xl ${vis.corIcone}`}>
              <Icon className="h-6 w-6" />
            </span>
            <div>
              <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-slate-50">{area?.nome ?? 'Setor'}</h1>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Trilhas de treinamento do setor</p>
            </div>
          </div>
          {gerencia && (
            <button
              type="button"
              onClick={() => setEditando('nova')}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" /> Nova trilha
            </button>
          )}
        </div>
      </div>

      {carregando ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando trilhas...
        </div>
      ) : trilhas.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500 dark:border-slate-800">
          Nenhuma trilha cadastrada para este setor{gerencia ? ' — use "Nova trilha" para cadastrar a primeira.' : '.'}
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {trilhas.map(t => {
            const r = resumirProgresso(t, progresso);
            const acao = r.status === 'concluida' ? 'Revisar trilha' : r.status === 'em_andamento' ? 'Continuar' : 'Começar trilha';
            const AcaoIcon = r.status === 'concluida' ? RotateCcw : PlayCircle;
            return (
              <article
                key={t.id}
                className={`flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs dark:border-slate-800 dark:bg-slate-900 ${t.ativo ? '' : 'opacity-60'}`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded bg-slate-900 px-2 py-0.5 font-mono text-[11px] font-bold text-white dark:bg-slate-100 dark:text-slate-900">{t.codigo}</span>
                  {t.revisao && <span className="text-[11px] font-semibold text-slate-400">{t.revisao}</span>}
                  <span className={`ml-auto rounded-full px-2.5 py-0.5 text-[11px] font-bold ${STATUS_COR[r.status]}`}>
                    {STATUS_TRILHA_ROTULO[r.status]}
                  </span>
                  {!t.ativo && <span className="rounded-full bg-slate-200 px-2.5 py-0.5 text-[11px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">Inativa</span>}
                </div>

                <h2 className="mt-3 text-lg font-bold text-slate-900 dark:text-slate-100">{t.titulo}</h2>
                {t.descricao && <p className="mt-1 text-sm leading-relaxed text-slate-500 dark:text-slate-400">{t.descricao}</p>}

                <div className="mt-3 flex flex-wrap gap-3 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  <span className="inline-flex items-center gap-1"><Layers className="h-3.5 w-3.5" /> {t.total_missoes} missões</span>
                  {t.duracao_min && <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> ≈ {t.duracao_min} min</span>}
                  {r.xp > 0 && <span className="inline-flex items-center gap-1"><Star className="h-3.5 w-3.5" /> {r.xp} XP · {r.estrelas} estrelas</span>}
                </div>

                <div className="mt-4">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-600 dark:text-slate-300">
                    <span>{r.missoesConcluidas}/{r.total} missões concluídas</span>
                    <span>{r.percentual}%</span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      className={`h-full rounded-full transition-all ${r.status === 'concluida' ? 'bg-emerald-500' : 'bg-gradient-to-r from-teal-500 to-orange-500'}`}
                      style={{ width: `${r.percentual}%` }}
                    />
                  </div>
                  {r.concluidaEm && (
                    <p className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Concluída em {new Date(r.concluidaEm).toLocaleDateString('pt-BR')}
                    </p>
                  )}
                </div>

                <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
                  <button
                    type="button"
                    disabled={!t.ativo}
                    onClick={() => onNavigate(`/treinamentos/trilha?id=${t.id}`)}
                    className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <AcaoIcon className="h-4 w-4" /> {acao}
                  </button>
                  {gerencia && (
                    <div className="ml-auto flex flex-wrap gap-1">
                      <button type="button" onClick={() => setParticipantes(t)} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
                        <Users className="h-3.5 w-3.5" /> Participantes
                      </button>
                      <button type="button" onClick={() => setEditando(t)} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
                        <Pencil className="h-3.5 w-3.5" /> Editar
                      </button>
                      <button type="button" onClick={() => alternarAtivo(t)} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
                        {t.ativo ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />} {t.ativo ? 'Desativar' : 'Ativar'}
                      </button>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {editando && (
        <TrilhaFormModal
          setorId={setorIds[0]}
          trilha={editando === 'nova' ? undefined : editando}
          onClose={() => setEditando(null)}
          onSalvo={salvo => {
            setEditando(null);
            if (areaIdDoSetor(salvo.setor_id) !== areaId) onNavigate(`/treinamentos/setor?setor=${encodeURIComponent(areaIdDoSetor(salvo.setor_id))}`);
            else carregar();
          }}
        />
      )}
      {participantes && <ParticipantesTrilhaModal trilha={participantes} onClose={() => setParticipantes(null)} />}
    </div>
  );
}
