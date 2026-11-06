/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * PDF do relatório consolidado das Solicitações Extraordinárias (Projeto e
 * Sem Saldo), aberto em Solicitação Extraordinária › Registros e na
 * Requisição no Balcão.
 *
 * - Analítico: cada material de cada solicitação, com a situação da baixa e o
 *   doc. SAP / RQB (baixado) ou o PO que ainda espera a NF.
 * - Sintético: agrupado por item, dia, semana ou mês.
 *
 * Em todos os modos o fim do relatório lista o que está pendente: o que já
 * pode ser baixado (saldo na ZL0024) e o que aguarda a NF, com o nº do PO.
 *
 * As regras ficam em `relatorioSolExtra.ts`; aqui só o desenho. A tabela é
 * própria (fonte 7, até 2 linhas por célula, cabeçalho repetido a cada
 * página) porque a `drawTable` do core corta o texto numa linha só.
 */

import type { PDFFont, RGB } from 'pdf-lib';
import {
  createDoc, docToPdfGerado, MARGIN, PDF_COLORS, PdfTextWriter, sanitizeText, wrapText, type PdfGerado,
} from './core';
import { formatQtd } from '../format';
import { formatarDataBR, hojeISO } from '../fichaEpi';
import { normalizeCode } from '../almoxarifado';
import { CODIGO_FRM_SOL_EXTRA, TIPO_SOL_EXTRA_ROTULO } from '../solicitacaoExtra';
import {
  ROTULO_AGRUPAMENTO, ROTULO_SITUACAO_ITEM, agruparPorItem, agruparPorPeriodo, fornecedoresPendenciaNf, resumirRelatorio,
  textoPendenciaNf, type AgrupamentoRelatorio, type FiltroRelatorioSolExtra, type LinhaRelatorioSolExtra, type ModoRelatorio,
  type PendenciaNfMaterial, type SituacaoItemRelatorio,
} from '../relatorioSolExtra';

export type { PdfGerado };

export interface DadosRelatorioSolExtra {
  linhas: LinhaRelatorioSolExtra[];
  /** Por material normalizado — só os que aguardam NF. */
  pendenciaNf: Map<string, PendenciaNfMaterial>;
  filtro: FiltroRelatorioSolExtra;
  /** ZL0024 usada para dizer o que já tem saldo; null = não lida. */
  estoqueImportadoEm: string | null;
  saldoLido: boolean;
  geradoPor: string;
}

export interface OpcoesRelatorioSolExtra {
  modo: ModoRelatorio;
  agrupamento: AgrupamentoRelatorio;
}

// ---------------------------------------------------------------------------
// Tabela compacta
// ---------------------------------------------------------------------------

interface Coluna {
  rotulo: string;
  largura: number;
  alinhar?: 'left' | 'right' | 'center';
  /** Linhas de texto da célula antes de cortar com "..." (padrão 2). */
  maxLinhas?: number;
}

type Linha =
  | { celulas: string[]; cores?: (RGB | undefined)[]; negrito?: boolean[] }
  | { grupo: string };

const FONTE = 7;
const ALTURA_LINHA_TEXTO = 8.5;
const PAD = 4;
const MAX_LINHAS_CELULA = 2;

/** Corta com "..." o texto que não cabe na largura. */
function cortar(texto: string, font: PDFFont, largura: number, reticencias = false): string {
  if (!reticencias && font.widthOfTextAtSize(texto, FONTE) <= largura) return texto;
  let t = texto;
  while (t.length > 1 && font.widthOfTextAtSize(`${t}...`, FONTE) > largura) t = t.slice(0, -1);
  return `${t}...`;
}

/** Quebra em até `max` linhas; a última ganha "..." se sobrar texto. Vazio fica vazio. */
function quebrar(texto: string, font: PDFFont, largura: number, max = MAX_LINHAS_CELULA): string[] {
  const limpo = sanitizeText(texto || '').replace(/\s*\n+\s*/g, ' ').trim();
  if (!limpo) return [''];
  const linhas = wrapText(limpo, font, FONTE, largura).map(l => cortar(l, font, largura));
  if (linhas.length <= max) return linhas;
  const corte = linhas.slice(0, max);
  corte[max - 1] = cortar(corte[max - 1], font, largura, true);
  return corte;
}

