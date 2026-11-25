import type { Request, RequestType } from '../types';

export type TipoSolicitacaoFila = RequestType | 'servico';

export function ehSolicitacaoServico(tipoCompra?: string | null): boolean {
  const normalizado = (tipoCompra || '')
    .trim()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
  return normalizado === 'servico';
}

export function tipoNaFila(r: Pick<Request, 'type' | 'tipo_compra'>): TipoSolicitacaoFila {
  return r.type === 'compra' && ehSolicitacaoServico(r.tipo_compra) ? 'servico' : r.type;
}
