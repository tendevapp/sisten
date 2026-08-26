import React, { useState, useEffect } from 'react';
import { supabase } from '../db/supabaseClient';
import { ArrowLeft, CheckCircle2, AlertCircle, Loader2, Eye, EyeOff, KeyRound } from 'lucide-react';

interface ResetPasswordProps {
  onNavigate: (path: string) => void;
}

export default function ResetPassword({ onNavigate }: ResetPasswordProps) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLinkExpired, setIsLinkExpired] = useState(false);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Verifica se a URL retornou erro de link expirado ou invalido do Supabase Auth
    const hash = window.location.hash || '';
    const search = window.location.search || '';
    const fullParams = `${hash}&${search}`;

    if (
      fullParams.includes('error_code=otp_expired') ||
      fullParams.includes('Email+link+is+invalid+or+has+expired') ||
      fullParams.includes('otp_expired') ||
      fullParams.includes('access_denied')
    ) {
      setIsLinkExpired(true);
      setError('O link de recuperação de senha expirou ou já foi utilizado. Por favor, solicite um novo e-mail.');
      return;
    }

    // Verifica se ha sessao ativa ou token de recuperacao
    if (supabase) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (!session && !hash.includes('recovery') && !hash.includes('access_token')) {
          // Sem sessao e sem hash de recuperacao
          console.warn('Acesso a tela de redefinição sem sessão de recuperação ativa.');
        }
      });
    }
  }, []);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 6) {
      setError('A nova senha deve conter pelo menos 6 caracteres.');
      return;
    }

    if (password !== confirmPassword) {
      setError('As senhas não coincidem.');
      return;
    }

    if (!supabase) {
      setError('Cliente de banco de dados não configurado.');
      return;
    }

    setLoading(true);
    try {
      const { error: resetError } = await supabase.auth.updateUser({
        password: password
      });

      setLoading(false);
      if (resetError) {
        const msg = resetError.message.toLowerCase();
        if (msg.includes('expired') || msg.includes('jwt') || msg.includes('auth session missing')) {
          setIsLinkExpired(true);
          setError('A sessão de recuperação expirou ou é inválida. Por favor, solicite um novo link no e-mail.');
        } else if (msg.includes('same_password') || msg.includes('same password')) {
          setError('A nova senha deve ser diferente da senha anterior.');
        } else {
          setError(resetError.message);
        }
      } else {
        setSuccess(true);
        // Desloga o usuário para forçar o login com a nova senha
        await supabase.auth.signOut();
      }
    } catch (err) {
      setLoading(false);
      setError('Erro de comunicação com o servidor.');
    }
  };

  return (
    <div className="min-h-screen relative w-full overflow-hidden bg-slate-100 flex flex-col justify-between">
      {/* Background Image */}
      <div className="absolute inset-0 z-0">
        <img 
          src="/bg-app.png" 
          alt="" 
          className="h-full w-full object-cover" 
        />
      </div>

      {/* Main Content */}
      <div className="relative z-10 flex-1 flex items-center justify-center p-6">
        <div className="relative w-full max-w-md rounded-3xl bg-white p-8 sm:p-10 shadow-2xl border border-slate-100 text-left">
          {/* Back Button */}
          <button
            onClick={() => onNavigate('/login')}
            className="flex items-center text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors mb-6 cursor-pointer"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar ao login
          </button>

          {isLinkExpired ? (
            <div className="py-4 text-center">
              <div className="mx-auto w-14 h-14 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 mb-4">
                <AlertCircle className="h-8 w-8" />
              </div>
              <h3 className="text-xl font-bold text-slate-900">Link Expirado ou Inválido</h3>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                O link de redefinição de senha expirou ou já foi utilizado. Por motivos de segurança, os links de recuperação possuem validade limitada.
              </p>
              <div className="mt-6 space-y-2">
                <button
                  onClick={() => onNavigate('/login')}
                  className="w-full rounded-xl bg-[#0056c6] hover:bg-[#004bb0] py-2.5 text-sm font-bold text-white transition-colors cursor-pointer"
                >
                  Solicitar Novo Link de Recuperação
                </button>
              </div>
            </div>
          ) : !success ? (
            <>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2.5 rounded-xl bg-blue-50 text-[#0056c6]">
                  <KeyRound className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-2xl font-extrabold tracking-tight text-slate-900">Nova Senha</h3>
                  <p className="text-xs text-slate-500">Crie uma nova senha de acesso segura para sua conta.</p>
                </div>
              </div>

              <form onSubmit={handleResetPassword} className="mt-6 space-y-4">
                {error && (
                  <div className="text-sm text-red-600 flex items-center gap-1.5 font-medium border border-red-200 bg-red-50 p-2.5 rounded-lg">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Nova Senha</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      placeholder="Mín. 6 caracteres"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full rounded-xl border border-gray-250 py-2.5 pl-3.5 pr-10 text-sm focus:border-[#0056c6] focus:outline-none focus:ring-2 focus:ring-[#0056c6]/20 transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Confirmar Nova Senha</label>
                  <div className="relative">
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      required
                      placeholder="Confirme a senha"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full rounded-xl border border-gray-250 py-2.5 pl-3.5 pr-10 text-sm focus:border-[#0056c6] focus:outline-none focus:ring-2 focus:ring-[#0056c6]/20 transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="flex w-full items-center justify-center rounded-xl bg-[#0056c6] hover:bg-[#004bb0] py-2.5 text-sm font-bold text-white focus:outline-none disabled:opacity-50 transition-colors cursor-pointer"
                >
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Salvar Nova Senha'}
                </button>
              </form>
            </>
          ) : (
            <div className="py-6 text-center">
              <CheckCircle2 className="mx-auto h-16 w-16 text-emerald-500 animate-bounce" />
              <h3 className="mt-4 text-xl font-bold text-slate-900">Senha redefinida!</h3>
              <p className="mt-2 text-sm text-slate-500 leading-relaxed">
                Sua senha foi redefinida com sucesso no sistema. Você já pode fazer login novamente com sua nova credencial.
              </p>
              <button
                onClick={() => onNavigate('/login')}
                className="mt-6 w-full rounded-xl bg-slate-900 hover:bg-slate-800 py-2.5 text-sm font-bold text-white transition-colors cursor-pointer"
              >
                Voltar para o Login
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
