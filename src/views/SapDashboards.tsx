/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Painel de gestão de suprimentos.
 *
 * Consolida o que antes eram duas telas — a antiga /suprimentos/dashboards
 * (contagens de status, sem filtro algum) e /suprimentos/demandas (fluxo
 * RM→PO, com filtros próprios). Separadas, obrigavam o gestor a comparar
 * indicadores apurados sobre recortes diferentes.
 *
 * Este arquivo é o *shell*: lê os dados uma vez, mantém o estado de filtro e
 * de aba, calcula o recorte atual e o da janela anterior, e entrega tudo
 * pronto para a aba ativa. Nenhuma aba busca dado próprio — assim o filtro
 * escolhido uma vez atravessa as quatro leituras.
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { LayoutDashboard, RefreshCw, TrendingUp, Users, Building2, Activity, BarChart3, Clock } from 'lucide-react';
import { localDb } from '../db/localDb';
import { supabase } from '../db/supabaseClient';
import { EnrichedSAPRecord } from '../types';
import { formatDateTimeBR } from '../lib/format';
import {
  classifyTipoDemanda, classifyCriticidade, resolveDataCorte, resolveComprador, CompradorInfo,
  isProjetoItem,
} from '../lib/demandas';
import { janelaPadrao, janelaAnterior } from '../lib/suprimentos';
import FiltrosSuprimentos, { EstadoFiltros } from '../components/suprimentos/FiltrosSuprimentos';
import TabVisaoGeral from '../components/suprimentos/TabVisaoGeral';
import TabDemandas from '../components/suprimentos/TabDemandas';
import TabCarteira from '../components/suprimentos/TabCarteira';
import TabFornecedores from '../components/suprimentos/TabFornecedores';
import TabAnaliseCompras from '../components/suprimentos/TabAnaliseCompras';
import ComposicaoModal, { ComposicaoModalConfig } from '../components/charts/ComposicaoModal';

export type AbaSuprimentos = 'geral' | 'demandas' | 'carteira' | 'fornecedores' | 'compras';

interface SapDashboardsProps {
  onNavigate: (path: string) => void;
  /** Aba de entrada. /suprimentos/demandas abre direto em 'demandas'. */
  abaInicial?: AbaSuprimentos;
}

const ABAS: { id: AbaSuprimentos; rotulo: string; icone: typeof Activity; pergunta: string }[] = [
  { id: 'geral', rotulo: 'Visão Geral', icone: Activity, pergunta: 'Como está o setor — melhorou ou piorou?' },
  { id: 'demandas', rotulo: 'Demandas', icone: TrendingUp, pergunta: 'O fluxo da requisição até o pedido está fluindo?' },
  { id: 'carteira', rotulo: 'Carteira & Compradores', icone: Users, pergunta: 'Quem está sobrecarregado e quem está entregando?' },
  { id: 'fornecedores', rotulo: 'Fornecedores & Spend', icone: Building2, pergunta: 'Para onde vai o dinheiro e quem cumpre prazo?' },
  { id: 'compras', rotulo: 'Análise de Compras', icone: BarChart3, pergunta: 'No que já foi comprado: onde está concentrado o gasto e de onde ele vem?' },
];

/**
 * Abas que trabalham sobre a carteira em andamento e por isso respondem ao
 * filtro global do shell. "Análise de Compras" lê outra base — o histórico de
 * pedidos — e carrega filtros próprios; aplicar-lhe criticidade de requisição
 * ou comprador atribuído não faria sentido.
 */
const ABAS_COM_FILTRO_GLOBAL = new Set<AbaSuprimentos>(['geral', 'demandas', 'carteira', 'fornecedores']);

/** Janela padrão: últimos 90 dias — larga o bastante para o ciclo RM→PO fechar. */
const DIAS_PADRAO = 90;

function filtrosIniciais(): EstadoFiltros {
  const j = janelaPadrao(DIAS_PADRAO);
  const anoAtual = new Date().getFullYear();
  return {
    granularidade: 'semana',
    dateFrom: `${anoAtual}-01-01`,
    dateTo: j.ate,
    tipo: 'todos',
    tipoItem: 'consumo',
    criticidade: 'todas',
    area: 'todas',
    comprador: 'todos',
  };
}

