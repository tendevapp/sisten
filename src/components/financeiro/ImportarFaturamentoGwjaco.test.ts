/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { paraPatch } from './ImportarFaturamentoGwjaco';
import type { LinhaImportadaFaturamento } from '../../lib/finFaturamentoImportacao';

function linha(over: Partial<LinhaImportadaFaturamento> = {}): LinhaImportadaFaturamento {
  return {
    linha: 1,
    torre_numero: 1,
    tramo: 'T1',
    serie: 3143,
    codigo_cliente: 'S1 SEC GW5S120M',
    part_number: 'PN-001',
    nota_fiscal: '21016-1',
    data_faturado: '2026-08-31',
    semana_faturamento: 36,
    data_expedido: '2026-09-04',
    ...over,
  };
}

describe('paraPatch — substituição completa na reimportação', () => {
  it('manda null explícito (não omite a chave) para célula em branco na planilha', () => {
    const patch = paraPatch(linha({ nota_fiscal: null, data_expedido: null }));
    // `in` confere presença da chave — precisa existir mesmo valendo null,
    // senão a RPC (que só mexe no que está `? 'chave'` no jsonb) mantém o
    // valor antigo em vez de limpar.
    expect('nota_fiscal' in patch).toBe(true);
    expect(patch.nota_fiscal).toBeNull();
    expect('data_expedido' in patch).toBe(true);
    expect(patch.data_expedido).toBeNull();
  });

  it('substitui as 9 colunas da planilha por completo, mesmo as que zeraram', () => {
    const patch = paraPatch(linha({
      serie: null, codigo_cliente: null, part_number: null, nota_fiscal: null,
      data_faturado: null, semana_faturamento: null, data_expedido: null,
    }));
    expect(patch).toEqual({
      torre_numero: 1,
      tramo: 'T1',
      serie: null,
      codigo_cliente: null,
      part_number: null,
      nota_fiscal: null,
      data_faturado: null,
      semana_faturamento: null,
      data_expedido: null,
    });
  });

  // restricao/observacao não vêm da planilha — ficam fora do patch de
  // propósito, para a RPC preservar o que foi lançado manualmente na tela
  // (decisão confirmada com o usuário: reimportar não deve apagar isso).
  it('nunca inclui restricao nem observacao — campos que não vêm da planilha', () => {
    const patch = paraPatch(linha());
    expect('restricao' in patch).toBe(false);
    expect('observacao' in patch).toBe(false);
    expect('data_tramos_previstos' in patch).toBe(false);
  });
});
