import { describe, expect, it } from 'vitest';
import { formatarPermanencia, minutosDePermanencia, precisaDeSaida } from './portariaApi';

describe('saída de veículo/visitante na portaria', () => {
  it('veículo e visitante sem saída precisam de saída; com saída ou outro tipo, não', () => {
    expect(precisaDeSaida({ tipo_registro: 'ENTRADA_VEICULO', hora_saida: null })).toBe(true);
    expect(precisaDeSaida({ tipo_registro: 'VEICULO_LEVE', hora_saida: null })).toBe(true);
    expect(precisaDeSaida({ tipo_registro: 'ENTRADA_VISITANTE' })).toBe(true);
    expect(precisaDeSaida({ tipo_registro: 'ENTRADA_VEICULO', hora_saida: '10:30:00' })).toBe(false);
    expect(precisaDeSaida({ tipo_registro: 'RONDA_PATRIMONIAL', hora_saida: null })).toBe(false);
    expect(precisaDeSaida({ tipo_registro: 'OUTRO_REGISTRO', status_permanencia: 'NO_PATIO' })).toBe(true);
  });

  it('calcula a permanência, inclusive passando da meia-noite', () => {
    expect(minutosDePermanencia('08:10:00', '10:30:00')).toBe(140);
    expect(minutosDePermanencia('22:00', '01:15')).toBe(195);
    expect(minutosDePermanencia('08:10', null)).toBeNull();
    expect(formatarPermanencia(45)).toBe('45 min');
    expect(formatarPermanencia(140)).toBe('2h20');
    expect(formatarPermanencia(null)).toBe('');
  });
});
