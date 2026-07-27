/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ClipboardCheck, CheckCircle } from 'lucide-react';
import { LacunaCadastro, formatBRL } from '../../lib/almoxarifado';
import { formatInt, formatPct } from '../../lib/format';
import ChartCard from '../charts/ChartCard';

interface QualidadeCadastroPanelProps {
  lacunas: LacunaCadastro[];
  totalItens: number;
  loading?: boolean;
}

export default function QualidadeCadastroPanel({ lacunas, totalItens, loading }: QualidadeCadastroPanelProps) {
  const semLacuna = lacunas.every(l => l.itens === 0);

  return (
    <ChartCard
      title="Qualidade de Cadastro"
      icon={ClipboardCheck}
      description="Campos que o item precisa ter preenchidos para entrar em qualquer política de classificação e reposição."
      height={180}
      loading={loading}
    >
      {semLacuna ? (
        <div
          className="flex items-center gap-3 p-4 rounded-lg text-sm font-semibold"
          style={{ background: 'var(--brand-wash)', color: 'var(--ink-primary)' }}
        >
          <CheckCircle className="h-5 w-5 shrink-0" style={{ color: 'var(--status-good)' }} />
          Todos os {formatInt(totalItens)} itens do filtro têm classe, grupo de mercadoria e preço médio preenchidos.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 stagger">
          {lacunas.map(l => {
            const pct = totalItens > 0 ? (l.itens / totalItens) * 100 : 0;
            const vazio = l.itens === 0;
            return (
              <div
                key={l.rotulo}
                className="rounded-lg border p-3"
                style={{
                  borderColor: vazio ? 'var(--hairline)' : 'var(--status-warning)',
                  background: vazio ? 'transparent' : 'color-mix(in srgb, var(--status-warning) 8%, transparent)',
                }}
              >
                <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--ink-muted)' }}>
                  {l.rotulo}
                </p>
                <p
                  className="text-2xl font-black mt-1 tabular"
                  style={{ color: vazio ? 'var(--ink-muted)' : 'var(--ink-primary)' }}
                >
                  {formatInt(l.itens)}
                </p>
                <p className="text-[11px] tabular" style={{ color: 'var(--ink-secondary)' }}>
                  {vazio ? 'nenhum item' : `${formatPct(pct)} dos itens · ${formatBRL(l.valor)}`}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </ChartCard>
  );
}
