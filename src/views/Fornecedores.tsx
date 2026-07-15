/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Search, Filter, X, Check, Star, AlertTriangle, Loader2,
  ChevronUp, ChevronDown, RefreshCw, Building2, ChevronsUpDown, Plus,
  Phone, Mail, Trash2
} from 'lucide-react';
import { supabase } from '../db/supabaseClient';
import { localDb } from '../db/localDb';
import { ContatoFornecedor, Profile } from '../types';

interface FornecedoresProps {
  user: Profile;
}

type SortField = 'cod_vendor' | 'fornecedor' | 'nome_fantasia' | 'telefone' | 'email' | 'classificacao';
type SortDir = 'asc' | 'desc';

const CLASSIFICACOES = ['Preferencial', 'Aprovado', 'Em avaliação', 'Bloqueado', ''];

const CLASSIFICACAO_OPTS = [
  { value: '', label: 'Todas classificações' },
  { value: 'Preferencial', label: 'Preferencial' },
  { value: 'Aprovado', label: 'Aprovado' },
  { value: 'Em avaliação', label: 'Em avaliação' },
  { value: 'Bloqueado', label: 'Bloqueado' },
  { value: '__vazio__', label: 'Sem classificação' },
];

const classifColor: Record<string, string> = {
  Preferencial: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  Aprovado: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300',
  'Em avaliação': 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  Bloqueado: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
};

function classifBadge(classificacao?: string) {
  if (!classificacao) return null;
  const cls = classifColor[classificacao] || 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      <Star className="h-3 w-3" />
      {classificacao}
    </span>
  );
}

// Hook de debounce para a busca
function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// Modal de cadastro (Novo Fornecedor)
interface CadastroModalProps {
  onClose: () => void;
  onSaved: () => void;
}

