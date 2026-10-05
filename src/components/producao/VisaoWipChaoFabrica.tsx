import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Maximize2, RefreshCw, X } from 'lucide-react';
import { listarOperacoesComTramo } from '../../lib/producaoTorresApi';
import { ORDEM_TRAMOS_VISUAL, type TramoEntrega, type TramoId } from '../../lib/producaoEntrega';
import {
  ORDEM_ZONAS_WIP,
  ZONAS_WIP,
  distribuirWip,
  ultimaOperacaoPorTramo,
  type DistribuicaoWip,
  type ItemWip,
  type OperacaoTramo,
  type ZonaWipId,
} from '../../lib/producaoWip';
import {
  ESCALA_MINIMA,
  FOLGA_CQW,
  PILULA_ALTURA_CQW,
  PILULA_LARGURA_CQW,
  PLANTA_ALTURA,
  PLANTA_LARGURA,
  RETANGULO_ZONA,
  TOPO_AREA_PILULAS,
  escalaPilulas,
} from '../../lib/producaoWipLayout';

interface VisaoWipChaoFabricaProps {
  /** Tramos já filtrados (subprojeto, busca, gargalos) pela Visão Torres. */
  tramos: TramoEntrega[];
  /** Todos os tramos do Controle de Entrega, para apontar códigos sem cadastro. */
  todosTramos: TramoEntrega[];
  aoAbrirTramo: (tramo: TramoEntrega) => void;
}

const COR_PILULA = {
  normal: 'border-slate-900 text-slate-900',
  atencao: 'border-amber-600 text-amber-700',
  critico: 'border-red-600 text-red-600',
} as const;

function textoTooltip(item: ItemWip): string {
  const { tramo } = item;
  const origem =
    item.origem === 'apontamento' ? 'posição pelo último apontamento' : 'posição pelo Controle de Entrega';
  return `Torre ${tramo.torre_numero} · ${tramo.tramo} · Série ${tramo.serie}\n${tramo.etapa_nome}\n${item.dias}d na etapa · ${origem}`;
}

/**
 * Medidas em `cqw` (1% da largura do mapa) vezes `--k`, a escala que a zona
 * calculou para todos os seus tramos caberem: a pílula encolhe com o mapa e
 * com a quantidade de tramos, sem rolagem.
 */
function PilulaTramo({ item, aoClicar }: { item: ItemWip; aoClicar: () => void }) {
  return (
    <button
      type="button"
      onClick={aoClicar}
      title={textoTooltip(item)}
      className={`relative flex items-center justify-center rounded-full bg-white shadow-sm transition hover:scale-110 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${COR_PILULA[item.nivel]}`}
      style={{
        height: `calc(var(--k) * ${PILULA_ALTURA_CQW}cqw)`,
        width: `calc(var(--k) * ${PILULA_LARGURA_CQW}cqw)`,
        paddingLeft: 'calc(var(--k) * 0.9cqw)',
        borderStyle: 'solid',
        borderWidth: 'max(1px, calc(var(--k) * 0.14cqw))',
      }}
    >
      <span
        aria-hidden="true"
        className="absolute top-1/2 -translate-y-1/2 rounded-[50%] border border-current opacity-70"
        style={{ left: 'calc(var(--k) * 0.35cqw)', height: '58%', width: 'calc(var(--k) * 0.6cqw)' }}
      />
      <span className="flex flex-col items-center leading-none">
        <span className="font-black" style={{ fontSize: 'max(5px, calc(var(--k) * 0.95cqw))' }}>
          {item.tramo.tramo}
        </span>
        <span className="font-semibold opacity-80" style={{ fontSize: 'max(3px, calc(var(--k) * 0.62cqw))' }}>
          Torre {item.tramo.torre_numero}
        </span>
      </span>
    </button>
  );
}

