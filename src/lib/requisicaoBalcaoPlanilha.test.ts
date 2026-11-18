import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import {
  BALCAO_COLUNAS, classificarImportacao, gerarPlanilhaBalcao, lerArquivoBalcaoConcluido, lerPlanilhaBalcaoConcluida, montarLinhasBalcao, nomeArquivoBalcao,
} from './requisicaoBalcaoPlanilha';

it('preserva no XLSX arquivado a quantidade anterior a uma edição da requisição', async () => {
  const requisicao = {
    codigo: 'RQB-171126-08',
    tipo_movimento: 'transferencia' as const,
    deposito_origem: '0002',
    deposito_destino: '0105',
    aplicacao_pep: null,
    aplicacao: '',
    observacao: 'Lote original',
    itens: [{ material: '1322870', descricao: 'FILME STRETCH', quantidade: 2 }],
  };
  const original = gerarPlanilhaBalcao([requisicao]);
  requisicao.itens[0].quantidade = 7;
  requisicao.observacao = 'Editada';
  const editada = gerarPlanilhaBalcao([requisicao]);
  const lerLinha = async (blob: Blob) => {
    const wb = XLSX.read(await blob.arrayBuffer(), { type: 'array' });
    return XLSX.utils.sheet_to_json(wb.Sheets.Movimentacoes_SAP)[0];
  };
  expect(original.linhas).toBe(1);
  expect(await lerLinha(original.blob)).toMatchObject({ Quantidade: 2, Observacao: 'RQB-171126-08 - Lote original' });
  expect(await lerLinha(editada.blob)).toMatchObject({ Quantidade: 7, Observacao: 'RQB-171126-08 - Editada' });
});

describe('Baixas_SAP.xlsm', () => {
  const cabecalho = [...BALCAO_COLUNAS, 'Pronto?', 'Ano', 'Conferência SAP', 'Conferido em', 'Tempo\nconf. (s)', 'Mensagem do SAP'];
  // Linha real do arquivo fornecido, com cabeçalho na linha 4 da aba BAIXAS.
  const linha = ['Transferência', '1322870', 'FILME STRETCH PVC INC 500X100M', 2,
    '0002', 'EPIs + Consumíveis', '0105', 'Transferência Produção', '', '', 'TEN2',
    'Concluído', 'RQB-171126-35', '4904116967', 'OK', '2026', 'CONFIRMADO',
    46343.499502314815, 1,
    'MB03: documento 4904116967/2026 encontrado (consulta 1); 1 de 1 material(is) da planilha vistos nele'];
  const matriz = [ ['BAIXAS · cole a exportação'], ['Instruções'], ['EXPORTAÇÃO DO SISTEMA'], cabecalho, linha, [], Array(20).fill('') ];

  it('seleciona BAIXAS depois do PAINEL e lê o cabeçalho na linha 4 após salvar como XLSM', () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['PAINEL']]), 'PAINEL');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(matriz), 'BAIXAS');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Sim / Não']]), 'LISTAS');
    const leitura = lerArquivoBalcaoConcluido(XLSX.read(XLSX.write(wb, { type: 'buffer', bookType: 'xlsm' })));
    expect(leitura).toMatchObject({ totalLinhas: 1, colunaSap: 'SAP', exigeConferenciaSap: true, linhasBloqueadas: [] });
    expect(leitura.linhas[0]).toMatchObject({
      codigo: 'RQB-171126-35', material: '1322870', docSap: '4904116967', status: 'Concluído',
      conferenciaSap: { pronto: 'OK', ano: '2026', resultado: 'CONFIRMADO',
        conferidoEm: '17/11/2026 11:59:17', tempoSegundos: '1', mensagem: linha[19] },
    });
  });

  it.each(['', 'PENDENTE', 'NÃO ENCONTRADO', 'ERRO', 'NÃO CONFIRMADO'])('bloqueia %s mesmo com SAP e Concluído preenchidos', (resultado) => {
    const row = [...linha];
    row[16] = resultado;
    const leitura = lerPlanilhaBalcaoConcluida([cabecalho, row]);
    expect(leitura.linhas).toEqual([]);
    expect(leitura.linhasBloqueadas).toHaveLength(1);
    expect(leitura.linhasBloqueadas[0]).toMatchObject({ codigo: 'RQB-171126-35', docSap: '4904116967' });
    expect(leitura.linhasBloqueadas[0].motivo).toMatch(/MB03/);
  });

  it('bloqueia confirmação sem documento SAP', () => {
    const row = [...linha];
    row[13] = '';
    const leitura = lerPlanilhaBalcaoConcluida([cabecalho, row]);
    expect(leitura.linhas).toEqual([]);
    expect(leitura.linhasBloqueadas[0].motivo).toMatch(/documento SAP/);
    expect(leitura.semDocSap).toBe(1);
    expect(leitura.linhasSemDoc).toEqual([]); // Bloqueio registrado uma única vez no log.
  });

  it('separa confirmadas, bloqueadas e sem código em um mesmo lote', () => {
    const pendente = [...linha];
    pendente[16] = 'PENDENTE';
    const semCodigo = [...linha];
    semCodigo[12] = 'Sem requisição';
    const leitura = lerPlanilhaBalcaoConcluida([cabecalho, linha, pendente, semCodigo, [], Array(20).fill('')]);
    expect(leitura).toMatchObject({ totalLinhas: 3, semCodigo: 1 });
    expect(leitura.linhas).toHaveLength(1);
    expect(leitura.linhasBloqueadas).toHaveLength(1);
  });

  it('não interpreta Mensagem do SAP como documento quando a coluna SAP falta', () => {
    const cab = [...cabecalho];
    cab[13] = '';
    expect(() => lerPlanilhaBalcaoConcluida([cab, linha])).toThrow(/SAP/);
  });

  it('exige Conferência SAP na aba BAIXAS mesmo se as colunas de conferência forem removidas', () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[...BALCAO_COLUNAS], linha.slice(0, 14)]), 'BAIXAS');
    expect(() => lerArquivoBalcaoConcluido(wb)).toThrow(/Conferência SAP/);
  });

  it('mapeia por cabeçalho mesmo com colunas reordenadas e espaços ou acentos diferentes', () => {
    const ordem = [19, 16, 1, 13, 12, 11, 15, 17, 18, 14];
    const cab = ordem.map((i) => cabecalho[i].normalize('NFD').replace(/\p{M}/gu, '').toUpperCase());
    const row = ordem.map((i) => linha[i]);
    row[1] = ' confirmado ';
    expect(lerPlanilhaBalcaoConcluida([cab, row]).linhas[0]).toMatchObject({ codigo: 'RQB-171126-35', docSap: '4904116967' });
  });

  it('mantém a leitura do arquivo legado pela primeira aba', () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[...BALCAO_COLUNAS], linha.slice(0, 14)]), 'Movimentacoes_SAP');
    expect(lerArquivoBalcaoConcluido(wb).linhas[0]).toEqual({ codigo: 'RQB-171126-35', material: '1322870', docSap: '4904116967', status: 'Concluído' });
  });
});

