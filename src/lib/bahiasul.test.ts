import { describe, it, expect } from 'vitest';
import {
  normalizarLocalidade,
  matchRotaTabelaFrete,
  mediaRotaPorUf,
  calcularFreteContratual,
  calcularKpisBahiaSul,
  enriquecerEntregasComPedidos,
  agruparPedidosParaSugestao,
  sugerirPoBahiaSul,
  resumirBahiaSulPorPo,
} from './bahiasul';
import type { BahiaSulEntrega, TabelaFrete } from '../types';

const mockTabela: TabelaFrete[] = [
  {
    origem: 'SALVADOR',
    uf: 'BA',
    destino: 'JACOBINA',
    rotas: 'MTZ/FSA',
    kg_1_10: 37.13,
    kg_11_20: 47.68,
    kg_21_30: 54.52,
    kg_31_50: 67.69,
    kg_51_70: 97.88,
    kg_71_100: 108.33,
    kg_acima_100: 0.81,
    ad_valores: 0.0035, // 0.35%
    pedagio_fracao_100kg: 4.50,
    cat: 30.00,
    itr_tas: 5.60,
    taxa_fixa_itr_redespacho: 30.00,
    fiorino: 1164.00,
    veiculo_3_4_ate_2_5t: 3395.00,
    toco_ate_5_5t: 4850.00,
    truck_ate_14t: 4850.00,
    carreta_ate_25t: 6305.00,
    carreta_acima_27t: 6790.00,
    icms_aplicado: '0.12', // 12%
  },
  {
    origem: 'SAO PAULO',
    uf: 'SP',
    destino: 'JACOBINA',
    rotas: 'SPO001/FSA',
    kg_1_10: 68.76,
    kg_11_20: 89.91,
    kg_21_30: 107.43,
    kg_31_50: 128.99,
    kg_51_70: 166.20,
    kg_71_100: 195.55,
    kg_acima_100: 1.08,
    ad_valores: 0.35, // no formato 0.35% direto
    pedagio_fracao_100kg: 4.50,
    cat: 30.00,
    itr_tas: 5.60,
    taxa_fixa_itr_redespacho: 30.00,
    fiorino: 10864.00,
    veiculo_3_4_ate_2_5t: 12804.00,
    toco_ate_5_5t: 14065.00,
    truck_ate_14t: 15035.00,
    carreta_ate_25t: 20370.00,
    carreta_acima_27t: 22310.00,
    icms_aplicado: '7%', // 7% direto
  }
];

describe('normalizarLocalidade', () => {
  it('separa cidade e UF corretamente', () => {
    expect(normalizarLocalidade('SALVADOR/BA')).toEqual({ cidade: 'SALVADOR', uf: 'BA' });
    expect(normalizarLocalidade('SÃO PAULO - SP')).toEqual({ cidade: 'SAO PAULO', uf: 'SP' });
    expect(normalizarLocalidade('CAMACARI / BA')).toEqual({ cidade: 'CAMACARI', uf: 'BA' });
  });

  it('trata valores sem UF ou nulos', () => {
    expect(normalizarLocalidade('TEN')).toEqual({ cidade: 'TEN', uf: '' });
    expect(normalizarLocalidade(null)).toEqual({ cidade: '', uf: '' });
    expect(normalizarLocalidade('')).toEqual({ cidade: '', uf: '' });
  });
});

describe('matchRotaTabelaFrete', () => {
  it('casa rota exata por cidade e UF', () => {
    const rota = matchRotaTabelaFrete('SALVADOR/BA', 'JACOBINA/BA', mockTabela);
    expect(rota).not.toBeNull();
    expect(rota?.origem).toBe('SALVADOR');
    expect(rota?.uf).toBe('BA');
  });

  it('casa rota com destino TEN associando a Jacobina', () => {
    const rota = matchRotaTabelaFrete('SAO PAULO/SP', 'TEN', mockTabela);
    expect(rota).not.toBeNull();
    expect(rota?.origem).toBe('SAO PAULO');
  });

  it('retorna null se a rota nao existir na tabela', () => {
    const rota = matchRotaTabelaFrete('MANAUS/AM', 'JACOBINA/BA', mockTabela);
    expect(rota).toBeNull();
  });
});

