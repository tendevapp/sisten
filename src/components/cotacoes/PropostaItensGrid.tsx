/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Grade editável dos itens de uma proposta. Edição é um <input> puro dentro
 * da célula — sem framework de célula, no mesmo estilo de edição inline já
 * usado em Compras.tsx. Uma coluna própria (VinculoCell) resolve o
 * vínculo com o item de RM: mostra a sugestão, o score, e um dropdown com
 * todos os itens do escopo + "fora do escopo" e "desconsiderar" para sempre
 * permitir override.
 *
 * As três resoluções possíveis do vínculo não são sinônimos:
 * - um item do escopo   — o preço vai para aquela linha do mapa;
 * - "fora do escopo"    — cotado, ninguém pediu nesta RM, mas segue no mapa
 *                         (é o excedente que o comprador pode querer levar);
 * - "desconsiderar"     — some do mapa e do pedido. Brinde, linha de serviço,
 *                         item que a IA quebrou em dois: ruído que não deve
 *                         disputar preço com material de verdade.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Ban, ChevronDown, LinkIcon, Search } from 'lucide-react';
import { TableShell, TableHeadRow, Th, TableBody, Tr, Td } from '../ui/DataTable';
import { formatBRL } from '../../lib/format';
import type { CotacaoProcessoItem, CotacaoPropostaItemDraft } from '../../types';

type CampoNumerico = 'quantidade' | 'preco_unitario' | 'preco_total_item' | 'aliquota_icms_pct' | 'aliquota_pis_pct' | 'aliquota_cofins_pct' | 'aliquota_ipi_pct';
type CampoTexto = 'codigo_produto' | 'descricao_produto' | 'marca_fabricante' | 'unidade_medida' | 'ncm' | 'cst' | 'cfop';

interface PropostaItensGridProps {
  itens: CotacaoPropostaItemDraft[];
  escopo: CotacaoProcessoItem[];
  camposFaltantesPorItem: (item: CotacaoPropostaItemDraft) => Set<string>;
  onChangeItem: (key: string, patch: Partial<CotacaoPropostaItemDraft>) => void;
}

/** Por que a célula de frete teórico está vazia — a causa muda o que o comprador tem que fazer. */
function freteTitulo(item: CotacaoPropostaItemDraft): string {
  if (item.desconsiderado) return 'Item desconsiderado — não entra na carga.';
  if (item.frete_teorico != null) return 'Parcela do frete simulado pela tabela da Bahia Sul, rateada por peso.';
  if (item.peso_unitario_kg == null) return 'Sem peso estimado: informe o peso para o frete ser simulado.';
  return 'Frete teórico só é simulado em proposta FOB com rota na tabela da Bahia Sul.';
}

function InputTexto({ value, onChange, faltando, className = '' }: { value: string | null; onChange: (v: string) => void; faltando?: boolean; className?: string }) {
  return (
    <input
      value={value ?? ''}
      onChange={e => onChange(e.target.value)}
      className={`w-full min-w-[6rem] rounded border bg-transparent px-1.5 py-1 text-xs outline-none focus:border-indigo-500 ${
        faltando ? 'border-rose-300 dark:border-rose-800' : 'border-transparent hover:border-slate-200 dark:hover:border-slate-700'
      } ${className}`}
    />
  );
}

function InputNumero({ value, onChange, faltando, decimais = 2 }: { value: number | null; onChange: (v: number | null) => void; faltando?: boolean; decimais?: number }) {
  const [texto, setTexto] = useState(value != null ? String(value) : '');
  React.useEffect(() => { setTexto(value != null ? String(value) : ''); }, [value]);

  return (
    <input
      value={texto}
      onChange={e => setTexto(e.target.value)}
      onBlur={() => {
        const n = texto.trim() === '' ? null : Number(texto.replace(',', '.'));
        onChange(n != null && Number.isFinite(n) ? Number(n.toFixed(decimais)) : null);
      }}
      className={`w-full min-w-[4.5rem] rounded border bg-transparent px-1.5 py-1 text-right text-xs tabular-nums outline-none focus:border-indigo-500 ${
        faltando ? 'border-rose-300 dark:border-rose-800' : 'border-transparent hover:border-slate-200 dark:hover:border-slate-700'
      }`}
    />
  );
}

