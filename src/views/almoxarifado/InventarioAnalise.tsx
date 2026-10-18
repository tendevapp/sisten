/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Almoxarifado > Análise de Inventário Cíclico.
 *
 * Painel sobre os inventários já gravados: acuracidade, onde o estoque erra,
 * quanto vale o erro, itens que reincidem e quanto da ZL0024 já foi contado.
 * As regras estão em `lib/inventarioAnalise.ts`; a contagem em si continua no
 * formulário (FRM.ALM-0015), de onde esta tela só lê.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, ArrowLeft, ClipboardCheck, DollarSign, Download, Filter, GraduationCap, Package, Percent, RefreshCw, Repeat, Target, X,
} from 'lucide-react';
import { localDb } from '../../db/localDb';
import type { EstoqueItem, Profile } from '../../types';
import { formatBRL, formatBRLCompacto, formatDeposito, formatQtd } from '../../lib/almoxarifado';
import { formatDateBR, formatInt } from '../../lib/format';
import { hojeISO } from '../../lib/recebimentoAlmox';
import { listarInventarios, type InventarioRow } from '../../lib/inventarioCiclicoApi';
import {
  ROTULO_STATUS_ITEM, chaveItem, diasEntre, historicoPorItem,
} from '../../lib/inventarioCiclico';
import {
  FILTRO_VAZIO, ROTULO_FAIXA_IDADE, ROTULO_ORIGEM, SEM_CLASSE, aplicarFiltro, coberturaAnalise, conferidosComDiferenca,
  faixaDeIdade, linhasAnalise, maioresDivergencias, porClasse, porDeposito, porDia, precosPorMaterial, reincidentes,
  resumirAnalise,
  type FaixaIdade, type FiltroAnalise, type LinhaAnalise, type OrigemInventario,
} from '../../lib/inventarioAnalise';
import { exportarPlanilhaAnalise } from '../../lib/inventarioAnalisePlanilha';
import { useToast } from '../../components/ui/Toast';
import KpiCard from '../../components/charts/KpiCard';
import ChartCard from '../../components/charts/ChartCard';
import ComposicaoModal, {
  type ComposicaoColuna, type ComposicaoFiltro, type ComposicaoModalConfig,
} from '../../components/charts/ComposicaoModal';
import {
  AcuraciaPorGrupoChart, EvolucaoDiariaChart, IdadeContagemChart,
} from '../../components/almoxarifado/inventarioAnalise/InventarioAnaliseGraficos';
import {
  TableBody, TableCardRow, TableCards, TableDesktop, TableEmpty, TableHeadRow, TableShell, Td, Th, Tr,
} from '../../components/ui/DataTable';
import { canAccessPage } from '../../lib/pages';

interface Props {
  user: Profile;
  onNavigate: (path: string) => void;
}

interface ItemIdadeEstoque {
  chave: string;
  material: string;
  descricao: string;
  deposito: string;
  saldo: number;
  unidade: string;
  valorEstoque: number;
  faixa: FaixaIdade;
  faixaRotulo: string;
  ultimaData: string | null;
  diasSemContagem: number | null;
  vezesContado: number;
  jaDivergiu: boolean;
}

const pct = (v: number | null | undefined) => (v == null ? '—' : `${v.toFixed(1).replace('.', ',')}%`);

const selectCls =
  'rounded-lg border px-3 py-2 text-sm font-semibold cursor-pointer focus:outline-2 focus:outline-offset-1 focus:outline-[var(--brand)]';
const selectStyle: React.CSSProperties = {
  borderColor: 'var(--hairline)', background: 'var(--surface-raised)', color: 'var(--ink-primary)',
};

const rotuloClasse = (chave: string) => (chave === SEM_CLASSE ? SEM_CLASSE : `Classe ${chave}`);

/** Diferença com sinal: falta em vermelho, sobra em âmbar. */
function Diferenca({ valor }: { valor: number | null }) {
  if (valor === null) return <span style={{ color: 'var(--ink-muted)' }}>—</span>;
  const cor = valor < 0 ? 'var(--status-critical)' : valor > 0 ? 'var(--status-warning)' : 'var(--ink-muted)';
  return <span className="font-bold tabular" style={{ color: cor }}>{valor > 0 ? '+' : ''}{formatQtd(valor)}</span>;
}

function Valor({ linha }: { linha: LinhaAnalise }) {
  if (linha.valor === null) return <span style={{ color: 'var(--ink-muted)' }}>—</span>;
  return (
    <span
      className="font-bold tabular"
      title={linha.valorEstimado ? 'Estimado: diferença × preço médio atual da ZL0024' : 'Valor da planilha de inventário'}
    >
      {linha.valorEstimado && '≈ '}{formatBRL(linha.valor)}
    </span>
  );
}

