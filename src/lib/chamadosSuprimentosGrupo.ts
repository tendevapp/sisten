/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Chamados ao Suprimentos ("Pendência de Processamento" e "Ajuste de Pedido")
 * abertos pela área financeira — Financeiro, Contabilidade, Controladoria e
 * Fiscal. A pendência é da área, não de quem colou a planilha: um colega de
 * qualquer desses setores altera e reabre o chamado aberto por outro.
 *
 * Espelha a política `requests_update_grupo_fiscal` de core_solicitacoes
 * (migration 20261028230000). O setor Fiscal ainda não existe — entra pelo
 * nome quando for criado, aqui e no banco.
 *
 * Editar mexe só nas linhas que o Suprimentos ainda não baixou: a baixada já
 * foi processada, e mudar o dado por baixo dela deixaria a resolução falando
 * de outra nota. Para corrigir uma baixada, reabre primeiro.
 */

import type { Profile, Request, RequestStatus, Sector, SupPendenciaProcessamentoNF } from '../types';
import { SETORES_FINANCEIRO_IDS } from './pages';
import {
  isChamadoSuprimentosPendencia, parsearValorBRL, type MetaPendencia, type ModeloPendencia,
} from './supPendenciasProcessamento';

const semAcento = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

/** Financeiro (6), Contabilidade (7), Controladoria (18) ou qualquer setor "Fiscal". */
export function ehSetorGrupoFiscal(
  sectorId: string | null | undefined,
  sectors: Pick<Sector, 'id' | 'name'>[],
): boolean {
  if (!sectorId) return false;
  if (SETORES_FINANCEIRO_IDS.includes(sectorId)) return true;
  const nome = sectors.find(s => s.id === sectorId)?.name || '';
  return semAcento(nome).includes('fiscal');
}

/** Status em que o chamado já se encerrou — é o que "Reabrir" desfaz. */
const FECHADOS: RequestStatus[] = ['resolvido', 'fechado'];
const SEM_EDICAO: RequestStatus[] = [...FECHADOS, 'cancelada', 'rascunho'];

/**
 * Chamado ao Suprimentos aberto por um colega da área financeira — o usuário
 * vê (aba "Do meu setor"), edita e reabre, mesmo sem ser o solicitante.
 */
export function ehChamadoDoGrupoFiscal(
  r: Pick<Request, 'type' | 'category_id' | 'solicitante_sector_id'>,
  user: Pick<Profile, 'sector_id'>,
  sectors: Pick<Sector, 'id' | 'name'>[],
): boolean {
  return isChamadoSuprimentosPendencia(r)
    && ehSetorGrupoFiscal(user.sector_id, sectors)
    && ehSetorGrupoFiscal(r.solicitante_sector_id, sectors);
}

function podeMexer(r: Request, user: Profile, sectors: Pick<Sector, 'id' | 'name'>[]): boolean {
  if (!isChamadoSuprimentosPendencia(r)) return false;
  if (user.roles.includes('admin')) return true;
  if (r.solicitante_id === user.id) return true;
  return ehChamadoDoGrupoFiscal(r, user, sectors);
}

export function podeEditarChamadoSuprimentos(r: Request, user: Profile, sectors: Pick<Sector, 'id' | 'name'>[]): boolean {
  return podeMexer(r, user, sectors) && !SEM_EDICAO.includes(r.status);
}

export function podeReabrirChamadoSuprimentos(r: Request, user: Profile, sectors: Pick<Sector, 'id' | 'name'>[]): boolean {
  return podeMexer(r, user, sectors) && FECHADOS.includes(r.status);
}

/* Campos editáveis por modelo ------------------------------------------------ */

export type CampoLinhaEditavel =
  | 'numero_nfse' | 'nfse_cancelada' | 'data_emissao_nfse' | 'fornecedor' | 'nome_fornecedor'
  | 'observacao' | 'valor_nfse_raw' | 'mes_competencia' | 'documento_status' | 'serie'
  | 'uf_emissor' | 'chegou' | 'documento_compras' | 'comprador' | 'data_envio';

export interface DefCampoLinha {
  campo: CampoLinhaEditavel;
  rotulo: string;
  /** Texto longo (observação/demanda) — vira textarea na tela. */
  longo?: boolean;
}

