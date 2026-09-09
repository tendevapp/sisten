/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Projetos > Estrutura (BOM) — visualização em mapa mental.
 *
 * A árvore de texto (nível 1-6, com indentação) é fiel mas cansa de ler numa
 * BOM de 1.257 linhas — a composição de um conjunto grande fica espalhada
 * por várias telas de rolagem. O mapa mental mostra a mesma hierarquia
 * radialmente: o conjunto no centro, os subconjuntos ao redor, e cada nível
 * mais fundo puxando para fora — a forma de "quantas peças tem esse
 * conjunto" e "que subconjuntos ele tem" fica visível de relance.
 *
 * markmap-view espera um `IPureNode` (`content` em HTML + `children`) — a
 * árvore da BOM (`NoBom`/`ArvoreBom`) já tem exatamente esse formato
 * (parentId + filhos), então montamos direto dela, sem passar por markdown
 * (que exigiria escapar `.`/`*`/`-` de part number, e complicaria à toa).
 */

import React, { useEffect, useRef } from 'react';
import { Markmap } from 'markmap-view';
import type { IPureNode } from 'markmap-common';
import type { NoBom } from '../../lib/projetosBom';
import { formatQtd } from '../../lib/format';

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Monta a árvore do markmap a partir de um recorte da BOM já fechado por
 * ancestrais (`comAncestrais` — todo nó tem o pai presente no conjunto,
 * exceto a(s) raiz(es)). Mais de uma raiz vira um nó sintético "Recorte",
 * porque o markmap precisa de um único ponto de partida.
 */
export function construirArvoreMarkmap(nos: NoBom[], tituloRecorte: string): IPureNode {
  const porId = new Map(nos.map((n) => [n.id, n]));
  const filhosDe = new Map<number, NoBom[]>();
  const raizes: NoBom[] = [];

  for (const no of nos) {
    if (no.parentId !== null && porId.has(no.parentId)) {
      const lista = filhosDe.get(no.parentId);
      if (lista) lista.push(no);
      else filhosDe.set(no.parentId, [no]);
    } else {
      raizes.push(no);
    }
  }

  const montar = (no: NoBom): IPureNode => {
    const filhos = (filhosDe.get(no.id) ?? []).sort((a, b) => a.id - b.id).map(montar);
    const nome = escapeHtml(no.partNumber || `linha ${no.id}`);
    const desc = escapeHtml(no.descricao || no.description || '');
    const qtd = no.qtdPorTorre !== null && no.folha ? ` <span style="opacity:.55">· ${formatQtd(no.qtdPorTorre)}/torre</span>` : '';
    return {
      content: `<b>${nome}</b>${desc ? ` — ${desc}` : ''}${qtd}`,
      children: filhos,
    };
  };

  if (raizes.length === 1) return montar(raizes[0]);
  return {
    content: `<b>${escapeHtml(tituloRecorte)}</b>`,
    children: raizes.sort((a, b) => a.id - b.id).map(montar),
  };
}

interface Props {
  nos: NoBom[];
  titulo: string;
}

export default function MapaMentalBom({ nos, titulo }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const mmRef = useRef<Markmap | null>(null);

  useEffect(() => {
    if (!svgRef.current || !nos.length) return;
    const data = construirArvoreMarkmap(nos, titulo);
    if (!mmRef.current) {
      mmRef.current = Markmap.create(
        svgRef.current,
        { duration: 300, initialExpandLevel: 3, maxWidth: 320, spacingVertical: 8 },
        data,
      );
    } else {
      void mmRef.current.setData(data).then(() => mmRef.current?.fit());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nos, titulo]);

  useEffect(
    () => () => {
      mmRef.current?.destroy();
      mmRef.current = null;
    },
    [],
  );

  if (!nos.length) {
    return (
      <p className="text-sm text-center py-10" style={{ color: 'var(--ink-muted)' }}>
        Nenhuma linha para desenhar — ajuste os filtros.
      </p>
    );
  }

  return <svg ref={svgRef} className="w-full h-full" style={{ minHeight: '60vh' }} />;
}
