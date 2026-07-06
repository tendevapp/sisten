/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { ArrowLeft, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
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
            onClick={() => onNavigate('/login')}
            className="flex items-center text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors mb-6 cursor-pointer"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar ao login
          </button>

          {!success ? (
            <>
              <h3 className="text-2xl font-extrabold tracking-tight text-slate-900">Solicitar cadastro</h3>
              <p className="mt-1.5 text-sm text-slate-500">Crie seu perfil e aguarde liberação de acesso do administrador.</p>

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
                  <label className="text-xs font-bold text-slate-700">E-mail corporativo</label>
                  <input
                    type="email"
                    required
                    placeholder="seu.nome@ten.com.br"
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

                <button
                  type="submit"
                  disabled={loading}
                  className="flex w-full items-center justify-center rounded-xl bg-[#0056c6] hover:bg-[#004bb0] py-2.5 text-sm font-bold text-white focus:outline-none disabled:opacity-50 transition-colors cursor-pointer"
                >
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Solicitar Cadastro'}
                </button>
              </form>
            </>
          ) : (
            <div className="py-6 text-center">
              <CheckCircle2 className="mx-auto h-16 w-16 text-emerald-500 animate-bounce" />
              <h3 className="mt-4 text-xl font-bold text-slate-900">Cadastro solicitado!</h3>
              <p className="mt-2 text-sm text-slate-500 leading-relaxed">
                Sua solicitação de acesso foi enviada com sucesso para a equipe de administração da Torres Eólicas do Nordeste (TEN).
              </p>
              <div className="mt-6 rounded-2xl bg-slate-50 p-4 text-left text-xs text-slate-650 border border-slate-100">
                <p className="font-bold">E-mail: <span className="font-semibold text-slate-900">{email}</span></p>
                <p className="font-bold mt-1">Status: <span className="font-semibold text-amber-600">Aguardando Aprovação</span></p>
                <p className="mt-2 text-slate-400">Assim que seu perfil for aprovado, você receberá permissão para efetuar login na plataforma.</p>
              </div>
              <button
                onClick={() => onNavigate('/login')}
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