describe('mediaRotaPorUf', () => {
  it('retorna null quando a UF não tem nenhuma rota cadastrada', () => {
    expect(mediaRotaPorUf('AM', mockTabela)).toBeNull();
  });

  it('retorna null sem UF informada', () => {
    expect(mediaRotaPorUf(null, mockTabela)).toBeNull();
    expect(mediaRotaPorUf('', mockTabela)).toBeNull();
  });

  it('com uma única rota na UF, a média é a própria rota', () => {
    const media = mediaRotaPorUf('BA', mockTabela);
    const salvador = mockTabela.find(r => r.uf === 'BA')!;
    expect(media?.kg_1_10).toBeCloseTo(salvador.kg_1_10, 4);
    expect(media?.fiorino).toBeCloseTo(salvador.fiorino, 4);
    expect(media?.uf).toBe('BA');
  });

  it('com duas rotas na UF, tira a média aritmética de cada faixa', () => {
    const tabelaComDuasSp: TabelaFrete[] = [
      ...mockTabela,
      { ...mockTabela.find(r => r.uf === 'SP')!, origem: 'CAMPINAS', kg_1_10: 100, fiorino: 3000 },
    ];
    const spOriginal = mockTabela.find(r => r.uf === 'SP')!;
    const media = mediaRotaPorUf('SP', tabelaComDuasSp);
    expect(media?.kg_1_10).toBeCloseTo((spOriginal.kg_1_10 + 100) / 2, 4);
    expect(media?.fiorino).toBeCloseTo((spOriginal.fiorino + 3000) / 2, 4);
  });

  it('marca a origem como aproximada e explica a média no campo rotas', () => {
    const media = mediaRotaPorUf('sp', mockTabela);
    expect(media?.origem).toContain('SP');
    expect(media?.rotas).toMatch(/média/i);
  });
});

