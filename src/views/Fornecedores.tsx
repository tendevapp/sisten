/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Search, Filter, X, Check, Star, AlertTriangle, Loader2,
  ChevronUp, ChevronDown, RefreshCw, Building2, ChevronsUpDown, Plus,
  Phone, Mail, Trash2, UserX, Download, UserPlus
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase } from '../db/supabaseClient';
import { localDb } from '../db/localDb';
import { ContatoFornecedor, Profile } from '../types';
import Modal, { ModalHeader, ModalBody, ModalFooter } from '../components/ui/Modal';
import Pagination from '../components/ui/Pagination';

interface FornecedoresProps {
  user: Profile;
}

type SortField = 'cod_vendor' | 'cnpj' | 'fornecedor' | 'nome_contato' | 'nome_fantasia' | 'telefone' | 'email' | 'classificacao' | 'status';
type SortDir = 'asc' | 'desc';

// Formatação visual de CNPJ
function formatCNPJ(cnpj?: string | null): string {
  if (!cnpj) return '—';
  const clean = cnpj.replace(/\D/g, '');
  if (clean.length === 14) {
    return clean.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  }
  return cnpj;
}

const CLASSIFICACOES = [
  'Equipamentos Pesados e Motores',
  'Material de Construção, Siderurgia e Premoldados',
  'Amplo Varejo',
  'Preferencial',
  'Aprovado',
  'Em avaliação',
  'Bloqueado',
  ''
];

const STATUS_OPTS = ['Atualizado', 'Em Atualização', 'Pendente', 'Sem SAP', 'Inativo'];

const STATUS_FILTER_OPTS = [
  { value: '', label: 'Todos os status' },
  { value: 'Atualizado', label: 'Atualizado' },
  { value: 'Em Atualização', label: 'Em Atualização' },
  { value: 'Pendente', label: 'Pendente' },
  { value: 'Sem SAP', label: 'Sem SAP' },
  { value: 'Inativo', label: 'Inativo' },
  { value: '__vazio__', label: 'Sem status' },
];

const statusStyle: Record<string, { badge: string; dot: string }> = {
  'Atualizado': {
    badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-300/50 dark:border-emerald-700/50',
    dot: 'bg-emerald-500',
  },
  'Em Atualização': {
    badge: 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border-blue-300/50 dark:border-blue-700/50',
    dot: 'bg-blue-500',
  },
  'Pendente': {
    badge: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-300/50 dark:border-amber-700/50',
    dot: 'bg-amber-500',
  },
  'Sem SAP': {
    badge: 'bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 border-purple-300/50 dark:border-purple-700/50',
    dot: 'bg-purple-500',
  },
  'Inativo': {
    badge: 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border-rose-300/50 dark:border-rose-700/50',
    dot: 'bg-rose-500',
  },
};

