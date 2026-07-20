/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Users, Map, Shield, Upload, Check, X, AlertTriangle, 
  Trash, Save, Activity, RefreshCw, FileText, FileSpreadsheet, Plus,
  FileX, CheckCircle2, XCircle, TrendingUp, TrendingDown, ChevronDown, ChevronRight, Download, Truck
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { localDb } from '../db/localDb';
import { getAutoCategory } from '../data/materials';
import { Profile, Sector, Material } from '../types';

interface AdminPanelProps {
  user: Profile;
}

export default function AdminPanel({ user }: AdminPanelProps) {
  const [activeTab, setActiveTab] = useState<
    'usuarios' | 'setores' | 'permissoes' | 'importar' | 'importar_sap' | 'importar_sap_log' | 'grupos_comprador' | 'helpdesk_config'
  >('usuarios');
  
  // Users Management State
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [editingRole, setEditingRole] = useState<string>('');
  const [syncing, setSyncing] = useState(false);
  // Grupo de Compras (SAP) inline por usuário na tabela de Perfis Ativos.
  const [grupoComprasInputs, setGrupoComprasInputs] = useState<Record<string, string>>({});

  // Sectors State
  const [sectors, setSectors] = useState<Sector[]>([]);

  // Materials Importer (aceita planilha SAP .xlsx/.xls ou .csv)
  const [importPreview, setImportPreview] = useState<any[]>([]);
  const [pendingImportItems, setPendingImportItems] = useState<Omit<Material, 'id' | 'is_active' | 'created_at'>[]>([]);
  const [importStatus, setImportStatus] = useState<'idle' | 'parsed' | 'saving' | 'success' | 'error'>('idle');
  const [importError, setImportError] = useState('');
  const [importSummary, setImportSummary] = useState<{ read: number; inserted: number; updated: number; deactivated: number; syncFailed: number } | null>(null);

  // SAP ME5A/ZL0132 upload simulation states
  const [sapLogPreview, setSapLogPreview] = useState<any[]>([]);
  const [sapLogs, setSapLogs] = useState<any[]>([]);
  const [sapLogStatus, setSapLogStatus] = useState<'idle' | 'parsed' | 'saving' | 'success' | 'error'>('idle');
  const [sapProgress, setSapProgress] = useState(0);
  const [sapLogMessage, setSapLogMessage] = useState('');
  const [sapLogError, setSapLogError] = useState('');
  const [currentSapUploadType, setCurrentSapUploadType] = useState<'ME5A' | 'ZL0132'>('ME5A');
  const [sapCsvText, setSapCsvText] = useState('');
  const [lastUploadLog, setLastUploadLog] = useState<any | null>(null);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  // Buyer Groups Config States
  const [selectedBuyerId, setSelectedBuyerId] = useState<string | null>(null);
  const [buyerGroupsInput, setBuyerGroupsInput] = useState<string>('');
  const [buyerPrimaryGroup, setBuyerPrimaryGroup] = useState<string>('');

  // Helpdesk Config States
  const [selectedHelpdeskSectorId, setSelectedHelpdeskSectorId] = useState<string | null>(null);
  const [newHelpdeskCategory, setNewHelpdeskCategory] = useState<string>('');

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash || '#/';
      const path = hash.slice(1).split('?')[0];
      if (path === '/admin/usuarios') setActiveTab('usuarios');
      else if (path === '/admin/setores') setActiveTab('setores');
      else if (path === '/admin/permissoes') setActiveTab('permissoes');
      else if (path === '/admin/importacao-materiais') setActiveTab('importar');
      else if (path === '/suprimentos/importar') setActiveTab('importar_sap');
      else if (path === '/suprimentos/importar/log') setActiveTab('importar_sap_log');
      else if (path === '/suprimentos/grupos-comprador') setActiveTab('grupos_comprador');
      else if (path === '/admin/helpdesk') setActiveTab('helpdesk_config');
    };
    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  useEffect(() => {
    loadData();
    const unsubscribe = localDb.subscribe(() => {
      loadData();
    });
    return () => unsubscribe();
  }, [activeTab]);

  const loadData = () => {
    setProfiles(localDb.getProfiles());
    setSectors(localDb.getSectors());
    setSapLogs(localDb.getImportLogs());
  };

  const handleApproveUser = (id: string, approve: boolean) => {
    const ok = localDb.updateUserStatus(id, approve ? 'ativo' : 'rejeitado');
    if (ok) {
      loadData();
    }
  };

  const handleUpdateRole = (id: string) => {
    if (!editingRole) return;
    const ok = localDb.updateUserRole(id, editingRole);
    if (ok) {
      setSelectedProfileId(null);
      setEditingRole('');
      loadData();
    }
  };

  const handleSaveGrupoCompras = (id: string) => {
    const value = grupoComprasInputs[id] ?? '';
    const ok = localDb.updateUserGrupoCompras(id, value);
    if (ok) {
      loadData();
      setGrupoComprasInputs(prev => { const next = { ...prev }; delete next[id]; return next; });
    }
  };

  const handleToggleSectorSupport = (id: string) => {
    localDb.toggleSectorSupport(id);
    loadData();
  };

  const handleToggleSectorHelpdesk = (id: string) => {
    localDb.toggleSectorHelpdesk(id);
    loadData();
  };

  // Materials import: SAP export structure -> Material | Texto breve material | Texto longo do material | empresa
  const VALID_COMPANIES = ['TEN2', 'AG', 'AMBAS'];

  const parseMaterialsRows = (rawRows: any[][]): Omit<Material, 'id' | 'is_active' | 'created_at'>[] => {
    if (rawRows.length < 2) {
      throw new Error('Planilha vazia ou sem linhas de dados.');
    }

    const normalizeHeader = (h: any) => String(h || '').trim().toLowerCase();
    const headers = rawRows[0].map(normalizeHeader);

    const codeIdx = headers.findIndex(h => h === 'material');
    const descIdx = headers.findIndex(h => h.includes('texto breve'));
    const techIdx = headers.findIndex(h => h.includes('texto longo'));
    const companyIdx = headers.findIndex(h => h === 'empresa');

    if (codeIdx === -1 || descIdx === -1) {
      throw new Error('Colunas obrigatórias não encontradas. Esperado: "Material" e "Texto breve material".');
    }

    const items: Omit<Material, 'id' | 'is_active' | 'created_at'>[] = [];
    rawRows.slice(1).forEach(row => {
      const material_code = String(row[codeIdx] ?? '').trim();
      if (!material_code) return;

      const description = String(row[descIdx] ?? '').trim();
      const rawCompany = companyIdx !== -1 ? String(row[companyIdx] ?? '').trim().toUpperCase() : '';

      items.push({
        material_code,
        description,
        technical_text: techIdx !== -1 ? String(row[techIdx] ?? '').trim() : '',
        category: getAutoCategory(description),
        company: (VALID_COMPANIES.includes(rawCompany) ? rawCompany : 'TEN2') as Material['company'],
        unit: 'UN'
      });
    });

    if (items.length === 0) {
      throw new Error('Nenhum material válido encontrado na planilha.');
    }

    return items;
  };

  const processMaterialsFile = (file: File) => {
    setImportError('');
    const isExcel = /\.(xlsx|xls)$/i.test(file.name);
    const reader = new FileReader();

    reader.onerror = () => {
      setImportError('Falha ao ler o arquivo selecionado.');
      setImportStatus('error');
    };

    if (isExcel) {
      reader.onload = (event) => {
        try {
          const data = new Uint8Array(event.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const worksheet = workbook.Sheets[workbook.SheetNames[0]];
          const rawRows = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: '' });
          const items = parseMaterialsRows(rawRows);
          setPendingImportItems(items);
          setImportPreview(items.slice(0, 10));
          setImportStatus('parsed');
        } catch (err: any) {
          setImportError(err.message || 'Falha ao processar a planilha .xlsx.');
          setImportStatus('error');
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      reader.onload = (event) => {
        try {
          const text = event.target?.result as string;
          const rawRows = text.split('\n').filter(l => l.trim()).map(line =>
            line.split(';').map(c => c.trim().replace(/"/g, ''))
          );
          const items = parseMaterialsRows(rawRows);
          setPendingImportItems(items);
          setImportPreview(items.slice(0, 10));
          setImportStatus('parsed');
        } catch (err: any) {
          setImportError(err.message || 'Falha ao processar o arquivo CSV. Verifique o delimitador (;).');
          setImportStatus('error');
        }
      };
      reader.readAsText(file);
    }
  };

  const handleCSVDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleCSVDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files?.length) {
      processMaterialsFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      processMaterialsFile(e.target.files[0]);
    }
  };

  const handleBulkImport = async () => {
    setImportStatus('saving');
    try {
      const result = await localDb.importMaterials(pendingImportItems);
      setImportSummary(result);
      setImportStatus('success');
      setImportPreview([]);
      setPendingImportItems([]);
    } catch (err: any) {
      console.error('Erro ao importar catálogo de materiais:', err);
      setImportError(`Erro ao realizar salvamento do catálogo: ${err?.message || String(err)}`);
      setImportStatus('error');
    }
  };

  const pendingUsers = profiles.filter(p => p.status === 'pendente');
  const activeUsers = profiles.filter(p => p.status === 'ativo' || p.status === 'pendente');

  const getRoleLabel = (role: string) => {
    const labels: Record<string, string> = {
      admin: 'Administrador',
      visualizador: 'Visualizador',
      solicitante: 'Solicitante',
      gestor: 'Gestor',
      comprador: 'Comprador',
      coordenador_suprimentos: 'Coordenador',
      atendente: 'Atendente Suporte',
      pendente: 'Acesso Pendente'
    };
    return labels[role] || role;
  };

  // Matrix configurations
  const permMatrix = [
    { module: 'Solicitações', desc: 'Criar novas solicitações', roles: ['admin', 'solicitante', 'gestor'] },
    { module: 'Solicitações', desc: 'Visualizar próprias solicitações', roles: ['admin', 'solicitante', 'gestor', 'comprador', 'atendente', 'coordenador_suprimentos', 'visualizador'] },
    { module: 'Compras', desc: 'Aprovar compras (setor)', roles: ['admin', 'gestor', 'coordenador_suprimentos'] },
    { module: 'Suprimentos', desc: 'Acessar painel e dashboards SAP', roles: ['admin', 'comprador', 'coordenador_suprimentos'] },
    { module: 'Helpdesk', desc: 'Atender chamados do setor', roles: ['admin', 'atendente'] },
    { module: 'Admin', desc: 'Gerenciar usuários e setores', roles: ['admin'] }
  ];

  return (
    <div className="space-y-6 text-left">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">Painel de Administração</h2>
        <p className="mt-1 text-sm text-slate-500">Configurações globais, controle de privilégios de acesso, setores ativos e importação de materiais.</p>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap border-b border-slate-200 text-xs font-semibold gap-y-1">
        <button
          onClick={() => { setActiveTab('usuarios'); window.location.hash = '/admin/usuarios'; }}
          className={`pb-3 px-3 border-b-2 transition-all cursor-pointer flex items-center ${activeTab === 'usuarios' ? 'border-emerald-600 text-emerald-800' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          <Users className="h-4 w-4 mr-1.5" />
          Usuários
        </button>
        <button
          onClick={() => { setActiveTab('setores'); window.location.hash = '/admin/setores'; }}
          className={`pb-3 px-3 border-b-2 transition-all cursor-pointer flex items-center ${activeTab === 'setores' ? 'border-emerald-600 text-emerald-800' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          <Map className="h-4 w-4 mr-1.5" />
          Setores ({sectors.length})
        </button>
        <button
          onClick={() => { setActiveTab('permissoes'); window.location.hash = '/admin/permissoes'; }}
          className={`pb-3 px-3 border-b-2 transition-all cursor-pointer flex items-center ${activeTab === 'permissoes' ? 'border-emerald-600 text-emerald-800' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          <Shield className="h-4 w-4 mr-1.5" />
          Permissões (Matrix)
        </button>
        <button
          onClick={() => { setActiveTab('importar'); window.location.hash = '/admin/importacao-materiais'; }}
          className={`pb-3 px-3 border-b-2 transition-all cursor-pointer flex items-center ${activeTab === 'importar' ? 'border-emerald-600 text-emerald-800' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          <Upload className="h-4 w-4 mr-1.5" />
          Importação Catálogo
        </button>
        {(user.roles.includes('admin') || user.roles.includes('coordenador_suprimentos')) && (
          <>
            <button
              onClick={() => { setActiveTab('importar_sap'); window.location.hash = '/suprimentos/importar'; }}
              className={`pb-3 px-3 border-b-2 transition-all cursor-pointer flex items-center ${activeTab === 'importar_sap' ? 'border-emerald-600 text-emerald-800' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
            >
              <FileSpreadsheet className="h-4 w-4 mr-1.5 text-emerald-600" />
              Importar SAP
            </button>
            <button
              onClick={() => { setActiveTab('importar_sap_log'); window.location.hash = '/suprimentos/importar/log'; }}
              className={`pb-3 px-3 border-b-2 transition-all cursor-pointer flex items-center ${activeTab === 'importar_sap_log' ? 'border-emerald-600 text-emerald-800' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
            >
              <Activity className="h-4 w-4 mr-1.5 text-amber-600" />
              Logs SAP
            </button>
            <button
              onClick={() => { setActiveTab('grupos_comprador'); window.location.hash = '/suprimentos/grupos-comprador'; }}
              className={`pb-3 px-3 border-b-2 transition-all cursor-pointer flex items-center ${activeTab === 'grupos_comprador' ? 'border-emerald-600 text-emerald-800' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
            >
              <Users className="h-4 w-4 mr-1.5 text-blue-600" />
              Grupos Compradores
            </button>
          </>
        )}
        {user.roles.includes('admin') && (
          <button
            onClick={() => { setActiveTab('helpdesk_config'); window.location.hash = '/admin/helpdesk'; }}
            className={`pb-3 px-3 border-b-2 transition-all cursor-pointer flex items-center ${activeTab === 'helpdesk_config' ? 'border-emerald-600 text-emerald-800' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            <RefreshCw className="h-4 w-4 mr-1.5 text-indigo-600" />
            Config. Helpdesk
          </button>
        )}
      </div>

      {/* Tab 1: Users approval list and settings */}
      {activeTab === 'usuarios' && (
        <div className="space-y-6">
          {/* Approval Queue for pending users */}
          {pendingUsers.length > 0 && (
            <div className="rounded-xl border border-yellow-100 bg-yellow-50/50 p-5 space-y-3.5">
              <h3 className="text-xs font-bold text-yellow-800 uppercase tracking-widest flex items-center">
                <AlertTriangle className="h-4 w-4 mr-1.5 shrink-0" /> Fila de aprovações pendentes ({pendingUsers.length})
              </h3>
              
              <div className="divide-y divide-yellow-100">
                {pendingUsers.map((p) => (
                  <div key={p.id} className="py-3 flex flex-col sm:flex-row justify-between sm:items-center gap-3 text-xs">
                    <div>
                      <p className="font-bold text-slate-800">{p.name}</p>
                      <p className="text-slate-500 mt-0.5">{p.email} • {p.cargo}</p>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handleApproveUser(p.id, true)}
                        className="rounded bg-emerald-700 hover:bg-emerald-800 text-white font-bold py-1 px-3 cursor-pointer"
                      >
                        Aprovar
                      </button>
                      <button
                        onClick={() => handleApproveUser(p.id, false)}
                        className="rounded border border-yellow-300 hover:bg-yellow-100 text-yellow-800 font-bold py-1 px-3 cursor-pointer"
                      >
                        Recusar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Active profiles list */}
          <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-bold text-slate-800">Perfis Ativos ({activeUsers.length})</h3>
              <button
                onClick={async () => {
                  setSyncing(true);
                  try {
                    await localDb.syncFromSupabase();
                  } catch (err) {
                    console.error('Falha de sincronização explícita no painel admin:', err);
                  } finally {
                    setSyncing(false);
                  }
                }}
                disabled={syncing}
                className="flex items-center gap-1.5 rounded bg-slate-50 hover:bg-slate-100 disabled:opacity-50 text-slate-700 font-bold text-[11px] py-1.5 px-3 cursor-pointer transition-colors border border-slate-200"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
                Sincronizar com o Supabase
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider">
                    <th className="py-2.5">Nome</th>
                    <th className="py-2.5">E-mail</th>
                    <th className="py-2.5">Cargo / Setor</th>
                    <th className="py-2.5">Grupo Compras</th>
                    <th className="py-2.5">Nível de Acesso (Role)</th>
                    <th className="py-2.5 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {activeUsers.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50/50">
                      <td className="py-3 font-semibold text-slate-800 flex items-center gap-2">
                        <span>{p.name}</span>
                        {p.status === 'pendente' && (
                          <span className="bg-amber-100 text-amber-800 text-[10px] font-extrabold px-1.5 py-0.5 rounded border border-amber-250 uppercase animate-pulse shrink-0">
                            Pendente
                          </span>
                        )}
                      </td>
                      <td className="py-3 text-slate-500">{p.email}</td>
                      <td className="py-3 text-slate-600 font-medium">{p.cargo} • Setor {p.sector_id}</td>
                      <td className="py-3">
                        {(() => {
                          const current = p.grupo_compras || '';
                          const value = grupoComprasInputs[p.id] ?? current;
                          const dirty = value.trim() !== current.trim();
                          return (
                            <div className="flex items-center gap-1.5">
                              <input
                                type="text"
                                value={value}
                                onChange={(e) => setGrupoComprasInputs(prev => ({ ...prev, [p.id]: e.target.value }))}
                                onKeyDown={(e) => { if (e.key === 'Enter' && dirty) handleSaveGrupoCompras(p.id); }}
                                placeholder="Ex: 314"
                                className="w-20 rounded border border-slate-200 py-1 px-2 text-xs font-mono focus:outline-none focus:border-emerald-600 bg-white"
                              />
                              {dirty && (
                                <button
                                  onClick={() => handleSaveGrupoCompras(p.id)}
                                  className="rounded bg-emerald-700 hover:bg-emerald-800 text-white p-1 shrink-0"
                                  title="Salvar grupo de compras"
                                >
                                  <Save className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="py-3">
                        {selectedProfileId === p.id ? (
                          <div className="flex items-center space-x-1.5" onClick={(e) => e.stopPropagation()}>
                            <select
                              value={editingRole}
                              onChange={(e) => setEditingRole(e.target.value)}
                              className="rounded border border-slate-200 py-1 px-2 text-xs focus:outline-none focus:border-emerald-600 cursor-pointer bg-white"
                            >
                              <option value="pendente">Acesso Pendente</option>
                              <option value="admin">Admin</option>
                              <option value="solicitante">Solicitante</option>
                              <option value="gestor">Gestor</option>
                              <option value="comprador">Comprador</option>
                              <option value="atendente">Atendente</option>
                              <option value="coordenador_suprimentos">Coordenador</option>
                              <option value="visualizador">Visualizador</option>
                            </select>
                            <button
                              onClick={() => handleUpdateRole(p.id)}
                              className="rounded bg-emerald-800 text-white p-1"
                            >
                              <Check className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => setSelectedProfileId(null)}
                              className="rounded border border-slate-200 text-slate-400 p-1"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : (
                          <span className="font-semibold text-slate-700 bg-slate-50 px-2 py-0.5 rounded inline-block border">
                            {getRoleLabel(p.roles[0])}
                          </span>
                        )}
                      </td>
                      <td className="py-3 text-center">
                        {selectedProfileId !== p.id && (
                          <button
                            onClick={() => { setSelectedProfileId(p.id); setEditingRole(p.roles[0]); }}
                            className="text-emerald-700 hover:underline font-bold"
                          >
                            Editar Permissão
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Sectors matrix settings */}
      {activeTab === 'setores' && (
        <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm space-y-4">
          <h3 className="text-sm font-bold text-slate-800">Setores Corporativos da Torres Eólicas ({sectors.length})</h3>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider">
                  <th className="py-3">ID Setor</th>
                  <th className="py-3">Nome do Setor</th>
                  <th className="py-3 text-center">É Apoio? (Suporte)</th>
                  <th className="py-3 text-center">Helpdesk Ativo?</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sectors.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/50">
                    <td className="py-3 font-mono text-slate-500 font-bold">#{s.id}</td>
                    <td className="py-3 font-semibold text-slate-800">{s.name}</td>
                    <td className="py-3 text-center">
                      <button
                        onClick={() => handleToggleSectorSupport(s.id)}
                        className={`inline-flex items-center px-2 py-1 rounded font-bold text-[10px] uppercase border transition-all ${s.is_support ? 'bg-indigo-50 text-indigo-700 border-indigo-100' : 'bg-slate-50 text-slate-400 border-slate-100'}`}
                      >
                        {s.is_support ? 'Suporte Ativo' : 'Não'}
                      </button>
                    </td>
                    <td className="py-3 text-center">
                      <button
                        onClick={() => handleToggleSectorHelpdesk(s.id)}
                        className={`inline-flex items-center px-2 py-1 rounded font-bold text-[10px] uppercase border transition-all ${s.helpdesk_enabled ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-slate-50 text-slate-400 border-slate-100'}`}
                      >
                        {s.helpdesk_enabled ? 'Helpdesk Ativo' : 'Inativo'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Detailed standard permission matrix for 7 roles */}
      {activeTab === 'permissoes' && (
        <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm space-y-4">
          <h3 className="text-sm font-bold text-slate-800">Matriz de Privilégios (RBAC)</h3>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse min-w-[700px]">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  <th className="py-3 px-3">Módulo</th>
                  <th className="py-3 px-3">Ação Autorizada</th>
                  <th className="py-3 px-3 text-center">Admin</th>
                  <th className="py-3 px-3 text-center">Coord.</th>
                  <th className="py-3 px-3 text-center">Gestor</th>
                  <th className="py-3 px-3 text-center">Comprador</th>
                  <th className="py-3 px-3 text-center">Atendente</th>
                  <th className="py-3 px-3 text-center">Solicitante</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-600">
                {permMatrix.map((item, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/50">
                    <td className="py-3 px-3 font-bold text-slate-800">{item.module}</td>
                    <td className="py-3 px-3">{item.desc}</td>
                    <td className="py-3 px-3 text-center">{item.roles.includes('admin') ? '✓' : '-'}</td>
                    <td className="py-3 px-3 text-center">{item.roles.includes('coordenador_suprimentos') ? '✓' : '-'}</td>
                    <td className="py-3 px-3 text-center">{item.roles.includes('gestor') ? '✓' : '-'}</td>
                    <td className="py-3 px-3 text-center">{item.roles.includes('comprador') ? '✓' : '-'}</td>
                    <td className="py-3 px-3 text-center">{item.roles.includes('atendente') ? '✓' : '-'}</td>
                    <td className="py-3 px-3 text-center">{item.roles.includes('solicitante') ? '✓' : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 4: Materials import (cadastro SAP) */}
      {activeTab === 'importar' && (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-800">Importação do Cadastro de Materiais SAP</h3>
            <p className="text-xs text-slate-500">Carregue a planilha exportada do SAP com as colunas "Material", "Texto breve material", "Texto longo do material" e "empresa". O catálogo local e a tabela <code>materials</code> no Supabase são atualizados automaticamente.</p>

            <div
              onDragOver={handleCSVDragOver}
              onDrop={handleCSVDrop}
              className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center hover:bg-slate-50/50 transition-colors cursor-pointer relative"
            >
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileSelect}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
              />
              <FileSpreadsheet className="mx-auto h-10 w-10 text-gray-400" />
              <p className="mt-2 text-xs font-semibold text-slate-700">Solte a planilha de materiais aqui, ou clique para buscar</p>
              <p className="mt-1 text-[10px] text-slate-400">Aceita .xlsx, .xls ou .csv (delimitado por ponto e vírgula). Máx 10 MB.</p>
            </div>

            {importError && (
              <div className="rounded-lg bg-red-50 p-3 text-xs font-semibold text-red-600 border border-red-100 flex items-center">
                <AlertTriangle className="mr-2 h-4.5 w-4.5 shrink-0 text-red-500" />
                <span>{importError}</span>
              </div>
            )}

            {importStatus === 'saving' && (
              <div className="rounded-lg bg-blue-50 p-3 text-xs font-semibold text-blue-800 border border-blue-100 flex items-center">
                <RefreshCw className="mr-2 h-4.5 w-4.5 shrink-0 text-blue-600 animate-spin" />
                <span>Salvando catálogo no banco local e sincronizando com o Supabase...</span>
              </div>
            )}

            {importStatus === 'success' && importSummary && (
              <div className={`rounded-lg p-3 text-xs font-semibold border flex items-center ${importSummary.syncFailed > 0 ? 'bg-amber-50 text-amber-800 border-amber-100' : 'bg-emerald-50 text-emerald-800 border-emerald-100'}`}>
                {importSummary.syncFailed > 0 ? (
                  <AlertTriangle className="mr-2 h-4.5 w-4.5 shrink-0 text-amber-600" />
                ) : (
                  <Check className="mr-2 h-4.5 w-4.5 shrink-0 text-emerald-600 font-black" />
                )}
                <span>
                  Importação concluída! Lidos: {importSummary.read}, Inseridos: {importSummary.inserted}, Atualizados: {importSummary.updated}, Desativados: {importSummary.deactivated}.
                  {importSummary.syncFailed > 0 && ` ${importSummary.syncFailed} linha(s) não sincronizaram com o Supabase — veja o console para detalhes e tente reimportar.`}
                </span>
              </div>
            )}
          </div>

          {/* Import preview panel if parsed */}
          {importStatus === 'parsed' && importPreview.length > 0 && (
            <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Pré-visualização da Importação ({pendingImportItems.length} itens lidos, amostra dos 10 primeiros)</h4>
                <button
                  onClick={handleBulkImport}
                  className="rounded bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs py-1.5 px-4 cursor-pointer"
                >
                  Confirmar Importação de Planilha
                </button>
              </div>

              <div className="overflow-x-auto rounded-lg border border-slate-100">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50 text-slate-500 font-bold uppercase tracking-wider">
                      <th className="py-2 px-3">Código SAP</th>
                      <th className="py-2 px-3">Descrição</th>
                      <th className="py-2 px-3">Categoria Sugerida</th>
                      <th className="py-2 px-3 text-center">Empresa</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {importPreview.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50">
                        <td className="py-2 px-3 font-mono text-emerald-800 font-bold">{item.material_code}</td>
                        <td className="py-2 px-3 font-semibold text-slate-800">{item.description}</td>
                        <td className="py-2 px-3 font-medium text-slate-600">{item.category}</td>
                        <td className="py-2 px-3 text-center font-bold text-slate-500">{item.company}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 5: Importar SAP (ME5A, ZL0132, PedidosForn & Contatos) */}
      {activeTab === 'importar_sap' && (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-emerald-700" /> Carga de Dados do SAP e Fornecedores
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              O sistema sincroniza a fila de solicitações e ordens de compra cruzando as requisições abertas (ME5A), ordens de compra emitidas (ZL0132), histórico de compras por fornecedor (PedidosForn) e contatos.
              Você pode carregar arquivos nos formatos XLSX, XLS ou CSV, ou simular cargas integradas demonstrativas.
            </p>

            {/* Quick Demo Simulator Buttons */}
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-150 space-y-3.5">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1">
                <RefreshCw className="h-4 w-4 text-emerald-600 shrink-0" /> Simulador de Cargas do SAP e Fornecedores
              </h4>
              <p className="text-[11px] text-slate-500">
                Pressione os botões abaixo para preencher o banco de dados com registros demonstrativos válidos de requisições, ordens, históricos e contatos.
              </p>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => {
                    setSapLogStatus('saving');
                    setLastUploadLog(null);
                    setTimeout(() => {
                      try {
                        const headers = ['Tipo de documento', 'Requisição de compra', 'Item ReqC', 'Data da solicitação', 'Requisitante', 'Material', 'Texto breve', 'Qtd.solicitada', 'Unidade de medida', 'Grupo de compradores'];
                        const data = [
                          ['ZR01', '1000000123', '00010', new Date(Date.now() - 4 * 24 * 3600 * 1000).toISOString().split('T')[0], 'Guilherme Silva', '10000123', 'Cabo de Cobre Flexível 4mm', 150, 'M', '314'],
                          ['ZR02', '1000000123', '00020', new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString().split('T')[0], 'Guilherme Silva', '10000456', 'Disjuntor Termomagnético 50A', 12, 'UN', '314'],
                          ['ZR03', '1000000124', '00010', new Date(Date.now() - 1 * 24 * 3600 * 1000).toISOString().split('T')[0], 'Roberto Souza', '10000789', 'Placa de Aço Laminado 2000x1000x10mm', 5, 'UN', '358']
                        ];
                        const rawRows = [headers, ...data];
                        localDb.importME5ARaw(rawRows, 'sap_export_me5a_simulado.xlsx').then(log => {
                          setLastUploadLog(log);
                          setSapLogStatus('success');
                          setSapLogError('');
                          loadData();
                        }).catch(err => {
                          setSapLogError(err.message || 'Erro ao simular ME5A.');
                          setSapLogStatus('error');
                        });
                      } catch (err: any) {
                        setSapLogError(err.message || 'Erro ao simular ME5A.');
                        setSapLogStatus('error');
                      }
                    }, 800);
                  }}
                  className="rounded bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs py-2 px-4 cursor-pointer flex items-center gap-1.5 transition-colors"
                >
                  <FileSpreadsheet className="h-4 w-4" /> Alimentar Fila SAP (ME5A)
                </button>

                <button
                  onClick={() => {
                    setSapLogStatus('saving');
                    setLastUploadLog(null);
                    setTimeout(() => {
                      try {
                        const headers = ['ReqC', 'Item', 'Doc.compra', 'Itm', 'Fornecedor', 'Nome 1', 'Data doc.', 'Dt.remessa', 'Qtd.pedido'];
                        const data = [
                          ['1000000123', '00010', '4500123456', '00010', 'F900213', 'Metalúrgica Gerdau S.A.', new Date().toISOString().split('T')[0], new Date(Date.now() + 10 * 24 * 3600 * 1000).toISOString().split('T')[0], 150]
                        ];
                        const rawRows = [headers, ...data];
                        localDb.importZL0132Raw(rawRows, 'sap_export_zl0132_simulado.xlsx').then(log => {
                          setLastUploadLog(log);
                          setSapLogStatus('success');
                          setSapLogError('');
                          loadData();
                        }).catch(err => {
                          setSapLogError(err.message || 'Erro ao simular ZL0132.');
                          setSapLogStatus('error');
                        });
                      } catch (err: any) {
                        setSapLogError(err.message || 'Erro ao simular ZL0132.');
                        setSapLogStatus('error');
                      }
                    }, 800);
                  }}
                  className="rounded bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs py-2 px-4 cursor-pointer flex items-center gap-1.5 transition-colors"
                >
                  <FileSpreadsheet className="h-4 w-4" /> Vincular Pedidos Emitidos (ZL0132)
                </button>

                <button
                  onClick={() => {
                    setSapLogStatus('saving');
                    setLastUploadLog(null);
                    setTimeout(() => {
                      try {
                        const headers = ['ReqC', 'Itm', 'Material', 'TxtBreve', 'Fornecedor', 'Nº ID fiscal 1', 'Nome 1', 'Rg', 'Data doc.', 'Valor líquido'];
                        const data = [
                          ['1100320195', '00020', '10000123', 'Cabo de Cobre Flexível 4mm', '1000015507', '12.345.678/0001-99', 'Metalúrgica Gerdau S.A.', 'SP', '2026-06-01', 500],
                          ['1100320250', '00030', '10000123', 'Cabo de Cobre Flexível 4mm', 'F800555', '98.765.432/0001-00', 'Alcoa Alumínio Brasil', 'RJ', '2026-07-01', 1200],
                          ['1100320250', '00040', '10000456', 'Disjuntor Termomagnético 50A', '1000015507', '12.345.678/0001-99', 'Metalúrgica Gerdau S.A.', 'SP', '2026-05-15', 300],
                          ['1100327694', '00010', '10000789', 'Placa de Aço Laminado 2000x1000x10mm', 'F700333', '11.222.333/0001-44', 'Usiminas S.A.', 'MG', '2026-06-20', 4500]
                        ];
                        const rawRows = [headers, ...data];
                        localDb.importPedidosForn(rawRows, 'historico_pedidos_simulado.xlsx', (progress, message) => {
                          setSapProgress(progress);
                          if (message) setSapLogMessage(message);
                        }).then(log => {
                          setLastUploadLog(log);
                          setSapLogStatus('success');
                          setSapLogError('');
                          loadData();
                        }).catch(err => {
                          setSapLogError(err.message || 'Erro ao simular Histórico de Pedidos.');
                          setSapLogStatus('error');
                        });
                      } catch (err: any) {
                        setSapLogError(err.message || 'Erro ao simular Histórico de Pedidos.');
                        setSapLogStatus('error');
                      }
                    }, 800);
                  }}
                  className="rounded bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs py-2 px-4 cursor-pointer flex items-center gap-1.5 transition-colors"
                >
                  <FileSpreadsheet className="h-4 w-4" /> Alimentar Histórico (PedidosForn)
                </button>

                <button
                  onClick={() => {
                    setSapLogStatus('saving');
                    setLastUploadLog(null);
                    setTimeout(() => {
                      try {
                        const headers = ['N° VENDOR', 'FORNECEDORES', 'Contato', 'NOME FANTASIA', 'TELEFONE', 'E-MAIL', 'CLASSIFICAÇÃO'];
                        const data = [
                          ['F900213', 'Metalúrgica Gerdau S.A.', 'Carlos Silva', 'Gerdau', '(11) 98888-7777', 'vendas@gerdau.com.br', 'Parceiro Estratégico'],
                          ['F800555', 'Alcoa Alumínio Brasil', 'Ana Souza', 'Alcoa', '(21) 2555-1234', 'comercial@alcoa.com', 'Homologado'],
                          ['F700333', 'Usiminas S.A.', 'João Pereira', 'Usiminas', '(31) 3499-8000', 'atendimento@usiminas.com', 'Preferencial']
                        ];
                        const rawRows = [headers, ...data];
                        localDb.importContatos(rawRows, 'contatos_fornecedores_simulado.xlsx').then(log => {
                          setLastUploadLog(log);
                          setSapLogStatus('success');
                          setSapLogError('');
                          loadData();
                        }).catch(err => {
                          setSapLogError(err.message || 'Erro ao simular Contatos.');
                          setSapLogStatus('error');
                        });
                      } catch (err: any) {
                        setSapLogError(err.message || 'Erro ao simular Contatos.');
                        setSapLogStatus('error');
                      }
                    }, 800);
                  }}
                  className="rounded bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs py-2 px-4 cursor-pointer flex items-center gap-1.5 transition-colors"
                >
                  <FileSpreadsheet className="h-4 w-4" /> Alimentar Contatos (Contatos)
                </button>
              </div>
            </div>

            {/* Custom file parser */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 pt-1">
              {/* ME5A Upload Card */}
              <div className="border border-slate-200 rounded-xl p-4 space-y-3">
                <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" /> Transação ME5A (Requisições)
                </h4>
                <p className="text-[10px] text-slate-400">Arraste ou cole o arquivo exportado do SAP para atualizar as demandas em aberto.</p>
                <div className="border border-dashed border-slate-200 hover:bg-slate-50/50 rounded-lg p-6 text-center cursor-pointer relative">
                  <input
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    onChange={(e) => {
                      if (e.target.files?.length) {
                        const file = e.target.files[0];
                        const fileExtension = file.name.split('.').pop()?.toLowerCase();
                        setSapLogStatus('saving');
                        setSapProgress(0);
                        setLastUploadLog(null);
                        setSapLogError('');
                        const r = new FileReader();

                        r.onload = (ev) => {
                          try {
                            let rawRows: any[][] = [];
                            if (fileExtension === 'csv') {
                              const text = ev.target?.result as string;
                              rawRows = text.split('\n').filter(l => l.trim()).map(l => {
                                return l.split(';').map(c => c.replace(/"/g, '').trim());
                              });
                            } else {
                              const data = new Uint8Array(ev.target?.result as ArrayBuffer);
                              const workbook = XLSX.read(data, { type: 'array' });
                              if (!workbook.SheetNames.length) throw new Error('Nenhuma planilha encontrada no arquivo.');
                              const sheetName = workbook.SheetNames[0];
                              const worksheet = workbook.Sheets[sheetName];
                              rawRows = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: '' });
                            }

                            localDb.importME5ARaw(rawRows, file.name, setSapProgress).then(log => {
                              setLastUploadLog(log);
                              setSapLogStatus('success');
                              loadData();
                            }).catch(err => {
                              setSapLogError(err.message || 'Falha ao processar planilha.');
                              setSapLogStatus('error');
                            });
                          } catch (err: any) {
                            setSapLogError(err.message || 'Falha ao processar planilha.');
                            setSapLogStatus('error');
                          }
                        };
                        
                        if (fileExtension === 'csv') {
                          r.readAsText(file);
                        } else {
                          r.readAsArrayBuffer(file);
                        }
                      }
                    }}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                  <Upload className="mx-auto h-6 w-6 text-slate-400" />
                  <p className="text-[10px] font-semibold text-slate-600 mt-1">Carregar Excel ou CSV ME5A</p>
                </div>
              </div>

              {/* ZL0132 Upload Card */}
              <div className="border border-slate-200 rounded-xl p-4 space-y-3">
                <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-blue-500" /> Transação ZL0132 (Pedidos de Compra)
                </h4>
                <p className="text-[10px] text-slate-400">Arraste ou cole o arquivo para cruzar requisições com números de PO emitidos.</p>
                <div className="border border-dashed border-slate-200 hover:bg-slate-50/50 rounded-lg p-6 text-center cursor-pointer relative">
                  <input
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    onChange={(e) => {
                      if (e.target.files?.length) {
                        const file = e.target.files[0];
                        const fileExtension = file.name.split('.').pop()?.toLowerCase();
                        setSapLogStatus('saving');
                        setSapProgress(0);
                        setLastUploadLog(null);
                        setSapLogError('');
                        const r = new FileReader();

                        r.onload = (ev) => {
                          try {
                            let rawRows: any[][] = [];
                            if (fileExtension === 'csv') {
                              const text = ev.target?.result as string;
                              rawRows = text.split('\n').filter(l => l.trim()).map(l => {
                                return l.split(';').map(c => c.replace(/"/g, '').trim());
                              });
                            } else {
                              const data = new Uint8Array(ev.target?.result as ArrayBuffer);
                              const workbook = XLSX.read(data, { type: 'array' });
                              if (!workbook.SheetNames.length) throw new Error('Nenhuma planilha encontrada no arquivo.');
                              const sheetName = workbook.SheetNames[0];
                              const worksheet = workbook.Sheets[sheetName];
                              rawRows = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: '' });
                            }

                            localDb.importZL0132Raw(rawRows, file.name, setSapProgress).then(log => {
                              setLastUploadLog(log);
                              setSapLogStatus('success');
                              loadData();
                            }).catch(err => {
                              setSapLogError(err.message || 'Falha ao processar planilha.');
                              setSapLogStatus('error');
                            });
                          } catch (err: any) {
                            setSapLogError(err.message || 'Falha ao processar planilha.');
                            setSapLogStatus('error');
                          }
                        };
                        
                        if (fileExtension === 'csv') {
                          r.readAsText(file);
                        } else {
                          r.readAsArrayBuffer(file);
                        }
                      }
                    }}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                  <Upload className="mx-auto h-6 w-6 text-slate-400" />
                  <p className="text-[10px] font-semibold text-slate-600 mt-1">Carregar Excel ou CSV ZL0132</p>
                </div>
              </div>

              {/* PedidosForn Upload Card */}
              <div className="border border-slate-200 rounded-xl p-4 space-y-3">
                <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" /> Histórico de Pedidos (PedidosForn)
                </h4>
                <p className="text-[10px] text-slate-400">Arraste ou cole o arquivo para atualizar o histórico de fornecedores por material.</p>
                <div className="border border-dashed border-slate-200 hover:bg-slate-50/50 rounded-lg p-6 text-center cursor-pointer relative">
                  <input
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    onChange={(e) => {
                      if (e.target.files?.length) {
                        const file = e.target.files[0];
                        const fileExtension = file.name.split('.').pop()?.toLowerCase();
                        setSapLogStatus('saving');
                        setLastUploadLog(null);
                        setSapLogError('');
                        const r = new FileReader();
                        
                        r.onload = (ev) => {
                          try {
                            let rawRows: any[][] = [];
                            if (fileExtension === 'csv') {
                              const text = ev.target?.result as string;
                              rawRows = text.split('\n').filter(l => l.trim()).map(l => {
                                return l.split(';').map(c => c.replace(/"/g, '').trim());
                              });
                            } else {
                              const data = new Uint8Array(ev.target?.result as ArrayBuffer);
                              const workbook = XLSX.read(data, { type: 'array' });
                              if (!workbook.SheetNames.length) throw new Error('Nenhuma planilha encontrada no arquivo.');
                              const sheetName = workbook.SheetNames[0];
                              const worksheet = workbook.Sheets[sheetName];
                              rawRows = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: '' });
                            }
                            
                            setSapProgress(0);
                            setSapLogMessage('Lendo dados...');
                            localDb.importPedidosForn(rawRows, file.name, (progress, message) => {
                              setSapProgress(progress);
                              if (message) setSapLogMessage(message);
                            }).then(log => {
                              setLastUploadLog(log);
                              setSapLogStatus('success');
                              loadData();
                            }).catch(err => {
                              setSapLogError(err.message || 'Falha ao processar planilha.');
                              setSapLogStatus('error');
                            });
                          } catch (err: any) {
                            setSapLogError(err.message || 'Falha ao processar planilha.');
                            setSapLogStatus('error');
                          }
                        };
                        
                        if (fileExtension === 'csv') {
                          r.readAsText(file);
                        } else {
                          r.readAsArrayBuffer(file);
                        }
                      }
                    }}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                  <Upload className="mx-auto h-6 w-6 text-slate-400" />
                  <p className="text-[10px] font-semibold text-slate-600 mt-1">Carregar Excel ou CSV PedidosForn</p>
                </div>
              </div>

              {/* Contatos Upload Card */}
              <div className="border border-slate-200 rounded-xl p-4 space-y-3">
                <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-blue-500" /> Cadastro de Contatos (Contatos)
                </h4>
                <p className="text-[10px] text-slate-400">Arraste ou cole o arquivo para atualizar os contatos de fornecedores.</p>
                <div className="border border-dashed border-slate-200 hover:bg-slate-50/50 rounded-lg p-6 text-center cursor-pointer relative">
                  <input
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    onChange={(e) => {
                      if (e.target.files?.length) {
                        const file = e.target.files[0];
                        const fileExtension = file.name.split('.').pop()?.toLowerCase();
                        setSapLogStatus('saving');
                        setLastUploadLog(null);
                        setSapLogError('');
                        const r = new FileReader();
                        
                        r.onload = (ev) => {
                          try {
                            let rawRows: any[][] = [];
                            if (fileExtension === 'csv') {
                              const text = ev.target?.result as string;
                              rawRows = text.split('\n').filter(l => l.trim()).map(l => {
                                return l.split(';').map(c => c.replace(/"/g, '').trim());
                              });
                            } else {
                              const data = new Uint8Array(ev.target?.result as ArrayBuffer);
                              const workbook = XLSX.read(data, { type: 'array' });
                              if (!workbook.SheetNames.length) throw new Error('Nenhuma planilha encontrada no arquivo.');
                              const sheetName = workbook.SheetNames[0];
                              const worksheet = workbook.Sheets[sheetName];
                              rawRows = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: '' });
                            }
                            
                            localDb.importContatos(rawRows, file.name).then(log => {
                              setLastUploadLog(log);
                              setSapLogStatus('success');
                              loadData();
                            }).catch(err => {
                              setSapLogError(err.message || 'Falha ao processar planilha.');
                              setSapLogStatus('error');
                            });
                          } catch (err: any) {
                            setSapLogError(err.message || 'Falha ao processar planilha.');
                            setSapLogStatus('error');
                          }
                        };
                        
                        if (fileExtension === 'csv') {
                          r.readAsText(file);
                        } else {
                          r.readAsArrayBuffer(file);
                        }
                      }
                    }}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                  <Upload className="mx-auto h-6 w-6 text-slate-400" />
                  <p className="text-[10px] font-semibold text-slate-600 mt-1">Carregar Excel ou CSV Contatos</p>
                </div>
              </div>
            </div>

            {sapLogStatus === 'saving' && (
              <div className="space-y-2 py-2">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
                  <RefreshCw className="h-4 w-4 animate-spin text-emerald-600" />
                  <span>{sapLogMessage || 'Processando carga do SAP e recalculando metas de entrega...'}</span>
                  <span className="ml-auto tabular-nums text-emerald-600">{sapProgress}%</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all duration-300 ease-out"
                    style={{ width: `${sapProgress}%` }}
                  />
                </div>
              </div>
            )}

            {sapLogError && (
              <div className="rounded-lg bg-red-50 p-3 text-xs font-semibold text-red-600 border border-red-100 flex items-center">
                <AlertTriangle className="mr-1.5 h-4 w-4 text-red-500 shrink-0" />
                <span>{sapLogError}</span>
              </div>
            )}

            {sapLogStatus === 'success' && lastUploadLog && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 space-y-4 text-left">
                <div className="flex items-center gap-2 text-emerald-800 font-bold text-xs">
                  <Check className="h-5 w-5 text-emerald-600 shrink-0" />
                  <span>Carga importada e integrada com sucesso! Todos os SLAs e prazos recalculados.</span>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-[10px]">
                  <div className="bg-white border border-emerald-100 p-2.5 rounded-lg">
                    <p className="text-slate-400 font-semibold">Arquivo</p>
                    <p className="text-slate-700 font-bold font-mono mt-0.5 break-all">{lastUploadLog.filename}</p>
                  </div>
                  <div className="bg-white border border-emerald-100 p-2.5 rounded-lg">
                    <p className="text-slate-400 font-semibold">Linhas Lidas</p>
                    <p className="text-slate-700 font-black text-sm mt-0.5">{lastUploadLog.records_read}</p>
                  </div>
                  <div className="bg-white border border-emerald-100 p-2.5 rounded-lg">
                    <p className="text-slate-400 font-semibold">Novas Inseridas</p>
                    <p className="text-emerald-700 font-black text-sm mt-0.5">+{lastUploadLog.records_inserted}</p>
                  </div>
                  <div className="bg-white border border-emerald-100 p-2.5 rounded-lg">
                    <p className="text-slate-400 font-semibold">Atualizadas / Inativas</p>
                    <p className="text-slate-600 font-black text-sm mt-0.5">{lastUploadLog.records_updated} / {lastUploadLog.records_eliminated}</p>
                  </div>
                </div>

                {lastUploadLog.quantity_changes && lastUploadLog.quantity_changes.length > 0 && (
                  <div className="bg-white border border-emerald-100 p-3 rounded-lg text-[10px] space-y-2">
                    <p className="font-bold text-slate-700">Mudanças de Quantidade Detectadas:</p>
                    <div className="divide-y divide-slate-100 max-h-32 overflow-y-auto">
                      {lastUploadLog.quantity_changes.map((qc: any, idx: number) => (
                        <div key={idx} className="py-1 flex justify-between font-mono">
                          <span className="text-slate-500">{qc.item} (RI: {qc.ri})</span>
                          <span className="font-bold text-amber-600">Qtd: {qc.oldQty} → {qc.newQty}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {lastUploadLog.missing_ris && lastUploadLog.missing_ris.length > 0 && (
                  <div className="bg-white border border-emerald-100 p-3 rounded-lg text-[10px] space-y-2">
                    <div className="flex justify-between items-center">
                      <p className="font-bold text-slate-700">RIs Ausentes na última carga ({lastUploadLog.missing_ris.length}):</p>
                      <button
                        onClick={() => {
                          const text = lastUploadLog.missing_ris.join('\n');
                          const blob = new Blob([text], { type: 'text/plain' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `ris_ausentes_${lastUploadLog.id}.txt`;
                          a.click();
                        }}
                        className="text-[9px] font-bold text-blue-600 hover:underline"
                      >
                        Exportar Lista (.txt)
                      </button>
                    </div>
                  </div>
                )}

                {(lastUploadLog.columns_missing?.length > 0 || lastUploadLog.columns_new?.length > 0) && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-[10px]">
                    {lastUploadLog.columns_missing?.length > 0 && (
                      <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg space-y-1 text-amber-800">
                        <p className="font-bold flex items-center gap-1">
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-600" /> Colunas Esperadas Ausentes:
                        </p>
                        <ul className="list-disc pl-4 space-y-0.5">
                          {lastUploadLog.columns_missing.map((c: string, idx: number) => <li key={`${c}_${idx}`}>{c}</li>)}
                        </ul>
                      </div>
                    )}
                    {lastUploadLog.columns_new?.length > 0 && (
                      <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg space-y-1 text-blue-800">
                        <p className="font-bold flex items-center gap-1">
                          <RefreshCw className="h-3.5 w-3.5 text-blue-600 animate-spin-slow" /> Colunas Novas Detectadas (Salvas em extra):
                        </p>
                        <ul className="list-disc pl-4 space-y-0.5 animate-pulse">
                          {lastUploadLog.columns_new.map((c: string, idx: number) => <li key={`${c}_${idx}`}>{c}</li>)}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}



      {/* Tab 6: Logs SAP */}
      {activeTab === 'importar_sap_log' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-800">Histórico de Cargas do SAP</h3>
              <p className="text-xs text-slate-500">Detalhamento completo das importações ME5A e ZL0132 — registros processados, ignorados e alterações detectadas.</p>
            </div>
            <button
              onClick={loadData}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 hover:bg-slate-100 text-slate-600 rounded-lg text-xs cursor-pointer transition-colors"
              title="Atualizar Logs"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Atualizar
            </button>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                    <th className="py-2.5 px-4 w-8"></th>
                    <th className="py-2.5 px-4">ID Carga</th>
                    <th className="py-2.5 px-4">Tipo</th>
                    <th className="py-2.5 px-4">Arquivo</th>
                    <th className="py-2.5 px-4 text-center">Lidos</th>
                    <th className="py-2.5 px-4 text-center">Importados</th>
                    <th className="py-2.5 px-4 text-center">Ignorados</th>
                    <th className="py-2.5 px-4 text-center">Inativos</th>
                    <th className="py-2.5 px-4">Feito por</th>
                    <th className="py-2.5 px-4">Data</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-600">
                  {sapLogs.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-12 text-center">
                        <div className="flex flex-col items-center gap-2 text-slate-400">
                          <FileSpreadsheet className="h-8 w-8 opacity-30" />
                          <p className="font-medium text-sm">Nenhum registro de carga encontrado.</p>
                          <p className="text-xs">Importe uma planilha ME5A ou ZL0132 para ver o histórico aqui.</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    sapLogs.map((log) => {
                      const isExpanded = expandedLogId === log.id;
                      const totalImported = (log.records_inserted || 0) + (log.records_updated || 0);
                      const totalIgnored = (log.ignored_rows?.length || 0);
                      const hasIssues = totalIgnored > 0 || (log.columns_missing?.length || 0) > 0;
                      return (
                        <React.Fragment key={log.id}>
                          <tr
                            onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                            className={`hover:bg-slate-50/80 cursor-pointer select-none border-b border-slate-100 transition-colors ${isExpanded ? 'bg-indigo-50/30' : ''}`}
                          >
                            <td className="py-3 px-3 text-slate-400">
                              {isExpanded
                                ? <ChevronDown className="h-3.5 w-3.5 text-indigo-500" />
                                : <ChevronRight className="h-3.5 w-3.5" />
                              }
                            </td>
                            <td className="py-3 px-4 font-mono font-bold text-slate-700 text-[11px]">#{log.id.slice(-6).toUpperCase()}</td>
                            <td className="py-3 px-4 font-bold">
                              <span className={`px-2 py-1 rounded-md text-[10px] font-bold tracking-wide ${
                                log.type === 'ME5A'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : log.type === 'ZL0132'
                                  ? 'bg-blue-100 text-blue-800'
                                  : log.type === 'PEDIDOSFORN'
                                  ? 'bg-indigo-100 text-indigo-800'
                                  : 'bg-purple-100 text-purple-800'
                              }`}>
                                {log.type}
                              </span>
                            </td>
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-1.5">
                                <FileSpreadsheet className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                                <span className="font-semibold text-slate-700 truncate max-w-[160px]">{log.filename}</span>
                              </div>
                            </td>
                            <td className="py-3 px-4 text-center font-bold text-slate-800">{log.records_read}</td>
                            <td className="py-3 px-4 text-center">
                              <span className="inline-flex items-center gap-1 font-bold text-emerald-700">
                                <CheckCircle2 className="h-3 w-3" />
                                {totalImported}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-center">
                              {totalIgnored > 0
                                ? <span className="inline-flex items-center gap-1 font-bold text-amber-600">
                                    <XCircle className="h-3 w-3" />
                                    {totalIgnored}
                                  </span>
                                : <span className="text-slate-300 font-medium">—</span>
                              }
                            </td>
                            <td className="py-3 px-4 text-center font-bold text-red-600">
                              {log.records_eliminated > 0 ? log.records_eliminated : <span className="text-slate-300">—</span>}
                            </td>
                            <td className="py-3 px-4 font-medium text-slate-600">{log.user_name}</td>
                            <td className="py-3 px-4 text-slate-400 whitespace-nowrap">{new Date(log.created_at).toLocaleString('pt-BR')}</td>
                          </tr>

                          {isExpanded && (
                            <tr className="bg-slate-50/50">
                              <td colSpan={10} className="px-6 py-4 border-b border-slate-200">
                                <div className="space-y-4 text-xs">

                                  {/* Resumo em cards */}
                                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                    <div className="bg-white rounded-lg border border-slate-200 p-3 shadow-sm">
                                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">ID da Carga</p>
                                      <p className="font-mono font-bold text-slate-700 mt-0.5 text-[11px]">{log.id}</p>
                                    </div>
                                    <div className="bg-white rounded-lg border border-slate-200 p-3 shadow-sm">
                                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Data / Hora</p>
                                      <p className="font-bold text-slate-700 mt-0.5">{new Date(log.created_at).toLocaleString('pt-BR')}</p>
                                    </div>
                                    <div className="bg-emerald-50 rounded-lg border border-emerald-200 p-3 shadow-sm">
                                      <p className="text-[9px] font-bold text-emerald-600 uppercase tracking-wider">Importados com Sucesso</p>
                                      <p className="font-bold text-emerald-700 text-lg mt-0.5">{totalImported}</p>
                                      <p className="text-[9px] text-emerald-500 mt-0.5">{log.records_inserted || 0} novos · {log.records_updated || 0} atualizados</p>
                                    </div>
                                    <div className={`rounded-lg border p-3 shadow-sm ${
                                      totalIgnored > 0 ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-200'
                                    }`}>
                                      <p className={`text-[9px] font-bold uppercase tracking-wider ${
                                        totalIgnored > 0 ? 'text-amber-600' : 'text-slate-400'
                                      }`}>Ignorados / Filtrados</p>
                                      <p className={`font-bold text-lg mt-0.5 ${
                                        totalIgnored > 0 ? 'text-amber-700' : 'text-slate-300'
                                      }`}>{totalIgnored}</p>
                                      {totalIgnored > 0 && (
                                        <p className="text-[9px] text-amber-500 mt-0.5">
                                          de {log.records_read} linhas lidas ({Math.round((totalIgnored / log.records_read) * 100)}%)
                                        </p>
                                      )}
                                    </div>
                                  </div>

                                  {/* Barra de progresso de importação */}
                                  {log.records_read > 0 && (
                                    <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-sm space-y-2">
                                      <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Aproveitamento da Carga</p>
                                      <div className="flex gap-0.5 rounded-full overflow-hidden h-2.5 bg-slate-100">
                                        <div
                                          className="bg-emerald-500 h-full transition-all"
                                          style={{ width: `${Math.round((totalImported / log.records_read) * 100)}%` }}
                                        />
                                        <div
                                          className="bg-amber-400 h-full transition-all"
                                          style={{ width: `${Math.round((totalIgnored / log.records_read) * 100)}%` }}
                                        />
                                      </div>
                                      <div className="flex gap-4 text-[9px] font-semibold">
                                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> Importados ({Math.round((totalImported / log.records_read) * 100)}%)</span>
                                        {totalIgnored > 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" /> Ignorados ({Math.round((totalIgnored / log.records_read) * 100)}%)</span>}
                                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-200 inline-block" /> Restante</span>
                                      </div>
                                    </div>
                                  )}

                                  {/* Itens ignorados */}
                                  {log.ignored_rows && log.ignored_rows.length > 0 && (() => {
                                    const byReason = log.ignored_rows.reduce((acc: Record<string, any[]>, row: any) => {
                                      const key = row.reason || 'Outros';
                                      if (!acc[key]) acc[key] = [];
                                      acc[key].push(row);
                                      return acc;
                                    }, {});
                                    return (
                                      <div className="bg-white border border-amber-200 rounded-lg shadow-sm overflow-hidden">
                                        <div className="bg-amber-50 px-3 py-2 flex items-center justify-between border-b border-amber-200">
                                          <p className="font-bold text-amber-800 text-[10px] uppercase tracking-wider flex items-center gap-1.5">
                                            <FileX className="h-3.5 w-3.5" /> Linhas Não Importadas ({log.ignored_rows.length})
                                          </p>
                                          <button
                                            onClick={() => {
                                              const lines = log.ignored_rows.map((r: any) => `Linha ${r.row}\tRI: ${r.identifier}\t${r.reason}`);
                                              const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
                                              const url = URL.createObjectURL(blob);
                                              const a = document.createElement('a');
                                              a.href = url;
                                              a.download = `ignorados_${log.id}.txt`;
                                              a.click();
                                            }}
                                            className="flex items-center gap-1 text-[9px] font-bold text-amber-700 hover:text-amber-900 cursor-pointer"
                                          >
                                            <Download className="h-3 w-3" /> Exportar
                                          </button>
                                        </div>
                                        <div className="divide-y divide-slate-100 max-h-48 overflow-y-auto">
                                          {Object.entries(byReason).map(([reason, rows]: [string, any]) => (
                                            <div key={reason} className="p-3 space-y-1.5">
                                              <p className="text-[9px] font-bold text-amber-700 uppercase tracking-wider flex items-center gap-1">
                                                <AlertTriangle className="h-3 w-3" /> {reason} ({rows.length}x)
                                              </p>
                                              <div className="flex flex-wrap gap-1.5">
                                                {rows.map((r: any, i: number) => (
                                                  <span key={i} className="inline-flex items-center gap-1 bg-slate-100 text-slate-600 rounded px-1.5 py-0.5 font-mono text-[9px]">
                                                    L{r.row} · {r.identifier}
                                                  </span>
                                                ))}
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    );
                                  })()}

                                  {/* Alterações de Quantidade */}
                                  {log.quantity_changes && log.quantity_changes.length > 0 && (
                                    <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
                                      <div className="bg-slate-50 px-3 py-2 border-b border-slate-200">
                                        <p className="font-bold text-slate-700 text-[10px] uppercase tracking-wider flex items-center gap-1.5">
                                          <Activity className="h-3.5 w-3.5 text-indigo-500" /> Alterações de Quantidade ({log.quantity_changes.length})
                                        </p>
                                      </div>
                                      <div className="divide-y divide-slate-100 max-h-40 overflow-y-auto">
                                        {log.quantity_changes.map((qc: any, idx: number) => {
                                          const increased = (qc.newQty || 0) > (qc.oldQty || 0);
                                          return (
                                            <div key={idx} className="py-2 px-3 flex items-center justify-between font-mono text-[10px]">
                                              <span className="text-slate-500 font-medium">{qc.item} <span className="text-slate-400 text-[9px]">RI: {qc.ri}</span></span>
                                              <span className={`flex items-center gap-1 font-bold ${
                                                increased ? 'text-emerald-600' : 'text-red-500'
                                              }`}>
                                                {increased ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                                                {qc.oldQty} → {qc.newQty}
                                              </span>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  )}

                                  {/* RIs ausentes nessa carga */}
                                  {log.missing_ris && log.missing_ris.length > 0 && (
                                    <div className="bg-white border border-red-200 rounded-lg shadow-sm overflow-hidden">
                                      <div className="bg-red-50 px-3 py-2 flex items-center justify-between border-b border-red-200">
                                        <p className="font-bold text-red-700 text-[10px] uppercase tracking-wider flex items-center gap-1.5">
                                          <XCircle className="h-3.5 w-3.5" /> RIs Ausentes nesta Carga ({log.missing_ris.length})
                                        </p>
                                        <button
                                          onClick={() => {
                                            const blob = new Blob([log.missing_ris.join('\n')], { type: 'text/plain' });
                                            const url = URL.createObjectURL(blob);
                                            const a = document.createElement('a');
                                            a.href = url;
                                            a.download = `ris_ausentes_${log.id}.txt`;
                                            a.click();
                                          }}
                                          className="flex items-center gap-1 text-[9px] font-bold text-red-600 hover:text-red-800 cursor-pointer"
                                        >
                                          <Download className="h-3 w-3" /> Exportar
                                        </button>
                                      </div>
                                      <div className="p-3">
                                        <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                                          {log.missing_ris.map((ri: string, i: number) => (
                                            <span key={i} className="inline-block bg-red-50 text-red-600 border border-red-200 rounded px-1.5 py-0.5 font-mono text-[9px]">{ri}</span>
                                          ))}
                                        </div>
                                      </div>
                                    </div>
                                  )}

                                  {/* Colunas com divergência */}
                                  {(log.columns_missing?.length > 0 || log.columns_new?.length > 0) && (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                      {log.columns_missing?.length > 0 && (
                                        <div className="bg-amber-50/60 border border-amber-200 p-3 rounded-lg space-y-1.5">
                                          <p className="font-bold text-amber-800 text-[10px] uppercase tracking-wider flex items-center gap-1">
                                            <AlertTriangle className="h-3.5 w-3.5 text-amber-600" /> Colunas Esperadas Ausentes ({log.columns_missing.length})
                                          </p>
                                          <div className="flex flex-wrap gap-1">
                                            {log.columns_missing.map((c: string) => (
                                              <span key={c} className="inline-block bg-amber-100 text-amber-700 border border-amber-300 rounded px-1.5 py-0.5 text-[9px] font-mono font-semibold">{c}</span>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                      {log.columns_new?.length > 0 && (
                                        <div className="bg-blue-50/60 border border-blue-200 p-3 rounded-lg space-y-1.5">
                                          <p className="font-bold text-blue-800 text-[10px] uppercase tracking-wider flex items-center gap-1">
                                            <RefreshCw className="h-3.5 w-3.5 text-blue-600" /> Colunas Novas Detectadas ({log.columns_new.length})
                                          </p>
                                          <div className="flex flex-wrap gap-1">
                                            {log.columns_new.map((c: string) => (
                                              <span key={c} className="inline-block bg-blue-100 text-blue-700 border border-blue-300 rounded px-1.5 py-0.5 text-[9px] font-mono font-semibold">{c}</span>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  )}

                                  {/* Nenhum problema */}
                                  {!hasIssues && !log.quantity_changes?.length && !log.missing_ris?.length && (
                                    <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                                      <CheckCircle2 className="h-4 w-4 shrink-0" />
                                      <span className="text-xs font-semibold">Carga importada com sucesso. Nenhum problema ou divergência detectado.</span>
                                    </div>
                                  )}

                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 7: Grupos Comprador */}
      {activeTab === 'grupos_comprador' && (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
              <Users className="h-5 w-5 text-blue-600" /> Associação de Compradores aos Grupos SAP
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Associe os compradores do time de Suprimentos aos códigos de grupos de compras oficiais do SAP (ex: 314, 358).
              Isso direciona automaticamente as requisições e simplifica a filtragem de demandas operacionais no painel e nos dashboards.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start pt-2">
              
              {/* Left Column: Buyers List */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Lista de Compradores Cadastrados</h4>
                <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white overflow-hidden">
                  {profiles.filter(p => p.roles.includes('comprador')).length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-400">Nenhum comprador cadastrado no sistema.</div>
                  ) : (
                    profiles.filter(p => p.roles.includes('comprador')).map((buyer) => {
                      const buyerGroups = localDb.getStorageItem<any[]>('sisten_buyer_groups', [])
                        .filter(bg => bg.user_id === buyer.id);
                      
                      return (
                        <div 
                          key={buyer.id}
                          onClick={() => {
                            setSelectedBuyerId(buyer.id);
                            const grps = buyerGroups.map(bg => bg.group_code).join(', ');
                            setBuyerGroupsInput(grps);
                            const primary = buyerGroups.find(bg => bg.is_primary)?.group_code || '';
                            setBuyerPrimaryGroup(primary);
                          }}
                          className={`p-3.5 flex items-center justify-between cursor-pointer hover:bg-slate-50/60 transition-colors ${selectedBuyerId === buyer.id ? 'bg-blue-50/30 font-bold border-l-4 border-blue-600' : ''}`}
                        >
                          <div>
                            <p className="text-xs font-bold text-slate-800">{buyer.name}</p>
                            <p className="text-[10px] text-slate-400 mt-0.5">{buyer.email}</p>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <span className="text-[9px] font-bold bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded-full text-slate-600">
                              {buyerGroups.length} grupos
                            </span>
                            {buyerGroups.find(bg => bg.is_primary) && (
                              <span className="text-[9px] font-bold text-blue-600">
                                Principal: {buyerGroups.find(bg => bg.is_primary)?.group_code}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Right Column: Groups Association Form */}
              <div>
                {selectedBuyerId ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-5 space-y-4">
                    <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1">
                      Editar Grupos de {profiles.find(u => u.id === selectedBuyerId)?.name}
                    </h4>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Grupos de Compra Relacionados</label>
                      <input
                        type="text"
                        value={buyerGroupsInput}
                        onChange={(e) => setBuyerGroupsInput(e.target.value)}
                        placeholder="Ex: 314, 358, 447"
                        className="w-full rounded border border-slate-200 p-2.5 bg-white text-xs focus:outline-none focus:border-blue-500 font-mono"
                      />
                      <p className="text-[9px] text-slate-400">Separe os códigos por vírgula.</p>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Grupo Principal (Primary)</label>
                      <input
                        type="text"
                        value={buyerPrimaryGroup}
                        onChange={(e) => setBuyerPrimaryGroup(e.target.value)}
                        placeholder="Ex: 314"
                        className="w-full rounded border border-slate-200 p-2.5 bg-white text-xs focus:outline-none focus:border-blue-500 font-mono"
                      />
                      <p className="text-[9px] text-slate-400">Deve ser um dos códigos listados no campo superior.</p>
                    </div>

                    <button
                      onClick={() => {
                        const list = buyerGroupsInput.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
                        if (buyerPrimaryGroup && !list.includes(buyerPrimaryGroup.trim().toUpperCase())) {
                          alert('O grupo principal deve estar presente na lista de grupos.');
                          return;
                        }
                        localDb.updateBuyerGroups(selectedBuyerId, list, buyerPrimaryGroup.trim().toUpperCase());
                        loadData();
                        setSelectedBuyerId(null);
                      }}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs py-2 px-4 rounded cursor-pointer transition-colors flex items-center justify-center gap-1.5"
                    >
                      <Save className="h-4 w-4" /> Salvar Associação SAP
                    </button>
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-slate-400 space-y-1.5 bg-slate-50/20">
                    <Users className="h-6 w-6 mx-auto text-slate-300" />
                    <p className="text-xs font-semibold">Nenhum Comprador Selecionado</p>
                    <p className="text-[11px] text-slate-400">Selecione um comprador à esquerda para associar ou alterar os privilégios de grupos SAP.</p>
                  </div>
                )}
              </div>

            </div>
          </div>
        </div>
      )}

      {/* Tab 8: Helpdesk Config */}
      {activeTab === 'helpdesk_config' && (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
              <RefreshCw className="h-5 w-5 text-indigo-600" /> Matriz de SLAs & Categorias por Setor
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Gerencie quais setores da companhia estão autorizados a receber chamados de helpdesk, gerencie as categorias disponíveis para triagem dos solicitantes e configure a matriz de conformidade SLA.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start pt-2">
              {/* Left Column: List of Sectors and toggles */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Setores com Helpdesk Ativo</h4>
                
                <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white overflow-hidden text-xs">
                  {sectors.map((sec) => (
                    <div 
                      key={sec.id}
                      onClick={() => {
                        if (sec.helpdesk_enabled) {
                          setSelectedHelpdeskSectorId(sec.id);
                        } else {
                          setSelectedHelpdeskSectorId(null);
                        }
                      }}
                      className={`p-3.5 flex items-center justify-between cursor-pointer hover:bg-slate-50/60 transition-colors ${selectedHelpdeskSectorId === sec.id ? 'bg-indigo-50/20 border-l-4 border-indigo-600 font-semibold' : ''}`}
                    >
                      <div>
                        <p className="font-bold text-slate-800">{sec.name}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">ID Setor: {sec.id}</p>
                      </div>

                      <div className="flex items-center gap-3">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleSectorHelpdesk(sec.id);
                            if (selectedHelpdeskSectorId === sec.id) setSelectedHelpdeskSectorId(null);
                          }}
                          className={`px-3 py-1.5 rounded-md font-bold text-[10px] cursor-pointer transition-colors ${sec.helpdesk_enabled ? 'bg-indigo-100 text-indigo-800 hover:bg-indigo-200' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                        >
                          {sec.helpdesk_enabled ? '✓ Ativo' : 'Inativo'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right Column: Categories CRUD & SLAs matrix display */}
              <div>
                {selectedHelpdeskSectorId ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-5 space-y-5 text-xs">
                    <div>
                      <h4 className="font-bold text-slate-800 text-sm">
                        Configurações de {sectors.find(s => s.id === selectedHelpdeskSectorId)?.name}
                      </h4>
                      <p className="text-[10px] text-slate-400 mt-0.5">Visualize a matriz de conformidade SLA padrão para atendimento.</p>
                    </div>

                    {/* Matrix SLA list */}
                    <div className="space-y-2">
                      <p className="text-[10px] font-bold text-slate-500 uppercase">Matriz de Resolução de SLA (Padrão do Sistema)</p>
                      <div className="space-y-1.5">
                        <div className="flex justify-between p-1.5 bg-white border border-slate-150 rounded text-[11px] font-bold">
                          <span className="text-slate-500">Criticidade 5 (Impeditiva)</span>
                          <span className="text-red-600 font-extrabold">2 Horas</span>
                        </div>
                        <div className="flex justify-between p-1.5 bg-white border border-slate-150 rounded text-[11px] font-bold">
                          <span className="text-slate-500">Criticidade 4 (Crítica)</span>
                          <span className="text-orange-600 font-extrabold">8 Horas</span>
                        </div>
                        <div className="flex justify-between p-1.5 bg-white border border-slate-150 rounded text-[11px] font-bold">
                          <span className="text-slate-500">Criticidade 3 (Urgente)</span>
                          <span className="text-amber-600 font-extrabold">24 Horas (1 Dia)</span>
                        </div>
                        <div className="flex justify-between p-1.5 bg-white border border-slate-150 rounded text-[11px] font-bold">
                          <span className="text-slate-500">Criticidade 2 (Moderada)</span>
                          <span className="text-emerald-600 font-extrabold">72 Horas (3 Dias)</span>
                        </div>
                        <div className="flex justify-between p-1.5 bg-white border border-slate-150 rounded text-[11px] font-bold">
                          <span className="text-slate-500">Criticidade 1 (Baixa)</span>
                          <span className="text-slate-600 font-extrabold">120 Horas (5 Dias)</span>
                        </div>
                      </div>
                    </div>

                    {/* Categories of helpdesk */}
                    <div className="space-y-2 pt-1">
                      <p className="text-[10px] font-bold text-slate-500 uppercase">Categorias de Triagem de Chamado</p>
                      <div className="flex flex-wrap gap-1.5">
                        {/* Render based on what is in NewRequest.tsx */}
                        {selectedHelpdeskSectorId === '9' ? (
                          ['Acesso/Senha', 'Equipamento', 'Software', 'Rede', 'E-mail', 'Outro'].map((cat, idx) => (
                            <span key={idx} className="bg-white border border-slate-200 px-2.5 py-1 rounded font-bold text-slate-700 text-[11px]">
                              {cat}
                            </span>
                          ))
                        ) : selectedHelpdeskSectorId === '3' ? (
                          ['Elétrica', 'Hidráulica', 'Climatização', 'Mobiliário', 'Limpeza', 'Chaves/Acesso', 'Outro'].map((cat, idx) => (
                            <span key={idx} className="bg-white border border-slate-200 px-2.5 py-1 rounded font-bold text-slate-700 text-[11px]">
                              {cat}
                            </span>
                          ))
                        ) : (
                          ['Elétrica', 'Hidráulica', 'Climatização', 'Equipamento', 'Outro'].map((cat, idx) => (
                            <span key={idx} className="bg-white border border-slate-200 px-2.5 py-1 rounded font-bold text-slate-700 text-[11px]">
                              {cat}
                            </span>
                          ))
                        )}
                      </div>
                      <p className="text-[9px] text-slate-400 mt-1 italic">Nota: As categorias de triagem integradas são mapeadas em conformidade com as regras operacionais do setor.</p>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-slate-400 space-y-1.5 bg-slate-50/20">
                    <RefreshCw className="h-6 w-6 mx-auto text-slate-300" />
                    <p className="text-xs font-semibold">Nenhum Setor Selecionado</p>
                    <p className="text-[11px] text-slate-400">Selecione um setor ativo de Helpdesk à esquerda para inspecionar categorias de triagem e tempos de conformidade SLA.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
