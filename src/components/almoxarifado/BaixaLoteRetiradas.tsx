/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Baixa em lote das retiradas sem saldo (Geral › Pendências).
 *
 * 1. Revisar: o lote agrupado por material, PEP para as que estão sem, e a
 *    confirmação de que as NFs foram lançadas.
 * 2. O banco confirma cada Requisição no Balcão com as regras do "Dar baixa"
 *    individual (`alm_sol_extra_baixar_lote`); uma falha não derruba as outras.
 * 3. Exportar: uma planilha só, no formato de sempre (uma linha por
 *    requisição — o retorno do Baixas_SAP liga cada linha pelo código RQB).
 */

import { useEffect, useId, useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2, Download, Loader2, PackageCheck, XCircle } from 'lucide-react';
import Modal, { ModalBody, ModalFooter, ModalHeader } from '../ui/Modal';
import { useToast } from '../ui/Toast';
import type { Profile } from '../../types';
import type { SolExtra } from '../../lib/solicitacaoExtraApi';
import { baixarRetiradasEmLote } from '../../lib/solicitacaoExtraApi';
import {
  agruparPorMaterial, itensQueFicam, itensQueSaem, naoAprovada, resumirResultado, semPep, type ResultadoBaixaLote,
} from '../../lib/baixaLoteRetiradas';
import type { ItensBaixadosPorId } from '../../lib/retiradaSemSaldoBaixa';
import {
  buscarRequisicoesBalcaoPorIds, listarAplicacoesBalcao, registrarExportacaoBalcao,
} from '../../lib/requisicaoBalcaoApi';
import { baixarPlanilhaBalcao, gerarPlanilhaBalcao } from '../../lib/requisicaoBalcaoPlanilha';
import type { PepAplicacao } from '../../lib/requisicaoBalcao';
import { formatQtd } from '../../lib/almoxarifado';

interface Props {
  registros: SolExtra[];
  /** Item a item: o saldo de hoje cobre? (null = não lido: considera todos). */
  cobertura: Map<string, boolean[]> | null;
  /** Item a item: já saiu numa baixa parcial? */
  baixados: ItensBaixadosPorId | null;
  user: Profile;
  onClose: () => void;
  /** Depois da baixa (a lista muda). */
  onFeito: () => void;
  onNavigate: (path: string) => void;
}