function ZonaSobrePlanta({
  zona,
  itens,
  aoAbrirTramo,
}: {
  zona: ZonaWipId;
  itens: ItemWip[];
  aoAbrirTramo: (tramo: TramoEntrega) => void;
}) {
  const [x1, y1, x2, y2] = RETANGULO_ZONA[zona];
  const config = ZONAS_WIP[zona];
  const criticos = itens.filter(i => i.nivel === 'critico').length;
  const escala = escalaPilulas(zona, itens.length);

  return (
    <div
      className="absolute"
      title={`${config.rotulo} — ${config.descricao}`}
      style={
        {
          left: `${(x1 / PLANTA_LARGURA) * 100}%`,
          top: `${(y1 / PLANTA_ALTURA) * 100}%`,
          width: `${((x2 - x1) / PLANTA_LARGURA) * 100}%`,
          height: `${((y2 - y1) / PLANTA_ALTURA) * 100}%`,
          '--k': escala,
        } as React.CSSProperties
      }
    >
      {/* O nome da zona já vem impresso na planta; aqui só a contagem, no canto. */}
      <span
        className={`absolute z-10 rounded-full font-black shadow ${
          criticos > 0 ? 'bg-red-600 text-white' : 'bg-slate-900 text-white'
        }`}
        style={{
          left: `${FOLGA_CQW}cqw`,
          top: `${FOLGA_CQW}cqw`,
          fontSize: 'max(7px, 0.9cqw)',
          padding: '0.15cqw 0.6cqw',
        }}
        title={criticos > 0 ? `${criticos} tramo(s) parado(s) há 5 dias ou mais` : undefined}
      >
        {itens.length}
      </span>
      {/* Pílulas começam abaixo do nome impresso na planta. */}
      <div
        className={`absolute flex flex-wrap content-start ${escala <= ESCALA_MINIMA ? 'overflow-y-auto' : ''}`}
        style={{
          left: `${FOLGA_CQW}cqw`,
          right: `${FOLGA_CQW}cqw`,
          bottom: `${FOLGA_CQW}cqw`,
          top: `${TOPO_AREA_PILULAS * 100}%`,
          gap: `${FOLGA_CQW}cqw`,
        }}
      >
        {itens.map(item => (
          <PilulaTramo key={item.tramo.id} item={item} aoClicar={() => aoAbrirTramo(item.tramo)} />
        ))}
      </div>
    </div>
  );
}

function MapaPlanta({
  wip,
  aoAbrirTramo,
  style,
}: {
  wip: DistribuicaoWip;
  aoAbrirTramo: (tramo: TramoEntrega) => void;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className="relative shrink-0 bg-white"
      style={{ aspectRatio: `${PLANTA_LARGURA} / ${PLANTA_ALTURA}`, containerType: 'inline-size', ...style }}
    >
      <img
        src="/planta-fabrica-wip.png"
        alt="Planta baixa da fábrica dividida em zonas de produção"
        className="absolute inset-0 h-full w-full select-none"
        draggable={false}
      />
      {ORDEM_ZONAS_WIP.map(zona => (
        <ZonaSobrePlanta key={zona} zona={zona} itens={wip.porZona[zona]} aoAbrirTramo={aoAbrirTramo} />
      ))}
    </div>
  );
}

