/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Regras da Central de Solicitações — escopos, pendências, novidades e leitura.
 *
 * Antes deste arquivo o módulo tinha três telas (Minhas Solicitações, a fila
 * coletiva e Aprovações) lendo a mesma tabela `requests` com três recortes
 * escritos em lugares diferentes: um `getFilteredUserRequests` dentro da view
 * de Minhas, o `solicitacoesVisiveis` de `lib/solicitacoes.ts` e um filtro
 * inline na view de Aprovações. Divergiam entre si, e a mesma solicitação
 * aparecia em telas diferentes com rótulos diferentes.
 *
 * Aqui a pergunta que o usuário realmente faz — "o que precisa de mim, e o que
 * mudou desde que eu olhei" — vira função. As telas só desenham o resultado.
 *
 * Compatibilidade de permissão: o escopo "Todas" continua usando exatamente o
 * `solicitacoesVisiveis` antigo, gated pela mesma página `sol_todas`. Este
 * arquivo reorganiza a navegação, não afrouxa nem aperta quem vê o quê.
 */

import { Profile, Request, RequestComment, RequestStatusHistory } from '../types';
import { localDb } from '../db/localDb';
import { canAccessPage } from './pages';
import { estaEmAberto, solicitacoesVisiveis } from './solicitacoes';

/* Escopos ----------------------------------------------------------------- */

export type Escopo = 'acao' | 'minhas' | 'setor' | 'todas';

export interface EscopoDef {
  id: Escopo;
  label: string;
  /** Frase do cabeçalho — diz de quem é a lista, para o escopo nunca ser ambíguo. */
  descricao: string;
}

const ESCOPOS: Record<Escopo, EscopoDef> = {
  acao: {
    id: 'acao',
    label: 'Precisa de mim',
    descricao: 'Solicitações paradas esperando uma ação sua.',
  },
  minhas: {
    id: 'minhas',
    label: 'Minhas',
    descricao: 'Tudo que você abriu, do rascunho à conclusão.',
  },
  setor: {
    id: 'setor',
    label: 'Do meu setor',
    descricao: 'Solicitações abertas por pessoas dos setores que você acompanha.',
  },
  todas: {
    id: 'todas',
    label: 'Todas',
    descricao: 'Fila coletiva — tudo que você tem permissão de acompanhar.',
  },
};

/** Quem aprova compras de um setor: a lista do admin, ou os papéis que aprovam tudo. */
export function ehAprovador(user: Profile): boolean {
  return (
    (user.aprovador_setores?.length ?? 0) > 0 ||
    user.roles.includes('admin') ||
    user.roles.includes('coordenador_suprimentos')
  );
}

/**
 * Setores que a aba "Do meu setor" cobre: os que o usuário aprova, mais o
 * próprio, quando ele responde por um setor (gestor ou admin).
 *
 * O admin entra aqui pelo próprio setor, e não com um curinga: "Do meu setor"
 * mostrando o sistema inteiro seria a aba "Todas" com outro nome.
 */
export function setoresAcompanhados(user: Profile): string[] {
  const ids = new Set<string>(user.aprovador_setores || []);
  const respondePorSetor = user.roles.includes('gestor') || user.roles.includes('admin');
  if (respondePorSetor && user.sector_id) ids.add(user.sector_id);
  return Array.from(ids);
}

/**
 * Abas visíveis para este usuário.
 *
 * "Precisa de mim" existe sempre — é derivada das demais e não faz sentido
 * esconder de ninguém o que está esperando por ele. As outras três respeitam
 * as mesmas permissões (`sol_minhas`, `sol_todas`) e papéis que governavam as
 * telas separadas.
 */
export function escoposDisponiveis(user: Profile): EscopoDef[] {
  const lista: EscopoDef[] = [ESCOPOS.acao];
  if (canAccessPage(user, 'sol_minhas')) lista.push(ESCOPOS.minhas);
  if (setoresAcompanhados(user).length > 0) lista.push(ESCOPOS.setor);
  if (canAccessPage(user, 'sol_todas')) lista.push(ESCOPOS.todas);
  return lista;
}

export const escopoPadrao = (user: Profile): Escopo => escoposDisponiveis(user)[0].id;

/* Visibilidade ------------------------------------------------------------ */