/** Na mesma ordem e com os mesmos rótulos da planilha que originou o chamado. */
export const CAMPOS_EDITAVEIS: Record<ModeloPendencia, DefCampoLinha[]> = {
  nfse: [
    { campo: 'numero_nfse', rotulo: 'Número da NFS-e' },
    { campo: 'nfse_cancelada', rotulo: 'NFS-e Cancelada' },
    { campo: 'data_emissao_nfse', rotulo: 'Data Emissão NFS-e' },
    { campo: 'fornecedor', rotulo: 'Fornecedor' },
    { campo: 'nome_fornecedor', rotulo: 'Nome Fornecedor' },
    { campo: 'valor_nfse_raw', rotulo: 'Valor da NFS-e' },
    { campo: 'mes_competencia', rotulo: 'Mês de Competência' },
    { campo: 'observacao', rotulo: 'Observação', longo: true },
  ],
  documento: [
    { campo: 'documento_status', rotulo: 'Status' },
    { campo: 'numero_nfse', rotulo: 'Documento' },
    { campo: 'data_emissao_nfse', rotulo: 'Data da Emissão' },
    { campo: 'serie', rotulo: 'Série' },
    { campo: 'uf_emissor', rotulo: 'UF emissor' },
    { campo: 'chegou', rotulo: 'Chegou?' },
    { campo: 'nome_fornecedor', rotulo: 'Nome do Fornecedor' },
    { campo: 'documento_compras', rotulo: 'Documento de compras' },
    { campo: 'comprador', rotulo: 'Comprador' },
    { campo: 'data_envio', rotulo: 'Data envio' },
    { campo: 'observacao', rotulo: 'Observações', longo: true },
  ],
  ajuste_pedido: [
    { campo: 'numero_nfse', rotulo: 'Número da NF' },
    { campo: 'documento_compras', rotulo: 'Número do Pedido' },
    { campo: 'nome_fornecedor', rotulo: 'Fornecedor' },
    { campo: 'comprador', rotulo: 'Comprador' },
    { campo: 'observacao', rotulo: 'Demanda', longo: true },
  ],
};

export type ValoresLinha = Partial<Record<CampoLinhaEditavel, string>>;

/** Valores atuais da linha, como texto, para preencher o formulário. */
export function valoresDaLinha(l: SupPendenciaProcessamentoNF): ValoresLinha {
  const out: ValoresLinha = {};
  for (const { campo } of CAMPOS_EDITAVEIS[l.modelo || 'nfse']) {
    const v = campo === 'valor_nfse_raw'
      ? (l.valor_nfse_raw ?? (l.valor_nfse != null ? String(l.valor_nfse).replace('.', ',') : ''))
      : l[campo];
    out[campo] = v == null ? '' : String(v);
  }
  return out;
}

/** "Rótulo: antes → depois", só dos campos que mudaram. */
export function descreverAlteracoesLinha(
  modelo: ModeloPendencia,
  antes: ValoresLinha,
  depois: ValoresLinha,
): string[] {
  const vazio = (s?: string) => (s && s.trim() ? s.trim() : '(vazio)');
  return CAMPOS_EDITAVEIS[modelo]
    .filter(({ campo }) => (antes[campo] || '').trim() !== (depois[campo] || '').trim())
    .map(({ campo, rotulo }) => `${rotulo}: ${vazio(antes[campo])} → ${vazio(depois[campo])}`);
}

/**
 * Colunas a gravar a partir do formulário. Texto vazio vira null, como na
 * criação; o valor da NFS-e guarda o texto e o número convertido.
 */
export function camposParaGravar(modelo: ModeloPendencia, valores: ValoresLinha): Record<string, string | number | null> {
  const out: Record<string, string | number | null> = {};
  for (const { campo } of CAMPOS_EDITAVEIS[modelo]) {
    const v = (valores[campo] || '').trim();
    // numero_nfse é NOT NULL no banco.
    out[campo] = v || (campo === 'numero_nfse' ? '' : null);
    if (campo === 'valor_nfse_raw') out.valor_nfse = v ? parsearValorBRL(v) : null;
  }
  return out;
}

/** Classificação/observação do chamado, repetida em todas as linhas. */
export function metaDasLinhas(l?: SupPendenciaProcessamentoNF): MetaPendencia {
  return {
    observacao: l?.observacao_chamado || '',
    classif_causa: l?.classif_causa || '',
    classif_responsavel: l?.classif_responsavel || '',
    classif_impacto: l?.classif_impacto || '',
    classif_recorrencia: l?.classif_recorrencia || '',
  };
}

const ROTULOS_META: [keyof MetaPendencia, string][] = [
  ['classif_causa', 'Causa provável'],
  ['classif_responsavel', 'Área responsável'],
  ['classif_impacto', 'Impacto'],
  ['classif_recorrencia', 'Recorrência'],
  ['observacao', 'Observação do chamado'],
];

export function descreverAlteracoesMeta(antes: MetaPendencia, depois: MetaPendencia): string[] {
  const vazio = (s?: string) => (s && s.trim() ? s.trim() : '(vazio)');
  return ROTULOS_META
    .filter(([k]) => (antes[k] || '').trim() !== (depois[k] || '').trim())
    .map(([k, rotulo]) => `${rotulo}: ${vazio(antes[k])} → ${vazio(depois[k])}`);
}

/** Resumo do chamado "Ajuste de Pedido" — o mesmo texto gravado na abertura. */
export function justificativaAjustePedido(protocolo: string, nf: string, pedido: string, fornecedor: string): string {
  return `Ajuste de pedido (protocolo ${protocolo}) — NF ${nf.trim()} / Pedido ${pedido.trim()} / ${fornecedor.trim()}. Ver detalhes e imagem no chamado.`;
}
