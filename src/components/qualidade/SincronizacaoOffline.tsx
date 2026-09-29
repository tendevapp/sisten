/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Sincronização dos checklists da Qualidade preenchidos offline — o hook que
 * mantém a fila do aparelho em dia e os elementos de tela que a mostram:
 *
 *   - `useSincronizacaoOffline`: lista as pendências do usuário e envia
 *     sozinho ao montar, ao voltar a rede, ao voltar o foco e a cada minuto.
 *   - `PainelSincronizacao`: indicador geral (sincronizado / N no aparelho /
 *     sem conexão) + "Sincronizar agora", com confirmação antes e resultado
 *     depois.
 *   - `ChipSincronizacao`: selo por checklist (sincronizado ou só no aparelho).
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, CloudCheck, CloudOff, CloudUpload, Loader2, RefreshCw, Trash2, WifiOff, X } from 'lucide-react';
import Modal, { ModalBody, ModalFooter, ModalHeader } from '../ui/Modal';
import ConfirmDialog from '../ui/ConfirmDialog';
import {
  assinarPendencias, descreverPendencia, listarPendencias, sincronizandoModulo, sincronizarPendencias,
  type InfoOffline, type ModuloOffline, type PendenciaOffline, type ResultadoSincronizacao, type SincronizadorPendencia,
} from '../../lib/qualidadeOffline';
import { estaOffline } from '../../lib/rede';

const INTERVALO_AUTOMATICO_MS = 60 * 1000;

