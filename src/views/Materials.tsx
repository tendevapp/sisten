/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Search, Star, Copy, X, ArrowRight, Download, Check, HelpCircle } from 'lucide-react';
import { localDb } from '../db/localDb';
import { Profile, Material } from '../types';

interface MaterialsProps {
  user: Profile;
}

export default function Materials({ user }: MaterialsProps) {
  const [queryInput, setQueryInput] = useState('');
  const [chips, setChips] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('Todas');
  const [selectedCompany, setSelectedCompany] = useState('Todas');
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  
  const [results, setResults] = useState<Material[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;

  useEffect(() => {
    setFavorites(localDb.getFavorites(user.id));
    // Check initial search in URL
    const urlParams = new URLSearchParams(window.location.hash.split('?')[1]);
    const qParam = urlParams.get('q');
    if (qParam) {
      setChips(qParam.split('+').filter(Boolean));
    }
  }, [user]);

  useEffect(() => {
    // Generate active query from cumulative chips
    const activeQuery = chips.join(' ');
    const matched = localDb.searchMaterials(activeQuery, selectedCategory, selectedCompany, onlyFavorites, user.id);
    setResults(matched);
    setCurrentPage(1); // Reset page
  }, [chips, selectedCategory, selectedCompany, onlyFavorites, user]);

  const handleAddChip = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = queryInput.trim();
    if (!clean) return;
    if (!chips.includes(clean)) {
      setChips([...chips, clean]);
    }
    setQueryInput('');
  };

  const handleRemoveChip = (chipToRemove: string) => {
    setChips(chips.filter(c => c !== chipToRemove));
  };

  const handleClearAll = () => {
    setChips([]);
    setQueryInput('');
    setSelectedCategory('Todas');
    setSelectedCompany('Todas');
    setOnlyFavorites(false);
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const handleToggleFavorite = (code: string) => {
    localDb.toggleFavorite(user.id, code);
    setFavorites(localDb.getFavorites(user.id));
  };

  const highlightText = (text: string, searchWords: string[]) => {
    if (!searchWords.length || !text) return text;
    const regex = new RegExp(`(${searchWords.map(w => w.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')).join('|')})`, 'gi');
    const parts = text.split(regex);
    return parts.map((part, i) => 
      regex.test(part) ? <mark key={i} className="bg-yellow-100 text-yellow-900 px-0.5 rounded font-semibold">{part}</mark> : part
    );
  };

  // Pagination computations
  const totalResults = results.length;
  const paginatedResults = results.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  const totalPages = Math.ceil(totalResults / itemsPerPage);

  // CSV Exporter
  const handleExportCSV = () => {
    const headers = ['Código SAP', 'Descrição', 'Texto Técnico', 'Categoria', 'Empresa', 'Unidade'];
    const rows = results.map(m => [
      m.material_code,
      m.description,
      m.technical_text || '',
      m.category,
      m.company,
      m.unit
    ]);

    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" 
      + [headers.join(';'), ...rows.map(e => e.map(val => `"${val.replace(/"/g, '""')}"`).join(';'))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `catalogo_materiais_sisten_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 text-left">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Catálogo de Materiais SAP</h2>
          <p className="mt-1 text-sm text-slate-500">Busca no catálogo de materiais exportado do SAP. Use chips para busca cumulativa.</p>
        </div>
        <button
          onClick={handleExportCSV}
          disabled={results.length === 0}
          className="flex items-center space-x-2 rounded-lg bg-emerald-800 hover:bg-emerald-900 text-white font-bold text-xs py-2 px-4 transition-colors cursor-pointer disabled:opacity-50"
        >
          <Download className="h-4 w-4" />
          <span>Exportar CSV</span>
        </button>
      </div>

      {/* Filter and Search Card */}
      <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm space-y-4">
        {/* Search bar input with enter trigger */}
        <form onSubmit={handleAddChip} className="flex gap-2">
          <div className="relative flex-1">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">
              <Search className="h-5 w-5" />
            </span>
            <input
              type="text"
              placeholder="Digite um termo e pressione Enter (cada termo vira um chip — busca cumulativa AND)"
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
              className="w-full rounded-lg border border-gray-200 py-2.5 pr-4 pl-10 text-sm focus:border-emerald-600 focus:outline-none transition-all"
            />
          </div>
          <button
            type="submit"
            className="rounded-lg bg-emerald-800 hover:bg-emerald-900 text-white font-bold text-xs px-6 cursor-pointer"
          >
            Adicionar
          </button>
        </form>

        {/* Chips Container */}
        {chips.length > 0 && (
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mr-1">Termos ativos:</span>
            {chips.map((chip, idx) => (
              <span key={idx} className="inline-flex items-center space-x-1 rounded-full bg-emerald-50 border border-emerald-100 py-1 px-3 text-xs font-semibold text-emerald-800">
                <span>{chip}</span>
                <button type="button" onClick={() => handleRemoveChip(chip)} className="text-emerald-500 hover:text-emerald-800 focus:outline-none">
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            <button
              onClick={handleClearAll}
              className="text-xs font-bold text-red-500 hover:underline ml-2 cursor-pointer"
            >
              Limpar tudo
            </button>
          </div>
        )}

        {/* Filters Selectors Row */}
        <div className="flex flex-col sm:flex-row gap-4 items-center justify-between pt-1 border-t border-slate-50">
          <div className="flex flex-wrap gap-4 items-center">
            <div className="flex items-center space-x-2">
              <span className="text-xs font-semibold text-slate-500">Categoria:</span>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="rounded-lg border border-gray-200 bg-white py-1.5 px-3 text-xs focus:outline-none focus:border-emerald-600 cursor-pointer"
              >
                <option value="Todas">Todas</option>
                <option value="CHAPAS">Chapas</option>
                <option value="PARAFUSOS E FIXADORES">Parafusos e Fixadores</option>
                <option value="CABOS E CONECTORES">Cabos e Conectores</option>
                <option value="EPI E SEGURANÇA">EPI e Segurança</option>
                <option value="PINTURA E QUÍMICOS">Pintura e Químicos</option>
                <option value="AUTOMAÇÃO E SENSORES">Automação e Sensores</option>
                <option value="VALVULAS E TUBULAÇÕES">Válvulas e Tubulações</option>
                <option value="OUTROS">Outros</option>
              </select>
            </div>

            <div className="flex items-center space-x-2">
              <span className="text-xs font-semibold text-slate-500">Empresa:</span>
              <select
                value={selectedCompany}
                onChange={(e) => setSelectedCompany(e.target.value)}
                className="rounded-lg border border-gray-200 bg-white py-1.5 px-3 text-xs focus:outline-none focus:border-emerald-600 cursor-pointer"
              >
                <option value="Todas">Todas (TEN2 / AG)</option>
                <option value="TEN2">TEN2</option>
                <option value="AG">AG</option>
              </select>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <label className="flex items-center text-xs font-semibold text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={onlyFavorites}
                onChange={(e) => setOnlyFavorites(e.target.checked)}
                className="mr-2 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
              />
              <Star className="h-3.5 w-3.5 mr-1 fill-amber-400 stroke-amber-400 inline" /> Meus favoritos
            </label>
          </div>
        </div>
      </div>

      {/* Warning banner for refined searches */}
      {totalResults > 500 && (
        <div className="rounded-lg bg-blue-50 border border-blue-100 p-3.5 text-xs text-blue-800">
          <strong>Resultados abundantes ({totalResults} encontrados).</strong> O catálogo exibe até 50 itens por página. Adicione mais chips ou filtre por categoria para refinar sua busca.
        </div>
      )}

      {/* Materials Results Table */}
      <div className="rounded-xl border border-gray-100 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-100 bg-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                <th className="py-3 px-4 w-12 text-center">Fav</th>
                <th className="py-3 px-4 w-28">Código SAP</th>
                <th className="py-3 px-4">Descrição</th>
                <th className="py-3 px-4">Texto Técnico</th>
                <th className="py-3 px-4 w-24 text-center">Empresa</th>
                <th className="py-3 px-4 w-16 text-center">Un.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-sm">
              {paginatedResults.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-400">
                    Nenhum material correspondente aos filtros. Tente remover termos da busca.
                  </td>
                </tr>
              ) : (
                paginatedResults.map((m) => {
                  const isFav = favorites.includes(m.material_code);
                  const isExpanded = expandedId === m.id;
                  
                  return (
                    <React.Fragment key={m.id}>
                      <tr className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-3.5 px-4 text-center">
                          <button onClick={() => handleToggleFavorite(m.material_code)} className="focus:outline-none">
                            <Star className={`h-4.5 w-4.5 ${isFav ? 'fill-amber-400 stroke-amber-400' : 'text-slate-300 hover:text-slate-500'}`} />
                          </button>
                        </td>
                        <td className="py-3.5 px-4 font-mono text-xs">
                          <div className="flex items-center space-x-1">
                            <span className="text-emerald-700 font-bold">{m.material_code}</span>
                            <button
                              onClick={() => handleCopyCode(m.material_code)}
                              className="text-slate-400 hover:text-slate-600 focus:outline-none"
                              title="Copiar Código"
                            >
                              {copiedCode === m.material_code ? (
                                <Check className="h-3.5 w-3.5 text-emerald-600" />
                              ) : (
                                <Copy className="h-3.5 w-3.5" />
                              )}
                            </button>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 font-medium text-slate-900">
                          {highlightText(m.description, chips)}
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="flex flex-col">
                            <p className="text-slate-600 text-xs line-clamp-2 leading-relaxed">
                              {highlightText(m.technical_text || '', chips)}
                            </p>
                            {m.technical_text && m.technical_text.length > 50 && (
                              <button
                                onClick={() => setExpandedId(isExpanded ? null : m.id)}
                                className="text-[10px] font-bold text-slate-400 hover:text-slate-600 self-start mt-0.5"
                              >
                                {isExpanded ? 'Ocultar detalhes' : 'Ver mais'}
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold ${m.company === 'AG' ? 'bg-indigo-50 text-indigo-700 border border-indigo-100' : 'bg-blue-50 text-blue-700 border border-blue-100'}`}>
                            {m.company}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-center font-bold text-slate-500 text-xs">
                          {m.unit}
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="bg-slate-50/40">
                          <td colSpan={6} className="py-3 px-6 text-xs text-slate-500 text-left border-l-4 border-emerald-500">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <div>
                                <p className="font-bold text-slate-700 uppercase tracking-wider text-[9px]">Texto Completo SAP</p>
                                <p className="mt-1 font-mono text-slate-600 leading-normal bg-white p-2 rounded border border-slate-100">{m.technical_text}</p>
                              </div>
                              <div className="space-y-1">
                                <p className="font-bold text-slate-700 uppercase tracking-wider text-[9px]">Classificação de Estoque</p>
                                <p className="text-slate-600 mt-1">Categoria Automática: <span className="font-semibold text-slate-900">{m.category}</span></p>
                                <p className="text-slate-400 text-[10px]">Autocategorizado com base nas regras linguísticas de palavras-chave do catálogo oficial de materiais da Torres Eólicas do Nordeste.</p>
                              </div>
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

        {/* Pagination Row */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
            <span className="text-xs text-slate-500">
              Mostrando de <strong>{((currentPage - 1) * itemsPerPage) + 1}</strong> a <strong>{Math.min(currentPage * itemsPerPage, totalResults)}</strong> de <strong>{totalResults}</strong> materiais
            </span>
            <div className="flex items-center space-x-2">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(currentPage - 1)}
                className="rounded-lg border border-gray-200 px-3 py-1 text-xs hover:bg-slate-50 transition-colors disabled:opacity-50 cursor-pointer"
              >
                Anterior
              </button>
              <span className="text-xs font-semibold text-slate-700">Pág. {currentPage} de {totalPages}</span>
              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(currentPage + 1)}
                className="rounded-lg border border-gray-200 px-3 py-1 text-xs hover:bg-slate-50 transition-colors disabled:opacity-50 cursor-pointer"
              >
                Próxima
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
