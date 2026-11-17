/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Progresso da gravação da planilha concluída. A gravação é uma chamada só ao
 * banco (a RPC grava todas as linhas e o log numa transação), então o % é por
 * etapa: cada etapa tem um teto e a barra anda até ele enquanto a etapa dura —
 * nunca chega a 100% antes de a gravação terminar de fato.
 */

import React, { useEffect, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { useMovimentoReduzido } from '../../home/cenas/util';

export type FaseGravacao = 'preparando' | 'gravando' | 'atualizando' | 'concluido';

const ORDEM: FaseGravacao[] = ['preparando', 'gravando', 'atualizando', 'concluido'];

/** Até onde a barra pode ir em cada fase. */
const TETO: Record<FaseGravacao, number> = { preparando: 10, gravando: 86, atualizando: 97, concluido: 100 };

const ROTULO: Record<Exclude<FaseGravacao, 'concluido'>, string> = {
  preparando: 'Preparando as linhas',
  gravando: 'Gravando o doc. SAP nas requisições',
  atualizando: 'Atualizando a lista',
};

/** Próximo passo da barra: rápido no começo da fase e devagar perto do teto. */
export function avancarProgresso(atual: number, teto: number): number {
  if (atual >= teto) return teto;
  return Math.min(teto, atual + Math.max(0.4, (teto - atual) * 0.06));
}

export default function ProgressoGravacao({ fase, linhas }: { fase: FaseGravacao; linhas: number }) {
  const reduzido = useMovimentoReduzido();
  const [pct, setPct] = useState(0);
  const teto = TETO[fase];

  useEffect(() => {
    if (fase === 'concluido') { setPct(100); return; }
    const id = window.setInterval(() => setPct((p) => avancarProgresso(p, teto)), 120);
    return () => window.clearInterval(id);
  }, [fase, teto]);

  const valor = Math.round(pct);
  const indiceFase = ORDEM.indexOf(fase);

  return (
    <div className="mx-auto max-w-md space-y-4 py-6" aria-live="polite">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-sm font-extrabold" style={{ color: 'var(--ink-primary)' }}>
            {fase === 'concluido' ? 'Planilha gravada' : 'Gravando a planilha…'}
          </p>
          <p className="text-xs" style={{ color: 'var(--ink-secondary)' }}>
            {linhas} linha(s) · não feche esta janela até terminar
          </p>
        </div>
        <span className="text-3xl font-black tabular-nums" style={{ color: 'var(--brand)' }}>{valor}%</span>
      </div>

      <div
        role="progressbar"
        aria-label="Progresso da gravação da planilha"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={valor}
        className="relative h-3 overflow-hidden rounded-full"
        style={{ background: 'color-mix(in srgb, var(--ink-muted) 15%, transparent)' }}
      >
        <div
          className={`relative h-full overflow-hidden rounded-full ${reduzido ? '' : 'transition-[width] duration-150 ease-out'}`}
          style={{ width: `${valor}%`, background: 'var(--brand)' }}
        >
          {/* Brilho que corre na barra enquanto grava (some com movimento reduzido). */}
          {!reduzido && fase !== 'concluido' && (
            <span
              aria-hidden="true"
              className="absolute inset-y-0 -left-1/2 w-1/2 animate-[brilhoBarra_1.2s_linear_infinite]"
              style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.45), transparent)' }}
            />
          )}
        </div>
      </div>
      <style>{'@keyframes brilhoBarra { from { transform: translateX(0); } to { transform: translateX(300%); } }'}</style>

      <ol className="space-y-1.5">
        {(Object.keys(ROTULO) as Exclude<FaseGravacao, 'concluido'>[]).map((f, i) => {
          const feito = indiceFase > i;
          const atual = indiceFase === i;
          return (
            <li key={f} className="flex items-center gap-2 text-xs" style={{ color: feito || atual ? 'var(--ink-primary)' : 'var(--ink-muted)' }}>
              {feito
                ? <Check className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--status-good)' }} aria-hidden="true" />
                : atual
                  ? <Loader2 className={`h-3.5 w-3.5 shrink-0 ${reduzido ? '' : 'animate-spin'}`} style={{ color: 'var(--brand)' }} aria-hidden="true" />
                  : <span className="h-3.5 w-3.5 shrink-0 rounded-full border" style={{ borderColor: 'var(--hairline)' }} aria-hidden="true" />}
              <span className={atual ? 'font-bold' : ''}>{ROTULO[f]}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
