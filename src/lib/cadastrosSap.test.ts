/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { localDb } from '../db/localDb';
import { Request } from '../types';

describe('Cadastros SAP — Atualização de Fornecedor e Código de Resposta', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(localDb as any, 'publishRequest').mockResolvedValue(true);
    vi.spyOn(localDb as any, 'publishRequestRow').mockResolvedValue(true);

    (localDb as any).setStorageItem('sisten_requests', []);
    localDb.setCurrentUser({
      id: 'user-1',
      name: 'Solicitante Teste',
      email: 'solicitante@ten.ind.br',
      cargo: 'Analista',
      sector_id: 'sec-1',
      roles: ['solicitante'],
      status: 'ativo',
      created_at: new Date().toISOString(),
    });
  });

  it('salva solicitacao de cadastro SAP com fornecedor_operacao e codigo_fornecedor_sap', async () => {
    const draft: Partial<Request> = {
      type: 'cadastro_sap',
      registration_type: 'Fornecedor',
      fornecedor_operacao: 'atualizacao',
      codigo_fornecedor_sap: '20004567',
      justificativa: 'Operação: Atualização de Cadastro. Cód. Fornecedor SAP: 20004567. NOVO Nome: FORNECEDOR TESTE. Justificativa: Mudança de razão social',
      criticality: 3,
      solicitante_id: 'user-1',
      solicitante_name: 'Solicitante Teste',
      solicitante_sector_id: 'sec-1',
    };

    const created = await localDb.submitRequest(draft, false);

    expect(created.id).toBeDefined();
    expect(created.type).toBe('cadastro_sap');
    expect(created.registration_type).toBe('Fornecedor');
    expect(created.fornecedor_operacao).toBe('atualizacao');
    expect(created.codigo_fornecedor_sap).toBe('20004567');

    const retrieved = localDb.getRequests().find(r => r.id === created.id);
    expect(retrieved).toBeDefined();
    expect(retrieved?.fornecedor_operacao).toBe('atualizacao');
    expect(retrieved?.codigo_fornecedor_sap).toBe('20004567');
  });

  it('armazena codigo_sap_gerado na resolucao da solicitacao', async () => {
    const draft: Partial<Request> = {
      type: 'cadastro_sap',
      registration_type: 'Item',
      justificativa: 'Nome: PARAFUSO M12. Specs: Aço carbono. Justificativa: Reposição',
      criticality: 2,
      solicitante_id: 'user-1',
      solicitante_name: 'Solicitante Teste',
      solicitante_sector_id: 'sec-1',
    };

    const created = await localDb.submitRequest(draft, false);

    const ok = await localDb.transitionRequestStatus(
      created.id,
      'resolvido',
      'Cadastro Finalizado | Cód. Material SAP: 10000999',
      '10000999'
    );

    expect(ok).toBe(true);

    const updated = localDb.getRequests().find(r => r.id === created.id);
    expect(updated?.status).toBe('resolvido');
    expect(updated?.codigo_sap_gerado).toBe('10000999');
  });

  it('armazena codigo_fornecedor_sap gerado ao resolver fornecedor', async () => {
    const draft: Partial<Request> = {
      type: 'cadastro_sap',
      registration_type: 'Fornecedor',
      fornecedor_operacao: 'novo',
      justificativa: 'Nome: FORNECEDOR NOVO LTDA. Justificativa: Novo parceiro comercial',
      criticality: 3,
      solicitante_id: 'user-1',
      solicitante_name: 'Solicitante Teste',
      solicitante_sector_id: 'sec-1',
    };

    const created = await localDb.submitRequest(draft, false);

    const ok = await localDb.transitionRequestStatus(
      created.id,
      'resolvido',
      'Cadastro Finalizado | Cód. Fornecedor SAP: 20008888',
      '20008888'
    );

    expect(ok).toBe(true);

    const updated = localDb.getRequests().find(r => r.id === created.id);
    expect(updated?.status).toBe('resolvido');
    expect(updated?.codigo_sap_gerado).toBe('20008888');
  });

  it('faz parse reverso da justificativa de atualizacao de cadastro', () => {
    const texto = 'Operação: Atualização de Cadastro. Cód. Fornecedor SAP: 20004567. NOVO Nome: NOVO NOME FORNECEDOR. Justificativa: Atualização cadastral necessária';
    const match = texto.match(/Operação:\s*Atualização de Cadastro\.\s*Cód\. Fornecedor SAP:\s*(.*?)\.(?:\s*NOVO Nome:\s*(.*?)\.)?\s*Justificativa:\s*([\s\S]*)$/i);

    expect(match).not.toBeNull();
    expect(match?.[1]?.trim()).toBe('20004567');
    expect(match?.[2]?.trim()).toBe('NOVO NOME FORNECEDOR');
    expect(match?.[3]?.trim()).toBe('Atualização cadastral necessária');
  });
});
