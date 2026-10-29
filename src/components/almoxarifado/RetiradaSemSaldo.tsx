/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Peças da Retirada sem Saldo (Solicitação Extraordinária tipo SEM_SALDO,
 * código RSS) usadas em três telas: o próprio formulário (detalhe), Solicitações
 * › Aprovações (gestor do setor) e Geral › Pendências (baixa do almoxarifado).
 *
 * - `AprovacaoChip`        — situação da aprovação do gestor;
 * - `ResumoRetirada`       — identificação, materiais, aprovação e baixa;
 * - `BotaoPdfRetirada`     — PDF para imprimir; antes da aprovação avisa e
 *                            pede "gerar mesmo assim";
 * - `BaixaRetiradaModal`   — saldo da ZL0024 de cada item e atalho para a
 *                            Requisição no Balcão pendente da retirada.
 */

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, BadgeCheck, CheckCircle2, Clock, FileDown, Loader2, PackageCheck, XCircle } from 'lucide-react';
import type { Profile } from '../../types';
import { useToast } from '../ui/Toast';
import Modal, { ModalBody, ModalFooter, ModalHeader } from '../ui/Modal';
import ConfirmDialog from '../ui/ConfirmDialog';
import PdfPreviewModal from '../ui/PdfPreviewModal';
import { formatQtd } from '../../lib/format';
import { formatarDataBR } from '../../lib/fichaEpi';
import { formatDeposito } from '../../lib/almoxarifado';
import { indexarEstoquePorDeposito } from '../../lib/requisicaoBalcao';
import { buscarEstoqueBalcao } from '../../lib/requisicaoBalcaoApi';
import { CHAVE_ABRIR_REQUISICAO_BALCAO } from '../../lib/fichaEpiRequisicao';
import { APROVACAO_SOL_EXTRA_ROTULO, rotuloStatusSolExtra, type AprovacaoSolExtra } from '../../lib/solicitacaoExtra';
import type { SolExtra } from '../../lib/solicitacaoExtraApi';
import { planejarBaixa, requisicaoDaRetirada, type LinhaBaixa } from '../../lib/retiradaSemSaldoBaixa';
import { gerarRetiradaSemSaldoPdf } from '../../lib/pdfExport/exportRetiradaSemSaldoPdf';
import { GaleriaFotosSolExtra } from './FotosSolicitacaoExtra';

const COR_APROVACAO: Record<AprovacaoSolExtra, string> = {
  PENDENTE: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
  APROVADA: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300',
  REPROVADA: 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300',
};

const ICONE_APROVACAO = { PENDENTE: Clock, APROVADA: CheckCircle2, REPROVADA: XCircle } as const;

const dataHora = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—');

