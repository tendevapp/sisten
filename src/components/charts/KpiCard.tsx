/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Cartão de indicador.
 *
 * O elemento de assinatura é o trilho medidor à esquerda: a régua colorida que
 * já existia era só decoração de cor fixa. Aqui ela é um instrumento — a parte
 * preenchida representa a participação do indicador no total, e o restante fica
 * como trilho vago. Quando não existe participação a informar (uma data, uma
 * contagem sem denominador), o trilho fica cheio e volta a ser só identidade,
 * em vez de mentir uma proporção.
 */

import React from 'react';
import { LucideIcon } from 'lucide-react';
import { useCountUp } from '../../lib/useCountUp';

export interface KpiCardProps {
  label: string;
  /** Número puro para animar. Omita em valores não numéricos (datas, texto). */
  value?: number;
  /** Formatador aplicado ao número animado. */
  format?: (v: number) => string;
  /** Valor já pronto, quando não há número para animar. */
  display?: string;
  detail?: string;
  icon?: LucideIcon;
  /** Cor do trilho — token de série ou de status. Padrão: a cor de marca. */
  accent?: string;
  /** 0..1 — participação no total. Sem ela o trilho fica cheio. */
  share?: number;
  /** Torna o cartão clicável (drill-down). */
  onClick?: () => void;
  /** Destaca o valor na cor do acento. Reserve para o indicador principal. */
  emphasize?: boolean;
}

export default function KpiCard({
  label,
  value,
  format,
  display,
  detail,
  icon: Icon,
  accent = 'var(--brand)',
  share,
  onClick,
  emphasize = false,
}: KpiCardProps) {
  const animated = useCountUp(value ?? 0);
  const texto = display ?? (format ? format(animated) : String(Math.round(animated)));

  // `share` fora de 0..1 viraria um trilho estourado ou negativo.
  const preenchimento = share === undefined ? 1 : Math.max(0, Math.min(1, share));

  const Element = onClick ? 'button' : 'div';

  return (
    <Element
      onClick={onClick}
      type={onClick ? 'button' : undefined}
      className={`relative overflow-hidden rounded-xl border p-4 text-left w-full transition-[box-shadow,transform] duration-200
        ${onClick ? 'cursor-pointer hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2' : ''}`}
      style={{
        background: 'var(--surface-card)',
        borderColor: 'var(--hairline)',
        boxShadow: '0 1px 2px 0 rgb(0 0 0 / 0.04)',
        outlineColor: accent,
      }}
    >
      {/* Trilho medidor. O trecho vago fica sempre visível, senão não há como
          ler que a parte cheia é uma fração de alguma coisa. */}
      <div
        className="absolute top-0 left-0 h-full w-[3px]"
        style={{ background: 'var(--surface-sunken)' }}
        aria-hidden="true"
      >
        <div
          className="absolute bottom-0 left-0 w-full transition-[height] duration-500 ease-out"
          style={{ height: `${preenchimento * 100}%`, background: accent }}
        />
      </div>

      <span
        className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5"
        style={{ color: 'var(--ink-muted)' }}
      >
        {Icon && <Icon className="h-3 w-3" aria-hidden="true" />}
        {label}
      </span>

      <p
        className="text-xl font-black mt-2 leading-tight tabular"
        style={{ color: emphasize ? accent : 'var(--ink-primary)' }}
      >
        {texto}
      </p>

      {detail && (
        <p className="text-[10px] mt-1 leading-snug" style={{ color: 'var(--ink-muted)' }}>
          {detail}
        </p>
      )}
    </Element>
  );
}
