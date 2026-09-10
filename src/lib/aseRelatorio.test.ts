import { describe, expect, it } from 'vitest';
import type { AseHoraExtraCompleta, AseHoraExtraItem } from '../types';
import type { RhPessoa } from '../types';
import {
  acharLinhas, agruparPor, descreverFiltro, filtrarSolicitacoes, filtroVazio,
  horasPorAreaSubsetor, intervaloDoPreset, opcoesDe, porRota, resumoAse, rotuloDia,
  serieDiaria, setorDe, topColaboradores, chaveColaboradorAse, SEM_INFO,
} from './aseRelatorio';

function item(over: Partial<AseHoraExtraItem> = {}): AseHoraExtraItem {
  return {
    id: over.id || Math.random().toString(36).slice(2),
    solicitacao_id: over.solicitacao_id || 's1',
    pessoa_id: null,
    registro: '1001',
    nome: 'Ana Souza',
    cargo: 'Soldadora',
    transporte: false,
    refeicao: false,
    hora_entrada: '18:00',
    hora_saida: '20:00',
    intervalo_minutos: 0,
    percentual_he: 60,
    total_horas: 2,
    observacao: null,
    created_at: '2026-09-01T00:00:00Z',
    ...over,
  };
}

function ase(over: Partial<AseHoraExtraCompleta> = {}): AseHoraExtraCompleta {
  const id = over.id || 's1';
  return {
    id,
    codigo_formulario: 'FRM.RHU-0007',
    numero_protocolo: `ASE-010926-PRD-0${id.slice(-1)}`,
    solicitante_id: 'u1',
    setor_id: 'set1',
    turno_id: 't1',
    data_execucao: '2026-09-01',
    justificativa: null,
    status: 'ENVIADO',
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
    setor_nome: 'Produção',
    turno_nome: 'Turno A',
    solicitante_nome: 'Carlos Lima',
    itens: [item({ solicitacao_id: id })],
    ...over,
  };
}

describe('filtrarSolicitacoes', () => {
  const base = [
    ase({ id: 's1', data_execucao: '2026-09-01', setor_nome: 'Produção' }),
    ase({ id: 's2', data_execucao: '2026-09-10', setor_nome: 'Manutenção', turno_nome: 'Turno B' }),
    ase({ id: 's3', data_execucao: '2026-09-20', setor_nome: 'Produção', status: 'RASCUNHO' }),
  ];

  it('recorta pelo período inclusive nas pontas', () => {
    const r = filtrarSolicitacoes(base, { ...filtroVazio(), de: '2026-09-01', ate: '2026-09-10' });
    expect(r.map(s => s.id)).toEqual(['s1', 's2']);
  });

  it('sem período devolve tudo', () => {
    expect(filtrarSolicitacoes(base, filtroVazio())).toHaveLength(3);
  });

  it('conjunto vazio de setor não recorta; com valor, recorta', () => {
    expect(filtrarSolicitacoes(base, { ...filtroVazio(), setores: new Set() })).toHaveLength(3);
    const r = filtrarSolicitacoes(base, { ...filtroVazio(), setores: new Set(['Produção']) });
    expect(r.map(s => s.id)).toEqual(['s1', 's3']);
  });

  it('filtra por status e por solicitante', () => {
    expect(filtrarSolicitacoes(base, { ...filtroVazio(), status: new Set(['RASCUNHO']) }).map(s => s.id))
      .toEqual(['s3']);
    expect(filtrarSolicitacoes(base, { ...filtroVazio(), solicitantes: new Set(['Ninguém']) }))
      .toHaveLength(0);
  });

  it('setor/turno ausentes viram "Não informado" e podem ser filtrados', () => {
    const sem = ase({ id: 's4', setor_nome: null });
    expect(setorDe(sem)).toBe('Não informado');
    const r = filtrarSolicitacoes([...base, sem], { ...filtroVazio(), setores: new Set(['Não informado']) });
    expect(r.map(s => s.id)).toEqual(['s4']);
  });

  it('recorte por transporte derruba itens e as ASEs que ficaram vazias', () => {
    const comTransporte = ase({
      id: 's5',
      itens: [
        item({ solicitacao_id: 's5', registro: '1', transporte: true }),
        item({ solicitacao_id: 's5', registro: '2', transporte: false }),
      ],
    });
    const r = filtrarSolicitacoes([...base, comTransporte], { ...filtroVazio(), apenasTransporte: true });
    expect(r.map(s => s.id)).toEqual(['s5']);
    expect(r[0].itens).toHaveLength(1);
  });
});

