/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Mail, Lock, Eye, EyeOff, Loader2, Landmark, Radio, ShoppingCart, BarChart3, HelpCircle, Sun, Moon } from 'lucide-react';
import { localDb } from '../db/localDb';
import { Profile } from '../types';

interface LoginProps {
  onLoginSuccess: (user: Profile) => void;
  onNavigate: (path: string) => void;
}

export default function Login({ onLoginSuccess, onNavigate }: LoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
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

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    setTimeout(() => {
      const result = localDb.login(email, password);
      setLoading(false);
      if (typeof result === 'string') {
        setError(result);
      } else {
        onLoginSuccess(result);
      }
    }, 800);
  };

  const handleQuickAccess = (roleEmail: string) => {
    setError('');
    setLoading(true);
    setTimeout(() => {
      const result = localDb.login(roleEmail, 'ten123');
      setLoading(false);
      if (typeof result === 'string') {
        setError(result);
      } else {
        onLoginSuccess(result);
      }
    }, 300);
  };

  return (
    <div className="relative flex min-h-screen w-full flex-col lg:flex-row bg-slate-50 overflow-hidden">
      {/* Dark Mode toggle corner button */}
      <button
        type="button"
        onClick={toggleTheme}
        className="absolute right-6 top-6 z-50 rounded-full border border-slate-200 bg-white p-2.5 shadow-md text-slate-500 hover:scale-105 transition-all cursor-pointer"
        title={isDark ? 'Ativar Modo Claro' : 'Ativar Modo Escuro'}
      >
        {isDark ? <Sun className="h-5 w-5 text-amber-400" /> : <Moon className="h-5 w-5 text-slate-600" />}
      </button>

      {/* Background/Decoration Side */}
      <div className="relative flex flex-col justify-between bg-slate-900 px-8 py-10 lg:w-3/5 xl:w-2/3 text-white">
        {/* Ambient background image representing Jacobina Wind Farm */}
        <div 
          className="absolute inset-0 bg-cover bg-center opacity-40 mix-blend-multiply"
          style={{ 
            backgroundImage: 'url("https://images.unsplash.com/photo-1508514177221-188b1cf16e9d?q=80&w=1920")' 
          }}
        />

        {/* Content Overlay */}
        <div className="relative z-10 flex h-full flex-col justify-between">
          {/* Logo Brand */}
          <div className="flex items-center space-x-3">
            <div className="relative flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 p-1 border-2 border-white/20">
              <svg className="h-10 w-10 text-white animate-[spin_20s_linear_infinite]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="1.5" fill="currentColor"/>
                <path d="M12 12L12 2M12 12L4 16.5M12 12L20 16.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div className="flex flex-col text-left">
              <h1 className="text-3xl font-extrabold tracking-wider leading-none text-white">SISTEN</h1>
              <p className="text-xs text-slate-300 font-medium mt-1">SISTEMA DE INFORMAÇÃO TEN</p>
            </div>
          </div>

          {/* Slogan */}
          <div className="my-12 max-w-lg text-left">
            <span className="inline-flex items-center space-x-1.5 rounded-full bg-slate-800/80 px-3.5 py-1.5 text-xs font-semibold text-slate-300 ring-1 ring-white/10">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>Torres Eólicas do Nordeste - Jacobina/BA</span>
            </span>
            <h2 className="mt-6 text-4xl font-extrabold tracking-tight leading-tight text-white lg:text-5xl">
              Solução integrada para uma <span className="text-blue-400">gestão eficiente.</span>
            </h2>
            <p className="mt-4 text-base text-slate-300 leading-relaxed">
              Gerencie materiais, solicitações, helpdesk e suprimentos em uma única plataforma corporativa unificada, com total segurança e agilidade.
            </p>
          </div>

          {/* Features cards */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 max-w-4xl text-left">
            <div className="rounded-xl bg-white/5 p-4 backdrop-blur-sm border border-white/5">
              <ShoppingCart className="h-5 w-5 text-blue-400" />
              <h3 className="mt-2 text-xs font-bold text-white">Solicitações</h3>
              <p className="mt-1 text-[10px] text-slate-400 leading-normal">Abertura e acompanhamento de compras e cadastros.</p>
            </div>
            <div className="rounded-xl bg-white/5 p-4 backdrop-blur-sm border border-white/5">
              <Radio className="h-5 w-5 text-emerald-400" />
              <h3 className="mt-2 text-xs font-bold text-white">Helpdesk</h3>
              <p className="mt-1 text-[10px] text-slate-400 leading-normal">Suporte ágil para TI, Facilities e Manutenção.</p>
            </div>
            <div className="rounded-xl bg-white/5 p-4 backdrop-blur-sm border border-white/5">
              <Landmark className="h-5 w-5 text-amber-400" />
              <h3 className="mt-2 text-xs font-bold text-white">Suprimentos</h3>
              <p className="mt-1 text-[10px] text-slate-400 leading-normal">Acompanhamento e integração direta com o SAP.</p>
            </div>
            <div className="rounded-xl bg-white/5 p-4 backdrop-blur-sm border border-white/5">
              <BarChart3 className="h-5 w-5 text-indigo-400" />
              <h3 className="mt-2 text-xs font-bold text-white">Relatórios</h3>
              <p className="mt-1 text-[10px] text-slate-400 leading-normal">Indicadores em tempo real para tomadas de decisão.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Login Card Form Side */}
      <div className="flex flex-col items-center justify-center p-8 lg:w-2/5 xl:w-1/3 bg-white border-l border-gray-100">
        <div className="w-full max-w-sm text-left">
          <h3 className="text-2xl font-bold tracking-tight text-slate-900">Acesse a plataforma</h3>
          <p className="mt-1.5 text-sm text-slate-500">Entre com suas credenciais corporativas.</p>

          <form onSubmit={handleLogin} className="mt-8 space-y-4">
            {error && (
              <div className="rounded-lg bg-red-50 p-3 text-xs font-semibold text-red-600 border border-red-100 flex items-center">
                <AlertCircle className="mr-2 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">E-mail</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                  <Mail className="h-4 w-4" />
                </span>
                <input
                  type="email"
                  required
                  placeholder="seu.nome@ten.com.br"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 py-2.5 pr-4 pl-10 text-sm focus:border-blue-600 focus:outline-none transition-all"
                />
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-700">Senha</label>
                <button type="button" className="text-xs font-semibold text-blue-600 hover:underline">
                  Esqueci minha senha
                </button>
              </div>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                  <Lock className="h-4 w-4" />
                </span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 py-2.5 pr-10 pl-10 text-sm focus:border-blue-600 focus:outline-none transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between py-1">
              <label className="flex items-center text-xs text-slate-600 cursor-pointer">
                <input type="checkbox" className="mr-2 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                Lembrar meu acesso
              </label>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center rounded-lg bg-blue-600 py-2.5 text-sm font-bold text-white hover:bg-blue-700 focus:ring-4 focus:ring-blue-500/20 focus:outline-none disabled:opacity-50 transition-colors cursor-pointer"
            >
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Entrar'}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-slate-500">
            Não tem conta?{' '}
            <button
              onClick={() => onNavigate('/cadastro')}
              className="font-bold text-blue-600 hover:underline cursor-pointer"
            >
              Solicitar cadastro
            </button>
          </p>

          {/* Quick access simulation block */}
          <div className="mt-8 rounded-xl bg-slate-50 p-4 border border-slate-100">
            <h4 className="text-[11px] font-bold tracking-wider text-slate-500 uppercase">Acesso rápido (demo — senha: ten123)</h4>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                onClick={() => handleQuickAccess('admin@ten.com.br')}
                className="rounded border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 text-center"
              >
                Admin
              </button>
              <button
                onClick={() => handleQuickAccess('coord@ten.com.br')}
                className="rounded border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 text-center"
              >
                Coord.
              </button>
              <button
                onClick={() => handleQuickAccess('gestor1@ten.com.br')}
                className="rounded border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 text-center"
              >
                Gestor
              </button>
              <button
                onClick={() => handleQuickAccess('comprador1@ten.com.br')}
                className="rounded border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 text-center"
              >
                Comprador
              </button>
              <button
                onClick={() => handleQuickAccess('solicitante1@ten.com.br')}
                className="rounded border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 text-center"
              >
                Solicitante
              </button>
              <button
                onClick={() => handleQuickAccess('atendente1@ten.com.br')}
                className="rounded border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 text-center"
              >
                Atendente
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Simple placeholder implementation to avoid ts issues
function AlertCircle(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}
