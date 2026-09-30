import { supabase } from '../db/supabaseClient';
import type {
  ControleEstoqueAuditoria,
  ControleEstoqueConfig,
  ControleEstoqueDeposito,
  ControleEstoqueItem,
  ControleEstoqueMovimentoMensal,
  ControleEstoqueOpcaoTorre,
  ControleEstoqueOverride,
  ControleEstoquePedido,
  ControleEstoqueRm,
  Profile,
} from '../types';
import { calcularFaixaDoItem, type StatusControleEstoque } from './controleEstoque';
import { casarTokens, extrairPalavrasChave } from './buscaKeywords';

type UsuarioAutor = Pick<Profile, 'id'>;

export interface FiltrosControleEstoque {
  busca?: string;
  centro?: string;
  deposito?: string;
  categoria?: string;
  aplicacao?: string;
  tipoGestao?: string;
  status?: StatusControleEstoque;
  temRm?: boolean;
  temPo?: boolean;
  recebimento?: 'COM_RECEBIMENTO' | 'SEM_RECEBIMENTO';
  projeto?: string;
  pagina?: number;
  itensPorPagina?: number;
}

export interface ControleEstoqueConfigInput {
  id?: string;
  centro: string;
  janela_inicio: string;
  janela_fim: string | null;
  lead_time_padrao_dias: number;
  intervalo_compra_dias: number;
}

export interface ControleEstoqueOverrideInput {
  id?: string;
  material: string;
  centro: string;
  tipo_gestao: string | null;
  lead_time_dias: number | null;
  intervalo_compra_dias: number | null;
  estoque_minimo: number | null;
  estoque_maximo: number | null;
  quantidade_por_torre: number | null;
  justificativa: string;
}

const numero = (valor: unknown, padrao = 0): number => {
  if (valor === null || valor === undefined || valor === '') return padrao;
  const convertido = Number(valor);
  return Number.isFinite(convertido) ? convertido : padrao;
};

const numeroOuNull = (valor: unknown): number | null => {
  if (valor === null || valor === undefined || valor === '') return null;
  const convertido = Number(valor);
  return Number.isFinite(convertido) ? convertido : null;
};

const lista = <T>(valor: unknown): T[] => Array.isArray(valor) ? valor as T[] : [];

const normalizarDepositos = (valor: unknown): ControleEstoqueDeposito[] => lista<Record<string, unknown>>(valor).map(item => ({
  deposito: typeof item.deposito === 'string' ? item.deposito : null,
  saldo: numero(item.saldo),
  valor: numero(item.valor),
  preco_medio_sap: numeroOuNull(item.preco_medio_sap),
  inativo: item.inativo === true,
}));

const normalizarMovimentos = (valor: unknown): ControleEstoqueMovimentoMensal[] => lista<Record<string, unknown>>(valor).map(item => ({
  mes: String(item.mes ?? ''),
  entrada: numero(item.entrada),
  consumo: numero(item.consumo),
  valor_entrada: numero(item.valor_entrada),
  valor_consumo: numero(item.valor_consumo),
}));

const normalizarRms = (valor: unknown): ControleEstoqueRm[] => lista<Record<string, unknown>>(valor).map(item => ({
  ri: item.ri == null ? null : String(item.ri),
  requisicao: item.requisicao == null ? null : String(item.requisicao),
  item: item.item == null ? null : String(item.item),
  data: item.data == null ? null : String(item.data),
  requisitante: item.requisitante == null ? null : String(item.requisitante),
  quantidade: numeroOuNull(item.quantidade),
  pedido: item.pedido == null ? null : String(item.pedido),
  deposito: item.deposito == null ? null : String(item.deposito),
}));