export default function InventarioAnalise({ user, onNavigate }: Props) {
  const toast = useToast();
  const [inventarios, setInventarios] = useState<InventarioRow[]>([]);
  const [estoque, setEstoque] = useState<EstoqueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<FiltroAnalise>(FILTRO_VAZIO);
  const [modalComposicao, setModalComposicao] = useState<ComposicaoModalConfig<any> | null>(null);

  const carregar = useCallback(async (forcar = false) => {
    setLoading(true);
    setErro(null);
    try {
      const [lista, est] = await Promise.all([
        listarInventarios(1000),
        localDb.fetchEstoque(forcar).catch(() => [] as EstoqueItem[]),
      ]);
      setInventarios(lista);
      setEstoque(est);
    } catch (err: any) {
      setErro(err?.message || 'Não foi possível carregar os inventários.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);

  const precos = useMemo(() => precosPorMaterial(estoque), [estoque]);
  const todas = useMemo(() => linhasAnalise(inventarios, precos), [inventarios, precos]);
  const linhas = useMemo(() => aplicarFiltro(todas, filtro), [todas, filtro]);

  const depositosDisponiveis = useMemo(() => [...new Set(todas.map((l) => l.deposito))].sort(), [todas]);
  const classesDisponiveis = useMemo(() => {
    const set = new Set(todas.map((l) => l.classe));
    return ['A', 'B', 'C', SEM_CLASSE].filter((c) => set.has(c));
  }, [todas]);
  const origensDisponiveis = useMemo(() => [...new Set(todas.map((l) => l.origem))], [todas]);

  const resumo = useMemo(() => resumirAnalise(linhas), [linhas]);
  const dias = useMemo(() => porDia(linhas), [linhas]);
  const depositos = useMemo(() => porDeposito(linhas), [linhas]);
  const classes = useMemo(() => porClasse(linhas), [linhas]);
  const piores = useMemo(() => maioresDivergencias(linhas, 15), [linhas]);
  const toleradas = useMemo(() => conferidosComDiferenca(linhas, 15), [linhas]);
  const reincidencias = useMemo(() => reincidentes(linhas).slice(0, 15), [linhas]);
  const cobertura = useMemo(
    () => coberturaAnalise(estoque, inventarios, hojeISO(), filtro.depositos),
    [estoque, inventarios, filtro.depositos],
  );

  const itensComIdade = useMemo<ItemIdadeEstoque[]>(() => {
    const historico = historicoPorItem(inventarios);
    const result: ItemIdadeEstoque[] = [];
    const hoje = hojeISO();
    for (const e of estoque) {
      if (!e.material || !e.deposito) continue;
      const dep = String(e.deposito).trim().padStart(4, '0');
      if (filtro.depositos.length > 0 && !filtro.depositos.includes(dep)) continue;
      const mat = String(e.material).trim();
      const chave = chaveItem(mat, dep);
      const h = historico.get(chave);
      const diasSemContagem = h ? diasEntre(h.ultimaData, hoje) : null;
      const f = faixaDeIdade(diasSemContagem);
      result.push({
        chave,
        material: mat,
        descricao: e.texto_breve_material || e.descricao || '',
        deposito: dep,
        saldo: Number(e.quantidade) || 0,
        unidade: e.unidade_medida_basica || 'UN',
        valorEstoque: Number(e.valor_total) || 0,
        faixa: f,
        faixaRotulo: ROTULO_FAIXA_IDADE[f],
        ultimaData: h?.ultimaData ?? null,
        diasSemContagem,
        vezesContado: h?.vezes ?? 0,
        jaDivergiu: h?.jaDivergiu ?? false,
      });
    }
    return result;
  }, [estoque, inventarios, filtro.depositos]);

  const colunasLinhaAnalise: ComposicaoColuna<LinhaAnalise>[] = useMemo(() => [
    {
      header: 'Data',
      render: (l) => formatDateBR(l.data),
      width: 'w-24',
    },
    {
      header: 'Inventário',
      render: (l) => <span className="font-mono text-xs">{l.inventario}</span>,
      width: 'w-28',
    },
    {
      header: 'Material / Descrição',
      render: (l) => (
        <div>
          <span className="font-mono font-bold block" style={{ color: 'var(--ink-primary)' }}>{l.material}</span>
          <span className="text-[11px] block truncate max-w-[280px]" title={l.descricao}>{l.descricao || '—'}</span>
        </div>
      ),
    },
    {
      header: 'Depósito',
      render: (l) => formatDeposito(l.deposito),
      width: 'w-24',
    },
    {
      header: 'Classe',
      render: (l) => rotuloClasse(l.classe),
      width: 'w-20',
    },
    {
      header: 'Situação',
      render: (l) => {
        const isOk = l.status === 'conferido';
        const isDiv = l.status === 'divergente';
        return (
          <span
            className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap"
            style={{
              background: isOk
                ? 'color-mix(in srgb, var(--status-good) 16%, transparent)'
                : isDiv
                ? 'color-mix(in srgb, var(--status-critical) 16%, transparent)'
                : 'var(--surface-sunken)',
              color: isOk ? 'var(--status-good)' : isDiv ? 'var(--status-critical)' : 'var(--ink-secondary)',
            }}
          >
            {ROTULO_STATUS_ITEM[l.status] || l.status}
          </span>
        );
      },
      width: 'w-24',
    },
    {
      header: 'Saldo ZL0024',
      align: 'right',
      render: (l) => (l.saldo !== null ? formatQtd(l.saldo) : '—'),
      width: 'w-24',
    },
    {
      header: 'Contado',
      align: 'right',
      render: (l) => (l.contado !== null ? formatQtd(l.contado) : '—'),
      width: 'w-24',
    },
    {
      header: 'Diferença',
      align: 'right',
      render: (l) => <Diferenca valor={l.diferenca} />,
      width: 'w-24',
    },
    {
      header: 'Valor do Erro',
      align: 'right',
      render: (l) => <Valor linha={l} />,
      width: 'w-28',
    },
    {
      header: 'Contagens',
      align: 'right',
      render: (l) => l.contagens,
      width: 'w-20',
    },
  ], []);

  const filtrosLinhaAnalise: ComposicaoFiltro<LinhaAnalise>[] = useMemo(() => [
    {
      key: 'status',
      label: 'Situação',
      valueOf: (l) => ROTULO_STATUS_ITEM[l.status] || l.status,
    },
    {
      key: 'deposito',
      label: 'Depósito',
      valueOf: (l) => formatDeposito(l.deposito),
    },
    {
      key: 'classe',
      label: 'Classe',
      valueOf: (l) => rotuloClasse(l.classe),
    },
  ], []);

  const colunasIdadeEstoque: ComposicaoColuna<ItemIdadeEstoque>[] = useMemo(() => [
    {
      header: 'Material / Descrição',
      render: (i) => (
        <div>
          <span className="font-mono font-bold block" style={{ color: 'var(--ink-primary)' }}>{i.material}</span>
          <span className="text-[11px] block truncate max-w-[320px]" title={i.descricao}>{i.descricao || '—'}</span>
        </div>
      ),
    },
    {
      header: 'Depósito',
      render: (i) => formatDeposito(i.deposito),
      width: 'w-24',
    },
    {
      header: 'Saldo em Estoque',
      align: 'right',
      render: (i) => `${formatQtd(i.saldo)} ${i.unidade}`,
      width: 'w-28',
    },
    {
      header: 'Valor em Estoque',
      align: 'right',
      render: (i) => (
        <span className="font-bold tabular" style={{ color: 'var(--ink-primary)' }}>
          {formatBRL(i.valorEstoque)}
        </span>
      ),
      width: 'w-28',
    },
    {
      header: 'Última Contagem',
      render: (i) => (
        <span style={{ color: i.ultimaData ? 'var(--ink-primary)' : 'var(--ink-muted)' }}>
          {i.ultimaData ? formatDateBR(i.ultimaData) : 'Nunca contado'}
        </span>
      ),
      width: 'w-28',
    },
    {
      header: 'Tempo sem Contar',
      align: 'right',
      render: (i) => (
        <span className="tabular font-medium" style={{ color: i.diasSemContagem !== null ? 'var(--ink-secondary)' : 'var(--ink-muted)' }}>
          {i.diasSemContagem !== null ? (i.diasSemContagem === 0 ? 'Hoje' : `${i.diasSemContagem} dia(s)`) : '—'}
        </span>
      ),
      width: 'w-28',
    },
    {
      header: 'Vezes Contado',
      align: 'right',
      render: (i) => (
        <span className="font-bold tabular" style={{ color: i.vezesContado > 0 ? 'var(--status-good)' : 'var(--ink-muted)' }}>
          {i.vezesContado > 0 ? `${i.vezesContado}×` : '0×'}
        </span>
      ),
      width: 'w-24',
    },
    {
      header: 'Histórico',
      render: (i) => {
        if (i.vezesContado === 0) {
          return (
            <span
              className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold"
              style={{ background: 'var(--surface-sunken)', color: 'var(--ink-muted)' }}
            >
              Sem contagem
            </span>
          );
        }
        return i.jaDivergiu ? (
          <span
            className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold"
            style={{ background: 'color-mix(in srgb, var(--status-warning) 16%, transparent)', color: 'var(--status-warning)' }}
          >
            Já divergiu
          </span>
        ) : (
          <span
            className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold"
            style={{ background: 'color-mix(in srgb, var(--status-good) 16%, transparent)', color: 'var(--status-good)' }}
          >
            Sempre OK
          </span>
        );
      },
      width: 'w-28',
    },
  ], []);

  const filtrosIdadeEstoque: ComposicaoFiltro<ItemIdadeEstoque>[] = useMemo(() => [
    {
      key: 'deposito',
      label: 'Depósito',
      valueOf: (i) => formatDeposito(i.deposito),
    },
    {
      key: 'faixa',
      label: 'Faixa de Tempo',
      valueOf: (i) => i.faixaRotulo,
    },
  ], []);

  const handleSelecionarDia = useCallback((dia: string) => {
    const items = linhas.filter((l) => l.data === dia);
    const conferidos = items.filter((l) => l.status === 'conferido').length;
    const divergentes = items.filter((l) => l.status === 'divergente').length;

    setModalComposicao({
      title: `Inventário — ${formatDateBR(dia)}`,
      badge: 'Evolução por Dia',
      subtitle: `${items.length} item(ns) inventariado(s) em ${formatDateBR(dia)}: ${formatInt(conferidos)} conferido(s) e ${formatInt(divergentes)} divergente(s).`,
      items,
      groupBy: (l) => formatDeposito(l.deposito),
      groupLabelHeader: 'Depósito',
      valueOf: (l) => l.valor ?? 0,
      formatValue: formatBRL,
      valueHeader: 'Valor do Erro',
      unidadeItem: 'item(ns)',
      detailColumns: colunasLinhaAnalise,
      filters: filtrosLinhaAnalise,
      searchPredicate: (l, q) =>
        l.material.toLowerCase().includes(q) ||
        l.descricao.toLowerCase().includes(q) ||
        l.inventario.toLowerCase().includes(q) ||
        formatDeposito(l.deposito).toLowerCase().includes(q),
      searchPlaceholder: 'Buscar por material, descrição, inventário...',
      itemKey: (l, idx) => `${l.inventarioId}-${l.chave}-${idx}`,
    });
  }, [linhas, colunasLinhaAnalise, filtrosLinhaAnalise]);

  const handleSelecionarDeposito = useCallback((deposito: string) => {
    const items = linhas.filter((l) => l.deposito === deposito);
    setModalComposicao({
      title: `Inventário — ${formatDeposito(deposito)}`,
      badge: 'Acuracidade por Depósito',
      subtitle: `${items.length} item(ns) inventariado(s) no depósito ${formatDeposito(deposito)}.`,
      items,
      groupBy: (l) => (l.status === 'conferido' ? 'Conferidos (Bateram)' : l.status === 'divergente' ? 'Divergentes' : 'Outros'),
      groupLabelHeader: 'Resultado',
      valueOf: (l) => l.valor ?? 0,
      formatValue: formatBRL,
      valueHeader: 'Valor do Erro',
      unidadeItem: 'item(ns)',
      detailColumns: colunasLinhaAnalise,
      filters: filtrosLinhaAnalise,
      searchPredicate: (l, q) =>
        l.material.toLowerCase().includes(q) ||
        l.descricao.toLowerCase().includes(q) ||
        l.inventario.toLowerCase().includes(q),
      searchPlaceholder: 'Buscar por material, descrição, inventário...',
      itemKey: (l, idx) => `${l.inventarioId}-${l.chave}-${idx}`,
    });
  }, [linhas, colunasLinhaAnalise, filtrosLinhaAnalise]);

  const handleSelecionarClasse = useCallback((classe: string) => {
    const items = linhas.filter((l) => l.classe === classe);
    setModalComposicao({
      title: `Inventário — ${rotuloClasse(classe)}`,
      badge: 'Acuracidade por Classe',
      subtitle: `${items.length} item(ns) inventariado(s) na ${rotuloClasse(classe)}.`,
      items,
      groupBy: (l) => formatDeposito(l.deposito),
      groupLabelHeader: 'Depósito',
      valueOf: (l) => l.valor ?? 0,
      formatValue: formatBRL,
      valueHeader: 'Valor do Erro',
      unidadeItem: 'item(ns)',
      detailColumns: colunasLinhaAnalise,
      filters: filtrosLinhaAnalise,
      searchPredicate: (l, q) =>
        l.material.toLowerCase().includes(q) ||
        l.descricao.toLowerCase().includes(q) ||
        l.inventario.toLowerCase().includes(q) ||
        formatDeposito(l.deposito).toLowerCase().includes(q),
      searchPlaceholder: 'Buscar por material, descrição, inventário...',
      itemKey: (l, idx) => `${l.inventarioId}-${l.chave}-${idx}`,
    });
  }, [linhas, colunasLinhaAnalise, filtrosLinhaAnalise]);

  const handleSelecionarFaixaIdade = useCallback((faixa: FaixaIdade) => {
    const items = itensComIdade.filter((i) => i.faixa === faixa);
    setModalComposicao({
      title: `Posição ZL0024 — ${ROTULO_FAIXA_IDADE[faixa]}`,
      badge: 'Tempo sem Contagem',
      subtitle: `${items.length} item(ns) em estoque com última contagem na faixa: ${ROTULO_FAIXA_IDADE[faixa].toLowerCase()}.`,
      items,
      groupBy: (i) => formatDeposito(i.deposito),
      groupLabelHeader: 'Depósito',
      valueOf: (i) => i.valorEstoque,
      formatValue: formatBRL,
      valueHeader: 'Valor em Estoque',
      unidadeItem: 'item(ns)',
      detailColumns: colunasIdadeEstoque,
      filters: filtrosIdadeEstoque,
      searchPredicate: (i, q) =>
        i.material.toLowerCase().includes(q) ||
        i.descricao.toLowerCase().includes(q) ||
        formatDeposito(i.deposito).toLowerCase().includes(q),
      searchPlaceholder: 'Buscar por material, descrição ou depósito...',
      itemKey: (i, idx) => `${i.chave}-${idx}`,
    });
  }, [itensComIdade, colunasIdadeEstoque, filtrosIdadeEstoque]);

  const handleSelecionarCoberturaDeposito = useCallback((deposito: string) => {
    const items = itensComIdade.filter((i) => i.deposito === deposito);
    setModalComposicao({
      title: `Cobertura ZL0024 — ${formatDeposito(deposito)}`,
      badge: 'Cobertura por Depósito',
      subtitle: `${items.length} item(ns) em estoque no ${formatDeposito(deposito)} e seu histórico de contagem.`,
      groupBy: (i) => (i.vezesContado > 0 ? 'Já Contados' : 'Nunca Contados'),
      groupLabelHeader: 'Situação',
      valueOf: (i) => i.valorEstoque,
      formatValue: formatBRL,
      valueHeader: 'Valor em Estoque',
      unidadeItem: 'item(ns)',
      detailColumns: colunasIdadeEstoque,
      filters: filtrosIdadeEstoque,
      searchPredicate: (i, q) =>
        i.material.toLowerCase().includes(q) ||
        i.descricao.toLowerCase().includes(q),
      searchPlaceholder: 'Buscar por material ou descrição...',
      itemKey: (i, idx) => `${i.chave}-${idx}`,
    });
  }, [itensComIdade, colunasIdadeEstoque, filtrosIdadeEstoque]);

  const handleAbrirModalKpi = useCallback((rotulo: string, items: LinhaAnalise[]) => {
    setModalComposicao({
      title: `Inventário — ${rotulo}`,
      badge: 'Indicador Geral',
      subtitle: `${items.length} item(ns) correspondentes ao indicador.`,
      items,
      groupBy: (l) => formatDeposito(l.deposito),
      groupLabelHeader: 'Depósito',
      valueOf: (l) => l.valor ?? 0,
      formatValue: formatBRL,
      valueHeader: 'Valor do Erro',
      unidadeItem: 'item(ns)',
      detailColumns: colunasLinhaAnalise,
      filters: filtrosLinhaAnalise,
      searchPredicate: (l, q) =>
        l.material.toLowerCase().includes(q) ||
        l.descricao.toLowerCase().includes(q) ||
        l.inventario.toLowerCase().includes(q) ||
        formatDeposito(l.deposito).toLowerCase().includes(q),
      searchPlaceholder: 'Buscar por material, descrição, inventário...',
      itemKey: (l, idx) => `${l.inventarioId}-${l.chave}-${idx}`,
    });
  }, [colunasLinhaAnalise, filtrosLinhaAnalise]);

  const handleAbrirModalKpiEstoque = useCallback((rotulo: string, items: ItemIdadeEstoque[]) => {
    setModalComposicao({
      title: `Posição ZL0024 — ${rotulo}`,
      badge: 'Cobertura de Estoque',
      subtitle: `${items.length} item(ns) na posição de estoque atual.`,
      items,
      groupBy: (i) => formatDeposito(i.deposito),
      groupLabelHeader: 'Depósito',
      valueOf: (i) => i.valorEstoque,
      formatValue: formatBRL,
      valueHeader: 'Valor em Estoque',
      unidadeItem: 'item(ns)',
      detailColumns: colunasIdadeEstoque,
      filters: filtrosIdadeEstoque,
      searchPredicate: (i, q) =>
        i.material.toLowerCase().includes(q) ||
        i.descricao.toLowerCase().includes(q) ||
        formatDeposito(i.deposito).toLowerCase().includes(q),
      searchPlaceholder: 'Buscar por material, descrição ou depósito...',
      itemKey: (i, idx) => `${i.chave}-${idx}`,
    });
  }, [colunasIdadeEstoque, filtrosIdadeEstoque]);

  const filtroAtivo = !!(filtro.de || filtro.ate || filtro.depositos.length || filtro.classe || filtro.origem);
  const periodo = filtro.de || filtro.ate
    ? `${filtro.de ? formatDateBR(filtro.de) : 'início'} a ${filtro.ate ? formatDateBR(filtro.ate) : 'hoje'}`
    : 'Todo o histórico';

  const alternarDeposito = (d: string) => setFiltro((f) => ({
    ...f,
    depositos: f.depositos.includes(d) ? f.depositos.filter((x) => x !== d) : [...f.depositos, d].sort(),
  }));

  const exportar = () => {
    if (linhas.length === 0) { toast.error('Nenhum item no filtro para exportar.'); return; }
    try {
      exportarPlanilhaAnalise(linhas, resumo, periodo);
    } catch (err: any) {
      toast.error(err?.message || 'Falha ao exportar a planilha.');
    }
  };

  return (
    <div className="mx-auto max-w-[1600px] space-y-5 px-4 py-6 pb-12 select-text">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-5" style={{ borderColor: 'var(--hairline)' }}>
        <div className="min-w-0">
          <button
            type="button"
            onClick={() => onNavigate('/formularios/almoxarifado-inventario')}
            className="group mb-2 inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-[11px] font-bold transition-all hover:opacity-90 active:scale-95"
            style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}
          >
            <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-1" />
            Inventário Cíclico
          </button>
          <h1 className="flex items-center gap-2.5 text-2xl font-extrabold" style={{ color: 'var(--ink-primary)' }}>
            <ClipboardCheck className="h-7 w-7" style={{ color: 'var(--brand)' }} />
            Inventário
          </h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--ink-secondary)' }}>
            O estoque físico bate com o sistema? Onde erra mais, quanto vale o erro e o que ainda não foi contado.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canAccessPage(user, 'treinamentos') && (
            <button
              type="button"
              onClick={() => onNavigate('/treinamentos/setor?setor=2')}
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold cursor-pointer transition-all hover:opacity-90 active:scale-95"
              style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}
              title="Trilha de Treinamento: Rotinas do Almoxarifado (PO.ALM-0001)"
            >
              <GraduationCap className="h-3.5 w-3.5 text-amber-600" />
              Treinamento PO.ALM-0001
            </button>
          )}
          <button
            type="button"
            onClick={() => void carregar(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold cursor-pointer"
            style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Atualizar
          </button>
          <button
            type="button"
            onClick={exportar}
            disabled={linhas.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold text-white cursor-pointer disabled:opacity-50"
            style={{ background: 'var(--brand)' }}
          >
            <Download className="h-3.5 w-3.5" /> Exportar Excel
          </button>
        </div>
      </div>

      {erro && (
        <div className="flex items-start gap-3 rounded-xl border p-4 text-sm" style={{ borderColor: 'var(--status-serious)', color: 'var(--ink-primary)' }}>
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" style={{ color: 'var(--status-serious)' }} />
          <span>{erro}</span>
        </div>
      )}

      {/* Filtros */}
      <div className="space-y-3 rounded-xl border p-3" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)' }}>
        <div className="flex flex-wrap items-end gap-3">
          <span className="inline-flex items-center gap-1.5 pb-2 text-[11px] font-black uppercase tracking-wider" style={{ color: 'var(--ink-muted)' }}>
            <Filter className="h-3.5 w-3.5" /> Filtros
          </span>
          <label className="block text-[11px] font-bold" style={{ color: 'var(--ink-muted)' }}>
            De
            <input
              type="date"
              value={filtro.de}
              max={filtro.ate || undefined}
              onChange={(e) => setFiltro((f) => ({ ...f, de: e.target.value }))}
              className={`${selectCls} mt-1 block font-normal`}
              style={selectStyle}
            />
          </label>
          <label className="block text-[11px] font-bold" style={{ color: 'var(--ink-muted)' }}>
            Até
            <input
              type="date"
              value={filtro.ate}
              min={filtro.de || undefined}
              onChange={(e) => setFiltro((f) => ({ ...f, ate: e.target.value }))}
              className={`${selectCls} mt-1 block font-normal`}
              style={selectStyle}
            />
          </label>
          <label className="block text-[11px] font-bold" style={{ color: 'var(--ink-muted)' }}>
            Classe
            <select
              value={filtro.classe}
              onChange={(e) => setFiltro((f) => ({ ...f, classe: e.target.value }))}
              className={`${selectCls} mt-1 block`}
              style={selectStyle}
            >
              <option value="">Todas</option>
              {classesDisponiveis.map((c) => <option key={c} value={c}>{rotuloClasse(c)}</option>)}
            </select>
          </label>
          {origensDisponiveis.length > 1 && (
            <label className="block text-[11px] font-bold" style={{ color: 'var(--ink-muted)' }}>
              Origem dos dados
              <select
                value={filtro.origem}
                onChange={(e) => setFiltro((f) => ({ ...f, origem: e.target.value as OrigemInventario | '' }))}
                className={`${selectCls} mt-1 block`}
                style={selectStyle}
              >
                <option value="">Todas</option>
                {origensDisponiveis.map((o) => <option key={o} value={o}>{ROTULO_ORIGEM[o]}</option>)}
              </select>
            </label>
          )}
          {filtroAtivo && (
            <button
              type="button"
              onClick={() => setFiltro(FILTRO_VAZIO)}
              className="inline-flex items-center gap-1 pb-2 text-xs font-bold cursor-pointer"
              style={{ color: 'var(--brand)' }}
            >
              <X className="h-3.5 w-3.5" /> Limpar filtros
            </button>
          )}
        </div>
        {depositosDisponiveis.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[11px] font-bold" style={{ color: 'var(--ink-muted)' }}>
              Depósitos {filtro.depositos.length === 0 && '(nenhum marcado = todos)'}
            </span>
            {depositosDisponiveis.map((d) => {
              const ativo = filtro.depositos.includes(d);
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={ativo}
                  onClick={() => alternarDeposito(d)}
                  title={formatDeposito(d)}
                  className="rounded-full border px-2.5 py-1 text-[11px] font-bold cursor-pointer"
                  style={ativo
                    ? { background: 'var(--brand)', borderColor: 'var(--brand)', color: 'white' }
                    : { borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}
                >
                  {formatDeposito(d)}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {!loading && !erro && todas.length === 0 ? (
        <div className="rounded-xl border border-dashed py-14 text-center text-sm" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-muted)' }}>
          Nenhum inventário registrado ainda. Abra um em Formulários › Almoxarifado › Inventário Cíclico.
        </div>
      ) : (
        <>
          {/* Indicadores */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
            <KpiCard
              label="Acuracidade"
              icon={Target}
              display={pct(resumo.acuracidade)}
              share={resumo.acuracidade == null ? undefined : resumo.acuracidade / 100}
              detail={`${formatInt(resumo.conferidos)} de ${formatInt(resumo.encerrados)} itens bateram`}
              accent="var(--status-good)"
              emphasize
              onClick={() => handleAbrirModalKpi('Todos os itens avaliados', linhas.filter((l) => l.encerrado))}
            />
            <KpiCard
              label="Acerto na 1ª contagem"
              icon={Percent}
              display={pct(resumo.acertoPrimeira)}
              share={resumo.acertoPrimeira == null ? undefined : resumo.acertoPrimeira / 100}
              detail={`${formatInt(resumo.recontados)} itens precisaram recontar`}
              accent="var(--series-2)"
              onClick={() => handleAbrirModalKpi('Acerto na 1ª contagem', linhas.filter((l) => l.acertouNaPrimeira))}
            />
            <KpiCard
              label="Itens divergentes"
              icon={AlertTriangle}
              value={resumo.divergentes}
              format={(v) => formatInt(Math.round(v))}
              share={resumo.encerrados > 0 ? resumo.divergentes / resumo.encerrados : 0}
              detail={`${formatInt(resumo.faltas)} faltas · ${formatInt(resumo.sobras)} sobras`}
              accent="var(--status-critical)"
              onClick={() => handleAbrirModalKpi('Itens divergentes', linhas.filter((l) => l.status === 'divergente'))}
            />
            <KpiCard
              label="Valor do erro"
              icon={DollarSign}
              display={formatBRLCompacto(resumo.valorTotal)}
              detail={
                `falta ${formatBRLCompacto(resumo.valorFalta)} · sobra ${formatBRLCompacto(resumo.valorSobra)}`
                + (resumo.valorEstimado > 0 ? ' · inclui estimativa' : '')
              }
              accent="var(--status-serious)"
              onClick={() => handleAbrirModalKpi('Valor do erro (divergentes)', linhas.filter((l) => l.status === 'divergente'))}
            />
            <KpiCard
              label="Itens contados"
              icon={Package}
              value={resumo.itensDistintos}
              format={(v) => formatInt(Math.round(v))}
              detail={`${formatInt(resumo.inventarios)} inventários${resumo.emAberto > 0 ? ` · ${formatInt(resumo.emAberto)} em aberto` : ''}`}
              accent="var(--series-1)"
              onClick={() => handleAbrirModalKpi('Itens contados no período', linhas)}
            />
            <KpiCard
              label="Cobertura da ZL0024"
              icon={Repeat}
              display={pct(cobertura.pct)}
              share={cobertura.pct / 100}
              detail={`${formatInt(cobertura.contados)} de ${formatInt(cobertura.total)} itens já contados`}
              accent="var(--series-3)"
              onClick={() => handleAbrirModalKpiEstoque('Posição atual da ZL0024', itensComIdade)}
            />
          </div>

          <EvolucaoDiariaChart dados={dias} loading={loading} onSelecionarDia={handleSelecionarDia} />

          <div className="grid gap-4 lg:grid-cols-2">
            <AcuraciaPorGrupoChart
              titulo="Acuracidade por depósito"
              descricao="Percentual de itens que bateram com a ZL0024, por depósito. Clique em um depósito para ver seus itens."
              dados={depositos}
              rotulo={(c) => formatDeposito(c)}
              depositos
              loading={loading}
              onSelecionar={handleSelecionarDeposito}
            />
            <AcuraciaPorGrupoChart
              titulo="Acuracidade por classe"
              descricao="Classe da curva 80/20 em que o item foi selecionado. Clique em uma classe para ver seus itens."
              dados={classes}
              rotulo={rotuloClasse}
              loading={loading}
              onSelecionar={handleSelecionarClasse}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <IdadeContagemChart
              cobertura={cobertura}
              loading={loading}
              onSelecionarFaixa={handleSelecionarFaixaIdade}
            />
            <ChartCard
              title="Cobertura por depósito"
              icon={Package}
              description="Quanto da posição atual da ZL0024 já passou por contagem. Clique em um depósito para ver seus itens."
              height={260}
              loading={loading}
              empty={cobertura.porDeposito.length === 0}
              emptyMessage="Sem posição de estoque carregada."
            >
              <ul className="space-y-3">
                {cobertura.porDeposito.map((d) => (
                  <li
                    key={d.deposito}
                    onClick={() => handleSelecionarCoberturaDeposito(d.deposito)}
                    className="group -mx-2 -my-1 cursor-pointer rounded-xl p-2 transition-all hover:bg-[var(--surface-raised)] active:scale-[0.99]"
                    title="Clique para ver os itens deste depósito"
                  >
                    <div className="flex items-baseline justify-between gap-2 text-xs">
                      <span className="font-bold group-hover:text-[var(--brand)] transition-colors" style={{ color: 'var(--ink-primary)' }}>
                        {formatDeposito(d.deposito)}
                      </span>
                      <span className="tabular text-[11px]" style={{ color: 'var(--ink-secondary)' }}>
                        {formatInt(d.contados)} de {formatInt(d.itens)} itens · {pct(d.pct)}
                      </span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full" style={{ background: 'var(--surface-sunken)' }} aria-hidden="true">
                      <div className="h-full rounded-full transition-all duration-300" style={{ width: `${Math.min(100, d.pct)}%`, background: 'var(--series-3)' }} />
                    </div>
                    <p className="mt-0.5 text-[10px]" style={{ color: 'var(--ink-muted)' }}>
                      {pct(d.pctValor)} do valor em estoque ({formatBRLCompacto(d.valorContado)} de {formatBRLCompacto(d.valorEstoque)})
                    </p>
                  </li>
                ))}
              </ul>
            </ChartCard>
          </div>

          {/* Maiores divergências */}
          <section className="space-y-2">
            <div>
              <h2 className="text-base font-extrabold" style={{ color: 'var(--ink-primary)' }}>Maiores divergências</h2>
              <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>
                Os 15 itens divergentes de maior valor no recorte. “≈” indica valor estimado pelo preço médio atual.
              </p>
            </div>
            {piores.length === 0 ? (
              <div className="rounded-xl border border-dashed py-8 text-center text-xs" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-muted)' }}>
                Nenhum item com diferença no filtro selecionado.
              </div>
            ) : (
              <>
                <TableCards>
                  {piores.map((l) => (
                    <TableCardRow key={`${l.inventarioId}-${l.chave}`} accent={l.diferenca! < 0 ? 'var(--status-critical)' : 'var(--status-warning)'}>
                      <div className="flex items-start justify-between gap-3">
                        <p className="min-w-0 text-sm font-bold line-clamp-2" style={{ color: 'var(--ink-primary)' }}>{l.descricao || l.material}</p>
                        <span className="shrink-0 text-sm"><Valor linha={l} /></span>
                      </div>
                      <p className="font-mono text-[11px]" style={{ color: 'var(--ink-muted)' }}>
                        {l.material} · {formatDeposito(l.deposito)} · {l.inventario} · {formatDateBR(l.data)}
                      </p>
                      <p className="text-[11px]" style={{ color: 'var(--ink-secondary)' }}>
                        Saldo {l.saldo === null ? '—' : formatQtd(l.saldo)} · contado {l.contado === null ? '—' : formatQtd(l.contado)} · dif. <Diferenca valor={l.diferenca} />
                      </p>
                    </TableCardRow>
                  ))}
                </TableCards>
                <TableDesktop>
                  <TableShell maxHeight="none">
                    <table className="w-full text-xs">
                      <TableHeadRow>
                        <Th label="Data" />
                        <Th label="Inventário" />
                        <Th label="Material" />
                        <Th label="Depósito" />
                        <Th label="Classe" />
                        <Th label="Saldo ZL0024" align="right" />
                        <Th label="Contado" align="right" />
                        <Th label="Diferença" align="right" />
                        <Th label="Valor do erro" align="right" />
                        <Th label="Contagens" align="right" />
                      </TableHeadRow>
                      <TableBody>
                        {piores.map((l) => (
                          <Tr key={`${l.inventarioId}-${l.chave}`} accent={l.diferenca! < 0 ? 'var(--status-critical)' : 'var(--status-warning)'}>
                            <Td numeric>{formatDateBR(l.data)}</Td>
                            <Td mono>{l.inventario}</Td>
                            <Td>
                              <span className="font-mono font-bold" style={{ color: 'var(--ink-primary)' }}>{l.material}</span>
                              <span className="block max-w-[320px] truncate" title={l.descricao}>{l.descricao || '—'}</span>
                            </Td>
                            <Td>{formatDeposito(l.deposito)}</Td>
                            <Td>{l.classe}</Td>
                            <Td align="right" numeric>{l.saldo === null ? '—' : formatQtd(l.saldo)}</Td>
                            <Td align="right" numeric>{l.contado === null ? '—' : formatQtd(l.contado)}</Td>
                            <Td align="right"><Diferenca valor={l.diferenca} /></Td>
                            <Td align="right"><Valor linha={l} /></Td>
                            <Td align="right" numeric>{l.contagens}</Td>
                          </Tr>
                        ))}
                      </TableBody>
                    </table>
                  </TableShell>
                </TableDesktop>
              </>
            )}
          </section>

          {/* Conferidos com diferença */}
          {toleradas.length > 0 && (
            <section className="space-y-2">
              <div>
                <h2 className="flex flex-wrap items-center gap-2 text-base font-extrabold" style={{ color: 'var(--ink-primary)' }}>
                  Conferidos com diferença
                  <span className="rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: 'color-mix(in srgb, var(--status-warning) 16%, transparent)', color: 'var(--status-warning)' }}>
                    {formatInt(resumo.conferidosComDiferenca)} itens · {formatBRLCompacto(resumo.valorConferidosComDiferenca)}
                  </span>
                </h2>
                <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>
                  Fechados como “OK” mas com diferença e valor registrados na planilha importada. Não entram no valor do erro nem derrubam a acuracidade;
                  vale revisar os de maior valor para confirmar se a diferença é real.
                </p>
              </div>
              <TableCards>
                {toleradas.map((l) => (
                  <TableCardRow key={`${l.inventarioId}-${l.chave}-${l.contagens}`} accent="var(--status-warning)">
                    <div className="flex items-start justify-between gap-3">
                      <p className="min-w-0 text-sm font-bold line-clamp-2" style={{ color: 'var(--ink-primary)' }}>{l.descricao || l.material}</p>
                      <span className="shrink-0 text-sm"><Valor linha={l} /></span>
                    </div>
                    <p className="font-mono text-[11px]" style={{ color: 'var(--ink-muted)' }}>
                      {l.material} · {formatDeposito(l.deposito)} · {l.inventario} · {formatDateBR(l.data)}
                    </p>
                    <p className="text-[11px]" style={{ color: 'var(--ink-secondary)' }}>
                      Saldo {l.saldo === null ? '—' : formatQtd(l.saldo)} · contado {l.contado === null ? '—' : formatQtd(l.contado)} · dif. <Diferenca valor={l.diferenca} />
                    </p>
                  </TableCardRow>
                ))}
              </TableCards>
              <TableDesktop>
                <TableShell maxHeight="none">
                  <table className="w-full text-xs">
                    <TableHeadRow>
                      <Th label="Data" />
                      <Th label="Inventário" />
                      <Th label="Material" />
                      <Th label="Depósito" />
                      <Th label="Saldo ZL0024" align="right" />
                      <Th label="Contado" align="right" />
                      <Th label="Diferença" align="right" />
                      <Th label="Valor registrado" align="right" />
                      <Th label="Contagens" align="right" />
                    </TableHeadRow>
                    <TableBody>
                      {toleradas.map((l) => (
                        <Tr key={`${l.inventarioId}-${l.chave}-${l.contagens}`} accent="var(--status-warning)">
                          <Td numeric>{formatDateBR(l.data)}</Td>
                          <Td mono>{l.inventario}</Td>
                          <Td>
                            <span className="font-mono font-bold" style={{ color: 'var(--ink-primary)' }}>{l.material}</span>
                            <span className="block max-w-[320px] truncate" title={l.descricao}>{l.descricao || '—'}</span>
                          </Td>
                          <Td>{formatDeposito(l.deposito)}</Td>
                          <Td align="right" numeric>{l.saldo === null ? '—' : formatQtd(l.saldo)}</Td>
                          <Td align="right" numeric>{l.contado === null ? '—' : formatQtd(l.contado)}</Td>
                          <Td align="right"><Diferenca valor={l.diferenca} /></Td>
                          <Td align="right"><Valor linha={l} /></Td>
                          <Td align="right" numeric>{l.contagens}</Td>
                        </Tr>
                      ))}
                    </TableBody>
                  </table>
                </TableShell>
              </TableDesktop>
            </section>
          )}

          {/* Reincidentes */}
          <section className="space-y-2">
            <div>
              <h2 className="text-base font-extrabold" style={{ color: 'var(--ink-primary)' }}>Itens que reincidem</h2>
              <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>
                Material × depósito que terminou divergente mais de uma vez no recorte — candidatos a investigar a causa (endereço, unidade, lançamento).
              </p>
            </div>
            {reincidencias.length === 0 ? (
              <TableEmpty icon={Repeat} title="Nenhum item reincidente" hint="Nenhum item divergiu mais de uma vez no filtro selecionado." />
            ) : (
              <>
                <TableCards>
                  {reincidencias.map((r) => (
                    <TableCardRow key={r.chave} accent="var(--status-critical)">
                      <p className="text-sm font-bold line-clamp-2" style={{ color: 'var(--ink-primary)' }}>{r.descricao || r.material}</p>
                      <p className="font-mono text-[11px]" style={{ color: 'var(--ink-muted)' }}>{r.material} · {formatDeposito(r.deposito)}</p>
                      <p className="text-[11px]" style={{ color: 'var(--ink-secondary)' }}>
                        Divergiu {r.vezesDivergiu}× em {r.vezesContado} contagens · {formatBRL(r.valor)} · último em {formatDateBR(r.ultimaData)}
                      </p>
                    </TableCardRow>
                  ))}
                </TableCards>
                <TableDesktop>
                  <TableShell maxHeight="none">
                    <table className="w-full text-xs">
                      <TableHeadRow>
                        <Th label="Material" />
                        <Th label="Depósito" />
                        <Th label="Vezes contado" align="right" />
                        <Th label="Vezes divergiu" align="right" />
                        <Th label="Valor acumulado do erro" align="right" />
                        <Th label="Última contagem" />
                      </TableHeadRow>
                      <TableBody>
                        {reincidencias.map((r) => (
                          <Tr key={r.chave} accent="var(--status-critical)">
                            <Td>
                              <span className="font-mono font-bold" style={{ color: 'var(--ink-primary)' }}>{r.material}</span>
                              <span className="block max-w-[360px] truncate" title={r.descricao}>{r.descricao || '—'}</span>
                            </Td>
                            <Td>{formatDeposito(r.deposito)}</Td>
                            <Td align="right" numeric>{r.vezesContado}</Td>
                            <Td align="right" numeric strong>{r.vezesDivergiu}</Td>
                            <Td align="right" numeric>{formatBRL(r.valor)}</Td>
                            <Td numeric>{formatDateBR(r.ultimaData)}</Td>
                          </Tr>
                        ))}
                      </TableBody>
                    </table>
                  </TableShell>
                </TableDesktop>
              </>
            )}
          </section>

          <p className="text-[11px] leading-relaxed" style={{ color: 'var(--ink-muted)' }}>
            <strong>Como ler:</strong> acuracidade = itens conferidos ÷ itens encerrados (pendentes e aguardando decisão ficam de fora).
            “Acerto na 1ª contagem” = encerrou conferido sem precisar recontar. O valor do erro do histórico importado vem da própria planilha;
            nos inventários feitos no SISTEN é a diferença × o preço médio atual da ZL0024 (marcado com ≈). Valor do erro, faltas e sobras
            contam só os itens que terminaram divergentes; os “conferidos com diferença” aparecem à parte.
          </p>
        </>
      )}

      <ComposicaoModal config={modalComposicao} onClose={() => setModalComposicao(null)} />
    </div>
  );
}
