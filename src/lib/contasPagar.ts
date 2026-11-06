/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Regras das partidas de Contas a Pagar (FBL1N), compartilhadas pela consulta
 * (ContasPagar) e pela Análise.
 *
 * Sinal: a FBL1N traz a partida de fornecedor com sinal de crédito — fatura
 * negativa, pagamento e nota de crédito positivos. O saldo em aberto é o valor
 * invertido, com sinal: nota de crédito em aberto ABATE a dívida. Antes a
 * consulta somava `Math.abs` por fornecedor e subtraía no total do topo, e a
 * soma dos fornecedores não fechava com o cartão "Total em Aberto".
 *
 * Datas: tudo em string ISO local (`YYYY-MM-DD`). `new Date().toISOString()`
 * devolve a data em UTC — depois das 21h em UTC-3 o "hoje" já era amanhã, e o
 * que vencia hoje aparecia como vencido.
 */

export { hojeISO } from './fichaEpi';

/** Campos que as duas telas leem da partida. */
export interface PartidaPagar {
  id: number;
  numero_documento: string | null;
  empresa: string | null;
  razao_social_fornecedor: string | null;
  fornecedor: string | null;
  data_lancamento: string | null;
  vencimento_liquido: string | null;
  montante_moeda_doc: number | null;
  doc_compensacao: string | null;
  data_compensacao: string | null;
  tipo_documento: string | null;
  tipo_documento_descricao: string | null;
}

/** Compensada: tem documento de compensação ou data de compensação. */
export function estaCompensada(l: PartidaPagar): boolean {
  const doc = l.doc_compensacao?.trim();
  return Boolean((doc && doc !== '—') || l.data_compensacao);
}

/** Saldo em aberto da partida, com sinal (0 quando compensada). */
export function saldoAberto(l: PartidaPagar): number {
  return estaCompensada(l) ? 0 : -(l.montante_moeda_doc || 0);
}

/** Valor pago: partida compensada com montante positivo (o pagamento em si). */
export function valorPago(l: PartidaPagar): number {
  const v = l.montante_moeda_doc || 0;
  return estaCompensada(l) && v > 0 ? v : 0;
}

export function nomeFornecedor(l: Pick<PartidaPagar, 'razao_social_fornecedor' | 'fornecedor'>): string {
  return l.razao_social_fornecedor?.trim() || l.fornecedor?.trim() || 'Sem fornecedor';
}

export function rotuloTipoDoc(l: Pick<PartidaPagar, 'tipo_documento' | 'tipo_documento_descricao'>): string {
  const code = l.tipo_documento?.trim();
  const desc = l.tipo_documento_descricao?.trim();
  if (code && desc) return `${code} - ${desc}`;
  return code || desc || '—';
}

const MS_DIA = 86_400_000;
const utc = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));

/** Soma `n` dias a uma data ISO, sem passar pelo fuso. */
export function somarDias(iso: string, n: number): string {
  return new Date(utc(iso) + n * MS_DIA).toISOString().slice(0, 10);
}

/** Dias corridos de `hoje` até `iso` (negativo = no passado). */
export function diasAte(iso: string, hoje: string): number {
  return Math.round((utc(iso) - utc(hoje)) / MS_DIA);
}

/** "hoje", "amanhã", "em 3 dias", "ontem", "há 12 dias". */
export function rotuloRelativo(iso: string, hoje: string): string {
  const d = diasAte(iso, hoje);
  if (d === 0) return 'hoje';
  if (d === 1) return 'amanhã';
  if (d === -1) return 'ontem';
  return d > 0 ? `em ${d} dias` : `há ${-d} dias`;
}

export function estaVencida(l: PartidaPagar, hoje: string): boolean {
  return !estaCompensada(l) && !!l.vencimento_liquido && l.vencimento_liquido < hoje;
}

