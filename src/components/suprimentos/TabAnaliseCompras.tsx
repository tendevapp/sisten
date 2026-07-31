/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Análise de Compras — a lente do histórico dentro da Gestão de Suprimentos.
 *
 * As outras abas da página falam da carteira em andamento (requisições,
 * pedidos, prazos). Esta fala do que já foi comprado: onde está concentrado o
 * gasto, de quem dependemos, de onde vem e o que dá para consolidar.
 *
 * Tem filtros próprios, e não os do shell, porque a base é outra —
 * `vw_historico_pedidos`, agregada por material + fornecedor + pedido. Recortar
 * histórico por criticidade de requisição ou por comprador atribuído não faria
 * sentido; recortar por natureza do item, UF, cidade e grupo de mercadoria, sim.
 *
 * Os valores estão em BRL: a view soma `valor_em_brl`, não `valor_liquido`,
 * que está na moeda original do pedido.
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  RefreshCw, Building2, MapPin, Layers, Wallet, Receipt, Package, ShieldAlert, Globe, ExternalLink,
} from 'lucide-react';
import { localDb } from '../../db/localDb';
import { HistoricoPedidoView } from '../../types';
import {
  agregarPor, classificarABC, calcResumo, calcRiscoFonte, calcFragmentacao, calcMatriz,
  criarCanonicalizadorCidade, normalizarTexto,
  porFornecedor, porGrupo, porRamoGrupo, porTipoItem, porRegiao, porOrigem, porPaisNome, ehBrasil,
  porLocalizacaoComEstado, calcHierarquiaGeografica,
  RAMO_LABEL, NAO_INFORMADO,
} from '../../lib/historicoAnalytics';
import { formatInt, formatPct, formatBRLCompacto, formatDateBR } from '../../lib/format';
import KpiCard from '../charts/KpiCard';
import ParetoValorChart from '../historico/ParetoValorChart';
import DistribuicaoBarras from '../historico/DistribuicaoBarras';
import RiscoFonteUnica from '../historico/RiscoFonteUnica';
import CurvaAbcGrupos from '../historico/CurvaAbcGrupos';
import MatrizCalor from '../historico/MatrizCalor';
import FragmentacaoChart from '../historico/FragmentacaoChart';
import HierarquiaGeograficaTree from '../historico/HierarquiaGeograficaTree';

type SubAba = 'fornecedores' | 'geografia' | 'categorias';

interface TabAnaliseComprasProps {
  onNavigate: (path: string) => void;
}

const SUB_ABAS: { id: SubAba; rotulo: string; icone: typeof Building2 }[] = [
  { id: 'fornecedores', rotulo: 'Fornecedores', icone: Building2 },
  { id: 'geografia', rotulo: 'Geografia', icone: MapPin },
  { id: 'categorias', rotulo: 'Categorias', icone: Layers },
];

interface Filtros {
  de: string;
  ate: string;
  origem: string;
  regiao: string;
  cidade: string;
  grupo: string;
  fornecedor: string;
  tipoItem: string;
}

const FILTROS_VAZIOS: Filtros = {
  de: `${new Date().getFullYear()}-01-01`, ate: '', origem: 'todas', regiao: 'todas', cidade: 'todas',
  grupo: 'todos', fornecedor: 'todos', tipoItem: 'todos',
};

const selectClass =
  'rounded-lg border py-1.5 px-3 text-xs cursor-pointer transition-colors duration-150 focus:outline-2 focus:outline-offset-1 border-[var(--hairline)] bg-[var(--surface-card)] text-[var(--ink-secondary)] focus:outline-[var(--brand)]';

