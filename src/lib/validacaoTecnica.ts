/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Central de Compras — chamado de Validação Técnica de item.
 *
 * O comprador pede ao gestor da área que valide um item (modelo, similar,
 * especificação) mandando descrição, links, fotos e ficha técnica. Ao abrir,
 * o status do item vai para "Validação Técnica"; ao decidir (Solicitações ›
 * Aprovações › Validação técnica), volta ao comprador com a tag Aprovado ou
 * Reprovado. Regras puras aqui; I/O em `validacaoTecnicaApi.ts`; banco em
 * `supabase/migrations/20261027200000_sup_validacao_tecnica.sql`.
 */

export const STATUS_ITEM_VALIDACAO = 'Validação Técnica';

export type StatusValidacao = 'PENDENTE' | 'APROVADA' | 'REPROVADA';

export interface AnexoValidacao {
  path: string;
  nome: string;
  tipo: string;
}

export interface UsuarioMarcado {
  id: string;
  nome: string;
}

/** Passagem do chamado de uma área para outra (RPC `sup_validacao_tecnica_redirecionar`). */
export interface RedirecionamentoValidacao {
  de_setor_id: string;
  de_setor_nome: string | null;
  para_setor_id: string;
  para_setor_nome: string | null;
  para: UsuarioMarcado[];
  motivo: string | null;
  por: string;
  por_nome: string | null;
  em: string;
}

export interface ValidacaoTecnica {
  id: string;
  codigo: string | null;
  data_registro: string;
  ri: string;
  rm: string | null;
  item_reqc: string | null;
  material_code: string | null;
  texto_breve: string | null;
  qtd: number | null;
  unidade: string | null;
  setor_id: string;
  setor_nome: string | null;
  descricao: string;
  links: string[];
  anexos: AnexoValidacao[];
  marcados: UsuarioMarcado[];
  marcados_ids: string[];
  redirecionamentos: RedirecionamentoValidacao[];
  /** Quem já redirecionou o chamado: continua vendo, sem decidir. */
  redirecionado_por_ids: string[];
  status: StatusValidacao;
  parecer: string | null;
  decidido_por: string | null;
  decidido_por_nome: string | null;
  decidido_em: string | null;
  criado_por: string;
  criado_por_nome: string | null;
  created_at: string;
}

export const ROTULO_STATUS_VALIDACAO: Record<StatusValidacao, string> = {
  PENDENTE: 'Em validação',
  APROVADA: 'Aprovado',
  REPROVADA: 'Reprovado',
};

/** Máximo de arquivos (fotos + PDFs) por chamado. */
export const MAX_ANEXOS_VALIDACAO = 6;

/**
 * Links digitados um por linha (ou separados por espaço). Sem protocolo vira
 * https; o que não for endereço é descartado; repetido entra uma vez.
 */
export function interpretarLinks(texto: string): string[] {
  const vistos = new Set<string>();
  for (const parte of (texto ?? '').split(/\s+/)) {
    const bruto = parte.trim();
    if (!bruto) continue;
    const comProtocolo = /^https?:\/\//i.test(bruto) ? bruto : `https://${bruto}`;
    try {
      const url = new URL(comProtocolo);
      if (!url.hostname.includes('.')) continue;
      vistos.add(url.toString());
    } catch {
      /* não é link */
    }
  }
  return Array.from(vistos);
}

/**
 * Quem decide: admin, aprovador do setor do chamado (`aprovador_setores`) ou
 * usuário marcado. Mesma regra da RPC `sup_validacao_tecnica_decidir`.
 */
export function podeDecidirValidacao(
  v: Pick<ValidacaoTecnica, 'setor_id' | 'marcados_ids'>,
  user: { id: string; roles: string[]; aprovador_setores?: string[] },
): boolean {
  if (user.roles.includes('admin')) return true;
  if (user.aprovador_setores?.includes(v.setor_id)) return true;
  return v.marcados_ids.includes(user.id);
}

/** Aparece em Aprovações: quem decide e quem já redirecionou (só leitura). */
export function podeVerValidacao(
  v: Pick<ValidacaoTecnica, 'setor_id' | 'marcados_ids' | 'redirecionado_por_ids'>,
  user: { id: string; roles: string[]; aprovador_setores?: string[] },
): boolean {
  return podeDecidirValidacao(v, user) || (v.redirecionado_por_ids ?? []).includes(user.id);
}

/** Chamado mais recente de cada item (ri) — é ele que dá a tag na Central. */
export function ultimaValidacaoPorRi(lista: ValidacaoTecnica[]): Map<string, ValidacaoTecnica> {
  const porRi = new Map<string, ValidacaoTecnica>();
  for (const v of lista) {
    const atual = porRi.get(v.ri);
    if (!atual || v.created_at > atual.created_at) porRi.set(v.ri, v);
  }
  return porRi;
}
