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
  resumoFaturamento, matrizTorreTramo, faturadosPorSemana, faturadosPorTramo,
  ultimasNotas, semanaISO, type EstadoTramo, type CelulaMatriz,
} from '../../lib/finFaturamentoRelatorio';

interface Props {
  linhas: FinFatGwjaco[];
  onAtualizar: () => void | Promise<void>;
  atualizadoEm: Date | null;
  carregando?: boolean;
}

/** N unidades de escala do painel. 1 unidade = 1% da altura do container. */
const u = (n: number) => `calc(var(--wb) * ${n})`;

/**
 * Amarelo do "faturado, ainda não expedido". É o `--series-4` do projeto, que
 * já vem com passo por tema (`#eda100` claro, `#c98500` escuro) e já está no
 * conjunto validado — em vez de `--status-warning`, que é amarelo mais puro mas
 * dá 1,83:1 sobre branco e reprovaria o contraste no tema claro.
 *
 * Amarelo contra o verde do expedido é um par fraco em protanopia (ΔE 3,0 no
 * validador). Por isso todo estado aqui carrega glifo e rótulo: a cor é reforço,
 * nunca a única codificação.
 */
const FATURADO_CSS = 'var(--series-4)';

/** Tinta sobre qualquer preenchimento amarelo: branco não teria contraste. */
const TINTA_SOBRE_AMARELO = '#0f172a';

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

/* ------------------------------------------------------------------ */
/* Peças                                                               */
/* ------------------------------------------------------------------ */

