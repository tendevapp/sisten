/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Contratos › Auditoria: relatório que confronta cada contrato (ME3N) com os
 * pedidos de call-off e com o que o Financeiro lançou e pagou na FBL1N —
 * saldo, consumo, estouro, lançamento fora da vigência, NF repetida, partida
 * vencida/bloqueada, lançamento sem pedido e o log de alterações de valor.
 *
 * As regras moram em `lib/contratosAuditoria.ts`; o vínculo com a FBL1N, nas
 * views da migration `20261116120000_contratos_auditoria.sql`.
 */

import React, { useCallback, useEffect, useId, useMemo, useState } from 'react';
import {
  AlertCircle, AlertTriangle, Banknote, ChevronDown, ChevronRight, Database, FileSpreadsheet,
  Info, Receipt, RefreshCw, Search, ShieldAlert, ShieldCheck, Wallet,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { localDb } from '../../db/localDb';
import { agruparContratos, mesclarDetalhes, ContratoComDetalhes, StatusVigencia } from '../../lib/contratos';
import {
  montarAuditoria, AuditoriaContrato, ResultadoAuditoria, RegraAuditoria, Severidade,
  ROTULO_REGRA, ROTULO_CURTO_REGRA, ORDEM_SEVERIDADE, rotuloVinculo, rotuloCampoAlteracao, CoberturaAuditoria,
  CATEGORIA_REGRA, ROTULO_CATEGORIA, ORDEM_CATEGORIA, ORIENTACAO_REGRA, rotuloMes,
} from '../../lib/contratosAuditoria';
import { carregarDadosAuditoria } from '../../lib/contratosAuditoriaApi';
import { hojeISO } from '../../lib/contasPagar';
import { extrairPalavrasChave, casarTokens } from '../../lib/buscaKeywords';
import { formatBRL, formatBRLCompacto, formatDateBR, formatInt } from '../../lib/format';
import KpiCard from '../charts/KpiCard';
import {
  TableShell, TableHeadRow, TableBody, SortableTh, Th, Tr, Td, TableSkeleton, TableEmpty, TableFooter,
  TableCards, TableCardRow, TableDesktop, SortDir,
} from '../ui/DataTable';
import ContratoAuditoriaModal from './ContratoAuditoriaModal';
import { BarraConsumo, CorSeveridade, IconeCategoria, ResumoOcorrencias, RotuloSeveridade } from './auditoriaUi';

const PAGE_SIZE = 50;
const DIAS_ME3N_DEFASADA = 30;

type FiltroSeveridade = 'Todas' | Severidade | 'ok' | 'com_ocorrencia';
type Coluna = 'contrato' | 'fornecedor' | 'fim' | 'global' | 'pedidos' | 'lancado' | 'pago' | 'aberto' | 'saldo' | 'consumo' | 'ocorrencias';

const VIGENCIAS: StatusVigencia[] = ['Vencido', 'Vencendo em breve', 'Vigente', 'Sem vigência informada'];

const selectClass = 'w-full pl-3 pr-8 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-bold text-slate-700 dark:text-slate-300 focus:border-emerald-500 focus:outline-none cursor-pointer appearance-none truncate';

function diasDesde(isoData: string | null, hoje: string): number | null {
  if (!isoData) return null;
  const d = isoData.slice(0, 10);
  const u = (x: string) => Date.UTC(+x.slice(0, 4), +x.slice(5, 7) - 1, +x.slice(8, 10));
  return Math.round((u(hoje) - u(d)) / 86_400_000);
}

interface ResumoRegra {
  regra: RegraAuditoria;
  contratos: number;
  critico: number;
  alerta: number;
  info: number;
  valor: number;
}

function piorSeveridade(r: ResumoRegra): Severidade {
  return r.critico > 0 ? 'critico' : r.alerta > 0 ? 'alerta' : 'info';
}

/**
 * Ocorrências por tipo, agrupadas por categoria. Cada tipo mostra quantos
 * contratos acusam (separado por severidade) e o valor envolvido; clicar
 * filtra a lista por ele.
 */
function PainelTipos({ contratos, regraAtiva, onSelecionar }: {
  contratos: AuditoriaContrato[];
  regraAtiva: 'Todas' | RegraAuditoria;
  onSelecionar: (r: 'Todas' | RegraAuditoria) => void;
}) {
  const porCategoria = useMemo(() => {
    const m = new Map<RegraAuditoria, ResumoRegra>();
    contratos.forEach(a => {
      const vistas = new Set<RegraAuditoria>();
      a.ocorrencias.forEach(o => {
        const r = m.get(o.regra) || { regra: o.regra, contratos: 0, critico: 0, alerta: 0, info: 0, valor: 0 };
        if (!vistas.has(o.regra)) { r.contratos++; vistas.add(o.regra); }
        r[o.severidade]++;
        r.valor += o.valor ?? 0;
        m.set(o.regra, r);
      });
    });
    return ORDEM_CATEGORIA
      .map(cat => ({
        cat,
        regras: Array.from(m.values())
          .filter(r => CATEGORIA_REGRA[r.regra] === cat)
          .sort((x, y) => ORDEM_SEVERIDADE[piorSeveridade(x)] - ORDEM_SEVERIDADE[piorSeveridade(y)] || y.contratos - x.contratos),
      }))
      .filter(g => g.regras.length > 0);
  }, [contratos]);

  if (!porCategoria.length) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--ink-secondary)' }}>Ocorrências por tipo</h3>
        {regraAtiva !== 'Todas' && (
          <button type="button" onClick={() => onSelecionar('Todas')} className="text-[11px] font-bold cursor-pointer hover:underline" style={{ color: 'var(--brand-strong)' }}>
            Limpar filtro de tipo
          </button>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
        {porCategoria.map(({ cat, regras }) => {
          const Icone = IconeCategoria[cat];
          return (
            <div key={cat} className="rounded-xl border p-3 space-y-1" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}>
              <div className="flex items-center gap-2 pb-1.5">
                <Icone className="h-4 w-4" style={{ color: 'var(--ink-secondary)' }} aria-hidden />
                <span className="text-xs font-bold" style={{ color: 'var(--ink-primary)' }}>{ROTULO_CATEGORIA[cat]}</span>
              </div>
              {regras.map(r => {
                const sev = piorSeveridade(r);
                const cor = CorSeveridade[sev];
                const ativo = regraAtiva === r.regra;
                const partes = (['critico', 'alerta', 'info'] as Severidade[]).filter(s => r[s] > 0)
                  .map(s => `${r[s]} ${RotuloSeveridade[s].toLowerCase()}`);
                return (
                  <button
                    key={r.regra}
                    type="button"
                    aria-pressed={ativo}
                    onClick={() => onSelecionar(ativo ? 'Todas' : r.regra)}
                    title={`${ROTULO_REGRA[r.regra]} — ${partes.join(', ')}. ${ORIENTACAO_REGRA[r.regra]}`}
                    className="w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-left cursor-pointer transition-colors hover:bg-[var(--surface-raised)]"
                    style={{
                      background: ativo ? `color-mix(in srgb, ${cor} 14%, transparent)` : undefined,
                      boxShadow: ativo ? `inset 0 0 0 1px ${cor}` : undefined,
                    }}
                  >
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ background: cor }} />
                    <span className="flex-1 min-w-0">
                      <span className="block text-xs font-bold truncate" style={{ color: 'var(--ink-primary)' }}>{ROTULO_CURTO_REGRA[r.regra]}</span>
                      <span className="block text-[10px] truncate" style={{ color: 'var(--ink-secondary)' }}>
                        {r.contratos} {r.contratos === 1 ? 'contrato' : 'contratos'}
                        {r.valor > 0 ? ` · ${formatBRLCompacto(r.valor)}` : ''}
                      </span>
                    </span>
                    <span className="text-xs font-extrabold tabular" style={{ color: sev === 'info' ? 'var(--ink-secondary)' : cor }}>{r.contratos}</span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Aviso das fontes: datas de cada extração e o que isso limita. */
function AvisoCobertura({ cobertura, hoje }: { cobertura: CoberturaAuditoria | null; hoje: string }) {
  const [aberto, setAberto] = useState(false);
  if (!cobertura) return null;
  const idadeMe3n = diasDesde(cobertura.me3n_importado_em, hoje);
  const zlAte = cobertura.zl0170_ate;
  const fblAte = cobertura.fbl1n_ate;
  const avisos: string[] = [];
  if (idadeMe3n !== null && idadeMe3n > DIAS_ME3N_DEFASADA) {
    avisos.push(`A ME3N foi importada há ${idadeMe3n} dias (${formatDateBR(cobertura.me3n_importado_em)}): valor global e vigência podem estar desatualizados.`);
  }
  if (zlAte && fblAte && zlAte < fblAte) {
    avisos.push(`A ZL0170 (MIRO) vai até ${formatDateBR(zlAte)} e a FBL1N até ${formatDateBR(fblAte)}: lançamentos depois de ${formatDateBR(zlAte)} ainda não têm pedido e aparecem como "só pelo fornecedor".`);
  }
  if (cobertura.fbl1n_de) {
    avisos.push(`A FBL1N começa em ${formatDateBR(cobertura.fbl1n_de)}: pagamento anterior a essa data não entra no lançado/pago.`);
  }
  const temAviso = avisos.length > 0;
  const cor = temAviso ? 'var(--status-warning)' : 'var(--ink-muted)';

  return (
    <div className="rounded-xl border p-3.5" style={{ borderColor: temAviso ? cor : 'var(--hairline)', background: temAviso ? 'color-mix(in srgb, var(--status-warning) 7%, transparent)' : 'var(--surface-card)' }}>
      <button
        type="button"
        onClick={() => setAberto(v => !v)}
        aria-expanded={aberto}
        className="w-full flex items-start gap-2.5 text-left cursor-pointer"
      >
        {temAviso ? <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" style={{ color: cor }} /> : <Database className="h-4 w-4 shrink-0 mt-0.5" style={{ color: cor }} />}
        <span className="flex-1 text-xs" style={{ color: 'var(--ink-secondary)' }}>
          <span className="font-bold" style={{ color: 'var(--ink-primary)' }}>Fontes da auditoria: </span>
          ME3N {formatDateBR(cobertura.me3n_importado_em)} · ZL0170 até {formatDateBR(zlAte)} · FBL1N {formatDateBR(cobertura.fbl1n_de)} a {formatDateBR(fblAte)}
          {temAviso && <span className="font-bold" style={{ color: cor }}> · {avisos.length} aviso(s)</span>}
        </span>
        {aberto ? <ChevronDown className="h-4 w-4 shrink-0" style={{ color: 'var(--ink-muted)' }} /> : <ChevronRight className="h-4 w-4 shrink-0" style={{ color: 'var(--ink-muted)' }} />}
      </button>
      {aberto && (
        <div className="mt-3 pl-6 space-y-2 text-xs" style={{ color: 'var(--ink-secondary)' }}>
          {avisos.map((a, i) => <p key={i}>• {a}</p>)}
          <p>
            <span className="font-bold">Como o vínculo é feito:</span> a FBL1N não traz o pedido. A partida entra no contrato quando o documento
            contábil sai de uma MIRO (ZL0170) de pedido do contrato (ZL0132/ME2L). Partida do fornecedor sem MIRO só é atribuída se ele tiver um
            contrato só, marcada "a conferir". Estorno de MIRO compensado sem pagamento aparece riscado e fica fora das somas.
          </p>
        </div>
      )}
    </div>
  );
}

export default function TabAuditoria() {
  const hoje = hojeISO();
  const idBusca = useId();
  const idSeveridade = useId();
  const idRegra = useId();
  const idVigencia = useId();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoAuditoria | null>(null);
  const [cobertura, setCobertura] = useState<CoberturaAuditoria | null>(null);
  const [selecionado, setSelecionado] = useState<AuditoriaContrato | null>(null);
  const [mostrarNaoAtribuidos, setMostrarNaoAtribuidos] = useState(false);

  const [busca, setBusca] = useState('');
  const [filtroSeveridade, setFiltroSeveridade] = useState<FiltroSeveridade>('Todas');
  const [filtroRegra, setFiltroRegra] = useState<'Todas' | RegraAuditoria>('Todas');
  const [filtroVigencia, setFiltroVigencia] = useState<'Todas' | StatusVigencia>('Todas');
  const [sortCol, setSortCol] = useState<Coluna | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [visiveis, setVisiveis] = useState(PAGE_SIZE);

  const load = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const [linhas, detalhes, dados] = await Promise.all([
        localDb.fetchContratos(force),
        localDb.fetchContratosDetalhes(force),
        carregarDadosAuditoria(),
      ]);
      const contratos: ContratoComDetalhes[] = mesclarDetalhes(agruparContratos(linhas), detalhes);
      setCobertura(dados.cobertura);
      setResultado(montarAuditoria({ contratos, ...dados, hoje: hojeISO() }));
    } catch (e) {
      console.error('Erro ao montar a auditoria de contratos:', e);
      setError('Não foi possível montar a auditoria. Confira a conexão e toque em Atualizar.');
      setResultado(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(false); }, [load]);

  const todos = resultado?.contratos || [];

  const regrasPresentes = useMemo(() => {
    const s = new Set<RegraAuditoria>();
    todos.forEach(a => a.ocorrencias.forEach(o => s.add(o.regra)));
    return (Object.keys(ROTULO_REGRA) as RegraAuditoria[]).filter(r => s.has(r));
  }, [todos]);

  const filtrados = useMemo(() => {
    const tokens = extrairPalavrasChave(busca);
    return todos.filter(a => {
      if (filtroSeveridade === 'com_ocorrencia' && (a.severidade === 'ok' || a.severidade === 'info')) return false;
      if (filtroSeveridade !== 'Todas' && filtroSeveridade !== 'com_ocorrencia' && a.severidade !== filtroSeveridade) return false;
      if (filtroRegra !== 'Todas' && !a.ocorrencias.some(o => o.regra === filtroRegra)) return false;
      if (filtroVigencia !== 'Todas' && a.contrato.status_vigencia !== filtroVigencia) return false;
      if (tokens.length > 0) {
        const alvos = [
          a.contrato.documento_compras, a.contrato.fornecedor, a.contrato.detalhes?.gestor, a.contrato.detalhes?.escopo_servico,
          ...a.pedidos.map(p => p.pedido),
          ...a.lancamentos.flatMap(l => [l.documento, l.referencia, l.docMiro]),
        ];
        if (!casarTokens(alvos, tokens)) return false;
      }
      return true;
    });
  }, [todos, filtroSeveridade, filtroRegra, filtroVigencia, busca]);

  const ordenados = useMemo(() => {
    const arr = [...filtrados];
    if (!sortCol) {
      // Padrão: pior severidade primeiro, depois quem mais consumiu.
      return arr.sort((x, y) => {
        const s = ORDEM_SEVERIDADE[x.severidade] - ORDEM_SEVERIDADE[y.severidade];
        if (s !== 0) return s;
        return (y.consumo ?? -1) - (x.consumo ?? -1);
      });
    }
    const val = (a: AuditoriaContrato): number | string => {
      switch (sortCol) {
        case 'contrato': return a.contrato.documento_compras;
        case 'fornecedor': return a.contrato.fornecedor.toLowerCase();
        case 'fim': return a.contrato.fim_validade || '';
        case 'global': return a.valorGlobal;
        case 'pedidos': return a.valorPedidos;
        case 'lancado': return a.lancado;
        case 'pago': return a.pago;
        case 'aberto': return a.aberto;
        case 'saldo': return a.saldo;
        case 'consumo': return a.consumo ?? -1;
        case 'ocorrencias': return -ORDEM_SEVERIDADE[a.severidade] * 1000 + a.ocorrencias.length;
      }
    };
    const dir = sortDir === 'asc' ? 1 : -1;
    return arr.sort((x, y) => {
      const a = val(x), b = val(y);
      if (typeof a === 'number' && typeof b === 'number') return (a - b) * dir;
      return String(a).localeCompare(String(b), 'pt-BR', { numeric: true }) * dir;
    });
  }, [filtrados, sortCol, sortDir]);

  useEffect(() => { setVisiveis(PAGE_SIZE); }, [busca, filtroSeveridade, filtroRegra, filtroVigencia, sortCol, sortDir]);

  const ordenar = (c: Coluna) => {
    if (sortCol === c) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortCol(c); setSortDir(c === 'contrato' || c === 'fornecedor' || c === 'fim' ? 'asc' : 'desc'); }
  };

  const kpis = useMemo(() => {
    const soma = (f: (a: AuditoriaContrato) => number) => todos.reduce((s, a) => s + f(a), 0);
    return {
      global: soma(a => a.valorGlobal),
      lancado: soma(a => a.lancado),
      lancadoFornecedor: soma(a => a.lancadoFornecedor),
      pago: soma(a => a.pago),
      aberto: soma(a => a.aberto),
      vencido: soma(a => a.vencidoAberto),
      criticos: todos.filter(a => a.severidade === 'critico').length,
      alertas: todos.filter(a => a.severidade === 'alerta').length,
    };
  }, [todos]);

  const naoAtribuidos = resultado?.naoAtribuidos || [];
  const somaNaoAtribuidos = naoAtribuidos.reduce((s, l) => s + (l.anulada ? 0 : l.valor), 0);

  const exportar = () => {
    if (!todos.length) return;
    const lista = ordenados.length ? ordenados : todos;
    const resumo = lista.map(a => ({
      'Contrato': a.contrato.documento_compras,
      'Fornecedor': a.contrato.fornecedor,
      'Gestor': a.contrato.detalhes?.gestor || '',
      'Início': formatDateBR(a.contrato.inicio_validade),
      'Fim': formatDateBR(a.contrato.fim_validade),
      'Vigência': a.contrato.status_vigencia,
      'Valor global': a.valorGlobal,
      'Pedidos': a.valorPedidos,
      'Qtd pedidos': a.pedidos.length,
      'Lançado (MIRO)': a.lancadoMiro,
      'Lançado (só fornecedor)': a.lancadoFornecedor,
      'Lançado total': a.lancado,
      'Pago': a.pago,
      'Em aberto': a.aberto,
      'Vencido em aberto': a.vencidoAberto,
      'Saldo do contrato': a.saldo,
      'Saldo a pedir': a.saldoPedidos,
      'Consumo %': a.consumo === null ? '' : Math.round(a.consumo * 1000) / 10,
      'Situação': RotuloSeveridade[a.severidade],
      'Parcela': a.parcela ?? '',
      'Ritmo atual/mês': a.projecao?.ritmoMensal ?? '',
      'Falta até o fim (projeção)': a.projecao && a.projecao.falta > 0 ? a.projecao.falta : '',
      'Ocorrências': a.ocorrencias.map(o => `${RotuloSeveridade[o.severidade]}: ${ROTULO_CURTO_REGRA[o.regra]}`).join('; '),
    }));
    const ocorrencias = lista.flatMap(a => a.ocorrencias.map(o => ({
      'Contrato': a.contrato.documento_compras,
      'Fornecedor': a.contrato.fornecedor,
      'Severidade': RotuloSeveridade[o.severidade],
      'Categoria': ROTULO_CATEGORIA[CATEGORIA_REGRA[o.regra]],
      'Ocorrência': o.titulo,
      'Detalhe': o.detalhe,
      'O que conferir': ORIENTACAO_REGRA[o.regra],
      'Valor': o.valor ?? '',
      'Documentos': (o.documentos || []).join(', '),
    })));
    const faturamento = lista.flatMap(a => a.faturamentoMensal.map(m => ({
      'Contrato': a.contrato.documento_compras,
      'Fornecedor': a.contrato.fornecedor,
      'Mês': rotuloMes(m.mes),
      'Faturado': m.valor,
      'Parcela': a.parcela ?? '',
      'Diferença': a.parcela ? m.valor - a.parcela : '',
      'Acima da parcela': m.acima ? 'Sim' : '',
      'Documentos': m.documentos.join(', '),
    })));
    const lancamentos = lista.flatMap(a => a.lancamentos.map(l => ({
      'Contrato': a.contrato.documento_compras,
      'Documento': l.documento || '',
      'MIRO': l.docMiro || '',
      'Pedidos': l.pedidos || '',
      'Tipo': l.tipo || '',
      'NF / Referência': l.referencia || '',
      'Texto': l.texto || '',
      'Data NF': formatDateBR(l.dataDocumento),
      'Lançamento': formatDateBR(l.dataLancamento),
      'Vencimento': formatDateBR(l.vencimento),
      'Compensação': formatDateBR(l.dataCompensacao),
      'Doc. compensação': l.docCompensacao || '',
      'Bloqueio': l.bloqueio || '',
      'Valor': l.valor,
      'Pago': l.pago,
      'Em aberto': l.aberto,
      'Anulada': l.anulada ? 'Sim' : '',
      'Estimado (MIRO)': l.estimado ? 'Sim' : '',
      'Vínculo': rotuloVinculo(l.vinculo),
    })));
    const alteracoes = lista.flatMap(a => a.alteracoes.map(x => ({
      'Contrato': x.documento_compras,
      'Item': x.item || '',
      'Origem': x.origem,
      'Campo': rotuloCampoAlteracao(x.campo),
      'De': x.valor_anterior ?? '',
      'Para': x.valor_novo ?? '',
      'Por': x.alterado_por || '',
      'Quando': x.alterado_em,
    })));
    const semVinculo = naoAtribuidos.map(l => ({
      'Contratos do fornecedor': l.pedidos || '',
      'Fornecedor': l.razao || l.fornecedor || '',
      'Documento': l.documento || '',
      'Tipo': l.tipo || '',
      'NF / Referência': l.referencia || '',
      'Lançamento': formatDateBR(l.dataLancamento),
      'Valor': l.valor,
      'Pago': l.pago,
      'Anulada': l.anulada ? 'Sim' : '',
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumo), 'Resumo');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ocorrencias.length ? ocorrencias : [{ 'Contrato': '', 'Ocorrência': 'Nenhuma' }]), 'Ocorrências');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(lancamentos.length ? lancamentos : [{ 'Contrato': '' }]), 'Lançamentos FBL1N');
    if (faturamento.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(faturamento), 'Faturamento mensal');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(alteracoes.length ? alteracoes : [{ 'Contrato': '', 'Campo': 'Nenhuma alteração registrada' }]), 'Alterações');
    if (semVinculo.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(semVinculo), 'Sem vínculo');
    XLSX.writeFile(wb, `auditoria_contratos_${hoje}.xlsx`);
  };

  return (
    <div className="space-y-5 select-text">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <p className="text-sm text-slate-600 dark:text-slate-400 min-w-0 flex-1">
          Confere cada contrato com os pedidos e com o que o Financeiro lançou e pagou (FBL1N): saldo, consumo, estouro de valor, lançamento
          fora da vigência, NF repetida, partidas vencidas ou bloqueadas e alterações de valor. Clique num contrato para ver as partidas.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => load(true)}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-bold transition-all disabled:opacity-50 h-9 cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Atualizar
          </button>
          {todos.length > 0 && (
            <button
              type="button"
              onClick={exportar}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all shadow-sm h-9 cursor-pointer active:scale-95"
            >
              <FileSpreadsheet className="h-4 w-4" /> Exportar relatório
            </button>
          )}
        </div>
      </div>

      {!loading && !error && <AvisoCobertura cobertura={cobertura} hoje={hoje} />}

      {!loading && !error && todos.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
          <KpiCard label="Valor contratado" value={kpis.global} format={formatBRLCompacto} icon={Wallet} accent="var(--brand)"
            detail={`${formatInt(todos.length)} contratos`} />
          <KpiCard label="Lançado no Financeiro" value={kpis.lancado} format={formatBRLCompacto} icon={Receipt} accent="var(--brand)"
            share={kpis.global > 0 ? kpis.lancado / kpis.global : undefined}
            detail={kpis.lancadoFornecedor > 0 ? `${formatBRLCompacto(kpis.lancadoFornecedor)} a conferir` : undefined} />
          <KpiCard label="Pago" value={kpis.pago} format={formatBRLCompacto} icon={Banknote} accent="var(--status-good)"
            share={kpis.lancado > 0 ? kpis.pago / kpis.lancado : undefined} />
          <KpiCard label="Em aberto" value={kpis.aberto} format={formatBRLCompacto} icon={AlertCircle}
            accent={kpis.vencido > 0 ? 'var(--status-critical)' : 'var(--status-warning)'}
            detail={kpis.vencido > 0 ? `${formatBRLCompacto(kpis.vencido)} vencido` : 'Nada vencido'} />
          <KpiCard label="Contratos críticos" value={kpis.criticos} format={formatInt} icon={ShieldAlert} accent="var(--status-critical)"
            detail={`${formatInt(kpis.alertas)} com alerta`} emphasize={kpis.criticos > 0}
            onClick={() => setFiltroSeveridade(filtroSeveridade === 'critico' ? 'Todas' : 'critico')} />
        </div>
      )}

      {!loading && !error && todos.length > 0 && (
        <PainelTipos contratos={todos} regraAtiva={filtroRegra} onSelecionar={setFiltroRegra} />
      )}

      {/* Filtros */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs space-y-3">
        <div className="relative">
          <label htmlFor={idBusca} className="sr-only">Buscar contrato</label>
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <input
            id={idBusca}
            type="text"
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Contrato, fornecedor, gestor, pedido, documento ou NF..."
            className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm text-slate-800 dark:text-slate-200 placeholder-slate-500 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 focus:outline-none"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div>
            <label htmlFor={idSeveridade} className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Situação</label>
            <select id={idSeveridade} value={filtroSeveridade} onChange={e => setFiltroSeveridade(e.target.value as FiltroSeveridade)} className={selectClass}>
              <option value="Todas">Todas</option>
              <option value="com_ocorrencia">Crítico ou alerta</option>
              <option value="critico">Crítico</option>
              <option value="alerta">Alerta</option>
              <option value="info">Só informativo</option>
              <option value="ok">Sem ocorrência</option>
            </select>
          </div>
          <div>
            <label htmlFor={idRegra} className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Ocorrência</label>
            <select id={idRegra} value={filtroRegra} onChange={e => setFiltroRegra(e.target.value as 'Todas' | RegraAuditoria)} className={selectClass}>
              <option value="Todas">Todas</option>
              {ORDEM_CATEGORIA.map(cat => {
                const regras = regrasPresentes.filter(r => CATEGORIA_REGRA[r] === cat);
                if (!regras.length) return null;
                return (
                  <optgroup key={cat} label={ROTULO_CATEGORIA[cat]}>
                    {regras.map(r => <option key={r} value={r}>{ROTULO_REGRA[r]}</option>)}
                  </optgroup>
                );
              })}
            </select>
          </div>
          <div>
            <label htmlFor={idVigencia} className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Vigência</label>
            <select id={idVigencia} value={filtroVigencia} onChange={e => setFiltroVigencia(e.target.value as 'Todas' | StatusVigencia)} className={selectClass}>
              <option value="Todas">Todas</option>
              {VIGENCIAS.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
        </div>
      </div>

      {loading && <TableSkeleton columns={10} />}

      {!loading && error && (
        <div className="flex items-center gap-3.5 p-5 border rounded-xl"
          style={{ borderColor: 'var(--status-critical)', background: 'color-mix(in srgb, var(--status-critical) 8%, transparent)', color: 'var(--ink-primary)' }}>
          <AlertCircle className="h-6 w-6 shrink-0" style={{ color: 'var(--status-critical)' }} />
          <span className="text-sm font-medium">{error}</span>
        </div>
      )}

      {!loading && !error && todos.length === 0 && (
        <TableEmpty icon={ShieldCheck} title="Nenhum contrato para auditar"
          hint="Importe a ME3N (contratos), a ZL0170 (MIRO) e a FBL1N (contas a pagar) em Importar SAP." />
      )}

      {!loading && !error && todos.length > 0 && ordenados.length === 0 && (
        <TableEmpty icon={Search} title="Nenhum contrato com esses filtros" hint="Limpe a busca ou escolha outra situação." />
      )}

      {!loading && !error && ordenados.length > 0 && (
        <div className="space-y-3">
          <TableCards>
            {ordenados.slice(0, visiveis).map(a => (
              <TableCardRow key={a.contrato.documento_compras} onClick={() => setSelecionado(a)} accent={CorSeveridade[a.severidade]}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-bold font-mono" style={{ color: 'var(--ink-primary)' }}>{a.contrato.documento_compras}</p>
                    <p className="text-xs truncate" style={{ color: 'var(--ink-secondary)' }}>{a.contrato.fornecedor}</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div><p className="text-[10px] uppercase font-bold" style={{ color: 'var(--ink-muted)' }}>Global</p><p className="tabular font-bold" style={{ color: 'var(--ink-primary)' }}>{formatBRLCompacto(a.valorGlobal)}</p></div>
                  <div><p className="text-[10px] uppercase font-bold" style={{ color: 'var(--ink-muted)' }}>Lançado</p><p className="tabular font-bold" style={{ color: 'var(--ink-primary)' }}>{formatBRLCompacto(a.lancado)}</p></div>
                  <div><p className="text-[10px] uppercase font-bold" style={{ color: 'var(--ink-muted)' }}>Saldo</p><p className="tabular font-bold" style={{ color: a.saldo < 0 ? 'var(--status-critical)' : 'var(--ink-primary)' }}>{formatBRLCompacto(a.saldo)}</p></div>
                </div>
                <BarraConsumo consumo={a.consumo} />
                <ResumoOcorrencias a={a} regraEmFoco={filtroRegra === 'Todas' ? null : filtroRegra} max={3} />
              </TableCardRow>
            ))}
          </TableCards>

          <TableDesktop>
            <TableShell>
              <table className="w-full text-xs">
                <TableHeadRow>
                  <SortableTh col="contrato" label="Contrato" sortColumn={sortCol} sortDir={sortDir} onSort={c => ordenar(c as Coluna)} />
                  <SortableTh col="fornecedor" label="Fornecedor" sortColumn={sortCol} sortDir={sortDir} onSort={c => ordenar(c as Coluna)} />
                  <SortableTh col="fim" label="Fim" sortColumn={sortCol} sortDir={sortDir} onSort={c => ordenar(c as Coluna)} />
                  <SortableTh col="global" label="Valor global" align="right" sortColumn={sortCol} sortDir={sortDir} onSort={c => ordenar(c as Coluna)} />
                  <SortableTh col="pedidos" label="Pedidos" align="right" sortColumn={sortCol} sortDir={sortDir} onSort={c => ordenar(c as Coluna)} />
                  <SortableTh col="lancado" label="Lançado" align="right" sortColumn={sortCol} sortDir={sortDir} onSort={c => ordenar(c as Coluna)} />
                  <SortableTh col="pago" label="Pago" align="right" sortColumn={sortCol} sortDir={sortDir} onSort={c => ordenar(c as Coluna)} />
                  <SortableTh col="aberto" label="Em aberto" align="right" sortColumn={sortCol} sortDir={sortDir} onSort={c => ordenar(c as Coluna)} />
                  <SortableTh col="saldo" label="Saldo" align="right" sortColumn={sortCol} sortDir={sortDir} onSort={c => ordenar(c as Coluna)} />
                  <SortableTh col="consumo" label="Consumo" sortColumn={sortCol} sortDir={sortDir} onSort={c => ordenar(c as Coluna)} />
                  <SortableTh col="ocorrencias" label="Ocorrências" sortColumn={sortCol} sortDir={sortDir} onSort={c => ordenar(c as Coluna)} />
                  <Th label="" />
                </TableHeadRow>
                <TableBody>
                  {ordenados.slice(0, visiveis).map(a => (
                    <Tr key={a.contrato.documento_compras} onClick={() => setSelecionado(a)} accent={a.severidade === 'ok' ? undefined : CorSeveridade[a.severidade]}>
                      <Td mono strong>{a.contrato.documento_compras}</Td>
                      <Td truncate title={a.contrato.fornecedor}>{a.contrato.fornecedor}</Td>
                      <Td numeric className="whitespace-nowrap">
                        {formatDateBR(a.contrato.fim_validade)}
                        <div className="text-[10px]" style={{ color: 'var(--ink-muted)' }}>{a.contrato.status_vigencia}</div>
                      </Td>
                      <Td align="right" numeric strong className="whitespace-nowrap">{formatBRL(a.valorGlobal)}</Td>
                      <Td align="right" numeric className="whitespace-nowrap">
                        <span style={{ color: a.valorGlobal > 0 && a.valorPedidos > a.valorGlobal * 1.005 + 1 ? 'var(--status-critical)' : undefined }}>
                          {formatBRL(a.valorPedidos)}
                        </span>
                        <div className="text-[10px]" style={{ color: 'var(--ink-muted)' }}>{a.pedidos.length} PO</div>
                      </Td>
                      <Td align="right" numeric className="whitespace-nowrap">
                        {formatBRL(a.lancado)}
                        {a.lancadoFornecedor > 0 && (
                          <div className="text-[10px]" style={{ color: 'var(--status-warning)' }}>{formatBRLCompacto(a.lancadoFornecedor)} a conferir</div>
                        )}
                      </Td>
                      <Td align="right" numeric className="whitespace-nowrap">{formatBRL(a.pago)}</Td>
                      <Td align="right" numeric className="whitespace-nowrap">
                        <span style={{ color: a.vencidoAberto > 0 ? 'var(--status-critical)' : undefined }}>{formatBRL(a.aberto)}</span>
                      </Td>
                      <Td align="right" numeric strong className="whitespace-nowrap">
                        <span style={{ color: a.saldo < 0 ? 'var(--status-critical)' : undefined }}>{formatBRL(a.saldo)}</span>
                      </Td>
                      <Td><BarraConsumo consumo={a.consumo} /></Td>
                      <Td className="min-w-[200px]"><ResumoOcorrencias a={a} regraEmFoco={filtroRegra === 'Todas' ? null : filtroRegra} /></Td>
                      <Td>
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); setSelecionado(a); }}
                          aria-label={`Abrir auditoria do contrato ${a.contrato.documento_compras}`}
                          className="p-1 rounded hover:bg-[var(--surface-raised)] cursor-pointer"
                        >
                          <ChevronRight className="h-4 w-4" style={{ color: 'var(--ink-muted)' }} />
                        </button>
                      </Td>
                    </Tr>
                  ))}
                </TableBody>
              </table>
            </TableShell>
          </TableDesktop>

          <TableFooter shown={Math.min(visiveis, ordenados.length)} total={ordenados.length} loadStep={PAGE_SIZE}
            onLoadMore={() => setVisiveis(v => v + PAGE_SIZE)} />
        </div>
      )}

      {/* Partidas de fornecedor com mais de um contrato, sem MIRO que diga qual */}
      {!loading && !error && naoAtribuidos.length > 0 && (
        <div className="rounded-xl border" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}>
          <button
            type="button"
            onClick={() => setMostrarNaoAtribuidos(v => !v)}
            aria-expanded={mostrarNaoAtribuidos}
            className="w-full flex items-center gap-2.5 p-3.5 text-left cursor-pointer"
          >
            <Info className="h-4 w-4 shrink-0" style={{ color: 'var(--ink-muted)' }} />
            <span className="flex-1 text-xs" style={{ color: 'var(--ink-secondary)' }}>
              <span className="font-bold" style={{ color: 'var(--ink-primary)' }}>{naoAtribuidos.length} partida(s) sem contrato definido</span>
              {' '}— fornecedor com mais de um contrato e sem MIRO que indique qual ({formatBRL(somaNaoAtribuidos)}).
            </span>
            {mostrarNaoAtribuidos ? <ChevronDown className="h-4 w-4" style={{ color: 'var(--ink-muted)' }} /> : <ChevronRight className="h-4 w-4" style={{ color: 'var(--ink-muted)' }} />}
          </button>
          {mostrarNaoAtribuidos && (
            <div className="border-t overflow-x-auto" style={{ borderColor: 'var(--hairline)' }}>
              <table className="w-full text-[11px] min-w-[720px]">
                <thead>
                  <tr className="uppercase tracking-wider text-left" style={{ color: 'var(--ink-muted)', background: 'var(--surface-raised)' }}>
                    <th className="py-1.5 px-3 font-bold">Fornecedor</th>
                    <th className="py-1.5 px-3 font-bold">Contratos</th>
                    <th className="py-1.5 px-3 font-bold">Documento</th>
                    <th className="py-1.5 px-3 font-bold">NF / Ref.</th>
                    <th className="py-1.5 px-3 font-bold">Lançamento</th>
                    <th className="py-1.5 px-3 font-bold text-right">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: 'var(--hairline)' }}>
                  {naoAtribuidos.map(l => (
                    <tr key={l.chave} style={{ opacity: l.anulada ? 0.55 : 1 }}>
                      <td className="py-1.5 px-3" style={{ color: 'var(--ink-secondary)' }}>{l.razao || l.fornecedor}</td>
                      <td className="py-1.5 px-3 font-mono" style={{ color: 'var(--ink-muted)' }}>{l.pedidos}</td>
                      <td className="py-1.5 px-3 font-mono" style={{ color: 'var(--ink-primary)' }}>{l.documento} <span style={{ color: 'var(--ink-muted)' }}>{l.tipo}</span></td>
                      <td className="py-1.5 px-3" style={{ color: 'var(--ink-secondary)' }}>{l.referencia || '—'}</td>
                      <td className="py-1.5 px-3 tabular" style={{ color: 'var(--ink-secondary)' }}>{formatDateBR(l.dataLancamento)}</td>
                      <td className="py-1.5 px-3 tabular text-right font-bold" style={{ color: 'var(--ink-primary)', textDecoration: l.anulada ? 'line-through' : undefined }}>{formatBRL(l.valor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {selecionado && (
        <ContratoAuditoriaModal auditoria={selecionado} hoje={hoje} onClose={() => setSelecionado(null)} />
      )}
    </div>
  );
}
