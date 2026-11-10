import { describe, expect, it } from 'vitest';
import {
  alertaAtrasoComprador, diasUteisEntre, faixaAtrasoComprador, feriadosNacionais, statusPorAtraso,
} from './diasUteis';

describe('diasUteisEntre', () => {
  it('não conta o dia da solicitação e conta o de referência', () => {
    expect(diasUteisEntre('2026-11-10', '2026-11-10')).toBe(0);
    expect(diasUteisEntre('2026-11-09', '2026-11-10')).toBe(1);
  });
  it('pula sábado e domingo', () => {
    expect(diasUteisEntre('2026-11-06', '2026-11-09')).toBe(1); // sexta → segunda
    expect(diasUteisEntre('2026-11-07', '2026-11-08')).toBe(0); // sábado → domingo
  });
  it('desconta feriado nacional em dia de semana', () => {
    expect(diasUteisEntre('2026-10-30', '2026-11-10')).toBe(6); // Finados (seg)
    expect(diasUteisEntre('2026-11-19', '2026-11-23')).toBe(1); // Consciência Negra (sex)
  });
  it('bate com o banco no ano de 2026 e atravessa a virada', () => {
    expect(diasUteisEntre('2026-01-01', '2026-12-31')).toBe(252);
    expect(diasUteisEntre('2026-12-24', '2027-01-04')).toBe(5); // 25/12 e 01/01 fora
  });
  it('aceita data com hora e devolve 0 para inválida ou invertida', () => {
    expect(diasUteisEntre('2026-11-09T10:00:00', '2026-11-10')).toBe(1);
    expect(diasUteisEntre(null, '2026-11-10')).toBe(0);
    expect(diasUteisEntre('2026-11-10', '2026-11-01')).toBe(0);
    expect(diasUteisEntre('lixo', '2026-11-10')).toBe(0);
  });
});

describe('feriadosNacionais', () => {
  it('calcula a Sexta-feira Santa pela Páscoa', () => {
    expect(feriadosNacionais(2026)).toContain('2026-04-03');
    expect(feriadosNacionais(2027)).toContain('2027-03-26');
    expect(feriadosNacionais(2026)).toHaveLength(10);
  });
});

describe('faixa, alerta e status do atraso', () => {
  it('seguem os mesmos cortes da view', () => {
    expect(faixaAtrasoComprador(0)).toBe('Sem Atraso');
    expect(faixaAtrasoComprador(7)).toBe('1-7 dias');
    expect(faixaAtrasoComprador(16)).toBe('16-30 dias');
    expect(faixaAtrasoComprador(31)).toBe('Acima 30 dias');
    expect(alertaAtrasoComprador(16, 'Exportação urgente')).toBe('⚠️ ESCALAR IMEDIATAMENTE');
    expect(alertaAtrasoComprador(16, 'Normal')).toBe('⚡ ACOMPANHAR');
    expect(statusPorAtraso(31)).toBe('Crítico - Ação Urgente');
    expect(statusPorAtraso(0)).toBe('No Prazo');
  });
});

describe('somarDiasUteis', () => {
  it('pula fim de semana e feriado', async () => {
    const { somarDiasUteis, rotuloDiasUteis } = await import('./diasUteis');
    expect(somarDiasUteis('2026-09-04', 4)).toBe('2026-09-11'); // 07/09 feriado: ter, qua, qui, sex
    expect(somarDiasUteis('2026-11-13', 1)).toBe('2026-11-16');
    expect(somarDiasUteis('2026-11-13', 0)).toBe('2026-11-13');
    expect(somarDiasUteis(null, 3)).toBeNull();
    expect(rotuloDiasUteis(1)).toBe('1 dia útil');
    expect(rotuloDiasUteis(2)).toBe('2 dias úteis');
  });
});