function CadastroModal({ onClose, onSaved }: CadastroModalProps) {
  const [codVendor, setCodVendor] = useState('');
  const [fornecedor, setFornecedor] = useState('');
  const [nomeFantasia, setNomeFantasia] = useState('');
  const [classificacao, setClassificacao] = useState('');
  const [emails, setEmails] = useState<string[]>(['']);
  const [telefones, setTelefones] = useState<string[]>(['']);
  
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleAddEmail = () => {
    setEmails(prev => [...prev, '']);
  };

  const handleRemoveEmail = (index: number) => {
    setEmails(prev => prev.filter((_, idx) => idx !== index));
  };

  const handleEmailChange = (index: number, val: string) => {
    setEmails(prev => prev.map((e, idx) => idx === index ? val : e));
  };

  const handleAddTelefone = () => {
    setTelefones(prev => [...prev, '']);
  };

  const handleRemoveTelefone = (index: number) => {
    setTelefones(prev => prev.filter((_, idx) => idx !== index));
  };

  const handleTelefoneChange = (index: number, val: string) => {
    setTelefones(prev => prev.map((t, idx) => idx === index ? val : t));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!codVendor.trim()) { setError('Código SAP é obrigatório.'); return; }
    if (!supabase) { setError('Supabase não configurado.'); return; }

    setSaving(true);
    setError('');
    try {
      // Filtra e junta os emails com "; "
      const emailsFiltrados = emails
        .map(em => em.trim())
        .filter(Boolean)
        .join('; ');

      // Filtra e junta os telefones com "; "
      const telefonesFiltrados = telefones
        .map(t => t.trim())
        .filter(Boolean)
        .join('; ');

      const payload = {
        cod_vendor: codVendor.trim(),
        fornecedor: fornecedor.trim() || null,
        nome_fantasia: nomeFantasia.trim() || null,
        telefone: telefonesFiltrados || null,
        email: emailsFiltrados || null,
        classificacao: classificacao || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { error: insErr } = await supabase.from('contatos').insert(payload);
      if (insErr) throw insErr;

      // Sincroniza o banco local com o Supabase após a alteração
      localDb.syncFromSupabase().catch(err => console.error('Erro ao sincronizar após cadastro:', err));

      onSaved();
      onClose();
    } catch (e: any) {
      if (e.code === '23505') {
        setError(`Já existe um fornecedor com o Código SAP "${codVendor.trim()}".`);
      } else {
        setError(e.message || 'Erro ao cadastrar fornecedor.');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-55 dark:bg-slate-800/50">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
              <Building2 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">Novo Fornecedor</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Preencha os dados cadastrais</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-105 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Coluna da Esquerda: Dados Básicos */}
            <div className="space-y-4">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Dados Principais</h3>
              
              <div className="space-y-1.5">
                <label htmlFor="new_cod_vendor" className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  Código SAP <span className="text-red-500">*</span>
                </label>
                <input
                  id="new_cod_vendor"
                  type="text"
                  required
                  value={codVendor}
                  onChange={e => setCodVendor(e.target.value)}
                  placeholder="Ex: 10001234"
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="new_fornecedor" className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  Razão Social
                </label>
                <input
                  id="new_fornecedor"
                  type="text"
                  value={fornecedor}
                  onChange={e => setFornecedor(e.target.value)}
                  placeholder="Ex: Empresa Ltda."
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="new_nome_fantasia" className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  Nome Fantasia
                </label>
                <input
                  id="new_nome_fantasia"
                  type="text"
                  value={nomeFantasia}
                  onChange={e => setNomeFantasia(e.target.value)}
                  placeholder="Ex: Nome Fantasia Comercial"
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="new_classificacao" className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  Classificação
                </label>
                <select
                  id="new_classificacao"
                  value={classificacao}
                  onChange={e => setClassificacao(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all appearance-none"
                >
                  <option value="">— Sem classificação</option>
                  {CLASSIFICACOES.filter(Boolean).map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Coluna da Direita: Listas Dinâmicas de E-mails e Telefones */}
            <div className="space-y-5">
              {/* Seção de E-mails */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">E-mails de Contato</h3>
                  <button
                    type="button"
                    onClick={handleAddEmail}
                    className="flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                  >
                    <Plus className="h-3.5 w-3.5" /> Adicionar E-mail
                  </button>
                </div>

                <div className="space-y-2 max-h-[140px] overflow-y-auto pr-1">
                  {emails.map((email, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <input
                        type="email"
                        value={email}
                        onChange={e => handleEmailChange(index, e.target.value)}
                        placeholder={`E-mail ${index + 1}`}
                        className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                      />
                      {emails.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveEmail(index)}
                          className="p-1.5 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-xl transition-colors shrink-0"
                          title="Remover este e-mail"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Seção de Telefones */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Telefones de Contato</h3>
                  <button
                    type="button"
                    onClick={handleAddTelefone}
                    className="flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                  >
                    <Plus className="h-3.5 w-3.5" /> Adicionar Telefone
                  </button>
                </div>

                <div className="space-y-2 max-h-[140px] overflow-y-auto pr-1">
                  {telefones.map((tel, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={tel}
                        onChange={e => handleTelefoneChange(index, e.target.value)}
                        placeholder={`Telefone ${index + 1}`}
                        className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                      />
                      {telefones.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveTelefone(index)}
                          className="p-1.5 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-xl transition-colors shrink-0"
                          title="Remover este telefone"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3.5 py-3 text-sm text-red-700 dark:text-red-300">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex gap-3 border-t border-slate-100 dark:border-slate-800 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || !codVendor.trim()}
              className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2.5 text-sm font-semibold text-white transition-colors shadow-sm"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {saving ? 'Salvando...' : 'Cadastrar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Modal de Visualização / Edição de Fornecedor Existente (Editar e Salvar)
interface EdicaoModalProps {
  supplier: ContatoFornecedor;
  canEdit: boolean;
  onClose: () => void;
  onSaved: () => void;
}

function EdicaoModal({ supplier, canEdit, onClose, onSaved }: EdicaoModalProps) {
  const [fornecedor, setFornecedor] = useState(supplier.fornecedor || '');
  const [nomeFantasia, setNomeFantasia] = useState(supplier.nome_fantasia || '');
  const [classificacao, setClassificacao] = useState(supplier.classificacao || '');
  
  // Converte a string de emails com ";" para um array editável
  const [emails, setEmails] = useState<string[]>(() => {
    if (!supplier.email) return [''];
    return supplier.email.split(';').map(e => e.trim()).filter(Boolean);
  });

  // Converte a string de telefones com ";" para um array editável
  const [telefones, setTelefones] = useState<string[]>(() => {
    if (!supplier.telefone) return [''];
    return supplier.telefone.split(';').map(t => t.trim()).filter(Boolean);
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleAddEmail = () => {
    if (!canEdit) return;
    setEmails(prev => [...prev, '']);
  };

  const handleRemoveEmail = (index: number) => {
    if (!canEdit) return;
    setEmails(prev => prev.filter((_, idx) => idx !== index));
  };

  const handleEmailChange = (index: number, val: string) => {
    if (!canEdit) return;
    setEmails(prev => prev.map((e, idx) => idx === index ? val : e));
  };

  const handleAddTelefone = () => {
    if (!canEdit) return;
    setTelefones(prev => [...prev, '']);
  };

  const handleRemoveTelefone = (index: number) => {
    if (!canEdit) return;
    setTelefones(prev => prev.filter((_, idx) => idx !== index));
  };

  const handleTelefoneChange = (index: number, val: string) => {
    if (!canEdit) return;
    setTelefones(prev => prev.map((t, idx) => idx === index ? val : t));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) { setError('Supabase não configurado.'); return; }

    setSaving(true);
    setError('');
    try {
      const emailsFiltrados = emails
        .map(em => em.trim())
        .filter(Boolean)
        .join('; ');

      const telefonesFiltrados = telefones
        .map(t => t.trim())
        .filter(Boolean)
        .join('; ');

      const { error: upErr } = await supabase
        .from('contatos')
        .update({
          fornecedor: fornecedor.trim() || null,
          nome_fantasia: nomeFantasia.trim() || null,
          telefone: telefonesFiltrados || null,
          email: emailsFiltrados || null,
          classificacao: classificacao || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', supplier.id);

      if (upErr) throw upErr;

      // Sincroniza o banco local com o Supabase após a alteração
      localDb.syncFromSupabase().catch(err => console.error('Erro ao sincronizar após edição:', err));

      onSaved();
      onClose();
    } catch (e: any) {
      setError(e.message || 'Erro ao atualizar dados do fornecedor.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
              <Building2 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">
                {canEdit ? 'Editar Fornecedor' : 'Detalhes do Fornecedor'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                SAP Código: <span className="font-mono font-semibold">{supplier.cod_vendor}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Coluna Esquerda: Campos Principais */}
            <div className="space-y-4">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Dados Principais</h3>

              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  Código SAP (Vendor)
                </label>
                <input
                  type="text"
                  disabled
                  value={supplier.cod_vendor}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-850 px-3.5 py-2.5 text-sm text-slate-500 dark:text-slate-400 focus:outline-none cursor-not-allowed"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="edit_fornecedor" className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  Razão Social
                </label>
                <input
                  id="edit_fornecedor"
                  type="text"
                  disabled={!canEdit}
                  value={fornecedor}
                  onChange={e => setFornecedor(e.target.value)}
                  placeholder="Ex: Empresa Ltda."
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-55 dark:bg-slate-800 disabled:bg-slate-100 dark:disabled:bg-slate-800/50 disabled:text-slate-550 px-3.5 py-2.5 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="edit_nome_fantasia" className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  Nome Fantasia
                </label>
                <input
                  id="edit_nome_fantasia"
                  type="text"
                  disabled={!canEdit}
                  value={nomeFantasia}
                  onChange={e => setNomeFantasia(e.target.value)}
                  placeholder="Ex: Nome Fantasia Comercial"
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-55 dark:bg-slate-800 disabled:bg-slate-100 dark:disabled:bg-slate-800/50 disabled:text-slate-550 px-3.5 py-2.5 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="edit_classificacao" className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  Classificação
                </label>
                <select
                  id="edit_classificacao"
                  disabled={!canEdit}
                  value={classificacao}
                  onChange={e => setClassificacao(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-55 dark:bg-slate-800 disabled:bg-slate-100 dark:disabled:bg-slate-800/50 disabled:text-slate-555 px-3.5 py-2.5 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all appearance-none"
                >
                  <option value="">— Sem classificação</option>
                  {CLASSIFICACOES.filter(Boolean).map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Coluna Direita: Listas Dinâmicas de E-mails e Telefones */}
            <div className="space-y-5">
              {/* Seção de E-mails */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">E-mails de Contato</h3>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={handleAddEmail}
                      className="flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                    >
                      <Plus className="h-3.5 w-3.5" /> Adicionar E-mail
                    </button>
                  )}
                </div>

                <div className="space-y-2 max-h-[140px] overflow-y-auto pr-1">
                  {emails.map((email, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <input
                        type="email"
                        disabled={!canEdit}
                        value={email}
                        onChange={e => handleEmailChange(index, e.target.value)}
                        placeholder={`E-mail ${index + 1}`}
                        className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-55 dark:bg-slate-800 disabled:bg-slate-100 dark:disabled:bg-slate-800/50 disabled:text-slate-555 px-3.5 py-2 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                      />
                      {canEdit && emails.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveEmail(index)}
                          className="p-1.5 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-xl transition-colors shrink-0"
                          title="Remover este e-mail"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Seção de Telefones */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Telefones de Contato</h3>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={handleAddTelefone}
                      className="flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                    >
                      <Plus className="h-3.5 w-3.5" /> Adicionar Telefone
                    </button>
                  )}
                </div>

                <div className="space-y-2 max-h-[140px] overflow-y-auto pr-1">
                  {telefones.map((tel, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <input
                        type="text"
                        disabled={!canEdit}
                        value={tel}
                        onChange={e => handleTelefoneChange(index, e.target.value)}
                        placeholder={`Telefone ${index + 1}`}
                        className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-55 dark:bg-slate-800 disabled:bg-slate-100 dark:disabled:bg-slate-800/50 disabled:text-slate-555 px-3.5 py-2 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                      />
                      {canEdit && telefones.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveTelefone(index)}
                          className="p-1.5 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-xl transition-colors shrink-0"
                          title="Remover este telefone"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3.5 py-3 text-sm text-red-700 dark:text-red-300">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex gap-3 border-t border-slate-100 dark:border-slate-800 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            >
              {canEdit ? 'Cancelar' : 'Fechar'}
            </button>
            {canEdit && (
              <button
                type="submit"
                disabled={saving}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2.5 text-sm font-semibold text-white transition-colors shadow-sm"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {saving ? 'Salvando...' : 'Editar e salvar'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

const PAGE_SIZE = 50;

export default function Fornecedores({ user }: FornecedoresProps) {
  const canEdit = user.roles.includes('admin') || user.roles.includes('comprador');

  // Dados
  const [rows, setRows] = useState<ContatoFornecedor[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Modais de controle
  const [showCadastro, setShowCadastro] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<ContatoFornecedor | null>(null);

  // Carrega do cache
  const pageCache = localDb.getPageCache('fornecedores', {
    searchRaw: '',
    classificacaoFilter: '',
    hasPhone: false,
    hasEmail: false,
    page: 0,
    sortField: 'cod_vendor' as SortField,
    sortDir: 'asc' as SortDir
  });

  // Filtros
  const [searchRaw, setSearchRaw] = useState(pageCache.searchRaw);
  const [classificacaoFilter, setClassificacaoFilter] = useState(pageCache.classificacaoFilter);
  const [hasPhone, setHasPhone] = useState(pageCache.hasPhone);
  const [hasEmail, setHasEmail] = useState(pageCache.hasEmail);
  const search = useDebounce(searchRaw, 350);

  // Paginacao
  const [page, setPage] = useState(pageCache.page);

  // Ordenacao
  const [sortField, setSortField] = useState<SortField>(pageCache.sortField);
  const [sortDir, setSortDir] = useState<SortDir>(pageCache.sortDir);

  const isFirstRender = useRef(true);

  // Efeito para salvar no cache
  useEffect(() => {
    localDb.setPageCache('fornecedores', {
      searchRaw,
      classificacaoFilter,
      hasPhone,
      hasEmail,
      page,
      sortField,
      sortDir
    });
  }, [searchRaw, classificacaoFilter, hasPhone, hasEmail, page, sortField, sortDir]);

  const loadData = useCallback(async () => {
    if (!supabase) { setError('Supabase não configurado.'); setLoading(false); return; }
    setLoading(true);
    setError('');
    try {
      let q = supabase.from('contatos').select('*', { count: 'exact' });

      if (search.trim()) {
        const term = search.trim();
        q = q.or(`cod_vendor.ilike.%${term}%,fornecedor.ilike.%${term}%,email.ilike.%${term}%`);
      }

      if (classificacaoFilter === '__vazio__') {
        q = q.or('classificacao.is.null,classificacao.eq.');
      } else if (classificacaoFilter) {
        q = q.eq('classificacao', classificacaoFilter);
      }

      if (hasPhone) q = q.not('telefone', 'is', null).neq('telefone', '');
      if (hasEmail) q = q.not('email', 'is', null).neq('email', '');

      q = q.order(sortField, { ascending: sortDir === 'asc' });
      q = q.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      const { data, error: qErr, count } = await q;
      if (qErr) throw qErr;
      setRows(data || []);
      setTotalCount(count || 0);
    } catch (e: any) {
      setError(e.message || 'Erro ao carregar fornecedores.');
    } finally {
      setLoading(false);
    }
  }, [search, classificacaoFilter, hasPhone, hasEmail, sortField, sortDir, page]);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    setPage(0);
  }, [search, classificacaoFilter, hasPhone, hasEmail, sortField, sortDir]);
  useEffect(() => { loadData(); }, [loadData]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ChevronsUpDown className="h-3.5 w-3.5 text-slate-400 ml-1" />;
    return sortDir === 'asc'
      ? <ChevronUp className="h-3.5 w-3.5 text-blue-500 ml-1" />
      : <ChevronDown className="h-3.5 w-3.5 text-blue-500 ml-1" />;
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const hasFilters = !!search.trim() || !!classificacaoFilter || hasPhone || hasEmail;

  const clearFilters = () => {
    setSearchRaw('');
    setClassificacaoFilter('');
    setHasPhone(false);
    setHasEmail(false);
    setPage(0);
  };

  return (
    <>
      {/* Modal de cadastro */}
      {showCadastro && (
        <CadastroModal
          onClose={() => setShowCadastro(false)}
          onSaved={() => { loadData(); }}
        />
      )}

      {/* Modal de visualização / edição */}
      {selectedSupplier && (
        <EdicaoModal
          supplier={selectedSupplier}
          canEdit={canEdit}
          onClose={() => setSelectedSupplier(null)}
          onSaved={() => { loadData(); }}
        />
      )}

      <div className="space-y-5">
        {/* Cabecalho */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Building2 className="h-5 w-5 text-blue-500" />
              <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Fornecedores</h1>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {loading ? 'Carregando...' : `${totalCount.toLocaleString('pt-BR')} registro${totalCount !== 1 ? 's' : ''} encontrado${totalCount !== 1 ? 's' : ''}`}
              {canEdit && <span className="ml-2 text-xs text-blue-500">(clique em um fornecedor para editar)</span>}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => loadData()}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              title="Atualizar"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Atualizar
            </button>

            {canEdit && (
              <button
                onClick={() => setShowCadastro(true)}
                className="flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition-colors"
              >
                <Plus className="h-4 w-4" />
                Cadastrar
              </button>
            )}
          </div>
        </div>

        {/* Barra de filtros */}
        <div className="flex flex-wrap gap-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Buscar por código, nome ou e-mail..."
              value={searchRaw}
              onChange={e => setSearchRaw(e.target.value)}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 pl-9 pr-3 py-2 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-slate-400"
            />
            {searchRaw && (
              <button onClick={() => setSearchRaw('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            <select
              value={classificacaoFilter}
              onChange={e => setClassificacaoFilter(e.target.value)}
              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 pl-9 pr-8 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none cursor-pointer"
            >
              {CLASSIFICACAO_OPTS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-2 cursor-pointer select-none rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
            <input type="checkbox" checked={hasPhone} onChange={e => setHasPhone(e.target.checked)} className="accent-blue-500" />
            <Phone className="h-3.5 w-3.5" />
            Com telefone
          </label>

          <label className="flex items-center gap-2 cursor-pointer select-none rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
            <input type="checkbox" checked={hasEmail} onChange={e => setHasEmail(e.target.checked)} className="accent-blue-500" />
            <Mail className="h-3.5 w-3.5" />
            Com e-mail
          </label>

          {hasFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1.5 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
              Limpar filtros
            </button>
          )}
        </div>

        {/* Tabela */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
          {error ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-500 dark:text-slate-400 gap-3">
              <AlertTriangle className="h-8 w-8 text-red-400" />
              <p className="text-sm font-medium">{error}</p>
              <button onClick={loadData} className="text-xs text-blue-500 hover:underline">Tentar novamente</button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60">
                    {([
                      { field: 'cod_vendor', label: 'Cód. Vendor' },
                      { field: 'fornecedor', label: 'Fornecedor' },
                      { field: 'nome_fantasia', label: 'Nome Fantasia' },
                      { field: 'telefone', label: 'Telefone' },
                      { field: 'email', label: 'E-mail' },
                      { field: 'classificacao', label: 'Classificação' },
                    ] as { field: SortField; label: string }[]).map(col => (
                      <th
                        key={col.field}
                        className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide cursor-pointer hover:text-slate-700 dark:hover:text-slate-200 select-none"
                        onClick={() => handleSort(col.field)}
                      >
                        <div className="flex items-center">
                          {col.label}
                          <SortIcon field={col.field} />
                        </div>
                      </th>
                    ))}
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">
                      Atualizado em
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i} className="border-b border-slate-50 dark:border-slate-800/60 animate-pulse">
                        {Array.from({ length: 6 }).map((_, j) => (
                          <td key={j} className="px-4 py-3">
                            <div className="h-4 rounded bg-slate-100 dark:bg-slate-800" style={{ width: `${60 + Math.random() * 30}%` }} />
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : rows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-20 text-center text-slate-400 dark:text-slate-500">
                        <Building2 className="h-8 w-8 mx-auto mb-3 opacity-30" />
                        <p className="text-sm font-medium">Nenhum fornecedor encontrado</p>
                        {hasFilters && <p className="text-xs mt-1">Tente ajustar os filtros</p>}
                        {canEdit && !hasFilters && (
                          <button
                            onClick={() => setShowCadastro(true)}
                            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 px-4 py-2 text-xs font-semibold text-white transition-colors"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            Cadastrar primeiro fornecedor
                          </button>
                        )}
                      </td>
                    </tr>
                  ) : rows.map((row, idx) => (
                    <tr
                      key={row.id}
                      onClick={() => setSelectedSupplier(row)}
                      className={`border-b border-slate-50 dark:border-slate-800/60 transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-800/40 cursor-pointer ${idx % 2 === 0 ? '' : 'bg-slate-50/30 dark:bg-slate-800/20'}`}
                    >
                      <td className="px-4 py-3.5">
                        <span className="font-mono text-xs font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded px-1.5 py-0.5">
                          {row.cod_vendor}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 max-w-[240px]">
                        <span className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate block" title={row.fornecedor}>
                          {row.fornecedor || <span className="text-slate-400 font-normal">—</span>}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 max-w-[200px]">
                        <span className="text-sm text-slate-700 dark:text-slate-200 truncate block font-medium" title={row.nome_fantasia || ''}>
                          {row.nome_fantasia || <span className="text-slate-400 font-normal">—</span>}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="text-sm text-slate-700 dark:text-slate-200 block truncate max-w-[200px]" title={row.telefone ? row.telefone.split(';').join(', ') : ''}>
                          {row.telefone ? row.telefone.split(';').join(', ') : <span className="text-slate-400">—</span>}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="text-sm text-slate-700 dark:text-slate-200" title={row.email}>
                          {row.email || <span className="text-slate-400">—</span>}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        {classifBadge(row.classificacao) || <span className="text-slate-400 text-xs">—</span>}
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <span className="text-xs text-slate-400">
                          {row.updated_at
                            ? new Date(row.updated_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
                            : row.created_at
                              ? new Date(row.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
                              : '—'
                          }
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Paginacao */}
          {!loading && !error && totalCount > PAGE_SIZE && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Página {page + 1} de {totalPages} &nbsp;·&nbsp; {totalCount.toLocaleString('pt-BR')} registros
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  ← Anterior
                </button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const start = Math.max(0, Math.min(page - 2, totalPages - 5));
                  const p = start + i;
                  return (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                        p === page
                          ? 'bg-blue-500 text-white'
                          : 'border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                      }`}
                    >
                      {p + 1}
                    </button>
                  );
                })}
                <button
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Próxima →
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
