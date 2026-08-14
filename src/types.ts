/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// 1. Roles and Permissions
export type Role =
  | 'admin'
  | 'visualizador'
  | 'solicitante'
  // Opera a fila coletiva: vê e responde todas as solicitações abertas, não só
  // as próprias — é o que o separa de `solicitante`.
  | 'requisitante'
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
  /**
   * Código de quatro letras da área no SAP (`ALMO`, `MANU`…), usado para
   * cruzar com `vw_demandas.area_solicitante` e dizer "sua área já pediu
   * este item". Nulo nos setores cuja correspondência não foi confirmada, e
   * em 31% das RMs a própria área vem vazia — por isso o sinal só aparece
   * quando há dado, e nunca como "0x".
   */
  sap_area_code?: string;
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
  // Override de acesso a páginas/feature flags por usuário, definido pelo
  // admin em "Módulos de acesso". Só chaves desviadas do padrão do perfil
  // aparecem aqui — chave ausente = segue o defaultRoles da página.
  page_access?: Record<string, boolean>;
  // Setores solicitantes (Sector.id) que este usuário pode aprovar
  // solicitações de compra, definido pelo admin na coluna "Aprovador" de
  // Gestão de Usuários. É a única regra que decide quem vê/aprova cada
  // solicitação em Approvals — admin e coordenador_suprimentos continuam
  // aprovando tudo independente desta lista.
  aprovador_setores?: string[];
  // Marca se este usuário deve ser notificado de novas solicitações de
  // Cadastro SAP, definido no mesmo modal de "Aprovador". Aditivo: soma com
  // a notificação automática por role (coordenador_suprimentos/comprador),
  // não a substitui.
  aprovador_cadastro_sap?: boolean;
  // Dicionário de tours guiados já vistos pelo usuário (ex.: { 'nova-solicitacao': true }),
  // persistido no Supabase para não reabrir o tour quando o cache do navegador for limpo.
  tours_seen?: Record<string, boolean>;
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
  group_code: string; // E.g., 314, 358, 447, 575, 588, 602, 610
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
  tipo_material?: string;
  codigo_controle?: string;
  status_geral?: string;
  status_centro?: string;
  status_sap?: 'Ativo' | 'Obsoleto';
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
  is_generic?: boolean;
  observation?: string;
  reference_link?: string;
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
  // Preenchido nos anexos de item de compra; nulo no Cadastro SAP, que não tem
  // itens. Ver documentos/superpowers/specs/2026-07-28-anexos-imagens-design.md
  request_item_id?: string;
  name: string;
  url: string; // caminho no bucket (mesmo valor de storage_path)
  storage_path?: string;
  mime_type?: string;
  size: number; // tamanho após a compressão — é o que trafega
  size_original?: number; // tamanho do arquivo escolhido, para exibir a economia
  uploaded_by?: string;
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
  // Cadastro SAP (Item): fabricante do material. Cadastro SAP (Fornecedor):
  // CNPJ ou site corporativo — o form reaproveita o mesmo campo pros dois.
  brand?: string;
  // Cadastro SAP (Item): fornecedor de referência sugerido. (Fornecedor):
  // representante/contato em texto livre, quando não há campos estruturados.
  suggested_supplier?: string;
  linked_rm_number?: string; // 10-digit RM reference from SAP
  rating?: number; // 1-5 for resolved tickets
  rating_comment?: string;
  atendente_id?: string; // helpdesk/sap cadastro assigned agent
  atendente_name?: string;
  first_response_at?: string;
  resolved_at?: string;
  paused_minutes?: number;
  last_paused_at?: string;
  representante_nome?: string;
  representante_cargo?: string;
  representante_telefone?: string;
  representante_email?: string;
  // Específicos do chamado com destino Jurídico (ver lib/juridico.ts). Nulos
  // em todo o resto — não vale a pena uma tabela própria para 2 campos de um
  // único destino de chamado.
  contrato_tipo?: string;
  fornecedor_terceiro?: string;
  // Prazo de conclusão definido manualmente no quadro Kanban (Contratos >
  // Demandas). Genérico em `requests`, nulo em todo o resto.
  prazo_conclusao?: string | null;
  // Título curto e editável, mostrado no card do Kanban. Opcional na criação;
  // sem ele o card cai para `category_id` como rótulo.
  titulo?: string | null;
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
  grupo_comprador: string; // 314, 358, 447, 575, 588, 602, 610...
  /**
   * Grupo de mercadoria do SAP (prefixos B/E/M/S, ex.: `M08018002`). Vem da
   * view e chega ao registro pelo spread de `normalizeRequisicaoRow`; a
   * descrição legível sai de `cadastro_grupo_mercadoria`.
   */
  grupo_de_mercadorias?: string;
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
  // Preço do pedido, presente só em itens já processados (com PO). Vem do
  // pedido casado por `ri` (view_enriched_pedidos): preco_unitario = preço
  // líquido unitário; valor_total = valor líquido da linha em BRL.
  preco_unitario?: number;
  valor_total?: number;
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
  por?: string; // "Por" (Preiseinheit) do SAP: base de preço. Unitário = preco_liquido / por (vazio = 1).
  eflag_e?: string;
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
  type: 'ME5A' | 'ZL0132' | 'PEDIDOSFORN' | 'CONTATOS' | 'ZL0024' | 'ME3N' | 'ME3M' | 'FBL1N';
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
  // Contagens (colunas geradas no banco) usadas quando o sync geral traz o log
  // sem `ignored_rows`/`missing_ris` — ver localDb.syncImportLogs.
  ignored_rows_count?: number;
  missing_ris_count?: number;
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
  /** Grupo de mercadoria do SAP (prefixos B/E/M/S, ex.: `B0101`). */
  grp_mercads?: string;
  /** Descrição amigável do grupo de mercadoria (da tabela cadastro_grupo_mercadoria, ex.: `EPI`, `TORRES/COLUNAS`). */
  grp_mercads_desc?: string;
  /**
   * Natureza do item, derivada do padrão do código de material: os de projeto
   * usam a faixa de 18 dígitos iniciada em 100000000; os demais são consumo.
   */
  tipo_item?: 'Projeto' | 'Consumo';
  doc_compra?: string;
  reqc?: string;
  data_doc?: string;
  qtd_pedido?: number;
  /** Quantidade já entregue (SAP). Base de `pedido_parcial`. */
  qtd_fornecida?: number;
  /**
   * true quando 0 < qtd_fornecida < qtd_pedido: a entrega ainda não fechou,
   * então valor e quantidade da linha podem mudar. A view inclui esses
   * pedidos (não só os com `crf='x'`, que o SAP só marca na entrega 100%) —
   * ver docs/superpowers/specs/2026-08-08-auditoria-precos-ipca-design.md.
   */
  pedido_parcial?: boolean;
  /**
   * Valor líquido do item **em BRL**. A view soma `pedidosforn.valor_em_brl`,
   * não `valor_liquido` — este último está na moeda original do pedido e
   * somá-lo misturava real, dólar e euro na mesma conta.
   */
  valor_liquido?: number;
  /** Preço unitário em BRL (valor_liquido / qtd_pedido). */
  preco_liquido_unit?: number;
  por?: string; // base de preço do SAP; unitário = preco_liquido_unit / por (vazio = 1)
  // Enriquecidos a partir do JOIN com contatos e cidadeforn.
  telefone?: string;
  email?: string;
  classificacao?: string;
  nome_fantasia?: string;
  pais?: string;
  cidade?: string;
  localidade?: string;
  /**
   * UF do fornecedor — vem de cidadeforn.estado_uf (preenchido na importação
   * ZL0132 via coluna Rg) com COALESCE para pedidosforn.regiao_uf.
   * Para fornecedores estrangeiros, regiao_uf pode ser código numérico da
   * região do país de origem, não uma UF brasileira.
   */
  estado_uf?: string;
  rua?: string;
  codigo_postal?: string;
  data_migo?: string | null;
}


