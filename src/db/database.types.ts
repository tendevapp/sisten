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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      alm_balcao_aplicacoes: {
        Row: {
          ativo: boolean
          nome: string
          ordem: number
          wbs: string
        }
        Insert: {
          ativo?: boolean
          nome: string
          ordem?: number
          wbs: string
        }
        Update: {
          ativo?: boolean
          nome?: string
          ordem?: number
          wbs?: string
        }
        Relationships: []
      }
      alm_catalogo_itens: {
        Row: {
          ativo: boolean
          atualizado_por: string | null
          atualizado_por_nome: string | null
          classificacao_nivel1: string | null
          classificacao_nivel2: string | null
          codigo_registro: string
          codigo_sap: string
          created_at: string
          criado_por: string | null
          criado_por_nome: string | null
          descricao: string
          grp_mercad: string | null
          grupo_mercadorias: string | null
          id: string
          imagem_mime: string | null
          imagem_nome: string | null
          imagem_path: string | null
          imagem_tamanho: number | null
          observacao: string | null
          saldo_zl0024: number | null
          texto_tecnico: string | null
          umb: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          atualizado_por?: string | null
          atualizado_por_nome?: string | null
          classificacao_nivel1?: string | null
          classificacao_nivel2?: string | null
          codigo_registro: string
          codigo_sap: string
          created_at?: string
          criado_por?: string | null
          criado_por_nome?: string | null
          descricao: string
          grp_mercad?: string | null
          grupo_mercadorias?: string | null
          id?: string
          imagem_mime?: string | null
          imagem_nome?: string | null
          imagem_path?: string | null
          imagem_tamanho?: number | null
          observacao?: string | null
          saldo_zl0024?: number | null
          texto_tecnico?: string | null
          umb?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          atualizado_por?: string | null
          atualizado_por_nome?: string | null
          classificacao_nivel1?: string | null
          classificacao_nivel2?: string | null
          codigo_registro?: string
          codigo_sap?: string
          created_at?: string
          criado_por?: string | null
          criado_por_nome?: string | null
          descricao?: string
          grp_mercad?: string | null
          grupo_mercadorias?: string | null
          id?: string
          imagem_mime?: string | null
          imagem_nome?: string | null
          imagem_path?: string | null
          imagem_tamanho?: number | null
          observacao?: string | null
          saldo_zl0024?: number | null
          texto_tecnico?: string | null
          umb?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      alm_inventario_contagens: {
        Row: {
          contado_por_id: string | null
          contado_por_nome: string | null
          created_at: string
          divergente: boolean
          endereco_encontrado: string | null
          id: string
          item_id: string
          numero: number
          observacao: string | null
          quantidade: number
          saldo_ref: number
          validade: string | null
        }
        Insert: {
          contado_por_id?: string | null
          contado_por_nome?: string | null
          created_at?: string
          divergente: boolean
          endereco_encontrado?: string | null
          id?: string
          item_id: string
          numero: number
          observacao?: string | null
          quantidade: number
          saldo_ref: number
          validade?: string | null
        }
        Update: {
          contado_por_id?: string | null
          contado_por_nome?: string | null
          created_at?: string
          divergente?: boolean
          endereco_encontrado?: string | null
          id?: string
          item_id?: string
          numero?: number
          observacao?: string | null
          quantidade?: number
          saldo_ref?: number
          validade?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "alm_inventario_contagens_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "alm_inventario_itens"
            referencedColumns: ["id"]
          },
        ]
      }
      alm_inventario_itens: {
        Row: {
          alerta: string | null
          classe: string | null
          created_at: string
          deposito: string
          descricao: string | null
          diferenca: number | null
          encerrado_em: string | null
          encerrado_por: string | null
          id: string
          inventario_id: string
          material: string
          ordem: number
          qtd_final: number | null
          saldo_sistema: number | null
          status: string
          unidade: string | null
        }
        Insert: {
          alerta?: string | null
          classe?: string | null
          created_at?: string
          deposito: string
          descricao?: string | null
          diferenca?: number | null
          encerrado_em?: string | null
          encerrado_por?: string | null
          id?: string
          inventario_id: string
          material: string
          ordem?: number
          qtd_final?: number | null
          saldo_sistema?: number | null
          status?: string
          unidade?: string | null
        }
        Update: {
          alerta?: string | null
          classe?: string | null
          created_at?: string
          deposito?: string
          descricao?: string | null
          diferenca?: number | null
          encerrado_em?: string | null
          encerrado_por?: string | null
          id?: string
          inventario_id?: string
          material?: string
          ordem?: number
          qtd_final?: number | null
          saldo_sistema?: number | null
          status?: string
          unidade?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "alm_inventario_itens_inventario_id_fkey"
            columns: ["inventario_id"]
            isOneToOne: false
            referencedRelation: "alm_inventarios"
            referencedColumns: ["id"]
          },
        ]
      }
      alm_inventarios: {
        Row: {
          codigo: string
          concluido_em: string | null
          conferente_nome: string | null
          created_at: string
          criado_por_id: string | null
          criado_por_nome: string | null
          criterio: string | null
          data: string
          excluido: boolean
          excluido_em: string | null
          excluido_por: string | null
          id: string
          observacao: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          codigo: string
          concluido_em?: string | null
          conferente_nome?: string | null
          created_at?: string
          criado_por_id?: string | null
          criado_por_nome?: string | null
          criterio?: string | null
          data: string
          excluido?: boolean
          excluido_em?: string | null
          excluido_por?: string | null
          id?: string
          observacao?: string | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          codigo?: string
          concluido_em?: string | null
          conferente_nome?: string | null
          created_at?: string
          criado_por_id?: string | null
          criado_por_nome?: string | null
          criterio?: string | null
          data?: string
          excluido?: boolean
          excluido_em?: string | null
          excluido_por?: string | null
          id?: string
          observacao?: string | null
          status?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      alm_receb_alteracoes: {
        Row: {
          alteracoes: Json
          alterado_por_id: string | null
          alterado_por_nome: string | null
          codigo: string | null
          created_at: string
          entidade: string
          entidade_id: string
          id: string
          resumo: string | null
        }
        Insert: {
          alteracoes?: Json
          alterado_por_id?: string | null
          alterado_por_nome?: string | null
          codigo?: string | null
          created_at?: string
          entidade: string
          entidade_id: string
          id?: string
          resumo?: string | null
        }
        Update: {
          alteracoes?: Json
          alterado_por_id?: string | null
          alterado_por_nome?: string | null
          codigo?: string | null
          created_at?: string
          entidade?: string
          entidade_id?: string
          id?: string
          resumo?: string | null
        }
        Relationships: []
      }
      alm_receb_cargas: {
        Row: {
          avaria_aparente: boolean
          avaria_descricao: string | null
          codigo: string
          created_at: string
          criado_por_id: string | null
          criado_por_nome: string | null
          data: string
          destino_previsto: string
          divergencia: boolean
          doc_transporte: string | null
          evidencias: Json
          excluido: boolean
          excluido_em: string | null
          excluido_por: string | null
          hora: string | null
          id: string
          lacre_integro: boolean | null
          motorista: string | null
          nota_fiscal: string | null
          nro_pedido: string | null
          observacao: string | null
          peso_declarado: number | null
          qtd_volumes_contada: number
          qtd_volumes_declarada: number | null
          status: string
          tipo_embalagem: string | null
          transportadora: string
          veiculo_placa: string | null
        }
        Insert: {
          avaria_aparente?: boolean
          avaria_descricao?: string | null
          codigo: string
          created_at?: string
          criado_por_id?: string | null
          criado_por_nome?: string | null
          data: string
          destino_previsto?: string
          divergencia?: boolean
          doc_transporte?: string | null
          evidencias?: Json
          excluido?: boolean
          excluido_em?: string | null
          excluido_por?: string | null
          hora?: string | null
          id?: string
          lacre_integro?: boolean | null
          motorista?: string | null
          nota_fiscal?: string | null
          nro_pedido?: string | null
          observacao?: string | null
          peso_declarado?: number | null
          qtd_volumes_contada: number
          qtd_volumes_declarada?: number | null
          status?: string
          tipo_embalagem?: string | null
          transportadora: string
          veiculo_placa?: string | null
        }
        Update: {
          avaria_aparente?: boolean
          avaria_descricao?: string | null
          codigo?: string
          created_at?: string
          criado_por_id?: string | null
          criado_por_nome?: string | null
          data?: string
          destino_previsto?: string
          divergencia?: boolean
          doc_transporte?: string | null
          evidencias?: Json
          excluido?: boolean
          excluido_em?: string | null
          excluido_por?: string | null
          hora?: string | null
          id?: string
          lacre_integro?: boolean | null
          motorista?: string | null
          nota_fiscal?: string | null
          nro_pedido?: string | null
          observacao?: string | null
          peso_declarado?: number | null
          qtd_volumes_contada?: number
          qtd_volumes_declarada?: number | null
          status?: string
          tipo_embalagem?: string | null
          transportadora?: string
          veiculo_placa?: string | null
        }
        Relationships: []
      }
      alm_receb_conferencia_itens: {
        Row: {
          conferencia_id: string
          conferido: boolean
          created_at: string
          descricao: string | null
          divergencia: boolean
          evidencias: Json
          id: string
          item_manual: boolean
          linha_ref: string | null
          material_code: string | null
          nro_pedido: string | null
          observacao: string | null
          parcial: boolean
          parcial_conforme_nf: boolean
          qtd_ja_fornecida: number | null
          qtd_pedido: number | null
          qtd_recebida: number
          tipo_divergencia: string | null
          unidade: string | null
        }
        Insert: {
          conferencia_id: string
          conferido?: boolean
          created_at?: string
          descricao?: string | null
          divergencia?: boolean
          evidencias?: Json
          id?: string
          item_manual?: boolean
          linha_ref?: string | null
          material_code?: string | null
          nro_pedido?: string | null
          observacao?: string | null
          parcial?: boolean
          parcial_conforme_nf?: boolean
          qtd_ja_fornecida?: number | null
          qtd_pedido?: number | null
          qtd_recebida?: number
          tipo_divergencia?: string | null
          unidade?: string | null
        }
        Update: {
          conferencia_id?: string
          conferido?: boolean
          created_at?: string
          descricao?: string | null
          divergencia?: boolean
          evidencias?: Json
          id?: string
          item_manual?: boolean
          linha_ref?: string | null
          material_code?: string | null
          nro_pedido?: string | null
          observacao?: string | null
          parcial?: boolean
          parcial_conforme_nf?: boolean
          qtd_ja_fornecida?: number | null
          qtd_pedido?: number | null
          qtd_recebida?: number
          tipo_divergencia?: string | null
          unidade?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "alm_receb_conferencia_itens_conferencia_id_fkey"
            columns: ["conferencia_id"]
            isOneToOne: false
            referencedRelation: "alm_receb_conferencias"
            referencedColumns: ["id"]
          },
        ]
      }
      alm_receb_conferencias: {
        Row: {
          carga_id: string | null
          codigo: string
          created_at: string
          criado_por_id: string | null
          criado_por_nome: string | null
          data: string
          deposito: string | null
          encaminhado_projetos: boolean
          evidencias: Json
          excluido: boolean
          excluido_em: string | null
          excluido_por: string | null
          fonte_pedido: string
          fornecedor: string | null
          id: string
          itens_divergentes: number
          itens_ok: number
          nro_pedido: string | null
          observacao: string | null
          pedidos: string[]
          rm: string | null
          status: string
          tem_nc: boolean
          tipo_item: string
          total_itens: number
        }
        Insert: {
          carga_id?: string | null
          codigo: string
          created_at?: string
          criado_por_id?: string | null
          criado_por_nome?: string | null
          data: string
          deposito?: string | null
          encaminhado_projetos?: boolean
          evidencias?: Json
          excluido?: boolean
          excluido_em?: string | null
          excluido_por?: string | null
          fonte_pedido?: string
          fornecedor?: string | null
          id?: string
          itens_divergentes?: number
          itens_ok?: number
          nro_pedido?: string | null
          observacao?: string | null
          pedidos?: string[]
          rm?: string | null
          status?: string
          tem_nc?: boolean
          tipo_item?: string
          total_itens?: number
        }
        Update: {
          carga_id?: string | null
          codigo?: string
          created_at?: string
          criado_por_id?: string | null
          criado_por_nome?: string | null
          data?: string
          deposito?: string | null
          encaminhado_projetos?: boolean
          evidencias?: Json
          excluido?: boolean
          excluido_em?: string | null
          excluido_por?: string | null
          fonte_pedido?: string
          fornecedor?: string | null
          id?: string
          itens_divergentes?: number
          itens_ok?: number
          nro_pedido?: string | null
          observacao?: string | null
          pedidos?: string[]
          rm?: string | null
          status?: string
          tem_nc?: boolean
          tipo_item?: string
          total_itens?: number
        }
        Relationships: [
          {
            foreignKeyName: "alm_receb_conferencias_carga_id_fkey"
            columns: ["carga_id"]
            isOneToOne: false
            referencedRelation: "alm_receb_cargas"
            referencedColumns: ["id"]
          },
        ]
      }
      alm_receb_nc: {
        Row: {
          acoes: Json
          carga_id: string | null
          codigo: string
          conferencia_id: string | null
          created_at: string
          criado_por_id: string | null
          criado_por_nome: string | null
          descricao: string
          evidencias: Json
          excluido: boolean
          excluido_em: string | null
          excluido_por: string | null
          fornecedor: string | null
          id: string
          itens_resumo: Json
          nro_pedido: string | null
          resolucao: string | null
          resolvida_em: string | null
          responsavel: string | null
          severidade: string
          status: string
          tipo: string
        }
        Insert: {
          acoes?: Json
          carga_id?: string | null
          codigo: string
          conferencia_id?: string | null
          created_at?: string
          criado_por_id?: string | null
          criado_por_nome?: string | null
          descricao: string
          evidencias?: Json
          excluido?: boolean
          excluido_em?: string | null
          excluido_por?: string | null
          fornecedor?: string | null
          id?: string
          itens_resumo?: Json
          nro_pedido?: string | null
          resolucao?: string | null
          resolvida_em?: string | null
          responsavel?: string | null
          severidade?: string
          status?: string
          tipo: string
        }
        Update: {
          acoes?: Json
          carga_id?: string | null
          codigo?: string
          conferencia_id?: string | null
          created_at?: string
          criado_por_id?: string | null
          criado_por_nome?: string | null
          descricao?: string
          evidencias?: Json
          excluido?: boolean
          excluido_em?: string | null
          excluido_por?: string | null
          fornecedor?: string | null
          id?: string
          itens_resumo?: Json
          nro_pedido?: string | null
          resolucao?: string | null
          resolvida_em?: string | null
          responsavel?: string | null
          severidade?: string
          status?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "alm_receb_nc_carga_id_fkey"
            columns: ["carga_id"]
            isOneToOne: false
            referencedRelation: "alm_receb_cargas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alm_receb_nc_conferencia_id_fkey"
            columns: ["conferencia_id"]
            isOneToOne: false
            referencedRelation: "alm_receb_conferencias"
            referencedColumns: ["id"]
          },
        ]
      }
      alm_req_balcao: {
        Row: {
          aplicacao: string
          aplicacao_pep: string | null
          aplicacao_setor_id: string | null
          codigo: string
          colaborador_id: string | null
          colaborador_nome: string
          colaborador_registro: string | null
          confirmada_em: string | null
          confirmada_por: string | null
          created_at: string
          criado_por_id: string | null
          criado_por_nome: string | null
          data: string
          deposito_destino: string | null
          deposito_origem: string
          doc_sap: string | null
          doc_sap_em: string | null
          doc_sap_por: string | null
          excluido: boolean
          excluido_em: string | null
          excluido_por: string | null
          exportacao_id: string | null
          id: string
          observacao: string | null
          origem: string | null
          origem_ref: string | null
          pendente_confirmacao: boolean
          tipo_movimento: string
          turno: string | null
          updated_at: string | null
        }
        Insert: {
          aplicacao: string
          aplicacao_pep?: string | null
          aplicacao_setor_id?: string | null
          codigo: string
          colaborador_id?: string | null
          colaborador_nome: string
          colaborador_registro?: string | null
          confirmada_em?: string | null
          confirmada_por?: string | null
          created_at?: string
          criado_por_id?: string | null
          criado_por_nome?: string | null
          data: string
          deposito_destino?: string | null
          deposito_origem: string
          doc_sap?: string | null
          doc_sap_em?: string | null
          doc_sap_por?: string | null
          excluido?: boolean
          excluido_em?: string | null
          excluido_por?: string | null
          exportacao_id?: string | null
          id?: string
          observacao?: string | null
          origem?: string | null
          origem_ref?: string | null
          pendente_confirmacao?: boolean
          tipo_movimento: string
          turno?: string | null
          updated_at?: string | null
        }
        Update: {
          aplicacao?: string
          aplicacao_pep?: string | null
          aplicacao_setor_id?: string | null
          codigo?: string
          colaborador_id?: string | null
          colaborador_nome?: string
          colaborador_registro?: string | null
          confirmada_em?: string | null
          confirmada_por?: string | null
          created_at?: string
          criado_por_id?: string | null
          criado_por_nome?: string | null
          data?: string
          deposito_destino?: string | null
          deposito_origem?: string
          doc_sap?: string | null
          doc_sap_em?: string | null
          doc_sap_por?: string | null
          excluido?: boolean
          excluido_em?: string | null
          excluido_por?: string | null
          exportacao_id?: string | null
          id?: string
          observacao?: string | null
          origem?: string | null
          origem_ref?: string | null
          pendente_confirmacao?: boolean
          tipo_movimento?: string
          turno?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "alm_req_balcao_aplicacao_setor_id_fkey"
            columns: ["aplicacao_setor_id"]
            isOneToOne: false
            referencedRelation: "rh_setores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alm_req_balcao_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "rh_pessoas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alm_req_balcao_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "vw_rh_rotas_colaboradores"
            referencedColumns: ["pessoa_id"]
          },
          {
            foreignKeyName: "alm_req_balcao_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "vw_rh_treinamentos_vencimentos"
            referencedColumns: ["pessoa_id"]
          },
          {
            foreignKeyName: "alm_req_balcao_exportacao_id_fkey"
            columns: ["exportacao_id"]
            isOneToOne: false
            referencedRelation: "alm_req_balcao_exportacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      alm_req_balcao_alteracoes: {
        Row: {
          acao: string
          alteracoes: Json
          alterado_por_id: string | null
          alterado_por_nome: string | null
          codigo: string | null
          created_at: string
          id: string
          requisicao_id: string
          resumo: string | null
        }
        Insert: {
          acao: string
          alteracoes?: Json
          alterado_por_id?: string | null
          alterado_por_nome?: string | null
          codigo?: string | null
          created_at?: string
          id?: string
          requisicao_id: string
          resumo?: string | null
        }
        Update: {
          acao?: string
          alteracoes?: Json
          alterado_por_id?: string | null
          alterado_por_nome?: string | null
          codigo?: string | null
          created_at?: string
          id?: string
          requisicao_id?: string
          resumo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "alm_req_balcao_alteracoes_requisicao_id_fkey"
            columns: ["requisicao_id"]
            isOneToOne: false
            referencedRelation: "alm_req_balcao"
            referencedColumns: ["id"]
          },
        ]
      }
      alm_req_balcao_exportacoes: {
        Row: {
          arquivo: string
          codigos: string[]
          created_at: string
          exportado_por_id: string | null
          exportado_por_nome: string | null
          id: string
          total_itens: number
          total_requisicoes: number
        }
        Insert: {
          arquivo: string
          codigos?: string[]
          created_at?: string
          exportado_por_id?: string | null
          exportado_por_nome?: string | null
          id?: string
          total_itens?: number
          total_requisicoes?: number
        }
        Update: {
          arquivo?: string
          codigos?: string[]
          created_at?: string
          exportado_por_id?: string | null
          exportado_por_nome?: string | null
          id?: string
          total_itens?: number
          total_requisicoes?: number
        }
        Relationships: []
      }
      alm_req_balcao_itens: {
        Row: {
          aplicacao: string | null
          aplicacao_pep: string | null
          created_at: string
          deposito: string | null
          deposito_destino: string | null
          descricao: string | null
          doc_sap: string | null
          id: string
          material: string
          ordem: number
          quantidade: number
          requisicao_id: string
          saldo_zl0024: number | null
          sem_saldo: boolean
          status_processamento: string | null
          unidade: string | null
        }
        Insert: {
          aplicacao?: string | null
          aplicacao_pep?: string | null
          created_at?: string
          deposito?: string | null
          deposito_destino?: string | null
          descricao?: string | null
          doc_sap?: string | null
          id?: string
          material: string
          ordem?: number
          quantidade: number
          requisicao_id: string
          saldo_zl0024?: number | null
          sem_saldo?: boolean
          status_processamento?: string | null
          unidade?: string | null
        }
        Update: {
          aplicacao?: string | null
          aplicacao_pep?: string | null
          created_at?: string
          deposito?: string | null
          deposito_destino?: string | null
          descricao?: string | null
          doc_sap?: string | null
          id?: string
          material?: string
          ordem?: number
          quantidade?: number
          requisicao_id?: string
          saldo_zl0024?: number | null
          sem_saldo?: boolean
          status_processamento?: string | null
          unidade?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "alm_req_balcao_itens_requisicao_id_fkey"
            columns: ["requisicao_id"]
            isOneToOne: false
            referencedRelation: "alm_req_balcao"
            referencedColumns: ["id"]
          },
        ]
      }
      almox_controle_estoque_auditoria: {
        Row: {
          acao: string
          alterado_em: string
          alterado_por: string | null
          dados_anteriores: Json | null
          dados_novos: Json | null
          entidade: string
          id: number
          registro_id: string
        }
        Insert: {
          acao: string
          alterado_em?: string
          alterado_por?: string | null
          dados_anteriores?: Json | null
          dados_novos?: Json | null
          entidade: string
          id?: number
          registro_id: string
        }
        Update: {
          acao?: string
          alterado_em?: string
          alterado_por?: string | null
          dados_anteriores?: Json | null
          dados_novos?: Json | null
          entidade?: string
          id?: number
          registro_id?: string
        }
        Relationships: []
      }
      almox_controle_estoque_config: {
        Row: {
          ativo: boolean
          centro: string
          created_at: string
          created_by: string | null
          id: string
          intervalo_compra_dias: number
          janela_fim: string | null
          janela_inicio: string
          lead_time_padrao_dias: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          ativo?: boolean
          centro: string
          created_at?: string
          created_by?: string | null
          id?: string
          intervalo_compra_dias?: number
          janela_fim?: string | null
          janela_inicio: string
          lead_time_padrao_dias?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          ativo?: boolean
          centro?: string
          created_at?: string
          created_by?: string | null
          id?: string
          intervalo_compra_dias?: number
          janela_fim?: string | null
          janela_inicio?: string
          lead_time_padrao_dias?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      almox_controle_estoque_override: {
        Row: {
          ativo: boolean
          centro: string
          created_at: string
          created_by: string | null
          estoque_maximo: number | null
          estoque_minimo: number | null
          id: string
          intervalo_compra_dias: number | null
          justificativa: string
          lead_time_dias: number | null
          material: string
          quantidade_por_torre: number | null
          tipo_gestao: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          ativo?: boolean
          centro: string
          created_at?: string
          created_by?: string | null
          estoque_maximo?: number | null
          estoque_minimo?: number | null
          id?: string
          intervalo_compra_dias?: number | null
          justificativa: string
          lead_time_dias?: number | null
          material: string
          quantidade_por_torre?: number | null
          tipo_gestao?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          ativo?: boolean
          centro?: string
          created_at?: string
          created_by?: string | null
          estoque_maximo?: number | null
          estoque_minimo?: number | null
          id?: string
          intervalo_compra_dias?: number | null
          justificativa?: string
          lead_time_dias?: number | null
          material?: string
          quantidade_por_torre?: number | null
          tipo_gestao?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      almox_rm_exportacao_solicitacoes: {
        Row: {
          concluido_em: string | null
          concluido_por_id: string | null
          concluido_por_nome: string | null
          created_at: string
          exportacao_id: string
          id: string
          liberado_exportar_em: string | null
          liberado_exportar_por_id: string | null
          liberado_exportar_por_nome: string | null
          reaberto_em: string | null
          reaberto_motivo: string | null
          reaberto_por_id: string | null
          reaberto_por_nome: string | null
          request_id: string
          request_number: string
          total_itens: number
        }
        Insert: {
          concluido_em?: string | null
          concluido_por_id?: string | null
          concluido_por_nome?: string | null
          created_at?: string
          exportacao_id: string
          id?: string
          liberado_exportar_em?: string | null
          liberado_exportar_por_id?: string | null
          liberado_exportar_por_nome?: string | null
          reaberto_em?: string | null
          reaberto_motivo?: string | null
          reaberto_por_id?: string | null
          reaberto_por_nome?: string | null
          request_id: string
          request_number: string
          total_itens?: number
        }
        Update: {
          concluido_em?: string | null
          concluido_por_id?: string | null
          concluido_por_nome?: string | null
          created_at?: string
          exportacao_id?: string
          id?: string
          liberado_exportar_em?: string | null
          liberado_exportar_por_id?: string | null
          liberado_exportar_por_nome?: string | null
          reaberto_em?: string | null
          reaberto_motivo?: string | null
          reaberto_por_id?: string | null
          reaberto_por_nome?: string | null
          request_id?: string
          request_number?: string
          total_itens?: number
        }
        Relationships: [
          {
            foreignKeyName: "almox_rm_exportacao_solicitacoes_exportacao_id_fkey"
            columns: ["exportacao_id"]
            isOneToOne: false
            referencedRelation: "almox_rm_exportacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      almox_rm_exportacoes: {
        Row: {
          arquivo: string
          created_at: string
          exportado_por_id: string | null
          exportado_por_nome: string
          id: string
          observacao: string | null
          total_itens: number
          total_solicitacoes: number
        }
        Insert: {
          arquivo: string
          created_at?: string
          exportado_por_id?: string | null
          exportado_por_nome: string
          id?: string
          observacao?: string | null
          total_itens?: number
          total_solicitacoes?: number
        }
        Update: {
          arquivo?: string
          created_at?: string
          exportado_por_id?: string | null
          exportado_por_nome?: string
          id?: string
          observacao?: string | null
          total_itens?: number
          total_solicitacoes?: number
        }
        Relationships: []
      }
      almoxarifado_chegadas: {
        Row: {
          created_at: string
          data_chegada: string
          doc_compra: string | null
          registrado_por_id: string | null
          registrado_por_nome: string | null
          ri: string
          ri_po: string
          rm: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          data_chegada: string
          doc_compra?: string | null
          registrado_por_id?: string | null
          registrado_por_nome?: string | null
          ri: string
          ri_po: string
          rm?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          data_chegada?: string
          doc_compra?: string | null
          registrado_por_id?: string | null
          registrado_por_nome?: string | null
          ri?: string
          ri_po?: string
          rm?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      bd_acompanhamento_geral: {
        Row: {
          bd: string | null
          calandra: string | null
          cort_x_expedicao: string | null
          created_at: string
          data_expedicao: string | null
          data_inicio_internos: string | null
          data_termino_internos: string | null
          data_termino_saw3: string | null
          descricao: string | null
          id: string
          importacao_id: string
          inicio: string | null
          lead_time_calandra: number | null
          lead_time_corte: number | null
          linha_origem: number
          marcador_x: string | null
          marcador_x_expedicao: string | null
          metragem_reparos: number | null
          numero_torre: number | null
          posto_origem: string | null
          projeto: string | null
          qtd_reparos: number | null
          raw_data: Json
          sequencial: number | null
          tempo_armazenagem: number | null
          termino_final: string | null
          termino_nav01: string | null
          total_nav01: number | null
          total_turno_final: number | null
          total_turno_internos: number | null
          total_turno_saw3: number | null
          tramo: string | null
          turno_inicio: number | null
          turno_inicio_internos: number | null
          turno_lib_jato: number | null
          turno_termino_final: number | null
          turno_termino_nav01: number | null
          turno_termino_saw3: number | null
        }
        Insert: {
          bd?: string | null
          calandra?: string | null
          cort_x_expedicao?: string | null
          created_at?: string
          data_expedicao?: string | null
          data_inicio_internos?: string | null
          data_termino_internos?: string | null
          data_termino_saw3?: string | null
          descricao?: string | null
          id?: string
          importacao_id: string
          inicio?: string | null
          lead_time_calandra?: number | null
          lead_time_corte?: number | null
          linha_origem: number
          marcador_x?: string | null
          marcador_x_expedicao?: string | null
          metragem_reparos?: number | null
          numero_torre?: number | null
          posto_origem?: string | null
          projeto?: string | null
          qtd_reparos?: number | null
          raw_data?: Json
          sequencial?: number | null
          tempo_armazenagem?: number | null
          termino_final?: string | null
          termino_nav01?: string | null
          total_nav01?: number | null
          total_turno_final?: number | null
          total_turno_internos?: number | null
          total_turno_saw3?: number | null
          tramo?: string | null
          turno_inicio?: number | null
          turno_inicio_internos?: number | null
          turno_lib_jato?: number | null
          turno_termino_final?: number | null
          turno_termino_nav01?: number | null
          turno_termino_saw3?: number | null
        }
        Update: {
          bd?: string | null
          calandra?: string | null
          cort_x_expedicao?: string | null
          created_at?: string
          data_expedicao?: string | null
          data_inicio_internos?: string | null
          data_termino_internos?: string | null
          data_termino_saw3?: string | null
          descricao?: string | null
          id?: string
          importacao_id?: string
          inicio?: string | null
          lead_time_calandra?: number | null
          lead_time_corte?: number | null
          linha_origem?: number
          marcador_x?: string | null
          marcador_x_expedicao?: string | null
          metragem_reparos?: number | null
          numero_torre?: number | null
          posto_origem?: string | null
          projeto?: string | null
          qtd_reparos?: number | null
          raw_data?: Json
          sequencial?: number | null
          tempo_armazenagem?: number | null
          termino_final?: string | null
          termino_nav01?: string | null
          total_nav01?: number | null
          total_turno_final?: number | null
          total_turno_internos?: number | null
          total_turno_saw3?: number | null
          tramo?: string | null
          turno_inicio?: number | null
          turno_inicio_internos?: number | null
          turno_lib_jato?: number | null
          turno_termino_final?: number | null
          turno_termino_nav01?: number | null
          turno_termino_saw3?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bd_acompanhamento_geral_importacao_id_fkey"
            columns: ["importacao_id"]
            isOneToOne: false
            referencedRelation: "planejamento_importacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      cadastro_grupo_mercadoria: {
        Row: {
          classificacao_nivel1: string | null
          classificacao_nivel2: string | null
          codigo: string
          codigo_pai: string | null
          denominacao: string
          denominacao2: string | null
        }
        Insert: {
          classificacao_nivel1?: string | null
          classificacao_nivel2?: string | null
          codigo: string
          codigo_pai?: string | null
          denominacao: string
          denominacao2?: string | null
        }
        Update: {
          classificacao_nivel1?: string | null
          classificacao_nivel2?: string | null
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
      config_envio_emails: {
        Row: {
          assunto_padrao: string | null
          ativo: boolean
          chave: string
          copia: string | null
          copia_oculta: string | null
          created_at: string
          criado_por: string | null
          descricao: string | null
          destinatarios: string
          id: string
          modulo: string
          nome: string
          updated_at: string
        }
        Insert: {
          assunto_padrao?: string | null
          ativo?: boolean
          chave: string
          copia?: string | null
          copia_oculta?: string | null
          created_at?: string
          criado_por?: string | null
          descricao?: string | null
          destinatarios: string
          id?: string
          modulo?: string
          nome: string
          updated_at?: string
        }
        Update: {
          assunto_padrao?: string | null
          ativo?: boolean
          chave?: string
          copia?: string | null
          copia_oculta?: string | null
          created_at?: string
          criado_por?: string | null
          descricao?: string | null
          destinatarios?: string
          id?: string
          modulo?: string
          nome?: string
          updated_at?: string
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
          tipo: string | null
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
          tipo?: string | null
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
          tipo?: string | null
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
          demandas_setores: Json
          email: string
          grupo_compras: string | null
          id: string
          login_sem_email: boolean
          must_change_password: boolean
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
          demandas_setores?: Json
          email: string
          grupo_compras?: string | null
          id: string
          login_sem_email?: boolean
          must_change_password?: boolean
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
          demandas_setores?: Json
          email?: string
          grupo_compras?: string | null
          id?: string
          login_sem_email?: boolean
          must_change_password?: boolean
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
          codigo_fornecedor_sap: string | null
          codigo_sap_gerado: string | null
          comprador_id: string | null
          contrato_tipo: string | null
          created_at: string | null
          criticality: number
          data_necessidade: string | null
          first_response_at: string | null
          fornecedor_operacao: string | null
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
          ticket_externo: string | null
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
          codigo_fornecedor_sap?: string | null
          codigo_sap_gerado?: string | null
          comprador_id?: string | null
          contrato_tipo?: string | null
          created_at?: string | null
          criticality: number
          data_necessidade?: string | null
          first_response_at?: string | null
          fornecedor_operacao?: string | null
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
          ticket_externo?: string | null
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
          codigo_fornecedor_sap?: string | null
          codigo_sap_gerado?: string | null
          comprador_id?: string | null
          contrato_tipo?: string | null
          created_at?: string | null
          criticality?: number
          data_necessidade?: string | null
          first_response_at?: string | null
          fornecedor_operacao?: string | null
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
          ticket_externo?: string | null
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
      dem_buckets: {
        Row: {
          cor: string | null
          created_at: string
          excluido_em: string | null
          id: string
          nome: string
          ordem: number
          quadro_id: string
          updated_at: string
        }
        Insert: {
          cor?: string | null
          created_at?: string
          excluido_em?: string | null
          id?: string
          nome: string
          ordem?: number
          quadro_id: string
          updated_at?: string
        }
        Update: {
          cor?: string | null
          created_at?: string
          excluido_em?: string | null
          id?: string
          nome?: string
          ordem?: number
          quadro_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dem_buckets_quadro_id_fkey"
            columns: ["quadro_id"]
            isOneToOne: false
            referencedRelation: "dem_quadros"
            referencedColumns: ["id"]
          },
        ]
      }
      dem_quadros: {
        Row: {
          arquivado: boolean
          cor: string | null
          created_at: string
          criado_por: string | null
          descricao: string | null
          excluido_em: string | null
          excluido_por: string | null
          id: string
          membros_extra: string[]
          nome: string
          ordem: number
          setor_id: string
          updated_at: string
        }
        Insert: {
          arquivado?: boolean
          cor?: string | null
          created_at?: string
          criado_por?: string | null
          descricao?: string | null
          excluido_em?: string | null
          excluido_por?: string | null
          id?: string
          membros_extra?: string[]
          nome: string
          ordem?: number
          setor_id: string
          updated_at?: string
        }
        Update: {
          arquivado?: boolean
          cor?: string | null
          created_at?: string
          criado_por?: string | null
          descricao?: string | null
          excluido_em?: string | null
          excluido_por?: string | null
          id?: string
          membros_extra?: string[]
          nome?: string
          ordem?: number
          setor_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dem_quadros_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "core_perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dem_quadros_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dem_quadros_excluido_por_fkey"
            columns: ["excluido_por"]
            isOneToOne: false
            referencedRelation: "core_perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dem_quadros_excluido_por_fkey"
            columns: ["excluido_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dem_quadros_setor_id_fkey"
            columns: ["setor_id"]
            isOneToOne: false
            referencedRelation: "core_setores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dem_quadros_setor_id_fkey"
            columns: ["setor_id"]
            isOneToOne: false
            referencedRelation: "sectors"
            referencedColumns: ["id"]
          },
        ]
      }
      dem_tarefa_atividades: {
        Row: {
          created_at: string
          criado_por: string | null
          criado_por_nome: string | null
          id: string
          tarefa_id: string
          texto: string
          tipo: string
        }
        Insert: {
          created_at?: string
          criado_por?: string | null
          criado_por_nome?: string | null
          id?: string
          tarefa_id: string
          texto: string
          tipo?: string
        }
        Update: {
          created_at?: string
          criado_por?: string | null
          criado_por_nome?: string | null
          id?: string
          tarefa_id?: string
          texto?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "dem_tarefa_atividades_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "core_perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dem_tarefa_atividades_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dem_tarefa_atividades_tarefa_id_fkey"
            columns: ["tarefa_id"]
            isOneToOne: false
            referencedRelation: "dem_tarefas"
            referencedColumns: ["id"]
          },
        ]
      }
      dem_tarefas: {
        Row: {
          anexos: Json
          bucket_id: string | null
          checklist: Json
          codigo: string | null
          concluida_em: string | null
          created_at: string
          criado_por: string | null
          data_inicio: string | null
          data_vencimento: string | null
          descricao: string | null
          excluido_em: string | null
          excluido_por: string | null
          id: string
          ordem: number
          prioridade: string
          quadro_id: string
          responsaveis: string[]
          status: string
          titulo: string
          updated_at: string
        }
        Insert: {
          anexos?: Json
          bucket_id?: string | null
          checklist?: Json
          codigo?: string | null
          concluida_em?: string | null
          created_at?: string
          criado_por?: string | null
          data_inicio?: string | null
          data_vencimento?: string | null
          descricao?: string | null
          excluido_em?: string | null
          excluido_por?: string | null
          id?: string
          ordem?: number
          prioridade?: string
          quadro_id: string
          responsaveis?: string[]
          status?: string
          titulo: string
          updated_at?: string
        }
        Update: {
          anexos?: Json
          bucket_id?: string | null
          checklist?: Json
          codigo?: string | null
          concluida_em?: string | null
          created_at?: string
          criado_por?: string | null
          data_inicio?: string | null
          data_vencimento?: string | null
          descricao?: string | null
          excluido_em?: string | null
          excluido_por?: string | null
          id?: string
          ordem?: number
          prioridade?: string
          quadro_id?: string
          responsaveis?: string[]
          status?: string
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dem_tarefas_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "dem_buckets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dem_tarefas_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "core_perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dem_tarefas_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dem_tarefas_excluido_por_fkey"
            columns: ["excluido_por"]
            isOneToOne: false
            referencedRelation: "core_perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dem_tarefas_excluido_por_fkey"
            columns: ["excluido_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dem_tarefas_quadro_id_fkey"
            columns: ["quadro_id"]
            isOneToOne: false
            referencedRelation: "dem_quadros"
            referencedColumns: ["id"]
          },
        ]
      }
      deposito_estoque: {
        Row: {
          created_at: string
          deposito: string
          descricao: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deposito: string
          descricao: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deposito?: string
          descricao?: string
          updated_at?: string
        }
        Relationships: []
      }
      expedicao_carregamentos: {
        Row: {
          created_at: string
          criado_por: string
          criado_por_nome: string
          empresa: string
          enviado_em: string | null
          enviado_por: string | null
          enviado_por_nome: string | null
          excluido_em: string | null
          excluido_por: string | null
          historico_envios: Json | null
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
          enviado_por?: string | null
          enviado_por_nome?: string | null
          excluido_em?: string | null
          excluido_por?: string | null
          historico_envios?: Json | null
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
          enviado_por?: string | null
          enviado_por_nome?: string | null
          excluido_em?: string | null
          excluido_por?: string | null
          historico_envios?: Json | null
          id?: string
          numero?: string
          observacoes?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expedicao_carregamentos_excluido_por_fkey"
            columns: ["excluido_por"]
            isOneToOne: false
            referencedRelation: "core_perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expedicao_carregamentos_excluido_por_fkey"
            columns: ["excluido_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      expedicao_fotos: {
        Row: {
          carregamento_id: string
          created_at: string
          criado_por: string | null
          etapa: string
          excluido_em: string | null
          excluido_por: string | null
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
          excluido_em?: string | null
          excluido_por?: string | null
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
          excluido_em?: string | null
          excluido_por?: string | null
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
            foreignKeyName: "expedicao_fotos_excluido_por_fkey"
            columns: ["excluido_por"]
            isOneToOne: false
            referencedRelation: "core_perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expedicao_fotos_excluido_por_fkey"
            columns: ["excluido_por"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          cnh: string | null
          created_at: string
          data: string | null
          data_chegada_portaria: string | null
          data_entrada_patio: string | null
          data_expedicao: string | null
          dolly_placa: string
          dolly_uf: string | null
          excluido_em: string | null
          excluido_por: string | null
          historico_observacoes: Json | null
          hora_chegada_portaria: string | null
          hora_entrada_patio: string | null
          hora_expedicao: string | null
          id: string
          motorista: string
          numero_nf: string | null
          numero_tramo: string | null
          obs_chegada_portaria: string | null
          obs_entrada_patio: string | null
          obs_expedicao: string | null
          observacoes: string | null
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
          cnh?: string | null
          created_at?: string
          data?: string | null
          data_chegada_portaria?: string | null
          data_entrada_patio?: string | null
          data_expedicao?: string | null
          dolly_placa?: string
          dolly_uf?: string | null
          excluido_em?: string | null
          excluido_por?: string | null
          historico_observacoes?: Json | null
          hora_chegada_portaria?: string | null
          hora_entrada_patio?: string | null
          hora_expedicao?: string | null
          id?: string
          motorista?: string
          numero_nf?: string | null
          numero_tramo?: string | null
          obs_chegada_portaria?: string | null
          obs_entrada_patio?: string | null
          obs_expedicao?: string | null
          observacoes?: string | null
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
          cnh?: string | null
          created_at?: string
          data?: string | null
          data_chegada_portaria?: string | null
          data_entrada_patio?: string | null
          data_expedicao?: string | null
          dolly_placa?: string
          dolly_uf?: string | null
          excluido_em?: string | null
          excluido_por?: string | null
          historico_observacoes?: Json | null
          hora_chegada_portaria?: string | null
          hora_entrada_patio?: string | null
          hora_expedicao?: string | null
          id?: string
          motorista?: string
          numero_nf?: string | null
          numero_tramo?: string | null
          obs_chegada_portaria?: string | null
          obs_entrada_patio?: string | null
          obs_expedicao?: string | null
          observacoes?: string | null
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
          {
            foreignKeyName: "expedicao_tramos_excluido_por_fkey"
            columns: ["excluido_por"]
            isOneToOne: false
            referencedRelation: "core_perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expedicao_tramos_excluido_por_fkey"
            columns: ["excluido_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      fac_servicos: {
        Row: {
          ativo: boolean
          created_at: string
          descricao: string | null
          excluido_em: string | null
          excluido_por: string | null
          id: string
          nome: string
          ordem: number
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          excluido_em?: string | null
          excluido_por?: string | null
          id?: string
          nome: string
          ordem?: number
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          excluido_em?: string | null
          excluido_por?: string | null
          id?: string
          nome?: string
          ordem?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fac_servicos_excluido_por_fkey"
            columns: ["excluido_por"]
            isOneToOne: false
            referencedRelation: "core_perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fac_servicos_excluido_por_fkey"
            columns: ["excluido_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      fac_veiculos_leves: {
        Row: {
          ativo: boolean
          created_at: string
          data_licenciamento: string | null
          excluido_em: string | null
          excluido_por: string | null
          id: string
          modelo: string
          placa: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          data_licenciamento?: string | null
          excluido_em?: string | null
          excluido_por?: string | null
          id?: string
          modelo: string
          placa: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          data_licenciamento?: string | null
          excluido_em?: string | null
          excluido_por?: string | null
          id?: string
          modelo?: string
          placa?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fac_veiculos_leves_excluido_por_fkey"
            columns: ["excluido_por"]
            isOneToOne: false
            referencedRelation: "core_perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fac_veiculos_leves_excluido_por_fkey"
            columns: ["excluido_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_fat_alteracoes: {
        Row: {
          alteracoes: Json
          alterado_por_id: string | null
          alterado_por_nome: string | null
          created_at: string
          fat_id: string
          id: string
          resumo: string | null
        }
        Insert: {
          alteracoes?: Json
          alterado_por_id?: string | null
          alterado_por_nome?: string | null
          created_at?: string
          fat_id: string
          id?: string
          resumo?: string | null
        }
        Update: {
          alteracoes?: Json
          alterado_por_id?: string | null
          alterado_por_nome?: string | null
          created_at?: string
          fat_id?: string
          id?: string
          resumo?: string | null
        }
        Relationships: []
      }
      fin_fat_gwjaco: {
        Row: {
          codigo_cliente: string | null
          created_at: string
          criado_por_id: string | null
          criado_por_nome: string | null
          data_expedido: string | null
          data_faturado: string | null
          data_tramos_previstos: string | null
          id: string
          nota_fiscal: string | null
          observacao: string | null
          part_number: string | null
          projeto: string
          projeto_codigo: string | null
          restricao: boolean
          semana_faturamento: number | null
          serie: number | null
          torre_numero: number
          tramo: string
          tramo_id: string | null
          updated_at: string
        }
        Insert: {
          codigo_cliente?: string | null
          created_at?: string
          criado_por_id?: string | null
          criado_por_nome?: string | null
          data_expedido?: string | null
          data_faturado?: string | null
          data_tramos_previstos?: string | null
          id?: string
          nota_fiscal?: string | null
          observacao?: string | null
          part_number?: string | null
          projeto?: string
          projeto_codigo?: string | null
          restricao?: boolean
          semana_faturamento?: number | null
          serie?: number | null
          torre_numero: number
          tramo: string
          tramo_id?: string | null
          updated_at?: string
        }
        Update: {
          codigo_cliente?: string | null
          created_at?: string
          criado_por_id?: string | null
          criado_por_nome?: string | null
          data_expedido?: string | null
          data_faturado?: string | null
          data_tramos_previstos?: string | null
          id?: string
          nota_fiscal?: string | null
          observacao?: string | null
          part_number?: string | null
          projeto?: string
          projeto_codigo?: string | null
          restricao?: boolean
          semana_faturamento?: number | null
          serie?: number | null
          torre_numero?: number
          tramo?: string
          tramo_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fin_fat_gwjaco_tramo_id_fkey"
            columns: ["tramo_id"]
            isOneToOne: false
            referencedRelation: "proj_tramos_gwjaco"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_fornecedores_planilha: {
        Row: {
          created_at: string
          filtro_tipo_item: string | null
          fornecedor_codigos: string[]
          id: string
          nome_planilha: string
          observacao: string | null
          ordem: number
          secao: string
          tipo: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          filtro_tipo_item?: string | null
          fornecedor_codigos?: string[]
          id?: string
          nome_planilha: string
          observacao?: string | null
          ordem: number
          secao: string
          tipo?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          filtro_tipo_item?: string | null
          fornecedor_codigos?: string[]
          id?: string
          nome_planilha?: string
          observacao?: string | null
          ordem?: number
          secao?: string
          tipo?: string
          updated_at?: string
        }
        Relationships: []
      }
      fin_pep: {
        Row: {
          centro_lucro: string | null
          classificacao_contabil: string | null
          created_at: string | null
          definicao_projeto: string | null
          elemento_faturamento: string | null
          empresa: string | null
          id: string
          ifrs15_od: string | null
          importado_em: string | null
          importado_por: string | null
          moeda: string | null
          nivel: number | null
          nome: string | null
          status: string | null
          unidade_medida: string | null
          updated_at: string | null
          wbs_element: string
        }
        Insert: {
          centro_lucro?: string | null
          classificacao_contabil?: string | null
          created_at?: string | null
          definicao_projeto?: string | null
          elemento_faturamento?: string | null
          empresa?: string | null
          id?: string
          ifrs15_od?: string | null
          importado_em?: string | null
          importado_por?: string | null
          moeda?: string | null
          nivel?: number | null
          nome?: string | null
          status?: string | null
          unidade_medida?: string | null
          updated_at?: string | null
          wbs_element: string
        }
        Update: {
          centro_lucro?: string | null
          classificacao_contabil?: string | null
          created_at?: string | null
          definicao_projeto?: string | null
          elemento_faturamento?: string | null
          empresa?: string | null
          id?: string
          ifrs15_od?: string | null
          importado_em?: string | null
          importado_por?: string | null
          moeda?: string | null
          nivel?: number | null
          nome?: string | null
          status?: string | null
          unidade_medida?: string | null
          updated_at?: string | null
          wbs_element?: string
        }
        Relationships: []
      }
      fin_rubrica_exclusoes_material: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          motivo: string | null
          padrao_material: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          motivo?: string | null
          padrao_material: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          motivo?: string | null
          padrao_material?: string
          updated_at?: string
        }
        Relationships: []
      }
      fin_rubrica_mapeamentos: {
        Row: {
          ativo: boolean
          chave_descricao: string | null
          chave_valor: string
          created_at: string
          id: string
          rubrica_id: string
          tipo_chave: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          chave_descricao?: string | null
          chave_valor: string
          created_at?: string
          id?: string
          rubrica_id: string
          tipo_chave: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          chave_descricao?: string | null
          chave_valor?: string
          created_at?: string
          id?: string
          rubrica_id?: string
          tipo_chave?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fin_rubrica_mapeamentos_rubrica_id_fkey"
            columns: ["rubrica_id"]
            isOneToOne: false
            referencedRelation: "fin_rubricas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_rubrica_mapeamentos_rubrica_id_fkey"
            columns: ["rubrica_id"]
            isOneToOne: false
            referencedRelation: "vw_fin_nf_realizado_rubrica"
            referencedColumns: ["rubrica_id"]
          },
        ]
      }
      fin_rubricas: {
        Row: {
          codigo: string
          created_at: string
          id: string
          nome: string
          ordem: number
          rubrica_pai_id: string | null
          updated_at: string
        }
        Insert: {
          codigo: string
          created_at?: string
          id?: string
          nome: string
          ordem?: number
          rubrica_pai_id?: string | null
          updated_at?: string
        }
        Update: {
          codigo?: string
          created_at?: string
          id?: string
          nome?: string
          ordem?: number
          rubrica_pai_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fin_rubricas_rubrica_pai_id_fkey"
            columns: ["rubrica_pai_id"]
            isOneToOne: false
            referencedRelation: "fin_rubricas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_rubricas_rubrica_pai_id_fkey"
            columns: ["rubrica_pai_id"]
            isOneToOne: false
            referencedRelation: "vw_fin_nf_realizado_rubrica"
            referencedColumns: ["rubrica_id"]
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
      ops_ia_prompts: {
        Row: {
          ativo: boolean
          atualizado_por: string | null
          atualizado_por_nome: string | null
          chave: string
          created_at: string
          descricao: string | null
          modelo: string | null
          parametros: Json
          prompt: string
          titulo: string
          updated_at: string
          versao: number
        }
        Insert: {
          ativo?: boolean
          atualizado_por?: string | null
          atualizado_por_nome?: string | null
          chave: string
          created_at?: string
          descricao?: string | null
          modelo?: string | null
          parametros?: Json
          prompt: string
          titulo: string
          updated_at?: string
          versao?: number
        }
        Update: {
          ativo?: boolean
          atualizado_por?: string | null
          atualizado_por_nome?: string | null
          chave?: string
          created_at?: string
          descricao?: string | null
          modelo?: string | null
          parametros?: Json
          prompt?: string
          titulo?: string
          updated_at?: string
          versao?: number
        }
        Relationships: [
          {
            foreignKeyName: "ops_ia_prompts_atualizado_por_fkey"
            columns: ["atualizado_por"]
            isOneToOne: false
            referencedRelation: "core_perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ops_ia_prompts_atualizado_por_fkey"
            columns: ["atualizado_por"]
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
      planejamento_acomp_diario_auditoria: {
        Row: {
          acao: string
          alterado_em: string
          alterado_por: string | null
          chave: Json
          dados_anteriores: Json | null
          dados_novos: Json | null
          entidade: string
          id: string
        }
        Insert: {
          acao: string
          alterado_em?: string
          alterado_por?: string | null
          chave: Json
          dados_anteriores?: Json | null
          dados_novos?: Json | null
          entidade: string
          id?: string
        }
        Update: {
          acao?: string
          alterado_em?: string
          alterado_por?: string | null
          chave?: Json
          dados_anteriores?: Json | null
          dados_novos?: Json | null
          entidade?: string
          id?: string
        }
        Relationships: []
      }
      planejamento_acomp_diario_feriados: {
        Row: {
          atualizado_em: string
          atualizado_por: string
          data: string
          descricao: string | null
        }
        Insert: {
          atualizado_em?: string
          atualizado_por?: string
          data: string
          descricao?: string | null
        }
        Update: {
          atualizado_em?: string
          atualizado_por?: string
          data?: string
          descricao?: string | null
        }
        Relationships: []
      }
      planejamento_acomp_diario_metas: {
        Row: {
          ano: number
          area: string
          atualizado_em: string
          atualizado_por: string
          dias_uteis: number
          id: string
          mes: number
          meta: number
        }
        Insert: {
          ano: number
          area: string
          atualizado_em?: string
          atualizado_por?: string
          dias_uteis: number
          id?: string
          mes: number
          meta: number
        }
        Update: {
          ano?: number
          area?: string
          atualizado_em?: string
          atualizado_por?: string
          dias_uteis?: number
          id?: string
          mes?: number
          meta?: number
        }
        Relationships: []
      }
      planejamento_acomp_diario_metas_semanais: {
        Row: {
          area: string
          atualizado_em: string
          atualizado_por: string
          dias_uteis: number
          id: string
          meta: number
          semana_inicio: string
        }
        Insert: {
          area: string
          atualizado_em?: string
          atualizado_por?: string
          dias_uteis: number
          id?: string
          meta: number
          semana_inicio: string
        }
        Update: {
          area?: string
          atualizado_em?: string
          atualizado_por?: string
          dias_uteis?: number
          id?: string
          meta?: number
          semana_inicio?: string
        }
        Relationships: []
      }
      planejamento_acomp_diario_realizados: {
        Row: {
          area: string
          atualizado_em: string
          atualizado_por: string
          data: string
          id: string
          realizado: number
        }
        Insert: {
          area: string
          atualizado_em?: string
          atualizado_por?: string
          data: string
          id?: string
          realizado: number
        }
        Update: {
          area?: string
          atualizado_em?: string
          atualizado_por?: string
          data?: string
          id?: string
          realizado?: number
        }
        Relationships: []
      }
      planejamento_cronograma: {
        Row: {
          id: string
          importacao_id: string
          linha_origem: number
          posto: string | null
          raw_data: Json
          sequencial: number
        }
        Insert: {
          id?: string
          importacao_id: string
          linha_origem: number
          posto?: string | null
          raw_data?: Json
          sequencial: number
        }
        Update: {
          id?: string
          importacao_id?: string
          linha_origem?: number
          posto?: string | null
          raw_data?: Json
          sequencial?: number
        }
        Relationships: [
          {
            foreignKeyName: "planejamento_cronograma_importacao_id_fkey"
            columns: ["importacao_id"]
            isOneToOne: false
            referencedRelation: "planejamento_importacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      planejamento_importacoes: {
        Row: {
          arquivo_bd: string
          arquivo_cronograma: string | null
          cabecalhos_bd: Json
          concluido_em: string | null
          id: string
          importado_por: string
          iniciado_em: string
          linhas_bd: number
          linhas_cronograma: number
          mensagem_erro: string | null
          status: string
        }
        Insert: {
          arquivo_bd: string
          arquivo_cronograma?: string | null
          cabecalhos_bd?: Json
          concluido_em?: string | null
          id?: string
          importado_por?: string
          iniciado_em?: string
          linhas_bd?: number
          linhas_cronograma?: number
          mensagem_erro?: string | null
          status?: string
        }
        Update: {
          arquivo_bd?: string
          arquivo_cronograma?: string | null
          cabecalhos_bd?: Json
          concluido_em?: string | null
          id?: string
          importado_por?: string
          iniciado_em?: string
          linhas_bd?: number
          linhas_cronograma?: number
          mensagem_erro?: string | null
          status?: string
        }
        Relationships: []
      }
      port_alcoolemia_testes: {
        Row: {
          cargo_funcao: string | null
          codigo_formulario: string
          created_at: string
          criado_por: string | null
          criado_por_nome: string | null
          data: string
          documento: string | null
          empresa: string
          etilometro_codigo: string | null
          examinador_cargo: string | null
          examinador_nome: string | null
          excluido_em: string | null
          excluido_por: string | null
          horario: string
          id: string
          local_teste: string | null
          matricula: string | null
          nome: string
          numero_protocolo: string | null
          observacoes: string | null
          pessoa_id: string | null
          razao_teste: string | null
          resultado: string
          setor_area: string | null
          termo_assinado_fisicamente: boolean | null
          termo_impresso_em: string | null
          testemunha: string | null
          tipo_vinculo: string
          turno: string
          updated_at: string
          valor_medido: number | null
          vigilante: string | null
        }
        Insert: {
          cargo_funcao?: string | null
          codigo_formulario: string
          created_at?: string
          criado_por?: string | null
          criado_por_nome?: string | null
          data?: string
          documento?: string | null
          empresa?: string
          etilometro_codigo?: string | null
          examinador_cargo?: string | null
          examinador_nome?: string | null
          excluido_em?: string | null
          excluido_por?: string | null
          horario: string
          id?: string
          local_teste?: string | null
          matricula?: string | null
          nome: string
          numero_protocolo?: string | null
          observacoes?: string | null
          pessoa_id?: string | null
          razao_teste?: string | null
          resultado?: string
          setor_area?: string | null
          termo_assinado_fisicamente?: boolean | null
          termo_impresso_em?: string | null
          testemunha?: string | null
          tipo_vinculo?: string
          turno?: string
          updated_at?: string
          valor_medido?: number | null
          vigilante?: string | null
        }
        Update: {
          cargo_funcao?: string | null
          codigo_formulario?: string
          created_at?: string
          criado_por?: string | null
          criado_por_nome?: string | null
          data?: string
          documento?: string | null
          empresa?: string
          etilometro_codigo?: string | null
          examinador_cargo?: string | null
          examinador_nome?: string | null
          excluido_em?: string | null
          excluido_por?: string | null
          horario?: string
          id?: string
          local_teste?: string | null
          matricula?: string | null
          nome?: string
          numero_protocolo?: string | null
          observacoes?: string | null
          pessoa_id?: string | null
          razao_teste?: string | null
          resultado?: string
          setor_area?: string | null
          termo_assinado_fisicamente?: boolean | null
          termo_impresso_em?: string | null
          testemunha?: string | null
          tipo_vinculo?: string
          turno?: string
          updated_at?: string
          valor_medido?: number | null
          vigilante?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "port_alcoolemia_testes_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "rh_pessoas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "port_alcoolemia_testes_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "vw_rh_rotas_colaboradores"
            referencedColumns: ["pessoa_id"]
          },
          {
            foreignKeyName: "port_alcoolemia_testes_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "vw_rh_treinamentos_vencimentos"
            referencedColumns: ["pessoa_id"]
          },
        ]
      }
      port_briefing_participantes: {
        Row: {
          assinatura_digital: string | null
          cpf: string
          created_at: string
          data: string
          empresa: string
          excluido_em: string | null
          excluido_por: string | null
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
          excluido_em?: string | null
          excluido_por?: string | null
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
          excluido_em?: string | null
          excluido_por?: string | null
          funcao?: string
          id?: string
          nome?: string
          sessao_id?: string
          validade_dias?: number
        }
        Relationships: [
          {
            foreignKeyName: "port_briefing_participantes_excluido_por_fkey"
            columns: ["excluido_por"]
            isOneToOne: false
            referencedRelation: "core_perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "port_briefing_participantes_excluido_por_fkey"
            columns: ["excluido_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
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
          excluido_em: string | null
          excluido_por: string | null
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
          excluido_em?: string | null
          excluido_por?: string | null
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
          excluido_em?: string | null
          excluido_por?: string | null
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
          {
            foreignKeyName: "port_briefing_sessoes_excluido_por_fkey"
            columns: ["excluido_por"]
            isOneToOne: false
            referencedRelation: "core_perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "port_briefing_sessoes_excluido_por_fkey"
            columns: ["excluido_por"]
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
          excluido_em: string | null
          excluido_por: string | null
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
          excluido_em?: string | null
          excluido_por?: string | null
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
          excluido_em?: string | null
          excluido_por?: string | null
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
          {
            foreignKeyName: "port_controle_carretas_excluido_por_fkey"
            columns: ["excluido_por"]
            isOneToOne: false
            referencedRelation: "core_perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "port_controle_carretas_excluido_por_fkey"
            columns: ["excluido_por"]
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
          excluido_em: string | null
          excluido_por: string | null
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
          excluido_em?: string | null
          excluido_por?: string | null
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
          excluido_em?: string | null
          excluido_por?: string | null
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
          {
            foreignKeyName: "port_controle_equipamentos_excluido_por_fkey"
            columns: ["excluido_por"]
            isOneToOne: false
            referencedRelation: "core_perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "port_controle_equipamentos_excluido_por_fkey"
            columns: ["excluido_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      port_materiais_seguranca: {
        Row: {
          ativo: boolean | null
          categoria: string | null
          created_at: string | null
          excluido_em: string | null
          excluido_por: string | null
          id: string
          nome: string
          observacoes: string | null
          ordem: number | null
          quantidade_padrao: number
          unidade: string | null
          updated_at: string | null
        }
        Insert: {
          ativo?: boolean | null
          categoria?: string | null
          created_at?: string | null
          excluido_em?: string | null
          excluido_por?: string | null
          id?: string
          nome: string
          observacoes?: string | null
          ordem?: number | null
          quantidade_padrao?: number
          unidade?: string | null
          updated_at?: string | null
        }
        Update: {
          ativo?: boolean | null
          categoria?: string | null
          created_at?: string | null
          excluido_em?: string | null
          excluido_por?: string | null
          id?: string
          nome?: string
          observacoes?: string | null
          ordem?: number | null
          quantidade_padrao?: number
          unidade?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "port_materiais_seguranca_excluido_por_fkey"
            columns: ["excluido_por"]
            isOneToOne: false
            referencedRelation: "core_perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "port_materiais_seguranca_excluido_por_fkey"
            columns: ["excluido_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      port_passagem_plantao: {
        Row: {
          codigo_formulario: string | null
          created_at: string | null
          criado_por: string | null
          data: string
          excluido_em: string | null
          excluido_por: string | null
          horario_fim: string
          horario_inicio: string
          id: string
          itens_conferidos: Json
          numero_protocolo: string
          observacoes: string | null
          status: string | null
          texto_declaracao: string | null
          turno: string
          updated_at: string | null
          vigilante_anterior01: string | null
          vigilante_anterior02: string | null
          vigilante_portaria: string
          vigilante_preenchedor: string
          vigilante_ronda01: string | null
          vigilante_ronda02: string | null
        }
        Insert: {
          codigo_formulario?: string | null
          created_at?: string | null
          criado_por?: string | null
          data?: string
          excluido_em?: string | null
          excluido_por?: string | null
          horario_fim?: string
          horario_inicio?: string
          id?: string
          itens_conferidos?: Json
          numero_protocolo: string
          observacoes?: string | null
          status?: string | null
          texto_declaracao?: string | null
          turno?: string
          updated_at?: string | null
          vigilante_anterior01?: string | null
          vigilante_anterior02?: string | null
          vigilante_portaria: string
          vigilante_preenchedor: string
          vigilante_ronda01?: string | null
          vigilante_ronda02?: string | null
        }
        Update: {
          codigo_formulario?: string | null
          created_at?: string | null
          criado_por?: string | null
          data?: string
          excluido_em?: string | null
          excluido_por?: string | null
          horario_fim?: string
          horario_inicio?: string
          id?: string
          itens_conferidos?: Json
          numero_protocolo?: string
          observacoes?: string | null
          status?: string | null
          texto_declaracao?: string | null
          turno?: string
          updated_at?: string | null
          vigilante_anterior01?: string | null
          vigilante_anterior02?: string | null
          vigilante_portaria?: string
          vigilante_preenchedor?: string
          vigilante_ronda01?: string | null
          vigilante_ronda02?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "port_passagem_plantao_excluido_por_fkey"
            columns: ["excluido_por"]
            isOneToOne: false
            referencedRelation: "core_perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "port_passagem_plantao_excluido_por_fkey"
            columns: ["excluido_por"]
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
          excluido_em: string | null
          excluido_por: string | null
          hora_chegada: string
          hora_saida: string | null
          id: string
          motorista: string
          numero_protocolo: string
          observacoes: string | null
          ocupacao: string | null
          placa: string
          rota: string | null
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
          excluido_em?: string | null
          excluido_por?: string | null
          hora_chegada: string
          hora_saida?: string | null
          id?: string
          motorista: string
          numero_protocolo: string
          observacoes?: string | null
          ocupacao?: string | null
          placa: string
          rota?: string | null
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
          excluido_em?: string | null
          excluido_por?: string | null
          hora_chegada?: string
          hora_saida?: string | null
          id?: string
          motorista?: string
          numero_protocolo?: string
          observacoes?: string | null
          ocupacao?: string | null
          placa?: string
          rota?: string | null
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
          {
            foreignKeyName: "port_registro_transportes_excluido_por_fkey"
            columns: ["excluido_por"]
            isOneToOne: false
            referencedRelation: "core_perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "port_registro_transportes_excluido_por_fkey"
            columns: ["excluido_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      port_relatorio_ocorrencias: {
        Row: {
          autorizado_por: string | null
          condutor_origem: string | null
          condutor_pessoa_id: string | null
          created_at: string
          descricao: string
          documento_cnh: string | null
          documento_cpf: string | null
          empresa: string | null
          excluido_em: string | null
          excluido_por: string | null
          fara_briefing: boolean
          foto_url: string | null
          hora_saida: string | null
          horario: string
          id: string
          local_setor: string
          motivo_observacao: string | null
          nome_pessoa: string | null
          pessoas: Json
          placa: string | null
          relatorio_id: string
          severidade: string
          status_permanencia: string | null
          tipo_registro: string
          veiculo_leve_id: string | null
          veiculo_leve_modelo: string | null
          vigilante: string
          vigilante_saida: string | null
        }
        Insert: {
          autorizado_por?: string | null
          condutor_origem?: string | null
          condutor_pessoa_id?: string | null
          created_at?: string
          descricao: string
          documento_cnh?: string | null
          documento_cpf?: string | null
          empresa?: string | null
          excluido_em?: string | null
          excluido_por?: string | null
          fara_briefing?: boolean
          foto_url?: string | null
          hora_saida?: string | null
          horario: string
          id?: string
          local_setor: string
          motivo_observacao?: string | null
          nome_pessoa?: string | null
          pessoas?: Json
          placa?: string | null
          relatorio_id: string
          severidade?: string
          status_permanencia?: string | null
          tipo_registro?: string
          veiculo_leve_id?: string | null
          veiculo_leve_modelo?: string | null
          vigilante: string
          vigilante_saida?: string | null
        }
        Update: {
          autorizado_por?: string | null
          condutor_origem?: string | null
          condutor_pessoa_id?: string | null
          created_at?: string
          descricao?: string
          documento_cnh?: string | null
          documento_cpf?: string | null
          empresa?: string | null
          excluido_em?: string | null
          excluido_por?: string | null
          fara_briefing?: boolean
          foto_url?: string | null
          hora_saida?: string | null
          horario?: string
          id?: string
          local_setor?: string
          motivo_observacao?: string | null
          nome_pessoa?: string | null
          pessoas?: Json
          placa?: string | null
          relatorio_id?: string
          severidade?: string
          status_permanencia?: string | null
          tipo_registro?: string
          veiculo_leve_id?: string | null
          veiculo_leve_modelo?: string | null
          vigilante?: string
          vigilante_saida?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "port_relatorio_ocorrencias_condutor_pessoa_id_fkey"
            columns: ["condutor_pessoa_id"]
            isOneToOne: false
            referencedRelation: "rh_pessoas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "port_relatorio_ocorrencias_condutor_pessoa_id_fkey"
            columns: ["condutor_pessoa_id"]
            isOneToOne: false
            referencedRelation: "vw_rh_rotas_colaboradores"
            referencedColumns: ["pessoa_id"]
          },
          {
            foreignKeyName: "port_relatorio_ocorrencias_condutor_pessoa_id_fkey"
            columns: ["condutor_pessoa_id"]
            isOneToOne: false
            referencedRelation: "vw_rh_treinamentos_vencimentos"
            referencedColumns: ["pessoa_id"]
          },
          {
            foreignKeyName: "port_relatorio_ocorrencias_excluido_por_fkey"
            columns: ["excluido_por"]
            isOneToOne: false
            referencedRelation: "core_perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "port_relatorio_ocorrencias_excluido_por_fkey"
            columns: ["excluido_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "port_relatorio_ocorrencias_relatorio_id_fkey"
            columns: ["relatorio_id"]
            isOneToOne: false
            referencedRelation: "port_relatorio_portaria"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "port_relatorio_ocorrencias_veiculo_leve_id_fkey"
            columns: ["veiculo_leve_id"]
            isOneToOne: false
            referencedRelation: "fac_veiculos_leves"
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
          excluido_em: string | null
          excluido_por: string | null
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
          excluido_em?: string | null
          excluido_por?: string | null
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
          excluido_em?: string | null
          excluido_por?: string | null
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
          {
            foreignKeyName: "port_relatorio_portaria_excluido_por_fkey"
            columns: ["excluido_por"]
            isOneToOne: false
            referencedRelation: "core_perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "port_relatorio_portaria_excluido_por_fkey"
            columns: ["excluido_por"]
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
          data_admissao: string | null
          data_nascimento: string | null
          empresa: string
          excluido_em: string | null
          excluido_por: string | null
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
          data_admissao?: string | null
          data_nascimento?: string | null
          empresa?: string
          excluido_em?: string | null
          excluido_por?: string | null
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
          data_admissao?: string | null
          data_nascimento?: string | null
          empresa?: string
          excluido_em?: string | null
          excluido_por?: string | null
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
          {
            foreignKeyName: "port_vigilantes_excluido_por_fkey"
            columns: ["excluido_por"]
            isOneToOne: false
            referencedRelation: "core_perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "port_vigilantes_excluido_por_fkey"
            columns: ["excluido_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      prod_alteracoes: {
        Row: {
          alteracoes: Json
          alterado_por_id: string | null
          alterado_por_nome: string | null
          codigo: string | null
          created_at: string
          id: string
          lancamento_id: string
          resumo: string | null
        }
        Insert: {
          alteracoes?: Json
          alterado_por_id?: string | null
          alterado_por_nome?: string | null
          codigo?: string | null
          created_at?: string
          id?: string
          lancamento_id: string
          resumo?: string | null
        }
        Update: {
          alteracoes?: Json
          alterado_por_id?: string | null
          alterado_por_nome?: string | null
          codigo?: string | null
          created_at?: string
          id?: string
          lancamento_id?: string
          resumo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prod_alteracoes_lancamento_id_fkey"
            columns: ["lancamento_id"]
            isOneToOne: false
            referencedRelation: "prod_lancamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prod_alteracoes_lancamento_id_fkey"
            columns: ["lancamento_id"]
            isOneToOne: false
            referencedRelation: "prod_pendencias"
            referencedColumns: ["lancamento_id"]
          },
        ]
      }
      prod_apt_etapas: {
        Row: {
          ativa: boolean
          created_at: string
          id: string
          nave: string
          nome: string
          ordem: number
        }
        Insert: {
          ativa?: boolean
          created_at?: string
          id: string
          nave: string
          nome: string
          ordem: number
        }
        Update: {
          ativa?: boolean
          created_at?: string
          id?: string
          nave?: string
          nome?: string
          ordem?: number
        }
        Relationships: []
      }
      prod_apt_lancamento_itens: {
        Row: {
          etapa_id: string
          lancamento_id: string
          quantidade: number
        }
        Insert: {
          etapa_id: string
          lancamento_id: string
          quantidade: number
        }
        Update: {
          etapa_id?: string
          lancamento_id?: string
          quantidade?: number
        }
        Relationships: [
          {
            foreignKeyName: "prod_apt_lancamento_itens_etapa_id_fkey"
            columns: ["etapa_id"]
            isOneToOne: false
            referencedRelation: "prod_apt_etapas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prod_apt_lancamento_itens_lancamento_id_fkey"
            columns: ["lancamento_id"]
            isOneToOne: false
            referencedRelation: "prod_apt_lancamentos"
            referencedColumns: ["id"]
          },
        ]
      }
      prod_apt_lancamentos: {
        Row: {
          atualizado_por_nome: string | null
          codigo: string
          created_at: string
          criado_por: string | null
          criado_por_nome: string | null
          data: string
          excluido_em: string | null
          excluido_por: string | null
          id: string
          nave: string
          observacao: string | null
          updated_at: string
        }
        Insert: {
          atualizado_por_nome?: string | null
          codigo: string
          created_at?: string
          criado_por?: string | null
          criado_por_nome?: string | null
          data: string
          excluido_em?: string | null
          excluido_por?: string | null
          id: string
          nave: string
          observacao?: string | null
          updated_at?: string
        }
        Update: {
          atualizado_por_nome?: string | null
          codigo?: string
          created_at?: string
          criado_por?: string | null
          criado_por_nome?: string | null
          data?: string
          excluido_em?: string | null
          excluido_por?: string | null
          id?: string
          nave?: string
          observacao?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "prod_apt_lancamentos_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "core_perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prod_apt_lancamentos_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      prod_apt_programacao: {
        Row: {
          ano: number
          atualizado_por: string | null
          atualizado_por_nome: string | null
          etapa_id: string
          quantidade: number
          semana: number
          updated_at: string
        }
        Insert: {
          ano: number
          atualizado_por?: string | null
          atualizado_por_nome?: string | null
          etapa_id: string
          quantidade: number
          semana: number
          updated_at?: string
        }
        Update: {
          ano?: number
          atualizado_por?: string | null
          atualizado_por_nome?: string | null
          etapa_id?: string
          quantidade?: number
          semana?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "prod_apt_programacao_etapa_id_fkey"
            columns: ["etapa_id"]
            isOneToOne: false
            referencedRelation: "prod_apt_etapas"
            referencedColumns: ["id"]
          },
        ]
      }
      prod_defeitos: {
        Row: {
          ativo: boolean
          codigo: string
          created_at: string
          descricao: string | null
          id: string
          nome: string
        }
        Insert: {
          ativo?: boolean
          codigo: string
          created_at?: string
          descricao?: string | null
          id?: string
          nome: string
        }
        Update: {
          ativo?: boolean
          codigo?: string
          created_at?: string
          descricao?: string | null
          id?: string
          nome?: string
        }
        Relationships: []
      }
      prod_etapas: {
        Row: {
          ativa: boolean
          created_at: string
          etapa_anterior_id: string | null
          exige_medicao: boolean
          id: string
          nome: string
          ordem: number
          prefixo_codigo: string
        }
        Insert: {
          ativa?: boolean
          created_at?: string
          etapa_anterior_id?: string | null
          exige_medicao?: boolean
          id: string
          nome: string
          ordem: number
          prefixo_codigo: string
        }
        Update: {
          ativa?: boolean
          created_at?: string
          etapa_anterior_id?: string | null
          exige_medicao?: boolean
          id?: string
          nome?: string
          ordem?: number
          prefixo_codigo?: string
        }
        Relationships: [
          {
            foreignKeyName: "prod_etapas_etapa_anterior_id_fkey"
            columns: ["etapa_anterior_id"]
            isOneToOne: false
            referencedRelation: "prod_etapas"
            referencedColumns: ["id"]
          },
        ]
      }
      prod_evs_medicoes: {
        Row: {
          altura_externa: number | null
          altura_interna: number | null
          completo: boolean
          comprimento: number | null
          created_at: string
          curvatura: number | null
          fora_tolerancia: Json
          lancamento_id: string
          medicoes: Json
          offset: number | null
          perimetro: number | null
          updated_at: string
        }
        Insert: {
          altura_externa?: number | null
          altura_interna?: number | null
          completo?: boolean
          comprimento?: number | null
          created_at?: string
          curvatura?: number | null
          fora_tolerancia?: Json
          lancamento_id: string
          medicoes?: Json
          offset?: number | null
          perimetro?: number | null
          updated_at?: string
        }
        Update: {
          altura_externa?: number | null
          altura_interna?: number | null
          completo?: boolean
          comprimento?: number | null
          created_at?: string
          curvatura?: number | null
          fora_tolerancia?: Json
          lancamento_id?: string
          medicoes?: Json
          offset?: number | null
          perimetro?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "prod_evs_medicoes_lancamento_id_fkey"
            columns: ["lancamento_id"]
            isOneToOne: true
            referencedRelation: "prod_lancamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prod_evs_medicoes_lancamento_id_fkey"
            columns: ["lancamento_id"]
            isOneToOne: true
            referencedRelation: "prod_pendencias"
            referencedColumns: ["lancamento_id"]
          },
        ]
      }
      prod_flange_medicoes: {
        Row: {
          aceite_pendencia: boolean
          completo: boolean
          created_at: string
          lancamento_id: string
          offsets: Json
          raiz_1: number | null
          raiz_2: number | null
          raiz_3: number | null
          raiz_4: number | null
          updated_at: string
        }
        Insert: {
          aceite_pendencia?: boolean
          completo?: boolean
          created_at?: string
          lancamento_id: string
          offsets?: Json
          raiz_1?: number | null
          raiz_2?: number | null
          raiz_3?: number | null
          raiz_4?: number | null
          updated_at?: string
        }
        Update: {
          aceite_pendencia?: boolean
          completo?: boolean
          created_at?: string
          lancamento_id?: string
          offsets?: Json
          raiz_1?: number | null
          raiz_2?: number | null
          raiz_3?: number | null
          raiz_4?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "prod_flange_medicoes_lancamento_id_fkey"
            columns: ["lancamento_id"]
            isOneToOne: true
            referencedRelation: "prod_lancamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prod_flange_medicoes_lancamento_id_fkey"
            columns: ["lancamento_id"]
            isOneToOne: true
            referencedRelation: "prod_pendencias"
            referencedColumns: ["lancamento_id"]
          },
        ]
      }
      prod_lancamentos: {
        Row: {
          anterior_id: string | null
          assinatura_inspetor: string | null
          assinatura_inspetor_em: string | null
          assinatura_inspetor_por: string | null
          client_id: string
          codigo: string
          created_at: string
          criado_por: string | null
          criado_por_nome: string | null
          data_digitacao: string
          data_liberacao: string
          defeito_id: string | null
          etapa_id: string
          evidencias: Json
          excluido_em: string | null
          excluido_por: string | null
          execucao_empresa: string | null
          executante_nome: string | null
          executante_pessoa_id: string | null
          hora: string | null
          id: string
          inspetor_nome: string | null
          inspetor_pessoa_id: string | null
          motivo_refugo: string | null
          observacao: string | null
          projeto: string
          rastreabilidade: string | null
          recurso_id: string | null
          refugado_em: string | null
          status: string
          tentativa: number
          torre_numero: number
          tramo: string
          turno: string | null
          updated_at: string
          virola: string
          virola_id: string
        }
        Insert: {
          anterior_id?: string | null
          assinatura_inspetor?: string | null
          assinatura_inspetor_em?: string | null
          assinatura_inspetor_por?: string | null
          client_id: string
          codigo: string
          created_at?: string
          criado_por?: string | null
          criado_por_nome?: string | null
          data_digitacao?: string
          data_liberacao: string
          defeito_id?: string | null
          etapa_id: string
          evidencias?: Json
          excluido_em?: string | null
          excluido_por?: string | null
          execucao_empresa?: string | null
          executante_nome?: string | null
          executante_pessoa_id?: string | null
          hora?: string | null
          id?: string
          inspetor_nome?: string | null
          inspetor_pessoa_id?: string | null
          motivo_refugo?: string | null
          observacao?: string | null
          projeto?: string
          rastreabilidade?: string | null
          recurso_id?: string | null
          refugado_em?: string | null
          status: string
          tentativa?: number
          torre_numero: number
          tramo: string
          turno?: string | null
          updated_at?: string
          virola: string
          virola_id: string
        }
        Update: {
          anterior_id?: string | null
          assinatura_inspetor?: string | null
          assinatura_inspetor_em?: string | null
          assinatura_inspetor_por?: string | null
          client_id?: string
          codigo?: string
          created_at?: string
          criado_por?: string | null
          criado_por_nome?: string | null
          data_digitacao?: string
          data_liberacao?: string
          defeito_id?: string | null
          etapa_id?: string
          evidencias?: Json
          excluido_em?: string | null
          excluido_por?: string | null
          execucao_empresa?: string | null
          executante_nome?: string | null
          executante_pessoa_id?: string | null
          hora?: string | null
          id?: string
          inspetor_nome?: string | null
          inspetor_pessoa_id?: string | null
          motivo_refugo?: string | null
          observacao?: string | null
          projeto?: string
          rastreabilidade?: string | null
          recurso_id?: string | null
          refugado_em?: string | null
          status?: string
          tentativa?: number
          torre_numero?: number
          tramo?: string
          turno?: string | null
          updated_at?: string
          virola?: string
          virola_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prod_lancamentos_anterior_id_fkey"
            columns: ["anterior_id"]
            isOneToOne: false
            referencedRelation: "prod_lancamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prod_lancamentos_anterior_id_fkey"
            columns: ["anterior_id"]
            isOneToOne: false
            referencedRelation: "prod_pendencias"
            referencedColumns: ["lancamento_id"]
          },
          {
            foreignKeyName: "prod_lancamentos_assinatura_inspetor_por_fkey"
            columns: ["assinatura_inspetor_por"]
            isOneToOne: false
            referencedRelation: "core_perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prod_lancamentos_assinatura_inspetor_por_fkey"
            columns: ["assinatura_inspetor_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prod_lancamentos_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "core_perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prod_lancamentos_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prod_lancamentos_defeito_id_fkey"
            columns: ["defeito_id"]
            isOneToOne: false
            referencedRelation: "prod_defeitos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prod_lancamentos_etapa_id_fkey"
            columns: ["etapa_id"]
            isOneToOne: false
            referencedRelation: "prod_etapas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prod_lancamentos_excluido_por_fkey"
            columns: ["excluido_por"]
            isOneToOne: false
            referencedRelation: "core_perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prod_lancamentos_excluido_por_fkey"
            columns: ["excluido_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prod_lancamentos_executante_pessoa_id_fkey"
            columns: ["executante_pessoa_id"]
            isOneToOne: false
            referencedRelation: "rh_pessoas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prod_lancamentos_executante_pessoa_id_fkey"
            columns: ["executante_pessoa_id"]
            isOneToOne: false
            referencedRelation: "vw_rh_rotas_colaboradores"
            referencedColumns: ["pessoa_id"]
          },
          {
            foreignKeyName: "prod_lancamentos_executante_pessoa_id_fkey"
            columns: ["executante_pessoa_id"]
            isOneToOne: false
            referencedRelation: "vw_rh_treinamentos_vencimentos"
            referencedColumns: ["pessoa_id"]
          },
          {
            foreignKeyName: "prod_lancamentos_inspetor_pessoa_id_fkey"
            columns: ["inspetor_pessoa_id"]
            isOneToOne: false
            referencedRelation: "rh_pessoas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prod_lancamentos_inspetor_pessoa_id_fkey"
            columns: ["inspetor_pessoa_id"]
            isOneToOne: false
            referencedRelation: "vw_rh_rotas_colaboradores"
            referencedColumns: ["pessoa_id"]
          },
          {
            foreignKeyName: "prod_lancamentos_inspetor_pessoa_id_fkey"
            columns: ["inspetor_pessoa_id"]
            isOneToOne: false
            referencedRelation: "vw_rh_treinamentos_vencimentos"
            referencedColumns: ["pessoa_id"]
          },
          {
            foreignKeyName: "prod_lancamentos_recurso_id_fkey"
            columns: ["recurso_id"]
            isOneToOne: false
            referencedRelation: "prod_recursos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prod_lancamentos_virola_id_fkey"
            columns: ["virola_id"]
            isOneToOne: false
            referencedRelation: "prod_virolas"
            referencedColumns: ["id"]
          },
        ]
      }
      prod_plano_expedicao: {
        Row: {
          atualizado_em: string
          atualizado_por: string | null
          data_carregamento: string | null
          data_expedicao: string | null
          id: string
          identificador: number | null
          nf_expedicao_emitida: boolean
          nf_faturamento_emitida: boolean
          nf_gw_emitida: boolean
          observacao: string | null
          semana: number
          status: string
          torre_numero: number
          tramo: string
        }
        Insert: {
          atualizado_em?: string
          atualizado_por?: string | null
          data_carregamento?: string | null
          data_expedicao?: string | null
          id?: string
          identificador?: number | null
          nf_expedicao_emitida?: boolean
          nf_faturamento_emitida?: boolean
          nf_gw_emitida?: boolean
          observacao?: string | null
          semana: number
          status?: string
          torre_numero: number
          tramo: string
        }
        Update: {
          atualizado_em?: string
          atualizado_por?: string | null
          data_carregamento?: string | null
          data_expedicao?: string | null
          id?: string
          identificador?: number | null
          nf_expedicao_emitida?: boolean
          nf_faturamento_emitida?: boolean
          nf_gw_emitida?: boolean
          observacao?: string | null
          semana?: number
          status?: string
          torre_numero?: number
          tramo?: string
        }
        Relationships: []
      }
      prod_plano_expedicao_historico: {
        Row: {
          alterado_em: string
          alterado_por: string | null
          antes: Json
          depois: Json
          id: string
          plano_id: string
        }
        Insert: {
          alterado_em?: string
          alterado_por?: string | null
          antes: Json
          depois: Json
          id?: string
          plano_id: string
        }
        Update: {
          alterado_em?: string
          alterado_por?: string | null
          antes?: Json
          depois?: Json
          id?: string
          plano_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prod_plano_expedicao_historico_plano_id_fkey"
            columns: ["plano_id"]
            isOneToOne: false
            referencedRelation: "prod_plano_expedicao"
            referencedColumns: ["id"]
          },
        ]
      }
      prod_recursos: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          nome: string
          tipo: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome: string
          tipo: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome?: string
          tipo?: string
        }
        Relationships: []
      }
      prod_tolerancias: {
        Row: {
          ativa: boolean
          created_at: string
          etapa_id: string
          id: string
          maximo: number | null
          medida: string
          minimo: number | null
          tramo: string | null
          unidade: string
          updated_at: string
          virola: string | null
        }
        Insert: {
          ativa?: boolean
          created_at?: string
          etapa_id: string
          id?: string
          maximo?: number | null
          medida: string
          minimo?: number | null
          tramo?: string | null
          unidade?: string
          updated_at?: string
          virola?: string | null
        }
        Update: {
          ativa?: boolean
          created_at?: string
          etapa_id?: string
          id?: string
          maximo?: number | null
          medida?: string
          minimo?: number | null
          tramo?: string | null
          unidade?: string
          updated_at?: string
          virola?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prod_tolerancias_etapa_id_fkey"
            columns: ["etapa_id"]
            isOneToOne: false
            referencedRelation: "prod_etapas"
            referencedColumns: ["id"]
          },
        ]
      }
      prod_tramos_entrega: {
        Row: {
          created_at: string
          data_entrada_etapa: string
          dias_espera: number
          etapa_categoria: string
          etapa_nome: string
          id: string
          observacao: string | null
          projeto: string
          serie: number
          status_aguardando: string | null
          subprojeto_id: string | null
          torre_numero: number
          tramo: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          data_entrada_etapa?: string
          dias_espera?: number
          etapa_categoria?: string
          etapa_nome?: string
          id: string
          observacao?: string | null
          projeto?: string
          serie: number
          status_aguardando?: string | null
          subprojeto_id?: string | null
          torre_numero: number
          tramo: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          data_entrada_etapa?: string
          dias_espera?: number
          etapa_categoria?: string
          etapa_nome?: string
          id?: string
          observacao?: string | null
          projeto?: string
          serie?: number
          status_aguardando?: string | null
          subprojeto_id?: string | null
          torre_numero?: number
          tramo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "prod_tramos_entrega_subprojeto_id_fkey"
            columns: ["subprojeto_id"]
            isOneToOne: false
            referencedRelation: "proj_subprojetos"
            referencedColumns: ["id"]
          },
        ]
      }
      prod_tramos_entrega_checklist: {
        Row: {
          concluida_em: string
          concluida_por: string | null
          created_at: string
          etapa_codigo: string
          excluido_em: string | null
          id: string
          observacao: string | null
          tramo_entrega_id: string
        }
        Insert: {
          concluida_em?: string
          concluida_por?: string | null
          created_at?: string
          etapa_codigo: string
          excluido_em?: string | null
          id?: string
          observacao?: string | null
          tramo_entrega_id: string
        }
        Update: {
          concluida_em?: string
          concluida_por?: string | null
          created_at?: string
          etapa_codigo?: string
          excluido_em?: string | null
          id?: string
          observacao?: string | null
          tramo_entrega_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prod_tramos_entrega_checklist_tramo_entrega_id_fkey"
            columns: ["tramo_entrega_id"]
            isOneToOne: false
            referencedRelation: "prod_tramos_entrega"
            referencedColumns: ["id"]
          },
        ]
      }
      prod_ut_reparos: {
        Row: {
          amplitude: number | null
          angulo: number | null
          comprimento: number | null
          created_at: string
          defeito_id: string | null
          distancia_x: number | null
          id: string
          lancamento_id: string
          largura: number | null
          observacao: string | null
          procedimento: string | null
          profundidade: number | null
          reparado_em: string | null
          reparado_por_nome: string | null
          reparado_por_pessoa_id: string | null
          sequencia: number
        }
        Insert: {
          amplitude?: number | null
          angulo?: number | null
          comprimento?: number | null
          created_at?: string
          defeito_id?: string | null
          distancia_x?: number | null
          id?: string
          lancamento_id: string
          largura?: number | null
          observacao?: string | null
          procedimento?: string | null
          profundidade?: number | null
          reparado_em?: string | null
          reparado_por_nome?: string | null
          reparado_por_pessoa_id?: string | null
          sequencia: number
        }
        Update: {
          amplitude?: number | null
          angulo?: number | null
          comprimento?: number | null
          created_at?: string
          defeito_id?: string | null
          distancia_x?: number | null
          id?: string
          lancamento_id?: string
          largura?: number | null
          observacao?: string | null
          procedimento?: string | null
          profundidade?: number | null
          reparado_em?: string | null
          reparado_por_nome?: string | null
          reparado_por_pessoa_id?: string | null
          sequencia?: number
        }
        Relationships: [
          {
            foreignKeyName: "prod_ut_reparos_defeito_id_fkey"
            columns: ["defeito_id"]
            isOneToOne: false
            referencedRelation: "prod_defeitos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prod_ut_reparos_lancamento_id_fkey"
            columns: ["lancamento_id"]
            isOneToOne: false
            referencedRelation: "prod_lancamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prod_ut_reparos_lancamento_id_fkey"
            columns: ["lancamento_id"]
            isOneToOne: false
            referencedRelation: "prod_pendencias"
            referencedColumns: ["lancamento_id"]
          },
          {
            foreignKeyName: "prod_ut_reparos_reparado_por_pessoa_id_fkey"
            columns: ["reparado_por_pessoa_id"]
            isOneToOne: false
            referencedRelation: "rh_pessoas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prod_ut_reparos_reparado_por_pessoa_id_fkey"
            columns: ["reparado_por_pessoa_id"]
            isOneToOne: false
            referencedRelation: "vw_rh_rotas_colaboradores"
            referencedColumns: ["pessoa_id"]
          },
          {
            foreignKeyName: "prod_ut_reparos_reparado_por_pessoa_id_fkey"
            columns: ["reparado_por_pessoa_id"]
            isOneToOne: false
            referencedRelation: "vw_rh_treinamentos_vencimentos"
            referencedColumns: ["pessoa_id"]
          },
        ]
      }
      prod_virolas: {
        Row: {
          created_at: string
          etapa_atual_id: string | null
          id: string
          ordem: number
          projeto: string
          status_atual: string
          subprojeto_id: string | null
          torre_numero: number
          tramo: string
          tramo_unidade_id: string
          updated_at: string
          virola: string
        }
        Insert: {
          created_at?: string
          etapa_atual_id?: string | null
          id: string
          ordem: number
          projeto?: string
          status_atual?: string
          subprojeto_id?: string | null
          torre_numero: number
          tramo: string
          tramo_unidade_id: string
          updated_at?: string
          virola: string
        }
        Update: {
          created_at?: string
          etapa_atual_id?: string | null
          id?: string
          ordem?: number
          projeto?: string
          status_atual?: string
          subprojeto_id?: string | null
          torre_numero?: number
          tramo?: string
          tramo_unidade_id?: string
          updated_at?: string
          virola?: string
        }
        Relationships: [
          {
            foreignKeyName: "prod_virolas_etapa_atual_id_fkey"
            columns: ["etapa_atual_id"]
            isOneToOne: false
            referencedRelation: "prod_etapas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prod_virolas_subprojeto_id_fkey"
            columns: ["subprojeto_id"]
            isOneToOne: false
            referencedRelation: "proj_subprojetos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prod_virolas_tramo_unidade_id_fkey"
            columns: ["tramo_unidade_id"]
            isOneToOne: false
            referencedRelation: "proj_tramos_gwjaco"
            referencedColumns: ["id"]
          },
        ]
      }
      proj_bom_gwjaco: {
        Row: {
          cod_sap: string | null
          codigo_equivalente_qingdao: string | null
          created_at: string | null
          delivery_at: string | null
          descricao: string | null
          description: string | null
          each_weight_kg: number | null
          find_number: string | null
          group: string | null
          id: number
          kit_atlanta: string | null
          level: number | null
          part_number: string | null
          projeto: string
          quantity: number | null
          revision: string | null
          section: string | null
          source: string | null
          total_weight_kg: number | null
          uom: string | null
        }
        Insert: {
          cod_sap?: string | null
          codigo_equivalente_qingdao?: string | null
          created_at?: string | null
          delivery_at?: string | null
          descricao?: string | null
          description?: string | null
          each_weight_kg?: number | null
          find_number?: string | null
          group?: string | null
          id?: number
          kit_atlanta?: string | null
          level?: number | null
          part_number?: string | null
          projeto?: string
          quantity?: number | null
          revision?: string | null
          section?: string | null
          source?: string | null
          total_weight_kg?: number | null
          uom?: string | null
        }
        Update: {
          cod_sap?: string | null
          codigo_equivalente_qingdao?: string | null
          created_at?: string | null
          delivery_at?: string | null
          descricao?: string | null
          description?: string | null
          each_weight_kg?: number | null
          find_number?: string | null
          group?: string | null
          id?: number
          kit_atlanta?: string | null
          level?: number | null
          part_number?: string | null
          projeto?: string
          quantity?: number | null
          revision?: string | null
          section?: string | null
          source?: string | null
          total_weight_kg?: number | null
          uom?: string | null
        }
        Relationships: []
      }
      proj_entregas_producao: {
        Row: {
          codigo: string
          created_at: string
          criado_por_id: string | null
          criado_por_nome: string | null
          data: string
          excluido_em: string | null
          excluido_por: string | null
          id: string
          kit_id: string
          observacao: string | null
          projeto: string
          recebido_por_nome: string
          subprojeto_id: string | null
          tramo: string
          tramo_unidade_id: string
          turno: string | null
        }
        Insert: {
          codigo: string
          created_at?: string
          criado_por_id?: string | null
          criado_por_nome?: string | null
          data: string
          excluido_em?: string | null
          excluido_por?: string | null
          id?: string
          kit_id: string
          observacao?: string | null
          projeto?: string
          recebido_por_nome: string
          subprojeto_id?: string | null
          tramo: string
          tramo_unidade_id: string
          turno?: string | null
        }
        Update: {
          codigo?: string
          created_at?: string
          criado_por_id?: string | null
          criado_por_nome?: string | null
          data?: string
          excluido_em?: string | null
          excluido_por?: string | null
          id?: string
          kit_id?: string
          observacao?: string | null
          projeto?: string
          recebido_por_nome?: string
          subprojeto_id?: string | null
          tramo?: string
          tramo_unidade_id?: string
          turno?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proj_entregas_producao_kit_id_fkey"
            columns: ["kit_id"]
            isOneToOne: false
            referencedRelation: "proj_kits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proj_entregas_producao_subprojeto_id_fkey"
            columns: ["subprojeto_id"]
            isOneToOne: false
            referencedRelation: "proj_subprojetos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proj_entregas_producao_tramo_unidade_id_fkey"
            columns: ["tramo_unidade_id"]
            isOneToOne: false
            referencedRelation: "proj_tramos_gwjaco"
            referencedColumns: ["id"]
          },
        ]
      }
      proj_itens: {
        Row: {
          cod_sap: string | null
          created_at: string
          descricao: string | null
          description: string | null
          estoque_minimo: number
          fornecedor: string | null
          id: string
          ignorar_premontagem: boolean
          localizador: string | null
          observacao: string | null
          part_number: string
          part_number_norm: string
          peso_unitario_kg: number | null
          projeto: string
          uom: string | null
          updated_at: string
        }
        Insert: {
          cod_sap?: string | null
          created_at?: string
          descricao?: string | null
          description?: string | null
          estoque_minimo?: number
          fornecedor?: string | null
          id?: string
          ignorar_premontagem?: boolean
          localizador?: string | null
          observacao?: string | null
          part_number: string
          part_number_norm: string
          peso_unitario_kg?: number | null
          projeto?: string
          uom?: string | null
          updated_at?: string
        }
        Update: {
          cod_sap?: string | null
          created_at?: string
          descricao?: string | null
          description?: string | null
          estoque_minimo?: number
          fornecedor?: string | null
          id?: string
          ignorar_premontagem?: boolean
          localizador?: string | null
          observacao?: string | null
          part_number?: string
          part_number_norm?: string
          peso_unitario_kg?: number | null
          projeto?: string
          uom?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      proj_kits: {
        Row: {
          codigo: string | null
          concluido_em: string | null
          concluido_por_nome: string | null
          created_at: string
          criado_por_id: string | null
          criado_por_nome: string | null
          entrega_id: string | null
          entregue_em: string | null
          excluido_em: string | null
          excluido_por: string | null
          id: string
          nao_conformidade: string | null
          observacao: string | null
          ordem_id: string | null
          projeto: string
          qualidade_ok: boolean | null
          rastreio: string
          status: string
          tramo: string
          tramo_unidade_id: string
        }
        Insert: {
          codigo?: string | null
          concluido_em?: string | null
          concluido_por_nome?: string | null
          created_at?: string
          criado_por_id?: string | null
          criado_por_nome?: string | null
          entrega_id?: string | null
          entregue_em?: string | null
          excluido_em?: string | null
          excluido_por?: string | null
          id?: string
          nao_conformidade?: string | null
          observacao?: string | null
          ordem_id?: string | null
          projeto?: string
          qualidade_ok?: boolean | null
          rastreio: string
          status?: string
          tramo: string
          tramo_unidade_id: string
        }
        Update: {
          codigo?: string | null
          concluido_em?: string | null
          concluido_por_nome?: string | null
          created_at?: string
          criado_por_id?: string | null
          criado_por_nome?: string | null
          entrega_id?: string | null
          entregue_em?: string | null
          excluido_em?: string | null
          excluido_por?: string | null
          id?: string
          nao_conformidade?: string | null
          observacao?: string | null
          ordem_id?: string | null
          projeto?: string
          qualidade_ok?: boolean | null
          rastreio?: string
          status?: string
          tramo?: string
          tramo_unidade_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "proj_kits_ordem_id_fkey"
            columns: ["ordem_id"]
            isOneToOne: false
            referencedRelation: "proj_ordens_premontagem"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proj_kits_tramo_unidade_id_fkey"
            columns: ["tramo_unidade_id"]
            isOneToOne: false
            referencedRelation: "proj_tramos_gwjaco"
            referencedColumns: ["id"]
          },
        ]
      }
      proj_matriz_autonomia_kits: {
        Row: {
          atualizado_por_nome: string | null
          created_at: string
          id: string
          observacao: string | null
          projeto: string
          serie: string | null
          status: number
          subkit: string
          subprojeto_id: string
          torre_numero: number
          tramo: string
          updated_at: string
        }
        Insert: {
          atualizado_por_nome?: string | null
          created_at?: string
          id?: string
          observacao?: string | null
          projeto?: string
          serie?: string | null
          status: number
          subkit: string
          subprojeto_id?: string
          torre_numero: number
          tramo: string
          updated_at?: string
        }
        Update: {
          atualizado_por_nome?: string | null
          created_at?: string
          id?: string
          observacao?: string | null
          projeto?: string
          serie?: string | null
          status?: number
          subkit?: string
          subprojeto_id?: string
          torre_numero?: number
          tramo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proj_matriz_autonomia_kits_subprojeto_id_fkey"
            columns: ["subprojeto_id"]
            isOneToOne: false
            referencedRelation: "proj_subprojetos"
            referencedColumns: ["id"]
          },
        ]
      }
      proj_matriz_autonomia_log: {
        Row: {
          alteracoes: Json
          alterado_por_id: string | null
          alterado_por_nome: string | null
          created_at: string
          id: string
          resumo: string | null
          subkit: string
          subprojeto_id: string
          torre_numero: number
          tramo: string
        }
        Insert: {
          alteracoes?: Json
          alterado_por_id?: string | null
          alterado_por_nome?: string | null
          created_at?: string
          id?: string
          resumo?: string | null
          subkit: string
          subprojeto_id: string
          torre_numero: number
          tramo: string
        }
        Update: {
          alteracoes?: Json
          alterado_por_id?: string | null
          alterado_por_nome?: string | null
          created_at?: string
          id?: string
          resumo?: string | null
          subkit?: string
          subprojeto_id?: string
          torre_numero?: number
          tramo?: string
        }
        Relationships: []
      }
      proj_movimentos: {
        Row: {
          bom_linha_id: number | null
          created_at: string
          criado_por_id: string | null
          criado_por_nome: string | null
          documento_codigo: string | null
          documento_id: string | null
          documento_tipo: string | null
          excluido_em: string | null
          excluido_por: string | null
          id: string
          item_id: string
          observacao: string | null
          origem_pai_pn: string | null
          projeto: string
          quantidade: number
          secao: string | null
          tipo: string
          tramo: string | null
          tramo_unidade_id: string | null
        }
        Insert: {
          bom_linha_id?: number | null
          created_at?: string
          criado_por_id?: string | null
          criado_por_nome?: string | null
          documento_codigo?: string | null
          documento_id?: string | null
          documento_tipo?: string | null
          excluido_em?: string | null
          excluido_por?: string | null
          id?: string
          item_id: string
          observacao?: string | null
          origem_pai_pn?: string | null
          projeto?: string
          quantidade: number
          secao?: string | null
          tipo: string
          tramo?: string | null
          tramo_unidade_id?: string | null
        }
        Update: {
          bom_linha_id?: number | null
          created_at?: string
          criado_por_id?: string | null
          criado_por_nome?: string | null
          documento_codigo?: string | null
          documento_id?: string | null
          documento_tipo?: string | null
          excluido_em?: string | null
          excluido_por?: string | null
          id?: string
          item_id?: string
          observacao?: string | null
          origem_pai_pn?: string | null
          projeto?: string
          quantidade?: number
          secao?: string | null
          tipo?: string
          tramo?: string | null
          tramo_unidade_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proj_movimentos_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "proj_itens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proj_movimentos_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "vw_proj_saldo_almox"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "proj_movimentos_tramo_unidade_id_fkey"
            columns: ["tramo_unidade_id"]
            isOneToOne: false
            referencedRelation: "proj_tramos_gwjaco"
            referencedColumns: ["id"]
          },
        ]
      }
      proj_notas_entrada: {
        Row: {
          codigo: string
          created_at: string
          criado_por_id: string | null
          criado_por_nome: string | null
          data_entrada: string
          excluido_em: string | null
          excluido_por: string | null
          fornecedor: string
          id: string
          numero_nf: string
          observacao: string | null
          projeto: string
          subprojeto_id: string | null
          total_itens: number
          total_quantidade: number
        }
        Insert: {
          codigo: string
          created_at?: string
          criado_por_id?: string | null
          criado_por_nome?: string | null
          data_entrada: string
          excluido_em?: string | null
          excluido_por?: string | null
          fornecedor: string
          id?: string
          numero_nf: string
          observacao?: string | null
          projeto?: string
          subprojeto_id?: string | null
          total_itens?: number
          total_quantidade?: number
        }
        Update: {
          codigo?: string
          created_at?: string
          criado_por_id?: string | null
          criado_por_nome?: string | null
          data_entrada?: string
          excluido_em?: string | null
          excluido_por?: string | null
          fornecedor?: string
          id?: string
          numero_nf?: string
          observacao?: string | null
          projeto?: string
          subprojeto_id?: string | null
          total_itens?: number
          total_quantidade?: number
        }
        Relationships: [
          {
            foreignKeyName: "proj_notas_entrada_subprojeto_id_fkey"
            columns: ["subprojeto_id"]
            isOneToOne: false
            referencedRelation: "proj_subprojetos"
            referencedColumns: ["id"]
          },
        ]
      }
      proj_notas_entrada_pais: {
        Row: {
          bom_linha_id: number | null
          cod_sap: string | null
          created_at: string
          descricao: string | null
          divergencia: boolean
          explodir: boolean
          id: string
          nota_id: string
          part_number: string | null
          quantidade_recebida: number
          torres_equivalentes: number | null
        }
        Insert: {
          bom_linha_id?: number | null
          cod_sap?: string | null
          created_at?: string
          descricao?: string | null
          divergencia?: boolean
          explodir?: boolean
          id?: string
          nota_id: string
          part_number?: string | null
          quantidade_recebida: number
          torres_equivalentes?: number | null
        }
        Update: {
          bom_linha_id?: number | null
          cod_sap?: string | null
          created_at?: string
          descricao?: string | null
          divergencia?: boolean
          explodir?: boolean
          id?: string
          nota_id?: string
          part_number?: string | null
          quantidade_recebida?: number
          torres_equivalentes?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "proj_notas_entrada_pais_nota_id_fkey"
            columns: ["nota_id"]
            isOneToOne: false
            referencedRelation: "proj_notas_entrada"
            referencedColumns: ["id"]
          },
        ]
      }
      proj_ordens_premontagem: {
        Row: {
          codigo: string
          concluida_em: string | null
          concluida_por_nome: string | null
          created_at: string
          criado_por_id: string | null
          criado_por_nome: string | null
          excluido_em: string | null
          excluido_por: string | null
          id: string
          observacao: string | null
          projeto: string
          quantidade_kits: number
          separacao_confirmada_em: string | null
          separacao_confirmada_por_nome: string | null
          status: string
          subprojeto_id: string | null
          tramo: string
          zona: string | null
        }
        Insert: {
          codigo: string
          concluida_em?: string | null
          concluida_por_nome?: string | null
          created_at?: string
          criado_por_id?: string | null
          criado_por_nome?: string | null
          excluido_em?: string | null
          excluido_por?: string | null
          id?: string
          observacao?: string | null
          projeto?: string
          quantidade_kits: number
          separacao_confirmada_em?: string | null
          separacao_confirmada_por_nome?: string | null
          status?: string
          subprojeto_id?: string | null
          tramo: string
          zona?: string | null
        }
        Update: {
          codigo?: string
          concluida_em?: string | null
          concluida_por_nome?: string | null
          created_at?: string
          criado_por_id?: string | null
          criado_por_nome?: string | null
          excluido_em?: string | null
          excluido_por?: string | null
          id?: string
          observacao?: string | null
          projeto?: string
          quantidade_kits?: number
          separacao_confirmada_em?: string | null
          separacao_confirmada_por_nome?: string | null
          status?: string
          subprojeto_id?: string | null
          tramo?: string
          zona?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proj_ordens_premontagem_subprojeto_id_fkey"
            columns: ["subprojeto_id"]
            isOneToOne: false
            referencedRelation: "proj_subprojetos"
            referencedColumns: ["id"]
          },
        ]
      }
      proj_ordens_premontagem_alvos: {
        Row: {
          created_at: string
          id: string
          ordem_id: string
          tramo_unidade_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          ordem_id: string
          tramo_unidade_id: string
        }
        Update: {
          created_at?: string
          id?: string
          ordem_id?: string
          tramo_unidade_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "proj_ordens_premontagem_alvos_ordem_id_fkey"
            columns: ["ordem_id"]
            isOneToOne: false
            referencedRelation: "proj_ordens_premontagem"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proj_ordens_premontagem_alvos_tramo_unidade_id_fkey"
            columns: ["tramo_unidade_id"]
            isOneToOne: false
            referencedRelation: "proj_tramos_gwjaco"
            referencedColumns: ["id"]
          },
        ]
      }
      proj_ordens_premontagem_itens: {
        Row: {
          created_at: string
          id: string
          item_id: string
          localizador: string | null
          ordem_id: string
          qtd_por_kit: number
          qtd_separada: number
          qtd_total: number
          saldo_no_momento: number | null
          separado: boolean
          separado_em: string | null
          separado_por_nome: string | null
          subconjunto: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          item_id: string
          localizador?: string | null
          ordem_id: string
          qtd_por_kit: number
          qtd_separada?: number
          qtd_total: number
          saldo_no_momento?: number | null
          separado?: boolean
          separado_em?: string | null
          separado_por_nome?: string | null
          subconjunto?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string
          localizador?: string | null
          ordem_id?: string
          qtd_por_kit?: number
          qtd_separada?: number
          qtd_total?: number
          saldo_no_momento?: number | null
          separado?: boolean
          separado_em?: string | null
          separado_por_nome?: string | null
          subconjunto?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proj_ordens_premontagem_itens_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "proj_itens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proj_ordens_premontagem_itens_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "vw_proj_saldo_almox"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "proj_ordens_premontagem_itens_ordem_id_fkey"
            columns: ["ordem_id"]
            isOneToOne: false
            referencedRelation: "proj_ordens_premontagem"
            referencedColumns: ["id"]
          },
        ]
      }
      proj_sobressalentes: {
        Row: {
          aprovador_id: string | null
          aprovador_nome: string
          codigo: string
          created_at: string
          criado_por_id: string | null
          criado_por_nome: string | null
          data: string
          evidencias: Json
          excluido_em: string | null
          excluido_por: string | null
          id: string
          motivo: string
          motivo_detalhe: string | null
          observacao: string | null
          projeto: string
          status: string
          subprojeto_id: string | null
          tramo: string | null
          tramo_unidade_id: string | null
        }
        Insert: {
          aprovador_id?: string | null
          aprovador_nome: string
          codigo: string
          created_at?: string
          criado_por_id?: string | null
          criado_por_nome?: string | null
          data: string
          evidencias?: Json
          excluido_em?: string | null
          excluido_por?: string | null
          id?: string
          motivo: string
          motivo_detalhe?: string | null
          observacao?: string | null
          projeto?: string
          status?: string
          subprojeto_id?: string | null
          tramo?: string | null
          tramo_unidade_id?: string | null
        }
        Update: {
          aprovador_id?: string | null
          aprovador_nome?: string
          codigo?: string
          created_at?: string
          criado_por_id?: string | null
          criado_por_nome?: string | null
          data?: string
          evidencias?: Json
          excluido_em?: string | null
          excluido_por?: string | null
          id?: string
          motivo?: string
          motivo_detalhe?: string | null
          observacao?: string | null
          projeto?: string
          status?: string
          subprojeto_id?: string | null
          tramo?: string | null
          tramo_unidade_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proj_sobressalentes_subprojeto_id_fkey"
            columns: ["subprojeto_id"]
            isOneToOne: false
            referencedRelation: "proj_subprojetos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proj_sobressalentes_tramo_unidade_id_fkey"
            columns: ["tramo_unidade_id"]
            isOneToOne: false
            referencedRelation: "proj_tramos_gwjaco"
            referencedColumns: ["id"]
          },
        ]
      }
      proj_sobressalentes_itens: {
        Row: {
          created_at: string
          id: string
          item_id: string
          quantidade: number
          sobressalente_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          item_id: string
          quantidade: number
          sobressalente_id: string
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string
          quantidade?: number
          sobressalente_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "proj_sobressalentes_itens_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "proj_itens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proj_sobressalentes_itens_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "vw_proj_saldo_almox"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "proj_sobressalentes_itens_sobressalente_id_fkey"
            columns: ["sobressalente_id"]
            isOneToOne: false
            referencedRelation: "proj_sobressalentes"
            referencedColumns: ["id"]
          },
        ]
      }
      proj_subprojetos: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          nome: string
          observacao: string | null
          ordem: number
          pedido_compra: string | null
          projeto: string
          torre_final: number
          torre_inicial: number
          torres_previstas: number
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id: string
          nome: string
          observacao?: string | null
          ordem?: number
          pedido_compra?: string | null
          projeto?: string
          torre_final: number
          torre_inicial: number
          torres_previstas: number
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome?: string
          observacao?: string | null
          ordem?: number
          pedido_compra?: string | null
          projeto?: string
          torre_final?: number
          torre_inicial?: number
          torres_previstas?: number
        }
        Relationships: []
      }
      proj_torres_planejamento: {
        Row: {
          data_alvo: string | null
          id: string
          observacao: string | null
          semana: string | null
          subprojeto_id: string
          torre_numero: number
          updated_at: string
        }
        Insert: {
          data_alvo?: string | null
          id?: string
          observacao?: string | null
          semana?: string | null
          subprojeto_id?: string
          torre_numero: number
          updated_at?: string
        }
        Update: {
          data_alvo?: string | null
          id?: string
          observacao?: string | null
          semana?: string | null
          subprojeto_id?: string
          torre_numero?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proj_torres_planejamento_subprojeto_id_fkey"
            columns: ["subprojeto_id"]
            isOneToOne: false
            referencedRelation: "proj_subprojetos"
            referencedColumns: ["id"]
          },
        ]
      }
      proj_tramos_gwjaco: {
        Row: {
          created_at: string
          id: string
          observacao: string | null
          projeto: string
          secao: string
          serie: number
          status: string
          subprojeto_id: string | null
          torre_numero: number
          tramo: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          observacao?: string | null
          projeto?: string
          secao: string
          serie: number
          status?: string
          subprojeto_id?: string | null
          torre_numero: number
          tramo: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          observacao?: string | null
          projeto?: string
          secao?: string
          serie?: number
          status?: string
          subprojeto_id?: string | null
          torre_numero?: number
          tramo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proj_tramos_gwjaco_subprojeto_id_fkey"
            columns: ["subprojeto_id"]
            isOneToOne: false
            referencedRelation: "proj_subprojetos"
            referencedColumns: ["id"]
          },
        ]
      }
      qua_checklist_cabecalho_opcoes: {
        Row: {
          campo: string
          criado_por: string | null
          id: string
          ultimo_uso_em: string
          uso_count: number
          valor: string
        }
        Insert: {
          campo: string
          criado_por?: string | null
          id?: string
          ultimo_uso_em?: string
          uso_count?: number
          valor: string
        }
        Update: {
          campo?: string
          criado_por?: string | null
          id?: string
          ultimo_uso_em?: string
          uso_count?: number
          valor?: string
        }
        Relationships: []
      }
      qua_checklist_expedicao_assinaturas: {
        Row: {
          assinado_em: string
          checklist_id: string
          coletado_por_nome: string | null
          created_at: string
          criado_por: string | null
          id: string
          mime_type: string
          nome: string
          papel: string
          path: string
          tipo: string
        }
        Insert: {
          assinado_em?: string
          checklist_id: string
          coletado_por_nome?: string | null
          created_at?: string
          criado_por?: string | null
          id?: string
          mime_type: string
          nome: string
          papel: string
          path: string
          tipo: string
        }
        Update: {
          assinado_em?: string
          checklist_id?: string
          coletado_por_nome?: string | null
          created_at?: string
          criado_por?: string | null
          id?: string
          mime_type?: string
          nome?: string
          papel?: string
          path?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "qua_checklist_expedicao_assinaturas_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "qua_checklist_expedicoes"
            referencedColumns: ["id"]
          },
        ]
      }
      qua_checklist_expedicao_fotos: {
        Row: {
          checklist_id: string
          created_at: string
          criado_por: string | null
          file_name: string
          id: string
          item_chave: string
          mime_type: string
          path: string
          size_bytes: number
        }
        Insert: {
          checklist_id: string
          created_at?: string
          criado_por?: string | null
          file_name: string
          id?: string
          item_chave: string
          mime_type: string
          path: string
          size_bytes?: number
        }
        Update: {
          checklist_id?: string
          created_at?: string
          criado_por?: string | null
          file_name?: string
          id?: string
          item_chave?: string
          mime_type?: string
          path?: string
          size_bytes?: number
        }
        Relationships: [
          {
            foreignKeyName: "qua_checklist_expedicao_fotos_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "qua_checklist_expedicoes"
            referencedColumns: ["id"]
          },
        ]
      }
      qua_checklist_expedicoes: {
        Row: {
          cliente: string
          codigo_registro: string
          created_at: string
          criado_por: string | null
          criado_por_nome: string | null
          data_expedicao: string
          etiqueta_secao: string
          excluido_em: string | null
          excluido_por: string | null
          fechado_em: string | null
          fechado_por: string | null
          fechado_por_nome: string | null
          finalizado_em: string | null
          id: string
          inspetor_qualidade: string
          numero_serie: string
          observacoes: Json
          projeto: string
          respostas: Json
          site: string
          status: string
          tramo_sequencial: string
          updated_at: string
          validacao_nomes: Json
        }
        Insert: {
          cliente: string
          codigo_registro: string
          created_at?: string
          criado_por?: string | null
          criado_por_nome?: string | null
          data_expedicao: string
          etiqueta_secao: string
          excluido_em?: string | null
          excluido_por?: string | null
          fechado_em?: string | null
          fechado_por?: string | null
          fechado_por_nome?: string | null
          finalizado_em?: string | null
          id?: string
          inspetor_qualidade: string
          numero_serie: string
          observacoes?: Json
          projeto: string
          respostas?: Json
          site: string
          status?: string
          tramo_sequencial: string
          updated_at?: string
          validacao_nomes?: Json
        }
        Update: {
          cliente?: string
          codigo_registro?: string
          created_at?: string
          criado_por?: string | null
          criado_por_nome?: string | null
          data_expedicao?: string
          etiqueta_secao?: string
          excluido_em?: string | null
          excluido_por?: string | null
          fechado_em?: string | null
          fechado_por?: string | null
          fechado_por_nome?: string | null
          finalizado_em?: string | null
          id?: string
          inspetor_qualidade?: string
          numero_serie?: string
          observacoes?: Json
          projeto?: string
          respostas?: Json
          site?: string
          status?: string
          tramo_sequencial?: string
          updated_at?: string
          validacao_nomes?: Json
        }
        Relationships: []
      }
      qua_internos_mecanicos_assinaturas: {
        Row: {
          assinado_em: string
          checklist_id: string
          created_at: string
          criado_por: string | null
          data_assinatura: string | null
          id: string
          mime_type: string
          nome: string
          papel: string
          path: string
          setor: string | null
          tipo: string
        }
        Insert: {
          assinado_em?: string
          checklist_id: string
          created_at?: string
          criado_por?: string | null
          data_assinatura?: string | null
          id?: string
          mime_type: string
          nome: string
          papel: string
          path: string
          setor?: string | null
          tipo: string
        }
        Update: {
          assinado_em?: string
          checklist_id?: string
          created_at?: string
          criado_por?: string | null
          data_assinatura?: string | null
          id?: string
          mime_type?: string
          nome?: string
          papel?: string
          path?: string
          setor?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "qua_internos_mecanicos_assinaturas_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "qua_internos_mecanicos_checklists"
            referencedColumns: ["id"]
          },
        ]
      }
      qua_internos_mecanicos_cabecalho_opcoes: {
        Row: {
          campo: string
          criado_por: string | null
          id: string
          ultimo_uso_em: string
          uso_count: number
          valor: string
        }
        Insert: {
          campo: string
          criado_por?: string | null
          id?: string
          ultimo_uso_em?: string
          uso_count?: number
          valor: string
        }
        Update: {
          campo?: string
          criado_por?: string | null
          id?: string
          ultimo_uso_em?: string
          uso_count?: number
          valor?: string
        }
        Relationships: []
      }
      qua_internos_mecanicos_checklists: {
        Row: {
          aprovacao_final_qualidade: boolean
          codigo_registro: string
          created_at: string
          criado_por: string | null
          criado_por_nome: string | null
          excluido_em: string | null
          excluido_por: string | null
          finalizado_em: string | null
          id: string
          instrumentos_utilizados: string | null
          modelo_id: string
          modelo_nome: string
          observacao_final: string | null
          producao_concluida_em: string | null
          producao_concluida_por: string | null
          producao_concluida_por_nome: string | null
          projeto: string
          qualidade_iniciada_em: string | null
          qualidade_por: string | null
          qualidade_por_nome: string | null
          responsavel_producao: string | null
          responsavel_qualidade: string | null
          respostas: Json
          sequencial: string
          status: string
          tramo: string
          updated_at: string
          validacoes: Json
          versao_formulario: string
        }
        Insert: {
          aprovacao_final_qualidade?: boolean
          codigo_registro: string
          created_at?: string
          criado_por?: string | null
          criado_por_nome?: string | null
          excluido_em?: string | null
          excluido_por?: string | null
          finalizado_em?: string | null
          id?: string
          instrumentos_utilizados?: string | null
          modelo_id: string
          modelo_nome: string
          observacao_final?: string | null
          producao_concluida_em?: string | null
          producao_concluida_por?: string | null
          producao_concluida_por_nome?: string | null
          projeto: string
          qualidade_iniciada_em?: string | null
          qualidade_por?: string | null
          qualidade_por_nome?: string | null
          responsavel_producao?: string | null
          responsavel_qualidade?: string | null
          respostas?: Json
          sequencial: string
          status?: string
          tramo: string
          updated_at?: string
          validacoes?: Json
          versao_formulario?: string
        }
        Update: {
          aprovacao_final_qualidade?: boolean
          codigo_registro?: string
          created_at?: string
          criado_por?: string | null
          criado_por_nome?: string | null
          excluido_em?: string | null
          excluido_por?: string | null
          finalizado_em?: string | null
          id?: string
          instrumentos_utilizados?: string | null
          modelo_id?: string
          modelo_nome?: string
          observacao_final?: string | null
          producao_concluida_em?: string | null
          producao_concluida_por?: string | null
          producao_concluida_por_nome?: string | null
          projeto?: string
          qualidade_iniciada_em?: string | null
          qualidade_por?: string | null
          qualidade_por_nome?: string | null
          responsavel_producao?: string | null
          responsavel_qualidade?: string | null
          respostas?: Json
          sequencial?: string
          status?: string
          tramo?: string
          updated_at?: string
          validacoes?: Json
          versao_formulario?: string
        }
        Relationships: []
      }
      qua_internos_mecanicos_fotos: {
        Row: {
          checklist_id: string
          created_at: string
          criado_por: string | null
          file_name: string
          id: string
          item_chave: string
          mime_type: string
          path: string
          size_bytes: number
        }
        Insert: {
          checklist_id: string
          created_at?: string
          criado_por?: string | null
          file_name: string
          id?: string
          item_chave: string
          mime_type: string
          path: string
          size_bytes?: number
        }
        Update: {
          checklist_id?: string
          created_at?: string
          criado_por?: string | null
          file_name?: string
          id?: string
          item_chave?: string
          mime_type?: string
          path?: string
          size_bytes?: number
        }
        Relationships: [
          {
            foreignKeyName: "qua_internos_mecanicos_fotos_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "qua_internos_mecanicos_checklists"
            referencedColumns: ["id"]
          },
        ]
      }
      qua_internos_mecanicos_ilustracoes: {
        Row: {
          asset_key: string
          criado_por: string | null
          id: string
          mime_type: string
          path: string
          sincronizado_em: string
          size_bytes: number
        }
        Insert: {
          asset_key: string
          criado_por?: string | null
          id?: string
          mime_type: string
          path: string
          sincronizado_em?: string
          size_bytes?: number
        }
        Update: {
          asset_key?: string
          criado_por?: string | null
          id?: string
          mime_type?: string
          path?: string
          sincronizado_em?: string
          size_bytes?: number
        }
        Relationships: []
      }
      qua_rnc: {
        Row: {
          anexos: Json
          area_geradora: string | null
          cliente: string | null
          created_at: string
          criado_por: string | null
          criado_por_nome: string | null
          data_emissao: string
          data_ocorrencia: string | null
          descricao: string
          documento_origem: string | null
          emissor_id: string | null
          emissor_nome: string
          excluido_em: string | null
          excluido_por: string | null
          fornecedor: string | null
          id: string
          numero_pedido_compra: string | null
          numero_registro: string
          numero_rnc_externo: string | null
          origem_nc: string
          plano_acao: Json
          projeto: string | null
          responsavel_id: string | null
          responsavel_nome: string | null
          status: string
          tipo_nc: string | null
          tramo_sequencial: string | null
          updated_at: string
        }
        Insert: {
          anexos?: Json
          area_geradora?: string | null
          cliente?: string | null
          created_at?: string
          criado_por?: string | null
          criado_por_nome?: string | null
          data_emissao?: string
          data_ocorrencia?: string | null
          descricao: string
          documento_origem?: string | null
          emissor_id?: string | null
          emissor_nome: string
          excluido_em?: string | null
          excluido_por?: string | null
          fornecedor?: string | null
          id?: string
          numero_pedido_compra?: string | null
          numero_registro: string
          numero_rnc_externo?: string | null
          origem_nc?: string
          plano_acao?: Json
          projeto?: string | null
          responsavel_id?: string | null
          responsavel_nome?: string | null
          status?: string
          tipo_nc?: string | null
          tramo_sequencial?: string | null
          updated_at?: string
        }
        Update: {
          anexos?: Json
          area_geradora?: string | null
          cliente?: string | null
          created_at?: string
          criado_por?: string | null
          criado_por_nome?: string | null
          data_emissao?: string
          data_ocorrencia?: string | null
          descricao?: string
          documento_origem?: string | null
          emissor_id?: string | null
          emissor_nome?: string
          excluido_em?: string | null
          excluido_por?: string | null
          fornecedor?: string | null
          id?: string
          numero_pedido_compra?: string | null
          numero_registro?: string
          numero_rnc_externo?: string | null
          origem_nc?: string
          plano_acao?: Json
          projeto?: string | null
          responsavel_id?: string | null
          responsavel_nome?: string | null
          status?: string
          tipo_nc?: string | null
          tramo_sequencial?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      rh_ase_itens: {
        Row: {
          cargo: string | null
          created_at: string
          excluido_em: string | null
          excluido_por: string | null
          hora_entrada: string | null
          hora_saida: string | null
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
          excluido_em?: string | null
          excluido_por?: string | null
          hora_entrada?: string | null
          hora_saida?: string | null
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
          excluido_em?: string | null
          excluido_por?: string | null
          hora_entrada?: string | null
          hora_saida?: string | null
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
            foreignKeyName: "rh_ase_itens_excluido_por_fkey"
            columns: ["excluido_por"]
            isOneToOne: false
            referencedRelation: "core_perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_ase_itens_excluido_por_fkey"
            columns: ["excluido_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_ase_itens_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "rh_pessoas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_ase_itens_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "vw_rh_rotas_colaboradores"
            referencedColumns: ["pessoa_id"]
          },
          {
            foreignKeyName: "rh_ase_itens_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "vw_rh_treinamentos_vencimentos"
            referencedColumns: ["pessoa_id"]
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
          excluido_em: string | null
          excluido_por: string | null
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
          excluido_em?: string | null
          excluido_por?: string | null
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
          excluido_em?: string | null
          excluido_por?: string | null
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
            foreignKeyName: "rh_ase_solicitacoes_excluido_por_fkey"
            columns: ["excluido_por"]
            isOneToOne: false
            referencedRelation: "core_perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_ase_solicitacoes_excluido_por_fkey"
            columns: ["excluido_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
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
      rh_cronogramas_treinamentos: {
        Row: {
          atualizado_por: string | null
          chave: string
          cotacao: number
          created_at: string
          criado_por: string | null
          descricao: string
          excluido_em: string | null
          excluido_por: string | null
          id: string
          origem: string
          quantidade_total: number
          treinamento_id: string | null
          unidade_mes: number
          updated_at: string
        }
        Insert: {
          atualizado_por?: string | null
          chave: string
          cotacao?: number
          created_at?: string
          criado_por?: string | null
          descricao: string
          excluido_em?: string | null
          excluido_por?: string | null
          id?: string
          origem?: string
          quantidade_total?: number
          treinamento_id?: string | null
          unidade_mes?: number
          updated_at?: string
        }
        Update: {
          atualizado_por?: string | null
          chave?: string
          cotacao?: number
          created_at?: string
          criado_por?: string | null
          descricao?: string
          excluido_em?: string | null
          excluido_por?: string | null
          id?: string
          origem?: string
          quantidade_total?: number
          treinamento_id?: string | null
          unidade_mes?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rh_cronogramas_treinamentos_atualizado_por_fkey"
            columns: ["atualizado_por"]
            isOneToOne: false
            referencedRelation: "core_perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_cronogramas_treinamentos_atualizado_por_fkey"
            columns: ["atualizado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_cronogramas_treinamentos_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "core_perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_cronogramas_treinamentos_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_cronogramas_treinamentos_excluido_por_fkey"
            columns: ["excluido_por"]
            isOneToOne: false
            referencedRelation: "core_perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_cronogramas_treinamentos_excluido_por_fkey"
            columns: ["excluido_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_cronogramas_treinamentos_treinamento_id_fkey"
            columns: ["treinamento_id"]
            isOneToOne: false
            referencedRelation: "rh_treinamentos_catalogo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_cronogramas_treinamentos_treinamento_id_fkey"
            columns: ["treinamento_id"]
            isOneToOne: false
            referencedRelation: "vw_rh_treinamentos_vencimentos"
            referencedColumns: ["treinamento_id"]
          },
        ]
      }
      rh_cronogramas_treinamentos_meses: {
        Row: {
          competencia: string
          cronograma_id: string
          id: string
          quantidade: number
        }
        Insert: {
          competencia: string
          cronograma_id: string
          id?: string
          quantidade?: number
        }
        Update: {
          competencia?: string
          cronograma_id?: string
          id?: string
          quantidade?: number
        }
        Relationships: [
          {
            foreignKeyName: "rh_cronogramas_treinamentos_meses_cronograma_id_fkey"
            columns: ["cronograma_id"]
            isOneToOne: false
            referencedRelation: "rh_cronogramas_treinamentos"
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
          area: string | null
          ativo: boolean
          atualizado_por: string | null
          cargo: string | null
          chave_nome: string | null
          created_at: string
          id: string
          lideranca: string | null
          macroarea: string | null
          nome: string
          registro: string
          situacao: string | null
          subsetor: string | null
          tipo_vinculo: string
          turno: string | null
          updated_at: string
        }
        Insert: {
          area?: string | null
          ativo?: boolean
          atualizado_por?: string | null
          cargo?: string | null
          chave_nome?: string | null
          created_at?: string
          id?: string
          lideranca?: string | null
          macroarea?: string | null
          nome: string
          registro: string
          situacao?: string | null
          subsetor?: string | null
          tipo_vinculo?: string
          turno?: string | null
          updated_at?: string
        }
        Update: {
          area?: string | null
          ativo?: boolean
          atualizado_por?: string | null
          cargo?: string | null
          chave_nome?: string | null
          created_at?: string
          id?: string
          lideranca?: string | null
          macroarea?: string | null
          nome?: string
          registro?: string
          situacao?: string | null
          subsetor?: string | null
          tipo_vinculo?: string
          turno?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rh_pessoas_atualizado_por_fkey"
            columns: ["atualizado_por"]
            isOneToOne: false
            referencedRelation: "core_perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_pessoas_atualizado_por_fkey"
            columns: ["atualizado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rh_pessoas_treinamentos: {
        Row: {
          atestado_em: string | null
          atestado_por: string | null
          atualizado_por: string | null
          created_at: string
          criado_por: string | null
          data_capacitacao: string | null
          excluido_em: string | null
          excluido_por: string | null
          id: string
          observacao: string | null
          origem: string
          pessoa_id: string
          status: string
          treinamento_id: string
          updated_at: string
          validade_em: string | null
        }
        Insert: {
          atestado_em?: string | null
          atestado_por?: string | null
          atualizado_por?: string | null
          created_at?: string
          criado_por?: string | null
          data_capacitacao?: string | null
          excluido_em?: string | null
          excluido_por?: string | null
          id?: string
          observacao?: string | null
          origem?: string
          pessoa_id: string
          status?: string
          treinamento_id: string
          updated_at?: string
          validade_em?: string | null
        }
        Update: {
          atestado_em?: string | null
          atestado_por?: string | null
          atualizado_por?: string | null
          created_at?: string
          criado_por?: string | null
          data_capacitacao?: string | null
          excluido_em?: string | null
          excluido_por?: string | null
          id?: string
          observacao?: string | null
          origem?: string
          pessoa_id?: string
          status?: string
          treinamento_id?: string
          updated_at?: string
          validade_em?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rh_pessoas_treinamentos_atestado_por_fkey"
            columns: ["atestado_por"]
            isOneToOne: false
            referencedRelation: "core_perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_pessoas_treinamentos_atestado_por_fkey"
            columns: ["atestado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_pessoas_treinamentos_atualizado_por_fkey"
            columns: ["atualizado_por"]
            isOneToOne: false
            referencedRelation: "core_perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_pessoas_treinamentos_atualizado_por_fkey"
            columns: ["atualizado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_pessoas_treinamentos_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "core_perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_pessoas_treinamentos_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_pessoas_treinamentos_excluido_por_fkey"
            columns: ["excluido_por"]
            isOneToOne: false
            referencedRelation: "core_perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_pessoas_treinamentos_excluido_por_fkey"
            columns: ["excluido_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_pessoas_treinamentos_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "rh_pessoas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_pessoas_treinamentos_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "vw_rh_rotas_colaboradores"
            referencedColumns: ["pessoa_id"]
          },
          {
            foreignKeyName: "rh_pessoas_treinamentos_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "vw_rh_treinamentos_vencimentos"
            referencedColumns: ["pessoa_id"]
          },
          {
            foreignKeyName: "rh_pessoas_treinamentos_treinamento_id_fkey"
            columns: ["treinamento_id"]
            isOneToOne: false
            referencedRelation: "rh_treinamentos_catalogo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_pessoas_treinamentos_treinamento_id_fkey"
            columns: ["treinamento_id"]
            isOneToOne: false
            referencedRelation: "vw_rh_treinamentos_vencimentos"
            referencedColumns: ["treinamento_id"]
          },
        ]
      }
      rh_pessoas_treinamentos_auditoria: {
        Row: {
          acao: string
          alterado_por: string | null
          created_at: string
          dados_anteriores: Json | null
          dados_novos: Json
          id: number
          pessoa_treinamento_id: string
        }
        Insert: {
          acao: string
          alterado_por?: string | null
          created_at?: string
          dados_anteriores?: Json | null
          dados_novos: Json
          id?: never
          pessoa_treinamento_id: string
        }
        Update: {
          acao?: string
          alterado_por?: string | null
          created_at?: string
          dados_anteriores?: Json | null
          dados_novos?: Json
          id?: never
          pessoa_treinamento_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rh_pessoas_treinamentos_auditoria_alterado_por_fkey"
            columns: ["alterado_por"]
            isOneToOne: false
            referencedRelation: "core_perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_pessoas_treinamentos_auditoria_alterado_por_fkey"
            columns: ["alterado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rh_plano_treinamentos: {
        Row: {
          atualizado_por: string | null
          carga_horaria: number | null
          categoria: string | null
          codigo: string
          comentarios: string | null
          created_at: string
          criado_por: string | null
          custo_total: number
          data_inicio: string
          data_realizada: string | null
          data_termino: string | null
          excluido_em: string | null
          excluido_por: string | null
          horario: string | null
          id: string
          local: string | null
          modalidade: string | null
          objetivo: string | null
          origem: string
          participantes_planejados: number | null
          responsavel: string | null
          status: string
          tipo_informacao: string
          titulo: string
          treinamento_id: string | null
          updated_at: string
        }
        Insert: {
          atualizado_por?: string | null
          carga_horaria?: number | null
          categoria?: string | null
          codigo: string
          comentarios?: string | null
          created_at?: string
          criado_por?: string | null
          custo_total?: number
          data_inicio: string
          data_realizada?: string | null
          data_termino?: string | null
          excluido_em?: string | null
          excluido_por?: string | null
          horario?: string | null
          id?: string
          local?: string | null
          modalidade?: string | null
          objetivo?: string | null
          origem?: string
          participantes_planejados?: number | null
          responsavel?: string | null
          status?: string
          tipo_informacao?: string
          titulo: string
          treinamento_id?: string | null
          updated_at?: string
        }
        Update: {
          atualizado_por?: string | null
          carga_horaria?: number | null
          categoria?: string | null
          codigo?: string
          comentarios?: string | null
          created_at?: string
          criado_por?: string | null
          custo_total?: number
          data_inicio?: string
          data_realizada?: string | null
          data_termino?: string | null
          excluido_em?: string | null
          excluido_por?: string | null
          horario?: string | null
          id?: string
          local?: string | null
          modalidade?: string | null
          objetivo?: string | null
          origem?: string
          participantes_planejados?: number | null
          responsavel?: string | null
          status?: string
          tipo_informacao?: string
          titulo?: string
          treinamento_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rh_plano_treinamentos_atualizado_por_fkey"
            columns: ["atualizado_por"]
            isOneToOne: false
            referencedRelation: "core_perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_plano_treinamentos_atualizado_por_fkey"
            columns: ["atualizado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_plano_treinamentos_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "core_perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_plano_treinamentos_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_plano_treinamentos_excluido_por_fkey"
            columns: ["excluido_por"]
            isOneToOne: false
            referencedRelation: "core_perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_plano_treinamentos_excluido_por_fkey"
            columns: ["excluido_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_plano_treinamentos_treinamento_id_fkey"
            columns: ["treinamento_id"]
            isOneToOne: false
            referencedRelation: "rh_treinamentos_catalogo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_plano_treinamentos_treinamento_id_fkey"
            columns: ["treinamento_id"]
            isOneToOne: false
            referencedRelation: "vw_rh_treinamentos_vencimentos"
            referencedColumns: ["treinamento_id"]
          },
        ]
      }
      rh_plano_treinamentos_participantes: {
        Row: {
          area: string | null
          atualizado_por: string | null
          created_at: string
          criado_por: string | null
          data_realizada: string | null
          excluido_em: string | null
          excluido_por: string | null
          id: string
          nome: string | null
          pessoa_id: string | null
          plano_id: string
          registro: string
          status: string
          updated_at: string
        }
        Insert: {
          area?: string | null
          atualizado_por?: string | null
          created_at?: string
          criado_por?: string | null
          data_realizada?: string | null
          excluido_em?: string | null
          excluido_por?: string | null
          id?: string
          nome?: string | null
          pessoa_id?: string | null
          plano_id: string
          registro: string
          status?: string
          updated_at?: string
        }
        Update: {
          area?: string | null
          atualizado_por?: string | null
          created_at?: string
          criado_por?: string | null
          data_realizada?: string | null
          excluido_em?: string | null
          excluido_por?: string | null
          id?: string
          nome?: string | null
          pessoa_id?: string | null
          plano_id?: string
          registro?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rh_plano_treinamentos_participantes_atualizado_por_fkey"
            columns: ["atualizado_por"]
            isOneToOne: false
            referencedRelation: "core_perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_plano_treinamentos_participantes_atualizado_por_fkey"
            columns: ["atualizado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_plano_treinamentos_participantes_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "core_perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_plano_treinamentos_participantes_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_plano_treinamentos_participantes_excluido_por_fkey"
            columns: ["excluido_por"]
            isOneToOne: false
            referencedRelation: "core_perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_plano_treinamentos_participantes_excluido_por_fkey"
            columns: ["excluido_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_plano_treinamentos_participantes_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "rh_pessoas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_plano_treinamentos_participantes_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "vw_rh_rotas_colaboradores"
            referencedColumns: ["pessoa_id"]
          },
          {
            foreignKeyName: "rh_plano_treinamentos_participantes_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "vw_rh_treinamentos_vencimentos"
            referencedColumns: ["pessoa_id"]
          },
          {
            foreignKeyName: "rh_plano_treinamentos_participantes_plano_id_fkey"
            columns: ["plano_id"]
            isOneToOne: false
            referencedRelation: "rh_plano_treinamentos"
            referencedColumns: ["id"]
          },
        ]
      }
      rh_rotas: {
        Row: {
          ativo: boolean
          contato: string | null
          created_at: string
          excluido_em: string | null
          excluido_por: string | null
          funcionario: string
          horario: string
          id: string
          ponto_embarque: string
          rota: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          contato?: string | null
          created_at?: string
          excluido_em?: string | null
          excluido_por?: string | null
          funcionario: string
          horario: string
          id?: string
          ponto_embarque: string
          rota: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          contato?: string | null
          created_at?: string
          excluido_em?: string | null
          excluido_por?: string | null
          funcionario?: string
          horario?: string
          id?: string
          ponto_embarque?: string
          rota?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rh_rotas_excluido_por_fkey"
            columns: ["excluido_por"]
            isOneToOne: false
            referencedRelation: "core_perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_rotas_excluido_por_fkey"
            columns: ["excluido_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
      rh_treinamentos: {
        Row: {
          atualizado_por: string | null
          created_at: string
          criado_por: string | null
          data_eficacia: string | null
          data_treinamento: string
          dia_semana: string
          excluido_em: string | null
          excluido_por: string | null
          id: string
          realizado: boolean
          semana: string
          tipo_planejamento: string
          tipo_treinamento: string
          treinamento: string
          turma_horario: string
          updated_at: string
        }
        Insert: {
          atualizado_por?: string | null
          created_at?: string
          criado_por?: string | null
          data_eficacia?: string | null
          data_treinamento: string
          dia_semana?: string
          excluido_em?: string | null
          excluido_por?: string | null
          id?: string
          realizado?: boolean
          semana?: string
          tipo_planejamento?: string
          tipo_treinamento?: string
          treinamento: string
          turma_horario?: string
          updated_at?: string
        }
        Update: {
          atualizado_por?: string | null
          created_at?: string
          criado_por?: string | null
          data_eficacia?: string | null
          data_treinamento?: string
          dia_semana?: string
          excluido_em?: string | null
          excluido_por?: string | null
          id?: string
          realizado?: boolean
          semana?: string
          tipo_planejamento?: string
          tipo_treinamento?: string
          treinamento?: string
          turma_horario?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rh_treinamentos_atualizado_por_fkey"
            columns: ["atualizado_por"]
            isOneToOne: false
            referencedRelation: "core_perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_treinamentos_atualizado_por_fkey"
            columns: ["atualizado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_treinamentos_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "core_perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_treinamentos_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_treinamentos_excluido_por_fkey"
            columns: ["excluido_por"]
            isOneToOne: false
            referencedRelation: "core_perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_treinamentos_excluido_por_fkey"
            columns: ["excluido_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rh_treinamentos_bkp_20260928: {
        Row: {
          atualizado_por: string | null
          created_at: string | null
          criado_por: string | null
          data_eficacia: string | null
          data_treinamento: string | null
          dia_semana: string | null
          excluido_em: string | null
          excluido_por: string | null
          id: string | null
          realizado: boolean | null
          semana: string | null
          tipo_planejamento: string | null
          tipo_treinamento: string | null
          treinamento: string | null
          turma_horario: string | null
          updated_at: string | null
        }
        Insert: {
          atualizado_por?: string | null
          created_at?: string | null
          criado_por?: string | null
          data_eficacia?: string | null
          data_treinamento?: string | null
          dia_semana?: string | null
          excluido_em?: string | null
          excluido_por?: string | null
          id?: string | null
          realizado?: boolean | null
          semana?: string | null
          tipo_planejamento?: string | null
          tipo_treinamento?: string | null
          treinamento?: string | null
          turma_horario?: string | null
          updated_at?: string | null
        }
        Update: {
          atualizado_por?: string | null
          created_at?: string | null
          criado_por?: string | null
          data_eficacia?: string | null
          data_treinamento?: string | null
          dia_semana?: string | null
          excluido_em?: string | null
          excluido_por?: string | null
          id?: string | null
          realizado?: boolean | null
          semana?: string | null
          tipo_planejamento?: string | null
          tipo_treinamento?: string | null
          treinamento?: string | null
          turma_horario?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      rh_treinamentos_catalogo: {
        Row: {
          analise_eficacia: boolean
          ativo: boolean
          atualizado_por: string | null
          carga_horaria: number | null
          chave: string
          conteudo: string | null
          created_at: string
          criado_por: string | null
          excluido_em: string | null
          excluido_por: string | null
          id: string
          nome: string
          tipo_informacao: string
          updated_at: string
          validade_meses: number | null
        }
        Insert: {
          analise_eficacia?: boolean
          ativo?: boolean
          atualizado_por?: string | null
          carga_horaria?: number | null
          chave: string
          conteudo?: string | null
          created_at?: string
          criado_por?: string | null
          excluido_em?: string | null
          excluido_por?: string | null
          id?: string
          nome: string
          tipo_informacao?: string
          updated_at?: string
          validade_meses?: number | null
        }
        Update: {
          analise_eficacia?: boolean
          ativo?: boolean
          atualizado_por?: string | null
          carga_horaria?: number | null
          chave?: string
          conteudo?: string | null
          created_at?: string
          criado_por?: string | null
          excluido_em?: string | null
          excluido_por?: string | null
          id?: string
          nome?: string
          tipo_informacao?: string
          updated_at?: string
          validade_meses?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "rh_treinamentos_catalogo_atualizado_por_fkey"
            columns: ["atualizado_por"]
            isOneToOne: false
            referencedRelation: "core_perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_treinamentos_catalogo_atualizado_por_fkey"
            columns: ["atualizado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_treinamentos_catalogo_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "core_perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_treinamentos_catalogo_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_treinamentos_catalogo_excluido_por_fkey"
            columns: ["excluido_por"]
            isOneToOne: false
            referencedRelation: "core_perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_treinamentos_catalogo_excluido_por_fkey"
            columns: ["excluido_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rh_treinamentos_por_funcao: {
        Row: {
          atualizado_por: string | null
          cargo: string
          cargo_chave: string
          created_at: string
          criado_por: string | null
          excluido_em: string | null
          excluido_por: string | null
          id: string
          obrigatorio: boolean
          treinamento_id: string
          updated_at: string
        }
        Insert: {
          atualizado_por?: string | null
          cargo: string
          cargo_chave: string
          created_at?: string
          criado_por?: string | null
          excluido_em?: string | null
          excluido_por?: string | null
          id?: string
          obrigatorio?: boolean
          treinamento_id: string
          updated_at?: string
        }
        Update: {
          atualizado_por?: string | null
          cargo?: string
          cargo_chave?: string
          created_at?: string
          criado_por?: string | null
          excluido_em?: string | null
          excluido_por?: string | null
          id?: string
          obrigatorio?: boolean
          treinamento_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rh_treinamentos_por_funcao_atualizado_por_fkey"
            columns: ["atualizado_por"]
            isOneToOne: false
            referencedRelation: "core_perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_treinamentos_por_funcao_atualizado_por_fkey"
            columns: ["atualizado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_treinamentos_por_funcao_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "core_perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_treinamentos_por_funcao_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_treinamentos_por_funcao_excluido_por_fkey"
            columns: ["excluido_por"]
            isOneToOne: false
            referencedRelation: "core_perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_treinamentos_por_funcao_excluido_por_fkey"
            columns: ["excluido_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_treinamentos_por_funcao_treinamento_id_fkey"
            columns: ["treinamento_id"]
            isOneToOne: false
            referencedRelation: "rh_treinamentos_catalogo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_treinamentos_por_funcao_treinamento_id_fkey"
            columns: ["treinamento_id"]
            isOneToOne: false
            referencedRelation: "vw_rh_treinamentos_vencimentos"
            referencedColumns: ["treinamento_id"]
          },
        ]
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
      sap_me2l_pedido: {
        Row: {
          a_fornecer_qtd: number | null
          centro: string | null
          codigo_eliminacao: string | null
          codigo_imposto: string | null
          codigo_liberacao: string | null
          contrato_basico: string | null
          criado_por: string | null
          data_documento: string | null
          deposito: string | null
          documento_compras: string
          fornecedor: string | null
          grupo_liberacao: string | null
          grupo_mercadorias: string | null
          id: number
          imported_at: string
          material: string | null
          moeda: string | null
          n_acompanhamento: string | null
          organizacao_compras: string | null
          qtd_pedido: number | null
          requisicao_compra: string | null
          requisitante: string | null
          texto_breve: string | null
          um_pedido: string | null
          unidade_preco: string | null
          valor_liquido_pedido: number | null
        }
        Insert: {
          a_fornecer_qtd?: number | null
          centro?: string | null
          codigo_eliminacao?: string | null
          codigo_imposto?: string | null
          codigo_liberacao?: string | null
          contrato_basico?: string | null
          criado_por?: string | null
          data_documento?: string | null
          deposito?: string | null
          documento_compras: string
          fornecedor?: string | null
          grupo_liberacao?: string | null
          grupo_mercadorias?: string | null
          id?: number
          imported_at?: string
          material?: string | null
          moeda?: string | null
          n_acompanhamento?: string | null
          organizacao_compras?: string | null
          qtd_pedido?: number | null
          requisicao_compra?: string | null
          requisitante?: string | null
          texto_breve?: string | null
          um_pedido?: string | null
          unidade_preco?: string | null
          valor_liquido_pedido?: number | null
        }
        Update: {
          a_fornecer_qtd?: number | null
          centro?: string | null
          codigo_eliminacao?: string | null
          codigo_imposto?: string | null
          codigo_liberacao?: string | null
          contrato_basico?: string | null
          criado_por?: string | null
          data_documento?: string | null
          deposito?: string | null
          documento_compras?: string
          fornecedor?: string | null
          grupo_liberacao?: string | null
          grupo_mercadorias?: string | null
          id?: number
          imported_at?: string
          material?: string | null
          moeda?: string | null
          n_acompanhamento?: string | null
          organizacao_compras?: string | null
          qtd_pedido?: number | null
          requisicao_compra?: string | null
          requisitante?: string | null
          texto_breve?: string | null
          um_pedido?: string | null
          unidade_preco?: string | null
          valor_liquido_pedido?: number | null
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
          tipo: string | null
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
          tipo?: string | null
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
          tipo?: string | null
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
          data_entrega_confirmada: string | null
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
          data_entrega_confirmada?: string | null
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
          data_entrega_confirmada?: string | null
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
      sap_zf0076_nf_po: {
        Row: {
          ano_documento: string | null
          ap: string | null
          blp: string | null
          campos_extras: Json | null
          centro: string | null
          codigo_imposto: string | null
          codigo_postal_fornecedor: string | null
          codigo_tipo: string | null
          contrato: string | null
          criado_por: string | null
          custo_complementar_aquisicao: number | null
          dat: string | null
          data_aprovacao: string | null
          data_criacao: string | null
          data_documento: string | null
          data_entrada: string | null
          data_lancamento: string | null
          debito_credito: string | null
          documento_compra: string
          documento_referencia: string | null
          domicilio_fiscal: string | null
          domicilio_fiscal_fornecedor: string | null
          empresa: string | null
          fornecedor: string | null
          fornecedor_alternativo: string | null
          hora: string | null
          id: number
          id_fiscal_1: string | null
          id_fiscal_2: string | null
          id_fiscal_iva: string | null
          imported_at: string
          imposto: string | null
          indicador_in: string | null
          item_contrato: string | null
          item_faturamento: string | null
          item_nf: string | null
          item_pedido: string
          item_requisicao: string | null
          iva_wmwst: number | null
          local_fornecedor: string | null
          local_negocios: string | null
          man: string | null
          material: string | null
          material_nf: string | null
          mbl: string | null
          moeda_bruto: string | null
          moeda_documento: string | null
          moeda_imposto: string | null
          moeda_iva: string | null
          moeda_montante: string | null
          montante: number | null
          montante_bruto: number | null
          mt: string | null
          nome_fornecedor: string | null
          nome_fornecedor_2: string | null
          nome_fornecedor_3: string | null
          nome_fornecedor_4: string | null
          nome_fornecedor_alternativo: string | null
          nome_usuario: string | null
          numero_acompanhamento: string | null
          numero_documento: string | null
          numero_serie: string | null
          pais_fornecedor: string | null
          preco: string | null
          quantidade: number | null
          quantidade_upp: number | null
          referencia_documento: string | null
          referencia_faturamento: string | null
          referencia_nf: string | null
          regiao_fornecedor: string | null
          requisicao_compra: string | null
          requisitante: string | null
          taxa_cambio: number | null
          texto_breve: string | null
          tipo_condicao: string | null
          tipo_documento: string | null
          tipo_operacao: string | null
          unidade_medida: string | null
          unidade_medida_upp: string | null
        }
        Insert: {
          ano_documento?: string | null
          ap?: string | null
          blp?: string | null
          campos_extras?: Json | null
          centro?: string | null
          codigo_imposto?: string | null
          codigo_postal_fornecedor?: string | null
          codigo_tipo?: string | null
          contrato?: string | null
          criado_por?: string | null
          custo_complementar_aquisicao?: number | null
          dat?: string | null
          data_aprovacao?: string | null
          data_criacao?: string | null
          data_documento?: string | null
          data_entrada?: string | null
          data_lancamento?: string | null
          debito_credito?: string | null
          documento_compra: string
          documento_referencia?: string | null
          domicilio_fiscal?: string | null
          domicilio_fiscal_fornecedor?: string | null
          empresa?: string | null
          fornecedor?: string | null
          fornecedor_alternativo?: string | null
          hora?: string | null
          id?: number
          id_fiscal_1?: string | null
          id_fiscal_2?: string | null
          id_fiscal_iva?: string | null
          imported_at?: string
          imposto?: string | null
          indicador_in?: string | null
          item_contrato?: string | null
          item_faturamento?: string | null
          item_nf?: string | null
          item_pedido: string
          item_requisicao?: string | null
          iva_wmwst?: number | null
          local_fornecedor?: string | null
          local_negocios?: string | null
          man?: string | null
          material?: string | null
          material_nf?: string | null
          mbl?: string | null
          moeda_bruto?: string | null
          moeda_documento?: string | null
          moeda_imposto?: string | null
          moeda_iva?: string | null
          moeda_montante?: string | null
          montante?: number | null
          montante_bruto?: number | null
          mt?: string | null
          nome_fornecedor?: string | null
          nome_fornecedor_2?: string | null
          nome_fornecedor_3?: string | null
          nome_fornecedor_4?: string | null
          nome_fornecedor_alternativo?: string | null
          nome_usuario?: string | null
          numero_acompanhamento?: string | null
          numero_documento?: string | null
          numero_serie?: string | null
          pais_fornecedor?: string | null
          preco?: string | null
          quantidade?: number | null
          quantidade_upp?: number | null
          referencia_documento?: string | null
          referencia_faturamento?: string | null
          referencia_nf?: string | null
          regiao_fornecedor?: string | null
          requisicao_compra?: string | null
          requisitante?: string | null
          taxa_cambio?: number | null
          texto_breve?: string | null
          tipo_condicao?: string | null
          tipo_documento?: string | null
          tipo_operacao?: string | null
          unidade_medida?: string | null
          unidade_medida_upp?: string | null
        }
        Update: {
          ano_documento?: string | null
          ap?: string | null
          blp?: string | null
          campos_extras?: Json | null
          centro?: string | null
          codigo_imposto?: string | null
          codigo_postal_fornecedor?: string | null
          codigo_tipo?: string | null
          contrato?: string | null
          criado_por?: string | null
          custo_complementar_aquisicao?: number | null
          dat?: string | null
          data_aprovacao?: string | null
          data_criacao?: string | null
          data_documento?: string | null
          data_entrada?: string | null
          data_lancamento?: string | null
          debito_credito?: string | null
          documento_compra?: string
          documento_referencia?: string | null
          domicilio_fiscal?: string | null
          domicilio_fiscal_fornecedor?: string | null
          empresa?: string | null
          fornecedor?: string | null
          fornecedor_alternativo?: string | null
          hora?: string | null
          id?: number
          id_fiscal_1?: string | null
          id_fiscal_2?: string | null
          id_fiscal_iva?: string | null
          imported_at?: string
          imposto?: string | null
          indicador_in?: string | null
          item_contrato?: string | null
          item_faturamento?: string | null
          item_nf?: string | null
          item_pedido?: string
          item_requisicao?: string | null
          iva_wmwst?: number | null
          local_fornecedor?: string | null
          local_negocios?: string | null
          man?: string | null
          material?: string | null
          material_nf?: string | null
          mbl?: string | null
          moeda_bruto?: string | null
          moeda_documento?: string | null
          moeda_imposto?: string | null
          moeda_iva?: string | null
          moeda_montante?: string | null
          montante?: number | null
          montante_bruto?: number | null
          mt?: string | null
          nome_fornecedor?: string | null
          nome_fornecedor_2?: string | null
          nome_fornecedor_3?: string | null
          nome_fornecedor_4?: string | null
          nome_fornecedor_alternativo?: string | null
          nome_usuario?: string | null
          numero_acompanhamento?: string | null
          numero_documento?: string | null
          numero_serie?: string | null
          pais_fornecedor?: string | null
          preco?: string | null
          quantidade?: number | null
          quantidade_upp?: number | null
          referencia_documento?: string | null
          referencia_faturamento?: string | null
          referencia_nf?: string | null
          regiao_fornecedor?: string | null
          requisicao_compra?: string | null
          requisitante?: string | null
          taxa_cambio?: number | null
          texto_breve?: string | null
          tipo_condicao?: string | null
          tipo_documento?: string | null
          tipo_operacao?: string | null
          unidade_medida?: string | null
          unidade_medida_upp?: string | null
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
      sap_zl0136_nf: {
        Row: {
          aliquota_cbs: number | null
          aliquota_cofins: number | null
          aliquota_ibs: number | null
          aliquota_pis: number | null
          apelido_ativo: string | null
          base_cbs: number | null
          base_cofins: number | null
          base_ibs: number | null
          base_icms: number | null
          base_ipi: number | null
          base_pis: number | null
          cambio_contabilidade: number | null
          campos_extras: Json | null
          categoria_nota_fiscal: string | null
          centro: string | null
          centro_lucro: string | null
          cfop: string | null
          chave_acesso: string | null
          cnpj_parceiro: string | null
          codigo_conta_analitica_dc: string | null
          codigo_controle: string | null
          codigo_imposto: string | null
          criado_manualmente: string | null
          criado_por: string | null
          data_documento: string | null
          data_exclusao_simples: string | null
          data_lancamento: string | null
          data_opcao_simples: string | null
          debito_posterior: string | null
          denominacao: string | null
          descricao_parceiro: string | null
          descricao_servico: string | null
          descricao_tipo_parceiro: string | null
          direito_fiscal_cofins: string | null
          direito_fiscal_icms: string | null
          direito_fiscal_ipi: string | null
          direito_fiscal_iss: string | null
          direito_fiscal_pis: string | null
          documento_compras: string | null
          documento_faturamento: string | null
          documento_vendas: string | null
          id: number
          id_parceiro: string | null
          imported_at: string
          item_documento_origem: string | null
          item_documento_vendas: string | null
          item_pedido: string | null
          item_referencia_nf: string | null
          material: string | null
          modelo_nota_fiscal: string | null
          moeda_documento: string | null
          moeda_documento_faturamento: string | null
          numero_documento_nove_posicoes: string
          numero_documento_original: string | null
          numero_pedido: string | null
          numero_servico: string | null
          optante_simples: string | null
          pedido: string | null
          preco_liquido: number | null
          quantidade: number | null
          referencia_documento_origem: string | null
          series: string | null
          simples_nacional_sap: string | null
          situacao_tributaria_icms: string | null
          texto_breve_material: string | null
          tipo_documento_faturamento: string | null
          tipo_parceiro: string | null
          total: number | null
          uf_destino: string | null
          uf_origem: string | null
          unidade_medida: string | null
          valor_cbs: number | null
          valor_cofins: number | null
          valor_difal: number | null
          valor_ibs: number | null
          valor_icms_icm3: number | null
          valor_icms_part_dest: number | null
          valor_icms_total: number | null
          valor_inss: number | null
          valor_ipi: number | null
          valor_iss: number | null
          valor_pis: number | null
        }
        Insert: {
          aliquota_cbs?: number | null
          aliquota_cofins?: number | null
          aliquota_ibs?: number | null
          aliquota_pis?: number | null
          apelido_ativo?: string | null
          base_cbs?: number | null
          base_cofins?: number | null
          base_ibs?: number | null
          base_icms?: number | null
          base_ipi?: number | null
          base_pis?: number | null
          cambio_contabilidade?: number | null
          campos_extras?: Json | null
          categoria_nota_fiscal?: string | null
          centro?: string | null
          centro_lucro?: string | null
          cfop?: string | null
          chave_acesso?: string | null
          cnpj_parceiro?: string | null
          codigo_conta_analitica_dc?: string | null
          codigo_controle?: string | null
          codigo_imposto?: string | null
          criado_manualmente?: string | null
          criado_por?: string | null
          data_documento?: string | null
          data_exclusao_simples?: string | null
          data_lancamento?: string | null
          data_opcao_simples?: string | null
          debito_posterior?: string | null
          denominacao?: string | null
          descricao_parceiro?: string | null
          descricao_servico?: string | null
          descricao_tipo_parceiro?: string | null
          direito_fiscal_cofins?: string | null
          direito_fiscal_icms?: string | null
          direito_fiscal_ipi?: string | null
          direito_fiscal_iss?: string | null
          direito_fiscal_pis?: string | null
          documento_compras?: string | null
          documento_faturamento?: string | null
          documento_vendas?: string | null
          id?: number
          id_parceiro?: string | null
          imported_at?: string
          item_documento_origem?: string | null
          item_documento_vendas?: string | null
          item_pedido?: string | null
          item_referencia_nf?: string | null
          material?: string | null
          modelo_nota_fiscal?: string | null
          moeda_documento?: string | null
          moeda_documento_faturamento?: string | null
          numero_documento_nove_posicoes: string
          numero_documento_original?: string | null
          numero_pedido?: string | null
          numero_servico?: string | null
          optante_simples?: string | null
          pedido?: string | null
          preco_liquido?: number | null
          quantidade?: number | null
          referencia_documento_origem?: string | null
          series?: string | null
          simples_nacional_sap?: string | null
          situacao_tributaria_icms?: string | null
          texto_breve_material?: string | null
          tipo_documento_faturamento?: string | null
          tipo_parceiro?: string | null
          total?: number | null
          uf_destino?: string | null
          uf_origem?: string | null
          unidade_medida?: string | null
          valor_cbs?: number | null
          valor_cofins?: number | null
          valor_difal?: number | null
          valor_ibs?: number | null
          valor_icms_icm3?: number | null
          valor_icms_part_dest?: number | null
          valor_icms_total?: number | null
          valor_inss?: number | null
          valor_ipi?: number | null
          valor_iss?: number | null
          valor_pis?: number | null
        }
        Update: {
          aliquota_cbs?: number | null
          aliquota_cofins?: number | null
          aliquota_ibs?: number | null
          aliquota_pis?: number | null
          apelido_ativo?: string | null
          base_cbs?: number | null
          base_cofins?: number | null
          base_ibs?: number | null
          base_icms?: number | null
          base_ipi?: number | null
          base_pis?: number | null
          cambio_contabilidade?: number | null
          campos_extras?: Json | null
          categoria_nota_fiscal?: string | null
          centro?: string | null
          centro_lucro?: string | null
          cfop?: string | null
          chave_acesso?: string | null
          cnpj_parceiro?: string | null
          codigo_conta_analitica_dc?: string | null
          codigo_controle?: string | null
          codigo_imposto?: string | null
          criado_manualmente?: string | null
          criado_por?: string | null
          data_documento?: string | null
          data_exclusao_simples?: string | null
          data_lancamento?: string | null
          data_opcao_simples?: string | null
          debito_posterior?: string | null
          denominacao?: string | null
          descricao_parceiro?: string | null
          descricao_servico?: string | null
          descricao_tipo_parceiro?: string | null
          direito_fiscal_cofins?: string | null
          direito_fiscal_icms?: string | null
          direito_fiscal_ipi?: string | null
          direito_fiscal_iss?: string | null
          direito_fiscal_pis?: string | null
          documento_compras?: string | null
          documento_faturamento?: string | null
          documento_vendas?: string | null
          id?: number
          id_parceiro?: string | null
          imported_at?: string
          item_documento_origem?: string | null
          item_documento_vendas?: string | null
          item_pedido?: string | null
          item_referencia_nf?: string | null
          material?: string | null
          modelo_nota_fiscal?: string | null
          moeda_documento?: string | null
          moeda_documento_faturamento?: string | null
          numero_documento_nove_posicoes?: string
          numero_documento_original?: string | null
          numero_pedido?: string | null
          numero_servico?: string | null
          optante_simples?: string | null
          pedido?: string | null
          preco_liquido?: number | null
          quantidade?: number | null
          referencia_documento_origem?: string | null
          series?: string | null
          simples_nacional_sap?: string | null
          situacao_tributaria_icms?: string | null
          texto_breve_material?: string | null
          tipo_documento_faturamento?: string | null
          tipo_parceiro?: string | null
          total?: number | null
          uf_destino?: string | null
          uf_origem?: string | null
          unidade_medida?: string | null
          valor_cbs?: number | null
          valor_cofins?: number | null
          valor_difal?: number | null
          valor_ibs?: number | null
          valor_icms_icm3?: number | null
          valor_icms_part_dest?: number | null
          valor_icms_total?: number | null
          valor_inss?: number | null
          valor_ipi?: number | null
          valor_iss?: number | null
          valor_pis?: number | null
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
      ssma_book_epis: {
        Row: {
          ativo: boolean
          atualizado_por: string | null
          ca: string
          categoria: string
          chave_importacao: string | null
          codigo_sap: string | null
          created_at: string
          criado_por: string
          descricao_epi: string
          descricao_sap: string | null
          fabricante: string | null
          grupo_epi: string
          id: string
          imagem_mime: string | null
          imagem_nome: string | null
          imagem_path: string | null
          imagem_tamanho: number | null
          indicacao: string | null
          tamanho: string | null
          updated_at: string
          validade: string | null
        }
        Insert: {
          ativo?: boolean
          atualizado_por?: string | null
          ca?: string
          categoria: string
          chave_importacao?: string | null
          codigo_sap?: string | null
          created_at?: string
          criado_por?: string
          descricao_epi: string
          descricao_sap?: string | null
          fabricante?: string | null
          grupo_epi: string
          id?: string
          imagem_mime?: string | null
          imagem_nome?: string | null
          imagem_path?: string | null
          imagem_tamanho?: number | null
          indicacao?: string | null
          tamanho?: string | null
          updated_at?: string
          validade?: string | null
        }
        Update: {
          ativo?: boolean
          atualizado_por?: string | null
          ca?: string
          categoria?: string
          chave_importacao?: string | null
          codigo_sap?: string | null
          created_at?: string
          criado_por?: string
          descricao_epi?: string
          descricao_sap?: string | null
          fabricante?: string | null
          grupo_epi?: string
          id?: string
          imagem_mime?: string | null
          imagem_nome?: string | null
          imagem_path?: string | null
          imagem_tamanho?: number | null
          indicacao?: string | null
          tamanho?: string | null
          updated_at?: string
          validade?: string | null
        }
        Relationships: []
      }
      ssma_book_epis_historico: {
        Row: {
          alterado_em: string
          alterado_por: string
          epi_id: string
          id: number
          operacao: string
          valores_anteriores: Json | null
          valores_novos: Json
        }
        Insert: {
          alterado_em?: string
          alterado_por?: string
          epi_id: string
          id?: never
          operacao: string
          valores_anteriores?: Json | null
          valores_novos: Json
        }
        Update: {
          alterado_em?: string
          alterado_por?: string
          epi_id?: string
          id?: never
          operacao?: string
          valores_anteriores?: Json | null
          valores_novos?: Json
        }
        Relationships: [
          {
            foreignKeyName: "ssma_book_epis_historico_epi_id_fkey"
            columns: ["epi_id"]
            isOneToOne: false
            referencedRelation: "ssma_book_epis"
            referencedColumns: ["id"]
          },
        ]
      }
      ssma_epi_funcoes: {
        Row: {
          ativo: boolean
          atualizado_por: string | null
          codigo_origem: string
          created_at: string
          criado_por: string
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          atualizado_por?: string | null
          codigo_origem: string
          created_at?: string
          criado_por?: string
          id?: string
          nome: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          atualizado_por?: string | null
          codigo_origem?: string
          created_at?: string
          criado_por?: string
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: []
      }
      ssma_epi_funcoes_historico: {
        Row: {
          alterado_em: string
          alterado_por: string
          funcao_id: string
          id: number
          operacao: string
          valores_anteriores: Json | null
          valores_novos: Json
        }
        Insert: {
          alterado_em?: string
          alterado_por?: string
          funcao_id: string
          id?: never
          operacao: string
          valores_anteriores?: Json | null
          valores_novos: Json
        }
        Update: {
          alterado_em?: string
          alterado_por?: string
          funcao_id?: string
          id?: never
          operacao?: string
          valores_anteriores?: Json | null
          valores_novos?: Json
        }
        Relationships: [
          {
            foreignKeyName: "ssma_epi_funcoes_historico_funcao_id_fkey"
            columns: ["funcao_id"]
            isOneToOne: false
            referencedRelation: "ssma_epi_funcoes"
            referencedColumns: ["id"]
          },
        ]
      }
      ssma_epi_por_funcao: {
        Row: {
          ativo: boolean
          atualizado_por: string | null
          ca_origem: string | null
          classificacao: string
          codigo_epi_origem: string
          codigo_vinculo_origem: string | null
          condicao_uso: string | null
          created_at: string
          criado_por: string
          descricao_epi_origem: string
          epi_book_id: string | null
          funcao_id: string
          id: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          atualizado_por?: string | null
          ca_origem?: string | null
          classificacao: string
          codigo_epi_origem: string
          codigo_vinculo_origem?: string | null
          condicao_uso?: string | null
          created_at?: string
          criado_por?: string
          descricao_epi_origem: string
          epi_book_id?: string | null
          funcao_id: string
          id?: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          atualizado_por?: string | null
          ca_origem?: string | null
          classificacao?: string
          codigo_epi_origem?: string
          codigo_vinculo_origem?: string | null
          condicao_uso?: string | null
          created_at?: string
          criado_por?: string
          descricao_epi_origem?: string
          epi_book_id?: string | null
          funcao_id?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ssma_epi_por_funcao_epi_book_id_fkey"
            columns: ["epi_book_id"]
            isOneToOne: false
            referencedRelation: "ssma_book_epis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ssma_epi_por_funcao_funcao_id_fkey"
            columns: ["funcao_id"]
            isOneToOne: false
            referencedRelation: "ssma_epi_funcoes"
            referencedColumns: ["id"]
          },
        ]
      }
      ssma_epi_por_funcao_historico: {
        Row: {
          alterado_em: string
          alterado_por: string
          id: number
          operacao: string
          requisito_id: string
          valores_anteriores: Json | null
          valores_novos: Json
        }
        Insert: {
          alterado_em?: string
          alterado_por?: string
          id?: never
          operacao: string
          requisito_id: string
          valores_anteriores?: Json | null
          valores_novos: Json
        }
        Update: {
          alterado_em?: string
          alterado_por?: string
          id?: never
          operacao?: string
          requisito_id?: string
          valores_anteriores?: Json | null
          valores_novos?: Json
        }
        Relationships: [
          {
            foreignKeyName: "ssma_epi_por_funcao_historico_requisito_id_fkey"
            columns: ["requisito_id"]
            isOneToOne: false
            referencedRelation: "ssma_epi_por_funcao"
            referencedColumns: ["id"]
          },
        ]
      }
      ssma_fichas_epi: {
        Row: {
          assinado_em: string | null
          assinatura_colaborador: string | null
          assinatura_pendente: boolean
          cancelado_em: string | null
          cancelado_por: string | null
          cancelado_por_nome: string | null
          cancelamento_motivo: string | null
          cargo_rh: string | null
          codigo: string
          created_at: string
          criado_por: string
          criado_por_nome: string | null
          data_admissao: string | null
          data_demissao: string | null
          data_entrega: string
          funcao_id: string
          funcao_nome: string
          id: string
          nome: string
          observacoes: string | null
          origem: string
          pessoa_id: string
          registro: string
          setor: string | null
          status: string
        }
        Insert: {
          assinado_em?: string | null
          assinatura_colaborador?: string | null
          assinatura_pendente?: boolean
          cancelado_em?: string | null
          cancelado_por?: string | null
          cancelado_por_nome?: string | null
          cancelamento_motivo?: string | null
          cargo_rh?: string | null
          codigo: string
          created_at?: string
          criado_por?: string
          criado_por_nome?: string | null
          data_admissao?: string | null
          data_demissao?: string | null
          data_entrega?: string
          funcao_id: string
          funcao_nome: string
          id?: string
          nome: string
          observacoes?: string | null
          origem?: string
          pessoa_id: string
          registro: string
          setor?: string | null
          status?: string
        }
        Update: {
          assinado_em?: string | null
          assinatura_colaborador?: string | null
          assinatura_pendente?: boolean
          cancelado_em?: string | null
          cancelado_por?: string | null
          cancelado_por_nome?: string | null
          cancelamento_motivo?: string | null
          cargo_rh?: string | null
          codigo?: string
          created_at?: string
          criado_por?: string
          criado_por_nome?: string | null
          data_admissao?: string | null
          data_demissao?: string | null
          data_entrega?: string
          funcao_id?: string
          funcao_nome?: string
          id?: string
          nome?: string
          observacoes?: string | null
          origem?: string
          pessoa_id?: string
          registro?: string
          setor?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "ssma_fichas_epi_funcao_id_fkey"
            columns: ["funcao_id"]
            isOneToOne: false
            referencedRelation: "ssma_epi_funcoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ssma_fichas_epi_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "rh_pessoas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ssma_fichas_epi_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "vw_rh_rotas_colaboradores"
            referencedColumns: ["pessoa_id"]
          },
          {
            foreignKeyName: "ssma_fichas_epi_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "vw_rh_treinamentos_vencimentos"
            referencedColumns: ["pessoa_id"]
          },
        ]
      }
      ssma_fichas_epi_import_legado: {
        Row: {
          ca_arquivo: string | null
          cargo_arquivo: string | null
          codigo_material: string | null
          colaborador: string
          data_entrega: string
          descricao_ficha: string | null
          devolucao_arquivo: string | null
          ficha_id: string | null
          id: number
          importado_em: string
          importado_por: string | null
          item_id: string | null
          linha: number
          matricula_arquivo: string | null
          quantidade: number | null
          setor_arquivo: string | null
        }
        Insert: {
          ca_arquivo?: string | null
          cargo_arquivo?: string | null
          codigo_material?: string | null
          colaborador: string
          data_entrega: string
          descricao_ficha?: string | null
          devolucao_arquivo?: string | null
          ficha_id?: string | null
          id?: never
          importado_em?: string
          importado_por?: string | null
          item_id?: string | null
          linha: number
          matricula_arquivo?: string | null
          quantidade?: number | null
          setor_arquivo?: string | null
        }
        Update: {
          ca_arquivo?: string | null
          cargo_arquivo?: string | null
          codigo_material?: string | null
          colaborador?: string
          data_entrega?: string
          descricao_ficha?: string | null
          devolucao_arquivo?: string | null
          ficha_id?: string | null
          id?: never
          importado_em?: string
          importado_por?: string | null
          item_id?: string | null
          linha?: number
          matricula_arquivo?: string | null
          quantidade?: number | null
          setor_arquivo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ssma_fichas_epi_import_legado_ficha_id_fkey"
            columns: ["ficha_id"]
            isOneToOne: false
            referencedRelation: "ssma_fichas_epi"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ssma_fichas_epi_import_legado_ficha_id_fkey"
            columns: ["ficha_id"]
            isOneToOne: false
            referencedRelation: "ssma_fichas_epi_consumo"
            referencedColumns: ["ficha_id"]
          },
          {
            foreignKeyName: "ssma_fichas_epi_import_legado_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "ssma_fichas_epi_consumo"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "ssma_fichas_epi_import_legado_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "ssma_fichas_epi_itens"
            referencedColumns: ["id"]
          },
        ]
      }
      ssma_fichas_epi_itens: {
        Row: {
          ca: string | null
          categoria: string | null
          codigo_sap: string | null
          created_at: string
          data_devolucao: string | null
          descricao: string
          devolucao_observacao: string | null
          devolucao_registrada_em: string | null
          devolucao_registrada_por: string | null
          devolucao_registrada_por_nome: string | null
          epi_book_id: string | null
          ficha_id: string
          fora_da_matriz: boolean
          grupo_epi: string
          id: string
          motivo: number
          ordem: number
          quantidade: number
          requisito_id: string | null
          tamanho: string | null
        }
        Insert: {
          ca?: string | null
          categoria?: string | null
          codigo_sap?: string | null
          created_at?: string
          data_devolucao?: string | null
          descricao: string
          devolucao_observacao?: string | null
          devolucao_registrada_em?: string | null
          devolucao_registrada_por?: string | null
          devolucao_registrada_por_nome?: string | null
          epi_book_id?: string | null
          ficha_id: string
          fora_da_matriz?: boolean
          grupo_epi: string
          id?: string
          motivo: number
          ordem?: number
          quantidade: number
          requisito_id?: string | null
          tamanho?: string | null
        }
        Update: {
          ca?: string | null
          categoria?: string | null
          codigo_sap?: string | null
          created_at?: string
          data_devolucao?: string | null
          descricao?: string
          devolucao_observacao?: string | null
          devolucao_registrada_em?: string | null
          devolucao_registrada_por?: string | null
          devolucao_registrada_por_nome?: string | null
          epi_book_id?: string | null
          ficha_id?: string
          fora_da_matriz?: boolean
          grupo_epi?: string
          id?: string
          motivo?: number
          ordem?: number
          quantidade?: number
          requisito_id?: string | null
          tamanho?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ssma_fichas_epi_itens_epi_book_id_fkey"
            columns: ["epi_book_id"]
            isOneToOne: false
            referencedRelation: "ssma_book_epis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ssma_fichas_epi_itens_ficha_id_fkey"
            columns: ["ficha_id"]
            isOneToOne: false
            referencedRelation: "ssma_fichas_epi"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ssma_fichas_epi_itens_ficha_id_fkey"
            columns: ["ficha_id"]
            isOneToOne: false
            referencedRelation: "ssma_fichas_epi_consumo"
            referencedColumns: ["ficha_id"]
          },
          {
            foreignKeyName: "ssma_fichas_epi_itens_requisito_id_fkey"
            columns: ["requisito_id"]
            isOneToOne: false
            referencedRelation: "ssma_epi_por_funcao"
            referencedColumns: ["id"]
          },
        ]
      }
      ssma_form_config: {
        Row: {
          atualizado_em: string
          atualizado_por: string | null
          descricao: string | null
          id: string
          opcoes: Json
          perguntas: Json
          titulo: string
        }
        Insert: {
          atualizado_em?: string
          atualizado_por?: string | null
          descricao?: string | null
          id: string
          opcoes?: Json
          perguntas?: Json
          titulo?: string
        }
        Update: {
          atualizado_em?: string
          atualizado_por?: string | null
          descricao?: string | null
          id?: string
          opcoes?: Json
          perguntas?: Json
          titulo?: string
        }
        Relationships: []
      }
      ssma_rid_atualizacoes: {
        Row: {
          created_at: string
          criado_por: string | null
          criado_por_nome: string | null
          desvio_id: string
          foto_ids: string[]
          id: string
          texto: string
        }
        Insert: {
          created_at?: string
          criado_por?: string | null
          criado_por_nome?: string | null
          desvio_id: string
          foto_ids?: string[]
          id?: string
          texto: string
        }
        Update: {
          created_at?: string
          criado_por?: string | null
          criado_por_nome?: string | null
          desvio_id?: string
          foto_ids?: string[]
          id?: string
          texto?: string
        }
        Relationships: [
          {
            foreignKeyName: "ssma_rid_atualizacoes_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "core_perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ssma_rid_atualizacoes_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ssma_rid_atualizacoes_desvio_id_fkey"
            columns: ["desvio_id"]
            isOneToOne: false
            referencedRelation: "ssma_rid_desvios"
            referencedColumns: ["id"]
          },
        ]
      }
      ssma_rid_desvios: {
        Row: {
          acao_imediata: string | null
          acao_proposta: string | null
          area_desvio: string
          area_desvio_outro: string | null
          classificacao_outro: string | null
          comportamentos_inseguros: string[] | null
          comunicado_responsavel_area: boolean
          comunicado_seguranca: boolean
          condicoes_inseguras: string[] | null
          created_at: string
          criado_por: string | null
          data_registro: string
          descricao_desvio: string
          empresa: string
          empresa_contratada_nome: string | null
          excluido_em: string | null
          excluido_por: string | null
          fotos: Json | null
          id: string
          matricula_informante: string | null
          nome_informante: string
          numero_registro: string
          origem_informante: string
          parecer_ssma: string | null
          pessoa_id: string | null
          plano_acao: Json | null
          responsavel_seguranca_informado: string | null
          sanado_imediato: boolean
          semana: string
          setor: string
          status: string
          updated_at: string
        }
        Insert: {
          acao_imediata?: string | null
          acao_proposta?: string | null
          area_desvio: string
          area_desvio_outro?: string | null
          classificacao_outro?: string | null
          comportamentos_inseguros?: string[] | null
          comunicado_responsavel_area?: boolean
          comunicado_seguranca?: boolean
          condicoes_inseguras?: string[] | null
          created_at?: string
          criado_por?: string | null
          data_registro?: string
          descricao_desvio: string
          empresa?: string
          empresa_contratada_nome?: string | null
          excluido_em?: string | null
          excluido_por?: string | null
          fotos?: Json | null
          id?: string
          matricula_informante?: string | null
          nome_informante: string
          numero_registro: string
          origem_informante?: string
          parecer_ssma?: string | null
          pessoa_id?: string | null
          plano_acao?: Json | null
          responsavel_seguranca_informado?: string | null
          sanado_imediato?: boolean
          semana: string
          setor: string
          status?: string
          updated_at?: string
        }
        Update: {
          acao_imediata?: string | null
          acao_proposta?: string | null
          area_desvio?: string
          area_desvio_outro?: string | null
          classificacao_outro?: string | null
          comportamentos_inseguros?: string[] | null
          comunicado_responsavel_area?: boolean
          comunicado_seguranca?: boolean
          condicoes_inseguras?: string[] | null
          created_at?: string
          criado_por?: string | null
          data_registro?: string
          descricao_desvio?: string
          empresa?: string
          empresa_contratada_nome?: string | null
          excluido_em?: string | null
          excluido_por?: string | null
          fotos?: Json | null
          id?: string
          matricula_informante?: string | null
          nome_informante?: string
          numero_registro?: string
          origem_informante?: string
          parecer_ssma?: string | null
          pessoa_id?: string | null
          plano_acao?: Json | null
          responsavel_seguranca_informado?: string | null
          sanado_imediato?: boolean
          semana?: string
          setor?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ssma_rid_desvios_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "core_perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ssma_rid_desvios_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ssma_rid_desvios_excluido_por_fkey"
            columns: ["excluido_por"]
            isOneToOne: false
            referencedRelation: "core_perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ssma_rid_desvios_excluido_por_fkey"
            columns: ["excluido_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ssma_rid_desvios_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "rh_pessoas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ssma_rid_desvios_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "vw_rh_rotas_colaboradores"
            referencedColumns: ["pessoa_id"]
          },
          {
            foreignKeyName: "ssma_rid_desvios_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "vw_rh_treinamentos_vencimentos"
            referencedColumns: ["pessoa_id"]
          },
        ]
      }
      sup_bahiasul_entregas: {
        Row: {
          chave_unica: string
          chegada: string | null
          created_at: string | null
          cto_documento: string | null
          cto_filial: string | null
          cto_numero: string
          cto_serie: string | null
          dst_cidade: string | null
          dst_cnpj: string | null
          dst_nome: string | null
          embarque: string | null
          emissao: string | null
          entrega: string | null
          frt_cobrado: number | null
          id: number
          imported_at: string | null
          kgs_cubado: number | null
          kgs_declarado: number | null
          kgs_real: number | null
          nfs_embarcadas: string | null
          nro_pedido: string | null
          obs_diversos: string | null
          org_cidade: string | null
          prv_chegada: string | null
          prv_entrega: string | null
          prz_contratado: string | null
          qtd_volumes: number | null
          referencia: string | null
          rmt_cnpj: string | null
          rmt_nome: string | null
          situacao: string | null
          tpo_embarque: string | null
          updated_at: string | null
          vinculo_confirmado_em: string | null
          vinculo_confirmado_por: string | null
          vinculo_origem: string | null
          vlr_mercadoria: number | null
        }
        Insert: {
          chave_unica: string
          chegada?: string | null
          created_at?: string | null
          cto_documento?: string | null
          cto_filial?: string | null
          cto_numero: string
          cto_serie?: string | null
          dst_cidade?: string | null
          dst_cnpj?: string | null
          dst_nome?: string | null
          embarque?: string | null
          emissao?: string | null
          entrega?: string | null
          frt_cobrado?: number | null
          id?: number
          imported_at?: string | null
          kgs_cubado?: number | null
          kgs_declarado?: number | null
          kgs_real?: number | null
          nfs_embarcadas?: string | null
          nro_pedido?: string | null
          obs_diversos?: string | null
          org_cidade?: string | null
          prv_chegada?: string | null
          prv_entrega?: string | null
          prz_contratado?: string | null
          qtd_volumes?: number | null
          referencia?: string | null
          rmt_cnpj?: string | null
          rmt_nome?: string | null
          situacao?: string | null
          tpo_embarque?: string | null
          updated_at?: string | null
          vinculo_confirmado_em?: string | null
          vinculo_confirmado_por?: string | null
          vinculo_origem?: string | null
          vlr_mercadoria?: number | null
        }
        Update: {
          chave_unica?: string
          chegada?: string | null
          created_at?: string | null
          cto_documento?: string | null
          cto_filial?: string | null
          cto_numero?: string
          cto_serie?: string | null
          dst_cidade?: string | null
          dst_cnpj?: string | null
          dst_nome?: string | null
          embarque?: string | null
          emissao?: string | null
          entrega?: string | null
          frt_cobrado?: number | null
          id?: number
          imported_at?: string | null
          kgs_cubado?: number | null
          kgs_declarado?: number | null
          kgs_real?: number | null
          nfs_embarcadas?: string | null
          nro_pedido?: string | null
          obs_diversos?: string | null
          org_cidade?: string | null
          prv_chegada?: string | null
          prv_entrega?: string | null
          prz_contratado?: string | null
          qtd_volumes?: number | null
          referencia?: string | null
          rmt_cnpj?: string | null
          rmt_nome?: string | null
          situacao?: string | null
          tpo_embarque?: string | null
          updated_at?: string | null
          vinculo_confirmado_em?: string | null
          vinculo_confirmado_por?: string | null
          vinculo_origem?: string | null
          vlr_mercadoria?: number | null
        }
        Relationships: []
      }
      sup_compradores: {
        Row: {
          ativo: boolean
          email: string | null
          grupo_compras: string
          nome_comprador: string
          usuario_sistema: string | null
        }
        Insert: {
          ativo?: boolean
          email?: string | null
          grupo_compras: string
          nome_comprador: string
          usuario_sistema?: string | null
        }
        Update: {
          ativo?: boolean
          email?: string | null
          grupo_compras?: string
          nome_comprador?: string
          usuario_sistema?: string | null
        }
        Relationships: []
      }
      sup_contratos_movimentacoes: {
        Row: {
          created_at: string
          data_hora: string
          duracao_etapa_segundos: number | null
          id: string
          identificador: string
          item_id: string
          metadados: Json
          observacao: string | null
          origem: string
          status_anterior: string
          status_anterior_label: string | null
          status_novo: string
          status_novo_label: string | null
          tipo_entidade: string
          titulo: string
          usuario_id: string | null
          usuario_nome: string | null
        }
        Insert: {
          created_at?: string
          data_hora?: string
          duracao_etapa_segundos?: number | null
          id: string
          identificador: string
          item_id: string
          metadados?: Json
          observacao?: string | null
          origem?: string
          status_anterior: string
          status_anterior_label?: string | null
          status_novo: string
          status_novo_label?: string | null
          tipo_entidade?: string
          titulo: string
          usuario_id?: string | null
          usuario_nome?: string | null
        }
        Update: {
          created_at?: string
          data_hora?: string
          duracao_etapa_segundos?: number | null
          id?: string
          identificador?: string
          item_id?: string
          metadados?: Json
          observacao?: string | null
          origem?: string
          status_anterior?: string
          status_anterior_label?: string | null
          status_novo?: string
          status_novo_label?: string | null
          tipo_entidade?: string
          titulo?: string
          usuario_id?: string | null
          usuario_nome?: string | null
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
      sup_cotacao_item_vinculos: {
        Row: {
          candidatos: Json
          confirmado_em: string | null
          confirmado_por: string | null
          confirmado_por_nome: string | null
          created_at: string
          id: string
          material_code: string | null
          material_descricao: string | null
          observacao: string | null
          origem: string
          po_cnpj: string | null
          po_data_doc: string | null
          po_doc_compra: string | null
          po_item: string | null
          po_material: string | null
          po_preco_unit: number | null
          po_qtd: number | null
          po_ri: string | null
          po_txt_breve: string | null
          proposta_item_id: string
          rm_data: string | null
          rm_item: string | null
          rm_qtd: number | null
          rm_requisicao: string | null
          rm_requisitante: string | null
          rm_ri: string | null
          rm_texto_breve: string | null
          rodada_id: string | null
          score: number | null
          sinais: Json
          status: string
          updated_at: string
        }
        Insert: {
          candidatos?: Json
          confirmado_em?: string | null
          confirmado_por?: string | null
          confirmado_por_nome?: string | null
          created_at?: string
          id?: string
          material_code?: string | null
          material_descricao?: string | null
          observacao?: string | null
          origem?: string
          po_cnpj?: string | null
          po_data_doc?: string | null
          po_doc_compra?: string | null
          po_item?: string | null
          po_material?: string | null
          po_preco_unit?: number | null
          po_qtd?: number | null
          po_ri?: string | null
          po_txt_breve?: string | null
          proposta_item_id: string
          rm_data?: string | null
          rm_item?: string | null
          rm_qtd?: number | null
          rm_requisicao?: string | null
          rm_requisitante?: string | null
          rm_ri?: string | null
          rm_texto_breve?: string | null
          rodada_id?: string | null
          score?: number | null
          sinais?: Json
          status?: string
          updated_at?: string
        }
        Update: {
          candidatos?: Json
          confirmado_em?: string | null
          confirmado_por?: string | null
          confirmado_por_nome?: string | null
          created_at?: string
          id?: string
          material_code?: string | null
          material_descricao?: string | null
          observacao?: string | null
          origem?: string
          po_cnpj?: string | null
          po_data_doc?: string | null
          po_doc_compra?: string | null
          po_item?: string | null
          po_material?: string | null
          po_preco_unit?: number | null
          po_qtd?: number | null
          po_ri?: string | null
          po_txt_breve?: string | null
          proposta_item_id?: string
          rm_data?: string | null
          rm_item?: string | null
          rm_qtd?: number | null
          rm_requisicao?: string | null
          rm_requisitante?: string | null
          rm_ri?: string | null
          rm_texto_breve?: string | null
          rodada_id?: string | null
          score?: number | null
          sinais?: Json
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sup_cotacao_item_vinculos_confirmado_por_fkey"
            columns: ["confirmado_por"]
            isOneToOne: false
            referencedRelation: "core_perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sup_cotacao_item_vinculos_confirmado_por_fkey"
            columns: ["confirmado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sup_cotacao_item_vinculos_proposta_item_id_fkey"
            columns: ["proposta_item_id"]
            isOneToOne: true
            referencedRelation: "cotacao_proposta_itens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sup_cotacao_item_vinculos_proposta_item_id_fkey"
            columns: ["proposta_item_id"]
            isOneToOne: true
            referencedRelation: "sup_cotacao_proposta_itens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sup_cotacao_item_vinculos_proposta_item_id_fkey"
            columns: ["proposta_item_id"]
            isOneToOne: true
            referencedRelation: "vw_cotacao_pedido_auditoria"
            referencedColumns: ["proposta_item_id"]
          },
          {
            foreignKeyName: "sup_cotacao_item_vinculos_rodada_id_fkey"
            columns: ["rodada_id"]
            isOneToOne: false
            referencedRelation: "sup_cotacao_vinculo_rodadas"
            referencedColumns: ["id"]
          },
        ]
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
          busca_norm: string | null
          campos_faltantes: string[]
          cfop: string | null
          codigo_fiscal: string | null
          codigo_produto: string | null
          created_at: string
          cst: string | null
          custo_total_item: number | null
          desconsiderado: boolean
          descricao_produto: string
          extraido_raw: Json | null
          fora_escopo: boolean
          frete_teorico: number | null
          id: string
          item_numero: number | null
          mapa_observacao: string | null
          mapa_selecionado: boolean
          mapa_selecionado_em: string | null
          mapa_selecionado_por: string | null
          marca_fabricante: string | null
          material_code: string | null
          ncm: string | null
          peso_origem: string | null
          peso_unitario_kg: number | null
          preco_liquido_total: number | null
          preco_liquido_unitario: number | null
          preco_total_item: number | null
          preco_unitario: number | null
          processo_item_id: string | null
          proposta_id: string
          quantidade: number | null
          ri: string | null
          unidade_medida: string | null
          vinculo_divergencias: string[]
          vinculo_origem: string
          vinculo_score: number | null
        }
        Insert: {
          aliquota_cofins_pct?: number | null
          aliquota_icms_pct?: number | null
          aliquota_ipi_pct?: number | null
          aliquota_pis_pct?: number | null
          busca_norm?: string | null
          campos_faltantes?: string[]
          cfop?: string | null
          codigo_fiscal?: string | null
          codigo_produto?: string | null
          created_at?: string
          cst?: string | null
          custo_total_item?: number | null
          desconsiderado?: boolean
          descricao_produto: string
          extraido_raw?: Json | null
          fora_escopo?: boolean
          frete_teorico?: number | null
          id?: string
          item_numero?: number | null
          mapa_observacao?: string | null
          mapa_selecionado?: boolean
          mapa_selecionado_em?: string | null
          mapa_selecionado_por?: string | null
          marca_fabricante?: string | null
          material_code?: string | null
          ncm?: string | null
          peso_origem?: string | null
          peso_unitario_kg?: number | null
          preco_liquido_total?: number | null
          preco_liquido_unitario?: number | null
          preco_total_item?: number | null
          preco_unitario?: number | null
          processo_item_id?: string | null
          proposta_id: string
          quantidade?: number | null
          ri?: string | null
          unidade_medida?: string | null
          vinculo_divergencias?: string[]
          vinculo_origem?: string
          vinculo_score?: number | null
        }
        Update: {
          aliquota_cofins_pct?: number | null
          aliquota_icms_pct?: number | null
          aliquota_ipi_pct?: number | null
          aliquota_pis_pct?: number | null
          busca_norm?: string | null
          campos_faltantes?: string[]
          cfop?: string | null
          codigo_fiscal?: string | null
          codigo_produto?: string | null
          created_at?: string
          cst?: string | null
          custo_total_item?: number | null
          desconsiderado?: boolean
          descricao_produto?: string
          extraido_raw?: Json | null
          fora_escopo?: boolean
          frete_teorico?: number | null
          id?: string
          item_numero?: number | null
          mapa_observacao?: string | null
          mapa_selecionado?: boolean
          mapa_selecionado_em?: string | null
          mapa_selecionado_por?: string | null
          marca_fabricante?: string | null
          material_code?: string | null
          ncm?: string | null
          peso_origem?: string | null
          peso_unitario_kg?: number | null
          preco_liquido_total?: number | null
          preco_liquido_unitario?: number | null
          preco_total_item?: number | null
          preco_unitario?: number | null
          processo_item_id?: string | null
          proposta_id?: string
          quantidade?: number | null
          ri?: string | null
          unidade_medida?: string | null
          vinculo_divergencias?: string[]
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
          {
            foreignKeyName: "cotacao_proposta_itens_proposta_id_fkey"
            columns: ["proposta_id"]
            isOneToOne: false
            referencedRelation: "vw_cotacao_pedido_auditoria"
            referencedColumns: ["proposta_id"]
          },
        ]
      }
      sup_cotacao_propostas: {
        Row: {
          arquivo_markdown: string | null
          arquivo_markdown_editado_em: string | null
          arquivo_markdown_editado_por: string | null
          arquivo_mime_type: string | null
          arquivo_origem: string | null
          arquivo_storage_path: string | null
          arquivo_tamanho_bytes: number | null
          busca_norm: string | null
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
          valor_desconto: number | null
          valor_frete: number | null
          valor_total_orcamento: number | null
          vendedor_email: string | null
          vendedor_nome: string | null
          vendedor_telefone: string | null
        }
        Insert: {
          arquivo_markdown?: string | null
          arquivo_markdown_editado_em?: string | null
          arquivo_markdown_editado_por?: string | null
          arquivo_mime_type?: string | null
          arquivo_origem?: string | null
          arquivo_storage_path?: string | null
          arquivo_tamanho_bytes?: number | null
          busca_norm?: string | null
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
          valor_desconto?: number | null
          valor_frete?: number | null
          valor_total_orcamento?: number | null
          vendedor_email?: string | null
          vendedor_nome?: string | null
          vendedor_telefone?: string | null
        }
        Update: {
          arquivo_markdown?: string | null
          arquivo_markdown_editado_em?: string | null
          arquivo_markdown_editado_por?: string | null
          arquivo_mime_type?: string | null
          arquivo_origem?: string | null
          arquivo_storage_path?: string | null
          arquivo_tamanho_bytes?: number | null
          busca_norm?: string | null
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
          valor_desconto?: number | null
          valor_frete?: number | null
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
      sup_cotacao_vinculo_rodadas: {
        Row: {
          created_at: string
          executado_por: string | null
          executado_por_nome: string | null
          id: string
          itens_analisados: number
          parametros: Json
          sem_candidato: number
          sugestoes: number
          tipo: string
          vinculos_auto: number
        }
        Insert: {
          created_at?: string
          executado_por?: string | null
          executado_por_nome?: string | null
          id?: string
          itens_analisados?: number
          parametros?: Json
          sem_candidato?: number
          sugestoes?: number
          tipo: string
          vinculos_auto?: number
        }
        Update: {
          created_at?: string
          executado_por?: string | null
          executado_por_nome?: string | null
          id?: string
          itens_analisados?: number
          parametros?: Json
          sem_candidato?: number
          sugestoes?: number
          tipo?: string
          vinculos_auto?: number
        }
        Relationships: [
          {
            foreignKeyName: "sup_cotacao_vinculo_rodadas_executado_por_fkey"
            columns: ["executado_por"]
            isOneToOne: false
            referencedRelation: "core_perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sup_cotacao_vinculo_rodadas_executado_por_fkey"
            columns: ["executado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      sup_diligenciamento_itens: {
        Row: {
          atualizado_por_id: string | null
          atualizado_por_nome: string | null
          created_at: string
          data_faturamento_transportadora: string | null
          doc_compra: string | null
          previsao_manual: string | null
          ri: string
          ri_po: string
          transportadora: string | null
          updated_at: string
        }
        Insert: {
          atualizado_por_id?: string | null
          atualizado_por_nome?: string | null
          created_at?: string
          data_faturamento_transportadora?: string | null
          doc_compra?: string | null
          previsao_manual?: string | null
          ri: string
          ri_po: string
          transportadora?: string | null
          updated_at?: string
        }
        Update: {
          atualizado_por_id?: string | null
          atualizado_por_nome?: string | null
          created_at?: string
          data_faturamento_transportadora?: string | null
          doc_compra?: string | null
          previsao_manual?: string | null
          ri?: string
          ri_po?: string
          transportadora?: string | null
          updated_at?: string
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
      sup_grupo_comprador_mercadorias: {
        Row: {
          ativo: boolean
          classificacao_nivel1: string | null
          classificacao_nivel2: string | null
          created_at: string
          grupo_compras: string
          grupo_mercadoria_codigo: string
          grupo_mercadoria_nome: string
          id: string
          nome_comprador: string
          observacao: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          classificacao_nivel1?: string | null
          classificacao_nivel2?: string | null
          created_at?: string
          grupo_compras: string
          grupo_mercadoria_codigo: string
          grupo_mercadoria_nome: string
          id?: string
          nome_comprador: string
          observacao?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          classificacao_nivel1?: string | null
          classificacao_nivel2?: string | null
          created_at?: string
          grupo_compras?: string
          grupo_mercadoria_codigo?: string
          grupo_mercadoria_nome?: string
          id?: string
          nome_comprador?: string
          observacao?: string | null
          updated_at?: string
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
      sup_materiais_genericos: {
        Row: {
          created_at: string
          marcado_por: string | null
          marcado_por_nome: string | null
          material_code: string
          motivo: string | null
        }
        Insert: {
          created_at?: string
          marcado_por?: string | null
          marcado_por_nome?: string | null
          material_code: string
          motivo?: string | null
        }
        Update: {
          created_at?: string
          marcado_por?: string | null
          marcado_por_nome?: string | null
          material_code?: string
          motivo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sup_materiais_genericos_marcado_por_fkey"
            columns: ["marcado_por"]
            isOneToOne: false
            referencedRelation: "core_perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sup_materiais_genericos_marcado_por_fkey"
            columns: ["marcado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sup_pend_processamento_nf: {
        Row: {
          chegou: string | null
          classif_causa: string | null
          classif_impacto: string | null
          classif_recorrencia: string | null
          classif_responsavel: string | null
          comprador: string | null
          created_at: string
          data_emissao_nfse: string | null
          data_envio: string | null
          documento_compras: string | null
          documento_status: string | null
          fornecedor: string | null
          historico_acoes: Json | null
          id: string
          imagem_path: string | null
          imagem_paths: string[] | null
          mes_competencia: string | null
          modelo: string
          nfse_cancelada: string | null
          nome_fornecedor: string | null
          numero_nfse: string
          observacao: string | null
          observacao_chamado: string | null
          ordem: number
          protocolo: string
          request_id: string
          resolucao: string | null
          resolvido_em: string | null
          resolvido_por: string | null
          serie: string | null
          status: string
          uf_emissor: string | null
          valor_nfse: number | null
          valor_nfse_raw: string | null
        }
        Insert: {
          chegou?: string | null
          classif_causa?: string | null
          classif_impacto?: string | null
          classif_recorrencia?: string | null
          classif_responsavel?: string | null
          comprador?: string | null
          created_at?: string
          data_emissao_nfse?: string | null
          data_envio?: string | null
          documento_compras?: string | null
          documento_status?: string | null
          fornecedor?: string | null
          historico_acoes?: Json | null
          id?: string
          imagem_path?: string | null
          imagem_paths?: string[] | null
          mes_competencia?: string | null
          modelo?: string
          nfse_cancelada?: string | null
          nome_fornecedor?: string | null
          numero_nfse: string
          observacao?: string | null
          observacao_chamado?: string | null
          ordem?: number
          protocolo: string
          request_id: string
          resolucao?: string | null
          resolvido_em?: string | null
          resolvido_por?: string | null
          serie?: string | null
          status?: string
          uf_emissor?: string | null
          valor_nfse?: number | null
          valor_nfse_raw?: string | null
        }
        Update: {
          chegou?: string | null
          classif_causa?: string | null
          classif_impacto?: string | null
          classif_recorrencia?: string | null
          classif_responsavel?: string | null
          comprador?: string | null
          created_at?: string
          data_emissao_nfse?: string | null
          data_envio?: string | null
          documento_compras?: string | null
          documento_status?: string | null
          fornecedor?: string | null
          historico_acoes?: Json | null
          id?: string
          imagem_path?: string | null
          imagem_paths?: string[] | null
          mes_competencia?: string | null
          modelo?: string
          nfse_cancelada?: string | null
          nome_fornecedor?: string | null
          numero_nfse?: string
          observacao?: string | null
          observacao_chamado?: string | null
          ordem?: number
          protocolo?: string
          request_id?: string
          resolucao?: string | null
          resolvido_em?: string | null
          resolvido_por?: string | null
          serie?: string | null
          status?: string
          uf_emissor?: string | null
          valor_nfse?: number | null
          valor_nfse_raw?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sup_pend_processamento_nf_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "core_solicitacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sup_pend_processamento_nf_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sup_pend_processamento_nf_resolvido_por_fkey"
            columns: ["resolvido_por"]
            isOneToOne: false
            referencedRelation: "core_perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sup_pend_processamento_nf_resolvido_por_fkey"
            columns: ["resolvido_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sup_prazos_transporte: {
        Row: {
          created_at: string
          dias_corridos: number
          id: string
          transportadora: string
          uf: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          dias_corridos: number
          id?: string
          transportadora?: string
          uf?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          dias_corridos?: number
          id?: string
          transportadora?: string
          uf?: string
          updated_at?: string
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
      sup_setor_compradores: {
        Row: {
          ativo: boolean
          created_at: string
          grupo_compras: string
          id: string
          nome_comprador: string | null
          setor_id: string
          setor_nome: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          grupo_compras: string
          id: string
          nome_comprador?: string | null
          setor_id: string
          setor_nome: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          grupo_compras?: string
          id?: string
          nome_comprador?: string | null
          setor_id?: string
          setor_nome?: string
          updated_at?: string
        }
        Relationships: []
      }
      sup_transportadoras: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome?: string
          updated_at?: string
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
          ativo: boolean | null
          email: string | null
          grupo_compras: string | null
          nome_comprador: string | null
          usuario_sistema: string | null
        }
        Insert: {
          ativo?: boolean | null
          email?: string | null
          grupo_compras?: string | null
          nome_comprador?: string | null
          usuario_sistema?: string | null
        }
        Update: {
          ativo?: boolean | null
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
          codigo_fiscal: string | null
          codigo_produto: string | null
          created_at: string | null
          cst: string | null
          custo_total_item: number | null
          desconsiderado: boolean | null
          descricao_produto: string | null
          extraido_raw: Json | null
          fora_escopo: boolean | null
          frete_teorico: number | null
          id: string | null
          item_numero: number | null
          mapa_selecionado: boolean | null
          mapa_selecionado_em: string | null
          mapa_selecionado_por: string | null
          marca_fabricante: string | null
          material_code: string | null
          ncm: string | null
          peso_origem: string | null
          peso_unitario_kg: number | null
          preco_liquido_total: number | null
          preco_liquido_unitario: number | null
          preco_total_item: number | null
          preco_unitario: number | null
          processo_item_id: string | null
          proposta_id: string | null
          quantidade: number | null
          ri: string | null
          unidade_medida: string | null
          vinculo_divergencias: string[] | null
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
          codigo_fiscal?: string | null
          codigo_produto?: string | null
          created_at?: string | null
          cst?: string | null
          custo_total_item?: number | null
          desconsiderado?: boolean | null
          descricao_produto?: string | null
          extraido_raw?: Json | null
          fora_escopo?: boolean | null
          frete_teorico?: number | null
          id?: string | null
          item_numero?: number | null
          mapa_selecionado?: boolean | null
          mapa_selecionado_em?: string | null
          mapa_selecionado_por?: string | null
          marca_fabricante?: string | null
          material_code?: string | null
          ncm?: string | null
          peso_origem?: string | null
          peso_unitario_kg?: number | null
          preco_liquido_total?: number | null
          preco_liquido_unitario?: number | null
          preco_total_item?: number | null
          preco_unitario?: number | null
          processo_item_id?: string | null
          proposta_id?: string | null
          quantidade?: number | null
          ri?: string | null
          unidade_medida?: string | null
          vinculo_divergencias?: string[] | null
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
          codigo_fiscal?: string | null
          codigo_produto?: string | null
          created_at?: string | null
          cst?: string | null
          custo_total_item?: number | null
          desconsiderado?: boolean | null
          descricao_produto?: string | null
          extraido_raw?: Json | null
          fora_escopo?: boolean | null
          frete_teorico?: number | null
          id?: string | null
          item_numero?: number | null
          mapa_selecionado?: boolean | null
          mapa_selecionado_em?: string | null
          mapa_selecionado_por?: string | null
          marca_fabricante?: string | null
          material_code?: string | null
          ncm?: string | null
          peso_origem?: string | null
          peso_unitario_kg?: number | null
          preco_liquido_total?: number | null
          preco_liquido_unitario?: number | null
          preco_total_item?: number | null
          preco_unitario?: number | null
          processo_item_id?: string | null
          proposta_id?: string | null
          quantidade?: number | null
          ri?: string | null
          unidade_medida?: string | null
          vinculo_divergencias?: string[] | null
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
          {
            foreignKeyName: "cotacao_proposta_itens_proposta_id_fkey"
            columns: ["proposta_id"]
            isOneToOne: false
            referencedRelation: "vw_cotacao_pedido_auditoria"
            referencedColumns: ["proposta_id"]
          },
        ]
      }
      cotacao_propostas: {
        Row: {
          arquivo_markdown: string | null
          arquivo_markdown_editado_em: string | null
          arquivo_markdown_editado_por: string | null
          arquivo_mime_type: string | null
          arquivo_origem: string | null
          arquivo_storage_path: string | null
          arquivo_tamanho_bytes: number | null
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
          valor_desconto: number | null
          valor_frete: number | null
          valor_total_orcamento: number | null
          vendedor_email: string | null
          vendedor_nome: string | null
          vendedor_telefone: string | null
        }
        Insert: {
          arquivo_markdown?: string | null
          arquivo_markdown_editado_em?: string | null
          arquivo_markdown_editado_por?: string | null
          arquivo_mime_type?: string | null
          arquivo_origem?: string | null
          arquivo_storage_path?: string | null
          arquivo_tamanho_bytes?: number | null
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
          valor_desconto?: number | null
          valor_frete?: number | null
          valor_total_orcamento?: number | null
          vendedor_email?: string | null
          vendedor_nome?: string | null
          vendedor_telefone?: string | null
        }
        Update: {
          arquivo_markdown?: string | null
          arquivo_markdown_editado_em?: string | null
          arquivo_markdown_editado_por?: string | null
          arquivo_mime_type?: string | null
          arquivo_origem?: string | null
          arquivo_storage_path?: string | null
          arquivo_tamanho_bytes?: number | null
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
          valor_desconto?: number | null
          valor_frete?: number | null
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
          tipo: string | null
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
          tipo?: string | null
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
          tipo?: string | null
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
          area_solicitante: string | null
          cnpj: string | null
          cod_forn: string | null
          contrato: string | null
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
          tipo_doc_compra: string | null
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
      mv_pedidos_por_ri: {
        Row: {
          contrato: string | null
          criado_por_pedido: string | null
          data_doc: string | null
          data_migo: string | null
          dias_atrasado: number | null
          doc_compra: string | null
          dt_remessa: string | null
          eflag_e: string | null
          fornecedor_codigo: string | null
          fornecedor_nome: string | null
          item: string | null
          item_contrato: string | null
          modificado_em: string | null
          por: string | null
          preco_liquido_unit: number | null
          qtd_fornecida: number | null
          qtd_pedido: number | null
          ri: string | null
          status_entrega: string | null
          tipo_doc_compra: string | null
          unidade_medida_pedido: string | null
          valor_em_brl: number | null
          valor_liquido: number | null
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
      prod_apt_realizado_semanal: {
        Row: {
          ano: number | null
          etapa_id: string | null
          quantidade: number | null
          semana: number | null
        }
        Relationships: [
          {
            foreignKeyName: "prod_apt_lancamento_itens_etapa_id_fkey"
            columns: ["etapa_id"]
            isOneToOne: false
            referencedRelation: "prod_apt_etapas"
            referencedColumns: ["id"]
          },
        ]
      }
      prod_entrega_matriz: {
        Row: {
          projeto: string | null
          pronto_expedicao: boolean | null
          subprojeto_id: string | null
          torre_numero: number | null
          total_virolas: number | null
          tramo: string | null
          virolas_liberadas: number | null
        }
        Relationships: [
          {
            foreignKeyName: "prod_virolas_subprojeto_id_fkey"
            columns: ["subprojeto_id"]
            isOneToOne: false
            referencedRelation: "proj_subprojetos"
            referencedColumns: ["id"]
          },
        ]
      }
      prod_pendencias: {
        Row: {
          codigo: string | null
          created_at: string | null
          etapa_id: string | null
          etapa_nome: string | null
          lancamento_id: string | null
          observacao: string | null
          projeto: string | null
          status: string | null
          torre_numero: number | null
          tramo: string | null
          virola: string | null
          virola_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prod_lancamentos_etapa_id_fkey"
            columns: ["etapa_id"]
            isOneToOne: false
            referencedRelation: "prod_etapas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prod_lancamentos_virola_id_fkey"
            columns: ["virola_id"]
            isOneToOne: false
            referencedRelation: "prod_virolas"
            referencedColumns: ["id"]
          },
        ]
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
          data_entrega_confirmada: string | null
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
          data_entrega_confirmada?: string | null
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
          data_entrega_confirmada?: string | null
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
      ssma_fichas_epi_consumo: {
        Row: {
          ca: string | null
          categoria: string | null
          codigo: string | null
          codigo_sap: string | null
          data_devolucao: string | null
          data_entrega: string | null
          descricao: string | null
          epi_book_id: string | null
          ficha_id: string | null
          fora_da_matriz: boolean | null
          funcao_id: string | null
          funcao_nome: string | null
          grupo_epi: string | null
          item_id: string | null
          motivo: number | null
          nome: string | null
          pessoa_id: string | null
          quantidade: number | null
          registro: string | null
          setor: string | null
          tamanho: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ssma_fichas_epi_funcao_id_fkey"
            columns: ["funcao_id"]
            isOneToOne: false
            referencedRelation: "ssma_epi_funcoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ssma_fichas_epi_itens_epi_book_id_fkey"
            columns: ["epi_book_id"]
            isOneToOne: false
            referencedRelation: "ssma_book_epis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ssma_fichas_epi_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "rh_pessoas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ssma_fichas_epi_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "vw_rh_rotas_colaboradores"
            referencedColumns: ["pessoa_id"]
          },
          {
            foreignKeyName: "ssma_fichas_epi_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "vw_rh_treinamentos_vencimentos"
            referencedColumns: ["pessoa_id"]
          },
        ]
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
      vw_almox_controle_estoque: {
        Row: {
          aplicacao: string | null
          baixa_direta_quantidade: number | null
          baixa_direta_valor: number | null
          categoria: string | null
          centro: string | null
          config_id: string | null
          config_updated_at: string | null
          consumo_total: number | null
          consumo_valor: number | null
          curva_abc: string | null
          depositos: Json | null
          descricao: string | null
          dias_uteis: number | null
          entrada_quantidade: number | null
          entrada_valor: number | null
          estoque_importado_em: string | null
          estoque_maximo_override: number | null
          estoque_minimo_override: number | null
          intervalo_compra_dias: number | null
          janela_fim: string | null
          janela_inicio: string | null
          lead_time_dias: number | null
          material: string | null
          movimentos_importados_em: string | null
          movimentos_mensais: Json | null
          opcoes_quantidade_por_torre: Json | null
          override_id: string | null
          override_justificativa: string | null
          override_updated_at: string | null
          override_updated_by: string | null
          pedidos: Json | null
          po_quantidade_pendente: number | null
          pos_abertas: number | null
          preco_medio_sap: number | null
          producao_quantidade: number | null
          producao_valor: number | null
          quantidade_depositos: number | null
          quantidade_por_torre: number | null
          quantidade_projetos: number | null
          quantidade_recebida: number | null
          rm_quantidade: number | null
          rms: Json | null
          rms_abertas: number | null
          saldo_reposicao: number | null
          saldo_total: number | null
          sisten_adi: number | null
          sisten_consumo_diario: number | null
          sisten_consumo_total: number | null
          sisten_cv2: number | null
          sisten_janela_fim: string | null
          sisten_janela_inicio: string | null
          sisten_lead_dias: number | null
          sisten_lead_proprio: boolean | null
          sisten_lote_p90: number | null
          tem_override: boolean | null
          tipo_gestao: string | null
          tipo_material: string | null
          ultima_data_recebimento: string | null
          ultimo_movimento: string | null
          umb: string | null
          valor_estoque: number | null
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
      vw_cotacao_pedido_auditoria: {
        Row: {
          cnpj_menor_preco: string | null
          cnpj_pedido: string | null
          custo_versus_menor: number | null
          data_doc: string | null
          data_proposta: string | null
          delta_preco_unit: number | null
          descricao_cotada: string | null
          div_fornecedor: boolean | null
          div_preco: boolean | null
          div_quantidade: boolean | null
          doc_compra: string | null
          fornecedor_menor_preco: string | null
          fornecedor_pedido: string | null
          fornecedores_cotados: number | null
          item: string | null
          material: string | null
          material_generico: boolean | null
          menor_preco_cotado: number | null
          motivo_generico: string | null
          po_id: string | null
          preco_cotado_fornecedor: number | null
          preco_pedido: number | null
          proposta_id: string | null
          proposta_item_id: string | null
          qtd_cotada: number | null
          qtd_pedido: number | null
          reqc: string | null
          ri: string | null
          txt_breve: string | null
        }
        Relationships: []
      }
      vw_cotacao_preco_por_material: {
        Row: {
          cotacoes: number | null
          fornecedores: number | null
          itens_distintos: number | null
          maior_preco: number | null
          material_code: string | null
          material_descricao: string | null
          material_generico: boolean | null
          menor_preco: number | null
          preco_medio: number | null
          ultima_cotacao: string | null
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
      vw_fin_faturas_fornecedor_item: {
        Row: {
          cnpj_fornecedor: string | null
          data_documento: string | null
          data_ultimo_pagamento: string | null
          descricao_item: string | null
          fornecedor_codigo: string | null
          fornecedor_nome: string | null
          id: number | null
          item_chave: string | null
          item_pedido: string | null
          material: string | null
          numero_nf_normalizado: string | null
          numero_pedido: string | null
          numero_servico: string | null
          preco_liquido: number | null
          preco_unitario: number | null
          qtd_lancamentos_pagamento: number | null
          qtd_linhas_nf: number | null
          qtd_linhas_zf0076: number | null
          qtd_pedidos_zf0076: number | null
          quantidade: number | null
          status_pagamento: string | null
          tipo_item: string | null
          unidade_medida: string | null
          valor_item_nf: number | null
          valor_nf: number | null
          valor_pago_bruto: number | null
          valor_pago_considerado_nf: number | null
          valor_pago_excedente_nf: number | null
          valor_pago_rateado: number | null
        }
        Relationships: []
      }
      vw_fin_fbl1n_analise_deduplicada: {
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
      vw_fin_fbl1n_deduplicado: {
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
        Relationships: []
      }
      vw_fin_nf_realizado_rubrica: {
        Row: {
          categoria_nota_fiscal: string | null
          centro: string | null
          cfop: string | null
          classificacao_nivel1: string | null
          classificacao_nivel2: string | null
          cnpj_fornecedor: string | null
          data_documento: string | null
          data_lancamento: string | null
          data_ultimo_pagamento: string | null
          descricao_item: string | null
          entra_realizado: boolean | null
          excluido_por_material: boolean | null
          fornecedor_codigo: string | null
          fornecedor_nome: string | null
          grupo_mercadoria_codigo: string | null
          grupo_mercadoria_nome: string | null
          id: number | null
          item_pedido: string | null
          material: string | null
          natureza: string | null
          numero_nf: string | null
          numero_pedido: string | null
          numero_servico: string | null
          origem_grupo: string | null
          origem_rubrica: string | null
          quantidade: number | null
          rubrica_id: string | null
          rubrica_nome: string | null
          serie_nf: string | null
          status_pagamento: string | null
          tipo_item: string | null
          unidade_medida: string | null
          valor: number | null
          valor_pago_rateado: number | null
        }
        Relationships: []
      }
      vw_fin_pagamentos_detalhe_rubrica: {
        Row: {
          centro: string | null
          centro_lucro: string | null
          classificacao_nivel1: string | null
          classificacao_nivel2: string | null
          condicoes_pagamento: string | null
          conta: string | null
          data_compensacao: string | null
          data_documento: string | null
          data_lancamento: string | null
          data_pagamento: string | null
          doc_compensacao: string | null
          documento_compras: string | null
          elemento_pep: string | null
          empresa: string | null
          fornecedor_codigo: string | null
          fornecedor_nome: string | null
          grupo_mercadoria_codigo: string | null
          grupo_mercadoria_nome: string | null
          id: number | null
          moeda_documento: string | null
          nf_referencia: string | null
          numero_documento: string | null
          origem_mapeamento: string | null
          rubrica_id: string | null
          rubrica_nome: string | null
          texto: string | null
          tipo_documento: string | null
          valor: number | null
          vencimento_liquido: string | null
          vencimento_original: string | null
        }
        Relationships: []
      }
      vw_fin_pagamentos_por_rubrica: {
        Row: {
          qtd_lancamentos: number | null
          rubrica_id: string | null
          valor_pagamentos: number | null
        }
        Relationships: []
      }
      vw_fin_pedidos_detalhe_rubrica: {
        Row: {
          centro: string | null
          classificacao_nivel1: string | null
          classificacao_nivel2: string | null
          cnpj_fornecedor: string | null
          contrato: string | null
          criado_por_pedido: string | null
          data_doc: string | null
          data_rc: string | null
          deposito: string | null
          doc_compra: string | null
          fornecedor_codigo: string | null
          fornecedor_nome: string | null
          grupo_mercadoria_codigo: string | null
          grupo_mercadoria_nome: string | null
          id: string | null
          item: string | null
          item_contrato: string | null
          material_codigo: string | null
          material_descricao: string | null
          moeda: string | null
          origem_mapeamento: string | null
          preco_liquido_unit: number | null
          qtd_pedido: number | null
          regiao_uf: string | null
          requisicao_compra: string | null
          requisitante: string | null
          rubrica_id: string | null
          rubrica_nome: string | null
          tipo_doc_compra: string | null
          unidade_medida_pedido: string | null
          valor: number | null
        }
        Relationships: []
      }
      vw_fin_pedidos_por_rubrica: {
        Row: {
          qtd_itens: number | null
          qtd_pedidos: number | null
          rubrica_id: string | null
          valor_pedidos: number | null
        }
        Relationships: []
      }
      vw_fin_preco_fornecedor_item: {
        Row: {
          cnpj_fornecedor: string | null
          data_documento: string | null
          data_ultimo_pagamento: string | null
          descricao_item: string | null
          fornecedor_codigo: string | null
          fornecedor_nome: string | null
          id: number | null
          item_chave: string | null
          item_pedido: string | null
          material: string | null
          numero_nf_normalizado: string | null
          numero_pedido: string | null
          numero_servico: string | null
          preco_liquido: number | null
          preco_unitario: number | null
          preco_unitario_anterior: number | null
          qtd_lancamentos_pagamento: number | null
          qtd_linhas_nf: number | null
          qtd_linhas_zf0076: number | null
          qtd_pedidos_zf0076: number | null
          quantidade: number | null
          status_pagamento: string | null
          tipo_item: string | null
          unidade_medida: string | null
          valor_item_nf: number | null
          valor_nf: number | null
          valor_pago_bruto: number | null
          valor_pago_considerado_nf: number | null
          valor_pago_excedente_nf: number | null
          valor_pago_rateado: number | null
          variacao_preco_pct: number | null
        }
        Relationships: []
      }
      vw_fin_reconciliacao_fiscal_por_pedido: {
        Row: {
          numero_pedido: string | null
          qtd_itens_fiscais: number | null
          qtd_nfs_com_evidencia_zf0076: number | null
          qtd_nfs_fiscais: number | null
          qtd_nfs_pagas_parcial: number | null
          qtd_nfs_pagas_total: number | null
          qtd_nfs_sem_vinculo_fbl1n: number | null
          valor_a_conciliar: number | null
          valor_faturado_fiscal: number | null
          valor_pago_rastreado: number | null
        }
        Relationships: []
      }
      vw_fin_reconciliacao_pedidos_enriquecida: {
        Row: {
          centro: string | null
          data_aprovacao_pedido: string | null
          data_criacao_pedido: string | null
          empresa: string | null
          fornecedor: string | null
          fornecedores_fiscais: string | null
          materiais_nomes: string | null
          numero_pedido: string | null
          origem_conciliacao: string | null
          qtd_fornecedores_fiscais: number | null
          qtd_itens: number | null
          qtd_itens_fiscais: number | null
          qtd_materiais: number | null
          qtd_miros: number | null
          qtd_nfs: number | null
          qtd_nfs_abertas: number | null
          qtd_nfs_com_evidencia_zf0076: number | null
          qtd_nfs_fiscais: number | null
          qtd_nfs_pagas: number | null
          qtd_nfs_pagas_parcial: number | null
          qtd_nfs_pagas_total: number | null
          qtd_nfs_sem_vinculo_fbl1n: number | null
          razao_social_fornecedor: string | null
          status_pagamento: string | null
          total_em_aberto: number | null
          total_faturado_miro: number | null
          total_pago: number | null
          valor_a_conciliar: number | null
          valor_faturado_fiscal: number | null
          valor_pago_rastreado: number | null
          valor_pedido: number | null
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
          area_solicitante: string | null
          cidade: string | null
          classificacao_nivel1: string | null
          classificacao_nivel2: string | null
          cnpj: string | null
          cod_forn: string | null
          codigo_postal: string | null
          contrato: string | null
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
          tipo_doc_compra: string | null
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
          pep_nivel: number | null
          pep_nome: string | null
          pep_projeto: string | null
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
      vw_pedidos_conciliacao_detalhes: {
        Row: {
          ano_miro: string | null
          centro: string | null
          data_compensacao: string | null
          data_documento_miro: string | null
          data_lancamento_fbl1n: string | null
          data_lancamento_migo: string | null
          data_lancamento_miro: string | null
          data_pagamento: string | null
          doc_compensacao: string | null
          doc_fbl1n: string | null
          doc_migo: string | null
          doc_miro: string | null
          doc_pagamento: string | null
          empresa: string | null
          fornecedor: string | null
          id: number | null
          item: string | null
          material: string | null
          material_codigo: string | null
          material_descricao: string | null
          montante_migo: number | null
          montante_miro: number | null
          nf_referencia: string | null
          numero_doc_contabil: string | null
          numero_pedido: string | null
          qtd_migo: number | null
          qtd_miro: number | null
          razao_social_fornecedor: string | null
          status_nf: string | null
          tipo_documento: string | null
          vencimento_liquido: string | null
        }
        Relationships: []
      }
      vw_pedidos_conciliacao_pagamentos: {
        Row: {
          centro: string | null
          data_aprovacao_pedido: string | null
          data_criacao_pedido: string | null
          empresa: string | null
          fornecedor: string | null
          numero_pedido: string | null
          qtd_itens: number | null
          qtd_materiais: number | null
          qtd_miros: number | null
          qtd_nfs: number | null
          qtd_nfs_abertas: number | null
          qtd_nfs_pagas: number | null
          razao_social_fornecedor: string | null
          status_pagamento: string | null
          total_em_aberto: number | null
          total_faturado_miro: number | null
          total_pago: number | null
          valor_pedido: number | null
        }
        Relationships: []
      }
      vw_planejamento_acompanhamento_base: {
        Row: {
          bd: string | null
          calandra: string | null
          cort_x_expedicao: string | null
          data_expedicao: string | null
          data_inicio_internos: string | null
          data_termino_internos: string | null
          data_termino_saw3: string | null
          descricao: string | null
          id: string | null
          importacao_id: string | null
          inicio: string | null
          lead_time_calandra: number | null
          lead_time_corte: number | null
          linha_origem: number | null
          marcador_x: string | null
          marcador_x_expedicao: string | null
          metragem_reparos: number | null
          numero_torre: number | null
          posto_atual: string | null
          posto_origem: string | null
          projeto: string | null
          qtd_reparos: number | null
          raw_data: Json | null
          sequencial: number | null
          tempo_armazenagem: number | null
          termino_final: string | null
          termino_nav01: string | null
          total_nav01: number | null
          total_turno_final: number | null
          total_turno_internos: number | null
          total_turno_saw3: number | null
          tramo: string | null
          turno_inicio: number | null
          turno_inicio_internos: number | null
          turno_lib_jato: number | null
          turno_termino_final: number | null
          turno_termino_nav01: number | null
          turno_termino_saw3: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bd_acompanhamento_geral_importacao_id_fkey"
            columns: ["importacao_id"]
            isOneToOne: false
            referencedRelation: "planejamento_importacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_planejamento_acompanhamento_divergencias: {
        Row: {
          divergencia: string | null
          fim_internos: string | null
          fim_nav01: string | null
          fim_saw3: string | null
          fim_white: string | null
          sequencial: number | null
          torre: string | null
          tramo: string | null
        }
        Relationships: []
      }
      vw_planejamento_acompanhamento_engine: {
        Row: {
          avanco_tramo: number | null
          ciclo_total: number | null
          consumo_prazo: number | null
          dias_sem_movto: number | null
          divergencia: string | null
          du_decorridos: number | null
          etapas_concl: number | null
          fim_internos: string | null
          fim_nav01: string | null
          fim_saw3: string | null
          fim_white: string | null
          id: string | null
          importacao_id: string | null
          inicio: string | null
          linha_origem: number | null
          lt_internos: number | null
          lt_nav01: number | null
          lt_saw3: number | null
          lt_white: number | null
          metragem_reparos: number | null
          ok_internos: number | null
          ok_nav01: number | null
          ok_saw3: number | null
          ok_white: number | null
          peso_projeto: number | null
          plano_du: number | null
          posto_atual: string | null
          prox_etapa: string | null
          rank_aging: number | null
          rank_reparos: number | null
          raw_data: Json | null
          reparos: number | null
          saldo_prazo: number | null
          sequencial: number | null
          status: string | null
          torre: string | null
          torre_numero: string | null
          tramo: string | null
          ultima_conclusao: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bd_acompanhamento_geral_importacao_id_fkey"
            columns: ["importacao_id"]
            isOneToOne: false
            referencedRelation: "planejamento_importacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_planejamento_acompanhamento_pcp: {
        Row: {
          amostra: number | null
          etapa: string | null
          maximo: number | null
          media: number | null
          mediana: number | null
          minimo: number | null
        }
        Relationships: []
      }
      vw_planejamento_acompanhamento_postos: {
        Row: {
          aging_medio: number | null
          percentual_carteira: number | null
          posto: string | null
          tramos: number | null
        }
        Relationships: []
      }
      vw_planejamento_acompanhamento_reparos: {
        Row: {
          metragem_reparos: number | null
          posto_atual: string | null
          rank_reparos: number | null
          reparos: number | null
          sequencial: number | null
          torre: string | null
          tramo: string | null
        }
        Relationships: []
      }
      vw_planejamento_acompanhamento_stage_lead_times: {
        Row: {
          etapa: string | null
          lead_time: number | null
          sequencial: number | null
          torre: string | null
          tramo: string | null
        }
        Relationships: []
      }
      vw_planejamento_acompanhamento_torres: {
        Row: {
          avanco_medio: number | null
          etapas_concl: number | null
          torre: string | null
          tramos: number | null
          tramos_white: number | null
        }
        Relationships: []
      }
      vw_planejamento_acompanhamento_weekly: {
        Row: {
          internos_acum: number | null
          internos_sem: number | null
          nav01_acum: number | null
          nav01_sem: number | null
          saw3_acum: number | null
          saw3_sem: number | null
          semana_fim: string | null
          semana_inicio: string | null
          white_acum: number | null
          white_sem: number | null
        }
        Relationships: []
      }
      vw_proj_bom_arvore: {
        Row: {
          caminho: string[] | null
          cod_sap: string | null
          codigo_equivalente_qingdao: string | null
          delivery_at: string | null
          descricao: string | null
          description: string | null
          each_weight_kg: number | null
          find_number: string | null
          folha: boolean | null
          fornecedor: string | null
          grupo: string | null
          grupo_norm: string | null
          id: number | null
          level: number | null
          parent_id: number | null
          part_number: string | null
          part_number_norm: string | null
          profundidade: number | null
          projeto: string | null
          qtd_por_torre: number | null
          revision: string | null
          secao: string | null
          subconjunto: string | null
          total_weight_kg: number | null
          tramo: string | null
          uom: string | null
        }
        Relationships: []
      }
      vw_proj_consumo_tramo: {
        Row: {
          cod_sap: string | null
          linhas_bom: number | null
          part_number: string | null
          part_number_norm: string | null
          projeto: string | null
          qtd_por_torre: number | null
          secao: string | null
          subconjuntos: string[] | null
          tramo: string | null
        }
        Relationships: []
      }
      vw_proj_saldo_almox: {
        Row: {
          cod_sap: string | null
          descricao: string | null
          description: string | null
          entradas: number | null
          estoque_minimo: number | null
          fornecedor: string | null
          item_id: string | null
          localizador: string | null
          part_number: string | null
          part_number_norm: string | null
          projeto: string | null
          refugo: number | null
          saidas: number | null
          saldo: number | null
          uom: string | null
        }
        Relationships: []
      }
      vw_rh_ase_itens: {
        Row: {
          cargo: string | null
          contato_transporte: string | null
          created_at: string | null
          hora_entrada: string | null
          hora_saida: string | null
          horario_embarque_transporte: string | null
          id: string | null
          intervalo_minutos: number | null
          nome: string | null
          observacao: string | null
          percentual_he: number | null
          pessoa_id: string | null
          ponto_embarque_transporte: string | null
          refeicao: boolean | null
          registro: string | null
          rota_transporte: string | null
          solicitacao_id: string | null
          total_horas: number | null
          transporte: boolean | null
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
            foreignKeyName: "rh_ase_itens_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "vw_rh_rotas_colaboradores"
            referencedColumns: ["pessoa_id"]
          },
          {
            foreignKeyName: "rh_ase_itens_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "vw_rh_treinamentos_vencimentos"
            referencedColumns: ["pessoa_id"]
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
      vw_rh_rotas_colaboradores: {
        Row: {
          cargo: string | null
          contato: string | null
          horario_embarque: string | null
          nome: string | null
          pessoa_ativa: boolean | null
          pessoa_id: string | null
          ponto_embarque: string | null
          registro: string | null
          rota: string | null
          rota_ativa: boolean | null
          rota_id: string | null
        }
        Relationships: []
      }
      vw_rh_treinamentos_vencimentos: {
        Row: {
          area: string | null
          cargo: string | null
          colaborador: string | null
          data_capacitacao: string | null
          dias_para_vencimento: number | null
          id: string | null
          lideranca: string | null
          pessoa_id: string | null
          registro: string | null
          status: string | null
          status_calculado: string | null
          treinamento: string | null
          treinamento_id: string | null
          validade_em: string | null
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
          contrato_po: string | null
          criado_por: string | null
          criado_por_pedido: string | null
          ctg_class_cont: string | null
          data_da_liberacao: string | null
          data_da_solicitacao: string | null
          data_de_remessa: string | null
          data_do_pedido: string | null
          data_entrega_confirmada: string | null
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
          eflag_po: string | null
          eliminado: boolean | null
          faixa_atraso: string | null
          fornecedor_code: string | null
          fornecedor_fixo: string | null
          fornecedor_name: string | null
          grupo_de_compradores: string | null
          grupo_de_mercadorias: string | null
          it_contrato_superior: string | null
          item_contrato_po: string | null
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
          origem_po: string | null
          peca_original: string | null
          pedido: string | null
          por_po: string | null
          preco_unit_po: number | null
          presente_ultima_carga: boolean | null
          qtd_fornecida_po: number | null
          qtd_fornecida_total: number | null
          qtd_pedida_total: number | null
          qtd_po: number | null
          qtd_solicitada: number | null
          quantidade_pedida: number | null
          remessas_de_ate: string | null
          requisicao_de_compra: string | null
          requisicao_externa: string | null
          requisitante: string | null
          ri: string | null
          ri_po: string | null
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
          tipo_doc_po: string | null
          total_pos: number | null
          unidade_de_medida: string | null
          unidade_po: string | null
          valor_po: number | null
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
      alm_inv_adicionar_itens: {
        Args: { p_id: string; p_itens: Json }
        Returns: number
      }
      alm_inv_atualizar_status: {
        Args: { p_inventario: string }
        Returns: undefined
      }
      alm_inv_criar: {
        Args: { p_inv: Json; p_itens: Json }
        Returns: {
          codigo: string
          concluido_em: string | null
          conferente_nome: string | null
          created_at: string
          criado_por_id: string | null
          criado_por_nome: string | null
          criterio: string | null
          data: string
          excluido: boolean
          excluido_em: string | null
          excluido_por: string | null
          id: string
          observacao: string | null
          status: string
          updated_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "alm_inventarios"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      alm_inv_encerrar_item: {
        Args: { p_item_id: string; p_por: string }
        Returns: Json
      }
      alm_inv_excluir: {
        Args: { p_id: string; p_por: string }
        Returns: undefined
      }
      alm_inv_inserir_itens: {
        Args: { p_inventario: string; p_itens: Json }
        Returns: number
      }
      alm_inv_max_contagens: { Args: never; Returns: number }
      alm_inv_registrar_contagem: {
        Args: {
          p_endereco: string
          p_item_id: string
          p_observacao: string
          p_por: string
          p_quantidade: number
          p_validade: string
        }
        Returns: Json
      }
      alm_inv_remover_item: { Args: { p_item_id: string }; Returns: undefined }
      alm_inv_saldo_zl0024: {
        Args: { p_deposito: string; p_material: string }
        Returns: number
      }
      alm_receb_editar_carga: {
        Args: { p_id: string; p_patch: Json; p_user?: Json }
        Returns: Json
      }
      alm_receb_editar_conferencia: {
        Args: { p_cab: Json; p_id: string; p_itens?: Json; p_user?: Json }
        Returns: Json
      }
      alm_receb_editar_nc: {
        Args: { p_acao?: Json; p_id: string; p_patch?: Json; p_user?: Json }
        Returns: Json
      }
      alm_receb_excluir_nc_aberta: {
        Args: { p_id: string; p_user?: Json }
        Returns: Json
      }
      alm_receb_pedidos_ordenados: { Args: { p: Json }; Returns: string[] }
      alm_receb_po_linhas: {
        Args: { p_pedido: string }
        Returns: {
          descricao: string
          fornecedor: string
          linha_ref: string
          material_code: string
          qtd_ja_fornecida: number
          qtd_pedido: number
          rm: string
          unidade: string
        }[]
      }
      alm_receb_proximo_codigo: {
        Args: { p_data: string; p_prefixo: string; p_tabela: string }
        Returns: string
      }
      alm_receb_registrar_carga: { Args: { p_carga: Json }; Returns: Json }
      alm_receb_registrar_conferencia: {
        Args: { p_cab: Json; p_itens: Json; p_nc?: Json }
        Returns: Json
      }
      alm_receb_registrar_nc: {
        Args: { p_nc: Json; p_user?: Json }
        Returns: Json
      }
      alm_req_balcao_diff: {
        Args: { p_campo: string; p_de: string; p_para: string }
        Returns: Json
      }
      alm_req_balcao_excluir: {
        Args: { p_id: string; p_por: string }
        Returns: undefined
      }
      alm_req_balcao_importar_sap: {
        Args: { p_arquivo: string; p_linhas: Json; p_por: string }
        Returns: Json
      }
      alm_req_balcao_informar_doc_sap: {
        Args: { p_doc: string; p_ids: string[]; p_por: string }
        Returns: number
      }
      alm_req_balcao_log: {
        Args: {
          p_acao: string
          p_alteracoes: Json
          p_por?: string
          p_requisicao: string
          p_resumo: string
        }
        Returns: undefined
      }
      alm_req_balcao_reabrir_exportacao: {
        Args: { p_ids: string[] }
        Returns: number
      }
      alm_req_balcao_registrar_exportacao: {
        Args: { p_arquivo: string; p_ids: string[]; p_por: string }
        Returns: {
          arquivo: string
          codigos: string[]
          created_at: string
          exportado_por_id: string | null
          exportado_por_nome: string | null
          id: string
          total_itens: number
          total_requisicoes: number
        }
        SetofOptions: {
          from: "*"
          to: "alm_req_balcao_exportacoes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      alm_req_balcao_salvar: {
        Args: { p_id: string; p_itens: Json; p_req: Json }
        Returns: {
          aplicacao: string
          aplicacao_pep: string | null
          aplicacao_setor_id: string | null
          codigo: string
          colaborador_id: string | null
          colaborador_nome: string
          colaborador_registro: string | null
          confirmada_em: string | null
          confirmada_por: string | null
          created_at: string
          criado_por_id: string | null
          criado_por_nome: string | null
          data: string
          deposito_destino: string | null
          deposito_origem: string
          doc_sap: string | null
          doc_sap_em: string | null
          doc_sap_por: string | null
          excluido: boolean
          excluido_em: string | null
          excluido_por: string | null
          exportacao_id: string | null
          id: string
          observacao: string | null
          origem: string | null
          origem_ref: string | null
          pendente_confirmacao: boolean
          tipo_movimento: string
          turno: string | null
          updated_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "alm_req_balcao"
          isOneToOne: true
          isSetofReturn: false
        }
      }
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
          status_geral: string
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
      candidatos_ia_vinculo: {
        Args: { p_limite?: number; p_top?: number; p_vinculo_ids?: string[] }
        Returns: Json
      }
      casar_cotacao_pedidos: {
        Args: {
          p_desde?: string
          p_executado_por?: string
          p_executado_por_nome?: string
          p_janela_dias?: number
          p_score_auto?: number
          p_simular?: boolean
        }
        Returns: Json
      }
      casar_cotacao_requisicoes: {
        Args: {
          p_desde?: string
          p_executado_por?: string
          p_executado_por_nome?: string
          p_janela_antes?: number
          p_janela_depois?: number
          p_score_auto?: number
          p_simular?: boolean
        }
        Returns: Json
      }
      confirmar_vinculo_cotacao: {
        Args: {
          p_aceitar: boolean
          p_material_code?: string
          p_observacao?: string
          p_usuario_id?: string
          p_usuario_nome?: string
          p_vinculo_id: string
        }
        Returns: Json
      }
      escapar_like: { Args: { t: string }; Returns: string }
      f_norm_cotacao: { Args: { p_texto: string }; Returns: string }
      f_unaccent: { Args: { "": string }; Returns: string }
      fin_fat_editar: {
        Args: { p_id: string; p_patch: Json; p_user?: Json }
        Returns: Json
      }
      form_pode_editar: { Args: { p_dono: string }; Returns: boolean }
      has_page_access: { Args: { required_page: string }; Returns: boolean }
      has_role: { Args: { required_role: string }; Returns: boolean }
      ipca_fator: { Args: { p_data: string }; Returns: number }
      ipca_mes_referencia: { Args: never; Returns: string }
      listar_categorias_materiais: {
        Args: never
        Returns: {
          category: string
        }[]
      }
      obter_maiores_codigos_catalogo: { Args: never; Returns: Json }
      planejamento_dias_uteis: {
        Args: { p_fim: string; p_inicio: string }
        Returns: number
      }
      planejamento_importar_acompanhamento: {
        Args: {
          p_arquivo_bd: string
          p_arquivo_cronograma: string
          p_bd_rows: Json
          p_cabecalhos_bd: Json
          p_cronograma_rows?: Json
        }
        Returns: Json
      }
      pode_abrir_rm: { Args: never; Returns: boolean }
      pode_gerir_cadastro_sap: { Args: never; Returns: boolean }
      pode_gerir_contratos: { Args: never; Returns: boolean }
      pode_gerir_cotacoes: { Args: never; Returns: boolean }
      pode_gerir_rh: { Args: { p_page_id?: string }; Returns: boolean }
      prod_apt_excluir_lancamento: { Args: { p_id: string }; Returns: Json }
      prod_apt_proximo_codigo: { Args: { p_data: string }; Returns: string }
      prod_apt_salvar_lancamento: { Args: { p: Json }; Returns: Json }
      prod_editar_lancamento: {
        Args: { p_alterado_por_nome?: string; p_campos: Json; p_id: string }
        Returns: Json
      }
      prod_fila_etapa: {
        Args: {
          p_etapa_id: string
          p_projeto?: string
          p_subprojeto_id?: string
        }
        Returns: {
          corrigir: boolean
          rastreabilidade_herdada: string
          torre_numero: number
          tramo: string
          ultimo_lancamento_id: string
          virola: string
          virola_id: string
        }[]
      }
      prod_proximo_codigo: {
        Args: { p_data: string; p_prefixo: string }
        Returns: string
      }
      prod_registrar_lancamento: { Args: { p: Json }; Returns: Json }
      prod_salvar_detalhes_lancamento: {
        Args: { p_detalhes: Json; p_lancamento_id: string }
        Returns: undefined
      }
      proj_abrir_ordem_premontagem: {
        Args: { p_alvos: string[]; p_itens: Json; p_ordem: Json }
        Returns: Json
      }
      proj_concluir_premontagem: {
        Args: { p_kits: Json; p_ordem_id: string; p_usuario?: Json }
        Returns: Json
      }
      proj_confirmar_separacao_premontagem: {
        Args: { p_ordem_id: string; p_usuario?: Json }
        Returns: Json
      }
      proj_entregar_producao: { Args: { p_entrega: Json }; Returns: Json }
      proj_folhas_de: {
        Args: { p_bom_linha_id: number }
        Returns: {
          bom_linha_id: number
          cod_sap: string
          descricao: string
          part_number: string
          part_number_norm: string
          qtd_por_torre: number
          secao: string
          subconjunto: string
          tramo: string
        }[]
      }
      proj_marcar_item_ordem_premontagem: {
        Args: {
          p_ordem_item_id: string
          p_qtd_separada: number
          p_separado: boolean
          p_usuario?: Json
        }
        Returns: undefined
      }
      proj_matriz_salvar_celula: {
        Args: {
          p_observacao?: string
          p_serie?: string
          p_status: number
          p_subkit: string
          p_subprojeto_id: string
          p_torre_numero: number
          p_tramo: string
          p_user?: Json
        }
        Returns: Json
      }
      proj_normalizar_pn: { Args: { p_pn: string }; Returns: string }
      proj_previa_explosao: {
        Args: { p_bom_linha_id: number; p_quantidade: number }
        Returns: {
          bom_linha_id: number
          cod_sap: string
          descricao: string
          part_number: string
          part_number_norm: string
          qtd_creditada: number
          qtd_por_torre: number
          secao: string
          subconjunto: string
          torres_equivalentes: number
          tramo: string
        }[]
      }
      proj_registrar_entrada_nf: {
        Args: { p_movimentos: Json; p_nota: Json; p_pais: Json }
        Returns: Json
      }
      proj_registrar_sobressalente: {
        Args: { p_cab: Json; p_itens: Json }
        Returns: Json
      }
      proj_sincronizar_itens: { Args: { p_projeto?: string }; Returns: number }
      proj_validar_saldo: { Args: { p_itens: Json }; Returns: undefined }
      proximo_numero_solicitacao: {
        Args: { p_criticidade: number }
        Returns: string
      }
      qua_checklist_exp_pode_assinar: {
        Args: { p_checklist_id: string }
        Returns: boolean
      }
      qua_checklist_exp_pode_editar: {
        Args: { p_checklist_id: string }
        Returns: boolean
      }
      qua_internos_eh_qualidade: { Args: never; Returns: boolean }
      qua_internos_pode_editar: {
        Args: { p_checklist_id: string }
        Returns: boolean
      }
      refresh_benchmark_material: { Args: never; Returns: undefined }
      refresh_historico_pedidos: { Args: never; Returns: undefined }
      refresh_material_sinais: { Args: never; Returns: undefined }
      registrar_vinculos_ia: {
        Args: {
          p_executado_por?: string
          p_executado_por_nome?: string
          p_modelo?: string
          p_resultados: Json
        }
        Returns: Json
      }
      requests_pode_editar:
        | {
            Args: {
              p_atendente_id: string
              p_comprador_id: string
              p_solicitante_id: string
              p_type: string
            }
            Returns: boolean
          }
        | {
            Args: {
              p_atendente_id: string
              p_comprador_id: string
              p_solicitante_id: string
              p_target_sector_id?: string
              p_type: string
            }
            Returns: boolean
          }
      salvar_processo_cotacao: { Args: { p_payload: Json }; Returns: Json }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      ssma_book_epis_pode_acessar: { Args: never; Returns: boolean }
      ssma_ficha_epi_assinar: {
        Args: { p_assinatura: string; p_ficha_id: string }
        Returns: undefined
      }
      ssma_ficha_epi_cancelar: {
        Args: { p_ficha_id: string; p_motivo: string }
        Returns: undefined
      }
      ssma_ficha_epi_criar: {
        Args: { p_ficha: Json; p_itens: Json }
        Returns: string
      }
      ssma_ficha_epi_registrar_devolucao: {
        Args: { p_data: string; p_item_id: string; p_observacao?: string }
        Returns: undefined
      }
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
      sup_epi_status_materiais: {
        Args: { p_codigos: string[] }
        Returns: {
          book_inativo: boolean
          cas: string[]
          codigo: string
          descricao_book: string
          eh_grupo_epi: boolean
          no_book: boolean
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
      usuario_do_setor: { Args: { p_setor: string }; Returns: boolean }
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
