/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Janela com o Gemba em 2D (planta baixa + prateleira de frente, X vermelho no
 * lugar) para uma ou mais posições de estoque. Usada no inventário cíclico para
 * achar o item sem sair da contagem. SVG puro: abre em qualquer celular.
 */

import React, { useMemo, useState } from 'react';
import { ExternalLink, MapPin } from 'lucide-react';
import Modal, { ModalHeader } from '../../ui/Modal';
import Gemba2D from './Gemba2D';
import { interpretarPosicao } from '../../../lib/gembaEndereco';
import { descreverPosicao, localizar, type Localizacao } from '../../../lib/gembaLayout';
import { useMovimentoReduzido } from '../../home/cenas/util';

interface Props {
  material: string;
  descricao: string;
  posicoes: string[];
  onClose: () => void;
  /** Abre a página do Gemba (só quando a pessoa tem acesso). */
  onAbrirGemba?: () => void;
  /** Acima de outro modal (ex.: o de contagem). */
  zIndexClassName?: string;
}

const nada = () => {};
const semRotulo = () => null;

export default function GembaLocalizacaoModal({ material, descricao, posicoes, onClose, onAbrirGemba, zIndexClassName }: Props) {
  const reduzido = useMovimentoReduzido();
  const [indice, setIndice] = useState(0);
  const lugares = useMemo(
    () => posicoes.map((p) => {
      const endereco = interpretarPosicao(p);
      return { posicao: p, loc: endereco ? localizar(endereco) : null, texto: descreverPosicao(p) };
    }),
    [posicoes],
  );
  const atual = lugares[indice] ?? null;
  const destaques: Localizacao[] = atual?.loc ? [atual.loc] : [];

  return (
    <Modal onClose={onClose} maxWidth="max-w-5xl" ariaLabel={`Localização de ${material} no Gemba`} zIndexClassName={zIndexClassName}>
      <ModalHeader onClose={onClose}>
        <p className="text-[11px] font-bold" style={{ color: 'var(--ink-muted)' }}>
          Onde está · <span className="font-mono">{material}</span>
        </p>
        <h2 className="text-sm font-extrabold leading-snug" style={{ color: 'var(--ink-primary)' }}>{descricao || '—'}</h2>
      </ModalHeader>

      <div className="flex min-h-0 flex-1 flex-col md:h-[72vh]">
        <div className="shrink-0 space-y-2 px-4 pt-3 sm:px-6">
          {lugares.length > 1 && (
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Posições do item">
              {lugares.map((l, i) => (
                <button
                  key={l.posicao}
                  type="button"
                  onClick={() => setIndice(i)}
                  aria-pressed={i === indice}
                  className="min-h-9 rounded-lg border px-3 font-mono text-xs font-bold"
                  style={i === indice
                    ? { borderColor: 'var(--brand)', background: 'color-mix(in srgb, var(--brand) 12%, transparent)', color: 'var(--brand)' }
                    : { borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}
                >
                  {l.posicao}
                </button>
              ))}
            </div>
          )}
          {atual && (
            <p className="flex items-start gap-1.5 text-xs" style={{ color: 'var(--ink-secondary)' }}>
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: 'var(--status-critical)' }} aria-hidden="true" />
              <span className="min-w-0">
                <span className="font-mono font-bold" style={{ color: 'var(--ink-primary)' }}>{atual.posicao}</span>
                {atual.texto && <span className="block font-semibold" style={{ color: 'var(--ink-primary)' }}>{atual.texto}</span>}
                {atual.loc?.aproximado && <span className="block">O mapa acha o bloco/área; o lugar exato fica a conferir no local.</span>}
              </span>
            </p>
          )}
        </div>

        {atual?.loc ? (
          <div className="flex min-h-[420px] flex-1 flex-col md:min-h-0">
            <Gemba2D destaques={destaques} principal={0} selecao={null} onClicarVao={nada} rotuloVao={semRotulo} reduzido={reduzido} />
          </div>
        ) : (
          <p className="m-4 rounded-xl border border-dashed p-6 text-center text-xs sm:mx-6" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-muted)' }}>
            {atual
              ? 'Esta posição não tem lugar no mapa do galpão (depósito externo, virtual ou fora do padrão 1DD.BBAAPP).'
              : 'O item não tem posição de estoque na ZL0024.'}
          </p>
        )}

        {onAbrirGemba && (
          <div className="flex shrink-0 justify-end border-t px-4 py-2.5 sm:px-6" style={{ borderColor: 'var(--hairline)' }}>
            <button
              type="button"
              onClick={onAbrirGemba}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-bold"
              style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /> Abrir no Gemba (3D)
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