export function podeAprovar(r: Request, user: Profile): boolean {
  if (r.type !== 'compra') return false;
  return (
    user.roles.includes('admin') ||
    user.roles.includes('coordenador_suprimentos') ||
    !!user.aprovador_setores?.includes(r.solicitante_sector_id)
  );
}

/** Quem opera a fila daquele tipo de solicitação — quem a atende, não quem a abriu. */
export function ehOperador(r: Request, user: Profile): boolean {
  if (user.roles.includes('admin')) return true;

  if (r.type === 'compra') {
    return (
      user.roles.includes('coordenador_suprimentos') ||
      (user.roles.includes('comprador') && (!r.comprador_id || r.comprador_id === user.id))
    );
  }

  if (r.type === 'cadastro_sap') {
    return (
      canAccessPage(user, 'sup_cadastros_sap') ||
      !!user.aprovador_cadastro_sap ||
      user.roles.includes('coordenador_suprimentos')
    );
  }

  // Chamado:
  if (r.type === 'chamado') {
    const isSuprimentos = r.target_sector_id === '5' || r.category_id?.toLowerCase().includes('pendência') || r.category_id?.toLowerCase().includes('processamento');
    if (isSuprimentos) {
      return (
        user.roles.includes('comprador') ||
        user.roles.includes('coordenador_suprimentos') ||
        canAccessPage(user, 'sup_pendencias')
      );
    }

    // Atendente do setor de destino (TI, Facilities, etc.). Sem destino definido, qualquer
    // atendente pode assumir na fila do Helpdesk.
    return (
      user.roles.includes('atendente') &&
      (!r.target_sector_id || r.target_sector_id === user.sector_id)
    );
  }

  return false;
}

/**
 * Recorte pessoal: o que envolve o usuário diretamente. É a base das abas
 * "Precisa de mim", "Minhas" e "Do meu setor" — a aba "Todas" usa o recorte
 * histórico de `solicitacoes.ts`, para não mexer em permissão.
 *
 * Rascunho é sempre privado: metade de um formulário não é informação para
 * mais ninguém, nem para o gestor do setor.
 */
export function podeVer(r: Request, user: Profile): boolean {
  if (r.status === 'rascunho') return r.solicitante_id === user.id;
  if (r.solicitante_id === user.id) return true;
  if (user.roles.includes('admin')) return true;
  if (podeAprovar(r, user)) return true;
  if (setoresAcompanhados(user).includes(r.solicitante_sector_id)) return true;
  return ehOperador(r, user);
}

/** Universo de solicitações que este usuário pode abrir em qualquer aba. */
export function universoVisivel(todas: Request[], user: Profile): Request[] {
  const pessoais = todas.filter(r => podeVer(r, user));
  if (!canAccessPage(user, 'sol_todas')) return pessoais;

  const daFila = solicitacoesVisiveis(todas, user).filter(r => r.status !== 'rascunho');
  const porId = new Map(pessoais.map(r => [r.id, r]));
  daFila.forEach(r => porId.set(r.id, r));
  return Array.from(porId.values());
}

/** Filtra o universo pelo escopo escolhido. */
export function filtrarPorEscopo(
  universo: Request[],
  user: Profile,
  escopo: Escopo,
  pendencias: Map<string, Pendencia>,
): Request[] {
  switch (escopo) {
    case 'acao':
      return universo.filter(r => pendencias.has(r.id));
    case 'minhas':
      return universo.filter(r => r.solicitante_id === user.id);
    case 'setor': {
      const setores = setoresAcompanhados(user);
      return universo.filter(r =>
        r.status !== 'rascunho' && setores.includes(r.solicitante_sector_id),
      );
    }
    case 'todas':
      return universo.filter(r => r.status !== 'rascunho');
  }
}

/* Pendências — "o que precisa de mim" ------------------------------------- */

export interface Pendencia {
  /** Texto curto e imperativo: o que a pessoa tem de fazer. */
  rotulo: string;
  /** Quem a solicitação está esperando. Define a cor do selo. */
  papel: 'aprovador' | 'solicitante' | 'operador';
  /** Menor primeiro. Aprovação trava a fila inteira, então vem antes de tudo. */
  ordem: number;
}

