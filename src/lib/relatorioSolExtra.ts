/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Relatório consolidado das Solicitações Extraordinárias (FRM.ALM-0013, de
 * Projeto e Sem Saldo) — regras puras; o PDF fica em
 * `pdfExport/exportRelatorioSolExtraPdf.ts`.
 *
 * Cada material lançado vira uma linha com a sua situação de baixa:
 *  - `baixado`        — a solicitação já foi regularizada (doc SAP ou RQB);
 *  - `liberado`       — pendente, mas a ZL0024 de hoje já cobre o item:
 *                       dá para regularizar / dar baixa;
 *  - `aguardando_nf`  — pendente e sem saldo: a NF ainda não entrou. Para
 *                       esses o relatório mostra o PO aberto do material;
 *  - `pendente`       — pendente, mas a ZL0024 não pôde ser lida.
 *
 * A cobertura pelo saldo é a mesma da tela (`coberturaItensPendentes`, que
 * reparte o saldo da mais antiga para a mais nova entre TODAS as pendentes).
 *
 * Datas são texto ISO (`YYYY-MM-DD`) do começo ao fim: `new Date('2026-09-01')`
 * volta como 31/08 em UTC-3. A semana é a ISO (segunda a domingo).
 */

import { normalizeCode } from './almoxarifado';
import { descreverMotivo, TIPO_SOL_EXTRA_ROTULO, type StatusSolExtra, type TipoSolExtra } from './solicitacaoExtra';
import type { SolExtra } from './solicitacaoExtraApi';
import { documentoComItem, type SituacaoMaterial } from './situacaoMaterial';

export type ModoRelatorio = 'analitico' | 'sintetico';
export type AgrupamentoRelatorio = 'item' | 'dia' | 'semana' | 'mes';

export const ROTULO_MODO_RELATORIO: Record<ModoRelatorio, string> = {
  analitico: 'Analítico (detalhado)',
  sintetico: 'Sintético',
};

export const ROTULO_AGRUPAMENTO: Record<AgrupamentoRelatorio, string> = {
  item: 'Por item',
  dia: 'Por dia',
  semana: 'Por semana',
  mes: 'Por mês',
};

export interface FiltroRelatorioSolExtra {
  /** Inclusivos, `YYYY-MM-DD`; null = sem limite. */
  de: string | null;
  ate: string | null;
  tipo: TipoSolExtra | 'todos';
  status: StatusSolExtra | 'todos';
}

export type SituacaoItemRelatorio = 'baixado' | 'liberado' | 'aguardando_nf' | 'pendente';

export const ROTULO_SITUACAO_ITEM: Record<SituacaoItemRelatorio, string> = {
  baixado: 'Baixado',
  liberado: 'Liberado p/ baixa',
  aguardando_nf: 'Aguardando NF',
  pendente: 'Pendente',
};

export interface LinhaRelatorioSolExtra {
  registroId: string;
  codigo: string;
  data: string;
  tipo: TipoSolExtra;
  status: StatusSolExtra;
  /** Projeto/tramo (Projeto) ou quem retirou (Sem Saldo). */
  referencia: string;
  /** Motivo (Projeto) ou setor solicitante (Sem Saldo). */
  detalhe: string;
  /** Doc SAP da regularização ou RQB da baixa. */
  baixa: string | null;
  material: string;
  descricao: string;
  unidade: string;
  quantidade: number;
  situacao: SituacaoItemRelatorio;
}

/** Recorte do relatório; ordem cronológica (data, depois código). */
export function filtrarParaRelatorio(registros: SolExtra[], f: FiltroRelatorioSolExtra): SolExtra[] {
  return registros
    .filter(r => !r.excluido_em)
    .filter(r => (!f.de || r.data >= f.de) && (!f.ate || r.data <= f.ate))
    .filter(r => f.tipo === 'todos' || r.tipo === f.tipo)
    .filter(r => f.status === 'todos' || r.status === f.status)
    .sort((a, b) => a.data.localeCompare(b.data) || (a.codigo || '').localeCompare(b.codigo || '') || a.created_at.localeCompare(b.created_at));
}

/**
 * Uma linha por material lançado. `cobertura` vem de
 * `coberturaItensPendentes`; null = ZL0024 não lida (pendentes ficam
 * "Pendente", sem dizer se já têm saldo).
 */