function Painel({
  titulo, children, style,
}: { titulo: string; children: React.ReactNode; style?: React.CSSProperties }) {
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
      <h2
        className="shrink-0 font-bold uppercase"
        style={{ fontSize: u(1.75), letterSpacing: '0.08em', color: 'var(--ink-muted)' }}
      >
        {titulo}
      </h2>
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
  valor, rotulo, apoio, marca, destaque,
}: { valor: string; rotulo: string; apoio?: string; marca?: string; destaque?: boolean }) {
  return (
    <div
      className="flex min-w-0 flex-col justify-center"
      style={{
        background: destaque ? 'color-mix(in srgb, var(--brand) 12%, var(--surface-card))' : 'var(--surface-card)',
        border: `1px solid ${destaque ? 'color-mix(in srgb, var(--brand) 40%, var(--hairline))' : 'var(--hairline)'}`,
        borderRadius: u(1.2),
        padding: `${u(1.4)} ${u(1.8)}`,
        gap: u(0.4),
      }}
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
 * Amarelo do "faturado, com restrição" — pedido explícito por esse tom em vez
 * do laranja original. É o mesmo `--series-4` de `FATURADO_CSS` (link, não
 * cópia): declarar antes deste ponto no arquivo.
 *
 * ATENÇÃO ao trocar: verde (expedido) × amarelo (restrição) reprova o
 * `validate_palette.js` no tema escuro — ΔE 3,0 em protanopia, abaixo até do
 * piso de 6-8 que a skill de dataviz exige reforço secundário. Por isso
 * "expedido" carrega o selo `✓` além da cor: sem ele, quem não distingue
 * verde de amarelo não teria como separar as duas células.
 */
const RESTRICAO_CSS = FATURADO_CSS;
const SEM_RESTRICAO_CSS = 'var(--series-1)'; // azul: segue o fluxo normal, sem restrição

/**
 * Uma célula da matriz mostra o seq do tramo — mas só quando há algo a
 * mostrar: pendente fica vazia de propósito, porque o pedido era "saber qual
 * número já foi faturado e expedido", não listar os 90 tramos.
 *
 * Preenchimento, nunca borda: verde para expedido (venceu o funil, restrição
 * deixa de ser a pergunta ali); azul/laranja por restrição para "faturado,
 * ainda não expedido".
 *
 * O número fica em pé (`vertical-rl` + `text-orientation: upright`): cada
 * dígito continua legível sem virar a cabeça, grande o bastante para ler a
 * distância, e a pilha de dígitos cabe numa coluna estreita sem precisar
 * alargar a célula — a razão de ser vertical.
 */
function CelulaTramo({ celula, largura }: { celula: CelulaMatriz | null; largura: string }) {
  if (!celula || celula.estado === 'pendente') {
    return (
      <div
        title={celula ? `Torre ${celula.torre} ${celula.tramo} · ${ESTADO_ROTULO.pendente}` : undefined}
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

  // Expedido é sempre verde — já venceu o funil, a restrição deixa de ser a
  // pergunta relevante nesse ponto (ela continua visível para "faturado" e na
  // coluna Restrição da tabela). Só "faturado" (ainda não expedido) usa
  // azul/amarelo.
  const expedido = celula.estado === 'expedido';
  const fundo = expedido ? 'var(--status-good)' : celula.restricao ? RESTRICAO_CSS : SEM_RESTRICAO_CSS;
  // Amarelo é claro; texto branco nele reprova contraste (2,17:1 no
  // validador). Verde e azul são escuros o bastante para texto branco.
  const tinta = fundo === RESTRICAO_CSS ? TINTA_SOBRE_AMARELO : '#ffffff';

  return (
    <div
      className="relative flex items-center justify-center overflow-hidden"
      title={`Torre ${celula.torre} ${celula.tramo} · Seq ${celula.serie ?? '-'} · ${ESTADO_ROTULO[celula.estado]}${celula.restricao ? ' · com restrição' : ''}${celula.notaFiscal ? ` · NF ${celula.notaFiscal}` : ''}`}
      style={{ width: largura, height: '100%', borderRadius: u(0.4), background: fundo }}
    >
      <span
        className="tabular font-bold"
        style={{
          color: tinta,
          // "T1-3143" tem 7 caracteres empilhados — cap mais baixo que o do
          // seq sozinho (que tinha só 4 dígitos), senão a coluna de texto
          // estoura a altura da linha.
          fontSize: `min(calc(${largura} * 0.55), ${u(1.35)})`,
          writingMode: 'vertical-rl',
          textOrientation: 'upright',
          letterSpacing: u(0.1),
          lineHeight: 1,
        }}
      >
        {celula.tramo}-{celula.serie ?? '?'}
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
function ReguaTorres({ torres, largura }: { torres: number[]; largura: string }) {
  return (
    <div className="flex shrink-0 items-center" style={{ gap: u(1) }}>
      <span className="shrink-0" style={{ width: u(3.4) }} />
      <div className="flex min-w-0 flex-1" style={{ gap: u(0.5) }}>
        {torres.map((torre) => (
          <span
            key={torre}
            className="tabular text-center font-bold"
            style={{
              width: largura,
              fontSize: `min(calc(${largura} * 0.62), ${u(1.5)})`,
              lineHeight: 1.2,
              color: 'var(--ink-secondary)',
            }}
          >
            {torre}
          </span>
        ))}
      </div>
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

export default function FinFaturamentoWallboard({ linhas, onAtualizar, atualizadoEm, carregando }: Props) {
  const raiz = useRef<HTMLDivElement>(null);
  const [telaCheia, setTelaCheia] = useState(false);
  const [agora, setAgora] = useState(() => new Date());

  const semanaAtual = useMemo(() => semanaISO(new Date().toISOString().slice(0, 10)), []);
  const resumo = useMemo(() => resumoFaturamento(linhas, semanaAtual), [linhas, semanaAtual]);
  const matriz = useMemo(() => matrizTorreTramo(linhas), [linhas]);
  const semanas = useMemo(() => faturadosPorSemana(linhas, semanaAtual), [linhas, semanaAtual]);
  const tramos = useMemo(() => faturadosPorTramo(linhas), [linhas]);
  // Cinco, não seis: com seis a linha fica com 25px de altura para 22px de
  // texto numa TV 1080p, e o painel perde o respiro.
  const notas = useMemo(() => ultimasNotas(linhas, 5), [linhas]);

  // Escala: 1 unidade = 1% da altura util do painel.
  useLayoutEffect(() => {
    const el = raiz.current;
    if (!el) return;
    const aplicar = () => el.style.setProperty('--wb', `${el.clientHeight / 100}px`);
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

  // Largura da celula da matriz: cabe sempre, de 18 a 69 torres.
  const colunas = Math.max(matriz.torres.length, 1);
  const larguraCelula = `min(${u(4.4)}, calc((100% - ${u(0.5)} * ${colunas - 1}) / ${colunas}))`;

  const maxSemana = Math.max(1, ...semanas.map((s) => s.faturados));
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
            src="/logo-ten.png"
            alt="Torres Eólicas do Nordeste"
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
              Semana {semanaAtual ?? '-'} · atualizado {atualizadoEm ? fmtHora(atualizadoEm) : '-'}
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
      <div className="grid shrink-0 grid-cols-5" style={{ gap: u(1.6), height: u(16) }}>
        <Kpi
          valor={`${resumo.percentual}%`}
          rotulo="Faturado"
          apoio={`${resumo.faturados} de ${resumo.total} tramos`}
          marca={FATURADO_CSS}
          destaque
        />
        <Kpi
          valor={String(resumo.expedidos)}
          rotulo="Expedidos"
          apoio={`${resumo.faturados - resumo.expedidos} faturados sem expedir`}
          marca="var(--status-good)"
        />
        <Kpi
          valor={String(resumo.pendentes)}
          rotulo="A faturar"
          apoio={`${resumo.totalTorres - resumo.torresIniciadas} torres não iniciadas`}
        />
        <Kpi
          valor={`${resumo.torresConcluidas}/${resumo.totalTorres}`}
          rotulo="Torres completas"
          apoio={`${resumo.torresIniciadas} em andamento`}
        />
        <Kpi
          valor={String(resumo.naSemana)}
          rotulo={`Semana ${semanaAtual ?? ''}`}
          apoio={resumo.ultimaNota ? `Última NF ${resumo.ultimaNota.nota_fiscal}` : 'Sem nota emitida'}
        />
      </div>

      {/* Corpo */}
      <div className="grid min-h-0 flex-1" style={{ gridTemplateColumns: '1.9fr 1fr', gap: u(1.6) }}>
        {/* Matriz torre x tramo */}
        <Painel titulo={`Avanço por torre e tramo · ${matriz.torres.length} torres`}>
          <div className="flex min-h-0 flex-1 flex-col" style={{ gap: u(0.5) }}>
            {/* Régua em cima e embaixo: matriz tem 5 linhas, não dá para
                descer o olho até o rodapé toda vez que se quer saber a torre. */}
            <ReguaTorres torres={matriz.torres} largura={larguraCelula} />

            {matriz.linhas.map((linhaTramo) => (
              <div key={linhaTramo.tramo} className="flex min-h-0 flex-1 items-stretch" style={{ gap: u(1) }}>
                <span
                  className="tabular flex shrink-0 items-center justify-end font-bold"
                  style={{ width: u(3.4), fontSize: u(1.7), color: 'var(--ink-secondary)' }}
                >
                  {linhaTramo.tramo}
                </span>
                <div className="flex min-w-0 flex-1" style={{ gap: u(0.5) }}>
                  {linhaTramo.celulas.map((celula, i) => (
                    <CelulaTramo key={i} celula={celula} largura={larguraCelula} />
                  ))}
                </div>
              </div>
            ))}

            <ReguaTorres torres={matriz.torres} largura={larguraCelula} />
          </div>

          <div
            className="flex shrink-0 flex-wrap items-center"
            style={{ gap: u(1.8), paddingTop: u(1.2), borderTop: '1px solid var(--hairline)' }}
          >
            <ItemLegendaCor cor="var(--status-good)" texto="Expedido" />
            <ItemLegendaCor cor={SEM_RESTRICAO_CSS} texto="Faturado, sem restrição" />
            <ItemLegendaCor cor={RESTRICAO_CSS} texto="Faturado, com restrição" />
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
            Ritmo semanal: só o total por semana. O detalhe por tramo (seq,
            restrição) já está na matriz — aqui a pergunta é "quanto saiu",
            não "o quê".
          */}
          <Painel titulo="Tramos faturados por semana">
            <div className="flex min-h-0 flex-1 items-end" style={{ gap: u(1) }}>
              {semanas.length === 0 && (
                <p style={{ fontSize: u(1.5), color: 'var(--ink-muted)' }}>Nenhum tramo faturado ainda.</p>
              )}
              {semanas.map((s) => (
                <div key={s.semana} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end" style={{ gap: u(0.5) }}>
                  <span
                    className="tabular shrink-0 font-bold"
                    style={{ fontSize: u(1.6), color: 'var(--ink-primary)' }}
                  >
                    {s.faturados}
                  </span>
                  <div
                    className="w-full"
                    style={{
                      height: `${(s.faturados / maxSemana) * 100}%`,
                      minHeight: u(0.4),
                      borderRadius: `${u(0.4)} ${u(0.4)} 0 0`,
                      background: FATURADO_CSS,
                      border: s.ehAtual ? `${u(0.25)} solid var(--ink-primary)` : 'none',
                      borderBottom: 'none',
                    }}
                  />
                  <span
                    className="shrink-0 text-center font-bold"
                    style={{ fontSize: u(1.4), color: s.ehAtual ? 'var(--ink-primary)' : 'var(--ink-muted)' }}
                  >
                    {s.rotulo}
                  </span>
                </div>
              ))}
            </div>
          </Painel>

          {/* Por tramo: cinco linhas com numero pequeno nao pedem eixo. */}
          <Painel titulo="Faturado por tramo">
            <div className="flex min-h-0 flex-1 flex-col" style={{ gap: u(0.6) }}>
              {tramos.map((t) => (
                <div key={t.tramo} className="flex min-h-0 flex-1 items-center" style={{ gap: u(1) }}>
                  <span
                    className="tabular shrink-0 font-bold"
                    style={{ width: u(3.4), fontSize: u(1.6), color: 'var(--ink-secondary)' }}
                  >
                    {t.tramo}
                  </span>
                  <div
                    className="min-w-0 flex-1 overflow-hidden"
                    style={{ height: `min(${u(2.2)}, 62%)`, borderRadius: u(0.4), background: 'var(--surface-sunken)' }}
                  >
                    <div
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
                    className="shrink-0 text-right font-bold tabular"
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
                  className="flex min-h-0 flex-1 items-center justify-between overflow-hidden"
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
                    T{n.torre_numero} · {n.tramo}
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
