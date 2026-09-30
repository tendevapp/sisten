/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Painel do método de estoque mínimo do SISTEN (percentil 90 do lote, lead time
 * medido, padrão de demanda). Compartilhado entre Movimentações > Estoque Mínimo
 * e Controle de Estoque > Mínimo SISTEN.
 *
 * Controlado por props: não busca dados. Quem chama entrega as sugestões já
 * filtradas e o filtro de recomendação; o painel só apresenta e pagina.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ClipboardCheck, ShoppingCart, Timer } from 'lucide-react';
import {
  FAIXAS_RECOMENDACAO, ROTULO_PADRAO, ROTULO_CONFIANCA, EXPLICACAO_PADRAO,
  resumirReposicao, SugestaoReposicao, Recomendacao,
} from '../../lib/reposicao';
import { formatBRL, formatQtd } from '../../lib/almoxarifado';
import { formatInt } from '../../lib/format';
import MetodoMinimoPanel from './MetodoMinimoPanel';
import KpiCard from '../charts/KpiCard';
import {
  TableShell, TableHeadRow, Th, TableBody, Tr, Td, TableSkeleton, TableEmpty,
} from '../ui/DataTable';
import Pagination from '../ui/Pagination';

const PAGE_SIZE = 50;

interface Props {
  sugestoes: SugestaoReposicao[];
  loading: boolean;
  janelaInicio?: string | null;
  janelaFim?: string | null;
  janelaDias?: number | null;
  leadMediano: number | null;
  recomendacaoFiltro: 'Todos' | Recomendacao;
  onRecomendacaoChange: (valor: 'Todos' | Recomendacao) => void;
}

