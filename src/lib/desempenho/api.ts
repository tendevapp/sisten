/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Chamadas do Monitor de Desempenho (admin). Todas são RPCs security definer
 * que recusam quem não é admin — ver migration 20261111233000.
 */

import { supabase } from '../../db/supabaseClient';
import type { RetratoAgora } from './diagnostico';
import type { ResumoDia } from './resumoDia';

export interface ConsultaAcumulada {
  id: string;
  chamadas: number;
  total_ms: number;
  media_ms: number | null;
  max_ms: number;
  linhas: number;
  temp_blks: number;
  lidos_disco: number;
  texto: string;
}

export interface TabelaSaude {
  nome: string;
  vivas: number;
  mortas: number;
  seq_scan: number | null;
  seq_tup_read: number | null;
  idx_scan: number | null;
  ultimo_vacuum: string | null;
  ultimo_analyze: string | null;
  bytes: number;
}

export interface Estatisticas {
  desde: string | null;
  consultas: ConsultaAcumulada[];
  tabelas: TabelaSaude[];
  matviews: { nome: string; populada: boolean; bytes: number }[];
  acoes: { em: string; user_name: string | null; acao: string; pid: number | null; consulta: string | null }[];
}

export interface BaldeLinhaTempo {
  balde: string;
  amostras: number;
  conexoes: number;
  max_conexoes: number;
  ativas_max: number;
  ativas_media: number;
  lentas_5s: number;
  lentas_30s: number;
  mais_longa_s: number;
  esperando_lock: number;
  ociosas_tx: number;
  db_tempo_ms: number | null;
  chamadas: number | null;
  temp_bytes: number | null;
  blks_read: number | null;
  blks_hit: number | null;
  segundos: number | null;
}

export interface Janela {
  amostras: number;
  db_tempo_ms: number | null;
  segundos: number | null;
  consultas: { id: string; chamadas: number; ms: number; temp_blks: number; minutos: number; ultima: string; texto: string | null }[];
  em_execucao: {
    pid: number;
    s: number;
    visto_em: string;
    amostras: number;
    espera: string | null;
    bloqueios: number | null;
    usuario: string | null;
    consulta: string;
  }[];
}

export interface Aparelhos {
  usuarios: {
    user_id: string;
    user_name: string | null;
    aparelhos: number;
    plataformas: string | null;
    requisicoes: number;
    tempo_ms: number;
    lentas: number;
    erros: number;
    travamentos: number;
    travamento_ms: number;
    travamento_max_ms: number;
    memoria_mb: number | null;
    bytes: number;
    storage_n: number;
    storage_bytes: number;
    ultimo: string;
  }[];
  endpoints: { endpoint: string; n: number; ms: number; mx: number; lentas: number; erros: number; bytes: number; usuarios: number }[];
  endpoint_paginas: { endpoint: string; pagina: string; n: number }[];
  paginas: {
    pagina: string;
    visitas: number;
    bytes: number;
    n: number;
    ms: number;
    lentas: number;
    erros: number;
    travamentos: number;
    travamento_ms: number;
    usuarios: number;
  }[];
}

export interface Consumo {
  banco_bytes: number;
  storage: { bucket: string; arquivos: number; bytes: number; novos: number; novos_bytes: number }[] | null;
  auth: { total: number; login_24h: number; login_7d: number; sessoes_ativas: number } | null;
  usuarios_periodo: number;
  crescimento_banco: { dia: string; bytes: number }[];
  por_dia: { dia: string; usuarios: number; requisicoes: number; bytes: number; storage_n: number; storage_bytes: number; lentas: number; erros: number }[];
  por_hora: { hora: number; usuarios: number; requisicoes: number; bytes: number }[];
  banco_por_dia: { dia: string; chamadas: number; tempo_s: number; temp_bytes: number; lido_disco_bytes: number }[];
}

async function chamar<T>(rpc: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await (supabase.rpc as any)(rpc, args);
  if (error) throw new Error(error.message || `Falha em ${rpc}`);
  return data as T;
}

const periodo = (desde: Date, ate: Date) => ({ p_desde: desde.toISOString(), p_ate: ate.toISOString() });

export const apiDesempenho = {
  agora: () => chamar<RetratoAgora>('admin_desempenho_agora'),
  estatisticas: () => chamar<Estatisticas>('admin_desempenho_estatisticas'),
  linhaTempo: (desde: Date, ate: Date, baldeMin: number) =>
    chamar<BaldeLinhaTempo[]>('admin_desempenho_linha_tempo', { ...periodo(desde, ate), p_balde_min: baldeMin }),
  janela: (desde: Date, ate: Date) => chamar<Janela>('admin_desempenho_janela', periodo(desde, ate)),
  aparelhos: (desde: Date, ate: Date) => chamar<Aparelhos>('admin_desempenho_aparelhos', periodo(desde, ate)),
  consumo: (desde: Date, ate: Date) => chamar<Consumo>('admin_desempenho_consumo', periodo(desde, ate)),
  resumoDia: (dia: string, recalcular = false) => chamar<ResumoDia>('admin_desempenho_resumo_dia', { p_dia: dia, p_recalcular: recalcular }),
  cancelar: (pid: number) => chamar<boolean>('admin_desempenho_cancelar', { p_pid: pid }),
  zerarEstatisticas: () => chamar<void>('admin_desempenho_zerar_estatisticas'),
};

export interface OpcaoPeriodo {
  id: string;
  rotulo: string;
  horas: number;
  /** tamanho do balde da linha do tempo, em minutos */
  balde: number;
}

export const PERIODOS: OpcaoPeriodo[] = [
  { id: '1h', rotulo: '1 hora', horas: 1, balde: 1 },
  { id: '6h', rotulo: '6 horas', horas: 6, balde: 5 },
  { id: '24h', rotulo: '24 horas', horas: 24, balde: 15 },
  { id: '7d', rotulo: '7 dias', horas: 24 * 7, balde: 60 },
  { id: '14d', rotulo: '14 dias', horas: 24 * 14, balde: 120 },
];
