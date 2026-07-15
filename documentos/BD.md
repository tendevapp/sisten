# Manual do Banco de Dados - Supabase (SITEN)

Este documento contém o mapeamento e a estrutura detalhada de todas as tabelas configuradas no banco de dados Supabase do projeto **SITEN**.

---

## 🚨 ALERTA CRÍTICO DE SEGURANÇA: RLS Desabilitado

> [!CAUTION]
> **Row Level Security (RLS) está desativado** para as 17 tabelas legadas do banco de dados (as novas tabelas pedidosforn e contatos possuem RLS ativo).
> Atualmente, qualquer cliente utilizando as chaves públicas (`anon` e `authenticated`) tem permissão irrestrita de leitura e escrita nas tabelas legadas. 
> 
> **Recomendação:** Deve-se habilitar o RLS em produção e definir políticas de acesso apropriadas (`SELECT`, `INSERT`, `UPDATE`, `DELETE`) para cada papel de usuário.
>
> **Script para Habilitação do RLS:**
> ```sql
> ALTER TABLE public.sectors ENABLE ROW LEVEL SECURITY;
> ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
> ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;
> ALTER TABLE public.requests ENABLE ROW LEVEL SECURITY;
> ALTER TABLE public.request_items ENABLE ROW LEVEL SECURITY;
> ALTER TABLE public.request_comments ENABLE ROW LEVEL SECURITY;
> ALTER TABLE public.request_attachments ENABLE ROW LEVEL SECURITY;
> ALTER TABLE public.request_status_history ENABLE ROW LEVEL SECURITY;
> ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
> ALTER TABLE public.compradores ENABLE ROW LEVEL SECURITY;
> ALTER TABLE public.buyer_groups ENABLE ROW LEVEL SECURITY;
> ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
> ALTER TABLE public.sequences ENABLE ROW LEVEL SECURITY;
> ALTER TABLE public.requisicoes ENABLE ROW LEVEL SECURITY;
> ALTER TABLE public.pedidos ENABLE ROW LEVEL SECURITY;
> ALTER TABLE public.import_logs ENABLE ROW LEVEL SECURITY;
> ALTER TABLE public.obs_historico ENABLE ROW LEVEL SECURITY;
> ALTER TABLE public.pedidosforn ENABLE ROW LEVEL SECURITY;
> ALTER TABLE public.contatos ENABLE ROW LEVEL SECURITY;
> ```

---

## Tabelas Mapeadas

### 1. `public.sectors`
Armazena os setores ou departamentos da empresa e suas configurações no sistema.
- **Chave Primária:** `id`
- **Colunas:**
  | Coluna | Tipo de Dados | Opções | Valor Padrão |
  | --- | --- | --- | --- |
  | `id` | `text` | `updatable` | - |
  | `name` | `text` | `updatable` | - |
  | `is_support` | `boolean` | `nullable`, `updatable` | `false` |
  | `helpdesk_enabled` | `boolean` | `nullable`, `updatable` | `false` |

---

### 2. `public.profiles`
Armazena as informações de perfil e autenticação dos usuários do sistema.
- **Chave Primária:** `id`
- **Relacionamentos (Chaves Estrangeiras):**
  - `sector_id` -> `public.sectors.id`
- **Colunas:**
  | Coluna | Tipo de Dados | Opções | Valor Padrão |
  | --- | --- | --- | --- |
  | `id` | `text` | `updatable` | - |
  | `email` | `text` | `updatable`, `unique` | - |
  | `name` | `text` | `updatable` | - |
  | `cargo` | `text` | `nullable`, `updatable` | - |
  | `sector_id` | `text` | `nullable`, `updatable` | - |
  | `roles` | `ARRAY` | `nullable`, `updatable` | `'{}'::text[]` |
  | `status` | `text` | `nullable`, `updatable` | `'pendente'::text` |
  | `created_at` | `timestamp with time zone` | `nullable`, `updatable` | `now()` |
  | `password` | `text` | `nullable`, `updatable` | `'ten123'::text` |
  | `notification_preferences` | `text` | `nullable`, `updatable` | `'in-app'::text` |

---

