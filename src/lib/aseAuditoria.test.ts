import { describe, expect, it } from 'vitest';
import type { AseHoraExtraCompleta, AseHoraExtraItem } from '../types';
import {
  AUTOR_NAO_REGISTRADO, CABECALHO_ASES, CABECALHO_COLABORADORES, descreverFiltroListaAse,
  filtrarListaAse, idsUsuariosAuditoria, montarAuditoriaAse, type FiltroListaAse,
} from './aseAuditoria';

function item(over: Partial<AseHoraExtraItem> = {}): AseHoraExtraItem {
  return {
    id: 'i1',
    solicitacao_id: 's1',
    pessoa_id: null,
    registro: '1001',
    nome: 'Ana Souza',
    cargo: 'Soldadora',
    transporte: true,
    refeicao: false,
    hora_entrada: '18:00',
    hora_saida: '20:00',
    intervalo_minutos: 0,
    percentual_he: 60,
    total_horas: 2,
    observacao: null,
    created_at: '2026-09-01T12:00:00Z',
    ...over,
  };
}

function ase(over: Partial<AseHoraExtraCompleta> = {}): AseHoraExtraCompleta {
  return {
    id: 's1',
    codigo_formulario: 'FRM.RHU-0007',
    numero_protocolo: 'ASE-010926-SUPR-01',
    solicitante_id: 'u1',
    setor_id: null,
    turno_id: null,
    data_execucao: '2026-09-01',
    justificativa: null,
    status: 'RASCUNHO',
    created_at: '2026-09-01T12:00:00Z',
    updated_at: '2026-09-01T12:00:00Z',
    setor_nome: 'SUPRIMENTOS',
    turno_nome: '1º TURNO',
    solicitante_nome: 'Carlos',
    itens: [item()],
    ...over,
  };
}

const filtroBase: FiltroListaAse = { podeVerTodas: true, escopo: 'todas', status: 'TODOS', termo: '', userId: 'u1' };

describe('filtrarListaAse', () => {
  const lista = [
    ase(),
    ase({ id: 's2', numero_protocolo: 'ASE-020926-ALMOX-01', solicitante_id: 'u2', status: 'ENVIADO', data_execucao: '2026-09-02', itens: [item({ nome: 'Bruno Lima' })] }),
  ];

  it('restringe a "minhas" quando não pode ver todas', () => {
    expect(filtrarListaAse(lista, { ...filtroBase, podeVerTodas: false }).map(s => s.id)).toEqual(['s1']);
  });

  it('filtra por status e por colaborador na busca', () => {
    expect(filtrarListaAse(lista, { ...filtroBase, status: 'ENVIADO' }).map(s => s.id)).toEqual(['s2']);
    expect(filtrarListaAse(lista, { ...filtroBase, termo: 'bruno' }).map(s => s.id)).toEqual(['s2']);
    expect(filtrarListaAse(lista, { ...filtroBase, termo: '02/09/2026' }).map(s => s.id)).toEqual(['s2']);
  });
});

describe('montarAuditoriaAse', () => {
  const excluida = ase({
    excluido_em: '2026-09-03T10:00:00Z',
    excluido_por: 'u9',
    updated_at: '2026-09-02T10:00:00Z',
    itens: [
      item(),
      item({ id: 'i2', nome: 'Removida', total_horas: 5, excluido_em: '2026-09-02T09:00:00Z', excluido_por: 'u8' }),
    ],
  });
  const nomes = new Map([['u9', 'Admin Nove']]);
  const r = montarAuditoriaAse([excluida], nomes);

  it('uma linha por ASE, com situação, quem excluiu e totais só dos ativos', () => {
    const linha = r.ases[0];
    const col = (n: string) => linha[CABECALHO_ASES.indexOf(n)];
    expect(linha).toHaveLength(CABECALHO_ASES.length);
    expect(col('Status')).toBe('Rascunho');
    expect(col('Situação')).toBe('Excluída');
    expect(col('Criada por')).toBe('Carlos');
    expect(col('Excluída por')).toBe('Admin Nove');
    expect(col('Colaboradores ativos')).toBe(1);
    expect(col('Colaboradores removidos')).toBe(1);
    expect(col('Total horas (ativos)')).toBe(2);
  });

  it('inclui colaborador removido; id sem nome aparece cru', () => {
    expect(r.colaboradores).toHaveLength(2);
    const removido = r.colaboradores[1];
    const col = (n: string) => removido[CABECALHO_COLABORADORES.indexOf(n)];
    expect(col('Situação')).toBe('Removido');
    expect(col('Removido por')).toBe('u8');
  });

  it('eventos do mais recente ao mais antigo, alteração sem autor', () => {
    const tipos = r.eventos.map(e => e[2]);
    expect(tipos[0]).toBe('ASE excluída');
    expect(tipos).toContain('Última alteração da ASE');
    expect(tipos).toContain('Colaborador removido');
    expect(tipos[tipos.length - 1]).toMatch(/ASE criada|Colaborador incluído/);
    expect(r.eventos.find(e => e[2] === 'Última alteração da ASE')?.[3]).toBe(AUTOR_NAO_REGISTRADO);
    expect(r.totais).toEqual({ ases: 1, excluidas: 1, colaboradores: 2, removidos: 1 });
  });

  it('não gera evento de alteração quando updated_at ≈ created_at', () => {
    const r2 = montarAuditoriaAse([ase()], new Map());
    expect(r2.eventos.map(e => e[2])).not.toContain('Última alteração da ASE');
  });
});

describe('auxiliares', () => {
  it('idsUsuariosAuditoria junta excluido_por de ASE e itens sem repetir', () => {
    const s = ase({ excluido_por: 'u1', itens: [item({ excluido_por: 'u1' }), item({ excluido_por: 'u2' })] });
    expect(idsUsuariosAuditoria([s]).sort()).toEqual(['u1', 'u2']);
  });

  it('descreve filtros', () => {
    expect(descreverFiltroListaAse({ ...filtroBase, status: 'RASCUNHO', termo: ' ana ' }))
      .toBe('Escopo: todas as ASEs | Status: Rascunho | Busca: "ana"');
  });
});
