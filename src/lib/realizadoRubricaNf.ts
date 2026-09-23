/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Regras de agregação do Realizado por Rubrica medido pela nota fiscal
 * (`vw_fin_nf_realizado_rubrica`, uma linha por item de NF da ZL0136).
 *
 * A view já entrega cada item classificado em duas dimensões:
 * - natureza fiscal (pelo CFOP/categoria da NF): diz se o item é custo
 *   (`entra_realizado`) ou só movimentação fiscal (remessa, retorno,
 *   imobilizado, outras entradas);
 * - rubrica (pelo de-para CFOP → fornecedor → código de serviço → grupo de
 *   mercadoria), com a origem de cada atribuição para auditoria.
 *
 * Aqui só se agrega: árvore de rubricas com rollup, ponte por natureza e
 * consolidação por fornecedor/item para a conferência.
 */

import type { FinRubrica } from '../types';

export type NaturezaFiscal =
  | 'MATERIAL_PRODUCAO'
  | 'USO_CONSUMO'
  | 'SERVICO'
  | 'FRETE'
  | 'ENERGIA'
  | 'COMUNICACAO'
  | 'DEVOLUCAO'
  | 'IMOBILIZADO'
  | 'REMESSA_RETORNO'
  | 'SAIDA_SEM_CUSTO'
  | 'OUTRAS_ENTRADAS';

export type OrigemRubrica = 'cfop' | 'fornecedor' | 'servico' | 'grupo_mercadoria';

export interface LinhaNfRealizado {
  id: number;
  fornecedor_codigo: string;
  fornecedor_nome: string | null;
  cnpj_fornecedor: string | null;
  numero_nf: string | null;
  serie_nf: string | null;
  categoria_nota_fiscal: string | null;
  cfop: string | null;
  data_documento: string | null;
  data_lancamento: string | null;
  numero_pedido: string | null;
  item_pedido: string | null;
  material: string | null;
  numero_servico: string | null;
  tipo_item: 'MATERIAL' | 'SERVICO' | 'SEM_ITEM';
  descricao_item: string | null;
  quantidade: number | null;
  unidade_medida: string | null;
  centro: string | null;
  natureza: NaturezaFiscal;
  entra_realizado: boolean;
  valor: number;
  grupo_mercadoria_codigo: string | null;
  grupo_mercadoria_nome: string | null;
  classificacao_nivel1: string | null;
  classificacao_nivel2: string | null;
  origem_grupo: string | null;
  rubrica_id: string | null;
  rubrica_nome: string | null;
  origem_rubrica: OrigemRubrica | null;
  valor_pago_rateado: number | null;
  status_pagamento: string | null;
  data_ultimo_pagamento: string | null;
  excluido_por_material: boolean;
}

export const NATUREZAS: Record<NaturezaFiscal, { rotulo: string; descricao: string; ordem: number }> = {
  MATERIAL_PRODUCAO: { rotulo: 'Material de produção', descricao: 'CFOP x101/x102/x401 — compra para industrialização', ordem: 1 },
  USO_CONSUMO: { rotulo: 'Uso e consumo', descricao: 'CFOP x556/x407 — material de consumo', ordem: 2 },
  SERVICO: { rotulo: 'Serviços (NFS-e)', descricao: 'Categorias SE/SA/ZL/RL — nota de serviço', ordem: 3 },
  FRETE: { rotulo: 'Frete (CT-e)', descricao: 'CFOP x352/x932 — conhecimento de transporte', ordem: 4 },
  ENERGIA: { rotulo: 'Energia elétrica', descricao: 'CFOP x252 — conta de energia', ordem: 5 },
  COMUNICACAO: { rotulo: 'Comunicação', descricao: 'CFOP x302 — telefonia e dados', ordem: 6 },
  DEVOLUCAO: { rotulo: 'Devoluções a fornecedor', descricao: 'Saída com CFOP de devolução — abate o realizado', ordem: 7 },
  IMOBILIZADO: { rotulo: 'Imobilizado (CAPEX)', descricao: 'CFOP x551/x406 — ativo, fora do custeio', ordem: 8 },
  OUTRAS_ENTRADAS: { rotulo: 'Outras entradas', descricao: 'CFOP x949 — comodato, demonstração, importação a validar', ordem: 9 },
  REMESSA_RETORNO: { rotulo: 'Remessa / retorno', descricao: 'CFOP x9xx — conserto, empréstimo, bonificação', ordem: 10 },
  SAIDA_SEM_CUSTO: { rotulo: 'Outras saídas', descricao: 'Saída sem efeito de custo (remessa para conserto, resíduo)', ordem: 11 },
};

export const ROTULO_ORIGEM_RUBRICA: Record<OrigemRubrica, string> = {
  cfop: 'CFOP',
  fornecedor: 'Fornecedor',
  servico: 'Código de serviço',
  grupo_mercadoria: 'Grupo de mercadoria',
};

