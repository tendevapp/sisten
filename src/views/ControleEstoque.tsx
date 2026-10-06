/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Almoxarifado > Controle de Estoque.
 *
 * Reproduz a aba CONTROLE MINIMO da planilha "1. Controle de Stk V2.0.xlsm"
 * sobre as bases SAP já importadas (ZL0024, MB51, ME5A, ZL0132), com uma linha
 * por material. A faixa da planilha (status principal) e o mínimo recomendado
 * do SISTEN são resultados independentes e aparecem em abas separadas.
 *
 * A tela carrega a view uma vez e filtra em memória: KPIs, gráficos, tabela,
 * mínimo SISTEN e exportação partem do mesmo conjunto filtrado.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, BookOpen, Download, LayoutDashboard, RefreshCw, Scale, Settings2, TrendingUp, ClipboardCheck,
} from 'lucide-react';
import { localDb } from '../db/localDb';
import type { ControleEstoqueConfig, ControleEstoqueItem, EstoqueReposicao, Profile } from '../types';
import { calcularFaixaDoItem, type ControleEstoqueAnalise } from '../lib/controleEstoque';
import {
  filtrarControleEstoque,
  listarConfigsControleEstoque,
  listarControleEstoque,
  type FiltrosControleEstoque,
} from '../lib/controleEstoqueApi';
import { exportarControleEstoqueExcel } from '../lib/controleEstoqueExport';
import { montarDossie } from '../lib/controleEstoqueDossie';
import { calcularSugestao, type Recomendacao } from '../lib/reposicao';
import { canAccessPage } from '../lib/pages';
import { formatBRL, formatQtd, ordenarDepositos } from '../lib/almoxarifado';
import { formatDateBR, formatDateTimeBR } from '../lib/format';
import ControleEstoqueResumo from '../components/almoxarifado/controleEstoque/ControleEstoqueResumo';
import ControleEstoqueFiltros, {
  type OpcoesFiltrosControleEstoque,
} from '../components/almoxarifado/controleEstoque/ControleEstoqueFiltros';
import ControleEstoqueDossie from '../components/almoxarifado/controleEstoque/ControleEstoqueDossie';
import ControleEstoqueDetalhe from '../components/almoxarifado/controleEstoque/ControleEstoqueDetalhe';
import ControleEstoqueParametrosModal from '../components/almoxarifado/controleEstoque/ControleEstoqueParametrosModal';
import EstoqueMinimoPanel from '../components/almoxarifado/EstoqueMinimoPanel';
import { TableEmpty } from '../components/ui/DataTable';

export type AbaControleEstoque = 'geral' | 'sisten' | 'fluxo' | 'dossie';
type Aba = AbaControleEstoque;

const ABAS: { id: Aba; rotulo: string; icone: typeof LayoutDashboard; pergunta: string }[] = [
  { id: 'geral', rotulo: 'Visão geral', icone: LayoutDashboard, pergunta: 'Como está o estoque frente à faixa mínima e máxima?' },
  { id: 'dossie', rotulo: 'Dossiê', icone: BookOpen, pergunta: 'Qual é a história de cada material: estoque, faixa, RM, pedido e chegada?' },
  { id: 'sisten', rotulo: 'Mínimo SISTEN', icone: ClipboardCheck, pergunta: 'O que o método estatístico do SISTEN recomenda para os mesmos materiais?' },
  { id: 'fluxo', rotulo: 'Entradas x saídas', icone: TrendingUp, pergunta: 'O que entrou e o que foi consumido, mês a mês?' },
];

const DIAS_BASE_DESATUALIZADA = 7;

const unicos = (valores: (string | null | undefined)[]) => Array.from(
  new Set(valores.filter((v): v is string => !!v && v.trim() !== '')),
).sort((a, b) => a.localeCompare(b, 'pt-BR'));

const maiorData = (valores: (string | null)[]) => valores.reduce<string | null>(
  (maior, atual) => (atual && (!maior || atual > maior) ? atual : maior), null,
);

const rotuloMes = (iso: string) => {
  const [ano, mes] = iso.slice(0, 7).split('-');
  return `${mes}/${ano}`;
};

