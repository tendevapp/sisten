import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, RequestAttachment, RequestItem, Sector } from '../types';

const getRequestItems = vi.fn<(id: string) => RequestItem[]>();
const getAttachments = vi.fn<(id: string) => RequestAttachment[]>();
const getProfiles = vi.fn(() => [{ id: 'u1', name: 'Itana Souza' }]);

vi.mock('../db/localDb', () => ({
  localDb: {
    getRequestItems: (id: string) => getRequestItems(id),
    getAttachments: (id: string) => getAttachments(id),
    getProfiles: () => getProfiles(),
  },
}));

/** Captura o que foi entregue à planilha, sem escrever arquivo nenhum. */
const jsonToSheet = vi.fn((linhas: unknown) => linhas);
vi.mock('xlsx', () => ({
  utils: {
    json_to_sheet: (l: unknown) => jsonToSheet(l),
    book_new: () => ({}),
    book_append_sheet: () => undefined,
  },
  writeFile: () => undefined,
}));

const { exportarSolicitacoes } = await import('./solicitacoes');

const setores: Sector[] = [
  { id: '5', name: 'Manutenção', is_support: false, helpdesk_enabled: false },
];

const req = {
  id: 'r1', number: '3000123', type: 'compra', status: 'pendente', criticality: 3,
  solicitante_id: 'u9', solicitante_name: 'Ana', solicitante_sector_id: '5',
  created_at: '2026-07-20T10:00:00Z', updated_at: '2026-07-21T15:30:00Z',
  comprador_id: 'u1',
} as Request;

const item = (over: Partial<RequestItem>): RequestItem => ({
  id: 'i1', request_id: 'r1', description: 'LUVA', has_no_sap_code: false,
  quantity: 2, unit: 'UN', estimated_value: 10, ...over,
});

function exportar(): Record<string, unknown>[] {
  exportarSolicitacoes([req], setores);
  return jsonToSheet.mock.calls.at(-1)![0] as Record<string, unknown>[];
}

beforeEach(() => {
  jsonToSheet.mockClear();
  getAttachments.mockReturnValue([]);
  getRequestItems.mockReturnValue([item({})]);
});

describe('exportarSolicitacoes', () => {
  it('marca "Sim" no item genérico e deixa vazio quando não é', () => {
    getRequestItems.mockReturnValue([item({ id: 'a', is_generic: true }), item({ id: 'b' })]);
    const [g, comum] = exportar();
    expect(g['Item genérico']).toBe('Sim');
    // Vazio, não "Não": numa planilha filtrável a célula vazia já diz não.
    expect(comum['Item genérico']).toBe('');
  });

  it('leva a observação do item para a planilha', () => {
    getRequestItems.mockReturnValue([item({ observation: 'usar da marca X' })]);
    expect(exportar()[0]['Observação']).toBe('usar da marca X');
  });

  it('marca anexo apenas na linha do item que o tem', () => {
    getRequestItems.mockReturnValue([item({ id: 'i1' }), item({ id: 'i2' })]);
    getAttachments.mockReturnValue([
      { id: 'a1', request_id: 'r1', request_item_id: 'i1', name: 'f.jpg', url: '', size: 1, created_at: '' },
    ]);
    const [com, sem] = exportar();
    expect(com['Anexo']).toBe('Sim');
    expect(sem['Anexo']).toBe('');
  });

  it('anexo preso à solicitação vale para todas as linhas', () => {
    // Ele não pertence a um item; omiti-lo faria a planilha afirmar que a
    // solicitação não tem anexo nenhum.
    getRequestItems.mockReturnValue([item({ id: 'i1' }), item({ id: 'i2' })]);
    getAttachments.mockReturnValue([
      { id: 'a1', request_id: 'r1', name: 'nf.pdf', url: '', size: 1, created_at: '' },
    ]);
    expect(exportar().map(l => l['Anexo'])).toEqual(['Sim', 'Sim']);
  });

  it('solicitação sem itens sai em linha única, com anexo resolvido', () => {
    getRequestItems.mockReturnValue([]);
    getAttachments.mockReturnValue([
      { id: 'a1', request_id: 'r1', name: 'doc.pdf', url: '', size: 1, created_at: '' },
    ]);
    const linhas = exportar();
    expect(linhas).toHaveLength(1);
    expect(linhas[0]['Anexo']).toBe('Sim');
    expect(linhas[0]['Item']).toBe('');
  });

  it('resolve o comprador pelo id, não despeja o uuid', () => {
    expect(exportar()[0]['Comprador']).toBe('Itana Souza');
  });

  it('deixa vazio o campo que não pertence ao tipo, sem quebrar a linha', () => {
    const linha = exportar()[0];
    expect(linha['Categoria']).toBe('');
    expect(linha['Local']).toBe('');
  });
});