function horaCurta(iso: string | null | undefined): string {
  if (!iso) return '';
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return '';
  const hoje = new Date().toDateString() === data.toDateString();
  return hoje
    ? data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : data.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

interface OpcoesHook<P extends PendenciaOffline> {
  modulo: ModuloOffline;
  usuarioId: string;
  sincronizar: SincronizadorPendencia<P>;
  /** Checklist aberto no formulário: a rodada automática não mexe nele (ele sobe ao salvar). */
  abertoId?: string | null;
  /** Chamado ao fim de toda rodada que enviou algo ou falhou (automática ou manual). */
  onResultado?: (resultado: ResultadoSincronizacao, automatico: boolean) => void;
}

export function useSincronizacaoOffline<P extends PendenciaOffline>({ modulo, usuarioId, sincronizar, abertoId, onResultado }: OpcoesHook<P>) {
  const [pendencias, setPendencias] = useState<P[]>([]);
  const [online, setOnline] = useState(() => !estaOffline());
  const [sincronizando, setSincronizando] = useState(false);
  const [ultimaSincronizacao, setUltimaSincronizacao] = useState<string | null>(null);
  const abertoRef = useRef(abertoId);
  abertoRef.current = abertoId;
  const sincronizarRef = useRef(sincronizar);
  sincronizarRef.current = sincronizar;
  const onResultadoRef = useRef(onResultado);
  onResultadoRef.current = onResultado;

  const recarregar = useCallback(async () => {
    const rodando = sincronizandoModulo(modulo);
    try {
      const lidas = await listarPendencias<P>(modulo, usuarioId);
      // "Enviando" de uma rodada interrompida (aba fechada no meio) volta a ser pendente.
      setPendencias(rodando ? lidas : lidas.map(p => p.estado === 'sincronizando' ? { ...p, estado: 'pendente' } : p));
    } catch (erro) {
      console.warn('Qualidade offline: não foi possível ler as pendências do aparelho', erro);
    }
    setSincronizando(rodando);
  }, [modulo, usuarioId]);

  const executar = useCallback(async (opcoes: { ids?: string[]; incluirAberto?: boolean; automatico?: boolean } = {}) => {
    const ignorar = !opcoes.incluirAberto && abertoRef.current ? [abertoRef.current] : [];
    const resultado = await sincronizarPendencias<P>(modulo, usuarioId, (p, salvar) => sincronizarRef.current(p, salvar), { ids: opcoes.ids, ignorar, aguardar: !opcoes.automatico });
    if (!resultado.semRede.length) setUltimaSincronizacao(new Date().toISOString());
    if (resultado.enviados.length || resultado.erros.length || !opcoes.automatico) onResultadoRef.current?.(resultado, !!opcoes.automatico);
    await recarregar();
    return resultado;
  }, [modulo, usuarioId, recarregar]);

  useEffect(() => {
    let ativo = true;
    const automatico = () => {
      if (!ativo || estaOffline()) return;
      void executar({ automatico: true });
    };
    const aoMudarRede = () => {
      setOnline(!estaOffline());
      automatico();
    };
    const aoFicarVisivel = () => { if (document.visibilityState === 'visible') automatico(); };
    const cancelar = assinarPendencias(() => { if (ativo) void recarregar(); });
    void recarregar().then(automatico);
    const intervalo = window.setInterval(automatico, INTERVALO_AUTOMATICO_MS);
    window.addEventListener('online', aoMudarRede);
    window.addEventListener('offline', aoMudarRede);
    window.addEventListener('focus', automatico);
    document.addEventListener('visibilitychange', aoFicarVisivel);
    return () => {
      ativo = false;
      cancelar();
      window.clearInterval(intervalo);
      window.removeEventListener('online', aoMudarRede);
      window.removeEventListener('offline', aoMudarRede);
      window.removeEventListener('focus', automatico);
      document.removeEventListener('visibilitychange', aoFicarVisivel);
    };
  }, [executar, recarregar]);

  return { pendencias, online, sincronizando, ultimaSincronizacao, sincronizarAgora: executar, recarregar };
}

// =====================================================================
// Selo por checklist
// =====================================================================

export function ChipSincronizacao({ offline, compacto }: { offline?: InfoOffline; compacto?: boolean }) {
  const base = 'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold';
  if (!offline) {
    return <span className={`${base} bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300`} title="Gravado no servidor">
      <CloudCheck className="h-3.5 w-3.5" />{!compacto && ' Sincronizado'}
    </span>;
  }
  if (offline.estado === 'sincronizando') {
    return <span className={`${base} bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300`}><Loader2 className="h-3.5 w-3.5 animate-spin" /> Enviando…</span>;
  }
  if (offline.estado === 'erro') {
    return <span className={`${base} bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300`} title={offline.erro || ''}><AlertTriangle className="h-3.5 w-3.5" /> Erro ao sincronizar</span>;
  }
  return <span className={`${base} bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300`} title={`Salvo neste aparelho em ${horaCurta(offline.atualizadoEm)}. Sobe sozinho quando houver conexão.`}>
    <CloudOff className="h-3.5 w-3.5" /> Só no aparelho
  </span>;
}

// =====================================================================
// Painel geral
// =====================================================================

interface PainelProps<P extends PendenciaOffline> {
  online: boolean;
  pendencias: P[];
  sincronizando: boolean;
  ultimaSincronizacao: string | null;
  /** Lista exibida é a cópia guardada no aparelho (sem conexão ao carregar). */
  listaSalvaEm?: string | null;
  rotulosAcao: Record<string, string>;
  /** Como identificar a pendência para o usuário (código, tramo, série…). */
  titulo: (p: P) => string;
  onSincronizar: () => Promise<ResultadoSincronizacao>;
  onDescartar: (p: P) => Promise<void>;
  onAbrir?: (p: P) => void;
}

export function PainelSincronizacao<P extends PendenciaOffline>({
  online, pendencias, sincronizando, ultimaSincronizacao, listaSalvaEm, rotulosAcao, titulo, onSincronizar, onDescartar, onAbrir,
}: PainelProps<P>) {
  const [expandido, setExpandido] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoSincronizacao | null>(null);
  const [descartar, setDescartar] = useState<P | null>(null);
  const [descartando, setDescartando] = useState(false);

  const comErro = pendencias.filter(p => p.estado === 'erro');
  const tituloDe = (id: string) => {
    const p = pendencias.find(item => item.id === id);
    return p ? titulo(p) : id.slice(0, 8);
  };

  const enviar = async () => {
    setEnviando(true);
    try {
      setResultado(await onSincronizar());
    } finally {
      setEnviando(false);
      setConfirmar(false);
    }
  };

  let icone: React.ReactNode;
  let cor: string;
  let texto: React.ReactNode;
  if (sincronizando || enviando) {
    icone = <Loader2 className="h-5 w-5 animate-spin" />;
    cor = 'border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/20 dark:text-blue-200';
    texto = <><b>Sincronizando…</b> enviando o que está guardado neste aparelho.</>;
  } else if (!online) {
    icone = <WifiOff className="h-5 w-5" />;
    cor = 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200';
    texto = <><b>Sem conexão.</b> Pode preencher, fotografar e salvar normalmente — fica guardado neste aparelho e sobe sozinho quando a rede voltar.{pendencias.length > 0 && <> <b>{pendencias.length}</b> {pendencias.length === 1 ? 'checklist aguardando' : 'checklists aguardando'} envio.</>}</>;
  } else if (pendencias.length) {
    icone = <CloudOff className="h-5 w-5" />;
    cor = comErro.length
      ? 'border-red-200 bg-red-50 text-red-900 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-200'
      : 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200';
    texto = <><b>{pendencias.length} {pendencias.length === 1 ? 'checklist só neste aparelho' : 'checklists só neste aparelho'}</b>{comErro.length > 0 ? <> — {comErro.length} com erro, veja o motivo abaixo.</> : ' — ainda não chegaram ao servidor.'}</>;
  } else {
    icone = <CloudCheck className="h-5 w-5" />;
    cor = 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/20 dark:text-emerald-200';
    texto = <><b>Tudo sincronizado.</b> Nada pendente neste aparelho{ultimaSincronizacao ? ` · verificado às ${horaCurta(ultimaSincronizacao)}` : ''}.</>;
  }

  return <section className={`rounded-2xl border px-4 py-3 ${cor}`}>
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span className="mt-0.5 shrink-0">{icone}</span>
        <div className="min-w-0 text-xs leading-relaxed">
          <p>{texto}</p>
          {listaSalvaEm && <p className="mt-0.5 opacity-80">Lista do servidor salva neste aparelho em {horaCurta(listaSalvaEm)} — pode estar desatualizada.</p>}
        </div>
      </div>
      <div className="flex shrink-0 gap-2">
        {pendencias.length > 0 && <button type="button" onClick={() => setExpandido(valor => !valor)} className="inline-flex items-center justify-center rounded-xl border border-current/20 bg-white/70 px-3 py-2 text-xs font-bold hover:bg-white dark:bg-slate-900/50">
          {expandido ? 'Ocultar' : 'Ver pendências'}
        </button>}
        <button type="button" disabled={enviando || sincronizando} onClick={() => setConfirmar(true)} className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900">
          <RefreshCw className={`h-4 w-4 ${enviando || sincronizando ? 'animate-spin' : ''}`} /> Sincronizar agora
        </button>
      </div>
    </div>

    {expandido && pendencias.length > 0 && <ul className="mt-3 space-y-2">
      {pendencias.map(p => <li key={p.id} className="flex flex-col gap-2 rounded-xl bg-white/80 p-3 text-slate-700 sm:flex-row sm:items-center dark:bg-slate-900/60 dark:text-slate-200">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-xs font-bold">{titulo(p)} <ChipSincronizacao offline={{ estado: p.estado, novo: p.novo, erro: p.ultimoErro, atualizadoEm: p.atualizadoEm }} /></p>
          <p className="text-[11px] text-slate-500">Falta enviar: {descreverPendencia(p, rotulosAcao)} · salvo às {horaCurta(p.atualizadoEm)}</p>
          {p.estado === 'erro' && p.ultimoErro && <p className="mt-1 text-[11px] font-semibold text-red-600 dark:text-red-400">{p.ultimoErro}</p>}
        </div>
        <div className="flex shrink-0 gap-2">
          {onAbrir && <button type="button" onClick={() => onAbrir(p)} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-bold hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">Abrir</button>}
          <button type="button" onClick={() => setDescartar(p)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-bold text-slate-500 hover:text-red-600 dark:border-slate-700"><Trash2 className="h-3.5 w-3.5" /> Descartar</button>
        </div>
      </li>)}
    </ul>}

    {confirmar && <ConfirmDialog
      titulo="Sincronizar agora?"
      confirmarLabel={pendencias.length ? `Enviar ${pendencias.length === 1 ? '1 checklist' : `${pendencias.length} checklists`}` : 'Verificar'}
      confirmando={enviando}
      mensagem={!online
        ? 'O aparelho está sem conexão agora. Vamos tentar mesmo assim — se não houver rede, nada se perde: continua guardado aqui.'
        : pendencias.length
          ? <div className="space-y-2">
            <p>Estes checklists guardados neste aparelho serão enviados ao servidor:</p>
            <ul className="max-h-48 space-y-1 overflow-y-auto">
              {pendencias.map(p => <li key={p.id} className="rounded-lg bg-slate-50 px-2 py-1 text-xs dark:bg-slate-800"><b>{titulo(p)}</b><br /><span className="text-slate-500">{descreverPendencia(p, rotulosAcao)}</span></li>)}
            </ul>
          </div>
          : 'Nada pendente neste aparelho — tudo já está no servidor. Confirmar mesmo assim verifica a conexão.'}
      onConfirmar={enviar}
      onCancelar={() => { if (!enviando) setConfirmar(false); }}
    />}

    {resultado && <Modal onClose={() => setResultado(null)} maxWidth="max-w-md" ariaLabel="Resultado da sincronização" zIndexClassName="z-[120]">
      <ModalHeader onClose={() => setResultado(null)}>
        <span className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-50"><CloudUpload className="h-5 w-5 text-blue-600" /> Resultado da sincronização</span>
      </ModalHeader>
      <ModalBody className="space-y-3 p-5 text-sm text-slate-700 dark:text-slate-200">
        {resultado.enviados.length > 0 && <div>
          <p className="flex items-center gap-2 font-bold text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="h-4 w-4" /> {resultado.enviados.length === 1 ? '1 checklist enviado' : `${resultado.enviados.length} checklists enviados`} e confirmado{resultado.enviados.length === 1 ? '' : 's'} pelo servidor</p>
        </div>}
        {resultado.semRede.length > 0 && <p className="flex items-start gap-2 font-semibold text-amber-700 dark:text-amber-300"><WifiOff className="mt-0.5 h-4 w-4 shrink-0" /> Sem conexão com o servidor. Os checklists continuam guardados neste aparelho e sobem sozinhos quando a rede voltar.</p>}
        {resultado.erros.length > 0 && <div className="space-y-1">
          <p className="flex items-center gap-2 font-bold text-red-700 dark:text-red-300"><X className="h-4 w-4" /> O servidor recusou {resultado.erros.length === 1 ? '1 checklist' : `${resultado.erros.length} checklists`}:</p>
          <ul className="space-y-1">{resultado.erros.map(erro => <li key={erro.id} className="rounded-lg bg-red-50 px-2 py-1 text-xs dark:bg-red-950/30"><b>{tituloDe(erro.id)}</b>: {erro.mensagem}</li>)}</ul>
          <p className="text-xs text-slate-500">Eles continuam no aparelho. Corrija e salve de novo, ou descarte a cópia local em "Ver pendências".</p>
        </div>}
        {!resultado.enviados.length && !resultado.semRede.length && !resultado.erros.length && <p className="flex items-center gap-2 font-bold text-emerald-700 dark:text-emerald-300"><CloudCheck className="h-4 w-4" /> Tudo sincronizado — nada pendente neste aparelho.</p>}
      </ModalBody>
      <ModalFooter>
        <div className="flex w-full justify-end"><button type="button" onClick={() => setResultado(null)} className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700">OK</button></div>
      </ModalFooter>
    </Modal>}

    {descartar && <ConfirmDialog
      titulo="Descartar cópia do aparelho?"
      variante="perigo"
      confirmarLabel="Descartar"
      confirmando={descartando}
      mensagem={<>As respostas, fotos e assinaturas de <b>{titulo(descartar)}</b> que ainda não subiram serão apagadas deste aparelho. {descartar.novo ? 'Esse checklist nunca chegou ao servidor.' : 'O que já está no servidor não muda.'}</>}
      onConfirmar={async () => {
        setDescartando(true);
        try { await onDescartar(descartar); setDescartar(null); } finally { setDescartando(false); }
      }}
      onCancelar={() => { if (!descartando) setDescartar(null); }}
    />}
  </section>;
}
