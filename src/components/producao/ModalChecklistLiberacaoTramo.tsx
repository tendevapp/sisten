import React, { useState } from 'react';
import { Check, Loader2, X } from 'lucide-react';
import {
  ETAPAS_CHECKLIST_LIBERACAO,
  calcularProgressoChecklist,
  type ApontamentoChecklistLiberacao,
  type EtapaChecklistLiberacao,
  type TorreEntregaAgrupada,
  type TramoEntrega,
} from '../../lib/producaoEntrega';

interface ModalChecklistLiberacaoTramoProps {
  tramo: TramoEntrega;
  torre: TorreEntregaAgrupada | null;
  apontamentos: ApontamentoChecklistLiberacao[];
  etapaEmAndamento: EtapaChecklistLiberacao | null;
  aoFechar: () => void;
  aoToggleEtapa: (etapa: EtapaChecklistLiberacao, responsavel: string) => void;
}

export default function ModalChecklistLiberacaoTramo({
  tramo,
  apontamentos,
  etapaEmAndamento,
  aoFechar,
  aoToggleEtapa,
}: ModalChecklistLiberacaoTramoProps) {
  const [responsavel, setResponsavel] = useState('');

  const apontamentoPorEtapa = new Map(apontamentos.map(a => [a.etapa_codigo, a]));
  const progresso = calcularProgressoChecklist(apontamentos);
  const proximaEtapaPendente = ETAPAS_CHECKLIST_LIBERACAO.find(e => !apontamentoPorEtapa.has(e.codigo))?.codigo;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="relative flex max-h-[92vh] w-full max-w-lg flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        {/* Cabeçalho */}
        <div className="flex items-start justify-between border-b border-slate-100 p-5 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-display text-lg font-bold text-slate-900 dark:text-slate-100">
                Torre {tramo.torre_numero} · Tramo {tramo.tramo}
              </h3>
              <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                Série {tramo.serie}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Checklist de Liberação — etapas entre White e Expedido
            </p>
          </div>
          <button
            type="button"
            onClick={aoFechar}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Corpo */}
        <div className="flex-1 space-y-3 overflow-y-auto p-5 text-sm">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Progresso
              </span>
              <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-bold text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">
                {progresso.concluidas}/{progresso.total} concluídas
              </span>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div
                className={`h-full rounded-full transition-all ${progresso.percentual === 100 ? 'bg-indigo-600 dark:bg-indigo-500' : 'bg-blue-600 dark:bg-blue-500'}`}
                style={{ width: `${progresso.percentual}%` }}
              />
            </div>
          </div>

          <input
            type="text"
            value={responsavel}
            onChange={e => setResponsavel(e.target.value)}
            placeholder="Quem está apontando? (opcional)"
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-800 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />

          <ol className="space-y-1.5">
            {ETAPAS_CHECKLIST_LIBERACAO.map(etp => {
              const apontamento = apontamentoPorEtapa.get(etp.codigo);
              const concluida = !!apontamento;
              const emAndamento = etapaEmAndamento === etp.codigo;
              const proxima = !concluida && proximaEtapaPendente === etp.codigo;
              const dataFmt = apontamento
                ? new Date(apontamento.concluida_em).toLocaleString('pt-BR', {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : null;

              return (
                <li key={etp.codigo}>
                  <button
                    type="button"
                    onClick={() => aoToggleEtapa(etp.codigo, responsavel)}
                    disabled={emAndamento}
                    title={etp.descricao}
                    className={`flex w-full items-start gap-3 rounded-xl border p-2.5 text-left transition-all disabled:opacity-60 ${
                      concluida
                        ? 'border-indigo-200 bg-indigo-50/60 dark:border-indigo-900/60 dark:bg-indigo-950/20'
                        : proxima
                        ? 'border-blue-300 border-dashed bg-white dark:border-blue-800 dark:bg-slate-900'
                        : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700'
                    }`}
                  >
                    <span
                      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                        concluida
                          ? 'border-indigo-600 bg-indigo-600 text-white'
                          : 'border-slate-300 text-transparent dark:border-slate-600'
                      }`}
                    >
                      {emAndamento ? (
                        <Loader2 className="h-3 w-3 animate-spin text-blue-600" />
                      ) : (
                        <Check className="h-3 w-3" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className={`block text-xs font-bold ${
                          concluida ? 'text-indigo-900 dark:text-indigo-200' : 'text-slate-800 dark:text-slate-200'
                        }`}
                      >
                        {etp.rotulo}
                      </span>
                      {concluida ? (
                        <span className="mt-0.5 block text-[11px] text-indigo-700/80 dark:text-indigo-300/80">
                          Concluída em {dataFmt}
                          {apontamento?.concluida_por ? ` · por ${apontamento.concluida_por}` : ''}
                        </span>
                      ) : proxima ? (
                        <span className="mt-0.5 block text-[11px] font-semibold text-blue-600 dark:text-blue-400">
                          Próxima etapa — clique para apontar
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>

        {/* Rodapé */}
        <div className="flex items-center justify-end border-t border-slate-100 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-900/60">
          <button
            type="button"
            onClick={aoFechar}
            className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