const normalizarPedidos = (valor: unknown): ControleEstoquePedido[] => lista<Record<string, unknown>>(valor).map(item => ({
  ri: item.ri == null ? null : String(item.ri),
  requisicao: item.requisicao == null ? null : String(item.requisicao),
  pedido: item.pedido == null ? null : String(item.pedido),
  item: item.item == null ? null : String(item.item),
  data: item.data == null ? null : String(item.data),
  remessa_prevista: item.remessa_prevista == null ? null : String(item.remessa_prevista),
  data_migo: item.data_migo == null ? null : String(item.data_migo),
  fornecedor: item.fornecedor == null ? null : String(item.fornecedor),
  deposito: item.deposito == null ? null : String(item.deposito),
  quantidade_pedida: numeroOuNull(item.quantidade_pedida),
  quantidade_fornecida: numeroOuNull(item.quantidade_fornecida),
  quantidade_pendente: numero(item.quantidade_pendente),
  valor_brl: numeroOuNull(item.valor_brl),
  quantidade_recebida_mb51: numeroOuNull(item.quantidade_recebida_mb51),
  ultima_data_recebimento: item.ultima_data_recebimento == null ? null : String(item.ultima_data_recebimento),
}));

const normalizarOpcoesTorre = (valor: unknown): ControleEstoqueOpcaoTorre[] => lista<Record<string, unknown>>(valor).map(item => ({
  projeto: item.projeto == null ? null : String(item.projeto),
  quantidade_por_torre: numero(item.quantidade_por_torre),
}));

export function normalizarLinhaControleEstoque(row: Record<string, unknown>): ControleEstoqueItem {
  return {
    material: String(row.material ?? ''),
    centro: String(row.centro ?? ''),
    descricao: row.descricao == null ? null : String(row.descricao),
    categoria: row.categoria == null ? null : String(row.categoria),
    aplicacao: row.aplicacao == null ? null : String(row.aplicacao),
    tipo_material: row.tipo_material == null ? null : String(row.tipo_material),
    tipo_gestao: row.tipo_gestao == null ? null : String(row.tipo_gestao),
    umb: row.umb == null ? null : String(row.umb),
    curva_abc: row.curva_abc == null ? null : String(row.curva_abc),
    saldo_total: numero(row.saldo_total),
    saldo_reposicao: numero(row.saldo_reposicao),
    valor_estoque: numero(row.valor_estoque),
    preco_medio_sap: numeroOuNull(row.preco_medio_sap),
    quantidade_depositos: numero(row.quantidade_depositos),
    depositos: normalizarDepositos(row.depositos),
    janela_inicio: row.janela_inicio == null ? null : String(row.janela_inicio),
    janela_fim: row.janela_fim == null ? null : String(row.janela_fim),
    dias_uteis: numeroOuNull(row.dias_uteis),
    lead_time_dias: numeroOuNull(row.lead_time_dias),
    intervalo_compra_dias: numeroOuNull(row.intervalo_compra_dias),
    entrada_quantidade: numero(row.entrada_quantidade),
    entrada_valor: numero(row.entrada_valor),
    baixa_direta_quantidade: numero(row.baixa_direta_quantidade),
    baixa_direta_valor: numero(row.baixa_direta_valor),
    producao_quantidade: numero(row.producao_quantidade),
    producao_valor: numero(row.producao_valor),
    consumo_total: numero(row.consumo_total),
    consumo_valor: numero(row.consumo_valor),
    movimentos_mensais: normalizarMovimentos(row.movimentos_mensais),
    rms_abertas: numero(row.rms_abertas),
    rm_quantidade: numero(row.rm_quantidade),
    rms: normalizarRms(row.rms),
    pos_abertas: numero(row.pos_abertas),
    po_quantidade_pendente: numero(row.po_quantidade_pendente),
    quantidade_recebida: numero(row.quantidade_recebida),
    ultima_data_recebimento: row.ultima_data_recebimento == null ? null : String(row.ultima_data_recebimento),
    pedidos: normalizarPedidos(row.pedidos),
    quantidade_por_torre: numeroOuNull(row.quantidade_por_torre),
    quantidade_projetos: numero(row.quantidade_projetos),
    opcoes_quantidade_por_torre: normalizarOpcoesTorre(row.opcoes_quantidade_por_torre),
    estoque_minimo_override: numeroOuNull(row.estoque_minimo_override),
    estoque_maximo_override: numeroOuNull(row.estoque_maximo_override),
    override_id: row.override_id == null ? null : String(row.override_id),
    override_justificativa: row.override_justificativa == null ? null : String(row.override_justificativa),
    override_updated_at: row.override_updated_at == null ? null : String(row.override_updated_at),
    override_updated_by: row.override_updated_by == null ? null : String(row.override_updated_by),
    tem_override: row.tem_override === true,
    sisten_janela_inicio: row.sisten_janela_inicio == null ? null : String(row.sisten_janela_inicio),
    sisten_janela_fim: row.sisten_janela_fim == null ? null : String(row.sisten_janela_fim),
    sisten_consumo_total: numeroOuNull(row.sisten_consumo_total),
    sisten_consumo_diario: numeroOuNull(row.sisten_consumo_diario),
    sisten_lote_p90: numeroOuNull(row.sisten_lote_p90),
    sisten_adi: numeroOuNull(row.sisten_adi),
    sisten_cv2: numeroOuNull(row.sisten_cv2),
    sisten_lead_dias: numeroOuNull(row.sisten_lead_dias),
    sisten_lead_proprio: row.sisten_lead_proprio == null ? null : row.sisten_lead_proprio === true,
    estoque_importado_em: row.estoque_importado_em == null ? null : String(row.estoque_importado_em),
    movimentos_importados_em: row.movimentos_importados_em == null ? null : String(row.movimentos_importados_em),
    ultimo_movimento: row.ultimo_movimento == null ? null : String(row.ultimo_movimento),
    config_id: row.config_id == null ? null : String(row.config_id),
    config_updated_at: row.config_updated_at == null ? null : String(row.config_updated_at),
  };
}

