/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Módulo RH — cadastros (setores, turnos, pessoas, calendário de %HE) e o
 * formulário ASE - Hora Extra (FRM.RHU-0007). Supabase direto, no mesmo
 * padrão de `expedicaoApi.ts`/`cotacoesApi.ts`: dado novo e de baixo volume,
 * sem motivo para passar pelo cache do `localDb`.
 *
 * Sem workflow de aprovação por decisão de produto: o formulário só é
 * visível para quem o admin conceder acesso (`page_access['rh_ase_hora_extra']`,
 * tipicamente os próprios gestores de turno) — preencher e enviar já é a
 * autorização. Ver `src/views/RhAseHoraExtra.tsx`.
 */

import { supabase } from '../db/supabaseClient';
import type {
  AseHoraExtraCompleta, AseHoraExtraItem, AseHoraExtraSolicitacao, AseHoraExtraStatus,
  RhHoraExtra, RhPessoa, RhSetor, RhTurno,
} from '../types';

export interface RhImportSummary {
  lidos: number;
  inseridos: number;
  atualizados: number;
}

/**
 * PostgREST serializa colunas `numeric`/`decimal` como string (evita perda de
 * precisão em ponto flutuante) — sem essa normalização, `percentual_he` e
 * `total_horas` chegam como `"60.00"` e quebram `.toFixed()`/somas em cascata
 * na tela (`"0" + "60.00"` vira concatenação, não soma).
 */
function normalizarItem(raw: any): AseHoraExtraItem {
  return {
    ...raw,
    percentual_he: raw.percentual_he == null ? null : Number(raw.percentual_he),
    total_horas: raw.total_horas == null ? null : Number(raw.total_horas),
  };
}

// =====================================================================
// Cadastros: setores, turnos, pessoas, calendário de %HE
// =====================================================================

export async function listarRhSetores(): Promise<RhSetor[]> {
  const { data, error } = await supabase.from('rh_setores').select('*').order('nome');
  if (error) throw new Error(error.message);
  return (data || []) as RhSetor[];
}

export async function listarRhTurnos(): Promise<RhTurno[]> {
  const { data, error } = await supabase.from('rh_turnos').select('*').order('nome');
  if (error) throw new Error(error.message);
  return (data || []) as RhTurno[];
}

export async function listarRhPessoas(): Promise<RhPessoa[]> {
  const { data, error } = await supabase.from('rh_pessoas').select('*').order('nome');
  if (error) throw new Error(error.message);
  return (data || []) as RhPessoa[];
}

export async function listarRhHoraExtra(): Promise<RhHoraExtra[]> {
  const { data, error } = await supabase.from('rh_hora_extra').select('*').order('dia', { ascending: false });
  if (error) throw new Error(error.message);
  // `percentual_he` é `numeric` — vem como string do PostgREST, ver `normalizarItem`.
  return (data || []).map((row: any) => ({ ...row, percentual_he: Number(row.percentual_he) })) as RhHoraExtra[];
}

/** Busca o %HE cadastrado para uma data (`YYYY-MM-DD`); usado para pré-preencher os itens do ASE. */
export async function buscarPercentualHE(dia: string): Promise<number | null> {
  const { data, error } = await supabase.from('rh_hora_extra').select('percentual_he').eq('dia', dia).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? Number((data as any).percentual_he) : null;
}

const BATCH_SIZE = 500;

async function upsertEmLotes<T extends Record<string, any>>(
  tabela: string,
  linhas: T[],
  onConflict: string,
  chaveExistente: (linha: T) => string,
  onProgress?: (percent: number, message?: string) => void,
): Promise<RhImportSummary> {
  let inseridos = 0;
  let atualizados = 0;
  const chaves = linhas.map(chaveExistente);
  const totalBatches = Math.ceil(linhas.length / BATCH_SIZE);

  for (let i = 0; i < linhas.length; i += BATCH_SIZE) {
    const chunk = linhas.slice(i, i + BATCH_SIZE);
    const chunkChaves = chaves.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    onProgress?.(Math.round((i / linhas.length) * 90), `Importando ${tabela} (lote ${batchNum}/${totalBatches})...`);

    const { data: existentes, error: selErr } = await supabase.from(tabela).select(onConflict).in(onConflict, chunkChaves);
    if (selErr) throw new Error(selErr.message);
    const existentesSet = new Set((existentes || []).map((r: any) => r[onConflict]));

    const { error: upErr } = await supabase.from(tabela).upsert(chunk, { onConflict });
    if (upErr) throw new Error(upErr.message);

    const novos = chunkChaves.filter(c => !existentesSet.has(c)).length;
    inseridos += novos;
    atualizados += chunk.length - novos;
  }

  onProgress?.(100, 'Importação concluída.');
  return { lidos: linhas.length, inseridos, atualizados };
}

