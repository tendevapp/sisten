/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Admin > Equipes — relatórios em PDF, comparando com o HISTÓRICO (o período
 * escolhido contra os anteriores equivalentes), nunca com colegas.
 *
 * - Equipe (para o gestor): evolução das ações, indicadores por processo
 *   (atual × anterior × média dos anteriores), ações por colaborador no
 *   período e no anterior, volume por dia e por hora.
 * - Individual (entregue ao colaborador): evolução dos principais
 *   indicadores em gráfico, o que melhorou e o que piorou em relação ao
 *   período anterior, tabelas por processo, volume, plano de ação e
 *   assinaturas. Sem roteiro de conversa — é o documento que fica com a pessoa.
 *
 * O uso do SISTEN (dias ativos, sessões, jornada) fica só na tela.
 */

import type { RGB } from 'pdf-lib';
import { createDoc, docToPdfGerado, MARGIN, PDF_COLORS, PdfTextWriter, sanitizeText, type PdfGerado } from './core';
import {
  INDICADORES, PROCESSOS, acoesPorJanela, dataBr, diaDoEvento, ehAcao, formatarIndicador, historicoIndicadores, naJanela,
  porHora, processosDaEquipe, semHistorico, serieDiaria,
  type DefIndicador, type EventoEquipe, type HistoricoIndicador, type Janela, type PessoaEquipe, type Tendencia,
} from '../equipes';

export interface ContextoRelatorioEquipe {
  equipe: string;
  setor: string;
  /** Janelas do histórico, da mais antiga à atual (a última é o período do relatório). */
  janelas: Janela[];
  membros: PessoaEquipe[];
  /** Eventos da equipe em todo o histórico. */
  eventos: EventoEquipe[];
  geradoPor: string;
}

const FORM = 'SISTEN-EQUIPES';

const ROTULO_TENDENCIA: Record<Tendencia, string> = {
  melhorou: 'Melhorou', piorou: 'Piorou', estavel: 'Estável', sem_base: 'Sem base', neutro: '-',
};
const COR_TENDENCIA: Partial<Record<Tendencia, RGB>> = {
  melhorou: PDF_COLORS.badgeGreenText, piorou: PDF_COLORS.badgeRedText,
};

const comoLer = (n: number) =>
  `Os números vêm do que foi registrado no SISTEN (quem fez e quando). Cada indicador é comparado com o período anterior ` +
  `equivalente e com a média dos ${n - 1} anteriores (no período em curso, as mesmas datas dos anteriores). Melhorou ou piorou = ` +
  `diferença de 10% ou mais para o período anterior; em tempos, menor é melhor. Valor comprado, NCs e entregas no prazo aparecem ` +
  `sem julgamento (dependem da demanda ou do fornecedor). A carteira é a foto de hoje. São fatos para conversar, não uma nota.`;

function periodoTexto(j: Pick<Janela, 'de' | 'ate'>) {
  return j.de === j.ate ? dataBr(j.de) : `${dataBr(j.de)} a ${dataBr(j.ate)}`;
}

const pctTxt = (v: number | null) => (v == null ? '-' : `${v > 0 ? '+' : ''}${(v * 100).toFixed(0)}%`);

/** Processos de trabalho com algum evento no histórico (sem o uso do SISTEN). */
function processosComDados(setor: string, eventos: readonly EventoEquipe[]) {
  return processosDaEquipe(setor).filter(p => p.id !== 'uso' && eventos.some(e => p.tipos.includes(e.t)));
}

const noPdf = (i: DefIndicador) => i.processo !== 'uso';

// ---------------------------------------------------------------------------
// Gráficos (desenhados direto no PDF)
// ---------------------------------------------------------------------------

interface OpcoesColunas {
  x?: number;
  largura?: number;
  altura?: number;
  titulo?: string;
  /** Pinta a última coluna (o período atual) em destaque. */
  destacarUltima?: boolean;
  formatar?: (v: number) => string;
  /** Não avança o cursor (para pôr dois gráficos lado a lado). */
  manterY?: boolean;
}

