import { describe, expect, it } from 'vitest';
import { destinoDoLancamento, turnoDoLivro } from './passagemPlantao';
import type { PortPassagemPlantao, PortRelatorioPortaria } from '../types';

function livro(id: string, extra: Partial<PortRelatorioPortaria> = {}): PortRelatorioPortaria {
  return {
    id,
    codigo_formulario: 'FRM.SGP-0010',
    numero_protocolo: `REL-${id}`,
    data: '2026-11-13',
    turno: 'NOITE',
    horario_inicio: '06:00',
    horario_fim: '18:00',
    vigilante_principal: 'VIGILANTE',
    vigilante_ronda01: null,
    vigilante_ronda02: null,
    status: 'EM_ANDAMENTO',
    observacoes_gerais: null,
    criado_por: 'usuario-1',
    created_at: '2026-11-13T07:57:00Z',
    updated_at: '2026-11-13T07:57:00Z',
    plantao_id: null,
    ...extra,
  };
}

const diurno = {
  id: 'plt-diurno',
  data: '2026-11-13',
  turno: 'DIURNO',
  horario_inicio: '06:00',
  horario_fim: '18:00',
  vigilante_portaria: 'SIMONE PEDREIRA DA SILVA',
  vigilante_ronda01: 'EDUARDO INACIO FERREIRA',
  vigilante_ronda02: null,
  criado_por: 'eduardo',
} as unknown as PortPassagemPlantao;

const base = { hoje: '2026-11-13', turnoAgora: 'MANHA' as const, vigilante: 'QUEM LANÇA', usuarioId: 'quem-lanca' };

describe('destinoDoLancamento — livro por plantão', () => {
  it('com plantão aberto, usa o livro dele', () => {
    const r = destinoDoLancamento({
      ...base,
      plantao: diurno,
      livros: [livro('do-diurno', { plantao_id: 'plt-diurno' })],
    });
    expect(r).toEqual({ tipo: 'existente', livroId: 'do-diurno' });
  });

  it('não reaproveita o livro do dia que é de outro plantão (o noturno encerrado)', () => {
    // Caso de 13/11: a ronda das 04:55 abriu o livro do dia; o diurno não pode cair nele.
    const r = destinoDoLancamento({
      ...base,
      plantao: diurno,
      livros: [livro('noturno-do-edinei', { plantao_id: 'plt-noturno' })],
    });
    expect(r.tipo).toBe('novo');
  });

  it('abre o livro com data, turno, horário e equipe do plantão', () => {
    const r = destinoDoLancamento({ ...base, plantao: diurno, livros: [] });
    expect(r).toEqual({
      tipo: 'novo',
      livro: {
        plantao_id: 'plt-diurno',
        data: '2026-11-13',
        turno: 'DIURNO',
        horario_inicio: '06:00',
        horario_fim: '18:00',
        vigilante_principal: 'SIMONE PEDREIRA DA SILVA',
        vigilante_ronda01: 'EDUARDO INACIO FERREIRA',
        vigilante_ronda02: null,
        criado_por: 'eduardo',
      },
    });
  });

  it('ignora livro excluído do plantão', () => {
    const r = destinoDoLancamento({
      ...base,
      plantao: diurno,
      livros: [livro('excluido', { plantao_id: 'plt-diurno', excluido_em: '2026-11-13T10:00:00Z' })],
    });
    expect(r.tipo).toBe('novo');
  });

  it('sem plantão aberto, usa o livro em andamento do dia que não é de plantão', () => {
    const r = destinoDoLancamento({
      ...base,
      plantao: null,
      livros: [
        livro('aberto-antigo', { data: '2026-08-30' }),
        livro('de-plantao', { plantao_id: 'plt-x' }),
        livro('do-dia'),
      ],
    });
    expect(r).toEqual({ tipo: 'existente', livroId: 'do-dia' });
  });

  it('sem plantão aberto e sem livro do dia em andamento, abre um novo do dia', () => {
    const r = destinoDoLancamento({
      ...base,
      plantao: null,
      livros: [livro('encerrado-hoje', { status: 'CONCLUIDO' })],
    });
    expect(r).toEqual({
      tipo: 'novo',
      livro: { data: '2026-11-13', turno: 'MANHA', vigilante_principal: 'QUEM LANÇA', criado_por: 'quem-lanca' },
    });
  });
});

describe('turnoDoLivro', () => {
  it('mantém DIURNO/NOTURNO e turnos conhecidos; desconhecido vira DIURNO', () => {
    expect(turnoDoLivro('NOTURNO')).toBe('NOTURNO');
    expect(turnoDoLivro('diurno')).toBe('DIURNO');
    expect(turnoDoLivro('MANHA')).toBe('MANHA');
    expect(turnoDoLivro('XYZ')).toBe('DIURNO');
    expect(turnoDoLivro(null)).toBe('DIURNO');
  });
});
