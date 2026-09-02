/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Pop-up de aviso quando o usuario tenta fazer upload de um arquivo que ja foi
 * convertido anteriormente (na sessao local ou no historico compartilhado do Supabase)
 * — exibe data/hora exata, usuario responsavel, metricas e permite puxar os dados
 * existentes sem custo de IA ou reconverter.
 */

import React from 'react';
import {
  AlertCircle, Eye, RotateCcw, FileCheck, CheckCircle2,
  Calendar, User, Coins, DollarSign, Timer, Sparkles, Cpu,
  Database, CloudDownload,
} from 'lucide-react';
import Modal, { ModalHeader, ModalBody, ModalFooter } from '../ui/Modal';
import { formatDateTimeBR, formatDuration, formatFileSize, formatCustoBrl } from '../../lib/format';
import type { ItemFila } from './ItemFilaRow';

export interface DuplicadoInfo {
  file: File;
  itemExistente?: ItemFila;
  nome: string;
  tamanho: number;
  convertidoEm?: string | number | null;
  usuarioNome?: string | null;
  resumo?: string | null;
  tokens?: number | null;
  custoUsd?: number | null;
  custoBrl?: number | null;
  duracaoMs?: number | null;
  via?: 'ia' | 'local' | string | null;
  modelo?: string | null;
  markdown?: string | null;
  origem?: 'supabase' | 'sessao_local';
}

interface ArquivoJaConvertidoModalProps {
  duplicados: DuplicadoInfo[];
  onClose: () => void;
  onVerExistente: (duplicado: DuplicadoInfo) => void;
  onReconverter: (duplicado: DuplicadoInfo) => void;
}

export default function ArquivoJaConvertidoModal({
  duplicados,
  onClose,
  onVerExistente,
  onReconverter,
}: ArquivoJaConvertidoModalProps) {
  const ehUnico = duplicados.length === 1;
  const primeiro = duplicados[0];
  const ehDoSupabase = primeiro?.origem === 'supabase';

  return (
    <Modal onClose={onClose} maxWidth="max-w-xl" ariaLabel="Arquivo já convertido">
      <ModalHeader onClose={onClose}>
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400">
            <AlertCircle className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-50">
              {ehUnico
                ? ehDoSupabase
                  ? 'Cotação já convertida no Banco de Dados'
                  : 'Arquivo já convertido'
                : `${duplicados.length} arquivos já convertidos`}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {ehUnico
                ? ehDoSupabase
                  ? 'Este arquivo já foi processado anteriormente e está salvo no banco.'
                  : 'Este documento já foi processado e possui o Markdown gerado.'
                : 'Os documentos abaixo já foram processados anteriormente.'}
            </p>
          </div>
        </div>
      </ModalHeader>

      <ModalBody className="space-y-3">
        <p className="text-xs text-slate-600 dark:text-slate-300">
          {ehUnico
            ? ehDoSupabase
              ? 'Você pode puxar os dados existentes diretamente do Banco de dados ou forçar uma nova conversão:'
              : 'Identificamos que este arquivo já foi convertido. Veja os detalhes abaixo:'
            : 'Os seguintes arquivos já possuem conversão registrada no sistema:'}
        </p>

        <div className="space-y-3">
          {duplicados.map((dup, index) => {
            const dataFormatada = dup.convertidoEm ? formatDateTimeBR(dup.convertidoEm) : 'Recentemente';
            const nomeUsuario = dup.usuarioNome || 'Usuário do sistema';
            const doBanco = dup.origem === 'supabase';

            return (
              <div
                key={`${dup.nome}_${index}`}
                className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3.5 dark:border-slate-800 dark:bg-slate-950/60 space-y-3 shadow-2xs"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <FileCheck className="h-4 w-4 shrink-0 text-emerald-500" />
                      <p className="truncate text-xs font-bold text-slate-900 dark:text-slate-100" title={dup.nome}>
                        {dup.nome}
                      </p>
                    </div>
                    <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                      {formatFileSize(dup.tamanho)}
                      {dup.resumo && ` · ${dup.resumo}`}
                    </p>
                  </div>

                  <span
                    className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${doBanco
                        ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300'
                        : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                      }`}
                  >
                    {doBanco ? <Database className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
                    {doBanco ? 'Salvo no Supabase' : 'Na fila atual'}
                  </span>
                </div>

                {/* Bloco com Data, Hora e Usuário */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 rounded-xl bg-white p-2.5 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 text-xs">
                  <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400">
                      <Calendar className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="block text-[10px] font-medium text-slate-400 uppercase tracking-wider">Convertido em</span>
                      <span className="font-semibold text-slate-800 dark:text-slate-200 truncate block">
                        {dataFormatada}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
                      <User className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="block text-[10px] font-medium text-slate-400 uppercase tracking-wider">Convertido por</span>
                      <span className="font-semibold text-slate-800 dark:text-slate-200 truncate block" title={nomeUsuario}>
                        {nomeUsuario}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Métricas adicionais (Tokens, Custo, Duração, Modelo) */}
                <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400 px-0.5">
                  {dup.via && (
                    <span className="inline-flex items-center gap-1">
                      {dup.via === 'ia' ? <Sparkles className="h-3 w-3 text-indigo-500" /> : <Cpu className="h-3 w-3 text-slate-400" />}
                      {dup.modelo ?? (dup.via === 'local' ? 'Local (Sem IA)' : 'IA')}
                    </span>
                  )}
                  {dup.duracaoMs !== undefined && dup.duracaoMs !== null && (
                    <span className="inline-flex items-center gap-1">
                      <Timer className="h-3 w-3" />
                      {formatDuration(dup.duracaoMs)}
                    </span>
                  )}
                  {dup.tokens !== undefined && dup.tokens !== null && (
                    <span className="inline-flex items-center gap-1">
                      <Coins className="h-3 w-3" />
                      {dup.tokens.toLocaleString('pt-BR')} tokens
                    </span>
                  )}
                  {(dup.custoBrl ?? (dup.custoUsd != null ? dup.custoUsd * 6 : null)) != null && (
                    <span className="inline-flex items-center gap-1">
                      <DollarSign className="h-3 w-3" />
                      {formatCustoBrl(dup.custoBrl ?? dup.custoUsd! * 6)}
                    </span>
                  )}
                </div>

                {!ehUnico && (
                  <div className="flex items-center justify-end gap-2 border-t border-slate-200/60 pt-2.5 dark:border-slate-800/60">
                    <button
                      type="button"
                      onClick={() => onReconverter(dup)}
                      className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-200/60 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors"
                    >
                      <RotateCcw className="h-3 w-3" />
                      Reconverter
                    </button>
                    <button
                      type="button"
                      onClick={() => onVerExistente(dup)}
                      className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1 text-[11px] font-semibold text-white hover:bg-indigo-700 transition-colors shadow-2xs"
                    >
                      {doBanco ? <CloudDownload className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                      {doBanco ? 'Puxar dados' : 'Ver resultado'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </ModalBody>

      <ModalFooter>
        {ehUnico ? (
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors"
            >
              Cancelar
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onReconverter(primeiro)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 transition-colors"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                {ehDoSupabase ? 'Forçar nova conversão com IA' : 'Reconverter'}
              </button>
              <button
                type="button"
                onClick={() => onVerExistente(primeiro)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 shadow-xs transition-colors"
              >
                {ehDoSupabase ? <CloudDownload className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                {ehDoSupabase ? 'Puxar dados do Supabase & Ver PDF' : 'Ver Markdown & PDF'}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-slate-200 px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 transition-colors"
          >
            Fechar
          </button>
        )}
      </ModalFooter>
    </Modal>
  );
}
