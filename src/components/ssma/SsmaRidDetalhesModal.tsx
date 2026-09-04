/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Modal de Detalhes e Gestão de um Registro de Identificação de Desvio (RID)
 */

import React, { useState } from 'react';
import {
  X,
  ShieldAlert,
  Calendar,
  Building2,
  MapPin,
  FileText,
  User,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Printer,
  Trash2,
  RotateCcw,
  ExternalLink,
  ChevronRight,
  Send,
  Loader2,
  Lock,
} from 'lucide-react';
import type { Profile, SsmaRidDesvio, SsmaRidStatus } from '../../types';
import { atualizarStatusDesvioRid } from '../../lib/ssmaApi';
import { canEditDesvioRid, canDeleteDesvioRid } from '../../lib/pages';
import { useToast } from '../ui/Toast';
import ConfirmDialog from '../ui/ConfirmDialog';

interface SsmaRidDetalhesModalProps {
  desvio: SsmaRidDesvio;
  user: Profile;
  onClose: () => void;
  onDelete?: (id: string) => void;
  onRestore?: (id: string) => void;
  onStatusChange?: (id: string, novoStatus: SsmaRidStatus) => void;
}

export default function SsmaRidDetalhesModal({
  desvio,
  user,
  onClose,
  onDelete,
  onRestore,
  onStatusChange,
}: SsmaRidDetalhesModalProps) {
  const toast = useToast();
  const [fotoAmpliada, setFotoAmpliada] = useState<{ url: string; tipo?: 'antes' | 'depois' } | null>(null);
  const [salvandoStatus, setSalvandoStatus] = useState(false);

  const [novoStatus, setNovoStatus] = useState<SsmaRidStatus>(desvio.status);
  const [parecerTexto, setParecerTexto] = useState(desvio.parecer_ssma || '');
  const [confirmarExclusao, setConfirmarExclusao] = useState(false);

  const podeEditar = canEditDesvioRid(user, desvio);
  const podeExcluir = canDeleteDesvioRid(user, desvio);
  const ehAdmin = user.roles.includes('admin');

  const handleSalvarStatus = async () => {
    setSalvandoStatus(true);
    try {
      await atualizarStatusDesvioRid(desvio.id, novoStatus, parecerTexto.trim() || null);
      toast.success('Status e parecer do RID atualizados com sucesso!');
      if (onStatusChange) onStatusChange(desvio.id, novoStatus);
    } catch (err: any) {
      toast.error(`Falha ao atualizar status: ${err.message}`);
    } finally {
      setSalvandoStatus(false);
    }
  };

  const getStatusBadge = (st: SsmaRidStatus) => {
    switch (st) {
      case 'CONCLUIDO':
        return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300';
      case 'EM_TRATAMENTO':
        return 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300';
      case 'CANCELADO':
        return 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300';
      default:
        return 'bg-blue-100 text-blue-800 dark:bg-blue-950/70 dark:text-blue-300';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/60 p-4 backdrop-blur-xs">
      <div className="relative w-full max-w-3xl rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900 overflow-hidden my-8">
        {/* Cabeçalho do Modal */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-6 py-4 dark:border-slate-800 dark:bg-slate-950/50">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500 text-white shadow-md shadow-emerald-500/20">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md dark:bg-emerald-950/60 dark:text-emerald-300">
                  {desvio.numero_registro}
                </span>
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold ${getStatusBadge(
                    desvio.status
                  )}`}
                >
                  {desvio.status}
                </span>
                {desvio.excluido_em && (
                  <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700 dark:bg-rose-950 dark:text-rose-300">
                    Excluído
                  </span>
                )}
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Ficha do Registro de Identificação de Desvio
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => window.print()}
              title="Imprimir"
              className="rounded-xl p-2 text-slate-400 hover:bg-slate-200/60 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition-colors"
            >
              <Printer className="h-4 w-4" />
            </button>
            <button
              onClick={onClose}
              className="rounded-xl p-2 text-slate-400 hover:bg-slate-200/60 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Corpo do Modal */}
        <div className="max-h-[75vh] overflow-y-auto p-6 space-y-6">
          {/* Linha de Metadados: Informante, Setor, Data, Semana */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 rounded-2xl bg-slate-50 p-4 dark:bg-slate-950/40 border border-slate-100 dark:border-slate-800">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Informante
              </span>
              <p className="mt-0.5 text-xs font-bold text-slate-800 dark:text-slate-100">
                {desvio.nome_informante}
              </p>
              <p className="text-[11px] text-slate-500">Mat: {desvio.matricula_informante || 'S/N'}</p>
            </div>

            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Setor
              </span>
              <p className="mt-0.5 text-xs font-bold text-slate-800 dark:text-slate-100">
                {desvio.setor}
              </p>
              <p className="text-[11px] text-slate-500">{desvio.empresa}</p>
            </div>

            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Data do Registro
              </span>
              <p className="mt-0.5 text-xs font-bold text-slate-800 dark:text-slate-100">
                {desvio.data_registro
                  ? new Date(desvio.data_registro + 'T12:00:00Z').toLocaleDateString('pt-BR')
                  : '-'}
              </p>
              <p className="text-[11px] text-slate-500">{desvio.semana}</p>
            </div>

            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Área / Local
              </span>
              <p className="mt-0.5 text-xs font-bold text-slate-800 dark:text-slate-100">
                {desvio.area_desvio}
              </p>
              {desvio.area_desvio_outro && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400 font-semibold">
                  {desvio.area_desvio_outro}
                </p>
              )}
            </div>
          </div>

          {/* Descrição do Desvio */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
              Descrição do Desvio
            </h4>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 text-xs font-medium leading-relaxed text-slate-800 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200">
              {desvio.descricao_desvio}
            </div>
          </div>

          {/* Resolução & Ações */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div
              className={`rounded-2xl p-4 border ${
                desvio.sanado_imediato
                  ? 'border-emerald-200 bg-emerald-50/50 dark:border-emerald-900/40 dark:bg-emerald-950/20'
                  : 'border-rose-200 bg-rose-50/50 dark:border-rose-900/40 dark:bg-rose-950/20'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                {desvio.sanado_imediato ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <XCircle className="h-4 w-4 text-rose-600 dark:text-rose-400" />
                )}
                <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                  {desvio.sanado_imediato ? 'Sanado Imediatamente' : 'Não Sanado Imediatamente'}
                </span>
              </div>
              <p className="text-xs text-slate-700 dark:text-slate-300">
                {desvio.sanado_imediato
                  ? desvio.acao_imediata || 'Sem detalhamento de ação imediata.'
                  : desvio.acao_proposta || 'Sem sugestão de ação corretiva.'}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-950/30 space-y-2">
              <span className="text-xs font-bold text-slate-900 dark:text-slate-100 block">
                Comunicação Operacional
              </span>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Comunicado ao Responsável da Área:</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">
                  {desvio.comunicado_responsavel_area ? 'SIM' : 'NÃO'}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Comunicado à Segurança do Trabalho:</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">
                  {desvio.comunicado_seguranca ? 'SIM' : 'NÃO'}
                </span>
              </div>
              {desvio.comunicado_seguranca && (
                <div className="flex items-center justify-between text-xs border-t border-slate-200/60 pt-1.5 dark:border-slate-800">
                  <span className="text-slate-500">Profissional Informado:</span>
                  <span className="font-bold text-blue-600 dark:text-blue-400">
                    {desvio.responsavel_seguranca_informado || 'N/A'}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Classificações de Risco */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Classificação do Risco Identificado
            </h4>

            {desvio.comportamentos_inseguros?.length > 0 && (
              <div>
                <span className="text-[11px] font-bold text-rose-700 dark:text-rose-400 block mb-1.5">
                  Comportamento Inseguro:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {desvio.comportamentos_inseguros.map((c) => (
                    <span
                      key={c}
                      className="rounded-xl bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-800 border border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-900"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {desvio.condicoes_inseguras?.length > 0 && (
              <div>
                <span className="text-[11px] font-bold text-amber-700 dark:text-amber-400 block mb-1.5">
                  Condição Insegura:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {desvio.condicoes_inseguras.map((c) => (
                    <span
                      key={c}
                      className="rounded-xl bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900 border border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-900"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {desvio.classificacao_outro && (
              <p className="text-xs text-slate-600 dark:text-slate-400">
                <strong className="text-slate-800 dark:text-slate-200">Outra classificação:</strong>{' '}
                {desvio.classificacao_outro}
              </p>
            )}
          </div>

          {/* Fotos e Evidências (Antes e Depois) */}
          {desvio.fotos && desvio.fotos.length > 0 && (() => {
            const fotosAntes = desvio.fotos.filter((f) => f.tipo !== 'depois');
            const fotosDepois = desvio.fotos.filter((f) => f.tipo === 'depois');

            return (
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2 dark:border-slate-800">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Evidências Fotográficas ({desvio.fotos.length})
                  </h4>
                  <div className="flex items-center gap-2 text-[11px]">
                    {fotosAntes.length > 0 && (
                      <span className="rounded-md bg-amber-50 px-2 py-0.5 font-bold text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                        {fotosAntes.length} Antes
                      </span>
                    )}
                    {fotosDepois.length > 0 && (
                      <span className="rounded-md bg-emerald-50 px-2 py-0.5 font-bold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                        {fotosDepois.length} Depois
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Bloco Antes */}
                  {fotosAntes.length > 0 && (
                    <div className="rounded-2xl border border-amber-200/80 bg-amber-50/20 p-3.5 dark:border-amber-900/40 dark:bg-amber-950/10">
                      <div className="flex items-center gap-1.5 mb-2.5">
                        <span className="inline-flex items-center justify-center rounded-md bg-amber-500 text-white p-0.5 text-[10px]">
                          <AlertTriangle className="h-3 w-3" />
                        </span>
                        <h5 className="text-xs font-bold text-amber-900 dark:text-amber-200">
                          Antes da Intervenção ({fotosAntes.length})
                        </h5>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {fotosAntes.map((foto, idx) => (
                          <div
                            key={foto.id || idx}
                            onClick={() => foto.preview_url && setFotoAmpliada({ url: foto.preview_url, tipo: 'antes' })}
                            className="group relative aspect-4/3 overflow-hidden rounded-xl border border-amber-200 bg-slate-100 cursor-pointer dark:border-amber-900/50 dark:bg-slate-900 shadow-xs"
                          >
                            {foto.preview_url ? (
                              <img
                                src={foto.preview_url}
                                alt={`Antes ${idx + 1}`}
                                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-xs text-slate-400">
                                Foto indisponível
                              </div>
                            )}
                            <span className="absolute top-1.5 left-1.5 rounded bg-amber-600/90 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white shadow-xs">
                              Antes
                            </span>
                            <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-bold">
                              Ampliar
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Bloco Depois */}
                  {fotosDepois.length > 0 && (
                    <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/20 p-3.5 dark:border-emerald-900/40 dark:bg-emerald-950/10">
                      <div className="flex items-center gap-1.5 mb-2.5">
                        <span className="inline-flex items-center justify-center rounded-md bg-emerald-600 text-white p-0.5 text-[10px]">
                          <CheckCircle2 className="h-3 w-3" />
                        </span>
                        <h5 className="text-xs font-bold text-emerald-900 dark:text-emerald-200">
                          Depois da Ação ({fotosDepois.length})
                        </h5>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {fotosDepois.map((foto, idx) => (
                          <div
                            key={foto.id || idx}
                            onClick={() => foto.preview_url && setFotoAmpliada({ url: foto.preview_url, tipo: 'depois' })}
                            className="group relative aspect-4/3 overflow-hidden rounded-xl border border-emerald-200 bg-slate-100 cursor-pointer dark:border-emerald-900/50 dark:bg-slate-900 shadow-xs"
                          >
                            {foto.preview_url ? (
                              <img
                                src={foto.preview_url}
                                alt={`Depois ${idx + 1}`}
                                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-xs text-slate-400">
                                Foto indisponível
                              </div>
                            )}
                            <span className="absolute top-1.5 left-1.5 rounded bg-emerald-600/90 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white shadow-xs">
                              Depois
                            </span>
                            <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-bold">
                              Ampliar
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Tratamento SSMA / Atualização de Status */}
          {podeEditar ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-950/40 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Parecer e Atualização de Status
                </span>
                <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-md">
                  {ehAdmin ? 'Acesso Administrativo' : 'Autor do Registro'}
                </span>
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <select
                  value={novoStatus}
                  onChange={(e) => setNovoStatus(e.target.value as SsmaRidStatus)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                >
                  <option value="REGISTRADO">REGISTRADO</option>
                  <option value="EM_TRATAMENTO">EM TRATAMENTO</option>
                  <option value="CONCLUIDO">CONCLUÍDO</option>
                  <option value="CANCELADO">CANCELADO</option>
                </select>

                <input
                  type="text"
                  placeholder="Parecer ou notas da equipe de SSMA..."
                  value={parecerTexto}
                  onChange={(e) => setParecerTexto(e.target.value)}
                  className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />

                <button
                  type="button"
                  disabled={salvandoStatus}
                  onClick={handleSalvarStatus}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-blue-500 disabled:opacity-50 transition-colors"
                >
                  {salvandoStatus ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  )}
                  Salvar
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200/80 bg-slate-50/40 p-3.5 dark:border-slate-800 dark:bg-slate-950/30">
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <Lock className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                <span>Visualização em modo somente leitura (edição restrita ao autor do registro ou administradores).</span>
              </div>
              {desvio.parecer_ssma && (
                <div className="mt-2 text-xs text-slate-700 dark:text-slate-300 pl-5 border-l-2 border-slate-200 dark:border-slate-700">
                  <strong className="text-slate-900 dark:text-slate-100">Parecer:</strong> {desvio.parecer_ssma}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Rodapé do Modal com Ações */}
        <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/80 px-6 py-3.5 dark:border-slate-800 dark:bg-slate-950/50">
          <div>
            {podeExcluir && (
              <>
                {desvio.excluido_em ? (
                  ehAdmin && onRestore && (
                    <button
                      onClick={() => onRestore(desvio.id)}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:text-emerald-300 transition-colors"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Restaurar Registro
                    </button>
                  )
                ) : (
                  onDelete && (
                    <button
                      onClick={() => setConfirmarExclusao(true)}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100 dark:bg-rose-950/60 dark:text-rose-300 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Excluir Registro
                    </button>
                  )
                )}
              </>
            )}
          </div>

          <button
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-white px-5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>

      {/* Modal de Foto Ampliada */}
      {fotoAmpliada && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center bg-black/85 p-4"
          onClick={() => setFotoAmpliada(null)}
        >
          <div className="relative max-h-[90vh] max-w-4xl overflow-hidden rounded-2xl">
            <img src={fotoAmpliada.url} alt="Foto Ampliada" className="h-full w-full object-contain" />
            <span
              className={`absolute top-3 left-3 rounded-lg px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-white shadow-md ${
                fotoAmpliada.tipo === 'depois' ? 'bg-emerald-600' : 'bg-amber-600'
              }`}
            >
              {fotoAmpliada.tipo === 'depois' ? 'Depois da Ação' : 'Antes da Intervenção'}
            </span>
            <button
              onClick={() => setFotoAmpliada(null)}
              className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/70 text-white hover:bg-black cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}


      {/* Confirmação de Exclusão */}
      {confirmarExclusao && (
        <ConfirmDialog
          titulo="Excluir Registro de Desvio (RID)"
          mensagem={`Deseja realmente excluir o registro ${desvio.numero_registro}? O registro será marcado como excluído logicamente e poderá ser restaurado por um administrador.`}
          confirmarLabel="Sim, excluir"
          cancelarLabel="Cancelar"
          variante="perigo"
          onConfirmar={() => {
            setConfirmarExclusao(false);
            if (onDelete) onDelete(desvio.id);
            onClose();
          }}
          onCancelar={() => setConfirmarExclusao(false)}
        />
      )}
    </div>
  );
}
