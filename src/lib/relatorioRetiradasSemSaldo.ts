/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Relatório das Retiradas sem Saldo (RSS) em Solicitações › Aprovações —
 * regras puras; a tela fica em `components/aprovacoes/RelatorioRetiradasSemSaldo.tsx`.
 *
 * Cada registro conta uma retirada, qualquer que seja o número de materiais.
 * A situação tem dois eixos independentes:
 *  - aprovação do gestor (`aprovacao_status`): aguardando / aprovada / reprovada;
 *  - baixa no balcão (`status`): aguardando baixa / baixada (RQB confirmada).
 *
 * EPI: uma retirada com pelo menos um EPI conta em "Com EPI" (inclusive as
 * mistas e as abertas pela Ficha de EPI); todas as outras são "Sem EPI" —
 * material sem cadastro ou sem grupo também conta como Sem EPI (pedido do
 * usuário em 10/11: não existe "classificação incompleta").
 *
 * Datas são texto ISO (`YYYY-MM-DD`): `new Date('2026-09-01')` volta 31/08 em UTC-3.
 */

import type { AprovacaoSolExtra, StatusSolExtra } from './solicitacaoExtra';
import type { SolExtra } from './solicitacaoExtraApi';
import { periodoDaData } from './relatorioSolExtra';
import { paraISOLocal } from './dataLocal';

export type FiltroEpiRetirada = 'todos' | 'com' | 'sem';
export type ClasseEpiRetirada = Exclude<FiltroEpiRetirada, 'todos'>;
export type AgrupamentoRetiradas = 'dia' | 'semana' | 'mes';

export const ROTULO_FILTRO_EPI: Record<FiltroEpiRetirada, string> = {
  todos: 'Todos os materiais',
  com: 'Com EPI',
  sem: 'Sem EPI',
};

/** Código SAP sem zeros à esquerda — a ZL0024 e o cadastro nem sempre concordam. */
export const codigoMaterialRetirada = (codigo: string) => codigo.trim().replace(/^0+(?=\d)/, '');

export function classeEpiRetirada(r: Pick<SolExtra, 'itens' | 'origem'>, materiais: ReadonlyMap<string, boolean>): ClasseEpiRetirada {
  if (r.origem === 'ficha_epi') return 'com';
  return r.itens.some(i => materiais.get(codigoMaterialRetirada(i.material)) === true) ? 'com' : 'sem';
}

export const chaveSetorRetirada = (r: Pick<SolExtra, 'setor_solicitante_id' | 'setor_solicitante_nome'>) =>
  r.setor_solicitante_id || r.setor_solicitante_nome?.trim() || 'sem-setor';

export const rotuloSetorRetirada = (r: Pick<SolExtra, 'setor_solicitante_nome'>) =>
  r.setor_solicitante_nome?.trim() || 'Setor não informado';

// ---------------------------------------------------------------------------
// Filtro
// ---------------------------------------------------------------------------

export interface FiltroRelatorioRetiradas {
  de: string | null;
  ate: string | null;
  /** `chaveSetorRetirada`; vazio = todos os setores que o usuário aprova. */
  setor: string;
  epi: FiltroEpiRetirada;
  aprovacao: AprovacaoSolExtra | 'todas';
  baixa: StatusSolExtra | 'todas';
}

export const FILTRO_RELATORIO_VAZIO: Omit<FiltroRelatorioRetiradas, 'de' | 'ate'> = {
  setor: '', epi: 'todos', aprovacao: 'todas', baixa: 'todas',
};

export function filtrarRelatorioRetiradas(
  registros: SolExtra[], f: FiltroRelatorioRetiradas, materiais: ReadonlyMap<string, boolean>,
): SolExtra[] {
  return registros.filter(r => r.tipo === 'SEM_SALDO' && !r.excluido_em
    && (!f.de || r.data >= f.de) && (!f.ate || r.data <= f.ate)
    && (!f.setor || chaveSetorRetirada(r) === f.setor)
    && (f.aprovacao === 'todas' || (r.aprovacao_status ?? 'PENDENTE') === f.aprovacao)
    && (f.baixa === 'todas' || r.status === f.baixa)
    && (f.epi === 'todos' || classeEpiRetirada(r, materiais) === f.epi));
}

// ---------------------------------------------------------------------------
// Resumo
// ---------------------------------------------------------------------------

export interface ContagemRetiradas {
  retiradas: number;
  /** Linhas de material somadas de todas as retiradas. */
  itens: number;
  aguardandoAprovacao: number;
  aprovadas: number;
  reprovadas: number;
  aguardandoBaixa: number;
  baixadas: number;
}

const zerada = (): ContagemRetiradas => ({
  retiradas: 0, itens: 0, aguardandoAprovacao: 0, aprovadas: 0, reprovadas: 0, aguardandoBaixa: 0, baixadas: 0,
});

function somar(c: ContagemRetiradas, r: SolExtra) {
  c.retiradas++;
  c.itens += r.itens.length;
  const aprovacao = r.aprovacao_status ?? 'PENDENTE';
  if (aprovacao === 'PENDENTE') c.aguardandoAprovacao++;
  else if (aprovacao === 'APROVADA') c.aprovadas++;
  else c.reprovadas++;
  if (r.status === 'REGULARIZADA') c.baixadas++;
  else c.aguardandoBaixa++;
}

export interface GrupoRetiradas extends ContagemRetiradas {
  chave: string;
  rotulo: string;
}

