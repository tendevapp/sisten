/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Modal de visualização detalhada de uma cotação histórica:
 * Permite visualizar toda a cotação comercial, incluindo seus itens catalogados,
 * dados cadastrais e fiscais do cliente e fornecedor, condições comerciais,
 * espelho de impressão/PDF e pré-visualização do documento original (PDF).
 */

import React, { useEffect, useState, useMemo, useRef } from 'react';
import {
  Building2, Calendar, DollarSign, Mail, Phone, Truck,
  FileText, Package, Clock, ShieldCheck, AlertCircle, X,
  Printer, ExternalLink, Upload, ArrowUpRight, CheckCircle2,
  FileSearch, Info, Eye, Layers, CreditCard
} from 'lucide-react';
import Modal, { ModalHeader, ModalBody, ModalFooter } from '../ui/Modal';
import { supabase } from '../../db/supabaseClient';
import { formatBRL, formatDateTimeBR } from '../../lib/format';
import type { ItemHistoricoCotacao, PropostaHistoricaResumo } from '../../lib/cotacoesHistoricoApi';

interface CotacaoHistoricoDetalhesModalProps {
  item?: ItemHistoricoCotacao | null;
  propostaResumo?: PropostaHistoricaResumo | null;
  onClose: () => void;
  onNavigate?: (path: string) => void;
}

interface ItemCompletoProposta {
  id: string;
  item_numero: number | null;
  codigo_produto: string | null;
  descricao_produto: string;
  marca_fabricante: string | null;
  unidade_medida: string | null;
  ncm: string | null;
  quantidade: number | null;
  preco_unitario: number | null;
  preco_total_item: number | null;
  aliquota_icms_pct: number | null;
  aliquota_pis_pct: number | null;
  aliquota_cofins_pct: number | null;
}

