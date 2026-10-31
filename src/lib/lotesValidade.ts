/** Um lote e sua validade permanecem associados em cada linha. */
export interface LoteValidade {
  lote: string | null;
  validade: string | null;
}

export function normalizarLotesValidade(lotes: readonly LoteValidade[] = []): LoteValidade[] {
  return lotes.map(l => ({ lote: l.lote?.trim() || null, validade: l.validade?.trim() || null }))
    .filter(l => l.lote !== null || l.validade !== null);
}

export function formatarLotesValidade(lotes: readonly LoteValidade[] = []): string {
  return normalizarLotesValidade(lotes).map(l => {
    const validade = l.validade ? l.validade.split('-').reverse().join('/') : 'não informada';
    return `Lote: ${l.lote || 'não informado'} · Validade: ${validade}`;
  }).join('\n');
}
