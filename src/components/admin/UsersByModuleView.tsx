/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import {
  Layers, Search, Users, ShieldCheck, Check, X, SlidersHorizontal, Settings2,
  Building2, Briefcase, Filter, ArrowRight, Lock, Unlock, Sparkles, ChevronRight,
  AlertCircle, Eye, CheckCircle2, XCircle, RotateCcw, UserPlus, Info, ExternalLink
} from 'lucide-react';
import { Profile, Sector } from '../../types';
import {
  canAccessPage, canAccessFormGroup, getPageGroups, PageDef, isUserAdriano, isUserSetorRh,
  FORMULARIO_SUBPERMISSOES,
} from '../../lib/pages';
import { localDb } from '../../db/localDb';
import { useToast } from '../ui/Toast';

interface UsersByModuleViewProps {
  profiles: Profile[];
  sectors: Sector[];
  currentUser: Profile;
  onChanged: () => void;
  onEditUser: (user: Profile) => void;
  onConfigurePermissions: (userId: string) => void;
}

type UserAccessType = 'admin' | 'role' | 'override_granted' | 'override_blocked' | 'no_access';

interface UserModuleStatus {
  user: Profile;
  hasAccess: boolean;
  accessType: UserAccessType;
  accessLabel: string;
  isOverride: boolean;
}