// ---------------------------------------------------------------------------
// Auditoria de preços — compras de 2026 contra o histórico corrigido pelo IPCA.
// Ver docs/superpowers/specs/2026-08-08-auditoria-precos-ipca-design.md.
// ---------------------------------------------------------------------------

/**
 * Quanto se pode confiar na referência de preço de um material.
 * 'Sem referência' não é um grau ruim — é a ausência de histórico do material,
 * e responde por 45% do valor comprado em 2026.
 */
export type ConfiancaBenchmark = 'Alta' | 'Média' | 'Baixa' | 'Sem referência';

/** Posição do preço pago contra a faixa P25–P75 do histórico corrigido. */
export type VereditoCompra = 'Bom' | 'Na faixa' | 'Atenção' | 'Sem referência';

/**
 * Uma linha de `vw_auditoria_compras`: uma compra de 2026 (material +
 * fornecedor + pedido, o mesmo grão de vw_historico_pedidos) com a referência
 * histórica corrigida ao lado.
 */
export interface AuditoriaCompra {
  material: string;
  txt_breve?: string;
  cod_forn?: string;
  fornecedor?: string;
  doc_compra?: string;
  rm?: string;
  grp_mercads?: string;
  grp_mercads_desc?: string;
  tipo_item?: 'Projeto' | 'Consumo';
  data_doc?: string;
  unidade?: string;
  qtd: number;
  /** Valor da compra em BRL (soma de valor_em_brl). */
  valor: number;
  /** valor / qtd — imune à base de preço `por` do SAP, que varia entre pedidos. */
  preco_unit: number;
  /**
   * true quando a entrega do pedido ainda não fechou (0 < qtd_fornecida < qtd).
   * A view inclui essas linhas — não só as com `crf='x'` — para pedidos em
   * andamento não sumirem da auditoria; o preço já é real, só a quantidade
   * final pode mudar até a entrega concluir.
   */
  pedido_parcial?: boolean;