function desenharTabela(w: PdfTextWriter, colunas: Coluna[], linhas: Linha[]) {
  if (!linhas.length) return;
  const largura = w.getContentWidth();
  const soma = colunas.reduce((s, c) => s + c.largura, 0);
  const escala = soma > largura ? largura / soma : 1;
  const cols = colunas.map(c => ({ ...c, largura: c.largura * escala }));
  const font = w.getFont();
  const bold = w.getFontBold();
  const alturaCabecalho = 15;

  const cabecalho = () => {
    const page = w.getPage();
    const y = w.getY();
    page.drawRectangle({ x: MARGIN, y: y - alturaCabecalho, width: largura, height: alturaCabecalho, color: PDF_COLORS.tableHeaderBg });
    let x = MARGIN;
    for (const c of cols) {
      const t = cortar(sanitizeText(c.rotulo), bold, c.largura - PAD * 2);
      const tw = bold.widthOfTextAtSize(t, FONTE);
      const tx = c.alinhar === 'right' ? x + c.largura - tw - PAD : c.alinhar === 'center' ? x + (c.largura - tw) / 2 : x + PAD;
      page.drawText(t, { x: tx, y: y - 10, size: FONTE, font: bold, color: PDF_COLORS.cardBg });
      x += c.largura;
    }
    w.setY(y - alturaCabecalho);
  };

  w.ensureSpace(alturaCabecalho + 24);
  cabecalho();

  let zebra = 0;
  for (const linha of linhas) {
    if ('grupo' in linha) {
      const altura = 14;
      const paginaAntes = w.getPage();
      w.ensureSpace(altura + 14);
      if (w.getPage() !== paginaAntes) cabecalho();
      const page = w.getPage();
      const y = w.getY();
      page.drawRectangle({ x: MARGIN, y: y - altura, width: largura, height: altura, color: PDF_COLORS.badgeBlueBg });
      const [texto] = quebrar(linha.grupo, bold, largura - PAD * 2, 1);
      page.drawText(texto, { x: MARGIN + PAD, y: y - 10, size: FONTE + 0.5, font: bold, color: PDF_COLORS.primaryNavy });
      w.setY(y - altura);
      zebra = 0;
      continue;
    }

    const quebradas = cols.map((c, i) => quebrar(linha.celulas[i] ?? '', linha.negrito?.[i] ? bold : font, c.largura - PAD * 2, c.maxLinhas));
    const nLinhas = Math.max(1, ...quebradas.map(q => q.length));
    const altura = nLinhas * ALTURA_LINHA_TEXTO + 5;
    const paginaAntes = w.getPage();
    w.ensureSpace(altura);
    if (w.getPage() !== paginaAntes) cabecalho();
    const page = w.getPage();
    const y = w.getY();
    if (zebra++ % 2 === 1) page.drawRectangle({ x: MARGIN, y: y - altura, width: largura, height: altura, color: PDF_COLORS.tableRowAlt });
    page.drawLine({ start: { x: MARGIN, y: y - altura }, end: { x: MARGIN + largura, y: y - altura }, thickness: 0.4, color: PDF_COLORS.borderLight });

    let x = MARGIN;
    cols.forEach((c, i) => {
      const f = linha.negrito?.[i] ? bold : font;
      const cor = linha.cores?.[i] ?? PDF_COLORS.darkText;
      quebradas[i].forEach((t, j) => {
        const tw = f.widthOfTextAtSize(t, FONTE);
        const tx = c.alinhar === 'right' ? x + c.largura - tw - PAD : c.alinhar === 'center' ? x + (c.largura - tw) / 2 : x + PAD;
        page.drawText(t, { x: tx, y: y - 8 - j * ALTURA_LINHA_TEXTO, size: FONTE, font: f, color: cor });
      });
      x += c.largura;
    });
    w.setY(y - altura);
  }
  w.spacer(10);
}

