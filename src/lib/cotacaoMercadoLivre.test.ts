import { describe, expect, it } from 'vitest';
import {
  complementoComMercadoLivre, complementoPelasDescricoes, montarPropostaMercadoLivre, validarPropostaMl,
} from './cotacaoMercadoLivre';

describe('complementoPelasDescricoes', () => {
  it('primeira palavra de cada item, sem repetir, com inicial maiúscula', () => {
    expect(complementoPelasDescricoes(['SINALEIRO COM S-DS RED VD 24VCA/CC', 'SINALEIRO COM ZB4 RED VM'])).toBe('Sinaleiro');
    expect(complementoPelasDescricoes(['DISJUNTOR 3P 40A', 'cabo flexível 4mm', null, 'Disjuntor 2P'])).toBe('Disjuntor, Cabo');
  });

  it('corta com "..." quando passa do limite', () => {
    const r = complementoPelasDescricoes(['PARAFUSO X', 'PORCA Y', 'ARRUELA Z', 'ABRAÇADEIRA W'], 25);
    expect(r).toBe('Parafuso, Porca, Arruela...');
    expect(r.length).toBeLessThanOrEqual(28);
  });

  it('vazio quando não há descrição', () => {
    expect(complementoPelasDescricoes([null, '  '])).toBe('');
  });
});

describe('complementoComMercadoLivre', () => {
  it('acrescenta uma vez e tira ao desmarcar', () => {
    expect(complementoComMercadoLivre('Sinaleiro', true)).toBe('Sinaleiro — Mercado Livre');
    expect(complementoComMercadoLivre('Sinaleiro — Mercado Livre', true)).toBe('Sinaleiro — Mercado Livre');
    expect(complementoComMercadoLivre('', true)).toBe('Mercado Livre');
    expect(complementoComMercadoLivre('Sinaleiro — Mercado Livre', false)).toBe('Sinaleiro');
  });
});

describe('montarPropostaMercadoLivre', () => {
  const escopo = [
    { id: 'p1', ri: 'RI-1', material_code: '1186523', texto_breve: 'SINALEIRO COM S-DS RED VD 24VCA/CC', unidade_medida: 'UN' },
    { id: 'p2', ri: 'RI-2', material_code: '1211494', texto_breve: 'SINALEIRO COM ZB4 RED VM', unidade_medida: 'UN' },
  ];
  const dados = {
    loja: 'Manuks Ferramentas',
    linkAnuncio: 'https://produto.mercadolivre.com.br/MLB-123',
    frete: 0,
    prazoEntrega: 'Chegará quinta-feira',
    arquivoOrigem: 'print-ml.png',
    itens: [
      { processoItemId: 'p1', quantidade: 2, precoUnitario: 14.84 },
      { processoItemId: 'p2', descricaoAnuncio: 'Kit 2 sinaleiros 22mm vermelho', quantidade: 2, precoUnitario: 7.78 },
    ],
  };

  it('vira rascunho já vinculado aos itens da RM, com preço, frete e loja', () => {
    const p = montarPropostaMercadoLivre(dados, escopo, new Date(2026, 9, 20));
    expect(p.fornecedor_razao_social).toBe('MERCADO LIVRE — MANUKS FERRAMENTAS');
    expect(p.frete_modalidade).toBe('CIF');
    expect(p.valor_frete).toBe(0);
    expect(p.prazo_entrega_texto).toBe('Chegará quinta-feira');
    expect(p.data_emissao).toBe('2026-10-20');
    expect(p.arquivo_origem).toBe('print-ml.png');
    expect(p.observacoes_gerais).toContain('MLB-123');
    expect(p.itens.map(i => [i.processo_item_id, i.ri, i.material_code, i.quantidade, i.preco_unitario])).toEqual([
      ['p1', 'RI-1', '1186523', 2, 14.84],
      ['p2', 'RI-2', '1211494', 2, 7.78],
    ]);
    expect(p.itens[0].descricao_produto).toBe('SINALEIRO COM S-DS RED VD 24VCA/CC');
    expect(p.itens[1].descricao_produto).toBe('Kit 2 sinaleiros 22mm vermelho');
  });

  it('valida loja, itens, preço e quantidade', () => {
    expect(validarPropostaMl(dados)).toEqual([]);
    expect(validarPropostaMl({ ...dados, loja: ' ', itens: [{ processoItemId: 'p1', quantidade: 0, precoUnitario: null }] })).toEqual([
      'Informe a loja do Mercado Livre.',
      'Item 1: informe o preço unitário.',
      'Item 1: informe a quantidade.',
    ]);
  });
});
