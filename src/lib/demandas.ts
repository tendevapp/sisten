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

// Paleta categórica validada (node scripts/validate_palette.js, modo claro —
// os painéis de suprimentos não têm variante escura de conteúdo, só a sidebar).
export const DEMANDA_COLORS = {
  requisitado: '#2563eb', // blue-600
  pedido: '#059669',      // emerald-600
  aberto: '#dc2626',      // red-600
  acumulado: '#7c3aed',   // violet-600
  normal: '#059669',      // emerald-600 (mesmo tom de "pedido/ok")
  urgente: '#f59e0b',     // amber-500
  maquinaParada: '#dc2626', // red-600
  material: '#059669',    // emerald-600
  servico: '#2563eb',     // blue-600
} as const;

// Faixas de atraso do backlog (espelha a regra de `localDb.ts`, do menos ao
// mais grave) e sua severidade visual — usado no gráfico de Atraso/SLA.
export const FAIXA_ATRASO_ORDER = ['Sem Atraso', '1-7 dias', '8-15 dias', '16-30 dias', 'Acima 30 dias'] as const;

export const FAIXA_ATRASO_COLOR: Record<string, string> = {
  'Sem Atraso': '#059669',   // emerald-600
  '1-7 dias': '#84cc16',     // lime-500
  '8-15 dias': '#f59e0b',    // amber-500
  '16-30 dias': '#f97316',   // orange-500
  'Acima 30 dias': '#dc2626', // red-600
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
