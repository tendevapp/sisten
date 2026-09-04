/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Módulo RH — cadastro de turnos (`rh_turnos`).
 *
 * São as opções do campo "Turno" da ASE. A tabela guarda só o nome: a faixa de
 * horário, quando importa, vai escrita nele mesmo ("2º TURNO 15:00-23:00"),
 * que é como o RH escreve na autorização.
 *
 * Turno não tem coluna de ativo/inativo — ou existe, ou não. Por isso a
 * exclusão é barrada quando há ASE vinculada.
 */

import React, { useEffect, useState } from 'react';
import { Clock, Plus, Edit2, Trash2, RefreshCw, ArrowLeft, Loader2 } from 'lucide-react';
import type { Profile, RhTurno } from '../../types';
import * as api from '../../lib/rhApi';
import { useToast } from '../../components/ui/Toast';
import Modal, { ModalHeader, ModalBody, ModalFooter } from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';

interface Props {
  user: Profile;
  onNavigate: (path: string) => void;
}

export default function RhTurnos({ onNavigate }: Props) {
  const toast = useToast();

  const [turnos, setTurnos] = useState<RhTurno[]>([]);
  const [carregando, setCarregando] = useState(false);

  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<RhTurno | null>(null);
  const [nome, setNome] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [paraExcluir, setParaExcluir] = useState<RhTurno | null>(null);
  const [excluindo, setExcluindo] = useState(false);

  const carregar = async () => {
    setCarregando(true);
    try {
      setTurnos(await api.listarRhTurnos());
    } catch (err: any) {
      toast.error('Erro ao carregar os turnos: ' + (err.message || ''));
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => { carregar(); }, []);

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim()) {
      toast.warning('Informe o nome do turno.');
      return;
    }
    setSalvando(true);
    try {
      if (editando) {
        await api.atualizarRhTurno(editando.id, nome);
        toast.success('Turno atualizado.');
      } else {
        await api.criarRhTurno(nome);
        toast.success('Turno cadastrado.');
      }
      setModalAberto(false);
      await carregar();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar o turno.');
    } finally {
      setSalvando(false);
    }
  };

  const excluir = async () => {
    if (!paraExcluir) return;
    setExcluindo(true);
    try {
      await api.excluirRhTurno(paraExcluir.id);
      toast.success(`Turno ${paraExcluir.nome} excluído.`);
      setParaExcluir(null);
      await carregar();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao excluir o turno.');
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
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-500 text-white shadow-sm shadow-amber-500/20">
              <Clock className="h-6 w-6" />
            </span>
            <div>
              <h1 className="font-display text-xl font-bold text-slate-900 sm:text-2xl dark:text-slate-50">Turnos</h1>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Opções do campo "Turno" na ASE
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
              onClick={() => { setEditando(null); setNome(''); setModalAberto(true); }}
              className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-400 cursor-pointer"
            >
              <Plus className="h-4 w-4" /> Novo turno
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {carregando ? (
          <div className="flex justify-center py-12 text-slate-400"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : turnos.length === 0 ? (
          <p className="px-4 py-12 text-center text-sm text-slate-400">Nenhum turno cadastrado.</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {turnos.map(t => (
              <li key={t.id} className="flex items-center gap-3 px-4 py-3">
                <span className="min-w-0 flex-1 truncate text-sm font-bold text-slate-900 dark:text-slate-50">{t.nome}</span>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => { setEditando(t); setNome(t.nome); setModalAberto(true); }}
                    title="Editar"
                    className="rounded-lg p-1.5 text-slate-500 hover:bg-amber-50 hover:text-amber-600 dark:hover:bg-amber-950/40 cursor-pointer"
                  >
                    <Edit2 className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setParaExcluir(t)}
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
        <Modal onClose={() => setModalAberto(false)} maxWidth="max-w-md" ariaLabel="Cadastro de turno">
          <ModalHeader onClose={() => setModalAberto(false)}>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-50">
              {editando ? 'Editar turno' : 'Novo turno'}
            </h3>
          </ModalHeader>
          <form onSubmit={salvar}>
            <ModalBody>
              <label htmlFor="turno-nome" className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Nome *</label>
              {/* eslint-disable-next-line jsx-a11y/no-autofocus -- modal aberto por clique explícito */}
              <input
                id="turno-nome"
                autoFocus
                value={nome}
                onChange={e => setNome(e.target.value.toUpperCase())}
                placeholder="Ex.: 2º TURNO 15:00-23:00"
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-amber-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50"
              />
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
                className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-white hover:bg-amber-400 disabled:opacity-50 cursor-pointer"
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
          titulo={`Excluir o turno ${paraExcluir.nome}?`}
          mensagem="Turno usado em alguma ASE não pode ser excluído, para não quebrar o histórico das autorizações já emitidas."
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
