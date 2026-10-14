import { describe, expect, it } from 'vitest';
import { agruparBookEpis, camposEditaveisBookEpi, chaveVarianteBookEpi, converterEpiEmAnexo, mensagemErroBookEpis } from './ssmaBookEpisApi';

describe('chaveVarianteBookEpi', () => {
  it('usa código SAP e CA para não fundir tamanhos ou certificados diferentes', () => {
    expect(chaveVarianteBookEpi('1026092', '32569')).toBe('1026092|32569');
    expect(chaveVarianteBookEpi('1026092', '42165')).toBe('1026092|42165');
  });

  it('converte uma foto de EPI em uma imagem selecionável no banco de Compras', () => {
    const anexo = converterEpiEmAnexo({
      id: 'epi-1',
      codigo_sap: '1026092',
      descricao_epi: 'Botina branca',
      imagem_path: 'epis/epi-1/foto.jpg',
      imagem_nome: 'botina.jpg',
      imagem_mime: 'image/jpeg',
      imagem_tamanho: 1200,
      updated_at: '2026-09-21T17:00:00.000Z',
    });

    expect(anexo).toMatchObject({
      id: 'epi-imagem-epi-1',
      material_code: '1026092',
      storage_path: 'epis/epi-1/foto.jpg',
      name: 'botina.jpg',
      mime_type: 'image/jpeg',
    });
  });
});

describe('agruparBookEpis', () => {
  it('mostra uma ficha de EPI, sem esconder suas variantes SAP', () => {
    const grupos = agruparBookEpis([
      { id: '1', categoria: 'Membros Inferiores', grupo_epi: 'Botina', codigo_sap: '1026092', tamanho: '36' },
      { id: '2', categoria: 'Membros Inferiores', grupo_epi: 'Botina', codigo_sap: '1026093', tamanho: '37' },
    ]);

    expect(grupos).toEqual([expect.objectContaining({ categoria: 'Membros Inferiores', grupoEpi: 'Botina', itens: expect.arrayContaining([
      expect.objectContaining({ codigo_sap: '1026092' }),
      expect.objectContaining({ codigo_sap: '1026093' }),
    ]) })]);
  });
});

describe('mensagemErroBookEpis', () => {
  it('orienta a aplicar a estrutura quando a Data API responde 404 para o Book', () => {
    expect(mensagemErroBookEpis({ status: 404, message: 'Failed to load resource' }))
      .toContain('ainda não está disponível no banco');
  });
});

describe('camposEditaveisBookEpi', () => {
  it('não manda a coluna gerada nem id/autor/datas no update (o banco recusa chave_importacao)', () => {
    const doBanco = {
      id: 'x', categoria: 'Membros Superiores', grupo_epi: 'Luva', descricao_epi: 'Luva ultraflex', indicacao: null,
      ca: '8084', validade: 'Válido - 12/04/2029', fabricante: 'DVS', tamanho: 'Nº 10', codigo_sap: '1355907',
      descricao_sap: 'LUVA SEG NBR AZ/BR LS 10', ativo: true, chave_importacao: '1355907|8084',
      imagem_path: 'epis/a.jpg', criado_por: 'IMPORTAÇÃO SISTEN', created_at: '2026-09-21', updated_at: '2026-09-21', foto: null,
    };
    const campos = camposEditaveisBookEpi(doBanco as never);
    expect(Object.keys(campos).sort()).toEqual([
      'ativo', 'ca', 'categoria', 'codigo_sap', 'descricao_epi', 'descricao_sap', 'fabricante', 'grupo_epi', 'indicacao', 'tamanho', 'validade',
    ]);
    expect(campos).not.toHaveProperty('chave_importacao');
    expect(campos.indicacao).toBeNull();
  });
});
