import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { deduplicarVariantesBookEpis, expandirVariantesEpi, parseBookEpisWorkbook } from './bookEpisImportacao';

describe('expandirVariantesEpi', () => {
  it('mantém cada tamanho e código SAP como variante individual do mesmo EPI', () => {
    const variantes = expandirVariantesEpi({
      categoria: 'Membros Inferiores',
      descricaoEpi: 'Botina de segurança branca com biqueira de composite',
      indicacao: 'Atividade nos internos mecânicos',
      ca: '32569',
      validade: 'Válido - 25/04/2028',
      fabricante: 'Marluvas',
      tamanhoCodigoSap: '36 - 1026092\n37 - 1026093',
      descricaoSap: 'BOTINA OPERAC COUR AL BR BIC AC 36\nBOTINA OPERAC COUR AL BR BIC AC 37',
      foto: null,
    });

    expect(variantes).toEqual([
      expect.objectContaining({ tamanho: '36', codigoSap: '1026092', descricaoSap: 'BOTINA OPERAC COUR AL BR BIC AC 36', ca: '32569' }),
      expect.objectContaining({ tamanho: '37', codigoSap: '1026093', descricaoSap: 'BOTINA OPERAC COUR AL BR BIC AC 37', ca: '32569' }),
    ]);
    expect(new Set(variantes.map(item => item.grupoEpi))).toEqual(new Set(['Botina de segurança branca com biqueira de composite']));
  });

  it('cria uma variante sem tamanho quando a linha possui um único código SAP', () => {
    const [variante] = expandirVariantesEpi({
      categoria: 'Auditiva',
      descricaoEpi: 'Protetor auricular tipo plug em espuma descartável',
      indicacao: 'Visitantes',
      ca: '5674',
      validade: 'Válido - 26/09/2027',
      fabricante: '3M do Brasil LTDA',
      tamanhoCodigoSap: '1358894',
      descricaoSap: 'PROT PLUG ESP LJ MOLD DESC U',
      foto: null,
    });

    expect(variante).toMatchObject({ tamanho: null, codigoSap: '1358894', descricaoSap: 'PROT PLUG ESP LJ MOLD DESC U' });
  });
});

describe('parseBookEpisWorkbook', () => {
  it('lê o Book de EPIs original sem falhar nos metadados de desenho do Excel', async () => {
    const arquivo = await readFile('C:/Users/andre.araujo/Downloads/EPI TEN REVISADO 2026.xlsx');
    const buffer = arquivo.buffer.slice(arquivo.byteOffset, arquivo.byteOffset + arquivo.byteLength);

    await expect(parseBookEpisWorkbook(buffer)).resolves.not.toEqual([]);
  });
});

describe('deduplicarVariantesBookEpis', () => {
  it('mantém uma única variante por código SAP e CA, priorizando a linha com foto', () => {
    const variantes = expandirVariantesEpi({
      categoria: 'Respiratória', descricaoEpi: 'Respirador', indicacao: '', ca: '123', validade: '', fabricante: '',
      tamanhoCodigoSap: '1026092', descricaoSap: 'RESPIRADOR', foto: null,
    });
    const comFoto = { ...variantes[0], foto: { blob: new Blob(['foto']), mimeType: 'image/jpeg', nome: 'epi.jpg' } };

    expect(deduplicarVariantesBookEpis([...variantes, comFoto])).toEqual([comFoto]);
  });
});
