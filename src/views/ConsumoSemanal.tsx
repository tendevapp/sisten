/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Perfil de Consumo Semanal — mestre-detalhe.
 *
 * A lista da esquerda é o seletor visual: cada linha traz o sparkline do
 * material, então o usuário vê a FORMA da série antes de clicar. Isso importa
 * porque 54% dos materiais consomem numa única semana de 25 — sem a prévia, a
 * pessoa abriria dezenas de gráficos de uma barra só até achar um com história.
 *
 * Os sparklines compartilham a mesma escala vertical (o maior consumo semanal
 * da lista filtrada). Normalizar cada linha pelo próprio máximo faria um item
 * de 3 peças e outro de 3 mil desenharem a mesma barra.
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { CalendarDays, RefreshCw, AlertCircle, Filter, Search, TrendingUp, Package, Activity } from 'lucide-react';
import { localDb } from '../db/localDb';
import { Profile, MB51Classificado, EstoqueGiro } from '../types';
import {
  construirBaseSemanal, serieDoMaterial, rotuloSemana, intervaloSemana, mediaPorSemanaAtiva,
} from '../lib/consumoSemanal';
import { formatQtd, formatBRL, isProjetoItem } from '../lib/almoxarifado';
import { formatInt, formatDateBR } from '../lib/format';
import MaterialSearchInput from '../components/almoxarifado/MaterialSearchInput';
import Sparkline from '../components/almoxarifado/Sparkline';
import ConsumoSemanalChart from '../components/almoxarifado/ConsumoSemanalChart';
import KpiCard from '../components/charts/KpiCard';
import { TableShell, TableHeadRow, Th, TableBody, Tr, Td, TableEmpty } from '../components/ui/DataTable';

interface ConsumoSemanalProps {
  user: Profile;
}

/** Semana em que a produção começou (ver janela de produção nas views). */
const INICIO_PRODUCAO = '2026-05-01';

type OrdemLista = 'consumo' | 'regularidade' | 'recente';

