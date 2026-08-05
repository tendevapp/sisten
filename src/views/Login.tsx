import React, { useState } from 'react';
import {
  Mail, Lock, Eye, EyeOff, Loader2, AlertCircle, MapPin, CheckCircle2
} from 'lucide-react';
import { localDb } from '../db/localDb';
import { Profile } from '../types';

interface LoginProps {
  onLoginSuccess: (user: Profile) => void;
  onNavigate: (path: string) => void;
}

// Particulas decorativas inspiradas nos pixels do icone SISTEN
function LoginParticles() {
  const particles = [
    { size: 6, left: '8%',  bottom: '5%',  duration: '18s', delay: '0s' },
    { size: 4, left: '15%', bottom: '10%', duration: '22s', delay: '3s' },
    { size: 8, left: '25%', bottom: '0%',  duration: '20s', delay: '1s' },
    { size: 5, left: '40%', bottom: '8%',  duration: '24s', delay: '5s' },
    { size: 3, left: '55%', bottom: '3%',  duration: '19s', delay: '2s' },
    { size: 7, left: '70%', bottom: '6%',  duration: '21s', delay: '4s' },
    { size: 4, left: '82%', bottom: '2%',  duration: '23s', delay: '6s' },
    { size: 6, left: '92%', bottom: '12%', duration: '17s', delay: '1.5s' },
  ];

  return (
    <>
      {particles.map((p, i) => (
        <div
          key={i}
          className="login-particle"
          style={{
            width: p.size,
            height: p.size,
            left: p.left,
            bottom: p.bottom,
            animationDuration: p.duration,
            animationDelay: p.delay,
          }}
        />
      ))}
    </>
  );
}

