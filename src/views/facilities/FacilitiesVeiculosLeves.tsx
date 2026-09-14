/**
 * Cadastro de carros alugados usados pela Portaria no livro de ocorrências.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, Car, CheckCircle2, Edit2, Loader2, Plus, RefreshCw, Search,
  Trash2, XCircle,
} from 'lucide-react';
import type { FacVeiculoLeve, Profile } from '../../types';
import * as api from '../../lib/facilitiesApi';
import { normalizarModeloVeiculoLeve, normalizarPlacaVeiculoLeve, obterStatusLicenciamento } from '../../lib/veiculosLeves';
import { useToast } from '../../components/ui/Toast';
import Modal, { ModalBody, ModalFooter, ModalHeader } from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';

interface Props {
  user: Profile;
  onNavigate: (path: string) => void;
}

export default function FacilitiesVeiculosLeves({ user, onNavigate }: Props) {
  const toast = useToast();
  const [veiculos, setVeiculos] = useState<FacVeiculoLeve[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState<'TODOS' | 'ATIVOS' | 'INATIVOS'>('TODOS');
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<FacVeiculoLeve | null>(null);
  const [modelo, setModelo] = useState('');
  const [placa, setPlaca] = useState('');
  const [dataLicenciamento, setDataLicenciamento] = useState('');
  const [ativo, setAtivo] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState<FacVeiculoLeve | null>(null);

  const carregar = async () => {
    setLoading(true);
    try {
      setVeiculos(await api.listarVeiculosLeves());
    } catch (error) {
      toast.error(`Erro ao carregar veículos leves: ${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { carregar(); }, []);

  const abrirNovo = () => {
    setEditando(null);
    setModelo('');
    setPlaca('');
    setDataLicenciamento('');
    setAtivo(true);
    setModalAberto(true);
  };

  const abrirEdicao = (veiculo: FacVeiculoLeve) => {
    setEditando(veiculo);
    setModelo(veiculo.modelo);
    setPlaca(veiculo.placa);
    setDataLicenciamento(veiculo.data_licenciamento || '');
    setAtivo(veiculo.ativo);
    setModalAberto(true);
  };

  const salvar = async (event: React.FormEvent) => {
    event.preventDefault();
    const modeloNormalizado = normalizarModeloVeiculoLeve(modelo);
    const placaNormalizada = normalizarPlacaVeiculoLeve(placa);
    if (!modeloNormalizado || !placaNormalizada) {
      toast.warning('Informe o modelo e a placa do veículo.');
      return;
    }
    if (!dataLicenciamento) {
      toast.warning('Informe a data de licenciamento do veículo.');
      return;
    }
    if (placaNormalizada.length < 7) {
      toast.warning('Informe uma placa válida com 7 caracteres.');
      return;
    }

    const duplicada = veiculos.some((v) => v.id !== editando?.id && normalizarPlacaVeiculoLeve(v.placa) === placaNormalizada);
    if (duplicada) {
      toast.warning(`A placa ${placaNormalizada} já está cadastrada.`);
      return;
    }

    setSalvando(true);
    try {
      if (editando) {
        await api.atualizarVeiculoLeve(editando.id, { modelo: modeloNormalizado, placa: placaNormalizada, data_licenciamento: dataLicenciamento, ativo });
        toast.success('Veículo leve atualizado.');
      } else {
        await api.criarVeiculoLeve({ modelo: modeloNormalizado, placa: placaNormalizada, data_licenciamento: dataLicenciamento });
        toast.success('Veículo leve cadastrado.');
      }
      setModalAberto(false);
      await carregar();
    } catch (error) {
      toast.error(`Erro ao salvar veículo leve: ${(error as Error).message}`);
    } finally {
      setSalvando(false);
    }
  };

  const alternarAtivo = async (veiculo: FacVeiculoLeve) => {
    try {
      await api.atualizarVeiculoLeve(veiculo.id, { ativo: !veiculo.ativo });
      toast.success(`Veículo ${!veiculo.ativo ? 'ativado' : 'inativado'}.`);
      await carregar();
    } catch (error) {
      toast.error(`Erro ao alterar status: ${(error as Error).message}`);
    }
  };

  const confirmarExclusao = async () => {
    if (!excluindo) return;
    const veiculo = excluindo;
    try {
      await api.excluirVeiculoLeve(veiculo.id, user.id);
      setExcluindo(null);
      await carregar();
      toast.undo(`Veículo ${veiculo.placa} excluído.`, async () => {
        await api.restaurarVeiculoLeve(veiculo.id);
        await carregar();
        toast.success('Veículo restaurado.');
      }, 6000);
    } catch (error) {
      toast.error(`Erro ao excluir veículo: ${(error as Error).message}`);
    }
  };

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return veiculos.filter((veiculo) => {
      const matchBusca = !termo || veiculo.modelo.toLowerCase().includes(termo) || veiculo.placa.toLowerCase().includes(termo);
      const matchStatus = filtroStatus === 'TODOS' || (filtroStatus === 'ATIVOS' && veiculo.ativo) || (filtroStatus === 'INATIVOS' && !veiculo.ativo);
      return matchBusca && matchStatus;
    });
  }, [busca, filtroStatus, veiculos]);

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-12">
      <header>
        <button type="button" onClick={() => onNavigate('/facilities')} className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-teal-600">
          <ArrowLeft className="h-3.5 w-3.5" /> Voltar para Facilities
        </button>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-teal-600 text-white shadow-sm"><Car className="h-6 w-6" /></span>
            <div>
              <h1 className="font-display text-xl font-bold text-slate-900 sm:text-2xl dark:text-slate-50">Veículos leves</h1>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Cadastro dos carros alugados usados pela Portaria</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={carregar} disabled={loading} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Atualizar
            </button>
            <button type="button" onClick={abrirNovo} className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-500">
              <Plus className="h-4 w-4" /> Novo veículo
            </button>
          </div>
        </div>
      </header>

      <div className="rounded-2xl border border-teal-200 bg-teal-50/70 p-4 text-xs leading-relaxed text-teal-900 dark:border-teal-900/50 dark:bg-teal-950/30 dark:text-teal-200">
        Veículos ativos aparecem no tipo <strong>Veículo leve</strong> do formulário de ocorrências para registrar chegada, saída e condutor.
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por modelo ou placa..." className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-xs dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100" />
        </div>
        <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value as typeof filtroStatus)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100">
          <option value="TODOS">Todos</option><option value="ATIVOS">Ativos</option><option value="INATIVOS">Inativos</option>
        </select>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {loading ? <div className="flex items-center justify-center gap-2 p-10 text-xs text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Carregando...</div> : filtrados.length === 0 ? <div className="p-10 text-center text-xs text-slate-500">Nenhum veículo encontrado.</div> : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {filtrados.map((veiculo) => (
              <div key={veiculo.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                {(() => {
                  const licenciamento = obterStatusLicenciamento(veiculo.data_licenciamento);
                  const alerta = licenciamento.status === 'vencido'
                    ? { texto: 'Licenciamento vencido', classe: 'bg-rose-100 text-rose-700' }
                    : licenciamento.status === 'proximo'
                      ? { texto: licenciamento.diasRestantes === 0 ? 'Vence hoje' : `Vence em ${licenciamento.diasRestantes} dias`, classe: 'bg-amber-100 text-amber-800' }
                      : licenciamento.status === 'sem_data'
                        ? { texto: 'Sem data informada', classe: 'bg-slate-100 text-slate-600' }
                        : { texto: 'Licenciamento regular', classe: 'bg-emerald-100 text-emerald-700' };
                  return <>
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-100 text-teal-700 dark:bg-teal-950/60 dark:text-teal-400"><Car className="h-4 w-4" /></span>
                  <div><p className="text-sm font-bold text-slate-900 dark:text-slate-100">{veiculo.modelo}</p><p className="font-mono text-xs font-semibold text-slate-500">{veiculo.placa}</p><p className="text-[10px] text-slate-500">Licenciamento: {veiculo.data_licenciamento ? veiculo.data_licenciamento.split('-').reverse().join('/') : 'não informado'}</p></div>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${veiculo.ativo ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{veiculo.ativo ? 'Ativo' : 'Inativo'}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${alerta.classe}`} title={veiculo.data_licenciamento ? `Licenciamento: ${veiculo.data_licenciamento}` : undefined}>{alerta.texto}</span>
                </div>
                <div className="flex items-center gap-1 sm:justify-end">
                  <button type="button" onClick={() => alternarAtivo(veiculo)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-teal-600" title={veiculo.ativo ? 'Inativar' : 'Ativar'}>{veiculo.ativo ? <XCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}</button>
                  <button type="button" onClick={() => abrirEdicao(veiculo)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-teal-600" title="Editar"><Edit2 className="h-4 w-4" /></button>
                  <button type="button" onClick={() => setExcluindo(veiculo)} className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600" title="Excluir"><Trash2 className="h-4 w-4" /></button>
                </div>
                  </>;
                })()}
              </div>
            ))}
          </div>
        )}
      </div>

      {modalAberto && <Modal onClose={() => setModalAberto(false)} maxWidth="max-w-lg">
        <ModalHeader onClose={() => setModalAberto(false)}><h3 className="text-base font-bold text-slate-900 dark:text-slate-50">{editando ? 'Editar veículo leve' : 'Novo veículo leve'}</h3></ModalHeader>
        <form onSubmit={salvar}><ModalBody className="space-y-4">
          <div><label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">Modelo do carro *</label><input autoFocus required value={modelo} onChange={(e) => setModelo(e.target.value)} placeholder="EX.: TOYOTA COROLLA" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm uppercase dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" /></div>
          <div><label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">Placa *</label><input required value={placa} onChange={(e) => setPlaca(e.target.value.toUpperCase())} placeholder="EX.: ABC1D23" maxLength={8} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-mono text-sm uppercase dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" /></div>
          <div><label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">Data de licenciamento *</label><input required type="date" value={dataLicenciamento} onChange={(e) => setDataLicenciamento(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" /><p className="mt-1 text-[10px] text-slate-500">O sistema avisa quando faltar até 30 dias ou quando estiver vencido.</p></div>
          {editando && <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300"><input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} /> Veículo ativo no formulário de ocorrências</label>}
        </ModalBody><ModalFooter><button type="button" onClick={() => setModalAberto(false)} className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100">Cancelar</button><button type="submit" disabled={salvando} className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-5 py-2 text-xs font-bold text-white disabled:opacity-50">{salvando && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Salvar</button></ModalFooter></form>
      </Modal>}

      {excluindo && <ConfirmDialog titulo="Excluir veículo leve?" mensagem={`O veículo ${excluindo.modelo} (${excluindo.placa}) será retirado do cadastro. Os lançamentos antigos permanecem no histórico.`} confirmarLabel="Excluir" variante="perigo" onConfirmar={confirmarExclusao} onCancelar={() => setExcluindo(null)} />}
    </div>
  );
}
