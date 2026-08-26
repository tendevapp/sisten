/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Renderizador leve de Markdown (GFM) para pré-visualização — sem
 * dependência externa. Cobre exatamente o que `markdownConvert.ts` gera
 * (títulos, negrito, tabelas com células escapadas/`<br>`, listas com
 * continuação indentada, `---` como separador) mais o básico que a via de
 * IA (OCR de PDF/imagem) costuma devolver (blocos de código, citação, link).
 * Não usa `dangerouslySetInnerHTML` — todo texto passa por nós React comuns.
 */

import React, { useMemo } from 'react';

function unescapeCelula(s: string): string {
  return s.replace(/\\\|/g, '|');
}

function renderInlineSegmento(texto: string, keyPrefix: string): React.ReactNode[] {
  const regex = /(\*\*.+?\*\*|`.+?`|\[.+?\]\(.+?\)|(?<![\w])_[^_]+_(?![\w]))/g;
  const partes = texto.split(regex).filter(p => p !== undefined && p !== '');
  return partes.map((parte, i) => {
    const key = `${keyPrefix}-${i}`;
    if (/^\*\*.+\*\*$/.test(parte)) {
      return <strong key={key} className="font-semibold text-slate-900 dark:text-white">{parte.slice(2, -2)}</strong>;
    }
    if (/^`.+`$/.test(parte)) {
      return <code key={key} className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[0.85em] text-slate-700 dark:bg-slate-800 dark:text-slate-200">{parte.slice(1, -1)}</code>;
    }
    const link = parte.match(/^\[(.+?)\]\((.+?)\)$/);
    if (link) {
      return <a key={key} href={link[2]} target="_blank" rel="noopener noreferrer" className="text-indigo-600 underline hover:text-indigo-700 dark:text-indigo-400">{link[1]}</a>;
    }
    if (/^_[^_]+_$/.test(parte)) {
      return <em key={key} className="text-slate-500 dark:text-slate-400">{parte.slice(1, -1)}</em>;
    }
    return parte;
  });
}

/** Trata `<br>` literal (gerado por `escapeCelula`/listas multilinha) como quebra de linha real. */
function renderInline(texto: string, keyPrefix: string): React.ReactNode[] {
  const partes = texto.split(/<br\s*\/?>/i);
  const nodes: React.ReactNode[] = [];
  partes.forEach((parte, i) => {
    if (i > 0) nodes.push(<br key={`${keyPrefix}-br-${i}`} />);
    nodes.push(...renderInlineSegmento(parte, `${keyPrefix}-${i}`));
  });
  return nodes;
}

function splitLinhaTabela(linha: string): string[] {
  const semBordas = linha.trim().replace(/^\|/, '').replace(/\|$/, '');
  const celulas: string[] = [];
  let atual = '';
  for (let i = 0; i < semBordas.length; i++) {
    if (semBordas[i] === '\\' && semBordas[i + 1] === '|') { atual += '|'; i++; continue; }
    if (semBordas[i] === '|') { celulas.push(atual); atual = ''; continue; }
    atual += semBordas[i];
  }
  celulas.push(atual);
  return celulas.map(c => c.trim());
}

const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const HR_RE = /^-{3,}\s*$/;
const TABLE_ROW_RE = /^\s*\|.*\|\s*$/;
const TABLE_SEP_RE = /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/;
const UL_RE = /^\s*[-*]\s+(.*)$/;
const OL_RE = /^\s*\d+\.\s+(.*)$/;
const QUOTE_RE = /^>\s?(.*)$/;

function Titulo({ nivel, children }: { nivel: number; children: React.ReactNode }) {
  const base = 'font-bold text-slate-900 dark:text-slate-50';
  switch (nivel) {
    case 1: return <h1 className={`${base} mt-4 text-lg first:mt-0`}>{children}</h1>;
    case 2: return <h2 className={`${base} mt-3 text-base first:mt-0`}>{children}</h2>;
    case 3: return <h3 className={`${base} mt-3 text-sm first:mt-0`}>{children}</h3>;
    case 4: return <h4 className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-50">{children}</h4>;
    default: return <h5 className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{children}</h5>;
  }
}