export function criarPayloadConfigControleEstoque(input: ControleEstoqueConfigInput, user: UsuarioAutor) {
  return {
    centro: input.centro.trim(),
    janela_inicio: input.janela_inicio,
    janela_fim: input.janela_fim || null,
    lead_time_padrao_dias: input.lead_time_padrao_dias,
    intervalo_compra_dias: input.intervalo_compra_dias,
    ativo: true,
    updated_by: user.id,
  };
}

export function validarConfigControleEstoque(input: ControleEstoqueConfigInput): void {
  if (!input.centro.trim()) throw new Error('Informe o centro.');
  if (!input.janela_inicio) throw new Error('Informe o início da janela.');
  if (input.janela_fim && input.janela_fim < input.janela_inicio) {
    throw new Error('O fim da janela não pode ser anterior ao início.');
  }
  if (input.lead_time_padrao_dias < 0) throw new Error('Lead time não pode ser negativo.');
  if (input.intervalo_compra_dias < 0) throw new Error('Intervalo de compra não pode ser negativo.');
}

export function criarPayloadOverrideControleEstoque(input: ControleEstoqueOverrideInput, user: UsuarioAutor) {
  return {
    material: input.material.trim(),
    centro: input.centro.trim(),
    tipo_gestao: input.tipo_gestao?.trim() || null,
    lead_time_dias: input.lead_time_dias,
    intervalo_compra_dias: input.intervalo_compra_dias,
    estoque_minimo: input.estoque_minimo,
    estoque_maximo: input.estoque_maximo,
    quantidade_por_torre: input.quantidade_por_torre,
    justificativa: input.justificativa.trim(),
    ativo: true,
    updated_by: user.id,
  };
}

export function validarOverrideControleEstoque(input: ControleEstoqueOverrideInput): void {
  if (!input.material.trim()) throw new Error('Informe o material.');
  if (!input.centro.trim()) throw new Error('Informe o centro.');
  if ((input.lead_time_dias ?? 0) < 0) throw new Error('Lead time não pode ser negativo.');
  if ((input.intervalo_compra_dias ?? 0) < 0) throw new Error('Intervalo de compra não pode ser negativo.');
  if ((input.estoque_minimo ?? 0) < 0) throw new Error('Estoque mínimo não pode ser negativo.');
  if ((input.estoque_maximo ?? 0) < 0) throw new Error('Estoque máximo não pode ser negativo.');
  if (input.estoque_minimo !== null && input.estoque_maximo !== null && input.estoque_maximo < input.estoque_minimo) {
    throw new Error('Estoque máximo não pode ser menor que o mínimo.');
  }
  if (input.quantidade_por_torre !== null && input.quantidade_por_torre <= 0) {
    throw new Error('Quantidade por torre deve ser maior que zero.');
  }
  if (input.justificativa.trim().length < 5) {
    throw new Error('Informe uma justificativa com pelo menos 5 caracteres.');
  }
}

