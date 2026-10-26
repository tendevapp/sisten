import { describe, expect, it, vi } from 'vitest';

vi.mock('../db/supabaseClient', () => ({ supabase: {} }));

import { ENTREGAS_PENDENTES_COLUNAS, diasEmAberto, montarLinhasEntregasPendentes } from './entregasPendentesPlanilha';
import type { ProjEntregaPendente } from './projetosApi';

const pendente = (extra: Partial<ProjEntregaPendente> = {}): ProjEntregaPendente => ({
  id: 'p1', projeto: 'GW_JACOBINA', chave: 'k', item_id: null, part_number: '404001475', part_number_norm: '404001475',
  cod_sap: '101334', descricao: 'Screw ISO 7380-1-M16X55-8.8', quantidade_esperada: 8, uom: 'und', numero_nf: '87435',
  data_nf: '2026-06-01', pedido: '4100441709', numero_kit: '1', aplicacao: 'ESCADA', fornecedor: 'Atlanta', observacao: 'CAIXA 3',
  linha_planilha: 12, status: 'PENDENTE', resolvido_em: null, resolvido_por_nome: null, resolucao_nf: null,
  resolucao_nota_codigo: null, resolucao_obs: null, criado_por_nome: 'ANDRÉ', created_at: '2026-10-26T18:05:00Z',
  ...extra,
});

describe('montarLinhasEntregasPendentes', () => {
  it('uma linha por item, com as colunas na ordem e a data sem fuso', () => {
    const [l] = montarLinhasEntregasPendentes([pendente()], '2026-10-26');
    expect(Object.keys(l)).toEqual([...ENTREGAS_PENDENTES_COLUNAS]);
    expect(l).toMatchObject({
      'NF': '87435', 'Data NF': '01/06/2026', 'Dias em aberto': 147, 'PO': '4100441709', 'Part number': '404001475',
      'Qtd esperada': 8, 'Número kit': '1', 'Aplicação': 'ESCADA', 'Obs.': 'CAIXA 3', 'Situação': 'Aguardando entrega',
    });
  });

  it('resolvido não conta dias em aberto e traz a baixa', () => {
    const [l] = montarLinhasEntregasPendentes([pendente({ status: 'ENTREGUE', resolucao_nf: '5900', resolucao_nota_codigo: 'ENP-151026-01', resolvido_por_nome: 'JAMILLE' })], '2026-10-26');
    expect([l['Dias em aberto'], l['Situação'], l['NF da chegada'], l['Entrada (ENP)'], l['Resolvido por']]).toEqual(['', 'Chegou', '5900', 'ENP-151026-01', 'JAMILLE']);
  });

  it('campos vazios saem em branco', () => {
    const [l] = montarLinhasEntregasPendentes([pendente({ pedido: null, quantidade_esperada: null, data_nf: null })], '2026-10-26');
    expect([l['PO'], l['Qtd esperada'], l['Data NF'], l['Dias em aberto']]).toEqual(['', '', '', '']);
  });
});

describe('diasEmAberto', () => {
  it('conta dias corridos sem depender do fuso', () => {
    expect(diasEmAberto('2026-08-05', '2026-10-26')).toBe(82);
    expect(diasEmAberto('2026-10-26', '2026-10-26')).toBe(0);
    expect(diasEmAberto(null, '2026-10-26')).toBeNull();
  });
});
