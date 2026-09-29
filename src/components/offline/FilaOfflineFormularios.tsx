/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Indicador global do modo offline dos formulários (ver
 * lib/offline/filaSupabase.ts). Montado uma vez no App:
 *
 *   - envia a fila sozinho ao abrir o app, ao voltar a rede, ao voltar o
 *     foco e a cada minuto;
 *   - avisa quando uma gravação foi guardada no aparelho em vez de ir ao
 *     servidor;
 *   - mostra um selo flutuante (sem conexão / N no aparelho / erro) que abre
 *     o painel: o que está pendente, o motivo de uma recusa, "Sincronizar
 *     agora" (confirma antes, mostra o resultado depois) e descartar.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, CloudCheck, CloudOff, CloudUpload, Loader2, RefreshCw, Trash2, WifiOff, X } from 'lucide-react';
import Modal, { ModalBody, ModalFooter, ModalHeader } from '../ui/Modal';
import ConfirmDialog from '../ui/ConfirmDialog';
import { useToast } from '../ui/Toast';
import {
  assinarEnfileirado, assinarFilaOffline, descartarOperacao, listarOperacoes, sincronizandoFila, sincronizarFilaOffline,
  type OperacaoFila, type ResultadoFila,
} from '../../lib/offline/filaSupabase';
import { estaOffline } from '../../lib/rede';

const INTERVALO_MS = 60 * 1000;

