/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { normalizarReferencia, referenciasCorrespondem, similaridadeDescricao, vincularItem } from './vinculo';
import type { ItemCanonico, ItemExtraido } from './tipos';

const ITEM_CANONICO_FURADEIRA: ItemCanonico = {
  id: 'item-furadeira',
  descricao_canonica: 'FURADEIRA DE IMPACTO BOSCH GSB 20-2 RE 800W 220V',
  referencia: '06011A21E2',
  material_code: '00012345',
};

const ITEM_CANONICO_ALICATE: ItemCanonico = {
  id: 'item-alicate-bico-curvo',
  descricao_canonica: 'ALICATE TIPO TELEFONE BICO CURVO 45º ISOLADO VDE 8132AB-160H',
  referencia: null,
};

describe('normalizarReferencia', () => {
  it('remove separadores e uppercasa', () => {
    expect(normalizarReferencia('BOSCH-06011A21E2-000')).toBe('BOSCH06011A21E2000');
    expect(normalizarReferencia('vde 8132-160h')).toBe('VDE8132160H');
  });

  it('retorna vazio para null/undefined', () => {
    expect(normalizarReferencia(null)).toBe('');
    expect(normalizarReferencia(undefined)).toBe('');
  });
});

describe('referenciasCorrespondem — casa apesar de prefixo de marca / sufixo de modelo colados', () => {
  it('Manglog "BOSCH-06011A21E2" casa com o núcleo "06011A21E2"', () => {
    expect(referenciasCorrespondem('BOSCH-06011A21E2', '06011A21E2')).toBe(true);
  });

  it('Anhanguera "06011A21E2GSB 20-2RE" (SKU e modelo colados sem separador) casa com "06011A21E2"', () => {
    expect(referenciasCorrespondem('06011A21E2GSB 20-2RE', '06011A21E2')).toBe(true);
  });

  it('Loja do Mecânico "BOSCH-06011A21E2-000" casa com "06011A21E2"', () => {
    expect(referenciasCorrespondem('BOSCH-06011A21E2-000', '06011A21E2')).toBe(true);
  });

  it('as três referências de fornecedor casam entre si (núcleo comum)', () => {
    expect(referenciasCorrespondem('BOSCH-06011A21E2', '06011A21E2GSB 20-2RE')).toBe(true);
    expect(referenciasCorrespondem('BOSCH-06011A21E2-000', '06011A21E2GSB 20-2RE')).toBe(true);
  });

  it('Anhanguera "VDE 8132-160H" e Ferimport "VDE 8132 160H" casam (só o separador muda)', () => {
    expect(referenciasCorrespondem('VDE 8132-160H', 'VDE 8132 160H')).toBe(true);
  });

  it('não casa referências curtas demais (evita falso positivo trivial)', () => {
    expect(referenciasCorrespondem('PC', 'PC')).toBe(false);
  });

  it('não casa referências de produtos genuinamente diferentes', () => {
    expect(referenciasCorrespondem('VONDER-3513408100', 'GEDORE-225-14')).toBe(false);
  });
});

describe('similaridadeDescricao', () => {
  it('descrições idênticas têm similaridade 1', () => {
    expect(similaridadeDescricao('FURADEIRA X', 'FURADEIRA X')).toBe(1);
  });

  it('a furadeira Bosch GSB 20-2 RE 800W (canônica) tem baixa similaridade com a Ferimport GSB 16 RE 850W (modelo diferente)', () => {
    const score = similaridadeDescricao(
      'FURAD IMP GSB 16 RE 850W 220V',
      'FURADEIRA DE IMPACTO BOSCH GSB 20-2 RE 800W 220V',
    );
    expect(score).toBeLessThan(0.35);
  });
});

