import { beforeEach, describe, expect, it, vi } from 'vitest';

const { consultar, consultas } = vi.hoisted(() => ({
  consultar: vi.fn(), consultas: [] as { tabela: string; filtros: [string, ...unknown[]][] }[],
}));
vi.mock('../db/supabaseClient', () => ({ supabase: { from: (tabela: string) => {
  const filtros: [string, ...unknown[]][] = [];
  consultas.push({ tabela, filtros });
  const query: Record<string, any> = {};
  for (const metodo of ['select', 'eq', 'is', 'in', 'order']) query[metodo] = (...args: unknown[]) => {
    filtros.push([metodo, ...args]); return query;
  };
  query.range = (de: number, ate: number) => consultar(tabela, de, ate);
  return query;
} } }));

import { listarClassificacaoEpiRetiradas, listarRetiradasSemSaldo } from './solicitacaoExtraApi';

beforeEach(() => { consultar.mockReset(); consultas.length = 0; });

describe('leitura para relatório de retiradas sem saldo', () => {
  it('pagina além de 1000 e mantém restrição de setor em todas as páginas', async () => {
    consultar.mockImplementation((_tabela, de) => Promise.resolve({ data: de === 0
      ? Array.from({ length: 1000 }, (_, i) => ({ id: String(i), tipo: 'SEM_SALDO' }))
      : [{ id: '1000', tipo: 'SEM_SALDO' }], error: null }));
    expect(await listarRetiradasSemSaldo({ setores: ['producao'], aprovacao: 'APROVADA' })).toHaveLength(1001);
    expect(consultar.mock.calls.map(c => c.slice(1))).toEqual([[0, 999], [1000, 1999]]);
    for (const { filtros } of consultas) {
      expect(filtros).toContainEqual(['in', 'setor_solicitante_id', ['producao']]);
      expect(filtros).toContainEqual(['eq', 'aprovacao_status', 'APROVADA']);
      expect(filtros).toContainEqual(['is', 'excluido_em', null]);
      expect(filtros).toContainEqual(['order', 'id']);
    }
  });

  it('não transforma lista vazia de setores em acesso geral', async () => {
    consultar.mockResolvedValue({ data: [], error: null });
    await listarRetiradasSemSaldo({ setores: [] });
    expect(consultas[0].filtros).toContainEqual(['in', 'setor_solicitante_id', ['__nenhum__']]);
  });

  it('usa classificação cadastral e Book, sem depender da descrição ou de foto', async () => {
    consultar.mockImplementation((tabela) => Promise.resolve({ data: tabela === 'ssma_book_epis'
      ? [{ codigo_sap: '0001355905' }]
      : [
        { codigo_sap: '1355905', grp_mercad: 'OUTRO' },
        { codigo_sap: 'epi-grupo', grp_mercad: 'M11003002' },
        { codigo_sap: 'epi-classe', classificacao_nivel2: 'EPI' },
        { codigo_sap: '1046700', grupo_mercadorias: 'FERRAMENTAS' },
        { codigo_sap: 'sem-classe', grp_mercad: null },
      ], error: null }));
    const mapa = await listarClassificacaoEpiRetiradas();
    expect(mapa.get('1355905')).toBe(true);
    expect(mapa.get('epi-grupo')).toBe(true);
    expect(mapa.get('epi-classe')).toBe(true);
    expect(mapa.get('1046700')).toBe(false);
    expect(mapa.has('sem-classe')).toBe(false);
  });

  it('propaga falhas de classificação para a tela não exibir falsa ausência de EPI', async () => {
    consultar.mockResolvedValue({ data: null, error: { message: 'Sem acesso' } });
    await expect(listarClassificacaoEpiRetiradas()).rejects.toThrow('Sem acesso');
  });
});