export default function VisaoWipChaoFabrica({ tramos, todosTramos, aoAbrirTramo }: VisaoWipChaoFabricaProps) {
  const [operacoes, setOperacoes] = useState<OperacaoTramo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [tiposSelecionados, setTiposSelecionados] = useState<TramoId[]>([]);
  const [expandido, setExpandido] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      setOperacoes(await listarOperacoesComTramo());
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // Janela expandida: Esc fecha e a página de trás não rola.
  useEffect(() => {
    if (!expandido) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpandido(false);
    };
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', aoTeclar);
    return () => {
      window.removeEventListener('keydown', aoTeclar);
      document.body.style.overflow = overflowAnterior;
    };
  }, [expandido]);

  const ultimas = useMemo(() => ultimaOperacaoPorTramo(operacoes), [operacoes]);

  // Contagem por tipo sempre sobre o WIP completo, para o botão mostrar quanto há de cada um.
  const wipCompleto = useMemo(() => distribuirWip(tramos, ultimas), [tramos, ultimas]);
  const contagemPorTipo = useMemo(() => {
    const contagem: Record<TramoId, number> = { T1: 0, T2: 0, T3: 0, T4: 0, T5: 0 };
    for (const zona of ORDEM_ZONAS_WIP) {
      for (const item of wipCompleto.porZona[zona]) contagem[item.tramo.tramo]++;
    }
    return contagem;
  }, [wipCompleto]);

  // Sem nenhum tipo marcado, mostra todos.
  const tramosVisiveis = useMemo(
    () => (tiposSelecionados.length === 0 ? tramos : tramos.filter(t => tiposSelecionados.includes(t.tramo))),
    [tramos, tiposSelecionados],
  );
  const wip = useMemo(() => distribuirWip(tramosVisiveis, ultimas), [tramosVisiveis, ultimas]);

  const alternarTipo = (tipo: TramoId) =>
    setTiposSelecionados(atual => (atual.includes(tipo) ? atual.filter(t => t !== tipo) : [...atual, tipo]));

  const semCadastro = useMemo(() => {
    const cadastrados = new Set(todosTramos.map(t => t.id));
    return [...ultimas.keys()].filter(codigo => !cadastrados.has(codigo));
  }, [todosTramos, ultimas]);

  const resumo = (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="rounded-full bg-slate-900 px-3 py-1 font-bold text-white dark:bg-slate-100 dark:text-slate-900">
        {wip.total} em processo
      </span>
      {wip.criticos > 0 && (
        <span className="rounded-full bg-red-600 px-3 py-1 font-bold text-white">
          {wip.criticos} parado{wip.criticos > 1 ? 's' : ''} há 5d+
        </span>
      )}
      <button
        type="button"
        onClick={() => void carregar()}
        disabled={carregando}
        title="Atualizar apontamentos"
        className="rounded-xl border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400"
      >
        {carregando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
      </button>
    </div>
  );

  const filtroTipos = (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-semibold text-slate-500">Tipo de tramo:</span>
      {ORDEM_TRAMOS_VISUAL.slice()
        .reverse()
        .map(tipo => {
          const ativo = tiposSelecionados.includes(tipo);
          return (
            <button
              key={tipo}
              type="button"
              aria-pressed={ativo}
              onClick={() => alternarTipo(tipo)}
              className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition ${
                ativo
                  ? 'border-blue-600 bg-blue-600 text-white'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300'
              }`}
            >
              {tipo}
              <span
                className={`rounded-full px-1.5 text-[10px] ${
                  ativo ? 'bg-white/25 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                }`}
              >
                {contagemPorTipo[tipo]}
              </span>
            </button>
          );
        })}
      {tiposSelecionados.length > 0 && (
        <button
          type="button"
          onClick={() => setTiposSelecionados([])}
          className="rounded-xl px-2 py-1.5 text-xs font-semibold text-blue-700 hover:underline dark:text-blue-300"
        >
          Mostrar todos
        </button>
      )}
    </div>
  );

  const legenda = (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-[11px] text-slate-500 dark:text-slate-400">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-5 rounded-full border-2 border-slate-900 bg-white" /> na etapa há menos de 3 dias
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-5 rounded-full border-2 border-amber-600 bg-white" /> 3 a 4 dias
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-5 rounded-full border-2 border-red-600 bg-white" /> 5 dias ou mais
        </span>
      </div>
      <span>
        Fora do WIP: {wip.fora.pendente} pendente{wip.fora.pendente === 1 ? '' : 's'} · {wip.fora.patio} no pátio ·{' '}
        {wip.fora.expedido} expedido{wip.fora.expedido === 1 ? '' : 's'}
      </span>
    </div>
  );

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">WIP no Chão de Fábrica</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Quantos tramos há em cada etapa agora. Toque num tramo para ver o detalhe.
          </p>
        </div>
        {resumo}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {filtroTipos}
        <button
          type="button"
          onClick={() => setExpandido(true)}
          title="Abrir o mapa numa janela maior, para ver os tramos em tamanho maior"
          className="ml-auto inline-flex items-center gap-1.5 rounded-xl border border-blue-600 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700 transition hover:bg-blue-100 dark:border-blue-500 dark:bg-blue-950/40 dark:text-blue-300"
        >
          <Maximize2 className="h-3.5 w-3.5" />
          Expandir mapa
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800">
        <MapaPlanta wip={wip} aoAbrirTramo={aoAbrirTramo} style={{ width: '100%' }} />
      </div>

      {legenda}

      <p className="text-[11px] text-slate-500 dark:text-slate-400">
        A posição vem do último apontamento do tramo; sem apontamento, vale a etapa do Controle de Entrega. Tramo
        expedido ou no pátio sai do WIP.
        {semCadastro.length > 0 && (
          <>
            {' '}
            <strong className="text-amber-700 dark:text-amber-400">
              {semCadastro.length} código{semCadastro.length > 1 ? 's' : ''} apontado{semCadastro.length > 1 ? 's' : ''}{' '}
              sem cadastro no Controle de Entrega ({semCadastro.slice(0, 5).join(', ')}
              {semCadastro.length > 5 ? '…' : ''}) não aparece{semCadastro.length > 1 ? 'm' : ''} aqui.
            </strong>
          </>
        )}
      </p>

      {expandido && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/70 p-3 backdrop-blur-sm"
          onClick={() => setExpandido(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Mapa WIP expandido"
        >
          <div
            className="mx-auto flex h-full w-full flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl dark:border-slate-700 dark:bg-slate-900"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">WIP no Chão de Fábrica</h3>
              <div className="flex flex-wrap items-center gap-3">
                {filtroTipos}
                {resumo}
                <button
                  type="button"
                  onClick={() => setExpandido(false)}
                  title="Fechar (Esc)"
                  className="rounded-xl border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Área do mapa: o mapa ocupa o maior tamanho que cabe em largura e altura. */}
            <div className="flex min-h-0 flex-1 items-center justify-center" style={{ containerType: 'size' }}>
              <MapaPlanta
                wip={wip}
                aoAbrirTramo={aoAbrirTramo}
                style={{ width: `min(100cqw, calc(100cqh * ${PLANTA_LARGURA} / ${PLANTA_ALTURA}))` }}
              />
            </div>

            {legenda}
          </div>
        </div>
      )}
    </section>
  );
}
