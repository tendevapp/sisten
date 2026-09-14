/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Produção > Lançamentos — hub de cards por etapa (Corte, Chanfro, Calandra,
 * Solda SAW nos Blocos 1-2), mesmo modelo arquitetural do Hub da Portaria e
 * do Recebimento do Almoxarifado: um card por etapa, cada um abre a fila de
 * peças pendentes daquela etapa.
 *
 * Offline-first: reprocessa o outbox ao montar, ao voltar `online` e ao
 * ganhar foco — mesma cadência do `syncFromSupabase` do core do app.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Loader2, Flame, Layers, RotateCw, Scissors, Search, WifiOff, RefreshCw, Eye } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useToast } from '../../components/ui/Toast';
import LancamentoModal from '../../components/producao/LancamentoModal';
import FichaVirolaModal from '../../components/producao/FichaVirolaModal';
import type { Profile, RhPessoa } from '../../types';
import { listarRhPessoas } from '../../lib/rhApi';
import { listarSubprojetos } from '../../lib/projetosApi';
import { canAccessPage } from '../../lib/pages';
import type { ProjSubprojeto } from '../../types';
import {
  listarEtapasAtivas,
  listarFilaEtapa,
  contarFilaPorEtapa,
  contarPendentesOutbox,
  processarFilaLancamentos,
  assinarMudancasOutbox,
  type EtapaProducao,
  type FilaItemProducao,
} from '../../lib/producaoApi';

interface Props {
  user: Profile;
  onNavigate: (path: string) => void;
}

const ICONE_ETAPA: Record<string, LucideIcon> = {
  corte: Scissors,
  chanfro: Layers,
  calandra: RotateCw,
  solda: Flame,
};

const LIMITE_LISTA = 200;

