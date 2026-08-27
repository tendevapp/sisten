/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Formulário "Registro de Chegada de Transportes" (FRM.SGP-0009).
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft, Plus, Search, FileDown, CheckCircle2,
  Trash2, X, Loader2, Bus, Car, Truck, Clock, Calendar, User
} from 'lucide-react';
import type { Profile, PortRegistroTransporte, PortTransporteStatus, PortTurno } from '../../types';
import * as api from '../../lib/portariaApi';
import { exportTransportesPdf } from '../../lib/pdfExport/exportPortariaPdf';
import StatusPortariaBadge from '../../components/portaria/StatusPortariaBadge';
import VigilanteSelect from '../../components/portaria/VigilanteSelect';
import { useToast } from '../../components/ui/Toast';
import ConfirmDialog from '../../components/ui/ConfirmDialog';

interface Props {
  user: Profile;
  onNavigate: (path: string) => void;
}

const TIPOS_VEICULO = ['Van', 'Carro', 'Ônibus', 'Caminhão', 'Caminhonete', 'Micro-ônibus', 'Outro'];

export default function PortariaTransportes({ user, onNavigate }: Props) {
  const toast = useToast();
  const [itens, setItens] = useState<PortRegistroTransporte[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroData, setFiltroData] = useState(api.hojeISO());
  const [filtroTurno, setFiltroTurno] = useState<PortTurno | 'TODOS'>('TODOS');
  const [filtroStatus, setFiltroStatus] = useState<PortTransporteStatus | 'TODOS'>('TODOS');
  const [termoBusca, setTermoBusca] = useState('');

  // Modais
  const [modalNovoAberto, setModalNovoAberto] = useState(false);
  const [itemParaExcluir, setItemParaExcluir] = useState<PortRegistroTransporte | null>(null);
  const [salvando, setSalvando] = useState(false);

  const [formNovo, setFormNovo] = useState({
    data: api.hojeISO(),
    turno: api.sugerirTurno(),
    vigilante: user.name || '',
    veiculo: 'Van',
    placa: '',
    empresa: '',
    hora_chegada: api.horaAgora(),
    motorista: '',
    ocupacao: '',
    observacoes: '',
  });

  const carregarDados = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.listarTransportes({
        data: filtroData || undefined,
        turno: filtroTurno,
        status: filtroStatus,
        termoBusca,
      });
      setItens(data);
    } catch (e) {
      toast.error(`Erro ao carregar transportes: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, [filtroData, filtroTurno, filtroStatus, termoBusca, toast]);

  useEffect(() => {
    carregarDados();
  }, [carregarDados]);

  const handleSalvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formNovo.placa.trim() || !formNovo.empresa.trim() || !formNovo.motorista.trim()) {
      toast.error('Preencha os campos obrigatórios: Placa, Empresa e Motorista.');
      return;
    }

    setSalvando(true);
    try {
      await api.criarTransporte({
        ...formNovo,
        criado_por: user.id,
      });
      toast.success('Chegada de transporte registrada!');
      setModalNovoAberto(false);
      setFormNovo({
        data: api.hojeISO(),
        turno: api.sugerirTurno(),
        vigilante: user.name || '',
        veiculo: 'Van',
        placa: '',
        empresa: '',
        hora_chegada: api.horaAgora(),
        motorista: '',
        ocupacao: '',
        observacoes: '',
      });
      carregarDados();
    } catch (e) {
      toast.error(`Falha ao salvar: ${(e as Error).message}`);
    } finally {
      setSalvando(false);
    }
  };

  const handleRegistrarSaida = async (item: PortRegistroTransporte) => {
    try {
      await api.registrarSaidaTransporte(item.id);
      toast.success(`Saída registrada para ${item.placa} (${item.empresa})!`);
      carregarDados();
    } catch (e) {
      toast.error(`Falha ao registrar saída: ${(e as Error).message}`);
    }
  };

  const handleExcluir = async () => {
    if (!itemParaExcluir) return;
    try {
      await api.excluirTransporte(itemParaExcluir.id);
      toast.success('Registro de transporte excluído.');
      setItemParaExcluir(null);
      carregarDados();
    } catch (e) {
      toast.error(`Erro ao excluir: ${(e as Error).message}`);
    }
  };

  const handleExportarRelatorio = () => {
    if (itens.length === 0) {
      toast.error('Nenhum transporte listado para exportar.');
      return;
    }
    exportTransportesPdf(filtroData || api.hojeISO(), filtroTurno, itens);
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <button
            type="button"
            onClick={() => onNavigate('/formularios')}
            className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-blue-600 dark:text-slate-400"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Voltar para Formulários
          </button>
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400">
              <Bus className="h-5 w-5" />
            </span>
            <div>
              <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-slate-50">
                Registro de Chegada de Transportes
              </h1>
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                FRM.SGP-0009 · Portaria TEN
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleExportarRelatorio}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <FileDown className="h-4 w-4 text-slate-500" />
            Exportar Folha (PDF)
          </button>

          <button
            type="button"
            onClick={() => setModalNovoAberto(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 dark:bg-blue-500 dark:hover:bg-blue-400"
          >
            <Plus className="h-4 w-4" />
            Lançar Chegada
          </button>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-4 dark:border-slate-800 dark:bg-slate-900">
        <div>
          <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">Data</label>
          <input
            type="date"
            value={filtroData}
            onChange={(e) => setFiltroData(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-1.5 text-xs text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950/50 dark:text-slate-100"
          />
        </div>

        <div>
          <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">Turno</label>
          <select
            value={filtroTurno}
            onChange={(e) => setFiltroTurno(e.target.value as any)}
            className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-1.5 text-xs text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950/50 dark:text-slate-100"
          >
            <option value="TODOS">Todos os Turnos</option>
            <option value="MANHA">Manhã</option>
            <option value="TARDE">Tarde</option>
            <option value="NOITE">Noite</option>
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">Status</label>
          <select
            value={filtroStatus}
            onChange={(e) => setFiltroStatus(e.target.value as any)}
            className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-1.5 text-xs text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950/50 dark:text-slate-100"
          >
            <option value="TODOS">Todos</option>
            <option value="NO_PATIO">No Pátio (Sem saída)</option>
            <option value="FINALIZADO">Finalizados (Com saída)</option>
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">Buscar</label>
          <div className="relative">
            <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Placa, empresa ou motorista..."
              value={termoBusca}
              onChange={(e) => setTermoBusca(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-8 pr-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950/50 dark:text-slate-100"
            />
          </div>
        </div>
      </div>

      {/* Table Content */}
      {loading ? (
        <div className="flex h-48 items-center justify-center rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
        </div>
      ) : itens.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white py-12 text-center dark:border-slate-800 dark:bg-slate-900">
          <Bus className="h-10 w-10 text-slate-300 dark:text-slate-600 mb-2" />
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Nenhum transporte registrado</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Utilize o botão &quot;Lançar Chegada&quot; para registrar novos veículos na portaria.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50/75 text-xs font-bold uppercase tracking-wider text-slate-600 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3.5">Veículo / Placa</th>
                  <th className="px-4 py-3.5">Empresa</th>
                  <th className="px-4 py-3.5">Chegada / Saída</th>
                  <th className="px-4 py-3.5">Motorista / Ocupação</th>
                  <th className="px-4 py-3.5">Turno / Vigilante</th>
                  <th className="px-4 py-3.5 text-center">Status</th>
                  <th className="px-4 py-3.5 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                {itens.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100">
                          {item.placa}
                        </span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          {item.veiculo}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 font-medium text-slate-900 dark:text-slate-100">
                      {item.empresa}
                    </td>
                    <td className="px-4 py-3.5 text-xs">
                      <div className="flex items-center gap-1 font-semibold text-slate-900 dark:text-slate-200">
                        <Clock className="h-3 w-3 text-emerald-500" />
                        Chegada: {item.hora_chegada}
                      </div>
                      <div className="text-slate-500 dark:text-slate-400 mt-0.5">
                        Saída: {item.hora_saida ? <span className="font-semibold text-slate-800 dark:text-slate-200">{item.hora_saida}</span> : <span className="text-amber-600 dark:text-amber-400 font-medium">No pátio</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-xs">
                      <div className="font-semibold text-slate-900 dark:text-slate-100">{item.motorista}</div>
                      {item.ocupacao && (
                        <div className="text-slate-500 dark:text-slate-400">{item.ocupacao}</div>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-xs">
                      <div><span className="font-semibold">{item.turno}</span></div>
                      <div className="text-slate-500 dark:text-slate-400">{item.vigilante}</div>
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <StatusPortariaBadge status={item.status} />
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {item.status === 'NO_PATIO' && (
                          <button
                            type="button"
                            onClick={() => handleRegistrarSaida(item)}
                            className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:text-emerald-400"
                            title="Marcar saída agora"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Marcar Saída
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
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Novo Lançamento */}
      {modalNovoAberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 dark:border-slate-800">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                  Lançar Chegada de Transporte
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">Formulário FRM.SGP-0009</p>
              </div>
              <button
                type="button"
                onClick={() => setModalNovoAberto(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSalvar} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Tipo de Veículo *
                  </label>
                  <select
                    value={formNovo.veiculo}
                    onChange={(e) => setFormNovo({ ...formNovo, veiculo: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  >
                    {TIPOS_VEICULO.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Placa do Veículo *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: ABC1D23"
                    value={formNovo.placa}
                    onChange={(e) => setFormNovo({ ...formNovo, placa: e.target.value.toUpperCase() })}
                    className="w-full font-mono rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm uppercase text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Empresa *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Transportes São Geraldo"
                    value={formNovo.empresa}
                    onChange={(e) => setFormNovo({ ...formNovo, empresa: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Nome do Motorista *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Nome completo do motorista"
                    value={formNovo.motorista}
                    onChange={(e) => setFormNovo({ ...formNovo, motorista: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Data
                  </label>
                  <input
                    type="date"
                    value={formNovo.data}
                    onChange={(e) => setFormNovo({ ...formNovo, data: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Horário Chegada
                  </label>
                  <input
                    type="time"
                    value={formNovo.hora_chegada}
                    onChange={(e) => setFormNovo({ ...formNovo, hora_chegada: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Turno
                  </label>
                  <select
                    value={formNovo.turno}
                    onChange={(e) => setFormNovo({ ...formNovo, turno: e.target.value as any })}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  >
                    <option value="MANHA">Manhã</option>
                    <option value="TARDE">Tarde</option>
                    <option value="NOITE">Noite</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Ocupação / Motivo (Opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Entrega de suprimentos / 4 passageiros"
                    value={formNovo.ocupacao}
                    onChange={(e) => setFormNovo({ ...formNovo, ocupacao: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
                <div>
                  <VigilanteSelect
                    label="Vigilante Portaria"
                    required
                    value={formNovo.vigilante}
                    onChange={(val) => setFormNovo({ ...formNovo, vigilante: val })}
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3">
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
                  Salvar Chegada
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm Dialog Excluir */}
      {itemParaExcluir && (
        <ConfirmDialog
          titulo="Excluir Registro de Transporte"
          mensagem={`Deseja excluir o registro do veículo placa ${itemParaExcluir.placa} (${itemParaExcluir.empresa})?`}
          confirmarLabel="Sim, Excluir"
          variante="perigo"
          onConfirmar={handleExcluir}
          onCancelar={() => setItemParaExcluir(null)}
        />
      )}
    </div>
  );
}
