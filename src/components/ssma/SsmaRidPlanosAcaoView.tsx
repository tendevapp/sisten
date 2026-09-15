/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Painel de Planos de Ação de Fechamento do RID — SISTEN SSMA
 * Exibe todas as demandas direcionadas para áreas, colaboradores marcados com @
 * e o status de resolução/conclusão de cada plano.
 */

import React, { useMemo, useState } from 'react';
import {
  Target,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Building2,
  AtSign,
  Calendar,
  ExternalLink,
  Download,
  RotateCcw,
  Check,
  User,
  ShieldAlert,
  ArrowRight,
  Layers,
  ChevronRight,
} from 'lucide-react';
import type { Profile, SsmaRidDesvio, SsmaPlanoAcaoStatus } from '../../types';
import { calcularDiasEmAberto } from '../../lib/ssmaApi';
import { useToast } from '../ui/Toast';

interface SsmaRidPlanosAcaoViewProps {
  desvios: SsmaRidDesvio[];
  user: Profile;
  onAbrirDesvio: (desvio: SsmaRidDesvio) => void;
  onIrParaHistorico: () => void;
}

export default function SsmaRidPlanosAcaoView({
  desvios,
  user,
  onAbrirDesvio,
  onIrParaHistorico,
}: SsmaRidPlanosAcaoViewProps) {
  const toast = useToast();

  // Filtros
  const [busca, setBusca] = useState('');
  const [filtroArea, setFiltroArea] = useState('TODAS');
  const [filtroStatus, setFiltroStatus] = useState<string>('TODOS');
  const [filtroResponsavel, setFiltroResponsavel] = useState('TODOS');

  // Filtra apenas RIDs que têm plano de ação definido
  const desviosComPlano = useMemo(() => {
    return desvios.filter(
      (d) =>
        d.plano_acao &&
        (d.plano_acao.area_destino ||
          d.plano_acao.descricao_demanda ||
          (d.plano_acao.responsaveis_mencionados && d.plano_acao.responsaveis_mencionados.length > 0))
    );
  }, [desvios]);

  // Lista de áreas únicas presentes nos planos
  const areasDisponiveis = useMemo(() => {
    const set = new Set<string>();
    desviosComPlano.forEach((d) => {
      if (d.plano_acao?.area_destino) {
        set.add(d.plano_acao.area_destino.toUpperCase());
      }
    });
    return Array.from(set).sort();
  }, [desviosComPlano]);

  // Lista de responsáveis únicos presentes nos planos
  const responsaveisDisponiveis = useMemo(() => {
    const set = new Set<string>();
    desviosComPlano.forEach((d) => {
      d.plano_acao?.responsaveis_mencionados?.forEach((r) => {
        set.add(r.toUpperCase());
      });
    });
    return Array.from(set).sort();
  }, [desviosComPlano]);

  // Métricas dos planos de ação
  const metricasPlanos = useMemo(() => {
    const total = desviosComPlano.length;
    let pendentes = 0;
    let emAndamento = 0;
    let concluidos = 0;
    let atrasados = 0;
    let somaDiasAbertos = 0;
    let qtdAtivos = 0;

    const hoje = new Date().toISOString().slice(0, 10);

    desviosComPlano.forEach((d) => {
      const st = d.plano_acao?.status;
      if (st === 'CONCLUIDO') {
        concluidos++;
      } else if (st === 'EM_ANDAMENTO') {
        emAndamento++;
      } else {
        pendentes++;
      }

      if (st !== 'CONCLUIDO') {
        const info = calcularDiasEmAberto(d.data || d.data_registro || d.created_at);
        somaDiasAbertos += info.dias;
        qtdAtivos++;
      }

      if (st !== 'CONCLUIDO' && d.plano_acao?.prazo && d.plano_acao.prazo < hoje) {
        atrasados++;
      }
    });

    const taxaConclusao = total > 0 ? Math.round((concluidos / total) * 100) : 0;
    const mediaDiasAbertos = qtdAtivos > 0 ? Math.round(somaDiasAbertos / qtdAtivos) : 0;

    return { total, pendentes, emAndamento, concluidos, atrasados, taxaConclusao, mediaDiasAbertos, qtdAtivos };
  }, [desviosComPlano]);

  // RIDs filtrados para exibição
  const desviosFiltrados = useMemo(() => {
    return desviosComPlano.filter((d) => {
      const plano = d.plano_acao!;

      // Filtro de status
      if (filtroStatus !== 'TODOS' && plano.status !== filtroStatus) {
        return false;
      }

      // Filtro de área
      if (filtroArea !== 'TODAS' && plano.area_destino.toUpperCase() !== filtroArea.toUpperCase()) {
        return false;
      }

      // Filtro de responsável
      if (
        filtroResponsavel !== 'TODOS' &&
        !plano.responsaveis_mencionados?.some(
          (r) => r.toUpperCase() === filtroResponsavel.toUpperCase()
        )
      ) {
        return false;
      }

      // Busca textual livre
      if (busca.trim()) {
        const termo = busca.toLowerCase();
        const noRegistro = d.numero_registro.toLowerCase().includes(termo);
        const naArea = plano.area_destino.toLowerCase().includes(termo);
        const naDemanda = plano.descricao_demanda.toLowerCase().includes(termo);
        const naConclusao = (plano.conclusao || '').toLowerCase().includes(termo);
        const nosResps = (plano.responsaveis_mencionados || []).some((r) =>
          r.toLowerCase().includes(termo)
        );
        const noInformante = d.nome_informante.toLowerCase().includes(termo);

        if (!noRegistro && !naArea && !naDemanda && !naConclusao && !nosResps && !noInformante) {
          return false;
        }
      }

      return true;
    });
  }, [desviosComPlano, busca, filtroArea, filtroStatus, filtroResponsavel]);

  // Exportar para CSV
  const exportarCsvPlanos = () => {
    if (desviosFiltrados.length === 0) {
      toast.info('Não há planos de ação para exportar com os filtros atuais.');
      return;
    }

    const colunas = [
      'RID',
      'Data Registro',
      'Dias em Aberto / Resolução',
      'Área Destino',
      'Responsáveis Marcados (@)',
      'Demanda / Ação de Fechamento',
      'Prazo',
      'Status do Plano',
      'Conclusão / Parecer',
      'Data Conclusão',
      'Concluído Por',
      'Informante Original',
      'Setor Original',
    ];

    const linhas = desviosFiltrados.map((d) => {
      const p = d.plano_acao!;
      const infoDias = calcularDiasEmAberto(
        d.data || d.data_registro || d.created_at,
        p.concluido_em
      );
      return [
        `"${d.numero_registro}"`,
        `"${d.data_registro}"`,
        `"${infoDias.texto}"`,
        `"${p.area_destino.replace(/"/g, '""')}"`,
        `"${(p.responsaveis_mencionados || []).map((r) => `@${r}`).join(', ').replace(/"/g, '""')}"`,
        `"${p.descricao_demanda.replace(/"/g, '""')}"`,
        `"${p.prazo || '-'}"`,
        `"${p.status}"`,
        `"${(p.conclusao || '-').replace(/"/g, '""')}"`,
        `"${p.concluido_em ? new Date(p.concluido_em).toLocaleDateString('pt-BR') : '-'}"`,
        `"${(p.concluido_por_nome || '-').replace(/"/g, '""')}"`,
        `"${d.nome_informante.replace(/"/g, '""')}"`,
        `"${d.setor}"`,
      ];
    });

    const csvContent = '\uFEFF' + [colunas.join(';'), ...linhas.map((l) => l.join(';'))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute(
      'download',
      `SISTEN_SSMA_Planos_Acao_RID_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success('Planilha de planos de ação exportada com sucesso!');
  };

  const getStatusBadge = (status: SsmaPlanoAcaoStatus) => {
    switch (status) {
      case 'CONCLUIDO':
        return 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/70 dark:text-emerald-300 dark:border-emerald-800';
      case 'EM_ANDAMENTO':
        return 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/70 dark:text-blue-300 dark:border-blue-800';
      default:
        return 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/70 dark:text-amber-300 dark:border-amber-800';
    }
  };

  return (
    <div className="space-y-6">
      {/* Barra de Métricas dos Planos de Ação */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
          <span className="text-slate-400 text-xs font-bold uppercase tracking-wider">
            Total Direcionados
          </span>
          <p className="mt-1 font-display text-2xl font-bold text-slate-900 dark:text-slate-100">
            {metricasPlanos.total}
          </p>
          <span className="text-[11px] text-slate-400">demandas cadastradas</span>
        </div>

        <div className="rounded-2xl border border-amber-200/80 bg-amber-50/40 p-4 shadow-2xs dark:border-amber-900/40 dark:bg-amber-950/20">
          <span className="text-amber-700 dark:text-amber-400 text-xs font-bold uppercase tracking-wider">
            Pendentes
          </span>
          <p className="mt-1 font-display text-2xl font-bold text-amber-600 dark:text-amber-400">
            {metricasPlanos.pendentes}
          </p>
          <span className="text-[11px] text-amber-700/80 dark:text-amber-400/80 font-semibold">
            aguardando início
          </span>
        </div>

        <div className="rounded-2xl border border-blue-200/80 bg-blue-50/40 p-4 shadow-2xs dark:border-blue-900/40 dark:bg-blue-950/20">
          <span className="text-blue-700 dark:text-blue-400 text-xs font-bold uppercase tracking-wider">
            Em Andamento
          </span>
          <p className="mt-1 font-display text-2xl font-bold text-blue-600 dark:text-blue-400">
            {metricasPlanos.emAndamento}
          </p>
          <span className="text-[11px] text-blue-700/80 dark:text-blue-400/80 font-semibold">
            em execução pela área
          </span>
        </div>

        <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/40 p-4 shadow-2xs dark:border-emerald-900/40 dark:bg-emerald-950/20">
          <span className="text-emerald-700 dark:text-emerald-400 text-xs font-bold uppercase tracking-wider">
            Concluídos
          </span>
          <p className="mt-1 font-display text-2xl font-bold text-emerald-600 dark:text-emerald-400">
            {metricasPlanos.concluidos}
          </p>
          <span className="text-[11px] text-emerald-700/80 dark:text-emerald-400/80 font-semibold">
            {metricasPlanos.taxaConclusao}% de conclusão
          </span>
        </div>

        <div className="rounded-2xl border border-indigo-200/80 bg-indigo-50/40 p-4 shadow-2xs dark:border-indigo-900/40 dark:bg-indigo-950/20">
          <span className="text-indigo-700 dark:text-indigo-400 text-xs font-bold uppercase tracking-wider flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" /> Média em Aberto
          </span>
          <p className="mt-1 font-display text-2xl font-bold text-indigo-600 dark:text-indigo-400">
            {metricasPlanos.mediaDiasAbertos} <span className="text-xs font-normal">dias</span>
          </p>
          <span className="text-[11px] text-indigo-700/80 dark:text-indigo-400/80 font-semibold">
            nas ações ativas
          </span>
        </div>

        <div className="col-span-2 sm:col-span-3 lg:col-span-1 rounded-2xl border border-rose-200/80 bg-rose-50/40 p-4 shadow-2xs dark:border-rose-900/40 dark:bg-rose-950/20 flex flex-col justify-center">
          <span className="text-rose-700 dark:text-rose-400 text-xs font-bold uppercase tracking-wider flex items-center gap-1">
            <AlertTriangle className="h-3.5 w-3.5" /> Prazos Atrasados
          </span>
          <p className="mt-1 font-display text-2xl font-bold text-rose-600 dark:text-rose-400">
            {metricasPlanos.atrasados}
          </p>
          <span className="text-[11px] text-rose-700/80 dark:text-rose-400/80 font-semibold">
            exigem atenção da gestão
          </span>
        </div>
      </div>

      {/* Barra de Filtros e Busca */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-slate-200/80 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-1 flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          {/* Busca Livre */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por RID, área, demanda, responsável @ ou conclusão..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
            />
          </div>

          {/* Filtro por Área Destino */}
          <select
            value={filtroArea}
            onChange={(e) => setFiltroArea(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
          >
            <option value="TODAS">Todas as Áreas ({areasDisponiveis.length})</option>
            {areasDisponiveis.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>

          {/* Filtro por Status do Plano */}
          <select
            value={filtroStatus}
            onChange={(e) => setFiltroStatus(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
          >
            <option value="TODOS">Todos os Status</option>
            <option value="PENDENTE">Pendente</option>
            <option value="EM_ANDAMENTO">Em Andamento</option>
            <option value="CONCLUIDO">Concluído</option>
          </select>

          {/* Filtro por Responsável @ */}
          {responsaveisDisponiveis.length > 0 && (
            <select
              value={filtroResponsavel}
              onChange={(e) => setFiltroResponsavel(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
            >
              <option value="TODOS">Todos os Responsáveis @</option>
              {responsaveisDisponiveis.map((r) => (
                <option key={r} value={r}>
                  @{r}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Botões de Ação */}
        <div className="flex items-center gap-2">
          {(busca || filtroArea !== 'TODAS' || filtroStatus !== 'TODOS' || filtroResponsavel !== 'TODOS') && (
            <button
              type="button"
              onClick={() => {
                setBusca('');
                setFiltroArea('TODAS');
                setFiltroStatus('TODOS');
                setFiltroResponsavel('TODOS');
              }}
              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Limpar
            </button>
          )}

          <button
            type="button"
            onClick={exportarCsvPlanos}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 transition-colors shadow-2xs cursor-pointer"
            title="Exportar planos para planilha CSV"
          >
            <Download className="h-4 w-4 text-slate-500" /> Exportar CSV
          </button>
        </div>
      </div>

      {/* Conteúdo: Lista / Cards dos Planos de Ação */}
      {desviosComPlano.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center dark:border-slate-800 dark:bg-slate-900 shadow-sm space-y-3">
          <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400">
            <Target className="h-8 w-8" />
          </div>
          <h3 className="font-display text-lg font-bold text-slate-900 dark:text-slate-100">
            Nenhum Plano de Ação cadastrado até o momento
          </h3>
          <p className="max-w-md text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            Ao abrir qualquer desvio na aba <strong>Histórico</strong>, você pode preencher o
            <strong> Plano de Ação de Fechamento</strong>, direcionar para uma área e marcar responsáveis
            com @ para acompanhar aqui.
          </p>
          <button
            type="button"
            onClick={onIrParaHistorico}
            className="mt-2 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-500 transition-colors shadow-xs cursor-pointer"
          >
            Ir para Histórico de RIDs <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      ) : desviosFiltrados.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-900">
          <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
            Nenhum plano de ação corresponde aos filtros selecionados.
          </p>
          <button
            type="button"
            onClick={() => {
              setBusca('');
              setFiltroArea('TODAS');
              setFiltroStatus('TODOS');
              setFiltroResponsavel('TODOS');
            }}
            className="mt-2 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
          >
            Limpar filtros de busca
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="text-xs text-slate-400 font-medium">
            Exibindo {desviosFiltrados.length} de {desviosComPlano.length} planos de ação
          </div>

          <div className="grid grid-cols-1 gap-4">
            {desviosFiltrados.map((desvio) => {
              const plano = desvio.plano_acao!;
              const hoje = new Date().toISOString().slice(0, 10);
              const estaAtrasado =
                plano.status !== 'CONCLUIDO' && Boolean(plano.prazo && plano.prazo < hoje);
              const infoDias = calcularDiasEmAberto(
                desvio.data || desvio.data_registro || desvio.created_at,
                plano.concluido_em
              );

              return (
                <div
                  key={desvio.id}
                  className="group relative rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs hover:shadow-md hover:border-indigo-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-indigo-800 transition-all duration-200 space-y-4"
                >
                  {/* Cabeçalho do Card */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                        {desvio.numero_registro}
                      </span>

                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold border ${getStatusBadge(
                          plano.status
                        )}`}
                      >
                        {plano.status === 'CONCLUIDO' ? (
                          <CheckCircle2 className="h-3 w-3" />
                        ) : plano.status === 'EM_ANDAMENTO' ? (
                          <Clock className="h-3 w-3" />
                        ) : (
                          <AlertTriangle className="h-3 w-3" />
                        )}
                        Plano {plano.status}
                      </span>

                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold border shadow-2xs ${
                          infoDias.concluido
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
                            : infoDias.alerta
                            ? 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800'
                            : 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800'
                        }`}
                        title="Tempo decorrido desde o registro do RID"
                      >
                        <Clock className="h-3 w-3" />
                        {infoDias.texto}
                      </span>

                      {estaAtrasado && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700 border border-rose-200 dark:bg-rose-950/60 dark:text-rose-300">
                          <AlertTriangle className="h-2.5 w-2.5" /> Prazo Vencido
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => onAbrirDesvio(desvio)}
                      className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 transition-colors cursor-pointer self-start sm:self-auto"
                    >
                      Abrir Ficha RID <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {/* Detalhes: Área Destino e Demanda */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    {/* Bloco 1: Metadados do Direcionamento */}
                    <div className="space-y-2.5 rounded-xl bg-slate-50/70 p-3.5 dark:bg-slate-950/40 border border-slate-100 dark:border-slate-800">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                          Área de Destino
                        </span>
                        <div className="mt-0.5 flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-100">
                          <Building2 className="h-3.5 w-3.5 text-indigo-500" />
                          <span className="rounded bg-indigo-50 px-2 py-0.5 text-indigo-700 border border-indigo-100 dark:bg-indigo-950 dark:text-indigo-300 dark:border-indigo-900">
                            {plano.area_destino}
                          </span>
                        </div>
                      </div>

                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                          Contagem em Aberto
                        </span>
                        <p
                          className={`mt-0.5 text-xs font-semibold flex items-center gap-1 ${
                            infoDias.alerta && !infoDias.concluido
                              ? 'text-rose-600 dark:text-rose-400 font-bold'
                              : 'text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          <Clock className="h-3.5 w-3.5 text-indigo-500" />
                          {infoDias.texto}
                        </p>
                      </div>

                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                          Prazo Estabelecido
                        </span>
                        <p className="mt-0.5 text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5 text-slate-400" />
                          {plano.prazo
                            ? new Date(plano.prazo + 'T12:00:00Z').toLocaleDateString('pt-BR')
                            : 'Não estipulado'}
                        </p>
                      </div>

                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                          Colaboradores Marcados (@)
                        </span>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {!plano.responsaveis_mencionados ||
                          plano.responsaveis_mencionados.length === 0 ? (
                            <span className="text-[11px] text-slate-400 italic">
                              Nenhum @ marcado
                            </span>
                          ) : (
                            plano.responsaveis_mencionados.map((resp) => (
                              <span
                                key={resp}
                                className="inline-flex items-center gap-1 rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700 border border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800"
                              >
                                @{resp}
                              </span>
                            ))
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Bloco 2: A Demanda / O que foi direcionado */}
                    <div className="lg:col-span-2 space-y-3">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                          Demanda / Ação de Fechamento Solicitada
                        </span>
                        <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs leading-relaxed text-slate-800 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 font-medium whitespace-pre-wrap">
                          {plano.descricao_demanda}
                        </div>
                      </div>

                      {/* Bloco 3: Conclusão do Plano (se houver ou se concluído) */}
                      {plano.conclusao ? (
                        <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-3 dark:border-emerald-900/50 dark:bg-emerald-950/20 space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold text-emerald-900 dark:text-emerald-200 flex items-center gap-1">
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                              Conclusão do Plano de Ação
                            </span>
                            {plano.concluido_em && (
                              <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-semibold">
                                {new Date(plano.concluido_em).toLocaleDateString('pt-BR')}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed font-medium whitespace-pre-wrap">
                            {plano.conclusao}
                          </p>
                          {plano.concluido_por_nome && (
                            <span className="block text-[10px] text-slate-400 pt-1">
                              Registrado por: <strong>{plano.concluido_por_nome}</strong>
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center justify-between rounded-xl bg-slate-50 p-2.5 dark:bg-slate-950/30 border border-slate-100 dark:border-slate-800 text-xs text-slate-500">
                          <span className="italic">Aguardando registro de conclusão pela área.</span>
                          <button
                            type="button"
                            onClick={() => onAbrirDesvio(desvio)}
                            className="text-xs font-bold text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 cursor-pointer"
                          >
                            Registrar Conclusão
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
