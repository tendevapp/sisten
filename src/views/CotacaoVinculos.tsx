/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Suprimentos → Vínculos & Auditoria de Cotações.
 *
 * Duas perguntas, uma tela:
 *
 *  1. **Que material SAP é este item cotado?** O casamento com os pedidos
 *     colocados responde sozinho quando o preço e a descrição batem; o resto
 *     vem para a curadoria, e o que nenhum pedido explica pode ir para a
 *     análise por IA. Cada confirmação vira memória: a próxima cotação do
 *     mesmo fornecedor já chega com a sugestão pronta.
 *
 *  2. **O pedido saiu igual à cotação?** Com os itens vinculados, dá para
 *     comparar o pedido colocado com o que havia sido cotado e apontar preço
 *     acima do cotado, fornecedor que não era o de menor preço e quantidade
 *     diferente.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Link2, Play, Sparkles, Check, X, Search, Loader2, RefreshCw, ArrowLeft,
  History, ScanSearch, ClipboardCheck, ChevronDown, PackageSearch, ClipboardList,
} from 'lucide-react';
import type { Profile } from '../types';
import { useToast } from '../components/ui/Toast';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import * as api from '../lib/cotacaoVinculosApi';
import type { VinculoItem, VinculoStatus, ResumoVinculos, RodadaVinculo, LinhaAuditoria } from '../lib/cotacaoVinculosApi';
import { formatBRL, formatDateBR, formatQtd } from '../lib/format';
import { TableCards, TableCardRow, TableDesktop } from '../components/ui/DataTable';

interface Props {
  user: Profile;
  onNavigate: (path: string) => void;
}

type Aba = 'curadoria' | 'auditoria' | 'rodadas';

const STATUS_LABEL: Record<VinculoStatus, string> = {
  auto: 'Automático',
  sugerido: 'Sugerido',
  confirmado: 'Confirmado',
  rejeitado: 'Rejeitado',
  sem_candidato: 'Sem candidato',
};

const STATUS_CLASSE: Record<VinculoStatus, string> = {
  auto: 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300',
  sugerido: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
  confirmado: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
  rejeitado: 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300',
  sem_candidato: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
};

const ORIGEM_LABEL: Record<string, string> = {
  pedido: 'casado com pedido',
  requisicao: 'casado com RM (ME5A)',
  aprendido: 'memória de cotações',
  ia: 'análise por IA',
  manual: 'escolha manual',
};

// `formatDateBR` recebe a string ISO do banco; fatiar antes evita o susto de
// `new Date('2026-09-01')` voltar 31/08 em UTC-3.
const dataBR = (iso?: string | null) => (iso ? formatDateBR(`${iso.slice(0, 10)}T12:00:00`) : '—');

