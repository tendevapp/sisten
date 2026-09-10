/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Camada de "aviso" das notificações — o que acontece ALÉM do número no sino.
 *
 * O sino sozinho não segura a atenção: a pessoa está preenchendo um formulário,
 * o Jefferson responde o chamado de cadastro, o badge vai de 2 para 3 e ninguém
 * vê. Aqui ficam os três reforços que fazem a movimentação chegar:
 *
 *  1. título da aba — `(3) SISTEN ...`, visível mesmo com o app em outra aba;
 *  2. notificação do sistema operacional — opcional, precisa de permissão;
 *  3. som curto — opcional, desligado por padrão (escritório aberto).
 *
 * O cartão flutuante dentro do app (o reforço principal) mora em
 * `components/notifications/AlertaNotificacoes.tsx`; este arquivo cuida do
 * estado que precisa sobreviver a recarregamento e das APIs do navegador.
 *
 * Tudo em `localStorage` e defensivo: preferência de aviso não é dado de
 * negócio, então não passa pelo Supabase nem pelo `localDb`.
 */

import type { Notification } from '../types';

const PREFS_PREFIX = 'sisten:avisos-prefs:';
const ALERTADAS_PREFIX = 'sisten:avisos-alertados:';
/** Guardamos poucos ids: só o suficiente para não realertar o que já apareceu. */
const ALERTADAS_LIMITE = 300;

export interface AvisoPrefs {
  /** Notificação do sistema operacional (fora da aba). */
  desktop: boolean;
  /** Bipe curto ao chegar aviso novo. */
  som: boolean;
}

const PREFS_PADRAO: AvisoPrefs = { desktop: false, som: false };

function ler<T>(chave: string, padrao: T): T {
  try {
    const raw = localStorage.getItem(chave);
    return raw ? (JSON.parse(raw) as T) : padrao;
  } catch {
    return padrao;
  }
}

function gravar(chave: string, valor: unknown): void {
  try {
    localStorage.setItem(chave, JSON.stringify(valor));
  } catch {
    /* storage indisponível (janela anônima, cota) — silencioso de propósito */
  }
}

/* Preferências ------------------------------------------------------------ */

export function lerPrefsAviso(userId: string): AvisoPrefs {
  return { ...PREFS_PADRAO, ...ler<Partial<AvisoPrefs>>(PREFS_PREFIX + userId, {}) };
}

export function gravarPrefsAviso(userId: string, prefs: AvisoPrefs): void {
  gravar(PREFS_PREFIX + userId, prefs);
}

/* Controle de "já avisei sobre isso" -------------------------------------- */

export function lerIdsAlertados(userId: string): Set<string> {
  return new Set(ler<string[]>(ALERTADAS_PREFIX + userId, []));
}

export function gravarIdsAlertados(userId: string, ids: Set<string>): void {
  // Mantém os últimos N: a lista cresceria para sempre e só os recentes importam.
  gravar(ALERTADAS_PREFIX + userId, [...ids].slice(-ALERTADAS_LIMITE));
}

/**
 * Separa o que é novidade de verdade do que já foi avisado.
 *
 * Só entra na lista o que ainda está **não lido**: notificação que a pessoa já
 * abriu em outro dispositivo não volta a piscar aqui.
 */
export function filtrarNovas(notificacoes: Notification[], jaAlertados: Set<string>): Notification[] {
  return notificacoes
    .filter(n => !n.is_read && !jaAlertados.has(n.id))
    .sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
}

/* Título da aba ----------------------------------------------------------- */

const TITULO_BASE = typeof document !== 'undefined' ? document.title : 'SISTEN';

/** `(3) SISTEN — ...` enquanto houver não lidas. Volta ao normal ao zerar. */
export function atualizarTituloAba(naoLidas: number): void {
  if (typeof document === 'undefined') return;
  const limpo = TITULO_BASE.replace(/^\(\d+\)\s*/, '');
  document.title = naoLidas > 0 ? `(${naoLidas}) ${limpo}` : limpo;
}

/* Notificação do sistema operacional -------------------------------------- */

export type PermissaoDesktop = 'indisponivel' | 'default' | 'granted' | 'denied';

export function permissaoDesktop(): PermissaoDesktop {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'indisponivel';
  return window.Notification.permission as PermissaoDesktop;
}

export async function pedirPermissaoDesktop(): Promise<PermissaoDesktop> {
  if (permissaoDesktop() === 'indisponivel') return 'indisponivel';
  try {
    return (await window.Notification.requestPermission()) as PermissaoDesktop;
  } catch {
    return permissaoDesktop();
  }
}

/**
 * Dispara o aviso do sistema. Só faz sentido com a aba escondida — dentro do
 * app o cartão flutuante já cumpre o papel e dois avisos ao mesmo tempo viram
 * ruído.
 */
export function avisarNoDesktop(notif: Notification, aoClicar: () => void): void {
  if (permissaoDesktop() !== 'granted') return;
  if (typeof document !== 'undefined' && document.visibilityState === 'visible') return;
  try {
    const n = new window.Notification(notif.title, {
      body: notif.description || '',
      // `tag` evita empilhar o mesmo aviso quando duas abas do app estão abertas.
      tag: `sisten-${notif.id}`,
      icon: '/wind-turbine.svg',
    });
    n.onclick = () => {
      window.focus();
      n.close();
      aoClicar();
    };
  } catch {
    /* alguns navegadores bloqueiam o construtor fora de service worker */
  }
}

/* Som --------------------------------------------------------------------- */

let contextoAudio: AudioContext | null = null;

/**
 * Bipe curto de duas notas, sintetizado — evita carregar um arquivo de áudio
 * só para isso. Falha em silêncio quando o navegador ainda não liberou áudio.
 */
export function tocarBipe(): void {
  try {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    contextoAudio = contextoAudio ?? new Ctor();
    const ctx = contextoAudio;
    if (ctx.state === 'suspended') void ctx.resume();

    const agora = ctx.currentTime;
    [880, 1174.7].forEach((hz, i) => {
      const osc = ctx.createOscillator();
      const ganho = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = hz;
      const inicio = agora + i * 0.13;
      ganho.gain.setValueAtTime(0.0001, inicio);
      ganho.gain.exponentialRampToValueAtTime(0.09, inicio + 0.02);
      ganho.gain.exponentialRampToValueAtTime(0.0001, inicio + 0.12);
      osc.connect(ganho).connect(ctx.destination);
      osc.start(inicio);
      osc.stop(inicio + 0.14);
    });
  } catch {
    /* áudio indisponível — o aviso visual continua de pé */
  }
}