### 3. `public.materials`
Catálogo de materiais ativos no sistema.
- **Chave Primária:** `id`
- **Colunas:**
  | Coluna | Tipo de Dados | Opções | Valor Padrão |
  | --- | --- | --- | --- |
  | `id` | `text` | `updatable` | - |
  | `material_code` | `text` | `updatable`, `unique` | - |
  | `description` | `text` | `updatable` | - |
  | `technical_text` | `text` | `nullable`, `updatable` | - |
  | `category` | `text` | `nullable`, `updatable` | - |
  | `company` | `text` | `nullable`, `updatable` | `'TEN2'::text` |
  | `unit` | `text` | `nullable`, `updatable` | `'UN'::text` |
  | `is_active` | `boolean` | `nullable`, `updatable` | `true` |
  | `created_at` | `timestamp with time zone` | `nullable`, `updatable` | `now()` |

---

### 4. `public.requests`
Contém as solicitações abertas no sistema (compras, cadastros SAP, chamados).
- **Chave Primária:** `id`
- **Relacionamentos (Chaves Estrangeiras):**
  - `solicitante_id` -> `public.profiles.id`
  - `solicitante_sector_id` -> `public.sectors.id`
  - `target_sector_id` -> `public.sectors.id`
  - `atendente_id` -> `public.profiles.id`
  - `comprador_id` -> `public.profiles.id`
- **Colunas:**
  | Coluna | Tipo de Dados | Opções | Valor Padrão |
  | --- | --- | --- | --- |
  | `id` | `text` | `updatable` | - |
  | `number` | `text` | `updatable`, `unique` | - |
  | `type` | `text` | `updatable` | - |
  | `status` | `text` | `updatable` | - |
  | `criticality` | `integer` | `updatable` | - |
  | `solicitante_id` | `text` | `nullable`, `updatable` | - |
  | `solicitante_name` | `text` | `nullable`, `updatable` | - |
  | `solicitante_sector_id` | `text` | `nullable`, `updatable` | - |
  | `created_at` | `timestamp with time zone` | `nullable`, `updatable` | `now()` |
  | `updated_at` | `timestamp with time zone` | `nullable`, `updatable` | `now()` |
  | `data_necessidade` | `date` | `nullable`, `updatable` | - |
  | `comprador_id` | `text` | `nullable`, `updatable` | - |
  | `tipo_compra` | `text` | `nullable`, `updatable` | - |
  | `justificativa` | `text` | `nullable`, `updatable` | - |
  | `local` | `text` | `nullable`, `updatable` | - |
  | `category_id` | `text` | `nullable`, `updatable` | - |
  | `target_sector_id` | `text` | `nullable`, `updatable` | - |
  | `registration_type` | `text` | `nullable`, `updatable` | - |
  | `linked_rm_number` | `text` | `nullable`, `updatable` | - |
  | `rating` | `integer` | `nullable`, `updatable` | - |
  | `rating_comment` | `text` | `nullable`, `updatable` | - |
  | `atendente_id` | `text` | `nullable`, `updatable` | - |
  | `atendente_name` | `text` | `nullable`, `updatable` | - |
  | `first_response_at` | `timestamp with time zone` | `nullable`, `updatable` | - |
  | `resolved_at` | `timestamp with time zone` | `nullable`, `updatable` | - |
  | `paused_minutes` | `integer` | `nullable`, `updatable` | `0` |
  | `last_paused_at` | `timestamp with time zone` | `nullable`, `updatable` | - |

---

### 5. `public.request_items`
Itens vinculados a uma solicitação.
- **Chave Primária:** `id`
- **Relacionamentos (Chaves Estrangeiras):**
  - `request_id` -> `public.requests.id`
- **Colunas:**
  | Coluna | Tipo de Dados | Opções | Valor Padrão |
  | --- | --- | --- | --- |
  | `id` | `text` | `updatable` | - |
  | `request_id` | `text` | `nullable`, `updatable` | - |
  | `description` | `text` | `updatable` | - |
  | `sap_code` | `text` | `nullable`, `updatable` | - |
  | `has_no_sap_code` | `boolean` | `nullable`, `updatable` | `false` |
  | `quantity` | `numeric` | `updatable` | - |
  | `unit` | `text` | `updatable` | - |
  | `brand` | `text` | `nullable`, `updatable` | - |
  | `is_similar_allowed` | `boolean` | `nullable`, `updatable` | `false` |
  | `suggested_supplier` | `text` | `nullable`, `updatable` | - |
  | `estimated_value` | `numeric` | `nullable`, `updatable` | `0` |

