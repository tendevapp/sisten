import { describe, expect, it } from 'vitest';
import { formatarDataDDMMYY, gerarCodigoFormulario, proximoIndiceCodigo } from './codigosFormulario';
import { calcularMetricasAlcoolemia } from './portariaApi';
import type { PortAlcoolemiaTeste } from '../types';

describe('Portaria - Teste de Alcoolemia (FRM.SGP-0015)', () => {
  it('gera codigo no padrao ALC-DDMMYY-INDICE', () => {
    const cod = gerarCodigoFormulario('ALC', '2026-09-14', 1);
    expect(cod).toBe('ALC-140926-01');

    const cod2 = gerarCodigoFormulario('ALC', '2026-09-14', 15);
    expect(cod2).toBe('ALC-140926-15');
  });

  it('calcula proximo indice sequencial a partir dos codigos existentes', () => {
    const codigosExistentes = ['ALC-140926-01', 'ALC-140926-02', 'ALC-140926-05'];
    const prox = proximoIndiceCodigo('ALC', codigosExistentes);
    expect(prox).toBe(6);
  });

  it('calcula metricas do livro de sorteados corretamente', () => {
    const mockTestes: PortAlcoolemiaTeste[] = [
      {
        id: '1',
        codigo_formulario: 'ALC-140926-01',
        data: '2026-09-14',
        horario: '07:15',
        turno: 'MANHA',
        tipo_vinculo: 'TEN',
        matricula: '1001',
        nome: 'Joao Silva',
        empresa: 'TEN',
        resultado: 'NEGATIVO',
        valor_medido: 0.0,
        created_at: '2026-09-14T07:15:00Z',
        updated_at: '2026-09-14T07:15:00Z',
      },
      {
        id: '2',
        codigo_formulario: 'ALC-140926-02',
        data: '2026-09-14',
        horario: '07:30',
        turno: 'MANHA',
        tipo_vinculo: 'PJ',
        nome: 'Carlos Santos',
        empresa: 'TransLog Ltda',
        resultado: 'POSITIVO',
        valor_medido: 0.18,
        created_at: '2026-09-14T07:30:00Z',
        updated_at: '2026-09-14T07:30:00Z',
      },
      {
        id: '3',
        codigo_formulario: 'ALC-140926-03',
        data: '2026-09-14',
        horario: '08:00',
        turno: 'MANHA',
        tipo_vinculo: 'TEN',
        matricula: '1002',
        nome: 'Maria Souza',
        empresa: 'TEN',
        resultado: 'RECUSA',
        valor_medido: 0.0,
        created_at: '2026-09-14T08:00:00Z',
        updated_at: '2026-09-14T08:00:00Z',
      },
      {
        id: '4',
        codigo_formulario: 'ALC-140926-04',
        data: '2026-09-14',
        horario: '08:15',
        turno: 'MANHA',
        tipo_vinculo: 'PJ',
        nome: 'Lucas Lima',
        empresa: 'Vigilancia Sul',
        resultado: 'PENDENTE',
        valor_medido: 0.0,
        created_at: '2026-09-14T08:15:00Z',
        updated_at: '2026-09-14T08:15:00Z',
      },
    ];

    const metricas = calcularMetricasAlcoolemia(mockTestes);

    expect(metricas.total).toBe(4);
    expect(metricas.negativos).toBe(1);
    expect(metricas.positivos).toBe(1);
    expect(metricas.recusas).toBe(1);
    expect(metricas.pendentes).toBe(1);
    expect(metricas.colaboradoresTen).toBe(2);
    expect(metricas.terceirosPj).toBe(2);
  });
});
