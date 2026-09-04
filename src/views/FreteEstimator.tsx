/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Truck, Calculator, MapPin, Scale, DollarSign, Package, 
  Clock, ShieldCheck, FileSpreadsheet, Copy, Check, Info, 
  ArrowRight, Sparkles, RefreshCw, AlertCircle, Layers, CheckCircle2,
  Search, ChevronDown, X, Navigation
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { localDb } from '../db/localDb';
import { Profile, TabelaFrete } from '../types';
import { useToast } from '../components/ui/Toast';
import BahiaSulAnalyticsPanel from '../components/frete/BahiaSulAnalyticsPanel';

interface FreteEstimatorProps {
  user: Profile;
  onNavigate: (path: string) => void;
}

export default function FreteEstimator({ user, onNavigate }: FreteEstimatorProps) {
  const toast = useToast();
  // Janela ativa: 'bahiasul' (inicial / padrão) ou 'estimador'
  const [activeTab, setActiveTab] = useState<'bahiasul' | 'estimador'>('bahiasul');
  const [tabelaFreteList, setTabelaFreteList] = useState<TabelaFrete[]>([]);
  const [copied, setCopied] = useState(false);

  // Form Controls State
  const [selectedOrigem, setSelectedOrigem] = useState<string>('');
  const [selectedDestinoId, setSelectedDestinoId] = useState<string>('');
  const [modalidade, setModalidade] = useState<'fracionado' | 'dedicado'>('fracionado');
  const [veiculoTipo, setVeiculoTipo] = useState<
    'fiorino' | 'veiculo_3_4_ate_2_5t' | 'toco_ate_5_5t' | 'truck_ate_14t' | 'carreta_ate_25t' | 'carreta_acima_27t'
  >('fiorino');
  
  const [pesoKg, setPesoKg] = useState<number>(25);
  const [valorMercadoria, setValorMercadoria] = useState<number>(5000);

  // Smart Search & Autocomplete Combobox State
  const [smartSearchQuery, setSmartSearchQuery] = useState<string>('');
  const [isSmartSearchOpen, setIsSmartSearchOpen] = useState<boolean>(false);
  const [origemFilterText, setOrigemFilterText] = useState<string>('');
  const [isOrigemMenuOpen, setIsOrigemMenuOpen] = useState<boolean>(false);
  const [destinoFilterText, setDestinoFilterText] = useState<string>('');
  const [isDestinoMenuOpen, setIsDestinoMenuOpen] = useState<boolean>(false);

  const smartSearchRef = useRef<HTMLDivElement>(null);
  const origemRef = useRef<HTMLDivElement>(null);
  const destinoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadData();
  }, []);

  // Close dropdown menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (smartSearchRef.current && !smartSearchRef.current.contains(event.target as Node)) {
        setIsSmartSearchOpen(false);
      }
      if (origemRef.current && !origemRef.current.contains(event.target as Node)) {
        setIsOrigemMenuOpen(false);
      }
      if (destinoRef.current && !destinoRef.current.contains(event.target as Node)) {
        setIsDestinoMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const loadData = () => {
    const list = localDb.getTabelaFrete();
    setTabelaFreteList(list);

    if (list.length > 0) {
      const firstOrigem = list[0].origem;
      setSelectedOrigem(firstOrigem);
      const firstDestino = list.find(f => f.origem === firstOrigem);
      if (firstDestino && firstDestino.id) {
        setSelectedDestinoId(firstDestino.id);
      } else if (firstDestino) {
        setSelectedDestinoId(firstDestino.destino);
      }
    }
  };

  // Distinct Origens
  const origensDisponiveis = useMemo(() => {
    const set = new Set<string>();
    tabelaFreteList.forEach(item => {
      if (item.origem) set.add(item.origem.trim());
    });
    return Array.from(set).sort();
  }, [tabelaFreteList]);

  // Filtered Origens based on user typing
  const origensFiltradas = useMemo(() => {
    if (!origemFilterText.trim()) return origensDisponiveis;
    const q = origemFilterText.toLowerCase().trim();
    return origensDisponiveis.filter(o => o.toLowerCase().includes(q));
  }, [origensDisponiveis, origemFilterText]);

  // Available Destinos for selected Origem
  const destinosDisponiveis = useMemo(() => {
    if (!selectedOrigem) return [];
    return tabelaFreteList.filter(item => item.origem.trim().toLowerCase() === selectedOrigem.trim().toLowerCase());
  }, [tabelaFreteList, selectedOrigem]);

  // Filtered Destinos based on user typing
  const destinosFiltrados = useMemo(() => {
    if (!destinoFilterText.trim()) return destinosDisponiveis;
    const q = destinoFilterText.toLowerCase().trim();
    return destinosDisponiveis.filter(d => 
      (d.destino || '').toLowerCase().includes(q) || 
      (d.uf || '').toLowerCase().includes(q) || 
      (d.rotas || '').toLowerCase().includes(q)
    );
  }, [destinosDisponiveis, destinoFilterText]);

  // Global Smart Suggestions (matching Origem, Destino, UF, Rota)
  const sugestoesInteligentes = useMemo(() => {
    if (!smartSearchQuery.trim()) return [];
    const q = smartSearchQuery.toLowerCase().trim();
    return tabelaFreteList.filter(item => {
      const orig = (item.origem || '').toLowerCase();
      const dest = (item.destino || '').toLowerCase();
      const uf = (item.uf || '').toLowerCase();
      const rota = (item.rotas || '').toLowerCase();
      return orig.includes(q) || dest.includes(q) || uf.includes(q) || rota.includes(q);
    }).slice(0, 8);
  }, [tabelaFreteList, smartSearchQuery]);

  // Active Route
  const rotaAtiva = useMemo(() => {
    if (!selectedDestinoId) return null;
    return tabelaFreteList.find(f => f.id === selectedDestinoId || f.destino === selectedDestinoId) || null;
  }, [tabelaFreteList, selectedDestinoId]);

  // Select a suggestion directly from Smart Search
  const handleSelectSmartSuggestion = (item: TabelaFrete) => {
    setSelectedOrigem(item.origem);
    setSelectedDestinoId(item.id || item.destino);
    setSmartSearchQuery('');
    setIsSmartSearchOpen(false);
    toast.info(`Rota selecionada: ${item.origem} ➔ ${item.destino} (${item.uf})`);
  };

  // Calculation Engine
  const calculoFrete = useMemo(() => {
    if (!rotaAtiva) return null;

    const peso = Math.max(0, pesoKg || 0);
    const vMerc = Math.max(0, valorMercadoria || 0);

    // 1. Frete Base / Frete Peso
    let freteBase = 0;
    let faixaDesc = '';

    if (modalidade === 'fracionado') {
      if (peso <= 10) {
        freteBase = Number(rotaAtiva.kg_1_10) || 0;
        faixaDesc = 'Faixa 1 - 10 kg';
      } else if (peso <= 20) {
        freteBase = Number(rotaAtiva.kg_11_20) || 0;
        faixaDesc = 'Faixa 11 - 20 kg';
      } else if (peso <= 30) {
        freteBase = Number(rotaAtiva.kg_21_30) || 0;
        faixaDesc = 'Faixa 21 - 30 kg';
      } else if (peso <= 50) {
        freteBase = Number(rotaAtiva.kg_31_50) || 0;
        faixaDesc = 'Faixa 31 - 50 kg';
      } else if (peso <= 70) {
        freteBase = Number(rotaAtiva.kg_51_70) || 0;
        faixaDesc = 'Faixa 51 - 70 kg';
      } else if (peso <= 100) {
        freteBase = Number(rotaAtiva.kg_71_100) || 0;
        faixaDesc = 'Faixa 71 - 100 kg';
      } else {
        const taxaExcedente = Number(rotaAtiva.kg_acima_100) || 0;
        if (taxaExcedente > 0) {
          freteBase = taxaExcedente * peso;
          faixaDesc = `Acima de 100 kg (R$ ${taxaExcedente.toFixed(2)}/kg × ${peso}kg)`;
        } else {
          freteBase = Number(rotaAtiva.kg_71_100) || 0;
          faixaDesc = 'Acima de 100 kg (Tarifa Teto 100kg)';
        }
      }
    } else {
      // Veículo Dedicado
      freteBase = Number(rotaAtiva[veiculoTipo]) || 0;
      const veiculoNomes: Record<string, string> = {
        fiorino: 'Fiorino',
        veiculo_3_4_ate_2_5t: '3/4 (até 2,5 ton)',
        toco_ate_5_5t: 'Toco (até 5,5 ton)',
        truck_ate_14t: 'Truck (até 14 ton)',
        carreta_ate_25t: 'Carreta (até 25 ton)',
        carreta_acima_27t: 'Carreta (acima de 27 ton)'
      };
      faixaDesc = `Dedicado: ${veiculoNomes[veiculoTipo] || veiculoTipo}`;
    }

    // 2. Ad Valorem
    const rawAdVal = Number(rotaAtiva.ad_valores) || 0;
    const adValoresPct = rawAdVal < 0.05 && rawAdVal > 0 ? rawAdVal * 100 : rawAdVal;
    const adValoresValor = (vMerc * adValoresPct) / 100;

    // 3. Pedágio por fração de 100kg
    const taxaPedagioFracao = Number(rotaAtiva.pedagio_fracao_100kg) || 0;
    const fracoes100kg = Math.ceil(peso / 100) || 1;
    const pedagioTotal = fracoes100kg * taxaPedagioFracao;

    // 4. Taxas Fixas e Especiais
    const cat = Number(rotaAtiva.cat) || 0;
    const itrTas = Number(rotaAtiva.itr_tas) || 0;
    const taxaFixa = Number(rotaAtiva.taxa_fixa_itr_redespacho) || 0;

    // 5. Subtotal Sem ICMS
    const subtotalSemIcms = freteBase + adValoresValor + pedagioTotal + cat + itrTas + taxaFixa;

    // 6. ICMS
    const icmsCleanStr = String(rotaAtiva.icms_aplicado || '').replace(/%/g, '').replace(',', '.').trim();
    const rawIcms = parseFloat(icmsCleanStr) || 0;
    const icmsPct = rawIcms <= 1 && rawIcms > 0 ? rawIcms * 100 : rawIcms;
    
    let totalComIcms = subtotalSemIcms;
    let valorIcms = 0;

    if (icmsPct > 0 && icmsPct < 100) {
      totalComIcms = subtotalSemIcms / (1 - (icmsPct / 100));
      valorIcms = totalComIcms - subtotalSemIcms;
    }

    return {
      freteBase,
      faixaDesc,
      adValoresPct,
      adValoresValor,
      fracoes100kg,
      taxaPedagioFracao,
      pedagioTotal,
      cat,
      itrTas,
      taxaFixa,
      subtotalSemIcms,
      icmsPct,
      valorIcms,
      totalComIcms,
      leadTime: rotaAtiva.lead_time_entrega || '—',
      leadTime2: rotaAtiva.lead_time_entrega_2 || ''
    };
  }, [rotaAtiva, pesoKg, valorMercadoria, modalidade, veiculoTipo]);

  // Comparison logic: Fracionado vs Dedicado
  const comparativo = useMemo(() => {
    if (!rotaAtiva) return null;

    let fBaseFrac = 0;
    if (pesoKg <= 10) fBaseFrac = Number(rotaAtiva.kg_1_10) || 0;
    else if (pesoKg <= 20) fBaseFrac = Number(rotaAtiva.kg_11_20) || 0;
    else if (pesoKg <= 30) fBaseFrac = Number(rotaAtiva.kg_21_30) || 0;
    else if (pesoKg <= 50) fBaseFrac = Number(rotaAtiva.kg_31_50) || 0;
    else if (pesoKg <= 70) fBaseFrac = Number(rotaAtiva.kg_51_70) || 0;
    else if (pesoKg <= 100) fBaseFrac = Number(rotaAtiva.kg_71_100) || 0;
    else fBaseFrac = (Number(rotaAtiva.kg_acima_100) || 0) * pesoKg;

    const rawAdVal = Number(rotaAtiva.ad_valores) || 0;
    const adValPct = rawAdVal < 0.05 && rawAdVal > 0 ? rawAdVal * 100 : rawAdVal;
    const adVal = (valorMercadoria * adValPct) / 100;
    const pedag = Math.ceil(pesoKg / 100) * (Number(rotaAtiva.pedagio_fracao_100kg) || 0);
    const taxas = (Number(rotaAtiva.cat) || 0) + (Number(rotaAtiva.itr_tas) || 0) + (Number(rotaAtiva.taxa_fixa_itr_redespacho) || 0);
    const subtotalFrac = fBaseFrac + adVal + pedag + taxas;

    const rawIcms = parseFloat(String(rotaAtiva.icms_aplicado || '').replace(/%/g, '').replace(',', '.')) || 0;
    const icmsPct = rawIcms <= 1 && rawIcms > 0 ? rawIcms * 100 : rawIcms;
    const totalFrac = icmsPct > 0 ? subtotalFrac / (1 - (icmsPct / 100)) : subtotalFrac;

    const fiorinoBase = Number(rotaAtiva.fiorino) || 0;
    const subtotalFiorino = fiorinoBase + adVal + pedag + taxas;
    const totalFiorino = icmsPct > 0 ? subtotalFiorino / (1 - (icmsPct / 100)) : subtotalFiorino;

    const recomendacao = totalFrac <= totalFiorino || fiorinoBase === 0 ? 'fracionado' : 'dedicado';
    const economia = Math.abs(totalFrac - totalFiorino);

    return {
      totalFrac,
      totalFiorino,
      recomendacao,
      economia
    };
  }, [rotaAtiva, pesoKg, valorMercadoria]);

  const handleCopyResumo = () => {
    if (!calculoFrete || !rotaAtiva) return;

    const text = `
🚛 *MEMÓRIA DE CÁLCULO DE FRETE - SISTEN*
=========================================
• Origem: ${rotaAtiva.origem} (${rotaAtiva.uf})
• Destino: ${rotaAtiva.destino}
• Rota: ${rotaAtiva.rotas || 'Padrão'}
• Modalidade: ${modalidade === 'fracionado' ? 'Carga Fracionada' : 'Veículo Dedicado'}
• Peso da Carga: ${pesoKg} kg
• Valor Mercadoria: R$ ${valorMercadoria.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
-----------------------------------------
• Frete Base: R$ ${calculoFrete.freteBase.toFixed(2)} (${calculoFrete.faixaDesc})
• Ad Valorem (${calculoFrete.adValoresPct}%): R$ ${calculoFrete.adValoresValor.toFixed(2)}
• Pedágio (${calculoFrete.fracoes100kg} fr. 100kg): R$ ${calculoFrete.pedagioTotal.toFixed(2)}
• Taxa CAT: R$ ${calculoFrete.cat.toFixed(2)}
• ITR / TAS: R$ ${calculoFrete.itrTas.toFixed(2)}
• Taxa Fixa / Redespacho: R$ ${calculoFrete.taxaFixa.toFixed(2)}
• Subtotal sem ICMS: R$ ${calculoFrete.subtotalSemIcms.toFixed(2)}
• ICMS Aplicado (${calculoFrete.icmsPct}%): R$ ${calculoFrete.valorIcms.toFixed(2)}
-----------------------------------------
💰 *VALOR TOTAL DO FRETE: R$ ${calculoFrete.totalComIcms.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}*
⏱️ *Lead Time Estimado:* ${calculoFrete.leadTime} dias
=========================================
Cotação gerada via SISTEN por ${user.name} em ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
    `.trim();

    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success('Memória de cálculo copiada para a área de transferência!');
    setTimeout(() => setCopied(false), 2500);
  };

  const handleExportExcel = () => {
    if (!calculoFrete || !rotaAtiva) return;

    const data = [
      { Parametro: 'Origem', Valor: rotaAtiva.origem },
      { Parametro: 'UF Destino', Valor: rotaAtiva.uf },
      { Parametro: 'Destino', Valor: rotaAtiva.destino },
      { Parametro: 'Rota', Valor: rotaAtiva.rotas || 'N/A' },
      { Parametro: 'Modalidade', Valor: modalidade === 'fracionado' ? 'Fracionado' : 'Dedicado' },
      { Parametro: 'Peso Total (kg)', Valor: pesoKg },
      { Parametro: 'Valor Mercadoria (R$)', Valor: valorMercadoria },
      { Parametro: 'Frete Base (R$)', Valor: calculoFrete.freteBase },
      { Parametro: 'Ad Valorem (%)', Valor: calculoFrete.adValoresPct },
      { Parametro: 'Ad Valorem Valor (R$)', Valor: calculoFrete.adValoresValor },
      { Parametro: 'Frações 100kg Pedágio', Valor: calculoFrete.fracoes100kg },
      { Parametro: 'Pedágio Total (R$)', Valor: calculoFrete.pedagioTotal },
      { Parametro: 'CAT (R$)', Valor: calculoFrete.cat },
      { Parametro: 'ITR/TAS (R$)', Valor: calculoFrete.itrTas },
      { Parametro: 'Taxa Fixa (R$)', Valor: calculoFrete.taxaFixa },
      { Parametro: 'Subtotal Sem ICMS (R$)', Valor: calculoFrete.subtotalSemIcms },
      { Parametro: 'Alíquota ICMS (%)', Valor: calculoFrete.icmsPct },
      { Parametro: 'Valor ICMS (R$)', Valor: calculoFrete.valorIcms },
      { Parametro: 'TOTAL DO FRETE (R$)', Valor: calculoFrete.totalComIcms },
      { Parametro: 'Lead Time (dias)', Valor: calculoFrete.leadTime }
    ];

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Estimativa de Frete');
    XLSX.writeFile(workbook, `Estimativa_Frete_${rotaAtiva.origem}_${rotaAtiva.destino}_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast.success('Relatório Excel exportado com sucesso!');
  };

  return (
    <div className="flex flex-col h-full bg-slate-50/50 overflow-y-auto p-4 md:p-6 space-y-6 text-left">
      
      {/* Abas de Navegação das Janelas */}
      <div className="bg-white p-2 rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-2">
        <button
          onClick={() => setActiveTab('bahiasul')}
          className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl font-bold text-xs transition-all cursor-pointer ${
            activeTab === 'bahiasul'
              ? 'bg-amber-500 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <Truck className="h-4 w-4" />
          <span>Acompanhamento & Análise (Bahia Sul)</span>
        </button>

        <button
          onClick={() => setActiveTab('estimador')}
          className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl font-bold text-xs transition-all cursor-pointer ${
            activeTab === 'estimador'
              ? 'bg-cyan-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <Calculator className="h-4 w-4" />
          <span>Simulador & Estimador de Frete</span>
        </button>
      </div>

      {activeTab === 'bahiasul' ? (
        <BahiaSulAnalyticsPanel user={user} onNavigate={onNavigate} />
      ) : (
        <>
          {/* Header Banner */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center space-x-2">
                <span className="p-2 rounded-xl bg-cyan-50 text-cyan-600 border border-cyan-100">
              <Truck className="h-5 w-5" />
            </span>
            <h1 className="text-xl font-black text-slate-800 tracking-tight">Estimador & Calculadora de Frete</h1>
          </div>
          <p className="text-xs text-slate-500 max-w-2xl">
            Simule os custos exatos de transporte rodoviário (Fracionado ou Dedicado) com base nas tabelas ativas do Supabase, incluindo alíquotas de ICMS, Ad Valorem, pedágios por fração e taxas contratuais.
          </p>
        </div>

        <div className="flex items-center space-x-2 shrink-0">
          <button
            onClick={() => {
              setPesoKg(25);
              setValorMercadoria(5000);
              setModalidade('fracionado');
              setSmartSearchQuery('');
              setOrigemFilterText('');
              setDestinoFilterText('');
            }}
            className="inline-flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-all shadow-2xs cursor-pointer"
          >
            <RefreshCw className="h-3.5 w-3.5 text-slate-400" />
            <span>Resetar Simulador</span>
          </button>
          
          <button
            onClick={handleCopyResumo}
            disabled={!calculoFrete}
            className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-slate-900 text-xs font-bold text-white hover:bg-slate-800 transition-all shadow cursor-pointer disabled:opacity-50"
          >
            {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4 text-slate-300" />}
            <span>{copied ? 'Copiado!' : 'Copiar Memória'}</span>
          </button>

          <button
            onClick={handleExportExcel}
            disabled={!calculoFrete}
            className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-emerald-600 text-xs font-bold text-white hover:bg-emerald-700 transition-all shadow cursor-pointer disabled:opacity-50"
          >
            <FileSpreadsheet className="h-4 w-4" />
            <span>Exportar Excel</span>
          </button>
        </div>
      </div>

      {tabelaFreteList.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-3">
          <AlertCircle className="mx-auto h-12 w-12 text-amber-500" />
          <h3 className="text-base font-bold text-slate-800">Nenhuma rota de frete cadastrada</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            A tabela de frete ainda não possui registros importados no Supabase. Faça o upload da planilha em Administração → Importação de Planilhas.
          </p>
          <button
            onClick={() => onNavigate('/admin/importacao-materiais')}
            className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl bg-cyan-600 text-white text-xs font-bold hover:bg-cyan-700 transition-all cursor-pointer"
          >
            <span>Ir para Importação de Planilhas</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* Form & Controls Panel (Col 7) */}
          <div className="lg:col-span-7 space-y-6">
            
            {/* Step 1: Smart Search & Route Selector */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center space-x-2">
                  <span className="h-6 w-6 rounded-full bg-cyan-100 text-cyan-800 text-xs font-extrabold flex items-center justify-center">1</span>
                  <h2 className="text-sm font-bold text-slate-800">Origem & Destino da Carga</h2>
                </div>
                <span className="text-[10px] font-semibold text-cyan-700 bg-cyan-50 px-2 py-0.5 rounded-full border border-cyan-200">
                  Busca Inteligente Ativa
                </span>
              </div>

              {/* BARRA DE BUSCA INTELIGENTE GLOBAL COM DIGITAÇÃO E SUGESTÃO EM TEMPO REAL */}
              <div className="relative" ref={smartSearchRef}>
                <label className="text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-cyan-600" />
                  <span>Busca Rápida de Rota (Digitação Inteligente)</span>
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    value={smartSearchQuery}
                    onFocus={() => setIsSmartSearchOpen(true)}
                    onChange={(e) => {
                      setSmartSearchQuery(e.target.value);
                      setIsSmartSearchOpen(true);
                    }}
                    placeholder="Digite cidade de origem, destino, UF ou rota (ex: São Paulo, Curitiba, MG...)"
                    className="w-full rounded-xl border border-cyan-200 bg-cyan-50/20 pl-9 pr-9 py-2.5 text-xs font-medium text-slate-800 focus:outline-none focus:border-cyan-600 focus:bg-white focus:ring-2 focus:ring-cyan-600/20 transition-all shadow-2xs"
                  />
                  {smartSearchQuery && (
                    <button
                      onClick={() => {
                        setSmartSearchQuery('');
                        setIsSmartSearchOpen(false);
                      }}
                      className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 p-0.5 rounded-full hover:bg-slate-100 cursor-pointer"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {/* PAINEL DE SUGESTÕES DA BUSCA INTELIGENTE */}
                {isSmartSearchOpen && smartSearchQuery.trim() && (
                  <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-cyan-200 rounded-2xl shadow-xl z-30 max-h-72 overflow-y-auto divide-y divide-slate-100 p-1.5 animate-in fade-in slide-in-from-top-1">
                    {sugestoesInteligentes.length === 0 ? (
                      <div className="p-4 text-center text-xs text-slate-400">
                        Nenhuma rota encontrada para "{smartSearchQuery}". Tente outro termo ou selecione nos campos abaixo.
                      </div>
                    ) : (
                      sugestoesInteligentes.map((item) => (
                        <div
                          key={item.id || `${item.origem}_${item.destino}`}
                          onClick={() => handleSelectSmartSuggestion(item)}
                          className="p-2.5 rounded-xl hover:bg-cyan-50/70 transition-colors cursor-pointer flex items-center justify-between text-xs group"
                        >
                          <div className="space-y-0.5 text-left">
                            <div className="font-bold text-slate-800 flex items-center gap-1.5">
                              <Navigation className="h-3 w-3 text-cyan-600 shrink-0" />
                              <span>{item.origem}</span>
                              <ArrowRight className="h-3 w-3 text-slate-400" />
                              <span className="text-emerald-700">{item.destino}</span>
                            </div>
                            <div className="text-[10px] text-slate-400 flex items-center gap-2">
                              <span>UF: <strong>{item.uf}</strong></span>
                              {item.rotas && <span>• Rota: <strong>{item.rotas}</strong></span>}
                              {item.lead_time_entrega && <span>• Lead Time: <strong>{item.lead_time_entrega} dias</strong></span>}
                            </div>
                          </div>
                          <span className="text-[10px] font-bold text-cyan-700 group-hover:underline bg-white px-2 py-1 rounded-lg border border-cyan-100 shrink-0">
                            Selecionar ➔
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* SELEÇÃO INDIVIDUAL COM DIGITAÇÃO E AUTOCOMPLETE (ORIGEM E DESTINO) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                
                {/* Autocomplete Combobox Origem */}
                <div className="space-y-1.5 relative" ref={origemRef}>
                  <label className="text-xs font-bold text-slate-600 flex items-center justify-between">
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5 text-cyan-600" /> Origem (Saída)
                    </span>
                    <span className="text-[10px] text-slate-400 font-normal">{origensDisponiveis.length} disponíveis</span>
                  </label>
                  
                  <div className="relative">
                    <input
                      type="text"
                      value={isOrigemMenuOpen ? origemFilterText : selectedOrigem}
                      onFocus={() => {
                        setIsOrigemMenuOpen(true);
                        setOrigemFilterText('');
                      }}
                      onChange={(e) => {
                        setOrigemFilterText(e.target.value);
                        setIsOrigemMenuOpen(true);
                      }}
                      placeholder="Filtrar origem..."
                      className="w-full rounded-xl border border-slate-200 bg-slate-50/50 p-2.5 text-xs font-bold text-slate-800 focus:outline-none focus:border-cyan-600 focus:bg-white transition-all pr-8"
                    />
                    <ChevronDown className="absolute right-3 top-3 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                  </div>

                  {isOrigemMenuOpen && (
                    <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-20 max-h-52 overflow-y-auto p-1 text-xs">
                      {origensFiltradas.length === 0 ? (
                        <div className="p-2 text-slate-400 text-center">Sem origens correspondentes</div>
                      ) : (
                        origensFiltradas.map((origem) => (
                          <div
                            key={origem}
                            onClick={() => {
                              setSelectedOrigem(origem);
                              setIsOrigemMenuOpen(false);
                              setOrigemFilterText('');
                            }}
                            className={`p-2 rounded-lg cursor-pointer flex items-center justify-between ${
                              selectedOrigem === origem ? 'bg-cyan-50 font-bold text-cyan-900' : 'hover:bg-slate-50 text-slate-700'
                            }`}
                          >
                            <span>{origem}</span>
                            {selectedOrigem === origem && <Check className="h-3.5 w-3.5 text-cyan-600" />}
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>

                {/* Autocomplete Combobox Destino */}
                <div className="space-y-1.5 relative" ref={destinoRef}>
                  <label className="text-xs font-bold text-slate-600 flex items-center justify-between">
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5 text-emerald-600" /> Destino / UF
                    </span>
                    <span className="text-[10px] text-slate-400 font-normal">{destinosDisponiveis.length} nesta origem</span>
                  </label>

                  <div className="relative">
                    <input
                      type="text"
                      value={isDestinoMenuOpen ? destinoFilterText : (rotaAtiva ? `${rotaAtiva.destino} (${rotaAtiva.uf})` : '')}
                      onFocus={() => {
                        setIsDestinoMenuOpen(true);
                        setDestinoFilterText('');
                      }}
                      onChange={(e) => {
                        setDestinoFilterText(e.target.value);
                        setIsDestinoMenuOpen(true);
                      }}
                      placeholder="Filtrar destino ou UF..."
                      className="w-full rounded-xl border border-slate-200 bg-slate-50/50 p-2.5 text-xs font-bold text-slate-800 focus:outline-none focus:border-cyan-600 focus:bg-white transition-all pr-8"
                    />
                    <ChevronDown className="absolute right-3 top-3 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                  </div>

                  {isDestinoMenuOpen && (
                    <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-20 max-h-52 overflow-y-auto p-1 text-xs">
                      {destinosFiltrados.length === 0 ? (
                        <div className="p-2 text-slate-400 text-center">Sem destinos correspondentes</div>
                      ) : (
                        destinosFiltrados.map((dest) => {
                          const isSelected = selectedDestinoId === (dest.id || dest.destino);
                          return (
                            <div
                              key={dest.id || `${dest.origem}_${dest.destino}`}
                              onClick={() => {
                                setSelectedDestinoId(dest.id || dest.destino);
                                setIsDestinoMenuOpen(false);
                                setDestinoFilterText('');
                              }}
                              className={`p-2 rounded-lg cursor-pointer flex items-center justify-between ${
                                isSelected ? 'bg-emerald-50 font-bold text-emerald-900' : 'hover:bg-slate-50 text-slate-700'
                              }`}
                            >
                              <div>
                                <span className="font-semibold">{dest.destino}</span>
                                <span className="ml-1.5 text-[10px] text-slate-400 font-mono">({dest.uf})</span>
                                {dest.rotas && <span className="ml-1.5 text-[10px] text-slate-400">• Rota: {dest.rotas}</span>}
                              </div>
                              {isSelected && <Check className="h-3.5 w-3.5 text-emerald-600" />}
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              </div>

              {rotaAtiva && (
                <div className="p-3 bg-cyan-50/50 border border-cyan-100 rounded-xl flex items-center justify-between text-xs">
                  <div className="flex items-center space-x-2 text-cyan-900">
                    <CheckCircle2 className="h-4 w-4 text-cyan-600 shrink-0" />
                    <span><strong>Rota Ativa:</strong> {rotaAtiva.origem} ➔ {rotaAtiva.destino} ({rotaAtiva.uf})</span>
                  </div>
                  <span className="font-semibold text-cyan-700 bg-white px-2 py-0.5 rounded border border-cyan-200/60 text-[10px]">
                    Lead Time: {rotaAtiva.lead_time_entrega || 'N/A'}
                  </span>
                </div>
              )}
            </div>

            {/* Step 2: Modalidade & Tipo de Envio */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-4">
              <div className="flex items-center space-x-2 border-b border-slate-100 pb-3">
                <span className="h-6 w-6 rounded-full bg-cyan-100 text-cyan-800 text-xs font-extrabold flex items-center justify-center">2</span>
                <h2 className="text-sm font-bold text-slate-800">Modalidade de Envio</h2>
              </div>

              {/* Selector Tabs */}
              <div className="grid grid-cols-2 gap-3 p-1 bg-slate-100/80 rounded-xl">
                <button
                  type="button"
                  onClick={() => setModalidade('fracionado')}
                  className={`py-2.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center space-x-2 cursor-pointer ${
                    modalidade === 'fracionado' 
                      ? 'bg-white text-slate-900 shadow-sm border border-slate-200/60' 
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Package className="h-4 w-4 text-cyan-600" />
                  <span>Carga Fracionada (por peso)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setModalidade('dedicado')}
                  className={`py-2.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center space-x-2 cursor-pointer ${
                    modalidade === 'dedicado' 
                      ? 'bg-white text-slate-900 shadow-sm border border-slate-200/60' 
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Truck className="h-4 w-4 text-purple-600" />
                  <span>Veículo Dedicado (Lotação)</span>
                </button>
              </div>

              {/* Dedicated Vehicle Sub-Selector */}
              {modalidade === 'dedicado' && (
                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <label className="text-xs font-bold text-slate-600 block">Selecione o Tipo de Veículo Dedicado:</label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {[
                      { id: 'fiorino', label: 'Fiorino', cap: 'até 650kg' },
                      { id: 'veiculo_3_4_ate_2_5t', label: '3/4', cap: 'até 2,5 ton' },
                      { id: 'toco_ate_5_5t', label: 'TOCO', cap: 'até 5,5 ton' },
                      { id: 'truck_ate_14t', label: 'TRUCK', cap: 'até 14 ton' },
                      { id: 'carreta_ate_25t', label: 'CARRETA', cap: 'até 25 ton' },
                      { id: 'carreta_acima_27t', label: 'CARRETA XL', cap: '> 27 ton' },
                    ].map(v => (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => setVeiculoTipo(v.id as any)}
                        className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                          veiculoTipo === v.id
                            ? 'border-purple-600 bg-purple-50/40 text-purple-950 font-bold ring-1 ring-purple-600/20'
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <div className="text-xs font-bold">{v.label}</div>
                        <div className="text-[10px] text-slate-400 font-medium">{v.cap}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Step 3: Peso & Valor Declarado */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-4">
              <div className="flex items-center space-x-2 border-b border-slate-100 pb-3">
                <span className="h-6 w-6 rounded-full bg-cyan-100 text-cyan-800 text-xs font-extrabold flex items-center justify-center">3</span>
                <h2 className="text-sm font-bold text-slate-800">Parâmetros Físicos & Financeiros da Carga</h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Peso Total */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600 flex items-center gap-1">
                    <Scale className="h-3.5 w-3.5 text-cyan-600" /> Peso Total da Carga (kg)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={pesoKg}
                    onChange={(e) => setPesoKg(Math.max(1, parseFloat(e.target.value) || 0))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/50 p-2.5 text-xs font-bold text-slate-800 focus:outline-none focus:border-cyan-600 focus:bg-white transition-all"
                  />
                  {/* Quick Presets */}
                  <div className="flex flex-wrap gap-1 pt-1">
                    {[5, 15, 45, 80, 250, 1500, 5000].map(val => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setPesoKg(val)}
                        className={`text-[10px] px-2 py-0.5 rounded-lg border font-semibold cursor-pointer ${
                          pesoKg === val ? 'bg-slate-900 text-white border-slate-900' : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                        }`}
                      >
                        {val >= 1000 ? `${val / 1000}t` : `${val}kg`}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Valor Mercadoria */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600 flex items-center gap-1">
                    <DollarSign className="h-3.5 w-3.5 text-emerald-600" /> Valor da Mercadoria (R$)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="100"
                    value={valorMercadoria}
                    onChange={(e) => setValorMercadoria(Math.max(0, parseFloat(e.target.value) || 0))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/50 p-2.5 text-xs font-bold text-slate-800 focus:outline-none focus:border-cyan-600 focus:bg-white transition-all"
                  />
                  <p className="text-[10px] text-slate-400">Usado para cálculo do Ad Valorem (Seguro) da rota.</p>
                </div>
              </div>
            </div>

            {/* Step 4: Smart Recommendation Box */}
            {comparativo && (
              <div className="bg-linear-to-r from-slate-900 to-slate-800 text-white rounded-2xl p-5 shadow-lg space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Sparkles className="h-5 w-5 text-amber-400 animate-pulse" />
                    <h3 className="font-bold text-sm">Análise Comparativa da Rota</h3>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-amber-400 text-slate-950">
                    Recomendação de Economia
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-1">
                  <div className="p-3 rounded-xl bg-white/10 border border-white/10">
                    <span className="text-[10px] text-slate-300 font-semibold block uppercase">Carga Fracionada</span>
                    <p className="text-lg font-black text-white mt-0.5">R$ {comparativo.totalFrac.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-white/10 border border-white/10">
                    <span className="text-[10px] text-slate-300 font-semibold block uppercase">Veículo Fiorino (Dedicado)</span>
                    <p className="text-lg font-black text-white mt-0.5">
                      {comparativo.totalFiorino > 0 
                        ? `R$ ${comparativo.totalFiorino.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                        : 'Sob Consulta'}
                    </p>
                  </div>
                </div>

                <div className="text-xs text-slate-300 leading-relaxed border-t border-white/10 pt-2 flex items-center gap-1.5">
                  <Info className="h-4 w-4 text-cyan-400 shrink-0" />
                  <span>
                    Para esta carga de <strong>{pesoKg} kg</strong>, enviar por modalidade <strong>{comparativo.recomendacao === 'fracionado' ? 'Fracionada' : 'Dedicada'}</strong> gera o menor custo total estimado.
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Detailed Calculations Panel (Col 5) */}
          <div className="lg:col-span-5 space-y-6">
            
            {/* Total Highlight Card */}
            <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-md space-y-5 text-center relative overflow-hidden">
              <div className="absolute top-0 right-0 h-24 w-24 bg-cyan-500/10 rounded-full blur-2xl pointer-events-none" />
              
              <span className="text-[10px] font-extrabold tracking-widest text-slate-400 uppercase block">
                CUSTO TOTAL ESTIMADO DO FRETE
              </span>

              {calculoFrete ? (
                <div className="space-y-1">
                  <div className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">
                    R$ {calculoFrete.totalComIcms.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <p className="text-xs font-semibold text-emerald-600 flex items-center justify-center gap-1">
                    <CheckCircle2 className="h-4 w-4" /> Com impostos e ICMS ({calculoFrete.icmsPct}%) inclusos
                  </p>
                </div>
              ) : (
                <p className="text-sm text-slate-400">Selecione uma rota para calcular</p>
              )}

              {/* Lead Time Badge */}
              {calculoFrete && (
                <div className="grid grid-cols-2 gap-2 pt-2 text-xs border-t border-slate-100">
                  <div className="p-2.5 bg-slate-50 rounded-xl">
                    <span className="text-[9px] font-bold text-slate-400 block uppercase">Lead Time Entrega</span>
                    <span className="font-bold text-slate-800">{calculoFrete.leadTime} dias</span>
                  </div>
                  <div className="p-2.5 bg-slate-50 rounded-xl">
                    <span className="text-[9px] font-bold text-slate-400 block uppercase">Modalidade</span>
                    <span className="font-bold text-slate-800 capitalize">{modalidade}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Detailed Itemized Table */}
            {calculoFrete && (
              <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 border-b border-slate-100 pb-2">
                  Memória Discriminada de Custos
                </h3>

                <div className="space-y-2.5 text-xs">
                  
                  {/* Frete Base */}
                  <div className="flex justify-between items-center py-1 border-b border-slate-100/60">
                    <div>
                      <span className="font-bold text-slate-800 block">Frete Base / Frete Peso</span>
                      <span className="text-[10px] text-slate-400">{calculoFrete.faixaDesc}</span>
                    </div>
                    <span className="font-bold text-slate-900">R$ {calculoFrete.freteBase.toFixed(2)}</span>
                  </div>

                  {/* Ad Valorem */}
                  <div className="flex justify-between items-center py-1 border-b border-slate-100/60">
                    <div>
                      <span className="font-semibold text-slate-700 block">Ad Valorem (Seguro)</span>
                      <span className="text-[10px] text-slate-400">{calculoFrete.adValoresPct}% sobre R$ {valorMercadoria.toLocaleString('pt-BR')}</span>
                    </div>
                    <span className="font-semibold text-slate-800">R$ {calculoFrete.adValoresValor.toFixed(2)}</span>
                  </div>

                  {/* Pedágio */}
                  <div className="flex justify-between items-center py-1 border-b border-slate-100/60">
                    <div>
                      <span className="font-semibold text-slate-700 block">Pedágio</span>
                      <span className="text-[10px] text-slate-400">{calculoFrete.fracoes100kg} fração(ões) de 100kg (R$ {calculoFrete.taxaPedagioFracao.toFixed(2)}/100kg)</span>
                    </div>
                    <span className="font-semibold text-slate-800">R$ {calculoFrete.pedagioTotal.toFixed(2)}</span>
                  </div>

                  {/* CAT */}
                  {calculoFrete.cat > 0 && (
                    <div className="flex justify-between items-center py-1 border-b border-slate-100/60">
                      <span className="font-medium text-slate-600">Taxa CAT</span>
                      <span className="font-semibold text-slate-800">R$ {calculoFrete.cat.toFixed(2)}</span>
                    </div>
                  )}

                  {/* ITR/TAS */}
                  {calculoFrete.itrTas > 0 && (
                    <div className="flex justify-between items-center py-1 border-b border-slate-100/60">
                      <span className="font-medium text-slate-600">Taxa ITR / TAS</span>
                      <span className="font-semibold text-slate-800">R$ {calculoFrete.itrTas.toFixed(2)}</span>
                    </div>
                  )}

                  {/* Taxa Fixa */}
                  {calculoFrete.taxaFixa > 0 && (
                    <div className="flex justify-between items-center py-1 border-b border-slate-100/60">
                      <span className="font-medium text-slate-600">Taxa Fixa / Redespacho</span>
                      <span className="font-semibold text-slate-800">R$ {calculoFrete.taxaFixa.toFixed(2)}</span>
                    </div>
                  )}

                  {/* Subtotal */}
                  <div className="flex justify-between items-center py-2 bg-slate-50 px-3 rounded-lg font-bold text-slate-800">
                    <span>Subtotal Líquido (sem impostos)</span>
                    <span>R$ {calculoFrete.subtotalSemIcms.toFixed(2)}</span>
                  </div>

                  {/* ICMS */}
                  <div className="flex justify-between items-center py-1 border-b border-slate-100/60 text-cyan-900">
                    <div>
                      <span className="font-semibold block">ICMS Embutido ({calculoFrete.icmsPct}%)</span>
                      <span className="text-[10px] text-slate-400">Alíquota fiscal aplicável no destino</span>
                    </div>
                    <span className="font-bold">R$ {calculoFrete.valorIcms.toFixed(2)}</span>
                  </div>

                  {/* Total Final */}
                  <div className="flex justify-between items-center py-3 bg-cyan-600 text-white px-3 rounded-xl font-black text-sm shadow-sm">
                    <span>TOTAL DO FRETE</span>
                    <span>R$ {calculoFrete.totalComIcms.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
}
