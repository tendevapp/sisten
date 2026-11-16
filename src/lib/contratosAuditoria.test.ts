import { describe, expect, it } from 'vitest';
import type { ContratoComDetalhes } from './contratos';
import {
  montarAuditoria, normalizarReferencia, codigoFornecedorContrato, periodicidadeContrato, somarMeses, mesesEntre, rotuloMes,
  type PartidaMiroRow, type PartidaSemPedidoRow, type PedidoAuditoria, type EntradaAuditoria,
} from './contratosAuditoria';

const HOJE = '2026-11-16';

function contrato(over: Partial<ContratoComDetalhes> = {}): ContratoComDetalhes {
  return {
    documento_compras: '5200020742',
    fornecedor: '1000080252 COMERC PARTICIPAÇÕES S.A',
    centro: 'TEN1', requisitante: '—', criado_por: '—', moeda: 'BRL', tipo: null,
    data_documento: null,
    inicio_validade: '2026-03-20',
    fim_validade: '2027-01-30',
    dias_para_vencer: 75,
    status_vigencia: 'Vencendo em breve',
    valor_solicitado: 600000,
    valor_efetivo: 600000,
    valor_pendente: 0,
    valor_liquido_pedido: 0,
    itens: [],
    detalhes: undefined,
    status_exibido: 'Ativo',
    tipo_exibido: null,
    ...over,
  };
}

function pedido(over: Partial<PedidoAuditoria> = {}): PedidoAuditoria {
  return {
    contrato: '5200020742', pedido: '4700453995', origem: 'ZL0132', valor: 600000, valor_fonte: 'ZL0132',
    valor_eliminado: 0, data_pedido: '2026-03-25', modificado_em: null, fornecedor_codigo: '1000080252',
    fornecedor_nome: 'COMERC', texto: 'Energia', ...over,
  };
}

let seq = 1;
function partida(over: Partial<PartidaMiroRow> = {}): PartidaMiroRow {
  const id = seq++;
  return {
    contrato: '5200020742', pedidos: '4700453995', doc_miro: `51057${id}`, ano_miro: '2026',
    numero_doc_contabil: `50500${id}`, referencia_miro: `NF${id}`, data_lancamento_miro: '2026-04-08',
    valor_miro_estimado: 1000, doc_pagamento_miro: null, data_pagamento_miro: null, fornecedor_miro: '1000080252',
    fbl_id: id, empresa: 'TEN', tipo_documento: 'RE', montante_moeda_doc: -1000, montante_irf: 0,
    referencia: `NF${id}`, data_documento: '2026-04-08', data_lancamento: '2026-04-08',
    vencimento_liquido: '2026-04-09', data_compensacao: '2026-04-09', doc_compensacao: '3100000935',
    bloqueio_pagamento: null, fornecedor: '1000080252', razao_social_fornecedor: 'COMERC', texto: null,
    estorno_com: null, anulada: false, ...over,
  };
}

function semPedido(over: Partial<PartidaSemPedidoRow> = {}): PartidaSemPedidoRow {
  const id = 1000 + seq++;
  return {
    contratos: '5200020742', fbl_id: id, empresa: 'TEN', numero_documento: `50509${id}`, tipo_documento: 'RE',
    montante_moeda_doc: -500, referencia: `X${id}`, data_documento: '2026-10-10', data_lancamento: '2026-10-10',
    vencimento_liquido: '2026-10-20', data_compensacao: null, doc_compensacao: null, bloqueio_pagamento: null,
    fornecedor: '1000080252', razao_social_fornecedor: 'COMERC', texto: null, estorno_com: null, anulada: false,
    ...over,
  };
}

function rodar(over: Partial<EntradaAuditoria> = {}) {
  return montarAuditoria({
    contratos: [contrato()], pedidos: [pedido()], partidas: [], semPedido: [], alteracoes: [],
    cobertura: { me3n_importado_em: null, zl0170_importado_em: null, zl0170_de: '2026-01-09', zl0170_ate: '2026-09-14',
      fbl1n_importado_em: null, fbl1n_de: '2026-01-02', fbl1n_ate: '2026-11-13', me2l_importado_em: null },
    hoje: HOJE,
    ...over,
  });
}

const regras = (r: ReturnType<typeof rodar>) => r.contratos[0].ocorrencias.map(o => o.regra);

