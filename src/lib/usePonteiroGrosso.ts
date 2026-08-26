/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useSyncExternalStore } from 'react';

const QUERY = '(pointer: coarse)';

function subscribe(listener: () => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mql = window.matchMedia(QUERY);
  mql.addEventListener('change', listener);
  return () => mql.removeEventListener('change', listener);
}

const getSnapshot = () =>
  typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(QUERY).matches;

const getServerSnapshot = () => false;

/**
 * `true` em aparelho tocado com o dedo — celular e tablet.
 *
 * Serve para decidir se vale oferecer "tirar foto agora": o atributo `capture`
 * de um `<input type=file>` só abre a câmera nesses aparelhos; no desktop ele é
 * ignorado e o botão abriria o mesmo seletor de arquivos do botão ao lado, o
 * que só confundiria. Largura de tela não responderia isso — uma janela
 * estreita no notebook não ganha câmera traseira, e um tablet em paisagem é
 * largo e tem.
 */
export function usePonteiroGrosso(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
