import { describe, expect, it } from 'vitest';
import type { CategoriaEtapa, TramoEntrega, TramoId } from './producaoEntrega';
import {
  camposAoMoverParaZona,
  distribuirWip,
  ultimaOperacaoPorTramo,
  zonaPorControleEntrega,
  type OperacaoTramo,
} from './producaoWip';

const AGORA = new Date('2026-10-05T12:00:00Z');

function tramo(
  torre: number,
  id: TramoId,
  serie: number,
  categoria: CategoriaEtapa,
  etapa: string,
  diasEspera = 1,
): TramoEntrega {
  return {
    id: `${id}-${serie}`,
    projeto: 'GW_JACOBINA',
    torre_numero: torre,
    tramo: id,
    serie,
    subprojeto_id: 'SP01',
    etapa_categoria: categoria,
    etapa_nome: etapa,
    status_aguardando: null,
    data_entrada_etapa: '2026-09-01T00:00:00Z',
    dias_espera: diasEspera,
    observacao: null,
    updated_at: AGORA.toISOString(),
  };
}

function op(codigo: string, processo: string, data = '2026-10-05T08:00:00Z'): OperacaoTramo {
  return { tramo_codigo: codigo, processo_id: processo, data_apontamento: data };
}

describe('producaoWip - zonas pelo Controle de Entrega', () => {
  it('mapeia cada categoria para a zona da planta', () => {
    expect(zonaPorControleEntrega({ etapa_categoria: 'nav01', etapa_nome: 'NAV01' })).toBe('calandra_saw1');
    expect(zonaPorControleEntrega({ etapa_categoria: 'saw02', etapa_nome: 'MARCO PORTA' })).toBe('saw');
    // Pendência não tira o tramo da zona: o nome da etapa decide.
    expect(zonaPorControleEntrega({ etapa_categoria: 'pendencias', etapa_nome: 'SAW02' })).toBe('saw');
    expect(zonaPorControleEntrega({ etapa_categoria: 'pendencias', etapa_nome: 'LIB.JATO' })).toBe('acabamento');
    expect(zonaPorControleEntrega({ etapa_categoria: 'pendencias', etapa_nome: 'PENDÊNCIAS' })).toBeNull();
    expect(zonaPorControleEntrega({ etapa_categoria: 'saw03', etapa_nome: 'SAW03' })).toBe('saw');
    expect(zonaPorControleEntrega({ etapa_categoria: 'internos', etapa_nome: 'INTERNOS' })).toBe('internos');
  });

  it('separa Montagem de Acabamento dentro de White pelo nome da etapa', () => {
    expect(zonaPorControleEntrega({ etapa_categoria: 'white', etapa_nome: 'MONTAGEM' })).toBe('montagem');
    expect(zonaPorControleEntrega({ etapa_categoria: 'white', etapa_nome: 'Montagem (pátio)' })).toBe('montagem');
    expect(zonaPorControleEntrega({ etapa_categoria: 'white', etapa_nome: 'PINTURA' })).toBe('acabamento');
    expect(zonaPorControleEntrega({ etapa_categoria: 'white', etapa_nome: 'LIB.JATO' })).toBe('acabamento');
  });

  it('deixa pendente, pátio e expedido fora das zonas', () => {
    expect(zonaPorControleEntrega({ etapa_categoria: 'pendente', etapa_nome: 'PENDENTE' })).toBeNull();
    expect(zonaPorControleEntrega({ etapa_categoria: 'patio', etapa_nome: 'PÁTIO' })).toBeNull();
    expect(zonaPorControleEntrega({ etapa_categoria: 'expedido', etapa_nome: 'EXPEDIDO' })).toBeNull();
  });
});