export default function SapDashboards({ onNavigate, abaInicial = 'geral' }: SapDashboardsProps) {
  const [records, setRecords] = useState<EnrichedSAPRecord[]>([]);
  const [compradores, setCompradores] = useState<CompradorInfo[]>([]);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [aba, setAba] = useState<AbaSuprimentos>(abaInicial);
  const [filtros, setFiltros] = useState<EstadoFiltros>(filtrosIniciais);
  const [composicao, setComposicao] = useState<ComposicaoModalConfig<EnrichedSAPRecord> | null>(null);

  /* Dados --------------------------------------------------------------- */

  const loadRecords = useCallback(() => {
    setRecords(localDb.getEnrichedSAPRequisicoes());
  }, []);

  const loadCompradores = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.from('sup_compradores').select('grupo_compras, nome_comprador, usuario_sistema');
    if (data) setCompradores(data as CompradorInfo[]);
  }, []);

  const refresh = useCallback(async () => {
    setSyncing(true);
    try {
      // Escopo restrito ao que os dashboards de suprimentos usam — não há
      // motivo para rebaixar cidadeforn (26 MB) ou contatos junto.
      await localDb.syncFromSupabase(true, ['requisicoes', 'pedidos', 'pedidosforn']);
    } catch (err) {
      console.error('Falha ao sincronizar suprimentos:', err);
    } finally {
      loadRecords();
      setLastSync(new Date());
      setSyncing(false);
    }
  }, [loadRecords]);

  useEffect(() => {
    loadRecords();
    loadCompradores();
    setLastSync(new Date());
  }, [loadRecords, loadCompradores]);

  /* Aba na URL ---------------------------------------------------------- */

  // A aba ativa vai para a query da hash para o link ser compartilhável e o
  // botão voltar do navegador funcionar. `replaceState` em vez de navegação
  // para não empilhar uma entrada de histórico por clique em aba.
  const trocarAba = useCallback((nova: AbaSuprimentos) => {
    setAba(nova);
    const base = (window.location.hash || '#/suprimentos/dashboards').slice(1).split('?')[0];
    window.history.replaceState(null, '', `#${base}?tab=${nova}`);
  }, []);

  useEffect(() => {
    const q = (window.location.hash || '').split('?')[1];
    const tab = new URLSearchParams(q || '').get('tab') as AbaSuprimentos | null;
    if (tab && ABAS.some(a => a.id === tab)) setAba(tab);
    else setAba(abaInicial);
  }, [abaInicial]);

  /* Filtros ------------------------------------------------------------- */

  const atualizarFiltros = useCallback((patch: Partial<EstadoFiltros>) => {
    setFiltros(f => ({ ...f, ...patch }));
  }, []);

  const resetarFiltros = useCallback(() => setFiltros(filtrosIniciais()), []);

  const areas = useMemo(() => {
    const s = new Set<string>();
    records.forEach(r => {
      const a = r.area_solicitante?.trim();
      if (a) s.add(a);
    });
    return Array.from(s).sort();
  }, [records]);

  const compradorFiltroNome = useMemo(
    () => compradores.find(c => c.grupo_compras === filtros.comprador)?.nome_comprador,
    [compradores, filtros.comprador]
  );

  /**
   * Aplica todos os recortes exceto o de data, que varia entre a janela atual e
   * a de comparação. Separar assim evita repetir a lógica de filtro duas vezes
   * e garante que os dois períodos sejam recortados exatamente pelos mesmos
   * critérios — se divergirem, a variação deixa de significar o que promete.
   */
  const aplicarRecortes = useCallback((r: EnrichedSAPRecord): boolean => {
    if (filtros.tipo !== 'todos' && classifyTipoDemanda(r.requisicao_de_compra) !== filtros.tipo) return false;
    if (filtros.tipoItem !== 'todos') {
      const eProjeto = isProjetoItem(r.material_code);
      if (filtros.tipoItem === 'projeto' && !eProjeto) return false;
      if (filtros.tipoItem === 'consumo' && eProjeto) return false;
    }
    if (filtros.criticidade !== 'todas' && classifyCriticidade(r.requisicao_de_compra) !== filtros.criticidade) return false;
    if (filtros.area !== 'todas' && (r.area_solicitante?.trim() || 'Não informada') !== filtros.area) return false;
    // Filtra pelo mesmo comprador "resolvido" usado nos gráficos e tabelas —
    // comparar só `grupo_comprador` deixa passar RMs de um comprador cujo PO
    // foi colocado por outro (cobertura entre compradores).
    if (filtros.comprador !== 'todos' && resolveComprador(r, compradores) !== compradorFiltroNome) return false;
    return true;
  }, [filtros.tipo, filtros.tipoItem, filtros.criticidade, filtros.area, filtros.comprador, compradores, compradorFiltroNome]);

  const dentroDoPeriodo = useCallback((r: EnrichedSAPRecord, de: string, ate: string): boolean => {
    if (!de && !ate) return true;
    // Corte por data_pedido quando já há PO colocado (senão uma RM antiga que
    // só ganha PO dentro do período filtrado reaparece com a data de
    // solicitação, fora do período); enquanto aberta, o corte é pela data de
    // solicitação.
    const corte = resolveDataCorte(r);
    if (de && corte < de) return false;
    if (ate && corte > ate) return false;
    return true;
  }, []);

  const filtradosSemData = useMemo(
    () => records.filter(r => aplicarRecortes(r)),
    [records, aplicarRecortes]
  );

  const filtrados = useMemo(
    () => records.filter(r => aplicarRecortes(r) && dentroDoPeriodo(r, filtros.dateFrom, filtros.dateTo)),
    [records, aplicarRecortes, dentroDoPeriodo, filtros.dateFrom, filtros.dateTo]
  );

  /**
   * Mesmo recorte na janela imediatamente anterior, de igual duração. Fica
   * vazio quando o período não tem as duas pontas definidas — sem duração não
   * existe janela comparável, e o DeltaBadge trata a ausência exibindo "—".
   */
  const { filtradosAnterior, temComparacao } = useMemo(() => {
    const janela = janelaAnterior(filtros.dateFrom, filtros.dateTo);
    if (!janela) return { filtradosAnterior: [] as EnrichedSAPRecord[], temComparacao: false };
    return {
      filtradosAnterior: records.filter(r => aplicarRecortes(r) && dentroDoPeriodo(r, janela.de, janela.ate)),
      temComparacao: true,
    };
  }, [records, aplicarRecortes, dentroDoPeriodo, filtros.dateFrom, filtros.dateTo]);

  /* Drill-down ---------------------------------------------------------- */

  const drilldown = useCallback((tipo: 'status' | 'alert' | 'buyer', valor: string) => {
    const chave = tipo === 'status' ? 'status' : tipo === 'alert' ? 'alert' : 'buyer';
    onNavigate(`/suprimentos/compras?${chave}=${encodeURIComponent(valor)}`);
  }, [onNavigate]);

  /** Abre o modal de composição a partir de um clique de gráfico, nas 4 abas
   *  que compartilham `EnrichedSAPRecord[]` como base (Análise de Compras usa
   *  outra base e mantém seu próprio estado de modal). */
  const abrirComposicao = useCallback((config: ComposicaoModalConfig<EnrichedSAPRecord>) => {
    setComposicao(config);
  }, []);

  const fecharComposicao = useCallback(() => setComposicao(null), []);

  const abaAtiva = ABAS.find(a => a.id === aba) ?? ABAS[0];

  const lastSapImport = useMemo(() => localDb.getDatasetUpdatedAt('requisicoes'), [records]);

  return (
    <div className="space-y-6 text-left">
      {/* Cabeçalho */}
      <div className="flex items-start justify-between flex-wrap gap-3 reveal">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2.5" style={{ color: 'var(--ink-primary)' }}>
            <LayoutDashboard className="h-7 w-7" style={{ color: 'var(--brand)' }} />
            Gestão de Suprimentos
          </h2>
          <p className="mt-1 text-sm" style={{ color: 'var(--ink-secondary)' }}>
            {abaAtiva.pergunta}
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--ink-muted)' }}>
          {lastSapImport && (
            <span className="inline-flex items-center gap-1.5 tabular text-slate-500 dark:text-slate-400 font-medium">
              <Clock className="h-3.5 w-3.5" /> {localDb.getDatasetUpdateBadge('requisicoes')}
            </span>
          )}
          <button
            onClick={refresh}
            disabled={syncing}
            className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-50 transition-colors duration-150 hover:bg-[var(--surface-raised)] focus-visible:outline-2 focus-visible:outline-offset-2 cursor-pointer"
            style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)', outlineColor: 'var(--brand)' }}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
        </div>
      </div>

      {/* Abas */}
      <div
        className="flex gap-1 overflow-x-auto border-b"
        style={{ borderColor: 'var(--hairline)' }}
        role="tablist"
        aria-label="Perspectivas de gestão"
      >
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
              className="flex items-center gap-2 px-4 py-2.5 text-xs font-bold whitespace-nowrap border-b-2 -mb-px transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 rounded-t"
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

      {/* Filtro global — vale para as abas de carteira em andamento */}
      {ABAS_COM_FILTRO_GLOBAL.has(aba) && (
        <FiltrosSuprimentos
          filtros={filtros}
          onChange={atualizarFiltros}
          onReset={resetarFiltros}
          areas={areas}
          compradores={compradores}
          // Conta ITENS DE RM, não linhas: um item comprado em dois POs vira
          // duas linhas, e "N requisições" não pode dobrar por causa disso.
          totalFiltrado={new Set(filtrados.map(r => r.ri)).size}
          mostrarGranularidade={aba === 'demandas' || aba === 'carteira'}
        />
      )}

      {aba === 'geral' && (
        <TabVisaoGeral
          records={filtrados}
          recordsAnterior={filtradosAnterior}
          temComparacao={temComparacao}
          compradores={compradores}
          onDrilldown={drilldown}
          onAbrirComposicao={abrirComposicao}
        />
      )}

      {aba === 'demandas' && (
        <TabDemandas
          records={filtrados}
          allRecords={filtradosSemData}
          granularidade={filtros.granularidade}
          compradores={compradores}
          onAbrirComposicao={abrirComposicao}
        />
      )}

      {aba === 'carteira' && (
        <TabCarteira
          records={filtrados}
          compradores={compradores}
          granularidade={filtros.granularidade}
          onSelecionarComprador={nome => drilldown('buyer', nome)}
          onAbrirComposicao={abrirComposicao}
        />
      )}

      {aba === 'fornecedores' && (
        <TabFornecedores records={filtrados} compradores={compradores} onAbrirComposicao={abrirComposicao} />
      )}

      {aba === 'compras' && <TabAnaliseCompras onNavigate={onNavigate} />}

      <ComposicaoModal config={composicao} onClose={fecharComposicao} />
    </div>
  );
}
