/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Sector } from '../types';

export const INITIAL_SECTORS: Sector[] = [
  { id: '1', name: 'RH', is_support: false, helpdesk_enabled: false },
  { id: '2', name: 'Almoxarifado', is_support: true, helpdesk_enabled: false, sap_area_code: 'ALMO' },
  { id: '3', name: 'Facilities', is_support: true, helpdesk_enabled: true, sap_area_code: 'ADMI' },
  { id: '4', name: 'Comunicação', is_support: false, helpdesk_enabled: false },
  { id: '5', name: 'Suprimentos', is_support: true, helpdesk_enabled: true },
  { id: '6', name: 'Financeiro', is_support: false, helpdesk_enabled: false },
  { id: '7', name: 'Contabilidade', is_support: false, helpdesk_enabled: false, sap_area_code: 'CONT' },
  { id: '8', name: 'Planejamento', is_support: false, helpdesk_enabled: false },
  { id: '9', name: 'TI', is_support: true, helpdesk_enabled: true, sap_area_code: 'TI' },
  { id: '10', name: 'Engenharia', is_support: false, helpdesk_enabled: false, sap_area_code: 'ENGE' },
  { id: '11', name: 'Qualidade', is_support: false, helpdesk_enabled: false, sap_area_code: 'QUAL' },
  { id: '12', name: 'Saúde', is_support: true, helpdesk_enabled: false, sap_area_code: 'SAUD' },
  { id: '13', name: 'Segurança', is_support: true, helpdesk_enabled: false },
  { id: '14', name: 'Produção', is_support: false, helpdesk_enabled: false, sap_area_code: 'PROD' },
  { id: '15', name: 'Manutenção', is_support: true, helpdesk_enabled: false, sap_area_code: 'MANU' },
  { id: '16', name: 'Diretoria', is_support: false, helpdesk_enabled: false },
  { id: '17', name: 'Jurídico', is_support: true, helpdesk_enabled: true },
  { id: '18', name: 'Controladoria', is_support: false, helpdesk_enabled: false },
  // Portaria: opera os formulários do próprio módulo (chegada de transporte,
  // carretas, passagem de plantão). Não é destino de helpdesk.
  { id: '19', name: 'Portaria', is_support: false, helpdesk_enabled: false },
];
