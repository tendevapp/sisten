/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Financeiro > Faturamento GW Jacobina — painel de parede (TV).
 *
 * Desenhado para leitura a 3-5 metros, sem ninguém para clicar: nada depende
 * de hover e todo número tem rótulo direto.
 *
 * A célula da matriz torre × tramo é toda preenchimento, nunca borda:
 *   - expedido = verde — venceu o funil, a restrição deixa de ser a pergunta
 *     relevante nesse ponto (ela segue visível para "faturado" e na coluna
 *     Restrição da tabela/log);
 *   - faturado, ainda não expedido = azul sem restrição, laranja com;
 *   - conteúdo = o seq do tramo, em pé (`vertical-rl` + `text-orientation:
 *     upright`), grande o bastante para ler a 3-5m — a coluna é estreita
 *     (18 a 69 torres na mesma largura de painel) e o número deitado não
 *     caberia sem alargar.
 * Tramo pendente fica com a célula vazia (cinza, sem número): o pedido era
 * "que número já foi faturado e expedido", não listar os 90 tramos.
 *
 * O par azul/laranja passa no `validate_palette.js` até em protanopia
 * (ΔE 27), que atinge perto de 8% dos homens — não precisou de reforço. Ao
 * mexer em qualquer cor daqui, rode o validador de novo.
 *
 * O que este painel responde e o BI original não respondia: **onde o projeto
 * travou**. A matriz torre × tramo mostra numa olhada que as primeiras torres
 * andaram e as demais estão intocadas; três barras de "tramos por projeto" com
 * um projeto só não contam essa história.
 *
 * Escala: um ResizeObserver mede a altura do container e publica `--wb`
 * (1 unidade = 1% da altura). Todo tamanho é múltiplo dessa unidade, então o
 * mesmo componente serve emoldurado na página e em tela cheia numa TV 4K, sem
 * media query e sem depender de unidade de container query (TV velha não tem).
 *
 * Tema: segue o tema do app, porque as cores saem dos tokens validados em
 * `styles/tokens.css`. Para a TV, deixe o app no tema escuro.
 */

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Maximize2, Minimize2, RefreshCw, Radio } from 'lucide-react';
import type { FinFatGwjaco } from '../../types';
import {
  resumoFaturamento, matrizTorreTramo, faturadosPorSemana, faturadosPorMes, faturadosPorTramo,
  ultimasNotas, semanaISO, rotuloMes, semanaDaLinha, type EstadoTramo, type CelulaMatriz,
  type PontoMes, type PontoSemana,
} from '../../lib/finFaturamentoRelatorio';
import FinFaturamentoDetalhesModal, { type DetalheModalTipo } from '../../components/financeiro/FinFaturamentoDetalhesModal';

interface Props {
  linhas: FinFatGwjaco[];
  onAtualizar: () => void | Promise<void>;
  carregando?: boolean;
  onEditarLinha?: (linha: FinFatGwjaco) => void;
}

/** N unidades de escala do painel. 1 unidade = 1% da altura do container. */
const u = (n: number) => `calc(var(--wb) * ${n})`;

/**
 * Azul de "faturado". É o `--series-1` do projeto.
 */
const FATURADO_CSS = 'var(--series-1)';


const ESTADO_ROTULO: Record<EstadoTramo, string> = {
  expedido: 'Expedido',
  faturado: 'Faturado',
  pendente: 'Pendente',
};

function fmtDataBR(iso?: string | null): string {
  if (!iso) return '-';
  const [ano, mes, dia] = iso.slice(0, 10).split('-');
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : iso;
}

