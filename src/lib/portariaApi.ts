/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Módulo Portaria — API Supabase para os 5 formulários operacionais:
 * 1. Controle de Entrada de Equipamentos de Terceiros (FRM.SGP-0011)
 * 2. Registro de Chegada de Transportes (FRM.SGP-0009)
 * 3. Controle de Chegada e Saída de Carretas de Chapas (FRM.SGP-0020)
 * 4. Relatório de Portaria e Ocorrências (FRM.SGP-0010)
 * 5. Briefing de Segurança & Lista de Presença (FRM.SGP-0013)
 */

import { supabase } from '../db/supabaseClient';
import type {
  PortBriefingParticipante,
  PortBriefingSessao,
  PortBriefingStatus,
  PortBriefingTipo,
  PortCarretaStatus,
  PortItemConferido,
  PortLocalSetor,
  PortMaterialSeguranca,
  PortPassagemPlantao,
  PortPassagemPlantaoStatus,
  PortPessoaVeiculoHistorico,
  PortRegistroTransporte,
  PortRelatorioOcorrencia,
  PortRelatorioPortaria,
  PortRelatorioStatus,
  PortSeveridade,
  PortTipoRegistroOcorrencia,
  PortTransporteStatus,
  PortTurno,
  PortVigilante,
} from '../types';
import { apenasVigentes, marcarExcluido, marcarRestaurado, semExcluidos } from './softDelete';

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