export async function importarRhSetores(
  nomes: string[],
  onProgress?: (percent: number, message?: string) => void,
): Promise<RhImportSummary> {
  const deduped = Array.from(new Set(nomes.map(n => n.trim()).filter(Boolean)));
  const linhas = deduped.map(nome => ({ nome, ativo: true }));
  return upsertEmLotes('rh_setores', linhas, 'nome', l => l.nome, onProgress);
}

export async function importarRhPessoas(
  itens: { registro: string; nome: string; cargo?: string }[],
  onProgress?: (percent: number, message?: string) => void,
): Promise<RhImportSummary> {
  const dedupedMap = new Map<string, { registro: string; nome: string; cargo: string | null; ativo: boolean; updated_at: string }>();
  itens.forEach(it => {
    const registro = String(it.registro || '').trim();
    if (!registro) return;
    dedupedMap.set(registro, {
      registro,
      nome: String(it.nome || '').trim(),
      cargo: it.cargo?.trim() || null,
      ativo: true,
      updated_at: new Date().toISOString(),
    });
  });
  return upsertEmLotes('rh_pessoas', Array.from(dedupedMap.values()), 'registro', l => l.registro, onProgress);
}

export async function importarRhHoraExtra(
  itens: { dia: string; percentual_he: number }[],
  onProgress?: (percent: number, message?: string) => void,
): Promise<RhImportSummary> {
  const dedupedMap = new Map<string, { dia: string; percentual_he: number }>();
  itens.forEach(it => {
    if (!it.dia) return;
    dedupedMap.set(it.dia, { dia: it.dia, percentual_he: it.percentual_he });
  });
  return upsertEmLotes('rh_hora_extra', Array.from(dedupedMap.values()), 'dia', l => l.dia, onProgress);
}

// =====================================================================
// Cálculo de horas (Art. 59 CLT: adicional noturno reduzido, 22h–5h)
// =====================================================================

export interface ResultadoCalculoHoras {
  /** Minutos trabalhados fora da janela noturna (05:00–22:00). */
  minutosDiurnos: number;
  /** Minutos trabalhados dentro da janela noturna (22:00–05:00), em minutos-relógio (não reduzidos). */
  minutosNoturnos: number;
  /** Total em horas, já com a hora noturna reduzida (52min30s = 1h) contabilizada a mais. */
  totalHoras: number;
}

const INICIO_NOTURNO_MIN = 22 * 60; // 22:00
const FIM_NOTURNO_MIN = 5 * 60; // 05:00
/** Hora noturna reduzida: 52min30s de relógio equivalem a 60min trabalhados. */
const FATOR_REDUCAO_NOTURNA = 52.5 / 60;

function paraMinutos(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
}

/**
 * Calcula o total de horas extras entre `horaEntrada` e `horaSaida` (formato
 * `HH:MM`), descontando o intervalo e aplicando a redução da hora noturna
 * (Art. 73 CLT) à fração do período que cai entre 22h e 5h. Trata virada de
 * dia (saída menor que entrada = turno que cruza a meia-noite).
 */
export function calcularHorasASE(horaEntrada: string, horaSaida: string, intervaloMinutos = 0): ResultadoCalculoHoras {
  if (!horaEntrada || !horaSaida) return { minutosDiurnos: 0, minutosNoturnos: 0, totalHoras: 0 };

  const inicio = paraMinutos(horaEntrada);
  let fim = paraMinutos(horaSaida);
  if (fim <= inicio) fim += 24 * 60; // cruzou a meia-noite

  let minutosNoturnos = 0;
  // Varre minuto a minuto seria custoso à toa; em vez disso soma a
  // interseção do intervalo [inicio, fim) com as duas janelas noturnas
  // possíveis no período de 48h considerado (22h-29h e 46h-53h, ou seja,
  // 22h-5h do dia 1 e 22h-5h do dia 2).
  const janelas = [
    [INICIO_NOTURNO_MIN, FIM_NOTURNO_MIN + 24 * 60],
    [INICIO_NOTURNO_MIN + 24 * 60, FIM_NOTURNO_MIN + 48 * 60],
  ];
  for (const [ini, fimJanela] of janelas) {
    const sobreposicaoInicio = Math.max(inicio, ini);
    const sobreposicaoFim = Math.min(fim, fimJanela);
    if (sobreposicaoFim > sobreposicaoInicio) minutosNoturnos += sobreposicaoFim - sobreposicaoInicio;
  }

  const minutosBrutos = fim - inicio;
  const minutosDiurnos = Math.max(0, minutosBrutos - minutosNoturnos - intervaloMinutos);
  // O intervalo é descontado do período diurno preferencialmente; se maior
  // que o diurno, o excedente desconta do noturno.
  const excedenteIntervalo = Math.max(0, intervaloMinutos - (minutosBrutos - minutosNoturnos));
  const minutosNoturnosLiquidos = Math.max(0, minutosNoturnos - excedenteIntervalo);

  const horasDiurnas = minutosDiurnos / 60;
  const horasNoturnas = (minutosNoturnosLiquidos / FATOR_REDUCAO_NOTURNA) / 60;

  return {
    minutosDiurnos,
    minutosNoturnos: minutosNoturnosLiquidos,
    totalHoras: Math.round((horasDiurnas + horasNoturnas) * 100) / 100,
  };
}

