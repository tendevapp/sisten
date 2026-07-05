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
          name: 'Comprador G001',
          cargo: 'Comprador Pleno',
          sector_id: '5', // Suprimentos
          roles: ['comprador', 'visualizador'],
          status: 'ativo',
          created_at: '2026-01-01T08:00:00-03:00'
        },
        {
          id: 'u6',
          email: 'comprador2@ten.com.br',
          name: 'Comprador G002',
          cargo: 'Comprador Sênior',
          sector_id: '5', // Suprimentos
          roles: ['comprador', 'visualizador'],
          status: 'ativo',
          created_at: '2026-01-01T08:00:00-03:00'
        },
        {
          id: 'u7',
          email: 'comprador3@ten.com.br',
          name: 'Comprador G003',
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
        { id: 'bg1', user_id: 'u5', group_code: 'G001', is_primary: true },
        { id: 'bg2', user_id: 'u6', group_code: 'G002', is_primary: true },
        { id: 'bg3', user_id: 'u7', group_code: 'G003', is_primary: true },
        { id: 'bg4', user_id: 'u2', group_code: 'G004', is_primary: true }
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

    // Default Current User (Admin by default for testing, user can switch in header/login)
    if (!localStorage.getItem(this.currentUserKey)) {
      const users = this.getStorageItem<Profile[]>(this.profilesKey, []);
      const adminUser = users.find(u => u.email === 'admin@ten.com.br');
      if (adminUser) {
        this.setStorageItem(this.currentUserKey, adminUser);
      }
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

  public importMaterials(materials: Omit<Material, 'id' | 'is_active' | 'created_at'>[]): { read: number; inserted: number; updated: number; deactivated: number } {
    const currentList = this.getMaterials();
    const currentMap = new Map(currentList.map(m => [m.material_code, m]));
    
    const importedCodes = new Set(materials.map(m => m.material_code));
    
    let inserted = 0;
    let updated = 0;
    let deactivated = 0;

    const newList: Material[] = [];

    // Upsert imported materials
    materials.forEach((m, idx) => {
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

    this.setStorageItem(this.materialsKey, newList);

    const user = this.getCurrentUser();
    this.logActivity(
      user?.id || 'admin', 
      'Catálogo SAP', 
      'Importar Catálogo', 
      `Excel processado. Lidos: ${materials.length}, Inseridos: ${inserted}, Atualizados: ${updated}, Desativados: ${deactivated}.`
    );

    return { read: materials.length, inserted, updated, deactivated };
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
    return this.getStorageItem<SAPRequisicao[]>(this.requisicoesKey, []);
  }

  public getPedidos(): SAPPedido[] {
    return this.getStorageItem<SAPPedido[]>(this.pedidosKey, []);
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

      reqs[idx].obs_comprador = obs;
      reqs[idx].data_entrega_prevista = deliveryDate;
      reqs[idx].obs_updated_at = new Date().toISOString();
      reqs[idx].obs_updated_by = userName;

      this.setStorageItem(this.requisicoesKey, reqs);

      // Save to history
      const hist = this.getStorageItem<SAPObsHistory[]>(this.obsHistoryKey, []);
      hist.push({
        id: 'oh_' + Math.random().toString(36).substr(2, 9),
        ri,
        obs_comprador: obs,
        data_entrega_prevista: deliveryDate,
        user_name: userName,
        created_at: new Date().toISOString()
      });
      this.setStorageItem(this.obsHistoryKey, hist);

      return true;
    }
    return false;
  }

  public getObsHistory(ri: string): SAPObsHistory[] {
    return this.getStorageItem<SAPObsHistory[]>(this.obsHistoryKey, []).filter(h => h.ri === ri);
  }

  // Schema tolerant imports
  public importME5A(rows: any[], filename: string): SAPImportLog {
    const current = this.getRequisicoes();
    const currentMap = new Map(current.map(r => [r.ri, r]));
    const user = this.getCurrentUser();

    // Define minimum required columns to build RI key
    // E.g., 'Requisição de compra' and 'Item ReqC'
    const reqColumnCandidates = ['requisicao_de_compra', 'requisicao', 'req_compra', 'requisicao_compra', 'no_requisicao', 'req_c'];
    const itemColumnCandidates = ['item_reqc', 'item', 'item_requisicao', 'item_req', 'item_req_c'];

    let keys = rows.length > 0 ? Object.keys(rows[0]) : [];
    
    // Normalization helper
    const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/[\s\.\-\/]/g, '_');

    // Check keys mapping
    const getMappedKey = (candidates: string[]) => {
      const normalizedCandidates = candidates.map(c => normalize(c));
      return keys.find(k => normalizedCandidates.includes(normalize(k)));
    };

    const reqKey = getMappedKey(reqColumnCandidates) || keys.find(k => normalize(k).includes('requis') || normalize(k).includes('req'));
    const itemKey = getMappedKey(itemColumnCandidates) || keys.find(k => normalize(k).includes('item'));

    if (!reqKey || !itemKey) {
      throw new Error('Formato rejeitado: Colunas obrigatórias do SAP (Requisição de compra e Item) não encontradas.');
    }

    let inserted = 0;
    let updated = 0;
    let eliminated = 0;
    let unchanged = 0;

    const newReqs: SAPRequisicao[] = [];
    const importedRIs = new Set<string>();

    rows.forEach((row, idx) => {
      const reqNo = String(row[reqKey]).trim();
      const itemNo = String(row[itemKey]).trim().padStart(5, '0');
      const ri = reqNo + itemNo;
      importedRIs.add(ri);

      const existing = currentMap.get(ri);

      // Resolve other columns mapping
      const getVal = (candidates: string[], def: any = '') => {
        const normalizedCandidates = candidates.map(c => normalize(c));
        const match = keys.find(k => normalizedCandidates.includes(normalize(k)));
        return match ? row[match] : def;
      };

      const material_code = String(getVal(['material_code', 'material', 'codigo_material', 'codigo_do_material', 'insumo'], '10000001')).trim();
      const texto_breve = String(getVal(['texto_breve', 'texto', 'descricao', 'texto_breve_material', 'txt_breve'], 'Insumo SAP'));
      const qtd_requisicao = Number(getVal(['qtd_requisicao', 'quantidade', 'qtd', 'qtd_solicitada', 'quantidade_solicitada'], 1));
      const unidade_medida = String(getVal(['unidade_medida', 'unidade', 'un', 'ump', 'unidade_de_medida', 'um'], 'UN'));
      const grupo_comprador = String(getVal(['grupo_comprador', 'grupo', 'comprador', 'grupo_de_compras', 'grupo_compradores', 'grupo_de_compradores'], 'G001'));
      const data_solicitacao = String(getVal(['data_solicitacao', 'data_solic', 'data_criacao', 'data_da_solicitacao', 'criado_em'], new Date().toISOString().split('T')[0]));
      const data_remessa = String(getVal(['data_remessa', 'data_entrega', 'remessa', 'remessas_de_ate'], data_solicitacao));
      const requisitante_name = String(getVal(['requisitante_name', 'requisitante', 'criado_por', 'solicitante'], 'Carga SAP'));
      const tipo_documento = String(getVal(['tipo_documento', 'tipo_doc', 'doc_type', 'tipo_de_documento'], 'ZR01'));
      const codigo_de_eliminacao = getVal(['codigo_de_eliminacao', 'eliminacao', 'eliminado', 'codigo_eliminacao'], '') === 'X' || getVal(['codigo_de_eliminacao', 'eliminacao', 'eliminado', 'codigo_eliminacao'], false) === true;

      // Extract remaining columns as campi_extras
      const campos_extras: Record<string, any> = {};
      keys.forEach(k => {
        campos_extras[k] = row[k];
      });

      if (existing) {
        // preserve obs_comprador and data_entrega_prevista
        newReqs.push({
          ...existing,
          material_code,
          texto_breve,
          qtd_requisicao,
          unidade_medida,
          grupo_comprador,
          data_solicitacao,
          data_remessa,
          requisitante_name,
          tipo_documento,
          codigo_de_eliminacao,
          presente_ultima_carga: true,
          campos_extras
        });
        updated++;
      } else {
        newReqs.push({
          ri,
          requisicao_de_compra: reqNo,
          item_reqc: itemNo,
          material_code,
          texto_breve,
          qtd_requisicao,
          unidade_medida,
          grupo_comprador,
          data_solicitacao,
          data_remessa,
          requisitante_name,
          tipo_documento,
          codigo_de_eliminacao,
          presente_ultima_carga: true,
          campos_extras,
          obs_comprador: '',
          data_entrega_prevista: ''
        });
        inserted++;
      }
    });

    // Mark missing RIs as non-present
    current.forEach(existing => {
      if (!importedRIs.has(existing.ri)) {
        newReqs.push({
          ...existing,
          presente_ultima_carga: false
        });
        eliminated++;
      }
    });

    this.setStorageItem(this.requisicoesKey, newReqs);

    const log: SAPImportLog = {
      id: 'il_' + Math.random().toString(36).substr(2, 9),
      type: 'ME5A',
      user_name: user?.name || 'Sistema',
      filename,
      records_read: rows.length,
      records_inserted: inserted,
      records_updated: updated,
      records_unchanged: unchanged,
      records_eliminated: eliminated,
      columns_missing: [],
      columns_new: [],
      created_at: new Date().toISOString()
    };

    const logs = this.getStorageItem<SAPImportLog[]>(this.importLogsKey, []);
    logs.unshift(log);
    this.setStorageItem(this.importLogsKey, logs);

    this.logActivity(user?.id || 'sistema', 'Suprimentos', 'Importar ME5A', `Importou ME5A (${filename}). Registros lidos: ${rows.length}, novos: ${inserted}.`);

    return log;
  }

  public importZL0132(rows: any[], filename: string): SAPImportLog {
    const current = this.getPedidos();
    const currentMap = new Map(current.map(p => [p.ri, p]));
    const user = this.getCurrentUser();

    // Map columns
    let keys = rows.length > 0 ? Object.keys(rows[0]) : [];
    
    // Normalization helper
    const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/[\s\.\-\/]/g, '_');

    // Column candidates for PO linkage
    const reqColumnCandidates = ['requisicao_de_compra', 'requisicao', 'req_compra', 'reqc', 'no_requisicao', 'req_c'];
    const itemColumnCandidates = ['item_reqc', 'item_req', 'itm_req', 'item', 'item_req_c'];

    const getMappedKey = (candidates: string[]) => {
      const normalizedCandidates = candidates.map(c => normalize(c));
      return keys.find(k => normalizedCandidates.includes(normalize(k)));
    };

    const reqKey = getMappedKey(reqColumnCandidates) || keys.find(k => normalize(k).includes('requis') || normalize(k).includes('req'));
    const itemKey = getMappedKey(itemColumnCandidates) || keys.find(k => normalize(k).includes('item'));

    if (!reqKey || !itemKey) {
      throw new Error('Formato rejeitado: Colunas obrigatórias do Pedido SAP para vincular à requisição (Requisição e Item) não encontradas.');
    }

    let inserted = 0;
    let updated = 0;

    const newPedidos: SAPPedido[] = [...current];

    rows.forEach(row => {
      const reqNo = String(row[reqKey]).trim();
      const itemNo = String(row[itemKey]).trim().padStart(5, '0');
      const ri = reqNo + itemNo;

      const getVal = (candidates: string[], def: any = '') => {
        const normalizedCandidates = candidates.map(c => normalize(c));
        const match = keys.find(k => normalizedCandidates.includes(normalize(k)));
        return match ? row[match] : def;
      };

      const documento_compra = String(getVal(['documento_compra', 'pedido', 'doc_compra', 'no_pedido', 'compra'], '4600000001')).trim();
      const item_pedido = String(getVal(['item_pedido', 'item', 'itm', 'item_do_pedido'], '00010')).trim();
      const fornecedor_code = String(getVal(['fornecedor_code', 'fornecedor', 'cod_fornecedor', 'codigo_fornecedor'], '300001')).trim();
      const fornecedor_name = String(getVal(['fornecedor_name', 'nome_fornecedor', 'nome', 'fornecedor_nome'], 'Fornecedor SAP'));
      const data_pedido = String(getVal(['data_pedido', 'data_criacao', 'data', 'data_pedido'], new Date().toISOString().split('T')[0]));
      const data_entrega_sap = String(getVal(['data_entrega_sap', 'data_entrega', 'entrega', 'data_de_entrega'], data_pedido));

      const campos_extras: Record<string, any> = {};
      keys.forEach(k => {
        campos_extras[k] = row[k];
      });

      const existingIdx = newPedidos.findIndex(p => p.ri === ri);

      if (existingIdx !== -1) {
        newPedidos[existingIdx] = {
          ri,
          documento_compra,
          item_pedido,
          fornecedor_code,
          fornecedor_name,
          data_pedido,
          data_entrega_sap,
          campos_extras
        };
        updated++;
      } else {
        newPedidos.push({
          ri,
          documento_compra,
          item_pedido,
          fornecedor_code,
          fornecedor_name,
          data_pedido,
          data_entrega_sap,
          campos_extras
        });
        inserted++;
      }
    });

    this.setStorageItem(this.pedidosKey, newPedidos);

    const log: SAPImportLog = {
      id: 'il_' + Math.random().toString(36).substr(2, 9),
      type: 'ZL0132',
      user_name: user?.name || 'Sistema',
      filename,
      records_read: rows.length,
      records_inserted: inserted,
      records_updated: updated,
      records_unchanged: 0,
      records_eliminated: 0,
      columns_missing: [],
      columns_new: [],
      created_at: new Date().toISOString()
    };

    const logs = this.getStorageItem<SAPImportLog[]>(this.importLogsKey, []);
    logs.unshift(log);
    this.setStorageItem(this.importLogsKey, logs);

    this.logActivity(user?.id || 'sistema', 'Suprimentos', 'Importar ZL0132', `Importou ZL0132 (${filename}). Registros lidos: ${rows.length}.`);

    return log;
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
