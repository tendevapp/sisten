/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Slides 16:9 para print no PPT (e para apresentar direto da tela).
 *
 * Cada slide é desenhado em 1600 × 900 e escalado: na página, para a largura
 * disponível, um abaixo do outro; em tela cheia, um por vez, encaixado na
 * tela, com ← → (ou clique nas laterais) para navegar. O print sai sempre com
 * o mesmo layout, em qualquer monitor.
 *
 * "Exportar PDF" usa a impressão do navegador com a página do tamanho exato
 * do slide (1600 × 900 px, paisagem): uma página por slide, gráficos vetoriais,
 * sem biblioteca de captura. No diálogo, o destino é "Salvar como PDF".
 *
 * As cores são fixas e claras mesmo no tema escuro: o destino é o slide.
 * Usado em RID › Relatório e em Dashboards Suprimentos › Apresentação.
 */

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, FileDown, Loader2, Maximize2, Minimize2 } from 'lucide-react';

export const LARGURA_SLIDE = 1600;
export const ALTURA_SLIDE = 900;

export const COR_SLIDE = {
  tinta: '#0f172a',
  tinta2: '#475569',
  suave: '#94a3b8',
  linha: '#e2e8f0',
  fundo: '#f8fafc',
  verde: '#10b981',
  vermelho: '#f43f5e',
  azul: '#0ea5e9',
  ambar: '#f59e0b',
  indigo: '#6366f1',
};

export interface SlideDef {
  id: string;
  /** Aparece acima do slide na página (não entra no print). */
  titulo: string;
  conteudo: React.ReactNode;
}

/** Escala de um slide para a área medida (largura, ou largura e altura). */
function useEscala(encaixarAltura: boolean) {
  const areaRef = useRef<HTMLDivElement>(null);
  const [escala, setEscala] = useState(1);
  useLayoutEffect(() => {
    const area = areaRef.current;
    if (!area) return;
    const recalcular = () => {
      const { width, height } = area.getBoundingClientRect();
      if (!width) return;
      setEscala(encaixarAltura && height ? Math.min(width / LARGURA_SLIDE, height / ALTURA_SLIDE) : width / LARGURA_SLIDE);
    };
    recalcular();
    const obs = new ResizeObserver(recalcular);
    obs.observe(area);
    return () => obs.disconnect();
  }, [encaixarAltura]);
  return { areaRef, escala };
}

function SlideEscalado({ conteudo, encaixarAltura }: { conteudo: React.ReactNode; encaixarAltura: boolean }) {
  const { areaRef, escala } = useEscala(encaixarAltura);
  return (
    <div ref={areaRef} className={encaixarAltura ? 'flex h-full w-full items-center justify-center' : 'w-full'}>
      <div style={{ width: LARGURA_SLIDE * escala, height: ALTURA_SLIDE * escala }} className="overflow-hidden rounded-2xl shadow-sm">
        <div style={{ width: LARGURA_SLIDE, height: ALTURA_SLIDE, transform: `scale(${escala})`, transformOrigin: 'top left' }}>
          {conteudo}
        </div>
      </div>
    </div>
  );
}

const ID_IMPRESSAO = 'sisten-slides-impressao';

/** CSS que vale só durante a exportação: some o app, fica uma página por slide. */
const CSS_IMPRESSAO = `
@page { size: ${LARGURA_SLIDE}px ${ALTURA_SLIDE}px; margin: 0; }
@media screen { #${ID_IMPRESSAO} { position: fixed; left: -100000px; top: 0; } }
@media print {
  html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; height: auto !important; overflow: visible !important; }
  body > *:not(#${ID_IMPRESSAO}) { display: none !important; }
  #${ID_IMPRESSAO} { display: block !important; position: static !important; }
  .sisten-slide-pagina {
    width: ${LARGURA_SLIDE}px; height: ${ALTURA_SLIDE}px; overflow: hidden;
    break-after: page; page-break-after: always;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .sisten-slide-pagina:last-child { break-after: auto; page-break-after: auto; }
}`;

/**
 * Os slides na página + o modo tela cheia + exportação em PDF.
 * `nomeArquivo` vira o nome sugerido do PDF; `controles` entra à esquerda da
 * barra (ex.: seletor de dia/semana).
 */