function Chip({ rotulo, valor }: { rotulo: string; valor: number | null | undefined }) {
  if (valor === null || valor === undefined) return null;
  const pct = Math.round(Number(valor) * 100);
  const tom =
    pct >= 80 ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
    : pct >= 40 ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
    : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400';
  return (
    <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${tom}`}>
      {rotulo} {pct}%
    </span>
  );
}

export default function CotacaoVinculos({ user, onNavigate }: Props) {
  const toast = useToast();

  const [aba, setAba] = useState<Aba>('curadoria');
  const [resumo, setResumo] = useState<ResumoVinculos | null>(null);
  const [vinculos, setVinculos] = useState<VinculoItem[]>([]);
  const [rodadas, setRodadas] = useState<RodadaVinculo[]>([]);
  const [auditoria, setAuditoria] = useState<LinhaAuditoria[]>([]);

  const [carregando, setCarregando] = useState(false);
  const [rodando, setRodando] = useState<'casamento' | 'requisicoes' | 'ia' | null>(null);
  const [decidindo, setDecidindo] = useState<string | null>(null);

  const [filtro, setFiltro] = useState<'fila' | 'sem_candidato' | 'confirmado' | 'rejeitado' | 'todos'>('fila');
  const [busca, setBusca] = useState('');
  const [soDivergentes, setSoDivergentes] = useState(true);
  const [incluirGenericos, setIncluirGenericos] = useState(false);
  const [expandido, setExpandido] = useState<string | null>(null);
  const [confirmarCasamento, setConfirmarCasamento] = useState(false);

  const statusDoFiltro = useMemo((): VinculoStatus[] | undefined => {
    if (filtro === 'fila') return ['auto', 'sugerido'];
    if (filtro === 'todos') return undefined;
    return [filtro as VinculoStatus];
  }, [filtro]);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const [lista, res] = await Promise.all([
        api.listarVinculos({ status: statusDoFiltro, busca }),
        api.resumoVinculos(),
      ]);
      setVinculos(lista);
      setResumo(res);
    } catch (err: any) {
      toast.error(err.message ?? 'Falha ao carregar os vínculos.');
    } finally {
      setCarregando(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `toast` remonta a cada notificação
  }, [statusDoFiltro, busca]);

  useEffect(() => {
    if (aba === 'curadoria') void carregar();
  }, [aba, carregar]);

  useEffect(() => {
    if (aba !== 'auditoria') return;
    setCarregando(true);
    api.listarAuditoria({ apenasDivergentes: soDivergentes, incluirGenericos })
      .then(setAuditoria)
      .catch((err: any) => toast.error(err.message ?? 'Falha ao carregar a auditoria.'))
      .finally(() => setCarregando(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aba, soDivergentes, incluirGenericos]);

  useEffect(() => {
    if (aba !== 'rodadas') return;
    api.listarRodadas().then(setRodadas).catch(() => undefined);
  }, [aba]);

  const rodarCasamento = async () => {
    setConfirmarCasamento(false);
    setRodando('casamento');
    try {
      const r = await api.casarCotacaoPedidos({ usuarioId: user.id, usuarioNome: user.name });
      toast.success(
        `Casamento concluído: ${r.vinculos_auto} vínculo(s) automático(s), ${r.sugestoes} sugestão(ões) e ${r.sem_candidato} sem candidato.`,
      );
      await carregar();
    } catch (err: any) {
      toast.error(err.message ?? 'Falha ao rodar o casamento.');
    } finally {
      setRodando(null);
    }
  };

  /**
   * Segunda passada: as RMs de 2026 que originaram as cotações. Só alcança o
   * que o pedido não explicou — por isso roda depois, nunca antes.
   */
  const rodarRequisicoes = async () => {
    setRodando('requisicoes');
    try {
      const r = await api.casarCotacaoRequisicoes({ usuarioId: user.id, usuarioNome: user.name });
      toast.success(
        `RMs analisadas: ${r.vinculos_auto} vínculo(s) automático(s) e ${r.sugestoes} sugestão(ões) a partir da ME5A.`,
      );
      await carregar();
    } catch (err: any) {
      toast.error(err.message ?? 'Falha ao casar com as requisições.');
    } finally {
      setRodando(null);
    }
  };

  const analisarComIa = async () => {
    setRodando('ia');
    try {
      const r = await api.analisarVinculosComIa({ limite: 25 });
      toast.success(
        `IA analisou ${r.analisados} item(ns): ${r.sugestoes} com sugestão de material.` +
          (r.custo_usd ? ` Custo estimado US$ ${r.custo_usd.toFixed(4)}.` : ''),
      );
      await carregar();
    } catch (err: any) {
      toast.error(err.message ?? 'Falha na análise por IA.');
    } finally {
      setRodando(null);
    }
  };

  const decidir = async (v: VinculoItem, aceitar: boolean, materialCode?: string) => {
    setDecidindo(v.id);
    try {
      await api.confirmarVinculo({
        vinculoId: v.id,
        aceitar,
        materialCode: materialCode ?? v.material_code,
        usuarioId: user.id,
        usuarioNome: user.name,
      });
      toast.success(aceitar ? 'Vínculo confirmado e gravado na memória de cotações.' : 'Vínculo rejeitado.');
      setVinculos(atual => atual.filter(x => x.id !== v.id));
      setResumo(await api.resumoVinculos());
    } catch (err: any) {
      toast.error(err.message ?? 'Falha ao registrar a decisão.');
    } finally {
      setDecidindo(null);
    }
  };

  const cards: { chave: keyof ResumoVinculos; rotulo: string; tom: string }[] = [
    { chave: 'auto', rotulo: 'Automáticos', tom: 'text-blue-700 dark:text-blue-300' },
    { chave: 'sugerido', rotulo: 'Aguardando curadoria', tom: 'text-amber-700 dark:text-amber-300' },
    { chave: 'confirmado', rotulo: 'Confirmados', tom: 'text-emerald-700 dark:text-emerald-300' },
    { chave: 'sem_candidato', rotulo: 'Sem candidato', tom: 'text-slate-600 dark:text-slate-300' },
    { chave: 'rejeitado', rotulo: 'Rejeitados', tom: 'text-rose-700 dark:text-rose-300' },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <button
            type="button"
            onClick={() => onNavigate('/suprimentos/cotacoes/historico')}
            className="group mb-3 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-bold text-slate-700 shadow-xs transition-all hover:border-blue-400 hover:bg-blue-50/60 hover:text-blue-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-blue-500 dark:hover:bg-blue-950/40 cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4 text-slate-500 transition-transform group-hover:-translate-x-1" />
            <span>Histórico de cotações</span>
          </button>
          <h1 className="flex items-center gap-2.5 font-display text-2xl font-bold text-slate-900 dark:text-slate-50">
            <Link2 className="h-6 w-6 text-blue-600" />
            Vínculos &amp; Auditoria de Cotações
          </h1>
          <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-slate-600 dark:text-slate-400">
            Liga cada item cotado ao material do catálogo SAP usando os pedidos já colocados como
            evidência. Cada vínculo confirmado alimenta a base: as próximas cotações chegam com a
            sugestão pronta, e os pedidos passam a poder ser auditados contra o que foi cotado.
          </p>
        </div>

        <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => setConfirmarCasamento(true)}
            disabled={rodando !== null}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-xs transition-colors hover:border-blue-400 hover:bg-blue-50/60 hover:text-blue-700 disabled:opacity-60 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 cursor-pointer"
          >
            {rodando === 'casamento' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Rodar casamento
          </button>
          <button
            type="button"
            onClick={rodarRequisicoes}
            disabled={rodando !== null}
            title="Usa as requisições de material de 2026 (ME5A) — a RM já traz o material que o requisitante escolheu."
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-xs transition-colors hover:border-blue-400 hover:bg-blue-50/60 hover:text-blue-700 disabled:opacity-60 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 cursor-pointer"
          >
            {rodando === 'requisicoes' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardList className="h-4 w-4" />}
            Casar com RMs
          </button>
          <button
            type="button"
            onClick={analisarComIa}
            disabled={rodando !== null}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-60 cursor-pointer"
          >
            {rodando === 'ia' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Analisar 25 com IA
          </button>
        </div>
      </header>

      {resumo && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {cards.map(c => (
            <div key={c.chave} className="rounded-2xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900">
              <p className={`text-xl font-bold leading-none ${c.tom}`}>{resumo[c.chave]}</p>
              <p className="mt-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">{c.rotulo}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-b border-slate-200 dark:border-slate-800">
        {([
          ['curadoria', 'Curadoria', ScanSearch],
          ['auditoria', 'Cotação × Pedido', ClipboardCheck],
          ['rodadas', 'Rodadas', History],
        ] as const).map(([id, rotulo, Icone]) => (
          <button
            key={id}
            type="button"
            onClick={() => setAba(id)}
            className={`-mb-px inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors cursor-pointer ${
              aba === id
                ? 'border-blue-600 text-blue-700 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <Icone className="h-4 w-4" />
            {rotulo}
          </button>
        ))}
      </div>

      {aba === 'curadoria' && (
        <section className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-1.5">
              {([
                ['fila', 'Fila de curadoria'],
                ['sem_candidato', 'Sem candidato'],
                ['confirmado', 'Confirmados'],
                ['rejeitado', 'Rejeitados'],
                ['todos', 'Todos'],
              ] as const).map(([id, rotulo]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setFiltro(id)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors cursor-pointer ${
                    filtro === id
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                  }`}
                >
                  {rotulo}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={busca}
                  onChange={e => setBusca(e.target.value)}
                  placeholder="Descrição, fornecedor, material, pedido…"
                  className="w-64 rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>
              <button
                type="button"
                onClick={carregar}
                className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 hover:text-blue-600 dark:border-slate-800 dark:bg-slate-900 cursor-pointer"
                title="Recarregar"
              >
                <RefreshCw className={`h-4 w-4 ${carregando ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {carregando && vinculos.length === 0 && (
            <div className="flex justify-center py-16 text-slate-400"><Loader2 className="h-6 w-6 animate-spin" /></div>
          )}

          {!carregando && vinculos.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-10 text-center dark:border-slate-800 dark:bg-slate-900/40">
              <PackageSearch className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-3 text-sm font-semibold text-slate-700 dark:text-slate-200">Nada nesta fila.</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Rode o casamento com os pedidos ou mande os itens sem candidato para a análise por IA.
              </p>
            </div>
          )}

          <div className="space-y-3">
            {vinculos.map(v => {
              const sinais = (v.sinais ?? {}) as Record<string, number | string | null>;
              const decidivel = v.status === 'auto' || v.status === 'sugerido';
              return (
                <article
                  key={v.id}
                  className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    {/* Item cotado */}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${STATUS_CLASSE[v.status]}`}>
                          {STATUS_LABEL[v.status]}
                        </span>
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                          {ORIGEM_LABEL[v.origem] ?? v.origem}
                        </span>
                        <Chip rotulo="preço" valor={sinais.preco as number} />
                        <Chip rotulo="texto" valor={sinais.texto as number} />
                        <Chip rotulo="qtd" valor={sinais.qtd as number} />
                        <Chip rotulo="IA" valor={sinais.ia_confianca as number} />
                      </div>

                      <p className="mt-2 text-sm font-bold text-slate-900 dark:text-slate-50">
                        {v.item?.descricao_produto ?? '—'}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        {v.item?.proposta?.fornecedor_razao_social ?? 'Fornecedor não informado'}
                        {' · '}
                        {v.item?.quantidade !== null && v.item?.quantidade !== undefined
                          ? `${formatQtd(v.item.quantidade)} ${v.item?.unidade_medida ?? ''} · `
                          : ''}
                        {formatBRL(v.item?.preco_unitario ?? 0)}/un
                        {v.item?.proposta?.data_emissao ? ` · proposta de ${dataBR(v.item.proposta.data_emissao)}` : ''}
                      </p>

                      {typeof sinais.ia_justificativa === 'string' && (
                        <p className="mt-2 rounded-lg bg-blue-50/70 px-3 py-2 text-xs text-blue-900 dark:bg-blue-950/40 dark:text-blue-200">
                          <Sparkles className="mr-1 inline h-3 w-3" />
                          {sinais.ia_justificativa}
                        </p>
                      )}
                    </div>

                    {/* Material sugerido + evidência */}
                    <div className="w-full shrink-0 rounded-xl bg-slate-50 p-3 lg:w-96 dark:bg-slate-800/50">
                      {v.material_code ? (
                        <>
                          <p className="font-mono text-xs font-bold text-slate-900 dark:text-slate-100">{v.material_code}</p>
                          <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">{v.material_descricao ?? '—'}</p>
                        </>
                      ) : (
                        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                          Nenhum material sugerido ainda.
                        </p>
                      )}

                      {v.rm_ri && !v.po_doc_compra && (
                        <p className="mt-2 border-t border-slate-200 pt-2 text-[11px] text-slate-500 dark:border-slate-700 dark:text-slate-400">
                          RM {v.rm_requisicao}/{v.rm_item} · RI {v.rm_ri} · {dataBR(v.rm_data)} ·{' '}
                          {formatQtd(v.rm_qtd)} un
                          {v.rm_requisitante ? ` · ${v.rm_requisitante}` : ''}
                          <br />
                          <span className="text-slate-400">{v.rm_texto_breve}</span>
                        </p>
                      )}

                      {v.po_doc_compra && (
                        <p className="mt-2 border-t border-slate-200 pt-2 text-[11px] text-slate-500 dark:border-slate-700 dark:text-slate-400">
                          Pedido {v.po_doc_compra}/{v.po_item} de {dataBR(v.po_data_doc)} ·{' '}
                          {formatBRL(v.po_preco_unit ?? 0)}/un · {formatQtd(v.po_qtd)} un
                          <br />
                          <span className="text-slate-400">{v.po_txt_breve}</span>
                        </p>
                      )}

                      {decidivel && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={decidindo === v.id || !v.material_code}
                            onClick={() => decidir(v, true)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
                          >
                            {decidindo === v.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                            Confirmar
                          </button>
                          <button
                            type="button"
                            disabled={decidindo === v.id}
                            onClick={() => decidir(v, false)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 hover:border-rose-300 hover:text-rose-700 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 cursor-pointer"
                          >
                            <X className="h-3.5 w-3.5" />
                            Rejeitar
                          </button>
                          {v.candidatos?.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setExpandido(expandido === v.id ? null : v.id)}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 hover:text-blue-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 cursor-pointer"
                            >
                              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expandido === v.id ? 'rotate-180' : ''}`} />
                              {v.candidatos.length} alternativa(s)
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {expandido === v.id && v.candidatos?.length > 0 && (
                    <div className="mt-3 space-y-1.5 border-t border-slate-100 pt-3 dark:border-slate-800">
                      {v.candidatos.map(c => (
                        <button
                          key={c.material_code}
                          type="button"
                          disabled={decidindo === v.id}
                          onClick={() => decidir(v, true, c.material_code)}
                          className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-xs hover:bg-blue-50 disabled:opacity-50 dark:hover:bg-blue-950/40 cursor-pointer"
                        >
                          <span className="min-w-0">
                            <span className="font-mono font-bold text-slate-800 dark:text-slate-100">{c.material_code}</span>
                            <span className="ml-2 text-slate-500 dark:text-slate-400">{c.descricao}</span>
                          </span>
                          <span className="shrink-0 text-[10px] font-bold uppercase text-slate-400">
                            confirmar {c.score !== null && c.score !== undefined ? `· ${Math.round(Number(c.score) * 100)}%` : ''}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      )}

      {aba === 'auditoria' && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex flex-wrap items-center gap-5">
              <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={soDivergentes}
                  onChange={e => setSoDivergentes(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300"
                />
                Mostrar apenas pedidos com divergência
              </label>
              <label
                className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300"
                title="Dentro de um código genérico cada cotação pode ser de um produto diferente — 'preço acima do cotado' ali costuma ser especificação melhor, não compra ruim."
              >
                <input
                  type="checkbox"
                  checked={incluirGenericos}
                  onChange={e => setIncluirGenericos(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300"
                />
                Incluir códigos genéricos
              </label>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">{auditoria.length} linha(s)</p>
          </div>

          {carregando ? (
            <div className="flex justify-center py-16 text-slate-400"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : auditoria.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-10 text-center dark:border-slate-800 dark:bg-slate-900/40">
              <ClipboardCheck className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
                Nenhum pedido para auditar ainda.
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                A auditoria só enxerga pedidos cujo material tem cotação vinculada — confirme vínculos na curadoria
                e esta lista cresce junto.
              </p>
            </div>
          ) : (
            <>
            {/* Celular: cada linha de auditoria vira um cartão (8 colunas). */}
            <TableCards>
              {auditoria.map(l => {
                const conforme = !l.div_preco && !l.div_fornecedor && !l.div_quantidade;
                return (
                  <TableCardRow key={`m-${l.po_id}`} accent={conforme ? undefined : 'var(--status-warning)'}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{l.doc_compra}/{l.item}</p>
                        <p className="text-[11px] text-slate-400">{dataBR(l.data_doc)}</p>
                      </div>
                      <span className="shrink-0 text-sm font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                        {formatBRL(l.preco_pedido ?? 0)}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300 truncate">
                      <span className="font-mono">{l.material}</span>
                      {l.material_generico && <span className="ml-1 text-amber-600 dark:text-amber-400">· genérico</span>}
                      <span className="block text-[11px] text-slate-400 truncate">{l.txt_breve}</span>
                    </p>
                    <p className="text-xs text-slate-600 dark:text-slate-300 truncate">{l.fornecedor_pedido}</p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                      <span>Cotado {l.preco_cotado_fornecedor === null ? '—' : formatBRL(l.preco_cotado_fornecedor)}</span>
                      <span>Menor {l.menor_preco_cotado === null ? '—' : formatBRL(l.menor_preco_cotado)}</span>
                      <span>Qtd {formatQtd(l.qtd_pedido)}</span>
                    </div>
                    <div className="flex flex-wrap gap-1 pt-0.5">
                      {l.div_preco && (
                        <span className="rounded-md bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                          preço +{formatBRL(l.delta_preco_unit ?? 0)}
                        </span>
                      )}
                      {l.div_fornecedor && (
                        <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                          outro fornecedor
                        </span>
                      )}
                      {l.div_quantidade && (
                        <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          quantidade
                        </span>
                      )}
                      {conforme && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                          <Check className="h-3 w-3" /> conforme
                        </span>
                      )}
                    </div>
                  </TableCardRow>
                );
              })}
            </TableCards>

            <TableDesktop>
            <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
              <table className="min-w-full text-left text-xs">
                <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
                  <tr>
                    <th className="px-3 py-2.5">Pedido</th>
                    <th className="px-3 py-2.5">Material</th>
                    <th className="px-3 py-2.5">Fornecedor</th>
                    <th className="px-3 py-2.5 text-right">Preço pedido</th>
                    <th className="px-3 py-2.5 text-right">Preço cotado</th>
                    <th className="px-3 py-2.5 text-right">Menor cotado</th>
                    <th className="px-3 py-2.5 text-right">Qtd</th>
                    <th className="px-3 py-2.5">Divergências</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {auditoria.map(l => (
                    <tr key={l.po_id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                      <td className="px-3 py-2.5 font-semibold text-slate-800 dark:text-slate-100">
                        {l.doc_compra}/{l.item}
                        <span className="block text-[10px] font-normal text-slate-400">{dataBR(l.data_doc)}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="font-mono text-slate-700 dark:text-slate-200">{l.material}</span>
                        {l.material_generico && (
                          <span
                            className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                            title={l.motivo_generico ?? 'Código usado para vários produtos diferentes.'}
                          >
                            GENÉRICO
                          </span>
                        )}
                        <span className="block text-[10px] text-slate-400">{l.txt_breve}</span>
                      </td>
                      <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300">
                        {l.fornecedor_pedido}
                        {l.div_fornecedor && l.fornecedor_menor_preco && (
                          <span className="block text-[10px] text-amber-600 dark:text-amber-400">
                            menor preço: {l.fornecedor_menor_preco}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right font-semibold text-slate-800 dark:text-slate-100">
                        {formatBRL(l.preco_pedido ?? 0)}
                      </td>
                      <td className="px-3 py-2.5 text-right text-slate-600 dark:text-slate-300">
                        {l.preco_cotado_fornecedor === null ? '—' : formatBRL(l.preco_cotado_fornecedor)}
                      </td>
                      <td className="px-3 py-2.5 text-right text-slate-600 dark:text-slate-300">
                        {l.menor_preco_cotado === null ? '—' : formatBRL(l.menor_preco_cotado)}
                        {l.fornecedores_cotados ? (
                          <span className="block text-[10px] text-slate-400">{l.fornecedores_cotados} fornecedor(es)</span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2.5 text-right text-slate-600 dark:text-slate-300">
                        {formatQtd(l.qtd_pedido)}
                        {l.div_quantidade && (
                          <span className="block text-[10px] text-amber-600 dark:text-amber-400">cotado {formatQtd(l.qtd_cotada)}</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {l.div_preco && (
                            <span className="rounded-md bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                              preço +{formatBRL(l.delta_preco_unit ?? 0)}
                            </span>
                          )}
                          {l.div_fornecedor && (
                            <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                              outro fornecedor
                            </span>
                          )}
                          {l.div_quantidade && (
                            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                              quantidade
                            </span>
                          )}
                          {!l.div_preco && !l.div_fornecedor && !l.div_quantidade && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                              <Check className="h-3 w-3" /> conforme
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </TableDesktop>
            </>
          )}
        </section>
      )}

      {aba === 'rodadas' && (
        <section className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
              <tr>
                <th className="px-3 py-2.5">Quando</th>
                <th className="px-3 py-2.5">Tipo</th>
                <th className="px-3 py-2.5">Quem</th>
                <th className="px-3 py-2.5 text-right">Analisados</th>
                <th className="px-3 py-2.5 text-right">Automáticos</th>
                <th className="px-3 py-2.5 text-right">Sugestões</th>
                <th className="px-3 py-2.5 text-right">Sem candidato</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {rodadas.map(r => (
                <tr key={r.id}>
                  <td className="px-3 py-2.5 text-slate-700 dark:text-slate-200">
                    {new Date(r.created_at).toLocaleString('pt-BR')}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {r.tipo === 'ia' ? 'IA' : r.tipo === 'requisicao' ? 'RMs' : 'pedidos'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300">{r.executado_por_nome ?? '—'}</td>
                  <td className="px-3 py-2.5 text-right">{r.itens_analisados}</td>
                  <td className="px-3 py-2.5 text-right">{r.vinculos_auto}</td>
                  <td className="px-3 py-2.5 text-right">{r.sugestoes}</td>
                  <td className="px-3 py-2.5 text-right">{r.sem_candidato}</td>
                </tr>
              ))}
              {rodadas.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-slate-400">Nenhuma rodada registrada.</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      )}

      {confirmarCasamento && (
        <ConfirmDialog
          titulo="Rodar o casamento com os pedidos?"
          mensagem="Recalcula os vínculos de todos os itens cotados a partir dos pedidos de 2026 em diante. Vínculos já confirmados ou rejeitados por alguém não são tocados."
          confirmarLabel="Rodar agora"
          confirmando={rodando === 'casamento'}
          onConfirmar={rodarCasamento}
          onCancelar={() => setConfirmarCasamento(false)}
        />
      )}
    </div>
  );
}
