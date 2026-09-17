/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Módulo de inteligência e cálculo analítico dos Lead Times de Carretas
 * do formulário de Logística e Expedição (FRM.LOG / Carregamento de Tramos).
 *
 * Isola toda a lógica de negócio, agrupamento temporal (semanas ISO),
 * classificação de SLA (> 24h) e exportação para Excel, permitindo cobertura
 * completa de testes unitários sem acoplamento com o React.
 */

import * as XLSX from 'xlsx';
import type { ExpedicaoCarregamentoCompleto, ExpedicaoTramo, ExpedicaoTramoObservacao, Tramo } from '../types';

export type StatusSlaCarreta = 'meta' | 'alerta' | 'critico';
export type StatusOperacionalCarreta = 'CONCLUIDO' | 'NO_PATIO' | 'INCOMPLETO';

export interface CarretaMetrica {
  id: string;
  carregamento_id: string;
  numero_carregamento: string;
  empresa: string;
  tramo: Tramo;
  numero_tramo: string | null;
  numero_nf: string | null;
  motorista: string;
  cnh: string | null;
  cavalo_placa: string;
  cavalo_uf: string | null;
  carreta_placa: string;
  carreta_uf: string | null;
  dolly_placa: string | null;
  dolly_uf: string | null;
  data_referencia: string;
  
  // Datas e horários brutos
  data_chegada_portaria: string | null;
  hora_chegada_portaria: string | null;
  data_entrada_patio: string | null;
  hora_entrada_patio: string | null;
  data_expedicao: string | null;
  hora_expedicao: string | null;

  // Instantes calculados
  dataHoraPortaria: Date | null;
  dataHoraPatio: Date | null;
  dataHoraExpedicao: Date | null;

  // Duração em horas decimais (para gráficos e cálculos matemáticos)
  horasPortariaPatio: number | null;
  horasPatioExpedicao: number | null;
  horasTotal: number | null;

  // Textos formatados para exibição
  duracaoTotalFormatada: string;
  tempoPortariaPatioFormatado: string;
  tempoPatioExpedicaoFormatado: string;

  // Observações e Histórico
  observacoes: string | null;
  historico_observacoes: ExpedicaoTramoObservacao[];
  totalObservacoes: number;
  totalEvidencias: number;

  // Status e SLAs
  status: StatusOperacionalCarreta;
  passou24h: boolean;
  classificacaoSla: StatusSlaCarreta;
}

export interface SemanaAgregada {
  chave: string; // Ex: '2026-W36'
  rotulo: string; // Ex: 'Sem 36 (01/09 a 07/09)'
  rotuloCurto: string; // Ex: 'Sem 36'
  ano: number;
  semana: number;
  inicioSemana: string; // ISO 'YYYY-MM-DD'
  fimSemana: string; // ISO 'YYYY-MM-DD'
  totalCarretas: number;
  concluidas: number;
  noPatio: number;
  qtdPassou24h: number;
  taxaPassou24h: number; // 0 - 100
  horasTotalMedia: number;
  horasPortariaPatioMedia: number;
  horasPatioExpedicaoMedia: number;
  carretas: CarretaMetrica[];
}

export interface TransportadoraAgregada {
  empresa: string;
  totalCarretas: number;
  concluidas: number;
  qtdPassou24h: number;
  taxaPassou24h: number; // 0 - 100
  horasTotalMedia: number;
  horasPortariaPatioMedia: number;
  horasPatioExpedicaoMedia: number;
}

export interface TramoAgregado {
  tramo: string;
  totalCarretas: number;
  qtdPassou24h: number;
  taxaPassou24h: number;
  horasTotalMedia: number;
}

export interface ResumoKpis {
  totalCarretas: number;
  totalConcluidas: number;
  totalNoPatio: number;
  totalPassou24h: number;
  taxaPassou24h: number; // 0 - 100
  mediaHorasTotal: number;
  mediaHorasPortariaPatio: number;
  mediaHorasPatioExpedicao: number;
  maiorLeadTimeHoras: number;
}

export type PresetPeriodo = '7dias' | '30dias' | '60dias' | 'mes_atual' | 'tudo' | 'custom';
export type FiltroSla = 'todos' | 'apenas_24h' | 'na_meta' | 'no_patio';

