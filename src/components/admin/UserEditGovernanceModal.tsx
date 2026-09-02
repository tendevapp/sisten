import React, { useState, useEffect, useMemo } from 'react';
import {
  X, Check, User, Shield, Building2, Briefcase, KeyRound,
  FileCheck, Sparkles, AlertCircle, ShoppingBag, Eye, Lock,
  Save, SlidersHorizontal, CheckCircle2, Search
} from 'lucide-react';
import { Profile, Sector, Role } from '../../types';
import { localDb } from '../../db/localDb';
import { useToast } from '../ui/Toast';

interface UserEditGovernanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: Profile | null;
  sectors: Sector[];
  currentUserId: string;
  onSaveSuccess: () => void;
  onOpenPageAccess: (userId: string) => void;
  onOpenResetPassword: (userId: string) => void;
}

const ROLES_INFO: { role: Role; label: string; desc: string; color: string }[] = [
  { role: 'admin', label: 'Administrador', desc: 'Acesso irrestrito a todos os módulos, cadastros, aprovações e painel admin.', color: 'bg-amber-100 text-amber-900 border-amber-300' },
  { role: 'comprador', label: 'Comprador', desc: 'Gestão de cotações, painel de suprimentos, negociação e pedidos.', color: 'bg-emerald-100 text-emerald-900 border-emerald-300' },
  { role: 'coordenador_suprimentos', label: 'Coordenador de Suprimentos', desc: 'Supervisão de cotações, alocação de compradores e aprovações de compras.', color: 'bg-purple-100 text-purple-900 border-purple-300' },
  { role: 'gestor', label: 'Gestor / Aprovador', desc: 'Aprova requisições de compras e chamados de setores designados.', color: 'bg-indigo-100 text-indigo-900 border-indigo-300' },
  { role: 'solicitante', label: 'Solicitante', desc: 'Cria novas solicitações de compras, materiais e chamados.', color: 'bg-sky-100 text-sky-900 border-sky-300' },
  { role: 'requisitante', label: 'Requisitante', desc: 'Consulta e acompanha requisições vinculadas aos seus centros.', color: 'bg-blue-100 text-blue-900 border-blue-300' },
  { role: 'atendente', label: 'Atendente de Suporte', desc: 'Atendimento de chamados e suporte Helpdesk de setores.', color: 'bg-teal-100 text-teal-900 border-teal-300' },
  { role: 'visualizador', label: 'Visualizador', desc: 'Acesso somente-leitura aos relatórios e consultas básicas.', color: 'bg-slate-100 text-slate-800 border-slate-300' },
];

