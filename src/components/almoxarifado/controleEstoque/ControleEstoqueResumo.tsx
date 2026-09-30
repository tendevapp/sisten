import React, { useMemo } from 'react';
import { AlertTriangle, Boxes, CircleDollarSign, ClipboardList, PackageCheck, Receipt, ShoppingCart, TrendingDown, TrendingUp } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import KpiCard from '../../charts/KpiCard';
import type { ControleEstoqueAnalise } from '../../../lib/controleEstoque';
import { formatBRL, formatQtd } from '../../../lib/almoxarifado';
import { formatInt } from '../../../lib/format';

interface Props {
  linhas: ControleEstoqueAnalise[];
}

const CORES_STATUS: Record<string, string> = {
  CRITICO: 'var(--status-critical)',
  ALERTA: 'var(--status-warning)',
  OK: 'var(--status-good)',
  SEM_DADOS: 'var(--ink-muted)',
};

const rotuloMes = (iso: string) => {
  const [ano, mes] = iso.slice(0, 7).split('-');
  return `${mes}/${ano.slice(2)}`;
};

export default function ControleEstoqueResumo({ linhas }: Props) {
  const kpis = useMemo(() => {
    const itens = linhas.map(linha => linha.item);
    const entrada = itens.reduce((total, item) => total + item.entrada_valor, 0);
    const consumo = itens.reduce((total, item) => total + item.consumo_valor, 0);
    return {
      total: linhas.length,
      criticos: linhas.filter(linha => linha.faixa.status === 'CRITICO').length,
      alertas: linhas.filter(linha => linha.faixa.status === 'ALERTA').length,
      comRm: itens.filter(item => item.rms_abertas > 0).length,
      comPo: itens.filter(item => item.pos_abertas > 0).length,
      compra: linhas.reduce((total, linha) => total + (linha.faixa.valorComprar ?? 0), 0),
      entrada,
      consumo,
      saldoFinanceiro: entrada - consumo,
      estoque: itens.reduce((total, item) => total + item.valor_estoque, 0),
    };
  }, [linhas]);

  const status = useMemo(() => Object.keys(CORES_STATUS).map(nome => ({
    nome: nome === 'SEM_DADOS' ? 'Sem dados' : nome === 'CRITICO' ? 'Crítico' : nome[0] + nome.slice(1).toLowerCase(),
    chave: nome,
    quantidade: linhas.filter(linha => linha.faixa.status === nome).length,
  })).filter(item => item.quantidade > 0), [linhas]);

  const serie = useMemo(() => {
    const mapa = new Map<string, { mes: string; entrada: number; consumo: number }>();
    linhas.forEach(({ item }) => item.movimentos_mensais.forEach(movimento => {
      const atual = mapa.get(movimento.mes) ?? { mes: movimento.mes, entrada: 0, consumo: 0 };
      atual.entrada += movimento.entrada;
      atual.consumo += movimento.consumo;
      mapa.set(movimento.mes, atual);
    }));
    return Array.from(mapa.values()).sort((a, b) => a.mes.localeCompare(b.mes)).map(item => ({ ...item, rotulo: rotuloMes(item.mes) }));
  }, [linhas]);

  const rankings = useMemo(() => ({
    consumo: [...linhas].sort((a, b) => b.item.consumo_total - a.item.consumo_total).slice(0, 8),
    entrada: [...linhas].sort((a, b) => b.item.entrada_quantidade - a.item.entrada_quantidade).slice(0, 8),
    abc: ['A', 'B', 'C', 'SEM CLASSE'].map(classe => ({
      classe,
      quantidade: linhas.filter(({ item }) => (item.curva_abc?.trim() || 'SEM CLASSE') === classe).length,
    })),
  }), [linhas]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KpiCard label="SKUs no recorte" value={kpis.total} format={formatInt} icon={Boxes} accent="var(--brand)" />
        <KpiCard label="Críticos" value={kpis.criticos} format={formatInt} icon={AlertTriangle} accent="var(--status-critical)" emphasize share={kpis.total ? kpis.criticos / kpis.total : 0} />
        <KpiCard label="Alertas" value={kpis.alertas} format={formatInt} icon={TrendingDown} accent="var(--status-warning)" share={kpis.total ? kpis.alertas / kpis.total : 0} />
        <KpiCard label="Com RM aberta" value={kpis.comRm} format={formatInt} icon={ClipboardList} accent="var(--series-2)" />
        <KpiCard label="Com PO pendente" value={kpis.comPo} format={formatInt} icon={Receipt} accent="var(--series-3)" />
        <KpiCard label="Compra estimada" value={kpis.compra} format={formatBRL} icon={ShoppingCart} accent="var(--status-critical)" />
        <KpiCard label="Valor de entradas" value={kpis.entrada} format={formatBRL} icon={TrendingUp} accent="var(--status-good)" />
        <KpiCard label="Valor consumido" value={kpis.consumo} format={formatBRL} icon={TrendingDown} accent="var(--series-4)" />
        <KpiCard label="Saldo financeiro" value={kpis.saldoFinanceiro} format={formatBRL} icon={CircleDollarSign} accent="var(--series-1)" />
        <KpiCard label="Valor em estoque" value={kpis.estoque} format={formatBRL} icon={PackageCheck} accent="var(--brand)" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <section className="rounded-xl border p-4" style={{ background: 'var(--surface-card)', borderColor: 'var(--hairline)' }}>
          <h3 className="text-xs font-black uppercase tracking-wider mb-3" style={{ color: 'var(--ink-primary)' }}>Entradas x consumo por mês</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={serie} margin={{ left: 6, right: 14, top: 8, bottom: 2 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--hairline)" />
                <XAxis dataKey="rotulo" tick={{ fontSize: 10, fill: 'var(--ink-muted)' }} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--ink-muted)' }} />
                <Tooltip formatter={(valor: number) => formatQtd(valor)} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="entrada" name="Entradas" stroke="var(--status-good)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="consumo" name="Consumo" stroke="var(--status-critical)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="rounded-xl border p-4" style={{ background: 'var(--surface-card)', borderColor: 'var(--hairline)' }}>
          <h3 className="text-xs font-black uppercase tracking-wider mb-3" style={{ color: 'var(--ink-primary)' }}>Distribuição por status</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={status} dataKey="quantidade" nameKey="nome" innerRadius={58} outerRadius={94} paddingAngle={2}>
                  {status.map(item => <Cell key={item.chave} fill={CORES_STATUS[item.chave]} />)}
                </Pie>
                <Tooltip formatter={(valor: number) => formatInt(valor)} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {([
          ['Top consumo', rankings.consumo, 'consumo_total', 'var(--status-critical)'],
          ['Top entrada', rankings.entrada, 'entrada_quantidade', 'var(--status-good)'],
        ] as const).map(([titulo, dados, chave, cor]) => (
          <section key={titulo} className="rounded-xl border p-4" style={{ background: 'var(--surface-card)', borderColor: 'var(--hairline)' }}>
            <h3 className="text-xs font-black uppercase tracking-wider mb-3" style={{ color: 'var(--ink-primary)' }}>{titulo}</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dados.map(linha => ({ material: linha.item.material, valor: linha.item[chave] }))} layout="vertical" margin={{ left: 8, right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--hairline)" />
                  <XAxis type="number" tick={{ fontSize: 9 }} />
                  <YAxis type="category" dataKey="material" width={82} tick={{ fontSize: 9 }} />
                  <Tooltip formatter={(valor: number) => formatQtd(valor)} />
                  <Bar dataKey="valor" fill={cor} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        ))}

        <section className="rounded-xl border p-4" style={{ background: 'var(--surface-card)', borderColor: 'var(--hairline)' }}>
          <h3 className="text-xs font-black uppercase tracking-wider mb-3" style={{ color: 'var(--ink-primary)' }}>Curva ABC</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rankings.abc}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--hairline)" />
                <XAxis dataKey="classe" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(valor: number) => formatInt(valor)} />
                <Bar dataKey="quantidade" fill="var(--brand)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>
    </div>
  );
}
