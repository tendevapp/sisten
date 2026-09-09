/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Projetos > Estrutura (BOM) — árvore navegável de níveis 1 a 6.
 *
 * Só leitura: a BOM é engenharia e as correções acontecem na origem. O painel
 * de auditoria NOMEIA o que está sujo (quantidade faltando, part number com
 * duas grafias) para a conversa ser sobre a linha 21 da BOM, não sobre "o
 * sistema errou".
 */

import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, GitBranch, Search, ShieldAlert, X } from 'lucide-react';
import { TableEmpty } from '../ui/DataTable';
import { SELECT_CLS } from './campos';
import { formatQtd } from '../../lib/format';
import { TRAMOS, type Tramo } from '../../lib/projetos';
import type { NoBom } from '../../lib/projetosBom';
import type { DadosProjetos } from '../../views/projetos/useDadosProjetos';

interface Props { dados: DadosProjetos }

export default function PainelBom({ dados }: Props) {
  const { arvore, pendencias, saldoPorPn, subprojetoAtivo, loading } = dados;

  const [busca, setBusca] = useState('');
  const [tramoFiltro, setTramoFiltro] = useState<'' | Tramo>('');
  const [grupoFiltro, setGrupoFiltro] = useState('');
  const [fornecedorFiltro, setFornecedorFiltro] = useState('');
  const [soFolhas, setSoFolhas] = useState(false);
  const [expandidos, setExpandidos] = useState<Set<number>>(new Set());
  const [auditoriaAberta, setAuditoriaAberta] = useState(false);

  const torres = subprojetoAtivo?.torres_previstas ?? 1;

  const grupos = useMemo(
    () => Array.from(new Set(arvore.nos.map((n) => n.grupoNorm).filter(Boolean))).sort(),
    [arvore],
  );
  const fornecedores = useMemo(
    () => Array.from(new Set(arvore.nos.map((n) => n.fornecedor).filter(Boolean))).sort(),
    [arvore],
  );

  const temFiltro = Boolean(busca.trim() || tramoFiltro || grupoFiltro || fornecedorFiltro || soFolhas);

  /**
   * Com filtro, a árvore vira lista achatada: mostrar só os nós que casam é o
   * que se quer procurando, e desenhar a hierarquia com buracos no meio seria
   * pior que não desenhar. Sem filtro, é árvore de verdade com expansão.
   */
  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();

    const casa = (n: NoBom) =>
      (!termo ||
        n.partNumber.toLowerCase().includes(termo) ||
        (n.codSap ?? '').toLowerCase().includes(termo) ||
        n.descricao.toLowerCase().includes(termo) ||
        n.description.toLowerCase().includes(termo)) &&
      (!tramoFiltro || n.tramo === tramoFiltro) &&
      (!grupoFiltro || n.grupoNorm === grupoFiltro) &&
      (!fornecedorFiltro || n.fornecedor === fornecedorFiltro) &&
      (!soFolhas || n.folha);

    if (temFiltro) return arvore.nos.filter(casa);

    // Sem filtro: só o que está aberto (raízes sempre visíveis).
    return arvore.nos.filter((n) => n.parentId === null || estaAberto(n, arvore, expandidos));
  }, [arvore, busca, tramoFiltro, grupoFiltro, fornecedorFiltro, soFolhas, temFiltro, expandidos]);

  const alternar = (id: number) => {
    setExpandidos((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(id)) proximo.delete(id); else proximo.add(id);
      return proximo;
    });
  };

  const limparFiltros = () => {
    setBusca(''); setTramoFiltro(''); setGrupoFiltro(''); setFornecedorFiltro(''); setSoFolhas(false);
  };

  const totalFolhas = arvore.nos.filter((n) => n.folha).length;

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'var(--ink-muted)' }} />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Part number, código SAP ou descrição"
            className="w-full rounded-lg border py-2 pl-9 pr-3 text-xs font-medium focus:outline-2 focus:outline-offset-1"
            style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)', color: 'var(--ink-primary)', outlineColor: 'var(--brand)' }}
          />
        </div>
        <select value={tramoFiltro} onChange={(e) => setTramoFiltro(e.target.value as any)} className={SELECT_CLS} aria-label="Tramo">
          <option value="">Todos os tramos</option>
          {TRAMOS.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={grupoFiltro} onChange={(e) => setGrupoFiltro(e.target.value)} className={SELECT_CLS} aria-label="Grupo">
          <option value="">Todos os grupos</option>
          {grupos.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
        <select value={fornecedorFiltro} onChange={(e) => setFornecedorFiltro(e.target.value)} className={SELECT_CLS} aria-label="Fornecedor">
          <option value="">Todos os fornecedores</option>
          {fornecedores.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
        <label className="inline-flex items-center gap-2 text-xs font-bold cursor-pointer px-3 py-2 rounded-lg border" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}>
          <input type="checkbox" checked={soFolhas} onChange={(e) => setSoFolhas(e.target.checked)} className="cursor-pointer" />
          Só itens estocáveis
        </label>
        {temFiltro && (
          <button onClick={limparFiltros} className="inline-flex items-center gap-1 text-xs font-bold cursor-pointer px-3 py-2 rounded-lg border hover:opacity-80" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-muted)' }}>
            <X className="h-3.5 w-3.5" /> Limpar
          </button>
        )}
        {pendencias.length > 0 && (
          <button
            onClick={() => setAuditoriaAberta((v) => !v)}
            className="inline-flex items-center gap-1.5 text-xs font-bold cursor-pointer px-3 py-2 rounded-lg border border-amber-300 dark:border-amber-800/60 bg-amber-50/60 dark:bg-amber-950/20 text-amber-800 dark:text-amber-300 hover:opacity-90"
          >
            <ShieldAlert className="h-3.5 w-3.5" />
            Auditoria de cadastro ({pendencias.length})
          </button>
        )}
      </div>

      {auditoriaAberta && pendencias.length > 0 && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/40 dark:bg-amber-950/15 p-4 space-y-3">
          <p className="text-xs font-bold text-amber-900 dark:text-amber-200">
            A BOM é somente leitura no sistema — estas pendências são para a engenharia corrigir na origem.
          </p>
          {pendencias.map((p) => (
            <div key={p.tipo} className="text-xs">
              <p className="font-bold" style={{ color: 'var(--ink-primary)' }}>{p.titulo}</p>
              <p className="mt-0.5" style={{ color: 'var(--ink-secondary)' }}>{p.detalhe}</p>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>
        {formatQtd(arvore.nos.length)} linhas · {formatQtd(totalFolhas)} itens estocáveis (folhas) ·
        mostrando {formatQtd(visiveis.length)}
        {temFiltro ? ' (lista achatada pelo filtro)' : ' (clique para expandir)'}
      </p>

      {loading && <div className="h-64 rounded-xl animate-pulse" style={{ background: 'var(--hairline)' }} />}

      {!loading && !visiveis.length && (
        <TableEmpty icon={GitBranch} title="Nenhuma linha encontrada" hint="Ajuste os filtros ou limpe a busca." />
      )}

      {!loading && visiveis.length > 0 && (
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--hairline)' }}>
          <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10" style={{ background: 'var(--surface-raised)' }}>
                <tr className="border-b" style={{ borderColor: 'var(--hairline)' }}>
                  <Cabecalho>Item</Cabecalho>
                  <Cabecalho align="right">Nível</Cabecalho>
                  <Cabecalho>Tramo</Cabecalho>
                  <Cabecalho>Grupo</Cabecalho>
                  <Cabecalho>Subconjunto</Cabecalho>
                  <Cabecalho>Fornecedor</Cabecalho>
                  <Cabecalho align="right">Por torre</Cabecalho>
                  <Cabecalho align="right">Subprojeto ({torres}T)</Cabecalho>
                  <Cabecalho align="right">Saldo</Cabecalho>
                </tr>
              </thead>
              <tbody>
                {visiveis.map((no) => {
                  const aberto = expandidos.has(no.id);
                  const temFilhos = no.filhos.length > 0;
                  const saldo = no.folha ? saldoPorPn.get(no.partNumberNorm) ?? 0 : null;
                  const recuo = temFiltro ? 0 : (no.profundidade - 1) * 16;

                  return (
                    <tr
                      key={no.id}
                      className="border-b transition-colors hover:bg-[var(--surface-hover,rgba(127,127,127,0.06))]"
                      style={{ borderColor: 'var(--hairline)' }}
                    >
                      <td className="px-3 py-1.5">
                        <div className="flex items-center gap-1.5" style={{ paddingLeft: recuo }}>
                          {temFilhos ? (
                            <button
                              onClick={() => alternar(no.id)}
                              className="shrink-0 cursor-pointer rounded hover:opacity-70"
                              aria-label={aberto ? 'Recolher' : 'Expandir'}
                              aria-expanded={aberto}
                            >
                              {aberto ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                            </button>
                          ) : (
                            <span className="w-3.5 shrink-0" aria-hidden="true" />
                          )}
                          <div className="min-w-0">
                            <p className="font-bold truncate" style={{ color: 'var(--ink-primary)' }}>
                              {no.partNumber || `linha ${no.id}`}
                              {!no.folha && <span className="ml-2 font-normal text-[10px]" style={{ color: 'var(--ink-muted)' }}>conjunto</span>}
                            </p>
                            <p className="truncate text-[11px]" style={{ color: 'var(--ink-muted)' }} title={no.description}>
                              {no.descricao || no.description || '—'}
                              {no.codSap ? ` · SAP ${no.codSap}` : ''}
                            </p>
                          </div>
                        </div>
                      </td>
                      <Celula align="right">{no.level}</Celula>
                      <Celula>{no.tramo ?? '—'}</Celula>
                      <Celula>{no.grupo || '—'}</Celula>
                      <Celula title={no.subconjunto ?? ''}>{encurtar(no.subconjunto)}</Celula>
                      <Celula>{no.fornecedor || '—'}</Celula>
                      <Celula align="right" forte>{no.qtdPorTorre === null ? '—' : formatQtd(no.qtdPorTorre)}</Celula>
                      <Celula align="right">{no.qtdPorTorre === null || !no.folha ? '—' : formatQtd(no.qtdPorTorre * torres)}</Celula>
                      <td className="px-3 py-1.5 text-right tabular-nums font-bold whitespace-nowrap"
                          style={{ color: saldo === null ? 'var(--ink-muted)' : saldo > 0 ? 'var(--abc-a)' : 'var(--abc-c)' }}>
                        {saldo === null ? '—' : formatQtd(saldo)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}


/** Um nó é visível quando todos os ancestrais estão expandidos. */
function estaAberto(no: NoBom, arvore: { porId: Map<number, NoBom> }, expandidos: Set<number>): boolean {
  let pai = no.parentId;
  while (pai !== null) {
    if (!expandidos.has(pai)) return false;
    pai = arvore.porId.get(pai)?.parentId ?? null;
  }
  return true;
}

/** O nome do kit Atlanta é longo demais para a coluna; o title guarda o inteiro. */
const encurtar = (s: string | null) => (!s ? '—' : s.length > 26 ? `${s.slice(0, 24)}…` : s);

function Cabecalho({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th className={`px-3 py-2 font-bold whitespace-nowrap text-${align}`} style={{ color: 'var(--ink-muted)' }}>
      {children}
    </th>
  );
}

function Celula({
  children, align = 'left', forte = false, title,
}: { children: React.ReactNode; align?: 'left' | 'right'; forte?: boolean; title?: string }) {
  return (
    <td
      className={`px-3 py-1.5 whitespace-nowrap text-${align} ${align === 'right' ? 'tabular-nums' : ''} ${forte ? 'font-bold' : ''}`}
      style={{ color: forte ? 'var(--ink-primary)' : 'var(--ink-secondary)' }}
      title={title}
    >
      {children}
    </td>
  );
}
