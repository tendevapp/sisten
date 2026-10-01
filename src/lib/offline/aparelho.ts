/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Identificador do aparelho, para a Central de Sincronização saber de qual
 * aparelho vem cada resumo de fila. Fica em `localStorage` (não em
 * `sessionStorage`): precisa sobreviver a fechar a aba e a logout/login, senão
 * o mesmo celular apareceria como vários.
 */

import { gerarUUID } from '../ids';

const CHAVE = 'sisten_id_aparelho';

let emMemoria: string | null = null;

export function obterIdAparelho(): string {
  if (emMemoria) return emMemoria;
  try {
    const salvo = localStorage.getItem(CHAVE);
    if (salvo && salvo.length >= 8) {
      emMemoria = salvo;
      return salvo;
    }
  } catch {
    /* storage bloqueado: segue com um id só desta carga da página */
  }
  const novo = gerarUUID();
  emMemoria = novo;
  try {
    localStorage.setItem(CHAVE, novo);
  } catch {
    /* sem persistência: o aparelho aparece com outro id na próxima carga */
  }
  return novo;
}