export default function ProducaoLancamentos({ user }: Props) {
  const toast = useToast();
  const [carregandoBase, setCarregandoBase] = useState(true);
  const [etapas, setEtapas] = useState<EtapaProducao[]>([]);
  const [subprojetos, setSubprojetos] = useState<ProjSubprojeto[]>([]);
  const [subprojetoId, setSubprojetoId] = useState<string>('');
  const [pessoas, setPessoas] = useState<RhPessoa[]>([]);
  const [contagens, setContagens] = useState<Record<string, number>>({});

  const [etapaAtivaId, setEtapaAtivaId] = useState<string | null>(null);
  const [fila, setFila] = useState<FilaItemProducao[]>([]);
  const [carregandoFila, setCarregandoFila] = useState(false);
  const [filtroTorre, setFiltroTorre] = useState('');
  const [filtroTexto, setFiltroTexto] = useState('');

  const [lancamentoAberto, setLancamentoAberto] = useState<FilaItemProducao | null>(null);
  const [fichaAberta, setFichaAberta] = useState<FilaItemProducao | null>(null);
  const [pendentesOutbox, setPendentesOutbox] = useState(0);
  const [sincronizando, setSincronizando] = useState(false);

  const etapaAtiva = etapas.find(e => e.id === etapaAtivaId) ?? null;
  // A página permite abrir a operação; as flags de ação determinam quais
  // estações cada pessoa realmente pode lançar. Ex.: UT não enxerga Corte.
  const etapasVisiveis = useMemo(
    () => etapas.filter(etapa => canAccessPage(user, `prod_lancar_${etapa.id}`)),
    [etapas, user],
  );

  const recarregarContagens = useCallback(
    (listaEtapas: EtapaProducao[], subp: string) => {
      contarFilaPorEtapa(listaEtapas.map(e => e.id), subp || null)
        .then(setContagens)
        .catch(() => {});
    },
    [],
  );

  // Carga inicial: etapas ativas, subprojetos, pessoas.
  useEffect(() => {
    let montado = true;
    (async () => {
      try {
        const [listaEtapas, listaSubprojetos, listaPessoas] = await Promise.all([
          listarEtapasAtivas(),
          listarSubprojetos(),
          listarRhPessoas().catch(() => [] as RhPessoa[]),
        ]);
        if (!montado) return;
        setEtapas(listaEtapas);
        setSubprojetos(listaSubprojetos);
        const padrao = listaSubprojetos.find(s => s.ativo)?.id ?? listaSubprojetos[0]?.id ?? '';
        setSubprojetoId(padrao);
        setPessoas(listaPessoas);
        recarregarContagens(listaEtapas, padrao);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Não foi possível carregar o módulo de Produção.');
      } finally {
        if (montado) setCarregandoBase(false);
      }
    })();
    return () => {
      montado = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Outbox: tenta reenviar ao montar, ao voltar online e ao ganhar foco.
  useEffect(() => {
    let ativo = true;
    const tentarEnviar = async () => {
      setSincronizando(true);
      try {
        const { enviados } = await processarFilaLancamentos();
        if (ativo && enviados > 0) {
          toast.success(`${enviados} lançamento(s) pendente(s) sincronizado(s).`);
          if (etapaAtivaId) carregarFila(etapaAtivaId);
          recarregarContagens(etapas, subprojetoId);
        }
      } finally {
        if (ativo) setSincronizando(false);
      }
    };
    contarPendentesOutbox().then(n => ativo && setPendentesOutbox(n));
    tentarEnviar();
    const unsub = assinarMudancasOutbox(() => {
      contarPendentesOutbox().then(n => ativo && setPendentesOutbox(n));
    });
    const aoFicarOnline = () => tentarEnviar();
    const aoVisivel = () => {
      if (document.visibilityState === 'visible') tentarEnviar();
    };
    window.addEventListener('online', aoFicarOnline);
    document.addEventListener('visibilitychange', aoVisivel);
    return () => {
      ativo = false;
      unsub();
      window.removeEventListener('online', aoFicarOnline);
      document.removeEventListener('visibilitychange', aoVisivel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [etapas, subprojetoId, etapaAtivaId]);

  const carregarFila = useCallback((etapaId: string) => {
    setCarregandoFila(true);
    listarFilaEtapa(etapaId, subprojetoId || null)
      .then(setFila)
      .catch(err => toast.error(err instanceof Error ? err.message : 'Não foi possível carregar a fila.'))
      .finally(() => setCarregandoFila(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subprojetoId]);

  useEffect(() => {
    if (etapaAtivaId) carregarFila(etapaAtivaId);
  }, [etapaAtivaId, carregarFila]);

  const filaFiltrada = useMemo(() => {
    const torre = filtroTorre ? Number(filtroTorre) : null;
    const termo = filtroTexto.trim().toLowerCase();
    return fila.filter(item => {
      if (torre && item.torre_numero !== torre) return false;
      if (termo && !`${item.tramo}${item.virola}${item.torre_numero}`.toLowerCase().includes(termo)) return false;
      return true;
    });
  }, [fila, filtroTorre, filtroTexto]);

  const listaExibida = filaFiltrada.slice(0, LIMITE_LISTA);
  const truncado = filaFiltrada.length > LIMITE_LISTA;

  const torresDisponiveis = useMemo(() => {
    const set = new Set(fila.map(i => i.torre_numero));
    return Array.from(set).sort((a, b) => a - b);
  }, [fila]);

  const onSalvoLancamento = () => {
    setLancamentoAberto(null);
    if (etapaAtivaId) carregarFila(etapaAtivaId);
    recarregarContagens(etapas, subprojetoId);
  };

  if (carregandoBase) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 pb-12">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
        <div>
          {etapaAtiva ? (
            <button
              onClick={() => setEtapaAtivaId(null)}
              className="mb-1 flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Voltar às etapas
            </button>
          ) : null}
          <h1 className="font-display text-xl font-bold text-slate-900 dark:text-slate-50">
            {etapaAtiva ? `Fila de ${etapaAtiva.nome}` : 'Lançamentos de Produção'}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {etapaAtiva
              ? 'Peças liberadas pela etapa anterior, aguardando esta etapa.'
              : 'Corte a Plasma, Chanfro, Calandra e Solda SAW — liberação de qualidade da fabricação de torres.'}
          </p>
        </div>

        {subprojetos.length > 0 && (
          <select
            value={subprojetoId}
            onChange={e => setSubprojetoId(e.target.value)}
            className="w-full cursor-pointer rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 sm:w-auto"
          >
            {subprojetos.map(s => (
              <option key={s.id} value={s.id}>
                {s.nome} (Torres {s.torre_inicial}–{s.torre_final})
              </option>
            ))}
          </select>
        )}
      </div>

      {pendentesOutbox > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs font-medium text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          <span className="flex items-center gap-1.5">
            <WifiOff className="h-4 w-4 shrink-0" />
            {pendentesOutbox} lançamento(s) aguardando envio.
          </span>
          <button
            onClick={() => processarFilaLancamentos()}
            disabled={sincronizando}
            className="flex items-center gap-1 rounded-lg bg-amber-200/70 px-2 py-1 font-bold text-amber-900 hover:bg-amber-200 disabled:opacity-60 dark:bg-amber-900/50 dark:text-amber-200"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${sincronizando ? 'animate-spin' : ''}`} /> Reenviar agora
          </button>
        </div>
      )}

      {!etapaAtiva ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {etapasVisiveis.map(e => {
            const Icone = ICONE_ETAPA[e.id] ?? Layers;
            const contagem = contagens[e.id] ?? 0;
            return (
              <button
                key={e.id}
                onClick={() => setEtapaAtivaId(e.id)}
                className="group flex flex-col items-start gap-2 rounded-2xl border border-slate-200 bg-white p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="flex w-full items-center justify-between">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
                    <Icone className="h-4.5 w-4.5" />
                  </span>
                  {contagem > 0 && (
                    <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-bold text-white">{contagem}</span>
                  )}
                </div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-50">{e.nome}</h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {contagem === 0 ? 'Nenhuma peça pendente' : `${contagem} peça(s) pendente(s)`}
                </p>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={filtroTexto}
                onChange={e => setFiltroTexto(e.target.value)}
                placeholder="Filtrar por tramo, virola ou torre..."
                className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              />
            </div>
            {torresDisponiveis.length > 1 && (
              <select
                value={filtroTorre}
                onChange={e => setFiltroTorre(e.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                <option value="">Todas as torres</option>
                {torresDisponiveis.map(t => (
                  <option key={t} value={t}>
                    Torre {t}
                  </option>
                ))}
              </select>
            )}
          </div>

          {carregandoFila ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
            </div>
          ) : listaExibida.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center dark:border-slate-800">
              <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
                Nenhuma peça pendente nesta etapa{filtroTexto || filtroTorre ? ' com este filtro' : ''}.
              </p>
            </div>
          ) : (
            <>
              <div className="rounded-xl border overflow-hidden divide-y" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}>
                {listaExibida.map(item => (
                  <div key={item.virola_id} className="flex items-center justify-between gap-3 p-3.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-900 dark:text-slate-50">
                        Torre {item.torre_numero} • {item.tramo} • {item.virola}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {item.corrigir ? (
                          <span className="font-semibold text-amber-600 dark:text-amber-400">Reprovado — corrigir</span>
                        ) : item.rastreabilidade_herdada ? (
                          `Rastreabilidade: ${item.rastreabilidade_herdada}`
                        ) : (
                          'Pronta para liberação'
                        )}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        onClick={() => setFichaAberta(item)}
                        title="Ver ficha da peça"
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setLancamentoAberto(item)}
                        className={`rounded-lg px-3 py-1.5 text-xs font-bold text-white ${
                          item.corrigir ? 'bg-amber-600 hover:bg-amber-700' : 'bg-blue-600 hover:bg-blue-700'
                        }`}
                      >
                        {item.corrigir ? 'Corrigir' : 'Abrir'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              {truncado && (
                <p className="text-center text-xs text-slate-400">
                  Mostrando {LIMITE_LISTA} de {filaFiltrada.length} — refine o filtro para ver mais.
                </p>
              )}
            </>
          )}
        </div>
      )}

      {lancamentoAberto && etapaAtiva && (
        <LancamentoModal
          user={user}
          etapa={etapaAtiva}
          item={lancamentoAberto}
          pessoas={pessoas}
          onClose={() => setLancamentoAberto(null)}
          onSalvo={onSalvoLancamento}
        />
      )}

      {fichaAberta && (
        <FichaVirolaModal
          virolaId={fichaAberta.virola_id}
          torreNumero={fichaAberta.torre_numero}
          tramo={fichaAberta.tramo}
          virola={fichaAberta.virola}
          onClose={() => setFichaAberta(null)}
        />
      )}
    </div>
  );
}
