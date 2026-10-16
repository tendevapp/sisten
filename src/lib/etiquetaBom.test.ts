import { describe, expect, it } from 'vitest';
import {
  MAX_LINHAS_SECAO_ETIQUETA, agruparItensBom, conteudoQrEtiquetaBom, dadosEtiquetaBom, linhasSecaoEtiqueta, pecaDaRota,
} from './etiquetaBom';
import { codigoDoQr } from './etiquetaMaterial';

const linha = (extra: Record<string, unknown>) => ({
  part_number: '60.13.06262',
  part_number_norm: '601306262',
  descricao: 'Suporte de cabo L=295',
  description: 'Cable bracket L=295',
  codigo_equivalente_qingdao: '60.13.06261A-6',
  cod_sap: null,
  uom: 'each',
  level: 4,
  secao: 'S1',
  grupo: 'SOLDAVEL',
  qtd_por_torre: 5,
  ...extra,
});

describe('agruparItensBom', () => {
  it('monta a etiqueta do exemplo real: uma linha por seção com o grupo e a quantidade', () => {
    const [item] = agruparItensBom([
      linha({ secao: 'S3', qtd_por_torre: 14 }),
      linha({ secao: 'S1', qtd_por_torre: 5 }),
      linha({ secao: 'S5', qtd_por_torre: 12 }),
      linha({ secao: 'S2', qtd_por_torre: 11 }),
      linha({ secao: 'S4', qtd_por_torre: 15 }),
    ]);
    expect(item).toMatchObject({ partNumber: '60.13.06262', descricao: 'Suporte de cabo L=295', qingdao: '60.13.06261A-6', quantidadeTotal: 57 });
    expect(item.secoes.map((s) => [s.secao, s.grupo, s.quantidade])).toEqual([
      ['S1', 'SOLDAVEL', 5], ['S2', 'SOLDAVEL', 11], ['S3', 'SOLDAVEL', 14], ['S4', 'SOLDAVEL', 15], ['S5', 'SOLDAVEL', 12],
    ]);
  });

  it('soma as linhas da mesma peça na mesma seção e grupo (peça usada em vários conjuntos)', () => {
    const [item] = agruparItensBom([
      linha({ part_number: 'ISO 7089-10', part_number_norm: 'ISO708910', grupo: 'Escada', qtd_por_torre: 12 }),
      linha({ part_number: 'ISO7089-10', part_number_norm: 'ISO708910', grupo: 'ESCADA', qtd_por_torre: 6 }),
    ]);
    expect(item.secoes).toEqual([{ secao: 'S1', grupo: 'ESCADA', quantidade: 18 }]);
    expect(item.partNumber).toBe('ISO 7089-10');
  });

  it('usa a descrição em inglês quando falta a em português e ignora linha sem part number', () => {
    const itens = agruparItensBom([
      linha({ descricao: null, part_number: 'X1', part_number_norm: 'X1' }),
      linha({ part_number: '', part_number_norm: '' }),
    ]);
    expect(itens).toHaveLength(1);
    expect(itens[0].descricao).toBe('Cable bracket L=295');
  });
});

describe('linhasSecaoEtiqueta', () => {
  it('mantém as linhas quando cabem e junta grupos por seção quando não cabem', () => {
    const poucas = [{ secao: 'S1', grupo: 'A', quantidade: 1 }];
    expect(linhasSecaoEtiqueta(poucas)).toBe(poucas);
    const muitas = Array.from({ length: MAX_LINHAS_SECAO_ETIQUETA + 1 }, (_, i) => ({
      secao: i < 4 ? 'S1' : 'S2', grupo: `G${i}`, quantidade: 1,
    }));
    expect(linhasSecaoEtiqueta(muitas)).toEqual([
      { secao: 'S1', grupo: 'VÁRIOS', quantidade: 4 },
      { secao: 'S2', grupo: 'VÁRIOS', quantidade: 3 },
    ]);
  });
});

describe('QR e dados da etiqueta BOM', () => {
  it('o QR leva à peça e não é confundido com etiqueta de item SAP', () => {
    const qr = conteudoQrEtiquetaBom('60.13.06262');
    expect(qr).toBe('https://sisten.site/#/bom?peca=60.13.06262');
    expect(pecaDaRota(qr)).toBe('60.13.06262');
    expect(codigoDoQr(qr)).toBeNull();
  });

  it('a descrição e a localização do cadastro valem mais que a BOM', () => {
    const [item] = agruparItensBom([linha({})]);
    expect(dadosEtiquetaBom(item, { etiqueta_descricao: 'SUPORTE CABO 295', posicao_estoque: ' 101.A2 ' }, null))
      .toMatchObject({ descricao: 'SUPORTE CABO 295', localizacao: '101.A2', qingdao: '60.13.06261A-6' });
    expect(dadosEtiquetaBom(item, null, null)).toMatchObject({ descricao: 'Suporte de cabo L=295', localizacao: '' });
  });

  it('leva o nome em inglês da BOM, mesmo com a descrição em português editada, e omite quando repete', () => {
    const [item] = agruparItensBom([linha({})]);
    expect(dadosEtiquetaBom(item, null, null).descricaoEn).toBe('Cable bracket L=295');
    expect(dadosEtiquetaBom(item, { etiqueta_descricao: 'SUPORTE CABO 295' }, null).descricaoEn).toBe('Cable bracket L=295');
    const [soIngles] = agruparItensBom([linha({ descricao: null })]);
    expect(dadosEtiquetaBom(soIngles, null, null)).toMatchObject({ descricao: 'Cable bracket L=295', descricaoEn: '' });
  });
});
