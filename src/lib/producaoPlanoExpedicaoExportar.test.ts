import { describe, expect, it } from 'vitest';
import { CABECALHO_PLANO_EXPEDICAO, filtrarPlanoPorPeriodo, linhasPlanilhaPlanoExpedicao, rotuloArquivoPeriodo } from './producaoPlanoExpedicaoExportar';
import type { PlanoExpedicaoProducao } from './producaoApi';

const linha = (extra: Partial<PlanoExpedicaoProducao> = {}): PlanoExpedicaoProducao => ({
  id: '1', semana: 5, torre_numero: 13, tramo: 'T5', identificador: 3227,
  nf_faturamento_emitida: true, nf_gw_emitida: true, nf_expedicao_emitida: false,
  status: 'faturado', data_carregamento: '2026-11-04', data_expedicao: '2026-11-05T00:00:00',
  observacao: 'carreta 2', atualizado_em: '', atualizado_por: null, ...extra,
});

describe('linhasPlanilhaPlanoExpedicao', () => {
  it('monta uma linha por tramo no layout do cabeçalho', () => {
    const [l] = linhasPlanilhaPlanoExpedicao([linha()]);
    expect(l).toHaveLength(CABECALHO_PLANO_EXPEDICAO.length);
    expect(l).toEqual(['W05', 13, 'T5', 3227, 'Sim', 'Sim', 'Não', '04/11/2026', '05/11/2026', 'Faturado', 'carreta 2']);
  });

  it('deixa em branco o que não foi preenchido', () => {
    const [l] = linhasPlanilhaPlanoExpedicao([linha({ identificador: null, data_carregamento: null, data_expedicao: 'lixo', observacao: null, status: 'a_faturar' })]);
    expect(l[3]).toBe('');
    expect(l[7]).toBe('');
    expect(l[8]).toBe('');
    expect(l[9]).toBe('A faturar');
    expect(l[10]).toBe('');
  });
});

describe('filtrarPlanoPorPeriodo', () => {
  const plano = [
    linha({ id: 'a', semana: 44, torre_numero: 12, data_expedicao: '2026-10-30', data_carregamento: '2026-10-29' }),
    linha({ id: 'b', semana: 45, torre_numero: 13, data_expedicao: '2026-11-04', data_carregamento: '2026-11-04' }),
    linha({ id: 'c', semana: 46, torre_numero: 14, data_expedicao: null, data_carregamento: '2026-11-11' }),
  ];
  const ids = (l: PlanoExpedicaoProducao[]) => l.map(x => x.id);

  it('recorta por intervalo de semanas, inclusive e com limites invertidos', () => {
    expect(ids(filtrarPlanoPorPeriodo(plano, { tipo: 'semanas', de: 45, ate: 46 }))).toEqual(['b', 'c']);
    expect(ids(filtrarPlanoPorPeriodo(plano, { tipo: 'semanas', de: 45, ate: 44 }))).toEqual(['a', 'b']);
  });

  it('recorta por datas no campo escolhido e deixa de fora quem não tem a data', () => {
    expect(ids(filtrarPlanoPorPeriodo(plano, { tipo: 'datas', de: '2026-10-30', ate: '2026-11-30', campo: 'data_expedicao' }))).toEqual(['a', 'b']);
    expect(ids(filtrarPlanoPorPeriodo(plano, { tipo: 'datas', de: '2026-11-01', ate: '2026-11-30', campo: 'data_carregamento' }))).toEqual(['b', 'c']);
  });

  it('aplica a torre junto com o período', () => {
    expect(ids(filtrarPlanoPorPeriodo(plano, { tipo: 'tudo' }, 13))).toEqual(['b']);
  });

  it('dá nome ao arquivo conforme o período', () => {
    expect(rotuloArquivoPeriodo({ tipo: 'semanas', de: 46, ate: 44 })).toBe('W44-W46');
    expect(rotuloArquivoPeriodo({ tipo: 'semanas', de: 45, ate: 45 }, 13)).toBe('W45_Torre_13');
    expect(rotuloArquivoPeriodo({ tipo: 'datas', de: '2026-11-30', ate: '2026-11-01', campo: 'data_expedicao' })).toBe('Exp_011126-301126');
    expect(rotuloArquivoPeriodo({ tipo: 'tudo' })).toBe('Completo');
  });
});
