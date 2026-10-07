import { describe, expect, it } from 'vitest';
import {
  TRECHOS,
  curvaSemanal,
  diasNaEtapa,
  diasUteis,
  duracoesTrecho,
  envelhecimento,
  etapaDosMarcos,
  faixaEspera,
  indicadoresMarco,
  linhaMensal,
  planoSemanal,
  quantil,
  referenciasEspera,
  resumoTorres,
  validarMarco,
  type MarcoTramo,
  type MetaMarco,
  type TramoAtual,
} from './producaoTramos';

function tramo(serie: number, marcos: Partial<Record<MarcoTramo, string>>, extra: Partial<TramoAtual> = {}): TramoAtual {
  return {
    tramoId: `T1-${serie}`,
    serie,
    torreNumero: 1,
    tramo: 'T1',
    marcos,
    etapa: etapaDosMarcos(marcos),
    situacaoId: null,
    setorAtual: null,
    atividadeAtual: null,
    situacaoEm: null,
    reparosSolda: 0,
    ultimoEventoEm: null,
    eventos: 0,
    ...extra,
  };
}

// Linha 3147 da aba TRAMOS (07/10/2026).
const T3147 = tramo(3147, {
  inicio: '2026-05-04',
  liberado_nav02: '2026-05-28',
  liberado_jato: '2026-07-10',
  liberado_patio: '2026-08-18',
  expedido: '2026-08-28',
});

describe('etapa e cronologia', () => {
  it('a etapa decorre do último marco', () => {
    expect(etapaDosMarcos({})).toBe('corte');
    expect(etapaDosMarcos({ inicio: '2026-05-04' })).toBe('nav01');
    expect(etapaDosMarcos({ inicio: '2026-05-04', liberado_nav02: '2026-05-28', liberado_jato: '2026-07-10' })).toBe('jato');
    expect(T3147.etapa).toBe('expedido');
  });

  it('exige o marco anterior e respeita a ordem nos dois sentidos', () => {
    const hoje = '2026-10-07';
    expect(validarMarco({}, 'liberado_jato', '2026-08-01', hoje)).toBe('"Liberado p/ Jato" exige "Liberado p/ NAV02" antes.');
    expect(validarMarco({ inicio: '2026-04-22', liberado_nav02: '2026-08-02' }, 'liberado_jato', '2026-08-01', hoje))
      .toBe('"Liberado p/ Jato" (01/08/26) não pode ser antes de "Liberado p/ NAV02" (02/08/26).');
    expect(validarMarco({ inicio: '2026-04-22', liberado_nav02: '2026-08-02' }, 'liberado_jato', '2026-10-08', hoje))
      .toBe('A data não pode ser futura.');
    expect(validarMarco({ inicio: '2026-04-22' }, 'inicio', '2026-04-23', hoje)).toMatch(/já tem o marco/);
    expect(validarMarco({ inicio: '2026-04-22', liberado_nav02: '2026-05-01' }, 'liberado_jato', '2026-10-06', hoje)).toBeNull();
  });
});

describe('dias da planilha', () => {
  it('reproduz as colunas Dias da linha 3147', () => {
    const dias = Object.fromEntries(TRECHOS.map(t => [t.id, duracoesTrecho([T3147], t)[0]?.dias]));
    expect(dias).toMatchObject({ nav02: 43, jato: 39, patio: 10, processo: 82, total: 116 });
  });

  it('conta dias parados na etapa atual', () => {
    const t = tramo(3161, { inicio: '2026-05-07', liberado_nav02: '2026-05-20', liberado_jato: '2026-08-13' });
    expect(diasNaEtapa(t, '2026-10-07')).toBe(55);
    expect(diasNaEtapa(T3147, '2026-10-07')).toBeNull();
  });

  it('quantil interpola e a faixa usa a mediana e o P80 da etapa', () => {
    expect(quantil([10, 20, 30, 40, 50], 0.5)).toBe(30);
    expect(quantil([10, 20, 30, 40, 50], 0.8)).toBe(42);
    const concluidos = [10, 20, 30, 40, 50].map((d, i) =>
      tramo(4000 + i, { inicio: '2026-05-01', liberado_nav02: '2026-06-01', liberado_jato: `2026-07-${String(1 + d / 10).padStart(2, '0')}` }),
    );
    const ref = referenciasEspera(concluidos).nav02;
    expect(ref.base).toBe(5);
    expect(faixaEspera(ref.alerta, ref)).toBe('normal');
    expect(faixaEspera(ref.alerta + 1, ref)).toBe('alerta');
    expect(faixaEspera(ref.critico + 1, ref)).toBe('critico');
  });

  it('agrupa o WIP por faixa de dias parados', () => {
    const linhas = envelhecimento([
      tramo(1, { inicio: '2026-10-01' }),
      tramo(2, { inicio: '2026-08-01' }),
      tramo(3, { inicio: '2026-05-01', liberado_nav02: '2026-09-20' }),
    ], '2026-10-07');
    expect(linhas.find(l => l.etapa === 'nav01')).toMatchObject({ total: 2, ate15: 1, mais60: 1 });
    expect(linhas.find(l => l.etapa === 'nav02')).toMatchObject({ total: 1, ate30: 1 });
  });
});

