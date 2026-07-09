/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  Truck, Search, FileSpreadsheet, AlertCircle, ChevronDown, ChevronRight, 
  Phone, Mail, Tag, Calendar, User, MapPin, Hash, AlertTriangle, RefreshCw
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase } from '../db/supabaseClient';
import { localDb } from '../db/localDb';
import { Profile, PedidoForn, ContatoFornecedor, FornecedorMaterialRow, MaterialFornecedoresGroup } from '../types';

interface SuppliersLookupProps {
  user: Profile;
  onNavigate: (path: string) => void;
}

export default function SuppliersLookup({ user, onNavigate }: SuppliersLookupProps) {
  const [inputCodes, setInputCodes] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<MaterialFornecedoresGroup[]>([]);
  const [searched, setSearched] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  const handleCleanAndSearch = async () => {
    if (!inputCodes.trim()) return;

    setLoading(true);
    setSearched(true);
    
    // 1. Parsear e deduplicar códigos de materiais mantendo a ordem de digitação
    const parsedCodes = Array.from(
      new Set(
        inputCodes
          .split(/[\s,;]+/)
          .map(code => code.trim())
          .filter(code => code.length > 0)
      )
    );

    if (parsedCodes.length === 0) {
      setResults([]);
      setLoading(false);
      return;
    }

    try {
      // 2. Buscar pedidos de fornecedores na tabela public.pedidosforn
      const { data: pedidosData, error: pedidosError } = await supabase
        .from('pedidosforn')
        .select('*')
        .in('material', parsedCodes);

      if (pedidosError) throw pedidosError;
      const pedidos: PedidoForn[] = pedidosData || [];

      // 3. Obter códigos de fornecedores únicos para buscar contatos em uma única consulta
      const codsFornUnicos = Array.from(
        new Set(
          pedidos
            .map(p => p.cod_forn)
            .filter((c): c is string => !!c)
        )
      );

      // 4. Buscar contatos e catalogos de materiais
      let contatos: ContatoFornecedor[] = [];
      if (codsFornUnicos.length > 0) {
        const { data: contatosData, error: contatosError } = await supabase
          .from('contatos')
          .select('*')
          .in('cod_vendor', codsFornUnicos);

        if (contatosError) throw contatosError;
        contatos = contatosData || [];
      }

      // Buscar Texto Técnico e Descrição no catálogo de materiais existente
      const { data: materialsData, error: materialsError } = await supabase
        .from('materials')
        .select('material_code,description,technical_text')
        .in('material_code', parsedCodes);

      const materialsMap = new Map<string, { description: string; technical_text?: string }>();
      if (!materialsError && materialsData) {
        materialsData.forEach(m => {
          materialsMap.set(m.material_code, {
            description: m.description,
            technical_text: m.technical_text
          });
        });
      }

      const contatosMap = new Map<string, ContatoFornecedor>();
      contatos.forEach(c => contatosMap.set(c.cod_vendor, c));

      // 5. Deduplicação e agrupamento por material
      const groups: MaterialFornecedoresGroup[] = parsedCodes.map(codigo => {
        const pedidosMaterial = pedidos.filter(p => p.material === codigo);
        const materialCatalog = materialsMap.get(codigo);

        if (pedidosMaterial.length === 0) {
          return {
            codigo,
            descricao: materialCatalog?.description || undefined,
            encontrado: false,
            fornecedores: []
          };
        }

        // Deduplicar fornecedores do material:
        // Chave de dedupe: cnpj se houver, caso contrário cod_forn.
        // Preserva o registro com data_pedido mais recente.
        const fornecedoresMap = new Map<string, PedidoForn>();
        pedidosMaterial.forEach(p => {
          const key = p.cnpj ? p.cnpj.trim() : (p.cod_forn || '');
          if (!key) return;

          const existing = fornecedoresMap.get(key);
          if (!existing) {
            fornecedoresMap.set(key, p);
          } else {
            // Comparação de datas para manter o mais recente
            const dateA = p.data_pedido ? new Date(p.data_pedido).getTime() : 0;
            const dateB = existing.data_pedido ? new Date(existing.data_pedido).getTime() : 0;
            if (dateA > dateB) {
              fornecedoresMap.set(key, p);
            }
          }
        });

        // Montar a lista de fornecedores enriquecida
        const fornecedoresList: FornecedorMaterialRow[] = Array.from(fornecedoresMap.values()).map(p => {
          const contato = p.cod_forn ? contatosMap.get(p.cod_forn) : undefined;
          return {
            cod_forn: p.cod_forn || '—',
            cnpj: p.cnpj || '—',
            fornecedor: p.fornecedor || contato?.fornecedor || '—',
            regiao_uf: p.regiao_uf || '—',
            telefone: contato?.telefone || '—',
            email: contato?.email || '—',
            classificacao: contato?.classificacao || '—',
            ultima_data: p.data_pedido || '—'
          };
        });

        // Ordenar por data mais recente no topo
        fornecedoresList.sort((a, b) => {
          const dateA = a.ultima_data !== '—' ? new Date(a.ultima_data).getTime() : 0;
          const dateB = b.ultima_data !== '—' ? new Date(b.ultima_data).getTime() : 0;
          return dateB - dateA;
        });

        // A descrição do material pode vir do catálogo ou da primeira linha do histórico
        const descricao = materialCatalog?.description || pedidosMaterial[0].txt_breve || undefined;

        return {
          codigo,
          descricao,
          encontrado: true,
          fornecedores: fornecedoresList
        };
      });

      setResults(groups);
      
      // Auto-expandir todos por padrão
      const autoExpand: Record<string, boolean> = {};
      groups.forEach(g => {
        autoExpand[g.codigo] = true;
      });
      setExpandedGroups(autoExpand);

    } catch (e: any) {
      console.error('Erro na consulta de fornecedores por material:', e);
      alert('Erro ao realizar a busca. Por favor, tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = (codigo: string) => {
    setExpandedGroups(prev => ({
      ...prev,
      [codigo]: !prev[codigo]
    }));
  };

  const handleExportExcel = async () => {
    if (results.length === 0) return;

    setLoading(true);
    try {
      // Buscar todos os textos técnicos do catálogo para a exportação
      const codigos = results.map(r => r.codigo);
      const { data: materialsData } = await supabase
        .from('materials')
        .select('material_code,technical_text')
        .in('material_code', codigos);

      const techTextMap = new Map<string, string>();
      if (materialsData) {
        materialsData.forEach(m => {
          if (m.technical_text) {
            techTextMap.set(m.material_code, m.technical_text);
          }
        });
      }

      const dataToExport: any[] = [];

      results.forEach(group => {
        const textTecnico = techTextMap.get(group.codigo) || '—';
        if (!group.encontrado || group.fornecedores.length === 0) {
          // Material não encontrado/sem histórico (Opção A: adiciona linha informativa)
          dataToExport.push({
            'Código do Material': group.codigo,
            'Descrição do Material': group.descricao || '—',
            'Texto Técnico': textTecnico,
            'Cód. Fornecedor': '—',
            'CNPJ': '—',
            'Fornecedor': 'Material sem histórico de fornecedores',
            'UF': '—',
            'Telefone': '—',
            'E-mail': '—',
            'Classificação': '—',
            'Última Compra': '—'
          });
        } else {
          group.fornecedores.forEach(f => {
            dataToExport.push({
              'Código do Material': group.codigo,
              'Descrição do Material': group.descricao || '—',
              'Texto Técnico': textTecnico,
              'Cód. Fornecedor': f.cod_forn,
              'CNPJ': f.cnpj,
              'Fornecedor': f.fornecedor,
              'UF': f.regiao_uf,
              'Telefone': f.telefone,
              'E-mail': f.email,
              'Classificação': f.classificacao,
              'Última Compra': f.ultima_data
            });
          });
        }
      });

      const ws = XLSX.utils.json_to_sheet(dataToExport);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Fornecedores por Material');

      // Formatar largura das colunas
      const wscols = [
        { wch: 18 }, // Código do Material
        { wch: 35 }, // Descrição do Material
        { wch: 30 }, // Texto Técnico
        { wch: 15 }, // Cód. Fornecedor
        { wch: 20 }, // CNPJ
        { wch: 35 }, // Fornecedor
        { wch: 8 },  // UF
        { wch: 18 }, // Telefone
        { wch: 25 }, // E-mail
        { wch: 20 }, // Classificação
        { wch: 15 }  // Última Compra
      ];
      ws['!cols'] = wscols;

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      XLSX.writeFile(wb, `consulta_fornecedores_${timestamp}.xlsx`);
    } catch (e) {
      console.error('Erro ao exportar planilha:', e);
      alert('Falha ao exportar arquivo do Excel.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Truck className="h-6 w-6 text-emerald-600 dark:text-emerald-500" />
            Consulta de Fornecedores por Material
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Cole uma lista de códigos de materiais SAP para listar fornecedores históricos e dados de contato associados.
          </p>
        </div>
        {results.length > 0 && (
          <button
            onClick={handleExportExcel}
            disabled={loading}
            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-bold transition-all shadow-sm cursor-pointer disabled:opacity-50"
          >
            <FileSpreadsheet className="h-4 w-4" /> Exportar para Excel
          </button>
        )}
      </div>

      {/* Input Area */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm space-y-4">
        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
          Lista de Códigos de Materiais SAP
        </label>
        <textarea
          rows={5}
          value={inputCodes}
          onChange={(e) => setInputCodes(e.target.value)}
          placeholder="Cole aqui os códigos de material separados por espaço, quebra de linha, vírgula ou ponto e vírgula (ex: 10000123, 10000456; 10000789)"
          className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3 text-sm text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 focus:outline-none transition-all font-mono"
        />
        <div className="flex justify-end gap-3">
          {searched && (
            <button
              onClick={() => {
                setInputCodes('');
                setResults([]);
                setSearched(false);
              }}
              className="px-4 py-2 border border-slate-200 dark:border-slate-850 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-lg text-xs font-semibold cursor-pointer transition-colors"
            >
              Limpar Busca
            </button>
          )}
          <button
            onClick={handleCleanAndSearch}
            disabled={loading || !inputCodes.trim()}
            className="flex items-center gap-1.5 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 text-white rounded-lg text-xs font-bold transition-all shadow-sm cursor-pointer disabled:cursor-not-allowed"
          >
            {loading ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Search className="h-3.5 w-3.5" />
            )}
            {loading ? 'Buscando...' : 'Buscar Fornecedores'}
          </button>
        </div>
      </div>

      {/* Loading Overlay */}
      {loading && results.length === 0 && (
        <div className="flex flex-col items-center justify-center p-12 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl space-y-3">
          <RefreshCw className="h-7 w-7 text-emerald-600 animate-spin" />
          <span className="text-xs font-bold text-slate-600 dark:text-slate-400">Consultando e enriquecendo base de fornecedores...</span>
        </div>
      )}

      {/* Results Listing */}
      {searched && !loading && results.length === 0 && (
        <div className="flex items-center gap-3 p-5 border border-amber-200 dark:border-amber-900 rounded-xl bg-amber-50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-300">
          <AlertCircle className="h-6 w-6 text-amber-500 shrink-0" />
          <div className="text-xs">
            <p className="font-bold">Nenhum código de material foi parseado.</p>
            <p className="mt-0.5 opacity-90">Verifique se colou códigos numéricos válidos na caixa de texto.</p>
          </div>
        </div>
      )}

      {results.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 px-1 font-semibold">
            <span>Resultados: {results.length} materiais analisados</span>
            <span>Clique nos cabeçalhos para colapsar/expandir</span>
          </div>

          <div className="space-y-3">
            {results.map((group) => {
              const isExpanded = !!expandedGroups[group.codigo];
              return (
                <div 
                  key={group.codigo}
                  className={`border rounded-xl shadow-sm overflow-hidden bg-white dark:bg-slate-900 transition-all ${
                    group.encontrado 
                      ? 'border-slate-200 dark:border-slate-800' 
                      : 'border-rose-250 dark:border-rose-950/50 bg-rose-50/5 dark:bg-rose-950/5'
                  }`}
                >
                  {/* Group Header */}
                  <div
                    onClick={() => toggleExpand(group.codigo)}
                    className={`p-4 flex items-center justify-between cursor-pointer select-none transition-colors ${
                      group.encontrado
                        ? 'hover:bg-slate-50 dark:hover:bg-slate-850/50'
                        : 'hover:bg-rose-50/30 dark:hover:bg-rose-950/10'
                    }`}
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className={`p-2 rounded-lg ${
                        group.encontrado
                          ? 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                          : 'bg-rose-100 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400'
                      }`}>
                        <Hash className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-sm text-slate-800 dark:text-slate-100">{group.codigo}</span>
                          {!group.encontrado && (
                            <span className="px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-950/50 text-[10px] font-bold text-rose-700 dark:text-rose-400 uppercase tracking-wide">
                              Sem Histórico
                            </span>
                          )}
                        </div>
                        <p className={`text-xs truncate mt-0.5 ${
                          group.encontrado 
                            ? 'text-slate-500 dark:text-slate-400' 
                            : 'text-rose-500 dark:text-rose-400 font-semibold'
                        }`}>
                          {group.encontrado 
                            ? (group.descricao || 'Descrição do material indisponível') 
                            : 'Código não encontrado nas planilhas de pedidos'
                          }
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4 ml-3">
                      {group.encontrado && (
                        <span className="hidden sm:inline-block px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                          {group.fornecedores.length} fornecedor{group.fornecedores.length === 1 ? '' : 'es'} único{group.fornecedores.length === 1 ? '' : 's'}
                        </span>
                      )}
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-slate-400" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-slate-400" />
                      )}
                    </div>
                  </div>

                  {/* Group Content */}
                  {isExpanded && (
                    <div className="border-t border-slate-100 dark:border-slate-850 p-4 bg-slate-50/50 dark:bg-slate-950/10">
                      {!group.encontrado ? (
                        <div className="flex items-center gap-2.5 p-3 rounded-lg border border-rose-150 dark:border-rose-950/30 bg-rose-50/20 dark:bg-rose-950/5 text-rose-800 dark:text-rose-400 text-xs">
                          <AlertTriangle className="h-4 w-4 shrink-0 text-rose-500" />
                          <span>Não há registro de compras passadas vinculadas a este código de material no banco de dados.</span>
                        </div>
                      ) : (
                        <div className="overflow-x-auto rounded-lg border border-slate-150 dark:border-slate-850 bg-white dark:bg-slate-900 shadow-sm">
                          <table className="min-w-full divide-y divide-slate-150 dark:divide-slate-800 text-left text-xs">
                            <thead className="bg-slate-50 dark:bg-slate-850 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                              <tr>
                                <th className="py-2.5 px-3">Cód. Fornecedor</th>
                                <th className="py-2.5 px-3">CNPJ</th>
                                <th className="py-2.5 px-3">Fornecedor</th>
                                <th className="py-2.5 px-3 text-center">UF</th>
                                <th className="py-2.5 px-3">Telefone</th>
                                <th className="py-2.5 px-3">E-mail</th>
                                <th className="py-2.5 px-3">Classificação</th>
                                <th className="py-2.5 px-3">Última Compra</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-150 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                              {group.fornecedores.map((f, idx) => (
                                <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-850/20">
                                  <td className="py-2.5 px-3 font-mono text-[11px] font-semibold">{f.cod_forn}</td>
                                  <td className="py-2.5 px-3 font-mono text-[11px]">{f.cnpj}</td>
                                  <td className="py-2.5 px-3 font-bold text-slate-800 dark:text-slate-200">{f.fornecedor}</td>
                                  <td className="py-2.5 px-3 text-center">{f.regiao_uf}</td>
                                  <td className="py-2.5 px-3">
                                    {f.telefone !== '—' ? (
                                      <a href={`tel:${f.telefone}`} className="flex items-center gap-1 hover:text-emerald-600 dark:hover:text-emerald-500 transition-colors">
                                        <Phone className="h-3 w-3 opacity-60" /> {f.telefone}
                                      </a>
                                    ) : '—'}
                                  </td>
                                  <td className="py-2.5 px-3">
                                    {f.email !== '—' ? (
                                      <a href={`mailto:${f.email}`} className="flex items-center gap-1 hover:text-emerald-600 dark:hover:text-emerald-500 transition-colors font-medium">
                                        <Mail className="h-3 w-3 opacity-60" /> {f.email}
                                      </a>
                                    ) : '—'}
                                  </td>
                                  <td className="py-2.5 px-3">
                                    {f.classificacao !== '—' ? (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-400">
                                        <Tag className="h-2.5 w-2.5" /> {f.classificacao}
                                      </span>
                                    ) : '—'}
                                  </td>
                                  <td className="py-2.5 px-3 text-slate-500 dark:text-slate-400 font-medium">
                                    <span className="flex items-center gap-1">
                                      <Calendar className="h-3 w-3 opacity-60" /> {f.ultima_data}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