describe('auxiliares', () => {
  it('normaliza a referência da NF', () => {
    expect(normalizarReferencia('000123-0')).toBe('1230');
    expect(normalizarReferencia(' nf 44988 ')).toBe('NF44988');
    expect(normalizarReferencia(null)).toBe('');
  });

  it('código do fornecedor: cadastro manda, senão o 1º token numérico da ME3N', () => {
    expect(codigoFornecedorContrato(contrato())).toBe('1000080252');
    expect(codigoFornecedorContrato(contrato({ detalhes: { documento_compras: 'x', codigo_fornecedor: '999' } }))).toBe('999');
    expect(codigoFornecedorContrato(contrato({ fornecedor: 'SEM CODIGO' }))).toBeNull();
  });
});

describe('totais', () => {
  it('soma lançado, pago e em aberto com o sinal da FBL1N invertido', () => {
    const r = rodar({
      partidas: [
        partida(),
        partida({ montante_moeda_doc: -2000, data_compensacao: null, doc_compensacao: null, vencimento_liquido: '2026-11-01' }),
      ],
    });
    const a = r.contratos[0];
    expect(a.lancado).toBe(3000);
    expect(a.pago).toBe(1000);
    expect(a.aberto).toBe(2000);
    expect(a.vencidoAberto).toBe(2000);
    expect(a.saldo).toBe(597000);
    expect(a.consumo).toBeCloseTo(0.005);
    expect(regras(r)).toContain('vencido_aberto');
  });

  it('partida anulada (estorno) aparece na lista, mas fica fora das somas', () => {
    const r = rodar({ partidas: [partida(), partida({ anulada: true })] });
    expect(r.contratos[0].lancamentos).toHaveLength(2);
    expect(r.contratos[0].lancado).toBe(1000);
    expect(r.contratos[0].pago).toBe(1000);
  });

  it('a mesma partida vinda de duas MIROs conta uma vez', () => {
    const p = partida();
    const r = rodar({ partidas: [p, { ...p, doc_miro: 'outra' }] });
    expect(r.contratos[0].lancado).toBe(1000);
  });

  it('MIRO sem partida na FBL1N entra pelo valor estimado', () => {
    const r = rodar({
      partidas: [partida({ fbl_id: null, montante_moeda_doc: null, valor_miro_estimado: 700, data_lancamento_miro: '2026-05-10' })],
    });
    const a = r.contratos[0];
    expect(a.lancado).toBe(700);
    expect(a.lancamentos[0].estimado).toBe(true);
    const o = a.ocorrencias.find(x => x.regra === 'miro_sem_fbl1n');
    expect(o?.severidade).toBe('alerta');
  });
});

describe('sem pedido', () => {
  it('atribui ao contrato quando o fornecedor tem um contrato só', () => {
    const r = rodar({ semPedido: [semPedido()] });
    const a = r.contratos[0];
    expect(a.lancadoFornecedor).toBe(500);
    expect(a.lancado).toBe(500);
    const o = a.ocorrencias.find(x => x.regra === 'sem_pedido');
    expect(o?.detalhe).toContain('14/09/2026');
  });

  it('fornecedor com dois contratos vai para não atribuídos', () => {
    const r = rodar({
      contratos: [contrato(), contrato({ documento_compras: '5200020999' })],
      semPedido: [semPedido({ contratos: '5200020742, 5200020999' })],
    });
    expect(r.contratos.every(c => c.lancado === 0)).toBe(true);
    expect(r.naoAtribuidos).toHaveLength(1);
  });

  it('ignora pagamento/compensação (KZ, ZP, AB)', () => {
    const r = rodar({ semPedido: [semPedido({ tipo_documento: 'ZP' })] });
    expect(r.contratos[0].lancado).toBe(0);
  });
});