export default function ConsumoSemanal({ user }: ConsumoSemanalProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [movs, setMovs] = useState<MB51Classificado[]>([]);
  // Grupo de mercadorias não existe na MB51; vem da posição de estoque.
  const [giro, setGiro] = useState<EstoqueGiro[]>([]);

  const [busca, setBusca] = useState('');
  const [materialSel, setMaterialSel] = useState<string | null>(null);
  const [grupoFiltro, setGrupoFiltro] = useState('Todos');
  const [tipoItem, setTipoItem] = useState<'Todos' | 'projeto' | 'consumo'>('Todos');
  const [ordem, setOrdem] = useState<OrdemLista>('consumo');
  const [somenteRegulares, setSomenteRegulares] = useState(false);
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [mostrarTabela, setMostrarTabela] = useState(false);

  const load = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const [m, g] = await Promise.all([
        localDb.fetchMb51(force),
        localDb.fetchGiroEstoque(force).catch(() => [] as EstoqueGiro[]),
      ]);
      setMovs(m);
      setGiro(g);
    } catch (e: any) {
      console.error('Erro ao carregar as movimentações:', e);
      setError('Falha ao carregar as movimentações. Tente atualizar novamente.');
      setMovs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(false); }, [load]);

  const base = useMemo(() => construirBaseSemanal(movs), [movs]);

  const grupoPorMaterial = useMemo(() => {
    const m = new Map<string, string>();
    giro.forEach(g => {
      if (g.material && g.grupo_mercadorias) m.set(g.material, g.grupo_mercadorias.trim());
    });
    return m;
  }, [giro]);

  const gruposDisponiveis = useMemo(() => {
    const s = new Set<string>();
    base.materiais.forEach(m => {
      const g = grupoPorMaterial.get(m.material);
      if (g) s.add(g);
    });
    return Array.from(s).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [base.materiais, grupoPorMaterial]);

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const filtrada = base.materiais.filter(m => {
      // Material escolhido numa sugestão manda sobre o texto: o campo mostra a
      // descrição, que é ambígua entre itens de nome parecido.
      if (materialSel) return m.material === materialSel;

      if (tipoItem !== 'Todos') {
        const projeto = isProjetoItem(m.material);
        if (tipoItem === 'projeto' && !projeto) return false;
        if (tipoItem === 'consumo' && projeto) return false;
      }
      if (grupoFiltro !== 'Todos' && grupoPorMaterial.get(m.material) !== grupoFiltro) return false;
      // "Regulares" = série com o que ler. Abaixo de 5 semanas ativas o
      // gráfico é um ou dois picos isolados, não um perfil.
      if (somenteRegulares && m.semanasAtivas < 5) return false;
      if (q && !`${m.material} ${m.descricao}`.toLowerCase().includes(q)) return false;
      return true;
    });

    const ordenada = [...filtrada];
    if (ordem === 'consumo') ordenada.sort((a, b) => b.consumoTotal - a.consumoTotal);
    else if (ordem === 'regularidade') ordenada.sort((a, b) => b.semanasAtivas - a.semanasAtivas);
    else ordenada.sort((a, b) => (b.ultimoConsumo || '').localeCompare(a.ultimoConsumo || ''));
    return ordenada;
  }, [base.materiais, busca, materialSel, tipoItem, grupoFiltro, grupoPorMaterial, ordem, somenteRegulares]);

  // Escala compartilhada por todos os sparklines da lista visível.
  const maximoSparkline = useMemo(() => {
    let max = 0;
    lista.forEach(m => m.serie.forEach(v => { if (v > max) max = v; }));
    return max;
  }, [lista]);

  // Seleção automática do primeiro item: abrir a tela num painel vazio
  // esconderia o que ela faz.
  useEffect(() => {
    if (!selecionado && lista.length > 0) setSelecionado(lista[0].material);
    if (selecionado && lista.length > 0 && !lista.some(m => m.material === selecionado)) {
      setSelecionado(lista[0].material);
    }
  }, [lista, selecionado]);

  const detalhe = useMemo(
    () => (selecionado ? serieDoMaterial(base, selecionado) : []),
    [base, selecionado]
  );
  const resumoSel = useMemo(
    () => lista.find(m => m.material === selecionado) ?? base.materiais.find(m => m.material === selecionado),
    [lista, base.materiais, selecionado]
  );

  const picoSemanal = useMemo(
    () => detalhe.reduce((max, p) => (p.consumo > max ? p.consumo : max), 0),
    [detalhe]
  );

  const universoBusca = useMemo(
    () => base.materiais.map(m => ({ material: m.material, descricao: m.descricao })),
    [base.materiais]
  );

  const selectClass = 'rounded-lg border py-2 px-3 text-xs font-bold cursor-pointer transition-colors duration-150 focus:outline-2 focus:outline-offset-1 border-[var(--hairline)] bg-[var(--surface-raised)] text-[var(--ink-secondary)] focus:outline-[var(--brand)]';

  return (
    <div className="space-y-5 select-text max-w-[1600px] mx-auto pb-12">
      {/* Cabeçalho */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-5 reveal" style={{ borderColor: 'var(--hairline)' }}>
        <div className="min-w-0">
          <h2 className="text-2xl font-extrabold flex items-center gap-2.5" style={{ color: 'var(--ink-primary)' }}>
            <CalendarDays className="h-7 w-7" style={{ color: 'var(--brand)' }} />
            Perfil de Consumo Semanal
          </h2>
          <p className="text-sm mt-1" style={{ color: 'var(--ink-secondary)' }}>
            Escolha um material pela forma da série e veja semana a semana quanto saiu e quanto entrou.
          </p>
        </div>
        <button
          onClick={() => load(true)}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm shrink-0 cursor-pointer border hover:opacity-90 active:scale-95 disabled:opacity-50"
          style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)', color: 'var(--ink-primary)' }}
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </div>

      {!loading && error && (
        <div className="flex items-center gap-3.5 p-5 border border-rose-200 dark:border-rose-900/50 rounded-xl bg-rose-50/50 dark:bg-rose-950/20 text-rose-800 dark:text-rose-300">
          <AlertCircle className="h-6 w-6 shrink-0" />
          <span className="text-sm font-medium">{error}</span>
        </div>
      )}

      {!loading && !error && base.materiais.length === 0 && (
        <TableEmpty
          icon={CalendarDays}
          title="Nenhum consumo registrado"
          hint='Importe as movimentações (transação MB51) na aba "Importar SAP" do painel administrativo.'
        />
      )}

      {(loading || (!error && base.materiais.length > 0)) && (
        <>
          {/* Uma linha de filtros acima de tudo que ela recorta. No mobile
              vira uma trilha com rolagem horizontal para não empurrar a
              lista de materiais para muito longe do topo. */}
          <div
            className="rounded-xl border p-4"
            style={{
              borderColor: 'var(--hairline)',
              background: 'var(--surface-card)',
              boxShadow: '0 1px 2px 0 rgb(0 0 0 / 0.04)',
            }}
          >
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 lg:mx-0 lg:px-0 lg:flex-wrap">
              <span className="shrink-0 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--ink-muted)' }}>
                <Filter className="h-3 w-3" /> Filtros
              </span>

              <select value={tipoItem} onChange={e => setTipoItem(e.target.value as any)} className={`${selectClass} shrink-0 w-[130px] lg:w-auto truncate`}>
                <option value="Todos">Item: Todos</option>
                <option value="projeto">Projeto (100000…)</option>
                <option value="consumo">Consumo</option>
              </select>

              <select value={grupoFiltro} onChange={e => setGrupoFiltro(e.target.value)} className={`${selectClass} shrink-0 w-[180px] lg:w-auto truncate`}>
                <option value="Todos">Grupo de mercadorias: Todos</option>
                {gruposDisponiveis.map(g => <option key={g} value={g}>{g}</option>)}
              </select>

              <select value={ordem} onChange={e => setOrdem(e.target.value as OrdemLista)} className={`${selectClass} shrink-0 w-[190px] lg:w-auto truncate`}>
                <option value="consumo">Ordenar: maior consumo</option>
                <option value="regularidade">Ordenar: mais regular</option>
                <option value="recente">Ordenar: consumo mais recente</option>
              </select>

              <label
                className="shrink-0 flex items-center gap-2 text-xs font-bold cursor-pointer rounded-lg border py-2 px-3 whitespace-nowrap"
                style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)', color: 'var(--ink-secondary)' }}
              >
                <input
                  type="checkbox"
                  checked={somenteRegulares}
                  onChange={e => setSomenteRegulares(e.target.checked)}
                  className="cursor-pointer"
                />
                Só com série (5+ semanas)
              </label>

              <MaterialSearchInput
                valor={busca}
                onChange={setBusca}
                materiais={universoBusca}
                materialSelecionado={materialSel}
                onSelecionarMaterial={setMaterialSel}
                placeholder="Filtrar a lista por código ou descrição..."
                className="shrink-0 w-[220px] lg:flex-1 lg:min-w-[220px] lg:max-w-sm lg:shrink"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-4">
            {/* Seletor visual */}
            <aside
              className="rounded-xl border overflow-hidden flex flex-col"
              style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}
            >
              <div className="px-3 py-2.5 border-b flex items-center justify-between gap-2"
                   style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)' }}>
                <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--ink-muted)' }}>
                  Materiais
                </span>
                <span className="text-[10px] tabular" style={{ color: 'var(--ink-muted)' }}>
                  {formatInt(lista.length)} de {formatInt(base.materiais.length)}
                </span>
              </div>

              <ul className="overflow-y-auto" style={{ maxHeight: '62vh' }} role="listbox" aria-label="Materiais">
                {lista.length === 0 && (
                  <li className="p-6 text-center text-xs" style={{ color: 'var(--ink-muted)' }}>
                    Nenhum material com os filtros atuais.
                  </li>
                )}
                {lista.slice(0, 300).map(m => {
                  const ativo = m.material === selecionado;
                  return (
                    <li key={m.material}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={ativo}
                        onClick={() => setSelecionado(m.material)}
                        className="w-full text-left px-3 py-2.5 border-b cursor-pointer transition-colors duration-150 hover:bg-[var(--surface-raised)] focus-visible:outline-2 focus-visible:outline-offset-[-2px]"
                        style={{
                          borderColor: 'var(--hairline)',
                          background: ativo ? 'var(--surface-raised)' : undefined,
                          boxShadow: ativo ? 'inset 3px 0 0 0 var(--brand)' : undefined,
                          outlineColor: 'var(--brand)',
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[11px] font-bold shrink-0" style={{ color: 'var(--ink-primary)' }}>
                            {m.material}
                          </span>
                          <span className="text-[10px] tabular ml-auto shrink-0" style={{ color: 'var(--ink-muted)' }}>
                            {m.semanasAtivas}/{m.totalSemanas} sem.
                          </span>
                        </div>
                        <p className="text-[11px] truncate mt-0.5" style={{ color: 'var(--ink-secondary)' }} title={m.descricao}>
                          {m.descricao || '—'}
                        </p>
                        <div className="flex items-end gap-2 mt-1.5">
                          <Sparkline
                            serie={m.serie}
                            maximo={maximoSparkline}
                            rotulo={`Consumo semanal de ${m.material}: ${m.semanasAtivas} de ${m.totalSemanas} semanas com saída`}
                          />
                          <span className="text-[10px] tabular ml-auto shrink-0 font-semibold" style={{ color: 'var(--ink-primary)' }}>
                            {formatQtd(m.consumoTotal)} {m.umb}
                          </span>
                        </div>
                      </button>
                    </li>
                  );
                })}
                {lista.length > 300 && (
                  <li className="px-3 py-2.5 text-[11px] text-center" style={{ color: 'var(--ink-muted)' }}>
                    Mostrando os 300 primeiros. Refine a busca para alcançar os demais.
                  </li>
                )}
              </ul>
            </aside>

            {/* Detalhe */}
            <div className="space-y-4 min-w-0">
              {resumoSel && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 stagger">
                  <KpiCard
                    label="Consumo no período"
                    value={resumoSel.consumoTotal}
                    format={v => `${formatQtd(v)} ${resumoSel.umb}`}
                    detail={`${formatInt(resumoSel.eventosConsumo)} saídas registradas`}
                    icon={Package}
                    accent="var(--series-1)"
                    emphasize
                  />
                  <KpiCard
                    label="Semanas com saída"
                    value={resumoSel.semanasAtivas}
                    format={formatInt}
                    detail={`de ${formatInt(resumoSel.totalSemanas)} semanas do período`}
                    icon={Activity}
                    accent="var(--series-2)"
                    share={resumoSel.totalSemanas > 0 ? resumoSel.semanasAtivas / resumoSel.totalSemanas : undefined}
                  />
                  <KpiCard
                    label="Média por semana ativa"
                    value={mediaPorSemanaAtiva(resumoSel)}
                    format={v => `${formatQtd(v)} ${resumoSel.umb}`}
                    detail="ignora as semanas sem saída"
                    icon={TrendingUp}
                    accent="var(--series-4)"
                  />
                  <KpiCard
                    label="Pico semanal"
                    value={picoSemanal}
                    format={v => `${formatQtd(v)} ${resumoSel.umb}`}
                    detail={resumoSel.ultimoConsumo ? `última saída em ${formatDateBR(resumoSel.ultimoConsumo)}` : '—'}
                    icon={AlertCircle}
                    accent="var(--status-warning)"
                  />
                </div>
              )}

              <ConsumoSemanalChart
                dados={detalhe}
                material={selecionado || '—'}
                descricao={resumoSel?.descricao}
                umb={resumoSel?.umb}
                semanaProducao={INICIO_PRODUCAO}
                loading={loading}
              />

              {/* Tabela-gêmea: todo valor do gráfico alcançável sem depender de
                  passar o mouse. */}
              {detalhe.length > 0 && (
                <div className="space-y-2">
                  <button
                    onClick={() => setMostrarTabela(v => !v)}
                    aria-expanded={mostrarTabela}
                    className="text-xs font-bold underline cursor-pointer"
                    style={{ color: 'var(--ink-secondary)' }}
                  >
                    {mostrarTabela ? 'Ocultar tabela de valores' : 'Ver tabela de valores'}
                  </button>

                  {mostrarTabela && (
                    <TableShell maxHeight="46vh">
                      <table className="w-full text-xs border-collapse">
                        <TableHeadRow>
                          <Th label="Semana" width="w-20" />
                          <Th label="Período" width="w-32" />
                          <Th label="Consumo" align="right" width="w-32" />
                          <Th label="Entrada" align="right" width="w-32" />
                          <Th label="Saídas" align="right" width="w-24" />
                          <Th label="Saldo acumulado" align="right" width="w-36" />
                        </TableHeadRow>
                        <TableBody>
                          {detalhe.map(p => (
                            <Tr key={p.semana}>
                              <Td strong>{rotuloSemana(p.semana)}</Td>
                              <Td>{intervaloSemana(p.semana)}</Td>
                              <Td align="right" numeric strong={p.consumo > 0}>
                                {p.consumo > 0 ? formatQtd(p.consumo) : '—'}
                              </Td>
                              <Td align="right" numeric>
                                {p.entrada > 0 ? formatQtd(p.entrada) : '—'}
                              </Td>
                              <Td align="right" numeric>{p.eventosConsumo || '—'}</Td>
                              <Td align="right" numeric>{formatQtd(p.acumulado)}</Td>
                            </Tr>
                          ))}
                        </TableBody>
                      </table>
                    </TableShell>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