describe('resumoAse', () => {
  it('soma horas, benefícios e conta pessoas distintas entre dias', () => {
    const lista = [
      ase({
        id: 's1',
        data_execucao: '2026-09-01',
        itens: [
          item({ solicitacao_id: 's1', registro: '1001', total_horas: 2, transporte: true, refeicao: true }),
          item({ solicitacao_id: 's1', registro: '1002', total_horas: 1.5, refeicao: true }),
        ],
      }),
      ase({
        id: 's2',
        data_execucao: '2026-09-02',
        itens: [item({ solicitacao_id: 's2', registro: '1001', total_horas: 3 })],
      }),
    ];

    const r = resumoAse(lista);
    expect(r.ases).toBe(2);
    expect(r.colaboradores).toBe(3);
    expect(r.pessoasDistintas).toBe(2);
    expect(r.horas).toBeCloseTo(6.5);
    expect(r.mediaHorasPorColaborador).toBeCloseTo(6.5 / 3);
    expect(r.mediaColaboradoresPorAse).toBeCloseTo(1.5);
    expect(r.transportes).toBe(1);
    expect(r.refeicoes).toBe(2);
    expect(r.diasComAse).toBe(2);
  });

  it('lista vazia não divide por zero', () => {
    const r = resumoAse([]);
    expect(r.horas).toBe(0);
    expect(r.mediaHorasPorColaborador).toBe(0);
    expect(r.mediaColaboradoresPorAse).toBe(0);
  });

  it('total_horas nulo conta como zero', () => {
    const lista = [ase({ itens: [item({ total_horas: null })] })];
    expect(resumoAse(lista).horas).toBe(0);
  });
});

describe('serieDiaria', () => {
  it('agrupa por data de execução em ordem cronológica', () => {
    const lista = [
      ase({ id: 's3', data_execucao: '2026-09-20', itens: [item({ solicitacao_id: 's3', total_horas: 1 })] }),
      ase({ id: 's1', data_execucao: '2026-09-01', itens: [item({ solicitacao_id: 's1', total_horas: 2 })] }),
      ase({ id: 's2', data_execucao: '2026-09-01', itens: [item({ solicitacao_id: 's2', total_horas: 3, transporte: true })] }),
    ];

    const serie = serieDiaria(lista);
    expect(serie.map(p => p.dia)).toEqual(['2026-09-01', '2026-09-20']);
    expect(serie[0]).toMatchObject({ ases: 2, colaboradores: 2, horas: 5, transportes: 1, label: '01/09' });
  });

  it('rotuloDia não desloca a data (fuso UTC-3)', () => {
    expect(rotuloDia('2026-09-01')).toBe('01/09');
  });
});

describe('agrupamentos', () => {
  const lista = [
    ase({
      id: 's1',
      setor_nome: 'Produção',
      itens: [
        item({ solicitacao_id: 's1', registro: '1001', nome: 'Ana', total_horas: 2, transporte: true, rota_transporte: 'R1' }),
        item({ solicitacao_id: 's1', registro: '1002', nome: 'Bia', total_horas: 4 }),
      ],
    }),
    ase({
      id: 's2',
      setor_nome: 'Manutenção',
      itens: [item({ solicitacao_id: 's2', registro: '1001', nome: 'Ana', total_horas: 5, transporte: true, rota_transporte: 'R2' })],
    }),
  ];
  const linhas = acharLinhas(lista);

  it('achata os itens com o contexto da solicitação', () => {
    expect(linhas).toHaveLength(3);
    expect(linhas[0]).toMatchObject({ setor: 'Produção', turno: 'Turno A', solicitante: 'Carlos Lima' });
  });

  it('ordena por horas e conta ASEs distintas por grupo', () => {
    const porSetor = agruparPor(linhas, l => l.setor);
    expect(porSetor.map(g => g.nome)).toEqual(['Produção', 'Manutenção']);
    expect(porSetor[0]).toMatchObject({ horas: 6, colaboradores: 2, ases: 1, transportes: 1 });
  });

  it('top de colaboradores soma a mesma matrícula em dias diferentes', () => {
    const top = topColaboradores(linhas, 1);
    expect(top).toHaveLength(1);
    expect(top[0]).toMatchObject({ nome: '1001 - Ana', horas: 7, colaboradores: 2 });
  });

  it('chaveColaboradorAse casa com o rótulo do ranking (drill-down do gráfico)', () => {
    const top = topColaboradores(linhas);
    for (const l of linhas) {
      expect(top.some(g => g.nome === chaveColaboradorAse(l))).toBe(true);
    }
    expect(chaveColaboradorAse({ registro: '', nome: 'Sem Matrícula' } as any)).toBe('Sem Matrícula');
  });

  it('rotas consideram só quem tem transporte', () => {
    const rotas = porRota(linhas);
    expect(rotas.map(r => r.nome).sort()).toEqual(['R1', 'R2']);
    expect(rotas.reduce((a, r) => a + r.colaboradores, 0)).toBe(2);
  });

  it('opcoesDe devolve valores únicos em ordem alfabética', () => {
    expect(opcoesDe(lista, setorDe)).toEqual(['Manutenção', 'Produção']);
  });
});