export function linhasRelatorio(registros: SolExtra[], cobertura: Map<string, boolean[]> | null): LinhaRelatorioSolExtra[] {
  const linhas: LinhaRelatorioSolExtra[] = [];
  for (const r of registros) {
    const cobertos = cobertura?.get(r.id);
    const referencia = r.tipo === 'SEM_SALDO'
      ? [r.retirante_nome, r.retirante_matricula && `mat. ${r.retirante_matricula}`].filter(Boolean).join(' · ')
      : [r.projeto, r.tramo && `tramo ${r.tramo}`].filter(Boolean).join(' · ');
    const detalhe = r.tipo === 'SEM_SALDO' ? r.setor_solicitante_nome || '' : descreverMotivo(r);
    r.itens.forEach((it, i) => {
      let situacao: SituacaoItemRelatorio;
      if (r.status === 'REGULARIZADA') situacao = 'baixado';
      else if (!cobertura) situacao = 'pendente';
      else situacao = cobertos?.[i] ? 'liberado' : 'aguardando_nf';
      linhas.push({
        registroId: r.id,
        codigo: r.codigo || 'A sincronizar',
        data: r.data,
        tipo: r.tipo,
        status: r.status,
        referencia,
        detalhe,
        baixa: r.doc_sap || r.requisicao_balcao_codigo || null,
        material: (it.material || '').trim(),
        descricao: (it.descricao || '').trim(),
        unidade: (it.unidade || 'UN').trim(),
        quantidade: Number(it.quantidade) || 0,
        situacao,
      });
    });
  }
  return linhas;
}

export const ehPendente = (s: SituacaoItemRelatorio) => s !== 'baixado';

// ---------------------------------------------------------------------------
// Períodos
// ---------------------------------------------------------------------------

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const ddmmaaaa = (iso: string) => `${ddmm(iso)}/${iso.slice(0, 4)}`;

/** Soma dias a uma data ISO em UTC (sem fuso: só aritmética de calendário). */
function somarDias(iso: string, dias: number): string {
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

/** Segunda-feira da semana ISO da data. */
export function inicioSemanaISO(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number);
  const diaSemana = new Date(Date.UTC(a, m - 1, d)).getUTCDay(); // 0 = domingo
  return somarDias(iso, -((diaSemana + 6) % 7));
}

/** Número da semana ISO (a semana é do ano da sua quinta-feira). */
export function numeroSemanaISO(iso: string): { semana: number; ano: number } {
  const quinta = somarDias(inicioSemanaISO(iso), 3);
  const ano = Number(quinta.slice(0, 4));
  const [, m, d] = quinta.split('-').map(Number);
  const diaDoAno = Math.round((Date.UTC(ano, m - 1, d) - Date.UTC(ano, 0, 1)) / 86_400_000);
  return { semana: Math.floor(diaDoAno / 7) + 1, ano };
}

/** Chave ordenável e rótulo do período da data. */
export function periodoDaData(iso: string, agrupamento: Exclude<AgrupamentoRelatorio, 'item'>): { chave: string; rotulo: string } {
  const data = iso.slice(0, 10);
  if (agrupamento === 'dia') return { chave: data, rotulo: ddmmaaaa(data) };
  if (agrupamento === 'mes') {
    const mes = Number(data.slice(5, 7));
    return { chave: data.slice(0, 7), rotulo: `${MESES[mes - 1]}/${data.slice(0, 4)}` };
  }
  const inicio = inicioSemanaISO(data);
  const fim = somarDias(inicio, 6);
  const { semana } = numeroSemanaISO(data);
  return { chave: inicio, rotulo: `S${String(semana).padStart(2, '0')} · ${ddmm(inicio)} a ${ddmmaaaa(fim)}` };
}

// ---------------------------------------------------------------------------
// Sintético
// ---------------------------------------------------------------------------

export interface TotaisSituacao {
  baixado: number;
  liberado: number;
  aguardando_nf: number;
  pendente: number;
}

const totaisZerados = (): TotaisSituacao => ({ baixado: 0, liberado: 0, aguardando_nf: 0, pendente: 0 });

export interface GrupoItem {
  material: string;
  descricao: string;
  unidade: string;
  lancamentos: number;
  quantidade: number;
  /** Quantidade por situação. */
  qtd: TotaisSituacao;
}

