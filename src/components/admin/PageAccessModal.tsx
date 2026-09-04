/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { RotateCcw, ShieldCheck } from 'lucide-react';
import { localDb } from '../../db/localDb';
import { Profile } from '../../types';
import { canAccessPage, getPageGroups, FORMULARIO_SUBPERMISSOES } from '../../lib/pages';
import Modal, { ModalHeader, ModalBody, ModalFooter } from '../ui/Modal';
import { useToast } from '../ui/Toast';

interface PageAccessModalProps {
  user: Profile;
  onClose: () => void;
  /** Chamado após qualquer alteração, para o AdminPanel atualizar a lista de perfis. */
  onChanged: () => void;
}

export default function PageAccessModal({ user, onClose, onChanged }: PageAccessModalProps) {
  const toast = useToast();
  const [pageAccess, setPageAccess] = useState<Record<string, boolean>>(user.page_access || {});
  const isAdmin = user.roles.includes('admin');
  // Filtra o grupo de subpermissões para exibi-lo aninhado diretamente sob o item "Formulários"
  const groups = getPageGroups().filter(g => g.group !== 'SUBPERMISSÕES DE FORMULÁRIOS');

  const handleToggle = async (pageId: string, next: boolean) => {
    setPageAccess(prev => ({ ...prev, [pageId]: next }));
    try {
      await localDb.updatePageAccess(user.id, pageId, next);
      onChanged();
    } catch (e) {
      console.error('Falha ao atualizar módulo de acesso:', e);
      toast.error('Não foi possível salvar. Tente novamente.');
    }
  };

  const handleReset = async (pageId: string) => {
    setPageAccess(prev => {
      const next = { ...prev };
      delete next[pageId];
      return next;
    });
    try {
      await localDb.updatePageAccess(user.id, pageId, null);
      onChanged();
    } catch (e) {
      console.error('Falha ao restaurar módulo de acesso:', e);
      toast.error('Não foi possível restaurar. Tente novamente.');
    }
  };

  const handleToggleAllFormGroups = async (habilitar: boolean) => {
    const next = { ...pageAccess };
    for (const sub of FORMULARIO_SUBPERMISSOES) {
      if (habilitar) {
        delete next[sub.id]; // Remove override, voltando ao padrão (todos liberados)
      } else {
        next[sub.id] = false;
      }
    }
    setPageAccess(next);
    try {
      for (const sub of FORMULARIO_SUBPERMISSOES) {
        await localDb.updatePageAccess(user.id, sub.id, habilitar ? null : false);
      }
      onChanged();
      toast.success(habilitar ? 'Todos os grupos de formulários liberados.' : 'Todos os grupos de formulários bloqueados.');
    } catch (e) {
      console.error('Falha ao atualizar grupos de formulários:', e);
      toast.error('Não foi possível atualizar todos os grupos.');
    }
  };

  const handleResetAll = async () => {
    setPageAccess({});
    try {
      await localDb.resetAllPageAccess(user.id);
      onChanged();
      toast.success('Acesso restaurado ao padrão do perfil.');
    } catch (e) {
      console.error('Falha ao restaurar todos os módulos:', e);
      toast.error('Não foi possível restaurar tudo. Tente novamente.');
    }
  };

  return (
    <Modal onClose={onClose} maxWidth="max-w-xl" ariaLabel={`Módulos de acesso — ${user.name}`}>
      <ModalHeader onClose={onClose}>
        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Módulos de acesso</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{user.name} · {user.email}</p>
      </ModalHeader>
      <ModalBody>
        {isAdmin ? (
          <div className="flex items-center gap-2.5 rounded-lg border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/60 dark:bg-emerald-950/20 p-3.5 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
            <ShieldCheck className="h-4.5 w-4.5 shrink-0" />
            Administradores têm acesso total a todas as páginas e não podem ser restringidos aqui.
          </div>
        ) : (
          <div className="space-y-5">
            {groups.map(g => (
              <div key={g.group}>
                <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-500 tracking-widest mb-1.5">{g.group}</h4>
                <div className="space-y-1">
                  {g.pages.map(p => {
                    const hasOverride = pageAccess[p.id] !== undefined;
                    const checked = p.alwaysAdmin ? canAccessPage(user, p.id) : canAccessPage({ ...user, page_access: pageAccess }, p.id);
                    const isFormularios = p.id === 'formularios';

                    return (
                      <div key={p.id} className="space-y-1.5 py-1">
                        <div className="flex items-center justify-between gap-2">
                          <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer min-w-0">
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={!!p.alwaysAdmin}
                              onChange={(e) => handleToggle(p.id, e.target.checked)}
                              className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 h-3.5 w-3.5 shrink-0 disabled:opacity-40"
                            />
                            <span className="truncate font-medium">{p.label}</span>
                            {!hasOverride && !p.alwaysAdmin && (
                              <span className="text-[10px] text-slate-400 shrink-0">(padrão)</span>
                            )}
                            {p.alwaysAdmin && (
                              <span className="text-[10px] text-slate-400 shrink-0">(não editável)</span>
                            )}
                          </label>
                          {hasOverride && !p.alwaysAdmin && (
                            <button
                              type="button"
                              onClick={() => handleReset(p.id)}
                              title="Restaurar padrão do perfil"
                              className="text-slate-400 hover:text-emerald-700 shrink-0"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>

                        {/* Subpermissões aninhadas de Formulários */}
                        {isFormularios && checked && (
                          <div className="ml-5 mt-2 rounded-xl border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-800 dark:bg-slate-900/50 space-y-2">
                            <div className="flex items-center justify-between gap-2 border-b border-slate-200/80 pb-1.5 dark:border-slate-800">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                Subpermissões de Formulários
                              </span>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleToggleAllFormGroups(true)}
                                  className="text-[10px] font-semibold text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
                                >
                                  Liberar todos
                                </button>
                                <span className="text-slate-300 dark:text-slate-700 text-[10px]">·</span>
                                <button
                                  type="button"
                                  onClick={() => handleToggleAllFormGroups(false)}
                                  className="text-[10px] font-semibold text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400"
                                >
                                  Bloquear todos
                                </button>
                              </div>
                            </div>

                            <p className="text-[11px] text-slate-500 dark:text-slate-400">
                              Selecione os grupos de formulários que este usuário pode visualizar no Hub:
                            </p>

                            <div className="space-y-1.5 pt-0.5">
                              {FORMULARIO_SUBPERMISSOES.map(sub => {
                                const subHasOverride = pageAccess[sub.id] !== undefined;
                                const isDefaultAllowed =
                                  sub.defaultRoles === '*'
                                    ? true
                                    : sub.defaultRoles.some((r) => user.roles.includes(r as any));
                                const subChecked = pageAccess[sub.id] !== undefined ? pageAccess[sub.id] : isDefaultAllowed;

                                return (
                                  <React.Fragment key={sub.id}>
                                    <div className="flex items-center justify-between gap-2 py-0.5">
                                      <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer min-w-0">
                                        <input
                                          type="checkbox"
                                          checked={subChecked}
                                          onChange={(e) => handleToggle(sub.id, e.target.checked)}
                                          className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 h-3.5 w-3.5 shrink-0"
                                        />
                                        <span className="font-semibold text-slate-800 dark:text-slate-200">{sub.label}</span>
                                        <span className="text-[10px] text-slate-400 truncate hidden sm:inline">({sub.descricao})</span>
                                        {!subHasOverride && (
                                          <span className="text-[10px] text-emerald-600/70 dark:text-emerald-400/70 shrink-0">
                                            {sub.defaultRoles === '*' ? '(todos)' : '(admin/gestor)'}
                                          </span>
                                        )}
                                      </label>
                                      {subHasOverride && (
                                        <button
                                          type="button"
                                          onClick={() => handleReset(sub.id)}
                                          title="Restaurar padrão"
                                          className="text-slate-400 hover:text-emerald-700 shrink-0"
                                        >
                                          <RotateCcw className="h-3 w-3" />
                                        </button>
                                      )}
                                    </div>

                                    {/* Opções de visualização para o formulário ASE de Horas Extras */}
                                    {sub.id === 'form_rh' && subChecked && (
                                      <div className="ml-6 my-1.5 rounded-lg border border-slate-200 bg-white/70 p-2.5 dark:border-slate-800 dark:bg-slate-900/60 space-y-2">
                                        <div className="flex items-center justify-between">
                                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                            Visibilidade no formulário ASE:
                                          </span>
                                          {pageAccess['rh_ase_ver_todas'] !== undefined && (
                                            <button
                                              type="button"
                                              onClick={() => handleReset('rh_ase_ver_todas')}
                                              title="Restaurar padrão do perfil"
                                              className="text-[10px] font-semibold text-slate-400 hover:text-emerald-700 inline-flex items-center gap-1"
                                            >
                                              <RotateCcw className="h-2.5 w-2.5" /> Padrão
                                            </button>
                                          )}
                                        </div>
                                        <div className="space-y-1.5">
                                          <label className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                                            <input
                                              type="radio"
                                              name={`rh_ase_scope_${user.id}`}
                                              checked={
                                                pageAccess['rh_ase_ver_todas'] === false ||
                                                (pageAccess['rh_ase_ver_todas'] === undefined && !['gestor', 'coordenador_suprimentos', 'admin'].some(r => user.roles.includes(r as any)))
                                              }
                                              onChange={() => handleToggle('rh_ase_ver_todas', false)}
                                              className="mt-0.5 text-emerald-600 focus:ring-emerald-500 h-3.5 w-3.5"
                                            />
                                            <div>
                                              <span className="font-semibold text-slate-800 dark:text-slate-200">Apenas as próprias ASEs</span>
                                              <p className="text-[10px] text-slate-500 dark:text-slate-400">Só mostra nesta tela as solicitações abertas pelo usuário logado.</p>
                                            </div>
                                          </label>
                                          <label className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                                            <input
                                              type="radio"
                                              name={`rh_ase_scope_${user.id}`}
                                              checked={
                                                pageAccess['rh_ase_ver_todas'] === true ||
                                                (pageAccess['rh_ase_ver_todas'] === undefined && ['gestor', 'coordenador_suprimentos', 'admin'].some(r => user.roles.includes(r as any)))
                                              }
                                              onChange={() => handleToggle('rh_ase_ver_todas', true)}
                                              className="mt-0.5 text-emerald-600 focus:ring-emerald-500 h-3.5 w-3.5"
                                            />
                                            <div>
                                              <span className="font-semibold text-slate-800 dark:text-slate-200">Ver todas as ASEs</span>
                                              <p className="text-[10px] text-slate-500 dark:text-slate-400">Permite visualizar todas as ASEs abertas por todos os usuários e setores.</p>
                                            </div>
                                          </label>
                                        </div>
                                      </div>
                                    )}

                                    {/* Opções de edição para o formulário RID de SSMA */}
                                    {sub.id === 'form_ssma' && subChecked && (
                                      <div className="ml-6 my-1.5 rounded-lg border border-slate-200 bg-white/70 p-2.5 dark:border-slate-800 dark:bg-slate-900/60 space-y-2">
                                        <div className="flex items-center justify-between">
                                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                            Edição no formulário RID:
                                          </span>
                                          {pageAccess['ssma_rid_editar_todas'] !== undefined && (
                                            <button
                                              type="button"
                                              onClick={() => handleReset('ssma_rid_editar_todas')}
                                              title="Restaurar padrão do perfil"
                                              className="text-[10px] font-semibold text-slate-400 hover:text-emerald-700 inline-flex items-center gap-1"
                                            >
                                              <RotateCcw className="h-2.5 w-2.5" /> Padrão
                                            </button>
                                          )}
                                        </div>
                                        <div className="space-y-1.5">
                                          <label className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                                            <input
                                              type="radio"
                                              name={`ssma_rid_edit_${user.id}`}
                                              checked={
                                                pageAccess['ssma_rid_editar_todas'] === false ||
                                                (pageAccess['ssma_rid_editar_todas'] === undefined && !user.roles.includes('admin'))
                                              }
                                              onChange={() => handleToggle('ssma_rid_editar_todas', false)}
                                              className="mt-0.5 text-emerald-600 focus:ring-emerald-500 h-3.5 w-3.5"
                                            />
                                            <div>
                                              <span className="font-semibold text-slate-800 dark:text-slate-200">Apenas os próprios RIDs criados (Padrão)</span>
                                              <p className="text-[10px] text-slate-500 dark:text-slate-400">Vê todos os desvios, mas edita, altera status e exclui apenas os que ele mesmo registrou.</p>
                                            </div>
                                          </label>
                                          <label className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                                            <input
                                              type="radio"
                                              name={`ssma_rid_edit_${user.id}`}
                                              checked={
                                                pageAccess['ssma_rid_editar_todas'] === true ||
                                                (pageAccess['ssma_rid_editar_todas'] === undefined && user.roles.includes('admin'))
                                              }
                                              onChange={() => handleToggle('ssma_rid_editar_todas', true)}
                                              className="mt-0.5 text-emerald-600 focus:ring-emerald-500 h-3.5 w-3.5"
                                            />
                                            <div>
                                              <span className="font-semibold text-slate-800 dark:text-slate-200">Editar todos os RIDs</span>
                                              <p className="text-[10px] text-slate-500 dark:text-slate-400">Permite editar, mudar status, emitir parecer e gerenciar RIDs abertos por qualquer usuário.</p>
                                            </div>
                                          </label>
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
        )}
      </ModalBody>
      <ModalFooter>
        {!isAdmin && Object.keys(pageAccess).length > 0 && (
          <button
            type="button"
            onClick={handleResetAll}
            className="text-xs font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 mr-auto"
          >
            Restaurar todos
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 rounded-lg bg-slate-800 dark:bg-slate-700 text-white text-xs font-bold hover:bg-slate-900 dark:hover:bg-slate-600"
        >
          Fechar
        </button>
      </ModalFooter>
    </Modal>
  );
}

