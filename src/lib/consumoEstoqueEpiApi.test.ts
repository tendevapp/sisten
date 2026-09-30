import { describe, expect, it } from 'vitest';
import { normalizarSaidaEstoque } from './consumoEstoqueEpiApi';
import { criarWorkbookSaidasEstoque, COLUNAS_ITENS_SAIDA } from './consumoEstoqueEpiExport';
import { analisarSaidas } from './consumoEstoqueEpi';

const linha = {
  id: 10, material: '1020040 ', texto_breve_material: 'OCULOS CONV', data_lancamento: '2026-09-26',
  tipo_movimento: '221', qtd_um_registro: '-1', montante_mi: '-3.17', doc_material: '4900000001',
  texto_cabecalho_doc: ' Baixa EPIs ', elemento_pep: 'TEN001134003000', nome_usuario: 'CFHSILVA',
};

describe('consumoEstoqueEpiApi', () => {
  it('normaliza a linha da MB51 (números em texto, finalidade padronizada)', () => {
    expect(normalizarSaidaEstoque(linha)).toMatchObject({
      id: '10', material: '1020040', data: '2026-09-26', tipo: '221', quantidade: -1, valor: -3.17,
      finalidade: 'BAIXA EPIS', pep: 'TEN001134003000', estorno: false,
    });
    expect(normalizarSaidaEstoque({ ...linha, tipo_movimento: '222', qtd_um_registro: '1' }).estorno).toBe(true);
    expect(normalizarSaidaEstoque({ ...linha, texto_cabecalho_doc: null }).finalidade).toBe('SEM DESCRIÇÃO');
  });

  it('exporta itens, movimentos e parâmetros com código SAP como texto', () => {
    const saida = normalizarSaidaEstoque({ ...linha, material: '000000001020040' });
    const janela = { inicio: '2026-09-01', fim: '2026-09-30' };
    const { porItem } = analisarSaidas([saida], [], janela);
    const workbook = criarWorkbookSaidasEstoque(porItem, [saida], { inicio: null, fim: null, finalidade: null, palavras: ['oculos'] }, janela, new Date('2026-09-30T15:00:00Z'));

    expect(workbook.SheetNames).toEqual(['Itens', 'Movimentos', 'Parametros']);
    expect(workbook.Sheets.Itens.A1.v).toBe(COLUNAS_ITENS_SAIDA[0]);
    expect(workbook.Sheets.Itens.A2.v).toBe('000000001020040');
    expect(workbook.Sheets.Itens.A2.t).toBe('s');
    expect(workbook.Sheets.Movimentos.B2.v).toBe('000000001020040');
    expect(workbook.Sheets.Parametros.B6.v).toBe('oculos');
  });
});
