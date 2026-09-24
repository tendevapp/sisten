import { describe, expect, it } from 'vitest';
import {
  BALCAO_COLUNAS, classificarImportacao, lerPlanilhaBalcaoConcluida, montarLinhasBalcao, nomeArquivoBalcao,
} from './requisicaoBalcaoPlanilha';

describe('lerPlanilhaBalcaoConcluida', () => {
  // Formato real devolvido: as colunas exportadas + "SAP" no fim.
  const cab = [...BALCAO_COLUNAS, 'SAP'];
  const linha = (obs: string, mat: number | string, sap: unknown, status = '') =>
    ['Saída', mat, 'CAMISA', 1, '0002', 'EPIs', 'TEN001201016503', 'SUPRIMENTOS', 'TEN2', status, obs, sap];

  it('lê o doc. SAP da coluna SAP, código da Observacao e material numérico', () => {
    const r = lerPlanilhaBalcaoConcluida([cab, linha('RQB-230926-01 - Teste', 1404580, 4904066308)]);
    expect(r.linhas).toEqual([{ codigo: 'RQB-230926-01', material: '1404580', docSap: '4904066308', status: '' }]);
    expect(r.colunaSap).toBe('SAP');
  });

  it('sem coluna chamada SAP, usa a última coluna com cabeçalho', () => {
    const r = lerPlanilhaBalcaoConcluida([[...BALCAO_COLUNAS, 'Documento'], linha('RQB-230926-02', '1', '123')]);
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
      Deposito: '0105',
      Descricao_Deposito: 'Transferência Produção',
      Elemento_PEP: 'TEN001101127004',
      Descricao_PEP: 'CUSTO LAVAGEM DE TRAMO',
      Receptor_Centro: 'TEN2',
      Status_Processamento: '',
      Observacao: 'RQB-230926-01 - urgente',
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

  it('nome do arquivo leva data e hora', () => {
    expect(nomeArquivoBalcao(new Date(2026, 8, 23, 14, 5))).toBe('requisicao_balcao_20260923_1405.xlsx');
  });
});