describe('vincularItem — cascata referência → NCM/descrição → IA → nenhum', () => {
  const canonicos = [ITEM_CANONICO_FURADEIRA, ITEM_CANONICO_ALICATE];

  it('vincula por referência quando ela bate com o item canônico (Manglog)', () => {
    const item: ItemExtraido = {
      linha_ordem: 1,
      descricao_bruta: 'FURADEIRA DE IMPACTO BOSCH GSB 20-2 RE 800W 220V',
      referencia: 'BOSCH-06011A21E2',
      quantidade: 1,
      preco_unitario_bruto: 2983.34,
    };
    const resultado = vincularItem(item, canonicos);
    expect(resultado.cotacaoItemId).toBe('item-furadeira');
    expect(resultado.origem).toBe('referencia');
    expect(resultado.divergente).toBe(false);
  });

  it('vincula por referência mesmo com o SKU colado ao modelo sem separador (Anhanguera)', () => {
    const item: ItemExtraido = {
      linha_ordem: 1,
      descricao_bruta: 'FURADEIRA IMP 1/2" 870W EL REV 220V',
      referencia: '06011A21E2GSB 20-2RE',
      quantidade: 1,
      preco_unitario_bruto: 1125.71,
    };
    const resultado = vincularItem(item, canonicos);
    expect(resultado.cotacaoItemId).toBe('item-furadeira');
    expect(resultado.origem).toBe('referencia');
  });

  it('vincula por referência já conhecida de OUTRO fornecedor quando o item canônico não tem referência cadastrada', () => {
    // O item canônico "alicate" não tem referência (o comprador não sabia o SKU
    // exato ao criar o lote). Anhanguera já foi vinculado antes e ensinou a
    // referência "VDE 8132-160H" — Ferimport casa contra ela, não contra o canônico.
    const item: ItemExtraido = {
      linha_ordem: 9,
      descricao_bruta: 'ALICATE TELEF BICO CURVO VDE 8132AB-160H',
      referencia: 'VDE 8132 160H',
      quantidade: 3,
      preco_unitario_bruto: 217.00,
    };
    const resultado = vincularItem(item, canonicos, [
      { cotacaoItemId: 'item-alicate-bico-curvo', referencia: 'VDE 8132-160H' },
    ]);
    expect(resultado.cotacaoItemId).toBe('item-alicate-bico-curvo');
    expect(resultado.origem).toBe('referencia');
  });

  it('vincula por descrição quando não há referência mas a descrição é muito parecida', () => {
    const item: ItemExtraido = {
      linha_ordem: 1,
      descricao_bruta: 'FURADEIRA DE IMPACTO BOSCH GSB 20-2 RE 800W 220V',
      quantidade: 1,
      preco_unitario_bruto: 2983.34,
    };
    const resultado = vincularItem(item, canonicos);
    expect(resultado.cotacaoItemId).toBe('item-furadeira');
    expect(resultado.origem).toBe('ncm_descricao');
  });

  it('Ferimport (GSB 16 RE 850W, sem referência, descrição pouco parecida): vincula pela sugestão da IA e fica marcado como divergente', () => {
    const item: ItemExtraido = {
      linha_ordem: 1,
      descricao_bruta: 'FURAD IMP GSB 16 RE 850W 220V',
      quantidade: 1,
      preco_unitario_bruto: 525.00,
      item_canonico_id_sugerido: 'item-furadeira',
      match_confianca: 0.6,
      divergencia: { atributo: 'modelo', detalhe: 'GSB 16 RE 850W em vez de GSB 20-2 RE 800W' },
    };
    const resultado = vincularItem(item, canonicos);
    expect(resultado.cotacaoItemId).toBe('item-furadeira');
    expect(resultado.origem).toBe('ia');
    expect(resultado.divergente).toBe(true);
    expect(resultado.divergenciaAtributo).toBe('modelo');
  });

  it('não confia em id sugerido pela IA que não existe na lista de itens canônicos', () => {
    const item: ItemExtraido = {
      linha_ordem: 1,
      descricao_bruta: 'PRODUTO QUALQUER SEM RELAÇÃO',
      quantidade: 1,
      preco_unitario_bruto: 10,
      item_canonico_id_sugerido: 'id-inventado-que-nao-existe',
    };
    const resultado = vincularItem(item, canonicos);
    expect(resultado.cotacaoItemId).toBeNull();
    expect(resultado.origem).toBe('nenhum');
  });

  it('sem referência, sem descrição parecida e sem sugestão da IA: fica sem vínculo para revisão manual', () => {
    const item: ItemExtraido = {
      linha_ordem: 1,
      descricao_bruta: 'ITEM TOTALMENTE DIFERENTE DE TUDO',
      quantidade: 1,
      preco_unitario_bruto: 10,
    };
    const resultado = vincularItem(item, canonicos);
    expect(resultado.cotacaoItemId).toBeNull();
    expect(resultado.origem).toBe('nenhum');
    expect(resultado.divergente).toBe(false);
  });
});
