/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Aviso de contexto exibido nas abas que dependem de idade ou de giro.
 *
 * Existe porque o número mais chamativo dessas abas — "sem consumo", "idade
 * anterior à reabertura" — só significa o que parece significar se o leitor
 * souber que a fábrica ficou parada de 2023 a 2026. Sem essa moldura, um
 * gestor lê "1.386 materiais sem consumo em 7 meses" e conclui compra errada;
 * com ela, lê "estoque que atravessou a parada e não foi tocado desde a
 * retomada", que é uma conclusão diferente e correta.
 */

import React from 'react';
import { Info } from 'lucide-react';

interface EstoqueLegadoBannerProps {
  janelaInicio?: string | null;
  janelaFim?: string | null;
}

function formatarData(iso?: string | null): string {
  if (!iso) return '—';
  const [a, m, d] = iso.split('-');
  return d && m && a ? `${d}/${m}/${a}` : iso;
}

export default function EstoqueLegadoBanner({ janelaInicio, janelaFim }: EstoqueLegadoBannerProps) {
  return (
    <div
      className="flex items-start gap-3 rounded-xl border p-4"
      style={{
        borderColor: 'var(--hairline)',
        background: 'var(--surface-raised)',
      }}
    >
      <Info className="h-4 w-4 mt-0.5 shrink-0" style={{ color: 'var(--ink-muted)' }} aria-hidden="true" />
      <div className="text-xs leading-relaxed" style={{ color: 'var(--ink-secondary)' }}>
        <p>
          <strong style={{ color: 'var(--ink-primary)' }}>A fábrica ficou parada de 2023 até a reabertura em 2026.</strong>{' '}
          As movimentações disponíveis cobrem apenas{' '}
          <strong className="tabular">{formatarData(janelaInicio)}</strong> a{' '}
          <strong className="tabular">{formatarData(janelaFim)}</strong>.
        </p>
        <p className="mt-1.5">
          O saldo sem entrada dentro dessa janela atravessou a parada: a idade exata dele não é
          conhecida, mas é de no mínimo ~3 anos. Ele aparece como{' '}
          <em>&ldquo;anterior à reabertura&rdquo;</em> em vez de entrar numa faixa de dias, e o item
          sem nenhum consumo desde a retomada é sinalizado como candidato a obsolescência — não
          apenas como item de baixo giro.
        </p>
      </div>
    </div>
  );
}
