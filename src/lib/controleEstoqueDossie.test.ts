import { describe, expect, it } from 'vitest';
import type { ControleEstoqueItem } from '../types';
import { calcularFaixaDoItem } from './controleEstoque';
import {
  COLUNAS_DOSSIE,
  calcularAlertaZerado,
  calcularSituacaoChegada,
  criarWorkbookDossie,
  montarDossie,
} from './controleEstoqueDossie';

type Pedido = ControleEstoqueItem['pedidos'][number];
type Rm = ControleEstoqueItem['rms'][number];

const pedido = (numero: string, extra: Partial<Pedido> = {}): Pedido => ({
  ri: null, requisicao: null, pedido: numero, item: '10', data: '2026-09-05', remessa_prevista: null,
  data_migo: null, fornecedor: 'F', deposito: '0001', quantidade_pedida: 10, quantidade_fornecida: 0,
  quantidade_pendente: 10, valor_brl: 1, quantidade_recebida_mb51: null, ultima_data_recebimento: null,
  entregas: [],
  ...extra,
});

const rm = (requisicao: string, pedidoNumero: string | null, extra: Partial<Rm> = {}): Rm => ({
  ri: null, requisicao, item: '10', data: '2026-07-16', requisitante: 'JAMILLE', quantidade: 10,
  pedido: pedidoNumero, item_pedido: pedidoNumero ? '10' : null, deposito: '0001',
  ...extra,
});

const criarItem = (extra: Partial<ControleEstoqueItem>): ControleEstoqueItem => ({
  material: '1406776', centro: 'TEN2', descricao: 'ABAFADOR', umb: 'UN', saldo_total: 6, saldo_reposicao: 6,
  preco_medio_sap: 10, consumo_total: 13, dias_uteis: 150, lead_time_dias: 15, intervalo_compra_dias: 30,
  estoque_minimo_override: null, estoque_maximo_override: null, quantidade_por_torre: null,
  rms: [], pedidos: [], ...extra,
} as ControleEstoqueItem);

const analisar = (item: ControleEstoqueItem) => ({ item, faixa: calcularFaixaDoItem(item) });

