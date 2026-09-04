/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Módulo RH — cadastro de setores (`rh_setores`).
 *
 * São os setores oferecidos no cabeçalho da ASE. Além de identificar quem pede
 * a hora extra, o nome vira a sigla do protocolo (`ASE-DDMMAA-SUPR`), então
 * renomear um setor muda o protocolo das ASEs criadas dali em diante.
 *
 * Setor com ASE vinculada não pode ser excluído — a API barra e sugere
 * inativar, que é o que preserva o histórico.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  Map, Plus, Search, Edit2, Trash2, RefreshCw, ArrowLeft, Loader2,
  CheckCircle2, XCircle,
} from 'lucide-react';
import type { Profile, RhSetor } from '../../types';
import * as api from '../../lib/rhApi';
import { useToast } from '../../components/ui/Toast';
import Modal, { ModalHeader, ModalBody, ModalFooter } from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';

interface Props {
  user: Profile;
  onNavigate: (path: string) => void;
}

export default function RhSetores({ onNavigate }: Props) {
  const toast = useToast();

  const [setores, setSetores] = useState<RhSetor[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [busca, setBusca] = useState('');

  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<RhSetor | null>(null);
  const [nome, setNome] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [paraExcluir, setParaExcluir] = useState<RhSetor | null>(null);
  const [excluindo, setExcluindo] = useState(false);

  const carregar = async () => {
    setCarregando(true);
    try {
      setSetores(await api.listarRhSetores());
    } catch (err: any) {
      toast.error('Erro ao carregar os setores: ' + (err.message || ''));
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => { carregar(); }, []);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return setores
      .filter(s => !q || s.nome.toLowerCase().includes(q))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [setores, busca]);

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim()) {
      toast.warning('Informe o nome do setor.');
      return;
    }
    setSalvando(true);
    try {
      if (editando) {
        await api.atualizarRhSetor(editando.id, { nome });
        toast.success('Setor atualizado.');
      } else {
        await api.criarRhSetor(nome);
        toast.success('Setor cadastrado.');
      }
      setModalAberto(false);
      await carregar();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar o setor.');
    } finally {
      setSalvando(false);
    }
  };

  const alternar = async (s: RhSetor) => {
    try {
      await api.alternarStatusRhSetor(s.id, !s.ativo);
      toast.success(`Setor ${s.nome} ${s.ativo ? 'inativado' : 'ativado'}.`);
      await carregar();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao alterar o status.');
    }
  };

  const excluir = async () => {
    if (!paraExcluir) return;
    setExcluindo(true);
    try {
      await api.excluirRhSetor(paraExcluir.id);
      toast.success(`Setor ${paraExcluir.nome} excluído.`);
      setParaExcluir(null);
      await carregar();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao excluir o setor.');
    } finally {
      setExcluindo(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-12">
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
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-600 text-white shadow-sm shadow-violet-500/20">
              <Map className="h-6 w-6" />
            </span>
            <div>
              <h1 className="font-display text-xl font-bold text-slate-900 sm:text-2xl dark:text-slate-50">Setores do RH</h1>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Opções do campo "Setor" na ASE e sigla do protocolo
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
              className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-xs font-semibold text-white hover:bg-violet-500 cursor-pointer"
            >
              <Plus className="h-4 w-4" /> Novo setor
            </button>
          </div>
        </div>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={busca}
          onChange={e => setBusca(e.target.value)}
          placeholder="Buscar setor..."
          className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-10 pr-4 text-sm text-slate-900 focus:border-violet-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
        />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {carregando ? (
          <div className="flex justify-center py-12 text-slate-400"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : filtrados.length === 0 ? (
          <p className="px-4 py-12 text-center text-sm text-slate-400">Nenhum setor cadastrado.</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {filtrados.map(s => (
              <li key={s.id} className="flex items-center gap-3 px-4 py-3">
                <span className="min-w-0 flex-1 truncate text-sm font-bold text-slate-900 dark:text-slate-50">{s.nome}</span>
                {!s.ativo && (
                  <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                    Inativo
                  </span>
                )}
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => alternar(s)}
                    title={s.ativo ? 'Inativar' : 'Ativar'}
                    className={`rounded-lg p-1.5 transition-colors cursor-pointer ${
                      s.ativo ? 'text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40' : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    {s.ativo ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setEditando(s); setNome(s.nome); setModalAberto(true); }}
                    title="Editar"
                    className="rounded-lg p-1.5 text-slate-500 hover:bg-violet-50 hover:text-violet-600 dark:hover:bg-violet-950/40 cursor-pointer"
                  >
                    <Edit2 className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setParaExcluir(s)}
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
        <Modal onClose={() => setModalAberto(false)} maxWidth="max-w-md" ariaLabel="Cadastro de setor">
          <ModalHeader onClose={() => setModalAberto(false)}>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-50">
              {editando ? 'Editar setor' : 'Novo setor'}
            </h3>
          </ModalHeader>
          <form onSubmit={salvar}>
            <ModalBody>
              <label htmlFor="setor-nome" className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Nome *</label>
              {/* eslint-disable-next-line jsx-a11y/no-autofocus -- modal aberto por clique explícito */}
              <input
                id="setor-nome"
                autoFocus
                value={nome}
                onChange={e => setNome(e.target.value.toUpperCase())}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-violet-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50"
              />
              {editando && (
                <p className="mt-2 text-[10px] leading-relaxed text-amber-600 dark:text-amber-400">
                  Renomear muda a sigla do protocolo das próximas ASEs deste setor. As já emitidas
                  mantêm o protocolo original.
                </p>
              )}
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
                className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2 text-xs font-bold text-white hover:bg-violet-500 disabled:opacity-50 cursor-pointer"
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
          titulo={`Excluir o setor ${paraExcluir.nome}?`}
          mensagem="Setor com ASE vinculada não pode ser excluído — nesse caso, inative-o para preservar o histórico."
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
