/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Auditoria de Preços — as compras de 2026 contra o que o mesmo material custou
 * no passado, cada compra passada trazida a valor de hoje pelo IPCA.
 *
 * O produto desta tela é a LINHA, não o KPI. No agregado 2026 comprou
 * praticamente no preço histórico corrigido (−0,3% nas referências confiáveis);
 * o que rende auditoria são as compras individuais acima da faixa esperada. Por
 * isso a tabela domina, cada linha abre o histórico que formou a referência, e
 * os KPIs servem principalmente para dizer o quanto da base a análise cobre.
 *
 * Ver docs/superpowers/specs/2026-08-08-auditoria-precos-ipca-design.md.
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Scale, Search, Filter, RefreshCw, FileSpreadsheet, AlertCircle, ChevronRight,
  ShieldCheck, ShieldAlert, TrendingUp, TrendingDown, Boxes, Info, Clock, Layers,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { localDb } from '../../db/localDb';
import { AuditoriaCompra, AuditoriaHistoricoMaterial, VereditoCompra } from '../../types';
import { formatBRL, formatBRLCompacto, formatInt, formatQtd, formatDateBR, formatMesAno } from '../../lib/format';
import { normalizarCompra, resumirAuditoria } from '../../lib/auditoriaPrecos';
import KpiCard from '../charts/KpiCard';
import DispersaoPrecoChart from './DispersaoPrecoChart';
import MultiSelectFilter from '../ui/MultiSelectFilter';
import { TableShell, TableHeadRow, TableBody, Th, Tr, Td, TableSkeleton, TableEmpty } from '../ui/DataTable';

const PAGE_SIZE = 40;

type OrdemAuditoria = 'impacto' | 'desvio' | 'valor' | 'material';

const ORDENS: Array<{ id: OrdemAuditoria; label: string }> = [
  // Padrão: impacto = |Δ R$|. Ordenar por Δ% traria no topo a compra 300% cara
  // de R$ 40, que não é onde está o dinheiro.
  { id: 'impacto',  label: 'Maior impacto em R$' },
  { id: 'desvio',   label: 'Maior desvio %' },
  { id: 'valor',    label: 'Maior valor' },
  { id: 'material', label: 'Material' },
];

const CORES_VEREDITO: Record<VereditoCompra, { fg: string; bg: string }> = {
  'Bom':            { fg: 'var(--status-good)',     bg: 'color-mix(in srgb, var(--status-good) 12%, transparent)' },
  'Na faixa':       { fg: 'var(--ink-secondary)',   bg: 'color-mix(in srgb, var(--ink-muted) 10%, transparent)' },
  'Atenção':        { fg: 'var(--status-critical)', bg: 'color-mix(in srgb, var(--status-critical) 12%, transparent)' },
  'Sem referência': { fg: 'var(--ink-muted)',       bg: 'transparent' },
};

const Badge = ({ texto, fg, bg, titulo }: { texto: string; fg: string; bg: string; titulo?: string }) => (
  <span
    title={titulo}
    className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold whitespace-nowrap"
    style={{ color: fg, background: bg }}
  >
    {texto}
  </span>
);

/** Δ% com sinal e cor. Vermelho acima, verde abaixo — só quando há referência. */
const Delta = ({ pct }: { pct?: number | null }) => {
  if (pct == null || !Number.isFinite(pct)) return <span className="text-slate-400">—</span>;
  const acima = pct > 0;
  return (
    <span
      className="font-bold tabular-nums"
      style={{ color: acima ? 'var(--status-critical)' : 'var(--status-good)' }}
    >
      {acima ? '+' : ''}{(pct * 100).toFixed(1)}%
    </span>
  );
};