/** Colunas verticais com o valor em cima. Devolve a altura ocupada. */
function graficoColunas(w: PdfTextWriter, itens: { rotulo: string; valor: number | null }[], o: OpcoesColunas = {}): number {
  const largura = o.largura ?? w.getContentWidth();
  const x0 = o.x ?? MARGIN;
  const altura = o.altura ?? 90;
  const titulo = o.titulo ? 12 : 0;
  const total = titulo + altura + 14;
  if (!o.manterY) w.ensureSpace(total + 6);
  const page = w.getPage();
  const font = w.getFont();
  const fontBold = w.getFontBold();
  const topo = w.getY();
  if (o.titulo) page.drawText(sanitizeText(o.titulo), { x: x0, y: topo - 9, size: 7.5, font: fontBold, color: PDF_COLORS.darkText });
  const base = topo - titulo - altura;
  const valores = itens.map(i => i.valor ?? 0);
  const max = Math.max(1e-9, ...valores);
  const passo = largura / Math.max(1, itens.length);
  const barra = Math.max(2, Math.min(26, passo * 0.66));
  const cadaRotulo = Math.max(1, Math.ceil(itens.length / 16));
  const fmt = o.formatar ?? ((v: number) => v.toLocaleString('pt-BR'));

  page.drawLine({ start: { x: x0, y: base }, end: { x: x0 + largura, y: base }, thickness: 0.6, color: PDF_COLORS.cardBorder });
  itens.forEach((it, i) => {
    const x = x0 + i * passo + (passo - barra) / 2;
    const v = it.valor ?? 0;
    const h = (v / max) * (altura - 14);
    const ultima = o.destacarUltima && i === itens.length - 1;
    if (h > 0) page.drawRectangle({ x, y: base, width: barra, height: h, color: ultima ? PDF_COLORS.primaryNavy : PDF_COLORS.accentBlue });
    if (it.valor != null && v > 0 && itens.length <= 31) {
      const t = sanitizeText(fmt(v));
      page.drawText(t, { x: x + barra / 2 - font.widthOfTextAtSize(t, 6) / 2, y: base + h + 2, size: 6, font: ultima ? fontBold : font, color: PDF_COLORS.bodyText });
    }
    if (i % cadaRotulo === 0) {
      const r = sanitizeText(it.rotulo);
      page.drawText(r, { x: x + barra / 2 - font.widthOfTextAtSize(r, 6) / 2, y: base - 9, size: 6, font: ultima ? fontBold : font, color: PDF_COLORS.mutedLabel });
    }
  });
  if (!o.manterY) w.setY(base - 18);
  return total;
}

/** Pequenos gráficos de evolução, dois por linha, para os indicadores dados. */
function graficosEvolucao(w: PdfTextWriter, historicos: HistoricoIndicador[], janelas: Janela[]) {
  const largura = (w.getContentWidth() - 20) / 2;
  for (let k = 0; k < historicos.length; k += 2) {
    const par = historicos.slice(k, k + 2);
    w.ensureSpace(12 + 70 + 14 + 10);
    let usado = 0;
    par.forEach((h, idx) => {
      const titulo = `${h.indicador.rotulo}${h.variacao != null ? ` (${pctTxt(h.variacao)} vs. anterior)` : ''}`;
      usado = Math.max(usado, graficoColunas(w, janelas.map((j, i) => ({ rotulo: j.rotulo, valor: h.valores[i] })), {
        x: MARGIN + idx * (largura + 20), largura, altura: 70, titulo, destacarUltima: true, manterY: true,
        formatar: v => formatarIndicador(v, h.indicador.formato),
      }));
    });
    w.setY(w.getY() - usado - 8);
  }
}

// ---------------------------------------------------------------------------
// Tabelas
// ---------------------------------------------------------------------------

function tabelaHistorico(w: PdfTextWriter, historicos: HistoricoIndicador[], n: number) {
  w.drawTable(
    [
      { label: 'Indicador', width: 160 },
      { label: 'Atual', width: 72, align: 'right' },
      { label: 'Anterior', width: 72, align: 'right' },
      { label: 'Variação', width: 50, align: 'right' },
      { label: `Média ${n - 1} ant.`, width: 72, align: 'right' },
      { label: 'Tendência', width: 60 },
    ],
    historicos.map(h => [
      h.indicador.rotulo,
      formatarIndicador(h.atual, h.indicador.formato),
      semHistorico(h.indicador) ? 'foto de hoje' : formatarIndicador(h.anterior, h.indicador.formato),
      semHistorico(h.indicador) ? '-' : pctTxt(h.variacao),
      semHistorico(h.indicador) ? '-' : formatarIndicador(h.mediaAnteriores, h.indicador.formato),
      ROTULO_TENDENCIA[h.tendencia],
    ]),
    (row, col) => (col === 5 || col === 3 ? COR_TENDENCIA[historicos[row].tendencia] : undefined),
  );
}

function desenharVolumeDoPeriodo(w: PdfTextWriter, eventos: readonly EventoEquipe[], j: Janela) {
  const serie = serieDiaria(eventos, j.de, j.ate);
  if (serie.length < 2 || serie.every(s => s.acoes === 0)) return;
  const itens = serie.length <= 31
    ? serie.map(s => ({ rotulo: dataBr(s.dia).slice(0, 5), valor: s.acoes }))
    : Array.from({ length: Math.ceil(serie.length / 7) }, (_, i) => {
      const bloco = serie.slice(i * 7, i * 7 + 7);
      return { rotulo: dataBr(bloco[0].dia).slice(0, 5), valor: bloco.reduce((s, b) => s + b.acoes, 0) };
    });
  w.drawSectionHeader(serie.length <= 31 ? 'Ações por dia no período' : 'Ações por semana no período');
  graficoColunas(w, itens);
}