describe('producaoWip - último processo apontado', () => {
  it('fica com o processo mais avançado, não com o mais recente', () => {
    const mapa = ultimaOperacaoPorTramo([
      op('T1-3143', 'saw_2_3', '2026-10-04T08:00:00Z'),
      op('T1-3143', 'marco_porta', '2026-10-05T08:00:00Z'),
    ]);
    expect(mapa.get('T1-3143')?.processo_id).toBe('saw_2_3');
  });

  it('ignora processo desconhecido e apontamento sem tramo', () => {
    const mapa = ultimaOperacaoPorTramo([
      op('T1-3143', 'processo_inexistente'),
      { tramo_codigo: '', processo_id: 'jato', data_apontamento: '2026-10-05T08:00:00Z' },
    ]);
    expect(mapa.size).toBe(0);
  });
});

describe('producaoWip - distribuição do WIP', () => {
  it('conta cada tramo na zona certa e separa o que está fora', () => {
    const tramos = [
      tramo(1, 'T1', 3143, 'expedido', 'EXPEDIDO', 0),
      tramo(2, 'T1', 3148, 'patio', 'PÁTIO', 2),
      tramo(3, 'T5', 3192, 'white', 'MONTAGEM', 3),
      tramo(4, 'T1', 3200, 'white', 'PINTURA', 1),
      tramo(5, 'T2', 3210, 'internos', 'INTERNOS', 2),
      tramo(6, 'T3', 3220, 'saw02', 'MARCO PORTA', 1),
      tramo(20, 'T1', 3300, 'pendente', 'PENDENTE', 0),
    ];
    const r = distribuirWip(tramos, new Map(), AGORA);

    expect(r.total).toBe(4);
    expect(r.porZona.montagem).toHaveLength(1);
    expect(r.porZona.acabamento).toHaveLength(1);
    expect(r.porZona.internos).toHaveLength(1);
    expect(r.porZona.saw).toHaveLength(1);
    expect(r.porZona.corte).toHaveLength(0);
    expect(r.fora).toEqual({ pendente: 1, patio: 1, expedido: 1 });
  });

  it('o apontamento reposiciona o tramo e traz pendente para dentro do WIP', () => {
    const tramos = [
      tramo(3, 'T5', 3192, 'white', 'MONTAGEM', 3),
      tramo(20, 'T1', 3300, 'pendente', 'PENDENTE', 0),
    ];
    const ops = ultimaOperacaoPorTramo([op('T5-3192', 'internos_inexistente'), op('T5-3192', 'ut_circunferencial'), op('T1-3300', 'marco_porta')]);
    const r = distribuirWip(tramos, ops, AGORA);

    expect(r.porZona.internos.map(i => i.tramo.id)).toEqual(['T5-3192']);
    expect(r.porZona.saw.map(i => i.tramo.id)).toEqual(['T1-3300']);
    expect(r.porZona.internos[0].origem).toBe('apontamento');
    expect(r.fora.pendente).toBe(0);
  });

  it('expedido e pátio no controle vencem qualquer apontamento atrasado', () => {
    const tramos = [tramo(1, 'T1', 3143, 'expedido', 'EXPEDIDO', 0)];
    const ops = ultimaOperacaoPorTramo([op('T1-3143', 'saw_2_3')]);
    const r = distribuirWip(tramos, ops, AGORA);

    expect(r.total).toBe(0);
    expect(r.fora.expedido).toBe(1);
  });

  it('Montagem Final apontada tira o tramo do WIP', () => {
    const tramos = [tramo(3, 'T5', 3192, 'white', 'MONTAGEM', 3)];
    const ops = ultimaOperacaoPorTramo([op('T5-3192', 'montagem_final')]);
    const r = distribuirWip(tramos, ops, AGORA);

    expect(r.total).toBe(0);
    expect(r.fora.patio).toBe(1);
  });

  it('acabamento_pintura já posiciona o tramo na Montagem', () => {
    const tramos = [tramo(3, 'T5', 3192, 'white', 'PINTURA', 1)];
    const ops = ultimaOperacaoPorTramo([op('T5-3192', 'acabamento_pintura')]);
    const r = distribuirWip(tramos, ops, AGORA);

    expect(r.porZona.montagem).toHaveLength(1);
  });

  it('calcula a espera pelo apontamento e marca os críticos (>= 5 dias)', () => {
    const tramos = [
      tramo(1, 'T1', 3143, 'white', 'MONTAGEM', 0),
      tramo(2, 'T1', 3148, 'white', 'MONTAGEM', 5),
    ];
    const ops = ultimaOperacaoPorTramo([op('T1-3143', 'acabamento_pintura', '2026-09-29T12:00:00Z')]);
    const r = distribuirWip(tramos, ops, AGORA);

    const apontado = r.porZona.montagem.find(i => i.tramo.id === 'T1-3143')!;
    expect(apontado.dias).toBe(6);
    expect(apontado.nivel).toBe('critico');
    expect(r.criticos).toBe(2);
  });

  it('ordena do mais parado para o menos parado', () => {
    const tramos = [
      tramo(1, 'T1', 3143, 'internos', 'INTERNOS', 1),
      tramo(2, 'T1', 3148, 'internos', 'INTERNOS', 4),
      tramo(3, 'T1', 3150, 'internos', 'INTERNOS', 2),
    ];
    const r = distribuirWip(tramos, new Map(), AGORA);

    expect(r.porZona.internos.map(i => i.dias)).toEqual([4, 2, 1]);
  });
});

