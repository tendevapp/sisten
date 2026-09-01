/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { KeyRound, AlertCircle, Loader2, Eye, EyeOff, RefreshCw, Copy, Check } from 'lucide-react';
import Modal, { ModalHeader, ModalBody, ModalFooter } from '../ui/Modal';
import { localDb } from '../../db/localDb';
import { Profile } from '../../types';
import { useToast } from '../ui/Toast';

interface AdminResetPasswordModalProps {
  target: Profile;
  onClose: () => void;
  /** Chamado após o reset ser aplicado com sucesso. */
  onDone: () => void;
}

// Senha provisória padrão sugerida ao admin. O campo continua editável caso ele
// prefira definir outra.
const SENHA_PROVISORIA_PADRAO = 'Ten2026@';

export default function AdminResetPasswordModal({ target, onClose, onDone }: AdminResetPasswordModalProps) {
  const toast = useToast();
  const [password, setPassword] = useState(SENHA_PROVISORIA_PADRAO);
  const [show, setShow] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(password);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.trim().length < 6) {
      setError('A senha provisória deve ter pelo menos 6 caracteres.');
      return;
    }

    setLoading(true);
    const res = await localDb.adminResetUserPassword(target.id, password.trim());
    setLoading(false);

    if (res === 'sucesso') {
      toast.success(`Senha de ${target.name} redefinida. O usuário terá que criar uma nova senha no próximo login.`);
      onDone();
      onClose();
    } else {
      setError(res);
    }
  };

  return (
    <Modal onClose={onClose} maxWidth="max-w-md" ariaLabel="Resetar senha do usuário">
      <ModalHeader onClose={onClose}>
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-blue-50 text-[#0056c6]">
            <KeyRound className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-extrabold tracking-tight text-slate-900 dark:text-slate-100">Resetar senha</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{target.name} • {target.email}</p>
          </div>
        </div>
      </ModalHeader>

      <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
        <ModalBody className="space-y-4">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 leading-relaxed">
            Defina uma senha provisória e repasse ao usuário por um canal seguro. Ao entrar com ela,
            o sistema vai <strong>obrigar</strong> a criação de uma nova senha pessoal antes de liberar o acesso.
          </div>

          {error && (
            <div className="text-sm text-red-600 flex items-center gap-1.5 font-medium border border-red-200 bg-red-50 p-2.5 rounded-lg">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Senha provisória</label>
            <div className="relative">
              <input
                type={show ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 py-2.5 pl-3.5 pr-20 text-sm font-mono focus:border-[#0056c6] focus:outline-none focus:ring-2 focus:ring-[#0056c6]/20 transition-all"
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                <button
                  type="button"
                  onClick={handleCopy}
                  aria-label="Copiar senha"
                  className="p-1.5 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => setShow(!show)}
                  aria-label={show ? 'Ocultar senha' : 'Mostrar senha'}
                  className="p-1.5 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            {password !== SENHA_PROVISORIA_PADRAO && (
              <button
                type="button"
                onClick={() => setPassword(SENHA_PROVISORIA_PADRAO)}
                className="mt-1 inline-flex items-center gap-1.5 text-xs font-bold text-[#0056c6] hover:underline cursor-pointer"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Restaurar padrão ({SENHA_PROVISORIA_PADRAO})
              </button>
            )}
          </div>
        </ModalBody>

        <ModalFooter>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2.5 text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex items-center justify-center rounded-xl bg-[#0056c6] hover:bg-[#004bb0] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50 transition-colors cursor-pointer"
          >
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Redefinir senha
          </button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