/** Agrupa por material (código normalizado), maiores pendências primeiro. */
export function agruparPorItem(linhas: LinhaRelatorioSolExtra[]): GrupoItem[] {
  const grupos = new Map<string, GrupoItem & { registros: Set<string> }>();
  for (const l of linhas) {
    const k = `${normalizeCode(l.material)}|${l.unidade.toUpperCase()}`;
    const g = grupos.get(k) ?? {
      material: l.material, descricao: l.descricao, unidade: l.unidade, lancamentos: 0, quantidade: 0, qtd: totaisZerados(), registros: new Set<string>(),
    };
    if (!g.descricao && l.descricao) g.descricao = l.descricao;
    g.registros.add(l.registroId);
    g.quantidade += l.quantidade;
    g.qtd[l.situacao] += l.quantidade;
    grupos.set(k, g);
  }
  return [...grupos.values()]
    .map(({ registros, ...g }) => ({ ...g, lancamentos: registros.size }))
    .sort((a, b) => {
      const pa = a.qtd.liberado + a.qtd.aguardando_nf + a.qtd.pendente;
      const pb = b.qtd.liberado + b.qtd.aguardando_nf + b.qtd.pendente;
      return Number(pb > 0) - Number(pa > 0) || a.material.localeCompare(b.material, 'pt-BR', { numeric: true });
    });
}

export interface GrupoPeriodo {
  chave: string;
  rotulo: string;
  lancamentos: number;
  /** Linhas de material por situação. */
  itens: TotaisSituacao;
  totalItens: number;
  /** Os materiais do período, somados. */
  materiais: GrupoItem[];
}

/** Agrupa por dia, semana ou mês, em ordem cronológica. */
export function agruparPorPeriodo(
  linhas: LinhaRelatorioSolExtra[],
  agrupamento: Exclude<AgrupamentoRelatorio, 'item'>,
): GrupoPeriodo[] {
  const porChave = new Map<string, { rotulo: string; linhas: LinhaRelatorioSolExtra[] }>();
  for (const l of linhas) {
    const { chave, rotulo } = periodoDaData(l.data, agrupamento);
    const g = porChave.get(chave) ?? { rotulo, linhas: [] };
    g.linhas.push(l);
    porChave.set(chave, g);
  }
  return [...porChave.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([chave, g]) => {
      const itens = totaisZerados();
      for (const l of g.linhas) itens[l.situacao]++;
      return {
        chave,
        rotulo: g.rotulo,
        lancamentos: new Set(g.linhas.map(l => l.registroId)).size,
        itens,
        totalItens: g.linhas.length,
        materiais: agruparPorItem(g.linhas),
      };
    });
}

export interface ResumoRelatorio {
  lancamentos: number;
  projeto: number;
  semSaldo: number;
  totalItens: number;
  itens: TotaisSituacao;
}

export function resumirRelatorio(linhas: LinhaRelatorioSolExtra[]): ResumoRelatorio {
  const tipoPorRegistro = new Map(linhas.map(l => [l.registroId, l.tipo] as const));
  const itens = totaisZerados();
  for (const l of linhas) itens[l.situacao]++;
  const tipos = [...tipoPorRegistro.values()];
  return {
    lancamentos: tipoPorRegistro.size,
    projeto: tipos.filter(t => t === 'PROJETO').length,
    semSaldo: tipos.filter(t => t === 'SEM_SALDO').length,
    totalItens: linhas.length,
    itens,
  };
}

// ---------------------------------------------------------------------------
// PO aguardando a NF
// ---------------------------------------------------------------------------

export interface PoAguardandoNf {
  /** `pedido/item`. */
  pedido: string;
  fornecedor: string | null;
  remessaPrevista: string | null;
  quantidadePendente: number;
  /** Material já conferido no almoxarifado, esperando a MIGO. */
  chegouSemMigo: boolean;
}

export interface PendenciaNfMaterial {
  pedidos: PoAguardandoNf[];
  /** RMs abertas do material que ainda não viraram pedido. */
  rmsSemPedido: string[];
}

/**
 * Pedidos (ZL0132) com quantidade ainda por entrar — é neles que a NF falta
 * — e as RMs sem pedido, da situação do material (`alm_situacao_material`).
 * Os que chegaram fisicamente sem MIGO vêm primeiro; depois por previsão.
 */
