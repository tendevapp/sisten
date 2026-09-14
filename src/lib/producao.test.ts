import { describe, it, expect } from 'vitest';
import {
  VIROLAS_POR_TRAMO,
  virolasDoTramo,
  totalVirolasDoTramo,
  idVirola,
  normalizarTurno,
  camposDaEtapa,
  validarCamposLancamento,
  liberaProximaEtapa,
  normalizarDecimal,
  avaliarTolerancias,
  deveExigirMedicoesEvs,
  calcularIndicadoresQualidade,
  calcularRelatorioDiario,
} from './producao';

describe('producao.ts — virolas por tramo (PRD NAV1 §5.2)', () => {
  it('tem a quantidade certa de virolas por tramo', () => {
    expect(VIROLAS_POR_TRAMO.T1.length).toBe(8);
    expect(VIROLAS_POR_TRAMO.T2.length).toBe(7);
    expect(VIROLAS_POR_TRAMO.T3.length).toBe(9);
    expect(VIROLAS_POR_TRAMO.T4.length).toBe(11);
    expect(VIROLAS_POR_TRAMO.T5.length).toBe(12);
  });

  it('T1 tem os nomes compostos A/B nas primeiras virolas', () => {
    expect(VIROLAS_POR_TRAMO.T1.slice(0, 6)).toEqual(['V1A', 'V1B', 'V2A', 'V2B', 'V3A', 'V3B']);
  });

  it('virolasDoTramo devolve [] para tramo desconhecido', () => {
    expect(virolasDoTramo('T9')).toEqual([]);
  });

  it('totalVirolasDoTramo soma 47 virolas por torre (8+7+9+11+12)', () => {
    const total = (['T1', 'T2', 'T3', 'T4', 'T5'] as const).reduce((s, t) => s + totalVirolasDoTramo(t), 0);
    expect(total).toBe(47);
  });

  it('idVirola monta a chave estável tramo_unidade + virola', () => {
    expect(idVirola('T1-3143', 'V1A')).toBe('T1-3143-V1A');
  });
});

describe('producao.ts — turno', () => {
  it('aceita os quatro turnos válidos', () => {
    expect(normalizarTurno('A')).toBe('A');
    expect(normalizarTurno('Administrativo')).toBe('Administrativo');
  });

  it('rejeita valor desconhecido ou vazio', () => {
    expect(normalizarTurno('D')).toBeNull();
    expect(normalizarTurno('')).toBeNull();
    expect(normalizarTurno(null)).toBeNull();
    expect(normalizarTurno(undefined)).toBeNull();
  });
});

describe('producao.ts — campos por etapa', () => {
  it('corte exige recurso e rastreabilidade, mas não execução', () => {
    const c = camposDaEtapa('corte');
    expect(c.exigeRecurso).toBe(true);
    expect(c.exigeRastreabilidade).toBe(true);
    expect(c.exigeExecucao).toBe(false);
  });

  it('chanfro exige só a execução (TEN/TECOI)', () => {
    const c = camposDaEtapa('chanfro');
    expect(c.exigeExecucao).toBe(true);
    expect(c.exigeRecurso).toBe(false);
    expect(c.exigeRastreabilidade).toBe(false);
  });

  it('etapa desconhecida cai no padrão (nenhum campo extra)', () => {
    const c = camposDaEtapa('etapa-que-nao-existe');
    expect(c).toEqual({ exigeRecurso: false, exigeExecucao: false, exigeRastreabilidade: false });
  });
});

