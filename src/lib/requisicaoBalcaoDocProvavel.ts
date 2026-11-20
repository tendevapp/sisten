/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Requisição exportada que voltou sem doc. SAP: qual documento da MB51 é o dela?
 *
 * A conferência antiga olhava material + depósito no dia da exportação e listava
 * todo documento do dia — inclusive os que já estão inteiros com outras
 * requisições (19/11: a RQB-171126-25 apontava o 4904119447, que é das
 * RQB-181126-83..88). Aqui o casamento é linha a linha e nos dois sentidos:
 *
 * - todo item da requisição tem de estar numa linha do documento (mesmo tipo,
 *   material, depósito e quantidade; PEP e destino quando houver);
 * - o documento não recebe mais do que tem: linha já usada por requisição
 *   ligada (ou estornada) não serve para outra, e cada linha vai para uma só.
 *
 * Quando a requisição cabe em mais de um documento, vence o lançado logo depois
 * de uma exportação dela — a planilha vira documento em minutos (17/11: a
 * exportação das 08:21 virou o 4904116637 às 08:21). No fim, o documento que
 * ainda tem linha sem requisição "não fecha": a conta inversa não bate e o doc.
 * é só provável.
 *
 * Os dados vêm de `alm_rqb_sem_doc_candidatos` (migration 20261119220000).
 */

export type KindMov = 'S' | 'T';

export interface ItemSemDocMb51 {
  requisicao_id: string;
  codigo: string;
  criado_em: string;
  item_id: string;
  ordem: number | null;
  kind: KindMov;
  material: string;
  dep: string | null;
  dep_dest: string | null;
  pep: string | null;
  qtd: number;
  /** Instantes das exportações (log), da mais antiga para a mais nova. */
  exportacoes: (string | null)[] | null;
}

export interface LinhaDocMb51 {
  doc: string;
  instante: string;
  kind: KindMov;
  material: string;
  dep: string;
  pep: string | null;
  qtd: number;
  /** Depósitos de destino da transferência (311) no mesmo documento e material. */
  destinos?: string[] | null;
}

export interface EstornoMb51 {
  doc: string;
  instante: string;
  kind: KindMov;
  material: string;
  dep: string;
  pep: string | null;
  qtd: number;
}

export interface ItemVinculadoMb51 {
  docs: string[];
  kind: KindMov;
  material: string;
  dep: string;
  pep: string | null;
  qtd: number;
}

export interface CandidatosSemSap {
  mb51_ate: string | null;
  /** Último lançamento importado da MB51 (instante). */
  mb51_ultimo?: string | null;
  itens: ItemSemDocMb51[];
  linhas: LinhaDocMb51[];
  estornos: EstornoMb51[];
  vinculados: ItemVinculadoMb51[];
}

export type SituacaoSemSap = 'doc_confere' | 'doc_provavel' | 'em_parte' | 'nao_encontrada' | 'mb51_pendente';

export const ROTULO_SITUACAO_SEM_SAP: Record<SituacaoSemSap, string> = {
  doc_confere: 'Doc. confere',
  doc_provavel: 'Doc. provável',
  em_parte: 'Em parte',
  nao_encontrada: 'Não encontradas',
  mb51_pendente: 'MB51 não importada',
};

export const DICA_SITUACAO_SEM_SAP: Record<SituacaoSemSap, string> = {
  doc_confere: 'Todos os itens estão no documento e o documento não tem linha sem requisição: a conta fecha nos dois sentidos. Falta só gravar o doc. SAP.',
  doc_provavel: 'Todos os itens estão no documento, mas a conta inversa não fecha (o documento tem linha que nenhuma requisição explica) ou o PEP difere — conferir antes de gravar.',
  em_parte: 'Só parte dos itens está num documento ainda livre da MB51 — o resto não foi lançado ou foi lançado com outra quantidade.',
  nao_encontrada: 'Nenhum documento da MB51 tem estes itens livres (sem outra requisição) depois da criação — a baixa provavelmente não foi feita no SAP.',
  mb51_pendente: 'A exportação é mais nova que o último lançamento importado da MB51 — importe a MB51 para conferir.',
};