/** Índice leve dos últimos comentários por solicitação, montado numa varredura só. */
export interface ContextoConversa {
  /** Último comentário (público ou interno) de cada solicitação. */
  ultimo: Map<string, RequestComment>;
  /** Último comentário público — o que o solicitante enxerga. */
  ultimoPublico: Map<string, RequestComment>;
}

export function indexarConversas(comentarios: RequestComment[]): ContextoConversa {
  const ultimo = new Map<string, RequestComment>();
  const ultimoPublico = new Map<string, RequestComment>();

  for (const c of comentarios) {
    const atual = ultimo.get(c.request_id);
    if (!atual || c.created_at > atual.created_at) ultimo.set(c.request_id, c);

    if (!c.is_internal) {
      const atualPub = ultimoPublico.get(c.request_id);
      if (!atualPub || c.created_at > atualPub.created_at) ultimoPublico.set(c.request_id, c);
    }
  }

  return { ultimo, ultimoPublico };
}

const AGUARDA_TRIAGEM_SAP = ['pendente', 'aberto', 'reaberto'];

/**
 * O que esta solicitação espera deste usuário — `null` quando ela não depende
 * dele agora.
 *
 * Só entra aqui o que é ação, não o que é aviso: um comentário novo do
 * atendente é novidade (ver `temNovidade`), mas vira pendência apenas quando o
 * status diz explicitamente que a bola está com o solicitante.
 */
export function pendencia(r: Request, user: Profile, ctx: ContextoConversa): Pendencia | null {
  if (!estaEmAberto(r) && !(r.type === 'chamado' && (r.status === 'resolvido' || r.status === 'fechado'))) {
    return null;
  }

  if (r.type === 'compra' && r.status === 'pendente' && podeAprovar(r, user)) {
    return { rotulo: 'Aprovar ou devolver', papel: 'aprovador', ordem: 0 };
  }

  const souSolicitante = r.solicitante_id === user.id;

  if (souSolicitante) {
    if (r.status === 'em_revisao') {
      return { rotulo: 'Ajustar e reenviar', papel: 'solicitante', ordem: 1 };
    }
    if (r.status === 'aguardando_solicitante') {
      return { rotulo: 'Responder ao atendente', papel: 'solicitante', ordem: 1 };
    }
    if (r.type === 'chamado' && (r.status === 'resolvido' || r.status === 'fechado') && !r.rating) {
      return { rotulo: 'Avaliar o atendimento', papel: 'solicitante', ordem: 3 };
    }
  }

  if (!ehOperador(r, user)) return null;

  if (r.type === 'chamado') {
    if (r.status === 'aberto' || r.status === 'reaberto') {
      return { rotulo: 'Assumir o chamado', papel: 'operador', ordem: 1 };
    }
    // Bola com o atendente: o solicitante falou por último e ninguém respondeu.
    const ultimo = ctx.ultimoPublico.get(r.id);
    if (r.status === 'em_atendimento' && ultimo && ultimo.user_id === r.solicitante_id) {
      return { rotulo: 'Responder o solicitante', papel: 'operador', ordem: 2 };
    }
    return null;
  }

  if (r.type === 'cadastro_sap' && AGUARDA_TRIAGEM_SAP.includes(r.status)) {
    return { rotulo: 'Triar o cadastro', papel: 'operador', ordem: 1 };
  }

  if (r.type === 'compra' && r.status === 'aprovada' && !r.comprador_id) {
    return { rotulo: 'Assumir a compra', papel: 'operador', ordem: 1 };
  }

  return null;
}

export function indexarPendencias(
  requests: Request[],
  user: Profile,
  ctx: ContextoConversa,
): Map<string, Pendencia> {
  const mapa = new Map<string, Pendencia>();
  for (const r of requests) {
    const p = pendencia(r, user, ctx);
    if (p) mapa.set(r.id, p);
  }
  return mapa;
}

/* Leitura e novidades ----------------------------------------------------- */

export interface EstadoLeitura {
  /**
   * Instante em que este usuário passou a ter marcação de leitura. Tudo
   * anterior conta como já lido — sem esse marco, o primeiro acesso mostraria
   * anos de histórico como "novidade" e o recurso nasceria sem credibilidade.
   */
  marco_zero: string;
  /** Quando cada solicitação foi aberta pela última vez. */
  por_solicitacao: Record<string, string>;
  /** Última vez que a Central foi aberta — base do resumo de login. */
  ultima_visita: string | null;
}

