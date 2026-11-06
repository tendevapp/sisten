import { describe, expect, it } from 'vitest';
import {
  agruparPorFaixa, agruparPorFornecedor, diasAte, estaCompensada, faixaVencimento, hojeISO, ordenarFornecedores,
  passaAtalho, resumirAberto, rotuloRelativo, saldoAberto, somarDias, type PartidaPagar,
} from './contasPagar';

const HOJE = '2026-11-06';
let seq = 0;
function p(over: Partial<PartidaPagar>): PartidaPagar {
  seq++;
  return {
    id: seq, numero_documento: String(5100000000 + seq), empresa: 'TEN1', razao_social_fornecedor: 'WEG S.A.', fornecedor: '100231',
    data_lancamento: '2026-10-01', vencimento_liquido: '2026-11-20', montante_moeda_doc: -1000,
    doc_compensacao: null, data_compensacao: null, tipo_documento: 'KR', tipo_documento_descricao: 'Fatura fornecedor', ...over,
  };
}

describe('datas sem fuso', () => {
  it('soma dias atravessando mês e ano', () => {
    expect(somarDias('2026-11-28', 7)).toBe('2026-12-05');
    expect(somarDias('2026-12-30', 3)).toBe('2027-01-02');
    expect(somarDias('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('conta dias e escreve o rótulo relativo', () => {
    expect(diasAte('2026-11-06', HOJE)).toBe(0);
    expect(rotuloRelativo('2026-11-06', HOJE)).toBe('hoje');
    expect(rotuloRelativo('2026-11-07', HOJE)).toBe('amanhã');
    expect(rotuloRelativo('2026-11-05', HOJE)).toBe('ontem');
    expect(rotuloRelativo('2026-11-09', HOJE)).toBe('em 3 dias');
    expect(rotuloRelativo('2026-10-25', HOJE)).toBe('há 12 dias');
  });
  it('hoje é a data local, não a de UTC', () => {
    // 22h de 06/11 em UTC-3 já é 07/11 em UTC.
    expect(hojeISO(new Date(2026, 10, 6, 22, 30))).toBe('2026-11-06');
  });
});

describe('saldo com sinal', () => {
  it('nota de crédito em aberto abate o saldo, compensada não conta', () => {
    expect(saldoAberto(p({ montante_moeda_doc: -1000 }))).toBe(1000);
    expect(saldoAberto(p({ montante_moeda_doc: 300, tipo_documento: 'KG' }))).toBe(-300);
    expect(saldoAberto(p({ montante_moeda_doc: -1000, doc_compensacao: '1500000001' }))).toBe(0);
  });
  it('compensada pelo documento ou pela data; traço não conta', () => {
    expect(estaCompensada(p({ doc_compensacao: '—' }))).toBe(false);
    expect(estaCompensada(p({ doc_compensacao: ' ' }))).toBe(false);
    expect(estaCompensada(p({ data_compensacao: '2026-11-01' }))).toBe(true);
  });
});

describe('faixas e atalhos', () => {
  const vencida = p({ vencimento_liquido: '2026-11-01' });
  const hoje = p({ vencimento_liquido: HOJE });
  const em7 = p({ vencimento_liquido: '2026-11-13' });
  const em8 = p({ vencimento_liquido: '2026-11-14' });
  const paga = p({ vencimento_liquido: '2026-10-01', montante_moeda_doc: 500, doc_compensacao: '15' });
  const semVenc = p({ vencimento_liquido: null });

  it('classifica pelo vencimento', () => {
    expect(faixaVencimento(vencida, HOJE)).toBe('vencido');
    expect(faixaVencimento(hoje, HOJE)).toBe('hoje');
    expect(faixaVencimento(em7, HOJE)).toBe('7d');
    expect(faixaVencimento(em8, HOJE)).toBe('30d');
    expect(faixaVencimento(paga, HOJE)).toBe('compensado');
    expect(faixaVencimento(semVenc, HOJE)).toBe('sem_venc');
  });
  it('7 dias inclui hoje e o 7º dia, não o vencido', () => {
    expect([vencida, hoje, em7, em8].filter(l => passaAtalho(l, '7d', HOJE))).toEqual([hoje, em7]);
    expect(passaAtalho(vencida, 'vencidos', HOJE)).toBe(true);
    expect(passaAtalho(paga, 'aberto', HOJE)).toBe(false);
    expect(passaAtalho(paga, 'tudo', HOJE)).toBe(true);
  });
  it('agenda na ordem das faixas, compensados do mais recente', () => {
    const paga2 = p({ vencimento_liquido: '2026-10-20', montante_moeda_doc: 200, doc_compensacao: '16' });
    const grupos = agruparPorFaixa([em8, paga, vencida, hoje, paga2], HOJE);
    expect(grupos.map(g => g.faixa)).toEqual(['vencido', 'hoje', '30d', 'compensado']);
    expect(grupos[3].itens).toEqual([paga2, paga]);
    expect(grupos[3].total).toBe(700);
  });
});

describe('resumo e fornecedores fecham entre si', () => {
  const linhas = [
    p({ razao_social_fornecedor: 'A', vencimento_liquido: '2026-11-01', montante_moeda_doc: -1000 }),
    p({ razao_social_fornecedor: 'A', vencimento_liquido: '2026-11-08', montante_moeda_doc: -400 }),
    p({ razao_social_fornecedor: 'A', vencimento_liquido: '2026-11-08', montante_moeda_doc: 100, tipo_documento: 'KG' }),
    p({ razao_social_fornecedor: 'B', vencimento_liquido: '2026-12-30', montante_moeda_doc: -2000 }),
    p({ razao_social_fornecedor: 'B', vencimento_liquido: '2026-10-01', montante_moeda_doc: 900, doc_compensacao: '15' }),
    p({ razao_social_fornecedor: 'B', vencimento_liquido: '2026-10-01', montante_moeda_doc: -900, doc_compensacao: '15' }),
  ];

  it('resumo separa vencido, 7 dias e depois', () => {
    const r = resumirAberto(linhas, HOJE);
    expect(r).toMatchObject({ total: 3300, vencido: 1000, prox7: 300, depois: 2000, pago: 900, qtdAbertas: 4, qtdVencidas: 1, qtdPagas: 1 });
  });

  it('a soma dos fornecedores é o total do resumo', () => {
    const grupos = agruparPorFornecedor(linhas, HOJE);
    const a = grupos.find(g => g.nome === 'A')!;
    expect(a).toMatchObject({ saldoAberto: 1300, saldoVencido: 1000, qtdVencidos: 1, qtdAbertos: 3, proximoVencimento: '2026-11-08' });
    const b = grupos.find(g => g.nome === 'B')!;
    expect(b).toMatchObject({ saldoAberto: 2000, valorPago: 900, qtdCompensados: 2 });
    expect(grupos.reduce((s, g) => s + g.saldoAberto, 0)).toBe(resumirAberto(linhas, HOJE).total);
  });

  it('ordena por saldo em aberto por padrão e por nome quando pedido', () => {
    const grupos = agruparPorFornecedor(linhas, HOJE);
    expect(ordenarFornecedores(grupos, null).map(g => g.nome)).toEqual(['B', 'A']);
    expect(ordenarFornecedores(grupos, 'fornecedor', 'asc').map(g => g.nome)).toEqual(['A', 'B']);
    expect(ordenarFornecedores(grupos, 'vencidos', 'desc').map(g => g.nome)).toEqual(['A', 'B']);
  });
});