export interface FiltrosRelatorioExpedicao {
  preset: PresetPeriodo;
  de: string | null;
  ate: string | null;
  empresas: Set<string>;
  tramos: Set<string>;
  filtroSla: FiltroSla;
  busca: string;
}

// =====================================================================
// Saneamento e Cálculo de Data/Hora
// =====================================================================

/**
 * Normaliza e corrige strings de data ISO 'YYYY-MM-DD', tratando erros comuns de
 * digitação em celular (como ano 0026 -> 2026, ou 2006 -> 2026).
 */
export function normalizarData(valor: string | null | undefined): string | null {
  if (!valor || !valor.trim()) return null;
  const v = valor.trim();
  const m = v.match(/^(\d{1,4})-(\d{1,2})-(\d{1,2})$/);
  if (!m) return v;

  let ano = parseInt(m[1], 10);
  const mes = m[2].padStart(2, '0');
  const dia = m[3].padStart(2, '0');

  if (ano < 100) {
    ano = 2000 + ano;
  } else if (ano >= 100 && ano < 1000) {
    ano = 2000 + (ano % 100);
  } else if (ano >= 2000 && ano < 2020) {
    // Digitação acidental de 2006 em vez de 2026
    ano = 2020 + (ano % 10);
  }

  return `${String(ano).padStart(4, '0')}-${mes}-${dia}`;
}

/**
 * Converte data e hora em objeto Date com segurança.
 */
