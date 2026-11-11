/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Requisição no Balcão × MB51.
 *
 * O que foi exportado vira lançamento no SAP no dia da exportação e tem de
 * aparecer na MB51 com essa data de lançamento; o que está "Não exportada"
 * ou "Aguardando confirmação" ainda não tem como estar lá. A conferência item
 * a item roda no banco (`alm_rqb_auditoria_mb51`, ver a migration
 * 20261111200000): primeiro pelo doc. SAP do item, depois pelo dia da
 * exportação vigente e pelos dias de exportações anteriores (log). Aqui ficam
 * rótulos, filtros e totais da tela.
 */

const semAcento = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

export type StatusRqb = 'exportada' | 'aguardando' | 'nao_exportada';
export type StatusMb51 = 'ok' | 'parcial' | 'faltando' | 'outra_data' | 'mb51_pendente';

/** Uma linha por item de requisição (retorno da RPC). */
export interface LinhaAuditoriaRqb {
  requisicao_id: string;
  codigo: string;
  data_criacao: string;
  criado_em: string;
  status: StatusRqb;
  exportacao_id: string | null;
  exportada_em: string | null;
  /** AAAA-MM-DD no horário de Brasília — é a data de lançamento esperada na MB51. */
  data_exportacao: string | null;
  arquivo: string | null;
  doc_sap: string | null;
  colaborador: string | null;
  tipo_movimento: string;
  item_id: string;
  ordem: number | null;
  material: string;
  descricao: string | null;
  unidade: string | null;
  quantidade: number;
  deposito: string | null;
  deposito_destino: string | null;
  pep: string | null;
  item_doc_sap: string | null;
  mb51_status: StatusMb51 | null;
  /** Como fechou: doc. SAP do item, dia da exportação vigente ou de uma exportação anterior. */
  conferido_por: ConferidoPor | null;
  /** Quanto da quantidade do item a MB51 do dia cobre. */
  mb51_coberto: number | null;
  /** Total na MB51 no dia/material/depósito, e o total exportado na mesma chave. */
  mb51_qtd_dia: number | null;
  esperado_dia: number | null;
  mb51_docs: string | null;
  /** Sobra lançada até 7 dias depois da exportação ("DD/MM/AAAA: qtd (doc …)"). */
  outra_data: string | null;
  /** Sobra nos 7 dias antes da exportação — costuma ser baixa direta do mesmo material. */
  mb51_antes: string | null;
  /** Quantas vezes a requisição foi exportada e quando (log). */
  exportacoes_qtd: number;
  exportacoes: string | null;
  /** Exportada de novo sem reabrir antes — risco de lançamento em dobro. */
  reexportada_sem_reabrir: boolean;
  /** Última data de lançamento importada da MB51. */
  mb51_ate: string | null;
}

export type ConferidoPor = 'documento' | 'dia_exportacao' | 'exportacao_anterior';

export const ROTULO_CONFERIDO_POR: Record<ConferidoPor, string> = {
  documento: 'pelo doc. SAP do item',
  dia_exportacao: 'no dia da exportação',
  exportacao_anterior: 'numa exportação anterior',
};

export const ROTULO_STATUS_RQB: Record<StatusRqb, string> = {
  exportada: 'Exportada',
  aguardando: 'Aguardando confirmação',
  nao_exportada: 'Não exportada',
};

export const ROTULO_STATUS_MB51: Record<StatusMb51, string> = {
  ok: 'Na MB51',
  parcial: 'Parcial na MB51',
  faltando: 'Faltando na MB51',
  outra_data: 'Em outra data',
  mb51_pendente: 'MB51 não importada',
};

export const DICA_STATUS_MB51: Record<StatusMb51, string> = {
  ok: 'A MB51 tem o lançamento no dia da exportação, no mesmo material e depósito.',
  parcial: 'A MB51 do dia da exportação cobre só parte da quantidade.',
  faltando: 'Exportada, mas sem lançamento na MB51 no dia da exportação — investigar.',
  outra_data: 'Não está no dia da exportação, mas há lançamento sem requisição correspondente até 7 dias depois — conferir o documento.',
  mb51_pendente: 'A exportação é posterior à última data importada da MB51.',
};

/** Divergência = exportada e não encontrada (inteira ou em parte) no dia da exportação. */
export function ehDivergente(l: Pick<LinhaAuditoriaRqb, 'mb51_status'>): boolean {
  return l.mb51_status === 'faltando' || l.mb51_status === 'parcial';
}

/* Período ------------------------------------------------------------------ */

export type BasePeriodo = 'criacao' | 'exportacao';

export const ROTULO_BASE_PERIODO: Record<BasePeriodo, string> = {
  criacao: 'Criação da requisição',
  exportacao: 'Exportação (data da MB51)',
};

export interface FiltroPeriodo {
  base: BasePeriodo;
  /** AAAA-MM-DD, vazio = sem limite. */
  de: string;
  ate: string;
}

export const PERIODO_VAZIO: FiltroPeriodo = { base: 'criacao', de: '', ate: '' };

export function periodoAtivo(p: FiltroPeriodo): boolean {
  return !!(p.de || p.ate);
}

/**
 * A data que o filtro compara. Pela exportação, quem não foi exportado não
 * tem data e fica de fora — é o esperado ("o que saiu entre tal e tal dia").
 */
export function dentroDoPeriodo(p: FiltroPeriodo, dataCriacao: string | null, dataExportacao: string | null): boolean {
  if (!periodoAtivo(p)) return true;
  const d = (p.base === 'criacao' ? dataCriacao : dataExportacao)?.slice(0, 10);
  if (!d) return false;
  if (p.de && d < p.de) return false;
  if (p.ate && d > p.ate) return false;
  return true;
}