export function AprovacaoChip({ status }: { status: AprovacaoSolExtra | null }) {
  const s = status ?? 'PENDENTE';
  const Icone = ICONE_APROVACAO[s];
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${COR_APROVACAO[s]}`}>
      <Icone className="h-3 w-3" /> {APROVACAO_SOL_EXTRA_ROTULO[s]}
    </span>
  );
}

/** Uma linha de resumo para cartões: itens. */
export const resumoItensRetirada = (r: SolExtra) =>
  r.itens.length === 1 ? `${formatQtd(r.itens[0].quantidade)} ${r.itens[0].unidade} · ${r.itens[0].material} · ${r.itens[0].descricao}` : `${r.itens.length} materiais`;

function Info({ rotulo, valor }: { rotulo: string; valor: string | null | undefined }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{rotulo}</p>
      <p className="truncate font-medium text-slate-800 dark:text-slate-100">{valor || '—'}</p>
    </div>
  );
}

/** Corpo do detalhe de uma retirada sem saldo. */
export function ResumoRetirada({ registro: r }: { registro: SolExtra }) {
  const aprovacao = r.aprovacao_status ?? 'PENDENTE';
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800/50 sm:grid-cols-3">
        <Info rotulo="Quem retirou" valor={r.retirante_nome} />
        <Info rotulo="Matrícula" valor={r.retirante_matricula || (r.retirante_nome && !r.retirante_id ? 'Não cadastrado no RH' : null)} />
        <Info rotulo="Setor solicitante" valor={r.setor_solicitante_nome} />
        <Info rotulo="PEP / aplicação" valor={r.aplicacao_pep ? `${r.aplicacao || ''} — ${r.aplicacao_pep}` : 'A definir na baixa'} />
        <Info rotulo="Data · hora" valor={[formatarDataBR(r.data), r.hora?.slice(0, 5)].filter(Boolean).join(' · ')} />
        <Info rotulo="Registrado por" valor={r.criado_por_nome} />
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Aprovação</p>
          <AprovacaoChip status={r.aprovacao_status} />
        </div>
      </div>

      <section className="space-y-1.5">
        <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Materiais</h4>
        <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
              <tr>
                <th className="px-3 py-1.5 text-left">Código SAP</th>
                <th className="px-3 py-1.5 text-right">Quant.</th>
                <th className="px-3 py-1.5 text-left">Descrição</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {r.itens.map((it, i) => (
                <tr key={`${it.material}-${i}`}>
                  <td className="px-3 py-1.5 font-mono font-semibold text-slate-800 dark:text-slate-100">{it.material}</td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums text-slate-800 dark:text-slate-100">{formatQtd(it.quantidade)} {it.unidade}</td>
                  <td className="px-3 py-1.5 text-slate-700 dark:text-slate-200">{it.descricao || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {r.observacao && <p className="whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-300">{r.observacao}</p>}
        <GaleriaFotosSolExtra fotos={r.fotos ?? []} />
      </section>

      <section className="space-y-1.5">
        <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Assinatura de quem retirou</h4>
        {r.assinatura_retirante ? (
          <div className="flex items-end gap-3">
            <img src={r.assinatura_retirante} alt={`Assinatura de ${r.retirante_nome || 'quem retirou'}`} className="h-16 max-w-[14rem] rounded-lg border border-slate-200 bg-white object-contain p-1 dark:border-slate-700" />
            {r.assinatura_retirante_em && <span className="text-[11px] text-slate-500">em {dataHora(r.assinatura_retirante_em)}</span>}
          </div>
        ) : (
          <p className="text-xs text-slate-500 dark:text-slate-400">Não coletada — edite a retirada para coletar, ou assine no PDF impresso.</p>
        )}
      </section>

      {aprovacao !== 'PENDENTE' && (
        <section
          className={`rounded-xl border p-3 text-sm ${
            aprovacao === 'APROVADA'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200'
              : 'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200'
          }`}
        >
          <p className="font-bold">
            {aprovacao === 'APROVADA' ? 'Aprovada' : 'Reprovada'} por {r.aprovado_por_nome || '—'} em {dataHora(r.aprovado_em)}
          </p>
          {r.aprovacao_obs && <p className="mt-1 whitespace-pre-wrap">{r.aprovacao_obs}</p>}
        </section>
      )}

      {r.status === 'REGULARIZADA' && (
        <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm dark:border-emerald-900 dark:bg-emerald-950/30">
          <p className="flex items-center gap-1.5 font-bold text-emerald-800 dark:text-emerald-300">
            <BadgeCheck className="h-4 w-4" /> {rotuloStatusSolExtra(r.status, 'SEM_SALDO')} — requisição {r.requisicao_balcao_codigo}
          </p>
          <p className="mt-1 text-emerald-900 dark:text-emerald-200">Por {r.regularizado_por_nome || '—'} em {dataHora(r.regularizado_em)}</p>
          {r.regularizacao_obs && <p className="mt-1 whitespace-pre-wrap text-emerald-900 dark:text-emerald-200">{r.regularizacao_obs}</p>}
        </section>
      )}
    </div>
  );
}

/**
 * Botão "PDF": aprovada, gera direto; antes disso avisa que o documento sai
 * marcado "Aguardando aprovação" e só gera se a pessoa confirmar. Com fotos,
 * a pré-visualização tem a opção "Incluir fotos" (regera ao marcar).
 */
export function BotaoPdfRetirada({ registro, className }: { registro: SolExtra; className?: string }) {
  const [confirmar, setConfirmar] = useState(false);
  const [aberto, setAberto] = useState(false);
  const [incluirFotos, setIncluirFotos] = useState(false);
  const aprovada = registro.aprovacao_status === 'APROVADA';
  const qtdFotos = registro.fotos?.length ?? 0;
  const gerar = useCallback(() => gerarRetiradaSemSaldoPdf(registro, { incluirFotos }), [registro, incluirFotos]);

  return (
    <>
      <button
        type="button"
        onClick={e => {
          e.stopPropagation();
          if (aprovada) setAberto(true);
          else setConfirmar(true);
        }}
        className={className ?? 'inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:border-blue-400 hover:text-blue-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'}
      >
        <FileDown className="h-4 w-4" /> PDF
      </button>
      {confirmar && (
        <ConfirmDialog
          titulo="Retirada ainda não aprovada"
          mensagem={
            registro.aprovacao_status === 'REPROVADA'
              ? `A retirada ${registro.codigo || ''} foi reprovada pelo gestor. O PDF sai marcado como reprovado. Gerar mesmo assim?`
              : `O gestor do setor ${registro.setor_solicitante_nome || 'solicitante'} ainda não aprovou a retirada ${registro.codigo || ''}. O PDF sai marcado "Aguardando aprovação", com a assinatura de autorização em branco. Gerar mesmo assim?`
          }
          confirmarLabel="Gerar mesmo assim"
          onCancelar={() => setConfirmar(false)}
          onConfirmar={() => {
            setConfirmar(false);
            setAberto(true);
          }}
        />
      )}
      {aberto && (
        <PdfPreviewModal
          gerar={gerar}
          onClose={() => setAberto(false)}
          tituloPadrao={`Retirada sem saldo ${registro.codigo || ''}`}
          acoesExtras={qtdFotos > 0 ? (
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-bold text-slate-700 dark:border-slate-700 dark:text-slate-200">
              <input type="checkbox" checked={incluirFotos} onChange={e => setIncluirFotos(e.target.checked)} className="h-4 w-4 accent-blue-600" />
              Incluir fotos ({qtdFotos})
            </label>
          ) : undefined}
        />
      )}
    </>
  );
}

/**
 * Baixa pelo almoxarifado. A Requisição no Balcão da retirada já nasceu
 * pendente de confirmação (trigger no registro da RSS); aqui se vê o saldo
 * da ZL0024 de cada item agora e se abre a requisição no Balcão — lá o
 * almoxarifado escolhe depósito e PEP e confirma, o que só é aceito com
 * saldo. Confirmada, a retirada fica baixada sozinha.
 */
export function BaixaRetiradaModal({
  registro, user, onClose, onNavigate,
}: {
  registro: SolExtra;
  user: Profile;
  onClose: () => void;
  onFeito?: () => void;
  onNavigate: (path: string) => void;
}) {
  const toast = useToast();
  const [carregando, setCarregando] = useState(true);
  const [linhas, setLinhas] = useState<LinhaBaixa[]>([]);
  const [abrindo, setAbrindo] = useState(false);

  useEffect(() => {
    let ativo = true;
    buscarEstoqueBalcao(true)
      .then(estoque => { if (ativo) setLinhas(planejarBaixa(registro.itens, indexarEstoquePorDeposito(estoque, true))); })
      .catch(err => toast.error(`Não foi possível ler o saldo da ZL0024: ${err instanceof Error ? err.message : String(err)}`))
      .finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
  }, [registro.itens, toast]);

  const semSaldo = linhas.filter(l => !l.cobre);
  const aprovada = registro.aprovacao_status === 'APROVADA';

  const abrirRequisicao = async () => {
    setAbrindo(true);
    try {
      const codigo = await requisicaoDaRetirada(registro, linhas, user.name);
      try { sessionStorage.setItem(CHAVE_ABRIR_REQUISICAO_BALCAO, codigo); } catch { /* sem storage: abre a lista */ }
      onClose();
      onNavigate('/formularios/almoxarifado-requisicao-balcao');
    } catch (err) {
      toast.error(`Não foi possível abrir a requisição: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setAbrindo(false);
    }
  };

  return (
    <Modal onClose={onClose} maxWidth="max-w-3xl" ariaLabel="Dar baixa na retirada sem saldo" disableOutsideClose={abrindo}>
      <ModalHeader onClose={onClose}>
        <p className="font-mono text-xs font-bold text-blue-700 dark:text-blue-400">{registro.codigo}</p>
        <h3 className="truncate text-base font-bold text-slate-900 dark:text-slate-50">Baixa no balcão</h3>
      </ModalHeader>

      <ModalBody className="space-y-4">
        {carregando ? (
          <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Lendo o saldo da ZL0024…</p>
        ) : (
          <>
            <div className="text-sm text-slate-700 dark:text-slate-200">
              <span className="font-bold">{registro.retirante_nome}</span>
              {registro.retirante_matricula && <span className="text-slate-500"> · {registro.retirante_matricula}</span>}
              <span className="text-slate-500"> · {registro.setor_solicitante_nome} · {formatarDataBR(registro.data)} {registro.hora?.slice(0, 5)}</span>
            </div>

            {!aprovada && (
              <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                {registro.aprovacao_status === 'REPROVADA'
                  ? `Retirada reprovada pelo gestor${registro.aprovacao_obs ? ` (${registro.aprovacao_obs})` : ''}. O material já saiu — a baixa regulariza o estoque mesmo assim.`
                  : 'Retirada ainda não aprovada pelo gestor do setor. Dá para dar baixa mesmo assim; a aprovação continua pendente em Aprovações.'}
              </p>
            )}

            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
                  <tr>
                    <th className="px-3 py-1.5 text-left">Material</th>
                    <th className="px-3 py-1.5 text-right">Quant.</th>
                    <th className="px-3 py-1.5 text-left">Depósito com saldo</th>
                    <th className="px-3 py-1.5 text-right">Saldo ZL0024</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {linhas.map(l => (
                    <tr key={l.material} className={l.cobre ? '' : 'bg-rose-50/60 dark:bg-rose-950/20'}>
                      <td className="px-3 py-1.5">
                        <span className="font-mono font-semibold text-slate-800 dark:text-slate-100">{l.material}</span>
                        <span className="block text-xs text-slate-500">{l.descricao}</span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums">{formatQtd(l.quantidade)} {l.unidade}</td>
                      <td className="px-3 py-1.5 text-xs">{l.saldoDeposito > 0 ? formatDeposito(l.deposito) : '—'}</td>
                      <td className={`whitespace-nowrap px-3 py-1.5 text-right tabular-nums font-semibold ${l.cobre ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                        {formatQtd(l.saldoDeposito)}
                        {l.saldoTotal !== l.saldoDeposito && <span className="block text-[10px] font-normal text-slate-400">total {formatQtd(l.saldoTotal)}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {semSaldo.length > 0 ? (
              <p className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                {semSaldo.length === 1 ? 'Um item ainda não tem' : `${semSaldo.length} itens ainda não têm`} saldo na ZL0024 — a requisição no balcão continua pendente
                e só pode ser confirmada quando a NF for lançada e a ZL0024 for atualizada.
              </p>
            ) : (
              <p className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
                <PackageCheck className="mt-0.5 h-4 w-4 shrink-0" />
                Todos os itens têm saldo. Abra a requisição, confira depósito e PEP e confirme — a retirada fica baixada.
              </p>
            )}
          </>
        )}
      </ModalBody>

      <ModalFooter>
        <button type="button" onClick={onClose} disabled={abrindo} className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-60 dark:text-slate-300 dark:hover:bg-slate-800">
          Fechar
        </button>
        <button
          type="button"
          onClick={() => void abrirRequisicao()}
          disabled={abrindo || carregando}
          className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {abrindo ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageCheck className="h-4 w-4" />}
          Abrir requisição no balcão
        </button>
      </ModalFooter>
    </Modal>
  );
}
