/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { getSlaInfo, calculateHelpdeskKpis, SLA_HOURS_MAP } from './helpdeskUtils';
import { Request, Sector } from '../../types';

describe('helpdeskUtils', () => {
  const mockSectors: Sector[] = [
    { id: 'sec_ti', name: 'Tecnologia da Informação', sap_area_code: 'TI', helpdesk_enabled: true, is_support: true },
    { id: 'sec_fac', name: 'Facilities', sap_area_code: 'FAC', helpdesk_enabled: true, is_support: true },
    { id: 'sec_prod', name: 'Produção', sap_area_code: 'PROD', helpdesk_enabled: false, is_support: false }
  ];

  it('calcula corretamente o SLA para chamado dentro do prazo', () => {
    const ticket: Request = {
      id: 'req_1',
      number: '3000001',
      type: 'chamado',
      status: 'em_atendimento',
      criticality: 3, // 24 horas
      solicitante_id: 'user_1',
      solicitante_name: 'Carlos Solicitante',
      solicitante_sector_id: 'sec_prod',
      target_sector_id: 'sec_ti',
      created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2h atrás
      updated_at: new Date().toISOString()
    };

    const sla = getSlaInfo(ticket);
    expect(sla.allowedHours).toBe(24);
    expect(sla.isViolated).toBe(false);
    expect(sla.status).toBe('ok');
    expect(sla.remainingHours).toBeGreaterThan(20);
  });

  it('identifica estouro de SLA para chamado vencido', () => {
    const ticket: Request = {
      id: 'req_2',
      number: '5000002',
      type: 'chamado',
      status: 'em_atendimento',
      criticality: 5, // 2 horas (Parada)
      solicitante_id: 'user_2',
      solicitante_name: 'Mariana Fábrica',
      solicitante_sector_id: 'sec_prod',
      target_sector_id: 'sec_ti',
      created_at: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(), // 5h atrás
      updated_at: new Date().toISOString()
    };

    const sla = getSlaInfo(ticket);
    expect(sla.allowedHours).toBe(2);
    expect(sla.isViolated).toBe(true);
    expect(sla.status).toBe('violated');
    expect(sla.badgeText).toContain('SLA Estourado');
  });

  it('agrega métricas de KPIs, MTTR e CSAT corretamente', () => {
    const tickets: Request[] = [
      {
        id: 'req_1',
        number: '3000001',
        type: 'chamado',
        status: 'resolvido',
        criticality: 3,
        solicitante_id: 'user_1',
        solicitante_name: 'User 1',
        solicitante_sector_id: 'sec_prod',
        target_sector_id: 'sec_ti',
        atendente_id: 'tech_1',
        atendente_name: 'Técnico TI',
        created_at: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
        resolved_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2h de resolução
        updated_at: new Date().toISOString(),
        rating: 5,
        rating_comment: 'Excelente atendimento!'
      },
      {
        id: 'req_2',
        number: '2000002',
        type: 'chamado',
        status: 'aberto',
        criticality: 2,
        solicitante_id: 'user_2',
        solicitante_name: 'User 2',
        solicitante_sector_id: 'sec_prod',
        target_sector_id: 'sec_ti',
        created_at: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date().toISOString()
      }
    ];

    const kpis = calculateHelpdeskKpis(tickets, 'all', mockSectors);
    expect(kpis.total).toBe(2);
    expect(kpis.open).toBe(1);
    expect(kpis.resolved).toBe(1);
    expect(kpis.resolutionRate).toBe(50);
    expect(kpis.csatAvg).toBe(5);
    expect(kpis.csatCount).toBe(1);
    expect(kpis.avgMttrHours).toBeCloseTo(2, 0.1);
    expect(kpis.byAttendant.length).toBe(1);
    expect(kpis.byAttendant[0].name).toBe('Técnico TI');
  });
});
