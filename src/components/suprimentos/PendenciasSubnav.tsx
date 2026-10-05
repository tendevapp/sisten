/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Subpáginas de Pendências (Suprimentos). Cada uma tem rota e permissão
 * próprias — a notificação abre direto a certa —, e esta barra liga as duas.
 */

import React from 'react';
import { PackageX, ReceiptText } from 'lucide-react';
import type { Profile } from '../../types';
import { canAccessPage } from '../../lib/pages';

const SUBPAGINAS = [
  { id: 'sup_pendencias_processamento', rotulo: 'Processamento de NF', path: '/suprimentos/pendencias-processamento', icon: ReceiptText },
  { id: 'sup_pendencias_recebimento', rotulo: 'Recebimento', path: '/suprimentos/pendencias-recebimento', icon: PackageX },
] as const;

export default function PendenciasSubnav({
  user, atual, onNavigate, contagem,
}: {
  user: Profile;
  atual: (typeof SUBPAGINAS)[number]['id'];
  onNavigate: (path: string) => void;
  /** Badge por subpágina (ex.: pendências aguardando o usuário). */
  contagem?: Partial<Record<(typeof SUBPAGINAS)[number]['id'], number>>;
}) {
  const visiveis = SUBPAGINAS.filter((s) => s.id === atual || canAccessPage(user, s.id));
  if (visiveis.length < 2) return null;
  return (
    <nav aria-label="Pendências" className="flex w-fit flex-wrap items-center gap-1 rounded-xl border p-1" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)' }}>
      {visiveis.map((s) => {
        const ativo = s.id === atual;
        const Icon = s.icon;
        const n = contagem?.[s.id] ?? 0;
        return (
          <button
            key={s.id}
            type="button"
            aria-current={ativo ? 'page' : undefined}
            onClick={() => !ativo && onNavigate(s.path)}
            className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all"
            style={ativo
              ? { background: 'var(--surface-card)', color: 'var(--brand)', boxShadow: '0 1px 2px 0 rgb(0 0 0 / 0.06)' }
              : { color: 'var(--ink-muted)' }}
          >
            <Icon className="h-3.5 w-3.5" /> {s.rotulo}
            {n > 0 && (
              <span className="rounded-full px-1.5 text-[10px] font-extrabold text-white" style={{ background: 'var(--status-critical)' }}>{n}</span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
