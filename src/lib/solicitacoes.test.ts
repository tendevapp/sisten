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

const {
  exportarSolicitacoes, podeAlterarDecisao, podeCancelar, classificarEventoHistorico,
} = await import('./solicitacoes');

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

describe('podeAlterarDecisao', () => {
  const gestorAprovador = {
    id: 'u_gestor',
    name: 'Gestor',
    roles: ['gestor'],
    aprovador_setores: ['5'],
  } as any;

  const solicitante = {
    id: 'u9',
    name: 'Ana',
    roles: ['requisitante'],
  } as any;

  it('permite que o aprovador altere a decisao quando a compra estiver em revisao, aprovada ou rejeitada', () => {
    expect(podeAlterarDecisao({ ...req, status: 'em_revisao' }, gestorAprovador)).toBe(true);
    expect(podeAlterarDecisao({ ...req, status: 'aprovada' }, gestorAprovador)).toBe(true);
    expect(podeAlterarDecisao({ ...req, status: 'rejeitada' }, gestorAprovador)).toBe(true);
    expect(podeAlterarDecisao({ ...req, status: 'cancelada' }, gestorAprovador)).toBe(true);
  });

  it('nao permite alterar decisao se a solicitacao ja estiver fechada/resolvida', () => {
    expect(podeAlterarDecisao({ ...req, status: 'fechado' }, gestorAprovador)).toBe(false);
    expect(podeAlterarDecisao({ ...req, status: 'resolvido' }, gestorAprovador)).toBe(false);
  });

  it('nao permite que solicitante comum altere a decisao', () => {
    expect(podeAlterarDecisao({ ...req, status: 'em_revisao' }, solicitante)).toBe(false);
  });

  it('nao se aplica para chamados ou cadastros sap', () => {
    expect(podeAlterarDecisao({ ...req, type: 'chamado' }, gestorAprovador)).toBe(false);
  });
});

describe('podeCancelar', () => {
  const solicitante = { id: 'u9', name: 'Ana', roles: ['requisitante'] } as any;
  const admin = { id: 'u_adm', name: 'Admin', roles: ['admin'] } as any;
  const estranho = { id: 'u_estranho', name: 'Outro', roles: ['requisitante'] } as any;

  it('permite que o proprio solicitante cancele a solicitacao em aberto', () => {
    expect(podeCancelar({ ...req, status: 'pendente' }, solicitante)).toBe(true);
    expect(podeCancelar({ ...req, status: 'em_revisao' }, solicitante)).toBe(true);
  });

  it('permite que o admin cancele a solicitacao', () => {
    expect(podeCancelar({ ...req, status: 'pendente' }, admin)).toBe(true);
  });

  it('nao permite que outro usuario sem permissao cancele', () => {
    expect(podeCancelar({ ...req, status: 'pendente' }, estranho)).toBe(false);
  });

  it('nao permite cancelar solicitacao que ja esta cancelada ou fechada', () => {
    expect(podeCancelar({ ...req, status: 'cancelada' }, solicitante)).toBe(false);
    expect(podeCancelar({ ...req, status: 'fechado' }, admin)).toBe(false);
  });
});

describe('classificarEventoHistorico', () => {
  it('classifica aprovacao corretamente', () => {
    const ev = classificarEventoHistorico('pendente', 'aprovada', 'Aprovado sem ressalvas');
    expect(ev.tipo).toBe('aprovacao');
    expect(ev.cor).toBe('verde');
  });

  it('classifica devolucao para revisao corretamente', () => {
    const ev = classificarEventoHistorico('pendente', 'em_revisao', 'Favor detalhar itens');
    expect(ev.tipo).toBe('devolucao');
    expect(ev.cor).toBe('laranja');
  });

  it('classifica cancelamento corretamente', () => {
    const ev = classificarEventoHistorico('em_revisao', 'cancelada', 'Nao e mais necessario');
    expect(ev.tipo).toBe('cancelamento');
    expect(ev.cor).toBe('vermelho');
  });

  it('classifica rejeicao corretamente', () => {
    const ev = classificarEventoHistorico('pendente', 'rejeitada', 'Fora do orcamento');
    expect(ev.tipo).toBe('rejeicao');
    expect(ev.cor).toBe('vermelho');
  });

  it('classifica alteracao de decisao do aprovador com destaque', () => {
    const ev = classificarEventoHistorico('em_revisao', 'aprovada', '[Decisão alterada] De Em revisao para Aprovada');
    expect(ev.tipo).toBe('edicao_decisao');
    expect(ev.cor).toBe('azul');
  });

  it('classifica abertura de solicitacao', () => {
    const ev = classificarEventoHistorico('rascunho', 'pendente', 'Solicitacao criada');
    expect(ev.tipo).toBe('abertura');
  });
});