describe('regras', () => {
  it('lançado acima do valor global é crítico', () => {
    const r = rodar({ partidas: [partida({ montante_moeda_doc: -700000 })] });
    expect(r.contratos[0].severidade).toBe('critico');
    expect(regras(r)).toContain('lancado_acima_contrato');
  });

  it('estouro que só aparece somando o vinculado pelo fornecedor é alerta', () => {
    const r = rodar({
      partidas: [partida({ montante_moeda_doc: -500000 })],
      semPedido: [semPedido({ montante_moeda_doc: -200000 })],
    });
    const o = r.contratos[0].ocorrencias.find(x => x.regra === 'lancado_acima_contrato');
    expect(o?.severidade).toBe('alerta');
    expect(o?.detalhe).toContain('confira');
  });

  it('consumo a partir de 80% é alerta', () => {
    const r = rodar({ partidas: [partida({ montante_moeda_doc: -500000 })] });
    expect(regras(r)).toContain('consumo_alto');
    expect(regras(r)).not.toContain('lancado_acima_contrato');
  });

  it('pedidos somando mais que o contrato', () => {
    const r = rodar({ pedidos: [pedido(), pedido({ pedido: '4100447669' })] });
    expect(regras(r)).toContain('pedidos_acima_contrato');
  });

  it('lançamento depois do fim da vigência é crítico', () => {
    const r = rodar({ partidas: [partida({ data_documento: '2027-02-10', data_lancamento: '2027-02-10' })] });
    const o = r.contratos[0].ocorrencias.find(x => x.regra === 'fora_vigencia');
    expect(o?.severidade).toBe('critico');
  });

  it('mesma NF e mesmo valor em dois documentos é crítico; parcelas KS não contam', () => {
    const r = rodar({
      partidas: [partida({ referencia: '37232-200' }), partida({ referencia: '37232200' })],
    });
    const o = r.contratos[0].ocorrencias.find(x => x.regra === 'nf_repetida');
    expect(o?.severidade).toBe('critico');
    expect(o?.documentos).toHaveLength(2);

    const parcelas = rodar({
      semPedido: [semPedido({ tipo_documento: 'KS', referencia: '2186-1' }), semPedido({ tipo_documento: 'KS', referencia: '2186-1' })],
    });
    expect(regras(parcelas)).not.toContain('nf_repetida');
  });

  it('fatura acima da parcela cadastrada', () => {
    const r = rodar({
      contratos: [contrato({ detalhes: { documento_compras: '5200020742', valor_parcela: 800 } })],
      partidas: [partida()],
    });
    expect(regras(r)).toContain('parcela_excedida');
  });

  it('MIRO paga na ZL0170 com partida em aberto na FBL1N', () => {
    const r = rodar({
      partidas: [partida({ doc_pagamento_miro: '3100000935', data_compensacao: null, doc_compensacao: null, vencimento_liquido: '2026-12-01' })],
    });
    expect(regras(r)).toContain('pagamento_divergente');
  });

  it('fornecedor da partida diferente do contrato', () => {
    const r = rodar({ partidas: [partida({ fornecedor: '1000000001', razao_social_fornecedor: 'OUTRO' })] });
    expect(regras(r)).toContain('fornecedor_divergente');
  });

  it('pago depois do vencimento é informativo', () => {
    const r = rodar({ partidas: [partida({ vencimento_liquido: '2026-04-01', data_compensacao: '2026-04-11' })] });
    const o = r.contratos[0].ocorrencias.find(x => x.regra === 'pago_com_atraso');
    expect(o?.severidade).toBe('info');
    expect(o?.detalhe).toContain('10 dias');
  });

  it('alteração de valor registrada no log', () => {
    const r = rodar({
      alteracoes: [{
        id: 1, documento_compras: '5200020742', item: '10', origem: 'ME3N', campo: 'valor_efetivo',
        valor_anterior: '500000', valor_novo: '600000', alterado_por: 'Ana', alterado_em: '2026-11-16T10:00:00Z',
      }],
    });
    expect(regras(r)).toContain('valor_alterado');
    expect(r.contratos[0].alteracoes).toHaveLength(1);
  });

  it('contrato vigente há mais de 60 dias sem lançamento', () => {
    const r = rodar();
    expect(regras(r)).toContain('sem_lancamento');
    expect(r.contratos[0].severidade).toBe('info');
  });

  it('ocorrências saem por severidade e, dentro dela, por categoria', () => {
    const r = rodar({
      partidas: [partida({ montante_moeda_doc: -700000, data_documento: '2027-02-10', data_lancamento: '2027-02-10' })],
    });
    const o = r.contratos[0].ocorrencias;
    expect(o[0].regra).toBe('lancado_acima_contrato');
    expect(o.findIndex(x => x.regra === 'fora_vigencia')).toBeGreaterThan(0);
  });

  it('contrato sem ocorrência fica ok', () => {
    const r = rodar({ contratos: [contrato({ inicio_validade: '2026-11-01' })] });
    expect(r.contratos[0].severidade).toBe('ok');
  });
});

