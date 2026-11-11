import { describe, expect, it } from 'vitest';
import type { SolExtra } from './solicitacaoExtraApi';
import { intervaloPreset } from './relatorioSolExtra';
import {
  FILTRO_RELATORIO_VAZIO, classeEpiRetirada, detalharRetiradas, filtrarRelatorioRetiradas, resumirRetiradas,
  type FiltroRelatorioRetiradas,
} from './relatorioRetiradasSemSaldo';

const luva = { material: '1355905', descricao: 'Luva de segurança ultraflex - TAM. Nº 8', unidade: 'UN', quantidade: 1 };
const esmerilhadeira = { material: '1046700', descricao: 'Esmerilhadeira', unidade: 'UN', quantidade: 2 };

const retirada = (id: string, extra: Partial<SolExtra> = {}) => ({
  id, tipo: 'SEM_SALDO', data: '2026-11-10', hora: '08:00', codigo: `RSS-101126-${id}`, excluido_em: null,
  setor_solicitante_id: 'producao', setor_solicitante_nome: 'Produção', aprovacao_status: 'APROVADA', status: 'PENDENTE',
  regularizado_em: null, itens: [luva],
  ...extra,
} as SolExtra);

const materiais = new Map([['1355905', true], ['1046700', false]]);
const tudo: FiltroRelatorioRetiradas = { de: null, ate: null, ...FILTRO_RELATORIO_VAZIO };

describe('classificação de EPI da retirada', () => {
  it('mista conta com EPI; material sem cadastro conta como sem EPI', () => {
    expect(classeEpiRetirada(retirada('1'), materiais)).toBe('com');
    expect(classeEpiRetirada(retirada('2', { itens: [esmerilhadeira] }), materiais)).toBe('sem');
    expect(classeEpiRetirada(retirada('3', { itens: [esmerilhadeira, luva] }), materiais)).toBe('com');
    expect(classeEpiRetirada(retirada('4', { itens: [{ ...esmerilhadeira, material: 'novo' }] }), materiais)).toBe('sem');
    expect(classeEpiRetirada(retirada('7', { itens: [] }), materiais)).toBe('sem');
    expect(classeEpiRetirada(retirada('5', { itens: [], origem: 'ficha_epi' }), materiais)).toBe('com');
    expect(classeEpiRetirada(retirada('6', { itens: [{ ...esmerilhadeira, material: '0001046700' }] }), materiais)).toBe('sem');
  });
});

describe('filtro do relatório', () => {
  it('datas inclusivas e combina setor, aprovação, baixa e EPI; ignora excluídas e Projeto', () => {
    const dados = [
      retirada('1'),
      retirada('2', { data: '2026-11-09' }),
      retirada('3', { aprovacao_status: 'REPROVADA' }),
      retirada('4', { setor_solicitante_id: 'seguranca' }),
      retirada('5', { excluido_em: '2026-11-10' }),
      retirada('6', { tipo: 'PROJETO' }),
      retirada('7', { status: 'REGULARIZADA' }),
      retirada('8', { itens: [esmerilhadeira] }),
    ];
    const f = { ...tudo, de: '2026-11-10', ate: '2026-11-10', setor: 'producao', aprovacao: 'APROVADA' as const, baixa: 'PENDENTE' as const, epi: 'com' as const };
    expect(filtrarRelatorioRetiradas(dados, f, materiais).map(r => r.id)).toEqual(['1']);
    expect(filtrarRelatorioRetiradas(dados, { ...tudo, epi: 'sem' }, materiais).map(r => r.id)).toEqual(['8']);
    expect(filtrarRelatorioRetiradas(dados, tudo, materiais).map(r => r.id)).toEqual(['1', '2', '3', '4', '7', '8']);
  });

  it('aprovação nula conta como aguardando', () => {
    const dados = [retirada('1', { aprovacao_status: null })];
    expect(filtrarRelatorioRetiradas(dados, { ...tudo, aprovacao: 'PENDENTE' }, materiais)).toHaveLength(1);
  });
});

