/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Regras do Monitor de Desempenho (admin): dar nome legível às consultas que
 * o PostgREST monta, transformar o retrato do banco em alertas ("4 leituras de
 * vw_x rodando há mais de 5 s") e formatar números. Puro e testado.
 */

export type NivelAlerta = 'critico' | 'atencao' | 'info';

export interface Alerta {
  nivel: NivelAlerta;
  titulo: string;
  detalhe: string;
}

export interface ProcessoBanco {
  pid: number;
  usuario: string | null;
  app: string | null;
  estado: string | null;
  espera_tipo: string | null;
  espera: string | null;
  dur_s: number | null;
  tx_s: number | null;
  bloqueado_por: number[] | null;
  consulta: string | null;
}

export interface RetratoAgora {
  em: string;
  max_conexoes: number;
  statement_timeout: string | null;
  conexoes: { usuario: string; app: string | null; estado: string; n: number }[];
  processos: ProcessoBanco[];
  banco: {
    tamanho_bytes: number;
    cache_hit: number | null;
    temp_bytes: number;
    temp_arquivos: number;
    deadlocks: number;
    commits: number;
    rollbacks: number;
    desde: string | null;
  } | null;
  ultima_amostra: string | null;
  coletor: { status: string; fim: string | null; mensagem: string | null } | null;
  online: {
    user_id: string;
    user_name: string | null;
    device_id: string;
    plataforma: string | null;
    conexao: string | null;
    pagina_atual: string | null;
    visivel: boolean;
    ultimo: string;
  }[];
}

export interface NomeConsulta {
  /** "vw_sap_requisicoes_enriquecidas" */
  alvo: string;
  /** "leitura", "função", "inclusão"… */
  tipo: string;
}

/**
 * Lê o texto que o PostgREST manda ao banco e diz o que é. O PostgREST sempre
 * qualifica com "public"."nome", o que torna o padrão estável.
 */
export function nomeConsulta(texto: string | null | undefined): NomeConsulta {
  const q = (texto || '').replace(/\s+/g, ' ').trim();
  if (!q) return { alvo: '—', tipo: '' };

  const escrita = q.match(/^(?:WITH pgrst_source AS \(\s*)?(INSERT INTO|UPDATE|DELETE FROM)\s+"?(\w+)"?\."?(\w+)"?/i);
  if (escrita) {
    const tipo = /^insert/i.test(escrita[1]) ? 'inclusão' : /^update/i.test(escrita[1]) ? 'alteração' : 'exclusão';
    return { alvo: escrita[3], tipo };
  }

  // Chamada de função: "public"."fn"( — inclusive a forma escalar do PostgREST.
  const funcao = q.match(/"public"\."(\w+)"\s*\(/i);
  if (funcao) return { alvo: funcao[1], tipo: 'função' };

  const leitura = q.match(/FROM\s+"public"\."(\w+)"/i);
  if (leitura) return { alvo: leitura[1], tipo: 'leitura' };

  const refresh = q.match(/REFRESH MATERIALIZED VIEW\s+(?:CONCURRENTLY\s+)?(?:"?public"?\.)?"?(\w+)"?/i);
  if (refresh) return { alvo: refresh[1], tipo: 'refresh' };

  const sqlCru = q.match(/^(?:select|with)\b.*?\bfrom\s+(?:"?(\w+)"?\.)?"?(\w+)"?/i);
  if (sqlCru) return { alvo: sqlCru[2], tipo: 'SQL' };

  const primeira = q.split(' ').slice(0, 3).join(' ');
  return { alvo: primeira.length > 40 ? `${primeira.slice(0, 40)}…` : primeira, tipo: 'SQL' };
}

export function rotuloConsulta(texto: string | null | undefined): string {
  const n = nomeConsulta(texto);
  return n.tipo ? `${n.alvo} (${n.tipo})` : n.alvo;
}

/** O que o aparelho chamou → nome legível. "GET vw_x" → "vw_x (leitura)". */
export function rotuloEndpoint(endpoint: string): string {
  const [metodo, ...resto] = endpoint.split(' ');
  const alvo = resto.join(' ');
  switch (metodo) {
    case 'GET':
    case 'HEAD':
      return `${alvo} (leitura)`;
    case 'POST':
      return `${alvo} (inclusão)`;
    case 'PATCH':
    case 'PUT':
      return `${alvo} (alteração)`;
    case 'DELETE':
      return `${alvo} (exclusão)`;
    case 'RPC':
      return `${alvo} (função)`;
    default:
      return endpoint;
  }
}

const LENTA_S = 5;

export function diagnosticar(r: RetratoAgora, agora: number = Date.now()): Alerta[] {
  const alertas: Alerta[] = [];
  const clientes = r.conexoes.reduce((s, c) => s + c.n, 0);
  const uso = r.max_conexoes > 0 ? clientes / r.max_conexoes : 0;
  if (uso >= 0.8) {
    alertas.push({
      nivel: uso >= 0.95 ? 'critico' : 'atencao',
      titulo: `Conexões em ${Math.round(uso * 100)}% do limite`,
      detalhe: `${clientes} de ${r.max_conexoes}. Perto do limite, novas chamadas esperam ou são recusadas.`,
    });
  }

  const bloqueados = r.processos.filter(p => (p.bloqueado_por?.length ?? 0) > 0);
  if (bloqueados.length) {
    const bloqueadores = new Set(bloqueados.flatMap(p => p.bloqueado_por ?? []));
    const quem = r.processos.filter(p => bloqueadores.has(p.pid)).map(p => `pid ${p.pid}: ${rotuloConsulta(p.consulta)}`);
    alertas.push({
      nivel: 'critico',
      titulo: `${bloqueados.length} consulta(s) esperando lock`,
      detalhe: quem.length ? `Travadas por ${quem.join('; ')}.` : `Travadas pelos pids ${[...bloqueadores].join(', ')}.`,
    });
  }

  const ociosasTx = r.processos.filter(p => (p.estado || '').startsWith('idle in transaction') && (p.tx_s ?? 0) > 60);
  if (ociosasTx.length) {
    alertas.push({
      nivel: 'atencao',
      titulo: `${ociosasTx.length} transação(ões) aberta(s) e parada(s) há mais de 1 min`,
      detalhe: 'Segura locks e impede o vacuum. Geralmente uma importação ou script que não terminou.',
    });
  }

  const lentas = r.processos.filter(p => p.estado === 'active' && (p.dur_s ?? 0) > LENTA_S);
  if (lentas.length) {
    const grupos = new Map<string, { n: number; max: number }>();
    for (const p of lentas) {
      const chave = rotuloConsulta(p.consulta);
      const g = grupos.get(chave) ?? { n: 0, max: 0 };
      g.n += 1;
      g.max = Math.max(g.max, p.dur_s ?? 0);
      grupos.set(chave, g);
    }
    const lista = [...grupos.entries()].sort((a, b) => b[1].n - a[1].n || b[1].max - a[1].max);
    const nivel: NivelAlerta = lentas.length >= 5 || lentas.some(p => (p.dur_s ?? 0) > 30) ? 'critico' : 'atencao';
    alertas.push({
      nivel,
      titulo: `${lentas.length} consulta(s) rodando há mais de ${LENTA_S} s`,
      detalhe: lista.slice(0, 4).map(([nome, g]) => `${g.n}× ${nome} (até ${formatarDuracao(g.max * 1000)})`).join(' · '),
    });
  }

  if (r.banco?.cache_hit != null && r.banco.cache_hit < 95) {
    alertas.push({
      nivel: 'atencao',
      titulo: `Cache em ${r.banco.cache_hit.toLocaleString('pt-BR')}%`,
      detalhe: 'Abaixo de 95% o banco lê do disco com frequência: falta memória ou há leituras de tabela inteira.',
    });
  }

  if (!r.ultima_amostra || agora - new Date(r.ultima_amostra).getTime() > 3 * 60_000) {
    alertas.push({
      nivel: 'atencao',
      titulo: 'Coletor de amostras parado',
      detalhe: r.coletor?.mensagem
        ? `Última execução do pg_cron: ${r.coletor.status} — ${r.coletor.mensagem}`
        : 'Sem amostra nos últimos 3 min. A linha do tempo fica com buraco até o pg_cron voltar.',
    });
  }

  const ordem: Record<NivelAlerta, number> = { critico: 0, atencao: 1, info: 2 };
  return alertas.sort((a, b) => ordem[a.nivel] - ordem[b.nivel]);
}

export function formatarBytes(bytes: number | null | undefined): string {
  const b = Number(bytes) || 0;
  if (b < 1024) return `${b} B`;
  const unidades = ['KB', 'MB', 'GB', 'TB'];
  let v = b / 1024;
  let i = 0;
  while (v >= 1024 && i < unidades.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toLocaleString('pt-BR', { maximumFractionDigits: v < 10 ? 1 : 0 })} ${unidades[i]}`;
}

export function formatarDuracao(ms: number | null | undefined): string {
  const v = Number(ms) || 0;
  if (v < 1000) return `${Math.round(v)} ms`;
  const s = v / 1000;
  if (s < 60) return `${s.toLocaleString('pt-BR', { maximumFractionDigits: s < 10 ? 1 : 0 })} s`;
  const min = s / 60;
  if (min < 60) return `${min.toLocaleString('pt-BR', { maximumFractionDigits: min < 10 ? 1 : 0 })} min`;
  const h = min / 60;
  return `${h.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h`;
}

export function formatarNumero(n: number | null | undefined): string {
  return (Number(n) || 0).toLocaleString('pt-BR');
}

/** Divide sem estourar: `null` quando o divisor é zero. */
export function razao(a: number | null | undefined, b: number | null | undefined): number | null {
  const d = Number(b) || 0;
  return d ? (Number(a) || 0) / d : null;
}
