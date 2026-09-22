import { describe, expect, it, vi, beforeEach } from 'vitest';
import { propostaParaDraft } from './cotacoes';
import { salvarProcessoCotacao } from './cotacoesApi';
import { supabase } from '../db/supabaseClient';
import type { CotacaoProposta, CotacaoPropostaDraft } from '../types';

vi.mock('../db/supabaseClient', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

describe('Cotações — Salvamento e Importação de Propostas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('propostaParaDraft', () => {
    const mockProposta: CotacaoProposta = {
      id: '11111111-1111-1111-1111-111111111111',
      processo_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      arquivo_origem: 'proposta.pdf',
      numero_proposta: '1234',
      data_emissao: '2026-09-20',
      validade_data: null,
      validade_texto: '30 dias',
      fornecedor_razao_social: 'Fornecedor A',
      fornecedor_cnpj: '12345678000195',
      fornecedor_inscricao_estadual: null,
      fornecedor_cidade: 'Salvador',
      fornecedor_uf: 'BA',
      fornecedor_telefone: null,
      cod_vendor: null,
      contato_id: null,
      fornecedor_match: 'cnpj',
      vendedor_nome: null,
      vendedor_email: null,
      vendedor_telefone: null,
      cliente_razao_social: 'TEN',
      cliente_cnpj: null,
      cliente_inscricao_estadual: null,
      cliente_cidade: null,
      cliente_uf: null,
      condicao_pagamento: '30 dias',
      forma_pagamento: 'Boleto',
      prazo_entrega_texto: '10 dias',
      prazo_entrega_dias: 10,
      frete_modalidade: 'CIF',
      transportadora_indicada: null,
      faturamento_minimo: null,
      dados_bancarios_pix: null,
      valor_total_orcamento: 1500,
      observacoes_gerais: null,
      campos_faltantes: [],
      revisado: true,
      extracao_id: null,
      extraido_raw: {} as any,
      criado_por: 'user-1',
      criado_por_nome: 'Usuario',
      created_at: '2026-09-20T10:00:00Z',
      updated_at: '2026-09-20T10:00:00Z',
      busca_norm: '',
      valor_frete: null,
      arquivo_storage_path: null,
      arquivo_mime_type: null,
      arquivo_tamanho_bytes: null,
      arquivo_markdown: null,
      arquivo_markdown_editado_em: null,
      arquivo_markdown_editado_por: null,
      valor_desconto: null,
      itens: [
        {
          id: 'item-uuid-1',
          proposta_id: '11111111-1111-1111-1111-111111111111',
          processo_item_id: 'processo-item-uuid-origem',
          fora_escopo: false,
          desconsiderado: false,
          vinculo_origem: 'manual',
          vinculo_score: 1,
          vinculo_divergencias: [],
          ri: '110033432500040',
          material_code: '1255406',
          item_numero: 1,
          codigo_produto: 'PROD-1',
          descricao_produto: 'LIMA ROT ARVORE',
          marca_fabricante: null,
          unidade_medida: 'UN',
          ncm: null,
          cst: null,
          cfop: null,
          quantidade: 10,
          preco_unitario: 150,
          preco_total_item: 1500,
          aliquota_icms_pct: 18,
          aliquota_pis_pct: 1.65,
          aliquota_cofins_pct: 7.6,
          aliquota_ipi_pct: 0,
          valor_ipi: 0,
          valor_icms_st: 0,
          mapa_selecionado: false,
          divergencias: null,
          peso_unitario_kg: null,
          peso_origem: null,
          frete_item_rateado: null,
          frete_teorico: null,
          codigo_fiscal: null,
          preco_liquido_unitario: 150,
          preco_liquido_total: 1500,
          custo_total_item: 1500,
          prazo_entrega_item_dias: 10,
          garantia_meses: null,
          observacoes: null,
          mapa_ordem: null,
          campos_faltantes: [],
          extraido_raw: null,
          created_at: '2026-09-20T10:00:00Z',
          updated_at: '2026-09-20T10:00:00Z',
        },
      ],
    };

    it('mantém processo_item_id e marca como salvo quando pertence ao mesmo processo', () => {
      const draft = propostaParaDraft(mockProposta);
      expect(draft._salvo).toBe(true);
      expect(draft.id).toBe(mockProposta.id);
      expect(draft.processo_id).toBe(mockProposta.processo_id);
      expect(draft.itens[0].processo_item_id).toBe('processo-item-uuid-origem');
    });

    it('reseta processo_item_id para undefined quando importada para um novo processo diferente', () => {
      const novoPid = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
      const draft = propostaParaDraft(mockProposta, { novoProcessoId: novoPid });

      expect(draft._salvo).toBe(false);
      expect(draft.id).toBeUndefined();
      expect(draft.processo_id).toBe(novoPid);
      expect(draft.itens[0].processo_item_id).toBeUndefined();
    });
  });

  describe('salvarProcessoCotacao', () => {
    const mockDraft: CotacaoPropostaDraft = {
      _key: 'draft-key-1',
      _salvo: false,
      _extraido_em: '2026-09-21T19:00:00Z',
      arquivo_origem: 'teste.pdf',
      numero_proposta: '100',
      data_emissao: '2026-09-21',
      validade_data: null,
      validade_texto: null,
      fornecedor_razao_social: 'Fornecedor B',
      fornecedor_cnpj: '99999999000199',
      fornecedor_inscricao_estadual: null,
      fornecedor_cidade: null,
      fornecedor_uf: null,
      fornecedor_telefone: null,
      cod_vendor: null,
      contato_id: null,
      fornecedor_match: 'nao_encontrado',
      vendedor_nome: null,
      vendedor_email: null,
      vendedor_telefone: null,
      cliente_razao_social: null,
      cliente_cnpj: null,
      cliente_inscricao_estadual: null,
      cliente_cidade: null,
      cliente_uf: null,
      condicao_pagamento: null,
      forma_pagamento: null,
      prazo_entrega_texto: null,
      prazo_entrega_dias: null,
      frete_modalidade: null,
      transportadora_indicada: null,
      faturamento_minimo: null,
      dados_bancarios_pix: null,
      valor_total_orcamento: 100,
      valor_frete: null,
      valor_desconto: null,
      observacoes_gerais: null,
      campos_faltantes: [],
      revisado: true,
      extracao_id: null,
      extraido_raw: {} as any,
      arquivo_storage_path: null,
      arquivo_mime_type: null,
      arquivo_tamanho_bytes: null,
      arquivo_markdown: null,
      arquivo_markdown_editado_em: null,
      arquivo_markdown_editado_por: null,
      itens: [],
    };

    it('rejeita processoId com formato UUID inválido antes de chamar o banco', async () => {
      await expect(
        salvarProcessoCotacao({
          processoId: 'invalido-123',
          propostas: [mockDraft],
          usuarioId: 'u1',
          usuarioNome: 'Usuario',
        })
      ).rejects.toThrow('Identificador do processo de cotação inválido.');
    });

    it('rejeita salvamento se o processo não for encontrado no banco de dados', async () => {
      const validUuid = 'e79ab980-821d-4527-a581-a6f8db49fb18';
      (supabase.from as any).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      });

      await expect(
        salvarProcessoCotacao({
          processoId: validUuid,
          propostas: [mockDraft],
          usuarioId: 'u1',
          usuarioNome: 'Usuario',
        })
      ).rejects.toThrow('não existe mais no banco de dados');
    });

    it('chama RPC salvar_processo_cotacao com sucesso quando o processo existe', async () => {
      const validUuid = 'e79ab980-821d-4527-a581-a6f8db49fb18';
      (supabase.from as any).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: { id: validUuid, numero: 'COT-210926-33' }, error: null }),
          }),
        }),
      });
      (supabase.rpc as any).mockResolvedValue({
        data: { propostas: 1, itens: 0, aprendidos: 0 },
        error: null,
      });

      const res = await salvarProcessoCotacao({
        processoId: validUuid,
        propostas: [mockDraft],
        usuarioId: 'u1',
        usuarioNome: 'Usuario',
      });

      expect(res).toEqual({ propostas: 1, itens: 0, aprendidos: 0 });
      expect(supabase.rpc).toHaveBeenCalledWith('salvar_processo_cotacao', expect.any(Object));
    });

    it('traduz erro de foreign key constraint do PostgreSQL em mensagem amigável', async () => {
      const validUuid = 'e79ab980-821d-4527-a581-a6f8db49fb18';
      (supabase.from as any).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: { id: validUuid, numero: 'COT-210926-33' }, error: null }),
          }),
        }),
      });
      (supabase.rpc as any).mockResolvedValue({
        data: null,
        error: {
          code: '23503',
          message: 'insert or update on table "sup_cotacao_propostas" violates foreign key constraint "cotacao_propostas_processo_id_fkey"',
        },
      });

      await expect(
        salvarProcessoCotacao({
          processoId: validUuid,
          propostas: [mockDraft],
          usuarioId: 'u1',
          usuarioNome: 'Usuario',
        })
      ).rejects.toThrow('O processo de cotação não existe mais no banco de dados.');
    });
  });
});