export function parseDataHora(data: string | null | undefined, hora: string | null | undefined): Date | null {
  if (!hora || !hora.trim()) return null;
  const partesHora = hora.trim().split(':');
  if (partesHora.length < 2) return null;

  const h = parseInt(partesHora[0], 10);
  const m = parseInt(partesHora[1], 10);
  if (isNaN(h) || isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;

  const dataNormalizada = normalizarData(data);
  if (!dataNormalizada || !/^\d{4}-\d{2}-\d{2}$/.test(dataNormalizada)) return null;

  const [ano, mes, dia] = dataNormalizada.split('-').map(Number);
  return new Date(ano, mes - 1, dia, h, m, 0, 0);
}

/**
 * Formata duração em horas e minutos humanamente legíveis.
 */
export function formatarHorasHumanas(horasDecimais: number | null): string {
  if (horasDecimais === null || isNaN(horasDecimais) || horasDecimais < 0) {
    return '—';
  }

  const totalMinutos = Math.round(horasDecimais * 60);
  const dias = Math.floor(totalMinutos / (24 * 60));
  const horasRestantes = Math.floor((totalMinutos % (24 * 60)) / 60);
  const minutosRestantes = totalMinutos % 60;

  if (dias > 0) {
    return `${dias}d ${horasRestantes}h ${minutosRestantes}min`;
  }
  return `${horasRestantes}h ${minutosRestantes}min`;
}

// =====================================================================
// Extração e Cálculo por Carreta
// =====================================================================

/**
 * Processa um tramo e seu carregamento associado, calculando todas as métricas
 * de tempo, classificação de permanência e SLA de 24 horas.
 */
export function calcularMetricaCarreta(
  tramo: ExpedicaoTramo,
  carregamento?: { numero?: string; empresa?: string; created_at?: string },
  dataHoraReferenciaAgora = new Date()
): CarretaMetrica {
  const dataRef = normalizarData(tramo.data_chegada_portaria || tramo.data || carregamento?.created_at?.slice(0, 10)) || '';

  const dPortaria = parseDataHora(tramo.data_chegada_portaria || tramo.data, tramo.hora_chegada_portaria);
  const dPatio = parseDataHora(tramo.data_entrada_patio || tramo.data, tramo.hora_entrada_patio);
  const dExpedicao = parseDataHora(tramo.data_expedicao || tramo.data, tramo.hora_expedicao);

  let horasPortariaPatio: number | null = null;
  let horasPatioExpedicao: number | null = null;
  let horasTotal: number | null = null;
  let status: StatusOperacionalCarreta = 'INCOMPLETO';

  if (dPortaria && dPatio) {
    const diffMs = dPatio.getTime() - dPortaria.getTime();
    if (diffMs >= 0) {
      horasPortariaPatio = Number((diffMs / (1000 * 60 * 60)).toFixed(2));
    }
  }

  if (dPatio && dExpedicao) {
    const diffMs = dExpedicao.getTime() - dPatio.getTime();
    if (diffMs >= 0) {
      horasPatioExpedicao = Number((diffMs / (1000 * 60 * 60)).toFixed(2));
    }
  }

  if (dPortaria && dExpedicao) {
    const diffMs = dExpedicao.getTime() - dPortaria.getTime();
    if (diffMs >= 0) {
      horasTotal = Number((diffMs / (1000 * 60 * 60)).toFixed(2));
      status = 'CONCLUIDO';
    }
  } else if (dPortaria && !dExpedicao) {
    // Carreta ainda está no pátio ou aguardando expedição
    const diffMs = dataHoraReferenciaAgora.getTime() - dPortaria.getTime();
    if (diffMs >= 0) {
      horasTotal = Number((diffMs / (1000 * 60 * 60)).toFixed(2));
      status = 'NO_PATIO';
    }
  }

  // Regra do SLA de 24h
  const duracaoEfetiva = horasTotal ?? 0;
  const passou24h = duracaoEfetiva > 24;

  let classificacaoSla: StatusSlaCarreta = 'meta';
  if (duracaoEfetiva > 24) {
    classificacaoSla = 'critico';
  } else if (duracaoEfetiva >= 18) {
    classificacaoSla = 'alerta';
  }

  return {
    id: tramo.id,
    carregamento_id: tramo.carregamento_id,
    numero_carregamento: carregamento?.numero || 'S/N',
    empresa: (carregamento?.empresa || 'NÃO INFORMADA').trim().toUpperCase(),
    tramo: tramo.tramo,
    numero_tramo: tramo.numero_tramo?.trim() || null,
    numero_nf: tramo.numero_nf?.trim() || null,
    motorista: (tramo.motorista || '').trim().toUpperCase() || 'NÃO INFORMADO',
    cnh: tramo.cnh?.trim() || null,
    cavalo_placa: (tramo.cavalo_placa || '').trim().toUpperCase(),
    cavalo_uf: tramo.cavalo_uf || null,
    carreta_placa: (tramo.carreta_placa || '').trim().toUpperCase(),
    carreta_uf: tramo.carreta_uf || null,
    dolly_placa: tramo.dolly_placa ? tramo.dolly_placa.trim().toUpperCase() : null,
    dolly_uf: tramo.dolly_uf || null,
    data_referencia: dataRef,

    data_chegada_portaria: normalizarData(tramo.data_chegada_portaria) || null,
    hora_chegada_portaria: tramo.hora_chegada_portaria || null,
    data_entrada_patio: normalizarData(tramo.data_entrada_patio) || null,
    hora_entrada_patio: tramo.hora_entrada_patio || null,
    data_expedicao: normalizarData(tramo.data_expedicao) || null,
    hora_expedicao: tramo.hora_expedicao || null,

    dataHoraPortaria: dPortaria,
    dataHoraPatio: dPatio,
    dataHoraExpedicao: dExpedicao,

    horasPortariaPatio,
    horasPatioExpedicao,
    horasTotal,

    duracaoTotalFormatada: formatarHorasHumanas(horasTotal),
    tempoPortariaPatioFormatado: formatarHorasHumanas(horasPortariaPatio),
    tempoPatioExpedicaoFormatado: formatarHorasHumanas(horasPatioExpedicao),

    observacoes: tramo.observacoes || (Array.isArray(tramo.historico_observacoes) && tramo.historico_observacoes.length > 0 ? tramo.historico_observacoes[tramo.historico_observacoes.length - 1].texto : null),
    historico_observacoes: Array.isArray(tramo.historico_observacoes) ? tramo.historico_observacoes : [],
    totalObservacoes: Array.isArray(tramo.historico_observacoes) ? tramo.historico_observacoes.length : 0,
    totalEvidencias: Array.isArray(tramo.historico_observacoes)
      ? tramo.historico_observacoes.reduce((acc, o) => acc + (o.evidencias?.length || 0), 0)
      : 0,

    status,
    passou24h,
    classificacaoSla,
  };
}

/**
 * Converte a lista bruta de carregamentos completos em uma lista achatada de
 * carretas prontas para agregação e gráficos.
 */
export function extrairCarretas(carregamentos: ExpedicaoCarregamentoCompleto[]): CarretaMetrica[] {
  const carretas: CarretaMetrica[] = [];

  for (const c of carregamentos) {
    if (c.excluido_em) continue;
    for (const t of c.tramos || []) {
      if (t.excluido_em) continue;
      carretas.push(calcularMetricaCarreta(t, c));
    }
  }

  // Ordena prioritariamente por data decrescente
  carretas.sort((a, b) => {
    const dataA = a.dataHoraPortaria?.getTime() || 0;
    const dataB = b.dataHoraPortaria?.getTime() || 0;
    return dataB - dataA;
  });

  return carretas;
}

// =====================================================================
// Agrupamento Semanal (ISO 8601)
// =====================================================================

/**
 * Retorna o número da semana ISO e o ano correspondente para uma data.
 */
export function obterSemanaIso(d: Date): { ano: number; semana: number } {
  const target = new Date(d.valueOf());
  const dayNr = (d.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay() + 7) % 7));
  }
  const semana = 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
  return { ano: target.getFullYear(), semana };
}

