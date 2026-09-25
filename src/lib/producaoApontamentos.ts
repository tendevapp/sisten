/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Produção › Apontamentos — lógica pura (sem Supabase, testável em Node).
 *
 * Modelo simplificado: por etapa de cada nave (Nave 1, Nave 2, White), o
 * Planejamento lança o PROGRAMADO da semana e a produção lança o REALIZADO do
 * dia. Sem travar etapas nem vincular peças. A tabela Programado × Realizado
 * e os relatórios são montados aqui a partir das somas semanais
 * (`prod_apt_realizado_semanal`, migration
 * `20260925150000_simplificar_prod_apontamentos.sql`).
 *
 * Semana = semana ISO (segunda a domingo), a mesma do `extract(week)` do
 * Postgres e das colunas W32..W36 da planilha.
 */

export type Nave = 'nave1' | 'nave2' | 'white';

export interface EtapaApontamento {
  id: string;
  nave: Nave;
  nome: string;
  ordem: number;
  ativa: boolean;
}

export interface SemanaRef {
  /** Ano ISO — no fim/início do ano pode diferir do ano civil. */
  ano: number;
  semana: number;
}

/** Linha semanal por etapa: programado (Planejamento) ou realizado (soma dos lançamentos). */
export interface QuantidadeSemanal extends SemanaRef {
  etapa_id: string;
  quantidade: number;
}

export interface ItemLancamento {
  etapa_id: string;
  quantidade: number;
}

export interface LancamentoApontamento {
  id: string;
  codigo: string;
  data: string;
  nave: Nave;
  observacao: string | null;
  criado_por: string | null;
  criado_por_nome: string | null;
  atualizado_por_nome: string | null;
  created_at: string;
  updated_at: string;
  itens: ItemLancamento[];
}

export interface ConfigNave {
  id: Nave;
  titulo: string;
  descricao: string;
}

export const NAVES: ConfigNave[] = [
  { id: 'nave1', titulo: 'Nave 1', descricao: 'Corte, calandra, solda e montagem de virolas.' },
  { id: 'nave2', titulo: 'Nave 2', descricao: 'SAW 03 e internos soldáveis.' },
  { id: 'white', titulo: 'White', descricao: 'Jato, metalização, pintura e reparo.' },
];

export const tituloNave = (nave: Nave): string => NAVES.find(n => n.id === nave)?.titulo ?? nave;

// ---------------------------------------------------------------------------
// Datas e semanas ISO (fatiando strings em UTC — `new Date('2026-09-01')`
// volta 31/08 em UTC-3)
// ---------------------------------------------------------------------------

const DIA_MS = 86400000;

function utc(dataISO: string): Date {
  const [a, m, d] = dataISO.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d));
}

const iso = (d: Date): string => d.toISOString().slice(0, 10);

/** Data local de hoje (America/Sao_Paulo, UTC-3 fixo — sem horário de verão desde 2019). */
export function hojeLocal(agora: Date = new Date()): string {
  return new Date(agora.getTime() - 3 * 3600000).toISOString().slice(0, 10);
}

export function adicionarDias(dataISO: string, dias: number): string {
  const d = utc(dataISO);
  d.setUTCDate(d.getUTCDate() + dias);
  return iso(d);
}

/** Semana ISO de uma data (a quinta-feira da semana decide o ano). */
export function semanaISO(dataISO: string): SemanaRef {
  const d = utc(dataISO);
  const diaSemana = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - diaSemana);
  const ano = d.getUTCFullYear();
  const semana = Math.ceil(((d.getTime() - Date.UTC(ano, 0, 1)) / DIA_MS + 1) / 7);
  return { ano, semana };
}

/** Segunda-feira da semana ISO. */
export function segundaDaSemana({ ano, semana }: SemanaRef): string {
  const quatroJan = new Date(Date.UTC(ano, 0, 4));
  const diaSemana = quatroJan.getUTCDay() || 7;
  quatroJan.setUTCDate(quatroJan.getUTCDate() - diaSemana + 1 + (semana - 1) * 7);
  return iso(quatroJan);
}

export const semanasNoAno = (ano: number): number => semanaISO(`${ano}-12-28`).semana;

export function adicionarSemanas(ref: SemanaRef, n: number): SemanaRef {
  return semanaISO(adicionarDias(segundaDaSemana(ref), n * 7));
}

