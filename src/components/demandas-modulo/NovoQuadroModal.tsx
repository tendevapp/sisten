/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Criação de um quadro. O setor define quem enxerga o quadro por padrão.
 */

import { useState } from 'react';
import { Loader2, Check, AlertTriangle } from 'lucide-react';
import Modal, { ModalHeader, ModalBody, ModalFooter } from '../ui/Modal';
import type { DemQuadro, Profile, Sector } from '../../types';
import { criarQuadro } from '../../lib/demandasApi';
import { inputClass, labelClass } from './shared';

export const CORES_QUADRO: { id: string; hex: string; nome: string }[] = [
  { id: 'brand', hex: 'var(--brand)', nome: 'Padrão' },
  { id: 'amber', hex: '#f59e0b', nome: 'Âmbar' },
  { id: 'emerald', hex: '#10b981', nome: 'Verde' },
  { id: 'sky', hex: '#0ea5e9', nome: 'Azul' },
  { id: 'violet', hex: '#8b5cf6', nome: 'Roxo' },
  { id: 'rose', hex: '#f43f5e', nome: 'Rosa' },
];

interface Props {
  user: Profile;
  setores: Sector[];
  onClose: () => void;
  onCreated: (q: DemQuadro) => void;
}

export default function NovoQuadroModal({ user, setores, onClose, onCreated }: Props) {
  const [nome, setNome] = useState('');
  const [descricao, setDescricao] = useState('');
  const [setorId, setSetorId] = useState(setores.find(s => s.id === user.sector_id)?.id || setores[0]?.id || '');
  const [cor, setCor] = useState('brand');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!setorId) { setErro('Escolha um setor.'); return; }
    setSalvando(true); setErro('');
    try {
      const q = await criarQuadro({ nome, descricao, setor_id: setorId, cor }, user);
      onCreated(q);
      onClose();
    } catch (err: any) {
      setErro(err?.message || 'Falha ao criar o quadro.');
      setSalvando(false);
    }
  };

  return (
    <Modal onClose={onClose} ariaLabel="Novo quadro" maxWidth="max-w-lg">
      <ModalHeader onClose={onClose}>
        <h2 className="text-base font-bold" style={{ color: 'var(--ink-primary)' }}>Novo quadro</h2>
      </ModalHeader>
      <form onSubmit={submit} className="flex flex-col flex-1 min-h-0">
        <ModalBody className="space-y-4">
          <div className="space-y-1.5">
            <label className={labelClass}>Nome *</label>
            <input autoFocus required value={nome} onChange={e => setNome(e.target.value)} className={inputClass} placeholder="Ex.: Contratos de Serviço" />
          </div>
          <div className="space-y-1.5">
            <label className={labelClass}>Setor *</label>
            <select value={setorId} onChange={e => setSetorId(e.target.value)} className={`${inputClass} cursor-pointer`}>
              {setores.length === 0 && <option value="">Nenhum setor disponível</option>}
              {setores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>
              Todo mundo do setor vê o quadro. Você pode compartilhar com pessoas de fora depois.
            </p>
          </div>
          <div className="space-y-1.5">
            <label className={labelClass}>Descrição</label>
            <textarea rows={2} value={descricao} onChange={e => setDescricao(e.target.value)} className={`${inputClass} resize-none`} />
          </div>
          <div className="space-y-1.5">
            <label className={labelClass}>Cor</label>
            <div className="flex flex-wrap gap-2">
              {CORES_QUADRO.map(c => (
                <button
                  key={c.id} type="button" onClick={() => setCor(c.id)}
                  className={`h-7 w-7 rounded-full border-2 transition-transform ${cor === c.id ? 'scale-110' : 'border-transparent'}`}
                  style={{ background: c.hex, borderColor: cor === c.id ? 'var(--ink-primary)' : 'transparent' }}
                  title={c.nome}
                />
              ))}
            </div>
          </div>
          {erro && (
            <div className="flex items-start gap-2 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3.5 py-3 text-sm text-red-700 dark:text-red-300">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" /><span>{erro}</span>
            </div>
          )}
        </ModalBody>
        <ModalFooter>
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm font-semibold text-slate-600 dark:text-slate-300">Cancelar</button>
          <button type="submit" disabled={salvando || !nome.trim()} className="flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50" style={{ background: 'var(--brand)' }}>
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Criar quadro
          </button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
