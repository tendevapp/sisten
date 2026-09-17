import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Columns,
  Eye,
  Filter,
  Flame,
  LayoutGrid,
  ListChecks,
  ListOrdered,
  RefreshCw,
  Search,
  Sparkles,
  Truck,
} from 'lucide-react';
import {
  CONFIG_CATEGORIAS,
  ORDEM_TRAMOS_VISUAL,
  agruparTramosPorTorre,
  avaliarCriticidadeEspera,
  calcularIndicadoresDecisao,
  type CategoriaEtapa,
  type TorreEntregaAgrupada,
  type TramoEntrega,
  type TramoId,
} from '../../lib/producaoEntrega';
import ModalDetalheTramoEntrega from './ModalDetalheTramoEntrega';
import VisaoExpedicaoChecklist from './VisaoExpedicaoChecklist';

interface TorresEntregaVisualProps {
  tramos: TramoEntrega[];
  aoAtualizarTramo?: (tramo: TramoEntrega) => void;
  recarregar?: () => void;
}

export default function TorresEntregaVisual({
  tramos,
  aoAtualizarTramo,
  recarregar,
}: TorresEntregaVisualProps) {
  const [subprojetoFiltro, setSubprojetoFiltro] = useState<string>('todos');
  const [somenteGargalos, setSomenteGargalos] = useState(false);
  const [buscaTorre, setBuscaTorre] = useState('');
  const [modoExibicao, setModoExibicao] = useState<'cilindros' | 'gargalos' | 'expedicao'>('cilindros');

  const [tramoSelecionado, setTramoSelecionado] = useState<TramoEntrega | null>(null);
  const [torreSelecionada, setTorreSelecionada] = useState<TorreEntregaAgrupada | null>(null);

  // Agrupamento de torres
  const todasTorres = useMemo(() => agruparTramosPorTorre(tramos), [tramos]);

  // Indicadores consolidados
  const indicadores = useMemo(
    () => calcularIndicadoresDecisao(tramos, todasTorres),
    [tramos, todasTorres],
  );

  // Torres filtradas
  const torresFiltradas = useMemo(() => {
    return todasTorres.filter(t => {
      if (subprojetoFiltro !== 'todos' && t.subprojeto_id !== subprojetoFiltro) {
        return false;
      }
      if (somenteGargalos && t.maior_tempo_espera < 3) {
        return false;
      }
      if (buscaTorre.trim()) {
        const termo = buscaTorre.trim().toLowerCase();
        const bateuTorre = `torre ${t.torre_numero}`.includes(termo) || `${t.torre_numero}` === termo;
        const bateuSerie = Object.values(t.tramos).some(tr => tr && `${tr.serie}`.includes(termo));
        if (!bateuTorre && !bateuSerie) return false;
      }
      return true;
    });
  }, [todasTorres, subprojetoFiltro, somenteGargalos, buscaTorre]);

  const handleAbrirDetalhe = (tramo: TramoEntrega, torre: TorreEntregaAgrupada) => {
    setTramoSelecionado(tramo);
    setTorreSelecionada(torre);
  };

  const handleSalvarTramo = (atualizado: TramoEntrega) => {
    if (aoAtualizarTramo) {
      aoAtualizarTramo(atualizado);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Painel de Decisão & KPIs de Prontidão */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Painel de Decisão de Entrega & Montagem
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Prontidão de conjunto das torres e balanceamento de gargalos para despacho ao parque.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setModoExibicao('cilindros')}
              className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
                modoExibicao === 'cilindros'
                  ? 'border-blue-600 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-950/40 dark:text-blue-300'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300'
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              Visão Torres (Cilindros)
            </button>
            <button
              type="button"
              onClick={() => setModoExibicao('gargalos')}
              className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
                modoExibicao === 'gargalos'
                  ? 'border-amber-600 bg-amber-50 text-amber-700 dark:border-amber-500 dark:bg-amber-950/40 dark:text-amber-300'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300'
              }`}
            >
              <ListOrdered className="h-3.5 w-3.5" />
              Tabela de Gargalos ({indicadores.tramosCriticos.length})
            </button>
            <button
              type="button"
              onClick={() => setModoExibicao('expedicao')}
              className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
                modoExibicao === 'expedicao'
                  ? 'border-blue-600 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-950/40 dark:text-blue-300'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300'
              }`}
            >
              <ListChecks className="h-3.5 w-3.5" />
              Visão Expedição
            </button>
            {recarregar && (
              <button
                type="button"
                onClick={recarregar}
                title="Recarregar dados"
                className="rounded-xl border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Grade de Indicadores Executivos */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {/* Card 1: Torres 100% Expedidas */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Torres 100% Expedidas
              </span>
              <Truck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900 dark:text-slate-50">
                {indicadores.torresExpedidas}
              </span>
              <span className="text-xs text-slate-500">
                de {indicadores.totalTorres} torres
              </span>
            </div>
            <p className="mt-1 text-[11px] text-emerald-600 dark:text-emerald-400">
              5/5 tramos no parque eólico
            </p>
          </div>

          {/* Card 2: Foco Imediato - Torres com Falta de 1 Tramo */}
          <div className="relative overflow-hidden rounded-2xl border border-amber-300 bg-amber-50/50 p-4 shadow-sm dark:border-amber-900/60 dark:bg-amber-950/20">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300">
                Foco Imediato (Quick Win)
              </span>
              <Sparkles className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-amber-700 dark:text-amber-200">
                {indicadores.torresQuaseProntas}
              </span>
              <span className="text-xs font-semibold text-amber-800 dark:text-amber-300">
                torres (4/5 prontos)
              </span>
            </div>
            <p className="mt-1 text-[11px] text-amber-800 dark:text-amber-300">
              Desbloqueie 1 tramo para liberar o conjunto!
            </p>
          </div>

          {/* Card 3: Tramos em Pátio de Estocagem */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Tramos no Pátio
              </span>
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                {indicadores.contagemCategorias.patio}
              </span>
              <span className="text-xs text-slate-500">
                tramos liberados
              </span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              Prontos para carregamento e expedição
            </p>
          </div>

          {/* Card 4: Gargalos em Fila Crítica (> 4 dias) */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Tramos em Espera Crítica
              </span>
              <Clock className="h-4 w-4 text-rose-600 dark:text-rose-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-rose-600 dark:text-rose-400">
                {indicadores.tramosCriticos.length}
              </span>
              <span className="text-xs text-slate-500">
                tramos (&gt; 4 dias)
              </span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              Média WIP: <strong>{indicadores.mediaDiasEsperaWip} dias</strong> na etapa
            </p>
          </div>
        </div>
      </section>

      {/* 2. Barra de Filtros Rápidos */}
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center gap-2">
          {/* Filtro de Subprojeto */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-slate-500">Subprojeto:</span>
            <select
              value={subprojetoFiltro}
              onChange={e => setSubprojetoFiltro(e.target.value)}
              className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-bold text-slate-800 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="todos">Todos os Subprojetos</option>
              <option value="SP01">SP01 (Torres 1 a 23)</option>
              <option value="SP02">SP02 (Torres 24 a 39)</option>
              <option value="SP03">SP03 (Torres 40 a 69)</option>
            </select>
          </div>

          {/* Toggle de Apenas Gargalos */}
          <button
            type="button"
            onClick={() => setSomenteGargalos(!somenteGargalos)}
            className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition ${
              somenteGargalos
                ? 'border-rose-400 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200'
                : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300'
            }`}
          >
            <Clock className="h-3.5 w-3.5" />
            Somente Gargalos (&ge; 3 dias)
          </button>
        </div>

        {/* Busca Rápida por Torre ou Série */}
        <div className="relative min-w-[220px]">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            value={buscaTorre}
            onChange={e => setBuscaTorre(e.target.value)}
            placeholder="Buscar Torre (ex: 2) ou Série..."
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-3 text-xs text-slate-800 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
        </div>
      </section>

      {/* 3. Visão Principal: Cilindros das Torres (Identidade do Chão de Fábrica) */}
      {modoExibicao === 'cilindros' && (
        <section className="space-y-4">
          <div className="overflow-x-auto pb-4">
            <div className="flex min-w-max items-end gap-3 px-2 py-4">
              {torresFiltradas.map(torre => {
                const is100Expedida = torre.status_conjunto === 'completa_expedida';
                const isQuasePronta = torre.status_conjunto === 'quase_pronta';

                return (
                  <div
                    key={torre.torre_numero}
                    className={`flex flex-col items-center transition-all ${
                      isQuasePronta
                        ? 'ring-2 ring-amber-400 ring-offset-2 dark:ring-amber-500/60 dark:ring-offset-slate-900 rounded-2xl'
                        : ''
                    }`}
                    style={{ width: '138px' }}
                  >
                    {/* Tag / Ficha da Torre (Superior) */}
                    <div className="mb-2 w-full rounded-t-xl border border-slate-300 bg-slate-100 p-2 text-center shadow-sm dark:border-slate-700 dark:bg-slate-800">
                      <p className="text-[10px] font-semibold tracking-tight text-slate-500 dark:text-slate-400">
                        {torre.modelo}
                      </p>
                      <div className="flex items-center justify-center gap-1">
                        <strong className="text-xs font-black uppercase text-slate-800 dark:text-slate-100">
                          TORRE {torre.torre_numero}
                        </strong>
                        {is100Expedida && (
                          <span
                            title="Torre 100% Expedida"
                            className="inline-flex h-2 w-2 rounded-full bg-emerald-500"
                          />
                        )}
                        {isQuasePronta && (
                          <span
                            title="Falta apenas 1 tramo!"
                            className="inline-flex h-2 w-2 animate-ping rounded-full bg-amber-500"
                          />
                        )}
                      </div>
                      <div className="mt-1 flex items-center justify-center gap-1">
                        <span
                          className={`rounded px-1.5 py-0.2 text-[9px] font-bold ${
                            is100Expedida
                              ? 'bg-zinc-800 text-white dark:bg-black'
                              : isQuasePronta
                              ? 'bg-amber-200 text-amber-900 dark:bg-amber-900/60 dark:text-amber-200'
                              : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200'
                          }`}
                        >
                          {torre.tramos_prontos}/5 prontos
                        </span>
                      </div>
                    </div>

                    {/* Cilindro Vertical da Torre (Top Cap arredondado 3D + 5 Seções) */}
                    <div className="relative w-full overflow-hidden rounded-t-[28px] rounded-b-lg border-2 border-slate-700 bg-slate-900 shadow-xl dark:border-slate-600">
                      {/* Topo arredondado / Calota 3D */}
                      <div
                        className="h-3.5 w-full border-b border-black/30"
                        style={{
                          background:
                            torre.tramos.T5
                              ? CONFIG_CATEGORIAS[torre.tramos.T5.etapa_categoria]?.gradienteCilindro
                              : 'linear-gradient(90deg, #334155 0%, #64748b 45%, #1e293b 100%)',
                          borderTopLeftRadius: '26px',
                          borderTopRightRadius: '26px',
                        }}
                      />

                      {/* Seções dos 5 Tramos (T5 Topo -> T1 Base) */}
                      {ORDEM_TRAMOS_VISUAL.map(tramoId => {
                        const tramo = torre.tramos[tramoId];
                        const categoria = tramo?.etapa_categoria || 'saw02';
                        const confCat = CONFIG_CATEGORIAS[categoria];
                        const criticidade = avaliarCriticidadeEspera(tramo?.dias_espera || 0);

                        return (
                          <div
                            key={tramoId}
                            onClick={() => tramo && handleAbrirDetalhe(tramo, torre)}
                            className="group relative cursor-pointer border-b border-black/20 p-2.5 text-center transition-all hover:brightness-110 active:scale-[0.98]"
                            style={{
                              background: confCat.gradienteCilindro,
                              color: confCat.textoClasse.includes('text-white') ? '#ffffff' : '#000000',
                              minHeight: '86px',
                            }}
                          >
                            {/* Reflexo de Costura Metálica Central */}
                            <div className="pointer-events-none absolute inset-y-0 left-1/3 w-8 bg-gradient-to-r from-white/0 via-white/15 to-white/0" />

                            {/* Linha 1: Tramo e Série Física */}
                            <div className="flex items-center justify-center gap-1 font-black text-xs tracking-tight">
                              <span>{tramoId}</span>
                              <span>{tramo?.serie || '—'}</span>
                            </div>

                            {/* Linha 2: Nome da Etapa / Status */}
                            <div className="mt-1 text-[11px] font-extrabold uppercase leading-tight tracking-tight">
                              {tramo?.etapa_nome || '—'}
                            </div>

                            {/* Linha 3: Tempo de Espera (Aging) */}
                            {tramo && tramo.etapa_categoria !== 'expedido' ? (
                              <div className="mt-1.5 flex items-center justify-center">
                                <span
                                  className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[9px] font-bold shadow-sm ${
                                    criticidade.nivel === 'critico'
                                      ? 'bg-rose-900 text-rose-100 ring-1 ring-rose-400'
                                      : criticidade.nivel === 'atencao'
                                      ? 'bg-amber-900 text-amber-100 ring-1 ring-amber-300'
                                      : 'bg-black/40 text-white/90'
                                  }`}
                                >
                                  <Clock className="h-2.5 w-2.5" />
                                  {tramo.dias_espera}d espera
                                </span>
                              </div>
                            ) : (
                              <div className="mt-1.5 text-[9px] font-bold opacity-80">
                                ✓ Expedido
                              </div>
                            )}

                            {/* Tooltip rápida em hover */}
                            {tramo?.status_aguardando && (
                              <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden -translate-x-1/2 rounded-lg bg-slate-900/95 px-2.5 py-1.5 text-[10px] text-white shadow-xl backdrop-blur group-hover:block whitespace-nowrap">
                                <strong>Pendência:</strong> {tramo.status_aguardando}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Rodapé Oficial da Fábrica com a Legenda Completa & Contadores */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center justify-between gap-4">
              {/* Contadores cromáticos idênticos ao rodapé da imagem */}
              <div className="flex flex-wrap items-center gap-3">
                {/* 9 Expedido */}
                <div className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-white shadow-sm dark:border-zinc-700">
                  <span className="h-3 w-3 rounded-full bg-white" />
                  <strong className="text-sm font-black">{indicadores.contagemCategorias.expedido}</strong>
                  <span className="text-xs font-semibold">Expedido</span>
                </div>

                {/* 7 Pátio */}
                <div className="flex items-center gap-2 rounded-xl border border-emerald-600 bg-[#86efac] px-3 py-1.5 text-[#14532d] shadow-sm">
                  <span className="h-3 w-3 rounded-full bg-[#16a34a]" />
                  <strong className="text-sm font-black">{indicadores.contagemCategorias.patio}</strong>
                  <span className="text-xs font-semibold">Pátio</span>
                </div>

                {/* 31 White */}
                <div className="flex items-center gap-2 rounded-xl border border-amber-500 bg-[#facc15] px-3 py-1.5 text-[#713f12] shadow-sm">
                  <span className="h-3 w-3 rounded-full bg-[#ca8a04]" />
                  <strong className="text-sm font-black">{indicadores.contagemCategorias.white}</strong>
                  <span className="text-xs font-semibold">White</span>
                </div>

                {/* 13-14 Internos */}
                <div className="flex items-center gap-2 rounded-xl border border-orange-600 bg-[#f97316] px-3 py-1.5 text-white shadow-sm">
                  <span className="h-3 w-3 rounded-full bg-white" />
                  <strong className="text-sm font-black">{indicadores.contagemCategorias.internos}</strong>
                  <span className="text-xs font-semibold">Internos</span>
                </div>

                {/* Saw03 */}
                <div className="flex items-center gap-2 rounded-xl border border-sky-500 bg-[#38bdf8] px-3 py-1.5 text-[#082f49] shadow-sm">
                  <span className="h-3 w-3 rounded-full bg-[#0284c7]" />
                  <strong className="text-sm font-black">{indicadores.contagemCategorias.saw03}</strong>
                  <span className="text-xs font-semibold">Saw03</span>
                </div>

                {/* Saw02 */}
                <div className="flex items-center gap-2 rounded-xl border border-slate-400 bg-[#b9c6e2] px-3 py-1.5 text-[#1e293b] shadow-sm">
                  <span className="h-3 w-3 rounded-full bg-[#64748b]" />
                  <strong className="text-sm font-black">{indicadores.contagemCategorias.saw02}</strong>
                  <span className="text-xs font-semibold">Saw02</span>
                </div>

                {/* Nav01 */}
                <div className="flex items-center gap-2 rounded-xl border border-orange-400 bg-[#fdba74] px-3 py-1.5 text-[#7c2d12] shadow-sm">
                  <span className="h-3 w-3 rounded-full bg-[#ea580c]" />
                  <strong className="text-sm font-black">{indicadores.contagemCategorias.nav01}</strong>
                  <span className="text-xs font-semibold">Nav01</span>
                </div>
              </div>

              {/* Logo e Nota Técnica */}
              <div className="text-right">
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-800 dark:bg-slate-800 dark:text-slate-200">
                  TEN <span className="text-[10px] font-normal text-slate-500">TORRES EÓLICAS DO NORDESTE</span>
                </span>
              </div>
            </div>

            {/* Nota de Rodapé Explicativa Oficial */}
            <div className="mt-3 border-t border-slate-100 pt-3 text-[11px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
              <strong>*Internos</strong> = Última fase de fabricação antes do processo de tratamento de superfície (jato e pintura).
            </div>
          </div>
        </section>
      )}

      {/* 4. Visão Lista de Gargalos (Focada em Tomada de Decisão do PCP e Chão de Fábrica) */}
      {modoExibicao === 'gargalos' && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Ranking de Gargalos por Tempo de Espera
              </h3>
              <p className="text-xs text-slate-500">
                Tramos com maior tempo de permanência parada, bloqueando avanço de torres.
              </p>
            </div>
            <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-bold text-rose-800 dark:bg-rose-950/60 dark:text-rose-200">
              {indicadores.tramosCriticos.length} tramos críticos (&ge; 4 dias)
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800">
                  <th className="py-2.5 pr-3 font-semibold">Torre · Tramo</th>
                  <th className="py-2.5 pr-3 font-semibold">Série</th>
                  <th className="py-2.5 pr-3 font-semibold">Processo</th>
                  <th className="py-2.5 pr-3 font-semibold">Estágio</th>
                  <th className="py-2.5 pr-3 font-semibold">Tempo de Espera</th>
                  <th className="py-2.5 pr-3 font-semibold">O que está aguardando</th>
                  <th className="py-2.5 text-right font-semibold">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {indicadores.tramosCriticos.map(t => {
                  const conf = CONFIG_CATEGORIAS[t.etapa_categoria];
                  const criticidade = avaliarCriticidadeEspera(t.dias_espera);
                  const torrePai = todasTorres.find(tor => tor.torre_numero === t.torre_numero);

                  return (
                    <tr key={t.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-850">
                      <td className="py-3 pr-3 font-bold text-slate-900 dark:text-slate-100">
                        Torre {t.torre_numero} · {t.tramo}
                        {torrePai?.status_conjunto === 'quase_pronta' && (
                          <span className="ml-2 inline-flex items-center rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                            ⭐ Destrava Torre!
                          </span>
                        )}
                      </td>
                      <td className="py-3 pr-3 font-mono font-semibold text-slate-600 dark:text-slate-400">
                        {t.serie}
                      </td>
                      <td className="py-3 pr-3">
                        <span
                          className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-bold"
                          style={{
                            backgroundColor: conf.hexPrimario,
                            color: conf.textoClasse.includes('text-white') ? '#fff' : '#000',
                          }}
                        >
                          {conf.rotulo}
                        </span>
                      </td>
                      <td className="py-3 pr-3 font-bold text-slate-800 dark:text-slate-200">
                        {t.etapa_nome}
                      </td>
                      <td className="py-3 pr-3">
                        <span
                          className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-bold ${criticidade.badgeClasse}`}
                        >
                          <Clock className="h-3 w-3" />
                          {criticidade.texto}
                        </span>
                      </td>
                      <td className="py-3 pr-3 text-slate-600 dark:text-slate-400">
                        {t.status_aguardando || '—'}
                      </td>
                      <td className="py-3 text-right">
                        <button
                          type="button"
                          onClick={() => torrePai && handleAbrirDetalhe(t, torrePai)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1 font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                        >
                          <Eye className="h-3 w-3" />
                          Gerenciar
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* 5. Visão Expedição — Checklist de Liberação por Tramo (White → Expedido) */}
      {modoExibicao === 'expedicao' && <VisaoExpedicaoChecklist torres={torresFiltradas} />}

      {/* 6. Modal de Detalhe e Tomada de Decisão */}
      {tramoSelecionado && (
        <ModalDetalheTramoEntrega
          tramo={tramoSelecionado}
          torre={torreSelecionada}
          aoFechar={() => {
            setTramoSelecionado(null);
            setTorreSelecionada(null);
          }}
          aoSalvar={handleSalvarTramo}
        />
      )}
    </div>
  );
}
