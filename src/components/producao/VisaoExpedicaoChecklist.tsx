import React, { useEffect, useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import { useToast } from '../ui/Toast';
import {
  CONFIG_CATEGORIAS,
  ORDEM_TRAMOS_VISUAL,
  calcularProgressoChecklist,
  type ApontamentoChecklistLiberacao,
  type EtapaChecklistLiberacao,
  type TorreEntregaAgrupada,
  type TramoEntrega,
  type TramoId,
} from '../../lib/producaoEntrega';
import {
  desmarcarEtapaChecklist,
  listarChecklistLiberacaoLote,
  marcarEtapaChecklist,
} from '../../lib/producaoApi';
import ModalChecklistLiberacaoTramo from './ModalChecklistLiberacaoTramo';

interface VisaoExpedicaoChecklistProps {
  torres: TorreEntregaAgrupada[];
}

/** Só entram na Visão Expedição os tramos que já chegaram a White na Visão Torres. */
const CATEGORIAS_A_PARTIR_DE_WHITE = new Set(['white', 'patio', 'expedido']);

/** Gradiente por faixa de progresso — deliberadamente distinto da paleta de 7 categorias do cilindro. */
function corProgresso(percentual: number, temTramo: boolean): { gradiente: string; corTexto: string } {
  if (!temTramo) {
    return { gradiente: 'linear-gradient(90deg, #334155 0%, #64748b 45%, #1e293b 100%)', corTexto: '#ffffff' };
  }
  if (percentual >= 100) {
    return { gradiente: 'linear-gradient(90deg, #4338ca 0%, #818cf8 45%, #3730a3 100%)', corTexto: '#ffffff' };
  }
  if (percentual > 0) {
    return { gradiente: 'linear-gradient(90deg, #2563eb 0%, #60a5fa 45%, #1d4ed8 100%)', corTexto: '#ffffff' };
  }
  return { gradiente: 'linear-gradient(90deg, #cbd5e1 0%, #e2e8f0 45%, #94a3b8 100%)', corTexto: '#1e293b' };
}

export default function VisaoExpedicaoChecklist({ torres }: VisaoExpedicaoChecklistProps) {
  const toast = useToast();

  const [apontamentos, setApontamentos] = useState<ApontamentoChecklistLiberacao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [tramoSelecionado, setTramoSelecionado] = useState<TramoEntrega | null>(null);
  const [torreSelecionada, setTorreSelecionada] = useState<TorreEntregaAgrupada | null>(null);
  const [etapaEmAndamento, setEtapaEmAndamento] = useState<string | null>(null);

  // Só entram nesta visão os tramos que já estão em White, Pátio ou Expedido na Visão Torres.
  const torresRelevantes = useMemo(() => {
    return torres
      .map(torre => {
        const tramosIds = ORDEM_TRAMOS_VISUAL.filter(id => {
          const t = torre.tramos[id];
          return !!t && CATEGORIAS_A_PARTIR_DE_WHITE.has(t.etapa_categoria);
        });
        return { torre, tramosIds };
      })
      .filter(x => x.tramosIds.length > 0);
  }, [torres]);

  const todosTramos = useMemo(
    () => torresRelevantes.flatMap(({ torre, tramosIds }) => tramosIds.map(id => torre.tramos[id] as TramoEntrega)),
    [torresRelevantes],
  );
  const idsKey = todosTramos.map(t => t.id).join(',');

  useEffect(() => {
    let cancelado = false;
    setCarregando(true);
    listarChecklistLiberacaoLote(todosTramos.map(t => t.id))
      .then(dados => {
        if (!cancelado) setApontamentos(dados);
      })
      .catch(() => {
        if (!cancelado) toast.error('Falha ao carregar checklist de liberação.');
      })
      .finally(() => {
        if (!cancelado) setCarregando(false);
      });
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  const apontamentosPorTramo = useMemo(() => {
    const mapa = new Map<string, ApontamentoChecklistLiberacao[]>();
    for (const a of apontamentos) {
      const lista = mapa.get(a.tramo_entrega_id) ?? [];
      lista.push(a);
      mapa.set(a.tramo_entrega_id, lista);
    }
    return mapa;
  }, [apontamentos]);

  const handleAbrirChecklist = (tramo: TramoEntrega, torre: TorreEntregaAgrupada) => {
    setTramoSelecionado(tramo);
    setTorreSelecionada(torre);
  };

  const handleToggleEtapa = async (etapa: EtapaChecklistLiberacao, responsavel: string) => {
    if (!tramoSelecionado) return;
    const chave = `${tramoSelecionado.id}:${etapa}`;
    const existente = (apontamentosPorTramo.get(tramoSelecionado.id) ?? []).find(a => a.etapa_codigo === etapa);
    setEtapaEmAndamento(chave);
    try {
      if (existente) {
        await desmarcarEtapaChecklist(existente.id);
        setApontamentos(prev => prev.filter(a => a.id !== existente.id));
      } else {
        const novo = await marcarEtapaChecklist(tramoSelecionado.id, etapa, responsavel);
        setApontamentos(prev => [...prev, novo]);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao atualizar checklist de liberação.');
    } finally {
      setEtapaEmAndamento(null);
    }
  };

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
          Visão Expedição — Checklist de Liberação por Tramo
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Etapas entre o tratamento de superfície (White) e a expedição ao parque eólico. Mostra
          apenas tramos que já estão em White, Pátio ou Expedido na Visão Torres. Clique em um
          tramo para apontar ou desfazer cada etapa.
        </p>
      </div>

      {carregando ? (
        <div className="py-16 text-center text-sm text-slate-400">Carregando checklist de liberação...</div>
      ) : torresRelevantes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
          Nenhum tramo em White, Pátio ou Expedido no momento com os filtros atuais.
        </div>
      ) : (
        <div className="overflow-x-auto pb-4">
          <div className="flex min-w-max items-end gap-3 px-2 py-4">
            {torresRelevantes.map(({ torre, tramosIds }) => {
              const tramosDaTorre = tramosIds.map(id => torre.tramos[id] as TramoEntrega);
              const progressoTorre = calcularProgressoChecklist(
                tramosDaTorre.flatMap(t => apontamentosPorTramo.get(t.id) ?? []),
              );
              const progressoTorreTotal = progressoTorre.total * tramosDaTorre.length || 1;
              const percentualTorre = Math.round((progressoTorre.concluidas / progressoTorreTotal) * 100);

              const tramoTopo = torre.tramos[tramosIds[0]];
              const apontamentosTopo = tramoTopo ? apontamentosPorTramo.get(tramoTopo.id) ?? [] : [];
              const progressoTopo = calcularProgressoChecklist(apontamentosTopo);
              const corTopo = corProgresso(progressoTopo.percentual, !!tramoTopo);

              return (
                <div key={torre.torre_numero} className="flex flex-col items-center" style={{ width: '138px' }}>
                  {/* Tag / Ficha da Torre */}
                  <div className="mb-2 w-full rounded-t-xl border border-slate-300 bg-slate-100 p-2 text-center shadow-sm dark:border-slate-700 dark:bg-slate-800">
                    <p className="text-[10px] font-semibold tracking-tight text-slate-500 dark:text-slate-400">
                      Checklist de Liberação
                    </p>
                    <strong className="text-xs font-black uppercase text-slate-800 dark:text-slate-100">
                      TORRE {torre.torre_numero}
                    </strong>
                    <div className="mt-1 flex items-center justify-center gap-1">
                      <span className="rounded bg-indigo-100 px-1.5 py-0.2 text-[9px] font-bold text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-200">
                        {percentualTorre}% liberado
                      </span>
                    </div>
                  </div>

                  {/* Cilindro Vertical — mesma estrutura da Visão Torres, cor por progresso do checklist */}
                  <div className="relative w-full overflow-hidden rounded-t-[28px] rounded-b-lg border-2 border-slate-700 bg-slate-900 shadow-xl dark:border-slate-600">
                    <div
                      className="h-3.5 w-full border-b border-black/30"
                      style={{
                        background: corTopo.gradiente,
                        borderTopLeftRadius: '26px',
                        borderTopRightRadius: '26px',
                      }}
                    />

                    {tramosIds.map(tramoId => {
                      const tramo = torre.tramos[tramoId] as TramoEntrega;
                      const apontamentosTramo = apontamentosPorTramo.get(tramo.id) ?? [];
                      const progresso = calcularProgressoChecklist(apontamentosTramo);
                      const cor = corProgresso(progresso.percentual, true);
                      const confCategoria = CONFIG_CATEGORIAS[tramo.etapa_categoria];

                      return (
                        <div
                          key={tramoId}
                          onClick={() => tramo && handleAbrirChecklist(tramo, torre)}
                          className="group relative cursor-pointer border-b border-black/20 p-2.5 text-center transition-all hover:brightness-110 active:scale-[0.98]"
                          style={{ background: cor.gradiente, color: cor.corTexto, minHeight: '86px' }}
                        >
                          <div className="pointer-events-none absolute inset-y-0 left-1/3 w-8 bg-gradient-to-r from-white/0 via-white/15 to-white/0" />

                          <div className="flex items-center justify-center gap-1 font-black text-xs tracking-tight">
                            <span>{tramoId}</span>
                            <span>{tramo?.serie || '—'}</span>
                          </div>

                          <div className="mt-1 text-[10px] font-bold uppercase leading-tight tracking-tight opacity-90">
                            {confCategoria?.rotulo || '—'}
                          </div>

                          <div className="mt-1.5 flex items-center justify-center">
                            {progresso.percentual >= 100 && tramo ? (
                              <span className="inline-flex items-center gap-0.5 rounded bg-black/30 px-1.5 py-0.5 text-[9px] font-bold">
                                <Check className="h-2.5 w-2.5" /> Liberado
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-0.5 rounded bg-black/30 px-1.5 py-0.5 text-[9px] font-bold">
                                {progresso.concluidas}/{progresso.total} etapas
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Legenda — escala de progresso, não de categoria */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 rounded-xl border border-slate-300 bg-slate-100 px-3 py-1.5 text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
            <span className="h-3 w-3 rounded-full bg-slate-400" />
            <span className="text-xs font-semibold">Não iniciado</span>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-blue-600 bg-blue-50 px-3 py-1.5 text-blue-800 shadow-sm dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200">
            <span className="h-3 w-3 rounded-full bg-blue-600" />
            <span className="text-xs font-semibold">Em andamento</span>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-indigo-600 bg-indigo-50 px-3 py-1.5 text-indigo-800 shadow-sm dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-200">
            <span className="h-3 w-3 rounded-full bg-indigo-600" />
            <span className="text-xs font-semibold">Liberado (11/11)</span>
          </div>
        </div>
      </div>

      {tramoSelecionado && (
        <ModalChecklistLiberacaoTramo
          tramo={tramoSelecionado}
          torre={torreSelecionada}
          apontamentos={apontamentosPorTramo.get(tramoSelecionado.id) ?? []}
          etapaEmAndamento={
            etapaEmAndamento?.startsWith(`${tramoSelecionado.id}:`)
              ? (etapaEmAndamento.split(':')[1] as EtapaChecklistLiberacao)
              : null
          }
          aoFechar={() => {
            setTramoSelecionado(null);
            setTorreSelecionada(null);
          }}
          aoToggleEtapa={handleToggleEtapa}
        />
      )}
    </section>
  );
}