// ---------------------------------------------------------------------------
// Textos
// ---------------------------------------------------------------------------

const COR_SITUACAO: Record<SituacaoItemRelatorio, RGB> = {
  baixado: PDF_COLORS.badgeGreenText,
  liberado: PDF_COLORS.badgeBlueText,
  aguardando_nf: PDF_COLORS.badgeAmberText,
  pendente: PDF_COLORS.bodyText,
};

const qtd = (n: number, un?: string) => (n ? `${formatQtd(n)}${un ? ` ${un}` : ''}` : '-');

function descreverFiltro(f: FiltroRelatorioSolExtra): string {
  if (f.de && f.ate) return `${formatarDataBR(f.de)} a ${formatarDataBR(f.ate)}`;
  if (f.de) return `A partir de ${formatarDataBR(f.de)}`;
  if (f.ate) return `Até ${formatarDataBR(f.ate)}`;
  return 'Todo o histórico';
}

const rotuloModo = (o: OpcoesRelatorioSolExtra) =>
  o.modo === 'analitico' ? 'Analítico (detalhado)' : `Sintético — ${ROTULO_AGRUPAMENTO[o.agrupamento].toLowerCase()}`;

/** Coluna "Baixa / PO" do analítico. */
function baixaOuPo(l: LinhaRelatorioSolExtra, pendenciaNf: Map<string, PendenciaNfMaterial>): string {
  if (l.situacao === 'baixado') return l.baixa ? `${l.tipo === 'SEM_SALDO' ? 'RQB' : 'Doc.'} ${l.baixa}` : '-';
  if (l.situacao === 'aguardando_nf') return textoPendenciaNf(pendenciaNf.get(normalizeCode(l.material)));
  if (l.situacao === 'liberado') return l.tipo === 'SEM_SALDO' ? 'Confirmar RQB no Balcão' : 'Regularizar no SAP';
  return '-';
}

// ---------------------------------------------------------------------------
// Seções
// ---------------------------------------------------------------------------

function secaoAnalitica(w: PdfTextWriter, d: DadosRelatorioSolExtra) {
  w.drawSectionHeader('Lançamentos — analítico', `${d.linhas.length} itens`);
  let anterior = '';
  desenharTabela(
    w,
    [
      { rotulo: 'Código', largura: 60 },
      { rotulo: 'Data', largura: 44 },
      { rotulo: 'Projeto / retirada', largura: 76 },
      { rotulo: 'Material', largura: 46 },
      { rotulo: 'Descrição', largura: 100 },
      { rotulo: 'Quant.', largura: 42, alinhar: 'right' },
      { rotulo: 'Situação', largura: 58 },
      { rotulo: 'Baixa / PO aguard. NF', largura: 90, maxLinhas: 3 },
    ],
    d.linhas.map(l => {
      const primeiro = l.registroId !== anterior;
      anterior = l.registroId;
      const ref = [l.referencia, l.detalhe].filter(Boolean).join(' — ');
      return {
        celulas: [
          primeiro ? l.codigo : '',
          primeiro ? formatarDataBR(l.data) : '',
          primeiro ? ref || TIPO_SOL_EXTRA_ROTULO[l.tipo] : '',
          l.material,
          l.descricao,
          qtd(l.quantidade, l.unidade),
          ROTULO_SITUACAO_ITEM[l.situacao],
          baixaOuPo(l, d.pendenciaNf),
        ],
        negrito: [primeiro, false, false, false, false, false, true, false],
        cores: [PDF_COLORS.primaryNavy, undefined, undefined, undefined, undefined, undefined, COR_SITUACAO[l.situacao], undefined],
      };
    }),
  );
}

