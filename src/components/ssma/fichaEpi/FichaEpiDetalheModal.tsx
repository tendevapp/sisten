/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Detalhe de uma ficha de EPI: o documento no desenho do papel, alternando
 * entre a entrega escolhida e a ficha completa do colaborador, com a opção de
 * exibir/ocultar a assinatura — o PDF sai como está na tela.
 */

import { useEffect, useState } from 'react';
import { Ban, FileDown, Loader2, PenTool, X } from 'lucide-react';
import { useToast } from '../../ui/Toast';
import type { Profile } from '../../../types';
import FichaEpiDocumento from './FichaEpiDocumento';
import { formatarDataBR, hojeISO, type LinhaGradeFichaEpi } from '../../../lib/fichaEpi';
import {
  assinarFichaEpi,
  buscarCadastroRhColaborador,
  cancelarFichaEpi,
  listarFichasDoColaborador,
  mensagemErroFichaEpi,
  registrarDevolucaoEpi,
  type CadastroRhColaborador,
  type SsmaFichaEpi,
} from '../../../lib/ssmaFichaEpiApi';
import FichaEpiColaboradorResumo from './FichaEpiColaboradorResumo';
import SignaturePadModal from '../../portaria/SignaturePadModal';
import FichaEpiPdfPreview from './FichaEpiPdfPreview';

interface Props {
  user: Profile;
  pessoaId: string;
  /** Ficha aberta; sem ela abre direto a ficha completa do colaborador. */
  fichaId?: string | null;
  onClose: () => void;
  onAlterada: () => void;
}

const botao = 'inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold disabled:opacity-60';

