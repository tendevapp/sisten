/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Conversão fiel de arquivos para Markdown (GFM) — Etapa 1 do fluxo de
 * Cotações. Planilha (XLSX/CSV), JSON e XML são convertidos 100% no
 * navegador: determinístico, gratuito e sem risco de a IA resumir ou
 * inventar conteúdo. PDF, imagem (OCR) e áudio (transcrição) exigem um
 * provedor de IA e ainda não estão implementados nesta versão — entram como
 * `formato` reconhecido mas `nao_suportado`.
 *
 * O parser de XML é escrito à mão (não usa DOMParser) para que a mesma
 * lógica rode em teste (Node, sem DOM) e no navegador sem divergência de
 * comportamento entre os dois ambientes.
 */

import * as XLSX from 'xlsx';

export type FormatoArquivo = 'xlsx' | 'csv' | 'json' | 'xml' | 'pdf' | 'imagem' | 'audio' | 'desconhecido';

export const FORMATOS_SUPORTADOS: FormatoArquivo[] = ['xlsx', 'csv', 'json', 'xml'];
export const FORMATOS_EM_BREVE: FormatoArquivo[] = ['pdf', 'imagem', 'audio'];

const EXTENSOES: Record<string, FormatoArquivo> = {
  xlsx: 'xlsx', xls: 'xlsx', xlsm: 'xlsx', ods: 'xlsx',
  csv: 'csv', tsv: 'csv',
  json: 'json',
  xml: 'xml',
  pdf: 'pdf',
  png: 'imagem', jpg: 'imagem', jpeg: 'imagem', gif: 'imagem', webp: 'imagem', bmp: 'imagem', tif: 'imagem', tiff: 'imagem', heic: 'imagem',
  mp3: 'audio', wav: 'audio', m4a: 'audio', ogg: 'audio', aac: 'audio', flac: 'audio', opus: 'audio',
};

export const ACCEPT_CONVERSOR = Object.keys(EXTENSOES).map(ext => `.${ext}`).join(',');

export function detectarFormato(nomeArquivo: string): FormatoArquivo {
  const ext = nomeArquivo.split('.').pop()?.toLowerCase() ?? '';
  return EXTENSOES[ext] ?? 'desconhecido';
}

export function estimarTokens(texto: string): number {
  // Heurística padrão (~4 caracteres por token). Suficiente para a métrica
  // executiva mostrada na tela — não precisa bater com o tokenizer exato de
  // nenhum provedor específico, já que aqui não há chamada de IA nenhuma.
  return Math.ceil(texto.length / 4);
}

/* ------------------------------------------------------------------------ */
/* Helpers de formatação de célula/valor                                     */
/* ------------------------------------------------------------------------ */

function escapeCelula(valor: string): string {
  return valor.replace(/\r?\n/g, '<br>').replace(/\|/g, '\\|');
}

function formatarValorPrimitivo(v: unknown): string {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'string') return v;
  return String(v);
}

/** Indenta continuações de valores multilinha para permanecerem no mesmo item de lista GFM. */
function valorEmBullet(v: unknown): string {
  return formatarValorPrimitivo(v).split(/\r?\n/).join('\n  ');
}

/* ------------------------------------------------------------------------ */
/* XLSX / CSV → Markdown                                                     */
/* ------------------------------------------------------------------------ */

