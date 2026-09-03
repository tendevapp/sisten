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
  RhHoraExtra, RhPessoa, RhRota, RhSetor, RhTurno,
} from '../types';
import { apenasVigentes, marcarExcluido, marcarRestaurado, semExcluidos } from './softDelete';

export interface RhImportSummary {
  lidos: number;
  inseridos: number;
  atualizados: number;
}

let cacheMapaRotas: Map<string, RhRota> | null = null;
let cacheMapaRotasExpira = 0;

/** Carrega mapa em memoria de rotas por funcionario normalizado para vinculacao rapida. */
export async function carregarMapaRotas(forcar = false): Promise<Map<string, RhRota>> {
  const agora = Date.now();
  if (!forcar && cacheMapaRotas && agora < cacheMapaRotasExpira) {
    return cacheMapaRotas;
  }
  try {
    const rotas = await listarRhRotas();
    const mapa = new Map<string, RhRota>();
    rotas.forEach(r => {
      if (!r.funcionario) return;
      const chave = r.funcionario
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
      // Prioriza rotas regulares sobre 'Rota Turno' se houver duplicidade
      if (!mapa.has(chave) || r.rota !== 'Rota Turno') {
        mapa.set(chave, r);
      }
    });
    cacheMapaRotas = mapa;
    cacheMapaRotasExpira = agora + 60000;
    return mapa;
  } catch (err) {
    console.warn('Erro ao carregar mapa de rotas:', err);
    return cacheMapaRotas || new Map();
  }
}

/**
 * PostgREST serializa colunas `numeric`/`decimal` como string (evita perda de
 * precisão em ponto flutuante) — sem essa normalização, `percentual_he` e
 * `total_horas` chegam como `"60.00"` e quebram `.toFixed()`/somas em cascata
 * na tela (`"0" + "60.00"` vira concatenação, não soma).
 * Também resolve rota, ponto de embarque e contato do colaborador a partir do mapa ou da view.
 */
export function normalizarItem(raw: any, rotasMap?: Map<string, RhRota>): AseHoraExtraItem {
  let rota = raw.rota_transporte ?? null;
  let ponto = raw.ponto_embarque_transporte ?? null;
  let horario = raw.horario_embarque_transporte ?? null;
  let contato = raw.contato_transporte ?? null;

  if (raw.nome && rotasMap) {
    const chave = String(raw.nome)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
    const r = rotasMap.get(chave);
    if (r) {
      rota = rota || r.rota;
      ponto = ponto || r.ponto_embarque;
      horario = horario || r.horario;
      contato = contato || r.contato;
    }
  }

  return {
    ...raw,
    hora_entrada: raw.hora_entrada ? String(raw.hora_entrada).slice(0, 5) : '',
    hora_saida: raw.hora_saida ? String(raw.hora_saida).slice(0, 5) : '',
    percentual_he: raw.percentual_he == null ? null : Number(raw.percentual_he),
    total_horas: raw.total_horas == null ? null : Number(raw.total_horas),
    rota_transporte: rota,
    ponto_embarque_transporte: ponto,
    horario_embarque_transporte: horario,
    contato_transporte: contato,
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

export async function criarRhSetor(nome: string): Promise<RhSetor> {
  const nomeLimpo = nome.trim().toUpperCase();
  if (!nomeLimpo) throw new Error('Nome do setor é obrigatório.');

  const { data, error } = await supabase
    .from('rh_setores')
    .insert({ nome: nomeLimpo, ativo: true })
    .select()
    .single();

  if (error) {
    if (error.code === '23505' || error.message.includes('unique')) {
      throw new Error(`Já existe um setor cadastrado com o nome "${nomeLimpo}".`);
    }
    throw new Error(error.message);
  }
  return data as RhSetor;
}

export async function atualizarRhSetor(
  id: string,
  patch: { nome?: string; ativo?: boolean }
): Promise<RhSetor> {
  const payload: any = {};
  if (patch.nome !== undefined) {
    const nomeLimpo = patch.nome.trim().toUpperCase();
    if (!nomeLimpo) throw new Error('Nome do setor não pode ser vazio.');
    payload.nome = nomeLimpo;
  }
  if (patch.ativo !== undefined) {
    payload.ativo = patch.ativo;
  }

  const { data, error } = await supabase
    .from('rh_setores')
    .update(payload)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    if (error.code === '23505' || error.message.includes('unique')) {
      throw new Error('Já existe outro setor com este nome.');
    }
    throw new Error(error.message);
  }
  return data as RhSetor;
}

export async function alternarStatusRhSetor(id: string, ativo: boolean): Promise<void> {
  const { error } = await supabase
    .from('rh_setores')
    .update({ ativo })
    .eq('id', id);

  if (error) throw new Error(error.message);
}

export async function excluirRhSetor(id: string): Promise<void> {
  // Verifica se o setor possui solicitacoes de ASE vinculadas antes de excluir
  const { count, error: countErr } = await supabase
    .from('rh_ase_solicitacoes')
    .select('*', { count: 'exact', head: true })
    .eq('setor_id', id);

  if (countErr) throw new Error(countErr.message);

  if (count && count > 0) {
    throw new Error(
      `Este setor está vinculado a ${count} solicitação(ões) de ASE. Para preservar o histórico, inative o setor em vez de excluí-lo.`
    );
  }

  const { error } = await supabase
    .from('rh_setores')
    .delete()
    .eq('id', id);

  if (error) throw new Error(error.message);
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

/** Busca o %HE cadastrado para uma data (`YYYY-MM-DD`); se nao houver registro no banco, aplica o percentual padrao por dia da semana (Domingo: 100%, Sabado: 80%, Seg-Sex: 60%). */
export async function buscarPercentualHE(dia: string): Promise<number | null> {
  const { data, error } = await supabase.from('rh_hora_extra').select('percentual_he').eq('dia', dia).maybeSingle();
  if (error) throw new Error(error.message);
  if (data?.percentual_he != null) {
    return Number((data as any).percentual_he);
  }
  // Fallback por dia da semana quando nao houver registro especifico
  if (/^\d{4}-\d{2}-\d{2}$/.test(dia)) {
    const [y, m, d] = dia.split('-').map(Number);
    const dayOfWeek = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    if (dayOfWeek === 0) return 100; // Domingo
    if (dayOfWeek === 6) return 80;  // Sabado
    return 60;                      // Segunda a Sexta
  }
  return null;
}

export async function listarRhRotas(filtroRota?: string, incluirExcluidos = false): Promise<RhRota[]> {
  let query = (supabase as any).from('rh_rotas').select('*').order('rota').order('horario');
  if (filtroRota) {
    query = query.eq('rota', filtroRota);
  }
  query = apenasVigentes(query, incluirExcluidos);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data || []) as RhRota[];
}

export async function buscarRotaPorFuncionario(nomeFuncionario: string): Promise<RhRota | null> {
  if (!nomeFuncionario || !nomeFuncionario.trim()) return null;
  const { data, error } = await (supabase as any)
    .from('rh_rotas')
    .select('*')
    .is('excluido_em', null)
    .ilike('funcionario', `%${nomeFuncionario.trim()}%`)
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as RhRota) || null;
}

