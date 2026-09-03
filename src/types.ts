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
  // Quando true, o usuário é forçado a definir uma nova senha pessoal no próximo
  // login (popup bloqueante). Ativado pelo admin ao usar "Resetar senha" em
  // Gestão de Usuários; limpado automaticamente assim que o usuário grava a
  // nova senha.
  must_change_password?: boolean;
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

export interface Material {
  id: string;
  material_code: string; // 8 digits
  description: string;
  technical_text?: string;
  category: string;
  company: 'TEN2' | 'AG' | 'AMBAS';
  unit: string; // UN, KG, M, L, M2, etc.
  centro?: string;
  eliminacao?: string;
  elim_nivel_centro?: string;
  status_geral?: string;
  status_centro?: string;
  status_sap?: 'Ativo' | 'Obsoleto';
  modificado_por?: string;
  tipo_material?: string;
  tipo_material_desc?: string;
  codigo_controle?: string;
  categoria_item?: string;
  indicador_s?: string;
  grupo_mercadoria_codigo?: string;
  grupo_mercadoria_desc?: string;
  denominacao?: string;
  material_basico?: string;
  classe_fiscal?: string;
  unidade_medida_alt?: string;
  classe_avaliacao?: string;
  numero_pf?: string;
  idioma?: string;
  pais?: string;
  criado_em?: string;
  ultima_modificacao?: string;
  is_active: boolean;
  created_at: string;
  imported_at?: string;
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
  // Código SAP do item vinculado (RequestItem.sap_code), copiado no upload.
  // Direto aqui — sem depender de join com request_items — para permitir
  // consultar "anexos já enviados para este material" de forma barata,
  // como base de um futuro banco de imagens por material_code.
  material_code?: string;
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

// Chegada física no almoxarifado de um item com PO emitida mas ainda sem
// MIGO lançado no SAP. Ver db/sql/tables/almoxarifado_chegadas.sql.
export interface AlmoxarifadoChegada {
  ri: string;
  rm?: string;
  data_chegada: string; // yyyy-MM-dd
  registrado_por_id: string;
  registrado_por_nome: string;
  created_at: string;
  updated_at: string;
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
  /** Valor de trabalho da promessa de entrega (auto = remessa do PO + lead time, ou editado). */
  data_entrega_prevista?: string;
  /**
   * Promessa de entrega confirmada pelo comprador ("Confirmar data" na Central
   * de Compras). É a única data que o Rastreio Compras exibe — a `data_entrega_prevista`
   * não confirmada fica só na Central.
   */
  data_entrega_confirmada?: string;
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
  type: 'ME5A' | 'ZL0132' | 'PEDIDOSFORN' | 'CONTATOS' | 'ZL0024' | 'ME3N' | 'ME3M' | 'FBL1N' | 'MB51' | 'FRETE' | 'CADMATERIAIS' | 'ZL0170' | 'BAHIASUL';
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
  new_ris?: {
    ri: string;
    requisicao_de_compra: string;
    item_reqc: string;
    material: string;
    texto_breve: string;
    requisitante: string;
    qtd_solicitada: number;
    grupo_comprador: string;
    is_new_rm: boolean;
  }[];
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

/**
 * Diligenciamento de um item de pedido (RI) -- o que o comprador digita no
 * painel de Diligenciamento. Tudo que a ZL0132 ja fornece (fornecedor, valor,
 * remessa) NAO mora aqui; ver `src/lib/diligenciamento.ts`.
 */
export interface DiligenciamentoItem {
  ri: string;
  doc_compra?: string | null;
  transportadora?: string | null;
  data_faturamento_transportadora?: string | null;
  /** Sobrepoe a previsao calculada (remessa + prazo). NULL = usa o calculo. */
  previsao_manual?: string | null;
  atualizado_por_id?: string | null;
  atualizado_por_nome?: string | null;
  created_at?: string;
  updated_at?: string;
}

/**
 * Prazo de transito (dias corridos) por UF de origem + transportadora,
 * mantido pelo comprador. `uf`/`transportadora` vazios sao os niveis
 * genericos da cascata -- ver `db/sql/tables/sup_prazos_transporte.sql`.
 */
export interface PrazoTransporte {
  id: string;
  uf: string;
  transportadora: string;
  dias_corridos: number;
  created_at?: string;
  updated_at?: string;
}

/**
 * Transportadora do cadastro mestre (`sup_transportadoras`), editavel em
 * Admin > Cadastros Gerais. Alimenta a lista de escolha da coluna
 * "Transportadora" do Diligenciamento. `Coleta`/`CIF` sao modalidades de
 * retirada, mas entram na mesma lista.
 */
export interface Transportadora {
  id: string;
  nome: string;
  ativo: boolean;
  created_at?: string;
  updated_at?: string;
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

export interface TipoMovEstoque {
  tmv: string;
  descricao?: string | null;
  created_at?: string;
  updated_at?: string;
}

export type MB51ImportMode = 'upsert' | 'replace';

export interface MB51MovEstoque {
  id?: number | string;
  centro?: string | null;
  deposito?: string | null;
  referencia?: string | null;
  doc_material: string;
  pedido?: string | null;
  item?: string | null;
  material?: string | null;
  texto_breve_material?: string | null;
  qtd_um_registro?: number | null;
  unid_medida_basica?: string | null;
  montante_mi?: number | null;
  moeda?: string | null;
  texto_cabecalho_doc?: string | null;
  data_lancamento?: string | null;
  tipo_movimento?: string | null;
  hora_registro?: string | null;
  um_registro?: string | null;
  data_documento?: string | null;
  data_entrada?: string | null;
  fornecedor?: string | null;
  razao_social_fornecedor?: string | null;
  txt_tipo_movimento?: string | null;
  nome_usuario?: string | null;
  posicao_deposito?: string | null;
  elemento_pep?: string | null;
  imobilizado?: string | null;
  chave_unica?: string | null;
  campos_extras?: Record<string, any> | null;
  imported_at?: string;
  created_at?: string;
}

export interface TipoMovEstoque {
  tmv: string;
  descricao?: string | null;
}

/** Categoria funcional do tipo de movimento, atribuída por `vw_mb51_classificado`. */
export type CategoriaMovimento =
  | 'entrada_compra' | 'entrada_sem_pedido' | 'estorno_entrada'
  | 'consumo' | 'estorno_consumo'
  | 'devolucao_fornecedor' | 'estorno_devolucao'
  | 'saida_remessa' | 'estorno_remessa'
  | 'baixa_sucata' | 'estorno_sucata'
  | 'ajuste_inventario' | 'transferencia' | 'outros';

/**
 * Linha da MB51 já classificada pela view. `movimenta_estoque` é falso para
 * transferência interna, que gera par negativo/positivo e não altera o saldo
 * do almoxarifado — toda agregação de fluxo precisa filtrar por ele.
 */
export interface MB51Classificado {
  id: number;
  centro?: string | null;
  deposito?: string | null;
  doc_material: string;
  item?: string | null;
  pedido?: string | null;
  referencia?: string | null;
  material?: string | null;
  texto_breve_material?: string | null;
  qtd_um_registro?: number | null;
  unid_medida_basica?: string | null;
  montante_mi?: number | null;
  moeda?: string | null;
  data_lancamento?: string | null;
  data_documento?: string | null;
  data_entrada?: string | null;
  tipo_movimento?: string | null;
  fornecedor?: string | null;
  razao_social_fornecedor?: string | null;
  nome_usuario?: string | null;
  elemento_pep?: string | null;
  chave_unica?: string | null;
  descricao_tipo_movimento: string;
  categoria: CategoriaMovimento;
  movimenta_estoque: boolean;
  sinal: 'entrada' | 'saida' | 'neutro';
}

/** Classificação da permanência de uma camada, atribuída pela view FIFO. */
export type ClassePermanencia =
  | 'legado_pre_reabertura' | 'em_estoque' | 'cross_dock'
  | 'saudavel' | 'antecipada' | 'consumo_saldo_anterior' | 'indeterminado';

/**
 * Camada de entrada casada por FIFO contra as saídas do mesmo material.
 * `legado = true` marca a camada de abertura sintética: o saldo que
 * atravessou a parada da fábrica (2023–2026) e não tem entrada registrada
 * na MB51. Nela `data_entrada` e `dias_em_estoque` são nulos de propósito.
 */
export interface EstoqueCamadaFifo {
  material: string;
  data_entrada?: string | null;
  legado: boolean;
  qtd_entrada?: number | null;
  preco_unit?: number | null;
  qtd_remanescente?: number | null;
  qtd_consumida?: number | null;
  valor_remanescente?: number | null;
  data_consumo_total?: string | null;
  dias_permanencia?: number | null;
  dias_em_estoque?: number | null;
  classe_permanencia: ClassePermanencia;
}

/**
 * Fatos de reposição por material, medidos sobre a janela de PRODUÇÃO
 * (a partir de 01/05/2026 — jan-abr foi comissionamento, não demanda real).
 * A política que transforma isso em sugestão de mínimo vive em
 * `src/lib/reposicao.ts`.
 */
export interface EstoqueReposicao {
  material: string;
  descricao?: string | null;
  grupo_mercadorias?: string | null;
  tipo_material?: string | null;
  umb?: string | null;
  saldo_atual?: number | null;
  valor_estoque?: number | null;
  preco_medio?: number | null;
  janela_inicio?: string | null;
  janela_fim?: string | null;
  janela_dias?: number | null;
  janela_periodos?: number | null;
  eventos_consumo: number;
  meses_com_consumo: number;
  consumo_total?: number | null;
  maior_lote?: number | null;
  media_lote?: number | null;
  dp_lote?: number | null;
  /** Percentis do tamanho de saída. A proteção usa o p90 — o máximo persegue outlier. */
  lote_p75?: number | null;
  lote_p90?: number | null;
  /** Fração do consumo total concentrada na maior retirada isolada (0..1). */
  concentracao_maior_lote?: number | null;
  primeiro_consumo?: string | null;
  ultimo_consumo?: string | null;
  consumo_diario?: number | null;
  /** Intervalo médio entre demandas (períodos ÷ períodos com demanda). */
  adi?: number | null;
  /** Quadrado do coeficiente de variação do tamanho do lote. */
  cv2?: number | null;
  lead_dias?: number | null;
  lead_dias_max?: number | null;
  lead_amostras: number;
  /** Falso quando o lead time caiu na mediana global por falta de histórico próprio. */
  lead_proprio: boolean;
}

/** Um registro por material: giro, cobertura e sinalizadores de estoque parado. */
export interface EstoqueGiro {
  material: string;
  descricao?: string | null;
  grupo_mercadorias?: string | null;
  tipo_material?: string | null;
  umb?: string | null;
  saldo_atual?: number | null;
  valor_estoque?: number | null;
  janela_inicio?: string | null;
  janela_fim?: string | null;
  janela_dias?: number | null;
  qtd_consumida?: number | null;
  valor_consumido?: number | null;
  eventos_consumo?: number | null;
  qtd_recebida?: number | null;
  ultima_entrada?: string | null;
  ultima_movimentacao?: string | null;
  dias_sem_movimento?: number | null;
  consumo_diario?: number | null;
  /** Nulo quando não houve consumo — cobertura infinita não é um número. */
  cobertura_dias?: number | null;
  giro_anualizado?: number | null;
  sem_consumo_na_janela: boolean;
  /** Saldo que atravessou a parada sem nenhuma movimentação desde a reabertura. */
  legado_intocado: boolean;
}

// =====================================================================
// Módulo de Análise e Mapa de Cotações
// =====================================================================

/**
 * Contrato com a Edge Function `extrair-cotacao`. Tudo `string | null` de
 * propósito: converter texto em número/data é regra determinística e
 * testável (src/lib/cotacoes.ts), não algo que se pede a um LLM estocástico.
 */
export interface ItemPropostaExtraido {
  Item_Numero: string | null;
  Codigo_Produto: string | null;
  Descricao_Produto: string | null;
  Marca_Fabricante: string | null;
  Unidade_Medida: string | null;
  NCM: string | null;
  CST: string | null;
  CFOP: string | null;
  Quantidade: string | null;
  Preco_Unitario: string | null;
  Preco_Total_Item: string | null;
  Aliquota_ICMS_Pct: string | null;
  Aliquota_PIS_Pct: string | null;
  Aliquota_COFINS_Pct: string | null;
  Aliquota_IPI_pct: string | null;
}

export interface PropostaExtraida {
  Arquivo_Origem: string | null;
  Numero_Proposta: string | null;
  Data_Emissao: string | null;
  Validade_Proposta: string | null;
  Fornecedor_Razao_Social: string | null;
  Fornecedor_CNPJ: string | null;
  Fornecedor_Inscricao_Estadual: string | null;
  Fornecedor_Cidade_UF: string | null;
  Fornecedor_Telefone: string | null;
  Vendedor_Nome: string | null;
  Vendedor_Email: string | null;
  Vendedor_Telefone: string | null;
  Cliente_Razao_Social: string | null;
  Cliente_CNPJ: string | null;
  Cliente_Inscricao_Estadual: string | null;
  Cliente_Cidade_UF: string | null;
  Condicao_Pagamento: string | null;
  Forma_Pagamento: string | null;
  Prazo_Entrega: string | null;
  Frete_Modalidade: string | null;
  Transportadora_Indicada: string | null;
  Faturamento_Minimo: string | null;
  Dados_Bancarios_PIX: string | null;
  Valor_Total_Orcamento: string | null;
  Observacoes_Gerais: string | null;
  itens: ItemPropostaExtraido[];
}

export type ExtracaoErroCodigo =
  | 'NAO_AUTENTICADO' | 'SEM_PERMISSAO' | 'ENTRADA_VAZIA' | 'ENTRADA_GRANDE'
  | 'CONFIG_AUSENTE' | 'PROVEDOR_LIMITE' | 'PROVEDOR_INDISPONIVEL'
  | 'PROVEDOR_TIMEOUT' | 'RESPOSTA_VAZIA' | 'RESPOSTA_TRUNCADA'
  | 'JSON_INVALIDO' | 'ERRO_INTERNO';

export interface ExtracaoUso {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface ExtracaoResposta {
  propostas: PropostaExtraida[];
  uso: ExtracaoUso | null;
  modelo: string;
  truncado: boolean;
  extracao_id: string;
  duracao_ms: number;
  custo_usd?: number | null;
  custo_brl?: number | null;
}

// ---------- Modelo persistido ----------

export type CotacaoProcessoStatus = 'aberto' | 'em_analise' | 'concluido' | 'cancelado';
export type FornecedorMatch = 'cnpj' | 'manual' | 'nao_encontrado';
export type VinculoOrigem = 'manual' | 'sugerido' | 'aprendido';

export interface CotacaoProcesso {
  id: string;
  numero: string;
  titulo: string | null;
  status: CotacaoProcessoStatus;
  observacoes: string | null;
  criado_por: string | null;
  criado_por_nome: string;
  created_at: string;
  updated_at: string;
}

export interface CotacaoProcessoItem {
  id: string;
  processo_id: string;
  ri: string;
  rm: string | null;
  item_reqc: string | null;
  material_code: string | null;
  texto_breve: string | null;
  qtd_solicitada: number | null;
  unidade_medida: string | null;
  centro: string | null;
  deposito: string | null;
  created_at: string;
}

/** Item de RM antes de virar `CotacaoProcessoItem` — o que a Central de Compras junta para a seleção. */
export interface CotacaoProcessoItemDraft {
  ri: string;
  rm: string | null;
  item_reqc: string | null;
  material_code: string | null;
  texto_breve: string | null;
  qtd_solicitada: number | null;
  unidade_medida: string | null;
  centro: string | null;
  deposito: string | null;
}

export interface CotacaoProposta {
  id: string;
  processo_id: string;
  arquivo_origem: string | null;
  numero_proposta: string | null;
  data_emissao: string | null;
  validade_data: string | null;
  validade_texto: string | null;
  fornecedor_razao_social: string | null;
  fornecedor_cnpj: string | null;
  fornecedor_inscricao_estadual: string | null;
  fornecedor_cidade: string | null;
  fornecedor_uf: string | null;
  fornecedor_telefone: string | null;
  cod_vendor: string | null;
  contato_id: string | null;
  fornecedor_match: FornecedorMatch;
  vendedor_nome: string | null;
  vendedor_email: string | null;
  vendedor_telefone: string | null;
  cliente_razao_social: string | null;
  cliente_cnpj: string | null;
  cliente_inscricao_estadual: string | null;
  cliente_cidade: string | null;
  cliente_uf: string | null;
  condicao_pagamento: string | null;
  forma_pagamento: string | null;
  prazo_entrega_texto: string | null;
  prazo_entrega_dias: number | null;
  frete_modalidade: 'CIF' | 'FOB' | 'OUTRO' | null;
  transportadora_indicada: string | null;
  faturamento_minimo: number | null;
  dados_bancarios_pix: string | null;
  valor_total_orcamento: number | null;
  observacoes_gerais: string | null;
  campos_faltantes: string[];
  revisado: boolean;
  extracao_id: string | null;
  extraido_raw: PropostaExtraida | null;
  criado_por: string | null;
  criado_por_nome: string;
  created_at: string;
  updated_at: string;
  itens?: CotacaoPropostaItem[];
}

export interface CotacaoPropostaItem {
  id: string;
  proposta_id: string;
  processo_item_id: string | null;
  fora_escopo: boolean;
  vinculo_origem: VinculoOrigem;
  vinculo_score: number | null;
  ri: string | null;
  material_code: string | null;
  item_numero: number | null;
  codigo_produto: string | null;
  descricao_produto: string;
  marca_fabricante: string | null;
  unidade_medida: string | null;
  ncm: string | null;
  cst: string | null;
  cfop: string | null;
  quantidade: number | null;
  preco_unitario: number | null;
  preco_total_item: number | null;
  aliquota_icms_pct: number | null;
  aliquota_pis_pct: number | null;
  aliquota_cofins_pct: number | null;
  aliquota_ipi_pct: number | null;
  campos_faltantes: string[];
  extraido_raw: ItemPropostaExtraido | null;
  created_at: string;
}

// ---------- Estado de edição (só front) ----------

export interface CotacaoPropostaItemDraft {
  _key: string;
  processo_item_id: string | null;
  fora_escopo: boolean;
  vinculo_origem: VinculoOrigem;
  vinculo_score: number | null;
  ri: string | null;
  material_code: string | null;
  item_numero: number | null;
  codigo_produto: string | null;
  descricao_produto: string;
  marca_fabricante: string | null;
  unidade_medida: string | null;
  ncm: string | null;
  cst: string | null;
  cfop: string | null;
  quantidade: number | null;
  preco_unitario: number | null;
  preco_total_item: number | null;
  aliquota_icms_pct: number | null;
  aliquota_pis_pct: number | null;
  aliquota_cofins_pct: number | null;
  aliquota_ipi_pct: number | null;
  extraido_raw: ItemPropostaExtraido;
}

export interface CotacaoPropostaDraft {
  _key: string;
  _salvo: boolean;
  /** Quando a IA extraiu esta proposta — `created_at` para as já salvas, timestamp local no momento da extração para as ainda em rascunho. Usado para ordenar (mais recente primeiro) e exibir na tela. */
  _extraido_em: string | null;
  arquivo_origem: string | null;
  numero_proposta: string | null;
  data_emissao: string | null;
  validade_data: string | null;
  validade_texto: string | null;
  fornecedor_razao_social: string | null;
  fornecedor_cnpj: string | null;
  fornecedor_inscricao_estadual: string | null;
  fornecedor_cidade: string | null;
  fornecedor_uf: string | null;
  fornecedor_telefone: string | null;
  cod_vendor: string | null;
  contato_id: string | null;
  fornecedor_match: FornecedorMatch;
  vendedor_nome: string | null;
  vendedor_email: string | null;
  vendedor_telefone: string | null;
  cliente_razao_social: string | null;
  cliente_cnpj: string | null;
  cliente_inscricao_estadual: string | null;
  cliente_cidade: string | null;
  cliente_uf: string | null;
  condicao_pagamento: string | null;
  forma_pagamento: string | null;
  prazo_entrega_texto: string | null;
  prazo_entrega_dias: number | null;
  frete_modalidade: 'CIF' | 'FOB' | 'OUTRO' | null;
  transportadora_indicada: string | null;
  faturamento_minimo: number | null;
  dados_bancarios_pix: string | null;
  valor_total_orcamento: number | null;
  observacoes_gerais: string | null;
  campos_faltantes: string[];
  revisado: boolean;
  extracao_id: string | null;
  extraido_raw: PropostaExtraida;
  itens: CotacaoPropostaItemDraft[];
}

export interface CampoFaltante {
  campo: string;
  rotulo: string;
  nivel: 'bloqueio' | 'aviso';
}

export interface ValidacaoProposta {
  bloqueios: CampoFaltante[];
  avisos: CampoFaltante[];
  preenchidos: number;
  total: number;
  divergenciaTotalPct: number | null;
}

export interface SugestaoVinculo {
  idx: number;
  processo_item_id: string;
  ri: string;
  texto_breve: string | null;
  material_code: string | null;
  score: number;
  origem: 'aprendido' | 'trigrama';
}

// ---------- Conversor Markdown: log de conversões ----------

/** Uma linha do histórico consultável de conversões — planilha/JSON/XML (via 'local', sem IA) ou PDF/imagem (via 'ia', ver converter-markdown-ia). */
export interface ConversaoMarkdownLog {
  id: string;
  user_id: string | null;
  user_name: string | null;
  nome_arquivo: string;
  formato: string;
  tamanho_bytes: number | null;
  via: 'local' | 'ia';
  modelo: string | null;
  caracteres: number | null;
  tokens: number | null;
  tokens_reais: boolean;
  custo_usd: number | null;
  duracao_ms: number | null;
  sucesso: boolean;
  erro_mensagem: string | null;
  markdown: string | null;
  created_at: string;
}

/** Linha de listagem do histórico — sem `markdown` (pode ser grande; a lista busca até centenas de linhas). Ver `ConversaoMarkdownLog` para o registro completo, buscado sob demanda ao abrir um item. */
export type ConversaoMarkdownResumo = Omit<ConversaoMarkdownLog, 'markdown'>;

// ---------- Formulário: Logística - Expedição ----------

/** Tramos da torre eólica que podem ser expedidos em um carregamento. */
export const TRAMOS = ['T1', 'T2', 'T3', 'T4', 'T5', 'Escada / Plataforma'] as const;
export type Tramo = typeof TRAMOS[number];

/**
 * As três marcações de tempo de um tramo, na ordem em que acontecem. O
 * formulário é preenchido aos poucos: portaria de manhã, pátio no meio do dia,
 * expedição à tarde — cada etapa aceita fotos próprias.
 */
export type EtapaExpedicao = 'chegada_portaria' | 'entrada_patio' | 'expedicao';

export interface ExpedicaoFoto {
  id: string;
  carregamento_id: string;
  tramo_id: string;
  etapa: EtapaExpedicao;
  storage_path: string;
  nome_arquivo: string | null;
  criado_por: string | null;
  created_at: string;
  /** Exclusão lógica — nulo = vigente. Ver src/lib/softDelete.ts. */
  excluido_em?: string | null;
  excluido_por?: string | null;
}

export interface ExpedicaoTramo {
  id: string;
  carregamento_id: string;
  ordem: number;
  tramo: Tramo;
  /** Número do tramo (4 dígitos). */
  numero_tramo?: string | null;
  /** Número da Nota Fiscal. */
  numero_nf?: string | null;
  motorista: string;
  /** CNH do motorista. */
  cnh?: string | null;
  cavalo_placa: string;
  cavalo_uf: string | null;
  carreta_placa: string;
  carreta_uf: string | null;
  dolly_placa: string;
  dolly_uf: string | null;
  /** ISO `YYYY-MM-DD` (coluna `date`), ou null enquanto não informada. */
  data: string | null;
  /** Datas de cada etapa (ISO `YYYY-MM-DD`), ou null caso não informadas. */
  data_chegada_portaria?: string | null;
  data_entrada_patio?: string | null;
  data_expedicao?: string | null;
  /** 'HH:MM' — null enquanto a etapa não aconteceu. */
  hora_chegada_portaria: string | null;
  hora_entrada_patio: string | null;
  hora_expedicao: string | null;
  /** Observação livre da etapa — o que explica o horário. */
  obs_chegada_portaria: string | null;
  obs_entrada_patio: string | null;
  obs_expedicao: string | null;
  created_at: string;
  updated_at: string;
  excluido_em?: string | null;
  excluido_por?: string | null;
}

export interface ExpedicaoLogEnvio {
  tipo: 'expedicao_completa' | 'aviso_chegada';
  usuario_id: string;
  usuario_nome: string;
  enviado_em: string;
  assunto?: string;
  destinatarios?: string;
  detalhes?: string;
}

export interface ExpedicaoCarregamento {
  id: string;
  numero: string;
  empresa: string;
  observacoes: string | null;
  status: 'aberto' | 'enviado';
  enviado_em: string | null;
  enviado_por?: string | null;
  enviado_por_nome?: string | null;
  historico_envios?: ExpedicaoLogEnvio[] | null;
  criado_por: string;
  criado_por_nome: string;
  created_at: string;
  updated_at: string;
  excluido_em?: string | null;
  excluido_por?: string | null;
}

/** Carregamento com seus tramos e fotos já reunidos — o que a tela de edição manipula. */
export interface ExpedicaoCarregamentoCompleto extends ExpedicaoCarregamento {
  tramos: ExpedicaoTramo[];
  fotos: ExpedicaoFoto[];
}

/** Linha da listagem: o carregamento + o resumo de progresso, sem carregar as fotos. */
export interface ExpedicaoCarregamentoResumo extends ExpedicaoCarregamento {
  tramos: Pick<ExpedicaoTramo, 'id' | 'tramo' | 'hora_chegada_portaria' | 'hora_entrada_patio' | 'hora_expedicao'>[];
  total_fotos: number;
}

// ---------- Módulo RH ----------

export interface RhSetor {
  id: string;
  nome: string;
  ativo: boolean;
  created_at: string;
}

export interface RhTurno {
  id: string;
  nome: string;
  created_at: string;
}

export interface RhPessoa {
  id: string;
  registro: string;
  nome: string;
  cargo: string | null;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

export interface RhRota {
  id: string;
  funcionario: string;
  ponto_embarque: string;
  horario: string;
  contato: string | null;
  rota: string;
  ativo: boolean;
  created_at: string;
  updated_at: string;
  excluido_em?: string | null;
  excluido_por?: string | null;
}

/** Calendário de percentual de hora extra por dia (`06/01/2023` = 60%, etc.), importado de planilha. */
export interface RhHoraExtra {
  id: string;
  /** ISO `YYYY-MM-DD`. */
  dia: string;
  percentual_he: number;
  created_at: string;
}

// ---------- Formulário: ASE - Hora Extra (FRM.RHU-0007) ----------

/**
 * Sem workflow de aprovação: o formulário só é visível para quem o admin
 * conceder acesso (`page_access['rh_ase_hora_extra']`), então preencher e
 * enviar já é a autorização. `RASCUNHO` permite continuar editando;
 * `ENVIADO` é o registro final (ainda pode virar `CANCELADO`).
 */
export type AseHoraExtraStatus = 'RASCUNHO' | 'ENVIADO' | 'CANCELADO';

export interface AseHoraExtraSolicitacao {
  id: string;
  codigo_formulario: string;
  numero_protocolo: string;
  solicitante_id: string | null;
  setor_id: string | null;
  turno_id: string | null;
  /** ISO `YYYY-MM-DD` — a "DATA" do formulário físico. */
  data_execucao: string;
  justificativa: string | null;
  status: AseHoraExtraStatus;
  created_at: string;
  updated_at: string;
  excluido_em?: string | null;
  excluido_por?: string | null;
}

export interface AseHoraExtraItem {
  id: string;
  solicitacao_id: string;
  pessoa_id: string | null;
  registro: string;
  nome: string;
  cargo: string | null;
  transporte: boolean;
  refeicao: boolean;
  /** 'HH:MM'. */
  hora_entrada: string;
  hora_saida: string;
  intervalo_minutos: number;
  percentual_he: number | null;
  total_horas: number | null;
  observacao: string | null;
  rota_transporte?: string | null;
  ponto_embarque_transporte?: string | null;
  horario_embarque_transporte?: string | null;
  contato_transporte?: string | null;
  created_at: string;
  excluido_em?: string | null;
  excluido_por?: string | null;
}

/** Solicitação + colaboradores + os cadastros já resolvidos (setor/turno por extenso) — o que a tela de edição manipula. */
export interface AseHoraExtraCompleta extends AseHoraExtraSolicitacao {
  itens: AseHoraExtraItem[];
  setor_nome: string | null;
  turno_nome: string | null;
  solicitante_nome: string | null;
}

// =====================================================================
// ---------- MÓDULO PORTARIA (FRM.SGP-0008/0011, 0009, 0020, 0010, 0013) ----------
// =====================================================================

export type PortTurno = 'MANHA' | 'TARDE' | 'NOITE' | 'TURNO_A' | 'TURNO_B' | 'TURNO_C';

// 1. Controle de Equipamento e Ferramentas de Terceiros (FRM.SGP-0011)
export type PortEquipamentoStatus = 'NO_PATIO' | 'DEVOLVIDO' | 'RETIDO' | 'CANCELADO';

export interface PortControleEquipamento {
  id: string;
  codigo_formulario: string;
  numero_protocolo: string;
  data_entrada: string;
  data_saida: string | null;
  hora_entrada: string | null;
  hora_saida: string | null;
  nome_empresa: string;
  funcionario: string;
  descricao_materiais: string;
  responsavel: string | null;
  vigilante_entrada: string;
  vigilante_saida: string | null;
  status: PortEquipamentoStatus;
  observacoes: string | null;
  criado_por: string | null;
  created_at: string;
  updated_at: string;
  excluido_em?: string | null;
  excluido_por?: string | null;
}

// 2. Registro de Chegada de Transportes (FRM.SGP-0009)
export type PortTransporteStatus = 'NO_PATIO' | 'FINALIZADO' | 'CANCELADO';

export interface PortRegistroTransporte {
  id: string;
  codigo_formulario: string;
  numero_protocolo: string;
  data: string;
  turno: PortTurno;
  vigilante: string;
  veiculo: string;
  placa: string;
  empresa: string;
  hora_chegada: string;
  hora_saida: string | null;
  motorista: string;
  /** Rota do transporte na portaria: R1, R2, R3. */
  rota: string | null;
  ocupacao: string | null;
  observacoes: string | null;
  status: PortTransporteStatus;
  criado_por: string | null;
  created_at: string;
  updated_at: string;
  excluido_em?: string | null;
  excluido_por?: string | null;
}

// 3. Controle de Chegada e Saída de Carretas de Chapas (FRM.SGP-0020)
export type PortCarretaStatus = 'NO_PATIO' | 'DESCARREGANDO' | 'LIBERADO' | 'FINALIZADO' | 'CANCELADO';

export interface PortControleCarreta {
  id: string;
  codigo_formulario: string;
  numero_protocolo: string;
  empresa: string;
  placa_cavalo: string;
  placa_carreta: string;
  data_entrada: string;
  hora_entrada: string;
  nome_motorista: string;
  cpf_motorista: string | null;
  data_saida: string | null;
  hora_saida: string | null;
  ass_motorista: string | null;
  vigilante_entrada: string;
  vigilante_saida: string | null;
  numero_nf: string | null;
  peso_bruto: number | null;
  status: PortCarretaStatus;
  observacoes: string | null;
  criado_por: string | null;
  created_at: string;
  updated_at: string;
  excluido_em?: string | null;
  excluido_por?: string | null;
}

// 4. Relatório de Ocorrências da Portaria (FRM.SGP-0010)
export type PortRelatorioStatus = 'EM_ANDAMENTO' | 'CONCLUIDO' | 'PASSADO' | 'CANCELADO';
export type PortLocalSetor = 'PORTARIA' | 'RONDA_01' | 'RONDA_02' | 'PATIO_CHAPAS' | 'PATIO_TRAMOS' | 'FABRICA' | 'OUTRO';
export type PortSeveridade = 'INFO' | 'ALERTA' | 'GRAVE';

export type PortTipoRegistroOcorrencia =
  | 'ENTRADA_VEICULO'      // Veículo / Fornecedor / Prestador (com saída pendente)
  | 'ENTRADA_VISITANTE'    // Visitante / Terceiro a Pé (com saída pendente)
  | 'SAIDA_COLABORADOR'    // Saída Temporária de Colaborador TEN (com retorno pendente)
  | 'RONDA_PATRIMONIAL'    // Ronda Patrimonial (texto livre + foto)
  | 'OCORRENCIA_GERAL'     // Ocorrência / Alerta / Evento (texto livre + foto)
  | 'OUTRO_REGISTRO';      // Outro Registro Geral (texto livre + foto)

export type PortStatusPermanencia = 'NO_PATIO' | 'FINALIZADO' | 'AGUARDANDO_RETORNO' | 'NAO_APLICA';

export interface PortPessoaVeiculoHistorico {
  id?: string;
  nome: string;
  empresa: string;
  cpf?: string;
  cnh?: string;
  placa?: string;
  placa_cavalo?: string;
  placa_carreta?: string;
  tipo_padrao?: PortTipoRegistroOcorrencia;
  funcao?: string;
  ultimo_acesso?: string;
}

export interface PortRelatorioOcorrencia {
  id: string;
  relatorio_id: string;
  horario: string;
  hora_saida?: string | null;
  vigilante_saida?: string | null;
  tipo_registro?: PortTipoRegistroOcorrencia;
  status_permanencia?: PortStatusPermanencia;
  local_setor: PortLocalSetor;
  descricao: string;
  severidade: PortSeveridade;
  vigilante: string;
  foto_url?: string | null;
  // Campos estruturados para reabertura e rastreio
  empresa?: string;
  nome_pessoa?: string;
  documento_cpf?: string;
  documento_cnh?: string;
  placa?: string;
  autorizado_por?: string;
  fara_briefing?: boolean;
  motivo_observacao?: string;
  pessoas?: { nome: string; cpf?: string; cnh?: string; funcao?: string }[];
  created_at: string;
  updated_at?: string;
  excluido_em?: string | null;
  excluido_por?: string | null;
}

export interface PortRelatorioPortaria {
  id: string;
  codigo_formulario: string;
  numero_protocolo: string;
  data: string;
  turno: PortTurno;
  horario_inicio: string;
  horario_fim: string;
  vigilante_principal: string;
  vigilante_ronda01: string | null;
  vigilante_ronda02: string | null;
  status: PortRelatorioStatus;
  observacoes_gerais: string | null;
  criado_por: string | null;
  created_at: string;
  updated_at: string;
  excluido_em?: string | null;
  excluido_por?: string | null;
  ocorrencias?: PortRelatorioOcorrencia[];
}

// 5. Lista de Presença - Briefing de Segurança (FRM.SGP-0013)
export type PortBriefingTipo = 'INTERNO' | 'EXTERNO';
export type PortBriefingStatus = 'ABERTA' | 'CONCLUIDA' | 'CANCELADA';

export interface PortBriefingParticipante {
  id: string;
  sessao_id: string;
  data: string;
  empresa: string;
  nome: string;
  cpf: string;
  funcao: string;
  assinatura_digital: string | null;
  hora_assinatura?: string | null;
  status_assinatura?: 'PENDENTE' | 'ASSINADA';
  validade_dias: number;
  created_at: string;
  excluido_em?: string | null;
  excluido_por?: string | null;
}

export interface PortBriefingSessao {
  id: string;
  codigo_formulario: string;
  numero_protocolo: string;
  tema_treinamento: string;
  tipo: PortBriefingTipo;
  data: string;
  instrutor_responsavel: string;
  conteudo_programatico: string;
  termo_responsabilidade: string;
  status: PortBriefingStatus;
  observacoes: string | null;
  criado_por: string | null;
  created_at: string;
  updated_at: string;
  excluido_em?: string | null;
  excluido_por?: string | null;
  participantes?: PortBriefingParticipante[];
}

// 6. Materiais de Segurança Patrimonial & Passagem de Plantão (FRM.SGP-0010)
export type PortMaterialCategoria = 'ARMAMENTO' | 'PROTECAO' | 'COMUNICACAO' | 'MUNICAO' | 'EQUIPAMENTO';

export interface PortMaterialSeguranca {
  id: string;
  nome: string;
  quantidade_padrao: number;
  unidade: string;
  categoria: PortMaterialCategoria;
  ativo: boolean;
  ordem: number;
  observacoes: string | null;
  created_at: string;
  updated_at: string;
  excluido_em?: string | null;
  excluido_por?: string | null;
}

export interface PortItemConferido {
  material_id?: string;
  nome: string;
  quantidade_esperada: number;
  unidade: string;
  categoria?: PortMaterialCategoria;
  conferido: boolean;
  quantidade_conferida?: number;
  observacao?: string;
}

export type PortPassagemPlantaoStatus = 'EM_ANDAMENTO' | 'CONCLUIDO';

export interface PortPassagemPlantao {
  id: string;
  numero_protocolo: string;
  codigo_formulario: string;
  data: string;
  turno: string;
  horario_inicio: string;
  horario_fim: string;
  vigilante_preenchedor: string;
  vigilante_portaria: string;
  vigilante_ronda01: string | null;
  vigilante_ronda02: string | null;
  vigilante_anterior01: string | null;
  vigilante_anterior02: string | null;
  texto_declaracao: string | null;
  itens_conferidos: PortItemConferido[];
  status: PortPassagemPlantaoStatus;
  observacoes: string | null;
  criado_por: string | null;
  created_at: string;
  updated_at: string;
  excluido_em?: string | null;
  excluido_por?: string | null;
}

// 6. Cadastro de Vigilantes (Portaria)
export interface PortVigilante {
  id: string;
  nome: string;
  matricula: string | null;
  empresa: string;
  funcao: string;
  turno_preferencial: string | null;
  data_admissao?: string | null;
  data_nascimento?: string | null;
  ativo: boolean;
  observacoes: string | null;
  criado_por?: string | null;
  created_at?: string;
  updated_at?: string;
  excluido_em?: string | null;
  excluido_por?: string | null;
}

// 7. Gestão de Envios de E-mails (Outlook / mailto)
export type EmailModulo = 'SUPRIMENTOS' | 'LOGISTICA' | 'PORTARIA' | 'RH' | 'HELPDESK' | 'GERAL';

export interface ConfigEnvioEmail {
  id: string;
  chave: string;
  nome: string;
  modulo: EmailModulo;
  descricao?: string | null;
  destinatarios: string; // E-mails separados por vírgula ou ponto e vírgula
  copia?: string | null; // CC
  copia_oculta?: string | null; // BCC
  assunto_padrao?: string | null;
  ativo: boolean;
  criado_por?: string | null;
  created_at?: string;
  updated_at?: string;
}

// 8. Chamado Suprimentos — pendências de processamento
export type SupPendenciaStatus = 'pendente' | 'concluido';
/**
 * `nfse` = relação de NFS-e; `documento` = lançamentos com erro/ação no SAP;
 * `ajuste_pedido` = chamado "Ajuste de Pedido" (demanda + NF + pedido + imagem).
 */
export type SupPendenciaModelo = 'nfse' | 'documento' | 'ajuste_pedido';

export interface SupPendenciaAcaoLog {
  tipo: 'concluido' | 'reaberto' | 'criado';
  usuario_id?: string | null;
  usuario_nome?: string | null;
  data_hora: string;
  resolucao?: string | null;
  motivo?: string | null;
}

export interface SupPendenciaProcessamentoNF {
  id: string;
  /** FK para core_solicitacoes(id) — o chamado que originou estas linhas. */
  request_id: string;
  /** SUP-DDMMAA-NN, o mesmo para todas as linhas do chamado. */
  protocolo: string;
  modelo: SupPendenciaModelo;
  /** Modelo `nfse`: nº da NFS-e. Modelo `documento`: nº do documento (9 pos.). */
  numero_nfse: string;
  data_emissao_nfse?: string | null;
  nome_fornecedor?: string | null;
  observacao?: string | null;
  /* Só no modelo `nfse` */
  nfse_cancelada?: string | null;
  fornecedor?: string | null;
  valor_nfse?: number | null;
  valor_nfse_raw?: string | null;
  mes_competencia?: string | null;
  /* Só no modelo `documento` */
  documento_status?: string | null;
  serie?: string | null;
  uf_emissor?: string | null;
  chegou?: string | null;
  documento_compras?: string | null;
  comprador?: string | null;
  data_envio?: string | null;
  /* Só no modelo `ajuste_pedido` — caminhos das imagens no bucket request-attachments. */
  imagem_paths?: string[] | null;
  /** Primeira imagem (compat com o formato de imagem única). */
  imagem_path?: string | null;
  /* Classificação da demanda (categoria "Pendência de Processamento") — dados
     do chamado, repetidos em todas as linhas da submissão. */
  observacao_chamado?: string | null;
  classif_causa?: string | null;
  classif_responsavel?: string | null;
  classif_impacto?: string | null;
  classif_recorrencia?: string | null;
  status: SupPendenciaStatus;
  /** Nota do Suprimentos ao dar baixa na linha. */
  resolucao?: string | null;
  resolvido_por?: string | null;
  resolvido_em?: string | null;
  /** Historico completo de acoes (conclusoes, reaberturas, etc). */
  historico_acoes?: SupPendenciaAcaoLog[] | null;
  ordem: number;
  created_at: string;
}

// =====================================================================
// ---------- MÓDULO SUPRIMENTOS: ENTREGAS BAHIA SUL (CTE) ----------
// =====================================================================

export interface BahiaSulEntrega {
  id?: number;
  cto_documento: string | null;
  cto_filial: string | null;
  cto_serie: string | null;
  cto_numero: string;
  tpo_embarque: string | null;
  rmt_nome: string | null;
  rmt_cnpj: string | null;
  dst_nome: string | null;
  dst_cnpj: string | null;
  emissao: string | null; // ISO YYYY-MM-DD
  referencia: string | null;
  prz_contratado: string | null;
  embarque: string | null;
  prv_chegada: string | null;
  chegada: string | null;
  prv_entrega: string | null;
  entrega: string | null;
  situacao: string | null;
  org_cidade: string | null;
  dst_cidade: string | null;
  nfs_embarcadas: string | null;
  kgs_declarado: number | null;
  kgs_real: number | null;
  kgs_cubado: number | null;
  qtd_volumes: number | null;
  vlr_mercadoria: number | null;
  frt_cobrado: number | null;
  obs_diversos: string | null;
  nro_pedido: string | null;
  chave_unica: string;
  imported_at?: string;
  created_at?: string;
  updated_at?: string;
}