function secaoPorItem(w: PdfTextWriter, d: DadosRelatorioSolExtra) {
  const grupos = agruparPorItem(d.linhas);
  w.drawSectionHeader('Consolidado por item', `${grupos.length} materiais`);
  desenharTabela(
    w,
    [
      { rotulo: 'Material', largura: 48 },
      { rotulo: 'Descrição', largura: 122 },
      { rotulo: 'Un.', largura: 24, alinhar: 'center' },
      { rotulo: 'Lanç.', largura: 28, alinhar: 'right' },
      { rotulo: 'Total', largura: 44, alinhar: 'right' },
      { rotulo: 'Baixado', largura: 44, alinhar: 'right' },
      { rotulo: 'Liberado', largura: 44, alinhar: 'right' },
      { rotulo: 'Aguard. NF', largura: 46, alinhar: 'right' },
      { rotulo: 'PO aguardando NF', largura: 115, maxLinhas: 3 },
    ],
    grupos.map(g => {
      const aguardando = g.qtd.aguardando_nf + g.qtd.pendente;
      return {
        celulas: [
          g.material, g.descricao, g.unidade, String(g.lancamentos), qtd(g.quantidade), qtd(g.qtd.baixado), qtd(g.qtd.liberado),
          qtd(aguardando), g.qtd.aguardando_nf > 0 ? textoPendenciaNf(d.pendenciaNf.get(normalizeCode(g.material))) : '-',
        ],
        negrito: [true, false, false, false, true, false, false, aguardando > 0, false],
        cores: [undefined, undefined, undefined, undefined, undefined, PDF_COLORS.badgeGreenText, PDF_COLORS.badgeBlueText, PDF_COLORS.badgeAmberText, undefined],
      };
    }),
  );
}

function secaoPorPeriodo(w: PdfTextWriter, d: DadosRelatorioSolExtra, agrupamento: Exclude<AgrupamentoRelatorio, 'item'>) {
  const grupos = agruparPorPeriodo(d.linhas, agrupamento);
  const nome = { dia: 'dia', semana: 'semana', mes: 'mês' }[agrupamento];

  w.drawSectionHeader(`Resumo por ${nome}`, grupos.length);
  desenharTabela(
    w,
    [
      { rotulo: agrupamento === 'semana' ? 'Semana' : agrupamento === 'mes' ? 'Mês' : 'Dia', largura: 165 },
      { rotulo: 'Lançamentos', largura: 60, alinhar: 'right' },
      { rotulo: 'Itens', largura: 50, alinhar: 'right' },
      { rotulo: 'Baixados', largura: 60, alinhar: 'right' },
      { rotulo: 'Liberados p/ baixa', largura: 90, alinhar: 'right' },
      { rotulo: 'Aguardando NF', largura: 90, alinhar: 'right' },
    ],
    grupos.map(g => ({
      celulas: [
        g.rotulo, String(g.lancamentos), String(g.totalItens), String(g.itens.baixado || '-'),
        String(g.itens.liberado || '-'), String(g.itens.aguardando_nf + g.itens.pendente || '-'),
      ],
      negrito: [true, false, false, false, false, g.itens.aguardando_nf + g.itens.pendente > 0],
      cores: [undefined, undefined, undefined, PDF_COLORS.badgeGreenText, PDF_COLORS.badgeBlueText, PDF_COLORS.badgeAmberText],
    })),
  );

  w.drawSectionHeader(`Materiais por ${nome}`);
  const linhas: Linha[] = [];
  for (const g of grupos) {
    linhas.push({ grupo: `${g.rotulo} — ${g.lancamentos} lançamento(s), ${g.totalItens} item(ns)` });
    for (const m of g.materiais) {
      const pendente = m.qtd.liberado + m.qtd.aguardando_nf + m.qtd.pendente;
      linhas.push({
        celulas: [m.material, m.descricao, m.unidade, String(m.lancamentos), qtd(m.quantidade), qtd(m.qtd.baixado), qtd(pendente)],
        negrito: [true, false, false, false, true, false, pendente > 0],
        cores: [undefined, undefined, undefined, undefined, undefined, PDF_COLORS.badgeGreenText, PDF_COLORS.badgeAmberText],
      });
    }
  }
  desenharTabela(
    w,
    [
      { rotulo: 'Material', largura: 55 },
      { rotulo: 'Descrição', largura: 215 },
      { rotulo: 'Un.', largura: 30, alinhar: 'center' },
      { rotulo: 'Lanç.', largura: 35, alinhar: 'right' },
      { rotulo: 'Total', largura: 60, alinhar: 'right' },
      { rotulo: 'Baixado', largura: 60, alinhar: 'right' },
      { rotulo: 'Pendente', largura: 60, alinhar: 'right' },
    ],
    linhas,
  );
}