const chaveLeitura = (userId: string) => `sisten_sol_leitura_${userId}`;

export function lerEstadoLeitura(userId: string): EstadoLeitura {
  const vazio: EstadoLeitura = { marco_zero: '', por_solicitacao: {}, ultima_visita: null };
  const guardado = localDb.getStorageItem<EstadoLeitura | null>(chaveLeitura(userId), null);
  if (guardado?.marco_zero) return guardado;

  const inicial: EstadoLeitura = { ...vazio, marco_zero: new Date().toISOString() };
  localDb.setStorageItem(chaveLeitura(userId), inicial);
  return inicial;
}

function gravarEstadoLeitura(userId: string, estado: EstadoLeitura): void {
  localDb.setStorageItem(chaveLeitura(userId), estado);
}

/** Registra que o usuário abriu esta solicitação agora. */
export function marcarLida(userId: string, requestId: string): EstadoLeitura {
  const estado = lerEstadoLeitura(userId);
  const proximo: EstadoLeitura = {
    ...estado,
    por_solicitacao: { ...estado.por_solicitacao, [requestId]: new Date().toISOString() },
  };
  gravarEstadoLeitura(userId, proximo);
  return proximo;
}

/** Marca todas as solicitações da lista como vistas — o "limpar novidades". */
export function marcarTodasLidas(userId: string, requestIds: string[]): EstadoLeitura {
  const estado = lerEstadoLeitura(userId);
  const agora = new Date().toISOString();
  const proximo: EstadoLeitura = {
    ...estado,
    por_solicitacao: {
      ...estado.por_solicitacao,
      ...Object.fromEntries(requestIds.map(id => [id, agora])),
    },
  };
  gravarEstadoLeitura(userId, proximo);
  return proximo;
}

/** Carimba a visita à Central. O resumo de login compara contra este instante. */
export function registrarVisita(userId: string): EstadoLeitura {
  const estado = lerEstadoLeitura(userId);
  const proximo: EstadoLeitura = { ...estado, ultima_visita: new Date().toISOString() };
  gravarEstadoLeitura(userId, proximo);
  return proximo;
}

export const lidaAte = (estado: EstadoLeitura, requestId: string): string =>
  estado.por_solicitacao[requestId] || estado.marco_zero;

export interface Novidade {
  em: string;
  texto: string;
  autor: string;
}

/** Índice do último evento relevante por solicitação, montado numa varredura só. */
export interface ContextoEventos {
  conversa: ContextoConversa;
  ultimaMudanca: Map<string, RequestStatusHistory>;
}

export function indexarEventos(
  comentarios: RequestComment[],
  historico: RequestStatusHistory[],
): ContextoEventos {
  const ultimaMudanca = new Map<string, RequestStatusHistory>();
  for (const h of historico) {
    const atual = ultimaMudanca.get(h.request_id);
    if (!atual || h.created_at > atual.created_at) ultimaMudanca.set(h.request_id, h);
  }
  return { conversa: indexarConversas(comentarios), ultimaMudanca };
}

/**
 * O que mudou nesta solicitação desde a última vez que o usuário a abriu.
 *
 * Evento do próprio usuário nunca é novidade para ele — quem acabou de
 * comentar não precisa ser avisado do próprio comentário.
 */
export function novidade(
  r: Request,
  user: Profile,
  estado: EstadoLeitura,
  ctx: ContextoEventos,
  rotuloDeStatus: (r: Request) => string,
): Novidade | null {
  const desde = lidaAte(estado, r.id);

  const candidatos: Novidade[] = [];

  const comentario = ctx.conversa.ultimo.get(r.id);
  const comentarioVisivel = comentario && (!comentario.is_internal || podeVerNotaInterna(user));
  if (comentario && comentarioVisivel && comentario.user_id !== user.id && comentario.created_at > desde) {
    candidatos.push({
      em: comentario.created_at,
      texto: comentario.is_internal ? 'Nova nota interna' : 'Nova mensagem',
      autor: comentario.user_name || 'Alguém',
    });
  }

  const mudanca = ctx.ultimaMudanca.get(r.id);
  if (mudanca && mudanca.user_id !== user.id && mudanca.created_at > desde) {
    candidatos.push({
      em: mudanca.created_at,
      texto: `Status mudou para ${rotuloDeStatus({ ...r, status: mudanca.to_status })}`,
      autor: mudanca.user_name || 'Sistema',
    });
  }

  if (candidatos.length === 0) return null;
  return candidatos.sort((a, b) => (a.em > b.em ? -1 : 1))[0];
}

