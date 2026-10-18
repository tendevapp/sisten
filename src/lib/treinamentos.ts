/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * GERAL › Treinamentos — regras puras das trilhas (sem rede).
 *
 * Uma trilha é uma página HTML interativa que roda num iframe sandbox. A
 * conversa com o SISTEN é só por postMessage:
 *
 *   trilha → SISTEN  { origem: 'trilha-…', evento: 'pronta' }
 *                    { origem: 'trilha-…', evento: 'missao-concluida', missao, xpMissao, estrelas, … }
 *                    { origem: 'trilha-…', evento: 'trilha-concluida', xpTotal }
 *   SISTEN → trilha  { destino: 'trilha', evento: 'carregar-progresso', nome, tema, progresso: { best, stars, done } }
 *
 * Trilha nova só precisa falar esse protocolo (ver
 * public/treinamentos/trilha-po-sup-0004.html, fim do script).
 */

export interface TrilhaTreinamento {
  id: string;
  setor_id: string;
  codigo: string;
  titulo: string;
  descricao: string | null;
  revisao: string | null;
  total_missoes: number;
  duracao_min: number | null;
  arquivo_origem: 'app' | 'storage';
  arquivo_path: string;
  ordem: number;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProgressoMissao {
  trilha_id: string;
  missao: number;
  titulo_missao: string | null;
  insignia: string | null;
  xp: number;
  estrelas: number;
  acertos: number | null;
  perguntas: number | null;
  erros_jogo: number | null;
  tentativas: number;
  concluida_em: string;
  atualizado_em: string;
}

export type StatusTrilha = 'nao_iniciada' | 'em_andamento' | 'concluida';

export interface ResumoTrilha {
  missoesConcluidas: number;
  total: number;
  /** 0 a 100, inteiro. */
  percentual: number;
  xp: number;
  estrelas: number;
  status: StatusTrilha;
  /** Quando a última missão que faltava foi concluída (só se concluída). */
  concluidaEm: string | null;
  ultimaAtividade: string | null;
}

/** Resumo do usuário numa trilha. Missões fora de 1..total (trilha encolheu) não contam. */
export function resumirProgresso(
  trilha: Pick<TrilhaTreinamento, 'id' | 'total_missoes'>,
  linhas: ProgressoMissao[],
): ResumoTrilha {
  const total = Math.max(1, trilha.total_missoes);
  const validas = linhas.filter(l => l.trilha_id === trilha.id && l.missao >= 1 && l.missao <= total);
  const missoesConcluidas = new Set(validas.map(l => l.missao)).size;
  const xp = validas.reduce((s, l) => s + (l.xp || 0), 0);
  const estrelas = validas.reduce((s, l) => s + (l.estrelas || 0), 0);
  const maior = (campo: 'concluida_em' | 'atualizado_em') =>
    validas.reduce<string | null>((m, l) => (l[campo] && (!m || l[campo] > m) ? l[campo] : m), null);
  const status: StatusTrilha =
    missoesConcluidas >= total ? 'concluida' : missoesConcluidas > 0 ? 'em_andamento' : 'nao_iniciada';
  return {
    missoesConcluidas,
    total,
    percentual: Math.round((missoesConcluidas / total) * 100),
    xp,
    estrelas,
    status,
    concluidaEm: status === 'concluida' ? maior('concluida_em') : null,
    ultimaAtividade: maior('atualizado_em'),
  };
}

export const STATUS_TRILHA_ROTULO: Record<StatusTrilha, string> = {
  nao_iniciada: 'Não iniciada',
  em_andamento: 'Em andamento',
  concluida: 'Concluída',
};

/** Progresso no formato que a trilha guarda (best = XP, stars, done por nº da missão). */
export interface ProgressoParaTrilha {
  best: Record<string, number>;
  stars: Record<string, number>;
  done: Record<string, boolean>;
}

export function progressoParaTrilha(trilhaId: string, linhas: ProgressoMissao[]): ProgressoParaTrilha {
  const out: ProgressoParaTrilha = { best: {}, stars: {}, done: {} };
  for (const l of linhas) {
    if (l.trilha_id !== trilhaId) continue;
    const n = String(l.missao);
    out.best[n] = Math.max(out.best[n] || 0, l.xp || 0);
    out.stars[n] = Math.max(out.stars[n] || 0, l.estrelas || 0);
    out.done[n] = true;
  }
  return out;
}

export function mensagemCarregarProgresso(
  trilhaId: string,
  linhas: ProgressoMissao[],
  nome: string,
  tema: 'dark' | 'light',
) {
  return {
    destino: 'trilha' as const,
    evento: 'carregar-progresso' as const,
    nome,
    tema,
    progresso: progressoParaTrilha(trilhaId, linhas),
  };
}

export interface EventoMissaoConcluida {
  evento: 'missao-concluida';
  missao: number;
  titulo: string | null;
  insignia: string | null;
  xpMissao: number;
  estrelas: number;
  acertos: number | null;
  perguntas: number | null;
  errosJogo: number | null;
}

export type EventoTrilha =
  | { evento: 'pronta' }
  | EventoMissaoConcluida
  | { evento: 'trilha-concluida'; xpTotal: number | null };

const inteiro = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.round(n) : null;
};
const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 200) : null);

