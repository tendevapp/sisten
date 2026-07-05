/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  User, Shield, KeyRound, Bell, Settings, Lock, Check, AlertTriangle, Building, Briefcase, Mail
} from 'lucide-react';
import { localDb } from '../db/localDb';
import { Profile } from '../types';

interface ProfileViewProps {
  user: Profile;
  onNavigate: (path: string) => void;
  onProfileUpdate?: () => void;
}

export default function ProfileView({ user, onNavigate, onProfileUpdate }: ProfileViewProps) {
  const [profile, setProfile] = useState<Profile>(user);
  
  // Profile Form State
  const [name, setName] = useState(user.name);
  const [cargo, setCargo] = useState(user.cargo);
  const [profileSuccess, setProfileSuccess] = useState(false);

  // Password Change State
  const [currentPass, setCurrentPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  // Notification Preference State
  const [notifPref, setNotifPref] = useState<'in-app' | 'both'>('in-app');
  const [notifSuccess, setNotifSuccess] = useState(false);

  const sector = localDb.getSectors().find(s => s.id === user.sector_id);
  const buyerGroups = localDb.getBuyerGroupsForUser(user.id);

  useEffect(() => {
    // Load preferences
    const pref = localDb.getNotificationPreferences(user.id);
    setNotifPref(pref);
  }, [user.id]);

  const handleUpdateProfile = (e: React.FormEvent) => {
    e.preventDefault();
    setProfileSuccess(false);
    if (!name.trim() || !cargo.trim()) return;

    const updated = localDb.updateProfileFields(user.id, name, cargo);
    if (updated) {
      setProfile(updated);
      setProfileSuccess(true);
      setTimeout(() => setProfileSuccess(false), 3000);
      onProfileUpdate?.();
      // Trigger a session reload or window reload of current user if needed, or simply let it persist
      window.dispatchEvent(new Event('storage'));
    }
  };

  const handleUpdatePassword = (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess(false);

    if (!currentPass || !newPass || !confirmPass) {
      setPasswordError('Todos os campos de senha são obrigatórios.');
      return;
    }

    if (newPass !== confirmPass) {
      setPasswordError('A nova senha e a confirmação não coincidem.');
      return;
    }

    if (newPass.length < 4) {
      setPasswordError('A nova senha deve ter pelo menos 4 caracteres.');
      return;
    }

    const ok = localDb.changePassword(user.id, currentPass, newPass);
    if (ok) {
      setPasswordSuccess(true);
      setCurrentPass('');
      setNewPass('');
      setConfirmPass('');
      setTimeout(() => setPasswordSuccess(false), 4000);
    } else {
      setPasswordError('A senha atual informada está incorreta.');
    }
  };

  const handleNotificationChange = (val: 'in-app' | 'both') => {
    setNotifPref(val);
    localDb.setNotificationPreferences(user.id, val);
    setNotifSuccess(true);
    setTimeout(() => setNotifSuccess(false), 2000);
  };

  const getRoleLabel = (role: string) => {
    const labels: Record<string, string> = {
      admin: 'Administrador',
      visualizador: 'Visualizador (Padrão)',
      solicitante: 'Solicitante',
      gestor: 'Gestor de Setor',
      comprador: 'Comprador SAP',
      coordenador_suprimentos: 'Coordenador de Suprimentos',
      atendente: 'Atendente de Suporte'
    };
    return labels[role] || role;
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 text-left py-4">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">Meu Perfil</h2>
        <p className="mt-1 text-sm text-slate-500">
          Gerencie suas informações cadastrais, preferências de notificação e segurança da conta.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Left Column: Account Details (Read-only) */}
        <div className="md:col-span-1 space-y-6">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm space-y-6">
            <div className="text-center">
              <div className="mx-auto h-20 w-20 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-800 font-bold text-3xl shadow-inner">
                {profile.name.charAt(0).toUpperCase()}
              </div>
              <h3 className="mt-3 text-lg font-bold text-slate-800 truncate">{profile.name}</h3>
              <p className="text-xs font-medium text-slate-500 truncate">{profile.cargo}</p>
            </div>

            <div className="border-t border-slate-100 pt-5 space-y-4 text-xs">
              <div className="flex items-center text-slate-600 gap-2.5">
                <Mail className="h-4 w-4 shrink-0 text-slate-400" />
                <span className="truncate" title={profile.email}>{profile.email}</span>
              </div>
              <div className="flex items-center text-slate-600 gap-2.5">
                <Building className="h-4 w-4 shrink-0 text-slate-400" />
                <span>Setor: <strong>{sector?.name || 'Não atribuído'}</strong></span>
              </div>
              <div className="flex items-center text-slate-600 gap-2.5">
                <Shield className="h-4 w-4 shrink-0 text-slate-400" />
                <span>Status: <strong className="text-emerald-700 uppercase">{profile.status}</strong></span>
              </div>
            </div>

            <div className="border-t border-slate-100 pt-5 space-y-2 text-xs">
              <p className="font-bold text-slate-700">Meus Papéis de Acesso:</p>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {profile.roles.map((r, idx) => (
                  <span key={idx} className="inline-flex items-center px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold border border-slate-200 text-[10px]">
                    {getRoleLabel(r)}
                  </span>
                ))}
              </div>
            </div>

            {profile.roles.includes('comprador') && (
              <div className="border-t border-slate-100 pt-5 space-y-2 text-xs">
                <p className="font-bold text-slate-700">Grupos de Compras SAP (Somente Leitura):</p>
                {buyerGroups.length === 0 ? (
                  <p className="text-[11px] text-slate-400 italic">Nenhum grupo SAP associado.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {buyerGroups.map((bg) => (
                      <span key={bg.id} className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border ${bg.is_primary ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-slate-50 border-slate-200 text-slate-600'}`}>
                        {bg.group_code} {bg.is_primary ? '(Principal)' : ''}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Columns: Edit Tabs */}
        <div className="md:col-span-2 space-y-8">
          {/* Section: Edit Profile Fields */}
          <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm space-y-6">
            <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <User className="h-5 w-5 text-emerald-600" /> Dados Pessoais
            </h3>
            
            <form onSubmit={handleUpdateProfile} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Nome Completo</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 p-2.5 focus:border-emerald-500 focus:outline-none"
                    placeholder="Seu nome completo"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Cargo / Função</label>
                  <input
                    type="text"
                    value={cargo}
                    onChange={(e) => setCargo(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 p-2.5 focus:border-emerald-500 focus:outline-none"
                    placeholder="Ex: Engenheiro de Processos"
                    required
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                {profileSuccess && (
                  <span className="text-xs font-bold text-emerald-700 flex items-center gap-1 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-100">
                    <Check className="h-4 w-4" /> Alterações salvas com sucesso!
                  </span>
                )}
                <span className="flex-1" />
                <button
                  type="submit"
                  className="rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs py-2 px-5 cursor-pointer shadow-sm transition-colors"
                >
                  Salvar Dados
                </button>
              </div>
            </form>
          </div>

          {/* Section: Change Password */}
          <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm space-y-6">
            <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-emerald-600" /> Segurança & Senha
            </h3>

            <form onSubmit={handleUpdatePassword} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Senha Atual</label>
                  <input
                    type="password"
                    value={currentPass}
                    onChange={(e) => setCurrentPass(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 p-2.5 focus:border-emerald-500 focus:outline-none"
                    placeholder="Digite sua senha atual"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Nova Senha</label>
                  <input
                    type="password"
                    value={newPass}
                    onChange={(e) => setNewPass(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 p-2.5 focus:border-emerald-500 focus:outline-none"
                    placeholder="Mínimo 4 caracteres"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Confirmar Nova Senha</label>
                  <input
                    type="password"
                    value={confirmPass}
                    onChange={(e) => setConfirmPass(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 p-2.5 focus:border-emerald-500 focus:outline-none"
                    placeholder="Repita a nova senha"
                    required
                  />
                </div>
              </div>

              {passwordError && (
                <div className="rounded-lg bg-red-50 p-3 text-xs font-semibold text-red-600 border border-red-100 flex items-center gap-1.5">
                  <AlertTriangle className="h-4.5 w-4.5 text-red-500 shrink-0" />
                  <span>{passwordError}</span>
                </div>
              )}

              <div className="flex items-center justify-between pt-2">
                {passwordSuccess && (
                  <span className="text-xs font-bold text-emerald-700 flex items-center gap-1 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-100">
                    <Check className="h-4 w-4" /> Senha atualizada com sucesso!
                  </span>
                )}
                <span className="flex-1" />
                <button
                  type="submit"
                  className="rounded-lg bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs py-2 px-5 cursor-pointer shadow-sm transition-colors"
                >
                  Alterar Senha
                </button>
              </div>
            </form>
          </div>

          {/* Section: Notification Preferences */}
          <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm space-y-6">
            <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <Bell className="h-5 w-5 text-emerald-600" /> Preferências de Notificação
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Defina como você deseja receber os alertas operacionais, como avisos de criticidade elevada ou atribuições de compras e chamados.
            </p>

            <div className="space-y-3.5 text-xs">
              <label className="flex items-start gap-3 p-3.5 rounded-xl border border-slate-100 hover:bg-slate-50/50 cursor-pointer transition-colors">
                <input
                  type="radio"
                  name="notif_pref"
                  checked={notifPref === 'in-app'}
                  onChange={() => handleNotificationChange('in-app')}
                  className="mt-0.5 text-emerald-600 focus:ring-emerald-500 h-4 w-4"
                />
                <div>
                  <p className="font-bold text-slate-800">Apenas In-App (Sino no cabeçalho)</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">As notificações serão exibidas apenas no centro de alertas do sistema interno.</p>
                </div>
              </label>

              <label className="flex items-start gap-3 p-3.5 rounded-xl border border-slate-100 hover:bg-slate-50/50 cursor-pointer transition-colors">
                <input
                  type="radio"
                  name="notif_pref"
                  checked={notifPref === 'both'}
                  onChange={() => handleNotificationChange('both')}
                  className="mt-0.5 text-emerald-600 focus:ring-emerald-500 h-4 w-4"
                />
                <div>
                  <p className="font-bold text-slate-800">Notificação In-App + Notificação de E-mail para eventos críticos</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Receba alertas em tempo real no sistema e avisos imediatos por e-mail para chamados urgentes e criticidades 4 e 5.</p>
                </div>
              </label>

              {notifSuccess && (
                <div className="text-xs font-bold text-emerald-700 flex items-center gap-1 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-100 max-w-fit">
                  <Check className="h-4 w-4" /> Preferências atualizadas automaticamente!
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