export default function TabAnaliseCompras({ onNavigate }: TabAnaliseComprasProps) {
  const [linhas, setLinhas] = useState<HistoricoPedidoView[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [sincronizando, setSincronizando] = useState(false);
  const [sub, setSub] = useState<SubAba>('fornecedores');
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_VAZIOS);

  const carregar = useCallback(async (force = false) => {
    if (force) setSincronizando(true);
    try {
      setLinhas(await localDb.fetchHistoricoPedidos(force));
    } catch (err) {
      console.error('Falha ao carregar histórico de compras:', err);
      setLinhas(localDb.getHistoricoPedidos());
    } finally {
      setCarregando(false);
      setSincronizando(false);
    }
  }, []);

  useEffect(() => {
    setLinhas(localDb.getHistoricoPedidos());
    carregar();
  }, [carregar]);

  /* Cidade canônica ----------------------------------------------------- */

  // Construído sobre a base inteira, não sobre o recorte filtrado: se as
  // variantes fossem resolvidas dentro do filtro, o rótulo canônico poderia
  // mudar conforme o usuário filtra, e a mesma cidade apareceria com nomes
  // diferentes em recortes diferentes.
  const canonicalizarCidade = useMemo(() => criarCanonicalizadorCidade(linhas), [linhas]);

  const cidadeDe = useCallback(
    (l: HistoricoPedidoView) => porLocalizacaoComEstado(l, canonicalizarCidade),
    [canonicalizarCidade]
  );

  const opcoes = useMemo(() => {
    const regioes = new Set<string>();
    const cidades = new Set<string>();
    const grupos = new Set<string>();
    const fornecedores = new Set<string>();
    for (const l of linhas) {
      const r = porRegiao(l);
      if (r && r !== NAO_INFORMADO) regioes.add(r);
      const c = cidadeDe(l);
      if (c) cidades.add(c);
      const g = porGrupo(l);
      if (g) grupos.add(g);
      const f = porFornecedor(l);
      if (f) fornecedores.add(f);
    }
    const ordenar = (s: Set<string>) => Array.from(s).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    return {
      regioes: ordenar(regioes),
      cidades: ordenar(cidades),
      grupos: ordenar(grupos),
      fornecedores: ordenar(fornecedores),
    };
  }, [linhas, cidadeDe]);

  const filtradas = useMemo(() => linhas.filter(l => {
    const d = String(l.data_doc ?? '');
    if (filtros.de && (!d || d < filtros.de)) return false;
    if (filtros.ate && (!d || d > filtros.ate)) return false;
    if (filtros.origem !== 'todas' && porOrigem(l) !== filtros.origem) return false;
    if (filtros.regiao !== 'todas' && porRegiao(l) !== filtros.regiao) return false;
    if (filtros.cidade !== 'todas') {
      const loc = cidadeDe(l);
      const rawCid = l.cidade || l.localidade || '';
      const isMatch =
        normalizarTexto(loc).includes(normalizarTexto(filtros.cidade)) ||
        (rawCid && normalizarTexto(rawCid).includes(normalizarTexto(filtros.cidade)));
      if (!isMatch) return false;
    }
    if (filtros.grupo !== 'todos') {
      const g = porGrupo(l) || NAO_INFORMADO;
      const rawG = l.grp_mercads || '';
      if (g !== filtros.grupo && rawG !== filtros.grupo && !g.startsWith(filtros.grupo)) return false;
    }
    if (filtros.fornecedor !== 'todos' && (porFornecedor(l) || NAO_INFORMADO) !== filtros.fornecedor) return false;
    if (filtros.tipoItem !== 'todos' && porTipoItem(l) !== filtros.tipoItem) return false;
    return true;
  }), [linhas, filtros, cidadeDe]);

  const patch = (p: Partial<Filtros>) => setFiltros(f => ({ ...f, ...p }));

  /* Agregações ---------------------------------------------------------- */

  const resumo = useMemo(() => calcResumo(filtradas), [filtradas]);
  const fornecedores = useMemo(() => agregarPor(filtradas, porFornecedor), [filtradas]);
  const regioes = useMemo(() => agregarPor(filtradas, porRegiao), [filtradas]);
  const cidades = useMemo(() => agregarPor(filtradas, cidadeDe), [filtradas, cidadeDe]);
  const hierarquiaGeografica = useMemo(
    () => calcHierarquiaGeografica(filtradas, canonicalizarCidade),
    [filtradas, canonicalizarCidade]
  );
  const paises = useMemo(() => agregarPor(filtradas, porPaisNome), [filtradas]);
  const ramos = useMemo(() => agregarPor(filtradas, porRamoGrupo), [filtradas]);
  const gruposAbc = useMemo(() => classificarABC(agregarPor(filtradas, porGrupo)), [filtradas]);
  const riscos = useMemo(() => calcRiscoFonte(filtradas), [filtradas]);
  const fragmentacao = useMemo(() => calcFragmentacao(filtradas), [filtradas]);
  const matriz = useMemo(() => calcMatriz(filtradas, porGrupo, porRegiao, 12, 7), [filtradas]);

  const composicao = useMemo(() => {
    const fatias = agregarPor(filtradas, porTipoItem);
    const total = fatias.reduce((s, f) => s + f.valor, 0);
    return fatias.map(f => ({
      tipo: f.chave,
      valor: f.valor,
      itens: f.itens,
      pedidos: f.pedidos,
      pct: total > 0 ? (f.valor / total) * 100 : 0,
    }));
  }, [filtradas]);

  // Peso do que vem de fora do país. Fica em destaque porque a leitura de
  // origem muda a conversa: importação tem lead time, câmbio e risco
  // logístico que compra nacional não tem.
  const exterior = useMemo(() => {
    let valorFora = 0;
    let linhasFora = 0;
    let total = 0;
    for (const l of filtradas) {
      const v = typeof l.valor_liquido === 'number' ? l.valor_liquido : 0;
      total += v;
      if (!ehBrasil(l)) {
        valorFora += v;
        linhasFora++;
      }
    }
    return { valor: valorFora, linhas: linhasFora, pct: total > 0 ? (valorFora / total) * 100 : 0 };
  }, [filtradas]);

  const pctFonteUnica = resumo.valorTotal > 0 ? (resumo.valorFonteUnica / resumo.valorTotal) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Sub-abas e ações */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-1 rounded-lg border p-0.5" style={{ borderColor: 'var(--hairline)' }} role="tablist" aria-label="Lentes da análise de compras">
          {SUB_ABAS.map(s => {
            const Icone = s.icone;
            const ativa = s.id === sub;
            return (
              <button
                key={s.id}
                role="tab"
                aria-selected={ativa}
                onClick={() => setSub(s.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-md transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-1"
                style={ativa ? { background: 'var(--brand)', color: '#ffffff' } : { color: 'var(--ink-muted)' }}
              >
                <Icone className="h-3.5 w-3.5" aria-hidden="true" />
                {s.rotulo}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--ink-muted)' }}>
          {resumo.periodoDe && (
            <span className="tabular">
              {formatDateBR(resumo.periodoDe)} a {formatDateBR(resumo.periodoAte)}
            </span>
          )}
          <button
            onClick={() => onNavigate('/suprimentos/historico')}
            className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors duration-150 hover:bg-[var(--surface-raised)] focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)', outlineColor: 'var(--brand)' }}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Histórico detalhado
          </button>
          <button
            onClick={() => carregar(true)}
            disabled={sincronizando}
            className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-50 transition-colors duration-150 hover:bg-[var(--surface-raised)] focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)', outlineColor: 'var(--brand)' }}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${sincronizando ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-3.5 grid-cols-2 lg:grid-cols-5 stagger">
        <KpiCard
          label="Gasto no Período"
          value={resumo.valorTotal}
          format={formatBRLCompacto}
          detail={`${formatInt(resumo.pedidos)} pedidos · ${formatInt(resumo.itens)} itens`}
          icon={Wallet}
          accent="var(--series-7)"
          emphasize
        />
        <KpiCard
          label="Fornecedores"
          value={resumo.fornecedores}
          format={formatInt}
          detail={`${formatInt(resumo.fornecedoresPara80)} concentram 80% do gasto`}
          icon={Building2}
          accent="var(--series-1)"
        />
        <KpiCard
          label="Ticket Médio"
          value={resumo.ticketMedio}
          format={formatBRLCompacto}
          detail="Valor médio por pedido"
          icon={Receipt}
          accent="var(--series-3)"
        />
        <KpiCard
          label="Compra Importada"
          value={exterior.pct}
          format={formatPct}
          detail={`${formatBRLCompacto(exterior.valor)} em ${formatInt(exterior.linhas)} itens`}
          icon={Globe}
          accent="var(--series-2)"
          share={exterior.pct / 100}
        />
        <KpiCard
          label="Gasto em Fonte Única"
          value={pctFonteUnica}
          format={formatPct}
          detail={`${formatInt(resumo.gruposFonteUnica)} grupos com um só fornecedor`}
          icon={ShieldAlert}
          accent={pctFonteUnica >= 30 ? 'var(--status-critical)' : pctFonteUnica >= 15 ? 'var(--status-warning)' : 'var(--status-good)'}
          share={pctFonteUnica / 100}
        />
      </div>

      {/* Filtros próprios desta aba */}
      <div
        className="rounded-xl border p-4 flex flex-wrap items-center gap-3"
        style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}
      >
        <input type="date" value={filtros.de} onChange={e => patch({ de: e.target.value })} className={selectClass} aria-label="Data inicial" />
        <span className="text-xs" style={{ color: 'var(--ink-muted)' }}>até</span>
        <input type="date" value={filtros.ate} onChange={e => patch({ ate: e.target.value })} className={selectClass} aria-label="Data final" />

        {/* Natureza do item em botões, não em lista: é o recorte que mais muda
            a leitura da página, e um <select> no meio da fila o deixaria com o
            mesmo peso visual de um filtro acessório. */}
        <div className="flex items-center gap-1 rounded-lg border p-0.5" style={{ borderColor: 'var(--hairline)' }} role="group" aria-label="Natureza do item">
          {[
            { v: 'todos', r: 'Tudo' },
            { v: 'Consumo', r: 'Consumo' },
            { v: 'Projeto', r: 'Projeto' },
          ].map(o => (
            <button
              key={o.v}
              onClick={() => patch({ tipoItem: o.v })}
              aria-pressed={filtros.tipoItem === o.v}
              className="px-3 py-1 text-xs font-medium rounded-md transition-colors duration-150"
              style={filtros.tipoItem === o.v ? { background: 'var(--brand)', color: '#ffffff' } : { color: 'var(--ink-muted)' }}
            >
              {o.r}
            </button>
          ))}
        </div>

        <select value={filtros.origem} onChange={e => patch({ origem: e.target.value })} className={selectClass} aria-label="Origem">
          <option value="todas">Brasil e exterior</option>
          <option value="Brasil">Só Brasil</option>
          <option value="Exterior">Só exterior</option>
        </select>

        <select value={filtros.regiao} onChange={e => patch({ regiao: e.target.value })} className={selectClass} aria-label="Região">
          <option value="todas">Todas as regiões</option>
          {opcoes.regioes.map(r => <option key={r} value={r}>{r}</option>)}
        </select>

        <select value={filtros.cidade} onChange={e => patch({ cidade: e.target.value })} className={selectClass} aria-label="Cidade">
          <option value="todas">Todas as cidades</option>
          {opcoes.cidades.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        <select value={filtros.grupo} onChange={e => patch({ grupo: e.target.value })} className={selectClass} aria-label="Grupo de mercadoria">
          <option value="todos">Todos os grupos</option>
          {opcoes.grupos.map(g => <option key={g} value={g}>{g}</option>)}
        </select>

        <select value={filtros.fornecedor} onChange={e => patch({ fornecedor: e.target.value })} className={selectClass} aria-label="Fornecedor">
          <option value="todos">Todos os fornecedores</option>
          {opcoes.fornecedores.map(f => <option key={f} value={f}>{f}</option>)}
        </select>

        <button
          onClick={() => setFiltros(FILTROS_VAZIOS)}
          className="rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors duration-150 hover:bg-[var(--surface-raised)] focus-visible:outline-2 focus-visible:outline-offset-1"
          style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)', outlineColor: 'var(--brand)' }}
        >
          Limpar
        </button>

        <span className="ml-auto text-xs tabular" style={{ color: 'var(--ink-muted)' }}>
          {formatInt(filtradas.length)} linhas no filtro
        </span>
      </div>

      {/* Composição por natureza. Só aparece quando as duas convivem no
          recorte — filtrado em uma delas, diria 100% e viraria decoração. */}
      {composicao.length > 1 && (
        <div
          className="rounded-xl border px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-2"
          style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}
        >
          <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--ink-muted)' }}>
            Composição
          </span>
          {composicao.map(c => (
            <button
              key={c.tipo}
              onClick={() => patch({ tipoItem: c.tipo })}
              className="flex items-baseline gap-1.5 text-xs rounded px-1 -mx-1 hover:underline focus-visible:outline-2 focus-visible:outline-offset-1"
              style={{ outlineColor: 'var(--brand)' }}
              title={`Filtrar só ${c.tipo}`}
            >
              <span className="font-bold" style={{ color: 'var(--ink-primary)' }}>{c.tipo}</span>
              <span className="font-black tabular" style={{ color: 'var(--brand)' }}>{formatPct(c.pct)}</span>
              <span className="tabular" style={{ color: 'var(--ink-muted)' }}>
                {formatBRLCompacto(c.valor)} · {formatInt(c.itens)} itens · {formatInt(c.pedidos)} pedidos
              </span>
            </button>
          ))}
          <span className="text-[10px] leading-snug basis-full sm:basis-auto" style={{ color: 'var(--ink-muted)' }}>
            Itens de projeto são poucos e caros, comprados de poucos fornecedores — leia a concentração com essa separação em mente.
          </span>
        </div>
      )}

      {carregando && linhas.length === 0 ? (
        <div className="py-24 text-center text-sm" style={{ color: 'var(--ink-muted)' }}>
          Carregando histórico de compras…
        </div>
      ) : (
        <>
          {sub === 'fornecedores' && (
            <div className="space-y-6">
              <ParetoValorChart
                fatias={fornecedores}
                title="Concentração de Fornecedores"
                icon={Building2}
                unidade="fornecedor"
                description={
                  resumo.fornecedores > 0
                    ? `${formatInt(resumo.fornecedoresPara80)} de ${formatInt(resumo.fornecedores)} fornecedores concentram 80% do gasto. Clique numa barra para filtrar.`
                    : undefined
                }
                onSelecionar={f => patch({ fornecedor: f })}
              />
              <FragmentacaoChart dados={fragmentacao} />
            </div>
          )}

          {sub === 'geografia' && (
            <div className="space-y-6">
              <HierarquiaGeograficaTree
                hierarquia={hierarquiaGeografica}
                onSelecionarEstado={e => patch({ regiao: e })}
                onSelecionarCidade={c => patch({ cidade: c })}
              />

              <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
                <DistribuicaoBarras
                  fatias={regioes}
                  title="Gasto por Região de Origem"
                  icon={MapPin}
                  description="UF quando o fornecedor é brasileiro; país quando é importado. O campo de região do SAP traz código numérico estrangeiro nos importados, que sozinho não se lê."
                  top={10}
                  larguraRotulo={150}
                  onSelecionar={r => patch({ regiao: r })}
                />
                <DistribuicaoBarras
                  fatias={paises}
                  title="Gasto por País"
                  icon={Globe}
                  description={
                    exterior.linhas > 0
                      ? `${formatPct(exterior.pct)} do gasto vem de fora do país, em ${formatInt(exterior.linhas)} itens — poucos itens, muito valor.`
                      : 'Todo o gasto do recorte é de fornecedor nacional.'
                  }
                  top={8}
                  larguraRotulo={120}
                  cor="var(--series-2)"
                />
              </div>
              <DistribuicaoBarras
                fatias={cidades}
                title="Gasto por Cidade (UF / Cidade)"
                icon={MapPin}
                description={`${formatInt(resumo.cidades)} localidades no filtro (Nível 1 Estado / Nível 2 Cidade).`}
                top={12}
                larguraRotulo={220}
                cor="var(--series-3)"
                height={360}
                onSelecionar={c => patch({ cidade: c })}
              />
              <MatrizCalor
                matriz={matriz}
                title="Grupo de Mercadoria × Região"
                rotuloLinha="Grupo"
                rotuloColuna="Região"
                description="Onde cada categoria é comprada. Um grupo relevante concentrado numa praça só é risco logístico que os rankings isolados não mostram."
              />
            </div>
          )}

          {sub === 'categorias' && (
            <div className="space-y-6">
              <CurvaAbcGrupos fatias={gruposAbc} onSelecionar={g => patch({ grupo: g })} />
              <RiscoFonteUnica riscos={riscos} onSelecionarGrupo={g => patch({ grupo: g })} />
              <DistribuicaoBarras
                fatias={ramos.map(r => ({ ...r, chave: RAMO_LABEL[r.chave] ?? r.chave }))}
                title="Gasto por Família de Grupo"
                icon={Layers}
                description="Primeiro caractere do código SAP: a leitura de topo que a lista de grupos não dá."
                top={6}
                larguraRotulo={140}
                cor="var(--series-2)"
                height={220}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
