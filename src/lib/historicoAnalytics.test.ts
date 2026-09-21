import { describe, expect, it } from 'vitest';
import {
  calcRecorrencia,
  detectarAlertasAuditoria,
  normalizarDescricaoItem,
  serieTemporalRecorrencia,
  type RecorrenciaItem,
} from './historicoAnalytics';
import type { HistoricoPedidoView } from '../types';

function criarLinha(over: Partial<HistoricoPedidoView>): HistoricoPedidoView {
  return {
    material: 'M1',
    txt_breve: 'ITEM TESTE',
    grp_mercads: 'B01',
    grp_mercads_desc: 'EPI',
    tipo_item: 'Consumo',
    doc_compra: 'PO1',
    data_doc: '2026-01-01',
    qtd_pedido: 10,
    valor_liquido: 1000,
    fornecedor: 'FORNECEDOR A',
    area_solicitante: 'MANUTENCAO',
    ...over,
  };
}

describe('historicoAnalytics — normalizarDescricaoItem', () => {
  it('ignora acento, caixa e pontuação ao comparar descrições', () => {
    expect(normalizarDescricaoItem('BOTA DE SEGURANÇA Nº42')).toBe(
      normalizarDescricaoItem('bota de seguranca n 42')
    );
  });

  it('colapsa parênteses e espaços duplos', () => {
    expect(normalizarDescricaoItem('PARAFUSO M10X30 (ZINCADO)')).toBe('PARAFUSO M10X30 ZINCADO');
  });
});

describe('historicoAnalytics — calcRecorrencia', () => {
  it('agrupa por material exato e calcula pedidos distintos, áreas e fornecedores', () => {
    const linhas: HistoricoPedidoView[] = [
      criarLinha({ doc_compra: 'PO1', data_doc: '2026-01-01', valor_liquido: 1000, qtd_pedido: 10 }),
      criarLinha({ doc_compra: 'PO2', data_doc: '2026-01-05', valor_liquido: 500, qtd_pedido: 5 }),
      criarLinha({ doc_compra: 'PO3', data_doc: '2026-01-20', valor_liquido: 700, qtd_pedido: 7 }),
    ];

    const [item] = calcRecorrencia(linhas, 'material');
    expect(item.material).toBe('M1');
    expect(item.pedidosDistintos).toBe(3);
    expect(item.valor).toBe(2200);
    expect(item.qtdTotal).toBe(22);
    expect(item.areas).toEqual(['MANUTENCAO']);
    expect(item.fornecedores).toEqual(['FORNECEDOR A']);
    // Intervalos: 4 dias (01->05) e 15 dias (05->20) — média 9.5, menor 4.
    expect(item.menorIntervaloDias).toBe(4);
    expect(item.intervaloMedioDias).toBeCloseTo(9.5);
  });

  it('não calcula intervalo com uma única compra', () => {
    const [item] = calcRecorrencia([criarLinha({})], 'material');
    expect(item.pedidosDistintos).toBe(1);
    expect(item.intervaloMedioDias).toBeNull();
    expect(item.menorIntervaloDias).toBeNull();
  });

  it('agrupa itens similares (chave "similar") por grupo + descrição normalizada, mesmo com material e grafia diferentes', () => {
    const linhas: HistoricoPedidoView[] = [
      criarLinha({ material: 'M1', txt_breve: 'BOTA DE SEGURANÇA Nº42', doc_compra: 'PO1', data_doc: '2026-01-01' }),
      criarLinha({ material: 'M2', txt_breve: 'bota de seguranca n 42', doc_compra: 'PO2', data_doc: '2026-02-01' }),
    ];

    const resultado = calcRecorrencia(linhas, 'similar');
    expect(resultado).toHaveLength(1);
    expect(resultado[0].pedidosDistintos).toBe(2);
  });

  it('não agrupa itens similares de grupos de mercadoria diferentes', () => {
    const linhas: HistoricoPedidoView[] = [
      criarLinha({ material: 'M1', grp_mercads: 'B01', txt_breve: 'ITEM X', doc_compra: 'PO1' }),
      criarLinha({ material: 'M2', grp_mercads: 'B02', txt_breve: 'ITEM X', doc_compra: 'PO2' }),
    ];

    const resultado = calcRecorrencia(linhas, 'similar');
    expect(resultado).toHaveLength(2);
  });

  it('filtra itens com apenas 1 compra quando apenasRecorrentes é true', () => {
    const linhas: HistoricoPedidoView[] = [
      criarLinha({ material: 'M1', doc_compra: 'PO1', data_doc: '2026-01-01' }),
      criarLinha({ material: 'M1', doc_compra: 'PO2', data_doc: '2026-01-10' }),
      criarLinha({ material: 'M2', doc_compra: 'PO3', data_doc: '2026-01-15' }),
    ];

    const todos = calcRecorrencia(linhas, 'material', false);
    expect(todos).toHaveLength(2);

    const apenasRecorrentes = calcRecorrencia(linhas, 'material', true);
    expect(apenasRecorrentes).toHaveLength(1);
    expect(apenasRecorrentes[0].material).toBe('M1');
    expect(apenasRecorrentes[0].pedidosDistintos).toBe(2);
  });
});

