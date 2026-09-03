import { describe, it, expect } from 'vitest';
import {
  normalizeHeader,
  parseBahiaSulDate,
  parseBahiaSulNumber,
  parseBahiaSulInt,
  generateBahiaSulKey,
  parseBahiaSulRows,
  enriquecerEntregasComPedidos,
  calcularKpisBahiaSul,
} from './bahiasul';

describe('bahiasul parsing utilities', () => {
  it('normaliza cabeçalhos removendo acentos e caracteres especiais', () => {
    expect(normalizeHeader('CTO_DOCUMENTO')).toBe('cto_documento');
    expect(normalizeHeader('Nº do Pedido')).toBe('n_do_pedido');
    expect(normalizeHeader('Previsão Entrega')).toBe('previsao_entrega');
    expect(normalizeHeader('  KGS REAL  ')).toBe('kgs_real');
  });

  it('converte datas em formato brasileiro para ISO YYYY-MM-DD', () => {
    expect(parseBahiaSulDate('28/08/2026')).toBe('2026-08-28');
    expect(parseBahiaSulDate('06/08/2026')).toBe('2026-08-06');
    expect(parseBahiaSulDate('14/08/2026')).toBe('2026-08-14');
    expect(parseBahiaSulDate('')).toBeNull();
    expect(parseBahiaSulDate(null)).toBeNull();
  });

  it('converte números com padrão brasileiro (vírgula e ponto)', () => {
    expect(parseBahiaSulNumber('36,846')).toBe(36.846);
    expect(parseBahiaSulNumber('40,534')).toBe(40.534);
    expect(parseBahiaSulNumber('16298,23')).toBe(16298.23);
    expect(parseBahiaSulNumber('1.142,69')).toBe(1142.69);
    expect(parseBahiaSulNumber('1142,69')).toBe(1142.69);
    expect(parseBahiaSulNumber('15070')).toBe(15070);
    expect(parseBahiaSulNumber(235.33)).toBe(235.33);
    expect(parseBahiaSulNumber('')).toBeNull();
  });

  it('converte inteiros para volumes', () => {
    expect(parseBahiaSulInt('4')).toBe(4);
    expect(parseBahiaSulInt(1)).toBe(1);
    expect(parseBahiaSulInt('')).toBeNull();
  });

  it('gera chave única de desduplicação correta', () => {
    expect(generateBahiaSulKey('BHZ', '1', '42383')).toBe('BHZ_1_42383');
    expect(generateBahiaSulKey('mtz ', '1', '31817')).toBe('MTZ_1_31817');
  });

  it('processa linhas de exemplo reais da planilha Bahia Sul com perfeição', () => {
    const headers = [
      'CTO_DOCUMENTO', 'CTO_FILIAL', 'CTO_SERIE', 'CTO_NUMERO', 'TPO_EMBARQUE',
      'RMT_NOME', 'RMT_CNPJ', 'DST_NOME', 'DST_CNPJ', 'EMISSAO',
      'REFERENCIA', 'PRZ_CONTRATADO', 'EMBARQUE', 'PRV_CHEGADA', 'CHEGADA',
      'PRV_ENTREGA', 'ENTREGA', 'SITUACAO', 'ORG_CIDADE', 'DST_CIDADE',
      'NFS_EMBARCADAS', 'KGS_DECLARADO', 'KGS_REAL', 'KGS_CUBADO', 'QTD_VOLUMES',
      'VLR_MERCADORIA', 'FRT_COBRADO', 'OBS_DIVERSOS', 'NRO_PEDIDO'
    ];

    const row1 = [
      'CONHECIMENTO', 'BHZ', '1', '42383', 'NORMAL',
      'ANHANGUERA COMERCIO DE FERRAMENTAS LTDA', '00.565.813/0009-86',
      'TORRES EOLICAS DO NORDESTE S/A', '13.892.216/0002-31',
      '28/08/2026', '28/08/2026', '05/09/2026', '29/08/2026', '02/09/2026', '',
      '06/09/2026', '', 'EM TRANSITO', 'VIANA/ES', 'JACOBINA/BA',
      '3122088/3122237/3123603', '36,846', '36,846', '40,534', '4',
      '16298,23', '1142,69', 'FSA/ESPECIFICA TE (VALORES PARA TARIFA SPO001/JACOBINA)\nCUBAGEM: ...', ''
    ];

    const row2 = [
      'CONHECIMENTO', 'MTZ', '1', '31817', 'NORMAL',
      'TECHFER COMERCIO E SERVICOS DE FERRAMENTAS INDUSTRIAIS LTDA', '65.949.566/0001-00',
      'TORRES EOLICAS DO NORDESTE S/A', '13.892.216/0002-31',
      '06/08/2026', '06/08/2026', '14/08/2026', '10/08/2026', '12/08/2026', '14/08/2026',
      '18/08/2026', '', 'A ENTREGAR', 'LAURO DE FREITAS/BA', 'JACOBINA/BA',
      '1000032', '1,75', '2', '2', '1',
      '15070', '235,33', 'FSA/ESPECIFICA TE (VALORES PARA TARIFA MTZ/JACOBINA)\nCUBAGEM: ...', '4500123456'
    ];

    const rawRows = [headers, row1, row2];
    const { validRows, errors } = parseBahiaSulRows(rawRows);

    expect(errors).toHaveLength(0);
    expect(validRows).toHaveLength(2);

    // Verificando Linha 1
    const item1 = validRows[0];
    expect(item1.chave_unica).toBe('BHZ_1_42383');
    expect(item1.cto_numero).toBe('42383');
    expect(item1.cto_filial).toBe('BHZ');
    expect(item1.rmt_nome).toBe('ANHANGUERA COMERCIO DE FERRAMENTAS LTDA');
    expect(item1.emissao).toBe('2026-08-28');
    expect(item1.prz_contratado).toBe('2026-09-05');
    expect(item1.chegada).toBeNull();
    expect(item1.prv_entrega).toBe('2026-09-06');
    expect(item1.situacao).toBe('EM TRANSITO');
    expect(item1.org_cidade).toBe('VIANA/ES');
    expect(item1.dst_cidade).toBe('JACOBINA/BA');
    expect(item1.nfs_embarcadas).toBe('3122088/3122237/3123603');
    expect(item1.kgs_declarado).toBe(36.846);
    expect(item1.kgs_real).toBe(36.846);
    expect(item1.kgs_cubado).toBe(40.534);
    expect(item1.qtd_volumes).toBe(4);
    expect(item1.vlr_mercadoria).toBe(16298.23);
    expect(item1.frt_cobrado).toBe(1142.69);

    // Verificando Linha 2
    const item2 = validRows[1];
    expect(item2.chave_unica).toBe('MTZ_1_31817');
    expect(item2.cto_numero).toBe('31817');
    expect(item2.cto_filial).toBe('MTZ');
    expect(item2.situacao).toBe('A ENTREGAR');
    expect(item2.chegada).toBe('2026-08-14');
    expect(item2.prv_entrega).toBe('2026-08-18');
    expect(item2.nfs_embarcadas).toBe('1000032');
    expect(item2.kgs_declarado).toBe(1.75);
    expect(item2.vlr_mercadoria).toBe(15070);
    expect(item2.frt_cobrado).toBe(235.33);
    expect(item2.nro_pedido).toBe('4500123456');
  });

  it('vincula entregas com pedidos SAP e calcula KPIs corretamente', () => {
    const entregas: any[] = [
      {
        chave_unica: 'BHZ_1_42383',
        cto_numero: '42383',
        situacao: 'EM TRANSITO',
        prv_entrega: '2026-09-06',
        nro_pedido: '4500999888',
        frt_cobrado: 1142.69,
        kgs_real: 36.846,
        kgs_cubado: 40.534,
        qtd_volumes: 4,
        vlr_mercadoria: 16298.23,
      },
      {
        chave_unica: 'MTZ_1_31817',
        cto_numero: '31817',
        situacao: 'ENTREGUE',
        prv_entrega: '2026-08-18',
        entrega: '2026-08-17',
        nro_pedido: '',
        frt_cobrado: 235.33,
        kgs_real: 2,
        kgs_cubado: 2,
        qtd_volumes: 1,
        vlr_mercadoria: 15070,
      }
    ];

    const pedidosSap: any[] = [
      {
        ri: 'RI-100',
        documento_compra: '004500999888',
        fornecedor_name: 'ANHANGUERA',
        data_pedido: '2026-08-28',
      }
    ];

    const enriquecidas = enriquecerEntregasComPedidos(entregas, pedidosSap);

    expect(enriquecidas).toHaveLength(2);
    expect(enriquecidas[0].pedidoEncontrado).toBe(true);
    expect(enriquecidas[0].pedidoSap?.fornecedor_name).toBe('ANHANGUERA');
    expect(enriquecidas[1].pedidoEncontrado).toBe(false);

    const kpis = calcularKpisBahiaSul(enriquecidas);
    expect(kpis.totalCte).toBe(2);
    expect(kpis.emTransito).toBe(1);
    expect(kpis.entregues).toBe(1);
    expect(kpis.vinculadosSap).toBe(1);
    expect(kpis.taxaVinculoPct).toBe(50);
    expect(kpis.totalVolumes).toBe(5);
  });
});
