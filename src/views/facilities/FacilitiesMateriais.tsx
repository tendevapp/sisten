/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Módulo Facilities — Cadastro & Gestão de Materiais de Segurança Patrimonial
 * Permite ao gestor de facilities cadastrar, editar quantidades padrão, ativar/inativar
 * e gerenciar os itens sob custódia da vigilância (Revólveres, Placas, Rádios, Munições, Etilômetro, etc).
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  Shield, Plus, Search, Edit2, Trash2, CheckCircle2, XCircle,
  RefreshCw, ArrowLeft, Tag, Loader2
} from 'lucide-react';
import type { Profile, PortMaterialSeguranca, PortMaterialCategoria } from '../../types';
import * as api from '../../lib/portariaApi';
import { useToast } from '../../components/ui/Toast';
import Modal, { ModalHeader, ModalBody, ModalFooter } from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';

interface Props {
  user: Profile;
  onNavigate: (path: string) => void;
}

const CATEGORIAS_MATERIAIS: { id: PortMaterialCategoria; label: string; cor: string }[] = [
  { id: 'ARMAMENTO', label: 'Armamento', cor: 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400' },
  { id: 'PROTECAO', label: 'Proteção Balística', cor: 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400' },
  { id: 'COMUNICACAO', label: 'Comunicação (HT)', cor: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-400' },
  { id: 'MUNICAO', label: 'Munição', cor: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400' },
  { id: 'EQUIPAMENTO', label: 'Equipamento / Teste', cor: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400' },
];

export default function FacilitiesMateriais({ user: _user, onNavigate }: Props) {
  const toast = useToast();

  const [materiais, setMateriais] = useState<PortMaterialSeguranca[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState<'TODOS' | PortMaterialCategoria>('TODOS');
  const [filtroStatus, setFiltroStatus] = useState<'TODOS' | 'ATIVOS' | 'INATIVOS'>('TODOS');

  // Modal Novo / Edição
  const [modalOpen, setModalOpen] = useState(false);
  const [itemEditando, setItemEditando] = useState<PortMaterialSeguranca | null>(null);
  const [salvando, setSalvando] = useState(false);

  // Formulário
  const [formNome, setFormNome] = useState('');
  const [formQtd, setFormQtd] = useState(1);
  const [formUnidade, setFormUnidade] = useState('UN');
  const [formCategoria, setFormCategoria] = useState<PortMaterialCategoria>('EQUIPAMENTO');
  const [formOrdem, setFormOrdem] = useState(0);
  const [formAtivo, setFormAtivo] = useState(true);
  const [formObs, setFormObs] = useState('');

  // Confirmação de Exclusão
  const [itemParaExcluir, setItemParaExcluir] = useState<PortMaterialSeguranca | null>(null);

  const carregarMateriais = async () => {
    setLoading(true);
    try {
      const lista = await api.listarMateriaisSeguranca(false);
      setMateriais(lista);
    } catch (err: any) {
      toast.error('Erro ao carregar materiais: ' + (err.message || ''));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregarMateriais();
  }, []);

  const abrirNovo = () => {
    setItemEditando(null);
    setFormNome('');
    setFormQtd(1);
    setFormUnidade('UN');
    setFormCategoria('EQUIPAMENTO');
    setFormOrdem((materiais.length || 0) + 1);
    setFormAtivo(true);
    setFormObs('');
    setModalOpen(true);
  };

  const abrirEdicao = (item: PortMaterialSeguranca) => {
    setItemEditando(item);
    setFormNome(item.nome);
    setFormQtd(item.quantidade_padrao);
    setFormUnidade(item.unidade || 'UN');
    setFormCategoria(item.categoria);
    setFormOrdem(item.ordem || 0);
    setFormAtivo(item.ativo);
    setFormObs(item.observacoes || '');
    setModalOpen(true);
  };

  const handleSalvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formNome.trim()) {
      toast.warning('O nome do material é obrigatório.');
      return;
    }
    if (formQtd < 0) {
      toast.warning('A quantidade padrão deve ser igual ou maior que zero.');
      return;
    }

    setSalvando(true);
    try {
      if (itemEditando) {
        await api.atualizarMaterialSeguranca(itemEditando.id, {
          nome: formNome,
          quantidade_padrao: Number(formQtd),
          unidade: formUnidade.toUpperCase(),
          categoria: formCategoria,
          ordem: Number(formOrdem),
          ativo: formAtivo,
          observacoes: formObs,
        });
        toast.success(`Material "${formNome}" atualizado com sucesso!`);
      } else {
        await api.criarMaterialSeguranca({
          nome: formNome,
          quantidade_padrao: Number(formQtd),
          unidade: formUnidade.toUpperCase(),
          categoria: formCategoria,
          ordem: Number(formOrdem),
          ativo: formAtivo,
          observacoes: formObs,
        });
        toast.success(`Material "${formNome}" cadastrado com sucesso!`);
      }
      setModalOpen(false);
      carregarMateriais();
    } catch (err: any) {
      toast.error('Erro ao salvar material: ' + (err.message || ''));
    } finally {
      setSalvando(false);
    }
  };

  const handleToggleStatus = async (item: PortMaterialSeguranca) => {
    try {
      await api.alternarStatusMaterialSeguranca(item.id, !item.ativo);
      toast.success(`Material "${item.nome}" ${!item.ativo ? 'ativado' : 'inativado'}!`);
      carregarMateriais();
    } catch (err: any) {
      toast.error('Erro ao alterar status: ' + (err.message || ''));
    }
  };

  const handleConfirmarExclusao = async () => {
    if (!itemParaExcluir) return;
    try {
      await api.excluirMaterialSeguranca(itemParaExcluir.id);
      toast.success(`Material "${itemParaExcluir.nome}" excluído com sucesso!`);
      setItemParaExcluir(null);
      carregarMateriais();
    } catch (err: any) {
      toast.error('Erro ao excluir material: ' + (err.message || ''));
    }
  };

  // Filtragem
  const materiaisFiltrados = useMemo(() => {
    return materiais.filter((item) => {
      const matchBusca =
        !search ||
        item.nome.toLowerCase().includes(search.toLowerCase()) ||
        (item.observacoes && item.observacoes.toLowerCase().includes(search.toLowerCase()));

      const matchCategoria = filtroCategoria === 'TODOS' || item.categoria === filtroCategoria;

      const matchStatus =
        filtroStatus === 'TODOS' ||
        (filtroStatus === 'ATIVOS' && item.ativo) ||
        (filtroStatus === 'INATIVOS' && !item.ativo);

      return matchBusca && matchCategoria && matchStatus;
    });
  }, [materiais, search, filtroCategoria, filtroStatus]);

  const totalAtivos = useMemo(() => materiais.filter((m) => m.ativo).length, [materiais]);

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-12">
      {/* Header */}
      <div>
        <button
          type="button"
          onClick={() => onNavigate('/facilities')}
          className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-blue-600 dark:text-slate-400"
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
              <h1 className="font-display text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-50">
                Materiais de Segurança Patrimonial
              </h1>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Catálogo de armamento, munição, coletes balísticos e equipamentos para o checklist da Portaria
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={carregarMateriais}
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
              Novo Material
            </button>
          </div>
        </div>
      </div>

      {/* Cards de Resumo */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs text-slate-500 dark:text-slate-400">Total de Itens</p>
          <p className="text-xl font-bold text-slate-900 dark:text-slate-100 mt-1">{materiais.length}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs text-slate-500 dark:text-slate-400">Itens Ativos no Checklist</p>
          <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">{totalAtivos}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs text-slate-500 dark:text-slate-400">Armamento & Munições</p>
          <p className="text-xl font-bold text-rose-600 dark:text-rose-400 mt-1">
            {materiais.filter((m) => m.categoria === 'ARMAMENTO' || m.categoria === 'MUNICAO').length}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs text-slate-500 dark:text-slate-400">Comunicação & Proteção</p>
          <p className="text-xl font-bold text-indigo-600 dark:text-indigo-400 mt-1">
            {materiais.filter((m) => m.categoria === 'COMUNICACAO' || m.categoria === 'PROTECAO').length}
          </p>
        </div>
      </div>

      {/* Barra de Filtros */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar material por nome ou observação..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 py-2 text-base sm:text-sm text-slate-900 focus:border-teal-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
            <select
              value={filtroCategoria}
              onChange={(e) => setFiltroCategoria(e.target.value as any)}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-base sm:text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
            >
              <option value="TODOS">Todas Categorias</option>
              {CATEGORIAS_MATERIAIS.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>

            <select
              value={filtroStatus}
              onChange={(e) => setFiltroStatus(e.target.value as any)}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-base sm:text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
            >
              <option value="TODOS">Todos Status</option>
              <option value="ATIVOS">Somente Ativos</option>
              <option value="INATIVOS">Somente Inativos</option>
            </select>
          </div>
        </div>
      </div>

      {/* Grid de Materiais */}
      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
        {materiaisFiltrados.map((item) => {
          const catInfo = CATEGORIAS_MATERIAIS.find((c) => c.id === item.categoria) || CATEGORIAS_MATERIAIS[4];
          return (
            <div
              key={item.id}
              className={`flex flex-col justify-between rounded-2xl border p-4.5 sm:p-5 transition-all ${
                item.ativo
                  ? 'border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900'
                  : 'border-dashed border-slate-200 bg-slate-50/70 opacity-70 dark:border-slate-800 dark:bg-slate-950/50'
              }`}
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${catInfo.cor}`}>
                    <Tag className="h-3 w-3" />
                    {catInfo.label}
                  </span>
                  <div className="flex items-center gap-1">
                    <span className="font-mono text-xs text-slate-400">#{item.ordem}</span>
                    <button
                      type="button"
                      onClick={() => handleToggleStatus(item)}
                      title={item.ativo ? 'Clique para inativar' : 'Clique para ativar'}
                      className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      {item.ativo ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      ) : (
                        <XCircle className="h-4 w-4 text-slate-400" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="mt-3 flex items-baseline gap-2">
                  <span className="font-mono text-2xl font-black text-slate-900 dark:text-slate-50">
                    {String(item.quantidade_padrao).padStart(2, '0')}
                  </span>
                  <span className="text-xs font-bold text-slate-500 uppercase">{item.unidade || 'UN'}</span>
                </div>

                <h3 className="mt-1 text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100">
                  {item.nome}
                </h3>

                {item.observacoes && (
                  <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    {item.observacoes}
                  </p>
                )}
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800/80">
                <span className="text-[11px] text-slate-400">
                  {item.ativo ? 'Ativo no checklist' : 'Inativo (oculto)'}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => abrirEdicao(item)}
                    className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100 hover:text-blue-600 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-blue-400"
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => setItemParaExcluir(item)}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 dark:hover:text-rose-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {materiaisFiltrados.length === 0 && !loading && (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-900">
          <Shield className="mx-auto h-8 w-8 text-slate-400" />
          <p className="mt-2 text-sm font-semibold text-slate-700 dark:text-slate-300">Nenhum material encontrado</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Tente ajustar os filtros de busca ou cadastre um novo item.</p>
        </div>
      )}

      {/* Modal Criar / Editar Material */}
      {modalOpen && (
        <Modal
          onClose={() => setModalOpen(false)}
          maxWidth="max-w-lg"
          ariaLabel={itemEditando ? 'Editar Material de Segurança' : 'Novo Material de Segurança'}
        >
          <ModalHeader onClose={() => setModalOpen(false)}>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              {itemEditando ? 'Editar Material de Segurança' : 'Novo Material de Segurança'}
            </h3>
          </ModalHeader>
          <form onSubmit={handleSalvar} className="flex flex-col flex-1 min-h-0">
            <ModalBody className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Nome do Material / Equipamento *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Revólveres Taurus cal. 38mm"
                  value={formNome}
                  onChange={(e) => setFormNome(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 sm:py-2 text-base sm:text-sm text-slate-900 focus:border-teal-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Quantidade Padrão *
                  </label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={formQtd}
                    onChange={(e) => setFormQtd(Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 sm:py-2 text-base sm:text-sm text-slate-900 focus:border-teal-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Unidade
                  </label>
                  <select
                    value={formUnidade}
                    onChange={(e) => setFormUnidade(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 sm:py-2 text-base sm:text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  >
                    <option value="UN">UN (Unidade)</option>
                    <option value="PARES">PARES (Pares)</option>
                    <option value="PC">PC (Peça)</option>
                    <option value="CX">CX (Caixa)</option>
                    <option value="KIT">KIT (Conjunto)</option>
                  </select>
                </div>

                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Ordem de Exibição
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={formOrdem}
                    onChange={(e) => setFormOrdem(Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 sm:py-2 text-base sm:text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Categoria
                </label>
                <select
                  value={formCategoria}
                  onChange={(e) => setFormCategoria(e.target.value as any)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 sm:py-2 text-base sm:text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                >
                  {CATEGORIAS_MATERIAIS.map((c) => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Observações / Especificação (Opcional)
                </label>
                <textarea
                  rows={2}
                  placeholder="Ex: Armamento mantido no cofre da guarita sob custódia da equipe."
                  value={formObs}
                  onChange={(e) => setFormObs(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-base sm:text-xs text-slate-900 focus:border-teal-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="matAtivo"
                  checked={formAtivo}
                  onChange={(e) => setFormAtivo(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                />
                <label htmlFor="matAtivo" className="text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
                  Ativo no checklist do formulário de Passagem de Plantão
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
                {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
                {itemEditando ? 'Salvar Alterações' : 'Cadastrar Material'}
              </button>
            </ModalFooter>
          </form>
        </Modal>
      )}

      {/* Confirmação de Exclusão */}
      {itemParaExcluir && (
        <ConfirmDialog
          titulo="Excluir Material de Segurança"
          mensagem={`Tem certeza que deseja excluir o material "${itemParaExcluir.nome}"? Ele deixará de aparecer no checklist da portaria.`}
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