---

### 6. `public.request_comments`
Comentários e anotações adicionados em solicitações.
- **Chave Primária:** `id`
- **Relacionamentos (Chaves Estrangeiras):**
  - `request_id` -> `public.requests.id`
- **Colunas:**
  | Coluna | Tipo de Dados | Opções | Valor Padrão |
  | --- | --- | --- | --- |
  | `id` | `text` | `updatable` | - |
  | `request_id` | `text` | `nullable`, `updatable` | - |
  | `user_id` | `text` | `nullable`, `updatable` | - |
  | `user_name` | `text` | `nullable`, `updatable` | - |
  | `user_roles` | `ARRAY` | `nullable`, `updatable` | `'{}'::text[]` |
  | `content` | `text` | `updatable` | - |
  | `is_internal` | `boolean` | `nullable`, `updatable` | `false` |
  | `created_at` | `timestamp with time zone` | `nullable`, `updatable` | `now()` |

---

### 7. `public.request_attachments`
Arquivos anexados a solicitações.
- **Chave Primária:** `id`
- **Relacionamentos (Chaves Estrangeiras):**
  - `request_id` -> `public.requests.id`
- **Colunas:**
  | Coluna | Tipo de Dados | Opções | Valor Padrão |
  | --- | --- | --- | --- |
  | `id` | `text` | `updatable` | - |
  | `request_id` | `text` | `nullable`, `updatable` | - |
  | `name` | `text` | `updatable` | - |
  | `url` | `text` | `updatable` | - |
  | `size` | `integer` | `updatable` | - |
  | `created_at` | `timestamp with time zone` | `nullable`, `updatable` | `now()` |

---

### 8. `public.request_status_history`
Registro histórico de transições de status de solicitações.
- **Chave Primária:** `id`
- **Relacionamentos (Chaves Estrangeiras):**
  - `request_id` -> `public.requests.id`
- **Colunas:**
  | Coluna | Tipo de Dados | Opções | Valor Padrão |
  | --- | --- | --- | --- |
  | `id` | `text` | `updatable` | - |
  | `request_id` | `text` | `nullable`, `updatable` | - |
  | `from_status` | `text` | `updatable` | - |
  | `to_status` | `text` | `updatable` | - |
  | `user_id` | `text` | `nullable`, `updatable` | - |
  | `user_name` | `text` | `nullable`, `updatable` | - |
  | `comment` | `text` | `nullable`, `updatable` | - |
  | `created_at` | `timestamp with time zone` | `nullable`, `updatable` | `now()` |

---

### 9. `public.notifications`
Notificações enviadas aos usuários.
- **Chave Primária:** `id`
- **Relacionamentos (Chaves Estrangeiras):**
  - `request_id` -> `public.requests.id`
- **Colunas:**
  | Coluna | Tipo de Dados | Opções | Valor Padrão |
  | --- | --- | --- | --- |
  | `id` | `text` | `updatable` | - |
  | `user_id` | `text` | `nullable`, `updatable` | - |
  | `title` | `text` | `updatable` | - |
  | `description` | `text` | `nullable`, `updatable` | - |
  | `type` | `text` | `updatable` | - |
  | `is_read` | `boolean` | `nullable`, `updatable` | `false` |
  | `request_id` | `text` | `nullable`, `updatable` | - |
  | `request_number` | `text` | `nullable`, `updatable` | - |
  | `created_at` | `timestamp with time zone` | `nullable`, `updatable` | `now()` |

---

### 10. `public.compradores`
Mapeamento dos compradores da empresa.
- **Chave Primária:** `grupo_compras`
- **Colunas:**
  | Coluna | Tipo de Dados | Opções | Valor Padrão |
  | --- | --- | --- | --- |
  | `grupo_compras` | `text` | `updatable` | - |
  | `nome_comprador` | `text` | `updatable` | - |
  | `usuario_sistema` | `text` | `nullable`, `updatable` | - |

