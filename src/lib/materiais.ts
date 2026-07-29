/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Busca no catálogo de materiais SAP.
 *
 * O catálogo tem 172 mil linhas e descrições em SAP-ês abreviado
 * ("LUVA FM FM197 1/2\" NPT 300#"), onde quase-duplicatas só se distinguem
 * pelo texto técnico. A busca antiga era `ilike '%frase inteira%'` em
 * `description`, sem índice: 1398 ms por tecla, e não achava o item quando a
 * pessoa digitava os atributos fora da ordem do cadastro.
 *
 * A normalização abaixo é do cliente, e serve para a UI decidir: se vale
 * consultar, se o termo é código ou texto, e quais tokens destacar no
 * resultado. O casamento de verdade é da RPC `buscar_materiais`, que normaliza
 * de novo no banco — de propósito: regra de tela não é regra.
 */

import { supabase } from '../db/supabaseClient';
import { formatDateBR, formatQtd } from './format';

export type TipoTermo = 'codigo' | 'texto' | 'curto';

export interface TermoNormalizado {
  tipo: TipoTermo;
  /** Termo sem acento, em caixa alta, espaços colapsados. */
  normalizado: string;
  /** Tokens não vazios do termo normalizado. Vazio quando `tipo` é 'curto'. */
  tokens: string[];
}

/** Abaixo disto a busca devolveria meio catálogo — não vale a consulta. */
const MIN_TEXTO = 2;
/** Prefixo de código curto demais devolve milhares de linhas sem utilidade. */
const MIN_CODIGO = 4;

export function normalizarTermo(bruto: string): TermoNormalizado {
  const normalizado = (bruto ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toUpperCase()
    .trim()
    .replace(/\s+/g, ' ');

  const vazio = (tipo: TipoTermo): TermoNormalizado => ({ tipo, normalizado, tokens: [] });

  if (normalizado === '') return vazio('curto');

  if (/^\d+$/.test(normalizado)) {
    return normalizado.length >= MIN_CODIGO
      ? { tipo: 'codigo', normalizado, tokens: [normalizado] }
      : vazio('curto');
  }

  if (normalizado.length < MIN_TEXTO) return vazio('curto');

  return { tipo: 'texto', normalizado, tokens: normalizado.split(' ') };
}

/** Uma linha do retorno de `buscar_materiais`, já em camelCase. */
export interface MaterialResultado {
  materialCode: string;
  description: string;
  technicalText: string | null;
  unit: string;
  qtdEstoque: number | null;
  depositos: string[] | null;
  rms12m: number | null;
  ultimaRm: string | null;
  rmsSemPedido: number | null;
  rmAberta: string | null;
  pedidoAberto: string | null;
  chegaEm: string | null;
  pedidoPelaArea: boolean;
}

export interface SinalChip {
  texto: string;
  tom: 'estoque' | 'demanda' | 'pedido' | 'uso';
}

/**
 * Sinais que valem chip no resultado.
 *
 * A regra que atravessa tudo aqui: só entra o que existe. Um "0 em estoque"
 * ou "0 RMs" seria lido como informação ("conferi, não tem"), quando na
 * verdade é ausência de dado — 31% das RMs do SAP nem têm área preenchida.
 */
export function resumoSinais(r: MaterialResultado): SinalChip[] {
  const chips: SinalChip[] = [];

  if (r.qtdEstoque && r.qtdEstoque > 0) {
    const onde = r.depositos?.length ? ` em ${r.depositos.join(', ')}` : '';
    chips.push({ texto: `${formatQtd(r.qtdEstoque)} ${r.unit}${onde}`, tom: 'estoque' });
  }

  if (r.rmsSemPedido && r.rmsSemPedido > 0 && r.rmAberta) {
    chips.push({ texto: `RM ${r.rmAberta} aberta, sem pedido`, tom: 'demanda' });
  }

  if (r.pedidoAberto) {
    const quando = r.chegaEm ? ` · chega ${formatDateBR(r.chegaEm)}` : '';
    chips.push({ texto: `Pedido ${r.pedidoAberto}${quando}`, tom: 'pedido' });
  }

  if (r.rms12m && r.rms12m > 0) {
    chips.push({ texto: `${r.rms12m} RMs em 12 meses`, tom: 'uso' });
    if (r.pedidoPelaArea) chips.push({ texto: 'sua área já pediu', tom: 'uso' });
  }

  return chips;
}

/**
 * Consulta a RPC. Devolve lista vazia sem ir ao servidor quando o termo é
 * curto demais para valer a consulta — ver `normalizarTermo`.
 */
export async function buscarMateriais(
  termo: string,
  opts: { areaUsuario?: string | null; limite?: number } = {},
): Promise<MaterialResultado[]> {
  if (normalizarTermo(termo).tipo === 'curto') return [];

  const { data, error } = await supabase.rpc('buscar_materiais', {
    termo,
    area_usuario: opts.areaUsuario ?? null,
    limite: opts.limite ?? 20,
  });

  if (error) throw error;

  return (data ?? []).map((l: Record<string, unknown>) => ({
    materialCode: l.material_code as string,
    description: l.description as string,
    technicalText: (l.technical_text as string) ?? null,
    unit: (l.unit as string) ?? 'UN',
    qtdEstoque: (l.qtd_estoque as number) ?? null,
    depositos: (l.depositos as string[]) ?? null,
    rms12m: (l.rms_12m as number) ?? null,
    ultimaRm: (l.ultima_rm as string) ?? null,
    rmsSemPedido: (l.rms_sem_pedido as number) ?? null,
    rmAberta: (l.rm_aberta as string) ?? null,
    pedidoAberto: (l.pedido_aberto as string) ?? null,
    chegaEm: (l.chega_em as string) ?? null,
    pedidoPelaArea: Boolean(l.pedido_pela_area),
  }));
}
