/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { gerarProtocolo, hojeISO, horaAgora, sugerirTurno } from './portariaApi';

describe('Módulo Portaria — Utilitários de API', () => {
  it('deve gerar protocolos únicos no formato esperado', () => {
    const eqp = gerarProtocolo('EQP', '2026-08-30');
    const trp = gerarProtocolo('TRP', '2026-08-30', 'PKS1234');
    const crt = gerarProtocolo('CRT', '2026-08-30', 'PKB5678');
    const rel = gerarProtocolo('REL', '2026-08-30', 'DIU');
    const brf = gerarProtocolo('BRF', '2026-08-30');
    const plt = gerarProtocolo('PLT', '2026-08-30', 'NOT');

    expect(eqp).toMatch(/^EQP-300826-[A-Z0-9]{4}$/);
    expect(trp).toBe('TRP-300826-PKS1234');
    expect(crt).toBe('CRT-300826-PKB5678');
    expect(rel).toBe('REL-300826-DIU');
    expect(brf).toMatch(/^BRF-300826-[A-Z0-9]{4}$/);
    expect(plt).toBe('PLT-300826-NOT');
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
