import { describe, expect, it } from 'vitest';
import {
  conferirExportadasSemSap, documentosDaImportacao, contarAuditoria, dentroDoPeriodo, documentosDaPlanilha, filtrarAuditoria, filtrarDivergenciasDoc,
  resumirConferenciaImportacao, resumirPorMaterial, totalizarDivergenciasDoc,
  type LinhaAuditoriaRqb, type LinhaDivergenciaDoc,
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

const div = (p: Partial<LinhaDivergenciaDoc>): LinhaDivergenciaDoc => ({
  doc: '4904102226', doc_data: '2026-10-30', material: '1047385', descricao: 'ARAME SOLDA ER 70 S6 1,2MM', unidade: 'KG',
  tipo_movimento: 'transferencia', deposito: '0001', situacao: 'fora_do_doc', qtd_rqbs: 300, qtd_doc: 0, falta: 300,
  preco_medio: 8.52, valor_falta: 2555.87, lancado_como: null, avulsos: null, data_exportacao: '2026-10-30',
  rqbs: [
    { requisicao_id: 'r1', item_id: 'i1', codigo: 'RQB-301026-38', quantidade: 150, data_criacao: '2026-10-30', data_exportacao: '2026-10-30' },
    { requisicao_id: 'r2', item_id: 'i2', codigo: 'RQB-301026-48', quantidade: 150, data_criacao: '2026-10-30', data_exportacao: '2026-10-30' },
  ],
  mb51_ate: '2026-11-12', ...p,
});

describe('conferência por documento SAP', () => {
  const linhas = [
    div({}),
    div({
      doc: '4904075762', material: '1355907', descricao: 'LUVA SEG NBR', situacao: 'parcial', qtd_rqbs: 15, qtd_doc: 13, falta: 2,
      valor_falta: 33.05, avulsos: '4904077626 221 05/10 (1)', rqbs: [],
    }),
    div({ doc: '4904110434', material: '1355907', situacao: 'a_mais', qtd_rqbs: 1, qtd_doc: 8, falta: -7, valor_falta: 0, rqbs: [] }),
  ];

  it('soma as faltas sem contar o documento a mais', () => {
    const t = totalizarDivergenciasDoc(linhas);
    expect(t.faltas).toEqual({ pares: 2, linhasRqb: 2, valor: 2588.92 });
    expect(t.fora_do_doc.pares).toBe(1);
    expect(t.a_mais).toEqual({ pares: 1, linhasRqb: 0, valor: 0 });
  });

  it('filtra por situação, avulso e busca pelo código da RQB ou documento', () => {
    expect(filtrarDivergenciasDoc(linhas, { busca: '', situacao: 'faltas' })).toHaveLength(2);
    expect(filtrarDivergenciasDoc(linhas, { busca: '', situacao: 'faltas', semAvulso: true }).map((l) => l.doc)).toEqual(['4904102226']);
    expect(filtrarDivergenciasDoc(linhas, { busca: 'rqb-301026-48', situacao: 'todas' })).toHaveLength(1);
    expect(filtrarDivergenciasDoc(linhas, { busca: '4904110434', situacao: 'todas' })[0].situacao).toBe('a_mais');
  });
});

describe('importação da planilha × MB51', () => {
  it('lista os documentos distintos da planilha', () => {
    expect(documentosDaPlanilha([{ docSap: '4904102226' }, { docSap: ' 4904102226 ' }, { docSap: '' }, { docSap: '4904093793' }]))
      .toEqual(['4904093793', '4904102226']);
  });

  it('resume a conferência: ok, faltas com valor e requisições, pendentes', () => {
    const r = resumirConferenciaImportacao([
      div({}),
      div({ doc: '4904102226', material: '1371231', situacao: 'ok', falta: 0, valor_falta: 0, rqbs: [] }),
      div({ doc: '4904114654', material: '1355907', situacao: 'mb51_pendente', valor_falta: 0, rqbs: [] }),
      div({ doc: '4904110434', situacao: 'a_mais', falta: -7, valor_falta: 0, rqbs: [] }),
    ]);
    expect(r).toMatchObject({ pares: 4, ok: 1, faltas: 1, aMais: 1, pendentes: 1, valorFalta: 2555.87 });
    expect(r.requisicoesComFalta.map((q) => q.codigo)).toEqual(['RQB-301026-38', 'RQB-301026-48']);
  });

  it('totaliza com as situações da conferência sem quebrar', () => {
    const t = totalizarDivergenciasDoc([div({ situacao: 'ok', valor_falta: 0 }), div({ situacao: 'mb51_pendente', valor_falta: 0 })]);
    expect(t.ok.pares).toBe(1);
    expect(t.mb51_pendente.pares).toBe(1);
    expect(t.faltas.pares).toBe(0);
  });
});

describe('exportadas sem doc. SAP × MB51', () => {
  it('classifica pela situação dos itens sem doc. e junta os documentos que casaram', () => {
    const m = conferirExportadasSemSap([
      linha({ requisicao_id: 'a', item_id: 'a1', mb51_status: 'ok', mb51_docs: '4904074971, 4904074972' }),
      linha({ requisicao_id: 'a', item_id: 'a2', mb51_status: 'ok', mb51_docs: '4904074971' }),
      linha({ requisicao_id: 'b', item_id: 'b1', mb51_status: 'ok', mb51_docs: '4904110381' }),
      linha({ requisicao_id: 'b', item_id: 'b2', mb51_status: 'faltando' }),
      linha({ requisicao_id: 'c', item_id: 'c1', mb51_status: 'outra_data', outra_data: '14/10/2026: 40 (doc 4904086616, 4904086619)' }),
      linha({ requisicao_id: 'd', item_id: 'd1', mb51_status: 'faltando' }),
      linha({ requisicao_id: 'e', item_id: 'e1', mb51_status: 'mb51_pendente' }),
    ]);
    expect(m.get('a')).toEqual({ situacao: 'na_mb51', itens: 2, encontrados: 2, docs: ['4904074971', '4904074972'] });
    expect(m.get('b')?.situacao).toBe('em_parte');
    expect(m.get('c')).toMatchObject({ situacao: 'em_parte', encontrados: 0, docs: ['4904086616', '4904086619'] });
    expect(m.get('d')?.situacao).toBe('nao_encontrada');
    expect(m.get('e')?.situacao).toBe('mb51_pendente');
  });

  it('ignora item que já tem doc. SAP e requisição não exportada', () => {
    const m = conferirExportadasSemSap([
      linha({ requisicao_id: 'a', item_id: 'a1', item_doc_sap: '4904000001', mb51_status: 'ok' }),
      linha({ requisicao_id: 'a', item_id: 'a2', mb51_status: 'faltando' }),
      linha({ requisicao_id: 'n', exportacao_id: null, mb51_status: null }),
    ]);
    expect(m.get('a')).toMatchObject({ situacao: 'nao_encontrada', itens: 1 });
    expect(m.has('n')).toBe(false);
  });
});

describe('documentos de uma importação', () => {
  it('junta os gravados com os das linhas fora da gravação, só 10 dígitos, sem repetir', () => {
    expect(documentosDaImportacao({
      docs: ['4904116967', '4904117015'],
      detalhe: [{ doc_sap: '4904117015' }, { doc_sap: ' 4904117016 ' }, { doc_sap: '' }, { doc_sap: 'Concluído' }, { doc_sap: null }],
    })).toEqual(['4904116967', '4904117015', '4904117016']);
    expect(documentosDaImportacao({ docs: null, detalhe: null })).toEqual([]);
  });
});
