/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Identidade visual de cada tipo de solicitação — ícone e cor.
 *
 * Existe porque o tipo era só uma palavra em maiúsculas minúsculas ao lado do
 * número ("COMPRA", "CHAMADO"): numa lista de dez cartões quase idênticos, a
 * única coisa que os diferenciava desaparecia na varredura. Com ícone e cor,
 * o tipo é reconhecido antes de qualquer texto ser lido.
 *
 * As cores saem da paleta categórica de `styles/tokens.css`, que já foi
 * validada nos dois temas — não são hex escolhidos a olho aqui.
 *
 * Um lugar só: cartão da lista, chips de filtro e cabeçalho do detalhe usam
 * esta tabela, então o tipo tem a mesma cara em toda a Central.
 */

import { Database, LifeBuoy, ShoppingCart, Wrench, type LucideIcon } from 'lucide-react';
import type { TipoSolicitacaoFila } from '../../lib/tipoSolicitacao';

export interface TipoVisual {
  rotulo: string;
  /** Plural, para os contadores de filtro ("3 compras"). */
  plural: string;
  icone: LucideIcon;
  fundoFiltroAtivo: string;
  /** Token de cor da paleta categórica. */
  cor: string;
  /** Fundo do chip do ícone: a mesma cor rebaixada, para não competir com o texto. */
  fundo: string;
}

export const TIPO_VISUAL: Record<TipoSolicitacaoFila, TipoVisual> = {
  compra: {
    rotulo: 'Compra',
    plural: 'Compras',
    icone: ShoppingCart,
    fundoFiltroAtivo: 'bg-blue-600',
    cor: 'var(--series-1)',
    fundo: 'color-mix(in srgb, var(--series-1) 14%, transparent)',
  },
  servico: {
    rotulo: 'Serviço',
    plural: 'Serviços',
    icone: Wrench,
    fundoFiltroAtivo: 'bg-teal-700',
    cor: 'var(--series-3)',
    fundo: 'color-mix(in srgb, var(--series-3) 14%, transparent)',
  },
  cadastro_sap: {
    rotulo: 'Cadastro SAP',
    plural: 'Cadastros SAP',
    icone: Database,
    fundoFiltroAtivo: 'bg-purple-600',
    cor: 'var(--series-7)',
    fundo: 'color-mix(in srgb, var(--series-7) 14%, transparent)',
  },
  chamado: {
    rotulo: 'Chamado',
    plural: 'Chamados',
    icone: LifeBuoy,
    fundoFiltroAtivo: 'bg-orange-600',
    cor: 'var(--series-2)',
    fundo: 'color-mix(in srgb, var(--series-2) 14%, transparent)',
  },
};

/** Ordem fixa nos filtros — a mesma do formulário de Nova Solicitação. */
export const TIPOS_EM_ORDEM: TipoSolicitacaoFila[] = ['compra', 'servico', 'cadastro_sap', 'chamado'];
