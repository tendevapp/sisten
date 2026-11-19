import { describe, expect, it } from 'vitest';
import { calcularPosicoes, prepararCasos, simularArquivoBaixas, type ItemSimulacao, type MovimentoSimulacao } from './simulacaoBaixas';
import type { LinhaDivergenciaDoc } from './requisicaoBalcaoAuditoria';

const item = (id: string, quantidade: number, destino = ''): ItemSimulacao => ({
  item_id: id, quantidade, unidade: 'UN', deposito: '0002', deposito_destino: destino,
  tipo_movimento: destino ? 'transferencia' : 'saida',
});
const itens = [item('a', 6, '0105'), item('b', 2)];
function par(itensDoPar = itens, coberto = 6): LinhaDivergenciaDoc {
  const total = itensDoPar.reduce((s, i) => s + i.quantidade, 0);
  return { doc: '4904070063', material: '1173283', qtd_rqbs: total, qtd_doc: coberto,
    situacao: coberto ? 'parcial' : 'fora_do_doc', falta: total - coberto, unidade: 'UN',
    rqbs: itensDoPar.map(i => ({ item_id: i.item_id, quantidade: i.quantidade })),
  } as LinhaDivergenciaDoc;
}
const movimentos: MovimentoSimulacao[] = ['0002', '0105'].map((deposito, i) => ({
  doc_material: '4904070063', material: '1173283', deposito, tipo_movimento: '311',
  qtd_um_registro: i ? 6 : -6, um_registro: 'UN',
}));
describe('simulação de baixas', () => {
  it('distingue documento inexistente de material ausente e soma linhas repetidas do arquivo', () => {
    const l = { linha: 40, codigo: 'RQB-301026-38', doc: '4904102226', material: '1047385', descricao: 'Arame',
      quantidade: 150, origem: '0001', destino: '0105', tipo: 'transferencia' as const };
    const l2 = { ...l, linha: 42, codigo: 'RQB-301026-48' };
    const ms = [{ ...movimentos[0], doc_material: l.doc, material: 'outro' }];
    const { casos, docsAusentes } = simularArquivoBaixas([l,l2,{ ...l, doc: '4904999999' }],ms,[],[{ material: l.material, umb: 'KG' }],[]);
    expect(docsAusentes).toEqual(['4904999999']);
    expect(casos).toHaveLength(1);
    expect(casos[0].linhasBaixas).toEqual([40,42]);
    expect(casos[0].parcelas).toEqual([{ origem: '0001', destino: '0105', quantidade: 300 }]);
  });
  it('distingue consumo pendente de transferência já atendida no mesmo documento', () => {
    const [c] = prepararCasos([par()], itens, movimentos);
    expect(c.parcelas).toEqual([{ origem: '0002', destino: '', quantidade: 2 }]);
  });
  it('exige contrapartida no destino e a unidade de registro compatível', () => {
    for (const ms of [movimentos.slice(0,1), movimentos.map(m => ({ ...m, um_registro: 'CX' }))]) {
      const [c] = prepararCasos([par()], itens, ms);
      expect(c.parcelas).toEqual([]);
      expect(c.revisar).toBeTruthy();
    }
  });
  it('consolida transferências no depósito, preserva saldo negativo e distingue saldo zero de ausente', () => {
    const ls = [item('a', 2, '0105')];
    const casos = prepararCasos([par(ls, 0), { ...par(ls, 0), doc: '2' }], ls, []);
    const estoque = [{ material: '1173283', deposito: '0002', umb: 'UN', quantidade: 0 }];
    const [origem,destino] = calcularPosicoes(casos, estoque);
    expect(origem.esperado).toBe(-4);
    expect(destino.entradas).toBe(4);
    expect(destino.esperado).toBeNull();
  });
});
