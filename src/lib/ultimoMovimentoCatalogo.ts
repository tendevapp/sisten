/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Cadastro de Itens: calculo e classificacao da qtd de dias desde o ultimo
 * movimento de saida/consumo do material na MB51 (baixas 201/221/.../291 +
 * transferencias 311 para producao, ignorando entradas 101).
 */

import { normalizeCode } from './almoxarifado';
import { diasEntre, rotuloDias } from './inventarioCiclico';

/** Limite maximo de dias para alto giro (semaforo verde). */
export const LIMITE_ALTO_GIRO_DIAS = 30;
/** Limite maximo de dias para giro medio (semaforo ambar); acima vira baixo giro. */
export const LIMITE_MEDIO_GIRO_DIAS = 90;

/** TMVs de baixa de consumo na MB51 (exclui estornos pares). */
export const TMV_CONSUMO_SAIDA = ['201', '221', '231', '241', '251', '261', '281', '291'] as const;
/** TMV de transferencia para producao (apenas perna negativa). */
export const TMV_TRANSFERENCIA_SAIDA = '311';

export type FaixaGiroMovimento = 'alto' | 'medio' | 'baixo' | 'sem_movimento';
export type FiltroGiroMovimento = 'todos' | FaixaGiroMovimento;
export type OrdenacaoCatalogo = 'alteracao' | 'movimento_recente' | 'movimento_antigo';

export interface LinhaUltimoMovimento {
  material: string;
  /** YYYY-MM-DD */
  ultima_data: string;
  tipo_movimento: string | null;
}

export interface UltimoMovimentoMaterial {
  material: string;
  /** YYYY-MM-DD */
  ultimaData: string;
  tipoMovimento: string | null;
}

export const ROTULO_FAIXA_GIRO: Record<FaixaGiroMovimento, string> = {
  alto: `Alto giro (≤ ${LIMITE_ALTO_GIRO_DIAS}d)`,
  medio: `Giro médio (${LIMITE_ALTO_GIRO_DIAS + 1}–${LIMITE_MEDIO_GIRO_DIAS}d)`,
  baixo: `Baixo giro (> ${LIMITE_MEDIO_GIRO_DIAS}d)`,
  sem_movimento: 'Sem saída (MB51)',
};

export const OPCOES_ORDENACAO_CATALOGO: ReadonlyArray<{ valor: OrdenacaoCatalogo; rotulo: string }> = [
  { valor: 'alteracao', rotulo: 'Última alteração' },
  { valor: 'movimento_recente', rotulo: 'Alto giro (saída recente)' },
  { valor: 'movimento_antigo', rotulo: 'Mais parado (sem saída / antigo)' },
];

/** Agrupa por codigo SAP normalizado, mantendo a data mais recente. */
export function ultimosMovimentosPorMaterial(
  linhas: LinhaUltimoMovimento[],
): Map<string, UltimoMovimentoMaterial> {
  const mapa = new Map<string, UltimoMovimentoMaterial>();
  for (const linha of linhas) {
    const chave = normalizeCode(linha.material);
    const data = String(linha.ultima_data ?? '').slice(0, 10);
    if (!chave || !/^\d{4}-\d{2}-\d{2}$/.test(data)) continue;

    const atual = mapa.get(chave);
    if (atual && atual.ultimaData >= data) continue;

    const tipo = linha.tipo_movimento ? String(linha.tipo_movimento).trim() : null;
    mapa.set(chave, {
      material: chave,
      ultimaData: data,
      tipoMovimento: tipo || null,
    });
  }
  return mapa;
}

/** Quantidade de dias corridos desde a ultima saida/consumo (null = sem movimento). */
export function diasDesdeUltimoMovimento(
  mov: UltimoMovimentoMaterial | null | undefined,
  hojeISO: string,
): number | null {
  if (!mov?.ultimaData) return null;
  const dias = diasEntre(mov.ultimaData, hojeISO);
  if (!Number.isFinite(dias)) return null;
  return Math.max(0, dias);
}

/** Classifica o giro conforme o semaforo 30/90 dias. */
export function classificarGiroMovimento(dias: number | null): FaixaGiroMovimento {
  if (dias === null) return 'sem_movimento';
  if (dias <= LIMITE_ALTO_GIRO_DIAS) return 'alto';
  if (dias <= LIMITE_MEDIO_GIRO_DIAS) return 'medio';
  return 'baixo';
}

/** Texto curto para a tag: "0d", "12d", "145d" ou "Sem mov.". */
export function textoTagUltimoMovimento(dias: number | null): string {
  if (dias === null) return 'Sem mov.';
  return `${dias}d`;
}

/** Descricao curta do tipo de movimento de saida. */
export function rotuloTipoSaida(tipoMovimento: string | null | undefined): string {
  const limpo = String(tipoMovimento ?? '').trim();
  if (!limpo) return 'Saída';
  if (limpo === TMV_TRANSFERENCIA_SAIDA) return `TMV ${limpo} · Transf. produção`;
  return `TMV ${limpo} · Consumo`;
}

/** Formata YYYY-MM-DD para DD/MM/AAAA sem passar por fuso horario. */
function formatarDataIsoBr(iso: string): string {
  const [ano, mes, dia] = iso.slice(0, 10).split('-');
  if (!ano || !mes || !dia) return iso;
  return `${dia}/${mes}/${ano}`;
}

/** Texto completo para tooltip e acessibilidade da tag. */
export function detalheUltimoMovimento(
  mov: UltimoMovimentoMaterial | null | undefined,
  hojeISO: string,
): string {
  const dias = diasDesdeUltimoMovimento(mov, hojeISO);
  const faixa = classificarGiroMovimento(dias);
  if (dias === null || !mov) {
    return 'Nenhuma saída/consumo registrada na MB51 (baixas 201–291 ou transf. 311).';
  }
  const dataBr = formatarDataIsoBr(mov.ultimaData);
  const tempo = rotuloDias(dias);
  const tipo = rotuloTipoSaida(mov.tipoMovimento);
  return `Última saída: ${dataBr} (${tempo}) · ${tipo} · ${ROTULO_FAIXA_GIRO[faixa]}`;
}

/**
 * Comparador para ordenacao por giro:
 * - 'recente': menor qtd de dias primeiro (0d -> 12d -> 120d -> sem mov.)
 * - 'antigo': mais parado primeiro (sem mov. -> 240d -> 120d -> 0d)
 */
export function compararPorUltimoMovimento(
  aDias: number | null,
  bDias: number | null,
  direcao: 'recente' | 'antigo',
): number {
  const aVal = aDias === null ? Number.POSITIVE_INFINITY : aDias;
  const bVal = bDias === null ? Number.POSITIVE_INFINITY : bDias;
  if (aVal === bVal) return 0;
  return direcao === 'recente' ? aVal - bVal : bVal - aVal;
}
