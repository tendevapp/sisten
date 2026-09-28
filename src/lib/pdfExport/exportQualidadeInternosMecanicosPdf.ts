/**
 * PDF do Checklist de Internos Mecânicos no layout do formulário em papel
 * FRM.ENG-0240: A4 retrato, cabeçalho com Projeto/Tramo/Sequencial, colunas
 * de Produção e Controle da Qualidade, grupo em texto vertical, bloco de
 * validação, assinaturas, aprovação final e observação. Português em negrito,
 * inglês em itálico sem negrito — como no formulário.
 */

import { PDFDocument, PDFImage, PDFPage, rgb } from 'pdf-lib';
import type { InternosChecklist, InternosItemModelo, InternosModelo, InternosRespostaItem } from '../qualidadeInternosMecanicos';
import { separarBilingue } from '../textoBilingue';
import {
  BLACK, CHECK, GREEN, HEAD_BG, LINE, MUTED, PH, PW, RED,
  alturaBlocos, baixarPdf, bilingue, caixaMarcacao, carregarFontes, celula, criarCarregadorImagens, embedAssinatura,
  fmtData, fmtDataHora, imagem, linha, medir, mosaico, quebrar, retangulo, texto, textoMisto, textoVertical,
  type Bloco, type Fontes, type PdfGerado,
} from './formularioPdf';

const M = 18;
const W = PW - M * 2;
const FOOTER = 16;
const BOTTOM = PH - M - FOOTER;

// GRUPO | ITEM | Nº PEÇA | ILUSTRAÇÃO | DESCRIÇÃO | PRODUÇÃO | NC | QTD | FINAL
const FIXAS = [30, 22, 46, 70, 0, 58, 38, 40, 40];
const COLS = FIXAS.map(largura => largura || W - FIXAS.reduce((soma, valor) => soma + valor, 0));
const XS = COLS.reduce<number[]>((acc, largura, indice) => [...acc, indice === 0 ? M : acc[indice - 1] + COLS[indice - 1]], []);
const X_FIM = M + W;

export type PdfInternosGerado = PdfGerado;

function linhasFormulario(modelo: InternosModelo, checklist: InternosChecklist): string[] {
  const partes = (modelo.formulario || checklist.versao_formulario || 'FRM.ENG-0240').split(' / ').map(parte => parte.trim()).filter(Boolean);
  return partes.length > 1 ? partes : (partes[0] || '').split(/\s+/);
}

