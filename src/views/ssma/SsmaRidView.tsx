/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Subpágina de Formulário SSMA: RID — Registro de Identificação de Desvio (FRM.SSMA-0001)
 * Inclui: Novo Registro, Histórico de Desvios, Indicadores, Exportação CSV e Editor de Formulário (Admin).
 */

import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  PlusCircle,
  List,
  Search,
  CheckCircle2,
  XCircle,
  Building2,
  MapPin,
  ArrowLeft,
  Camera,
  ChevronRight,
  TrendingUp,
  FileSpreadsheet,
  SlidersHorizontal,
} from 'lucide-react';
import type {
  Profile,
  SsmaRidDesvio,
  SsmaRidFiltros,
  SsmaRidMetricas,
  SsmaRidStatus,
  SsmaFormConfig,
} from '../../types';
import {
  listarDesviosRid,
  obterMetricasRid,
  excluirDesvioRid,
  restaurarDesvioRid,
  listarSetoresDb,
  SETORES_SSMA,
  obterConfiguracaoFormulario,
  CONFIG_FORM_PADRAO_RID,
} from '../../lib/ssmaApi';
import SsmaRidForm from '../../components/ssma/SsmaRidForm';
import SsmaRidDetalhesModal from '../../components/ssma/SsmaRidDetalhesModal';
import SsmaFormEditorModal from '../../components/ssma/SsmaFormEditorModal';
import { MostrarExcluidosToggle } from '../../components/ui/ExcluidosControls';
import { useToast } from '../../components/ui/Toast';

interface SsmaRidViewProps {
  user: Profile;
  onNavigate: (path: string) => void;
  abaInicial?: 'novo' | 'historico';
}

