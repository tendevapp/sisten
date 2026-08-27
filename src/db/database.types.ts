export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      almoxarifado_chegadas: {
        Row: {
          created_at: string
          data_chegada: string
          registrado_por_id: string | null
          registrado_por_nome: string | null
          ri: string
          rm: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          data_chegada: string
          registrado_por_id?: string | null
          registrado_por_nome?: string | null
          ri: string
          rm?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          data_chegada?: string
          registrado_por_id?: string | null
          registrado_por_nome?: string | null
          ri?: string
          rm?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      cadastro_grupo_mercadoria: {
        Row: {
          classificacao_nivel1: string | null
          codigo: string
          codigo_pai: string | null
          denominacao: string
          denominacao2: string | null
        }
        Insert: {
          classificacao_nivel1?: string | null
          codigo: string
          codigo_pai?: string | null
          denominacao: string
          denominacao2?: string | null
        }
        Update: {
          classificacao_nivel1?: string | null
          codigo?: string
          codigo_pai?: string | null
          denominacao?: string
          denominacao2?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cadastro_grupo_mercadoria_codigo_pai_fkey"
            columns: ["codigo_pai"]
            isOneToOne: false
            referencedRelation: "cadastro_grupo_mercadoria"
            referencedColumns: ["codigo"]
          },
        ]
      }
      cadastro_status_requisicao: {
        Row: {
          codigo: string
          descricao: string
          detalhe: string | null
        }
        Insert: {
          codigo: string
          descricao: string
          detalhe?: string | null
        }
        Update: {
          codigo?: string
          descricao?: string
          detalhe?: string | null
        }
        Relationships: []
      }
      cadastro_tipo_documento: {
        Row: {
          categoria: string
          codigo: string
          denominacao: string
        }
        Insert: {
          categoria: string
          codigo: string
          denominacao: string
        }
        Update: {
          categoria?: string
          codigo?: string
          denominacao?: string
        }
        Relationships: []
      }
      cadastro_tipo_movimento: {
        Row: {
          codigo: string
          descricao: string | null
        }
        Insert: {
          codigo: string
          descricao?: string | null
        }
        Update: {
          codigo?: string
          descricao?: string | null
        }
        Relationships: []
      }
      cadastro_tipodoc: {
        Row: {
          categoria_modulo: string | null
          codigo: string
          created_at: string | null
          descricao_operacional: string | null
          tipo_documento: string
          updated_at: string | null
        }
        Insert: {
          categoria_modulo?: string | null
          codigo: string
          created_at?: string | null
          descricao_operacional?: string | null
          tipo_documento: string
          updated_at?: string | null
        }
        Update: {
          categoria_modulo?: string | null
          codigo?: string
          created_at?: string | null
          descricao_operacional?: string | null
          tipo_documento?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      cadastro_tipodoc_fbl1n: {
        Row: {
          categoria_modulo: string | null
          codigo: string
          created_at: string | null
          descricao_operacional: string | null
          tipo_documento: string
          updated_at: string | null
        }
        Insert: {
          categoria_modulo?: string | null
          codigo: string
          created_at?: string | null
          descricao_operacional?: string | null
          tipo_documento: string
          updated_at?: string | null
        }
        Update: {
          categoria_modulo?: string | null
          codigo?: string
          created_at?: string | null
          descricao_operacional?: string | null
          tipo_documento?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      contrato_anexos: {
        Row: {
          created_at: string
          documento_compras: string
          id: string
          mime_type: string | null
          name: string
          size: number | null
          storage_path: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          documento_compras: string
          id?: string
          mime_type?: string | null
          name: string
          size?: number | null
          storage_path: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          documento_compras?: string
          id?: string
          mime_type?: string | null
          name?: string
          size?: number | null
          storage_path?: string
          uploaded_by?: string | null
        }
        Relationships: []
      }
      contratos_detalhes: {
        Row: {
          codigo_fornecedor: string | null
          documento_compras: string
          escopo_servico: string | null
          gestor: string | null
          modalidade: string | null
          po_pedido_compra: string | null
          status: string | null
          updated_at: string
          updated_by: string | null
          valor_parcela: number | null
          vigencia_label: string | null
        }
        Insert: {
          codigo_fornecedor?: string | null
          documento_compras: string
          escopo_servico?: string | null
          gestor?: string | null
          modalidade?: string | null
          po_pedido_compra?: string | null
          status?: string | null
          updated_at?: string
          updated_by?: string | null
          valor_parcela?: number | null
          vigencia_label?: string | null
        }
        Update: {
          codigo_fornecedor?: string | null
          documento_compras?: string
          escopo_servico?: string | null
          gestor?: string | null
          modalidade?: string | null
          po_pedido_compra?: string | null
          status?: string | null
          updated_at?: string
          updated_by?: string | null
          valor_parcela?: number | null
          vigencia_label?: string | null
        }
        Relationships: []
      }
      core_grupos_compradores: {
        Row: {
          group_code: string
          id: string
          is_primary: boolean | null
          user_id: string
        }
        Insert: {
          group_code: string
          id: string
          is_primary?: boolean | null
          user_id: string
        }
        Update: {
          group_code?: string
          id?: string
          is_primary?: boolean | null
          user_id?: string
        }
        Relationships: []
      }
      core_logs_atividade: {
        Row: {
          action: string | null
          created_at: string | null
          details: string | null
          email: string | null
          id: string
          module: string | null
          user_id: string | null
          user_name: string | null
        }
        Insert: {
          action?: string | null
          created_at?: string | null
          details?: string | null
          email?: string | null
          id: string
          module?: string | null
          user_id?: string | null
          user_name?: string | null
        }
        Update: {
          action?: string | null
          created_at?: string | null
          details?: string | null
          email?: string | null
          id?: string
          module?: string | null
          user_id?: string | null
          user_name?: string | null
        }
        Relationships: []
      }
      core_notificacoes: {
        Row: {
          context_key: string | null
          created_at: string | null
          description: string | null
          id: string
          is_read: boolean | null
          request_id: string | null
          request_number: string | null
          title: string
          type: string
          user_id: string | null
        }
        Insert: {
          context_key?: string | null
          created_at?: string | null
          description?: string | null
          id: string
          is_read?: boolean | null
          request_id?: string | null
          request_number?: string | null
          title: string
          type: string
          user_id?: string | null
        }
        Update: {
          context_key?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_read?: boolean | null
          request_id?: string | null
          request_number?: string | null
          title?: string
          type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "core_solicitacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
        ]
      }
      core_perfis: {
        Row: {
          aprovador_cadastro_sap: boolean
          aprovador_setores: Json
          cargo: string | null
          created_at: string | null
          email: string
          grupo_compras: string | null
          id: string
          name: string
          notification_preferences: string | null
          page_access: Json
          roles: string[] | null
          sector_id: string | null
          status: string | null
          tours_seen: Json
        }
        Insert: {
          aprovador_cadastro_sap?: boolean
          aprovador_setores?: Json
          cargo?: string | null
          created_at?: string | null
          email: string
          grupo_compras?: string | null
          id: string
          name: string
          notification_preferences?: string | null
          page_access?: Json
          roles?: string[] | null
          sector_id?: string | null
          status?: string | null
          tours_seen?: Json
        }
        Update: {
          aprovador_cadastro_sap?: boolean
          aprovador_setores?: Json
          cargo?: string | null
          created_at?: string | null
          email?: string
          grupo_compras?: string | null
          id?: string
          name?: string
          notification_preferences?: string | null
          page_access?: Json
          roles?: string[] | null
          sector_id?: string | null
          status?: string | null
          tours_seen?: Json
        }
        Relationships: [
          {
            foreignKeyName: "profiles_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "core_setores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "sectors"
            referencedColumns: ["id"]
          },
        ]
      }
      core_setores: {
        Row: {
          helpdesk_enabled: boolean | null
          id: string
          is_support: boolean | null
          name: string
          sap_area_code: string | null
        }
        Insert: {
          helpdesk_enabled?: boolean | null
          id: string
          is_support?: boolean | null
          name: string
          sap_area_code?: string | null
        }
        Update: {
          helpdesk_enabled?: boolean | null
          id?: string
          is_support?: boolean | null
          name?: string
          sap_area_code?: string | null
        }
        Relationships: []
      }
      core_solicitacoes: {
        Row: {
          atendente_id: string | null
          atendente_name: string | null
          brand: string | null
          category_id: string | null
          comprador_id: string | null
          contrato_tipo: string | null
          created_at: string | null
          criticality: number
          data_necessidade: string | null
          first_response_at: string | null
          fornecedor_terceiro: string | null
          id: string
          justificativa: string | null
          last_paused_at: string | null
          linked_rm_number: string | null
          local: string | null
          number: string
          paused_minutes: number | null
          prazo_conclusao: string | null
          rating: number | null
          rating_comment: string | null
          registration_type: string | null
          representante_cargo: string | null
          representante_email: string | null
          representante_nome: string | null
          representante_telefone: string | null
          resolved_at: string | null
          solicitante_id: string | null
          solicitante_name: string | null
          solicitante_sector_id: string | null
          status: string
          suggested_supplier: string | null
          target_sector_id: string | null
          tipo_compra: string | null
          titulo: string | null
          type: string
          updated_at: string | null
        }
        Insert: {
          atendente_id?: string | null
          atendente_name?: string | null
          brand?: string | null
          category_id?: string | null
          comprador_id?: string | null
          contrato_tipo?: string | null
          created_at?: string | null
          criticality: number
          data_necessidade?: string | null
          first_response_at?: string | null
          fornecedor_terceiro?: string | null
          id: string
          justificativa?: string | null
          last_paused_at?: string | null
          linked_rm_number?: string | null
          local?: string | null
          number: string
          paused_minutes?: number | null
          prazo_conclusao?: string | null
          rating?: number | null
          rating_comment?: string | null
          registration_type?: string | null
          representante_cargo?: string | null
          representante_email?: string | null
          representante_nome?: string | null
          representante_telefone?: string | null
          resolved_at?: string | null
          solicitante_id?: string | null
          solicitante_name?: string | null
          solicitante_sector_id?: string | null
          status: string
          suggested_supplier?: string | null
          target_sector_id?: string | null
          tipo_compra?: string | null
          titulo?: string | null
          type: string
          updated_at?: string | null
        }
        Update: {
          atendente_id?: string | null
          atendente_name?: string | null
          brand?: string | null
          category_id?: string | null
          comprador_id?: string | null
          contrato_tipo?: string | null
          created_at?: string | null
          criticality?: number
          data_necessidade?: string | null
          first_response_at?: string | null
          fornecedor_terceiro?: string | null
          id?: string
          justificativa?: string | null
          last_paused_at?: string | null
          linked_rm_number?: string | null
          local?: string | null
          number?: string
          paused_minutes?: number | null
          prazo_conclusao?: string | null
          rating?: number | null
          rating_comment?: string | null
          registration_type?: string | null
          representante_cargo?: string | null
          representante_email?: string | null
          representante_nome?: string | null
          representante_telefone?: string | null
          resolved_at?: string | null
          solicitante_id?: string | null
          solicitante_name?: string | null
          solicitante_sector_id?: string | null
          status?: string
          suggested_supplier?: string | null
          target_sector_id?: string | null
          tipo_compra?: string | null
          titulo?: string | null
          type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "requests_atendente_id_fkey"
            columns: ["atendente_id"]
            isOneToOne: false
            referencedRelation: "core_perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_atendente_id_fkey"
            columns: ["atendente_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_comprador_id_fkey"
            columns: ["comprador_id"]
            isOneToOne: false
            referencedRelation: "core_perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_comprador_id_fkey"
            columns: ["comprador_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_solicitante_id_fkey"
            columns: ["solicitante_id"]
            isOneToOne: false
            referencedRelation: "core_perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_solicitante_id_fkey"
            columns: ["solicitante_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_solicitante_sector_id_fkey"
            columns: ["solicitante_sector_id"]
            isOneToOne: false
            referencedRelation: "core_setores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_solicitante_sector_id_fkey"
            columns: ["solicitante_sector_id"]
            isOneToOne: false
            referencedRelation: "sectors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_target_sector_id_fkey"
            columns: ["target_sector_id"]
            isOneToOne: false
            referencedRelation: "core_setores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_target_sector_id_fkey"
            columns: ["target_sector_id"]
            isOneToOne: false
            referencedRelation: "sectors"
            referencedColumns: ["id"]
          },
        ]
      }
      core_solicitacoes_anexos: {
        Row: {
          created_at: string | null
          id: string
          material_code: string | null
          mime_type: string | null
          name: string
          request_id: string | null
          request_item_id: string | null
          size: number
          size_original: number | null
          storage_path: string | null
          uploaded_by: string | null
          url: string
        }
        Insert: {
          created_at?: string | null
          id: string
          material_code?: string | null
          mime_type?: string | null
          name: string
          request_id?: string | null
          request_item_id?: string | null
          size: number
          size_original?: number | null
          storage_path?: string | null
          uploaded_by?: string | null
          url: string
        }
        Update: {
          created_at?: string | null
          id?: string
          material_code?: string | null
          mime_type?: string | null
          name?: string
          request_id?: string | null
          request_item_id?: string | null
          size?: number
          size_original?: number | null
          storage_path?: string | null
          uploaded_by?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "request_attachments_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "core_solicitacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_attachments_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
        ]
      }
      core_solicitacoes_comentarios: {
        Row: {
          content: string
          created_at: string | null
          id: string
          is_internal: boolean | null
          request_id: string | null
          user_id: string | null
          user_name: string | null
          user_roles: string[] | null
        }
        Insert: {
          content: string
          created_at?: string | null
          id: string
          is_internal?: boolean | null
          request_id?: string | null
          user_id?: string | null
          user_name?: string | null
          user_roles?: string[] | null
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          is_internal?: boolean | null
          request_id?: string | null
          user_id?: string | null
          user_name?: string | null
          user_roles?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "request_comments_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "core_solicitacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_comments_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
        ]
      }
      core_solicitacoes_historico_status: {
        Row: {
          comment: string | null
          created_at: string | null
          from_status: string
          id: string
          request_id: string | null
          to_status: string
          user_id: string | null
          user_name: string | null
        }
        Insert: {
          comment?: string | null
          created_at?: string | null
          from_status: string
          id: string
          request_id?: string | null
          to_status: string
          user_id?: string | null
          user_name?: string | null
        }
        Update: {
          comment?: string | null
          created_at?: string | null
          from_status?: string
          id?: string
          request_id?: string | null
          to_status?: string
          user_id?: string | null
          user_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "request_status_history_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "core_solicitacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_status_history_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
        ]
      }
      core_solicitacoes_itens: {
        Row: {
          brand: string | null
          description: string
          estimated_value: number | null
          has_no_sap_code: boolean | null
          id: string
          is_generic: boolean | null
          is_similar_allowed: boolean | null
          observation: string | null
          quantity: number
          reference_link: string | null
          request_id: string | null
          sap_code: string | null
          suggested_supplier: string | null
          unit: string
        }
        Insert: {
          brand?: string | null
          description: string
          estimated_value?: number | null
          has_no_sap_code?: boolean | null
          id: string
          is_generic?: boolean | null
          is_similar_allowed?: boolean | null
          observation?: string | null
          quantity: number
          reference_link?: string | null
          request_id?: string | null
          sap_code?: string | null
          suggested_supplier?: string | null
          unit: string
        }
        Update: {
          brand?: string | null
          description?: string
          estimated_value?: number | null
          has_no_sap_code?: boolean | null
          id?: string
          is_generic?: boolean | null
          is_similar_allowed?: boolean | null
          observation?: string | null
          quantity?: number
          reference_link?: string | null
          request_id?: string | null
          sap_code?: string | null
          suggested_supplier?: string | null
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "request_items_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "core_solicitacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_items_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
        ]
      }
      expedicao_carregamentos: {
        Row: {
          created_at: string
          criado_por: string
          criado_por_nome: string
          empresa: string
          enviado_em: string | null
          id: string
          numero: string
          observacoes: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          criado_por: string
          criado_por_nome: string
          empresa?: string
          enviado_em?: string | null
          id?: string
          numero: string
          observacoes?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          criado_por?: string
          criado_por_nome?: string
          empresa?: string
          enviado_em?: string | null
          id?: string
          numero?: string
          observacoes?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      expedicao_fotos: {
        Row: {
          carregamento_id: string
          created_at: string
          criado_por: string | null
          etapa: string
          id: string
          nome_arquivo: string | null
          storage_path: string
          tramo_id: string
        }
        Insert: {
          carregamento_id: string
          created_at?: string
          criado_por?: string | null
          etapa: string
          id?: string
          nome_arquivo?: string | null
          storage_path: string
          tramo_id: string
        }
        Update: {
          carregamento_id?: string
          created_at?: string
          criado_por?: string | null
          etapa?: string
          id?: string
          nome_arquivo?: string | null
          storage_path?: string
          tramo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expedicao_fotos_carregamento_id_fkey"
            columns: ["carregamento_id"]
            isOneToOne: false
            referencedRelation: "expedicao_carregamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expedicao_fotos_tramo_id_fkey"
            columns: ["tramo_id"]
            isOneToOne: false
            referencedRelation: "expedicao_tramos"
            referencedColumns: ["id"]
          },
        ]
      }
      expedicao_tramos: {
        Row: {
          carregamento_id: string
          carreta_placa: string
          carreta_uf: string | null
          cavalo_placa: string
          cavalo_uf: string | null
          created_at: string
          data: string | null
          dolly_placa: string
          dolly_uf: string | null
          hora_chegada_portaria: string | null
          hora_entrada_patio: string | null
          hora_expedicao: string | null
          id: string
          motorista: string
          obs_chegada_portaria: string | null
          obs_entrada_patio: string | null
          obs_expedicao: string | null
          ordem: number
          tramo: string
          updated_at: string
        }
        Insert: {
          carregamento_id: string
          carreta_placa?: string
          carreta_uf?: string | null
          cavalo_placa?: string
          cavalo_uf?: string | null
          created_at?: string
          data?: string | null
          dolly_placa?: string
          dolly_uf?: string | null
          hora_chegada_portaria?: string | null
          hora_entrada_patio?: string | null
          hora_expedicao?: string | null
          id?: string
          motorista?: string
          obs_chegada_portaria?: string | null
          obs_entrada_patio?: string | null
          obs_expedicao?: string | null
          ordem?: number
          tramo: string
          updated_at?: string
        }
        Update: {
          carregamento_id?: string
          carreta_placa?: string
          carreta_uf?: string | null
          cavalo_placa?: string
          cavalo_uf?: string | null
          created_at?: string
          data?: string | null
          dolly_placa?: string
          dolly_uf?: string | null
          hora_chegada_portaria?: string | null
          hora_entrada_patio?: string | null
          hora_expedicao?: string | null
          id?: string
          motorista?: string
          obs_chegada_portaria?: string | null
          obs_entrada_patio?: string | null
          obs_expedicao?: string | null
          ordem?: number
          tramo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expedicao_tramos_carregamento_id_fkey"
            columns: ["carregamento_id"]
            isOneToOne: false
            referencedRelation: "expedicao_carregamentos"
            referencedColumns: ["id"]
          },
        ]
      }
      ipca_indice: {
        Row: {
          atualizado_em: string
          mes: string
          numero_indice: number
        }
        Insert: {
          atualizado_em?: string
          mes: string
          numero_indice: number
        }
        Update: {
          atualizado_em?: string
          mes?: string
          numero_indice?: number
        }
        Relationships: []
      }
      ops_api_uso: {
        Row: {
          api_id: string
          completion_tokens: number | null
          created_at: string
          custo_usd: number | null
          duracao_ms: number | null
          erro_mensagem: string | null
          id: string
          modelo: string | null
          prompt_tokens: number | null
          sucesso: boolean
          total_tokens: number | null
          user_id: string | null
          user_name: string | null
        }
        Insert: {
          api_id: string
          completion_tokens?: number | null
          created_at?: string
          custo_usd?: number | null
          duracao_ms?: number | null
          erro_mensagem?: string | null
          id?: string
          modelo?: string | null
          prompt_tokens?: number | null
          sucesso: boolean
          total_tokens?: number | null
          user_id?: string | null
          user_name?: string | null
        }
        Update: {
          api_id?: string
          completion_tokens?: number | null
          created_at?: string
          custo_usd?: number | null
          duracao_ms?: number | null
          erro_mensagem?: string | null
          id?: string
          modelo?: string | null
          prompt_tokens?: number | null
          sucesso?: boolean
          total_tokens?: number | null
          user_id?: string | null
          user_name?: string | null
        }
        Relationships: []
      }
      ops_conversoes_markdown: {
        Row: {
          caracteres: number | null
          created_at: string
          custo_usd: number | null
          duracao_ms: number | null
          erro_mensagem: string | null
          formato: string
          id: string
          markdown: string | null
          modelo: string | null
          nome_arquivo: string
          sucesso: boolean
          tamanho_bytes: number | null
          tokens: number | null
          tokens_reais: boolean
          user_id: string | null
          user_name: string | null
          via: string
        }
        Insert: {
          caracteres?: number | null
          created_at?: string
          custo_usd?: number | null
          duracao_ms?: number | null
          erro_mensagem?: string | null
          formato: string
          id?: string
          markdown?: string | null
          modelo?: string | null
          nome_arquivo: string
          sucesso: boolean
          tamanho_bytes?: number | null
          tokens?: number | null
          tokens_reais?: boolean
          user_id?: string | null
          user_name?: string | null
          via: string
        }
        Update: {
          caracteres?: number | null
          created_at?: string
          custo_usd?: number | null
          duracao_ms?: number | null
          erro_mensagem?: string | null
          formato?: string
          id?: string
          markdown?: string | null
          modelo?: string | null
          nome_arquivo?: string
          sucesso?: boolean
          tamanho_bytes?: number | null
          tokens?: number | null
          tokens_reais?: boolean
          user_id?: string | null
          user_name?: string | null
          via?: string
        }
        Relationships: []
      }
      ops_dataset_versoes: {
        Row: {
          dataset: string
          row_count: number | null
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          dataset: string
          row_count?: number | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          dataset?: string
          row_count?: number | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: []
      }
      ops_eventos_uso: {
        Row: {
          created_at: string
          email: string | null
          event_type: string
          id: string
          page_label: string | null
          path: string | null
          session_id: string | null
          user_id: string | null
          user_name: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          event_type: string
          id?: string
          page_label?: string | null
          path?: string | null
          session_id?: string | null
          user_id?: string | null
          user_name?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          event_type?: string
          id?: string
          page_label?: string | null
          path?: string | null
          session_id?: string | null
          user_id?: string | null
          user_name?: string | null
        }
        Relationships: []
      }
      ops_feedback: {
        Row: {
          admin_notes: string | null
          console_logs: Json | null
          created_at: string
          description: string
          error_stack: string | null
          id: string
          page_path: string
          screenshot_path: string | null
          status: string
          type: string
          updated_at: string
          user_agent: string | null
          user_email: string | null
          user_id: string | null
          user_name: string
        }
        Insert: {
          admin_notes?: string | null
          console_logs?: Json | null
          created_at?: string
          description: string
          error_stack?: string | null
          id: string
          page_path: string
          screenshot_path?: string | null
          status?: string
          type: string
          updated_at?: string
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
          user_name: string
        }
        Update: {
          admin_notes?: string | null
          console_logs?: Json | null
          created_at?: string
          description?: string
          error_stack?: string | null
          id?: string
          page_path?: string
          screenshot_path?: string | null
          status?: string
          type?: string
          updated_at?: string
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
          user_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "feedback_reports_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "core_perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_reports_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ops_importacoes: {
        Row: {
          columns_missing: Json | null
          columns_new: Json | null
          created_at: string | null
          filename: string | null
          id: string
          ignored_rows: Json | null
          ignored_rows_count: number | null
          missing_ris: Json | null
          missing_ris_count: number | null
          new_ris: Json | null
          quantity_changes: Json | null
          records_eliminated: number | null
          records_inserted: number | null
          records_read: number | null
          records_unchanged: number | null
          records_updated: number | null
          type: string
          user_name: string | null
        }
        Insert: {
          columns_missing?: Json | null
          columns_new?: Json | null
          created_at?: string | null
          filename?: string | null
          id: string
          ignored_rows?: Json | null
          ignored_rows_count?: number | null
          missing_ris?: Json | null
          missing_ris_count?: number | null
          new_ris?: Json | null
          quantity_changes?: Json | null
          records_eliminated?: number | null
          records_inserted?: number | null
          records_read?: number | null
          records_unchanged?: number | null
          records_updated?: number | null
          type: string
          user_name?: string | null
        }
        Update: {
          columns_missing?: Json | null
          columns_new?: Json | null
          created_at?: string | null
          filename?: string | null
          id?: string
          ignored_rows?: Json | null
          ignored_rows_count?: number | null
          missing_ris?: Json | null
          missing_ris_count?: number | null
          new_ris?: Json | null
          quantity_changes?: Json | null
          records_eliminated?: number | null
          records_inserted?: number | null
          records_read?: number | null
          records_unchanged?: number | null
          records_updated?: number | null
          type?: string
          user_name?: string | null
        }
        Relationships: []
      }
      pedidos: {
        Row: {
          campos_extras: Json | null
          categoria: string | null
          cen_cen: string | null
          ci: string | null
          cn_lcr_parcs: string | null
          cnpj_fornecedor: string | null
          codigo_liberacao_doc_compra: string | null
          condicao_pagamento: string | null
          contrato: string | null
          crf: string | null
          criado_por_condicao: string | null
          criado_por_liberacao: string | null
          criado_por_pedido: string | null
          criado_por_rc: string | null
          data_doc: string | null
          data_migo: string | null
          data_pc_sc: string | null
          data_rc: string | null
          dep_dep: string | null
          doc_compra: string | null
          doc_compra_ref: string | null
          dt_remessa: string | null
          eflag_e: string | null
          empremp: string | null
          est_liber: string | null
          estr: string | null
          fornecedor_codigo: string | null
          fornecedor_nome: string | null
          ftf: string | null
          grp_mercads: string | null
          grupo_mercadoria_curto: string | null
          item: string | null
          item_contrato: string | null
          item_rc_cotacao: string | null
          itm_liberacao: string | null
          itm_ref: string | null
          material: string | null
          modificado_em: string | null
          moeda_1: string | null
          moeda_2: string | null
          moeda_3: string | null
          n_acomp: string | null
          por: string | null
          posicao: string | null
          preco_liquido_unit: number | null
          qtd_fornecida: number | null
          qtd_pedido: number | null
          regiao_uf: string | null
          req_cotacao: string | null
          reqc: string | null
          requisitante: string | null
          ri: string
          tipo_doc_compra: string | null
          tmatt: string | null
          tpdc: string | null
          txt_breve: string | null
          ump_1: string | null
          ump_2: string | null
          ump_3: string | null
          unidade_medida_basica: string | null
          unidade_medida_pedido: string | null
          upp: string | null
          valor_efetivo: number | null
          valor_em_brl: number | null
          valor_liquido: number | null
        }
        Insert: {
          campos_extras?: Json | null
          categoria?: string | null
          cen_cen?: string | null
          ci?: string | null
          cn_lcr_parcs?: string | null
          cnpj_fornecedor?: string | null
          codigo_liberacao_doc_compra?: string | null
          condicao_pagamento?: string | null
          contrato?: string | null
          crf?: string | null
          criado_por_condicao?: string | null
          criado_por_liberacao?: string | null
          criado_por_pedido?: string | null
          criado_por_rc?: string | null
          data_doc?: string | null
          data_migo?: string | null
          data_pc_sc?: string | null
          data_rc?: string | null
          dep_dep?: string | null
          doc_compra?: string | null
          doc_compra_ref?: string | null
          dt_remessa?: string | null
          eflag_e?: string | null
          empremp?: string | null
          est_liber?: string | null
          estr?: string | null
          fornecedor_codigo?: string | null
          fornecedor_nome?: string | null
          ftf?: string | null
          grp_mercads?: string | null
          grupo_mercadoria_curto?: string | null
          item?: string | null
          item_contrato?: string | null
          item_rc_cotacao?: string | null
          itm_liberacao?: string | null
          itm_ref?: string | null
          material?: string | null
          modificado_em?: string | null
          moeda_1?: string | null
          moeda_2?: string | null
          moeda_3?: string | null
          n_acomp?: string | null
          por?: string | null
          posicao?: string | null
          preco_liquido_unit?: number | null
          qtd_fornecida?: number | null
          qtd_pedido?: number | null
          regiao_uf?: string | null
          req_cotacao?: string | null
          reqc?: string | null
          requisitante?: string | null
          ri: string
          tipo_doc_compra?: string | null
          tmatt?: string | null
          tpdc?: string | null
          txt_breve?: string | null
          ump_1?: string | null
          ump_2?: string | null
          ump_3?: string | null
          unidade_medida_basica?: string | null
          unidade_medida_pedido?: string | null
          upp?: string | null
          valor_efetivo?: number | null
          valor_em_brl?: number | null
          valor_liquido?: number | null
        }
        Update: {
          campos_extras?: Json | null
          categoria?: string | null
          cen_cen?: string | null
          ci?: string | null
          cn_lcr_parcs?: string | null
          cnpj_fornecedor?: string | null
          codigo_liberacao_doc_compra?: string | null
          condicao_pagamento?: string | null
          contrato?: string | null
          crf?: string | null
          criado_por_condicao?: string | null
          criado_por_liberacao?: string | null
          criado_por_pedido?: string | null
          criado_por_rc?: string | null
          data_doc?: string | null
          data_migo?: string | null
          data_pc_sc?: string | null
          data_rc?: string | null
          dep_dep?: string | null
          doc_compra?: string | null
          doc_compra_ref?: string | null
          dt_remessa?: string | null
          eflag_e?: string | null
          empremp?: string | null
          est_liber?: string | null
          estr?: string | null
          fornecedor_codigo?: string | null
          fornecedor_nome?: string | null
          ftf?: string | null
          grp_mercads?: string | null
          grupo_mercadoria_curto?: string | null
          item?: string | null
          item_contrato?: string | null
          item_rc_cotacao?: string | null
          itm_liberacao?: string | null
          itm_ref?: string | null
          material?: string | null
          modificado_em?: string | null
          moeda_1?: string | null
          moeda_2?: string | null
          moeda_3?: string | null
          n_acomp?: string | null
          por?: string | null
          posicao?: string | null
          preco_liquido_unit?: number | null
          qtd_fornecida?: number | null
          qtd_pedido?: number | null
          regiao_uf?: string | null
          req_cotacao?: string | null
          reqc?: string | null
          requisitante?: string | null
          ri?: string
          tipo_doc_compra?: string | null
          tmatt?: string | null
          tpdc?: string | null
          txt_breve?: string | null
          ump_1?: string | null
          ump_2?: string | null
          ump_3?: string | null
          unidade_medida_basica?: string | null
          unidade_medida_pedido?: string | null
          upp?: string | null
          valor_efetivo?: number | null
          valor_em_brl?: number | null
          valor_liquido?: number | null
        }
        Relationships: []
      }
      port_briefing_participantes: {
        Row: {
          assinatura_digital: string | null
          cpf: string
          created_at: string
          data: string
          empresa: string
          funcao: string
          id: string
          nome: string
          sessao_id: string
          validade_dias: number
        }
        Insert: {
          assinatura_digital?: string | null
          cpf: string
          created_at?: string
          data?: string
          empresa: string
          funcao: string
          id?: string
          nome: string
          sessao_id: string
          validade_dias?: number
        }
        Update: {
          assinatura_digital?: string | null
          cpf?: string
          created_at?: string
          data?: string
          empresa?: string
          funcao?: string
          id?: string
          nome?: string
          sessao_id?: string
          validade_dias?: number
        }
        Relationships: [
          {
            foreignKeyName: "port_briefing_participantes_sessao_id_fkey"
            columns: ["sessao_id"]
            isOneToOne: false
            referencedRelation: "port_briefing_sessoes"
            referencedColumns: ["id"]
          },
        ]
      }
      port_briefing_sessoes: {
        Row: {
          codigo_formulario: string
          conteudo_programatico: string
          created_at: string
          criado_por: string | null
          data: string
          id: string
          instrutor_responsavel: string
          numero_protocolo: string
          observacoes: string | null
          status: string
          tema_treinamento: string
          termo_responsabilidade: string
          tipo: string
          updated_at: string
        }
        Insert: {
          codigo_formulario?: string
          conteudo_programatico?: string
          created_at?: string
          criado_por?: string | null
          data?: string
          id?: string
          instrutor_responsavel: string
          numero_protocolo: string
          observacoes?: string | null
          status?: string
          tema_treinamento?: string
          termo_responsabilidade?: string
          tipo?: string
          updated_at?: string
        }
        Update: {
          codigo_formulario?: string
          conteudo_programatico?: string
          created_at?: string
          criado_por?: string | null
          data?: string
          id?: string
          instrutor_responsavel?: string
          numero_protocolo?: string
          observacoes?: string | null
          status?: string
          tema_treinamento?: string
          termo_responsabilidade?: string
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "port_briefing_sessoes_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "core_perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "port_briefing_sessoes_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      port_controle_carretas: {
        Row: {
          ass_motorista: string | null
          codigo_formulario: string
          cpf_motorista: string | null
          created_at: string
          criado_por: string | null
          data_entrada: string
          data_saida: string | null
          empresa: string
          hora_entrada: string
          hora_saida: string | null
          id: string
          nome_motorista: string
          numero_nf: string | null
          numero_protocolo: string
          observacoes: string | null
          peso_bruto: number | null
          placa_carreta: string
          placa_cavalo: string
          status: string
          updated_at: string
          vigilante_entrada: string
          vigilante_saida: string | null
        }
        Insert: {
          ass_motorista?: string | null
          codigo_formulario?: string
          cpf_motorista?: string | null
          created_at?: string
          criado_por?: string | null
          data_entrada?: string
          data_saida?: string | null
          empresa: string
          hora_entrada: string
          hora_saida?: string | null
          id?: string
          nome_motorista: string
          numero_nf?: string | null
          numero_protocolo: string
          observacoes?: string | null
          peso_bruto?: number | null
          placa_carreta: string
          placa_cavalo: string
          status?: string
          updated_at?: string
          vigilante_entrada: string
          vigilante_saida?: string | null
        }
        Update: {
          ass_motorista?: string | null
          codigo_formulario?: string
          cpf_motorista?: string | null
          created_at?: string
          criado_por?: string | null
          data_entrada?: string
          data_saida?: string | null
          empresa?: string
          hora_entrada?: string
          hora_saida?: string | null
          id?: string
          nome_motorista?: string
          numero_nf?: string | null
          numero_protocolo?: string
          observacoes?: string | null
          peso_bruto?: number | null
          placa_carreta?: string
          placa_cavalo?: string
          status?: string
          updated_at?: string
          vigilante_entrada?: string
          vigilante_saida?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "port_controle_carretas_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "core_perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "port_controle_carretas_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      port_controle_equipamentos: {
        Row: {
          codigo_formulario: string
          created_at: string
          criado_por: string | null
          data_entrada: string
          data_saida: string | null
          descricao_materiais: string
          funcionario: string
          hora_entrada: string | null
          hora_saida: string | null
          id: string
          nome_empresa: string
          numero_protocolo: string
          observacoes: string | null
          responsavel: string | null
          status: string
          updated_at: string
          vigilante_entrada: string
          vigilante_saida: string | null
        }
        Insert: {
          codigo_formulario?: string
          created_at?: string
          criado_por?: string | null
          data_entrada?: string
          data_saida?: string | null
          descricao_materiais: string
          funcionario: string
          hora_entrada?: string | null
          hora_saida?: string | null
          id?: string
          nome_empresa: string
          numero_protocolo: string
          observacoes?: string | null
          responsavel?: string | null
          status?: string
          updated_at?: string
          vigilante_entrada: string
          vigilante_saida?: string | null
        }
        Update: {
          codigo_formulario?: string
          created_at?: string
          criado_por?: string | null
          data_entrada?: string
          data_saida?: string | null
          descricao_materiais?: string
          funcionario?: string
          hora_entrada?: string | null
          hora_saida?: string | null
          id?: string
          nome_empresa?: string
          numero_protocolo?: string
          observacoes?: string | null
          responsavel?: string | null
          status?: string
          updated_at?: string
          vigilante_entrada?: string
          vigilante_saida?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "port_controle_equipamentos_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "core_perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "port_controle_equipamentos_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      port_registro_transportes: {
        Row: {
          codigo_formulario: string
          created_at: string
          criado_por: string | null
          data: string
          empresa: string
          hora_chegada: string
          hora_saida: string | null
          id: string
          motorista: string
          numero_protocolo: string
          observacoes: string | null
          ocupacao: string | null
          placa: string
          status: string
          turno: string
          updated_at: string
          veiculo: string
          vigilante: string
        }
        Insert: {
          codigo_formulario?: string
          created_at?: string
          criado_por?: string | null
          data?: string
          empresa: string
          hora_chegada: string
          hora_saida?: string | null
          id?: string
          motorista: string
          numero_protocolo: string
          observacoes?: string | null
          ocupacao?: string | null
          placa: string
          status?: string
          turno?: string
          updated_at?: string
          veiculo: string
          vigilante: string
        }
        Update: {
          codigo_formulario?: string
          created_at?: string
          criado_por?: string | null
          data?: string
          empresa?: string
          hora_chegada?: string
          hora_saida?: string | null
          id?: string
          motorista?: string
          numero_protocolo?: string
          observacoes?: string | null
          ocupacao?: string | null
          placa?: string
          status?: string
          turno?: string
          updated_at?: string
          veiculo?: string
          vigilante?: string
        }
        Relationships: [
          {
            foreignKeyName: "port_registro_transportes_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "core_perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "port_registro_transportes_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      port_relatorio_ocorrencias: {
        Row: {
          created_at: string
          descricao: string
          horario: string
          id: string
          local_setor: string
          relatorio_id: string
          severidade: string
          vigilante: string
        }
        Insert: {
          created_at?: string
          descricao: string
          horario: string
          id?: string
          local_setor: string
          relatorio_id: string
          severidade?: string
          vigilante: string
        }
        Update: {
          created_at?: string
          descricao?: string
          horario?: string
          id?: string
          local_setor?: string
          relatorio_id?: string
          severidade?: string
          vigilante?: string
        }
        Relationships: [
          {
            foreignKeyName: "port_relatorio_ocorrencias_relatorio_id_fkey"
            columns: ["relatorio_id"]
            isOneToOne: false
            referencedRelation: "port_relatorio_portaria"
            referencedColumns: ["id"]
          },
        ]
      }
      port_relatorio_portaria: {
        Row: {
          codigo_formulario: string
          created_at: string
          criado_por: string | null
          data: string
          horario_fim: string
          horario_inicio: string
          id: string
          numero_protocolo: string
          observacoes_gerais: string | null
          status: string
          turno: string
          updated_at: string
          vigilante_principal: string
          vigilante_ronda01: string | null
          vigilante_ronda02: string | null
        }
        Insert: {
          codigo_formulario?: string
          created_at?: string
          criado_por?: string | null
          data?: string
          horario_fim?: string
          horario_inicio?: string
          id?: string
          numero_protocolo: string
          observacoes_gerais?: string | null
          status?: string
          turno?: string
          updated_at?: string
          vigilante_principal: string
          vigilante_ronda01?: string | null
          vigilante_ronda02?: string | null
        }
        Update: {
          codigo_formulario?: string
          created_at?: string
          criado_por?: string | null
          data?: string
          horario_fim?: string
          horario_inicio?: string
          id?: string
          numero_protocolo?: string
          observacoes_gerais?: string | null
          status?: string
          turno?: string
          updated_at?: string
          vigilante_principal?: string
          vigilante_ronda01?: string | null
          vigilante_ronda02?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "port_relatorio_portaria_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "core_perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "port_relatorio_portaria_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      port_vigilantes: {
        Row: {
          ativo: boolean
          created_at: string
          criado_por: string | null
          empresa: string
          funcao: string
          id: string
          matricula: string | null
          nome: string
          observacoes: string | null
          turno_preferencial: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          criado_por?: string | null
          empresa?: string
          funcao?: string
          id?: string
          matricula?: string | null
          nome: string
          observacoes?: string | null
          turno_preferencial?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          criado_por?: string | null
          empresa?: string
          funcao?: string
          id?: string
          matricula?: string | null
          nome?: string
          observacoes?: string | null
          turno_preferencial?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "port_vigilantes_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "core_perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "port_vigilantes_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rh_ase_itens: {
        Row: {
          cargo: string | null
          created_at: string
          hora_entrada: string
          hora_saida: string
          id: string
          intervalo_minutos: number
          nome: string
          observacao: string | null
          percentual_he: number | null
          pessoa_id: string | null
          refeicao: boolean
          registro: string
          solicitacao_id: string
          total_horas: number | null
          transporte: boolean
        }
        Insert: {
          cargo?: string | null
          created_at?: string
          hora_entrada: string
          hora_saida: string
          id?: string
          intervalo_minutos?: number
          nome: string
          observacao?: string | null
          percentual_he?: number | null
          pessoa_id?: string | null
          refeicao?: boolean
          registro: string
          solicitacao_id: string
          total_horas?: number | null
          transporte?: boolean
        }
        Update: {
          cargo?: string | null
          created_at?: string
          hora_entrada?: string
          hora_saida?: string
          id?: string
          intervalo_minutos?: number
          nome?: string
          observacao?: string | null
          percentual_he?: number | null
          pessoa_id?: string | null
          refeicao?: boolean
          registro?: string
          solicitacao_id?: string
          total_horas?: number | null
          transporte?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "rh_ase_itens_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "rh_pessoas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_ase_itens_solicitacao_id_fkey"
            columns: ["solicitacao_id"]
            isOneToOne: false
            referencedRelation: "rh_ase_solicitacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      rh_ase_solicitacoes: {
        Row: {
          codigo_formulario: string
          created_at: string
          data_execucao: string
          id: string
          justificativa: string | null
          numero_protocolo: string
          setor_id: string | null
          solicitante_id: string | null
          status: string
          turno_id: string | null
          updated_at: string
        }
        Insert: {
          codigo_formulario?: string
          created_at?: string
          data_execucao: string
          id?: string
          justificativa?: string | null
          numero_protocolo: string
          setor_id?: string | null
          solicitante_id?: string | null
          status?: string
          turno_id?: string | null
          updated_at?: string
        }
        Update: {
          codigo_formulario?: string
          created_at?: string
          data_execucao?: string
          id?: string
          justificativa?: string | null
          numero_protocolo?: string
          setor_id?: string | null
          solicitante_id?: string | null
          status?: string
          turno_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rh_ase_solicitacoes_setor_id_fkey"
            columns: ["setor_id"]
            isOneToOne: false
            referencedRelation: "rh_setores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_ase_solicitacoes_solicitante_id_fkey"
            columns: ["solicitante_id"]
            isOneToOne: false
            referencedRelation: "core_perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_ase_solicitacoes_solicitante_id_fkey"
            columns: ["solicitante_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_ase_solicitacoes_turno_id_fkey"
            columns: ["turno_id"]
            isOneToOne: false
            referencedRelation: "rh_turnos"
            referencedColumns: ["id"]
          },
        ]
      }
      rh_hora_extra: {
        Row: {
          created_at: string
          dia: string
          id: string
          percentual_he: number
        }
        Insert: {
          created_at?: string
          dia: string
          id?: string
          percentual_he: number
        }
        Update: {
          created_at?: string
          dia?: string
          id?: string
          percentual_he?: number
        }
        Relationships: []
      }
      rh_pessoas: {
        Row: {
          ativo: boolean
          cargo: string | null
          created_at: string
          id: string
          nome: string
          registro: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          cargo?: string | null
          created_at?: string
          id?: string
          nome: string
          registro: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          cargo?: string | null
          created_at?: string
          id?: string
          nome?: string
          registro?: string
          updated_at?: string
        }
        Relationships: []
      }
      rh_setores: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          nome: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome?: string
        }
        Relationships: []
      }
      rh_turnos: {
        Row: {
          created_at: string
          id: string
          nome: string
        }
        Insert: {
          created_at?: string
          id?: string
          nome: string
        }
        Update: {
          created_at?: string
          id?: string
          nome?: string
        }
        Relationships: []
      }
      sap_fbl1n_pagar: {
        Row: {
          ano_mes: string | null
          atribuicao: string | null
          bloqueio_pagamento: string | null
          campos_extras: Json | null
          centro: string | null
          centro_lucro: string | null
          chave_referencia_1: string | null
          codigo_imposto: string | null
          condicoes_pagamento: string | null
          conta: string | null
          conta_lancamento_contrapartida: string | null
          data_compensacao: string | null
          data_documento: string | null
          data_entrada: string | null
          data_lancamento: string | null
          data_pagamento: string | null
          doc_compensacao: string | null
          doc_faturamento: string | null
          documento_compras: string | null
          elemento_pep: string | null
          empresa: string
          estorno_com: string | null
          fornecedor: string | null
          id: number
          id_fiscal_1: string | null
          id_fiscal_iva: string | null
          imobilizado: string | null
          imported_at: string | null
          loc_negocios: string | null
          moeda_documento: string | null
          montante_base_desconto: number | null
          montante_base_irf: number | null
          montante_irf: number | null
          montante_mi2: number | null
          montante_mi3: number | null
          montante_moeda_doc: number | null
          motivo_estorno: string | null
          numero_documento: string
          parcela: string | null
          parcelamento_tributario: string | null
          razao_social_fornecedor: string | null
          referencia: string | null
          simbolo_partida: string | null
          texto: string | null
          texto_cabecalho_documento: string | null
          tipo_documento: string | null
          vencimento_liquido: string | null
          vencimento_original: string | null
        }
        Insert: {
          ano_mes?: string | null
          atribuicao?: string | null
          bloqueio_pagamento?: string | null
          campos_extras?: Json | null
          centro?: string | null
          centro_lucro?: string | null
          chave_referencia_1?: string | null
          codigo_imposto?: string | null
          condicoes_pagamento?: string | null
          conta?: string | null
          conta_lancamento_contrapartida?: string | null
          data_compensacao?: string | null
          data_documento?: string | null
          data_entrada?: string | null
          data_lancamento?: string | null
          data_pagamento?: string | null
          doc_compensacao?: string | null
          doc_faturamento?: string | null
          documento_compras?: string | null
          elemento_pep?: string | null
          empresa: string
          estorno_com?: string | null
          fornecedor?: string | null
          id?: number
          id_fiscal_1?: string | null
          id_fiscal_iva?: string | null
          imobilizado?: string | null
          imported_at?: string | null
          loc_negocios?: string | null
          moeda_documento?: string | null
          montante_base_desconto?: number | null
          montante_base_irf?: number | null
          montante_irf?: number | null
          montante_mi2?: number | null
          montante_mi3?: number | null
          montante_moeda_doc?: number | null
          motivo_estorno?: string | null
          numero_documento: string
          parcela?: string | null
          parcelamento_tributario?: string | null
          razao_social_fornecedor?: string | null
          referencia?: string | null
          simbolo_partida?: string | null
          texto?: string | null
          texto_cabecalho_documento?: string | null
          tipo_documento?: string | null
          vencimento_liquido?: string | null
          vencimento_original?: string | null
        }
        Update: {
          ano_mes?: string | null
          atribuicao?: string | null
          bloqueio_pagamento?: string | null
          campos_extras?: Json | null
          centro?: string | null
          centro_lucro?: string | null
          chave_referencia_1?: string | null
          codigo_imposto?: string | null
          condicoes_pagamento?: string | null
          conta?: string | null
          conta_lancamento_contrapartida?: string | null
          data_compensacao?: string | null
          data_documento?: string | null
          data_entrada?: string | null
          data_lancamento?: string | null
          data_pagamento?: string | null
          doc_compensacao?: string | null
          doc_faturamento?: string | null
          documento_compras?: string | null
          elemento_pep?: string | null
          empresa?: string
          estorno_com?: string | null
          fornecedor?: string | null
          id?: number
          id_fiscal_1?: string | null
          id_fiscal_iva?: string | null
          imobilizado?: string | null
          imported_at?: string | null
          loc_negocios?: string | null
          moeda_documento?: string | null
          montante_base_desconto?: number | null
          montante_base_irf?: number | null
          montante_irf?: number | null
          montante_mi2?: number | null
          montante_mi3?: number | null
          montante_moeda_doc?: number | null
          motivo_estorno?: string | null
          numero_documento?: string
          parcela?: string | null
          parcelamento_tributario?: string | null
          razao_social_fornecedor?: string | null
          referencia?: string | null
          simbolo_partida?: string | null
          texto?: string | null
          texto_cabecalho_documento?: string | null
          tipo_documento?: string | null
          vencimento_liquido?: string | null
          vencimento_original?: string | null
        }
        Relationships: []
      }
      sap_mb51_mov: {
        Row: {
          campos_extras: Json | null
          centro: string | null
          chave_unica: string | null
          created_at: string | null
          data_documento: string | null
          data_entrada: string | null
          data_lancamento: string | null
          deposito: string | null
          doc_material: string
          elemento_pep: string | null
          fornecedor: string | null
          hora_registro: string | null
          id: number
          imobilizado: string | null
          imported_at: string | null
          item: string | null
          material: string | null
          moeda: string | null
          montante_mi: number | null
          nome_usuario: string | null
          pedido: string | null
          posicao_deposito: string | null
          qtd_um_registro: number | null
          razao_social_fornecedor: string | null
          referencia: string | null
          texto_breve_material: string | null
          texto_cabecalho_doc: string | null
          tipo_movimento: string | null
          txt_tipo_movimento: string | null
          um_registro: string | null
          unid_medida_basica: string | null
        }
        Insert: {
          campos_extras?: Json | null
          centro?: string | null
          chave_unica?: string | null
          created_at?: string | null
          data_documento?: string | null
          data_entrada?: string | null
          data_lancamento?: string | null
          deposito?: string | null
          doc_material: string
          elemento_pep?: string | null
          fornecedor?: string | null
          hora_registro?: string | null
          id?: number
          imobilizado?: string | null
          imported_at?: string | null
          item?: string | null
          material?: string | null
          moeda?: string | null
          montante_mi?: number | null
          nome_usuario?: string | null
          pedido?: string | null
          posicao_deposito?: string | null
          qtd_um_registro?: number | null
          razao_social_fornecedor?: string | null
          referencia?: string | null
          texto_breve_material?: string | null
          texto_cabecalho_doc?: string | null
          tipo_movimento?: string | null
          txt_tipo_movimento?: string | null
          um_registro?: string | null
          unid_medida_basica?: string | null
        }
        Update: {
          campos_extras?: Json | null
          centro?: string | null
          chave_unica?: string | null
          created_at?: string | null
          data_documento?: string | null
          data_entrada?: string | null
          data_lancamento?: string | null
          deposito?: string | null
          doc_material?: string
          elemento_pep?: string | null
          fornecedor?: string | null
          hora_registro?: string | null
          id?: number
          imobilizado?: string | null
          imported_at?: string | null
          item?: string | null
          material?: string | null
          moeda?: string | null
          montante_mi?: number | null
          nome_usuario?: string | null
          pedido?: string | null
          posicao_deposito?: string | null
          qtd_um_registro?: number | null
          razao_social_fornecedor?: string | null
          referencia?: string | null
          texto_breve_material?: string | null
          texto_cabecalho_doc?: string | null
          tipo_movimento?: string | null
          txt_tipo_movimento?: string | null
          um_registro?: string | null
          unid_medida_basica?: string | null
        }
        Relationships: []
      }
      sap_me3n_contrato: {
        Row: {
          a_fornecer_qtd: number | null
          a_fornecer_valor: number | null
          ainda_faturar_qtd: number | null
          ainda_faturar_valor: number | null
          centro: string | null
          codigo_eliminacao: string | null
          codigo_liberacao: string | null
          criado_por: string | null
          data_documento: string | null
          documento_compras: string | null
          estado_liberacao: string | null
          fim_validade: string | null
          fornecedor: string | null
          historico_pedido: string | null
          id: number
          imported_at: string
          inicio_validade: string | null
          item: string | null
          material: string | null
          moeda: string | null
          preco_liquido: number | null
          qtd_prev_pendente: number | null
          qtd_solicit_anterior: number | null
          requisitante: string | null
          texto_breve: string | null
          um_pedido: string | null
          unidade_preco: string | null
          valor_efetivo: number | null
          valor_liquido_pedido: number | null
          valor_pendente: number | null
          valor_solicitado: number | null
        }
        Insert: {
          a_fornecer_qtd?: number | null
          a_fornecer_valor?: number | null
          ainda_faturar_qtd?: number | null
          ainda_faturar_valor?: number | null
          centro?: string | null
          codigo_eliminacao?: string | null
          codigo_liberacao?: string | null
          criado_por?: string | null
          data_documento?: string | null
          documento_compras?: string | null
          estado_liberacao?: string | null
          fim_validade?: string | null
          fornecedor?: string | null
          historico_pedido?: string | null
          id?: number
          imported_at?: string
          inicio_validade?: string | null
          item?: string | null
          material?: string | null
          moeda?: string | null
          preco_liquido?: number | null
          qtd_prev_pendente?: number | null
          qtd_solicit_anterior?: number | null
          requisitante?: string | null
          texto_breve?: string | null
          um_pedido?: string | null
          unidade_preco?: string | null
          valor_efetivo?: number | null
          valor_liquido_pedido?: number | null
          valor_pendente?: number | null
          valor_solicitado?: number | null
        }
        Update: {
          a_fornecer_qtd?: number | null
          a_fornecer_valor?: number | null
          ainda_faturar_qtd?: number | null
          ainda_faturar_valor?: number | null
          centro?: string | null
          codigo_eliminacao?: string | null
          codigo_liberacao?: string | null
          criado_por?: string | null
          data_documento?: string | null
          documento_compras?: string | null
          estado_liberacao?: string | null
          fim_validade?: string | null
          fornecedor?: string | null
          historico_pedido?: string | null
          id?: number
          imported_at?: string
          inicio_validade?: string | null
          item?: string | null
          material?: string | null
          moeda?: string | null
          preco_liquido?: number | null
          qtd_prev_pendente?: number | null
          qtd_solicit_anterior?: number | null
          requisitante?: string | null
          texto_breve?: string | null
          um_pedido?: string | null
          unidade_preco?: string | null
          valor_efetivo?: number | null
          valor_liquido_pedido?: number | null
          valor_pendente?: number | null
          valor_solicitado?: number | null
        }
        Relationships: []
      }
      sap_me5a_rc: {
        Row: {
          apelido: string | null
          aplicacao: string | null
          area_solicitante: string | null
          campos_extras: Json | null
          categoria_do_item: string | null
          centro: string | null
          centro_fornecedor: string | null
          codigo_de_bloqueio: string | null
          codigo_de_eliminacao: boolean | null
          codigo_de_liberacao: string | null
          concluida: string | null
          contrato_basico: string | null
          criado_por: string | null
          ctg_class_cont: string | null
          data_da_liberacao: string | null
          data_da_solicitacao: string | null
          data_de_remessa: string | null
          data_do_pedido: string | null
          data_entrega_prevista: string | null
          data_pedido_origem: string | null
          deposito: string | null
          descricao_do_grupo_de_compradores: string | null
          eliminado: boolean | null
          fornecedor_fixo: string | null
          grupo_de_compradores: string | null
          grupo_de_mercadorias: string | null
          it_contrato_superior: string | null
          item_do_pedido: string | null
          item_reqc: string | null
          item_status: string | null
          item_status_updated_at: string | null
          item_status_updated_by: string | null
          marca_da_peca: string | null
          material: string | null
          modelo: string | null
          moeda: string | null
          n_acompanhamento: string | null
          n_de_reqsc: number | null
          n_material_fornecedor: string | null
          n_peca_fabricante: string | null
          nome_do_fornecedor: string | null
          obs_comprador: string | null
          obs_updated_at: string | null
          obs_updated_by: string | null
          organiz_compras: string | null
          peca_original: string | null
          pedido: string | null
          presente_ultima_carga: boolean | null
          qtd_solicitada: number | null
          quantidade_pedida: number | null
          remessas_de_ate: string | null
          requisicao_de_compra: string | null
          requisicao_externa: string | null
          requisitante: string | null
          ri: string
          status_processamento: string | null
          sugestao_local_compra: string | null
          tempo_procmto_em: number | null
          texto_breve: string | null
          tipo_data_de_remessa: string | null
          tipo_de_documento: string | null
          tipo_de_transporte: string | null
          unidade_de_medida: string | null
        }
        Insert: {
          apelido?: string | null
          aplicacao?: string | null
          area_solicitante?: string | null
          campos_extras?: Json | null
          categoria_do_item?: string | null
          centro?: string | null
          centro_fornecedor?: string | null
          codigo_de_bloqueio?: string | null
          codigo_de_eliminacao?: boolean | null
          codigo_de_liberacao?: string | null
          concluida?: string | null
          contrato_basico?: string | null
          criado_por?: string | null
          ctg_class_cont?: string | null
          data_da_liberacao?: string | null
          data_da_solicitacao?: string | null
          data_de_remessa?: string | null
          data_do_pedido?: string | null
          data_entrega_prevista?: string | null
          data_pedido_origem?: string | null
          deposito?: string | null
          descricao_do_grupo_de_compradores?: string | null
          eliminado?: boolean | null
          fornecedor_fixo?: string | null
          grupo_de_compradores?: string | null
          grupo_de_mercadorias?: string | null
          it_contrato_superior?: string | null
          item_do_pedido?: string | null
          item_reqc?: string | null
          item_status?: string | null
          item_status_updated_at?: string | null
          item_status_updated_by?: string | null
          marca_da_peca?: string | null
          material?: string | null
          modelo?: string | null
          moeda?: string | null
          n_acompanhamento?: string | null
          n_de_reqsc?: number | null
          n_material_fornecedor?: string | null
          n_peca_fabricante?: string | null
          nome_do_fornecedor?: string | null
          obs_comprador?: string | null
          obs_updated_at?: string | null
          obs_updated_by?: string | null
          organiz_compras?: string | null
          peca_original?: string | null
          pedido?: string | null
          presente_ultima_carga?: boolean | null
          qtd_solicitada?: number | null
          quantidade_pedida?: number | null
          remessas_de_ate?: string | null
          requisicao_de_compra?: string | null
          requisicao_externa?: string | null
          requisitante?: string | null
          ri: string
          status_processamento?: string | null
          sugestao_local_compra?: string | null
          tempo_procmto_em?: number | null
          texto_breve?: string | null
          tipo_data_de_remessa?: string | null
          tipo_de_documento?: string | null
          tipo_de_transporte?: string | null
          unidade_de_medida?: string | null
        }
        Update: {
          apelido?: string | null
          aplicacao?: string | null
          area_solicitante?: string | null
          campos_extras?: Json | null
          categoria_do_item?: string | null
          centro?: string | null
          centro_fornecedor?: string | null
          codigo_de_bloqueio?: string | null
          codigo_de_eliminacao?: boolean | null
          codigo_de_liberacao?: string | null
          concluida?: string | null
          contrato_basico?: string | null
          criado_por?: string | null
          ctg_class_cont?: string | null
          data_da_liberacao?: string | null
          data_da_solicitacao?: string | null
          data_de_remessa?: string | null
          data_do_pedido?: string | null
          data_entrega_prevista?: string | null
          data_pedido_origem?: string | null
          deposito?: string | null
          descricao_do_grupo_de_compradores?: string | null
          eliminado?: boolean | null
          fornecedor_fixo?: string | null
          grupo_de_compradores?: string | null
          grupo_de_mercadorias?: string | null
          it_contrato_superior?: string | null
          item_do_pedido?: string | null
          item_reqc?: string | null
          item_status?: string | null
          item_status_updated_at?: string | null
          item_status_updated_by?: string | null
          marca_da_peca?: string | null
          material?: string | null
          modelo?: string | null
          moeda?: string | null
          n_acompanhamento?: string | null
          n_de_reqsc?: number | null
          n_material_fornecedor?: string | null
          n_peca_fabricante?: string | null
          nome_do_fornecedor?: string | null
          obs_comprador?: string | null
          obs_updated_at?: string | null
          obs_updated_by?: string | null
          organiz_compras?: string | null
          peca_original?: string | null
          pedido?: string | null
          presente_ultima_carga?: boolean | null
          qtd_solicitada?: number | null
          quantidade_pedida?: number | null
          remessas_de_ate?: string | null
          requisicao_de_compra?: string | null
          requisicao_externa?: string | null
          requisitante?: string | null
          ri?: string
          status_processamento?: string | null
          sugestao_local_compra?: string | null
          tempo_procmto_em?: number | null
          texto_breve?: string | null
          tipo_data_de_remessa?: string | null
          tipo_de_documento?: string | null
          tipo_de_transporte?: string | null
          unidade_de_medida?: string | null
        }
        Relationships: []
      }
      sap_requisicoes_observacoes: {
        Row: {
          campo_alterado: string
          created_at: string | null
          id: string
          ri: string
          user_name: string
          valor_anterior: string | null
          valor_novo: string | null
        }
        Insert: {
          campo_alterado: string
          created_at?: string | null
          id: string
          ri: string
          user_name: string
          valor_anterior?: string | null
          valor_novo?: string | null
        }
        Update: {
          campo_alterado?: string
          created_at?: string | null
          id?: string
          ri?: string
          user_name?: string
          valor_anterior?: string | null
          valor_novo?: string | null
        }
        Relationships: []
      }
      sap_zl0024_stk: {
        Row: {
          aplicacao: string | null
          centro: string | null
          class_item: string | null
          deposito: string | null
          empresa: string | null
          grp_mercad: string | null
          grupo_mercadorias: string | null
          id: number
          imported_at: string
          material: string | null
          preco_medio: number | null
          quantidade: number | null
          referencia_fabricante: string | null
          texto_pedido_compra: string | null
          tipo_material: string | null
          txt_breve_material: string | null
          umb: string | null
          valor_total: number | null
        }
        Insert: {
          aplicacao?: string | null
          centro?: string | null
          class_item?: string | null
          deposito?: string | null
          empresa?: string | null
          grp_mercad?: string | null
          grupo_mercadorias?: string | null
          id?: never
          imported_at?: string
          material?: string | null
          preco_medio?: number | null
          quantidade?: number | null
          referencia_fabricante?: string | null
          texto_pedido_compra?: string | null
          tipo_material?: string | null
          txt_breve_material?: string | null
          umb?: string | null
          valor_total?: number | null
        }
        Update: {
          aplicacao?: string | null
          centro?: string | null
          class_item?: string | null
          deposito?: string | null
          empresa?: string | null
          grp_mercad?: string | null
          grupo_mercadorias?: string | null
          id?: never
          imported_at?: string
          material?: string | null
          preco_medio?: number | null
          quantidade?: number | null
          referencia_fabricante?: string | null
          texto_pedido_compra?: string | null
          tipo_material?: string | null
          txt_breve_material?: string | null
          umb?: string | null
          valor_total?: number | null
        }
        Relationships: []
      }
      sap_zl0132_po: {
        Row: {
          campos_extras: Json | null
          categoria: string | null
          cen_cen: string | null
          ci: string | null
          cn_lcr_parcs: string | null
          cnpj: string | null
          cnpj_fornecedor: string | null
          cod_forn: string | null
          codigo_liberacao_doc_compra: string | null
          condicao_pagamento: string | null
          contrato: string | null
          created_at: string | null
          crf: string | null
          criado_por_condicao: string | null
          criado_por_liberacao: string | null
          criado_por_pedido: string | null
          criado_por_rc: string | null
          data_doc: string | null
          data_migo: string | null
          data_pc_sc: string | null
          data_pedido: string | null
          data_rc: string | null
          dep_dep: string | null
          doc_compra: string | null
          doc_compra_ref: string | null
          dt_remessa: string | null
          eflag_e: string | null
          empremp: string | null
          est_liber: string | null
          estr: string | null
          fornecedor: string | null
          fornecedor_codigo: string | null
          fornecedor_nome: string | null
          ftf: string | null
          grp_mercads: string | null
          grupo_mercadoria_curto: string | null
          id: string
          item: string | null
          item_contrato: string | null
          item_rc_cotacao: string | null
          itm_liberacao: string | null
          itm_ref: string | null
          material: string | null
          modificado_em: string | null
          moeda_1: string | null
          moeda_2: string | null
          moeda_3: string | null
          n_acomp: string | null
          por: string | null
          posicao: string | null
          preco_liquido: number | null
          preco_liquido_unit: number | null
          qtd_fornecida: number | null
          qtd_pedido: number | null
          regiao_uf: string | null
          req_cotacao: string | null
          reqc: string | null
          requisitante: string | null
          ri: string | null
          tipo_doc_compra: string | null
          tmatt: string | null
          tpdc: string | null
          txt_breve: string | null
          ump_1: string | null
          ump_2: string | null
          ump_3: string | null
          unidade_medida_basica: string | null
          unidade_medida_pedido: string | null
          updated_at: string | null
          upp: string | null
          valor_efetivo: number | null
          valor_em_brl: number | null
          valor_liquido: number | null
        }
        Insert: {
          campos_extras?: Json | null
          categoria?: string | null
          cen_cen?: string | null
          ci?: string | null
          cn_lcr_parcs?: string | null
          cnpj?: string | null
          cnpj_fornecedor?: string | null
          cod_forn?: string | null
          codigo_liberacao_doc_compra?: string | null
          condicao_pagamento?: string | null
          contrato?: string | null
          created_at?: string | null
          crf?: string | null
          criado_por_condicao?: string | null
          criado_por_liberacao?: string | null
          criado_por_pedido?: string | null
          criado_por_rc?: string | null
          data_doc?: string | null
          data_migo?: string | null
          data_pc_sc?: string | null
          data_pedido?: string | null
          data_rc?: string | null
          dep_dep?: string | null
          doc_compra?: string | null
          doc_compra_ref?: string | null
          dt_remessa?: string | null
          eflag_e?: string | null
          empremp?: string | null
          est_liber?: string | null
          estr?: string | null
          fornecedor?: string | null
          fornecedor_codigo?: string | null
          fornecedor_nome?: string | null
          ftf?: string | null
          grp_mercads?: string | null
          grupo_mercadoria_curto?: string | null
          id?: string
          item?: string | null
          item_contrato?: string | null
          item_rc_cotacao?: string | null
          itm_liberacao?: string | null
          itm_ref?: string | null
          material?: string | null
          modificado_em?: string | null
          moeda_1?: string | null
          moeda_2?: string | null
          moeda_3?: string | null
          n_acomp?: string | null
          por?: string | null
          posicao?: string | null
          preco_liquido?: number | null
          preco_liquido_unit?: number | null
          qtd_fornecida?: number | null
          qtd_pedido?: number | null
          regiao_uf?: string | null
          req_cotacao?: string | null
          reqc?: string | null
          requisitante?: string | null
          ri?: string | null
          tipo_doc_compra?: string | null
          tmatt?: string | null
          tpdc?: string | null
          txt_breve?: string | null
          ump_1?: string | null
          ump_2?: string | null
          ump_3?: string | null
          unidade_medida_basica?: string | null
          unidade_medida_pedido?: string | null
          updated_at?: string | null
          upp?: string | null
          valor_efetivo?: number | null
          valor_em_brl?: number | null
          valor_liquido?: number | null
        }
        Update: {
          campos_extras?: Json | null
          categoria?: string | null
          cen_cen?: string | null
          ci?: string | null
          cn_lcr_parcs?: string | null
          cnpj?: string | null
          cnpj_fornecedor?: string | null
          cod_forn?: string | null
          codigo_liberacao_doc_compra?: string | null
          condicao_pagamento?: string | null
          contrato?: string | null
          created_at?: string | null
          crf?: string | null
          criado_por_condicao?: string | null
          criado_por_liberacao?: string | null
          criado_por_pedido?: string | null
          criado_por_rc?: string | null
          data_doc?: string | null
          data_migo?: string | null
          data_pc_sc?: string | null
          data_pedido?: string | null
          data_rc?: string | null
          dep_dep?: string | null
          doc_compra?: string | null
          doc_compra_ref?: string | null
          dt_remessa?: string | null
          eflag_e?: string | null
          empremp?: string | null
          est_liber?: string | null
          estr?: string | null
          fornecedor?: string | null
          fornecedor_codigo?: string | null
          fornecedor_nome?: string | null
          ftf?: string | null
          grp_mercads?: string | null
          grupo_mercadoria_curto?: string | null
          id?: string
          item?: string | null
          item_contrato?: string | null
          item_rc_cotacao?: string | null
          itm_liberacao?: string | null
          itm_ref?: string | null
          material?: string | null
          modificado_em?: string | null
          moeda_1?: string | null
          moeda_2?: string | null
          moeda_3?: string | null
          n_acomp?: string | null
          por?: string | null
          posicao?: string | null
          preco_liquido?: number | null
          preco_liquido_unit?: number | null
          qtd_fornecida?: number | null
          qtd_pedido?: number | null
          regiao_uf?: string | null
          req_cotacao?: string | null
          reqc?: string | null
          requisitante?: string | null
          ri?: string | null
          tipo_doc_compra?: string | null
          tmatt?: string | null
          tpdc?: string | null
          txt_breve?: string | null
          ump_1?: string | null
          ump_2?: string | null
          ump_3?: string | null
          unidade_medida_basica?: string | null
          unidade_medida_pedido?: string | null
          updated_at?: string | null
          upp?: string | null
          valor_efetivo?: number | null
          valor_em_brl?: number | null
          valor_liquido?: number | null
        }
        Relationships: []
      }
      sap_zl0169_162_catalogo: {
        Row: {
          busca_desc: string | null
          busca_texto: string | null
          categoria_item: string | null
          category: string | null
          centro: string | null
          classe_avaliacao: string | null
          classe_fiscal: string | null
          codigo_controle: string | null
          company: string | null
          created_at: string | null
          criado_em: string | null
          denominacao: string | null
          description: string
          elim_nivel_centro: string | null
          eliminacao: string | null
          grupo_mercadoria_codigo: string | null
          grupo_mercadoria_desc: string | null
          id: string
          idioma: string | null
          imported_at: string
          indicador_s: string | null
          is_active: boolean | null
          material_basico: string | null
          material_code: string
          modificado_por: string | null
          numero_pf: string | null
          pais: string | null
          status_centro: string | null
          status_geral: string | null
          technical_text: string | null
          tipo_material: string | null
          tipo_material_desc: string | null
          ultima_modificacao: string | null
          unidade_medida_alt: string | null
          unit: string | null
        }
        Insert: {
          busca_desc?: string | null
          busca_texto?: string | null
          categoria_item?: string | null
          category?: string | null
          centro?: string | null
          classe_avaliacao?: string | null
          classe_fiscal?: string | null
          codigo_controle?: string | null
          company?: string | null
          created_at?: string | null
          criado_em?: string | null
          denominacao?: string | null
          description: string
          elim_nivel_centro?: string | null
          eliminacao?: string | null
          grupo_mercadoria_codigo?: string | null
          grupo_mercadoria_desc?: string | null
          id: string
          idioma?: string | null
          imported_at?: string
          indicador_s?: string | null
          is_active?: boolean | null
          material_basico?: string | null
          material_code: string
          modificado_por?: string | null
          numero_pf?: string | null
          pais?: string | null
          status_centro?: string | null
          status_geral?: string | null
          technical_text?: string | null
          tipo_material?: string | null
          tipo_material_desc?: string | null
          ultima_modificacao?: string | null
          unidade_medida_alt?: string | null
          unit?: string | null
        }
        Update: {
          busca_desc?: string | null
          busca_texto?: string | null
          categoria_item?: string | null
          category?: string | null
          centro?: string | null
          classe_avaliacao?: string | null
          classe_fiscal?: string | null
          codigo_controle?: string | null
          company?: string | null
          created_at?: string | null
          criado_em?: string | null
          denominacao?: string | null
          description?: string
          elim_nivel_centro?: string | null
          eliminacao?: string | null
          grupo_mercadoria_codigo?: string | null
          grupo_mercadoria_desc?: string | null
          id?: string
          idioma?: string | null
          imported_at?: string
          indicador_s?: string | null
          is_active?: boolean | null
          material_basico?: string | null
          material_code?: string
          modificado_por?: string | null
          numero_pf?: string | null
          pais?: string | null
          status_centro?: string | null
          status_geral?: string | null
          technical_text?: string | null
          tipo_material?: string | null
          tipo_material_desc?: string | null
          ultima_modificacao?: string | null
          unidade_medida_alt?: string | null
          unit?: string | null
        }
        Relationships: []
      }
      sap_zl0170_miro: {
        Row: {
          ano_migo: string | null
          ano_miro: string | null
          campos_extras: Json | null
          centro: string | null
          data_aprovacao_pedido: string | null
          data_criacao_migo: string | null
          data_criacao_miro: string | null
          data_criacao_pedido: string | null
          data_documento: string | null
          data_entrada: string | null
          data_lancamento_migo: string | null
          data_lancamento_miro: string | null
          data_pagamento: string | null
          data_remessa: string | null
          data_solicitacao: string | null
          doc_migo: string | null
          doc_miro: string | null
          doc_pagamento: string | null
          empresa: string | null
          folha_servico: string | null
          fornecedor: string | null
          hora: string | null
          id: number
          id_fiscal_1: string | null
          id_fiscal_2: string | null
          id_fiscal_iva: string | null
          imported_at: string | null
          item: string
          material: string | null
          moeda_migo: string | null
          moeda_preco: string | null
          moeda_valor_liquido: string | null
          montante_migo: number | null
          montante_miro: number | null
          nome_1: string | null
          nome_2: string | null
          numero_doc_contabil: string | null
          numero_pedido: string
          preco_liquido: number | null
          qtd_migo: number | null
          qtd_miro: number | null
          qtd_pedido: number | null
          referencia: string | null
          requisicao_compra: string | null
          unidade_migo: string | null
          unidade_miro: string | null
          unidade_pedido: string | null
          valor_liquido: number | null
        }
        Insert: {
          ano_migo?: string | null
          ano_miro?: string | null
          campos_extras?: Json | null
          centro?: string | null
          data_aprovacao_pedido?: string | null
          data_criacao_migo?: string | null
          data_criacao_miro?: string | null
          data_criacao_pedido?: string | null
          data_documento?: string | null
          data_entrada?: string | null
          data_lancamento_migo?: string | null
          data_lancamento_miro?: string | null
          data_pagamento?: string | null
          data_remessa?: string | null
          data_solicitacao?: string | null
          doc_migo?: string | null
          doc_miro?: string | null
          doc_pagamento?: string | null
          empresa?: string | null
          folha_servico?: string | null
          fornecedor?: string | null
          hora?: string | null
          id?: number
          id_fiscal_1?: string | null
          id_fiscal_2?: string | null
          id_fiscal_iva?: string | null
          imported_at?: string | null
          item: string
          material?: string | null
          moeda_migo?: string | null
          moeda_preco?: string | null
          moeda_valor_liquido?: string | null
          montante_migo?: number | null
          montante_miro?: number | null
          nome_1?: string | null
          nome_2?: string | null
          numero_doc_contabil?: string | null
          numero_pedido: string
          preco_liquido?: number | null
          qtd_migo?: number | null
          qtd_miro?: number | null
          qtd_pedido?: number | null
          referencia?: string | null
          requisicao_compra?: string | null
          unidade_migo?: string | null
          unidade_miro?: string | null
          unidade_pedido?: string | null
          valor_liquido?: number | null
        }
        Update: {
          ano_migo?: string | null
          ano_miro?: string | null
          campos_extras?: Json | null
          centro?: string | null
          data_aprovacao_pedido?: string | null
          data_criacao_migo?: string | null
          data_criacao_miro?: string | null
          data_criacao_pedido?: string | null
          data_documento?: string | null
          data_entrada?: string | null
          data_lancamento_migo?: string | null
          data_lancamento_miro?: string | null
          data_pagamento?: string | null
          data_remessa?: string | null
          data_solicitacao?: string | null
          doc_migo?: string | null
          doc_miro?: string | null
          doc_pagamento?: string | null
          empresa?: string | null
          folha_servico?: string | null
          fornecedor?: string | null
          hora?: string | null
          id?: number
          id_fiscal_1?: string | null
          id_fiscal_2?: string | null
          id_fiscal_iva?: string | null
          imported_at?: string | null
          item?: string
          material?: string | null
          moeda_migo?: string | null
          moeda_preco?: string | null
          moeda_valor_liquido?: string | null
          montante_migo?: number | null
          montante_miro?: number | null
          nome_1?: string | null
          nome_2?: string | null
          numero_doc_contabil?: string | null
          numero_pedido?: string
          preco_liquido?: number | null
          qtd_migo?: number | null
          qtd_miro?: number | null
          qtd_pedido?: number | null
          referencia?: string | null
          requisicao_compra?: string | null
          unidade_migo?: string | null
          unidade_miro?: string | null
          unidade_pedido?: string | null
          valor_liquido?: number | null
        }
        Relationships: []
      }
      sequences: {
        Row: {
          key: string
          value: number | null
        }
        Insert: {
          key: string
          value?: number | null
        }
        Update: {
          key?: string
          value?: number | null
        }
        Relationships: []
      }
      sup_compradores: {
        Row: {
          email: string | null
          grupo_compras: string
          nome_comprador: string
          usuario_sistema: string | null
        }
        Insert: {
          email?: string | null
          grupo_compras: string
          nome_comprador: string
          usuario_sistema?: string | null
        }
        Update: {
          email?: string | null
          grupo_compras?: string
          nome_comprador?: string
          usuario_sistema?: string | null
        }
        Relationships: []
      }
      sup_cotacao_descricao_map: {
        Row: {
          codigo_produto: string | null
          created_at: string
          descricao_norm: string
          descricao_original: string
          fornecedor_cnpj: string
          id: string
          material_code: string | null
          ultima_confirmacao: string
          ultimo_usuario_nome: string | null
          unidade_medida: string | null
          vezes_confirmado: number
        }
        Insert: {
          codigo_produto?: string | null
          created_at?: string
          descricao_norm: string
          descricao_original: string
          fornecedor_cnpj: string
          id?: string
          material_code?: string | null
          ultima_confirmacao?: string
          ultimo_usuario_nome?: string | null
          unidade_medida?: string | null
          vezes_confirmado?: number
        }
        Update: {
          codigo_produto?: string | null
          created_at?: string
          descricao_norm?: string
          descricao_original?: string
          fornecedor_cnpj?: string
          id?: string
          material_code?: string | null
          ultima_confirmacao?: string
          ultimo_usuario_nome?: string | null
          unidade_medida?: string | null
          vezes_confirmado?: number
        }
        Relationships: []
      }
      sup_cotacao_extracoes: {
        Row: {
          chars_entrada: number
          completion_tokens: number | null
          created_at: string
          custo_usd: number | null
          duracao_ms: number | null
          erro_codigo: string | null
          erro_mensagem: string | null
          id: string
          itens_extraidos: number | null
          modelo: string
          processo_id: string | null
          prompt_tokens: number | null
          propostas_extraidas: number | null
          sucesso: boolean
          total_tokens: number | null
          truncado: boolean
          user_id: string | null
          user_name: string | null
        }
        Insert: {
          chars_entrada: number
          completion_tokens?: number | null
          created_at?: string
          custo_usd?: number | null
          duracao_ms?: number | null
          erro_codigo?: string | null
          erro_mensagem?: string | null
          id?: string
          itens_extraidos?: number | null
          modelo: string
          processo_id?: string | null
          prompt_tokens?: number | null
          propostas_extraidas?: number | null
          sucesso?: boolean
          total_tokens?: number | null
          truncado?: boolean
          user_id?: string | null
          user_name?: string | null
        }
        Update: {
          chars_entrada?: number
          completion_tokens?: number | null
          created_at?: string
          custo_usd?: number | null
          duracao_ms?: number | null
          erro_codigo?: string | null
          erro_mensagem?: string | null
          id?: string
          itens_extraidos?: number | null
          modelo?: string
          processo_id?: string | null
          prompt_tokens?: number | null
          propostas_extraidas?: number | null
          sucesso?: boolean
          total_tokens?: number | null
          truncado?: boolean
          user_id?: string | null
          user_name?: string | null
        }
        Relationships: []
      }
      sup_cotacao_historico: {
        Row: {
          cod_forn: string
          created_at: string
          fornecedor_nome: string | null
          id: string
          ri: string
          rm: string | null
          user_id: string | null
          user_name: string | null
        }
        Insert: {
          cod_forn: string
          created_at?: string
          fornecedor_nome?: string | null
          id: string
          ri: string
          rm?: string | null
          user_id?: string | null
          user_name?: string | null
        }
        Update: {
          cod_forn?: string
          created_at?: string
          fornecedor_nome?: string | null
          id?: string
          ri?: string
          rm?: string | null
          user_id?: string | null
          user_name?: string | null
        }
        Relationships: []
      }
      sup_cotacao_processo_itens: {
        Row: {
          centro: string | null
          created_at: string
          deposito: string | null
          id: string
          item_reqc: string | null
          material_code: string | null
          processo_id: string
          qtd_solicitada: number | null
          ri: string
          rm: string | null
          texto_breve: string | null
          unidade_medida: string | null
        }
        Insert: {
          centro?: string | null
          created_at?: string
          deposito?: string | null
          id?: string
          item_reqc?: string | null
          material_code?: string | null
          processo_id: string
          qtd_solicitada?: number | null
          ri: string
          rm?: string | null
          texto_breve?: string | null
          unidade_medida?: string | null
        }
        Update: {
          centro?: string | null
          created_at?: string
          deposito?: string | null
          id?: string
          item_reqc?: string | null
          material_code?: string | null
          processo_id?: string
          qtd_solicitada?: number | null
          ri?: string
          rm?: string | null
          texto_breve?: string | null
          unidade_medida?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cotacao_processo_itens_processo_id_fkey"
            columns: ["processo_id"]
            isOneToOne: false
            referencedRelation: "cotacao_processos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cotacao_processo_itens_processo_id_fkey"
            columns: ["processo_id"]
            isOneToOne: false
            referencedRelation: "sup_cotacao_processos"
            referencedColumns: ["id"]
          },
        ]
      }
      sup_cotacao_processos: {
        Row: {
          created_at: string
          criado_por: string | null
          criado_por_nome: string
          id: string
          numero: string
          observacoes: string | null
          status: string
          titulo: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          criado_por?: string | null
          criado_por_nome: string
          id?: string
          numero: string
          observacoes?: string | null
          status?: string
          titulo?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          criado_por?: string | null
          criado_por_nome?: string
          id?: string
          numero?: string
          observacoes?: string | null
          status?: string
          titulo?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cotacao_processos_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "core_perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cotacao_processos_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sup_cotacao_proposta_itens: {
        Row: {
          aliquota_cofins_pct: number | null
          aliquota_icms_pct: number | null
          aliquota_ipi_pct: number | null
          aliquota_pis_pct: number | null
          campos_faltantes: string[]
          cfop: string | null
          codigo_produto: string | null
          created_at: string
          cst: string | null
          descricao_produto: string
          extraido_raw: Json | null
          fora_escopo: boolean
          id: string
          item_numero: number | null
          marca_fabricante: string | null
          material_code: string | null
          ncm: string | null
          preco_total_item: number | null
          preco_unitario: number | null
          processo_item_id: string | null
          proposta_id: string
          quantidade: number | null
          ri: string | null
          unidade_medida: string | null
          vinculo_origem: string
          vinculo_score: number | null
        }
        Insert: {
          aliquota_cofins_pct?: number | null
          aliquota_icms_pct?: number | null
          aliquota_ipi_pct?: number | null
          aliquota_pis_pct?: number | null
          campos_faltantes?: string[]
          cfop?: string | null
          codigo_produto?: string | null
          created_at?: string
          cst?: string | null
          descricao_produto: string
          extraido_raw?: Json | null
          fora_escopo?: boolean
          id?: string
          item_numero?: number | null
          marca_fabricante?: string | null
          material_code?: string | null
          ncm?: string | null
          preco_total_item?: number | null
          preco_unitario?: number | null
          processo_item_id?: string | null
          proposta_id: string
          quantidade?: number | null
          ri?: string | null
          unidade_medida?: string | null
          vinculo_origem?: string
          vinculo_score?: number | null
        }
        Update: {
          aliquota_cofins_pct?: number | null
          aliquota_icms_pct?: number | null
          aliquota_ipi_pct?: number | null
          aliquota_pis_pct?: number | null
          campos_faltantes?: string[]
          cfop?: string | null
          codigo_produto?: string | null
          created_at?: string
          cst?: string | null
          descricao_produto?: string
          extraido_raw?: Json | null
          fora_escopo?: boolean
          id?: string
          item_numero?: number | null
          marca_fabricante?: string | null
          material_code?: string | null
          ncm?: string | null
          preco_total_item?: number | null
          preco_unitario?: number | null
          processo_item_id?: string | null
          proposta_id?: string
          quantidade?: number | null
          ri?: string | null
          unidade_medida?: string | null
          vinculo_origem?: string
          vinculo_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cotacao_proposta_itens_processo_item_id_fkey"
            columns: ["processo_item_id"]
            isOneToOne: false
            referencedRelation: "cotacao_processo_itens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cotacao_proposta_itens_processo_item_id_fkey"
            columns: ["processo_item_id"]
            isOneToOne: false
            referencedRelation: "sup_cotacao_processo_itens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cotacao_proposta_itens_proposta_id_fkey"
            columns: ["proposta_id"]
            isOneToOne: false
            referencedRelation: "cotacao_propostas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cotacao_proposta_itens_proposta_id_fkey"
            columns: ["proposta_id"]
            isOneToOne: false
            referencedRelation: "sup_cotacao_propostas"
            referencedColumns: ["id"]
          },
        ]
      }
      sup_cotacao_propostas: {
        Row: {
          arquivo_origem: string | null
          campos_faltantes: string[]
          cliente_cidade: string | null
          cliente_cnpj: string | null
          cliente_inscricao_estadual: string | null
          cliente_razao_social: string | null
          cliente_uf: string | null
          cod_vendor: string | null
          condicao_pagamento: string | null
          contato_id: string | null
          created_at: string
          criado_por: string | null
          criado_por_nome: string
          dados_bancarios_pix: string | null
          data_emissao: string | null
          extracao_id: string | null
          extraido_raw: Json | null
          faturamento_minimo: number | null
          forma_pagamento: string | null
          fornecedor_cidade: string | null
          fornecedor_cnpj: string | null
          fornecedor_inscricao_estadual: string | null
          fornecedor_match: string
          fornecedor_razao_social: string | null
          fornecedor_telefone: string | null
          fornecedor_uf: string | null
          frete_modalidade: string | null
          id: string
          numero_proposta: string | null
          observacoes_gerais: string | null
          prazo_entrega_dias: number | null
          prazo_entrega_texto: string | null
          processo_id: string
          revisado: boolean
          transportadora_indicada: string | null
          updated_at: string
          validade_data: string | null
          validade_texto: string | null
          valor_total_orcamento: number | null
          vendedor_email: string | null
          vendedor_nome: string | null
          vendedor_telefone: string | null
        }
        Insert: {
          arquivo_origem?: string | null
          campos_faltantes?: string[]
          cliente_cidade?: string | null
          cliente_cnpj?: string | null
          cliente_inscricao_estadual?: string | null
          cliente_razao_social?: string | null
          cliente_uf?: string | null
          cod_vendor?: string | null
          condicao_pagamento?: string | null
          contato_id?: string | null
          created_at?: string
          criado_por?: string | null
          criado_por_nome: string
          dados_bancarios_pix?: string | null
          data_emissao?: string | null
          extracao_id?: string | null
          extraido_raw?: Json | null
          faturamento_minimo?: number | null
          forma_pagamento?: string | null
          fornecedor_cidade?: string | null
          fornecedor_cnpj?: string | null
          fornecedor_inscricao_estadual?: string | null
          fornecedor_match?: string
          fornecedor_razao_social?: string | null
          fornecedor_telefone?: string | null
          fornecedor_uf?: string | null
          frete_modalidade?: string | null
          id?: string
          numero_proposta?: string | null
          observacoes_gerais?: string | null
          prazo_entrega_dias?: number | null
          prazo_entrega_texto?: string | null
          processo_id: string
          revisado?: boolean
          transportadora_indicada?: string | null
          updated_at?: string
          validade_data?: string | null
          validade_texto?: string | null
          valor_total_orcamento?: number | null
          vendedor_email?: string | null
          vendedor_nome?: string | null
          vendedor_telefone?: string | null
        }
        Update: {
          arquivo_origem?: string | null
          campos_faltantes?: string[]
          cliente_cidade?: string | null
          cliente_cnpj?: string | null
          cliente_inscricao_estadual?: string | null
          cliente_razao_social?: string | null
          cliente_uf?: string | null
          cod_vendor?: string | null
          condicao_pagamento?: string | null
          contato_id?: string | null
          created_at?: string
          criado_por?: string | null
          criado_por_nome?: string
          dados_bancarios_pix?: string | null
          data_emissao?: string | null
          extracao_id?: string | null
          extraido_raw?: Json | null
          faturamento_minimo?: number | null
          forma_pagamento?: string | null
          fornecedor_cidade?: string | null
          fornecedor_cnpj?: string | null
          fornecedor_inscricao_estadual?: string | null
          fornecedor_match?: string
          fornecedor_razao_social?: string | null
          fornecedor_telefone?: string | null
          fornecedor_uf?: string | null
          frete_modalidade?: string | null
          id?: string
          numero_proposta?: string | null
          observacoes_gerais?: string | null
          prazo_entrega_dias?: number | null
          prazo_entrega_texto?: string | null
          processo_id?: string
          revisado?: boolean
          transportadora_indicada?: string | null
          updated_at?: string
          validade_data?: string | null
          validade_texto?: string | null
          valor_total_orcamento?: number | null
          vendedor_email?: string | null
          vendedor_nome?: string | null
          vendedor_telefone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cotacao_propostas_contato_id_fkey"
            columns: ["contato_id"]
            isOneToOne: false
            referencedRelation: "contatos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cotacao_propostas_contato_id_fkey"
            columns: ["contato_id"]
            isOneToOne: false
            referencedRelation: "sup_fornecedores_contatos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cotacao_propostas_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "core_perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cotacao_propostas_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cotacao_propostas_extracao_id_fkey"
            columns: ["extracao_id"]
            isOneToOne: false
            referencedRelation: "cotacao_extracoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cotacao_propostas_extracao_id_fkey"
            columns: ["extracao_id"]
            isOneToOne: false
            referencedRelation: "sup_cotacao_extracoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cotacao_propostas_processo_id_fkey"
            columns: ["processo_id"]
            isOneToOne: false
            referencedRelation: "cotacao_processos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cotacao_propostas_processo_id_fkey"
            columns: ["processo_id"]
            isOneToOne: false
            referencedRelation: "sup_cotacao_processos"
            referencedColumns: ["id"]
          },
        ]
      }
      sup_ddp: {
        Row: {
          ddp: string
          descricao: string
        }
        Insert: {
          ddp: string
          descricao: string
        }
        Update: {
          ddp?: string
          descricao?: string
        }
        Relationships: []
      }
      sup_fornecedores_cidades: {
        Row: {
          codigo_postal: string | null
          created_at: string
          estado_uf: string | null
          forn_codigo: string
          forn_nome: string | null
          id: string
          localidade: string | null
          pais: string | null
          rua: string | null
          updated_at: string
        }
        Insert: {
          codigo_postal?: string | null
          created_at?: string
          estado_uf?: string | null
          forn_codigo: string
          forn_nome?: string | null
          id?: string
          localidade?: string | null
          pais?: string | null
          rua?: string | null
          updated_at?: string
        }
        Update: {
          codigo_postal?: string | null
          created_at?: string
          estado_uf?: string | null
          forn_codigo?: string
          forn_nome?: string | null
          id?: string
          localidade?: string | null
          pais?: string | null
          rua?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      sup_fornecedores_cnpj: {
        Row: {
          cnpj: string | null
          cod_forn: string
          created_at: string | null
          fornecedor: string | null
          id: string
          updated_at: string | null
        }
        Insert: {
          cnpj?: string | null
          cod_forn: string
          created_at?: string | null
          fornecedor?: string | null
          id?: string
          updated_at?: string | null
        }
        Update: {
          cnpj?: string | null
          cod_forn?: string
          created_at?: string | null
          fornecedor?: string | null
          id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      sup_fornecedores_contatos: {
        Row: {
          cidade: string | null
          classificacao: string | null
          cnpj: string | null
          cod_vendor: string | null
          created_at: string | null
          email: string | null
          estado_uf: string | null
          fornecedor: string | null
          id: string
          nome_contato: string | null
          nome_fantasia: string | null
          representante_cargo: string | null
          representante_email: string | null
          representante_nome: string | null
          representante_telefone: string | null
          status: string | null
          telefone: string | null
          updated_at: string | null
        }
        Insert: {
          cidade?: string | null
          classificacao?: string | null
          cnpj?: string | null
          cod_vendor?: string | null
          created_at?: string | null
          email?: string | null
          estado_uf?: string | null
          fornecedor?: string | null
          id?: string
          nome_contato?: string | null
          nome_fantasia?: string | null
          representante_cargo?: string | null
          representante_email?: string | null
          representante_nome?: string | null
          representante_telefone?: string | null
          status?: string | null
          telefone?: string | null
          updated_at?: string | null
        }
        Update: {
          cidade?: string | null
          classificacao?: string | null
          cnpj?: string | null
          cod_vendor?: string | null
          created_at?: string | null
          email?: string | null
          estado_uf?: string | null
          fornecedor?: string | null
          id?: string
          nome_contato?: string | null
          nome_fantasia?: string | null
          representante_cargo?: string | null
          representante_email?: string | null
          representante_nome?: string | null
          representante_telefone?: string | null
          status?: string | null
          telefone?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      sup_fretes: {
        Row: {
          ad_valores: number | null
          carreta_acima_27t: number | null
          carreta_ate_25t: number | null
          cat: number | null
          created_at: string | null
          destino: string
          fiorino: number | null
          icms_aplicado: string | null
          id: string
          itr_tas: number | null
          kg_1_10: number | null
          kg_11_20: number | null
          kg_21_30: number | null
          kg_31_50: number | null
          kg_51_70: number | null
          kg_71_100: number | null
          kg_acima_100: number | null
          lead_time_entrega: string | null
          lead_time_entrega_2: string | null
          origem: string
          pedagio_fracao_100kg: number | null
          rotas: string | null
          taxa_fixa_itr_redespacho: number | null
          toco_ate_5_5t: number | null
          truck_ate_14t: number | null
          uf: string
          updated_at: string | null
          veiculo_3_4_ate_2_5t: number | null
        }
        Insert: {
          ad_valores?: number | null
          carreta_acima_27t?: number | null
          carreta_ate_25t?: number | null
          cat?: number | null
          created_at?: string | null
          destino?: string
          fiorino?: number | null
          icms_aplicado?: string | null
          id?: string
          itr_tas?: number | null
          kg_1_10?: number | null
          kg_11_20?: number | null
          kg_21_30?: number | null
          kg_31_50?: number | null
          kg_51_70?: number | null
          kg_71_100?: number | null
          kg_acima_100?: number | null
          lead_time_entrega?: string | null
          lead_time_entrega_2?: string | null
          origem?: string
          pedagio_fracao_100kg?: number | null
          rotas?: string | null
          taxa_fixa_itr_redespacho?: number | null
          toco_ate_5_5t?: number | null
          truck_ate_14t?: number | null
          uf?: string
          updated_at?: string | null
          veiculo_3_4_ate_2_5t?: number | null
        }
        Update: {
          ad_valores?: number | null
          carreta_acima_27t?: number | null
          carreta_ate_25t?: number | null
          cat?: number | null
          created_at?: string | null
          destino?: string
          fiorino?: number | null
          icms_aplicado?: string | null
          id?: string
          itr_tas?: number | null
          kg_1_10?: number | null
          kg_11_20?: number | null
          kg_21_30?: number | null
          kg_31_50?: number | null
          kg_51_70?: number | null
          kg_71_100?: number | null
          kg_acima_100?: number | null
          lead_time_entrega?: string | null
          lead_time_entrega_2?: string | null
          origem?: string
          pedagio_fracao_100kg?: number | null
          rotas?: string | null
          taxa_fixa_itr_redespacho?: number | null
          toco_ate_5_5t?: number | null
          truck_ate_14t?: number | null
          uf?: string
          updated_at?: string | null
          veiculo_3_4_ate_2_5t?: number | null
        }
        Relationships: []
      }
      sup_impostos: {
        Row: {
          descricao: string
          incoterms: string
        }
        Insert: {
          descricao: string
          incoterms: string
        }
        Update: {
          descricao?: string
          incoterms?: string
        }
        Relationships: []
      }
      sup_rastreio_mensagens: {
        Row: {
          autor_id: string
          autor_nome: string
          autor_role: string | null
          created_at: string
          id: string
          mensagem: string
          ri: string
          rm: string | null
        }
        Insert: {
          autor_id: string
          autor_nome: string
          autor_role?: string | null
          created_at?: string
          id: string
          mensagem: string
          ri: string
          rm?: string | null
        }
        Update: {
          autor_id?: string
          autor_nome?: string
          autor_role?: string | null
          created_at?: string
          id?: string
          mensagem?: string
          ri?: string
          rm?: string | null
        }
        Relationships: []
      }
      sup_rastreio_prioridades: {
        Row: {
          created_at: string
          id: string
          nivel: number
          ri: string
          rm: string | null
          solicitante_id: string
          solicitante_nome: string
        }
        Insert: {
          created_at?: string
          id: string
          nivel: number
          ri: string
          rm?: string | null
          solicitante_id: string
          solicitante_nome: string
        }
        Update: {
          created_at?: string
          id?: string
          nivel?: number
          ri?: string
          rm?: string | null
          solicitante_id?: string
          solicitante_nome?: string
        }
        Relationships: []
      }
      tipo_mov_estoque: {
        Row: {
          created_at: string | null
          descricao: string | null
          tmv: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          descricao?: string | null
          tmv: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          descricao?: string | null
          tmv?: string
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      activity_logs: {
        Row: {
          action: string | null
          created_at: string | null
          details: string | null
          email: string | null
          id: string | null
          module: string | null
          user_id: string | null
          user_name: string | null
        }
        Insert: {
          action?: string | null
          created_at?: string | null
          details?: string | null
          email?: string | null
          id?: string | null
          module?: string | null
          user_id?: string | null
          user_name?: string | null
        }
        Update: {
          action?: string | null
          created_at?: string | null
          details?: string | null
          email?: string | null
          id?: string | null
          module?: string | null
          user_id?: string | null
          user_name?: string | null
        }
        Relationships: []
      }
      api_uso_logs: {
        Row: {
          api_id: string | null
          completion_tokens: number | null
          created_at: string | null
          custo_usd: number | null
          duracao_ms: number | null
          erro_mensagem: string | null
          id: string | null
          modelo: string | null
          prompt_tokens: number | null
          sucesso: boolean | null
          total_tokens: number | null
          user_id: string | null
          user_name: string | null
        }
        Insert: {
          api_id?: string | null
          completion_tokens?: number | null
          created_at?: string | null
          custo_usd?: number | null
          duracao_ms?: number | null
          erro_mensagem?: string | null
          id?: string | null
          modelo?: string | null
          prompt_tokens?: number | null
          sucesso?: boolean | null
          total_tokens?: number | null
          user_id?: string | null
          user_name?: string | null
        }
        Update: {
          api_id?: string | null
          completion_tokens?: number | null
          created_at?: string | null
          custo_usd?: number | null
          duracao_ms?: number | null
          erro_mensagem?: string | null
          id?: string | null
          modelo?: string | null
          prompt_tokens?: number | null
          sucesso?: boolean | null
          total_tokens?: number | null
          user_id?: string | null
          user_name?: string | null
        }
        Relationships: []
      }
      buyer_groups: {
        Row: {
          group_code: string | null
          id: string | null
          is_primary: boolean | null
          user_id: string | null
        }
        Insert: {
          group_code?: string | null
          id?: string | null
          is_primary?: boolean | null
          user_id?: string | null
        }
        Update: {
          group_code?: string | null
          id?: string | null
          is_primary?: boolean | null
          user_id?: string | null
        }
        Relationships: []
      }
      cidadeforn: {
        Row: {
          codigo_postal: string | null
          created_at: string | null
          estado_uf: string | null
          forn_codigo: string | null
          forn_nome: string | null
          id: string | null
          localidade: string | null
          pais: string | null
          rua: string | null
          updated_at: string | null
        }
        Insert: {
          codigo_postal?: string | null
          created_at?: string | null
          estado_uf?: string | null
          forn_codigo?: string | null
          forn_nome?: string | null
          id?: string | null
          localidade?: string | null
          pais?: string | null
          rua?: string | null
          updated_at?: string | null
        }
        Update: {
          codigo_postal?: string | null
          created_at?: string | null
          estado_uf?: string | null
          forn_codigo?: string | null
          forn_nome?: string | null
          id?: string | null
          localidade?: string | null
          pais?: string | null
          rua?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      cnpj_forn: {
        Row: {
          cnpj: string | null
          cod_forn: string | null
          created_at: string | null
          fornecedor: string | null
          id: string | null
          updated_at: string | null
        }
        Insert: {
          cnpj?: string | null
          cod_forn?: string | null
          created_at?: string | null
          fornecedor?: string | null
          id?: string | null
          updated_at?: string | null
        }
        Update: {
          cnpj?: string | null
          cod_forn?: string | null
          created_at?: string | null
          fornecedor?: string | null
          id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      compradores: {
        Row: {
          email: string | null
          grupo_compras: string | null
          nome_comprador: string | null
          usuario_sistema: string | null
        }
        Insert: {
          email?: string | null
          grupo_compras?: string | null
          nome_comprador?: string | null
          usuario_sistema?: string | null
        }
        Update: {
          email?: string | null
          grupo_compras?: string | null
          nome_comprador?: string | null
          usuario_sistema?: string | null
        }
        Relationships: []
      }
      contatos: {
        Row: {
          cidade: string | null
          classificacao: string | null
          cnpj: string | null
          cod_vendor: string | null
          created_at: string | null
          email: string | null
          estado_uf: string | null
          fornecedor: string | null
          id: string | null
          nome_contato: string | null
          nome_fantasia: string | null
          representante_cargo: string | null
          representante_email: string | null
          representante_nome: string | null
          representante_telefone: string | null
          status: string | null
          telefone: string | null
          updated_at: string | null
        }
        Insert: {
          cidade?: string | null
          classificacao?: string | null
          cnpj?: string | null
          cod_vendor?: string | null
          created_at?: string | null
          email?: string | null
          estado_uf?: string | null
          fornecedor?: string | null
          id?: string | null
          nome_contato?: string | null
          nome_fantasia?: string | null
          representante_cargo?: string | null
          representante_email?: string | null
          representante_nome?: string | null
          representante_telefone?: string | null
          status?: string | null
          telefone?: string | null
          updated_at?: string | null
        }
        Update: {
          cidade?: string | null
          classificacao?: string | null
          cnpj?: string | null
          cod_vendor?: string | null
          created_at?: string | null
          email?: string | null
          estado_uf?: string | null
          fornecedor?: string | null
          id?: string | null
          nome_contato?: string | null
          nome_fantasia?: string | null
          representante_cargo?: string | null
          representante_email?: string | null
          representante_nome?: string | null
          representante_telefone?: string | null
          status?: string | null
          telefone?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      conversoes_markdown: {
        Row: {
          caracteres: number | null
          created_at: string | null
          custo_usd: number | null
          duracao_ms: number | null
          erro_mensagem: string | null
          formato: string | null
          id: string | null
          markdown: string | null
          modelo: string | null
          nome_arquivo: string | null
          sucesso: boolean | null
          tamanho_bytes: number | null
          tokens: number | null
          tokens_reais: boolean | null
          user_id: string | null
          user_name: string | null
          via: string | null
        }
        Insert: {
          caracteres?: number | null
          created_at?: string | null
          custo_usd?: number | null
          duracao_ms?: number | null
          erro_mensagem?: string | null
          formato?: string | null
          id?: string | null
          markdown?: string | null
          modelo?: string | null
          nome_arquivo?: string | null
          sucesso?: boolean | null
          tamanho_bytes?: number | null
          tokens?: number | null
          tokens_reais?: boolean | null
          user_id?: string | null
          user_name?: string | null
          via?: string | null
        }
        Update: {
          caracteres?: number | null
          created_at?: string | null
          custo_usd?: number | null
          duracao_ms?: number | null
          erro_mensagem?: string | null
          formato?: string | null
          id?: string | null
          markdown?: string | null
          modelo?: string | null
          nome_arquivo?: string | null
          sucesso?: boolean | null
          tamanho_bytes?: number | null
          tokens?: number | null
          tokens_reais?: boolean | null
          user_id?: string | null
          user_name?: string | null
          via?: string | null
        }
        Relationships: []
      }
      cotacao_descricao_map: {
        Row: {
          codigo_produto: string | null
          created_at: string | null
          descricao_norm: string | null
          descricao_original: string | null
          fornecedor_cnpj: string | null
          id: string | null
          material_code: string | null
          ultima_confirmacao: string | null
          ultimo_usuario_nome: string | null
          unidade_medida: string | null
          vezes_confirmado: number | null
        }
        Insert: {
          codigo_produto?: string | null
          created_at?: string | null
          descricao_norm?: string | null
          descricao_original?: string | null
          fornecedor_cnpj?: string | null
          id?: string | null
          material_code?: string | null
          ultima_confirmacao?: string | null
          ultimo_usuario_nome?: string | null
          unidade_medida?: string | null
          vezes_confirmado?: number | null
        }
        Update: {
          codigo_produto?: string | null
          created_at?: string | null
          descricao_norm?: string | null
          descricao_original?: string | null
          fornecedor_cnpj?: string | null
          id?: string | null
          material_code?: string | null
          ultima_confirmacao?: string | null
          ultimo_usuario_nome?: string | null
          unidade_medida?: string | null
          vezes_confirmado?: number | null
        }
        Relationships: []
      }
      cotacao_extracoes: {
        Row: {
          chars_entrada: number | null
          completion_tokens: number | null
          created_at: string | null
          custo_usd: number | null
          duracao_ms: number | null
          erro_codigo: string | null
          erro_mensagem: string | null
          id: string | null
          itens_extraidos: number | null
          modelo: string | null
          processo_id: string | null
          prompt_tokens: number | null
          propostas_extraidas: number | null
          sucesso: boolean | null
          total_tokens: number | null
          truncado: boolean | null
          user_id: string | null
          user_name: string | null
        }
        Insert: {
          chars_entrada?: number | null
          completion_tokens?: number | null
          created_at?: string | null
          custo_usd?: number | null
          duracao_ms?: number | null
          erro_codigo?: string | null
          erro_mensagem?: string | null
          id?: string | null
          itens_extraidos?: number | null
          modelo?: string | null
          processo_id?: string | null
          prompt_tokens?: number | null
          propostas_extraidas?: number | null
          sucesso?: boolean | null
          total_tokens?: number | null
          truncado?: boolean | null
          user_id?: string | null
          user_name?: string | null
        }
        Update: {
          chars_entrada?: number | null
          completion_tokens?: number | null
          created_at?: string | null
          custo_usd?: number | null
          duracao_ms?: number | null
          erro_codigo?: string | null
          erro_mensagem?: string | null
          id?: string | null
          itens_extraidos?: number | null
          modelo?: string | null
          processo_id?: string | null
          prompt_tokens?: number | null
          propostas_extraidas?: number | null
          sucesso?: boolean | null
          total_tokens?: number | null
          truncado?: boolean | null
          user_id?: string | null
          user_name?: string | null
        }
        Relationships: []
      }
      cotacao_historico: {
        Row: {
          cod_forn: string | null
          created_at: string | null
          fornecedor_nome: string | null
          id: string | null
          ri: string | null
          rm: string | null
          user_id: string | null
          user_name: string | null
        }
        Insert: {
          cod_forn?: string | null
          created_at?: string | null
          fornecedor_nome?: string | null
          id?: string | null
          ri?: string | null
          rm?: string | null
          user_id?: string | null
          user_name?: string | null
        }
        Update: {
          cod_forn?: string | null
          created_at?: string | null
          fornecedor_nome?: string | null
          id?: string | null
          ri?: string | null
          rm?: string | null
          user_id?: string | null
          user_name?: string | null
        }
        Relationships: []
      }
      cotacao_processo_itens: {
        Row: {
          centro: string | null
          created_at: string | null
          deposito: string | null
          id: string | null
          item_reqc: string | null
          material_code: string | null
          processo_id: string | null
          qtd_solicitada: number | null
          ri: string | null
          rm: string | null
          texto_breve: string | null
          unidade_medida: string | null
        }
        Insert: {
          centro?: string | null
          created_at?: string | null
          deposito?: string | null
          id?: string | null
          item_reqc?: string | null
          material_code?: string | null
          processo_id?: string | null
          qtd_solicitada?: number | null
          ri?: string | null
          rm?: string | null
          texto_breve?: string | null
          unidade_medida?: string | null
        }
        Update: {
          centro?: string | null
          created_at?: string | null
          deposito?: string | null
          id?: string | null
          item_reqc?: string | null
          material_code?: string | null
          processo_id?: string | null
          qtd_solicitada?: number | null
          ri?: string | null
          rm?: string | null
          texto_breve?: string | null
          unidade_medida?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cotacao_processo_itens_processo_id_fkey"
            columns: ["processo_id"]
            isOneToOne: false
            referencedRelation: "cotacao_processos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cotacao_processo_itens_processo_id_fkey"
            columns: ["processo_id"]
            isOneToOne: false
            referencedRelation: "sup_cotacao_processos"
            referencedColumns: ["id"]
          },
        ]
      }
      cotacao_processos: {
        Row: {
          created_at: string | null
          criado_por: string | null
          criado_por_nome: string | null
          id: string | null
          numero: string | null
          observacoes: string | null
          status: string | null
          titulo: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          criado_por?: string | null
          criado_por_nome?: string | null
          id?: string | null
          numero?: string | null
          observacoes?: string | null
          status?: string | null
          titulo?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          criado_por?: string | null
          criado_por_nome?: string | null
          id?: string | null
          numero?: string | null
          observacoes?: string | null
          status?: string | null
          titulo?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cotacao_processos_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "core_perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cotacao_processos_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cotacao_proposta_itens: {
        Row: {
          aliquota_cofins_pct: number | null
          aliquota_icms_pct: number | null
          aliquota_ipi_pct: number | null
          aliquota_pis_pct: number | null
          campos_faltantes: string[] | null
          cfop: string | null
          codigo_produto: string | null
          created_at: string | null
          cst: string | null
          descricao_produto: string | null
          extraido_raw: Json | null
          fora_escopo: boolean | null
          id: string | null
          item_numero: number | null
          marca_fabricante: string | null
          material_code: string | null
          ncm: string | null
          preco_total_item: number | null
          preco_unitario: number | null
          processo_item_id: string | null
          proposta_id: string | null
          quantidade: number | null
          ri: string | null
          unidade_medida: string | null
          vinculo_origem: string | null
          vinculo_score: number | null
        }
        Insert: {
          aliquota_cofins_pct?: number | null
          aliquota_icms_pct?: number | null
          aliquota_ipi_pct?: number | null
          aliquota_pis_pct?: number | null
          campos_faltantes?: string[] | null
          cfop?: string | null
          codigo_produto?: string | null
          created_at?: string | null
          cst?: string | null
          descricao_produto?: string | null
          extraido_raw?: Json | null
          fora_escopo?: boolean | null
          id?: string | null
          item_numero?: number | null
          marca_fabricante?: string | null
          material_code?: string | null
          ncm?: string | null
          preco_total_item?: number | null
          preco_unitario?: number | null
          processo_item_id?: string | null
          proposta_id?: string | null
          quantidade?: number | null
          ri?: string | null
          unidade_medida?: string | null
          vinculo_origem?: string | null
          vinculo_score?: number | null
        }
        Update: {
          aliquota_cofins_pct?: number | null
          aliquota_icms_pct?: number | null
          aliquota_ipi_pct?: number | null
          aliquota_pis_pct?: number | null
          campos_faltantes?: string[] | null
          cfop?: string | null
          codigo_produto?: string | null
          created_at?: string | null
          cst?: string | null
          descricao_produto?: string | null
          extraido_raw?: Json | null
          fora_escopo?: boolean | null
          id?: string | null
          item_numero?: number | null
          marca_fabricante?: string | null
          material_code?: string | null
          ncm?: string | null
          preco_total_item?: number | null
          preco_unitario?: number | null
          processo_item_id?: string | null
          proposta_id?: string | null
          quantidade?: number | null
          ri?: string | null
          unidade_medida?: string | null
          vinculo_origem?: string | null
          vinculo_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cotacao_proposta_itens_processo_item_id_fkey"
            columns: ["processo_item_id"]
            isOneToOne: false
            referencedRelation: "cotacao_processo_itens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cotacao_proposta_itens_processo_item_id_fkey"
            columns: ["processo_item_id"]
            isOneToOne: false
            referencedRelation: "sup_cotacao_processo_itens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cotacao_proposta_itens_proposta_id_fkey"
            columns: ["proposta_id"]
            isOneToOne: false
            referencedRelation: "cotacao_propostas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cotacao_proposta_itens_proposta_id_fkey"
            columns: ["proposta_id"]
            isOneToOne: false
            referencedRelation: "sup_cotacao_propostas"
            referencedColumns: ["id"]
          },
        ]
      }
      cotacao_propostas: {
        Row: {
          arquivo_origem: string | null
          campos_faltantes: string[] | null
          cliente_cidade: string | null
          cliente_cnpj: string | null
          cliente_inscricao_estadual: string | null
          cliente_razao_social: string | null
          cliente_uf: string | null
          cod_vendor: string | null
          condicao_pagamento: string | null
          contato_id: string | null
          created_at: string | null
          criado_por: string | null
          criado_por_nome: string | null
          dados_bancarios_pix: string | null
          data_emissao: string | null
          extracao_id: string | null
          extraido_raw: Json | null
          faturamento_minimo: number | null
          forma_pagamento: string | null
          fornecedor_cidade: string | null
          fornecedor_cnpj: string | null
          fornecedor_inscricao_estadual: string | null
          fornecedor_match: string | null
          fornecedor_razao_social: string | null
          fornecedor_telefone: string | null
          fornecedor_uf: string | null
          frete_modalidade: string | null
          id: string | null
          numero_proposta: string | null
          observacoes_gerais: string | null
          prazo_entrega_dias: number | null
          prazo_entrega_texto: string | null
          processo_id: string | null
          revisado: boolean | null
          transportadora_indicada: string | null
          updated_at: string | null
          validade_data: string | null
          validade_texto: string | null
          valor_total_orcamento: number | null
          vendedor_email: string | null
          vendedor_nome: string | null
          vendedor_telefone: string | null
        }
        Insert: {
          arquivo_origem?: string | null
          campos_faltantes?: string[] | null
          cliente_cidade?: string | null
          cliente_cnpj?: string | null
          cliente_inscricao_estadual?: string | null
          cliente_razao_social?: string | null
          cliente_uf?: string | null
          cod_vendor?: string | null
          condicao_pagamento?: string | null
          contato_id?: string | null
          created_at?: string | null
          criado_por?: string | null
          criado_por_nome?: string | null
          dados_bancarios_pix?: string | null
          data_emissao?: string | null
          extracao_id?: string | null
          extraido_raw?: Json | null
          faturamento_minimo?: number | null
          forma_pagamento?: string | null
          fornecedor_cidade?: string | null
          fornecedor_cnpj?: string | null
          fornecedor_inscricao_estadual?: string | null
          fornecedor_match?: string | null
          fornecedor_razao_social?: string | null
          fornecedor_telefone?: string | null
          fornecedor_uf?: string | null
          frete_modalidade?: string | null
          id?: string | null
          numero_proposta?: string | null
          observacoes_gerais?: string | null
          prazo_entrega_dias?: number | null
          prazo_entrega_texto?: string | null
          processo_id?: string | null
          revisado?: boolean | null
          transportadora_indicada?: string | null
          updated_at?: string | null
          validade_data?: string | null
          validade_texto?: string | null
          valor_total_orcamento?: number | null
          vendedor_email?: string | null
          vendedor_nome?: string | null
          vendedor_telefone?: string | null
        }
        Update: {
          arquivo_origem?: string | null
          campos_faltantes?: string[] | null
          cliente_cidade?: string | null
          cliente_cnpj?: string | null
          cliente_inscricao_estadual?: string | null
          cliente_razao_social?: string | null
          cliente_uf?: string | null
          cod_vendor?: string | null
          condicao_pagamento?: string | null
          contato_id?: string | null
          created_at?: string | null
          criado_por?: string | null
          criado_por_nome?: string | null
          dados_bancarios_pix?: string | null
          data_emissao?: string | null
          extracao_id?: string | null
          extraido_raw?: Json | null
          faturamento_minimo?: number | null
          forma_pagamento?: string | null
          fornecedor_cidade?: string | null
          fornecedor_cnpj?: string | null
          fornecedor_inscricao_estadual?: string | null
          fornecedor_match?: string | null
          fornecedor_razao_social?: string | null
          fornecedor_telefone?: string | null
          fornecedor_uf?: string | null
          frete_modalidade?: string | null
          id?: string | null
          numero_proposta?: string | null
          observacoes_gerais?: string | null
          prazo_entrega_dias?: number | null
          prazo_entrega_texto?: string | null
          processo_id?: string | null
          revisado?: boolean | null
          transportadora_indicada?: string | null
          updated_at?: string | null
          validade_data?: string | null
          validade_texto?: string | null
          valor_total_orcamento?: number | null
          vendedor_email?: string | null
          vendedor_nome?: string | null
          vendedor_telefone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cotacao_propostas_contato_id_fkey"
            columns: ["contato_id"]
            isOneToOne: false
            referencedRelation: "contatos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cotacao_propostas_contato_id_fkey"
            columns: ["contato_id"]
            isOneToOne: false
            referencedRelation: "sup_fornecedores_contatos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cotacao_propostas_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "core_perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cotacao_propostas_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cotacao_propostas_extracao_id_fkey"
            columns: ["extracao_id"]
            isOneToOne: false
            referencedRelation: "cotacao_extracoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cotacao_propostas_extracao_id_fkey"
            columns: ["extracao_id"]
            isOneToOne: false
            referencedRelation: "sup_cotacao_extracoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cotacao_propostas_processo_id_fkey"
            columns: ["processo_id"]
            isOneToOne: false
            referencedRelation: "cotacao_processos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cotacao_propostas_processo_id_fkey"
            columns: ["processo_id"]
            isOneToOne: false
            referencedRelation: "sup_cotacao_processos"
            referencedColumns: ["id"]
          },
        ]
      }
      dataset_versions: {
        Row: {
          dataset: string | null
          row_count: number | null
          updated_at: string | null
          updated_by: string | null
          version: number | null
        }
        Insert: {
          dataset?: string | null
          row_count?: number | null
          updated_at?: string | null
          updated_by?: string | null
          version?: number | null
        }
        Update: {
          dataset?: string | null
          row_count?: number | null
          updated_at?: string | null
          updated_by?: string | null
          version?: number | null
        }
        Relationships: []
      }
      ddp: {
        Row: {
          ddp: string | null
          descricao: string | null
        }
        Insert: {
          ddp?: string | null
          descricao?: string | null
        }
        Update: {
          ddp?: string | null
          descricao?: string | null
        }
        Relationships: []
      }
      estoque: {
        Row: {
          aplicacao: string | null
          centro: string | null
          class_item: string | null
          deposito: string | null
          empresa: string | null
          grp_mercad: string | null
          grupo_mercadorias: string | null
          id: number | null
          imported_at: string | null
          material: string | null
          preco_medio: number | null
          quantidade: number | null
          referencia_fabricante: string | null
          texto_pedido_compra: string | null
          tipo_material: string | null
          txt_breve_material: string | null
          umb: string | null
          valor_total: number | null
        }
        Insert: {
          aplicacao?: string | null
          centro?: string | null
          class_item?: string | null
          deposito?: string | null
          empresa?: string | null
          grp_mercad?: string | null
          grupo_mercadorias?: string | null
          id?: number | null
          imported_at?: string | null
          material?: string | null
          preco_medio?: number | null
          quantidade?: number | null
          referencia_fabricante?: string | null
          texto_pedido_compra?: string | null
          tipo_material?: string | null
          txt_breve_material?: string | null
          umb?: string | null
          valor_total?: number | null
        }
        Update: {
          aplicacao?: string | null
          centro?: string | null
          class_item?: string | null
          deposito?: string | null
          empresa?: string | null
          grp_mercad?: string | null
          grupo_mercadorias?: string | null
          id?: number | null
          imported_at?: string | null
          material?: string | null
          preco_medio?: number | null
          quantidade?: number | null
          referencia_fabricante?: string | null
          texto_pedido_compra?: string | null
          tipo_material?: string | null
          txt_breve_material?: string | null
          umb?: string | null
          valor_total?: number | null
        }
        Relationships: []
      }
      fbl1n_c_pagar: {
        Row: {
          ano_mes: string | null
          atribuicao: string | null
          bloqueio_pagamento: string | null
          campos_extras: Json | null
          centro: string | null
          centro_lucro: string | null
          chave_referencia_1: string | null
          codigo_imposto: string | null
          condicoes_pagamento: string | null
          conta: string | null
          conta_lancamento_contrapartida: string | null
          data_compensacao: string | null
          data_documento: string | null
          data_entrada: string | null
          data_lancamento: string | null
          data_pagamento: string | null
          doc_compensacao: string | null
          doc_faturamento: string | null
          documento_compras: string | null
          elemento_pep: string | null
          empresa: string | null
          estorno_com: string | null
          fornecedor: string | null
          id: number | null
          id_fiscal_1: string | null
          id_fiscal_iva: string | null
          imobilizado: string | null
          imported_at: string | null
          loc_negocios: string | null
          moeda_documento: string | null
          montante_base_desconto: number | null
          montante_base_irf: number | null
          montante_irf: number | null
          montante_mi2: number | null
          montante_mi3: number | null
          montante_moeda_doc: number | null
          motivo_estorno: string | null
          numero_documento: string | null
          parcela: string | null
          parcelamento_tributario: string | null
          razao_social_fornecedor: string | null
          referencia: string | null
          simbolo_partida: string | null
          texto: string | null
          texto_cabecalho_documento: string | null
          tipo_documento: string | null
          vencimento_liquido: string | null
          vencimento_original: string | null
        }
        Insert: {
          ano_mes?: string | null
          atribuicao?: string | null
          bloqueio_pagamento?: string | null
          campos_extras?: Json | null
          centro?: string | null
          centro_lucro?: string | null
          chave_referencia_1?: string | null
          codigo_imposto?: string | null
          condicoes_pagamento?: string | null
          conta?: string | null
          conta_lancamento_contrapartida?: string | null
          data_compensacao?: string | null
          data_documento?: string | null
          data_entrada?: string | null
          data_lancamento?: string | null
          data_pagamento?: string | null
          doc_compensacao?: string | null
          doc_faturamento?: string | null
          documento_compras?: string | null
          elemento_pep?: string | null
          empresa?: string | null
          estorno_com?: string | null
          fornecedor?: string | null
          id?: number | null
          id_fiscal_1?: string | null
          id_fiscal_iva?: string | null
          imobilizado?: string | null
          imported_at?: string | null
          loc_negocios?: string | null
          moeda_documento?: string | null
          montante_base_desconto?: number | null
          montante_base_irf?: number | null
          montante_irf?: number | null
          montante_mi2?: number | null
          montante_mi3?: number | null
          montante_moeda_doc?: number | null
          motivo_estorno?: string | null
          numero_documento?: string | null
          parcela?: string | null
          parcelamento_tributario?: string | null
          razao_social_fornecedor?: string | null
          referencia?: string | null
          simbolo_partida?: string | null
          texto?: string | null
          texto_cabecalho_documento?: string | null
          tipo_documento?: string | null
          vencimento_liquido?: string | null
          vencimento_original?: string | null
        }
        Update: {
          ano_mes?: string | null
          atribuicao?: string | null
          bloqueio_pagamento?: string | null
          campos_extras?: Json | null
          centro?: string | null
          centro_lucro?: string | null
          chave_referencia_1?: string | null
          codigo_imposto?: string | null
          condicoes_pagamento?: string | null
          conta?: string | null
          conta_lancamento_contrapartida?: string | null
          data_compensacao?: string | null
          data_documento?: string | null
          data_entrada?: string | null
          data_lancamento?: string | null
          data_pagamento?: string | null
          doc_compensacao?: string | null
          doc_faturamento?: string | null
          documento_compras?: string | null
          elemento_pep?: string | null
          empresa?: string | null
          estorno_com?: string | null
          fornecedor?: string | null
          id?: number | null
          id_fiscal_1?: string | null
          id_fiscal_iva?: string | null
          imobilizado?: string | null
          imported_at?: string | null
          loc_negocios?: string | null
          moeda_documento?: string | null
          montante_base_desconto?: number | null
          montante_base_irf?: number | null
          montante_irf?: number | null
          montante_mi2?: number | null
          montante_mi3?: number | null
          montante_moeda_doc?: number | null
          motivo_estorno?: string | null
          numero_documento?: string | null
          parcela?: string | null
          parcelamento_tributario?: string | null
          razao_social_fornecedor?: string | null
          referencia?: string | null
          simbolo_partida?: string | null
          texto?: string | null
          texto_cabecalho_documento?: string | null
          tipo_documento?: string | null
          vencimento_liquido?: string | null
          vencimento_original?: string | null
        }
        Relationships: []
      }
      feedback_reports: {
        Row: {
          admin_notes: string | null
          console_logs: Json | null
          created_at: string | null
          description: string | null
          error_stack: string | null
          id: string | null
          page_path: string | null
          screenshot_path: string | null
          status: string | null
          type: string | null
          updated_at: string | null
          user_agent: string | null
          user_email: string | null
          user_id: string | null
          user_name: string | null
        }
        Insert: {
          admin_notes?: string | null
          console_logs?: Json | null
          created_at?: string | null
          description?: string | null
          error_stack?: string | null
          id?: string | null
          page_path?: string | null
          screenshot_path?: string | null
          status?: string | null
          type?: string | null
          updated_at?: string | null
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
          user_name?: string | null
        }
        Update: {
          admin_notes?: string | null
          console_logs?: Json | null
          created_at?: string | null
          description?: string | null
          error_stack?: string | null
          id?: string | null
          page_path?: string | null
          screenshot_path?: string | null
          status?: string | null
          type?: string | null
          updated_at?: string | null
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
          user_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feedback_reports_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "core_perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_reports_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      import_logs: {
        Row: {
          columns_missing: Json | null
          columns_new: Json | null
          created_at: string | null
          filename: string | null
          id: string | null
          ignored_rows: Json | null
          ignored_rows_count: number | null
          missing_ris: Json | null
          missing_ris_count: number | null
          new_ris: Json | null
          quantity_changes: Json | null
          records_eliminated: number | null
          records_inserted: number | null
          records_read: number | null
          records_unchanged: number | null
          records_updated: number | null
          type: string | null
          user_name: string | null
        }
        Insert: {
          columns_missing?: Json | null
          columns_new?: Json | null
          created_at?: string | null
          filename?: string | null
          id?: string | null
          ignored_rows?: Json | null
          ignored_rows_count?: number | null
          missing_ris?: Json | null
          missing_ris_count?: number | null
          new_ris?: Json | null
          quantity_changes?: Json | null
          records_eliminated?: number | null
          records_inserted?: number | null
          records_read?: number | null
          records_unchanged?: number | null
          records_updated?: number | null
          type?: string | null
          user_name?: string | null
        }
        Update: {
          columns_missing?: Json | null
          columns_new?: Json | null
          created_at?: string | null
          filename?: string | null
          id?: string | null
          ignored_rows?: Json | null
          ignored_rows_count?: number | null
          missing_ris?: Json | null
          missing_ris_count?: number | null
          new_ris?: Json | null
          quantity_changes?: Json | null
          records_eliminated?: number | null
          records_inserted?: number | null
          records_read?: number | null
          records_unchanged?: number | null
          records_updated?: number | null
          type?: string | null
          user_name?: string | null
        }
        Relationships: []
      }
      impostos: {
        Row: {
          descricao: string | null
          incoterms: string | null
        }
        Insert: {
          descricao?: string | null
          incoterms?: string | null
        }
        Update: {
          descricao?: string | null
          incoterms?: string | null
        }
        Relationships: []
      }
      materials: {
        Row: {
          busca_desc: string | null
          busca_texto: string | null
          categoria_item: string | null
          category: string | null
          centro: string | null
          classe_avaliacao: string | null
          classe_fiscal: string | null
          codigo_controle: string | null
          company: string | null
          created_at: string | null
          criado_em: string | null
          denominacao: string | null
          description: string | null
          elim_nivel_centro: string | null
          eliminacao: string | null
          grupo_mercadoria_codigo: string | null
          grupo_mercadoria_desc: string | null
          id: string | null
          idioma: string | null
          imported_at: string | null
          indicador_s: string | null
          is_active: boolean | null
          material_basico: string | null
          material_code: string | null
          modificado_por: string | null
          numero_pf: string | null
          pais: string | null
          status_centro: string | null
          status_geral: string | null
          technical_text: string | null
          tipo_material: string | null
          tipo_material_desc: string | null
          ultima_modificacao: string | null
          unidade_medida_alt: string | null
          unit: string | null
        }
        Insert: {
          busca_desc?: string | null
          busca_texto?: string | null
          categoria_item?: string | null
          category?: string | null
          centro?: string | null
          classe_avaliacao?: string | null
          classe_fiscal?: string | null
          codigo_controle?: string | null
          company?: string | null
          created_at?: string | null
          criado_em?: string | null
          denominacao?: string | null
          description?: string | null
          elim_nivel_centro?: string | null
          eliminacao?: string | null
          grupo_mercadoria_codigo?: string | null
          grupo_mercadoria_desc?: string | null
          id?: string | null
          idioma?: string | null
          imported_at?: string | null
          indicador_s?: string | null
          is_active?: boolean | null
          material_basico?: string | null
          material_code?: string | null
          modificado_por?: string | null
          numero_pf?: string | null
          pais?: string | null
          status_centro?: string | null
          status_geral?: string | null
          technical_text?: string | null
          tipo_material?: string | null
          tipo_material_desc?: string | null
          ultima_modificacao?: string | null
          unidade_medida_alt?: string | null
          unit?: string | null
        }
        Update: {
          busca_desc?: string | null
          busca_texto?: string | null
          categoria_item?: string | null
          category?: string | null
          centro?: string | null
          classe_avaliacao?: string | null
          classe_fiscal?: string | null
          codigo_controle?: string | null
          company?: string | null
          created_at?: string | null
          criado_em?: string | null
          denominacao?: string | null
          description?: string | null
          elim_nivel_centro?: string | null
          eliminacao?: string | null
          grupo_mercadoria_codigo?: string | null
          grupo_mercadoria_desc?: string | null
          id?: string | null
          idioma?: string | null
          imported_at?: string | null
          indicador_s?: string | null
          is_active?: boolean | null
          material_basico?: string | null
          material_code?: string | null
          modificado_por?: string | null
          numero_pf?: string | null
          pais?: string | null
          status_centro?: string | null
          status_geral?: string | null
          technical_text?: string | null
          tipo_material?: string | null
          tipo_material_desc?: string | null
          ultima_modificacao?: string | null
          unidade_medida_alt?: string | null
          unit?: string | null
        }
        Relationships: []
      }
      mb51_mov_estoque: {
        Row: {
          campos_extras: Json | null
          centro: string | null
          chave_unica: string | null
          created_at: string | null
          data_documento: string | null
          data_entrada: string | null
          data_lancamento: string | null
          deposito: string | null
          doc_material: string | null
          elemento_pep: string | null
          fornecedor: string | null
          hora_registro: string | null
          id: number | null
          imobilizado: string | null
          imported_at: string | null
          item: string | null
          material: string | null
          moeda: string | null
          montante_mi: number | null
          nome_usuario: string | null
          pedido: string | null
          posicao_deposito: string | null
          qtd_um_registro: number | null
          razao_social_fornecedor: string | null
          referencia: string | null
          texto_breve_material: string | null
          texto_cabecalho_doc: string | null
          tipo_movimento: string | null
          txt_tipo_movimento: string | null
          um_registro: string | null
          unid_medida_basica: string | null
        }
        Insert: {
          campos_extras?: Json | null
          centro?: string | null
          chave_unica?: string | null
          created_at?: string | null
          data_documento?: string | null
          data_entrada?: string | null
          data_lancamento?: string | null
          deposito?: string | null
          doc_material?: string | null
          elemento_pep?: string | null
          fornecedor?: string | null
          hora_registro?: string | null
          id?: number | null
          imobilizado?: string | null
          imported_at?: string | null
          item?: string | null
          material?: string | null
          moeda?: string | null
          montante_mi?: number | null
          nome_usuario?: string | null
          pedido?: string | null
          posicao_deposito?: string | null
          qtd_um_registro?: number | null
          razao_social_fornecedor?: string | null
          referencia?: string | null
          texto_breve_material?: string | null
          texto_cabecalho_doc?: string | null
          tipo_movimento?: string | null
          txt_tipo_movimento?: string | null
          um_registro?: string | null
          unid_medida_basica?: string | null
        }
        Update: {
          campos_extras?: Json | null
          centro?: string | null
          chave_unica?: string | null
          created_at?: string | null
          data_documento?: string | null
          data_entrada?: string | null
          data_lancamento?: string | null
          deposito?: string | null
          doc_material?: string | null
          elemento_pep?: string | null
          fornecedor?: string | null
          hora_registro?: string | null
          id?: number | null
          imobilizado?: string | null
          imported_at?: string | null
          item?: string | null
          material?: string | null
          moeda?: string | null
          montante_mi?: number | null
          nome_usuario?: string | null
          pedido?: string | null
          posicao_deposito?: string | null
          qtd_um_registro?: number | null
          razao_social_fornecedor?: string | null
          referencia?: string | null
          texto_breve_material?: string | null
          texto_cabecalho_doc?: string | null
          tipo_movimento?: string | null
          txt_tipo_movimento?: string | null
          um_registro?: string | null
          unid_medida_basica?: string | null
        }
        Relationships: []
      }
      me3n_contratos: {
        Row: {
          a_fornecer_qtd: number | null
          a_fornecer_valor: number | null
          ainda_faturar_qtd: number | null
          ainda_faturar_valor: number | null
          centro: string | null
          codigo_eliminacao: string | null
          codigo_liberacao: string | null
          criado_por: string | null
          data_documento: string | null
          documento_compras: string | null
          estado_liberacao: string | null
          fim_validade: string | null
          fornecedor: string | null
          historico_pedido: string | null
          id: number | null
          imported_at: string | null
          inicio_validade: string | null
          item: string | null
          material: string | null
          moeda: string | null
          preco_liquido: number | null
          qtd_prev_pendente: number | null
          qtd_solicit_anterior: number | null
          requisitante: string | null
          texto_breve: string | null
          um_pedido: string | null
          unidade_preco: string | null
          valor_efetivo: number | null
          valor_liquido_pedido: number | null
          valor_pendente: number | null
          valor_solicitado: number | null
        }
        Insert: {
          a_fornecer_qtd?: number | null
          a_fornecer_valor?: number | null
          ainda_faturar_qtd?: number | null
          ainda_faturar_valor?: number | null
          centro?: string | null
          codigo_eliminacao?: string | null
          codigo_liberacao?: string | null
          criado_por?: string | null
          data_documento?: string | null
          documento_compras?: string | null
          estado_liberacao?: string | null
          fim_validade?: string | null
          fornecedor?: string | null
          historico_pedido?: string | null
          id?: number | null
          imported_at?: string | null
          inicio_validade?: string | null
          item?: string | null
          material?: string | null
          moeda?: string | null
          preco_liquido?: number | null
          qtd_prev_pendente?: number | null
          qtd_solicit_anterior?: number | null
          requisitante?: string | null
          texto_breve?: string | null
          um_pedido?: string | null
          unidade_preco?: string | null
          valor_efetivo?: number | null
          valor_liquido_pedido?: number | null
          valor_pendente?: number | null
          valor_solicitado?: number | null
        }
        Update: {
          a_fornecer_qtd?: number | null
          a_fornecer_valor?: number | null
          ainda_faturar_qtd?: number | null
          ainda_faturar_valor?: number | null
          centro?: string | null
          codigo_eliminacao?: string | null
          codigo_liberacao?: string | null
          criado_por?: string | null
          data_documento?: string | null
          documento_compras?: string | null
          estado_liberacao?: string | null
          fim_validade?: string | null
          fornecedor?: string | null
          historico_pedido?: string | null
          id?: number | null
          imported_at?: string | null
          inicio_validade?: string | null
          item?: string | null
          material?: string | null
          moeda?: string | null
          preco_liquido?: number | null
          qtd_prev_pendente?: number | null
          qtd_solicit_anterior?: number | null
          requisitante?: string | null
          texto_breve?: string | null
          um_pedido?: string | null
          unidade_preco?: string | null
          valor_efetivo?: number | null
          valor_liquido_pedido?: number | null
          valor_pendente?: number | null
          valor_solicitado?: number | null
        }
        Relationships: []
      }
      mv_benchmark_material: {
        Row: {
          confianca: string | null
          material: string | null
          n_compras: number | null
          primeira_compra: string | null
          qtd_mediana: number | null
          ref_p25: number | null
          ref_p50: number | null
          ref_p75: number | null
          sd_log: number | null
          txt_breve: string | null
          ultima_compra: string | null
        }
        Relationships: []
      }
      mv_historico_pedidos: {
        Row: {
          cnpj: string | null
          cod_forn: string | null
          data_doc: string | null
          doc_compra: string | null
          fornecedor: string | null
          grp_mercads: string | null
          material: string | null
          pedido_parcial: boolean | null
          preco_liquido_unit: number | null
          qtd_fornecida: number | null
          qtd_pedido: number | null
          regiao_uf: string | null
          reqc: string | null
          tipo_item: string | null
          txt_breve: string | null
          valor_liquido: number | null
        }
        Relationships: []
      }
      mv_material_sinais: {
        Row: {
          areas: string[] | null
          chega_em: string | null
          depositos: string[] | null
          material_code: string | null
          pedido_aberto: string | null
          qtd_estoque: number | null
          qtd_pedido_aberto: number | null
          qtd_rm_aberta: number | null
          rm_aberta: string | null
          rms_12m: number | null
          rms_sem_pedido: number | null
          ultima_rm: string | null
        }
        Relationships: []
      }
      mv_pedido_atual_por_ri: {
        Row: {
          criado_por_pedido: string | null
          data_doc: string | null
          data_migo: string | null
          dias_atrasado: number | null
          doc_compra: string | null
          dt_remessa: string | null
          fornecedor_codigo: string | null
          fornecedor_nome: string | null
          item: string | null
          ri: string | null
          status_entrega: string | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          context_key: string | null
          created_at: string | null
          description: string | null
          id: string | null
          is_read: boolean | null
          request_id: string | null
          request_number: string | null
          title: string | null
          type: string | null
          user_id: string | null
        }
        Insert: {
          context_key?: string | null
          created_at?: string | null
          description?: string | null
          id?: string | null
          is_read?: boolean | null
          request_id?: string | null
          request_number?: string | null
          title?: string | null
          type?: string | null
          user_id?: string | null
        }
        Update: {
          context_key?: string | null
          created_at?: string | null
          description?: string | null
          id?: string | null
          is_read?: boolean | null
          request_id?: string | null
          request_number?: string | null
          title?: string | null
          type?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "core_solicitacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
        ]
      }
      obs_historico: {
        Row: {
          campo_alterado: string | null
          created_at: string | null
          id: string | null
          ri: string | null
          user_name: string | null
          valor_anterior: string | null
          valor_novo: string | null
        }
        Insert: {
          campo_alterado?: string | null
          created_at?: string | null
          id?: string | null
          ri?: string | null
          user_name?: string | null
          valor_anterior?: string | null
          valor_novo?: string | null
        }
        Update: {
          campo_alterado?: string | null
          created_at?: string | null
          id?: string | null
          ri?: string | null
          user_name?: string | null
          valor_anterior?: string | null
          valor_novo?: string | null
        }
        Relationships: []
      }
      pedidosforn: {
        Row: {
          campos_extras: Json | null
          categoria: string | null
          cen_cen: string | null
          ci: string | null
          cn_lcr_parcs: string | null
          cnpj: string | null
          cnpj_fornecedor: string | null
          cod_forn: string | null
          codigo_liberacao_doc_compra: string | null
          condicao_pagamento: string | null
          contrato: string | null
          created_at: string | null
          crf: string | null
          criado_por_condicao: string | null
          criado_por_liberacao: string | null
          criado_por_pedido: string | null
          criado_por_rc: string | null
          data_doc: string | null
          data_migo: string | null
          data_pc_sc: string | null
          data_pedido: string | null
          data_rc: string | null
          dep_dep: string | null
          doc_compra: string | null
          doc_compra_ref: string | null
          dt_remessa: string | null
          eflag_e: string | null
          empremp: string | null
          est_liber: string | null
          estr: string | null
          fornecedor: string | null
          fornecedor_codigo: string | null
          fornecedor_nome: string | null
          ftf: string | null
          grp_mercads: string | null
          grupo_mercadoria_curto: string | null
          id: string | null
          item: string | null
          item_contrato: string | null
          item_rc_cotacao: string | null
          itm_liberacao: string | null
          itm_ref: string | null
          material: string | null
          modificado_em: string | null
          moeda_1: string | null
          moeda_2: string | null
          moeda_3: string | null
          n_acomp: string | null
          por: string | null
          posicao: string | null
          preco_liquido: number | null
          preco_liquido_unit: number | null
          qtd_fornecida: number | null
          qtd_pedido: number | null
          regiao_uf: string | null
          req_cotacao: string | null
          reqc: string | null
          requisitante: string | null
          ri: string | null
          tipo_doc_compra: string | null
          tmatt: string | null
          tpdc: string | null
          txt_breve: string | null
          ump_1: string | null
          ump_2: string | null
          ump_3: string | null
          unidade_medida_basica: string | null
          unidade_medida_pedido: string | null
          updated_at: string | null
          upp: string | null
          valor_efetivo: number | null
          valor_em_brl: number | null
          valor_liquido: number | null
        }
        Insert: {
          campos_extras?: Json | null
          categoria?: string | null
          cen_cen?: string | null
          ci?: string | null
          cn_lcr_parcs?: string | null
          cnpj?: string | null
          cnpj_fornecedor?: string | null
          cod_forn?: string | null
          codigo_liberacao_doc_compra?: string | null
          condicao_pagamento?: string | null
          contrato?: string | null
          created_at?: string | null
          crf?: string | null
          criado_por_condicao?: string | null
          criado_por_liberacao?: string | null
          criado_por_pedido?: string | null
          criado_por_rc?: string | null
          data_doc?: string | null
          data_migo?: string | null
          data_pc_sc?: string | null
          data_pedido?: string | null
          data_rc?: string | null
          dep_dep?: string | null
          doc_compra?: string | null
          doc_compra_ref?: string | null
          dt_remessa?: string | null
          eflag_e?: string | null
          empremp?: string | null
          est_liber?: string | null
          estr?: string | null
          fornecedor?: string | null
          fornecedor_codigo?: string | null
          fornecedor_nome?: string | null
          ftf?: string | null
          grp_mercads?: string | null
          grupo_mercadoria_curto?: string | null
          id?: string | null
          item?: string | null
          item_contrato?: string | null
          item_rc_cotacao?: string | null
          itm_liberacao?: string | null
          itm_ref?: string | null
          material?: string | null
          modificado_em?: string | null
          moeda_1?: string | null
          moeda_2?: string | null
          moeda_3?: string | null
          n_acomp?: string | null
          por?: string | null
          posicao?: string | null
          preco_liquido?: number | null
          preco_liquido_unit?: number | null
          qtd_fornecida?: number | null
          qtd_pedido?: number | null
          regiao_uf?: string | null
          req_cotacao?: string | null
          reqc?: string | null
          requisitante?: string | null
          ri?: string | null
          tipo_doc_compra?: string | null
          tmatt?: string | null
          tpdc?: string | null
          txt_breve?: string | null
          ump_1?: string | null
          ump_2?: string | null
          ump_3?: string | null
          unidade_medida_basica?: string | null
          unidade_medida_pedido?: string | null
          updated_at?: string | null
          upp?: string | null
          valor_efetivo?: number | null
          valor_em_brl?: number | null
          valor_liquido?: number | null
        }
        Update: {
          campos_extras?: Json | null
          categoria?: string | null
          cen_cen?: string | null
          ci?: string | null
          cn_lcr_parcs?: string | null
          cnpj?: string | null
          cnpj_fornecedor?: string | null
          cod_forn?: string | null
          codigo_liberacao_doc_compra?: string | null
          condicao_pagamento?: string | null
          contrato?: string | null
          created_at?: string | null
          crf?: string | null
          criado_por_condicao?: string | null
          criado_por_liberacao?: string | null
          criado_por_pedido?: string | null
          criado_por_rc?: string | null
          data_doc?: string | null
          data_migo?: string | null
          data_pc_sc?: string | null
          data_pedido?: string | null
          data_rc?: string | null
          dep_dep?: string | null
          doc_compra?: string | null
          doc_compra_ref?: string | null
          dt_remessa?: string | null
          eflag_e?: string | null
          empremp?: string | null
          est_liber?: string | null
          estr?: string | null
          fornecedor?: string | null
          fornecedor_codigo?: string | null
          fornecedor_nome?: string | null
          ftf?: string | null
          grp_mercads?: string | null
          grupo_mercadoria_curto?: string | null
          id?: string | null
          item?: string | null
          item_contrato?: string | null
          item_rc_cotacao?: string | null
          itm_liberacao?: string | null
          itm_ref?: string | null
          material?: string | null
          modificado_em?: string | null
          moeda_1?: string | null
          moeda_2?: string | null
          moeda_3?: string | null
          n_acomp?: string | null
          por?: string | null
          posicao?: string | null
          preco_liquido?: number | null
          preco_liquido_unit?: number | null
          qtd_fornecida?: number | null
          qtd_pedido?: number | null
          regiao_uf?: string | null
          req_cotacao?: string | null
          reqc?: string | null
          requisitante?: string | null
          ri?: string | null
          tipo_doc_compra?: string | null
          tmatt?: string | null
          tpdc?: string | null
          txt_breve?: string | null
          ump_1?: string | null
          ump_2?: string | null
          ump_3?: string | null
          unidade_medida_basica?: string | null
          unidade_medida_pedido?: string | null
          updated_at?: string | null
          upp?: string | null
          valor_efetivo?: number | null
          valor_em_brl?: number | null
          valor_liquido?: number | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          aprovador_cadastro_sap: boolean | null
          aprovador_setores: Json | null
          cargo: string | null
          created_at: string | null
          email: string | null
          grupo_compras: string | null
          id: string | null
          name: string | null
          notification_preferences: string | null
          page_access: Json | null
          roles: string[] | null
          sector_id: string | null
          status: string | null
          tours_seen: Json | null
        }
        Insert: {
          aprovador_cadastro_sap?: boolean | null
          aprovador_setores?: Json | null
          cargo?: string | null
          created_at?: string | null
          email?: string | null
          grupo_compras?: string | null
          id?: string | null
          name?: string | null
          notification_preferences?: string | null
          page_access?: Json | null
          roles?: string[] | null
          sector_id?: string | null
          status?: string | null
          tours_seen?: Json | null
        }
        Update: {
          aprovador_cadastro_sap?: boolean | null
          aprovador_setores?: Json | null
          cargo?: string | null
          created_at?: string | null
          email?: string | null
          grupo_compras?: string | null
          id?: string | null
          name?: string | null
          notification_preferences?: string | null
          page_access?: Json | null
          roles?: string[] | null
          sector_id?: string | null
          status?: string | null
          tours_seen?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "core_setores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "sectors"
            referencedColumns: ["id"]
          },
        ]
      }
      rastreio_mensagens: {
        Row: {
          autor_id: string | null
          autor_nome: string | null
          autor_role: string | null
          created_at: string | null
          id: string | null
          mensagem: string | null
          ri: string | null
          rm: string | null
        }
        Insert: {
          autor_id?: string | null
          autor_nome?: string | null
          autor_role?: string | null
          created_at?: string | null
          id?: string | null
          mensagem?: string | null
          ri?: string | null
          rm?: string | null
        }
        Update: {
          autor_id?: string | null
          autor_nome?: string | null
          autor_role?: string | null
          created_at?: string | null
          id?: string | null
          mensagem?: string | null
          ri?: string | null
          rm?: string | null
        }
        Relationships: []
      }
      rastreio_prioridades: {
        Row: {
          created_at: string | null
          id: string | null
          nivel: number | null
          ri: string | null
          rm: string | null
          solicitante_id: string | null
          solicitante_nome: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string | null
          nivel?: number | null
          ri?: string | null
          rm?: string | null
          solicitante_id?: string | null
          solicitante_nome?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string | null
          nivel?: number | null
          ri?: string | null
          rm?: string | null
          solicitante_id?: string | null
          solicitante_nome?: string | null
        }
        Relationships: []
      }
      request_attachments: {
        Row: {
          created_at: string | null
          id: string | null
          material_code: string | null
          mime_type: string | null
          name: string | null
          request_id: string | null
          request_item_id: string | null
          size: number | null
          size_original: number | null
          storage_path: string | null
          uploaded_by: string | null
          url: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string | null
          material_code?: string | null
          mime_type?: string | null
          name?: string | null
          request_id?: string | null
          request_item_id?: string | null
          size?: number | null
          size_original?: number | null
          storage_path?: string | null
          uploaded_by?: string | null
          url?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string | null
          material_code?: string | null
          mime_type?: string | null
          name?: string | null
          request_id?: string | null
          request_item_id?: string | null
          size?: number | null
          size_original?: number | null
          storage_path?: string | null
          uploaded_by?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "request_attachments_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "core_solicitacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_attachments_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
        ]
      }
      request_comments: {
        Row: {
          content: string | null
          created_at: string | null
          id: string | null
          is_internal: boolean | null
          request_id: string | null
          user_id: string | null
          user_name: string | null
          user_roles: string[] | null
        }
        Insert: {
          content?: string | null
          created_at?: string | null
          id?: string | null
          is_internal?: boolean | null
          request_id?: string | null
          user_id?: string | null
          user_name?: string | null
          user_roles?: string[] | null
        }
        Update: {
          content?: string | null
          created_at?: string | null
          id?: string | null
          is_internal?: boolean | null
          request_id?: string | null
          user_id?: string | null
          user_name?: string | null
          user_roles?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "request_comments_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "core_solicitacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_comments_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
        ]
      }
      request_items: {
        Row: {
          brand: string | null
          description: string | null
          estimated_value: number | null
          has_no_sap_code: boolean | null
          id: string | null
          is_generic: boolean | null
          is_similar_allowed: boolean | null
          observation: string | null
          quantity: number | null
          reference_link: string | null
          request_id: string | null
          sap_code: string | null
          suggested_supplier: string | null
          unit: string | null
        }
        Insert: {
          brand?: string | null
          description?: string | null
          estimated_value?: number | null
          has_no_sap_code?: boolean | null
          id?: string | null
          is_generic?: boolean | null
          is_similar_allowed?: boolean | null
          observation?: string | null
          quantity?: number | null
          reference_link?: string | null
          request_id?: string | null
          sap_code?: string | null
          suggested_supplier?: string | null
          unit?: string | null
        }
        Update: {
          brand?: string | null
          description?: string | null
          estimated_value?: number | null
          has_no_sap_code?: boolean | null
          id?: string | null
          is_generic?: boolean | null
          is_similar_allowed?: boolean | null
          observation?: string | null
          quantity?: number | null
          reference_link?: string | null
          request_id?: string | null
          sap_code?: string | null
          suggested_supplier?: string | null
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "request_items_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "core_solicitacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_items_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
        ]
      }
      request_status_history: {
        Row: {
          comment: string | null
          created_at: string | null
          from_status: string | null
          id: string | null
          request_id: string | null
          to_status: string | null
          user_id: string | null
          user_name: string | null
        }
        Insert: {
          comment?: string | null
          created_at?: string | null
          from_status?: string | null
          id?: string | null
          request_id?: string | null
          to_status?: string | null
          user_id?: string | null
          user_name?: string | null
        }
        Update: {
          comment?: string | null
          created_at?: string | null
          from_status?: string | null
          id?: string | null
          request_id?: string | null
          to_status?: string | null
          user_id?: string | null
          user_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "request_status_history_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "core_solicitacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_status_history_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
        ]
      }
      requests: {
        Row: {
          atendente_id: string | null
          atendente_name: string | null
          brand: string | null
          category_id: string | null
          comprador_id: string | null
          contrato_tipo: string | null
          created_at: string | null
          criticality: number | null
          data_necessidade: string | null
          first_response_at: string | null
          fornecedor_terceiro: string | null
          id: string | null
          justificativa: string | null
          last_paused_at: string | null
          linked_rm_number: string | null
          local: string | null
          number: string | null
          paused_minutes: number | null
          prazo_conclusao: string | null
          rating: number | null
          rating_comment: string | null
          registration_type: string | null
          representante_cargo: string | null
          representante_email: string | null
          representante_nome: string | null
          representante_telefone: string | null
          resolved_at: string | null
          solicitante_id: string | null
          solicitante_name: string | null
          solicitante_sector_id: string | null
          status: string | null
          suggested_supplier: string | null
          target_sector_id: string | null
          tipo_compra: string | null
          titulo: string | null
          type: string | null
          updated_at: string | null
        }
        Insert: {
          atendente_id?: string | null
          atendente_name?: string | null
          brand?: string | null
          category_id?: string | null
          comprador_id?: string | null
          contrato_tipo?: string | null
          created_at?: string | null
          criticality?: number | null
          data_necessidade?: string | null
          first_response_at?: string | null
          fornecedor_terceiro?: string | null
          id?: string | null
          justificativa?: string | null
          last_paused_at?: string | null
          linked_rm_number?: string | null
          local?: string | null
          number?: string | null
          paused_minutes?: number | null
          prazo_conclusao?: string | null
          rating?: number | null
          rating_comment?: string | null
          registration_type?: string | null
          representante_cargo?: string | null
          representante_email?: string | null
          representante_nome?: string | null
          representante_telefone?: string | null
          resolved_at?: string | null
          solicitante_id?: string | null
          solicitante_name?: string | null
          solicitante_sector_id?: string | null
          status?: string | null
          suggested_supplier?: string | null
          target_sector_id?: string | null
          tipo_compra?: string | null
          titulo?: string | null
          type?: string | null
          updated_at?: string | null
        }
        Update: {
          atendente_id?: string | null
          atendente_name?: string | null
          brand?: string | null
          category_id?: string | null
          comprador_id?: string | null
          contrato_tipo?: string | null
          created_at?: string | null
          criticality?: number | null
          data_necessidade?: string | null
          first_response_at?: string | null
          fornecedor_terceiro?: string | null
          id?: string | null
          justificativa?: string | null
          last_paused_at?: string | null
          linked_rm_number?: string | null
          local?: string | null
          number?: string | null
          paused_minutes?: number | null
          prazo_conclusao?: string | null
          rating?: number | null
          rating_comment?: string | null
          registration_type?: string | null
          representante_cargo?: string | null
          representante_email?: string | null
          representante_nome?: string | null
          representante_telefone?: string | null
          resolved_at?: string | null
          solicitante_id?: string | null
          solicitante_name?: string | null
          solicitante_sector_id?: string | null
          status?: string | null
          suggested_supplier?: string | null
          target_sector_id?: string | null
          tipo_compra?: string | null
          titulo?: string | null
          type?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "requests_atendente_id_fkey"
            columns: ["atendente_id"]
            isOneToOne: false
            referencedRelation: "core_perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_atendente_id_fkey"
            columns: ["atendente_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_comprador_id_fkey"
            columns: ["comprador_id"]
            isOneToOne: false
            referencedRelation: "core_perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_comprador_id_fkey"
            columns: ["comprador_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_solicitante_id_fkey"
            columns: ["solicitante_id"]
            isOneToOne: false
            referencedRelation: "core_perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_solicitante_id_fkey"
            columns: ["solicitante_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_solicitante_sector_id_fkey"
            columns: ["solicitante_sector_id"]
            isOneToOne: false
            referencedRelation: "core_setores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_solicitante_sector_id_fkey"
            columns: ["solicitante_sector_id"]
            isOneToOne: false
            referencedRelation: "sectors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_target_sector_id_fkey"
            columns: ["target_sector_id"]
            isOneToOne: false
            referencedRelation: "core_setores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_target_sector_id_fkey"
            columns: ["target_sector_id"]
            isOneToOne: false
            referencedRelation: "sectors"
            referencedColumns: ["id"]
          },
        ]
      }
      requisicoes: {
        Row: {
          apelido: string | null
          aplicacao: string | null
          area_solicitante: string | null
          campos_extras: Json | null
          categoria_do_item: string | null
          centro: string | null
          centro_fornecedor: string | null
          codigo_de_bloqueio: string | null
          codigo_de_eliminacao: boolean | null
          codigo_de_liberacao: string | null
          concluida: string | null
          contrato_basico: string | null
          criado_por: string | null
          ctg_class_cont: string | null
          data_da_liberacao: string | null
          data_da_solicitacao: string | null
          data_de_remessa: string | null
          data_do_pedido: string | null
          data_entrega_prevista: string | null
          data_pedido_origem: string | null
          deposito: string | null
          descricao_do_grupo_de_compradores: string | null
          eliminado: boolean | null
          fornecedor_fixo: string | null
          grupo_de_compradores: string | null
          grupo_de_mercadorias: string | null
          it_contrato_superior: string | null
          item_do_pedido: string | null
          item_reqc: string | null
          item_status: string | null
          item_status_updated_at: string | null
          item_status_updated_by: string | null
          marca_da_peca: string | null
          material: string | null
          modelo: string | null
          moeda: string | null
          n_acompanhamento: string | null
          n_de_reqsc: number | null
          n_material_fornecedor: string | null
          n_peca_fabricante: string | null
          nome_do_fornecedor: string | null
          obs_comprador: string | null
          obs_updated_at: string | null
          obs_updated_by: string | null
          organiz_compras: string | null
          peca_original: string | null
          pedido: string | null
          presente_ultima_carga: boolean | null
          qtd_solicitada: number | null
          quantidade_pedida: number | null
          remessas_de_ate: string | null
          requisicao_de_compra: string | null
          requisicao_externa: string | null
          requisitante: string | null
          ri: string | null
          status_processamento: string | null
          sugestao_local_compra: string | null
          tempo_procmto_em: number | null
          texto_breve: string | null
          tipo_data_de_remessa: string | null
          tipo_de_documento: string | null
          tipo_de_transporte: string | null
          unidade_de_medida: string | null
        }
        Insert: {
          apelido?: string | null
          aplicacao?: string | null
          area_solicitante?: string | null
          campos_extras?: Json | null
          categoria_do_item?: string | null
          centro?: string | null
          centro_fornecedor?: string | null
          codigo_de_bloqueio?: string | null
          codigo_de_eliminacao?: boolean | null
          codigo_de_liberacao?: string | null
          concluida?: string | null
          contrato_basico?: string | null
          criado_por?: string | null
          ctg_class_cont?: string | null
          data_da_liberacao?: string | null
          data_da_solicitacao?: string | null
          data_de_remessa?: string | null
          data_do_pedido?: string | null
          data_entrega_prevista?: string | null
          data_pedido_origem?: string | null
          deposito?: string | null
          descricao_do_grupo_de_compradores?: string | null
          eliminado?: boolean | null
          fornecedor_fixo?: string | null
          grupo_de_compradores?: string | null
          grupo_de_mercadorias?: string | null
          it_contrato_superior?: string | null
          item_do_pedido?: string | null
          item_reqc?: string | null
          item_status?: string | null
          item_status_updated_at?: string | null
          item_status_updated_by?: string | null
          marca_da_peca?: string | null
          material?: string | null
          modelo?: string | null
          moeda?: string | null
          n_acompanhamento?: string | null
          n_de_reqsc?: number | null
          n_material_fornecedor?: string | null
          n_peca_fabricante?: string | null
          nome_do_fornecedor?: string | null
          obs_comprador?: string | null
          obs_updated_at?: string | null
          obs_updated_by?: string | null
          organiz_compras?: string | null
          peca_original?: string | null
          pedido?: string | null
          presente_ultima_carga?: boolean | null
          qtd_solicitada?: number | null
          quantidade_pedida?: number | null
          remessas_de_ate?: string | null
          requisicao_de_compra?: string | null
          requisicao_externa?: string | null
          requisitante?: string | null
          ri?: string | null
          status_processamento?: string | null
          sugestao_local_compra?: string | null
          tempo_procmto_em?: number | null
          texto_breve?: string | null
          tipo_data_de_remessa?: string | null
          tipo_de_documento?: string | null
          tipo_de_transporte?: string | null
          unidade_de_medida?: string | null
        }
        Update: {
          apelido?: string | null
          aplicacao?: string | null
          area_solicitante?: string | null
          campos_extras?: Json | null
          categoria_do_item?: string | null
          centro?: string | null
          centro_fornecedor?: string | null
          codigo_de_bloqueio?: string | null
          codigo_de_eliminacao?: boolean | null
          codigo_de_liberacao?: string | null
          concluida?: string | null
          contrato_basico?: string | null
          criado_por?: string | null
          ctg_class_cont?: string | null
          data_da_liberacao?: string | null
          data_da_solicitacao?: string | null
          data_de_remessa?: string | null
          data_do_pedido?: string | null
          data_entrega_prevista?: string | null
          data_pedido_origem?: string | null
          deposito?: string | null
          descricao_do_grupo_de_compradores?: string | null
          eliminado?: boolean | null
          fornecedor_fixo?: string | null
          grupo_de_compradores?: string | null
          grupo_de_mercadorias?: string | null
          it_contrato_superior?: string | null
          item_do_pedido?: string | null
          item_reqc?: string | null
          item_status?: string | null
          item_status_updated_at?: string | null
          item_status_updated_by?: string | null
          marca_da_peca?: string | null
          material?: string | null
          modelo?: string | null
          moeda?: string | null
          n_acompanhamento?: string | null
          n_de_reqsc?: number | null
          n_material_fornecedor?: string | null
          n_peca_fabricante?: string | null
          nome_do_fornecedor?: string | null
          obs_comprador?: string | null
          obs_updated_at?: string | null
          obs_updated_by?: string | null
          organiz_compras?: string | null
          peca_original?: string | null
          pedido?: string | null
          presente_ultima_carga?: boolean | null
          qtd_solicitada?: number | null
          quantidade_pedida?: number | null
          remessas_de_ate?: string | null
          requisicao_de_compra?: string | null
          requisicao_externa?: string | null
          requisitante?: string | null
          ri?: string | null
          status_processamento?: string | null
          sugestao_local_compra?: string | null
          tempo_procmto_em?: number | null
          texto_breve?: string | null
          tipo_data_de_remessa?: string | null
          tipo_de_documento?: string | null
          tipo_de_transporte?: string | null
          unidade_de_medida?: string | null
        }
        Relationships: []
      }
      sectors: {
        Row: {
          helpdesk_enabled: boolean | null
          id: string | null
          is_support: boolean | null
          name: string | null
          sap_area_code: string | null
        }
        Insert: {
          helpdesk_enabled?: boolean | null
          id?: string | null
          is_support?: boolean | null
          name?: string | null
          sap_area_code?: string | null
        }
        Update: {
          helpdesk_enabled?: boolean | null
          id?: string | null
          is_support?: boolean | null
          name?: string | null
          sap_area_code?: string | null
        }
        Relationships: []
      }
      tabela_frete: {
        Row: {
          ad_valores: number | null
          carreta_acima_27t: number | null
          carreta_ate_25t: number | null
          cat: number | null
          created_at: string | null
          destino: string | null
          fiorino: number | null
          icms_aplicado: string | null
          id: string | null
          itr_tas: number | null
          kg_1_10: number | null
          kg_11_20: number | null
          kg_21_30: number | null
          kg_31_50: number | null
          kg_51_70: number | null
          kg_71_100: number | null
          kg_acima_100: number | null
          lead_time_entrega: string | null
          lead_time_entrega_2: string | null
          origem: string | null
          pedagio_fracao_100kg: number | null
          rotas: string | null
          taxa_fixa_itr_redespacho: number | null
          toco_ate_5_5t: number | null
          truck_ate_14t: number | null
          uf: string | null
          updated_at: string | null
          veiculo_3_4_ate_2_5t: number | null
        }
        Insert: {
          ad_valores?: number | null
          carreta_acima_27t?: number | null
          carreta_ate_25t?: number | null
          cat?: number | null
          created_at?: string | null
          destino?: string | null
          fiorino?: number | null
          icms_aplicado?: string | null
          id?: string | null
          itr_tas?: number | null
          kg_1_10?: number | null
          kg_11_20?: number | null
          kg_21_30?: number | null
          kg_31_50?: number | null
          kg_51_70?: number | null
          kg_71_100?: number | null
          kg_acima_100?: number | null
          lead_time_entrega?: string | null
          lead_time_entrega_2?: string | null
          origem?: string | null
          pedagio_fracao_100kg?: number | null
          rotas?: string | null
          taxa_fixa_itr_redespacho?: number | null
          toco_ate_5_5t?: number | null
          truck_ate_14t?: number | null
          uf?: string | null
          updated_at?: string | null
          veiculo_3_4_ate_2_5t?: number | null
        }
        Update: {
          ad_valores?: number | null
          carreta_acima_27t?: number | null
          carreta_ate_25t?: number | null
          cat?: number | null
          created_at?: string | null
          destino?: string | null
          fiorino?: number | null
          icms_aplicado?: string | null
          id?: string | null
          itr_tas?: number | null
          kg_1_10?: number | null
          kg_11_20?: number | null
          kg_21_30?: number | null
          kg_31_50?: number | null
          kg_51_70?: number | null
          kg_71_100?: number | null
          kg_acima_100?: number | null
          lead_time_entrega?: string | null
          lead_time_entrega_2?: string | null
          origem?: string | null
          pedagio_fracao_100kg?: number | null
          rotas?: string | null
          taxa_fixa_itr_redespacho?: number | null
          toco_ate_5_5t?: number | null
          truck_ate_14t?: number | null
          uf?: string | null
          updated_at?: string | null
          veiculo_3_4_ate_2_5t?: number | null
        }
        Relationships: []
      }
      usage_events: {
        Row: {
          created_at: string | null
          email: string | null
          event_type: string | null
          id: string | null
          page_label: string | null
          path: string | null
          session_id: string | null
          user_id: string | null
          user_name: string | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          event_type?: string | null
          id?: string | null
          page_label?: string | null
          path?: string | null
          session_id?: string | null
          user_id?: string | null
          user_name?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          event_type?: string | null
          id?: string | null
          page_label?: string | null
          path?: string | null
          session_id?: string | null
          user_id?: string | null
          user_name?: string | null
        }
        Relationships: []
      }
      view_enriched_pedidos: {
        Row: {
          campos_extras: Json | null
          categoria: string | null
          cen_cen: string | null
          ci: string | null
          cn_lcr_parcs: string | null
          cnpj_fornecedor: string | null
          codigo_liberacao_doc_compra: string | null
          condicao_pagamento: string | null
          contrato: string | null
          crf: string | null
          criado_por_condicao: string | null
          criado_por_liberacao: string | null
          criado_por_pedido: string | null
          criado_por_rc: string | null
          data_doc: string | null
          data_migo: string | null
          data_pc_sc: string | null
          data_rc: string | null
          dep_dep: string | null
          dias_atrasado: number | null
          doc_compra: string | null
          doc_compra_ref: string | null
          dt_remessa: string | null
          eflag_e: string | null
          empremp: string | null
          est_liber: string | null
          estr: string | null
          fornecedor_codigo: string | null
          fornecedor_nome: string | null
          ftf: string | null
          grp_mercads: string | null
          grupo_mercadoria_curto: string | null
          item: string | null
          item_contrato: string | null
          item_rc_cotacao: string | null
          itm_liberacao: string | null
          itm_ref: string | null
          material: string | null
          modificado_em: string | null
          moeda_1: string | null
          moeda_2: string | null
          moeda_3: string | null
          n_acomp: string | null
          por: string | null
          posicao: string | null
          preco_liquido_unit: number | null
          qtd_fornecida: number | null
          qtd_pedido: number | null
          regiao_uf: string | null
          req_cotacao: string | null
          reqc: string | null
          requisitante: string | null
          ri: string | null
          status_entrega: string | null
          tipo_doc_compra: string | null
          tmatt: string | null
          tpdc: string | null
          txt_breve: string | null
          ump_1: string | null
          ump_2: string | null
          ump_3: string | null
          unidade_medida_basica: string | null
          unidade_medida_pedido: string | null
          upp: string | null
          valor_efetivo: number | null
          valor_em_brl: number | null
          valor_liquido: number | null
        }
        Insert: {
          campos_extras?: Json | null
          categoria?: string | null
          cen_cen?: string | null
          ci?: string | null
          cn_lcr_parcs?: string | null
          cnpj_fornecedor?: string | null
          codigo_liberacao_doc_compra?: string | null
          condicao_pagamento?: string | null
          contrato?: string | null
          crf?: string | null
          criado_por_condicao?: string | null
          criado_por_liberacao?: string | null
          criado_por_pedido?: string | null
          criado_por_rc?: string | null
          data_doc?: string | null
          data_migo?: string | null
          data_pc_sc?: string | null
          data_rc?: string | null
          dep_dep?: string | null
          dias_atrasado?: never
          doc_compra?: string | null
          doc_compra_ref?: string | null
          dt_remessa?: string | null
          eflag_e?: string | null
          empremp?: string | null
          est_liber?: string | null
          estr?: string | null
          fornecedor_codigo?: string | null
          fornecedor_nome?: string | null
          ftf?: string | null
          grp_mercads?: string | null
          grupo_mercadoria_curto?: string | null
          item?: string | null
          item_contrato?: string | null
          item_rc_cotacao?: string | null
          itm_liberacao?: string | null
          itm_ref?: string | null
          material?: string | null
          modificado_em?: string | null
          moeda_1?: string | null
          moeda_2?: string | null
          moeda_3?: string | null
          n_acomp?: string | null
          por?: string | null
          posicao?: string | null
          preco_liquido_unit?: number | null
          qtd_fornecida?: number | null
          qtd_pedido?: number | null
          regiao_uf?: string | null
          req_cotacao?: string | null
          reqc?: string | null
          requisitante?: string | null
          ri?: string | null
          status_entrega?: never
          tipo_doc_compra?: string | null
          tmatt?: string | null
          tpdc?: string | null
          txt_breve?: string | null
          ump_1?: string | null
          ump_2?: string | null
          ump_3?: string | null
          unidade_medida_basica?: string | null
          unidade_medida_pedido?: string | null
          upp?: string | null
          valor_efetivo?: number | null
          valor_em_brl?: number | null
          valor_liquido?: number | null
        }
        Update: {
          campos_extras?: Json | null
          categoria?: string | null
          cen_cen?: string | null
          ci?: string | null
          cn_lcr_parcs?: string | null
          cnpj_fornecedor?: string | null
          codigo_liberacao_doc_compra?: string | null
          condicao_pagamento?: string | null
          contrato?: string | null
          crf?: string | null
          criado_por_condicao?: string | null
          criado_por_liberacao?: string | null
          criado_por_pedido?: string | null
          criado_por_rc?: string | null
          data_doc?: string | null
          data_migo?: string | null
          data_pc_sc?: string | null
          data_rc?: string | null
          dep_dep?: string | null
          dias_atrasado?: never
          doc_compra?: string | null
          doc_compra_ref?: string | null
          dt_remessa?: string | null
          eflag_e?: string | null
          empremp?: string | null
          est_liber?: string | null
          estr?: string | null
          fornecedor_codigo?: string | null
          fornecedor_nome?: string | null
          ftf?: string | null
          grp_mercads?: string | null
          grupo_mercadoria_curto?: string | null
          item?: string | null
          item_contrato?: string | null
          item_rc_cotacao?: string | null
          itm_liberacao?: string | null
          itm_ref?: string | null
          material?: string | null
          modificado_em?: string | null
          moeda_1?: string | null
          moeda_2?: string | null
          moeda_3?: string | null
          n_acomp?: string | null
          por?: string | null
          posicao?: string | null
          preco_liquido_unit?: number | null
          qtd_fornecida?: number | null
          qtd_pedido?: number | null
          regiao_uf?: string | null
          req_cotacao?: string | null
          reqc?: string | null
          requisitante?: string | null
          ri?: string | null
          status_entrega?: never
          tipo_doc_compra?: string | null
          tmatt?: string | null
          tpdc?: string | null
          txt_breve?: string | null
          ump_1?: string | null
          ump_2?: string | null
          ump_3?: string | null
          unidade_medida_basica?: string | null
          unidade_medida_pedido?: string | null
          upp?: string | null
          valor_efetivo?: number | null
          valor_em_brl?: number | null
          valor_liquido?: number | null
        }
        Relationships: []
      }
      view_enriched_requisicoes: {
        Row: {
          alerta: string | null
          apelido: string | null
          aplicacao: string | null
          area_solicitante: string | null
          atraso_comprador: number | null
          campos_extras: Json | null
          categoria_do_item: string | null
          centro: string | null
          centro_fornecedor: string | null
          codigo_de_bloqueio: string | null
          codigo_de_eliminacao: boolean | null
          codigo_de_liberacao: string | null
          concluida: string | null
          contrato_basico: string | null
          criado_por: string | null
          criado_por_pedido: string | null
          ctg_class_cont: string | null
          data_da_liberacao: string | null
          data_da_solicitacao: string | null
          data_de_remessa: string | null
          data_do_pedido: string | null
          data_entrega_prevista: string | null
          data_entrega_sap: string | null
          data_migo: string | null
          data_pedido: string | null
          data_pedido_origem: string | null
          data_referencia_prazo: string | null
          deposito: string | null
          descricao_do_grupo_de_compradores: string | null
          dias_atrasado: number | null
          dias_em_aberto: number | null
          documento_compra: string | null
          eliminado: boolean | null
          faixa_atraso: string | null
          fornecedor_code: string | null
          fornecedor_fixo: string | null
          fornecedor_name: string | null
          grupo_de_compradores: string | null
          grupo_de_mercadorias: string | null
          it_contrato_superior: string | null
          item_do_pedido: string | null
          item_pedido: string | null
          item_reqc: string | null
          item_status: string | null
          item_status_updated_at: string | null
          item_status_updated_by: string | null
          lead_time_compras_meta: number | null
          marca_da_peca: string | null
          material: string | null
          modelo: string | null
          moeda: string | null
          n_acompanhamento: string | null
          n_de_reqsc: number | null
          n_material_fornecedor: string | null
          n_peca_fabricante: string | null
          natureza: string | null
          nome_do_fornecedor: string | null
          obs_comprador: string | null
          obs_updated_at: string | null
          obs_updated_by: string | null
          organiz_compras: string | null
          peca_original: string | null
          pedido: string | null
          presente_ultima_carga: boolean | null
          qtd_solicitada: number | null
          quantidade_pedida: number | null
          remessas_de_ate: string | null
          requisicao_de_compra: string | null
          requisicao_externa: string | null
          requisitante: string | null
          ri: string | null
          status_atualizado: string | null
          status_entrega: string | null
          status_processamento: string | null
          status_requisicao: string | null
          sugestao_local_compra: string | null
          tempo_procmto_em: number | null
          texto_breve: string | null
          tipo_data_de_remessa: string | null
          tipo_de_documento: string | null
          tipo_de_transporte: string | null
          unidade_de_medida: string | null
        }
        Relationships: []
      }
      vw_auditoria_compras: {
        Row: {
          cod_forn: string | null
          confianca: string | null
          data_doc: string | null
          delta_pct: number | null
          delta_valor: number | null
          doc_compra: string | null
          fornecedor: string | null
          grp_mercads: string | null
          grp_mercads_desc: string | null
          ipca_mes_referencia: string | null
          lote_atipico: boolean | null
          material: string | null
          n_compras: number | null
          pedido_parcial: boolean | null
          preco_unit: number | null
          primeira_compra: string | null
          qtd: number | null
          qtd_mediana: number | null
          ref_p25: number | null
          ref_p50: number | null
          ref_p75: number | null
          rm: string | null
          sd_log: number | null
          tipo_item: string | null
          txt_breve: string | null
          ultima_compra: string | null
          unidade: string | null
          valor: number | null
          veredito: string | null
        }
        Relationships: []
      }
      vw_auditoria_historico_material: {
        Row: {
          cod_forn: string | null
          data_doc: string | null
          doc_compra: string | null
          fator_ipca: number | null
          fornecedor: string | null
          material: string | null
          preco_corrigido: number | null
          preco_unit: number | null
          qtd: number | null
          valor: number | null
        }
        Relationships: []
      }
      vw_demandas: {
        Row: {
          alerta: string | null
          apelido: string | null
          aplicacao: string | null
          area_solicitante: string | null
          atraso_comprador: number | null
          campos_extras: Json | null
          categoria_do_item: string | null
          centro: string | null
          centro_fornecedor: string | null
          codigo_de_bloqueio: string | null
          codigo_de_eliminacao: boolean | null
          codigo_de_liberacao: string | null
          concluida: string | null
          contrato_basico: string | null
          criado_por: string | null
          criticidade: string | null
          ctg_class_cont: string | null
          data_da_liberacao: string | null
          data_da_solicitacao: string | null
          data_de_remessa: string | null
          data_do_pedido: string | null
          data_entrega_prevista: string | null
          data_entrega_sap: string | null
          data_migo: string | null
          data_pedido: string | null
          data_pedido_origem: string | null
          data_referencia_prazo: string | null
          deposito: string | null
          descricao_do_grupo_de_compradores: string | null
          dias_atrasado: number | null
          dias_em_aberto: number | null
          documento_compra: string | null
          eliminado: boolean | null
          faixa_atraso: string | null
          fornecedor_code: string | null
          fornecedor_fixo: string | null
          fornecedor_name: string | null
          grupo_de_compradores: string | null
          grupo_de_mercadorias: string | null
          it_contrato_superior: string | null
          item_do_pedido: string | null
          item_pedido: string | null
          item_reqc: string | null
          item_status: string | null
          item_status_updated_at: string | null
          item_status_updated_by: string | null
          lead_time_compras_meta: number | null
          marca_da_peca: string | null
          material: string | null
          modelo: string | null
          moeda: string | null
          n_acompanhamento: string | null
          n_de_reqsc: number | null
          n_material_fornecedor: string | null
          n_peca_fabricante: string | null
          natureza: string | null
          nome_do_fornecedor: string | null
          obs_comprador: string | null
          obs_updated_at: string | null
          obs_updated_by: string | null
          organiz_compras: string | null
          peca_original: string | null
          pedido: string | null
          presente_ultima_carga: boolean | null
          qtd_solicitada: number | null
          quantidade_pedida: number | null
          remessas_de_ate: string | null
          requisicao_de_compra: string | null
          requisicao_externa: string | null
          requisitante: string | null
          ri: string | null
          status_atualizado: string | null
          status_entrega: string | null
          status_processamento: string | null
          status_requisicao: string | null
          sugestao_local_compra: string | null
          tempo_procmto_em: number | null
          texto_breve: string | null
          tipo_data_de_remessa: string | null
          tipo_de_documento: string | null
          tipo_de_transporte: string | null
          tipo_demanda: string | null
          unidade_de_medida: string | null
        }
        Relationships: []
      }
      vw_estoque_analise: {
        Row: {
          data_ultima_compra: string | null
          material: string | null
          ultimo_fornecedor: string | null
          ultimo_preco_unit: number | null
        }
        Relationships: []
      }
      vw_estoque_camadas_fifo: {
        Row: {
          classe_permanencia: string | null
          data_consumo_total: string | null
          data_entrada: string | null
          dias_em_estoque: number | null
          dias_permanencia: number | null
          legado: boolean | null
          material: string | null
          preco_unit: number | null
          qtd_consumida: number | null
          qtd_entrada: number | null
          qtd_remanescente: number | null
          valor_remanescente: number | null
        }
        Relationships: []
      }
      vw_estoque_decorado: {
        Row: {
          aplicacao: string | null
          centro: string | null
          class_item: string | null
          deposito: string | null
          empresa: string | null
          grp_mercad: string | null
          grupo_mercadoria_classificacao: string | null
          grupo_mercadoria_desc: string | null
          grupo_mercadorias: string | null
          id: number | null
          imported_at: string | null
          material: string | null
          preco_medio: number | null
          quantidade: number | null
          referencia_fabricante: string | null
          texto_pedido_compra: string | null
          tipo_material: string | null
          txt_breve_material: string | null
          umb: string | null
          valor_total: number | null
        }
        Relationships: []
      }
      vw_estoque_giro: {
        Row: {
          cobertura_dias: number | null
          consumo_diario: number | null
          descricao: string | null
          dias_sem_movimento: number | null
          eventos_consumo: number | null
          giro_anualizado: number | null
          grupo_mercadorias: string | null
          janela_dias: number | null
          janela_fim: string | null
          janela_inicio: string | null
          legado_intocado: boolean | null
          material: string | null
          qtd_consumida: number | null
          qtd_recebida: number | null
          saldo_atual: number | null
          sem_consumo_na_janela: boolean | null
          tipo_material: string | null
          ultima_entrada: string | null
          ultima_movimentacao: string | null
          umb: string | null
          valor_consumido: number | null
          valor_estoque: number | null
        }
        Relationships: []
      }
      vw_estoque_reposicao: {
        Row: {
          adi: number | null
          concentracao_maior_lote: number | null
          consumo_diario: number | null
          consumo_total: number | null
          cv2: number | null
          descricao: string | null
          dp_lote: number | null
          eventos_consumo: number | null
          grupo_mercadorias: string | null
          janela_dias: number | null
          janela_fim: string | null
          janela_inicio: string | null
          janela_periodos: number | null
          lead_amostras: number | null
          lead_dias: number | null
          lead_dias_max: number | null
          lead_proprio: boolean | null
          lote_p75: number | null
          lote_p90: number | null
          maior_lote: number | null
          material: string | null
          media_lote: number | null
          meses_com_consumo: number | null
          preco_medio: number | null
          primeiro_consumo: string | null
          saldo_atual: number | null
          tipo_material: string | null
          ultimo_consumo: string | null
          umb: string | null
          valor_estoque: number | null
        }
        Relationships: []
      }
      vw_fbl1n_c_pagar_analise: {
        Row: {
          ano_mes: string | null
          atribuicao: string | null
          bloqueio_pagamento: string | null
          campos_extras: Json | null
          centro: string | null
          centro_lucro: string | null
          chave_referencia_1: string | null
          codigo_imposto: string | null
          condicoes_pagamento: string | null
          conta: string | null
          conta_lancamento_contrapartida: string | null
          data_compensacao: string | null
          data_documento: string | null
          data_entrada: string | null
          data_lancamento: string | null
          data_pagamento: string | null
          doc_compensacao: string | null
          doc_faturamento: string | null
          documento_compras: string | null
          elemento_pep: string | null
          empresa: string | null
          estorno_com: string | null
          fornecedor: string | null
          id: number | null
          id_fiscal_1: string | null
          id_fiscal_iva: string | null
          imobilizado: string | null
          imported_at: string | null
          loc_negocios: string | null
          moeda_documento: string | null
          montante_base_desconto: number | null
          montante_base_irf: number | null
          montante_irf: number | null
          montante_mi2: number | null
          montante_mi3: number | null
          montante_moeda_doc: number | null
          motivo_estorno: string | null
          numero_documento: string | null
          parcela: string | null
          parcelamento_tributario: string | null
          razao_social_fornecedor: string | null
          referencia: string | null
          simbolo_partida: string | null
          texto: string | null
          texto_cabecalho_documento: string | null
          tipo_documento: string | null
          tipo_documento_categoria_modulo: string | null
          tipo_documento_descricao: string | null
          tipo_documento_descricao_operacional: string | null
          vencimento_liquido: string | null
          vencimento_original: string | null
        }
        Relationships: []
      }
      vw_historico_fornecedores_sem_po: {
        Row: {
          cidade: string | null
          classificacao: string | null
          cnpj: string | null
          cod_forn: string | null
          codigo_postal: string | null
          data_doc: string | null
          data_migo: string | null
          doc_compra: string | null
          email: string | null
          fornecedor: string | null
          grp_mercads: string | null
          material: string | null
          nome_fantasia: string | null
          pais: string | null
          pedido_parcial: boolean | null
          preco_liquido_unit: number | null
          qtd_fornecida: number | null
          qtd_pedido: number | null
          regiao_uf: string | null
          reqc: string | null
          rua: string | null
          telefone: string | null
          tipo_item: string | null
          txt_breve: string | null
          valor_liquido: number | null
        }
        Relationships: []
      }
      vw_historico_pedidos: {
        Row: {
          cidade: string | null
          cnpj: string | null
          cod_forn: string | null
          codigo_postal: string | null
          data_doc: string | null
          doc_compra: string | null
          estado_uf: string | null
          fornecedor: string | null
          grp_mercads: string | null
          grp_mercads_desc: string | null
          material: string | null
          pais: string | null
          pedido_parcial: boolean | null
          preco_liquido_unit: number | null
          qtd_fornecida: number | null
          qtd_pedido: number | null
          regiao_uf: string | null
          reqc: string | null
          rua: string | null
          tipo_item: string | null
          txt_breve: string | null
          valor_liquido: number | null
        }
        Relationships: []
      }
      vw_materials_stats: {
        Row: {
          category: string | null
          company: string | null
          total: number | null
        }
        Relationships: []
      }
      vw_mb51_classificado: {
        Row: {
          categoria: string | null
          centro: string | null
          chave_unica: string | null
          data_documento: string | null
          data_entrada: string | null
          data_lancamento: string | null
          deposito: string | null
          descricao_tipo_movimento: string | null
          doc_material: string | null
          elemento_pep: string | null
          entra_almoxarifado: boolean | null
          fornecedor: string | null
          id: number | null
          item: string | null
          material: string | null
          moeda: string | null
          montante_mi: number | null
          movimenta_estoque: boolean | null
          nome_usuario: string | null
          pedido: string | null
          qtd_um_registro: number | null
          razao_social_fornecedor: string | null
          referencia: string | null
          sinal: string | null
          texto_breve_material: string | null
          tipo_movimento: string | null
          unid_medida_basica: string | null
        }
        Relationships: []
      }
      vw_pedidos_decorado: {
        Row: {
          campos_extras: Json | null
          categoria: string | null
          cen_cen: string | null
          ci: string | null
          cn_lcr_parcs: string | null
          cnpj_fornecedor: string | null
          codigo_liberacao_doc_compra: string | null
          condicao_pagamento: string | null
          contrato: string | null
          crf: string | null
          criado_por_condicao: string | null
          criado_por_liberacao: string | null
          criado_por_pedido: string | null
          criado_por_rc: string | null
          data_doc: string | null
          data_migo: string | null
          data_pc_sc: string | null
          data_rc: string | null
          dep_dep: string | null
          doc_compra: string | null
          doc_compra_ref: string | null
          dt_remessa: string | null
          eflag_e: string | null
          empremp: string | null
          est_liber: string | null
          estr: string | null
          fornecedor_codigo: string | null
          fornecedor_nome: string | null
          ftf: string | null
          grp_mercads: string | null
          grupo_mercadoria_classificacao: string | null
          grupo_mercadoria_curto: string | null
          grupo_mercadoria_desc: string | null
          item: string | null
          item_contrato: string | null
          item_rc_cotacao: string | null
          itm_liberacao: string | null
          itm_ref: string | null
          material: string | null
          modificado_em: string | null
          moeda_1: string | null
          moeda_2: string | null
          moeda_3: string | null
          n_acomp: string | null
          por: string | null
          posicao: string | null
          preco_liquido_unit: number | null
          qtd_fornecida: number | null
          qtd_pedido: number | null
          regiao_uf: string | null
          req_cotacao: string | null
          reqc: string | null
          requisitante: string | null
          ri: string | null
          tipo_doc_compra: string | null
          tipo_pedido_desc: string | null
          tipo_requisicao_desc: string | null
          tmatt: string | null
          tpdc: string | null
          txt_breve: string | null
          ump_1: string | null
          ump_2: string | null
          ump_3: string | null
          unidade_medida_basica: string | null
          unidade_medida_pedido: string | null
          upp: string | null
          valor_efetivo: number | null
          valor_em_brl: number | null
          valor_liquido: number | null
        }
        Relationships: []
      }
      vw_pedidosforn_decorado: {
        Row: {
          campos_extras: Json | null
          categoria: string | null
          cen_cen: string | null
          ci: string | null
          cn_lcr_parcs: string | null
          cnpj: string | null
          cnpj_fornecedor: string | null
          cod_forn: string | null
          codigo_liberacao_doc_compra: string | null
          condicao_pagamento: string | null
          contrato: string | null
          created_at: string | null
          crf: string | null
          criado_por_condicao: string | null
          criado_por_liberacao: string | null
          criado_por_pedido: string | null
          criado_por_rc: string | null
          data_doc: string | null
          data_migo: string | null
          data_pc_sc: string | null
          data_pedido: string | null
          data_rc: string | null
          dep_dep: string | null
          doc_compra: string | null
          doc_compra_ref: string | null
          dt_remessa: string | null
          eflag_e: string | null
          empremp: string | null
          est_liber: string | null
          estr: string | null
          fornecedor: string | null
          fornecedor_codigo: string | null
          fornecedor_nome: string | null
          ftf: string | null
          grp_mercads: string | null
          grupo_mercadoria_classificacao: string | null
          grupo_mercadoria_curto: string | null
          grupo_mercadoria_desc: string | null
          id: string | null
          item: string | null
          item_contrato: string | null
          item_rc_cotacao: string | null
          itm_liberacao: string | null
          itm_ref: string | null
          material: string | null
          modificado_em: string | null
          moeda_1: string | null
          moeda_2: string | null
          moeda_3: string | null
          n_acomp: string | null
          por: string | null
          posicao: string | null
          preco_liquido: number | null
          preco_liquido_unit: number | null
          qtd_fornecida: number | null
          qtd_pedido: number | null
          regiao_uf: string | null
          req_cotacao: string | null
          reqc: string | null
          requisitante: string | null
          ri: string | null
          tipo_doc_compra: string | null
          tipo_pedido_desc: string | null
          tipo_requisicao_desc: string | null
          tmatt: string | null
          tpdc: string | null
          txt_breve: string | null
          ump_1: string | null
          ump_2: string | null
          ump_3: string | null
          unidade_medida_basica: string | null
          unidade_medida_pedido: string | null
          updated_at: string | null
          upp: string | null
          valor_efetivo: number | null
          valor_em_brl: number | null
          valor_liquido: number | null
        }
        Relationships: []
      }
      vw_requisicoes_decorada: {
        Row: {
          apelido: string | null
          aplicacao: string | null
          area_solicitante: string | null
          campos_extras: Json | null
          categoria_do_item: string | null
          centro: string | null
          centro_fornecedor: string | null
          codigo_de_bloqueio: string | null
          codigo_de_eliminacao: boolean | null
          codigo_de_liberacao: string | null
          concluida: string | null
          contrato_basico: string | null
          criado_por: string | null
          ctg_class_cont: string | null
          data_da_liberacao: string | null
          data_da_solicitacao: string | null
          data_de_remessa: string | null
          data_do_pedido: string | null
          data_entrega_prevista: string | null
          data_pedido_origem: string | null
          deposito: string | null
          descricao_do_grupo_de_compradores: string | null
          eliminado: boolean | null
          fornecedor_fixo: string | null
          grupo_de_compradores: string | null
          grupo_de_mercadorias: string | null
          grupo_mercadoria_classificacao: string | null
          grupo_mercadoria_desc: string | null
          it_contrato_superior: string | null
          item_do_pedido: string | null
          item_reqc: string | null
          item_status: string | null
          item_status_updated_at: string | null
          item_status_updated_by: string | null
          marca_da_peca: string | null
          material: string | null
          modelo: string | null
          moeda: string | null
          n_acompanhamento: string | null
          n_de_reqsc: number | null
          n_material_fornecedor: string | null
          n_peca_fabricante: string | null
          nome_do_fornecedor: string | null
          obs_comprador: string | null
          obs_updated_at: string | null
          obs_updated_by: string | null
          organiz_compras: string | null
          peca_original: string | null
          pedido: string | null
          presente_ultima_carga: boolean | null
          qtd_solicitada: number | null
          quantidade_pedida: number | null
          remessas_de_ate: string | null
          requisicao_de_compra: string | null
          requisicao_externa: string | null
          requisitante: string | null
          ri: string | null
          status_desc: string | null
          status_detalhe: string | null
          status_processamento: string | null
          sugestao_local_compra: string | null
          tempo_procmto_em: number | null
          texto_breve: string | null
          tipo_data_de_remessa: string | null
          tipo_de_documento: string | null
          tipo_de_transporte: string | null
          tipo_documento_desc: string | null
          unidade_de_medida: string | null
        }
        Relationships: []
      }
      vw_sap_materiais_estatisticas: {
        Row: {
          category: string | null
          company: string | null
          total: number | null
        }
        Relationships: []
      }
      vw_sap_pedidos_enriquecidos: {
        Row: {
          campos_extras: Json | null
          categoria: string | null
          cen_cen: string | null
          ci: string | null
          cn_lcr_parcs: string | null
          cnpj_fornecedor: string | null
          codigo_liberacao_doc_compra: string | null
          condicao_pagamento: string | null
          contrato: string | null
          crf: string | null
          criado_por_condicao: string | null
          criado_por_liberacao: string | null
          criado_por_pedido: string | null
          criado_por_rc: string | null
          data_doc: string | null
          data_migo: string | null
          data_pc_sc: string | null
          data_rc: string | null
          dep_dep: string | null
          dias_atrasado: number | null
          doc_compra: string | null
          doc_compra_ref: string | null
          dt_remessa: string | null
          eflag_e: string | null
          empremp: string | null
          est_liber: string | null
          estr: string | null
          fornecedor_codigo: string | null
          fornecedor_nome: string | null
          ftf: string | null
          grp_mercads: string | null
          grupo_mercadoria_curto: string | null
          item: string | null
          item_contrato: string | null
          item_rc_cotacao: string | null
          itm_liberacao: string | null
          itm_ref: string | null
          material: string | null
          modificado_em: string | null
          moeda_1: string | null
          moeda_2: string | null
          moeda_3: string | null
          n_acomp: string | null
          por: string | null
          posicao: string | null
          preco_liquido_unit: number | null
          qtd_fornecida: number | null
          qtd_pedido: number | null
          regiao_uf: string | null
          req_cotacao: string | null
          reqc: string | null
          requisitante: string | null
          ri: string | null
          status_entrega: string | null
          tipo_doc_compra: string | null
          tmatt: string | null
          tpdc: string | null
          txt_breve: string | null
          ump_1: string | null
          ump_2: string | null
          ump_3: string | null
          unidade_medida_basica: string | null
          unidade_medida_pedido: string | null
          upp: string | null
          valor_efetivo: number | null
          valor_em_brl: number | null
          valor_liquido: number | null
        }
        Insert: {
          campos_extras?: Json | null
          categoria?: string | null
          cen_cen?: string | null
          ci?: string | null
          cn_lcr_parcs?: string | null
          cnpj_fornecedor?: string | null
          codigo_liberacao_doc_compra?: string | null
          condicao_pagamento?: string | null
          contrato?: string | null
          crf?: string | null
          criado_por_condicao?: string | null
          criado_por_liberacao?: string | null
          criado_por_pedido?: string | null
          criado_por_rc?: string | null
          data_doc?: string | null
          data_migo?: string | null
          data_pc_sc?: string | null
          data_rc?: string | null
          dep_dep?: string | null
          dias_atrasado?: never
          doc_compra?: string | null
          doc_compra_ref?: string | null
          dt_remessa?: string | null
          eflag_e?: string | null
          empremp?: string | null
          est_liber?: string | null
          estr?: string | null
          fornecedor_codigo?: string | null
          fornecedor_nome?: string | null
          ftf?: string | null
          grp_mercads?: string | null
          grupo_mercadoria_curto?: string | null
          item?: string | null
          item_contrato?: string | null
          item_rc_cotacao?: string | null
          itm_liberacao?: string | null
          itm_ref?: string | null
          material?: string | null
          modificado_em?: string | null
          moeda_1?: string | null
          moeda_2?: string | null
          moeda_3?: string | null
          n_acomp?: string | null
          por?: string | null
          posicao?: string | null
          preco_liquido_unit?: number | null
          qtd_fornecida?: number | null
          qtd_pedido?: number | null
          regiao_uf?: string | null
          req_cotacao?: string | null
          reqc?: string | null
          requisitante?: string | null
          ri?: string | null
          status_entrega?: never
          tipo_doc_compra?: string | null
          tmatt?: string | null
          tpdc?: string | null
          txt_breve?: string | null
          ump_1?: string | null
          ump_2?: string | null
          ump_3?: string | null
          unidade_medida_basica?: string | null
          unidade_medida_pedido?: string | null
          upp?: string | null
          valor_efetivo?: number | null
          valor_em_brl?: number | null
          valor_liquido?: number | null
        }
        Update: {
          campos_extras?: Json | null
          categoria?: string | null
          cen_cen?: string | null
          ci?: string | null
          cn_lcr_parcs?: string | null
          cnpj_fornecedor?: string | null
          codigo_liberacao_doc_compra?: string | null
          condicao_pagamento?: string | null
          contrato?: string | null
          crf?: string | null
          criado_por_condicao?: string | null
          criado_por_liberacao?: string | null
          criado_por_pedido?: string | null
          criado_por_rc?: string | null
          data_doc?: string | null
          data_migo?: string | null
          data_pc_sc?: string | null
          data_rc?: string | null
          dep_dep?: string | null
          dias_atrasado?: never
          doc_compra?: string | null
          doc_compra_ref?: string | null
          dt_remessa?: string | null
          eflag_e?: string | null
          empremp?: string | null
          est_liber?: string | null
          estr?: string | null
          fornecedor_codigo?: string | null
          fornecedor_nome?: string | null
          ftf?: string | null
          grp_mercads?: string | null
          grupo_mercadoria_curto?: string | null
          item?: string | null
          item_contrato?: string | null
          item_rc_cotacao?: string | null
          itm_liberacao?: string | null
          itm_ref?: string | null
          material?: string | null
          modificado_em?: string | null
          moeda_1?: string | null
          moeda_2?: string | null
          moeda_3?: string | null
          n_acomp?: string | null
          por?: string | null
          posicao?: string | null
          preco_liquido_unit?: number | null
          qtd_fornecida?: number | null
          qtd_pedido?: number | null
          regiao_uf?: string | null
          req_cotacao?: string | null
          reqc?: string | null
          requisitante?: string | null
          ri?: string | null
          status_entrega?: never
          tipo_doc_compra?: string | null
          tmatt?: string | null
          tpdc?: string | null
          txt_breve?: string | null
          ump_1?: string | null
          ump_2?: string | null
          ump_3?: string | null
          unidade_medida_basica?: string | null
          unidade_medida_pedido?: string | null
          upp?: string | null
          valor_efetivo?: number | null
          valor_em_brl?: number | null
          valor_liquido?: number | null
        }
        Relationships: []
      }
      vw_sap_requisicoes_enriquecidas: {
        Row: {
          alerta: string | null
          apelido: string | null
          aplicacao: string | null
          area_solicitante: string | null
          atraso_comprador: number | null
          campos_extras: Json | null
          categoria_do_item: string | null
          centro: string | null
          centro_fornecedor: string | null
          codigo_de_bloqueio: string | null
          codigo_de_eliminacao: boolean | null
          codigo_de_liberacao: string | null
          concluida: string | null
          contrato_basico: string | null
          criado_por: string | null
          criado_por_pedido: string | null
          ctg_class_cont: string | null
          data_da_liberacao: string | null
          data_da_solicitacao: string | null
          data_de_remessa: string | null
          data_do_pedido: string | null
          data_entrega_prevista: string | null
          data_entrega_sap: string | null
          data_migo: string | null
          data_pedido: string | null
          data_pedido_origem: string | null
          data_referencia_prazo: string | null
          deposito: string | null
          descricao_do_grupo_de_compradores: string | null
          dias_atrasado: number | null
          dias_em_aberto: number | null
          documento_compra: string | null
          eliminado: boolean | null
          faixa_atraso: string | null
          fornecedor_code: string | null
          fornecedor_fixo: string | null
          fornecedor_name: string | null
          grupo_de_compradores: string | null
          grupo_de_mercadorias: string | null
          it_contrato_superior: string | null
          item_do_pedido: string | null
          item_pedido: string | null
          item_reqc: string | null
          item_status: string | null
          item_status_updated_at: string | null
          item_status_updated_by: string | null
          lead_time_compras_meta: number | null
          marca_da_peca: string | null
          material: string | null
          modelo: string | null
          moeda: string | null
          n_acompanhamento: string | null
          n_de_reqsc: number | null
          n_material_fornecedor: string | null
          n_peca_fabricante: string | null
          natureza: string | null
          nome_do_fornecedor: string | null
          obs_comprador: string | null
          obs_updated_at: string | null
          obs_updated_by: string | null
          organiz_compras: string | null
          peca_original: string | null
          pedido: string | null
          presente_ultima_carga: boolean | null
          qtd_solicitada: number | null
          quantidade_pedida: number | null
          remessas_de_ate: string | null
          requisicao_de_compra: string | null
          requisicao_externa: string | null
          requisitante: string | null
          ri: string | null
          status_atualizado: string | null
          status_entrega: string | null
          status_processamento: string | null
          status_requisicao: string | null
          sugestao_local_compra: string | null
          tempo_procmto_em: number | null
          texto_breve: string | null
          tipo_data_de_remessa: string | null
          tipo_de_documento: string | null
          tipo_de_transporte: string | null
          unidade_de_medida: string | null
        }
        Relationships: []
      }
      zl0170_miro: {
        Row: {
          ano_migo: string | null
          ano_miro: string | null
          campos_extras: Json | null
          centro: string | null
          data_aprovacao_pedido: string | null
          data_criacao_migo: string | null
          data_criacao_miro: string | null
          data_criacao_pedido: string | null
          data_documento: string | null
          data_entrada: string | null
          data_lancamento_migo: string | null
          data_lancamento_miro: string | null
          data_pagamento: string | null
          data_remessa: string | null
          data_solicitacao: string | null
          doc_migo: string | null
          doc_miro: string | null
          doc_pagamento: string | null
          empresa: string | null
          folha_servico: string | null
          fornecedor: string | null
          hora: string | null
          id: number | null
          id_fiscal_1: string | null
          id_fiscal_2: string | null
          id_fiscal_iva: string | null
          imported_at: string | null
          item: string | null
          material: string | null
          moeda_migo: string | null
          moeda_preco: string | null
          moeda_valor_liquido: string | null
          montante_migo: number | null
          montante_miro: number | null
          nome_1: string | null
          nome_2: string | null
          numero_doc_contabil: string | null
          numero_pedido: string | null
          preco_liquido: number | null
          qtd_migo: number | null
          qtd_miro: number | null
          qtd_pedido: number | null
          referencia: string | null
          requisicao_compra: string | null
          unidade_migo: string | null
          unidade_miro: string | null
          unidade_pedido: string | null
          valor_liquido: number | null
        }
        Insert: {
          ano_migo?: string | null
          ano_miro?: string | null
          campos_extras?: Json | null
          centro?: string | null
          data_aprovacao_pedido?: string | null
          data_criacao_migo?: string | null
          data_criacao_miro?: string | null
          data_criacao_pedido?: string | null
          data_documento?: string | null
          data_entrada?: string | null
          data_lancamento_migo?: string | null
          data_lancamento_miro?: string | null
          data_pagamento?: string | null
          data_remessa?: string | null
          data_solicitacao?: string | null
          doc_migo?: string | null
          doc_miro?: string | null
          doc_pagamento?: string | null
          empresa?: string | null
          folha_servico?: string | null
          fornecedor?: string | null
          hora?: string | null
          id?: number | null
          id_fiscal_1?: string | null
          id_fiscal_2?: string | null
          id_fiscal_iva?: string | null
          imported_at?: string | null
          item?: string | null
          material?: string | null
          moeda_migo?: string | null
          moeda_preco?: string | null
          moeda_valor_liquido?: string | null
          montante_migo?: number | null
          montante_miro?: number | null
          nome_1?: string | null
          nome_2?: string | null
          numero_doc_contabil?: string | null
          numero_pedido?: string | null
          preco_liquido?: number | null
          qtd_migo?: number | null
          qtd_miro?: number | null
          qtd_pedido?: number | null
          referencia?: string | null
          requisicao_compra?: string | null
          unidade_migo?: string | null
          unidade_miro?: string | null
          unidade_pedido?: string | null
          valor_liquido?: number | null
        }
        Update: {
          ano_migo?: string | null
          ano_miro?: string | null
          campos_extras?: Json | null
          centro?: string | null
          data_aprovacao_pedido?: string | null
          data_criacao_migo?: string | null
          data_criacao_miro?: string | null
          data_criacao_pedido?: string | null
          data_documento?: string | null
          data_entrada?: string | null
          data_lancamento_migo?: string | null
          data_lancamento_miro?: string | null
          data_pagamento?: string | null
          data_remessa?: string | null
          data_solicitacao?: string | null
          doc_migo?: string | null
          doc_miro?: string | null
          doc_pagamento?: string | null
          empresa?: string | null
          folha_servico?: string | null
          fornecedor?: string | null
          hora?: string | null
          id?: number | null
          id_fiscal_1?: string | null
          id_fiscal_2?: string | null
          id_fiscal_iva?: string | null
          imported_at?: string | null
          item?: string | null
          material?: string | null
          moeda_migo?: string | null
          moeda_preco?: string | null
          moeda_valor_liquido?: string | null
          montante_migo?: number | null
          montante_miro?: number | null
          nome_1?: string | null
          nome_2?: string | null
          numero_doc_contabil?: string | null
          numero_pedido?: string | null
          preco_liquido?: number | null
          qtd_migo?: number | null
          qtd_miro?: number | null
          qtd_pedido?: number | null
          referencia?: string | null
          requisicao_compra?: string | null
          unidade_migo?: string | null
          unidade_miro?: string | null
          unidade_pedido?: string | null
          valor_liquido?: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      _usage_require_admin: { Args: never; Returns: undefined }
      apagar_catalogo_materiais: { Args: never; Returns: undefined }
      atualizar_texto_tecnico_materiais: {
        Args: { p_itens: Json }
        Returns: Json
      }
      atualizar_textos_tecnicos_zl0162: {
        Args: { p_itens: Json }
        Returns: Json
      }
      bump_dataset_version: {
        Args: { p_dataset: string; p_rows?: number; p_user?: string }
        Returns: number
      }
      buscar_materiais: {
        Args: {
          area_usuario?: string
          deslocamento?: number
          incluir_tecnico?: boolean
          limite?: number
          termo: string
        }
        Returns: {
          chega_em: string
          depositos: string[]
          description: string
          material_code: string
          pedido_aberto: string
          pedido_pela_area: boolean
          qtd_estoque: number
          qtd_pedido_aberto: number
          qtd_rm_aberta: number
          rm_aberta: string
          rms_12m: number
          rms_sem_pedido: number
          technical_text: string
          ultima_rm: string
          unit: string
        }[]
      }
      buscar_materiais_catalogo: {
        Args: {
          apenas_codigos?: string[]
          categoria?: string
          deslocamento?: number
          empresa?: string
          incluir_tecnico?: boolean
          limite?: number
          ncm?: string
          status_filtro?: string
          termos?: string[]
          tmat?: string
          unidade?: string
        }
        Returns: {
          category: string
          codigo_controle: string
          company: string
          description: string
          id: string
          material_code: string
          status_centro: string
          status_geral: string
          status_sap: string
          technical_text: string
          tipo_material: string
          total_count: number
          unit: string
        }[]
      }
      escapar_like: { Args: { t: string }; Returns: string }
      f_unaccent: { Args: { "": string }; Returns: string }
      has_role: { Args: { required_role: string }; Returns: boolean }
      importar_materiais_zl0169: { Args: { p_materiais: Json }; Returns: Json }
      ipca_fator: { Args: { p_data: string }; Returns: number }
      ipca_mes_referencia: { Args: never; Returns: string }
      listar_categorias_materiais: {
        Args: never
        Returns: {
          category: string
        }[]
      }
      obter_maiores_codigos_catalogo: { Args: never; Returns: Json }
      pode_gerir_cotacoes: { Args: never; Returns: boolean }
      proximo_numero_solicitacao: {
        Args: { p_criticidade: number }
        Returns: string
      }
      refresh_benchmark_material: { Args: never; Returns: undefined }
      refresh_historico_pedidos: { Args: never; Returns: undefined }
      refresh_material_sinais: { Args: never; Returns: undefined }
      salvar_processo_cotacao: { Args: { p_payload: Json }; Returns: Json }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      sugerir_vinculos_cotacao: {
        Args: {
          p_descricoes: Json
          p_fornecedor_cnpj: string
          p_processo_id: string
        }
        Returns: {
          idx: number
          material_code: string
          origem: string
          processo_item_id: string
          ri: string
          score: number
          texto_breve: string
        }[]
      }
      unaccent: { Args: { "": string }; Returns: string }
      upsert_lote_materiais: { Args: { rows: Json }; Returns: undefined }
      usage_active_user_list: {
        Args: { p_from: string; p_to: string }
        Returns: {
          email: string
          first_event: string
          last_event: string
          page_views: number
          sessions: number
          user_id: string
          user_name: string
        }[]
      }
      usage_active_users: {
        Args: { p_from: string; p_granularity?: string; p_to: string }
        Returns: {
          active_users: number
          bucket: string
        }[]
      }
      usage_by_hour: {
        Args: { p_from: string; p_to: string; p_user_id?: string }
        Returns: {
          cnt: number
          dow: number
          hour: number
        }[]
      }
      usage_kpis: { Args: { p_from: string; p_to: string }; Returns: Json }
      usage_page_ranking: {
        Args: { p_from: string; p_to: string; p_user_id?: string }
        Returns: {
          avg_dwell_seconds: number
          page_label: string
          path: string
          visits: number
        }[]
      }
      usage_page_users: {
        Args: { p_from: string; p_path: string; p_to: string }
        Returns: {
          email: string
          last_visit: string
          user_id: string
          user_name: string
          visits: number
        }[]
      }
      usage_user_summary: { Args: { p_user_id: string }; Returns: Json }
      usage_user_timeline: {
        Args: { p_limit?: number; p_user_id: string }
        Returns: {
          created_at: string
          event_type: string
          page_label: string
          path: string
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