/** Linha do título + linha Projeto/Tramo/Sequencial. Devolve o topo livre. */
async function desenharTopo(page: PDFPage, f: Fontes, logo: PDFImage | null, checklist: InternosChecklist, modelo: InternosModelo): Promise<number> {
  let topo = M;
  retangulo(page, M, topo, W, 46);
  imagem(page, logo, M + 6, topo + 5, 104, 36);
  const centroX = M + 120;
  const centroW = W - 120 - 100;
  celula(page, f, [
    { text: 'CHECKLIST INTERNOS MECÂNICOS', font: f.bold, size: 11 },
    { text: 'MECHANICAL INTERNAL CHECKLIST', font: f.italic, size: 10, gap: 1 },
    { text: `${modelo.nome} - ${checklist.codigo_registro}`, font: f.regular, size: 6.5, color: MUTED, gap: 2 },
  ], centroX, topo, centroW, 46);
  celula(page, f, linhasFormulario(modelo, checklist).map(valor => ({ text: valor, font: f.regular, size: 7.2 })), X_FIM - 100, topo, 100, 46);

  topo += 50;
  const h = 30;
  // Projeto
  const wProjeto = XS[4] - M - 8;
  retangulo(page, M, topo, wProjeto, h);
  texto(page, 'Projeto', M + 4, topo + 12, f.bold, 8.5, BLACK, f);
  texto(page, 'Project', M + 4, topo + 24, f.italic, 8, BLACK, f);
  celula(page, f, [{ text: checklist.projeto, font: f.regular, size: 9 }], M + 44, topo, wProjeto - 46, h, { align: 'left' });
  // Tramo e Sequencial dentro da faixa da descrição
  const wTramo = 88;
  retangulo(page, XS[4] - 4, topo, wTramo, h);
  texto(page, 'Tramo', XS[4] + 2, topo + 19, f.bold, 10, BLACK, f);
  texto(page, checklist.tramo || '-', XS[4] + 44, topo + 19, f.bold, 11, BLACK, f);
  const xSeq = XS[4] - 4 + wTramo + 6;
  retangulo(page, xSeq, topo, XS[5] - xSeq - 4, h);
  texto(page, 'Sequencial', xSeq + 5, topo + 19, f.bold, 10, BLACK, f);
  celula(page, f, [{ text: checklist.sequencial || '-', font: f.bold, size: 10 }], xSeq + 64, topo, XS[5] - xSeq - 70, h, { align: 'left' });
  // Cabeçalhos das etapas
  retangulo(page, XS[5], topo, COLS[5], h, HEAD_BG);
  celula(page, f, bilingue('PRODUÇÃO', 'PRODUCTION', f, 6.8), XS[5], topo, COLS[5], h);
  retangulo(page, XS[6], topo, X_FIM - XS[6], h, HEAD_BG);
  celula(page, f, bilingue('CONTROLE DA QUALIDADE', 'QUALITY CONTROL', f, 6.8), XS[6], topo, X_FIM - XS[6], h);
  return topo + h;
}

const CABECALHOS: [string, string][] = [
  ['GRUPO', 'GROUP'],
  ['ITEM', 'ITEM'],
  ['NÚMERO DA PEÇA', 'PART NUMBER'],
  ['ILUSTRAÇÃO', 'ILLUSTRATION'],
  ['DESCRIÇÃO DA VERIFICAÇÃO', 'DESCRIPTION OF THE VERIFICATION'],
  ['Responsável verificação de conformidade (Assinatura)', 'Conformity'],
  ['Verificação não conforme (Assinale com NC)', 'Non-compliant verification (Mark with NC)'],
  ['Quantidade não conforme (Quantitativo encontrado)', 'Nonconforming quantity (Quantity found)'],
  [`Verificação final conforme (Assinale com ${CHECK})`, `Final check as per (Check with ${CHECK})`],
];

function desenharCabecalhoColunas(page: PDFPage, f: Fontes, topo: number): number {
  const h = 74;
  CABECALHOS.forEach(([pt, en], indice) => {
    retangulo(page, XS[indice], topo, COLS[indice], h, HEAD_BG);
    celula(page, f, bilingue(pt, en, f, indice >= 5 ? 5.4 : 6.6), XS[indice], topo, COLS[indice], h, { pad: 1.5 });
  });
  return topo + h;
}

function blocosDescricao(item: InternosItemModelo, f: Fontes): Bloco[] {
  const { pt, en } = separarBilingue(item.descricao);
  if (!pt && !en) return [{ text: 'Descrição não informada no formulário fonte.', font: f.italic, size: 6.6, color: MUTED }];
  return [{ text: pt, font: f.bold, size: 6.8 }, { text: en, font: f.italic, size: 6.5, gap: 1.5 }];
}

function rotuloResposta(valor?: string | null) {
  if (valor === 'CONFORME') return { text: 'Conforme', color: GREEN };
  if (valor === 'NAO_CONFORME') return { text: 'Não conforme', color: RED };
  if (valor === 'NA') return { text: 'N/A', color: MUTED };
  return null;
}

