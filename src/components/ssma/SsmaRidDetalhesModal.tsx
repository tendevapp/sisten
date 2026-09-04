/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Modal de Detalhes e Gestão de um Registro de Identificação de Desvio (RID)
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  Camera,
  Paperclip,
  History,
} from 'lucide-react';
import type {
  Profile, SsmaRidDesvio, SsmaRidStatus, SsmaRidFoto, SsmaRidAtualizacao,
} from '../../types';
import {
  atualizarStatusDesvioRid, listarAtualizacoesRid, registrarAtualizacaoRid,
} from '../../lib/ssmaApi';
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
  /** Avisa a lista que o RID mudou (fotos novas, tratamento em andamento). */
  onAtualizacaoLancada?: (id: string) => void;
}

export default function SsmaRidDetalhesModal({
  desvio,
  user,
  onClose,
  onDelete,
  onRestore,
  onStatusChange,
  onAtualizacaoLancada,
}: SsmaRidDetalhesModalProps) {
  const toast = useToast();
  const [fotoAmpliada, setFotoAmpliada] = useState<{ url: string; tipo?: 'antes' | 'depois' } | null>(null);
  const [salvandoStatus, setSalvandoStatus] = useState(false);

  const [novoStatus, setNovoStatus] = useState<SsmaRidStatus>(desvio.status);
  const [parecerTexto, setParecerTexto] = useState(desvio.parecer_ssma || '');
  const [confirmarExclusao, setConfirmarExclusao] = useState(false);

  // --- Acompanhamento do desvio não sanado de imediato ---
  // Só faz sentido para o RID aberto como NÃO sanado: é ele que fica em aberto
  // esperando a correção. O sanado na hora já nasce com o "depois" registrado.
  const emAcompanhamento = !desvio.sanado_imediato && !desvio.excluido_em && desvio.status !== 'CANCELADO';

  const [atualizacoes, setAtualizacoes] = useState<SsmaRidAtualizacao[]>([]);
  const [carregandoAtualizacoes, setCarregandoAtualizacoes] = useState(false);
  const [textoAtualizacao, setTextoAtualizacao] = useState('');
  const [enviandoAtualizacao, setEnviandoAtualizacao] = useState(false);
  // Fotos que subiram nesta sessão do modal: `desvio` é prop e não se atualiza
  // sozinho, então elas entram aqui para a galeria e a linha do tempo já as
  // mostrarem sem fechar e reabrir a ficha.
  const [fotosLocais, setFotosLocais] = useState<SsmaRidFoto[]>([]);

  interface FotoPendente { file: File; preview: string; tipo: 'antes' | 'depois' }
  const [fotosPendentes, setFotosPendentes] = useState<FotoPendente[]>([]);

  const cameraRef = useRef<HTMLInputElement>(null);
  const galeriaRef = useRef<HTMLInputElement>(null);
  const tipoEscolhidoRef = useRef<'antes' | 'depois'>('depois');

  const fotos = useMemo<SsmaRidFoto[]>(
    () => [...(desvio.fotos || []), ...fotosLocais],
    [desvio.fotos, fotosLocais],
  );

  useEffect(() => {
    if (!emAcompanhamento) return;
    setCarregandoAtualizacoes(true);
    listarAtualizacoesRid(desvio.id)
      .then(setAtualizacoes)
      .catch((err) => console.warn('Falha ao carregar atualizações do RID:', err))
      .finally(() => setCarregandoAtualizacoes(false));
  }, [desvio.id, emAcompanhamento]);

  // Os previews são object URLs: sem revogar, cada foto anexada e removida
  // deixa um blob preso na memória da aba.
  useEffect(() => () => { fotosPendentes.forEach((f) => URL.revokeObjectURL(f.preview)); }, [fotosPendentes]);

  const anexarFotos = (files: FileList | null, tipo: 'antes' | 'depois') => {
    if (!files || files.length === 0) return;
    const novas = Array.from(files)
      .filter((f) => f.type.startsWith('image/'))
      .map((file) => ({ file, preview: URL.createObjectURL(file), tipo }));
    setFotosPendentes((prev) => [...prev, ...novas]);
  };

  const alternarTipoPendente = (idx: number) => {
    setFotosPendentes((prev) => prev.map((f, i) => (
      i === idx ? { ...f, tipo: f.tipo === 'antes' ? 'depois' : 'antes' } : f
    )));
  };

  const removerPendente = (idx: number) => {
    setFotosPendentes((prev) => {
      const alvo = prev[idx];
      if (alvo) URL.revokeObjectURL(alvo.preview);
      return prev.filter((_, i) => i !== idx);
    });
  };

  const abrirSeletor = (origem: 'camera' | 'galeria', tipo: 'antes' | 'depois') => {
    tipoEscolhidoRef.current = tipo;
    (origem === 'camera' ? cameraRef : galeriaRef).current?.click();
  };

  const handleLancarAtualizacao = async () => {
    const texto = textoAtualizacao.trim();
    if (!texto) {
      toast.warning('Descreva o que mudou antes de lançar a atualização.');
      return;
    }
    setEnviandoAtualizacao(true);
    try {
      // As fotos são comprimidas no upload (ver `comprimirFoto` em ssmaApi).
      const { atualizacao, fotos: fotosSubidas } = await registrarAtualizacaoRid({
        desvioId: desvio.id,
        texto,
        autorId: user.id,
        autorNome: user.name,
        fotos: fotosPendentes.map((f) => ({ file: f.file, tipo: f.tipo })),
      });
      setAtualizacoes((prev) => [...prev, atualizacao]);
      setFotosLocais((prev) => [...prev, ...fotosSubidas]);
      fotosPendentes.forEach((f) => URL.revokeObjectURL(f.preview));
      setFotosPendentes([]);
      setTextoAtualizacao('');
      const comFoto = fotosSubidas.length > 0 ? ` ${fotosSubidas.length} foto(s) anexada(s).` : '';
      toast.success(`Atualização lançada no RID.${comFoto}`);
      if (onAtualizacaoLancada) onAtualizacaoLancada(desvio.id);
    } catch (err: any) {
      toast.error(`Falha ao lançar a atualização: ${err.message}`);
    } finally {
      setEnviandoAtualizacao(false);
    }
  };

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
          {fotos.length > 0 && (() => {
            const fotosAntes = fotos.filter((f) => f.tipo !== 'depois');
            const fotosDepois = fotos.filter((f) => f.tipo === 'depois');

            return (
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2 dark:border-slate-800">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Evidências Fotográficas ({fotos.length})
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

          {/* Acompanhamento do desvio não sanado: linha do tempo + lançamento */}
          {emAcompanhamento && (
            <div className="rounded-2xl border border-blue-200/70 bg-blue-50/30 p-4 dark:border-blue-900/40 dark:bg-blue-950/15 space-y-4">
              <div className="flex items-center justify-between border-b border-blue-100 pb-2 dark:border-blue-900/40">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center justify-center rounded-lg bg-blue-600 p-1 text-white">
                    <History className="h-3.5 w-3.5" />
                  </span>
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-blue-900 dark:text-blue-200">
                      Acompanhamento do Desvio
                    </h4>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">
                      Este RID foi aberto como NÃO sanado de imediato — lance aqui o que já foi feito.
                    </p>
                  </div>
                </div>
                <span className="rounded-md bg-blue-100 px-2 py-0.5 text-[11px] font-bold text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
                  {atualizacoes.length} lançamento(s)
                </span>
              </div>

              {/* Linha do tempo do que já foi lançado */}
              {carregandoAtualizacoes ? (
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando atualizações...
                </div>
              ) : atualizacoes.length === 0 ? (
                <p className="rounded-xl border border-dashed border-blue-200 p-3 text-center text-[11px] text-slate-500 dark:border-blue-900/40 dark:text-slate-400">
                  Nenhuma atualização lançada até agora.
                </p>
              ) : (
                <ol className="space-y-3">
                  {atualizacoes.map((at) => {
                    const fotosDoLancamento = fotos.filter((f) => at.foto_ids?.includes(f.id));
                    return (
                      <li
                        key={at.id}
                        className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
                      >
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                          <Clock className="h-3 w-3" />
                          <span>{new Date(at.created_at).toLocaleString('pt-BR')}</span>
                          {at.criado_por_nome && (
                            <>
                              <span aria-hidden>·</span>
                              <span className="font-semibold text-slate-700 dark:text-slate-300">{at.criado_por_nome}</span>
                            </>
                          )}
                        </div>
                        <p className="mt-1.5 whitespace-pre-wrap text-xs text-slate-800 dark:text-slate-200">{at.texto}</p>
                        {fotosDoLancamento.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {fotosDoLancamento.map((foto) => (
                              <button
                                key={foto.id}
                                type="button"
                                onClick={() => foto.preview_url && setFotoAmpliada({ url: foto.preview_url, tipo: foto.tipo })}
                                className="relative h-16 w-20 overflow-hidden rounded-lg border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800 cursor-pointer"
                              >
                                {foto.preview_url ? (
                                  <img src={foto.preview_url} alt={foto.name} className="h-full w-full object-cover" />
                                ) : (
                                  <span className="flex h-full w-full items-center justify-center text-[9px] text-slate-400">sem preview</span>
                                )}
                                <span
                                  className={`absolute bottom-0 left-0 right-0 px-1 py-0.5 text-[8px] font-bold uppercase text-white ${
                                    foto.tipo === 'depois' ? 'bg-emerald-600/90' : 'bg-amber-600/90'
                                  }`}
                                >
                                  {foto.tipo === 'depois' ? 'Depois' : 'Antes'}
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ol>
              )}

              {/* Novo lançamento */}
              {podeEditar ? (
                <div className="rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900 space-y-3">
                  <label htmlFor="rid-atualizacao" className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Lançar atualização <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    id="rid-atualizacao"
                    rows={3}
                    value={textoAtualizacao}
                    onChange={(e) => setTextoAtualizacao(e.target.value)}
                    placeholder="O que foi feito desde a abertura? (ação executada, prazo, responsável...)"
                    className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />

                  {/* Entradas de arquivo: o tipo (antes/depois) vem do botão clicado */}
                  <input
                    ref={cameraRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={(e) => { anexarFotos(e.target.files, tipoEscolhidoRef.current); e.target.value = ''; }}
                    className="hidden"
                  />
                  <input
                    ref={galeriaRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) => { anexarFotos(e.target.files, tipoEscolhidoRef.current); e.target.value = ''; }}
                    className="hidden"
                  />

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/30 p-2.5 dark:border-emerald-900/40 dark:bg-emerald-950/15">
                      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold text-emerald-900 dark:text-emerald-200">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Evidência do DEPOIS
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => abrirSeletor('camera', 'depois')}
                          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-emerald-300/80 bg-white py-2 text-[11px] font-bold text-emerald-800 hover:bg-emerald-50 dark:border-emerald-800 dark:bg-slate-800 dark:text-emerald-300 transition-colors cursor-pointer"
                        >
                          <Camera className="h-3.5 w-3.5" /> Tirar Foto
                        </button>
                        <button
                          type="button"
                          onClick={() => abrirSeletor('galeria', 'depois')}
                          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white py-2 text-[11px] font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 transition-colors cursor-pointer"
                        >
                          <Paperclip className="h-3.5 w-3.5" /> Galeria
                        </button>
                      </div>
                    </div>

                    <div className="rounded-xl border border-amber-200/80 bg-amber-50/30 p-2.5 dark:border-amber-900/40 dark:bg-amber-950/15">
                      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold text-amber-900 dark:text-amber-200">
                        <AlertTriangle className="h-3.5 w-3.5" /> Evidência do ANTES
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => abrirSeletor('camera', 'antes')}
                          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-amber-300/80 bg-white py-2 text-[11px] font-bold text-amber-800 hover:bg-amber-50 dark:border-amber-800 dark:bg-slate-800 dark:text-amber-300 transition-colors cursor-pointer"
                        >
                          <Camera className="h-3.5 w-3.5" /> Tirar Foto
                        </button>
                        <button
                          type="button"
                          onClick={() => abrirSeletor('galeria', 'antes')}
                          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white py-2 text-[11px] font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 transition-colors cursor-pointer"
                        >
                          <Paperclip className="h-3.5 w-3.5" /> Galeria
                        </button>
                      </div>
                    </div>
                  </div>

                  {fotosPendentes.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {fotosPendentes.map((f, idx) => (
                        <div
                          key={`${f.preview}-${idx}`}
                          className="group relative h-20 w-24 overflow-hidden rounded-lg border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800"
                        >
                          <img src={f.preview} alt={f.file.name} className="h-full w-full object-cover" />
                          <div className="absolute right-1 top-1 flex gap-1">
                            <button
                              type="button"
                              onClick={() => alternarTipoPendente(idx)}
                              title={f.tipo === 'antes' ? "Marcar como 'Depois'" : "Marcar como 'Antes'"}
                              className="flex h-5 w-5 items-center justify-center rounded bg-slate-900/75 text-white hover:bg-blue-600 transition-colors cursor-pointer"
                            >
                              <RotateCcw className="h-2.5 w-2.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => removerPendente(idx)}
                              title="Remover foto"
                              className="flex h-5 w-5 items-center justify-center rounded bg-rose-600/90 text-white hover:bg-rose-700 transition-colors cursor-pointer"
                            >
                              <Trash2 className="h-2.5 w-2.5" />
                            </button>
                          </div>
                          <span
                            className={`absolute bottom-0 left-0 right-0 px-1 py-0.5 text-[8px] font-bold uppercase text-white ${
                              f.tipo === 'depois' ? 'bg-emerald-600/90' : 'bg-amber-600/90'
                            }`}
                          >
                            {f.tipo === 'depois' ? 'Depois' : 'Antes'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[10px] text-slate-400">
                      As fotos são comprimidas antes do envio (máx. 1600px, JPEG).
                    </p>
                    <button
                      type="button"
                      onClick={handleLancarAtualizacao}
                      disabled={enviandoAtualizacao || !textoAtualizacao.trim()}
                      className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
                    >
                      {enviandoAtualizacao ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                      {enviandoAtualizacao ? 'Enviando...' : 'Lançar atualização'}
                    </button>
                  </div>
                </div>
              ) : (
                <p className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                  <Lock className="h-3.5 w-3.5 shrink-0" />
                  Só o autor do registro ou um administrador pode lançar atualizações.
                </p>
              )}
            </div>
          )}

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
