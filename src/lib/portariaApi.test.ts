/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { gerarProtocolo, hojeISO, horaAgora, sugerirTurno } from './portariaApi';

describe('Módulo Portaria — Utilitários de API', () => {
  it('deve gerar protocolos únicos no formato esperado', () => {
    const eqp = gerarProtocolo('EQP');
    const trp = gerarProtocolo('TRP');
    const crt = gerarProtocolo('CRT');
    const rel = gerarProtocolo('REL');
    const brf = gerarProtocolo('BRF');

    const ano = new Date().getFullYear();

    expect(eqp).toMatch(new RegExp(`^EQP-${ano}-[A-Z0-9]{5}$`));
    expect(trp).toMatch(new RegExp(`^TRP-${ano}-[A-Z0-9]{5}$`));
    expect(crt).toMatch(new RegExp(`^CRT-${ano}-[A-Z0-9]{5}$`));
    expect(rel).toMatch(new RegExp(`^REL-${ano}-[A-Z0-9]{5}$`));
    expect(brf).toMatch(new RegExp(`^BRF-${ano}-[A-Z0-9]{5}$`));
  });

  it('deve retornar data no padrão ISO YYYY-MM-DD', () => {
    const data = hojeISO();
    expect(data).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('deve retornar hora no formato HH:mm', () => {
    const hora = horaAgora();
    expect(hora).toMatch(/^\d{2}:\d{2}$/);
  });

  it('deve sugerir turno válido', () => {
    const turno = sugerirTurno();
    expect(['MANHA', 'TARDE', 'NOITE']).toContain(turno);
  });
});
