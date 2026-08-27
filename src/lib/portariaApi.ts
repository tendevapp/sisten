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
  PortControleCarreta,
  PortControleEquipamento,
  PortEquipamentoStatus,
  PortRegistroTransporte,
  PortRelatorioOcorrencia,
  PortRelatorioPortaria,
  PortRelatorioStatus,
  PortTransporteStatus,
  PortTurno,
  PortVigilante,
} from '../types';

export function gerarProtocolo(prefixo: string): string {
  const ano = new Date().getFullYear();
  const sufixo = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `${prefixo}-${ano}-${sufixo}`;
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
}): Promise<PortControleEquipamento[]> {
  let query = supabase
    .from('port_controle_equipamentos')
    .select('*')
    .order('data_entrada', { ascending: false })
    .order('created_at', { ascending: false });

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
  const payload = {
    codigo_formulario: 'FRM.SGP-0011',
    numero_protocolo: dados.numero_protocolo || gerarProtocolo('EQP'),
    data_entrada: dados.data_entrada || hojeISO(),
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

export async function excluirEquipamento(id: string): Promise<void> {
  const { error } = await supabase.from('port_controle_equipamentos').delete().eq('id', id);
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
}): Promise<PortRegistroTransporte[]> {
  let query = supabase
    .from('port_registro_transportes')
    .select('*')
    .order('data', { ascending: false })
    .order('hora_chegada', { ascending: false });

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

export async function criarTransporte(dados: Partial<PortRegistroTransporte>): Promise<PortRegistroTransporte> {
  const payload = {
    codigo_formulario: 'FRM.SGP-0009',
    numero_protocolo: dados.numero_protocolo || gerarProtocolo('TRP'),
    data: dados.data || hojeISO(),
    turno: dados.turno || sugerirTurno(),
    vigilante: dados.vigilante || '',
    veiculo: dados.veiculo || 'Van',
    placa: dados.placa ? dados.placa.toUpperCase().trim() : '',
    empresa: dados.empresa || '',
    hora_chegada: dados.hora_chegada || horaAgora(),
    hora_saida: dados.hora_saida || null,
    motorista: dados.motorista || '',
    ocupacao: dados.ocupacao || null,
    observacoes: dados.observacoes || null,
    status: dados.status || 'NO_PATIO',
    criado_por: dados.criado_por || null,
  };

  const { data, error } = await supabase
    .from('port_registro_transportes')
    .insert(payload)
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return data as PortRegistroTransporte;
}

export async function atualizarTransporte(id: string, dados: Partial<PortRegistroTransporte>): Promise<PortRegistroTransporte> {
  const { data, error } = await supabase
    .from('port_registro_transportes')
    .update({ ...dados, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return data as PortRegistroTransporte;
}

export async function registrarSaidaTransporte(id: string, hora_saida?: string): Promise<PortRegistroTransporte> {
  return atualizarTransporte(id, {
    status: 'FINALIZADO',
    hora_saida: hora_saida || horaAgora(),
  });
}

export async function excluirTransporte(id: string): Promise<void> {
  const { error } = await supabase.from('port_registro_transportes').delete().eq('id', id);
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
}): Promise<PortControleCarreta[]> {
  let query = supabase
    .from('port_controle_carretas')
    .select('*')
    .order('data_entrada', { ascending: false })
    .order('hora_entrada', { ascending: false });

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
  const payload = {
    codigo_formulario: 'FRM.SGP-0020',
    numero_protocolo: dados.numero_protocolo || gerarProtocolo('CRT'),
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

export async function excluirCarreta(id: string): Promise<void> {
  const { error } = await supabase.from('port_controle_carretas').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// =====================================================================
// 4. RELATÓRIO DE PORTARIA E OCORRÊNCIAS (FRM.SGP-0010)
// =====================================================================

export async function listarRelatorios(filtros?: {
  status?: PortRelatorioStatus | 'TODOS';
  turno?: PortTurno | 'TODOS';
  dataInicio?: string;
  dataFim?: string;
}): Promise<PortRelatorioPortaria[]> {
  let query = supabase
    .from('port_relatorio_portaria')
    .select(`
      *,
      ocorrencias:port_relatorio_ocorrencias (id, horario, local_setor, descricao, severidade, vigilante, created_at)
    `)
    .order('data', { ascending: false })
    .order('created_at', { ascending: false });

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
    ocorrencias: (r.ocorrencias || []).sort((a: any, b: any) => a.horario.localeCompare(b.horario)),
  })) as PortRelatorioPortaria[];
}

export async function obterRelatorio(id: string): Promise<PortRelatorioPortaria | null> {
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
    ocorrencias: (data.ocorrencias || []).sort((a: any, b: any) => a.horario.localeCompare(b.horario)),
  } as PortRelatorioPortaria;
}

export async function criarRelatorio(dados: Partial<PortRelatorioPortaria>): Promise<PortRelatorioPortaria> {
  const payload = {
    codigo_formulario: 'FRM.SGP-0010',
    numero_protocolo: dados.numero_protocolo || gerarProtocolo('REL'),
    data: dados.data || hojeISO(),
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
  return data as PortRelatorioOcorrencia;
}

export async function excluirOcorrencia(id: string): Promise<void> {
  const { error } = await supabase.from('port_relatorio_ocorrencias').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function encerrarRelatorio(id: string, observacoes_gerais?: string): Promise<PortRelatorioPortaria> {
  return atualizarRelatorio(id, {
    status: 'CONCLUIDO',
    ...(observacoes_gerais ? { observacoes_gerais } : {}),
  });
}

export async function excluirRelatorio(id: string): Promise<void> {
  const { error } = await supabase.from('port_relatorio_portaria').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// =====================================================================
// 5. BRIEFING DE SEGURANÇA & LISTA DE PRESENÇA (FRM.SGP-0013)
// =====================================================================

export async function listarSessoesBriefing(filtros?: {
  status?: PortBriefingStatus | 'TODOS';
  tipo?: PortBriefingTipo | 'TODOS';
  dataInicio?: string;
  dataFim?: string;
}): Promise<PortBriefingSessao[]> {
  let query = supabase
    .from('port_briefing_sessoes')
    .select(`
      *,
      participantes:port_briefing_participantes (*)
    `)
    .order('data', { ascending: false })
    .order('created_at', { ascending: false });

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

  return (data || []) as PortBriefingSessao[];
}

export async function obterSessaoBriefing(id: string): Promise<PortBriefingSessao | null> {
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

  return data as PortBriefingSessao;
}

export async function criarSessaoBriefing(dados: Partial<PortBriefingSessao>): Promise<PortBriefingSessao> {
  const payload = {
    codigo_formulario: 'FRM.SGP-0013',
    numero_protocolo: dados.numero_protocolo || gerarProtocolo('BRF'),
    tema_treinamento: dados.tema_treinamento || 'BRIEFING DE SEGURANÇA',
    tipo: dados.tipo || 'INTERNO',
    data: dados.data || hojeISO(),
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

export async function removerParticipanteBriefing(id: string): Promise<void> {
  const { error } = await supabase.from('port_briefing_participantes').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function buscarBriefingValidoPorCpf(cpfLimpo: string): Promise<PortBriefingParticipante | null> {
  const cpf = cpfLimpo.replace(/\D/g, '');
  if (!cpf) return null;

  const { data, error } = await supabase
    .from('port_briefing_participantes')
    .select('*')
    .eq('cpf', cpf)
    .order('data', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  return data as PortBriefingParticipante;
}

export async function excluirSessaoBriefing(id: string): Promise<void> {
  const { error } = await supabase.from('port_briefing_sessoes').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// =====================================================================
// CADASTRO DE VIGILANTES DA PORTARIA
// =====================================================================

export async function listarVigilantes(apenasAtivos: boolean = false): Promise<PortVigilante[]> {
  let query = supabase
    .from('port_vigilantes')
    .select('*')
    .order('nome', { ascending: true });

  if (apenasAtivos) {
    query = query.eq('ativo', true);
  }

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

export async function excluirVigilante(id: string): Promise<void> {
  const { error } = await supabase
    .from('port_vigilantes')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Erro ao excluir vigilante:', error);
    throw error;
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
  briefingsHoje: number;
}

export async function obterMetricasPortaria(): Promise<PortariaMetricas> {
  const hoje = hojeISO();

  const [
    { count: eqCount },
    { count: trCount },
    { count: crCount },
    { count: relCount },
    { count: brfCount },
  ] = await Promise.all([
    supabase.from('port_controle_equipamentos').select('*', { count: 'exact', head: true }).eq('status', 'NO_PATIO'),
    supabase.from('port_registro_transportes').select('*', { count: 'exact', head: true }).eq('status', 'NO_PATIO'),
    supabase.from('port_controle_carretas').select('*', { count: 'exact', head: true }).in('status', ['NO_PATIO', 'DESCARREGANDO']),
    supabase.from('port_relatorio_portaria').select('*', { count: 'exact', head: true }).eq('status', 'EM_ANDAMENTO'),
    supabase.from('port_briefing_participantes').select('*', { count: 'exact', head: true }).eq('data', hoje),
  ]);

  return {
    equipamentosNoPatio: eqCount || 0,
    transportesNoPatio: trCount || 0,
    carretasNoPatio: crCount || 0,
    relatoriosEmAberto: relCount || 0,
    briefingsHoje: brfCount || 0,
  };
}

