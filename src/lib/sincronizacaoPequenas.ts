/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tabelas "pequenas" do sync do localDb (Solicitações, perfis, setores,
 * fretes, chegadas, grupos de mercadoria...): antes, todo aparelho ativo
 * baixava cada uma inteira a cada 15 min, mudasse ou não. Monitor de
 * Desempenho, 22–26/11/2026: ~3,7 GB em 4 dias só nessas leituras repetidas
 * (histórico de status 1,07 GB, solicitações 976 MB, grupos de mercadoria
 * 599 MB — tabela que quase nunca muda).
 *
 * Agora um gatilho no banco sobe a versão da tabela a cada gravação
 * (`dataset_versions`, migration 20261126150000) e a rodada de 15 min só
 * baixa o que mudou. Nunca baixa mais que antes nem mostra dado mais velho
 * que antes: sem a versão do servidor, faz como fazia.
 */

export function deveBaixarTabelaPequena(p: {
  /** É a rodada das pequenas (1º sync da sessão, forçado ou 15 min depois da última). */
  rodadaDasPequenas: boolean;
  forcar: boolean;
  temCache: boolean;
  /** Versão do último download feito neste aparelho. */
  versaoLocal: number | null;
  /** Versão atual no servidor; `null` quando não deu para ler ou a tabela não tem gatilho. */
  versaoServidor: number | null;
}): boolean {
  if (p.forcar) return true;
  if (!p.rodadaDasPequenas) return false;
  if (!p.temCache || p.versaoLocal === null) return true;
  if (p.versaoServidor === null) return true;
  return p.versaoServidor !== p.versaoLocal;
}

/**
 * Tarefa do sync → tabela cuja versão o gatilho mantém. A versão no
 * `dataset_versions` usa o nome da tabela.
 */
export const TABELA_DA_TAREFA_PEQUENA: Record<string, string> = {
  sectors: 'core_setores',
  profiles: 'core_perfis',
  buyer_groups: 'core_grupos_compradores',
  sup_compradores: 'sup_compradores',
  sup_rastreio_prioridades: 'sup_rastreio_prioridades',
  almoxarifado_chegadas: 'almoxarifado_chegadas',
  sup_fretes: 'sup_fretes',
  requests: 'core_solicitacoes',
  request_items: 'core_solicitacoes_itens',
  request_attachments: 'core_solicitacoes_anexos',
  request_comments: 'core_solicitacoes_comentarios',
  request_status_history: 'core_solicitacoes_historico_status',
  cadastro_grupo_mercadoria: 'cadastro_grupo_mercadoria',
};
