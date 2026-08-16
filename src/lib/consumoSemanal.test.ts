import { describe, it, expect } from 'vitest';
import { getISOWeek, parseISO } from 'date-fns';
import {
  inicioDaSemana, semanasDoPeriodo, construirBaseSemanal, serieDoMaterial,
  rotuloSemana, intervaloSemana, mediaPorSemanaAtiva,
} from './consumoSemanal';
import { MB51Classificado } from '../types';

const mov = (over: Partial<MB51Classificado>): MB51Classificado => ({
  id: 1,
  doc_material: 'D1',
  material: 'A',
  texto_breve_material: 'PARAFUSO',
  unid_medida_basica: 'PC',
  qtd_um_registro: -10,
  data_lancamento: '2026-05-06',
  categoria: 'consumo',
  movimenta_estoque: true,
  sinal: 'saida',
  descricao_tipo_movimento: 'SM para projeto',
  ...over,
});

describe('inicioDaSemana', () => {
  it('recua para a segunda-feira da semana', () => {
    expect(inicioDaSemana('2026-05-06')).toBe('2026-05-04'); // quarta -> segunda
    expect(inicioDaSemana('2026-05-04')).toBe('2026-05-04'); // já é segunda
  });

  it('trata domingo como fim da semana, não como início', () => {
    // Domingo 10/05 pertence à semana que começou em 04/05.
    expect(inicioDaSemana('2026-05-10')).toBe('2026-05-04');
    expect(inicioDaSemana('2026-05-11')).toBe('2026-05-11'); // segunda seguinte
  });

  it('não escorrega de semana por fuso horário', () => {
    // Com getters locais a oeste de Greenwich, a data viraria o dia anterior.
    expect(inicioDaSemana('2026-01-01')).toBe('2025-12-29');
  });
});

describe('semanasDoPeriodo', () => {
  it('gera todas as semanas, inclusive as sem movimento', () => {
    const s = semanasDoPeriodo('2026-05-04', '2026-05-25');
    expect(s).toEqual(['2026-05-04', '2026-05-11', '2026-05-18', '2026-05-25']);
  });

  it('devolve uma semana quando início e fim caem na mesma', () => {
    expect(semanasDoPeriodo('2026-05-04', '2026-05-08')).toEqual(['2026-05-04']);
  });

  it('não entra em laço infinito com intervalo invertido', () => {
    expect(semanasDoPeriodo('2026-05-25', '2026-05-04')).toEqual(['2026-05-25']);
  });
});

describe('construirBaseSemanal', () => {
  it('preenche com zero as semanas sem movimento', () => {
    // O vazio é a informação principal: comprimir o eixo faria duas saídas
    // distantes parecerem semanas consecutivas de consumo.
    const base = construirBaseSemanal([
      mov({ data_lancamento: '2026-05-04', qtd_um_registro: -10 }),
      mov({ id: 2, data_lancamento: '2026-05-25', qtd_um_registro: -5 }),
    ]);
    expect(base.semanas).toHaveLength(4);
    expect(base.materiais[0].serie).toEqual([10, 0, 0, 5]);
    expect(base.materiais[0].semanasAtivas).toBe(2);
    expect(base.materiais[0].totalSemanas).toBe(4);
  });

  it('ignora transferência interna', () => {
    const base = construirBaseSemanal([
      mov({ categoria: 'transferencia', movimenta_estoque: false, qtd_um_registro: -100 }),
      mov({ id: 2, qtd_um_registro: -10 }),
    ]);
    expect(base.materiais[0].consumoTotal).toBe(10);
  });

  it('separa entrada de consumo', () => {
    const base = construirBaseSemanal([
      mov({ qtd_um_registro: -10 }),
      mov({ id: 2, categoria: 'entrada_compra', qtd_um_registro: 40, sinal: 'entrada' }),
    ]);
    expect(base.materiais[0].consumoTotal).toBe(10);
    expect(base.materiais[0].entradaTotal).toBe(40);
  });

  it('omite material que só teve entrada e nunca saiu', () => {
    // Série inteira de zeros não pertence a uma tela de perfil de consumo.
    const base = construirBaseSemanal([
      mov({ categoria: 'entrada_compra', qtd_um_registro: 40, sinal: 'entrada' }),
    ]);
    expect(base.materiais).toHaveLength(0);
  });

  it('ordena por consumo total, do maior para o menor', () => {
    const base = construirBaseSemanal([
      mov({ material: 'A', qtd_um_registro: -5 }),
      mov({ id: 2, material: 'B', qtd_um_registro: -50 }),
    ]);
    expect(base.materiais.map(m => m.material)).toEqual(['B', 'A']);
  });

  it('devolve base vazia sem movimento datado, em vez de quebrar', () => {
    expect(construirBaseSemanal([]).materiais).toHaveLength(0);
    expect(construirBaseSemanal([]).semanas).toHaveLength(0);
  });
});