export interface ConferenciaSemSap {
  situacao: SituacaoSemSap;
  /** Itens sem doc. SAP conferidos. */
  itens: number;
  /** Itens com linha no documento. */
  encontrados: number;
  /** Documento(s) mais provável(is). */
  docs: string[];
  /** Os documentos sugeridos não têm linha sem requisição. */
  docFecha: boolean;
  /** Linhas dos documentos sugeridos que nenhuma requisição explica. */
  sobraNoDoc: number;
  /** Outros documentos em que a requisição inteira também caberia (com o que sobrou livre). */
  alternativas: string[];
  /** Uma alternativa é tão provável quanto o documento escolhido. */
  ambigua: boolean;
  /** Itens casados com linha de PEP diferente. */
  pepDiferente: number;
  /** Minutos entre a exportação e o lançamento do documento; null = lançado antes de exportar. */
  minutosAposExportacao: number | null;
  /** Documento de cada item casado (item_id → doc). */
  docPorItem: Record<string, string>;
}

/** Diferença de relógio aceita entre o SAP e o SISTEN (17/11: exportação 08:21, documento 08:21). */
const TOLERANCIA_MS = 5 * 60_000;
/** Depois de uma exportação, até quando um lançamento ainda é dela. */
const JANELA_POS_EXPORTACAO_MS = 7 * 24 * 60 * 60_000;
const MINUTOS_DIA = 24 * 60;

interface Linha {
  doc: string;
  t: number;
  kind: KindMov;
  material: string;
  dep: string;
  pep: string | null;
  qtd: number;
  destinos: string[];
  livre: number;
}

interface Req {
  id: string;
  codigo: string;
  criado: number;
  exportacoes: number[];
  itens: ItemSemDocMb51[];
}

interface Encaixe {
  linhas: Map<string, Linha>;
  pepDiferente: number;
}

const normMaterial = (m: string | null | undefined) => String(m ?? '').trim().replace(/^0+/, '');
const normPep = (p: string | null | undefined) => (p ?? '').trim().toUpperCase() || null;
const chave = (kind: string, material: string, dep: string | null) => `${kind}|${normMaterial(material)}|${(dep ?? '').trim()}`;
const igual = (a: number, b: number) => Math.abs(a - b) < 1e-6;
const tempo = (s: string | null | undefined) => {
  const t = s ? Date.parse(s) : NaN;
  return Number.isNaN(t) ? null : t;
};

/** Pontuação da linha para o item: 0 = PEP igual, 1 = sem PEP de um lado, 2 = PEP diferente. */
function pontoPep(item: ItemSemDocMb51, l: Linha): number {
  const a = normPep(item.pep);
  if (!a || !l.pep) return 1;
  return a === l.pep ? 0 : 2;
}

function destinoServe(item: ItemSemDocMb51, l: Linha): boolean {
  if (item.kind !== 'T' || !item.dep_dest || l.destinos.length === 0) return true;
  return l.destinos.includes(item.dep_dest.trim());
}

/**
 * Minutos entre a exportação mais próxima antes do lançamento e o lançamento.
 * null = o documento não veio de nenhuma exportação (foi lançado antes de
 * exportar ou mais de 7 dias depois).
 */
function minutosAposExportacao(exportacoes: number[], t: number): number | null {
  let melhor: number | null = null;
  for (const e of exportacoes) {
    if (t < e - TOLERANCIA_MS || t > e + JANELA_POS_EXPORTACAO_MS) continue;
    const m = Math.max(0, (t - e) / 60_000);
    if (melhor == null || m < melhor) melhor = m;
  }
  return melhor;
}

/** Documento (ou linha) que pode ser da requisição: depois da criação e de uma exportação, ou antes de exportar. */
function instanteServe(r: Req, t: number): boolean {
  if (t < r.criado - TOLERANCIA_MS) return false;
  if (minutosAposExportacao(r.exportacoes, t) != null) return true;
  // Lançado à mão antes de exportar: vale, com pontuação pior.
  const primeira = r.exportacoes.length ? Math.min(...r.exportacoes) : Infinity;
  return t <= primeira;
}

