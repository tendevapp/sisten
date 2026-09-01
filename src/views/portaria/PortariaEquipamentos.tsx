/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Formulário "Controle de Entrada de Equipamento e Ferramentas de Terceiros" (FRM.SGP-0011).
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ArrowLeft, Plus, Search, FileDown, CheckCircle2, AlertTriangle,
  RotateCcw, Trash2, Edit3, X, Loader2, Wrench, Shield, Building, User, Calendar
} from 'lucide-react';
import type { Profile, PortControleEquipamento, PortEquipamentoStatus } from '../../types';
import * as api from '../../lib/portariaApi';
import { exportEquipamentoPdf } from '../../lib/pdfExport/exportPortariaPdf';
import StatusPortariaBadge from '../../components/portaria/StatusPortariaBadge';
import VigilanteSelect from '../../components/portaria/VigilanteSelect';
import { useToast } from '../../components/ui/Toast';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import Modal, { ModalHeader, ModalBody, ModalFooter } from '../../components/ui/Modal';
import { MostrarExcluidosToggle, BadgeExcluido, RestaurarButton, classeLinhaExcluida } from '../../components/ui/ExcluidosControls';

interface Props {
  user: Profile;
  onNavigate: (path: string) => void;
}

export default function PortariaEquipamentos({ user, onNavigate }: Props) {
  const toast = useToast();
  const [itens, setItens] = useState<PortControleEquipamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [termoBusca, setTermoBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState<PortEquipamentoStatus | 'TODOS'>('NO_PATIO');

  // Modais
  const [modalNovoAberto, setModalNovoAberto] = useState(false);
  const [modalSaidaAberto, setModalSaidaAberto] = useState(false);
  const [itemSelecionado, setItemSelecionado] = useState<PortControleEquipamento | null>(null);
  const [itemParaExcluir, setItemParaExcluir] = useState<PortControleEquipamento | null>(null);
  const podeVerExcluidos = user.roles.includes('admin');
  const [mostrarExcluidos, setMostrarExcluidos] = useState(false);

  // Form states
  const [salvando, setSalvando] = useState(false);
  const [formEntrada, setFormEntrada] = useState({
    nome_empresa: '',
    funcionario: '',
    descricao_materiais: '',
    responsavel: '',
    vigilante_entrada: '',
    data_entrada: api.hojeISO(),
    hora_entrada: api.horaAgora(),
    observacoes: '',
  });

  const [formSaida, setFormSaida] = useState({
    vigilante_saida: '',
    data_saida: api.hojeISO(),
    hora_saida: api.horaAgora(),
    observacoes: '',
  });

  const carregarDados = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.listarEquipamentos({
        status: filtroStatus,
        termoBusca,
        incluirExcluidos: podeVerExcluidos && mostrarExcluidos,
      });
      setItens(data);
    } catch (e) {
      toast.error(`Erro ao carregar equipamentos: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, [filtroStatus, termoBusca, toast, podeVerExcluidos, mostrarExcluidos]);

  useEffect(() => {
    carregarDados();
  }, [carregarDados]);

  const handleSalvarEntrada = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formEntrada.nome_empresa.trim() || !formEntrada.funcionario.trim() || !formEntrada.descricao_materiais.trim()) {
      toast.error('Preencha os campos obrigatórios: Empresa, Funcionário e Descrição dos materiais.');
      return;
    }
    if (!formEntrada.vigilante_entrada.trim()) {
      toast.error('Selecione o vigilante da portaria.');
      return;
    }

    setSalvando(true);
    try {
      await api.criarEquipamento({
        ...formEntrada,
        criado_por: user.id,
      });
      toast.success('Entrada de equipamento registrada com sucesso!');
      setModalNovoAberto(false);
      setFormEntrada({
        nome_empresa: '',
        funcionario: '',
        descricao_materiais: '',
        responsavel: '',
        vigilante_entrada: '',
        data_entrada: api.hojeISO(),
        hora_entrada: api.horaAgora(),
        observacoes: '',
      });
      carregarDados();
    } catch (e) {
      toast.error(`Falha ao salvar: ${(e as Error).message}`);
    } finally {
      setSalvando(false);
    }
  };

  const handleSalvarSaida = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemSelecionado) return;
    if (!formSaida.vigilante_saida.trim()) {
      toast.error('Selecione o vigilante que efetuou a conferência de saída.');
      return;
    }

    setSalvando(true);
    try {
      await api.registrarSaidaEquipamento(itemSelecionado.id, formSaida);
      toast.success('Saída/Devolução registrada com sucesso!');
      setModalSaidaAberto(false);
      setItemSelecionado(null);
      carregarDados();
    } catch (e) {
      toast.error(`Falha ao registrar saída: ${(e as Error).message}`);
    } finally {
      setSalvando(false);
    }
  };

  const handleExcluir = async () => {
    if (!itemParaExcluir) return;
    try {
      await api.excluirEquipamento(itemParaExcluir.id, user.id);
      toast.success('Registro excluído. Continua no banco e pode ser restaurado por um administrador.');
      setItemParaExcluir(null);
      carregarDados();
    } catch (e) {
      toast.error(`Erro ao excluir: ${(e as Error).message}`);
    }
  };

  const handleRestaurar = async (item: PortControleEquipamento) => {
    try {
      await api.restaurarEquipamento(item.id);
      toast.success('Registro restaurado.');
      carregarDados();
    } catch (e) {
      toast.error(`Erro ao restaurar: ${(e as Error).message}`);
    }
  };

  const totalNoPatio = useMemo(() => itens.filter(i => i.status === 'NO_PATIO').length, [itens]);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <button
            type="button"
            onClick={() => onNavigate('/formularios/portaria')}
            className="group mb-3 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-bold text-slate-700 shadow-xs transition-all hover:border-amber-400 hover:bg-amber-50/50 hover:text-amber-700 hover:shadow-sm active:scale-95 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-amber-500 dark:hover:bg-amber-950/40 dark:hover:text-amber-300"
          >
            <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-1" />
            <span>Voltar para o Painel da Portaria</span>
          </button>
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400">
              <Wrench className="h-5 w-5" />
            </span>
            <div>
              <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-slate-50">
                Equipamentos e Ferramentas de Terceiros
              </h1>
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                FRM.SGP-0011 · Portaria TEN
              </span>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setModalNovoAberto(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 dark:bg-blue-500 dark:hover:bg-blue-400"
        >
          <Plus className="h-4 w-4" />
          Registrar Entrada
        </button>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800 dark:bg-slate-900">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por empresa, funcionário, ferramenta ou protocolo..."
            value={termoBusca}
            onChange={(e) => setTermoBusca(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-9 pr-4 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950/50 dark:text-slate-100"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto">
          <MostrarExcluidosToggle
            visivel={podeVerExcluidos}
            checked={mostrarExcluidos}
            onChange={setMostrarExcluidos}
          />
          {(['NO_PATIO', 'TODOS', 'DEVOLVIDO', 'RETIDO'] as const).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setFiltroStatus(st)}
              className={`rounded-xl px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-all ${
                filtroStatus === st
                  ? 'bg-blue-600 text-white shadow-xs dark:bg-blue-500'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700'
              }`}
            >
              {st === 'NO_PATIO' ? 'No Pátio (Pendentes)' : st === 'TODOS' ? 'Todos os Registros' : st === 'DEVOLVIDO' ? 'Devolvidos' : 'Retidos'}
            </button>
          ))}
        </div>
      </div>

      {/* Content Table / Cards */}
      {loading ? (
        <div className="flex h-48 items-center justify-center rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
        </div>
      ) : itens.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white py-12 text-center dark:border-slate-800 dark:bg-slate-900">
          <Wrench className="h-10 w-10 text-slate-300 dark:text-slate-600 mb-2" />
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Nenhum equipamento encontrado</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {filtroStatus === 'NO_PATIO'
              ? 'Não há ferramentas ou equipamentos de terceiros no pátio no momento.'
              : 'Nenhum registro corresponde aos filtros selecionados.'}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50/75 text-xs font-bold uppercase tracking-wider text-slate-600 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3.5">Protocolo / Data</th>
                  <th className="px-4 py-3.5">Empresa & Portador</th>
                  <th className="px-4 py-3.5">Descrição dos Materiais</th>
                  <th className="px-4 py-3.5">Vigilante Entrada / Saída</th>
                  <th className="px-4 py-3.5 text-center">Status</th>
                  <th className="px-4 py-3.5 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                {itens.map((item) => (
                  <tr key={item.id} className={`hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors ${classeLinhaExcluida(item.excluido_em)}`}>
                    <td className="px-4 py-3.5 align-top">
                      <div className="font-mono text-xs font-bold text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
                        {item.numero_protocolo}
                        {item.excluido_em && <BadgeExcluido em={item.excluido_em} />}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {item.data_entrada} {item.hora_entrada && `às ${item.hora_entrada}`}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 align-top">
                      <div className="font-semibold text-slate-900 dark:text-slate-100">{item.nome_empresa}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {item.funcionario}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 align-top max-w-xs">
                      <p className="line-clamp-2 text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                        {item.descricao_materiais}
                      </p>
                    </td>
                    <td className="px-4 py-3.5 align-top text-xs">
                      <div>Entrada: <span className="font-medium text-slate-900 dark:text-slate-200">{item.vigilante_entrada}</span></div>
                      {item.vigilante_saida && (
                        <div className="text-slate-500 dark:text-slate-400 mt-0.5">
                          Saída: <span className="font-medium text-slate-800 dark:text-slate-300">{item.vigilante_saida}</span> ({item.data_saida})
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3.5 align-top text-center">
                      <StatusPortariaBadge status={item.status} />
                    </td>
                    <td className="px-4 py-3.5 align-top text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {item.excluido_em ? (
                          <RestaurarButton onClick={() => handleRestaurar(item)} />
                        ) : (
                        <>
                        {item.status === 'NO_PATIO' && (
                          <button
                            type="button"
                            onClick={() => {
                              setItemSelecionado(item);
                              setModalSaidaAberto(true);
                            }}
                            className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:text-emerald-400 dark:hover:bg-emerald-900/50"
                            title="Registrar devolução / saída"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Baixar Saída
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => exportEquipamentoPdf(item)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
                          title="Exportar comprovante em PDF"
                        >
                          <FileDown className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setItemParaExcluir(item)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/50 dark:hover:text-rose-400"
                          title="Excluir registro"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                        </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Novo Registro de Entrada */}
      {modalNovoAberto && (
        <Modal onClose={() => setModalNovoAberto(false)} maxWidth="max-w-4xl">
          <ModalHeader onClose={() => setModalNovoAberto(false)}>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100">
                Registrar Entrada de Equipamentos de Terceiros
              </h3>
              <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">Formulário FRM.SGP-0011</p>
            </div>
          </ModalHeader>

          <form onSubmit={handleSalvarEntrada} className="flex flex-col flex-1 min-h-0 overflow-hidden">
            <ModalBody className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Nome da Empresa *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Eletrotécnica Andrade & Silva"
                    value={formEntrada.nome_empresa}
                    onChange={(e) => setFormEntrada({ ...formEntrada, nome_empresa: e.target.value.toUpperCase() })}
                    className="w-full uppercase rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 sm:py-2 text-base sm:text-sm text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Funcionário / Portador *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Nome completo do responsável pelas ferramentas"
                    value={formEntrada.funcionario}
                    onChange={(e) => setFormEntrada({ ...formEntrada, funcionario: e.target.value.toUpperCase() })}
                    className="w-full uppercase rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 sm:py-2 text-base sm:text-sm text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Descrição dos Materiais e Ferramentas *
                </label>
                <textarea
                  required
                  rows={4}
                  placeholder="Liste as ferramentas, modelos, marcas e números de série. Ex:
1x Furadeira de Impacto Bosch GSB 13 RE nº 938210;
1x Caixa de ferramentas de metal com chaves diversas;
1x Multímetro digital Fluke 107."
                  value={formEntrada.descricao_materiais}
                  onChange={(e) => setFormEntrada({ ...formEntrada, descricao_materiais: e.target.value.toUpperCase() })}
                  className="w-full uppercase rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-base sm:text-sm text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:gap-4 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Data de Entrada
                  </label>
                  <input
                    type="date"
                    value={formEntrada.data_entrada}
                    onChange={(e) => setFormEntrada({ ...formEntrada, data_entrada: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 sm:py-2 text-base sm:text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Hora de Entrada
                  </label>
                  <input
                    type="time"
                    value={formEntrada.hora_entrada}
                    onChange={(e) => setFormEntrada({ ...formEntrada, hora_entrada: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 sm:py-2 text-base sm:text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
                <div className="sm:col-span-1">
                  <VigilanteSelect
                    label="Vigilante Portaria"
                    required
                    value={formEntrada.vigilante_entrada}
                    onChange={(val) => setFormEntrada({ ...formEntrada, vigilante_entrada: val })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Responsável / Acompanhante TEN (Opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="Nome do colaborador TEN que acompanha"
                    value={formEntrada.responsavel}
                    onChange={(e) => setFormEntrada({ ...formEntrada, responsavel: e.target.value.toUpperCase() })}
                    className="w-full uppercase rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 sm:py-2 text-base sm:text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Observações Adicionais
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Autorizado pelo setor de manutenção"
                    value={formEntrada.observacoes}
                    onChange={(e) => setFormEntrada({ ...formEntrada, observacoes: e.target.value.toUpperCase() })}
                    className="w-full uppercase rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 sm:py-2 text-base sm:text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
              </div>
            </ModalBody>

            <ModalFooter>
              <button
                type="button"
                onClick={() => setModalNovoAberto(false)}
                className="rounded-xl px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={salvando}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-500 disabled:opacity-50 dark:bg-blue-500"
              >
                {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
                Salvar Entrada
              </button>
            </ModalFooter>
          </form>
        </Modal>
      )}

      {/* Modal Baixar Saída */}
      {modalSaidaAberto && itemSelecionado && (
        <Modal onClose={() => setModalSaidaAberto(false)} maxWidth="max-w-2xl">
          <ModalHeader onClose={() => setModalSaidaAberto(false)}>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Registrar Saída / Devolução
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                {itemSelecionado.numero_protocolo} · {itemSelecionado.nome_empresa}
              </p>
            </div>
          </ModalHeader>

          <form onSubmit={handleSalvarSaida} className="flex flex-col flex-1 min-h-0 overflow-hidden">
            <ModalBody className="space-y-4">
              <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-xs text-amber-900 dark:border-amber-800/40 dark:bg-amber-950/30 dark:text-amber-300">
                <span className="font-bold">Conferência de Materiais:</span> Certifique-se de que todos os itens descritos no momento da entrada estão sendo levados de volta pelo portador.
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Data de Saída
                  </label>
                  <input
                    type="date"
                    value={formSaida.data_saida}
                    onChange={(e) => setFormSaida({ ...formSaida, data_saida: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 sm:py-2 text-base sm:text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Hora de Saída
                  </label>
                  <input
                    type="time"
                    value={formSaida.hora_saida}
                    onChange={(e) => setFormSaida({ ...formSaida, hora_saida: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 sm:py-2 text-base sm:text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
              </div>

              <div>
                <VigilanteSelect
                  label="Vigilante que Conferiu a Saída"
                  required
                  value={formSaida.vigilante_saida}
                  onChange={(val) => setFormSaida({ ...formSaida, vigilante_saida: val })}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Observações de Saída (Opcional)
                </label>
                <input
                  type="text"
                  placeholder="Ex: Conferido e liberado sem pendências"
                  value={formSaida.observacoes}
                  onChange={(e) => setFormSaida({ ...formSaida, observacoes: e.target.value.toUpperCase() })}
                  className="w-full uppercase rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 sm:py-2 text-base sm:text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>
            </ModalBody>

            <ModalFooter>
              <button
                type="button"
                onClick={() => setModalSaidaAberto(false)}
                className="rounded-xl px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={salvando}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-50 dark:bg-emerald-500"
              >
                {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
                Confirmar Devolução
              </button>
            </ModalFooter>
          </form>
        </Modal>
      )}

      {/* Confirm Dialog Excluir */}
      {itemParaExcluir && (
        <ConfirmDialog
          titulo="Excluir Registro de Equipamento"
          mensagem={`Deseja excluir o registro ${itemParaExcluir.numero_protocolo} da empresa ${itemParaExcluir.nome_empresa}? Ele será ocultado das listagens, mas mantido no banco e pode ser restaurado por um administrador.`}
          confirmarLabel="Sim, Excluir"
          variante="perigo"
          onConfirmar={handleExcluir}
          onCancelar={() => setItemParaExcluir(null)}
        />
      )}
    </div>
  );
}