---

### 11. `public.buyer_groups`
Associações de usuários do sistema a grupos de compras específicos.
- **Chave Primária:** `id`
- **Colunas:**
  | Coluna | Tipo de Dados | Opções | Valor Padrão |
  | --- | --- | --- | --- |
  | `id` | `text` | `updatable` | - |
  | `user_id` | `text` | `updatable` | - |
  | `group_code` | `text` | `updatable` | - |
  | `is_primary` | `boolean` | `nullable`, `updatable` | `false` |

---

### 12. `public.activity_logs`
Logs de auditoria de atividade do sistema.
- **Chave Primária:** `id`
- **Colunas:**
  | Coluna | Tipo de Dados | Opções | Valor Padrão |
  | --- | --- | --- | --- |
  | `id` | `text` | `updatable` | - |
  | `user_id` | `text` | `nullable`, `updatable` | - |
  | `user_name` | `text` | `nullable`, `updatable` | - |
  | `email` | `text` | `nullable`, `updatable` | - |
  | `module` | `text` | `nullable`, `updatable` | - |
  | `action` | `text` | `nullable`, `updatable` | - |
  | `details` | `text` | `nullable`, `updatable` | - |
  | `created_at` | `timestamp with time zone` | `nullable`, `updatable` | `now()` |

---

### 13. `public.sequences`
Armazena sequências para numeração automática no sistema.
- **Chave Primária:** `key`
- **Colunas:**
  | Coluna | Tipo de Dados | Opções | Valor Padrão |
  | --- | --- | --- | --- |
  | `key` | `text` | `updatable` | - |
  | `value` | `integer` | `nullable`, `updatable` | `1000` |

---

