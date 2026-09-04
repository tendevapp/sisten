/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Módulo Facilities — Cadastro da Lista de Serviços.
 *
 * Esta é a lista que aparece no campo "Categoria do incidente/pedido" quando o
 * usuário abre um chamado com destino Facilities em Nova Solicitação. Antes era
 * fixa no código; aqui o gestor cadastra, edita, reordena, ativa/inativa e
 * exclui (exclusão lógica) os serviços, e o formulário passa a refletir na hora.
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  Wrench, Plus, Search, Edit2, Trash2, CheckCircle2, XCircle,
  RefreshCw, ArrowLeft, Loader2, ArrowUp, ArrowDown, ListChecks,
} from 'lucide-react';
import type { Profile, FacServico } from '../../types';
import * as api from '../../lib/facilitiesApi';
import { useToast } from '../../components/ui/Toast';
import Modal, { ModalHeader, ModalBody, ModalFooter } from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';

interface Props {
  user: Profile;
  onNavigate: (path: string) => void;
}

export default function FacilitiesServicos({ user, onNavigate }: Props) {
  const toast = useToast();

  const [servicos, setServicos] = useState<FacServico[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filtroStatus, setFiltroStatus] = useState<'TODOS' | 'ATIVOS' | 'INATIVOS'>('TODOS');

  // Modal Novo / Edição
  const [modalOpen, setModalOpen] = useState(false);
  const [itemEditando, setItemEditando] = useState<FacServico | null>(null);
  const [salvando, setSalvando] = useState(false);

  // Formulário
  const [formNome, setFormNome] = useState('');
  const [formDescricao, setFormDescricao] = useState('');
  const [formOrdem, setFormOrdem] = useState(0);
  const [formAtivo, setFormAtivo] = useState(true);

  const [itemParaExcluir, setItemParaExcluir] = useState<FacServico | null>(null);
  const [reordenandoId, setReordenandoId] = useState<string | null>(null);

  const carregarServicos = async () => {
    setLoading(true);
    try {
      setServicos(await api.listarServicosFacilities(false));
    } catch (err: any) {
      toast.error('Erro ao carregar os serviços: ' + (err.message || ''));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregarServicos();
  }, []);

  const abrirNovo = () => {
    setItemEditando(null);
    setFormNome('');
    setFormDescricao('');
    // Próxima posição livre, ignorando o "Outro" que costuma ficar no fim (99).
    const ordens = servicos.map(s => s.ordem).filter(o => o < 90);
    setFormOrdem((ordens.length ? Math.max(...ordens) : 0) + 1);
    setFormAtivo(true);
    setModalOpen(true);
  };

  const abrirEdicao = (item: FacServico) => {
    setItemEditando(item);
    setFormNome(item.nome);
    setFormDescricao(item.descricao || '');
    setFormOrdem(item.ordem || 0);
    setFormAtivo(item.ativo);
    setModalOpen(true);
  };

  const handleSalvar = async (e: React.FormEvent) => {
    e.preventDefault();
    const nome = formNome.trim();
    if (!nome) {
      toast.warning('O nome do serviço é obrigatório.');
      return;
    }
    const duplicado = servicos.some(
      s => s.id !== itemEditando?.id && s.nome.trim().toLowerCase() === nome.toLowerCase(),
    );
    if (duplicado) {
      toast.warning(`Já existe um serviço chamado "${nome}".`);
      return;
    }

    setSalvando(true);
    try {
      const dados = {
        nome,
        descricao: formDescricao,
        ordem: Number(formOrdem),
        ativo: formAtivo,
      };
      if (itemEditando) {
        await api.atualizarServicoFacilities(itemEditando.id, dados);
        toast.success(`Serviço "${nome}" atualizado.`);
      } else {
        await api.criarServicoFacilities(dados);
        toast.success(`Serviço "${nome}" cadastrado.`);
      }
      setModalOpen(false);
      await carregarServicos();
    } catch (err: any) {
      toast.error('Erro ao salvar o serviço: ' + (err.message || ''));
    } finally {
      setSalvando(false);
    }
  };

  const handleToggleStatus = async (item: FacServico) => {
    try {
      await api.alternarStatusServicoFacilities(item.id, !item.ativo);
      toast.success(`Serviço "${item.nome}" ${!item.ativo ? 'ativado' : 'inativado'}.`);
      await carregarServicos();
    } catch (err: any) {
      toast.error('Erro ao alterar o status: ' + (err.message || ''));
    }
  };

  /**
   * Reordena o servico para cima ou para baixo com atualizacao otimista imediata.
   * Evita condicoes de corrida bloqueando chamadas simultaneas e persiste em lote.
   */
  const handleMover = async (item: FacServico, direcao: -1 | 1) => {
    if (reordenandoId) return;

    const { novosServicos, itensAlterados } = api.calcularNovaOrdenacao(servicos, item, direcao);
    if (itensAlterados.length === 0) return;

    // Atualizacao otimista imediata na UI
    const backupServicos = servicos;
    setServicos(novosServicos);
    setReordenandoId(item.id);

    try {
      await api.salvarOrdenacaoServicosFacilities(itensAlterados);
    } catch (err: any) {
      // Reverte estado local se a gravacao falhar
      setServicos(backupServicos);
      toast.error('Erro ao reordenar: ' + (err.message || ''));
    } finally {
      setReordenandoId(null);
    }
  };

  const handleConfirmarExclusao = async () => {
    if (!itemParaExcluir) return;
    try {
      await api.excluirServicoFacilities(itemParaExcluir.id, user.id);
      toast.success(`Serviço "${itemParaExcluir.nome}" excluído.`);
      setItemParaExcluir(null);
      await carregarServicos();
    } catch (err: any) {
      toast.error('Erro ao excluir o serviço: ' + (err.message || ''));
    }
  };

  const servicosFiltrados = useMemo(() => {
    const termo = search.trim().toLowerCase();
    const filtrados = servicos.filter(item => {
      const matchBusca =
        !termo ||
        item.nome.toLowerCase().includes(termo) ||
        (item.descricao || '').toLowerCase().includes(termo);
      const matchStatus =
        filtroStatus === 'TODOS' ||
        (filtroStatus === 'ATIVOS' && item.ativo) ||
        (filtroStatus === 'INATIVOS' && !item.ativo);
      return matchBusca && matchStatus;
    });
    return filtrados.sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome));
  }, [servicos, search, filtroStatus]);

  const totalAtivos = useMemo(() => servicos.filter(s => s.ativo).length, [servicos]);
  const reordenavel = !search.trim() && filtroStatus === 'TODOS' && !reordenandoId;


  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-12">
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
              <Wrench className="h-6 w-6" />
            </span>
            <div>
              <h1 className="font-display text-xl font-bold text-slate-900 sm:text-2xl dark:text-slate-50">
                Lista de Serviços
              </h1>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Categorias que o solicitante escolhe ao abrir um chamado de Facilities
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={carregarServicos}
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
              Novo Serviço
            </button>
          </div>
        </div>
      </div>

      {/* Efeito prático da tela, dito na primeira dobra */}
      <div className="flex items-start gap-2.5 rounded-2xl border border-teal-200 bg-teal-50/70 p-3.5 text-xs leading-relaxed text-teal-900 dark:border-teal-900/50 dark:bg-teal-950/30 dark:text-teal-200">
        <ListChecks className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Os serviços <strong>ativos</strong> aparecem, nesta mesma ordem, no campo
          "Categoria do incidente/pedido" de <strong>Nova Solicitação &rarr; Chamado &rarr; Facilities</strong>.
          Inativar esconde o serviço do formulário sem apagar o histórico dos chamados que já o usaram.
        </p>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs text-slate-500 dark:text-slate-400">Serviços cadastrados</p>
          <p className="mt-1 text-xl font-bold text-slate-900 dark:text-slate-100">{servicos.length}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs text-slate-500 dark:text-slate-400">Visíveis no formulário</p>
          <p className="mt-1 text-xl font-bold text-emerald-600 dark:text-emerald-400">{totalAtivos}</p>
        </div>
        <div className="col-span-2 rounded-2xl border border-slate-200 bg-white p-4 sm:col-span-1 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs text-slate-500 dark:text-slate-400">Inativos</p>
          <p className="mt-1 text-xl font-bold text-slate-500 dark:text-slate-400">{servicos.length - totalAtivos}</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 sm:flex-row sm:items-center sm:p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar serviço por nome ou descrição..."
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
          <option value="TODOS">Todos Status</option>
          <option value="ATIVOS">Somente Ativos</option>
          <option value="INATIVOS">Somente Inativos</option>
        </select>
      </div>

      {/* Lista */}
      <div className="space-y-2.5">
        {servicosFiltrados.map((item, idx) => (
          <div
            key={item.id}
            className={`flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between ${
              item.ativo
                ? 'border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900'
                : 'border-dashed border-slate-200 bg-slate-50/70 opacity-75 dark:border-slate-800 dark:bg-slate-950/50'
            }`}
          >
            <div className="flex min-w-0 items-start gap-3">
              <span className="mt-0.5 flex h-8 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 font-mono text-xs font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                {item.ordem}
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">{item.nome}</h3>
                  {!item.ativo && (
                    <span className="rounded-md bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                      Inativo
                    </span>
                  )}
                </div>
                {item.descricao && (
                  <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{item.descricao}</p>
                )}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1 self-end sm:self-center">
              <button
                type="button"
                onClick={() => handleMover(item, -1)}
                disabled={!reordenavel || idx === 0}
                title={
                  !reordenavel
                    ? (reordenandoId ? 'Salvando ordenação...' : 'Limpe a busca e os filtros para reordenar')
                    : 'Subir na lista do formulário'
                }
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30 disabled:hover:bg-transparent dark:hover:bg-slate-800"
              >
                {reordenandoId === item.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-teal-600 dark:text-teal-400" />
                ) : (
                  <ArrowUp className="h-3.5 w-3.5" />
                )}
              </button>
              <button
                type="button"
                onClick={() => handleMover(item, 1)}
                disabled={!reordenavel || idx === servicosFiltrados.length - 1}
                title={
                  !reordenavel
                    ? (reordenandoId ? 'Salvando ordenação...' : 'Limpe a busca e os filtros para reordenar')
                    : 'Descer na lista do formulário'
                }
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30 disabled:hover:bg-transparent dark:hover:bg-slate-800"
              >
                {reordenandoId === item.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-teal-600 dark:text-teal-400" />
                ) : (
                  <ArrowDown className="h-3.5 w-3.5" />
                )}
              </button>

              <button
                type="button"
                onClick={() => handleToggleStatus(item)}
                title={item.ativo ? 'Clique para inativar' : 'Clique para ativar'}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                {item.ativo
                  ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  : <XCircle className="h-4 w-4 text-slate-400" />}
              </button>
              <button
                type="button"
                onClick={() => abrirEdicao(item)}
                className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100 hover:text-teal-600 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-teal-400"
              >
                <Edit2 className="h-3.5 w-3.5" />
                Editar
              </button>
              <button
                type="button"
                onClick={() => setItemParaExcluir(item)}
                title="Excluir serviço"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 dark:hover:text-rose-400"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {servicosFiltrados.length === 0 && !loading && (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-900">
          <Wrench className="mx-auto h-8 w-8 text-slate-400" />
          <p className="mt-2 text-sm font-semibold text-slate-700 dark:text-slate-300">Nenhum serviço encontrado</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Ajuste os filtros de busca ou cadastre um novo serviço.
          </p>
        </div>
      )}

      {/* Modal Criar / Editar */}
      {modalOpen && (
        <Modal
          onClose={() => setModalOpen(false)}
          maxWidth="max-w-lg"
          ariaLabel={itemEditando ? 'Editar Serviço de Facilities' : 'Novo Serviço de Facilities'}
        >
          <ModalHeader onClose={() => setModalOpen(false)}>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              {itemEditando ? 'Editar Serviço' : 'Novo Serviço'}
            </h3>
          </ModalHeader>
          <form onSubmit={handleSalvar} className="flex min-h-0 flex-1 flex-col">
            <ModalBody className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Nome do serviço *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Jardinagem"
                  value={formNome}
                  onChange={(e) => setFormNome(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-base text-slate-900 focus:border-teal-500 focus:bg-white focus:outline-none sm:py-2 sm:text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                  É exatamente o texto que aparece no select do chamado.
                </p>
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Descrição (opcional)
                </label>
                <textarea
                  rows={2}
                  placeholder="Ex: Poda, corte de grama e manutenção de áreas verdes."
                  value={formDescricao}
                  onChange={(e) => setFormDescricao(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-base text-slate-900 focus:border-teal-500 focus:bg-white focus:outline-none sm:text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                  Uso interno do cadastro — ajuda a equipe a saber o que entra em cada serviço.
                </p>
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Ordem de exibição
                </label>
                <input
                  type="number"
                  min={0}
                  value={formOrdem}
                  onChange={(e) => setFormOrdem(Number(e.target.value))}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-base text-slate-900 sm:py-2 sm:text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="servicoAtivo"
                  checked={formAtivo}
                  onChange={(e) => setFormAtivo(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                />
                <label htmlFor="servicoAtivo" className="cursor-pointer text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Disponível no formulário de chamado de Facilities
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
                {itemEditando ? 'Salvar Alterações' : 'Cadastrar Serviço'}
              </button>
            </ModalFooter>
          </form>
        </Modal>
      )}

      {itemParaExcluir && (
        <ConfirmDialog
          titulo="Excluir Serviço"
          mensagem={`Tem certeza que deseja excluir o serviço "${itemParaExcluir.nome}"? Ele deixará de aparecer no formulário de chamado. Se a intenção for apenas escondê-lo temporariamente, use "inativar".`}
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
