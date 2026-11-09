/**
 * Barra de rolagem horizontal no TOPO de toda tabela larga (regra do app, ver
 * CLAUDE.md §6).
 *
 * Em tabela comprida, a barra de rolagem lateral nativa fica no pé da tabela:
 * para ver uma coluna da direita era preciso descer até o fim, arrastar e subir
 * de novo. Cinco telas resolviam isso à mão, cada uma do seu jeito (DataTable,
 * Mapa Comparativo, Lead Time, Central de Solicitações, TabelaComRolagemSuperior);
 * as outras ~230 tabelas não tinham nada.
 *
 * Este módulo segue o mesmo caminho do `responsiveTableObserver`: um observador
 * no <body> encontra cada <table> dentro de um contêiner com rolagem horizontal
 * e põe, logo acima do contêiner, uma barra-espelho sincronizada nos dois
 * sentidos. A barra só aparece quando a tabela de fato transborda; no celular
 * a tabela vira cartões e não transborda, então ela some sozinha.
 *
 * Opt-out: `data-rolagem-superior="propria"` (a tela já tem a sua) ou
 * `data-rolagem-superior="nao"` no contêiner de rolagem ou na própria tabela.
 */

const ATRIBUTO_BARRA = 'data-barra-rolagem-superior';
const VALORES_OPT_OUT = new Set(['propria', 'nao']);
/** Quantos níveis acima da <table> procurar o contêiner de rolagem. */
const NIVEIS_BUSCA = 4;

/** Sobra de 1px para arredondamento de subpixel não acender a barra à toa. */
export function transbordaHorizontal(scrollWidth: number, clientWidth: number): boolean {
  return scrollWidth - clientWidth > 1;
}

interface Vinculo {
  barra: HTMLDivElement;
  miolo: HTMLDivElement;
  resize: ResizeObserver;
  aoRolarAlvo: () => void;
}

const vinculos = new Map<HTMLElement, Vinculo>();

function optOut(el: Element | null): boolean {
  const v = el?.getAttribute('data-rolagem-superior');
  return !!v && VALORES_OPT_OUT.has(v);
}

/** Contêiner com rolagem horizontal mais próximo da tabela, ou null. */
export function acharContainerRolagem(tabela: HTMLTableElement): HTMLElement | null {
  if (optOut(tabela)) return null;
  let el = tabela.parentElement;
  for (let nivel = 0; el && nivel < NIVEIS_BUSCA; nivel++, el = el.parentElement) {
    if (el.tagName === 'MAIN' || el === document.body) return null;
    if (optOut(el)) return null;
    const ox = getComputedStyle(el).overflowX;
    if (ox === 'auto' || ox === 'scroll') return el;
  }
  return null;
}

function atualizar(alvo: HTMLElement, v: Vinculo) {
  const mostra = transbordaHorizontal(alvo.scrollWidth, alvo.clientWidth);
  v.barra.hidden = !mostra;
  if (!mostra) return;
  // Mesma largura e mesmo recuo do contêiner, que pode ter margem própria
  // (`mx-4`). Os dois são irmãos, então offsetLeft tem a mesma origem.
  const margemAtual = parseFloat(v.barra.style.marginLeft || '0');
  const esquerdaNatural = v.barra.offsetLeft - margemAtual;
  v.barra.style.marginLeft = `${alvo.offsetLeft - esquerdaNatural}px`;
  v.barra.style.width = `${alvo.offsetWidth}px`;
  v.miolo.style.width = `${alvo.scrollWidth}px`;
  if (Math.abs(v.barra.scrollLeft - alvo.scrollLeft) > 1) v.barra.scrollLeft = alvo.scrollLeft;
}

/**
 * A barra entra como irmã ANTES do contêiner. Só dá certo se o pai empilhar os
 * filhos na vertical; num flex em linha ou num grid ela viraria uma coluna ao
 * lado da tabela. Nesses casos a tela fica sem barra superior.
 */
export function paiEmpilhaVertical(pai: HTMLElement): boolean {
  const s = getComputedStyle(pai);
  if (s.display === 'block' || s.display === 'flow-root' || s.display === 'list-item') return true;
  if (s.display === 'flex' || s.display === 'inline-flex') return s.flexDirection === 'column';
  return false;
}

