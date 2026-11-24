import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { janeiroParaPagamento, simularAtraso, validarCenario, type CenarioAtraso, type PartidaSimulacao } from './simulacaoAtraso';
import { montarPlanilhaSimulacao } from './exportSimulacaoAtraso';

const base = '2026-11-24';
const cenario: CenarioAtraso = {
  base, pagamento: '2027-01-15', multa: 2, juros: 3, fornecedor: '', vencimentoDe: '', vencimentoAte: '',
};
const partida: PartidaSimulacao = {
  id: 1, numero_documento: '00017', fornecedor: '001', razao_social_fornecedor: 'Empresa A',
  parcela: '01', referencia: 'NF-01', empresa: 'TEN', data_lancamento: '2026-08-10', vencimento_liquido: '2026-11-16',
  moeda_documento: 'BRL', montante_moeda_doc: -1000, doc_compensacao: '—', data_compensacao: null,
  tipo_documento: 'RE', tipo_documento_descricao: 'Fatura',
};

describe('simulação de encargos da FBL1N', () => {
  it('calcula 60 dias desde o vencimento e abate créditos sem encargos', () => {
    const { totais, fornecedores } = simularAtraso([partida, { ...partida, id: 2, montante_moeda_doc: 100 }], cenario);
    expect(totais).toEqual({ saldo: 90000, creditos: 10000, multa: 2000, juros: 6000, encargos: 8000, projetado: 98000 });
    expect(fornecedores[0].titulos.map(t => [t.dias, t.encargos])).toEqual([[60, 8000], [60, 0]]);
  });

  it('exclui partidas compensadas, a vencer e sem vencimento e sinaliza valores incompatíveis', () => {
    const linhas = [
      { ...partida, vencimento_liquido: base }, { ...partida, vencimento_liquido: '2026-12-01' },
      { ...partida, vencimento_liquido: null }, { ...partida, data_compensacao: base }, { ...partida, doc_compensacao: '123' },
      { ...partida, moeda_documento: 'USD' }, { ...partida, moeda_documento: null }, { ...partida, montante_moeda_doc: null },
    ];
    const r = simularAtraso(linhas, cenario);
    expect(r.fornecedores).toHaveLength(0);
    expect(r.foraDaBase).toBe(3);
  });

  it('mantém fornecedores homônimos separados e inclui anos anteriores, com recorte opcional', () => {
    const linhas = [partida, { ...partida, id: 2, fornecedor: '002', vencimento_liquido: '2025-12-01' }];
    const r = simularAtraso(linhas, cenario);
    expect(r.fornecedores.map(f => f.codigo)).toEqual(['002', '001']);
    expect(simularAtraso(linhas, { ...cenario, fornecedor: '001' }).fornecedores).toHaveLength(1);
    expect(simularAtraso(linhas, { ...cenario, vencimentoDe: '2025-12-01', vencimentoAte: '2025-12-01' }).fornecedores[0].codigo).toBe('002');
  });

  it('permite isenção e recalcula juros ao alterar o dia de janeiro', () => {
    expect(simularAtraso([partida], { ...cenario, multa: 0, juros: 0 }).totais.projetado).toBe(100000);
    expect(simularAtraso([partida], { ...cenario, pagamento: '2027-01-16' }).totais.juros).toBe(6100);
    expect(janeiroParaPagamento('2027-01-24').inicial).toBe('2027-01-24');
    expect(janeiroParaPagamento(base).inicial).toBe(cenario.pagamento);
    for (const patch of [{ pagamento: '2027-02-01' }, { pagamento: '' }, { juros: NaN }, { multa: -1 }, { vencimentoDe: base, vencimentoAte: '2025-01-01' }]) {
      expect(validarCenario({ ...cenario, ...patch })).toBeTruthy();
    }
  });

  it('exporta XLSX legível com premissas, códigos, parcelas e a mesma soma arredondada por partida', () => {
    const pequena = { ...partida, montante_moeda_doc: -0.25 };
    const r = simularAtraso([pequena, { ...pequena, id: 2 }], cenario);
    expect(r.totais.multa).toBe(2);
    const bytes = XLSX.write(montarPlanilhaSimulacao(cenario, r), { type: 'buffer', bookType: 'xlsx' });
    const wb = XLSX.read(bytes);
    expect(wb.SheetNames).toEqual(['Premissas', 'Fornecedores', 'Partidas']);
    expect(XLSX.utils.sheet_to_json(wb.Sheets.Fornecedores)[0]).toMatchObject({
      'Código SAP': '001', Partidas: 2, 'Multa (R$)': 0.02, 'Saldo projetado (R$)': r.totais.projetado / 100,
    });
    expect(XLSX.utils.sheet_to_json(wb.Sheets.Partidas)[0]).toMatchObject({ Documento: '00017', Parcela: '01', 'Dias em atraso': 60 });
  });
});
