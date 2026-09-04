/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Facilities → Cadastro de Rotas.
 *
 * Lê a base `rh_rotas` (colaborador, ponto de embarque, horário, contato e
 * rota do transporte fretado) via `rhApi`. Permite criar, editar, ativar /
 * inativar (individualmente ou em massa) e excluir registros. Filtros de
 * busca textual + seleção múltipla por rota e por ponto de embarque. A tabela
 * vira cartões empilhados no mobile.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, BusFront, Search, Plus, Edit2, Trash2, CheckCircle2, XCircle,
  RefreshCw, MapPin, Clock, Phone, Filter, Loader2, Users,
} from 'lucide-react';
import type { Profile, RhRota } from '../../types';
import { listarRhRotas, criarRhRota, atualizarRhRota, excluirRhRota } from '../../lib/rhApi';
import { useToast } from '../../components/ui/Toast';
import Modal, { ModalBody, ModalFooter } from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import MultiSelectFilter from '../../components/ui/MultiSelectFilter';
import Pagination from '../../components/ui/Pagination';

interface Props {
  user: Profile;
  onNavigate: (path: string) => void;
  /**
   * Para onde o botão "voltar" leva. A mesma tela é servida em dois módulos —
   * Facilities (transporte fretado) e RH (cadastro de rotas do colaborador) —,
   * e o usuário precisa voltar para o hub de onde entrou.
   */
  voltarPara?: { path: string; label: string };
}

type FiltroStatus = 'TODOS' | 'ATIVOS' | 'INATIVOS';

const POR_PAGINA = 20;

interface FormState {
  funcionario: string;
  ponto_embarque: string;
  horario: string;
  contato: string;
  rota: string;
  ativo: boolean;
}

const FORM_VAZIO: FormState = {
  funcionario: '', ponto_embarque: '', horario: '', contato: '', rota: '', ativo: true,
};