/** Quanto menor, mais provável: minutos depois da exportação; antes de exportar pesa 14 dias. */
function pontuacao(r: Req, t: number, pepDiferente: number): number {
  const m = minutosAposExportacao(r.exportacoes, t);
  const base = m ?? (t - r.criado) / 60_000 + 14 * MINUTOS_DIA;
  return base + pepDiferente * 7 * MINUTOS_DIA;
}

/** Faixa de tempo: na primeira hora, no dia, na semana, depois. */
function faixa(p: number): number {
  return p <= 60 ? 0 : p <= MINUTOS_DIA ? 1 : p <= 7 * MINUTOS_DIA ? 2 : 3;
}

/** Cada item numa linha livre e exata do documento; null se algum não couber. */
function encaixar(r: Req, linhasDoc: Linha[]): Encaixe | null {
  const usadas = new Map<string, Linha>();
  const ocupadas = new Set<Linha>();
  let pepDiferente = 0;
  // Item com menos opções primeiro, para não gastar a linha que só ele tinha.
  const opcoes = r.itens.map((item) => ({
    item,
    linhas: linhasDoc.filter((l) => l.livre > 0 && l.kind === item.kind
      && l.material === normMaterial(item.material) && l.dep === (item.dep ?? '').trim()
      && igual(l.livre, Number(item.qtd)) && destinoServe(item, l)),
  })).sort((a, b) => a.linhas.length - b.linhas.length);
  for (const { item, linhas } of opcoes) {
    const livre = linhas.filter((l) => !ocupadas.has(l)).sort((a, b) => pontoPep(item, a) - pontoPep(item, b));
    const escolhida = livre[0];
    if (!escolhida) return null;
    ocupadas.add(escolhida);
    usadas.set(item.item_id, escolhida);
    if (pontoPep(item, escolhida) === 2) pepDiferente += 1;
  }
  return { linhas: usadas, pepDiferente };
}