async function desenharItem(
  page: PDFPage, f: Fontes, item: InternosItemModelo, resposta: InternosRespostaItem | undefined,
  topo: number, altura: number, imagens: PDFImage[],
) {
  for (let indice = 1; indice < COLS.length; indice++) retangulo(page, XS[indice], topo, COLS[indice], altura);
  celula(page, f, [{ text: String(item.numero), font: f.bold, size: 8 }], XS[1], topo, COLS[1], altura);
  celula(page, f, [{ text: item.numero_peca || '-', font: f.regular, size: 6.8 }], XS[2], topo, COLS[2], altura, { pad: 2 });
  mosaico(page, imagens, XS[3] + 2, topo + 2, COLS[3] - 4, altura - 4);
  celula(page, f, blocosDescricao(item, f), XS[4], topo, COLS[4], altura, { align: 'left', pad: 4 });

  const producao = rotuloResposta(resposta?.resposta);
  if (producao) {
    celula(page, f, [
      { text: resposta?.responsavel || '-', font: f.bold, size: 5.9 },
      { text: producao.text, font: f.bold, size: 5.6, color: producao.color, gap: 1.5 },
      { text: resposta?.verificado_em ? fmtData(resposta.verificado_em) : '', font: f.regular, size: 5.4, color: MUTED, gap: 1 },
    ], XS[5], topo, COLS[5], altura, { pad: 2 });
  }
  const qualidade = resposta?.qualidade_resposta;
  if (qualidade === 'NAO_CONFORME') celula(page, f, [{ text: 'NC', font: f.bold, size: 10, color: RED }], XS[6], topo, COLS[6], altura);
  if (resposta?.quantidade_nao_conforme) celula(page, f, [{ text: resposta.quantidade_nao_conforme, font: f.bold, size: 8 }], XS[7], topo, COLS[7], altura);
  if (qualidade === 'CONFORME') {
    const size = 13;
    const w = f.zapf.widthOfTextAtSize('✔', size);
    page.drawText('✔', { x: XS[8] + (COLS[8] - w) / 2, y: PH - topo - altura / 2 - size * 0.35, font: f.zapf, size, color: GREEN });
  } else if (qualidade === 'NA') {
    celula(page, f, [{ text: 'N/A', font: f.bold, size: 7, color: MUTED }], XS[8], topo, COLS[8], altura);
  }
}

function alturaItem(item: InternosItemModelo, f: Fontes, resposta: InternosRespostaItem | undefined, comFoto: boolean): number {
  const descricao = alturaBlocos(blocosDescricao(item, f), COLS[4] - 8) + 8;
  const producao = alturaBlocos([{ text: resposta?.responsavel || '', font: f.bold, size: 5.9 }], COLS[5] - 4) + 22;
  return Math.max(comFoto ? 64 : 54, descricao, producao);
}

function observacoesCompletas(checklist: InternosChecklist, modelo: InternosModelo): string[] {
  const linhas: string[] = [];
  if (checklist.observacao_final?.trim()) linhas.push(checklist.observacao_final.trim());
  for (const item of modelo.items) {
    const resposta = checklist.respostas?.[item.chave];
    if (resposta?.observacao?.trim()) linhas.push(`Item ${item.numero} (Produção): ${resposta.observacao.trim()}`);
    if (resposta?.observacao_qualidade?.trim()) linhas.push(`Item ${item.numero} (Qualidade): ${resposta.observacao_qualidade.trim()}`);
  }
  return linhas;
}

const VALIDACOES: { chave: string; pt: string; en: string }[] = [
  { chave: 'nao_conformidade', pt: 'Seção tem NÃO CONFORMIDADE (NC) via "Se Suíte?"', en: 'Section has NON-CONFORMITY (NC) via "Se Suite?"' },
  { chave: 'sdr_aberto', pt: 'Seção tem SOLICITAÇÃO DE DESVIO (SDR) em aberto?', en: 'Does the section have an open SUPPLIER DEVIATION REQUEST (SDR)?' },
];

