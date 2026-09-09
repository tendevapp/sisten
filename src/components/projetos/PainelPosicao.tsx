/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Projetos > Posição & Autonomia.
 *
 * É a aba consolidada da planilha, refeita. Duas diferenças que importam:
 * o saldo aqui nunca é negativo (a baixa é recusada antes), e a autonomia
 * aparece nas duas leituras — a isolada de cada tramo e a rateada, que é a
 * única que responde "quantas TORRES o estoque atende".
 */

import React, { useMemo, useState } from 'react';
import { Boxes, Check, Download, Pencil, Search, X } from 'lucide-react';
import * as XLSX from 'xlsx';
import { TableEmpty } from '../ui/DataTable';
import { useToast } from '../ui/Toast';
import { atualizarItem } from '../../lib/projetosApi';
import { formatInt, formatQtd } from '../../lib/format';
import { TRAMOS } from '../../lib/projetos';
import type { DadosProjetos } from '../../views/projetos/useDadosProjetos';

interface Props { dados: DadosProjetos }

type Recorte = 'todos' | 'com_saldo' | 'zerados' | 'abaixo_minimo' | 'com_refugo';

const RECORTES: { id: Recorte; rotulo: string }[] = [
  { id: 'todos', rotulo: 'Todos' },
  { id: 'com_saldo', rotulo: 'Com saldo' },
  { id: 'zerados', rotulo: 'Zerados' },
  { id: 'abaixo_minimo', rotulo: 'Abaixo do mínimo' },
  { id: 'com_refugo', rotulo: 'Com refugo' },
];

