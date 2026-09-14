/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Módulo Facilities — Cadastro de Vigilantes da Portaria (`port_vigilantes`).
 * Alimenta o seletor `VigilanteSelect` usado em todos os formulários da
 * Portaria. Antes vivia em `/admin/cadastros`; a tabela de origem continua em
 * `portariaApi`, só a tela mudou de lugar.
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  Shield, Plus, Search, Edit2, Trash2, CheckCircle2, XCircle,
  RefreshCw, ArrowLeft,
} from 'lucide-react';
import type { Profile, PortVigilante } from '../../types';
import * as api from '../../lib/portariaApi';
import { useToast } from '../../components/ui/Toast';
import Modal, { ModalHeader, ModalBody, ModalFooter } from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';

interface Props {
  user: Profile;
  onNavigate: (path: string) => void;
}

function formatarDataBR(dataStr?: string | null): string {
  if (!dataStr) return '—';
  const partes = dataStr.split('T')[0].split('-');
  if (partes.length === 3) {
    return `${partes[2]}/${partes[1]}/${partes[0]}`;
  }
  return dataStr;
}

export default function FacilitiesVigilantes({ user, onNavigate }: Props) {
  const toast = useToast();

  const [vigilantes, setVigilantes] = useState<PortVigilante[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filtroStatus, setFiltroStatus] = useState<'TODOS' | 'ATIVOS' | 'INATIVOS'>('TODOS');

  // Modal Novo / Edição
  const [modalOpen, setModalOpen] = useState(false);
  const [itemEditando, setItemEditando] = useState<PortVigilante | null>(null);
  const [salvando, setSalvando] = useState(false);

  // Formulário
  const [formNome, setFormNome] = useState('');
  const [formMatricula, setFormMatricula] = useState('');
  const [formEmpresa, setFormEmpresa] = useState('PROSEG / PATRIMONIAL');
  const [formFuncao, setFormFuncao] = useState('VIGILANTE');
  const [formTurno, setFormTurno] = useState('REVEZAMENTO');
  const [formAdmissao, setFormAdmissao] = useState('');
  const [formNascimento, setFormNascimento] = useState('');
  const [formAtivo, setFormAtivo] = useState(true);
  const [formObs, setFormObs] = useState('');

  const [itemParaExcluir, setItemParaExcluir] = useState<PortVigilante | null>(null);

  const carregarVigilantes = async () => {
    setLoading(true);
    try {
      setVigilantes(await api.listarVigilantes(false));
    } catch (err: any) {
      toast.error('Erro ao carregar lista de vigilantes: ' + (err.message || ''));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregarVigilantes();
  }, []);

  const abrirNovo = () => {
    setItemEditando(null);
    setFormNome('');
    setFormMatricula('');
    setFormEmpresa('PROSEG / PATRIMONIAL');
    setFormFuncao('VIGILANTE');
    setFormTurno('REVEZAMENTO');
    setFormAdmissao('');
    setFormNascimento('');
    setFormAtivo(true);
    setFormObs('');
    setModalOpen(true);
  };

  const abrirEdicao = (v: PortVigilante) => {
    setItemEditando(v);
    setFormNome(v.nome);
    setFormMatricula(v.matricula || '');
    setFormEmpresa(v.empresa);
    setFormFuncao(v.funcao);
    setFormTurno(v.turno_preferencial || 'REVEZAMENTO');
    setFormAdmissao(v.data_admissao || '');
    setFormNascimento(v.data_nascimento || '');
    setFormAtivo(v.ativo);
    setFormObs(v.observacoes || '');
    setModalOpen(true);
  };

  const handleSalvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formNome.trim()) {
      toast.error('O nome do vigilante é obrigatório.');
      return;
    }

    setSalvando(true);
    try {
      const dados = {
        nome: formNome.trim(),
        matricula: formMatricula.trim() || null,
        empresa: formEmpresa.trim(),
        funcao: formFuncao.trim(),
        turno_preferencial: formTurno,
        data_admissao: formAdmissao || null,
        data_nascimento: formNascimento || null,
        ativo: formAtivo,
        observacoes: formObs.trim() || null,
      };
      if (itemEditando) {
        await api.atualizarVigilante(itemEditando.id, dados);
        toast.success(`Vigilante "${formNome}" atualizado com sucesso!`);
      } else {
        await api.criarVigilante({ ...dados, criado_por: user.id });
        toast.success(`Vigilante "${formNome}" cadastrado com sucesso!`);
      }
      setModalOpen(false);
      await carregarVigilantes();
    } catch (err: any) {
      toast.error('Erro ao salvar vigilante: ' + (err.message || ''));
    } finally {
      setSalvando(false);
    }
  };

  const handleToggleStatus = async (v: PortVigilante) => {
    const novoStatus = !v.ativo;
    try {
      await api.alternarStatusVigilante(v.id, novoStatus);
      setVigilantes((prev) => prev.map((item) => (item.id === v.id ? { ...item, ativo: novoStatus } : item)));
      toast.success(`Vigilante ${v.nome} ${novoStatus ? 'ativado' : 'inativado'} com sucesso!`);
    } catch (err: any) {
      toast.error('Erro ao alterar status: ' + (err.message || ''));
    }
  };

  const handleConfirmarExclusao = async () => {
    if (!itemParaExcluir) return;
    const item = itemParaExcluir;
    try {
      await api.excluirVigilante(item.id, user.id);
      setVigilantes((prev) => prev.filter((v) => v.id !== item.id));
      setItemParaExcluir(null);
      toast.undo(
        `Vigilante ${item.nome} excluído com sucesso!`,
        async () => {
          try {
            await api.restaurarVigilante(item.id);
            await carregarVigilantes();
            toast.success(`Vigilante ${item.nome} restaurado com sucesso!`);
          } catch (err: any) {
            toast.error('Erro ao restaurar vigilante: ' + (err.message || ''));
          }
        },
        6000
      );
    } catch (err: any) {
      toast.error('Erro ao excluir vigilante: ' + (err.message || ''));
    }
  };

  const vigilantesFiltrados = useMemo(() => {
    const termo = search.trim().toLowerCase();
    return vigilantes.filter((v) => {
      const matchBusca =
        !termo ||
        v.nome.toLowerCase().includes(termo) ||
        (v.matricula && v.matricula.toLowerCase().includes(termo)) ||
        v.empresa.toLowerCase().includes(termo) ||
        v.funcao.toLowerCase().includes(termo);

      const matchStatus =
        filtroStatus === 'TODOS' ||
        (filtroStatus === 'ATIVOS' && v.ativo) ||
        (filtroStatus === 'INATIVOS' && !v.ativo);

      return matchBusca && matchStatus;
    });
  }, [vigilantes, search, filtroStatus]);

  const totalAtivos = useMemo(() => vigilantes.filter((v) => v.ativo).length, [vigilantes]);

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-12">
      {/* Header */}
      <div>
        <button
          type="button"
          onClick={() => onNavigate('/facilities')}
          className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-teal-600 dark:text-slate-400"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Voltar para Facilities
        </button>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-teal-600 text-white shadow-sm shadow-teal-500/20">
              <Shield className="h-6 w-6" />
            </span>
            <div>
              <h1 className="font-display text-xl font-bold text-slate-900 sm:text-2xl dark:text-slate-50">
                Vigilantes da Portaria
              </h1>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Equipe que aparece no seletor dos formulários da Portaria
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={carregarVigilantes}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Atualizar
            </button>
            <button
              type="button"
              onClick={abrirNovo}
              className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-teal-500"
            >
              <Plus className="h-4 w-4" />
              Novo Vigilante
            </button>
          </div>
        </div>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Total de Vigilantes</span>
            <Shield className="h-4 w-4 text-teal-500" />
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-50">{vigilantes.length}</p>
          <p className="text-[11px] text-slate-400">Registrados na base</p>
        </div>

        <div className="rounded-2xl border border-emerald-200/60 bg-emerald-50/50 p-4 dark:border-emerald-950/60 dark:bg-emerald-950/20">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">Vigilantes Ativos</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <p className="mt-2 text-2xl font-bold text-emerald-900 dark:text-emerald-300">{totalAtivos}</p>
          <p className="text-[11px] text-emerald-600/80 dark:text-emerald-400/80">Aparecem nos formulários da Portaria</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Inativos / Afastados</span>
            <XCircle className="h-4 w-4 text-slate-400" />
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-700 dark:text-slate-300">{vigilantes.length - totalAtivos}</p>
          <p className="text-[11px] text-slate-400">Ocultos das listas suspensas</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 sm:flex-row sm:items-center sm:p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar vigilante por nome, matrícula, empresa..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-10 pr-4 text-base text-slate-900 focus:border-teal-500 focus:bg-white focus:outline-none sm:text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />
        </div>
        <select
          value={filtroStatus}
          onChange={(e) => setFiltroStatus(e.target.value as any)}
          className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-base font-semibold text-slate-700 sm:text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
        >
          <option value="TODOS">Todos os Status</option>
          <option value="ATIVOS">Apenas Ativos</option>
          <option value="INATIVOS">Apenas Inativos</option>
        </select>
        <button
          type="button"
          onClick={carregarVigilantes}
          disabled={loading}
          className="hidden items-center gap-1 rounded-xl border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 sm:inline-flex"
          title="Recarregar"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Tabela */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50/80 font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3.5">Nome do Vigilante</th>
                <th className="px-4 py-3.5">Função</th>
                <th className="px-4 py-3.5">Data Admissão</th>
                <th className="px-4 py-3.5">Data Nascimento</th>
                <th className="px-4 py-3.5">Empresa</th>
                <th className="px-4 py-3.5">Turno</th>
                <th className="px-4 py-3.5 text-center">Status</th>
                <th className="px-4 py-3.5 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {vigilantesFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-slate-500">
                    {loading ? (
                      <div className="flex items-center justify-center gap-2">
                        <RefreshCw className="h-4 w-4 animate-spin text-teal-600" />
                        <span>Carregando vigilantes...</span>
                      </div>
                    ) : (
                      <div>
                        <Shield className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600" />
                        <p className="mt-2 font-medium">Nenhum vigilante encontrado.</p>
                        <button
                          type="button"
                          onClick={abrirNovo}
                          className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-teal-600 hover:underline dark:text-teal-400"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Cadastrar primeiro vigilante
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ) : (
                vigilantesFiltrados.map((v) => (
                  <tr key={v.id} className="transition-colors hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3.5 font-bold text-slate-900 dark:text-slate-100">
                      <div className="flex items-center gap-2">
                        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-100 font-bold text-teal-700 dark:bg-teal-950/60 dark:text-teal-400">
                          {v.nome.charAt(0).toUpperCase()}
                        </span>
                        <div>
                          <span>{v.nome}</span>
                          {v.observacoes && (
                            <p className="text-[10px] font-normal text-slate-400">{v.observacoes}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-slate-600 dark:text-slate-300">
                      <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        {v.funcao}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 font-mono text-slate-600 dark:text-slate-300">
                      {v.data_admissao ? formatarDataBR(v.data_admissao) : '—'}
                    </td>
                    <td className="px-4 py-3.5 font-mono text-slate-600 dark:text-slate-300">
                      {v.data_nascimento ? formatarDataBR(v.data_nascimento) : '—'}
                    </td>
                    <td className="px-4 py-3.5 text-slate-600 dark:text-slate-300">{v.empresa}</td>
                    <td className="px-4 py-3.5 text-slate-600 dark:text-slate-300">
                      {v.turno_preferencial || 'REVEZAMENTO'}
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <button
                        type="button"
                        onClick={() => handleToggleStatus(v)}
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold transition-colors ${
                          v.ativo
                            ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300'
                            : 'bg-slate-200 text-slate-600 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-400'
                        }`}
                        title="Clique para alternar Ativo / Inativo"
                      >
                        {v.ativo ? (
                          <>
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Ativo
                          </>
                        ) : (
                          <>
                            <XCircle className="h-3.5 w-3.5" />
                            Inativo
                          </>
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => abrirEdicao(v)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-teal-600 dark:hover:bg-slate-800 dark:hover:text-teal-400"
                          title="Editar"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setItemParaExcluir(v)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30 dark:hover:text-rose-400"
                          title="Excluir"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Criar / Editar */}
      {modalOpen && (
        <Modal
          onClose={() => setModalOpen(false)}
          maxWidth="max-w-lg"
          ariaLabel={itemEditando ? 'Editar Vigilante' : 'Novo Vigilante'}
        >
          <ModalHeader onClose={() => setModalOpen(false)}>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              {itemEditando ? 'Editar Vigilante' : 'Novo Vigilante'}
            </h3>
          </ModalHeader>
          <form onSubmit={handleSalvar} className="flex min-h-0 flex-1 flex-col">
            <ModalBody className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Nome completo *
                </label>
                <input
                  type="text"
                  required
                  value={formNome}
                  onChange={(e) => setFormNome(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-base text-slate-900 focus:border-teal-500 focus:bg-white focus:outline-none sm:py-2 sm:text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Matrícula
                  </label>
                  <input
                    type="text"
                    value={formMatricula}
                    onChange={(e) => setFormMatricula(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-base text-slate-900 focus:border-teal-500 focus:bg-white focus:outline-none sm:py-2 sm:text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Função
                  </label>
                  <input
                    type="text"
                    value={formFuncao}
                    onChange={(e) => setFormFuncao(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-base text-slate-900 focus:border-teal-500 focus:bg-white focus:outline-none sm:py-2 sm:text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Empresa
                  </label>
                  <input
                    type="text"
                    value={formEmpresa}
                    onChange={(e) => setFormEmpresa(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-base text-slate-900 focus:border-teal-500 focus:bg-white focus:outline-none sm:py-2 sm:text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Turno preferencial
                  </label>
                  <select
                    value={formTurno}
                    onChange={(e) => setFormTurno(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-base text-slate-900 focus:border-teal-500 focus:bg-white focus:outline-none sm:py-2 sm:text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  >
                    <option value="REVEZAMENTO">Revezamento</option>
                    <option value="DIURNO">Diurno</option>
                    <option value="NOTURNO">Noturno</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Data de admissão
                  </label>
                  <input
                    type="date"
                    value={formAdmissao}
                    onChange={(e) => setFormAdmissao(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-base text-slate-900 focus:border-teal-500 focus:bg-white focus:outline-none sm:py-2 sm:text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Data de nascimento
                  </label>
                  <input
                    type="date"
                    value={formNascimento}
                    onChange={(e) => setFormNascimento(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-base text-slate-900 focus:border-teal-500 focus:bg-white focus:outline-none sm:py-2 sm:text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Observações
                </label>
                <textarea
                  rows={2}
                  value={formObs}
                  onChange={(e) => setFormObs(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-base text-slate-900 focus:border-teal-500 focus:bg-white focus:outline-none sm:text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="vigilanteAtivo"
                  checked={formAtivo}
                  onChange={(e) => setFormAtivo(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                />
                <label htmlFor="vigilanteAtivo" className="cursor-pointer text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Disponível nos formulários da Portaria
                </label>
              </div>
            </ModalBody>

            <ModalFooter>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={salvando}
                className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-teal-500 disabled:opacity-50"
              >
                {salvando && <RefreshCw className="h-4 w-4 animate-spin" />}
                {itemEditando ? 'Salvar Alterações' : 'Cadastrar Vigilante'}
              </button>
            </ModalFooter>
          </form>
        </Modal>
      )}

      {itemParaExcluir && (
        <ConfirmDialog
          titulo="Excluir Vigilante"
          mensagem={`Tem certeza que deseja excluir "${itemParaExcluir.nome}"? Ele deixará de aparecer nos formulários da Portaria.`}
          confirmarLabel="Sim, Excluir"
          cancelarLabel="Cancelar"
          variante="perigo"
          onConfirmar={handleConfirmarExclusao}
          onCancelar={() => setItemParaExcluir(null)}
        />
      )}
    </div>
  );
}
