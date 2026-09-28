/**
 * PDF do Checklist de Expedição de Tramos (FRM.QUA-0030) no padrão de
 * formulário da Qualidade: A4 retrato, cabeçalho em grade, tabela com a foto
 * do item na coluna Imagem e verificação final em OK / N/A / NOK, observações
 * fora da listagem e os quatro quadros de validação com data da assinatura.
 */

import { PDFDocument, PDFImage, PDFPage } from 'pdf-lib';
import type { QuaChecklistExpedicao, QuaChecklistResposta } from '../../types';
import { CHECKLIST_ITENS, CHECKLIST_OBSERVACOES, CHECKLIST_PAPEIS } from '../qualidadeChecklistExpedicao';
import { separarBilingue } from '../textoBilingue';
import {
  BLACK, GREEN, HEAD_BG, MUTED, PH, PW, RED,
  alturaBlocos, baixarPdf, bilingue, carregarFontes, celula, criarCarregadorImagens, embedAssinatura,
  fmtData, fmtDataHora, imagem, medir, mosaico, retangulo, texto, textoMisto,
  type Bloco, type Fontes, type PdfGerado,
} from './formularioPdf';

const M = 18;
const W = PW - M * 2;
const X_FIM = M + W;
const BOTTOM = PH - M - 16;

// ITEM | IMAGEM | DESCRIÇÃO | OK | N/A | NOK
const FIXAS = [26, 150, 0, 30, 30, 30];
const COLS = FIXAS.map(largura => largura || W - FIXAS.reduce((soma, valor) => soma + valor, 0));
const XS = COLS.reduce<number[]>((acc, largura, indice) => [...acc, indice === 0 ? M : acc[indice - 1] + COLS[indice - 1]], []);

function statusRodape(status: string) {
  if (status === 'FINALIZADO') return 'Finalizado';
  if (status === 'AGUARDANDO_ASSINATURAS') return 'Fechado - aguardando assinaturas';
  return 'Rascunho';
}

function desenharTopo(page: PDFPage, f: Fontes, logo: PDFImage | null, checklist: QuaChecklistExpedicao): number {
  let topo = M;
  retangulo(page, M, topo, W, 46);
  imagem(page, logo, M + 6, topo + 5, 104, 36);
  celula(page, f, [
    { text: 'CHECKLIST DE EXPEDIÇÃO DE TRAMOS', font: f.bold, size: 11 },
    { text: 'CHECKLIST FOR SECTIONS DISPATCH', font: f.italic, size: 10, gap: 1 },
    { text: checklist.codigo_registro, font: f.regular, size: 6.5, color: MUTED, gap: 2 },
  ], M + 120, topo, W - 220, 46);
  celula(page, f, [
    { text: 'FRM.QUA-0030', font: f.regular, size: 7.2 },
    { text: 'Rev.14', font: f.regular, size: 7.2 },
  ], X_FIM - 100, topo, 100, 46);
  topo += 50;

  const campos: [string, string, string][] = [
    ['Cliente', 'Client', checklist.cliente],
    ['Projeto', 'Project', checklist.projeto],
    ['Tramo / Sequencial', 'Section / Sequential', checklist.tramo_sequencial],
    ['Número de Série', 'Serial Number', checklist.numero_serie],
    ['Data de Expedição', 'Shipping Date', fmtData(checklist.data_expedicao)],
    ['Site', 'Site', checklist.site],
    ['Inspetor de Qualidade', 'Quality Inspector', checklist.inspetor_qualidade],
    ['Nº Etiqueta Seção', 'Section Number TAG', checklist.etiqueta_secao],
  ];
  const largura = W / 4;
  const h = 27;
  campos.forEach(([pt, en, valor], indice) => {
    const x = M + (indice % 4) * largura;
    const y = topo + Math.floor(indice / 4) * h;
    retangulo(page, x, y, largura, h);
    textoMisto(page, f, [[`${pt} / `, f.bold], [en, f.italic]], x, largura, y + 9, 6.2);
    celula(page, f, [{ text: valor || '-', font: f.bold, size: 8.5 }], x, y + 11, largura, h - 11, { pad: 2 });
  });
  return topo + h * 2 + 4;
}

function barraSecao(page: PDFPage, f: Fontes, pt: string, en: string, topo: number): number {
  retangulo(page, M, topo, W, 16, HEAD_BG);
  textoMisto(page, f, [[`${pt} / `, f.bold], [en, f.italic]], M, W, topo + 11, 7.6);
  return topo + 16;
}

