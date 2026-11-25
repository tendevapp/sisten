/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tag de dias desde o ultimo movimento de saida/consumo (MB51) para o
 * Cadastro de Itens: semaforo 30/90 dias (verde = alto giro, ambar = medio,
 * vermelho = baixo giro, neutro = sem saida registrada).
 */

import { Clock } from 'lucide-react';
import {
  classificarGiroMovimento,
  detalheUltimoMovimento,
  diasDesdeUltimoMovimento,
  textoTagUltimoMovimento,
  type FaixaGiroMovimento,
  type UltimoMovimentoMaterial,
} from '../../lib/ultimoMovimentoCatalogo';

const ESTILO_FAIXA: Record<FaixaGiroMovimento, string> = {
  alto: 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/70 dark:text-emerald-300 dark:border-emerald-800',
  medio: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/70 dark:text-amber-300 dark:border-amber-800',
  baixo: 'bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950/70 dark:text-rose-300 dark:border-rose-800',
  sem_movimento: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
};

interface Props {
  /** undefined = base de movimentos ainda nao carregada (nao exibe a tag). */
  movimento: UltimoMovimentoMaterial | null | undefined;
  hoje: string;
  className?: string;
}

export function UltimoMovimentoTag({ movimento, hoje, className = '' }: Props) {
  if (movimento === undefined) return null;

  const dias = diasDesdeUltimoMovimento(movimento, hoje);
  const faixa = classificarGiroMovimento(dias);
  const texto = textoTagUltimoMovimento(dias);
  const detalhe = detalheUltimoMovimento(movimento, hoje);

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-0.5 rounded-md border px-1.5 py-0.5 text-[10px] font-bold tabular-nums leading-none ${ESTILO_FAIXA[faixa]} ${className}`}
      title={detalhe}
      aria-label={detalhe}
    >
      <Clock className="h-2.5 w-2.5 shrink-0" aria-hidden />
      {texto}
    </span>
  );
}
