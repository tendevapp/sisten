/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Modal de renegociacao (rodada 2, 3...) para uma proposta ja salva:
 *  1. Anexa novo arquivo (PDF, imagem/print com Ctrl+V, planilha XLSX/CSV,
 *     XML/JSON) ou cola Markdown manualmente;
 *  2. Converte no mesmo pipeline da Analise de Cotacoes (comprimindo imagens
 *     via `comprimirImagemUpload` conforme regra global do SISTEN) e extrai
 *     os novos precos com IA (`extrairCotacao`);
 *  3. Mescla com a rodada anterior (preservando itens nao citados e selecoes
 *     do mapa) e mostra comparativo completo de Saving (diferenca unitaria,
 *     total e %) antes de clicar em "Aceitar nova proposta".
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  UploadCloud, Sparkles, Loader2, Trash2, CheckCircle2, AlertCircle,
  TrendingDown, TrendingUp, ArrowRight, FileText, ChevronDown, ChevronUp,
  Ban, RotateCcw, ShoppingCart, ClipboardPaste,
} from 'lucide-react';
import Modal, { ModalHeader, ModalBody, ModalFooter } from '../ui/Modal';
import { useToast } from '../ui/Toast';
import {
  ACCEPT_CONVERSOR, detectarFormato, converterArquivoParaMarkdown, consolidarMarkdown,
  type FormatoArquivo,
} from '../../lib/markdownConvert';
import { converterPdfNativoParaMarkdown } from '../../lib/pdfNativeExtract';
import { converterComIA } from '../../lib/converterMarkdownApi';
import { comprimirImagemUpload } from '../../lib/imageCompression';
import { normalizarProposta, normalizarCnpj } from '../../lib/cotacoes';
import { extrairCotacao, uploadArquivoCotacao, salvarRenegociacaoCotacao } from '../../lib/cotacoesApi';
import {
  mesclarPropostaRenegociacao, calcularComparativoRenegociacao, valorTotalEfetivoProposta,
} from '../../lib/renegociacaoCotacao';
import { formatBRL, formatDuration, formatModelo, formatCustoBrl } from '../../lib/format';
import type {
  ArquivoOriginalCotacao, CotacaoProcessoItem, CotacaoPropostaDraft, CotacaoPropostaItemDraft,
  ExtracaoUso, Profile,
} from '../../types';

interface ArquivoRenegociacao {
  id: string;
  nome: string;
  tamanho: number;
  formato: FormatoArquivo;
  file: File;
  status: 'convertendo' | 'concluido' | 'erro';
  markdown?: string;
  erro?: string;
}

export interface RenegociacaoPropostaModalProps {
  processoId: string;
  user: Profile;
  propostaAnterior: CotacaoPropostaDraft;
  escopo: CotacaoProcessoItem[];
  resolverVinculos: (draft: CotacaoPropostaDraft) => Promise<CotacaoPropostaDraft>;
  alinharPeso: (draft: CotacaoPropostaDraft) => CotacaoPropostaDraft;
  comFreteTeorico: (draft: CotacaoPropostaDraft) => CotacaoPropostaDraft;
  onAceita: (resultado: {
    novaPropostaId: string;
    rodada: number;
    savingTotal: number;
    diffPct: number | null;
    arquivosEnviados: { nome: string; file: File }[];
  }) => Promise<void>;
  onClose: () => void;
}

function InputNumeroTabela({
  value, onChange, decimais = 2,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  decimais?: number;
}) {
  const [texto, setTexto] = useState(value != null ? String(value) : '');
  useEffect(() => {
    setTexto(value != null ? String(value) : '');
  }, [value]);

  return (
    <input
      inputMode="decimal"
      value={texto}
      onChange={e => setTexto(e.target.value)}
      onFocus={e => e.target.select()}
      onBlur={() => {
        const limpo = texto.trim().replace(/\./g, '').replace(',', '.');
        // Se digitou com ponto decimal simples (ex.: "12.50"), respeita ponto decimal
        const bruto = texto.trim();
        let n: number | null = null;
        if (bruto !== '') {
          const parsed = bruto.includes(',')
            ? Number(limpo)
            : Number(bruto);
          if (Number.isFinite(parsed)) n = Number(parsed.toFixed(decimais));
        }
        onChange(n);
      }}
      className="w-24 rounded border border-slate-200 bg-white px-1.5 py-1 text-right text-xs tabular-nums outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
    />
  );
}