export default function PainelPosicao({ dados }: Props) {
  const { saldos, autonomia, rateio, consumo, subprojetoAtivo, projecao, loading, recarregar } = dados;
  const toast = useToast();
  const [busca, setBusca] = useState('');
  const [recorte, setRecorte] = useState<Recorte>('todos');
  // Localizador e estoque mínimo são do almoxarifado, não da BOM: editáveis
  // aqui mesmo, na linha, porque quem sabe a prateleira é quem lê esta tela.
  const [editando, setEditando] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState<{ localizador: string; estoque_minimo: string }>({ localizador: '', estoque_minimo: '' });
  const [salvandoItem, setSalvandoItem] = useState(false);

  const abrirEdicao = (itemId: string, localizador: string | null, minimo: number) => {
    setEditando(itemId);
    setRascunho({ localizador: localizador ?? '', estoque_minimo: String(minimo ?? 0) });
  };

  const salvarItem = async (itemId: string) => {
    setSalvandoItem(true);
    try {
      const minimo = Number(rascunho.estoque_minimo.replace(',', '.'));
      await atualizarItem(itemId, {
        localizador: rascunho.localizador.trim() || null,
        estoque_minimo: Number.isFinite(minimo) && minimo >= 0 ? minimo : 0,
      });
      setEditando(null);
      await recarregar(true);
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível salvar o item.');
    } finally {
      setSalvandoItem(false);
    }
  };
  const torres = subprojetoAtivo?.torres_previstas ?? 1;

  /** Consumo do item numa torre inteira — soma dos cinco tramos. */
  const consumoPorTorre = useMemo(() => {
    const m = new Map<string, number>();
    for (const tramo of TRAMOS) {
      for (const item of consumo.get(tramo)?.values() ?? []) {
        m.set(item.partNumberNorm, (m.get(item.partNumberNorm) ?? 0) + item.qtdPorTorre);
      }
    }
    return m;
  }, [consumo]);

  const linhas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return saldos
      .map((s) => {
        const porTorre = consumoPorTorre.get(s.part_number_norm) ?? 0;
        return {
          ...s,
          saldo: Number(s.saldo) || 0,
          entradas: Number(s.entradas) || 0,
          saidas: Number(s.saidas) || 0,
          refugo: Number(s.refugo) || 0,
          consumoPorTorre: porTorre,
          // "Autonomia torre" da planilha: quantas torres o saldo cobre.
          torresCobertas: porTorre > 0 ? Math.floor((Number(s.saldo) || 0) / porTorre) : null,
          demandaSubprojeto: porTorre * torres,
        };
      })
      .filter((s) => {
        if (termo && !(
          s.part_number.toLowerCase().includes(termo) ||
          (s.cod_sap ?? '').toLowerCase().includes(termo) ||
          (s.descricao ?? '').toLowerCase().includes(termo) ||
          (s.description ?? '').toLowerCase().includes(termo)
        )) return false;
        if (recorte === 'com_saldo') return s.saldo > 0;
        if (recorte === 'zerados') return s.saldo === 0;
        if (recorte === 'abaixo_minimo') return s.estoque_minimo > 0 && s.saldo < s.estoque_minimo;
        if (recorte === 'com_refugo') return s.refugo > 0;
        return true;
      })
      .sort((a, b) => (a.torresCobertas ?? Infinity) - (b.torresCobertas ?? Infinity) || a.part_number.localeCompare(b.part_number));
  }, [saldos, consumoPorTorre, busca, recorte, torres]);

  const exportar = () => {
    const planilha = linhas.map((l) => ({
      'Cod.Sap': l.cod_sap ?? '',
      'Part.Number': l.part_number,
      Fornecedor: l.fornecedor ?? '',
      Description: l.description ?? '',
      'Descrição': l.descricao ?? '',
      Localizador: l.localizador ?? '',
      ENTRADA: l.entradas,
      'SAÍDA': l.saidas,
      REFUGO: l.refugo,
      ESTOQUE: l.saldo,
      'CONSUMO TORRE (BOM)': l.consumoPorTorre,
      [`DEMANDA ${torres}T`]: l.demandaSubprojeto,
      'AUTONOMIA TORRE': l.torresCobertas ?? '',
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(planilha), 'Posição');
    XLSX.writeFile(wb, `posicao-projetos-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="space-y-5">
      {/* Autonomia de kitting */}
      <div className="rounded-xl border p-4 sm:p-5" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)' }}>
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
          <h3 className="text-sm font-extrabold" style={{ color: 'var(--ink-primary)' }}>Autonomia de kitting</h3>
          <p className="text-xs font-bold" style={{ color: 'var(--ink-secondary)' }}>
            Rateado T1→T5: <span style={{ color: 'var(--brand)' }}>{formatInt(rateio.torresCompletas)} torre(s) completa(s)</span>
          </p>
        </div>
        <p className="text-xs mb-4" style={{ color: 'var(--ink-muted)' }}>
          A coluna "isolada" é quantos kits cada tramo faria se tivesse o estoque todo para si; a "rateada" divide as
          peças compartilhadas na fila de montagem. Somar as isoladas conta o mesmo parafuso mais de uma vez — foi o erro
          da planilha.
        </p>

        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {autonomia.map((a) => {
            const rateada = rateio.porTramo.find((r) => r.tramo === a.tramo);
            const prontos = dados.kitsProntosPorTramo.get(a.tramo)?.length ?? 0;
            return (
              <div key={a.tramo} className="rounded-lg border p-3" style={{ borderColor: 'var(--hairline)' }}>
                <p className="text-xs font-extrabold mb-2" style={{ color: 'var(--ink-primary)' }}>Kit {a.tramo}</p>
                <dl className="space-y-1 text-[11px]">
                  <Linha rotulo="Separáveis (isolada)" valor={formatInt(a.kitsPossiveis)} destaque />
                  <Linha rotulo="Separáveis (rateada)" valor={formatQtd(rateada?.kits ?? 0)} />
                  <Linha rotulo="Prontos no buffer" valor={formatInt(prontos)} />
                  <Linha rotulo="Itens no romaneio" valor={formatInt(a.itensNoKit)} />
                </dl>
                {a.criticos.length > 0 && (
                  <div className="mt-2 pt-2 border-t" style={{ borderColor: 'var(--hairline)' }}>
                    <p className="text-[10px] font-bold mb-1" style={{ color: 'var(--ink-muted)' }}>Top 5 críticos</p>
                    <ul className="space-y-0.5">
                      {a.criticos.map((c) => (
                        <li key={c.partNumberNorm} className="flex justify-between gap-2 text-[10px]" title={c.descricao}>
                          <span className="truncate" style={{ color: 'var(--ink-secondary)' }}>{c.partNumber}</span>
                          <span className="tabular-nums font-bold shrink-0" style={{ color: c.kitsPossiveis > 0 ? 'var(--ink-muted)' : 'var(--abc-c)' }}>
                            {formatInt(c.kitsPossiveis)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Posição do almoxarifado */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'var(--ink-muted)' }} />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Part number, SAP ou descrição"
            className="w-full rounded-lg border py-2 pl-9 pr-3 text-xs font-medium focus:outline-2 focus:outline-offset-1"
            style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)', color: 'var(--ink-primary)', outlineColor: 'var(--brand)' }}
          />
        </div>
        <div className="flex gap-1 flex-wrap">
          {RECORTES.map((r) => (
            <button
              key={r.id}
              onClick={() => setRecorte(r.id)}
              className="px-3 py-2 rounded-lg text-xs font-bold cursor-pointer border transition-colors"
              style={{
                borderColor: recorte === r.id ? 'var(--brand)' : 'var(--hairline)',
                color: recorte === r.id ? 'var(--brand)' : 'var(--ink-muted)',
              }}
            >
              {r.rotulo}
            </button>
          ))}
        </div>
        {busca && (
          <button onClick={() => setBusca('')} className="inline-flex items-center gap-1 text-xs font-bold cursor-pointer px-3 py-2 rounded-lg border hover:opacity-80" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-muted)' }}>
            <X className="h-3.5 w-3.5" /> Limpar
          </button>
        )}
        <button
          onClick={exportar}
          disabled={!linhas.length}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold cursor-pointer border hover:opacity-80 disabled:opacity-40"
          style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}
        >
          <Download className="h-3.5 w-3.5" /> Exportar
        </button>
      </div>

      {projecao.alertaCompraComplementar && (
        <p className="text-xs px-3 py-2 rounded-lg border border-amber-300 dark:border-amber-800/60 bg-amber-50/60 dark:bg-amber-950/20 text-amber-800 dark:text-amber-300">
          {formatInt(projecao.deficits.length)} item(ns) não fecham as {formatInt(projecao.torresRestantes)} torres
          restantes deste subprojeto — ver a aba Painéis.
        </p>
      )}

      {loading && <div className="h-64 rounded-xl animate-pulse" style={{ background: 'var(--hairline)' }} />}

      {!loading && !linhas.length && (
        <TableEmpty icon={Boxes} title="Nenhum item nesta seleção" hint="Ajuste o recorte ou a busca. Sem entradas lançadas, todo o estoque está zerado." />
      )}

      {!loading && linhas.length > 0 && (
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--hairline)' }}>
          <div className="overflow-x-auto max-h-[65vh] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10" style={{ background: 'var(--surface-raised)' }}>
                <tr className="border-b" style={{ borderColor: 'var(--hairline)' }}>
                  <Th>Item</Th>
                  <Th>Fornecedor</Th>
                  <Th>Local</Th>
                  <Th r>Entradas</Th>
                  <Th r>Saídas</Th>
                  <Th r>Refugo</Th>
                  <Th r>Estoque</Th>
                  <Th r>Consumo/torre</Th>
                  <Th r>Demanda {torres}T</Th>
                  <Th r>Autonomia (torres)</Th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => (
                  <tr key={l.item_id} className="border-b" style={{ borderColor: 'var(--hairline)' }}>
                    <td className="px-3 py-1.5 min-w-[220px]">
                      <p className="font-bold truncate" style={{ color: 'var(--ink-primary)' }}>{l.part_number}</p>
                      <p className="truncate text-[11px]" style={{ color: 'var(--ink-muted)' }}>
                        {l.descricao || l.description || '—'}{l.cod_sap ? ` · SAP ${l.cod_sap}` : ''}
                      </p>
                    </td>
                    <Td>{l.fornecedor || '—'}</Td>
                    <td className="px-3 py-1.5 whitespace-nowrap">
                      {editando === l.item_id ? (
                        <div className="flex items-center gap-1">
                          <input
                            value={rascunho.localizador}
                            onChange={(e) => setRascunho((r) => ({ ...r, localizador: e.target.value }))}
                            onKeyDown={(e) => { if (e.key === 'Enter') void salvarItem(l.item_id); if (e.key === 'Escape') setEditando(null); }}
                            placeholder="Prateleira"
                            autoFocus
                            className="w-24 rounded border px-1.5 py-0.5 text-xs focus:outline-2"
                            style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)', color: 'var(--ink-primary)', outlineColor: 'var(--brand)' }}
                          />
                          <input
                            value={rascunho.estoque_minimo}
                            onChange={(e) => setRascunho((r) => ({ ...r, estoque_minimo: e.target.value }))}
                            onKeyDown={(e) => { if (e.key === 'Enter') void salvarItem(l.item_id); if (e.key === 'Escape') setEditando(null); }}
                            inputMode="decimal"
                            title="Estoque mínimo"
                            className="w-16 rounded border px-1.5 py-0.5 text-xs text-right tabular-nums focus:outline-2"
                            style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)', color: 'var(--ink-primary)', outlineColor: 'var(--brand)' }}
                          />
                          <button onClick={() => void salvarItem(l.item_id)} disabled={salvandoItem} className="cursor-pointer disabled:opacity-40" aria-label="Salvar">
                            <Check className="h-3.5 w-3.5" style={{ color: 'var(--abc-a)' }} />
                          </button>
                          <button onClick={() => setEditando(null)} className="cursor-pointer" aria-label="Cancelar">
                            <X className="h-3.5 w-3.5" style={{ color: 'var(--ink-muted)' }} />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => abrirEdicao(l.item_id, l.localizador, l.estoque_minimo)}
                          className="group inline-flex items-center gap-1 cursor-pointer hover:underline"
                          style={{ color: l.localizador ? 'var(--ink-secondary)' : 'var(--ink-muted)' }}
                          title={`Definir prateleira e estoque mínimo (mín. atual: ${formatQtd(l.estoque_minimo)})`}
                        >
                          {l.localizador || 'definir'}
                          <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-60" />
                        </button>
                      )}
                    </td>
                    <Td r>{formatQtd(l.entradas)}</Td>
                    <Td r>{formatQtd(l.saidas)}</Td>
                    <Td r cor={l.refugo > 0 ? 'var(--abc-c)' : undefined}>{l.refugo > 0 ? formatQtd(l.refugo) : '—'}</Td>
                    <Td r forte cor={l.saldo > 0 ? 'var(--abc-a)' : 'var(--ink-muted)'}>{formatQtd(l.saldo)}</Td>
                    <Td r>{l.consumoPorTorre > 0 ? formatQtd(l.consumoPorTorre) : '—'}</Td>
                    <Td r>{l.demandaSubprojeto > 0 ? formatQtd(l.demandaSubprojeto) : '—'}</Td>
                    <Td
                      r
                      forte
                      cor={
                        l.torresCobertas === null ? 'var(--ink-muted)'
                          : l.torresCobertas === 0 ? 'var(--abc-c)'
                          : l.torresCobertas < torres ? 'var(--abc-b)'
                          : 'var(--abc-a)'
                      }
                    >
                      {l.torresCobertas === null ? '—' : formatInt(l.torresCobertas)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Linha({ rotulo, valor, destaque = false }: { rotulo: string; valor: string; destaque?: boolean }) {
  return (
    <div className="flex justify-between gap-2">
      <dt style={{ color: 'var(--ink-muted)' }}>{rotulo}</dt>
      <dd className={`tabular-nums ${destaque ? 'font-extrabold' : 'font-bold'}`} style={{ color: destaque ? 'var(--brand)' : 'var(--ink-secondary)' }}>{valor}</dd>
    </div>
  );
}

function Th({ children, r = false }: { children: React.ReactNode; r?: boolean }) {
  return <th className={`px-3 py-2 font-bold whitespace-nowrap ${r ? 'text-right' : 'text-left'}`} style={{ color: 'var(--ink-muted)' }}>{children}</th>;
}

function Td({ children, r = false, forte = false, cor }: { children: React.ReactNode; r?: boolean; forte?: boolean; cor?: string }) {
  return (
    <td
      className={`px-3 py-1.5 whitespace-nowrap ${r ? 'text-right tabular-nums' : ''} ${forte ? 'font-bold' : ''}`}
      style={{ color: cor ?? (forte ? 'var(--ink-primary)' : 'var(--ink-secondary)') }}
    >
      {children}
    </td>
  );
}
