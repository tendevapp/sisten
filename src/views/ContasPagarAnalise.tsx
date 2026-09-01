import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  BarChart3, Wallet, CalendarClock, Building2, ListChecks, X, ChevronRight, ChevronDown, ChevronsUpDown, Layers, Receipt, Search, ArrowUp, ArrowDown, Clock,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, LabelList, Legend, ResponsiveContainer,
} from 'recharts';
import { supabase } from '../db/supabaseClient';
import { localDb } from '../db/localDb';
import { Profile } from '../types';
import { formatBRL, formatBRLCompacto, formatDateBR, formatDateTimeBR, formatPct } from '../lib/format';
import { useChartTokens, seriesColor } from '../lib/chartTokens';
import { useChartConfig, estimateCategoryChartWidth } from '../components/charts/chartDefaults';
import ChartCard from '../components/charts/ChartCard';
import ChartTooltip from '../components/charts/ChartTooltip';
import KpiCard from '../components/charts/KpiCard';
import MultiSelectFilter from '../components/ui/MultiSelectFilter';
import { TableShell, TableHeadRow, TableBody, Td } from '../components/ui/DataTable';

interface ContasPagarAnaliseProps {
  user: Profile;
}

interface Fbl1nAnaliseLinha {
  id: number;
  numero_documento: string | null;
  fornecedor: string | null;
  empresa: string | null;
  razao_social_fornecedor: string | null;
  montante_moeda_doc: number | null;
  doc_compensacao: string | null;
  data_compensacao: string | null;
  data_pagamento: string | null;
  vencimento_liquido: string | null;
  data_lancamento: string | null;
  tipo_documento_categoria_modulo: string | null;
  tipo_documento_descricao: string | null;
  tipo_documento: string | null;
}

// 'aberto' = todo o saldo em aberto (usado pelos gráficos de categoria/fornecedor/aging).
// Na Evolução Temporal o saldo em aberto aparece empilhado como 'aVencer' + 'vencido'.
type ModalMetric = 'pago' | 'aberto' | 'aVencer' | 'vencido';

interface SelectedPeriodModalData {
  label: string;
  key: string;
  metric: ModalMetric;
  items: Fbl1nAnaliseLinha[];
}

/** Rótulo e cor de cada série, compartilhados entre gráfico, legenda e modal. */
const METRIC_META: Record<ModalMetric, { label: string; color: string }> = {
  pago: { label: 'Valor Pago', color: '#10b981' },
  aberto: { label: 'Valor em Aberto', color: '#f59e0b' },
  aVencer: { label: 'A Vencer', color: '#f59e0b' },
  vencido: { label: 'Vencido', color: '#dc2626' },
};

const PAGE_SIZE = 1000;

function estaCompensada(l: Fbl1nAnaliseLinha): boolean {
  return Boolean(
    (l.doc_compensacao && l.doc_compensacao.trim() !== '' && l.doc_compensacao.trim() !== '—') ||
    l.data_compensacao
  );
}

function estaAberta(l: Fbl1nAnaliseLinha): boolean {
  return !estaCompensada(l);
}

/** Um lançamento pertence à série `metric` do gráfico/legenda? */
function itemMatchesMetric(l: Fbl1nAnaliseLinha, metric: ModalMetric, hoje: string): boolean {
  if (metric === 'pago') return estaCompensada(l) && (l.montante_moeda_doc || 0) > 0;
  if (metric === 'aberto') return estaAberta(l);
  if (!estaAberta(l)) return false;
  const vencido = !!l.vencimento_liquido && l.vencimento_liquido < hoje;
  return metric === 'vencido' ? vencido : !vencido; // 'aVencer' = em aberto ainda não vencido (inclui sem vencimento)
}

function formatTipoDocLabel(l: Fbl1nAnaliseLinha): string {
  const code = l.tipo_documento?.trim();
  const desc = l.tipo_documento_descricao?.trim();
  if (code && desc) return `${code} - ${desc}`;
  return code || desc || '—';
}

/** FBL1N traz partidas de fornecedor com sinal de crédito (negativo). A
 *  exposição em aberto é o valor invertido, para somar e ranquear positivo. */
function exposicao(l: Fbl1nAnaliseLinha): number {
  return -(l.montante_moeda_doc || 0);
}

const MONTH_NAMES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function getMonthKeyAndLabel(dateStr: string): { key: string; label: string } {
  const [year, month] = dateStr.split('-');
  const mIdx = parseInt(month, 10) - 1;
  const label = `${MONTH_NAMES[mIdx] || month}/${year.slice(2)}`;
  return { key: `${year}-${month}`, label };
}

/** Converte uma chave de mês "YYYY-MM" no intervalo de datas correspondente. */
function mesParaPeriodo(ym: string): { de: string; ate: string } {
  const [y, m] = ym.split('-').map(Number);
  const mStr = String(m).padStart(2, '0');
  const ultimoDia = new Date(y, m, 0).getDate();
  return { de: `${y}-${mStr}-01`, ate: `${y}-${mStr}-${String(ultimoDia).padStart(2, '0')}` };
}

function getISOWeekNumber(d: Date): number {
  const target = new Date(d.valueOf());
  const dayNr = (d.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay() + 7) % 7));
  }
  return 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
}

function getWeekMonday(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return dateStr;
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  return monday.toISOString().split('T')[0];
}

function getWeekKeyAndLabel(dateStr: string): { key: string; label: string; fullLabel: string } {
  const mondayISO = getWeekMonday(dateStr);
  const d = new Date(mondayISO + 'T00:00:00');
  const [, month, day] = mondayISO.split('-');

  if (isNaN(d.getTime())) {
    return { key: dateStr, label: dateStr, fullLabel: dateStr };
  }

  const weekNum = getISOWeekNumber(d);
  const wStr = String(weekNum).padStart(2, '0');

  return {
    key: mondayISO,
    label: `W${wStr}`,
    fullLabel: `W${wStr} (${day}/${month})`,
  };
}