export default function Login({ onLoginSuccess, onNavigate }: LoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Estados de Esqueci minha senha
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetMessage, setResetMessage] = useState('');
  const [resetError, setResetError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await localDb.login(email, password);
      setLoading(false);
      if (typeof result === 'string') {
        if (result.includes('pendente') || result.includes('autorização')) {
          setError('pendente');
        } else if (result.includes('inativo') || result.includes('inativa')) {
          setError('inativo');
        } else {
          setError(result);
        }
      } else {
        onLoginSuccess(result);
      }
    } catch (err) {
      setLoading(false);
      setError('Erro de comunicação com o servidor.');
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError('');
    setResetMessage('');
    setResetLoading(true);

    try {
      const res = await localDb.resetPasswordForEmail(resetEmail);
      setResetLoading(false);
      if (res === 'sucesso') {
        setResetMessage('E-mail de recuperação enviado com sucesso! Verifique sua caixa de entrada.');
      } else {
        setResetError(res);
      }
    } catch (err) {
      setResetLoading(false);
      setResetError('Erro ao processar solicitação de recuperação.');
    }
  };

  return (
    <div className="min-h-screen relative w-full overflow-hidden bg-slate-100 flex flex-col justify-between">

      {/* ===== BACKGROUND com Ken Burns (sem overlay) ===== */}
      <div className="absolute inset-0 z-0 overflow-hidden">
        <img
          src="/bg-app.png"
          alt=""
          className="h-full w-full object-cover login-bg-animate"
        />
      </div>

      {/* ===== PARTICULAS decorativas ===== */}
      <div className="absolute inset-0 z-[2] pointer-events-none overflow-hidden">
        <LoginParticles />
      </div>

      {/* ===== CONTEUDO PRINCIPAL ===== */}
      <div className="relative z-10 flex-1 flex items-start px-6 sm:px-10 lg:px-16 pt-10 pb-12">
        <div className="max-w-7xl mx-auto w-full flex flex-col lg:flex-row items-start justify-between gap-12 lg:gap-8">

          {/* ===== LADO ESQUERDO: institucional + tagline (layout original com animacoes) ===== */}
          <div className="hidden lg:flex flex-col max-w-2xl text-left mt-2 login-stagger">
            {/* Logo em destaque */}
            <div className="login-logo-enter">
              <img src="/logo-ten.png" alt="TEN" className="h-64 w-auto object-contain -ml-6" />
            </div>

            {/* Localização */}
            <div className="flex items-center gap-2 bg-slate-100/90 border border-slate-200/50 px-3.5 py-1.5 rounded-full w-fit mb-2 -mt-5 shadow-2xs relative z-30">
              <MapPin className="h-4 w-4 text-[#0056c6]" />
              <span className="text-xs font-semibold text-[#0056c6]">
                Torres Eólicas do Nordeste — Jacobina/BA
              </span>
            </div>

            {/* Tagline */}
            <h1 className="text-4xl xl:text-5xl font-extrabold leading-tight tracking-tight text-slate-900">
              Solução integrada <br />
              para uma gestão <span className="text-[#0056c6]">eficiente</span>.
            </h1>
            <p className="mt-1.5 text-base text-slate-600 max-w-lg leading-relaxed">
              Gerencie materiais, solicitações, helpdesk e suprimentos em uma única plataforma, com segurança e agilidade.
            </p>
          </div>

          {/* ===== LADO DIREITO: Card de Login Flutuante ===== */}
          <div className="w-full max-w-md ml-auto z-20 mt-8 lg:mt-48 login-card-enter">
            {/* Logo no mobile */}
            <div className="lg:hidden flex justify-center mb-6 login-logo-enter">
              <img src="/logo-ten.png" alt="TEN" className="h-20 w-auto object-contain" />
            </div>

            <div className="login-card-float login-card-shadow login-glass rounded-3xl w-full transition-shadow duration-500 hover:shadow-[0_32px_80px_-12px_rgba(0,86,198,0.22),0_16px_40px_-8px_rgba(0,0,0,0.14)]">
              <div className="p-8 sm:p-10">

                {/* Header do card com logo icone SISTEN */}
                <div className="mb-7 login-stagger">
                  <div className="flex items-center gap-3 mb-4">
                    <img
                      src="/logo.png"
                      alt="SISTEN"
                      className="h-10 w-10 object-contain"
                    />
                    <span className="text-lg font-extrabold tracking-tight text-slate-800">SISTEN</span>
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
                    Acesse a plataforma
                  </h2>
                  <p className="text-slate-500 mt-1.5 text-sm leading-relaxed">
                    Entre com suas credenciais corporativas.
                  </p>
                </div>

                {isForgotPassword ? (
                  <form onSubmit={handleResetPassword} className="space-y-5 text-left login-stagger">
                    <div className="mb-4">
                      <p className="text-sm text-slate-500">
                        Insira seu e-mail corporativo cadastrado. Nós enviaremos um link de redefinição de senha para você.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <label htmlFor="resetEmail" className="text-sm font-semibold text-slate-700">
                        E-mail
                      </label>
                      <div className="relative group">
                        <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 transition-colors group-focus-within:text-[#0056c6]" />
                        <input
                          id="resetEmail"
                          type="email"
                          placeholder="seu.nome@ten.com.br"
                          className="w-full pl-11 h-12 bg-white/60 border border-slate-200 text-slate-900 placeholder-slate-400 focus:bg-white focus:border-[#0056c6] focus:outline-none focus:ring-2 focus:ring-[#0056c6]/20 rounded-xl transition-all duration-300"
                          value={resetEmail}
                          onChange={(e) => setResetEmail(e.target.value)}
                          required
                          autoComplete="email"
                        />
                      </div>
                    </div>

                    {resetMessage && (
                      <div className="text-sm text-emerald-700 flex items-center gap-1.5 font-medium border border-emerald-200 bg-emerald-50 p-2.5 rounded-lg animate-fade-in">
                        <CheckCircle2 className="h-4 w-4 shrink-0" />
                        <span>{resetMessage}</span>
                      </div>
                    )}

                    {resetError && (
                      <div className="text-sm text-red-600 flex items-center gap-1.5 font-medium border border-red-200/50 bg-red-50 p-2.5 rounded-lg animate-fade-in">
                        <AlertCircle className="h-4 w-4 shrink-0" />
                        <span>{resetError}</span>
                      </div>
                    )}

                    <div className="space-y-3 pt-2">
                      <button
                        type="submit"
                        className="w-full h-12 flex items-center justify-center bg-[#0056c6] hover:bg-[#004bb0] active:scale-[0.98] text-white font-bold rounded-xl transition-all duration-200 text-base shadow-sm disabled:opacity-50 cursor-pointer"
                        disabled={resetLoading}
                      >
                        {resetLoading ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : null}
                        Enviar Link de Recuperação
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setIsForgotPassword(false);
                          setResetEmail('');
                          setResetMessage('');
                          setResetError('');
                        }}
                        className="w-full h-12 flex items-center justify-center bg-slate-100/80 hover:bg-slate-200/80 active:scale-[0.98] text-slate-700 font-bold rounded-xl transition-all duration-200 text-base cursor-pointer"
                      >
                        Voltar ao Login
                      </button>
                    </div>
                  </form>
                ) : error === 'pendente' ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 animate-fade-in">
                    <div className="flex gap-3">
                      <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                      <div className="space-y-2 text-left">
                        <p className="font-semibold text-amber-900 text-sm">
                          Cadastro aguardando ativação
                        </p>
                        <p className="text-xs text-amber-700">
                          Seu cadastro foi realizado. Aguarde a autorização do administrador.
                        </p>
                        <button
                          type="button"
                          className="mt-2 h-8 px-4 rounded-lg border border-amber-200 text-xs font-semibold text-amber-800 bg-white hover:bg-amber-50 active:scale-[0.97] transition-all"
                          onClick={() => setError('')}
                        >
                          Voltar ao login
                        </button>
                      </div>
                    </div>
                  </div>
                ) : error === 'inativo' ? (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-4 animate-fade-in">
                    <div className="flex gap-3">
                      <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                      <div className="space-y-2 text-left">
                        <p className="font-semibold text-red-900 text-sm">
                          Conta inativa
                        </p>
                        <p className="text-xs text-red-700">
                          Procure o administrador para regularizar seu acesso.
                        </p>
                        <button
                          type="button"
                          className="mt-2 h-8 px-4 rounded-lg border border-red-200 text-xs font-semibold text-red-800 bg-white hover:bg-red-50 active:scale-[0.97] transition-all"
                          onClick={() => setError('')}
                        >
                          Voltar ao login
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-5 text-left login-stagger">
                    <div className="space-y-2">
                      <label htmlFor="email" className="text-sm font-semibold text-slate-700">
                        E-mail
                      </label>
                      <div className="relative group">
                        <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 transition-colors group-focus-within:text-[#0056c6]" />
                        <input
                          id="email"
                          type="email"
                          placeholder="seu.nome@ten.com.br"
                          className="w-full pl-11 h-12 bg-white/60 border border-slate-200 text-slate-900 placeholder-slate-400 focus:bg-white focus:border-[#0056c6] focus:outline-none focus:ring-2 focus:ring-[#0056c6]/20 rounded-xl transition-all duration-300"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          required
                          autoComplete="email"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <label htmlFor="password" className="text-sm font-semibold text-slate-700">
                          Senha
                        </label>
                        <button
                          type="button"
                          onClick={() => setIsForgotPassword(true)}
                          className="login-link text-xs font-semibold text-[#0056c6] cursor-pointer"
                        >
                          Esqueci minha senha
                        </button>
                      </div>
                      <div className="relative group">
                        <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 transition-colors group-focus-within:text-[#0056c6]" />
                        <input
                          id="password"
                          type={showPassword ? 'text' : 'password'}
                          placeholder="••••••••"
                          className="w-full pl-11 pr-11 h-12 bg-white/60 border border-slate-200 text-slate-900 placeholder-slate-400 focus:bg-white focus:border-[#0056c6] focus:outline-none focus:ring-2 focus:ring-[#0056c6]/20 rounded-xl transition-all duration-300"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          required
                          autoComplete="current-password"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-600 transition-colors"
                        >
                          {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-sm py-1">
                      <label className="flex items-center gap-2 cursor-pointer select-none text-slate-600">
                        <input
                          type="checkbox"
                          className="h-4.5 w-4.5 rounded border-slate-300 text-[#0056c6] focus:ring-[#0056c6]/30 transition-colors"
                        />
                        <span className="text-sm font-medium">Lembrar meu acesso</span>
                      </label>
                    </div>

                    {error && (
                      <div className="text-sm text-red-600 flex items-center gap-1.5 font-medium border border-red-200/50 bg-red-50 p-2.5 rounded-lg animate-fade-in">
                        <AlertCircle className="h-4 w-4 shrink-0" />
                        <span>{error}</span>
                      </div>
                    )}

                    <button
                      type="submit"
                      className="w-full h-12 flex items-center justify-center bg-[#0056c6] hover:bg-[#004bb0] hover:scale-[1.02] active:scale-[0.98] text-white font-bold rounded-xl transition-all duration-200 text-base shadow-md hover:shadow-lg mt-2 disabled:opacity-50 cursor-pointer"
                      disabled={loading}
                    >
                      {loading ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : null}
                      Entrar
                    </button>
                  </form>
                )}

                {/* Separador "ou" */}
                <div className="flex items-center gap-3 my-6">
                  <div className="flex-1 h-px bg-slate-200/80" />
                  <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">ou</span>
                  <div className="flex-1 h-px bg-slate-200/80" />
                </div>

                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => onNavigate('/cadastro')}
                    className="text-sm text-slate-600 cursor-pointer"
                  >
                    Não tem conta?{' '}
                    <span className="login-link text-[#0056c6] font-bold">Solicitar cadastro</span>
                  </button>
                </div>

              </div>
            </div>

            {/* Copyright abaixo do card */}
            <p className="text-center text-xs text-white mt-5 font-medium">
              &copy; {new Date().getFullYear()} Torres Eólicas do Nordeste S.A. — Uso interno.
            </p>
          </div>

        </div>
      </div>
    </div>
  );
}
