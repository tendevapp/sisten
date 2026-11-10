/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Devolução e reembolso de item comprado no Mercado Livre
 * (`sup_ml_ocorrencias`, migration 20261109230000). O comprador lança na
 * Central de Compras › M Livre; o Financeiro › Mercado Livre mostra no cartão
 * da compra.
 *
 *   - Reembolso: o vendedor devolveu parte (ou tudo) do valor — em % do item
 *     ("estante reembolsada em 30%") ou em R$.
 *   - Devolução: o item volta ao vendedor. Com `recomprar`, chegou avariado e
 *     precisa ser comprado de novo; fica pendente até marcar a recompra.
 */

export type TipoOcorrenciaMl = 'reembolso' | 'devolucao';

export interface OcorrenciaMl {
  id: string;
  ri: string;
  numero_compra: string | null;
  tipo: TipoOcorrenciaMl;
  percentual: number | null;
  valor: number | null;
  motivo: string | null;
  recomprar: boolean;
  recompra_feita_em: string | null;
  recompra_feita_por_nome: string | null;
  recompra_numero_compra: string | null;
  criado_por_id: string;
  criado_por_nome: string | null;
  created_at: string;
  excluido_em: string | null;
  excluido_por_nome: string | null;
}

export interface NovaOcorrenciaMl {
  tipo: TipoOcorrenciaMl;
  percentual: number | null;
  valor: number | null;
  motivo: string | null;
  recomprar: boolean;
}

export const ROTULO_TIPO_OCORRENCIA_ML: Record<TipoOcorrenciaMl, string> = {
  reembolso: 'Reembolso',
  devolucao: 'Devolução',
};

const arred = (v: number): number => Math.round(v * 100) / 100;

const brl = (v: number): string => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const pct = (v: number): string => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;

/** "Reembolso 30%", "Reembolso R$ 12,00", "Devolução · recomprar", "Devolução · recomprado". */
export function rotuloOcorrenciaMl(oc: Pick<OcorrenciaMl, 'tipo' | 'percentual' | 'valor' | 'recomprar' | 'recompra_feita_em'>): string {
  const partes: string[] = [ROTULO_TIPO_OCORRENCIA_ML[oc.tipo]];
  if (oc.percentual != null) partes.push(pct(oc.percentual));
  else if (oc.valor != null) partes.push(brl(oc.valor));
  let rotulo = partes.join(' ');
  if (oc.tipo === 'devolucao' && oc.recomprar) rotulo += oc.recompra_feita_em ? ' · recomprado' : ' · recomprar';
  return rotulo;
}

/**
 * Valor em R$ do lançamento: o informado; se veio em %, aplicado sobre o
 * valor do item (o do PO, quando houver). Sem base, nulo — a tela mostra só o %.
 */
export function valorOcorrenciaMl(oc: Pick<OcorrenciaMl, 'percentual' | 'valor'>, valorItem?: number | null): number | null {
  if (oc.valor != null) return arred(oc.valor);
  if (oc.percentual != null && valorItem != null && valorItem > 0) return arred((valorItem * oc.percentual) / 100);
  return null;
}

/** Devolução que pede recompra e ainda não foi recomprada. */
export function recompraPendenteMl(oc: Pick<OcorrenciaMl, 'tipo' | 'recomprar' | 'recompra_feita_em' | 'excluido_em'>): boolean {
  return oc.tipo === 'devolucao' && oc.recomprar && !oc.recompra_feita_em && !oc.excluido_em;
}

/** Lançamentos válidos (não excluídos) por item, do mais antigo ao mais novo. */
export function ocorrenciasPorRiMl(lista: OcorrenciaMl[]): Map<string, OcorrenciaMl[]> {
  const mapa = new Map<string, OcorrenciaMl[]>();
  for (const oc of lista) {
    if (oc.excluido_em) continue;
    const doItem = mapa.get(oc.ri) ?? [];
    doItem.push(oc);
    mapa.set(oc.ri, doItem);
  }
  mapa.forEach(doItem => doItem.sort((a, b) => a.created_at.localeCompare(b.created_at)));
  return mapa;
}

/**
 * Lê o que o comprador digitou: reembolso precisa de % (0–100] ou valor > 0;
 * devolução pode vir sem valor. Devolve a mensagem de erro, ou a ocorrência pronta.
 */
export function validarOcorrenciaMl(entrada: {
  tipo: TipoOcorrenciaMl;
  modo: 'percentual' | 'valor';
  quantia: string;
  motivo: string;
  recomprar: boolean;
}): { erro: string } | { ocorrencia: NovaOcorrenciaMl } {
  const texto = entrada.quantia.trim();
  let numero: number | null = null;
  if (texto) {
    const limpo = texto.replace(/[R$%\s]/g, '');
    const normal = limpo.includes(',') ? limpo.replace(/\./g, '').replace(',', '.') : limpo;
    numero = Number(normal);
    if (!Number.isFinite(numero) || numero <= 0) return { erro: 'Informe um número maior que zero.' };
  }
  if (entrada.tipo === 'reembolso' && numero == null) {
    return { erro: entrada.modo === 'percentual' ? 'Informe o percentual reembolsado.' : 'Informe o valor reembolsado.' };
  }
  if (numero != null && entrada.modo === 'percentual' && numero > 100) return { erro: 'O percentual vai até 100%.' };
  const motivo = entrada.motivo.trim() || null;
  return {
    ocorrencia: {
      tipo: entrada.tipo,
      percentual: numero != null && entrada.modo === 'percentual' ? numero : null,
      valor: numero != null && entrada.modo === 'valor' ? arred(numero) : null,
      motivo,
      recomprar: entrada.tipo === 'devolucao' && entrada.recomprar,
    },
  };
}