describe('calcularFreteContratual', () => {
  it('calcula frete fracionado com todas as taxas e icms', () => {
    const entrega: BahiaSulEntrega = {
      cto_numero: '12345',
      cto_documento: 'CTE',
      cto_filial: 'FSA',
      cto_serie: '1',
      tpo_embarque: 'NORMAL',
      rmt_nome: 'FORNECEDOR TESTE',
      rmt_cnpj: '12345678000190',
      dst_nome: 'TEN',
      dst_cnpj: null,
      emissao: '2026-08-01',
      referencia: null,
      prz_contratado: null,
      embarque: null,
      prv_chegada: null,
      chegada: null,
      prv_entrega: null,
      entrega: null,
      situacao: 'TRANSITO',
      org_cidade: 'SALVADOR/BA',
      dst_cidade: 'JACOBINA/BA',
      nfs_embarcadas: '100',
      kgs_declarado: null,
      kgs_real: 38.0,
      kgs_cubado: 38.0,
      qtd_volumes: 1,
      vlr_mercadoria: 588.0,
      frt_cobrado: 162.26,
      obs_diversos: null,
      nro_pedido: null,
      chave_unica: '12345_FSA',
    };

    const calc = calcularFreteContratual(entrega, mockTabela);
    expect(calc.rotaEncontrada).not.toBeNull();
    expect(calc.pesoConsiderado).toBe(38.0);
    expect(calc.freteBase).toBe(67.69); // Faixa 31-50kg Salvador
    expect(calc.adValoresPct).toBe(0.35); // 0.0035 convertido para 0.35%
    expect(calc.adValoresValor).toBeCloseTo((588 * 0.35) / 100, 2);
    expect(calc.grisPct).toBe(0.5);
    expect(calc.grisValor).toBeCloseTo((588 * 0.5) / 100, 2);
    expect(calc.pedagioTotal).toBe(4.50); // 1 fracao de 100kg
    expect(calc.cat).toBe(30.00);
    expect(calc.itrTas).toBe(5.60);
    expect(calc.taxaFixa).toBe(30.00);
    expect(calc.icmsPct).toBe(12);

    // Subtotal: 67.69 + 2.058 + 2.94 + 4.50 + 30 + 5.60 + 30 = 142.788
    expect(calc.subtotalSemIcms).toBeCloseTo(142.788, 2);
    // Total com ICMS 12%: 142.788 / (1 - 0.12) = 162.259 ~ 162.26
    expect(calc.totalComIcms).toBeCloseTo(162.26, 1);
    expect(calc.statusAuditoria).toBe('conforme');
  });

  it('calcula com precisão o CTe 00033095 (São Paulo -> Jacobina) incluindo GRIS 0.5%', () => {
    const entrega: BahiaSulEntrega = {
      cto_numero: '00033095',
      cto_documento: '57',
      cto_filial: 'SPO',
      cto_serie: '1',
      tpo_embarque: 'NORMAL',
      rmt_nome: 'MMCK SERVICE EQUIPAMENTOS PNEUMATICOS EIRELI',
      rmt_cnpj: '22.767.906/0001-79',
      dst_nome: 'TORRES EOLICAS DO NORDESTE S/A',
      dst_cnpj: '13.892.216/0002-31',
      emissao: '2026-08-27',
      referencia: null,
      prz_contratado: null,
      embarque: '2026-08-27',
      prv_chegada: null,
      chegada: null,
      prv_entrega: '2026-09-06',
      entrega: '2026-09-02',
      situacao: 'ENTREGUE',
      org_cidade: 'SAO PAULO/SP',
      dst_cidade: 'JACOBINA/BA',
      nfs_embarcadas: '1004829/1004830',
      kgs_declarado: null,
      kgs_real: 0.8,
      kgs_cubado: 2.7,
      qtd_volumes: 2,
      vlr_mercadoria: 5094.89,
      frt_cobrado: 195.87,
      obs_diversos: null,
      nro_pedido: null,
      chave_unica: 'SPO_1_00033095',
    };

    const calc = calcularFreteContratual(entrega, mockTabela);
    expect(calc.rotaEncontrada).not.toBeNull();
    expect(calc.pesoConsiderado).toBe(2.7);
    expect(calc.freteBase).toBe(68.76); // Faixa 1-10kg SP
    expect(calc.adValoresPct).toBe(0.35);
    expect(calc.adValoresValor).toBeCloseTo(17.83, 2);
    expect(calc.grisPct).toBe(0.5);
    expect(calc.grisValor).toBeCloseTo(25.47, 2);
    expect(calc.pedagioTotal).toBe(4.50);
    expect(calc.cat).toBe(30.00);
    expect(calc.itrTas).toBe(5.60);
    expect(calc.taxaFixa).toBe(30.00);
    expect(calc.subtotalSemIcms).toBeCloseTo(182.16, 2);
    expect(calc.icmsPct).toBe(7);
    expect(calc.valorIcms).toBeCloseTo(13.71, 2);
    expect(calc.totalComIcms).toBeCloseTo(195.87, 2);
    expect(calc.diferenca).toBeCloseTo(0.00, 2);
    expect(calc.statusAuditoria).toBe('conforme');
  });

  it('identifica sobrepreco quando cobranca for superior a tabela', () => {
    const entrega: BahiaSulEntrega = {
      cto_numero: '99999',
      cto_documento: null,
      cto_filial: 'FSA',
      cto_serie: null,
      tpo_embarque: 'NORMAL',
      rmt_nome: 'FORNECEDOR',
      rmt_cnpj: null,
      dst_nome: 'TEN',
      dst_cnpj: null,
      emissao: null,
      referencia: null,
      prz_contratado: null,
      embarque: null,
      prv_chegada: null,
      chegada: null,
      prv_entrega: null,
      entrega: null,
      situacao: 'TRANSITO',
      org_cidade: 'SALVADOR/BA',
      dst_cidade: 'JACOBINA/BA',
      nfs_embarcadas: null,
      kgs_declarado: null,
      kgs_real: 10.0,
      kgs_cubado: 10.0,
      qtd_volumes: 1,
      vlr_mercadoria: 1000.0,
      frt_cobrado: 250.00, // Muito acima da tabela (~121 reais)
      obs_diversos: null,
      nro_pedido: null,
      chave_unica: '99999_FSA',
    };

    const calc = calcularFreteContratual(entrega, mockTabela);
    expect(calc.statusAuditoria).toBe('sobrepreco');
    expect(calc.diferenca).toBeGreaterThan(0);
    expect(calc.diferencaPct).toBeGreaterThan(10);
  });

  it('identifica sem_rota quando localidade nao constar na tabela', () => {
    const entrega: BahiaSulEntrega = {
      cto_numero: '88888',
      cto_documento: null,
      cto_filial: null,
      cto_serie: null,
      tpo_embarque: null,
      rmt_nome: null,
      rmt_cnpj: null,
      dst_nome: null,
      dst_cnpj: null,
      emissao: null,
      referencia: null,
      prz_contratado: null,
      embarque: null,
      prv_chegada: null,
      chegada: null,
      prv_entrega: null,
      entrega: null,
      situacao: null,
      org_cidade: 'CIDADE_INEXISTENTE/XX',
      dst_cidade: 'JACOBINA/BA',
      nfs_embarcadas: null,
      kgs_declarado: null,
      kgs_real: 50,
      kgs_cubado: 50,
      qtd_volumes: 1,
      vlr_mercadoria: 1000,
      frt_cobrado: 150,
      obs_diversos: null,
      nro_pedido: null,
      chave_unica: '88888',
    };

    const calc = calcularFreteContratual(entrega, mockTabela);
    expect(calc.statusAuditoria).toBe('sem_rota');
    expect(calc.rotaEncontrada).toBeNull();
  });
});

