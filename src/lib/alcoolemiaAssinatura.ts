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

// ---------------------------------------------------------------------------
// A imagem fica fora da lista (27/11/2026): ~56 KB por teste, 33 MB na tabela,
// e o livro do mês trazia todas a cada leitura (Monitor de Desempenho: 190 MB
// num dia de um só aparelho). A lista traz só `assinatura_sorteado_em`; a
// imagem é buscada quando a tela vai mostrar, editar ou imprimir.
// ---------------------------------------------------------------------------

type ComAssinatura = Pick<PortAlcoolemiaTeste, 'assinatura_sorteado' | 'assinatura_sorteado_em'>;

/** Assinado pelo sorteado — vale também com a lista, que não traz a imagem. */
export const testeAssinado = (t: ComAssinatura): boolean => !!(t.assinatura_sorteado || t.assinatura_sorteado_em);

/** Tem assinatura gravada, mas a imagem não veio (teste lido da lista). */
export const faltaImagemAssinatura = (t: ComAssinatura): boolean => !t.assinatura_sorteado && !!t.assinatura_sorteado_em;

export function mesclarAssinaturas<T extends { id: string }>(testes: T[], imagens: Map<string, string>): T[] {
  return testes.map((t) => (imagens.has(t.id) ? { ...t, assinatura_sorteado: imagens.get(t.id)! } : t));
}

/**
 * Edição sem imagem de assinatura não apaga a gravada: a tela pode ter aberto
 * o teste da lista (sem a imagem), e a assinatura é a evidência do teste.
 */
export function semApagarAssinatura<T extends Partial<ComAssinatura>>(dados: T): T {
  if (dados.assinatura_sorteado) return dados;
  const { assinatura_sorteado: _a, assinatura_sorteado_em: _e, ...resto } = dados;
  return resto as T;
}