/**
 * Retorna a data de início (segunda-feira) e término (domingo) de uma semana ISO.
 */
export function intervaloSemanaIso(ano: number, semana: number): { inicio: string; fim: string } {
  const simples = new Date(ano, 0, 1 + (semana - 1) * 7);
  const dow = simples.getDay();
  const inicio = new Date(simples);
  if (dow <= 4) {
    inicio.setDate(simples.getDate() - simples.getDay() + 1);
  } else {
    inicio.setDate(simples.getDate() + 8 - simples.getDay());
  }

  const fim = new Date(inicio);
  fim.setDate(inicio.getDate() + 6);

  const f = (dt: Date) => dt.toISOString().slice(0, 10);
  return { inicio: f(inicio), fim: f(fim) };
}

/**
 * Agrupa as carretas por semana calendário (ISO), calculando médias e taxas de SLA.
 */
export function agruparPorSemana(carretas: CarretaMetrica[]): SemanaAgregada[] {
  const mapa = new Map<string, CarretaMetrica[]>();

  for (const c of carretas) {
    const dataRef = c.dataHoraPortaria || (c.data_referencia ? new Date(`${c.data_referencia}T12:00:00`) : null);
    if (!dataRef || isNaN(dataRef.getTime())) continue;

    const { ano, semana } = obterSemanaIso(dataRef);
    const chave = `${ano}-W${String(semana).padStart(2, '0')}`;

    if (!mapa.has(chave)) {
      mapa.set(chave, []);
    }
    mapa.get(chave)!.push(c);
  }

  const resultado: SemanaAgregada[] = [];

  for (const [chave, itens] of mapa.entries()) {
    const [anoStr, semStr] = chave.split('-W');
    const ano = parseInt(anoStr, 10);
    const semana = parseInt(semStr, 10);
    const { inicio, fim } = intervaloSemanaIso(ano, semana);

    const inicioBR = `${inicio.slice(8, 10)}/${inicio.slice(5, 7)}`;
    const fimBR = `${fim.slice(8, 10)}/${fim.slice(5, 7)}`;
    const rotuloCurto = `Sem ${semana}`;
    const rotulo = `Sem ${semana} (${inicioBR} a ${fimBR})`;

    const totalCarretas = itens.length;
    const concluidas = itens.filter(i => i.status === 'CONCLUIDO').length;
    const noPatio = itens.filter(i => i.status === 'NO_PATIO').length;
    const qtdPassou24h = itens.filter(i => i.passou24h).length;
    const taxaPassou24h = totalCarretas > 0 ? Number(((qtdPassou24h / totalCarretas) * 100).toFixed(1)) : 0;

    const horasTotaisValidas = itens.map(i => i.horasTotal).filter((h): h is number => h !== null && h >= 0);
    const horasTotalMedia = horasTotaisValidas.length > 0
      ? Number((horasTotaisValidas.reduce((a, b) => a + b, 0) / horasTotaisValidas.length).toFixed(1))
      : 0;

    const horasPortariaValidas = itens.map(i => i.horasPortariaPatio).filter((h): h is number => h !== null && h >= 0);
    const horasPortariaPatioMedia = horasPortariaValidas.length > 0
      ? Number((horasPortariaValidas.reduce((a, b) => a + b, 0) / horasPortariaValidas.length).toFixed(1))
      : 0;

    const horasPatioValidas = itens.map(i => i.horasPatioExpedicao).filter((h): h is number => h !== null && h >= 0);
    const horasPatioExpedicaoMedia = horasPatioValidas.length > 0
      ? Number((horasPatioValidas.reduce((a, b) => a + b, 0) / horasPatioValidas.length).toFixed(1))
      : 0;

    resultado.push({
      chave,
      rotulo,
      rotuloCurto,
      ano,
      semana,
      inicioSemana: inicio,
      fimSemana: fim,
      totalCarretas,
      concluidas,
      noPatio,
      qtdPassou24h,
      taxaPassou24h,
      horasTotalMedia,
      horasPortariaPatioMedia,
      horasPatioExpedicaoMedia,
      carretas: itens,
    });
  }

  // Ordena semanas em ordem cronológica crescente
  resultado.sort((a, b) => a.chave.localeCompare(b.chave));
  return resultado;
}

