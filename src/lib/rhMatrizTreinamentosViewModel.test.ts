import { describe, expect, it } from 'vitest';
import { criarRequisitosPorCargo, statusNaMatriz } from './rhMatrizTreinamentosViewModel';

describe('visão da matriz de treinamentos', () => {
  it('indexa requisitos uma vez por função para consulta constante na matriz', () => {
    const requisitos = criarRequisitosPorCargo([
      { cargo_chave: 'SOLDADOR', treinamento_id: 'nr35' },
      { cargo_chave: 'SOLDADOR', treinamento_id: 'nr10' },
      { cargo_chave: 'MECANICO', treinamento_id: 'nr10' },
    ]);

    expect(requisitos.get('SOLDADOR')).toEqual(new Set(['nr35', 'nr10']));
    expect(requisitos.get('MECANICO')).toEqual(new Set(['nr10']));
  });

  it('prioriza uma realização registrada sobre a pendência exigida pela função', () => {
    const requisitos = criarRequisitosPorCargo([{ cargo_chave: 'SOLDADOR', treinamento_id: 'nr35' }]);

    expect(statusNaMatriz({ statusRegistrado: 'apto', requisitos, cargoChave: 'SOLDADOR', treinamentoId: 'nr35' })).toBe('apto');
    expect(statusNaMatriz({ statusRegistrado: null, requisitos, cargoChave: 'SOLDADOR', treinamentoId: 'nr35' })).toBe('pendente');
  });
});
