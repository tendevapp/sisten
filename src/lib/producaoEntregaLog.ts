/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Log de alterações do Controle de Entrega (prod_tramos_entrega_log).
 *
 * O banco grava cada mudança por trigger (tramo e checklist de expedição):
 * quem, quando e o "de → para" de cada campo. Aqui ficam a leitura e a
 * tradução para a tela — rótulo do campo, valor legível e filtros.
 */

import { supabase } from '../db/supabaseClient';
import { CONFIG_CATEGORIAS, ETAPAS_CHECKLIST_LIBERACAO, type CategoriaEtapa } from './producaoEntrega';

export type OperacaoLog = 'estado_inicial' | 'inclusao' | 'alteracao' | 'exclusao';

export interface AlteracaoCampo {
  campo: string;
  de: unknown;
  para: unknown;
}

export interface RegistroLogEntrega {
  id: number;
  tabela: 'tramo' | 'checklist';
  tramoId: string;
  operacao: OperacaoLog;
  alteracoes: AlteracaoCampo[];
  antes: Record<string, unknown> | null;
  depois: Record<string, unknown> | null;
  alteradoPor: string | null;
  alteradoPorNome: string | null;
  origem: 'app' | 'sistema';
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------

export interface FiltroLogEntrega {
  tramoId?: string;
  /** yyyy-MM-dd, inclusive (dia local). */
  de?: string;
  /** yyyy-MM-dd, inclusive (dia local). */
  ate?: string;
  incluirEstadoInicial?: boolean;
  limite?: number;
}

/** Início do dia local (UTC-3) em ISO, para filtrar created_at. */
const inicioDoDia = (dataISO: string) => `${dataISO}T00:00:00-03:00`;
const fimDoDia = (dataISO: string) => `${dataISO}T23:59:59.999-03:00`;

export async function listarLogEntrega(filtro: FiltroLogEntrega = {}): Promise<RegistroLogEntrega[]> {
  let consulta = (supabase.from as any)('prod_tramos_entrega_log')
    .select('id,tabela,tramo_id,operacao,alteracoes,antes,depois,alterado_por,alterado_por_nome,origem,created_at')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(filtro.limite ?? 1000);
  if (filtro.tramoId) consulta = consulta.eq('tramo_id', filtro.tramoId);
  if (filtro.de) consulta = consulta.gte('created_at', inicioDoDia(filtro.de));
  if (filtro.ate) consulta = consulta.lte('created_at', fimDoDia(filtro.ate));
  if (!filtro.incluirEstadoInicial) consulta = consulta.neq('operacao', 'estado_inicial');
  const { data, error } = await consulta;
  if (error) throw new Error(error.message);
  return (data ?? []).map((l: any): RegistroLogEntrega => ({
    id: Number(l.id),
    tabela: l.tabela,
    tramoId: l.tramo_id,
    operacao: l.operacao,
    alteracoes: Array.isArray(l.alteracoes) ? l.alteracoes : [],
    antes: l.antes,
    depois: l.depois,
    alteradoPor: l.alterado_por,
    alteradoPorNome: l.alterado_por_nome,
    origem: l.origem,
    createdAt: l.created_at,
  }));
}

// ---------------------------------------------------------------------------
// Tradução para a tela
// ---------------------------------------------------------------------------

const ROTULO_CAMPO: Record<string, string> = {
  etapa_categoria: 'Etapa',
  etapa_nome: 'Nome da etapa',
  status_aguardando: 'Aguardando',
  data_entrada_etapa: 'Entrada na etapa',
  dias_espera: 'Dias de espera',
  observacao: 'Observação',
  torre_numero: 'Torre',
  tramo: 'Posição',
  serie: 'Série',
  subprojeto_id: 'Subprojeto',
  projeto: 'Projeto',
  etapa_codigo: 'Item do checklist',
  concluida_em: 'Concluído em',
  concluida_por: 'Responsável',
  excluido_em: 'Desmarcado em',
};

/** Campos internos que não interessam a quem confere o histórico. */
const CAMPOS_OCULTOS = new Set(['id', 'tramo_entrega_id']);

export const rotuloCampo = (campo: string): string => ROTULO_CAMPO[campo] ?? campo;

const ROTULO_CHECKLIST = Object.fromEntries(ETAPAS_CHECKLIST_LIBERACAO.map(e => [e.codigo, e.rotulo]));

/** "2026-10-07T17:03:08.9+00:00" → "07/10/26 14:03" no horário de Brasília (UTC-3). */
export function dataHoraBR(iso: string): string {
  const d = new Date(new Date(iso).getTime() - 3 * 3600000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${String(d.getUTCFullYear()).slice(2)} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

/** Dia local (yyyy-MM-dd) de um instante ISO, para agrupar a lista. */
export function diaLocal(iso: string): string {
  return new Date(new Date(iso).getTime() - 3 * 3600000).toISOString().slice(0, 10);
}

export function valorLegivel(campo: string, valor: unknown): string {
  if (valor === null || valor === undefined || valor === '') return '—';
  if (campo === 'etapa_categoria' && typeof valor === 'string') {
    return CONFIG_CATEGORIAS[valor as CategoriaEtapa]?.rotulo ?? valor;
  }
  if (campo === 'etapa_codigo' && typeof valor === 'string') return ROTULO_CHECKLIST[valor] ?? valor;
  if (typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(valor)) return dataHoraBR(valor);
  return String(valor);
}

export interface LinhaAlteracao {
  campo: string;
  rotulo: string;
  de: string;
  para: string;
}

export function linhasAlteracao(registro: Pick<RegistroLogEntrega, 'alteracoes'>): LinhaAlteracao[] {
  return registro.alteracoes
    .filter(a => !CAMPOS_OCULTOS.has(a.campo))
    .map(a => ({ campo: a.campo, rotulo: rotuloCampo(a.campo), de: valorLegivel(a.campo, a.de), para: valorLegivel(a.campo, a.para) }));
}

/** Frase curta do que aconteceu ("Etapa: Internos → White", "Checklist: concluiu Limpeza…"). */
export function resumoRegistro(r: RegistroLogEntrega): string {
  if (r.operacao === 'estado_inicial') return 'Estado no início do registro';
  if (r.tabela === 'checklist') {
    const codigo = String((r.depois ?? r.antes)?.etapa_codigo ?? '');
    const item = ROTULO_CHECKLIST[codigo] ?? codigo;
    if (r.operacao === 'inclusao') return `Checklist: concluiu "${item}"`;
    if (r.operacao === 'exclusao') return `Checklist: apagou "${item}"`;
    const desmarcou = r.alteracoes.some(a => a.campo === 'excluido_em' && a.para !== null);
    if (desmarcou) return `Checklist: desmarcou "${item}"`;
  }
  if (r.operacao === 'inclusao') return 'Tramo incluído';
  if (r.operacao === 'exclusao') return 'Tramo excluído';
  const etapa = r.alteracoes.find(a => a.campo === 'etapa_categoria');
  if (etapa) return `Etapa: ${valorLegivel('etapa_categoria', etapa.de)} → ${valorLegivel('etapa_categoria', etapa.para)}`;
  const linhas = linhasAlteracao(r);
  return linhas.length ? linhas.map(l => l.rotulo).join(', ') : 'Alteração';
}

export const autorRegistro = (r: Pick<RegistroLogEntrega, 'alteradoPorNome' | 'origem'>): string =>
  r.alteradoPorNome || (r.origem === 'sistema' ? 'Sistema' : 'Usuário sem nome');

/** "Torre 7 · T3 · 3165" a partir da foto mais recente do tramo no registro. */
export function identificacaoTramo(r: RegistroLogEntrega, porId?: Map<string, { torre_numero: number; tramo: string; serie: number }>): string {
  const foto = (r.tabela === 'tramo' ? r.depois ?? r.antes : null) as { torre_numero?: number; tramo?: string; serie?: number } | null;
  const atual = porId?.get(r.tramoId);
  const torre = foto?.torre_numero ?? atual?.torre_numero;
  const tramo = foto?.tramo ?? atual?.tramo;
  const serie = foto?.serie ?? atual?.serie;
  return torre !== undefined ? `Torre ${torre} · ${tramo} · ${serie}` : r.tramoId;
}

export interface FiltroTela {
  busca: string;
  autor: string;
  tipo: '' | 'tramo' | 'checklist';
}

export function filtrarRegistros(
  registros: RegistroLogEntrega[],
  filtro: FiltroTela,
  porId?: Map<string, { torre_numero: number; tramo: string; serie: number }>,
): RegistroLogEntrega[] {
  const termo = filtro.busca.trim().toLowerCase();
  return registros.filter(r => {
    if (filtro.tipo && r.tabela !== filtro.tipo) return false;
    if (filtro.autor && autorRegistro(r) !== filtro.autor) return false;
    if (!termo) return true;
    const texto = [r.tramoId, identificacaoTramo(r, porId), resumoRegistro(r), ...linhasAlteracao(r).flatMap(l => [l.de, l.para])]
      .join(' ')
      .toLowerCase();
    return texto.includes(termo);
  });
}