export default function UserEditGovernanceModal({
  isOpen,
  onClose,
  profile,
  sectors,
  currentUserId,
  onSaveSuccess,
  onOpenPageAccess,
  onOpenResetPassword,
}: UserEditGovernanceModalProps) {
  const toast = useToast();

  const [activeTab, setActiveTab] = useState<'perfil' | 'permissoes' | 'aprovacoes'>('perfil');
  const [name, setName] = useState('');
  const [cargo, setCargo] = useState('');
  const [sectorId, setSectorId] = useState('');
  const [status, setStatus] = useState<'ativo' | 'inativo' | 'pendente'>('ativo');
  const [role, setRole] = useState<Role>('visualizador');
  const [grupoCompras, setGrupoCompras] = useState('');
  const [aprovadorSetores, setAprovadorSetores] = useState<string[]>([]);
  const [aprovadorCadastroSap, setAprovadorCadastroSap] = useState(false);
  const [filtroSetores, setFiltroSetores] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile) {
      setName(profile.name || '');
      setCargo(profile.cargo || '');
      setSectorId(profile.sector_id || '');
      setStatus(profile.status || 'ativo');
      setRole((profile.roles?.[0] as Role) || 'visualizador');
      setGrupoCompras(profile.grupo_compras || '');
      setAprovadorSetores(profile.aprovador_setores || []);
      setAprovadorCadastroSap(!!profile.aprovador_cadastro_sap);
      setActiveTab('perfil');
    }
  }, [profile]);

  if (!isOpen || !profile) return null;

  const getInitials = (str: string) => {
    if (!str) return 'U';
    const parts = str.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const setoresFiltrados = useMemo(() => {
    const q = filtroSetores.trim().toLowerCase();
    if (!q) return sectors;
    return sectors.filter(s => s.name.toLowerCase().includes(q));
  }, [sectors, filtroSetores]);

  const handleToggleSetor = (id: string) => {
    setAprovadorSetores(prev =>
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    );
  };

  const handleSelecionarTodosSetores = () => {
    setAprovadorSetores(sectors.map(s => s.id));
  };

  const handleLimparSetores = () => {
    setAprovadorSetores([]);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('O nome do usuário não pode ficar vazio.');
      return;
    }

    setSaving(true);
    try {
      // 1. Update Profile Fields (Name, Cargo, Sector)
      await localDb.updateProfileFields(profile.id, name.trim(), cargo.trim(), sectorId);

      // 2. Update Role if changed
      if (role !== profile.roles?.[0]) {
        await localDb.updateUserRole(profile.id, role);
      }

      // 3. Update Status if changed
      if (status !== profile.status) {
        await localDb.updateUserStatus(profile.id, status as any);
      }

      // 4. Update Grupo Compras if changed
      if (grupoCompras.trim() !== (profile.grupo_compras || '').trim()) {
        await localDb.updateUserGrupoCompras(profile.id, grupoCompras.trim());
      }

      // 5. Update Approver Sectors
      await localDb.updateUserAprovadorSetores(profile.id, aprovadorSetores);

      // 6. Update SAP Approver
      await localDb.updateUserAprovadorCadastroSap(profile.id, aprovadorCadastroSap);

      toast.success(`Usuário ${name} atualizado com sucesso!`);
      onSaveSuccess();
      onClose();
    } catch (err: any) {
      console.error('Erro ao salvar alterações do usuário:', err);
      toast.error('Erro ao salvar alterações: ' + (err?.message || 'Falha de comunicação.'));
    } finally {
      setSaving(false);
    }
  };

  const isSelf = profile.id === currentUserId;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header com Avatar e Identificação */}
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-950 p-5 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-emerald-600/90 text-white font-bold text-lg flex items-center justify-center shadow-inner border border-white/10 shrink-0">
              {getInitials(profile.name)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white tracking-tight">{profile.name}</h3>
                {status === 'ativo' ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    Ativo
                  </span>
                ) : status === 'pendente' ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    Pendente
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                    Inativo
                  </span>
                )}
                {isSelf && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-500/20 text-sky-300 border border-sky-500/30">
                    Você
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-300 mt-0.5">{profile.email}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs de navegação interna */}
        <div className="flex border-b border-slate-100 bg-slate-50/80 px-5 pt-2 text-xs font-semibold shrink-0 gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('perfil')}
            className={`pb-2.5 px-3 border-b-2 flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'perfil'
                ? 'border-emerald-600 text-emerald-800 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <User className="w-3.5 h-3.5" /> Dados do Perfil
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('permissoes')}
            className={`pb-2.5 px-3 border-b-2 flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'permissoes'
                ? 'border-emerald-600 text-emerald-800 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Shield className="w-3.5 h-3.5" /> Papel & Acessos
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('aprovacoes')}
            className={`pb-2.5 px-3 border-b-2 flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'aprovacoes'
                ? 'border-emerald-600 text-emerald-800 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <FileCheck className="w-3.5 h-3.5" /> Alçadas de Aprovação
          </button>
        </div>

        {/* Form com corpo rolável e rodapé fixo */}
        <form onSubmit={handleSave} className="flex-1 flex flex-col min-h-0 overflow-hidden text-left">
          <div className="flex-1 overflow-y-auto p-6 space-y-5">
            {activeTab === 'perfil' && (
              <div className="space-y-4 animate-in fade-in-50 duration-150">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-slate-700 mb-1">Nome Completo</label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value.toUpperCase())}
                      required
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-medium text-slate-900 focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 bg-white uppercase"
                      placeholder="EX: JOÃO DA SILVA"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">E-mail Corporativo</label>
                    <input
                      type="text"
                      value={profile.email}
                      disabled
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-500 bg-slate-50 cursor-not-allowed font-mono"
                    />
                    <span className="text-[10px] text-slate-400 mt-1 block">O e-mail é a chave de autenticação exclusiva.</span>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Cargo / Função</label>
                    <input
                      type="text"
                      value={cargo}
                      onChange={(e) => setCargo(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 bg-white"
                      placeholder="Ex: Analista de Suprimentos Pleno"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Setor Corporativo</label>
                    <select
                      value={sectorId}
                      onChange={(e) => setSectorId(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 bg-white cursor-pointer"
                    >
                      <option value="">Selecione o setor...</option>
                      {sectors.map((sec) => (
                        <option key={sec.id} value={sec.id}>
                          {sec.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Status da Conta</label>
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value as any)}
                      disabled={isSelf}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 bg-white cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      <option value="ativo">Ativo (Acesso Liberado)</option>
                      <option value="inativo">Inativo (Bloqueado)</option>
                      <option value="pendente">Pendente de Aprovação</option>
                    </select>
                    {isSelf && (
                      <span className="text-[10px] text-amber-600 mt-1 block font-medium">Você não pode desativar seu próprio login.</span>
                    )}
                  </div>
                </div>

                {/* Ações de Segurança Rápidas */}
                <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-slate-50/60 p-3.5 rounded-xl">
                  <div>
                    <p className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5 text-slate-500" /> Segurança de Senha
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">Definir senha temporária para o colaborador.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpenResetPassword(profile.id)}
                    disabled={isSelf}
                    className="px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-800 text-xs font-bold transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
                  >
                    <KeyRound className="w-3.5 h-3.5" /> Resetar Senha
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'permissoes' && (
              <div className="space-y-4 animate-in fade-in-50 duration-150">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">Papel Principal de Acesso (Role)</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {ROLES_INFO.map((r) => {
                      const isSelected = role === r.role;
                      return (
                        <div
                          key={r.role}
                          onClick={() => setRole(r.role)}
                          className={`p-3 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                            isSelected
                              ? 'border-emerald-600 bg-emerald-50/50 shadow-xs ring-1 ring-emerald-600'
                              : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-md border ${r.color}`}>
                              {r.label}
                            </span>
                            {isSelected && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                          </div>
                          <p className="text-[11px] text-slate-500 leading-relaxed mt-1">{r.desc}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Grupo de Compras SAP */}
                <div className="pt-3 border-t border-slate-100">
                  <label className="block text-xs font-bold text-slate-700 mb-1">Grupo de Compras SAP Associado</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={grupoCompras}
                      onChange={(e) => setGrupoCompras(e.target.value)}
                      placeholder="Ex: 314, 358"
                      className="w-48 px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-mono text-slate-900 focus:outline-none focus:border-emerald-600 bg-white"
                    />
                    <span className="text-[11px] text-slate-400">Vincular a demandas e pedidos deste código SAP.</span>
                  </div>
                </div>

                {/* Módulos de Acesso Customizados */}
                <div className="pt-3 border-t border-slate-100 flex items-center justify-between bg-slate-50 p-3.5 rounded-xl border border-slate-100">
                  <div>
                    <p className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500" /> Permissões Granulares por Módulo
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">Liberar ou restringir páginas individuais (ex: Compras, RH, Portaria).</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpenPageAccess(profile.id)}
                    className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
                  >
                    Configurar Módulos &rarr;
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'aprovacoes' && (
              <div className="space-y-4 animate-in fade-in-50 duration-150">
                {/* Painel de Seleção de Setores Solicitantes */}
                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 space-y-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <label className="block text-xs font-bold text-slate-800">
                        Setores Solicitantes que este usuário pode Aprovar
                      </label>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        O usuário receberá notificações de aprovação para solicitações de compras abertas por estes setores.
                      </p>
                    </div>
                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold border transition-colors ${
                      aprovadorSetores.length > 0
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                        : 'bg-slate-100 text-slate-500 border-slate-200'
                    }`}>
                      {aprovadorSetores.length === 0
                        ? 'Nenhum setor'
                        : aprovadorSetores.length === 1
                        ? '1 setor selecionado'
                        : `${aprovadorSetores.length} setores selecionados`}
                    </span>
                  </div>

                  {/* Chips de setores selecionados com remoção direta */}
                  {aprovadorSetores.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      {aprovadorSetores.map(id => {
                        const sec = sectors.find(s => s.id === id);
                        return (
                          <span
                            key={id}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-100 text-emerald-900 border border-emerald-300 shadow-2xs transition-all"
                          >
                            <span>{sec?.name || id}</span>
                            <button
                              type="button"
                              onClick={() => handleToggleSetor(id)}
                              className="rounded-full p-0.5 hover:bg-emerald-200 text-emerald-700 hover:text-emerald-950 cursor-pointer"
                              title={`Remover ${sec?.name || id}`}
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  )}

                  {/* Barra de busca e ações rápidas */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <div className="relative flex-1 min-w-[200px]">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                      <input
                        type="text"
                        value={filtroSetores}
                        onChange={(e) => setFiltroSetores(e.target.value)}
                        placeholder="Buscar setor para aprovação..."
                        className="w-full pl-8 pr-8 py-1.5 rounded-xl border border-slate-200 bg-white text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
                      />
                      {filtroSetores && (
                        <button
                          type="button"
                          onClick={() => setFiltroSetores('')}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={handleSelecionarTodosSetores}
                        className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
                      >
                        Selecionar Todos
                      </button>
                      {aprovadorSetores.length > 0 && (
                        <button
                          type="button"
                          onClick={handleLimparSetores}
                          className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-rose-50 hover:text-rose-600 text-slate-500 text-xs font-semibold transition-colors cursor-pointer"
                        >
                          Limpar
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Grade de Setores com Checkboxes */}
                  <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-2xs">
                    <div className="max-h-52 overflow-y-auto p-2">
                      {setoresFiltrados.length === 0 ? (
                        <p className="py-6 text-center text-xs text-slate-400">
                          Nenhum setor encontrado para "{filtroSetores}".
                        </p>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                          {setoresFiltrados.map((s) => {
                            const marcado = aprovadorSetores.includes(s.id);
                            return (
                              <button
                                key={s.id}
                                type="button"
                                onClick={() => handleToggleSetor(s.id)}
                                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-xs transition-all cursor-pointer border ${
                                  marcado
                                    ? 'bg-emerald-50 border-emerald-300 text-emerald-950 font-bold shadow-2xs'
                                    : 'bg-white border-slate-100 hover:border-slate-300 hover:bg-slate-50/80 text-slate-700 font-medium'
                                }`}
                              >
                                <span
                                  className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                                    marcado
                                      ? 'bg-emerald-600 border-emerald-600 text-white'
                                      : 'border-slate-300 bg-white'
                                  }`}
                                >
                                  {marcado && <Check className="w-3 h-3 stroke-[3]" />}
                                </span>
                                <span className="truncate">{s.name}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Card Aprovador de Cadastro SAP */}
                <div className="p-4 rounded-2xl border border-amber-200/90 bg-amber-50/60 transition-all">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      id="modal-cadastro-sap-toggle"
                      checked={aprovadorCadastroSap}
                      onChange={(e) => setAprovadorCadastroSap(e.target.checked)}
                      className="mt-0.5 rounded border-amber-300 text-amber-600 focus:ring-amber-500 h-4 w-4 cursor-pointer"
                    />
                    <div className="space-y-0.5">
                      <span className="text-xs font-bold text-amber-950 block">
                        Aprovador de Cadastro SAP de Novos Materiais
                      </span>
                      <p className="text-[11px] text-amber-800/90 leading-relaxed">
                        Habilita este usuário para validar e aprovar solicitações de criação e ampliação de códigos de materiais requisitados pelas áreas para inclusão no SAP.
                      </p>
                    </div>
                  </label>
                </div>
              </div>
            )}
          </div>

          {/* Footer Modal Fixo */}
          <div className="border-t border-slate-200 bg-slate-50/80 px-6 py-3.5 flex items-center justify-end gap-2.5 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-100 font-bold text-xs transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white font-bold text-xs shadow-sm transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? 'Salvando...' : 'Salvar Alterações'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
