/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  filtrarEAgruparZl0024Consumiveis,
  converterItemCatalogoEmAnexo,
  buscarMateriaisParaAdicao,
  pesquisarCatalogoSapOnline,
  PREFIXO_CAT_ITEM,
  type CatalogoItem,
  type DadosCatalogoCompleto,
} from './almoxCatalogoApi';
import type { EstoqueItem, CadastroGrupoMercadoria } from '../types';

const storageMock = new Map<string, string>();
const localStorageMock = {
  getItem: (k: string) => storageMock.get(k) ?? null,
  setItem: (k: string, v: string) => storageMock.set(k, String(v)),
  removeItem: (k: string) => storageMock.delete(k),
  clear: () => storageMock.clear(),
};

if (typeof globalThis.localStorage === 'undefined') {
  Object.defineProperty(globalThis, 'localStorage', {
    value: localStorageMock,
    writable: true,
  });
}

describe('almoxCatalogoApi - Catálogo de Itens do Almoxarifado', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storageMock.clear();
  });

  const mockGrupos: CadastroGrupoMercadoria[] = [
    {
      codigo: 'B01',
      denominacao: 'ABRASIVOS',
      classificacao_nivel1: 'CONSUMÍVEL',
      classificacao_nivel2: 'MRO - Manutenção',
    },
    {
      codigo: 'M11',
      denominacao: 'EPI E UNIFORMES',
      classificacao_nivel1: 'CONSUMÍVEL',
      classificacao_nivel2: 'EPI - Segurança',
    },
    {
      codigo: 'E01',
      denominacao: 'AÇO ESTRUTURAL',
      classificacao_nivel1: 'ESTRUTURAL',
      classificacao_nivel2: 'Estruturas Metálicas',
    },
    {
      codigo: 'S01',
      denominacao: 'LOCAÇÃO DE GUINDASTES',
      classificacao_nivel1: 'SERVIÇO',
      classificacao_nivel2: 'Locação de Equipamentos',
    },
  ];

  const mockEstoque: EstoqueItem[] = [
    // Consumível válido com saldo (depósito 0001)
    {
      id: 1,
      material: '200001',
      txt_breve_material: 'DISCO DE CORTE 7 POL',
      texto_pedido_compra: 'DISCO DE CORTE ABRASIVO EXTRA FINO',
      grp_mercad: 'B01',
      grupo_mercadorias: 'ABRASIVOS',
      quantidade: 50,
      deposito: '0001',
      umb: 'UN',
    },
    // Mesmo material consumível em outro depósito (depósito 0002) - deve agrupar e somar saldo
    {
      id: 2,
      material: '200001',
      txt_breve_material: 'DISCO DE CORTE 7 POL',
      texto_pedido_compra: 'DISCO DE CORTE ABRASIVO EXTRA FINO',
      grp_mercad: 'B01',
      grupo_mercadorias: 'ABRASIVOS',
      quantidade: 30,
      deposito: '0002',
      umb: 'UN',
    },
    // Consumível válido (EPI)
    {
      id: 3,
      material: '200002',
      txt_breve_material: 'LUVA VAQUETA CANO CURTO',
      texto_pedido_compra: 'LUVA DE PROTECAO EM VAQUETA CA 12345',
      grp_mercad: 'M11',
      grupo_mercadorias: 'EPI E UNIFORMES',
      quantidade: 100,
      deposito: '0001',
      umb: 'PAR',
    },
    // Item com saldo ZERO - deve ser ignorado
    {
      id: 4,
      material: '200003',
      txt_breve_material: 'ÓCULOS DE SEGURANÇA',
      grp_mercad: 'M11',
      quantidade: 0,
      deposito: '0001',
      umb: 'UN',
    },
    // Item com saldo negativo - deve ser ignorado
    {
      id: 5,
      material: '200004',
      txt_breve_material: 'MÁSCARA PFF2',
      grp_mercad: 'M11',
      quantidade: -2,
      deposito: '0001',
      umb: 'UN',
    },
    // Item de PROJETO (iniciado em 100000) - deve ser estritamente removido
    {
      id: 6,
      material: '100000000000047981',
      txt_breve_material: 'CHAPA DE AÇO ESTRUTURAL TRAMO',
      grp_mercad: 'B01',
      quantidade: 15,
      deposito: '0001',
      umb: 'PC',
    },
    // Outro item de projeto (código curto 10000012)
    {
      id: 7,
      material: '10000012',
      txt_breve_material: 'FLANGE TRAMO SUPERIOR',
      grp_mercad: 'B01',
      quantidade: 8,
      deposito: '0001',
      umb: 'PC',
    },
    // Item ESTRUTURAL (não consumível) - deve ser filtrado quando apenasConsumiveis=true
    {
      id: 8,
      material: '300001',
      txt_breve_material: 'VIGA I METÁLICA',
      grp_mercad: 'E01',
      grupo_mercadorias: 'AÇO ESTRUTURAL',
      quantidade: 20,
      deposito: '0001',
      umb: 'M',
    },
  ];

  const mockCatalogo: CatalogoItem[] = [
    {
      id: 'cat-uuid-1',
      codigo_registro: 'CAT-290926-01',
      codigo_sap: '200001',
      descricao: 'DISCO DE CORTE 7 POL',
      texto_tecnico: 'DISCO DE CORTE ABRASIVO EXTRA FINO',
      grp_mercad: 'B01',
      grupo_mercadorias: 'ABRASIVOS',
      classificacao_nivel1: 'CONSUMÍVEL',
      classificacao_nivel2: 'MRO - Manutenção',
      umb: 'UN',
      saldo_zl0024: 80,
      imagem_path: 'almox-catalogo/material-200001.jpg',
      imagem_nome: 'disco.jpg',
      imagem_mime: 'image/jpeg',
      imagem_tamanho: 102400,
      observacao: 'Item padrão de uso diário',
      ativo: true,
      criado_por: 'user-1',
      criado_por_nome: 'Almoxarife Teste',
      atualizado_por: null,
      atualizado_por_nome: null,
      created_at: '2026-09-29T10:00:00Z',
      updated_at: '2026-09-29T10:00:00Z',
      url_imagem: 'https://storage.supabase/almox-catalogo/material-200001.jpg',
    },
  ];

  it('deve usar o prefixo oficial CAT para os códigos de registro de formulário (Regra 2)', () => {
    expect(PREFIXO_CAT_ITEM).toBe('CAT');
  });

  it('deve filtrar itens com saldo > 0 da ZL0024, removendo projetos 100000 e mantendo apenas consumíveis', () => {
    const resultado = filtrarEAgruparZl0024Consumiveis(mockEstoque, mockGrupos, mockCatalogo, true);

    // Devem sobrar apenas os 2 materiais consumíveis com saldo positivo (200001 e 200002)
    expect(resultado).toHaveLength(2);

    const disco = resultado.find(i => i.codigo_sap === '200001');
    expect(disco).toBeDefined();
    // 50 (deposito 0001) + 30 (deposito 0002) = 80 total
    expect(disco?.saldo_total).toBe(80);
    expect(disco?.depositos).toContain('0001');
    expect(disco?.depositos).toContain('0002');
    expect(disco?.classificacao_nivel1).toBe('CONSUMÍVEL');
    expect(disco?.classificacao_nivel2).toBe('MRO - Manutenção');
    expect(disco?.tem_foto).toBe(true);
    expect(disco?.item_catalogo?.codigo_registro).toBe('CAT-290926-01');

    const luva = resultado.find(i => i.codigo_sap === '200002');
    expect(luva).toBeDefined();
    expect(luva?.saldo_total).toBe(100);
    expect(luva?.classificacao_nivel1).toBe('CONSUMÍVEL');
    expect(luva?.classificacao_nivel2).toBe('EPI - Segurança');
    expect(luva?.tem_foto).toBe(false);

    // Itens de projeto (100000...) NUNCA podem aparecer
    expect(resultado.some(i => i.codigo_sap.startsWith('100000'))).toBe(false);

    // Itens com saldo zero (200003) ou negativo (200004) NUNCA podem aparecer
    expect(resultado.some(i => i.codigo_sap === '200003')).toBe(false);
    expect(resultado.some(i => i.codigo_sap === '200004')).toBe(false);

    // Item estrutural (300001) não entra pois não é consumível
    expect(resultado.some(i => i.codigo_sap === '300001')).toBe(false);
  });

  it('deve converter item do catálogo em anexo de compra compativel com RequestAttachment', () => {
    const anexo = converterItemCatalogoEmAnexo(mockCatalogo[0]);

    expect(anexo.material_code).toBe('200001');
    expect(anexo.name).toBe('disco.jpg');
    expect(anexo.storage_path).toBe('almox-catalogo/material-200001.jpg');
    expect(anexo.mime_type).toBe('image/jpeg');
    expect(anexo.request_id).toBe('almox-catalogo-cat-uuid-1');
  });

  it('deve lançar erro ao converter em anexo se o item não tiver imagem', () => {
    const itemSemFoto = { ...mockCatalogo[0], imagem_path: null };
    expect(() => converterItemCatalogoEmAnexo(itemSemFoto)).toThrow(
      'O item precisa ter código SAP e foto para entrar no banco de imagens.'
    );
  });

  it('deve buscar materiais por código SAP ou descrição para adicionar ao catálogo com buscarMateriaisParaAdicao', () => {
    // 1. Busca por código SAP
    const porCodigo = buscarMateriaisParaAdicao('200001', mockEstoque, mockGrupos, mockCatalogo);
    expect(porCodigo.length).toBeGreaterThan(0);
    expect(porCodigo[0].codigo_sap).toBe('200001');
    expect(porCodigo[0].ja_no_catalogo).toBe(true);
    expect(porCodigo[0].tem_foto).toBe(true);
    expect(porCodigo[0].saldo_total).toBe(80);

    // 2. Busca por descrição
    const porDescricao = buscarMateriaisParaAdicao('LUVA', mockEstoque, mockGrupos, mockCatalogo);
    expect(porDescricao.length).toBeGreaterThan(0);
    expect(porDescricao[0].codigo_sap).toBe('200002');
    expect(porDescricao[0].descricao).toContain('LUVA VAQUETA');
    expect(porDescricao[0].tem_foto).toBe(false);

    // 3. Permite buscar item mesmo com saldo zero para permitir cadastrar a foto
    const comSaldoZero = buscarMateriaisParaAdicao('200003', mockEstoque, mockGrupos, mockCatalogo);
    expect(comSaldoZero.length).toBeGreaterThan(0);
    expect(comSaldoZero[0].codigo_sap).toBe('200003');
    expect(comSaldoZero[0].saldo_total).toBe(0);

    // 4. Exclui estritamente itens de projeto iniciados em 100000
    const buscaProjeto = buscarMateriaisParaAdicao('100000', mockEstoque, mockGrupos, mockCatalogo);
    expect(buscaProjeto).toHaveLength(0);
  });

  it('deve puxar automaticamente fotos de itens que já existem no Book de EPIs', () => {
    const mockEpis = new Map([
      ['200002', {
        imagem_path: 'epis/luva-vaqueta-12345.jpg',
        ca: '12345',
        descricao: 'LUVA VAQUETA CANO CURTO',
        url_imagem: 'https://storage.supabase/ssma-book-epis/epis/luva.jpg',
      }],
    ]);

    const resultado = filtrarEAgruparZl0024Consumiveis(mockEstoque, mockGrupos, mockCatalogo, true, mockEpis);
    const luva = resultado.find(i => i.codigo_sap === '200002');

    expect(luva).toBeDefined();
    expect(luva?.tem_foto).toBe(true);
    expect(luva?.origem_foto).toBe('book_epi');
    expect(luva?.url_foto).toBe('https://storage.supabase/ssma-book-epis/epis/luva.jpg');
    expect(luva?.ca_epi).toBe('12345');
  });

  it('deve pesquisar online no catálogo SAP trazendo todas as informações cadastrais e fotos associadas', async () => {
    const mockDados: DadosCatalogoCompleto = {
      itens: [],
      estoqueCompleto: mockEstoque,
      grupos: mockGrupos,
      itensCatalogo: mockCatalogo,
      mapaEpis: new Map([
        ['200002', {
          imagem_path: 'epis/luva.jpg',
          ca: '9999',
          descricao: 'LUVA VAQUETA',
          url_imagem: 'https://storage/luva.jpg',
        }],
      ]),
    };

    // 1. Pesquisa por código SAP
    const resultadoCodigo = await pesquisarCatalogoSapOnline('200001', mockDados);
    expect(resultadoCodigo.length).toBeGreaterThan(0);
    expect(resultadoCodigo[0].codigo_sap).toBe('200001');
    expect(resultadoCodigo[0].descricao).toBe('DISCO DE CORTE 7 POL');
    expect(resultadoCodigo[0].texto_tecnico).toBe('DISCO DE CORTE ABRASIVO EXTRA FINO');
    expect(resultadoCodigo[0].umb).toBe('UN');
    expect(resultadoCodigo[0].ja_no_catalogo).toBe(true);
    expect(resultadoCodigo[0].tem_foto).toBe(true);

    // 2. Pesquisa por descrição
    const resultadoDesc = await pesquisarCatalogoSapOnline('disco', mockDados);
    expect(resultadoDesc.length).toBeGreaterThan(0);
    expect(resultadoDesc[0].codigo_sap).toBe('200001');

    // 3. Pesquisa material com foto do Book de EPIs
    const resultadoEpi = await pesquisarCatalogoSapOnline('200002', mockDados);
    expect(resultadoEpi.length).toBeGreaterThan(0);
    expect(resultadoEpi[0].tem_foto).toBe(true);
    expect(resultadoEpi[0].origem_foto).toBe('book_epi');
    expect(resultadoEpi[0].ca_epi).toBe('9999');
  });

  it('deve salvar e listar itens do catálogo localmente sem disparar chamadas REST para alm_catalogo_itens', async () => {
    const {
      salvarItensCatalogoLocal,
      listarItensCatalogo,
      buscarFotoCatalogoPorCodigoSap,
      buscarFotosCatalogoPorCodigosSap,
      salvarListaFixaCatalogoLocal,
      obterListaFixaCatalogoLocal,
    } = await import('./almoxCatalogoApi');

    // Limpa estado local de teste
    localStorage.clear();

    const mockItem: CatalogoItem = {
      id: 'cat-test-1',
      codigo_registro: 'CAT-290926-05',
      codigo_sap: '200099',
      descricao: 'ABAFADOR DE RUIDO',
      texto_tecnico: 'PROTETOR AUDITIVO TIPO CONCHA',
      grp_mercad: 'M11',
      grupo_mercadorias: 'EPI E UNIFORMES',
      classificacao_nivel1: 'CONSUMÍVEL',
      classificacao_nivel2: 'EPI - Segurança',
      umb: 'UN',
      saldo_zl0024: 15,
      imagem_path: 'almox-catalogo/material-200099.jpg',
      imagem_nome: 'abafador.jpg',
      imagem_mime: 'image/jpeg',
      imagem_tamanho: 50000,
      observacao: null,
      ativo: true,
      criado_por: 'u1',
      criado_por_nome: 'Testador',
      atualizado_por: null,
      atualizado_por_nome: null,
      created_at: '2026-09-29T12:00:00Z',
      updated_at: '2026-09-29T12:00:00Z',
      url_imagem: 'https://fake-storage/abafador.jpg',
    };

    salvarItensCatalogoLocal([mockItem]);

    // 1. listarItensCatalogo deve ler de local sem erro
    const itens = await listarItensCatalogo();
    expect(itens).toHaveLength(1);
    expect(itens[0].codigo_sap).toBe('200099');
    expect(itens[0].codigo_registro).toBe('CAT-290926-05');

    // 2. buscarFotoCatalogoPorCodigoSap encontra no catálogo local
    const foto = await buscarFotoCatalogoPorCodigoSap('200099');
    expect(foto).toBeDefined();
    expect(foto?.codigo_sap).toBe('200099');
    expect(foto?.imagem_path).toBe('almox-catalogo/material-200099.jpg');

    // 3. buscarFotosCatalogoPorCodigosSap encontra em lote
    const mapa = await buscarFotosCatalogoPorCodigosSap(['200099']);
    expect(mapa.has('200099')).toBe(true);

    // 4. Salvar e recuperar lista fixa do catálogo
    salvarListaFixaCatalogoLocal([
      {
        codigo_sap: '200099',
        descricao: 'ABAFADOR DE RUIDO',
        texto_tecnico: '',
        grp_mercad: 'M11',
        grupo_mercadorias: 'EPI E UNIFORMES',
        classificacao_nivel1: 'CONSUMÍVEL',
        classificacao_nivel2: 'EPI - Segurança',
        saldo_total: 15,
        umb: 'UN',
        depositos: ['0001'],
        tem_foto: true,
        url_foto: 'https://fake-storage/abafador.jpg',
      },
    ]);

    const fixa = obterListaFixaCatalogoLocal();
    expect(fixa).toHaveLength(1);
    expect(fixa[0].codigo_sap).toBe('200099');
  });
});