const DIAS_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

/** Nome do dia da semana (capitalizado, em pt-BR) de uma data `YYYY-MM-DD` — evita deslocamento de fuso usando os componentes da string direto. */
export function diaDaSemana(dataISO: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataISO)) return '';
  const [y, m, d] = dataISO.split('-').map(Number);
  return DIAS_SEMANA[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

// =====================================================================
// ASE - Hora Extra: solicitações e itens
// =====================================================================

function gerarProtocoloBase(): string {
  const agora = new Date();
  const ym = `${agora.getFullYear()}${String(agora.getMonth() + 1).padStart(2, '0')}`;
  const sufixo = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `ASE-${ym}-${sufixo}`;
}

export async function listarSolicitacoesASE(): Promise<AseHoraExtraCompleta[]> {
  const { data, error } = await supabase
    .from('rh_ase_solicitacoes')
    .select(`
      *,
      setor:rh_setores (nome),
      turno:rh_turnos (nome),
      solicitante:profiles (name),
      itens:rh_ase_itens (*)
    `)
    .order('data_execucao', { ascending: false })
    .limit(300);

  if (error) throw new Error(error.message);

  return (data || []).map((row: any) => ({
    ...row,
    setor_nome: row.setor?.nome ?? null,
    turno_nome: row.turno?.nome ?? null,
    solicitante_nome: row.solicitante?.name ?? null,
    itens: (row.itens || []).map(normalizarItem),
  })) as AseHoraExtraCompleta[];
}

export async function obterSolicitacaoASE(id: string): Promise<AseHoraExtraCompleta | null> {
  const { data, error } = await supabase
    .from('rh_ase_solicitacoes')
    .select(`
      *,
      setor:rh_setores (nome),
      turno:rh_turnos (nome),
      solicitante:profiles (name),
      itens:rh_ase_itens (*)
    `)
    .eq('id', id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  const row = data as any;
  return {
    ...row,
    setor_nome: row.setor?.nome ?? null,
    turno_nome: row.turno?.nome ?? null,
    solicitante_nome: row.solicitante?.name ?? null,
    itens: (row.itens || []).map(normalizarItem),
  } as AseHoraExtraCompleta;
}

/** Cria o cabeçalho já no banco (rascunho vazio) para que os itens possam ser adicionados a seguir. Retenta uma vez em colisão de protocolo. */
export async function criarSolicitacaoASE(params: {
  solicitanteId: string;
  setorId: string | null;
  turnoId: string | null;
  dataExecucao: string;
}): Promise<AseHoraExtraSolicitacao> {
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const { data, error } = await supabase
      .from('rh_ase_solicitacoes')
      .insert({
        numero_protocolo: gerarProtocoloBase(),
        solicitante_id: params.solicitanteId,
        setor_id: params.setorId,
        turno_id: params.turnoId,
        data_execucao: params.dataExecucao,
        status: 'RASCUNHO' as AseHoraExtraStatus,
      })
      .select()
      .single();

    if (!error) return data as AseHoraExtraSolicitacao;
    if (!error.message.includes('numero_protocolo')) throw new Error(error.message);
    // colisão de sufixo aleatório: tenta de novo com um novo protocolo
  }
  throw new Error('Não foi possível gerar um número de protocolo único. Tente novamente.');
}

export async function salvarSolicitacaoASE(
  id: string,
  patch: Partial<Pick<AseHoraExtraSolicitacao, 'setor_id' | 'turno_id' | 'data_execucao' | 'justificativa' | 'status'>>,
): Promise<void> {
  const { error } = await supabase
    .from('rh_ase_solicitacoes')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function excluirSolicitacaoASE(id: string): Promise<void> {
  const { error } = await supabase.from('rh_ase_solicitacoes').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

type ItemEditavel = Pick<AseHoraExtraItem,
  'pessoa_id' | 'registro' | 'nome' | 'cargo' | 'transporte' | 'refeicao'
  | 'hora_entrada' | 'hora_saida' | 'intervalo_minutos' | 'percentual_he' | 'total_horas' | 'observacao'>;

export async function adicionarItemASE(solicitacaoId: string, item: ItemEditavel): Promise<AseHoraExtraItem> {
  const { data, error } = await supabase
    .from('rh_ase_itens')
    .insert({ solicitacao_id: solicitacaoId, ...item })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return normalizarItem(data);
}

export async function atualizarItemASE(id: string, patch: Partial<ItemEditavel>): Promise<void> {
  const { error } = await supabase.from('rh_ase_itens').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function removerItemASE(id: string): Promise<void> {
  const { error } = await supabase.from('rh_ase_itens').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
