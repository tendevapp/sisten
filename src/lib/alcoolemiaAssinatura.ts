/**
 * Assinatura do sorteado no teste de alcoolemia: a mesma colhida na Portaria
 * (no sorteio ou na aferição) e no termo do SSMA — um só campo do teste
 * (`assinatura_sorteado` + `assinatura_sorteado_em`).
 */
import type { PortAlcoolemiaTeste } from '../types';

export interface AssinaturaColhida { img: string; em: string }

/** Assinatura gravada no teste, no formato que os formulários usam. */
export function assinaturaDoTeste(t: Pick<PortAlcoolemiaTeste, 'assinatura_sorteado' | 'assinatura_sorteado_em' | 'updated_at'>): AssinaturaColhida | null {
  return t.assinatura_sorteado
    ? { img: t.assinatura_sorteado, em: t.assinatura_sorteado_em || t.updated_at }
    : null;
}

/** Assinou agora: guarda a imagem com o horário; removeu: null. */
export const assinaturaColhida = (img: string | null): AssinaturaColhida | null =>
  (img ? { img, em: new Date().toISOString() } : null);