export function workbookParaMarkdown(workbook: XLSX.WorkBook): string {
  const partes: string[] = [];
  const multiplasAbas = workbook.SheetNames.length > 1;

  for (const nomeAba of workbook.SheetNames) {
    const sheet = workbook.Sheets[nomeAba];
    const linhas = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' }) as (string | number)[][];

    if (multiplasAbas) partes.push(`## ${nomeAba}`, '');

    const linhasComConteudo = linhas.filter(l => l.some(c => String(c ?? '').trim() !== ''));
    if (linhasComConteudo.length === 0) {
      partes.push('_(planilha vazia)_', '');
      continue;
    }

    const largura = Math.max(...linhasComConteudo.map(l => l.length));
    const [cabecalho, ...corpo] = linhasComConteudo;
    const colunas = Array.from({ length: largura }, (_, idx) => {
      const bruto = String(cabecalho[idx] ?? '').trim();
      return escapeCelula(bruto || `Coluna ${idx + 1}`);
    });

    partes.push(`| ${colunas.join(' | ')} |`);
    partes.push(`| ${colunas.map(() => '---').join(' | ')} |`);
    for (const linha of corpo) {
      const celulas = Array.from({ length: largura }, (_, idx) => escapeCelula(String(linha[idx] ?? '')));
      partes.push(`| ${celulas.join(' | ')} |`);
    }
    partes.push('');
  }

  return partes.join('\n').trim() + '\n';
}

async function xlsxOuCsvParaMarkdown(file: File, formato: FormatoArquivo): Promise<string> {
  const workbook = formato === 'csv'
    ? XLSX.read(await file.text(), { type: 'string' })
    : XLSX.read(await file.arrayBuffer(), { type: 'array' });
  return workbookParaMarkdown(workbook);
}

/* ------------------------------------------------------------------------ */
/* JSON → Markdown                                                           */
/* ------------------------------------------------------------------------ */

function ehObjetoPlano(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** true quando todo item do array é um objeto raso (sem aninhamento) — vira tabela GFM. */
function ehArrayDeObjetosPlanos(arr: unknown[]): arr is Record<string, unknown>[] {
  return arr.length > 0 && arr.every(item => ehObjetoPlano(item) && Object.values(item).every(x => x === null || typeof x !== 'object'));
}

function jsonValorParaMarkdown(valor: unknown, profundidade: number, tituloChave: string | null, linhas: string[]): void {
  const nivel = Math.min(profundidade + 1, 6);

  if (Array.isArray(valor)) {
    if (tituloChave) linhas.push(`${'#'.repeat(nivel)} ${tituloChave}`, '');
    if (valor.length === 0) { linhas.push('_(lista vazia)_', ''); return; }

    if (ehArrayDeObjetosPlanos(valor)) {
      const colunas = Array.from(new Set(valor.flatMap(item => Object.keys(item))));
      linhas.push(`| ${colunas.join(' | ')} |`);
      linhas.push(`| ${colunas.map(() => '---').join(' | ')} |`);
      for (const item of valor) {
        linhas.push(`| ${colunas.map(c => escapeCelula(formatarValorPrimitivo(item[c]))).join(' | ')} |`);
      }
      linhas.push('');
    } else {
      valor.forEach((item, idx) => {
        if (item !== null && typeof item === 'object') {
          linhas.push(`${'#'.repeat(Math.min(nivel + 1, 6))} [${idx}]`);
          jsonValorParaMarkdown(item, profundidade + 1, null, linhas);
        } else {
          linhas.push(`- ${valorEmBullet(item)}`);
        }
      });
      linhas.push('');
    }
    return;
  }

  if (ehObjetoPlano(valor)) {
    if (tituloChave) linhas.push(`${'#'.repeat(nivel)} ${tituloChave}`, '');
    const entradas = Object.entries(valor);
    if (entradas.length === 0) { linhas.push('_(objeto vazio)_', ''); return; }

    const primitivas = entradas.filter(([, v]) => v === null || typeof v !== 'object');
    const complexas = entradas.filter(([, v]) => v !== null && typeof v === 'object');

    for (const [k, v] of primitivas) linhas.push(`- **${k}**: ${valorEmBullet(v)}`);
    if (primitivas.length > 0) linhas.push('');
    for (const [k, v] of complexas) jsonValorParaMarkdown(v, profundidade + 1, k, linhas);
    return;
  }

  if (tituloChave) linhas.push(`${'#'.repeat(nivel)} ${tituloChave}`, '');
  linhas.push(formatarValorPrimitivo(valor), '');
}

export function jsonParaMarkdown(textoJson: string): string {
  const dados = JSON.parse(textoJson);
  const linhas: string[] = [];
  jsonValorParaMarkdown(dados, 0, null, linhas);
  return linhas.join('\n').trim() + '\n';
}

/* ------------------------------------------------------------------------ */
/* XML → Markdown                                                            */
/* ------------------------------------------------------------------------ */

interface NoXml {
  tag: string;
  attrs: Record<string, string>;
  filhos: NoXml[];
  texto: string;
}

function decodificarEntidades(s: string): string {
  return s.replace(/&(amp|lt|gt|quot|apos|#x[0-9a-fA-F]+|#\d+);/g, (m, ent: string) => {
    switch (ent) {
      case 'amp': return '&';
      case 'lt': return '<';
      case 'gt': return '>';
      case 'quot': return '"';
      case 'apos': return "'";
      default: {
        const codigo = ent[1] === 'x' || ent[1] === 'X' ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10);
        return Number.isFinite(codigo) ? String.fromCodePoint(codigo) : m;
      }
    }
  });
}

