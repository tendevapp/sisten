import { normalizarLotesValidade, type LoteValidade } from './lotesValidade';

export type LoteValidadeCatalogo = LoteValidade;
export const normalizarLotesCatalogo = normalizarLotesValidade;

/** Aceita também o cache e registros anteriores à lista, sem perder o par único antigo. */
export function lotesDoCatalogo(item?: {
  lotes_validade?: LoteValidadeCatalogo[] | null; lote?: string | null; validade?: string | null;
} | null): LoteValidadeCatalogo[] {
  return item?.lotes_validade != null ? normalizarLotesCatalogo(item.lotes_validade)
    : normalizarLotesCatalogo([{ lote: item?.lote ?? null, validade: item?.validade ?? null }]);
}
