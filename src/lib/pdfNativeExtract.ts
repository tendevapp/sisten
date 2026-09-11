/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Extração nativa de texto de arquivos PDF no navegador (client-side) usando pdfjs-dist.
 *
 * Converte PDFs vetoriais/digitais (gerados por ERPs, sistemas, Word, etc.)
 * diretamente em Markdown estruturado em milissegundos e com custo R$ 0,00.
 *
 * Se o PDF for puramente escaneado/imagem (sem camada de texto vetorial),
 * a função retorna `null`, permitindo que o chamador faça fallback transparente
 * para a Edge Function de OCR com IA (`converterComIA`).
 */

import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import pdfjsWorker from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import { montarResultado, type ResultadoConversao } from './markdownConvert';

// Configura o worker do PDF.js para o ambiente Vite/browser
if (typeof window !== 'undefined' && pdfjsLib.GlobalWorkerOptions) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;
}

interface ItemTextoPosicionado {
  x: number;
  y: number;
  str: string;
  width?: number;
  height?: number;
}

/**
 * Agrupa itens de texto da página por proximidade vertical (coordenada Y),
 * ordenando cada linha da esquerda para a direita (coordenada X) e as linhas
 * de cima para baixo (Y decrescente no sistema de coordenadas do PDF).
 */
function estruturarTextoPagina(items: ItemTextoPosicionado[], toleranciaY = 4): string {
  const linhasMap = new Map<number, ItemTextoPosicionado[]>();

  for (const item of items) {
    if (!item.str || !item.str.trim()) continue;

    const y = Math.round(item.y);
    let targetY: number | null = null;

    for (const key of linhasMap.keys()) {
      if (Math.abs(key - y) <= toleranciaY) {
        targetY = key;
        break;
      }
    }

    const yFinal = targetY !== null ? targetY : y;
    if (!linhasMap.has(yFinal)) {
      linhasMap.set(yFinal, []);
    }
    linhasMap.get(yFinal)!.push(item);
  }

  // No PDF, Y=0 fica na base inferior da página; Y maior fica no topo.
  // Ordena Y decrescente (do topo para o rodapé).
  const ysOrdenados = Array.from(linhasMap.keys()).sort((a, b) => b - a);

  const linhasTexto: string[] = [];
  for (const y of ysOrdenados) {
    const itensLinha = linhasMap.get(y)!.sort((a, b) => a.x - b.x);

    // Concatena itens da linha. Se houver espaçamento considerável entre colunas, usa múltiplos espaços
    let linhaStr = '';
    let ultimoXFim = -1;

    for (const it of itensLinha) {
      if (ultimoXFim >= 0) {
        const espacoX = it.x - ultimoXFim;
        if (espacoX > 15) {
          linhaStr += '   ';
        } else if (espacoX > 3) {
          linhaStr += ' ';
        }
      }
      linhaStr += it.str.trim();
      ultimoXFim = it.x + (it.width ?? (it.str.length * 5));
    }

    if (linhaStr.trim()) {
      linhasTexto.push(linhaStr);
    }
  }

  return linhasTexto.join('\n');
}

/**
 * Extrai o texto de um arquivo PDF no navegador.
 *
 * Retorna o Markdown estruturado por página ou `null` caso o PDF não contenha
 * texto digital suficiente (indício de PDF escaneado/imagem que necessita de OCR com IA).
 */
export async function extrairTextoPdfNativo(
  arquivo: File | ArrayBuffer | Uint8Array,
  minCaracteres = 50
): Promise<{ markdown: string; paginas: number; caracteres: number } | null> {
  const bytes = arquivo instanceof File
    ? new Uint8Array(await arquivo.arrayBuffer())
    : arquivo instanceof ArrayBuffer
    ? new Uint8Array(arquivo)
    : arquivo;

  const loadingTask = pdfjsLib.getDocument({
    data: bytes,
    disableFontFace: true,
  });

  const doc = await loadingTask.promise;
  const totalPaginas = doc.numPages;
  const paginasTexto: string[] = [];
  let totalCaracteres = 0;

  for (let numPagina = 1; numPagina <= totalPaginas; numPagina++) {
    const pagina = await doc.getPage(numPagina);
    const textContent = await pagina.getTextContent();

    const items: ItemTextoPosicionado[] = [];
    for (const item of textContent.items) {
      if ('str' in item && typeof item.str === 'string') {
        const transform = item.transform as number[];
        const x = transform?.[4] ?? 0;
        const y = transform?.[5] ?? 0;
        const width = (item as { width?: number }).width;
        const height = (item as { height?: number }).height;

        items.push({ x, y, str: item.str, width, height });
      }
    }

    const textoPagina = estruturarTextoPagina(items);
    totalCaracteres += textoPagina.replace(/\s/g, '').length;

    if (textoPagina.trim()) {
      paginasTexto.push(totalPaginas > 1 ? `## Página ${numPagina}\n\n${textoPagina}` : textoPagina);
    }
  }

  // Se não extraiu texto suficiente ou documento é escaneado/em branco, devolve null para fallback
  if (totalCaracteres < minCaracteres) {
    return null;
  }

  const markdown = paginasTexto.join('\n\n---\n\n');
  return {
    markdown,
    paginas: totalPaginas,
    caracteres: markdown.length,
  };
}

/**
 * Converte um arquivo PDF para Markdown usando extração nativa client-side.
 * Devolve `ResultadoConversao` pronto ou `null` caso necessite de OCR via IA.
 */
export async function converterPdfNativoParaMarkdown(file: File): Promise<ResultadoConversao | null> {
  const inicio = performance.now();
  const extraido = await extrairTextoPdfNativo(file);

  if (!extraido) {
    return null;
  }

  const base = montarResultado(extraido.markdown, inicio);
  return {
    ...base,
    tokensReais: base.tokensEstimados,
    custoUsd: 0,
    custoBrl: 0,
    modelo: 'Nativo (local, sem IA)',
  };
}
