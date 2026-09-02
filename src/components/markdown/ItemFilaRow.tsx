/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Uma linha da fila de conversao: status, metricas de execucao e as acoes
 * possiveis para aquele arquivo (ver preview antes/depois, converter, copiar, reconverter, remover).
 */

import React, { useEffect, useState } from 'react';
import {
  FileSpreadsheet, FileJson, FileCode, FileText, Image as ImageIcon, Clock, Loader2, CheckCircle2,
  AlertCircle, Info, Eye, Copy, RotateCcw, Trash2, Upload, Timer, Play, Sparkles,
} from 'lucide-react';
import { formatFileSize, formatDuration, formatCustoBrl, formatModelo } from '../../lib/format';
import type { FormatoArquivo } from '../../lib/markdownConvert';

export interface ItemFila {
  id: string;
  nome: string;
  tamanho: number;
  formato: FormatoArquivo;
  status: 'aguardando' | 'pendente' | 'processando' | 'concluido' | 'erro' | 'nao_suportado';
  resultado?: {
    markdown: string; duracaoMs: number; caracteres: number; tokensEstimados: number; resumo: string;
    tokensReais?: number; custoUsd?: number | null; custoBrl?: number | null; modelo?: string;
  };
  erro?: string;
  /** Ausente após restaurar a fila de uma sessão anterior — precisa selecionar o arquivo de novo para (re)converter. */
  file: File | null;
  /** Timestamp (Date.now()) de quando este item entrou em "processando" — alimenta o cronômetro ao vivo abaixo. */
  iniciadoEm?: number;
  /** Data/hora (ISO string ou timestamp) em que este item concluiu a conversão. */
  concluidoEm?: string | number;
  /** Nome do usuário que realizou a conversão. */
  usuarioNome?: string;
  /** ID do usuário que realizou a conversão. */
  usuarioId?: string;
}

const FORMATO_LABEL: Record<FormatoArquivo, string> = {
  xlsx: 'Planilha', csv: 'CSV', json: 'JSON', xml: 'XML', pdf: 'PDF', imagem: 'Imagem', audio: 'Áudio', desconhecido: '—',
};

const FORMATO_ICON: Record<FormatoArquivo, React.ComponentType<{ className?: string }>> = {
  xlsx: FileSpreadsheet, csv: FileSpreadsheet, json: FileJson, xml: FileCode,
  pdf: FileText, imagem: ImageIcon, audio: FileCode, desconhecido: FileCode,
};

interface ItemFilaRowProps {
  item: ItemFila;
  onVer: () => void;
  onCopiar: () => void;
  onConverter?: () => void;
  onReconverter: () => void;
  onSelecionarArquivo: () => void;
  onRemover: () => void;
  /** Quando o item pode ser incluído (ou não) na extração — só faz sentido para itens já convertidos. */
  selecionavel?: boolean;
  selecionado?: boolean;
  onToggleSelecionado?: () => void;
}

