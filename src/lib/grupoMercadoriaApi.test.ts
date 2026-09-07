/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as api from './grupoMercadoriaApi';
import { supabase } from '../db/supabaseClient';

vi.mock('../db/supabaseClient', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

describe('grupoMercadoriaApi - Gestão de Níveis de Grupos de Mercadorias', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deve conter a taxonomia padrão de Nível 1 completa (CONSUMÍVEL, ESTRUTURAL, FRETE, IMOBILIZADO, SERVIÇO)', () => {
    const niveis1 = Object.keys(api.TAXONOMIA_NIVEIS_PADRAO);
    expect(niveis1).toContain('CONSUMÍVEL');
    expect(niveis1).toContain('ESTRUTURAL');
    expect(niveis1).toContain('FRETE');
    expect(niveis1).toContain('IMOBILIZADO');
    expect(niveis1).toContain('SERVIÇO');
  });

  it('deve conter subcategorias oficiais corretas associadas aos seus respectivos Níveis 1', () => {
    expect(api.TAXONOMIA_NIVEIS_PADRAO['CONSUMÍVEL']).toContain('MRO - Manutenção');
    expect(api.TAXONOMIA_NIVEIS_PADRAO['CONSUMÍVEL']).toContain('EPI - Segurança');
    expect(api.TAXONOMIA_NIVEIS_PADRAO['CONSUMÍVEL']).toContain('Materiais de Construção');
    expect(api.TAXONOMIA_NIVEIS_PADRAO['CONSUMÍVEL']).toContain('Hospitalar');
    expect(api.TAXONOMIA_NIVEIS_PADRAO['CONSUMÍVEL']).toContain('Medicamentos');

    expect(api.TAXONOMIA_NIVEIS_PADRAO['ESTRUTURAL']).toContain('Estruturas Metálicas');
    expect(api.TAXONOMIA_NIVEIS_PADRAO['ESTRUTURAL']).toContain('Tubulação e Conexões');
    expect(api.TAXONOMIA_NIVEIS_PADRAO['ESTRUTURAL']).toContain('Elétrica e Instrumentação');
    expect(api.TAXONOMIA_NIVEIS_PADRAO['ESTRUTURAL']).toContain('Materiais de Construção');

    expect(api.TAXONOMIA_NIVEIS_PADRAO['FRETE']).toContain('Frete e Logística');

    expect(api.TAXONOMIA_NIVEIS_PADRAO['IMOBILIZADO']).toContain('Veículos e Transporte');
    expect(api.TAXONOMIA_NIVEIS_PADRAO['IMOBILIZADO']).toContain('Máquinas e Equipamentos');

    expect(api.TAXONOMIA_NIVEIS_PADRAO['SERVIÇO']).toContain('Subempreiteiros - Obras Civis');
    expect(api.TAXONOMIA_NIVEIS_PADRAO['SERVIÇO']).toContain('Manutenção e Assistência Técnica');
    expect(api.TAXONOMIA_NIVEIS_PADRAO['SERVIÇO']).toContain('Manutenção de Frotas e Veículos');
    expect(api.TAXONOMIA_NIVEIS_PADRAO['SERVIÇO']).toContain('Locação de Equipamentos');
  });

  it('deve listar grupos de mercadoria da tabela cadastro_grupo_mercadoria', async () => {
    const fakeData = [
      {
        codigo: 'B01',
        denominacao: 'ABRASIVOS',
        denominacao2: 'ABRASIVOS',
        classificacao_nivel1: 'CONSUMÍVEL',
        classificacao_nivel2: 'MRO - Manutenção',
        codigo_pai: null,
      },
    ];

    const rangeMock = vi.fn().mockResolvedValue({ data: fakeData, count: 1, error: null });
    const orderMock = vi.fn().mockReturnValue({ range: rangeMock });
    const selectMock = vi.fn().mockReturnValue({ order: orderMock });

    (supabase.from as any).mockReturnValue({ select: selectMock });

    const resultado = await api.listarGruposMercadorias({ pagina: 1, itensPorPagina: 50 });

    expect(supabase.from).toHaveBeenCalledWith('cadastro_grupo_mercadoria');
    expect(resultado.itens).toHaveLength(1);
    expect(resultado.itens[0].codigo).toBe('B01');
    expect(resultado.itens[0].classificacao_nivel1).toBe('CONSUMÍVEL');
    expect(resultado.itens[0].classificacao_nivel2).toBe('MRO - Manutenção');
    expect(resultado.total).toBe(1);
  });

  it('deve atualizar nivel 1 e nivel 2 de um grupo de mercadoria na tabela mestre', async () => {
    const fakeUpdated = {
      codigo: 'B0401',
      denominacao: 'AREIA',
      denominacao2: 'AREIA',
      classificacao_nivel1: 'CONSUMÍVEL',
      classificacao_nivel2: 'Materiais de Construção',
    };

    const singleMock = vi.fn().mockResolvedValue({ data: fakeUpdated, error: null });
    const selectMock = vi.fn().mockReturnValue({ single: singleMock });
    const eqMock = vi.fn().mockReturnValue({ select: selectMock });
    const updateMock = vi.fn().mockReturnValue({ eq: eqMock });

    (supabase.from as any).mockReturnValue({ update: updateMock });

    const res = await api.atualizarGrupoMercadoria('B0401', {
      classificacao_nivel1: 'CONSUMÍVEL',
      classificacao_nivel2: 'Materiais de Construção',
    });

    expect(supabase.from).toHaveBeenCalledWith('cadastro_grupo_mercadoria');
    expect(updateMock).toHaveBeenCalledWith({
      classificacao_nivel1: 'CONSUMÍVEL',
      classificacao_nivel2: 'Materiais de Construção',
    });
    expect(eqMock).toHaveBeenCalledWith('codigo', 'B0401');
    expect(res.classificacao_nivel2).toBe('Materiais de Construção');
  });

  it('deve atualizar grupos em lote', async () => {
    const inMock = vi.fn().mockResolvedValue({ count: 2, error: null });
    const updateMock = vi.fn().mockReturnValue({ in: inMock });

    (supabase.from as any).mockReturnValue({ update: updateMock });

    const total = await api.atualizarGruposEmLote(['B01', 'B0101'], {
      classificacao_nivel1: 'CONSUMÍVEL',
      classificacao_nivel2: 'MRO - Manutenção',
    });

    expect(supabase.from).toHaveBeenCalledWith('cadastro_grupo_mercadoria');
    expect(updateMock).toHaveBeenCalledWith({
      classificacao_nivel1: 'CONSUMÍVEL',
      classificacao_nivel2: 'MRO - Manutenção',
    });
    expect(inMock).toHaveBeenCalledWith('codigo', ['B01', 'B0101']);
    expect(total).toBe(2);
  });

  it('deve consultar e mesclar subcategorias dinâmicas do banco com os padrões', async () => {
    const fakeRows = [
      { classificacao_nivel1: 'CONSUMÍVEL', classificacao_nivel2: 'Minha Nova Subcategoria Custom' },
    ];
    const notMock = vi.fn().mockResolvedValue({ data: fakeRows, error: null });
    const selectMock = vi.fn().mockReturnValue({ not: notMock });

    (supabase.from as any).mockReturnValue({ select: selectMock });

    const mapa = await api.obterSubcategoriasAgrupadas();

    expect(supabase.from).toHaveBeenCalledWith('cadastro_grupo_mercadoria');
    expect(mapa['CONSUMÍVEL']).toContain('Minha Nova Subcategoria Custom');
    expect(mapa['CONSUMÍVEL']).toContain('MRO - Manutenção');
  });
});

