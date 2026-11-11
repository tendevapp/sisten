import { describe, expect, it } from 'vitest';
import {
  contarAuditoria, dentroDoPeriodo, filtrarAuditoria, resumirPorMaterial, type LinhaAuditoriaRqb,
} from './requisicaoBalcaoAuditoria';

const linha = (p: Partial<LinhaAuditoriaRqb>): LinhaAuditoriaRqb => ({
  requisicao_id: 'r1', codigo: 'RQB-300926-10', data_criacao: '2026-09-30', criado_em: '2026-09-30T12:00:00Z',
  status: 'exportada', exportacao_id: 'e1', exportada_em: '2026-10-01T17:11:00Z', data_exportacao: '2026-10-01',
  arquivo: 'x.xlsx', doc_sap: null, colaborador: 'TIAGO', tipo_movimento: 'saida', item_id: 'i1', ordem: 1,
  material: '1291809', descricao: 'BLUSAO SOLDA', unidade: 'UN', quantidade: 1, deposito: '0002', deposito_destino: null,
  pep: 'TEN001', item_doc_sap: null, mb51_status: 'faltando', mb51_coberto: 0, mb51_qtd_dia: 0, esperado_dia: 1,
  mb51_docs: null, outra_data: null, mb51_antes: null, mb51_ate: '2026-11-11', conferido_por: null,
  exportacoes_qtd: 1, exportacoes: null, reexportada_sem_reabrir: false, ...p,
});

describe('período', () => {
  it('compara a data da base escolhida; pela exportação, não exportada fica de fora', () => {
    const p = { base: 'exportacao' as const, de: '2026-10-01', ate: '2026-10-01' };
    expect(dentroDoPeriodo(p, '2026-09-30', '2026-10-01')).toBe(true);
    expect(dentroDoPeriodo(p, '2026-10-01', null)).toBe(false);
    expect(dentroDoPeriodo({ ...p, base: 'criacao' }, '2026-09-30', '2026-10-01')).toBe(false);
    expect(dentroDoPeriodo({ base: 'criacao', de: '', ate: '' }, null, null)).toBe(true);
  });
});

describe('auditoria RQB × MB51', () => {
  const linhas = [
    linha({}),
    linha({ item_id: 'i2', ordem: 2, material: '1352181', descricao: 'CALCA', mb51_status: 'ok', mb51_coberto: 1 }),
    linha({ requisicao_id: 'r2', codigo: 'RQB-111126-01', item_id: 'i3', status: 'nao_exportada', exportacao_id: null, data_exportacao: null, mb51_status: null, mb51_coberto: null, data_criacao: '2026-11-11' }),
    linha({ requisicao_id: 'r3', codigo: 'RQB-021026-05', item_id: 'i4', material: '1352181', quantidade: 2, mb51_status: 'parcial', mb51_coberto: 1 }),
  ];

  it('conta divergências só entre exportadas', () => {
    expect(contarAuditoria(linhas)).toMatchObject({ itens: 4, requisicoes: 3, exportados: 3, ok: 1, divergentes: 2, semExportar: 1 });
  });

  it('filtra por conferência e busca sem acento', () => {
    expect(filtrarAuditoria(linhas, { busca: '', status: 'todos', conferencia: 'divergentes' }).map((l) => l.item_id)).toEqual(['i1', 'i4']);
    expect(filtrarAuditoria(linhas, { busca: 'blusão 1291809', status: 'todos', conferencia: 'todas' })).toHaveLength(2);
    expect(filtrarAuditoria(linhas, { busca: '', status: 'nao_exportada', conferencia: 'todas' })).toHaveLength(1);
  });

  it('resume por material com a quantidade coberta pela MB51', () => {
    const r = resumirPorMaterial(linhas);
    const calca = r.find((m) => m.material === '1352181')!;
    expect(calca).toMatchObject({ requisicoes: 2, qtdTotal: 3, qtdExportada: 3, qtdNaMb51: 2, divergentes: 1 });
    const blusao = r.find((m) => m.material === '1291809')!;
    expect(blusao).toMatchObject({ qtdTotal: 2, qtdExportada: 1, qtdNaMb51: 0, qtdSemExportar: 1 });
  });
});