### 14. `public.requisicoes`
Mapeia as Requisições de Compras (ME5A) importadas do SAP.
- **Chave Primária:** `ri` (combinação de RC + Item)
- **Colunas:**
  | Coluna | Tipo de Dados | Opções | Valor Padrão |
  | --- | --- | --- | --- |
  | `ri` | `text` | `updatable` | - |
  | `tipo_de_documento` | `text` | `nullable`, `updatable` | - |
  | `requisicao_de_compra` | `text` | `nullable`, `updatable` | - |
  | `item_reqc` | `text` | `nullable`, `updatable` | - |
  | `data_da_solicitacao` | `date` | `nullable`, `updatable` | - |
  | `requisitante` | `text` | `nullable`, `updatable` | - |
  | `area_solicitante` | `text` | `nullable`, `updatable` | - |
  | `material` | `text` | `nullable`, `updatable` | - |
  | `texto_breve` | `text` | `nullable`, `updatable` | - |
  | `qtd_solicitada` | `numeric` | `nullable`, `updatable` | - |
  | `unidade_de_medida` | `text` | `nullable`, `updatable` | - |
  | `status_processamento` | `text` | `nullable`, `updatable` | - |
  | `codigo_de_eliminacao` | `boolean` | `nullable`, `updatable` | `false` |
  | `categoria_do_item` | `text` | `nullable`, `updatable` | - |
  | `ctg_class_cont` | `text` | `nullable`, `updatable` | - |
  | `tipo_data_de_remessa` | `text` | `nullable`, `updatable` | - |
  | `remessas_de_ate` | `date` | `nullable`, `updatable` | - |
  | `grupo_de_mercadorias` | `text` | `nullable`, `updatable` | - |
  | `centro` | `text` | `nullable`, `updatable` | - |
  | `deposito` | `text` | `nullable`, `updatable` | - |
  | `grupo_de_compradores` | `text` | `nullable`, `updatable` | - |
  | `n_acompanhamento` | `text` | `nullable`, `updatable` | - |
  | `fornecedor_fixo` | `text` | `nullable`, `updatable` | - |
  | `centro_fornecedor` | `text` | `nullable`, `updatable` | - |
  | `organiz_compras` | `text` | `nullable`, `updatable` | - |
  | `contrato_basico` | `text` | `nullable`, `updatable` | - |
  | `it_contrato_superior` | `text` | `nullable`, `updatable` | - |
  | `n_de_reqsc` | `numeric` | `nullable`, `updatable` | - |
  | `criado_por` | `text` | `nullable`, `updatable` | - |
  | `data_do_pedido` | `date` | `nullable`, `updatable` | - |
  | `moeda` | `text` | `nullable`, `updatable` | - |
  | `pedido` | `text` | `nullable`, `updatable` | - |
  | `item_do_pedido` | `text` | `nullable`, `updatable` | - |
  | `apelido` | `text` | `nullable`, `updatable` | - |
  | `aplicacao` | `text` | `nullable`, `updatable` | - |
  | `data_de_remessa` | `date` | `nullable`, `updatable` | - |
  | `codigo_de_bloqueio` | `text` | `nullable`, `updatable` | - |
  | `codigo_de_liberacao` | `text` | `nullable`, `updatable` | - |
  | `concluida` | `text` | `nullable`, `updatable` | - |
  | `data_da_liberacao` | `date` | `nullable`, `updatable` | - |
  | `data_pedido_origem` | `date` | `nullable`, `updatable` | - |
  | `descricao_do_grupo_de_compradores` | `text` | `nullable`, `updatable` | - |
  | `marca_da_peca` | `text` | `nullable`, `updatable` | - |
  | `modelo` | `text` | `nullable`, `updatable` | - |
  | `n_material_fornecedor` | `text` | `nullable`, `updatable` | - |
  | `n_peca_fabricante` | `text` | `nullable`, `updatable` | - |
  | `nome_do_fornecedor` | `text` | `nullable`, `updatable` | - |
  | `peca_original` | `text` | `nullable`, `updatable` | - |
  | `quantidade_pedida` | `numeric` | `nullable`, `updatable` | - |
  | `sugestao_local_compra` | `text` | `nullable`, `updatable` | - |
  | `tempo_procmto_em` | `numeric` | `nullable`, `updatable` | - |
  | `tipo_de_transporte` | `text` | `nullable`, `updatable` | - |
  | `requisicao_externa` | `text` | `nullable`, `updatable` | - |
  | `obs_comprador` | `text` | `nullable`, `updatable` | - |
  | `data_entrega_prevista` | `date` | `nullable`, `updatable` | - |
  | `presente_ultima_carga` | `boolean` | `nullable`, `updatable` | `true` |
  | `eliminado` | `boolean` | `nullable`, `updatable` | `false` |
  | `campos_extras` | `jsonb` | `nullable`, `updatable` | `'{}'::jsonb` |
  | `obs_updated_at` | `timestamp with time zone` | `nullable`, `updatable` | - |
  | `obs_updated_by` | `text` | `nullable`, `updatable` | - |

---