export interface MaterialRetirado {
  /** material + unidade: a mesma peça em unidades diferentes não se soma. */
  chave: string;
  material: string;
  descricao: string;
  unidade: string;
  retiradas: number;
  quantidade: number;
}

export interface ResumoRetiradas {
  totais: ContagemRetiradas;
  periodos: GrupoRetiradas[];
  setores: GrupoRetiradas[];
  materiais: MaterialRetirado[];
  /** Dias corridos da retirada até a baixa, média das baixadas (null sem nenhuma). */
  diasMedioAteBaixa: number | null;
}

const chaveMaterial = (material: string, unidade: string) =>
  `${codigoMaterialRetirada(material)}|${unidade.trim().toUpperCase()}`;

/** Dias corridos entre duas datas ISO (`YYYY-MM-DD`), sem fuso no meio. */
function diasEntre(de: string, ate: string): number {
  const utc = (iso: string) => { const [a, m, d] = iso.split('-').map(Number); return Date.UTC(a, m - 1, d); };
  return Math.round((utc(ate) - utc(de)) / 86_400_000);
}

export function resumirRetiradas(registros: SolExtra[], agrupamento: AgrupamentoRetiradas): ResumoRetiradas {
  const totais = zerada();
  const periodos = new Map<string, GrupoRetiradas>();
  const setores = new Map<string, GrupoRetiradas>();
  const materiais = new Map<string, MaterialRetirado>();
  let somaDias = 0;
  let baixadasComData = 0;

  for (const r of registros) {
    somar(totais, r);

    const p = periodoDaData(r.data, agrupamento);
    const gp = periodos.get(p.chave) ?? { ...p, ...zerada() };
    somar(gp, r);
    periodos.set(p.chave, gp);

    const cs = chaveSetorRetirada(r);
    const gs = setores.get(cs) ?? { chave: cs, rotulo: rotuloSetorRetirada(r), ...zerada() };
    somar(gs, r);
    setores.set(cs, gs);

    const contadas = new Set<string>();
    for (const i of r.itens) {
      const unidade = (i.unidade || '').trim().toUpperCase();
      const chave = chaveMaterial(i.material, unidade);
      const m = materiais.get(chave) ?? {
        chave, material: codigoMaterialRetirada(i.material), descricao: i.descricao || '', unidade, retiradas: 0, quantidade: 0,
      };
      if (!contadas.has(chave)) { m.retiradas++; contadas.add(chave); }
      m.quantidade += Number(i.quantidade) || 0;
      if (!m.descricao && i.descricao) m.descricao = i.descricao;
      materiais.set(chave, m);
    }

    if (r.status === 'REGULARIZADA' && r.regularizado_em) {
      const baixa = paraISOLocal(new Date(r.regularizado_em));
      const dias = diasEntre(r.data.slice(0, 10), baixa);
      if (dias >= 0) { somaDias += dias; baixadasComData++; }
    }
  }

  return {
    totais,
    periodos: [...periodos.values()].sort((a, b) => a.chave.localeCompare(b.chave)),
    setores: [...setores.values()].sort((a, b) => b.retiradas - a.retiradas || a.rotulo.localeCompare(b.rotulo, 'pt-BR')),
    materiais: [...materiais.values()].sort((a, b) =>
      b.retiradas - a.retiradas || b.quantidade - a.quantidade || a.material.localeCompare(b.material)),
    diasMedioAteBaixa: baixadasComData ? somaDias / baixadasComData : null,
  };
}

// ---------------------------------------------------------------------------
// Detalhamento (clique num número)
// ---------------------------------------------------------------------------

export type SituacaoRecorte = 'aguardandoAprovacao' | 'reprovadas' | 'aguardandoBaixa' | 'baixadas';

export type RecorteRetiradas =
  | { tipo: 'total'; situacao?: SituacaoRecorte }
  | { tipo: 'periodo'; chave: string; agrupamento: AgrupamentoRetiradas; situacao?: SituacaoRecorte }
  | { tipo: 'setor'; chave: string; situacao?: SituacaoRecorte }
  | { tipo: 'material'; chave: string };

function naSituacao(r: SolExtra, s: SituacaoRecorte | undefined): boolean {
  const aprovacao = r.aprovacao_status ?? 'PENDENTE';
  switch (s) {
    case 'aguardandoAprovacao': return aprovacao === 'PENDENTE';
    case 'reprovadas': return aprovacao === 'REPROVADA';
    case 'aguardandoBaixa': return r.status !== 'REGULARIZADA';
    case 'baixadas': return r.status === 'REGULARIZADA';
    default: return true;
  }
}

/** Recebe a mesma lista filtrada do resumo; devolve as retiradas inteiras, mais recentes primeiro. */
export function detalharRetiradas(registros: SolExtra[], recorte: RecorteRetiradas): SolExtra[] {
  return registros
    .filter(r => {
      switch (recorte.tipo) {
        case 'total': return naSituacao(r, recorte.situacao);
        case 'setor': return chaveSetorRetirada(r) === recorte.chave && naSituacao(r, recorte.situacao);
        case 'periodo': return periodoDaData(r.data, recorte.agrupamento).chave === recorte.chave && naSituacao(r, recorte.situacao);
        case 'material': return r.itens.some(i => chaveMaterial(i.material, i.unidade || '') === recorte.chave);
      }
    })
    .sort((a, b) => b.data.localeCompare(a.data) || (b.hora || '').localeCompare(a.hora || '') || (b.codigo || '').localeCompare(a.codigo || ''));
}