export default function ItemFilaRow({
  item,
  onVer,
  onCopiar,
  onConverter,
  onReconverter,
  onSelecionarArquivo,
  onRemover,
  selecionavel,
  selecionado,
  onToggleSelecionado,
}: ItemFilaRowProps) {
  const Icone = FORMATO_ICON[item.formato];
  const precisaReselecionar = !item.file && item.status !== 'concluido' && item.status !== 'nao_suportado';
  const podeVerPreview = !!item.file || !!item.resultado;

  return (
    <li className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-800 dark:bg-slate-900 transition-colors hover:border-slate-300 dark:hover:border-slate-700">
      <span className="flex h-8 w-4 shrink-0 items-center justify-center">
        {selecionavel && onToggleSelecionado && (
          <input
            type="checkbox"
            checked={!!selecionado}
            onChange={onToggleSelecionado}
            title={selecionado ? 'Excluir da extração' : 'Incluir na extração'}
            className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800"
          />
        )}
      </span>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
        <Icone className="h-4 w-4" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-slate-800 dark:text-slate-100" title={item.nome}>{item.nome}</p>
        <p className="text-[11px] text-slate-400">
          {FORMATO_LABEL[item.formato]} · {formatFileSize(item.tamanho)}
          {item.status === 'processando' && item.iniciadoEm !== undefined && (
            <>
              {' · '}<CronometroAoVivo iniciadoEm={item.iniciadoEm} />
              {/* Modelo real só se sabe quando a Edge Function responde — a única coisa
                  conhecida de antemão é a via (local, determinística, ou IA/OCR). */}
              {(item.formato === 'pdf' || item.formato === 'imagem') && ' · IA (OCR)'}
            </>
          )}
          {item.resultado && (
            <>
              {' · '}{item.resultado.resumo} · {formatDuration(item.resultado.duracaoMs)}
              {' · '}~{(item.resultado.tokensReais ?? item.resultado.tokensEstimados).toLocaleString('pt-BR')} tokens
              {item.resultado.tokensReais !== undefined && ' (reais)'}
              {(item.resultado.custoBrl ?? (item.resultado.custoUsd != null ? item.resultado.custoUsd * 6 : null)) != null &&
                ` · ${formatCustoBrl(item.resultado.custoBrl ?? item.resultado.custoUsd! * 6)}`}
              {item.resultado.modelo && ` · ${formatModelo(item.resultado.modelo)}`}
            </>
          )}
        </p>
        {item.erro && <p className="mt-0.5 text-[11px] text-rose-600 dark:text-rose-400">{item.erro}</p>}
      </div>

      <StatusBadge status={item.status} />

      <div className="flex shrink-0 items-center gap-1">
        {precisaReselecionar && (
          <button
            type="button"
            onClick={onSelecionarArquivo}
            title="Selecionar o arquivo novamente para converter"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-indigo-600 dark:hover:bg-slate-800 transition-colors"
          >
            <Upload className="h-3.5 w-3.5" />
          </button>
        )}

        {/* Botão de Ver Arquivo para arquivo recém-carregado (aguardando conversão) */}
        {!item.resultado && item.file && (
          <button
            type="button"
            onClick={onVer}
            title="Visualizar o arquivo carregado"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:border-indigo-300 hover:bg-indigo-50/50 hover:text-indigo-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-indigo-700 dark:hover:bg-indigo-950/40 dark:hover:text-indigo-300 transition-colors shadow-2xs"
          >
            <Eye className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
            <span>Ver Arquivo</span>
          </button>
        )}

        {/* Botão de Preview do Markdown/Documento para arquivo já concluído */}
        {item.resultado && (
          <button
            type="button"
            onClick={onVer}
            title="Visualizar Markdown e documento lado a lado"
            className="rounded-lg p-1.5 text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 dark:text-slate-400 dark:hover:bg-indigo-950/40 dark:hover:text-indigo-300 transition-colors"
          >
            <Eye className="h-3.5 w-3.5" />
          </button>
        )}

        {/* Botão de Converter Individual quando está aguardando */}
        {item.status === 'aguardando' && item.file && onConverter && (
          <button
            type="button"
            onClick={onConverter}
            title="Converter este arquivo agora"
            className="inline-flex items-center gap-1 rounded-lg bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:text-indigo-300 dark:hover:bg-indigo-900/50 transition-colors"
          >
            <Play className="h-3 w-3 fill-current" />
            Converter
          </button>
        )}

        {item.status === 'concluido' && (
          <button
            type="button"
            onClick={onCopiar}
            title="Copiar markdown"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-indigo-600 dark:hover:bg-slate-800 transition-colors"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
        )}

        {(item.status === 'concluido' || item.status === 'erro') && item.file && (
          <button
            type="button"
            onClick={onReconverter}
            title="Converter de novo"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-indigo-600 dark:hover:bg-slate-800 transition-colors"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        )}

        <button
          type="button"
          onClick={onRemover}
          title="Remover da lista"
          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-rose-600 dark:hover:bg-slate-800 transition-colors"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </li>
  );
}

/** Cronômetro que tica sozinho enquanto o item está "processando" — monta/desmonta com o status, então o intervalo nasce e morre com ele, sem limpeza manual em outro lugar. */
function CronometroAoVivo({ iniciadoEm }: { iniciadoEm: number }) {
  const [agora, setAgora] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setAgora(Date.now()), 200);
    return () => clearInterval(id);
  }, []);
  return (
    <span className="inline-flex items-center gap-0.5 text-indigo-500 dark:text-indigo-400">
      <Timer className="h-3 w-3" />
      {formatDuration(agora - iniciadoEm)}
    </span>
  );
}

function StatusBadge({ status }: { status: ItemFila['status'] }) {
  const map: Record<ItemFila['status'], { label: string; classes: string; icon: React.ComponentType<{ className?: string }>; spin?: boolean }> = {
    aguardando: {
      label: 'Pronto para converter',
      classes: 'bg-amber-50 text-amber-700 border border-amber-200/60 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/40',
      icon: Clock,
    },
    pendente: {
      label: 'Na fila',
      classes: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
      icon: Clock,
    },
    processando: {
      label: 'Convertendo…',
      classes: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300',
      icon: Loader2,
      spin: true,
    },
    concluido: {
      label: 'Convertido',
      classes: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
      icon: CheckCircle2,
    },
    erro: {
      label: 'Falhou',
      classes: 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300',
      icon: AlertCircle,
    },
    nao_suportado: {
      label: 'Em breve',
      classes: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
      icon: Info,
    },
  };
  const { label, classes, icon: Icon, spin } = map[status];
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${classes}`}>
      <Icon className={`h-3 w-3 ${spin ? 'animate-spin' : ''}`} />
      {label}
    </span>
  );
}
