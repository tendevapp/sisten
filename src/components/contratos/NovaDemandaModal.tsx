/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Criação rápida de uma demanda jurídica direto do quadro Kanban — os mesmos
 * campos do canal "Chamado > Jurídico" em Nova Solicitação, resumidos para
 * caber num modal. A demanda sempre nasce em "Aberto" (mesma regra do motor
 * de solicitações) e, se a coluna escolhida for outra, é movida em seguida.
 */

import React, { useState } from 'react';
import { Loader2, Check, AlertTriangle } from 'lucide-react';
import { localDb } from '../../db/localDb';
import { Profile, RequestStatus } from '../../types';
import { TIPOS_CHAMADO_JURIDICO, findJuridicoSector } from '../../lib/juridico';
import { PRIORIDADE_LABEL } from '../../lib/kanban';
import Modal, { ModalHeader, ModalBody, ModalFooter } from '../ui/Modal';

interface NovaDemandaModalProps {
  user: Profile;
  juridicoSectorId: string;
  statusInicial: RequestStatus;
  statusLabel: string;
  onClose: () => void;
  onCreated: () => void;
}

const inputClass = 'w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-55 dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all';
const labelClass = 'text-sm font-semibold text-slate-700 dark:text-slate-300';

export default function NovaDemandaModal({ user, juridicoSectorId, statusInicial, statusLabel, onClose, onCreated }: NovaDemandaModalProps) {
  const [titulo, setTitulo] = useState('');
  const [categoria, setCategoria] = useState<string>(TIPOS_CHAMADO_JURIDICO[0]);
  const [criticality, setCriticality] = useState(3);
  const [prazo, setPrazo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const targetSecId = juridicoSectorId || findJuridicoSector(localDb.getSectors())?.id;

      const req = await localDb.submitRequest({
        type: 'chamado',
        criticality,
        solicitante_sector_id: user.sector_id,
        target_sector_id: targetSecId,
        category_id: categoria,
        titulo: titulo.trim(),
        justificativa: descricao.trim() || titulo.trim(),
        ...(prazo && { prazo_conclusao: prazo }),
      }, false);

      if (statusInicial !== 'aberto') {
        await localDb.updateRequestStatus(req.id, statusInicial, user.id, `Criada diretamente na coluna "${statusLabel}".`);
      }

      onCreated();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Erro ao criar a demanda.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal onClose={onClose} ariaLabel="Nova Demanda Jurídica" maxWidth="max-w-lg">
      <ModalHeader onClose={onClose}>
        <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">Nova Demanda</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">Entra na coluna "{statusLabel}"</p>
      </ModalHeader>

      <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
        <ModalBody className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="nd_titulo" className={labelClass}>Título *</label>
            <input id="nd_titulo" type="text" required autoFocus value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Ex.: Análise de minuta - fornecimento de EPIs" className={inputClass} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="nd_categoria" className={labelClass}>Tipo de chamado *</label>
              <select id="nd_categoria" value={categoria} onChange={e => setCategoria(e.target.value)} required className={`${inputClass} appearance-none cursor-pointer`}>
                {TIPOS_CHAMADO_JURIDICO.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="nd_prioridade" className={labelClass}>Prioridade *</label>
              <select id="nd_prioridade" value={criticality} onChange={e => setCriticality(Number(e.target.value))} required className={`${inputClass} appearance-none cursor-pointer`}>
                {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{PRIORIDADE_LABEL[n]}</option>)}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="nd_prazo" className={labelClass}>Prazo de conclusão (opcional)</label>
            <input id="nd_prazo" type="date" value={prazo} onChange={e => setPrazo(e.target.value)} className={`${inputClass} cursor-pointer`} />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="nd_descricao" className={labelClass}>Descrição (opcional)</label>
            <textarea id="nd_descricao" rows={3} value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Contexto, urgência, cláusulas sensíveis e resultado esperado" className={`${inputClass} resize-none`} />
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3.5 py-3 text-sm text-red-700 dark:text-red-300">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </ModalBody>

        <ModalFooter>
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
            Cancelar
          </button>
          <button type="submit" disabled={saving || !titulo.trim()} className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2.5 text-sm font-semibold text-white transition-colors shadow-sm">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {saving ? 'Criando...' : 'Criar demanda'}
          </button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
