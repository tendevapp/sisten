/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Configuração de um quadro: nome, cor, arquivar, compartilhar com pessoas de
 * fora do setor e excluir.
 */

import { useState } from 'react';
import { Loader2, Check, AlertTriangle, Trash2, Archive } from 'lucide-react';
import Modal, { ModalHeader, ModalBody, ModalFooter } from '../ui/Modal';
import type { DemQuadro, Profile } from '../../types';
import { atualizarQuadro, excluirQuadro } from '../../lib/demandasApi';
import { inputClass, labelClass } from './shared';
import AssigneePicker from './AssigneePicker';
import { CORES_QUADRO } from './NovoQuadroModal';

interface Props {
  quadro: DemQuadro;
  user: Profile;
  onClose: () => void;
  onSaved: (q: DemQuadro) => void;
  onDeleted: (id: string) => void;
}

export default function QuadroConfigModal({ quadro, user, onClose, onSaved, onDeleted }: Props) {
  const [nome, setNome] = useState(quadro.nome);
  const [descricao, setDescricao] = useState(quadro.descricao || '');
  const [cor, setCor] = useState(quadro.cor || 'brand');
  const [membros, setMembros] = useState<string[]>(quadro.membros_extra);
  const [arquivado, setArquivado] = useState(quadro.arquivado);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [confirmar, setConfirmar] = useState(false);

  const salvar = async () => {
    setSalvando(true); setErro('');
    try {
      await atualizarQuadro(
        quadro.id,
        { nome, descricao, cor, membros_extra: membros, arquivado },
        { quadroAnterior: quadro, autor: user },
      );
      onSaved({ ...quadro, nome: nome.trim(), descricao, cor, membros_extra: membros, arquivado });
      onClose();
    } catch (e: any) {
      setErro(e?.message || 'Falha ao salvar.');
      setSalvando(false);
    }
  };

  const excluir = async () => {
    setSalvando(true);
    try { await excluirQuadro(quadro.id, user); onDeleted(quadro.id); }
    catch (e: any) { setErro(e?.message || 'Falha ao excluir.'); setSalvando(false); }
  };

  return (
    <Modal onClose={onClose} ariaLabel="Configurar quadro" maxWidth="max-w-lg">
      <ModalHeader onClose={onClose}>
        <h2 className="text-base font-bold" style={{ color: 'var(--ink-primary)' }}>Configurar quadro</h2>
      </ModalHeader>
      <ModalBody className="space-y-4">
        <div className="space-y-1.5">
          <label className={labelClass}>Nome</label>
          <input value={nome} onChange={e => setNome(e.target.value)} className={inputClass} />
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
        <div className="space-y-1.5">
          <label className={labelClass}>Compartilhar com pessoas de fora do setor</label>
          <AssigneePicker selected={membros} onChange={setMembros} placeholder="Adicionar pessoa (@)" />
        </div>
        <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--ink-secondary)' }}>
          <input type="checkbox" checked={arquivado} onChange={e => setArquivado(e.target.checked)} className="rounded" />
          <Archive className="h-4 w-4" /> Arquivar quadro (some da lista, sem apagar)
        </label>
        {erro && (
          <div className="flex items-start gap-2 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3.5 py-3 text-sm text-red-700 dark:text-red-300">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" /><span>{erro}</span>
          </div>
        )}
      </ModalBody>
      <ModalFooter>
        {confirmar ? (
          <div className="mr-auto flex items-center gap-2 text-xs">
            <span style={{ color: 'var(--status-critical)' }}>Excluir o quadro e todas as tarefas?</span>
            <button type="button" onClick={excluir} className="rounded-lg bg-red-600 px-2.5 py-1 font-semibold text-white">Sim</button>
            <button type="button" onClick={() => setConfirmar(false)} className="rounded-lg px-2.5 py-1 font-semibold" style={{ background: 'var(--surface-sunken)' }}>Não</button>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirmar(true)} className="mr-auto inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: 'var(--ink-muted)' }}>
            <Trash2 className="h-3.5 w-3.5" /> Excluir quadro
          </button>
        )}
        <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm font-semibold text-slate-600 dark:text-slate-300">Cancelar</button>
        <button type="button" onClick={salvar} disabled={salvando || !nome.trim()} className="flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50" style={{ background: 'var(--brand)' }}>
          {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Salvar
        </button>
      </ModalFooter>
    </Modal>
  );
}
