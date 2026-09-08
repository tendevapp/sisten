/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Peças compartilhadas do módulo Demandas: acesso ao catálogo de usuários,
 * avatares e classes de formulário reaproveitadas pelos modais.
 */

import { useMemo } from 'react';
import { localDb } from '../../db/localDb';
import type { Profile } from '../../types';

export const inputClass =
  'w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[var(--brand)] transition-all';
export const labelClass = 'text-sm font-semibold text-slate-700 dark:text-slate-300';

/** Paleta de cores das colunas (buckets). `null` = coluna neutra. */
export const PALETA_COLUNA: { hex: string | null; nome: string }[] = [
  { hex: null, nome: 'Neutra' },
  { hex: '#f43f5e', nome: 'Vermelho' },
  { hex: '#f59e0b', nome: 'Âmbar' },
  { hex: '#10b981', nome: 'Verde' },
  { hex: '#0ea5e9', nome: 'Azul' },
  { hex: '#8b5cf6', nome: 'Roxo' },
  { hex: '#64748b', nome: 'Cinza' },
];

/** Fileira de bolinhas de cor para escolher a cor de uma coluna. */
export function SeletorCorColuna({
  valor, onChange,
}: { valor: string | null | undefined; onChange: (hex: string | null) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {PALETA_COLUNA.map(c => {
        const ativo = (valor ?? null) === c.hex;
        return (
          <button
            key={c.nome}
            type="button"
            onClick={() => onChange(c.hex)}
            title={c.nome}
            aria-label={c.nome}
            className={`h-5 w-5 rounded-full border transition-transform ${ativo ? 'scale-110 ring-2 ring-offset-1 ring-[var(--ink-primary)]' : ''}`}
            style={{
              background: c.hex ?? 'var(--surface-sunken)',
              borderColor: c.hex ?? 'var(--hairline)',
            }}
          >
            {!c.hex && <span className="block h-full w-full rounded-full" style={{ boxShadow: 'inset 0 0 0 1px var(--hairline)' }} />}
          </button>
        );
      })}
    </div>
  );
}

/** Usuários ativos, ordenados por nome, mais o índice id→perfil. */
export function useUsuarios(): { lista: Profile[]; porId: Map<string, Profile> } {
  return useMemo(() => {
    const lista = localDb.getProfiles()
      .filter(p => p.status === 'ativo')
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    return { lista, porId: new Map(localDb.getProfiles().map(p => [p.id, p])) };
  }, []);
}

export function nomeUsuario(porId: Map<string, Profile>, id: string): string {
  return porId.get(id)?.name || 'Usuário';
}

/** Iniciais para o avatar (mesma regra do Header: 1ª letra do nome). */
function inicial(nome: string): string {
  return (nome.trim()[0] || '?').toUpperCase();
}

const CORES_AVATAR = [
  '#0ea5e9', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#ef4444', '#6366f1', '#14b8a6',
];

function corDoNome(nome: string): string {
  let soma = 0;
  for (let i = 0; i < nome.length; i++) soma = (soma + nome.charCodeAt(i)) % CORES_AVATAR.length;
  return CORES_AVATAR[soma];
}

export function Avatar({ nome, size = 24, title }: { nome: string; size?: number; title?: string }) {
  return (
    <span
      title={title ?? nome}
      className="inline-flex items-center justify-center rounded-full font-bold text-white shrink-0 ring-2 ring-white dark:ring-slate-900"
      style={{ width: size, height: size, fontSize: size * 0.42, background: corDoNome(nome) }}
    >
      {inicial(nome)}
    </span>
  );
}

/** Pilha de avatares dos responsáveis, com "+N" quando estoura o limite. */
export function AvatarStack({
  ids, porId, size = 24, max = 4,
}: { ids: string[]; porId: Map<string, Profile>; size?: number; max?: number }) {
  if (!ids.length) return null;
  const mostrar = ids.slice(0, max);
  const resto = ids.length - mostrar.length;
  return (
    <span className="inline-flex items-center" style={{ paddingLeft: 4 }}>
      {mostrar.map((id, i) => (
        <span key={id} style={{ marginLeft: i === 0 ? -4 : -8 }}>
          <Avatar nome={nomeUsuario(porId, id)} size={size} />
        </span>
      ))}
      {resto > 0 && (
        <span
          className="inline-flex items-center justify-center rounded-full font-bold shrink-0 ring-2 ring-white dark:ring-slate-900"
          style={{
            width: size, height: size, fontSize: size * 0.4, marginLeft: -8,
            background: 'var(--surface-sunken)', color: 'var(--ink-secondary)',
          }}
        >
          +{resto}
        </span>
      )}
    </span>
  );
}
