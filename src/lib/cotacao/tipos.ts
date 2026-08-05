/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tipos compartilhados da lógica pura do módulo de Análise de Cotações
 * (src/lib/cotacao/*.ts). Espelham o schema JSON devolvido pela Edge
 * Function `estruturar-cotacao` e as colunas de `cotacao_proposta` /
 * `cotacao_proposta_item` / `cotacao_item` — mas vivem aqui, não em
 * src/types.ts, porque só a lógica pura (calculo/validacao/vinculo) e seus
 * testes os consomem diretamente; a UI e a API convertem para/de linha de
 * banco.
 */

/** Item canônico do lote — o que o comprador pediu (vem da RM ou é avulso). */
export interface ItemCanonico {
  id: string;
  descricao_canonica: string;
  referencia?: string | null;
  material_code?: string | null;
  unidade?: string | null;
}

/** Uma linha extraída de uma proposta de fornecedor. */
export interface ItemExtraido {
  /** Rótulo literal do documento (preserva lacunas — nunca renumerar). */
  numero_item_original?: string | null;
  /** Posição física na extração, sempre sequencial mesmo com lacunas no rótulo. */
  linha_ordem: number;
  codigo_fornecedor?: string | null;
  descricao_bruta: string;
  referencia?: string | null;
  marca?: string | null;
  unidade?: string | null;
  quantidade: number | null;
  preco_unitario_bruto: number | null;
  desconto_valor?: number | null;
  desconto_percentual?: number | null;
  subtotal?: number | null;
  ipi_percentual?: number | null;
  ipi_valor?: number | null;
  icms_percentual?: number | null;
  icms_reducao_percentual?: number | null;
  st_percentual?: number | null;
  st_valor?: number | null;
  fcp_valor?: number | null;
  pis_percentual?: number | null;
  cofins_percentual?: number | null;
  ncm?: string | null;
  cst?: string | null;
  cfop?: string | null;
  disponibilidade_texto?: string | null;
  prazo_entrega_texto?: string | null;
  observacoes?: string | null;
  confianca_extracao?: number | null;
  item_canonico_id_sugerido?: string | null;
  match_confianca?: number | null;
  /** Preenchido pela IA quando descrição/referência divergem do item canônico sugerido. */
  divergencia?: { atributo: string; detalhe: string } | null;
}

/** Uma proposta de fornecedor (já segmentada e — depois — extraída). */
export interface PropostaExtraida {
  fornecedor?: { nome_extraido?: string; cnpj_extraido?: string | null; uf_extraido?: string | null };
  numero_proposta?: string | null;
  data_cotacao?: string | null;
  validade_texto?: string | null;
  condicao_pagamento_texto?: string | null;
  prazo_entrega_texto?: string | null;
  frete_texto?: string | null;
  frete_valor?: number | null;
  frete_modalidade?: string | null;
  faturamento_minimo?: number | null;
  total_declarado?: number | null;
  itens_declarados?: number | null;
  notas_gerais?: string[];
  itens: ItemExtraido[];
}

/** Resultado de vínculo, calculado por src/lib/cotacao/vinculo.ts. */
export type OrigemVinculo = 'referencia' | 'ncm_descricao' | 'ia' | 'usuario' | 'nenhum';

export interface ResultadoVinculo {
  cotacaoItemId: string | null;
  origem: OrigemVinculo;
  confianca: number | null;
  divergente: boolean;
  divergenciaAtributo?: string | null;
  divergenciaDetalhe?: string | null;
}
