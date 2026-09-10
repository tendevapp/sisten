/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  X, Send, MessageSquare, Loader2, Package, Building2, MapPin, Calendar,
  Truck, CheckCircle2, FileText, User as UserIcon, AlertCircle, History, Flag, Check,
  CircleDollarSign, Tag, Image as ImageIcon, CalendarClock,
} from 'lucide-react';
import { localDb } from '../../db/localDb';
import { Profile, RastreioMensagem, RastreioPrioridade, SAPObsHistory } from '../../types';
import {
  RastreioRow, DELIVERY_STATUS_META, deriveDeliveryStatus, formatDateBR, formatDateTimeBR, formatBRL,
  PRIORITY_LEVELS, priorityMeta, latestPriorityByRi, hasValue,
} from '../../lib/rastreio';
import { resumirBahiaSulPorPo, normalizePoNumber } from '../../lib/bahiasul';
import { gravarPrevisaoNoRastreio } from '../../lib/diligenciamentoApi';

// Uma entrada da linha do tempo da conversa: mensagem de chat ou uma
// atualização de observação registrada pelo comprador (histórico de
// obs_comprador, vindo da tela Itens Sem PO). Mescladas por data para dar
// o contexto completo da negociação num único lugar.
type TimelineEntry =
  | { kind: 'msg'; created_at: string; msg: RastreioMensagem }
  | { kind: 'obs'; created_at: string; obs: SAPObsHistory };

interface Props {
  row: RastreioRow;
  user: Profile;
  hoje: Date;
  onClose: () => void;
  onThreadRead?: () => void; // avisa o pai para reavaliar indicadores de não-lido
  canSeeValores: boolean;
}

function Field({ label, children, icon: Icon }: { label: string; children: React.ReactNode; icon?: any }) {
  return (
    <div className="min-w-0">
      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 flex items-center gap-1">
        {Icon && <Icon className="h-3 w-3" />}{label}
      </span>
      <div className="mt-0.5 text-sm text-slate-800 dark:text-slate-200 font-semibold break-words">{children}</div>
    </div>
  );
}

/**
 * Imagens do item, para o comprador não precisar abrir a solicitação de origem
 * só para ver o que foi pedido. Primeiro os anexos do item da solicitação SISTEN
 * vinculada (quando há vínculo); na falta, qualquer imagem já enviada para o
 * mesmo código de material (o "banco de imagens por material"). Some se não há
 * nenhuma imagem — nada de seção vazia.
 */