interface Props {
  user: Profile;
  /** Aba de entrada, para links diretos por rota. */
  abaInicial?: Aba;
}

export default function ControleEstoque({ user, abaInicial = 'geral' }: Props) {
  const podeEditar = canAccessPage(user, 'almox_controle_estoque_editar');

  const [aba, setAba] = useState<Aba>(abaInicial);
  const [itens, setItens] = useState<ControleEstoqueItem[]>([]);
  const [configs, setConfigs] = useState<ControleEstoqueConfig[]>([]);
  const [reposicao, setReposicao] = useState<EstoqueReposicao[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [filtros, setFiltros] = useState<FiltrosControleEstoque>({});
  const [recomendacaoFiltro, setRecomendacaoFiltro] = useState<'Todos' | Recomendacao>('Todos');
  const [detalhe, setDetalhe] = useState<ControleEstoqueAnalise | null>(null);
  const [edicao, setEdicao] = useState<{ linha: ControleEstoqueAnalise | null } | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      // Reposição (método SISTEN) é complementar: se falhar, a faixa da planilha
      // continua válida e a aba "Mínimo SISTEN" mostra o que houver em cache.
      const [dados, cfgs, repos] = await Promise.all([
        listarControleEstoque(),
        listarConfigsControleEstoque(),
        localDb.fetchReposicao(true).catch(() => [] as EstoqueReposicao[]),
      ]);
      setItens(dados.itens);
      setConfigs(cfgs);
      setReposicao(repos);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao carregar o controle de estoque.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);

  /* Aba na URL, para o link ser compartilhável --------------------------- */

  useEffect(() => {
    const q = (window.location.hash || '').split('?')[1];
    const tab = new URLSearchParams(q || '').get('tab') as Aba | null;
    if (tab && ABAS.some(a => a.id === tab)) setAba(tab);
    else setAba(abaInicial);
  }, [abaInicial]);

  const trocarAba = useCallback((nova: Aba) => {
    setAba(nova);
    const base = (window.location.hash || '#/almoxarifado/controle-estoque').slice(1).split('?')[0];
    window.history.replaceState(null, '', `#${base}?tab=${nova}`);
  }, []);

  /* Conjunto filtrado — fonte única de KPIs, tabela, SISTEN e exportação -- */

  const filtrados = useMemo(() => filtrarControleEstoque(itens, filtros), [itens, filtros]);

  const linhas = useMemo<ControleEstoqueAnalise[]>(
    () => filtrados.map(item => ({ item, faixa: calcularFaixaDoItem(item) })),
    [filtrados],
  );

  const opcoes = useMemo<OpcoesFiltrosControleEstoque>(() => ({
    depositos: ordenarDepositos(unicos(itens.flatMap(i => i.depositos.map(d => d.deposito)))),
    categorias: unicos(itens.map(i => i.categoria)),
    aplicacoes: unicos(itens.map(i => i.aplicacao)),
    projetos: unicos(itens.flatMap(i => i.opcoes_quantidade_por_torre.map(o => o.projeto))),
  }), [itens]);

  const config = useMemo(
    () => configs.find(c => c.centro === (filtros.centro ?? itens[0]?.centro)) ?? configs[0] ?? null,
    [configs, filtros.centro, itens],
  );

  /* Mínimo SISTEN: mesmos materiais do recorte atual ---------------------- */

  const sugestoes = useMemo(() => {
    const materiais = new Set(filtrados.map(i => i.material));
    return reposicao.filter(r => materiais.has(r.material)).map(calcularSugestao);
  }, [reposicao, filtrados]);

  const dossie = useMemo(() => montarDossie(
    linhas,
    new Map(sugestoes.map(s => [s.material, s.minimoSugerido] as const)),
  ), [linhas, sugestoes]);

  const leadMediano = useMemo(() => {
    const proprios = reposicao.filter(r => r.lead_proprio && r.lead_dias).map(r => r.lead_dias!);
    if (proprios.length === 0) return reposicao[0]?.lead_dias ?? null;
    const ord = [...proprios].sort((a, b) => a - b);
    return ord[Math.floor(ord.length / 2)];
  }, [reposicao]);

  /* Entradas x saídas -------------------------------------------------- */

  const fluxoMensal = useMemo(() => {
    const mapa = new Map<string, { mes: string; entrada: number; consumo: number; valorEntrada: number; valorConsumo: number }>();
    filtrados.forEach(item => item.movimentos_mensais.forEach(m => {
      const atual = mapa.get(m.mes) ?? { mes: m.mes, entrada: 0, consumo: 0, valorEntrada: 0, valorConsumo: 0 };
      atual.entrada += m.entrada;
      atual.consumo += m.consumo;
      atual.valorEntrada += m.valor_entrada;
      atual.valorConsumo += m.valor_consumo;
      mapa.set(m.mes, atual);
    }));
    return Array.from(mapa.values()).sort((a, b) => a.mes.localeCompare(b.mes));
  }, [filtrados]);

  const maioresDiferencas = useMemo(() => [...filtrados]
    .filter(i => i.entrada_valor !== 0 || i.consumo_valor !== 0)
    .sort((a, b) => Math.abs(b.entrada_valor - b.consumo_valor) - Math.abs(a.entrada_valor - a.consumo_valor))
    .slice(0, 30), [filtrados]);

  /* Frescor das bases ---------------------------------------------------- */

  const frescor = useMemo(() => ({
    estoque: maiorData(itens.map(i => i.estoque_importado_em)),
    movimentos: maiorData(itens.map(i => i.movimentos_importados_em)),
    ultimoMovimento: maiorData(itens.map(i => i.ultimo_movimento)),
  }), [itens]);

  const baseDesatualizada = useMemo(() => {
    if (!frescor.ultimoMovimento) return false;
    const dias = (Date.now() - new Date(`${frescor.ultimoMovimento.slice(0, 10)}T12:00:00`).getTime()) / 86_400_000;
    return dias > DIAS_BASE_DESATUALIZADA;
  }, [frescor.ultimoMovimento]);

  const parametros = useMemo(() => {
    const primeiro = itens[0];
    return {
      janela_inicio: config?.janela_inicio ?? primeiro?.janela_inicio ?? '',
      janela_fim: config?.janela_fim ?? primeiro?.janela_fim ?? null,
      lead_time_padrao_dias: config?.lead_time_padrao_dias ?? primeiro?.lead_time_dias ?? 15,
      intervalo_compra_dias: config?.intervalo_compra_dias ?? primeiro?.intervalo_compra_dias ?? 30,
    };
  }, [config, itens]);

  const exportar = () => exportarControleEstoqueExcel(filtrados, filtros, parametros);

  const botaoClass = 'inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer border hover:opacity-90 active:scale-95 disabled:opacity-50';
  const botaoStyle = { borderColor: 'var(--hairline)', background: 'var(--surface-raised)', color: 'var(--ink-primary)' };
  const semDados = !loading && !erro && itens.length === 0;

  return (
    <div className="space-y-5">
      {/* Cabeçalho */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-5 reveal" style={{ borderColor: 'var(--hairline)' }}>
        <div className="min-w-0 flex-1">
          <h2 className="text-2xl font-extrabold flex items-center gap-2.5" style={{ color: 'var(--ink-primary)' }}>
            <Scale className="h-7 w-7" style={{ color: 'var(--brand)' }} />
            Controle de Estoque
          </h2>
          <p className="text-xs sm:text-sm mt-1.5" style={{ color: 'var(--ink-secondary)' }}>
            {ABAS.find(a => a.id === aba)?.pergunta}
          </p>
          {itens.length > 0 && (
            <p className="text-[11px] mt-1" style={{ color: 'var(--ink-muted)' }}>
              Janela {formatDateBR(parametros.janela_inicio)} a {parametros.janela_fim ? formatDateBR(parametros.janela_fim) : 'hoje'}
              {' · '}lead time {parametros.lead_time_padrao_dias} d · intervalo de compra {parametros.intervalo_compra_dias} d
              {frescor.estoque && <> {' · '}ZL0024 em {formatDateTimeBR(frescor.estoque)}</>}
              {frescor.movimentos && <> {' · '}MB51 em {formatDateTimeBR(frescor.movimentos)}</>}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button onClick={() => void carregar()} disabled={loading} className={botaoClass} style={botaoStyle}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Atualizar
          </button>
          <button onClick={exportar} disabled={loading || linhas.length === 0} className={botaoClass} style={botaoStyle}>
            <Download className="h-4 w-4" /> Exportar
          </button>
          {podeEditar && (
            <button onClick={() => setEdicao({ linha: null })} disabled={loading} className={botaoClass} style={botaoStyle}>
              <Settings2 className="h-4 w-4" /> Parâmetros
            </button>
          )}
        </div>
      </div>

      {/* Abas */}
      <div className="flex gap-1 overflow-x-auto border-b" style={{ borderColor: 'var(--hairline)' }} role="tablist" aria-label="Análises do controle de estoque">
        {ABAS.map(a => {
          const Icone = a.icone;
          const ativa = a.id === aba;
          return (
            <button
              key={a.id}
              role="tab"
              aria-selected={ativa}
              onClick={() => trocarAba(a.id)}
              title={a.pergunta}
              className="shrink-0 flex items-center gap-2 px-4 py-2.5 text-xs font-bold whitespace-nowrap border-b-2 -mb-px transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 rounded-t cursor-pointer"
              style={{
                borderColor: ativa ? 'var(--brand)' : 'transparent',
                color: ativa ? 'var(--brand)' : 'var(--ink-muted)',
                outlineColor: 'var(--brand)',
              }}
            >
              <Icone className="h-4 w-4" aria-hidden="true" />
              {a.rotulo}
            </button>
          );
        })}
      </div>

      {erro && (
        <div className="flex items-center gap-3.5 p-5 border border-rose-200 dark:border-rose-900/50 rounded-xl bg-rose-50/50 dark:bg-rose-950/20 text-rose-800 dark:text-rose-300" role="alert">
          <AlertCircle className="h-6 w-6 shrink-0" />
          <span className="text-sm font-medium">{erro}</span>
        </div>
      )}

      {baseDesatualizada && !erro && (
        <div className="flex items-center gap-3 p-3.5 rounded-xl border text-xs" style={{ borderColor: 'var(--status-warning)', color: 'var(--ink-secondary)', background: 'color-mix(in srgb, var(--status-warning) 10%, transparent)' }}>
          <AlertCircle className="h-4 w-4 shrink-0" style={{ color: 'var(--status-warning)' }} />
          <span>
            O último movimento da MB51 é de <strong>{formatDateBR(frescor.ultimoMovimento)}</strong>. Importe as planilhas SAP
            atualizadas antes de decidir compras: consumo e status dependem dessa base.
          </span>
        </div>
      )}

      {semDados && (
        <TableEmpty
          icon={Scale}
          title="Nenhum material disponível"
          hint="Importe ZL0024, MB51, ME5A e ZL0132 na aba Importar SAP do painel administrativo."
        />
      )}

      {(loading || (!erro && itens.length > 0)) && (
        <>
          <ControleEstoqueFiltros
            filtros={filtros}
            opcoes={opcoes}
            onChange={setFiltros}
            onLimpar={() => { setFiltros({}); setRecomendacaoFiltro('Todos'); }}
          />

          {aba === 'geral' && (linhas.length > 0
            ? <ControleEstoqueResumo linhas={linhas} />
            : !loading && <TableEmpty icon={Scale} title="Nenhum material neste recorte" hint="Ajuste ou limpe os filtros." />)}

          {aba === 'sisten' && (
            <EstoqueMinimoPanel
              sugestoes={sugestoes}
              loading={loading}
              janelaInicio={reposicao[0]?.janela_inicio}
              janelaFim={reposicao[0]?.janela_fim}
              janelaDias={reposicao[0]?.janela_dias}
              leadMediano={leadMediano}
              recomendacaoFiltro={recomendacaoFiltro}
              onRecomendacaoChange={setRecomendacaoFiltro}
            />
          )}

          {aba === 'dossie' && (
            <ControleEstoqueDossie
              linhas={dossie}
              loading={loading}
              onSelecionar={chave => setDetalhe(linhas.find(l => chave.startsWith(`${l.item.centro}-${l.item.material}-`)) ?? null)}
            />
          )}

          {aba === 'fluxo' && (fluxoMensal.length === 0
            ? !loading && <TableEmpty icon={TrendingUp} title="Sem movimentos no recorte" hint="Ajuste os filtros ou confirme a importação da MB51." />
            : (
              <div className="grid gap-4 xl:grid-cols-2">
                <section className="rounded-xl border overflow-auto" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}>
                  <h3 className="px-4 pt-4 text-xs font-black uppercase tracking-wider" style={{ color: 'var(--ink-primary)' }}>Por mês</h3>
                  <table className="mt-3 w-full min-w-[520px] border-collapse text-xs">
                    <thead style={{ background: 'var(--surface-raised)' }}>
                      <tr>
                        {['Mês', 'Entradas (qtd)', 'Consumo (qtd)', 'Entradas (R$)', 'Consumo (R$)'].map((t, i) => (
                          <th key={t} className={`px-3 py-2 text-[10px] font-black uppercase tracking-wider whitespace-nowrap ${i ? 'text-right' : 'text-left'}`} style={{ color: 'var(--ink-muted)' }}>{t}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {fluxoMensal.map(m => (
                        <tr key={m.mes} className="border-t" style={{ borderColor: 'var(--hairline)' }}>
                          <td className="px-3 py-2 font-bold">{rotuloMes(m.mes)}</td>
                          <td className="px-3 py-2 text-right tabular">{formatQtd(m.entrada)}</td>
                          <td className="px-3 py-2 text-right tabular">{formatQtd(m.consumo)}</td>
                          <td className="px-3 py-2 text-right tabular">{formatBRL(m.valorEntrada)}</td>
                          <td className="px-3 py-2 text-right tabular">{formatBRL(m.valorConsumo)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>

                <section className="rounded-xl border overflow-auto" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}>
                  <h3 className="px-4 pt-4 text-xs font-black uppercase tracking-wider" style={{ color: 'var(--ink-primary)' }}>Maiores diferenças entre entrada e consumo (R$)</h3>
                  <table className="mt-3 w-full min-w-[520px] border-collapse text-xs">
                    <thead style={{ background: 'var(--surface-raised)' }}>
                      <tr>
                        {['Material', 'Entradas (R$)', 'Consumo (R$)', 'Saldo (R$)'].map((t, i) => (
                          <th key={t} className={`px-3 py-2 text-[10px] font-black uppercase tracking-wider whitespace-nowrap ${i ? 'text-right' : 'text-left'}`} style={{ color: 'var(--ink-muted)' }}>{t}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {maioresDiferencas.map(item => (
                        <tr key={`${item.centro}-${item.material}`} className="border-t" style={{ borderColor: 'var(--hairline)' }}>
                          <td className="px-3 py-2 max-w-64">
                            <span className="font-mono font-black">{item.material}</span>
                            <span className="block truncate" title={item.descricao ?? ''} style={{ color: 'var(--ink-muted)' }}>{item.descricao || 'Sem descrição'}</span>
                          </td>
                          <td className="px-3 py-2 text-right tabular">{formatBRL(item.entrada_valor)}</td>
                          <td className="px-3 py-2 text-right tabular">{formatBRL(item.consumo_valor)}</td>
                          <td className="px-3 py-2 text-right tabular font-bold">{formatBRL(item.entrada_valor - item.consumo_valor)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              </div>
            ))}
        </>
      )}

      {detalhe && (
        <ControleEstoqueDetalhe
          linha={detalhe}
          onClose={() => setDetalhe(null)}
          onEditar={podeEditar ? () => { setEdicao({ linha: detalhe }); setDetalhe(null); } : undefined}
        />
      )}

      {edicao && podeEditar && (
        <ControleEstoqueParametrosModal
          user={user}
          config={config}
          linha={edicao.linha}
          onClose={() => setEdicao(null)}
          onSaved={async () => { setEdicao(null); await carregar(); }}
        />
      )}
    </div>
  );
}
