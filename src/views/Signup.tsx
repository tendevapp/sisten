/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { ArrowLeft, CheckCircle2, AlertCircle, Loader2, Sun, Moon } from 'lucide-react';
import { localDb } from '../db/localDb';

interface SignupProps {
  onNavigate: (path: string) => void;
}

export default function Signup({ onNavigate }: SignupProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [sectorId, setSectorId] = useState('1'); // Defaults to RH (1)
  const [cargo, setCargo] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'));

  const toggleTheme = () => {
    const newDark = !isDark;
    setIsDark(newDark);
    if (newDark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  };

  const sectors = localDb.getSectors();

  const handleSignup = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Corporate email validation
    if (!email.toLowerCase().endsWith('@ten.com.br')) {
      setError('Apenas e-mails corporativos finalizados em @ten.com.br são aceitos.');
      return;
    }

    setLoading(true);
    setTimeout(() => {
      const res = localDb.signup(name, email, sectorId, cargo);
      setLoading(false);
      if (res === 'sucesso') {
        setSuccess(true);
      } else {
        setError(res);
      }
    }, 800);
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-slate-50 p-6">
      {/* Dark Mode toggle corner button */}
      <button
        type="button"
        onClick={toggleTheme}
        className="absolute right-6 top-6 z-50 rounded-full border border-slate-200 bg-white p-2.5 shadow-md text-slate-500 hover:scale-105 transition-all cursor-pointer"
        title={isDark ? 'Ativar Modo Claro' : 'Ativar Modo Escuro'}
      >
        {isDark ? <Sun className="h-5 w-5 text-amber-400" /> : <Moon className="h-5 w-5 text-slate-600" />}
      </button>

      {/* Background decoration */}
      <div 
        className="absolute inset-0 bg-cover bg-center opacity-10 mix-blend-multiply"
        style={{ 
          backgroundImage: 'url("https://images.unsplash.com/photo-1508514177221-188b1cf16e9d?q=80&w=1920")' 
        }}
      />

      <div className="relative w-full max-w-md rounded-2xl bg-white p-8 shadow-xl border border-slate-100 z-10 text-left">
        {/* Back Button */}
        <button
          onClick={() => onNavigate('/login')}
          className="flex items-center text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors mb-6 cursor-pointer"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar ao login
        </button>

        {!success ? (
          <>
            <h3 className="text-xl font-bold tracking-tight text-slate-900">Solicitar cadastro</h3>
            <p className="mt-1.5 text-xs text-slate-500">Crie seu perfil e aguarde liberação de acesso do administrador.</p>

            <form onSubmit={handleSignup} className="mt-6 space-y-4">
              {error && (
                <div className="rounded-lg bg-red-50 p-3 text-xs font-semibold text-red-600 border border-red-100 flex items-center">
                  <AlertCircle className="mr-2 h-4.5 w-4.5 shrink-0 text-red-500" />
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
                  className="w-full rounded-lg border border-gray-200 py-2 text-sm focus:border-blue-600 focus:outline-none transition-all"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">E-mail corporativo</label>
                <input
                  type="email"
                  required
                  placeholder="seu.nome@ten.com.br"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 py-2 text-sm focus:border-blue-600 focus:outline-none transition-all"
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
                    className="w-full rounded-lg border border-gray-200 py-2 text-sm focus:border-blue-600 focus:outline-none transition-all"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Setor</label>
                  <select
                    value={sectorId}
                    onChange={(e) => setSectorId(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 bg-white py-2 px-3 text-sm focus:border-blue-600 focus:outline-none transition-all cursor-pointer"
                  >
                    {sectors.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="flex w-full items-center justify-center rounded-lg bg-blue-600 py-2 text-sm font-bold text-white hover:bg-blue-700 focus:ring-4 focus:ring-blue-500/20 focus:outline-none disabled:opacity-50 transition-colors cursor-pointer"
              >
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Solicitar Cadastro'}
              </button>
            </form>
          </>
        ) : (
          <div className="py-6 text-center">
            <CheckCircle2 className="mx-auto h-16 w-16 text-emerald-500" />
            <h3 className="mt-4 text-xl font-bold text-slate-900">Cadastro solicitado!</h3>
            <p className="mt-2 text-sm text-slate-500 leading-relaxed">
              Sua solicitação de acesso foi enviada com sucesso para a equipe de administração da Torres Eólicas do Nordeste (TEN).
            </p>
            <div className="mt-6 rounded-lg bg-slate-50 p-4 text-left text-xs text-slate-600 border border-slate-100">
              <p className="font-bold">E-mail: <span className="font-semibold text-slate-900">{email}</span></p>
              <p className="font-bold mt-1">Status: <span className="font-semibold text-amber-600">Aguardando Aprovação</span></p>
              <p className="mt-2 text-slate-400">Assim que seu perfil for aprovado, você receberá permissão para efetuar login na plataforma.</p>
            </div>
            <button
              onClick={() => onNavigate('/login')}
              className="mt-6 w-full rounded-lg bg-slate-900 py-2.5 text-sm font-bold text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Ir para o Login
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