/** Semanas `de`..`ate` de um ano ISO (limitadas às semanas que o ano tem). */
export function semanasDoIntervalo(ano: number, de: number, ate: number): SemanaRef[] {
  const fim = Math.min(ate, semanasNoAno(ano));
  const inicio = Math.max(1, Math.min(de, fim));
  return Array.from({ length: fim - inicio + 1 }, (_, i) => ({ ano, semana: inicio + i }));
}

/** a ≤ b na ordem do calendário. */
export const semanaAteOuIgual = (a: SemanaRef, b: SemanaRef): boolean => a.ano < b.ano || (a.ano === b.ano && a.semana <= b.semana);

/** `qtd` semanas terminando em `fim`, da mais antiga para a mais recente. */
export function janelaSemanas(fim: SemanaRef, qtd: number): SemanaRef[] {
  return Array.from({ length: qtd }, (_, i) => adicionarSemanas(fim, i - (qtd - 1)));
}

export const chaveSemana = ({ ano, semana }: SemanaRef): string => `${ano}-${semana}`;
export const rotuloSemana = ({ semana }: SemanaRef): string => `W${String(semana).padStart(2, '0')}`;
export const mesmaSemana = (a: SemanaRef, b: SemanaRef): boolean => a.ano === b.ano && a.semana === b.semana;

/** 21/09 – 27/09 */
export function intervaloSemana(ref: SemanaRef): string {
  const seg = segundaDaSemana(ref);
  const dom = adicionarDias(seg, 6);
  return `${seg.slice(8, 10)}/${seg.slice(5, 7)} – ${dom.slice(8, 10)}/${dom.slice(5, 7)}`;
}

export function formatarDataBR(dataISO: string): string {
  const [a, m, d] = dataISO.split('-');
  return `${d}/${m}/${a}`;
}

// ---------------------------------------------------------------------------
// Aderência
// ---------------------------------------------------------------------------

/** Realizado ÷ programado; sem programado não há aderência. */
export function aderencia(programado: number | null | undefined, realizado: number): number | null {
  return programado && programado > 0 ? realizado / programado : null;
}

export type Situacao = 'atingido' | 'abaixo' | 'vazio';

/** Cor da célula na planilha: verde se atingiu o programado, vermelho se ficou abaixo. */
export function situacao(programado: number | null | undefined, realizado: number): Situacao {
  const prog = programado ?? 0;
  if (prog === 0 && realizado === 0) return 'vazio';
  return realizado >= prog ? 'atingido' : 'abaixo';
}

/** 94,54% */
export function formatarPercentual(valor: number | null, casas = 2): string {
  if (valor == null) return '—';
  return `${(valor * 100).toFixed(casas).replace('.', ',')}%`;
}

// ---------------------------------------------------------------------------
// Matriz Programado × Realizado
// ---------------------------------------------------------------------------

export interface Celula {
  programado: number | null;
  realizado: number;
}

export interface TotalLinha {
  programado: number;
  realizado: number;
  aderencia: number | null;
}

export interface LinhaMatriz {
  etapa: EtapaApontamento;
  total: TotalLinha;
  semanas: Celula[];
}

export interface GrupoNave {
  nave: ConfigNave;
  linhas: LinhaMatriz[];
  total: TotalLinha;
  semanas: Celula[];
}

export interface Matriz {
  semanas: SemanaRef[];
  /** Ano ISO do acumulado. */
  anoTotal: number;
  /** Última semana somada no TOTAL. */
  totalAte: SemanaRef;
  grupos: GrupoNave[];
}

function somarTotais(linhas: TotalLinha[]): TotalLinha {
  const programado = linhas.reduce((s, l) => s + l.programado, 0);
  const realizado = linhas.reduce((s, l) => s + l.realizado, 0);
  return { programado, realizado, aderencia: aderencia(programado, realizado) };
}

function indexar(linhas: QuantidadeSemanal[]): Map<string, number> {
  const mapa = new Map<string, number>();
  for (const l of linhas) {
    const k = `${l.etapa_id}|${chaveSemana(l)}`;
    mapa.set(k, (mapa.get(k) ?? 0) + Number(l.quantidade));
  }
  return mapa;
}

/**
 * Monta a tabela: uma linha por etapa ativa, agrupada por nave.
 * - Colunas de semana: as `semanas` pedidas (podem ir até a W52, com o
 *   programado futuro do Planejamento).
 * - TOTAL: acumulado do ano ISO de `totalAte`, da semana 1 até ela. Na tela é
 *   a semana atual — somar o programado das semanas que ainda não aconteceram
 *   derrubaria a aderência. Sem `totalAte`, vale a última semana da janela.
 */