export default function UsersByModuleView({
  profiles,
  sectors,
  currentUser,
  onChanged,
  onEditUser,
  onConfigurePermissions,
}: UsersByModuleViewProps) {
  const toast = useToast();

  const [moduleSearch, setModuleSearch] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<string>('all');
  const [selectedPageId, setSelectedPageId] = useState<string>('solicitacoes_home');
  const [userSearch, setUserSearch] = useState('');
  const [accessFilter, setAccessFilter] = useState<'all' | 'with_access' | 'without_access' | 'overrides'>('with_access');
  const [sectorFilter, setSectorFilter] = useState<string>('all');
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const [aplicandoEmMassa, setAplicandoEmMassa] = useState(false);

  // Mapeamento de setores
  const sectorMap = useMemo(() => {
    const map = new Map<string, string>();
    sectors.forEach(s => map.set(s.id, s.name));
    return map;
  }, [sectors]);

  // Lista de todos os grupos e páginas do sistema, incluindo as subpermissões
  // de formulário — elas são o que decide quem enxerga cada grupo de
  // formulários, e antes ficavam de fora desta auditoria.
  const pageGroups = useMemo(() => getPageGroups(), []);

  /**
   * Acesso efetivo do usuário ao item selecionado.
   *
   * Para grupo de formulário a regra não é `canAccessPage`: além do override,
   * ela depende do acesso à página "Formulários" e do fallback do sinalizador
   * legado — tudo isso mora em `canAccessFormGroup`.
   */
  const temAcesso = (p: Profile, pageId: string): boolean => {
    const sub = FORMULARIO_SUBPERMISSOES.find(f => f.id === pageId);
    return sub ? canAccessFormGroup(p, sub.grupoId) : canAccessPage(p, pageId);
  };

  // Lista linear de todas as páginas
  const allPages = useMemo(() => {
    const list: PageDef[] = [];
    pageGroups.forEach(g => {
      g.pages.forEach(p => list.push(p));
    });
    return list;
  }, [pageGroups]);

  // Lista de grupos únicos para filtro em chips
  const groupNames = useMemo(() => {
    return Array.from(new Set(pageGroups.map(g => g.group)));
  }, [pageGroups]);

  // Usuários ativos para análise de acesso
  const activeProfiles = useMemo(() => {
    return profiles.filter(p => p.status === 'ativo');
  }, [profiles]);

  // Resumo de contagem de acesso por página
  const pageStats = useMemo(() => {
    const stats: Record<string, { total: number; withAccess: number; overrides: number }> = {};
    const totalUsers = activeProfiles.length;

    allPages.forEach(page => {
      let withAccess = 0;
      let overrides = 0;

      activeProfiles.forEach(p => {
        const has = temAcesso(p, page.id);
        if (has) withAccess++;
        if (p.page_access?.[page.id] !== undefined) overrides++;
      });

      stats[page.id] = {
        total: totalUsers,
        withAccess,
        overrides,
      };
    });

    return stats;
  }, [allPages, activeProfiles]);

  // Filtro de páginas para a navegação lateral
  const filteredPages = useMemo(() => {
    return allPages.filter(p => {
      if (selectedGroup !== 'all' && p.group !== selectedGroup) return false;
      if (moduleSearch.trim()) {
        const q = moduleSearch.toLowerCase();
        const matchesLabel = p.label.toLowerCase().includes(q);
        const matchesGroup = p.group.toLowerCase().includes(q);
        const matchesPath = (p.path || '').toLowerCase().includes(q);
        const matchesId = p.id.toLowerCase().includes(q);
        return matchesLabel || matchesGroup || matchesPath || matchesId;
      }
      return true;
    });
  }, [allPages, selectedGroup, moduleSearch]);

  // Página atualmente selecionada para deep-dive
  const selectedPage = useMemo(() => {
    return allPages.find(p => p.id === selectedPageId) || allPages[0];
  }, [allPages, selectedPageId]);

  // Lista completa de status de cada colaborador para o módulo selecionado
  const userModuleStatuses = useMemo<UserModuleStatus[]>(() => {
    if (!selectedPage) return [];

    return activeProfiles.map(p => {
      const hasAccess = temAcesso(p, selectedPage.id);
      const isAdmin = p.roles.includes('admin');
      const overrideVal = p.page_access?.[selectedPage.id];
      const isAdriano = isUserAdriano(p);
      const ehDoRh = isUserSetorRh(p);

      let accessType: UserAccessType = 'no_access';
      let accessLabel = 'Sem Acesso';

      if (isAdmin) {
        accessType = 'admin';
        accessLabel = 'Administrador Global';
      } else if (overrideVal === true) {
        accessType = 'override_granted';
        accessLabel = 'Liberação Manual (Override)';
      } else if (overrideVal === false) {
        accessType = 'override_blocked';
        accessLabel = 'Bloqueio Manual (Override)';
      } else if (selectedPage.group === 'FACILITIES' && isAdriano) {
        accessType = 'role';
        accessLabel = 'Responsável Facilities';
      } else if (selectedPage.group === 'RH' && ehDoRh) {
        accessType = 'role';
        accessLabel = 'Setor de RH';
      } else if (hasAccess) {
        accessType = 'role';
        accessLabel = selectedPage.defaultRoles === '*' ? 'Acesso Universal' : 'Papel Padrão';
      }

      return {
        user: p,
        hasAccess,
        accessType,
        accessLabel,
        isOverride: overrideVal !== undefined,
      };
    });
  }, [selectedPage, activeProfiles]);

  // Filtro de usuários do módulo selecionado
  const filteredUserStatuses = useMemo(() => {
    return userModuleStatuses.filter(item => {
      const { user, hasAccess, isOverride } = item;

      // Filtro de tipo de acesso
      if (accessFilter === 'with_access' && !hasAccess) return false;
      if (accessFilter === 'without_access' && hasAccess) return false;
      if (accessFilter === 'overrides' && !isOverride) return false;

      // Filtro por setor
      if (sectorFilter !== 'all' && user.sector_id !== sectorFilter) return false;

      // Busca por texto
      if (userSearch.trim()) {
        const q = userSearch.toLowerCase();
        const sectorName = (sectorMap.get(user.sector_id) || '').toLowerCase();
        const matchesName = (user.name || '').toLowerCase().includes(q);
        const matchesEmail = (user.email || '').toLowerCase().includes(q);
        const matchesCargo = (user.cargo || '').toLowerCase().includes(q);
        const matchesSector = sectorName.includes(q);
        return matchesName || matchesEmail || matchesCargo || matchesSector;
      }

      return true;
    }).sort((a, b) => {
      // Prioridade: Com acesso primeiro, depois alfabético
      if (a.hasAccess && !b.hasAccess) return -1;
      if (!a.hasAccess && b.hasAccess) return 1;
      return (a.user.name || '').localeCompare(b.user.name || '', 'pt-BR');
    });
  }, [userModuleStatuses, accessFilter, sectorFilter, userSearch, sectorMap]);

  // Ações de alteração de permissão inline
  const handleToggleAccess = async (targetUser: Profile, grant: boolean) => {
    if (!selectedPage || targetUser.roles.includes('admin')) return;
    setUpdatingUserId(targetUser.id);
    try {
      await localDb.updatePageAccess(targetUser.id, selectedPage.id, grant);
      toast.success(
        grant 
          ? `Acesso a "${selectedPage.label}" concedido para ${targetUser.name}.`
          : `Acesso a "${selectedPage.label}" bloqueado para ${targetUser.name}.`
      );
      onChanged();
    } catch (err) {
      console.error('Falha ao atualizar acesso:', err);
      toast.error('Erro ao atualizar permissão do colaborador.');
    } finally {
      setUpdatingUserId(null);
    }
  };

  const handleResetAccess = async (targetUser: Profile) => {
    if (!selectedPage) return;
    setUpdatingUserId(targetUser.id);
    try {
      await localDb.updatePageAccess(targetUser.id, selectedPage.id, null);
      toast.success(`Acesso a "${selectedPage.label}" restaurado para a regra padrão de ${targetUser.name}.`);
      onChanged();
    } catch (err) {
      console.error('Falha ao restaurar acesso:', err);
      toast.error('Erro ao restaurar permissão padrão.');
    } finally {
      setUpdatingUserId(null);
    }
  };

  /**
   * Aplica a mesma decisão a todos os colaboradores da lista filtrada.
   *
   * É o caso de uso que trouxe esta tela: "liberar o formulário da Portaria
   * para todo o setor X" era um clique por pessoa. Administradores ficam de
   * fora — o acesso deles é global e um override não mudaria nada.
   */
  const handleAplicarEmMassa = async (decisao: boolean | null) => {
    if (!selectedPage) return;
    const alvos = filteredUserStatuses
      .map(item => item.user)
      .filter(u => !u.roles.includes('admin'));

    if (alvos.length === 0) {
      toast.info('Nenhum colaborador na lista atual (administradores não entram na ação em massa).');
      return;
    }

    const rotulo = decisao === true ? 'liberar' : decisao === false ? 'bloquear' : 'restaurar a regra padrão de';
    const confirmado = window.confirm(
      `Deseja ${rotulo} "${selectedPage.label}" para os ${alvos.length} colaboradores da lista atual?`,
    );
    if (!confirmado) return;

    setAplicandoEmMassa(true);
    try {
      await localDb.updateBulkPageAccess(alvos.map(u => u.id), { [selectedPage.id]: decisao });
      toast.success(
        decisao === null
          ? `Regra padrão restaurada para ${alvos.length} colaborador(es).`
          : `Acesso ${decisao ? 'liberado' : 'bloqueado'} para ${alvos.length} colaborador(es).`,
      );
      onChanged();
    } catch (err) {
      console.error('Falha na edição em massa de permissões:', err);
      toast.error('Erro ao aplicar a alteração em massa.');
    } finally {
      setAplicandoEmMassa(false);
    }
  };

  const getInitials = (name: string) => {
    if (!name) return 'U';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  // Contadores rápidos do módulo selecionado
  const currentModuleStats = useMemo(() => {
    const withAccess = userModuleStatuses.filter(u => u.hasAccess).length;
    const withoutAccess = userModuleStatuses.length - withAccess;
    const overrides = userModuleStatuses.filter(u => u.isOverride).length;
    const admins = userModuleStatuses.filter(u => u.accessType === 'admin').length;
    const byRole = userModuleStatuses.filter(u => u.accessType === 'role').length;
    return { withAccess, withoutAccess, overrides, admins, byRole, total: userModuleStatuses.length };
  }, [userModuleStatuses]);

  return (
    <div className="space-y-4">
      {/* Header Informativo */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-800 flex items-center justify-center font-bold">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              Auditoria de Permissões por Módulo
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                {allPages.length} módulos e recursos
              </span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Selecione qualquer página ou tela do sistema para inspecionar exatamente quem tem acesso e gerenciar liberações.
            </p>
          </div>
        </div>

        {/* Chips de Grupos */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          <button
            type="button"
            onClick={() => setSelectedGroup('all')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              selectedGroup === 'all'
                ? 'bg-emerald-800 text-white shadow-2xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Todos ({allPages.length})
          </button>
          {groupNames.map(group => (
            <button
              key={group}
              type="button"
              onClick={() => setSelectedGroup(group)}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                selectedGroup === group
                  ? 'bg-emerald-800 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {group}
            </button>
          ))}
        </div>
      </div>

      {/* Grid Principal: Split View (Menu de Módulos à esquerda / Detalhes de Usuários à direita) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        
        {/* COLUNA ESQUERDA: LISTA DE MÓDULOS (4 colunas) */}
        <div className="lg:col-span-4 rounded-2xl border border-slate-200/90 bg-white p-3 shadow-2xs space-y-3">
          {/* Busca de Módulos */}
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar módulo ou tela..."
              value={moduleSearch}
              onChange={(e) => setModuleSearch(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-1.5 pl-8 pr-3 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-emerald-600 focus:bg-white transition-colors"
            />
          </div>

          {/* Lista com Rolagem de Módulos */}
          <div className="space-y-1 max-h-[640px] overflow-y-auto pr-1">
            {filteredPages.map(page => {
              const Icon = page.icon || Layers;
              const isSelected = selectedPage?.id === page.id;
              const stats = pageStats[page.id] || { total: activeProfiles.length, withAccess: 0, overrides: 0 };
              const percent = stats.total > 0 ? Math.round((stats.withAccess / stats.total) * 100) : 0;

              return (
                <button
                  key={page.id}
                  type="button"
                  onClick={() => setSelectedPageId(page.id)}
                  className={`w-full text-left p-2.5 rounded-xl border transition-all flex items-center justify-between gap-2.5 cursor-pointer ${
                    isSelected
                      ? 'bg-emerald-50/70 border-emerald-300 ring-2 ring-emerald-500/20 shadow-2xs'
                      : 'border-transparent hover:border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                      isSelected ? 'bg-emerald-800 text-white' : 'bg-slate-100 text-slate-600'
                    }`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className={`text-xs font-bold truncate ${isSelected ? 'text-emerald-950' : 'text-slate-800'}`}>
                        {page.label}
                      </p>
                      <p className="text-[10px] text-slate-400 truncate">
                        {page.group} {page.path ? `• ${page.path}` : ''}
                      </p>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className={`inline-block text-[11px] font-bold px-1.5 py-0.5 rounded-md ${
                      isSelected 
                        ? 'bg-emerald-200/80 text-emerald-900' 
                        : 'bg-slate-100 text-slate-700'
                    }`}>
                      {stats.withAccess}
                    </span>
                    <p className="text-[9px] text-slate-400 font-semibold">{percent}%</p>
                  </div>
                </button>
              );
            })}

            {filteredPages.length === 0 && (
              <div className="py-8 text-center text-slate-400 text-xs">
                Nenhum módulo encontrado.
              </div>
            )}
          </div>
        </div>

        {/* COLUNA DIREITA: DETALHE DO MÓDULO E COLABORADORES (8 colunas) */}
        <div className="lg:col-span-8 space-y-4">
          
          {/* Header do Módulo Selecionado */}
          {selectedPage && (
            <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-800 text-white flex items-center justify-center shadow-xs shrink-0">
                    {React.createElement(selectedPage.icon || Layers, { className: 'w-6 h-6' })}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black tracking-wider uppercase px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                        {selectedPage.group}
                      </span>
                      {selectedPage.path && (
                        <span className="text-xs font-mono text-slate-400">
                          {selectedPage.path}
                        </span>
                      )}
                    </div>
                    <h2 className="text-lg font-bold text-slate-900 mt-1">
                      {selectedPage.label}
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {selectedPage.defaultRoles === '*'
                        ? '🔓 Regra padrão: Acesso universal concedido a todos os usuários ativos.'
                        : Array.isArray(selectedPage.defaultRoles)
                        ? `🔒 Regra padrão: Liberado para papéis: ${selectedPage.defaultRoles.join(', ')}.`
                        : '🔒 Regra personalizada ou exclusiva.'}
                    </p>
                    {FORMULARIO_SUBPERMISSOES.some(f => f.id === selectedPage.id) && (
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Subpermissão de formulário: além desta regra, o colaborador precisa ter
                        acesso à página "Formulários".
                      </p>
                    )}
                  </div>
                </div>

                {/* Métricas Rápidas */}
                <div className="flex items-center gap-2 sm:self-center">
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-center min-w-[90px]">
                    <span className="text-xs font-bold text-slate-500 block uppercase tracking-wider">Com Acesso</span>
                    <span className="text-lg font-black text-emerald-800">{currentModuleStats.withAccess}</span>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-center min-w-[90px]">
                    <span className="text-xs font-bold text-slate-500 block uppercase tracking-wider">Sem Acesso</span>
                    <span className="text-lg font-black text-slate-700">{currentModuleStats.withoutAccess}</span>
                  </div>
                </div>
              </div>

              {/* Filtros e Busca de Usuários no Módulo */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                {/* Abas de Filtro de Acesso */}
                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => setAccessFilter('with_access')}
                    className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                      accessFilter === 'with_access'
                        ? 'bg-white text-emerald-800 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Com Acesso ({currentModuleStats.withAccess})
                  </button>
                  <button
                    type="button"
                    onClick={() => setAccessFilter('without_access')}
                    className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                      accessFilter === 'without_access'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Sem Acesso ({currentModuleStats.withoutAccess})
                  </button>
                  <button
                    type="button"
                    onClick={() => setAccessFilter('overrides')}
                    className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                      accessFilter === 'overrides'
                        ? 'bg-white text-purple-800 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Overrides ({currentModuleStats.overrides})
                  </button>
                  <button
                    type="button"
                    onClick={() => setAccessFilter('all')}
                    className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                      accessFilter === 'all'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Todos ({currentModuleStats.total})
                  </button>
                </div>

                {/* Filtro por Setor & Busca */}
                <div className="flex items-center gap-2 flex-1 sm:flex-initial min-w-[260px]">
                  <select
                    value={sectorFilter}
                    onChange={(e) => setSectorFilter(e.target.value)}
                    className="rounded-xl border border-slate-200 bg-white py-1.5 px-2 text-xs font-semibold text-slate-700 focus:outline-none focus:border-emerald-600"
                  >
                    <option value="all">Todos os Setores</option>
                    {sectors.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>

                  <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Buscar colaborador..."
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-1.5 pl-8 pr-2.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-emerald-600 focus:bg-white"
                    />
                  </div>
                </div>
              </div>

              {/* Ação em massa sobre a lista filtrada: o mesmo que os botões
                  de cada linha, aplicado a todos de uma vez. */}
              <div className="mb-3 flex flex-col gap-2 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-2 text-xs text-emerald-900">
                  <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
                  <p>
                    <strong>Edição em massa:</strong> aplica a decisão a todos os{' '}
                    <strong>{filteredUserStatuses.filter(u => !u.user.roles.includes('admin')).length}</strong>{' '}
                    colaboradores da lista atual (respeitando busca e filtros). Administradores não
                    entram — o acesso deles já é global.
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    disabled={aplicandoEmMassa}
                    onClick={() => handleAplicarEmMassa(true)}
                    className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-2.5 py-1.5 text-xs font-bold text-white transition-colors hover:bg-emerald-600 disabled:opacity-50 cursor-pointer"
                  >
                    <Unlock className="h-3.5 w-3.5" />
                    Liberar todos
                  </button>
                  <button
                    type="button"
                    disabled={aplicandoEmMassa}
                    onClick={() => handleAplicarEmMassa(false)}
                    className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1.5 text-xs font-bold text-rose-700 ring-1 ring-rose-200 transition-colors hover:bg-rose-50 disabled:opacity-50 cursor-pointer"
                  >
                    <Lock className="h-3.5 w-3.5" />
                    Bloquear todos
                  </button>
                  <button
                    type="button"
                    disabled={aplicandoEmMassa}
                    onClick={() => handleAplicarEmMassa(null)}
                    className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1.5 text-xs font-bold text-slate-600 ring-1 ring-slate-200 transition-colors hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
                    title="Remove o override e volta à regra padrão do papel"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Restaurar padrão
                  </button>
                </div>
              </div>

              {/* Tabela de Colaboradores e seus Acessos */}
              <div className="overflow-x-auto rounded-xl border border-slate-200/80">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50/75 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                      <th className="py-2.5 px-3">Colaborador</th>
                      <th className="py-2.5 px-3">Cargo / Setor</th>
                      <th className="py-2.5 px-3">Papel (Role)</th>
                      <th className="py-2.5 px-3 text-center">Status no Módulo</th>
                      <th className="py-2.5 px-3 text-right">Ações Rápidas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredUserStatuses.map(({ user: targetUser, hasAccess, accessType, accessLabel, isOverride }) => {
                      const secName = sectorMap.get(targetUser.sector_id) || 'Não informado';
                      const isUpdating = updatingUserId === targetUser.id;
                      const isAdmin = targetUser.roles.includes('admin');

                      return (
                        <tr key={targetUser.id} className="hover:bg-slate-50/60 transition-colors">
                          {/* Colaborador */}
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-2.5">
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                                isAdmin
                                  ? 'bg-purple-100 text-purple-800'
                                  : hasAccess
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-slate-100 text-slate-500'
                              }`}>
                                {getInitials(targetUser.name)}
                              </div>
                              <div className="min-w-0">
                                <p className="font-bold text-slate-900 truncate" title={targetUser.name}>
                                  {targetUser.name}
                                </p>
                                <p className="text-[10px] text-slate-400 truncate" title={targetUser.email}>
                                  {targetUser.email}
                                </p>
                              </div>
                            </div>
                          </td>

                          {/* Cargo e Setor */}
                          <td className="py-2.5 px-3">
                            <p className="font-semibold text-slate-700 truncate">{targetUser.cargo || '—'}</p>
                            <p className="text-[10px] text-slate-400 truncate">{secName}</p>
                          </td>

                          {/* Papel */}
                          <td className="py-2.5 px-3">
                            <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                              {targetUser.roles?.join(', ') || 'Nenhum'}
                            </span>
                          </td>

                          {/* Status no Módulo */}
                          <td className="py-2.5 px-3 text-center">
                            {isAdmin ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full bg-purple-50 text-purple-900 border border-purple-200">
                                <ShieldCheck className="w-3 h-3 text-purple-700" />
                                Admin Global
                              </span>
                            ) : accessType === 'override_granted' ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-900 border border-emerald-300 shadow-2xs">
                                <Sparkles className="w-3 h-3 text-emerald-600" />
                                Liberado Manualmente
                              </span>
                            ) : accessType === 'override_blocked' ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full bg-rose-50 text-rose-900 border border-rose-300">
                                <XCircle className="w-3 h-3 text-rose-600" />
                                Bloqueado Manualmente
                              </span>
                            ) : hasAccess ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                                <CheckCircle2 className="w-3 h-3 text-emerald-700" />
                                {accessLabel}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">
                                <X className="w-3 h-3 text-slate-400" />
                                Sem Acesso
                              </span>
                            )}
                          </td>

                          {/* Ações Rápidas */}
                          <td className="py-2.5 px-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Botão de Conceder / Bloquear / Resetar */}
                              {!isAdmin && (
                                <>
                                  {isOverride ? (
                                    <button
                                      type="button"
                                      onClick={() => handleResetAccess(targetUser)}
                                      disabled={isUpdating}
                                      className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                                      title="Restaurar para a regra padrão de permissão do papel"
                                    >
                                      <RotateCcw className="w-3.5 h-3.5" />
                                    </button>
                                  ) : null}

                                  {hasAccess ? (
                                    <button
                                      type="button"
                                      onClick={() => handleToggleAccess(targetUser, false)}
                                      disabled={isUpdating}
                                      className="px-2 py-1 rounded-lg text-[10px] font-bold bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 transition-colors cursor-pointer"
                                      title="Bloquear acesso deste usuário a este módulo"
                                    >
                                      Bloquear
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => handleToggleAccess(targetUser, true)}
                                      disabled={isUpdating}
                                      className="px-2 py-1 rounded-lg text-[10px] font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 transition-colors cursor-pointer"
                                      title="Conceder acesso individual a este módulo"
                                    >
                                      Liberar
                                    </button>
                                  )}
                                </>
                              )}

                              {/* Botão de Matriz Completa do Usuário */}
                              <button
                                type="button"
                                onClick={() => onConfigurePermissions(targetUser.id)}
                                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                                title="Ver todas as permissões deste colaborador"
                              >
                                <SlidersHorizontal className="w-3.5 h-3.5" />
                              </button>

                              {/* Botão de Editar Perfil */}
                              <button
                                type="button"
                                onClick={() => onEditUser(targetUser)}
                                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                                title="Editar dados cadastrais e governança do colaborador"
                              >
                                <Settings2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}

                    {filteredUserStatuses.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-slate-400">
                          Nenhum colaborador corresponde aos filtros selecionados.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>

      </div>
    </div>
  );
}