async function desenharValidacao(page: PDFPage, doc: PDFDocument, f: Fontes, checklist: InternosChecklist, modelo: InternosModelo, topoInicial: number, observacoes: string[]) {
  let topo = topoInicial;
  const xPergunta = XS[2];
  const xSim = XS[5];
  const xNao = XS[8];

  // Linha de títulos
  const hTitulo = 18;
  retangulo(page, XS[1], topo, COLS[1], hTitulo);
  celula(page, f, [{ text: '-', font: f.bold, size: 7 }], XS[1], topo, COLS[1], hTitulo);
  retangulo(page, xPergunta, topo, xSim - xPergunta, hTitulo, HEAD_BG);
  textoMisto(page, f, [['VALIDAÇÃO DE CONFORMIDADES / ', f.bold], ['COMPLIANCE VALIDATION', f.italic]], xPergunta, xSim - xPergunta, topo + 12, 7.4);
  retangulo(page, xSim, topo, xNao - xSim, hTitulo, HEAD_BG);
  textoMisto(page, f, [['SIM/', f.bold], ['YES', f.italic], [' - IDENTIFICAÇÃO/', f.bold], ['IDENTIFICATION', f.italic]], xSim, xNao - xSim, topo + 12, 5.6);
  retangulo(page, xNao, topo, X_FIM - xNao, hTitulo, HEAD_BG);
  celula(page, f, [{ text: 'NÃO/NO', font: f.bold, size: 6.8 }], xNao, topo, X_FIM - xNao, hTitulo);
  topo += hTitulo;

  const hValidacao = 26;
  VALIDACOES.forEach((validacao, indice) => {
    const valor = checklist.validacoes?.[validacao.chave];
    retangulo(page, XS[1], topo, COLS[1], hValidacao);
    celula(page, f, [{ text: String(indice + 1), font: f.bold, size: 7.5 }], XS[1], topo, COLS[1], hValidacao);
    retangulo(page, xPergunta, topo, xSim - xPergunta, hValidacao);
    celula(page, f, [
      { text: validacao.pt, font: f.bold, size: 7 },
      { text: validacao.en, font: f.italic, size: 6.7, gap: 0.5 },
    ], xPergunta, topo, xSim - xPergunta, hValidacao);
    retangulo(page, xSim, topo, xNao - xSim, hValidacao);
    caixaMarcacao(page, xSim + 5, topo + 6, 18, valor?.resposta === 'SIM', f);
    linha(page, xSim + 30, topo + 19, xNao - 6, topo + 19, 0.4);
    if (valor?.identificacao) celula(page, f, [{ text: valor.identificacao, font: f.regular, size: 6.6 }], xSim + 28, topo + 1, xNao - xSim - 32, 17, { align: 'left', pad: 2 });
    retangulo(page, xNao, topo, X_FIM - xNao, hValidacao);
    caixaMarcacao(page, xNao + (X_FIM - xNao - 20) / 2, topo + 5, 20, valor?.resposta === 'NAO', f);
    topo += hValidacao;
  });

  // Nome / Assinatura / Setor / Data
  const wRotulo = COLS[1] + COLS[2];
  const wInstrumentos = 205;
  const xProd = XS[1] + wRotulo;
  const wAss = (X_FIM - wInstrumentos - xProd) / 2;
  const xQual = xProd + wAss;
  const xInstr = xQual + wAss;
  const linhas: { pt: string; en: string; h: number }[] = [
    { pt: 'Nome', en: 'Name', h: 20 },
    { pt: 'Assinatura', en: 'Signature', h: 34 },
    { pt: 'Setor', en: 'Sector', h: 20 },
    { pt: 'Data', en: 'Date', h: 20 },
  ];
  const topoAssinaturas = topo;
  const assinaturas = {
    PRODUCAO: checklist.assinaturas.find(item => item.papel === 'PRODUCAO'),
    QUALIDADE: checklist.assinaturas.find(item => item.papel === 'QUALIDADE'),
  };
  const imagens = {
    PRODUCAO: await embedAssinatura(doc, assinaturas.PRODUCAO?.preview_url, assinaturas.PRODUCAO?.tipo),
    QUALIDADE: await embedAssinatura(doc, assinaturas.QUALIDADE?.preview_url, assinaturas.QUALIDADE?.tipo),
  };
  const valores = (papel: 'PRODUCAO' | 'QUALIDADE') => {
    const assinatura = assinaturas[papel];
    const nome = assinatura?.nome || (papel === 'PRODUCAO' ? checklist.responsavel_producao : checklist.responsavel_qualidade) || '';
    return [
      nome,
      '',
      assinatura?.setor || '',
      assinatura?.assinado_em ? fmtDataHora(assinatura.assinado_em) : fmtData(assinatura?.data_assinatura),
    ];
  };
  const setorPadrao = { PRODUCAO: ['Produção', 'manufacture'], QUALIDADE: ['Qualidade', 'quality'] } as const;
  linhas.forEach((item, indice) => {
    retangulo(page, XS[1], topo, wRotulo, item.h);
    celula(page, f, bilingue(item.pt, item.en, f, 6.4), XS[1], topo, wRotulo, item.h, { pad: 1 });
    for (const [papel, x] of [['PRODUCAO', xProd], ['QUALIDADE', xQual]] as const) {
      retangulo(page, x, topo, wAss, item.h);
      if (indice === 1) {
        imagem(page, imagens[papel], x + 4, topo + 2, wAss - 8, item.h - 4);
        continue;
      }
      const valor = valores(papel)[indice];
      if (indice === 2 && !valor) {
        textoMisto(page, f, [[`${setorPadrao[papel][0]} / `, f.regular], [setorPadrao[papel][1], f.italic]], x, wAss, topo + 13, 6.8);
      } else {
        celula(page, f, [{ text: valor || '', font: indice === 0 ? f.bold : f.regular, size: 7 }], x, topo, wAss, item.h);
      }
    }
    topo += item.h;
  });
  const hAssinaturas = topo - topoAssinaturas;
  retangulo(page, xInstr, topoAssinaturas, X_FIM - xInstr, hAssinaturas);
  texto(page, 'Instrumentos Utilizados /', xInstr + 5, topoAssinaturas + 11, f.bold, 7.5, BLACK, f);
  texto(page, 'Measurements Tool:', xInstr + 5 + medir('Instrumentos Utilizados / ', f.bold, 7.5), topoAssinaturas + 11, f.italic, 7.3, BLACK, f);
  celula(page, f, [{ text: checklist.instrumentos_utilizados || '', font: f.regular, size: 7 }], xInstr, topoAssinaturas + 14, X_FIM - xInstr, hAssinaturas - 16, { align: 'left', valign: 'top', pad: 5 });

  // Aprovação final
  const hAprovacao = 38;
  const wAprovacao = COLS[1] + COLS[2] + COLS[3];
  retangulo(page, XS[1], topo, wAprovacao, hAprovacao);
  celula(page, f, [
    { text: 'Aprovação final do Checklist - QUALIDADE', font: f.bold, size: 7.6 },
    { text: 'Final Approval of the Checklist - QUALITY', font: f.italic, size: 7, gap: 1 },
  ], XS[1], topo, wAprovacao, hAprovacao);
  retangulo(page, XS[4], topo, X_FIM - XS[4], hAprovacao);
  caixaMarcacao(page, XS[4] + 60, topo + 7, 30, checklist.aprovacao_final_qualidade, f, 'CHECK');
  linha(page, XS[4] + 120, topo + 28, X_FIM - 30, topo + 28, 0.6, BLACK);
  if (checklist.aprovacao_final_qualidade) {
    const aprovador = checklist.qualidade_por_nome || checklist.responsavel_qualidade || '';
    const quando = checklist.finalizado_em ? fmtDataHora(checklist.finalizado_em) : fmtData(assinaturas.QUALIDADE?.data_assinatura);
    celula(page, f, [{ text: [aprovador, quando].filter(Boolean).join(' - '), font: f.bold, size: 7.5 }], XS[4] + 120, topo + 12, X_FIM - 30 - XS[4] - 120, 14);
  }
  topo += hAprovacao;

  // Coluna lateral VALIDAÇÃO
  retangulo(page, XS[0], topoInicial, COLS[0], topo - topoInicial);
  textoVertical(page, f, 'VALIDAÇÃO', 'VALIDATION', XS[0], topoInicial, COLS[0], topo - topoInicial);

  // Observação
  const lh = 11;
  const textoObs = observacoes.flatMap(item => quebrar(item, f.regular, 7, W - 10));
  const nLinhas = Math.max(5, textoObs.length);
  const hObs = 12 + nLinhas * lh + 3;
  retangulo(page, M, topo, W, hObs);
  texto(page, 'OBSERVAÇÃO:', M + 3, topo + 9, f.bold, 7, BLACK, f);
  for (let indice = 0; indice < nLinhas; indice++) {
    const base = topo + 12 + (indice + 1) * lh;
    linha(page, M, base, X_FIM, base, 0.3, rgb(0.6, 0.62, 0.66));
    if (textoObs[indice]) texto(page, textoObs[indice], M + 5, base - 3, f.regular, 7, BLACK, f);
  }
  return topo + hObs;
}