describe('lerPlanilhaBalcaoConcluida', () => {
  // Formato real devolvido: as colunas exportadas + "SAP" no fim.
  const cab = [...BALCAO_COLUNAS];
  const linha = (obs: string, mat: number | string, sap: unknown, status = '') =>
    ['Saída', mat, 'CAMISA', 1, '0002', 'EPIs', '', '', 'TEN001201016503', 'SUPRIMENTOS', 'TEN2', status, obs, sap];

  it('lê o doc. SAP da coluna SAP, código da Observacao e material numérico', () => {
    const r = lerPlanilhaBalcaoConcluida([cab, linha('RQB-230926-01 - Teste', 1404580, 4904066308)]);
    expect(r.linhas).toEqual([{ codigo: 'RQB-230926-01', material: '1404580', docSap: '4904066308', status: '' }]);
    expect(r.colunaSap).toBe('SAP');
  });

  it('sem coluna chamada SAP, usa a última coluna com cabeçalho', () => {
    const cabecalhoDocumento: string[] = [...BALCAO_COLUNAS];
    cabecalhoDocumento[cabecalhoDocumento.indexOf('SAP')] = 'Documento';
    const r = lerPlanilhaBalcaoConcluida([cabecalhoDocumento, linha('RQB-230926-02', '1', '123')]);
    expect(r.linhas[0].docSap).toBe('123');
    expect(r.colunaSap).toBe('Documento');
  });

  it('conta linhas sem código e sem doc., ignora linha vazia', () => {
    const r = lerPlanilhaBalcaoConcluida([cab, linha('sem código', '1', '9'), linha('RQB-230926-03', '1', ''), [], ['', '']]);
    expect(r).toMatchObject({ totalLinhas: 2, semCodigo: 1, semDocSap: 1, linhas: [] });
  });

  it('recusa planilha de outro formato', () => {
    expect(() => lerPlanilhaBalcaoConcluida([['A', 'B']])).toThrow(/formato/);
  });
});

describe('classificarImportacao', () => {
  const reqs = [{ codigo: 'RQB-230926-01', itens: [{ material: '1', doc_sap: null }, { material: '2', doc_sap: '111' }] }];
  const l = (material: string, docSap: string) => ({ codigo: 'RQB-230926-01', material, docSap, status: '' });

  it('novo, igual, diferente e não encontrado', () => {
    const r = classificarImportacao([l('1', '999'), l('2', '111'), l('2', '222'), l('3', '1')], reqs);
    expect(r.map((x) => x.situacao)).toEqual(['novo', 'igual', 'diferente', 'nao_encontrado']);
    expect(r[2].docAtual).toBe('111');
  });
});