/**
 * Lê uma mensagem vinda da trilha. Devolve null para tudo que não for do
 * protocolo — o iframe roda conteúdo de terceiros, então nada passa sem forma.
 */
export function lerEventoTrilha(data: unknown): EventoTrilha | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  if (typeof d.origem !== 'string' || !d.origem.startsWith('trilha')) return null;

  switch (d.evento) {
    case 'pronta':
      return { evento: 'pronta' };
    case 'missao-concluida': {
      const missao = inteiro(d.missao);
      if (missao === null || missao < 1) return null;
      return {
        evento: 'missao-concluida',
        missao,
        titulo: texto(d.titulo),
        insignia: texto(d.insignia),
        xpMissao: Math.max(0, inteiro(d.xpMissao) ?? 0),
        estrelas: Math.min(3, Math.max(0, inteiro(d.estrelas) ?? 0)),
        acertos: inteiro(d.acertos),
        perguntas: inteiro(d.perguntas),
        errosJogo: inteiro(d.errosJogo),
      };
    }
    case 'trilha-concluida':
      return { evento: 'trilha-concluida', xpTotal: inteiro(d.xpTotal) };
    default:
      return null;
  }
}

/** Argumentos da RPC `trein_registrar_missao`. */
export function argsRegistrarMissao(trilhaId: string, ev: EventoMissaoConcluida) {
  return {
    p_trilha_id: trilhaId,
    p_missao: ev.missao,
    p_xp: ev.xpMissao,
    p_estrelas: ev.estrelas,
    p_acertos: ev.acertos,
    p_perguntas: ev.perguntas,
    p_erros_jogo: ev.errosJogo,
    p_titulo_missao: ev.titulo,
    p_insignia: ev.insignia,
  };
}

/**
 * Aplica no estado da tela uma missão recém-concluída, como o banco faria
 * (maior XP/estrelas) — a tela não espera o servidor para atualizar a barra.
 */
export function aplicarMissaoLocal(
  linhas: ProgressoMissao[],
  trilhaId: string,
  ev: EventoMissaoConcluida,
  agoraISO: string,
): ProgressoMissao[] {
  const atual = linhas.find(l => l.trilha_id === trilhaId && l.missao === ev.missao);
  if (!atual) {
    return [
      ...linhas,
      {
        trilha_id: trilhaId,
        missao: ev.missao,
        titulo_missao: ev.titulo,
        insignia: ev.insignia,
        xp: ev.xpMissao,
        estrelas: ev.estrelas,
        acertos: ev.acertos,
        perguntas: ev.perguntas,
        erros_jogo: ev.errosJogo,
        tentativas: 1,
        concluida_em: agoraISO,
        atualizado_em: agoraISO,
      },
    ];
  }
  return linhas.map(l =>
    l === atual
      ? {
          ...l,
          xp: Math.max(l.xp, ev.xpMissao),
          estrelas: Math.max(l.estrelas, ev.estrelas),
          tentativas: l.tentativas + 1,
          atualizado_em: agoraISO,
        }
      : l,
  );
}

/** Caminho no bucket para o HTML de uma trilha subida pela tela. */
export function caminhoArquivoTrilha(setorId: string, codigo: string, agora: Date): string {
  const slug = codigo
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'trilha';
  return `setor-${setorId}/${slug}-${agora.getTime()}.html`;
}
