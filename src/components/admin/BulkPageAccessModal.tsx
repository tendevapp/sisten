/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { Users, RotateCcw, ShieldCheck, Check, X, Minus, Sparkles, AlertCircle, Layers } from 'lucide-react';
import { localDb } from '../../db/localDb';
import { Profile } from '../../types';
import { getPageGroups, FORMULARIO_SUBPERMISSOES } from '../../lib/pages';
import Modal, { ModalHeader, ModalBody, ModalFooter } from '../ui/Modal';
import { useToast } from '../ui/Toast';

export type BulkActionType = 'keep' | 'allow' | 'block' | 'reset';

interface BulkPageAccessModalProps {
  users: Profile[];
  onClose: () => void;
  /** Chamado após salvar para atualizar a lista no AdminPanel. */
  onChanged: () => void;
}

export default function BulkPageAccessModal({ users, onClose, onChanged }: BulkPageAccessModalProps) {
  const toast = useToast();
  const [salvando, setSalvando] = useState(false);

  // Mapa de ação por página/feature: 'keep' (não altera), 'allow' (libera), 'block' (bloqueia), 'reset' (restaura padrão)
  const [actions, setActions] = useState<Record<string, BulkActionType>>({});

  // Subpermissão ASE escopo ('keep' | 'own' | 'all' | 'reset')
  const [aseScopeAction, setAseScopeAction] = useState<'keep' | 'own' | 'all' | 'reset'>('keep');

  const groups = useMemo(
    () => getPageGroups().filter(g => g.group !== 'SUBPERMISSÕES DE FORMULÁRIOS'),
    []
  );

  // Filtra administradores que não podem sofrer restrição
  const nonAdminUsers = useMemo(() => users.filter(u => !u.roles.includes('admin')), [users]);
  const adminCount = users.length - nonAdminUsers.length;

  const setAction = (pageId: string, action: BulkActionType) => {
    setActions(prev => ({ ...prev, [pageId]: action }));
  };

  const handleApplyAll = (action: BulkActionType) => {
    const next: Record<string, BulkActionType> = {};
    for (const group of groups) {
      for (const page of group.pages) {
        if (!page.alwaysAdmin) {
          next[page.id] = action;
        }
      }
    }
    for (const sub of FORMULARIO_SUBPERMISSOES) {
      next[sub.id] = action;
    }
    setActions(next);
    if (action === 'allow') setAseScopeAction('all');
    else if (action === 'block') setAseScopeAction('own');
    else if (action === 'reset') setAseScopeAction('reset');
    else setAseScopeAction('keep');
  };

  const handleToggleFormSubgroups = (action: BulkActionType) => {
    setActions(prev => {
      const next = { ...prev };
      for (const sub of FORMULARIO_SUBPERMISSOES) {
        next[sub.id] = action;
      }
      return next;
    });
    if (action === 'allow') setAseScopeAction('all');
    else if (action === 'block') setAseScopeAction('own');
    else if (action === 'reset') setAseScopeAction('reset');
    else setAseScopeAction('keep');
  };

  // Quantidade de regras modificadas
  const totalModificacoes = useMemo(() => {
    let count = Object.values(actions).filter(a => a !== 'keep').length;
    if (aseScopeAction !== 'keep') count += 1;
    return count;
  }, [actions, aseScopeAction]);

  const handleSalvar = async () => {
    if (nonAdminUsers.length === 0) {
      toast.warning('Nenhum usuário não-administrador selecionado para alteração.');
      onClose();
      return;
    }

    if (totalModificacoes === 0) {
      toast.info('Nenhuma alteração selecionada para aplicar.');
      return;
    }

    setSalvando(true);
    try {
      const updates: Record<string, boolean | null> = {};

      for (const [pageId, action] of Object.entries(actions)) {
        if (action === 'allow') updates[pageId] = true;
        else if (action === 'block') updates[pageId] = false;
        else if (action === 'reset') updates[pageId] = null;
      }

      if (aseScopeAction === 'all') {
        updates['rh_ase_ver_todas'] = true;
      } else if (aseScopeAction === 'own') {
        updates['rh_ase_ver_todas'] = false;
      } else if (aseScopeAction === 'reset') {
        updates['rh_ase_ver_todas'] = null;
      }

      const userIds = nonAdminUsers.map(u => u.id);
      await localDb.updateBulkPageAccess(userIds, updates);

      toast.success(`Módulos de acesso atualizados com sucesso para ${userIds.length} usuário(s)!`);
      onChanged();
      onClose();
    } catch (e) {
      console.error('Falha na edição em massa de módulos:', e);
      toast.error(`Erro ao salvar alterações em massa: ${(e as Error).message}`);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal onClose={onClose} maxWidth="max-w-2xl" ariaLabel="Edição em massa de módulos de acesso">
      <ModalHeader onClose={onClose}>
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
            <Layers className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
              Edição em massa de módulos de acesso
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Aplicando regras para {nonAdminUsers.length} usuário(s) selecionado(s)
            </p>
          </div>
        </div>
      </ModalHeader>

      <ModalBody>
        <div className="space-y-4">
          {/* Usuários selecionados */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-800 dark:bg-slate-900/50">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 text-slate-500" />
                Usuários selecionados ({users.length}):
              </span>
              {adminCount > 0 && (
                <span className="text-[10px] text-amber-700 dark:text-amber-400 font-semibold">
                  ({adminCount} admin(s) ignorado(s) - acesso total)
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto pr-1">
              {users.map(u => (
                <span
                  key={u.id}
                  className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold ${
                    u.roles.includes('admin')
                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 line-through opacity-70'
                      : 'bg-white border border-slate-200 text-slate-700 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200'
                  }`}
                >
                  {u.name}
                </span>
              ))}
            </div>
          </div>

          {/* Barra de ações rápidas globais */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400">
              Ações rápidas globais:
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => handleApplyAll('allow')}
                className="rounded-lg bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-900/50 cursor-pointer"
              >
                Liberar Tudo
              </button>
              <button
                type="button"
                onClick={() => handleApplyAll('block')}
                className="rounded-lg bg-rose-50 px-2.5 py-1 text-[10px] font-bold text-rose-700 hover:bg-rose-100 dark:bg-rose-950/40 dark:text-rose-300 dark:hover:bg-rose-900/50 cursor-pointer"
              >
                Bloquear Tudo
              </button>
              <button
                type="button"
                onClick={() => handleApplyAll('reset')}
                className="rounded-lg bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 cursor-pointer"
              >
                Restaurar Padrão
              </button>
              <button
                type="button"
                onClick={() => handleApplyAll('keep')}
                className="rounded-lg border border-slate-200 px-2.5 py-1 text-[10px] font-bold text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 cursor-pointer"
              >
                Manter Tudo
              </button>
            </div>
          </div>

          {/* Legenda dos estados */}
          <div className="flex flex-wrap items-center gap-3 text-[10px] text-slate-500 dark:text-slate-400 px-1">
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-slate-300 dark:bg-slate-600" />
              <strong>Manter:</strong> Não altera o acesso atual do usuário
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <strong>Liberar:</strong> Concede acesso
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-rose-500" />
              <strong>Bloquear:</strong> Restringe acesso
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-blue-500" />
              <strong>Padrão:</strong> Reseta ao cargo
            </span>
          </div>

          {/* Lista de Grupos e Páginas */}
          <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-1">
            {groups.map(g => (
              <div key={g.group} className="space-y-1.5">
                <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                  {g.group}
                </h4>

                <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white p-2.5 dark:divide-slate-800/60 dark:border-slate-800 dark:bg-slate-900">
                  {g.pages.map(p => {
                    const currentAction = actions[p.id] || 'keep';
                    const isFormularios = p.id === 'formularios';

                    return (
                      <div key={p.id} className="py-2 first:pt-1 last:pb-1 space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                              {p.label}
                            </p>
                            {p.alwaysAdmin && (
                              <span className="text-[10px] text-slate-400">(Acesso exclusivo para administradores)</span>
                            )}
                          </div>

                          {!p.alwaysAdmin ? (
                            <SegmentedSelector
                              value={currentAction}
                              onChange={(val) => setAction(p.id, val)}
                            />
                          ) : (
                            <span className="text-[10px] font-semibold text-slate-400">(não editável)</span>
                          )}
                        </div>

                        {/* Subpermissões Aninhadas sob Formulários */}
                        {isFormularios && (
                          <div className="ml-3 mt-2 rounded-xl border border-slate-200 bg-slate-50/80 p-3 space-y-2.5 dark:border-slate-800 dark:bg-slate-950/40">
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 pb-1.5 dark:border-slate-800">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                Subpermissões de Formulários:
                              </span>
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleToggleFormSubgroups('allow')}
                                  className="text-[10px] font-semibold text-emerald-600 hover:underline dark:text-emerald-400 cursor-pointer"
                                >
                                  Liberar todos
                                </button>
                                <span className="text-slate-300 dark:text-slate-700 text-[10px]">·</span>
                                <button
                                  type="button"
                                  onClick={() => handleToggleFormSubgroups('block')}
                                  className="text-[10px] font-semibold text-rose-600 hover:underline dark:text-rose-400 cursor-pointer"
                                >
                                  Bloquear todos
                                </button>
                                <span className="text-slate-300 dark:text-slate-700 text-[10px]">·</span>
                                <button
                                  type="button"
                                  onClick={() => handleToggleFormSubgroups('keep')}
                                  className="text-[10px] font-semibold text-slate-500 hover:underline dark:text-slate-400 cursor-pointer"
                                >
                                  Manter
                                </button>
                              </div>
                            </div>

                            <div className="space-y-2 pt-0.5">
                              {FORMULARIO_SUBPERMISSOES.map(sub => {
                                const subAction = actions[sub.id] || 'keep';

                                return (
                                  <React.Fragment key={sub.id}>
                                    <div className="flex items-center justify-between gap-2">
                                      <div className="min-w-0">
                                        <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                                          {sub.label}
                                        </p>
                                        <p className="text-[10px] text-slate-400 truncate hidden sm:block">
                                          {sub.descricao}
                                        </p>
                                      </div>

                                      <SegmentedSelector
                                        value={subAction}
                                        onChange={(val) => setAction(sub.id, val)}
                                      />
                                    </div>

                                    {/* Opções de Escopo para ASE - Hora Extra */}
                                    {sub.id === 'form_rh' && (
                                      <div className="ml-3 my-1 rounded-lg border border-slate-200 bg-white/70 p-2 dark:border-slate-800 dark:bg-slate-900/60 flex flex-wrap items-center justify-between gap-2">
                                        <div>
                                          <p className="text-[11px] font-semibold text-slate-800 dark:text-slate-200">
                                            Escopo ASE:
                                          </p>
                                          <p className="text-[10px] text-slate-400">
                                            Visibilidade de solicitações no formulário ASE
                                          </p>
                                        </div>

                                        <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg dark:bg-slate-800">
                                          <button
                                            type="button"
                                            onClick={() => setAseScopeAction('keep')}
                                            className={`px-2 py-0.5 text-[10px] font-bold rounded-md transition-all cursor-pointer ${
                                              aseScopeAction === 'keep'
                                                ? 'bg-white text-slate-800 shadow-sm dark:bg-slate-700 dark:text-slate-100'
                                                : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
                                            }`}
                                          >
                                            Manter
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => setAseScopeAction('own')}
                                            className={`px-2 py-0.5 text-[10px] font-bold rounded-md transition-all cursor-pointer ${
                                              aseScopeAction === 'own'
                                                ? 'bg-amber-500 text-white shadow-sm'
                                                : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
                                            }`}
                                          >
                                            Apenas Próprias
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => setAseScopeAction('all')}
                                            className={`px-2 py-0.5 text-[10px] font-bold rounded-md transition-all cursor-pointer ${
                                              aseScopeAction === 'all'
                                                ? 'bg-emerald-600 text-white shadow-sm'
                                                : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
                                            }`}
                                          >
                                            Ver Todas
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => setAseScopeAction('reset')}
                                            className={`px-2 py-0.5 text-[10px] font-bold rounded-md transition-all cursor-pointer ${
                                              aseScopeAction === 'reset'
                                                ? 'bg-blue-600 text-white shadow-sm'
                                                : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
                                            }`}
                                          >
                                            Padrão
                                          </button>
                                        </div>
                                      </div>
                                    )}
                                  </React.Fragment>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </ModalBody>

      <ModalFooter>
        <div className="flex items-center justify-between w-full">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {totalModificacoes > 0 ? (
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                {totalModificacoes} módulo(s) com alteração
              </span>
            ) : (
              <span>Nenhuma alteração selecionada</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={salvando}
              className="px-3.5 py-2 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSalvar}
              disabled={salvando || totalModificacoes === 0}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold shadow-sm transition-colors cursor-pointer"
            >
              {salvando ? (
                <span>Salvando...</span>
              ) : (
                <>
                  <Check className="h-3.5 w-3.5" />
                  Aplicar em {nonAdminUsers.length} Usuário(s)
                </>
              )}
            </button>
          </div>
        </div>
      </ModalFooter>
    </Modal>
  );
}

// =====================================================================
// Componente de Seleção de Ação Segmentada
// =====================================================================

function SegmentedSelector({
  value,
  onChange,
}: {
  value: BulkActionType;
  onChange: (val: BulkActionType) => void;
}) {
  return (
    <div className="inline-flex items-center rounded-lg bg-slate-100 p-0.5 text-[10px] font-bold dark:bg-slate-800 shrink-0">
      <button
        type="button"
        onClick={() => onChange('keep')}
        title="Manter sem alteração para os usuários"
        className={`px-2 py-1 rounded-md transition-all cursor-pointer ${
          value === 'keep'
            ? 'bg-white text-slate-800 shadow-sm dark:bg-slate-700 dark:text-slate-100'
            : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
        }`}
      >
        Manter
      </button>

      <button
        type="button"
        onClick={() => onChange('allow')}
        title="Liberar acesso para todos os selecionados"
        className={`px-2 py-1 rounded-md transition-all cursor-pointer ${
          value === 'allow'
            ? 'bg-emerald-600 text-white shadow-sm'
            : 'text-slate-500 hover:text-emerald-700 dark:text-slate-400 dark:hover:text-emerald-400'
        }`}
      >
        Liberar
      </button>

      <button
        type="button"
        onClick={() => onChange('block')}
        title="Bloquear acesso para todos os selecionados"
        className={`px-2 py-1 rounded-md transition-all cursor-pointer ${
          value === 'block'
            ? 'bg-rose-600 text-white shadow-sm'
            : 'text-slate-500 hover:text-rose-700 dark:text-slate-400 dark:hover:text-rose-400'
        }`}
      >
        Bloquear
      </button>

      <button
        type="button"
        onClick={() => onChange('reset')}
        title="Restaurar permissão ao padrão do perfil do cargo"
        className={`px-2 py-1 rounded-md transition-all cursor-pointer ${
          value === 'reset'
            ? 'bg-blue-600 text-white shadow-sm'
            : 'text-slate-500 hover:text-blue-700 dark:text-slate-400 dark:hover:text-blue-400'
        }`}
      >
        Padrão
      </button>
    </div>
  );
}