/**
 * Parser de XML mínimo, escrito à mão de propósito (ver comentário no topo
 * do arquivo): elementos, atributos, texto, CDATA e comentários. Não valida
 * conformidade estrita — melhor esforço para converter, nunca lança por XML
 * levemente malformado quando dá para seguir em frente.
 */
function parseXml(xml: string): NoXml {
  let i = 0;
  const n = xml.length;

  const ehEspaco = (c: string) => c === ' ' || c === '\t' || c === '\n' || c === '\r';
  function pularEspacos() { while (i < n && ehEspaco(xml[i])) i++; }

  function pularProlog() {
    while (i < n) {
      pularEspacos();
      if (xml.startsWith('<?', i)) { const fim = xml.indexOf('?>', i); i = fim === -1 ? n : fim + 2; continue; }
      if (xml.startsWith('<!--', i)) { const fim = xml.indexOf('-->', i); i = fim === -1 ? n : fim + 3; continue; }
      if (xml.startsWith('<!DOCTYPE', i) || xml.startsWith('<!doctype', i)) {
        let profundidade = 0;
        while (i < n) {
          if (xml[i] === '[') profundidade++;
          else if (xml[i] === ']') profundidade--;
          else if (xml[i] === '>' && profundidade <= 0) { i++; break; }
          i++;
        }
        continue;
      }
      break;
    }
  }

  function parseElemento(): NoXml {
    i++; // consome '<'
    const inicioNome = i;
    while (i < n && !ehEspaco(xml[i]) && xml[i] !== '/' && xml[i] !== '>') i++;
    const tag = xml.slice(inicioNome, i);
    const attrs: Record<string, string> = {};

    while (true) {
      pularEspacos();
      if (xml.startsWith('/>', i)) { i += 2; return { tag, attrs, filhos: [], texto: '' }; }
      if (xml[i] === '>') { i++; break; }
      if (i >= n) return { tag, attrs, filhos: [], texto: '' };

      const inicioAttr = i;
      while (i < n && !ehEspaco(xml[i]) && xml[i] !== '=' && xml[i] !== '>' && xml[i] !== '/') i++;
      const nomeAttr = xml.slice(inicioAttr, i);
      if (!nomeAttr) { i++; continue; }
      pularEspacos();
      if (xml[i] === '=') {
        i++;
        pularEspacos();
        const aspas = xml[i];
        if (aspas === '"' || aspas === "'") {
          i++;
          const inicioVal = i;
          while (i < n && xml[i] !== aspas) i++;
          attrs[nomeAttr] = decodificarEntidades(xml.slice(inicioVal, i));
          i++;
        }
      } else {
        attrs[nomeAttr] = '';
      }
    }

    const filhos: NoXml[] = [];
    let texto = '';
    while (i < n) {
      if (xml.startsWith('</', i)) {
        i += 2;
        while (i < n && xml[i] !== '>') i++;
        i++;
        break;
      } else if (xml.startsWith('<!--', i)) {
        const fim = xml.indexOf('-->', i);
        i = fim === -1 ? n : fim + 3;
      } else if (xml.startsWith('<![CDATA[', i)) {
        const fim = xml.indexOf(']]>', i);
        texto += fim === -1 ? xml.slice(i + 9) : xml.slice(i + 9, fim);
        i = fim === -1 ? n : fim + 3;
      } else if (xml.startsWith('<?', i)) {
        const fim = xml.indexOf('?>', i);
        i = fim === -1 ? n : fim + 2;
      } else if (xml[i] === '<') {
        filhos.push(parseElemento());
      } else {
        const inicioTexto = i;
        while (i < n && xml[i] !== '<') i++;
        texto += decodificarEntidades(xml.slice(inicioTexto, i));
      }
    }
    return { tag, attrs, filhos, texto: texto.trim() };
  }

  pularProlog();
  pularEspacos();
  if (xml[i] !== '<') throw new Error('XML sem elemento raiz reconhecível.');
  return parseElemento();
}

