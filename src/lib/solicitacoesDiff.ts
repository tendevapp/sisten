/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Diff de edição de solicitação de compra — o que mudou entre a versão salva
 * e a que o solicitante acabou de enviar.
 *
 * Usado em dois lugares que precisam da mesma frase: o histórico de status
 * (`saveRequestEdit`, em `db/localDb.ts`) e, quando a solicitação já tinha
 * saído numa planilha de RM, a reabertura automática do registro de
 * exportação (`lib/almoxarifadoRmApi.ts`). Módulo à parte, sem depender de
 * `localDb` nem de `lib/solicitacoes.ts` (que por sua vez depende do
 * `localDb`), para não fechar um ciclo de import.
 */

import type { Request } from '../types';
import { formatDateBR } from './format';

/** Mesmo rótulo de `rotuloCriticidade` em `lib/solicitacoes.ts` — duplicado
 *  aqui, e não importado, para este módulo não depender de nada que volte a
 *  depender do `localDb`. */
const ROTULO_CRITICIDADE: Record<number, string> = {
  1: '1 - Baixa',
  2: '2 - Moderada',
  3: '3 - Urgente',
  4: '4 - Crítica',
  5: '5 - Impeditiva',
};
const rotuloCriticidade = (n: number): string => ROTULO_CRITICIDADE[n] || String(n);

/**
 * Só os campos de item que o formulário de compra deixa editar, com `id`
 * opcional — item novo, incluído na própria edição, ainda não tem um.
 */
export interface ItemParaDiff {
  id?: string;
  description: string;
  sap_code?: string;
  quantity: number;
  unit: string;
  observation?: string;
  brand?: string;
}

/**
 * Compara a solicitação (e seus itens) antes e depois de uma edição e devolve
 * uma frase por mudança encontrada, em ordem: campos da solicitação primeiro,
 * depois itens removidos, incluídos e alterados.
 *
 * Cobre só os campos que o formulário de compra realmente deixa editar
 * (`NewRequest.tsx`) — nada aqui tenta adivinhar mudança em campo que o
 * solicitante não controla.
 */
export function descreverAlteracoesCompra(
  anterior: Request,
  itensAnteriores: ItemParaDiff[],
  atual: Request,
  itensNovos: ItemParaDiff[],
): string[] {
  const mudancas: string[] = [];

  if (atual.criticality !== anterior.criticality) {
    mudancas.push(
      `Criticidade alterada de ${rotuloCriticidade(anterior.criticality)} para ${rotuloCriticidade(atual.criticality)}`,
    );
  }

  if ((atual.tipo_compra || '') !== (anterior.tipo_compra || '')) {
    mudancas.push(`Tipo de compra alterado de ${anterior.tipo_compra || '—'} para ${atual.tipo_compra || '—'}`);
  }

  if ((atual.data_necessidade || '') !== (anterior.data_necessidade || '')) {
    if (anterior.data_necessidade && atual.data_necessidade) {
      mudancas.push(
        `Data de necessidade alterada de ${formatDateBR(anterior.data_necessidade)} para ${formatDateBR(atual.data_necessidade)}`,
      );
    } else if (atual.data_necessidade) {
      mudancas.push(`Data de necessidade definida para ${formatDateBR(atual.data_necessidade)}`);
    } else {
      mudancas.push('Data de necessidade removida');
    }
  }

  if ((atual.justificativa || '').trim() !== (anterior.justificativa || '').trim()) {
    mudancas.push('Justificativa alterada');
  }

  const anterioresPorId = new Map(itensAnteriores.filter(i => i.id).map(i => [i.id as string, i]));
  const idsNovosVistos = new Set<string>();

  for (const novo of itensNovos) {
    const antigo = novo.id ? anterioresPorId.get(novo.id) : undefined;

    if (!antigo) {
      mudancas.push(`Item incluído: ${novo.description} (${novo.quantity} ${novo.unit})`);
      continue;
    }
    idsNovosVistos.add(novo.id as string);

    if (novo.quantity !== antigo.quantity) {
      const cresceu = novo.quantity > antigo.quantity;
      mudancas.push(
        `Quantidade de "${novo.description}" ${cresceu ? 'aumentada' : 'reduzida'} de ${antigo.quantity} para ${novo.quantity} ${novo.unit}`,
      );
    }
    if ((novo.description || '').trim() !== (antigo.description || '').trim()) {
      mudancas.push(`Descrição alterada de "${antigo.description}" para "${novo.description}"`);
    }
    if ((novo.sap_code || '') !== (antigo.sap_code || '')) {
      mudancas.push(
        novo.sap_code
          ? `Código SAP de "${novo.description}" definido para ${novo.sap_code}`
          : `Código SAP de "${antigo.description}" removido`,
      );
    }
    if ((novo.observation || '').trim() !== (antigo.observation || '').trim()) {
      mudancas.push(`Observação de "${novo.description}" alterada`);
    }
    if ((novo.brand || '') !== (antigo.brand || '')) {
      mudancas.push(`Marca de "${novo.description}" alterada`);
    }
  }

  // Removido: tinha id antes e não apareceu entre os vistos acima.
  for (const antigo of itensAnteriores) {
    if (antigo.id && !idsNovosVistos.has(antigo.id)) {
      mudancas.push(`Item removido: ${antigo.description} (${antigo.quantity} ${antigo.unit})`);
    }
  }

  return mudancas;
}