export function criarPayloadInativacaoOverride(user: UsuarioAutor) {
  return { ativo: false, updated_by: user.id };
}

/**
 * Aplica todos os filtros sobre linhas já carregadas. A tela carrega a view uma
 * vez e filtra em memória; KPIs, gráficos, tabela e exportação usam o mesmo
 * resultado.
 */
export function filtrarControleEstoque(itens: ControleEstoqueItem[], filtros: FiltrosControleEstoque): ControleEstoqueItem[] {
  // Palavras-chave em qualquer ordem, sem acento, com "frases" entre aspas.
  const tokens = extrairPalavrasChave(filtros.busca);
  return itens.filter(item => {
    if (tokens.length > 0 && !casarTokens([item.material, item.descricao, item.categoria, item.aplicacao], tokens)) return false;
    if (filtros.centro && item.centro !== filtros.centro) return false;
    if (filtros.categoria && item.categoria !== filtros.categoria) return false;
    if (filtros.aplicacao && item.aplicacao !== filtros.aplicacao) return false;
    if (filtros.tipoGestao && item.tipo_gestao !== filtros.tipoGestao) return false;
    if (filtros.temRm === true && item.rms_abertas <= 0) return false;
    if (filtros.temRm === false && item.rms_abertas > 0) return false;
    if (filtros.temPo === true && item.pos_abertas <= 0) return false;
    if (filtros.temPo === false && item.pos_abertas > 0) return false;
    if (filtros.recebimento === 'COM_RECEBIMENTO' && item.quantidade_recebida <= 0) return false;
    if (filtros.recebimento === 'SEM_RECEBIMENTO' && item.quantidade_recebida > 0) return false;
    if (filtros.deposito && !item.depositos.some(dep => dep.deposito === filtros.deposito)) return false;
    if (filtros.projeto && !item.opcoes_quantidade_por_torre.some(opcao => opcao.projeto === filtros.projeto)) return false;
    if (filtros.status && calcularFaixaDoItem(item).status !== filtros.status) return false;
    return true;
  });
}

export async function listarControleEstoque(filtros: FiltrosControleEstoque = {}): Promise<{
  itens: ControleEstoqueItem[];
  total: number;
}> {
  const tamanhoLote = 1000;
  const linhas: Record<string, unknown>[] = [];

  for (let lote = 0; lote < 20; lote += 1) {
    let query: any = (supabase as any)
      .from('vw_almox_controle_estoque')
      .select('*')
      .order('material', { ascending: true });

    if (filtros.centro) query = query.eq('centro', filtros.centro);
    if (filtros.categoria) query = query.eq('categoria', filtros.categoria);
    if (filtros.aplicacao) query = query.eq('aplicacao', filtros.aplicacao);
    if (filtros.tipoGestao) query = query.eq('tipo_gestao', filtros.tipoGestao);
    if (filtros.temRm === true) query = query.gt('rms_abertas', 0);
    if (filtros.temRm === false) query = query.eq('rms_abertas', 0);
    if (filtros.temPo === true) query = query.gt('pos_abertas', 0);
    if (filtros.temPo === false) query = query.eq('pos_abertas', 0);
    if (filtros.recebimento === 'COM_RECEBIMENTO') query = query.gt('quantidade_recebida', 0);
    if (filtros.recebimento === 'SEM_RECEBIMENTO') query = query.eq('quantidade_recebida', 0);

    const inicio = lote * tamanhoLote;
    const { data, error } = await query.range(inicio, inicio + tamanhoLote - 1);
    if (error) throw new Error(error.message || 'Falha ao carregar o controle de estoque.');
    const pagina = (data ?? []) as Record<string, unknown>[];
    linhas.push(...pagina);
    if (pagina.length < tamanhoLote) break;
  }

  const filtrados = filtrarControleEstoque(linhas.map(normalizarLinhaControleEstoque), filtros);
  const total = filtrados.length;
  if (!filtros.itensPorPagina) return { itens: filtrados, total };
  const pagina = Math.max(1, filtros.pagina ?? 1);
  const inicio = (pagina - 1) * filtros.itensPorPagina;
  return { itens: filtrados.slice(inicio, inicio + filtros.itensPorPagina), total };
}