export default function ContasPagarAnalise({ user: _user }: ContasPagarAnaliseProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [linhas, setLinhas] = useState<Fbl1nAnaliseLinha[]>([]);
  const [fornecedoresSelecionados, setFornecedoresSelecionados] = useState<Set<string>>(new Set());
  const [tipoDocFilter, setTipoDocFilter] = useState('Todos');
  const [periodoDe, setPeriodoDe] = useState('2026-01-01');
  const [periodoAte, setPeriodoAte] = useState('2026-12-31');
  const [periodoVisao, setPeriodoVisao] = useState<'mes' | 'semana'>('mes');

  const [selectedPeriodModal, setSelectedPeriodModal] = useState<SelectedPeriodModalData | null>(null);
  const [modalExpandedSuppliers, setModalExpandedSuppliers] = useState<Record<string, boolean>>({});
  const [modalSearchQuery, setModalSearchQuery] = useState('');
  const [modalSortDir, setModalSortDir] = useState<'desc' | 'asc'>('desc');

  useEffect(() => {
    if (selectedPeriodModal) {
      setModalSearchQuery('');
      setModalSortDir('desc');
    }
  }, [selectedPeriodModal]);

  const tokens = useChartTokens();
  const c = useChartConfig();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const allRows: Fbl1nAnaliseLinha[] = [];
      let from = 0;
      while (true) {
        const { data, error: fetchError } = await supabase
          .from('vw_fbl1n_c_pagar_analise')
          .select('id, numero_documento, fornecedor, empresa, razao_social_fornecedor, montante_moeda_doc, doc_compensacao, data_compensacao, data_pagamento, vencimento_liquido, data_lancamento, tipo_documento_categoria_modulo, tipo_documento_descricao, tipo_documento')
          .order('id', { ascending: true })
          .range(from, from + PAGE_SIZE - 1);
        if (fetchError) throw fetchError;
        if (!data || data.length === 0) break;
        allRows.push(...(data as Fbl1nAnaliseLinha[]));
        if (data.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }
      setLinhas(allRows);
    } catch (e) {
      console.error('Erro ao carregar análise de contas a pagar (FBL1N):', e);
      setError('Falha ao carregar os dados. Tente atualizar novamente.');
      setLinhas([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  /** Meses presentes nos dados (chave YYYY-MM), pela mesma data usada nos filtros/gráfico. */
  const mesesDisponiveis = useMemo(() => {
    const s = new Set<string>();
    linhas.forEach(l => {
      const dateVal = l.data_pagamento || l.data_compensacao || l.vencimento_liquido || l.data_lancamento;
      if (dateVal) s.add(dateVal.slice(0, 7));
    });
    return Array.from(s).sort();
  }, [linhas]);

  /** Mês ativo no seletor: só quando o período casa exatamente com os limites de um mês. */
  const mesSelecionado = useMemo(() => {
    if (!periodoDe || !periodoAte) return '';
    const ym = periodoDe.slice(0, 7);
    const { de, ate } = mesParaPeriodo(ym);
    return periodoDe === de && periodoAte === ate ? ym : '';
  }, [periodoDe, periodoAte]);

  const fornecedorOptions = useMemo(() => {
    const s = new Set<string>();
    linhas.forEach(l => {
      const nome = l.razao_social_fornecedor?.trim() || l.fornecedor?.trim();
      if (nome) s.add(nome);
    });
    return Array.from(s).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [linhas]);

  const fornecedorCodigoMap = useMemo(() => {
    const map = new Map<string, string>();
    linhas.forEach(l => {
      const nome = l.razao_social_fornecedor?.trim() || l.fornecedor?.trim();
      if (nome && l.fornecedor && l.fornecedor !== nome) {
        map.set(nome, l.fornecedor);
      }
    });
    return map;
  }, [linhas]);

  const renderFornecedorOption = useCallback((name: string) => {
    const cod = fornecedorCodigoMap.get(name);
    return cod ? `${name} (${cod})` : name;
  }, [fornecedorCodigoMap]);

  const tipoDocOptions = useMemo(() => {
    const map = new Map<string, string>();
    linhas.forEach(l => {
      const code = l.tipo_documento?.trim();
      const desc = l.tipo_documento_descricao?.trim();
      if (code || desc) {
        const key = code || desc || '';
        const label = code && desc ? `${code} - ${desc}` : (code || desc || '');
        map.set(key, label);
      }
    });
    return Array.from(map.entries())
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
  }, [linhas]);

  const filtradas = useMemo(() => {
    return linhas.filter(l => {
      if (tipoDocFilter !== 'Todos') {
        const itemKey = l.tipo_documento?.trim() || l.tipo_documento_descricao?.trim() || '';
        if (itemKey !== tipoDocFilter) return false;
      }
      if (fornecedoresSelecionados.size > 0) {
        const nome = l.razao_social_fornecedor?.trim() || l.fornecedor?.trim() || '';
        if (!fornecedoresSelecionados.has(nome)) return false;
      }
      if (periodoDe || periodoAte) {
        const dateVal = l.data_pagamento || l.data_compensacao || l.vencimento_liquido || l.data_lancamento;
        if (periodoDe && (!dateVal || dateVal < periodoDe)) return false;
        if (periodoAte && (!dateVal || dateVal > periodoAte)) return false;
      }
      return true;
    });
  }, [linhas, tipoDocFilter, fornecedoresSelecionados, periodoDe, periodoAte]);

  const abertas = useMemo(() => filtradas.filter(estaAberta), [filtradas]);

  const hoje = new Date().toISOString().split('T')[0];
  const em7dias = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
  const em30dias = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];

  const kpis = useMemo(() => {
    const totalAberto = abertas.reduce((sum, l) => sum + exposicao(l), 0);
    const vencidas = abertas.filter(l => l.vencimento_liquido && l.vencimento_liquido < hoje);
    const totalVencido = vencidas.reduce((sum, l) => sum + exposicao(l), 0);

    const porFornecedor = new Map<string, number>();
    abertas.forEach(l => {
      const nome = l.razao_social_fornecedor || 'Sem fornecedor';
      porFornecedor.set(nome, (porFornecedor.get(nome) || 0) + exposicao(l));
    });
    let maiorFornecedor = '—';
    let maiorFornecedorValor = -Infinity;
    porFornecedor.forEach((valor, nome) => {
      if (valor > maiorFornecedorValor) { maiorFornecedorValor = valor; maiorFornecedor = nome; }
    });
    if (maiorFornecedorValor === -Infinity) maiorFornecedorValor = 0;

    return { totalAberto, totalVencido, maiorFornecedor, maiorFornecedorValor, qtdAbertas: abertas.length };
  }, [abertas, hoje]);

  const temporalChartData = useMemo(() => {
    // aberto = aVencer + vencido; guardado só para o total do tooltip.
    const map = new Map<string, { key: string; label: string; fullLabel?: string; pago: number; aberto: number; aVencer: number; vencido: number }>();

    // Preenche todos os meses do período selecionado para garantir visualização contínua de Jan a Dez
    if (periodoVisao === 'mes' && periodoDe && periodoAte) {
      const [sY, sM] = periodoDe.split('-').map(Number);
      const [eY, eM] = periodoAte.split('-').map(Number);
      if (sY && sM && eY && eM) {
        let curY = sY;
        let curM = sM;
        while (curY < eY || (curY === eY && curM <= eM)) {
          const mStr = String(curM).padStart(2, '0');
          const key = `${curY}-${mStr}`;
          const label = `${MONTH_NAMES[curM - 1] || mStr}/${String(curY).slice(2)}`;
          map.set(key, { key, label, fullLabel: label, pago: 0, aberto: 0, aVencer: 0, vencido: 0 });
          curM++;
          if (curM > 12) { curM = 1; curY++; }
        }
      }
    }

    filtradas.forEach(l => {
      const dateVal = l.data_pagamento || l.data_compensacao || l.vencimento_liquido || l.data_lancamento;
      if (!dateVal) return;

      const { key, label, fullLabel } = periodoVisao === 'mes'
        ? { ...getMonthKeyAndLabel(dateVal), fullLabel: getMonthKeyAndLabel(dateVal).label }
        : getWeekKeyAndLabel(dateVal);

      let entry = map.get(key);
      if (!entry) {
        entry = { key, label, fullLabel, pago: 0, aberto: 0, aVencer: 0, vencido: 0 };
        map.set(key, entry);
      }

      const rawVal = l.montante_moeda_doc || 0;

      if (estaCompensada(l)) {
        if (rawVal > 0) {
          entry.pago += rawVal;
        }
      } else {
        // Exposição com sinal, igual aos KPIs e aos demais gráficos: estornos de
        // fornecedor e notas de crédito (montante positivo) abatem o saldo em
        // aberto em vez de inflá-lo. Usar Math.abs aqui fazia a barra divergir
        // do card "Total em Aberto".
        const exp = exposicao(l);
        entry.aberto += exp;
        // O saldo em aberto entra empilhado: fatia já vencida x fatia a vencer
        // (sem vencimento informado conta como a vencer). aVencer + vencido = aberto.
        if (l.vencimento_liquido && l.vencimento_liquido < hoje) {
          entry.vencido += exp;
        } else {
          entry.aVencer += exp;
        }
      }
    });

    return Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key));
  }, [filtradas, periodoVisao, periodoDe, periodoAte, hoje]);

  const handleBarClick = (barData: any, metric: ModalMetric) => {
    if (!barData || !barData.key) return;

    const items = filtradas.filter(l => {
      const dateVal = l.data_pagamento || l.data_compensacao || l.vencimento_liquido || l.data_lancamento;
      if (!dateVal) return false;

      const { key } = periodoVisao === 'mes'
        ? getMonthKeyAndLabel(dateVal)
        : getWeekKeyAndLabel(dateVal);

      if (key !== barData.key) return false;

      return itemMatchesMetric(l, metric, hoje);
    });

    const initialExpanded: Record<string, boolean> = {};
    items.forEach(i => {
      const name = i.razao_social_fornecedor || i.fornecedor || 'Sem fornecedor';
      initialExpanded[name] = true;
    });

    setSelectedPeriodModal({
      label: barData.fullLabel || barData.label,
      key: barData.key,
      metric,
      items,
    });
    setModalExpandedSuppliers(initialExpanded);
  };

  /** Rótulo do recorte de período ativo, para o título do modal aberto pela legenda. */
  const periodoLabel = useMemo(() => {
    if (mesSelecionado) return getMonthKeyAndLabel(mesSelecionado).label;
    if (periodoDe && periodoAte) return `${formatDateBR(periodoDe)} a ${formatDateBR(periodoAte)}`;
    if (periodoDe) return `a partir de ${formatDateBR(periodoDe)}`;
    if (periodoAte) return `até ${formatDateBR(periodoAte)}`;
    return 'todas as datas';
  }, [mesSelecionado, periodoDe, periodoAte]);

  /** Clique na legenda: abre a tabela para a série inteira, somando todos os períodos visíveis. */
  const handleLegendClick = (data: any) => {
    const metric = (data?.dataKey ?? data?.payload?.dataKey) as ModalMetric | undefined;
    if (metric !== 'pago' && metric !== 'aVencer' && metric !== 'vencido') return;

    const items = filtradas.filter(l => itemMatchesMetric(l, metric, hoje));

    const initialExpanded: Record<string, boolean> = {};
    items.forEach(i => {
      const name = i.razao_social_fornecedor || i.fornecedor || 'Sem fornecedor';
      initialExpanded[name] = true;
    });

    setSelectedPeriodModal({
      label: `${METRIC_META[metric].label} — ${periodoLabel}`,
      key: `legend-${metric}`,
      metric,
      items,
    });
    setModalExpandedSuppliers(initialExpanded);
  };

  const handleCategoriaClick = (entry: any) => {
    if (!entry || !entry.categoria) return;
    const catTarget = entry.categoria;
    const items = abertas.filter(l => (l.tipo_documento_descricao || 'Sem categoria') === catTarget);

    const initialExpanded: Record<string, boolean> = {};
    items.forEach(i => {
      const name = i.razao_social_fornecedor || i.fornecedor || 'Sem fornecedor';
      initialExpanded[name] = true;
    });

    setSelectedPeriodModal({
      label: `Tipo: ${catTarget}`,
      key: `cat-${catTarget}`,
      metric: 'aberto',
      items,
    });
    setModalExpandedSuppliers(initialExpanded);
  };

  const handleFornecedorClick = (entry: any) => {
    if (!entry || !entry.fornecedor) return;
    const fornTarget = entry.fornecedor;
    const items = abertas.filter(l => (l.razao_social_fornecedor || 'Sem fornecedor') === fornTarget);

    const initialExpanded: Record<string, boolean> = {
      [fornTarget]: true,
    };

    setSelectedPeriodModal({
      label: `Fornecedor: ${fornTarget}`,
      key: `forn-${fornTarget}`,
      metric: 'aberto',
      items,
    });
    setModalExpandedSuppliers(initialExpanded);
  };

  const handleAgingClick = (entry: any) => {
    if (!entry || !entry.bucket) return;
    const bucket = entry.bucket;
    const items = abertas.filter(l => {
      if (bucket === 'Sem vencimento informado') return !l.vencimento_liquido;
      if (!l.vencimento_liquido) return false;
      if (bucket === 'Vencido') return l.vencimento_liquido < hoje;
      if (bucket === 'Vence em até 7 dias') return l.vencimento_liquido >= hoje && l.vencimento_liquido < em7dias;
      if (bucket === 'Vence em até 30 dias') return l.vencimento_liquido >= em7dias && l.vencimento_liquido < em30dias;
      if (bucket === 'Vence em 30+ dias') return l.vencimento_liquido >= em30dias;
      return false;
    });

    const initialExpanded: Record<string, boolean> = {};
    items.forEach(i => {
      const name = i.razao_social_fornecedor || i.fornecedor || 'Sem fornecedor';
      initialExpanded[name] = true;
    });

    setSelectedPeriodModal({
      label: `Aging: ${bucket}`,
      key: `aging-${bucket}`,
      metric: 'aberto',
      items,
    });
    setModalExpandedSuppliers(initialExpanded);
  };

  const modalSupplierGroups = useMemo(() => {
    if (!selectedPeriodModal) return [];

    let filteredItems = selectedPeriodModal.items;
    if (modalSearchQuery.trim()) {
      const q = modalSearchQuery.toLowerCase().trim();
      filteredItems = filteredItems.filter(item =>
        (item.razao_social_fornecedor || '').toLowerCase().includes(q) ||
        (item.fornecedor || '').toLowerCase().includes(q) ||
        (item.numero_documento || '').toLowerCase().includes(q) ||
        (item.tipo_documento_descricao || '').toLowerCase().includes(q) ||
        (item.tipo_documento || '').toLowerCase().includes(q)
      );
    }

    const map = new Map<string, {
      supplierName: string;
      fornecedorCodigo: string | null;
      items: Fbl1nAnaliseLinha[];
      totalValor: number;
      totalExposicaoAberto: number;
      /** Soma dos módulos, só para calcular participação percentual numa lista com sinais mistos. */
      grossValor: number;
      qtdLancamentos: number;
      qtdAbertos: number;
      qtdCompensados: number;
      qtdVencidos: number;
    }>();

    filteredItems.forEach(item => {
      const rawVal = item.montante_moeda_doc || 0;
      const isComp = Boolean(
        (item.doc_compensacao && item.doc_compensacao.trim() !== '' && item.doc_compensacao.trim() !== '—') ||
        item.data_compensacao
      );

      if (isComp) {
        if (rawVal > 0) {
          const name = item.razao_social_fornecedor || item.fornecedor || 'Sem fornecedor';
          let group = map.get(name);
          if (!group) {
            group = {
              supplierName: name,
              fornecedorCodigo: item.fornecedor,
              items: [],
              totalValor: 0,
              totalExposicaoAberto: 0,
              grossValor: 0,
              qtdLancamentos: 0,
              qtdAbertos: 0,
              qtdCompensados: 0,
              qtdVencidos: 0,
            };
            map.set(name, group);
          }

          group.items.push(item);
          group.qtdLancamentos++;
          group.qtdCompensados++;
          group.totalValor += rawVal;
          group.grossValor += Math.abs(rawVal);
        }
      } else {
        const name = item.razao_social_fornecedor || item.fornecedor || 'Sem fornecedor';
        let group = map.get(name);
        if (!group) {
          group = {
            supplierName: name,
            fornecedorCodigo: item.fornecedor,
            items: [],
            totalValor: 0,
            totalExposicaoAberto: 0,
            grossValor: 0,
            qtdLancamentos: 0,
            qtdAbertos: 0,
            qtdCompensados: 0,
            qtdVencidos: 0,
          };
          map.set(name, group);
        }

        group.items.push(item);
        group.qtdLancamentos++;
        group.qtdAbertos++;
        // Exposição com sinal (igual aos KPIs): o subtotal do fornecedor e o
        // total do modal batem com a barra "Valor em Aberto" do gráfico.
        const exp = exposicao(item);
        group.totalExposicaoAberto += exp;
        group.totalValor += exp;
        group.grossValor += Math.abs(rawVal);

        if (item.vencimento_liquido && item.vencimento_liquido < hoje) {
          group.qtdVencidos++;
        }
      }
    });

    // Ordena pelo módulo: o maior movimentador aparece primeiro, com estorno ou não.
    return Array.from(map.values()).sort((a, b) => {
      return modalSortDir === 'desc' ? b.grossValor - a.grossValor : a.grossValor - b.grossValor;
    });
  }, [selectedPeriodModal, hoje, modalSearchQuery, modalSortDir]);

  const modalTotalValor = useMemo(() => {
    if (!selectedPeriodModal) return 0;
    return modalSupplierGroups.reduce((acc, g) => acc + g.totalValor, 0);
  }, [selectedPeriodModal, modalSupplierGroups]);

  /** Base bruta (soma dos módulos) para as colunas "% do Total" — evita percentuais
   *  distorcidos quando estornos quase zeram o total líquido. */
  const modalGrossTotal = useMemo(() => {
    if (!selectedPeriodModal) return 0;
    return modalSupplierGroups.reduce((acc, g) => acc + g.grossValor, 0);
  }, [selectedPeriodModal, modalSupplierGroups]);

  const categoriaChartData = useMemo(() => {
    const porCategoria = new Map<string, number>();
    abertas.forEach(l => {
      const cat = l.tipo_documento_descricao || 'Sem categoria';
      porCategoria.set(cat, (porCategoria.get(cat) || 0) + exposicao(l));
    });
    return Array.from(porCategoria.entries())
      .map(([categoria, valor]) => ({ categoria, valor }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 8)
      .map((d, i) => ({ ...d, cor: seriesColor(tokens, i) }));
  }, [abertas, tokens]);

  const fornecedoresChartData = useMemo(() => {
    const porFornecedor = new Map<string, number>();
    abertas.forEach(l => {
      const nome = l.razao_social_fornecedor || 'Sem fornecedor';
      porFornecedor.set(nome, (porFornecedor.get(nome) || 0) + exposicao(l));
    });
    return Array.from(porFornecedor.entries())
      .map(([fornecedor, valor]) => ({ fornecedor, valor }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 10);
  }, [abertas]);

  const agingChartData = useMemo(() => {
    const buckets = {
      'Vencido': 0,
      'Vence em até 7 dias': 0,
      'Vence em até 30 dias': 0,
      'Vence em 30+ dias': 0,
      'Sem vencimento informado': 0,
    };
    abertas.forEach(l => {
      const v = exposicao(l);
      if (!l.vencimento_liquido) {
        buckets['Sem vencimento informado'] += v;
      } else if (l.vencimento_liquido < hoje) {
        buckets['Vencido'] += v;
      } else if (l.vencimento_liquido < em7dias) {
        buckets['Vence em até 7 dias'] += v;
      } else if (l.vencimento_liquido < em30dias) {
        buckets['Vence em até 30 dias'] += v;
      } else {
        buckets['Vence em 30+ dias'] += v;
      }
    });
    const cores = [tokens.atraso[4], tokens.atraso[3], tokens.atraso[2], tokens.atraso[1], tokens.atraso[0]];
    return Object.entries(buckets).map(([bucket, valor], i) => ({ bucket, valor, cor: cores[i] }));
  }, [abertas, hoje, em7dias, em30dias, tokens]);

  function TemporalTooltip({ active, payload }: any) {
    if (!active || !payload?.length) return null;
    const row = payload[0].payload;
    const displayTitle = row.fullLabel || row.label;
    const totalAberto = (row.aVencer || 0) + (row.vencido || 0);
    const rows = [
      { color: METRIC_META.pago.color, label: 'Valor Pago', value: formatBRL(row.pago) },
      { label: 'Total em Aberto', value: formatBRL(totalAberto) },
      { color: METRIC_META.aVencer.color, label: 'A Vencer', value: formatBRL(row.aVencer), indent: true },
      { color: METRIC_META.vencido.color, label: 'Vencido', value: formatBRL(row.vencido), indent: true },
    ];
    return (
      <div className="space-y-1">
        <ChartTooltip title={`Período: ${displayTitle}`} rows={rows} />
        <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold px-2 py-0.5 text-center">
          💡 Clique na barra ou na legenda para abrir a tabela detalhada
        </p>
      </div>
    );
  }

  function CategoriaTooltip({ active, payload }: any) {
    if (!active || !payload?.length) return null;
    const row = payload[0].payload;
    const rows: { label: string; value: React.ReactNode; color?: string }[] = [
      { color: row.cor, label: 'Em aberto', value: formatBRL(row.valor) },
    ];
    return (
      <div className="space-y-1">
        <ChartTooltip title={row.categoria} rows={rows} />
        <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold px-2 py-0.5 text-center">
          💡 Clique na barra para abrir a tabela detalhada
        </p>
      </div>
    );
  }

  function FornecedorTooltip({ active, payload }: any) {
    if (!active || !payload?.length) return null;
    const row = payload[0].payload;
    const rows: { label: string; value: React.ReactNode; color?: string }[] = [
      { color: tokens.brand, label: 'Em aberto', value: formatBRL(row.valor) },
    ];
    return (
      <div className="space-y-1">
        <ChartTooltip title={row.fornecedor} rows={rows} />
        <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold px-2 py-0.5 text-center">
          💡 Clique na barra para abrir a tabela detalhada
        </p>
      </div>
    );
  }

  function AgingTooltip({ active, payload }: any) {
    if (!active || !payload?.length) return null;
    const row = payload[0].payload;
    const rows: { label: string; value: React.ReactNode; color?: string }[] = [
      { color: row.cor, label: 'Valor', value: formatBRL(row.valor) },
    ];
    return (
      <div className="space-y-1">
        <ChartTooltip title={row.bucket} rows={rows} />
        <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold px-2 py-0.5 text-center">
          💡 Clique na barra para abrir a tabela detalhada
        </p>
      </div>
    );
  }

  const temporalActions = (
    <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg text-xs font-semibold">
      <button
        onClick={() => setPeriodoVisao('mes')}
        className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
          periodoVisao === 'mes'
            ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-sm font-bold'
            : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
        }`}
      >
        Por Mês
      </button>
      <button
        onClick={() => setPeriodoVisao('semana')}
        className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
          periodoVisao === 'semana'
            ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-sm font-bold'
            : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
        }`}
      >
        Por Semana
      </button>
    </div>
  );

  const lastUpdated = useMemo(() => localDb.getDatasetUpdatedAt('fbl1n_c_pagar'), [linhas]);

  return (
    <div className="space-y-6 select-text max-w-[1600px] mx-auto pb-12">
      <div className="border-b border-slate-100 dark:border-slate-800 pb-5 flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-850 dark:text-slate-50 flex items-center gap-2.5">
            <BarChart3 className="h-7 w-7 text-emerald-600 dark:text-emerald-500" />
            Análise de Contas a Pagar
          </h2>
          <p className="text-sm text-slate-555 dark:text-slate-400 mt-1">
            Visão consolidada das partidas em aberto por categoria de documento, fornecedor, evolução temporal e vencimento.
          </p>
        </div>
        {lastUpdated && (
          <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <Clock className="h-3 w-3" />
            <span>{localDb.getDatasetUpdateBadge('contas_pagar')}</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar -mx-3 px-3 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0 lg:flex-wrap lg:overflow-visible">
        <MultiSelectFilter
          label="Fornecedor"
          icon={Building2}
          allLabel="Todos"
          searchable
          options={fornecedorOptions}
          selected={fornecedoresSelecionados}
          onChange={setFornecedoresSelecionados}
          renderOption={renderFornecedorOption}
          className="shrink-0 w-64 lg:w-auto lg:min-w-[220px]"
          panelClassName="w-80 sm:w-96 max-h-80"
        />
        <select
          value={tipoDocFilter}
          onChange={e => setTipoDocFilter(e.target.value)}
          className="px-3 py-2 border rounded-lg text-xs h-9 shrink-0 w-[170px] lg:w-auto lg:max-w-[240px] truncate"
          style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)', color: 'var(--ink-primary)' }}
          title="Filtrar por Tipo de Documento - Descrição"
        >
          <option value="Todos">Todos tipos de doc.</option>
          {tipoDocOptions.map(opt => (
            <option key={opt.key} value={opt.key}>{opt.label}</option>
          ))}
        </select>
        <div className="flex items-center gap-1.5 border rounded-lg px-3 py-1 text-xs h-9 shrink-0 whitespace-nowrap" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}>
          <span className="text-slate-500 font-semibold text-[11px] shrink-0">Período:</span>
          <input
            type="date"
            value={periodoDe}
            onChange={e => setPeriodoDe(e.target.value)}
            className="bg-transparent text-xs text-slate-800 dark:text-slate-200 outline-none cursor-pointer"
            title="Período Inicial"
          />
          <span className="text-slate-400 font-medium">até</span>
          <input
            type="date"
            value={periodoAte}
            onChange={e => setPeriodoAte(e.target.value)}
            className="bg-transparent text-xs text-slate-800 dark:text-slate-200 outline-none cursor-pointer"
            title="Período Final"
          />
        </div>
        <select
          value={mesSelecionado}
          onChange={e => {
            if (!e.target.value) return;
            const { de, ate } = mesParaPeriodo(e.target.value);
            setPeriodoDe(de);
            setPeriodoAte(ate);
          }}
          className="px-3 py-2 border rounded-lg text-xs h-9 shrink-0 w-[130px] lg:w-auto truncate capitalize"
          style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)', color: 'var(--ink-primary)' }}
          title="Selecionar um mês específico"
          disabled={mesesDisponiveis.length === 0}
        >
          <option value="">Mês específico…</option>
          {mesesDisponiveis.map(ym => (
            <option key={ym} value={ym}>{getMonthKeyAndLabel(ym).label}</option>
          ))}
        </select>
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/80 p-0.5 rounded-lg text-[11px] font-semibold shrink-0 whitespace-nowrap">
          <button
            onClick={() => { setPeriodoDe('2026-01-01'); setPeriodoAte('2026-12-31'); }}
            className={`px-2 py-1 rounded-md transition-all cursor-pointer ${
              periodoDe === '2026-01-01' && periodoAte === '2026-12-31'
                ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-sm font-bold'
                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            2026
          </button>
          <button
            onClick={() => { setPeriodoDe('2026-01-01'); setPeriodoAte('2026-06-30'); }}
            className={`px-2 py-1 rounded-md transition-all cursor-pointer ${
              periodoDe === '2026-01-01' && periodoAte === '2026-06-30'
                ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-sm font-bold'
                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            1º Sem.
          </button>
          <button
            onClick={() => { setPeriodoDe('2026-07-01'); setPeriodoAte('2026-12-31'); }}
            className={`px-2 py-1 rounded-md transition-all cursor-pointer ${
              periodoDe === '2026-07-01' && periodoAte === '2026-12-31'
                ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-sm font-bold'
                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            2º Sem.
          </button>
          <button
            onClick={() => { setPeriodoDe(''); setPeriodoAte(''); }}
            className={`px-2 py-1 rounded-md transition-all cursor-pointer ${
              !periodoDe && !periodoAte
                ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-sm font-bold'
                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            Todas Datas
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-semibold" style={{ background: 'color-mix(in srgb, #dc2626 10%, transparent)', color: '#dc2626' }}>
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <KpiCard label="Total em Aberto" value={kpis.totalAberto} format={formatBRL} icon={Wallet} accent="var(--brand)" />
        <KpiCard label="Total Vencido" value={kpis.totalVencido} format={formatBRL} icon={CalendarClock} accent="#dc2626" />
        <KpiCard label="Maior Fornecedor em Aberto" display={kpis.maiorFornecedor} detail={formatBRL(kpis.maiorFornecedorValor)} icon={Building2} accent="#0891b2" />
        <KpiCard label="Lançamentos em Aberto" value={kpis.qtdAbertas} format={(v) => String(Math.round(v))} icon={ListChecks} accent="#7c3aed" />
      </div>

      <ChartCard
        title="Evolução Temporal: Pago, A Vencer e Vencido"
        icon={CalendarClock}
        description={`Valor pago, a vencer e vencido agrupados ${periodoVisao === 'mes' ? 'por mês' : 'por semana'} pela data de pagamento (ou de vencimento, quando ainda em aberto). "A Vencer" + "Vencido" = total em aberto do período. Clique numa barra ou num item da legenda para abrir a tabela.`}
        height={410}
        // Três colunas por período (pago, a vencer, vencido) com rótulo de valor
        // no topo — "Por Semana" num ano inteiro passa fácil de 50 categorias;
        // "Por Mês" cabe folgado no mínimo e a rolagem só aparece quando a
        // granularidade é semanal ou o período filtrado é longo.
        minPlotWidth={estimateCategoryChartWidth(temporalChartData.length, periodoVisao === 'semana' ? 68 : 84, 480)}
        actions={temporalActions}
        loading={loading}
        empty={!loading && temporalChartData.length === 0}
        emptyMessage="Nenhuma partida encontrada no período selecionado."
      >
        <ResponsiveContainer width="100%" height={410}>
          <BarChart data={temporalChartData} margin={{ top: 54, right: 24, left: 0, bottom: 20 }}>
            <CartesianGrid {...c.grid} horizontal vertical={false} />
            <XAxis
              dataKey="label"
              {...c.xAxis}
              interval={0}
              minTickGap={8}
            />
            <YAxis tickFormatter={(v: number) => formatBRLCompacto(v)} {...c.yAxis} width={75} />
            <Tooltip content={<TemporalTooltip />} cursor={c.cursor} />
            <Legend
              onClick={handleLegendClick}
              wrapperStyle={{ paddingTop: 12, fontSize: 12, cursor: 'pointer' }}
              formatter={(value) => (
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer hover:underline" title="Clique para abrir a tabela desta série">
                  {value}
                </span>
              )}
            />
            <Bar
              dataKey="pago"
              name="Valor Pago"
              fill={METRIC_META.pago.color}
              radius={c.radius.top}
              maxBarSize={periodoVisao === 'semana' ? 12 : 24}
              className="cursor-pointer hover:opacity-80 transition-opacity"
              onClick={(entry) => handleBarClick(entry, 'pago')}
              {...c.animation}
            >
              <LabelList dataKey="pago" position="top" formatter={(v: number) => (v > 0 ? formatBRLCompacto(v) : '')} style={c.labelOnSurface} />
            </Bar>
            <Bar
              dataKey="aVencer"
              name="A Vencer"
              fill={METRIC_META.aVencer.color}
              radius={c.radius.top}
              maxBarSize={periodoVisao === 'semana' ? 12 : 24}
              className="cursor-pointer hover:opacity-80 transition-opacity"
              onClick={(entry) => handleBarClick(entry, 'aVencer')}
              {...c.animation}
            >
              <LabelList dataKey="aVencer" position="top" formatter={(v: number) => (Math.abs(v) >= 0.005 ? formatBRLCompacto(v) : '')} style={c.labelOnSurface} />
            </Bar>
            <Bar
              dataKey="vencido"
              name="Vencido"
              fill={METRIC_META.vencido.color}
              radius={c.radius.top}
              maxBarSize={periodoVisao === 'semana' ? 12 : 24}
              className="cursor-pointer hover:opacity-80 transition-opacity"
              onClick={(entry) => handleBarClick(entry, 'vencido')}
              {...c.animation}
            >
              <LabelList dataKey="vencido" position="top" formatter={(v: number) => (Math.abs(v) >= 0.005 ? formatBRLCompacto(v) : '')} style={c.labelOnSurface} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard
        title="Em Aberto por Tipo de Documento"
        icon={BarChart3}
        description="Soma do valor em aberto por tipo de documento SAP (ex.: Fatura de Logística, Estorno de Fornecedor). (Clique na barra para detalhar)"
        height={260}
        loading={loading}
        empty={!loading && categoriaChartData.length === 0}
        emptyMessage="Nenhuma partida em aberto no filtro selecionado."
      >
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={categoriaChartData} layout="vertical" margin={{ top: 4, right: 72, left: 0, bottom: 4 }}>
            <CartesianGrid {...c.grid} vertical horizontal={false} />
            <XAxis type="number" allowDecimals={false} tickFormatter={(v: number) => formatBRLCompacto(v)} {...c.yAxis} />
            <YAxis type="category" dataKey="categoria" {...c.xAxis} width={180} />
            <Tooltip content={<CategoriaTooltip />} cursor={c.cursor} />
            <Bar
              dataKey="valor"
              radius={c.radius.right}
              maxBarSize={28}
              className="cursor-pointer hover:opacity-80 transition-opacity"
              onClick={(entry) => handleCategoriaClick(entry)}
              {...c.animation}
            >
              {categoriaChartData.map(d => <Cell key={d.categoria} fill={d.cor} />)}
              <LabelList dataKey="valor" position="right" formatter={(v: number) => formatBRLCompacto(v)} style={c.labelOnSurface} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard
        title="Maiores Fornecedores em Aberto"
        icon={Building2}
        description="Top 10 fornecedores por valor em aberto. (Clique na barra para detalhar)"
        height={300}
        loading={loading}
        empty={!loading && fornecedoresChartData.length === 0}
        emptyMessage="Nenhuma partida em aberto no filtro selecionado."
      >
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={fornecedoresChartData} layout="vertical" margin={{ top: 4, right: 72, left: 0, bottom: 4 }}>
            <CartesianGrid {...c.grid} vertical horizontal={false} />
            <XAxis type="number" allowDecimals={false} tickFormatter={(v: number) => formatBRLCompacto(v)} {...c.yAxis} />
            <YAxis type="category" dataKey="fornecedor" {...c.xAxis} width={200} />
            <Tooltip content={<FornecedorTooltip />} cursor={c.cursor} />
            <Bar
              dataKey="valor"
              fill={tokens.brand}
              radius={c.radius.right}
              maxBarSize={22}
              className="cursor-pointer hover:opacity-80 transition-opacity"
              onClick={(entry) => handleFornecedorClick(entry)}
              {...c.animation}
            >
              <LabelList dataKey="valor" position="right" formatter={(v: number) => formatBRLCompacto(v)} style={c.labelOnSurface} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard
        title="Aging das Partidas em Aberto"
        icon={CalendarClock}
        description="Distribuição do valor em aberto por proximidade do vencimento. (Clique na barra para detalhar)"
        height={260}
        loading={loading}
        empty={!loading && kpis.qtdAbertas === 0}
        emptyMessage="Nenhuma partida em aberto no filtro selecionado."
      >
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={agingChartData} layout="vertical" margin={{ top: 4, right: 72, left: 0, bottom: 4 }}>
            <CartesianGrid {...c.grid} vertical horizontal={false} />
            <XAxis type="number" allowDecimals={false} tickFormatter={(v: number) => formatBRLCompacto(v)} {...c.yAxis} />
            <YAxis type="category" dataKey="bucket" {...c.xAxis} width={180} />
            <Tooltip content={<AgingTooltip />} cursor={c.cursor} />
            <Bar
              dataKey="valor"
              radius={c.radius.right}
              maxBarSize={28}
              className="cursor-pointer hover:opacity-80 transition-opacity"
              onClick={(entry) => handleAgingClick(entry)}
              {...c.animation}
            >
              {agingChartData.map(d => <Cell key={d.bucket} fill={d.cor} />)}
              <LabelList dataKey="valor" position="right" formatter={(v: number) => formatBRLCompacto(v)} style={c.labelOnSurface} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Modal / Janela Suspensa ao Clicar no Gráfico de Evolução Temporal */}
      {selectedPeriodModal && (
        <div
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-200"
          onClick={() => setSelectedPeriodModal(null)}
        >
          <div
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-[98vw] max-h-[95vh] flex flex-col overflow-hidden select-text"
            onClick={e => e.stopPropagation()}
          >
            {/* Cabeçalho do Modal */}
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/80 dark:bg-slate-950/80">
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: METRIC_META[selectedPeriodModal.metric].color }}
                  />
                  <h3 className="text-lg font-bold text-slate-900 dark:text-slate-50">
                    Lançamentos — {selectedPeriodModal.label}
                  </h3>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                    {METRIC_META[selectedPeriodModal.metric].label}
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Detalhamento por fornecedor dos lançamentos correspondentes à seleção no gráfico.
                </p>
              </div>
              <button
                onClick={() => setSelectedPeriodModal(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                title="Fechar janela"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Corpo do Modal */}
            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              {/* KPIs Resumidos */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50">
                  <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Total do Período</span>
                  <p className="text-base font-extrabold text-slate-900 dark:text-slate-100 mt-0.5">
                    {formatBRL(modalTotalValor)}
                  </p>
                </div>
                <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50">
                  <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Qtd. Lançamentos</span>
                  <p className="text-base font-extrabold text-slate-900 dark:text-slate-100 mt-0.5">
                    {selectedPeriodModal.items.length} doc(s)
                  </p>
                </div>
                <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50">
                  <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Fornecedores Envolvidos</span>
                  <p className="text-base font-extrabold text-slate-900 dark:text-slate-100 mt-0.5">
                    {modalSupplierGroups.length} fornecedor(es)
                  </p>
                </div>
                <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 flex items-center justify-end">
                  <button
                    onClick={() => {
                      const allNames = modalSupplierGroups.map(g => g.supplierName);
                      const allAreExpanded = allNames.every(n => !!modalExpandedSuppliers[n]);
                      const next: Record<string, boolean> = {};
                      allNames.forEach(n => { next[n] = !allAreExpanded; });
                      setModalExpandedSuppliers(next);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
                  >
                    <ChevronsUpDown className="h-3.5 w-3.5 text-slate-500" />
                    Toggle Expandir
                  </button>
                </div>
              </div>

              {/* Barra de Pesquisa e Ordenação */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Pesquisar fornecedor, nº documento ou tipo de doc..."
                    value={modalSearchQuery}
                    onChange={e => setModalSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-8 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
                  />
                  {modalSearchQuery && (
                    <button
                      onClick={() => setModalSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5"
                      title="Limpar pesquisa"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-500 font-medium">
                    Exibindo <strong>{modalSupplierGroups.length}</strong> fornecedor(es)
                  </span>
                  <button
                    type="button"
                    onClick={() => setModalSortDir(prev => (prev === 'desc' ? 'asc' : 'desc'))}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    <span>Ordenar por Montante:</span>
                    {modalSortDir === 'desc' ? (
                      <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                        Maior p/ Menor <ArrowDown className="h-3.5 w-3.5" />
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                        Menor p/ Maior <ArrowUp className="h-3.5 w-3.5" />
                      </span>
                    )}
                  </button>
                </div>
              </div>

              {/* Tabela por Fornecedor (Idêntica ao Contas a Pagar) */}
              {modalSupplierGroups.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  {modalSearchQuery ? 'Nenhum lançamento encontrado para a pesquisa informada.' : 'Nenhum lançamento encontrado para esta barra.'}
                </div>
              ) : (
                <TableShell maxHeight="58vh" className="w-full">
                  <table className="w-full text-xs border-collapse">
                    <TableHeadRow>
                      <th className="px-4 py-3 text-left font-bold text-slate-600 dark:text-slate-400">Fornecedor (Razão Social)</th>
                      <th className="px-4 py-3 text-center font-bold text-slate-600 dark:text-slate-400">Qtd. Lançamentos</th>
                      <th className="px-4 py-3 text-right font-bold text-slate-600 dark:text-slate-400">Total em Aberto</th>
                      <th className="px-4 py-3 text-right font-bold text-slate-600 dark:text-slate-400">
                        <button
                          type="button"
                          onClick={() => setModalSortDir(prev => (prev === 'desc' ? 'asc' : 'desc'))}
                          className="inline-flex items-center gap-1.5 font-bold hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors cursor-pointer"
                          title="Clique para alterar ordenação por Montante Líquido Total"
                        >
                          Montante Líquido Total
                          {modalSortDir === 'desc' ? (
                            <ArrowDown className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                          ) : (
                            <ArrowUp className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                          )}
                        </button>
                      </th>
                      <th className="px-4 py-3 text-right font-bold text-slate-600 dark:text-slate-400 w-28">% do Total</th>
                      <th className="px-4 py-3 text-left font-bold text-slate-600 dark:text-slate-400">Status Geral</th>
                    </TableHeadRow>
                    <TableBody>
                      {modalSupplierGroups.map(group => {
                        const isExpanded = !!modalExpandedSuppliers[group.supplierName];
                        const pctSupplier = modalGrossTotal > 0 ? (group.grossValor / modalGrossTotal) * 100 : 0;
                        return (
                          <React.Fragment key={group.supplierName}>
                            {/* Linha Mãe: Totalizador por Fornecedor */}
                            <tr
                              onClick={() => {
                                setModalExpandedSuppliers(prev => ({
                                  ...prev,
                                  [group.supplierName]: !prev[group.supplierName],
                                }));
                              }}
                              className={`transition-colors cursor-pointer select-none border-b border-slate-200/80 dark:border-slate-800 ${
                                isExpanded
                                  ? 'bg-emerald-50/60 dark:bg-emerald-950/20 hover:bg-emerald-100/60 dark:hover:bg-emerald-950/30'
                                  : 'bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                              }`}
                            >
                              <Td>
                                <div className="flex items-center gap-2.5 py-0.5">
                                  <span className="p-1 rounded hover:bg-slate-200/70 dark:hover:bg-slate-700/70 transition-colors shrink-0">
                                    {isExpanded ? (
                                      <ChevronDown className="h-4 w-4 text-emerald-600 dark:text-emerald-400 font-bold" />
                                    ) : (
                                      <ChevronRight className="h-4 w-4 text-slate-400" />
                                    )}
                                  </span>
                                  <div className="min-w-0">
                                    <span className="font-bold text-slate-900 dark:text-slate-100 text-sm block truncate" title={group.supplierName}>
                                      {group.supplierName}
                                    </span>
                                    {group.fornecedorCodigo && (
                                      <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500">
                                        Cód. SAP: {group.fornecedorCodigo}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </Td>
                              <Td className="text-center">
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                                  {group.qtdLancamentos} doc(s)
                                </span>
                              </Td>
                              <Td align="right" numeric strong>
                                {Math.abs(group.totalExposicaoAberto) >= 0.005 ? (
                                  <span className="text-amber-600 dark:text-amber-400 font-extrabold">
                                    {formatBRL(group.totalExposicaoAberto)}
                                  </span>
                                ) : (
                                  <span className="text-slate-400 font-normal">—</span>
                                )}
                              </Td>
                              <Td align="right" numeric strong className="text-slate-900 dark:text-slate-100 font-extrabold">
                                {formatBRL(group.totalValor)}
                              </Td>
                              <Td align="right" numeric className="font-bold text-slate-700 dark:text-slate-300">
                                {formatPct(pctSupplier)}
                              </Td>
                              <Td>
                                <div className="flex flex-wrap items-center gap-1.5">
                                  {group.qtdVencidos > 0 && (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-900/50">
                                      {group.qtdVencidos} vencido(s)
                                    </span>
                                  )}
                                  {group.qtdAbertos > 0 && (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-900/50">
                                      {group.qtdAbertos} em aberto
                                    </span>
                                  )}
                                  {group.qtdCompensados > 0 && (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/50">
                                      {group.qtdCompensados} compensado(s)
                                    </span>
                                  )}
                                </div>
                              </Td>
                            </tr>

                            {/* Linhas Filhas: Detalhes dos Lançamentos */}
                            {isExpanded && (
                              <tr>
                                <td colSpan={6} className="p-0 border-b-2 border-emerald-500/40 bg-slate-50/70 dark:bg-slate-950/60">
                                  <div className="py-2.5 px-4 sm:px-8 border-l-4 border-emerald-500">
                                    <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wider flex items-center justify-between">
                                      <span>Detalhes das Partidas — {group.supplierName} ({group.items.length} lançamento(s))</span>
                                    </div>
                                    <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-inner">
                                      <table className="w-full text-xs">
                                        <thead>
                                          <tr className="bg-slate-100/80 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 text-[11px]">
                                            <th className="px-3 py-2 text-left font-bold">Nº Documento</th>
                                            <th className="px-3 py-2 text-left font-bold">Tipo Doc. - Descrição</th>
                                            <th className="px-3 py-2 text-left font-bold">Empresa</th>
                                            <th className="px-3 py-2 text-left font-bold">Data Lançamento</th>
                                            <th className="px-3 py-2 text-left font-bold">Vencimento Líquido</th>
                                            <th className="px-3 py-2 text-right font-bold">Valor Moeda Doc.</th>
                                            <th className="px-3 py-2 text-right font-bold w-24">% do Total</th>
                                            <th className="px-3 py-2 text-left font-bold">Doc. Compensação</th>
                                            <th className="px-3 py-2 text-center font-bold">Status</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                                          {group.items.map(l => {
                                            const tipoLabel = formatTipoDocLabel(l);
                                            const isComp = Boolean(
                                              (l.doc_compensacao && l.doc_compensacao.trim() !== '' && l.doc_compensacao.trim() !== '—') ||
                                              l.data_compensacao
                                            );
                                            const st = isComp ? 'Compensado' : 'Em aberto';
                                            const isVencido = st === 'Em aberto' && l.vencimento_liquido && l.vencimento_liquido < hoje;
                                            const pctDoc = modalGrossTotal > 0 ? (Math.abs(l.montante_moeda_doc || 0) / modalGrossTotal) * 100 : 0;
                                            return (
                                              <tr key={l.id || `${l.numero_documento}-${l.vencimento_liquido}`} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                                                <td className="px-3 py-2 font-mono font-medium text-slate-800 dark:text-slate-200">
                                                  {l.numero_documento || '—'}
                                                </td>
                                                <td className="px-3 py-2 text-slate-700 dark:text-slate-300 truncate max-w-[200px]" title={tipoLabel}>
                                                  {tipoLabel}
                                                </td>
                                                <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{l.empresa || '—'}</td>
                                                <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{formatDateBR(l.data_lancamento)}</td>
                                                <td className={`px-3 py-2 font-medium ${isVencido ? 'text-red-600 dark:text-red-400 font-bold' : 'text-slate-700 dark:text-slate-300'}`}>
                                                  {formatDateBR(l.vencimento_liquido)}
                                                  {isVencido && <span className="ml-1 text-[10px] font-extrabold text-red-600 dark:text-red-400">(Vencido)</span>}
                                                </td>
                                                <td className="px-3 py-2 text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                                                  {formatBRL(l.montante_moeda_doc)}
                                                </td>
                                                <td className="px-3 py-2 text-right font-mono font-medium text-slate-700 dark:text-slate-300">
                                                  {formatPct(pctDoc)}
                                                </td>
                                                <td className="px-3 py-2 font-mono text-slate-500 dark:text-slate-400">{l.doc_compensacao || '—'}</td>
                                                <td className="px-3 py-2 text-center">
                                                  <span
                                                    className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold"
                                                    style={{
                                                      color: st === 'Em aberto' ? (isVencido ? '#dc2626' : '#d97706') : '#059669',
                                                      background: st === 'Em aberto'
                                                        ? (isVencido ? 'color-mix(in srgb, #dc2626 14%, transparent)' : 'color-mix(in srgb, #d97706 14%, transparent)')
                                                        : 'color-mix(in srgb, #059669 14%, transparent)',
                                                    }}
                                                  >
                                                    {st}
                                                  </span>
                                                </td>
                                              </tr>
                                            );
                                          })}
                                        </tbody>
                                      </table>
                                    </div>
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
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

