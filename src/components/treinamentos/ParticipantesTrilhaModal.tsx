/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Quem já fez a trilha e até onde chegou (admin ou flag `trein_gerenciar`,
 * checada também na RPC `trein_participantes`).
 */

import React from 'react';
import { CheckCircle2, Loader2, Search } from 'lucide-react';
import Modal, { ModalBody, ModalHeader } from '../ui/Modal';
import { listarParticipantes, type ParticipanteTrilha } from '../../lib/treinamentosApi';
import type { TrilhaTreinamento } from '../../lib/treinamentos';

interface Props {
  trilha: TrilhaTreinamento;
  onClose: () => void;
}

const dataBR = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—');

export default function ParticipantesTrilhaModal({ trilha, onClose }: Props) {
  const [lista, setLista] = React.useState<ParticipanteTrilha[] | null>(null);
  const [erro, setErro] = React.useState<string | null>(null);
  const [busca, setBusca] = React.useState('');

  React.useEffect(() => {
    listarParticipantes(trilha.id).then(setLista).catch(e => setErro(String(e?.message ?? e)));
  }, [trilha.id]);

  const termo = busca.toLowerCase().trim();
  const filtrada = (lista ?? []).filter(p => !termo || `${p.nome ?? ''} ${p.email ?? ''} ${p.setor ?? ''}`.toLowerCase().includes(termo));
  const concluiram = (lista ?? []).filter(p => p.concluida_em).length;

  return (
    <Modal onClose={onClose} ariaLabel="Participantes da trilha" maxWidth="max-w-3xl">
      <ModalHeader onClose={onClose}>
        <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Participantes · {trilha.titulo}</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {trilha.codigo} · {lista ? `${lista.length} iniciaram · ${concluiram} concluíram` : 'carregando...'}
        </p>
      </ModalHeader>
      <ModalBody className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar colaborador ou setor..."
            className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        </div>

        {erro ? (
          <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{erro}</p>
        ) : !lista ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
          </div>
        ) : filtrada.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-500">Ninguém iniciou esta trilha ainda.</p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
            {filtrada.map(p => {
              const pct = Math.round((p.missoes_concluidas / Math.max(1, p.total_missoes)) * 100);
              return (
                <li key={p.usuario_id} className="grid gap-2 px-4 py-3 sm:grid-cols-[1fr_180px_120px] sm:items-center">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{p.nome ?? p.email ?? p.usuario_id}</p>
                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">{p.setor ?? 'Sem setor'}</p>
                  </div>
                  <div>
                    <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                      <span>{p.missoes_concluidas}/{p.total_missoes} missões</span>
                      <span>{p.xp} XP · {p.estrelas}★</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div className={`h-full rounded-full ${p.concluida_em ? 'bg-emerald-500' : 'bg-orange-500'}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  <div className="text-xs sm:text-right">
                    {p.concluida_em ? (
                      <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-400">
                        <CheckCircle2 className="h-3.5 w-3.5" /> {dataBR(p.concluida_em)}
                      </span>
                    ) : (
                      <span className="text-slate-500 dark:text-slate-400">Últ. {dataBR(p.ultima_atividade)}</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </ModalBody>
    </Modal>
  );
}