export function pendenciaNfDoMaterial(s: Pick<SituacaoMaterial, 'pedidos' | 'rms' | 'chegadas'> | null): PendenciaNfMaterial {
  if (!s) return { pedidos: [], rmsSemPedido: [] };
  const chegaramSemMigo = new Set(
    (s.chegadas ?? []).filter(c => !c.migo_em && c.pedido).map(c => String(c.pedido).trim()),
  );
  const pedidos = (s.pedidos ?? [])
    .filter(p => Number(p.quantidade_pendente) > 0)
    .map(p => ({
      pedido: documentoComItem(p.pedido, p.item),
      fornecedor: p.fornecedor?.trim() || null,
      remessaPrevista: p.remessa_prevista ? p.remessa_prevista.slice(0, 10) : null,
      quantidadePendente: Number(p.quantidade_pendente) || 0,
      chegouSemMigo: chegaramSemMigo.has(String(p.pedido).trim()),
    }))
    .sort((a, b) =>
      Number(b.chegouSemMigo) - Number(a.chegouSemMigo)
      || (a.remessaPrevista ?? '9999').localeCompare(b.remessaPrevista ?? '9999')
      || a.pedido.localeCompare(b.pedido));
  const rmsSemPedido = [...new Set((s.rms ?? [])
    .filter(r => r.situacao === 'sem_pedido')
    .map(r => documentoComItem(r.requisicao, r.item))
    .filter(Boolean))];
  return { pedidos, rmsSemPedido };
}

/** Texto curto para a célula: "4500123456/10 (prev. 12/11) · chegou s/ MIGO; ..." */
export function textoPendenciaNf(p: PendenciaNfMaterial | undefined): string {
  if (!p) return 'PO não consultado';
  if (p.pedidos.length) {
    return p.pedidos
      .map(po => [
        po.pedido,
        po.remessaPrevista && `prev. ${ddmm(po.remessaPrevista)}`,
        po.chegouSemMigo && 'chegou s/ MIGO',
      ].filter(Boolean).join(' · '))
      .join('; ');
  }
  if (p.rmsSemPedido.length) return `Sem PO — RM ${p.rmsSemPedido.join(', ')}`;
  return 'Sem PO aberto';
}

/** Fornecedores distintos dos POs pendentes. */
export function fornecedoresPendenciaNf(p: PendenciaNfMaterial | undefined): string {
  return [...new Set((p?.pedidos ?? []).map(po => po.fornecedor).filter((f): f is string => !!f))].join('; ');
}

/** Materiais cuja NF falta (pendentes sem saldo), para consultar o PO. */
export function materiaisAguardandoNf(linhas: LinhaRelatorioSolExtra[]): string[] {
  return [...new Set(linhas.filter(l => l.situacao === 'aguardando_nf' && l.material).map(l => normalizeCode(l.material)))];
}

/** Rótulo do tipo para a tabela. */
export const rotuloTipo = (t: TipoSolExtra) => TIPO_SOL_EXTRA_ROTULO[t];

// ---------------------------------------------------------------------------
// Atalhos de período (também usados no relatório de retiradas sem saldo)
// ---------------------------------------------------------------------------

export type PresetPeriodo = 'mes' | 'mes_anterior' | '30d' | 'ano' | 'tudo';

export const ROTULO_PRESET_PERIODO: Record<PresetPeriodo, string> = {
  mes: 'Este mês',
  mes_anterior: 'Mês passado',
  '30d': 'Últimos 30 dias',
  ano: 'Este ano',
  tudo: 'Tudo',
};

/** Intervalo do atalho, em datas ISO locais (`hoje` também ISO local). */
export function intervaloPreset(p: PresetPeriodo, hoje: string): { de: string | null; ate: string | null } {
  const [a, m, d] = hoje.split('-').map(Number);
  const iso = (dt: Date) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  switch (p) {
    case 'mes': return { de: `${hoje.slice(0, 7)}-01`, ate: hoje };
    case 'mes_anterior': return { de: iso(new Date(a, m - 2, 1)), ate: iso(new Date(a, m - 1, 0)) };
    case '30d': return { de: iso(new Date(a, m - 1, d - 29)), ate: hoje };
    case 'ano': return { de: `${a}-01-01`, ate: hoje };
    default: return { de: null, ate: null };
  }
}