export function montarMatriz(entrada: {
  etapas: EtapaApontamento[];
  programacao: QuantidadeSemanal[];
  realizado: QuantidadeSemanal[];
  semanas: SemanaRef[];
  totalAte?: SemanaRef;
}): Matriz {
  const fim = entrada.totalAte ?? entrada.semanas[entrada.semanas.length - 1];
  const prog = indexar(entrada.programacao);
  const real = indexar(entrada.realizado);

  const acumulado = (fonte: QuantidadeSemanal[], etapaId: string) =>
    fonte
      .filter(l => l.etapa_id === etapaId && l.ano === fim.ano && l.semana <= fim.semana)
      .reduce((s, l) => s + Number(l.quantidade), 0);

  const grupos: GrupoNave[] = NAVES.map(nave => {
    const linhas: LinhaMatriz[] = entrada.etapas
      .filter(e => e.nave === nave.id && e.ativa)
      .sort((a, b) => a.ordem - b.ordem)
      .map(etapa => {
        const programado = acumulado(entrada.programacao, etapa.id);
        const realizado = acumulado(entrada.realizado, etapa.id);
        return {
          etapa,
          total: { programado, realizado, aderencia: aderencia(programado, realizado) },
          semanas: entrada.semanas.map(s => ({
            programado: prog.get(`${etapa.id}|${chaveSemana(s)}`) ?? null,
            realizado: real.get(`${etapa.id}|${chaveSemana(s)}`) ?? 0,
          })),
        };
      });
    const semanas = entrada.semanas.map((_, i) => {
      const comProg = linhas.filter(l => l.semanas[i].programado != null);
      return {
        programado: comProg.length ? comProg.reduce((s, l) => s + (l.semanas[i].programado ?? 0), 0) : null,
        realizado: linhas.reduce((s, l) => s + l.semanas[i].realizado, 0),
      };
    });
    return { nave, linhas, total: somarTotais(linhas.map(l => l.total)), semanas };
  });

  return { semanas: entrada.semanas, anoTotal: fim.ano, totalAte: fim, grupos };
}

// ---------------------------------------------------------------------------
// Relatórios
// ---------------------------------------------------------------------------

export interface PontoPrevistoRealizado {
  etapaId: string;
  nome: string;
  previsto: number;
  realizado: number;
  aderencia: number | null;
}

/** Barras do "Indicador Previsto × Realizado": totais acumulados de cada etapa da nave. */
export function pontosPrevistoRealizado(grupo: GrupoNave): PontoPrevistoRealizado[] {
  return grupo.linhas
    .filter(l => l.total.programado > 0 || l.total.realizado > 0)
    .map(l => ({
      etapaId: l.etapa.id,
      nome: l.etapa.nome,
      previsto: l.total.programado,
      realizado: l.total.realizado,
      aderencia: l.total.aderencia,
    }));
}

export interface PontoAderenciaSemanal {
  rotulo: string;
  intervalo: string;
  /** Aderência 0..n por nave (null quando a nave não tinha programado na semana). */
  [nave: string]: number | string | null;
}

/** Aderência semanal de cada nave (soma do realizado ÷ soma do programado), até `totalAte`. */
export function serieAderenciaSemanal(matriz: Matriz): PontoAderenciaSemanal[] {
  return matriz.semanas.flatMap((s, i) => {
    if (!semanaAteOuIgual(s, matriz.totalAte)) return [];
    const ponto: PontoAderenciaSemanal = { rotulo: rotuloSemana(s), intervalo: intervaloSemana(s) };
    for (const g of matriz.grupos) {
      const c = g.semanas[i];
      ponto[g.nave.id] = aderencia(c.programado, c.realizado);
    }
    return [ponto];
  });
}

/** Etapas com a menor aderência acumulada (com programado) — onde olhar primeiro. */
export function etapasCriticas(matriz: Matriz, limite = 5): Array<LinhaMatriz & { nave: ConfigNave }> {
  return matriz.grupos
    .flatMap(g => g.linhas.map(l => ({ ...l, nave: g.nave })))
    .filter(l => l.total.aderencia != null)
    .sort((a, b) => (a.total.aderencia ?? 0) - (b.total.aderencia ?? 0))
    .slice(0, limite);
}

/** Soma os itens de vários lançamentos por etapa (resumo do dia). */
export function somarItens(lancamentos: Pick<LancamentoApontamento, 'itens'>[]): Map<string, number> {
  const mapa = new Map<string, number>();
  for (const l of lancamentos) for (const i of l.itens) mapa.set(i.etapa_id, (mapa.get(i.etapa_id) ?? 0) + i.quantidade);
  return mapa;
}
