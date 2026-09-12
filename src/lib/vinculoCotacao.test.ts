import { describe, it, expect } from 'vitest';
import {
  aplicarVinculosIa, analisarDivergenciasVinculo, revisarDivergencias,
  SCORE_VINCULO_IA,
} from './vinculoCotacao';
import type {
  CotacaoProcessoItem, CotacaoPropostaItemDraft, ItemPropostaExtraido, SugestaoVinculo,
} from '../types';

let seq = 0;
function item(
  p: Partial<CotacaoPropostaItemDraft> = {},
  raw: Partial<ItemPropostaExtraido> = {},
): CotacaoPropostaItemDraft {
  seq += 1;
  return {
    _key: p._key ?? `it${seq}`,
    processo_item_id: null, fora_escopo: false, vinculo_origem: 'manual', vinculo_score: null,
    ri: null, material_code: null, item_numero: null, codigo_produto: null,
    descricao_produto: 'Eletrodo revestido E7018 3,25mm', marca_fabricante: null, unidade_medida: 'KG',
    ncm: null, cst: null, cfop: null,
    quantidade: 100, preco_unitario: 30, preco_total_item: 3000,
    aliquota_icms_pct: null, aliquota_pis_pct: null, aliquota_cofins_pct: null, aliquota_ipi_pct: null,
    desconsiderado: false, vinculo_divergencias: [],
    peso_unitario_kg: null, peso_origem: null, frete_teorico: null,
    codigo_fiscal: null, preco_liquido_unitario: null, preco_liquido_total: null, custo_total_item: null,
    extraido_raw: { Vinculo_RI: null, Vinculo_Divergencias: null, ...raw } as ItemPropostaExtraido,
    ...p,
  };
}

function escopoItem(p: Partial<CotacaoProcessoItem> = {}): CotacaoProcessoItem {
  return {
    id: 'pi-1', processo_id: 'proc-1', ri: 'RI-001', rm: null, item_reqc: null,
    material_code: 'MAT-1', texto_breve: 'ELETRODO REVESTIDO E7018 3,25MM',
    qtd_solicitada: 100, unidade_medida: 'KG', centro: null, deposito: null,
    created_at: '2026-09-01T00:00:00Z',
    ...p,
  };
}

describe('aplicarVinculosIa', () => {
  it('vincula ao RI que a IA reconheceu', () => {
    const escopo = [escopoItem()];
    const { itens, resumo } = aplicarVinculosIa({
      itens: [item({ vinculo_origem: 'sugerido' }, { Vinculo_RI: 'ri-001' })],
      escopo,
    });

    expect(itens[0].processo_item_id).toBe('pi-1');
    expect(itens[0].ri).toBe('RI-001');
    expect(itens[0].material_code).toBe('MAT-1');
    expect(itens[0].vinculo_origem).toBe('ia');
    expect(itens[0].vinculo_score).toBe(SCORE_VINCULO_IA);
    expect(resumo.vinculados).toBe(1);
  });

  it('descarta RI que não existe neste processo', () => {
    const { itens, resumo } = aplicarVinculosIa({
      itens: [item({ vinculo_origem: 'sugerido' }, { Vinculo_RI: 'RI-999' })],
      escopo: [escopoItem()],
    });

    expect(itens[0].processo_item_id).toBeNull();
    expect(resumo.riInexistente).toBe(1);
    expect(resumo.vinculados).toBe(0);
  });

  it('não sobrescreve vínculo manual nem aprendido', () => {
    const escopo = [escopoItem(), escopoItem({ id: 'pi-2', ri: 'RI-002', texto_breve: 'OUTRO' })];
    const { itens } = aplicarVinculosIa({
      itens: [
        item({ _key: 'm', processo_item_id: 'pi-2', ri: 'RI-002', vinculo_origem: 'manual' }, { Vinculo_RI: 'RI-001' }),
        item({ _key: 'a', processo_item_id: 'pi-2', ri: 'RI-002', vinculo_origem: 'aprendido' }, { Vinculo_RI: 'RI-001' }),
      ],
      escopo,
    });

    expect(itens[0].processo_item_id).toBe('pi-2');
    expect(itens[1].processo_item_id).toBe('pi-2');
  });

  it('não vincula item desconsiderado', () => {
    const { itens } = aplicarVinculosIa({
      itens: [item({ desconsiderado: true, vinculo_origem: 'sugerido' }, { Vinculo_RI: 'RI-001' })],
      escopo: [escopoItem()],
    });
    expect(itens[0].processo_item_id).toBeNull();
  });

  it('registra as divergências que a própria IA apontou', () => {
    const { itens, resumo } = aplicarVinculosIa({
      itens: [item(
        { vinculo_origem: 'sugerido' },
        { Vinculo_RI: 'RI-001', Vinculo_Divergencias: ['A RM pede marca ESAB; o fornecedor cotou similar'] },
      )],
      escopo: [escopoItem()],
    });

    expect(itens[0].vinculo_divergencias).toContain('A RM pede marca ESAB; o fornecedor cotou similar');
    expect(resumo.comDivergencia).toBe(1);
  });

  it('sinaliza quando a IA e a busca por similaridade apontam RIs diferentes', () => {
    const escopo = [escopoItem(), escopoItem({ id: 'pi-2', ri: 'RI-002', texto_breve: 'ELETRODO E6013 2,5MM' })];
    const sugestoes = new Map<number, SugestaoVinculo[]>([[0, [{
      idx: 0, processo_item_id: 'pi-2', ri: 'RI-002', texto_breve: 'ELETRODO E6013 2,5MM',
      material_code: null, score: 0.7, origem: 'trigrama',
    }]]]);

    const { itens } = aplicarVinculosIa({
      itens: [item({ vinculo_origem: 'sugerido' }, { Vinculo_RI: 'RI-001' })],
      escopo,
      sugestoes,
    });

    expect(itens[0].processo_item_id).toBe('pi-1');
    expect(itens[0].vinculo_divergencias.some(d => d.includes('RI-002'))).toBe(true);
  });
});