function vincular(alvo: HTMLElement) {
  if (vinculos.has(alvo) || !alvo.parentElement) return;
  if (!paiEmpilhaVertical(alvo.parentElement)) return;

  const barra = document.createElement('div');
  barra.setAttribute(ATRIBUTO_BARRA, '');
  barra.className = 'rolagem-superior-tabela';
  // A tabela já é rolável pelo teclado; a barra é atalho de mouse. Fora da
  // ordem de Tab e da árvore de acessibilidade, para não ser lida duas vezes.
  barra.setAttribute('aria-hidden', 'true');
  barra.tabIndex = -1;
  barra.hidden = true;
  const miolo = document.createElement('div');
  miolo.style.height = '1px';
  barra.appendChild(miolo);
  // Encostada na tabela: anula o `space-y-*` (margem embaixo) e, em flex
  // coluna, o `gap` do pai, que a deixariam descolada.
  const gap = parseFloat(getComputedStyle(alvo.parentElement).rowGap) || 0;
  barra.style.marginBottom = gap ? `-${gap}px` : '0px';
  alvo.parentElement.insertBefore(barra, alvo);

  barra.addEventListener('scroll', () => {
    if (Math.abs(alvo.scrollLeft - barra.scrollLeft) > 1) alvo.scrollLeft = barra.scrollLeft;
  }, { passive: true });
  const aoRolarAlvo = () => {
    if (Math.abs(barra.scrollLeft - alvo.scrollLeft) > 1) barra.scrollLeft = alvo.scrollLeft;
  };
  alvo.addEventListener('scroll', aoRolarAlvo, { passive: true });

  const v: Vinculo = { barra, miolo, resize: new ResizeObserver(() => atualizar(alvo, v)), aoRolarAlvo };
  v.resize.observe(alvo);
  const tabela = alvo.querySelector('table');
  if (tabela) v.resize.observe(tabela);
  vinculos.set(alvo, v);
  atualizar(alvo, v);
}

function desvincular(alvo: HTMLElement, v: Vinculo) {
  v.resize.disconnect();
  alvo.removeEventListener('scroll', v.aoRolarAlvo);
  v.barra.remove();
  vinculos.delete(alvo);
}

/** Uma passada: vincula tabelas novas e limpa as que saíram da tela. */
export function processarTabelas(raiz: ParentNode = document): void {
  for (const [alvo, v] of vinculos) {
    // Saiu da tela, ou o React trocou o vizinho e a barra ficou longe do alvo.
    if (!alvo.isConnected || v.barra.nextElementSibling !== alvo || optOut(alvo)) desvincular(alvo, v);
  }
  raiz.querySelectorAll('table').forEach(tabela => {
    const alvo = acharContainerRolagem(tabela as HTMLTableElement);
    if (alvo) vincular(alvo);
  });
  for (const [alvo, v] of vinculos) atualizar(alvo, v);
}

export function initRolagemSuperiorTabelas(): () => void {
  if (typeof window === 'undefined' || typeof ResizeObserver === 'undefined') return () => {};

  let rafId: number | null = null;
  const agendar = () => {
    if (rafId !== null) return;
    rafId = window.requestAnimationFrame(() => {
      rafId = null;
      processarTabelas();
    });
  };

  const observer = new MutationObserver(mutacoes => {
    for (const m of mutacoes) {
      // Ignora as mutações que este próprio módulo causa.
      const nossas = [...m.addedNodes, ...m.removedNodes].every(
        n => n instanceof HTMLElement && n.hasAttribute(ATRIBUTO_BARRA),
      );
      if (!nossas) { agendar(); return; }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  // Telas que trocam de modo (cartões no celular ↔ tabela no desktop) mudam o
  // overflow sem mexer no DOM.
  window.addEventListener('resize', agendar, { passive: true });
  agendar();

  return () => {
    if (rafId !== null) window.cancelAnimationFrame(rafId);
    observer.disconnect();
    window.removeEventListener('resize', agendar);
    for (const [alvo, v] of vinculos) desvincular(alvo, v);
  };
}