function xmlNoParaMarkdown(no: NoXml, profundidade: number, linhas: string[]): void {
  const nivel = Math.min(profundidade + 1, 6);
  linhas.push(`${'#'.repeat(nivel)} <${no.tag}>`);

  const atributos = Object.entries(no.attrs);
  if (atributos.length > 0) {
    linhas.push('');
    for (const [k, v] of atributos) linhas.push(`- **@${k}**: ${v}`);
  }

  if (no.filhos.length === 0) {
    linhas.push('');
    if (no.texto) linhas.push(no.texto, '');
    return;
  }

  // Agrupa filhos por tag, preservando a ordem de primeira ocorrência.
  const grupos = new Map<string, NoXml[]>();
  const ordem: string[] = [];
  for (const filho of no.filhos) {
    if (!grupos.has(filho.tag)) { grupos.set(filho.tag, []); ordem.push(filho.tag); }
    grupos.get(filho.tag)!.push(filho);
  }

  linhas.push('');
  if (no.texto) linhas.push(no.texto, '');

  for (const tag of ordem) {
    const grupo = grupos.get(tag)!;
    const todosSemFilhos = grupo.every(g => g.filhos.length === 0);

    if (grupo.length > 1 && todosSemFilhos) {
      const colunasAttr = Array.from(new Set(grupo.flatMap(g => Object.keys(g.attrs))));
      const algumTemTexto = grupo.some(g => g.texto);
      const colunas = [...colunasAttr, ...(algumTemTexto ? ['texto'] : [])];

      linhas.push(`**${tag}** (${grupo.length} itens)`, '');
      if (colunas.length === 0) {
        for (const _ of grupo) linhas.push(`- <${tag}/>`);
      } else {
        linhas.push(`| ${colunas.join(' | ')} |`);
        linhas.push(`| ${colunas.map(() => '---').join(' | ')} |`);
        for (const g of grupo) {
          const linha = colunas.map(c => escapeCelula(c === 'texto' ? g.texto : (g.attrs[c] ?? '')));
          linhas.push(`| ${linha.join(' | ')} |`);
        }
      }
      linhas.push('');
    } else {
      for (const g of grupo) xmlNoParaMarkdown(g, profundidade + 1, linhas);
    }
  }
}

export function xmlParaMarkdown(textoXml: string): string {
  const raiz = parseXml(textoXml);
  const linhas: string[] = [];
  xmlNoParaMarkdown(raiz, 0, linhas);
  return linhas.join('\n').trim() + '\n';
}

/* ------------------------------------------------------------------------ */
/* Orquestração                                                              */
/* ------------------------------------------------------------------------ */