describe('serieDoMaterial', () => {
  it('alinha a série às semanas e acumula entrada menos consumo', () => {
    const base = construirBaseSemanal([
      mov({ data_lancamento: '2026-05-04', categoria: 'entrada_compra', qtd_um_registro: 100, sinal: 'entrada' }),
      mov({ id: 2, data_lancamento: '2026-05-04', qtd_um_registro: -10 }),
      mov({ id: 3, data_lancamento: '2026-05-18', qtd_um_registro: -30 }),
    ]);
    const s = serieDoMaterial(base, 'A');
    expect(s.map(p => p.consumo)).toEqual([10, 0, 30]);
    expect(s.map(p => p.entrada)).toEqual([100, 0, 0]);
    expect(s.map(p => p.acumulado)).toEqual([90, 90, 60]);
  });

  it('devolve zeros para material sem movimento, mantendo o eixo', () => {
    const base = construirBaseSemanal([mov({ qtd_um_registro: -10 })]);
    const s = serieDoMaterial(base, 'INEXISTENTE');
    expect(s).toHaveLength(base.semanas.length);
    expect(s.every(p => p.consumo === 0 && p.entrada === 0)).toBe(true);
  });
});

describe('mediaPorSemanaAtiva', () => {
  it('divide pelas semanas ativas, não pelo período todo', () => {
    // Dividir por 25 semanas faria um material que sai 100 numa única semana
    // parecer consumir 4/semana, escondendo o pico que a reposição precisa cobrir.
    const base = construirBaseSemanal([
      mov({ data_lancamento: '2026-05-04', qtd_um_registro: -100 }),
      mov({ id: 2, data_lancamento: '2026-06-22', qtd_um_registro: -0 }),
    ]);
    expect(mediaPorSemanaAtiva(base.materiais[0])).toBe(100);
  });

  it('devolve zero sem semanas ativas, sem dividir por zero', () => {
    expect(mediaPorSemanaAtiva({
      material: 'A', descricao: '', umb: '', consumoTotal: 0, entradaTotal: 0,
      eventosConsumo: 0, semanasAtivas: 0, totalSemanas: 5, serie: [], ultimoConsumo: null,
    })).toBe(0);
  });
});

describe('rotuloSemana', () => {
  it('usa a numeração de semana ISO com prefixo W', () => {
    // Mesma numeração do painel de Suprimentos (lá exibida como "S28"), para
    // W28 aqui e S28 lá serem a mesma semana do calendário.
    expect(rotuloSemana('2026-05-04')).toBe(`W${getISOWeek(parseISO('2026-05-04'))}`);
    expect(rotuloSemana('2026-05-04')).toMatch(/^W\d{1,2}$/);
  });

  it('numera semanas consecutivas em sequência', () => {
    const a = Number(rotuloSemana('2026-05-04').slice(1));
    const b = Number(rotuloSemana('2026-05-11').slice(1));
    expect(b).toBe(a + 1);
  });
});

describe('intervaloSemana', () => {
  it('devolve segunda a domingo no formato dd/MM-dd/MM', () => {
    expect(intervaloSemana('2026-05-04')).toBe('04/05-10/05');
  });
});