function alturaValidacao(f: Fontes, observacoes: string[]): number {
  const linhasObs = Math.max(5, observacoes.flatMap(item => quebrar(item, f.regular, 7, W - 10)).length);
  return 18 + 26 * 2 + 94 + 38 + 12 + linhasObs * 11 + 3;
}

function statusRodape(status: string) {
  if (status === 'FINALIZADO') return 'Finalizado';
  if (status === 'AGUARDANDO_QUALIDADE') return 'Aguardando dupla verificação da Qualidade';
  return 'Rascunho da Produção';
}

async function montarDocumento(checklist: InternosChecklist, modelo: InternosModelo, illustrationUrls: Record<string, string>): Promise<PDFDocument> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Checklist Internos Mecânicos ${checklist.codigo_registro}`);
  const f = await carregarFontes(doc);
  const carregar = criarCarregadorImagens(doc);
  const logo = await carregar('/logo-adm.png');
  const observacoes = observacoesCompletas(checklist, modelo);

  const novaPagina = async (comColunas: boolean) => {
    const page = doc.addPage([PW, PH]);
    let topo = await desenharTopo(page, f, logo, checklist, modelo);
    if (comColunas) topo = desenharCabecalhoColunas(page, f, topo);
    return { page, topo };
  };

  let { page, topo } = await novaPagina(true);
  // Segmento de grupo aberto na página atual (texto vertical desenhado ao fechar).
  let grupo: { chave: string; topo: number } | null = null;
  const fecharGrupo = () => {
    if (!grupo) return;
    const { pt, en } = separarBilingue(grupo.chave);
    retangulo(page, XS[0], grupo.topo, COLS[0], topo - grupo.topo);
    textoVertical(page, f, pt || 'GERAL', en, XS[0], grupo.topo, COLS[0], topo - grupo.topo);
    grupo = null;
  };

  for (const item of modelo.items) {
    const resposta = checklist.respostas?.[item.chave];
    // Foto registrada na resposta substitui a ilustração de referência na
    // coluna ILUSTRAÇÃO; sem foto (ou se nenhuma embutir), fica a referência.
    const fotosItem = checklist.fotos.filter(foto => foto.item_chave === item.chave && foto.preview_url);
    const imagensFotos = (await Promise.all(fotosItem.slice(0, 4).map(foto => carregar(foto.preview_url)))).filter((img): img is PDFImage => !!img);
    const altura = alturaItem(item, f, resposta, imagensFotos.length > 0);
    if (topo + altura > BOTTOM) {
      fecharGrupo();
      ({ page, topo } = await novaPagina(true));
    }
    if (grupo && grupo.chave !== item.grupo) fecharGrupo();
    if (!grupo) grupo = { chave: item.grupo || '', topo };
    let imagens = imagensFotos;
    if (!imagens.length) {
      const chaveIlustracao = item.ilustracoes[0]?.split('/').pop() || '';
      const ilustracao = await carregar(illustrationUrls[chaveIlustracao] || item.ilustracoes[0]);
      imagens = ilustracao ? [ilustracao] : [];
    }
    await desenharItem(page, f, item, resposta, topo, altura, imagens);
    topo += altura;
  }
  fecharGrupo();

  if (topo + 6 + alturaValidacao(f, observacoes) > BOTTOM) ({ page, topo } = await novaPagina(false));
  await desenharValidacao(page, doc, f, checklist, modelo, topo + 6, observacoes);

  // Registro fotográfico ampliado (na tabela a foto cabe só na célula da ilustração).
  const fotos = checklist.fotos.filter(foto => foto.preview_url);
  if (fotos.length) {
    const numeroPorChave = new Map(modelo.items.map(item => [item.chave, item.numero]));
    const colunas = 3;
    const gap = 8;
    const wFoto = (W - gap * (colunas - 1)) / colunas;
    const hFoto = 150;
    let pagina = await novaPagina(false);
    let cursor = pagina.topo + 8;
    celula(pagina.page, f, bilingue('REGISTRO FOTOGRÁFICO DA INSPEÇÃO', 'INSPECTION PHOTOGRAPHIC RECORD', f, 8), M, cursor, W, 22, { align: 'left', pad: 0 });
    cursor += 26;
    for (let indice = 0; indice < fotos.length; indice++) {
      const coluna = indice % colunas;
      if (coluna === 0 && indice > 0) cursor += hFoto + 18 + gap;
      if (cursor + hFoto + 18 > BOTTOM) {
        pagina = await novaPagina(false);
        cursor = pagina.topo + 8;
      }
      const x = M + coluna * (wFoto + gap);
      retangulo(pagina.page, x, cursor, wFoto, hFoto + 18);
      imagem(pagina.page, await carregar(fotos[indice].preview_url), x + 3, cursor + 3, wFoto - 6, hFoto - 3);
      celula(pagina.page, f, [{ text: `Item ${numeroPorChave.get(fotos[indice].item_chave) ?? '-'}`, font: f.bold, size: 7 }], x, cursor + hFoto, wFoto, 18);
    }
  }

  const paginas = doc.getPages();
  paginas.forEach((pagina, indice) => {
    const base = PH - M + 4;
    texto(pagina, `SISTEN - ${checklist.codigo_registro} - ${statusRodape(checklist.status)}`, M, base, f.regular, 6.5, MUTED, f);
    const rotulo = `Página ${indice + 1}/${paginas.length}`;
    texto(pagina, rotulo, X_FIM - medir(rotulo, f.regular, 6.5), base, f.regular, 6.5, MUTED, f);
  });
  return doc;
}

export async function gerarQualidadeInternosMecanicosPdf(
  checklist: InternosChecklist,
  modelo: InternosModelo,
  illustrationUrls: Record<string, string> = {},
): Promise<PdfInternosGerado> {
  const doc = await montarDocumento(checklist, modelo, illustrationUrls);
  return {
    bytes: await doc.save(),
    nomeArquivo: `checklist-internos-mecanicos-${checklist.codigo_registro}.pdf`,
    titulo: `${checklist.codigo_registro} - ${modelo.nome}`,
  };
}

export async function exportQualidadeInternosMecanicosPdf(
  checklist: InternosChecklist,
  modelo: InternosModelo,
  illustrationUrls: Record<string, string> = {},
): Promise<void> {
  baixarPdf(await gerarQualidadeInternosMecanicosPdf(checklist, modelo, illustrationUrls));
}
