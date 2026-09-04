import { describe, it, expect } from 'vitest';
import {
  normalizarLocalidade,
  matchRotaTabelaFrete,
  calcularFreteContratual,
  calcularKpisBahiaSul,
  enriquecerEntregasComPedidos,
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
      frt_cobrado: 158.92, // Supondo valor cobrado com sobrepreco
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
    expect(calc.pedagioTotal).toBe(4.50); // 1 fracao de 100kg
    expect(calc.cat).toBe(30.00);
    expect(calc.itrTas).toBe(5.60);
    expect(calc.taxaFixa).toBe(30.00);
    expect(calc.icmsPct).toBe(12);

    // Subtotal: 67.69 + 2.058 + 4.50 + 30 + 5.60 + 30 = 139.848
    expect(calc.subtotalSemIcms).toBeCloseTo(139.848, 2);
    // Total com ICMS 12%: 139.848 / (1 - 0.12) = 158.918 ~ 158.92
    expect(calc.totalComIcms).toBeCloseTo(158.92, 1);
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
