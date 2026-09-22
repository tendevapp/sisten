import { describe, expect, it, vi } from 'vitest';

vi.mock('../../db/localDb', () => ({ localDb: {} }));

import { gerarFichaEpiPdf, textoPdf } from './exportSsmaFichaEpiPdf';
import type { SsmaFichaEpi } from '../ssmaFichaEpiApi';

// PNG 1x1 transparente
const ASSINATURA =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

const ficha = (id: string, data: string, ca: string, descricao: string): SsmaFichaEpi => ({
  id, codigo: `EPI-${id}`, pessoa_id: 'p1', registro: '123', nome: 'JOSÉ DA SILVA', cargo_rh: 'LIXADOR',
  setor: 'PRODUÇÃO\nLIXAMENTO', funcao_id: 'f1', funcao_nome: 'LIXADOR', data_admissao: '2026-01-02', data_demissao: null,
  data_entrega: data, assinatura_colaborador: ASSINATURA, assinado_em: `${data}T10:00:00Z`, observacoes: null,
  status: 'ATIVA', cancelamento_motivo: null, cancelado_por_nome: null, cancelado_em: null, criado_por: 'u1',
  criado_por_nome: 'TST', created_at: `${data}T10:00:00Z`,
  itens: [{
    id: `${id}-i1`, ficha_id: id, ordem: 0, epi_book_id: null, requisito_id: null, grupo_epi: 'LUVA', categoria: 'MAOS',
    descricao, ca, codigo_sap: null, tamanho: null, quantidade: 2, motivo: 1, fora_da_matriz: false,
    data_devolucao: null, devolucao_observacao: null, devolucao_registrada_por: null,
    devolucao_registrada_por_nome: null, devolucao_registrada_em: null,
  }],
});

describe('PDF da ficha de EPI', () => {
  it('deixa o texto em uma linha codificável', () => {
    expect(textoPdf('12345\n67890', ' / ')).toBe('12345 / 67890');
    expect(textoPdf(' A\r\n\tB ')).toBe('A B');
    expect(textoPdf(null)).toBe('');
  });

  it('gera o PDF com CA e descrição de várias linhas (dados do Book)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('sem logo no teste')) as any;

    const fichas = [
      ficha('a', '2026-09-01', '12345\n67890', 'LUVA DE VAQUETA\nCANO CURTO'),
      ...Array.from({ length: 30 }, (_, i) => ficha(`b${i}`, '2026-09-21', '999', `BOTINA ${i}`)),
    ];
    for (const mostrarAssinatura of [true, false]) {
      const pdf = await gerarFichaEpiPdf({ fichas, mostrarAssinatura });
      expect(pdf.bytes.byteLength).toBeGreaterThan(1000);
      expect(pdf.nomeArquivo).toBe('ficha-epi-consolidada-123-jose_da_silva.pdf');
    }
    const unica = await gerarFichaEpiPdf({ fichas: [fichas[0]], mostrarAssinatura: true });
    expect(unica.nomeArquivo).toBe('ficha-epi-EPI-a-jose_da_silva.pdf');
  });
});