export function rotuloOrigemRubrica(origem: OrigemRubrica | null, excluido = false): string {
  if (origem) return ROTULO_ORIGEM_RUBRICA[origem];
  return excluido ? 'Excluído por material' : 'Sem mapeamento';
}

export interface Agregado {
  valor: number;
  valorPago: number;
  qtdNfs: number;
  qtdFornecedores: number;
  qtdItens: number;
}

/** Agregado de uma linha da árvore, com rollup dos filhos. */
export interface LinhaArvoreRubrica extends Agregado {
  rubrica: FinRubrica;
  nivel: number;
  filhos: LinhaArvoreRubrica[];
}

/** Onde o item cai no relatório. `fora` = não é custo (não entra no realizado). */
export type Balde = 'rubrica' | 'material_producao' | 'sem_rubrica' | 'fora';

export function baldeDaLinha(l: Pick<LinhaNfRealizado, 'entra_realizado' | 'rubrica_id' | 'natureza'>): Balde {
  if (!l.entra_realizado) return 'fora';
  if (l.rubrica_id) return 'rubrica';
  return l.natureza === 'MATERIAL_PRODUCAO' ? 'material_producao' : 'sem_rubrica';
}

const chaveNf = (l: LinhaNfRealizado) => `${l.fornecedor_codigo}|${l.numero_nf ?? ''}|${l.serie_nf ?? ''}`;

export function agregar(linhas: LinhaNfRealizado[]): Agregado {
  const nfs = new Set<string>();
  const fornecedores = new Set<string>();
  let valor = 0;
  let valorPago = 0;
  for (const l of linhas) {
    valor += Number(l.valor) || 0;
    valorPago += Number(l.valor_pago_rateado) || 0;
    nfs.add(chaveNf(l));
    fornecedores.add(l.fornecedor_codigo);
  }
  return { valor, valorPago, qtdNfs: nfs.size, qtdFornecedores: fornecedores.size, qtdItens: linhas.length };
}

export interface RelatorioRealizadoNf {
  arvore: LinhaArvoreRubrica[];
  realizado: Agregado;
  emRubricas: Agregado;
  materialProducao: Agregado;
  semRubrica: Agregado;
}

/**
 * Árvore de rubricas com rollup: o valor de uma rubrica-pai soma o próprio
 * (itens mapeados direto nela) com o de todos os descendentes. Contagens de
 * NFs e fornecedores são distintas no conjunto, não somadas.
 */
export function montarRelatorio(rubricas: FinRubrica[], linhas: LinhaNfRealizado[]): RelatorioRealizadoNf {
  const porRubrica = new Map<string, LinhaNfRealizado[]>();
  const material: LinhaNfRealizado[] = [];
  const sem: LinhaNfRealizado[] = [];
  const realizado: LinhaNfRealizado[] = [];
  const emRubricas: LinhaNfRealizado[] = [];

  for (const l of linhas) {
    const balde = baldeDaLinha(l);
    if (balde === 'fora') continue;
    realizado.push(l);
    if (balde === 'rubrica') {
      emRubricas.push(l);
      const lista = porRubrica.get(l.rubrica_id!) ?? [];
      lista.push(l);
      porRubrica.set(l.rubrica_id!, lista);
    } else if (balde === 'material_producao') {
      material.push(l);
    } else {
      sem.push(l);
    }
  }

  const filhosPorPai = new Map<string, FinRubrica[]>();
  for (const r of rubricas) {
    if (!r.rubrica_pai_id) continue;
    const lista = filhosPorPai.get(r.rubrica_pai_id) ?? [];
    lista.push(r);
    filhosPorPai.set(r.rubrica_pai_id, lista);
  }

  const montar = (rubrica: FinRubrica, nivel: number): { linha: LinhaArvoreRubrica; itens: LinhaNfRealizado[] } => {
    const filhos = (filhosPorPai.get(rubrica.id) ?? [])
      .slice()
      .sort((a, b) => a.ordem - b.ordem)
      .map(f => montar(f, nivel + 1));
    const itens = [...(porRubrica.get(rubrica.id) ?? []), ...filhos.flatMap(f => f.itens)];
    return { linha: { rubrica, nivel, ...agregar(itens), filhos: filhos.map(f => f.linha) }, itens };
  };

  const arvore = rubricas
    .filter(r => !r.rubrica_pai_id)
    .sort((a, b) => a.ordem - b.ordem)
    .map(r => montar(r, 0).linha);

  return {
    arvore,
    realizado: agregar(realizado),
    emRubricas: agregar(emRubricas),
    materialProducao: agregar(material),
    semRubrica: agregar(sem),
  };
}

