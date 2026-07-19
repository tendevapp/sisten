/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { 
  Profile, Sector, Material, Request, RequestItem, RequestComment, 
  RequestStatusHistory, RequestAttachment, Notification, SAPRequisicao, 
  SAPPedido, SAPObsHistory, SAPImportLog, UserBuyerGroup, RequestStatus, Role, RequestType,
  ActivityLog, EnrichedSAPRecord, ItemStatus, PedidoForn, ContatoFornecedor, HistoricoPedidoView,
  RastreioMensagem
} from '../types';
import { CompradorInfo } from '../lib/demandas';
import { INITIAL_SECTORS } from '../data/sectors';
import { generateMaterials, getAutoCategory } from '../data/materials';
import { generateSAPSeedData } from '../data/sapData';
import { supabase } from './supabaseClient';
import { entries as idbEntries, set as idbSet, del as idbDel } from 'idb-keyval';

class LocalDatabase {
  // Espelho em memória de tudo que está no IndexedDB. Toda leitura (getStorageItem)
  // e escrita (setStorageItem) passa por aqui, mantendo a API síncrona usada em toda
  // a aplicação mesmo com uma persistência assíncrona por trás.
  private cache = new Map<string, any>();
  private pageCache = new Map<string, any>();
  private listeners = new Set<() => void>();
  private readonly migratedFlagKey = '__sisten_idb_migrated__';
  private syncPromise: Promise<void> | null = null;

  // Resolvida assim que o cache em memória estiver populado (a partir do IndexedDB,
  // com migração de dados legados do localStorage se necessário). App.tsx aguarda
  // apenas isto — não a sincronização com o Supabase — antes de renderizar.
  public readonly ready: Promise<void>;

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
  private compradoresKey = 'sisten_compradores';
  private logsKey = 'sisten_activity_logs';
  private favoritesKey = 'sisten_favorites';
  private sequencesKey = 'sisten_sequences';
  private pedidosFornKey = 'sisten_pedidos_forn';
  private contatosKey = 'sisten_contatos';

  // Cache versionado: prefixo das chaves que guardam o "carimbo" local de cada
  // dataset pesado (versão + data da última importação + data do último download).
  private datasetMetaPrefix = 'sisten_dsmeta_';

  // Mapa dataset lógico -> chave de armazenamento local, usado pelo gate de versão.
  // É um método (não campo) para não referenciar as chaves antes de sua
  // inicialização na ordem de declaração dos campos da classe.
  private storageKeyFor(dataset: string): string {
    const map: Record<string, string> = {
      materials: this.materialsKey,
      requisicoes: this.requisicoesKey,
      pedidos: this.pedidosKey,
      historico_pedidos: this.historicoPedidosKey,
      pedidosforn: this.pedidosFornKey,
      contatos: this.contatosKey,
    };
    return map[dataset];
  }
  private historicoPedidosKey = 'sisten_historico_pedidos';
  // Cache separado: histórico de fornecedores restrito aos materiais com
  // requisição "Sem PO" em aberto (view vw_historico_fornecedores_sem_po).
  // Usado pela tela "Central de Compras" para sugerir fornecedores sem
  // precisar baixar o histórico completo de compras nem cortar por data.
  private historicoSemPOKey = 'sisten_historico_sem_po';

  // Current logged in user profile (saved in session/localStorage)
  private currentUserKey = 'sisten_current_user';

  constructor() {
    this.ready = this.init();
  }

  private async init(): Promise<void> {
    try {
      const allEntries = await idbEntries<string, any>();
      allEntries.forEach(([key, value]) => this.cache.set(String(key), value));
    } catch (err) {
      console.warn('Não foi possível carregar o cache do IndexedDB. Iniciando com armazenamento vazio.', err);
    }

    await this.migrateFromLocalStorageIfNeeded();
    this.initialize();
  }

  // Migração única de dados de versões anteriores do app, que guardavam tudo em
  // localStorage (síncrono, cota de poucos MB). Copia cada chave para o cache/IndexedDB
  // e limpa o localStorage para liberar a cota do navegador.
  private async migrateFromLocalStorageIfNeeded(): Promise<void> {
    if (this.cache.has(this.migratedFlagKey)) return;

    const legacyKeys = Object.keys(localStorage).filter(k => k !== 'theme');
    for (const key of legacyKeys) {
      const raw = localStorage.getItem(key);
      if (raw === null) continue;
      try {
        const parsed = JSON.parse(raw);
        this.cache.set(key, parsed);
        await idbSet(key, parsed);
      } catch {
        // Valor legado não era JSON válido; ignora.
      }
    }
    legacyKeys.forEach(k => localStorage.removeItem(k));

    this.cache.set(this.migratedFlagKey, true);
    await idbSet(this.migratedFlagKey, true);
  }