// =====================================================================
// Agrupamentos Adicionais (Transportadoras & Tramos)
// =====================================================================

export function agruparPorTransportadora(carretas: CarretaMetrica[]): TransportadoraAgregada[] {
  const mapa = new Map<string, CarretaMetrica[]>();

  for (const c of carretas) {
    const emp = c.empresa || 'NÃO INFORMADA';
    if (!mapa.has(emp)) mapa.set(emp, []);
    mapa.get(emp)!.push(c);
  }

  const resultado: TransportadoraAgregada[] = [];

  for (const [empresa, itens] of mapa.entries()) {
    const totalCarretas = itens.length;
    const concluidas = itens.filter(i => i.status === 'CONCLUIDO').length;
    const qtdPassou24h = itens.filter(i => i.passou24h).length;
    const taxaPassou24h = totalCarretas > 0 ? Number(((qtdPassou24h / totalCarretas) * 100).toFixed(1)) : 0;

    const horasTotaisValidas = itens.map(i => i.horasTotal).filter((h): h is number => h !== null && h >= 0);
    const horasTotalMedia = horasTotaisValidas.length > 0
      ? Number((horasTotaisValidas.reduce((a, b) => a + b, 0) / horasTotaisValidas.length).toFixed(1))
      : 0;

    const horasPortariaValidas = itens.map(i => i.horasPortariaPatio).filter((h): h is number => h !== null && h >= 0);
    const horasPortariaPatioMedia = horasPortariaValidas.length > 0
      ? Number((horasPortariaValidas.reduce((a, b) => a + b, 0) / horasPortariaValidas.length).toFixed(1))
      : 0;

    const horasPatioValidas = itens.map(i => i.horasPatioExpedicao).filter((h): h is number => h !== null && h >= 0);
    const horasPatioExpedicaoMedia = horasPatioValidas.length > 0
      ? Number((horasPatioValidas.reduce((a, b) => a + b, 0) / horasPatioValidas.length).toFixed(1))
      : 0;

    resultado.push({
      empresa,
      totalCarretas,
      concluidas,
      qtdPassou24h,
      taxaPassou24h,
      horasTotalMedia,
      horasPortariaPatioMedia,
      horasPatioExpedicaoMedia,
    });
  }

  resultado.sort((a, b) => b.totalCarretas - a.totalCarretas);
  return resultado;
}

export function agruparPorTramo(carretas: CarretaMetrica[]): TramoAgregado[] {
  const mapa = new Map<string, CarretaMetrica[]>();

  for (const c of carretas) {
    const tr = c.tramo || 'Outro';
    if (!mapa.has(tr)) mapa.set(tr, []);
    mapa.get(tr)!.push(c);
  }

  const resultado: TramoAgregado[] = [];

  for (const [tramo, itens] of mapa.entries()) {
    const totalCarretas = itens.length;
    const qtdPassou24h = itens.filter(i => i.passou24h).length;
    const taxaPassou24h = totalCarretas > 0 ? Number(((qtdPassou24h / totalCarretas) * 100).toFixed(1)) : 0;
    const horasValidas = itens.map(i => i.horasTotal).filter((h): h is number => h !== null && h >= 0);
    const horasTotalMedia = horasValidas.length > 0
      ? Number((horasValidas.reduce((a, b) => a + b, 0) / horasValidas.length).toFixed(1))
      : 0;

    resultado.push({
      tramo,
      totalCarretas,
      qtdPassou24h,
      taxaPassou24h,
      horasTotalMedia,
    });
  }

  resultado.sort((a, b) => b.totalCarretas - a.totalCarretas);
  return resultado;
}

