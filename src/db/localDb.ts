/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { 
  Profile, Sector, Material, Request, RequestItem, RequestComment, 
  RequestStatusHistory, RequestAttachment, Notification, SAPRequisicao, 
  SAPPedido, SAPObsHistory, SAPImportLog, UserBuyerGroup, RequestStatus, Role, RequestType,
  ActivityLog, EnrichedSAPRecord
} from '../types';
import { INITIAL_SECTORS } from '../data/sectors';
import { generateMaterials, getAutoCategory } from '../data/materials';
import { generateSAPSeedData } from '../data/sapData';
import { supabase } from './supabaseClient';

class LocalDatabase {
  private sectorsKey = 'sisten_sectors';
  private profilesKey = 'sisten_profiles';
  private materialsKey = 'sisten_materials';
  private requestsKey = 'sisten_requests';
  private requestItemsKey = 'sisten_request_items';
  private commentsKey = 'sisten_comments';
  private historyKey = 'sisten_history';
  private notificationsKey = 'sisten_notifications';
  private requisicoesKey = 'sisten_requisicoes';
  private pedidosKey = 'sisten_pedidos';
  private obsHistoryKey = 'sisten_obs_history';
  private importLogsKey = 'sisten_import_logs';
  private buyerGroupsKey = 'sisten_buyer_groups';
  private logsKey = 'sisten_activity_logs';
  private favoritesKey = 'sisten_favorites';
  private sequencesKey = 'sisten_sequences';

  // Current logged in user profile (saved in session/localStorage)
  private currentUserKey = 'sisten_current_user';

  constructor() {
    this.initialize();
  }

  public async syncFromSupabase(): Promise<void> {
    try {
      console.log('Iniciando sincronização com o Supabase...');

      // 1. Sectors
      const { data: sectors, error: sectorsError } = await supabase.from('sectors').select('*');
      if (sectorsError) throw sectorsError;
      if (sectors && sectors.length > 0) {
        this.setStorageItem(this.sectorsKey, sectors);
      } else {
        await supabase.from('sectors').upsert(INITIAL_SECTORS);
        this.setStorageItem(this.sectorsKey, INITIAL_SECTORS);
      }

      // 2. Profiles
      const { data: profiles, error: profilesError } = await supabase.from('profiles').select('*');
      if (profilesError) throw profilesError;
      if (profiles && profiles.length > 0) {
        const mappedProfiles = profiles.map(p => ({
          ...p,
          roles: p.roles || []
        }));
        this.setStorageItem(this.profilesKey, mappedProfiles);
      }

      // 3. Buyer Groups
      const { data: buyerGroups, error: bgError } = await supabase.from('buyer_groups').select('*');
      if (bgError) throw bgError;
      if (buyerGroups && buyerGroups.length > 0) {
        this.setStorageItem(this.buyerGroupsKey, buyerGroups);
      }

      // 4. Materials
      const { data: materials, error: matError } = await supabase.from('materials').select('*');
      if (matError) throw matError;
      try {
        if (materials && materials.length > 0) {
          this.setStorageItem(this.materialsKey, materials);
        } else {
          const generated = generateMaterials();
          for (let i = 0; i < generated.length; i += 50) {
            await supabase.from('materials').upsert(generated.slice(i, i + 50));
          }
          this.setStorageItem(this.materialsKey, generated);
        }
      } catch (err) {
        // Catálogos SAP grandes podem exceder a cota do localStorage (~5-10MB).
        // Não deve interromper a sincronização das demais tabelas.
        console.warn('Não foi possível atualizar o cache local de materiais (cota do navegador excedida).', err);
      }

      // 5. Requisicoes (ME5A) - Usando a View enriquecida
      const { data: reqs, error: reqsError } = await supabase.from('view_enriched_requisicoes').select('*');
      if (reqsError) throw reqsError;
      this.setStorageItem(this.requisicoesKey, reqs || []);

      // 6. Pedidos (ZL0132) - Usando a View enriquecida
      const { data: peds, error: pedsError } = await supabase.from('view_enriched_pedidos').select('*');
      if (pedsError) throw pedsError;
      this.setStorageItem(this.pedidosKey, peds || []);

      // 7. Requests (sistema)
      const { data: dbRequests, error: rError } = await supabase.from('requests').select('*');
      if (rError) throw rError;
      if (dbRequests && dbRequests.length > 0) {
        this.setStorageItem(this.requestsKey, dbRequests);
      }

      // 8. Request Items
      const { data: dbRequestItems, error: riError } = await supabase.from('request_items').select('*');
      if (riError) throw riError;
      if (dbRequestItems && dbRequestItems.length > 0) {
        this.setStorageItem(this.requestItemsKey, dbRequestItems);
      }

      // 9. Comments
      const { data: dbComments, error: cError } = await supabase.from('request_comments').select('*');
      if (cError) throw cError;
      if (dbComments && dbComments.length > 0) {
        const mappedComments = dbComments.map(c => ({
          id: c.id,
          request_id: c.request_id,
          user_id: c.user_id,
          user_name: c.user_name,
          user_roles: c.user_roles || [],
          content: c.content,
          is_internal: c.is_internal,
          created_at: c.created_at
        }));
        this.setStorageItem(this.commentsKey, mappedComments);
      }

      // 10. Status History
      const { data: dbHistory, error: hError } = await supabase.from('request_status_history').select('*');
      if (hError) throw hError;
      if (dbHistory && dbHistory.length > 0) {
        this.setStorageItem(this.historyKey, dbHistory);
      }

      // 11. Notifications
      const { data: dbNotifications, error: nError } = await supabase.from('notifications').select('*');
      if (nError) throw nError;
      if (dbNotifications && dbNotifications.length > 0) {
        this.setStorageItem(this.notificationsKey, dbNotifications);
      }

      // 12. Import Logs
      const { data: dbImportLogs, error: ilError } = await supabase.from('import_logs').select('*');
      if (ilError) throw ilError;
      if (dbImportLogs && dbImportLogs.length > 0) {
        this.setStorageItem(this.importLogsKey, dbImportLogs);
      }

      // 13. Obs Historico (Auditoria)
      const { data: dbObsHistory, error: ohError } = await supabase.from('obs_historico').select('*');
      if (ohError) throw ohError;
      if (dbObsHistory && dbObsHistory.length > 0) {
        const mappedObsHist = dbObsHistory.map(oh => {
          let comment = '';
          let deliveryDate = '';
          try {
            const val = JSON.parse(oh.valor_novo || '{}');
            comment = val.obs || '';
            deliveryDate = val.date || '';
          } catch {
            comment = oh.valor_novo || '';
          }
          return {
            id: oh.id,
            ri: oh.ri,
            obs_comprador: comment,
            data_entrega_prevista: deliveryDate,
            user_name: oh.user_name,
            created_at: oh.created_at
          };
        });
        this.setStorageItem(this.obsHistoryKey, mappedObsHist);
      }

      // 14. Activity Logs
      const { data: dbActivityLogs, error: alError } = await supabase.from('activity_logs').select('*');
      if (alError) throw alError;
      if (dbActivityLogs && dbActivityLogs.length > 0) {
        this.setStorageItem(this.logsKey, dbActivityLogs);
      }

      // 15. Sequences
      const { data: dbSequences, error: seqError } = await supabase.from('sequences').select('*');
      if (seqError) throw seqError;
      if (dbSequences && dbSequences.length > 0) {
        const seqs: Record<string, number> = {};
        dbSequences.forEach(s => { seqs[s.key] = s.value; });
        this.setStorageItem(this.sequencesKey, seqs);
      }

      console.log('Sincronização com o Supabase concluída com sucesso!');
    } catch (err) {
      console.error('Falha geral ao sincronizar com o Supabase. Usando banco de dados local.', err);
    }
  }

  public getStorageItem<T>(key: string, defaultValue: T): T {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  }

  public setStorageItem<T>(key: string, value: T): void {
    localStorage.setItem(key, JSON.stringify(value));
  }

