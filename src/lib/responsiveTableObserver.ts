/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Observador e enriquecedor dinâmico de tabelas para exibição em cartões (cards) no mobile.
 *
 * Em telas móveis (<= 768px), o CSS transforma linhas de tabela em cartões.
 * Para que cada campo (td) exiba seu respectivo título via pseudo-elemento
 * (td::before { content: attr(data-label) }), este módulo insere automaticamente
 * o atributo `data-label` a partir do `th` correspondente.
 *
 * Suporta:
 * - Leitura automática de thead th (inclusive tabelas com ordenação);
 * - Colunas de ação (data-card-actions="true");
 * - Linhas de mensagem/vazio com colSpan (data-card-full-width="true");
 * - Opt-out via atributo `data-no-cards` ou classe `no-responsive-cards`;
 * - Atualizações dinâmicas via MutationObserver ao filtrar, paginar ou carregar dados.
 */

const REGEX_ACOES = /^(ações|ação|acoes|acao|opções|opcoes|actions|action)$/i;

/**
 * Extrai o texto limpo do cabeçalho da coluna.
 * Descarta textos de leitores de tela ou elementos ocultos que poluiriam o rótulo.
 */
export function extrairTextoCabecalho(th: HTMLElement): string {
  // Se houver um aria-label ou title explícito no th ou em seu botão interno
  const botao = th.querySelector('button');
  const ariaLabel = th.getAttribute('aria-label') || botao?.getAttribute('aria-label');
  if (ariaLabel && ariaLabel.trim()) {
    // Se o aria-label começar com "Ordenar por", pega só o nome da coluna
    const matchOrdenar = ariaLabel.match(/ordenar\s+por\s+(.+)/i);
    if (matchOrdenar) return matchOrdenar[1].trim();
    return ariaLabel.trim();
  }

  // Clona o nó para poder remover nós de suporte visual (ex: sr-only) sem afetar a DOM
  const clone = th.cloneNode(true) as HTMLElement;
  const elementosRemover = clone.querySelectorAll('.sr-only, [aria-hidden="true"], svg');
  elementosRemover.forEach((el) => el.remove());

  const texto = clone.textContent?.trim() || '';
  if (texto) return texto;

  // Fallback para title ou aria-label geral
  return th.getAttribute('title')?.trim() || botao?.getAttribute('title')?.trim() || '';
}

/**
 * Enriquece uma única tabela com os atributos necessários para os cards mobile.
 */
export function enrichTable(table: HTMLTableElement): void {
  if (table.hasAttribute('data-no-cards') || table.classList.contains('no-responsive-cards')) {
    return;
  }

  // Procura os cabeçalhos:
  // 1) thead tr th (se houver mais de uma linha no thead, usa a última de ths)
  // 2) ou primeira linha da tabela contendo th
  let thElements: HTMLElement[] = [];
  const theadRows = table.querySelectorAll('thead tr');
  if (theadRows.length > 0) {
    const ultimaLinhaThead = theadRows[theadRows.length - 1];
    thElements = Array.from(ultimaLinhaThead.querySelectorAll('th'));
  }

  if (thElements.length === 0) {
    const primeiraLinhaTh = table.querySelector('tr th');
    if (primeiraLinhaTh && primeiraLinhaTh.parentElement) {
      thElements = Array.from(primeiraLinhaTh.parentElement.querySelectorAll('th'));
    }
  }

  const cabecalhos = thElements.map(extrairTextoCabecalho);
  const totalColunas = cabecalhos.length;

  // Localiza todas as linhas de dados no tbody (ou tr que contenham td)
  const tbodies = table.tBodies.length > 0 ? Array.from(table.tBodies) : [table];
  const trElements = tbodies.flatMap((tbody) => Array.from(tbody.querySelectorAll('tr')));

  for (const tr of trElements) {
    // Pula linhas de cabeçalho ou linhas com opt-out explícito
    if (tr.querySelector('th') || tr.hasAttribute('data-no-card') || tr.classList.contains('no-card')) {
      continue;
    }

    const tds = Array.from(tr.querySelectorAll('td'));
    if (tds.length === 0) continue;

    // Caso de linha de aviso/vazio: 1 célula com colSpan cobrindo múltiplas colunas
    if (tds.length === 1) {
      const primeiroTd = tds[0];
      const span = primeiroTd.colSpan || 1;
      if (span >= 2 && (totalColunas <= 1 || span >= totalColunas)) {
        primeiroTd.setAttribute('data-card-full-width', 'true');
        primeiroTd.removeAttribute('data-label');
        continue;
      }
    }

    let colIdx = 0;
    for (const td of tds) {
      const span = td.colSpan || 1;

      // Se for uma célula cobrindo múltiplas colunas (ex: sub-cabeçalho ou aviso)
      if (span >= 2 && totalColunas > 1 && span >= totalColunas) {
        td.setAttribute('data-card-full-width', 'true');
        td.removeAttribute('data-label');
        colIdx += span;
        continue;
      }

      const label = cabecalhos[colIdx] ?? '';
      if (label && !td.hasAttribute('data-label')) {
        td.setAttribute('data-label', label);
      }

      // Identifica coluna de ações
      if (REGEX_ACOES.test(label)) {
        td.setAttribute('data-card-actions', 'true');
      } else if (
        colIdx === totalColunas - 1 &&
        (td.querySelector('button') || td.querySelector('a')) &&
        !td.textContent?.replace(/\s+/g, '')
      ) {
        // Coluna sem texto no cabeçalho mas com botões na última posição
        td.setAttribute('data-card-actions', 'true');
      }

      colIdx += span;
    }
  }

  table.setAttribute('data-responsive-cards', 'true');
}

/**
 * Percorre todas as tabelas dentro de uma raiz e as enriquece.
 */
export function enhanceAllTables(root: HTMLElement | Document = document): void {
  const tables = root.querySelectorAll<HTMLTableElement>('table');
  tables.forEach(enrichTable);
}

/**
 * Inicializa o observador de mutação global para enriquecer automaticamente
 * tabelas à medida que forem renderizadas ou modificadas no DOM.
 *
 * Retorna uma função para desligar o observador se desejado.
 */
export function initResponsiveTables(): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return () => {};
  }

  let rafId: number | null = null;

  const processar = () => {
    rafId = null;
    enhanceAllTables(document);
  };

  const agendarProcessamento = () => {
    if (rafId !== null) return;
    rafId = window.requestAnimationFrame(processar);
  };

  // Primeira varredura
  agendarProcessamento();

  // Observa inserções ou alterações de nós no DOM
  const observer = new MutationObserver((mutations) => {
    let deveAtualizar = false;
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        for (const node of Array.from(mutation.addedNodes)) {
          if (node instanceof HTMLElement) {
            if (node.nodeName === 'TABLE' || node.querySelector('table')) {
              deveAtualizar = true;
              break;
            }
          }
        }
      }
      if (deveAtualizar) break;
    }

    if (deveAtualizar) {
      agendarProcessamento();
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  return () => {
    if (rafId !== null) {
      window.cancelAnimationFrame(rafId);
    }
    observer.disconnect();
  };
}