export async function criarRhRota(dados: {
  funcionario: string;
  ponto_embarque: string;
  horario: string;
  contato?: string | null;
  rota: string;
}): Promise<RhRota> {
  const { data, error } = await (supabase as any)
    .from('rh_rotas')
    .insert({
      funcionario: dados.funcionario.trim(),
      ponto_embarque: dados.ponto_embarque.trim(),
      horario: dados.horario.trim(),
      contato: dados.contato?.trim() || null,
      rota: dados.rota.trim(),
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as RhRota;
}

export async function atualizarRhRota(
  id: string,
  patch: Partial<Pick<RhRota, 'funcionario' | 'ponto_embarque' | 'horario' | 'contato' | 'rota' | 'ativo'>>,
): Promise<void> {
  const { error } = await (supabase as any)
    .from('rh_rotas')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function excluirRhRota(id: string, excluidoPor?: string): Promise<void> {
  const { error } = await (supabase as any).from('rh_rotas').update(marcarExcluido(excluidoPor)).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function restaurarRhRota(id: string): Promise<void> {
  const { error } = await (supabase as any).from('rh_rotas').update(marcarRestaurado()).eq('id', id);
  if (error) throw new Error(error.message);
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

    const { data: existentes, error: selErr } = await (supabase as any).from(tabela).select(onConflict).in(onConflict, chunkChaves);
    if (selErr) throw new Error(selErr.message);
    const existentesSet = new Set((existentes || []).map((r: any) => r[onConflict]));

    const { error: upErr } = await (supabase as any).from(tabela).upsert(chunk, { onConflict });
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

export async function importarRhRotas(
  itens: { funcionario: string; ponto_embarque: string; horario: string; contato?: string | null; rota: string }[],
  onProgress?: (percent: number, message?: string) => void,
): Promise<RhImportSummary> {
  const dedupedMap = new Map<string, {
    funcionario: string;
    ponto_embarque: string;
    horario: string;
    contato: string | null;
    rota: string;
    ativo: boolean;
    updated_at: string;
  }>();

  itens.forEach(it => {
    if (!it.funcionario?.trim()) return;
    const chave = `${it.funcionario.trim().toUpperCase()}|${it.rota.trim()}`;
    dedupedMap.set(chave, {
      funcionario: it.funcionario.trim(),
      ponto_embarque: it.ponto_embarque.trim(),
      horario: it.horario.trim(),
      contato: it.contato?.trim() || null,
      rota: it.rota.trim(),
      ativo: true,
      updated_at: new Date().toISOString(),
    });
  });

  return upsertEmLotes('rh_rotas', Array.from(dedupedMap.values()), 'funcionario,rota', l => `${l.funcionario}|${l.rota}`, onProgress);
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

/**
 * Normaliza o nome do setor para uma sigla/código amigável e legível.
 * Exemplos: "SUPRIMENTOS / COMPRAS" -> "SUPR", "ALMOXARIFADO" -> "ALMOX", "RECURSOS HUMANOS" -> "RH".
 */
export function extrairSiglaSetor(nomeSetor?: string | null): string {
  if (!nomeSetor || !nomeSetor.trim()) return 'GERAL';
  const limpo = nomeSetor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();

  // Mapeamentos conhecidos para siglas elegantes
  if (limpo.includes('SUPRIMENT') || limpo.includes('COMPRA')) return 'SUPR';
  if (limpo.includes('ALMOXARIF')) return 'ALMOX';
  if (limpo.includes('RECURSOS HUMAN') || limpo === 'RH') return 'RH';
  if (limpo.includes('MANUTEN')) return 'MANUT';
  if (limpo.includes('PRODUC') || limpo.includes('FABRIC')) return 'PROD';
  if (limpo.includes('PORTARIA') || limpo.includes('VIGILAN')) return 'PORT';
  if (limpo.includes('QUALIDADE')) return 'QUAL';
  if (limpo.includes('SEGURANC') || limpo.includes('SESMT')) return 'SEG';
  if (limpo.includes('EXPEDIC') || limpo.includes('LOGIST')) return 'LOG';
  if (limpo.includes('ENGENHAR')) return 'ENG';
  if (limpo.includes('FINANCEIR') || limpo.includes('CONTABIL')) return 'FIN';
  if (limpo.includes('ADMINISTR')) return 'ADM';
  if (limpo.includes('TECNOLOGIA') || limpo === 'TI' || limpo.includes('INFORMAT')) return 'TI';
  if (limpo.includes('JURIDIC')) return 'JUR';
  if (limpo.includes('COMERCIAL') || limpo.includes('VENDAS')) return 'COM';
  if (limpo.includes('PLANEJ')) return 'PLAN';

  // Fallback: primeira palavra limpa com até 6 caracteres alfanuméricos
  const primeiraPalavra = limpo.split(/[\s/_-]+/)[0].replace(/[^A-Z0-9]/g, '');
  return primeiraPalavra.slice(0, 6) || 'GERAL';
}

/**
 * Converte data ISO (YYYY-MM-DD) para formato DDMMAA (ex: "2026-08-27" -> "270826").
 */
export function formatarDataDDMMAA(dataISO?: string | null): string {
  if (!dataISO || !/^\d{4}-\d{2}-\d{2}$/.test(dataISO)) {
    const agora = new Date();
    const d = String(agora.getDate()).padStart(2, '0');
    const m = String(agora.getMonth() + 1).padStart(2, '0');
    const a = String(agora.getFullYear()).slice(-2);
    return `${d}${m}${a}`;
  }
  const [y, m, d] = dataISO.split('-');
  return `${d}${m}${y.slice(-2)}`;
}

/**
 * Gera protocolo de ASE no padrão ASE-DDMMAA-SETOR (ou com sequencial se houver duplicidade no mesmo dia/setor).
 * Ex: "ASE-270826-SUPR", "ASE-270826-ALMOX-01"
 */
export function gerarProtocoloAse(dataISO?: string | null, nomeSetor?: string | null, sequencial?: number | string | null): string {
  const ddmmaa = formatarDataDDMMAA(dataISO);
  const sigla = extrairSiglaSetor(nomeSetor);
  const base = `ASE-${ddmmaa}-${sigla}`;
  if (sequencial === null || sequencial === undefined || sequencial === '') return base;
  const seqStr = typeof sequencial === 'number' ? String(sequencial).padStart(2, '0') : String(sequencial);
  return `${base}-${seqStr}`;
}

export async function listarSolicitacoesASE(incluirExcluidos = false): Promise<AseHoraExtraCompleta[]> {
  const rotasMapPromise = carregarMapaRotas();
  let query = supabase
    .from('rh_ase_solicitacoes')
    .select(`
      *,
      setor:rh_setores (nome),
      turno:rh_turnos (nome),
      solicitante:profiles!rh_ase_solicitacoes_solicitante_id_fkey (name),
      itens:rh_ase_itens (*)
    `)
    .order('data_execucao', { ascending: false })
    .limit(300);

  query = apenasVigentes(query, incluirExcluidos);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const rotasMap = await rotasMapPromise;

  return (data || []).map((row: any) => ({
    ...row,
    setor_nome: row.setor?.nome ?? null,
    turno_nome: row.turno?.nome ?? null,
    solicitante_nome: row.solicitante?.name ?? null,
    itens: semExcluidos(row.itens, incluirExcluidos).map((it: any) => normalizarItem(it, rotasMap)),
  })) as AseHoraExtraCompleta[];
}

export async function obterSolicitacaoASE(id: string, incluirExcluidos = false): Promise<AseHoraExtraCompleta | null> {
  const rotasMapPromise = carregarMapaRotas();
  const { data, error } = await supabase
    .from('rh_ase_solicitacoes')
    .select(`
      *,
      setor:rh_setores (nome),
      turno:rh_turnos (nome),
      solicitante:profiles!rh_ase_solicitacoes_solicitante_id_fkey (name),
      itens:rh_ase_itens (*)
    `)
    .eq('id', id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  const rotasMap = await rotasMapPromise;
  const row = data as any;
  return {
    ...row,
    setor_nome: row.setor?.nome ?? null,
    turno_nome: row.turno?.nome ?? null,
    solicitante_nome: row.solicitante?.name ?? null,
    itens: semExcluidos(row.itens, incluirExcluidos).map((it: any) => normalizarItem(it, rotasMap)),
  } as AseHoraExtraCompleta;
}

/** Cria o cabeçalho já no banco com o novo padrão ASE-DDMMAA-SETOR. Retenta com sufixo sequencial (-01, -02) se houver colisão. */
export async function criarSolicitacaoASE(params: {
  solicitanteId: string;
  setorId: string | null;
  turnoId: string | null;
  dataExecucao: string;
  setorNome?: string | null;
}): Promise<AseHoraExtraSolicitacao> {
  for (let tentativa = 0; tentativa < 15; tentativa++) {
    const seq = tentativa === 0 ? null : tentativa;
    const protocolo = gerarProtocoloAse(params.dataExecucao, params.setorNome, seq);

    const { data, error } = await supabase
      .from('rh_ase_solicitacoes')
      .insert({
        numero_protocolo: protocolo,
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
    // colisão de protocolo: tenta com o próximo número sequencial (-01, -02, etc.)
  }
  throw new Error('Não foi possível gerar um número de protocolo único. Tente novamente.');
}

export async function salvarSolicitacaoASE(
  id: string,
  patch: Partial<Pick<AseHoraExtraSolicitacao, 'numero_protocolo' | 'setor_id' | 'turno_id' | 'data_execucao' | 'justificativa' | 'status'>>,
): Promise<void> {
  const { error } = await supabase
    .from('rh_ase_solicitacoes')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function excluirSolicitacaoASE(id: string, excluidoPor?: string): Promise<void> {
  const { error } = await supabase.from('rh_ase_solicitacoes').update(marcarExcluido(excluidoPor)).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function restaurarSolicitacaoASE(id: string): Promise<void> {
  const { error } = await supabase.from('rh_ase_solicitacoes').update(marcarRestaurado()).eq('id', id);
  if (error) throw new Error(error.message);
}

type ItemEditavel = Pick<AseHoraExtraItem,
  'pessoa_id' | 'registro' | 'nome' | 'cargo' | 'transporte' | 'refeicao'
  | 'hora_entrada' | 'hora_saida' | 'intervalo_minutos' | 'percentual_he' | 'total_horas' | 'observacao'>;

function limparItemParaDb(item: Partial<ItemEditavel>) {
  const limpo: any = { ...item };
  if ('hora_entrada' in item) {
    limpo.hora_entrada = item.hora_entrada ? item.hora_entrada : null;
  }
  if ('hora_saida' in item) {
    limpo.hora_saida = item.hora_saida ? item.hora_saida : null;
  }
  return limpo;
}

export async function adicionarItemASE(solicitacaoId: string, item: ItemEditavel): Promise<AseHoraExtraItem> {
  const rotasMapPromise = carregarMapaRotas();
  const { data, error } = await supabase
    .from('rh_ase_itens')
    .insert({ solicitacao_id: solicitacaoId, ...limparItemParaDb(item) })
    .select()
    .single();
  if (error) throw new Error(error.message);
  const rotasMap = await rotasMapPromise;
  return normalizarItem(data, rotasMap);
}

export async function atualizarItemASE(id: string, patch: Partial<ItemEditavel>): Promise<void> {
  const { error } = await supabase.from('rh_ase_itens').update(limparItemParaDb(patch)).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function removerItemASE(id: string, excluidoPor?: string): Promise<void> {
  const { error } = await supabase.from('rh_ase_itens').update(marcarExcluido(excluidoPor)).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function restaurarItemASE(id: string): Promise<void> {
  const { error } = await supabase.from('rh_ase_itens').update(marcarRestaurado()).eq('id', id);
  if (error) throw new Error(error.message);
}
