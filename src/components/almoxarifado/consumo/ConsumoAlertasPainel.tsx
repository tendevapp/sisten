/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Consumo Semanal › Alertas — quais itens estão saindo mais rápido que o
 * normal e o que fazer: revisar o estoque mínimo ou antecipar a compra.
 *
 * Regras em `lib/alertaConsumo.ts` (janela recente × base, só semanas
 * completas). O estoque (saldo, mínimo, lead time) vem do Controle de Estoque
 * via `buscarSituacoesEstoque`. O mínimo sugerido é só sugestão — quem grava
 * é o Controle de Estoque.
 */

import React, { useMemo, useState } from 'react';
import {
  AlertTriangle, ArrowRight, CalendarClock, Filter, Gauge, PackageX, Scale, ShoppingCart, TrendingUp, Zap,
} from 'lucide-react';
import {
  analisarConsumo, dataRuptura, prioridadeAnalise, semanasCompletas, ORDEM_ALERTA, ROTULO_ALERTA, ROTULO_CURTO_ALERTA,
  SEMANAS_BASE, SEMANAS_RECENTES, type AnaliseConsumo, type GrauAlerta, type TipoAlertaConsumo,
} from '../../../lib/alertaConsumo';
import { serieDoMaterial, type BaseSemanal, type ResumoMaterial } from '../../../lib/consumoSemanal';
import { situacaoEstoqueDoMaterial, type SituacaoEstoqueMaterial } from '../../../lib/estoqueSituacaoCompras';
import { formatQtd, isProjetoItem } from '../../../lib/almoxarifado';
import { extrairPalavrasChave, casarTokens } from '../../../lib/buscaKeywords';
import { formatDateBR, formatInt } from '../../../lib/format';
import { canAccessPage } from '../../../lib/pages';
import type { Profile } from '../../../types';
import Sparkline from '../Sparkline';
import ConsumoSemanalChart from '../ConsumoSemanalChart';
import KpiCard from '../../charts/KpiCard';
import Modal, { ModalBody, ModalFooter, ModalHeader } from '../../ui/Modal';
import { TableCards, TableCardRow, TableDesktop, TableShell, TableHeadRow, Th, TableBody, Tr, Td, TableEmpty } from '../../ui/DataTable';

interface Props {
  user: Profile;
  onNavigate: (path: string) => void;
  base: BaseSemanal;
  situacoes: Map<string, SituacaoEstoqueMaterial>;
  grupoPorMaterial: Map<string, string>;
  gruposDisponiveis: string[];
  hojeIso: string;
  loading: boolean;
  inicioProducao: string;
}

interface LinhaAlerta {
  m: ResumoMaterial;
  situacao: SituacaoEstoqueMaterial | null;
  analise: AnaliseConsumo;
  /** Últimas semanas completas (base + recente), para o sparkline. */
  janela: number[];
}

const ICONE_ALERTA: Record<TipoAlertaConsumo, typeof AlertTriangle> = {
  RUPTURA: PackageX,
  MINIMO_DEFASADO: Scale,
  AUMENTO: TrendingUp,
  TENDENCIA: Gauge,
  PICO: Zap,
};

const ESTILO_GRAU: Record<GrauAlerta, string> = {
  CRITICO: 'bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800',
  ATENCAO: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800',
};

const COR_GRAU: Record<GrauAlerta, string> = { CRITICO: 'var(--status-danger, #e11d48)', ATENCAO: 'var(--status-warning, #d97706)' };

const LIMITE_LISTA = 150;
const JANELA_TOTAL = SEMANAS_BASE + SEMANAS_RECENTES;