const PAPEIS_NOTA_INTERNA = ['comprador', 'coordenador_suprimentos', 'atendente', 'admin'];

export const podeVerNotaInterna = (user: Profile): boolean =>
  user.roles.some(r => PAPEIS_NOTA_INTERNA.includes(r));

/* Faixas da lista --------------------------------------------------------- */

export type Faixa = 'acao' | 'novidades' | 'andamento' | 'concluidas';

export interface FaixaDef {
  id: Faixa;
  titulo: string;
  /** Legenda do grupo vazio — explica por que a faixa existe. */
  vazio: string;
}

export const FAIXAS: FaixaDef[] = [
  { id: 'acao', titulo: 'Aguardando você', vazio: 'Nada esperando uma ação sua.' },
  { id: 'novidades', titulo: 'Novidades desde a sua última visita', vazio: 'Nenhuma mudança nova.' },
  { id: 'andamento', titulo: 'Em andamento', vazio: 'Nada em andamento por aqui.' },
  { id: 'concluidas', titulo: 'Concluídas', vazio: 'Nenhuma solicitação concluída neste recorte.' },
];

export function faixaDe(
  r: Request,
  temPendencia: boolean,
  temNovidade: boolean,
): Faixa {
  if (temPendencia) return 'acao';
  if (temNovidade) return 'novidades';
  // Rascunho não está "em aberto" para efeito de fila (`estaEmAberto` o exclui
  // junto com cancelada e rejeitada), mas também não está concluído: é uma
  // solicitação que a pessoa ainda vai terminar. Vai para "Em andamento".
  return estaEmAberto(r) || r.status === 'rascunho' ? 'andamento' : 'concluidas';
}

/* Resumo de login --------------------------------------------------------- */

export interface ItemResumo {
  request: Request;
  pendencia: Pendencia | null;
  novidade: Novidade | null;
}

export interface ResumoUsuario {
  pendentes: ItemResumo[];
  novidades: ItemResumo[];
  naoLidas: number;
  desde: string | null;
}

export const resumoTemConteudo = (r: ResumoUsuario): boolean =>
  r.pendentes.length > 0 || r.novidades.length > 0;

/**
 * Monta o resumo que o modal de login mostra.
 *
 * Recebe tudo pronto em vez de ler do banco para poder ser testado sem
 * IndexedDB e para a Central reaproveitar os mesmos índices que já montou.
 */
export function montarResumo(
  universo: Request[],
  user: Profile,
  estado: EstadoLeitura,
  ctx: ContextoEventos,
  naoLidas: number,
  rotuloDeStatus: (r: Request) => string,
): ResumoUsuario {
  const pendentes: ItemResumo[] = [];
  const novidades: ItemResumo[] = [];

  for (const r of universo) {
    const p = pendencia(r, user, ctx.conversa);
    const n = novidade(r, user, estado, ctx, rotuloDeStatus);

    if (p) pendentes.push({ request: r, pendencia: p, novidade: n });
    else if (n) novidades.push({ request: r, pendencia: null, novidade: n });
  }

  pendentes.sort((a, b) =>
    (a.pendencia!.ordem - b.pendencia!.ordem) ||
    (b.request.criticality - a.request.criticality) ||
    (a.request.created_at < b.request.created_at ? -1 : 1),
  );
  novidades.sort((a, b) => (a.novidade!.em > b.novidade!.em ? -1 : 1));

  return { pendentes, novidades, naoLidas, desde: estado.ultima_visita };
}

/* Ordenação da lista ------------------------------------------------------ */

/**
 * Mais crítica primeiro; empatando, a mais antiga — quem espera há mais tempo
 * aparece antes. Mesma regra que a fila coletiva já usava.
 */
export function ordenarFila(lista: Request[]): Request[] {
  return [...lista].sort(
    (a, b) =>
      b.criticality - a.criticality ||
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
}

/** Concluídas se ordenam pela conclusão mais recente, não pela criticidade. */
export function ordenarPorRecencia(lista: Request[]): Request[] {
  return [...lista].sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
  );
}