export function gerarProtocolo(prefixo: string, dataISO?: string | null, extra?: string | number | null): string {
  const ddmmaa = formatarDataDDMMAA(dataISO);
  const pref = prefixo.toUpperCase();
  if (extra !== null && extra !== undefined && extra !== '') {
    const ext = typeof extra === 'number' ? String(extra).padStart(2, '0') : String(extra).toUpperCase();
    return `${pref}-${ddmmaa}-${ext}`;
  }
  const sufixo = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${pref}-${ddmmaa}-${sufixo}`;
}

export function hojeISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function horaAgora(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function sugerirTurno(): PortTurno {
  const h = new Date().getHours();
  if (h >= 6 && h < 14) return 'MANHA';
  if (h >= 14 && h < 22) return 'TARDE';
  return 'NOITE';
}

// =====================================================================
// 1. CONTROLE DE EQUIPAMENTO E FERRAMENTAS DE TERCEIROS (FRM.SGP-0011)
// =====================================================================

export async function listarEquipamentos(filtros?: {
  status?: PortEquipamentoStatus | 'TODOS';
  termoBusca?: string;
  dataInicio?: string;
  dataFim?: string;
  incluirExcluidos?: boolean;
}): Promise<PortControleEquipamento[]> {
  let query = supabase
    .from('port_controle_equipamentos')
    .select('*')
    .order('data_entrada', { ascending: false })
    .order('created_at', { ascending: false });

  query = apenasVigentes(query, filtros?.incluirExcluidos);

  if (filtros?.status && filtros.status !== 'TODOS') {
    query = query.eq('status', filtros.status);
  }
  if (filtros?.dataInicio) {
    query = query.gte('data_entrada', filtros.dataInicio);
  }
  if (filtros?.dataFim) {
    query = query.lte('data_entrada', filtros.dataFim);
  }
  if (filtros?.termoBusca) {
    const t = filtros.termoBusca.trim();
    query = query.or(`nome_empresa.ilike.%${t}%,funcionario.ilike.%${t}%,descricao_materiais.ilike.%${t}%,numero_protocolo.ilike.%${t}%`);
  }

  const { data, error } = await query.limit(300);
  if (error) throw new Error(error.message);
  return (data || []) as PortControleEquipamento[];
}

export async function criarEquipamento(dados: Partial<PortControleEquipamento>): Promise<PortControleEquipamento> {
  const dataEntrada = dados.data_entrada || hojeISO();
  const payload = {
    codigo_formulario: 'FRM.SGP-0011',
    numero_protocolo: dados.numero_protocolo || gerarProtocolo('EQP', dataEntrada),
    data_entrada: dataEntrada,
    data_saida: dados.data_saida || null,
    hora_entrada: dados.hora_entrada || horaAgora(),
    hora_saida: dados.hora_saida || null,
    nome_empresa: dados.nome_empresa || '',
    funcionario: dados.funcionario || '',
    descricao_materiais: dados.descricao_materiais || '',
    responsavel: dados.responsavel || null,
    vigilante_entrada: dados.vigilante_entrada || '',
    vigilante_saida: dados.vigilante_saida || null,
    status: dados.status || 'NO_PATIO',
    observacoes: dados.observacoes || null,
    criado_por: dados.criado_por || null,
  };

  const { data, error } = await supabase
    .from('port_controle_equipamentos')
    .insert(payload)
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return data as PortControleEquipamento;
}

export async function atualizarEquipamento(id: string, dados: Partial<PortControleEquipamento>): Promise<PortControleEquipamento> {
  const { data, error } = await supabase
    .from('port_controle_equipamentos')
    .update({ ...dados, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return data as PortControleEquipamento;
}

export async function registrarSaidaEquipamento(
  id: string,
  params: { vigilante_saida: string; data_saida?: string; hora_saida?: string; observacoes?: string }
): Promise<PortControleEquipamento> {
  return atualizarEquipamento(id, {
    status: 'DEVOLVIDO',
    data_saida: params.data_saida || hojeISO(),
    hora_saida: params.hora_saida || horaAgora(),
    vigilante_saida: params.vigilante_saida,
    ...(params.observacoes ? { observacoes: params.observacoes } : {}),
  });
}

export async function excluirEquipamento(id: string, excluidoPor?: string): Promise<void> {
  const { error } = await supabase
    .from('port_controle_equipamentos')
    .update(marcarExcluido(excluidoPor))
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function restaurarEquipamento(id: string): Promise<void> {
  const { error } = await supabase
    .from('port_controle_equipamentos')
    .update(marcarRestaurado())
    .eq('id', id);
  if (error) throw new Error(error.message);
}

// =====================================================================
// 2. REGISTRO DE CHEGADA DE TRANSPORTES (FRM.SGP-0009)
// =====================================================================

export async function listarTransportes(filtros?: {
  data?: string;
  turno?: PortTurno | 'TODOS';
  status?: PortTransporteStatus | 'TODOS';
  termoBusca?: string;
  incluirExcluidos?: boolean;
}): Promise<PortRegistroTransporte[]> {
  let query = supabase
    .from('port_registro_transportes')
    .select('*')
    .order('data', { ascending: false })
    .order('hora_chegada', { ascending: false });

  query = apenasVigentes(query, filtros?.incluirExcluidos);

  if (filtros?.data) {
    query = query.eq('data', filtros.data);
  }
  if (filtros?.turno && filtros.turno !== 'TODOS') {
    query = query.eq('turno', filtros.turno);
  }
  if (filtros?.status && filtros.status !== 'TODOS') {
    query = query.eq('status', filtros.status);
  }
  if (filtros?.termoBusca) {
    const t = filtros.termoBusca.trim();
    query = query.or(`placa.ilike.%${t}%,empresa.ilike.%${t}%,motorista.ilike.%${t}%,veiculo.ilike.%${t}%`);
  }

  const { data, error } = await query.limit(300);
  if (error) throw new Error(error.message);
  return (data || []) as PortRegistroTransporte[];
}

// Campos de texto livre dos transportes gravados sempre em MAIÚSCULO
// (padronização da escrita). `veiculo` fica de fora: é valor de <select>
// ('Van', 'Ônibus'...) e precisa casar com as opções.
const CAMPOS_TEXTO_TRANSPORTE = ['vigilante', 'placa', 'empresa', 'motorista', 'rota', 'ocupacao', 'observacoes'] as const;

function normalizarTextoTransporte<T extends Record<string, any>>(dados: T): T {
  const out: Record<string, any> = { ...dados };
  for (const campo of CAMPOS_TEXTO_TRANSPORTE) {
    if (typeof out[campo] === 'string') {
      const v = out[campo].toUpperCase().trim();
      out[campo] = v === '' ? (campo === 'placa' || campo === 'empresa' || campo === 'motorista' || campo === 'vigilante' ? '' : null) : v;
    }
  }
  return out as T;
}

export async function criarTransporte(dados: Partial<PortRegistroTransporte>): Promise<PortRegistroTransporte> {
  const dataRegistro = dados.data || hojeISO();
  const placaLimpa = dados.placa ? dados.placa.replace(/[^A-Za-z0-9]/g, '') : undefined;
  const payload = normalizarTextoTransporte({
    codigo_formulario: 'FRM.SGP-0009',
    numero_protocolo: dados.numero_protocolo || gerarProtocolo('TRP', dataRegistro, placaLimpa),
    data: dataRegistro,
    turno: dados.turno || sugerirTurno(),
    vigilante: dados.vigilante || '',
    veiculo: dados.veiculo || 'Van',
    placa: dados.placa || '',
    empresa: dados.empresa || '',
    hora_chegada: dados.hora_chegada || horaAgora(),
    hora_saida: dados.hora_saida || null,
    motorista: dados.motorista || '',
    rota: dados.rota || null,
    ocupacao: dados.ocupacao || null,
    observacoes: dados.observacoes || null,
    status: dados.status || 'NO_PATIO',
    criado_por: dados.criado_por || null,
  });

  // `rota` ainda não está no database.types gerado (migration pendente) —
  // cast alinhado ao padrão do arquivo para colunas fora dos tipos.
  const { data, error } = await (supabase as any)
    .from('port_registro_transportes')
    .insert(payload)
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return data as PortRegistroTransporte;
}

export async function atualizarTransporte(id: string, dados: Partial<PortRegistroTransporte>): Promise<PortRegistroTransporte> {
  const { data, error } = await (supabase as any)
    .from('port_registro_transportes')
    .update({ ...normalizarTextoTransporte(dados), updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return data as PortRegistroTransporte;
}

/**
 * Busca chegadas de transporte já lançadas que casem com o termo (placa,
 * empresa ou motorista), para preenchimento rápido do formulário. Deduplica
 * por placa+empresa+motorista, mantendo o lançamento mais recente.
 */
export async function buscarTransportesAnteriores(termo: string, limite = 8): Promise<PortRegistroTransporte[]> {
  const t = (termo || '').trim();
  if (t.length < 2) return [];
  const esc = t.replace(/[%,()]/g, ' ');

  const { data, error } = await supabase
    .from('port_registro_transportes')
    .select('*')
    .is('excluido_em', null)
    .or(`placa.ilike.%${esc}%,empresa.ilike.%${esc}%,motorista.ilike.%${esc}%`)
    .order('created_at', { ascending: false })
    .limit(40);

  if (error) throw new Error(error.message);

  const vistos = new Set<string>();
  const unicos: PortRegistroTransporte[] = [];
  for (const r of (data || []) as PortRegistroTransporte[]) {
    const chave = `${r.placa}|${r.empresa}|${r.motorista}`.toUpperCase();
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    unicos.push(r);
    if (unicos.length >= limite) break;
  }
  return unicos;
}

export async function registrarSaidaTransporte(id: string, hora_saida?: string): Promise<PortRegistroTransporte> {
  return atualizarTransporte(id, {
    status: 'FINALIZADO',
    hora_saida: hora_saida || horaAgora(),
  });
}

export async function excluirTransporte(id: string, excluidoPor?: string): Promise<void> {
  const { error } = await supabase
    .from('port_registro_transportes')
    .update(marcarExcluido(excluidoPor))
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function restaurarTransporte(id: string): Promise<void> {
  const { error } = await supabase
    .from('port_registro_transportes')
    .update(marcarRestaurado())
    .eq('id', id);
  if (error) throw new Error(error.message);
}

// =====================================================================
// 3. CONTROLE DE CHEGADA E SAÍDA DE CARRETAS DE CHAPAS (FRM.SGP-0020)
// =====================================================================

export async function listarCarretas(filtros?: {
  status?: PortCarretaStatus | 'TODOS';
  termoBusca?: string;
  dataInicio?: string;
  dataFim?: string;
  incluirExcluidos?: boolean;
}): Promise<PortControleCarreta[]> {
  let query = supabase
    .from('port_controle_carretas')
    .select('*')
    .order('data_entrada', { ascending: false })
    .order('hora_entrada', { ascending: false });

  query = apenasVigentes(query, filtros?.incluirExcluidos);

  if (filtros?.status && filtros.status !== 'TODOS') {
    query = query.eq('status', filtros.status);
  }
  if (filtros?.dataInicio) {
    query = query.gte('data_entrada', filtros.dataInicio);
  }
  if (filtros?.dataFim) {
    query = query.lte('data_entrada', filtros.dataFim);
  }
  if (filtros?.termoBusca) {
    const t = filtros.termoBusca.trim();
    query = query.or(`empresa.ilike.%${t}%,placa_cavalo.ilike.%${t}%,placa_carreta.ilike.%${t}%,nome_motorista.ilike.%${t}%`);
  }

  const { data, error } = await query.limit(300);
  if (error) throw new Error(error.message);
  return (data || []) as PortControleCarreta[];
}

export async function criarCarreta(dados: Partial<PortControleCarreta>): Promise<PortControleCarreta> {
  const dataEntrada = dados.data_entrada || hojeISO();
  const placaLimpa = dados.placa_cavalo ? dados.placa_cavalo.replace(/[^A-Za-z0-9]/g, '') : undefined;
  const payload = {
    codigo_formulario: 'FRM.SGP-0020',
    numero_protocolo: dados.numero_protocolo || gerarProtocolo('CRT', dataEntrada, placaLimpa),
    empresa: dados.empresa || '',
    placa_cavalo: dados.placa_cavalo ? dados.placa_cavalo.toUpperCase().trim() : '',
    placa_carreta: dados.placa_carreta ? dados.placa_carreta.toUpperCase().trim() : '',
    data_entrada: dados.data_entrada || hojeISO(),
    hora_entrada: dados.hora_entrada || horaAgora(),
    nome_motorista: dados.nome_motorista || '',
    cpf_motorista: dados.cpf_motorista || null,
    data_saida: dados.data_saida || null,
    hora_saida: dados.hora_saida || null,
    ass_motorista: dados.ass_motorista || null,
    vigilante_entrada: dados.vigilante_entrada || '',
    vigilante_saida: dados.vigilante_saida || null,
    numero_nf: dados.numero_nf || null,
    peso_bruto: dados.peso_bruto == null ? null : Number(dados.peso_bruto),
    status: dados.status || 'NO_PATIO',
    observacoes: dados.observacoes || null,
    criado_por: dados.criado_por || null,
  };

  const { data, error } = await supabase
    .from('port_controle_carretas')
    .insert(payload)
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return data as PortControleCarreta;
}

export async function atualizarCarreta(id: string, dados: Partial<PortControleCarreta>): Promise<PortControleCarreta> {
  const { data, error } = await supabase
    .from('port_controle_carretas')
    .update({ ...dados, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return data as PortControleCarreta;
}

export async function registrarSaidaCarreta(
  id: string,
  params: { vigilante_saida: string; ass_motorista?: string; data_saida?: string; hora_saida?: string; observacoes?: string }
): Promise<PortControleCarreta> {
  return atualizarCarreta(id, {
    status: 'FINALIZADO',
    data_saida: params.data_saida || hojeISO(),
    hora_saida: params.hora_saida || horaAgora(),
    vigilante_saida: params.vigilante_saida,
    ...(params.ass_motorista ? { ass_motorista: params.ass_motorista } : {}),
    ...(params.observacoes ? { observacoes: params.observacoes } : {}),
  });
}

export async function excluirCarreta(id: string, excluidoPor?: string): Promise<void> {
  const { error } = await supabase
    .from('port_controle_carretas')
    .update(marcarExcluido(excluidoPor))
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function restaurarCarreta(id: string): Promise<void> {
  const { error } = await supabase
    .from('port_controle_carretas')
    .update(marcarRestaurado())
    .eq('id', id);
  if (error) throw new Error(error.message);
}

// =====================================================================
// 4. RELATÓRIO DE PORTARIA E OCORRÊNCIAS (FRM.SGP-0010)
// =====================================================================

const KEY_OCORRENCIA_EXTRA = 'port_ocorrencias_extra_meta_v1';

export function obterMetadadosOcorrencia(id: string): Partial<PortRelatorioOcorrencia> {
  try {
    const map = JSON.parse(localStorage.getItem(KEY_OCORRENCIA_EXTRA) || '{}');
    return map[id] || {};
  } catch {
    return {};
  }
}

export function salvarMetadadosOcorrencia(id: string, meta: Partial<PortRelatorioOcorrencia>): void {
  try {
    const map = JSON.parse(localStorage.getItem(KEY_OCORRENCIA_EXTRA) || '{}');
    map[id] = { ...(map[id] || {}), ...meta };
    localStorage.setItem(KEY_OCORRENCIA_EXTRA, JSON.stringify(map));
  } catch {}
}

export function removerMetadadosOcorrencia(id: string): void {
  try {
    const map = JSON.parse(localStorage.getItem(KEY_OCORRENCIA_EXTRA) || '{}');
    delete map[id];
    localStorage.setItem(KEY_OCORRENCIA_EXTRA, JSON.stringify(map));
  } catch {}
}

export async function listarRelatorios(filtros?: {
  status?: PortRelatorioStatus | 'TODOS';
  turno?: PortTurno | 'TODOS';
  dataInicio?: string;
  dataFim?: string;
  incluirExcluidos?: boolean;
}): Promise<PortRelatorioPortaria[]> {
  let query = supabase
    .from('port_relatorio_portaria')
    .select(`
      *,
      ocorrencias:port_relatorio_ocorrencias (id, horario, local_setor, descricao, severidade, vigilante, created_at, excluido_em)
    `)
    .order('data', { ascending: false })
    .order('created_at', { ascending: false });

  query = apenasVigentes(query, filtros?.incluirExcluidos);

  if (filtros?.status && filtros.status !== 'TODOS') {
    query = query.eq('status', filtros.status);
  }
  if (filtros?.turno && filtros.turno !== 'TODOS') {
    query = query.eq('turno', filtros.turno);
  }
  if (filtros?.dataInicio) {
    query = query.gte('data', filtros.dataInicio);
  }
  if (filtros?.dataFim) {
    query = query.lte('data', filtros.dataFim);
  }

  const { data, error } = await query.limit(200);
  if (error) throw new Error(error.message);

  return (data || []).map((r: any) => ({
    ...r,
    ocorrencias: semExcluidos(r.ocorrencias, filtros?.incluirExcluidos)
      .map((o: any) => ({ ...o, ...obterMetadadosOcorrencia(o.id) }))
      .sort((a: any, b: any) => a.horario.localeCompare(b.horario)),
  })) as PortRelatorioPortaria[];
}

export async function obterRelatorio(id: string, incluirExcluidos = false): Promise<PortRelatorioPortaria | null> {
  const { data, error } = await supabase
    .from('port_relatorio_portaria')
    .select(`
      *,
      ocorrencias:port_relatorio_ocorrencias (*)
    `)
    .eq('id', id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  return {
    ...data,
    ocorrencias: semExcluidos(data.ocorrencias, incluirExcluidos)
      .map((o: any) => ({ ...o, ...obterMetadadosOcorrencia(o.id) }))
      .sort((a: any, b: any) => a.horario.localeCompare(b.horario)),
  } as PortRelatorioPortaria;
}

export async function criarRelatorio(dados: Partial<PortRelatorioPortaria>): Promise<PortRelatorioPortaria> {
  const dataRelatorio = dados.data || hojeISO();
  const turnoSigla = dados.turno ? dados.turno.substring(0, 3) : undefined;
  const payload = {
    codigo_formulario: 'FRM.SGP-0010',
    numero_protocolo: dados.numero_protocolo || gerarProtocolo('REL', dataRelatorio, turnoSigla),
    data: dataRelatorio,
    turno: dados.turno || sugerirTurno(),
    horario_inicio: dados.horario_inicio || '06:00',
    horario_fim: dados.horario_fim || '18:00',
    vigilante_principal: dados.vigilante_principal || '',
    vigilante_ronda01: dados.vigilante_ronda01 || null,
    vigilante_ronda02: dados.vigilante_ronda02 || null,
    status: dados.status || 'EM_ANDAMENTO',
    observacoes_gerais: dados.observacoes_gerais || null,
    criado_por: dados.criado_por || null,
  };

  const { data, error } = await supabase
    .from('port_relatorio_portaria')
    .insert(payload)
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return { ...data, ocorrencias: [] } as PortRelatorioPortaria;
}

export async function atualizarRelatorio(id: string, dados: Partial<PortRelatorioPortaria>): Promise<PortRelatorioPortaria> {
  const { data, error } = await supabase
    .from('port_relatorio_portaria')
    .update({ ...dados, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return data as PortRelatorioPortaria;
}

export async function adicionarOcorrencia(
  relatorio_id: string,
  dados: Omit<PortRelatorioOcorrencia, 'id' | 'relatorio_id' | 'created_at'>
): Promise<PortRelatorioOcorrencia> {
  const payload = {
    relatorio_id,
    horario: dados.horario || horaAgora(),
    local_setor: dados.local_setor || 'PORTARIA',
    descricao: dados.descricao || '',
    severidade: dados.severidade || 'INFO',
    vigilante: dados.vigilante || '',
  };

  const { data, error } = await supabase
    .from('port_relatorio_ocorrencias')
    .insert(payload)
    .select('*')
    .single();

  if (error) throw new Error(error.message);

  if (data?.id) {
    salvarMetadadosOcorrencia(data.id, dados);
  }

  return {
    ...data,
    ...obterMetadadosOcorrencia(data.id),
  } as PortRelatorioOcorrencia;
}

export async function atualizarOcorrencia(
  id: string,
  dados: Partial<PortRelatorioOcorrencia>
): Promise<PortRelatorioOcorrencia> {
  const payload: Record<string, any> = {};
  if (dados.horario) payload.horario = dados.horario;
  if (dados.local_setor) payload.local_setor = dados.local_setor;
  if (dados.descricao) payload.descricao = dados.descricao;
  if (dados.severidade) payload.severidade = dados.severidade;
  if (dados.vigilante) payload.vigilante = dados.vigilante;

  const { data, error } = await supabase
    .from('port_relatorio_ocorrencias')
    .update(payload)
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw new Error(error.message);

  salvarMetadadosOcorrencia(id, dados);

  return {
    ...data,
    ...obterMetadadosOcorrencia(id),
  } as PortRelatorioOcorrencia;
}

export async function excluirOcorrencia(id: string, excluidoPor?: string): Promise<void> {
  const { error } = await supabase
    .from('port_relatorio_ocorrencias')
    .update(marcarExcluido(excluidoPor))
    .eq('id', id);
  if (error) throw new Error(error.message);
  removerMetadadosOcorrencia(id);
}

export async function restaurarOcorrencia(id: string): Promise<void> {
  const { error } = await supabase
    .from('port_relatorio_ocorrencias')
    .update(marcarRestaurado())
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function encerrarRelatorio(id: string, observacoes_gerais?: string): Promise<PortRelatorioPortaria> {
  return atualizarRelatorio(id, {
    status: 'CONCLUIDO',
    ...(observacoes_gerais ? { observacoes_gerais } : {}),
  });
}

export async function excluirRelatorio(id: string, excluidoPor?: string): Promise<void> {
  const { error } = await supabase
    .from('port_relatorio_portaria')
    .update(marcarExcluido(excluidoPor))
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function restaurarRelatorio(id: string): Promise<void> {
  const { error } = await supabase
    .from('port_relatorio_portaria')
    .update(marcarRestaurado())
    .eq('id', id);
  if (error) throw new Error(error.message);
}

// Formatador padronizado de ocorrências da portaria TEN
export function formatarTextoOcorrencia(dados: {
  tipo_registro: PortTipoRegistroOcorrencia;
  horario?: string;
  hora_saida?: string | null;
  vigilante_saida?: string | null;
  empresa?: string;
  nome_pessoa?: string;
  documento_cnh?: string;
  documento_cpf?: string;
  placa_veiculo?: string;
  autorizado_por?: string;
  motivo_observacao?: string;
  fara_briefing?: boolean;
  pessoas?: { nome: string; cpf?: string; cnh?: string; funcao?: string }[];
}): string {
  const h = dados.horario ? `${dados.horario} - ` : '';
  const emp = dados.empresa ? `${dados.empresa.trim().toUpperCase()}` : '';

  let pessoasTexto = '';
  if (dados.pessoas && dados.pessoas.length > 0) {
    pessoasTexto = dados.pessoas
      .filter((p) => p.nome && p.nome.trim())
      .map((p) => {
        const doc = p.cpf ? ` (${p.cpf.trim()})` : p.cnh ? ` (CNH: ${p.cnh.trim()})` : '';
        const func = p.funcao ? ` [${p.funcao.trim().toUpperCase()}]` : '';
        return `${p.nome.trim().toUpperCase()}${doc}${func}`;
      })
      .join(', ');
  }

  const nome = pessoasTexto || (dados.nome_pessoa ? `${dados.nome_pessoa.trim().toUpperCase()}` : '');
  const cnh = (!pessoasTexto && dados.documento_cnh) ? ` - CNH: ${dados.documento_cnh.trim()}` : '';
  const cpf = (!pessoasTexto && dados.documento_cpf) ? ` (${dados.documento_cpf.trim()})` : '';
  const aut = dados.autorizado_por ? `, autorizado por ${dados.autorizado_por.trim().toUpperCase()}` : '';
  const mot = dados.motivo_observacao ? ` - ${dados.motivo_observacao.trim().toUpperCase()}` : '';
  const briefingTag = dados.fara_briefing ? ' [BRIEFING PENDENTE]' : '';
  const saidaTag = dados.hora_saida
    ? ` (Saída registrada às ${dados.hora_saida}${dados.vigilante_saida ? ` por ${dados.vigilante_saida.toUpperCase()}` : ''})`
    : '';

  switch (dados.tipo_registro) {
    case 'ENTRADA_VEICULO': {
      const placa = dados.placa_veiculo ? ` - Veículo Placa: ${dados.placa_veiculo.trim().toUpperCase()}` : '';
      return `${h}${emp ? `${emp} - ` : ''}${nome}${cnh}${placa}${briefingTag}${aut}${mot}${saidaTag}`;
    }
    case 'ENTRADA_VISITANTE': {
      return `${h}${nome}${cpf}${emp ? ` - ${emp}` : ''}, acessou a fábrica${aut}${briefingTag}${mot}${saidaTag}`;
    }
    case 'SAIDA_COLABORADOR': {
      const retornoTag = dados.hora_saida
        ? ` (Retornou às ${dados.hora_saida}${dados.vigilante_saida ? ` por ${dados.vigilante_saida.toUpperCase()}` : ''})`
        : '';
      const docMatricula = (dados.documento_cpf && !pessoasTexto) ? ` (Matrícula: ${dados.documento_cpf.trim()})` : '';
      return `${h}SAÍDA DE COLABORADOR: ${nome}${docMatricula}${aut}${mot}${retornoTag}`;
    }
    case 'RONDA_PATRIMONIAL': {
      return `${h}Ronda Patrimonial: ${dados.motivo_observacao?.toUpperCase() || 'REALIZADA SEM ALTERAÇÕES'}`;
    }
    case 'OCORRENCIA_GERAL': {
      return `${h}Ocorrência: ${dados.motivo_observacao?.toUpperCase() || 'REGISTRO DE EVENTO'}`;
    }
    case 'OUTRO_REGISTRO':
    default: {
      return `${h}${nome ? `${nome} - ` : ''}${dados.motivo_observacao?.toUpperCase() || 'REGISTRO DE PORTARIA'}`;
    }
  }
}

// Gestão de Histórico e Autocomplete Inteligente
const KEY_HISTORICO_PESSOAS = 'port_historico_pessoas_veiculos_v1';

export function carregarHistoricoLocal(): PortPessoaVeiculoHistorico[] {
  try {
    const raw = localStorage.getItem(KEY_HISTORICO_PESSOAS);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function salvarNoHistoricoLocal(item: PortPessoaVeiculoHistorico): void {
  try {
    const lista = carregarHistoricoLocal();
    const termoChave = (item.nome || item.placa || item.cpf || item.cnh || '').trim().toUpperCase();
    if (!termoChave) return;

    // Filtra duplicados
    const filtrada = lista.filter((p) => {
      if (item.cpf && p.cpf && p.cpf.replace(/\D/g, '') === item.cpf.replace(/\D/g, '')) return false;
      if (item.cnh && p.cnh && p.cnh.replace(/\D/g, '') === item.cnh.replace(/\D/g, '')) return false;
      if (item.placa && p.placa && p.placa.toUpperCase() === item.placa.toUpperCase()) return false;
      if (item.nome && p.nome && p.nome.toUpperCase() === item.nome.toUpperCase()) return false;
      return true;
    });

    const atualizado: PortPessoaVeiculoHistorico = {
      ...item,
      id: item.id || Math.random().toString(36).substring(2, 9),
      ultimo_acesso: new Date().toISOString(),
    };

    const novaLista = [atualizado, ...filtrada].slice(0, 500);
    localStorage.setItem(KEY_HISTORICO_PESSOAS, JSON.stringify(novaLista));
  } catch (err) {
    console.warn('Erro ao salvar no historico local:', err);
  }
}

export async function buscarHistoricoPessoasVeiculos(termo: string): Promise<PortPessoaVeiculoHistorico[]> {
  const t = (termo || '').trim().toLowerCase();
  const locais = carregarHistoricoLocal();

  if (!t) {
    return locais.slice(0, 20);
  }

  const matchesLocais = locais.filter((p) => {
    return (
      (p.nome && p.nome.toLowerCase().includes(t)) ||
      (p.cpf && p.cpf.toLowerCase().includes(t)) ||
      (p.cnh && p.cnh.toLowerCase().includes(t)) ||
      (p.placa && p.placa.toLowerCase().includes(t)) ||
      (p.placa_cavalo && p.placa_cavalo.toLowerCase().includes(t)) ||
      (p.placa_carreta && p.placa_carreta.toLowerCase().includes(t)) ||
      (p.empresa && p.empresa.toLowerCase().includes(t))
    );
  });

  return matchesLocais.slice(0, 25);
}

// Criação de sessão exclusiva de Briefing para uma ocorrência / lançamento da portaria
export async function criarSessaoBriefingParaOcorrencia(params: {
  empresa: string;
  pessoas: { nome: string; cpf?: string; cnh?: string; funcao?: string }[];
  autorizado_por?: string;
  motivo?: string;
  horario?: string;
}): Promise<PortBriefingSessao | null> {
  const hoje = hojeISO();
  try {
    const listaValida = params.pessoas.filter((p) => p.nome && p.nome.trim());
    if (listaValida.length === 0) return null;

    const nomesFormatados = listaValida.map((p) => p.nome.trim().toUpperCase()).join(', ');
    const empFormatada = (params.empresa || 'EXTERNO').trim().toUpperCase();

    const novaSessao = await criarSessaoBriefing({
      tipo: 'EXTERNO',
      data: hoje,
      instrutor_responsavel: 'VÍDEO INSTITUCIONAL',
      tema_treinamento: `INTEGRAÇÃO E BRIEFING DE SEGURANÇA — ${empFormatada}`,
      observacoes: `Sessão exclusiva gerada no acesso da portaria às ${params.horario || horaAgora()}. Visitantes: ${nomesFormatados}${params.autorizado_por ? ` (Autorizado por: ${params.autorizado_por.trim().toUpperCase()})` : ''}`,
    });

    for (const p of listaValida) {
      await adicionarParticipanteBriefing(novaSessao.id, {
        data: hoje,
        nome: p.nome.trim().toUpperCase(),
        empresa: empFormatada,
        cpf: (p.cpf || p.cnh || '').replace(/\D/g, '') || 'NÃO INFORMADO',
        funcao: (p.funcao || 'VISITANTE / MOTORISTA').trim().toUpperCase(),
        validade_dias: 30,
      });
    }

    return await obterSessaoBriefing(novaSessao.id);
  } catch (err) {
    console.error('Erro ao criar sessão de briefing para ocorrência:', err);
    return null;
  }
}

// Sincronização automática de visitante com Briefing de Segurança / Lista de Presença
export async function sincronizarComBriefingSeguranca(params: {
  nome: string;
  empresa: string;
  documento?: string;
  funcao?: string;
  horario?: string;
}): Promise<PortBriefingParticipante | null> {
  const sessao = await criarSessaoBriefingParaOcorrencia({
    empresa: params.empresa,
    pessoas: [{ nome: params.nome, cpf: params.documento, funcao: params.funcao }],
    horario: params.horario,
  });
  return (sessao?.participantes && sessao.participantes[0]) || null;
}

// =====================================================================
// 5. BRIEFING DE SEGURANÇA & LISTA DE PRESENÇA (FRM.SGP-0013)
// =====================================================================

export async function listarSessoesBriefing(filtros?: {
  status?: PortBriefingStatus | 'TODOS';
  tipo?: PortBriefingTipo | 'TODOS';
  dataInicio?: string;
  dataFim?: string;
  incluirExcluidos?: boolean;
}): Promise<PortBriefingSessao[]> {
  let query = supabase
    .from('port_briefing_sessoes')
    .select(`
      *,
      participantes:port_briefing_participantes (*)
    `)
    .order('data', { ascending: false })
    .order('created_at', { ascending: false });

  query = apenasVigentes(query, filtros?.incluirExcluidos);

  if (filtros?.status && filtros.status !== 'TODOS') {
    query = query.eq('status', filtros.status);
  }
  if (filtros?.tipo && filtros.tipo !== 'TODOS') {
    query = query.eq('tipo', filtros.tipo);
  }
  if (filtros?.dataInicio) {
    query = query.gte('data', filtros.dataInicio);
  }
  if (filtros?.dataFim) {
    query = query.lte('data', filtros.dataFim);
  }

  const { data, error } = await query.limit(200);
  if (error) throw new Error(error.message);

  return (data || []).map((s: any) => ({
    ...s,
    participantes: semExcluidos(s.participantes, filtros?.incluirExcluidos),
  })) as PortBriefingSessao[];
}

export async function obterSessaoBriefing(id: string, incluirExcluidos = false): Promise<PortBriefingSessao | null> {
  const { data, error } = await supabase
    .from('port_briefing_sessoes')
    .select(`
      *,
      participantes:port_briefing_participantes (*)
    `)
    .eq('id', id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  return {
    ...data,
    participantes: semExcluidos((data as any).participantes, incluirExcluidos),
  } as PortBriefingSessao;
}

export async function criarSessaoBriefing(dados: Partial<PortBriefingSessao>): Promise<PortBriefingSessao> {
  const dataSessao = dados.data || hojeISO();
  const payload = {
    codigo_formulario: 'FRM.SGP-0013',
    numero_protocolo: dados.numero_protocolo || gerarProtocolo('BRF', dataSessao),
    tema_treinamento: dados.tema_treinamento || 'BRIEFING DE SEGURANÇA',
    tipo: dados.tipo || 'INTERNO',
    data: dataSessao,
    instrutor_responsavel: dados.instrutor_responsavel || '',
    conteudo_programatico:
      dados.conteudo_programatico ||
      `1. Apresentação do Layout da Fábrica TEN - Vídeo institucional e vídeo de segurança;\n2. Apresentação dos procedimentos e rotinas de segurança;\n3. Protocolo de proibição do uso do celular nas áreas produtivas da TEN.`,
    termo_responsabilidade:
      dados.termo_responsabilidade ||
      `Declaro ter recebido as orientações de segurança aplicáveis à minha visita ou atividade, estar ciente das regras gerais de conduta da fábrica e portar as documentações e EPIs exigidos para a minha atuação. Assumo a responsabilidade por qualquer irregularidade constatada em minhas documentações e/ou desvios de conduta durante minha permanência.`,
    status: dados.status || 'ABERTA',
    observacoes: dados.observacoes || null,
    criado_por: dados.criado_por || null,
  };

  const { data, error } = await supabase
    .from('port_briefing_sessoes')
    .insert(payload)
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return { ...data, participantes: [] } as PortBriefingSessao;
}

export async function atualizarSessaoBriefing(id: string, dados: Partial<PortBriefingSessao>): Promise<PortBriefingSessao> {
  const { data, error } = await supabase
    .from('port_briefing_sessoes')
    .update({ ...dados, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return data as PortBriefingSessao;
}

export async function adicionarParticipanteBriefing(
  sessao_id: string,
  dados: Omit<PortBriefingParticipante, 'id' | 'sessao_id' | 'created_at'>
): Promise<PortBriefingParticipante> {
  const payload = {
    sessao_id,
    data: dados.data || hojeISO(),
    empresa: dados.empresa || '',
    nome: dados.nome || '',
    cpf: dados.cpf ? dados.cpf.replace(/\D/g, '') : '',
    funcao: dados.funcao || '',
    assinatura_digital: dados.assinatura_digital || null,
    validade_dias: dados.validade_dias || 90,
  };

  const { data, error } = await supabase
    .from('port_briefing_participantes')
    .insert(payload)
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return data as PortBriefingParticipante;
}

export async function salvarAssinaturaParticipanteBriefing(
  participanteId: string,
  assinaturaBase64: string,
  horaAssinatura?: string
): Promise<{ participante: PortBriefingParticipante; sessaoConcluida: boolean }> {
  const hora = horaAssinatura || horaAgora();

  const { data: part, error } = await supabase
    .from('port_briefing_participantes')
    .update({
      assinatura_digital: assinaturaBase64,
    })
    .eq('id', participanteId)
    .select('*')
    .single();

  if (error) throw new Error(error.message);

  let sessaoConcluida = false;
  if (part?.sessao_id) {
    const { data: todos } = await supabase
      .from('port_briefing_participantes')
      .select('id, assinatura_digital')
      .eq('sessao_id', part.sessao_id)
      .is('excluido_em', null);

    const todosAssinaram = todos && todos.length > 0 && todos.every((p: any) => !!p.assinatura_digital);

    if (todosAssinaram) {
      await supabase
        .from('port_briefing_sessoes')
        .update({
          status: 'CONCLUIDA',
          updated_at: new Date().toISOString(),
        })
        .eq('id', part.sessao_id);
      sessaoConcluida = true;
    }
  }

  return {
    participante: part as PortBriefingParticipante,
    sessaoConcluida,
  };
}

export async function removerParticipanteBriefing(id: string, excluidoPor?: string): Promise<void> {
  const { error } = await supabase
    .from('port_briefing_participantes')
    .update(marcarExcluido(excluidoPor))
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function restaurarParticipanteBriefing(id: string): Promise<void> {
  const { error } = await supabase
    .from('port_briefing_participantes')
    .update(marcarRestaurado())
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export interface ResultadoChecagemBriefing {
  status: 'VALIDO' | 'VENCIDO' | 'NUNCA_REALIZADO';
  participante?: PortBriefingParticipante | null;
  diasRestantes?: number;
  diasDecorridos?: number;
  dataRealizacao?: string;
  mensagem: string;
}

/**
 * Checa o status de validade do Briefing de Segurança por CPF (validade padrão: 30 dias).
 */
export async function checarStatusBriefingCpf(
  cpfLimpo: string,
  validadeDias: number = 30
): Promise<ResultadoChecagemBriefing> {
  const cpf = cpfLimpo.replace(/\D/g, '');
  if (!cpf || cpf.length < 5) {
    return {
      status: 'NUNCA_REALIZADO',
      mensagem: 'CPF não informado ou inválido.',
    };
  }

  const { data, error } = await supabase
    .from('port_briefing_participantes')
    .select('*')
    .eq('cpf', cpf)
    .is('excluido_em', null)
    .order('data', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) {
    return {
      status: 'NUNCA_REALIZADO',
      mensagem: 'Nenhum briefing anterior localizado na base.',
    };
  }

  const dataBriefing = new Date(data.data + 'T00:00:00');
  const hoje = new Date();
  const diffMs = hoje.getTime() - dataBriefing.getTime();
  const diasDecorridos = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const limite = validadeDias || data.validade_dias || 30;
  const diasRestantes = limite - diasDecorridos;

  if (diasDecorridos > limite) {
    return {
      status: 'VENCIDO',
      participante: data as PortBriefingParticipante,
      diasDecorridos,
      dataRealizacao: data.data,
      mensagem: `Briefing VENCIDO (Realizado há ${diasDecorridos} dias em ${data.data.split('-').reverse().join('/')} — Validade máxima: ${limite} dias).`,
    };
  }

  return {
    status: 'VALIDO',
    participante: data as PortBriefingParticipante,
    diasDecorridos,
    diasRestantes,
    dataRealizacao: data.data,
    mensagem: `Briefing VÁLIDO (Realizado em ${data.data.split('-').reverse().join('/')} — ${diasRestantes} dia(s) restante(s)).`,
  };
}

export async function buscarBriefingValidoPorCpf(cpfLimpo: string, validadeDias: number = 30): Promise<PortBriefingParticipante | null> {
  const res = await checarStatusBriefingCpf(cpfLimpo, validadeDias);
  if (res.status === 'VALIDO') {
    return res.participante || null;
  }
  return null;
}

export async function excluirSessaoBriefing(id: string, excluidoPor?: string): Promise<void> {
  const { error } = await supabase
    .from('port_briefing_sessoes')
    .update(marcarExcluido(excluidoPor))
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function restaurarSessaoBriefing(id: string): Promise<void> {
  const { error } = await supabase
    .from('port_briefing_sessoes')
    .update(marcarRestaurado())
    .eq('id', id);
  if (error) throw new Error(error.message);
}

// =====================================================================
// CADASTRO DE VIGILANTES DA PORTARIA
// =====================================================================

export async function listarVigilantes(apenasAtivos: boolean = false, incluirExcluidos = false): Promise<PortVigilante[]> {
  let query = supabase
    .from('port_vigilantes')
    .select('*')
    .order('nome', { ascending: true });

  if (apenasAtivos) {
    query = query.eq('ativo', true);
  }
  query = apenasVigentes(query, incluirExcluidos);

  const { data, error } = await query;
  if (error) {
    console.error('Erro ao listar vigilantes:', error);
    throw error;
  }
  return (data || []) as PortVigilante[];
}

export async function criarVigilante(dados: {
  nome: string;
  matricula?: string | null;
  empresa?: string;
  funcao?: string;
  turno_preferencial?: string | null;
  data_admissao?: string | null;
  data_nascimento?: string | null;
  ativo?: boolean;
  observacoes?: string | null;
  criado_por?: string | null;
}): Promise<PortVigilante> {
  const { data, error } = await supabase
    .from('port_vigilantes')
    .insert({
      nome: dados.nome.trim(),
      matricula: dados.matricula?.trim() || null,
      empresa: dados.empresa?.trim() || 'PROSEG / PATRIMONIAL',
      funcao: dados.funcao?.trim() || 'Vigilante',
      turno_preferencial: dados.turno_preferencial || 'REVEZAMENTO',
      data_admissao: dados.data_admissao || null,
      data_nascimento: dados.data_nascimento || null,
      ativo: dados.ativo ?? true,
      observacoes: dados.observacoes?.trim() || null,
      criado_por: dados.criado_por || null,
    })
    .select('*')
    .single();

  if (error) {
    console.error('Erro ao cadastrar vigilante:', error);
    throw error;
  }
  return data as PortVigilante;
}

export async function atualizarVigilante(
  id: string,
  dados: Partial<PortVigilante>
): Promise<PortVigilante> {
  const { data, error } = await supabase
    .from('port_vigilantes')
    .update({
      ...dados,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    console.error('Erro ao atualizar vigilante:', error);
    throw error;
  }
  return data as PortVigilante;
}

export async function alternarStatusVigilante(id: string, ativo: boolean): Promise<void> {
  const { error } = await supabase
    .from('port_vigilantes')
    .update({
      ativo,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) {
    console.error('Erro ao alternar status do vigilante:', error);
    throw error;
  }
}

export async function excluirVigilante(id: string, excluidoPor?: string): Promise<void> {
  const { error } = await supabase
    .from('port_vigilantes')
    .update(marcarExcluido(excluidoPor))
    .eq('id', id);

  if (error) {
    console.error('Erro ao excluir vigilante:', error);
    throw error;
  }
}

export async function restaurarVigilante(id: string): Promise<void> {
  const { error } = await supabase
    .from('port_vigilantes')
    .update(marcarRestaurado())
    .eq('id', id);

  if (error) {
    console.error('Erro ao restaurar vigilante:', error);
    throw error;
  }
}

// =====================================================================
// 7. MATERIAIS DE SEGURANÇA PATRIMONIAL (FACILITIES / PORTARIA)
// =====================================================================

export async function listarMateriaisSeguranca(somenteAtivos = false, incluirExcluidos = false): Promise<PortMaterialSeguranca[]> {
  let query = supabase
    .from('port_materiais_seguranca')
    .select('*')
    .order('ordem', { ascending: true })
    .order('nome', { ascending: true });

  if (somenteAtivos) {
    query = query.eq('ativo', true);
  }
  query = apenasVigentes(query, incluirExcluidos);

  const { data, error } = await query;
  if (error) {
    console.error('Erro ao listar materiais de seguranca:', error);
    throw new Error(error.message);
  }
  return (data || []) as PortMaterialSeguranca[];
}

export async function criarMaterialSeguranca(
  dados: Omit<PortMaterialSeguranca, 'id' | 'created_at' | 'updated_at'>
): Promise<PortMaterialSeguranca> {
  const { data, error } = await supabase
    .from('port_materiais_seguranca')
    .insert({
      nome: dados.nome.trim(),
      quantidade_padrao: Number(dados.quantidade_padrao) || 1,
      unidade: dados.unidade || 'UN',
      categoria: dados.categoria || 'EQUIPAMENTO',
      ativo: dados.ativo ?? true,
      ordem: Number(dados.ordem) || 0,
      observacoes: dados.observacoes ? dados.observacoes.trim() : null,
    })
    .select('*')
    .single();

  if (error) {
    console.error('Erro ao criar material de seguranca:', error);
    throw new Error(error.message);
  }
  return data as PortMaterialSeguranca;
}

export async function atualizarMaterialSeguranca(
  id: string,
  dados: Partial<PortMaterialSeguranca>
): Promise<PortMaterialSeguranca> {
  const { data, error } = await supabase
    .from('port_materiais_seguranca')
    .update({
      ...(dados.nome ? { nome: dados.nome.trim() } : {}),
      ...(dados.quantidade_padrao !== undefined ? { quantidade_padrao: Number(dados.quantidade_padrao) } : {}),
      ...(dados.unidade ? { unidade: dados.unidade } : {}),
      ...(dados.categoria ? { categoria: dados.categoria } : {}),
      ...(dados.ativo !== undefined ? { ativo: dados.ativo } : {}),
      ...(dados.ordem !== undefined ? { ordem: Number(dados.ordem) } : {}),
      ...(dados.observacoes !== undefined ? { observacoes: dados.observacoes ? dados.observacoes.trim() : null } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    console.error('Erro ao atualizar material de seguranca:', error);
    throw new Error(error.message);
  }
  return data as PortMaterialSeguranca;
}

export async function alternarStatusMaterialSeguranca(id: string, ativo: boolean): Promise<void> {
  const { error } = await supabase
    .from('port_materiais_seguranca')
    .update({ ativo, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) {
    console.error('Erro ao alternar status do material:', error);
    throw new Error(error.message);
  }
}

export async function excluirMaterialSeguranca(id: string, excluidoPor?: string): Promise<void> {
  const { error } = await (supabase as any)
    .from('port_materiais_seguranca')
    .update(marcarExcluido(excluidoPor))
    .eq('id', id);

  if (error) {
    console.error('Erro ao excluir material de seguranca:', error);
    throw new Error(error.message);
  }
}

export async function restaurarMaterialSeguranca(id: string): Promise<void> {
  const { error } = await (supabase as any)
    .from('port_materiais_seguranca')
    .update(marcarRestaurado())
    .eq('id', id);

  if (error) {
    console.error('Erro ao restaurar material de seguranca:', error);
    throw new Error(error.message);
  }
}

// =====================================================================
// 8. PASSAGEM DE PLANTÃO DA PORTARIA (FRM.SGP-0010)
// =====================================================================

export async function listarPassagensPlantao(filtros?: {
  status?: PortPassagemPlantaoStatus | 'TODOS';
  turno?: string | 'TODOS';
  dataInicio?: string;
  dataFim?: string;
  termoBusca?: string;
  incluirExcluidos?: boolean;
}): Promise<PortPassagemPlantao[]> {
  let query = supabase
    .from('port_passagem_plantao')
    .select('*')
    .order('data', { ascending: false })
    .order('created_at', { ascending: false });

  query = apenasVigentes(query, filtros?.incluirExcluidos);

  if (filtros?.status && filtros.status !== 'TODOS') {
    query = query.eq('status', filtros.status);
  }
  if (filtros?.turno && filtros.turno !== 'TODOS') {
    query = query.eq('turno', filtros.turno);
  }
  if (filtros?.dataInicio) {
    query = query.gte('data', filtros.dataInicio);
  }
  if (filtros?.dataFim) {
    query = query.lte('data', filtros.dataFim);
  }
  if (filtros?.termoBusca) {
    const t = filtros.termoBusca.trim();
    query = query.or(`vigilante_preenchedor.ilike.%${t}%,vigilante_portaria.ilike.%${t}%,vigilante_anterior01.ilike.%${t}%,numero_protocolo.ilike.%${t}%`);
  }

  const { data, error } = await query.limit(200);
  if (error) {
    console.error('Erro ao listar passagens de plantao:', error);
    throw new Error(error.message);
  }
  return (data || []) as PortPassagemPlantao[];
}

export async function obterPassagemPlantao(id: string): Promise<PortPassagemPlantao | null> {
  const { data, error } = await supabase
    .from('port_passagem_plantao')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    console.error('Erro ao obter passagem de plantao:', error);
    throw new Error(error.message);
  }
  return data as PortPassagemPlantao | null;
}

export async function criarPassagemPlantao(
  dados: Partial<PortPassagemPlantao>
): Promise<PortPassagemPlantao> {
  const dataPlantao = dados.data || hojeISO();
  const turnoSigla = dados.turno ? dados.turno.substring(0, 3) : undefined;
  const payload = {
    numero_protocolo: dados.numero_protocolo || gerarProtocolo('PLT', dataPlantao, turnoSigla),
    codigo_formulario: 'FRM.SGP-0010',
    data: dataPlantao,
    turno: dados.turno || 'DIURNO',
    horario_inicio: dados.horario_inicio || '06:00',
    horario_fim: dados.horario_fim || '18:00',
    vigilante_preenchedor: dados.vigilante_preenchedor || '',
    vigilante_portaria: dados.vigilante_portaria || '',
    vigilante_ronda01: dados.vigilante_ronda01 || null,
    vigilante_ronda02: dados.vigilante_ronda02 || null,
    vigilante_anterior01: dados.vigilante_anterior01 || null,
    vigilante_anterior02: dados.vigilante_anterior02 || null,
    texto_declaracao: dados.texto_declaracao || null,
    itens_conferidos: dados.itens_conferidos || [],
    status: dados.status || 'EM_ANDAMENTO',
    observacoes: dados.observacoes || null,
    criado_por: dados.criado_por || null,
  };

  const { data, error } = await supabase
    .from('port_passagem_plantao')
    .insert(payload)
    .select('*')
    .single();

  if (error) {
    console.error('Erro ao criar passagem de plantao:', error);
    throw new Error(error.message);
  }
  return data as PortPassagemPlantao;
}

export async function atualizarPassagemPlantao(
  id: string,
  dados: Partial<PortPassagemPlantao>
): Promise<PortPassagemPlantao> {
  const { data, error } = await supabase
    .from('port_passagem_plantao')
    .update({
      ...dados,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    console.error('Erro ao atualizar passagem de plantao:', error);
    throw new Error(error.message);
  }
  return data as PortPassagemPlantao;
}

export async function encerrarPassagemPlantao(
  id: string,
  observacoes?: string
): Promise<PortPassagemPlantao> {
  return atualizarPassagemPlantao(id, {
    status: 'CONCLUIDO',
    ...(observacoes ? { observacoes } : {}),
  });
}

export async function excluirPassagemPlantao(id: string, excluidoPor?: string): Promise<void> {
  const { error } = await (supabase as any)
    .from('port_passagem_plantao')
    .update(marcarExcluido(excluidoPor))
    .eq('id', id);

  if (error) {
    console.error('Erro ao excluir passagem de plantao:', error);
    throw new Error(error.message);
  }
}

export async function restaurarPassagemPlantao(id: string): Promise<void> {
  const { error } = await (supabase as any)
    .from('port_passagem_plantao')
    .update(marcarRestaurado())
    .eq('id', id);

  if (error) {
    console.error('Erro ao restaurar passagem de plantao:', error);
    throw new Error(error.message);
  }
}

// =====================================================================
// MÉTRICAS CONSOLIDADAS DO PAINEL DA PORTARIA
// =====================================================================

export interface PortariaMetricas {
  equipamentosNoPatio: number;
  transportesNoPatio: number;
  carretasNoPatio: number;
  relatoriosEmAberto: number;
  plantoesEmAberto: number;
  briefingsHoje: number;
}

export async function obterMetricasPortaria(): Promise<PortariaMetricas> {
  const hoje = hojeISO();

  const [
    { count: eqCount },
    { count: trCount },
    { count: crCount },
    { count: relCount },
    { count: pltCount },
    { count: brfCount },
  ] = await Promise.all([
    supabase.from('port_controle_equipamentos').select('*', { count: 'exact', head: true }).is('excluido_em', null).eq('status', 'NO_PATIO'),
    supabase.from('port_registro_transportes').select('*', { count: 'exact', head: true }).is('excluido_em', null).eq('status', 'NO_PATIO'),
    supabase.from('port_controle_carretas').select('*', { count: 'exact', head: true }).is('excluido_em', null).in('status', ['NO_PATIO', 'DESCARREGANDO']),
    supabase.from('port_relatorio_portaria').select('*', { count: 'exact', head: true }).is('excluido_em', null).eq('status', 'EM_ANDAMENTO'),
    supabase.from('port_passagem_plantao').select('*', { count: 'exact', head: true }).is('excluido_em', null).eq('status', 'EM_ANDAMENTO'),
    supabase.from('port_briefing_participantes').select('*', { count: 'exact', head: true }).is('excluido_em', null).eq('data', hoje),
  ]);

  return {
    equipamentosNoPatio: eqCount || 0,
    transportesNoPatio: trCount || 0,
    carretasNoPatio: crCount || 0,
    relatoriosEmAberto: relCount || 0,
    plantoesEmAberto: pltCount || 0,
    briefingsHoje: brfCount || 0,
  };
}


