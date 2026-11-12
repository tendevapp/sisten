/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Admin › Monitor de Desempenho. Para achar a causa quando o SISTEN fica
 * lento ou trava:
 *
 *  - Agora: o banco neste instante (alertas, consultas rodando, locks,
 *    conexões) e quem está online;
 *  - Resumo do dia: análise automática de um dia, com texto para copiar;
 *  - Linha do tempo: amostra por minuto do pg_cron — o que pesou em cada
 *    momento, inclusive depois que passou;
 *  - Páginas e gargalos: o que os aparelhos sentiram, por página, por chamada
 *    e por usuário;
 *  - Consumo: banco, Storage, volume baixado (egress estimado) e logins;
 *  - Banco: consultas acumuladas e saúde das tabelas.
 *
 * Dados: migration 20261111233000 (coletor + RPCs admin) e o reporter de cada
 * aparelho (lib/desempenho/reporterDesempenho.ts).
 */

import React, { useCallback, useState } from 'react';
import { Gauge } from 'lucide-react';
import { PERIODOS, type OpcaoPeriodo } from '../../../lib/desempenho/api';
import AbaAgora from './AbaAgora';
import AbaResumoDia from './AbaResumoDia';
import AbaLinhaTempo from './AbaLinhaTempo';
import AbaPaginas from './AbaPaginas';
import AbaConsumo from './AbaConsumo';
import AbaBanco from './AbaBanco';

type IdAba = 'agora' | 'resumo' | 'linha' | 'paginas' | 'consumo' | 'banco';

const ABAS: { id: IdAba; rotulo: string; comPeriodo: boolean }[] = [
  { id: 'agora', rotulo: 'Agora', comPeriodo: false },
  { id: 'resumo', rotulo: 'Resumo do dia', comPeriodo: false },
  { id: 'linha', rotulo: 'Linha do tempo', comPeriodo: true },
  { id: 'paginas', rotulo: 'Páginas e gargalos', comPeriodo: true },
  { id: 'consumo', rotulo: 'Consumo', comPeriodo: true },
  { id: 'banco', rotulo: 'Banco', comPeriodo: false },
];

const CHAVE_ABA = 'sisten_monitor_desempenho_aba';

function abaInicial(): IdAba {
  try {
    const salva = localStorage.getItem(CHAVE_ABA) as IdAba | null;
    if (salva && ABAS.some(a => a.id === salva)) return salva;
  } catch {
    /* sem storage */
  }
  return 'agora';
}

export default function MonitorDesempenho() {
  const [aba, setAba] = useState<IdAba>(abaInicial);
  const [periodo, setPeriodo] = useState<OpcaoPeriodo>(PERIODOS[2]);
  const [atualizadoEm, setAtualizadoEm] = useState<number | null>(null);
  const aoAtualizar = useCallback((em: number) => setAtualizadoEm(em), []);

  const trocarAba = (id: IdAba) => {
    setAba(id);
    try {
      localStorage.setItem(CHAVE_ABA, id);
    } catch {
      /* sem storage */
    }
  };

  const atual = ABAS.find(a => a.id === aba)!;

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="border-b border-slate-100 pb-5 dark:border-slate-800">
        <h2 className="flex items-center gap-2.5 text-2xl font-extrabold text-slate-850 dark:text-slate-50">
          <Gauge className="h-7 w-7 text-emerald-600 dark:text-emerald-500" />
          Monitor de Desempenho
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-slate-555 dark:text-slate-400">
          Onde o SISTEN está lento e por quê: o banco agora e minuto a minuto, as páginas e chamadas que mais fazem o usuário esperar,
          quem está online e quanto o Supabase está consumindo.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Seções do monitor" className="flex flex-wrap gap-1 rounded-xl p-1" style={{ background: 'var(--surface-sunken)' }}>
          {ABAS.map(a => (
            <button
              key={a.id}
              type="button"
              role="tab"
              aria-selected={aba === a.id}
              onClick={() => trocarAba(a.id)}
              className="rounded-lg px-3 py-1.5 text-xs font-bold transition-colors"
              style={
                aba === a.id
                  ? { background: 'var(--surface-card)', color: 'var(--ink-primary)', boxShadow: '0 1px 2px rgb(0 0 0 / 0.08)' }
                  : { color: 'var(--ink-secondary)' }
              }
            >
              {a.rotulo}
            </button>
          ))}
        </div>

        {atual.comPeriodo ? (
          <label className="flex items-center gap-2 text-xs font-semibold" style={{ color: 'var(--ink-secondary)' }}>
            Período
            <select
              value={periodo.id}
              onChange={e => setPeriodo(PERIODOS.find(p => p.id === e.target.value) ?? PERIODOS[2])}
              className="h-8 rounded-lg border px-2 text-xs"
              style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)', color: 'var(--ink-primary)' }}
            >
              {PERIODOS.map(p => (
                <option key={p.id} value={p.id}>
                  {p.rotulo}
                </option>
              ))}
            </select>
          </label>
        ) : aba === 'agora' && atualizadoEm ? (
          <span className="text-xs tabular" style={{ color: 'var(--ink-muted)' }}>
            Atualizado às {new Date(atualizadoEm).toLocaleTimeString('pt-BR')} · a cada 15 s
          </span>
        ) : null}
      </div>

      <div role="tabpanel">
        {aba === 'agora' && <AbaAgora aoAtualizar={aoAtualizar} />}
        {aba === 'resumo' && <AbaResumoDia />}
        {aba === 'linha' && <AbaLinhaTempo periodo={periodo} />}
        {aba === 'paginas' && <AbaPaginas periodo={periodo} />}
        {aba === 'consumo' && <AbaConsumo periodo={periodo} />}
        {aba === 'banco' && <AbaBanco />}
      </div>
    </div>
  );
}