describe('periodicidade e meses', () => {
  it('lê a modalidade livre do cadastro', () => {
    expect(periodicidadeContrato('Mensal')).toBe('mensal');
    expect(periodicidadeContrato('FIXO MENSAL')).toBe('mensal');
    expect(periodicidadeContrato('Mensalidade')).toBe('mensal');
    expect(periodicidadeContrato('12 Meses')).toBe('mensal');
    expect(periodicidadeContrato('Trimestral')).toBe('trimestral');
    expect(periodicidadeContrato('Anual')).toBe('anual');
    expect(periodicidadeContrato('Por Demanda')).toBe('demanda');
    expect(periodicidadeContrato(null)).toBe('demanda');
  });

  it('soma e conta meses atravessando o ano', () => {
    expect(somarMeses('2026-11', 3)).toBe('2027-02');
    expect(mesesEntre('2026-11', '2027-02')).toBe(3);
    expect(rotuloMes('2026-08')).toBe('ago/26');
  });
});

/**
 * Caso real: contrato 5200020796 (Rafael Oliveira Dourado), 12 × R$ 4.100.
 * Abr–jul faturado na parcela; de ago a nov a NF vem em R$ 6.150.
 */
describe('contrato mensal faturado acima da parcela', () => {
  const mensal = contrato({
    documento_compras: '5200020796', fornecedor: '1000073088 RAFAEL OLIVEIRA DOURADO',
    valor_efetivo: 49200, valor_solicitado: 49200, inicio_validade: '2026-02-27', fim_validade: '2027-02-27',
    detalhes: { documento_compras: '5200020796', valor_parcela: 4100, modalidade: 'Mensal' },
  });
  const fatura = (data: string, valor: number) => partida({
    contrato: '5200020796', fornecedor: '1000073088', montante_moeda_doc: -valor,
    data_documento: data, data_lancamento: data, vencimento_liquido: data, data_compensacao: data,
  });
  const avulsa = (data: string, valor: number, tipo = 'RE') => semPedido({
    contratos: '5200020796', fornecedor: '1000073088', tipo_documento: tipo, montante_moeda_doc: -valor,
    data_documento: data, data_lancamento: data, data_compensacao: data, doc_compensacao: '31',
  });
  const entrada = {
    contratos: [mensal],
    pedidos: [pedido({ contrato: '5200020796', valor: 49200 })],
    partidas: [
      fatura('2026-04-01', 4100), fatura('2026-05-04', 4100), fatura('2026-06-01', 4100), fatura('2026-07-01', 4100),
      fatura('2026-08-03', 6150), fatura('2026-09-03', 6150),
    ],
    semPedido: [avulsa('2026-10-01', 6150), avulsa('2026-10-19', 65, 'KR'), avulsa('2026-11-01', 6150)],
  };

  it('acusa o novo patamar como crítico, com o excedente', () => {
    const a = rodar(entrada).contratos[0];
    expect(a.periodicidade).toBe('mensal');
    expect(a.faturamentoMensal.map(m => m.acima)).toEqual([false, false, false, false, true, true, true, true]);
    const o = a.ocorrencias.find(x => x.regra === 'parcela_excedida');
    expect(o?.severidade).toBe('critico');
    expect(o?.detalhe).toContain('Desde ago/26');
    expect(o?.detalhe).toContain('4 meses seguidos');
    expect(o?.detalhe).toContain('+50%');
    expect(o?.valor).toBeCloseTo(8265);
    expect(a.severidade).toBe('critico');
  });

  it('projeta que o saldo não chega ao fim da vigência', () => {
    const a = rodar(entrada).contratos[0];
    expect(a.saldo).toBeCloseTo(8135);
    expect(a.projecao).toMatchObject({ ritmoMensal: 6150, ultimoMes: '2026-11', mesesRestantes: 3, esgotaEm: '2027-01' });
    const o = a.ocorrencias.find(x => x.regra === 'projecao_saldo');
    expect(o?.severidade).toBe('critico');
    expect(o?.valor).toBeCloseTo(10315);
    expect(o?.detalhe).toContain('saldo cobriria até o fim');
  });

  it('um mês só acima da parcela é alerta', () => {
    const a = rodar({ ...entrada, partidas: entrada.partidas.slice(0, 5), semPedido: [] }).contratos[0];
    const o = a.ocorrencias.find(x => x.regra === 'parcela_excedida');
    expect(o?.severidade).toBe('alerta');
    expect(o?.detalhe).toContain('ago/26 R$');
  });

  it('duas parcelas exatas no 1º mês são acúmulo, não excedente', () => {
    const a = rodar({ ...entrada, partidas: [fatura('2026-04-01', 8200), fatura('2026-05-01', 4100), fatura('2026-06-01', 4100)], semPedido: [] }).contratos[0];
    expect(a.faturamentoMensal[0]).toMatchObject({ acima: false, acumulado: 2 });
    expect(a.ocorrencias.some(x => x.regra === 'parcela_excedida')).toBe(false);
  });

  it('duas parcelas no mês seguinte a um mês faturado seguem como excedente', () => {
    const a = rodar({ ...entrada, partidas: [fatura('2026-04-01', 4100), fatura('2026-05-01', 8200), fatura('2026-06-01', 4100)], semPedido: [] }).contratos[0];
    const o = a.ocorrencias.find(x => x.regra === 'parcela_excedida');
    expect(o?.severidade).toBe('critico');
  });

  it('meses isolados com excedente pequeno ficam em alerta', () => {
    const a = rodar({
      ...entrada, semPedido: [],
      partidas: [fatura('2026-04-01', 5000), fatura('2026-05-01', 4100), fatura('2026-06-01', 4300), fatura('2026-07-01', 4100)],
    }).contratos[0];
    expect(a.ocorrencias.find(x => x.regra === 'parcela_excedida')?.severidade).toBe('alerta');
  });

  it('sem parcela cadastrada, o degrau no valor mensal vira alerta', () => {
    const semParcela = { ...mensal, detalhes: { documento_compras: '5200020796', modalidade: 'Mensal' } };
    const a = rodar({ ...entrada, contratos: [semParcela] }).contratos[0];
    expect(a.ocorrencias.some(x => x.regra === 'parcela_excedida')).toBe(false);
    const o = a.ocorrencias.find(x => x.regra === 'fatura_aumentou');
    expect(o?.severidade).toBe('alerta');
    expect(o?.detalhe).toMatch(/de R\$\s4\.100,00 para R\$\s6\.150,00/);
    expect(o?.detalhe).toContain('a partir de ago/26');
  });

  it('valor mensal que oscila não vira degrau', () => {
    const a = rodar({
      contratos: [{ ...mensal, detalhes: { documento_compras: '5200020796', modalidade: 'Mensal' } }],
      pedidos: [], semPedido: [],
      partidas: [fatura('2026-04-01', 3000), fatura('2026-05-01', 5000), fatura('2026-06-01', 3500), fatura('2026-07-01', 5200), fatura('2026-08-01', 5100)],
    }).contratos[0];
    expect(a.ocorrencias.some(x => x.regra === 'fatura_aumentou')).toBe(false);
  });

  it('sem fatura há mais de 2 meses não projeta', () => {
    const a = rodar({ ...entrada, partidas: entrada.partidas.slice(0, 4), semPedido: [] }).contratos[0];
    expect(a.projecao).toBeNull();
  });

  it('o mês do fim só conta quando a vigência vai até o dia 20', () => {
    const ate19 = { ...mensal, fim_validade: '2027-03-19' };
    const base = { ...entrada, partidas: entrada.partidas, semPedido: entrada.semPedido };
    expect(rodar({ ...base, contratos: [ate19] }).contratos[0].projecao?.mesesRestantes).toBe(3);
    const ate27 = { ...mensal, fim_validade: '2027-03-27' };
    expect(rodar({ ...base, contratos: [ate27] }).contratos[0].projecao?.mesesRestantes).toBe(4);
  });

  it('lançamento antes do início não consome o saldo projetado', () => {
    const naParcela = [4100, 4100, 4100, 4100, 4100, 4100, 4100, 4100]
      .map((v, i) => fatura(`2026-${String(i + 4).padStart(2, '0')}-01`, v));
    const a = rodar({ ...entrada, partidas: [fatura('2026-01-10', 7500), ...naParcela], semPedido: [] }).contratos[0];
    expect(a.saldo).toBeCloseTo(49200 - 7500 - 32800);
    expect(a.projecao?.saldo).toBeCloseTo(49200 - 32800);
    expect(a.ocorrencias.some(x => x.regra === 'projecao_saldo')).toBe(false);
    expect(a.ocorrencias.some(x => x.regra === 'fora_vigencia')).toBe(true);
  });

  it('contrato por demanda não projeta saldo', () => {
    const demanda = { ...mensal, detalhes: { documento_compras: '5200020796', valor_parcela: 4100, modalidade: 'Por Demanda' } };
    const a = rodar({ ...entrada, contratos: [demanda] }).contratos[0];
    expect(a.projecao).toBeNull();
    expect(a.ocorrencias.find(x => x.regra === 'parcela_excedida')?.severidade).toBe('alerta');
  });
});
