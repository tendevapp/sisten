import React, { useState } from 'react';
import { KeyRound, AlertCircle, Loader2, Eye, EyeOff, ShieldAlert } from 'lucide-react';
import Modal, { ModalBody, ModalFooter } from '../ui/Modal';
import { localDb } from '../../db/localDb';
import { Profile } from '../../types';

interface ForcePasswordChangeModalProps {
  user: Profile;
  /** Chamado após a nova senha ser gravada com sucesso (a flag já foi limpa). */
  onDone: () => void;
  /** Escape: encerra a sessão sem trocar a senha. */
  onLogout: () => void;
}

/**
 * Popup bloqueante exibido logo após o login quando um administrador forçou o
 * reset da senha do usuário (Profile.must_change_password). Cobre o app inteiro
 * e não pode ser fechado por fora — só saindo ou definindo a nova senha.
 */
export default function ForcePasswordChangeModal({ user, onDone, onLogout }: ForcePasswordChangeModalProps) {
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const firstName = (user.name || '').trim().split(/\s+/)[0];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (newPass.length < 6) {
      setError('A nova senha deve ter pelo menos 6 caracteres.');
      return;
    }
    if (newPass !== confirmPass) {
      setError('A nova senha e a confirmação não coincidem.');
      return;
    }

    setLoading(true);
    const ok = await localDb.changePassword(newPass);
    setLoading(false);

    if (!ok) {
      setError('Não foi possível salvar a nova senha. Ela precisa ser diferente da senha provisória — tente novamente.');
      return;
    }
    onDone();
  };

  return (
    <Modal onClose={() => {}} maxWidth="max-w-md" ariaLabel="Troca de senha obrigatória" disableOutsideClose>
      <div className="flex items-start gap-3 px-4 sm:px-6 pt-5 pb-3.5 border-b border-slate-100 dark:border-slate-800 shrink-0">
        <div className="p-2.5 rounded-xl bg-amber-50 text-amber-600 shrink-0">
          <ShieldAlert className="h-6 w-6" />
        </div>
        <div className="min-w-0">
          <h2 className="text-lg font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
            {firstName ? `${firstName}, defina uma nova senha` : 'Defina uma nova senha'}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
            Um administrador redefiniu sua senha de acesso. Por segurança, crie agora uma nova
            senha pessoal para continuar usando o SISTEN.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
        <ModalBody className="space-y-4">
          {error && (
            <div className="text-sm text-red-600 flex items-center gap-1.5 font-medium border border-red-200 bg-red-50 p-2.5 rounded-lg">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Nova Senha</label>
            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type={show ? 'text' : 'password'}
                autoFocus
                required
                placeholder="Mín. 6 caracteres"
                value={newPass}
                onChange={(e) => setNewPass(e.target.value)}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 py-2.5 pl-9 pr-10 text-sm focus:border-[#0056c6] focus:outline-none focus:ring-2 focus:ring-[#0056c6]/20 transition-all"
              />
              <button
                type="button"
                onClick={() => setShow(!show)}
                aria-label={show ? 'Ocultar senha' : 'Mostrar senha'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
              >
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Confirmar Nova Senha</label>
            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type={show ? 'text' : 'password'}
                required
                placeholder="Repita a nova senha"
                value={confirmPass}
                onChange={(e) => setConfirmPass(e.target.value)}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 py-2.5 pl-9 pr-10 text-sm focus:border-[#0056c6] focus:outline-none focus:ring-2 focus:ring-[#0056c6]/20 transition-all"
              />
            </div>
          </div>
        </ModalBody>

        <ModalFooter className="justify-between">
          <button
            type="button"
            onClick={onLogout}
            className="text-xs font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors cursor-pointer"
          >
            Sair
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex items-center justify-center rounded-xl bg-[#0056c6] hover:bg-[#004bb0] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50 transition-colors cursor-pointer"
          >
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Salvar e continuar
          </button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
