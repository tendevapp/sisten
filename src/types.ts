/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// 1. Roles and Permissions
export type Role =
  | 'admin'
  | 'visualizador'
  | 'solicitante'
  | 'gestor'
  | 'comprador'
  | 'coordenador_suprimentos'
  | 'atendente'
  | 'pendente';

export type UserStatus = 'pendente' | 'ativo' | 'inativo';

export interface Sector {
  id: string;
  name: string;
  is_support: boolean;
  helpdesk_enabled: boolean;
}

export interface Profile {
  id: string;
  email: string;
  name: string;
  cargo: string;
  sector_id: string;
  roles: Role[];
  status: UserStatus;
  created_at: string;
  // Número do grupo de compras SAP (ex.: 314, 358) atribuído ao usuário pelo
  // admin, usado para identificar de qual grupo ele é o comprador responsável.
  grupo_compras?: string | null;
}

export interface ActivityLog {
  id: string;
  user_id: string;
  user_name: string;
  email: string;
  module: string;
  action: string;
  details: string;
  created_at: string;
}

export interface UserBuyerGroup {
  id: string;
  user_id: string;
  group_code: string; // E.g., 314, 358, 447, 575, 588, 602
  is_primary: boolean;
}

// 2. Materials
export interface Material {
  id: string;
  material_code: string; // 8 digits
  description: string;
  technical_text?: string;
  category: string;
  company: 'TEN2' | 'AG' | 'AMBAS';
  unit: string; // UN, KG, M, L, M2, etc.
  is_active: boolean;
  created_at: string;
}

export interface MaterialCategory {
  id: string;
  name: string;
  keywords: string[];
}

// 3. Request Engine
export type RequestType = 'compra' | 'cadastro_sap' | 'chamado';

export type RequestStatus =
  | 'rascunho'
  | 'pendente'
  | 'aprovada'
  | 'rejeitada'
  | 'em_revisao'
  | 'aberto'
  | 'em_atendimento'
  | 'aguardando_solicitante'
  | 'resolvido'
  | 'fechado'
  | 'reaberto'
  | 'cancelada';

export interface RequestItem {
  id: string;
  request_id: string;
  description: string;
  sap_code?: string; // Optional, can trigger autocomplete
  has_no_sap_code: boolean;
  quantity: number;
  unit: string;
  brand?: string;
  is_similar_allowed?: boolean;
  suggested_supplier?: string;
  estimated_value: number;
}

export interface RequestAttachment {
  id: string;
  request_id: string;
  name: string;
  url: string; // local simulation URL or base64
  size: number;
  created_at: string;
}

export interface RequestComment {
  id: string;
  request_id: string;
  user_id: string;
  user_name: string;
  user_roles: Role[];
  content: string;
  is_internal: boolean; // Only visible to coordinators/buyers/atendentes
  created_at: string;
}

export interface RequestStatusHistory {
  id: string;
  request_id: string;
  from_status: RequestStatus;
  to_status: RequestStatus;
  user_id: string;
  user_name: string;
  comment?: string;
  created_at: string;
}

export interface Request {
  id: string;
  number: string; // 7 digits, first digit is criticality scale
  type: RequestType;
  status: RequestStatus;
  criticality: number; // 1-5
  solicitante_id: string;
  solicitante_name: string;
  solicitante_sector_id: string;
  created_at: string;
  updated_at: string;
  data_necessidade?: string; // S2
  comprador_id?: string; // S1
  tipo_compra?: 'Estoque' | 'Direta' | 'Serviço'; // S1
  justificativa?: string;
  local?: string; // Specific to Helpdesk
  category_id?: string; // Specific to Helpdesk
  target_sector_id?: string; // Helpdesk sector target or sap registration target
  registration_type?: 'Item' | 'Fornecedor'; // Item vs Fornecedor
  linked_rm_number?: string; // 10-digit RM reference from SAP
  rating?: number; // 1-5 for resolved tickets
  rating_comment?: string;
  atendente_id?: string; // helpdesk/sap cadastro assigned agent
  atendente_name?: string;
  first_response_at?: string;
  resolved_at?: string;
  paused_minutes?: number;
  last_paused_at?: string;
}

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  description: string;
  type: 'info' | 'success' | 'alert' | 'critical';
  is_read: boolean;
  request_id?: string;
  request_number?: string;
  created_at: string;
  // Identificador de contexto genérico (sem FK), para notificações de
  // domínios que não são "requests" — ex.: "rastreio:<ri>" para mensagens
  // do Rastreio Compras. request_id não serve: tem FK para requests(id).
  context_key?: string | null;
}

// Mensagem de conversa de um item de compra (pagina Rastreio Compras).
// Thread identificada por `ri` (requisicao + item).
export interface RastreioMensagem {
  id: string;
  ri: string;
  rm?: string;
  autor_id: string;
  autor_nome: string;
  autor_role?: string;
  mensagem: string;
  created_at: string;
}

// Pedido de priorizacao de um item de compra, na mesma escala de
// criticidade (1-5) usada em Nova Solicitacao. Mantém histórico — o nível
// atual de um item é o registro mais recente por `ri`.
export interface RastreioPrioridade {
  id: string;
  ri: string;
  rm?: string;
  nivel: number; // 1-5
  solicitante_id: string;
  solicitante_nome: string;
  created_at: string;
}

