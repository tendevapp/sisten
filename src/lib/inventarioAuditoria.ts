import { chaveItem, diasEntre, type CandidatoInventario, type HistoricoItem } from './inventarioCiclico';
import type { EstoqueItem } from '../types';

export const CAUSAS_INVENTARIO = {
  em_apuracao: 'Em apuração',
  erro_contagem: 'Possível erro de contagem',
  defasagem_zl0024: 'Possível defasagem da ZL0024',
  movimentacao_pendente: 'Movimentação / documento pendente',
  unidade_embalagem: 'Unidade de medida / embalagem',
  endereco: 'Material em outro endereço',
  divergencia_fisica: 'Diferença física a investigar',
  outros: 'Outra causa',
} as const;
export type CausaInventario = keyof typeof CAUSAS_INVENTARIO;
export const rotuloCausa = (causa?: string | null) => causa ? CAUSAS_INVENTARIO[causa as CausaInventario] ?? causa : 'Não informada';

export interface PendenciaContagem { item_id?: string; material: string; deposito?: string; codigo: string; tipo: string; motivo: string }
export interface PreparacaoInventario {
  id: string; inventario_id: string; solicitado_em: string; solicitado_por: string;
  liberado_em: string | null; liberado_por: string | null; extracao_em: string | null;
  importacao_em: string | null; versao_zl0024: number | null; janela_minutos: number;
  valida_ate: string | null;
}
export interface ContextoAuditoriaInventario {
  preparacao: PreparacaoInventario | null;
  base: { version: number; updated_at: string; row_count: number } | null;
  base_integra: boolean;
  pronta: boolean;
  motivo: string;
  pendencias: PendenciaContagem[];
}

export interface EstimativaEscopo {
  itens: CandidatoInventario[];
  minutos: number;
  excluidosPendencia: number;
}

/** Hipótese operacional editável: preparação 5 min, reserva 20%, deslocamento 1 min/depósito.
 * Sem quantidades na saída: preserva a contagem cega. Não é amostra estatística.
 */
export function sugerirEscopoRapido(
  candidatos: CandidatoInventario[], estoque: EstoqueItem[], historico: Map<string, HistoricoItem>,
  pendencias: PendenciaContagem[], hoje: string, minutosDisponiveis = 30, minutosPorItem = 2,
): EstimativaEscopo {
  if (!Number.isFinite(minutosDisponiveis) || minutosDisponiveis <= 0 || !Number.isFinite(minutosPorItem) || minutosPorItem <= 0) return { itens: [], minutos: 0, excluidosPendencia: 0 };
  const enderecos = new Map<string, Set<string>>();
  for (const e of estoque) {
    const k = chaveItem(String(e.material), String(e.deposito));
    const set = enderecos.get(k) ?? new Set<string>();
    if (e.posicao_estoque?.trim()) set.add(e.posicao_estoque.trim());
    enderecos.set(k, set);
  }
  const bloqueados = new Set(pendencias.map(p => p.material.replace(/^0+/, '')));
  const elegiveis = candidatos.filter(c => !bloqueados.has(c.material.replace(/^0+/, '')));
  const risco = (c: CandidatoInventario) => {
    const h = historico.get(c.chave);
    return (c.classe === 'A' ? 80 : c.classe === 'B' ? 40 : 10) + (h?.jaDivergiu ? 100 : 0)
      + (!h ? 60 : Math.min(60, Math.max(0, diasEntre(h.ultimaData, hoje))));
  };
  const lista = [...elegiveis].sort((a, b) => risco(b) - risco(a) || a.posicao - b.posicao || a.chave.localeCompare(b.chave));
  let tempo = 5;
  const deps = new Set<string>();
  const itens: CandidatoInventario[] = [];
  for (const c of lista) {
    const locais = enderecos.get(c.chave)?.size ?? 0;
    const adicional = minutosPorItem + (locais === 0 ? 1 : Math.max(0, locais - 1))
      + (/^(KG|G|L|M|M2|M3|LT|TON)$/i.test(c.unidade) ? 2 : 0) + (deps.has(c.deposito) ? 0 : 1);
    if ((tempo + adicional) * 1.2 > minutosDisponiveis) continue;
    itens.push(c); deps.add(c.deposito); tempo += adicional;
  }
  itens.sort((a, b) => a.deposito.localeCompare(b.deposito) || [...(enderecos.get(a.chave) ?? [])].sort()[0]?.localeCompare([...(enderecos.get(b.chave) ?? [])].sort()[0] ?? '') || a.material.localeCompare(b.material));
  return { itens, minutos: itens.length ? Math.ceil(tempo * 1.2) : 0, excluidosPendencia: candidatos.length - elegiveis.length };
}
