import { describe, expect, it, vi } from 'vitest';

vi.mock('../../db/supabaseClient', () => ({ supabase: {} }));
vi.mock('../../db/localDb', () => ({ localDb: {} }));

import { PDFDocument } from 'pdf-lib';
import { gerarRetiradaSemSaldoPdf } from './exportRetiradaSemSaldoPdf';
import type { SolExtra } from '../solicitacaoExtraApi';

// PNG 1x1
const ASSINATURA =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

const retirada = (extra: Partial<SolExtra> = {}): SolExtra => ({
  id: 'r1', tipo: 'SEM_SALDO', codigo: 'RSS-261026-01', data: '2026-10-26', hora: '08:30:00', turno: null,
  projeto: null, tramo: null,
  itens: [{ material: '1258015', descricao: 'CHAVE FIM CURS ALAV 60X31MM 1NA+1NF', unidade: 'UN', quantidade: 2 }],
  motivo: null, motivo_detalhe: null, area_reparada_m2: null, rugosidade_um: null, observacao: 'Troca na ponte rolante',
  status: 'PENDENTE', doc_sap: null, regularizacao_obs: null, regularizado_por: null, regularizado_por_nome: null, regularizado_em: null,
  retirante_id: 'p1', retirante_nome: 'JOSÉ DA SILVA', retirante_matricula: '12345',
  setor_solicitante_id: '9', setor_solicitante_nome: 'Manutenção',
  aprovacao_status: 'PENDENTE', aprovado_por: null, aprovado_por_nome: null, aprovado_em: null, aprovacao_obs: null,
  requisicao_balcao_codigo: null, fotos: [], assinatura_retirante: null, assinatura_retirante_em: null,
  criado_por: 'u1', criado_por_nome: 'ALMOX', created_at: '2026-10-26T11:30:00Z', updated_at: '2026-10-26T11:30:00Z', excluido_em: null,
  ...extra,
});

describe('PDF da retirada sem saldo', () => {
  it('gera nas três situações de aprovação, com e sem assinatura', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchOriginal = globalThis.fetch;
    // Só a assinatura (data URL) é lida; o logo falha como nos demais testes de PDF.
    globalThis.fetch = vi.fn(async (url: string) => {
      if (String(url).startsWith('data:')) return fetchOriginal(url);
      throw new Error('sem rede no teste');
    }) as any;

    const casos = [
      retirada(),
      retirada({ assinatura_retirante: ASSINATURA, assinatura_retirante_em: '2026-10-26T11:31:00Z' }),
      retirada({ aprovacao_status: 'APROVADA', aprovado_por_nome: 'GESTOR', aprovado_em: '2026-10-26T12:00:00Z', assinatura_retirante: ASSINATURA }),
      retirada({ aprovacao_status: 'REPROVADA', aprovado_por_nome: 'GESTOR', aprovado_em: '2026-10-26T12:00:00Z', aprovacao_obs: 'Sem justificativa' }),
    ];
    const imagens: number[] = [];
    for (const r of casos) {
      const pdf = await gerarRetiradaSemSaldoPdf(r, { incluirFotos: true });
      const doc = await PDFDocument.load(pdf.bytes);
      expect(doc.getPageCount()).toBeGreaterThan(0);
      expect(pdf.nomeArquivo).toBe('rss-261026-01.pdf');
      imagens.push((new TextDecoder('latin1').decode(pdf.bytes).match(/\/Subtype\s*\/Image/g) ?? []).length);
    }
    // A assinatura entra como imagem (PNG com transparência = imagem + máscara) só quando foi coletada.
    expect(imagens[0]).toBe(0);
    expect(imagens[1]).toBeGreaterThan(0);
    expect(imagens[2]).toBeGreaterThan(0);
    expect(imagens[3]).toBe(0);
    globalThis.fetch = fetchOriginal;
  });
});
