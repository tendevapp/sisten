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
  group_code: string; // E.g., 314, 358, 447, 575, 588
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
}

// 4. SAP Panel (ME5A and ZL0132 Integration)
export interface SAPRequisicao {
  ri: string; // Unique key: requisicao_de_compra + item_reqc
  requisicao_de_compra: string; // 10 digits
  item_reqc: string; // 5 digits
  material_code: string;
  texto_breve: string;
  qtd_requisicao: number;
  unidade_medida: string;
  grupo_comprador: string; // 314, 358, 447, 575, 588...
  data_solicitacao: string;
  data_remessa: string;
  requisitante_name: string;
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
}

export interface EnrichedSAPRecord extends SAPRequisicao {
  documento_compra?: string;
  item_pedido?: string;
  fornecedor_code?: string;
  fornecedor_name?: string;
  data_pedido?: string;
  data_entrega_sap?: string;
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
  valor_brl?: number;
  preco_liquido?: number;
  campos_extras: Record<string, any>;
}

export interface SAPObsHistory {
  id: string;
  ri: string;
  obs_comprador?: string;
  data_entrega_prevista?: string;
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

export interface PedidoForn {
  id: string;
  material: string;
  txt_breve?: string;
  cod_forn?: string;
  cnpj?: string;
  fornecedor?: string;
  regiao_uf?: string;
  data_pedido?: string;
  created_at: string;
  updated_at?: string;
}

export interface ContatoFornecedor {
  id: string;
  cod_vendor: string;
  fornecedor?: string;
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
  regiao_uf: string;
  telefone: string;
  email: string;
  classificacao: string;
  ultima_data: string;
}

export interface MaterialFornecedoresGroup {
  codigo: string;
  descricao?: string;
  encontrado: boolean;
  fornecedores: FornecedorMaterialRow[];
}

