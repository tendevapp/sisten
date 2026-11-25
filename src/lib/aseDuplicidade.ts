/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Deteccao de colaboradores ja incluidos em outra ASE na mesma data de execucao.
 * Evita que dois gestores lancem horas extras duplicadas para a mesma pessoa
 * (considerando ASEs em RASCUNHO e ENVIADO, ignorando CANCELADO e excluidas).
 */

import type { AseHoraExtraStatus } from '../types';
import { formatarPeriodoAse } from './aseHorarios';

export interface AseMesmoDiaItem {
  id: string;
  pessoa_id: string | null;
  registro: string;
  nome: string;
  hora_entrada: string;
  hora_saida: string;
  excluido_em?: string | null;
}

export interface AseMesmoDiaResumo {
  id: string;
  numero_protocolo: string;
  status: AseHoraExtraStatus;
  data_execucao: string;
  excluido_em?: string | null;
  setor_nome: string | null;
  turno_nome: string | null;
  solicitante_nome: string | null;
  itens: AseMesmoDiaItem[];
}

export interface OcorrenciaColaboradorAse {
  solicitacaoId: string;
  protocolo: string;
  status: AseHoraExtraStatus;
  setorNome: string | null;
  turnoNome: string | null;
  solicitanteNome: string | null;
  horaEntrada: string;
  horaSaida: string;
  pessoaId: string | null;
}

export interface AlvoColaboradorAse {
  pessoa_id?: string | null;
  registro?: string | null;
  nome?: string | null;
}

export interface IndiceDuplicidadeAse {
  porPessoaId: Map<string, OcorrenciaColaboradorAse[]>;
  porRegistro: Map<string, OcorrenciaColaboradorAse[]>;
  porNome: Map<string, OcorrenciaColaboradorAse[]>;
}

const STATUS_ATIVOS_DUPLICIDADE: ReadonlySet<AseHoraExtraStatus> = new Set(['RASCUNHO', 'ENVIADO']);

const ROTULO_STATUS_CURTO: Record<AseHoraExtraStatus, string> = {
  RASCUNHO: 'Rascunho',
  ENVIADO: 'Enviado',
  CANCELADO: 'Cancelado',
};

export function normalizarRegistroAse(registro?: string | null): string {
  const limpo = String(registro || '').trim().toUpperCase();
  if (!limpo || limpo === '-' || limpo === '—') return '';
  return limpo;
}

export function normalizarNomeAse(nome?: string | null): string {
  return String(nome || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function adicionarNoIndice(
  mapa: Map<string, OcorrenciaColaboradorAse[]>,
  chave: string,
  ocorrencia: OcorrenciaColaboradorAse,
): void {
  if (!chave) return;
  const lista = mapa.get(chave);
  if (!lista) {
    mapa.set(chave, [ocorrencia]);
    return;
  }
  if (!lista.some(oc => oc.solicitacaoId === ocorrencia.solicitacaoId)) {
    lista.push(ocorrencia);
  }
}

/**
 * Monta um indice por pessoa_id, registro e nome normalizado contendo apenas
 * outras ASEs ativas (RASCUNHO ou ENVIADO, nao excluidas) da mesma data.
 */
export function construirIndiceDuplicidadeAse(
  solicitacoesDia: AseMesmoDiaResumo[],
  aseAtualId: string,
): IndiceDuplicidadeAse {
  const porPessoaId = new Map<string, OcorrenciaColaboradorAse[]>();
  const porRegistro = new Map<string, OcorrenciaColaboradorAse[]>();
  const porNome = new Map<string, OcorrenciaColaboradorAse[]>();

  for (const sol of solicitacoesDia) {
    if (sol.id === aseAtualId) continue;
    if (sol.excluido_em) continue;
    if (!STATUS_ATIVOS_DUPLICIDADE.has(sol.status)) continue;

    for (const item of sol.itens) {
      if (item.excluido_em) continue;

      const ocorrencia: OcorrenciaColaboradorAse = {
        solicitacaoId: sol.id,
        protocolo: sol.numero_protocolo,
        status: sol.status,
        setorNome: sol.setor_nome,
        turnoNome: sol.turno_nome,
        solicitanteNome: sol.solicitante_nome,
        horaEntrada: item.hora_entrada || '',
        horaSaida: item.hora_saida || '',
        pessoaId: item.pessoa_id ?? null,
      };

      if (item.pessoa_id) {
        adicionarNoIndice(porPessoaId, item.pessoa_id, ocorrencia);
      }
      adicionarNoIndice(porRegistro, normalizarRegistroAse(item.registro), ocorrencia);
      adicionarNoIndice(porNome, normalizarNomeAse(item.nome), ocorrencia);
    }
  }

  return { porPessoaId, porRegistro, porNome };
}

/**
 * Retorna as outras ASEs da mesma data em que o colaborador ja aparece.
 * Quando ambos os lados possuem pessoa_id cadastrado no RH e diferentes entre si,
 * ignora o casamento apenas por nome para evitar falso positivo com homonimos.
 */
export function buscarDuplicidadesColaborador(
  indice: IndiceDuplicidadeAse,
  alvo: AlvoColaboradorAse,
): OcorrenciaColaboradorAse[] {
  const porSolicitacao = new Map<string, OcorrenciaColaboradorAse>();

  const registrar = (lista?: OcorrenciaColaboradorAse[]) => {
    if (!lista) return;
    for (const oc of lista) {
      if (!porSolicitacao.has(oc.solicitacaoId)) {
        porSolicitacao.set(oc.solicitacaoId, oc);
      }
    }
  };

  if (alvo.pessoa_id) {
    registrar(indice.porPessoaId.get(alvo.pessoa_id));
  }

  const reg = normalizarRegistroAse(alvo.registro);
  if (reg) {
    registrar(indice.porRegistro.get(reg));
  }

  const nomeNorm = normalizarNomeAse(alvo.nome);
  if (nomeNorm) {
    const porNome = indice.porNome.get(nomeNorm);
    if (porNome) {
      for (const oc of porNome) {
        const ambosCadastradosDiferentes = Boolean(alvo.pessoa_id && oc.pessoaId && alvo.pessoa_id !== oc.pessoaId);
        if (!ambosCadastradosDiferentes && !porSolicitacao.has(oc.solicitacaoId)) {
          porSolicitacao.set(oc.solicitacaoId, oc);
        }
      }
    }
  }

  return Array.from(porSolicitacao.values());
}

export function formatarResumoOcorrenciaAse(oc: OcorrenciaColaboradorAse): string {
  const partes = [
    `${oc.protocolo} (${ROTULO_STATUS_CURTO[oc.status] || oc.status})`,
    oc.setorNome || null,
    oc.solicitanteNome ? `Solicitante: ${oc.solicitanteNome}` : null,
    formatarPeriodoAse(oc.horaEntrada, oc.horaSaida) || null,
  ].filter(Boolean);

  return partes.join(' · ');
}
