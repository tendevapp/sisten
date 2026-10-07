import { describe, expect, it, vi } from 'vitest';

vi.mock('../db/supabaseClient', () => ({ supabase: {} }));

import { dataHoraBR, diaLocal, filtrarRegistros, linhasAlteracao, resumoRegistro, type RegistroLogEntrega } from './producaoEntregaLog';

function registro(parcial: Partial<RegistroLogEntrega>): RegistroLogEntrega {
  return {
    id: 1,
    tabela: 'tramo',
    tramoId: 'T3-3165',
    operacao: 'alteracao',
    alteracoes: [],
    antes: null,
    depois: { id: 'T3-3165', torre_numero: 6, tramo: 'T3', serie: 3165 },
    alteradoPor: 'u1',
    alteradoPorNome: 'Fulano',
    origem: 'app',
    createdAt: '2026-10-07T17:03:08.938+00:00',
    ...parcial,
  };
}

describe('log do Controle de Entrega', () => {
  it('mostra data e hora de Brasília e agrupa pelo dia local', () => {
    expect(dataHoraBR('2026-10-07T17:03:08.938+00:00')).toBe('07/10/26 14:03');
    // 01h UTC ainda é o dia anterior em Brasília.
    expect(diaLocal('2026-10-08T01:30:00+00:00')).toBe('2026-10-07');
  });

  it('traduz campo e valor e esconde campos internos', () => {
    const r = registro({
      alteracoes: [
        { campo: 'etapa_categoria', de: 'internos', para: 'white' },
        { campo: 'dias_espera', de: 3, para: 0 },
        { campo: 'id', de: 'a', para: 'b' },
      ],
    });
    expect(linhasAlteracao(r)).toEqual([
      { campo: 'etapa_categoria', rotulo: 'Etapa', de: 'Internos', para: 'White' },
      { campo: 'dias_espera', rotulo: 'Dias de espera', de: '3', para: '0' },
    ]);
    expect(resumoRegistro(r)).toBe('Etapa: Internos → White');
  });

  it('descreve o checklist de expedição', () => {
    expect(resumoRegistro(registro({ tabela: 'checklist', operacao: 'inclusao', depois: { etapa_codigo: 'limpeza' } })))
      .toBe('Checklist: concluiu "Limpeza do tramo concluída"');
    expect(resumoRegistro(registro({
      tabela: 'checklist',
      antes: { etapa_codigo: 'limpeza' },
      depois: { etapa_codigo: 'limpeza' },
      alteracoes: [{ campo: 'excluido_em', de: null, para: '2026-10-07T17:00:00+00:00' }],
    }))).toBe('Checklist: desmarcou "Limpeza do tramo concluída"');
  });

  it('filtra por série, autor e tipo', () => {
    const lista = [
      registro({ id: 1 }),
      registro({ id: 2, tramoId: 'T1-3148', depois: { torre_numero: 6, tramo: 'T1', serie: 3148 }, alteradoPorNome: 'Beltrano' }),
      registro({ id: 3, tabela: 'checklist', depois: { etapa_codigo: 'limpeza' }, operacao: 'inclusao' }),
    ];
    expect(filtrarRegistros(lista, { busca: '3148', autor: '', tipo: '' }).map(r => r.id)).toEqual([2]);
    expect(filtrarRegistros(lista, { busca: '', autor: 'Fulano', tipo: '' }).map(r => r.id)).toEqual([1, 3]);
    expect(filtrarRegistros(lista, { busca: '', autor: '', tipo: 'checklist' }).map(r => r.id)).toEqual([3]);
  });
});