describe('enriquecerEntregasComPedidos e calcularKpisBahiaSul', () => {
  it('enriquece entregas com freteCalculado e computa KPIs de auditoria', () => {
    const entregas: BahiaSulEntrega[] = [
      {
        cto_numero: '1',
        cto_documento: null,
        cto_filial: 'FSA',
        cto_serie: null,
        tpo_embarque: null,
        rmt_nome: 'FORN 1',
        rmt_cnpj: null,
        dst_nome: 'TEN',
        dst_cnpj: null,
        emissao: null,
        referencia: null,
        prz_contratado: null,
        embarque: null,
        prv_chegada: null,
        chegada: null,
        prv_entrega: null,
        entrega: null,
        situacao: 'TRANSITO',
        org_cidade: 'SALVADOR/BA',
        dst_cidade: 'JACOBINA/BA',
        nfs_embarcadas: null,
        kgs_declarado: null,
        kgs_real: 10,
        kgs_cubado: 10,
        qtd_volumes: 1,
        vlr_mercadoria: 500,
        frt_cobrado: 200, // Sobrepreço
        obs_diversos: null,
        nro_pedido: null,
        chave_unica: '1_FSA',
      },
      {
        cto_numero: '2',
        cto_documento: null,
        cto_filial: 'FSA',
        cto_serie: null,
        tpo_embarque: null,
        rmt_nome: 'FORN 2',
        rmt_cnpj: null,
        dst_nome: 'TEN',
        dst_cnpj: null,
        emissao: null,
        referencia: null,
        prz_contratado: null,
        embarque: null,
        prv_chegada: null,
        chegada: null,
        prv_entrega: null,
        entrega: '2026-08-10',
        situacao: 'ENTREGUE',
        org_cidade: 'CIDADE_DESCONHECIDA/XX',
        dst_cidade: 'JACOBINA/BA',
        nfs_embarcadas: null,
        kgs_declarado: null,
        kgs_real: 20,
        kgs_cubado: 20,
        qtd_volumes: 2,
        vlr_mercadoria: 1000,
        frt_cobrado: 150, // Sem rota
        obs_diversos: null,
        nro_pedido: null,
        chave_unica: '2_FSA',
      }
    ];

    const enriquecidas = enriquecerEntregasComPedidos(entregas, [], mockTabela);
    expect(enriquecidas.length).toBe(2);
    expect(enriquecidas[0].freteCalculado?.statusAuditoria).toBe('sobrepreco');
    expect(enriquecidas[1].freteCalculado?.statusAuditoria).toBe('sem_rota');

    const kpis = calcularKpisBahiaSul(enriquecidas);
    expect(kpis.totalCte).toBe(2);
    expect(kpis.qtdSobrepreco).toBe(1);
    expect(kpis.qtdSemRota).toBe(1);
    expect(kpis.totalFreteCobrado).toBe(350);
    expect(kpis.totalFreteCalculado).toBeGreaterThan(0);
    expect(kpis.divergenciaLiquida).toBe(kpis.totalFreteCobrado - kpis.totalFreteCalculado);
  });
});

/* Sugestão de vínculo com PO SAP ------------------------------------------- */

/** CTe mínimo para os testes de sugestão/resumo. */
function mkEntrega(over: Partial<BahiaSulEntrega>): BahiaSulEntrega {
  return {
    cto_documento: null, cto_filial: 'SPO', cto_serie: '1', cto_numero: over.cto_numero || 'X',
    tpo_embarque: null, rmt_nome: null, rmt_cnpj: null, dst_nome: null, dst_cnpj: null,
    emissao: null, referencia: null, prz_contratado: null, embarque: null,
    prv_chegada: null, chegada: null, prv_entrega: null, entrega: null,
    situacao: null, org_cidade: null, dst_cidade: null, nfs_embarcadas: null,
    kgs_declarado: null, kgs_real: null, kgs_cubado: null, qtd_volumes: null,
    vlr_mercadoria: null, frt_cobrado: null, obs_diversos: null, nro_pedido: null,
    chave_unica: over.cto_numero || 'X', ...over,
  };
}

