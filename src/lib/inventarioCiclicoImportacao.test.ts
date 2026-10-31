import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { COLUNAS_BASE_INVENTARIO, lerBaseLancamento } from './inventarioCiclicoImportacao';

const linha = [46321, '100000000000020542', 'Descrição', '4', '104.1', 7, '104.2', '07/2027', 5, 2, 'Divergência', 12.5, 5];
function arquivo(linhas: unknown[][], nome = 'Base lançamento', cab: readonly string[] = COLUNAS_BASE_INVENTARIO) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Outra aba']]), 'Ficha');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Indicador'], [1695], [...cab], ...linhas]), nome);
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
}
describe('Base Lançamento do inventário', () => {
  it('lê só a aba correta, após indicadores/cabeçalho, sem perder código longo ou recontagens', () => {
    const [r] = lerBaseLancamento(arquivo([linha]));
    expect(r).toMatchObject({ linha: 4, data: '2026-10-26', material: '100000000000020542', deposito: '0004' });
    expect(r.dados).toMatchObject({ 'Nº Contagem': 5, 'Data Validade': '07/2027', 'Diferença': 2 });
  });
  it('preserva duplicatas, linhas de origem e vazios sem fabricar quantidade ou validade', () => {
    const sem = [...linha]; sem[5] = null; sem[3] = ''; sem[7] = 2030;
    const r = lerBaseLancamento(arquivo([linha, [], sem, linha], ' Base Lançamento '));
    expect(r.map(l => l.linha)).toEqual([4, 6, 7]);
    expect(r[1]).toMatchObject({ deposito: '0000', dados: { 'Qtde Física': null, 'Depósito': null, 'Data Validade': '2030' } });
  });
  it('normaliza números brasileiros e aceita zero', () => {
    const br = [...linha]; br[5] = '1.234,50'; br[8] = 0;
    const [r] = lerBaseLancamento(arquivo([br]));
    expect(r.dados['Qtde Física']).toBe(1234.5);
    expect(r.dados['Stock UL (Dep)']).toBe(0);
  });
  it('valida todas as linhas antes de permitir qualquer carga', () => {
    expect(() => lerBaseLancamento(arquivo([linha], 'Outra'))).toThrow('aba Base');
    expect(() => lerBaseLancamento(arquivo([linha], undefined, COLUNAS_BASE_INVENTARIO.slice(1)))).toThrow('Cabeçalho');
    const invalida = [...linha]; invalida[0] = '31/02/2026';
    expect(() => lerBaseLancamento(arquivo([linha, invalida]))).toThrow('Linha 5');
    invalida[0] = 46321; invalida[5] = 'abc';
    expect(() => lerBaseLancamento(arquivo([invalida]))).toThrow('Qtde Física inválido');
    invalida[5] = -1;
    expect(() => lerBaseLancamento(arquivo([invalida]))).toThrow('negativa');
    expect(() => lerBaseLancamento(arquivo([]))).toThrow('não possui registros');
  });
});
