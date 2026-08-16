/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { format, startOfISOWeek, endOfISOWeek, getISOWeek, startOfMonth, parseISO, isValid } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// Espelha a regra da view Supabase `vw_demandas`: os 2 primeiros dígitos de
// `requisicao_de_compra` classificam a RI. Confirmado contra os dados reais
// (prefixo 11 = ZR01/Normal, 12 = ZR02/Urgente, 17 = ZR11/ZR16/Serviço).
export type TipoDemanda = 'material' | 'servico' | 'outro';
export type Criticidade = 'normal' | 'urgente' | 'maquina_parada';
export type TipoItemFilter = 'todos' | 'consumo' | 'projeto';

/**
 * Verifica se um codigo de material pertence a item de projeto
 * (codigos que comecam com 1000000 / 100000 / 100000000, faixa de 18 digitos do SAP).
 */
export function isProjetoItem(materialCode?: string | null): boolean {
  if (!materialCode || materialCode === '—') return false;
  const clean = String(materialCode).trim().replace(/^0+/, '');
  return clean.startsWith('100000') || String(materialCode).trim().startsWith('100000');
}

export function classifyTipoDemanda(requisicaoDeCompra: string | null | undefined): TipoDemanda {
  const prefix = (requisicaoDeCompra || '').slice(0, 2);
  if (prefix === '11' || prefix === '12' || prefix === '13') return 'material';
  if (prefix === '17') return 'servico';
  return 'outro';
}

export function classifyCriticidade(requisicaoDeCompra: string | null | undefined): Criticidade | null {
  const prefix = (requisicaoDeCompra || '').slice(0, 2);
  if (prefix === '11') return 'normal';
  if (prefix === '12') return 'urgente';
  if (prefix === '13') return 'maquina_parada';
  return null;
}

// Criticidade a partir da `natureza` derivada (tipo_documento) — funciona tanto
// para materiais (Normal/Urgente/Máquina Parada) quanto para serviços (Serviço -
// Normal/Urgente/MP), ao contrário de `classifyCriticidade`, que só lê o prefixo
// 11/12/13 da RM e portanto não distingue urgência de serviço (todos prefixo 17).
// Mesma regra usada no cálculo de lead time em localDb.ts.
export function classifyCriticidadeNatureza(natureza: string | null | undefined): Criticidade | null {
  const n = (natureza || '').toLowerCase();
  if (!n) return null;
  if (n.includes('urgente')) return 'urgente';
  if (n.includes('máquina parada') || n.includes('maquina parada') || /\bmp\b/.test(n)) return 'maquina_parada';
  if (n.includes('normal')) return 'normal';
  return null;
}

export const CRITICIDADE_LABEL: Record<Criticidade, string> = {
  normal: 'Normal',
  urgente: 'Urgente',
  maquina_parada: 'Máquina Parada',
};

export const TIPO_DEMANDA_LABEL: Record<TipoDemanda, string> = {
  material: 'Materiais',
  servico: 'Serviços',
  outro: 'Outros',
};

/**
 * Cores das séries de demandas, como referências a token.
 *
 * Duas escalas diferentes convivem aqui, de propósito:
 *
 * - Identidade (requisitado, pedido, aberto, material, serviço) usa slots
 *   categóricos em ordem fixa. Ficam nos três primeiros slots, os únicos que
 *   passam a validação de todos-os-pares nos dois temas.
 * - Criticidade (normal, urgente, máquina parada) usa a escala de *status*:
 *   ela significa gravidade, não identidade. Status é reservado e vem sempre
 *   acompanhado de rótulo — nunca cor sozinha.
 *
 * Valem em CSS. No Recharts, use `useChartTokens()`: `var()` não resolve em
 * atributo de apresentação SVG.
 */
export const DEMANDA_COLORS = {
  requisitado: 'var(--series-1)',   // azul
  pedido: 'var(--series-3)',        // água
  aberto: 'var(--series-2)',        // laranja
  acumulado: 'var(--series-7)',     // violeta
  material: 'var(--series-1)',
  servico: 'var(--series-2)',
  normal: 'var(--status-good)',
  urgente: 'var(--status-warning)',
  maquinaParada: 'var(--status-critical)',
} as const;

/**
 * Mesmo mapa, mas por chave do objeto devolvido por `useChartTokens()` — é o
 * que os gráficos consomem.
 */
export type DemandaSerie = keyof typeof DEMANDA_COLORS;

export function demandaColor(tokens: {
  series: string[];
  status: Record<'good' | 'warning' | 'serious' | 'critical', string>;
}, serie: DemandaSerie): string {
  switch (serie) {
    case 'requisitado':
    case 'material':
      return tokens.series[0];
    case 'aberto':
    case 'servico':
      return tokens.series[1];
    case 'pedido':
      return tokens.series[2];
    case 'acumulado':
      return tokens.series[6];
    case 'normal':
      return tokens.status.good;
    case 'urgente':
      return tokens.status.warning;
    case 'maquinaParada':
      return tokens.status.critical;
  }
}