describe('Plan × Real e ritmo', () => {
  const metas: MetaMarco[] = [
    { marco: 'liberado_jato', granularidade: 'mes', ano: 2026, periodo: 6, quantidade: 4 },
    { marco: 'liberado_jato', granularidade: 'mes', ano: 2026, periodo: 7, quantidade: 18 },
    { marco: 'liberado_jato', granularidade: 'mes', ano: 2026, periodo: 8, quantidade: 25 },
    { marco: 'liberado_jato', granularidade: 'semana', ano: 2026, periodo: 32, quantidade: 6 },
    { marco: 'liberado_jato', granularidade: 'semana', ano: 2026, periodo: 33, quantidade: 6 },
  ];

  it('marca abaixo, atingido e mês em andamento', () => {
    const tramos = [
      tramo(1, { inicio: '2026-05-01', liberado_nav02: '2026-05-10', liberado_jato: '2026-06-10' }),
      ...Array.from({ length: 4 }, (_, i) => tramo(10 + i, { inicio: '2026-05-01', liberado_nav02: '2026-05-10', liberado_jato: '2026-08-05' })),
    ];
    const linha = linhaMensal(tramos, metas, 'liberado_jato', ['2026-06', '2026-07', '2026-08'], '2026-08');
    expect(linha.map(c => [c.plan, c.real, c.situacao])).toEqual([
      [4, 1, 'abaixo'],
      [18, 0, 'abaixo'],
      [25, 4, 'andamento'],
    ]);
  });

  it('meta mensal entra na semana do último dia do mês, até a 1ª semana com meta semanal', () => {
    const plano = planoSemanal(metas, 'liberado_jato', 2026);
    expect(plano.get(27)).toBe(4); // 30/06/2026, terça
    expect(plano.get(31)).toBe(18); // 31/07/2026, sexta
    expect(plano.get(36)).toBeUndefined(); // agosto fica coberto pelas metas semanais
    expect(plano.get(32)).toBe(6);
  });

  it('conta dias úteis e o ritmo necessário até o prazo', () => {
    expect(diasUteis('2026-10-07', '2026-10-31')).toBe(18);
    const tramos = Array.from({ length: 80 }, (_, i) => tramo(i, { inicio: '2026-05-01', liberado_nav02: '2026-06-01' }));
    const ind = indicadoresMarco(tramos, 'liberado_nav02', { marco: 'liberado_nav02', total: 115, prazo: '2026-10-31' }, '2026-10-07');
    expect(ind.saldo).toBe(35);
    expect(ind.ritmoNecessario).toBeCloseTo(35 / 18);
    expect(ind.ritmoReal).toBe(0);
    expect(ind.atrasado).toBe(true);
  });
});

describe('curva S', () => {
  it('acumula o plano mensal até a 1ª semana com meta semanal e projeta pelo ritmo', () => {
    const metas: MetaMarco[] = [
      { marco: 'liberado_jato', granularidade: 'mes', ano: 2026, periodo: 6, quantidade: 4 },
      { marco: 'liberado_jato', granularidade: 'mes', ano: 2026, periodo: 7, quantidade: 18 },
      { marco: 'liberado_jato', granularidade: 'mes', ano: 2026, periodo: 8, quantidade: 25 },
      ...[32, 33, 34].map(periodo => ({ marco: 'liberado_jato' as const, granularidade: 'semana' as const, ano: 2026, periodo, quantidade: 6 })),
    ];
    const tramos = [
      ...Array.from({ length: 14 }, (_, i) => tramo(i, { inicio: '2026-05-01', liberado_nav02: '2026-05-10', liberado_jato: '2026-07-15' })),
      ...Array.from({ length: 7 }, (_, i) => tramo(100 + i, { inicio: '2026-05-01', liberado_nav02: '2026-05-10', liberado_jato: '2026-08-05' })),
    ];
    const pontos = curvaSemanal({ tramos, metas, marco: 'liberado_jato', total: 115, ano: 2026, semanaAtual: { ano: 2026, semana: 33 } });
    const w31 = pontos.find(p => p.semana.semana === 31)!;
    const w32 = pontos.find(p => p.semana.semana === 32)!;
    expect(w31.planAcum).toBe(22);
    expect(w32).toMatchObject({ plan: 6, planAcum: 28, real: 7, realAcum: 21 });
    // Agosto (mensal) não soma: a meta semanal assume a partir da W32.
    expect(pontos.find(p => p.semana.semana === 34)!.planAcum).toBe(40);
    expect(pontos.find(p => p.semana.semana === 35)!.realAcum).toBeNull();
    expect(pontos.find(p => p.semana.semana === 33)!.projecao).toBe(21);
  });
});

describe('torres', () => {
  it('torre pronta para expedir = 5 tramos no pátio ou expedidos', () => {
    const fim = { inicio: '2026-05-01', liberado_nav02: '2026-05-10', liberado_jato: '2026-06-10', liberado_patio: '2026-07-10' };
    const tramos = (['T1', 'T2', 'T3', 'T4', 'T5'] as const).map((t, i) =>
      tramo(i, i === 0 ? { ...fim, expedido: '2026-08-01' } : fim, { tramo: t, torreNumero: 7 }),
    );
    expect(resumoTorres(tramos)[0]).toMatchObject({ torre: 7, prontaParaExpedir: true, expedida: false });
    expect(resumoTorres(tramos.slice(1))[0].prontaParaExpedir).toBe(false);
  });
});