export type ItemStatus =
  | 'Aguardando Cotação'
  | 'Cotação enviada'
  | 'Análise de Cotações'
  | 'Aguardando Aprovação PO'
  | 'Pedido Enviado'
  | 'Aguardando Coleta'
  | 'Em rota de entrega'
  | 'Entregue'
  | 'Inativo'
  | 'Aguardando Solicitante';

// 4. SAP Panel (ME5A and ZL0132 Integration)
export interface SAPRequisicao {
  ri: string; // Unique key: requisicao_de_compra + item_reqc
  requisicao_de_compra: string; // 10 digits
  item_reqc: string; // 5 digits
  material_code: string;
  texto_breve: string;
  qtd_requisicao: number;
  unidade_medida: string;
  grupo_comprador: string; // 314, 358, 447, 575, 588, 602...
  data_solicitacao: string;
  data_remessa: string;
  requisitante_name: string;
  area_solicitante?: string;
  tipo_documento: string; // ZR01, ZR02, ZR03...
  codigo_de_eliminacao: boolean;
  presente_ultima_carga: boolean;
  campos_extras: Record<string, any>;
  
  // Buyer updated operational fields
  obs_comprador?: string;
  data_entrega_prevista?: string;
  obs_updated_at?: string;
  obs_updated_by?: string;
  pedido?: string;
  item_status?: ItemStatus;
  item_status_updated_at?: string;
  item_status_updated_by?: string;
}

export interface EnrichedSAPRecord extends SAPRequisicao {
  documento_compra?: string;
  item_pedido?: string;
  fornecedor_code?: string;
  fornecedor_name?: string;
  data_pedido?: string;
  criado_por_pedido?: string; // login SAP de quem lançou o PO (ex.: ISANTOS) — usado para atribuir "pedido colocado" ao comprador
  data_entrega_sap?: string;
  data_migo?: string | null;
  natureza: string;
  status_requisicao: 'Sem PO' | 'Processado';
  lead_time_compras_meta: number;
  dias_em_aberto: number;
  atraso_comprador: number;
  faixa_atraso: string;
  alerta: string;
  status_atualizado: string;
}


export interface SAPPedido {
  ri: string; // Matches ME5A RI
  documento_compra: string; // PO number (10 digits)
  item_pedido: string;
  fornecedor_code: string;
  fornecedor_name: string;
  data_pedido: string;
  data_entrega_sap: string;
  criado_por_pedido?: string;
  valor_brl?: number;
  preco_liquido?: number;
  campos_extras: Record<string, any>;
}

export interface SAPObsHistory {
  id: string;
  ri: string;
  obs_comprador?: string;
  data_entrega_prevista?: string;
  item_status?: ItemStatus;
  user_name: string;
  created_at: string;
}

export interface CotacaoHistoricoEntry {
  id: string;
  ri: string;
  rm: string;
  cod_forn: string;
  fornecedor_nome: string;
  user_name: string;
  created_at: string;
}

export interface SAPImportLog {
  id: string;
  type: 'ME5A' | 'ZL0132' | 'PEDIDOSFORN' | 'CONTATOS';
  user_name: string;
  filename: string;
  records_read: number;
  records_inserted: number;
  records_updated: number;
  records_unchanged: number;
  records_eliminated: number;
  columns_missing: string[];
  columns_new: string[];
  quantity_changes?: any[];
  missing_ris?: string[];
  ignored_rows?: { row: number; identifier: string; reason: string }[];
  created_at: string;
}

export interface PedidoForn extends SAPPedido {
  id: string;
  material: string;
  txt_breve?: string;
  regiao_uf?: string;
  qtd_pedido?: number;
  preco_liquido_unit?: number;
  valor_liquido?: number;
  // Campos antigos para retrocompatibilidade
  cod_forn?: string;
  cnpj?: string;
  fornecedor?: string;
  preco_liquido?: number;
  created_at: string;
  updated_at?: string;
}

// Linha da view vw_historico_pedidos: já agregada por fornecedor + pedido (CRF = 'x').
export interface HistoricoPedidoView {
  material: string;
  txt_breve?: string;
  cod_forn?: string;
  cnpj?: string;
  fornecedor?: string;
  regiao_uf?: string;
  doc_compra?: string;
  reqc?: string;
  data_doc?: string;
  qtd_pedido?: number;
  valor_liquido?: number;
  preco_liquido_unit?: number;
  // Presentes apenas em vw_historico_fornecedores_sem_po (join com contatos + data_migo do pedido).
  telefone?: string;
  email?: string;
  classificacao?: string;
  nome_fantasia?: string;
  data_migo?: string | null;
}

export interface ContatoFornecedor {
  id: string;
  cod_vendor: string;
  fornecedor?: string;
  nome_contato?: string;
  nome_fantasia?: string;
  telefone?: string;
  email?: string;
  classificacao?: string;
  created_at: string;
  updated_at?: string;
}

export interface FornecedorMaterialRow {
  cod_forn: string;
  cnpj: string;
  fornecedor: string;
  nome_fantasia?: string;
  regiao_uf: string;
  telefone: string;
  email: string;
  classificacao: string;
  ultima_data: string;
  preco_liquido?: number;
  data_migo?: string;
}

export interface MaterialFornecedoresGroup {
  codigo: string;
  descricao?: string;
  encontrado: boolean;
  fornecedores: FornecedorMaterialRow[];
}