const pedidoRow = (over: Record<string, unknown>) => ({
  documento_compra: '4100000001', cnpj_fornecedor: '12.345.678/0001-90',
  fornecedor_name: 'FORN A', data_doc: '2026-06-01', valor_liquido: 1000, data_migo: null,
  ...over,
});

describe('agruparPedidosParaSugestao', () => {
  it('condensa itens do mesmo PO: soma valor, menor data, item sem MIGO', () => {
    const g = agruparPedidosParaSugestao([
      pedidoRow({ valor_liquido: 400, data_doc: '2026-06-10', data_migo: '2026-07-01' }),
      pedidoRow({ valor_liquido: 600, data_doc: '2026-06-01', data_migo: null }),
    ]);
    expect(g).toHaveLength(1);
    expect(g[0].valorLiquido).toBe(1000);
    expect(g[0].dataPedido).toBe('2026-06-01');
    expect(g[0].cnpj).toBe('12345678000190');
    expect(g[0].temItemSemMigo).toBe(true);
  });
});

describe('sugerirPoBahiaSul', () => {
  const pedidos = agruparPedidosParaSugestao([
    pedidoRow({ documento_compra: '4100000001', cnpj_fornecedor: '12345678000190', valor_liquido: 1000, data_doc: '2026-06-01' }),
    pedidoRow({ documento_compra: '4100000002', cnpj_fornecedor: '12345678000190', valor_liquido: 9000, data_doc: '2025-11-01', data_migo: '2025-12-01' }),
    pedidoRow({ documento_compra: '4100000003', cnpj_fornecedor: '99999999999999', valor_liquido: 1000, data_doc: '2026-06-01' }),
  ]);

  it('não sugere sem CNPJ de 14 dígitos', () => {
    expect(sugerirPoBahiaSul(mkEntrega({ rmt_cnpj: '123', emissao: '2026-06-15', vlr_mercadoria: 1000 }), pedidos)).toBeNull();
  });

  it('não sugere quando o CTe já tem nro_pedido', () => {
    expect(sugerirPoBahiaSul(
      mkEntrega({ rmt_cnpj: '12.345.678/0001-90', nro_pedido: '4100000001', emissao: '2026-06-15' }), pedidos,
    )).toBeNull();
  });

  it('escolhe o PO do mesmo CNPJ mais próximo em valor e data, dentro da janela', () => {
    const s = sugerirPoBahiaSul(
      mkEntrega({ cto_numero: 'A1', rmt_cnpj: '12.345.678/0001-90', emissao: '2026-06-20', vlr_mercadoria: 1050 }),
      pedidos,
    );
    expect(s).not.toBeNull();
    expect(s!.documentoCompra).toBe('4100000001');
    // 4100000002 é do mesmo CNPJ mas foi emitido >180 dias antes do CTe → fora da janela
    expect(s!.alternativas.map(a => a.documentoCompra)).not.toContain('4100000002');
    // 4100000003 é de outro CNPJ → nunca entra
    expect(s!.alternativas.map(a => a.documentoCompra)).not.toContain('4100000003');
  });

  it('candidato único ⇒ confiança alta', () => {
    const s = sugerirPoBahiaSul(
      mkEntrega({ rmt_cnpj: '12.345.678/0001-90', emissao: '2026-06-10', vlr_mercadoria: 1 }),
      agruparPedidosParaSugestao([pedidoRow({})]),
    );
    expect(s!.confianca).toBe('alta');
  });
});

describe('resumirBahiaSulPorPo', () => {
  it('agrega por PO: previsão dos não entregues, data física do entregue', () => {
    const m = resumirBahiaSulPorPo([
      mkEntrega({ cto_numero: 'C1', nro_pedido: '4100000001', situacao: 'A ENTREGAR', prv_chegada: '2026-06-20' }),
      mkEntrega({ cto_numero: 'C2', nro_pedido: '4100000001', situacao: 'ENTREGUE', entrega: '2026-06-18', chegada: '2026-06-17' }),
    ]);
    const r = m.get('4100000001')!;
    expect(r.entregue).toBe(true);
    expect(r.dataChegadaFisica).toBe('2026-06-18'); // entrega tem prioridade sobre chegada
    expect(r.ctos.sort()).toEqual(['C1', 'C2']);
  });

  it('ignora CTe sem nro_pedido', () => {
    expect(resumirBahiaSulPorPo([mkEntrega({ nro_pedido: null })]).size).toBe(0);
  });
});