export default function CotacaoHistoricoDetalhesModal({
  item,
  propostaResumo,
  onClose,
  onNavigate,
}: CotacaoHistoricoDetalhesModalProps) {
  // Unifica a referência da proposta
  const p = useMemo(() => {
    if (propostaResumo) return propostaResumo;
    if (item?.proposta) return item.proposta;
    return null;
  }, [item, propostaResumo]);

  const propostaId = p?.id || item?.proposta_id;

  const [itensProposta, setItensProposta] = useState<ItemCompletoProposta[]>([]);
  const [carregandoItens, setCarregandoItens] = useState(false);
  const [abaAtiva, setAbaAtiva] = useState<'itens' | 'comercial' | 'documento'>('itens');
  const [modoEspelho, setModoEspelho] = useState(false);

  // Arquivo PDF original em memória da sessão
  const [arquivoPdf, setArquivoPdf] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fileUrl = useMemo(() => {
    if (!arquivoPdf) return null;
    return URL.createObjectURL(arquivoPdf);
  }, [arquivoPdf]);

  useEffect(() => {
    return () => {
      if (fileUrl) URL.revokeObjectURL(fileUrl);
    };
  }, [fileUrl]);

  // Carrega todos os itens da cotação no Supabase
  useEffect(() => {
    async function carregarTodosItens() {
      if (!propostaId) return;
      setCarregandoItens(true);
      try {
        const { data, error } = await supabase
          .from('sup_cotacao_proposta_itens')
          .select('id, item_numero, codigo_produto, descricao_produto, marca_fabricante, unidade_medida, ncm, quantidade, preco_unitario, preco_total_item, aliquota_icms_pct, aliquota_pis_pct, aliquota_cofins_pct')
          .eq('proposta_id', propostaId)
          .order('item_numero', { ascending: true });

        if (!error && data) {
          setItensProposta(data as ItemCompletoProposta[]);
        }
      } catch (err) {
        console.error('Falha ao carregar itens da proposta:', err);
      } finally {
        setCarregandoItens(false);
      }
    }
    carregarTodosItens();
  }, [propostaId]);

  // Soma calculada dos itens da cotação
  const somaItensCalculada = useMemo(() => {
    const lista = itensProposta.length > 0 ? itensProposta : (item ? [item] : []);
    return lista.reduce((acc, it) => acc + (it.preco_total_item || 0), 0);
  }, [itensProposta, item]);

  const valorTotalOrcamento = p?.valor_total_orcamento ?? null;
  const diferencaValores = valorTotalOrcamento != null && Math.abs(valorTotalOrcamento - somaItensCalculada) > 1.0;

  const handleSelecionarArquivo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setArquivoPdf(file);
      setAbaAtiva('documento');
    }
  };

  return (
    <Modal onClose={onClose} maxWidth="max-w-5xl" ariaLabel="Detalhes completos da cotação">
      <ModalHeader onClose={onClose}>
        <div className="flex flex-wrap items-center justify-between gap-3 pr-2 w-full">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-50">
                  {p?.fornecedor_razao_social || 'Fornecedor não identificado'}
                </h3>
                {p?.numero_proposta && (
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    Proposta Nº {p.numero_proposta}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {p?.arquivo_origem ? `Arquivo de origem: ${p.arquivo_origem}` : 'Cotação catalogada no banco de dados'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setModoEspelho(!modoEspelho)}
              title="Visualizar espelho completo da cotação comercial"
              className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors ${
                modoEspelho
                  ? 'bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700'
                  : 'border-slate-200 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              <Eye className="h-3.5 w-3.5" />
              {modoEspelho ? 'Voltar para painel' : 'Espelho da Cotação'}
            </button>

            {onNavigate && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onNavigate('/suprimentos/cotacoes');
                }}
                title="Abrir módulo de processos de cotação"
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors"
              >
                <ArrowUpRight className="h-3.5 w-3.5" />
                Módulo Cotações
              </button>
            )}
          </div>
        </div>
      </ModalHeader>

      <ModalBody className="space-y-4">
        {/* Visualização de Espelho Completo / Impressão */}
        {modoEspelho ? (
          <div className="space-y-4 bg-white p-6 rounded-2xl border border-slate-200 text-slate-800 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-100 shadow-sm print:p-0 print:border-0">
            <div className="flex justify-between items-center border-b pb-4 dark:border-slate-800">
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-indigo-600 dark:text-indigo-400 block">SISTEN · Inteligência de Compras</span>
                <h2 className="text-lg font-black text-slate-900 dark:text-white">Espelho da Proposta Comercial</h2>
                <p className="text-xs text-slate-500">Documento catalogado em {p?.data_emissao ? formatDateTimeBR(p.data_emissao).split(' ')[0] : 'Data não informada'}</p>
              </div>
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white transition-colors print:hidden"
              >
                <Printer className="h-3.5 w-3.5" />
                Imprimir Cotação
              </button>
            </div>

            {/* Cabeçalho do Espelho em 2 colunas: Fornecedor e Cliente */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs border-b pb-4 dark:border-slate-800">
              <div className="space-y-1">
                <span className="font-bold text-slate-900 dark:text-white uppercase text-[10px] tracking-wider block">Dados do Fornecedor</span>
                <p className="font-semibold text-sm">{p?.fornecedor_razao_social || '—'}</p>
                <p><strong className="text-slate-500">CNPJ:</strong> {p?.fornecedor_cnpj || '—'}</p>
                <p><strong className="text-slate-500">Inscrição Estadual:</strong> {p?.fornecedor_inscricao_estadual || 'Isento / Não informada'}</p>
                <p><strong className="text-slate-500">Localização:</strong> {[p?.fornecedor_cidade, p?.fornecedor_uf].filter(Boolean).join(' - ') || '—'}</p>
                <p><strong className="text-slate-500">Contato:</strong> {p?.vendedor_nome || '—'} {p?.vendedor_telefone ? `· ${p.vendedor_telefone}` : ''}</p>
                {p?.vendedor_email && <p><strong className="text-slate-500">E-mail:</strong> {p.vendedor_email}</p>}
              </div>

              <div className="space-y-1">
                <span className="font-bold text-slate-900 dark:text-white uppercase text-[10px] tracking-wider block">Faturamento / Cliente</span>
                <p className="font-semibold text-sm">{p?.cliente_razao_social || 'TORRES EOLICAS DO NORDESTE S/A'}</p>
                <p><strong className="text-slate-500">CNPJ Cliente:</strong> {p?.cliente_cnpj || '13.892.216/0002-31'}</p>
                <p><strong className="text-slate-500">Inscrição Estadual:</strong> {p?.cliente_inscricao_estadual || 'Não informada'}</p>
                <p><strong className="text-slate-500">Condição de Pagamento:</strong> {p?.condicao_pagamento || p?.forma_pagamento || 'A combinar'}</p>
                <p><strong className="text-slate-500">Modalidade de Frete:</strong> {p?.frete_modalidade || 'FOB'} {p?.transportadora_indicada ? `(Transp: ${p.transportadora_indicada})` : ''}</p>
                <p><strong className="text-slate-500">Prazo de Entrega:</strong> {p?.prazo_entrega_texto || 'Imediato'}</p>
              </div>
            </div>

            {/* Tabela de Itens no Espelho */}
            <div className="space-y-2">
              <span className="font-bold text-slate-900 dark:text-white uppercase text-[10px] tracking-wider block">
                Grade de Produtos e Preços ({itensProposta.length > 0 ? itensProposta.length : 1} itens)
              </span>
              <table className="w-full text-left text-xs border border-slate-200 dark:border-slate-800">
                <thead className="bg-slate-50 dark:bg-slate-800 text-[10px] font-bold uppercase">
                  <tr>
                    <th className="p-2 border-b">#</th>
                    <th className="p-2 border-b">Descrição</th>
                    <th className="p-2 border-b">Marca/NCM</th>
                    <th className="p-2 border-b text-right">Qtd</th>
                    <th className="p-2 border-b text-right">Preço Unit.</th>
                    <th className="p-2 border-b text-right">Preço Total</th>
                    <th className="p-2 border-b text-right">Impostos</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {(itensProposta.length > 0 ? itensProposta : (item ? [item] : [])).map((it, idx) => (
                    <tr key={it.id || idx}>
                      <td className="p-2 text-slate-500">{it.item_numero ?? idx + 1}</td>
                      <td className="p-2 font-medium">{it.descricao_produto}</td>
                      <td className="p-2 text-slate-500">{it.marca_fabricante || '—'} {it.ncm ? `(${it.ncm})` : ''}</td>
                      <td className="p-2 text-right">{it.quantidade ?? 1} {it.unidade_medida || 'UN'}</td>
                      <td className="p-2 text-right font-semibold text-emerald-600 dark:text-emerald-400">{it.preco_unitario != null ? formatBRL(it.preco_unitario) : '—'}</td>
                      <td className="p-2 text-right font-bold">{it.preco_total_item != null ? formatBRL(it.preco_total_item) : '—'}</td>
                      <td className="p-2 text-right text-[11px] text-slate-500">
                        {[
                          it.aliquota_icms_pct != null ? `ICMS ${it.aliquota_icms_pct}%` : null,
                          it.aliquota_pis_pct != null ? `PIS ${it.aliquota_pis_pct}%` : null,
                          it.aliquota_cofins_pct != null ? `COF ${it.aliquota_cofins_pct}%` : null,
                        ].filter(Boolean).join(' · ') || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 dark:bg-slate-800 font-bold">
                    <td colSpan={5} className="p-2 text-right uppercase text-[10px]">Total do Orçamento Registrado:</td>
                    <td colSpan={2} className="p-2 text-right text-sm text-emerald-700 dark:text-emerald-400">
                      {formatBRL(valorTotalOrcamento ?? somaItensCalculada)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {p?.observacoes_gerais && (
              <div className="border-t pt-3 text-xs text-slate-600 dark:text-slate-400 dark:border-slate-800">
                <strong>Observações Gerais:</strong> {p.observacoes_gerais}
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Navegador de Abas */}
            <div className="flex border-b border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setAbaAtiva('itens')}
                className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-bold transition-colors ${
                  abaAtiva === 'itens'
                    ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                    : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                <Package className="h-4 w-4" />
                Itens da Proposta ({itensProposta.length > 0 ? itensProposta.length : 1})
              </button>

              <button
                type="button"
                onClick={() => setAbaAtiva('comercial')}
                className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-bold transition-colors ${
                  abaAtiva === 'comercial'
                    ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                    : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                <Building2 className="h-4 w-4" />
                Dados Comerciais & Fiscais
              </button>

              <button
                type="button"
                onClick={() => setAbaAtiva('documento')}
                className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-bold transition-colors ${
                  abaAtiva === 'documento'
                    ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                    : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                <FileSearch className="h-4 w-4" />
                Documento Original {arquivoPdf && '(Carregado)'}
              </button>
            </div>

            {/* Painel com 3 Cards de Resumo */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Card 1: Fornecedor e Localização */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-950/50 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
                  <Building2 className="h-4 w-4 text-indigo-500" />
                  Fornecedor
                </div>
                <div className="text-xs space-y-1 text-slate-600 dark:text-slate-400">
                  <p>
                    <span className="font-semibold text-slate-700 dark:text-slate-200">CNPJ: </span>
                    {p?.fornecedor_cnpj || 'Não informado'}
                  </p>
                  <p>
                    <span className="font-semibold text-slate-700 dark:text-slate-200">Localização: </span>
                    {[p?.fornecedor_cidade, p?.fornecedor_uf].filter(Boolean).join(' / ') || 'Não informada'}
                  </p>
                  {p?.fornecedor_telefone && (
                    <p>
                      <span className="font-semibold text-slate-700 dark:text-slate-200">Telefone: </span>
                      {p.fornecedor_telefone}
                    </p>
                  )}
                </div>
              </div>

              {/* Card 2: Contato Comercial / Vendedor */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-950/50 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
                  <Mail className="h-4 w-4 text-emerald-500" />
                  Contato do Vendedor
                </div>
                <div className="text-xs space-y-1 text-slate-600 dark:text-slate-400">
                  <p>
                    <span className="font-semibold text-slate-700 dark:text-slate-200">Nome: </span>
                    {p?.vendedor_nome || 'Não informado'}
                  </p>
                  {p?.vendedor_email && (
                    <p className="truncate">
                      <span className="font-semibold text-slate-700 dark:text-slate-200">E-mail: </span>
                      <a href={`mailto:${p.vendedor_email}`} className="text-indigo-600 hover:underline dark:text-indigo-400">
                        {p.vendedor_email}
                      </a>
                    </p>
                  )}
                  {p?.vendedor_telefone && (
                    <p>
                      <span className="font-semibold text-slate-700 dark:text-slate-200">Tel: </span>
                      <a href={`tel:${p.vendedor_telefone}`} className="text-indigo-600 hover:underline dark:text-indigo-400">
                        {p.vendedor_telefone}
                      </a>
                    </p>
                  )}
                </div>
              </div>

              {/* Card 3: Condições Comerciais */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-950/50 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
                  <Truck className="h-4 w-4 text-amber-500" />
                  Condições Comerciais
                </div>
                <div className="text-xs space-y-1 text-slate-600 dark:text-slate-400">
                  <p>
                    <span className="font-semibold text-slate-700 dark:text-slate-200">Pagamento: </span>
                    {p?.condicao_pagamento || p?.forma_pagamento || 'Não informado'}
                  </p>
                  <p>
                    <span className="font-semibold text-slate-700 dark:text-slate-200">Frete: </span>
                    <span className={`font-bold ${p?.frete_modalidade === 'FOB' ? 'text-amber-600' : 'text-emerald-600'}`}>
                      {p?.frete_modalidade || 'Não especificado'}
                    </span>
                  </p>
                  <p>
                    <span className="font-semibold text-slate-700 dark:text-slate-200">Prazo de Entrega: </span>
                    {p?.prazo_entrega_texto || 'Imediato / Conforme proposta'}
                  </p>
                </div>
              </div>
            </div>

            {/* Datas e Totais */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-indigo-50/60 p-3 text-xs text-indigo-950 dark:bg-indigo-950/30 dark:text-indigo-200 border border-indigo-100 dark:border-indigo-900/50">
              <div className="flex flex-wrap items-center gap-4">
                <span className="inline-flex items-center gap-1.5">
                  <Calendar className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                  <strong>Emissão:</strong> {p?.data_emissao ? formatDateTimeBR(p.data_emissao).split(' ')[0] : 'Não informada'}
                </span>
                {p?.validade_texto && (
                  <span className="inline-flex items-center gap-1.5">
                    <Clock className="h-4 w-4 text-slate-500" />
                    <strong>Validade:</strong> {p.validade_texto}
                  </span>
                )}
              </div>
              {valorTotalOrcamento != null && (
                <div className="flex items-center gap-1.5 text-sm font-bold text-emerald-700 dark:text-emerald-400">
                  <span>Valor Total da Cotação:</span>
                  <span className="text-base">{formatBRL(valorTotalOrcamento)}</span>
                </div>
              )}
            </div>

            {/* Alerta de Divergência entre Total Registrado e Itens Catalogados */}
            {diferencaValores && (
              <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50/80 p-3 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
                <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-bold">
                    Valor total registrado no orçamento ({formatBRL(valorTotalOrcamento)}) difere da soma dos itens cadastrados ({formatBRL(somaItensCalculada)}).
                  </p>
                  <p className="text-[11px] text-amber-800 dark:text-amber-400">
                    Nesta base foi catalogado 1 item representativo desta proposta. Para inspecionar todos os itens da cotação na íntegra, consulte a aba <strong>Documento Original</strong> ou abra o PDF correspondente.
                  </p>
                </div>
              </div>
            )}

            {/* CONTEÚDO DA ABA ATIVA */}
            {abaAtiva === 'itens' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <Package className="h-4 w-4 text-indigo-600" />
                    Itens da Proposta ({itensProposta.length > 0 ? itensProposta.length : 1})
                  </h4>
                  {carregandoItens && (
                    <span className="text-[11px] text-slate-400 animate-pulse">Carregando itens...</span>
                  )}
                </div>

                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 text-[11px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300 uppercase tracking-wider">
                      <tr>
                        <th className="py-2.5 px-3">Item</th>
                        <th className="py-2.5 px-3">Descrição do Produto</th>
                        <th className="py-2.5 px-3">Marca / NCM</th>
                        <th className="py-2.5 px-3 text-right">Qtd</th>
                        <th className="py-2.5 px-3 text-right">Preço Unit.</th>
                        <th className="py-2.5 px-3 text-right">Preço Total</th>
                        <th className="py-2.5 px-3 text-right">ICMS / PIS / COFINS</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800 bg-white dark:bg-slate-900">
                      {(itensProposta.length > 0 ? itensProposta : (item ? [item] : [])).map((it, idx) => {
                        const ehItemDestaque = item && it.id === item.id;
                        return (
                          <tr
                            key={it.id || idx}
                            className={ehItemDestaque ? 'bg-indigo-50/50 dark:bg-indigo-950/20' : ''}
                          >
                            <td className="py-2.5 px-3 font-semibold text-slate-500">
                              {it.item_numero ?? idx + 1}
                            </td>
                            <td className="py-2.5 px-3">
                              <div className="font-semibold text-slate-800 dark:text-slate-100">
                                {it.descricao_produto}
                              </div>
                              {it.codigo_produto && (
                                <div className="text-[11px] text-slate-400">
                                  Cód: {it.codigo_produto}
                                </div>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400">
                              <div>{it.marca_fabricante || '—'}</div>
                              {it.ncm && <div className="text-[10px] text-slate-400">NCM: {it.ncm}</div>}
                            </td>
                            <td className="py-2.5 px-3 text-right font-medium text-slate-700 dark:text-slate-300">
                              {it.quantidade ?? 1} {it.unidade_medida || 'UN'}
                            </td>
                            <td className="py-2.5 px-3 text-right font-bold text-emerald-600 dark:text-emerald-400">
                              {it.preco_unitario != null ? formatBRL(it.preco_unitario) : '—'}
                            </td>
                            <td className="py-2.5 px-3 text-right font-bold text-slate-800 dark:text-slate-200">
                              {it.preco_total_item != null ? formatBRL(it.preco_total_item) : '—'}
                            </td>
                            <td className="py-2.5 px-3 text-right text-[11px] text-slate-500">
                              {[
                                it.aliquota_icms_pct != null ? `${it.aliquota_icms_pct}%` : null,
                                it.aliquota_pis_pct != null ? `${it.aliquota_pis_pct}%` : null,
                                it.aliquota_cofins_pct != null ? `${it.aliquota_cofins_pct}%` : null,
                              ].filter(Boolean).join(' · ') || '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="bg-slate-50 dark:bg-slate-800/60 font-bold">
                      <tr>
                        <td colSpan={5} className="py-2.5 px-3 text-right uppercase text-[10px] text-slate-500">
                          Soma dos Itens desta Grade:
                        </td>
                        <td className="py-2.5 px-3 text-right text-emerald-600 dark:text-emerald-400">
                          {formatBRL(somaItensCalculada)}
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {abaAtiva === 'comercial' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Dados de Faturamento / Cliente */}
                <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <Building2 className="h-4 w-4 text-indigo-600" />
                    Dados do Cliente / Faturamento
                  </h4>
                  <div className="text-xs space-y-2 text-slate-600 dark:text-slate-300">
                    <div>
                      <span className="font-semibold text-slate-500 block text-[11px]">Razão Social:</span>
                      <p className="font-medium text-slate-900 dark:text-slate-100">{p?.cliente_razao_social || 'TORRES EOLICAS DO NORDESTE S/A'}</p>
                    </div>
                    <div>
                      <span className="font-semibold text-slate-500 block text-[11px]">CNPJ do Cliente:</span>
                      <p className="font-medium">{p?.cliente_cnpj || '13.892.216/0002-31'}</p>
                    </div>
                    <div>
                      <span className="font-semibold text-slate-500 block text-[11px]">Inscrição Estadual:</span>
                      <p className="font-medium">{p?.cliente_inscricao_estadual || 'Não informada'}</p>
                    </div>
                    <div>
                      <span className="font-semibold text-slate-500 block text-[11px]">Cidade / UF do Faturamento:</span>
                      <p className="font-medium">{[p?.cliente_cidade, p?.cliente_uf].filter(Boolean).join(' / ') || 'Não especificada'}</p>
                    </div>
                  </div>
                </div>

                {/* Condições Financeiras e Bancárias */}
                <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <CreditCard className="h-4 w-4 text-emerald-600" />
                    Condições Financeiras & Logísticas
                  </h4>
                  <div className="text-xs space-y-2 text-slate-600 dark:text-slate-300">
                    <div>
                      <span className="font-semibold text-slate-500 block text-[11px]">Faturamento Mínimo:</span>
                      <p className="font-bold text-slate-900 dark:text-slate-100">
                        {p?.faturamento_minimo != null ? formatBRL(p.faturamento_minimo) : 'Não estipulado'}
                      </p>
                    </div>
                    <div>
                      <span className="font-semibold text-slate-500 block text-[11px]">Transportadora Indicada:</span>
                      <p className="font-medium">{p?.transportadora_indicada || 'A critério / FOB'}</p>
                    </div>
                    <div>
                      <span className="font-semibold text-slate-500 block text-[11px]">Dados Bancários / PIX:</span>
                      <p className="font-mono bg-slate-50 dark:bg-slate-950 p-1.5 rounded border border-slate-100 dark:border-slate-800">
                        {p?.dados_bancarios_pix || 'Conforme dados cadastrais do fornecedor'}
                      </p>
                    </div>
                    {p?.observacoes_gerais && (
                      <div>
                        <span className="font-semibold text-slate-500 block text-[11px]">Observações Gerais da Proposta:</span>
                        <p className="p-2 rounded bg-slate-50 dark:bg-slate-800/50 text-slate-700 dark:text-slate-300">
                          {p.observacoes_gerais}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {abaAtiva === 'documento' && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 p-3 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs">
                  <div>
                    <span className="font-bold text-slate-800 dark:text-slate-200">Arquivo de Origem: </span>
                    <span className="font-mono text-indigo-600 dark:text-indigo-400">{p?.arquivo_origem || 'Documento PDF'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleSelecionarArquivo}
                      accept="application/pdf,image/*"
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    >
                      <Upload className="h-3.5 w-3.5" />
                      {arquivoPdf ? 'Trocar PDF da cotação' : 'Carregar PDF da cotação'}
                    </button>
                    {fileUrl && (
                      <button
                        type="button"
                        onClick={() => window.open(fileUrl, '_blank', 'noopener,noreferrer')}
                        className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Abrir em nova aba
                      </button>
                    )}
                  </div>
                </div>

                {fileUrl ? (
                  <div className="h-[65vh] overflow-hidden rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-900">
                    <iframe
                      src={fileUrl}
                      title={`Documento ${p?.arquivo_origem || 'Cotação'}`}
                      className="h-full w-full border-0 bg-white dark:bg-slate-900"
                    />
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center p-12 text-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/50">
                    <div className="rounded-full bg-indigo-50 p-4 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400 mb-3">
                      <FileText className="h-8 w-8" />
                    </div>
                    <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                      Visualizar o arquivo integral desta cotação
                    </h4>
                    <p className="text-xs text-slate-500 max-w-md mt-1 mb-4">
                      O arquivo original catalogado é <strong>{p?.arquivo_origem || 'o PDF da cotação'}</strong>.
                      Clique no botão abaixo para carregar o arquivo do seu computador e inspecionar todas as páginas e tabelas completas.
                    </p>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-indigo-700 shadow-sm shadow-indigo-600/25"
                    >
                      <Upload className="h-4 w-4" />
                      Localizar e Abrir PDF
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </ModalBody>

      <ModalFooter>
        <div className="flex w-full items-center justify-between">
          <div className="text-xs text-slate-500">
            {p?.numero_proposta && <span>Proposta Nº <strong>{p.numero_proposta}</strong> · </span>}
            <span>{itensProposta.length > 0 ? itensProposta.length : 1} itens catalogados</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setModoEspelho(!modoEspelho)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors"
            >
              {modoEspelho ? 'Voltar aos Detalhes' : 'Ver Espelho Completo'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl bg-slate-900 px-5 py-2 text-xs font-semibold text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white transition-colors"
            >
              Fechar
            </button>
          </div>
        </div>
      </ModalFooter>
    </Modal>
  );
}