/** Em aberto e vence de hoje até daqui a 7 dias (inclusive). */
export function venceEm7Dias(l: PartidaPagar, hoje: string): boolean {
  if (estaCompensada(l) || !l.vencimento_liquido) return false;
  return l.vencimento_liquido >= hoje && l.vencimento_liquido <= somarDias(hoje, 7);
}

/* --------------------------------------------------------------------- */
/* Faixas de vencimento (agenda)                                          */
/* --------------------------------------------------------------------- */

export type FaixaVencimento = 'vencido' | 'hoje' | '7d' | '30d' | 'depois' | 'sem_venc' | 'compensado';

export const ORDEM_FAIXAS: FaixaVencimento[] = ['vencido', 'hoje', '7d', '30d', 'depois', 'sem_venc', 'compensado'];

export const ROTULO_FAIXA: Record<FaixaVencimento, string> = {
  vencido: 'Vencidos',
  hoje: 'Vence hoje',
  '7d': 'Próximos 7 dias',
  '30d': 'Até 30 dias',
  depois: 'Depois de 30 dias',
  sem_venc: 'Sem vencimento',
  compensado: 'Compensados',
};

export function faixaVencimento(l: PartidaPagar, hoje: string): FaixaVencimento {
  if (estaCompensada(l)) return 'compensado';
  const v = l.vencimento_liquido;
  if (!v) return 'sem_venc';
  const d = diasAte(v, hoje);
  if (d < 0) return 'vencido';
  if (d === 0) return 'hoje';
  if (d <= 7) return '7d';
  if (d <= 30) return '30d';
  return 'depois';
}

/** Partidas agrupadas por faixa, na ordem da agenda e por vencimento dentro da faixa. */
export function agruparPorFaixa<T extends PartidaPagar>(linhas: T[], hoje: string): { faixa: FaixaVencimento; itens: T[]; total: number }[] {
  const mapa = new Map<FaixaVencimento, T[]>();
  for (const l of linhas) {
    const f = faixaVencimento(l, hoje);
    const lista = mapa.get(f);
    if (lista) lista.push(l); else mapa.set(f, [l]);
  }
  return ORDEM_FAIXAS.filter(f => mapa.has(f)).map(faixa => {
    const itens = mapa.get(faixa)!.sort((a, b) => {
      const va = a.vencimento_liquido ?? '9999';
      const vb = b.vencimento_liquido ?? '9999';
      // Compensados: o pagamento mais recente primeiro.
      return faixa === 'compensado' ? vb.localeCompare(va) : va.localeCompare(vb);
    });
    const total = itens.reduce((s, l) => s + (faixa === 'compensado' ? Math.abs(l.montante_moeda_doc || 0) : saldoAberto(l)), 0);
    return { faixa, itens, total };
  });
}

/* --------------------------------------------------------------------- */
/* Atalhos de situação (pílulas)                                          */
/* --------------------------------------------------------------------- */

export type AtalhoSituacao = 'vencidos' | '7d' | 'aberto' | 'tudo';

export const ROTULO_ATALHO: Record<AtalhoSituacao, string> = {
  vencidos: 'Vencidos',
  '7d': '7 dias',
  aberto: 'Em aberto',
  tudo: 'Tudo',
};

export function passaAtalho(l: PartidaPagar, atalho: AtalhoSituacao, hoje: string): boolean {
  switch (atalho) {
    case 'vencidos': return estaVencida(l, hoje);
    case '7d': return venceEm7Dias(l, hoje);
    case 'aberto': return !estaCompensada(l);
    default: return true;
  }
}

/* --------------------------------------------------------------------- */
/* Resumo do saldo em aberto                                              */
/* --------------------------------------------------------------------- */

export interface ResumoAberto {
  total: number;
  vencido: number;
  prox7: number;
  depois: number;
  pago: number;
  qtdAbertas: number;
  qtdVencidas: number;
  qtdPagas: number;
}

