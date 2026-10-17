import { describe, expect, it } from 'vitest';
import { montarCatalogoBom, rotuloSecao, SEM_SECAO, type LinhaBomCatalogo } from './catalogoBom';

const linha = (over: Partial<LinhaBomCatalogo> & Pick<LinhaBomCatalogo, 'id' | 'level' | 'part_number'>): LinhaBomCatalogo => ({
  ordem: over.id,
  secao: null,
  grupo: 'GRUPO',
  description: 'Part',
  descricao: null,
  qtd_por_torre: 1,
  uom: 'each',
  cod_sap: null,
  codigo_equivalente_qingdao: null,
  ...over,
});

// Torre (S1) com conjunto S2 abaixo, flange S1/S2 com peça de seção S2 lá dentro e uma linha sem seção na raiz.
const bom: LinhaBomCatalogo[] = [
  linha({ id: 1, level: 1, part_number: '100', secao: 'S1', descricao: 'Torre', description: 'Tower' }),
  linha({ id: 2, level: 2, part_number: '110', descricao: 'Parafuso', description: 'Parafuso' }),
  linha({ id: 3, level: 2, part_number: '200', secao: 'S2', descricao: 'Conjunto S2', description: 'Set S2' }),
  linha({ id: 4, level: 3, part_number: '400', descricao: 'Peça S2', description: 'Part S2', cod_sap: '10538259' }),
  linha({ id: 5, level: 1, part_number: '300', secao: 'S1/S2', descricao: 'Flange', description: 'Flange' }),
  linha({ id: 6, level: 2, part_number: '310', descricao: 'Parafuso flange', description: 'Parafuso flange', codigo_equivalente_qingdao: 'Q-9' }),
  linha({ id: 7, level: 2, part_number: '500', secao: 'S2', descricao: 'Peça S2 na junção', description: 'Part S2 junction' }),
  linha({ id: 8, level: 1, part_number: '900', secao: null, descricao: 'Solto', description: 'Loose' }),
];

const cadastros = new Map([
  ['400', { posicao_estoque: '101.A2', etiqueta_descricao: 'Peça revisada', url_imagem: 'https://foto/400.jpg' }],
]);

describe('montarCatalogoBom', () => {
  it('separa em capítulos por seção, na ordem da torre, com a linha sem seção por último', () => {
    const catalogo = montarCatalogoBom(bom, cadastros);
    expect(catalogo.capitulos.map((c) => c.secao)).toEqual(['S1', 'S1/S2', 'S2', SEM_SECAO]);
  });

  it('linha sem seção herda a do pai', () => {
    const s1 = montarCatalogoBom(bom, cadastros).capitulos.find((c) => c.secao === 'S1')!;
    expect(s1.linhas.map((l) => l.partNumber)).toEqual(['100', '110']);
  });

  it('indenta pelo recuo dentro do capítulo, não pelo nível da BOM', () => {
    const s2 = montarCatalogoBom(bom, cadastros).capitulos.find((c) => c.secao === 'S2')!;
    // 200 é raiz de S2 (pai 100 está em S1); 400 está dentro de 200; 500 é raiz de S2 (pai 300 está em S1/S2).
    expect(s2.linhas.map((l) => [l.partNumber, l.recuo, l.nivel])).toEqual([
      ['200', 0, 2],
      ['400', 1, 3],
      ['500', 0, 2],
    ]);
  });

  it('marca conjunto quando a linha tem peças abaixo', () => {
    const s2 = montarCatalogoBom(bom, cadastros).capitulos.find((c) => c.secao === 'S2')!;
    expect(s2.linhas.map((l) => l.conjunto)).toEqual([true, false, false]);
  });

  it('usa a descrição do cadastro em português e o inglês da BOM só quando difere', () => {
    const s2 = montarCatalogoBom(bom, cadastros).capitulos.find((c) => c.secao === 'S2')!;
    const peca = s2.linhas.find((l) => l.partNumber === '400')!;
    expect(peca.descricao).toBe('Peça revisada');
    expect(peca.descricaoEn).toBe('Part S2');
    const parafuso = montarCatalogoBom(bom, cadastros).capitulos[0].linhas[1];
    expect(parafuso.descricaoEn).toBe('');
  });

  it('leva foto, localização, SAP e equivalente Qingdao para a linha', () => {
    const catalogo = montarCatalogoBom(bom, cadastros);
    const peca = catalogo.capitulos.find((c) => c.secao === 'S2')!.linhas.find((l) => l.partNumber === '400')!;
    expect(peca).toMatchObject({ localizacao: '101.A2', urlFoto: 'https://foto/400.jpg', codSap: '10538259' });
    const flange = catalogo.capitulos.find((c) => c.secao === 'S1/S2')!.linhas.find((l) => l.partNumber === '310')!;
    expect(flange.qingdao).toBe('Q-9');
  });

  it('conta peças distintas por capítulo e no total (uma peça em dois conjuntos conta uma vez)', () => {
    const repetida: LinhaBomCatalogo[] = [
      ...bom,
      linha({ id: 9, level: 2, part_number: '110', secao: 'S1', descricao: 'Parafuso', description: 'Bolt' }),
    ];
    const catalogo = montarCatalogoBom(repetida, cadastros);
    const s1 = catalogo.capitulos.find((c) => c.secao === 'S1')!;
    expect(s1.totais).toMatchObject({ linhas: 3, pecas: 2 });
    // Peças distintas do fixture: 100, 110, 200, 300, 310, 400, 500 e 900.
    expect(catalogo.totais).toMatchObject({ linhas: 9, pecas: 8, comFoto: 1, comLocalizacao: 1 });
  });

  it('não cria capítulo vazio e não quebra com lista vazia', () => {
    const catalogo = montarCatalogoBom([]);
    expect(catalogo.capitulos).toEqual([]);
    expect(catalogo.totais).toMatchObject({ linhas: 0, pecas: 0 });
  });

  it('rotula a seção de junção e a torre em português', () => {
    expect(rotuloSecao('S1/S2')).toBe('Junção S1-S2');
    expect(rotuloSecao('TORRE')).toBe('Torre (itens gerais)');
    expect(rotuloSecao('S3')).toBe('Seção S3');
  });
});