function secaoPendencias(w: PdfTextWriter, d: DadosRelatorioSolExtra) {
  const aguardando = d.linhas.filter(l => l.situacao === 'aguardando_nf');
  const liberados = d.linhas.filter(l => l.situacao === 'liberado');
  const semLeitura = d.linhas.filter(l => l.situacao === 'pendente');
  if (!aguardando.length && !liberados.length && !semLeitura.length) {
    w.drawCallout('Sem pendências', 'Todas as solicitações do recorte já foram baixadas / regularizadas.');
    return;
  }

  if (aguardando.length) {
    w.drawSectionHeader('Pendente de liberar para baixa — aguardando a NF', `${aguardando.length} itens`);
    desenharTabela(
      w,
      [
        { rotulo: 'Código', largura: 60 },
        { rotulo: 'Data', largura: 44 },
        { rotulo: 'Material', largura: 46 },
        { rotulo: 'Descrição', largura: 102 },
        { rotulo: 'Quant.', largura: 42, alinhar: 'right' },
        { rotulo: 'PO aguardando NF', largura: 135, maxLinhas: 3 },
        { rotulo: 'Fornecedor', largura: 86 },
      ],
      aguardando.map(l => {
        const p = d.pendenciaNf.get(normalizeCode(l.material));
        return {
          celulas: [l.codigo, formatarDataBR(l.data), l.material, l.descricao, qtd(l.quantidade, l.unidade), textoPendenciaNf(p), fornecedoresPendenciaNf(p) || '-'],
          negrito: [true, false, false, false, false, true, false],
          cores: [PDF_COLORS.primaryNavy, undefined, undefined, undefined, undefined, p?.pedidos.length ? PDF_COLORS.badgeAmberText : PDF_COLORS.badgeRedText, undefined],
        };
      }),
    );
  }

  if (liberados.length) {
    w.drawSectionHeader('Liberado para baixa — já tem saldo na ZL0024', `${liberados.length} itens`);
    desenharTabela(
      w,
      [
        { rotulo: 'Código', largura: 60 },
        { rotulo: 'Data', largura: 44 },
        { rotulo: 'Tipo', largura: 44 },
        { rotulo: 'Material', largura: 46 },
        { rotulo: 'Descrição', largura: 154 },
        { rotulo: 'Quant.', largura: 45, alinhar: 'right' },
        { rotulo: 'Próximo passo', largura: 122 },
      ],
      liberados.map(l => ({
        celulas: [
          l.codigo, formatarDataBR(l.data), TIPO_SOL_EXTRA_ROTULO[l.tipo], l.material, l.descricao, qtd(l.quantidade, l.unidade),
          l.tipo === 'SEM_SALDO' ? 'Confirmar a RQB pendente no Balcão' : 'Regularizar com o doc. SAP',
        ],
        negrito: [true, false, false, false, false, false, false],
        cores: [PDF_COLORS.primaryNavy, undefined, undefined, undefined, undefined, undefined, PDF_COLORS.badgeBlueText],
      })),
    );
  }

  if (semLeitura.length) {
    w.drawCallout(
      'Saldo não verificado',
      `${semLeitura.length} item(ns) pendente(s) sem a situação de saldo: a ZL0024 não pôde ser lida ao gerar o relatório. Gere de novo com conexão para separar o que já está liberado do que aguarda NF.`,
    );
  }
}

