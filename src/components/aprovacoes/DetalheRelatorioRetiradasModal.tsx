/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Retiradas por trás de um número do relatório de retiradas sem saldo:
 * cada uma inteira (todos os materiais), mais recentes primeiro.
 */

import type { SolExtra } from '../../lib/solicitacaoExtraApi';
import { rotuloStatusSolExtra } from '../../lib/solicitacaoExtra';
import { formatarDataBR } from '../../lib/fichaEpi';
import { formatQtd } from '../../lib/format';
import Modal, { ModalBody, ModalFooter, ModalHeader } from '../ui/Modal';
import { AprovacaoChip } from '../almoxarifado/RetiradaSemSaldo';

export default function DetalheRelatorioRetiradasModal({ titulo, registros, onClose }: {
  titulo: string; registros: SolExtra[]; onClose: () => void;
}) {
  return (
    <Modal onClose={onClose} maxWidth="max-w-4xl" ariaLabel={`Retiradas — ${titulo}`}>
      <ModalHeader onClose={onClose}>
        <h3 className="truncate text-base font-bold text-slate-900 dark:text-slate-50">{titulo}</h3>
        <p className="text-xs text-slate-500">{registros.length.toLocaleString('pt-BR')} retirada(s) · filtros do relatório aplicados</p>
      </ModalHeader>
      <ModalBody className="space-y-3">
        {registros.length === 0 && <p className="text-sm text-slate-500">Nenhuma retirada neste recorte.</p>}
        {registros.map(r => {
          const baixada = r.status === 'REGULARIZADA';
          return (
            <article key={r.id} className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
              <header className="space-y-1.5 bg-slate-50 px-3 py-2.5 dark:bg-slate-800/60">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-bold text-blue-700 dark:text-blue-300">{r.codigo || 'A sincronizar'}</span>
                  <span className="text-xs text-slate-600 dark:text-slate-300">{formatarDataBR(r.data)} {r.hora?.slice(0, 5)}</span>
                  <span className="ml-auto flex flex-wrap gap-1.5">
                    <AprovacaoChip status={r.aprovacao_status} />
                    <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${baixada
                      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                      : 'bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300'}`}>
                      {rotuloStatusSolExtra(r.status, 'SEM_SALDO')}{r.requisicao_balcao_codigo && ` · ${r.requisicao_balcao_codigo}`}
                    </span>
                  </span>
                </div>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                  {r.retirante_nome || 'Retirante não informado'}
                  {r.retirante_matricula && <span className="font-normal text-slate-500"> · {r.retirante_matricula}</span>}
                  <span className="font-normal text-slate-500"> · {r.setor_solicitante_nome || 'Setor não informado'}</span>
                </p>
              </header>
              <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-800">
                {r.itens.map((item, i) => (
                  <li key={`${item.material}-${i}`} className="flex items-baseline gap-3 px-3 py-1.5 text-slate-700 dark:text-slate-200">
                    <span className="w-20 shrink-0 font-mono text-xs">{item.material}</span>
                    <span className="min-w-0 flex-1 break-words">{item.descricao || '—'}</span>
                    <span className="shrink-0 whitespace-nowrap tabular-nums">{formatQtd(item.quantidade)} {item.unidade}</span>
                  </li>
                ))}
              </ul>
              {(r.aprovado_por_nome || r.aprovacao_obs || r.observacao || r.criado_por_nome) && (
                <footer className="space-y-0.5 border-t border-slate-100 px-3 py-2 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  <p>Registrado por {r.criado_por_nome || '—'}
                    {r.aprovado_por_nome && <> · decisão de {r.aprovado_por_nome}{r.aprovado_em && ` em ${new Date(r.aprovado_em).toLocaleString('pt-BR')}`}</>}
                  </p>
                  {r.aprovacao_obs && <p className="whitespace-pre-wrap break-words">Parecer: {r.aprovacao_obs}</p>}
                  {r.observacao && <p className="whitespace-pre-wrap break-words">Observação: {r.observacao}</p>}
                </footer>
              )}
            </article>
          );
        })}
      </ModalBody>
      <ModalFooter>
        <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
          Fechar
        </button>
      </ModalFooter>
    </Modal>
  );
}
