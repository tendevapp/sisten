/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Subpáginas de Pendências (Suprimentos). Cada uma tem rota e permissão
 * próprias — a notificação abre direto a certa —, e esta barra liga as três.
 *
 * Cada aba mostra, em balão vermelho, quantos itens esperam o comprador; a
 * barra busca a própria contagem, então o balão aparece em qualquer subpágina.
 */

import React, { useEffect, useState } from 'react';
import { PackageX, ReceiptText, ShieldAlert } from 'lucide-react';
import type { Profile } from '../../types';
import { canAccessPage } from '../../lib/pages';
import { contarRncEmAberto } from '../../lib/pendenciasRecebimento';
import { contarMinhasAguardando, listarPendenciasRnc } from '../../lib/pendenciasRecebimentoApi';
import { contarNotasAguardando } from '../../lib/supPendenciasApi';

const SUBPAGINAS = [
  { id: 'sup_pendencias_processamento', rotulo: 'Processamento de NF', path: '/suprimentos/pendencias-processamento', icon: ReceiptText },
  { id: 'sup_pendencias_recebimento', rotulo: 'Recebimento', path: '/suprimentos/pendencias-recebimento', icon: PackageX },
  { id: 'sup_pendencias_recebimento_rnc', rotulo: 'RNC', path: '/suprimentos/pendencias-recebimento-rnc', icon: ShieldAlert },
] as const;

type SubId = (typeof SUBPAGINAS)[number]['id'];

/** Itens esperando o comprador, por subpágina. Falha de rede deixa o balão em branco, nunca derruba a tela. */
function useContagens(user: Profile, ids: SubId[], versao: unknown): Partial<Record<SubId, number>> {
  const [contagem, setContagem] = useState<Partial<Record<SubId, number>>>({});
  const chave = ids.join('|');

  useEffect(() => {
    let vivo = true;
    const buscar = () => {
      const busca: Record<SubId, () => Promise<number>> = {
        sup_pendencias_processamento: () => contarNotasAguardando(),
        sup_pendencias_recebimento: () => contarMinhasAguardando(user.id),
        sup_pendencias_recebimento_rnc: async () => contarRncEmAberto(await listarPendenciasRnc(), user.id),
      };
      ids.forEach((id) => {
        busca[id]().then((n) => { if (vivo) setContagem((c) => ({ ...c, [id]: n })); }).catch(() => undefined);
      });
    };
    buscar();
    window.addEventListener('focus', buscar);
    return () => { vivo = false; window.removeEventListener('focus', buscar); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id, chave, versao]);

  return contagem;
}

export default function PendenciasSubnav({
  user, atual, onNavigate, versao,
}: {
  user: Profile;
  atual: SubId;
  onNavigate: (path: string) => void;
  /** Muda quando a página recarrega os dados — refaz a contagem dos balões. */
  versao?: unknown;
}) {
  const visiveis = SUBPAGINAS.filter((s) => s.id === atual || canAccessPage(user, s.id));
  const contagem = useContagens(user, visiveis.map((s) => s.id), versao);
  if (visiveis.length < 2) return null;
  return (
    <nav aria-label="Pendências" className="flex w-fit max-w-full flex-wrap items-center gap-1 rounded-xl border p-1" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)' }}>
      {visiveis.map((s) => {
        const ativo = s.id === atual;
        const Icon = s.icon;
        const n = contagem[s.id] ?? 0;
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
              <span
                className="inline-flex min-w-[18px] items-center justify-center rounded-full px-1.5 text-[10px] font-extrabold leading-[18px] text-white"
                style={{ background: 'var(--status-critical)' }}
                title={`${n} aguardando`}
                aria-label={`${n} aguardando`}
              >
                {n > 99 ? '99+' : n}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
