import { describe, expect, it } from 'vitest';
import { prepararFormEdicaoTransporte } from './PortariaTransportes';
import type { PortRegistroTransporte } from '../../types';

const transporte = (hora_saida: string | null): PortRegistroTransporte => ({
  id: 'transporte-1',
  codigo_formulario: 'FRM.SGP-0009',
  numero_protocolo: 'TRP-160926-01',
  data: '2026-09-16',
  turno: 'MANHA',
  vigilante: 'SIMONE',
  veiculo: 'Van',
  placa: 'ABC1D23',
  empresa: 'TRANSPORTES TEN',
  hora_chegada: '06:30',
  hora_saida,
  motorista: 'MOTORISTA',
  rota: 'R1',
  ocupacao: null,
  observacoes: null,
  status: hora_saida ? 'FINALIZADO' : 'NO_PATIO',
  criado_por: null,
  created_at: '2026-09-16T06:30:00Z',
  updated_at: '2026-09-16T06:30:00Z',
});

describe('prepararFormEdicaoTransporte', () => {
  it('mantém a hora de saída disponível para edição', () => {
    expect(prepararFormEdicaoTransporte(transporte('13:46'))).toMatchObject({
      hora_chegada: '06:30',
      hora_saida: '13:46',
    });
  });
});
