/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  aderencia,
  adicionarSemanas,
  etapasCriticas,
  formatarPercentual,
  hojeLocal,
  intervaloSemana,
  janelaSemanas,
  montarMatriz,
  pontosPrevistoRealizado,
  segundaDaSemana,
  semanaAteOuIgual,
  semanaISO,
  semanasDoIntervalo,
  semanasNoAno,
  serieAderenciaSemanal,
  situacao,
  somarItens,
  type EtapaApontamento,
  type QuantidadeSemanal,
} from './producaoApontamentos';

describe('semanas ISO', () => {
  it('calcula semana e ano ISO, inclusive na virada do ano', () => {
    expect(semanaISO('2026-09-24')).toEqual({ ano: 2026, semana: 39 });
    expect(semanaISO('2026-09-21')).toEqual({ ano: 2026, semana: 39 });
    expect(semanaISO('2026-09-20')).toEqual({ ano: 2026, semana: 38 });
    expect(semanaISO('2027-01-01')).toEqual({ ano: 2026, semana: 53 });
    expect(semanaISO('2024-12-30')).toEqual({ ano: 2025, semana: 1 });
  });

  it('volta para a segunda-feira e navega entre anos', () => {
    expect(segundaDaSemana({ ano: 2026, semana: 39 })).toBe('2026-09-21');
    expect(segundaDaSemana({ ano: 2025, semana: 1 })).toBe('2024-12-30');
    expect(semanasNoAno(2026)).toBe(53);
    expect(semanasNoAno(2025)).toBe(52);
    expect(adicionarSemanas({ ano: 2026, semana: 53 }, 1)).toEqual({ ano: 2027, semana: 1 });
    expect(janelaSemanas({ ano: 2027, semana: 2 }, 3)).toEqual([
      { ano: 2026, semana: 53 },
      { ano: 2027, semana: 1 },
      { ano: 2027, semana: 2 },
    ]);
    expect(intervaloSemana({ ano: 2026, semana: 39 })).toBe('21/09 – 27/09');
    expect(semanasDoIntervalo(2026, 50, 60).map(s => s.semana)).toEqual([50, 51, 52, 53]);
    expect(semanasDoIntervalo(2025, 51, 53).map(s => s.semana)).toEqual([51, 52]);
    expect(semanaAteOuIgual({ ano: 2026, semana: 53 }, { ano: 2027, semana: 1 })).toBe(true);
    expect(semanaAteOuIgual({ ano: 2026, semana: 40 }, { ano: 2026, semana: 39 })).toBe(false);
  });

  it('dia local em UTC-3', () => {
    expect(hojeLocal(new Date('2026-09-25T02:00:00Z'))).toBe('2026-09-24');
  });
});

describe('aderência e situação', () => {
  it('segue a planilha', () => {
    expect(formatarPercentual(aderencia(696, 658))).toBe('94,54%');
    expect(aderencia(0, 5)).toBeNull();
    expect(aderencia(null, 5)).toBeNull();
    expect(formatarPercentual(null)).toBe('—');
    expect(situacao(49, 24)).toBe('abaixo');
    expect(situacao(33, 40)).toBe('atingido');
    expect(situacao(8, 8)).toBe('atingido');
    expect(situacao(null, 0)).toBe('vazio');
    expect(situacao(0, 0)).toBe('vazio');
    expect(situacao(null, 3)).toBe('atingido');
  });
});

describe('montarMatriz', () => {
  const etapas: EtapaApontamento[] = [
    { id: 'chanfro', nave: 'nave1', nome: 'Chanfro', ordem: 30, ativa: true },
    { id: 'corte', nave: 'nave1', nome: 'Corte', ordem: 10, ativa: true },
    { id: 'velha', nave: 'nave1', nome: 'Inativa', ordem: 5, ativa: false },
    { id: 'jato', nave: 'white', nome: 'Jato', ordem: 10, ativa: true },
  ];
  const q = (etapa_id: string, semana: number, quantidade: number, ano = 2026): QuantidadeSemanal => ({ ano, semana, etapa_id, quantidade });
  const programacao = [q('corte', 30, 100), q('corte', 38, 49), q('corte', 39, 44), q('corte', 40, 99), q('chanfro', 39, 42), q('jato', 39, 6), q('corte', 39, 500, 2025)];
  const realizado = [q('corte', 30, 90), q('corte', 38, 24), q('corte', 39, 34), q('corte', 40, 1), q('chanfro', 39, 36), q('jato', 38, 3)];
  const matriz = montarMatriz({ etapas, programacao, realizado, semanas: janelaSemanas({ ano: 2026, semana: 39 }, 2) });

  it('agrupa por nave em ordem e ignora inativas', () => {
    expect(matriz.grupos.map(g => g.nave.id)).toEqual(['nave1', 'nave2', 'white']);
    expect(matriz.grupos[0].linhas.map(l => l.etapa.id)).toEqual(['corte', 'chanfro']);
    expect(matriz.grupos[1].linhas).toEqual([]);
  });

  it('TOTAL acumula o ano até a última semana da janela', () => {
    const corte = matriz.grupos[0].linhas[0];
    expect(corte.total).toEqual({ programado: 193, realizado: 148, aderencia: 148 / 193 });
    expect(corte.semanas).toEqual([
      { programado: 49, realizado: 24 },
      { programado: 44, realizado: 34 },
    ]);
  });

  it('soma a nave e distingue semana sem programado', () => {
    const nave1 = matriz.grupos[0];
    expect(nave1.semanas[1]).toEqual({ programado: 86, realizado: 70 });
    const white = matriz.grupos[2];
    expect(white.semanas[0]).toEqual({ programado: null, realizado: 3 });
    expect(white.total.aderencia).toBe(0.5);
  });

  it('TOTAL para na semana atual mesmo com a janela até a W52', () => {
    const ateFimDoAno = montarMatriz({
      etapas,
      programacao,
      realizado,
      semanas: semanasDoIntervalo(2026, 38, 52),
      totalAte: { ano: 2026, semana: 39 },
    });
    const corte = ateFimDoAno.grupos[0].linhas[0];
    expect(corte.total.programado).toBe(193); // W40 (99) ainda não entra
    expect(corte.semanas[2]).toEqual({ programado: 99, realizado: 1 });
    expect(serieAderenciaSemanal(ateFimDoAno).map(p => p.rotulo)).toEqual(['W38', 'W39']);
  });

  it('alimenta os relatórios', () => {
    expect(pontosPrevistoRealizado(matriz.grupos[0]).map(p => [p.nome, p.previsto, p.realizado])).toEqual([
      ['Corte', 193, 148],
      ['Chanfro', 42, 36],
    ]);
    const serie = serieAderenciaSemanal(matriz);
    expect(serie[1].rotulo).toBe('W39');
    expect(serie[1].nave1).toBeCloseTo(70 / 86);
    expect(serie[0].white).toBeNull();
    expect(serie[1].nave2).toBeNull();
    expect(etapasCriticas(matriz, 2).map(l => l.etapa.id)).toEqual(['jato', 'corte']);
  });
});

describe('somarItens', () => {
  it('soma os lançamentos do dia por etapa', () => {
    const soma = somarItens([
      { itens: [{ etapa_id: 'corte', quantidade: 3 }, { etapa_id: 'chanfro', quantidade: 1 }] },
      { itens: [{ etapa_id: 'corte', quantidade: 2 }] },
    ]);
    expect(Object.fromEntries(soma)).toEqual({ corte: 5, chanfro: 1 });
  });
});
