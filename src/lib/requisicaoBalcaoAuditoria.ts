/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Requisição no Balcão × MB51.
 *
 * O que foi exportado vira lançamento no SAP no dia da exportação e tem de
 * aparecer na MB51 com essa data de lançamento; o que está "Não exportada"
 * ou "Aguardando confirmação" ainda não tem como estar lá. A conferência item
 * a item roda no banco (`alm_rqb_auditoria_mb51`, migrations 20261111200000 e
 * 20261116140000): pelo doc. SAP do item — a quantidade do documento é
 * dividida entre as RQBs que apontam para ele, e documento já na MB51 decide
 * sozinho — e, sem documento na MB51, pelo dia da exportação vigente e pelos
 * dias de exportações anteriores (log). Aqui ficam rótulos, filtros e totais.
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
  /** O doc. SAP do item (ou da requisição) já está na MB51 — a conferência é só por ele. */
  doc_no_mb51?: boolean;
  /** Quanto o documento tem do material (todas as saídas, qualquer depósito). */
  doc_qtd?: number | null;
  /** Soma dos itens de RQB que apontam para o mesmo documento e material. */
  doc_qtd_rqbs?: number | null;
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
  ok: 'A MB51 tem o lançamento: no doc. SAP do item ou, sem ele, no dia da exportação (mesmo material e depósito).',
  parcial: 'O doc. SAP (ou o dia da exportação) cobre só parte da quantidade — a quantidade do documento é dividida entre as RQBs que apontam para ele, em ordem de código.',
  faltando: 'Exportada, mas o material não está no doc. SAP informado (ou, sem doc., não há lançamento no dia) — investigar.',
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

/* Por documento SAP ---------------------------------------------------------
 *
 * Uma linha por documento × material (RPC `alm_rqb_divergencias_doc`): o que as
 * RQBs com aquele doc. pediram contra o que o documento tem na MB51. Pega o
 * que a planilha concluída marcou "Concluído" sem o SAP ter lançado.
 */

export type SituacaoDocDiv = 'fora_do_doc' | 'parcial' | 'a_mais' | 'doc_nao_encontrado';
/** Com `p_todas` a RPC devolve também o que bate e o documento que a MB51 ainda não trouxe. */
export type SituacaoConferenciaDoc = SituacaoDocDiv | 'ok' | 'mb51_pendente';

export const ROTULO_SITUACAO_DOC: Record<SituacaoConferenciaDoc, string> = {
  fora_do_doc: 'Fora do documento',
  parcial: 'Quantidade menor',
  a_mais: 'Documento a mais',
  doc_nao_encontrado: 'Doc. não encontrado',
  ok: 'Confere',
  mb51_pendente: 'Doc. ainda fora da MB51',
};

export const DICA_SITUACAO_DOC: Record<SituacaoConferenciaDoc, string> = {
  fora_do_doc: 'O documento está na MB51, mas o material não está nele — a baixa não foi feita.',
  parcial: 'O material está no documento com quantidade menor que a soma das RQBs.',
  a_mais: 'O documento tem mais do que as RQBs pediram — outra baixa no mesmo documento.',
  doc_nao_encontrado: 'Número anterior ao último documento importado e ausente da MB51 — digitado errado ou estornado.',
  ok: 'O documento tem o material na quantidade das RQBs.',
  mb51_pendente: 'O documento é mais novo que a última MB51 importada — importe a MB51 e confira de novo.',
};

/** Situações que são baixa faltando no SAP. */
export const SITUACOES_FALTA: SituacaoDocDiv[] = ['fora_do_doc', 'parcial', 'doc_nao_encontrado'];

export function ehFaltaDoc(s: SituacaoConferenciaDoc): boolean {
  return (SITUACOES_FALTA as string[]).includes(s);
}

export interface RqbDaDivergencia {
  requisicao_id: string;
  item_id: string;
  codigo: string;
  quantidade: number;
  data_criacao: string;
  data_exportacao: string | null;
}

export interface LinhaDivergenciaDoc {
  doc: string;
  doc_data: string | null;
  material: string;
  descricao: string | null;
  unidade: string | null;
  tipo_movimento: string;
  deposito: string | null;
  situacao: SituacaoConferenciaDoc;
  qtd_rqbs: number;
  qtd_doc: number;
  /** RQBs − documento; negativo quando o documento tem a mais. */
  falta: number;
  preco_medio: number | null;
  /** Falta × preço médio da MB51 do material. */
  valor_falta: number;
  /** Como o documento lançou o material: "311 0001 (−), 311 0105 (+)". */
  lancado_como: string | null;
  /** Lançamentos do material sem RQB de 2 dias antes a 7 depois — podem ser a correção à mão. */
  avulsos: string | null;
  data_exportacao: string | null;
  rqbs: RqbDaDivergencia[];
  mb51_ate: string | null;
}

