/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { X, Copy, Check, ExternalLink, Calendar, User, Package, FileText, Phone, Mail, Clock, Save, RefreshCw } from 'lucide-react';
import { EnrichedSAPRecord, FornecedorMaterialRow, ItemStatus } from '../types';
import { localDb } from '../db/localDb';
import { supabase } from '../db/supabaseClient';

interface SapDetailModalProps {
  record: EnrichedSAPRecord;
  fornecedores: FornecedorMaterialRow[];
  onClose: () => void;
  onUpdate?: () => void;
}

const itemStatusOptions: ItemStatus[] = [
  'Aguardando Cotação',
  'Cotação enviada',
  'Análise de Cotações',
  'Aguardando Aprovação PO',
  'Pedido Enviado',
  'Aguardando Coleta',
  'Em rota de entrega',
  'Entregue',
  'Inativo',
  'Aguardando Solicitante'
];

export default function SapDetailModal({ record, fornecedores, onClose, onUpdate }: SapDetailModalProps) {
  const [techText, setTechText] = useState<string>('');
  const [isLoadingTechText, setIsLoadingTechText] = useState(false);
  const [auditHistory, setAuditHistory] = useState<any[]>([]);

  // Edição inline de Status do Item e Observações do comprador
  const [statusInput, setStatusInput] = useState<ItemStatus | ''>(record.item_status || 'Aguardando Cotação');
  const [obsInput, setObsInput] = useState<string>(record.obs_comprador || '');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');

  useEffect(() => {
    setStatusInput(record.item_status || 'Aguardando Cotação');
    setObsInput(record.obs_comprador || '');
  }, [record.ri]);

  const handleSaveBuyerFields = () => {
    setSaveState('saving');
    localDb.updateBuyerFields(record.ri, obsInput, record.data_entrega_prevista || '', statusInput);
    setAuditHistory(localDb.getObsHistory(record.ri).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
    setTimeout(() => {
      setSaveState('saved');
      onUpdate?.();
      setTimeout(() => setSaveState('idle'), 1500);
    }, 300);
  };

  useEffect(() => {
    if (!record.material_code) return;

    setIsLoadingTechText(true);
    supabase
      .from('materials')
      .select('technical_text')
      .eq('material_code', record.material_code)
      .maybeSingle()
      .then(({ data, error }) => {
        if (data?.technical_text) {
          setTechText(data.technical_text);
        }
      })
      .catch(err => console.warn('Erro ao buscar texto técnico no Supabase:', err))
      .finally(() => setIsLoadingTechText(false));
  }, [record.material_code]);

  useEffect(() => {
    const hist = localDb.getObsHistory(record.ri);
    setAuditHistory(hist.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
  }, [record.ri]);

  const [copiedCompra, setCopiedCompra] = useState(false);

  const handleCopyCompra = async () => {
    const headers = "Cód. Material\tTexto Breve\tQtd\tTexto Técnico";
    const dataRow = `${record.material_code || ''}\t${record.texto_breve || ''}\t${record.qtd_requisicao || ''} ${record.unidade_medida || ''}\t${techText || ''}`;
    const tsv = `${headers}\n${dataRow}`;
    
    try {
      await navigator.clipboard.writeText(tsv);
      setCopiedCompra(true);
      setTimeout(() => setCopiedCompra(false), 2000);
    } catch (err) {
      console.error('Falha ao copiar compra:', err);
    }
  };

  // Configuração de acessibilidade para fechar com tecla ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    // Impede o scroll do body quando o modal está aberto
    document.body.style.overflow = 'hidden';
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  // Função para fechar clicando fora do modal
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  // Componente inline de cópia rápida
  const CopyButton = ({ text, label }: { text: string; label: string }) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = async (e: React.MouseEvent) => {
      e.stopPropagation();
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        console.error('Falha ao copiar:', err);
      }
    };

    return (
      <button
        onClick={handleCopy}
        className="inline-flex items-center gap-1 p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors relative group cursor-pointer"
        title={`Copiar ${label}`}
      >
        {copied ? (
          <>
            <Check className="h-3 w-3 text-emerald-650 dark:text-emerald-450" />
            <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-850 dark:bg-slate-700 text-white text-[10px] py-1 px-1.5 rounded shadow-md whitespace-nowrap z-50">
              Copiado!
            </span>
          </>
        ) : (
          <Copy className="h-3 w-3" />
        )}
      </button>
    );
  };

  const formatPreco = (v?: number | null): string =>
    v === undefined || v === null || isNaN(v)
      ? '—'
      : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  return (
    <div
      onClick={handleOverlayClick}
      className="fixed inset-0 bg-slate-900/60 dark:bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sap-modal-title"
    >
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-3xl max-h-[90vh] shadow-2xl flex flex-col overflow-hidden animate-scale-up">
        {/* Header */}
        <div className="px-6 py-4.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
          <div className="min-w-0">
            <h3 id="sap-modal-title" className="text-base font-extrabold text-slate-850 dark:text-slate-50 flex items-center gap-2">
              <Package className="h-5 w-5 text-emerald-600 dark:text-emerald-500" />
              Detalhamento SAP do Item
            </h3>
            <div className="flex items-center gap-2 mt-1 text-xs text-slate-500 flex-wrap">
              <span className="font-mono font-bold">RM: {record.requisicao_de_compra || '—'}</span>
              <span>•</span>
              <span className="font-mono font-bold">Item: {record.item_reqc || '—'}</span>
              {record.status_requisicao === 'Processado' ? (
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wide bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 border border-blue-250 dark:border-blue-900/50"
                  title={`PO ${record.documento_compra || '—'} emitida em ${record.data_pedido ? new Date(record.data_pedido).toLocaleDateString('pt-BR') : '—'}`}
                >
                  <Check className="h-3 w-3 shrink-0" />
                  PO {record.documento_compra || '—'}{record.data_pedido ? ` • ${new Date(record.data_pedido).toLocaleDateString('pt-BR')}` : ''}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wide bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border border-rose-250 dark:border-rose-900/50">
                  Sem PO
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-slate-400 hover:text-slate-650 dark:hover:text-slate-300 transition-colors cursor-pointer"
            aria-label="Fechar modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content (Scrollable) */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Material & Descrição completa */}
          <div className="bg-slate-50/80 dark:bg-slate-950 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4 shadow-2xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-900 pb-3">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 rounded-lg">
                  Material SAP
                </span>
                <span className="font-mono text-sm font-black text-slate-800 dark:text-slate-200">
                  {record.material_code || 'Sem código'}
                </span>
                {record.material_code && <CopyButton text={record.material_code} label="código do material" />}
              </div>
              
              {/* Botão Copiar Compra */}
              <button
                onClick={handleCopyCompra}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-xs active:scale-95 cursor-pointer ${
                  copiedCompra 
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-450 border border-emerald-200' 
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                }`}
              >
                {copiedCompra ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copiedCompra ? 'Copiado para o Excel!' : 'Copiar Compra'}</span>
              </button>
            </div>

            <div className="space-y-2 text-left">
              <div className="flex items-start justify-between gap-4">
                <p className="text-base font-extrabold text-slate-900 dark:text-slate-50 leading-snug">
                  {record.texto_breve || '—'}
                </p>
                {record.texto_breve && <CopyButton text={record.texto_breve} label="descrição" />}
              </div>
              
              {record.campos_extras?.['texto_completo'] && (
                <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-900">
                  <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 block mb-1">
                    Texto Completo / Detalhado
                  </span>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed whitespace-pre-wrap bg-white/40 dark:bg-slate-900/20 p-2.5 rounded-lg border border-slate-150/40 dark:border-slate-850">
                    {record.campos_extras['texto_completo']}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Texto Técnico do Catálogo SAP */}
          {(techText || isLoadingTechText) && (
            <div className="bg-slate-50/60 dark:bg-slate-950 p-4.5 rounded-xl border border-slate-150 dark:border-slate-850 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Texto Técnico do Catálogo SAP
                </span>
                {techText && <CopyButton text={techText} label="texto técnico" />}
              </div>
              {isLoadingTechText ? (
                <p className="text-xs text-slate-400 animate-pulse">Carregando especificações...</p>
              ) : (
                <p className="text-xs text-slate-650 dark:text-slate-350 leading-relaxed font-mono whitespace-pre-wrap max-h-40 overflow-y-auto pr-1 bg-white dark:bg-slate-900/40 p-3 rounded-lg border border-slate-100 dark:border-slate-800">
                  {techText}
                </p>
              )}
            </div>
          )}

          {/* Dados Técnicos SAP */}
          <div className="space-y-3">
            <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-450 dark:text-slate-500">
              Dados Operacionais do Registro
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3.5 text-xs">
              <div className="space-y-0.5">
                <span className="text-slate-400 dark:text-slate-500 block">Qtd. Solicitada</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">{record.qtd_requisicao} {record.unidade_medida}</span>
              </div>
              <div className="space-y-0.5">
                <span className="text-slate-400 dark:text-slate-500 block">Natureza (Doc)</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">{record.natureza} ({record.tipo_documento || '—'})</span>
              </div>
              <div className="space-y-0.5">
                <span className="text-slate-400 dark:text-slate-500 block">Grupo de Compradores</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">{record.grupo_comprador || '—'}</span>
              </div>
              <div className="space-y-0.5">
                <span className="text-slate-400 dark:text-slate-500 block">Data Solicitação</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">
                  {record.data_solicitacao ? new Date(record.data_solicitacao).toLocaleDateString('pt-BR') : '—'}
                </span>
              </div>
              <div className="space-y-0.5">
                <span className="text-slate-400 dark:text-slate-500 block">Data Limite Remessa</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">
                  {record.data_remessa ? new Date(record.data_remessa).toLocaleDateString('pt-BR') : '—'}
                </span>
              </div>
              <div className="space-y-0.5">
                <span className="text-slate-400 dark:text-slate-500 block">Requisitante</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">{record.requisitante_name || '—'}</span>
              </div>
              <div className="space-y-0.5">
                <span className="text-slate-400 dark:text-slate-500 block">Dias em Aberto</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">{record.dias_em_aberto} dias</span>
              </div>
              <div className="space-y-0.5">
                <span className="text-slate-400 dark:text-slate-500 block">Última Modificação Status</span>
                <span className="text-[11px] font-bold text-slate-850 dark:text-slate-300">
                  {record.item_status_updated_at 
                    ? `${new Date(record.item_status_updated_at).toLocaleDateString('pt-BR')} por ${record.item_status_updated_by || 'Sistema'}` 
                    : '—'}
                </span>
              </div>
            </div>
          </div>

          {/* Edição do Comprador: Status do Item & Observações */}
          <div className="space-y-3 pt-4 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-450 dark:text-slate-500">
                Atualização do Comprador
              </h4>
              {record.item_status_updated_at && (
                <span className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold">
                  Últ. alt.: {new Date(record.item_status_updated_at).toLocaleDateString('pt-BR')} por {record.item_status_updated_by || 'Sistema'}
                </span>
              )}
            </div>
            <div className="bg-slate-50/60 dark:bg-slate-950 p-4 rounded-xl border border-slate-150 dark:border-slate-850 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-extrabold uppercase text-slate-400 dark:text-slate-500 tracking-wider block">
                    Status do Item
                  </label>
                  <select
                    value={statusInput}
                    onChange={(e) => setStatusInput(e.target.value as ItemStatus | '')}
                    className="w-full text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 py-2 px-2.5 focus:border-emerald-600 focus:outline-none"
                  >
                    <option value="">Selecione</option>
                    {itemStatusOptions.map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-extrabold uppercase text-slate-400 dark:text-slate-500 tracking-wider block">
                  Observações
                </label>
                <textarea
                  value={obsInput}
                  onChange={(e) => setObsInput(e.target.value)}
                  rows={3}
                  placeholder="Notas de compra..."
                  className="w-full text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 py-2 px-2.5 focus:border-emerald-600 focus:outline-none"
                />
              </div>
              <div className="flex justify-end">
                <button
                  onClick={handleSaveBuyerFields}
                  disabled={saveState === 'saving'}
                  type="button"
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer ${
                    saveState === 'saved'
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/30'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  }`}
                >
                  {saveState === 'saving' && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                  {saveState === 'saved' && <Check className="h-3.5 w-3.5" />}
                  {saveState === 'idle' && <Save className="h-3.5 w-3.5" />}
                  <span>{saveState === 'saving' ? 'Salvando...' : saveState === 'saved' ? 'Salvo!' : 'Salvar Alterações'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Dados do Pedido (se processado) */}
          {record.status_requisicao === 'Processado' && (
            <div className="space-y-3 pt-4 border-t border-slate-100 dark:border-slate-800">
              <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-450 dark:text-slate-500">
                Informações do Pedido de Compra (PO)
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3.5 text-xs bg-emerald-50/20 dark:bg-emerald-950/5 p-4 rounded-xl border border-emerald-100/40 dark:border-emerald-900/20">
                <div className="space-y-0.5">
                  <span className="text-slate-400 dark:text-slate-500 block">Número do Pedido</span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono font-bold text-emerald-700 dark:text-emerald-450">{record.documento_compra || '—'}</span>
                    {record.documento_compra && <CopyButton text={record.documento_compra} label="número do pedido" />}
                  </div>
                </div>
                <div className="space-y-0.5">
                  <span className="text-slate-400 dark:text-slate-500 block">Código Fornecedor</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">{record.fornecedor_code || '—'}</span>
                </div>
                <div className="space-y-0.5">
                  <span className="text-slate-400 dark:text-slate-500 block">Razão Social Fornecedor</span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-slate-800 dark:text-slate-200 truncate max-w-[150px]">{record.fornecedor_name || '—'}</span>
                    {record.fornecedor_name && <CopyButton text={record.fornecedor_name} label="nome do fornecedor" />}
                  </div>
                </div>
                <div className="space-y-0.5">
                  <span className="text-slate-400 dark:text-slate-500 block">Data Pedido</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    {record.data_pedido ? new Date(record.data_pedido).toLocaleDateString('pt-BR') : '—'}
                  </span>
                </div>
                <div className="space-y-0.5">
                  <span className="text-slate-400 dark:text-slate-500 block">Prazo Entrega SAP</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    {record.data_entrega_sap ? new Date(record.data_entrega_sap).toLocaleDateString('pt-BR') : '—'}
                  </span>
                </div>
                <div className="space-y-0.5">
                  <span className="text-slate-400 dark:text-slate-500 block">Status de Entrega</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">{record.campos_extras?.['status_entrega'] || 'Não Recebido'}</span>
                </div>
              </div>
            </div>
          )}

          {/* Histórico de Fornecedores */}
          <div className="space-y-3 pt-4 border-t border-slate-100 dark:border-slate-800">
            <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-455 dark:text-slate-500">
              Fornecedores Históricos ({fornecedores.length})
            </h4>
            {fornecedores.length === 0 ? (
              <div className="py-6 text-center rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-slate-400 text-xs">
                Nenhum fornecedor registrado anteriormente para este material.
              </div>
            ) : (
              <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
                {fornecedores.map((f, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50/30 dark:bg-slate-950/20 hover:bg-slate-50 dark:hover:bg-slate-950/40 transition-all flex flex-col md:flex-row md:items-center md:justify-between gap-3 text-xs text-left"
                  >
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-extrabold text-slate-850 dark:text-slate-100 truncate max-w-[200px]" title={f.fornecedor}>
                          {f.fornecedor}
                        </span>
                        {f.regiao_uf && f.regiao_uf !== '—' && (
                          <span className="px-1.5 py-0.2 bg-slate-100 dark:bg-slate-800 text-[9px] font-black rounded text-slate-500 dark:text-slate-400">
                            {f.regiao_uf}
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold">
                        Cód: {f.cod_forn} | CNPJ: {f.cnpj || '—'}
                      </p>
                      
                      {/* Preço e última compra */}
                      <div className="flex items-center gap-2 text-[10px] text-slate-600 dark:text-slate-400 font-bold bg-white dark:bg-slate-900 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-800 w-fit shadow-3xs">
                        <span>Preço: <span className="text-emerald-600 dark:text-emerald-450">{formatPreco(f.preco_liquido)}</span></span>
                        <span className="text-slate-200 dark:text-slate-800">|</span>
                        <span className="flex items-center gap-0.5 text-slate-500 dark:text-slate-450">
                          <Calendar className="h-3 w-3" />
                          Compra: {f.ultima_data !== '—' ? (isNaN(Date.parse(f.ultima_data)) ? f.ultima_data : new Date(f.ultima_data).toLocaleDateString('pt-BR')) : '—'}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-col gap-1.5 shrink-0 text-[11px] items-start md:items-end">
                      {f.telefone !== '—' && (
                        <div className="flex items-center gap-1.5 bg-white dark:bg-slate-900 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-800 shadow-3xs">
                          <Phone className="h-3 w-3 text-slate-450" />
                          <a
                            href={`tel:${f.telefone}`}
                            className="font-mono text-slate-705 dark:text-slate-300 hover:underline hover:text-emerald-650 cursor-pointer"
                            title={`Ligar: ${f.telefone}`}
                          >
                            {f.telefone}
                          </a>
                          <CopyButton text={f.telefone} label="telefone" />
                        </div>
                      )}
                      {f.email !== '—' && (
                        <div className="flex items-center gap-1.5 bg-white dark:bg-slate-900 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-800 shadow-3xs">
                          <Mail className="h-3 w-3 text-slate-450" />
                          <a
                            href={`mailto:${f.email}`}
                            className="text-slate-705 dark:text-slate-305 hover:underline hover:text-blue-650 truncate max-w-[130px] cursor-pointer"
                            title={`Email: ${f.email}`}
                          >
                            {f.email}
                          </a>
                          <CopyButton text={f.email} label="e-mail" />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Histórico de Alterações do Comprador */}
          <div className="space-y-3 pt-4 border-t border-slate-100 dark:border-slate-800">
            <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-450 dark:text-slate-500 flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-slate-450 dark:text-slate-500" />
              Histórico de Alterações do Comprador ({auditHistory.length})
            </h4>
            {auditHistory.length === 0 ? (
              <div className="py-4 text-center rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-slate-400 text-xs">
                Nenhuma alteração anterior registrada para este item.
              </div>
            ) : (
              <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
                {auditHistory.map((h, idx) => (
                  <div
                    key={h.id || idx}
                    className="p-3 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50/40 dark:bg-slate-900/40 text-xs space-y-2 text-left"
                  >
                    <div className="flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500 font-semibold border-b border-slate-100 dark:border-slate-800 pb-1.5">
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {h.user_name || 'Sistema'}
                      </span>
                      <span>
                        {new Date(h.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      {h.item_status && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase">Status:</span>
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/30">
                            {h.item_status}
                          </span>
                        </div>
                      )}
                      {h.obs_comprador && (
                        <div>
                          <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase block mb-0.5">Observações:</span>
                          <p className="text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-950 p-2 rounded border border-slate-100 dark:border-slate-850 whitespace-pre-wrap">{h.obs_comprador}</p>
                        </div>
                      )}
                      {h.data_entrega_prevista && (
                        <div className="flex items-center gap-1">
                          <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase">Entrega Prevista:</span>
                          <span className="font-bold text-slate-700 dark:text-slate-350">{new Date(h.data_entrega_prevista).toLocaleDateString('pt-BR')}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4.5 bg-slate-50 dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4.5 py-2 bg-slate-850 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-750 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-98"
          >
            Fechar Janela
          </button>
        </div>
      </div>
    </div>
  );
}