export default function AuditoriaPrecos() {
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [compras, setCompras] = useState<AuditoriaCompra[]>([]);

  const [busca, setBusca] = useState('');
  // Filtros em seleção múltipla (MultiSelectFilter): pílula compacta cujo painel
  // abre sobreposto ao resto da barra, em vez de <select> nativo esticando o
  // layout. Confiança começa pré-marcada em Alta+Média — o mesmo recorte que
  // antes era o valor padrão "Confiáveis" — e o usuário pode alargar ou
  // estreitar a partir daí.
  const [filtroConfianca, setFiltroConfianca] = useState<Set<string>>(() => new Set(['Alta', 'Média']));
  const [filtroVeredito, setFiltroVeredito] = useState<Set<string>>(() => new Set());
  const [filtroGrupo, setFiltroGrupo] = useState<Set<string>>(() => new Set());
  // Projeto (material de 18 dígitos iniciado em 100000000) e Consumo têm perfil
  // de gasto oposto — no recorte de 2026, Projeto é 3,5% das linhas e 39% do
  // valor. Analisá-los juntos distorce ticket médio e concentração.
  const [filtroTipo, setFiltroTipo] = useState<Set<string>>(() => new Set());
  // Isolar lote comparável é o que separa negociação de escala. Medido na base:
  // as compras de lote normal pagaram 8% acima da referência, enquanto 21
  // pedidos de lote grande pagaram 25% abaixo — no total as duas coisas se
  // cancelam e a auditoria parece neutra quando não é.
  const [filtroLote, setFiltroLote] = useState<Set<string>>(() => new Set());
  const [ordem, setOrdem] = useState<OrdemAuditoria>('impacto');
  const [visiveis, setVisiveis] = useState(PAGE_SIZE);

  // Drill-down: material expandido e o histórico já buscado (cache por sessão,
  // para reabrir a mesma linha não repetir a consulta).
  const [expandido, setExpandido] = useState<string | null>(null);
  const [historicos, setHistoricos] = useState<Record<string, AuditoriaHistoricoMaterial[] | 'carregando'>>({});

  const carregar = useCallback(async (force = false) => {
    setLoading(true);
    setErro(null);
    try {
      const linhas = await localDb.fetchAuditoriaCompras(force);
      setCompras(linhas.map(normalizarCompra));
      if (force) setHistoricos({}); // a referência mudou; o drill-down em cache envelheceu junto
    } catch (e) {
      console.error('Erro ao carregar a auditoria de preços:', e);
      setErro('Falha ao carregar a auditoria. Verifique se a view vw_auditoria_compras existe no banco.');
      setCompras([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(false); }, [carregar]);

  const alternarExpansao = async (material: string) => {
    if (expandido === material) { setExpandido(null); return; }
    setExpandido(material);
    if (historicos[material]) return;
    setHistoricos(h => ({ ...h, [material]: 'carregando' }));
    const linhas = await localDb.fetchAuditoriaHistoricoMaterial(material);
    setHistoricos(h => ({ ...h, [material]: linhas }));
  };

  const gruposOptions = useMemo(() => {
    const s = new Set<string>();
    compras.forEach(c => {
      const g = c.grp_mercads_desc || c.grp_mercads;
      if (g) s.add(g);
    });
    return Array.from(s).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [compras]);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    // Lote: seleção vazia ou as duas marcadas juntas equivalem a "todos" — só
    // restringe quando exatamente uma das duas opções está marcada.
    const loteExclusivo = filtroLote.size === 1;
    const quererAtipico = filtroLote.has('Atípico');

    return compras.filter(c => {
      if (filtroConfianca.size > 0 && !filtroConfianca.has(c.confianca)) return false;
      if (filtroVeredito.size > 0 && !filtroVeredito.has(c.veredito)) return false;
      if (filtroGrupo.size > 0 && !filtroGrupo.has(c.grp_mercads_desc || c.grp_mercads || '')) return false;
      if (filtroTipo.size > 0 && !filtroTipo.has(c.tipo_item || '')) return false;
      if (loteExclusivo && Boolean(c.lote_atipico) !== quererAtipico) return false;
      if (q) {
        const alvo = `${c.material} ${c.txt_breve || ''} ${c.fornecedor || ''} ${c.doc_compra || ''} ${c.rm || ''}`.toLowerCase();
        if (!alvo.includes(q)) return false;
      }
      return true;
    });
  }, [compras, busca, filtroConfianca, filtroVeredito, filtroGrupo, filtroTipo, filtroLote]);

  const ordenadas = useMemo(() => {
    const arr = [...filtradas];
    const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : -Infinity);
    arr.sort((a, b) => {
      switch (ordem) {
        // Impacto é o módulo do desvio em reais: a compra R$ 80 mil abaixo da
        // referência é tão digna de conferência quanto a R$ 80 mil acima — pode
        // ser produto diferente sob o mesmo código.
        case 'impacto':  return Math.abs(num(b.delta_valor)) - Math.abs(num(a.delta_valor));
        case 'desvio':   return num(b.delta_pct) - num(a.delta_pct);
        case 'valor':    return num(b.valor) - num(a.valor);
        case 'material': return String(a.material).localeCompare(String(b.material), 'pt-BR', { numeric: true });
        default:         return 0;
      }
    });
    return arr;
  }, [filtradas, ordem]);

  useEffect(() => { setVisiveis(PAGE_SIZE); }, [busca, filtroConfianca, filtroVeredito, filtroGrupo, filtroTipo, filtroLote, ordem]);

  // Dois resumos, de propósito.
  //
  // `resumoBase` descreve a QUALIDADE DA ANÁLISE (cobertura, valor sem
  // referência) e é sempre da base inteira: recalculá-lo dentro do filtro de
  // confiança daria sempre 100% — um número que se autoelogia.
  //
  // `resumoFiltrado` responde ao RECORTE, e é o que faz o filtro de lote valer
  // a pena: no total a auditoria parece neutra, mas isolando lote comparável o
  // desvio salta para +8%, porque 21 pedidos de lote grande com ganho de escala
  // estavam cancelando o sobrepreço de outras 223 compras.
  const resumoBase = useMemo(() => resumirAuditoria(compras), [compras]);
  const resumoFiltrado = useMemo(() => resumirAuditoria(filtradas), [filtradas]);
  const filtroAtivo = filtradas.length !== compras.length;
  const mesIpca = compras[0]?.ipca_mes_referencia;

  const exportar = () => {
    if (ordenadas.length === 0) return;
    const dados = ordenadas.map(c => ({
      'Material': c.material,
      'Descrição': c.txt_breve || '—',
      'Fornecedor': c.fornecedor || '—',
      'Grupo': c.grp_mercads_desc || c.grp_mercads || '—',
      'Natureza': c.tipo_item || '—',
      'Nº Pedido': c.doc_compra || '—',
      'RM': c.rm || '—',
      'Data': formatDateBR(c.data_doc),
      'Unidade': c.unidade || '—',
      'Quantidade': c.qtd,
      'Preço Unitário Pago': c.preco_unit,
      'Referência IPCA (mediana)': c.ref_p50 ?? '—',
      'Faixa P25': c.ref_p25 ?? '—',
      'Faixa P75': c.ref_p75 ?? '—',
      'Desvio %': c.delta_pct == null ? '—' : c.delta_pct,
      'Desvio R$': c.delta_valor ?? '—',
      'Valor da Compra': c.valor,
      'Veredito': c.veredito,
      'Confiança': c.confianca,
      'Compras Históricas': c.n_compras ?? '—',
      'Lote Atípico': c.lote_atipico ? 'Sim' : 'Não',
      'Pedido Parcial': c.pedido_parcial ? 'Sim' : 'Não',
      'IPCA até': mesIpca ? formatMesAno(mesIpca) : '—',
    }));
    const ws = XLSX.utils.json_to_sheet(dados);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Auditoria de Preços');
    XLSX.writeFile(wb, `auditoria_precos_${new Date().toISOString().replace(/[:.]/g, '-')}.xlsx`);
  };

  if (loading) return <TableSkeleton columns={9} />;

  if (erro) {
    return (
      <div
        className="flex items-center gap-3.5 p-5 border rounded-xl"
        style={{
          borderColor: 'var(--status-critical)',
          background: 'color-mix(in srgb, var(--status-critical) 8%, transparent)',
          color: 'var(--ink-primary)',
        }}
      >
        <AlertCircle className="h-6 w-6 shrink-0" style={{ color: 'var(--status-critical)' }} />
        <span className="text-sm font-medium">{erro}</span>
      </div>
    );
  }

  if (compras.length === 0) {
    return (
      <TableEmpty
        icon={Scale}
        title="Nenhuma compra para auditar"
        hint="Importe a base de pedidos (PEDIDOSFORN) em Cadastros SAP e garanta que a view vw_auditoria_compras existe no banco."
      />
    );
  }

  const economizou = resumoFiltrado.deltaValor < 0;

  return (
    <div className="space-y-5">
      {/* Método, em uma frase. Sem isso o usuário não sabe contra o que está
          comparando, e um número de auditoria que não diz sua própria base é
          um número que ninguém pode defender numa reunião. */}
      <div
        className="flex items-start gap-3 rounded-xl border p-4 text-xs leading-relaxed"
        style={{ background: 'var(--surface-card)', borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}
      >
        <Info className="h-4 w-4 shrink-0 mt-0.5" style={{ color: 'var(--brand)' }} />
        <p>
          Cada compra de 2026 é comparada à <strong>mediana do que o mesmo material custou até 2025</strong>,
          com cada compra passada corrigida pelo IPCA da sua data
          {mesIpca && <> até <strong>{formatMesAno(mesIpca)}</strong></>}.
          O IPCA mede inflação geral — vergalhão, cobre e frete seguem seus próprios mercados.
          Materiais com histórico disperso (códigos genéricos como transporte e serviços) recebem
          confiança <strong>Baixa</strong> e ficam fora dos totais. Pedidos com entrega ainda em
          andamento entram marcados como <strong>pedido parcial</strong> — o preço já é real, mas a
          quantidade final pode mudar até a entrega fechar.
        </p>
      </div>

      {/* KPIs. Cobertura vem primeiro de propósito: é a ressalva que qualifica
          todos os outros números. */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
        <KpiCard
          label="Cobertura da análise"
          value={resumoBase.coberturaValor * 100}
          format={v => `${v.toFixed(0)}%`}
          detail={`${formatBRLCompacto(resumoBase.valorSemReferencia)} sem histórico do material`}
          icon={ShieldCheck}
          accent="var(--brand)"
          share={resumoBase.coberturaValor}
        />
        <KpiCard
          label={economizou ? 'Abaixo da referência' : 'Acima da referência'}
          display={`${economizou ? '−' : '+'}${formatBRLCompacto(Math.abs(resumoFiltrado.deltaValor))}`}
          detail={
            resumoFiltrado.deltaPct == null
              ? 'Sem referência confiável no recorte'
              : `${(resumoFiltrado.deltaPct * 100).toFixed(1)}% sobre ${formatBRLCompacto(resumoFiltrado.valorReferencia)}`
              + ` · confiança Alta e Média${filtroAtivo ? ' · recorte filtrado' : ''}`
          }
          icon={economizou ? TrendingDown : TrendingUp}
          accent={economizou ? 'var(--status-good)' : 'var(--status-critical)'}
          emphasize
        />
        <KpiCard
          label="Acima da faixa"
          value={resumoFiltrado.acimaDaFaixa}
          format={v => formatInt(Math.round(v))}
          detail="compras acima do P75 histórico"
          icon={ShieldAlert}
          accent="var(--status-critical)"
        />
        <KpiCard
          label="Abaixo da faixa"
          value={resumoFiltrado.abaixoDaFaixa}
          format={v => formatInt(Math.round(v))}
          detail="compras abaixo do P25 — confira o item"
          icon={TrendingDown}
          accent="var(--status-good)"
        />
        <KpiCard
          label="Lotes atípicos"
          value={resumoBase.lotesAtipicos}
          format={v => formatInt(Math.round(v))}
          detail="filtre por lote comparável para separar escala de negociação"
          icon={Boxes}
          accent="var(--status-warning)"
          onClick={() => setFiltroLote(l =>
            l.size === 1 && l.has('Comparável') ? new Set() : new Set(['Comparável'])
          )}
        />
      </div>

      <DispersaoPrecoChart
        compras={filtradas}
        onSelecionar={c => c && alternarExpansao(c.material)}
      />

      {/* Filtros próprios da aba. Confiança, Veredito, Grupo e Lote usam o mesmo
          filtro de seleção múltipla do resto do app: pílula compacta que abre
          um painel sobreposto ao restante da barra, em vez de <select> nativo
          esticando o layout. */}
      <div className="rounded-xl border border-slate-250 dark:border-slate-850 bg-white dark:bg-slate-900 p-4 shadow-xs">
        <div className="flex flex-col xl:flex-row gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Busque por item, fornecedor, RM ou Nº do pedido..."
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 focus:outline-none transition-all"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <MultiSelectFilter
              label="Confiança"
              icon={ShieldCheck}
              options={['Alta', 'Média', 'Baixa', 'Sem referência']}
              selected={filtroConfianca}
              onChange={setFiltroConfianca}
              renderOption={v => (v === 'Baixa' ? 'Baixa (genéricos)' : v)}
              searchable={false}
              className="min-w-[132px]"
            />
            <MultiSelectFilter
              label="Veredito"
              icon={ShieldAlert}
              options={['Atenção', 'Na faixa', 'Bom', 'Sem referência']}
              selected={filtroVeredito}
              onChange={setFiltroVeredito}
              renderOption={v => (v === 'Atenção' ? 'Acima da faixa' : v === 'Bom' ? 'Abaixo da faixa' : v)}
              searchable={false}
              className="min-w-[130px]"
            />
            <MultiSelectFilter
              label="Grupo"
              icon={Filter}
              options={gruposOptions}
              selected={filtroGrupo}
              onChange={setFiltroGrupo}
              className="min-w-[120px]"
              // Descrições de grupo de mercadoria são longas ("ACOS, VERGALHOES
              // E...") — o painel abre mais largo que o gatilho para não
              // depender de quebra apertada numa coluna de 120px.
              panelClassName="w-[min(90vw,22rem)]"
            />
            <MultiSelectFilter
              label="Natureza"
              icon={Layers}
              options={['Consumo', 'Projeto']}
              selected={filtroTipo}
              onChange={setFiltroTipo}
              searchable={false}
              className="min-w-[120px]"
            />
            <MultiSelectFilter
              label="Lote"
              icon={Boxes}
              options={['Comparável', 'Atípico']}
              selected={filtroLote}
              onChange={setFiltroLote}
              searchable={false}
              className="min-w-[110px]"
            />
            <select
              value={ordem}
              onChange={e => setOrdem(e.target.value as OrdemAuditoria)}
              className="px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-bold text-slate-700 dark:text-slate-300 focus:border-emerald-500 focus:outline-none cursor-pointer"
            >
              {ORDENS.map(o => <option key={o.id} value={o.id}>Ordenar: {o.label}</option>)}
            </select>
            <button
              onClick={() => carregar(true)}
              className="flex items-center gap-1.5 px-2.5 py-2 border border-slate-200 dark:border-slate-850 hover:bg-slate-50 dark:hover:bg-slate-900 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-bold transition-all h-[34px] cursor-pointer"
              title="Rebaixa a auditoria e o IPCA mais recente"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Atualizar
            </button>
            {ordenadas.length > 0 && (
              <button
                onClick={exportar}
                className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all shadow-sm h-[34px] cursor-pointer active:scale-95"
              >
                <FileSpreadsheet className="h-4 w-4" /> Exportar
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-550 dark:text-slate-455 px-1 font-bold">
        <span>
          Exibindo {Math.min(visiveis, ordenadas.length)} de {formatInt(ordenadas.length)} compras
          {' '}· {formatInt(compras.length)} no total
        </span>
        {mesIpca && (
          <span className="flex items-center gap-1 font-medium text-slate-400 dark:text-slate-500">
            <Clock className="h-3 w-3" /> IPCA até {formatMesAno(mesIpca)}
          </span>
        )}
      </div>

      {ordenadas.length === 0 ? (
        <TableEmpty
          icon={Scale}
          title="Nenhuma compra no filtro selecionado"
          hint="Afrouxe o filtro de confiança ou de veredito."
        />
      ) : (
        <TableShell>
          <table className="w-full text-xs">
            <TableHeadRow>
              <Th label="" />
              <Th label="Material" />
              <Th label="Fornecedor" />
              <Th label="Data" />
              <Th label="Qtd" align="right" />
              <Th label="Preço pago" align="right" />
              <Th label="Referência (IPCA)" align="right" />
              <Th label="Faixa P25–P75" align="right" />
              <Th label="Desvio" align="right" />
              <Th label="Impacto R$" align="right" />
              <Th label="Veredito" />
            </TableHeadRow>
            <TableBody>
              {ordenadas.slice(0, visiveis).map((c, i) => {
                const chave = `${c.material}-${c.doc_compra}-${i}`;
                const aberto = expandido === c.material;
                const cores = CORES_VEREDITO[c.veredito];
                const historico = historicos[c.material];

                return (
                  <React.Fragment key={chave}>
                    <Tr onClick={() => alternarExpansao(c.material)}>
                      <Td>
                        <ChevronRight
                          className={`h-3.5 w-3.5 text-slate-400 transition-transform ${aberto ? 'rotate-90' : ''}`}
                        />
                      </Td>
                      <Td>
                        <div className="font-bold text-slate-800 dark:text-slate-100">{c.material}</div>
                        <div className="text-slate-500 dark:text-slate-400 truncate max-w-[220px]">{c.txt_breve || '—'}</div>
                      </Td>
                      <Td>
                        <div className="truncate max-w-[180px]">{c.fornecedor || '—'}</div>
                        <div className="text-slate-400 dark:text-slate-500">{c.doc_compra || '—'}</div>
                        {c.pedido_parcial && (
                          <div className="mt-0.5">
                            <Badge
                              texto="pedido parcial"
                              fg="var(--status-warning)"
                              bg="color-mix(in srgb, var(--status-warning) 12%, transparent)"
                              titulo="Entrega ainda não fechou no SAP — o preço já é real, mas a quantidade final pode mudar até a entrega concluir."
                            />
                          </div>
                        )}
                      </Td>
                      <Td>{formatDateBR(c.data_doc)}</Td>
                      <Td align="right">
                        <span className="tabular-nums">{formatQtd(c.qtd)}</span>
                        {c.lote_atipico && (
                          <div className="mt-0.5">
                            <Badge
                              texto="lote atípico"
                              fg="var(--status-warning)"
                              bg="color-mix(in srgb, var(--status-warning) 12%, transparent)"
                              titulo={`Quantidade fora do padrão do material (mediana ${formatQtd(c.qtd_mediana)}). Preço unitário de lote grande cai por escala, não necessariamente por negociação.`}
                            />
                          </div>
                        )}
                      </Td>
                      <Td align="right"><span className="tabular-nums font-bold">{formatBRL(c.preco_unit)}</span></Td>
                      <Td align="right"><span className="tabular-nums">{formatBRL(c.ref_p50)}</span></Td>
                      <Td align="right">
                        <span className="tabular-nums text-slate-500 dark:text-slate-400">
                          {c.ref_p25 == null ? '—' : `${formatBRL(c.ref_p25)} – ${formatBRL(c.ref_p75)}`}
                        </span>
                      </Td>
                      <Td align="right"><Delta pct={c.delta_pct} /></Td>
                      <Td align="right">
                        <span className="tabular-nums">
                          {c.delta_valor == null ? '—' : formatBRLCompacto(c.delta_valor)}
                        </span>
                      </Td>
                      <Td>
                        <div className="flex flex-col gap-1 items-start">
                          <Badge texto={c.veredito} fg={cores.fg} bg={cores.bg} />
                          <Badge
                            texto={c.confianca === 'Sem referência' ? 'sem histórico' : `conf. ${c.confianca.toLowerCase()}`}
                            fg="var(--ink-muted)"
                            bg="color-mix(in srgb, var(--ink-muted) 8%, transparent)"
                            titulo={
                              c.n_compras
                                ? `${c.n_compras} compra(s) histórica(s) entre ${formatDateBR(c.primeira_compra)} e ${formatDateBR(c.ultima_compra)}.`
                                : 'Material sem compra anterior a 2026.'
                            }
                          />
                        </div>
                      </Td>
                    </Tr>

                    {aberto && (
                      <tr>
                        <td colSpan={11} className="p-0">
                          <div className="px-6 py-4 bg-slate-50/70 dark:bg-slate-950/60 border-y border-slate-150 dark:border-slate-850">
                            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2.5">
                              Compras anteriores de {c.material} — o que formou a referência
                            </p>
                            {historico === 'carregando' && (
                              <p className="text-xs text-slate-400">Carregando histórico...</p>
                            )}
                            {historico === undefined && (
                              <p className="text-xs text-slate-400">Carregando histórico...</p>
                            )}
                            {Array.isArray(historico) && historico.length === 0 && (
                              <p className="text-xs text-slate-500 dark:text-slate-400">
                                Nenhuma compra anterior a 2026 para este material — não há referência a conferir.
                              </p>
                            )}
                            {Array.isArray(historico) && historico.length > 0 && (
                              <div className="overflow-x-auto">
                                <table className="w-full text-[11px]">
                                  <thead>
                                    <tr className="text-slate-500 dark:text-slate-400 text-left">
                                      <th className="py-1.5 pr-4 font-bold">Data</th>
                                      <th className="py-1.5 pr-4 font-bold">Fornecedor</th>
                                      <th className="py-1.5 pr-4 font-bold">Pedido</th>
                                      <th className="py-1.5 pr-4 font-bold text-right">Qtd</th>
                                      <th className="py-1.5 pr-4 font-bold text-right">Preço da época</th>
                                      <th className="py-1.5 pr-4 font-bold text-right">Fator IPCA</th>
                                      <th className="py-1.5 font-bold text-right">Preço corrigido</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {historico.map((h, j) => (
                                      <tr
                                        key={`${h.doc_compra}-${j}`}
                                        className="border-t border-slate-150 dark:border-slate-850 text-slate-700 dark:text-slate-300"
                                      >
                                        <td className="py-1.5 pr-4 whitespace-nowrap">{formatDateBR(h.data_doc)}</td>
                                        <td className="py-1.5 pr-4 truncate max-w-[200px]">{h.fornecedor || '—'}</td>
                                        <td className="py-1.5 pr-4">{h.doc_compra || '—'}</td>
                                        <td className="py-1.5 pr-4 text-right tabular-nums">{formatQtd(h.qtd)}</td>
                                        <td className="py-1.5 pr-4 text-right tabular-nums">{formatBRL(h.preco_unit)}</td>
                                        <td className="py-1.5 pr-4 text-right tabular-nums text-slate-400">
                                          ×{Number(h.fator_ipca).toFixed(3)}
                                        </td>
                                        <td className="py-1.5 text-right tabular-nums font-bold">{formatBRL(h.preco_corrigido)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                                <p className="mt-2.5 text-[11px] text-slate-500 dark:text-slate-400">
                                  Mediana das {formatInt(historico.length)} compras corrigidas: <strong>{formatBRL(c.ref_p50)}</strong>
                                  {' '}· compra de 2026: <strong>{formatBRL(c.preco_unit)}</strong>
                                </p>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </TableBody>
          </table>
        </TableShell>
      )}

      {visiveis < ordenadas.length && (
        <div className="flex justify-center">
          <button
            onClick={() => setVisiveis(v => v + PAGE_SIZE)}
            className="px-5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-850 hover:bg-slate-50 dark:hover:bg-slate-900 text-slate-700 dark:text-slate-300 text-xs font-bold transition-all cursor-pointer"
          >
            Carregar mais {Math.min(PAGE_SIZE, ordenadas.length - visiveis)}
          </button>
        </div>
      )}
    </div>
  );
}