export default function SsmaRidView({ user, onNavigate, abaInicial = 'novo' }: SsmaRidViewProps) {
  const toast = useToast();
  const [abaAtiva, setAbaAtiva] = useState<'novo' | 'historico'>(abaInicial);

  // Estados de dados
  const [desvios, setDesvios] = useState<SsmaRidDesvio[]>([]);
  const [metricas, setMetricas] = useState<SsmaRidMetricas | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [incluirExcluidos, setIncluirExcluidos] = useState(false);

  // Filtros
  const [setoresDisponiveis, setSetoresDisponiveis] = useState<string[]>([...SETORES_SSMA]);
  const [filtros, setFiltros] = useState<SsmaRidFiltros>({
    termo: '',
    setor: 'TODOS',
    sanado: 'todos',
    status: 'TODOS',
  });

  // Configuração Dinâmica do Formulário (Admin)
  const [configForm, setConfigForm] = useState<SsmaFormConfig>(CONFIG_FORM_PADRAO_RID);
  const [modalEditorAberto, setModalEditorAberto] = useState(false);

  // Carregar configuração do formulário e setores do banco de dados
  useEffect(() => {
    listarSetoresDb()
      .then((lista) => {
        if (lista.length > 0) {
          setSetoresDisponiveis(lista);
        }
      })
      .catch((err) => console.warn('Erro ao listar setores no Hub SSMA:', err));

    obterConfiguracaoFormulario()
      .then((cfg) => setConfigForm(cfg))
      .catch((err) => console.warn('Erro ao carregar configuração do formulário RID:', err));
  }, []);

  // Modal de Detalhes
  const [desvioSelecionado, setDesvioSelecionado] = useState<SsmaRidDesvio | null>(null);

  const ehAdmin = user.roles.includes('admin');

  // Carregar dados da listagem e métricas
  const carregarDados = async () => {
    setCarregando(true);
    try {
      const [lista, mets] = await Promise.all([
        listarDesviosRid(filtros, incluirExcluidos),
        obterMetricasRid(),
      ]);
      setDesvios(lista);
      setMetricas(mets);
    } catch (err: any) {
      console.error('Erro ao carregar dados SSMA:', err);
      toast.error('Não foi possível carregar a lista de desvios.');
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregarDados();
  }, [filtros, incluirExcluidos]);

  // Ações de exclusão e restauração
  const handleExcluir = async (id: string) => {
    try {
      await excluirDesvioRid(id, user.id);
      toast.success('Registro de desvio excluído com sucesso.');
      carregarDados();
    } catch (err: any) {
      toast.error(`Erro ao excluir: ${err.message}`);
    }
  };

  const handleRestaurar = async (id: string) => {
    try {
      await restaurarDesvioRid(id);
      toast.success('Registro de desvio restaurado com sucesso.');
      carregarDados();
    } catch (err: any) {
      toast.error(`Erro ao restaurar: ${err.message}`);
    }
  };

  const handleStatusChange = (id: string, novoStatus: SsmaRidStatus) => {
    setDesvios((prev) =>
      prev.map((d) => (d.id === id ? { ...d, status: novoStatus } : d))
    );
    obterMetricasRid().then(setMetricas).catch(() => {});
  };

  // Exportar para CSV
  const exportarCsv = () => {
    if (desvios.length === 0) {
      toast.info('Não há registros para exportar.');
      return;
    }

    const colunas = [
      'Número RID',
      'Data',
      'Semana',
      'Informante',
      'Matrícula',
      'Setor',
      'Empresa',
      'Área / Local',
      'Descrição',
      'Sanado Imediato',
      'Ação Realizada / Proposta',
      'Comunicado Líder',
      'Comunicado Segurança',
      'Responsável Segurança',
      'Status',
    ];

    const linhas = desvios.map((d) => [
      `"${d.numero_registro}"`,
      `"${d.data_registro}"`,
      `"${d.semana}"`,
      `"${d.nome_informante.replace(/"/g, '""')}"`,
      `"${d.matricula_informante || ''}"`,
      `"${d.setor}"`,
      `"${d.empresa}"`,
      `"${(d.area_desvio_outro ? `${d.area_desvio} - ${d.area_desvio_outro}` : d.area_desvio).replace(/"/g, '""')}"`,
      `"${d.descricao_desvio.replace(/"/g, '""')}"`,
      `"${d.sanado_imediato ? 'SIM' : 'NÃO'}"`,
      `"${((d.sanado_imediato ? d.acao_imediata : d.acao_proposta) || '').replace(/"/g, '""')}"`,
      `"${d.comunicado_responsavel_area ? 'SIM' : 'NÃO'}"`,
      `"${d.comunicado_seguranca ? 'SIM' : 'NÃO'}"`,
      `"${d.responsavel_seguranca_informado || 'N/A'}"`,
      `"${d.status}"`,
    ]);

    const csvContent = '\uFEFF' + [colunas.join(';'), ...linhas.map((l) => l.join(';'))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `SISTEN_SSMA_RIDs_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success('Planilha de RIDs exportada com sucesso!');
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-16">
      {/* Topo / Barra de Retorno e Identidade */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-5 dark:border-slate-800">
        <div>
          <button
            type="button"
            onClick={() => onNavigate('/formularios/ssma')}
            className="group mb-2 inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
          >
            <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
            Voltar para Módulo SSMA
          </button>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400">
              <ShieldAlert className="h-3.5 w-3.5" />
              FRM.SSMA-0001
            </span>
            <span className="text-xs text-slate-400">• Prevenção & Segurança do Trabalho</span>
          </div>
          <h1 className="mt-1 font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
            Registro de Identificação de Desvio (RID)
          </h1>
        </div>

        {/* Controles do Cabeçalho: Botão Admin + Alternador de Abas */}
        <div className="flex flex-wrap items-center gap-2.5 self-start sm:self-center">
          {ehAdmin && (
            <button
              type="button"
              onClick={() => setModalEditorAberto(true)}
              className="inline-flex items-center gap-2 rounded-2xl border border-indigo-200 bg-indigo-50/90 px-3.5 py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-100 dark:border-indigo-900/60 dark:bg-indigo-950/50 dark:text-indigo-300 transition-colors shadow-2xs"
              title="Personalizar perguntas e opções de resposta do formulário"
            >
              <SlidersHorizontal className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              Editar Formulário
            </button>
          )}

          {/* Alternador de Abas */}
          <div className="flex rounded-2xl bg-slate-100 p-1.5 dark:bg-slate-800/80 shadow-inner">
            <button
              type="button"
              onClick={() => setAbaAtiva('novo')}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all ${
                abaAtiva === 'novo'
                  ? 'bg-white text-emerald-700 shadow-sm dark:bg-slate-900 dark:text-emerald-400'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              <PlusCircle className="h-4 w-4" />
              Novo Registro (RID)
            </button>

            <button
              type="button"
              onClick={() => setAbaAtiva('historico')}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all ${
                abaAtiva === 'historico'
                  ? 'bg-white text-blue-700 shadow-sm dark:bg-slate-900 dark:text-blue-400'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              <List className="h-4 w-4" />
              Histórico ({metricas?.total || 0})
            </button>
          </div>
        </div>
      </div>

      {/* Cards de Métricas Operacionais do RID */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
          <span className="text-slate-400 text-xs font-bold uppercase tracking-wider">Total de RIDs</span>
          <p className="mt-1 font-display text-2xl font-bold text-slate-900 dark:text-slate-100">
            {metricas?.total || 0}
          </p>
          <span className="text-[11px] text-slate-400">registrados</span>
        </div>

        <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/40 p-4 shadow-2xs dark:border-emerald-900/40 dark:bg-emerald-950/20">
          <span className="text-emerald-700 dark:text-emerald-400 text-xs font-bold uppercase tracking-wider">
            Sanados de Imediato
          </span>
          <p className="mt-1 font-display text-2xl font-bold text-emerald-600 dark:text-emerald-400">
            {metricas?.sanadosImediato || 0}
          </p>
          <span className="text-[11px] text-emerald-600/80 dark:text-emerald-400/80 font-semibold">
            {metricas?.taxaResolucaoImediata || 0}% de resolução imediata
          </span>
        </div>

        <div className="rounded-2xl border border-rose-200/80 bg-rose-50/40 p-4 shadow-2xs dark:border-rose-900/40 dark:bg-rose-950/20">
          <span className="text-rose-700 dark:text-rose-400 text-xs font-bold uppercase tracking-wider">
            Pendentes de Tratamento
          </span>
          <p className="mt-1 font-display text-2xl font-bold text-rose-600 dark:text-rose-400">
            {metricas?.pendentesTratamento || 0}
          </p>
          <span className="text-[11px] text-rose-600/80 dark:text-rose-400/80 font-semibold">
            requer ação de SSMA/Área
          </span>
        </div>

        <div className="rounded-2xl border border-blue-200/80 bg-blue-50/40 p-4 shadow-2xs dark:border-blue-900/40 dark:bg-blue-950/20">
          <span className="text-blue-700 dark:text-blue-400 text-xs font-bold uppercase tracking-wider">
            Nesta Semana
          </span>
          <p className="mt-1 font-display text-2xl font-bold text-blue-600 dark:text-blue-400">
            {metricas?.totalEstaSemana || 0}
          </p>
          <span className="text-[11px] text-blue-600/80 dark:text-blue-400/80 font-semibold">
            registros recentes
          </span>
        </div>

        <div className="col-span-2 sm:col-span-4 lg:col-span-1 flex flex-col justify-center rounded-2xl border border-slate-200/80 bg-gradient-to-br from-slate-900 to-slate-800 p-4 text-white shadow-sm dark:border-slate-800">
          <span className="text-xs font-bold text-emerald-400 flex items-center gap-1">
            <TrendingUp className="h-3.5 w-3.5" /> Segurança Ativa
          </span>
          <p className="text-xs text-slate-300 mt-1 leading-snug">
            Toda observação conta para um ambiente seguro.
          </p>
        </div>
      </div>

      {/* Conteúdo da Aba 1: Formulário Novo RID */}
      {abaAtiva === 'novo' && (
        <div>
          <SsmaRidForm
            user={user}
            config={configForm}
            onAbrirEditor={() => setModalEditorAberto(true)}
            onSuccess={() => {
              carregarDados();
              setAbaAtiva('historico');
            }}
          />
        </div>
      )}

      {/* Conteúdo da Aba 2: Histórico de RIDs */}
      {abaAtiva === 'historico' && (
        <div className="space-y-4">
          {/* Barra de Filtros */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-slate-200/80 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-1 flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
              {/* Campo de Busca Livre */}
              <div className="relative flex-1 min-w-[200px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar por código, informante, área ou descrição..."
                  value={filtros.termo || ''}
                  onChange={(e) => setFiltros((prev) => ({ ...prev, termo: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                />
              </div>

              {/* Filtro Setor */}
              <select
                value={filtros.setor || 'TODOS'}
                onChange={(e) => setFiltros((prev) => ({ ...prev, setor: e.target.value }))}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
              >
                <option value="TODOS">Todos os Setores</option>
                {setoresDisponiveis.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>

              {/* Filtro Sanado */}
              <select
                value={filtros.sanado || 'todos'}
                onChange={(e) =>
                  setFiltros((prev) => ({ ...prev, sanado: e.target.value as any }))
                }
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
              >
                <option value="todos">Todos (Sanados / Pendentes)</option>
                <option value="sim">Apenas Sanados Imediato</option>
                <option value="nao">Apenas Não Sanados</option>
              </select>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-auto">
              <MostrarExcluidosToggle
                visivel={ehAdmin}
                checked={incluirExcluidos}
                onChange={setIncluirExcluidos}
              />

              <button
                type="button"
                onClick={exportarCsv}
                className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-100 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300 transition-colors"
              >
                <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                Exportar CSV
              </button>
            </div>
          </div>

          {/* Listagem em Cards Responsivos */}
          {carregando ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-xs font-semibold text-slate-500 dark:border-slate-800 dark:bg-slate-900">
              Carregando registros de desvios...
            </div>
          ) : desvios.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-12 text-center dark:border-slate-800 dark:bg-slate-900">
              <ShieldAlert className="mx-auto h-12 w-12 text-slate-300 dark:text-slate-600 mb-3" />
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">
                Nenhum registro de desvio encontrado
              </h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                Não foram localizados desvios com os filtros aplicados. Registre um novo RID para iniciar o monitoramento.
              </p>
              <button
                type="button"
                onClick={() => setAbaAtiva('novo')}
                className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-emerald-500"
              >
                <PlusCircle className="h-4 w-4" />
                Criar Novo RID
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {desvios.map((desvio) => {
                const ehSanado = desvio.sanado_imediato;
                return (
                  <div
                    key={desvio.id}
                    onClick={() => setDesvioSelecionado(desvio)}
                    className="group relative flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-white p-4.5 shadow-2xs hover:border-emerald-500/40 hover:shadow-md transition-all cursor-pointer dark:border-slate-800 dark:bg-slate-900"
                  >
                    <div>
                      {/* Topo do Card: Código & Status */}
                      <div className="flex items-center justify-between gap-2 mb-2.5">
                        <span className="font-mono text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md dark:bg-emerald-950/60 dark:text-emerald-300">
                          {desvio.numero_registro}
                        </span>
                        <div className="flex items-center gap-1.5">
                          {desvio.criado_por === user.id && (
                            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
                              Meu Registro
                            </span>
                          )}
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              ehSanado
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                            }`}
                          >
                            {ehSanado ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                            {ehSanado ? 'Sanado' : 'Pendente'}
                          </span>
                          {desvio.excluido_em && (
                            <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                              Excluído
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Descrição do Desvio */}
                      <p className="text-xs font-bold text-slate-900 dark:text-slate-100 line-clamp-2 leading-snug">
                        {desvio.descricao_desvio}
                      </p>

                      {/* Informações de Local e Setor */}
                      <div className="mt-3 space-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                        <div className="flex items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                          <span className="font-semibold text-slate-700 dark:text-slate-300 truncate">
                            {desvio.area_desvio}
                            {desvio.area_desvio_outro && ` (${desvio.area_desvio_outro})`}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Building2 className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                          <span>
                            Setor: <strong className="text-slate-700 dark:text-slate-300">{desvio.setor}</strong> · {desvio.empresa}
                          </span>
                        </div>
                      </div>

                      {/* Chips de Classificação */}
                      <div className="mt-2.5 flex flex-wrap gap-1">
                        {desvio.comportamentos_inseguros?.slice(0, 2).map((c) => (
                          <span
                            key={c}
                            className="rounded-md bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700 dark:bg-rose-950/40 dark:text-rose-400"
                          >
                            {c}
                          </span>
                        ))}
                        {desvio.condicoes_inseguras?.slice(0, 2).map((c) => (
                          <span
                            key={c}
                            className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                          >
                            {c}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Rodapé do Card */}
                    <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-[11px] text-slate-400 dark:border-slate-800">
                      <span>
                        {desvio.data_registro
                          ? new Date(desvio.data_registro + 'T12:00:00Z').toLocaleDateString('pt-BR')
                          : ''}{' '}
                        • {desvio.semana}
                      </span>

                      <div className="flex items-center gap-2">
                        {desvio.fotos && desvio.fotos.length > 0 && (
                          <span className="flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                            <Camera className="h-3 w-3" />
                            {desvio.fotos.length}
                          </span>
                        )}
                        <ChevronRight className="h-4 w-4 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Modal de Detalhes do RID Selecionado */}
      {desvioSelecionado && (
        <SsmaRidDetalhesModal
          desvio={desvioSelecionado}
          user={user}
          onClose={() => setDesvioSelecionado(null)}
          onDelete={(id) => {
            handleExcluir(id);
            setDesvioSelecionado(null);
          }}
          onRestore={(id) => {
            handleRestaurar(id);
            setDesvioSelecionado(null);
          }}
          onStatusChange={handleStatusChange}
        />
      )}

      {/* Modal de Edição de Configuração do Formulário (Admin) */}
      {modalEditorAberto && ehAdmin && (
        <SsmaFormEditorModal
          configAtual={configForm}
          user={user}
          onClose={() => setModalEditorAberto(false)}
          onSaved={(novaConfig) => {
            setConfigForm(novaConfig);
          }}
        />
      )}
    </div>
  );
}
