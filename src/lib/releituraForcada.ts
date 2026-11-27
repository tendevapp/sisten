/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * "Forçar" a releitura de uma base importada do SAP (ZL0024) sem rebaixá-la
 * inteira toda vez.
 *
 * Monitor de Desempenho, 27/11/2026: o formulário do Balcão, a Retirada sem
 * Saldo e a Regularização forçavam a ZL0024 (~8 MB) a cada abertura — 375
 * leituras num dia de um só aparelho. A base só muda por importação, que sobe
 * o carimbo (`ops_dataset_versoes`). Forçar agora confere o carimbo no
 * servidor; com a mesma versão, só rebaixa se a cópia passou de 30 min
 * (margem caso uma importação não tenha subido o carimbo).
 */

export const RELEITURA_FORCADA_MINIMO_MS = 30 * 60_000;

export function precisaBaixar(p: { versaoMudou: boolean; forcar: boolean; baixadoEm: string | null; agora: number }): boolean {
  if (p.versaoMudou) return true;
  if (!p.forcar) return false;
  const em = p.baixadoEm ? Date.parse(p.baixadoEm) : NaN;
  return !Number.isFinite(em) || p.agora - em >= RELEITURA_FORCADA_MINIMO_MS;
}
