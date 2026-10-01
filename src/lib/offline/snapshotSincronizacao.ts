/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Contas puras da Central de Sincronização: o resumo (snapshot) que cada
 * aparelho manda ao servidor, e como a tela do admin o classifica. Nada daqui
 * toca IndexedDB ou rede — fica fora do reporter para ser testado em Node.
 *
 * Só contagens, rótulos e a mensagem do último erro saem do aparelho. O payload
 * das gravações (o que a pessoa preencheu) nunca é incluído.
 */

/** Uma operação ou pendência de qualquer das três filas, já reduzida ao que importa. */
export interface EntradaFila {
  estado: 'pendente' | 'enviando' | 'sincronizando' | 'erro';
  /** ISO. */
  criadoEm: string;
  erro?: string | null;
  /** Nome legível do formulário ou módulo ("Chegada de transportes"). */
  rotulo?: string | null;
}

export interface EntradasSnapshot {
  formularios: EntradaFila[];
  qualidade: EntradaFila[];
  producao: EntradaFila[];
}

export interface ContagemFila {
  pendentes: number;
  comErro: number;
}

export interface SnapshotFila extends ContagemFila {
  /** ISO da entrada mais antiga ainda não enviada; `null` com a fila vazia. */
  maisAntigoEm: string | null;
  ultimoErro: string | null;
  ultimoErroRotulo: string | null;
  detalhes: Record<keyof EntradasSnapshot, ContagemFila>;
}

/** Mensagem de erro maior que isto é cortada: serve para diagnosticar, não para arquivar. */
export const MAX_ERRO = 300;

const temErro = (e: EntradaFila) => e.estado === 'erro';

function contar(entradas: EntradaFila[]): ContagemFila {
  return { pendentes: entradas.length, comErro: entradas.filter(temErro).length };
}

export function construirSnapshot(entradas: EntradasSnapshot): SnapshotFila {
  const todas = [...entradas.formularios, ...entradas.qualidade, ...entradas.producao];

  const maisAntigo = todas.reduce<string | null>((menor, e) => (menor === null || e.criadoEm < menor ? e.criadoEm : menor), null);

  // O erro mais recente é o que o admin precisa ler: o antigo pode ter sido consequência dele.
  const comErro = todas.filter(e => temErro(e) && e.erro).sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
  const ultimo = comErro[0];

  const detalhes = {
    formularios: contar(entradas.formularios),
    qualidade: contar(entradas.qualidade),
    producao: contar(entradas.producao),
  };

  return {
    pendentes: todas.length,
    comErro: todas.filter(temErro).length,
    maisAntigoEm: maisAntigo,
    ultimoErro: ultimo?.erro ? ultimo.erro.slice(0, MAX_ERRO) : null,
    ultimoErroRotulo: ultimo?.rotulo ?? null,
    detalhes,
  };
}

/** Dois snapshots dizem a mesma coisa? (Evita reportar sem mudança.) */
export function snapshotsIguais(a: SnapshotFila | null, b: SnapshotFila | null): boolean {
  if (!a || !b) return a === b;
  return JSON.stringify(a) === JSON.stringify(b);
}

// ---------------------------------------------------------------------------
// Classificação (tela do admin)
// ---------------------------------------------------------------------------

export type EstadoAparelho = 'erro' | 'sumiu' | 'parado' | 'pendente' | 'ok';

/** Passado este tempo, fila antiga com o aparelho online é "parada", e aparelho calado é "sumido". */
export const LIMITE_MIN = 30;

export interface LinhaAparelho {
  pendentes: number;
  comErro: number;
  maisAntigoEm: string | null;
  online: boolean;
  /** ISO do último report recebido. */
  reportadoEm: string;
}

const MIN_MS = 60_000;

/**
 * Ordem de decisão:
 * 1. erro: o servidor recusou algo — é o mais acionável e nunca some sozinho;
 * 2. ok: nada na fila;
 * 3. sumiu: tem fila e ficou calado — um aparelho sem sinal não consegue
 *    reportar, então o que se sabe é o último estado, não o atual;
 * 4. parado: reportando e online, mas a fila não anda há muito tempo;
 * 5. pendente: fila recente (ou sem rede, esperando voltar).
 */
export function classificarAparelho(linha: LinhaAparelho, agora: number = Date.now()): EstadoAparelho {
  if (linha.comErro > 0) return 'erro';
  if (linha.pendentes === 0) return 'ok';

  const semReportar = agora - new Date(linha.reportadoEm).getTime();
  if (semReportar > LIMITE_MIN * MIN_MS) return 'sumiu';

  const filaParadaHa = linha.maisAntigoEm ? agora - new Date(linha.maisAntigoEm).getTime() : 0;
  if (linha.online && filaParadaHa > LIMITE_MIN * MIN_MS) return 'parado';

  return 'pendente';
}

/** Quanto pior, mais para cima na lista. */
export const PRIORIDADE_ESTADO: Record<EstadoAparelho, number> = { erro: 0, parado: 1, sumiu: 2, pendente: 3, ok: 4 };

export const ROTULO_ESTADO: Record<EstadoAparelho, string> = {
  erro: 'Com erro',
  parado: 'Parado',
  sumiu: 'Sem reportar',
  pendente: 'Pendente',
  ok: 'Em dia',
};

/** "agora", "há 5 min", "há 3 h", "há 2 d". */
export function formatarIdade(desdeIso: string | null, agora: number = Date.now()): string {
  if (!desdeIso) return '—';
  const ms = agora - new Date(desdeIso).getTime();
  if (!Number.isFinite(ms)) return '—';
  const min = Math.floor(ms / MIN_MS);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  return `há ${Math.floor(h / 24)} d`;
}

/** Resume o user-agent em algo legível para o admin: "Android · Chrome". */
export function resumirPlataforma(userAgent: string): string {
  const ua = userAgent || '';
  const sistema = /iPhone|iPad|iPod/i.test(ua)
    ? 'iPhone/iPad'
    : /Android/i.test(ua)
      ? 'Android'
      : /Windows/i.test(ua)
        ? 'Windows'
        : /Mac OS X|Macintosh/i.test(ua)
          ? 'Mac'
          : /Linux|CrOS/i.test(ua)
            ? 'Linux'
            : 'Dispositivo';
  const navegador = /Edg\//i.test(ua)
    ? 'Edge'
    : /OPR\/|Opera/i.test(ua)
      ? 'Opera'
      : /SamsungBrowser/i.test(ua)
        ? 'Samsung'
        : /Firefox|FxiOS/i.test(ua)
          ? 'Firefox'
          : /Chrome|CriOS/i.test(ua)
            ? 'Chrome'
            : /Safari/i.test(ua)
              ? 'Safari'
              : '';
  return navegador ? `${sistema} · ${navegador}` : sistema;
}