describe('producaoWip - mover tramo no mapa', () => {
  it('um movimento manual mais recente vence o apontamento antigo', () => {
    const movido = { ...tramo(3, 'T5', 3192, 'internos', 'INTERNOS', 0), data_entrada_etapa: '2026-10-05T10:00:00Z' };
    const ops = ultimaOperacaoPorTramo([op('T5-3192', 'saw_2_3', '2026-10-05T08:00:00Z')]);
    const r = distribuirWip([movido], ops, AGORA);

    expect(r.porZona.internos).toHaveLength(1);
    expect(r.porZona.saw).toHaveLength(0);
    expect(r.porZona.internos[0].origem).toBe('controle');
  });

  it('um apontamento posterior ao movimento volta a mandar', () => {
    const movido = { ...tramo(3, 'T5', 3192, 'internos', 'INTERNOS', 0), data_entrada_etapa: '2026-10-05T10:00:00Z' };
    const ops = ultimaOperacaoPorTramo([op('T5-3192', 'saw_2_3', '2026-10-05T11:00:00Z')]);
    const r = distribuirWip([movido], ops, AGORA);

    expect(r.porZona.saw).toHaveLength(1);
  });

  it('grava a etapa padrão da zona de destino e zera a espera', () => {
    const campos = camposAoMoverParaZona({ etapa_categoria: 'saw02', etapa_nome: 'MARCO PORTA' }, 'internos', AGORA);

    expect(campos).toEqual({
      etapa_categoria: 'internos',
      etapa_nome: 'INTERNOS',
      status_aguardando: null,
      dias_espera: 0,
      data_entrada_etapa: AGORA.toISOString(),
    });
  });

  it('mantém a etapa quando o controle já classifica o tramo na zona', () => {
    const campos = camposAoMoverParaZona({ etapa_categoria: 'white', etapa_nome: 'PINTURA' }, 'acabamento', AGORA);

    expect(campos?.etapa_categoria).toBe('white');
    expect(campos?.etapa_nome).toBe('PINTURA');
  });

  it('separa Montagem de Acabamento dentro de white', () => {
    expect(camposAoMoverParaZona({ etapa_categoria: 'white', etapa_nome: 'PINTURA' }, 'montagem', AGORA)?.etapa_nome).toBe('MONTAGEM');
    expect(camposAoMoverParaZona({ etapa_categoria: 'white', etapa_nome: 'MONTAGEM' }, 'acabamento', AGORA)?.etapa_nome).toBe('LIB.JATO');
  });

  it('não aceita mover para Corte', () => {
    expect(camposAoMoverParaZona({ etapa_categoria: 'nav01', etapa_nome: 'NAV01' }, 'corte', AGORA)).toBeNull();
  });
});