describe('montarLinhasBalcao', () => {
  const linhas = montarLinhasBalcao([
    {
      codigo: 'RQB-230926-01',
      tipo_movimento: 'transferencia',
      deposito_origem: '0105',
      deposito_destino: '0002',
      aplicacao_pep: 'TEN001101127004',
      aplicacao: 'CUSTO LAVAGEM DE TRAMO',
      observacao: 'urgente',
      itens: [
        { material: '1291134', descricao: 'DISCO FLAP', quantidade: 10 },
        { material: '1322950', descricao: 'DISCO CORTE', quantidade: 2.5 },
      ],
    },
    {
      codigo: 'RQB-230926-02',
      tipo_movimento: 'saida',
      deposito_origem: '0002',
      aplicacao_pep: 'TEN001114016001',
      aplicacao: 'FABRICAÇÃO DE MARCO PORTA',
      observacao: null,
      itens: [{ material: '1357300', descricao: 'MASCARA SOLDA', quantidade: 1 }],
    },
  ]);

  it('mantém a ordem de colunas do modelo Movimentacoes_SAP', () => {
    expect(BALCAO_COLUNAS).toEqual([
      'Tipo', 'Material', 'Texto breve', 'Quantidade',
      'Deposito_Origem', 'Descricao_Origem', 'Deposito_Destino', 'Descricao_Destino',
      'Elemento_PEP', 'Descricao_PEP', 'Receptor_Centro', 'Status_Processamento', 'Observacao', 'SAP',
    ]);
  });

  it('uma linha por item, colunas na ordem pedida', () => {
    expect(linhas).toHaveLength(3);
    expect(Object.keys(linhas[0])).toEqual([...BALCAO_COLUNAS]);
  });

  it('preenche tipo, depósito com descrição, PEP e centro', () => {
    expect(linhas[0]).toEqual({
      Tipo: 'Transferência',
      Material: '1291134',
      'Texto breve': 'DISCO FLAP',
      Quantidade: 10,
      Deposito_Origem: '0105',
      Descricao_Origem: 'Transferência Produção',
      Elemento_PEP: '',
      Descricao_PEP: '',
      Receptor_Centro: 'TEN2',
      Status_Processamento: 'Pendente',
      Observacao: 'RQB-230926-01 - urgente',
      Deposito_Destino: '0002',
      Descricao_Destino: 'EPIs + Consumíveis',
      SAP: '',
    });
    expect(linhas[2].Tipo).toBe('Saída');
    expect(linhas[2].Observacao).toBe('RQB-230926-02');
  });

  it('respeita aplicacao_pep e aplicacao individual de cada item quando houver múltiplos PEPs', () => {
    const multiPepLinhas = montarLinhasBalcao([
      {
        codigo: 'RQB-230926-03',
        tipo_movimento: 'saida',
        deposito_origem: '0002',
        aplicacao_pep: 'TEN001201016503',
        aplicacao: 'SUPRIMENTOS',
        observacao: null,
        itens: [
          { material: '1', descricao: 'ITEM PEP 1', quantidade: 1, aplicacao_pep: 'TEN001201016503', aplicacao: 'SUPRIMENTOS' },
          { material: '2', descricao: 'ITEM PEP 2', quantidade: 2, aplicacao_pep: 'TEN001101127004', aplicacao: 'LAVAGEM' },
        ],
      },
    ]);
    expect(multiPepLinhas).toHaveLength(2);
    expect(multiPepLinhas[0].Elemento_PEP).toBe('TEN001201016503');
    expect(multiPepLinhas[0].Descricao_PEP).toBe('SUPRIMENTOS');
    expect(multiPepLinhas[1].Elemento_PEP).toBe('TEN001101127004');
    expect(multiPepLinhas[1].Descricao_PEP).toBe('LAVAGEM');
  });

  it('uses the unified SAP movement columns', () => {
    expect(linhas[0]).toMatchObject({
      Deposito_Origem: '0105',
      Deposito_Destino: '0002',
      Descricao_Destino: 'EPIs + Consumíveis',
      Elemento_PEP: '',
      Descricao_PEP: '',
      Status_Processamento: 'Pendente',
      SAP: '',
    });
    expect(linhas[2]).toMatchObject({
      Deposito_Origem: '0002',
      Deposito_Destino: '',
      Elemento_PEP: 'TEN001114016001',
      Status_Processamento: 'Pendente',
      SAP: '',
    });
  });

  it('nome do arquivo leva data e hora', () => {
    expect(nomeArquivoBalcao(new Date(2026, 8, 23, 14, 5))).toBe('requisicao_balcao_20260923_1405.xlsx');
  });
});
