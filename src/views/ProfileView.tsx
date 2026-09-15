/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  User, Shield, KeyRound, Bell, Settings, Lock, Check, AlertTriangle, Building, Briefcase, Mail,
  Headphones, ShoppingCart, ShieldAlert, LayoutList, Building2, Volume2, VolumeX, Laptop,
  Loader2, CheckCheck, XCircle, SlidersHorizontal, Sparkles
} from 'lucide-react';
import { localDb } from '../db/localDb';
import { Profile, UserNotificationPreferences } from '../types';
import { useToast } from '../components/ui/Toast';
import {
  obterPreferenciasNotificacao,
  salvarPreferenciasNotificacao,
  GRUPOS_NOTIFICACAO,
  GrupoNotificacaoConfig,
} from '../lib/userNotificationPreferences';
import {
  lerPrefsAviso,
  gravarPrefsAviso,
  permissaoDesktop,
  pedirPermissaoDesktop,
  tocarBipe,
  type AvisoPrefs,
  type PermissaoDesktop,
} from '../lib/avisosNotificacao';

interface ProfileViewProps {
  user: Profile;
  onNavigate: (path: string) => void;
  onProfileUpdate?: () => void;
}

export default function ProfileView({ user, onNavigate, onProfileUpdate }: ProfileViewProps) {
  const toast = useToast();
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

  // Notification Preferences State (Completo por Módulo)
  const [preferenciasNotif, setPreferenciasNotif] = useState<UserNotificationPreferences>(() =>
    obterPreferenciasNotificacao(user.id)
  );
  const [salvandoNotif, setSalvandoNotif] = useState(false);
  const [notifSuccess, setNotifSuccess] = useState(false);

  // Alertas de Desktop e Som
  const [avisoPrefs, setAvisoPrefs] = useState<AvisoPrefs>(() => lerPrefsAviso(user.id));
  const [permDesktop, setPermDesktop] = useState<PermissaoDesktop>(() => permissaoDesktop());

  const sector = localDb.getSectors().find(s => s.id === user.sector_id);
  const buyerGroups = localDb.getBuyerGroupsForUser(user.id);

  useEffect(() => {
    // Sincronizar preferências atualizadas caso o perfil mude
    const prefs = obterPreferenciasNotificacao(user.id);
    setPreferenciasNotif(prefs);
    setAvisoPrefs(lerPrefsAviso(user.id));
    setPermDesktop(permissaoDesktop());
  }, [user.id]);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileSuccess(false);
    if (!name.trim() || !cargo.trim()) return;

    const updated = await localDb.updateProfileFields(user.id, name, cargo);
    if (updated) {
      setProfile(updated);
      setProfileSuccess(true);
      setTimeout(() => setProfileSuccess(false), 3000);
      onProfileUpdate?.();
      // Trigger a session reload or window reload of current user if needed, or simply let it persist
      window.dispatchEvent(new Event('storage'));
    } else {
      toast.error('Falha ao salvar no Supabase. A alteração não foi persistida — tente novamente.');
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess(false);

    if (!newPass || !confirmPass) {
      setPasswordError('Todos os campos de senha são obrigatórios.');
      return;
    }

    if (newPass !== confirmPass) {
      setPasswordError('A nova senha e a confirmação não coincidem.');
      return;
    }

    if (newPass.length < 6) {
      setPasswordError('A nova senha deve ter pelo menos 6 caracteres.');
      return;
    }

    const ok = await localDb.changePassword(newPass);
    if (ok) {
      setPasswordSuccess(true);
      setNewPass('');
      setConfirmPass('');
      setTimeout(() => setPasswordSuccess(false), 4000);
    } else {
      setPasswordError('Erro ao atualizar a senha no servidor.');
    }
  };

  const totalCategorias = useMemo(() => {
    let total = 0;
    let ativas = 0;
    for (const grupo of GRUPOS_NOTIFICACAO) {
      for (const item of grupo.itens) {
        total++;
        if (preferenciasNotif[item.key]) ativas++;
      }
    }
    return { total, ativas };
  }, [preferenciasNotif]);

  const handleToggleCategoria = (chave: keyof Omit<UserNotificationPreferences, 'channel'>) => {
    setPreferenciasNotif((prev) => ({
      ...prev,
      [chave]: !prev[chave],
    }));
  };

  const handleMarcarTodasCategorias = (ativar: boolean) => {
    setPreferenciasNotif((prev) => {
      const proximo = { ...prev };
      for (const grupo of GRUPOS_NOTIFICACAO) {
        for (const item of grupo.itens) {
          proximo[item.key] = ativar;
        }
      }
      return proximo;
    });
  };

  const handleMarcarGrupo = (grupo: GrupoNotificacaoConfig, ativar: boolean) => {
    setPreferenciasNotif((prev) => {
      const proximo = { ...prev };
      for (const item of grupo.itens) {
        proximo[item.key] = ativar;
      }
      return proximo;
    });
  };

  const handleCanalChange = (val: 'in-app' | 'both') => {
    setPreferenciasNotif((prev) => ({
      ...prev,
      channel: val,
    }));
  };

  const handleToggleDesktop = async () => {
    if (!avisoPrefs.desktop) {
      const perm = await pedirPermissaoDesktop();
      setPermDesktop(perm);
      if (perm === 'granted') {
        const nova = { ...avisoPrefs, desktop: true };
        setAvisoPrefs(nova);
        gravarPrefsAviso(user.id, nova);
        toast.success('Notificações no sistema operacional ativadas!');
      } else if (perm === 'denied') {
        toast.error('Notificações bloqueadas pelo navegador. Habilite nas permissões do site.');
      }
    } else {
      const nova = { ...avisoPrefs, desktop: false };
      setAvisoPrefs(nova);
      gravarPrefsAviso(user.id, nova);
    }
  };

  const handleToggleSom = () => {
    const nova = { ...avisoPrefs, som: !avisoPrefs.som };
    setAvisoPrefs(nova);
    gravarPrefsAviso(user.id, nova);
    if (nova.som) {
      tocarBipe();
    }
  };

  const handleSalvarNotificacoes = async () => {
    setSalvandoNotif(true);
    setNotifSuccess(false);

    const ok = await salvarPreferenciasNotificacao(user.id, preferenciasNotif);
    gravarPrefsAviso(user.id, avisoPrefs);

    setSalvandoNotif(false);
    if (ok) {
      setNotifSuccess(true);
      toast.success('Preferências de notificação salvas com sucesso!');
      setTimeout(() => setNotifSuccess(false), 4000);
      onProfileUpdate?.();
    } else {
      toast.error('Falha ao sincronizar com o servidor. As alterações foram salvas localmente.');
    }
  };

  const renderIconeGrupo = (icone: string) => {
    switch (icone) {
      case 'Headphones':
        return <Headphones className="h-4 w-4" />;
      case 'ShoppingCart':
        return <ShoppingCart className="h-4 w-4" />;
      case 'ShieldAlert':
        return <ShieldAlert className="h-4 w-4" />;
      case 'LayoutList':
        return <LayoutList className="h-4 w-4" />;
      case 'Building2':
        return <Building2 className="h-4 w-4" />;
      case 'AlertTriangle':
        return <AlertTriangle className="h-4 w-4" />;
      default:
        return <Bell className="h-4 w-4" />;
    }
  };

  const getRoleLabel = (role: string) => {
    const labels: Record<string, string> = {
      admin: 'Administrador',
      visualizador: 'Visualizador (Padrão)',
      solicitante: 'Solicitante',
      requisitante: 'Requisitante',
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
                    onChange={(e) => setName(e.target.value.toUpperCase())}
                    className="w-full rounded-lg border border-slate-200 p-2.5 focus:border-emerald-500 focus:outline-none uppercase"
                    placeholder="SEU NOME COMPLETO"
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Nova Senha</label>
                  <input
                    type="password"
                    value={newPass}
                    onChange={(e) => setNewPass(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 p-2.5 focus:border-emerald-500 focus:outline-none"
                    placeholder="Mínimo 6 caracteres"
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
          <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm space-y-6 dark:border-slate-800 dark:bg-slate-900">
            {/* Cabeçalho da Seção com Contagem e Ações em Lote */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-4 dark:border-slate-800">
              <div>
                <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <Bell className="h-5 w-5 text-emerald-600" /> Preferências de Notificação
                  <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800 shadow-2xs">
                    {totalCategorias.ativas} de {totalCategorias.total} ativas
                  </span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Personalize exatamente quais alertas e avisos operacionais você deseja receber no SISTEN.
                </p>
              </div>

              <div className="flex items-center gap-2 self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => handleMarcarTodasCategorias(true)}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 transition-colors cursor-pointer shadow-2xs"
                  title="Ativar todas as notificações"
                >
                  <CheckCheck className="h-3.5 w-3.5 text-emerald-600" /> Ativar Todas
                </button>
                <button
                  type="button"
                  onClick={() => handleMarcarTodasCategorias(false)}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 transition-colors cursor-pointer shadow-2xs"
                  title="Desativar todas as notificações"
                >
                  <XCircle className="h-3.5 w-3.5 text-rose-500" /> Desativar Todas
                </button>
              </div>
            </div>

            {/* Canal de Entrega & Dispositivo */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                <SlidersHorizontal className="h-3.5 w-3.5 text-emerald-600" /> Canal de Entrega & Dispositivo
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <label
                  className={`flex items-start gap-3 p-3.5 rounded-xl border transition-colors cursor-pointer ${
                    preferenciasNotif.channel === 'in-app'
                      ? 'border-emerald-500/60 bg-emerald-50/20 dark:bg-emerald-950/20'
                      : 'border-slate-200 hover:bg-slate-50/50 dark:border-slate-800'
                  }`}
                >
                  <input
                    type="radio"
                    name="notif_canal"
                    checked={preferenciasNotif.channel === 'in-app'}
                    onChange={() => handleCanalChange('in-app')}
                    className="mt-0.5 text-emerald-600 focus:ring-emerald-500 h-4 w-4"
                  />
                  <div>
                    <p className="font-bold text-slate-800 dark:text-slate-100">Apenas In-App</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Sino de avisos no cabeçalho e centro de notificações interno do SISTEN.
                    </p>
                  </div>
                </label>

                <label
                  className={`flex items-start gap-3 p-3.5 rounded-xl border transition-colors cursor-pointer ${
                    preferenciasNotif.channel === 'both'
                      ? 'border-emerald-500/60 bg-emerald-50/20 dark:bg-emerald-950/20'
                      : 'border-slate-200 hover:bg-slate-50/50 dark:border-slate-800'
                  }`}
                >
                  <input
                    type="radio"
                    name="notif_canal"
                    checked={preferenciasNotif.channel === 'both'}
                    onChange={() => handleCanalChange('both')}
                    className="mt-0.5 text-emerald-600 focus:ring-emerald-500 h-4 w-4"
                  />
                  <div>
                    <p className="font-bold text-slate-800 dark:text-slate-100">In-App + E-mail Crítico</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Avisos em tempo real no sistema e e-mails para chamados urgentes e criticidades 4 e 5.
                    </p>
                  </div>
                </label>
              </div>

              {/* Reforços do Navegador (Desktop e Som) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-1">
                <div className="flex items-center justify-between p-3 rounded-xl border border-slate-200/80 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/40">
                  <div className="flex items-center gap-2">
                    <Laptop className="h-4 w-4 text-slate-500" />
                    <div>
                      <p className="font-bold text-slate-800 dark:text-slate-200 text-xs">
                        Avisos no Sistema Operacional
                      </p>
                      <p className="text-[10px] text-slate-400">
                        {permDesktop === 'granted'
                          ? 'Notificação popup na área de trabalho'
                          : permDesktop === 'denied'
                          ? 'Bloqueado no navegador (habilite no cadeado da URL)'
                          : 'Popup nativo fora da aba do navegador'}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={avisoPrefs.desktop}
                    onClick={handleToggleDesktop}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      avisoPrefs.desktop ? 'bg-emerald-600' : 'bg-slate-300 dark:bg-slate-700'
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                        avisoPrefs.desktop ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl border border-slate-200/80 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/40">
                  <div className="flex items-center gap-2">
                    {avisoPrefs.som ? (
                      <Volume2 className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <VolumeX className="h-4 w-4 text-slate-400" />
                    )}
                    <div>
                      <p className="font-bold text-slate-800 dark:text-slate-200 text-xs">Aviso Sonoro</p>
                      <p className="text-[10px] text-slate-400">Bipe curto e discreto de 2 notas</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={avisoPrefs.som}
                    onClick={handleToggleSom}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      avisoPrefs.som ? 'bg-emerald-600' : 'bg-slate-300 dark:bg-slate-700'
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                        avisoPrefs.som ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>

            {/* Categorias de Notificação por Módulo */}
            <div className="space-y-4 pt-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                  Escolha o que deseja ser notificado
                </h4>
                <span className="text-[11px] text-slate-400 font-medium">
                  Ative ou desative cada categoria
                </span>
              </div>

              <div className="space-y-4">
                {GRUPOS_NOTIFICACAO.map((grupo) => {
                  const itensAtivos = grupo.itens.filter((it) => preferenciasNotif[it.key]).length;

                  return (
                    <div
                      key={grupo.id}
                      className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-slate-900/60 space-y-3"
                    >
                      <div className="flex items-center justify-between border-b border-slate-100 pb-2.5 dark:border-slate-800/80">
                        <div className="flex items-center gap-2">
                          <div
                            className={`flex h-7 w-7 items-center justify-center rounded-lg border ${grupo.cor}`}
                          >
                            {renderIconeGrupo(grupo.icone)}
                          </div>
                          <div>
                            <h5 className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                              {grupo.titulo}
                              <span className="text-[10px] font-semibold text-slate-400">
                                ({itensAtivos}/{grupo.itens.length} ativos)
                              </span>
                            </h5>
                            <p className="text-[11px] text-slate-400">{grupo.descricao}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleMarcarGrupo(grupo, true)}
                            className="rounded px-2 py-0.5 text-[10px] font-bold text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-950 transition-colors cursor-pointer"
                          >
                            Todos
                          </button>
                          <span className="text-slate-300 dark:text-slate-700">|</span>
                          <button
                            type="button"
                            onClick={() => handleMarcarGrupo(grupo, false)}
                            className="rounded px-2 py-0.5 text-[10px] font-bold text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                          >
                            Nenhum
                          </button>
                        </div>
                      </div>

                      <div className="divide-y divide-slate-100/80 dark:divide-slate-800/60">
                        {grupo.itens.map((item) => {
                          const ativo = preferenciasNotif[item.key];

                          return (
                            <div
                              key={item.key}
                              className="flex items-center justify-between py-2.5 first:pt-1 last:pb-1 group"
                            >
                              <div className="flex-1 pr-4">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                                    {item.label}
                                  </span>
                                  {item.badge && (
                                    <span className="rounded bg-slate-100 px-1.5 py-0.2 text-[9px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                      {item.badge}
                                    </span>
                                  )}
                                </div>
                                <p className="text-[11px] text-slate-400 dark:text-slate-400 mt-0.5 leading-snug">
                                  {item.descricao}
                                </p>
                              </div>

                              <button
                                type="button"
                                role="switch"
                                aria-checked={ativo}
                                onClick={() => handleToggleCategoria(item.key)}
                                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                  ativo ? 'bg-emerald-600' : 'bg-slate-200 dark:bg-slate-700'
                                }`}
                              >
                                <span
                                  aria-hidden="true"
                                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                                    ativo ? 'translate-x-4' : 'translate-x-0'
                                  }`}
                                />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Rodapé da Seção com Botão Salvar */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
              <div>
                {notifSuccess && (
                  <span className="text-xs font-bold text-emerald-700 flex items-center gap-1.5 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800">
                    <Check className="h-4 w-4" /> Preferências salvas com sucesso!
                  </span>
                )}
              </div>

              <button
                type="button"
                disabled={salvandoNotif}
                onClick={handleSalvarNotificacoes}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs py-2.5 px-6 cursor-pointer shadow-sm disabled:opacity-50 transition-colors self-end"
              >
                {salvandoNotif ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Salvar Preferências de Notificação
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
