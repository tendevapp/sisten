/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { enrichTable, extrairTextoCabecalho } from './responsiveTableObserver';

class MockElement {
  nodeName: string;
  textContent: string | null = '';
  attributes: Map<string, string> = new Map();
  classList = {
    contains: (cls: string) => (this.attributes.get('class') || '').split(/\s+/).includes(cls),
  };
  children: MockElement[] = [];
  parentElement: MockElement | null = null;
  colSpan: number = 1;

  constructor(nodeName: string, attrs: Record<string, string> = {}, textContent = '') {
    this.nodeName = nodeName.toUpperCase();
    this.textContent = textContent;
    for (const [k, v] of Object.entries(attrs)) {
      this.attributes.set(k, v);
    }
  }

  setAttribute(k: string, v: string) {
    this.attributes.set(k, v);
  }

  getAttribute(k: string): string | null {
    return this.attributes.get(k) ?? null;
  }

  hasAttribute(k: string): boolean {
    return this.attributes.has(k);
  }

  removeAttribute(k: string) {
    this.attributes.delete(k);
  }

  appendChild(child: MockElement) {
    child.parentElement = this;
    this.children.push(child);
  }

  cloneNode(deep = true): MockElement {
    const clone = new MockElement(this.nodeName, Object.fromEntries(this.attributes.entries()), this.textContent ?? '');
    if (deep) {
      for (const c of this.children) {
        clone.appendChild(c.cloneNode(true));
      }
    }
    return clone;
  }

  remove() {
    if (this.parentElement) {
      const idx = this.parentElement.children.indexOf(this);
      if (idx !== -1) {
        this.parentElement.children.splice(idx, 1);
      }
    }
  }

  querySelector(selector: string): MockElement | null {
    const all = this.querySelectorAll(selector);
    return all[0] ?? null;
  }

  querySelectorAll(selector: string): MockElement[] {
    const results: MockElement[] = [];

    const matches = (el: MockElement, s: string): boolean => {
      s = s.trim();
      if (s === 'th') return el.nodeName === 'TH';
      if (s === 'td') return el.nodeName === 'TD';
      if (s === 'tr') return el.nodeName === 'TR';
      if (s === 'thead') return el.nodeName === 'THEAD';
      if (s === 'tbody') return el.nodeName === 'TBODY';
      if (s === 'button') return el.nodeName === 'BUTTON';
      if (s === 'a') return el.nodeName === 'A';
      if (s === 'svg') return el.nodeName === 'SVG';
      if (s === '.sr-only') return el.classList.contains('sr-only');
      if (s === '[aria-hidden="true"]') return el.getAttribute('aria-hidden') === 'true';
      if (s === 'thead tr') {
        return el.nodeName === 'TR' && el.parentElement?.nodeName === 'THEAD';
      }
      if (s === 'tr th') {
        return el.nodeName === 'TH' && el.parentElement?.nodeName === 'TR';
      }
      return false;
    };

    const traverse = (el: MockElement) => {
      for (const child of el.children) {
        if (matches(child, selector)) {
          results.push(child);
        }
        traverse(child);
      }
    };

    traverse(this);
    return results;
  }

  get tBodies(): MockElement[] {
    return this.children.filter((c) => c.nodeName === 'TBODY');
  }
}