function ChipAlerta({ tipo, grau }: { tipo: TipoAlertaConsumo; grau: GrauAlerta }) {
  const Icone = ICONE_ALERTA[tipo];
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded border px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide ${ESTILO_GRAU[grau]}`}>
      <Icone className="h-2.5 w-2.5" /> {ROTULO_CURTO_ALERTA[tipo]}
    </span>
  );
}

function Variacao({ a }: { a: AnaliseConsumo }) {
  if (a.variacao === null) return <span style={{ color: 'var(--ink-muted)' }}>—</span>;
  const pct = Math.round((a.variacao - 1) * 100);
  const cor = pct >= 50 ? 'text-rose-600 dark:text-rose-400' : pct > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400';
  return <span className={`font-bold tabular ${cor}`}>{pct > 0 ? '+' : ''}{pct}%</span>;
}

const fmtDias = (d: number | null) => (d === null ? '—' : `${formatInt(Math.floor(d))} d.ú.`);

export default function ConsumoAlertasPainel({
  user, onNavigate, base, situacoes, grupoPorMaterial, gruposDisponiveis, hojeIso, loading, inicioProducao,
}: Props) {
  const [tipoAlerta, setTipoAlerta] = useState<TipoAlertaConsumo | 'TODOS'>('TODOS');
  const [somenteCriticos, setSomenteCriticos] = useState(false);
  const [somenteComAlerta, setSomenteComAlerta] = useState(true);
  // Item de projeto segue a BOM, não um ritmo de consumo: fica de fora por padrão.
  const [tipoItem, setTipoItem] = useState<'consumo' | 'projeto' | 'Todos'>('consumo');
  const [grupoFiltro, setGrupoFiltro] = useState('Todos');
  const [busca, setBusca] = useState('');
  const [limite, setLimite] = useState(LIMITE_LISTA);
  const [aberto, setAberto] = useState<string | null>(null);

  const nCompletas = useMemo(() => semanasCompletas(base.semanas, base.maxData), [base.semanas, base.maxData]);
  const semanasJanela = useMemo(
    () => base.semanas.slice(Math.max(0, nCompletas - JANELA_TOTAL), nCompletas),
    [base.semanas, nCompletas],
  );

  const linhas = useMemo<LinhaAlerta[]>(() => base.materiais.map(m => {
    const serie = m.serie.slice(0, nCompletas);
    const situacao = situacaoEstoqueDoMaterial(situacoes, m.material);
    const analise = analisarConsumo(serie, situacao && {
      saldo: situacao.saldo,
      minimo: situacao.minimo,
      leadTimeDias: situacao.leadTimeDias,
      intervaloCompraDias: situacao.intervaloCompraDias,
    }, m.umb);
    return { m, situacao, analise, janela: serie.slice(-JANELA_TOTAL) };
  }), [base.materiais, nCompletas, situacoes]);

  // Recorte por tipo de item, grupo e busca — base dos contadores e da lista.
  const recorte = useMemo(() => {
    const tokens = extrairPalavrasChave(busca);
    return linhas.filter(({ m }) => {
      if (tipoItem !== 'Todos' && (tipoItem === 'projeto') !== isProjetoItem(m.material)) return false;
      if (grupoFiltro !== 'Todos' && grupoPorMaterial.get(m.material) !== grupoFiltro) return false;
      if (tokens.length > 0 && !casarTokens([m.material, m.descricao, grupoPorMaterial.get(m.material)], tokens)) return false;
      return true;
    });
  }, [linhas, tipoItem, grupoFiltro, busca, grupoPorMaterial]);

  const contagem = useMemo(() => {
    const c = Object.fromEntries(ORDEM_ALERTA.map(t => [t, 0])) as Record<TipoAlertaConsumo, number>;
    let comAlerta = 0;
    let criticos = 0;
    recorte.forEach(({ analise }) => {
      if (analise.alertas.length > 0) comAlerta++;
      if (analise.grau === 'CRITICO') criticos++;
      new Set(analise.alertas.map(a => a.tipo)).forEach(t => { c[t]++; });
    });
    return { porTipo: c, comAlerta, criticos };
  }, [recorte]);

  const lista = useMemo(() => recorte
    .filter(({ analise }) => {
      if (somenteComAlerta && analise.alertas.length === 0) return false;
      if (tipoAlerta !== 'TODOS' && !analise.alertas.some(a => a.tipo === tipoAlerta)) return false;
      if (somenteCriticos && analise.grau !== 'CRITICO') return false;
      return true;
    })
    .sort((a, b) => prioridadeAnalise(a.analise) - prioridadeAnalise(b.analise) || b.analise.mediaRecente - a.analise.mediaRecente),
  [recorte, somenteComAlerta, tipoAlerta, somenteCriticos]);

  const linhaAberta = useMemo(() => linhas.find(l => l.m.material === aberto) ?? null, [linhas, aberto]);

  const selectClass = 'rounded-lg border py-2 px-3 text-xs font-bold cursor-pointer transition-colors duration-150 border-[var(--hairline)] bg-[var(--surface-raised)] text-[var(--ink-secondary)]';
  const inicioJanela = semanasJanela[0];
  const fimJanela = semanasJanela[semanasJanela.length - 1];

  return (
    <div className="space-y-4">
      {/* Contadores por tipo — clicar filtra a lista. */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 stagger">
        <KpiCard
          label="Itens com alerta"
          value={contagem.comAlerta}
          format={formatInt}
          detail={`${formatInt(contagem.criticos)} críticos`}
          icon={AlertTriangle}
          accent="var(--status-danger, #e11d48)"
          emphasize
          onClick={() => { setTipoAlerta('TODOS'); setSomenteComAlerta(true); }}
        />
        {ORDEM_ALERTA.map(t => (
          <KpiCard
            key={t}
            label={ROTULO_ALERTA[t]}
            value={contagem.porTipo[t]}
            format={formatInt}
            detail={tipoAlerta === t ? 'filtrando — clique para limpar' : 'clique para filtrar'}
            icon={ICONE_ALERTA[t]}
            accent={t === 'RUPTURA' || t === 'MINIMO_DEFASADO' ? 'var(--status-danger, #e11d48)' : 'var(--status-warning, #d97706)'}
            onClick={() => setTipoAlerta(atual => (atual === t ? 'TODOS' : t))}
          />
        ))}
      </div>

      <p className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
        Compara a média semanal das últimas {SEMANAS_RECENTES} semanas completas com a das {SEMANAS_BASE} anteriores
        {inicioJanela && fimJanela ? ` (${formatDateBR(inicioJanela)} a ${formatDateBR(fimJanela)})` : ''}. A semana corrente fica de fora até fechar.
        Saldo, mínimo e lead time vêm do Controle de Estoque.
      </p>

      {/* Filtros */}
      <div className="rounded-xl border p-3" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}>
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar -mx-3 px-3 lg:mx-0 lg:px-0 lg:flex-wrap">
          <span className="shrink-0 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--ink-muted)' }}>
            <Filter className="h-3 w-3" /> Filtros
          </span>
          <select value={tipoAlerta} onChange={e => setTipoAlerta(e.target.value as TipoAlertaConsumo | 'TODOS')} className={`${selectClass} shrink-0`}>
            <option value="TODOS">Alerta: Todos</option>
            {ORDEM_ALERTA.map(t => <option key={t} value={t}>{ROTULO_ALERTA[t]}</option>)}
          </select>
          <select value={tipoItem} onChange={e => setTipoItem(e.target.value as typeof tipoItem)} className={`${selectClass} shrink-0`}>
            <option value="consumo">Item: Consumo</option>
            <option value="projeto">Projeto (100000…)</option>
            <option value="Todos">Item: Todos</option>
          </select>
          <select value={grupoFiltro} onChange={e => setGrupoFiltro(e.target.value)} className={`${selectClass} shrink-0 w-[180px] lg:w-auto truncate`}>
            <option value="Todos">Grupo de mercadorias: Todos</option>
            {gruposDisponiveis.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
          <label className={`${selectClass} shrink-0 flex items-center gap-2 whitespace-nowrap`}>
            <input type="checkbox" checked={somenteCriticos} onChange={e => setSomenteCriticos(e.target.checked)} className="cursor-pointer" />
            Só críticos
          </label>
          <label className={`${selectClass} shrink-0 flex items-center gap-2 whitespace-nowrap`}>
            <input type="checkbox" checked={somenteComAlerta} onChange={e => setSomenteComAlerta(e.target.checked)} className="cursor-pointer" />
            Só com alerta
          </label>
          <input
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Código, descrição ou grupo..."
            className="shrink-0 w-[220px] lg:flex-1 lg:min-w-[220px] lg:max-w-sm rounded-lg border py-2 px-3 text-xs border-[var(--hairline)] bg-[var(--surface-raised)] text-[var(--ink-primary)]"
          />
          <span className="shrink-0 ml-auto text-[11px] tabular" style={{ color: 'var(--ink-muted)' }}>
            {formatInt(lista.length)} {lista.length === 1 ? 'item' : 'itens'}
          </span>
        </div>
      </div>

      {!loading && lista.length === 0 && (
        <TableEmpty
          icon={AlertTriangle}
          title={somenteComAlerta ? 'Nenhum item com alerta neste recorte' : 'Nenhum item neste recorte'}
          hint="Consumo dentro do padrão. Desmarque “Só com alerta” para ver todos os itens."
        />
      )}

      {lista.length > 0 && (
        <>
          {/* Celular: cartões */}
          <TableCards>
            {lista.slice(0, limite).map(l => (
              <TableCardRow key={l.m.material} onClick={() => setAberto(l.m.material)} accent={l.analise.grau ? COR_GRAU[l.analise.grau] : undefined}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono text-xs font-bold" style={{ color: 'var(--ink-primary)' }}>{l.m.material}</p>
                    <p className="text-xs truncate" style={{ color: 'var(--ink-secondary)' }}>{l.m.descricao || '—'}</p>
                  </div>
                  <Variacao a={l.analise} />
                </div>
                <div className="flex flex-wrap gap-1">
                  {l.analise.alertas.map(a => <ChipAlerta key={a.tipo} tipo={a.tipo} grau={a.grau} />)}
                </div>
                <div className="flex items-end justify-between gap-2 text-[11px]" style={{ color: 'var(--ink-secondary)' }}>
                  <Sparkline serie={l.janela} rotulo={`Consumo semanal de ${l.m.material}`} />
                  <span className="tabular text-right">
                    {formatQtd(l.analise.mediaBase)} → <b>{formatQtd(l.analise.mediaRecente)}</b> {l.m.umb}/sem.
                    <br />Saldo {l.situacao ? formatQtd(l.situacao.saldo) : '—'} · {fmtDias(l.analise.coberturaDiasUteis)}
                  </span>
                </div>
              </TableCardRow>
            ))}
          </TableCards>

          {/* Desktop: tabela */}
          <TableDesktop>
            <TableShell maxHeight="64vh">
              <table className="w-full text-xs border-collapse">
                <TableHeadRow>
                  <Th label="Alertas" width="w-[170px]" />
                  <Th label="Material" />
                  <Th label={`Últimas ${JANELA_TOTAL} sem.`} width="w-[150px]" />
                  <Th label={`Média/sem. ${SEMANAS_BASE} → ${SEMANAS_RECENTES} sem.`} align="right" width="w-[170px]" />
                  <Th label="Variação" align="right" width="w-[80px]" />
                  <Th label="Saldo" align="right" width="w-[90px]" />
                  <Th label="Cobertura / lead" align="right" width="w-[130px]" />
                  <Th label="Mínimo atual → sugerido" align="right" width="w-[150px]" />
                </TableHeadRow>
                <TableBody>
                  {lista.slice(0, limite).map(l => (
                    <Tr
                      key={l.m.material}
                      onClick={() => setAberto(l.m.material)}
                      accent={l.analise.grau ? COR_GRAU[l.analise.grau] : undefined}
                      title={l.analise.alertas.map(a => a.motivo).join('\n') || undefined}
                    >
                      <Td>
                        <div className="flex flex-wrap gap-1">
                          {l.analise.alertas.length > 0
                            ? l.analise.alertas.map(a => <ChipAlerta key={a.tipo} tipo={a.tipo} grau={a.grau} />)
                            : <span style={{ color: 'var(--ink-muted)' }}>—</span>}
                        </div>
                      </Td>
                      <Td>
                        <span className="font-mono font-bold" style={{ color: 'var(--ink-primary)' }}>{l.m.material}</span>
                        <span className="block max-w-[360px] truncate" title={l.m.descricao}>{l.m.descricao || '—'}</span>
                      </Td>
                      <Td>
                        {/* Escala própria de cada linha: aqui importa a forma da série
                            do item (subiu? oscilou?), não comparar itens entre si. */}
                        <Sparkline serie={l.janela} rotulo={`Consumo semanal de ${l.m.material}`} />
                      </Td>
                      <Td align="right" numeric>
                        {formatQtd(l.analise.mediaBase)} → <b style={{ color: 'var(--ink-primary)' }}>{formatQtd(l.analise.mediaRecente)}</b> {l.m.umb}
                      </Td>
                      <Td align="right"><Variacao a={l.analise} /></Td>
                      <Td align="right" numeric>{l.situacao ? formatQtd(l.situacao.saldo) : '—'}</Td>
                      <Td align="right" numeric>
                        {fmtDias(l.analise.coberturaDiasUteis)}
                        <span style={{ color: 'var(--ink-muted)' }}> / {l.situacao?.leadTimeDias ?? '—'}</span>
                      </Td>
                      <Td align="right" numeric>
                        {l.situacao?.minimo != null ? formatQtd(l.situacao.minimo) : '—'}
                        {l.analise.minimoSugerido !== null && l.analise.minimoSugerido !== l.situacao?.minimo && (
                          <> → <b className={l.analise.alertas.some(a => a.tipo === 'MINIMO_DEFASADO') ? 'text-rose-600 dark:text-rose-400' : ''}>{formatQtd(l.analise.minimoSugerido)}</b></>
                        )}
                      </Td>
                    </Tr>
                  ))}
                </TableBody>
              </table>
            </TableShell>
          </TableDesktop>

          {lista.length > limite && (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => setLimite(n => n + LIMITE_LISTA)}
                className="rounded-xl border px-4 py-2 text-xs font-bold cursor-pointer"
                style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)', color: 'var(--ink-primary)' }}
              >
                Mostrar mais ({formatInt(lista.length - limite)} restantes)
              </button>
            </div>
          )}
        </>
      )}

      {linhaAberta && (
        <DetalheAlerta
          linha={linhaAberta}
          base={base}
          user={user}
          onNavigate={onNavigate}
          hojeIso={hojeIso}
          inicioProducao={inicioProducao}
          inicioRecente={semanasJanela[semanasJanela.length - SEMANAS_RECENTES]}
          onClose={() => setAberto(null)}
        />
      )}
    </div>
  );
}

function DetalheAlerta({
  linha, base, user, onNavigate, hojeIso, inicioProducao, inicioRecente, onClose,
}: {
  linha: LinhaAlerta;
  base: BaseSemanal;
  user: Profile;
  onNavigate: (path: string) => void;
  hojeIso: string;
  inicioProducao: string;
  inicioRecente?: string;
  onClose: () => void;
}) {
  const { m, situacao, analise } = linha;
  const serie = useMemo(() => serieDoMaterial(base, m.material), [base, m.material]);
  const ruptura = situacao && situacao.saldo > 0 ? dataRuptura(analise.coberturaDiasUteis, hojeIso) : null;
  const podeControle = canAccessPage(user, 'almox_controle_estoque');
  const podeCompras = canAccessPage(user, 'sup_central_compras');
  const un = m.umb ? ` ${m.umb}` : '';

  return (
    <Modal onClose={onClose} maxWidth="max-w-5xl" ariaLabel={`Consumo de ${m.material}`}>
      <ModalHeader onClose={onClose}>
        <div className="min-w-0">
          <p className="font-mono text-xs font-bold" style={{ color: 'var(--brand)' }}>{m.material}</p>
          <h3 className="truncate text-base font-bold" style={{ color: 'var(--ink-primary)' }}>{m.descricao || '—'}</h3>
        </div>
      </ModalHeader>
      <ModalBody className="space-y-4">
        {analise.alertas.length > 0 ? (
          <ul className="space-y-1.5">
            {analise.alertas.map(a => (
              <li key={a.tipo} className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-xs ${ESTILO_GRAU[a.grau]}`}>
                {React.createElement(ICONE_ALERTA[a.tipo], { className: 'h-4 w-4 shrink-0 mt-0.5' })}
                <span><b>{ROTULO_ALERTA[a.tipo]}.</b> {a.motivo}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>Consumo dentro do padrão — nenhum alerta para este item.</p>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <KpiCard label={`Média ${SEMANAS_BASE} sem.`} display={`${formatQtd(analise.mediaBase)}${un}`} detail={`${analise.semanasAtivasBase} semanas com saída`} icon={Gauge} accent="var(--series-2)" />
          <KpiCard label={`Média ${SEMANAS_RECENTES} sem.`} display={`${formatQtd(analise.mediaRecente)}${un}`} detail={analise.variacao !== null ? `${analise.variacao >= 1 ? '+' : ''}${Math.round((analise.variacao - 1) * 100)}% sobre a base` : 'sem base para comparar'} icon={TrendingUp} accent="var(--status-warning, #d97706)" emphasize />
          <KpiCard label="Saldo" display={situacao ? `${formatQtd(situacao.saldo)}${un}` : '—'} detail={analise.coberturaDiasUteis !== null ? `dura ~${fmtDias(analise.coberturaDiasUteis)} no ritmo atual` : 'sem ritmo de consumo'} icon={PackageX} accent="var(--series-1)" />
          <KpiCard label="Lead time" display={situacao?.leadTimeDias != null ? `${situacao.leadTimeDias} d.ú.` : '—'} detail={ruptura ? `ruptura prevista ${formatDateBR(ruptura)}` : 'sem previsão de ruptura'} icon={CalendarClock} accent="var(--status-danger, #e11d48)" />
          <KpiCard label="Mínimo atual → sugerido" display={`${situacao?.minimo != null ? formatQtd(situacao.minimo) : '—'} → ${analise.minimoSugerido !== null ? formatQtd(analise.minimoSugerido) : '—'}`} detail="sugestão pelo ritmo atual" icon={Scale} accent="var(--series-4)" />
        </div>

        <ConsumoSemanalChart
          dados={serie}
          material={m.material}
          descricao={m.descricao}
          umb={m.umb}
          semanaProducao={inicioProducao}
          semanaAtual={hojeIso}
          dataMaxima={base.maxData}
          mediaBase={analise.mediaBase}
          mediaRecente={analise.mediaRecente}
          inicioRecente={inicioRecente}
        />

        <p className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
          Ritmo usado para cobertura e mínimo: {formatQtd(analise.consumoSemanalRitmo)}{un}/semana (o maior entre a média recente e a base).
          Mínimo sugerido = consumo por dia útil × (lead time + intervalo de compra), a mesma conta do Controle de Estoque. O saldo é o da última importação de estoque.
        </p>
      </ModalBody>
      <ModalFooter>
        <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-semibold" style={{ color: 'var(--ink-secondary)' }}>
          Fechar
        </button>
        {podeControle && (
          <button
            type="button"
            onClick={() => onNavigate(`/almoxarifado/controle-estoque?material=${encodeURIComponent(m.material)}`)}
            className="inline-flex items-center gap-1.5 rounded-xl border px-4 py-2 text-sm font-bold"
            style={{ borderColor: 'var(--hairline)', color: 'var(--ink-primary)' }}
          >
            <Scale className="h-4 w-4" /> Revisar mínimo <ArrowRight className="h-3.5 w-3.5" />
          </button>
        )}
        {podeCompras && (
          <button
            type="button"
            onClick={() => onNavigate(`/suprimentos/compras?material=${encodeURIComponent(m.material)}`)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#0056c6] px-4 py-2 text-sm font-bold text-white hover:bg-[#004bb0]"
          >
            <ShoppingCart className="h-4 w-4" /> Antecipar compra <ArrowRight className="h-3.5 w-3.5" />
          </button>
        )}
      </ModalFooter>
    </Modal>
  );
}