### 15. `public.pedidos`
Mapeia os Pedidos de Compras (ZL0132) importados do SAP.
- **Chave Primária:** `ri`
- **Colunas:**
  | Coluna | Tipo de Dados | Opções | Valor Padrão |
  | --- | --- | --- | --- |
  | `ri` | `text` | `updatable` | - |
  | `n_acomp` | `text` | `nullable`, `updatable` | - |
  | `eflag_e` | `text` | `nullable`, `updatable` | - |
  | `reqc` | `text` | `nullable`, `updatable` | - |
  | `data_rc` | `date` | `nullable`, `updatable` | - |
  | `tpdc` | `text` | `nullable`, `updatable` | - |
  | `requisitante` | `text` | `nullable`, `updatable` | - |
  | `criado_por_rc` | `text` | `nullable`, `updatable` | - |
  | `item` | `text` | `nullable`, `updatable` | - |
  | `material` | `text` | `nullable`, `updatable` | - |
  | `txt_breve` | `text` | `nullable`, `updatable` | - |
  | `tmatt` | `text` | `nullable`, `updatable` | - |
  | `grp_mercads` | `text` | `nullable`, `updatable` | - |
  | `empremp` | `text` | `nullable`, `updatable` | - |
  | `cen_cen` | `text` | `nullable`, `updatable` | - |
  | `dep_dep` | `text` | `nullable`, `updatable` | - |
  | `tipo_doc_compra` | `text` | `nullable`, `updatable` | - |
  | `doc_compra` | `text` | `nullable`, `updatable` | - |
  | `criado_por_pedido` | `text` | `nullable`, `updatable` | - |
  | `data_doc` | `date` | `nullable`, `updatable` | - |
  | `dt_remessa` | `date` | `nullable`, `updatable` | - |
  | `data_migo` | `date` | `nullable`, `updatable` | - |
  | `est_liber` | `text` | `nullable`, `updatable` | - |
  | `estr` | `text` | `nullable`, `updatable` | - |
  | `codigo_liberacao_doc_compra` | `text` | `nullable`, `updatable` | - |
  | `itm_liberacao` | `text` | `nullable`, `updatable` | - |
  | `criado_por_liberacao` | `text` | `nullable`, `updatable` | - |
  | `qtd_pedido` | `numeric` | `nullable`, `updatable` | - |
  | `por` | `text` | `nullable`, `updatable` | - |
  | `qtd_fornecida` | `numeric` | `nullable`, `updatable` | - |
  | `crf` | `text` | `nullable`, `updatable` | - |
  | `ump_1` | `text` | `nullable`, `updatable` | - |
  | `unidade_medida_pedido` | `text` | `nullable`, `updatable` | - |
  | `preco_liquido_unit` | `numeric` | `nullable`, `updatable` | - |
  | `moeda_1` | `text` | `nullable`, `updatable` | - |
  | `valor_em_brl` | `numeric` | `nullable`, `updatable` | - |
  | `moeda_2` | `text` | `nullable`, `updatable` | - |
  | `ump_2` | `text` | `nullable`, `updatable` | - |
  | `valor_liquido` | `numeric` | `nullable`, `updatable` | - |
  | `fornecedor_codigo` | `text` | `nullable`, `updatable` | - |
  | `cnpj_fornecedor` | `text` | `nullable`, `updatable` | - |
  | `fornecedor_nome` | `text` | `nullable`, `updatable` | - |
  | `regiao_uf` | `text` | `nullable`, `updatable` | - |
  | `req_cotacao` | `text` | `nullable`, `updatable` | - |
  | `data_pc_sc` | `date` | `nullable`, `updatable` | - |
  | `item_rc_cotacao` | `text` | `nullable`, `updatable` | - |
  | `upp` | `text` | `nullable`, `updatable` | - |
  | `valor_efetivo` | `numeric` | `nullable`, `updatable` | - |
  | `moeda_3` | `text` | `nullable`, `updatable` | - |
  | `doc_compra_ref` | `text` | `nullable`, `updatable` | - |
  | `itm_ref` | `text` | `nullable`, `updatable` | - |
  | `ftf` | `text" | `nullable`, `updatable` | - |
  | `posicao` | `text` | `nullable`, `updatable` | - |
  | `condicao_pagamento` | `text` | `nullable`, `updatable` | - |
  | `criado_por_condicao` | `text` | `nullable`, `updatable` | - |
  | `modificado_em` | `timestamp with time zone` | `nullable`, `updatable` | - |
  | `contrato` | `text` | `nullable`, `updatable` | - |
  | `item_contrato` | `text` | `nullable`, `updatable` | - |
  | `cn_lcr_parcs` | `text` | `nullable`, `updatable` | - |
  | `categoria` | `text` | `nullable`, `updatable` | - |
  | `grupo_mercadoria_curto` | `text` | `nullable`, `updatable` | - |
  | `ci` | `text` | `nullable`, `updatable` | - |
  | `unidade_medida_basica` | `text` | `nullable`, `updatable` | - |
  | `ump_3` | `text` | `nullable`, `updatable` | - |
  | `campos_extras` | `jsonb` | `nullable`, `updatable` | `'{}'::jsonb` |

---

### 16. `public.import_logs`
Logs de histórico de importações de planilhas de dados SAP.
- **Chave Primária:** `id`
- **Colunas:**
  | Coluna | Tipo de Dados | Opções | Valor Padrão |
  | --- | --- | --- | --- |
  | `id` | `text` | `updatable` | - |
  | `type` | `text` | `updatable` | - |
  | `user_name` | `text` | `nullable`, `updatable` | - |
  | `filename` | `text` | `nullable`, `updatable` | - |
  | `records_read` | `integer` | `nullable`, `updatable` | `0` |
  | `records_inserted` | `integer` | `nullable`, `updatable` | `0` |
  | `records_updated` | `integer` | `nullable`, `updatable` | `0` |
  | `records_unchanged` | `integer` | `nullable`, `updatable` | `0` |
  | `records_eliminated` | `integer` | `nullable`, `updatable` | `0` |
  | `columns_missing` | `jsonb` | `nullable`, `updatable` | `'[]'::jsonb` |
  | `columns_new` | `jsonb` | `nullable`, `updatable` | `'[]'::jsonb` |
  | `created_at` | `timestamp with time zone` | `nullable`, `updatable` | `now()` |
  | `quantity_changes` | `jsonb` | `nullable`, `updatable` | `'[]'::jsonb` |
  | `missing_ris` | `jsonb` | `nullable`, `updatable` | `'[]'::jsonb` |

---

### 17. `public.obs_historico`
Histórico de auditoria para observações e atualizações manuais de dados SAP.
- **Chave Primária:** `id`
- **Colunas:**
  | Coluna | Tipo de Dados | Opções | Valor Padrão |
  | --- | --- | --- | --- |
  | `id` | `text` | `updatable` | - |
  | `ri` | `text` | `updatable` | - |
  | `campo_alterado` | `text` | `updatable` | - |
  | `valor_anterior` | `text` | `nullable`, `updatable` | - |
  | `valor_novo` | `text` | `nullable`, `updatable` | - |
  | `user_name` | `text` | `updatable` | - |
  | `created_at` | `timestamp with time zone` | `nullable`, `updatable` | `now()` |

---

### 18. `public.pedidosforn`
Histórico de pedidos de compra associando fornecedores a códigos de material (com chave única composta por material, cod_forn, data_pedido).
- **Chave Primária:** `id`
- **Índices:**
  - `idx_pedidosforn_material` (material)
  - `idx_pedidosforn_cnpj` (cnpj)
- **Colunas:**
  | Coluna | Tipo de Dados | Opções | Valor Padrão |
  | --- | --- | --- | --- |
  | `id` | `uuid` | `PRIMARY KEY` | `gen_random_uuid()` |
  | `material` | `text` | `not null`, `updatable` | - |
  | `txt_breve` | `text` | `nullable`, `updatable` | - |
  | `cod_forn` | `text` | `nullable`, `updatable` | - |
  | `cnpj` | `text` | `nullable`, `updatable` | - |
  | `fornecedor` | `text` | `nullable`, `updatable` | - |
  | `regiao_uf` | `text` | `nullable`, `updatable` | - |
  | `data_pedido` | `date` | `nullable`, `updatable` | - |
  | `campos_extras` | `jsonb` | `updatable` | `'{}'::jsonb` |
  | `created_at` | `timestamp with time zone` | `nullable` | `now()` |
  | `updated_at` | `timestamp with time zone` | `nullable` | `now()` |

---

### 19. `public.contatos`
Cadastro de contatos e classificação mercadológica por fornecedor.
- **Chave Primária:** `id`
- **Restrição de Unicidade:** `cod_vendor` é único.
- **Colunas:**
  | Coluna | Tipo de Dados | Opções | Valor Padrão |
  | --- | --- | --- | --- |
  | `id` | `uuid` | `PRIMARY KEY` | `gen_random_uuid()` |
  | `cod_vendor` | `text` | `unique`, `updatable` | - |
  | `fornecedor` | `text` | `nullable`, `updatable` | - |
  | `nome_fantasia` | `text` | `nullable`, `updatable` | - |
  | `telefone` | `text` | `nullable`, `updatable` | - |
  | `email` | `text` | `nullable`, `updatable` | - |
  | `classificacao` | `text` | `nullable`, `updatable` | - |
  | `created_at` | `timestamp with time zone` | `nullable` | `now()` |
  | `updated_at` | `timestamp with time zone` | `nullable` | `now()` |
