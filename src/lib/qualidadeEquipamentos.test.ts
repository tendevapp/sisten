import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import origem from './__fixtures__/qualidadeEquipamentos.json';
import { avisosEquipamento, criarWorkbookEquipamentos, dataEquipamento, mapearPlanilhaEquipamentos, quantidadeEquipamento, saldoComprar, validarDadosEquipamento } from './qualidadeEquipamentos';
import type { EquipamentoQualidade } from './qualidadeEquipamentos';

function workbook() {
  const wb = XLSX.utils.book_new();
  Object.entries(origem).forEach(([nome, linhas]) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(linhas), nome));
  return wb;
}
describe('Lista de Equipamentos real — quatro controles independentes', () => {
  it('mapeia os 116 registros sem as linhas apenas numeradas do modelo', () => {
    const previa = mapearPlanilhaEquipamentos(workbook());
    expect(previa.abas.map(a => a.quantidade)).toEqual([73, 24, 9, 10]);
    expect(previa.linhas).toHaveLength(116);
    expect(previa.linhas[0].origem_linha).toBe(4);
    expect(previa.linhas.filter(l => l.dados.equipamento === 'Cabeçotes')).toHaveLength(38);
  });
  it('preserva estoque textual, patrimônio N/A, RM e repetições por especificação', () => {
    const linhas = mapearPlanilhaEquipamentos(workbook()).linhas;
    expect(linhas[1].dados.qtd_estoque).toBe('Estoque mínimo');
    expect(linhas[0].dados.patrimonio).toBe('N/A');
    expect(linhas.find(l => l.categoria === 'compras' && l.dados.equipamento === 'Rolamentos')?.dados.rm).toBe('1100337039');
    expect(linhas.filter(l => l.categoria === 'estoque' && l.dados.equipamento === 'Cabeçotes').map(l => l.origem_chave).length).toBe(30);
    expect(linhas[0].origem_dados['Qtd. a comprar']).toBe('6');
  });
  it('lê valor em cache de fórmula sem executar fórmulas nem instruções de células', () => {
    const wb = workbook();
    wb.Sheets['Estoque atual'].H4 = { t: 'n', f: 'MAX(G4-F4,0)', v: 6 };
    expect(mapearPlanilhaEquipamentos(wb).linhas[0].dados.qtd_comprar).toBe('6');
  });
  it('exporta e reimporta todas as colunas originais e os controles adicionais', () => {
    const linhas = mapearPlanilhaEquipamentos(workbook()).linhas;
    const registros = linhas.map((l, i) => ({ ...l, id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, codigo: `EQP-101126-${i + 1}`, arquivado: false, versao: 1, criado_em: '', atualizado_em: '', origem_arquivo: 'Lista de Equipamentos.xlsx', dados: { ...l.dados, prazo_acao: '2026-12-20', certificado: '=referência textual' } })) as EquipamentoQualidade[];
    const exportado = criarWorkbookEquipamentos(registros);
    // Testar os bytes do XLSX, inclusive textos começando com = (nunca fórmulas).
    const bytes = XLSX.write(exportado, { type: 'array', bookType: 'xlsx' });
    const previa = mapearPlanilhaEquipamentos(XLSX.read(bytes));
    const preenchidos = (d: Record<string, string>) => Object.fromEntries(Object.entries(d).filter(([, v]) => v !== ''));
    expect(previa.linhas.map(l => preenchidos(l.dados))).toEqual(registros.map(r => preenchidos(r.dados)));
    expect(exportado.Sheets['Estoque atual'].R2.f).toBeUndefined();
    expect(previa.linhas[0].origem_chave).toBe(`sisten:${registros[0].id}`);
  });
  it('recusa duplicação de Nº, cabeçalho faltante e dados de colunas desconhecidas', () => {
    const repetida = workbook(); repetida.Sheets['Estoque atual'].A5 = { t: 's', v: '1' };
    expect(() => mapearPlanilhaEquipamentos(repetida)).toThrow(/repetido/);
    const faltante = workbook(); faltante.Sheets['Estoque atual'].L3 = { t: 's', v: 'Observação alterada' };
    expect(() => mapearPlanilhaEquipamentos(faltante)).toThrow(/ausente/);
    const extra = workbook(); XLSX.utils.sheet_add_aoa(extra.Sheets['Estoque atual'], [['Dado novo'], ['Não perder']], { origin: 'Z3' });
    expect(() => mapearPlanilhaEquipamentos(extra)).toThrow(/não reconhecida/);
  });
  it('recusa linhas sem nome com dados e datas inválidas sem descartar silenciosamente', () => {
    const semNome = workbook(); semNome.Sheets['Estoque atual'].B4 = { t: 's', v: '' };
    expect(() => mapearPlanilhaEquipamentos(semNome)).toThrow(/Informe o equipamento/);
    const data = workbook(); data.Sheets['Compras solicitadas'].I4 = { t: 's', v: '31/02/2026' };
    expect(() => mapearPlanilhaEquipamentos(data)).toThrow(/data válida/);
  });
  it('interpreta datas nativas do Excel sem depender do formato regional da célula', () => {
    const wb = workbook();
    wb.Sheets['Compras solicitadas'].I4 = { t: 'n', v: 46336, z: 'm/d/yy' };
    expect(mapearPlanilhaEquipamentos(wb).linhas.find(l => l.categoria === 'compras')?.dados.previsao_entrega).toBe('2026-11-10');
  });
  it('usa o valor numérico da célula para não confundir decimais com milhares', () => {
    const wb = workbook();
    wb.Sheets['Estoque atual'].F4 = { t: 'n', v: 1.234, z: '0.000' };
    const dados = mapearPlanilhaEquipamentos(wb).linhas[0].dados;
    expect(quantidadeEquipamento(dados.qtd_estoque)).toBe(1.234);
    expect(quantidadeEquipamento('1.000')).toBe(1000);
  });
  it('recusa duas colunas com o mesmo campo em vez de sobrescrever dados', () => {
    const wb = workbook();
    XLSX.utils.sheet_add_aoa(wb.Sheets['Estoque atual'], [['Observações'], ['Outro valor']], { origin: 'M3' });
    expect(() => mapearPlanilhaEquipamentos(wb)).toThrow(/colunas duplicadas/);
  });
});
describe('avisos de gestão da qualidade', () => {
  it('não transforma quantidade textual ou vazia em saldo zero', () => {
    expect(quantidadeEquipamento('Estoque mínimo')).toBeNull();
    expect(quantidadeEquipamento('')).toBeNull();
    expect(quantidadeEquipamento('0')).toBe(0);
    expect(quantidadeEquipamento('2,5')).toBe(2.5);
    expect(saldoComprar({ qtd_estoque: 'Estoque mínimo', qtd_necessaria: '6' })).toBeNull();
    expect(saldoComprar({ qtd_estoque: '0', qtd_necessaria: '6' })).toBe(6);
  });
  it('aponta a divergência real YOKE sem mudar a situação do arquivo', () => {
    const l = mapearPlanilhaEquipamentos(workbook()).linhas[0];
    expect(avisosEquipamento({ ...l, arquivado: false }).map(a => a.texto)).toContain('Situação diverge do déficit de estoque');
    expect(l.dados.situacao).toBe('Atende à necessidade');
  });
  it('prazo de hoje não está vencido e respeita antecedência inclusive no limite', () => {
    const r = { categoria: 'compras' as const, arquivado: false, dados: { equipamento: 'Medidor', responsavel: 'A', rm: '123', situacao: 'Pedido emitido', previsao_entrega: '2026-11-10', prazo_acao: '2026-12-10', proxima_calibracao: '2026-12-11' } };
    expect(avisosEquipamento(r, '2026-11-10', 30)).toEqual([{ nivel: 'atencao', texto: 'Ação vence em 10/12/2026' }, { nivel: 'atencao', texto: 'Entrega vence hoje' }]);
    expect(avisosEquipamento({ ...r, dados: { ...r.dados, previsao_entrega: '2026-11-09' } }, '2026-11-10', 7).some(a => a.nivel === 'critico')).toBe(true);
  });
  it('não cobra entrega recebida, mas não presume calibração válida', () => {
    expect(avisosEquipamento({ categoria: 'compras', arquivado: false, dados: { situacao: 'Recebido', previsao_entrega: '2020-01-01', proxima_calibracao: '2020-01-01' } }, '2026-11-10').map(a => a.texto)).toEqual(['Calibração / verificação vencida em 01/01/2020']);
    expect(avisosEquipamento({ categoria: 'segregados', arquivado: true, dados: {} })).toEqual([]);
  });
  it('identifica segregação sem data, reprovação e necessidade de avaliar impacto', () => {
    const avisos = avisosEquipamento({ categoria: 'segregados', arquivado: false, dados: { situacao: 'Danificado', resultado_metrologico: 'Reprovado' } });
    expect(avisos.some(a => /Data da segregação/.test(a.texto))).toBe(true);
    expect(avisos.some(a => /impacto nas medições/.test(a.texto))).toBe(true);
  });
  it('valida datas no calendário sem conversão indevida de fuso', () => {
    expect(dataEquipamento('01/09/2026')).toBe('2026-09-01');
    expect(dataEquipamento('29/02/2024')).toBe('2024-02-29');
    expect(dataEquipamento('29/02/2026')).toBeNull();
    expect(dataEquipamento('2026-13-01')).toBeNull();
    expect(validarDadosEquipamento('estoque', { equipamento: 'YOKE', qtd_estoque: '-1' })).toHaveLength(1);
  });
});