  // Referência do material, nula quando não houve compra anterior a 2026.
  /** Compras históricas que formaram a referência. */
  n_compras?: number | null;
  primeira_compra?: string | null;
  ultima_compra?: string | null;
  qtd_mediana?: number | null;
  /** Percentis do preço unitário histórico, já corrigidos pelo IPCA até hoje. */
  ref_p25?: number | null;
  ref_p50?: number | null;
  ref_p75?: number | null;
  /** Desvio-padrão do log do preço histórico — o detector de item genérico. */
  sd_log?: number | null;

  confianca: ConfiancaBenchmark;
  veredito: VereditoCompra;
  /** preco_unit / ref_p50 − 1. */
  delta_pct?: number | null;
  /** (preco_unit − ref_p50) × qtd. Negativo = pagou menos que a referência. */
  delta_valor?: number | null;
  /** Quantidade fora de [qtd_mediana/3, qtd_mediana×3]: ganho pode ser de escala. */
  lote_atipico?: boolean;
  /** Último mês do IPCA usado na correção (o IBGE publica com ~10 dias de atraso). */
  ipca_mes_referencia?: string;
}

/**
 * Uma compra passada de um material auditado (`vw_auditoria_historico_material`).
 * Buscada sob demanda ao expandir a linha — são 6,5 mil registros no total, que
 * não justificam sincronização permanente. É o que torna a mediana conferível.
 */
export interface AuditoriaHistoricoMaterial {
  material: string;
  doc_compra?: string;
  cod_forn?: string;
  fornecedor?: string;
  data_doc?: string;
  qtd: number;
  valor: number;
  /** Preço unitário na moeda e no valor da época. */
  preco_unit: number;
  fator_ipca: number;
  preco_corrigido: number;
}


// Uma linha da tabela `estoque` (importação ZL0024 — posição de estoque).
export interface EstoqueItem {
  id: number;
  centro?: string;
  deposito?: string;
  tipo_material?: string;
  material?: string;
  referencia_fabricante?: string;
  txt_breve_material?: string;
  quantidade?: number;
  umb?: string;
  preco_medio?: number;
  valor_total?: number;
  grp_mercad?: string;
  class_item?: string;
  grupo_mercadorias?: string;
  aplicacao?: string;
  texto_pedido_compra?: string;
  empresa?: string;
  imported_at?: string;
}

// Uma linha da view `vw_estoque_analise`: enriquecimento por material da posição
// de estoque com o último preço efetivamente pago. Agregado no Postgres porque o
// cache local de `pedidosforn` cobre apenas 2026 e a comparação precisa de todo
// o histórico.
export interface EstoqueAnalise {
  material: string;
  ultimo_preco_unit?: number | null;
  data_ultima_compra?: string | null;
  ultimo_fornecedor?: string | null;
}

