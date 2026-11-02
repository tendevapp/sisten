import { describe, expect, it } from 'vitest';
import type { ItemInventario } from './inventarioCiclico';
import { divergenciasDosInventarios, itensParaRecontagem, type InventarioRowBase } from './inventarioDivergencias';

const item = (p: Partial<ItemInventario>): ItemInventario => ({
  id: 'i', ordem: 1, material: '1434332', descricao: 'LIXA', unidade: 'UN', deposito: '0001', classe: 'A',
  status: 'divergente', saldo_sistema: 10, qtd_final: 8, diferenca: -2, alerta: null, encerrado_em: '2026-10-20T10:00:00Z',
  contagens: [{ id: 'c', numero: 1, quantidade: 8, divergente: true, endereco_encontrado: null, validade: null, observacao: null, contado_por_nome: 'ANA', created_at: '2026-10-20T09:00:00Z' }],
  ...p,
});
const inv = (p: Partial<InventarioRowBase>): InventarioRowBase => ({ id: 'v', codigo: 'INV-1', data: '2026-10-20', status: 'concluido', itens: [], ...p });

describe('divergenciasDosInventarios', () => {
  it('lista o divergente com contado, sistema, diferença e quem contou', () => {
    const [l] = divergenciasDosInventarios([inv({ itens: [item({})] })]);
    expect(l).toMatchObject({ material: '1434332', contado: 8, sistema: 10, diferenca: -2, contadoPor: 'ANA', atual: true, emRecontagem: null });
  });

  it('divergência que já foi recontada e conferiu depois não é a atual', () => {
    const linhas = divergenciasDosInventarios([
      inv({ itens: [item({ id: 'a' })] }),
      inv({ id: 'w', codigo: 'INV-2', data: '2026-10-25', itens: [item({ id: 'b', status: 'conferido', encerrado_em: '2026-10-25T10:00:00Z' })] }),
    ]);
    expect(linhas).toHaveLength(1);
    expect(linhas[0].atual).toBe(false);
  });

  it('aponta o inventário aberto em que o item já está para contar', () => {
    const linhas = divergenciasDosInventarios([
      inv({ itens: [item({ id: 'a' })] }),
      inv({ id: 'w', codigo: 'INV-3', status: 'aberto', itens: [item({ id: 'b', status: 'pendente', encerrado_em: null, contagens: [] })] }),
    ]);
    expect(linhas[0].emRecontagem).toBe('INV-3');
    expect(itensParaRecontagem(linhas)).toEqual([]);
  });

  it('item fora da ZL0024 atual não vai para a recontagem', () => {
    const linhas = divergenciasDosInventarios([inv({ itens: [item({})] })], new Set(['999|0001']));
    expect(linhas[0].naZl0024).toBe(false);
    expect(itensParaRecontagem(linhas)).toEqual([]);
  });

  it('recontagem leva cada material × depósito uma vez', () => {
    const linhas = divergenciasDosInventarios([
      inv({ itens: [item({ id: 'a' })] }),
      inv({ id: 'w', codigo: 'INV-2', itens: [item({ id: 'b', material: '0001434332', encerrado_em: '2026-10-22T10:00:00Z' })] }),
    ]);
    expect(itensParaRecontagem(linhas)).toHaveLength(1);
  });
});
