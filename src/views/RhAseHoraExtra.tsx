/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Formulário "ASE - Hora Extra" (FRM.RHU-0007 — Autorização para Serviços
 * Extraordinários).
 *
 * Sem workflow de aprovação: só chega aqui quem o admin liberou a feature
 * flag `rh_ase_hora_extra` (ver `pages.ts` e `Formularios.tsx`), tipicamente
 * os próprios gestores de turno — preencher e enviar já é a autorização.
 * `RASCUNHO` pode ser editado livremente; "Enviar" tranca os campos (vira o
 * registro oficial, com protocolo e PDF); "Reabrir" volta para rascunho se
 * algo precisar ser corrigido.
 *
 * Segue o mesmo desenho de duas telas em um arquivo de `LogisticaExpedicao`
 * (lista + edição), inclusive criando o cabeçalho no banco assim que o
 * usuário clica "Novo" — aqui não é por causa de foto, é para o rascunho
 * sobreviver a fechar a aba no meio do preenchimento.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, ChevronRight, Loader2, Plus, Save, Send, Trash2, Timer, AlertCircle,
  AlertTriangle, FileDown, FileSpreadsheet, RotateCcw, X, Search, Edit3, Mail, Check,
  Calendar, User, Filter, Users,
} from 'lucide-react';
import type {
  AseHoraExtraCompleta, AseHoraExtraItem, Profile, RhPessoa, RhSetor, RhTurno,
} from '../types';
import * as api from '../lib/rhApi';
import { calcularHorasASE, diaDaSemana } from '../lib/rhApi';
import {
  exportAseHoraExtraPdf,
  exportAseConsolidadoDiaPdf,
  exportAseConsolidadoDiaExcel,
} from '../lib/pdfExport/exportAseHoraExtraPdf';
import { obterConfigEmail, montarMailtoComConfig } from '../lib/emailConfigApi';
import { canViewAllAse } from '../lib/pages';
import { useToast } from '../components/ui/Toast';
import ConfirmDialog from '../components/ui/ConfirmDialog';

interface Props {
  user: Profile;
  onNavigate: (path: string) => void;
}

const LIMITE_DIARIO_CLT_HORAS = 2;
const ANTECEDENCIA_MINIMA_HORAS = 24;

function hojeISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDataBR(iso?: string | null): string {
  if (!iso) return '-';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function buildAseHoraExtraEmail(params: {
  solicitacao: AseHoraExtraCompleta;
  setorNome: string;
  turnoNome: string;
  solicitanteNome: string;
}): { assunto: string; corpo: string } {
  const { solicitacao, setorNome, turnoNome, solicitanteNome } = params;
  const totalHoras = solicitacao.itens.reduce((acc, it) => acc + (it.total_horas || 0), 0);
  const dataFormatada = formatDataBR(solicitacao.data_execucao);
  const diaSemanaStr = diaDaSemana(solicitacao.data_execucao);

  const assunto = `ASE - Autorização de Horas Extras - ${solicitacao.numero_protocolo} - ${setorNome} (${dataFormatada})`;

  const colabTransporte = solicitacao.itens.filter(it => it.transporte);
  const colabRefeicao = solicitacao.itens.filter(it => it.refeicao);

  const linhasColaboradores = solicitacao.itens.map((it, idx) => {
    const horarioStr = (it.hora_entrada && it.hora_saida)
      ? `${it.hora_entrada} às ${it.hora_saida}`
      : 'Horário a definir';
    const intervStr = it.intervalo_minutos ? ` (Intervalo: ${it.intervalo_minutos}min)` : ' (Sem intervalo)';
    const heStr = it.percentual_he != null ? ` | %HE: ${it.percentual_he}%` : '';
    const totalStr = it.total_horas != null ? ` | Total: ${it.total_horas.toFixed(2)}h` : '';
    const transpStr = it.transporte ? 'Sim' : 'Não';
    const refStr = it.refeicao ? 'Sim' : 'Não';

    let linha = `${idx + 1}. ${it.registro} - ${it.nome}${it.cargo ? ` (${it.cargo})` : ''}\r\n`
      + `   Horário: ${horarioStr}${intervStr}${heStr}${totalStr}\r\n`
      + `   Transporte: ${transpStr} | Refeição: ${refStr}`;
    if (it.observacao?.trim()) {
      linha += `\r\n   Obs: ${it.observacao.trim()}`;
    }
    return linha;
  }).join('\r\n\r\n');

  const listaTransporte = colabTransporte.length > 0
    ? colabTransporte.map(it => {
        const rotaStr = it.rota_transporte ? ` [ROTA: ${it.rota_transporte}${it.horario_embarque_transporte ? ` - ${it.horario_embarque_transporte}` : ''}]` : '';
        const pontoStr = it.ponto_embarque_transporte ? ` [PONTO: ${it.ponto_embarque_transporte}]` : '';
        const contatoStr = it.contato_transporte ? ` [TEL: ${it.contato_transporte}]` : '';
        const horStr = (it.hora_entrada && it.hora_saida) ? ` [HORÁRIO HE: ${it.hora_entrada} às ${it.hora_saida}]` : '';
        return `- ${it.registro} - ${it.nome}${it.cargo ? ` (${it.cargo})` : ''}${rotaStr}${pontoStr}${contatoStr}${horStr}`;
      }).join('\r\n')
    : '(Nenhum colaborador necessita de transporte)';

  const listaRefeicao = colabRefeicao.length > 0
    ? colabRefeicao.map(it => `- ${it.registro} - ${it.nome}${it.cargo ? ` (${it.cargo})` : ''}`).join('\r\n')
    : '(Nenhum colaborador necessita de refeição)';

  const corpo = `Prezados,

Segue autorização de serviços extraordinários (ASE - Hora Extra) registrada no SISTEN:

==================================================
DADOS DA SOLICITAÇÃO (FRM.RHU-0007)
==================================================
Protocolo: ${solicitacao.numero_protocolo}
Status: ${solicitacao.status}
Setor: ${setorNome}
Turno: ${turnoNome}
Data de Execução: ${dataFormatada} (${diaSemanaStr})
Solicitante: ${solicitanteNome}
Total de Colaboradores: ${solicitacao.itens.length}
Total Geral de Horas: ${totalHoras.toFixed(2)}h
${solicitacao.justificativa?.trim() ? `Justificativa: ${solicitacao.justificativa.trim()}\r\n` : ''}
==================================================
LISTA GERAL DE COLABORADORES
==================================================
${linhasColaboradores || 'Nenhum colaborador adicionado.'}

==================================================
TRANSPORTE (SOLICITADOS: ${colabTransporte.length})
==================================================
${listaTransporte}

==================================================
REFEIÇÃO (SOLICITADAS: ${colabRefeicao.length})
==================================================
${listaRefeicao}

--------------------------------------------------
Enviado através do SISTEN - Sistema Integrado TEN`;

  return { assunto, corpo };
}

export default function RhAseHoraExtra({ user, onNavigate }: Props) {
  const [solicitacaoId, setSolicitacaoId] = useState<string | null>(null);

  useEffect(() => {
    const hash = window.location.hash || '';
    if (hash.includes('?')) {
      const params = new URLSearchParams(hash.split('?')[1]);
      const idParam = params.get('id');
      if (idParam) {
        setSolicitacaoId(idParam);
      }
    }
  }, []);

  return solicitacaoId
    ? <Edicao user={user} id={solicitacaoId} onVoltar={() => setSolicitacaoId(null)} />
    : <Lista user={user} onAbrir={setSolicitacaoId} onNavigate={onNavigate} />;
}

// =====================================================================
// Lista
// =====================================================================

const STATUS_LABEL: Record<string, string> = { RASCUNHO: 'Rascunho', ENVIADO: 'Enviado', CANCELADO: 'Cancelado' };
const STATUS_CLASSES: Record<string, string> = {
  RASCUNHO: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400',
  ENVIADO: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400',
  CANCELADO: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
};

function Lista({ user, onAbrir, onNavigate }: { user: Profile; onAbrir: (id: string) => void; onNavigate: (p: string) => void }) {
  const toast = useToast();
  const podeVerTodas = canViewAllAse(user);

  const [itens, setItens] = useState<AseHoraExtraCompleta[] | null>(null);
  const [criando, setCriando] = useState(false);
  const [exportandoData, setExportandoData] = useState<string | null>(null);
  const [escopoFiltro, setEscopoFiltro] = useState<'todas' | 'minhas'>(podeVerTodas ? 'todas' : 'minhas');
  const [termoBusca, setTermoBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState<string>('TODOS');

  const recarregar = useCallback(async () => {
    try {
      setItens(await api.listarSolicitacoesASE());
    } catch (e) {
      toast.error(`Falha ao carregar a lista: ${(e as Error).message}`);
      setItens([]);
    }
  }, [toast]);

  useEffect(() => { void recarregar(); }, [recarregar]);

  const exportarConsolidadoPdf = async (solicitacoes: AseHoraExtraCompleta[], dataExecucao: string) => {
    setExportandoData(`pdf-${dataExecucao}`);
    try {
      await exportAseConsolidadoDiaPdf(solicitacoes, dataExecucao);
      toast.success(`PDF consolidado de ${formatDataBR(dataExecucao)} gerado com sucesso!`);
    } catch (e) {
      console.error('Falha ao gerar PDF consolidado:', e);
      toast.error(`Erro ao gerar PDF consolidado: ${(e as Error).message}`);
    } finally {
      setExportandoData(null);
    }
  };

  const exportarConsolidadoExcel = (solicitacoes: AseHoraExtraCompleta[], dataExecucao: string) => {
    try {
      exportAseConsolidadoDiaExcel(solicitacoes, dataExecucao);
      toast.success(`Planilha consolidada de ${formatDataBR(dataExecucao)} exportada com sucesso!`);
    } catch (e) {
      console.error('Falha ao exportar Excel consolidado:', e);
      toast.error(`Erro ao exportar Excel: ${(e as Error).message}`);
    }
  };

  const novo = async () => {
    setCriando(true);
    try {
      const s = await api.criarSolicitacaoASE({
        solicitanteId: user.id, setorId: null, turnoId: null, dataExecucao: hojeISO(),
      });
      onAbrir(s.id);
    } catch (e) {
      toast.error(`Não foi possível criar a solicitação: ${(e as Error).message}`);
    } finally {
      setCriando(false);
    }
  };

  // 1. Filtragem por permissão (escopo), status e busca textual
  const itensFiltrados = useMemo(() => {
    if (!itens) return [];

    return itens.filter(s => {
      // Se não tem permissão para ver todas ou selecionou aba 'minhas'
      if (!podeVerTodas || escopoFiltro === 'minhas') {
        if (s.solicitante_id !== user.id) return false;
      }

      // Filtro de status
      if (filtroStatus !== 'TODOS' && s.status !== filtroStatus) {
        return false;
      }

      // Termo de busca
      if (termoBusca.trim()) {
        const termo = termoBusca.toLowerCase().trim();
        const noProtocolo = (s.numero_protocolo || '').toLowerCase().includes(termo);
        const noSetor = (s.setor_nome || '').toLowerCase().includes(termo);
        const noTurno = (s.turno_nome || '').toLowerCase().includes(termo);
        const noSolicitante = (s.solicitante_nome || '').toLowerCase().includes(termo);
        const naData = formatDataBR(s.data_execucao).includes(termo);
        const noColab = s.itens.some(it =>
          (it.nome || '').toLowerCase().includes(termo) ||
          (it.registro || '').toLowerCase().includes(termo) ||
          (it.cargo || '').toLowerCase().includes(termo)
        );
        if (!noProtocolo && !noSetor && !noTurno && !noSolicitante && !naData && !noColab) {
          return false;
        }
      }

      return true;
    });
  }, [itens, podeVerTodas, escopoFiltro, filtroStatus, termoBusca, user.id]);

  // 2. Agrupamento por data de execução (ordem decrescente)
  const gruposPorData = useMemo(() => {
    const mapa = new Map<string, {
      dataExecucao: string;
      dataFormatada: string;
      diaSemana: string;
      totalHoras: number;
      totalColaboradores: number;
      solicitacoes: AseHoraExtraCompleta[];
    }>();

    itensFiltrados.forEach(s => {
      const dataKey = s.data_execucao || 'sem-data';
      if (!mapa.has(dataKey)) {
        mapa.set(dataKey, {
          dataExecucao: dataKey,
          dataFormatada: formatDataBR(dataKey),
          diaSemana: diaDaSemana(dataKey),
          totalHoras: 0,
          totalColaboradores: 0,
          solicitacoes: [],
        });
      }
      const grupo = mapa.get(dataKey)!;
      grupo.solicitacoes.push(s);
      grupo.totalColaboradores += s.itens.length;
      grupo.totalHoras += s.itens.reduce((acc, it) => acc + (it.total_horas || 0), 0);
    });

    // Ordenação decrescente pelas datas (mais recentes primeiro)
    return Array.from(mapa.values()).sort((a, b) => b.dataExecucao.localeCompare(a.dataExecucao));
  }, [itensFiltrados]);

  // Contagens para abas e filtros
  const contagemMinhas = useMemo(() => {
    return (itens || []).filter(s => s.solicitante_id === user.id).length;
  }, [itens, user.id]);

  const contagemTodas = itens?.length || 0;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <button
            type="button"
            onClick={() => onNavigate('/formularios')}
            className="group mb-3 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-bold text-slate-700 shadow-xs transition-all hover:border-violet-400 hover:bg-violet-50/50 hover:text-violet-700 hover:shadow-sm active:scale-95 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-violet-500 dark:hover:bg-violet-950/40 dark:hover:text-violet-300"
          >
            <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-1" />
            <span>Voltar para Módulos de Formulários</span>
          </button>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-slate-50">
              ASE - Hora Extra
            </h1>
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              FRM.RHU-0007
            </span>
            {!podeVerTodas && (
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-semibold text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
                <User className="h-3 w-3" />
                Minhas ASEs
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Autorização para Serviços Extraordinários: autorização de horas extras, transporte e alimentação por turno.
          </p>
        </div>

        <button
          type="button"
          onClick={novo}
          disabled={criando}
          className="inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-60 sm:w-auto"
        >
          {criando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Nova ASE
        </button>
      </div>

      {/* Barra de Filtros & Abas */}
      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Abas de Escopo (quando usuário pode ver todas) */}
          {podeVerTodas ? (
            <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800/80">
              <button
                type="button"
                onClick={() => setEscopoFiltro('todas')}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                  escopoFiltro === 'todas'
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-50'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                Todas as ASEs ({contagemTodas})
              </button>
              <button
                type="button"
                onClick={() => setEscopoFiltro('minhas')}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                  escopoFiltro === 'minhas'
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-50'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                Minhas ASEs ({contagemMinhas})
              </button>
            </div>
          ) : (
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Exibindo apenas as suas solicitações ({contagemMinhas})
            </div>
          )}

          {/* Filtros de Status */}
          <div className="flex flex-wrap items-center gap-1.5">
            {['TODOS', 'RASCUNHO', 'ENVIADO', 'CANCELADO'].map(st => (
              <button
                key={st}
                type="button"
                onClick={() => setFiltroStatus(st)}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                  filtroStatus === st
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700'
                }`}
              >
                {st === 'TODOS' ? 'Todos' : STATUS_LABEL[st]}
              </button>
            ))}
          </div>
        </div>

        {/* Campo de Busca */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={termoBusca}
            onChange={e => setTermoBusca(e.target.value)}
            placeholder="Buscar por protocolo, setor, turno, solicitante, colaborador, matrícula ou data..."
            className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2 pl-10 pr-9 text-xs text-slate-900 placeholder-slate-400 transition-all focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700/80 dark:bg-slate-950/50 dark:text-slate-100 dark:focus:bg-slate-900"
          />
          {termoBusca && (
            <button
              type="button"
              onClick={() => setTermoBusca('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Conteúdo da Lista */}
      {itens === null ? (
        <div className="flex justify-center py-16 text-slate-400">
          <Loader2 className="h-7 w-7 animate-spin" />
        </div>
      ) : gruposPorData.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white/50 px-6 py-14 text-center dark:border-slate-800 dark:bg-slate-900/30">
          <Timer className="mx-auto h-9 w-9 text-slate-300 dark:text-slate-600" />
          <p className="mt-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
            {termoBusca || filtroStatus !== 'TODOS'
              ? 'Nenhuma ASE encontrada para os filtros selecionados'
              : 'Nenhuma ASE registrada'}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {termoBusca || filtroStatus !== 'TODOS'
              ? 'Tente ajustar o termo de pesquisa ou os filtros de status.'
              : 'Crie uma nova solicitação para autorizar horas extras do seu turno.'}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {gruposPorData.map(grupo => (
            <section key={grupo.dataExecucao} className="space-y-3">
              {/* Cabeçalho da Data de Execução com Totais e Ações de Exportação Consolidada */}
              {(() => {
                const totalTranspDia = grupo.solicitacoes.reduce((acc, s) => acc + s.itens.filter(it => it.transporte).length, 0);
                const totalRefDia = grupo.solicitacoes.reduce((acc, s) => acc + s.itens.filter(it => it.refeicao).length, 0);
                const isExportingPdf = exportandoData === `pdf-${grupo.dataExecucao}`;

                return (
                  <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl bg-slate-50/80 p-3 border border-slate-200/80 dark:bg-slate-900/60 dark:border-slate-800">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400 shrink-0">
                        <Calendar className="h-4.5 w-4.5" />
                      </div>
                      <div>
                        <div className="flex items-baseline gap-2">
                          <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
                            {grupo.dataFormatada}
                          </span>
                          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 capitalize">
                            {grupo.diaSemana}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 mt-0.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                          <span>{grupo.solicitacoes.length} {grupo.solicitacoes.length === 1 ? 'ASE' : 'ASEs'}</span>
                          <span>·</span>
                          <span>{grupo.totalColaboradores} {grupo.totalColaboradores === 1 ? 'colaborador' : 'colaboradores'}</span>
                          {grupo.totalHoras > 0 && (
                            <>
                              <span>·</span>
                              <strong className="text-blue-700 dark:text-blue-300">{grupo.totalHoras.toFixed(2)}h extras</strong>
                            </>
                          )}
                          {totalTranspDia > 0 && (
                            <>
                              <span>·</span>
                              <span className="rounded bg-sky-100 text-sky-800 px-1.5 py-0.2 text-[10px] font-bold dark:bg-sky-950/60 dark:text-sky-300">
                                {totalTranspDia} Transp.
                              </span>
                            </>
                          )}
                          {totalRefDia > 0 && (
                            <>
                              <span>·</span>
                              <span className="rounded bg-emerald-100 text-emerald-800 px-1.5 py-0.2 text-[10px] font-bold dark:bg-emerald-950/60 dark:text-emerald-300">
                                {totalRefDia} Ref.
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Botões de Exportação Consolidada do Dia */}
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => exportarConsolidadoPdf(grupo.solicitacoes, grupo.dataExecucao)}
                        disabled={isExportingPdf}
                        title={`Exportar PDF consolidado com resumo, tabelas de transporte e refeição de ${grupo.dataFormatada}`}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition-all hover:bg-slate-50 hover:text-blue-600 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 dark:hover:text-blue-400 cursor-pointer"
                      >
                        {isExportingPdf ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600" />
                        ) : (
                          <FileDown className="h-3.5 w-3.5 text-rose-500" />
                        )}
                        <span>PDF Consolidado</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => exportarConsolidadoExcel(grupo.solicitacoes, grupo.dataExecucao)}
                        title={`Exportar planilha Excel (.xlsx) com abas de Resumo, Colaboradores, Transporte e Refeição de ${grupo.dataFormatada}`}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition-all hover:bg-slate-50 hover:text-emerald-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 dark:hover:text-emerald-400 cursor-pointer"
                      >
                        <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
                        <span>Excel Consolidado</span>
                      </button>
                    </div>
                  </div>
                );
              })()}

              {/* Cards das ASEs nesta data */}
              <div className="grid grid-cols-1 gap-3">
                {grupo.solicitacoes.map(s => {
                  const totalHoras = s.itens.reduce((acc, it) => acc + (it.total_horas || 0), 0);
                  const totalTransporte = s.itens.filter(it => it.transporte).length;
                  const totalRefeicao = s.itens.filter(it => it.refeicao).length;

                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => onAbrir(s.id)}
                      className="group flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left transition-all hover:-translate-y-0.5 hover:border-blue-400/50 hover:shadow-lg hover:shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-500/40"
                    >
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs font-bold text-slate-700 dark:text-slate-300">
                            {s.numero_protocolo}
                          </span>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${STATUS_CLASSES[s.status]}`}>
                            {STATUS_LABEL[s.status]}
                          </span>
                          {podeVerTodas && s.solicitante_nome && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                              <User className="h-3 w-3" />
                              {s.solicitante_nome}
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-baseline gap-2">
                          <p className="text-base font-bold text-slate-900 dark:text-slate-50">
                            {s.setor_nome || 'Setor não informado'}
                          </p>
                          <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">
                            · {s.turno_nome || 'Turno não informado'}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                          <span>
                            {s.itens.length} {s.itens.length === 1 ? 'colaborador' : 'colaboradores'}
                          </span>
                          {totalHoras > 0 && (
                            <span>· <strong className="text-slate-700 dark:text-slate-200">{totalHoras.toFixed(2)}h</strong></span>
                          )}
                          {totalTransporte > 0 && (
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                              Transp: {totalTransporte}
                            </span>
                          )}
                          {totalRefeicao > 0 && (
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                              Refeição: {totalRefeicao}
                            </span>
                          )}
                        </div>

                        {s.justificativa?.trim() && (
                          <p className="truncate text-xs text-slate-400 dark:text-slate-500 italic">
                            Justificativa: {s.justificativa.trim()}
                          </p>
                        )}
                      </div>

                      <ChevronRight className="h-5 w-5 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-blue-500 dark:text-slate-600" />
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

// =====================================================================
// Edição
// =====================================================================

function Edicao({ user, id, onVoltar }: { user: Profile; id: string; onVoltar: () => void }) {
  const toast = useToast();

  const [dados, setDados] = useState<AseHoraExtraCompleta | null>(null);
  const [setores, setSetores] = useState<RhSetor[]>([]);
  const [turnos, setTurnos] = useState<RhTurno[]>([]);
  const [pessoas, setPessoas] = useState<RhPessoa[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [sujo, setSujo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [buscaAberta, setBuscaAberta] = useState(false);
  const [confirmacao, setConfirmacao] = useState<
    | { tipo: 'excluir' }
    | { tipo: 'remover-item'; itemId: string; nome: string }
    | { tipo: 'sair' }
    | null
  >(null);
  const [processando, setProcessando] = useState(false);

  const [modoEdicao, setModoEdicao] = useState(false);
  const somenteLeitura = dados?.status === 'CANCELADO' || (dados?.status === 'ENVIADO' && !modoEdicao);

  useEffect(() => {
    let ativo = true;
    Promise.all([api.obterSolicitacaoASE(id), api.listarRhSetores(), api.listarRhTurnos(), api.listarRhPessoas()])
      .then(([s, se, tu, pe]) => {
        if (!ativo) return;
        if (!s) { setErro('Solicitação não encontrada.'); return; }
        setDados(s);
        setSetores(se);
        setTurnos(tu);
        setPessoas(pe);
      })
      .catch(e => { if (ativo) setErro((e as Error).message); });
    return () => { ativo = false; };
  }, [id]);

  useEffect(() => {
    if (!sujo) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [sujo]);

  const alterarCabecalho = (patch: Partial<AseHoraExtraCompleta>) => {
    setDados(d => {
      if (!d) return d;
      const merged = { ...d, ...patch };

      // Se a ASE ainda estiver em rascunho, sincroniza o protocolo com a data e setor selecionados
      if (merged.status === 'RASCUNHO' && ('setor_id' in patch || 'data_execucao' in patch)) {
        const setorNome = setores.find(s => s.id === (patch.setor_id ?? merged.setor_id))?.nome;
        merged.numero_protocolo = api.gerarProtocoloAse(merged.data_execucao, setorNome);
      }

      return merged;
    });
    setSujo(true);
  };

  const alterarItem = (itemId: string, patch: Partial<AseHoraExtraItem>) => {
    setDados(d => (d ? {
      ...d,
      itens: d.itens.map(it => {
        if (it.id !== itemId) return it;
        const merged = { ...it, ...patch };
        // Recalcula o total sempre que um campo que afeta o cálculo muda —
        // o usuário nunca precisa acionar isso manualmente.
        if ('hora_entrada' in patch || 'hora_saida' in patch || 'intervalo_minutos' in patch) {
          merged.total_horas = calcularHorasASE(merged.hora_entrada, merged.hora_saida, merged.intervalo_minutos).totalHoras;
        }
        return merged;
      }),
    } : d));
    setSujo(true);
  };

  const salvar = useCallback(async (silencioso = false): Promise<boolean> => {
    if (!dados) return false;
    setSalvando(true);
    try {
      await api.salvarSolicitacaoASE(dados.id, {
        numero_protocolo: dados.numero_protocolo,
        setor_id: dados.setor_id,
        turno_id: dados.turno_id,
        data_execucao: dados.data_execucao,
        justificativa: dados.justificativa,
      });
      await Promise.all(dados.itens.map(it => api.atualizarItemASE(it.id, {
        transporte: it.transporte,
        refeicao: it.refeicao,
        hora_entrada: it.hora_entrada,
        hora_saida: it.hora_saida,
        intervalo_minutos: it.intervalo_minutos,
        percentual_he: it.percentual_he,
        total_horas: it.total_horas,
        observacao: it.observacao,
      })));
      setSujo(false);
      if (!silencioso) toast.success('ASE salva com sucesso.');
      return true;
    } catch (e) {
      toast.error(`Falha ao salvar: ${(e as Error).message}`);
      return false;
    } finally {
      setSalvando(false);
    }
  }, [dados, toast]);

  const adicionarColaborador = async (pessoa: RhPessoa) => {
    if (!dados) return;
    if (dados.itens.some(it => it.pessoa_id === pessoa.id)) {
      toast.warning(`${pessoa.nome} já está nesta ASE.`);
      return;
    }
    let percentualSugerido: number | null = null;
    try {
      percentualSugerido = await api.buscarPercentualHE(dados.data_execucao);
    } catch {
      // Sem calendário cadastrado para a data: segue sem sugestão, o campo fica editável.
    }
    try {
      const novo = await api.adicionarItemASE(dados.id, {
        pessoa_id: pessoa.id,
        registro: pessoa.registro,
        nome: pessoa.nome,
        cargo: pessoa.cargo,
        transporte: false,
        refeicao: false,
        hora_entrada: '',
        hora_saida: '',
        intervalo_minutos: 0,
        percentual_he: percentualSugerido,
        total_horas: 0,
        observacao: null,
      });
      setDados(d => (d ? { ...d, itens: [...d.itens, novo] } : d));
      setBuscaAberta(false);
    } catch (e) {
      toast.error(`Não foi possível adicionar o colaborador: ${(e as Error).message}`);
    }
  };

  const confirmarAcao = async () => {
    if (!confirmacao || !dados) return;
    setProcessando(true);
    try {
      if (confirmacao.tipo === 'remover-item') {
        await api.removerItemASE(confirmacao.itemId);
        setDados(d => (d ? { ...d, itens: d.itens.filter(it => it.id !== confirmacao.itemId) } : d));
        setConfirmacao(null);
      } else if (confirmacao.tipo === 'excluir') {
        await api.excluirSolicitacaoASE(dados.id);
        toast.success('ASE excluída.');
        onVoltar();
      }
    } catch (e) {
      toast.error(`Falha ao excluir: ${(e as Error).message}`);
    } finally {
      setProcessando(false);
    }
  };

  const enviar = async () => {
    if (!dados) return;
    if (!dados.setor_id || !dados.turno_id) {
      toast.warning('Selecione o setor e o turno antes de enviar.');
      return;
    }
    if (dados.itens.length === 0) {
      toast.warning('Adicione ao menos um colaborador antes de enviar.');
      return;
    }
    const semHorario = dados.itens.some(it => !it.hora_entrada || !it.hora_saida);
    if (semHorario) {
      toast.warning('Preencha o horário de entrada e saída de todos os colaboradores.');
      return;
    }
    if (!(await salvar(true))) return;
    try {
      if (dados.status !== 'ENVIADO') {
        await api.salvarSolicitacaoASE(dados.id, { status: 'ENVIADO' });
        setDados(d => (d ? { ...d, status: 'ENVIADO' } : d));
      }
      setModoEdicao(false);

      const setorNome = setores.find(s => s.id === dados.setor_id)?.nome ?? dados.setor_nome ?? '-';
      const turnoNome = turnos.find(t => t.id === dados.turno_id)?.nome ?? dados.turno_nome ?? '-';
      const solicitanteNome = dados.solicitante_nome || user.name;

      const emailConfig = await obterConfigEmail('rh_ase_hora_extra');
      const emailContent = buildAseHoraExtraEmail({
        solicitacao: dados,
        setorNome,
        turnoNome,
        solicitanteNome,
      });

      const mailtoUrl = montarMailtoComConfig({
        destinatarios: emailConfig?.destinatarios || 'ase@ten.ind.br',
        copia: emailConfig?.copia,
        copiaOculta: emailConfig?.copia_oculta,
        assunto: emailConfig?.assunto_padrao
          ? `${emailConfig.assunto_padrao} - ${dados.numero_protocolo} - ${setorNome} (${formatDataBR(dados.data_execucao)})`
          : emailContent.assunto,
        corpo: emailContent.corpo,
      });

      window.location.href = mailtoUrl;
      toast.success(`ASE ${dados.numero_protocolo} salva. Abrindo e-mail no Outlook...`);
    } catch (e) {
      toast.error(`Falha ao enviar: ${(e as Error).message}`);
    }
  };

  const reabrir = async () => {
    if (!dados) return;
    try {
      await api.salvarSolicitacaoASE(dados.id, { status: 'RASCUNHO' });
      setDados(d => (d ? { ...d, status: 'RASCUNHO' } : d));
      setModoEdicao(true);
      toast.info('ASE reaberta para edição.');
    } catch (e) {
      toast.error(`Falha ao reabrir: ${(e as Error).message}`);
    }
  };

  const exportarPdf = async () => {
    if (!dados) return;
    setProcessando(true);
    try {
      const setorNome = setores.find(s => s.id === dados.setor_id)?.nome ?? dados.setor_nome;
      const turnoNome = turnos.find(t => t.id === dados.turno_id)?.nome ?? dados.turno_nome;
      await exportAseHoraExtraPdf({ ...dados, setor_nome: setorNome, turno_nome: turnoNome, solicitante_nome: dados.solicitante_nome || user.name });
    } catch (e) {
      toast.error(`Falha ao gerar o PDF: ${(e as Error).message}`);
    } finally {
      setProcessando(false);
    }
  };

  const exportarExcel = () => {
    if (!dados) return;
    try {
      const setorNome = setores.find(s => s.id === dados.setor_id)?.nome ?? dados.setor_nome ?? '-';
      const turnoNome = turnos.find(t => t.id === dados.turno_id)?.nome ?? dados.turno_nome ?? '-';
      exportAseConsolidadoDiaExcel([{
        ...dados,
        setor_nome: setorNome,
        turno_nome: turnoNome,
        solicitante_nome: dados.solicitante_nome || user.name,
      }], dados.data_execucao);
      toast.success(`Planilha da ASE ${dados.numero_protocolo} exportada!`);
    } catch (e) {
      toast.error(`Falha ao exportar Excel: ${(e as Error).message}`);
    }
  };

  const exportarCsv = () => {
    if (!dados) return;
    const linhas = [
      'REGISTRO;NOME;DATA;ENTRADA;SAIDA;INTERVALO_MIN;PERCENTUAL_HE;TOTAL_HORAS',
      ...dados.itens.map(it => [
        it.registro, it.nome, dados.data_execucao, it.hora_entrada, it.hora_saida,
        it.intervalo_minutos, it.percentual_he ?? '', it.total_horas ?? '',
      ].join(';')),
    ];
    const blob = new Blob([linhas.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ase-hora-extra-${dados.numero_protocolo}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const voltar = () => {
    if (sujo) { setConfirmacao({ tipo: 'sair' }); return; }
    onVoltar();
  };

  const resumo = useMemo(() => {
    if (!dados) return null;
    const porPercentual = new Map<string, number>();
    let totalGeral = 0;
    dados.itens.forEach(it => {
      const chave = it.percentual_he != null ? `${it.percentual_he}%` : 'Sem %HE';
      porPercentual.set(chave, (porPercentual.get(chave) || 0) + (it.total_horas || 0));
      totalGeral += it.total_horas || 0;
    });
    return { porPercentual: Array.from(porPercentual.entries()), totalGeral };
  }, [dados]);

  const antecedenciaInsuficiente = useMemo(() => {
    if (!dados?.data_execucao) return false;
    const horasAte = (new Date(`${dados.data_execucao}T00:00:00`).getTime() - Date.now()) / 3_600_000;
    return horasAte < ANTECEDENCIA_MINIMA_HORAS && horasAte > -24;
  }, [dados?.data_execucao]);

  if (erro) {
    return (
      <div className="mx-auto max-w-2xl rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center dark:border-rose-900 dark:bg-rose-950/30">
        <AlertCircle className="mx-auto h-8 w-8 text-rose-500" />
        <p className="mt-2 text-sm font-semibold text-rose-800 dark:text-rose-300">{erro}</p>
        <button type="button" onClick={onVoltar} className="mt-4 text-sm font-semibold text-blue-600 hover:underline">
          Voltar para a lista
        </button>
      </div>
    );
  }

  if (!dados) {
    return (
      <div className="flex justify-center py-16 text-slate-400">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  const inputBase = 'h-10 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50';

  return (
    <div className="mx-auto max-w-5xl pb-24">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <button
            type="button"
            onClick={voltar}
            className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-blue-600 dark:text-slate-400"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            ASE - Hora Extra
          </button>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-xl font-bold text-slate-900 dark:text-slate-50">
              {dados.setor_nome || setores.find(s => s.id === dados.setor_id)?.nome || 'Nova ASE'}
            </h1>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              FRM.RHU-0007
            </span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${STATUS_CLASSES[dados.status]}`}>
              {STATUS_LABEL[dados.status]}
            </span>
            {modoEdicao && (
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700 dark:bg-blue-950/60 dark:text-blue-400">
                Edição Ativa
              </span>
            )}
          </div>
          <p className="mt-0.5 font-mono text-[11px] text-slate-400">{dados.numero_protocolo}</p>
        </div>

        <div className="flex items-center gap-2">
          {dados.status === 'ENVIADO' && !modoEdicao && (
            <button
              type="button"
              onClick={() => setModoEdicao(true)}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50/50 px-3 py-2 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-400 dark:hover:bg-blue-900/50"
            >
              <Edit3 className="h-3.5 w-3.5" />
              Editar Solicitação
            </button>
          )}

          {dados.status === 'RASCUNHO' && (
            <button
              type="button"
              onClick={() => setConfirmacao({ tipo: 'excluir' })}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-slate-500 transition-colors hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 dark:hover:text-rose-400"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Excluir
            </button>
          )}
        </div>
      </div>

      {antecedenciaInsuficiente && dados.status === 'RASCUNHO' && (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>Esta data tem menos de {ANTECEDENCIA_MINIMA_HORAS}h de antecedência (recomendação, não bloqueia o envio).</p>
        </div>
      )}

      {/* Dados gerais */}
      <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="setor" className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Setor</label>
            <select
              id="setor"
              value={dados.setor_id || ''}
              disabled={somenteLeitura}
              onChange={e => alterarCabecalho({ setor_id: e.target.value || null })}
              className={`mt-1.5 ${inputBase}`}
            >
              <option value="">Selecione...</option>
              {setores.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="turno" className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Turno</label>
            <select
              id="turno"
              value={dados.turno_id || ''}
              disabled={somenteLeitura}
              onChange={e => alterarCabecalho({ turno_id: e.target.value || null })}
              className={`mt-1.5 ${inputBase}`}
            >
              <option value="">Selecione...</option>
              {turnos.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="data" className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Data {dados.data_execucao && `(${diaDaSemana(dados.data_execucao)})`}
            </label>
            <input
              id="data"
              type="date"
              value={dados.data_execucao}
              disabled={somenteLeitura}
              onChange={e => alterarCabecalho({ data_execucao: e.target.value })}
              className={`mt-1.5 ${inputBase}`}
            />
          </div>
          <div className="sm:col-span-3">
            <label htmlFor="justificativa" className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Justificativa</label>
            <textarea
              id="justificativa"
              rows={2}
              value={dados.justificativa || ''}
              disabled={somenteLeitura}
              placeholder="Motivo da hora extra..."
              onChange={e => alterarCabecalho({ justificativa: e.target.value || null })}
              className="mt-1.5 w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50"
            />
          </div>
        </div>
      </section>

      {/* Colaboradores */}
      <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-slate-900 dark:text-slate-50">Colaboradores ({dados.itens.length})</h2>
          {!somenteLeitura && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setBuscaAberta(v => !v)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-400"
              >
                <Plus className="h-3.5 w-3.5" />
                Adicionar colaborador
              </button>
              {buscaAberta && (
                <BuscaColaborador pessoas={pessoas} onSelecionar={adicionarColaborador} onFechar={() => setBuscaAberta(false)} />
              )}
            </div>
          )}
        </div>

        {dados.itens.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-slate-200 px-5 py-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
            Nenhum colaborador adicionado ainda.
          </div>
        ) : (
          <>
            {/* Modo Mobile: Cards de Colaboradores (< md) */}
            <div className="mt-4 space-y-3 md:hidden">
              {dados.itens.map(it => (
                <CardColaboradorMobile
                  key={it.id}
                  item={it}
                  somenteLeitura={somenteLeitura}
                  onChange={patch => alterarItem(it.id, patch)}
                  onRemover={() => setConfirmacao({ tipo: 'remover-item', itemId: it.id, nome: it.nome })}
                />
              ))}
            </div>

            {/* Modo Desktop: Tabela Completa (>= md) */}
            <div className="mt-4 hidden overflow-x-auto md:block">
              <table className="w-full min-w-[860px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:text-slate-400">
                    <th className="px-2 py-2">Registro</th>
                    <th className="px-2 py-2">Funcionário</th>
                    <th className="px-2 py-2">Função</th>
                    <th className="px-2 py-2 text-center">Transp.</th>
                    <th className="px-2 py-2 text-center">Refeição</th>
                    <th className="px-2 py-2">Entrada</th>
                    <th className="px-2 py-2">Saída</th>
                    <th className="px-2 py-2">Interv. (min)</th>
                    <th className="px-2 py-2">% HE</th>
                    <th className="px-2 py-2 text-right">Total</th>
                    <th className="px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {dados.itens.map(it => (
                    <LinhaColaborador
                      key={it.id}
                      item={it}
                      somenteLeitura={somenteLeitura}
                      onChange={patch => alterarItem(it.id, patch)}
                      onRemover={() => setConfirmacao({ tipo: 'remover-item', itemId: it.id, nome: it.nome })}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {/* Resumo */}
      {resumo && dados.itens.length > 0 && (
        <section className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-950/40">
          <h2 className="text-sm font-bold text-slate-900 dark:text-slate-50">Resumo</h2>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Colaboradores</p>
              <p className="mt-0.5 text-lg font-bold text-slate-900 dark:text-slate-50">{dados.itens.length}</p>
            </div>
            {resumo.porPercentual.map(([chave, horas]) => (
              <div key={chave}>
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Horas {chave}</p>
                <p className="mt-0.5 text-lg font-bold text-slate-900 dark:text-slate-50">{horas.toFixed(2)}h</p>
              </div>
            ))}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Total Geral</p>
              <p className="mt-0.5 text-lg font-bold text-blue-600 dark:text-blue-400">{resumo.totalGeral.toFixed(2)}h</p>
            </div>
          </div>
        </section>
      )}

      {/* Barra de ação fixa */}
      <div className="sticky bottom-0 -mx-3 mt-5 border-t border-slate-200 bg-white/95 px-3 py-3 backdrop-blur sm:-mx-6 sm:px-6 dark:border-slate-800 dark:bg-slate-950/95 z-10 shadow-lg">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2">
          {/* Ações de Exportação */}
          <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto">
            <button
              type="button"
              onClick={exportarCsv}
              disabled={dados.itens.length === 0}
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 cursor-pointer"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              CSV
            </button>
            <button
              type="button"
              onClick={exportarExcel}
              disabled={dados.itens.length === 0}
              title="Exportar planilha Excel (.xlsx) formatada com resumo, transporte e refeição"
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 hover:text-emerald-700 disabled:opacity-40 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:text-emerald-400 cursor-pointer"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
              Excel
            </button>
            <button
              type="button"
              onClick={exportarPdf}
              disabled={processando}
              title="Exportar PDF com logo oficial e tabelas estruturadas"
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 hover:text-rose-700 disabled:opacity-40 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:text-rose-400 cursor-pointer"
            >
              <FileDown className="h-3.5 w-3.5 text-rose-500" />
              PDF
            </button>
          </div>

          {/* Ações de Estado / Salvamento */}
          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            {somenteLeitura ? (
              <>
                <button
                  type="button"
                  onClick={() => setModoEdicao(true)}
                  className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 rounded-xl border border-blue-300 bg-blue-50/50 px-4 py-2.5 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-400 dark:hover:bg-blue-900/50 cursor-pointer"
                >
                  <Edit3 className="h-4 w-4" />
                  Editar Solicitação
                </button>
                <button
                  type="button"
                  onClick={enviar}
                  disabled={salvando}
                  className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-60 cursor-pointer"
                >
                  <Mail className="h-4 w-4" />
                  Reenviar E-mail
                </button>
              </>
            ) : (
              <>
                {modoEdicao && (
                  <button
                    type="button"
                    onClick={() => setModoEdicao(false)}
                    className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 px-3.5 py-2.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    Concluir Edição
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => salvar()}
                  disabled={salvando || !sujo}
                  className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 px-3.5 py-2.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 cursor-pointer"
                >
                  {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {sujo ? 'Salvar' : 'Salvo'}
                </button>
                <button
                  type="button"
                  onClick={enviar}
                  disabled={salvando}
                  className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-60 cursor-pointer"
                >
                  <Send className="h-4 w-4" />
                  {dados.status === 'ENVIADO' ? 'Salvar e Enviar' : 'Enviar'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {confirmacao?.tipo === 'remover-item' && (
        <ConfirmDialog
          titulo={`Remover ${confirmacao.nome}?`}
          mensagem="Os horários preenchidos para este colaborador serão perdidos."
          confirmarLabel="Remover"
          variante="perigo"
          confirmando={processando}
          onConfirmar={confirmarAcao}
          onCancelar={() => setConfirmacao(null)}
        />
      )}

      {confirmacao?.tipo === 'excluir' && (
        <ConfirmDialog
          titulo="Excluir esta ASE?"
          mensagem="Todos os colaboradores e horários deste formulário serão excluídos. A ação não pode ser desfeita."
          confirmarLabel="Excluir"
          variante="perigo"
          confirmando={processando}
          onConfirmar={confirmarAcao}
          onCancelar={() => setConfirmacao(null)}
        />
      )}

      {confirmacao?.tipo === 'sair' && (
        <ConfirmDialog
          titulo="Sair sem salvar?"
          mensagem="Há alterações não salvas nesta ASE. Os colaboradores já adicionados ficam guardados, mas os campos e horários digitados serão perdidos."
          confirmarLabel="Sair sem salvar"
          cancelarLabel="Continuar editando"
          variante="perigo"
          onConfirmar={onVoltar}
          onCancelar={() => setConfirmacao(null)}
        />
      )}
    </div>
  );
}

// =====================================================================
// Card de colaborador (Mobile)
// =====================================================================

function CardColaboradorMobile({
  item, somenteLeitura, onChange, onRemover,
}: {
  item: AseHoraExtraItem;
  somenteLeitura: boolean;
  onChange: (patch: Partial<AseHoraExtraItem>) => void;
  onRemover: () => void;
}) {
  const excedeLimiteClt = (item.total_horas || 0) > LIMITE_DIARIO_CLT_HORAS;
  const inputStyle = 'h-9 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-xs text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50';

  return (
    <div className="relative rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-3 dark:border-slate-800 dark:bg-slate-900/60 shadow-sm">
      {/* Topo: Nome, Matrícula e Ações */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-bold text-slate-900 dark:text-slate-100">{item.nome}</span>
            <span className="rounded bg-slate-200/80 px-1.5 py-0.2 font-mono text-[10px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-400">
              {item.registro}
            </span>
          </div>
          {item.cargo && (
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{item.cargo}</p>
          )}

          {/* Rota / Ponto / Contato quando transporte marcado */}
          {item.transporte && (item.rota_transporte || item.ponto_embarque_transporte) && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px]">
              <span className="inline-flex items-center gap-1 rounded bg-blue-100/70 px-2 py-0.5 font-medium text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                🚌 {item.rota_transporte || 'Rota'}: {item.ponto_embarque_transporte || 'Ponto não cadastrado'}
                {item.horario_embarque_transporte && ` (${item.horario_embarque_transporte})`}
              </span>
              {item.contato_transporte && (
                <span className="rounded bg-slate-200/60 px-1.5 py-0.5 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  📞 {item.contato_transporte}
                </span>
              )}
            </div>
          )}
        </div>

        {!somenteLeitura && (
          <button
            type="button"
            onClick={onRemover}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 dark:hover:text-rose-400 cursor-pointer"
            title="Remover colaborador"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Opções: Transporte e Refeição */}
      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200/70 dark:border-slate-800">
        <label className={`flex items-center justify-center gap-2 rounded-lg border p-2 text-xs font-semibold cursor-pointer transition-colors ${
          item.transporte
            ? 'border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-700 dark:bg-blue-950/60 dark:text-blue-200'
            : 'border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400'
        }`}>
          <input
            type="checkbox"
            checked={item.transporte}
            disabled={somenteLeitura}
            onChange={e => onChange({ transporte: e.target.checked })}
            className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
          />
          <span>🚌 Transporte</span>
        </label>

        <label className={`flex items-center justify-center gap-2 rounded-lg border p-2 text-xs font-semibold cursor-pointer transition-colors ${
          item.refeicao
            ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-200'
            : 'border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400'
        }`}>
          <input
            type="checkbox"
            checked={item.refeicao}
            disabled={somenteLeitura}
            onChange={e => onChange({ refeicao: e.target.checked })}
            className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
          />
          <span>🍽️ Refeição</span>
        </label>
      </div>

      {/* Horários: Entrada e Saída */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">
            Entrada
          </label>
          <input
            type="time"
            value={item.hora_entrada}
            disabled={somenteLeitura}
            onChange={e => onChange({ hora_entrada: e.target.value })}
            className={inputStyle}
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">
            Saída
          </label>
          <input
            type="time"
            value={item.hora_saida}
            disabled={somenteLeitura}
            onChange={e => onChange({ hora_saida: e.target.value })}
            className={inputStyle}
          />
        </div>
      </div>

      {/* Intervalo, % HE e Total */}
      <div className="grid grid-cols-3 gap-2 items-end">
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">
            Interv. (min)
          </label>
          <input
            type="number"
            min={0}
            step={5}
            value={item.intervalo_minutos}
            disabled={somenteLeitura}
            onChange={e => onChange({ intervalo_minutos: Number(e.target.value) || 0 })}
            className={inputStyle}
          />
        </div>

        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">
            % HE
          </label>
          <input
            type="number"
            min={0}
            max={999}
            step={1}
            value={item.percentual_he ?? ''}
            disabled={somenteLeitura}
            placeholder="%"
            onChange={e => onChange({ percentual_he: e.target.value === '' ? null : Number(e.target.value) })}
            className={inputStyle}
          />
        </div>

        <div className="text-right">
          <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">
            Total Horas
          </span>
          <span
            className={`inline-flex h-9 w-full items-center justify-end rounded-lg bg-slate-100 px-2 text-xs font-bold ${
              excedeLimiteClt
                ? 'text-amber-600 dark:bg-amber-950/40 dark:text-amber-400'
                : 'text-blue-700 dark:bg-slate-800 dark:text-blue-300'
            }`}
            title={excedeLimiteClt ? `Acima de ${LIMITE_DIARIO_CLT_HORAS}h/dia (Art. 59 CLT)` : undefined}
          >
            {excedeLimiteClt && <AlertTriangle className="mr-1 h-3.5 w-3.5" />}
            {(item.total_horas ?? 0).toFixed(2)}h
          </span>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// Linha de colaborador (Desktop)
// =====================================================================

function LinhaColaborador({
  item, somenteLeitura, onChange, onRemover,
}: {
  item: AseHoraExtraItem;
  somenteLeitura: boolean;
  onChange: (patch: Partial<AseHoraExtraItem>) => void;
  onRemover: () => void;
}) {
  const excedeLimiteClt = (item.total_horas || 0) > LIMITE_DIARIO_CLT_HORAS;
  const cellInput = 'h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50';

  return (
    <tr className="border-b border-slate-100 align-middle dark:border-slate-800/70">
      <td className="whitespace-nowrap px-2 py-2 font-mono text-xs text-slate-500 dark:text-slate-400">{item.registro}</td>
      <td className="px-2 py-2 text-xs text-slate-900 dark:text-slate-50">
        <span className="font-semibold">{item.nome}</span>
        {item.transporte && (item.rota_transporte || item.ponto_embarque_transporte) && (
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1 rounded bg-blue-50 px-1.5 py-0.5 font-medium text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
              🚌 {item.rota_transporte || 'Rota'}: {item.ponto_embarque_transporte || 'Ponto não cadastrado'}
              {item.horario_embarque_transporte && ` (${item.horario_embarque_transporte})`}
            </span>
            {item.contato_transporte && (
              <span className="text-slate-400 dark:text-slate-500">📞 {item.contato_transporte}</span>
            )}
          </div>
        )}
      </td>
      <td className="px-2 py-2 text-xs text-slate-500 dark:text-slate-400">{item.cargo || '-'}</td>
      <td className="px-2 py-2 text-center">
        <input type="checkbox" checked={item.transporte} disabled={somenteLeitura} onChange={e => onChange({ transporte: e.target.checked })} className="h-4 w-4 rounded border-slate-300" />
      </td>
      <td className="px-2 py-2 text-center">
        <input type="checkbox" checked={item.refeicao} disabled={somenteLeitura} onChange={e => onChange({ refeicao: e.target.checked })} className="h-4 w-4 rounded border-slate-300" />
      </td>
      <td className="px-2 py-2">
        <input type="time" value={item.hora_entrada} disabled={somenteLeitura} onChange={e => onChange({ hora_entrada: e.target.value })} className={cellInput} />
      </td>
      <td className="px-2 py-2">
        <input type="time" value={item.hora_saida} disabled={somenteLeitura} onChange={e => onChange({ hora_saida: e.target.value })} className={cellInput} />
      </td>
      <td className="px-2 py-2">
        <input type="number" min={0} step={5} value={item.intervalo_minutos} disabled={somenteLeitura} onChange={e => onChange({ intervalo_minutos: Number(e.target.value) || 0 })} className={cellInput} />
      </td>
      <td className="px-2 py-2">
        <input type="number" min={0} max={999} step={1} value={item.percentual_he ?? ''} disabled={somenteLeitura} placeholder="%" onChange={e => onChange({ percentual_he: e.target.value === '' ? null : Number(e.target.value) })} className={cellInput} />
      </td>
      <td className="px-2 py-2 text-right">
        <span
          className={`inline-flex items-center gap-1 text-xs font-bold ${excedeLimiteClt ? 'text-amber-600 dark:text-amber-400' : 'text-slate-700 dark:text-slate-200'}`}
          title={excedeLimiteClt ? `Acima de ${LIMITE_DIARIO_CLT_HORAS}h/dia (Art. 59 CLT)` : undefined}
        >
          {excedeLimiteClt && <AlertTriangle className="h-3.5 w-3.5" />}
          {(item.total_horas ?? 0).toFixed(2)}h
        </span>
      </td>
      <td className="px-2 py-2 text-right">
        {!somenteLeitura && (
          <button type="button" onClick={onRemover} className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 dark:hover:text-rose-400">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </td>
    </tr>
  );
}

// =====================================================================
// Busca de colaborador
// =====================================================================

function BuscaColaborador({
  pessoas, onSelecionar, onFechar,
}: {
  pessoas: RhPessoa[];
  onSelecionar: (p: RhPessoa) => void;
  onFechar: () => void;
}) {
  const [termo, setTermo] = useState('');

  const resultados = useMemo(() => {
    const q = termo.trim().toLowerCase();
    const base = pessoas.filter(p => p.ativo);
    if (!q) return base.slice(0, 30);
    return base
      .filter(p => p.nome.toLowerCase().includes(q) || p.registro.toLowerCase().includes(q))
      .slice(0, 30);
  }, [pessoas, termo]);

  return (
    <div className="absolute right-0 top-full z-20 mt-2 w-80 rounded-xl border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          {/* eslint-disable-next-line jsx-a11y/no-autofocus -- popover só abre por clique explícito */}
          <input
            type="text"
            autoFocus
            value={termo}
            onChange={e => setTermo(e.target.value)}
            placeholder="Nome ou registro..."
            className="h-9 w-full rounded-lg border border-slate-300 bg-white pl-8 pr-2 text-xs text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50"
          />
        </div>
        <button type="button" onClick={onFechar} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
          <X className="h-4 w-4" />
        </button>
      </div>
      <ul className="mt-2 max-h-64 overflow-y-auto">
        {resultados.length === 0 ? (
          <li className="px-2 py-4 text-center text-xs text-slate-400">Nenhum colaborador encontrado.</li>
        ) : (
          resultados.map(p => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => onSelecionar(p)}
                className="flex w-full flex-col items-start rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-blue-50 dark:hover:bg-blue-950/30"
              >
                <span className="text-xs font-semibold text-slate-900 dark:text-slate-50">{p.nome}</span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">{p.registro}{p.cargo ? ` · ${p.cargo}` : ''}</span>
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