// Faixas de atraso do backlog (espelha a regra de `localDb.ts`, do menos ao
// mais grave) e sua severidade visual — usado no gráfico de Atraso/SLA.
export const FAIXA_ATRASO_ORDER = ['Sem Atraso', '1-7 dias', '8-15 dias', '16-30 dias', 'Acima 30 dias'] as const;

/**
 * Faixa de atraso é escala *ordinal*: as faixas têm ordem, e trocá-las mudaria
 * o sentido. Por isso é uma rampa de um matiz só, do passo mais fraco (sem
 * atraso) ao mais forte (acima de 30 dias) — o leitor vê a ordem na própria
 * cor. O arco-íris verde→lima→âmbar→laranja→vermelho anterior gastava cinco
 * matizes para codificar uma coisa que é uma dimensão só, e colidia com a
 * escala de status usada na criticidade.
 *
 * A gravidade não fica só na cor: a faixa crítica leva ícone e rótulo.
 */
export const FAIXA_ATRASO_COLOR: Record<string, string> = {
  'Sem Atraso': 'var(--atraso-1)',
  '1-7 dias': 'var(--atraso-2)',
  '8-15 dias': 'var(--atraso-3)',
  '16-30 dias': 'var(--atraso-4)',
  'Acima 30 dias': 'var(--atraso-5)',
};

/** Índice da faixa na rampa, para os gráficos lerem de `useChartTokens().atraso`. */
export const FAIXA_ATRASO_INDEX: Record<string, number> = {
  'Sem Atraso': 0,
  '1-7 dias': 1,
  '8-15 dias': 2,
  '16-30 dias': 3,
  'Acima 30 dias': 4,
};

// Agrupamento temporal compartilhado pelos gráficos e tabelas de demandas.
export type Granularidade = 'dia' | 'semana' | 'mes';

export interface BucketInfo {
  key: string;
  label: string;
  // Só preenchido para 'semana': intervalo de datas (dd/MM-dd/MM) exibido no
  // tooltip do gráfico, já que o rótulo do eixo mostra só "S<nº da semana ISO>".
  rangeLabel?: string;
}

export function bucketDate(dateStr: string | null | undefined, granularidade: Granularidade): BucketInfo | null {
  if (!dateStr) return null;
  const d = parseISO(dateStr);
  if (!isValid(d)) return null;
  if (granularidade === 'dia') {
    return { key: format(d, 'yyyy-MM-dd'), label: format(d, 'dd/MM') };
  }
  if (granularidade === 'semana') {
    const s = startOfISOWeek(d);
    const e = endOfISOWeek(d);
    return {
      key: format(s, 'yyyy-MM-dd'),
      label: `S${getISOWeek(d)}`,
      rangeLabel: `${format(s, 'dd/MM')}-${format(e, 'dd/MM')}`,
    };
  }
  const s = startOfMonth(d);
  return { key: format(s, 'yyyy-MM'), label: format(s, 'MMM/yy', { locale: ptBR }) };
}

// Data que "corta" um registro para fins de filtro por período e de bucketing
// nos gráficos/tabela: uma vez com PO colocado, o registro passa a pertencer
// ao período do pedido (data_pedido), não mais ao da requisição original —
// senão uma RM antiga que só ganha PO dentro do período filtrado reaparece
// com sua data de solicitação (fora do período) nos gráficos. Enquanto ainda
// está aberto (sem PO), o corte permanece a data de solicitação.
export function resolveDataCorte(record: {
  status_requisicao: string;
  data_solicitacao: string;
  data_pedido?: string | null;
}): string {
  if (record.status_requisicao === 'Processado' && record.data_pedido) return record.data_pedido;
  return record.data_solicitacao;
}

export interface CompradorInfo {
  grupo_compras: string;
  nome_comprador: string;
  usuario_sistema?: string | null;
  // E-mail do usuário SISTEN correspondente, usado para rotear notificações
  // (ex.: mensagens do Rastreio Compras) diretamente ao comprador do grupo.
  email?: string | null;
}

// Atribui o comprador responsável por um registro: prioriza quem de fato
// lançou o PO no SAP (criado_por_pedido, via compradores.usuario_sistema) —
// só existe quando já há pedido colocado — e cai para o grupo de compras
// atribuído à requisição (grupo_comprador) quando ainda não há PO ou quando
// o criador não está mapeado. Confirmado contra dados reais: o grupo
// atribuído e o login de quem coloca o PO às vezes divergem (cobertura entre
// compradores), então a atribuição por criador é a mais fiel ao trabalho
// realizado.
export function resolveComprador(
  record: { grupo_comprador?: string | null; criado_por_pedido?: string | null },
  compradores: CompradorInfo[]
): string {
  if (record.criado_por_pedido) {
    const byUser = compradores.find(c => c.usuario_sistema && c.usuario_sistema === record.criado_por_pedido);
    if (byUser) return byUser.nome_comprador;
  }
  const grupo = record.grupo_comprador || '';
  const byGroup = compradores.find(c => c.grupo_compras === grupo);
  if (byGroup) return byGroup.nome_comprador;
  return grupo ? `Grupo ${grupo}` : 'Não atribuído';
}