describe('resumo', () => {
  it('conta retiradas e situação por período e setor', () => {
    const dados = [
      retirada('1', { data: '2026-10-31', aprovacao_status: 'PENDENTE' }),
      retirada('2', { status: 'REGULARIZADA', regularizado_em: '2026-11-12T10:00:00-03:00' }),
      retirada('3', { setor_solicitante_id: 'seg', setor_solicitante_nome: 'Segurança', aprovacao_status: 'REPROVADA', itens: [luva, esmerilhadeira] }),
    ];
    const r = resumirRetiradas(dados, 'mes');
    expect(r.totais).toEqual({ retiradas: 3, itens: 4, aguardandoAprovacao: 1, aprovadas: 1, reprovadas: 1, aguardandoBaixa: 2, baixadas: 1 });
    expect(r.periodos.map(p => [p.chave, p.retiradas])).toEqual([['2026-10', 1], ['2026-11', 2]]);
    expect(r.setores.map(s => [s.rotulo, s.retiradas, s.reprovadas])).toEqual([['Produção', 2, 0], ['Segurança', 1, 1]]);
    expect(r.diasMedioAteBaixa).toBe(2);
  });

  it('material: soma quantidade por unidade e conta a retirada uma vez', () => {
    const dados = [
      retirada('1', { itens: [luva, { ...luva, quantidade: 3 }] }),
      retirada('2', { itens: [{ ...luva, material: '001355905' }] }),
      retirada('3', { itens: [{ ...luva, unidade: 'PAR', quantidade: 5 }] }),
    ];
    const [primeiro, segundo] = resumirRetiradas(dados, 'dia').materiais;
    expect(primeiro).toMatchObject({ material: '1355905', unidade: 'UN', retiradas: 2, quantidade: 5 });
    expect(segundo).toMatchObject({ unidade: 'PAR', retiradas: 1, quantidade: 5 });
  });

  it('semana ISO atravessa a virada do ano; vazio zera tudo', () => {
    const r = resumirRetiradas([retirada('1', { data: '2026-12-31' }), retirada('2', { data: '2027-01-03' }), retirada('3', { data: '2027-01-04' })], 'semana');
    expect(r.periodos.map(p => [p.chave, p.retiradas])).toEqual([['2026-12-28', 2], ['2027-01-04', 1]]);
    const vazio = resumirRetiradas([], 'mes');
    expect(vazio.totais.retiradas).toBe(0);
    expect(vazio.diasMedioAteBaixa).toBeNull();
  });
});

describe('detalhamento', () => {
  it('cada número abre exatamente as retiradas que contou, mais recentes primeiro', () => {
    const dados = [
      retirada('1', { data: '2026-12-31' }),
      retirada('2', { data: '2027-01-03', setor_solicitante_id: 'seg', setor_solicitante_nome: 'Segurança', aprovacao_status: 'PENDENTE' }),
      retirada('3', { data: '2027-01-04', status: 'REGULARIZADA' }),
    ];
    for (const agrupamento of ['dia', 'semana', 'mes'] as const) {
      const r = resumirRetiradas(dados, agrupamento);
      for (const g of r.periodos) {
        expect(detalharRetiradas(dados, { tipo: 'periodo', chave: g.chave, agrupamento })).toHaveLength(g.retiradas);
        expect(detalharRetiradas(dados, { tipo: 'periodo', chave: g.chave, agrupamento, situacao: 'baixadas' })).toHaveLength(g.baixadas);
      }
      for (const g of r.setores) {
        expect(detalharRetiradas(dados, { tipo: 'setor', chave: g.chave, situacao: 'aguardandoAprovacao' })).toHaveLength(g.aguardandoAprovacao);
      }
    }
    expect(detalharRetiradas(dados, { tipo: 'total' }).map(r => r.id)).toEqual(['3', '2', '1']);
    expect(detalharRetiradas(dados, { tipo: 'total', situacao: 'aguardandoBaixa' }).map(r => r.id)).toEqual(['2', '1']);
    const [mat] = resumirRetiradas(dados, 'mes').materiais;
    expect(detalharRetiradas(dados, { tipo: 'material', chave: mat.chave })).toHaveLength(mat.retiradas);
    expect(dados.map(r => r.id)).toEqual(['1', '2', '3']);
  });
});

describe('atalhos de período', () => {
  it('mês passado em janeiro volta para dezembro; 30 dias inclui hoje', () => {
    expect(intervaloPreset('mes_anterior', '2027-01-15')).toEqual({ de: '2026-12-01', ate: '2026-12-31' });
    expect(intervaloPreset('30d', '2026-11-10')).toEqual({ de: '2026-10-12', ate: '2026-11-10' });
    expect(intervaloPreset('tudo', '2026-11-10')).toEqual({ de: null, ate: null });
  });
});