function formatPctSinal(pct: number | null): string {
  if (pct == null || !Number.isFinite(pct)) return '—';
  const sinal = pct > 0.005 ? '+' : '';
  return `${sinal}${pct.toFixed(1)}%`;
}

function formatBrlSinal(valor: number | null): string {
  if (valor == null || !Number.isFinite(valor)) return '—';
  if (Math.abs(valor) < 0.005) return formatBRL(0);
  return valor > 0 ? `+${formatBRL(valor)}` : `-${formatBRL(Math.abs(valor))}`;
}

export default function RenegociacaoPropostaModal({
  processoId, user, propostaAnterior, escopo,
  resolverVinculos, alinharPeso, comFreteTeorico, onAceita, onClose,
}: RenegociacaoPropostaModalProps) {
  const toast = useToast();
  const rodadaAtual = propostaAnterior.rodada ?? 1;
  const proximaRodada = rodadaAtual + 1;
  const totalAnteriorBase = useMemo(() => valorTotalEfetivoProposta(propostaAnterior), [propostaAnterior]);

  const [etapa, setEtapa] = useState<'upload' | 'revisao'>('upload');
  const [arquivos, setArquivos] = useState<ArquivoRenegociacao[]>([]);
  const [arrastando, setArrastando] = useState(false);
  const [modoMarkdown, setModoMarkdown] = useState(false);
  const [markdownManual, setMarkdownManual] = useState('');
  const [extraindo, setExtraindo] = useState(false);
  const [erroExtracao, setErroExtracao] = useState<string | null>(null);
  const [usoExtracao, setUsoExtracao] = useState<ExtracaoUso | null>(null);
  const [modeloExtracao, setModeloExtracao] = useState<string | null>(null);
  const [custoBrl, setCustoBrl] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  const [novaDraft, setNovaDraft] = useState<CotacaoPropostaDraft | null>(null);
  const [mostrarCabecalho, setMostrarCabecalho] = useState(false);
  const [aceitando, setAceitando] = useState(false);

  const inputFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!extraindo) return;
    const inicio = Date.now();
    setElapsedMs(0);
    const timer = window.setInterval(() => setElapsedMs(Date.now() - inicio), 100);
    return () => window.clearInterval(timer);
  }, [extraindo]);

  const converterArquivo = async (entry: ArquivoRenegociacao) => {
    try {
      let markdown = '';
      if (entry.formato === 'pdf') {
        const nativo = await converterPdfNativoParaMarkdown(entry.file).catch(() => null);
        if (nativo && nativo.markdown.trim()) {
          markdown = nativo.markdown;
        } else {
          const viaIa = await converterComIA(entry.file);
          markdown = viaIa.markdown;
        }
      } else if (entry.formato === 'imagem') {
        // Regra global SISTEN: comprimir imagem antes de enviar para OCR/Storage
        const blob = await comprimirImagemUpload(entry.file, { maxDimensao: 2400, qualidade: 0.9 });
        const fileComprimido = new File(
          [blob],
          blob === entry.file ? entry.file.name : entry.file.name.replace(/\.[^.]+$/, '') + '.jpg',
          { type: blob.type || entry.file.type },
        );
        const viaIa = await converterComIA(fileComprimido);
        markdown = viaIa.markdown;
      } else {
        const local = await converterArquivoParaMarkdown(entry.file);
        markdown = local.markdown;
      }

      setArquivos(prev => prev.map(a => (
        a.id === entry.id ? { ...a, status: 'concluido', markdown, erro: undefined } : a
      )));
    } catch (err) {
      setArquivos(prev => prev.map(a => (
        a.id === entry.id ? { ...a, status: 'erro', erro: (err as Error).message || 'Falha ao ler arquivo.' } : a
      )));
    }
  };

  const adicionarArquivos = (files: FileList | File[]) => {
    const lista = Array.from(files);
    if (lista.length === 0) return;
    const novasEntradas: ArquivoRenegociacao[] = lista.map((file, idx) => {
      const nome = file.name && file.name !== 'image.png'
        ? file.name
        : `renegociacao-r${proximaRodada}-${Date.now()}-${idx + 1}.png`;
      const normalizado = file.name === nome ? file : new File([file], nome, { type: file.type });
      return {
        id: `${nome}__${file.size}__${Date.now()}_${idx}`,
        nome,
        tamanho: normalizado.size,
        formato: detectarFormato(nome),
        file: normalizado,
        status: 'convertendo',
      };
    });
    setArquivos(prev => [...prev, ...novasEntradas]);
    setErroExtracao(null);
    novasEntradas.forEach(entry => { void converterArquivo(entry); });
  };

  // Permite colar print diretamente (Ctrl+V) enquanto o modal esta na etapa de upload.
  useEffect(() => {
    if (etapa !== 'upload') return;
    const onPaste = (e: ClipboardEvent) => {
      const alvo = e.target as HTMLElement | null;
      if (alvo?.closest('input, textarea, [contenteditable="true"]')) return;
      const imgs = Array.from(e.clipboardData?.files ?? []).filter(f => f.type.startsWith('image/'));
      if (imgs.length === 0) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      adicionarArquivos(imgs);
      toast.info(`${imgs.length} print(s) colado(s) para leitura da renegociação.`);
    };
    document.addEventListener('paste', onPaste, true);
    return () => document.removeEventListener('paste', onPaste, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [etapa]);

  const arquivosProntos = useMemo(() => arquivos.filter(a => a.status === 'concluido' && a.markdown), [arquivos]);
  const emConversao = useMemo(() => arquivos.some(a => a.status === 'convertendo'), [arquivos]);

  const podeExtrair = !extraindo && !emConversao && (
    modoMarkdown ? markdownManual.trim().length > 10 : arquivosProntos.length > 0
  );

  const handleExtrair = async () => {
    if (!podeExtrair) return;
    setExtraindo(true);
    setErroExtracao(null);
    setUsoExtracao(null);
    setModeloExtracao(null);
    setCustoBrl(null);

    try {
      const markdown = modoMarkdown
        ? markdownManual.trim()
        : consolidarMarkdown(arquivosProntos.map(a => ({ nome: a.nome, markdown: a.markdown! })));
      const arquivoOrigem = modoMarkdown
        ? `renegociacao-r${proximaRodada}.md`
        : arquivosProntos.length === 1
          ? arquivosProntos[0].nome
          : `${arquivosProntos.length} arquivos (R${proximaRodada})`;

      const resposta = await extrairCotacao({
        markdown,
        arquivoOrigem,
        processoId,
        escopo,
      });

      setUsoExtracao(resposta.uso);
      setModeloExtracao(resposta.modelo);
      setCustoBrl(resposta.custo_brl ?? (typeof resposta.custo_usd === 'number' ? resposta.custo_usd * 6 : null));

      const cnpjAlvo = normalizarCnpj(propostaAnterior.fornecedor_cnpj);
      const candidatas = (resposta.propostas ?? []).filter(p => Array.isArray(p.itens) && p.itens.length > 0);
      if (candidatas.length === 0) {
        setErroExtracao('A IA não encontrou nenhum item na nova cotação. Se for um PDF escaneado, cole um print (Ctrl+V) mais nítido.');
        return;
      }

      // Se a IA devolveu mais de uma proposta no mesmo arquivo, prioriza a do mesmo CNPJ ou a de mais itens.
      const escolhida = (cnpjAlvo
        ? candidatas.find(c => normalizarCnpj(c.Fornecedor_CNPJ) === cnpjAlvo)
        : undefined)
        ?? [...candidatas].sort((a, b) => (b.itens?.length ?? 0) - (a.itens?.length ?? 0))[0];

      const normalizada = normalizarProposta(escolhida, { arquivoOrigem, arquivoMarkdown: markdown });
      normalizada.extracao_id = resposta.extracao_id;

      // Sobe os arquivos originais da renegociacao ao Storage (comprimindo imagens dentro de uploadArquivoCotacao)
      const originaisStorage: ArquivoOriginalCotacao[] = [];
      if (!modoMarkdown) {
        for (const a of arquivosProntos) {
          try {
            const up = await uploadArquivoCotacao(processoId, a.file);
            originaisStorage.push({
              nome: a.nome,
              path: up.path,
              mime_type: up.mimeType,
              tamanho_bytes: up.tamanhoBytes,
            });
          } catch (err) {
            console.warn(`Falha ao subir original da renegociacao (${a.nome}):`, err);
          }
        }
      }

      if (originaisStorage.length > 0) {
        const [primeiro] = originaisStorage;
        normalizada.arquivos_originais = originaisStorage;
        normalizada.arquivo_storage_path = primeiro.path;
        normalizada.arquivo_mime_type = primeiro.mime_type;
        normalizada.arquivo_tamanho_bytes = primeiro.tamanho_bytes;
      }

      // Resolve vinculos contra RM, mescla com rodada anterior (preservando nao citados + selecoes do mapa), alinha peso e simula frete
      const comVinculos = await resolverVinculos(normalizada);
      const mesclada = mesclarPropostaRenegociacao(propostaAnterior, comVinculos);
      const finalizada = comFreteTeorico(alinharPeso(mesclada));

      setNovaDraft(finalizada);
      setEtapa('revisao');
    } catch (err) {
      setErroExtracao((err as Error).message || 'Falha ao extrair a nova cotação com IA.');
    } finally {
      setExtraindo(false);
    }
  };

  const comparativo = useMemo(() => {
    if (!novaDraft) return null;
    return calcularComparativoRenegociacao(propostaAnterior, novaDraft);
  }, [propostaAnterior, novaDraft]);

  const atualizarCabecalho = (patch: Partial<CotacaoPropostaDraft>) => {
    setNovaDraft(prev => (prev ? comFreteTeorico({ ...prev, ...patch }) : prev));
  };

  const atualizarItem = (itemKey: string, patch: Partial<CotacaoPropostaItemDraft>) => {
    setNovaDraft(prev => {
      if (!prev) return prev;
      const itens = prev.itens.map(it => {
        if (it._key !== itemKey) return it;
        const atualizado = { ...it, ...patch };
        // Recalcula total automaticamente ao editar preco unitario ou quantidade (quando total nao foi editado explicitamente)
        if (('preco_unitario' in patch || 'quantidade' in patch) && !('preco_total_item' in patch)) {
          if (atualizado.preco_unitario != null && atualizado.quantidade != null) {
            atualizado.preco_total_item = Number((atualizado.preco_unitario * atualizado.quantidade).toFixed(2));
          }
        }
        return atualizado;
      });
      return comFreteTeorico({ ...prev, itens });
    });
  };

  const handleAceitar = async () => {
    if (!novaDraft || !comparativo || aceitando) return;
    setAceitando(true);
    try {
      const res = await salvarRenegociacaoCotacao({
        processoId,
        propostaAnteriorId: propostaAnterior._key,
        proposta: novaDraft,
        usuarioId: user.id,
        usuarioNome: user.name,
      });

      await onAceita({
        novaPropostaId: res.proposta_id,
        rodada: res.rodada,
        savingTotal: comparativo.savingTotal,
        diffPct: comparativo.diffPct,
        arquivosEnviados: arquivosProntos.map(a => ({ nome: a.nome, file: a.file })),
      });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setAceitando(false);
    }
  };

  const savingPositivo = (comparativo?.savingTotal ?? 0) > 0.005;
  const savingNegativo = (comparativo?.savingTotal ?? 0) < -0.005;

  return (
    <Modal
      onClose={() => { if (!extraindo && !aceitando) onClose(); }}
      maxWidth={etapa === 'revisao' ? 'max-w-6xl' : 'max-w-2xl'}
      ariaLabel={`Renegociar proposta — Rodada ${proximaRodada}`}
    >
      <ModalHeader onClose={() => { if (!extraindo && !aceitando) onClose(); }}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300">
            Rodada {rodadaAtual} → {proximaRodada}
          </span>
          <h2 className="text-sm font-bold text-slate-900 dark:text-slate-50">
            Renegociar cotação — {propostaAnterior.fornecedor_razao_social || 'Fornecedor'}
          </h2>
        </div>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          Anexe a nova cotação do fornecedor (PDF, imagem, planilha ou print com Ctrl+V). A IA extrai os novos preços e calcula o saving antes de você aceitar.
        </p>
      </ModalHeader>

      <ModalBody className="space-y-4">
        {etapa === 'upload' && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 text-xs dark:border-slate-800 dark:bg-slate-800/40">
              <div className="space-y-0.5">
                <div className="font-semibold text-slate-800 dark:text-slate-100">
                  Orçamento vigente (Rodada {rodadaAtual})
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  {propostaAnterior.itens.filter(i => !i.desconsiderado).length} item(ns) ativos
                  {propostaAnterior.numero_proposta ? ` · Proposta ${propostaAnterior.numero_proposta}` : ''}
                  {propostaAnterior.itens.some(i => i.mapa_selecionado)
                    ? ` · ${propostaAnterior.itens.filter(i => i.mapa_selecionado).length} marcado(s) no mapa`
                    : ''}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-wide text-slate-500">Total anterior</div>
                <div className="text-sm font-bold tabular-nums text-slate-900 dark:text-slate-50">
                  {formatBRL(totalAnteriorBase)}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                Novo documento da Rodada {proximaRodada}
              </span>
              <button
                type="button"
                onClick={() => setModoMarkdown(v => !v)}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-600 hover:underline dark:text-indigo-400"
              >
                <ClipboardPaste className="h-3.5 w-3.5" />
                {modoMarkdown ? 'Voltar para envio de arquivos' : 'Colar Markdown manualmente'}
              </button>
            </div>

            {modoMarkdown ? (
              <textarea
                rows={8}
                value={markdownManual}
                onChange={e => setMarkdownManual(e.target.value)}
                placeholder="Cole aqui o texto ou Markdown da nova proposta renegociada..."
                className="w-full rounded-xl border border-slate-200 bg-white p-3 font-mono text-xs outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            ) : (
              <>
                <input
                  ref={inputFileRef}
                  type="file"
                  accept={ACCEPT_CONVERSOR}
                  multiple
                  className="hidden"
                  onChange={e => { if (e.target.files) adicionarArquivos(e.target.files); e.target.value = ''; }}
                />
                <div
                  onDragOver={e => { e.preventDefault(); setArrastando(true); }}
                  onDragLeave={() => setArrastando(false)}
                  onDrop={e => { e.preventDefault(); setArrastando(false); adicionarArquivos(e.dataTransfer.files); }}
                  onClick={() => inputFileRef.current?.click()}
                  className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-8 text-center transition-colors ${
                    arrastando
                      ? 'border-indigo-500 bg-indigo-50/70 dark:bg-indigo-950/30'
                      : 'border-slate-300 bg-slate-50/40 hover:border-indigo-400 hover:bg-indigo-50/30 dark:border-slate-700 dark:bg-slate-900/40 dark:hover:border-indigo-600'
                  }`}
                >
                  <UploadCloud className="h-8 w-8 text-indigo-500" />
                  <p className="mt-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
                    Clique ou arraste PDF, imagem, planilha (XLSX/CSV) ou XML/JSON
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                    Você também pode colar um print direto da área de transferência com <kbd className="rounded border border-slate-300 bg-white px-1 py-0.5 text-[10px] font-semibold dark:border-slate-600 dark:bg-slate-800">Ctrl+V</kbd>.
                  </p>
                </div>

                {arquivos.length > 0 && (
                  <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-700">
                    {arquivos.map(a => (
                      <li key={a.id} className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
                        <div className="flex min-w-0 items-center gap-2">
                          <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                          <div className="min-w-0">
                            <div className="truncate font-medium text-slate-700 dark:text-slate-200">{a.nome}</div>
                            <div className="text-[10px] text-slate-500">
                              {(a.tamanho / 1024).toFixed(0)} KB · {a.formato.toUpperCase()}
                              {a.erro && <span className="ml-1 text-rose-600 dark:text-rose-400">· {a.erro}</span>}
                            </div>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {a.status === 'convertendo' && (
                            <span className="inline-flex items-center gap-1 text-[11px] text-indigo-600 dark:text-indigo-400">
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              Lendo...
                            </span>
                          )}
                          {a.status === 'concluido' && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Pronto
                            </span>
                          )}
                          {a.status === 'erro' && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-600 dark:text-rose-400">
                              <AlertCircle className="h-3.5 w-3.5" />
                              Erro
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => setArquivos(prev => prev.filter(x => x.id !== a.id))}
                            className="text-slate-400 hover:text-rose-500"
                            title="Remover arquivo"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}

            {erroExtracao && (
              <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{erroExtracao}</span>
              </div>
            )}
          </>
        )}

        {etapa === 'revisao' && novaDraft && comparativo && (
          <>
            {/* Resumo KPI de Saving de Negociacao */}
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-800/40">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Orçamento anterior (R{comparativo.rodadaAnterior})
                </div>
                <div className="mt-1 text-base font-bold tabular-nums text-slate-800 dark:text-slate-100">
                  {formatBRL(comparativo.totalAnterior)}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Nova proposta (R{comparativo.rodadaNova})
                </div>
                <div className="mt-1 text-base font-bold tabular-nums text-slate-900 dark:text-slate-50">
                  {formatBRL(comparativo.totalNovo)}
                </div>
              </div>

              <div className={`rounded-xl border p-3 ${
                savingPositivo
                  ? 'border-emerald-200 bg-emerald-50/70 dark:border-emerald-900 dark:bg-emerald-950/30'
                  : savingNegativo
                    ? 'border-rose-200 bg-rose-50/70 dark:border-rose-900 dark:bg-rose-950/30'
                    : 'border-slate-200 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-800/40'
              }`}>
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Diferença (%)
                </div>
                <div className={`mt-1 flex items-center gap-1 text-base font-extrabold tabular-nums ${
                  savingPositivo
                    ? 'text-emerald-700 dark:text-emerald-300'
                    : savingNegativo
                      ? 'text-rose-700 dark:text-rose-300'
                      : 'text-slate-700 dark:text-slate-200'
                }`}>
                  {savingPositivo ? <TrendingDown className="h-4 w-4 shrink-0" /> : savingNegativo ? <TrendingUp className="h-4 w-4 shrink-0" /> : null}
                  {formatPctSinal(comparativo.diffPct)}
                </div>
              </div>

              <div className={`rounded-xl border p-3 ${
                savingPositivo
                  ? 'border-emerald-300 bg-emerald-100/60 dark:border-emerald-800 dark:bg-emerald-950/50'
                  : savingNegativo
                    ? 'border-rose-300 bg-rose-100/60 dark:border-rose-800 dark:bg-rose-950/50'
                    : 'border-slate-200 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-800/40'
              }`}>
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                  {savingNegativo ? 'Acréscimo vs. anterior' : 'Saving de negociação'}
                </div>
                <div className={`mt-1 text-base font-extrabold tabular-nums ${
                  savingPositivo
                    ? 'text-emerald-700 dark:text-emerald-300'
                    : savingNegativo
                      ? 'text-rose-700 dark:text-rose-300'
                      : 'text-slate-700 dark:text-slate-200'
                }`}>
                  {savingPositivo
                    ? formatBRL(comparativo.savingTotal)
                    : savingNegativo
                      ? `+${formatBRL(Math.abs(comparativo.savingTotal))}`
                      : formatBRL(0)}
                </div>
              </div>
            </div>

            {/* Badges de resumo + telemetria IA */}
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 font-semibold text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300">
                {comparativo.qtdRenegociados} renegociado(s)
              </span>
              {comparativo.qtdMantidos > 0 && (
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {comparativo.qtdMantidos} mantido(s) da R{comparativo.rodadaAnterior}
                </span>
              )}
              {comparativo.qtdNovos > 0 && (
                <span className="rounded-full bg-amber-100 px-2.5 py-0.5 font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                  {comparativo.qtdNovos} item(ns) novo(s)
                </span>
              )}
              {comparativo.qtdSelecionadosTransferidos > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                  <ShoppingCart className="h-3 w-3" />
                  {comparativo.qtdSelecionadosTransferidos} seleção(ões) do mapa preservada(s)
                </span>
              )}
              {modeloExtracao && (
                <span className="ml-auto text-[10px] text-slate-400">
                  IA: {formatModelo(modeloExtracao)}
                  {usoExtracao?.total_tokens ? ` · ${usoExtracao.total_tokens.toLocaleString('pt-BR')} tokens` : ''}
                  {custoBrl != null ? ` · ${formatCustoBrl(custoBrl)}` : ''}
                </span>
              )}
            </div>

            {/* Mudancas comerciais detectadas */}
            {comparativo.mudancasComerciais.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50/60 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200">
                <div className="mb-1 text-[10px] font-bold uppercase tracking-wide">Alterações comerciais detectadas</div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
                  {comparativo.mudancasComerciais.map(m => (
                    <span key={m.campo} className="inline-flex items-center gap-1">
                      <span className="font-semibold">{m.campo}:</span>
                      <span className="line-through opacity-70">{m.anterior}</span>
                      <ArrowRight className="h-3 w-3 shrink-0" />
                      <span className="font-semibold">{m.novo}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Toggle para editar cabecalho comercial (desconto, frete, prazo, pagamento) */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setMostrarCabecalho(v => !v)}
                className="flex w-full items-center justify-between px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800/40"
              >
                <span>Condições comerciais da Rodada {comparativo.rodadaNova} (editar se necessário)</span>
                {mostrarCabecalho ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
              {mostrarCabecalho && (
                <div className="grid grid-cols-1 gap-3 border-t border-slate-200 p-3.5 text-xs sm:grid-cols-2 lg:grid-cols-4 dark:border-slate-800">
                  <label className="block">
                    <span className="text-[10px] font-semibold uppercase text-slate-500">Nº proposta</span>
                    <input
                      value={novaDraft.numero_proposta ?? ''}
                      onChange={e => atualizarCabecalho({ numero_proposta: e.target.value || null })}
                      className="mt-0.5 w-full rounded border border-slate-200 bg-transparent px-2 py-1 text-xs outline-none focus:border-indigo-500 dark:border-slate-700"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[10px] font-semibold uppercase text-slate-500">Condição pagamento</span>
                    <input
                      value={novaDraft.condicao_pagamento ?? ''}
                      onChange={e => atualizarCabecalho({ condicao_pagamento: e.target.value || null })}
                      className="mt-0.5 w-full rounded border border-slate-200 bg-transparent px-2 py-1 text-xs outline-none focus:border-indigo-500 dark:border-slate-700"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[10px] font-semibold uppercase text-slate-500">Prazo entrega</span>
                    <input
                      value={novaDraft.prazo_entrega_texto ?? ''}
                      onChange={e => atualizarCabecalho({ prazo_entrega_texto: e.target.value || null })}
                      className="mt-0.5 w-full rounded border border-slate-200 bg-transparent px-2 py-1 text-xs outline-none focus:border-indigo-500 dark:border-slate-700"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[10px] font-semibold uppercase text-slate-500">Modalidade frete</span>
                    <select
                      value={novaDraft.frete_modalidade ?? ''}
                      onChange={e => atualizarCabecalho({ frete_modalidade: (e.target.value || null) as any })}
                      className="mt-0.5 w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-900"
                    >
                      <option value="">—</option>
                      <option value="CIF">CIF</option>
                      <option value="FOB">FOB</option>
                      <option value="OUTRO">OUTRO</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-[10px] font-semibold uppercase text-slate-500">Frete destacado (R$)</span>
                    <InputNumeroTabela
                      value={novaDraft.valor_frete}
                      onChange={v => atualizarCabecalho({ valor_frete: v })}
                    />
                  </label>
                  <label className="block">
                    <span className="text-[10px] font-semibold uppercase text-slate-500">Desconto declarado (R$)</span>
                    <InputNumeroTabela
                      value={novaDraft.valor_desconto}
                      onChange={v => atualizarCabecalho({ valor_desconto: v })}
                    />
                  </label>
                  <label className="block">
                    <span className="text-[10px] font-semibold uppercase text-slate-500">Validade</span>
                    <input
                      type="date"
                      value={novaDraft.validade_data ?? ''}
                      onChange={e => atualizarCabecalho({ validade_data: e.target.value || null })}
                      className="mt-0.5 w-full rounded border border-slate-200 bg-transparent px-2 py-1 text-xs outline-none focus:border-indigo-500 dark:border-slate-700"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[10px] font-semibold uppercase text-slate-500">Observações</span>
                    <input
                      value={novaDraft.observacoes_gerais ?? ''}
                      onChange={e => atualizarCabecalho({ observacoes_gerais: e.target.value || null })}
                      className="mt-0.5 w-full rounded border border-slate-200 bg-transparent px-2 py-1 text-xs outline-none focus:border-indigo-500 dark:border-slate-700"
                    />
                  </label>
                </div>
              )}
            </div>

            {/* Tabela comparativa item a item */}
            <div className="max-h-[45vh] overflow-auto rounded-xl border border-slate-200 dark:border-slate-800">
              <table className="w-full border-collapse text-xs">
                <thead className="sticky top-0 z-10 bg-slate-50 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                  <tr className="border-b border-slate-200 dark:border-slate-700">
                    <th className="px-3 py-2">Item</th>
                    <th className="px-2 py-2 text-right">Qtd</th>
                    <th className="px-2 py-2 text-right">Unit. R{comparativo.rodadaAnterior}</th>
                    <th className="px-2 py-2 text-right">Unit. R{comparativo.rodadaNova}</th>
                    <th className="px-2 py-2 text-right">Δ Unit. / %</th>
                    <th className="px-2 py-2 text-right">Total R{comparativo.rodadaAnterior}</th>
                    <th className="px-2 py-2 text-right">Total R{comparativo.rodadaNova}</th>
                    <th className="px-2 py-2 text-right">Saving Total</th>
                    <th className="px-2 py-2 text-center">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {novaDraft.itens.map(item => {
                    const comp = comparativo.porItemKey.get(item._key);
                    const reduziu = comp?.diffUnitario != null && comp.diffUnitario < -0.0001;
                    const subiu = comp?.diffUnitario != null && comp.diffUnitario > 0.0001;
                    const savingItemPos = comp?.savingTotal != null && comp.savingTotal > 0.005;
                    const savingItemNeg = comp?.savingTotal != null && comp.savingTotal < -0.005;

                    return (
                      <tr
                        key={item._key}
                        className={item.desconsiderado ? 'bg-slate-50/50 opacity-45 dark:bg-slate-900/40' : 'hover:bg-slate-50/60 dark:hover:bg-slate-800/30'}
                      >
                        <td className="max-w-[260px] px-3 py-2">
                          <div className="line-clamp-2 font-medium text-slate-800 dark:text-slate-100" title={item.descricao_produto}>
                            {item.descricao_produto || 'Item sem descrição'}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px]">
                            {item._reneg_origem === 'renegociado' && (
                              <span className="rounded bg-indigo-100 px-1.5 py-0.5 font-semibold text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300">
                                Renegociado
                              </span>
                            )}
                            {item._reneg_origem === 'mantido' && (
                              <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                Mantido R{comparativo.rodadaAnterior}
                              </span>
                            )}
                            {item._reneg_origem === 'novo' && (
                              <span className="rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
                                Novo
                              </span>
                            )}
                            {item.ri && <span className="font-mono text-slate-500">RI {item.ri}</span>}
                            {item.mapa_selecionado && (
                              <span className="inline-flex items-center gap-0.5 rounded bg-emerald-100 px-1 py-0.5 font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                                <ShoppingCart className="h-2.5 w-2.5" />
                                No mapa
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          <div className="flex items-center justify-end gap-1">
                            <InputNumeroTabela
                              value={item.quantidade}
                              onChange={v => atualizarItem(item._key, { quantidade: v })}
                              decimais={4}
                            />
                            <span className="text-[10px] text-slate-500">{item.unidade_medida || ''}</span>
                          </div>
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums text-slate-500 dark:text-slate-400">
                          {comp?.precoUnitarioAnterior != null ? formatBRL(comp.precoUnitarioAnterior) : '—'}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          <InputNumeroTabela
                            value={item.preco_unitario}
                            onChange={v => atualizarItem(item._key, { preco_unitario: v })}
                            decimais={6}
                          />
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {comp?.diffUnitario != null ? (
                            <div className={
                              reduziu
                                ? 'font-semibold text-emerald-700 dark:text-emerald-400'
                                : subiu
                                  ? 'font-semibold text-rose-600 dark:text-rose-400'
                                  : 'text-slate-400'
                            }>
                              <div>{formatBrlSinal(comp.diffUnitario)}</div>
                              <div className="text-[10px]">{formatPctSinal(comp.diffUnitarioPct)}</div>
                            </div>
                          ) : <span className="text-slate-400">—</span>}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums text-slate-500 dark:text-slate-400">
                          {comp?.precoTotalAnterior != null ? formatBRL(comp.precoTotalAnterior) : '—'}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          <InputNumeroTabela
                            value={item.preco_total_item}
                            onChange={v => atualizarItem(item._key, { preco_total_item: v })}
                            decimais={2}
                          />
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {comp?.savingTotal != null ? (
                            <span className={
                              savingItemPos
                                ? 'font-bold text-emerald-700 dark:text-emerald-400'
                                : savingItemNeg
                                  ? 'font-bold text-rose-600 dark:text-rose-400'
                                  : 'text-slate-400'
                            }>
                              {savingItemPos
                                ? formatBRL(comp.savingTotal)
                                : savingItemNeg
                                  ? `-${formatBRL(Math.abs(comp.savingTotal))}`
                                  : formatBRL(0)}
                            </span>
                          ) : <span className="text-slate-400">—</span>}
                        </td>
                        <td className="px-2 py-2 text-center">
                          <button
                            type="button"
                            onClick={() => atualizarItem(item._key, { desconsiderado: !item.desconsiderado })}
                            title={item.desconsiderado ? 'Voltar a considerar este item' : 'Desconsiderar este item'}
                            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                          >
                            {item.desconsiderado ? <RotateCcw className="h-3.5 w-3.5" /> : <Ban className="h-3.5 w-3.5" />}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </ModalBody>

      <ModalFooter>
        {etapa === 'upload' ? (
          <>
            <button
              type="button"
              onClick={onClose}
              disabled={extraindo}
              className="rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleExtrair}
              disabled={!podeExtrair}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm shadow-indigo-600/20 hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {extraindo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              {extraindo
                ? `Extraindo com IA (${formatDuration(elapsedMs)})...`
                : 'Extrair nova cotação com IA'}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => { setEtapa('upload'); setErroExtracao(null); }}
              disabled={aceitando}
              className="mr-auto rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Enviar outro arquivo
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={aceitando}
              className="rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleAceitar}
              disabled={aceitando}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-sm shadow-emerald-600/20 hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {aceitando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              {aceitando ? 'Salvando rodada...' : `Aceitar nova proposta (Rodada ${proximaRodada})`}
            </button>
          </>
        )}
      </ModalFooter>
    </Modal>
  );
}
