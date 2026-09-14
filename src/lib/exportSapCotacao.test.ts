/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { agruparLinhasMapa, OPCOES_CUSTO_PADRAO } from './mapaCotacao';
import type { PropostaMapa } from './mapaCotacao';
import { construirLinhasSap } from './exportSapCotacao';
import type { CotacaoProcessoItem, CotacaoPropostaDraft, CotacaoPropostaItemDraft } from '../types';

let seq = 0;
function item(p: Partial<CotacaoPropostaItemDraft> & { descricao_produto: string }): CotacaoPropostaItemDraft {
  seq += 1;
  return {
    _key: p._key ?? `it${seq}`,
    processo_item_id: null, fora_escopo: false, vinculo_origem: 'manual', vinculo_score: null,
    ri: null, material_code: null, item_numero: null, codigo_produto: null,
    marca_fabricante: null, unidade_medida: 'UN', ncm: null, cst: null, cfop: null,
    quantidade: 1, preco_unitario: 10, preco_total_item: null,
    aliquota_icms_pct: null, aliquota_pis_pct: null, aliquota_cofins_pct: null, aliquota_ipi_pct: null,
    extraido_raw: {} as any,
    desconsiderado: false, vinculo_divergencias: [],
    peso_unitario_kg: null, peso_origem: null, frete_teorico: null,
    codigo_fiscal: null, preco_liquido_unitario: null, preco_liquido_total: null, custo_total_item: null,
    ...p,
  };
}

function proposta(nome: string, itens: CotacaoPropostaItemDraft[], p: Partial<CotacaoPropostaDraft> = {}): PropostaMapa {
  return {
    key: nome,
    proposta: {
      _key: nome, _salvo: true, _extraido_em: null,
      arquivo_origem: null, numero_proposta: null, data_emissao: null,
      validade_data: null, validade_texto: null,
      fornecedor_razao_social: nome, fornecedor_cnpj: '00000000000100', fornecedor_inscricao_estadual: null,
      fornecedor_cidade: null, fornecedor_uf: null, fornecedor_telefone: null,
      cod_vendor: null, contato_id: null, fornecedor_match: 'nao_encontrado',
      vendedor_nome: null, vendedor_email: null, vendedor_telefone: null,
      cliente_razao_social: null, cliente_cnpj: null, cliente_inscricao_estadual: null,
      cliente_cidade: null, cliente_uf: null,
      condicao_pagamento: null, forma_pagamento: null, prazo_entrega_texto: null, prazo_entrega_dias: null,
      frete_modalidade: null, transportadora_indicada: null, faturamento_minimo: null,
      dados_bancarios_pix: null, valor_total_orcamento: null, valor_frete: null, observacoes_gerais: null,
      campos_faltantes: [], revisado: true, extracao_id: null, extraido_raw: {} as any,
      arquivo_storage_path: null, arquivo_mime_type: null, arquivo_tamanho_bytes: null,
      arquivo_markdown: null, arquivo_markdown_editado_em: null, arquivo_markdown_editado_por: null,
      itens,
      ...p,
    },
  };
}

function escopoItem(id: string, texto: string, qtd = 1): CotacaoProcessoItem {
  return {
    id, processo_id: 'proc', ri: `RI-${id}`, rm: `RM-${id}`,
    item_reqc: null, material_code: null, texto_breve: texto, qtd_solicitada: qtd, unidade_medida: 'UN',
    centro: null, deposito: null, created_at: '2026-09-01T00:00:00Z',
  };
}