// Caracteres com significado especial na sintaxe de filtro do PostgREST
const SPECIAL_FILTER_CHARS = /[,()."%*\\]/g;
const sanitizeFilterTerm = (term: string) => term.replace(SPECIAL_FILTER_CHARS, '').trim();

function splitMultiValues(raw?: string | null): string[] {
  if (!raw) return [];
  return raw.split(/[;,/\n]+/).map(v => v.trim()).filter(Boolean);
}

const CLASSIFICACAO_OPTS = [
  { value: '', label: 'Todas classificações' },
  { value: 'Equipamentos Pesados e Motores', label: 'Equipamentos Pesados e Motores' },
  { value: 'Material de Construção, Siderurgia e Premoldados', label: 'Material de Construção, Siderurgia e Premoldados' },
  { value: 'Amplo Varejo', label: 'Amplo Varejo' },
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
  initialValues?: {
    codVendor?: string;
    cnpj?: string;
    fornecedor?: string;
  };
  onClose: () => void;
  onSaved: () => void;
}

function CadastroModal({ initialValues, onClose, onSaved }: CadastroModalProps) {
  const [codVendor, setCodVendor] = useState(initialValues?.codVendor && initialValues.codVendor !== '—' ? initialValues.codVendor : '');
  const [cnpj, setCnpj] = useState(initialValues?.cnpj && initialValues.cnpj !== '—' ? initialValues.cnpj : '');
  const [fornecedor, setFornecedor] = useState(initialValues?.fornecedor && initialValues.fornecedor !== '— Sem razão social —' ? initialValues.fornecedor : '');
  const [nomeFantasia, setNomeFantasia] = useState('');
  const [classificacao, setClassificacao] = useState('');
  const [status, setStatus] = useState('Atualizado');
  const [emails, setEmails] = useState<string[]>(['']);
  const [telefones, setTelefones] = useState<string[]>(['']);

  // Representante (opcional)
  const [representanteNome, setRepresentanteNome] = useState('');
  const [representanteCargo, setRepresentanteCargo] = useState('');
  const [representanteTelefone, setRepresentanteTelefone] = useState('');
  const [representanteEmail, setRepresentanteEmail] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

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
    if (!status) { setError('O campo Status é obrigatório.'); return; }
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
        cod_vendor: codVendor.trim() || null,
        cnpj: cnpj.trim() || null,
        fornecedor: fornecedor.trim() || null,
        nome_fantasia: nomeFantasia.trim() || null,
        telefone: telefonesFiltrados || null,
        email: emailsFiltrados || null,
        representante_nome: representanteNome.trim() || null,
        representante_cargo: representanteCargo.trim() || null,
        representante_telefone: representanteTelefone.trim() || null,
        representante_email: representanteEmail.trim() || null,
        classificacao: classificacao || null,
        status: status || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { error: insErr } = await supabase.from('contatos').insert(payload);
      if (insErr) throw insErr;

      // Rebaixa apenas os contatos (leve) e incrementa a versão do dataset,
      // em vez do sync completo de todas as tabelas.
      localDb.syncContatos().catch(err => console.error('Erro ao sincronizar após cadastro:', err));

      onSaved();
      onClose();
    } catch (e: any) {
      if (e.code === '23505' && codVendor.trim()) {
        setError(`Já existe um fornecedor com o Código SAP "${codVendor.trim()}".`);
      } else {
        setError(e.message || 'Erro ao cadastrar fornecedor.');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal onClose={onClose} ariaLabel="Novo Fornecedor">
      <ModalHeader onClose={onClose}>
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center shrink-0">
            <Building2 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">Novo Fornecedor</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Preencha os dados cadastrais</p>
          </div>
        </div>
      </ModalHeader>

      <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
        <ModalBody className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Coluna da Esquerda: Dados Básicos */}
            <div className="space-y-4">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Dados Principais</h3>
              
              <div className="space-y-1.5">
                <label htmlFor="new_cod_vendor" className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  Código SAP <span className="text-xs font-normal text-slate-400">(opcional)</span>
                </label>
                <input
                  id="new_cod_vendor"
                  type="text"
                  value={codVendor}
                  onChange={e => setCodVendor(e.target.value)}
                  placeholder="Ex: 10001234"
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="new_status" className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  Status <span className="text-red-500">*</span>
                </label>
                <select
                  id="new_status"
                  required
                  value={status}
                  onChange={e => setStatus(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all appearance-none"
                >
                  <option value="">— Selecione um status —</option>
                  {STATUS_OPTS.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="new_cnpj" className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  CNPJ
                </label>
                <input
                  id="new_cnpj"
                  type="text"
                  value={cnpj}
                  onChange={e => setCnpj(e.target.value)}
                  placeholder="Ex: 00.000.000/0000-00"
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-mono"
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

              <div className="space-y-4 pt-3 border-t border-slate-200 dark:border-slate-700">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Representante (Opcional)</h3>

                <div className="space-y-1.5">
                  <label htmlFor="new_representante_nome" className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                    Nome do Representante
                  </label>
                  <input
                    id="new_representante_nome"
                    type="text"
                    value={representanteNome}
                    onChange={e => setRepresentanteNome(e.target.value)}
                    placeholder="Ex: João da Silva"
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="new_representante_cargo" className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                    Cargo/Função
                  </label>
                  <input
                    id="new_representante_cargo"
                    type="text"
                    value={representanteCargo}
                    onChange={e => setRepresentanteCargo(e.target.value)}
                    placeholder="Ex: Gerente de Vendas"
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="new_representante_telefone" className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                    Telefone do Representante
                  </label>
                  <input
                    id="new_representante_telefone"
                    type="tel"
                    value={representanteTelefone}
                    onChange={e => setRepresentanteTelefone(e.target.value)}
                    placeholder="Ex: (11) 98765-4321"
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="new_representante_email" className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                    E-mail do Representante
                  </label>
                  <input
                    id="new_representante_email"
                    type="email"
                    value={representanteEmail}
                    onChange={e => setRepresentanteEmail(e.target.value)}
                    placeholder="Ex: joao@empresa.com"
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                  />
                </div>
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

                <div className="space-y-2">
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

                <div className="space-y-2">
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
        </ModalBody>

        <ModalFooter>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 sm:flex-initial rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving || !status}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2.5 text-sm font-semibold text-white transition-colors shadow-sm"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {saving ? 'Salvando...' : 'Cadastrar'}
          </button>
        </ModalFooter>
      </form>
    </Modal>
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
  const [codVendor, setCodVendor] = useState(supplier.cod_vendor || '');
  const [cnpj, setCnpj] = useState(supplier.cnpj || '');
  const [fornecedor, setFornecedor] = useState(supplier.fornecedor || '');
  const [nomeContato, setNomeContato] = useState(supplier.nome_contato || '');
  const [nomeFantasia, setNomeFantasia] = useState(supplier.nome_fantasia || '');
  const [classificacao, setClassificacao] = useState(supplier.classificacao || '');
  const [status, setStatus] = useState(supplier.status || 'Atualizado');
  
  // Converte a string de emails (possivelmente com múltiplos valores) em um array editável
  const [emails, setEmails] = useState<string[]>(() => {
    const parsed = splitMultiValues(supplier.email);
    return parsed.length ? parsed : [''];
  });

  // Converte a string de telefones (possivelmente com múltiplos valores) em um array editável
  const [telefones, setTelefones] = useState<string[]>(() => {
    const parsed = splitMultiValues(supplier.telefone);
    return parsed.length ? parsed : [''];
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

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
    if (!status) { setError('O campo Status é obrigatório.'); return; }
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
          cod_vendor: codVendor.trim() || null,
          cnpj: cnpj.trim() || null,
          fornecedor: fornecedor.trim() || null,
          nome_contato: nomeContato.trim() || null,
          nome_fantasia: nomeFantasia.trim() || null,
          telefone: telefonesFiltrados || null,
          email: emailsFiltrados || null,
          classificacao: classificacao || null,
          status: status || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', supplier.id);

      if (upErr) throw upErr;

      // Rebaixa apenas os contatos (leve) e incrementa a versão do dataset,
      // em vez do sync completo de todas as tabelas.
      localDb.syncContatos().catch(err => console.error('Erro ao sincronizar após edição:', err));

      onSaved();
      onClose();
    } catch (e: any) {
      setError(e.message || 'Erro ao atualizar dados do fornecedor.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal onClose={onClose} ariaLabel={canEdit ? 'Editar Fornecedor' : 'Detalhes do Fornecedor'}>
      <ModalHeader onClose={onClose}>
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center shrink-0">
            <Building2 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">
              {canEdit ? 'Editar Fornecedor' : 'Detalhes do Fornecedor'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              SAP Código: <span className="font-mono font-semibold">{codVendor || 'Sem SAP'}</span>
            </p>
          </div>
        </div>
      </ModalHeader>

      <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
        <ModalBody className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Coluna Esquerda: Campos Principais */}
            <div className="space-y-4">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Dados Principais</h3>

              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  Código SAP (Vendor) <span className="text-xs font-normal text-slate-400">(opcional)</span>
                </label>
                <input
                  type="text"
                  disabled={!canEdit}
                  value={codVendor}
                  onChange={e => setCodVendor(e.target.value)}
                  placeholder="Ex: 10001234 (opcional)"
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 disabled:bg-slate-100 dark:disabled:bg-slate-850 disabled:text-slate-500 px-3.5 py-2.5 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="edit_status" className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  Status <span className="text-red-500">*</span>
                </label>
                <select
                  id="edit_status"
                  disabled={!canEdit}
                  required
                  value={status}
                  onChange={e => setStatus(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 disabled:bg-slate-100 dark:disabled:bg-slate-800/50 disabled:text-slate-500 px-3.5 py-2.5 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all appearance-none"
                >
                  <option value="">— Selecione um status —</option>
                  {STATUS_OPTS.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="edit_cnpj" className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  CNPJ
                </label>
                <input
                  id="edit_cnpj"
                  type="text"
                  disabled={!canEdit}
                  value={cnpj}
                  onChange={e => setCnpj(e.target.value)}
                  placeholder="Ex: 00.000.000/0000-00"
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-55 dark:bg-slate-800 disabled:bg-slate-100 dark:disabled:bg-slate-800/50 disabled:text-slate-550 px-3.5 py-2.5 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-mono"
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
                <label htmlFor="edit_nome_contato" className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  Contato
                </label>
                <input
                  id="edit_nome_contato"
                  type="text"
                  disabled={!canEdit}
                  value={nomeContato}
                  onChange={e => setNomeContato(e.target.value)}
                  placeholder="Ex: Nome do responsável"
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

                <div className="space-y-2">
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

                <div className="space-y-2">
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
        </ModalBody>

        <ModalFooter>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 sm:flex-initial rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            {canEdit ? 'Cancelar' : 'Fechar'}
          </button>
          {canEdit && (
            <button
              type="submit"
              disabled={saving}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2.5 text-sm font-semibold text-white transition-colors shadow-sm"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {saving ? 'Salvando...' : 'Editar e salvar'}
            </button>
          )}
        </ModalFooter>
      </form>
    </Modal>
  );
}

type SubTab = 'cadastrados' | 'nao_cadastrados';

interface NaoCadastradoItem {
  cod_forn: string;
  cnpj: string;
  fornecedor: string;
  total_pedidos: number;
}

const PAGE_SIZE = 50;

export default function Fornecedores({ user }: FornecedoresProps) {
  const canEdit = user.roles.includes('admin') || user.roles.includes('comprador');

  // Sub-abas (Cadastrados x Não Cadastrados)
  const [subTab, setSubTab] = useState<SubTab>('cadastrados');
  const [cadastroInitialValues, setCadastroInitialValues] = useState<{ codVendor?: string; cnpj?: string; fornecedor?: string } | undefined>(undefined);

  // Dados Cadastrados
  const [rows, setRows] = useState<ContatoFornecedor[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Dados Não Cadastrados
  const [naoCadastradosList, setNaoCadastradosList] = useState<NaoCadastradoItem[]>([]);
  const [naoCadastradosLoading, setNaoCadastradosLoading] = useState(false);
  const [naoCadastradosError, setNaoCadastradosError] = useState('');
  const [naoCadastradosSearch, setNaoCadastradosSearch] = useState('');
  const [naoCadastradosPage, setNaoCadastradosPage] = useState(0);

  // Modais de controle
  const [showCadastro, setShowCadastro] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<ContatoFornecedor | null>(null);

  // Carrega do cache
  const pageCache = localDb.getPageCache('fornecedores', {
    searchRaw: '',
    classificacaoFilter: '',
    statusFilter: '',
    hasPhone: false,
    hasEmail: false,
    page: 0,
    sortField: 'cod_vendor' as SortField,
    sortDir: 'asc' as SortDir
  });

  // Filtros
  const [searchRaw, setSearchRaw] = useState(pageCache.searchRaw);
  const [classificacaoFilter, setClassificacaoFilter] = useState(pageCache.classificacaoFilter);
  const [statusFilter, setStatusFilter] = useState(pageCache.statusFilter || '');
  const [hasPhone, setHasPhone] = useState(pageCache.hasPhone);
  const [hasEmail, setHasEmail] = useState(pageCache.hasEmail);
  const search = useDebounce(searchRaw, 350);

  // Lista dinâmica de classificações extraídas dos dados reais da tabela contatos
  const [classificacaoOpts, setClassificacaoOpts] = useState<string[]>([]);

  const loadClassificacoes = useCallback(async () => {
    const set = new Set<string>([
      'Equipamentos Pesados e Motores',
      'Material de Construção, Siderurgia e Premoldados',
      'Amplo Varejo',
      'Preferencial',
      'Aprovado',
      'Em avaliação',
      'Bloqueado'
    ]);

    const localContatos = localDb.getContatosForn();
    localContatos.forEach(c => {
      if (c.classificacao && c.classificacao.trim()) set.add(c.classificacao.trim());
    });

    if (supabase) {
      try {
        const { data } = await supabase
          .from('contatos')
          .select('classificacao')
          .not('classificacao', 'is', null)
          .neq('classificacao', '');
        if (data) {
          data.forEach(d => {
            if (d.classificacao && d.classificacao.trim()) set.add(d.classificacao.trim());
          });
        }
      } catch (e) {
        console.warn('Erro ao carregar classificações únicas do Supabase:', e);
      }
    }

    setClassificacaoOpts(Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR')));
  }, []);

  useEffect(() => {
    loadClassificacoes();
  }, [loadClassificacoes]);

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
      statusFilter,
      hasPhone,
      hasEmail,
      page,
      sortField,
      sortDir
    });
  }, [searchRaw, classificacaoFilter, statusFilter, hasPhone, hasEmail, page, sortField, sortDir]);

  const loadData = useCallback(async () => {
    if (!supabase) { setError('Supabase não configurado.'); setLoading(false); return; }
    setLoading(true);
    setError('');
    try {
      let q = supabase.from('contatos').select('*', { count: 'exact' });

      const term = sanitizeFilterTerm(search);
      if (term) {
        q = q.or(`cod_vendor.ilike.%${term}%,cnpj.ilike.%${term}%,fornecedor.ilike.%${term}%,email.ilike.%${term}%`);
      }

      if (classificacaoFilter === '__vazio__') {
        q = q.or('classificacao.is.null,classificacao.eq.');
      } else if (classificacaoFilter) {
        q = q.eq('classificacao', classificacaoFilter);
      }

      if (statusFilter === '__vazio__') {
        q = q.or('status.is.null,status.eq.');
      } else if (statusFilter) {
        q = q.eq('status', statusFilter);
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
  }, [search, classificacaoFilter, statusFilter, hasPhone, hasEmail, sortField, sortDir, page]);

  // Carrega fornecedores da pedidosforn que não existem na contatos
  const loadNaoCadastradosData = useCallback(async () => {
    setNaoCadastradosLoading(true);
    setNaoCadastradosError('');
    try {
      const registeredCodes = new Set<string>();
      const registeredCnpjs = new Set<string>();

      if (supabase) {
        let pageIndex = 0;
        let hasMore = true;
        while (hasMore) {
          const { data, error: cErr } = await supabase
            .from('contatos')
            .select('cod_vendor, cnpj')
            .range(pageIndex * 1000, (pageIndex + 1) * 1000 - 1);

          if (cErr || !data || data.length === 0) {
            hasMore = false;
          } else {
            for (const c of data) {
              if (c.cod_vendor) {
                const code = String(c.cod_vendor).trim();
                if (code) registeredCodes.add(code);
              }
              if (c.cnpj) {
                const clean = String(c.cnpj).replace(/\D/g, '');
                if (clean) registeredCnpjs.add(clean);
              }
            }
            if (data.length < 1000) hasMore = false;
            else pageIndex++;
          }
          if (pageIndex > 10) break;
        }
      }

      let rawPedidos: any[] = [];
      if (supabase) {
        let pageIndex = 0;
        let hasMore = true;
        while (hasMore) {
          const { data, error: pErr } = await supabase
            .from('pedidosforn')
            .select('fornecedor_codigo, cod_forn, cnpj_fornecedor, cnpj, fornecedor_nome, fornecedor')
            .range(pageIndex * 1000, (pageIndex + 1) * 1000 - 1);

          if (pErr || !data || data.length === 0) {
            hasMore = false;
          } else {
            rawPedidos.push(...data);
            if (data.length < 1000) hasMore = false;
            else pageIndex++;
          }
          if (pageIndex > 15) break;
        }
      }

      if (rawPedidos.length === 0) {
        rawPedidos = localDb.getPedidosForn() as any[];
      }

      const map = new Map<string, NaoCadastradoItem>();

      for (const row of rawPedidos) {
        const rawCode = String(row.fornecedor_codigo || row.cod_forn || '').trim();
        const rawCnpj = String(row.cnpj_fornecedor || row.cnpj || '').trim();
        const rawNome = String(row.fornecedor_nome || row.fornecedor || '').trim();
        const cleanCnpj = rawCnpj.replace(/\D/g, '');

        if (!rawCode && !rawCnpj && !rawNome) continue;

        const isRegistered =
          (rawCode && registeredCodes.has(rawCode)) ||
          (cleanCnpj && registeredCnpjs.has(cleanCnpj));

        if (!isRegistered) {
          const key = rawCode || cleanCnpj || rawNome.toLowerCase();
          if (!map.has(key)) {
            map.set(key, {
              cod_forn: rawCode || '—',
              cnpj: rawCnpj || '—',
              fornecedor: rawNome || '— Sem razão social —',
              total_pedidos: 1
            });
          } else {
            const item = map.get(key)!;
            item.total_pedidos += 1;
            if (item.cod_forn === '—' && rawCode) item.cod_forn = rawCode;
            if (item.cnpj === '—' && rawCnpj) item.cnpj = rawCnpj;
            if (item.fornecedor === '— Sem razão social —' && rawNome) item.fornecedor = rawNome;
          }
        }
      }

      const result = Array.from(map.values()).sort((a, b) => b.total_pedidos - a.total_pedidos);
      setNaoCadastradosList(result);
    } catch (e: any) {
      setNaoCadastradosError(e.message || 'Erro ao carregar fornecedores não cadastrados.');
    } finally {
      setNaoCadastradosLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNaoCadastradosData();
  }, [loadNaoCadastradosData]);

  const filteredNaoCadastrados = useMemo(() => {
    if (!naoCadastradosSearch.trim()) return naoCadastradosList;
    const q = naoCadastradosSearch.trim().toLowerCase();
    return naoCadastradosList.filter(item =>
      item.cod_forn.toLowerCase().includes(q) ||
      item.cnpj.toLowerCase().includes(q) ||
      item.fornecedor.toLowerCase().includes(q)
    );
  }, [naoCadastradosList, naoCadastradosSearch]);

  const naoCadastradosTotalPages = Math.ceil(filteredNaoCadastrados.length / PAGE_SIZE);
  const paginatedNaoCadastrados = useMemo(() => {
    const start = naoCadastradosPage * PAGE_SIZE;
    return filteredNaoCadastrados.slice(start, start + PAGE_SIZE);
  }, [filteredNaoCadastrados, naoCadastradosPage]);

  const handleExportNaoCadastrados = () => {
    const exportData = filteredNaoCadastrados.map(item => ({
      'Código Fornecedor': item.cod_forn,
      'CNPJ': item.cnpj !== '—' ? formatCNPJ(item.cnpj) : '—',
      'Razão Social / Nome': item.fornecedor,
      'Qtd. Pedidos no SAP': item.total_pedidos
    }));
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Não Cadastrados');
    XLSX.writeFile(wb, `Fornecedores_Nao_Cadastrados_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const handleStatusChange = async (supplierId: string, newStatus: string) => {
    if (!canEdit || !supabase) return;
    try {
      const { error: upErr } = await supabase
        .from('contatos')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', supplierId);
      if (upErr) throw upErr;
      setRows(prev => prev.map(r => r.id === supplierId ? { ...r, status: newStatus } : r));
      localDb.syncContatos().catch(err => console.error('Erro ao sincronizar após alterar status:', err));
    } catch (e: any) {
      alert('Erro ao atualizar status: ' + (e.message || e.toString()));
    }
  };

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    setPage(0);
  }, [search, classificacaoFilter, statusFilter, hasPhone, hasEmail, sortField, sortDir]);
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
  const hasFilters = !!search.trim() || !!classificacaoFilter || !!statusFilter || hasPhone || hasEmail;

  const clearFilters = () => {
    setSearchRaw('');
    setClassificacaoFilter('');
    setStatusFilter('');
    setHasPhone(false);
    setHasEmail(false);
    setPage(0);
  };

  return (
    <>
      {/* Modal de cadastro */}
      {showCadastro && (
        <CadastroModal
          initialValues={cadastroInitialValues}
          onClose={() => { setShowCadastro(false); setCadastroInitialValues(undefined); }}
          onSaved={() => { loadData(); loadNaoCadastradosData(); }}
        />
      )}

      {/* Modal de visualização / edição */}
      {selectedSupplier && (
        <EdicaoModal
          supplier={selectedSupplier}
          canEdit={canEdit}
          onClose={() => setSelectedSupplier(null)}
          onSaved={() => { loadData(); loadNaoCadastradosData(); }}
        />
      )}

      <div className="space-y-5">
        {/* Cabecalho */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Building2 className="h-5 w-5 text-blue-500" />
              <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Fornecedores</h1>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {subTab === 'cadastrados'
                ? (loading ? 'Carregando...' : `${totalCount.toLocaleString('pt-BR')} registro${totalCount !== 1 ? 's' : ''} cadastrado${totalCount !== 1 ? 's' : ''}`)
                : (naoCadastradosLoading ? 'Buscando fornecedores não cadastrados...' : `${naoCadastradosList.length.toLocaleString('pt-BR')} fornecedor${naoCadastradosList.length !== 1 ? 'es' : ''} em pedidos (pedidosforn) sem cadastro`)
              }
              {canEdit && subTab === 'cadastrados' && <span className="ml-2 text-xs text-blue-500">(clique em um fornecedor para editar)</span>}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {subTab === 'cadastrados' ? (
              <>
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
                    onClick={() => { setCadastroInitialValues(undefined); setShowCadastro(true); }}
                    className="flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition-colors"
                  >
                    <Plus className="h-4 w-4" />
                    Cadastrar
                  </button>
                )}
              </>
            ) : (
              <>
                <button
                  onClick={() => loadNaoCadastradosData()}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                  title="Atualizar lista"
                >
                  <RefreshCw className={`h-4 w-4 ${naoCadastradosLoading ? 'animate-spin' : ''}`} />
                  Atualizar
                </button>

                <button
                  onClick={handleExportNaoCadastrados}
                  disabled={naoCadastradosList.length === 0}
                  className="flex items-center gap-1.5 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 px-3 py-1.5 text-sm font-semibold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors disabled:opacity-50"
                >
                  <Download className="h-4 w-4" />
                  Exportar Excel
                </button>
              </>
            )}
          </div>
        </div>

        {/* Sub-navegação por SubPáginas / Tabs */}
        <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-700 pb-3">
          <button
            onClick={() => setSubTab('cadastrados')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              subTab === 'cadastrados'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <Building2 className="h-4 w-4" />
            Cadastrados
            <span className={`ml-1 text-xs px-2 py-0.5 rounded-full ${subTab === 'cadastrados' ? 'bg-blue-500/40 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}>
              {totalCount.toLocaleString('pt-BR')}
            </span>
          </button>

          <button
            onClick={() => setSubTab('nao_cadastrados')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              subTab === 'nao_cadastrados'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <UserX className="h-4 w-4" />
            Não Cadastrados
            {naoCadastradosLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin ml-1" />
            ) : (
              <span className={`ml-1 text-xs px-2 py-0.5 rounded-full ${subTab === 'nao_cadastrados' ? 'bg-amber-500/40 text-white' : 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'}`}>
                {naoCadastradosList.length.toLocaleString('pt-BR')}
              </span>
            )}
          </button>
        </div>

        {/* Conteúdo da Aba Cadastrados */}
        {subTab === 'cadastrados' && (
          <>
            {/* Barra de filtros */}
            <div className="flex flex-wrap gap-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm">
              <div className="relative flex-1 min-w-[220px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Buscar por código, CNPJ, nome ou e-mail..."
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
                  className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 pl-9 pr-8 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none cursor-pointer"
                >
                  <option value="">Todas classificações</option>
                  {classificacaoOpts.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                  <option value="__vazio__">Sem classificação</option>
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
              </div>

              <div className="relative">
                <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                <select
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value)}
                  className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 pl-9 pr-8 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none cursor-pointer"
                >
                  {STATUS_FILTER_OPTS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
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

            {/* Tabela de Cadastrados */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
              {error ? (
                <div className="flex flex-col items-center justify-center py-20 text-slate-500 dark:text-slate-400 gap-3">
                  <AlertTriangle className="h-8 w-8 text-red-400" />
                  <p className="text-sm font-medium">{error}</p>
                  <button onClick={loadData} className="text-xs text-blue-500 hover:underline">Tentar novamente</button>
                </div>
              ) : (
                <>
                {/* Mobile: lista em cards */}
                <div className="lg:hidden divide-y divide-slate-100 dark:divide-slate-800">
                  {loading ? (
                    Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="p-4 animate-pulse space-y-2">
                        <div className="h-4 w-2/3 rounded bg-slate-100 dark:bg-slate-800" />
                        <div className="h-3 w-1/2 rounded bg-slate-100 dark:bg-slate-800" />
                      </div>
                    ))
                  ) : rows.length === 0 ? (
                    <div className="px-4 py-16 text-center text-slate-400 dark:text-slate-500">
                      <Building2 className="h-8 w-8 mx-auto mb-3 opacity-30" />
                      <p className="text-sm font-medium">Nenhum fornecedor encontrado</p>
                      {hasFilters && <p className="text-xs mt-1">Tente ajustar os filtros</p>}
                      {canEdit && !hasFilters && (
                        <button
                          onClick={() => { setCadastroInitialValues(undefined); setShowCadastro(true); }}
                          className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 px-4 py-2 text-xs font-semibold text-white transition-colors"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Cadastrar primeiro fornecedor
                        </button>
                      )}
                    </div>
                  ) : rows.map(row => (
                    <button
                      key={row.id}
                      onClick={() => setSelectedSupplier(row)}
                      className="w-full text-left p-4 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 min-w-0 truncate">
                          {row.fornecedor || row.nome_fantasia || '— Sem razão social —'}
                        </span>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <span className="font-mono text-[11px] font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded px-1.5 py-0.5">
                            {row.cod_vendor || 'Sem SAP'}
                          </span>
                          {row.cnpj && (
                            <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400">
                              {formatCNPJ(row.cnpj)}
                            </span>
                          )}
                        </div>
                      </div>
                      {row.nome_contato && (
                        <p className="text-xs text-slate-600 dark:text-slate-300 truncate">{row.nome_contato}</p>
                      )}
                      <div className="mt-1.5 flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
                        {row.telefone && (
                          <span className="flex items-center gap-1.5 truncate">
                            <Phone className="h-3 w-3 shrink-0" /> {splitMultiValues(row.telefone).join(', ')}
                          </span>
                        )}
                        {row.email && (
                          <span className="flex items-center gap-1.5 truncate">
                            <Mail className="h-3 w-3 shrink-0" /> {splitMultiValues(row.email).join(', ')}
                          </span>
                        )}
                      </div>
                      <div className="mt-2 flex items-center gap-2 flex-wrap">
                        {classifBadge(row.classificacao)}
                        {row.status && (
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                            statusStyle[row.status]?.badge || 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200'
                          }`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${statusStyle[row.status]?.dot || 'bg-slate-400'}`} />
                            {row.status}
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>

                {/* Desktop: tabela completa */}
                <div className="hidden lg:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60">
                        {([
                          { field: 'cod_vendor', label: 'Cód. Vendor' },
                          { field: 'cnpj', label: 'CNPJ' },
                          { field: 'fornecedor', label: 'Fornecedor' },
                          { field: 'nome_fantasia', label: 'Nome Fantasia' },
                          { field: 'nome_contato', label: 'Contato' },
                          { field: 'telefone', label: 'Telefone' },
                          { field: 'email', label: 'E-mail' },
                          { field: 'classificacao', label: 'Classificação' },
                          { field: 'status', label: 'Status' },
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
                            {Array.from({ length: 9 }).map((_, j) => (
                              <td key={j} className="px-4 py-3">
                                <div className="h-4 rounded bg-slate-100 dark:bg-slate-800" style={{ width: `${60 + Math.random() * 30}%` }} />
                              </td>
                            ))}
                          </tr>
                        ))
                      ) : rows.length === 0 ? (
                        <tr>
                          <td colSpan={10} className="px-4 py-20 text-center text-slate-400 dark:text-slate-500">
                            <Building2 className="h-8 w-8 mx-auto mb-3 opacity-30" />
                            <p className="text-sm font-medium">Nenhum fornecedor encontrado</p>
                            {hasFilters && <p className="text-xs mt-1">Tente ajustar os filtros</p>}
                            {canEdit && !hasFilters && (
                              <button
                                onClick={() => { setCadastroInitialValues(undefined); setShowCadastro(true); }}
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
                              {row.cod_vendor || <span className="text-slate-400 font-normal italic">Sem SAP</span>}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 whitespace-nowrap">
                            <span className="font-mono text-xs text-slate-700 dark:text-slate-300" title={row.cnpj || ''}>
                              {formatCNPJ(row.cnpj)}
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
                          <td className="px-4 py-3.5 max-w-[180px]">
                            <span className="text-sm text-slate-700 dark:text-slate-200 truncate block" title={row.nome_contato || ''}>
                              {row.nome_contato || <span className="text-slate-400 font-normal">—</span>}
                            </span>
                          </td>
                          <td className="px-4 py-3.5">
                            <span className="text-sm text-slate-700 dark:text-slate-200 block truncate max-w-[200px]" title={splitMultiValues(row.telefone).join(', ')}>
                              {row.telefone ? splitMultiValues(row.telefone).join(', ') : <span className="text-slate-400">—</span>}
                            </span>
                          </td>
                          <td className="px-4 py-3.5">
                            <span className="text-sm text-slate-700 dark:text-slate-200" title={splitMultiValues(row.email).join(', ')}>
                              {row.email ? splitMultiValues(row.email).join(', ') : <span className="text-slate-400">—</span>}
                            </span>
                          </td>
                          <td className="px-4 py-3.5">
                            {classifBadge(row.classificacao) || <span className="text-slate-400 text-xs">—</span>}
                          </td>
                          <td className="px-4 py-3.5 whitespace-nowrap" onClick={e => e.stopPropagation()}>
                            {canEdit ? (
                              <select
                                value={row.status || 'Atualizado'}
                                onChange={e => handleStatusChange(row.id, e.target.value)}
                                className={`text-xs font-semibold rounded-lg px-2.5 py-1 border focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer transition-all ${
                                  statusStyle[row.status || 'Atualizado']?.badge || 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                                }`}
                              >
                                {STATUS_OPTS.map(st => (
                                  <option key={st} value={st} className="bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-medium">
                                    {st}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border ${
                                statusStyle[row.status || 'Atualizado']?.badge || 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                              }`}>
                                <span className={`h-1.5 w-1.5 rounded-full ${statusStyle[row.status || 'Atualizado']?.dot || 'bg-slate-400'}`} />
                                {row.status || 'Atualizado'}
                              </span>
                            )}
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
                </>
              )}

              {/* Paginacao */}
              {!loading && !error && totalCount > PAGE_SIZE && (
                <Pagination
                  page={page}
                  totalPages={totalPages}
                  onPageChange={setPage}
                  className="border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30"
                  info={<>Página {page + 1} de {totalPages} · {totalCount.toLocaleString('pt-BR')} registros</>}
                />
              )}
            </div>
          </>
        )}

        {/* Conteúdo da Aba Não Cadastrados */}
        {subTab === 'nao_cadastrados' && (
          <div className="space-y-4">
            {/* Barra de Busca e Filtros de Não Cadastrados */}
            <div className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm">
              <div className="relative flex-1 min-w-[220px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Buscar não cadastrado por código, CNPJ ou nome..."
                  value={naoCadastradosSearch}
                  onChange={e => { setNaoCadastradosSearch(e.target.value); setNaoCadastradosPage(0); }}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 pl-9 pr-3 py-2 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500 placeholder-slate-400"
                />
                {naoCadastradosSearch && (
                  <button onClick={() => { setNaoCadastradosSearch(''); setNaoCadastradosPage(0); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Tabela de Não Cadastrados */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
              {naoCadastradosError ? (
                <div className="flex flex-col items-center justify-center py-16 text-slate-500 dark:text-slate-400 gap-3">
                  <AlertTriangle className="h-8 w-8 text-amber-400" />
                  <p className="text-sm font-medium">{naoCadastradosError}</p>
                  <button onClick={loadNaoCadastradosData} className="text-xs text-amber-500 hover:underline">Tentar novamente</button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60">
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                          Cód. Fornecedor
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                          CNPJ
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                          Nome / Razão Social
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                          Pedidos no SAP
                        </th>
                        {canEdit && (
                          <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                            Ação
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {naoCadastradosLoading ? (
                        Array.from({ length: 6 }).map((_, i) => (
                          <tr key={i} className="border-b border-slate-50 dark:border-slate-800/60 animate-pulse">
                            <td className="px-4 py-3.5"><div className="h-4 w-20 rounded bg-slate-100 dark:bg-slate-800" /></td>
                            <td className="px-4 py-3.5"><div className="h-4 w-32 rounded bg-slate-100 dark:bg-slate-800" /></td>
                            <td className="px-4 py-3.5"><div className="h-4 w-48 rounded bg-slate-100 dark:bg-slate-800" /></td>
                            <td className="px-4 py-3.5 text-center"><div className="h-4 w-12 mx-auto rounded bg-slate-100 dark:bg-slate-800" /></td>
                            {canEdit && <td className="px-4 py-3.5 text-right"><div className="h-7 w-24 ml-auto rounded bg-slate-100 dark:bg-slate-800" /></td>}
                          </tr>
                        ))
                      ) : paginatedNaoCadastrados.length === 0 ? (
                        <tr>
                          <td colSpan={canEdit ? 5 : 4} className="px-4 py-16 text-center text-slate-400 dark:text-slate-500">
                            <UserX className="h-8 w-8 mx-auto mb-3 opacity-30" />
                            <p className="text-sm font-medium">Nenhum fornecedor pendente de cadastro</p>
                            {naoCadastradosSearch && <p className="text-xs mt-1">Tente ajustar a busca</p>}
                          </td>
                        </tr>
                      ) : (
                        paginatedNaoCadastrados.map((item, idx) => (
                          <tr
                            key={`${item.cod_forn}-${item.cnpj}-${idx}`}
                            className={`border-b border-slate-50 dark:border-slate-800/60 transition-colors hover:bg-amber-50/30 dark:hover:bg-amber-950/20 ${idx % 2 === 0 ? '' : 'bg-slate-50/30 dark:bg-slate-800/20'}`}
                          >
                            <td className="px-4 py-3.5">
                              <span className="font-mono text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded px-2 py-1">
                                {item.cod_forn}
                              </span>
                            </td>
                            <td className="px-4 py-3.5 whitespace-nowrap">
                              <span className="font-mono text-xs text-slate-700 dark:text-slate-300">
                                {item.cnpj !== '—' ? formatCNPJ(item.cnpj) : '—'}
                              </span>
                            </td>
                            <td className="px-4 py-3.5">
                              <span className="text-sm font-medium text-slate-800 dark:text-slate-100">
                                {item.fornecedor}
                              </span>
                            </td>
                            <td className="px-4 py-3.5 text-center whitespace-nowrap">
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
                                {item.total_pedidos} {item.total_pedidos === 1 ? 'pedido' : 'pedidos'}
                              </span>
                            </td>
                            {canEdit && (
                              <td className="px-4 py-3.5 text-right whitespace-nowrap">
                                <button
                                  onClick={() => {
                                    setCadastroInitialValues({
                                      codVendor: item.cod_forn !== '—' ? item.cod_forn : '',
                                      cnpj: item.cnpj !== '—' ? item.cnpj : '',
                                      fornecedor: item.fornecedor !== '— Sem razão social —' ? item.fornecedor : ''
                                    });
                                    setShowCadastro(true);
                                  }}
                                  className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white transition-colors shadow-sm"
                                >
                                  <UserPlus className="h-3.5 w-3.5" />
                                  Cadastrar
                                </button>
                              </td>
                            )}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Paginacao de Nao Cadastrados */}
              {!naoCadastradosLoading && !naoCadastradosError && filteredNaoCadastrados.length > PAGE_SIZE && (
                <Pagination
                  page={naoCadastradosPage}
                  totalPages={naoCadastradosTotalPages}
                  onPageChange={setNaoCadastradosPage}
                  className="border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30"
                  info={<>Página {naoCadastradosPage + 1} de {naoCadastradosTotalPages} · {filteredNaoCadastrados.length.toLocaleString('pt-BR')} fornecedores</>}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
