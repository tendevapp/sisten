/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Módulo RH — calendário de percentual de hora extra (`rh_hora_extra`).
 *
 * A ASE sugere o %HE de cada colaborador a partir da data do expediente. Só
 * datas fora do padrão precisam estar aqui — feriado, ponto facultativo,
 * acordo específico. Sem registro para a data, a ASE aplica o padrão do dia da
 * semana: domingo 100%, sábado 80%, segunda a sexta 60%
 * (ver `buscarPercentualHE` em lib/rhApi.ts).
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Percent, Plus, Edit2, Trash2, RefreshCw, ArrowLeft, Loader2, CalendarDays } from 'lucide-react';
import type { Profile, RhHoraExtra } from '../../types';
import * as api from '../../lib/rhApi';
import { useToast } from '../../components/ui/Toast';
import Modal, { ModalHeader, ModalBody, ModalFooter } from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';

interface Props {
  user: Profile;
  onNavigate: (path: string) => void;
}

const formatarData = (diaISO: string) => {
  // Fatia a string: `new Date('2026-09-06')` é meia-noite UTC e volta como 05/09
  // em UTC-3, trocando o dia da semana mostrado ao lado.
  const [a, m, d] = diaISO.split('-');
  return `${d}/${m}/${a}`;
};

export default function RhPercentualHE({ onNavigate }: Props) {
  const toast = useToast();

  const [registros, setRegistros] = useState<RhHoraExtra[]>([]);
  const [carregando, setCarregando] = useState(false);

  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<RhHoraExtra | null>(null);
  const [dia, setDia] = useState('');
  const [percentual, setPercentual] = useState('60');
  const [salvando, setSalvando] = useState(false);
  const [paraExcluir, setParaExcluir] = useState<RhHoraExtra | null>(null);
  const [excluindo, setExcluindo] = useState(false);

  const carregar = async () => {
    setCarregando(true);
    try {
      setRegistros(await api.listarRhHoraExtra());
    } catch (err: any) {
      toast.error('Erro ao carregar o calendário: ' + (err.message || ''));
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => { carregar(); }, []);

  const ordenados = useMemo(
    () => [...registros].sort((a, b) => b.dia.localeCompare(a.dia)),
    [registros],
  );

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    const valor = Number(percentual);
    if (!editando && !dia) {
      toast.warning('Informe a data.');
      return;
    }
    if (!Number.isFinite(valor) || valor < 0) {
      toast.warning('Informe um percentual válido.');
      return;
    }
    setSalvando(true);
    try {
      if (editando) {
        await api.atualizarRhHoraExtra(editando.id, valor);
        toast.success('Percentual atualizado.');
      } else {
        await api.criarRhHoraExtra(dia, valor);
        toast.success('Percentual cadastrado.');
      }
      setModalAberto(false);
      await carregar();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar o percentual.');
    } finally {
      setSalvando(false);
    }
  };

  const excluir = async () => {
    if (!paraExcluir) return;
    setExcluindo(true);
    try {
      await api.excluirRhHoraExtra(paraExcluir.id);
      toast.success(`Percentual de ${formatarData(paraExcluir.dia)} excluído.`);
      setParaExcluir(null);
      await carregar();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao excluir.');
    } finally {
      setExcluindo(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-12">
      <div>
        <button
          type="button"
          onClick={() => onNavigate('/rh')}
          className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-blue-600 dark:text-slate-400 cursor-pointer"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Voltar para RH
        </button>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-rose-600 text-white shadow-sm shadow-rose-500/20">
              <Percent className="h-6 w-6" />
            </span>
            <div>
              <h1 className="font-display text-xl font-bold text-slate-900 sm:text-2xl dark:text-slate-50">
                Percentual de Hora Extra
              </h1>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Datas com percentual diferente do padrão
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={carregar}
              disabled={carregando}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 cursor-pointer"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${carregando ? 'animate-spin' : ''}`} /> Atualizar
            </button>
            <button
              type="button"
              onClick={() => { setEditando(null); setDia(''); setPercentual('60'); setModalAberto(true); }}
              className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-500 cursor-pointer"
            >
              <Plus className="h-4 w-4" /> Nova data
            </button>
          </div>
        </div>
      </div>

      <div className="flex items-start gap-2.5 rounded-2xl border border-rose-200 bg-rose-50/70 p-3.5 text-xs leading-relaxed text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/25 dark:text-rose-200">
        <CalendarDays className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Cadastre aqui só as <strong>exceções</strong>. Quando a data do expediente não está nesta
          lista, a ASE sugere o padrão do dia da semana: <strong>domingo 100%</strong>,
          <strong> sábado 80%</strong> e <strong>segunda a sexta 60%</strong>. O valor sugerido
          continua editável linha a linha na ASE.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {carregando ? (
          <div className="flex justify-center py-12 text-slate-400"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : ordenados.length === 0 ? (
          <p className="px-4 py-12 text-center text-sm text-slate-400">
            Nenhuma data cadastrada — todas seguem o padrão do dia da semana.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {ordenados.map(r => (
              <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <span className="text-sm font-bold text-slate-900 dark:text-slate-50">{formatarData(r.dia)}</span>
                  <span className="ml-2 text-[11px] capitalize text-slate-500 dark:text-slate-400">
                    {api.diaDaSemana(r.dia)}
                  </span>
                </div>
                <span className="shrink-0 rounded-lg bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">
                  {r.percentual_he}%
                </span>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setEditando(r);
                      setDia(r.dia);
                      setPercentual(String(r.percentual_he));
                      setModalAberto(true);
                    }}
                    title="Editar"
                    className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 cursor-pointer"
                  >
                    <Edit2 className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setParaExcluir(r)}
                    title="Excluir"
                    className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 cursor-pointer"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {modalAberto && (
        <Modal onClose={() => setModalAberto(false)} maxWidth="max-w-md" ariaLabel="Percentual de hora extra">
          <ModalHeader onClose={() => setModalAberto(false)}>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-50">
              {editando ? `Percentual de ${formatarData(editando.dia)}` : 'Nova data'}
            </h3>
          </ModalHeader>
          <form onSubmit={salvar}>
            <ModalBody className="space-y-3">
              <div>
                <label htmlFor="he-dia" className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Data *</label>
                <input
                  id="he-dia"
                  type="date"
                  value={dia}
                  // A data é a chave do registro: mudá-la seria criar outro dia,
                  // não corrigir este.
                  disabled={Boolean(editando)}
                  onChange={e => setDia(e.target.value)}
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-rose-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50"
                />
              </div>
              <div>
                <label htmlFor="he-percentual" className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Percentual (%) *</label>
                <input
                  id="he-percentual"
                  type="number"
                  min={0}
                  max={999}
                  step={1}
                  value={percentual}
                  onChange={e => setPercentual(e.target.value)}
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-rose-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50"
                />
              </div>
            </ModalBody>
            <ModalFooter>
              <button
                type="button"
                onClick={() => setModalAberto(false)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={salvando}
                className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-500 disabled:opacity-50 cursor-pointer"
              >
                {salvando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Salvar
              </button>
            </ModalFooter>
          </form>
        </Modal>
      )}

      {paraExcluir && (
        <ConfirmDialog
          titulo={`Excluir o percentual de ${formatarData(paraExcluir.dia)}?`}
          mensagem="A data volta a seguir o padrão do dia da semana. As ASEs já preenchidas mantêm o percentual gravado em cada linha."
          confirmarLabel="Excluir"
          cancelarLabel="Cancelar"
          variante="perigo"
          confirmando={excluindo}
          onConfirmar={excluir}
          onCancelar={() => setParaExcluir(null)}
        />
      )}
    </div>
  );
}