function fmtHora(d: Date): string {
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function fmtDataHora(d: Date): string {
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/* ------------------------------------------------------------------ */
/* Peças                                                               */
/* ------------------------------------------------------------------ */

function Painel({
  titulo, acao, children, style,
}: { titulo: string; acao?: React.ReactNode; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <section
      className="flex min-h-0 min-w-0 flex-col overflow-hidden"
      style={{
        background: 'var(--surface-card)',
        border: '1px solid var(--hairline)',
        borderRadius: u(1.2),
        padding: u(1.8),
        gap: u(1.2),
        ...style,
      }}
    >
      <div className="flex shrink-0 items-center justify-between" style={{ gap: u(1) }}>
        <h2
          className="font-bold uppercase"
          style={{ fontSize: u(1.75), letterSpacing: '0.08em', color: 'var(--ink-muted)' }}
        >
          {titulo}
        </h2>
        {acao}
      </div>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </section>
  );
}

/**
 * O número fica sempre em tinta de texto, nunca na cor da série: amarelo como
 * texto dá 2,17:1 sobre branco. Quando o indicador tem identidade de cor, ela
 * vem num quadradinho ao lado do rótulo, que é marca e não texto.
 */
function Kpi({
  valor, rotulo, apoio, marca, destaque, onClick,
}: { valor: string; rotulo: string; apoio?: string; marca?: string; destaque?: boolean; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
      className={`flex min-w-0 flex-col justify-center select-none ${onClick ? 'cursor-pointer hover:brightness-105 active:scale-[0.98] transition-all' : ''}`}
      style={{
        background: destaque ? 'color-mix(in srgb, var(--brand) 12%, var(--surface-card))' : 'var(--surface-card)',
        border: `1px solid ${destaque ? 'color-mix(in srgb, var(--brand) 40%, var(--hairline))' : 'var(--hairline)'}`,
        borderRadius: u(1.2),
        padding: `${u(1.4)} ${u(1.8)}`,
        gap: u(0.4),
      }}
      title={onClick ? `Clique para ver detalhes de ${rotulo}` : undefined}
    >
      <span className="tabular font-bold leading-none" style={{ fontSize: u(6), color: 'var(--ink-primary)' }}>
        {valor}
      </span>
      <span className="flex min-w-0 items-center" style={{ gap: u(0.6) }}>
        {marca && (
          <span
            className="shrink-0"
            style={{ width: u(1.2), height: u(1.2), borderRadius: u(0.3), background: marca }}
          />
        )}
        <span
          className="truncate font-bold uppercase"
          style={{ fontSize: u(1.5), letterSpacing: '0.06em', color: 'var(--ink-secondary)' }}
        >
          {rotulo}
        </span>
      </span>
      {apoio && (
        <span className="truncate" style={{ fontSize: u(1.4), color: 'var(--ink-muted)' }}>
          {apoio}
        </span>
      )}
    </div>
  );
}

/**
 * Verde do "expedido" — passo próprio, um tom mais escuro que
 * `--status-good` (pedido explícito). Só aqui: `--status-good` é token de
 * status compartilhado com o resto do app e continua servindo o sinal de
 * "atualização automática" no cabeçalho sem alteração.
 */
const EXPEDIDO_CSS = '#0a8b0a';

/**
 * Uma célula da matriz mostra o seq do tramo — mas só quando há algo a
 * mostrar: pendente fica vazia de propósito, porque o pedido era "saber qual
 * número já foi faturado e expedido", não listar os 90 tramos.
 *
 * Preenchimento, nunca borda: verde para expedido (venceu o funil); azul
 * para faturado.
 *
 * O número fica em pé (`vertical-rl` + `text-orientation: upright`): cada
 * dígito continua legível sem virar a cabeça, grande o bastante para ler a
 * distância, e a pilha de dígitos cabe numa coluna estreita sem precisar
 * alargar a célula — a razão de ser vertical.
 */
function CelulaTramo({ celula, largura, onClick }: { celula: CelulaMatriz | null; largura: string; onClick?: () => void }) {
  if (!celula || celula.estado === 'pendente') {
    return (
      <div
        onClick={onClick}
        role={onClick ? 'button' : undefined}
        title={celula ? `Torre ${celula.torre} ${celula.tramo} · ${ESTADO_ROTULO.pendente} (clique para ver detalhes)` : undefined}
        className={onClick ? 'cursor-pointer transition-transform hover:scale-105' : ''}
        style={{
          width: largura,
          height: '100%',
          borderRadius: u(0.4),
          background: celula ? 'var(--surface-sunken)' : 'transparent',
          border: celula ? '1px solid var(--hairline)' : 'none',
        }}
      />
    );
  }

  const expedido = celula.estado === 'expedido';
  const fundo = expedido ? EXPEDIDO_CSS : FATURADO_CSS;

  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      className={`relative flex items-center justify-center overflow-hidden ${onClick ? 'cursor-pointer transition-transform hover:scale-110 hover:z-10 shadow-sm' : ''}`}
      title={`Torre ${celula.torre} ${celula.tramo} · Seq ${celula.serie ?? '-'} · ${ESTADO_ROTULO[celula.estado]}${celula.notaFiscal ? ` · NF ${celula.notaFiscal}` : ''} (clique para ver detalhes)`}
      style={{ width: largura, height: '100%', borderRadius: u(0.4), background: fundo }}
    >
      <span
        className="tabular font-bold"
        style={{
          color: '#ffffff',
          // Só o seq (4 dígitos) — o "T1-" era redundante com o rótulo da
          // própria linha (T1..T5), então cabe uma fonte maior que a do
          // rótulo "T1-3143" que veio antes.
          fontSize: `min(calc(${largura} * 0.42), ${u(1.5)})`,
          writingMode: 'vertical-rl',
          textOrientation: 'upright',
          // `writing-mode` só tem efeito em caixa inline ATÔMICA (spec de CSS
          // Writing Modes) — `<span>` puro é inline não-atômico e a
          // propriedade era ignorada: o texto saía deitado, largo demais para
          // a coluna estreita, e o `overflow: hidden` do pai cortava tudo,
          // deixando a célula "sem número". `inline-block` resolve.
          display: 'inline-block',
          letterSpacing: u(0.08),
          lineHeight: 1,
        }}
      >
        {celula.serie ?? ''}
      </span>
      {/* Reforço para quem não distingue verde de amarelo (ΔE 3,0 em
          protanopia — ver comentário de RESTRICAO_CSS): sem isso, expedido e
          faturado-com-restrição ficam indistinguíveis por cor sozinha. */}
      {expedido && (
        <span
          className="absolute flex items-center justify-center font-black leading-none"
          style={{
            bottom: u(0.15), right: u(0.15),
            width: u(1.1), height: u(1.1), borderRadius: '999px',
            background: '#ffffff', color: fundo,
            fontSize: u(0.75),
          }}
        >
          ✓
        </span>
      )}
    </div>
  );
}

/**
 * Régua com o número de todas as torres. A fonte acompanha a largura da
 * coluna, então continua cabendo quando o projeto crescer das 18 torres
 * atuais para as 69. Usada em cima e embaixo da matriz.
 */
function ReguaTorres({ torres, largura, onCliqueTorre }: { torres: number[]; largura: string; onCliqueTorre?: (torre: number) => void }) {
  return (
    <div className="flex shrink-0 items-center" style={{ gap: u(1) }}>
      <span className="shrink-0" style={{ width: u(3.4) }} />
      <div className="flex min-w-0 flex-1" style={{ gap: u(0.5) }}>
        {torres.map((torre) => (
          <button
            key={torre}
            type="button"
            onClick={onCliqueTorre ? () => onCliqueTorre(torre) : undefined}
            title={onCliqueTorre ? `Torre ${torre} · Clique para ver todos os tramos` : undefined}
            className={`tabular text-center font-bold ${onCliqueTorre ? 'cursor-pointer hover:bg-slate-200/50 dark:hover:bg-slate-700/40 rounded transition-colors' : ''}`}
            style={{
              width: largura,
              fontSize: `min(calc(${largura} * 0.62), ${u(1.5)})`,
              lineHeight: 1.2,
              color: 'var(--ink-secondary)',
            }}
          >
            {torre}
          </button>
        ))}
      </div>
    </div>
  );
}

type VisaoTemporal = 'mes' | 'semana';

/** Par de botões Mês/Semana — ação no cabeçalho do painel de ritmo. */
function AlternadorVisao({ visao, onMudar }: { visao: VisaoTemporal; onMudar: (v: VisaoTemporal) => void }) {
  const opcoes: { valor: VisaoTemporal; rotulo: string }[] = [
    { valor: 'mes', rotulo: 'Mês' },
    { valor: 'semana', rotulo: 'Semana' },
  ];
  return (
    <div className="flex shrink-0" style={{ gap: u(0.3), padding: u(0.25), borderRadius: u(0.7), background: 'var(--surface-sunken)' }}>
      {opcoes.map((o) => (
        <button
          key={o.valor}
          type="button"
          onClick={() => onMudar(o.valor)}
          style={{
            padding: `${u(0.4)} ${u(1)}`,
            borderRadius: u(0.5),
            fontSize: u(1.3),
            fontWeight: 700,
            background: visao === o.valor ? 'var(--surface-card)' : 'transparent',
            color: visao === o.valor ? 'var(--ink-primary)' : 'var(--ink-muted)',
            boxShadow: visao === o.valor ? '0 1px 2px rgba(0,0,0,0.15)' : 'none',
          }}
        >
          {o.rotulo}
        </button>
      ))}
    </div>
  );
}

function ItemLegendaCor({ cor, texto }: { cor: string; texto: string }) {
  return (
    <span className="inline-flex items-center" style={{ gap: u(0.6) }}>
      <span className="shrink-0" style={{ width: u(1.4), height: u(1.4), borderRadius: u(0.3), background: cor }} />
      <span style={{ fontSize: u(1.35), color: 'var(--ink-secondary)' }}>{texto}</span>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Painel                                                              */
/* ------------------------------------------------------------------ */

export default function FinFaturamentoWallboard({ linhas, onAtualizar, carregando, onEditarLinha }: Props) {
  const raiz = useRef<HTMLDivElement>(null);
  const matrizRef = useRef<HTMLDivElement>(null);
  const [telaCheia, setTelaCheia] = useState(false);
  const [agora, setAgora] = useState(() => new Date());
  // Mês é o padrão: é o recorte que a diretoria acompanha. Semana fica a um clique.
  const [visaoTemporal, setVisaoTemporal] = useState<VisaoTemporal>('mes');
  const [detalheAberto, setDetalheAberto] = useState<DetalheModalTipo | null>(null);

  // Mapa rápido por chave "torre|tramo"
  const indiceLinhas = useMemo(() => {
    const mapa = new Map<string, FinFatGwjaco>();
    for (const l of linhas) {
      mapa.set(`${l.torre_numero}|${l.tramo}`, l);
    }
    return mapa;
  }, [linhas]);

  // Largura da coluna da matriz, medida em px — nunca em `calc(%, ...)`. O
  // formato antigo (`min(Nu, calc((100% - Nu*(k-1))/k))`) reaproveitava a
  // mesma string dentro de `font-size`, e `%` em `font-size` resolve contra o
  // tamanho de fonte do elemento pai, não contra a largura do container. O
  // cálculo virava um número absurdamente negativo e o navegador travava em
  // `0px` — os números da matriz nunca apareciam, com ou sem `writing-mode`.
  // Medir em JS elimina a ambiguidade: vira um número de verdade, reusável
  // em qualquer propriedade CSS sem recalcular a base.
  const [wbPx, setWbPx] = useState(10.8);
  const [matrizWidthPx, setMatrizWidthPx] = useState(0);

  const semanaAtual = useMemo(() => semanaISO(new Date().toISOString().slice(0, 10)), []);
  const mesAtual = useMemo(() => new Date().toISOString().slice(0, 7), []);
  const resumo = useMemo(() => resumoFaturamento(linhas, semanaAtual, mesAtual), [linhas, semanaAtual, mesAtual]);
  const matriz = useMemo(() => matrizTorreTramo(linhas), [linhas]);
  const semanas = useMemo(() => faturadosPorSemana(linhas, semanaAtual), [linhas, semanaAtual]);
  const meses = useMemo(() => faturadosPorMes(linhas, mesAtual), [linhas, mesAtual]);
  // Um único formato para o gráfico de ritmo, mês ou semana: os dois pontos
  // já compartilham {rotulo, faturados, ehAtual}.
  const pontosRitmo = visaoTemporal === 'mes' ? meses : semanas;
  const maxRitmo = Math.max(1, ...pontosRitmo.map((p) => p.faturados));
  const tramos = useMemo(() => faturadosPorTramo(linhas), [linhas]);
  // Cinco, não seis: com seis a linha fica com 25px de altura para 22px de
  // texto numa TV 1080p, e o painel perde o respiro.
  const notas = useMemo(() => ultimasNotas(linhas, 5), [linhas]);

  // "Atualizado" na parede é a última EDIÇÃO do dado, não a última vez que a
  // página buscou do banco (isso já é automático a cada 2 minutos e não diz
  // nada sobre se alguém mexeu no lançamento). Vem do próprio updated_at das
  // linhas já carregadas — sem consulta extra.
  const ultimaEdicaoEm = useMemo(() => {
    let maisRecente: number | null = null;
    for (const l of linhas) {
      const t = Date.parse(l.updated_at);
      if (!isNaN(t) && (maisRecente === null || t > maisRecente)) maisRecente = t;
    }
    return maisRecente ? new Date(maisRecente) : null;
  }, [linhas]);

  // Escala: 1 unidade = 1% da altura util do painel. Continua via CSS var
  // (não precisa de estado React: nada de font-size lê --wb diretamente com
  // `%` misturado) e também alimenta o estado usado no cálculo em JS abaixo.
  useLayoutEffect(() => {
    const el = raiz.current;
    if (!el) return;
    const aplicar = () => {
      const px = el.clientHeight / 100;
      el.style.setProperty('--wb', `${px}px`);
      setWbPx(px);
    };
    aplicar();
    const ro = new ResizeObserver(aplicar);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Largura real da faixa de células da matriz, medida diretamente — não
  // deriva da largura do board (a matriz é só ~65% dela, fração que vem do
  // grid `1.9fr/1fr`, e replicar essa conta em JS seria tão frágil quanto o
  // bug que este estado corrige).
  useLayoutEffect(() => {
    const el = matrizRef.current;
    if (!el) return;
    const aplicar = () => setMatrizWidthPx(el.clientWidth);
    aplicar();
    const ro = new ResizeObserver(aplicar);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Relogio da parede: minuto a minuto basta, e evita re-render por segundo.
  useEffect(() => {
    const id = setInterval(() => setAgora(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  // A parede se atualiza sozinha; ninguem vai apertar F5 na TV.
  useEffect(() => {
    const id = setInterval(() => { void onAtualizar(); }, 120_000);
    return () => clearInterval(id);
  }, [onAtualizar]);

  useEffect(() => {
    const aoTrocar = () => setTelaCheia(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', aoTrocar);
    return () => document.removeEventListener('fullscreenchange', aoTrocar);
  }, []);

  const alternarTelaCheia = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void raiz.current?.requestFullscreen?.();
  };

  // Largura da célula da matriz, em px de verdade: cabe sempre, de 18 a 69
  // torres. Rótulo da linha (T1..T5) + gap saem da faixa medida antes de
  // dividir pelas colunas.
  const colunas = Math.max(matriz.torres.length, 1);
  const rotuloELacunaPx = 3.4 * wbPx + 1 * wbPx;
  const faixaPx = Math.max(0, matrizWidthPx - rotuloELacunaPx);
  const gapCelulaPx = 0.5 * wbPx;
  const larguraCelulaPx = matrizWidthPx > 0
    ? Math.max(4, Math.min(4.4 * wbPx, (faixaPx - gapCelulaPx * (colunas - 1)) / colunas))
    : 4.4 * wbPx;
  const larguraCelula = `${larguraCelulaPx}px`;

  const maxTramo = Math.max(1, ...tramos.map((t) => t.total));

  return (
    <div
      ref={raiz}
      className="wb-root relative flex w-full flex-col overflow-hidden"
      style={{
        // Emoldurado na pagina mantem 16:9 (a proporcao da TV); em tela cheia
        // o browser manda e a altura vira 100vh.
        aspectRatio: telaCheia ? undefined : '16 / 9',
        height: telaCheia ? '100vh' : undefined,
        background: 'var(--surface-page)',
        borderRadius: telaCheia ? 0 : '1rem',
        border: telaCheia ? 'none' : '1px solid var(--hairline)',
        padding: u(2),
        gap: u(1.6),
      }}
    >
      {/* Cabecalho */}
      <header className="flex shrink-0 items-center justify-between" style={{ gap: u(2) }}>
        <div className="flex min-w-0 items-center" style={{ gap: u(1.6) }}>
          <img
            src="/logo-sisten.png"
            alt="Sisten"
            style={{ height: u(6), width: 'auto' }}
          />
          <div className="min-w-0" style={{ borderLeft: '1px solid var(--hairline)', paddingLeft: u(1.6) }}>
            <h1
              className="truncate font-bold leading-none"
              style={{ fontSize: u(3.6), color: 'var(--ink-primary)', letterSpacing: '-0.02em' }}
            >
              Faturamento de Tramos
            </h1>
            <p className="truncate" style={{ fontSize: u(1.7), color: 'var(--ink-muted)', marginTop: u(0.6) }}>
              GW Jacobina · {linhas[0]?.projeto_codigo ?? 'Projeto único'}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center" style={{ gap: u(1.2) }}>
          <div className="text-right">
            <p className="tabular font-bold leading-none" style={{ fontSize: u(3.2), color: 'var(--ink-primary)' }}>
              {fmtHora(agora)}
            </p>
            <p style={{ fontSize: u(1.4), color: 'var(--ink-muted)', marginTop: u(0.5) }}>
              Semana {semanaAtual ?? '-'} · última edição {ultimaEdicaoEm ? fmtDataHora(ultimaEdicaoEm) : '-'}
            </p>
          </div>
          {/* Sinal de vivo: numa parede, a duvida e sempre "isso congelou?". */}
          <span
            className="flex items-center justify-center"
            style={{
              width: u(3.4), height: u(3.4), borderRadius: '9999px',
              background: 'color-mix(in srgb, var(--status-good) 14%, transparent)',
              color: 'var(--status-good)',
            }}
            title={carregando ? 'Atualizando...' : 'Atualização automática a cada 2 minutos'}
          >
            {carregando
              ? <RefreshCw className="animate-spin" style={{ width: u(1.8), height: u(1.8) }} />
              : <Radio className="wb-pulse" style={{ width: u(1.8), height: u(1.8) }} />}
          </span>
          <button
            type="button"
            onClick={alternarTelaCheia}
            title={telaCheia ? 'Sair da tela cheia' : 'Modo TV (tela cheia)'}
            className="flex items-center justify-center transition-opacity hover:opacity-70"
            style={{
              width: u(3.4), height: u(3.4), borderRadius: u(0.8),
              border: '1px solid var(--hairline)', color: 'var(--ink-secondary)',
              background: 'var(--surface-card)',
            }}
          >
            {telaCheia
              ? <Minimize2 style={{ width: u(1.8), height: u(1.8) }} />
              : <Maximize2 style={{ width: u(1.8), height: u(1.8) }} />}
          </button>
        </div>
      </header>

      {/* Linha de indicadores */}
      <div className="grid shrink-0 grid-cols-6" style={{ gap: u(1.6), height: u(16) }}>
        <Kpi
          valor={`${resumo.faturados}/${resumo.total}`}
          rotulo="Tramos Faturados"
          apoio="tramos com NF emitida"
          marca={FATURADO_CSS}
          destaque
          onClick={() => setDetalheAberto({
            tipo: 'kpi_filtro',
            titulo: 'Tramos Faturados',
            subtitulo: `${resumo.faturados} tramo(s) com nota fiscal emitida`,
            linhas: linhas.filter((l) => Boolean(l.data_faturado)),
          })}
        />
        <Kpi
          valor={`${resumo.percentual}%`}
          rotulo="Faturado"
          apoio={`${resumo.faturados} de ${resumo.total} tramos`}
          marca={FATURADO_CSS}
          onClick={() => setDetalheAberto({
            tipo: 'kpi_filtro',
            titulo: 'Tramos Faturados',
            subtitulo: `${resumo.faturados} de ${resumo.total} tramos (${resumo.percentual}%)`,
            linhas: linhas.filter((l) => Boolean(l.data_faturado)),
          })}
        />
        <Kpi
          valor={String(resumo.expedidos)}
          rotulo="Expedidos"
          apoio={`${resumo.faturados - resumo.expedidos} faturados sem expedir`}
          marca={EXPEDIDO_CSS}
          onClick={() => setDetalheAberto({
            tipo: 'kpi_filtro',
            titulo: 'Tramos Expedidos',
            subtitulo: `${resumo.expedidos} tramo(s) expedidos da fábrica`,
            linhas: linhas.filter((l) => Boolean(l.data_expedido)),
          })}
        />
        <Kpi
          valor={String(resumo.pendentes)}
          rotulo="A faturar"
          apoio={`${resumo.totalTorres - resumo.torresIniciadas} torres não iniciadas`}
          onClick={() => setDetalheAberto({
            tipo: 'kpi_filtro',
            titulo: 'Tramos A Faturar (Pendentes)',
            subtitulo: `${resumo.pendentes} tramo(s) aguardando faturamento`,
            linhas: linhas.filter((l) => !l.data_faturado),
          })}
        />
        <Kpi
          valor={`${resumo.torresConcluidas}/${resumo.totalTorres}`}
          rotulo="Torres completas"
          apoio={`${resumo.torresIniciadas} em andamento`}
          onClick={() => {
            const porTorre = new Map<number, FinFatGwjaco[]>();
            for (const l of linhas) {
              const arr = porTorre.get(l.torre_numero) ?? [];
              arr.push(l);
              porTorre.set(l.torre_numero, arr);
            }
            const concluidas: FinFatGwjaco[] = [];
            for (const [, arr] of porTorre) {
              if (arr.length === 5 && arr.every((l) => Boolean(l.data_faturado))) {
                concluidas.push(...arr);
              }
            }
            setDetalheAberto({
              tipo: 'kpi_filtro',
              titulo: 'Torres Completas (5 Tramos Faturados)',
              subtitulo: `${resumo.torresConcluidas} de ${resumo.totalTorres} torres concluídas (${concluidas.length} tramos)`,
              linhas: concluidas,
            });
          }}
        />
        <Kpi
          valor={String(resumo.noMes)}
          rotulo={`Mês ${rotuloMes(mesAtual)}`}
          apoio={resumo.ultimaNota ? `Última NF ${resumo.ultimaNota.nota_fiscal}` : 'Sem nota emitida'}
          onClick={() => setDetalheAberto({
            tipo: 'periodo_ritmo',
            visao: 'mes',
            rotulo: rotuloMes(mesAtual),
            linhasDoPeriodo: linhas.filter((l) => (l.data_faturado ?? '').slice(0, 7) === mesAtual),
          })}
        />
      </div>

      {/* Corpo */}
      <div className="grid min-h-0 flex-1" style={{ gridTemplateColumns: '1.9fr 1fr', gap: u(1.6) }}>
        {/* Matriz torre x tramo */}
        <Painel titulo={`Avanço por torre e tramo · ${matriz.torres.length} torres`}>
          <div ref={matrizRef} className="flex min-h-0 flex-1 flex-col" style={{ gap: u(0.5) }}>
            {/* Régua em cima e embaixo: matriz tem 5 linhas, não dá para
                descer o olho até o rodapé toda vez que se quer saber a torre. */}
            <ReguaTorres
              torres={matriz.torres}
              largura={larguraCelula}
              onCliqueTorre={(torre) => setDetalheAberto({
                tipo: 'torre_completa',
                torre,
                linhasDaTorre: linhas.filter((l) => l.torre_numero === torre),
              })}
            />

            {matriz.linhas.map((linhaTramo) => (
              <div key={linhaTramo.tramo} className="flex min-h-0 flex-1 items-stretch" style={{ gap: u(1) }}>
                <span
                  className="tabular flex shrink-0 items-center justify-end font-bold"
                  style={{ width: u(3.4), fontSize: u(1.7), color: 'var(--ink-secondary)' }}
                >
                  {linhaTramo.tramo}
                </span>
                <div className="flex min-w-0 flex-1" style={{ gap: u(0.5) }}>
                  {linhaTramo.celulas.map((celula, i) => {
                    const torreNumero = celula?.torre ?? matriz.torres[i];
                    const chave = `${torreNumero}|${linhaTramo.tramo}`;
                    const linhaExistente = indiceLinhas.get(chave) ?? null;
                    return (
                      <CelulaTramo
                        key={i}
                        celula={celula}
                        largura={larguraCelula}
                        onClick={() => setDetalheAberto({
                          tipo: 'tramo_individual',
                          linha: linhaExistente,
                          torre: torreNumero,
                          tramo: linhaTramo.tramo,
                        })}
                      />
                    );
                  })}
                </div>
              </div>
            ))}

            <ReguaTorres
              torres={matriz.torres}
              largura={larguraCelula}
              onCliqueTorre={(torre) => setDetalheAberto({
                tipo: 'torre_completa',
                torre,
                linhasDaTorre: linhas.filter((l) => l.torre_numero === torre),
              })}
            />
          </div>

          <div
            className="flex shrink-0 flex-wrap items-center"
            style={{ gap: u(1.8), paddingTop: u(1.2), borderTop: '1px solid var(--hairline)' }}
          >
            <ItemLegendaCor cor={EXPEDIDO_CSS} texto="Expedido" />
            <ItemLegendaCor cor={FATURADO_CSS} texto="Faturado" />
            <span className="shrink-0" style={{ width: u(1.4), height: u(1.4), borderRadius: u(0.3), background: 'var(--surface-sunken)', border: '1px solid var(--hairline)' }} />
            <span style={{ fontSize: u(1.35), color: 'var(--ink-secondary)' }}>Pendente</span>
            <span style={{ fontSize: u(1.3), color: 'var(--ink-muted)', marginLeft: 'auto' }}>
              Número = seq (faturado ou expedido). Coluna = torre.
            </span>
          </div>
        </Painel>

        {/* Coluna direita */}
        <div className="grid min-h-0" style={{ gridTemplateRows: '1.6fr 0.95fr 1.15fr', gap: u(1.6) }}>
          {/*
            Ritmo de faturamento: só o total por mês (padrão) ou por semana.
            O detalhe por tramo (seq, restrição) já está na matriz — aqui a
            pergunta é "quanto saiu", não "o quê".
          */}
          <Painel
            titulo={`Tramos faturados por ${visaoTemporal === 'mes' ? 'mês' : 'semana'}`}
            acao={<AlternadorVisao visao={visaoTemporal} onMudar={setVisaoTemporal} />}
          >
            <div className="flex min-h-0 flex-1 items-end" style={{ gap: u(1) }}>
              {pontosRitmo.length === 0 && (
                <p style={{ fontSize: u(1.5), color: 'var(--ink-muted)' }}>Nenhum tramo faturado ainda.</p>
              )}
              {pontosRitmo.map((p) => (
                <div
                  key={p.rotulo}
                  onClick={() => {
                    if (visaoTemporal === 'mes') {
                      const pMes = p as PontoMes;
                      setDetalheAberto({
                        tipo: 'periodo_ritmo',
                        visao: 'mes',
                        rotulo: p.rotulo,
                        linhasDoPeriodo: linhas.filter((l) => (l.data_faturado ?? '').slice(0, 7) === pMes.mes),
                      });
                    } else {
                      const pSem = p as PontoSemana;
                      setDetalheAberto({
                        tipo: 'periodo_ritmo',
                        visao: 'semana',
                        rotulo: p.rotulo,
                        linhasDoPeriodo: linhas.filter((l) => semanaDaLinha(l) === pSem.semana),
                      });
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  title={`Clique para ver os tramos faturados em ${p.rotulo}`}
                  className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end cursor-pointer transition-transform hover:scale-[1.03]"
                  style={{ gap: u(0.5) }}
                >
                  <span
                    className="tabular shrink-0 font-bold group-hover:text-emerald-500 transition-colors"
                    style={{ fontSize: u(1.6), color: 'var(--ink-primary)' }}
                  >
                    {p.faturados}
                  </span>
                  <div
                    className="w-full group-hover:brightness-125 transition-all"
                    style={{
                      height: `${(p.faturados / maxRitmo) * 100}%`,
                      minHeight: u(0.4),
                      borderRadius: `${u(0.4)} ${u(0.4)} 0 0`,
                      background: FATURADO_CSS,
                      border: p.ehAtual ? `${u(0.25)} solid var(--ink-primary)` : 'none',
                      borderBottom: 'none',
                    }}
                  />
                  <span
                    className="shrink-0 text-center font-bold group-hover:text-emerald-500 transition-colors"
                    style={{ fontSize: u(1.4), color: p.ehAtual ? 'var(--ink-primary)' : 'var(--ink-muted)' }}
                  >
                    {p.rotulo}
                  </span>
                </div>
              ))}
            </div>
          </Painel>

          {/* Por tramo: cinco linhas com numero pequeno nao pedem eixo. */}
          <Painel titulo="Faturado por tramo">
            <div className="flex min-h-0 flex-1 flex-col" style={{ gap: u(0.6) }}>
              {tramos.map((t) => (
                <div
                  key={t.tramo}
                  onClick={() => setDetalheAberto({
                    tipo: 'tramo_tipo',
                    tramo: t.tramo,
                    linhasDoTramo: linhas.filter((l) => l.tramo === t.tramo),
                  })}
                  role="button"
                  tabIndex={0}
                  title={`Clique para ver todos os lançamentos do tramo ${t.tramo}`}
                  className="group flex min-h-0 flex-1 items-center cursor-pointer px-1 py-0.5 rounded-lg hover:bg-slate-100/40 dark:hover:bg-slate-800/40 transition-colors"
                  style={{ gap: u(1) }}
                >
                  <span
                    className="tabular shrink-0 font-bold group-hover:text-emerald-500 transition-colors"
                    style={{ width: u(3.4), fontSize: u(1.6), color: 'var(--ink-secondary)' }}
                  >
                    {t.tramo}
                  </span>
                  <div
                    className="min-w-0 flex-1 overflow-hidden"
                    style={{ height: `min(${u(2.2)}, 62%)`, borderRadius: u(0.4), background: 'var(--surface-sunken)' }}
                  >
                    <div
                      className="group-hover:brightness-125 transition-all"
                      style={{
                        width: `${(t.faturados / maxTramo) * 100}%`,
                        height: '100%',
                        borderRadius: u(0.4),
                        background: FATURADO_CSS,
                        transition: 'width var(--dur-slow) var(--ease-out)',
                      }}
                    />
                  </div>
                  <span
                    className="shrink-0 text-right font-bold tabular group-hover:text-emerald-500 transition-colors"
                    style={{ width: u(5), fontSize: u(1.7), color: 'var(--ink-primary)' }}
                  >
                    {t.faturados}
                    <span style={{ color: 'var(--ink-muted)', fontWeight: 500 }}>/{t.total}</span>
                  </span>
                </div>
              ))}
            </div>
          </Painel>

          {/* Ultimas notas */}
          <Painel titulo="Últimas notas emitidas">
            <div className="flex min-h-0 flex-1 flex-col" style={{ gap: u(0.5) }}>
              {notas.length === 0 && (
                <p style={{ fontSize: u(1.6), color: 'var(--ink-muted)' }}>Nenhuma nota emitida ainda.</p>
              )}
              {notas.map((n) => (
                <div
                  key={n.id}
                  onClick={() => setDetalheAberto({
                    tipo: 'tramo_individual',
                    linha: n,
                    torre: n.torre_numero,
                    tramo: n.tramo,
                  })}
                  role="button"
                  tabIndex={0}
                  title={`Clique para ver os detalhes da NF ${n.nota_fiscal}`}
                  className="flex min-h-0 flex-1 items-center justify-between overflow-hidden cursor-pointer hover:bg-slate-200/60 dark:hover:bg-slate-800/80 transition-colors"
                  style={{
                    gap: u(1),
                    padding: `0 ${u(1)}`,
                    borderRadius: u(0.6),
                    background: 'var(--surface-raised)',
                  }}
                >
                  <span className="tabular font-bold" style={{ fontSize: u(1.7), color: 'var(--ink-primary)' }}>
                    {n.nota_fiscal}
                  </span>
                  <span className="truncate" style={{ fontSize: u(1.5), color: 'var(--ink-muted)' }}>
                    Torre {n.torre_numero} - {n.tramo}{n.serie ? ` - ${n.serie}` : ''}
                  </span>
                  <span className="tabular shrink-0" style={{ fontSize: u(1.5), color: 'var(--ink-secondary)' }}>
                    {fmtDataBR(n.data_faturado)}
                  </span>
                </div>
              ))}
            </div>
          </Painel>
        </div>
      </div>

      {/* Janela modal de detalhes ao clicar nos graficos */}
      {detalheAberto && (
        <FinFaturamentoDetalhesModal
          detalhe={detalheAberto}
          onFechar={() => setDetalheAberto(null)}
          onEditarLinha={onEditarLinha}
          onVerTramo={(linha, torre, tramo) => {
            setDetalheAberto({ tipo: 'tramo_individual', linha, torre, tramo });
          }}
        />
      )}

      {/*
        `--wb` mora numa classe, não no objeto de estilo do React: o
        ResizeObserver escreve o valor medido no atributo `style` do elemento, e
        se a propriedade também estivesse no JSX o React a reescreveria com o
        fallback a cada re-render (o relógio re-renderiza de minuto em minuto).
        Regra de classe perde para inline, então a medida sempre vence.

        O pulso do sinal de vivo para sob movimento reduzido: a parede fica
        ligada o dia inteiro e piscar sem parar cansa.
      */}
      <style>{`
        .wb-root { --wb: 10.8px; }
        @keyframes wb-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
        .wb-pulse { animation: wb-pulse 2.4s var(--ease-out) infinite; }
        @media (prefers-reduced-motion: reduce) { .wb-pulse { animation: none; } }
      `}</style>
    </div>
  );
}
