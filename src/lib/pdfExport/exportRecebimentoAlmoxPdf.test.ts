import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PDFDocument } from 'pdf-lib';

vi.mock('../../db/localDb', () => ({ localDb: {} }));
vi.mock('../recebimentoAlmoxApi', () => ({
  assinarEvidencias: vi.fn(async (paths: string[]) => Object.fromEntries(paths.map((p) => [p, `https://assinada/${p}`]))),
}));
vi.mock('./core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./core')>()),
  downloadPdf: vi.fn(async () => {}),
}));

import { downloadPdf } from './core';
import { exportConferenciaPdf, exportFichaCegaPdf, exportNaoConformidadePdf } from './exportRecebimentoAlmoxPdf';
import type { CargaRow, ConferenciaRow, NaoConformidadeRow } from '../recebimentoAlmoxApi';

// PNG 1x1
const PNG = Uint8Array.from(atob(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
), (c) => c.charCodeAt(0));

const anexo = (n: number) => ({ path: `RCV-010126-01/${n}.jpg`, nome: `${n}.jpg`, tipo: 'image/jpeg' });

const carga: CargaRow = {
  id: 'c1', codigo: 'RCV-010126-01', data: '2026-01-01', hora: null, transportadora: 'TRANSPORTES ÁGIL',
  veiculo_placa: 'ABC1D23', motorista: 'JOÃO', doc_transporte: '55', nota_fiscal: '123, 456, 789',
  nro_pedido: '4500001234', qtd_volumes_declarada: 10, qtd_volumes_contada: 9, tipo_embalagem: 'caixa',
  lacre_integro: false, avaria_aparente: true, avaria_descricao: 'Caixa amassada', peso_declarado: 120,
  destino_previsto: 'consumo', evidencias: Array.from({ length: 5 }, (_, i) => anexo(i)), observacao: 'Chegou molhada',
  divergencia: true, status: 'divergente', criado_por_id: 'u1', criado_por_nome: 'MARIA', created_at: '2026-01-01T10:00:00Z',
};

const item = (i: number): ConferenciaRow['itens'][number] => ({
  id: `i${i}`, nro_pedido: '4500001234', material_code: `2000${i}`, descricao: `PARAFUSO SEXTAVADO ${i} COM DESCRIÇÃO BEM LONGA PARA TESTAR`,
  unidade: 'PC', qtd_pedido: 100, qtd_ja_fornecida: i % 3 === 0 ? 40 : 0, qtd_recebida: 100, conferido: true,
  divergencia: i % 5 === 0, tipo_divergencia: i % 5 === 0 ? 'falta' : null, parcial: i % 7 === 0,
  observacao: i % 4 === 0 ? 'obs do item' : null, evidencias: i % 2 === 0 ? [anexo(i)] : [],
});

const nc: NaoConformidadeRow = {
  id: 'n1', codigo: 'NCR-010126-01', conferencia_id: 'f1', carga_id: null, nro_pedido: '4500001234', fornecedor: 'FORNECEDOR X',
  tipo: 'falta', severidade: 'alta', descricao: 'Faltaram itens', itens_resumo: [
    { material_code: '2000', descricao: 'PARAFUSO', tipo_divergencia: 'falta', qtd_pedido: 10, qtd_verificada: 7 },
  ],
  evidencias: [anexo(1)], acoes: [{ texto: 'Cobrado o fornecedor', evidencias: [anexo(2)], por_id: 'u', por_nome: 'MARIA', em: '2026-01-02T10:00:00Z' }],
  status: 'em_tratativa', responsavel: 'JOSÉ', resolucao: null, resolvida_em: null, created_at: '2026-01-01T10:00:00Z',
};

const conferencia = (qtdItens: number): ConferenciaRow => ({
  id: 'f1', codigo: 'RCM-010126-01', data: '2026-01-01', carga_id: 'c1', nro_pedido: '4500001234', pedidos: ['4500001234', '4500001235'],
  fornecedor: 'FORNECEDOR X', rm: '1000', tipo_item: 'consumo', deposito: 'A1', fonte_pedido: 'cache_sap', total_itens: qtdItens,
  itens_ok: qtdItens - 2, itens_divergentes: 2, tem_nc: true, encaminhado_projetos: false, evidencias: [anexo(9)], observacao: 'ok',
  status: 'concluida', criado_por_id: 'u1', criado_por_nome: 'MARIA', created_at: '2026-01-01T10:00:00Z',
  itens: Array.from({ length: qtdItens }, (_, i) => item(i + 1)), nc: [nc],
});

const ultimoDoc = () => vi.mocked(downloadPdf).mock.calls.at(-1)! as unknown as [PDFDocument, string];

describe('PDF do Recebimento (FRM.ALM-0001)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(downloadPdf).mockClear();
    globalThis.fetch = vi.fn(async (url: string) => {
      if (String(url).startsWith('https://assinada/')) return { ok: true, arrayBuffer: async () => PNG.buffer } as Response;
      throw new Error('sem logo no teste');
    }) as any;
  });

  it('gera a ficha cega com várias NFs e fotos', async () => {
    await exportFichaCegaPdf(carga);
    const [doc, nome] = ultimoDoc();
    expect(nome).toBe('RCV-010126-01.pdf');
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
    expect((await doc.save()).byteLength).toBeGreaterThan(1000);
  });

  it('gera o recebimento com tabela longa (quebra de página), fotos por item e NCR', async () => {
    await exportConferenciaPdf(conferencia(60), { cargaCodigo: 'RCV-010126-01' });
    const [doc, nome] = ultimoDoc();
    expect(nome).toBe('RCM-010126-01.pdf');
    expect(doc.getPageCount()).toBeGreaterThan(1);
  });

  it('gera a NCR com itens, ações e fotos', async () => {
    await exportNaoConformidadePdf(nc);
    const [doc, nome] = ultimoDoc();
    expect(nome).toBe('NCR-010126-01.pdf');
    expect((await doc.save()).byteLength).toBeGreaterThan(1000);
  });

  it('não quebra quando a foto não baixa', async () => {
    globalThis.fetch = vi.fn(async () => { throw new Error('offline'); }) as any;
    await exportFichaCegaPdf(carga);
    expect(vi.mocked(downloadPdf)).toHaveBeenCalledTimes(1);
  });
});