export function ApresentacaoSlides({ slides, nomeArquivo, controles }: {
  slides: SlideDef[];
  nomeArquivo?: string;
  controles?: React.ReactNode;
}) {
  const moldura = useRef<HTMLDivElement>(null);
  const [telaCheia, setTelaCheia] = useState(false);
  const [atual, setAtual] = useState(0);
  const [imprimindo, setImprimindo] = useState(false);

  useEffect(() => {
    if (!imprimindo) return;
    const tituloAnterior = document.title;
    // O navegador sugere o título da página como nome do PDF.
    if (nomeArquivo) document.title = nomeArquivo;
    const terminar = () => {
      document.title = tituloAnterior;
      setImprimindo(false);
    };
    window.addEventListener('afterprint', terminar, { once: true });
    // Espera o portal montar e o logo/gráficos desenharem antes de abrir o diálogo.
    const t = setTimeout(() => window.print(), 400);
    return () => {
      clearTimeout(t);
      window.removeEventListener('afterprint', terminar);
      document.title = tituloAnterior;
    };
  }, [imprimindo, nomeArquivo]);

  useEffect(() => {
    const aoMudar = () => setTelaCheia(document.fullscreenElement === moldura.current && !!moldura.current);
    document.addEventListener('fullscreenchange', aoMudar);
    return () => document.removeEventListener('fullscreenchange', aoMudar);
  }, []);

  const abrir = useCallback((indice: number) => {
    setAtual(indice);
    void moldura.current?.requestFullscreen?.();
  }, []);
  const sair = useCallback(() => { if (document.fullscreenElement) void document.exitFullscreen(); }, []);
  const ir = useCallback((delta: number) => {
    setAtual(i => Math.min(slides.length - 1, Math.max(0, i + delta)));
  }, [slides.length]);

  useEffect(() => {
    if (!telaCheia) return;
    const onKey = (e: KeyboardEvent) => {
      if (['ArrowRight', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); ir(1); }
      else if (['ArrowLeft', 'PageUp'].includes(e.key)) { e.preventDefault(); ir(-1); }
      else if (e.key === 'Home') setAtual(0);
      else if (e.key === 'End') setAtual(slides.length - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [telaCheia, ir, slides.length]);

  const slideAtual = slides[Math.min(atual, slides.length - 1)];

  return (
    <>
      {/* Barra: controles da tela + exportar */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">{controles}</div>
        <button
          type="button"
          onClick={() => setImprimindo(true)}
          disabled={imprimindo}
          className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-600 bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
          title='Abre a impressão com uma página 16:9 por slide — escolha "Salvar como PDF"'
        >
          {imprimindo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />}
          Exportar PDF (paisagem)
        </button>
      </div>

      {/* Página: todos os slides, um abaixo do outro */}
      <div className="space-y-6">
        {slides.map((s, i) => (
          <section key={s.id} className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {slides.length > 1 && <span className="tabular-nums">Slide {i + 1} · </span>}{s.titulo}
              </h3>
              <button
                type="button"
                onClick={() => abrir(i)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900"
                title="Mostra só o slide na tela — para o print ou para apresentar"
              >
                <Maximize2 className="h-3.5 w-3.5" /> Tela cheia
              </button>
            </div>
            <SlideEscalado conteudo={s.conteudo} encaixarAltura={false} />
          </section>
        ))}
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          Dica: em "Tela cheia" tire o print (Win + Shift + S) — o slide tem proporção 16:9, a mesma do PowerPoint.
          Para o PDF, no diálogo de impressão escolha "Salvar como PDF".
          {slides.length > 1 && ' Use ← → para passar os slides; Esc sai.'}
        </p>
      </div>

      {/* Tela cheia: um slide por vez. Fica montado para o requestFullscreen ter alvo. */}
      <div ref={moldura} className={telaCheia ? 'relative flex h-screen w-screen items-center justify-center bg-slate-950' : ''}>
        {telaCheia && slideAtual && (
          <>
            <SlideEscalado key={slideAtual.id} conteudo={slideAtual.conteudo} encaixarAltura />
            {/* Controles discretos: somem até o mouse chegar, para não sair no print. */}
            <button
              type="button"
              onClick={sair}
              className="absolute right-3 top-3 rounded-full bg-white/10 p-2 text-white/80 opacity-0 transition-opacity hover:opacity-100"
              title="Sair da tela cheia (Esc)"
            >
              <Minimize2 className="h-4 w-4" />
            </button>
            {slides.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={() => ir(-1)}
                  disabled={atual === 0}
                  className="absolute left-0 top-0 flex h-full w-16 items-center justify-center text-white/80 opacity-0 transition-opacity hover:opacity-100 disabled:hidden"
                  aria-label="Slide anterior"
                >
                  <ChevronLeft className="h-8 w-8" />
                </button>
                <button
                  type="button"
                  onClick={() => ir(1)}
                  disabled={atual >= slides.length - 1}
                  className="absolute right-0 top-14 flex h-[calc(100%-3.5rem)] w-16 items-center justify-center text-white/80 opacity-0 transition-opacity hover:opacity-100 disabled:hidden"
                  aria-label="Próximo slide"
                >
                  <ChevronRight className="h-8 w-8" />
                </button>
              </>
            )}
          </>
        )}
      </div>

      {/* Exportação: os slides em tamanho real, só enquanto o diálogo de impressão está aberto. */}
      {imprimindo && createPortal(
        <div id={ID_IMPRESSAO} aria-hidden="true">
          <style>{CSS_IMPRESSAO}</style>
          {slides.map(s => (
            <div key={s.id} className="sisten-slide-pagina">{s.conteudo}</div>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}

/* ───────────────────────── Peças do slide (1600 × 900) ───────────────────────── */

/** Casca do slide: fundo, margens, cabeçalho, corpo e rodapé. */
export function Slide({
  rotuloSecao, titulo, ladoDireito, subtituloDireito, rodape, numero, children,
}: {
  /** Linha pequena acima do título (ex.: "SSMA · FRM.SSMA-0001"). */
  rotuloSecao: React.ReactNode;
  titulo: string;
  /** Destaque à direita do cabeçalho — normalmente o período. */
  ladoDireito?: React.ReactNode;
  subtituloDireito?: React.ReactNode;
  /** Definições do que está no slide. */
  rodape?: React.ReactNode;
  /** Ex.: "2 / 4". */
  numero?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-full w-full flex-col" style={{ background: COR_SLIDE.fundo, color: COR_SLIDE.tinta, padding: 36, gap: 18 }}>
      <header className="flex items-center justify-between" style={{ height: 72, flexShrink: 0 }}>
        <div className="flex items-center" style={{ gap: 18, minWidth: 0 }}>
          <img src="/logo-sisten.png" alt="SISTEN" style={{ height: 52, width: 'auto' }} />
          <div style={{ borderLeft: `2px solid ${COR_SLIDE.linha}`, paddingLeft: 18, minWidth: 0 }}>
            <div className="flex items-center" style={{ gap: 8, color: '#047857', fontSize: 14, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              {rotuloSecao}
            </div>
            <h2 className="font-display truncate" style={{ fontSize: 32, fontWeight: 800, lineHeight: 1.1, letterSpacing: '-0.02em' }}>
              {titulo}
            </h2>
          </div>
        </div>
        <div className="text-right" style={{ flexShrink: 0 }}>
          {ladoDireito && <p className="font-display" style={{ fontSize: 26, fontWeight: 800 }}>{ladoDireito}</p>}
          {subtituloDireito && <p style={{ fontSize: 14, color: COR_SLIDE.tinta2 }}>{subtituloDireito}</p>}
        </div>
      </header>
      <div className="flex flex-1 flex-col" style={{ gap: 18, minHeight: 0 }}>{children}</div>
      <footer className="flex items-center justify-between" style={{ fontSize: 12, color: COR_SLIDE.suave, height: 16, flexShrink: 0 }}>
        <span className="truncate">{rodape}</span>
        <span style={{ fontWeight: 700, flexShrink: 0, marginLeft: 16 }}>{numero ? `${numero} · ` : ''}SISTEN</span>
      </footer>
    </div>
  );
}

export function KpiSlide({ rotulo, valor, detalhe, cor, fundo, variacao }: {
  rotulo: string;
  valor: React.ReactNode;
  detalhe?: React.ReactNode;
  cor?: string;
  fundo?: string;
  /** Variação contra o período anterior, já formatada e colorida. */
  variacao?: { texto: string; bom: boolean } | null;
}) {
  return (
    <div className="flex flex-col justify-center rounded-2xl" style={{ background: fundo ?? '#fff', border: `1px solid ${COR_SLIDE.linha}`, padding: '14px 20px', minWidth: 0 }}>
      <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: COR_SLIDE.tinta2 }}>{rotulo}</span>
      <span className="font-display tabular-nums truncate" style={{ fontSize: 42, fontWeight: 800, lineHeight: 1.08, color: cor ?? COR_SLIDE.tinta }}>{valor}</span>
      <span className="truncate" style={{ fontSize: 13, color: COR_SLIDE.tinta2 }}>
        {variacao && (
          <strong style={{ color: variacao.bom ? '#059669' : '#e11d48', marginRight: 6 }}>{variacao.texto}</strong>
        )}
        {detalhe}
      </span>
    </div>
  );
}

export function PainelSlide({ titulo, legenda, style, children }: {
  titulo: string;
  legenda?: React.ReactNode;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col rounded-2xl" style={{ background: '#fff', border: `1px solid ${COR_SLIDE.linha}`, padding: '16px 20px', minWidth: 0, ...style }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 8, gap: 12 }}>
        <h3 style={{ fontSize: 17, fontWeight: 800 }}>{titulo}</h3>
        {legenda && <div className="flex" style={{ gap: 14, fontSize: 12, color: COR_SLIDE.tinta2 }}>{legenda}</div>}
      </div>
      <div className="flex flex-1 flex-col" style={{ minHeight: 0 }}>{children}</div>
    </section>
  );
}

export function ChipSlide({ cor, texto }: { cor: string; texto: string }) {
  return (
    <span className="inline-flex items-center" style={{ gap: 5 }}>
      <span style={{ width: 10, height: 10, borderRadius: 3, background: cor }} /> {texto}
    </span>
  );
}

/** Corpo vazio do slide (sem dado no período / carregando). */
export function SlideVazio({ texto }: { texto: string }) {
  return (
    <div className="flex flex-1 items-center justify-center rounded-2xl" style={{ background: '#fff', border: `1px solid ${COR_SLIDE.linha}`, fontSize: 22, color: COR_SLIDE.suave }}>
      {texto}
    </div>
  );
}

/** LabelList do Recharts: número dentro da barra, só quando cabe. */
export const rotuloDentroDaBarra = (props: any) => {
  const { x, y, width, height, value } = props;
  if (!value || width < 22 || height < 14) return null;
  return (
    <text x={x + width / 2} y={y + height / 2} fill="#fff" fontSize={13} fontWeight={700} textAnchor="middle" dominantBaseline="central">
      {value}
    </text>
  );
};

export interface ItemRankingSlide {
  chave: string;
  nome: string;
  valor: number;
  /** Texto à direita (padrão: o valor). */
  texto?: string;
  /** Texto cinza depois do valor (ex.: "12%"). */
  complemento?: string;
  cor?: string;
  /** Clique na linha (na página) — ex.: abrir os itens que compõem o número. */
  onClick?: () => void;
}

/** Lista com barra proporcional — mais nítida no print que um gráfico pequeno. */
export function RankingSlide({ itens, vazio = 'Sem dados no período.', corPadrao = COR_SLIDE.indigo, gap = 7 }: {
  itens: ItemRankingSlide[];
  vazio?: string;
  corPadrao?: string;
  gap?: number;
}) {
  if (itens.length === 0) return <p style={{ fontSize: 13, color: COR_SLIDE.suave }}>{vazio}</p>;
  const maior = Math.max(...itens.map(i => i.valor), 1);
  return (
    <ol className="flex flex-col" style={{ gap }}>
      {itens.map(item => (
        <li
          key={item.chave}
          onClick={item.onClick}
          className={item.onClick ? 'cursor-pointer rounded-md transition-colors hover:bg-slate-50' : undefined}
          title={item.onClick ? 'Ver os itens' : undefined}
        >
          <div className="flex items-baseline justify-between" style={{ gap: 8, fontSize: 12.5 }}>
            <span className="truncate" style={{ fontWeight: 600 }} title={item.nome}>{item.nome}</span>
            <span className="tabular-nums" style={{ fontWeight: 800, flexShrink: 0 }}>
              {item.texto ?? item.valor}
              {item.complemento && <span style={{ fontWeight: 500, color: COR_SLIDE.suave }}> · {item.complemento}</span>}
            </span>
          </div>
          <div style={{ height: 7, borderRadius: 4, background: '#f1f5f9', marginTop: 3 }}>
            <div style={{ height: '100%', width: `${Math.max(0, (item.valor / maior) * 100)}%`, borderRadius: 4, background: item.cor ?? corPadrao }} />
          </div>
        </li>
      ))}
    </ol>
  );
}
