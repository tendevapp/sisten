/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Baixa em lote das retiradas sem saldo (RSS) que a ZL0024 já cobre —
 * Geral › Pendências. Módulo puro: seleção, resumo do lote e leitura do
 * resultado. Quem confirma é o banco (`alm_sol_extra_baixar_lote`), com as
 * mesmas regras do "Dar baixa" individual.
 */

import type { SolExtra } from './solicitacaoExtraApi';
import type { ItensBaixadosPorId, SaldoParaRegularizar } from './retiradaSemSaldoBaixa';
import { normalizeCode } from './almoxarifado';

type RegistroLote = Pick<SolExtra, 'id' | 'codigo' | 'status' | 'itens' | 'aprovacao_status' | 'aplicacao_pep'>
  & Partial<Pick<SolExtra, 'aplicacao' | 'tipo_movimento' | 'deposito_destino'>>;

type RegistroGrupo = Pick<SolExtra, 'aplicacao_pep'> & Partial<Pick<SolExtra, 'aplicacao' | 'tipo_movimento' | 'deposito_destino'>>;

const ehTransferencia = (r: RegistroGrupo) => r.tipo_movimento === 'transferencia';

/**
 * Grupo da baixa: o tipo (saída ou transferência) e, na saída, o PEP; na
 * transferência, o depósito de destino. É como o SAP lança — cada grupo vira
 * linhas com o mesmo movimento e a mesma aplicação.
 */
export function chaveGrupoBaixa(r: RegistroGrupo): string {
  return ehTransferencia(r)
    ? `transferencia|${(r.deposito_destino || '').trim()}`
    : `saida|${(r.aplicacao_pep || '').trim().toUpperCase()}`;
}

export function rotuloGrupoBaixa(r: RegistroGrupo): string {
  if (ehTransferencia(r)) return `Transferência → ${(r.deposito_destino || '').trim() || 'destino a definir'}`;
  const pep = (r.aplicacao_pep || '').trim();
  if (!pep) return 'Saída · sem PEP';
  const nome = (r.aplicacao || '').trim();
  return `Saída · ${nome && nome !== pep ? `${nome} (${pep})` : pep}`;
}

/** Só entra no lote retirada pendente e já sincronizada (com código RSS). */
export function podeEntrarNoLote(r: Pick<SolExtra, 'codigo' | 'status'>): boolean {
  return !!r.codigo && r.status === 'PENDENTE';
}

export interface GrupoMaterialLote {
  material: string;
  descricao: string;
  unidade: string;
  quantidade: number;
  retiradas: number;
}

/** O lote por material — é assim que o almoxarifado confere (77 × luva TAM 9). */
export function agruparPorMaterial(registros: Pick<SolExtra, 'itens'>[]): GrupoMaterialLote[] {
  const grupos = new Map<string, GrupoMaterialLote>();
  for (const r of registros) {
    const vistosNaRetirada = new Set<string>();
    for (const it of r.itens) {
      const chave = normalizeCode(it.material);
      const g = grupos.get(chave) ?? {
        material: it.material, descricao: it.descricao || '', unidade: it.unidade || 'UN', quantidade: 0, retiradas: 0,
      };
      g.quantidade += Number(it.quantidade) || 0;
      if (!g.descricao && it.descricao) g.descricao = it.descricao;
      if (!vistosNaRetirada.has(chave)) { g.retiradas += 1; vistosNaRetirada.add(chave); }
      grupos.set(chave, g);
    }
  }
  return [...grupos.values()].sort((a, b) => b.retiradas - a.retiradas || a.material.localeCompare(b.material));
}

/**
 * O que sai agora de cada retirada: os itens que o saldo de hoje cobre e que
 * ainda não saíram numa baixa parcial. Sem a cobertura lida, todos os pendentes.
 */
export function itensQueSaem<T extends Pick<SolExtra, 'id' | 'itens'>>(
  r: T, cobertura: Map<string, boolean[]> | null, baixados: ItensBaixadosPorId | null,
): T['itens'] {
  const cob = cobertura?.get(r.id);
  const jaSaiu = baixados?.get(r.id);
  return r.itens.filter((_, i) => !jaSaiu?.[i] && (cob ? cob[i] : true));
}

/** Itens que ficam aguardando saldo depois da baixa (não cobertos e não baixados). */
export function itensQueFicam<T extends Pick<SolExtra, 'id' | 'itens'>>(
  r: T, cobertura: Map<string, boolean[]> | null, baixados: ItensBaixadosPorId | null,
): T['itens'] {
  const cob = cobertura?.get(r.id);
  if (!cob) return [];
  const jaSaiu = baixados?.get(r.id);
  return r.itens.filter((_, i) => !jaSaiu?.[i] && !cob[i]);
}

/** Saída sem PEP (transferência não leva PEP). */
export const semPep = (r: RegistroGrupo) => !ehTransferencia(r) && !(r.aplicacao_pep || '').trim();
export const naoAprovada = (r: Pick<SolExtra, 'aprovacao_status'>) => r.aprovacao_status !== 'APROVADA';

export interface AtalhoGrupo {
  chave: string;
  rotulo: string;
  ids: string[];
}

export interface AtalhosSelecao {
  /** Todas as que a ZL0024 de hoje já cobre. */
  prontas: string[];
  /** Prontas e aprovadas pelo gestor — o padrão sugerido. */
  prontasAprovadas: string[];
  /** Saldo parcial: a baixa libera os itens com saldo e o resto fica pendente. */
  parciais: string[];
  /** Prontas por tipo de baixa e PEP/destino (os maiores grupos primeiro). */
  porGrupo: AtalhoGrupo[];
}

export function atalhosSelecao(
  registros: RegistroLote[],
  saldo: Map<string, SaldoParaRegularizar> | null,
  maxGrupos = 6,
): AtalhosSelecao {
  const prontas = registros.filter(r => podeEntrarNoLote(r) && saldo?.get(r.id)?.prontidao === 'pronta');
  const grupos = new Map<string, AtalhoGrupo>();
  for (const r of prontas) {
    const chave = chaveGrupoBaixa(r);
    const g = grupos.get(chave) ?? { chave, rotulo: rotuloGrupoBaixa(r), ids: [] };
    g.ids.push(r.id);
    grupos.set(chave, g);
  }
  return {
    prontas: prontas.map(r => r.id),
    prontasAprovadas: prontas.filter(r => !naoAprovada(r)).map(r => r.id),
    parciais: registros.filter(r => podeEntrarNoLote(r) && saldo?.get(r.id)?.prontidao === 'parcial').map(r => r.id),
    porGrupo: [...grupos.values()].sort((a, b) => b.ids.length - a.ids.length).slice(0, maxGrupos),
  };
}

/** Uma linha do retorno de `alm_sol_extra_baixar_lote`. */
export interface ResultadoBaixaLote {
  rss: string;
  rqb?: string | null;
  /** Id da Requisição no Balcão confirmada (só quando `ok`). */
  id?: string | null;
  ok: boolean;
  erro?: string | null;
  /** Baixa parcial: `rqb` é a requisição nova (confirmada); o resto segue em `rqb_pendente`. */
  parcial?: boolean;
  itens_baixados?: number;
  itens_restantes?: number;
  rqb_pendente?: string | null;
}

export function resumirResultado(linhas: ResultadoBaixaLote[]) {
  const ok = linhas.filter(l => l.ok);
  const falhas = linhas.filter(l => !l.ok);
  return {
    ok,
    falhas,
    parciais: ok.filter(l => l.parcial),
    idsConfirmados: ok.map(l => l.id).filter((id): id is string => !!id),
  };
}
