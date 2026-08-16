import { describe, it, expect } from 'vitest';
import {
  MB51_COLUMNS,
  excelSerialToISO,
  parseMb51Number,
  generateMb51Key,
  mapMb51Row
} from './mb51';

describe('mb51 module', () => {
  it('contém todas as 26 colunas mapeadas', () => {
    expect(MB51_COLUMNS).toHaveLength(26);
    expect(MB51_COLUMNS.find(c => c.field === 'doc_material')?.header).toBe('Doc.material');
    expect(MB51_COLUMNS.find(c => c.field === 'material')?.header).toBe('Material');
    expect(MB51_COLUMNS.find(c => c.field === 'tipo_movimento')?.header).toBe('Tipo de movimento');
    expect(MB51_COLUMNS.find(c => c.field === 'qtd_um_registro')?.header).toBe('Qtd.  UM registro');
    expect(MB51_COLUMNS.find(c => c.field === 'montante_mi')?.header).toBe('Montante em MI');
  });

  describe('excelSerialToISO', () => {
    it('converte datas no formato brasileiro DD/MM/YYYY', () => {
      expect(excelSerialToISO('15/08/2026')).toBe('2026-08-15');
      expect(excelSerialToISO('01/01/2025')).toBe('2025-01-01');
      expect(excelSerialToISO('31/12/2024')).toBe('2024-12-31');
    });

    it('converte datas com ponto ou hífen', () => {
      expect(excelSerialToISO('15.08.2026')).toBe('2026-08-15');
      expect(excelSerialToISO('15-08-2026')).toBe('2026-08-15');
    });

    it('converte serial numérico do Excel', () => {
      // 46249 serial aprox para agosto/2026
      const iso = excelSerialToISO(46249);
      expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('retorna null para valores vazios ou inválidos', () => {
      expect(excelSerialToISO('')).toBeNull();
      expect(excelSerialToISO(null)).toBeNull();
      expect(excelSerialToISO(undefined)).toBeNull();
      expect(excelSerialToISO('invalido')).toBeNull();
    });
  });

  describe('parseMb51Number', () => {
    it('converte números com vírgula e ponto de milhar padrão BR', () => {
      expect(parseMb51Number('1.234,56')).toBe(1234.56);
      expect(parseMb51Number('0,00')).toBe(0);
      expect(parseMb51Number('1,000')).toBe(1);
    });

    it('trata valores negativos com sinal na frente ou no final', () => {
      expect(parseMb51Number('-1,000')).toBe(-1);
      expect(parseMb51Number('-5,27')).toBe(-5.27);
      expect(parseMb51Number('5,27-')).toBe(-5.27);
      expect(parseMb51Number('-5.26')).toBe(-5.26);
    });

    it('mantém números nativos válidos', () => {
      expect(parseMb51Number(123.45)).toBe(123.45);
      expect(parseMb51Number(-10)).toBe(-10);
    });

    it('retorna null para vazios ou nulos', () => {
      expect(parseMb51Number('')).toBeNull();
      expect(parseMb51Number(null)).toBeNull();
      expect(parseMb51Number(undefined)).toBeNull();
    });
  });

  describe('mapMb51Row com dados de exemplo reais', () => {
    const sampleHeaders = [
      'Centro', 'Depósito', 'Referência', 'Doc.material', 'Pedido', 'Item',
      'Material', 'Texto breve material', 'Qtd.  UM registro', 'Unid.medida básica',
      'Montante em MI', 'Moeda', 'Texto cabeçalho documento', 'Data de lançamento',
      'Tipo de movimento', 'Hora do registro', 'UM registro', 'Data do documento',
      'Data de entrada', 'Fornecedor', 'Razão social do fornecedor', 'Txt.tipo movimento',
      'Nome do usuário', 'Posição no depósito', 'Elemento PEP', 'Imobilizado'
    ];

    const mappedFields = [
      'centro', 'deposito', 'referencia', 'doc_material', 'pedido', 'item',
      'material', 'texto_breve_material', 'qtd_um_registro', 'unid_medida_basica',
      'montante_mi', 'moeda', 'texto_cabecalho_doc', 'data_lancamento',
      'tipo_movimento', 'hora_registro', 'um_registro', 'data_documento',
      'data_entrada', 'fornecedor', 'razao_social_fornecedor', 'txt_tipo_movimento',
      'nome_usuario', 'posicao_deposito', 'elemento_pep', 'imobilizado'
    ];

    it('mapeia corretamente a primeira linha de baixa de material com montante -5,27', () => {
      const row = [
        'TEN2', '0002', 'BAIXA MATERIAL', '4904035208', '', '0',
        '1020179', 'PROTETOR PLUG SI LJ COG REUT G', '-1,000', 'UN',
        '-5,27', 'BRL', 'BAIXA DIRETA', '15/08/2026',
        '221', '08:52:53', 'UN', '15/08/2026',
        '15/08/2026', '', 'TEN TORRES EÓLICAS NORDESTE', 'SM para projeto',
        'GMOURA', '', 'TEN001134003000', ''
      ];

      const { record } = mapMb51Row(sampleHeaders, mappedFields, row);

      expect(record.centro).toBe('TEN2');
      expect(record.deposito).toBe('0002');
      expect(record.referencia).toBe('BAIXA MATERIAL');
      expect(record.doc_material).toBe('4904035208');
      expect(record.item).toBe('0');
      expect(record.material).toBe('1020179');
      expect(record.texto_breve_material).toBe('PROTETOR PLUG SI LJ COG REUT G');
      expect(record.qtd_um_registro).toBe(-1);
      expect(record.unid_medida_basica).toBe('UN');
      expect(record.montante_mi).toBe(-5.27);
      expect(record.moeda).toBe('BRL');
      expect(record.texto_cabecalho_doc).toBe('BAIXA DIRETA');
      expect(record.data_lancamento).toBe('2026-08-15');
      expect(record.tipo_movimento).toBe('221');
      expect(record.hora_registro).toBe('08:52:53');
      expect(record.um_registro).toBe('UN');
      expect(record.data_documento).toBe('2026-08-15');
      expect(record.data_entrada).toBe('2026-08-15');
      expect(record.razao_social_fornecedor).toBe('TEN TORRES EÓLICAS NORDESTE');
      expect(record.txt_tipo_movimento).toBe('SM para projeto');
      expect(record.nome_usuario).toBe('GMOURA');
      expect(record.elemento_pep).toBe('TEN001134003000');
      expect(record.chave_unica).toBe('4904035208|0|2026-08-15|08:52:53|221|1020179|-1|-5.27|0002|TEN001134003000|BAIXA MATERIAL|1');
    });

    it('diferencia chaves únicas entre linhas com mesmo doc.material mas montantes diferentes', () => {
      const row1 = [
        'TEN2', '0002', 'BAIXA MATERIAL', '4904035208', '', '0',
        '1020179', 'PROTETOR PLUG SI LJ COG REUT G', '-1,000', 'UN',
        '-5,27', 'BRL', 'BAIXA DIRETA', '15/08/2026',
        '221', '08:52:53', 'UN', '15/08/2026',
        '15/08/2026', '', 'TEN TORRES EÓLICAS NORDESTE', 'SM para projeto',
        'GMOURA', '', 'TEN001134003000', ''
      ];

      const row2 = [
        'TEN2', '0002', 'BAIXA MATERIAL', '4904035208', '', '0',
        '1020179', 'PROTETOR PLUG SI LJ COG REUT G', '-1,000', 'UN',
        '-5,26', 'BRL', 'BAIXA DIRETA', '15/08/2026',
        '221', '08:52:53', 'UN', '15/08/2026',
        '15/08/2026', '', 'TEN TORRES EÓLICAS NORDESTE', 'SM para projeto',
        'GMOURA', '', 'TEN001134003000', ''
      ];

      const res1 = mapMb51Row(sampleHeaders, mappedFields, row1);
      const res2 = mapMb51Row(sampleHeaders, mappedFields, row2);

      expect(res1.record.chave_unica).not.toBe(res2.record.chave_unica);
      expect(res1.record.montante_mi).toBe(-5.27);
      expect(res2.record.montante_mi).toBe(-5.26);
    });

    it('atribui sufixos de ocorrência sequenciais para linhas 100% idênticas na mesma planilha', () => {
      const identicalRow = [
        'TEN2', '0002', 'BAIXA MATERIAL', '4904035208', '', '0',
        '1020179', 'PROTETOR PLUG SI LJ COG REUT G', '-1,000', 'UN',
        '-5,27', 'BRL', 'BAIXA DIRETA', '15/08/2026',
        '221', '08:52:53', 'UN', '15/08/2026',
        '15/08/2026', '', 'TEN TORRES EÓLICAS NORDESTE', 'SM para projeto',
        'GMOURA', '', 'TEN001134003000', ''
      ];

      const tracker = new Map<string, number>();
      const res1 = mapMb51Row(sampleHeaders, mappedFields, identicalRow, tracker);
      const res2 = mapMb51Row(sampleHeaders, mappedFields, identicalRow, tracker);
      const res3 = mapMb51Row(sampleHeaders, mappedFields, identicalRow, tracker);

      expect(res1.record.chave_unica.endsWith('|1')).toBe(true);
      expect(res2.record.chave_unica.endsWith('|2')).toBe(true);
      expect(res3.record.chave_unica.endsWith('|3')).toBe(true);
      expect(res1.record.chave_unica).not.toBe(res2.record.chave_unica);
      expect(res2.record.chave_unica).not.toBe(res3.record.chave_unica);
    });

    it('mapeia linha de transferência (311)', () => {
      const row3 = [
        'TEN2', '0105', 'TRANSFERENCIA', '4904035212', '', '0',
        '1027107', 'NIPLE DP A234 NPT SCH40 3/4"', '1,000', 'UN',
        '0,00', 'BRL', 'TRANS PARA 0105', '15/08/2026',
        '311', '09:34:02', 'UN', '15/08/2026',
        '15/08/2026', '', 'TEN TORRES EÓLICAS NORDESTE', 'TR transf.no centro',
        'GMOURA', '', '', ''
      ];

      const { record } = mapMb51Row(sampleHeaders, mappedFields, row3);

      expect(record.centro).toBe('TEN2');
      expect(record.deposito).toBe('0105');
      expect(record.referencia).toBe('TRANSFERENCIA');
      expect(record.doc_material).toBe('4904035212');
      expect(record.tipo_movimento).toBe('311');
      expect(record.qtd_um_registro).toBe(1);
      expect(record.montante_mi).toBe(0);
      expect(record.chave_unica).toBe('4904035212|0|2026-08-15|09:34:02|311|1027107|1|0|0105||TRANSFERENCIA|1');
    });
  });
});
