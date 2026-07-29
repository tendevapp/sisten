/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
}

// Depois de um novo deploy, o chunk JS de uma tela lazy-loaded referenciado pela
// página já aberta no navegador deixa de existir no servidor (Vite gera nomes de
// arquivo com hash a cada build). O import() falha com uma dessas mensagens.
const CHUNK_LOAD_ERROR = /failed to fetch dynamically imported module|loading chunk|error loading dynamically imported module|importing a module script failed/i;

export const CHUNK_RELOAD_GUARD_KEY = 'sisten_chunk_reload_attempted';

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    // Um recarregamento busca o index.html atual, que aponta para os arquivos já
    // publicados, resolvendo o caso comum de chunk desatualizado. Guardado por
    // sessionStorage para não entrar em loop caso o erro seja outra coisa.
    if (CHUNK_LOAD_ERROR.test(error.message) && !sessionStorage.getItem(CHUNK_RELOAD_GUARD_KEY)) {
      sessionStorage.setItem(CHUNK_RELOAD_GUARD_KEY, '1');
      window.location.reload();
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-4 py-24 text-center">
          <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">
            Não foi possível carregar esta tela.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Recarregar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
