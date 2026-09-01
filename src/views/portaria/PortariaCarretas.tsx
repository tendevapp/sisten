/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Formulário "Controle de Chegada e Saída de Carretas de Chapas" (FRM.SGP-0020).
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ArrowLeft, Plus, Search, FileDown, CheckCircle2,
  Trash2, X, Loader2, Truck, Clock, Calendar, User, FileText, PenTool
} from 'lucide-react';
import type { Profile, PortControleCarreta, PortCarretaStatus } from '../../types';
import * as api from '../../lib/portariaApi';
import { exportCarretasPdf } from '../../lib/pdfExport/exportPortariaPdf';
import StatusPortariaBadge from '../../components/portaria/StatusPortariaBadge';
import VigilanteSelect from '../../components/portaria/VigilanteSelect';
import SignaturePadModal from '../../components/portaria/SignaturePadModal';
import { useToast } from '../../components/ui/Toast';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import Modal, { ModalHeader, ModalBody, ModalFooter } from '../../components/ui/Modal';
import { MostrarExcluidosToggle, BadgeExcluido, RestaurarButton, classeLinhaExcluida } from '../../components/ui/ExcluidosControls';

interface Props {
  user: Profile;
  onNavigate: (path: string) => void;
}

export default function PortariaCarretas({ user, onNavigate }: Props) {
  const toast = useToast();
  const [itens, setItens] = useState<PortControleCarreta[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroStatus, setFiltroStatus] = useState<PortCarretaStatus | 'TODOS'>('NO_PATIO');
  const [termoBusca, setTermoBusca] = useState('');

  // Modais
  const [modalNovoAberto, setModalNovoAberto] = useState(false);
  const [modalSaidaAberto, setModalSaidaAberto] = useState(false);
  const [modalAssinaturaAberto, setModalAssinaturaAberto] = useState(false);
  const [itemSelecionado, setItemSelecionado] = useState<PortControleCarreta | null>(null);
  const [itemParaExcluir, setItemParaExcluir] = useState<PortControleCarreta | null>(null);
  const [salvando, setSalvando] = useState(false);
  const podeVerExcluidos = user.roles.includes('admin');
  const [mostrarExcluidos, setMostrarExcluidos] = useState(false);

  const [formNovo, setFormNovo] = useState({
    empresa: '',
    placa_cavalo: '',
    placa_carreta: '',
    data_entrada: api.hojeISO(),
    hora_entrada: api.horaAgora(),
    nome_motorista: '',
    cpf_motorista: '',
    vigilante_entrada: '',
    numero_nf: '',
    peso_bruto: '',
    observacoes: '',
  });

  const [formSaida, setFormSaida] = useState({
    vigilante_saida: '',
    data_saida: api.hojeISO(),
    hora_saida: api.horaAgora(),
    ass_motorista: '',
    observacoes: '',
  });

  const carregarDados = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.listarCarretas({
        status: filtroStatus,
        termoBusca,
        incluirExcluidos: podeVerExcluidos && mostrarExcluidos,
      });
      setItens(data);
    } catch (e) {
      toast.error(`Erro ao carregar carretas: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, [filtroStatus, termoBusca, toast, podeVerExcluidos, mostrarExcluidos]);

  useEffect(() => {
    carregarDados();
  }, [carregarDados]);

  const handleSalvarEntrada = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formNovo.empresa.trim() || !formNovo.placa_cavalo.trim() || !formNovo.nome_motorista.trim()) {
      toast.error('Preencha os campos obrigatórios: Empresa, Placa Cavalo e Nome do Motorista.');
      return;
    }
    if (!formNovo.vigilante_entrada.trim()) {
      toast.error('Selecione o vigilante da portaria.');
      return;
    }

    setSalvando(true);
    try {
      await api.criarCarreta({
        ...formNovo,
        peso_bruto: formNovo.peso_bruto ? Number(formNovo.peso_bruto) : null,
        criado_por: user.id,
      });
      toast.success('Entrada de carreta de chapas registrada com sucesso!');
      setModalNovoAberto(false);
      setFormNovo({
        empresa: '',
        placa_cavalo: '',
        placa_carreta: '',
        data_entrada: api.hojeISO(),
        hora_entrada: api.horaAgora(),
        nome_motorista: '',
        cpf_motorista: '',
        vigilante_entrada: '',
        numero_nf: '',
        peso_bruto: '',
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
      toast.error('Selecione o vigilante de saída.');
      return;
    }

    setSalvando(true);
    try {
      await api.registrarSaidaCarreta(itemSelecionado.id, formSaida);
      toast.success('Saída de carreta registrada com sucesso!');
      setModalSaidaAberto(false);
      setItemSelecionado(null);
      carregarDados();
    } catch (e) {
      toast.error(`Falha ao salvar saída: ${(e as Error).message}`);
    } finally {
      setSalvando(false);
    }
  };

  const handleExcluir = async () => {
    if (!itemParaExcluir) return;
    try {
      await api.excluirCarreta(itemParaExcluir.id, user.id);
      toast.success('Registro ocultado. Mantido no banco e restaurável por um administrador.');
      setItemParaExcluir(null);
      carregarDados();
    } catch (e) {
      toast.error(`Erro ao excluir: ${(e as Error).message}`);
    }
  };

  const handleRestaurar = async (item: PortControleCarreta) => {
    try {
      await api.restaurarCarreta(item.id);
      toast.success('Registro restaurado.');
      carregarDados();
    } catch (e) {
      toast.error(`Erro ao restaurar: ${(e as Error).message}`);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <button
            type="button"
            onClick={() => onNavigate('/formularios/portaria')}
            className="group mb-3 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-bold text-slate-700 shadow-xs transition-all hover:border-cyan-400 hover:bg-cyan-50/50 hover:text-cyan-700 hover:shadow-sm active:scale-95 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-cyan-500 dark:hover:bg-cyan-950/40 dark:hover:text-cyan-300"
          >
            <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-1" />
            <span>Voltar para o Painel da Portaria</span>
          </button>
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-100 text-cyan-700 dark:bg-cyan-950/60 dark:text-cyan-400">
              <Truck className="h-5 w-5" />
            </span>
            <div>
              <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-slate-50">
                Controle de Carretas de Chapas
              </h1>
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                FRM.SGP-0020 · Recebimento de Aço TEN
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => exportCarretasPdf(itens)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <FileDown className="h-4 w-4 text-slate-500" />
            Exportar Relatório (PDF)
          </button>

          <button
            type="button"
            onClick={() => setModalNovoAberto(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 dark:bg-blue-500 dark:hover:bg-blue-400"
          >
            <Plus className="h-4 w-4" />
            Registrar Carreta
          </button>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800 dark:bg-slate-900">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por empresa, placa cavalo/carreta, motorista ou NF..."
            value={termoBusca}
            onChange={(e) => setTermoBusca(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-9 pr-4 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950/50 dark:text-slate-100"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto">
          <MostrarExcluidosToggle visivel={podeVerExcluidos} checked={mostrarExcluidos} onChange={setMostrarExcluidos} />
          {(['NO_PATIO', 'TODOS', 'FINALIZADO'] as const).map((st) => (
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
              {st === 'NO_PATIO' ? 'No Pátio (Descarregando)' : st === 'TODOS' ? 'Todas as Carretas' : 'Finalizadas (Saída Registrada)'}
            </button>
          ))}
        </div>
      </div>

      {/* Table Content */}
      {loading ? (
        <div className="flex h-48 items-center justify-center rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
        </div>
      ) : itens.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white py-12 text-center dark:border-slate-800 dark:bg-slate-900">
          <Truck className="h-10 w-10 text-slate-300 dark:text-slate-600 mb-2" />
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Nenhuma carreta de chapas encontrada</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {filtroStatus === 'NO_PATIO' ? 'Nenhuma carreta de chapas no pátio no momento.' : 'Nenhum registro corresponde aos filtros.'}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50/75 text-xs font-bold uppercase tracking-wider text-slate-600 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3.5">Protocolo / Entrada</th>
                  <th className="px-4 py-3.5">Empresa & Placas</th>
                  <th className="px-4 py-3.5">Motorista</th>
                  <th className="px-4 py-3.5">NF & Peso</th>
                  <th className="px-4 py-3.5">Saída / Liberação</th>
                  <th className="px-4 py-3.5 text-center">Status</th>
                  <th className="px-4 py-3.5 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                {itens.map((item) => (
                  <tr key={item.id} className={`hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors ${classeLinhaExcluida(item.excluido_em)}`}>
                    <td className="px-4 py-3.5">
                      <div className="font-mono text-xs font-bold text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
                        {item.numero_protocolo}
                        {item.excluido_em && <BadgeExcluido em={item.excluido_em} />}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {item.data_entrada} às {item.hora_entrada}
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="font-bold text-slate-900 dark:text-slate-100">{item.empresa}</div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="font-mono text-[11px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                          Cav: {item.placa_cavalo}
                        </span>
                        {item.placa_carreta && (
                          <span className="font-mono text-[11px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                            Car: {item.placa_carreta}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-xs">
                      <div className="font-semibold text-slate-900 dark:text-slate-100">{item.nome_motorista}</div>
                      {item.cpf_motorista && (
                        <div className="text-slate-500 dark:text-slate-400">CPF: {item.cpf_motorista}</div>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-xs text-slate-600 dark:text-slate-300">
                      <div>NF: {item.numero_nf || '-'}</div>
                      <div>Peso: {item.peso_bruto ? `${item.peso_bruto} kg` : '-'}</div>
                    </td>
                    <td className="px-4 py-3.5 text-xs">
                      {item.data_saida ? (
                        <div>
                          <div className="font-medium text-slate-900 dark:text-slate-100">
                            {item.data_saida} às {item.hora_saida}
                          </div>
                          <div className="text-slate-500 dark:text-slate-400">Vig: {item.vigilante_saida}</div>
                        </div>
                      ) : (
                        <span className="text-amber-600 dark:text-amber-400 font-semibold flex items-center gap-1">
                          <Clock className="h-3 w-3" /> No pátio
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <StatusPortariaBadge status={item.status} />
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {item.excluido_em ? (
                          <RestaurarButton onClick={() => handleRestaurar(item)} />
                        ) : (
                        <>
                        {item.status !== 'FINALIZADO' && (
                          <button
                            type="button"
                            onClick={() => {
                              setItemSelecionado(item);
                              setModalSaidaAberto(true);
                            }}
                            className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:text-emerald-400"
                            title="Registrar saída e assinatura"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Liberar Saída
                          </button>
                        )}
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

      {/* Modal Nova Carreta */}
      {modalNovoAberto && (
        <Modal onClose={() => setModalNovoAberto(false)} maxWidth="max-w-4xl">
          <ModalHeader onClose={() => setModalNovoAberto(false)}>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100">
                Registrar Entrada de Carreta de Chapas
              </h3>
              <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">Formulário FRM.SGP-0020</p>
            </div>
          </ModalHeader>

          <form onSubmit={handleSalvarEntrada} className="flex flex-col flex-1 min-h-0 overflow-hidden">
            <ModalBody className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Empresa / Transportadora / Fornecedor de Aço *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Usiminas / ArcelorMittal / Transportadora Rodonaves"
                  value={formNovo.empresa}
                  onChange={(e) => setFormNovo({ ...formNovo, empresa: e.target.value.toUpperCase() })}
                  className="w-full uppercase rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 sm:py-2 text-base sm:text-sm text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Placa Cavalo *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: BRA2E19"
                    value={formNovo.placa_cavalo}
                    onChange={(e) => setFormNovo({ ...formNovo, placa_cavalo: e.target.value.toUpperCase() })}
                    className="w-full font-mono rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 sm:py-2 text-base sm:text-sm uppercase text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Placa Carreta / Semirreboque
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: XYZ9F88"
                    value={formNovo.placa_carreta}
                    onChange={(e) => setFormNovo({ ...formNovo, placa_carreta: e.target.value.toUpperCase() })}
                    className="w-full font-mono rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 sm:py-2 text-base sm:text-sm uppercase text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Nome do Motorista *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: José Carlos da Silva"
                    value={formNovo.nome_motorista}
                    onChange={(e) => setFormNovo({ ...formNovo, nome_motorista: e.target.value.toUpperCase() })}
                    className="w-full uppercase rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 sm:py-2 text-base sm:text-sm text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    CNH do Motorista
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: 01234567890"
                    value={formNovo.cnh_motorista}
                    onChange={(e) => setFormNovo({ ...formNovo, cnh_motorista: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 sm:py-2 text-base sm:text-sm text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Data de Entrada
                  </label>
                  <input
                    type="date"
                    value={formNovo.data_entrada}
                    onChange={(e) => setFormNovo({ ...formNovo, data_entrada: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 sm:py-2 text-base sm:text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Hora de Entrada
                  </label>
                  <input
                    type="time"
                    value={formNovo.hora_entrada}
                    onChange={(e) => setFormNovo({ ...formNovo, hora_entrada: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 sm:py-2 text-base sm:text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
                <div className="sm:col-span-1">
                  <VigilanteSelect
                    label="Vigilante Portaria"
                    required
                    value={formNovo.vigilante_entrada}
                    onChange={(val) => setFormNovo({ ...formNovo, vigilante_entrada: val })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Número da Nota Fiscal (NF)
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: NF 104.938"
                    value={formNovo.numero_nf}
                    onChange={(e) => setFormNovo({ ...formNovo, numero_nf: e.target.value.toUpperCase() })}
                    className="w-full uppercase rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 sm:py-2 text-base sm:text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Peso Bruto (kg)
                  </label>
                  <input
                    type="number"
                    placeholder="Ex: 38500"
                    value={formNovo.peso_bruto}
                    onChange={(e) => setFormNovo({ ...formNovo, peso_bruto: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 sm:py-2 text-base sm:text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
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

      {/* Modal Baixar Saída de Carreta */}
      {modalSaidaAberto && itemSelecionado && (
        <Modal onClose={() => setModalSaidaAberto(false)} maxWidth="max-w-2xl">
          <ModalHeader onClose={() => setModalSaidaAberto(false)}>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Liberar Saída de Carreta de Chapas
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                {itemSelecionado.empresa} · Cav: {itemSelecionado.placa_cavalo}
              </p>
            </div>
          </ModalHeader>

          <form onSubmit={handleSalvarSaida} className="flex flex-col flex-1 min-h-0 overflow-hidden">
            <ModalBody className="space-y-4">
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
                  label="Vigilante de Saída"
                  required
                  value={formSaida.vigilante_saida}
                  onChange={(val) => setFormSaida({ ...formSaida, vigilante_saida: val })}
                />
              </div>

              {/* Assinatura do Motorista */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Assinatura do Motorista (FRM.SGP-0020)
                </label>
                {formSaida.ass_motorista ? (
                  <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 dark:border-emerald-800 dark:bg-emerald-950/30">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                        Assinatura digital capturada
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setModalAssinaturaAberto(true)}
                      className="text-xs font-bold text-emerald-700 hover:underline dark:text-emerald-400"
                    >
                      Refazer
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setModalAssinaturaAberto(true)}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-3 text-xs font-semibold text-slate-700 hover:border-blue-400 hover:bg-blue-50/30 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
                  >
                    <PenTool className="h-4 w-4 text-slate-400" />
                    Coletar Assinatura do Motorista
                  </button>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Observações de Saída
                </label>
                <input
                  type="text"
                  placeholder="Ex: Descarregado e liberado pelo pátio de chapas"
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
                className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={salvando}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-50 dark:bg-emerald-500"
              >
                {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
                Confirmar Saída
              </button>
            </ModalFooter>
          </form>
        </Modal>
      )}

      {/* Assinatura Canvas Modal */}
      <SignaturePadModal
        isOpen={modalAssinaturaAberto}
        onClose={() => setModalAssinaturaAberto(false)}
        onSave={(dataUrl) => setFormSaida({ ...formSaida, ass_motorista: dataUrl })}
        title={`Assinatura: ${itemSelecionado?.nome_motorista || 'Motorista'}`}
        subtitle="Assinatura de saída de carreta de chapas (FRM.SGP-0020)"
      />

      {/* Confirm Dialog Excluir */}
      {itemParaExcluir && (
        <ConfirmDialog
          titulo="Excluir Registro de Carreta"
          mensagem={`Deseja excluir o registro da carreta ${itemParaExcluir.placa_cavalo} (${itemParaExcluir.empresa})?`}
          confirmarLabel="Sim, Excluir"
          variante="perigo"
          onConfirmar={handleExcluir}
          onCancelar={() => setItemParaExcluir(null)}
        />
      )}
    </div>
  );
}