function cabecalhoColunas(page: PDFPage, f: Fontes, topo: number, descricaoPt: string, descricaoEn: string): number {
  const h = 30;
  const colunas: [string, string][] = [['ITEM', 'ITEM'], ['IMAGEM', 'IMAGE'], [descricaoPt, descricaoEn]];
  colunas.forEach(([pt, en], indice) => {
    retangulo(page, XS[indice], topo, COLS[indice], h, HEAD_BG);
    celula(page, f, bilingue(pt, en, f, 6.6), XS[indice], topo, COLS[indice], h, { pad: 1.5 });
  });
  const largura = COLS[3] + COLS[4] + COLS[5];
  retangulo(page, XS[3], topo, largura, 15, HEAD_BG);
  celula(page, f, bilingue('VERIFICAÇÃO FINAL', 'FINAL CHECK', f, 5.2), XS[3], topo, largura, 15, { pad: 0.5 });
  ['OK', 'N/A', 'NOK'].forEach((rotulo, indice) => {
    retangulo(page, XS[3 + indice], topo + 15, COLS[3 + indice], 15, HEAD_BG);
    celula(page, f, [{ text: rotulo, font: f.bold, size: 6.6 }], XS[3 + indice], topo + 15, COLS[3 + indice], 15);
  });
  return topo + h;
}

function blocosDescricao(descricao: string, f: Fontes, observacao?: string): Bloco[] {
  const { pt, en } = separarBilingue(descricao);
  const blocos: Bloco[] = [{ text: pt, font: f.bold, size: 7.2 }, { text: en, font: f.italic, size: 6.9, gap: 1.5 }];
  if (observacao?.trim()) blocos.push({ text: `Obs.: ${observacao.trim()}`, font: f.regular, size: 6.9, color: BLACK, gap: 4 });
  return blocos;
}

const COLUNA_RESPOSTA: Record<QuaChecklistResposta, number> = { OK: 3, NA: 4, NOK: 5 };

function linhaVerificacao(
  page: PDFPage, f: Fontes, numero: string, blocos: Bloco[], resposta: QuaChecklistResposta | null | undefined,
  imagens: PDFImage[], topo: number, altura: number,
) {
  COLS.forEach((largura, indice) => retangulo(page, XS[indice], topo, largura, altura));
  celula(page, f, [{ text: numero, font: f.bold, size: 9 }], XS[0], topo, COLS[0], altura);
  if (imagens.length) mosaico(page, imagens, XS[1] + 3, topo + 3, COLS[1] - 6, altura - 6);
  else celula(page, f, [{ text: 'Sem foto', font: f.italic, size: 6.8, color: MUTED }], XS[1], topo, COLS[1], altura);
  celula(page, f, blocos, XS[2], topo, COLS[2], altura, { align: 'left', pad: 5 });
  if (!resposta) return;
  const coluna = COLUNA_RESPOSTA[resposta];
  const cor = resposta === 'OK' ? GREEN : resposta === 'NOK' ? RED : MUTED;
  const size = 13;
  const w = f.zapf.widthOfTextAtSize(resposta === 'NOK' ? '✘' : '✔', size);
  page.drawText(resposta === 'NOK' ? '✘' : '✔', { x: XS[coluna] + (COLS[coluna] - w) / 2, y: PH - topo - altura / 2 - size * 0.35, font: f.zapf, size, color: cor });
}

function alturaLinha(blocos: Bloco[], comFoto: boolean): number {
  return Math.max(comFoto ? 84 : 44, alturaBlocos(blocos, COLS[2] - 10) + 10);
}

async function desenharValidacao(page: PDFPage, doc: PDFDocument, f: Fontes, checklist: QuaChecklistExpedicao, topoInicial: number): Promise<number> {
  let topo = barraSecao(page, f, 'VALIDAÇÃO', 'VALIDATION', topoInicial);
  const largura = W / CHECKLIST_PAPEIS.length;
  const h = 104;
  for (const [indice, { papel, label }] of CHECKLIST_PAPEIS.entries()) {
    const x = M + indice * largura;
    const assinatura = checklist.assinaturas.find(item => item.papel === papel);
    const { pt, en } = separarBilingue(label);
    retangulo(page, x, topo, largura, h);
    celula(page, f, bilingue(pt, en, f, 6.6), x, topo, largura, 22, { pad: 2 });
    const img = await embedAssinatura(doc, assinatura?.preview_url, assinatura?.tipo);
    imagem(page, img, x + 8, topo + 24, largura - 16, 44);
    if (!assinatura) celula(page, f, [{ text: 'Pendente', font: f.italic, size: 7, color: MUTED }], x, topo + 24, largura, 44);
    page.drawLine({ start: { x: x + 10, y: PH - topo - 71 }, end: { x: x + largura - 10, y: PH - topo - 71 }, thickness: 0.6, color: BLACK });
    const nome = assinatura?.nome || checklist.validacao_nomes?.[papel] || '';
    celula(page, f, [
      { text: nome || '-', font: f.bold, size: 7.2 },
      { text: assinatura ? fmtDataHora(assinatura.assinado_em || assinatura.created_at) : '', font: f.regular, size: 6.8, color: BLACK, gap: 1 },
    ], x, topo + 72, largura, h - 72, { pad: 2 });
  }
  topo += h;
  return topo;
}

