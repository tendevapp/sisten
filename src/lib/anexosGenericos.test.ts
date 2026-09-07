import { describe, it, expect, beforeEach } from 'vitest';
import { localDb } from '../db/localDb';
import type { RequestAttachment, RequestItem } from '../types';

describe('Anexos de Itens Genéricos no localDb', () => {
  const ATTACHMENTS_KEY = 'sisten_attachments';
  const ITEMS_KEY = 'sisten_request_items';

  beforeEach(() => {
    (localDb as any).setStorageItem(ATTACHMENTS_KEY, []);
    (localDb as any).setStorageItem(ITEMS_KEY, []);
  });

  describe('isAttachmentFromGenericItem', () => {
    it('reconhece como generico quando o nome e Uso Generico', () => {
      const anexo: RequestAttachment = {
        id: 'att-1',
        request_id: 'req-1',
        name: 'Uso Genérico',
        url: 'path/1.jpg',
        size: 1000,
        created_at: new Date().toISOString(),
      };
      expect(localDb.isAttachmentFromGenericItem(anexo)).toBe(true);
    });

    it('reconhece como generico quando vinculado a item com is_generic true', () => {
      const itemGen: RequestItem = {
        id: 'item-gen-1',
        request_id: 'req-1',
        description: 'PARAFUSO',
        sap_code: '1000555',
        quantity: 10,
        unit: 'UN',
        is_generic: true,
        estimated_value: 0,
      };
      (localDb as any).setStorageItem(ITEMS_KEY, [itemGen]);

      const anexo: RequestAttachment = {
        id: 'att-2',
        request_id: 'req-1',
        request_item_id: 'item-gen-1',
        name: 'foto_antiga.jpg',
        url: 'path/2.jpg',
        size: 1000,
        created_at: new Date().toISOString(),
      };

      expect(localDb.isAttachmentFromGenericItem(anexo)).toBe(true);
    });

    it('retorna false para anexo de item comum (nao generico)', () => {
      const itemComum: RequestItem = {
        id: 'item-comum-1',
        request_id: 'req-1',
        description: 'ROLAMENTO',
        sap_code: '1000888',
        quantity: 1,
        unit: 'UN',
        is_generic: false,
        estimated_value: 0,
      };
      (localDb as any).setStorageItem(ITEMS_KEY, [itemComum]);

      const anexo: RequestAttachment = {
        id: 'att-3',
        request_id: 'req-1',
        request_item_id: 'item-comum-1',
        name: 'catalogo.pdf',
        url: 'path/3.pdf',
        size: 2000,
        created_at: new Date().toISOString(),
      };

      expect(localDb.isAttachmentFromGenericItem(anexo)).toBe(false);
    });
  });

  describe('getAttachmentsByMaterialCode', () => {
    it('retorna anexos vinculados pelo material_code direto ou pelo request_item_id', () => {
      const itemGen: RequestItem = {
        id: 'item-g-1',
        request_id: 'req-1',
        description: 'GENERICO',
        sap_code: '20001234',
        quantity: 5,
        unit: 'PC',
        is_generic: true,
        estimated_value: 0,
      };
      (localDb as any).setStorageItem(ITEMS_KEY, [itemGen]);

      const anexo1: RequestAttachment = {
        id: 'att-10',
        request_id: 'req-1',
        request_item_id: 'item-g-1',
        material_code: '20001234',
        name: 'Uso Genérico',
        url: 'path/10.jpg',
        size: 1000,
        created_at: '2026-09-01T10:00:00Z',
      };

      const anexo2: RequestAttachment = {
        id: 'att-20',
        request_id: 'req-1',
        request_item_id: 'item-g-1',
        material_code: undefined, // sem material_code direto, mas item tem sap_code
        name: 'Uso Genérico',
        url: 'path/20.pdf',
        size: 1500,
        created_at: '2026-09-02T10:00:00Z',
      };

      const anexoOutro: RequestAttachment = {
        id: 'att-30',
        request_id: 'req-2',
        material_code: '99999999',
        name: 'outra_foto.jpg',
        url: 'path/30.jpg',
        size: 1000,
        created_at: '2026-09-03T10:00:00Z',
      };

      (localDb as any).setStorageItem(ATTACHMENTS_KEY, [anexo1, anexo2, anexoOutro]);

      const resultado = localDb.getAttachmentsByMaterialCode('20001234');
      expect(resultado).toHaveLength(2);
      expect(resultado[0].id).toBe('att-20'); // Mais recente primeiro
      expect(resultado[1].id).toBe('att-10');
    });
  });
});