export default function FacilitiesRotas({
  onNavigate,
  voltarPara = { path: '/facilities', label: 'Facilities' },
}: Props) {
  const toast = useToast();

  const [rotas, setRotas] = useState<RhRota[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [busca, setBusca] = useState('');
  const [filtroRota, setFiltroRota] = useState<Set<string>>(new Set());
  const [filtroPonto, setFiltroPonto] = useState<Set<string>>(new Set());
  const [filtroStatus, setFiltroStatus] = useState<FiltroStatus>('TODOS');
  const [pagina, setPagina] = useState(0);

  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [aplicandoLote, setAplicandoLote] = useState(false);

  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<RhRota | null>(null);
  const [form, setForm] = useState<FormState>(FORM_VAZIO);
  const [salvando, setSalvando] = useState(false);

  const [paraExcluir, setParaExcluir] = useState<RhRota | null>(null);
  const [excluindo, setExcluindo] = useState(false);

  const carregar = async () => {
    setCarregando(true);
    setErro(null);
    try {
      setRotas(await listarRhRotas());
    } catch (e: any) {
      setErro(e?.message || 'Falha ao carregar as rotas.');
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => { carregar(); }, []);

  // Qualquer mudança de filtro volta para a primeira página.
  useEffect(() => { setPagina(0); }, [busca, filtroRota, filtroPonto, filtroStatus]);

  const opcoesRota = useMemo(
    () => Array.from(new Set(rotas.map(r => r.rota).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [rotas],
  );
  const opcoesPonto = useMemo(
    () => Array.from(new Set(rotas.map(r => r.ponto_embarque).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [rotas],
  );

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return rotas.filter(r => {
      const casaBusca = !termo
        || r.funcionario.toLowerCase().includes(termo)
        || r.ponto_embarque.toLowerCase().includes(termo)
        || r.rota.toLowerCase().includes(termo)
        || r.horario.toLowerCase().includes(termo)
        || (r.contato || '').toLowerCase().includes(termo);
      const casaRota = filtroRota.size === 0 || filtroRota.has(r.rota);
      const casaPonto = filtroPonto.size === 0 || filtroPonto.has(r.ponto_embarque);
      const casaStatus = filtroStatus === 'TODOS'
        || (filtroStatus === 'ATIVOS' && r.ativo)
        || (filtroStatus === 'INATIVOS' && !r.ativo);
      return casaBusca && casaRota && casaPonto && casaStatus;
    });
  }, [rotas, busca, filtroRota, filtroPonto, filtroStatus]);

  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / POR_PAGINA));
  const paginaAtual = Math.min(pagina, totalPaginas - 1);
  const visiveis = filtradas.slice(paginaAtual * POR_PAGINA, paginaAtual * POR_PAGINA + POR_PAGINA);

  const stats = useMemo(() => ({
    total: rotas.length,
    ativos: rotas.filter(r => r.ativo).length,
    inativos: rotas.filter(r => !r.ativo).length,
    rotas: new Set(rotas.map(r => r.rota).filter(Boolean)).size,
  }), [rotas]);

  const idsFiltrados = useMemo(() => filtradas.map(r => r.id), [filtradas]);
  const selecaoNaPagina = visiveis.filter(r => selecionados.has(r.id)).length;
  const todosFiltradosSelecionados = idsFiltrados.length > 0 && idsFiltrados.every(id => selecionados.has(id));

  const alternarSelecao = (id: string) => {
    setSelecionados(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const alternarSelecionarTodos = () => {
    setSelecionados(prev => {
      if (todosFiltradosSelecionados) {
        const next = new Set(prev);
        idsFiltrados.forEach(id => next.delete(id));
        return next;
      }
      return new Set([...prev, ...idsFiltrados]);
    });
  };

  const limparSelecao = () => setSelecionados(new Set());

  // -------------------------------------------------------------------------

  const alternarAtivo = async (r: RhRota) => {
    const novo = !r.ativo;
    setRotas(prev => prev.map(x => (x.id === r.id ? { ...x, ativo: novo } : x)));
    try {
      await atualizarRhRota(r.id, { ativo: novo });
      toast.success(`${r.funcionario} ${novo ? 'ativado' : 'inativado'}.`);
    } catch (e: any) {
      setRotas(prev => prev.map(x => (x.id === r.id ? { ...x, ativo: r.ativo } : x)));
      toast.error('Não foi possível alterar o status: ' + (e?.message || ''));
    }
  };

  const aplicarLote = async (novo: boolean) => {
    const alvos = rotas.filter(r => selecionados.has(r.id) && r.ativo !== novo);
    if (alvos.length === 0) {
      toast.info(`Nenhum colaborador selecionado para ${novo ? 'ativar' : 'inativar'}.`);
      return;
    }
    setAplicandoLote(true);
    try {
      await Promise.all(alvos.map(r => atualizarRhRota(r.id, { ativo: novo })));
      const ids = new Set(alvos.map(r => r.id));
      setRotas(prev => prev.map(x => (ids.has(x.id) ? { ...x, ativo: novo } : x)));
      toast.success(`${alvos.length} colaborador(es) ${novo ? 'ativado(s)' : 'inativado(s)'}.`);
      limparSelecao();
    } catch (e: any) {
      toast.error('Falha ao aplicar em massa: ' + (e?.message || ''));
      carregar();
    } finally {
      setAplicandoLote(false);
    }
  };

  const abrirNovo = () => {
    setEditando(null);
    setForm(FORM_VAZIO);
    setModalAberto(true);
  };

  const abrirEditar = (r: RhRota) => {
    setEditando(r);
    setForm({
      funcionario: r.funcionario,
      ponto_embarque: r.ponto_embarque,
      horario: r.horario,
      contato: r.contato || '',
      rota: r.rota,
      ativo: r.ativo,
    });
    setModalAberto(true);
  };

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    const f = {
      funcionario: form.funcionario.trim(),
      ponto_embarque: form.ponto_embarque.trim(),
      horario: form.horario.trim(),
      contato: form.contato.trim(),
      rota: form.rota.trim(),
    };
    if (!f.funcionario || !f.ponto_embarque || !f.horario || !f.rota) {
      toast.error('Preencha colaborador, ponto de embarque, horário e rota.');
      return;
    }
    setSalvando(true);
    try {
      if (editando) {
        await atualizarRhRota(editando.id, { ...f, contato: f.contato || null, ativo: form.ativo });
        setRotas(prev => prev.map(x => (x.id === editando.id
          ? { ...x, ...f, contato: f.contato || null, ativo: form.ativo }
          : x)));
        toast.success(`Rota de ${f.funcionario} atualizada.`);
      } else {
        const criada = await criarRhRota({ ...f, contato: f.contato || null });
        setRotas(prev => [...prev, criada]);
        toast.success(`${f.funcionario} cadastrado na rota ${f.rota}.`);
      }
      setModalAberto(false);
    } catch (err: any) {
      toast.error('Não foi possível salvar: ' + (err?.message || ''));
    } finally {
      setSalvando(false);
    }
  };

  const confirmarExclusao = async () => {
    if (!paraExcluir) return;
    setExcluindo(true);
    try {
      await excluirRhRota(paraExcluir.id);
      setRotas(prev => prev.filter(x => x.id !== paraExcluir.id));
      setSelecionados(prev => { const n = new Set(prev); n.delete(paraExcluir.id); return n; });
      toast.success(`${paraExcluir.funcionario} removido do cadastro.`);
      setParaExcluir(null);
    } catch (e: any) {
      toast.error('Falha ao excluir: ' + (e?.message || ''));
    } finally {
      setExcluindo(false);
    }
  };

  const temFiltro = busca.trim() !== '' || filtroRota.size > 0 || filtroPonto.size > 0 || filtroStatus !== 'TODOS';
  const limparFiltros = () => {
    setBusca('');
    setFiltroRota(new Set());
    setFiltroPonto(new Set());
    setFiltroStatus('TODOS');
  };

  // -------------------------------------------------------------------------

  const StatusPill = ({ r }: { r: RhRota }) => (
    <button
      type="button"
      onClick={() => alternarAtivo(r)}
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold transition-colors ${
        r.ativo
          ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300'
          : 'bg-slate-200 text-slate-600 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-400'
      }`}
      title="Clique para ativar / inativar"
    >
      {r.ativo ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
      {r.ativo ? 'Ativo' : 'Inativo'}
    </button>
  );

  const AcoesLinha = ({ r }: { r: RhRota }) => (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => abrirEditar(r)}
        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-blue-600 dark:hover:bg-slate-800 dark:hover:text-blue-400"
        title="Editar"
      >
        <Edit2 className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => setParaExcluir(r)}
        className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30 dark:hover:text-rose-400"
        title="Excluir"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Cabeçalho */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={() => onNavigate(voltarPara.path)}
            className="mt-0.5 shrink-0 rounded-xl border border-slate-200 bg-white p-2 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800"
            aria-label={`Voltar para ${voltarPara.label}`}
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-teal-600 text-white shadow-sm shadow-teal-500/25">
            <BusFront className="h-6 w-6" />
          </span>
          <div>
            <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-slate-50">Cadastro de Rotas</h1>
            <p className="mt-1 max-w-2xl text-xs font-medium text-slate-500 dark:text-slate-400">
              Colaboradores, pontos de embarque e horários do transporte fretado (base rh_rotas).
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={carregar}
            disabled={carregando}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white p-2.5 text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
            title="Recarregar"
          >
            <RefreshCw className={`h-4 w-4 ${carregando ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            onClick={abrirNovo}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm shadow-blue-500/20 transition-colors hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            Nova Rota
          </button>
        </div>
      </header>

      {/* Indicadores */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { rotulo: 'Colaboradores', valor: stats.total, icon: Users, cor: 'text-blue-500' },
          { rotulo: 'Ativos', valor: stats.ativos, icon: CheckCircle2, cor: 'text-emerald-500' },
          { rotulo: 'Inativos', valor: stats.inativos, icon: XCircle, cor: 'text-slate-400' },
          { rotulo: 'Rotas distintas', valor: stats.rotas, icon: BusFront, cor: 'text-teal-500' },
        ].map(s => {
          const Icon = s.icon;
          return (
            <div key={s.rotulo} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">{s.rotulo}</span>
                <Icon className={`h-4 w-4 ${s.cor}`} />
              </div>
              <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-50">{s.valor}</p>
            </div>
          );
        })}
      </div>

      {/* Filtros */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar por colaborador, ponto, rota, horário ou contato..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-xs text-slate-900 transition-colors focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>
          <MultiSelectFilter
            label="Rota"
            icon={BusFront}
            options={opcoesRota}
            selected={filtroRota}
            onChange={setFiltroRota}
          />
          <MultiSelectFilter
            label="Ponto"
            icon={MapPin}
            options={opcoesPonto}
            selected={filtroPonto}
            onChange={setFiltroPonto}
            panelClassName="w-72"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-0.5 dark:border-slate-700 dark:bg-slate-800">
            {(['TODOS', 'ATIVOS', 'INATIVOS'] as FiltroStatus[]).map(s => (
              <button
                key={s}
                type="button"
                onClick={() => setFiltroStatus(s)}
                className={`rounded-lg px-3 py-1.5 text-[11px] font-bold transition-colors ${
                  filtroStatus === s
                    ? 'bg-white text-blue-600 shadow-sm dark:bg-slate-900 dark:text-blue-400'
                    : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                {s === 'TODOS' ? 'Todos' : s === 'ATIVOS' ? 'Ativos' : 'Inativos'}
              </button>
            ))}
          </div>
          <span className="text-[11px] font-medium text-slate-400">
            {filtradas.length} de {rotas.length} registro(s)
          </span>
          {temFiltro && (
            <button
              type="button"
              onClick={limparFiltros}
              className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 hover:text-blue-600 dark:text-slate-400"
            >
              <Filter className="h-3 w-3" />
              Limpar filtros
            </button>
          )}
        </div>
      </div>

      {/* Barra de ações em massa */}
      {selecionados.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-900/60 dark:bg-blue-950/30">
          <span className="text-xs font-bold text-blue-800 dark:text-blue-300">
            {selecionados.size} selecionado(s)
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => aplicarLote(true)}
              disabled={aplicandoLote}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-bold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
            >
              {aplicandoLote ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              Ativar
            </button>
            <button
              type="button"
              onClick={() => aplicarLote(false)}
              disabled={aplicandoLote}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-600 px-3 py-1.5 text-[11px] font-bold text-white transition-colors hover:bg-slate-700 disabled:opacity-50"
            >
              {aplicandoLote ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
              Inativar
            </button>
            <button
              type="button"
              onClick={limparSelecao}
              className="rounded-lg px-3 py-1.5 text-[11px] font-bold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            >
              Limpar seleção
            </button>
          </div>
        </div>
      )}

      {/* Conteúdo */}
      {erro ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-6 py-10 text-center dark:border-rose-900/60 dark:bg-rose-950/20">
          <XCircle className="mx-auto h-8 w-8 text-rose-400" />
          <p className="mt-2 text-sm font-semibold text-rose-700 dark:text-rose-300">{erro}</p>
          <button
            type="button"
            onClick={carregar}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-700"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Tentar novamente
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Tabela (>= md) */}
          <div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm md:block dark:border-slate-800 dark:bg-slate-900">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50/80 font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
                  <tr>
                    <th className="w-10 px-4 py-3.5">
                      <input
                        type="checkbox"
                        checked={todosFiltradosSelecionados}
                        ref={el => { if (el) el.indeterminate = !todosFiltradosSelecionados && selecaoNaPagina > 0; }}
                        onChange={alternarSelecionarTodos}
                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800"
                        aria-label="Selecionar todos os filtrados"
                      />
                    </th>
                    <th className="px-4 py-3.5">Colaborador</th>
                    <th className="px-4 py-3.5">Rota</th>
                    <th className="px-4 py-3.5">Ponto de embarque</th>
                    <th className="px-4 py-3.5">Horário</th>
                    <th className="px-4 py-3.5">Contato</th>
                    <th className="px-4 py-3.5 text-center">Status</th>
                    <th className="px-4 py-3.5 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {carregando ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-12 text-center text-slate-500">
                        <div className="flex items-center justify-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                          Carregando rotas...
                        </div>
                      </td>
                    </tr>
                  ) : visiveis.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-12 text-center text-slate-500">
                        <BusFront className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600" />
                        <p className="mt-2 font-medium">
                          {temFiltro ? 'Nenhum registro para os filtros aplicados.' : 'Nenhuma rota cadastrada ainda.'}
                        </p>
                        {!temFiltro && (
                          <button
                            type="button"
                            onClick={abrirNovo}
                            className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            Cadastrar primeira rota
                          </button>
                        )}
                      </td>
                    </tr>
                  ) : (
                    visiveis.map(r => (
                      <tr
                        key={r.id}
                        className={`transition-colors hover:bg-slate-50/60 dark:hover:bg-slate-800/40 ${
                          selecionados.has(r.id) ? 'bg-blue-50/50 dark:bg-blue-950/20' : ''
                        }`}
                      >
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={selecionados.has(r.id)}
                            onChange={() => alternarSelecao(r.id)}
                            className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800"
                            aria-label={`Selecionar ${r.funcionario}`}
                          />
                        </td>
                        <td className="px-4 py-3 font-bold text-slate-900 dark:text-slate-100">{r.funcionario}</td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center rounded-md bg-teal-50 px-2 py-0.5 text-[11px] font-bold text-teal-700 dark:bg-teal-950/50 dark:text-teal-300">
                            {r.rota}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{r.ponto_embarque}</td>
                        <td className="px-4 py-3 font-mono text-slate-600 dark:text-slate-300">{r.horario}</td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{r.contato || '—'}</td>
                        <td className="px-4 py-3 text-center"><StatusPill r={r} /></td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end"><AcoesLinha r={r} /></div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {!carregando && filtradas.length > POR_PAGINA && (
              <Pagination
                page={paginaAtual}
                totalPages={totalPaginas}
                onPageChange={setPagina}
                info={`${filtradas.length} registro(s)`}
                className="border-t border-slate-100 dark:border-slate-800"
              />
            )}
          </div>

          {/* Cartões (mobile) */}
          <div className="space-y-3 md:hidden">
            {!carregando && visiveis.length > 0 && (
              <label className="flex items-center gap-2 px-1 text-[11px] font-bold text-slate-500 dark:text-slate-400">
                <input
                  type="checkbox"
                  checked={todosFiltradosSelecionados}
                  onChange={alternarSelecionarTodos}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800"
                />
                Selecionar todos os filtrados
              </label>
            )}

            {carregando ? (
              <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white py-12 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">
                <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                Carregando rotas...
              </div>
            ) : visiveis.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-12 text-center dark:border-slate-800 dark:bg-slate-900">
                <BusFront className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600" />
                <p className="mt-2 text-sm font-medium text-slate-600 dark:text-slate-300">
                  {temFiltro ? 'Nenhum registro para os filtros aplicados.' : 'Nenhuma rota cadastrada ainda.'}
                </p>
              </div>
            ) : (
              visiveis.map(r => (
                <div
                  key={r.id}
                  className={`rounded-2xl border bg-white p-4 dark:bg-slate-900 ${
                    selecionados.has(r.id)
                      ? 'border-blue-300 dark:border-blue-800'
                      : 'border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <label className="flex min-w-0 items-start gap-2.5">
                      <input
                        type="checkbox"
                        checked={selecionados.has(r.id)}
                        onChange={() => alternarSelecao(r.id)}
                        className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800"
                        aria-label={`Selecionar ${r.funcionario}`}
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-bold text-slate-900 dark:text-slate-100">{r.funcionario}</span>
                        <span className="mt-1 inline-flex items-center rounded-md bg-teal-50 px-2 py-0.5 text-[11px] font-bold text-teal-700 dark:bg-teal-950/50 dark:text-teal-300">
                          {r.rota}
                        </span>
                      </span>
                    </label>
                    <StatusPill r={r} />
                  </div>

                  <dl className="mt-3 grid grid-cols-1 gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                    <div className="flex items-center gap-2">
                      <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      <span>{r.ponto_embarque}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      <span className="font-mono">{r.horario}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Phone className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      <span>{r.contato || '—'}</span>
                    </div>
                  </dl>

                  <div className="mt-3 flex justify-end border-t border-slate-100 pt-2 dark:border-slate-800">
                    <AcoesLinha r={r} />
                  </div>
                </div>
              ))
            )}

            {!carregando && filtradas.length > POR_PAGINA && (
              <Pagination
                page={paginaAtual}
                totalPages={totalPaginas}
                onPageChange={setPagina}
                info={`${filtradas.length} registro(s)`}
                className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
              />
            )}
          </div>
        </div>
      )}

      {/* Modal novo / editar */}
      {modalAberto && (
        <Modal
          onClose={() => setModalAberto(false)}
          maxWidth="max-w-lg"
          ariaLabel={editando ? 'Editar rota' : 'Nova rota'}
        >
          <form onSubmit={salvar} className="flex min-h-0 flex-1 flex-col">
            <ModalBody className="space-y-4">
              <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3 dark:border-slate-800">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-100 text-teal-700 dark:bg-teal-950/60 dark:text-teal-400">
                  <BusFront className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-50">
                    {editando ? 'Editar rota do colaborador' : 'Nova rota de colaborador'}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Dados do transporte fretado (base rh_rotas)</p>
                </div>
              </div>

              <Campo label="Colaborador *">
                <input
                  type="text"
                  required
                  value={form.funcionario}
                  onChange={e => setForm(f => ({ ...f, funcionario: e.target.value }))}
                  placeholder="Nome do colaborador"
                  className={inputClass}
                />
              </Campo>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Campo label="Rota *">
                  <input
                    type="text"
                    required
                    list="facilities-rotas-lista"
                    value={form.rota}
                    onChange={e => setForm(f => ({ ...f, rota: e.target.value }))}
                    placeholder="Ex: ROTA 01"
                    className={inputClass}
                  />
                  <datalist id="facilities-rotas-lista">
                    {opcoesRota.map(o => <option key={o} value={o} />)}
                  </datalist>
                </Campo>
                <Campo label="Horário *">
                  <input
                    type="text"
                    required
                    value={form.horario}
                    onChange={e => setForm(f => ({ ...f, horario: e.target.value }))}
                    placeholder="Ex: 05:20"
                    className={inputClass}
                  />
                </Campo>
              </div>

              <Campo label="Ponto de embarque *">
                <input
                  type="text"
                  required
                  list="facilities-pontos-lista"
                  value={form.ponto_embarque}
                  onChange={e => setForm(f => ({ ...f, ponto_embarque: e.target.value }))}
                  placeholder="Ex: Terminal Central"
                  className={inputClass}
                />
                <datalist id="facilities-pontos-lista">
                  {opcoesPonto.map(o => <option key={o} value={o} />)}
                </datalist>
              </Campo>

              <Campo label="Contato">
                <input
                  type="text"
                  value={form.contato}
                  onChange={e => setForm(f => ({ ...f, contato: e.target.value }))}
                  placeholder="Telefone ou ramal (opcional)"
                  className={inputClass}
                />
              </Campo>

              <label className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 dark:border-slate-700 dark:bg-slate-800">
                <input
                  type="checkbox"
                  checked={form.ativo}
                  onChange={e => setForm(f => ({ ...f, ativo: e.target.checked }))}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-slate-600"
                />
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Colaborador ativo na rota
                </span>
              </label>
            </ModalBody>

            <ModalFooter>
              <button
                type="button"
                onClick={() => setModalAberto(false)}
                disabled={salvando}
                className="rounded-xl px-4 py-2 text-xs font-medium text-slate-500 hover:text-slate-700 disabled:opacity-40 dark:text-slate-400 dark:hover:text-slate-200"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={salvando}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {salvando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {editando ? 'Salvar alterações' : 'Cadastrar'}
              </button>
            </ModalFooter>
          </form>
        </Modal>
      )}

      {paraExcluir && (
        <ConfirmDialog
          titulo="Excluir rota"
          mensagem={<>Remover <strong>{paraExcluir.funcionario}</strong> do cadastro de rotas? Esta ação não pode ser desfeita. Para manter o histórico, prefira inativar o colaborador.</>}
          confirmarLabel="Excluir"
          variante="perigo"
          confirmando={excluindo}
          onConfirmar={confirmarExclusao}
          onCancelar={() => setParaExcluir(null)}
        />
      )}
    </div>
  );
}

const inputClass =
  'mt-1 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100';

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">{label}</label>
      {children}
    </div>
  );
}
