/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Explicação do método de estoque mínimo, exibida acima da tabela.
 *
 * Não é decoração: um número de reposição sem a conta à vista é ordem para
 * obedecer; com a conta à vista é argumento que o comprador pode conferir e
 * contestar. Como o método aqui foge do livro-texto de propósito (demanda
 * intermitente invalida a fórmula clássica), a justificativa precisa estar na
 * tela — senão alguém "corrige" para a fórmula errada.
 */

import React, { useState } from 'react';
import { Calculator, ChevronDown, ChevronRight } from 'lucide-react';

interface MetodoMinimoPanelProps {
  janelaInicio?: string | null;
  janelaFim?: string | null;
  janelaDias?: number | null;
  leadMediano?: number | null;
}

function dataBR(iso?: string | null): string {
  if (!iso) return '—';
  const [a, m, d] = iso.split('-');
  return d && m && a ? `${d}/${m}/${a}` : iso;
}

export default function MetodoMinimoPanel({
  janelaInicio, janelaFim, janelaDias, leadMediano,
}: MetodoMinimoPanelProps) {
  const [aberto, setAberto] = useState(false);

  return (
    <section
      className="rounded-xl border"
      style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}
    >
      <button
        onClick={() => setAberto(a => !a)}
        aria-expanded={aberto}
        className="w-full flex items-start gap-3 p-4 text-left cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 rounded-xl"
        style={{ outlineColor: 'var(--brand)' }}
      >
        <Calculator className="h-4 w-4 mt-0.5 shrink-0" style={{ color: 'var(--brand)' }} aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold" style={{ color: 'var(--ink-primary)' }}>
            Como o mínimo é calculado
          </h3>
          <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--ink-secondary)' }}>
            <strong>mínimo = consumo diário × lead time + p90 das saídas</strong>, medido sobre a
            produção ({dataBR(janelaInicio)} a {dataBR(janelaFim)}, {janelaDias ?? '—'} dias).
            {' '}Material com menos de 4 saídas, ou puxado por evento de projeto, não recebe mínimo.
          </p>
        </div>
        {aberto
          ? <ChevronDown className="h-4 w-4 shrink-0 mt-0.5" style={{ color: 'var(--ink-muted)' }} />
          : <ChevronRight className="h-4 w-4 shrink-0 mt-0.5" style={{ color: 'var(--ink-muted)' }} />}
      </button>

      {aberto && (
        <div
          className="px-4 pb-4 pt-1 space-y-3 text-xs leading-relaxed border-t"
          style={{ color: 'var(--ink-secondary)', borderColor: 'var(--hairline)' }}
        >
          <div>
            <p className="font-bold mb-1" style={{ color: 'var(--ink-primary)' }}>
              Por que a partir de maio, e não da reabertura
            </p>
            <p>
              A fábrica reabriu em janeiro, mas só passou a produzir em maio — o valor consumido
              triplica de abril (R$ 317 mil) para maio (R$ 998 mil), com janeiro e fevereiro
              praticamente parados. Calcular o consumo diário sobre a janela inteira diluiria a
              demanda de produção em 116 dias de comissionamento e devolveria uma taxa{' '}
              <strong>1,86× menor</strong> que a real. Num estoque mínimo, esse erro vira ruptura.
            </p>
          </div>

          <div>
            <p className="font-bold mb-1" style={{ color: 'var(--ink-primary)' }}>
              Por que não é a fórmula clássica de estoque de segurança
            </p>
            <p>
              A fórmula usual (<em>média + Z × desvio-padrão</em>) pressupõe demanda com
              distribuição aproximadamente normal. Classificando a carteira pelo intervalo entre
              demandas e pela variação do tamanho do lote, <strong>nenhum material</strong> tem
              demanda suave ou errática: a carteira é inteiramente intermitente ou irregular, com
              intervalo médio de cerca de 6,6 meses entre saídas. Um desvio-padrão calculado sobre
              2 ou 3 observações esparsas não descreve distribuição nenhuma — produziria um número
              com aparência estatística e sem lastro.
            </p>
          </div>

          <div>
            <p className="font-bold mb-1" style={{ color: 'var(--ink-primary)' }}>
              De onde vem cada parcela
            </p>
            <ul className="space-y-1 list-disc pl-4">
              <li>
                <strong>Consumo durante a reposição</strong> — consumo diário medido na produção,
                multiplicado pelo lead time.
              </li>
              <li>
                <strong>Proteção</strong> — o percentil 90 das saídas observadas, que cobre 9 de
                cada 10 retiradas. É empírica de propósito: com demanda irregular o risco concreto é
                um saque grande de uma vez, não uma variação suave em torno da média.{' '}
                <em>Não</em> usa a maior saída já vista — isso perseguiria o evento isolado e
                inflaria o estoque de item caro. Num componente de torre a R$ 9,4 mil a unidade,
                proteger pelo máximo pedia R$ 741 mil de compra para bufferizar uma retirada que
                aconteceu uma vez. A maior saída aparece na explicação de cada linha, para o
                comprador julgar o risco que fica descoberto.
              </li>
              <li>
                <strong>Lead time</strong> — medido da data do pedido até a entrada no estoque
                (mediana da fábrica: {leadMediano ? `${Math.round(leadMediano)} dias` : '—'}). Não é o
                prazo prometido pelo fornecedor: o que evita ruptura é quanto a reposição demora de
                fato. Quando o material não tem compra rastreável, usa-se a mediana da fábrica, e a
                linha indica isso.
              </li>
            </ul>
          </div>

          <div>
            <p className="font-bold mb-1" style={{ color: 'var(--ink-primary)' }}>
              Onde o método se recusa a responder
            </p>
            <p>
              Material com 1 a 3 saídas em toda a janela de produção não tem padrão a estimar, e
              recebe <em>&ldquo;comprar sob demanda&rdquo;</em> em vez de um número. Material cuja
              maior retirada isolada responde por 40% ou mais de todo o consumo é puxado por evento
              de projeto, não por um ritmo, e recebe <em>&ldquo;planejar por projeto&rdquo;</em> —
              ponto de reposição pressupõe demanda que flui, e ali ela acontece em blocos ditados
              pelo cronograma. Material sem nenhuma saída recebe <em>&ldquo;revisar obsoleto&rdquo;</em>:
              o caso é inventário físico, não reposição. Fabricar mínimo para item sem demanda
              recorrente é exatamente como se acumula estoque parado, que nesta base já soma
              R$ 9,0 milhões.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