/** Data local (Brasília) de um timestamp — a do dia da exportação. */
export function dataLocalDeTimestamp(ts: string | null | undefined): string | null {
  if (!ts) return null;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/* Filtros e totais da tela --------------------------------------------------- */

export type FiltroConferencia = 'todas' | 'divergentes' | 'outra_data' | 'ok' | 'mb51_pendente' | 'reexportadas' | 'sem_exportar';

export interface FiltrosAuditoria {
  busca: string;
  status: StatusRqb | 'todos';
  conferencia: FiltroConferencia;
}

export function filtrarAuditoria(linhas: LinhaAuditoriaRqb[], f: FiltrosAuditoria): LinhaAuditoriaRqb[] {
  const termos = semAcento(f.busca.trim()).split(/\s+/).filter(Boolean);
  return linhas.filter((l) => {
    if (f.status !== 'todos' && l.status !== f.status) return false;
    switch (f.conferencia) {
      case 'divergentes': if (!ehDivergente(l)) return false; break;
      case 'outra_data': if (l.mb51_status !== 'outra_data') return false; break;
      case 'ok': if (l.mb51_status !== 'ok') return false; break;
      case 'mb51_pendente': if (l.mb51_status !== 'mb51_pendente') return false; break;
      case 'reexportadas': if (!l.reexportada_sem_reabrir) return false; break;
      case 'sem_exportar': if (l.status === 'exportada') return false; break;
      default: break;
    }
    if (termos.length === 0) return true;
    const alvo = semAcento([
      l.codigo, l.material, l.descricao, l.colaborador, l.pep, l.deposito, l.arquivo, l.doc_sap, l.item_doc_sap, l.mb51_docs,
    ].filter(Boolean).join(' '));
    return termos.every((t) => alvo.includes(t));
  });
}

export interface ContagemAuditoria {
  itens: number;
  requisicoes: number;
  exportados: number;
  ok: number;
  divergentes: number;
  outraData: number;
  mb51Pendente: number;
  /** Itens de requisições exportadas de novo sem reabrir. */
  reexportadas: number;
  semExportar: number;
}

export function contarAuditoria(linhas: LinhaAuditoriaRqb[]): ContagemAuditoria {
  const c: ContagemAuditoria = {
    itens: linhas.length, requisicoes: new Set(linhas.map((l) => l.requisicao_id)).size,
    exportados: 0, ok: 0, divergentes: 0, outraData: 0, mb51Pendente: 0, reexportadas: 0, semExportar: 0,
  };
  for (const l of linhas) {
    if (l.reexportada_sem_reabrir) c.reexportadas += 1;
    if (l.status !== 'exportada') { c.semExportar += 1; continue; }
    c.exportados += 1;
    if (l.mb51_status === 'ok') c.ok += 1;
    else if (ehDivergente(l)) c.divergentes += 1;
    else if (l.mb51_status === 'outra_data') c.outraData += 1;
    else if (l.mb51_status === 'mb51_pendente') c.mb51Pendente += 1;
  }
  return c;
}

export interface ResumoMaterial {
  material: string;
  descricao: string;
  unidade: string;
  requisicoes: number;
  qtdTotal: number;
  qtdExportada: number;
  /** Quantidade exportada que a MB51 cobriu no dia da exportação. */
  qtdNaMb51: number;
  qtdSemExportar: number;
  divergentes: number;
  ultimaData: string;
}

/** Totais por material, divergentes primeiro. */
export function resumirPorMaterial(linhas: LinhaAuditoriaRqb[]): ResumoMaterial[] {
  const mapa = new Map<string, ResumoMaterial & { _reqs: Set<string> }>();
  for (const l of linhas) {
    let r = mapa.get(l.material);
    if (!r) {
      r = {
        material: l.material, descricao: l.descricao || '', unidade: l.unidade || '', requisicoes: 0,
        qtdTotal: 0, qtdExportada: 0, qtdNaMb51: 0, qtdSemExportar: 0, divergentes: 0, ultimaData: '', _reqs: new Set(),
      };
      mapa.set(l.material, r);
    }
    const q = Number(l.quantidade) || 0;
    r._reqs.add(l.requisicao_id);
    r.qtdTotal += q;
    if (l.status === 'exportada') {
      r.qtdExportada += q;
      r.qtdNaMb51 += Math.min(q, Number(l.mb51_coberto) || 0);
    } else {
      r.qtdSemExportar += q;
    }
    if (ehDivergente(l)) r.divergentes += 1;
    const d = l.data_exportacao || l.data_criacao;
    if (d > r.ultimaData) r.ultimaData = d;
  }
  return [...mapa.values()]
    .map(({ _reqs, ...r }) => ({ ...r, requisicoes: _reqs.size }))
    .sort((a, b) => b.divergentes - a.divergentes || b.ultimaData.localeCompare(a.ultimaData) || a.material.localeCompare(b.material));
}

/** Material + depósito, a chave do item no inventário cíclico. */
export interface ItemParaContar {
  material: string;
  deposito: string;
}

export function chaveContagem(i: ItemParaContar): string {
  return `${i.material}|${i.deposito}`;
}

/** Itens distintos (material + depósito de origem) das linhas — o que vai para o inventário. */
export function itensParaContar(linhas: Pick<LinhaAuditoriaRqb, 'material' | 'deposito'>[]): ItemParaContar[] {
  const vistos = new Map<string, ItemParaContar>();
  for (const l of linhas) {
    if (!l.material || !l.deposito) continue;
    const i = { material: l.material, deposito: l.deposito };
    vistos.set(chaveContagem(i), i);
  }
  return [...vistos.values()].sort((a, b) => a.material.localeCompare(b.material) || a.deposito.localeCompare(b.deposito));
}
