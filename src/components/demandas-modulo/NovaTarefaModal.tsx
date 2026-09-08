/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Criação rápida de uma tarefa a partir do quadro, da grade ou do calendário.
 */

import { useState } from 'react';
import { Loader2, Check, AlertTriangle } from 'lucide-react';
import Modal, { ModalHeader, ModalBody, ModalFooter } from '../ui/Modal';
import type { DemBucket, DemPrioridade, DemTarefa, Profile } from '../../types';
import { criarTarefa } from '../../lib/demandasApi';
import { PRIORIDADE_LABEL, PRIORIDADE_ORDER } from '../../lib/demandasQuadro';
import { inputClass, labelClass } from './shared';
import AssigneePicker from './AssigneePicker';

interface Props {
  quadroId: string;
  bucketId: string | null;
  buckets: DemBucket[];
  dataVencimento?: string;
  user: Profile;
  onClose: () => void;
  onCreated: (t: DemTarefa) => void;
}

export default function NovaTarefaModal({ quadroId, bucketId, buckets, dataVencimento, user, onClose, onCreated }: Props) {
  const [titulo, setTitulo] = useState('');
  const [bucket, setBucket] = useState(bucketId || '');
  const [responsaveis, setResponsaveis] = useState<string[]>([]);
  const [inicio, setInicio] = useState('');
  const [venc, setVenc] = useState(dataVencimento || '');
  const [prioridade, setPrioridade] = useState<DemPrioridade>('media');
  const [descricao, setDescricao] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSalvando(true); setErro('');
    try {
      const t = await criarTarefa({
        quadro_id: quadroId,
        bucket_id: bucket || null,
        titulo, descricao,
        responsaveis,
        data_inicio: inicio || null,
        data_vencimento: venc || null,
        prioridade,
      }, user);
      onCreated(t);
      onClose();
    } catch (err: any) {
      setErro(err?.message || 'Falha ao criar a tarefa.');
      setSalvando(false);
    }
  };

  return (
    <Modal onClose={onClose} ariaLabel="Nova tarefa" maxWidth="max-w-lg">
      <ModalHeader onClose={onClose}>
        <h2 className="text-base font-bold" style={{ color: 'var(--ink-primary)' }}>Nova tarefa</h2>
      </ModalHeader>
      <form onSubmit={submit} className="flex flex-col flex-1 min-h-0">
        <ModalBody className="space-y-4">
          <div className="space-y-1.5">
            <label className={labelClass}>Título *</label>
            <input autoFocus required value={titulo} onChange={e => setTitulo(e.target.value)} className={inputClass} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className={labelClass}>Coluna</label>
              <select value={bucket} onChange={e => setBucket(e.target.value)} className={`${inputClass} cursor-pointer`}>
                <option value="">Sem coluna</option>
                {buckets.map(b => <option key={b.id} value={b.id}>{b.nome}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className={labelClass}>Prioridade</label>
              <select value={prioridade} onChange={e => setPrioridade(e.target.value as DemPrioridade)} className={`${inputClass} cursor-pointer`}>
                {PRIORIDADE_ORDER.map(p => <option key={p} value={p}>{PRIORIDADE_LABEL[p]}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className={labelClass}>Início</label>
              <input type="date" value={inicio} onChange={e => setInicio(e.target.value)} className={`${inputClass} cursor-pointer`} />
            </div>
            <div className="space-y-1.5">
              <label className={labelClass}>Vencimento</label>
              <input type="date" value={venc} onChange={e => setVenc(e.target.value)} className={`${inputClass} cursor-pointer`} />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className={labelClass}>Responsáveis</label>
            <AssigneePicker selected={responsaveis} onChange={setResponsaveis} />
          </div>
          <div className="space-y-1.5">
            <label className={labelClass}>Descrição</label>
            <textarea rows={2} value={descricao} onChange={e => setDescricao(e.target.value)} className={`${inputClass} resize-none`} />
          </div>
          {erro && (
            <div className="flex items-start gap-2 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3.5 py-3 text-sm text-red-700 dark:text-red-300">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" /><span>{erro}</span>
            </div>
          )}
        </ModalBody>
        <ModalFooter>
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm font-semibold text-slate-600 dark:text-slate-300">Cancelar</button>
          <button type="submit" disabled={salvando || !titulo.trim()} className="flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50" style={{ background: 'var(--brand)' }}>
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Criar
          </button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