export async function listarConfigsControleEstoque(): Promise<ControleEstoqueConfig[]> {
  const { data, error } = await (supabase as any)
    .from('almox_controle_estoque_config')
    .select('*')
    .eq('ativo', true)
    .order('centro');
  if (error) throw new Error(error.message || 'Falha ao carregar os parâmetros do controle de estoque.');
  return (data ?? []) as ControleEstoqueConfig[];
}

export async function salvarConfigControleEstoque(
  input: ControleEstoqueConfigInput,
  user: UsuarioAutor,
): Promise<ControleEstoqueConfig> {
  validarConfigControleEstoque(input);
  const payload = criarPayloadConfigControleEstoque(input, user);
  let id = input.id;
  if (!id) {
    const { data, error } = await (supabase as any)
      .from('almox_controle_estoque_config')
      .select('id')
      .eq('centro', payload.centro)
      .eq('ativo', true)
      .maybeSingle();
    if (error) throw new Error(error.message || 'Falha ao localizar a configuração ativa.');
    id = data?.id;
  }

  const resultado = id
    ? await (supabase as any).from('almox_controle_estoque_config').update(payload).eq('id', id).select().single()
    : await (supabase as any).from('almox_controle_estoque_config').insert({
      ...payload,
      created_by: user.id,
    }).select().single();
  if (resultado.error) throw new Error(resultado.error.message || 'Falha ao salvar os parâmetros.');
  return resultado.data as ControleEstoqueConfig;
}

export async function salvarOverrideControleEstoque(
  input: ControleEstoqueOverrideInput,
  user: UsuarioAutor,
): Promise<ControleEstoqueOverride> {
  validarOverrideControleEstoque(input);
  const payload = criarPayloadOverrideControleEstoque(input, user);
  let id = input.id;
  if (!id) {
    const { data, error } = await (supabase as any)
      .from('almox_controle_estoque_override')
      .select('id')
      .eq('material', payload.material)
      .eq('centro', payload.centro)
      .eq('ativo', true)
      .maybeSingle();
    if (error) throw new Error(error.message || 'Falha ao localizar o override ativo.');
    id = data?.id;
  }

  const resultado = id
    ? await (supabase as any).from('almox_controle_estoque_override').update(payload).eq('id', id).select().single()
    : await (supabase as any).from('almox_controle_estoque_override').insert({
      ...payload,
      created_by: user.id,
    }).select().single();
  if (resultado.error) throw new Error(resultado.error.message || 'Falha ao salvar o override.');
  return resultado.data as ControleEstoqueOverride;
}

export async function inativarOverrideControleEstoque(id: string, user: UsuarioAutor): Promise<void> {
  const { error } = await (supabase as any)
    .from('almox_controle_estoque_override')
    .update(criarPayloadInativacaoOverride(user))
    .eq('id', id);
  if (error) throw new Error(error.message || 'Falha ao inativar o override.');
}

export async function listarAuditoriaControleEstoque(
  registroId: string,
  limite = 20,
): Promise<ControleEstoqueAuditoria[]> {
  const { data, error } = await (supabase as any)
    .from('almox_controle_estoque_auditoria')
    .select('*')
    .eq('registro_id', registroId)
    .order('alterado_em', { ascending: false })
    .limit(limite);
  if (error) throw new Error(error.message || 'Falha ao carregar o histórico de alterações.');
  return (data ?? []) as ControleEstoqueAuditoria[];
}