function VinculoCell({ item, escopo, onResolver }: {
  item: CotacaoPropostaItemDraft;
  escopo: CotacaoProcessoItem[];
  onResolver: (patch: Partial<CotacaoPropostaItemDraft>) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [abrirParaCima, setAbrirParaCima] = useState(false);
  const [filtro, setFiltro] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const escopoItem = item.processo_item_id ? escopo.find(e => e.id === item.processo_item_id) : null;

  useEffect(() => {
    if (!aberto) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setAberto(false);
        setFiltro('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [aberto]);

  const escopoFiltrado = useMemo(() => {
    const termo = filtro.trim().toLowerCase();
    if (!termo) return escopo;
    return escopo.filter(e =>
      (e.texto_breve ?? '').toLowerCase().includes(termo) ||
      (e.ri ?? '').toLowerCase().includes(termo) ||
      (e.material_code ?? '').toLowerCase().includes(termo)
    );
  }, [escopo, filtro]);

  const resolvido = escopoItem || item.fora_escopo || item.desconsiderado;
  const scoreClasses = item.vinculo_origem === 'aprendido'
    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
    : item.vinculo_origem === 'ia'
      ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300'
      : item.vinculo_origem === 'sugerido'
        ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
        : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400';

  const fechar = () => { setAberto(false); setFiltro(''); };

  const handleToggle = () => {
    if (!aberto && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const espacoAbaixo = window.innerHeight - rect.bottom;
      setAbrirParaCima(espacoAbaixo < 290 && rect.top > 290);
    }
    setAberto(v => !v);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={handleToggle}
        className={`flex w-full items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-left text-xs transition-colors ${
          resolvido
            ? 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600'
            : 'border-rose-300 bg-rose-50 hover:bg-rose-100/60 dark:border-rose-800 dark:bg-rose-950/30'
        }`}
      >
        {item.desconsiderado
          ? <Ban className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          : <LinkIcon className="h-3.5 w-3.5 shrink-0 text-slate-400" />}
        <span className="min-w-0 flex-1 truncate font-medium">
          {item.desconsiderado
            ? 'Desconsiderado'
            : escopoItem ? (escopoItem.texto_breve || escopoItem.ri) : item.fora_escopo ? 'Fora do escopo' : 'Vincular'}
        </span>
        {item.vinculo_divergencias.length > 0 && !item.desconsiderado && (
          <span
            title={['Confira antes de salvar:', ...item.vinculo_divergencias.map(d => `· ${d}`)].join('\n')}
            className="inline-flex shrink-0 items-center gap-0.5 rounded bg-amber-100 px-1 text-[10px] font-semibold text-amber-700 dark:bg-amber-950/50 dark:text-amber-300"
          >
            <AlertTriangle className="h-3 w-3" />
            {item.vinculo_divergencias.length}
          </span>
        )}
        {item.vinculo_origem !== 'manual' && item.vinculo_score != null && (
          <span
            title={item.vinculo_origem === 'ia' ? 'Vínculo sugerido pela IA que leu a proposta' : undefined}
            className={`shrink-0 rounded px-1 text-[10px] font-semibold ${scoreClasses}`}
          >
            {item.vinculo_origem === 'ia' ? 'IA ' : ''}{Math.round(item.vinculo_score * 100)}%
          </span>
        )}
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${aberto ? 'rotate-180' : ''}`} />
      </button>

      {aberto && (
        <div
          className={`absolute z-30 w-96 max-w-[90vw] overflow-hidden rounded-xl border border-slate-200 bg-white text-xs shadow-xl dark:border-slate-700 dark:bg-slate-900 ${
            abrirParaCima ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
          }`}
        >
          {escopo.length > 5 && (
            <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50">
              <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              <input
                autoFocus
                value={filtro}
                onChange={e => setFiltro(e.target.value)}
                placeholder="Buscar por RI, código ou descrição..."
                className="w-full bg-transparent text-xs outline-none placeholder:text-slate-400 text-slate-800 dark:text-slate-100"
              />
            </div>
          )}
          <div className="max-h-64 overflow-auto divide-y divide-slate-100 dark:divide-slate-800/60">
            {escopoFiltrado.length === 0 ? (
              <p className="px-3 py-3 text-slate-400 text-center">Nenhum item do escopo bate com "{filtro}".</p>
            ) : (
              escopoFiltrado.map(e => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => {
                    onResolver({
                      processo_item_id: e.id,
                      ri: e.ri,
                      material_code: e.material_code,
                      fora_escopo: false,
                      desconsiderado: false,
                      vinculo_origem: 'manual',
                      vinculo_score: null,
                    });
                    fechar();
                  }}
                  className={`block w-full px-3 py-2 text-left hover:bg-indigo-50/70 dark:hover:bg-indigo-950/40 transition-colors ${
                    e.id === item.processo_item_id ? 'bg-indigo-50 dark:bg-indigo-950/30' : ''
                  }`}
                >
                  <div className="font-semibold text-slate-800 dark:text-slate-100 leading-snug">{e.texto_breve || '—'}</div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-2">
                    <span className="font-mono font-medium">RI: {e.ri}</span>
                    <span>·</span>
                    <span>Cód: {e.material_code || 'sem código'}</span>
                  </div>
                </button>
              ))
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              onResolver({
                processo_item_id: null,
                ri: null,
                material_code: null,
                fora_escopo: true,
                desconsiderado: false,
                vinculo_origem: 'manual',
                vinculo_score: null,
              });
              fechar();
            }}
            className="block w-full border-t border-slate-200 dark:border-slate-800 px-3 py-2.5 text-left font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors"
          >
            ✕ Fora do escopo (não pedido nesta RM, mas continua no mapa)
          </button>
          <button
            type="button"
            onClick={() => {
              onResolver({
                processo_item_id: null,
                ri: null,
                material_code: null,
                fora_escopo: false,
                desconsiderado: !item.desconsiderado,
                vinculo_origem: 'manual',
                vinculo_score: null,
                vinculo_divergencias: [],
                frete_teorico: null,
              });
              fechar();
            }}
            className="flex w-full items-center gap-1.5 border-t border-slate-200 px-3 py-2.5 text-left font-medium text-rose-600 transition-colors hover:bg-rose-50 dark:border-slate-800 dark:text-rose-400 dark:hover:bg-rose-950/30"
          >
            <Ban className="h-3.5 w-3.5 shrink-0" />
            {item.desconsiderado
              ? 'Voltar a considerar este item'
              : 'Desconsiderar (não entra no mapa de cotação)'}
          </button>
        </div>
      )}
    </div>
  );
}

export default function PropostaItensGrid({ itens, escopo, camposFaltantesPorItem, onChangeItem }: PropostaItensGridProps) {
  const campoTexto = (item: CotacaoPropostaItemDraft, campo: CampoTexto) =>
    (v: string) => onChangeItem(item._key, { [campo]: v || null } as Partial<CotacaoPropostaItemDraft>);
  const campoNumero = (item: CotacaoPropostaItemDraft, campo: CampoNumerico) =>
    (v: number | null) => onChangeItem(item._key, { [campo]: v } as Partial<CotacaoPropostaItemDraft>);

  return (
    <TableShell maxHeight="34rem" minHeight="24rem">
      <table className="w-full text-xs">
        <TableHeadRow>
          <Th label="#" width="w-10" />
          <Th label="Vínculo (ri)" width="w-80" stickyLeft />
          <Th label="Código" />
          <Th label="Descrição" width="w-72" />
          <Th label="Marca" />
          <Th label="UM" />
          <Th label="Qtd." align="right" />
          <Th label="Unit." align="right" />
          <Th label="Total" align="right" />
          <Th label="NCM" />
          <Th label="CST" />
          <Th label="CFOP" />
          <Th label="ICMS%" align="right" />
          <Th label="PIS%" align="right" />
          <Th label="COFINS%" align="right" />
          <Th label="IPI%" align="right" />
          <Th label="Peso un. (kg)" align="right" />
          <Th label="Frete teór." align="right" />
        </TableHeadRow>
        <TableBody>
          {itens.map((item, i) => {
            const faltantes = camposFaltantesPorItem(item);
            const bloqueado = !item.desconsiderado
              && (!item.descricao_produto || item.quantidade == null || item.preco_unitario == null || (!item.processo_item_id && !item.fora_escopo));
            return (
              <Tr key={item._key} accent={bloqueado ? 'var(--danger, #f43f5e)' : undefined} className={item.desconsiderado ? 'opacity-45' : undefined}>
                <Td numeric>{item.item_numero ?? i + 1}</Td>
                <Td>
                  <VinculoCell item={item} escopo={escopo} onResolver={patch => onChangeItem(item._key, patch)} />
                </Td>
                <Td><InputTexto value={item.codigo_produto} onChange={campoTexto(item, 'codigo_produto')} /></Td>
                <Td><InputTexto value={item.descricao_produto} onChange={campoTexto(item, 'descricao_produto')} faltando={faltantes.has('descricao_produto')} className="min-w-[16rem]" /></Td>
                <Td><InputTexto value={item.marca_fabricante} onChange={campoTexto(item, 'marca_fabricante')} /></Td>
                <Td><InputTexto value={item.unidade_medida} onChange={campoTexto(item, 'unidade_medida')} faltando={faltantes.has('unidade_medida')} /></Td>
                <Td numeric><InputNumero value={item.quantidade} onChange={campoNumero(item, 'quantidade')} faltando={faltantes.has('quantidade')} decimais={4} /></Td>
                <Td numeric><InputNumero value={item.preco_unitario} onChange={campoNumero(item, 'preco_unitario')} faltando={faltantes.has('preco_unitario')} decimais={6} /></Td>
                <Td numeric><InputNumero value={item.preco_total_item} onChange={campoNumero(item, 'preco_total_item')} faltando={faltantes.has('preco_total_item')} /></Td>
                <Td><InputTexto value={item.ncm} onChange={campoTexto(item, 'ncm')} faltando={faltantes.has('ncm')} /></Td>
                <Td><InputTexto value={item.cst} onChange={campoTexto(item, 'cst')} /></Td>
                <Td><InputTexto value={item.cfop} onChange={campoTexto(item, 'cfop')} /></Td>
                <Td numeric><InputNumero value={item.aliquota_icms_pct} onChange={campoNumero(item, 'aliquota_icms_pct')} faltando={faltantes.has('aliquota_icms_pct')} /></Td>
                <Td numeric><InputNumero value={item.aliquota_pis_pct} onChange={campoNumero(item, 'aliquota_pis_pct')} /></Td>
                <Td numeric><InputNumero value={item.aliquota_cofins_pct} onChange={campoNumero(item, 'aliquota_cofins_pct')} /></Td>
                <Td numeric><InputNumero value={item.aliquota_ipi_pct} onChange={campoNumero(item, 'aliquota_ipi_pct')} /></Td>
                <Td numeric>
                  <div className="flex items-center justify-end gap-1">
                    <InputNumero
                      value={item.peso_unitario_kg}
                      onChange={v => onChangeItem(item._key, { peso_unitario_kg: v, peso_origem: v == null ? null : 'manual' })}
                      decimais={4}
                    />
                    {item.peso_origem === 'ia' && (
                      <span
                        title="Peso estimado pela IA a partir da descrição — ajuste se souber o valor real"
                        className="shrink-0 rounded bg-indigo-50 px-1 text-[10px] font-semibold text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-300"
                      >
                        IA
                      </span>
                    )}
                  </div>
                </Td>
                <Td numeric>
                  <span
                    title={freteTitulo(item)}
                    className="block px-1.5 py-1 text-right text-xs tabular-nums text-slate-500 dark:text-slate-400"
                  >
                    {item.frete_teorico != null ? formatBRL(item.frete_teorico) : '—'}
                  </span>
                </Td>
              </Tr>
            );
          })}
        </TableBody>
      </table>
    </TableShell>
  );
}