  // Permite que a UI seja avisada quando dados novos chegarem em segundo plano
  // (ex.: ao final da sincronização com o Supabase), sem precisar bloquear o render inicial.
  public subscribe(callback: () => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private notifyListeners(): void {
    this.listeners.forEach(cb => cb());
  }

  // Cada tabela é sincronizada de forma independente e em paralelo (Promise.allSettled):
  // uma falha isolada (ex.: uma view indisponível) não deve mais abortar a sincronização
  // das demais tabelas, e o tempo total passa a ser o da tabela mais lenta, não a soma de todas.
  public async syncFromSupabase(): Promise<void> {
    if (!supabase) {
      console.warn('Sincronização com o Supabase ignorada: cliente não inicializado.');
      return;
    }

    const currentUser = this.getCurrentUser();
    if (!currentUser) {
      console.log('Sincronização com o Supabase ignorada: nenhum usuário autenticado.');
      return;
    }

    if (this.syncPromise) {
      return this.syncPromise;
    }

    this.syncPromise = (async () => {
      try {
        console.log('Iniciando sincronização com o Supabase...');

        // Carimbos de versão (1 request leve). As bases pesadas abaixo só são
        // rebaixadas quando a versão muda; as tabelas pequenas/interativas
        // (requests, notifications, etc.) continuam sincronizando normalmente.
        const markers = await this.fetchRemoteMarkers();

        // Envelopa uma tarefa de sync pesada num gate de versão: se o cache local
        // já estiver na versão corrente, não baixa nada.
        const gated = (dataset: string, task: () => Promise<void>): (() => Promise<void>) => async () => {
          const storageKey = this.storageKeyFor(dataset);
          if (!this.needsSync(dataset, storageKey, markers)) {
            console.log(`sync: '${dataset}' já na versão corrente; usando cache local (0 egress).`);
            return;
          }
          await task();
          this.commitDatasetMeta(dataset, markers);
        };

        const tasks: Array<[string, () => Promise<void>]> = [
          ['sectors', () => this.syncSectors()],
          ['profiles', () => this.syncProfiles()],
          ['buyer_groups', () => this.syncBuyerGroups()],
          ['compradores', () => this.syncSimpleTable('compradores', this.compradoresKey, true)],
          // 'materials' saiu da sincronização geral: o catálogo tem ~172k linhas e é
          // consultado direto no Supabase por toda tela que precisa dele (busca,
          // autocomplete). Baixar o catálogo inteiro para o cache local a cada sessão
          // era o maior consumidor de egress do projeto.
          ['view_enriched_requisicoes', gated('requisicoes', () => this.syncSimpleTable('view_enriched_requisicoes', this.requisicoesKey, true, q => q.gte('data_da_solicitacao', '2026-01-01')))],
          ['view_enriched_pedidos', gated('pedidos', () => this.syncSimpleTable('view_enriched_pedidos', this.pedidosKey, true, q => q.gte('data_rc', '2026-01-01')))],
          ['requests', () => this.syncSimpleTable('requests', this.requestsKey)],
          ['request_items', () => this.syncSimpleTable('request_items', this.requestItemsKey)],
          ['request_comments', () => this.syncComments()],
          ['request_status_history', () => this.syncSimpleTable('request_status_history', this.historyKey)],
          ['notifications', () => this.syncSimpleTable('notifications', this.notificationsKey)],
          ['import_logs', () => this.syncSimpleTable('import_logs', this.importLogsKey)],
          ['obs_historico', () => this.syncObsHistory()],
          ['activity_logs', () => this.syncSimpleTable('activity_logs', this.logsKey)],
          ['sequences', () => this.syncSequences()],
          ['pedidosforn', gated('pedidosforn', () => this.syncSimpleTable('pedidosforn', this.pedidosFornKey, true, q => q.gte('data_rc', '2026-01-01')))],
          ['vw_historico_pedidos', gated('historico_pedidos', () => this.syncSimpleTable('vw_historico_pedidos', this.historicoPedidosKey, true, q => q.gte('data_doc', '2026-01-01')))],
          ['contatos', gated('contatos', () => this.syncSimpleTable('contatos', this.contatosKey, true))],
        ];

        const results = await Promise.allSettled(tasks.map(([, task]) => task()));
        results.forEach((result, idx) => {
          if (result.status === 'rejected') {
            console.error(`Falha ao sincronizar "${tasks[idx][0]}" com o Supabase:`, result.reason);
          }
        });

        console.log('Sincronização com o Supabase concluída.');
        this.notifyListeners();
      } finally {
        this.syncPromise = null;
      }
    })();

    return this.syncPromise;
  }

  private async syncSectors(): Promise<void> {
    const { data: sectors, error } = await supabase.from('sectors').select('*');
    if (error) throw error;
    if (sectors && sectors.length > 0) {
      this.setStorageItem(this.sectorsKey, sectors);
    } else {
      await supabase.from('sectors').upsert(INITIAL_SECTORS);
      this.setStorageItem(this.sectorsKey, INITIAL_SECTORS);
    }
  }

  private async syncProfiles(): Promise<void> {
    const { data: profiles, error } = await supabase.from('profiles').select('*');
    if (error) throw error;
    if (profiles && profiles.length > 0) {
      const mappedProfiles = profiles.map(p => ({ ...p, roles: p.roles || [] }));
      this.setStorageItem(this.profilesKey, mappedProfiles);
    }
  }

  private async syncBuyerGroups(): Promise<void> {
    const { data: buyerGroups, error } = await supabase.from('buyer_groups').select('*');
    if (error) throw error;
    if (buyerGroups && buyerGroups.length > 0) {
      this.setStorageItem(this.buyerGroupsKey, buyerGroups);
    }
  }

  private async syncMaterials(): Promise<void> {
    // O gate de versão (syncFromSupabase) já decide quando este download pesado
    // do catálogo (~180k linhas) deve ocorrer: apenas na primeira vez ou quando
    // a versão do dataset 'materials' muda após uma importação.
    const materials = await this.fetchAllFromTable<any>('materials');
    if (materials && materials.length > 0) {
      this.setStorageItem(this.materialsKey, materials);
    } else {
      const generated = generateMaterials();
      for (let i = 0; i < generated.length; i += 50) {
        await supabase.from('materials').upsert(generated.slice(i, i + 50));
      }
      this.setStorageItem(this.materialsKey, generated);
    }
  }

  private async syncSimpleTable(
    table: string, 
    storageKey: string, 
    alwaysSet: boolean = false, 
    filterFn?: (query: any) => any
  ): Promise<void> {
    const rows = await this.fetchAllFromTable<any>(table, '*', 1000, filterFn);
    if (alwaysSet || (rows && rows.length > 0)) {
      this.setStorageItem(storageKey, rows || []);
    }
  }

  private async syncComments(): Promise<void> {
    const dbComments = await this.fetchAllFromTable<any>('request_comments');
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
  }

  private async syncObsHistory(): Promise<void> {
    const dbObsHistory = await this.fetchAllFromTable<any>('obs_historico');
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
  }

  private async syncSequences(): Promise<void> {
    const dbSequences = await this.fetchAllFromTable<any>('sequences');
    if (dbSequences && dbSequences.length > 0) {
      const seqs: Record<string, number> = {};
      dbSequences.forEach(s => { seqs[s.key] = s.value; });
      this.setStorageItem(this.sequencesKey, seqs);
    }
  }

  public getStorageItem<T>(key: string, defaultValue: T): T {
    return this.cache.has(key) ? (this.cache.get(key) as T) : defaultValue;
  }

  // Grava no cache em memória de forma síncrona (o chamador enxerga o valor
  // imediatamente) e persiste no IndexedDB em segundo plano, sem bloquear a thread
  // principal e sem a cota de ~5-10MB do localStorage.
  public setStorageItem<T>(key: string, value: T): void {
    this.cache.set(key, value);
    idbSet(key, value).catch(err => {
      console.warn(`Não foi possível persistir "${key}" no IndexedDB.`, err);
    });
  }

  public getPageCache<T>(pageKey: string, defaultValue: T): T {
    return this.pageCache.has(pageKey) ? (this.pageCache.get(pageKey) as T) : defaultValue;
  }

  public setPageCache<T>(pageKey: string, value: T): void {
    this.pageCache.set(pageKey, value);
  }

  public clearAllPageCachesExcept(exceptPageKey: string): void {
    const keysToKeep = [exceptPageKey];
    for (const key of Array.from(this.pageCache.keys())) {
      if (!keysToKeep.includes(key)) {
        this.pageCache.delete(key);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Cache versionado por importação — "baixar uma vez, revalidar barato".
  //
  // Cada base pesada guarda localmente um carimbo (versão + datas). Antes de
  // rebaixar, o app compara a versão local com a versão remota (1 request leve
  // para toda a tabela dataset_versions). Se forem iguais e houver cache, não
  // baixa nada. Isso corta o egress recorrente de boot/navegação.
  // ---------------------------------------------------------------------------

  private datasetMetaKey(dataset: string): string {
    return `${this.datasetMetaPrefix}${dataset}`;
  }

  private getDatasetMeta(dataset: string): { version: number; updatedAt: string | null; fetchedAt: string } | null {
    return this.getStorageItem<{ version: number; updatedAt: string | null; fetchedAt: string } | null>(
      this.datasetMetaKey(dataset),
      null
    );
  }

  // Busca todos os carimbos remotos de uma vez (1 request, poucas linhas).
  // Retorna null quando a tabela ainda não existe (modo degradado seguro).
  private async fetchRemoteMarkers(): Promise<Map<string, { version: number; updatedAt: string | null }> | null> {
    if (!supabase) return null;
    try {
      const { data, error } = await supabase.from('dataset_versions').select('dataset, version, updated_at');
      if (error) throw error;
      const map = new Map<string, { version: number; updatedAt: string | null }>();
      (data || []).forEach((r: any) => map.set(r.dataset, { version: Number(r.version), updatedAt: r.updated_at ?? null }));
      return map;
    } catch (err) {
      console.warn('Tabela dataset_versions indisponível; sincronizando em modo degradado.', err);
      return null;
    }
  }

  // Decide se um dataset precisa ser rebaixado.
  // Sem carimbo remoto: baixa só se não houver cache local (baixa uma vez e mantém).
  // Com carimbo: baixa apenas quando a versão remota difere da local.
  private needsSync(
    dataset: string,
    storageKey: string,
    markers: Map<string, { version: number; updatedAt: string | null }> | null
  ): boolean {
    const hasCache = this.cache.has(storageKey);
    const meta = this.getDatasetMeta(dataset);
    // O carimbo local (meta) só é gravado após um download real bem-sucedido do
    // Supabase (commitDatasetMeta). Sua AUSÊNCIA significa que o "cache" atual é
    // apenas o dado semente (seed) pré-carregado no boot por initialize() — que
    // precisa ser substituído pelos dados reais, inclusive em modo degradado
    // (dataset_versions indisponível). Antes, a mera existência de cache (o seed)
    // satisfazia hasCache e o download real nunca acontecia: a tela ficava presa
    // nas ~99 linhas do mock em vez das milhares de linhas reais.
    if (!meta || !hasCache) return true;
    const marker = markers?.get(dataset);
    if (!marker) return false; // modo degradado, mas já temos um download real
    return marker.version !== meta.version;
  }

  // Persiste o carimbo local após um download bem-sucedido.
  private commitDatasetMeta(
    dataset: string,
    markers: Map<string, { version: number; updatedAt: string | null }> | null
  ): void {
    const marker = markers?.get(dataset);
    const now = new Date().toISOString();
    this.setStorageItem(this.datasetMetaKey(dataset), {
      version: marker?.version ?? 0,
      updatedAt: marker?.updatedAt ?? now,
      fetchedAt: now,
    });
  }

  // Data/hora em que a base foi atualizada pela última vez (última importação),
  // para exibição nas telas ("Dados atualizados em: ..."). Usa o carimbo remoto
  // quando disponível; caso contrário, a data do último download local.
  public getDatasetUpdatedAt(dataset: string): string | null {
    const meta = this.getDatasetMeta(dataset);
    if (!meta) return null;
    return meta.updatedAt || meta.fetchedAt || null;
  }

  // Incrementa a versão de um dataset no servidor (após uma importação) e alinha
  // o carimbo local, para que o próprio importador não rebaixe em seguida.
  public async bumpDatasetVersion(dataset: string, rowCount?: number): Promise<void> {
    if (!supabase) return;
    try {
      const user = this.getCurrentUser();
      await supabase.rpc('bump_dataset_version', {
        p_dataset: dataset,
        p_rows: rowCount ?? null,
        p_user: user?.name ?? null,
      });
      const markers = await this.fetchRemoteMarkers();
      this.commitDatasetMeta(dataset, markers);
    } catch (err) {
      console.warn(`Falha ao incrementar a versão do dataset '${dataset}'.`, err);
    }
  }

  // Check and run seeds
  private initialize() {
    // 1. Sectors
    if (!this.cache.has(this.sectorsKey)) {
      this.setStorageItem(this.sectorsKey, INITIAL_SECTORS);
    }

    // 2. Sequences
    if (!this.cache.has(this.sequencesKey)) {
      this.setStorageItem(this.sequencesKey, { '1': 1000, '2': 1000, '3': 1000, '4': 1000, '5': 1000 });
    }

    // 3. Profiles Seed
    if (!this.cache.has(this.profilesKey)) {
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
    if (!this.cache.has(this.buyerGroupsKey)) {
      const buyerGroups: UserBuyerGroup[] = [
        { id: 'bg1', user_id: 'u5', group_code: '314', is_primary: true },
        { id: 'bg2', user_id: 'u6', group_code: '358', is_primary: true },
        { id: 'bg3', user_id: 'u7', group_code: '447', is_primary: true },
        { id: 'bg4', user_id: 'u2', group_code: '575', is_primary: true }
      ];
      this.setStorageItem(this.buyerGroupsKey, buyerGroups);
    }

    // 5. Materials Catalog Seed (exactly 200)
    if (!this.cache.has(this.materialsKey)) {
      this.setStorageItem(this.materialsKey, generateMaterials());
    }

    // 6. SAP Data (ME5A and ZL0132) Seed
    if (!this.cache.has(this.requisicoesKey) || !this.cache.has(this.pedidosKey)) {
      const sapSeed = generateSAPSeedData();
      this.setStorageItem(this.requisicoesKey, sapSeed.requisicoes);
      this.setStorageItem(this.pedidosKey, sapSeed.pedidos);
    }

    // 7. Request Engine Seeds (13 requests including 2 pending for approval)
    if (!this.cache.has(this.requestsKey)) {
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
  public async login(email: string, pass: string): Promise<Profile | string> {
    if (!supabase) return 'Supabase não inicializado';
    
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.toLowerCase(),
        password: pass,
      });

      if (error) {
        if (error.message.includes('Invalid login credentials')) {
          return 'E-mail corporativo ou senha incorretos.';
        }
        return error.message;
      }

      if (!data.user) {
        return 'Falha ao recuperar informações do usuário.';
      }

      // Buscar perfil correspondente na tabela profiles
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', data.user.id)
        .maybeSingle();

      if (profileError) {
        console.error('Erro ao buscar perfil no Supabase:', profileError);
        return 'Erro ao recuperar perfil do usuário.';
      }

      let mappedProfile: Profile;

      if (!profile) {
        // Se o profile não foi criado pelo trigger, tentamos criar um perfil padrão ativo como visualizador
        const newProfile: Profile = {
          id: data.user.id,
          email: data.user.email || email.toLowerCase(),
          name: data.user.user_metadata?.name || 'Novo Usuário',
          cargo: data.user.user_metadata?.cargo || '',
          sector_id: data.user.user_metadata?.sector_id || '1',
          roles: ['visualizador'],
          status: 'ativo',
          created_at: new Date().toISOString()
        };

        const { error: insertError } = await supabase
          .from('profiles')
          .insert(newProfile);

        if (insertError) {
          console.error('Erro ao inserir perfil padrão:', insertError);
        }

        mappedProfile = newProfile;
      } else {
        mappedProfile = {
          ...profile,
          roles: profile.roles || []
        };
      }

      if (mappedProfile.status === 'pendente') {
        await supabase.auth.signOut();
        return 'Cadastro realizado. Aguarde a autorização do administrador.';
      }
      if (mappedProfile.status === 'inativo') {
        await supabase.auth.signOut();
        return 'Conta inativa. Procure o administrador.';
      }

      // Salvar no local storage / cache
      this.setStorageItem(this.currentUserKey, mappedProfile);
      this.logActivity(mappedProfile.id, 'Autenticação', 'Login', `Usuário ${mappedProfile.name} efetuou login com sucesso.`);
      
      // Salvar os perfis locais atualizados
      const profiles = this.getStorageItem<Profile[]>(this.profilesKey, []);
      const idx = profiles.findIndex(p => p.id === mappedProfile.id);
      if (idx !== -1) {
        profiles[idx] = mappedProfile;
      } else {
        profiles.push(mappedProfile);
      }
      this.setStorageItem(this.profilesKey, profiles);

      return mappedProfile;
    } catch (err: any) {
      console.error('Falha de comunicação com o Supabase no Login:', err);
      return 'Erro interno de comunicação com o banco de dados.';
    }
  }

  public async signup(name: string, email: string, sector_id: string, cargo: string, password?: string): Promise<string> {
    if (!supabase) return 'Supabase não inicializado';
    
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.toLowerCase(),
        password: password || 'ten123',
        options: {
          data: {
            name,
            cargo,
            sector_id
          }
        }
      });

      if (error) {
        return error.message;
      }

      if (!data.user) {
        return 'Falha ao criar cadastro.';
      }

      // Desconectar o usuário imediatamente para evitar login automático do Supabase
      await supabase.auth.signOut();

      this.logActivity('sistema', 'Autenticação', 'Solicitação de Cadastro', `Novo usuário ${name} (${email}) aguardando aprovação.`);
      return 'sucesso';
    } catch (err: any) {
      console.error('Falha ao registrar usuário no Supabase:', err);
      return 'Erro interno de comunicação com o banco de dados.';
    }
  }

  public async logout(): Promise<void> {
    const user = this.getCurrentUser();
    if (user) {
      this.logActivity(user.id, 'Autenticação', 'Logout', `Usuário ${user.name} efetuou logout.`);
    }
    this.cache.delete(this.currentUserKey);
    await idbDel(this.currentUserKey).catch(err => {
      console.warn('Não foi possível remover o usuário atual do IndexedDB.', err);
    });
    if (supabase) {
      await supabase.auth.signOut().catch(err => {
        console.error('Erro no signOut do Supabase:', err);
      });
    }
  }

  public async resetPasswordForEmail(email: string): Promise<string> {
    if (!supabase) return 'Supabase não inicializado';
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.toLowerCase(), {
        redirectTo: `${window.location.origin}/#/reset-password`
      });
      if (error) {
        return error.message;
      }
      return 'sucesso';
    } catch (err: any) {
      console.error('Erro ao solicitar recuperação de senha:', err);
      return 'Erro de comunicação com o servidor.';
    }
  }

  public getCurrentUser(): Profile | null {
    const user = this.getStorageItem<Profile | null>(this.currentUserKey, null);
    if (user && (user.status === 'pendente' || user.status === 'inativo')) {
      this.cache.delete(this.currentUserKey);
      idbDel(this.currentUserKey).catch(() => {});
      return null;
    }
    return user;
  }

  public setCurrentUser(user: Profile | null): void {
    if (user) {
      this.setStorageItem(this.currentUserKey, user);
    } else {
      this.cache.delete(this.currentUserKey);
      idbDel(this.currentUserKey).catch(err => {
        console.warn('Não foi possível remover o usuário atual do IndexedDB.', err);
      });
    }
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
        'solicitacoes.visualizar_proprias'
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
        'cadastro_sap.atender',
        'sap.fornecedores'
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
        'cadastro_sap.atender',
        'sap.fornecedores'
      ],
      atendente: [
        'materiais.visualizar', 
        'solicitacoes.criar', 
        'solicitacoes.visualizar_proprias',
        'chamados.atender_setor'
      ],
      pendente: []
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

  // Cadastro de compradores por grupo de compras SAP (grupo_compras, nome,
  // login SAP e e-mail do usuário SISTEN correspondente). Fonte primária para
  // rotear notificações de mensagens ao comprador responsável pelo grupo.
  public getCompradores(): CompradorInfo[] {
    return this.getStorageItem<CompradorInfo[]>(this.compradoresKey, []);
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
  private async fetchAllFromTable<T>(
    table: string, 
    selectCols: string = '*', 
    pageSize = 1000,
    filterFn?: (query: any) => any
  ): Promise<T[]> {
    const allRows: T[] = [];
    let from = 0;
    while (true) {
      let query = supabase.from(table).select(selectCols);
      if (filterFn) {
        query = filterFn(query);
      }
      const { data, error } = await query.range(from, from + pageSize - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      allRows.push(...(data as T[]));
      if (data.length < pageSize) break;
      from += pageSize;
    }
    return allRows;
  }

  public async importMaterials(materials: Omit<Material, 'id' | 'is_active' | 'created_at'>[]): Promise<{ read: number; inserted: number; updated: number; deactivated: number; syncFailed: number }> {
    // O Supabase é a única fonte de verdade aqui (o cache local não guarda mais
    // o catálogo inteiro). Para evitar rebaixar ~180k linhas x todas as colunas só
    // para deduplicar, buscamos APENAS a coluna material_code — leve — para
    // reconhecer códigos que já existem remotamente. O upsert com
    // onConflict:'material_code' resolve qualquer duplicata.
    const currentList: Material[] = [];
    const currentMap = new Map<string, Material>();

    const remoteCodeSet = new Set<string>();
    try {
      const remoteCodes = await this.fetchAllFromTable<{ material_code: string }>('materials', 'material_code');
      remoteCodes.forEach(r => { if (r.material_code) remoteCodeSet.add(r.material_code); });
    } catch (err) {
      console.warn('Não foi possível buscar a lista de códigos do catálogo no Supabase; usando apenas o cache local.', err);
    }

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
      } else if (remoteCodeSet.has(m.material_code)) {
        // Existe no Supabase mas não no cache local: gera um id novo; o
        // onConflict:'material_code' fará UPDATE da linha remota (sem duplicar).
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

    // Handle soft deletes for missing ones: busca do Supabase (não do cache local,
    // que não guarda mais o catálogo inteiro) apenas as linhas dos códigos que
    // existiam remotamente e não vieram nesta planilha.
    const codesToDeactivate = Array.from(remoteCodeSet).filter(code => !importedCodes.has(code));
    for (let i = 0; i < codesToDeactivate.length; i += 500) {
      const chunk = codesToDeactivate.slice(i, i + 500);
      try {
        const { data, error } = await supabase
          .from('materials')
          .select('id, material_code, description, technical_text, category, company, unit, created_at')
          .in('material_code', chunk)
          .eq('is_active', true);
        if (error) throw error;
        data?.forEach((existing: any) => {
          newList.push({ ...existing, is_active: false });
          deactivated++;
        });
      } catch (err) {
        console.warn('Falha ao buscar materiais a desativar no Supabase.', err);
      }
    }

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

    // Incrementa a versão do dataset para que os demais clientes rebaixem o
    // catálogo na próxima abertura (e alinha o carimbo local deste importador).
    await this.bumpDatasetVersion('materials', newList.length);

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
      // Persiste no Supabase — o sync de notificações substitui o cache local,
      // então sem isso o "lido" voltaria a "não lido" na próxima sincronização.
      const nid = notifications[idx].id;
      (async () => {
        try { if (supabase) await supabase.from('notifications').update({ is_read: true }).eq('id', nid); }
        catch (e) { console.warn('Falha ao marcar notificação como lida no Supabase:', e); }
      })();
    }
  }

  // ============================================================
  // Rastreio Compras — mensagens (conversas) e notificações
  // ============================================================

  // Marcador usado no campo request_id das notificações de mensagens, para o
  // Header distinguir e rotear para a página Rastreio Compras.
  private RASTREIO_NOTIF_PREFIX = 'rastreio:';

  // Busca leve das notificações do próprio usuário (RLS filtra por auth.uid()).
  // Chamada periodicamente pelo Header para que mensagens novas apareçam sem
  // depender de um sync completo de dados.
  public async refreshNotificationsFromSupabase(): Promise<void> {
    try {
      if (!supabase) return;
      const user = this.getCurrentUser();
      if (!user) return;
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(100);
      if (data) this.setStorageItem(this.notificationsKey, data as Notification[]);
    } catch (e) {
      console.warn('Falha ao atualizar notificações:', e);
    }
  }

  public async fetchRastreioMensagens(ri: string): Promise<RastreioMensagem[]> {
    if (!supabase) return [];
    const { data, error } = await supabase
      .from('rastreio_mensagens')
      .select('*')
      .eq('ri', ri)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data || []) as RastreioMensagem[];
  }

  // Insere notificações (uma por destinatário) diretamente no Supabase.
  // A política de INSERT permite gravar para qualquer user_id; cada destinatário
  // só lê as próprias (RLS de SELECT por auth.uid()).
  private async insertNotifications(
    userIds: string[], title: string, description: string,
    type: Notification['type'], reqId: string, reqNo?: string
  ): Promise<void> {
    if (!supabase || userIds.length === 0) return;
    const rows = userIds.map(uid => ({
      id: 'n_' + Math.random().toString(36).substr(2, 9),
      user_id: uid,
      title,
      description,
      type,
      is_read: false,
      request_id: reqId,
      request_number: reqNo ?? null,
      created_at: new Date().toISOString(),
    }));
    const { error } = await supabase.from('notifications').insert(rows);
    if (error) console.warn('Falha ao inserir notificações:', error);
  }

  // Resolve os destinatários da notificação de uma nova mensagem:
  //  - todos os outros participantes que já escreveram na thread; e
  //  - se o autor não é comprador e nenhum comprador participou ainda, o
  //    comprador responsável pelo grupo do item — resolvido via cadastro
  //    de compradores (compradores.grupo_compras -> email -> profile),
  //    com fallback para buyer_groups (associação por profile/admin) caso
  //    o cadastro de compradores não tenha e-mail para o grupo.
  private resolveRastreioRecipients(
    autorId: string, autorEhComprador: boolean,
    participantes: string[], grupoComprador?: string
  ): string[] {
    const set = new Set<string>();
    participantes.forEach(id => { if (id && id !== autorId) set.add(id); });

    const compradorNoThread = this.getProfiles().some(
      p => participantes.includes(p.id) && p.roles.includes('comprador')
    );
    if (!autorEhComprador && !compradorNoThread && grupoComprador) {
      const emailsPorGrupo = this.getCompradores()
        .filter(c => c.grupo_compras === grupoComprador && c.email)
        .map(c => (c.email as string).trim().toLowerCase());

      if (emailsPorGrupo.length > 0) {
        this.getProfiles()
          .filter(p => emailsPorGrupo.includes((p.email || '').trim().toLowerCase()))
          .forEach(p => { if (p.id !== autorId) set.add(p.id); });
      } else {
        // Fallback: associação manual comprador <-> grupo (tela Grupos Comprador).
        this.getBuyerGroups()
          .filter(bg => bg.group_code === grupoComprador)
          .forEach(bg => { if (bg.user_id && bg.user_id !== autorId) set.add(bg.user_id); });
      }
    }
    // Só usuários ativos.
    const ativos = new Set(this.getProfiles().filter(p => p.status === 'ativo').map(p => p.id));
    return Array.from(set).filter(id => ativos.has(id));
  }

  // Envia uma mensagem na thread do item e dispara as notificações.
  public async sendRastreioMensagem(
    ri: string, mensagem: string,
    ctx: { rm?: string; descricao?: string; grupoComprador?: string; participantesPrevios: string[] }
  ): Promise<RastreioMensagem> {
    if (!supabase) throw new Error('Sem conexão com o servidor.');
    const user = this.getCurrentUser();
    if (!user) throw new Error('Usuário não autenticado.');
    const autorEhComprador = user.roles.includes('comprador') || user.roles.includes('coordenador_suprimentos') || user.roles.includes('admin');
    const autorRole = user.roles[0] || '';

    const row: RastreioMensagem = {
      id: 'rm_' + Math.random().toString(36).substr(2, 9),
      ri,
      rm: ctx.rm,
      autor_id: user.id,
      autor_nome: user.name,
      autor_role: autorRole,
      mensagem: mensagem.trim(),
      created_at: new Date().toISOString(),
    };

    const { error } = await supabase.from('rastreio_mensagens').insert({
      id: row.id, ri: row.ri, rm: row.rm ?? null,
      autor_id: row.autor_id, autor_nome: row.autor_nome, autor_role: row.autor_role ?? null,
      mensagem: row.mensagem, created_at: row.created_at,
    });
    if (error) throw error;

    // Notifica destinatários (não bloqueia o retorno).
    const recipients = this.resolveRastreioRecipients(user.id, autorEhComprador, ctx.participantesPrevios, ctx.grupoComprador);
    const preview = row.mensagem.length > 90 ? row.mensagem.slice(0, 90) + '…' : row.mensagem;
    const title = `Nova mensagem — RM ${ctx.rm || row.rm || ri}`;
    const desc = `${user.name}: ${preview}`;
    this.insertNotifications(recipients, title, desc, 'info', `${this.RASTREIO_NOTIF_PREFIX}${ri}`, ctx.rm).catch(() => {});

    return row;
  }

  // Conjunto de `ri` com mensagens não lidas para o usuário (a partir das
  // notificações locais marcadas como rastreio: e não lidas).
  public getUnreadRastreioRis(userId: string): Set<string> {
    const prefix = this.RASTREIO_NOTIF_PREFIX;
    const ris = this.getStorageItem<Notification[]>(this.notificationsKey, [])
      .filter(n => n.user_id === userId && !n.is_read && (n.request_id || '').startsWith(prefix))
      .map(n => (n.request_id || '').slice(prefix.length));
    return new Set(ris);
  }

  // Marca como lidas (local + Supabase) todas as notificações de mensagens do
  // `ri` para o usuário — chamado ao abrir a conversa.
  public markRastreioThreadRead(ri: string, userId: string): void {
    const prefix = this.RASTREIO_NOTIF_PREFIX;
    const target = `${prefix}${ri}`;
    const notifs = this.getStorageItem<Notification[]>(this.notificationsKey, []);
    const affected: string[] = [];
    let changed = false;
    notifs.forEach(n => {
      if (n.user_id === userId && !n.is_read && n.request_id === target) {
        n.is_read = true; changed = true; affected.push(n.id);
      }
    });
    if (changed) this.setStorageItem(this.notificationsKey, notifs);
    if (affected.length > 0) {
      (async () => {
        try { if (supabase) await supabase.from('notifications').update({ is_read: true }).in('id', affected); }
        catch (e) { console.warn('Falha ao marcar thread como lida no Supabase:', e); }
      })();
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
  private normalizeRequisicaoRow(r: any): SAPRequisicao {
    return {
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
      pedido: r.pedido || '',
      item_status: r.item_status || 'Aguardando Cotação',
      item_status_updated_at: r.item_status_updated_at || '',
      item_status_updated_by: r.item_status_updated_by || ''
    };
  }

  public getRequisicoes(): SAPRequisicao[] {
    const raw = this.getStorageItem<any[]>(this.requisicoesKey, []);
    return raw.map(r => this.normalizeRequisicaoRow(r));
  }

  private normalizePedidoRow(p: any): SAPPedido {
    return {
      ...p,
      documento_compra: p.documento_compra || p.doc_compra || '',
      item_pedido: p.item_pedido || p.item || '',
      fornecedor_code: p.fornecedor_code || p.fornecedor_codigo || '',
      fornecedor_name: p.fornecedor_name || p.fornecedor_nome || '',
      data_pedido: p.data_pedido || p.data_doc || '',
      data_entrega_sap: p.data_entrega_sap || p.dt_remessa || '',
      valor_brl: p.valor_brl !== undefined ? Number(p.valor_brl) : (p.valor_em_brl !== undefined ? Number(p.valor_em_brl) : Number(p.valor_liquido || 0)),
      preco_liquido: p.preco_liquido !== undefined ? Number(p.preco_liquido) : (p.preco_liquido_unit !== undefined ? Number(p.preco_liquido_unit) : Number(p.valor_liquido || 0)),
    };
  }

  private normalizePedidoFornRow(p: any): PedidoForn {
    const fornecedor_codigo = p.fornecedor_codigo || p.cod_forn || '';
    const cnpj_fornecedor = p.cnpj_fornecedor || p.cnpj || '';
    const fornecedor_name = p.fornecedor_name || p.fornecedor || '';
    const preco_liquido = p.preco_liquido !== undefined && p.preco_liquido !== null
      ? Number(p.preco_liquido)
      : (p.valor_liquido !== undefined && p.valor_liquido !== null
         ? Number(p.valor_liquido)
         : Number(p.preco_liquido_unit || 0));
    const data_pedido = p.data_pedido || p.data_doc || '';

    return {
      ...p,
      ri: p.ri || '',
      documento_compra: p.documento_compra || p.doc_compra || '',
      item_pedido: p.item_pedido || p.item || '',
      fornecedor_code: fornecedor_codigo,
      fornecedor_name: fornecedor_name,
      data_pedido: data_pedido,
      data_entrega_sap: p.data_entrega_sap || p.dt_remessa || '',
      valor_brl: p.valor_brl !== undefined ? Number(p.valor_brl) : (p.valor_em_brl !== undefined ? Number(p.valor_em_brl) : preco_liquido),
      preco_liquido: preco_liquido,
      
      // Campos antigos para retrocompatibilidade
      cod_forn: fornecedor_codigo,
      cnpj: cnpj_fornecedor,
      fornecedor: fornecedor_name
    };
  }

  public getPedidos(): SAPPedido[] {
    const raw = this.getStorageItem<any[]>(this.pedidosKey, []);
    return raw.map(p => this.normalizePedidoRow(p));
  }

  public getPedidosForn(): PedidoForn[] {
    const raw = this.getStorageItem<any[]>(this.pedidosFornKey, []);
    return raw.map(p => this.normalizePedidoFornRow(p));
  }

  // Linhas já agregadas pela view vw_historico_pedidos (fornecedor + pedido, CRF = 'x').
  public getHistoricoPedidos(): HistoricoPedidoView[] {
    return this.getStorageItem<HistoricoPedidoView[]>(this.historicoPedidosKey, []);
  }

  // Retorna o histórico usando cache versionado: só rebaixa a view do Supabase
  // quando a versão do dataset mudou (nova importação) ou quando forçado pelo
  // botão "Atualizar". Caso contrário devolve o cache local (0 egress).
  public async fetchHistoricoPedidos(force = false): Promise<HistoricoPedidoView[]> {
    if (!supabase) return this.getHistoricoPedidos();
    try {
      const markers = await this.fetchRemoteMarkers();
      if (!force && !this.needsSync('historico_pedidos', this.historicoPedidosKey, markers)) {
        return this.getHistoricoPedidos();
      }
      const rows = await this.fetchAllFromTable<HistoricoPedidoView>('vw_historico_pedidos', '*', 1000, q => q.gte('data_doc', '2026-01-01'));
      this.setStorageItem(this.historicoPedidosKey, rows);
      this.commitDatasetMeta('historico_pedidos', markers);
      return rows;
    } catch (err) {
      console.warn('Falha ao sincronizar histórico; usando cache local.', err);
      return this.getHistoricoPedidos();
    }
  }

  // Linhas da view enxuta vw_historico_fornecedores_sem_po (só materiais com
  // requisição "Sem PO" em aberto). Ver comentário de historicoSemPOKey.
  public getHistoricoFornecedoresSemPO(): HistoricoPedidoView[] {
    return this.getStorageItem<HistoricoPedidoView[]>(this.historicoSemPOKey, []);
  }

  // Como a view já filtra pelos materiais em aberto (conjunto pequeno), não é
  // preciso cortar por data: baixa o histórico completo desses materiais,
  // incluindo compras antigas — que é justamente o que a tela de compras
  // precisa para sugerir fornecedores quando ainda não há PO.
  public async fetchHistoricoFornecedoresSemPO(force = false): Promise<HistoricoPedidoView[]> {
    if (!supabase) return this.getHistoricoFornecedoresSemPO();
    try {
      const markers = await this.fetchRemoteMarkers();
      // Meta própria ('historico_sem_po'), independente da meta de
      // 'historico_pedidos' — são caches locais distintos e não podem
      // compartilhar o mesmo carimbo de "última sincronização", senão um
      // rebaixa e "adianta o relógio" do outro sem realmente atualizá-lo.
      // A versão comparada, porém, é a de 'historico_pedidos' (mesma origem
      // de dados, bumped nas importações de ZL0132/pedidosforn).
      const metaDataset = 'historico_sem_po';
      const hasCache = this.cache.has(this.historicoSemPOKey);
      const meta = this.getDatasetMeta(metaDataset);
      const marker = markers?.get('historico_pedidos');
      const upToDate = !!meta && hasCache && (!marker || meta.version === marker.version);
      if (!force && upToDate) {
        return this.getHistoricoFornecedoresSemPO();
      }
      const rows = await this.fetchAllFromTable<HistoricoPedidoView>('vw_historico_fornecedores_sem_po');
      this.setStorageItem(this.historicoSemPOKey, rows);
      const now = new Date().toISOString();
      this.setStorageItem(this.datasetMetaKey(metaDataset), {
        version: marker?.version ?? 0,
        updatedAt: marker?.updatedAt ?? now,
        fetchedAt: now,
      });
      return rows;
    } catch (err) {
      console.warn('Falha ao sincronizar histórico de fornecedores (Sem PO); usando cache local.', err);
      return this.getHistoricoFornecedoresSemPO();
    }
  }

  public getContatosForn(): ContatoFornecedor[] {
    return this.getStorageItem<ContatoFornecedor[]>(this.contatosKey, []);
  }

  // Chamado após cadastrar/editar um contato: rebaixa apenas a tabela de
  // contatos (leve) e incrementa a versão do dataset, em vez de disparar o
  // sync completo de todas as tabelas. Alinha o carimbo local e avisa os demais
  // clientes (que rebaixarão contatos na próxima abertura).
  public async syncContatos(): Promise<void> {
    if (!supabase) return;
    try {
      await this.syncSimpleTable('contatos', this.contatosKey, true);
      await this.bumpDatasetVersion('contatos', this.getContatosForn().length);
      this.notifyListeners();
    } catch (err) {
      console.warn('Falha ao sincronizar contatos após escrita.', err);
    }
  }

  public getEnrichedSAPRequisicoes(): EnrichedSAPRecord[] {
    // status_processamento 'B' só indica "bloqueada aguardando liberação" quando a
    // requisição ainda NÃO tem PO (status_requisicao 'Sem PO'). Em requisições já
    // processadas (com PO) o mesmo código 'B' aparece por outro motivo (praticamente
    // todas as "Processado" trazem 'B'), então o filtro não pode ser global — senão
    // some com os itens já processados da tela inteira (Todos/Sem MIGO).
    const reqs = this.getRequisicoes().filter(r => {
      if (r.codigo_de_eliminacao) return false;
      const raw = r as any;
      if (raw.status_requisicao === 'Sem PO' && raw.status_processamento === 'B') return false;
      return true;
    });
    const peds = this.getPedidos();
    const pedsMap = new Map(peds.map(p => [p.ri, p]));

    const currentDate = new Date('2026-07-05T06:31:00-07:00'); // current mock time from metadata

    return reqs.map(r => {
      // view_enriched_requisicoes já calcula tudo isso no servidor (join completo
      // e sem corte de data contra pedidos/pedidosforn). Usar esses valores direto
      // evita recalcular localmente contra o cache de "pedidos", que pode ter mais
      // de um PO por RI (o Map abaixo indexado só por ri perde essa informação) e
      // é sincronizado com corte de data — causando "Sem PO"/"Sem MIGO" errados.
      // Só recalcula localmente quando os campos não vêm prontos (modo semente/offline).
      const raw = r as any;
      if (raw.status_requisicao === 'Sem PO' || raw.status_requisicao === 'Processado') {
        return {
          ...r,
          item_pedido: raw.item_pedido,
          fornecedor_code: raw.fornecedor_code,
          fornecedor_name: raw.fornecedor_name,
          data_pedido: raw.data_pedido,
          data_entrega_sap: raw.data_entrega_sap,
          documento_compra: raw.documento_compra,
          criado_por_pedido: raw.criado_por_pedido,
          data_migo: raw.data_migo,
          natureza: raw.natureza,
          status_requisicao: raw.status_requisicao,
          lead_time_compras_meta: raw.lead_time_compras_meta,
          dias_em_aberto: raw.dias_em_aberto,
          atraso_comprador: raw.atraso_comprador,
          faixa_atraso: raw.faixa_atraso,
          alerta: raw.alerta,
          status_atualizado: raw.status_atualizado
        } as EnrichedSAPRecord;
      }

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
      const pedidoVal = (p.documento_compra || '').trim();
      const hasPO = !!pedidoVal && pedidoVal !== '—' && pedidoVal !== '0' && pedidoVal !== 'undefined' && pedidoVal !== 'null';
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

      // data_referencia_prazo: uma vez emitida a PO, a responsabilidade não é mais do
      // comprador, então a contagem de dias/atraso congela na data da PO (ou na data de
      // entrega, se já entregue) em vez de continuar avançando com o dia atual.
      const data_referencia_prazo = hasPO && isDelivered && data_migo
        ? new Date(data_migo)
        : hasPO && p.data_pedido
        ? new Date(p.data_pedido)
        : currentDate;

      // Calculate days in open (congela na data_referencia_prazo quando já há PO)
      const solDate = new Date(r.data_solicitacao);
      const diffTimeSol = data_referencia_prazo.getTime() - solDate.getTime();
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
        item_pedido: p.item_pedido,
        fornecedor_code: p.fornecedor_code,
        fornecedor_name: p.fornecedor_name,
        data_pedido: p.data_pedido,
        data_entrega_sap: p.data_entrega_sap,
        documento_compra: p.documento_compra || r.pedido || null,
        criado_por_pedido: (p as any).criado_por_pedido,
        data_migo,
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

  public isValidStatusTransition(from: ItemStatus | undefined | null | '', to: ItemStatus): boolean {
    if (!from) return true; // Inicialmente vazio aceita qualquer primeiro status
    
    const f = String(from).trim().toLowerCase();
    const t = String(to).trim().toLowerCase();
    
    if (t === 'inativo' || f === 'inativo') return true;
    if (t === 'aguardando solicitante' || f === 'aguardando solicitante') return true;

    const transitions: Record<string, string[]> = {
      'aguardando cotação': ['cotação enviada'],
      'cotação enviada': ['análise de cotações', 'aguardando cotação'],
      'análise de cotações': ['aguardando aprovação po', 'cotação enviada'],
      'aguardando aprovação po': ['pedido enviado', 'análise de cotações'],
      'pedido enviado': ['aguardando coleta', 'aguardando aprovação po'],
      'aguardando coleta': ['em rota de entrega', 'pedido enviado'],
      'em rota de entrega': ['entregue', 'aguardando coleta'],
      'entregue': ['inativo'],
      'inativo': [],
      'aguardando solicitante': []
    };

    return transitions[f]?.includes(t) || false;
  }

  public updateBuyerFields(ri: string, obs: string, deliveryDate: string, itemStatus?: ItemStatus | ''): boolean {
    const reqs = this.getRequisicoes();
    const idx = reqs.findIndex(r => r.ri === ri);
    if (idx !== -1) {
      const user = this.getCurrentUser();
      const userName = user?.name || 'Sistema';

      const prevObs = reqs[idx].obs_comprador || '';
      const prevDate = reqs[idx].data_entrega_prevista || '';
      const prevStatus = reqs[idx].item_status || null;

      reqs[idx].obs_comprador = obs;
      reqs[idx].data_entrega_prevista = deliveryDate;
      reqs[idx].obs_updated_at = new Date().toISOString();
      reqs[idx].obs_updated_by = userName;

      let statusChanged = false;
      if (itemStatus !== undefined && itemStatus !== prevStatus) {
        reqs[idx].item_status = itemStatus || undefined;
        reqs[idx].item_status_updated_at = new Date().toISOString();
        reqs[idx].item_status_updated_by = userName;
        statusChanged = true;
      }

      this.setStorageItem(this.requisicoesKey, reqs);

      // Save to history local
      const hist = this.getStorageItem<SAPObsHistory[]>(this.obsHistoryKey, []);
      const ohId = 'oh_' + Math.random().toString(36).substr(2, 9);
      hist.push({
        id: ohId,
        ri,
        obs_comprador: obs,
        data_entrega_prevista: deliveryDate,
        item_status: reqs[idx].item_status,
        user_name: userName,
        created_at: new Date().toISOString()
      });
      this.setStorageItem(this.obsHistoryKey, hist);

      // Async write to Supabase
      (async () => {
        try {
          const updatePayload: any = {
            obs_comprador: obs,
            data_entrega_prevista: deliveryDate || null,
            obs_updated_at: new Date().toISOString(),
            obs_updated_by: userName
          };

          if (statusChanged) {
            updatePayload.item_status = reqs[idx].item_status || null;
            updatePayload.item_status_updated_at = new Date().toISOString();
            updatePayload.item_status_updated_by = userName;
          }

          await supabase.from('requisicoes').update(updatePayload).eq('ri', ri);

          // Registra histórico detalhado
          await supabase.from('obs_historico').insert({
            id: ohId,
            ri,
            campo_alterado: statusChanged ? 'item_status' : 'obs_comprador_e_data_entrega',
            valor_anterior: JSON.stringify({ obs: prevObs, date: prevDate, status: prevStatus }),
            valor_novo: JSON.stringify({ obs, date: deliveryDate, status: reqs[idx].item_status || null }),
            user_name: userName,
            created_at: new Date().toISOString()
          });

          // Rebaixa só a linha alterada (não a view inteira, ~657kB) e mescla no
          // cache local pelo 'ri' — uma edição pontual não justifica reler toda a
          // base de requisições em aberto.
          const { data: updatedRow } = await supabase
            .from('view_enriched_requisicoes')
            .select('*')
            .eq('ri', ri)
            .maybeSingle();
          if (updatedRow) {
            const mapped = {
              ...updatedRow,
              tipo_documento: updatedRow.tipo_de_documento,
              requisitante_name: updatedRow.requisitante,
              qtd_requisicao: updatedRow.qtd_solicitada,
              unidade_medida: updatedRow.unidade_de_medida,
              grupo_comprador: updatedRow.grupo_de_compradores,
              data_solicitacao: updatedRow.data_da_solicitacao,
              data_remessa: updatedRow.remessas_de_ate,
              material_code: updatedRow.material,
              item_status: updatedRow.item_status || 'Aguardando Cotação',
              item_status_updated_at: updatedRow.item_status_updated_at || '',
              item_status_updated_by: updatedRow.item_status_updated_by || ''
            };
            const latestReqs = this.getRequisicoes();
            const latestIdx = latestReqs.findIndex(r => r.ri === ri);
            if (latestIdx !== -1) {
              latestReqs[latestIdx] = mapped as any;
            } else {
              latestReqs.push(mapped as any);
            }
            this.setStorageItem(this.requisicoesKey, latestReqs);
          }
        } catch (e) {
          console.error("Erro ao sincronizar updateBuyerFields no Supabase:", e);
        }
      })();

      return true;
    }
    return false;
  }

  // Busca leve (poucas colunas) dos campos editáveis pelo comprador
  // (status, previsão de entrega, observação) direto do Supabase, e mescla
  // no cache local por 'ri'. Diferente do sync completo (gated por
  // dataset_versions, só disparado em reimportações), este método roda a
  // cada carregamento da tela "Itens sem PO" para que edições feitas por
  // outros usuários apareçam sem depender de um novo import de dados SAP.
  public async refreshBuyerFieldsFromSupabase(): Promise<boolean> {
    try {
      const rows = await this.fetchAllFromTable<{
        ri: string;
        item_status: ItemStatus | null;
        item_status_updated_at: string | null;
        item_status_updated_by: string | null;
        obs_comprador: string | null;
        data_entrega_prevista: string | null;
        obs_updated_at: string | null;
        obs_updated_by: string | null;
      }>(
        'requisicoes',
        'ri,item_status,item_status_updated_at,item_status_updated_by,obs_comprador,data_entrega_prevista,obs_updated_at,obs_updated_by',
        1000,
        q => q.gte('data_da_solicitacao', '2026-01-01')
      );

      const updatesByRi = new Map(rows.map(r => [r.ri, r]));
      const localReqs = this.getStorageItem<any[]>(this.requisicoesKey, []);
      const merged = localReqs.map(r => {
        const upd = updatesByRi.get(r.ri);
        if (!upd) return r;
        return {
          ...r,
          item_status: upd.item_status || r.item_status,
          item_status_updated_at: upd.item_status_updated_at || r.item_status_updated_at,
          item_status_updated_by: upd.item_status_updated_by || r.item_status_updated_by,
          obs_comprador: upd.obs_comprador ?? r.obs_comprador,
          data_entrega_prevista: upd.data_entrega_prevista ?? r.data_entrega_prevista,
          obs_updated_at: upd.obs_updated_at || r.obs_updated_at,
          obs_updated_by: upd.obs_updated_by || r.obs_updated_by
        };
      });

      this.setStorageItem(this.requisicoesKey, merged);
      return true;
    } catch (e) {
      console.error("Erro ao atualizar status/obs/data de entrega a partir do Supabase:", e);
      return false;
    }
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
    { header: 'Tipo de transporte', field: 'tipo_de_transporte' },
    { header: 'Requisição Externa', field: 'requisicao_externa' }
  ];

  private PEDIDOSFORN_COLUMNS = [
    { header: 'Material', field: 'material' },
    { header: 'TxtBreve', field: 'txt_breve' },
    { header: 'Cod Forn', field: 'cod_forn' },
    { header: 'CNPJ', field: 'cnpj' },
    { header: 'Fornecedor', field: 'fornecedor' },
    { header: 'Rg', field: 'regiao_uf' },
    { header: 'Data', field: 'data_pedido' },
    { header: 'Preço Líquido', field: 'preco_liquido' }
  ];

  private CONTATOS_COLUMNS = [
    { header: 'N° VENDOR', field: 'cod_vendor' },
    { header: 'FORNECEDORES', field: 'fornecedor' },
    { header: 'NOME FANTASIA', field: 'nome_fantasia' },
    { header: 'TELEFONE', field: 'telefone' },
    { header: 'E-MAIL', field: 'email' },
    { header: 'CLASSIFICAÇÃO', field: 'classificacao' }
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
  public async importME5ARaw(rawRows: any[][], filename: string, onProgress?: (percent: number) => void): Promise<SAPImportLog> {
    if (rawRows.length < 2) {
      throw new Error('Formato rejeitado: Linhas insuficientes no arquivo.');
    }
    onProgress?.(0);

    const headers = rawRows[0].map(h => String(h || '').trim());
    const dataRows = rawRows.slice(1).filter(r => r.some(c => c !== ''));

    const { mappedFields, missingColumns, newColumns } = this.reconcileSchema(headers, this.ME5A_COLUMNS);

    const reqColIdx = mappedFields.findIndex(f => f === 'requisicao_de_compra');
    const itemColIdx = mappedFields.findIndex(f => f === 'item_reqc');

    if (reqColIdx === -1 || itemColIdx === -1) {
      throw new Error('Formato rejeitado: Colunas obrigatórias do SAP (Requisição de compra e Item ReqC) não encontradas.');
    }

    // Busca as requisições atuais diretamente do Supabase (fonte de verdade),
    // pois o cache local pode estar incompleto ou desatualizado (ex.: import
    // feito por outro usuário/dispositivo, ou cache limpo no navegador). Sem
    // isso, requisições já existentes pareceriam "novas" para esta reimportação:
    // o campo obs_comprador do comprador seria apagado e, caso a chave `ri`
    // não seja de fato única no banco, a linha seria duplicada em vez de
    // atualizada.
    let current = this.getRequisicoes();
    try {
      const remoteReqs = await this.fetchAllFromTable<any>('requisicoes', '*', 1000, q => q.gte('data_da_solicitacao', '2026-01-01'));
      if (remoteReqs.length > 0) current = remoteReqs.map(r => this.normalizeRequisicaoRow(r));
    } catch (err) {
      console.warn('Não foi possível buscar as requisições atuais do Supabase antes da importação; usando cache local.', err);
    }
    onProgress?.(10);
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

      const totalBatches = Math.ceil(dbRows.length / 50) || 1;
      for (let i = 0; i < dbRows.length; i += 50) {
        const { error } = await supabase.from('requisicoes').upsert(dbRows.slice(i, i + 50), { onConflict: 'ri' });
        if (error) throw error;
        const batchIndex = Math.floor(i / 50) + 1;
        onProgress?.(10 + Math.round((batchIndex / totalBatches) * 75));
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
      onProgress?.(90);

      const updatedReqs = await this.fetchAllFromTable<any>('view_enriched_requisicoes', '*', 1000, q => q.gte('data_da_solicitacao', '2026-01-01'));
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

      await this.bumpDatasetVersion('requisicoes', this.getRequisicoes().length);

      this.logActivity(user?.id || 'sistema', 'Suprimentos', 'Importar ME5A', `Importou ME5A (${filename}). Lidos: ${dataRows.length}, novos: ${inserted}.`);
      onProgress?.(100);
      return logObj as any;
    } catch (e) {
      console.error('Erro ao salvar importação ME5A no Supabase:', e);
      throw e;
    }
  }

  public async importZL0132Raw(rawRows: any[][], filename: string, onProgress?: (percent: number) => void): Promise<SAPImportLog> {
    if (rawRows.length < 2) {
      throw new Error('Formato rejeitado: Linhas insuficientes no arquivo.');
    }
    onProgress?.(0);

    const headers = rawRows[0].map(h => String(h || '').trim());
    const dataRows = rawRows.slice(1).filter(r => r.some(c => c !== ''));

    const { mappedFields, missingColumns, newColumns } = this.reconcileSchema(headers, this.ZL0132_COLUMNS);

    const reqColIdx = mappedFields.findIndex(f => f === 'reqc');
    const itemColIdx = mappedFields.findIndex(f => f === 'item');
    const itmLiberacaoColIdx = mappedFields.findIndex(f => f === 'itm_liberacao');
    const itemRcCotIdx = mappedFields.findIndex(f => f === 'item_rc_cotacao');
    // o cabecalho no Excel pode ser 'E' (abreviado) ou 'Eflag_e' (nome completo)
    const eflagColByField = mappedFields.findIndex(f => f === 'eflag_e');
    const eflagColByHeader = headers.findIndex(h => h.trim().toUpperCase() === 'E' || h.trim().toUpperCase() === 'EFLAG_E');
    const eflagColIdx = eflagColByField !== -1 ? eflagColByField : eflagColByHeader;

    if (reqColIdx === -1 || (itemColIdx === -1 && itmLiberacaoColIdx === -1 && itemRcCotIdx === -1)) {
      throw new Error('Formato rejeitado: Colunas obrigatórias do Pedido SAP (ReqC e Item/Itm ou Item RC Cot) não encontradas.');
    }

    // Busca os pedidos atuais diretamente do Supabase (fonte de verdade),
    // pelo mesmo motivo do importME5ARaw: o cache local pode estar
    // incompleto/desatualizado e faria pedidos já existentes parecerem
    // "novos", duplicando linhas em vez de atualizá-las.
    let current = this.getPedidos();
    try {
      const remotePeds = await this.fetchAllFromTable<any>('pedidosforn', '*', 1000, q => q.gte('data_rc', '2026-01-01'));
      if (remotePeds.length > 0) current = remotePeds.map(p => this.normalizePedidoRow(p));
    } catch (err) {
      console.warn('Não foi possível buscar os pedidos atuais (pedidosforn) do Supabase antes da importação; usando cache local.', err);
    }
    onProgress?.(10);
    const currentMap = new Map(current.map(p => [p.ri + '_' + (p.documento_compra || ''), p]));
    const user = this.getCurrentUser();

    let inserted = 0;
    let updated = 0;
    const quantityChanges: any[] = [];
    const ignoredRows: any[] = [];

    const newPedidosMap = new Map<string, SAPPedido>();

    dataRows.forEach((row, index) => {
      const fileRowIndex = index + 2;
      const reqNo = String(row[reqColIdx] || '').trim();
      const useItemRcCot = itemRcCotIdx !== -1 && row[itemRcCotIdx] !== undefined && row[itemRcCotIdx] !== '';
      const useItmLiberacao = itmLiberacaoColIdx !== -1 && row[itmLiberacaoColIdx] !== undefined && row[itmLiberacaoColIdx] !== '';
      const targetItemIdx = useItemRcCot ? itemRcCotIdx : (useItmLiberacao ? itmLiberacaoColIdx : itemColIdx);
      const itemNo = String(row[targetItemIdx] || '').trim().padStart(5, '0');
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

      const docCompraVal = record.doc_compra || '';
      const compositeKey = ri + '_' + docCompraVal;
      const existing = currentMap.get(compositeKey);

      if (newPedidosMap.has(compositeKey)) {
        const existingInBatch = newPedidosMap.get(compositeKey)!;
        const currentDataDoc = record.data_doc ? new Date(record.data_doc).getTime() : 0;
        const existingDataDoc = existingInBatch.data_pedido ? new Date(existingInBatch.data_pedido).getTime() : 0;
        
        ignoredRows.push({
          row: fileRowIndex,
          identifier: ri + ' (PO: ' + docCompraVal + ')',
          reason: `Registro com chave RI e PO duplicada no arquivo. Mantido apenas o documento com data mais recente.`
        });

        if (currentDataDoc > existingDataDoc) {
          newPedidosMap.set(compositeKey, {
            ri,
            documento_compra: docCompraVal,
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
          documento_compra: docCompraVal,
          item_pedido: record.item || '00010',
          fornecedor_code: record.fornecedor_codigo || '300001',
          fornecedor_name: record.fornecedor_nome || 'Fornecedor SAP',
          data_pedido: record.data_doc || '',
          data_entrega_sap: record.dt_remessa || '',
          campos_extras: { ...campos_extras, ...record }
        };

        if (existing) {
          const oldQty = existing.campos_extras?.qtd_pedido || (existing as any).qtd_pedido;
          const newQty = record.qtd_pedido;
          if (oldQty !== undefined && oldQty !== null && oldQty !== newQty) {
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

        newPedidosMap.set(compositeKey, poObj);
      }
    });

    const newPedidosArray = Array.from(newPedidosMap.values());
    const mergedPedidosMap = new Map(current.map(p => [p.ri + '_' + (p.documento_compra || ''), p]));
    newPedidosArray.forEach(p => {
      mergedPedidosMap.set(p.ri + '_' + p.documento_compra, p);
    });
    const finalPedidosArray = Array.from(mergedPedidosMap.values());
    this.setStorageItem(this.pedidosKey, finalPedidosArray);

    const generateUUID = () => {
      if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
      }
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });
    };

    try {
      const dbRows = finalPedidosArray.map(p => {
        const extr = p.campos_extras || {};
        const compositeKey = p.ri + '_' + p.documento_compra;
        const existing = currentMap.get(compositeKey);

        const mergedExtras = existing && existing.campos_extras 
          ? { ...existing.campos_extras, ...extr }
          : extr;

        return {
          id: (existing as any)?.id || generateUUID(),
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
          // Todo campo mapeado já vira sua própria coluna acima; gravar o blob
          // inteiro de novo em campos_extras só duplicava a linha (chegou a ~96MB
          // de redundância pura na tabela). Mantido vazio.
          campos_extras: {},
          updated_at: new Date().toISOString()
        };
      });

      const totalBatches = Math.ceil(dbRows.length / 50) || 1;
      for (let i = 0; i < dbRows.length; i += 50) {
        const { error } = await supabase.from('pedidosforn').upsert(dbRows.slice(i, i + 50), { onConflict: 'ri,doc_compra' });
        if (error) throw error;
        const batchIndex = Math.floor(i / 50) + 1;
        onProgress?.(10 + Math.round((batchIndex / totalBatches) * 75));
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
      onProgress?.(90);

      // Sincroniza a tabela local de pedidosforn e vw_historico_pedidos — com o
      // mesmo corte de data usado na sincronização periódica (sem ele, cada
      // importação rebaixava as tabelas inteiras: ~66 mil e ~61 mil linhas).
      await this.syncSimpleTable('pedidosforn', this.pedidosFornKey, true, q => q.gte('data_rc', '2026-01-01'));
      try {
        await supabase.rpc('refresh_historico_pedidos');
      } catch (err) {
        console.warn('Falha ao recalcular a materialized view do histórico (refresh_historico_pedidos).', err);
      }
      await this.syncSimpleTable('vw_historico_pedidos', this.historicoPedidosKey, true, q => q.gte('data_doc', '2026-01-01'));

      const updatedReqs = await this.fetchAllFromTable<any>('view_enriched_requisicoes', '*', 1000, q => q.gte('data_da_solicitacao', '2026-01-01'));
      const updatedPeds = await this.fetchAllFromTable<any>('view_enriched_pedidos', '*', 1000, q => q.gte('data_rc', '2026-01-01'));

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

      await this.bumpDatasetVersion('requisicoes', this.getRequisicoes().length);
      await this.bumpDatasetVersion('pedidos', this.getPedidos().length);
      await this.bumpDatasetVersion('pedidosforn', this.getStorageItem<any[]>(this.pedidosFornKey, []).length);
      await this.bumpDatasetVersion('historico_pedidos', this.getHistoricoPedidos().length);

      this.logActivity(user?.id || 'sistema', 'Suprimentos', 'Importar ZL0132', `Importou ZL0132 (${filename}). Lidos: ${dataRows.length}.`);
      onProgress?.(100);
      return logObj as any;
    } catch (e) {
      console.error('Erro ao salvar importação ZL0132 no Supabase:', e);
      throw e;
    }
  }

  public async importPedidosForn(
    rawRows: any[][], 
    filename: string,
    onProgress?: (percent: number, message?: string) => void
  ): Promise<SAPImportLog> {
    if (rawRows.length < 2) {
      throw new Error('Formato rejeitado: Linhas insuficientes no arquivo.');
    }

    const generateUUID = () => {
      if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
      }
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });
    };

    onProgress?.(2, 'Lendo cabeçalhos e reconciliando schema...');
    const headers = rawRows[0].map(h => String(h || '').trim());
    const dataRows = rawRows.slice(1).filter(r => r.some(c => c !== ''));

    const { mappedFields, missingColumns, newColumns } = this.reconcileSchema(headers, this.ZL0132_COLUMNS);

    const reqColIdx = mappedFields.findIndex(f => f === 'reqc');
    const itemColIdx = mappedFields.findIndex(f => f === 'item');
    const itmLiberacaoColIdx = mappedFields.findIndex(f => f === 'itm_liberacao');
    const itemRcCotIdx = mappedFields.findIndex(f => f === 'item_rc_cotacao');
    const docCompraColIdx = mappedFields.findIndex(f => f === 'doc_compra');
    // o cabecalho no Excel pode ser 'E' (abreviado) ou 'Eflag_e' (nome completo)
    const eflagColByField = mappedFields.findIndex(f => f === 'eflag_e');
    const eflagColByHeader = headers.findIndex(h => h.trim().toUpperCase() === 'E' || h.trim().toUpperCase() === 'EFLAG_E');
    const eflagColIdx = eflagColByField !== -1 ? eflagColByField : eflagColByHeader;

    if (reqColIdx === -1 || (itemColIdx === -1 && itmLiberacaoColIdx === -1 && itemRcCotIdx === -1)) {
      throw new Error('Formato rejeitado: Colunas obrigatórias (ReqC e Item/Itm ou Item RC Cot) não encontradas.');
    }

    const user = this.getCurrentUser();
    let inserted = 0;
    let updated = 0;
    const quantityChanges: any[] = [];
    const ignoredRows: any[] = [];

    // 1. Passo de pré-mapeamento e coleta dos RIs do arquivo
    onProgress?.(5, 'Pré-mapeando linhas e gerando chaves RIs...');
    const rawRecordsToProcess: any[] = [];
    const risNoArquivo: string[] = [];

    dataRows.forEach((row, index) => {
      const fileRowIndex = index + 2;
      const reqNo = String(row[reqColIdx] || '').trim();
      const useItemRcCot = itemRcCotIdx !== -1 && row[itemRcCotIdx] !== undefined && row[itemRcCotIdx] !== '';
      const useItmLiberacao = itmLiberacaoColIdx !== -1 && row[itmLiberacaoColIdx] !== undefined && row[itmLiberacaoColIdx] !== '';
      const targetItemIdx = useItemRcCot ? itemRcCotIdx : (useItmLiberacao ? itmLiberacaoColIdx : itemColIdx);
      const itemNo = String(row[targetItemIdx] || '').trim().padStart(5, '0');

      if (!reqNo || !itemNo || reqNo === 'undefined' || itemNo === '00000') {
        ignoredRows.push({
          row: fileRowIndex,
          identifier: reqNo ? `ReqC: ${reqNo}, Item: ${itemNo}` : 'N/A',
          reason: 'Chave de Requisição (ReqC) ou Item de Requisição inválido/vazio'
        });
        return;
      }

      const ri = reqNo + itemNo;

      // Ignora registros com flag de exclusão (Eflag_e = L)
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

      const docCompra = docCompraColIdx !== -1 ? String(row[docCompraColIdx] || '').trim() : '';

      rawRecordsToProcess.push({ fileRowIndex, ri, row, reqNo, itemNo, docCompra });
      risNoArquivo.push(ri);
    });

    // 2. Buscar no Supabase apenas os registros de pedidosforn correspondentes aos RIs do arquivo
    // Usamos lotes de 400 RIs por requisição e executamos de 10 em 10 em paralelo para não exceder limites de URI ou taxa de API
    let existingMap = new Map<string, any>();
    if (risNoArquivo.length > 0) {
      try {
        const batchSize = 400;
        const concurrency = 10;
        const allExistingRows: any[] = [];
        
        const allBatches: string[][] = [];
        for (let i = 0; i < risNoArquivo.length; i += batchSize) {
          allBatches.push(risNoArquivo.slice(i, i + batchSize));
        }

        for (let i = 0; i < allBatches.length; i += concurrency) {
          const currentBatchIdx = Math.min(i + concurrency, allBatches.length);
          const percent = 10 + Math.floor((i / allBatches.length) * 20);
          onProgress?.(
            percent,
            `Verificando duplicidades no banco: RIs ${i * batchSize + 1} a ${Math.min(currentBatchIdx * batchSize, risNoArquivo.length)} de ${risNoArquivo.length}...`
          );

          const group = allBatches.slice(i, i + concurrency);
          const promises = group.map(batch =>
            supabase
              .from('pedidosforn')
              .select('id, ri, doc_compra, campos_extras, qtd_pedido')
              .in('ri', batch)
          );
          
          const results = await Promise.all(promises);
          for (const res of results) {
            if (res.error) throw res.error;
            if (res.data) {
              allExistingRows.push(...res.data);
            }
          }
        }
        
        if (allExistingRows.length > 0) {
          existingMap = new Map(allExistingRows.map(r => [r.ri + '_' + (r.doc_compra || ''), r]));
        }
      } catch (err) {
        console.warn('Erro ao buscar pedidosforn existentes no Supabase, usando verificação em memória local.', err);
      }
    }

    const newPedidosMap = new Map<string, any>();

    // 3. Processar as linhas mapeando os valores
    onProgress?.(32, 'Processando dados da planilha e identificando alterações de quantidade...');
    rawRecordsToProcess.forEach(({ fileRowIndex, ri, row, reqNo, itemNo, docCompra }) => {
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

      const docCompraVal = record.doc_compra || docCompra || '';
      const compositeKey = ri + '_' + docCompraVal;
      const existing = existingMap.get(compositeKey);

      if (newPedidosMap.has(compositeKey)) {
        const existingInBatch = newPedidosMap.get(compositeKey)!;
        const currentDataDoc = record.data_doc ? new Date(record.data_doc).getTime() : 0;
        const existingDataDoc = existingInBatch.data_pedido ? new Date(existingInBatch.data_pedido).getTime() : 0;

        ignoredRows.push({
          row: fileRowIndex,
          identifier: ri + ' (PO: ' + docCompraVal + ')',
          reason: `Registro com chave RI e PO duplicada no arquivo. Mantido apenas o documento com data mais recente.`
        });

        if (currentDataDoc > existingDataDoc) {
          newPedidosMap.set(compositeKey, {
            ri,
            material: record.material || null,
            txt_breve: record.txt_breve || null,
            fornecedor_codigo: record.fornecedor_codigo || null,
            cnpj_fornecedor: record.cnpj_fornecedor || null,
            fornecedor_name: record.fornecedor_nome || null,
            regiao_uf: record.regiao_uf || null,
            data_pedido: record.data_doc || null,
            campos_extras: { ...campos_extras, ...record },
            record
          });
        }
      } else {
        const poObj = {
          ri,
          material: record.material || null,
          txt_breve: record.txt_breve || null,
          fornecedor_codigo: record.fornecedor_codigo || null,
          cnpj_fornecedor: record.cnpj_fornecedor || null,
          fornecedor_name: record.fornecedor_nome || null,
          regiao_uf: record.regiao_uf || null,
          data_pedido: record.data_doc || null,
          campos_extras: { ...campos_extras, ...record },
          record
        };

        if (existing) {
          const oldQty = existing.campos_extras?.qtd_pedido || existing.qtd_pedido;
          const newQty = record.qtd_pedido;
          if (oldQty !== undefined && oldQty !== null && oldQty !== newQty) {
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

        newPedidosMap.set(compositeKey, poObj);
      }
    });

    // 4. Montar os dados de banco finais
    onProgress?.(38, 'Montando objetos de banco finais...');
    const dbRowsToUpsert = Array.from(newPedidosMap.values()).map(p => {
      const extr = p.campos_extras || {};
      const docCompraVal = p.record?.doc_compra || extr.doc_compra || '';
      const compositeKey = p.ri + '_' + docCompraVal;
      const existing = existingMap.get(compositeKey);
      
      // Mescla com campos_extras antigos se o registro já existia para preservar dados históricos
      const mergedExtras = existing && existing.campos_extras 
        ? { ...existing.campos_extras, ...extr }
        : extr;

      return {
        id: existing?.id || generateUUID(),
        ri: p.ri,
        n_acomp: extr.n_acomp || null,
        eflag_e: extr.eflag_e || null,
        reqc: extr.reqc || null,
        data_rc: extr.data_rc || null,
        tpdc: extr.tpdc || null,
        requisitante: extr.requisitante || null,
        criado_por_rc: extr.criado_por_rc || null,
        item: p.item_pedido || extr.item || null,
        material: p.material,
        txt_breve: p.txt_breve,
        tmatt: extr.tmatt || null,
        grp_mercads: extr.grp_mercads || null,
        empremp: extr.empremp || null,
        cen_cen: extr.cen_cen || null,
        dep_dep: extr.dep_dep || null,
        tipo_doc_compra: extr.tipo_doc_compra || null,
        doc_compra: extr.doc_compra || null,
        criado_por_pedido: extr.criado_por_pedido || null,
        data_doc: p.data_pedido,
        dt_remessa: extr.dt_remessa || null,
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
        fornecedor_codigo: p.fornecedor_codigo,
        cnpj_fornecedor: p.cnpj_fornecedor,
        fornecedor_nome: p.fornecedor_name,
        regiao_uf: p.regiao_uf,
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
        contrato: extr.contrato || null,
        item_contrato: extr.item_contrato || null,
        cn_lcr_parcs: extr.cn_lcr_parcs || null,
        categoria: extr.categoria || null,
        grupo_mercadoria_curto: extr.grupo_mercadoria_curto || null,
        ci: extr.ci || null,
        unidade_medida_basica: extr.unidade_medida_basica || null,
        ump_3: extr.ump_3 || null,
        // Ver comentário equivalente em importZL0132Raw: campos_extras duplicava
        // colunas já mapeadas acima e inflava a tabela; mantido vazio.
        campos_extras: {},
        updated_at: new Date().toISOString()
      };
    });

    try {
      // 5. Enviar upsert apenas dos registros da planilha (lotes de 300 para evitar timeout)
      for (let i = 0; i < dbRowsToUpsert.length; i += 300) {
        const nextBatchLimit = Math.min(i + 300, dbRowsToUpsert.length);
        const percent = 40 + Math.floor((i / dbRowsToUpsert.length) * 50);
        onProgress?.(
          percent,
          `Enviando lotes para o banco: salvando registros ${i + 1} a ${nextBatchLimit} de ${dbRowsToUpsert.length}...`
        );
        const { error } = await supabase
          .from('pedidosforn')
          .upsert(dbRowsToUpsert.slice(i, i + 300), { onConflict: 'ri,doc_compra' });
        if (error) throw error;
      }

      // 6. Gravar log da importação
      onProgress?.(92, 'Gravando logs de importação e auditoria...');
      const logId = 'il_' + Math.random().toString(36).substr(2, 9);
      const logObj = {
        id: logId,
        type: 'PEDIDOSFORN',
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
        created_at: new Date().toISOString(),
        ignored_rows: ignoredRows
      };

      await supabase.from('import_logs').insert(logObj);
      
      // Sincroniza a tabela local e recalcula a materialized view do Histórico de Pedidos —
      // com o mesmo corte de data da sincronização periódica (sem ele, rebaixava as tabelas
      // inteiras: ~66 mil e ~61 mil linhas a cada importação).
      onProgress?.(95, 'Sincronizando cache local...');
      await this.syncSimpleTable('pedidosforn', this.pedidosFornKey, true, q => q.gte('data_rc', '2026-01-01'));
      try {
        await supabase.rpc('refresh_historico_pedidos');
      } catch (err) {
        console.warn('Falha ao recalcular a materialized view do histórico (refresh_historico_pedidos).', err);
      }
      await this.syncSimpleTable('vw_historico_pedidos', this.historicoPedidosKey, true, q => q.gte('data_doc', '2026-01-01'));

      // pedidosforn alimenta view_enriched_pedidos/view_enriched_requisicoes (status_requisicao,
      // documento_compra, data_pedido, criado_por_pedido) — sem reidratar e bumpar 'requisicoes'/
      // 'pedidos' aqui, essa importação atualiza o PO no Supabase mas nenhum cliente (nem o que
      // importou) nota, porque o gate de sincronização só olha a versão de 'requisicoes'.
      onProgress?.(96, 'Atualizando requisições e pedidos com os novos POs...');
      const updatedReqs = await this.fetchAllFromTable<any>('view_enriched_requisicoes', '*', 1000, q => q.gte('data_da_solicitacao', '2026-01-01'));
      const updatedPeds = await this.fetchAllFromTable<any>('view_enriched_pedidos', '*', 1000, q => q.gte('data_rc', '2026-01-01'));

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

      await this.bumpDatasetVersion('pedidosforn', this.getStorageItem<any[]>(this.pedidosFornKey, []).length);
      await this.bumpDatasetVersion('historico_pedidos', this.getHistoricoPedidos().length);
      await this.bumpDatasetVersion('requisicoes', this.getRequisicoes().length);
      await this.bumpDatasetVersion('pedidos', this.getPedidos().length);

      const logs = this.getStorageItem<SAPImportLog[]>(this.importLogsKey, []);
      logs.unshift(logObj as any);
      this.setStorageItem(this.importLogsKey, logs);

      this.logActivity(
        user?.id || 'sistema',
        'Suprimentos',
        'Importar Historico Fornecedores',
        `Importou Historico Fornecedores (${filename}). Lidos: ${dataRows.length}. Novos: ${inserted}. Atualizados: ${updated}.`
      );

      onProgress?.(100, 'Importação concluída com sucesso!');
      return logObj as any;
    } catch (e) {
      console.error('Erro ao salvar importação de pedidosforn no Supabase:', e);
      throw e;
    }
  }

  public async importContatos(rawRows: any[][], filename: string): Promise<SAPImportLog> {
    if (rawRows.length < 2) {
      throw new Error('Formato rejeitado: Linhas insuficientes no arquivo.');
    }

    const headers = rawRows[0].map(h => String(h || '').trim());
    const dataRows = rawRows.slice(1).filter(r => r.some(c => c !== ''));

    const { mappedFields, missingColumns, newColumns } = this.reconcileSchema(headers, this.CONTATOS_COLUMNS);

    const vendorColIdx = mappedFields.findIndex(f => f === 'cod_vendor');

    if (vendorColIdx === -1) {
      throw new Error('Formato rejeitado: Coluna obrigatória "N° Vendor" não encontrada.');
    }

    const user = this.getCurrentUser();
    let inserted = 0;
    let updated = 0;
    const dbRows: any[] = [];
    const ignoredRows: any[] = [];

    const fornColIdx = mappedFields.findIndex(f => f === 'fornecedor');
    const telColIdx = mappedFields.findIndex(f => f === 'telefone');
    const emailColIdx = mappedFields.findIndex(f => f === 'email');
    const classColIdx = mappedFields.findIndex(f => f === 'classificacao');

    dataRows.forEach((row, index) => {
      const fileRowIndex = index + 2;
      const codVendor = String(row[vendorColIdx] || '').trim();

      if (!codVendor) {
        ignoredRows.push({
          row: fileRowIndex,
          identifier: 'N/A',
          reason: 'Código do Fornecedor (N° Vendor) vazio.'
        });
        return;
      }

      dbRows.push({
        cod_vendor: codVendor,
        fornecedor: fornColIdx !== -1 ? String(row[fornColIdx] || '').trim() : null,
        telefone: telColIdx !== -1 ? String(row[telColIdx] || '').trim() : null,
        email: emailColIdx !== -1 ? String(row[emailColIdx] || '').trim() : null,
        classificacao: classColIdx !== -1 ? String(row[classColIdx] || '').trim() : null,
        updated_at: new Date().toISOString()
      });
    });

    // Deduplica os contatos em memória antes de enviar para o Supabase
    const uniqueDbRowsMap = new Map<string, any>();
    dbRows.forEach(item => {
      uniqueDbRowsMap.set(item.cod_vendor, item);
    });
    const finalDbRows = Array.from(uniqueDbRowsMap.values());

    try {
      for (let i = 0; i < finalDbRows.length; i += 50) {
        const { error } = await supabase.from('contatos').upsert(finalDbRows.slice(i, i + 50), { onConflict: 'cod_vendor' });
        if (error) throw error;
      }

      inserted = finalDbRows.length;

      const logId = 'il_' + Math.random().toString(36).substr(2, 9);
      const logObj = {
        id: logId,
        type: 'CONTATOS',
        user_name: user?.name || 'Sistema',
        filename,
        records_read: dataRows.length,
        records_inserted: inserted,
        records_updated: updated,
        records_unchanged: 0,
        records_eliminated: 0,
        columns_missing: missingColumns,
        columns_new: newColumns,
        quantity_changes: [],
        missing_ris: [],
        created_at: new Date().toISOString(),
        ignored_rows: ignoredRows
      };

      await supabase.from('import_logs').insert(logObj);
      await this.syncSimpleTable('contatos', this.contatosKey, true);
      await this.bumpDatasetVersion('contatos', this.getContatosForn().length);

      const logs = this.getStorageItem<SAPImportLog[]>(this.importLogsKey, []);
      logs.unshift(logObj as any);
      this.setStorageItem(this.importLogsKey, logs);

      this.logActivity(user?.id || 'sistema', 'Suprimentos', 'Importar Contatos Fornecedores', `Importou Contatos Fornecedores (${filename}). Lidos: ${dataRows.length}, salvos: ${dbRows.length}.`);

      return logObj as any;
    } catch (e) {
      console.error('Erro ao salvar importação de contatos no Supabase:', e);
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

      if (status === 'ativo' && users[idx].roles.includes('pendente')) {
        users[idx].roles = ['visualizador'];
      }

      this.setStorageItem(this.profilesKey, users);
      this.logActivity('admin', 'Administração', 'Aprovar Usuário', `Usuário ${users[idx].name} status atualizado para ${status}.`);

      // Atualiza o status no Supabase de forma assíncrona
      if (supabase) {
        supabase.from('profiles')
          .update({ 
            status: status,
            roles: users[idx].roles
          })
          .eq('id', userId)
          .then(({ error }) => {
            if (error) {
              console.error('Erro ao sincronizar status do usuário no Supabase:', error);
            }
          })
          .catch(err => {
            console.error('Falha de escrita de status no Supabase:', err);
          });
      }

      return true;
    }
    return false;
  }

  public updateUserRole(userId: string, role: string): boolean {
    const users = this.getProfiles();
    const idx = users.findIndex(u => u.id === userId);
    if (idx !== -1) {
      users[idx].roles = [role as any];

      if (users[idx].status === 'pendente' && role !== 'pendente') {
        users[idx].status = 'ativo';
      }

      this.setStorageItem(this.profilesKey, users);
      this.logActivity('admin', 'Administração', 'Editar Perfil', `Perfil de ${users[idx].name} alterado para papel ${role}.`);

      // Atualiza os papéis de acesso no Supabase de forma assíncrona
      if (supabase) {
        supabase.from('profiles')
          .update({ 
            roles: [role],
            status: users[idx].status
          })
          .eq('id', userId)
          .then(({ error }) => {
            if (error) {
              console.error('Erro ao sincronizar papéis do usuário no Supabase:', error);
            }
          })
          .catch(err => {
            console.error('Falha de escrita de papéis no Supabase:', err);
          });
      }

      return true;
    }
    return false;
  }

  // Define o grupo de compras SAP (ex.: 314, 358) associado a este usuário,
  // editável na tela de Gestão de Usuários (Admin). Vazio remove a associação.
  public updateUserGrupoCompras(userId: string, grupoCompras: string): boolean {
    const users = this.getProfiles();
    const idx = users.findIndex(u => u.id === userId);
    if (idx === -1) return false;

    const value = grupoCompras.trim() || null;
    users[idx].grupo_compras = value;
    this.setStorageItem(this.profilesKey, users);
    this.logActivity('admin', 'Administração', 'Editar Perfil', `Grupo de compras de ${users[idx].name} definido como "${value ?? '—'}".`);

    if (supabase) {
      supabase.from('profiles')
        .update({ grupo_compras: value })
        .eq('id', userId)
        .then(({ error }) => {
          if (error) console.error('Erro ao sincronizar grupo de compras no Supabase:', error);
        })
        .catch(err => {
          console.error('Falha de escrita do grupo de compras no Supabase:', err);
        });
    }

    return true;
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

      // Atualiza os dados de nome e cargo no Supabase de forma assíncrona
      if (supabase) {
        supabase.from('profiles')
          .update({ name, cargo })
          .eq('id', userId)
          .then(({ error }) => {
            if (error) {
              console.error('Erro ao sincronizar dados do perfil no Supabase:', error);
            }
          })
          .catch(err => {
            console.error('Falha de escrita de campos de perfil no Supabase:', err);
          });
      }

      return users[idx];
    }
    return null;
  }

  public async changePassword(newPass: string): Promise<boolean> {
    if (!supabase) return false;
    try {
      const { error } = await supabase.auth.updateUser({ password: newPass });
      if (error) {
        console.error('Erro ao atualizar senha no Supabase Auth:', error);
        return false;
      }
      const user = this.getCurrentUser();
      if (user) {
        this.logActivity(user.id, 'Perfil', 'Alterar Senha', 'Senha de usuário alterada com sucesso.');
      }
      return true;
    } catch (err) {
      console.error('Falha de comunicação ao alterar senha:', err);
      return false;
    }
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