describe('analisarDivergenciasVinculo', () => {
  it('aponta quantidade diferente da pedida na RM', () => {
    const d = analisarDivergenciasVinculo(item({ quantidade: 80 }), escopoItem({ qtd_solicitada: 100 }));
    expect(d.some(x => x.startsWith('Quantidade'))).toBe(true);
  });

  it('aceita a mesma quantidade sem reclamar', () => {
    const d = analisarDivergenciasVinculo(item({ quantidade: 100 }), escopoItem({ qtd_solicitada: 100 }));
    expect(d.some(x => x.startsWith('Quantidade'))).toBe(false);
  });

  it('aponta unidade diferente, mas aceita sinônimo', () => {
    expect(analisarDivergenciasVinculo(item({ unidade_medida: 'CX' }), escopoItem({ unidade_medida: 'KG' }))
      .some(x => x.startsWith('Unidade'))).toBe(true);
    expect(analisarDivergenciasVinculo(item({ unidade_medida: 'UN' }), escopoItem({ unidade_medida: 'PC' }))
      .some(x => x.startsWith('Unidade'))).toBe(false);
  });

  it('aponta descrição que não se parece com a da RM', () => {
    const d = analisarDivergenciasVinculo(
      item({ descricao_produto: 'Luva de raspa cano longo' }),
      escopoItem({ texto_breve: 'ELETRODO REVESTIDO E7018 3,25MM' }),
    );
    expect(d.some(x => x.startsWith('Descrição'))).toBe(true);
  });

  it('não inventa divergência quando não há item de RM vinculado', () => {
    expect(analisarDivergenciasVinculo(item(), null)).toEqual([]);
  });
});

describe('revisarDivergencias', () => {
  it('limpa os avisos quando o comprador desvincula o item', () => {
    const base = item({ vinculo_divergencias: ['Quantidade: cotou 80, a RM pede 100'] });
    expect(revisarDivergencias(base, [escopoItem()]).vinculo_divergencias).toEqual([]);
  });

  it('recalcula os avisos depois de o comprador trocar o vínculo', () => {
    const base = item({ processo_item_id: 'pi-1', quantidade: 50, vinculo_divergencias: [] });
    const revisado = revisarDivergencias(base, [escopoItem({ qtd_solicitada: 100 })]);
    expect(revisado.vinculo_divergencias.some(d => d.startsWith('Quantidade'))).toBe(true);
  });
});
