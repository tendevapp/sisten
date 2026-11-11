import { describe, expect, it } from 'vitest';
import {
  contarPorAcao, contarPorHora, filtrarImportacoes, filtrarLog, filtrarLotes, formatarIntervalo, intervaloDesdeAnterior,
  linhasDaImportacao,
} from './logRequisicaoBalcao';
import type { ImportacaoBalcao, LoteImportacaoBalcao, ReqBalcaoAlteracaoGeral } from './requisicaoBalcaoApi';

const ev = (p: Partial<ReqBalcaoAlteracaoGeral>): ReqBalcaoAlteracaoGeral => ({
  id: Math.random().toString(36),
  requisicao_id: 'r1',
  codigo: 'RQB-300926-10',
  acao: 'exportacao',
  alteracoes: [],
  resumo: null,
  alterado_por_nome: 'João Silva',
  created_at: '2026-10-01T17:11:00Z',
  ...p,
});

describe('log geral da Requisição no Balcão', () => {
  const log = [
    ev({ acao: 'exportacao', resumo: 'Planilha rqb_0110.xlsx' }),
    ev({ acao: 'reabertura', alterado_por_nome: 'Márcia Souza', resumo: 'Reaberta para nova exportação' }),
    ev({ codigo: 'RQB-011026-02', acao: 'edicao', alteracoes: [{ campo: 'Quantidade 1291809', de: '1', para: '2' }] }),
  ];

  it('busca todos os termos, sem acento e em qualquer ordem', () => {
    expect(filtrarLog(log, { busca: 'reabertura rqb-300926-10', acao: 'todas' })).toHaveLength(1);
    expect(filtrarLog(log, { busca: 'marcia', acao: 'todas' })).toHaveLength(1);
    expect(filtrarLog(log, { busca: '1291809', acao: 'todas' })[0].codigo).toBe('RQB-011026-02');
    expect(filtrarLog(log, { busca: '', acao: 'todas' })).toHaveLength(3);
  });

  it('filtra pela ação', () => {
    expect(filtrarLog(log, { busca: 'rqb', acao: 'exportacao' })).toHaveLength(1);
  });

  it('conta por ação e por hora', () => {
    expect(contarPorAcao(log)).toEqual({ exportacao: 1, reabertura: 1, edicao: 1 });
    const h = contarPorHora(log);
    expect(h).toHaveLength(24);
    expect(h.reduce((a, b) => a + b, 0)).toBe(3);
  });

  it('mede o tempo desde o evento anterior da mesma requisição', () => {
    const a = ev({ id: 'a', created_at: '2026-09-30T18:35:00Z' });
    const b = ev({ id: 'b', acao: 'reabertura', created_at: '2026-09-30T18:38:00Z' });
    const c = ev({ id: 'c', requisicao_id: 'r2', created_at: '2026-09-30T18:39:00Z' });
    const m = intervaloDesdeAnterior([b, c, a]);
    expect(m.get('b')).toBe(3 * 60000);
    expect(m.has('a')).toBe(false);
    expect(m.has('c')).toBe(false);
    expect(formatarIntervalo(3 * 60000)).toBe('3 min');
    expect(formatarIntervalo(125 * 60000)).toBe('2 h 05');
    expect(formatarIntervalo(3 * 86400000)).toBe('3 d');
  });
});

describe('importações da planilha concluída e lotes', () => {
  const imp = (p: Partial<ImportacaoBalcao>): ImportacaoBalcao => ({
    id: 'i1', arquivo: 'BAIXA ESTOQUE.xlsm', coluna_sap: 'SAP', importado_por_nome: 'Celso', created_at: '2026-10-02T13:23:00Z',
    total_linhas: 3, sem_codigo: 0, sem_doc_sap: 1, enviadas: 2, gravados: 1, iguais: 0, nao_encontrados: 1, requisicoes: 1,
    docs: ['4904075806'], lotes: ['requisicao_balcao_20261002_1010.xlsx'], reconstruida: false,
    detalhe: [
      { codigo: 'RQB-021026-01', material: '1291809', doc_sap: '4904075806', resultado: 'gravado', lote: 'requisicao_balcao_20261002_1010.xlsx' },
      { codigo: 'RQB-999999-01', material: '1', doc_sap: '1', resultado: 'nao_encontrado', motivo: 'RQB não encontrada' },
      { codigo: 'RQB-021026-02', material: '1352181', doc_sap: null, resultado: 'sem_doc' },
    ],
    ...p,
  });

  it('busca nas linhas da importação e devolve só as que casam', () => {
    const i = imp({});
    expect(linhasDaImportacao(i, '')).toHaveLength(3);
    expect(linhasDaImportacao(i, '1352181')).toHaveLength(1);
    expect(linhasDaImportacao(i, 'nao encontrado')).toHaveLength(1);
    expect(linhasDaImportacao(i, 'celso')).toHaveLength(3);
    expect(filtrarImportacoes([i, imp({ id: 'i2', detalhe: [], docs: [], lotes: [] })], 'rqb-021026-01')).toHaveLength(1);
  });

  it('filtra lotes pendentes e pela busca', () => {
    const lote = (p: Partial<LoteImportacaoBalcao>): LoteImportacaoBalcao => ({
      exportacao_id: 'e', arquivo: 'requisicao_balcao_20261001_1411.xlsx', exportada_em: '', data_exportacao: '2026-10-01',
      exportado_por: 'Celso', total_requisicoes: 70, total_itens: 94, requisicoes_vigentes: 70, itens_vigentes: 94,
      itens_com_doc: 0, itens_sem_doc: 94, docs_lote: null, importacoes: 0, ultima_importacao_em: null,
      pendentes: [{ requisicao_id: 'r', codigo: 'RQB-300926-10', tipo: 'saida', ordem: 1, material: '1291809', descricao: 'BLUSÃO', quantidade: 1, unidade: 'UN', deposito: '0002' }],
      mb51_sem_vinculo: [{ doc: '4904074972', tipo: '311', data: '2026-10-01', linhas: 84, materiais_pendentes: 30 }],
      ...p,
    });
    const lotes = [lote({}), lote({ exportacao_id: 'f', arquivo: 'x.xlsx', itens_sem_doc: 0, pendentes: [], mb51_sem_vinculo: [] })];
    expect(filtrarLotes(lotes, { busca: '', soPendentes: true })).toHaveLength(1);
    expect(filtrarLotes(lotes, { busca: '', soPendentes: false })).toHaveLength(2);
    expect(filtrarLotes(lotes, { busca: '4904074972', soPendentes: false })).toHaveLength(1);
    expect(filtrarLotes(lotes, { busca: 'blusao', soPendentes: false })[0].arquivo).toContain('1411');
  });
});