export default function FichaEpiDetalheModal({ user, pessoaId, fichaId, onClose, onAlterada }: Props) {
  const toast = useToast();
  const [fichas, setFichas] = useState<SsmaFichaEpi[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [escopo, setEscopo] = useState<'entrega' | 'completa'>(fichaId ? 'entrega' : 'completa');
  const [mostrarAssinatura, setMostrarAssinatura] = useState(true);
  const [previewPdf, setPreviewPdf] = useState<SsmaFichaEpi[] | null>(null);
  const [devolucao, setDevolucao] = useState<{ linha: LinhaGradeFichaEpi; data: string; observacao: string } | null>(null);
  const [cancelando, setCancelando] = useState<string | null>(null);
  const [processando, setProcessando] = useState(false);
  // 'uma' = só a ficha aberta; 'todas' = todas as pendentes do colaborador com a mesma assinatura.
  const [assinando, setAssinando] = useState<false | 'uma' | 'todas'>(false);

  const [cadastro, setCadastro] = useState<CadastroRhColaborador | null>(null);

  const carregar = async () => {
    setCarregando(true);
    try {
      const [lista, rh] = await Promise.all([
        listarFichasDoColaborador(pessoaId, true),
        // O cadastro do RH só enriquece o painel; sem ele a ficha abre normalmente.
        buscarCadastroRhColaborador(pessoaId).catch(() => null),
      ]);
      setFichas(lista);
      setCadastro(rh);
    } catch (erro) {
      toast.error(mensagemErroFichaEpi(erro));
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => { carregar(); }, [pessoaId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => { if (e.key === 'Escape' && !devolucao && cancelando === null && !previewPdf) onClose(); };
    document.addEventListener('keydown', aoTeclar);
    return () => document.removeEventListener('keydown', aoTeclar);
  }, [onClose, devolucao, cancelando, previewPdf]);

  const fichaAberta = fichas.find(f => f.id === fichaId) ?? null;
  const exibidas = escopo === 'entrega' && fichaAberta ? [fichaAberta] : fichas;
  const referencia = fichaAberta ?? fichas[0] ?? null;
  const podeCancelar = !!fichaAberta && fichaAberta.status === 'ATIVA' && (user.roles.includes('admin') || fichaAberta.criado_por === user.id);

  const salvarDevolucao = async () => {
    if (!devolucao) return;
    setProcessando(true);
    try {
      await registrarDevolucaoEpi(devolucao.linha.itemId, devolucao.data, devolucao.observacao);
      toast.success('Devolução registrada.');
      setDevolucao(null);
      await carregar();
      onAlterada();
    } catch (erro) {
      toast.error(mensagemErroFichaEpi(erro));
    } finally {
      setProcessando(false);
    }
  };

  const desfazerDevolucao = async (linha: LinhaGradeFichaEpi) => {
    if (!window.confirm(`Desfazer a devolução de "${linha.descricao}"?`)) return;
    try {
      await registrarDevolucaoEpi(linha.itemId, null);
      toast.success('Devolução desfeita.');
      await carregar();
      onAlterada();
    } catch (erro) {
      toast.error(mensagemErroFichaEpi(erro));
    }
  };

  const pendenteAssinatura = !!fichaAberta && fichaAberta.status === 'ATIVA' && !!fichaAberta.assinatura_pendente;

  /** Fichas ativas do colaborador ainda sem assinatura (o histórico feito à mão entra assim). */
  const pendentesDoColaborador = fichas.filter(f => f.status === 'ATIVA' && f.assinatura_pendente);

  const coletarAssinatura = async (assinatura: string) => {
    const alvo = assinando === 'todas' ? pendentesDoColaborador : fichaAberta ? [fichaAberta] : [];
    if (!alvo.length) return;
    setProcessando(true);
    try {
      // Uma RPC por ficha (cada uma trava depois de assinada). Segue nas demais se uma falhar e diz quais.
      const falhas: string[] = [];
      for (const ficha of alvo) {
        try {
          await assinarFichaEpi(ficha.id, assinatura);
        } catch (erro) {
          falhas.push(`${ficha.codigo} (${mensagemErroFichaEpi(erro)})`);
        }
      }
      const assinadas = alvo.length - falhas.length;
      if (assinadas) toast.success(assinadas === 1 ? `Ficha ${alvo[0].codigo} assinada.` : `${assinadas} fichas assinadas.`);
      if (falhas.length) toast.error(`Não assinou: ${falhas.join('; ')}`);
      setAssinando(false);
      await carregar();
      onAlterada();
    } finally {
      setProcessando(false);
    }
  };

  const confirmarCancelamento = async () => {
    if (!fichaAberta || !cancelando?.trim()) {
      toast.error('Informe o motivo do cancelamento.');
      return;
    }
    setProcessando(true);
    try {
      await cancelarFichaEpi(fichaAberta.id, cancelando);
      toast.success(`Ficha ${fichaAberta.codigo} cancelada. Ela sai da análise de consumo.`);
      setCancelando(null);
      await carregar();
      onAlterada();
    } catch (erro) {
      toast.error(mensagemErroFichaEpi(erro));
    } finally {
      setProcessando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/55 p-2 sm:p-4" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="titulo-ficha-epi" className="mx-auto my-2 max-w-5xl rounded-2xl bg-white p-4 shadow-2xl sm:my-4 sm:p-5 dark:bg-slate-900">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3 dark:border-slate-800">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">Ficha de EPI · FRM.SEG-0008</p>
            <h2 id="titulo-ficha-epi" className="mt-0.5 truncate text-lg font-bold text-slate-900 dark:text-slate-50">
              {referencia?.nome ?? 'Carregando…'}
            </h2>
            {fichaAberta && (
              <p className="text-xs text-slate-500">
                {fichaAberta.codigo} · entrega de {formatarDataBR(fichaAberta.data_entrega)} · lançada por {fichaAberta.criado_por_nome || '—'}
                {fichaAberta.status === 'CANCELADA' && <span className="ml-1 font-bold text-red-600">· CANCELADA ({fichaAberta.cancelamento_motivo})</span>}
              </p>
            )}
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800" aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>

        {carregando ? (
          <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-emerald-600" /></div>
        ) : (
          <>
            {(pendenteAssinatura || pendentesDoColaborador.length > 0) && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                <span>
                  {pendenteAssinatura
                    ? <><strong>Ficha pendente de assinatura.</strong> O EPI foi entregue, mas {fichaAberta?.nome} ainda não assinou o termo.</>
                    : <><strong>{pendentesDoColaborador.length} {pendentesDoColaborador.length === 1 ? 'ficha pendente' : 'fichas pendentes'} de assinatura</strong> deste colaborador.</>}
                  {pendentesDoColaborador.length > 1 && pendenteAssinatura && <> Há mais {pendentesDoColaborador.length - 1} pendente(s) do mesmo colaborador.</>}
                </span>
                <span className="flex flex-wrap gap-2">
                  {pendenteAssinatura && (
                    <button type="button" onClick={() => setAssinando('uma')} className={`${botao} bg-amber-600 text-white hover:bg-amber-700`}>
                      <PenTool className="h-4 w-4" /> Assinar só esta
                    </button>
                  )}
                  {pendentesDoColaborador.length > 0 && (pendentesDoColaborador.length > 1 || !pendenteAssinatura) && (
                    <button type="button" onClick={() => setAssinando('todas')} className={`${botao} border border-amber-500 bg-white text-amber-800 hover:bg-amber-100 dark:bg-transparent dark:text-amber-200`}>
                      <PenTool className="h-4 w-4" /> Assinar todas ({pendentesDoColaborador.length}) de uma vez
                    </button>
                  )}
                </span>
              </div>
            )}
            <div className="my-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                {fichaAberta && (
                  <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-800" role="group" aria-label="Conteúdo exibido">
                    {(['entrega', 'completa'] as const).map(op => (
                      <button key={op} type="button" onClick={() => setEscopo(op)} aria-pressed={escopo === op} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${escopo === op ? 'bg-white text-emerald-700 shadow-sm dark:bg-slate-900 dark:text-emerald-400' : 'text-slate-500'}`}>
                        {op === 'entrega' ? 'Esta entrega' : `Ficha completa do colaborador (${fichas.filter(f => f.status === 'ATIVA').length})`}
                      </button>
                    ))}
                  </div>
                )}
                <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
                  <input type="checkbox" role="switch" checked={mostrarAssinatura} onChange={e => setMostrarAssinatura(e.target.checked)} className="h-4 w-4 accent-emerald-600" />
                  <PenTool className="h-3.5 w-3.5" /> Exibir assinatura
                </label>
              </div>
              <div className="flex flex-wrap gap-2">
                {podeCancelar && (
                  <button type="button" onClick={() => setCancelando('')} className={`${botao} border border-red-200 text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/40`}>
                    <Ban className="h-4 w-4" /> Cancelar ficha
                  </button>
                )}
                <button type="button" disabled={!exibidas.length} onClick={() => setPreviewPdf(exibidas)} className={`${botao} bg-emerald-600 text-white hover:bg-emerald-700`}>
                  <FileDown className="h-4 w-4" /> Visualizar PDF
                </button>
              </div>
            </div>

            {escopo === 'completa' && fichas.length > 0 && <FichaEpiColaboradorResumo fichas={fichas} cadastro={cadastro} />}

            {exibidas.length ? (
              <FichaEpiDocumento
                fichas={exibidas}
                mostrarAssinatura={mostrarAssinatura}
                onRegistrarDevolucao={linha => setDevolucao({ linha, data: hojeISO(), observacao: '' })}
                onDesfazerDevolucao={desfazerDevolucao}
              />
            ) : (
              <p className="py-10 text-center text-sm text-slate-500">Nenhuma ficha ativa para este colaborador.</p>
            )}

            {exibidas.some(f => f.observacoes) && (
              <div className="mt-3 space-y-1 text-xs text-slate-600 dark:text-slate-300">
                {exibidas.filter(f => f.observacoes).map(f => <p key={f.id}><span className="font-bold">{f.codigo}:</span> {f.observacoes}</p>)}
              </div>
            )}
          </>
        )}

        {previewPdf && (
          <FichaEpiPdfPreview fichas={previewPdf} mostrarAssinaturaInicial={mostrarAssinatura} onClose={() => setPreviewPdf(null)} />
        )}

        <SignaturePadModal
          isOpen={assinando !== false}
          onClose={() => !processando && setAssinando(false)}
          onSave={coletarAssinatura}
          title={`Assinatura de ${fichaAberta?.nome ?? fichas[0]?.nome ?? 'colaborador'}`}
          subtitle={assinando === 'todas'
            ? `Declaro que recebi os EPIs relacionados nas ${pendentesDoColaborador.length} fichas pendentes, nos termos do FRM.SEG-0008`
            : 'Declaro que recebi os EPIs relacionados, nos termos do FRM.SEG-0008'}
        />

        {devolucao && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/40 p-4">
            <div role="dialog" aria-modal="true" className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl dark:bg-slate-900">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-50">Registrar devolução</h3>
              <p className="mt-1 text-xs text-slate-500">{devolucao.linha.descricao} · entregue em {formatarDataBR(devolucao.linha.dataEntrega)}</p>
              <label className="mt-3 grid gap-1 text-xs font-semibold text-slate-700 dark:text-slate-300">
                Data da devolução
                <input type="date" value={devolucao.data} min={devolucao.linha.dataEntrega} max={hojeISO()} onChange={e => setDevolucao({ ...devolucao, data: e.target.value })} className="rounded-lg border border-slate-200 p-2 text-sm dark:border-slate-700 dark:bg-slate-800" />
              </label>
              <label className="mt-2 grid gap-1 text-xs font-semibold text-slate-700 dark:text-slate-300">
                Observação (opcional)
                <input value={devolucao.observacao} onChange={e => setDevolucao({ ...devolucao, observacao: e.target.value })} placeholder="Ex.: desgaste, desligamento" className="rounded-lg border border-slate-200 p-2 text-sm dark:border-slate-700 dark:bg-slate-800" />
              </label>
              <p className="mt-2 text-[11px] text-slate-400">A coluna ASS. DO TST registra {user.name} como responsável.</p>
              <div className="mt-4 flex justify-end gap-2">
                <button type="button" onClick={() => setDevolucao(null)} className="rounded-lg px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">Voltar</button>
                <button type="button" disabled={processando || !devolucao.data} onClick={salvarDevolucao} className={`${botao} bg-emerald-600 text-white hover:bg-emerald-700`}>
                  {processando && <Loader2 className="h-4 w-4 animate-spin" />} Registrar
                </button>
              </div>
            </div>
          </div>
        )}

        {cancelando !== null && fichaAberta && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/40 p-4">
            <div role="dialog" aria-modal="true" className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl dark:bg-slate-900">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-50">Cancelar ficha {fichaAberta.codigo}</h3>
              <p className="mt-1 text-xs text-slate-500">A ficha continua registrada, marcada como cancelada, e deixa de contar no consumo.</p>
              <textarea autoFocus value={cancelando} onChange={e => setCancelando(e.target.value)} rows={3} placeholder="Motivo do cancelamento" className="mt-3 w-full rounded-lg border border-slate-200 p-2 text-sm dark:border-slate-700 dark:bg-slate-800" />
              <div className="mt-4 flex justify-end gap-2">
                <button type="button" onClick={() => setCancelando(null)} className="rounded-lg px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">Voltar</button>
                <button type="button" disabled={processando || !cancelando.trim()} onClick={confirmarCancelamento} className={`${botao} bg-red-600 text-white hover:bg-red-700`}>
                  {processando && <Loader2 className="h-4 w-4 animate-spin" />} Cancelar ficha
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