function desenharPorHora(w: PdfTextWriter, eventos: readonly EventoEquipe[]) {
  const horas = porHora(eventos);
  if (horas.every(h => h === 0)) return;
  const usadas = horas.map((valor, h) => ({ h, valor }));
  const ini = Math.min(6, usadas.findIndex(x => x.valor > 0));
  const fim = Math.max(19, 23 - [...usadas].reverse().findIndex(x => x.valor > 0));
  w.drawSectionHeader('Ações por hora do dia (período)');
  graficoColunas(w, usadas.slice(ini, fim + 1).map(x => ({ rotulo: `${String(x.h).padStart(2, '0')}h`, valor: x.valor })));
}

// ---------------------------------------------------------------------------
// Relatório da equipe
// ---------------------------------------------------------------------------

export async function gerarRelatorioEquipePdf(ctx: ContextoRelatorioEquipe): Promise<PdfGerado> {
  const { doc, font, fontBold, logo } = await createDoc();
  const w = new PdfTextWriter(doc, font, fontBold, logo);
  const atual = ctx.janelas[ctx.janelas.length - 1];
  const anterior = ctx.janelas[ctx.janelas.length - 2] ?? null;
  const doPeriodo = ctx.eventos.filter(e => naJanela(e, atual));
  const acoes = acoesPorJanela(ctx.eventos, ctx.janelas);
  const acoesAtual = acoes[acoes.length - 1];
  const acoesAnterior = acoes.length > 1 ? acoes[acoes.length - 2] : null;

  w.drawDocumentHeader({ title: `Relatório da equipe — ${ctx.equipe}`, formCode: FORM, protocol: periodoTexto(atual) });
  w.drawInfoGrid([
    { label: 'Equipe', value: ctx.equipe },
    { label: 'Período', value: periodoTexto(atual) },
    { label: 'Ações no período', value: acoesAtual.toLocaleString('pt-BR'), highlight: true },
    { label: 'Período anterior', value: anterior ? `${(acoesAnterior ?? 0).toLocaleString('pt-BR')} ações (${periodoTexto(anterior)})` : '-' },
    { label: 'Colaboradores', value: String(ctx.membros.length) },
    { label: 'Gerado por', value: `${ctx.geradoPor} em ${new Date().toLocaleString('pt-BR')}` },
  ], 2);

  w.drawSectionHeader('Evolução das ações', `${ctx.janelas.length} períodos`);
  graficoColunas(w, ctx.janelas.map((j, i) => ({ rotulo: j.rotulo, valor: acoes[i] })), { destacarUltima: true });

  for (const p of processosComDados(ctx.setor, ctx.eventos)) {
    const historicos = historicoIndicadores(ctx.eventos, ctx.janelas, INDICADORES.filter(i => i.processo === p.id));
    w.drawSectionHeader(p.rotulo);
    tabelaHistorico(w, historicos, ctx.janelas.length);
  }

  // Ações por colaborador: período e anterior (sem ranking — ordem alfabética).
  const linhas = ctx.membros
    .map(m => {
      const ev = ctx.eventos.filter(e => e.u === m.id && ehAcao(e));
      const a = ev.filter(e => naJanela(e, atual)).length;
      const b = anterior ? ev.filter(e => naJanela(e, anterior)).length : null;
      return { nome: m.nome, a, b };
    })
    .filter(l => l.a > 0 || (l.b ?? 0) > 0)
    .sort((x, y) => x.nome.localeCompare(y.nome, 'pt-BR'));
  if (linhas.length > 0) {
    w.drawSectionHeader('Ações por colaborador', linhas.length);
    w.drawTable(
      [{ label: 'Colaborador', width: 215 }, { label: 'Período', width: 100, align: 'right' }, { label: 'Anterior', width: 100, align: 'right' }, { label: 'Variação', width: 100, align: 'right' }],
      linhas.map(l => [l.nome, l.a.toLocaleString('pt-BR'), l.b == null ? '-' : l.b.toLocaleString('pt-BR'), l.b ? pctTxt((l.a - l.b) / l.b) : '-']),
    );
  }

  desenharVolumeDoPeriodo(w, doPeriodo, atual);
  desenharPorHora(w, doPeriodo);
  w.drawCallout('Como ler este relatório', comoLer(ctx.janelas.length));
  w.drawSignatures([{ role: 'Responsável pela equipe' }, { role: 'Gestor' }]);
  w.finalizeDoc(FORM);
  return docToPdfGerado(doc, `equipe_${ctx.equipe.toLowerCase().replace(/\W+/g, '_')}_${atual.de}_${atual.ate}.pdf`, `Relatório da equipe ${ctx.equipe}`);
}

