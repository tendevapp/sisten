/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Log geral da Requisição no Balcão (Relatório × MB51 › Log): busca no
 * conteúdo do evento, filtro por ação e contagens por ação e por hora do dia,
 * para achar quando e por quem cada exportação/reabertura/importação foi feita.
 */

import type {
  ImportacaoBalcao, LinhaImportacaoLog, LoteImportacaoBalcao, ReqBalcaoAlteracao, ReqBalcaoAlteracaoGeral,
  ResultadoLinhaImportacao,
} from './requisicaoBalcaoApi';

export type AcaoLog = ReqBalcaoAlteracao['acao'];

export const ROTULO_ACAO_LOG: Record<AcaoLog, string> = {
  criacao: 'Criação',
  edicao: 'Edição',
  exclusao: 'Exclusão',
  doc_sap: 'Doc. SAP',
  exportacao: 'Exportação',
  reabertura: 'Reabertura',
  importacao_sap: 'Importação SAP',
  restauracao: 'Restauração',
};

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Texto pesquisável do evento: RQB, ação, usuário, resumo e cada campo de→para. */
export function textoDoEvento(e: ReqBalcaoAlteracaoGeral): string {
  const partes = [
    e.codigo ?? '',
    ROTULO_ACAO_LOG[e.acao] ?? e.acao,
    e.alterado_por_nome ?? '',
    e.resumo ?? '',
    ...(e.alteracoes ?? []).flatMap((d) => [d.campo, d.de ?? '', d.para ?? '']),
  ];
  return semAcento(partes.join(' '));
}

/**
 * Busca por termos: todos precisam aparecer (em qualquer ordem), sem acento
 * nem caixa. "rqb-300926-10 reabertura" acha a reabertura daquela requisição.
 */
export function filtrarLog(
  eventos: ReqBalcaoAlteracaoGeral[],
  filtro: { busca: string; acao: AcaoLog | 'todas'; hora?: number | null },
): ReqBalcaoAlteracaoGeral[] {
  const termos = semAcento(filtro.busca).split(/\s+/).filter(Boolean);
  return eventos.filter((e) => {
    if (filtro.acao !== 'todas' && e.acao !== filtro.acao) return false;
    if (filtro.hora != null && new Date(e.created_at).getHours() !== filtro.hora) return false;
    if (termos.length === 0) return true;
    const t = textoDoEvento(e);
    return termos.every((x) => t.includes(x));
  });
}

export function contarPorAcao(eventos: ReqBalcaoAlteracaoGeral[]): Partial<Record<AcaoLog, number>> {
  const c: Partial<Record<AcaoLog, number>> = {};
  for (const e of eventos) c[e.acao] = (c[e.acao] ?? 0) + 1;
  return c;
}

/** Eventos por hora do dia (0–23) no fuso do aparelho. */
export function contarPorHora(eventos: ReqBalcaoAlteracaoGeral[]): number[] {
  const h = Array.from({ length: 24 }, () => 0);
  for (const e of eventos) {
    const d = new Date(e.created_at);
    if (!Number.isNaN(d.getTime())) h[d.getHours()] += 1;
  }
  return h;
}

/**
 * Tempo desde o evento anterior da mesma requisição (ms), por id do evento.
 * Mostra, por exemplo, que a RQB foi reaberta 3 minutos depois de exportada.
 */
export function intervaloDesdeAnterior(eventos: ReqBalcaoAlteracaoGeral[]): Map<string, number> {
  const porReq = new Map<string, ReqBalcaoAlteracaoGeral[]>();
  for (const e of eventos) {
    const l = porReq.get(e.requisicao_id);
    if (l) l.push(e); else porReq.set(e.requisicao_id, [e]);
  }
  const saida = new Map<string, number>();
  for (const l of porReq.values()) {
    const ord = [...l].sort((a, b) => a.created_at.localeCompare(b.created_at));
    for (let i = 1; i < ord.length; i += 1) {
      saida.set(ord[i].id, new Date(ord[i].created_at).getTime() - new Date(ord[i - 1].created_at).getTime());
    }
  }
  return saida;
}

/** "menos de 1 min", "3 min", "2 h 05", "4 d". */
export function formatarIntervalo(ms: number): string {
  const min = Math.round(ms / 60000);
  if (min < 1) return 'menos de 1 min';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h ${String(min % 60).padStart(2, '0')}`;
  return `${Math.floor(h / 24)} d`;
}

/* Importações da planilha concluída e lotes exportado × importado ---------- */

export const ROTULO_RESULTADO_IMPORTACAO: Record<ResultadoLinhaImportacao, string> = {
  gravado: 'Gravado',
  igual: 'Já estava igual',
  nao_encontrado: 'Não encontrado',
  sem_doc: 'Sem doc. SAP na planilha',
  fora_da_gravacao: 'Não enviado',
};

const termosDe = (busca: string) => semAcento(busca).split(/\s+/).filter(Boolean);
const casa = (termos: string[], texto: string) => termos.every((t) => texto.includes(t));

const textoLinhaImportacao = (l: LinhaImportacaoLog) =>
  semAcento([l.codigo, l.material, l.doc_sap ?? '', l.lote ?? '', l.motivo ?? '', ROTULO_RESULTADO_IMPORTACAO[l.resultado] ?? ''].join(' '));

/** Linhas da importação que casam com a busca (todas quando a busca é vazia). */
export function linhasDaImportacao(imp: ImportacaoBalcao, busca: string): LinhaImportacaoLog[] {
  const termos = termosDe(busca);
  if (termos.length === 0) return imp.detalhe ?? [];
  const cabecalho = semAcento([imp.arquivo ?? '', imp.importado_por_nome ?? ''].join(' '));
  if (casa(termos, cabecalho)) return imp.detalhe ?? [];
  return (imp.detalhe ?? []).filter((l) => casa(termos, `${cabecalho} ${textoLinhaImportacao(l)}`));
}

/** Importações com alguma coisa (cabeçalho ou linha) que case com a busca. */
export function filtrarImportacoes(imps: ImportacaoBalcao[], busca: string): ImportacaoBalcao[] {
  if (termosDe(busca).length === 0) return imps;
  return imps.filter((i) => linhasDaImportacao(i, busca).length > 0
    || casa(termosDe(busca), semAcento([i.arquivo ?? '', i.importado_por_nome ?? '', ...(i.docs ?? []), ...(i.lotes ?? [])].join(' '))));
}

/** Lotes que casam com a busca (arquivo, quem exportou, RQB, material, docs). */
export function filtrarLotes(
  lotes: LoteImportacaoBalcao[],
  filtro: { busca: string; soPendentes: boolean },
): LoteImportacaoBalcao[] {
  const termos = termosDe(filtro.busca);
  return lotes.filter((l) => {
    if (filtro.soPendentes && l.itens_sem_doc === 0) return false;
    if (termos.length === 0) return true;
    const t = semAcento([
      l.arquivo, l.exportado_por ?? '', l.docs_lote ?? '',
      ...l.pendentes.flatMap((p) => [p.codigo, p.material, p.descricao ?? '']),
      ...l.mb51_sem_vinculo.map((m) => m.doc),
    ].join(' '));
    return casa(termos, t);
  });
}