// =====================================================================
// Resumo de Indicadores Principais (KPIs)
// =====================================================================

export function calcularResumoKpis(carretas: CarretaMetrica[]): ResumoKpis {
  const totalCarretas = carretas.length;
  const totalConcluidas = carretas.filter(c => c.status === 'CONCLUIDO').length;
  const totalNoPatio = carretas.filter(c => c.status === 'NO_PATIO').length;
  const totalPassou24h = carretas.filter(c => c.passou24h).length;
  const taxaPassou24h = totalCarretas > 0 ? Number(((totalPassou24h / totalCarretas) * 100).toFixed(1)) : 0;

  const horasTotais = carretas.map(c => c.horasTotal).filter((h): h is number => h !== null && h >= 0);
  const mediaHorasTotal = horasTotais.length > 0
    ? Number((horasTotais.reduce((a, b) => a + b, 0) / horasTotais.length).toFixed(1))
    : 0;

  const horasPortaria = carretas.map(c => c.horasPortariaPatio).filter((h): h is number => h !== null && h >= 0);
  const mediaHorasPortariaPatio = horasPortaria.length > 0
    ? Number((horasPortaria.reduce((a, b) => a + b, 0) / horasPortaria.length).toFixed(1))
    : 0;

  const horasPatio = carretas.map(c => c.horasPatioExpedicao).filter((h): h is number => h !== null && h >= 0);
  const mediaHorasPatioExpedicao = horasPatio.length > 0
    ? Number((horasPatio.reduce((a, b) => a + b, 0) / horasPatio.length).toFixed(1))
    : 0;

  const maiorLeadTimeHoras = horasTotais.length > 0 ? Math.max(...horasTotais) : 0;

  return {
    totalCarretas,
    totalConcluidas,
    totalNoPatio,
    totalPassou24h,
    taxaPassou24h,
    mediaHorasTotal,
    mediaHorasPortariaPatio,
    mediaHorasPatioExpedicao,
    maiorLeadTimeHoras,
  };
}

// =====================================================================
// Filtros e Intervalos de Datas
// =====================================================================

export function calcularIntervaloPreset(preset: PresetPeriodo): { de: string | null; ate: string | null } {
  const hoje = new Date();
  const f = (d: Date) => d.toISOString().slice(0, 10);

  if (preset === '7dias') {
    const d = new Date(hoje);
    d.setDate(d.getDate() - 7);
    return { de: f(d), ate: f(hoje) };
  }
  if (preset === '30dias') {
    const d = new Date(hoje);
    d.setDate(d.getDate() - 30);
    return { de: f(d), ate: f(hoje) };
  }
  if (preset === '60dias') {
    const d = new Date(hoje);
    d.setDate(d.getDate() - 60);
    return { de: f(d), ate: f(hoje) };
  }
  if (preset === 'mes_atual') {
    const d = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    return { de: f(d), ate: f(hoje) };
  }
  return { de: null, ate: null };
}

export function filtrarCarretas(carretas: CarretaMetrica[], filtros: FiltrosRelatorioExpedicao): CarretaMetrica[] {
  const buscaTermo = filtros.busca.trim().toLowerCase();

  return carretas.filter(c => {
    // Filtro por Data
    if (filtros.de && c.data_referencia && c.data_referencia < filtros.de) return false;
    if (filtros.ate && c.data_referencia && c.data_referencia > filtros.ate) return false;

    // Filtro por Transportadora
    if (filtros.empresas.size > 0 && !filtros.empresas.has(c.empresa)) return false;

    // Filtro por Tramo
    if (filtros.tramos.size > 0 && !filtros.tramos.has(c.tramo)) return false;

    // Filtro por SLA
    if (filtros.filtroSla === 'apenas_24h' && !c.passou24h) return false;
    if (filtros.filtroSla === 'na_meta' && (c.passou24h || c.status === 'NO_PATIO')) return false;
    if (filtros.filtroSla === 'no_patio' && c.status !== 'NO_PATIO') return false;

    // Busca Textual
    if (buscaTermo) {
      const match =
        c.carreta_placa.toLowerCase().includes(buscaTermo) ||
        c.cavalo_placa.toLowerCase().includes(buscaTermo) ||
        c.empresa.toLowerCase().includes(buscaTermo) ||
        c.motorista.toLowerCase().includes(buscaTermo) ||
        c.tramo.toLowerCase().includes(buscaTermo) ||
        (c.numero_tramo && c.numero_tramo.toLowerCase().includes(buscaTermo)) ||
        (c.numero_nf && c.numero_nf.toLowerCase().includes(buscaTermo)) ||
        c.numero_carregamento.toLowerCase().includes(buscaTermo);

      if (!match) return false;
    }

    return true;
  });
}

