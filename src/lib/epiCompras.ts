/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Compras × Book de EPIs. Na Nova Solicitação, item de EPI avisa se está no
 * Book (e leva o CA para a observação) ou se precisa passar pela Segurança do
 * Trabalho. A situação vem da RPC `sup_epi_status_materiais`.
 */

import { supabase } from '../db/supabaseClient';

export interface StatusEpiMaterial {
  codigo: string;
  eh_grupo_epi: boolean;
  no_book: boolean;
  book_inativo: boolean;
  cas: string[];
  descricao_book: string | null;
}

export type SituacaoEpi =
  /** No Book, com variante ativa. */
  | 'no_book'
  /** No Book, mas todas as variantes estão inativas. */
  | 'book_inativo'
  /** Grupo de EPI no SAP e fora do Book. */
  | 'fora_do_book'
  /** Não é EPI — sem aviso. */
  | 'nao_epi';

export function situacaoEpi(status: StatusEpiMaterial | undefined): SituacaoEpi {
  if (!status) return 'nao_epi';
  if (status.no_book) return 'no_book';
  if (status.book_inativo) return 'book_inativo';
  return status.eh_grupo_epi ? 'fora_do_book' : 'nao_epi';
}

/** Chave de comparação de código SAP: sem espaços nem zeros à esquerda. */
export function chaveCodigoSap(codigo: string | null | undefined): string {
  return (codigo || '').trim().replace(/^0+/, '');
}

/**
 * CAs em texto de uma linha. O Book guarda certificados múltiplos na mesma
 * célula com quebra de linha ("8304\n498") e às vezes "não aplicável" —
 * só número de CA vai para a observação.
 */
export function formatarCas(cas: string[]): string {
  const unicos = new Set<string>();
  for (const ca of cas) {
    for (const parte of ca.split(/[\r\n/;,]+/)) {
      const limpo = parte.trim();
      if (/\d/.test(limpo)) unicos.add(limpo);
    }
  }
  return [...unicos].join(' / ');
}

/** Rótulo da linha que a solicitação ganha — também serve para achá-la de volta. */
export const MARCA_CA_BOOK = 'CA (Book de EPIs):';

const LINHA_CA_BOOK = /^[ \t]*CA \(Book de EPIs\):.*$/gim;

/** Tira a linha de CA acrescentada automaticamente, preservando o resto. */
export function removerCaDaObservacao(observacao: string | null | undefined): string {
  return (observacao || '')
    .replace(LINHA_CA_BOOK, '')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

/**
 * Coloca (ou atualiza) o CA do Book na observação do item, na última linha.
 * Sem CA numérico, devolve a observação sem a linha.
 */
export function aplicarCaNaObservacao(observacao: string | null | undefined, cas: string[]): string {
  const base = removerCaDaObservacao(observacao);
  const texto = formatarCas(cas);
  if (!texto) return base;
  const linha = `${MARCA_CA_BOOK} ${texto}`;
  return base ? `${base}\n${linha}` : linha;
}

export async function buscarStatusEpiMateriais(codigos: string[]): Promise<Map<string, StatusEpiMaterial>> {
  const unicos = [...new Set(codigos.map(c => c.trim()).filter(Boolean))];
  const resultado = new Map<string, StatusEpiMaterial>();
  if (!unicos.length) return resultado;
  const { data, error } = await (supabase.rpc as any)('sup_epi_status_materiais', { p_codigos: unicos });
  if (error) throw error;
  for (const linha of (data || []) as StatusEpiMaterial[]) {
    resultado.set(chaveCodigoSap(linha.codigo), { ...linha, cas: linha.cas || [] });
  }
  return resultado;
}