describe('construirLinhasSap', () => {
  it('só inclui itens marcados em `selecionados`', () => {
    const a = item({ descricao_produto: 'PARAFUSO M8', _key: 'a' });
    const b = item({ descricao_produto: 'PORCA M8', _key: 'b' });
    const escopo = [escopoItem('e1', 'PARAFUSO M8'), escopoItem('e2', 'PORCA M8')];
    const propostas = [proposta('Fornecedor Um', [a, b])];
    const linhas = agruparLinhasMapa({ escopo, propostas, opcoes: OPCOES_CUSTO_PADRAO });
    const propostasPorKey = new Map(propostas.map(p => [p.key, p.proposta]));

    const resultado = construirLinhasSap({
      linhas, selecionados: new Set(['a']), escopo, propostasPorKey,
    });

    expect(resultado).toHaveLength(1);
    expect(resultado[0].key).toBe('a');
  });

  it('texto usa as 3 primeiras palavras de cada item quando há até 3 itens no fornecedor', () => {
    const a = item({ descricao_produto: 'CAPA CHUVA PVC FORRADO STANDARD', _key: 'a' });
    const b = item({ descricao_produto: 'PROTETOR AURICULAR SILICONE CORDAO', _key: 'b' });
    const escopo = [escopoItem('e1', 'CAPA CHUVA'), escopoItem('e2', 'PROTETOR AURICULAR')];
    const propostas = [proposta('Fornecedor Um', [a, b])];
    const linhas = agruparLinhasMapa({ escopo, propostas, opcoes: OPCOES_CUSTO_PADRAO });
    const propostasPorKey = new Map(propostas.map(p => [p.key, p.proposta]));

    const resultado = construirLinhasSap({
      linhas, selecionados: new Set(['a', 'b']), escopo, propostasPorKey,
    });

    expect(resultado[0].texto).toBe('Aquisição de CAPA CHUVA PVC, PROTETOR AURICULAR SILICONE para atendimento à produção.');
    expect(resultado[1].texto).toBe(resultado[0].texto);
  });

  it('texto genérico quando o fornecedor tem mais de 3 itens', () => {
    const itens = ['A', 'B', 'C', 'D'].map(d => item({ descricao_produto: `ITEM ${d} DESCRICAO`, _key: d }));
    const escopo = itens.map((_, i) => escopoItem(`e${i}`, `ITEM ${i}`));
    const propostas = [proposta('Fornecedor Um', itens)];
    const linhas = agruparLinhasMapa({ escopo, propostas, opcoes: OPCOES_CUSTO_PADRAO });
    const propostasPorKey = new Map(propostas.map(p => [p.key, p.proposta]));

    const resultado = construirLinhasSap({
      linhas, selecionados: new Set(['A', 'B', 'C', 'D']), escopo, propostasPorKey,
    });

    expect(resultado[0].texto).toBe('Aquisição de itens para atendimento à produção.');
  });

  it('ddp e imposto começam vazios — sem sugestão automática', () => {
    const a = item({ descricao_produto: 'PARAFUSO M8', _key: 'a' });
    const escopo = [escopoItem('e1', 'PARAFUSO M8')];
    const propostas = [proposta('Fornecedor Um', [a])];
    const linhas = agruparLinhasMapa({ escopo, propostas, opcoes: OPCOES_CUSTO_PADRAO });
    const propostasPorKey = new Map(propostas.map(p => [p.key, p.proposta]));

    const resultado = construirLinhasSap({ linhas, selecionados: new Set(['a']), escopo, propostasPorKey });

    expect(resultado[0].ddp).toBe('');
    expect(resultado[0].ddpDescr).toBe('');
    expect(resultado[0].imposto).toBe('');
    expect(resultado[0].impDescricao).toBe('');
    expect(resultado[0].baseReduzida).toBeNull();
  });

  it('ordena as linhas por nome de fornecedor', () => {
    const a = item({ descricao_produto: 'ITEM A', _key: 'a' });
    const b = item({ descricao_produto: 'ITEM B', _key: 'b' });
    const escopo = [escopoItem('e1', 'ITEM A'), escopoItem('e2', 'ITEM B')];
    const propostas = [proposta('Zeta Fornecedor', [a]), proposta('Alfa Fornecedor', [b])];
    const linhas = agruparLinhasMapa({ escopo, propostas, opcoes: OPCOES_CUSTO_PADRAO });
    const propostasPorKey = new Map(propostas.map(p => [p.key, p.proposta]));

    const resultado = construirLinhasSap({
      linhas, selecionados: new Set(['a', 'b']), escopo, propostasPorKey,
    });

    expect(resultado.map(r => r.fornecedorNome)).toEqual(['Alfa Fornecedor', 'Zeta Fornecedor']);
  });

  it('numera o item em passos de 10, na ordem final', () => {
    const a = item({ descricao_produto: 'ITEM A', _key: 'a' });
    const b = item({ descricao_produto: 'ITEM B', _key: 'b' });
    const escopo = [escopoItem('e1', 'ITEM A'), escopoItem('e2', 'ITEM B')];
    const propostas = [proposta('Fornecedor Um', [a, b])];
    const linhas = agruparLinhasMapa({ escopo, propostas, opcoes: OPCOES_CUSTO_PADRAO });
    const propostasPorKey = new Map(propostas.map(p => [p.key, p.proposta]));

    const resultado = construirLinhasSap({
      linhas, selecionados: new Set(['a', 'b']), escopo, propostasPorKey,
    });

    expect(resultado.map(r => r.item)).toEqual([10, 20]);
  });

  it('preenche RM a partir do item de escopo vinculado', () => {
    const a = item({ descricao_produto: 'PARAFUSO M8', _key: 'a' });
    const escopo = [escopoItem('e1', 'PARAFUSO M8')];
    const propostas = [proposta('Fornecedor Um', [a])];
    const linhas = agruparLinhasMapa({ escopo, propostas, opcoes: OPCOES_CUSTO_PADRAO });
    const propostasPorKey = new Map(propostas.map(p => [p.key, p.proposta]));

    const resultado = construirLinhasSap({ linhas, selecionados: new Set(['a']), escopo, propostasPorKey });

    expect(resultado[0].rm).toBe('RM-e1');
  });
});
