/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Cartão de um lançamento de ocorrências (OCF). Fechado mostra o essencial
 * (fornecedor, PO, estrelas, chips das ocorrências); aberto mostra os
 * detalhes, a tratativa e o recado para o próximo comprador.
 */

import React, { useState } from 'react';
import { ChevronDown, ChevronUp, MessageSquareQuote, Pencil, Trash2 } from 'lucide-react';
import {
  ACOES, CATEGORIA_POR_ID, DETECCOES, GRAVIDADES, IMPACTOS, rotuloTipo,
} from '../../../lib/avaliacaoFornecedores';
import type { RegistroOcorrencia } from '../../../lib/avaliacaoFornecedoresApi';
import { formatarDataBR } from '../../../lib/fichaEpi';
import { Estrelas, Etiqueta } from './ui';

const rotuloDe = (lista: { valor: string; rotulo: string }[], v: string) => lista.find(x => x.valor === v)?.rotulo || v;

export default function RegistroCartao({
  registro: r, mostrarFornecedor = true, podeEditar, onEditar, onExcluir, onFornecedor,
}: {
  registro: RegistroOcorrencia;
  mostrarFornecedor?: boolean;
  podeEditar?: boolean;
  onEditar?: () => void;
  onExcluir?: () => void;
  onFornecedor?: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const maiorGravidade = Math.max(0, ...(r.ocorrencias || []).map(o => o.gravidade || 1));
  const corFaixa = GRAVIDADES.find(g => g.valor === maiorGravidade)?.cor || 'var(--hairline)';

  return (
    <article className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)', boxShadow: `inset 3px 0 0 0 ${corFaixa}` }}>
      <button type="button" onClick={() => setAberto(v => !v)} className="block w-full text-left px-4 py-3 space-y-2 hover:bg-[var(--surface-raised)] transition-colors" aria-expanded={aberto}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="font-mono text-xs font-bold" style={{ color: 'var(--brand)' }}>{r.codigo || 'Aguardando sincronização'}</span>
              <span className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>{formatarDataBR(r.data_registro)}</span>
              {r.nro_pedido && <span className="font-mono text-[11px] font-semibold" style={{ color: 'var(--ink-secondary)' }}>PO {r.nro_pedido}</span>}
              {r.nota_fiscal && <span className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>NF {r.nota_fiscal}</span>}
            </div>
            {mostrarFornecedor && (
              <div className="truncate text-sm font-extrabold" style={{ color: 'var(--ink-primary)' }}>{r.fornecedor_nome}</div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Estrelas valor={r.estrelas} tamanho="sm" />
            {aberto ? <ChevronUp className="h-4 w-4" style={{ color: 'var(--ink-muted)' }} /> : <ChevronDown className="h-4 w-4" style={{ color: 'var(--ink-muted)' }} />}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(r.ocorrencias || []).map(o => {
            const cat = CATEGORIA_POR_ID[o.categoria] ?? CATEGORIA_POR_ID.OUTROS;
            const g = GRAVIDADES.find(x => x.valor === o.gravidade);
            return (
              <Etiqueta key={o.id} cor={cat.cor} title={`${cat.rotulo} · gravidade ${g?.rotulo || '-'}`}>
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: g?.cor || cat.cor }} />
                {rotuloTipo(o.tipo)}
              </Etiqueta>
            );
          })}
        </div>
        {!aberto && r.recomendacao && (
          <p className="flex gap-1.5 text-xs line-clamp-1" style={{ color: '#b45309' }}>
            <MessageSquareQuote className="h-3.5 w-3.5 shrink-0 mt-0.5" /> {r.recomendacao}
          </p>
        )}
      </button>

      {aberto && (
        <div className="border-t px-4 py-3 space-y-3 text-xs" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}>
          {mostrarFornecedor && onFornecedor && (
            <button type="button" onClick={onFornecedor} className="font-bold" style={{ color: 'var(--brand)' }}>Ver histórico do fornecedor →</button>
          )}
          {r.material_resumo && <p><b>Material:</b> {r.material_resumo}</p>}
          <ol className="space-y-2">
            {(r.ocorrencias || []).map((o, i) => {
              const cat = CATEGORIA_POR_ID[o.categoria] ?? CATEGORIA_POR_ID.OUTROS;
              const g = GRAVIDADES.find(x => x.valor === o.gravidade);
              return (
                <li key={o.id} className="rounded-lg border px-3 py-2" style={{ borderColor: 'var(--hairline)' }}>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <b style={{ color: 'var(--ink-primary)' }}>{i + 1}. {rotuloTipo(o.tipo)}</b>
                    <Etiqueta cor={cat.cor}>{cat.rotulo}</Etiqueta>
                    {g && <Etiqueta cor={g.cor}>{g.rotulo}</Etiqueta>}
                    {o.deteccao && <span style={{ color: 'var(--ink-muted)' }}>· {DETECCOES.find(d => d.valor === o.deteccao)?.rotulo}</span>}
                  </div>
                  {o.descricao && <p className="mt-1 whitespace-pre-line">{o.descricao}</p>}
                </li>
              );
            })}
          </ol>
          {r.impactos?.length > 0 && <p><b>Impacto:</b> {r.impactos.map(i => rotuloDe(IMPACTOS, i)).join(', ')}</p>}
          {(r.acoes?.length > 0 || r.acao_descricao) && (
            <p><b>Tratativa:</b> {[...(r.acoes || []).map(a => rotuloDe(ACOES, a)), r.acao_descricao].filter(Boolean).join(' — ')}</p>
          )}
          {r.recomendacao && (
            <p className="flex gap-1.5 rounded-lg px-3 py-2" style={{ background: 'color-mix(in srgb, #d97706 8%, transparent)', color: '#92400e' }}>
              <MessageSquareQuote className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span><b>Recado para o próximo comprador:</b> {r.recomendacao}</span>
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <span style={{ color: 'var(--ink-muted)' }}>
              Por {r.criado_por_nome || '—'}{r.origem === 'PENDENCIAS' ? ' · a partir das pendências do PO' : ''}
            </span>
            {podeEditar && (
              <span className="flex items-center gap-1">
                {onEditar && (
                  <button type="button" onClick={onEditar} className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 font-bold" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}>
                    <Pencil className="h-3.5 w-3.5" /> Editar
                  </button>
                )}
                {onExcluir && (
                  <button type="button" onClick={onExcluir} className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 font-bold" style={{ borderColor: 'var(--hairline)', color: 'var(--status-critical)' }}>
                    <Trash2 className="h-3.5 w-3.5" /> Excluir
                  </button>
                )}
              </span>
            )}
          </div>
        </div>
      )}
    </article>
  );
}
