/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Linha "Inventário cíclico: Conferido há 12 dias — 19/10 15:02 por ANA
 * (INV-191026-01)". Usada no diálogo do QR da etiqueta e no detalhe do item
 * do Cadastro de Itens. Sem saldo: a contagem é cega.
 */

import { useEffect, useState } from 'react';
import { ClipboardList } from 'lucide-react';
import { formatDateTimeBR } from '../../lib/format';
import { hojeISO } from '../../lib/recebimentoAlmox';
import {
  resumoUltimaContagem, ultimaContagemDoMaterial, type UltimaContagem,
} from '../../lib/inventarioUltimaContagem';

const COR: Record<UltimaContagem['status'], string> = {
  conferido: 'var(--status-good)',
  divergente: 'var(--status-critical)',
  aguardando_decisao: 'var(--status-serious)',
  pendente: 'var(--ink-secondary)',
};

interface Props {
  material: string;
  /** Já carregada pela tela (mapa da lista); `undefined` = buscar aqui. */
  ultima?: UltimaContagem | null;
  /** Muda depois de uma contagem nova, para buscar de novo. */
  versao?: number;
}

export default function UltimaContagemInventario({ material, ultima, versao = 0 }: Props) {
  const [buscada, setBuscada] = useState<UltimaContagem | null | undefined>(undefined);
  const [falhou, setFalhou] = useState(false);

  useEffect(() => {
    if (ultima !== undefined && versao === 0) return;
    let ativo = true;
    setFalhou(false);
    ultimaContagemDoMaterial(material)
      .then((u) => { if (ativo) setBuscada(u); })
      .catch(() => { if (ativo) setFalhou(true); });
    return () => { ativo = false; };
  }, [material, ultima, versao]);

  const u = versao === 0 && ultima !== undefined ? ultima : buscada;

  return (
    <div className="flex items-start gap-2 text-xs" style={{ color: 'var(--ink-secondary)' }}>
      <ClipboardList className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'var(--ink-muted)' }} />
      <div className="min-w-0">
        <span className="font-semibold" style={{ color: 'var(--ink-muted)' }}>Inventário cíclico: </span>
        {falhou ? (
          <span>não foi possível consultar agora.</span>
        ) : u === undefined ? (
          <span>consultando…</span>
        ) : u === null ? (
          <span className="font-bold">nunca contado</span>
        ) : (
          <>
            <span className="font-bold" style={{ color: COR[u.status] }}>{resumoUltimaContagem(u, hojeISO())}</span>
            <span className="block text-[11px]" style={{ color: 'var(--ink-muted)' }}>
              {formatDateTimeBR(u.contadoEm)}{u.contadoPor ? ` por ${u.contadoPor}` : ''} · {u.inventario}
              {u.numero > 1 ? ` · ${u.numero}ª contagem` : ''}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
