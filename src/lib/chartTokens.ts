/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Ponte entre os tokens CSS (styles/tokens.css) e o Recharts.
 *
 * Por que existe: o Recharts escreve cor em *atributo de apresentação* SVG
 * (`fill="…"`, `stroke="…"`), e navegador nenhum resolve `var(--x)` dentro de
 * atributo — só dentro de declaração CSS. Então os gráficos precisam do valor
 * já resolvido, em JS. Este módulo lê os tokens do documento e reemite quando
 * o tema muda.
 *
 * Em CSS puro (className, style inline) use `var(--token)` direto; não passe
 * por aqui.
 */

import { useSyncExternalStore, useMemo } from 'react';

export interface ChartTokens {
  /* Cromo */
  grid: string;
  axis: string;
  label: string;
  labelStrong: string;
  value: string;
  valueOnMark: string;
  cursor: string;
  tooltipBg: string;
  tooltipBorder: string;
  /* Superfície e tinta */
  surface: string;
  hairline: string;
  inkPrimary: string;
  inkSecondary: string;
  inkMuted: string;
  brand: string;
  /* Escalas */
  series: string[];
  abc: Record<'A' | 'B' | 'C', string>;
  atraso: string[];
  status: Record<'good' | 'warning' | 'serious' | 'critical', string>;
}

/* --------------------------------------------------------------------- */
/* Store: um observador de tema para o app inteiro                        */
/* --------------------------------------------------------------------- */

// O tema alterna pela classe `.dark` em <html> (ver App.tsx). Um MutationObserver
// só, no módulo, avisa todos os gráficos montados — em vez de um observer por
// componente.
let version = 0;
const listeners = new Set<() => void>();

function notify() {
  version += 1;
  listeners.forEach(l => l());
}

let observer: MutationObserver | null = null;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!observer && typeof MutationObserver !== 'undefined') {
    observer = new MutationObserver(notify);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && observer) {
      observer.disconnect();
      observer = null;
    }
  };
}

const getSnapshot = () => version;
// No SSR/primeiro paint não há documento para medir; o valor é estável.
const getServerSnapshot = () => 0;

/* --------------------------------------------------------------------- */
/* Leitura                                                                */
/* --------------------------------------------------------------------- */

// Fallbacks do tema claro, usados enquanto o CSS não carregou. Sem eles um
// gráfico montado cedo demais receberia string vazia e sumiria.
const FALLBACK: Record<string, string> = {
  '--chart-grid': '#e2e8f0',
  '--chart-axis': '#cbd5e1',
  '--chart-label': '#64748b',
  '--chart-label-strong': '#334155',
  '--chart-value': '#0f172a',
  '--chart-value-on-mark': '#ffffff',
  '--chart-cursor': 'rgba(15, 23, 42, 0.05)',
  '--chart-tooltip-bg': '#ffffff',
  '--chart-tooltip-border': '#e2e8f0',
  '--surface-card': '#ffffff',
  '--hairline': '#e2e8f0',
  '--ink-primary': '#0f172a',
  '--ink-secondary': '#475569',
  '--ink-muted': '#64748b',
  '--brand': '#059669',
};

function readToken(styles: CSSStyleDeclaration, name: string): string {
  const v = styles.getPropertyValue(name).trim();
  return v || FALLBACK[name] || '#94a3b8';
}

function readTokens(): ChartTokens {
  const styles = typeof window !== 'undefined'
    ? getComputedStyle(document.documentElement)
    : ({ getPropertyValue: () => '' } as unknown as CSSStyleDeclaration);
  const t = (name: string) => readToken(styles, name);

  return {
    grid: t('--chart-grid'),
    axis: t('--chart-axis'),
    label: t('--chart-label'),
    labelStrong: t('--chart-label-strong'),
    value: t('--chart-value'),
    valueOnMark: t('--chart-value-on-mark'),
    cursor: t('--chart-cursor'),
    tooltipBg: t('--chart-tooltip-bg'),
    tooltipBorder: t('--chart-tooltip-border'),
    surface: t('--surface-card'),
    hairline: t('--hairline'),
    inkPrimary: t('--ink-primary'),
    inkSecondary: t('--ink-secondary'),
    inkMuted: t('--ink-muted'),
    brand: t('--brand'),
    series: [
      t('--series-1'), t('--series-2'), t('--series-3'), t('--series-4'),
      t('--series-5'), t('--series-6'), t('--series-7'), t('--series-8'),
    ],
    abc: { A: t('--abc-a'), B: t('--abc-b'), C: t('--abc-c') },
    atraso: [t('--atraso-1'), t('--atraso-2'), t('--atraso-3'), t('--atraso-4'), t('--atraso-5')],
    status: {
      good: t('--status-good'),
      warning: t('--status-warning'),
      serious: t('--status-serious'),
      critical: t('--status-critical'),
    },
  };
}

/**
 * Tokens de gráfico resolvidos para o tema vigente. Reavalia quando a classe
 * de tema muda em <html>.
 */
export function useChartTokens(): ChartTokens {
  const v = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return useMemo(() => readTokens(), [v]);
}

/**
 * Cor categórica pelo índice do slot. A ordem é fixa e nunca é ciclada: da
 * nona série em diante a resposta é agrupar em "Outros" ou facetar, não gerar
 * um tom novo. Índices fora da faixa caem no cinza neutro, que é visivelmente
 * "sem identidade" — o sintoma aparece na tela em vez de passar batido.
 */
export function seriesColor(tokens: ChartTokens, index: number): string {
  return tokens.series[index] ?? tokens.inkMuted;
}