describe('horasPorAreaSubsetor', () => {
  const pessoa = (over: Partial<RhPessoa>): RhPessoa => ({
    id: over.id || 'p',
    registro: over.registro || '9',
    nome: over.nome || 'X',
    chave_nome: null,
    macroarea: null,
    area: over.area ?? null,
    subsetor: over.subsetor ?? null,
    cargo: null,
    lideranca: null,
    turno: null,
    situacao: null,
    ativo: true,
    created_at: '',
    updated_at: '',
    atualizado_por: null,
  });

  const pessoasPorId = new Map<string, RhPessoa>([
    ['p1', pessoa({ id: 'p1', area: 'Operação', subsetor: 'Montagem' })],
    ['p2', pessoa({ id: 'p2', area: 'Operação', subsetor: 'Solda' })],
    ['p3', pessoa({ id: 'p3', area: 'Qualidade', subsetor: 'Inspeção' })],
  ]);

  const lista = [
    ase({
      id: 'a1',
      itens: [
        item({ solicitacao_id: 'a1', pessoa_id: 'p1', total_horas: 3, transporte: true }),
        item({ solicitacao_id: 'a1', pessoa_id: 'p2', total_horas: 2 }),
        item({ solicitacao_id: 'a1', pessoa_id: 'p3', total_horas: 4 }),
        item({ solicitacao_id: 'a1', pessoa_id: null, registro: '77', total_horas: 1 }),
      ],
    }),
    ase({
      id: 'a2',
      itens: [item({ solicitacao_id: 'a2', pessoa_id: 'p1', total_horas: 5 })],
    }),
  ];

  it('acharLinhas resolve área/sub-setor pelo cadastro e cai em SEM_INFO sem pessoa_id', () => {
    const linhas = acharLinhas(lista, pessoasPorId);
    expect(linhas.find(l => l.registro === '77')).toMatchObject({ area: SEM_INFO, subsetor: SEM_INFO });
    expect(linhas.filter(l => l.area === 'Operação')).toHaveLength(3);
  });

  it('sem o mapa de pessoas tudo vira SEM_INFO', () => {
    const linhas = acharLinhas(lista);
    expect(linhas.every(l => l.area === SEM_INFO && l.subsetor === SEM_INFO)).toBe(true);
  });

  it('tabula horas por área e sub-setor com subtotal da área e SEM_INFO por último', () => {
    const tab = horasPorAreaSubsetor(acharLinhas(lista, pessoasPorId));
    // Operação: 3+5 (Montagem) + 2 (Solda) = 10 h; Qualidade: 4 h; SEM_INFO: 1 h.
    expect(tab.map(l => `${l.area}/${l.subsetor}`)).toEqual([
      'Operação/Montagem',
      'Operação/Solda',
      'Qualidade/Inspeção',
      `${SEM_INFO}/${SEM_INFO}`,
    ]);
    expect(tab[0]).toMatchObject({ horas: 8, colaboradores: 2, ases: 2, transportes: 1, horasArea: 10 });
    expect(tab[1]).toMatchObject({ horas: 2, colaboradores: 1, horasArea: 10 });
    expect(tab[2]).toMatchObject({ horas: 4, horasArea: 4 });
  });
});

describe('intervaloDoPreset', () => {
  const base = new Date(2026, 8, 15); // 15/09/2026

  it('últimos 7 dias inclui hoje', () => {
    expect(intervaloDoPreset('7dias', base)).toEqual({ de: '2026-09-09', ate: '2026-09-15' });
  });

  it('mês atual vai do primeiro ao último dia', () => {
    expect(intervaloDoPreset('mes_atual', base)).toEqual({ de: '2026-09-01', ate: '2026-09-30' });
  });

  it('mês passado fecha em agosto', () => {
    expect(intervaloDoPreset('mes_passado', base)).toEqual({ de: '2026-08-01', ate: '2026-08-31' });
  });

  it('tudo não impõe limites', () => {
    expect(intervaloDoPreset('tudo', base)).toEqual({ de: '', ate: '' });
  });
});

describe('descreverFiltro', () => {
  it('descreve período e recortes ativos', () => {
    const texto = descreverFiltro({
      ...filtroVazio(),
      de: '2026-09-01',
      ate: '2026-09-30',
      setores: new Set(['Produção']),
      status: new Set(['ENVIADO']),
      apenasTransporte: true,
    });
    expect(texto).toContain('Período: 01/09/2026 a 30/09/2026');
    expect(texto).toContain('Setores: Produção');
    expect(texto).toContain('Status: Enviado');
    expect(texto).toContain('transporte');
  });

  it('sem período informa histórico completo', () => {
    expect(descreverFiltro(filtroVazio())).toBe('Período: todo o histórico');
  });
});