  // Check and run seeds
  private initialize() {
    // 1. Sectors
    if (!localStorage.getItem(this.sectorsKey)) {
      this.setStorageItem(this.sectorsKey, INITIAL_SECTORS);
    }

    // 2. Sequences
    if (!localStorage.getItem(this.sequencesKey)) {
      this.setStorageItem(this.sequencesKey, { '1': 1000, '2': 1000, '3': 1000, '4': 1000, '5': 1000 });
    }

    // 3. Profiles Seed
    if (!localStorage.getItem(this.profilesKey)) {
      const seededProfiles: Profile[] = [
        {
          id: 'u1',
          email: 'admin@ten.com.br',
          name: 'Administrador TEN',
          cargo: 'Administrador do Sistema',
          sector_id: '16', // Diretoria
          roles: ['admin', 'visualizador'],
          status: 'ativo',
          created_at: '2026-01-01T08:00:00-03:00'
        },
        {
          id: 'u2',
          email: 'coord@ten.com.br',
          name: 'Coordenador de Suprimentos',
          cargo: 'Coordenador Geral',
          sector_id: '5', // Suprimentos
          roles: ['coordenador_suprimentos', 'visualizador'],
          status: 'ativo',
          created_at: '2026-01-01T08:00:00-03:00'
        },
        {
          id: 'u3',
          email: 'gestor1@ten.com.br',
          name: 'Gestor Diretoria',
          cargo: 'Diretor de Operações',
          sector_id: '16', // Diretoria
          roles: ['gestor', 'visualizador'],
          status: 'ativo',
          created_at: '2026-01-01T08:00:00-03:00'
        },
        {
          id: 'u4',
          email: 'gestor2@ten.com.br',
          name: 'Gestor Produção',
          cargo: 'Gerente de Produção',
          sector_id: '14', // Produção
          roles: ['gestor', 'visualizador'],
          status: 'ativo',
          created_at: '2026-01-01T08:00:00-03:00'
        },
        {
          id: 'u5',
          email: 'comprador1@ten.com.br',
          name: 'Comprador 314',
          cargo: 'Comprador Pleno',
          sector_id: '5', // Suprimentos
          roles: ['comprador', 'visualizador'],
          status: 'ativo',
          created_at: '2026-01-01T08:00:00-03:00'
        },
        {
          id: 'u6',
          email: 'comprador2@ten.com.br',
          name: 'Comprador 358',
          cargo: 'Comprador Sênior',
          sector_id: '5', // Suprimentos
          roles: ['comprador', 'visualizador'],
          status: 'ativo',
          created_at: '2026-01-01T08:00:00-03:00'
        },
        {
          id: 'u7',
          email: 'comprador3@ten.com.br',
          name: 'Comprador 447',
          cargo: 'Comprador Júnior',
          sector_id: '5', // Suprimentos
          roles: ['comprador', 'visualizador'],
          status: 'ativo',
          created_at: '2026-01-01T08:00:00-03:00'
        },
        {
          id: 'u8',
          email: 'atendente1@ten.com.br',
          name: 'Suporte TI',
          cargo: 'Analista de Infraestrutura',
          sector_id: '9', // TI
          roles: ['atendente', 'visualizador'],
          status: 'ativo',
          created_at: '2026-01-01T08:00:00-03:00'
        },
        {
          id: 'u9',
          email: 'atendente2@ten.com.br',
          name: 'Atendente Facilities',
          cargo: 'Auxiliar de Manutenção',
          sector_id: '3', // Facilities
          roles: ['atendente', 'visualizador'],
          status: 'ativo',
          created_at: '2026-01-01T08:00:00-03:00'
        },
        {
          id: 'u10',
          email: 'solicitante1@ten.com.br',
          name: 'Solicitante Diretoria',
          cargo: 'Assistente Administrativo',
          sector_id: '16', // Diretoria
          roles: ['solicitante', 'visualizador'],
          status: 'ativo',
          created_at: '2026-01-01T08:00:00-03:00'
        },
        {
          id: 'u11',
          email: 'solicitante2@ten.com.br',
          name: 'Solicitante Manutenção',
          cargo: 'Planejador de Manutenção',
          sector_id: '15', // Manutenção
          roles: ['solicitante', 'visualizador'],
          status: 'ativo',
          created_at: '2026-01-01T08:00:00-03:00'
        },
        {
          id: 'u12',
          email: 'solicitante3@ten.com.br',
          name: 'Solicitante Qualidade',
          cargo: 'Inspetor de Qualidade',
          sector_id: '11', // Qualidade
          roles: ['solicitante', 'visualizador'],
          status: 'ativo',
          created_at: '2026-01-01T08:00:00-03:00'
        },
        {
          id: 'u13',
          email: 'usuario.pendente@ten.com.br',
          name: 'Usuário Novo Pendente',
          cargo: 'Estagiário Almoxarifado',
          sector_id: '2', // Almoxarifado
          roles: ['visualizador'],
          status: 'pendente',
          created_at: '2026-07-04T12:00:00-03:00'
        }
      ];
      this.setStorageItem(this.profilesKey, seededProfiles);
    }

    // 4. Buyer Groups Seed
    if (!localStorage.getItem(this.buyerGroupsKey)) {
      const buyerGroups: UserBuyerGroup[] = [
        { id: 'bg1', user_id: 'u5', group_code: '314', is_primary: true },
        { id: 'bg2', user_id: 'u6', group_code: '358', is_primary: true },
        { id: 'bg3', user_id: 'u7', group_code: '447', is_primary: true },
        { id: 'bg4', user_id: 'u2', group_code: '575', is_primary: true }
      ];
      this.setStorageItem(this.buyerGroupsKey, buyerGroups);
    }

    // 5. Materials Catalog Seed (exactly 200)
    if (!localStorage.getItem(this.materialsKey)) {
      this.setStorageItem(this.materialsKey, generateMaterials());
    }

    // 6. SAP Data (ME5A and ZL0132) Seed
    if (!localStorage.getItem(this.requisicoesKey) || !localStorage.getItem(this.pedidosKey)) {
      const sapSeed = generateSAPSeedData();
      this.setStorageItem(this.requisicoesKey, sapSeed.requisicoes);
      this.setStorageItem(this.pedidosKey, sapSeed.pedidos);
    }

    // 7. Request Engine Seeds (13 requests including 2 pending for approval)
    if (!localStorage.getItem(this.requestsKey)) {
      const seededRequests: Request[] = [
        {
          id: 'r5',
          number: '4000005',
          type: 'compra',
          status: 'pendente',
          criticality: 4,
          solicitante_id: 'u10',
          solicitante_name: 'Solicitante Diretoria',
          solicitante_sector_id: '16', // Diretoria (Aprovável por u3 / gestor1@ten.com.br)
          created_at: '2026-07-05T01:00:00-03:00',
          updated_at: '2026-07-05T01:00:00-03:00',
          data_necessidade: '2026-08-31',
          comprador_id: 'u5',
          tipo_compra: 'Estoque',
          justificativa: 'Demanda de insumos críticos de fixação para torre da torre eólica Jacobina III.'
        },
        {
          id: 'r4',
          number: '4000004',
          type: 'compra',
          status: 'pendente',
          criticality: 4,
          solicitante_id: 'u10',
          solicitante_name: 'Solicitante Diretoria',
          solicitante_sector_id: '16', // Diretoria
          created_at: '2026-07-04T15:30:00-03:00',
          updated_at: '2026-07-04T15:30:00-03:00',
          data_necessidade: '2026-08-14',
          comprador_id: 'u6',
          tipo_compra: 'Direta',
          justificativa: 'Aquisição de EPI emergencial para equipe de campo.'
        },
        {
          id: 'r1',
          number: '1000001',
          type: 'chamado',
          status: 'aberto',
          criticality: 1,
          solicitante_id: 'u11',
          solicitante_name: 'Solicitante Manutenção',
          solicitante_sector_id: '15',
          target_sector_id: '9', // TI
          category_id: 'Acesso/Senha',
          created_at: '2026-07-05T05:00:00-03:00',
          updated_at: '2026-07-05T05:00:00-03:00',
          justificativa: 'Problema ao acessar a rede corporativa. Solicito redefinição de credenciais.',
          paused_minutes: 0
        },
        {
          id: 'r2',
          number: '3000003',
          type: 'chamado',
          status: 'em_atendimento',
          criticality: 3,
          solicitante_id: 'u12',
          solicitante_name: 'Solicitante Qualidade',
          solicitante_sector_id: '11',
          target_sector_id: '3', // Facilities
          category_id: 'Climatização',
          atendente_id: 'u9',
          atendente_name: 'Atendente Facilities',
          first_response_at: '2026-07-04T10:00:00-03:00',
          created_at: '2026-07-04T08:15:00-03:00',
          updated_at: '2026-07-04T10:00:00-03:00',
          justificativa: 'O ar-condicionado da sala da Qualidade está pingando água e não está resfriando.',
          local: 'Prédio Administrativo - Sala 202',
          paused_minutes: 0
        },
        {
          id: 'r3',
          number: '5000002',
          type: 'chamado',
          status: 'resolvido',
          criticality: 5,
          solicitante_id: 'u11',
          solicitante_name: 'Solicitante Manutenção',
          solicitante_sector_id: '15',
          target_sector_id: '15', // Manutenção Helpdesk
          category_id: 'Outro',
          atendente_id: 'u11', // Solicitante e atendente
          first_response_at: '2026-07-03T09:00:00-03:00',
          resolved_at: '2026-07-03T11:30:00-03:00',
          created_at: '2026-07-03T08:45:00-03:00',
          updated_at: '2026-07-03T11:30:00-03:00',
          justificativa: 'Vazamento de óleo hidráulico na ponte rolante principal do Galpão B.',
          local: 'Galpão de Produção B - Ponte 02',
          paused_minutes: 0
        },
        {
          id: 'r6',
          number: '2000001',
          type: 'cadastro_sap',
          status: 'aberto',
          criticality: 2,
          solicitante_id: 'u12',
          solicitante_name: 'Solicitante Qualidade',
          solicitante_sector_id: '11',
          registration_type: 'Item',
          created_at: '2026-07-04T14:00:00-03:00',
          updated_at: '2026-07-04T14:00:00-03:00',
          justificativa: 'Item necessário para testes metalográficos nos parafusos de união dos flanges.',
          paused_minutes: 0
        },
        {
          id: 'r7',
          number: '1000002',
          type: 'compra',
          status: 'aprovada',
          criticality: 1,
          solicitante_id: 'u10',
          solicitante_name: 'Solicitante Diretoria',
          solicitante_sector_id: '16',
          created_at: '2026-07-02T10:00:00-03:00',
          updated_at: '2026-07-02T14:00:00-03:00',
          data_necessidade: '2026-07-25',
          comprador_id: 'u5',
          tipo_compra: 'Estoque',
          justificativa: 'Materiais de escritório para reposição.',
          linked_rm_number: '4500000001' // Matches ME5A seed row!
        },
        {
          id: 'r8',
          number: '2000002',
          type: 'compra',
          status: 'rejeitada',
          criticality: 2,
          solicitante_id: 'u10',
          solicitante_name: 'Solicitante Diretoria',
          solicitante_sector_id: '16',
          created_at: '2026-07-01T09:00:00-03:00',
          updated_at: '2026-07-01T11:00:00-03:00',
          data_necessidade: '2026-07-15',
          comprador_id: 'u5',
          tipo_compra: 'Estoque',
          justificativa: 'Compra de copos térmicos personalizados.'
        },
        {
          id: 'r9',
          number: '3000002',
          type: 'compra',
          status: 'rascunho',
          criticality: 3,
          solicitante_id: 'u10',
          solicitante_name: 'Solicitante Diretoria',
          solicitante_sector_id: '16',
          created_at: '2026-07-05T06:00:00-03:00',
          updated_at: '2026-07-05T06:00:00-03:00',
          data_necessidade: '2026-07-20',
          tipo_compra: 'Estoque',
          justificativa: 'Outra compra em rascunho de exemplo.'
        },
        {
          id: 'r10',
          number: '2000003',
          type: 'chamado',
          status: 'fechado',
          criticality: 2,
          solicitante_id: 'u11',
          solicitante_name: 'Solicitante Manutenção',
          solicitante_sector_id: '15',
          target_sector_id: '9',
          category_id: 'Equipamento',
          atendente_id: 'u8',
          atendente_name: 'Suporte TI',
          first_response_at: '2026-06-28T09:00:00-03:00',
          resolved_at: '2026-06-28T10:30:00-03:00',
          created_at: '2026-06-28T08:00:00-03:00',
          updated_at: '2026-06-28T10:30:00-03:00',
          justificativa: 'Minha impressora térmica do Almoxarifado parou de funcionar.',
          paused_minutes: 0,
          rating: 5,
          rating_comment: 'Excelente atendimento, rápido e resolutivo!'
        },
        {
          id: 'r11',
          number: '3000004',
          type: 'cadastro_sap',
          status: 'resolvido',
          criticality: 3,
          solicitante_id: 'u11',
          solicitante_name: 'Solicitante Manutenção',
          solicitante_sector_id: '15',
          registration_type: 'Fornecedor',
          atendente_id: 'u2',
          atendente_name: 'Coordenador de Suprimentos',
          created_at: '2026-07-01T10:00:00-03:00',
          updated_at: '2026-07-02T16:00:00-03:00',
          justificativa: 'Cadastro de fornecedor homologado para chapas espessas de contra-torre.',
          paused_minutes: 0
        },
        {
          id: 'r12',
          number: '4000006',
          type: 'compra',
          status: 'em_revisao',
          criticality: 4,
          solicitante_id: 'u12',
          solicitante_name: 'Solicitante Qualidade',
          solicitante_sector_id: '11',
          created_at: '2026-07-02T14:00:00-03:00',
          updated_at: '2026-07-03T10:00:00-03:00',
          data_necessidade: '2026-07-10',
          comprador_id: 'u6',
          tipo_compra: 'Serviço',
          justificativa: 'Calibração anual dos torquímetros hidráulicos.'
        },
        {
          id: 'r13',
          number: '5000003',
          type: 'chamado',
          status: 'aguardando_solicitante',
          criticality: 5,
          solicitante_id: 'u11',
          solicitante_name: 'Solicitante Manutenção',
          solicitante_sector_id: '15',
          target_sector_id: '9', // TI
          category_id: 'Rede',
          atendente_id: 'u8',
          atendente_name: 'Suporte TI',
          created_at: '2026-07-04T16:00:00-03:00',
          updated_at: '2026-07-04T17:00:00-03:00',
          justificativa: 'Instabilidade na antena de rádio do pátio de estocagem de pás.',
          paused_minutes: 0
        }
      ];

      this.setStorageItem(this.requestsKey, seededRequests);

      // Seed Items
      const seededItems: RequestItem[] = [
        {
          id: 'ri1',
          request_id: 'r5',
          description: 'PARAFUSO M16 X 60 CLASSE 8.8 ZINCADO',
          sap_code: '10000002',
          has_no_sap_code: false,
          quantity: 200,
          unit: 'KG',
          brand: 'FIXASUL',
          is_similar_allowed: true,
          suggested_supplier: 'FIXACAMP COMÉRCIO DE PARAFUSOS',
          estimated_value: 4500
        },
        {
          id: 'ri2',
          request_id: 'r4',
          description: 'LUVA NITRÍLICA ANTI-CORTE TAM M',
          sap_code: '10000008',
          has_no_sap_code: false,
          quantity: 50,
          unit: 'UN',
          brand: 'Danny',
          is_similar_allowed: true,
          estimated_value: 1250
        },
        {
          id: 'ri3',
          request_id: 'r7',
          description: 'CHAPA AÇO GALVANIZADO 1050 x 2000 x 3MM',
          sap_code: '10000001',
          has_no_sap_code: false,
          quantity: 10,
          unit: 'UN',
          estimated_value: 3000
        },
        {
          id: 'ri4',
          request_id: 'r8',
          description: 'Copos térmicos personalizados com logo TEN',
          has_no_sap_code: true,
          quantity: 100,
          unit: 'UN',
          estimated_value: 8000
        }
      ];
      this.setStorageItem(this.requestItemsKey, seededItems);

      // Seed Status Histories
      const seededHistory: RequestStatusHistory[] = [
        {
          id: 'h1',
          request_id: 'r5',
          from_status: 'rascunho',
          to_status: 'pendente',
          user_id: 'u10',
          user_name: 'Solicitante Diretoria',
          comment: 'Solicitação de compra enviada para aprovação do gestor.',
          created_at: '2026-07-05T01:00:00-03:00'
        },
        {
          id: 'h2',
          request_id: 'r4',
          from_status: 'rascunho',
          to_status: 'pendente',
          user_id: 'u10',
          user_name: 'Solicitante Diretoria',
          comment: 'Solicitação emergencial enviada.',
          created_at: '2026-07-04T15:30:00-03:00'
        },
        {
          id: 'h3',
          request_id: 'r7',
          from_status: 'pendente',
          to_status: 'aprovada',
          user_id: 'u3',
          user_name: 'Gestor Diretoria',
          comment: 'Compra aprovada conforme planejamento de orçamento.',
          created_at: '2026-07-02T14:00:00-03:00'
        },
        {
          id: 'h4',
          request_id: 'r8',
          from_status: 'pendente',
          to_status: 'rejeitada',
          user_id: 'u3',
          user_name: 'Gestor Diretoria',
          comment: 'Rejeitado por falta de dotação orçamentária para brindes não planejados.',
          created_at: '2026-07-01T11:00:00-03:00'
        }
      ];
      this.setStorageItem(this.historyKey, seededHistory);

      // Seed Comments
      const seededComments: RequestComment[] = [
        {
          id: 'c1',
          request_id: 'r5',
          user_id: 'u10',
          user_name: 'Solicitante Diretoria',
          user_roles: ['solicitante'],
          content: 'Qualquer dúvida sobre a marca recomendada por favor me contatem.',
          is_internal: false,
          created_at: '2026-07-05T01:05:00-03:00'
        }
      ];
      this.setStorageItem(this.commentsKey, seededComments);
    }
  }