describe('responsiveTableObserver', () => {
  it('extrai texto de cabeçalho com e sem botões de ordenação', () => {
    const thSimples = new MockElement('th', {}, ' Veículo / Placa ');
    expect(extrairTextoCabecalho(thSimples as unknown as HTMLElement)).toBe('Veículo / Placa');

    const thComBotao = new MockElement('th');
    const botao = new MockElement('button', { 'aria-label': 'Ordenar por Data de Chegada' }, 'Data');
    thComBotao.appendChild(botao);
    expect(extrairTextoCabecalho(thComBotao as unknown as HTMLElement)).toBe('Data de Chegada');

    const thComSrOnly = new MockElement('th', {}, 'Status');
    const srOnly = new MockElement('span', { class: 'sr-only' }, 'coluna informativa');
    thComSrOnly.appendChild(srOnly);
    expect(extrairTextoCabecalho(thComSrOnly as unknown as HTMLElement)).toBe('Status');
  });

  it('injeta data-label corretamente nas células de dados a partir do thead', () => {
    const table = new MockElement('table');
    const thead = new MockElement('thead');
    const headerRow = new MockElement('tr');
    headerRow.appendChild(new MockElement('th', {}, 'Código'));
    headerRow.appendChild(new MockElement('th', {}, 'Descrição'));
    headerRow.appendChild(new MockElement('th', {}, 'Valor'));
    headerRow.appendChild(new MockElement('th', {}, 'Ações'));
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = new MockElement('tbody');
    const row1 = new MockElement('tr');
    const tdCod = new MockElement('td', {}, '1001');
    const tdDesc = new MockElement('td', {}, 'Parafuso M8');
    const tdVal = new MockElement('td', {}, 'R$ 1,50');
    const tdAcoes = new MockElement('td');
    tdAcoes.appendChild(new MockElement('button', {}, 'Editar'));
    row1.appendChild(tdCod);
    row1.appendChild(tdDesc);
    row1.appendChild(tdVal);
    row1.appendChild(tdAcoes);
    tbody.appendChild(row1);
    table.appendChild(tbody);

    enrichTable(table as unknown as HTMLTableElement);

    expect(table.getAttribute('data-responsive-cards')).toBe('true');
    expect(tdCod.getAttribute('data-label')).toBe('Código');
    expect(tdDesc.getAttribute('data-label')).toBe('Descrição');
    expect(tdVal.getAttribute('data-label')).toBe('Valor');
    expect(tdAcoes.getAttribute('data-label')).toBe('Ações');
    expect(tdAcoes.getAttribute('data-card-actions')).toBe('true');
  });

  it('trata adequadamente linhas de tabela vazia com colSpan', () => {
    const table = new MockElement('table');
    const thead = new MockElement('thead');
    const headerRow = new MockElement('tr');
    headerRow.appendChild(new MockElement('th', {}, 'ID'));
    headerRow.appendChild(new MockElement('th', {}, 'Nome'));
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = new MockElement('tbody');
    const row = new MockElement('tr');
    const td = new MockElement('td', {}, 'Nenhum registro encontrado');
    td.colSpan = 2;
    row.appendChild(td);
    tbody.appendChild(row);
    table.appendChild(tbody);

    enrichTable(table as unknown as HTMLTableElement);

    expect(td.getAttribute('data-card-full-width')).toBe('true');
    expect(td.hasAttribute('data-label')).toBe(false);
  });

  it('respeita opt-out por data-no-cards e no-responsive-cards', () => {
    const table1 = new MockElement('table', { 'data-no-cards': 'true' });
    const tbody1 = new MockElement('tbody');
    const row1 = new MockElement('tr');
    const td1 = new MockElement('td', {}, '1');
    row1.appendChild(td1);
    tbody1.appendChild(row1);
    table1.appendChild(tbody1);

    enrichTable(table1 as unknown as HTMLTableElement);
    expect(table1.hasAttribute('data-responsive-cards')).toBe(false);
    expect(td1.hasAttribute('data-label')).toBe(false);

    const table2 = new MockElement('table', { class: 'no-responsive-cards' });
    const tbody2 = new MockElement('tbody');
    const row2 = new MockElement('tr');
    const td2 = new MockElement('td', {}, '2');
    row2.appendChild(td2);
    tbody2.appendChild(row2);
    table2.appendChild(tbody2);

    enrichTable(table2 as unknown as HTMLTableElement);
    expect(table2.hasAttribute('data-responsive-cards')).toBe(false);
    expect(td2.hasAttribute('data-label')).toBe(false);
  });

  it('respeita opt-out em linha individual com data-no-card', () => {
    const table = new MockElement('table');
    const thead = new MockElement('thead');
    const headerRow = new MockElement('tr');
    headerRow.appendChild(new MockElement('th', {}, 'ID'));
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = new MockElement('tbody');
    const row1 = new MockElement('tr', { 'data-no-card': 'true' });
    const td1 = new MockElement('td', {}, 'Subtotal');
    row1.appendChild(td1);
    tbody.appendChild(row1);

    const row2 = new MockElement('tr');
    const td2 = new MockElement('td', {}, '1');
    row2.appendChild(td2);
    tbody.appendChild(row2);
    table.appendChild(tbody);

    enrichTable(table as unknown as HTMLTableElement);

    expect(td1.hasAttribute('data-label')).toBe(false);
    expect(td2.getAttribute('data-label')).toBe('ID');
  });
});