export interface ResultadoConversao {
  markdown: string;
  duracaoMs: number;
  caracteres: number;
  /** Heurística local (~4 caracteres/token) — usada quando não há contagem real do provedor. */
  tokensEstimados: number;
  resumo: string;
  /** Só preenchido na via de IA (converterMarkdownApi.ts): contagem real devolvida pelo provedor, mais precisa que `tokensEstimados`. */
  tokensReais?: number;
  /** Só preenchido na via de IA — estimativa de custo em USD calculada pela Edge Function a partir da tabela de preço do modelo. `null` quando o modelo não está na tabela. */
  custoUsd?: number | null;
  /** Estimativa de custo em BRL (conversão de USD multiplicando pela taxa fixa de 6). */
  custoBrl?: number | null;
  /** Só preenchido na via de IA — modelo/provedor que atendeu a chamada (ex.: "gemini:gemini-2.0-flash"). */
  modelo?: string;
}

function contarLinhasTabela(markdown: string): number {
  // Conta linhas de dado de tabela GFM (ignora cabeçalho e o separador ---).
  return (markdown.match(/^\|.*\|$/gm) ?? []).length;
}

function resumoDe(caracteres: number, linhasTabela: number): string {
  return linhasTabela > 0
    ? `${caracteres.toLocaleString('pt-BR')} caracteres · ~${linhasTabela.toLocaleString('pt-BR')} linhas de tabela`
    : `${caracteres.toLocaleString('pt-BR')} caracteres`;
}

/** Exportado para ser reaproveitado pela via de conversão com IA (converterMarkdownApi.ts), que mede sua própria duração de round-trip mas quer o mesmo formato de resumo/métricas. */
export function montarResultado(markdown: string, inicio: number): ResultadoConversao {
  const duracaoMs = Math.round(performance.now() - inicio);
  const caracteres = markdown.length;
  const linhasTabela = contarLinhasTabela(markdown);
  return {
    markdown,
    duracaoMs,
    caracteres,
    tokensEstimados: estimarTokens(markdown),
    resumo: resumoDe(caracteres, linhasTabela),
  };
}

export class ConversaoNaoSuportadaError extends Error {
  constructor(public formato: FormatoArquivo) {
    super('Transcrição de áudio ainda não está disponível nesta versão — em breve.');
  }
}

/**
 * Converte um arquivo para Markdown sem IA (planilha, JSON, XML — client-side,
 * determinístico). PDF e imagem passam por OCR com IA em
 * `converterMarkdownApi.ts` (precisa de rede); áudio ainda não tem provedor
 * configurado e lança `ConversaoNaoSuportadaError`. Quem decide qual via
 * chamar por formato é a tela (ver ImportarPropostasPanel.tsx, Etapa 1 de
 * Cotações).
 */
export async function converterArquivoParaMarkdown(file: File): Promise<ResultadoConversao> {
  const formato = detectarFormato(file.name);
  const inicio = performance.now();

  switch (formato) {
    case 'xlsx':
    case 'csv':
      return montarResultado(await xlsxOuCsvParaMarkdown(file, formato), inicio);
    case 'json':
      return montarResultado(jsonParaMarkdown(await file.text()), inicio);
    case 'xml':
      return montarResultado(xmlParaMarkdown(await file.text()), inicio);
    case 'audio':
      throw new ConversaoNaoSuportadaError(formato);
    case 'pdf':
    case 'imagem':
      // Defensivo: a tela nunca deveria chamar esta função pura para estes
      // formatos — eles vão para converterComIA (converterMarkdownApi.ts).
      throw new Error(`"${file.name}" precisa da via de conversão com IA (converterComIA), não desta função.`);
    default:
      throw new Error(`Formato de arquivo não reconhecido: "${file.name}".`);
  }
}

/** Une os markdowns já convertidos num único campo de cópia, um arquivo por seção. */
export function consolidarMarkdown(itens: { nome: string; markdown: string }[]): string {
  return itens
    .map(item => `# ${item.nome}\n\n${item.markdown.trim()}`)
    .join('\n\n---\n\n')
    .concat('\n');
}