export function resumirAberto(linhas: PartidaPagar[], hoje: string): ResumoAberto {
  const r: ResumoAberto = { total: 0, vencido: 0, prox7: 0, depois: 0, pago: 0, qtdAbertas: 0, qtdVencidas: 0, qtdPagas: 0 };
  for (const l of linhas) {
    if (estaCompensada(l)) {
      const p = valorPago(l);
      if (p > 0) { r.pago += p; r.qtdPagas++; }
      continue;
    }
    const s = saldoAberto(l);
    r.total += s;
    r.qtdAbertas++;
    if (estaVencida(l, hoje)) { r.vencido += s; r.qtdVencidas++; }
    else if (venceEm7Dias(l, hoje)) r.prox7 += s;
    else r.depois += s;
  }
  return r;
}

/* --------------------------------------------------------------------- */
/* Agrupamento por fornecedor                                             */
/* --------------------------------------------------------------------- */

export interface GrupoFornecedor<T extends PartidaPagar = PartidaPagar> {
  nome: string;
  codigo: string | null;
  itens: T[];
  /** Saldo em aberto com sinal (negativo = fornecedor com crédito). */
  saldoAberto: number;
  saldoVencido: number;
  valorPago: number;
  qtdAbertos: number;
  qtdVencidos: number;
  qtdCompensados: number;
  /** Vencimento mais próximo entre as partidas em aberto ainda não vencidas. */
  proximoVencimento: string | null;
}

export type OrdemFornecedores = 'aberto' | 'fornecedor' | 'lancamentos' | 'valor' | 'vencidos';

export function agruparPorFornecedor<T extends PartidaPagar>(linhas: T[], hoje: string): GrupoFornecedor<T>[] {
  const mapa = new Map<string, GrupoFornecedor<T>>();
  for (const l of linhas) {
    const nome = nomeFornecedor(l);
    let g = mapa.get(nome);
    if (!g) {
      g = {
        nome, codigo: l.fornecedor?.trim() || null, itens: [], saldoAberto: 0, saldoVencido: 0, valorPago: 0,
        qtdAbertos: 0, qtdVencidos: 0, qtdCompensados: 0, proximoVencimento: null,
      };
      mapa.set(nome, g);
    }
    g.itens.push(l);
    if (estaCompensada(l)) {
      g.qtdCompensados++;
      g.valorPago += valorPago(l);
      continue;
    }
    const s = saldoAberto(l);
    g.qtdAbertos++;
    g.saldoAberto += s;
    if (estaVencida(l, hoje)) {
      g.qtdVencidos++;
      g.saldoVencido += s;
    } else if (l.vencimento_liquido && (!g.proximoVencimento || l.vencimento_liquido < g.proximoVencimento)) {
      g.proximoVencimento = l.vencimento_liquido;
    }
  }
  return Array.from(mapa.values());
}

export function ordenarFornecedores<T extends PartidaPagar>(
  grupos: GrupoFornecedor<T>[], ordem: OrdemFornecedores | null, dir: 'asc' | 'desc' = 'desc',
): GrupoFornecedor<T>[] {
  const lista = [...grupos];
  const sinal = dir === 'asc' ? 1 : -1;
  const porNome = (a: GrupoFornecedor<T>, b: GrupoFornecedor<T>) => a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true });
  switch (ordem) {
    case 'fornecedor': return lista.sort((a, b) => porNome(a, b) * sinal);
    case 'lancamentos': return lista.sort((a, b) => (a.itens.length - b.itens.length) * sinal || porNome(a, b));
    case 'valor': return lista.sort((a, b) => (a.valorPago - b.valorPago) * sinal || porNome(a, b));
    case 'vencidos': return lista.sort((a, b) => (a.saldoVencido - b.saldoVencido) * sinal || porNome(a, b));
    case 'aberto': return lista.sort((a, b) => (a.saldoAberto - b.saldoAberto) * sinal || porNome(a, b));
    // Sem ordem escolhida: quem tem mais a pagar primeiro.
    default: return lista.sort((a, b) => b.saldoAberto - a.saldoAberto || porNome(a, b));
  }
}
