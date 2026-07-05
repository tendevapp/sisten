/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Users, Map, Shield, Upload, Check, X, AlertTriangle, 
  Trash, Save, Activity, RefreshCw, FileText, FileSpreadsheet, Plus 
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { localDb } from '../db/localDb';
import { Profile, Sector } from '../types';

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

  // Sectors State
  const [sectors, setSectors] = useState<Sector[]>([]);

  // Materials CSV Importer
  const [csvContent, setCsvContent] = useState('');
  const [importPreview, setImportPreview] = useState<any[]>([]);
  const [importStatus, setImportStatus] = useState<'idle' | 'parsed' | 'saving' | 'success' | 'error'>('idle');
  const [importError, setImportError] = useState('');

  // SAP ME5A/ZL0132 upload simulation states
  const [sapLogPreview, setSapLogPreview] = useState<any[]>([]);
  const [sapLogs, setSapLogs] = useState<any[]>([]);
  const [sapLogStatus, setSapLogStatus] = useState<'idle' | 'parsed' | 'saving' | 'success' | 'error'>('idle');
  const [sapLogError, setSapLogError] = useState('');
  const [currentSapUploadType, setCurrentSapUploadType] = useState<'ME5A' | 'ZL0132'>('ME5A');
  const [sapCsvText, setSapCsvText] = useState('');

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

  const handleToggleSectorSupport = (id: string) => {
    localDb.toggleSectorSupport(id);
    loadData();
  };

  const handleToggleSectorHelpdesk = (id: string) => {
    localDb.toggleSectorHelpdesk(id);
    loadData();
  };

  // CSV Parsing simulation for bulk import
  const handleCSVDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleCSVDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files?.length) {
      const file = e.dataTransfer.files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        parseCSV(text);
      };
      reader.readAsText(file);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        parseCSV(text);
      };
      reader.readAsText(file);
    }
  };

  const parseCSV = (text: string) => {
    setImportError('');
    try {
      const lines = text.split('\n').filter(l => l.trim());
      if (lines.length < 2) {
        setImportError('Arquivo CSV vazio ou sem cabeçalhos.');
        setImportStatus('error');
        return;
      }

      const parsed: any[] = [];
      // Simple CSV parser
      const headers = lines[0].split(';').map(h => h.trim().replace(/"/g, ''));
      
      // Expected headers: Código SAP; Descrição; Texto Técnico; Categoria; Empresa; Unidade
      for (let i = 1; i < Math.min(lines.length, 10); i++) {
        const cols = lines[i].split(';').map(c => c.trim().replace(/"/g, ''));
        if (cols.length >= 4) {
          parsed.push({
            code: cols[0],
            description: cols[1],
            technical_text: cols[2] || '',
            category: cols[3] || 'OUTROS',
            company: cols[4] || 'TEN2',
            unit: cols[5] || 'UN'
          });
        }
      }

      setImportPreview(parsed);
      setCsvContent(text);
      setImportStatus('parsed');
    } catch (err) {
      setImportError('Falha ao processar o formato do arquivo CSV. Verifique o delimitador (;).');
      setImportStatus('error');
    }
  };

  const handleBulkImport = () => {
    setImportStatus('saving');
    setTimeout(() => {
      // Upsert mock items based on csv content
      try {
        const lines = csvContent.split('\n').filter(l => l.trim());
        const importedItems: any[] = [];
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(';').map(c => c.trim().replace(/"/g, ''));
          if (cols.length >= 4) {
            importedItems.push({
              material_code: cols[0],
              description: cols[1],
              technical_text: cols[2] || '',
              category: cols[3] || 'OUTROS',
              company: cols[4] || 'TEN2',
              unit: cols[5] || 'UN'
            });
          }
        }

        localDb.bulkUpsertMaterials(importedItems);
        setImportStatus('success');
        setImportPreview([]);
        setCsvContent('');
      } catch (err) {
        setImportError('Erro ao realizar salvamento no banco de dados local.');
        setImportStatus('error');
      }
    }, 1200);
  };

  const pendingUsers = profiles.filter(p => p.status === 'pendente');
  const activeUsers = profiles.filter(p => p.status === 'ativo');

  const getRoleLabel = (role: string) => {
    const labels: Record<string, string> = {
      admin: 'Administrador',
      visualizador: 'Visualizador',
      solicitante: 'Solicitante',
      gestor: 'Gestor',
      comprador: 'Comprador',
      coordenador_suprimentos: 'Coordenador',
      atendente: 'Atendente Suporte'
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
              Importar ME5A/ZL0132
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
            <h3 className="text-sm font-bold text-slate-800">Perfis Ativos ({activeUsers.length})</h3>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider">
                    <th className="py-2.5">Nome</th>
                    <th className="py-2.5">E-mail</th>
                    <th className="py-2.5">Cargo / Setor</th>
                    <th className="py-2.5">Nível de Acesso (Role)</th>
                    <th className="py-2.5 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {activeUsers.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50/50">
                      <td className="py-3 font-semibold text-slate-800">{p.name}</td>
                      <td className="py-3 text-slate-500">{p.email}</td>
                      <td className="py-3 text-slate-600 font-medium">{p.cargo} • Setor {p.sector_id}</td>
                      <td className="py-3">
                        {selectedProfileId === p.id ? (
                          <div className="flex items-center space-x-1.5" onClick={(e) => e.stopPropagation()}>
                            <select
                              value={editingRole}
                              onChange={(e) => setEditingRole(e.target.value)}
                              className="rounded border border-slate-200 py-1 px-2 text-xs focus:outline-none focus:border-emerald-600 cursor-pointer bg-white"
                            >
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

      {/* Tab 4: Materials bulk CSV parser */}
      {activeTab === 'importar' && (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-800">Importação de Materiais SAP</h3>
            <p className="text-xs text-slate-500">Realize carga consolidada de materiais a partir de planilha exportada do SAP.</p>

            <div 
              onDragOver={handleCSVDragOver}
              onDrop={handleCSVDrop}
              className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center hover:bg-slate-50/50 transition-colors cursor-pointer relative"
            >
              <input
                type="file"
                accept=".csv"
                onChange={handleFileSelect}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
              />
              <FileSpreadsheet className="mx-auto h-10 w-10 text-gray-400" />
              <p className="mt-2 text-xs font-semibold text-slate-700">Solte seu arquivo CSV de materiais aqui, ou clique para buscar</p>
              <p className="mt-1 text-[10px] text-slate-400">Delimitador por ponto e vírgula (;). Máx 10 MB.</p>
            </div>

            {importError && (
              <div className="rounded-lg bg-red-50 p-3 text-xs font-semibold text-red-600 border border-red-100 flex items-center">
                <AlertTriangle className="mr-2 h-4.5 w-4.5 shrink-0 text-red-500" />
                <span>{importError}</span>
              </div>
            )}

            {importStatus === 'success' && (
              <div className="rounded-lg bg-emerald-50 p-3 text-xs font-semibold text-emerald-800 border border-emerald-100 flex items-center">
                <Check className="mr-2 h-4.5 w-4.5 shrink-0 text-emerald-600 font-black" />
                <span>Importação realizada com sucesso! Os novos itens estão disponíveis para busca no catálogo.</span>
              </div>
            )}
          </div>

          {/* Import preview panel if parsed */}
          {importStatus === 'parsed' && importPreview.length > 0 && (
            <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Pré-visualização da Importação (Amostra dos 10 primeiros itens)</h4>
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
                      <th className="py-2 px-3 text-center">Un.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {importPreview.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50">
                        <td className="py-2 px-3 font-mono text-emerald-800 font-bold">{item.code}</td>
                        <td className="py-2 px-3 font-semibold text-slate-800">{item.description}</td>
                        <td className="py-2 px-3 font-medium text-slate-600">{item.category}</td>
                        <td className="py-2 px-3 text-center font-bold text-slate-500">{item.unit}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 5: Importar SAP (ME5A & ZL0132) */}
      {activeTab === 'importar_sap' && (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-emerald-700" /> Carga de Dados Operacionais (ME5A & ZL0132)
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              O sistema sincroniza a fila de solicitações e ordens de compra cruzando a carga das requisições abertas (transação ME5A do SAP) com as ordens de compra emitidas (transação ZL0132 do SAP). 
              Você pode carregar arquivos no formato CSV ou simular cargas integradas instantaneamente usando dados demonstrativos homologados.
            </p>

            {/* Quick Demo Simulator Buttons */}
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-150 space-y-3.5">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1">
                <RefreshCw className="h-4 w-4 text-emerald-600 shrink-0" /> Simulador de Cargas Integradas do SAP
              </h4>
              <p className="text-[11px] text-slate-500">
                Pressione os botões abaixo para preencher o banco de dados local com registros válidos de requisições e pedidos de compra e testar a sincronização automática de alertas e SLAs.
              </p>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => {
                    setSapLogStatus('saving');
                    setTimeout(() => {
                      try {
                        const demoME5A = [
                          { requisicao_de_compra: '1000000123', item_reqc: '00010', material_code: '10000123', texto_breve: 'Cabo de Cobre Flexível 4mm', qtd_requisicao: 150, unidade_medida: 'M', grupo_comprador: 'G001', data_solicitacao: new Date(Date.now() - 4 * 24 * 3600 * 1000).toISOString().split('T')[0], tipo_documento: 'ZR01', requisitante_name: 'Guilherme Silva' },
                          { requisicao_de_compra: '1000000123', item_reqc: '00020', material_code: '10000456', texto_breve: 'Disjuntor Termomagnético 50A', qtd_requisicao: 12, unidade_medida: 'UN', grupo_comprador: 'G001', data_solicitacao: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString().split('T')[0], tipo_documento: 'ZR02', requisitante_name: 'Guilherme Silva' },
                          { requisicao_de_compra: '1000000124', item_reqc: '00010', material_code: '10000789', texto_breve: 'Placa de Aço Laminado 2000x1000x10mm', qtd_requisicao: 5, unidade_medida: 'UN', grupo_comprador: 'G002', data_solicitacao: new Date(Date.now() - 1 * 24 * 3600 * 1000).toISOString().split('T')[0], tipo_documento: 'ZR03', requisitante_name: 'Roberto Souza' }
                        ];
                        const log = localDb.importME5A(demoME5A, 'sap_export_me5a_simulado.xlsx');
                        setSapLogStatus('success');
                        setSapLogError('');
                        loadData();
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
                    setTimeout(() => {
                      try {
                        const demoZL0132 = [
                          { requisicao_de_compra: '1000000123', item_reqc: '00010', documento_compra: '4500123456', item_pedido: '00010', fornecedor_code: 'F900213', fornecedor_name: 'Metalúrgica Gerdau S.A.', data_pedido: new Date().toISOString().split('T')[0], data_entrega_sap: new Date(Date.now() + 10 * 24 * 3600 * 1000).toISOString().split('T')[0] }
                        ];
                        const log = localDb.importZL0132(demoZL0132, 'sap_export_zl0132_simulado.xlsx');
                        setSapLogStatus('success');
                        setSapLogError('');
                        loadData();
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
              </div>
            </div>

            {/* Custom file parser */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-1">
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
                        setSapLogError('');
                        const r = new FileReader();
                        
                        r.onload = (ev) => {
                          try {
                            let objList: any[] = [];
                            if (fileExtension === 'csv') {
                              const text = ev.target?.result as string;
                              const rows = text.split('\n').filter(l => l.trim()).map(l => {
                                const cols = l.split(';').map(c => c.replace(/"/g, '').trim());
                                return cols;
                              });
                              if (rows.length < 2) throw new Error('Cabeçalhos não encontrados.');
                              const headers = rows[0];
                              objList = rows.slice(1).map(row => {
                                const o: any = {};
                                headers.forEach((h, idx) => { o[h] = row[idx]; });
                                return o;
                              });
                            } else {
                              const data = new Uint8Array(ev.target?.result as ArrayBuffer);
                              const workbook = XLSX.read(data, { type: 'array' });
                              if (!workbook.SheetNames.length) throw new Error('Nenhuma planilha encontrada no arquivo.');
                              const sheetName = workbook.SheetNames[0];
                              const worksheet = workbook.Sheets[sheetName];
                              objList = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
                            }
                            
                            localDb.importME5A(objList, file.name);
                            setSapLogStatus('success');
                            loadData();
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
                        setSapLogError('');
                        const r = new FileReader();
                        
                        r.onload = (ev) => {
                          try {
                            let objList: any[] = [];
                            if (fileExtension === 'csv') {
                              const text = ev.target?.result as string;
                              const rows = text.split('\n').filter(l => l.trim()).map(l => {
                                const cols = l.split(';').map(c => c.replace(/"/g, '').trim());
                                return cols;
                              });
                              if (rows.length < 2) throw new Error('Cabeçalhos não encontrados.');
                              const headers = rows[0];
                              objList = rows.slice(1).map(row => {
                                const o: any = {};
                                headers.forEach((h, idx) => { o[h] = row[idx]; });
                                return o;
                              });
                            } else {
                              const data = new Uint8Array(ev.target?.result as ArrayBuffer);
                              const workbook = XLSX.read(data, { type: 'array' });
                              if (!workbook.SheetNames.length) throw new Error('Nenhuma planilha encontrada no arquivo.');
                              const sheetName = workbook.SheetNames[0];
                              const worksheet = workbook.Sheets[sheetName];
                              objList = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
                            }
                            
                            localDb.importZL0132(objList, file.name);
                            setSapLogStatus('success');
                            loadData();
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
            </div>

            {sapLogStatus === 'saving' && (
              <div className="flex items-center gap-2 text-xs font-bold text-slate-500 py-2">
                <RefreshCw className="h-4 w-4 animate-spin text-emerald-600" /> Processando carga do SAP e recalculando metas de entrega...
              </div>
            )}

            {sapLogError && (
              <div className="rounded-lg bg-red-50 p-3 text-xs font-semibold text-red-600 border border-red-100 flex items-center">
                <AlertTriangle className="mr-1.5 h-4 w-4 text-red-500 shrink-0" />
                <span>{sapLogError}</span>
              </div>
            )}

            {sapLogStatus === 'success' && (
              <div className="rounded-lg bg-emerald-50 p-3 text-xs font-semibold text-emerald-800 border border-emerald-100 flex items-center">
                <Check className="mr-1.5 h-4 w-4 text-emerald-600 shrink-0 font-black" />
                <span>Carga importada e integrada com sucesso! Todos os prazos e SLAs foram recalculados automaticamente.</span>
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
              <p className="text-xs text-slate-500">Histórico de importações tolerantes a schema ME5A e ZL0132 realizadas por compradores e administradores.</p>
            </div>
            <button
              onClick={loadData}
              className="p-1.5 border border-slate-200 hover:bg-slate-100 text-slate-600 rounded cursor-pointer"
              title="Atualizar Logs"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider">
                    <th className="py-2.5 px-4">ID Carga</th>
                    <th className="py-2.5 px-4">Tipo</th>
                    <th className="py-2.5 px-4">Nome do Arquivo</th>
                    <th className="py-2.5 px-4 text-center">Registros Lidos</th>
                    <th className="py-2.5 px-4 text-center">Novos</th>
                    <th className="py-2.5 px-4 text-center">Atualizados</th>
                    <th className="py-2.5 px-4 text-center">Removidos / Inativos</th>
                    <th className="py-2.5 px-4">Feito por</th>
                    <th className="py-2.5 px-4">Importado em</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-600">
                  {sapLogs.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-slate-400 font-medium">
                        Nenhum registro de carga encontrado.
                      </td>
                    </tr>
                  ) : (
                    sapLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50/50">
                        <td className="py-2.5 px-4 font-mono font-bold text-slate-700">#{log.id.slice(-6).toUpperCase()}</td>
                        <td className="py-2.5 px-4 font-bold">
                          <span className={`px-2 py-0.5 rounded text-[10px] ${log.type === 'ME5A' ? 'bg-emerald-50 border border-emerald-150 text-emerald-700' : 'bg-blue-50 border border-blue-150 text-blue-700'}`}>
                            {log.type}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 font-semibold text-slate-700">{log.filename}</td>
                        <td className="py-2.5 px-4 text-center font-bold text-slate-800">{log.records_read}</td>
                        <td className="py-2.5 px-4 text-center font-bold text-emerald-700">{log.records_inserted}</td>
                        <td className="py-2.5 px-4 text-center font-bold text-slate-500">{log.records_updated}</td>
                        <td className="py-2.5 px-4 text-center font-bold text-red-600">{log.records_eliminated}</td>
                        <td className="py-2.5 px-4 font-medium">{log.user_name}</td>
                        <td className="py-2.5 px-4 text-slate-400">{new Date(log.created_at).toLocaleString('pt-BR')}</td>
                      </tr>
                    ))
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
              Associe os compradores do time de Suprimentos aos códigos de grupos de compras oficiais do SAP (ex: G001, G002).
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
                        placeholder="Ex: G001, G002, G003"
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
                        placeholder="Ex: G001"
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
                        <p className="text-[10px] text-slate-400 mt-0.5">ID Setor: {sec.id} | Código: {sec.code}</p>
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