// =====================================================================
// Exportação para Planilha Excel (.xlsx)
// =====================================================================

export function exportarRelatorioExcel(carretas: CarretaMetrica[], filtrosDescricao = ''): void {
  const dados = carretas.map((c, index) => ({
    'Item': index + 1,
    'SLA': c.passou24h ? 'EXCEDEU 24H' : 'NA META',
    'Status': c.status === 'CONCLUIDO' ? 'Expedido' : c.status === 'NO_PATIO' ? 'No Pátio' : 'Incompleto',
    'Transportadora': c.empresa,
    'Placa Carreta': c.carreta_placa + (c.carreta_uf ? `/${c.carreta_uf}` : ''),
    'Placa Cavalo': c.cavalo_placa + (c.cavalo_uf ? `/${c.cavalo_uf}` : ''),
    'Motorista': c.motorista,
    'CNH': c.cnh || '',
    'Tramo': c.tramo,
    'Nº Tramo': c.numero_tramo || '',
    'Nota Fiscal': c.numero_nf || '',
    'Carregamento': c.numero_carregamento,
    'Data Chegada': c.data_chegada_portaria || '',
    'Hora Chegada': c.hora_chegada_portaria || '',
    'Data Entrada Pátio': c.data_entrada_patio || '',
    'Hora Entrada Pátio': c.hora_entrada_patio || '',
    'Data Expedição': c.data_expedicao || '',
    'Hora Expedição': c.hora_expedicao || '',
    'Espera Portaria-Pátio (h)': c.horasPortariaPatio !== null ? c.horasPortariaPatio : '',
    'Tempo no Pátio (h)': c.horasPatioExpedicao !== null ? c.horasPatioExpedicao : '',
    'Lead Time Total (h)': c.horasTotal !== null ? c.horasTotal : '',
    'Lead Time Formatado': c.duracaoTotalFormatada,
    'Observações / Justificativas': c.observacoes || (c.historico_observacoes && c.historico_observacoes.length > 0 ? c.historico_observacoes.map(h => `[${h.usuario_nome}]: ${h.texto}`).join(' | ') : ''),
    'Qtd Evidências': c.totalEvidencias > 0 ? c.totalEvidencias : '',
  }));

  const worksheet = XLSX.utils.json_to_sheet(dados);

  // Ajusta larguras de coluna
  worksheet['!cols'] = [
    { wch: 6 },  // Item
    { wch: 14 }, // SLA
    { wch: 12 }, // Status
    { wch: 18 }, // Transportadora
    { wch: 14 }, // Carreta
    { wch: 14 }, // Cavalo
    { wch: 26 }, // Motorista
    { wch: 14 }, // CNH
    { wch: 18 }, // Tramo
    { wch: 10 }, // Nº Tramo
    { wch: 14 }, // NF
    { wch: 16 }, // Carregamento
    { wch: 13 }, // Data Chegada
    { wch: 13 }, // Hora Chegada
    { wch: 16 }, // Data Pátio
    { wch: 16 }, // Hora Pátio
    { wch: 14 }, // Data Exp
    { wch: 14 }, // Hora Exp
    { wch: 22 }, // Espera Portaria
    { wch: 18 }, // Tempo Pátio
    { wch: 18 }, // Lead Time Total (h)
    { wch: 20 }, // Formatado
    { wch: 35 }, // Observações / Justificativas
    { wch: 14 }, // Qtd Evidências
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Lead Times Carretas');

  const dataAtual = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(workbook, `SISTEN_Relatorio_Lead_Time_Carretas_${dataAtual}.xlsx`);
}
