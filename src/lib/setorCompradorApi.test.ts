import { describe, it, expect } from 'vitest';
import {
  SETOR_COMPRADOR_PADRAO,
  listarSetoresCompradores,
  mapaGrupoComprasPorSetor,
} from './setorCompradorApi';
import {
  grupoComprasRm,
  montarLinhasRm,
  type ContextoRm,
} from './almoxarifadoRm';
import type { Request, RequestItem, Sector } from '../types';

describe('setorCompradorApi & atribuição de comprador por setor', () => {
  it('deve possuir exatamente 19 setores oficiais no padrão', () => {
    expect(SETOR_COMPRADOR_PADRAO).toHaveLength(19);
  });

  it('deve mapear os 19 setores aos compradores conforme regra de negócio', () => {
    const mapa = new Map(SETOR_COMPRADOR_PADRAO.map(s => [s.setor_nome, s.grupo_compras]));

    // André (575)
    expect(mapa.get('RH')).toBe('575');
    expect(mapa.get('Facilities')).toBe('575');
    expect(mapa.get('Comunicação')).toBe('575');
    expect(mapa.get('Financeiro')).toBe('575');
    expect(mapa.get('Contabilidade')).toBe('575');
    expect(mapa.get('TI')).toBe('575');
    expect(mapa.get('Saúde')).toBe('575');
    expect(mapa.get('Diretoria')).toBe('575');
    expect(mapa.get('Jurídico')).toBe('575');
    expect(mapa.get('Suprimentos')).toBe('575');
    expect(mapa.get('Controladoria')).toBe('575');
    expect(mapa.get('Portaria')).toBe('575');

    // Giulia (610)
    expect(mapa.get('Almoxarifado')).toBe('610');

    // Itana (314)
    expect(mapa.get('Planejamento')).toBe('314');
    expect(mapa.get('Engenharia')).toBe('314');
    expect(mapa.get('Qualidade')).toBe('314');
    expect(mapa.get('Produção')).toBe('314');
    expect(mapa.get('Manutenção')).toBe('314');

    // Isadora (358)
    expect(mapa.get('Segurança')).toBe('358');
  });

  it('mapaGrupoComprasPorSetor deve indexar tanto por setor_id quanto por nome em minúsculo', async () => {
    const mapa = await mapaGrupoComprasPorSetor();

    // Por ID
    expect(mapa.get('1')).toBe('575'); // RH
    expect(mapa.get('2')).toBe('610'); // Almoxarifado
    expect(mapa.get('8')).toBe('314'); // Planejamento
    expect(mapa.get('13')).toBe('358'); // Segurança

    // Por Nome
    expect(mapa.get('rh')).toBe('575');
    expect(mapa.get('almoxarifado')).toBe('610');
    expect(mapa.get('planejamento')).toBe('314');
    expect(mapa.get('segurança')).toBe('358');
  });

  describe('Integração com Abertura de RM (grupoComprasRm e montarLinhasRm)', () => {
    const sectors: Sector[] = [
      { id: '1', name: 'RH', is_support: false, helpdesk_enabled: false },
      { id: '2', name: 'Almoxarifado', is_support: true, helpdesk_enabled: false },
      { id: '8', name: 'Planejamento', is_support: false, helpdesk_enabled: false },
      { id: '13', name: 'Segurança', is_support: true, helpdesk_enabled: false },
    ];

    const grupoComprasPorSetor = new Map<string, string>([
      ['1', '575'],
      ['rh', '575'],
      ['2', '610'],
      ['almoxarifado', '610'],
      ['8', '314'],
      ['planejamento', '314'],
      ['13', '358'],
      ['segurança', '358'],
    ]);

    const ctx: ContextoRm = {
      sectors,
      grupoMercadoriaPorMaterial: new Map([['1042290', 'M05002005']]),
      grupoComprasPorMercadoria: new Map([['M05002005', '358']]),
      grupoComprasPorSetor,
    };

    const dummyItem: RequestItem = {
      id: 'i1',
      request_id: 'r1',
      description: 'Lixeira Inox',
      quantity: 5,
      unit: 'UN',
      sap_code: '1042290',
      has_no_sap_code: false,
      estimated_value: 0,
    };

    it('deve priorizar o comprador do setor solicitante (regra ativa)', () => {
      // Solicitação da Almoxarifado (setor 2) com item que antes resolveria 358
      const reqAlmox: Request = {
        id: 'r1',
        number: '1234567',
        type: 'compra',
        status: 'aprovada',
        criticality: 2,
        solicitante_id: 'u1',
        solicitante_name: 'Almoxarife Teste',
        solicitante_sector_id: '2',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const comprador = grupoComprasRm(dummyItem, ctx, reqAlmox);
      expect(comprador).toBe('610'); // Almoxarifado -> Giulia (610), e NÃO 358 de mercadorias
    });

    it('deve atribuir 314 para solicitação de Planejamento', () => {
      const reqPlan: Request = {
        id: 'r2',
        number: '1234568',
        type: 'compra',
        status: 'aprovada',
        criticality: 3,
        solicitante_id: 'u2',
        solicitante_name: 'Engenheiro Planejamento',
        solicitante_sector_id: '8',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const comprador = grupoComprasRm(dummyItem, ctx, reqPlan);
      expect(comprador).toBe('314'); // Planejamento -> Itana (314)
    });

    it('deve atribuir 575 para solicitação de RH', () => {
      const reqRh: Request = {
        id: 'r3',
        number: '1234569',
        type: 'compra',
        status: 'aprovada',
        criticality: 1,
        solicitante_id: 'u3',
        solicitante_name: 'Analista RH',
        solicitante_sector_id: '1',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const comprador = grupoComprasRm(dummyItem, ctx, reqRh);
      expect(comprador).toBe('575'); // RH -> André (575)
    });

    it('montarLinhasRm deve preencher coluna EKGRP com o comprador do setor de cada solicitação', () => {
      const solicitacoes = [
        {
          request: {
            id: 'r1',
            number: '1000001',
            type: 'compra' as const,
            status: 'aprovada' as const,
            criticality: 1,
            solicitante_id: 'u1',
            solicitante_name: 'User Almox',
            solicitante_sector_id: '2', // Almoxarifado
            created_at: '2026-09-01T10:00:00Z',
            updated_at: '2026-09-01T10:00:00Z',
          },
          itens: [dummyItem],
        },
        {
          request: {
            id: 'r2',
            number: '1000002',
            type: 'compra' as const,
            status: 'aprovada' as const,
            criticality: 1,
            solicitante_id: 'u2',
            solicitante_name: 'User Plan',
            solicitante_sector_id: '8', // Planejamento
            created_at: '2026-09-01T10:00:00Z',
            updated_at: '2026-09-01T10:00:00Z',
          },
          itens: [dummyItem],
        },
      ];

      const linhas = montarLinhasRm(solicitacoes, ctx);
      expect(linhas).toHaveLength(2);
      expect(linhas[0]['Grupo Compras (EKGRP)']).toBe('610'); // Almoxarifado
      expect(linhas[1]['Grupo Compras (EKGRP)']).toBe('314'); // Planejamento
    });
  });
});
