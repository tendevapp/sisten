/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { ArrowLeft, CheckCircle2, AlertCircle, Loader2, Eye, EyeOff } from 'lucide-react';
import { localDb } from '../db/localDb';

interface SignupProps {
  onNavigate: (path: string) => void;
}

export default function Signup({ onNavigate }: SignupProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [sectorId, setSectorId] = useState('1'); // Defaults to RH (1)
  const [cargo, setCargo] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const sectors = localDb.getSectors();

  const handleGoToLogin = () => {
    sessionStorage.removeItem('is_signing_up');
    onNavigate('/login');
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validação genérica de e-mail
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError('Por favor, insira um e-mail válido.');
      return;
    }

    if (password.length < 6) {
      setError('A senha deve conter pelo menos 6 caracteres.');
      return;
    }

    if (password !== confirmPassword) {
      setError('As senhas não coincidem.');
      return;
    }

    sessionStorage.setItem('is_signing_up', 'true');
    setLoading(true);
    try {
      const res = await localDb.signup(name, email, sectorId, cargo, password);
      setLoading(false);
      if (res === 'sucesso') {
        setSuccess(true);
      } else {
        sessionStorage.removeItem('is_signing_up');
        setError(res);
      }
    } catch (err) {
      sessionStorage.removeItem('is_signing_up');
      setLoading(false);
      setError('Erro de comunicação com o servidor.');
    }
  };

  return (
    <div className="min-h-screen relative w-full overflow-hidden bg-slate-100 flex flex-col justify-between">
      {/* Imagem de fundo limpa (sem degradê sobreposto) */}
      <div className="absolute inset-0 z-0">
        <img 
          src="/bg-app.png" 
          alt="" 
          className="h-full w-full object-cover" 
        />
      </div>

      {/* Conteúdo Principal Centrado */}
      <div className="relative z-10 flex-1 flex items-center justify-center p-6">
        <div className="relative w-full max-w-md rounded-3xl bg-white p-8 sm:p-10 shadow-2xl border border-slate-100 text-left">
          {/* Back Button */}
          <button
            onClick={handleGoToLogin}
            className="flex items-center text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors mb-6 cursor-pointer"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar ao login
          </button>

          {!success ? (
            <>
              <h3 className="text-2xl font-extrabold tracking-tight text-slate-900">Cadastrar-se</h3>
              <p className="mt-1.5 text-sm text-slate-500">Crie seu perfil para obter acesso imediato como Visualizador.</p>

              <form onSubmit={handleSignup} className="mt-6 space-y-4">
                {error && (
                  <div className="text-sm text-red-650 flex items-center gap-1.5 font-medium border border-red-200/50 bg-red-50 p-2.5 rounded-lg">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Nome completo</label>
                  <input
                    type="text"
                    required
                    placeholder="Nome Completo"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full rounded-xl border border-gray-250 py-2.5 px-3.5 text-sm focus:border-[#0056c6] focus:outline-none focus:ring-2 focus:ring-[#0056c6]/20 transition-all"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">E-mail</label>
                  <input
                    type="email"
                    required
                    placeholder="seu.email@provedor.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-xl border border-gray-250 py-2.5 px-3.5 text-sm focus:border-[#0056c6] focus:outline-none focus:ring-2 focus:ring-[#0056c6]/20 transition-all"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">Cargo</label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: Engenheiro"
                      value={cargo}
                      onChange={(e) => setCargo(e.target.value)}
                      className="w-full rounded-xl border border-gray-250 py-2.5 px-3.5 text-sm focus:border-[#0056c6] focus:outline-none focus:ring-2 focus:ring-[#0056c6]/20 transition-all"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">Setor</label>
                    <select
                      value={sectorId}
                      onChange={(e) => setSectorId(e.target.value)}
                      className="w-full rounded-xl border border-gray-250 bg-white py-2.5 px-3 text-sm focus:border-[#0056c6] focus:outline-none focus:ring-2 focus:ring-[#0056c6]/20 transition-all cursor-pointer"
                    >
                      {sectors.map(s => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">Criar Senha</label>
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
                    <label className="text-xs font-bold text-slate-700">Confirmar Senha</label>
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
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="flex w-full items-center justify-center rounded-xl bg-[#0056c6] hover:bg-[#004bb0] py-2.5 text-sm font-bold text-white focus:outline-none disabled:opacity-50 transition-colors cursor-pointer"
                >
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Cadastrar-se'}
                </button>
              </form>
            </>
          ) : (
            <div className="py-6 text-center">
              <CheckCircle2 className="mx-auto h-16 w-16 text-emerald-500 animate-bounce" />
              <h3 className="mt-4 text-xl font-bold text-slate-900">Cadastro realizado!</h3>
              <p className="mt-2 text-sm text-slate-500 leading-relaxed">
                Seu cadastro foi criado com sucesso na plataforma da Torres Eólicas do Nordeste (TEN).
              </p>
              <div className="mt-6 rounded-2xl bg-slate-50 p-4 text-left text-xs text-slate-650 border border-slate-100">
                <p className="font-bold">E-mail: <span className="font-semibold text-slate-900">{email}</span></p>
                <p className="font-bold mt-1">Nível de Acesso: <span className="font-semibold text-emerald-600">Visualizador</span></p>
                <p className="mt-2 text-slate-400">Seu acesso já está liberado. Clique no botão abaixo para fazer login e entrar no sistema.</p>
              </div>
              <button
                onClick={handleGoToLogin}
                className="mt-6 w-full rounded-xl bg-slate-900 hover:bg-slate-800 py-2.5 text-sm font-bold text-white transition-colors cursor-pointer"
              >
                Ir para o Login
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