export type FiltroSituacaoDoc = SituacaoConferenciaDoc | 'faltas' | 'todas';

export function filtrarDivergenciasDoc(
  linhas: LinhaDivergenciaDoc[],
  f: { busca: string; situacao: FiltroSituacaoDoc; semAvulso?: boolean },
): LinhaDivergenciaDoc[] {
  const termos = semAcento(f.busca.trim()).split(/\s+/).filter(Boolean);
  return linhas.filter((l) => {
    if (f.situacao === 'faltas' && !ehFaltaDoc(l.situacao)) return false;
    if (f.situacao !== 'faltas' && f.situacao !== 'todas' && l.situacao !== f.situacao) return false;
    if (f.semAvulso && l.avulsos) return false;
    if (termos.length === 0) return true;
    const alvo = semAcento([
      l.doc, l.material, l.descricao, l.deposito, l.lancado_como, l.avulsos, ...l.rqbs.map((r) => r.codigo),
    ].filter(Boolean).join(' '));
    return termos.every((t) => alvo.includes(t));
  });
}

export interface TotaisDivergenciaDoc {
  pares: number;
  linhasRqb: number;
  valor: number;
}

/** Totais por situação e o geral das faltas (sem "a mais", que não é baixa faltando). */
export function totalizarDivergenciasDoc(linhas: LinhaDivergenciaDoc[]): Record<SituacaoConferenciaDoc | 'faltas', TotaisDivergenciaDoc> {
  const vazio = (): TotaisDivergenciaDoc => ({ pares: 0, linhasRqb: 0, valor: 0 });
  const t: Record<SituacaoConferenciaDoc | 'faltas', TotaisDivergenciaDoc> = {
    faltas: vazio(), fora_do_doc: vazio(), parcial: vazio(), a_mais: vazio(), doc_nao_encontrado: vazio(),
    ok: vazio(), mb51_pendente: vazio(),
  };
  for (const l of linhas) {
    const alvos: (SituacaoConferenciaDoc | 'faltas')[] = ehFaltaDoc(l.situacao) ? [l.situacao, 'faltas'] : [l.situacao];
    for (const a of alvos) {
      t[a].pares += 1;
      t[a].linhasRqb += l.rqbs.length;
      t[a].valor += Number(l.valor_falta) || 0;
    }
  }
  for (const k of Object.keys(t) as (keyof typeof t)[]) t[k].valor = Math.round(t[k].valor * 100) / 100;
  return t;
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

/* Importação da planilha concluída × MB51 -------------------------------------
 *
 * A planilha volta com doc. e "Concluído" também em linha que o SAP não lançou,
 * e só a MB51 mostra isso. Por isso a importação pede a MB51 atualizada antes e
 * confere os documentos da planilha depois de gravar.
 */

/** Documentos SAP distintos da planilha (sem vazio). */
export function documentosDaPlanilha(linhas: { docSap: string }[]): string[] {
  return [...new Set(linhas.map((l) => l.docSap.trim()).filter(Boolean))].sort();
}

export interface UltimaImportacaoMb51 {
  /** Quando a MB51 foi importada pela última vez (ops_importacoes). */
  importadaEm: string | null;
  por: string | null;
  arquivo: string | null;
  /** Última data de lançamento que a MB51 importada traz. */
  lancamentosAte: string | null;
}

export interface AvisoMb51 {
  docs: string[];
  /** Documentos da planilha que a MB51 importada ainda não tem. */
  faltando: string[];
  /** Horas desde a última importação da MB51 (null = nunca importada). */
  horasDesdeImportacao: number | null;
  /** MB51 desatualizada para esta planilha: tem documento fora ou nunca foi importada. */
  desatualizada: boolean;
}

export function avaliarMb51ParaPlanilha(
  docsPlanilha: string[],
  docsNaMb51: Iterable<string>,
  ultima: Pick<UltimaImportacaoMb51, 'importadaEm'>,
  agora: Date = new Date(),
): AvisoMb51 {
  const presentes = new Set(docsNaMb51);
  const faltando = docsPlanilha.filter((d) => !presentes.has(d));
  const t = ultima.importadaEm ? new Date(ultima.importadaEm).getTime() : NaN;
  const horas = Number.isNaN(t) ? null : Math.max(0, Math.round(((agora.getTime() - t) / 36e5) * 10) / 10);
  return { docs: docsPlanilha, faltando, horasDesdeImportacao: horas, desatualizada: horas === null || faltando.length > 0 };
}

export interface ResumoConferenciaImportacao {
  pares: number;
  ok: number;
  /** Baixa faltando: fora do documento, quantidade menor, documento não encontrado. */
  faltas: number;
  aMais: number;
  /** Documento mais novo que a MB51 importada — não dá para conferir ainda. */
  pendentes: number;
  valorFalta: number;
  /** Requisições com alguma baixa faltando. */
  requisicoesComFalta: { requisicao_id: string; codigo: string }[];
}

export function resumirConferenciaImportacao(linhas: LinhaDivergenciaDoc[]): ResumoConferenciaImportacao {
  const r: ResumoConferenciaImportacao = {
    pares: linhas.length, ok: 0, faltas: 0, aMais: 0, pendentes: 0, valorFalta: 0, requisicoesComFalta: [],
  };
  const reqs = new Map<string, string>();
  for (const l of linhas) {
    if (l.situacao === 'ok') r.ok += 1;
    else if (l.situacao === 'a_mais') r.aMais += 1;
    else if (l.situacao === 'mb51_pendente') r.pendentes += 1;
    else if (ehFaltaDoc(l.situacao)) {
      r.faltas += 1;
      r.valorFalta += Number(l.valor_falta) || 0;
      for (const q of l.rqbs) reqs.set(q.requisicao_id, q.codigo);
    }
  }
  r.valorFalta = Math.round(r.valorFalta * 100) / 100;
  r.requisicoesComFalta = [...reqs]
    .map(([requisicao_id, codigo]) => ({ requisicao_id, codigo }))
    .sort((a, b) => a.codigo.localeCompare(b.codigo));
  return r;
}

/* ------------------------------------------------------------------ */
/* Exportadas sem doc. SAP × MB51                                       */
/* ------------------------------------------------------------------ */

/**
 * Requisição exportada que a planilha concluída não devolveu com doc. SAP:
 * a MB51 tem a baixa? Sem doc. para casar, a conferência é a do relatório —
 * material + depósito + tipo no dia da exportação (com a quantidade do dia
 * dividida entre as RQBs) e sobra até 7 dias depois. É indício forte, não
 * prova: outro lançamento do mesmo material no dia também casa.
 */
export type SituacaoSemSap = 'na_mb51' | 'em_parte' | 'nao_encontrada' | 'mb51_pendente';

export const ROTULO_SITUACAO_SEM_SAP: Record<SituacaoSemSap, string> = {
  na_mb51: 'Na MB51',
  em_parte: 'Em parte / outra data',
  nao_encontrada: 'Não encontradas',
  mb51_pendente: 'MB51 não importada',
};

export const DICA_SITUACAO_SEM_SAP: Record<SituacaoSemSap, string> = {
  na_mb51: 'Todos os itens têm lançamento na MB51 no dia da exportação (mesmo material, depósito e tipo). Falta só gravar o doc. SAP na requisição.',
  em_parte: 'Parte dos itens está na MB51, ou o lançamento caiu em outro dia (até 7 dias depois) — conferir o documento antes de gravar.',
  nao_encontrada: 'Nenhum item tem lançamento na MB51 no dia da exportação — a baixa provavelmente não foi feita no SAP.',
  mb51_pendente: 'A exportação é mais nova que a última MB51 importada — importe a MB51 para conferir.',
};

export interface ConferenciaSemSap {
  situacao: SituacaoSemSap;
  /** Itens sem doc. SAP conferidos. */
  itens: number;
  /** Itens com o lançamento inteiro no dia da exportação. */
  encontrados: number;
  /** Documentos da MB51 que casaram (dia da exportação ou dias seguintes). */
  docs: string[];
}

const DOC_SAP_RE = /\b\d{10}\b/g;

/** Por requisição, a situação dos itens que ainda não têm doc. SAP. */
export function conferirExportadasSemSap(linhas: LinhaAuditoriaRqb[]): Map<string, ConferenciaSemSap> {
  const porReq = new Map<string, LinhaAuditoriaRqb[]>();
  for (const l of linhas) {
    if (!l.exportacao_id || (l.item_doc_sap || '').trim() || (l.doc_sap || '').trim()) continue;
    const lista = porReq.get(l.requisicao_id);
    if (lista) lista.push(l);
    else porReq.set(l.requisicao_id, [l]);
  }
  const out = new Map<string, ConferenciaSemSap>();
  for (const [id, itens] of porReq) {
    let encontrados = 0;
    let algum = 0;
    let pendentes = 0;
    const docs = new Set<string>();
    for (const l of itens) {
      if (l.mb51_status === 'ok') encontrados += 1;
      if (l.mb51_status === 'ok' || l.mb51_status === 'parcial' || l.mb51_status === 'outra_data') algum += 1;
      if (l.mb51_status === 'mb51_pendente' || l.mb51_status == null) pendentes += 1;
      for (const d of `${l.mb51_docs ?? ''} ${l.outra_data ?? ''}`.match(DOC_SAP_RE) ?? []) docs.add(d);
    }
    const situacao: SituacaoSemSap =
      pendentes === itens.length ? 'mb51_pendente'
        : encontrados === itens.length ? 'na_mb51'
          : algum > 0 ? 'em_parte'
            : 'nao_encontrada';
    out.set(id, { situacao, itens: itens.length, encontrados, docs: [...docs].sort() });
  }
  return out;
}