function ItemImages({ row }: { row: RastreioRow }) {
  const [urls, setUrls] = useState<{ id: string; url: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const imagens = useMemo(() => {
    const vinc = row.vinculoSisten;
    const doItem = vinc ? localDb.getAttachments(vinc.item.request_id, vinc.item.id) : [];
    const base = doItem.length > 0
      ? doItem
      : (row.material && row.material !== '—' ? localDb.getAttachmentsByMaterialCode(row.material) : []);
    return base.filter(a => (a.mime_type || '').startsWith('image/'));
  }, [row.vinculoSisten, row.material]);

  useEffect(() => {
    let cancelado = false;
    setLoading(true);
    (async () => {
      const resolvidas: { id: string; url: string; name: string }[] = [];
      for (const a of imagens) {
        const url = await localDb.getAttachmentUrl(a.storage_path || a.url);
        if (url) resolvidas.push({ id: a.id, url, name: a.name });
      }
      if (!cancelado) { setUrls(resolvidas); setLoading(false); }
    })();
    return () => { cancelado = true; };
  }, [imagens]);

  if (!loading && urls.length === 0) return null;

  return (
    <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
      <h4 className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
        <ImageIcon className="h-4 w-4 text-emerald-600 dark:text-emerald-500" /> Imagem do item
      </h4>
      {loading ? (
        <div className="flex items-center gap-2 text-xs text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /> Carregando imagens…</div>
      ) : (
        <div className="flex flex-wrap gap-3">
          {urls.map(u => (
            <a
              key={u.id}
              href={u.url}
              target="_blank"
              rel="noopener noreferrer"
              title={u.name}
              className="block h-28 w-28 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 hover:ring-2 hover:ring-emerald-500/40 transition-all"
            >
              <img src={u.url} alt={u.name} loading="lazy" className="h-full w-full object-cover" />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

export default function RastreioDetailModal({ row, user, hoje, onClose, onThreadRead, canSeeValores }: Props) {
  const [messages, setMessages] = useState<RastreioMensagem[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(true);
  const [msgError, setMsgError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const delivery = deriveDeliveryStatus(row, hoje);
  const deliveryMeta = DELIVERY_STATUS_META[delivery];

  // Histórico de observações do comprador para este item (RI), registrado a
  // cada atualização feita na tela Itens Sem PO. Só entram entradas com texto
  // (mudanças só de status não trazem comentário e ficariam vazias aqui).
  const obsHistory = useMemo(
    () => localDb.getObsHistory(row.ri).filter(h => (h.obs_comprador || '').trim().length > 0),
    [row.ri]
  );

  // Linha do tempo unificada: mensagens do chat + histórico de observações,
  // ordenados cronologicamente.
  const timeline = useMemo<TimelineEntry[]>(() => {
    const msgEntries: TimelineEntry[] = messages.map(m => ({ kind: 'msg', created_at: m.created_at, msg: m }));
    const obsEntries: TimelineEntry[] = obsHistory.map(h => ({ kind: 'obs', created_at: h.created_at, obs: h }));
    return [...msgEntries, ...obsEntries].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
  }, [messages, obsHistory]);

  // Pedidos de priorização deste item (RI). O nível atual é o mais recente;
  // histórico completo fica disponível para o comprador acompanhar escaladas.
  const [prioridades, setPrioridades] = useState<RastreioPrioridade[]>(
    () => localDb.getRastreioPrioridades().filter(p => p.ri === row.ri)
  );
  const currentPriority = useMemo(() => latestPriorityByRi(prioridades).get(row.ri), [prioridades, row.ri]);
  const [selectedPriority, setSelectedPriority] = useState<number | null>(null);
  const [savingPriority, setSavingPriority] = useState(false);
  const [priorityError, setPriorityError] = useState<string | null>(null);
  const [prioritySaved, setPrioritySaved] = useState(false);

  const handleSavePriority = async () => {
    if (!selectedPriority || savingPriority) return;
    setSavingPriority(true);
    setPriorityError(null);
    try {
      const saved = await localDb.setRastreioPrioridade(
        row.ri,
        row.rm !== '—' ? row.rm : undefined,
        selectedPriority,
        row.grupoComprador || undefined
      );
      setPrioridades(prev => [...prev, saved]);
      setSelectedPriority(null);
      setPrioritySaved(true);
      setTimeout(() => setPrioritySaved(false), 3000);
    } catch (e) {
      console.error('Erro ao salvar prioridade:', e);
      setPriorityError('Falha ao salvar. Tente novamente.');
    } finally {
      setSavingPriority(false);
    }
  };

  // Previsão de entrega pela transportadora Bahia Sul: quando há CTe vinculado
  // ao PO deste item, a `prv_chegada`/`prv_entrega` do conhecimento serve de
  // previsão pronta — o comprador confirma com um clique em vez de digitar.
  const [bsPrevisao, setBsPrevisao] = useState<string | null>(null);
  const [bsCtos, setBsCtos] = useState<string[]>([]);
  const [bsSaving, setBsSaving] = useState(false);
  const [bsError, setBsError] = useState<string | null>(null);
  const [previstaLocal, setPrevistaLocal] = useState(row.dataPrevista);

  useEffect(() => {
    setPrevistaLocal(row.dataPrevista);
    if (!row.po || row.po === '—' || hasValue(row.dataEntrega)) {
      setBsPrevisao(null);
      setBsCtos([]);
      return;
    }
    let cancelado = false;
    (async () => {
      try {
        // Mesmo padrão do Diligenciamento: baixa todas as entregas e casa pelo
        // PO normalizado (sem zero à esquerda / sufixo). O filtro `.eq` exato
        // errava quando `nro_pedido` vinha com zeros ou sufixo na planilha.
        const entregas = await localDb.getBahiaSulEntregas();
        const resumo = resumirBahiaSulPorPo(entregas).get(normalizePoNumber(row.po));
        if (cancelado) return;
        // "O que já tem": previsão de chegada/entrega do CTe; na falta dela,
        // a data física já registrada pela transportadora.
        const data = resumo?.previsaoChegada || resumo?.dataChegadaFisica || null;
        setBsPrevisao(data);
        setBsCtos(resumo?.ctos.filter(Boolean) ?? []);
      } catch (e) {
        console.error('Erro ao buscar previsão da Bahia Sul:', e);
        if (!cancelado) { setBsPrevisao(null); setBsCtos([]); }
      }
    })();
    return () => { cancelado = true; };
  }, [row.po, row.dataPrevista, row.dataEntrega]);

  const previsaoJaConfirmada = hasValue(previstaLocal) && previstaLocal === bsPrevisao;

  const handleUsarPrevisaoBahiaSul = async () => {
    if (!bsPrevisao || bsSaving) return;
    setBsSaving(true);
    setBsError(null);
    try {
      const { falhas } = await gravarPrevisaoNoRastreio([row.ri], bsPrevisao);
      if (falhas.length > 0) {
        setBsError('Não foi possível gravar a previsão. Tente novamente.');
        return;
      }
      setPrevistaLocal(bsPrevisao);
    } catch (e) {
      console.error('Erro ao gravar previsão da Bahia Sul no Rastreio:', e);
      setBsError('Não foi possível gravar a previsão. Tente novamente.');
    } finally {
      setBsSaving(false);
    }
  };

  const scrollToBottom = () => {
    requestAnimationFrame(() => {
      if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
    });
  };

  const loadMessages = useCallback(async () => {
    setLoadingMsgs(true);
    setMsgError(null);
    try {
      const msgs = await localDb.fetchRastreioMensagens(row.ri);
      setMessages(msgs);
      scrollToBottom();
    } catch (e) {
      console.error('Erro ao carregar mensagens:', e);
      setMsgError('Não foi possível carregar as mensagens.');
    } finally {
      setLoadingMsgs(false);
    }
  }, [row.ri]);

  useEffect(() => {
    loadMessages();
    // Marca as notificações de mensagens desta thread como lidas.
    localDb.markRastreioThreadRead(row.ri, user.id);
    onThreadRead?.();
  }, [loadMessages, row.ri, user.id, onThreadRead]);

  // Fecha com ESC.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setMsgError(null);
    try {
      const participantesPrevios = Array.from(new Set(messages.map(m => m.autor_id)));
      const saved = await localDb.sendRastreioMensagem(row.ri, text, {
        rm: row.rm !== '—' ? row.rm : undefined,
        descricao: row.descricao,
        grupoComprador: row.grupoComprador || undefined,
        participantesPrevios,
      });
      setMessages(prev => [...prev, saved]);
      setDraft('');
      scrollToBottom();
    } catch (e: any) {
      console.error('Erro ao enviar mensagem:', e);
      setMsgError('Falha ao enviar. Tente novamente.');
    } finally {
      setSending(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-xs p-0 sm:p-4 animate-fade-in" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-900 w-full sm:max-w-3xl max-h-[92vh] sm:max-h-[88vh] rounded-t-2xl sm:rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-sm font-black text-slate-800 dark:text-slate-100">RM {row.rm}</span>
              {row.po !== '—' && <span className="font-mono text-xs text-slate-500 dark:text-slate-400">· PO {row.po}</span>}
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold ${deliveryMeta.badge}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${deliveryMeta.dot}`} />{deliveryMeta.label}
              </span>
              {currentPriority && (
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold ${priorityMeta(currentPriority.nivel).badge}`} title={`Solicitado por ${currentPriority.solicitante_nome}`}>
                  <Flag className="h-2.5 w-2.5" /> Prioridade {currentPriority.nivel}
                </span>
              )}
              {row.isGeneric && (
                <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                  <Tag className="h-2.5 w-2.5" /> Item Genérico
                </span>
              )}
            </div>
            <p className="mt-1 text-sm font-semibold text-slate-700 dark:text-slate-300 truncate">{row.descricao}</p>
          </div>
          <button onClick={onClose} className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 transition-colors" aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Detalhes */}
          <div className="px-5 py-4 grid grid-cols-2 md:grid-cols-3 gap-4 border-b border-slate-100 dark:border-slate-800">
            <Field label="Material" icon={Package}>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-mono">{row.material}</span>
                {row.isGeneric && (
                  <span className="inline-flex items-center gap-0.5 text-[9px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                    <Tag className="h-2 w-2" /> Item Genérico
                  </span>
                )}
              </div>
            </Field>
            <Field label="Fornecedor" icon={Truck}>{row.fornecedor}</Field>
            <Field label="Setor" icon={Building2}>{row.setor}</Field>
            <Field label="Quantidade" icon={Package}>{row.qtd !== undefined ? `${row.qtd.toLocaleString('pt-BR')}${row.unidade !== '—' ? ` ${row.unidade}` : ''}` : '—'}</Field>
            {canSeeValores && row.precoUnitario !== undefined && (
              <Field label="Preço unit." icon={CircleDollarSign}>{formatBRL(row.precoUnitario)}</Field>
            )}
            {canSeeValores && row.valorTotal !== undefined && (
              <Field label="Valor total" icon={CircleDollarSign}>
                <span className="text-emerald-600 dark:text-emerald-400">{formatBRL(row.valorTotal)}</span>
              </Field>
            )}
            <Field label="Status" icon={MapPin}>{row.status}</Field>
            <Field label="Data RM" icon={Calendar}>{formatDateBR(row.dataCriacao)}</Field>
            <Field label="Data PO" icon={Calendar}>{formatDateBR(row.dataPo)}</Field>
            <Field label="Prev. entrega" icon={Calendar}>{formatDateBR(row.dataPrevista)}</Field>
            <Field label="Entrega (MIGO)" icon={CheckCircle2}>{formatDateBR(row.dataEntrega)}</Field>
            {row.grupoComprador && <Field label="Grupo comprador" icon={UserIcon}>{row.grupoComprador}</Field>}
            {row.isGeneric && row.obsGenerica && (
              <div className="col-span-2 md:col-span-3">
                <Field label="Especificação do Item Genérico (SISTEN)" icon={Tag}>
                  <span className="font-semibold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 p-2.5 rounded-lg border border-amber-200 dark:border-amber-800/60 block whitespace-pre-wrap">
                    {row.obsGenerica}
                  </span>
                </Field>
              </div>
            )}
            {row.observacoes !== '—' && (
              <div className="col-span-2 md:col-span-3">
                <Field label="Observações do comprador" icon={FileText}>
                  <span className="font-normal text-slate-600 dark:text-slate-300 whitespace-pre-wrap">{row.observacoes}</span>
                </Field>
              </div>
            )}
          </div>

          {/* Imagem do item (anexos da solicitação vinculada ou do material) */}
          <ItemImages row={row} />

          {/* Previsão de entrega pela Bahia Sul */}
          {bsPrevisao && (
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
              <h4 className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                <CalendarClock className="h-4 w-4 text-emerald-600 dark:text-emerald-500" /> Previsão de entrega — Bahia Sul
              </h4>
              {previsaoJaConfirmada ? (
                <p className="text-[13px] text-slate-600 dark:text-slate-300">
                  Previsão preenchida com a data da transportadora Bahia Sul:{' '}
                  <span className="font-bold text-slate-800 dark:text-slate-200">{formatDateBR(bsPrevisao)}</span>
                  {bsCtos.length > 0 && <span className="text-slate-400 dark:text-slate-500"> · CTe {bsCtos.join(', ')}</span>}
                </p>
              ) : (
                <>
                  <p className="text-[13px] text-slate-600 dark:text-slate-300">
                    A Bahia Sul prevê a entrega deste pedido em{' '}
                    <span className="font-bold text-slate-800 dark:text-slate-200">{formatDateBR(bsPrevisao)}</span>
                    {bsCtos.length > 0 && <span className="text-slate-400 dark:text-slate-500"> · CTe {bsCtos.join(', ')}</span>}.
                    {hasValue(previstaLocal) && (
                      <span className="text-slate-400 dark:text-slate-500"> Previsão atual no Rastreio: {formatDateBR(previstaLocal)}.</span>
                    )}
                  </p>
                  <div className="mt-2.5 flex items-center gap-2 flex-wrap">
                    <button
                      onClick={handleUsarPrevisaoBahiaSul}
                      disabled={bsSaving}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
                    >
                      {bsSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CalendarClock className="h-3.5 w-3.5" />}
                      {hasValue(previstaLocal) ? 'Atualizar previsão pela Bahia Sul' : 'Preencher previsão pela Bahia Sul'}
                    </button>
                    {bsError && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600 dark:text-rose-400">
                        <AlertCircle className="h-3.5 w-3.5" /> {bsError}
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Solicitar Prioridade */}
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
            <h4 className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
              <Flag className="h-4 w-4 text-emerald-600 dark:text-emerald-500" /> Solicitar Prioridade
            </h4>
            {currentPriority ? (
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-3">
                Prioridade atual: <span className="font-bold text-slate-700 dark:text-slate-300">Grau {currentPriority.nivel}</span> · solicitado por {currentPriority.solicitante_nome} em {formatDateTimeBR(currentPriority.created_at)}
              </p>
            ) : (
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-3">
                Nenhuma prioridade solicitada ainda. Escolha um grau na escala de criticidade para pedir atenção do comprador.
              </p>
            )}

            <select
              value={selectedPriority ?? ''}
              onChange={(e) => setSelectedPriority(e.target.value ? Number(e.target.value) : null)}
              style={{ borderLeftColor: selectedPriority !== null ? priorityMeta(selectedPriority).hex : undefined, borderLeftWidth: selectedPriority !== null ? 4 : undefined }}
              className="w-full text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 py-2 px-2.5 focus:border-emerald-500 focus:outline-none transition-all"
            >
              <option value="" disabled>Selecione um grau de criticidade...</option>
              {PRIORITY_LEVELS.map(p => (
                <option key={p.level} value={p.level} style={{ color: p.hex }}>
                  ● Grau {p.level} — {p.label}
                </option>
              ))}
            </select>
            {selectedPriority !== null && (
              <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                <span className={`h-2 w-2 rounded-full ${priorityMeta(selectedPriority).dot}`} />
                <span style={{ color: priorityMeta(selectedPriority).hex }} className="font-bold">Grau {selectedPriority}</span>
                {priorityMeta(selectedPriority).label}
              </p>
            )}

            <div className="mt-3 flex items-center gap-2">
              <button
                onClick={handleSavePriority}
                disabled={!selectedPriority || savingPriority}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
              >
                {savingPriority ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Flag className="h-3.5 w-3.5" />}
                Salvar prioridade
              </button>
              {prioritySaved && (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                  <Check className="h-3.5 w-3.5" /> Comprador notificado
                </span>
              )}
              {priorityError && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600 dark:text-rose-400">
                  <AlertCircle className="h-3.5 w-3.5" /> {priorityError}
                </span>
              )}
            </div>
          </div>

          {/* Conversa */}
          <div className="px-5 py-4">
            <h4 className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
              <MessageSquare className="h-4 w-4 text-emerald-600 dark:text-emerald-500" /> Conversa
            </h4>

            <div ref={listRef} className="space-y-2.5 max-h-[34vh] overflow-y-auto pr-1">
              {loadingMsgs ? (
                <div className="flex items-center justify-center py-8 text-slate-400"><Loader2 className="h-5 w-5 animate-spin" /></div>
              ) : timeline.length === 0 ? (
                <p className="text-center text-xs text-slate-400 dark:text-slate-500 py-6">
                  Nenhuma mensagem ou observação ainda. Escreva abaixo para iniciar a conversa com o comprador.
                </p>
              ) : (
                timeline.map((entry, idx) => {
                  if (entry.kind === 'obs') {
                    const h = entry.obs;
                    return (
                      <div key={`obs-${h.id}-${idx}`} className="flex justify-center">
                        <div className="max-w-[90%] w-full rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/60 dark:bg-amber-950/15 px-3 py-2">
                          <p className="flex items-center gap-1.5 text-[10px] font-bold text-amber-700 dark:text-amber-400">
                            <History className="h-3 w-3 shrink-0" /> Observação do comprador — {h.user_name}
                          </p>
                          <p className="mt-1 text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-words">{h.obs_comprador}</p>
                          <p className="mt-0.5 text-[9px] text-amber-600/80 dark:text-amber-500/70">{formatDateTimeBR(h.created_at)}</p>
                        </div>
                      </div>
                    );
                  }
                  const m = entry.msg;
                  const mine = m.autor_id === user.id;
                  return (
                    <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[80%] rounded-2xl px-3 py-2 ${mine ? 'bg-emerald-600 text-white rounded-br-sm' : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-bl-sm'}`}>
                        {!mine && <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-0.5">{m.autor_nome}</p>}
                        <p className="text-sm whitespace-pre-wrap break-words">{m.mensagem}</p>
                        <p className={`text-[9px] mt-0.5 ${mine ? 'text-emerald-100/80' : 'text-slate-400 dark:text-slate-500'}`}>{formatDateTimeBR(m.created_at)}</p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {msgError && (
              <div className="mt-2 flex items-center gap-2 text-xs text-rose-600 dark:text-rose-400">
                <AlertCircle className="h-3.5 w-3.5" /> {msgError}
              </div>
            )}
          </div>
        </div>

        {/* Input */}
        <div className="border-t border-slate-100 dark:border-slate-800 p-3 shrink-0 bg-slate-50/50 dark:bg-slate-950/30">
          <div className="flex items-end gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              rows={1}
              placeholder="Escreva uma mensagem..."
              className="flex-1 resize-none rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2.5 text-sm text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 focus:outline-none transition-all max-h-32"
            />
            <button
              onClick={handleSend}
              disabled={!draft.trim() || sending}
              className="flex items-center justify-center h-11 w-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 shrink-0"
              aria-label="Enviar mensagem"
            >
              {sending ? <Loader2 className="h-4.5 w-4.5 animate-spin" /> : <Send className="h-4.5 w-4.5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