// ---------------------------------------------------------------------------
// Relatório individual (entregue ao colaborador)
// ---------------------------------------------------------------------------

export async function gerarRelatorioColaboradorPdf(ctx: ContextoRelatorioEquipe, pessoaId: string): Promise<PdfGerado> {
  const { doc, font, fontBold, logo } = await createDoc();
  const w = new PdfTextWriter(doc, font, fontBold, logo);
  const pessoa = ctx.membros.find(m => m.id === pessoaId);
  if (!pessoa) throw new Error('Colaborador fora da equipe selecionada.');
  const atual = ctx.janelas[ctx.janelas.length - 1];
  const eventosPessoa = ctx.eventos.filter(e => e.u === pessoaId);
  const doPeriodo = eventosPessoa.filter(e => naJanela(e, atual));
  const processos = processosComDados(ctx.setor, eventosPessoa);
  const historicos = historicoIndicadores(eventosPessoa, ctx.janelas, INDICADORES.filter(i => noPdf(i) && processos.some(p => p.id === i.processo)));
  const acoes = acoesPorJanela(eventosPessoa, ctx.janelas);

  w.drawDocumentHeader({ title: 'Relatório individual de indicadores', formCode: FORM, protocol: periodoTexto(atual) });
  w.drawInfoGrid([
    { label: 'Colaborador', value: pessoa.nome, highlight: true },
    { label: 'Cargo', value: pessoa.cargo || '-' },
    { label: 'Equipe', value: ctx.equipe },
    { label: 'Período', value: periodoTexto(atual) },
    { label: 'Ações no período', value: acoes[acoes.length - 1].toLocaleString('pt-BR') },
    { label: 'Dias com atividade', value: String(new Set(doPeriodo.filter(ehAcao).map(diaDoEvento)).size) },
  ], 2);

  // Evolução: ações e os indicadores principais com histórico e algum valor.
  w.drawSectionHeader('Sua evolução', `${ctx.janelas.length} períodos`);
  graficoColunas(w, ctx.janelas.map((j, i) => ({ rotulo: j.rotulo, valor: acoes[i] })), { titulo: 'Ações registradas', destacarUltima: true, altura: 70 });
  const evolucao = historicos.filter(h => h.indicador.principal && !semHistorico(h.indicador) && h.valores.some(v => (v ?? 0) > 0)).slice(0, 6);
  graficosEvolucao(w, evolucao, ctx.janelas);

  const texto = (lista: HistoricoIndicador[]) => lista.map(h =>
    `• ${PROCESSOS.find(p => p.id === h.indicador.processo)?.rotulo} — ${h.indicador.rotulo}: ${formatarIndicador(h.atual, h.indicador.formato)} `
    + `(anterior ${formatarIndicador(h.anterior, h.indicador.formato)}; média dos anteriores ${formatarIndicador(h.mediaAnteriores, h.indicador.formato)})`).join('\n');
  const melhorou = historicos.filter(h => h.tendencia === 'melhorou');
  const piorou = historicos.filter(h => h.tendencia === 'piorou');
  w.drawCallout('O que melhorou em relação ao período anterior', melhorou.length ? texto(melhorou) : 'Nenhum indicador com melhora de 10% ou mais.');
  w.drawCallout('O que pede atenção (piorou 10% ou mais)', piorou.length ? texto(piorou) : 'Nenhum indicador com piora de 10% ou mais.');

  for (const p of processos) {
    w.drawSectionHeader(p.rotulo);
    tabelaHistorico(w, historicos.filter(h => h.indicador.processo === p.id), ctx.janelas.length);
  }

  desenharVolumeDoPeriodo(w, doPeriodo, atual);
  desenharPorHora(w, doPeriodo);
  w.drawCallout('Como ler estes números', comoLer(ctx.janelas.length));

  w.drawSectionHeader('Plano de ação combinado');
  w.drawTable(
    [{ label: 'Ação', width: 290 }, { label: 'Responsável', width: 125 }, { label: 'Prazo', width: 100 }],
    Array.from({ length: 4 }, () => [' ', ' ', ' ']),
  );
  w.drawSignatures([{ role: 'Colaborador', name: pessoa.nome }, { role: 'Gestor' }]);
  w.finalizeDoc(FORM);
  return docToPdfGerado(doc, `indicadores_${pessoa.nome.toLowerCase().replace(/\W+/g, '_')}_${atual.de}_${atual.ate}.pdf`, `Indicadores — ${pessoa.nome}`);
}