describe('controleEstoqueDossie', () => {
  it('classifica a chegada em SIM, PARCIAL, NÃO e sem pedido', () => {
    expect(calcularSituacaoChegada(false, null, null)).toBe('SEM_PEDIDO');
    expect(calcularSituacaoChegada(true, 10, null)).toBe('NAO');
    expect(calcularSituacaoChegada(true, 10, 0)).toBe('NAO');
    expect(calcularSituacaoChegada(true, 10, 4)).toBe('PARCIAL');
    expect(calcularSituacaoChegada(true, 10, 10)).toBe('SIM');
    expect(calcularSituacaoChegada(true, 10, 12)).toBe('SIM');
  });

  it('gera uma linha por RM, ligando pedido e chegada', () => {
    const item = criarItem({
      rms: [rm('1200093372', '4100461906'), rm('1200093373', null)],
      pedidos: [pedido('4100461906', { quantidade_recebida_mb51: 10 })],
    });
    const linhas = montarDossie([analisar(item)], new Map([['1406776', 17]]));

    expect(linhas).toHaveLength(2);
    expect(linhas[0]).toMatchObject({
      rm: '1200093372', existeRm: true, pedido: '4100461906', dataPedido: '2026-09-05',
      situacao: 'SIM', quantidadeChegou: 10, primeiraDoMaterial: true, minimoSisten: 17, prSisten: 34,
    });
    expect(linhas[1]).toMatchObject({ rm: '1200093373', pedido: null, situacao: 'SEM_PEDIDO', primeiraDoMaterial: false });
  });

  it('mostra entrega parcial com lançamentos acumulados e estorno', () => {
    const item = criarItem({
      rms: [rm('1100320347', '4100446757', { item: '80', item_pedido: '80', quantidade: 552 })],
      pedidos: [pedido('4100446757', {
        item: '80', quantidade_pedida: 552, quantidade_fornecida: 480, quantidade_pendente: 72,
        quantidade_recebida_mb51: 480, ultima_data_recebimento: '2026-09-09',
        entregas: [
          { data: '2026-04-28', documento: '5001540208', quantidade: 96, tipo_movimento: '101' },
          { data: '2026-08-05', documento: '5001585193', quantidade: 96, tipo_movimento: '101' },
          { data: '2026-08-05', documento: '5001585207', quantidade: -96, tipo_movimento: '102' },
          { data: '2026-09-09', documento: '5001600649', quantidade: 384, tipo_movimento: '101' },
        ],
      })],
    });
    const [linha] = montarDossie([analisar(item)], new Map());

    expect(linha).toMatchObject({ situacao: 'PARCIAL', quantidadePedida: 552, quantidadeChegou: 480, aChegar: 72, ultimaEntrega: '2026-09-09' });
    expect(linha.entregas.map(e => e.acumulado)).toEqual([96, 192, 96, 480]);
    expect(linha.entregas.map(e => e.estorno)).toEqual([false, false, true, false]);
    expect(linha.resumo).toMatchObject({ rms: 1, pedidos: 1, solicitado: 552, pedido: 552, chegou: 480, aChegar: 72 });
  });

  it('usa o item do pedido da RM para não misturar itens do mesmo pedido', () => {
    const item = criarItem({
      rms: [rm('1', '4100000001', { item_pedido: '00020' })],
      pedidos: [
        pedido('4100000001', { item: '10', quantidade_pedida: 5 }),
        pedido('4100000001', { item: '20', quantidade_pedida: 7 }),
      ],
    });
    const linhas = montarDossie([analisar(item)], new Map());
    expect(linhas.find(l => l.existeRm)).toMatchObject({ pedido: '4100000001', itemPedido: '20', quantidadePedida: 7 });
    // O item 10 nenhuma RM aponta, mas está em aberto: entra como linha própria.
    expect(linhas.find(l => !l.existeRm)).toMatchObject({ itemPedido: '10', quantidadePedida: 5 });
  });

  it('repete a RM em uma linha por pedido que a atendeu, sem repetir o total do pedido', () => {
    const item = criarItem({
      rms: [
        rm('1', '4100000001', { quantidade: 30 }),
        rm('2', '4100000001', { quantidade: 10, item: '20' }),
      ],
      pedidos: [pedido('4100000001', { quantidade_pedida: 40, quantidade_recebida_mb51: 40 })],
    });
    const linhas = montarDossie([analisar(item)], new Map());

    expect(linhas).toHaveLength(2);
    expect(linhas.every(l => l.pedidoCompartilhado)).toBe(true);
    expect(linhas[0].resumo).toMatchObject({ rms: 2, pedidos: 1, solicitado: 40, pedido: 40, chegou: 40 });
  });

  it('marca RM atendida por mais de um pedido como repetida', () => {
    const item = criarItem({
      rms: [rm('1', null, { quantidade: 30 })],
      pedidos: [
        pedido('4100000001', { requisicao: '1', quantidade_pedida: 20 }),
        pedido('4100000002', { requisicao: '1', quantidade_pedida: 10 }),
      ],
    });
    const linhas = montarDossie([analisar(item)], new Map());
    expect(linhas.map(l => [l.pedido, l.rmRepetida])).toEqual([['4100000001', false], ['4100000002', true]]);
  });

  it('mantém o material sem RM em uma linha e deixa campos indisponíveis vazios', () => {
    const linhas = montarDossie([analisar(criarItem({}))], new Map());
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({
      rm: null, existeRm: false, pedido: null, situacao: 'SEM_PEDIDO', minimoSisten: null, prSisten: null,
    });
  });

  it('não inclui pedidos antigos já encerrados', () => {
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

  it('classifica a RM em aguardando pedido, em pedido ou já atendida', () => {
    const item = criarItem({
      rms: [rm('1', null), rm('2', '4100000002'), rm('3', '4100000003')],
      pedidos: [
        pedido('4100000002'),
        pedido('4100000003', { quantidade_pendente: 0, quantidade_recebida_mb51: 10 }),
      ],
    });
    const linhas = montarDossie([analisar(item)], new Map());
    expect(linhas.map(l => [l.rm, l.situacaoRm])).toEqual([['1', 'SEM_PEDIDO'], ['2', 'EM_PEDIDO'], ['3', 'ATENDIDA']]);
  });

  it('marca o pedido atrasado quando falta chegar e a remessa prevista passou', () => {
    const item = criarItem({
      pedidos: [
        pedido('4100000001', { remessa_prevista: '2026-09-05' }),
        pedido('4100000002', { remessa_prevista: '2026-10-20' }),
      ],
    });
    const linhas = montarDossie([analisar(item)], new Map(), '2026-10-07');
    expect(linhas.map(l => [l.pedido, l.pedidoAtrasado])).toEqual([['4100000001', true], ['4100000002', false]]);
  });

  describe('estoque zerado', () => {
    const zerado = (extra: Partial<ControleEstoqueItem>) => criarItem({
      saldo_total: 0, saldo_reposicao: 0, fora_zl0024: true, ultimo_movimento_geral: '2026-08-11', ...extra,
    });
    const alerta = (item: ControleEstoqueItem) => montarDossie([analisar(item)], new Map())[0].alertaZerado;

    it('com PO aberta, mesmo havendo RM sem pedido', () => {
      expect(alerta(zerado({ rms: [rm('1', null)], pedidos: [pedido('4100000001')] }))).toBe('ZERADO_COM_PO');
    });

    it('com RM aguardando pedido', () => {
      expect(alerta(zerado({ rms: [rm('1', null)] }))).toBe('ZERADO_COM_RM');
    });

    it('sem reposição quando a única RM já foi atendida por pedido encerrado', () => {
      const item = zerado({
        rms: [rm('1', '4100000001')],
        pedidos: [pedido('4100000001', { quantidade_pendente: 0, quantidade_recebida_mb51: 10 })],
      });
      const linhas = montarDossie([analisar(item)], new Map());
      expect(linhas.every(l => l.alertaZerado === 'ZERADO_SEM_REPOSICAO')).toBe(true);
      expect(linhas[0]).toMatchObject({ foraZl0024: true, ultimoMovimento: '2026-08-11', situacaoRm: 'ATENDIDA' });
    });

    it('fora das visões sem consumo (sem mínimo) ou com saldo', () => {
      expect(alerta(zerado({ consumo_total: 0 }))).toBeNull();
      expect(alerta(criarItem({}))).toBeNull();
    });

    it('usa o mínimo SISTEN quando a planilha não tem mínimo', () => {
      expect(calcularAlertaZerado({
        saldo: 0, temPedidoAberto: false, temRmSemPedido: false, teveMovimento: true, minimo: null, minimoSisten: 4,
      })).toBe('ZERADO_SEM_REPOSICAO');
      expect(calcularAlertaZerado({
        saldo: 0, temPedidoAberto: false, temRmSemPedido: false, teveMovimento: false, minimo: 4, minimoSisten: null,
      })).toBeNull();
    });
  });

  it('exporta o dossiê com os cabeçalhos, situação da chegada e código SAP como texto', () => {
    const item = criarItem({
      material: '000000001234567890',
      rms: [rm('1', '4100000001')],
      pedidos: [pedido('4100000001', { quantidade_recebida_mb51: 4, ultima_data_recebimento: '2026-09-09' })],
    });
    const planilha = criarWorkbookDossie(montarDossie([analisar(item)], new Map())).Sheets.Dossie;
    const coluna = (nome: string) => String.fromCharCode(65 + COLUNAS_DOSSIE.indexOf(nome as typeof COLUNAS_DOSSIE[number]));

    expect(planilha.A1.v).toBe(COLUNAS_DOSSIE[0]);
    expect(planilha.A2.v).toBe('000000001234567890');
    expect(planilha.A2.t).toBe('s');
    expect(planilha[`${coluna('Chegou?')}2`].v).toBe('PARCIAL');
    expect(planilha[`${coluna('Última Entrega')}2`].v).toBe('2026-09-09');
  });
});