async function montarDocumento(checklist: QuaChecklistExpedicao): Promise<PDFDocument> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Checklist de Expedição ${checklist.codigo_registro}`);
  const f = await carregarFontes(doc);
  const carregar = criarCarregadorImagens(doc);
  const logo = await carregar('/logo-adm.png');
  const fotosDe = async (chave: string) =>
    (await Promise.all(checklist.fotos.filter(foto => foto.item_chave === chave && foto.preview_url).slice(0, 4).map(foto => carregar(foto.preview_url))))
      .filter((img): img is PDFImage => !!img);

  let page = doc.addPage([PW, PH]);
  let topo = desenharTopo(page, f, logo, checklist);
  const novaPagina = () => {
    page = doc.addPage([PW, PH]);
    topo = desenharTopo(page, f, logo, checklist);
  };

  const secao = async (
    titulo: [string, string], colunaDescricao: [string, string],
    linhas: { chave: string; numero: string; blocos: Bloco[]; resposta: QuaChecklistResposta | null | undefined }[],
  ) => {
    const primeira = linhas[0];
    const alturaPrimeira = alturaLinha(primeira.blocos, (await fotosDe(primeira.chave)).length > 0);
    if (topo + 16 + 30 + alturaPrimeira > BOTTOM) novaPagina();
    topo = barraSecao(page, f, titulo[0], titulo[1], topo);
    topo = cabecalhoColunas(page, f, topo, colunaDescricao[0], colunaDescricao[1]);
    for (const linha of linhas) {
      const imagens = await fotosDe(linha.chave);
      const altura = alturaLinha(linha.blocos, imagens.length > 0);
      if (topo + altura > BOTTOM) {
        novaPagina();
        topo = cabecalhoColunas(page, f, topo, colunaDescricao[0], colunaDescricao[1]);
      }
      linhaVerificacao(page, f, linha.numero, linha.blocos, linha.resposta, imagens, topo, altura);
      topo += altura;
    }
    topo += 6;
  };

  await secao(['VERIFICAÇÃO FINAL', 'FINAL CHECK'], ['DESCRIÇÃO DA VERIFICAÇÃO', 'VERIFICATION DESCRIPTION'],
    CHECKLIST_ITENS.map(item => ({ chave: item.chave, numero: String(item.numero), blocos: blocosDescricao(item.descricao, f), resposta: checklist.respostas?.[item.chave] })));
  await secao(['OBSERVAÇÕES FORA DA LISTAGEM', 'OBSERVATIONS OUTSIDE THE LISTING'], ['OBSERVAÇÃO', 'OBSERVATION'],
    CHECKLIST_OBSERVACOES.map(item => ({
      chave: item.chave,
      numero: String(item.numero),
      blocos: blocosDescricao(item.descricao, f, checklist.observacoes?.[item.chave]?.texto),
      resposta: checklist.observacoes?.[item.chave]?.resposta,
    })));

  if (topo + 16 + 104 > BOTTOM) novaPagina();
  await desenharValidacao(page, doc, f, checklist, topo);

  // Registro fotográfico ampliado (na tabela a foto cabe só na coluna Imagem).
  const fotos = checklist.fotos.filter(foto => foto.preview_url);
  if (fotos.length) {
    const rotulo = new Map<string, string>([
      ...CHECKLIST_ITENS.map(item => [item.chave, `Item ${item.numero}`] as [string, string]),
      ...CHECKLIST_OBSERVACOES.map(item => [item.chave, `Observação ${item.numero}`] as [string, string]),
    ]);
    const colunas = 3;
    const gap = 8;
    const wFoto = (W - gap * (colunas - 1)) / colunas;
    const hFoto = 150;
    novaPagina();
    topo = barraSecao(page, f, 'REGISTRO FOTOGRÁFICO', 'PHOTOGRAPHIC RECORD', topo) + 6;
    for (let indice = 0; indice < fotos.length; indice++) {
      const coluna = indice % colunas;
      if (coluna === 0 && indice > 0) topo += hFoto + 18 + gap;
      if (topo + hFoto + 18 > BOTTOM) {
        novaPagina();
        topo += 6;
      }
      const x = M + coluna * (wFoto + gap);
      retangulo(page, x, topo, wFoto, hFoto + 18);
      imagem(page, await carregar(fotos[indice].preview_url), x + 3, topo + 3, wFoto - 6, hFoto - 3);
      celula(page, f, [{ text: rotulo.get(fotos[indice].item_chave) || '-', font: f.bold, size: 7 }], x, topo + hFoto, wFoto, 18);
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

export async function gerarQualidadeChecklistExpedicaoPdf(checklist: QuaChecklistExpedicao): Promise<PdfGerado> {
  const doc = await montarDocumento(checklist);
  return {
    bytes: await doc.save(),
    nomeArquivo: `checklist-expedicao-${checklist.codigo_registro}.pdf`,
    titulo: `${checklist.codigo_registro} - ${checklist.tramo_sequencial}`,
  };
}

export async function exportQualidadeChecklistExpedicaoPdf(checklist: QuaChecklistExpedicao): Promise<void> {
  baixarPdf(await gerarQualidadeChecklistExpedicaoPdf(checklist));
}
