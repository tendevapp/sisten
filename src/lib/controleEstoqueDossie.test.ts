import { describe, expect, it } from 'vitest';
import type { ControleEstoqueItem } from '../types';
import { calcularFaixaDoItem } from './controleEstoque';
import { COLUNAS_DOSSIE, criarWorkbookDossie, montarDossie } from './controleEstoqueDossie';

const pedido = (numero: string, extra: Partial<ControleEstoqueItem['pedidos'][number]> = {}) => ({
  ri: null, requisicao: null, pedido: numero, item: '10', data: '2026-09-05', remessa_prevista: null,
  data_migo: null, fornecedor: 'F', deposito: '0001', quantidade_pedida: 10, quantidade_fornecida: 0,
  quantidade_pendente: 10, valor_brl: 1, quantidade_recebida_mb51: null, ultima_data_recebimento: null,
  ...extra,
});

const rm = (requisicao: string, pedidoNumero: string | null) => ({
  ri: null, requisicao, item: '10', data: '2026-07-16', requisitante: 'JAMILLE', quantidade: 10,
  pedido: pedidoNumero, deposito: '0001',
});

const criarItem = (extra: Partial<ControleEstoqueItem>): ControleEstoqueItem => ({
  material: '1406776', centro: 'TEN2', descricao: 'ABAFADOR', umb: 'UN', saldo_total: 6, saldo_reposicao: 6,
  preco_medio_sap: 10, consumo_total: 13, dias_uteis: 150, lead_time_dias: 15, intervalo_compra_dias: 30,
  estoque_minimo_override: null, estoque_maximo_override: null, quantidade_por_torre: null,
  rms: [], pedidos: [], ...extra,
} as ControleEstoqueItem);

const analisar = (item: ControleEstoqueItem) => ({ item, faixa: calcularFaixaDoItem(item) });

describe('controleEstoqueDossie', () => {
  it('gera uma linha por RM, ligando pedido e chegada', () => {
    const item = criarItem({
      rms: [rm('1200093372', '4100461906'), rm('1200093373', null)],
      pedidos: [pedido('4100461906', { quantidade_recebida_mb51: 6 })],
    });
    const linhas = montarDossie([analisar(item)], new Map([['1406776', 17]]));

    expect(linhas).toHaveLength(2);
    expect(linhas[0]).toMatchObject({
      rm: '1200093372', existeRm: true, pedido: '4100461906', dataPedido: '2026-09-05',
      chegou: true, quantidadeChegou: 6, primeiraDoMaterial: true, minimoSisten: 17, prSisten: 34,
    });
    expect(linhas[1]).toMatchObject({ rm: '1200093373', pedido: null, chegou: false, primeiraDoMaterial: false });
  });

  it('mantém o material sem RM em uma linha e deixa campos indisponíveis vazios', () => {
    const linhas = montarDossie([analisar(criarItem({}))], new Map());
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({
      rm: null, existeRm: false, pedido: null, chegou: false, minimoSisten: null, prSisten: null,
    });
  });

  it('inclui pedido em aberto sem RM, mas não pedidos antigos já encerrados', () => {
    const item = criarItem({
      rms: [rm('1', '4100000001')],
      pedidos: [
        pedido('4100000001'),
        pedido('4100000002'),
        pedido('4100000003', { quantidade_pendente: 0, quantidade_recebida_mb51: 10 }),
      ],
    });
    const linhas = montarDossie([analisar(item)], new Map());
    expect(linhas.map(l => l.pedido)).toEqual(['4100000001', '4100000002']);
    expect(linhas[1]).toMatchObject({ existeRm: false, rm: null });
  });

  it('exporta o dossiê com os cabeçalhos da planilha e código SAP como texto', () => {
    const item = criarItem({ material: '000000001234567890', rms: [rm('1', null)] });
    const workbook = criarWorkbookDossie(montarDossie([analisar(item)], new Map()));
    const planilha = workbook.Sheets.Dossie;
    expect(planilha.A1.v).toBe(COLUNAS_DOSSIE[0]);
    expect(planilha.A2.v).toBe('000000001234567890');
    expect(planilha.A2.t).toBe('s');
  });
});