function hora(iso: string): string {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return '';
  return new Date().toDateString() === data.toDateString()
    ? data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : data.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

interface Props {
  usuarioId: string;
  /** Selo visível mesmo sem pendências quando está offline (telas de formulário). */
  emFormulario: boolean;
}

export default function FilaOfflineFormularios({ usuarioId, emFormulario }: Props) {
  const toast = useToast();
  const [operacoes, setOperacoes] = useState<OperacaoFila[]>([]);
  const [online, setOnline] = useState(() => !estaOffline());
  const [sincronizando, setSincronizando] = useState(false);
  const [aberto, setAberto] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoFila | null>(null);
  const [descartar, setDescartar] = useState<OperacaoFila | null>(null);
  const ultimoAviso = useRef(0);

  const recarregar = useCallback(async () => {
    setOperacoes(await listarOperacoes(usuarioId));
    setSincronizando(sincronizandoFila());
  }, [usuarioId]);

  const automatico = useCallback(async () => {
    if (estaOffline()) return;
    const r = await sincronizarFilaOffline({ automatico: true });
    if (r.enviadas) toast.success(`${r.enviadas === 1 ? '1 registro guardado no aparelho foi enviado' : `${r.enviadas} registros guardados no aparelho foram enviados`} ao servidor.`);
    if (r.erro && r.erro.operacao.tentativas <= 1) toast.error(`O servidor recusou "${r.erro.operacao.rotulo}": ${r.erro.mensagem}. Veja no selo de sincronização.`);
  }, [toast]);

  useEffect(() => {
    let ativo = true;
    const cancelarFila = assinarFilaOffline(() => { if (ativo) void recarregar(); });
    const cancelarAviso = assinarEnfileirado(op => {
      if (Date.now() - ultimoAviso.current < 4000) return;
      ultimoAviso.current = Date.now();
      toast.info(estaOffline()
        ? `Sem conexão: ${op.rotulo} guardado neste aparelho. Sobe sozinho quando a rede voltar.`
        : `${op.rotulo}: guardado neste aparelho, entra na fila de envio.`);
    });
    const aoMudarRede = () => { setOnline(!estaOffline()); void automatico(); };
    const aoVoltar = () => { if (document.visibilityState === 'visible') void automatico(); };
    void recarregar().then(automatico);
    const intervalo = window.setInterval(() => { void automatico(); }, INTERVALO_MS);
    window.addEventListener('online', aoMudarRede);
    window.addEventListener('offline', aoMudarRede);
    window.addEventListener('focus', aoVoltar);
    document.addEventListener('visibilitychange', aoVoltar);
    return () => {
      ativo = false;
      cancelarFila();
      cancelarAviso();
      window.clearInterval(intervalo);
      window.removeEventListener('online', aoMudarRede);
      window.removeEventListener('offline', aoMudarRede);
      window.removeEventListener('focus', aoVoltar);
      document.removeEventListener('visibilitychange', aoVoltar);
    };
  }, [recarregar, automatico, toast]);

  const comErro = operacoes.filter(op => op.estado === 'erro');
  const visivel = operacoes.length > 0 || (!online && emFormulario);
  if (!visivel && !aberto && !resultado) return null;

  const enviar = async () => {
    setEnviando(true);
    try {
      setResultado(await sincronizarFilaOffline());
    } finally {
      setEnviando(false);
      setConfirmar(false);
    }
  };

  const ocupado = sincronizando || enviando;
  const cor = comErro.length
    ? 'bg-red-600 text-white'
    : operacoes.length
      ? 'bg-amber-500 text-white'
      : 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900';
  const selo = ocupado
    ? <><Loader2 className="h-4 w-4 animate-spin" /> Sincronizando…</>
    : comErro.length
      ? <><AlertTriangle className="h-4 w-4" /> Erro ao sincronizar</>
      : operacoes.length
        ? <><CloudOff className="h-4 w-4" /> {operacoes.length === 1 ? '1 registro no aparelho' : `${operacoes.length} registros no aparelho`}</>
        : <><WifiOff className="h-4 w-4" /> Sem conexão — salva no aparelho</>;

  return <>
    {visivel && <button type="button" onClick={() => setAberto(true)} className={`fixed bottom-4 left-4 z-[85] inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-xs font-bold shadow-lg ${cor}`} aria-label="Sincronização dos formulários">
      {selo}
    </button>}

    {aberto && <Modal onClose={() => setAberto(false)} maxWidth="max-w-lg" ariaLabel="Sincronização dos formulários" zIndexClassName="z-[110]">
      <ModalHeader onClose={() => setAberto(false)}>
        <span className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-50"><CloudUpload className="h-5 w-5 text-blue-600" /> Sincronização dos formulários</span>
      </ModalHeader>
      <ModalBody className="space-y-3 p-5 text-sm text-slate-700 dark:text-slate-200">
        <p className={`flex items-start gap-2 rounded-xl px-3 py-2 text-xs ${online ? 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200' : 'bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200'}`}>
          {online ? <CloudCheck className="mt-0.5 h-4 w-4 shrink-0" /> : <WifiOff className="mt-0.5 h-4 w-4 shrink-0" />}
          {online
            ? operacoes.length ? 'Conectado. O que está abaixo ainda não chegou ao servidor.' : 'Conectado. Tudo sincronizado — nada pendente neste aparelho.'
            : 'Sem conexão. Pode seguir preenchendo os formulários: fica guardado neste aparelho e sobe sozinho quando a rede voltar.'}
        </p>
        {operacoes.length > 0 && <ul className="max-h-[50vh] space-y-2 overflow-y-auto">
          {operacoes.map((op, indice) => <li key={op.id} className={`rounded-xl border p-3 ${op.estado === 'erro' ? 'border-red-200 bg-red-50/60 dark:border-red-900/60 dark:bg-red-950/20' : 'border-slate-200 dark:border-slate-800'}`}>
            <div className="flex items-start gap-2">
              <span className="mt-0.5 text-[11px] font-black text-slate-400">{indice + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-slate-900 dark:text-slate-50">{op.rotulo}</p>
                {op.resumo && <p className="truncate text-[11px] text-slate-500">{op.resumo}</p>}
                <p className="text-[11px] text-slate-400">Guardado às {hora(op.criadoEm)}{op.estado === 'enviando' ? ' · enviando…' : ''}</p>
                {op.estado === 'erro' && op.erro && <p className="mt-1 text-[11px] font-semibold text-red-700 dark:text-red-300">Recusado pelo servidor: {op.erro}</p>}
              </div>
              <button type="button" onClick={() => setDescartar(op)} disabled={op.estado === 'enviando'} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-red-600 disabled:opacity-40 dark:hover:bg-slate-800" title="Descartar do aparelho"><Trash2 className="h-4 w-4" /></button>
            </div>
          </li>)}
        </ul>}
        {comErro.length > 0 && <p className="text-[11px] text-slate-500">A fila anda na ordem em que os registros foram feitos e para no que o servidor recusou. Corrija o motivo e sincronize de novo, ou descarte esse registro para liberar os seguintes.</p>}
      </ModalBody>
      <ModalFooter>
        <div className="flex w-full items-center justify-end gap-2">
          <button type="button" onClick={() => setAberto(false)} className="rounded-xl px-4 py-2 text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400">Fechar</button>
          <button type="button" disabled={ocupado} onClick={() => setConfirmar(true)} className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-60">
            <RefreshCw className={`h-4 w-4 ${ocupado ? 'animate-spin' : ''}`} /> Sincronizar agora
          </button>
        </div>
      </ModalFooter>
    </Modal>}

    {confirmar && <ConfirmDialog
      titulo="Sincronizar agora?"
      confirmarLabel={operacoes.length ? `Enviar ${operacoes.length === 1 ? '1 registro' : `${operacoes.length} registros`}` : 'Verificar'}
      confirmando={enviando}
      mensagem={!online
        ? 'O aparelho está sem conexão agora. Vamos tentar mesmo assim — se não houver rede, nada se perde: continua guardado aqui.'
        : operacoes.length
          ? `Os ${operacoes.length === 1 ? 'registro guardado' : `${operacoes.length} registros guardados`} neste aparelho serão enviados ao servidor, na ordem em que foram feitos.`
          : 'Nada pendente neste aparelho — tudo já está no servidor.'}
      onConfirmar={enviar}
      onCancelar={() => { if (!enviando) setConfirmar(false); }}
    />}

    {resultado && <Modal onClose={() => setResultado(null)} maxWidth="max-w-md" ariaLabel="Resultado da sincronização" zIndexClassName="z-[120]">
      <ModalHeader onClose={() => setResultado(null)}>
        <span className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-50"><CloudUpload className="h-5 w-5 text-blue-600" /> Resultado da sincronização</span>
      </ModalHeader>
      <ModalBody className="space-y-3 p-5 text-sm text-slate-700 dark:text-slate-200">
        {resultado.enviadas > 0 && <p className="flex items-center gap-2 font-bold text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="h-4 w-4" /> {resultado.enviadas === 1 ? '1 registro enviado e confirmado' : `${resultado.enviadas} registros enviados e confirmados`} pelo servidor.</p>}
        {resultado.semRede && <p className="flex items-start gap-2 font-semibold text-amber-700 dark:text-amber-300"><WifiOff className="mt-0.5 h-4 w-4 shrink-0" /> Sem conexão com o servidor. O que falta continua guardado neste aparelho e sobe sozinho quando a rede voltar.</p>}
        {resultado.erro && <div className="space-y-1">
          <p className="flex items-center gap-2 font-bold text-red-700 dark:text-red-300"><X className="h-4 w-4" /> O servidor recusou "{resultado.erro.operacao.rotulo}"</p>
          <p className="rounded-lg bg-red-50 px-2 py-1 text-xs dark:bg-red-950/30">{resultado.erro.mensagem}</p>
          <p className="text-xs text-slate-500">A fila parou nele. Veja no selo de sincronização: corrija e tente de novo, ou descarte.</p>
        </div>}
        {!resultado.enviadas && !resultado.semRede && !resultado.erro && <p className="flex items-center gap-2 font-bold text-emerald-700 dark:text-emerald-300"><CloudCheck className="h-4 w-4" /> Tudo sincronizado — nada pendente neste aparelho.</p>}
      </ModalBody>
      <ModalFooter>
        <div className="flex w-full justify-end"><button type="button" onClick={() => setResultado(null)} className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700">OK</button></div>
      </ModalFooter>
    </Modal>}

    {descartar && <ConfirmDialog
      titulo="Descartar do aparelho?"
      variante="perigo"
      confirmarLabel="Descartar"
      mensagem={<><b>{descartar.rotulo}</b>{descartar.resumo ? ` (${descartar.resumo})` : ''} ainda não chegou ao servidor e será apagado deste aparelho. Registros feitos depois que dependem dele (fotos, itens, saída) podem ser recusados no envio.</>}
      onConfirmar={async () => { await descartarOperacao(descartar.id); setDescartar(null); }}
      onCancelar={() => setDescartar(null)}
    />}
  </>;
}