/** Junta as mudanças numa frase só, pronta para comentário ou notificação. */
export function resumoAlteracoes(mudancas: string[]): string {
  return mudancas.length > 0 ? mudancas.join('; ') : 'sem alterações identificadas nos campos monitorados';
}

/**
 * Categoria de uma frase de `descreverAlteracoesCompra`, para a UI trocar
 * texto corrido por um ícone — a mesma frase, olhada de outro jeito.
 */
export type TipoMudanca =
  | 'item_incluido'
  | 'item_removido'
  | 'quantidade_aumentada'
  | 'quantidade_reduzida'
  | 'codigo_sap'
  | 'descricao'
  | 'observacao'
  | 'marca'
  | 'criticidade'
  | 'tipo_compra'
  | 'data_necessidade'
  | 'justificativa'
  | 'outro';

/** Classifica uma frase pelo prefixo fixo que `descreverAlteracoesCompra` sempre usa. */
export function classificarMudanca(mudanca: string): TipoMudanca {
  if (mudanca.startsWith('Item incluído')) return 'item_incluido';
  if (mudanca.startsWith('Item removido')) return 'item_removido';
  if (mudanca.startsWith('Quantidade') && mudanca.includes('aumentada')) return 'quantidade_aumentada';
  if (mudanca.startsWith('Quantidade') && mudanca.includes('reduzida')) return 'quantidade_reduzida';
  if (mudanca.startsWith('Código SAP')) return 'codigo_sap';
  if (mudanca.startsWith('Descrição alterada')) return 'descricao';
  if (mudanca.startsWith('Observação')) return 'observacao';
  if (mudanca.startsWith('Marca')) return 'marca';
  if (mudanca.startsWith('Criticidade')) return 'criticidade';
  if (mudanca.startsWith('Tipo de compra')) return 'tipo_compra';
  if (mudanca.startsWith('Data de necessidade')) return 'data_necessidade';
  if (mudanca.startsWith('Justificativa')) return 'justificativa';
  return 'outro';
}

/**
 * Quebra um motivo de reabertura em frases individuais, uma por mudança.
 *
 * Tolera o formato antigo, de antes de `reaberto_por_nome` virar coluna
 * própria, em que o motivo vinha como `Alterada por NOME: mudança1; mudança2`
 * — o prefixo é descartado, porque quem editou e quando já aparecem nos
 * campos estruturados da marca.
 */
export function dividirMudancas(motivo?: string | null): string[] {
  if (!motivo) return [];
  const semPrefixo = motivo.replace(/^Alterada por [^:]+:\s*/i, '').trim();
  if (!semPrefixo) return [];
  return semPrefixo.split(/;\s*/).map(s => s.trim()).filter(Boolean);
}