/** Ids da rubrica e de todos os descendentes — o clique numa rubrica-pai traz a composição somada. */
export function coletarIdsComDescendentes(linha: LinhaArvoreRubrica): string[] {
  const ids: string[] = [];
  const visitar = (l: LinhaArvoreRubrica) => {
    ids.push(l.rubrica.id);
    l.filhos.forEach(visitar);
  };
  visitar(linha);
  return ids;
}

export interface LinhaNatureza extends Agregado {
  natureza: NaturezaFiscal;
  rotulo: string;
  descricao: string;
  entraRealizado: boolean;
}

/** Ponte do total de NFs de fornecedor até o realizado, por natureza fiscal. */
export function resumirPorNatureza(linhas: LinhaNfRealizado[]): LinhaNatureza[] {
  const grupos = new Map<NaturezaFiscal, LinhaNfRealizado[]>();
  for (const l of linhas) {
    const lista = grupos.get(l.natureza) ?? [];
    lista.push(l);
    grupos.set(l.natureza, lista);
  }
  return Array.from(grupos.entries())
    .map(([natureza, itens]) => ({
      natureza,
      rotulo: NATUREZAS[natureza]?.rotulo ?? natureza,
      descricao: NATUREZAS[natureza]?.descricao ?? '',
      entraRealizado: itens[0].entra_realizado,
      ...agregar(itens),
    }))
    .sort((a, b) => (NATUREZAS[a.natureza]?.ordem ?? 99) - (NATUREZAS[b.natureza]?.ordem ?? 99));
}

export interface ConsolidadoFornecedor extends Agregado {
  fornecedorCodigo: string;
  fornecedorNome: string;
  rubricas: string[];
}

export function consolidarPorFornecedor(linhas: LinhaNfRealizado[]): ConsolidadoFornecedor[] {
  const grupos = new Map<string, LinhaNfRealizado[]>();
  for (const l of linhas) {
    const lista = grupos.get(l.fornecedor_codigo) ?? [];
    lista.push(l);
    grupos.set(l.fornecedor_codigo, lista);
  }
  return Array.from(grupos.entries())
    .map(([codigo, itens]) => ({
      fornecedorCodigo: codigo,
      fornecedorNome: itens.find(i => i.fornecedor_nome)?.fornecedor_nome || codigo,
      rubricas: Array.from(new Set(itens.map(i => i.rubrica_nome || 'Sem rubrica'))).sort((a, b) => a.localeCompare(b, 'pt-BR')),
      ...agregar(itens),
    }))
    .sort((a, b) => b.valor - a.valor);
}

export interface ConsolidadoItem extends Agregado {
  chave: string;
  descricao: string;
  tipoItem: LinhaNfRealizado['tipo_item'];
  grupoMercadoria: string;
  quantidade: number;
  unidade: string | null;
  rubrica: string;
}

/** Mesmo material/serviço em NFs diferentes vira uma linha só. A chave é o código SAP, não a descrição. */
export function consolidarPorItem(linhas: LinhaNfRealizado[]): ConsolidadoItem[] {
  const grupos = new Map<string, LinhaNfRealizado[]>();
  for (const l of linhas) {
    const chave = l.material || (l.numero_servico ? `SERVICO:${l.numero_servico}` : `DESC:${l.descricao_item ?? ''}`);
    const lista = grupos.get(chave) ?? [];
    lista.push(l);
    grupos.set(chave, lista);
  }
  return Array.from(grupos.entries())
    .map(([chave, itens]) => {
      const unidades = new Set(itens.map(i => i.unidade_medida).filter(Boolean));
      return {
        chave,
        descricao: itens.find(i => i.descricao_item)?.descricao_item || chave,
        tipoItem: itens[0].tipo_item,
        grupoMercadoria: itens.find(i => i.grupo_mercadoria_nome)?.grupo_mercadoria_nome
          || itens.find(i => i.grupo_mercadoria_codigo)?.grupo_mercadoria_codigo
          || 'Sem grupo',
        // Quantidade só faz sentido somada numa unidade única.
        quantidade: unidades.size <= 1 ? itens.reduce((s, i) => s + (Number(i.quantidade) || 0), 0) : NaN,
        unidade: unidades.size === 1 ? (Array.from(unidades)[0] as string) : null,
        rubrica: Array.from(new Set(itens.map(i => i.rubrica_nome || 'Sem rubrica'))).join(' / '),
        ...agregar(itens),
      };
    })
    .sort((a, b) => b.valor - a.valor);
}

/** Recorte por mês de lançamento (YYYY-MM), por fatiamento de string — nunca `new Date(iso)`. */
export function filtrarPorPeriodo(linhas: LinhaNfRealizado[], mesDe: string, mesAte: string): LinhaNfRealizado[] {
  if (!mesDe && !mesAte) return linhas;
  return linhas.filter(l => {
    const mes = (l.data_lancamento || '').slice(0, 7);
    if (!mes) return false;
    if (mesDe && mes < mesDe) return false;
    if (mesAte && mes > mesAte) return false;
    return true;
  });
}