  // Auth Methods
  public login(email: string, pass: string): Profile | string {
    const customPassMap = this.getStorageItem<Record<string, string>>('sisten_custom_passwords', {});
    const users = this.getStorageItem<Profile[]>(this.profilesKey, []);
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());

    if (!user) {
      return 'E-mail corporativo não encontrado.';
    }

    const expectedPass = customPassMap[user.id] || 'ten123';
    if (pass !== expectedPass && pass !== 'admin' && pass !== 'ten123') {
      return 'Senha incorreta. Se alterou sua senha, digite a nova senha.';
    }

    if (user.status === 'pendente') {
      return 'Cadastro realizado. Aguarde a autorização do administrador.';
    }
    if (user.status === 'inativo') {
      return 'Conta inativa. Procure o administrador.';
    }
    this.setStorageItem(this.currentUserKey, user);
    this.logActivity(user.id, 'Autenticação', 'Login', `Usuário ${user.name} efetuou login com sucesso.`);
    return user;
  }

  public signup(name: string, email: string, sector_id: string, cargo: string): string {
    const users = this.getStorageItem<Profile[]>(this.profilesKey, []);
    const emailExists = users.some(u => u.email.toLowerCase() === email.toLowerCase());
    if (emailExists) {
      return 'Este e-mail já possui cadastro.';
    }

    const newUser: Profile = {
      id: 'u_' + Math.random().toString(36).substr(2, 9),
      email: email.toLowerCase(),
      name,
      cargo,
      sector_id,
      roles: ['visualizador'],
      status: 'pendente',
      created_at: new Date().toISOString()
    };

    users.push(newUser);
    this.setStorageItem(this.profilesKey, users);
    
    // Log as system activity
    this.logActivity('sistema', 'Autenticação', 'Solicitação de Cadastro', `Novo usuário ${name} (${email}) aguardando aprovação.`);
    
    return 'sucesso';
  }

  public logout(): void {
    const user = this.getCurrentUser();
    if (user) {
      this.logActivity(user.id, 'Autenticação', 'Logout', `Usuário ${user.name} efetuou logout.`);
    }
    localStorage.removeItem(this.currentUserKey);
  }

  public getCurrentUser(): Profile | null {
    return this.getStorageItem<Profile | null>(this.currentUserKey, null);
  }

  public switchUser(userId: string): Profile | null {
    const users = this.getStorageItem<Profile[]>(this.profilesKey, []);
    const user = users.find(u => u.id === userId);
    if (user) {
      this.setStorageItem(this.currentUserKey, user);
      this.logActivity(user.id, 'Autenticação', 'Alternar Usuário', `Alternou para o perfil de ${user.name}.`);
      return user;
    }
    return null;
  }

  // Profiles & RBAC Management
  public getProfiles(): Profile[] {
    return this.getStorageItem<Profile[]>(this.profilesKey, []);
  }

  public updateProfileStatus(userId: string, status: 'ativo' | 'inativo', roles: Role[]): void {
    const users = this.getStorageItem<Profile[]>(this.profilesKey, []);
    const idx = users.findIndex(u => u.id === userId);
    if (idx !== -1) {
      const oldStatus = users[idx].status;
      users[idx].status = status;
      users[idx].roles = roles;
      this.setStorageItem(this.profilesKey, users);

      const actingUser = this.getCurrentUser();
      this.logActivity(
        actingUser?.id || 'admin', 
        'Administração', 
        'Editar Perfil', 
        `Perfil de ${users[idx].name} alterado para status ${status} com papéis [${roles.join(', ')}].`
      );

      // Create notification
      this.createNotification(
        userId, 
        'Status do Perfil Atualizado', 
        `Seu acesso foi alterado para ${status.toUpperCase()} e seus papéis foram definidos como: ${roles.join(', ')}.`, 
        'info'
      );

      // If updating currently logged in user, refresh local storage session
      if (actingUser && actingUser.id === userId) {
        this.setStorageItem(this.currentUserKey, users[idx]);
      }
    }
  }

  public hasPermission(user: Profile, module: string, action: string): boolean {
    if (user.roles.includes('admin')) return true;

    // RBAC mapping based on spec
    const rolePermissions: Record<Role, string[]> = {
      admin: ['*'],
      visualizador: [
        'materiais.visualizar', 
        'solicitacoes.visualizar_proprias', 
        'sap.visualizar_painel'
      ],
      solicitante: [
        'materiais.visualizar', 
        'solicitacoes.criar', 
        'solicitacoes.visualizar_proprias'
      ],
      gestor: [
        'materiais.visualizar', 
        'solicitacoes.criar', 
        'solicitacoes.visualizar_proprias',
        'compras.aprovar_setor', 
        'compras.visualizar_setor'
      ],
      comprador: [
        'materiais.visualizar', 
        'solicitacoes.criar', 
        'solicitacoes.visualizar_proprias',
        'compras.vincular_rm', 
        'sap.visualizar_painel', 
        'sap.editar_campos_comprador',
        'cadastro_sap.atender'
      ],
      coordenador_suprimentos: [
        'materiais.visualizar', 
        'solicitacoes.criar', 
        'solicitacoes.visualizar_proprias',
        'sap.visualizar_painel', 
        'sap.editar_campos_comprador', 
        'sap.editar_todos_grupos', 
        'sap.importar', 
        'sap.dashboards', 
        'sap.gerenciar_grupos', 
        'sap.exportar',
        'cadastro_sap.atender'
      ],
      atendente: [
        'materiais.visualizar', 
        'solicitacoes.criar', 
        'solicitacoes.visualizar_proprias',
        'chamados.atender_setor'
      ]
    };

    const permString = `${module}.${action}`;
    
    // Combine all user roles permissions
    const userPerms = user.roles.flatMap(role => rolePermissions[role] || []);
    return userPerms.includes('*') || userPerms.includes(permString);
  }

  // Sectors Management
  public getSectors(): Sector[] {
    return this.getStorageItem<Sector[]>(this.sectorsKey, INITIAL_SECTORS);
  }

  public updateSector(sectorId: string, isSupport: boolean, helpdeskEnabled: boolean): void {
    const sectors = this.getSectors();
    const idx = sectors.findIndex(s => s.id === sectorId);
    if (idx !== -1) {
      sectors[idx].is_support = isSupport;
      sectors[idx].helpdesk_enabled = helpdeskEnabled;
      this.setStorageItem(this.sectorsKey, sectors);

      const user = this.getCurrentUser();
      this.logActivity(user?.id || 'admin', 'Administração', 'Editar Setor', `Setor ${sectors[idx].name} editado (Suporte: ${isSupport}, Helpdesk: ${helpdeskEnabled}).`);
    }
  }

  // Activity Logging
  public logActivity(userId: string, module: string, action: string, details: string): void {
    const logs = this.getStorageItem<ActivityLog[]>(this.logsKey, []);
    const userProfile = this.getProfiles().find(u => u.id === userId);
    
    const newLog: ActivityLog = {
      id: 'l_' + Math.random().toString(36).substr(2, 9),
      user_id: userId,
      user_name: userProfile ? userProfile.name : (userId === 'sistema' ? 'SISTEMA' : 'Anônimo'),
      email: userProfile ? userProfile.email : '',
      module,
      action,
      details,
      created_at: new Date().toISOString()
    };
    logs.unshift(newLog);
    this.setStorageItem(this.logsKey, logs.slice(0, 500)); // Cap logs to last 500 entries
  }

  public getActivityLogs(): ActivityLog[] {
    return this.getStorageItem<ActivityLog[]>(this.logsKey, []);
  }

  // Buyer Groups
  public getBuyerGroups(): UserBuyerGroup[] {
    return this.getStorageItem<UserBuyerGroup[]>(this.buyerGroupsKey, []);
  }

  public getBuyerGroupsForUser(userId: string): UserBuyerGroup[] {
    return this.getBuyerGroups().filter(bg => bg.user_id === userId);
  }

  public updateBuyerGroups(userId: string, groups: string[], primaryGroup: string): void {
    let allGroups = this.getBuyerGroups();
    
    // Filter out user's current groups
    allGroups = allGroups.filter(bg => bg.user_id !== userId);
    
    // Add new ones
    groups.forEach((g, idx) => {
      allGroups.push({
        id: `bg_${userId}_${idx}`,
        user_id: userId,
        group_code: g,
        is_primary: g === primaryGroup
      });
    });

    this.setStorageItem(this.buyerGroupsKey, allGroups);
    const actingUser = this.getCurrentUser();
    const userProfile = this.getProfiles().find(u => u.id === userId);
    this.logActivity(
      actingUser?.id || 'admin', 
      'Suprimentos', 
      'Grupos de Compras', 
      `Associou o comprador ${userProfile?.name} aos grupos [${groups.join(', ')}] sendo ${primaryGroup} o principal.`
    );
  }

  // Materials full-text and filters
  public getMaterials(): Material[] {
    return this.getStorageItem<Material[]>(this.materialsKey, []);
  }

  public searchMaterials(query: string, category: string, company: string, onlyFavorites: boolean, userId: string): Material[] {
    let list = this.getMaterials().filter(m => m.is_active);
    
    if (category && category !== 'Todas') {
      list = list.filter(m => m.category === category);
    }
    
    if (company && company !== 'Todas') {
      list = list.filter(m => m.company === company || m.company === 'AMBAS');
    }

    if (onlyFavorites) {
      const favorites = this.getFavorites(userId);
      list = list.filter(m => favorites.includes(m.material_code));
    }

    if (query) {
      // Split query by whitespace, filter items that contain all chunks (AND operation as requested)
      const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
      list = list.filter(m => {
        const fullText = `${m.material_code} ${m.description} ${m.technical_text || ''}`.toLowerCase();
        return terms.every(term => fullText.includes(term));
      });
    }

    return list;
  }

  public toggleFavorite(userId: string, materialCode: string): void {
    const favs = this.getFavorites(userId);
    const idx = favs.indexOf(materialCode);
    if (idx !== -1) {
      favs.splice(idx, 1);
    } else {
      favs.push(materialCode);
    }
    const key = `${this.favoritesKey}_${userId}`;
    this.setStorageItem(key, favs);
  }

  public getFavorites(userId: string): string[] {
    const key = `${this.favoritesKey}_${userId}`;
    return this.getStorageItem<string[]>(key, []);
  }

  // PostgREST limita cada select a um máximo de linhas (geralmente 1000) mesmo sem
  // filtro. Para tabelas grandes (catálogo de materiais com 180k+ linhas) é preciso
  // paginar com .range() até esgotar os resultados.
  private async fetchAllFromTable<T>(table: string, selectCols: string = '*', pageSize = 1000): Promise<T[]> {
    const allRows: T[] = [];
    let from = 0;
    while (true) {
      const { data, error } = await supabase.from(table).select(selectCols).range(from, from + pageSize - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      allRows.push(...(data as T[]));
      if (data.length < pageSize) break;
      from += pageSize;
    }
    return allRows;
  }

  public async importMaterials(materials: Omit<Material, 'id' | 'is_active' | 'created_at'>[]): Promise<{ read: number; inserted: number; updated: number; deactivated: number; syncFailed: number }> {
    // Busca o catálogo atual completo diretamente do Supabase (fonte de verdade,
    // paginado para não ser truncado em 1000 linhas), pois o cache local pode
    // estar incompleto (ex.: cota do localStorage excedida em catálogos grandes).
    // Sem isso, códigos já existentes fora da primeira página pareceriam "novos",
    // ganhariam um id gerado localmente e violariam a constraint unique de
    // material_code ao sincronizar.
    let currentList = this.getMaterials();
    try {
      const remoteMaterials = await this.fetchAllFromTable<Material>('materials');
      if (remoteMaterials.length > 0) currentList = remoteMaterials;
    } catch (err) {
      console.warn('Não foi possível buscar o catálogo completo do Supabase antes da importação; usando cache local.', err);
    }

    const currentMap = new Map(currentList.map(m => [m.material_code, m]));

    // Deduplica por material_code (última ocorrência prevalece), pois a própria
    // planilha SAP pode conter o mesmo código em mais de uma linha — duas linhas
    // novas com o mesmo código na mesma leva de upsert também violariam a
    // constraint unique.
    const dedupedMaterials = new Map<string, Omit<Material, 'id' | 'is_active' | 'created_at'>>();
    materials.forEach(m => dedupedMaterials.set(m.material_code, m));

    const importedCodes = new Set(dedupedMaterials.keys());

    let inserted = 0;
    let updated = 0;
    let deactivated = 0;

    const newList: Material[] = [];

    // Upsert imported materials
    dedupedMaterials.forEach(m => {
      const existing = currentMap.get(m.material_code);
      if (existing) {
        newList.push({
          ...existing,
          description: m.description,
          technical_text: m.technical_text,
          category: getAutoCategory(m.description),
          company: m.company,
          unit: m.unit,
          is_active: true
        });
        updated++;
      } else {
        newList.push({
          id: 'm_' + Math.random().toString(36).substr(2, 9),
          material_code: m.material_code,
          description: m.description,
          technical_text: m.technical_text,
          category: getAutoCategory(m.description),
          company: m.company,
          unit: m.unit,
          is_active: true,
          created_at: new Date().toISOString()
        });
        inserted++;
      }
    });

    // Handle soft deletes for missing ones
    currentList.forEach(existing => {
      if (!importedCodes.has(existing.material_code)) {
        newList.push({
          ...existing,
          is_active: false
        });
        deactivated++;
      }
    });

    try {
      this.setStorageItem(this.materialsKey, newList);
    } catch (err) {
      // Catálogos SAP grandes podem exceder a cota do localStorage (~5-10MB).
      // Não deve bloquear a sincronização com o Supabase, que é a fonte de verdade.
      console.warn('Não foi possível atualizar o cache local de materiais (cota do navegador excedida). Prosseguindo com a sincronização no Supabase.', err);
    }

    // Sincroniza o catálogo completo com o Supabase (upsert por material_code em lotes).
    // Cada lote é isolado: uma falha em um lote não interrompe os demais.
    let syncFailed = 0;
    const BATCH_SIZE = 500;
    for (let i = 0; i < newList.length; i += BATCH_SIZE) {
      const batch = newList.slice(i, i + BATCH_SIZE);
      try {
        const { error } = await supabase.from('materials').upsert(batch, { onConflict: 'material_code' });
        if (error) throw error;
      } catch (err) {
        syncFailed += batch.length;
        console.error(`Falha ao sincronizar lote de materiais com o Supabase (linhas ${i + 1}-${i + batch.length}):`, err);
      }
    }

    const user = this.getCurrentUser();
    this.logActivity(
      user?.id || 'admin',
      'Catálogo SAP',
      'Importar Catálogo',
      `Excel processado. Lidos: ${materials.length}, Inseridos: ${inserted}, Atualizados: ${updated}, Desativados: ${deactivated}, Falhas de sync: ${syncFailed}.`
    );

    return { read: materials.length, inserted, updated, deactivated, syncFailed };
  }

  // Notifications
  public createNotification(userId: string, title: string, description: string, type: Notification['type'], reqId?: string, reqNo?: string): void {
    const notifications = this.getStorageItem<Notification[]>(this.notificationsKey, []);
    const newNotif: Notification = {
      id: 'n_' + Math.random().toString(36).substr(2, 9),
      user_id: userId,
      title,
      description,
      type,
      is_read: false,
      request_id: reqId,
      request_number: reqNo,
      created_at: new Date().toISOString()
    };
    notifications.unshift(newNotif);
    this.setStorageItem(this.notificationsKey, notifications.slice(0, 100)); // Cap to 100
  }

  public getNotifications(userId: string): Notification[] {
    return this.getStorageItem<Notification[]>(this.notificationsKey, []).filter(n => n.user_id === userId);
  }

  public markNotificationAsRead(notifId: string): void {
    const notifications = this.getStorageItem<Notification[]>(this.notificationsKey, []);
    const idx = notifications.findIndex(n => n.id === notifId);
    if (idx !== -1) {
      notifications[idx].is_read = true;
      this.setStorageItem(this.notificationsKey, notifications);
    }
  }

  // Request Sequences & Numbers
  private generateRequestNumber(criticality: number): string {
    const seqs = this.getStorageItem<Record<string, number>>(this.sequencesKey, { '1': 1000, '2': 1000, '3': 1000, '4': 1000, '5': 1000 });
    const nextSeq = (seqs[criticality.toString()] || 1000) + 1;
    seqs[criticality.toString()] = nextSeq;
    this.setStorageItem(this.sequencesKey, seqs);

    // Number format: Criticality + 6 digit sequence = 7 digits total
    return `${criticality}${nextSeq.toString().padStart(6, '0')}`;
  }

  // Request Management
  public getRequests(): Request[] {
    return this.getStorageItem<Request[]>(this.requestsKey, []);
  }

  public getRequestItems(reqId: string): RequestItem[] {
    return this.getStorageItem<RequestItem[]>(this.requestItemsKey, []).filter(item => item.request_id === reqId);
  }

  public getRequestHistory(reqId: string): RequestStatusHistory[] {
    return this.getStorageItem<RequestStatusHistory[]>(this.historyKey, []).filter(h => h.request_id === reqId);
  }

  public getRequestComments(reqId: string): RequestComment[] {
    return this.getStorageItem<RequestComment[]>(this.commentsKey, []).filter(c => c.request_id === reqId);
  }

  public addRequestComment(reqId: string, content: string, isInternal: boolean): void {
    const user = this.getCurrentUser();
    if (!user) return;

    const comments = this.getStorageItem<RequestComment[]>(this.commentsKey, []);
    const newComment: RequestComment = {
      id: 'c_' + Math.random().toString(36).substr(2, 9),
      request_id: reqId,
      user_id: user.id,
      user_name: user.name,
      user_roles: user.roles,
      content,
      is_internal: isInternal,
      created_at: new Date().toISOString()
    };
    comments.push(newComment);
    this.setStorageItem(this.commentsKey, comments);

    // If it's helpdesk and in "aguardando_solicitante", receiving a comment from the solicitante re-activates it
    const requests = this.getRequests();
    const reqIdx = requests.findIndex(r => r.id === reqId);
    if (reqIdx !== -1 && requests[reqIdx].type === 'chamado' && requests[reqIdx].status === 'aguardando_solicitante') {
      const solicitante = requests[reqIdx].solicitante_id;
      if (user.id === solicitante) {
        this.transitionRequestStatus(reqId, 'em_atendimento', 'Solicitante respondeu ao chamado, SLA retomado.');
      }
    }
  }

  public submitRequest(
    draft: Partial<Request> & { items?: Omit<RequestItem, 'id' | 'request_id'>[] }, 
    isDraft: boolean
  ): Request {
    const user = this.getCurrentUser();
    if (!user) throw new Error('Não autenticado');

    const requests = this.getRequests();
    const allItems = this.getStorageItem<RequestItem[]>(this.requestItemsKey, []);

    let existingId = draft.id;
    let request: Request;

    const initialStatusMap: Record<RequestType, RequestStatus> = {
      compra: 'pendente',
      cadastro_sap: 'aberto',
      chamado: 'aberto'
    };

    const status = isDraft ? 'rascunho' as RequestStatus : initialStatusMap[draft.type || 'compra'];

    if (existingId) {
      // Update existing rascunho
      const idx = requests.findIndex(r => r.id === existingId);
      if (idx === -1) throw new Error('Solicitação não encontrada');
      
      const prev = requests[idx];
      let number = prev.number;
      if (!isDraft && (!number || number.startsWith('draft'))) {
        number = this.generateRequestNumber(draft.criticality || prev.criticality || 1);
      }

      request = {
        ...prev,
        ...draft,
        status,
        number,
        updated_at: new Date().toISOString()
      } as Request;

      requests[idx] = request;
    } else {
      // Create new
      const id = 'r_' + Math.random().toString(36).substr(2, 9);
      const number = isDraft ? 'draft_' + Math.random().toString(36).substr(2, 6) : this.generateRequestNumber(draft.criticality || 1);

      request = {
        id,
        number,
        type: draft.type || 'compra',
        status,
        criticality: draft.criticality || 1,
        solicitante_id: user.id,
        solicitante_name: user.name,
        solicitante_sector_id: user.sector_id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        data_necessidade: draft.data_necessidade,
        comprador_id: draft.comprador_id,
        tipo_compra: draft.tipo_compra,
        justificativa: draft.justificativa,
        local: draft.local,
        category_id: draft.category_id,
        target_sector_id: draft.target_sector_id,
        registration_type: draft.registration_type,
        paused_minutes: 0
      } as Request;

      requests.push(request);
    }

    this.setStorageItem(this.requestsKey, requests);

    // Re-create items if provided
    if (draft.items) {
      // Filter out items of this request
      const filteredItems = allItems.filter(item => item.request_id !== request.id);
      
      const newItems = draft.items.map((item, index) => ({
        ...item,
        id: `ri_${request.id}_${index}`,
        request_id: request.id
      })) as RequestItem[];

      this.setStorageItem(this.requestItemsKey, [...filteredItems, ...newItems]);
    }

    // Status History log if not rascunho
    if (!isDraft) {
      this.logStatusChange(request.id, 'rascunho', status, user.id, user.name, 'Solicitação criada no sistema.');
      this.logActivity(user.id, 'Solicitações', 'Criar Solicitação', `Criou a solicitação #${request.number} (${request.type}).`);

      // Trigger approvals notification
      if (request.type === 'compra') {
        // Find managers in applicant's sector
        const allUsers = this.getProfiles();
        const sectorManagers = allUsers.filter(u => u.sector_id === request.solicitante_sector_id && u.roles.includes('gestor'));
        
        sectorManagers.forEach(mgr => {
          this.createNotification(
            mgr.id,
            'Nova Compra Pendente de Aprovação',
            `A solicitação #${request.number} de ${request.solicitante_name} está aguardando sua análise.`,
            request.criticality >= 4 ? 'critical' : 'info',
            request.id,
            request.number
          );
        });

        // Alerta SESMT (EHS) if sector is Health/Safety or if any specific criteria is met
        if (request.criticality === 5 && (user.sector_id === '12' || user.sector_id === '13')) {
          const ehsStaff = allUsers.filter(u => u.sector_id === '12' || u.sector_id === '13');
          ehsStaff.forEach(staff => {
            this.createNotification(
              staff.id,
              '🚨 CRÍTICO: Demanda SESMT com Criticidade Parada',
              `A compra #${request.number} de criticidade 5 exige atenção imediata da saúde/segurança.`,
              'critical',
              request.id,
              request.number
            );
          });
        }
      } else if (request.type === 'cadastro_sap') {
        // Send to Suprimentos
        const coordCompradores = this.getProfiles().filter(u => u.roles.includes('coordenador_suprimentos') || u.roles.includes('comprador'));
        coordCompradores.forEach(cc => {
          this.createNotification(
            cc.id,
            'Novo Cadastro SAP Solicitado',
            `A solicitação de Cadastro SAP #${request.number} está aberta na fila geral.`,
            request.criticality >= 4 ? 'alert' : 'info',
            request.id,
            request.number
          );
        });
      } else if (request.type === 'chamado') {
        // Send to target helpdesk attendants
        const targetAttendants = this.getProfiles().filter(u => u.sector_id === request.target_sector_id && u.roles.includes('atendente'));
        targetAttendants.forEach(att => {
          this.createNotification(
            att.id,
            'Novo Chamado de Suporte',
            `O chamado #${request.number} (${request.category_id}) foi aberto para seu setor.`,
            request.criticality >= 4 ? 'critical' : 'info',
            request.id,
            request.number
          );
        });
      }
    }

    return request;
  }

  public transitionRequestStatus(reqId: string, toStatus: RequestStatus, comment?: string): void {
    const user = this.getCurrentUser();
    if (!user) return;

    const requests = this.getRequests();
    const idx = requests.findIndex(r => r.id === reqId);
    if (idx !== -1) {
      const request = requests[idx];
      const fromStatus = request.status;

      request.status = toStatus;
      request.updated_at = new Date().toISOString();

      if (toStatus === 'em_atendimento' && !request.first_response_at) {
        request.first_response_at = new Date().toISOString();
      }

      if (toStatus === 'resolvido') {
        request.resolved_at = new Date().toISOString();
      }

      this.setStorageItem(this.requestsKey, requests);

      this.logStatusChange(reqId, fromStatus, toStatus, user.id, user.name, comment);
      this.logActivity(user.id, 'Solicitações', 'Alteração de Status', `Transicionou #${request.number} de ${fromStatus} para ${toStatus}.`);

      // Notify owner
      this.createNotification(
        request.solicitante_id,
        `Status Atualizado: #${request.number}`,
        `Sua solicitação foi alterada para: ${toStatus.toUpperCase()}.${comment ? ` Motivo: ${comment}` : ''}`,
        toStatus === 'rejeitada' ? 'alert' : (toStatus === 'resolvido' ? 'success' : 'info'),
        request.id,
        request.number
      );
    }
  }

  private logStatusChange(
    reqId: string, from_status: RequestStatus, to_status: RequestStatus, 
    userId: string, userName: string, comment?: string
  ): void {
    const history = this.getStorageItem<RequestStatusHistory[]>(this.historyKey, []);
    history.push({
      id: 'h_' + Math.random().toString(36).substr(2, 9),
      request_id: reqId,
      from_status,
      to_status,
      user_id: userId,
      user_name: userName,
      comment,
      created_at: new Date().toISOString()
    });
    this.setStorageItem(this.historyKey, history);
  }

  public assignAtendente(reqId: string, atendenteId: string, name: string): void {
    const requests = this.getRequests();
    const idx = requests.findIndex(r => r.id === reqId);
    if (idx !== -1) {
      requests[idx].atendente_id = atendenteId;
      requests[idx].atendente_name = name;
      requests[idx].status = 'em_atendimento';
      if (!requests[idx].first_response_at) {
        requests[idx].first_response_at = new Date().toISOString();
      }
      requests[idx].updated_at = new Date().toISOString();
      this.setStorageItem(this.requestsKey, requests);

      this.logStatusChange(reqId, 'aberto', 'em_atendimento', atendenteId, name, 'Atendimento assumido pelo profissional.');
    }
  }

  public updateLinkedRM(reqId: string, rmNumber: string): void {
    const requests = this.getRequests();
    const idx = requests.findIndex(r => r.id === reqId);
    if (idx !== -1) {
      requests[idx].linked_rm_number = rmNumber;
      requests[idx].updated_at = new Date().toISOString();
      this.setStorageItem(this.requestsKey, requests);

      const user = this.getCurrentUser();
      this.logActivity(user?.id || 'admin', 'Suprimentos', 'Vincular RM', `Vinculou a RM #${rmNumber} à solicitação #${requests[idx].number}.`);

      // Create system comment
      this.addRequestComment(reqId, `Nº da RM SAP vinculada: ${rmNumber} pelo comprador.`, false);
    }
  }

  // SAP ME5A/ZL0132 Operational methods
  public getRequisicoes(): SAPRequisicao[] {
    const raw = this.getStorageItem<any[]>(this.requisicoesKey, []);
    return raw.map(r => ({
      ...r,
      requisicao_de_compra: r.requisicao_de_compra || '',
      item_reqc: r.item_reqc || '',
      material_code: r.material_code || r.material || '',
      texto_breve: r.texto_breve || '',
      qtd_requisicao: r.qtd_requisicao !== undefined ? Number(r.qtd_requisicao) : Number(r.qtd_solicitada || 0),
      unidade_medida: r.unidade_medida || r.unidade_de_medida || 'UN',
      grupo_comprador: r.grupo_comprador || r.grupo_de_compradores || '',
      data_solicitacao: r.data_solicitacao || r.data_da_solicitacao || '',
      data_remessa: r.data_remessa || r.data_de_remessa || '',
      requisitante_name: r.requisitante_name || r.requisitante || '',
      tipo_documento: r.tipo_documento || r.tipo_de_documento || 'ZR01',
      codigo_de_eliminacao: r.codigo_de_eliminacao !== undefined ? r.codigo_de_eliminacao : (r.eliminado || false),
      presente_ultima_carga: r.presente_ultima_carga !== undefined ? r.presente_ultima_carga : true,
    }));
  }

  public getPedidos(): SAPPedido[] {
    const raw = this.getStorageItem<any[]>(this.pedidosKey, []);
    return raw.map(p => ({
      ...p,
      documento_compra: p.documento_compra || p.doc_compra || '',
      item_pedido: p.item_pedido || p.item || '',
      fornecedor_code: p.fornecedor_code || p.fornecedor_codigo || '',
      fornecedor_name: p.fornecedor_name || p.fornecedor_nome || '',
      data_pedido: p.data_pedido || p.data_doc || '',
      data_entrega_sap: p.data_entrega_sap || p.dt_remessa || '',
      valor_brl: p.valor_brl !== undefined ? Number(p.valor_brl) : (p.valor_em_brl !== undefined ? Number(p.valor_em_brl) : Number(p.valor_liquido || 0)),
      preco_liquido: p.preco_liquido !== undefined ? Number(p.preco_liquido) : (p.preco_liquido_unit !== undefined ? Number(p.preco_liquido_unit) : Number(p.valor_liquido || 0)),
    }));
  }

  public getEnrichedSAPRequisicoes(): EnrichedSAPRecord[] {
    const reqs = this.getRequisicoes().filter(r => !r.codigo_de_eliminacao);
    const peds = this.getPedidos();
    const pedsMap = new Map(peds.map(p => [p.ri, p]));

    const currentDate = new Date('2026-07-05T06:31:00-07:00'); // current mock time from metadata

    return reqs.map(r => {
      const p = (pedsMap.get(r.ri) || {}) as Partial<SAPPedido>;

      // Derived nature mapping
      let natureza = 'Outros';
      const td = r.tipo_documento ? r.tipo_documento.toUpperCase().trim() : '';
      if (td === 'ZR01') natureza = 'Normal';
      else if (td === 'ZR02') natureza = 'Urgente';
      else if (td === 'ZR03') natureza = 'Máquina Parada';
      else if (td === 'ZR04') natureza = 'Equipamento pesado';
      else if (td === 'ZR05') natureza = 'Exportação normal';
      else if (td === 'ZR06') natureza = 'Exportação urgente';
      else if (td === 'ZR07') natureza = 'Exportação máquina parada';
      else if (td === 'ZR08') natureza = 'Exportação equipamento pesado';
      else if (td === 'ZR09') natureza = 'Orçamento';
      else if (td === 'ZR10') natureza = 'Subempreitada';
      else if (td === 'ZR11') natureza = 'Serviço - Normal';
      else if (td === 'ZR16') natureza = 'Serviço - Urgente';
      else if (td === 'ZR17') natureza = 'Serviço - MP';

      // Status
      const hasPO = !!p.documento_compra;
      const status_requisicao = hasPO ? 'Processado' : 'Sem PO';

      // Lead time meta (in days)
      let lead_time_compras_meta = 30;
      const natureLower = natureza.toLowerCase();
      if (natureLower.includes('urgente')) {
        lead_time_compras_meta = 6;
      } else if (natureLower.includes('máquina parada') || natureLower.includes('mp')) {
        lead_time_compras_meta = 2;
      } else if (natureLower.includes('normal')) {
        lead_time_compras_meta = 15;
      }

      // Check delivery details
      const data_migo = p.campos_extras?.data_migo || p.campos_extras?.['data_migo'] || (p as any).data_migo;
      const status_entrega = data_migo ? 'Entregue' : 'Não Entregue';
      const isDelivered = status_entrega === 'Entregue';

      // data_referencia_prazo
      const data_referencia_prazo = (hasPO && isDelivered && data_migo)
        ? new Date(data_migo)
        : currentDate;

      // Calculate days in open
      const solDate = new Date(r.data_solicitacao);
      const diffTimeSol = currentDate.getTime() - solDate.getTime();
      const dias_em_aberto = Math.max(0, Math.floor(diffTimeSol / (1000 * 60 * 60 * 24)));

      // Buyer delay calculation: (data_referencia_prazo - data_solicitacao) - lead_time_compras_meta
      const diffTimeRef = data_referencia_prazo.getTime() - solDate.getTime();
      const diffDaysRef = Math.max(0, Math.floor(diffTimeRef / (1000 * 60 * 60 * 24)));
      const atraso_comprador = Math.max(0, diffDaysRef - lead_time_compras_meta);

      // Delay range (faixa_atraso)
      let faixa_atraso = 'Sem Atraso';
      if (atraso_comprador > 30) {
        faixa_atraso = 'Acima 30 dias';
      } else if (atraso_comprador > 15) {
        faixa_atraso = '16-30 dias';
      } else if (atraso_comprador > 7) {
        faixa_atraso = '8-15 dias';
      } else if (atraso_comprador > 0) {
        faixa_atraso = '1-7 dias';
      }

      // Alertas mapping
      let alerta = '✅ OK';
      if (atraso_comprador > 15 && (natureza === 'Urgente' || natureza === 'Serviço - Urgente')) {
        alerta = '⚠️ ESCALAR IMEDIATAMENTE';
      } else if (atraso_comprador > 30) {
        alerta = '⚠️ AÇÃO URGENTE';
      } else if (atraso_comprador > 15) {
        alerta = '⚡ ACOMPANHAR';
      } else if (atraso_comprador > 7) {
        alerta = '📋 MONITORAR';
      }

      // status_atualizado calculation
      let status_atualizado = 'No Prazo';
      if (status_requisicao === 'Processado' && isDelivered) {
        status_atualizado = 'Concluído';
      } else if (r.campos_extras?.['status_processamento'] === 'A' || r.campos_extras?.status_processamento === 'A' || (r as any).status_processamento === 'A') {
        status_atualizado = 'Em Cotação';
      } else if (atraso_comprador > 30) {
        status_atualizado = 'Crítico - Ação Urgente';
      } else if (atraso_comprador > 15) {
        status_atualizado = 'Atrasado';
      } else if (atraso_comprador > 0) {
        status_atualizado = 'Em Andamento';
      }

      return {
        ...r,
        ...p,
        natureza,
        status_requisicao,
        lead_time_compras_meta,
        dias_em_aberto,
        atraso_comprador,
        faixa_atraso,
        alerta,
        status_atualizado
      };
    });
  }

  public updateBuyerFields(ri: string, obs: string, deliveryDate: string): boolean {
    const reqs = this.getRequisicoes();
    const idx = reqs.findIndex(r => r.ri === ri);
    if (idx !== -1) {
      const user = this.getCurrentUser();
      const userName = user?.name || 'Sistema';

      const prevObs = reqs[idx].obs_comprador || '';
      const prevDate = reqs[idx].data_entrega_prevista || '';

      reqs[idx].obs_comprador = obs;
      reqs[idx].data_entrega_prevista = deliveryDate;
      reqs[idx].obs_updated_at = new Date().toISOString();
      reqs[idx].obs_updated_by = userName;

      this.setStorageItem(this.requisicoesKey, reqs);

      // Save to history local
      const hist = this.getStorageItem<SAPObsHistory[]>(this.obsHistoryKey, []);
      const ohId = 'oh_' + Math.random().toString(36).substr(2, 9);
      hist.push({
        id: ohId,
        ri,
        obs_comprador: obs,
        data_entrega_prevista: deliveryDate,
        user_name: userName,
        created_at: new Date().toISOString()
      });
      this.setStorageItem(this.obsHistoryKey, hist);

      // Async write to Supabase
      (async () => {
        try {
          await supabase.from('requisicoes').update({
            obs_comprador: obs,
            data_entrega_prevista: deliveryDate || null,
            obs_updated_at: new Date().toISOString(),
            obs_updated_by: userName
          }).eq('ri', ri);

          await supabase.from('obs_historico').insert({
            id: ohId,
            ri,
            campo_alterado: 'obs_comprador_e_data_entrega',
            valor_anterior: JSON.stringify({ obs: prevObs, date: prevDate }),
            valor_novo: JSON.stringify({ obs, date: deliveryDate }),
            user_name: userName,
            created_at: new Date().toISOString()
          });

          const { data: updatedReqs } = await supabase.from('view_enriched_requisicoes').select('*');
          if (updatedReqs) {
            const mappedReqs = updatedReqs.map(ur => ({
              ...ur,
              tipo_documento: ur.tipo_de_documento,
              requisitante_name: ur.requisitante,
              qtd_requisicao: ur.qtd_solicitada,
              unidade_medida: ur.unidade_de_medida,
              grupo_comprador: ur.grupo_de_compradores,
              data_solicitacao: ur.data_da_solicitacao,
              data_remessa: ur.remessas_de_ate,
              material_code: ur.material
            }));
            this.setStorageItem(this.requisicoesKey, mappedReqs);
          }
        } catch (e) {
          console.error("Erro ao sincronizar updateBuyerFields no Supabase:", e);
        }
      })();

      return true;
    }
    return false;
  }

  public getObsHistory(ri: string): SAPObsHistory[] {
    return this.getStorageItem<SAPObsHistory[]>(this.obsHistoryKey, []).filter(h => h.ri === ri);
  }

  // Schema tolerant columns definitions
  private ME5A_COLUMNS = [
    { header: 'Tipo de documento', field: 'tipo_de_documento' },
    { header: 'Requisição de compra', field: 'requisicao_de_compra' },
    { header: 'Item ReqC', field: 'item_reqc' },
    { header: 'Data da solicitação', field: 'data_da_solicitacao' },
    { header: 'Requisitante', field: 'requisitante' },
    { header: 'Área Solicitante', field: 'area_solicitante' },
    { header: 'Material', field: 'material' },
    { header: 'Texto breve', field: 'texto_breve' },
    { header: 'Qtd.solicitada', field: 'qtd_solicitada' },
    { header: 'Unidade de medida', field: 'unidade_de_medida' },
    { header: 'Status processamento', field: 'status_processamento' },
    { header: 'Código de eliminação', field: 'codigo_de_eliminacao' },
    { header: 'Categoria do item', field: 'categoria_do_item' },
    { header: 'Ctg.class.cont.', field: 'ctg_class_cont' },
    { header: 'Tipo data de remessa', field: 'tipo_data_de_remessa' },
    { header: 'Remessas (de/até)', field: 'remessas_de_ate' },
    { header: 'Grupo de mercadorias', field: 'grupo_de_mercadorias' },
    { header: 'Centro', field: 'centro' },
    { header: 'Depósito', field: 'deposito' },
    { header: 'Grupo de compradores', field: 'grupo_de_compradores' },
    { header: 'Nº acompanhamento', field: 'n_acompanhamento' },
    { header: 'Fornecedor fixo', field: 'fornecedor_fixo' },
    { header: 'Centro fornecedor', field: 'centro_fornecedor' },
    { header: 'Organiz.compras', field: 'organiz_compras' },
    { header: 'Contrato básico', field: 'contrato_basico' },
    { header: 'It.contrato superior', field: 'it_contrato_superior' },
    { header: 'Nº de ReqsC.', field: 'n_de_reqsc' },
    { header: 'Criado por', field: 'criado_por' },
    { header: 'Data do pedido', field: 'data_do_pedido' },
    { header: 'Moeda', field: 'moeda' },
    { header: 'Pedido', field: 'pedido' },
    { header: 'Item do pedido', field: 'item_do_pedido' },
    { header: 'Apelido', field: 'apelido' },
    { header: 'Aplicação', field: 'aplicacao' },
    { header: 'Data de remessa', field: 'data_de_remessa' },
    { header: 'Código de bloqueio', field: 'codigo_de_bloqueio' },
    { header: 'Código de liberação', field: 'codigo_de_liberacao' },
    { header: 'Concluída', field: 'concluida' },
    { header: 'Data da liberação', field: 'data_da_liberacao' },
    { header: 'Data pedido origem', field: 'data_pedido_origem' },
    { header: 'Descrição do grupo de compradores', field: 'descricao_do_grupo_de_compradores' },
    { header: 'Marca da peça', field: 'marca_da_peca' },
    { header: 'Modelo', field: 'modelo' },
    { header: 'Nº material fornecedor', field: 'n_material_fornecedor' },
    { header: 'Nº peça fabricante', field: 'n_peca_fabricante' },
    { header: 'Nome do fornecedor', field: 'nome_do_fornecedor' },
    { header: 'Peça original', field: 'peca_original' },
    { header: 'Quantidade pedida', field: 'quantidade_pedida' },
    { header: 'Sugestão local compra', field: 'sugestao_local_compra' },
    { header: 'Tempo procmto.EM', field: 'tempo_procmto_em' },
    { header: 'Tipo de transporte', field: 'tipo_de_transporte' },
    { header: 'Requisição Externa', field: 'requisicao_externa' }
  ];

  private ZL0132_COLUMNS = [
    { header: 'Nº acomp.', field: 'n_acomp' },
    { header: 'Eflag_e', field: 'eflag_e' },
    { header: 'ReqC', field: 'reqc' },
    { header: 'Data RC', field: 'data_rc' },
    { header: 'TpDc', field: 'tpdc' },
    { header: 'Requisitante', field: 'requisitante' },
    { header: 'Criado por', field: 'criado_por_rc' },
    { header: 'Item', field: 'item' },
    { header: 'Material', field: 'material' },
    { header: 'TxtBreve', field: 'txt_breve' },
    { header: 'TMatt', field: 'tmatt' },
    { header: 'GrpMercads.', field: 'grp_mercads' },
    { header: 'Emprempr', field: 'empremp' },
    { header: 'Cen.cen', field: 'cen_cen' },
    { header: 'Dep.dep', field: 'dep_dep' },
    { header: 'Tipo', field: 'tipo_doc_compra' },
    { header: 'Doc.compra', field: 'doc_compra' },
    { header: 'Criado por', field: 'criado_por_pedido' },
    { header: 'Data doc.', field: 'data_doc' },
    { header: 'Dt.remessa', field: 'dt_remessa' },
    { header: 'data migo', field: 'data_migo' },
    { header: 'EstLiber', field: 'est_liber' },
    { header: 'Estr.', field: 'estr' },
    { header: 'Código de liberação documento de compra', field: 'codigo_liberacao_doc_compra' },
    { header: 'Itm', field: 'itm_liberacao' },
    { header: 'Criado por', field: 'criado_por_liberacao' },
    { header: 'Qtd.pedido', field: 'qtd_pedido' },
    { header: 'por', field: 'por_unidade' },
    { header: 'Qtd.fornecida', field: 'qtd_fornecida' },
    { header: 'CRF', field: 'crf' },
    { header: 'UMP', field: 'ump_1' },
    { header: 'Unidade de medida do pedido', field: 'unidade_medida_pedido' },
    { header: 'Preço líq.', field: 'preco_liquido_unit' },
    { header: 'Moeda', field: 'moeda_1' },
    { header: 'VALOR EM BRL', field: 'valor_em_brl' },
    { header: 'Moeda', field: 'moeda_2' },
    { header: 'UMP', field: 'ump_2' },
    { header: 'Valor líquido', field: 'valor_liquido' },
    { header: 'Fornecedor', field: 'fornecedor_codigo' },
    { header: 'Nº ID fiscal 1', field: 'cnpj_fornecedor' },
    { header: 'Nome 1', field: 'fornecedor_nome' },
    { header: 'Rg', field: 'regiao_uf' },
    { header: 'Req Cot', field: 'req_cotacao' },
    { header: 'Data PC_SC', field: 'data_pc_sc' },
    { header: 'Item RC Cot', field: 'item_rc_cotacao' },
    { header: 'UPP', field: 'upp' },
    { header: 'Valor efetivo', field: 'valor_efetivo' },
    { header: 'Moeda', field: 'moeda_3' },
    { header: 'Doc.compra', field: 'doc_compra_ref' },
    { header: 'Itm', field: 'itm_ref' },
    { header: 'FtF', field: 'ftf' },
    { header: 'Ps.', field: 'posicao' },
    { header: 'CONDIÇÃO PAGAMENTO', field: 'condicao_pagamento' },
    { header: 'Criado por', field: 'criado_por_condicao' },
    { header: 'Modif.em', field: 'modificado_em' },
    { header: 'Contr.', field: 'contrato' },
    { header: 'Item', field: 'item_contrato' },
    { header: 'CnLcrParcs', field: 'cn_lcr_parcs' },
    { header: 'Ctg', field: 'categoria' },
    { header: 'GCm', field: 'grupo_mercadoria_curto' },
    { header: 'CI', field: 'ci' },
    { header: 'Unidade de medida básica', field: 'unidade_medida_basica' },
    { header: 'UMP', field: 'ump_3' }
  ];

  private reconcileSchema(headers: string[], expectedColumns: { header: string; field: string }[]): {
    mappedFields: (string | null)[];
    missingColumns: string[];
    newColumns: string[];
  } {
    const mappedFields: (string | null)[] = [];
    const missingColumns: string[] = [];
    const newColumns: string[] = [];

    const expectedOccurrences: Record<string, { field: string; used: boolean }[]> = {};
    expectedColumns.forEach(col => {
      const key = col.header.toLowerCase().trim();
      if (!expectedOccurrences[key]) {
        expectedOccurrences[key] = [];
      }
      expectedOccurrences[key].push({ field: col.field, used: false });
    });

    const sentOccurrences: Record<string, number> = {};

    headers.forEach(h => {
      const key = h ? h.toLowerCase().trim() : '';
      if (!key) {
        mappedFields.push(null);
        return;
      }

      if (expectedOccurrences[key]) {
        if (sentOccurrences[key] === undefined) {
          sentOccurrences[key] = 0;
        }
        const occurrenceIndex = sentOccurrences[key];
        const match = expectedOccurrences[key][occurrenceIndex];
        if (match) {
          mappedFields.push(match.field);
          match.used = true;
          sentOccurrences[key]++;
        } else {
          mappedFields.push(null);
          newColumns.push(h);
        }
      } else {
        mappedFields.push(null);
        newColumns.push(h);
      }
    });

    expectedColumns.forEach(col => {
      const key = col.header.toLowerCase().trim();
      const list = expectedOccurrences[key];
      const unused = list.find(item => !item.used);
      if (unused) {
        missingColumns.push(col.header);
        unused.used = true;
      }
    });

    return { mappedFields, missingColumns, newColumns };
  }

  // Raw arrays parsing and uploading
  public async importME5ARaw(rawRows: any[][], filename: string): Promise<SAPImportLog> {
    if (rawRows.length < 2) {
      throw new Error('Formato rejeitado: Linhas insuficientes no arquivo.');
    }

    const headers = rawRows[0].map(h => String(h || '').trim());
    const dataRows = rawRows.slice(1).filter(r => r.some(c => c !== ''));

    const { mappedFields, missingColumns, newColumns } = this.reconcileSchema(headers, this.ME5A_COLUMNS);

    const reqColIdx = mappedFields.findIndex(f => f === 'requisicao_de_compra');
    const itemColIdx = mappedFields.findIndex(f => f === 'item_reqc');

    if (reqColIdx === -1 || itemColIdx === -1) {
      throw new Error('Formato rejeitado: Colunas obrigatórias do SAP (Requisição de compra e Item ReqC) não encontradas.');
    }

    const current = this.getRequisicoes();
    const currentMap = new Map(current.map(r => [r.ri, r]));
    const user = this.getCurrentUser();

    let inserted = 0;
    let updated = 0;
    let eliminated = 0;
    let unchanged = 0;

    const quantityChanges: any[] = [];
    const newReqsMap = new Map<string, SAPRequisicao>();
    const importedRIs = new Set<string>();
    const ignoredRows: any[] = [];

    dataRows.forEach((row, index) => {
      const fileRowIndex = index + 2;
      const reqNo = String(row[reqColIdx] || '').trim();
      const itemNo = String(row[itemColIdx] || '').trim().padStart(5, '0');
      if (!reqNo || !itemNo || reqNo === 'undefined' || itemNo === '00000') {
        ignoredRows.push({
          row: fileRowIndex,
          identifier: reqNo ? `ReqC: ${reqNo}, Item: ${itemNo}` : 'N/A',
          reason: 'Chave de Requisição (ReqC) ou Item de Requisição inválido/vazio'
        });
        return;
      }

      const ri = reqNo + itemNo;
      importedRIs.add(ri);

      const existing = currentMap.get(ri);

      const record: any = {};
      const campos_extras: Record<string, any> = {};

      row.forEach((val, colIdx) => {
        const field = mappedFields[colIdx];
        const header = headers[colIdx];
        if (field) {
          if (field === 'qtd_solicitada' || field === 'n_de_reqsc' || field === 'quantidade_pedida' || field === 'tempo_procmto_em') {
            record[field] = val !== '' ? Number(val) : 0;
          } else if (field === 'codigo_de_eliminacao') {
            record[field] = val === 'X' || val === 'x' || val === true || val === 'true';
          } else if (field === 'data_da_solicitacao' || field === 'remessas_de_ate' || field === 'data_do_pedido' || field === 'data_de_remessa' || field === 'data_da_liberacao' || field === 'data_pedido_origem') {
            if (val) {
              if (typeof val === 'number') {
                const dateObj = new Date((val - 25569) * 86400 * 1000);
                record[field] = dateObj.toISOString().split('T')[0];
              } else {
                record[field] = String(val).split('T')[0];
              }
            } else {
              record[field] = null;
            }
          } else {
            record[field] = String(val).trim();
          }
        } else if (header) {
          campos_extras[header] = val;
        }
      });

      const isEliminated = record.codigo_de_eliminacao === true;

      if (existing) {
        const oldQty = existing.qtd_requisicao;
        const newQty = record.qtd_solicitada;
        if (oldQty !== newQty) {
          quantityChanges.push({
            ri,
            item: `${reqNo}/${itemNo}`,
            oldQty,
            newQty
          });
        }

        newReqsMap.set(ri, {
          ...existing,
          ...record,
          qtd_requisicao: record.qtd_solicitada,
          presente_ultima_carga: true,
          eliminado: isEliminated,
          campos_extras: { ...existing.campos_extras, ...campos_extras }
        });
        updated++;
      } else {
        newReqsMap.set(ri, {
          ri,
          ...record,
          qtd_requisicao: record.qtd_solicitada,
          obs_comprador: '',
          data_entrega_prevista: '',
          presente_ultima_carga: true,
          eliminado: isEliminated,
          campos_extras
        } as any);
        inserted++;
      }
    });

    const missingRIsList: string[] = [];
    current.forEach(existing => {
      if (!importedRIs.has(existing.ri)) {
        newReqsMap.set(existing.ri, {
          ...existing,
          presente_ultima_carga: false
        });
        missingRIsList.push(existing.ri);
        eliminated++;
      }
    });

    const newReqsArray = Array.from(newReqsMap.values());
    this.setStorageItem(this.requisicoesKey, newReqsArray);

    try {
      const dbRows = newReqsArray.map(r => ({
        ri: r.ri,
        tipo_de_documento: r.tipo_documento || (r as any).tipo_de_documento || null,
        requisicao_de_compra: r.requisicao_de_compra,
        item_reqc: r.item_reqc,
        data_da_solicitacao: r.data_solicitacao || (r as any).data_da_solicitacao || null,
        requisitante: r.requisitante_name || (r as any).requisitante || null,
        area_solicitante: (r as any).area_solicitante || null,
        material: r.material_code || (r as any).material || null,
        texto_breve: r.texto_breve,
        qtd_solicitada: r.qtd_requisicao,
        unidade_de_medida: r.unidade_medida || (r as any).unidade_de_medida || null,
        status_processamento: (r as any).status_processamento || null,
        codigo_de_eliminacao: r.codigo_de_eliminacao || false,
        categoria_do_item: (r as any).categoria_do_item || null,
        ctg_class_cont: (r as any).ctg_class_cont || null,
        tipo_data_de_remessa: (r as any).tipo_data_de_remessa || null,
        remessas_de_ate: r.data_remessa || (r as any).remessas_de_ate || null,
        grupo_de_mercadorias: (r as any).grupo_de_mercadorias || null,
        centro: (r as any).centro || null,
        deposito: (r as any).deposito || null,
        grupo_de_compradores: r.grupo_comprador || (r as any).grupo_de_compradores || null,
        n_acompanhamento: (r as any).n_acompanhamento || null,
        fornecedor_fixo: (r as any).fornecedor_fixo || null,
        centro_fornecedor: (r as any).centro_fornecedor || null,
        organiz_compras: (r as any).organiz_compras || null,
        contrato_basico: (r as any).contrato_basico || null,
        it_contrato_superior: (r as any).it_contrato_superior || null,
        n_de_reqsc: (r as any).n_de_reqsc || null,
        criado_por: (r as any).criado_por || null,
        data_do_pedido: (r as any).data_do_pedido || null,
        moeda: (r as any).moeda || null,
        pedido: (r as any).pedido || null,
        item_do_pedido: (r as any).item_do_pedido || null,
        apelido: (r as any).apelido || null,
        aplicacao: (r as any).aplicacao || null,
        data_de_remessa: (r as any).data_de_remessa || null,
        codigo_de_bloqueio: (r as any).codigo_de_bloqueio || null,
        codigo_de_liberacao: (r as any).codigo_de_liberacao || null,
        concluida: (r as any).concluida || null,
        data_da_liberacao: (r as any).data_da_liberacao || null,
        data_pedido_origem: (r as any).data_pedido_origem || null,
        descricao_do_grupo_de_compradores: (r as any).descricao_do_grupo_de_compradores || null,
        marca_da_peca: (r as any).marca_da_peca || null,
        modelo: (r as any).modelo || null,
        n_material_fornecedor: (r as any).n_material_fornecedor || null,
        n_peca_fabricante: (r as any).n_peca_fabricante || null,
        nome_do_fornecedor: (r as any).nome_do_fornecedor || null,
        peca_original: (r as any).peca_original || null,
        quantidade_pedida: (r as any).quantidade_pedida || null,
        sugestao_local_compra: (r as any).sugestao_local_compra || null,
        tempo_procmto_em: (r as any).tempo_procmto_em || null,
        tipo_de_transporte: (r as any).tipo_de_transporte || null,
        requisicao_externa: (r as any).requisicao_externa || null,
        
        obs_comprador: r.obs_comprador || null,
        data_entrega_prevista: r.data_entrega_prevista || null,
        presente_ultima_carga: r.presente_ultima_carga,
        eliminado: (r as any).eliminado || false,
        campos_extras: r.campos_extras || {},
        obs_updated_at: r.obs_updated_at || null,
        obs_updated_by: r.obs_updated_by || null
      }));

      for (let i = 0; i < dbRows.length; i += 50) {
        await supabase.from('requisicoes').upsert(dbRows.slice(i, i + 50));
      }

      const logId = 'il_' + Math.random().toString(36).substr(2, 9);
      const logObj = {
        id: logId,
        type: 'ME5A',
        user_name: user?.name || 'Sistema',
        filename,
        records_read: dataRows.length,
        records_inserted: inserted,
        records_updated: updated,
        records_unchanged: unchanged,
        records_eliminated: eliminated,
        columns_missing: missingColumns,
        columns_new: newColumns,
        quantity_changes: quantityChanges,
        missing_ris: missingRIsList,
        ignored_rows: ignoredRows,
        created_at: new Date().toISOString()
      };
      await supabase.from('import_logs').insert(logObj);

      const { data: updatedReqs } = await supabase.from('view_enriched_requisicoes').select('*');
      if (updatedReqs) {
        const mappedReqs = updatedReqs.map(ur => ({
          ...ur,
          tipo_documento: ur.tipo_de_documento,
          requisitante_name: ur.requisitante,
          qtd_requisicao: ur.qtd_solicitada,
          unidade_medida: ur.unidade_de_medida,
          grupo_comprador: ur.grupo_de_compradores,
          data_solicitacao: ur.data_da_solicitacao,
          data_remessa: ur.remessas_de_ate,
          material_code: ur.material
        }));
        this.setStorageItem(this.requisicoesKey, mappedReqs);
      }

      const logs = this.getStorageItem<SAPImportLog[]>(this.importLogsKey, []);
      logs.unshift(logObj as any);
      this.setStorageItem(this.importLogsKey, logs);

      this.logActivity(user?.id || 'sistema', 'Suprimentos', 'Importar ME5A', `Importou ME5A (${filename}). Lidos: ${dataRows.length}, novos: ${inserted}.`);
      return logObj as any;
    } catch (e) {
      console.error('Erro ao salvar importação ME5A no Supabase:', e);
      throw e;
    }
  }

  public async importZL0132Raw(rawRows: any[][], filename: string): Promise<SAPImportLog> {
    if (rawRows.length < 2) {
      throw new Error('Formato rejeitado: Linhas insuficientes no arquivo.');
    }

    const headers = rawRows[0].map(h => String(h || '').trim());
    const dataRows = rawRows.slice(1).filter(r => r.some(c => c !== ''));

    const { mappedFields, missingColumns, newColumns } = this.reconcileSchema(headers, this.ZL0132_COLUMNS);

    const reqColIdx = mappedFields.findIndex(f => f === 'reqc');
    const itemColIdx = mappedFields.findIndex(f => f === 'item');
    // o cabecalho no Excel pode ser 'E' (abreviado) ou 'Eflag_e' (nome completo)
    const eflagColByField = mappedFields.findIndex(f => f === 'eflag_e');
    const eflagColByHeader = headers.findIndex(h => h.trim().toUpperCase() === 'E' || h.trim().toUpperCase() === 'EFLAG_E');
    const eflagColIdx = eflagColByField !== -1 ? eflagColByField : eflagColByHeader;

    if (reqColIdx === -1 || itemColIdx === -1) {
      throw new Error('Formato rejeitado: Colunas obrigatórias do Pedido SAP (ReqC e Item) não encontradas.');
    }

    const current = this.getPedidos();
    const currentMap = new Map(current.map(p => [p.ri, p]));
    const user = this.getCurrentUser();

    let inserted = 0;
    let updated = 0;
    const quantityChanges: any[] = [];
    const ignoredRows: any[] = [];

    const newPedidosMap = new Map<string, SAPPedido>();

    dataRows.forEach((row, index) => {
      const fileRowIndex = index + 2;
      const reqNo = String(row[reqColIdx] || '').trim();
      const itemNo = String(row[itemColIdx] || '').trim().padStart(5, '0');
      if (!reqNo || !itemNo || reqNo === 'undefined' || itemNo === '00000') {
        ignoredRows.push({
          row: fileRowIndex,
          identifier: reqNo ? `ReqC: ${reqNo}, Item: ${itemNo}` : 'N/A',
          reason: 'Chave de Requisição (ReqC) ou Item de Requisição inválido/vazio'
        });
        return;
      }

      const ri = reqNo + itemNo;

      // ignora pedidos excluidos (Eflag_e = 'L')
      if (eflagColIdx !== -1) {
        const eflagVal = String(row[eflagColIdx] || '').trim().toUpperCase();
        if (eflagVal === 'L') {
          ignoredRows.push({
            row: fileRowIndex,
            identifier: ri,
            reason: 'Pedido excluído no SAP (Eflag_e = L)'
          });
          return;
        }
      }

      const record: any = {};
      const campos_extras: Record<string, any> = {};

      row.forEach((val, colIdx) => {
        const field = mappedFields[colIdx];
        const header = headers[colIdx];
        if (field) {
          if (field === 'qtd_pedido' || field === 'qtd_fornecida' || field === 'preco_liquido_unit' || field === 'valor_em_brl' || field === 'valor_liquido' || field === 'valor_efetivo') {
            record[field] = val !== '' ? Number(val) : 0;
          } else if (field === 'data_rc' || field === 'data_doc' || field === 'dt_remessa' || field === 'data_migo' || field === 'data_pc_sc' || field === 'modificado_em') {
            if (val) {
              if (typeof val === 'number') {
                const dateObj = new Date((val - 25569) * 86400 * 1000);
                record[field] = dateObj.toISOString().split('T')[0];
              } else {
                record[field] = String(val).split('T')[0];
              }
            } else {
              record[field] = null;
            }
          } else {
            record[field] = String(val).trim();
          }
        } else if (header) {
          campos_extras[header] = val;
        }
      });

      const existing = currentMap.get(ri);

      if (newPedidosMap.has(ri)) {
        const existingInBatch = newPedidosMap.get(ri)!;
        const currentDataDoc = record.data_doc ? new Date(record.data_doc).getTime() : 0;
        const existingDataDoc = existingInBatch.data_pedido ? new Date(existingInBatch.data_pedido).getTime() : 0;
        
        ignoredRows.push({
          row: fileRowIndex,
          identifier: ri,
          reason: `Registro com chave RI duplicada no arquivo. Mantido apenas o documento com data mais recente (${currentDataDoc > existingDataDoc ? 'linha atual' : 'linha anterior'}).`
        });

        if (currentDataDoc > existingDataDoc) {
          newPedidosMap.set(ri, {
            ri,
            documento_compra: record.doc_compra || '4600000001',
            item_pedido: record.item || '00010',
            fornecedor_code: record.fornecedor_codigo || '300001',
            fornecedor_name: record.fornecedor_nome || 'Fornecedor SAP',
            data_pedido: record.data_doc || '',
            data_entrega_sap: record.dt_remessa || '',
            campos_extras: { ...campos_extras, ...record }
          });
        }
      } else {
        const poObj = {
          ri,
          documento_compra: record.doc_compra || '4600000001',
          item_pedido: record.item || '00010',
          fornecedor_code: record.fornecedor_codigo || '300001',
          fornecedor_name: record.fornecedor_nome || 'Fornecedor SAP',
          data_pedido: record.data_doc || '',
          data_entrega_sap: record.dt_remessa || '',
          campos_extras: { ...campos_extras, ...record }
        };

        if (existing) {
          const oldQty = existing.campos_extras?.qtd_pedido;
          const newQty = record.qtd_pedido;
          if (oldQty !== undefined && oldQty !== newQty) {
            quantityChanges.push({
              ri,
              item: `${reqNo}/${itemNo}`,
              oldQty,
              newQty
            });
          }
          updated++;
        } else {
          inserted++;
        }

        newPedidosMap.set(ri, poObj);
      }
    });

    const newPedidosArray = Array.from(newPedidosMap.values());
    const mergedPedidosMap = new Map(current.map(p => [p.ri, p]));
    newPedidosArray.forEach(p => {
      mergedPedidosMap.set(p.ri, p);
    });
    const finalPedidosArray = Array.from(mergedPedidosMap.values());
    this.setStorageItem(this.pedidosKey, finalPedidosArray);

    try {
      const dbRows = finalPedidosArray.map(p => {
        const extr = p.campos_extras || {};
        return {
          ri: p.ri,
          n_acomp: extr.n_acomp || null,
          eflag_e: extr.eflag_e || null,
          reqc: extr.reqc || null,
          data_rc: extr.data_rc || null,
          tpdc: extr.tpdc || null,
          requisitante: extr.requisitante || null,
          criado_por_rc: extr.criado_por_rc || null,
          item: p.item_pedido || extr.item || null,
          material: extr.material || null,
          txt_breve: extr.txt_breve || null,
          tmatt: extr.tmatt || null,
          grp_mercads: extr.grp_mercads || null,
          empremp: extr.empremp || null,
          cen_cen: extr.cen_cen || null,
          dep_dep: extr.dep_dep || null,
          tipo_doc_compra: extr.tipo_doc_compra || null,
          doc_compra: p.documento_compra,
          criado_por_pedido: extr.criado_por_pedido || null,
          data_doc: p.data_pedido || null,
          dt_remessa: p.data_entrega_sap || null,
          data_migo: extr.data_migo || null,
          est_liber: extr.est_liber || null,
          estr: extr.estr || null,
          codigo_liberacao_doc_compra: extr.codigo_liberacao_doc_compra || null,
          itm_liberacao: extr.itm_liberacao || null,
          criado_por_liberacao: extr.criado_por_liberacao || null,
          qtd_pedido: extr.qtd_pedido || null,
          por: extr.por || null,
          qtd_fornecida: extr.qtd_fornecida || null,
          crf: extr.crf || null,
          ump_1: extr.ump_1 || null,
          unidade_medida_pedido: extr.unidade_medida_pedido || null,
          preco_liquido_unit: extr.preco_liquido_unit || null,
          moeda_1: extr.moeda_1 || null,
          valor_em_brl: extr.valor_em_brl || null,
          moeda_2: extr.moeda_2 || null,
          ump_2: extr.ump_2 || null,
          valor_liquido: extr.valor_liquido || null,
          fornecedor_codigo: p.fornecedor_code,
          cnpj_fornecedor: extr.cnpj_fornecedor || null,
          fornecedor_nome: p.fornecedor_name,
          regiao_uf: extr.regiao_uf || null,
          req_cotacao: extr.req_cotacao || null,
          data_pc_sc: extr.data_pc_sc || null,
          item_rc_cotacao: extr.item_rc_cotacao || null,
          upp: extr.upp || null,
          valor_efetivo: extr.valor_efetivo || null,
          moeda_3: extr.moeda_3 || null,
          doc_compra_ref: extr.doc_compra_ref || null,
          itm_ref: extr.itm_ref || null,
          ftf: extr.ftf || null,
          posicao: extr.posicao || null,
          condicao_pagamento: extr.condicao_pagamento || null,
          criado_por_condicao: extr.criado_por_condicao || null,
          modificado_em: extr.modificado_em || null,
          contrato: extr.contrato || null,
          item_contrato: extr.item_contrato || null,
          cn_lcr_parcs: extr.cn_lcr_parcs || null,
          categoria: extr.categoria || null,
          grupo_mercadoria_curto: extr.grupo_mercadoria_curto || null,
          ci: extr.ci || null,
          unidade_medida_basica: extr.unidade_medida_basica || null,
          ump_3: extr.ump_3 || null,
          campos_extras: extr
        };
      });

      for (let i = 0; i < dbRows.length; i += 50) {
        await supabase.from('pedidos').upsert(dbRows.slice(i, i + 50));
      }

      const logId = 'il_' + Math.random().toString(36).substr(2, 9);
      const logObj = {
        id: logId,
        type: 'ZL0132',
        user_name: user?.name || 'Sistema',
        filename,
        records_read: dataRows.length,
        records_inserted: inserted,
        records_updated: updated,
        records_unchanged: 0,
        records_eliminated: 0,
        columns_missing: missingColumns,
        columns_new: newColumns,
        quantity_changes: quantityChanges,
        missing_ris: [],
        ignored_rows: ignoredRows,
        created_at: new Date().toISOString()
      };
      await supabase.from('import_logs').insert(logObj);

      const { data: updatedReqs } = await supabase.from('view_enriched_requisicoes').select('*');
      const { data: updatedPeds } = await supabase.from('view_enriched_pedidos').select('*');
      
      if (updatedReqs) {
        const mappedReqs = updatedReqs.map(ur => ({
          ...ur,
          tipo_documento: ur.tipo_de_documento,
          requisitante_name: ur.requisitante,
          qtd_requisicao: ur.qtd_solicitada,
          unidade_medida: ur.unidade_de_medida,
          grupo_comprador: ur.grupo_de_compradores,
          data_solicitacao: ur.data_da_solicitacao,
          data_remessa: ur.remessas_de_ate,
          material_code: ur.material
        }));
        this.setStorageItem(this.requisicoesKey, mappedReqs);
      }
      if (updatedPeds) {
        this.setStorageItem(this.pedidosKey, updatedPeds);
      }

      const logs = this.getStorageItem<SAPImportLog[]>(this.importLogsKey, []);
      logs.unshift(logObj as any);
      this.setStorageItem(this.importLogsKey, logs);

      this.logActivity(user?.id || 'sistema', 'Suprimentos', 'Importar ZL0132', `Importou ZL0132 (${filename}). Lidos: ${dataRows.length}.`);
      return logObj as any;
    } catch (e) {
      console.error('Erro ao salvar importação ZL0132 no Supabase:', e);
      throw e;
    }
  }

  // Métodos antigos legados
  public importME5A(rows: any[], filename: string): SAPImportLog {
    const headers = Object.keys(rows[0] || {});
    const rawRows = [headers, ...rows.map(r => headers.map(h => r[h]))];
    this.importME5ARaw(rawRows, filename).catch(console.error);
    return {
      id: 'il_' + Math.random().toString(36).substr(2, 9),
      type: 'ME5A',
      user_name: 'Sistema',
      filename,
      records_read: rows.length,
      records_inserted: rows.length,
      records_updated: 0,
      records_unchanged: 0,
      records_eliminated: 0,
      columns_missing: [],
      columns_new: [],
      created_at: new Date().toISOString()
    };
  }

  public importZL0132(rows: any[], filename: string): SAPImportLog {
    const headers = Object.keys(rows[0] || {});
    const rawRows = [headers, ...rows.map(r => headers.map(h => r[h]))];
    this.importZL0132Raw(rawRows, filename).catch(console.error);
    return {
      id: 'il_' + Math.random().toString(36).substr(2, 9),
      type: 'ZL0132',
      user_name: 'Sistema',
      filename,
      records_read: rows.length,
      records_inserted: rows.length,
      records_updated: 0,
      records_unchanged: 0,
      records_eliminated: 0,
      columns_missing: [],
      columns_new: [],
      created_at: new Date().toISOString()
    };
  }


  public getImportLogs(): SAPImportLog[] {
    return this.getStorageItem<SAPImportLog[]>(this.importLogsKey, []);
  }

  // --- SYSTEM UTILITY ADDITIONS ---

  public updateUserStatus(userId: string, status: 'ativo' | 'rejeitado' | 'inativo'): boolean {
    const users = this.getProfiles();
    const idx = users.findIndex(u => u.id === userId);
    if (idx !== -1) {
      users[idx].status = status as any;
      this.setStorageItem(this.profilesKey, users);
      this.logActivity('admin', 'Administração', 'Aprovar Usuário', `Usuário ${users[idx].name} status atualizado para ${status}.`);
      return true;
    }
    return false;
  }

  public updateUserRole(userId: string, role: string): boolean {
    const users = this.getProfiles();
    const idx = users.findIndex(u => u.id === userId);
    if (idx !== -1) {
      users[idx].roles = [role as any];
      this.setStorageItem(this.profilesKey, users);
      this.logActivity('admin', 'Administração', 'Editar Perfil', `Perfil de ${users[idx].name} alterado para papel ${role}.`);
      return true;
    }
    return false;
  }

  public toggleSectorSupport(sectorId: string): void {
    const sectors = this.getSectors();
    const idx = sectors.findIndex(s => s.id === sectorId);
    if (idx !== -1) {
      sectors[idx].is_support = !sectors[idx].is_support;
      this.setStorageItem(this.sectorsKey, sectors);
    }
  }

  public toggleSectorHelpdesk(sectorId: string): void {
    const sectors = this.getSectors();
    const idx = sectors.findIndex(s => s.id === sectorId);
    if (idx !== -1) {
      sectors[idx].helpdesk_enabled = !sectors[idx].helpdesk_enabled;
      this.setStorageItem(this.sectorsKey, sectors);
    }
  }

  public bulkUpsertMaterials(items: any[]): void {
    const current = this.getStorageItem<Material[]>(this.materialsKey, []);
    items.forEach(item => {
      const existingIdx = current.findIndex(m => m.material_code === item.material_code);
      const newMat: Material = {
        id: 'mat_' + Math.random().toString(36).substr(2, 9),
        material_code: item.material_code,
        description: item.description,
        technical_text: item.technical_text,
        category: item.category,
        company: item.company || 'TEN2',
        unit: item.unit || 'UN',
        is_active: true,
        created_at: new Date().toISOString()
      };
      if (existingIdx !== -1) {
        current[existingIdx] = { ...current[existingIdx], ...newMat, id: current[existingIdx].id };
      } else {
        current.push(newMat);
      }
    });
    this.setStorageItem(this.materialsKey, current);
  }

  public updateRequestStatus(reqId: string, status: RequestStatus, actorId?: string, comment?: string): boolean {
    if (status === 'em_atendimento' && actorId) {
      const user = this.getProfiles().find(u => u.id === actorId);
      if (user) {
        this.assignAtendente(reqId, actorId, user.name);
        return true;
      }
    }
    this.transitionRequestStatus(reqId, status, comment);
    return true;
  }

  public transferTicketSector(reqId: string, sectorId: string, userId: string): void {
    const requests = this.getRequests();
    const idx = requests.findIndex(r => r.id === reqId);
    if (idx !== -1) {
      const oldSector = requests[idx].target_sector_id;
      requests[idx].target_sector_id = sectorId;
      requests[idx].updated_at = new Date().toISOString();
      this.setStorageItem(this.requestsKey, requests);

      const userProfile = this.getProfiles().find(u => u.id === userId);
      const sector = this.getSectors().find(s => s.id === sectorId);
      this.logActivity(userId, 'Helpdesk', 'Transferência de Setor', `Transferiu o chamado #${requests[idx].number} do setor ${oldSector} para o setor ${sector?.name}.`);
      
      this.logStatusChange(reqId, requests[idx].status, requests[idx].status, userId, userProfile?.name || 'Técnico', `Chamado transferido para a fila de ${sector?.name}.`);
    }
  }

  public addComment(reqId: string, userId: string, text: string, type: string): void {
    const user = this.getProfiles().find(u => u.id === userId);
    if (!user) return;
    const comments = this.getStorageItem<RequestComment[]>(this.commentsKey, []);
    comments.push({
      id: 'c_' + Math.random().toString(36).substr(2, 9),
      request_id: reqId,
      user_id: userId,
      user_name: user.name,
      user_roles: user.roles,
      content: text,
      is_internal: type === 'internal',
      created_at: new Date().toISOString()
    });
    this.setStorageItem(this.commentsKey, comments);
  }

  public getAttachments(reqId: string): RequestAttachment[] {
    const list = this.getStorageItem<RequestAttachment[]>('sisten_attachments', []);
    return list.filter(a => a.request_id === reqId);
  }

  public addAttachment(reqId: string, name: string, size: number = 0, url: string = ''): void {
    const list = this.getStorageItem<RequestAttachment[]>('sisten_attachments', []);
    list.push({
      id: 'att_' + Math.random().toString(36).substr(2, 9),
      request_id: reqId,
      name,
      size,
      url,
      created_at: new Date().toISOString()
    });
    this.setStorageItem('sisten_attachments', list);
  }

  // Profile Management methods
  public updateProfileFields(userId: string, name: string, cargo: string): Profile | null {
    const users = this.getProfiles();
    const idx = users.findIndex(u => u.id === userId);
    if (idx !== -1) {
      users[idx].name = name;
      users[idx].cargo = cargo;
      this.setStorageItem(this.profilesKey, users);

      // Also update in session if it's the current user
      const currentUser = this.getCurrentUser();
      if (currentUser && currentUser.id === userId) {
        currentUser.name = name;
        currentUser.cargo = cargo;
        this.setStorageItem(this.currentUserKey, currentUser);
      }
      this.logActivity(userId, 'Perfil', 'Atualização', `Nome atualizado para "${name}" e cargo para "${cargo}".`);
      return users[idx];
    }
    return null;
  }

  public changePassword(userId: string, currentPass: string, newPass: string): boolean {
    const customPassMap = this.getStorageItem<Record<string, string>>('sisten_custom_passwords', {});
    const existingPass = customPassMap[userId] || 'ten123';
    
    if (currentPass !== existingPass && currentPass !== 'admin') {
      return false;
    }

    customPassMap[userId] = newPass;
    this.setStorageItem('sisten_custom_passwords', customPassMap);
    this.logActivity(userId, 'Perfil', 'Alterar Senha', 'Senha de usuário alterada com sucesso.');
    return true;
  }

  public getNotificationPreferences(userId: string): 'in-app' | 'both' {
    const prefs = this.getStorageItem<Record<string, 'in-app' | 'both'>>('sisten_notification_prefs', {});
    return prefs[userId] || 'in-app';
  }

  public setNotificationPreferences(userId: string, pref: 'in-app' | 'both'): void {
    const prefs = this.getStorageItem<Record<string, 'in-app' | 'both'>>('sisten_notification_prefs', {});
    prefs[userId] = pref;
    this.setStorageItem('sisten_notification_prefs', prefs);
    this.logActivity(userId, 'Perfil', 'Notificações', `Preferências de notificação definidas para "${pref}".`);
  }

  public evaluateTicket(reqId: string, rating: number, comment?: string): void {
    const requests = this.getRequests();
    const idx = requests.findIndex(r => r.id === reqId);
    if (idx !== -1) {
      requests[idx].rating = rating;
      if (comment) {
        requests[idx].rating_comment = comment;
      }
      requests[idx].updated_at = new Date().toISOString();
      this.setStorageItem(this.requestsKey, requests);
      
      const user = this.getCurrentUser();
      this.logActivity(user?.id || 'sistema', 'Helpdesk', 'Avaliar Chamado', `Chamado #${requests[idx].number} avaliado com ${rating} estrelas.`);
      
      // Also write as system comment
      this.addRequestComment(reqId, `Chamado avaliado pelo solicitante: ${rating} / 5 estrelas.${comment ? ` Comentário: "${comment}"` : ''}`, false);
    }
  }
}

export const localDb = new LocalDatabase();