describe('historicoAnalytics — serieTemporalRecorrencia', () => {
  const linhas: HistoricoPedidoView[] = [
    criarLinha({ doc_compra: 'PO1', data_doc: '2026-01-05', valor_liquido: 100, qtd_pedido: 1 }),
    criarLinha({ doc_compra: 'PO2', data_doc: '2026-01-20', valor_liquido: 200, qtd_pedido: 2 }),
    criarLinha({ doc_compra: 'PO3', data_doc: '2026-02-10', valor_liquido: 300, qtd_pedido: 3 }),
  ];

  it('agrupa por mês e preserva o total de valor', () => {
    const pontos = serieTemporalRecorrencia(linhas, 'mes');
    expect(pontos.map(p => p.periodo)).toEqual(['2026-01', '2026-02']);
    expect(pontos[0].valor).toBe(300);
    expect(pontos[0].pedidos).toBe(2);
    expect(pontos[1].valor).toBe(300);
  });

  it('agrupa por semana mantendo o total de valor e ordenação cronológica', () => {
    const pontos = serieTemporalRecorrencia(linhas, 'semana');
    const totalValor = pontos.reduce((s, p) => s + p.valor, 0);
    expect(totalValor).toBe(600);
    const periodos = pontos.map(p => p.periodo);
    expect(periodos).toEqual([...periodos].sort());
  });
});

describe('historicoAnalytics — detectarAlertasAuditoria', () => {
  const item = (over: Partial<RecorrenciaItem>): RecorrenciaItem => ({
    chave: 'M1',
    material: 'M1',
    descricao: 'ITEM TESTE',
    grupoDesc: 'EPI',
    tipoItem: 'Consumo',
    valor: 1000,
    qtdTotal: 10,
    pedidosDistintos: 1,
    areas: ['MANUTENCAO'],
    fornecedores: ['FORNECEDOR A'],
    datasCompra: ['2026-01-01'],
    intervaloMedioDias: null,
    menorIntervaloDias: null,
    itens: [criarLinha({})],
    ...over,
  });

  it('alerta "mais_repetido" com 4 ou mais pedidos distintos', () => {
    const alertas = detectarAlertasAuditoria([item({ pedidosDistintos: 4 })]);
    expect(alertas.some(a => a.tipo === 'mais_repetido')).toBe(true);
  });

  it('não alerta "mais_repetido" com menos de 4 pedidos', () => {
    const alertas = detectarAlertasAuditoria([item({ pedidosDistintos: 2 })]);
    expect(alertas.some(a => a.tipo === 'mais_repetido')).toBe(false);
  });

  it('alerta "intervalo_curto" quando duas compras ocorrem em menos de 7 dias', () => {
    const alertas = detectarAlertasAuditoria([
      item({ pedidosDistintos: 2, menorIntervaloDias: 3 }),
    ]);
    expect(alertas.some(a => a.tipo === 'intervalo_curto')).toBe(true);
  });

  it('não alerta "intervalo_curto" quando o menor intervalo é confortável', () => {
    const alertas = detectarAlertasAuditoria([
      item({ pedidosDistintos: 2, menorIntervaloDias: 30 }),
    ]);
    expect(alertas.some(a => a.tipo === 'intervalo_curto')).toBe(false);
  });

  it('alerta "aumento_anormal" quando a última compra é mais que o dobro da média anterior', () => {
    const linhas: HistoricoPedidoView[] = [
      criarLinha({ doc_compra: 'PO1', data_doc: '2026-01-01', valor_liquido: 100 }),
      criarLinha({ doc_compra: 'PO2', data_doc: '2026-01-10', valor_liquido: 100 }),
      criarLinha({ doc_compra: 'PO3', data_doc: '2026-01-20', valor_liquido: 500 }),
    ];
    const alertas = detectarAlertasAuditoria([item({ pedidosDistintos: 3, itens: linhas, valor: 700 })]);
    expect(alertas.some(a => a.tipo === 'aumento_anormal')).toBe(true);
  });

  it('não alerta "aumento_anormal" quando o valor se mantém estável', () => {
    const linhas: HistoricoPedidoView[] = [
      criarLinha({ doc_compra: 'PO1', data_doc: '2026-01-01', valor_liquido: 100 }),
      criarLinha({ doc_compra: 'PO2', data_doc: '2026-01-10', valor_liquido: 110 }),
      criarLinha({ doc_compra: 'PO3', data_doc: '2026-01-20', valor_liquido: 105 }),
    ];
    const alertas = detectarAlertasAuditoria([item({ pedidosDistintos: 3, itens: linhas, valor: 315 })]);
    expect(alertas.some(a => a.tipo === 'aumento_anormal')).toBe(false);
  });

  it('alerta "concentracao" com 3+ pedidos vindos da mesma área', () => {
    const alertas = detectarAlertasAuditoria([
      item({ pedidosDistintos: 3, areas: ['MANUTENCAO'], fornecedores: ['A', 'B', 'C'] }),
    ]);
    expect(alertas.some(a => a.tipo === 'concentracao')).toBe(true);
  });

  it('não alerta "concentracao" quando pedidos vêm de áreas e fornecedores variados', () => {
    const alertas = detectarAlertasAuditoria([
      item({ pedidosDistintos: 3, areas: ['A', 'B', 'C'], fornecedores: ['X', 'Y', 'Z'] }),
    ]);
    expect(alertas.some(a => a.tipo === 'concentracao')).toBe(false);
  });

  it('alerta "maior_valor" apenas para itens com 2 ou mais pedidos distintos', () => {
    const alertas = detectarAlertasAuditoria([
      item({ chave: 'M1', pedidosDistintos: 1, valor: 50000 }),
      item({ chave: 'M2', pedidosDistintos: 2, valor: 10000 }),
    ]);
    const maiorValor = alertas.filter(a => a.tipo === 'maior_valor');
    expect(maiorValor).toHaveLength(1);
    expect(maiorValor[0].item.chave).toBe('M2');
  });
});