export default function BaixaLoteRetiradasModal({ registros, cobertura, baixados, user, onClose, onFeito, onNavigate }: Props) {
  const toast = useToast();
  const idPep = useId();
  const idNf = useId();

  // Só o que sai agora: na retirada de saldo parcial, os itens com saldo.
  const grupos = useMemo(
    () => agruparPorMaterial(registros.map(r => ({ itens: itensQueSaem(r, cobertura, baixados) }))),
    [registros, cobertura, baixados],
  );
  const parciais = useMemo(() => {
    const lista = registros.map(r => itensQueFicam(r, cobertura, baixados).length).filter(n => n > 0);
    return { retiradas: lista.length, itensFicam: lista.reduce((s, n) => s + n, 0) };
  }, [registros, cobertura, baixados]);
  const qtdSemPep = useMemo(() => registros.filter(semPep).length, [registros]);
  const qtdNaoAprovadas = useMemo(() => registros.filter(naoAprovada).length, [registros]);

  const [peps, setPeps] = useState<PepAplicacao[]>([]);
  const [pepLote, setPepLote] = useState('');
  const [nfLancada, setNfLancada] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoBaixaLote[] | null>(null);
  const [exportando, setExportando] = useState(false);
  const [exportado, setExportado] = useState<string | null>(null);

  useEffect(() => {
    if (qtdSemPep === 0) return;
    listarAplicacoesBalcao().then(setPeps).catch(() => setPeps([]));
  }, [qtdSemPep]);

  const resumo = resultado ? resumirResultado(resultado) : null;

  const fechar = () => {
    if (enviando || exportando) return;
    if (resultado) onFeito();
    onClose();
  };

  const darBaixa = async () => {
    const codigos = registros.map(r => r.codigo).filter((c): c is string => !!c);
    setEnviando(true);
    try {
      const linhas = await baixarRetiradasEmLote(codigos, pepLote || null, user.name);
      setResultado(linhas);
      const ok = linhas.filter(l => l.ok).length;
      if (ok > 0) toast.success(`${ok} retirada(s) baixada(s) e regularizada(s).`);
      if (ok < linhas.length) toast.warning(`${linhas.length - ok} não foram baixadas — veja o motivo na lista.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível dar baixa no lote.');
    } finally {
      setEnviando(false);
    }
  };

  const exportar = async () => {
    if (!resumo || resumo.idsConfirmados.length === 0) return;
    setExportando(true);
    try {
      const requisicoes = await buscarRequisicoesBalcaoPorIds(resumo.idsConfirmados);
      const planilha = gerarPlanilhaBalcao(requisicoes);
      await registrarExportacaoBalcao(requisicoes.map(r => r.id), planilha, user.name);
      baixarPlanilhaBalcao(planilha.blob, planilha.arquivo);
      setExportado(planilha.arquivo);
      toast.success(`${planilha.arquivo}: ${requisicoes.length} requisição(ões), ${planilha.linhas} linha(s).`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível exportar a planilha.');
    } finally {
      setExportando(false);
    }
  };

  return (
    <Modal onClose={fechar} maxWidth="max-w-2xl" ariaLabel="Baixa em lote" disableOutsideClose={enviando || exportando || !!resultado}>
      <ModalHeader onClose={enviando || exportando ? undefined : fechar}>
        <h3 className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-slate-50">
          <PackageCheck className="h-5 w-5 text-emerald-600" aria-hidden="true" />
          Baixa em lote — {registros.length} retirada{registros.length === 1 ? '' : 's'}
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {resultado
            ? 'Requisições confirmadas. Exporte a planilha para o SAP.'
            : 'Confere o lote, confirma de uma vez e depois exporta uma planilha só para o SAP.'}
        </p>
      </ModalHeader>

      <ModalBody className="space-y-4">
        {!resultado ? (
          <>
            <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
              <div className="flex items-center justify-between bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
                <span>{grupos.length} material(is)</span>
                <span>Retiradas · Qtd</span>
              </div>
              <ul className="max-h-64 divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
                {grupos.map(g => (
                  <li key={g.material} className="flex items-center justify-between gap-3 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-50">{g.descricao || g.material}</p>
                      <p className="font-mono text-[11px] text-slate-500">{g.material}</p>
                    </div>
                    <p className="shrink-0 text-right text-sm tabular-nums text-slate-700 dark:text-slate-200">
                      {g.retiradas} · <strong>{formatQtd(g.quantidade)} {g.unidade}</strong>
                    </p>
                  </li>
                ))}
              </ul>
            </div>

            {parciais.retiradas > 0 && (
              <p className="flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                {parciais.retiradas} retirada(s) com saldo parcial: saem só os itens que já têm saldo, numa requisição nova.
                {' '}{parciais.itensFicam} item(ns) sem saldo ficam pendentes na retirada, aguardando a NF.
              </p>
            )}

            {qtdNaoAprovadas > 0 && (
              <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                {qtdNaoAprovadas} retirada(s) ainda sem aprovação do gestor. A baixa não depende da aprovação, mas confira antes.
              </p>
            )}

            {qtdSemPep > 0 && (
              <div className="space-y-1">
                <label htmlFor={idPep} className="text-xs font-bold text-slate-700 dark:text-slate-200">
                  PEP para as {qtdSemPep} retirada(s) sem PEP
                </label>
                <select
                  id={idPep}
                  value={pepLote}
                  onChange={e => setPepLote(e.target.value)}
                  disabled={enviando}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                >
                  <option value="">Escolha o PEP (sem ele, essas ficam fora do lote)</option>
                  {peps.map(p => <option key={p.wbs} value={p.wbs}>{p.wbs} — {p.nome}</option>)}
                </select>
                <p className="text-[11px] text-slate-500">As que já têm PEP mantêm o delas.</p>
              </div>
            )}

            <label htmlFor={idNf} className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-800 dark:border-slate-700 dark:text-slate-100">
              <input
                id={idNf}
                type="checkbox"
                checked={nfLancada}
                onChange={e => setNfLancada(e.target.checked)}
                disabled={enviando}
                className="mt-0.5 h-4 w-4 accent-emerald-600"
              />
              <span>
                Confirmo que as NFs foram lançadas e que o saldo da ZL0024 cobre este lote.
                <span className="block text-xs text-slate-500">O banco confere o saldo de novo e só confirma o que tiver saldo.</span>
              </span>
            </label>
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900 dark:bg-emerald-950/40">
                <p className="text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-300">{resumo!.ok.length}</p>
                <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                  baixadas{resumo!.parciais.length > 0 ? ` (${resumo!.parciais.length} parcial${resumo!.parciais.length === 1 ? '' : 'is'} — o resto segue pendente)` : ' e regularizadas'}
                </p>
              </div>
              <div className={`rounded-xl border p-3 ${resumo!.falhas.length > 0 ? 'border-rose-200 bg-rose-50 dark:border-rose-900 dark:bg-rose-950/40' : 'border-slate-200 dark:border-slate-700'}`}>
                <p className={`text-2xl font-bold tabular-nums ${resumo!.falhas.length > 0 ? 'text-rose-700 dark:text-rose-300' : 'text-slate-500'}`}>{resumo!.falhas.length}</p>
                <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">não baixadas</p>
              </div>
            </div>

            {resumo!.falhas.length > 0 && (
              <ul className="max-h-48 space-y-1 overflow-y-auto rounded-xl border border-rose-200 p-2 dark:border-rose-900">
                {resumo!.falhas.map(f => (
                  <li key={f.rss} className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-200">
                    <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-600" aria-hidden="true" />
                    <span><span className="font-mono font-bold">{f.rss}</span> — {f.erro}</span>
                  </li>
                ))}
              </ul>
            )}

            {resumo!.idsConfirmados.length > 0 && (
              <div className="space-y-2 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                <p className="text-sm font-bold text-slate-900 dark:text-slate-50">Próximo passo: exportar para o SAP</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Uma planilha com as {resumo!.idsConfirmados.length} requisições confirmadas agora, no formato de sempre. Depois de processar no Baixas_SAP,
                  importe o retorno na Requisição no Balcão — o documento SAP entra sozinho.
                </p>
                {exportado ? (
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> {exportado} baixada e registrada como exportada.
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={() => void exportar()}
                    disabled={exportando}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-60"
                  >
                    {exportando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Download className="h-4 w-4" aria-hidden="true" />}
                    Exportar planilha ({resumo!.idsConfirmados.length} requisições)
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </ModalBody>

      <ModalFooter>
        {!resultado ? (
          <>
            <button type="button" onClick={fechar} disabled={enviando} className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800">
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void darBaixa()}
              disabled={!nfLancada || enviando || registros.length === 0}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {enviando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <PackageCheck className="h-4 w-4" aria-hidden="true" />}
              Dar baixa em {registros.length}
            </button>
          </>
        ) : (
          <>
            {exportado && (
              <button
                type="button"
                onClick={() => { onFeito(); onClose(); onNavigate('/formularios/almoxarifado-requisicao-balcao'); }}
                className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-slate-800"
              >
                Abrir Requisição no Balcão <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
            <button type="button" onClick={fechar} disabled={exportando} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900">
              Fechar
            </button>
          </>
        )}
      </ModalFooter>
    </Modal>
  );
}