export interface ContatoFornecedor {
  id: string;
  cod_vendor?: string | null;
  fornecedor?: string;
  nome_contato?: string; // Mantido por compatibilidade; usar representante_nome quando possível
  nome_fantasia?: string;
  telefone?: string; // Telefone geral da empresa
  email?: string; // E-mail geral da empresa
  cnpj?: string | null;
  cidade?: string;
  estado_uf?: string;
  representante_nome?: string;
  representante_cargo?: string;
  representante_telefone?: string;
  representante_email?: string;
  classificacao?: string;
  status?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface FornecedorMaterialRow {
  cod_forn: string;
  cnpj: string;
  fornecedor: string;
  nome_fantasia?: string;
  regiao_uf: string;
  pais?: string;
  cidade?: string;
  rua?: string;
  codigo_postal?: string;
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

/**
 * Cadastro de decodificação do grupo de mercadoria do SAP.
 *
 * Atenção: a tabela guarda a linha de cabeçalho da planilha de origem como se
 * fosse dado (`codigo = 'Grp.merc.'`). Ela não casa com nenhum código real, mas
 * qualquer lista montada a partir da tabela inteira precisa descartá-la.
 */
export interface GrupoMercadoria {
  codigo: string;
  denominacao?: string;
  /** Denominação 2 — é a exibida na Central Compras. */
  denominacao2?: string;
  classificacao_nivel1?: string;
  codigo_pai?: string;
}

// Uma linha da tabela `me3n_contratos` (importação ME3N) — um item de um
// contrato de fornecimento. Vários itens compartilham o mesmo
// `documento_compras`; vigência e fornecedor normalmente se repetem em todos.
export interface ContratoME3N {
  id: number;
  documento_compras: string;
  data_documento?: string | null;
  fornecedor?: string | null;
  centro?: string | null;
  item?: string | null;
  material?: string | null;
  texto_breve?: string | null;
  qtd_solicit_anterior?: number | null;
  unidade_preco?: string | null;
  preco_liquido?: number | null;
  valor_solicitado?: number | null;
  valor_efetivo?: number | null;
  qtd_prev_pendente?: number | null;
  valor_pendente?: number | null;
  a_fornecer_qtd?: number | null;
  a_fornecer_valor?: number | null;
  ainda_faturar_qtd?: number | null;
  ainda_faturar_valor?: number | null;
  fim_validade?: string | null;
  inicio_validade?: string | null;
  codigo_eliminacao?: string | null;
  um_pedido?: string | null;
  moeda?: string | null;
  estado_liberacao?: string | null;
  codigo_liberacao?: string | null;
  valor_liquido_pedido?: number | null;
  requisitante?: string | null;
  historico_pedido?: string | null;
  criado_por?: string | null;
  imported_at?: string;
}

/** Rótulo livre — o SAP não padroniza; "Anual"/"Mensal"/"Por Demanda" são só sugestão na UI. */
export type ContratoModalidade = string;
export type ContratoStatus = 'Ativo' | 'Inativo' | 'Em Processamento';

/**
 * Campos complementares de um contrato (ME3N), preenchidos manualmente por
 * quem gerencia o contrato — não vêm do SAP. Uma linha por `documento_compras`,
 * independente de quantos itens o contrato tenha. Sobrevive a reimportações do
 * ME3N porque mora numa tabela separada de `me3n_contratos`.
 */
export interface ContratoDetalhes {
  documento_compras: string;
  gestor?: string | null;
  escopo_servico?: string | null;
  po_pedido_compra?: string | null;
  codigo_fornecedor?: string | null;
  valor_parcela?: number | null;
  modalidade?: ContratoModalidade | null;
  vigencia_label?: string | null;
  status?: ContratoStatus | null;
  updated_by?: string | null;
  updated_at?: string;
}

/** Documento anexado a um contrato (ME3N). Reaproveita o bucket de anexos de solicitação. */
export interface ContratoAnexo {
  id: string;
  documento_compras: string;
  name: string;
  storage_path: string;
  mime_type?: string;
  size: number;
  uploaded_by?: string;
  created_at: string;
}

export interface CidadeForn {
  id?: string;
  forn_codigo: string;
  forn_nome?: string;
  rua?: string;
  pais?: string;
  codigo_postal?: string;
  localidade?: string;
  /** UF do fornecedor (ex: 'SP', 'BA'). Populado via importacao ZL0132 (coluna Rg). */
  estado_uf?: string;
  created_at?: string;
  updated_at?: string;
}

export interface TabelaFrete {
  id?: string;
  origem: string;
  uf: string;
  destino: string;
  rotas?: string;
  kg_1_10: number;
  kg_11_20: number;
  kg_21_30: number;
  kg_31_50: number;
  kg_51_70: number;
  kg_71_100: number;
  kg_acima_100: number;
  lead_time_entrega?: string;
  ad_valores: number;
  pedagio_fracao_100kg: number;
  cat: number;
  itr_tas: number;
  taxa_fixa_itr_redespacho: number;
  fiorino: number;
  veiculo_3_4_ate_2_5t: number;
  toco_ate_5_5t: number;
  truck_ate_14t: number;
  carreta_ate_25t: number;
  carreta_acima_27t: number;
  lead_time_entrega_2?: string;
  icms_aplicado?: string;
  created_at?: string;
  updated_at?: string;
}

export interface FeedbackLogEntry {
  level: 'error' | 'warn';
  message: string;
  timestamp: string;
}

export interface FeedbackReport {
  id: string;
  type: 'bug' | 'sugestao';
  status: 'novo' | 'em_analise' | 'resolvido' | 'arquivado';
  description: string;
  page_path: string;
  user_id: string | null;
  user_name: string;
  user_email: string | null;
  screenshot_path: string | null;
  console_logs: FeedbackLogEntry[] | null;
  error_stack: string | null;
  user_agent: string | null;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
}