function parseBlocos(markdown: string): React.ReactNode[] {
  const linhas = markdown.replace(/\r\n/g, '\n').split('\n');
  const blocos: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < linhas.length) {
    const linha = linhas[i];

    if (linha.trim() === '') { i++; continue; }

    // Bloco de código
    if (/^```/.test(linha.trim())) {
      const codigo: string[] = [];
      i++;
      while (i < linhas.length && !/^```/.test(linhas[i].trim())) { codigo.push(linhas[i]); i++; }
      i++;
      blocos.push(
        <pre key={key++} className="overflow-x-auto rounded-lg bg-slate-900 p-3 text-[11px] text-slate-100">
          <code>{codigo.join('\n')}</code>
        </pre>
      );
      continue;
    }

    // Título
    const h = linha.match(HEADING_RE);
    if (h) {
      const nivel = h[1].length;
      const headingKey = key++;
      blocos.push(<Titulo key={headingKey} nivel={nivel}>{renderInline(h[2], `h${headingKey}`)}</Titulo>);
      i++;
      continue;
    }

    // Linha horizontal (separador entre arquivos no consolidado)
    if (HR_RE.test(linha.trim())) {
      blocos.push(<hr key={key++} className="my-3 border-slate-200 dark:border-slate-800" />);
      i++;
      continue;
    }

    // Tabela GFM: linha atual é o cabeçalho, próxima é o separador ---|---|---
    if (TABLE_ROW_RE.test(linha) && i + 1 < linhas.length && TABLE_SEP_RE.test(linhas[i + 1].trim())) {
      const cabecalho = splitLinhaTabela(linha).map(unescapeCelula);
      i += 2;
      const corpo: string[][] = [];
      while (i < linhas.length && TABLE_ROW_RE.test(linhas[i])) {
        corpo.push(splitLinhaTabela(linhas[i]).map(unescapeCelula));
        i++;
      }
      const tabelaKey = key++;
      blocos.push(
        <div key={tabelaKey} className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
          <table className="w-full min-w-max border-collapse text-xs">
            <thead className="bg-slate-100 dark:bg-slate-800/60">
              <tr>
                {cabecalho.map((c, ci) => (
                  <th key={ci} className="whitespace-nowrap border-b border-slate-200 px-2.5 py-1.5 text-left font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200">
                    {renderInline(c, `th${tabelaKey}-${ci}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {corpo.map((r, ri) => (
                <tr key={ri} className="border-b border-slate-100 last:border-0 odd:bg-white even:bg-slate-50/60 dark:border-slate-800 dark:odd:bg-slate-900 dark:even:bg-slate-800/30">
                  {cabecalho.map((_, ci) => (
                    <td key={ci} className="px-2.5 py-1.5 align-top text-slate-600 dark:text-slate-300">
                      {renderInline(r[ci] ?? '', `td${tabelaKey}-${ri}-${ci}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    // Lista (ordenada ou não), com continuação indentada (2+ espaços — ver `valorEmBullet`)
    if (UL_RE.test(linha) || OL_RE.test(linha)) {
      const ordenada = OL_RE.test(linha);
      const itens: string[] = [];
      while (i < linhas.length) {
        const m = ordenada ? linhas[i].match(OL_RE) : linhas[i].match(UL_RE);
        if (!m) break;
        itens.push(m[1]);
        i++;
        while (i < linhas.length && /^\s{2,}\S/.test(linhas[i])) {
          itens[itens.length - 1] += '<br>' + linhas[i].trim();
          i++;
        }
      }
      const listaKey = key++;
      const conteudo = itens.map((it, idx) => <li key={idx}>{renderInline(it, `li${listaKey}-${idx}`)}</li>);
      blocos.push(
        ordenada
          ? <ol key={listaKey} className="list-decimal space-y-1 pl-5 text-sm text-slate-700 dark:text-slate-200">{conteudo}</ol>
          : <ul key={listaKey} className="list-disc space-y-1 pl-5 text-sm text-slate-700 dark:text-slate-200">{conteudo}</ul>
      );
      continue;
    }

    // Citação
    if (QUOTE_RE.test(linha)) {
      const partes: string[] = [];
      while (i < linhas.length && QUOTE_RE.test(linhas[i])) {
        partes.push(linhas[i].match(QUOTE_RE)![1]);
        i++;
      }
      const bqKey = key++;
      blocos.push(
        <blockquote key={bqKey} className="border-l-2 border-indigo-300 pl-3 text-sm italic text-slate-500 dark:border-indigo-700 dark:text-slate-400">
          {renderInline(partes.join(' '), `bq${bqKey}`)}
        </blockquote>
      );
      continue;
    }

    // Parágrafo (uma linha do gerador = uma unidade lógica)
    {
      const pKey = key++;
      blocos.push(
        <p key={pKey} className="text-sm leading-relaxed text-slate-700 dark:text-slate-200">
          {renderInline(linha, `p${pKey}`)}
        </p>
      );
    }
    i++;
  }

  return blocos;
}

interface MarkdownPreviewProps {
  markdown: string;
  className?: string;
}

export default function MarkdownPreview({ markdown, className }: MarkdownPreviewProps) {
  const blocos = useMemo(() => parseBlocos(markdown), [markdown]);
  return <div className={`space-y-2.5 ${className ?? ''}`}>{blocos}</div>;
}
