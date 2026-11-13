import { describe, expect, it } from 'vitest';
import { horaCurta, trocarHorariosNaDescricao, validarHorariosOcorrencia } from './portariaHorarioOcorrencia';

describe('trocarHorariosNaDescricao', () => {
  it('troca a hora de entrada no início da linha', () => {
    expect(trocarHorariosNaDescricao('06:09 - PADARIA IDEAL - PEDRO', { entrada: '06:05' }))
      .toBe('06:05 - PADARIA IDEAL - PEDRO');
  });

  it('aceita hora com segundos no texto', () => {
    expect(trocarHorariosNaDescricao('04:55:00 - Ronda Patrimonial: OK', { entrada: '04:50' }))
      .toBe('04:50 - Ronda Patrimonial: OK');
  });

  it('troca a hora de saída/retorno quando pedida', () => {
    const texto = '06:09 - PADARIA - Placa: HGO9B96 (Saída registrada às 06:13 por EDUARDO)';
    expect(trocarHorariosNaDescricao(texto, { entrada: '06:09', saida: '06:20' }))
      .toBe('06:09 - PADARIA - Placa: HGO9B96 (Saída registrada às 06:20 por EDUARDO)');
    expect(trocarHorariosNaDescricao('10:20 - SAÍDA DE COLABORADOR: JOÃO (Retornou às 11:00)', { entrada: '10:20', saida: '11:15' }))
      .toBe('10:20 - SAÍDA DE COLABORADOR: JOÃO (Retornou às 11:15)');
  });

  it('não mexe em horas no meio do texto nem em texto livre sem hora', () => {
    expect(trocarHorariosNaDescricao('RONDA ÀS 05:00 SEM ALTERAÇÕES', { entrada: '05:10' }))
      .toBe('RONDA ÀS 05:00 SEM ALTERAÇÕES');
  });
});

describe('horaCurta / validarHorariosOcorrencia', () => {
  it('normaliza e valida', () => {
    expect(horaCurta('06:09:00')).toBe('06:09');
    expect(horaCurta(null)).toBe('');
    expect(validarHorariosOcorrencia('06:09', '', false)).toBeNull();
    expect(validarHorariosOcorrencia('', '', false)).not.toBeNull();
    expect(validarHorariosOcorrencia('06:09', '', true)).not.toBeNull();
    expect(validarHorariosOcorrencia('23:50', '00:10', true)).toBeNull();
  });
});