/** Por requisição exportada sem doc. SAP, o documento mais provável e se a conta fecha nos dois sentidos. */
export function sugerirDocsSemSap(dados: CandidatosSemSap): Map<string, ConferenciaSemSap> {
  // Linhas e índices.
  const linhas: Linha[] = dados.linhas.map((l) => ({
    doc: String(l.doc),
    t: tempo(l.instante) ?? 0,
    kind: l.kind,
    material: normMaterial(l.material),
    dep: String(l.dep ?? '').trim(),
    pep: normPep(l.pep),
    qtd: Number(l.qtd),
    destinos: (l.destinos ?? []).map((d) => String(d).trim()),
    livre: Number(l.qtd),
  }));
  const porDoc = new Map<string, Linha[]>();
  const porChave = new Map<string, Linha[]>();
  for (const l of linhas) {
    (porDoc.get(l.doc) ?? porDoc.set(l.doc, []).get(l.doc)!).push(l);
    const k = chave(l.kind, l.material, l.dep);
    (porChave.get(k) ?? porChave.set(k, []).get(k)!).push(l);
  }
  const instanteDoc = new Map<string, number>();
  for (const [doc, ls] of porDoc) instanteDoc.set(doc, Math.min(...ls.map((l) => l.t)));

  // Estorno anula a linha igual lançada antes dele (a mais recente).
  for (const e of [...dados.estornos].sort((a, b) => (tempo(a.instante) ?? 0) - (tempo(b.instante) ?? 0))) {
    const te = tempo(e.instante) ?? 0;
    const pe = normPep(e.pep);
    const alvo = (porChave.get(chave(e.kind, e.material, e.dep)) ?? [])
      .filter((l) => l.livre > 0 && l.t <= te && igual(l.livre, Number(e.qtd)) && (!pe || !l.pep || pe === l.pep))
      .sort((a, b) => b.t - a.t)[0];
    if (alvo) alvo.livre = 0;
  }

  // O que já está ligado a um documento ocupa as linhas dele.
  for (const v of dados.vinculados) {
    let resta = Number(v.qtd);
    const pv = normPep(v.pep);
    const docs = new Set((v.docs ?? []).map(String));
    const candidatas = (porChave.get(chave(v.kind, v.material, v.dep)) ?? [])
      .filter((l) => docs.has(l.doc) && l.livre > 0)
      .sort((a, b) => Number(!igual(a.livre, resta)) - Number(!igual(b.livre, resta))
        || Number(!!pv && a.pep !== pv) - Number(!!pv && b.pep !== pv));
    for (const l of candidatas) {
      if (resta <= 0) break;
      const usa = Math.min(l.livre, resta);
      l.livre -= usa;
      resta -= usa;
    }
  }

  // Requisições.
  const reqs = new Map<string, Req>();
  for (const it of dados.itens) {
    let r = reqs.get(it.requisicao_id);
    if (!r) {
      const criado = tempo(it.criado_em) ?? 0;
      const exportacoes = (it.exportacoes ?? []).map(tempo).filter((t): t is number => t != null).sort((a, b) => a - b);
      r = { id: it.requisicao_id, codigo: it.codigo, criado, exportacoes, itens: [] };
      reqs.set(it.requisicao_id, r);
    }
    r.itens.push(it);
  }

  const docPorItem = new Map<string, Map<string, Linha>>();
  const info = new Map<string, {
    /** Documento da requisição inteira (passo 1); null = item a item. */
    doc: string | null;
    ponto: number;
    alternativas: string[];
    /** Outro documento tão provável quanto o escolhido (mesma faixa de tempo). */
    ambigua: boolean;
    pepDiferente: number;
    minutos: number | null;
  }>();

  const docsCandidatos = (r: Req): { doc: string; encaixe: Encaixe; ponto: number }[] => {
    const docs = new Set<string>();
    const primeiro = r.itens[0];
    for (const l of porChave.get(chave(primeiro.kind, primeiro.material, primeiro.dep)) ?? []) {
      if (l.livre > 0 && instanteServe(r, instanteDoc.get(l.doc) ?? l.t)) docs.add(l.doc);
    }
    const saida: { doc: string; encaixe: Encaixe; ponto: number }[] = [];
    for (const doc of docs) {
      const encaixe = encaixar(r, porDoc.get(doc) ?? []);
      if (encaixe) saida.push({ doc, encaixe, ponto: pontuacao(r, instanteDoc.get(doc) ?? 0, encaixe.pepDiferente) });
    }
    return saida.sort((a, b) => a.ponto - b.ponto);
  };

  const ocupar = (r: Req, doc: string, encaixe: Encaixe, ponto: number) => {
    for (const l of encaixe.linhas.values()) l.livre = 0;
    docPorItem.set(r.id, encaixe.linhas);
    info.set(r.id, {
      doc,
      ponto,
      alternativas: [],
      ambigua: false,
      pepDiferente: encaixe.pepDiferente,
      minutos: minutosAposExportacao(r.exportacoes, instanteDoc.get(doc) ?? 0),
    });
  };

  // 1. Requisição inteira num documento: a mais certa primeiro (lançada logo
  //    depois da exportação; na mesma faixa de tempo, a que só cabe num).
  const pendentes = new Set(reqs.keys());
  for (let volta = 0; pendentes.size > 0 && volta < 100_000; volta += 1) {
    let melhor: { r: Req; cands: ReturnType<typeof docsCandidatos> } | null = null;
    const chaveOrdem = (c: { r: Req; cands: ReturnType<typeof docsCandidatos> }) =>
      [faixa(c.cands[0].ponto), c.cands.length, c.cands[0].ponto, c.r.codigo] as const;
    for (const id of [...pendentes]) {
      const r = reqs.get(id)!;
      const cands = docsCandidatos(r);
      if (cands.length === 0) { pendentes.delete(id); continue; }
      const atual = { r, cands };
      if (!melhor) { melhor = atual; continue; }
      const a = chaveOrdem(atual);
      const b = chaveOrdem(melhor);
      if (a[0] < b[0] || (a[0] === b[0] && (a[1] < b[1] || (a[1] === b[1] && (a[2] < b[2] || (a[2] === b[2] && a[3] < b[3])))))) melhor = atual;
    }
    if (!melhor) break;
    const primeiro = melhor.cands[0];
    ocupar(melhor.r, primeiro.doc, primeiro.encaixe, primeiro.ponto);
    pendentes.delete(melhor.r.id);
  }

  // 2. Quem não coube inteira num documento: item a item, preferindo o
  //    documento de outro item da mesma requisição e o lançado logo depois da exportação.
  for (const r of [...reqs.values()].sort((a, b) => a.codigo.localeCompare(b.codigo))) {
    if (docPorItem.has(r.id)) continue;
    const casados = new Map<string, Linha>();
    let pepDiferente = 0;
    for (const item of r.itens) {
      const docsDaReq = new Set([...casados.values()].map((l) => l.doc));
      const opcoes = (porChave.get(chave(item.kind, item.material, item.dep)) ?? [])
        .filter((l) => l.livre > 0 && igual(l.livre, Number(item.qtd)) && destinoServe(item, l)
          && instanteServe(r, instanteDoc.get(l.doc) ?? l.t))
        .map((l) => ({ l, ponto: pontuacao(r, instanteDoc.get(l.doc) ?? l.t, pontoPep(item, l) === 2 ? 1 : 0) - (docsDaReq.has(l.doc) ? 1e9 : 0) }))
        .sort((a, b) => a.ponto - b.ponto);
      const escolhida = opcoes[0]?.l;
      if (!escolhida) continue;
      escolhida.livre = 0;
      casados.set(item.item_id, escolhida);
      if (pontoPep(item, escolhida) === 2) pepDiferente += 1;
    }
    if (casados.size > 0) {
      docPorItem.set(r.id, casados);
      const primeiroDoc = [...casados.values()][0].doc;
      info.set(r.id, {
        doc: null, ponto: 0, alternativas: [], ambigua: false, pepDiferente,
        minutos: minutosAposExportacao(r.exportacoes, instanteDoc.get(primeiroDoc) ?? 0),
      });
    }
  }

  // Alternativas no fim, com o que sobrou livre: outro documento em que a
  // requisição inteira ainda cabe. Se for da mesma faixa de tempo do escolhido,
  // a escolha é incerta; lançado antes da exportação não tira a certeza.
  for (const r of reqs.values()) {
    const inf = info.get(r.id);
    if (!inf?.doc) continue;
    const alternativas = docsCandidatos(r).filter((c) => c.doc !== inf.doc);
    inf.alternativas = alternativas.map((c) => c.doc);
    inf.ambigua = alternativas.some((c) => faixa(c.ponto) <= faixa(inf.ponto));
  }

  // 3. Conta inversa: linha do documento que nenhuma requisição explica.
  const sobraPorDoc = new Map<string, number>();
  for (const [doc, ls] of porDoc) sobraPorDoc.set(doc, ls.filter((l) => l.livre > 0).length);
  const ultimoMb51 = tempo(dados.mb51_ultimo) ?? (dados.mb51_ate ? tempo(`${dados.mb51_ate}T23:59:59-03:00`) : null);

  const saida = new Map<string, ConferenciaSemSap>();
  for (const r of reqs.values()) {
    const casados = docPorItem.get(r.id) ?? new Map<string, Linha>();
    const docs = [...new Set([...casados.values()].map((l) => l.doc))].sort();
    const sobraNoDoc = docs.reduce((s, d) => s + (sobraPorDoc.get(d) ?? 0), 0);
    const extra = info.get(r.id);
    const pepDiferente = extra?.pepDiferente ?? 0;
    const encontrados = casados.size;
    const primeiraExportacao = r.exportacoes.length ? r.exportacoes[0] : null;
    const situacao: SituacaoSemSap =
      encontrados === r.itens.length
        ? (sobraNoDoc === 0 && pepDiferente === 0 && !extra?.ambigua ? 'doc_confere' : 'doc_provavel')
        : encontrados > 0 ? 'em_parte'
          : ultimoMb51 != null && primeiraExportacao != null && primeiraExportacao > ultimoMb51 ? 'mb51_pendente'
            : 'nao_encontrada';
    saida.set(r.id, {
      situacao,
      itens: r.itens.length,
      encontrados,
      docs,
      docFecha: docs.length > 0 && sobraNoDoc === 0,
      sobraNoDoc,
      alternativas: extra?.alternativas ?? [],
      ambigua: extra?.ambigua ?? false,
      pepDiferente,
      minutosAposExportacao: extra?.minutos ?? null,
      docPorItem: Object.fromEntries([...casados].map(([item, l]) => [item, l.doc])),
    });
  }
  return saida;
}
