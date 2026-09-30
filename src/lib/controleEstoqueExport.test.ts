import { describe, expect, it } from 'vitest';
import type { ControleEstoqueItem } from '../types';
import { criarWorkbookControleEstoque } from './controleEstoqueExport';

const item = {
  material: '000000001234567890',
  centro: 'TEN2',
  descricao: 'PARAFUSO',
  categoria: 'MRO',
  aplicacao: 'FABRICA',
  tipo_gestao: 'ESTOQUE',
  umb: 'UN',
  curva_abc: 'A',
  saldo_total: 60,
  saldo_reposicao: 60,
  valor_estoque: 600,
  preco_medio_sap: 10,
  quantidade_depositos: 1,
  depositos: [{ deposito: '0001', saldo: 60, valor: 600, preco_medio_sap: 10, inativo: false }],
  janela_inicio: '2026-03-03',
  janela_fim: '2026-09-28',
  dias_uteis: 150,
  lead_time_dias: 15,
  intervalo_compra_dias: 30,
  entrada_quantidade: 100,
  entrada_valor: 1000,
  baixa_direta_quantidade: 50,
  baixa_direta_valor: 500,
  producao_quantidade: 0,
  producao_valor: 0,
  consumo_total: 50,
  consumo_valor: 500,
  movimentos_mensais: [{ mes: '2026-09-01', entrada: 100, consumo: 50, valor_entrada: 1000, valor_consumo: 500 }],
  rms_abertas: 1,
  rm_quantidade: 25,
  rms: [{ ri: 'RM-1', requisicao: '1001', item: '10', data: '2026-09-01', requisitante: 'ANA', quantidade: 25, pedido: '450001', deposito: '0001' }],
  pos_abertas: 1,
  po_quantidade_pendente: 10,
  quantidade_recebida: 15,
  ultima_data_recebimento: '2026-09-20',
  pedidos: [{ ri: 'RM-1', requisicao: '1001', pedido: '450001', item: '10', data: '2026-09-05', remessa_prevista: '2026-09-25', data_migo: null, fornecedor: 'FORNECEDOR', deposito: '0001', quantidade_pedida: 25, quantidade_fornecida: 15, quantidade_pendente: 10, valor_brl: 250, quantidade_recebida_mb51: 15, ultima_data_recebimento: '2026-09-20' }],
  quantidade_por_torre: 4,
  quantidade_projetos: 1,
  opcoes_quantidade_por_torre: [{ projeto: 'P1', quantidade_por_torre: 4 }],
  estoque_minimo_override: null,
  estoque_maximo_override: null,
  override_id: null,
  override_justificativa: null,
  override_updated_at: null,
  override_updated_by: null,
  tem_override: false,
  sisten_janela_inicio: '2026-05-01',
  sisten_janela_fim: '2026-09-28',
  sisten_consumo_total: 50,
  sisten_consumo_diario: 0.33,
  sisten_lote_p90: 5,
  sisten_adi: 1.2,
  sisten_cv2: 0.5,
  sisten_lead_dias: 19,
  sisten_lead_proprio: true,
  estoque_importado_em: '2026-09-30T12:33:00Z',
  movimentos_importados_em: '2026-09-28T12:00:00Z',
  ultimo_movimento: '2026-09-28',
  config_id: 'config-1',
  config_updated_at: '2026-09-30T12:00:00Z',
} as ControleEstoqueItem;

describe('controleEstoqueExport', () => {
  it('gera as cinco abas a partir do mesmo dataset filtrado', () => {
    const workbook = criarWorkbookControleEstoque(
      [item],
      { centro: 'TEN2', status: 'ALERTA' },
      { janela_inicio: '2026-03-03', janela_fim: null, lead_time_padrao_dias: 15, intervalo_compra_dias: 30 },
      new Date('2026-09-30T15:00:00Z'),
    );

    expect(workbook.SheetNames).toEqual([
      'Resumo',
      'Controle_Estoque',
      'Movimentacoes',
      'RMs_Pedidos',
      'Parametros',
    ]);
    expect(workbook.Sheets.Controle_Estoque.A2.v).toBe('000000001234567890');
    expect(workbook.Sheets.Controle_Estoque.A2.t).toBe('s');
    expect(workbook.Sheets.Movimentacoes.A2.v).toBe('000000001234567890');
    expect(workbook.Sheets.RMs_Pedidos.A2.v).toBe('000000001234567890');
  });
});
