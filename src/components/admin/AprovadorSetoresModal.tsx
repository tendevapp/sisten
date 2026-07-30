/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { localDb } from '../../db/localDb';
import { Profile, Sector } from '../../types';
import Modal, { ModalHeader, ModalBody, ModalFooter } from '../ui/Modal';
import { useToast } from '../ui/Toast';

interface AprovadorSetoresModalProps {
  user: Profile;
  sectors: Sector[];
  onClose: () => void;
  /** Chamado após qualquer alteração, para o AdminPanel atualizar a lista de perfis. */
  onChanged: () => void;
}

export default function AprovadorSetoresModal({ user, sectors, onClose, onChanged }: AprovadorSetoresModalProps) {
  const toast = useToast();
  const [selected, setSelected] = useState<string[]>(user.aprovador_setores || []);
  const [cadastroSap, setCadastroSap] = useState<boolean>(!!user.aprovador_cadastro_sap);
  const [saving, setSaving] = useState(false);

  const handleToggle = async (sectorId: string, checked: boolean) => {
    const next = checked
      ? [...selected, sectorId]
      : selected.filter(id => id !== sectorId);
    setSelected(next);
    setSaving(true);
    try {
      localDb.updateUserAprovadorSetores(user.id, next);
      onChanged();
    } catch (e) {
      console.error('Falha ao atualizar setores de aprovação:', e);
      toast.error('Não foi possível salvar. Tente novamente.');
      setSelected(selected);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleCadastroSap = async (checked: boolean) => {
    setCadastroSap(checked);
    setSaving(true);
    try {
      localDb.updateUserAprovadorCadastroSap(user.id, checked);
      onChanged();
    } catch (e) {
      console.error('Falha ao atualizar aprovador de Cadastro SAP:', e);
      toast.error('Não foi possível salvar. Tente novamente.');
      setCadastroSap(!checked);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal onClose={onClose} maxWidth="max-w-xl" ariaLabel={`Aprovador — ${user.name}`}>
      <ModalHeader onClose={onClose}>
        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Aprovador</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{user.name} · {user.email}</p>
      </ModalHeader>
      <ModalBody>
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer py-1.5 mb-3 pb-3 border-b border-slate-100 dark:border-slate-800">
          <input
            type="checkbox"
            checked={cadastroSap}
            disabled={saving}
            onChange={(e) => handleToggleCadastroSap(e.target.checked)}
            className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 h-3.5 w-3.5 shrink-0 disabled:opacity-40"
          />
          <span>Também aprovador de Cadastro SAP</span>
        </label>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
          Marque os setores solicitantes cujas solicitações de compra este usuário poderá ver e aprovar em "Aprovações".
        </p>
        <div className="space-y-1">
          {sectors.map(sector => (
            <label
              key={sector.id}
              className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer py-1"
            >
              <input
                type="checkbox"
                checked={selected.includes(sector.id)}
                disabled={saving}
                onChange={(e) => handleToggle(sector.id, e.target.checked)}
                className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 h-3.5 w-3.5 shrink-0 disabled:opacity-40"
              />
              <span className="truncate">{sector.name}</span>
            </label>
          ))}
        </div>
      </ModalBody>
      <ModalFooter>
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 rounded-lg bg-slate-800 dark:bg-slate-700 text-white text-xs font-bold hover:bg-slate-900 dark:hover:bg-slate-600"
        >
          Fechar
        </button>
      </ModalFooter>
    </Modal>
  );
}