describe('producao.ts — validarCamposLancamento', () => {
  it('acusa data e situação ausentes', () => {
    const erros = validarCamposLancamento({ etapaId: 'corte', status: '', dataLiberacao: '' });
    expect(erros).toContain('Informe a data da liberação.');
    expect(erros).toContain('Selecione a situação: Aprovado ou Reprovado.');
  });

  it('corte sem rastreabilidade nem recurso acusa os dois', () => {
    const erros = validarCamposLancamento({
      etapaId: 'corte', status: 'aprovado', dataLiberacao: '2026-09-12',
    });
    expect(erros).toContain('Informe a rastreabilidade da chapa.');
    expect(erros).toContain('Selecione a máquina/recurso utilizado.');
  });

  it('corte completo não gera erro', () => {
    const erros = validarCamposLancamento({
      etapaId: 'corte',
      status: 'aprovado',
      dataLiberacao: '2026-09-12',
      recursoId: 'r1',
      rastreabilidade: '123456',
    });
    expect(erros).toEqual([]);
  });

  it('chanfro sem execução acusa só a execução', () => {
    const erros = validarCamposLancamento({ etapaId: 'chanfro', status: 'reprovado', dataLiberacao: '2026-09-12' });
    expect(erros).toEqual(['Selecione a execução: TEN ou TECOI.']);
  });
});

describe('producao.ts — liberaProximaEtapa (RN-02)', () => {
  it('só aprovado libera a etapa seguinte', () => {
    expect(liberaProximaEtapa('aprovado')).toBe(true);
    expect(liberaProximaEtapa('reprovado')).toBe(false);
    expect(liberaProximaEtapa('pendente')).toBe(false);
  });
});

describe('producao.ts — normalizarDecimal', () => {
  it('aceita vírgula e ponto', () => {
    expect(normalizarDecimal('2,5')).toBe(2.5);
    expect(normalizarDecimal('2.5')).toBe(2.5);
  });

  it('vazio ou inválido vira null', () => {
    expect(normalizarDecimal('')).toBeNull();
    expect(normalizarDecimal(null)).toBeNull();
    expect(normalizarDecimal('abc')).toBeNull();
  });
});

describe('producao.ts — EVS e tolerâncias', () => {
  it('marca somente as medições fora dos limites cadastrados', () => {
    expect(avaliarTolerancias(
      { altura: 10.2, offset: 3 },
      [
        { medida: 'altura', minimo: 10, maximo: 10.5 },
        { medida: 'offset', minimo: 0, maximo: 2 },
      ],
    )).toEqual([{ medida: 'offset', valor: 3, minimo: 0, maximo: 2 }]);
  });

  it('exige o conjunto completo quando há pendência ou violação de tolerância', () => {
    expect(deveExigirMedicoesEvs('aprovado', false)).toBe(false);
    expect(deveExigirMedicoesEvs('pendente', false)).toBe(true);
    expect(deveExigirMedicoesEvs('aprovado', true)).toBe(true);
  });
});

describe('producao.ts — indicadores de qualidade', () => {
  it('calcula FPY, retrabalho e WIP a partir dos lançamentos', () => {
    expect(calcularIndicadoresQualidade([
      { etapaId: 'corte', status: 'aprovado', tentativa: 1 },
      { etapaId: 'evs', status: 'aprovado', tentativa: 2 },
      { etapaId: 'ut', status: 'reprovado', tentativa: 1 },
      { etapaId: 'solda', status: 'pendente', tentativa: 1 },
    ])).toEqual({ total: 4, fpy: 25, retrabalho: 25, wip: 2 });
  });
});

describe('producao.ts — relatório diário', () => {
  it('consolida contadores por data e ordena do dia mais recente', () => {
    expect(calcularRelatorioDiario([
      { data_liberacao: '2026-09-10', status: 'aprovado' },
      { data_liberacao: '2026-09-10', status: 'refugado' },
      { data_liberacao: '2026-09-11', status: 'pendente' },
    ])).toEqual([
      { data: '2026-09-11', total: 1, aprovados: 0, reprovados: 0, refugados: 0, pendentes: 1 },
      { data: '2026-09-10', total: 2, aprovados: 1, reprovados: 0, refugados: 1, pendentes: 0 },
    ]);
  });
});
