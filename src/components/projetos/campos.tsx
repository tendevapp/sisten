/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Campos de formulário do módulo Projetos.
 *
 * Os quatro formulários (recebimento, separação, entrega, sobressalente)
 * repetem o mesmo par rótulo + controle + mensagem de erro. Ficam aqui, e não
 * dentro de um dos painéis, para que importar um campo não arraste junto a
 * tela inteira de outro formulário.
 *
 * O repo não usa lib de validação (nada de zod/react-hook-form): o padrão é
 * `erros: Record<string, string>` + `validar()`, como em `SsmaRidForm`.
 */

import React from 'react';

/** Rótulo, controle e a mensagem de erro do campo — nessa ordem, sempre. */
export function Campo({
  rotulo,
  erro,
  children,
}: {
  rotulo: string;
  erro?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-[11px] font-bold mb-1" style={{ color: 'var(--ink-muted)' }}>
        {rotulo}
      </span>
      {children}
      {erro && <span className="block mt-1 text-[11px] text-rose-500">{erro}</span>}
    </label>
  );
}

/** Classe do controle. Com erro, ganha a borda rosa do padrão do app. */
export function inputCls(erro?: string) {
  return `w-full rounded-lg border py-2 px-3 text-xs font-medium focus:outline-2 focus:outline-offset-1 ${
    erro ? 'border-rose-400 bg-rose-50/20' : 'border-[var(--hairline)]'
  } bg-[var(--surface-raised)] text-[var(--ink-primary)] focus:outline-[var(--brand)]`;
}

/** `select` de filtro/cabeçalho, fora de formulário. */
export const SELECT_CLS =
  'rounded-lg border py-2 px-3 text-xs font-bold cursor-pointer transition-colors duration-150 ' +
  'focus:outline-2 focus:outline-offset-1 border-[var(--hairline)] bg-[var(--surface-raised)] ' +
  'text-[var(--ink-secondary)] focus:outline-[var(--brand)]';