// ---------------------------------------------------------------------------
// Documento
// ---------------------------------------------------------------------------

export async function gerarRelatorioSolExtraPdf(d: DadosRelatorioSolExtra, o: OpcoesRelatorioSolExtra): Promise<PdfGerado> {
  const { doc, font, fontBold, logo } = await createDoc();
  const w = new PdfTextWriter(doc, font, fontBold, logo);
  const resumo = resumirRelatorio(d.linhas);
  const pendentes = resumo.itens.liberado + resumo.itens.aguardando_nf + resumo.itens.pendente;

  w.drawDocumentHeader({
    title: 'Relatório de Solicitações Extraordinárias',
    formCode: CODIGO_FRM_SOL_EXTRA,
    emissionDate: new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }),
  });

  w.drawInfoGrid(
    [
      { label: 'Período', value: descreverFiltro(d.filtro) },
      { label: 'Tipo', value: d.filtro.tipo === 'todos' ? 'Projeto e Sem saldo' : TIPO_SOL_EXTRA_ROTULO[d.filtro.tipo] },
      { label: 'Situação', value: d.filtro.status === 'todos' ? 'Todas' : d.filtro.status === 'PENDENTE' ? 'Só pendentes' : 'Só baixadas' },
      { label: 'Modo', value: rotuloModo(o) },
      {
        label: 'Saldo (ZL0024)',
        value: d.saldoLido
          ? d.estoqueImportadoEm ? `Importada em ${new Date(d.estoqueImportadoEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}` : 'Última importação'
          : 'Não lida',
      },
      { label: 'Gerado por', value: d.geradoPor || '-' },
    ],
    3,
  );

  w.drawSectionHeader('Resumo');
  w.drawInfoGrid(
    [
      { label: 'Lançamentos', value: `${resumo.lancamentos} (${resumo.projeto} projeto, ${resumo.semSaldo} sem saldo)`, highlight: true },
      { label: 'Itens lançados', value: String(resumo.totalItens), highlight: true },
      { label: 'Baixados / regularizados', value: String(resumo.itens.baixado) },
      { label: 'Liberados para baixa', value: String(resumo.itens.liberado), highlight: resumo.itens.liberado > 0 },
      { label: 'Aguardando NF', value: String(resumo.itens.aguardando_nf + resumo.itens.pendente), highlight: resumo.itens.aguardando_nf > 0 },
      { label: 'Pendentes no total', value: String(pendentes) },
    ],
    3,
  );

  if (!d.linhas.length) {
    w.drawCallout('Nada lançado', 'Nenhuma solicitação extraordinária no recorte escolhido.');
  } else {
    if (o.modo === 'analitico') secaoAnalitica(w, d);
    else if (o.agrupamento === 'item') secaoPorItem(w, d);
    else secaoPorPeriodo(w, d, o.agrupamento);
    secaoPendencias(w, d);
  }

  w.drawCallout(
    'Como ler',
    'Liberado p/ baixa: a ZL0024 de hoje já cobre o item (o saldo é repartido entre as pendentes da mais antiga para a mais nova, como na tela). ' +
      'Aguardando NF: sem saldo ainda; o PO mostrado é o pedido do material na ZL0132 com quantidade por entrar ("chegou s/ MIGO" = conferido no almoxarifado, falta a MIGO). ' +
      'Código SEM = de Projeto (regulariza com doc. SAP); RSS = Sem saldo (baixa pela Requisição no Balcão).',
  );

  w.finalizeDoc(CODIGO_FRM_SOL_EXTRA);
  const sufixo = o.modo === 'analitico' ? 'analitico' : `sintetico-${o.agrupamento}`;
  return docToPdfGerado(doc, `relatorio-solicitacoes-extraordinarias-${sufixo}-${hojeISO()}.pdf`, 'Relatório de Solicitações Extraordinárias');
}
