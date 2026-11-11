import { describe, it, expect } from 'vitest';
import { ETILOMETRO_DO_LOCAL, etilometroAoRegistrar, localAoRegistrar, localDaAfericao, montarTesteBafometroPortaria } from './alcoolemiaLocal';

const criadoPor = { id: 'u1', name: 'VIGILANTE TESTE' };

describe('local da aferição', () => {
  it('Portaria usa ETIL-02 e SSMA usa ETIL-01', () => {
    expect(ETILOMETRO_DO_LOCAL.PORTARIA).toBe('ETIL-02');
    expect(ETILOMETRO_DO_LOCAL.SSMA).toBe('ETIL-01');
  });

  it('pendente não tem local; coluna gravada vence; sem coluna, vigilante = Portaria', () => {
    expect(localDaAfericao({ resultado: 'PENDENTE', vigilante: 'JOAO', local_afericao: null })).toBeNull();
    expect(localDaAfericao({ resultado: 'NEGATIVO', vigilante: 'JOAO', local_afericao: 'SSMA' })).toBe('SSMA');
    expect(localDaAfericao({ resultado: 'NEGATIVO', vigilante: 'JOAO', local_afericao: null })).toBe('PORTARIA');
    expect(localDaAfericao({ resultado: 'NEGATIVO', vigilante: ' ', local_afericao: null })).toBe('SSMA');
  });

  it('teste já aferido mantém o local; pendente leva o da tela', () => {
    expect(localAoRegistrar({ resultado: 'NEGATIVO', vigilante: null, local_afericao: 'PORTARIA' }, 'SSMA')).toBe('PORTARIA');
    expect(localAoRegistrar({ resultado: 'PENDENTE', vigilante: null, local_afericao: null }, 'SSMA')).toBe('SSMA');
    expect(localAoRegistrar(null, 'PORTARIA')).toBe('PORTARIA');
  });
});

describe('etilometroAoRegistrar', () => {
  it('pendente usa o aparelho do local; aferido mantém o gravado', () => {
    expect(etilometroAoRegistrar({ resultado: 'PENDENTE', vigilante: null, local_afericao: null, etilometro_codigo: null }, 'PORTARIA')).toBe('ETIL-02');
    expect(etilometroAoRegistrar({ resultado: 'PENDENTE', vigilante: null, local_afericao: null, etilometro_codigo: null }, 'SSMA')).toBe('ETIL-01');
    expect(etilometroAoRegistrar({ resultado: 'NEGATIVO', vigilante: 'JOAO', local_afericao: 'PORTARIA', etilometro_codigo: 'ETIL-01' }, 'PORTARIA')).toBe('ETIL-01');
    expect(etilometroAoRegistrar({ resultado: 'NEGATIVO', vigilante: 'JOAO', local_afericao: 'PORTARIA', etilometro_codigo: null }, 'SSMA')).toBe('ETIL-02');
  });
});

describe('montarTesteBafometroPortaria', () => {
  const contexto = { data: '2026-11-11', horario: '07:12:00', origem: 'Relatório de Ocorrências', criadoPor };

  it('colaborador com matrícula entra como TEN, pendente', () => {
    const t = montarTesteBafometroPortaria({ nome: 'jose santos', matricula: '004512', empresa: 'TEN - TORRES EÓLICAS DO NORDESTE' }, contexto);
    expect(t).toMatchObject({ tipo_vinculo: 'TEN', empresa: 'TEN', matricula: '004512', documento: null, nome: 'JOSE SANTOS', resultado: 'PENDENTE', horario: '07:12', data: '2026-11-11' });
  });

  it('terceiro entra como PJ com empresa e documento', () => {
    const t = montarTesteBafometroPortaria({ nome: 'Ana Lima', documento: '123.456.789-00', empresa: 'Bahia Sul' }, contexto);
    expect(t).toMatchObject({ tipo_vinculo: 'PJ', empresa: 'BAHIA SUL', documento: '123.456.789-00', matricula: null });
    expect(t.observacoes).toBe('CADASTRADO NA PORTARIA — RELATÓRIO DE OCORRÊNCIAS');
  });
});