export default function EstoqueMinimoPanel({
  sugestoes, loading, janelaInicio, janelaFim, janelaDias, leadMediano,
  recomendacaoFiltro, onRecomendacaoChange,
}: Props) {
  const [page, setPage] = useState(0);

  const resumoReposicao = useMemo(() => resumirReposicao(sugestoes), [sugestoes]);

  const sugestoesOrdenadas = useMemo(() => {
    const base = recomendacaoFiltro === 'Todos'
      ? sugestoes
      : sugestoes.filter(s => s.recomendacao === recomendacaoFiltro);
    // Ordem de trabalho do comprador: primeiro o que para a produção, e dentro
    // de cada grupo o de maior impacto financeiro.
    return [...base].sort((a, b) => {
      const pa = FAIXAS_RECOMENDACAO[a.recomendacao].prioridade;
      const pb = FAIXAS_RECOMENDACAO[b.recomendacao].prioridade;
      if (pa !== pb) return pa - pb;
      const va = a.valorCompraSugerida ?? a.valor_estoque;
      const vb = b.valorCompraSugerida ?? b.valor_estoque;
      return vb - va;
    });
  }, [sugestoes, recomendacaoFiltro]);

  const investimentoNecessario = useMemo(
    () => sugestoes.reduce((a, s) => a + (s.valorCompraSugerida ?? 0), 0),
    [sugestoes]
  );

  useEffect(() => { setPage(0); }, [sugestoesOrdenadas]);

  const paginar = <T,>(arr: T[]) => arr.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const totalPages = (n: number) => Math.max(1, Math.ceil(n / PAGE_SIZE));

  return (
    <>
      <MetodoMinimoPanel
        janelaInicio={janelaInicio}
        janelaFim={janelaFim}
        janelaDias={janelaDias}
        leadMediano={leadMediano}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 stagger">
        <KpiCard
          label="Repor agora"
          value={resumoReposicao.find(r => r.recomendacao === 'repor_agora')?.materiais ?? 0}
          format={formatInt}
          detail="materiais abaixo do mínimo"
          icon={AlertCircle}
          accent="var(--status-critical)"
          emphasize
        />
        <KpiCard
          label="Investimento p/ recompor"
          value={investimentoNecessario}
          format={formatBRL}
          detail="para trazer todos ao mínimo"
          icon={ShoppingCart}
          accent="var(--series-1)"
        />
        <KpiCard
          label="Com mínimo definido"
          value={sugestoes.filter(s => s.minimoSugerido !== null).length}
          format={formatInt}
          detail={`de ${formatInt(sugestoes.length)} materiais — os demais não têm demanda suficiente`}
          icon={ClipboardCheck}
          accent="var(--status-good)"
          share={sugestoes.length > 0
            ? sugestoes.filter(s => s.minimoSugerido !== null).length / sugestoes.length
            : undefined}
        />
        <KpiCard
          label="Comprar sob demanda"
          value={resumoReposicao.find(r => r.recomendacao === 'sob_demanda')?.materiais ?? 0}
          format={formatInt}
          detail="demanda rara demais para estocar"
          icon={Timer}
          accent="var(--series-3)"
        />
      </div>

      {/* Distribuição das recomendações, clicável para filtrar. */}
      <div className="rounded-xl border p-4" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}>
        <h3 className="text-sm font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--ink-primary)' }}>
          O que fazer com cada grupo
        </h3>
        <ul className="space-y-1.5">
          {resumoReposicao.map(r => (
            <li key={r.recomendacao}>
              <button
                type="button"
                onClick={() => onRecomendacaoChange(
                  recomendacaoFiltro === r.recomendacao ? 'Todos' : r.recomendacao
                )}
                className="w-full flex items-center gap-2.5 text-xs rounded px-2 py-1.5 -mx-2 text-left cursor-pointer transition-colors duration-150 hover:bg-[var(--surface-raised)] focus-visible:outline-2 focus-visible:outline-offset-1"
                style={{
                  outlineColor: r.cor,
                  background: recomendacaoFiltro === r.recomendacao ? 'var(--surface-raised)' : undefined,
                }}
              >
                <span className="h-2.5 w-2.5 rounded-[3px] shrink-0" style={{ background: r.cor }} aria-hidden="true" />
                <span className="font-semibold flex-1" style={{ color: 'var(--ink-primary)' }}>{r.rotulo}</span>
                <span className="tabular shrink-0 w-24 text-right" style={{ color: 'var(--ink-muted)' }}>
                  {formatInt(r.materiais)} mat.
                </span>
                <span className="tabular shrink-0 w-32 text-right font-semibold" style={{ color: 'var(--ink-primary)' }}>
                  {r.valorCompra > 0 ? formatBRL(r.valorCompra) : formatBRL(r.valorEstoque)}
                </span>
                <span className="text-[10px] shrink-0 w-20 text-right" style={{ color: 'var(--ink-muted)' }}>
                  {r.valorCompra > 0 ? 'a comprar' : 'em estoque'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {loading ? <TableSkeleton columns={8} /> : sugestoesOrdenadas.length === 0 ? (
        <TableEmpty icon={ClipboardCheck} title="Nenhum material encontrado" hint="Ajuste os filtros ou a pesquisa." />
      ) : (
        <div className="space-y-2">
          <TableShell maxHeight="60vh">
            <table className="w-full text-xs border-collapse">
              <TableHeadRow>
                <Th label="Material" />
                <Th label="Recomendação" width="w-44" />
                <Th label="Padrão / Confiança" width="w-40" />
                <Th label="Saldo" align="right" width="w-28" />
                <Th label="Mínimo Sugerido" align="right" width="w-36" />
                <Th label="Comprar" align="right" width="w-32" />
                <Th label="Consumo/dia" align="right" width="w-28" />
                <Th label="Lead" align="right" width="w-24" />
              </TableHeadRow>
              <TableBody>
                {paginar(sugestoesOrdenadas).map(s => {
                  const faixa = FAIXAS_RECOMENDACAO[s.recomendacao];
                  return (
                    <Tr
                      key={s.material}
                      accent={s.recomendacao === 'repor_agora' ? faixa.cor : undefined}
                      title={s.explicacao}
                    >
                      <Td truncate title={s.descricao || ''}>
                        <span className="font-mono font-bold" style={{ color: 'var(--ink-primary)' }}>{s.material}</span>
                        {s.descricao ? ` — ${s.descricao}` : ''}
                      </Td>
                      <Td>
                        <span className="inline-flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-[2px] shrink-0" style={{ background: faixa.cor }} aria-hidden="true" />
                          <span className="text-[11px] font-semibold">{faixa.rotulo}</span>
                        </span>
                      </Td>
                      <Td>
                        <span className="text-[11px]" title={EXPLICACAO_PADRAO[s.padrao]}>
                          {ROTULO_PADRAO[s.padrao]}
                        </span>
                        <span className="text-[10px] block" style={{ color: 'var(--ink-muted)' }}>
                          {ROTULO_CONFIANCA[s.confianca]} · {formatInt(s.eventos)} saídas
                        </span>
                      </Td>
                      <Td align="right" numeric>{formatQtd(s.saldo_atual)} {s.umb || ''}</Td>
                      <Td align="right" numeric strong>
                        {s.minimoSugerido !== null ? formatQtd(s.minimoSugerido) : (
                          <span style={{ color: 'var(--ink-muted)' }} title="Demanda insuficiente para estimar um mínimo.">
                            não aplicável
                          </span>
                        )}
                        {s.minimoSugerido !== null && s.diasCobertosPeloMinimo !== null && (
                          <span className="text-[10px] block font-normal" style={{ color: 'var(--ink-muted)' }}>
                            cobre {Math.round(s.diasCobertosPeloMinimo)} dias
                          </span>
                        )}
                      </Td>
                      <Td align="right" numeric>
                        {s.compraSugerida ? (
                          <>
                            <span className="font-bold" style={{ color: 'var(--status-critical)' }}>
                              {formatQtd(s.compraSugerida)}
                            </span>
                            {s.valorCompraSugerida !== null && (
                              <span className="text-[10px] block" style={{ color: 'var(--ink-muted)' }}>
                                {formatBRL(s.valorCompraSugerida)}
                              </span>
                            )}
                          </>
                        ) : '—'}
                      </Td>
                      <Td align="right" numeric>{formatQtd(s.consumoDiario)}</Td>
                      <Td align="right" numeric>
                        {formatInt(Math.round(s.leadDias))} d
                        {!s.leadProprio && (
                          <span className="text-[10px] block" style={{ color: 'var(--ink-muted)' }}
                                title="Este material não tem compra rastreável; usada a mediana da fábrica.">
                            estimado
                          </span>
                        )}
                      </Td>
                    </Tr>
                  );
                })}
              </TableBody>
            </table>
          </TableShell>

          {/* A explicação por linha vive no title da linha, mas o caso
              selecionado ganha texto à vista — ler tooltip de 40 linhas
              não é leitura. */}
          {sugestoesOrdenadas.length > 0 && (
            <p className="text-[11px] leading-relaxed px-1" style={{ color: 'var(--ink-muted)' }}>
              <strong style={{ color: 'var(--ink-secondary)' }}>Exemplo — {sugestoesOrdenadas[0].material}:</strong>{' '}
              {sugestoesOrdenadas[0].explicacao}
            </p>
          )}

          <Pagination page={page} totalPages={totalPages(sugestoesOrdenadas.length)} onPageChange={setPage}
            info={`${sugestoesOrdenadas.length.toLocaleString('pt-BR')} materiais`} />
        </div>
      )}
    </>
  );
}
