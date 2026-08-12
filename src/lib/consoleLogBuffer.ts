/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Buffer em memória com as últimas entradas de console.error/warn e erros
 * globais da sessão. Anexado a todo reporte enviado pelo botão "Reportar"
 * (bug ou sugestão), mesmo quando não veio de um crash — dá contexto de
 * problemas silenciosos que antecederam o reporte.
 */
import { FeedbackLogEntry } from '../types';

const MAX_ENTRIES = 50;
const MAX_MESSAGE_LENGTH = 500;

let buffer: FeedbackLogEntry[] = [];
let installed = false;

function truncate(value: string): string {
  return value.length > MAX_MESSAGE_LENGTH ? value.slice(0, MAX_MESSAGE_LENGTH) + '…' : value;
}

function stringifyArg(arg: unknown): string {
  if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
  if (typeof arg === 'string') return arg;
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

/** Lógica pura de registro — separada de `installConsoleLogBuffer` para poder ser testada sem DOM. */
export function recordLogEntry(level: 'error' | 'warn', args: unknown[]): void {
  const message = truncate(args.map(stringifyArg).join(' '));
  buffer.push({ level, message, timestamp: new Date().toISOString() });
  if (buffer.length > MAX_ENTRIES) buffer.shift();
}

export function getRecentLogs(): FeedbackLogEntry[] {
  return [...buffer];
}

export function resetLogBufferForTests(): void {
  buffer = [];
}

/**
 * Faz o monkey-patch de console.error/warn e escuta erros globais. Chamado
 * uma única vez, no bootstrap (main.tsx) — antes disso o buffer fica vazio.
 */
export function installConsoleLogBuffer(): void {
  if (installed) return;
  installed = true;

  const originalError = console.error.bind(console);
  const originalWarn = console.warn.bind(console);

  console.error = (...args: unknown[]) => {
    recordLogEntry('error', args);
    originalError(...args);
  };
  console.warn = (...args: unknown[]) => {
    recordLogEntry('warn', args);
    originalWarn(...args);
  };

  window.addEventListener('error', (event) => {
    recordLogEntry('error', [event.message]);
  });
  window.addEventListener('unhandledrejection', (event) => {
    recordLogEntry('error', ['Promise rejeitada sem tratamento:', event.reason]);
  });
}
