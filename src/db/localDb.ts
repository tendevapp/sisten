/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { 
  Profile, Sector, Material, Request, RequestItem, RequestComment, 
  RequestStatusHistory, RequestAttachment, Notification, SAPRequisicao,
  SAPPedido, SAPObsHistory, SAPImportLog, UserBuyerGroup, RequestStatus, Role, RequestType,
  ActivityLog, EnrichedSAPRecord, ItemStatus, PedidoForn, ContatoFornecedor, CidadeForn, HistoricoPedidoView,

  RastreioMensagem, RastreioPrioridade, EstoqueItem, EstoqueAnalise, GrupoMercadoria, ContratoME3N,
  ContratoDetalhes, ContratoAnexo, AuditoriaCompra, AuditoriaHistoricoMaterial, FeedbackReport, FeedbackLogEntry
} from '../types';
import { priorityMeta } from '../lib/rastreio';
import { CompradorInfo } from '../lib/demandas';
import { limparCacheBusca } from '../lib/materiais';
import { canAccessPage } from '../lib/pages';
import { NOME_SETOR_JURIDICO } from '../lib/juridico';
import { formatDateTimeBR } from '../lib/format';
import { INITIAL_SECTORS } from '../data/sectors';
import { generateMaterials, getAutoCategory } from '../data/materials';
import { generateSAPSeedData } from '../data/sapData';
import { supabase } from './supabaseClient';
import { FBL1N_COLUMNS, mapFbl1nRow } from '../lib/fbl1n';
import { PreparedAttachment } from '../lib/imageCompression';
import { gerarUUID, novoItemId } from '../lib/ids';
import { entries as idbEntries, set as idbSet, del as idbDel } from 'idb-keyval';

/** Bucket privado dos anexos de solicitação. Leitura só por URL assinada. */
const ATTACHMENTS_BUCKET = 'request-attachments';

/** Bucket privado dos prints anexados a reportes de bug. Leitura só por URL assinada. */
const FEEDBACK_BUCKET = 'feedback-screenshots';

/** Validade da URL assinada de um anexo: 1 hora. */
const SIGNED_URL_TTL_SEGUNDOS = 3600;


class LocalDatabase {
  // Espelho em memória de tudo que está no IndexedDB. Toda leitura (getStorageItem)
  // e escrita (setStorageItem) passa por aqui, mantendo a API síncrona usada em toda
  // a aplicação mesmo com uma persistência assíncrona por trás.
  private cache = new Map<string, any>();
  private pageCache = new Map<string, any>();
  private listeners = new Set<() => void>();
  // URLs assinadas de anexo, por caminho no bucket. Só em memória: uma URL
  // assinada expira, então persisti-la no IndexedDB só geraria link quebrado.
  private signedUrlCache = new Map<string, { url: string; expiresAt: number }>();
  private readonly migratedFlagKey = '__sisten_idb_migrated__';
  private syncPromise: Promise<void> | null = null;

  // TTL mínimo entre syncs não-forçados: sem isso, boot + polling de 5 min +
  // focus/visibilitychange + troca de rota podiam disparar vários syncs
  // completos por minuto (cada um com ~14 requests). Ver plano de egress, P1.
  private lastSyncAt = 0;
  private readonly syncTTLMs = 60_000;

  // Resolvida assim que o cache em memória estiver populado (a partir do IndexedDB,
  // com migração de dados legados do localStorage se necessário). App.tsx aguarda
  // apenas isto — não a sincronização com o Supabase — antes de renderizar.
  public readonly ready: Promise<void>;

  private sectorsKey = 'sisten_sectors';
  private profilesKey = 'sisten_profiles';
  private materialsKey = 'sisten_materials';
  private requestsKey = 'sisten_requests';
  private requestItemsKey = 'sisten_request_items';
  private attachmentsKey = 'sisten_attachments';
  private commentsKey = 'sisten_comments';
  private historyKey = 'sisten_history';
  private notificationsKey = 'sisten_notifications';
  private requisicoesKey = 'sisten_requisicoes';
  private pedidosKey = 'sisten_pedidos';
  private obsHistoryKey = 'sisten_obs_history';
  private importLogsKey = 'sisten_import_logs';
  private buyerGroupsKey = 'sisten_buyer_groups';
  private compradoresKey = 'sisten_compradores';
  private prioridadesKey = 'sisten_rastreio_prioridades';
  private logsKey = 'sisten_activity_logs';
  private favoritesKey = 'sisten_favorites';
  private sequencesKey = 'sisten_sequences';
  private pedidosFornKey = 'sisten_pedidos_forn';
  private contatosKey = 'sisten_contatos';
  private cidadeFornKey = 'sisten_cidadeforn';
  private gruposMercadoriaKey = 'sisten_grupos_mercadoria';
  private estoqueKey = 'sisten_estoque';
  private estoqueAnaliseKey = 'sisten_estoque_analise';
  private contratosKey = 'sisten_contratos';
  private contratosDetalhesKey = 'sisten_contratos_detalhes';
  private contratoAnexosKey = 'sisten_contrato_anexos';
  private tabelaFreteKey = 'sisten_tabela_frete';

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
      cidadeforn: this.cidadeFornKey,
      tabela_frete: this.tabelaFreteKey,
    };
    return map[dataset];
  }

  private historicoPedidosKey = 'sisten_historico_pedidos';
  // Auditoria de preços (vw_auditoria_compras): as compras de 2026 com a
  // referência histórica corrigida pelo IPCA ao lado. ~750 linhas. Não entra na
  // sincronização periódica — a aba busca sob demanda, como Estoque, porque só
  // uma tela consome e o dado só muda quando entra importação nova de pedidos.
  private auditoriaComprasKey = 'sisten_auditoria_compras';
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
    if (typeof indexedDB !== 'undefined') {
      try {
        const allEntries = await idbEntries<string, any>();
        allEntries.forEach(([key, value]) => this.cache.set(String(key), value));
      } catch (err) {
        console.warn('Não foi possível carregar o cache do IndexedDB. Iniciando com armazenamento vazio.', err);
      }
    }

    await this.migrateFromLocalStorageIfNeeded();
    this.initialize();
  }

  // Migração única de dados de versões anteriores do app, que guardavam tudo em
  // localStorage (síncrono, cota de poucos MB). Copia cada chave para o cache/IndexedDB
  // e limpa o localStorage para liberar a cota do navegador.
  private async migrateFromLocalStorageIfNeeded(): Promise<void> {
    if (typeof localStorage === 'undefined' || this.cache.has(this.migratedFlagKey)) return;

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
  /**
   * @param force Ignora o gate de versão e rebaixa as bases pesadas mesmo que o
   * carimbo local esteja igual ao remoto. Usado pelos botões "Atualizar" das
   * telas: sem isso o clique não trazia nada quando a versão não havia mudado —
   * e o usuário não tinha como escapar de um cache local corrompido ou de um
   * dado corrigido no banco sem passar por uma reimportação.
   * @param datasets Quando informado junto de `force`, restringe o bypass do
   * gate de versão a esses datasets (os demais continuam respeitando o
   * carimbo normalmente). Usado pelos botões "Atualizar" de telas que só
   * precisam de uma base específica — sem isso, um clique forçava o
   * re-download de TODAS as bases pesadas (ex.: `cidadeforn`, 26 MB) mesmo
   * quando só uma mudou.
   */
  public async syncFromSupabase(force = false, datasets?: string[]): Promise<void> {
    if (!supabase) {
      console.warn('Sincronização com o Supabase ignorada: cliente não inicializado.');
      return;
    }

    const currentUser = this.getCurrentUser();
    if (!currentUser) {
      console.log('Sincronização com o Supabase ignorada: nenhum usuário autenticado.');
      return;
    }

    // TTL mínimo entre syncs não-forçados: absorve o polling + focus/visibility
    // + troca de rota disparando em sequência rápida (ver plano de egress, P1).
    if (!force && Date.now() - this.lastSyncAt < this.syncTTLMs) {
      return;
    }

    if (this.syncPromise) {
      // Num sync forçado, espera o que está em andamento (pode ser um sync
      // gated, que não baixaria nada) e só então roda o download completo.
      if (!force) return this.syncPromise;
      await this.syncPromise.catch(() => {});
    }

    this.syncPromise = (async () => {
      this.lastSyncAt = Date.now();
      try {
        console.log('Iniciando sincronização com o Supabase...');

        // Carimbos de versão (1 request leve). As bases pesadas abaixo só são
        // rebaixadas quando a versão muda; as tabelas pequenas/interativas
        // (requests, notifications, etc.) continuam sincronizando normalmente.
        const markers = await this.fetchRemoteMarkers();

        // Envelopa uma tarefa de sync pesada num gate de versão: se o cache local
        // já estiver na versão corrente, não baixa nada. Com `datasets` informado,
        // o force só se aplica aos datasets listados.
        const gated = (dataset: string, task: () => Promise<void>): (() => Promise<void>) => async () => {
          const storageKey = this.storageKeyFor(dataset);
          const forceThis = force && (!datasets || datasets.includes(dataset));
          if (!forceThis && !this.needsSync(dataset, storageKey, markers)) {
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
          ['compradores', () => this.syncSimpleTable('compradores', this.compradoresKey, true, undefined, 'grupo_compras')],
          ['rastreio_prioridades', () => this.syncSimpleTable('rastreio_prioridades', this.prioridadesKey, true, undefined, 'id')],
          ['tabela_frete', () => this.syncSimpleTable('tabela_frete', this.tabelaFreteKey, true, undefined, 'id')],
          // 'materials' saiu da sincronização geral: o catálogo tem ~172k linhas e é
          // consultado direto no Supabase por toda tela que precisa dele (busca,
          // autocomplete). Baixar o catálogo inteiro para o cache local a cada sessão
          // era o maior consumidor de egress do projeto.
          ['view_enriched_requisicoes', gated('requisicoes', () => this.syncSimpleTable('view_enriched_requisicoes', this.requisicoesKey, true, q => q.gte('data_da_solicitacao', '2026-01-01'), 'ri'))],
          ['view_enriched_pedidos', gated('pedidos', () => this.syncSimpleTable('view_enriched_pedidos', this.pedidosKey, true, q => q.gte('data_rc', '2026-01-01'), 'ri'))],
          // Estas três fazem merge em vez de substituir: o motor de solicitações
          // ainda é local-first (só a criação sobe; status, atendente e
          // comentários seguem locais). Com `syncSimpleTable`, a primeira linha
          // inserida no servidor faria o download apagar tudo que existe só no
          // cache do usuário — inclusive as mutações que ainda não migraram.
          ['requests', () => this.syncMergedTable('requests', this.requestsKey)],
          ['request_items', () => this.syncMergedTable('request_items', this.requestItemsKey)],
          ['request_attachments', () => this.syncMergedTable('request_attachments', this.attachmentsKey)],
          // Também por merge, pelo mesmo motivo das demais tabelas de
          // solicitação: substituir o array local apagaria comentários e
          // transições que ainda não conseguiram subir.
          ['request_comments', () => this.syncMergedTable('request_comments', this.commentsKey)],
          ['request_status_history', () => this.syncMergedTable('request_status_history', this.historyKey)],
          ['notifications', () => this.syncSimpleTable('notifications', this.notificationsKey, false, undefined, 'id')],
          // import_logs tem uma coluna pesada (ignored_rows, jsonb) que sozinha já
          // passou de 12 MB no banco; baixá-la inteira em todo sync (a cada troca de
          // rota / foco / polling) é o maior consumidor de egress medido no projeto.
          // syncImportLogs baixa só colunas leves + contagens, e apenas os N logs
          // mais recentes — o detalhe completo é buscado sob demanda (ver
          // fetchImportLogDetail), quando o usuário expande um log no AdminPanel.
          ['import_logs', () => this.syncImportLogs()],
          ['obs_historico', () => this.syncObsHistory()],
          ['activity_logs', () => this.syncSimpleTable('activity_logs', this.logsKey, false, undefined, 'id')],
          ['sequences', () => this.syncSequences()],
          ['pedidosforn', gated('pedidosforn', () => this.syncSimpleTable('pedidosforn', this.pedidosFornKey, true, q => q.gte('data_rc', '2026-01-01'), 'id'))],
          // vw_historico_pedidos não tem coluna única (é uma view agregada); não dá
          // para forçar um ORDER BY seguro aqui sem arriscar um nome de coluna
          // inválido. Ver P5 no plano de egress.
          ['vw_historico_pedidos', gated('historico_pedidos', () => this.syncSimpleTable('vw_historico_pedidos', this.historicoPedidosKey, true))],
          ['contatos', gated('contatos', () => this.syncSimpleTable('contatos', this.contatosKey, true, undefined, 'id'))],
          ['cidadeforn', gated('cidadeforn', () => this.syncSimpleTable('cidadeforn', this.cidadeFornKey, true, undefined, 'id'))],
          // Cadastro de referência pequeno (~1,4 mil linhas) e estático: decodifica
          // o grupo de mercadoria do SAP para a descrição exibida na Central
          // Compras. Resolvido no cliente porque acrescentar a coluna em
          // `view_enriched_requisicoes` significaria reescrever uma definição de
          // 15 KB com 81 dependências.
          ['cadastro_grupo_mercadoria', () => this.syncSimpleTable('cadastro_grupo_mercadoria', this.gruposMercadoriaKey, true, undefined, 'codigo')],
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
      const mappedProfiles = profiles.map(p => ({
        ...p,
        roles: p.roles || [],
        tours_seen: p.tours_seen || {},
      }));
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
    const materials = await this.fetchAllFromTable<any>('materials', '*', 1000, undefined, 'id');
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
    filterFn?: (query: any) => any,
    orderCol?: string
  ): Promise<void> {
    const rows = await this.fetchAllFromTable<any>(table, '*', 1000, filterFn, orderCol);
    if (alwaysSet || (rows && rows.length > 0)) {
      this.setStorageItem(storageKey, rows || []);
    }
  }

  /**
   * Igual a `syncSimpleTable`, mas preserva as linhas que só existem no cache
   * local — o remoto vence quando os dois lados têm o mesmo `id`.
   *
   * Necessário para as tabelas de solicitação enquanto o motor for local-first:
   * `syncSimpleTable` reescreve o array inteiro assim que o servidor devolve
   * qualquer linha, o que apagaria as solicitações e mutações que ainda não
   * sobem (ver o design doc de anexos, seção "O risco que isso esconde").
   */
  private async syncMergedTable(table: string, storageKey: string): Promise<void> {
    const rows = await this.fetchAllFromTable<any>(table, '*', 1000, undefined, 'id');
    if (!rows) return;

    const idsRemotos = new Set(rows.map(r => r.id));
    const locais = this.getStorageItem<any[]>(storageKey, []);
    const somenteLocais = locais.filter(l => l && !idsRemotos.has(l.id));

    this.setStorageItem(storageKey, [...rows, ...somenteLocais]);
  }

  private async syncObsHistory(): Promise<void> {
    const dbObsHistory = await this.fetchAllFromTable<any>('obs_historico', '*', 1000, undefined, 'id');
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
    const dbSequences = await this.fetchAllFromTable<any>('sequences', '*', 1000, undefined, 'key');
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
    if (typeof indexedDB !== 'undefined') {
      idbSet(key, value).catch(err => {
        console.warn(`Não foi possível persistir "${key}" no IndexedDB.`, err);
      });
    }
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

  // Cache curto dos carimbos remotos: syncFromSupabase, fetchHistoricoPedidos,
  // fetchHistoricoFornecedoresSemPO e bumpDatasetVersion chamavam
  // fetchRemoteMarkers cada um por conta própria — várias requests idênticas
  // em sequência rápida (ex.: abrir uma tela logo após o boot). 30s é curto o
  // bastante para nunca mascarar uma importação real (que já dá um bump
  // explícito e busca markers frescos via forceRefresh).
  private markersCache: { data: Map<string, { version: number; updatedAt: string | null }> | null; ts: number } | null = null;
  private readonly markersCacheTTLMs = 30_000;

  // Busca todos os carimbos remotos de uma vez (1 request, poucas linhas).
  // Retorna null quando a tabela ainda não existe (modo degradado seguro).
  private async fetchRemoteMarkers(forceRefresh = false): Promise<Map<string, { version: number; updatedAt: string | null }> | null> {
    if (!supabase) return null;
    if (!forceRefresh && this.markersCache && Date.now() - this.markersCache.ts < this.markersCacheTTLMs) {
      return this.markersCache.data;
    }
    try {
      const { data, error } = await supabase.from('dataset_versions').select('dataset, version, updated_at');
      if (error) throw error;
      const map = new Map<string, { version: number; updatedAt: string | null }>();
      (data || []).forEach((r: any) => map.set(r.dataset, { version: Number(r.version), updatedAt: r.updated_at ?? null }));
      this.markersCache = { data: map, ts: Date.now() };
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

  // Data/hora em que a base foi atualizada pela última vez (última importação SAP),
  // para exibição nas telas ("Dados atualizados em: ..."). Busca preferencialmente
  // a data da última importação SAP da planilha de referência correspondente ao dataset.
  public getDatasetUpdatedAt(dataset: string): string | null {
    if (!dataset) return null;

    const datasetTypeMap: Record<string, string[]> = {
      'estoque': ['ZL0024'],
      'zl0024': ['ZL0024'],
      'contratos': ['ME3N', 'ME3M'],
      'me3n_contratos': ['ME3N', 'ME3M'],
      'me3m_contratos': ['ME3N', 'ME3M'],
      'fbl1n_c_pagar': ['FBL1N'],
      'contas_pagar': ['FBL1N'],
      'requisicoes': ['ME5A', 'ZL0132'],
      'pedidos': ['ZL0132', 'HISTORICO_FORNECEDORES'],
      'historico_pedidos': ['ZL0132', 'HISTORICO_FORNECEDORES'],
      'pedidosforn': ['ZL0132', 'HISTORICO_FORNECEDORES'],
      'materials': ['MATERIAIS', 'CATALOGO'],
      'tabela_frete': ['TABELA_FRETE', 'FRETE'],
      'contatos': ['CONTATOS'],
      'cidadeforn': ['CIDADE_FORN', 'ENDERECOS_FORNECEDORES'],
    };

    const targetTypes = datasetTypeMap[dataset.toLowerCase()] || [];

    // 1. Tenta buscar nos logs de importação SAP gravados
    const logs = this.getStorageItem<SAPImportLog[]>(this.importLogsKey, []);
    let latestLogDate: string | null = null;
    if (logs && logs.length > 0 && targetTypes.length > 0) {
      const matchingLogs = logs.filter(l => l.type && targetTypes.includes(String(l.type).toUpperCase()));
      if (matchingLogs.length > 0) {
        matchingLogs.forEach(l => {
          if (l.created_at && (!latestLogDate || l.created_at > latestLogDate)) {
            latestLogDate = l.created_at;
          }
        });
      }
    }

    // 2. Tenta buscar no carimbo de versão remota/local (updatedAt)
    const meta = this.getDatasetMeta(dataset);
    const metaUpdatedAt = meta?.updatedAt || null;

    // Retorna a data mais recente entre a importação SAP e o carimbo de versão
    if (latestLogDate && metaUpdatedAt) {
      return latestLogDate > metaUpdatedAt ? latestLogDate : metaUpdatedAt;
    }

    return latestLogDate || metaUpdatedAt || meta?.fetchedAt || null;
  }

  // Retorna os detalhes de atualização: data do download do banco local, data do último upload de importação SAP e a tag da planilha (ex.: ME5A, ZL0024, ME3N, FBL1N).
  public getDatasetUpdateDetails(dataset: string): { dbUpdatedAt: string | null; sapImportAt: string | null; sapTag: string } {
    if (!dataset) {
      return { dbUpdatedAt: null, sapImportAt: null, sapTag: 'SAP' };
    }

    const defaultTags: Record<string, string> = {
      'estoque': 'ZL0024',
      'zl0024': 'ZL0024',
      'contratos': 'ME3N',
      'me3n_contratos': 'ME3N',
      'me3m_contratos': 'ME3N',
      'fbl1n_c_pagar': 'FBL1N',
      'contas_pagar': 'FBL1N',
      'requisicoes': 'ME5A',
      'pedidos': 'ZL0132',
      'historico_pedidos': 'ZL0132',
      'pedidosforn': 'ZL0132',
      'materials': 'MATERIAIS',
      'tabela_frete': 'FRETE',
      'contatos': 'CONTATOS',
      'cidadeforn': 'ENDEREÇOS',
    };

    const datasetTypeMap: Record<string, string[]> = {
      'estoque': ['ZL0024'],
      'zl0024': ['ZL0024'],
      'contratos': ['ME3N', 'ME3M'],
      'me3n_contratos': ['ME3N', 'ME3M'],
      'me3m_contratos': ['ME3N', 'ME3M'],
      'fbl1n_c_pagar': ['FBL1N'],
      'contas_pagar': ['FBL1N'],
      'requisicoes': ['ME5A', 'ZL0132'],
      'pedidos': ['ZL0132', 'HISTORICO_FORNECEDORES'],
      'historico_pedidos': ['ZL0132', 'HISTORICO_FORNECEDORES'],
      'pedidosforn': ['ZL0132', 'HISTORICO_FORNECEDORES'],
      'materials': ['MATERIAIS', 'CATALOGO'],
      'tabela_frete': ['TABELA_FRETE', 'FRETE'],
      'contatos': ['CONTATOS'],
      'cidadeforn': ['CIDADE_FORN', 'ENDERECOS_FORNECEDORES'],
    };

    const key = dataset.toLowerCase();
    const targetTypes = datasetTypeMap[key] || [];
    const defaultTag = defaultTags[key] || 'SAP';

    const meta = this.getDatasetMeta(dataset);
    const dbUpdatedAt = meta?.fetchedAt || meta?.updatedAt || null;

    const logs = this.getStorageItem<SAPImportLog[]>(this.importLogsKey, []);
    let sapImportAt: string | null = null;
    let sapTag = defaultTag;

    if (logs && logs.length > 0 && targetTypes.length > 0) {
      const matchingLogs = logs.filter(l => l.type && targetTypes.includes(String(l.type).toUpperCase()));
      if (matchingLogs.length > 0) {
        let latestLog: SAPImportLog | null = null;
        matchingLogs.forEach(l => {
          if (l.created_at && (!latestLog || l.created_at > latestLog.created_at)) {
            latestLog = l;
          }
        });
        if (latestLog) {
          sapImportAt = (latestLog as SAPImportLog).created_at;
          sapTag = String((latestLog as SAPImportLog).type).toUpperCase();
        }
      }
    }

    if (!sapImportAt && meta?.updatedAt) {
      sapImportAt = meta.updatedAt;
    }

    return {
      dbUpdatedAt,
      sapImportAt,
      sapTag,
    };
  }

  // Gera o texto formatado para o badge de cabeçalho das telas:
  // "Banco de dados atualizado em: DD/MM/AAAA, HH:mm | ME5A: DD/MM/AAAA, HH:mm"
  public getDatasetUpdateBadge(dataset: string): string {
    const details = this.getDatasetUpdateDetails(dataset);
    const dbStr = details.dbUpdatedAt ? formatDateTimeBR(details.dbUpdatedAt) : null;
    const sapStr = details.sapImportAt ? formatDateTimeBR(details.sapImportAt) : null;
    const tag = details.sapTag || 'SAP';

    if (dbStr && sapStr) {
      return `Banco de dados atualizado em: ${dbStr} | ${tag}: ${sapStr}`;
    } else if (dbStr) {
      return `Banco de dados atualizado em: ${dbStr}`;
    } else if (sapStr) {
      return `Importação ${tag} atualizada em: ${sapStr}`;
    }
    return 'Dados atualizados recentemente';
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
      // forceRefresh: acabamos de incrementar a versão no servidor; um cache
      // de até 30s aqui faria o próprio importador ler o carimbo antigo e
      // achar (erradamente) que ainda precisa sincronizar de novo.
      const markers = await this.fetchRemoteMarkers(true);
      this.commitDatasetMeta(dataset, markers);
    } catch (err) {
      console.warn(`Falha ao incrementar a versão do dataset '${dataset}'.`, err);
    }
  }

  // Recalcula as materialized views derivadas de pedidosforn (mv_historico_pedidos e
  // mv_pedido_atual_por_ri, via a RPC refresh_historico_pedidos). É chamada logo após
  // toda importação SAP que grava em pedidosforn, ANTES de reidratar as views enriquecidas
  // e de bumpar as versões dos datasets — se isso falhar silenciosamente, os clientes
  // acabam cacheando a versão nova do dataset com dados antigos da mat view (PO some/não
  // aparece até a próxima importação). Por isso tenta de novo uma vez e, se persistir,
  // propaga o erro em vez de deixar a importação seguir com cache desatualizado para todos.
  private async refreshPedidosMatViews(): Promise<void> {
    if (!supabase) return;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const { error } = await supabase.rpc('refresh_historico_pedidos');
        if (error) {
          const errMsg = error.message || error.details || error.hint || (typeof error === 'object' ? JSON.stringify(error) : String(error));
          throw new Error(errMsg);
        }
        return;
      } catch (err: any) {
        const msg = err?.message || err?.details || err?.hint || (typeof err === 'object' ? JSON.stringify(err) : String(err));
        if (attempt === 2) {
          console.warn(`Aviso: Não foi possível recalcular a materialized view do histórico (refresh_historico_pedidos): ${msg}`);
          return;
        }
        console.warn(`Tentativa ${attempt} de recalcular materialized view do histórico falhou (${msg}). Tentando novamente...`);
      }
    }
  }

  /**
   * Atualiza os sinais que a busca de material mostra — saldo, RM aberta,
   * pedido a caminho. Eles vivem numa materialized view; sem este refresh ela
   * congela na data de criação, e saldo velho é pior que saldo nenhum, porque
   * parece conferido.
   *
   * Falha aqui não desfaz a importação: os dados já entraram, e a próxima
   * carga corrige o sinal.
   */
  private async refreshMaterialSinais(): Promise<void> {
    if (!supabase) return;
    const { error } = await supabase.rpc('refresh_material_sinais');
    if (error) console.warn('Falha ao atualizar os sinais de material:', error);
    // O catálogo acabou de mudar; o que a busca guardou em memória virou
    // resposta velha. Só o cache é descartado — nada é rebuscado agora.
    limparCacheBusca();
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
          page_access: {},
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
          page_access: {},
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
          page_access: {},
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
          page_access: {},
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
          page_access: {},
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
          page_access: {},
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
          page_access: {},
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
          page_access: {},
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
          page_access: {},
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
          page_access: {},
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
          page_access: {},
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
          page_access: {},
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
          page_access: {},
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

    if (!this.cache.has(this.compradoresKey)) {
      const seededCompradores: CompradorInfo[] = [
        { grupo_compras: '314', nome_comprador: 'Comprador 314' },
        { grupo_compras: '358', nome_comprador: 'Comprador 358' },
        { grupo_compras: '447', nome_comprador: 'Comprador 447' },
        { grupo_compras: '575', nome_comprador: 'Comprador 575' },
        { grupo_compras: '602', nome_comprador: 'Jamille' },
        { grupo_compras: '610', nome_comprador: 'Giulia' }
      ];
      this.setStorageItem(this.compradoresKey, seededCompradores);
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

    // 7. Limpeza de dados de demonstração (legado): solicitações fictícias
    // (r1..r13 e afins) eram semeadas aqui no primeiro carregamento. O merge
    // de sync (`syncMergedTable`) só soma linhas remotas às locais e nunca
    // remove uma linha local sem par remoto, então esses IDs fixos ficavam
    // para sempre em "Minhas Solicitações", misturados com dados reais.
    // Roda sempre (não só quando `requestsKey` está vazio) para também
    // limpar quem já tinha esses registros presos no localStorage.
    this.purgeLegacyDemoRequests();
  }

  private purgeLegacyDemoRequests(): void {
    const idsLegado = new Set(['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8', 'r9', 'r10', 'r11', 'r12', 'r13']);
    const itemIdsLegado = new Set(['ri1', 'ri2', 'ri3', 'ri4']);
    const historyIdsLegado = new Set(['h1', 'h2', 'h3', 'h4']);
    const commentIdsLegado = new Set(['c1']);

    const requests = this.getStorageItem<Request[]>(this.requestsKey, []);
    if (requests.some(r => idsLegado.has(r.id))) {
      this.setStorageItem(this.requestsKey, requests.filter(r => !idsLegado.has(r.id)));
    }

    const items = this.getStorageItem<RequestItem[]>(this.requestItemsKey, []);
    if (items.some(i => itemIdsLegado.has(i.id))) {
      this.setStorageItem(this.requestItemsKey, items.filter(i => !itemIdsLegado.has(i.id)));
    }

    const history = this.getStorageItem<RequestStatusHistory[]>(this.historyKey, []);
    if (history.some(h => historyIdsLegado.has(h.id))) {
      this.setStorageItem(this.historyKey, history.filter(h => !historyIdsLegado.has(h.id)));
    }

    const comments = this.getStorageItem<RequestComment[]>(this.commentsKey, []);
    if (comments.some(c => commentIdsLegado.has(c.id))) {
      this.setStorageItem(this.commentsKey, comments.filter(c => !commentIdsLegado.has(c.id)));
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
          page_access: {},
          status: 'ativo',
          created_at: new Date().toISOString()
        };

        const { error: insertError } = await supabase
          .from('profiles')
          .insert(newProfile);

        if (insertError) {
          console.error('Erro ao inserir perfil padrão:', insertError);
          // Sem o perfil gravado no Supabase, o login seguiria com um id que não
          // existe em `profiles` — FKs (comprador_id, solicitante_id, etc.) e
          // sanitizeRequestRow descartariam silenciosamente esse usuário depois.
          await supabase.auth.signOut();
          return 'Erro ao criar perfil do usuário. Tente novamente ou procure o administrador.';
        }

        mappedProfile = newProfile;
      } else {
        mappedProfile = {
          ...profile,
          roles: profile.roles || [],
          page_access: profile.page_access || {},
          tours_seen: profile.tours_seen || {},
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
      this.notifyAndreNewUser(name, email);
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

  public async updatePageAccess(userId: string, pageId: string, allowed: boolean | null): Promise<void> {
    const users = this.getStorageItem<Profile[]>(this.profilesKey, []);
    const idx = users.findIndex(u => u.id === userId);
    if (idx === -1) return;

    const current = { ...(users[idx].page_access || {}) };
    if (allowed === null) {
      delete current[pageId];
    } else {
      current[pageId] = allowed;
    }
    users[idx].page_access = current;
    this.setStorageItem(this.profilesKey, users);

    const actingUser = this.getCurrentUser();
    this.logActivity(
      actingUser?.id || 'admin',
      'Administração',
      'Editar Módulos de Acesso',
      `Acesso de ${users[idx].name} à página "${pageId}" alterado para ${allowed === null ? 'padrão do perfil' : (allowed ? 'liberado' : 'bloqueado')}.`
    );

    if (actingUser && actingUser.id === userId) {
      this.setStorageItem(this.currentUserKey, users[idx]);
    }

    if (!supabase) throw new Error('Sem conexão com o servidor.');
    const { error } = await supabase
      .from('profiles')
      .update({ page_access: current })
      .eq('id', userId);
    if (error) throw error;
  }

  // Restaura o override de acesso do usuário inteiro de uma vez (page_access = {}),
  // com um único UPDATE no Supabase. Evita a race condition de disparar N updates
  // paralelos (um por página) na mesma coluna JSON, cuja ordem de conclusão não é
  // garantida e podia deixar o remoto com um snapshot intermediário em vez de {}.
  public async resetAllPageAccess(userId: string): Promise<void> {
    const users = this.getStorageItem<Profile[]>(this.profilesKey, []);
    const idx = users.findIndex(u => u.id === userId);
    if (idx === -1) return;

    users[idx].page_access = {};
    this.setStorageItem(this.profilesKey, users);

    const actingUser = this.getCurrentUser();
    this.logActivity(
      actingUser?.id || 'admin',
      'Administração',
      'Editar Módulos de Acesso',
      `Acesso de ${users[idx].name} restaurado ao padrão do perfil em todas as páginas.`
    );

    if (actingUser && actingUser.id === userId) {
      this.setStorageItem(this.currentUserKey, users[idx]);
    }

    if (!supabase) throw new Error('Sem conexão com o servidor.');
    const { error } = await supabase
      .from('profiles')
      .update({ page_access: {} })
      .eq('id', userId);
    if (error) throw error;
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
      // O que separa o requisitante do solicitante: opera a fila coletiva —
      // vê e responde todas as solicitações abertas, não só as próprias.
      requisitante: [
        'materiais.visualizar',
        'solicitacoes.criar',
        'solicitacoes.visualizar_proprias',
        'solicitacoes.visualizar_todas',
        'solicitacoes.responder'
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
        'sap.fornecedores',
        'almoxarifado.visualizar'
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
        'sap.fornecedores',
        'almoxarifado.visualizar'
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
    // Cópia antes de ordenar: getStorageItem devolve a referência do cache em
    // memória, e um .sort() in-place corromperia a ordem original guardada lá.
    return [...this.getStorageItem<Sector[]>(this.sectorsKey, INITIAL_SECTORS)]
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
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
    const list = this.getStorageItem<CompradorInfo[]>(this.compradoresKey, [
      { grupo_compras: '314', nome_comprador: 'Comprador 314' },
      { grupo_compras: '358', nome_comprador: 'Comprador 358' },
      { grupo_compras: '447', nome_comprador: 'Comprador 447' },
      { grupo_compras: '575', nome_comprador: 'Comprador 575' },
      { grupo_compras: '602', nome_comprador: 'Jamille' },
      { grupo_compras: '610', nome_comprador: 'Giulia' }
    ]);
    let filteredList = list.filter(c => c.grupo_compras !== '588');
    if (!filteredList.some(c => c.grupo_compras === '602')) {
      filteredList.push({ grupo_compras: '602', nome_comprador: 'Jamille' });
    }
    if (!filteredList.some(c => c.grupo_compras === '610')) {
      filteredList.push({ grupo_compras: '610', nome_comprador: 'Giulia' });
    }
    if (filteredList.length !== list.length || !list.some(c => c.grupo_compras === '610')) {
      this.setStorageItem(this.compradoresKey, filteredList);
    }
    return filteredList;
  }

  // Pedidos de priorização feitos sobre itens de compra (Rastreio Compras),
  // todos os registros (histórico completo, não só o mais recente por RI).
  public getRastreioPrioridades(): RastreioPrioridade[] {
    return this.getStorageItem<RastreioPrioridade[]>(this.prioridadesKey, []);
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
  // `orderCol`: chave (idealmente única) usada para ordenar antes de paginar.
  // Sem ORDER BY o Postgres não garante ordem estável entre requests .range()
  // separados — em tabelas com mais de uma página (>1000 linhas) isso pode
  // pular ou repetir linhas entre uma página e outra. Passe a PK (ou coluna
  // única equivalente) sempre que a tabela tiver mais de ~1000 linhas.
  private async fetchAllFromTable<T>(
    table: string,
    selectCols: string = '*',
    pageSize = 1000,
    filterFn?: (query: any) => any,
    orderCol?: string
  ): Promise<T[]> {
    const allRows: T[] = [];
    let from = 0;
    while (true) {
      let query = supabase.from(table).select(selectCols);
      if (filterFn) {
        query = filterFn(query);
      }
      if (orderCol) {
        query = query.order(orderCol, { ascending: true });
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

  public async importMaterials(
    materials: Omit<Material, 'id' | 'is_active' | 'created_at'>[],
    filename?: string,
    onProgress?: (progress: number, message?: string) => void
  ): Promise<{ read: number; inserted: number; updated: number; deactivated: number; syncFailed: number }> {
    // Deduplica por material_code (última ocorrência prevalece)
    const dedupedMaterials = new Map<string, Omit<Material, 'id' | 'is_active' | 'created_at'>>();
    materials.forEach(m => {
      if (m.material_code) dedupedMaterials.set(m.material_code, m);
    });

    const itemsToImport = Array.from(dedupedMaterials.values());
    let inserted = 0;
    let updated = 0;
    let syncFailed = 0;

    const BATCH_SIZE = 2000;
    const totalBatches = Math.ceil(itemsToImport.length / BATCH_SIZE);

    for (let i = 0; i < itemsToImport.length; i += BATCH_SIZE) {
      const chunk = itemsToImport.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;

      if (onProgress) {
        const pct = Math.round((i / itemsToImport.length) * 85);
        onProgress(pct, `Importando materiais ZL0169 no Supabase (lote ${batchNum}/${totalBatches})...`);
      }

      try {
        const { data, error } = await supabase.rpc('importar_materiais_zl0169', {
          p_materiais: chunk
        });

        if (error) throw error;
        if (data) {
          inserted += Number(data.inseridos || 0);
          updated += Number(data.atualizados || 0);
        }
      } catch (rpcErr) {
        console.warn(`RPC importar_materiais_zl0169 falhou no lote ${batchNum}, tentando fallback direto via upsert:`, rpcErr);
        try {
          const fallbackBatch = chunk.map(m => ({
            id: 'm_' + Math.random().toString(36).substr(2, 9),
            material_code: m.material_code,
            description: m.description,
            technical_text: m.technical_text || null,
            category: m.category || getAutoCategory(m.description),
            company: m.company || 'TEN2',
            unit: m.unit || 'UN',
            is_active: true,
            created_at: new Date().toISOString()
          }));
          const { error: upsertErr } = await supabase.from('materials').upsert(fallbackBatch, { onConflict: 'material_code' });
          if (upsertErr) throw upsertErr;
          updated += chunk.length;
        } catch (err) {
          syncFailed += chunk.length;
          console.error(`Falha ao sincronizar lote de materiais ZL0169 com o Supabase:`, err);
        }
      }
    }

    if (onProgress) {
      onProgress(92, 'Sincronizando cache local e versão do dataset...');
    }

    // Atualiza cache local parcial se houver itens no localStorage
    try {
      const localMaterials = this.getStorageItem<Material[]>(this.materialsKey, []);
      if (localMaterials && localMaterials.length > 0) {
        const itemMap = new Map(itemsToImport.map(it => [it.material_code, it]));
        const nextLocal = localMaterials.map(m => {
          const incoming = itemMap.get(m.material_code);
          if (incoming) {
            return {
              ...m,
              description: incoming.description,
              technical_text: incoming.technical_text || m.technical_text,
              category: incoming.category || m.category,
              company: incoming.company || m.company,
              unit: incoming.unit || m.unit,
              is_active: true
            };
          }
          return m;
        });
        this.setStorageItem(this.materialsKey, nextLocal);
      }
    } catch (err) {
      console.warn('Não foi possível atualizar o cache local de materiais:', err);
    }

    // Incrementa a versão do dataset para que os demais clientes rebaixem o catálogo
    await this.bumpDatasetVersion('materials', itemsToImport.length);

    const user = this.getCurrentUser();
    this.logActivity(
      user?.id || 'admin',
      'Catálogo SAP',
      'Importar ZL0169',
      `Importou ZL0169 (${filename || 'planilha'}). Lidos: ${materials.length}, Inseridos: ${inserted}, Atualizados: ${updated}, Falhas de sync: ${syncFailed}.`
    );

    if (onProgress) {
      onProgress(100, 'Importação ZL0169 concluída com sucesso!');
    }

    return { read: materials.length, inserted, updated, deactivated: 0, syncFailed };
  }

  /**
   * Importação de Textos Técnicos / Longos do SAP (Transação ZL0162).
   * Vincula pelo código do material na tabela materials e atualiza a coluna technical_text.
   */
  public async importZL0162(
    items: { material_code: string; technical_text: string; description?: string }[],
    filename?: string,
    onProgress?: (progress: number, message?: string) => void
  ): Promise<{ read: number; updated: number; notFound: number; syncFailed: number }> {
    const user = this.getCurrentUser();
    let updated = 0;
    let notFound = 0;
    let syncFailed = 0;

    // Deduplica por material_code preservando o último texto não vazio
    const dedupedMap = new Map<string, { material_code: string; technical_text: string }>();
    items.forEach(it => {
      const code = String(it.material_code || '').trim();
      const tech = String(it.technical_text || '').trim();
      if (!code) return;
      if (!dedupedMap.has(code) || tech) {
        dedupedMap.set(code, { material_code: code, technical_text: tech });
      }
    });

    const itemsToUpdate = Array.from(dedupedMap.values());
    const BATCH_SIZE = 2000;
    const totalBatches = Math.ceil(itemsToUpdate.length / BATCH_SIZE);

    for (let i = 0; i < itemsToUpdate.length; i += BATCH_SIZE) {
      const batch = itemsToUpdate.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;

      if (onProgress) {
        const pct = Math.round((i / itemsToUpdate.length) * 88);
        onProgress(pct, `Atualizando textos técnicos ZL0162 no Supabase (lote ${batchNum}/${totalBatches})...`);
      }

      try {
        const { data, error } = await supabase.rpc('atualizar_textos_tecnicos_zl0162', {
          p_itens: batch
        });

        if (error) throw error;
        if (data) {
          updated += Number(data.atualizados || 0);
          notFound += Number(data.nao_encontrados || 0);
        }
      } catch (err) {
        console.error(`Erro ao atualizar lote ${batchNum} da ZL0162 no Supabase:`, err);
        syncFailed += batch.length;
      }
    }

    if (onProgress) {
      onProgress(94, 'Sincronizando cache local e versão do dataset...');
    }

    // Atualiza cache local se houver
    try {
      const localMaterials = this.getStorageItem<Material[]>(this.materialsKey, []);
      if (localMaterials && localMaterials.length > 0) {
        const itemMap = new Map(itemsToUpdate.map(it => [it.material_code, it.technical_text]));
        let localUpdated = 0;
        const nextLocal = localMaterials.map(m => {
          if (itemMap.has(m.material_code)) {
            localUpdated++;
            return {
              ...m,
              technical_text: itemMap.get(m.material_code) || m.technical_text
            };
          }
          return m;
        });
        if (localUpdated > 0) {
          this.setStorageItem(this.materialsKey, nextLocal);
        }
      }
    } catch (e) {
      console.warn('Erro ao atualizar cache local de materiais para ZL0162:', e);
    }

    // Incrementa versão do dataset
    try {
      await this.bumpDatasetVersion('materials');
    } catch (e) {
      console.warn('Falha ao atualizar dataset_version para materials:', e);
    }

    // Registra log de auditoria
    this.logActivity(
      user?.id || 'admin',
      'Catálogo SAP',
      'Importar ZL0162',
      `Importou ZL0162 (${filename || 'planilha'}). Lidos: ${items.length}, Atualizados no catálogo: ${updated}, Não encontrados: ${notFound}, Falhas de sync: ${syncFailed}.`
    );

    if (onProgress) {
      onProgress(100, 'Atualização de textos técnicos (ZL0162) concluída!');
    }

    return { read: items.length, updated, notFound, syncFailed };
  }

  /**
   * Obtém os maiores códigos de material cadastrados no Supabase para as 2 faixas
   * do SAP (padrão de 7 dígitos e longo de 18 dígitos iniciados em 100000),
   * além do total de itens e última inclusão.
   */
  public async getCatalogCodeStats(): Promise<{
    maxStandard7d: string | null;
    maxLong18d: string | null;
    totalMaterials: number;
    lastCreatedAt: string | null;
  }> {
    try {
      const { data, error } = await supabase.rpc('obter_maiores_codigos_catalogo');
      if (!error && data) {
        return {
          maxStandard7d: data.max_padrao_7d || null,
          maxLong18d: data.max_longo_18d || null,
          totalMaterials: data.total_materiais || 0,
          lastCreatedAt: data.ultimo_cadastro || null,
        };
      }
      if (error) {
        console.warn('RPC obter_maiores_codigos_catalogo retornou erro, usando fallback direto:', error);
      }
    } catch (err) {
      console.warn('Falha ao chamar RPC obter_maiores_codigos_catalogo; usando fallback:', err);
    }

    // Fallback caso a RPC não esteja disponível
    try {
      const [standardRes, longRes, countRes] = await Promise.all([
        supabase
          .from('materials')
          .select('material_code')
          .gte('material_code', '1000000')
          .lt('material_code', '2000000')
          .order('material_code', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('materials')
          .select('material_code')
          .gte('material_code', '100000000000000000')
          .like('material_code', '100000%')
          .order('material_code', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('materials')
          .select('id', { count: 'exact', head: true }),
      ]);

      return {
        maxStandard7d: standardRes.data?.material_code || null,
        maxLong18d: longRes.data?.material_code || null,
        totalMaterials: countRes.count || 0,
        lastCreatedAt: null,
      };
    } catch (err) {
      console.error('Erro no fallback de estatísticas de códigos do catálogo:', err);
      return {
        maxStandard7d: null,
        maxLong18d: null,
        totalMaterials: 0,
        lastCreatedAt: null,
      };
    }
  }

  // Notifications
  public notifyAndreNewUser(userName: string, userEmail: string): void {
    const profiles = this.getProfiles();
    // Procura por perfis correspondentes a André (por nome ou email)
    const andreUsers = profiles.filter(
      u => u.name.toLowerCase().includes('andre') || u.email.toLowerCase().includes('andre')
    );
    
    // Se não encontrar perfil específico com 'andre', notifica usuários admin como fallback
    const targets = andreUsers.length > 0 ? andreUsers : profiles.filter(u => u.roles.includes('admin'));
    const uniqueIds = Array.from(new Set(targets.map(u => u.id)));

    uniqueIds.forEach(userId => {
      this.createNotification(
        userId,
        'Novo Cadastro no Sistema',
        `O usuário ${userName} (${userEmail}) realizou um novo cadastro no sistema e aguarda aprovação.`,
        'info'
      );
    });
  }

  // Destinatários de notificação de Cadastro SAP: role coordenador_suprimentos/
  // comprador (regra atual) somado aos usuários marcados manualmente como
  // aprovador de Cadastro SAP — aditivo, deduplicado por id.
  private getCadastroSapNotificationRecipients(): Profile[] {
    const all = this.getProfiles();
    const byId = new Map<string, Profile>();
    all
      .filter(u => u.roles.includes('coordenador_suprimentos') || u.roles.includes('comprador') || u.aprovador_cadastro_sap || canAccessPage(u, 'sup_cadastros_sap'))
      .forEach(u => byId.set(u.id, u));
    return Array.from(byId.values());
  }

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

    if (supabase) {
      supabase.from('notifications').insert([{
        id: newNotif.id,
        user_id: newNotif.user_id,
        title: newNotif.title,
        description: newNotif.description,
        type: newNotif.type,
        is_read: newNotif.is_read,
        request_id: newNotif.request_id || null,
        request_number: newNotif.request_number || null,
        created_at: newNotif.created_at
      }]).then(({ error }) => {
        if (error) console.error('Falha ao persistir notificação no Supabase:', error);
      }).catch(err => console.error('Erro ao inserir notificação no Supabase:', err));
    }
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
        catch (e) { console.error('Falha ao marcar notificação como lida no Supabase:', e); }
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
  //
  // `contextKey` é um identificador livre (sem FK) usado por notificações que
  // não se referem a uma linha de `requests` — ex.: mensagens do Rastreio
  // Compras. NÃO usar `request_id` para isso: a coluna tem foreign key para
  // requests(id) e o insert falha (violação de FK) para qualquer valor que
  // não seja um id real de requests. Essa falha é assíncrona e não lança na
  // UI, então passou despercebida até ser diagnosticada via banco.
  private async insertNotifications(
    userIds: string[], title: string, description: string,
    type: Notification['type'], contextKey: string, reqNo?: string
  ): Promise<void> {
    if (!supabase || userIds.length === 0) return;
    const rows = userIds.map(uid => ({
      id: 'n_' + Math.random().toString(36).substr(2, 9),
      user_id: uid,
      title,
      description,
      type,
      is_read: false,
      request_id: null,
      context_key: contextKey,
      request_number: reqNo ?? null,
      created_at: new Date().toISOString(),
    }));
    const { error } = await supabase.from('notifications').insert(rows);
    if (error) console.error('Falha ao inserir notificações de mensagem (Rastreio Compras):', error);
  }

  // Resolve o(s) comprador(es) responsável(is) por um grupo de compras SAP,
  // unindo todas as fontes disponíveis (mais robusto que depender de uma só):
  //  1) cadastro de compradores (compradores.grupo_compras -> email -> profile);
  //  2) grupo de compras atribuído direto ao perfil (Admin > Usuários);
  //  3) fallback: associação manual comprador <-> grupo (tela Grupos Comprador),
  //     usada só se as duas primeiras fontes não encontrarem ninguém.
  // Reutilizado tanto para notificar mensagens quanto pedidos de prioridade.
  private resolveCompradorIdsForGrupo(grupoComprador: string, excludeId?: string): string[] {
    const set = new Set<string>();
    const profiles = this.getProfiles();

    const emailsPorGrupo = this.getCompradores()
      .filter(c => c.grupo_compras === grupoComprador && c.email)
      .map(c => (c.email as string).trim().toLowerCase());
    profiles
      .filter(p => emailsPorGrupo.includes((p.email || '').trim().toLowerCase()))
      .forEach(p => set.add(p.id));

    profiles
      .filter(p => (p.grupo_compras || '').trim() === grupoComprador)
      .forEach(p => set.add(p.id));

    if (set.size === 0) {
      this.getBuyerGroups()
        .filter(bg => bg.group_code === grupoComprador)
        .forEach(bg => { if (bg.user_id) set.add(bg.user_id); });
    }

    const ativos = new Set(profiles.filter(p => p.status === 'ativo').map(p => p.id));
    return Array.from(set).filter(id => ativos.has(id) && id !== excludeId);
  }

  // Resolve os destinatários da notificação de uma nova mensagem:
  //  - todos os outros participantes que já escreveram na thread; e
  //  - se o autor não é comprador e nenhum comprador participou ainda, o(s)
  //    comprador(es) responsável(is) pelo grupo do item (ver
  //    resolveCompradorIdsForGrupo).
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
      this.resolveCompradorIdsForGrupo(grupoComprador, autorId).forEach(id => set.add(id));
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
    // Só a role 'comprador' de fato representa o comprador responsável por um
    // grupo. 'admin' e 'coordenador_suprimentos' não devem pular o roteamento
    // por grupo: um admin escrevendo a primeira mensagem em um item ainda
    // precisa notificar o comprador responsável pelo grupo daquele item.
    const autorEhComprador = user.roles.includes('comprador');
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
    this.insertNotifications(recipients, title, desc, 'info', `${this.RASTREIO_NOTIF_PREFIX}${ri}`, ctx.rm)
      .catch(err => console.error('Falha ao notificar destinatários da mensagem:', err));

    return row;
  }

  // Registra um pedido de priorização sobre um item (RI), na escala de
  // criticidade 1-5, e notifica o(s) comprador(es) responsável(is) pelo
  // grupo do item. Mantém histórico — cada chamada cria um novo registro,
  // permitindo reforçar/escalar a prioridade ao longo do tempo.
  public async setRastreioPrioridade(
    ri: string, rm: string | undefined, nivel: number, grupoComprador?: string
  ): Promise<RastreioPrioridade> {
    if (!supabase) throw new Error('Sem conexão com o servidor.');
    const user = this.getCurrentUser();
    if (!user) throw new Error('Usuário não autenticado.');
    if (!Number.isInteger(nivel) || nivel < 1 || nivel > 5) throw new Error('Nível de prioridade inválido.');

    const row: RastreioPrioridade = {
      id: 'rp_' + Math.random().toString(36).substr(2, 9),
      ri, rm,
      nivel,
      solicitante_id: user.id,
      solicitante_nome: user.name,
      created_at: new Date().toISOString(),
    };

    const { error } = await supabase.from('rastreio_prioridades').insert({
      id: row.id, ri: row.ri, rm: row.rm ?? null, nivel: row.nivel,
      solicitante_id: row.solicitante_id, solicitante_nome: row.solicitante_nome,
      created_at: row.created_at,
    });
    if (error) throw error;

    // Atualiza o cache local imediatamente, sem esperar o próximo sync — assim
    // a tela Itens Sem PO já reflete o pedido recém-feito.
    const cached = this.getRastreioPrioridades();
    cached.push(row);
    this.setStorageItem(this.prioridadesKey, cached);

    // Notifica o(s) comprador(es) responsável(is) pelo grupo do item.
    if (grupoComprador) {
      const recipients = this.resolveCompradorIdsForGrupo(grupoComprador, user.id);
      const meta = priorityMeta(nivel);
      const title = `Prioridade solicitada — RM ${rm || ri}: Grau ${nivel}`;
      const desc = `${user.name} pediu prioridade Grau ${nivel} (${meta.label})`;
      this.insertNotifications(recipients, title, desc, nivel >= 4 ? 'alert' : 'info', `${this.RASTREIO_NOTIF_PREFIX}${ri}`, rm)
        .catch(err => console.error('Falha ao notificar comprador sobre prioridade:', err));
    }

    return row;
  }

  // Conjunto de `ri` com mensagens não lidas para o usuário (a partir das
  // notificações locais marcadas como rastreio: e não lidas).
  public getUnreadRastreioRis(userId: string): Set<string> {
    const prefix = this.RASTREIO_NOTIF_PREFIX;
    const ris = this.getStorageItem<Notification[]>(this.notificationsKey, [])
      .filter(n => n.user_id === userId && !n.is_read && (n.context_key || '').startsWith(prefix))
      .map(n => (n.context_key || '').slice(prefix.length));
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
      if (n.user_id === userId && !n.is_read && n.context_key === target) {
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
  /**
   * Gera o número via RPC atômica (`proximo_numero_solicitacao`) — um simples
   * incremento local, por mais que fosse sincronizado com `sequences` na
   * entrada, colidia sempre que dois clientes geravam o "próximo" número a
   * partir do mesmo valor-base: o segundo a publicar batia em
   * `requests_number_key` (23505) e a solicitação ficava presa só localmente.
   * Sem Supabase (modo offline/demo), cai no incremento local antigo, que
   * nesse caso não tem concorrência real para colidir.
   */
  private async generateRequestNumber(criticality: number): Promise<string> {
    if (supabase) {
      const { data, error } = await supabase.rpc('proximo_numero_solicitacao', { p_criticidade: criticality });
      if (!error && typeof data === 'string') return data;
      console.error('Falha ao gerar número da solicitação via RPC; usando contador local.', error);
    }

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

  public async addRequestComment(reqId: string, content: string, isInternal: boolean): Promise<void> {
    const user = this.getCurrentUser();
    if (!user) return;

    const comments = this.getStorageItem<RequestComment[]>(this.commentsKey, []);
    const newComment: RequestComment = {
      id: 'c_' + gerarUUID(),
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

    await this.publishChildRow('request_comments', newComment);

    // If it's helpdesk and in "aguardando_solicitante", receiving a comment from the solicitante re-activates it
    const requests = this.getRequests();
    const reqIdx = requests.findIndex(r => r.id === reqId);
    if (reqIdx !== -1 && requests[reqIdx].type === 'chamado' && requests[reqIdx].status === 'aguardando_solicitante') {
      const solicitante = requests[reqIdx].solicitante_id;
      if (user.id === solicitante) {
        const reactivated = await this.transitionRequestStatus(reqId, 'em_atendimento', 'Solicitante respondeu ao chamado, SLA retomado.');
        if (!reactivated) console.error(`Falha ao reativar SLA do chamado #${requests[reqIdx].number} após resposta do solicitante.`);
      }
    }
  }

  /**
   * Assíncrona porque, além de gravar no cache local, publica a solicitação no
   * Supabase — sem isso o anexo subiria para um servidor onde a solicitação-pai
   * não existe, e ninguém além do autor veria a imagem. Rascunho não sobe: é
   * privado de quem está preenchendo.
   *
   * Falha de rede não derruba a criação: a solicitação continua válida no cache
   * local e o sync por merge (`syncMergedTable`) garante que ela não seja
   * apagada por não existir no servidor.
   */
  public async submitRequest(
    draft: Partial<Request> & { items?: Omit<RequestItem, 'id' | 'request_id'>[] },
    isDraft: boolean
  ): Promise<Request> {
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
        number = await this.generateRequestNumber(draft.criticality || prev.criticality || 1);
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
      const number = isDraft ? 'draft_' + Math.random().toString(36).substr(2, 6) : await this.generateRequestNumber(draft.criticality || 1);

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
        brand: draft.brand,
        suggested_supplier: draft.suggested_supplier,
        representante_nome: draft.representante_nome,
        representante_cargo: draft.representante_cargo,
        representante_telefone: draft.representante_telefone,
        representante_email: draft.representante_email,
        contrato_tipo: draft.contrato_tipo,
        fornecedor_terceiro: draft.fornecedor_terceiro,
        titulo: draft.titulo,
        paused_minutes: 0
      } as Request;

      requests.push(request);
    }

    this.setStorageItem(this.requestsKey, requests);

    // Re-create items if provided
    if (draft.items) {
      // Filter out items of this request
      const filteredItems = allItems.filter(item => item.request_id !== request.id);

      // O id do item precisa ser estável: os anexos apontam para ele
      // (`request_attachments.request_item_id`), e derivá-lo do índice fazia o
      // vínculo escorregar sempre que um item era removido ou reordenado numa
      // edição. Item que já tem id conserva o seu; item novo ganha um próprio.
      const newItems = draft.items.map(item => ({
        ...item,
        id: (item as Partial<RequestItem>).id || novoItemId(),
        request_id: request.id
      })) as RequestItem[];

      this.setStorageItem(this.requestItemsKey, [...filteredItems, ...newItems]);
    }

    // Status History log if not rascunho
    if (!isDraft) {
      this.logStatusChange(request.id, 'rascunho', status, user.id, user.name, 'Solicitação criada no sistema.');
      this.logActivity(user.id, 'Solicitações', 'Criar Solicitação', `Criou a solicitação #${request.number} (${request.type}).`);

      // Publica a solicitação no Supabase ANTES de notificar: notifications.request_id
      // tem FK para requests(id), e disparar a notificação antes da solicitação
      // existir no banco faz o insert falhar (silenciosamente, só um console.warn),
      // deixando quem deveria ser avisado sem notificação nenhuma.
      await this.publishRequest(request);

      // Trigger approvals notification
      if (request.type === 'compra') {
        // Find users assigned as approvers of the applicant's sector
        const allUsers = this.getProfiles();
        const sectorManagers = allUsers.filter(u => u.aprovador_setores?.includes(request.solicitante_sector_id));

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
        // Send to Suprimentos (por role) + usuários marcados como aprovador de Cadastro SAP
        this.getCadastroSapNotificationRecipients().forEach(cc => {
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
        // Setor Jurídico: além do atendente do setor (se houver), notifica
        // quem o admin marcou em Módulos de Acesso — o time jurídico não
        // necessariamente tem sector_id/role 'atendente' configurado.
        const destino = this.getSectors().find(s => s.id === request.target_sector_id);
        const recipients = new Map<string, Profile>();
        this.getProfiles()
          .filter(u => u.sector_id === request.target_sector_id && u.roles.includes('atendente'))
          .forEach(u => recipients.set(u.id, u));
        if (destino?.name === NOME_SETOR_JURIDICO) {
          this.getProfiles()
            .filter(u => canAccessPage(u, 'juridico_notificar'))
            .forEach(u => recipients.set(u.id, u));
        }
        recipients.forEach(att => {
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

  /**
   * Publica a solicitação e seus itens no Supabase.
   *
   * As demais mutações do motor (status, atendente, comentários, avaliação)
   * seguem locais por enquanto — migrá-las é trabalho próprio. Na prática isso
   * significa que outro usuário vê a solicitação e os anexos, mas não vê as
   * mudanças de status feitas por terceiros.
   */
  /**
   * Salva a edição de uma solicitação feita pelo próprio autor.
   *
   * Método próprio em vez de mais um modo no `submitRequest`: a edição tem
   * efeitos que a criação não tem — devolver a solicitação para aprovação,
   * perder o atendente, reconciliar itens e avisar quem já estava trabalhando
   * nela. Misturar os dois tornaria ambos difíceis de ler.
   *
   * @param novoStatus Para onde a solicitação volta (ver `statusAposEdicao`).
   * @returns Erro em texto quando a edição é recusada; null em caso de sucesso.
   */
  public async saveRequestEdit(
    reqId: string,
    campos: Partial<Request>,
    itens: (Omit<RequestItem, 'request_id'> & { id?: string })[] | undefined,
    novoStatus: RequestStatus
  ): Promise<string | null> {
    const user = this.getCurrentUser();
    if (!user) return 'Não autenticado.';

    const requests = this.getRequests();
    const idx = requests.findIndex(r => r.id === reqId);
    if (idx === -1) return 'Solicitação não encontrada.';

    const anterior = requests[idx];
    if (anterior.solicitante_id !== user.id) return 'Apenas quem abriu a solicitação pode editá-la.';

    const statusAnterior = anterior.status;

    const atualizada: Request = {
      ...anterior,
      ...campos,
      status: novoStatus,
      updated_at: new Date().toISOString(),
    };

    // Voltando para a fila, quem atendia não está mais designado — senão a
    // solicitação reapareceria como "em atendimento" por alguém que já
    // encerrou a participação dela.
    if (novoStatus === 'aberto') {
      atualizada.atendente_id = undefined;
      atualizada.atendente_name = undefined;
    }

    requests[idx] = atualizada;
    this.setStorageItem(this.requestsKey, requests);

    if (itens) await this.reconciliarItens(atualizada, itens);

    await this.publishRequestRow(atualizada);
    await this.logStatusChange(
      reqId, statusAnterior, novoStatus, user.id, user.name,
      'Solicitação editada pelo solicitante.'
    );
    this.logActivity(user.id, 'Solicitações', 'Editar Solicitação', `Editou a solicitação #${atualizada.number}.`);

    // Editar depois de aprovada desfaz a aprovação, e o comprador pode já ter
    // trabalhado nela. Sem este aviso, esse trabalho evaporaria em silêncio.
    if (statusAnterior === 'aprovada') {
      const destinatarios = this.getProfiles().filter(u =>
        u.aprovador_setores?.includes(atualizada.solicitante_sector_id) ||
        u.id === atualizada.comprador_id
      );
      destinatarios.forEach(d => this.createNotification(
        d.id,
        `Solicitação aprovada foi editada: #${atualizada.number}`,
        `${atualizada.solicitante_name} editou a solicitação e ela voltou para aprovação. Confira o que mudou antes de seguir.`,
        'alert',
        atualizada.id,
        atualizada.number
      ));
    } else if (novoStatus === 'pendente') {
      const gestores = this.getProfiles().filter(u =>
        u.aprovador_setores?.includes(atualizada.solicitante_sector_id)
      );
      gestores.forEach(g => this.createNotification(
        g.id,
        `Solicitação editada aguarda aprovação: #${atualizada.number}`,
        `${atualizada.solicitante_name} editou a solicitação #${atualizada.number}, que voltou para sua análise.`,
        atualizada.criticality >= 4 ? 'critical' : 'info',
        atualizada.id,
        atualizada.number
      ));
    } else if (atualizada.type === 'cadastro_sap' && novoStatus === 'aberto') {
      this.getCadastroSapNotificationRecipients().forEach(r => this.createNotification(
        r.id,
        `Cadastro SAP editado aguarda atendimento: #${atualizada.number}`,
        `${atualizada.solicitante_name} editou a solicitação de Cadastro SAP #${atualizada.number}, que voltou para a fila.`,
        atualizada.criticality >= 4 ? 'alert' : 'info',
        atualizada.id,
        atualizada.number
      ));
    }

    this.notifyListeners();
    return null;
  }

  /**
   * Reconcilia os itens de uma solicitação editada, por id.
   *
   * Os anexos de um item removido não são apagados: passam para o nível da
   * solicitação (`request_item_id = null`). Nada se perde, nada fica apontando
   * para item inexistente, e não é preciso policy de DELETE no Storage.
   */
  private async reconciliarItens(
    request: Request,
    itens: (Omit<RequestItem, 'request_id'> & { id?: string })[]
  ): Promise<void> {
    const todos = this.getStorageItem<RequestItem[]>(this.requestItemsKey, []);
    const anteriores = todos.filter(i => i.request_id === request.id);

    const finais = itens.map(i => ({
      ...i,
      id: i.id || novoItemId(),
      request_id: request.id,
    })) as RequestItem[];

    const idsFinais = new Set(finais.map(i => i.id));
    const removidos = anteriores.filter(i => !idsFinais.has(i.id));

    this.setStorageItem(this.requestItemsKey, [
      ...todos.filter(i => i.request_id !== request.id),
      ...finais,
    ]);

    // Anexos dos itens removidos sobem para o nível da solicitação.
    if (removidos.length > 0) {
      const idsRemovidos = new Set(removidos.map(i => i.id));
      const anexos = this.getStorageItem<RequestAttachment[]>(this.attachmentsKey, []);
      const reapontados = anexos.map(a =>
        a.request_item_id && idsRemovidos.has(a.request_item_id)
          ? { ...a, request_item_id: undefined }
          : a
      );
      this.setStorageItem(this.attachmentsKey, reapontados);

      if (supabase) {
        try {
          await supabase.from('request_attachments')
            .update({ request_item_id: null })
            .in('request_item_id', [...idsRemovidos]);
          // `publishRequest` só faz upsert; sem este delete o item removido
          // continuaria vivo no servidor e voltaria no próximo sync.
          await supabase.from('request_items').delete().in('id', [...idsRemovidos]);
        } catch (err) {
          console.error('Falha ao remover itens da solicitação no Supabase.', err);
        }
      }
    }

    if (supabase && finais.length > 0) {
      try {
        const { error } = await supabase.from('request_items').upsert(finais, { onConflict: 'id' });
        if (error) throw error;
      } catch (err) {
        console.error('Falha ao publicar os itens da solicitação no Supabase.', err);
      }
    }
  }

  /**
   * Publica só a linha da solicitação, sem os itens — é o que as mutações de
   * status e atendente precisam, e evita reescrever os itens a cada transição.
   *
   * Sanear os campos aqui é obrigatório: as colunas de data no Postgres não
   * aceitam a string vazia que o formulário entrega quando o campo não se
   * aplica, e `solicitante_id`/`comprador_id`/`atendente_id` têm FK para
   * `profiles` — o seletor de comprador cai no código do grupo de compras
   * (ex.: "314") quando o grupo não tem usuário vinculado, e código de grupo
   * não é id de perfil.
   */
  private sanitizeRequestRow(request: Request): Record<string, unknown> {
    const row: Record<string, unknown> = { ...request };
    for (const campo of ['data_necessidade', 'first_response_at', 'resolved_at', 'last_paused_at']) {
      if (row[campo] === '') row[campo] = null;
    }

    const idsDePerfil = new Set(this.getProfiles().map(p => p.id));
    for (const campo of ['solicitante_id', 'comprador_id', 'atendente_id']) {
      if (row[campo] && !idsDePerfil.has(row[campo] as string)) {
        // Não é necessariamente um id inválido: pode ser só o cache local de perfis
        // desatualizado (usuário criado recentemente, sync ainda não rodou). Zerar
        // sem avisar faz o campo sumir silenciosamente do Supabase mesmo quando o
        // valor selecionado na tela era válido — loga para dar visibilidade.
        console.warn(`sanitizeRequestRow: ${campo}="${row[campo]}" não está no cache local de perfis; campo será enviado como null.`);
        row[campo] = null;
      }
    }
    return row;
  }

  private async publishRequestRow(request: Request): Promise<boolean> {
    if (!supabase) return false;

    try {
      const { error } = await supabase.from('requests').upsert(this.sanitizeRequestRow(request), { onConflict: 'id' });
      if (error) throw error;
      return true;
    } catch (err: any) {
      // 23505 em requests_number_key: sobra de um número gerado localmente (modo
      // offline, ou de antes da RPC atômica existir) que colidiu com uma
      // solicitação já publicada por outra sessão. Gera um número novo e tenta
      // de novo uma vez — sem isso a solicitação fica presa localmente para
      // sempre, e toda ação que depende dela publicada primeiro (ex.: anexos)
      // falha para sempre junto.
      if (err?.code === '23505' && String(err?.message || '').includes('requests_number_key')) {
        try {
          const novoNumero = await this.generateRequestNumber(request.criticality || 1);
          request.number = novoNumero;
          const requests = this.getStorageItem<Request[]>(this.requestsKey, []);
          const idx = requests.findIndex(r => r.id === request.id);
          if (idx !== -1) { requests[idx].number = novoNumero; this.setStorageItem(this.requestsKey, requests); }

          const { error: retryErr } = await supabase.from('requests').upsert(this.sanitizeRequestRow(request), { onConflict: 'id' });
          if (retryErr) throw retryErr;
          this.notifyListeners();
          return true;
        } catch (retryErr) {
          console.error(`Falha ao publicar a solicitação #${request.number} no Supabase mesmo após renumerar.`, retryErr);
          return false;
        }
      }

      console.error(`Falha ao publicar a solicitação #${request.number} no Supabase.`, err);
      return false;
    }
  }

  private async publishRequest(request: Request): Promise<boolean> {
    if (!supabase) return false;

    try {
      if (!(await this.publishRequestRow(request))) return false;

      const itens = this.getStorageItem<RequestItem[]>(this.requestItemsKey, [])
        .filter(i => i.request_id === request.id);

      if (itens.length > 0) {
        const { error: itensErr } = await supabase
          .from('request_items')
          .upsert(itens, { onConflict: 'id' });
        if (itensErr) throw itensErr;
      }

      return true;
    } catch (err) {
      console.error(`Falha ao publicar a solicitação #${request.number} no Supabase.`, err);
      return false;
    }
  }

  /**
   * Assíncrona porque publica a transição no Supabase: sem isso, o gestor
   * aprova e ninguém mais fica sabendo — cada usuário veria um status diferente
   * da mesma solicitação. Ver o design da página Solicitações.
   */
  public async transitionRequestStatus(reqId: string, toStatus: RequestStatus, comment?: string): Promise<boolean> {
    const user = this.getCurrentUser();
    if (!user) return false;

    const requests = this.getRequests();
    const idx = requests.findIndex(r => r.id === reqId);
    if (idx === -1) return false;

    const request = requests[idx];
    const fromStatus = request.status;
    const prevUpdatedAt = request.updated_at;
    const prevFirstResponseAt = request.first_response_at;
    const prevResolvedAt = request.resolved_at;

    request.status = toStatus;
    request.updated_at = new Date().toISOString();

    if (toStatus === 'em_atendimento' && !request.first_response_at) {
      request.first_response_at = new Date().toISOString();
    }

    if (toStatus === 'resolvido') {
      request.resolved_at = new Date().toISOString();
    }

    this.setStorageItem(this.requestsKey, requests);

    const published = await this.publishRequestRow(request);
    if (!published) {
      // Reverte o cache local: sem isso o autor da ação veria o novo status
      // enquanto o Supabase (fonte de verdade para os demais usuários) manteve o antigo.
      const revertRequests = this.getRequests();
      const revertIdx = revertRequests.findIndex(r => r.id === reqId);
      if (revertIdx !== -1) {
        revertRequests[revertIdx].status = fromStatus;
        revertRequests[revertIdx].updated_at = prevUpdatedAt;
        revertRequests[revertIdx].first_response_at = prevFirstResponseAt;
        revertRequests[revertIdx].resolved_at = prevResolvedAt;
        this.setStorageItem(this.requestsKey, revertRequests);
      }
      return false;
    }

    await this.logStatusChange(reqId, fromStatus, toStatus, user.id, user.name, comment);
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

    return true;
  }

  private async logStatusChange(
    reqId: string, from_status: RequestStatus, to_status: RequestStatus,
    userId: string, userName: string, comment?: string
  ): Promise<void> {
    const history = this.getStorageItem<RequestStatusHistory[]>(this.historyKey, []);
    const registro: RequestStatusHistory = {
      id: 'h_' + gerarUUID(),
      request_id: reqId,
      from_status,
      to_status,
      user_id: userId,
      user_name: userName,
      comment,
      created_at: new Date().toISOString()
    };
    history.push(registro);
    this.setStorageItem(this.historyKey, history);

    await this.publishChildRow('request_status_history', registro);
  }

  /**
   * Publica uma linha filha de solicitação (histórico ou comentário).
   *
   * Nenhuma das duas tabelas tem FK, então a linha sobe mesmo que a
   * solicitação-pai ainda não tenha subido. Falha de rede é registrada e não
   * desfaz a escrita local: o sync por merge preserva a linha no cache.
   */
  private async publishChildRow(
    tabela: 'request_status_history' | 'request_comments',
    row: RequestStatusHistory | RequestComment
  ): Promise<void> {
    if (!supabase) return;

    try {
      const { error } = await supabase.from(tabela).insert(row);
      if (error) throw error;
    } catch (err) {
      console.error(`Falha ao publicar em "${tabela}" no Supabase.`, err);
    }
  }

  public async assignAtendente(reqId: string, atendenteId: string, name: string): Promise<void> {
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

      await this.publishRequestRow(requests[idx]);
      await this.logStatusChange(reqId, 'aberto', 'em_atendimento', atendenteId, name, 'Atendimento assumido pelo profissional.');
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
      eflag_e: p.eflag_e || p.campos_extras?.eflag_e || '',
    };
  }

  private normalizePedidoFornRow(p: any): PedidoForn {
    const fornecedor_codigo = p.fornecedor_codigo || p.cod_forn || '';
    const cnpj_fornecedor = p.cnpj_fornecedor || p.cnpj || '';
    const fornecedor_name = p.fornecedor_name || p.fornecedor || '';
    const preco_liquido = p.preco_liquido !== undefined && p.preco_liquido !== null
      ? Number(p.preco_liquido)
      : (p.preco_liquido_unit !== undefined && p.preco_liquido_unit !== null
         ? Number(p.preco_liquido_unit)
         : Number(p.valor_liquido || 0));
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
      eflag_e: p.eflag_e || p.campos_extras?.eflag_e || '',
      
      // Campos antigos para retrocompatibilidade
      cod_forn: fornecedor_codigo,
      cnpj: cnpj_fornecedor,
      fornecedor: fornecedor_name
    };
  }

  public getPedidos(): SAPPedido[] {
    const raw = this.getStorageItem<any[]>(this.pedidosKey, []);
    const rawPedsForn = this.getStorageItem<any[]>(this.pedidosFornKey, []);
    const eliminatedSet = new Set<string>();

    rawPedsForn.forEach(pf => {
      const eflag = String(pf.eflag_e || pf.campos_extras?.eflag_e || pf['E'] || pf['E.'] || '').trim().toUpperCase();
      if (eflag === 'L') {
        if (pf.ri) eliminatedSet.add(String(pf.ri).trim());
        if (pf.doc_compra) eliminatedSet.add(String(pf.doc_compra).trim());
        if (pf.documento_compra) eliminatedSet.add(String(pf.documento_compra).trim());
      }
    });

    return raw
      .map(p => this.normalizePedidoRow(p))
      .filter(p => {
        const eflag = String(p.eflag_e || p.campos_extras?.eflag_e || '').trim().toUpperCase();
        if (eflag === 'L') return false;
        if (p.ri && eliminatedSet.has(String(p.ri).trim())) return false;
        if (p.documento_compra && eliminatedSet.has(String(p.documento_compra).trim())) return false;
        return true;
      });
  }

  public getPedidosForn(): PedidoForn[] {
    const raw = this.getStorageItem<any[]>(this.pedidosFornKey, []);
    return raw
      .map(p => this.normalizePedidoFornRow(p))
      .filter(p => {
        const eflag = String(p.eflag_e || (p as any).campos_extras?.eflag_e || '').trim().toUpperCase();
        return eflag !== 'L';
      });
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
      const rows = await this.fetchAllFromTable<HistoricoPedidoView>('vw_historico_pedidos', '*', 1000);
      this.setStorageItem(this.historicoPedidosKey, rows);
      this.commitDatasetMeta('historico_pedidos', markers);
      return rows;
    } catch (err) {
      console.warn('Falha ao sincronizar histórico; usando cache local.', err);
      return this.getHistoricoPedidos();
    }
  }

  // Posição de estoque (ZL0024). Diferente das views pesadas, a tabela `estoque`
  // é pequena (~2 mil linhas) e não entra na sincronização periódica: a tela do
  // Almoxarifado busca sob demanda. Cacheia em memória para não refazer a query
  // a cada navegação na mesma sessão; `force` (botão "Atualizar") ignora o cache.
  public getEstoque(): EstoqueItem[] {
    return this.getStorageItem<EstoqueItem[]>(this.estoqueKey, []);
  }

  public async fetchEstoque(force = false): Promise<EstoqueItem[]> {
    if (!supabase) return this.getEstoque();
    if (!force && this.cache.has(this.estoqueKey)) {
      return this.getEstoque();
    }
    try {
      const rows = await this.fetchAllFromTable<EstoqueItem>('estoque', '*', 1000, undefined, 'id');
      this.setStorageItem(this.estoqueKey, rows);
      return rows;
    } catch (err) {
      console.warn('Falha ao buscar a posição de estoque; usando cache local.', err);
      return this.getEstoque();
    }
  }

  // Enriquecimento por material (último preço pago), lido de vw_estoque_analise.
  // Mesma política de `fetchEstoque`: busca sob demanda, cache em memória por
  // sessão, e fora do `syncFromSupabase` para não cobrar egress de quem nunca
  // abre o módulo. Em falha devolve o cache local — quem consome detecta a lista
  // vazia e degrada só o painel que depende dela.
  public getEstoqueAnalise(): EstoqueAnalise[] {
    return this.getStorageItem<EstoqueAnalise[]>(this.estoqueAnaliseKey, []);
  }

  public async fetchEstoqueAnalise(force = false): Promise<EstoqueAnalise[]> {
    if (!supabase) return this.getEstoqueAnalise();
    if (!force && this.cache.has(this.estoqueAnaliseKey)) {
      return this.getEstoqueAnalise();
    }
    try {
      const rows = await this.fetchAllFromTable<EstoqueAnalise>('vw_estoque_analise', '*', 1000);
      this.setStorageItem(this.estoqueAnaliseKey, rows);
      return rows;
    } catch (err) {
      console.warn('Falha ao buscar a análise de estoque; usando cache local.', err);
      return this.getEstoqueAnalise();
    }
  }

  // Contratos (ME3N). Mesma política de `fetchEstoque`: tabela "foto do
  // momento", busca sob demanda, cache em memória por sessão. Tenta
  // `me3n_contratos` com fallback para `me3m_contratos` (nome antigo), espelhando
  // o fallback de leitura já usado em `importME3NRaw`.
  public getContratos(): ContratoME3N[] {
    return this.getStorageItem<ContratoME3N[]>(this.contratosKey, []);
  }

  public async fetchContratos(force = false): Promise<ContratoME3N[]> {
    if (!supabase) return this.getContratos();
    if (!force && this.cache.has(this.contratosKey)) {
      return this.getContratos();
    }
    try {
      let rows: ContratoME3N[];
      try {
        rows = await this.fetchAllFromTable<ContratoME3N>('me3n_contratos', '*', 1000, undefined, 'id');
      } catch (err: any) {
        const msg = String(err?.message || '').toLowerCase();
        if (err?.code === '42P01' || msg.includes('does not exist') || msg.includes('not find')) {
          rows = await this.fetchAllFromTable<ContratoME3N>('me3m_contratos', '*', 1000, undefined, 'id');
        } else {
          throw err;
        }
      }
      this.setStorageItem(this.contratosKey, rows);
      return rows;
    } catch (err) {
      console.warn('Falha ao buscar contratos (ME3N); usando cache local.', err);
      return this.getContratos();
    }
  }

  // Campos complementares de contrato (gestor, escopo, parcela, modalidade,
  // vigência em texto livre, status) — mora em `contratos_detalhes`, separada
  // de `me3n_contratos`, para sobreviver a reimportações ME3N. Mesma política
  // de cache das demais tabelas pequenas.
  public getContratosDetalhes(): ContratoDetalhes[] {
    return this.getStorageItem<ContratoDetalhes[]>(this.contratosDetalhesKey, []);
  }

  public async fetchContratosDetalhes(force = false): Promise<ContratoDetalhes[]> {
    if (!supabase) return this.getContratosDetalhes();
    if (!force && this.cache.has(this.contratosDetalhesKey)) {
      return this.getContratosDetalhes();
    }
    try {
      const rows = await this.fetchAllFromTable<ContratoDetalhes>('contratos_detalhes', '*', 1000);
      this.setStorageItem(this.contratosDetalhesKey, rows);
      return rows;
    } catch (err) {
      console.warn('Falha ao buscar os detalhes de contratos; usando cache local.', err);
      return this.getContratosDetalhes();
    }
  }

  /** Upsert de um contrato inteiro — a tela sempre envia o formulário completo. */
  public async saveContratoDetalhes(patch: ContratoDetalhes): Promise<ContratoDetalhes> {
    if (!supabase) throw new Error('Sem conexão com o servidor.');
    const user = this.getCurrentUser();
    const row: ContratoDetalhes = {
      ...patch,
      updated_by: user?.name || 'Sistema',
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase.from('contratos_detalhes').upsert(row, { onConflict: 'documento_compras' });
    if (error) throw error;

    const lista = this.getContratosDetalhes().filter(d => d.documento_compras !== row.documento_compras);
    lista.push(row);
    this.setStorageItem(this.contratosDetalhesKey, lista);
    this.logActivity(user?.id || 'sistema', 'Suprimentos', 'Editar Contrato', `Editou os dados complementares do contrato ${row.documento_compras}.`);
    return row;
  }

  // Anexos de contrato. Mesmo bucket dos anexos de solicitação
  // (`request-attachments`), caminho próprio (`contratos/<documento>/...`) —
  // evita precisar de bucket e policy de Storage novos.
  public getContratoAnexos(documentoCompras: string): ContratoAnexo[] {
    return this.getStorageItem<ContratoAnexo[]>(this.contratoAnexosKey, [])
      .filter(a => a.documento_compras === documentoCompras);
  }

  public async fetchContratoAnexos(force = false): Promise<ContratoAnexo[]> {
    if (!supabase) return this.getStorageItem<ContratoAnexo[]>(this.contratoAnexosKey, []);
    if (!force && this.cache.has(this.contratoAnexosKey)) {
      return this.getStorageItem<ContratoAnexo[]>(this.contratoAnexosKey, []);
    }
    try {
      const rows = await this.fetchAllFromTable<ContratoAnexo>('contrato_anexos', '*', 1000);
      this.setStorageItem(this.contratoAnexosKey, rows);
      return rows;
    } catch (err) {
      console.warn('Falha ao buscar os anexos de contratos; usando cache local.', err);
      return this.getStorageItem<ContratoAnexo[]>(this.contratoAnexosKey, []);
    }
  }

  public async uploadContratoAnexos(
    documentoCompras: string,
    prepared: PreparedAttachment[]
  ): Promise<{ uploaded: number; failed: string[] }> {
    const failed: string[] = [];
    let uploaded = 0;
    if (prepared.length === 0) return { uploaded, failed };
    if (!supabase) return { uploaded, failed: prepared.map(p => p.name) };

    const user = this.getCurrentUser();
    const lista = this.getStorageItem<ContratoAnexo[]>(this.contratoAnexosKey, []);

    for (const p of prepared) {
      try {
        const ext = p.name.split('.').pop() || 'bin';
        const path = `contratos/${documentoCompras}/${gerarUUID()}.${ext}`;

        const { error: upErr } = await supabase.storage
          .from(ATTACHMENTS_BUCKET)
          .upload(path, p.blob, { contentType: p.mimeType, upsert: false });
        if (upErr) throw upErr;

        const row: ContratoAnexo = {
          id: gerarUUID(),
          documento_compras: documentoCompras,
          name: p.name,
          storage_path: path,
          mime_type: p.mimeType,
          size: p.sizeCompressed,
          uploaded_by: user?.id,
          created_at: new Date().toISOString(),
        };

        const { error: dbErr } = await supabase.from('contrato_anexos').insert(row);
        if (dbErr) throw dbErr;

        lista.push(row);
        uploaded++;
      } catch (err) {
        console.error(`Falha ao enviar o anexo "${p.name}".`, err);
        failed.push(p.name);
      }
    }

    this.setStorageItem(this.contratoAnexosKey, lista);
    if (uploaded > 0) {
      this.logActivity(user?.id || 'sistema', 'Suprimentos', 'Anexar Documento', `Anexou ${uploaded} documento(s) ao contrato ${documentoCompras}.`);
    }
    return { uploaded, failed };
  }

  public async deleteContratoAnexo(anexoId: string): Promise<string | null> {
    if (!supabase) return 'Sem conexão com o servidor.';
    const lista = this.getStorageItem<ContratoAnexo[]>(this.contratoAnexosKey, []);
    const anexo = lista.find(a => a.id === anexoId);
    if (!anexo) return 'Anexo não encontrado.';

    try {
      const { error: storageErr } = await supabase.storage.from(ATTACHMENTS_BUCKET).remove([anexo.storage_path]);
      if (storageErr) console.error(`Falha ao remover o arquivo "${anexo.storage_path}" do Storage.`, storageErr);

      const { error: dbErr } = await supabase.from('contrato_anexos').delete().eq('id', anexoId);
      if (dbErr) throw dbErr;
    } catch (err) {
      console.error('Falha ao excluir o anexo do contrato.', err);
      return 'Não foi possível excluir o anexo. Tente novamente.';
    }

    this.signedUrlCache.delete(anexo.storage_path);
    this.setStorageItem(this.contratoAnexosKey, lista.filter(a => a.id !== anexoId));
    const user = this.getCurrentUser();
    this.logActivity(user?.id || 'sistema', 'Suprimentos', 'Excluir Anexo', `Excluiu o anexo "${anexo.name}" do contrato ${anexo.documento_compras}.`);
    return null;
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

  // Auditoria de preços: uma linha por compra de 2026 com a referência do
  // material corrigida pelo IPCA (vw_auditoria_compras).
  public getAuditoriaCompras(): AuditoriaCompra[] {
    return this.getStorageItem<AuditoriaCompra[]>(this.auditoriaComprasKey, []);
  }

  /**
   * Rebaixa a auditoria só quando a origem mudou. Meta própria
   * ('auditoria_compras') pelo mesmo motivo de `historico_sem_po`: caches
   * distintos não podem compartilhar carimbo de sincronização, senão um
   * "adianta o relógio" do outro. A versão comparada é a de
   * 'historico_pedidos', que é a mesma origem (pedidosforn) e já é incrementada
   * nas importações.
   *
   * A referência também muda quando o IBGE publica um mês novo, mas isso não
   * mexe na versão do dataset. Por isso o botão "Atualizar" da aba passa
   * `force` — é o caminho para pegar IPCA novo sem esperar importação.
   */
  public async fetchAuditoriaCompras(force = false): Promise<AuditoriaCompra[]> {
    if (!supabase) return this.getAuditoriaCompras();
    try {
      const markers = await this.fetchRemoteMarkers();
      const metaDataset = 'auditoria_compras';
      const hasCache = this.cache.has(this.auditoriaComprasKey);
      const meta = this.getDatasetMeta(metaDataset);
      const marker = markers?.get('historico_pedidos');
      const upToDate = !!meta && hasCache && (!marker || meta.version === marker.version);
      if (!force && upToDate) {
        return this.getAuditoriaCompras();
      }
      const rows = await this.fetchAllFromTable<AuditoriaCompra>('vw_auditoria_compras');
      this.setStorageItem(this.auditoriaComprasKey, rows);
      const now = new Date().toISOString();
      this.setStorageItem(this.datasetMetaKey(metaDataset), {
        version: marker?.version ?? 0,
        updatedAt: marker?.updatedAt ?? now,
        fetchedAt: now,
      });
      return rows;
    } catch (err) {
      console.warn('Falha ao sincronizar a auditoria de preços; usando cache local.', err);
      return this.getAuditoriaCompras();
    }
  }

  /**
   * As compras passadas de UM material, já corrigidas — o drill-down que torna
   * a mediana conferível.
   *
   * Buscado sob demanda e não sincronizado: são 6,5 mil linhas no total, e o
   * usuário abre um punhado delas por sessão. Baixar todas para exibir cinco é
   * o tipo de egress que a otimização do projeto existe para evitar.
   */
  public async fetchAuditoriaHistoricoMaterial(material: string): Promise<AuditoriaHistoricoMaterial[]> {
    if (!supabase || !material) return [];
    try {
      const { data, error } = await supabase
        .from('vw_auditoria_historico_material')
        .select('*')
        .eq('material', material)
        .order('data_doc', { ascending: false });
      if (error) throw error;
      return (data || []) as AuditoriaHistoricoMaterial[];
    } catch (err) {
      console.warn(`Falha ao buscar o histórico do material ${material}.`, err);
      return [];
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

  // Preço unitário de um pedido = preço líquido (por base de preço) dividido
  // pela coluna "Por" do SAP (Preiseinheit). Ex.: preço 177,63 "por" 100 →
  // 1,7763/unidade. "Por" vazio/ausente/não-numérico é tratado como 1.
  private precoUnitarioDoPedido(ped?: Partial<SAPPedido>): number | undefined {
    if (!ped || ped.preco_liquido === undefined || ped.preco_liquido === null || isNaN(ped.preco_liquido)) return undefined;
    const porNum = Number(String(ped.por ?? '').trim().replace(',', '.'));
    const divisor = isNaN(porNum) || porNum === 0 ? 1 : porNum;
    return ped.preco_liquido / divisor;
  }

  public getEnrichedSAPRequisicoes(): EnrichedSAPRecord[] {
    const reqs = this.getRequisicoes().filter(r => !r.codigo_de_eliminacao);
    // pedidos (ZL0131) mantido apenas como fallback offline para dados de entrega
    const peds = this.getPedidos();
    const pedsMap = new Map(peds.map(p => [p.ri, p]));

    // pedidosForn (ZL0132) é a fonte autoritativa do número do PO.
    // O servidor (view_enriched_requisicoes → mv_pedido_atual_por_ri) já faz o
    // JOIN correto com pedidosforn. O cliente DEVE confiar em raw.documento_compra
    // e NÃO sobrescrever com a tabela pedidos (ZL0131).
    // Aqui apenas: (a) construir set de eliminados para verificação local de eflag_e='L'
    //              (b) manter mapa de pedidosForn ativo por RI para fallback offline e dados financeiros.
    const rawPedsForn = this.getStorageItem<any[]>(this.pedidosFornKey, []);
    const eliminatedCompositeKeys = new Set<string>();
    const pedsFornByRi = new Map<string, any>(); // PO ativo mais recente por RI

    rawPedsForn.forEach(pf => {
      const eflag = String(pf.eflag_e || pf.campos_extras?.eflag_e || pf['E'] || pf['E.'] || '').trim().toUpperCase();
      if (eflag === 'L') {
        const doc = String(pf.doc_compra || pf.documento_compra || '').trim();
        if (pf.ri && doc) eliminatedCompositeKeys.add(String(pf.ri).trim() + '_' + doc);
      } else {
        // Manter o registro mais recente por RI (data_doc DESC)
        const ri = String(pf.ri || '').trim();
        if (ri) {
          const existing = pedsFornByRi.get(ri);
          const pfDate = String(pf.data_doc || '');
          const exDate = existing ? String(existing.data_doc || '') : '';
          if (!existing || pfDate > exDate) pedsFornByRi.set(ri, pf);
        }
      }
    });

    const currentDate = new Date('2026-07-05T06:31:00-07:00'); // current mock time from metadata

    return reqs.map(r => {
      // raw.documento_compra vem da view_enriched_requisicoes (JOIN com pedidosforn via mv_pedido_atual_por_ri).
      // É a fonte correta. Fallback para modo offline/semente: cache local da pedidosforn.
      const raw = r as any;
      const rawDocCompra = String(raw.documento_compra || '').trim();
      const localPf = pedsFornByRi.get(String(r.ri || '').trim());
      const localDocCompra = String(localPf?.doc_compra || localPf?.documento_compra || '').trim();

      // PO efetivo: servidor tem precedência; fallback para pedidosForn local (offline)
      const docCompra = rawDocCompra || localDocCompra;

      // Verificação de eliminação: eflag_e = 'L' na pedidosForn é a única fonte de verdade.
      // Escopo por RI+doc — eflag_e é por linha do pedido, não pelo PO inteiro,
      // e um mesmo número de PO pode ter itens ativos e itens cancelados.
      const isDocEliminated = docCompra
        ? !!(r.ri && eliminatedCompositeKeys.has(String(r.ri).trim() + '_' + docCompra))
        : false;

      const hasPO = !!docCompra
        && docCompra !== '—' && docCompra !== '0'
        && docCompra !== 'undefined' && docCompra !== 'null'
        && !isDocEliminated;

      // Dados financeiros da pedidosForn local (não vêm na view_enriched_requisicoes)
      const activePf = hasPO ? localPf : undefined;
      const preco_unitario = activePf ? this.precoUnitarioDoPedido(this.normalizePedidoFornRow(activePf)) : undefined;
      const valor_total = activePf
        ? (activePf.valor_em_brl !== undefined && activePf.valor_em_brl !== null
            ? Number(activePf.valor_em_brl)
            : activePf.valor_liquido !== undefined && activePf.valor_liquido !== null
              ? Number(activePf.valor_liquido)
              : undefined)
        : undefined;

      if (raw.status_requisicao === 'Sem PO' || raw.status_requisicao === 'Processado') {
        // Modo online: servidor já computou status e métricas usando pedidosforn.
        // Confiar em raw.*; apenas recalcular status_requisicao considerando eliminação local.
        const status_requisicao = hasPO ? 'Processado' : 'Sem PO';

        return {
          ...r,
          // Campos do PO: raw vem do servidor (já de pedidosforn via mv_pedido_atual_por_ri)
          item_pedido: hasPO ? (raw.item_pedido || activePf?.item || undefined) : undefined,
          fornecedor_code: hasPO ? (raw.fornecedor_code || activePf?.fornecedor_codigo || undefined) : undefined,
          fornecedor_name: hasPO ? (raw.fornecedor_name || activePf?.fornecedor_nome || undefined) : undefined,
          data_pedido: hasPO ? (raw.data_pedido || activePf?.data_doc || undefined) : undefined,
          data_entrega_sap: hasPO ? (raw.data_entrega_sap || activePf?.dt_remessa || undefined) : undefined,
          documento_compra: hasPO ? docCompra : null,
          criado_por_pedido: hasPO ? (raw.criado_por_pedido || activePf?.criado_por_pedido || undefined) : undefined,
          data_migo: hasPO ? (raw.data_migo || activePf?.data_migo || undefined) : undefined,
          preco_unitario,
          valor_total,
          natureza: raw.natureza,
          status_requisicao,
          lead_time_compras_meta: raw.lead_time_compras_meta,
          dias_em_aberto: raw.dias_em_aberto,
          atraso_comprador: raw.atraso_comprador,
          faixa_atraso: raw.faixa_atraso,
          alerta: raw.alerta,
          status_atualizado: hasPO
            ? raw.status_atualizado
            : (raw.status_atualizado === 'Concluído' ? 'No Prazo' : raw.status_atualizado)
        } as EnrichedSAPRecord;
      }

      // Modo offline/semente: raw.status_requisicao não veio do servidor.
      // Recalcular localmente; pedidos (ZL0131) usado como fallback para dados de entrega.
      const ped = pedsMap.get(r.ri);
      const p = (hasPO ? (ped || {}) : {}) as Partial<SAPPedido>;

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

      // Status: DEVE VIR DA PEDIDOSFORN
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
      const data_migo = hasPO
        ? (p.campos_extras?.data_migo || p.campos_extras?.['data_migo'] || (p as any).data_migo || activePf?.data_migo)
        : undefined;
      const status_entrega = data_migo ? 'Entregue' : 'Não Entregue';
      const isDelivered = status_entrega === 'Entregue';

      const data_referencia_prazo = hasPO && isDelivered && data_migo
        ? new Date(data_migo)
        : hasPO && (p.data_pedido || activePf?.data_doc)
        ? new Date(p.data_pedido || activePf?.data_doc)
        : currentDate;

      const solDate = new Date(r.data_solicitacao);
      const diffTimeSol = data_referencia_prazo.getTime() - solDate.getTime();
      const dias_em_aberto = Math.max(0, Math.floor(diffTimeSol / (1000 * 60 * 60 * 24)));

      const diffTimeRef = data_referencia_prazo.getTime() - solDate.getTime();
      const diffDaysRef = Math.max(0, Math.floor(diffTimeRef / (1000 * 60 * 60 * 24)));
      const atraso_comprador = Math.max(0, diffDaysRef - lead_time_compras_meta);

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
        item_pedido: hasPO ? (p.item_pedido || activePf?.item || undefined) : undefined,
        fornecedor_code: hasPO ? (p.fornecedor_code || activePf?.fornecedor_codigo || undefined) : undefined,
        fornecedor_name: hasPO ? (p.fornecedor_name || activePf?.fornecedor_nome || undefined) : undefined,
        data_pedido: hasPO ? (p.data_pedido || activePf?.data_doc || undefined) : undefined,
        data_entrega_sap: hasPO ? (p.data_entrega_sap || activePf?.dt_remessa || undefined) : undefined,
        documento_compra: hasPO ? docCompra : null,
        criado_por_pedido: hasPO ? ((p as any).criado_por_pedido || activePf?.criado_por_pedido || undefined) : undefined,
        data_migo,
        preco_unitario,
        valor_total: hasPO ? (p.valor_brl || valor_total) : undefined,
        natureza,
        status_requisicao,
        lead_time_compras_meta,
        dias_em_aberto,
        atraso_comprador,
        faixa_atraso,
        alerta,
        status_atualizado
      } as EnrichedSAPRecord;
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

  public async updateBuyerFields(ri: string, obs: string, deliveryDate: string, itemStatus?: ItemStatus | ''): Promise<boolean> {
    const reqs = this.getRequisicoes();
    const idx = reqs.findIndex(r => r.ri === ri);
    if (idx !== -1) {
      const user = this.getCurrentUser();
      const userName = user?.name || 'Sistema';

      const prevObs = reqs[idx].obs_comprador || '';
      const prevDate = reqs[idx].data_entrega_prevista || '';
      const prevStatus = reqs[idx].item_status || null;
      const prevObsUpdatedAt = reqs[idx].obs_updated_at;
      const prevObsUpdatedBy = reqs[idx].obs_updated_by;
      const prevStatusUpdatedAt = reqs[idx].item_status_updated_at;
      const prevStatusUpdatedBy = reqs[idx].item_status_updated_by;

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

          const { error: updateErr } = await supabase.from('requisicoes').update(updatePayload).eq('ri', ri);
          if (updateErr) throw updateErr;

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

          return true;
      } catch (e) {
        console.error("Erro ao sincronizar updateBuyerFields no Supabase:", e);

        // Reverte o cache local: sem isso a tela mostraria "salvo" enquanto o
        // Supabase (fonte de verdade para outros usuários) ficou com o valor antigo.
        const revertReqs = this.getRequisicoes();
        const revertIdx = revertReqs.findIndex(r => r.ri === ri);
        if (revertIdx !== -1) {
          revertReqs[revertIdx].obs_comprador = prevObs;
          revertReqs[revertIdx].data_entrega_prevista = prevDate;
          revertReqs[revertIdx].obs_updated_at = prevObsUpdatedAt;
          revertReqs[revertIdx].obs_updated_by = prevObsUpdatedBy;
          revertReqs[revertIdx].item_status = prevStatus || undefined;
          revertReqs[revertIdx].item_status_updated_at = prevStatusUpdatedAt;
          revertReqs[revertIdx].item_status_updated_by = prevStatusUpdatedBy;
          this.setStorageItem(this.requisicoesKey, revertReqs);
        }

        return false;
      }
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
        q => q.gte('data_da_solicitacao', '2026-01-01'),
        'ri'
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

  // Grava, de forma assíncrona (fire-and-forget, mesmo padrão de
  // updateBuyerFields), um registro de envio de cotação por item+fornecedor.
  // Log append-only: usado só para avisar o comprador "cotação já enviada
  // antes" na tela de texto da cotação, não bloqueia nem precisa de retorno.
  public logCotacaoEnviada(entries: { ri: string; rm: string; codForn: string; fornecedorNome: string }[]): void {
    if (entries.length === 0) return;

    const user = this.getCurrentUser();
    const userId = user?.id || 'sistema';
    const userName = user?.name || 'Sistema';
    const nowIso = new Date().toISOString();

    const rows = entries.map(e => ({
      id: 'ch_' + Math.random().toString(36).substr(2, 9),
      ri: e.ri,
      rm: e.rm,
      cod_forn: e.codForn,
      fornecedor_nome: e.fornecedorNome,
      user_id: userId,
      user_name: userName,
      created_at: nowIso
    }));

    (async () => {
      try {
        const { error } = await supabase.from('cotacao_historico').insert(rows);
        if (error) throw error;
      } catch (e) {
        console.error('Erro ao gravar histórico de cotação enviada no Supabase:', e);
      }
    })();
  }

  // Schema tolerant columns definitions
  // Apelido usado na aplicação -> coluna crua do ME5A/Supabase. Usado na
  // reimportação para manter os dois lados em sincronia (ver importME5ARaw).
  private ME5A_ALIASES: Array<[string, string]> = [
    ['tipo_documento', 'tipo_de_documento'],
    ['requisitante_name', 'requisitante'],
    ['material_code', 'material'],
    ['unidade_medida', 'unidade_de_medida'],
    ['grupo_comprador', 'grupo_de_compradores'],
    ['data_solicitacao', 'data_da_solicitacao'],
    ['data_remessa', 'remessas_de_ate'],
  ];

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
    { header: 'Contato', field: 'nome_contato' },
    { header: 'NOME FANTASIA', field: 'nome_fantasia' },
    { header: 'TELEFONE', field: 'telefone' },
    { header: 'E-MAIL', field: 'email' },
    { header: 'CLASSIFICAÇÃO', field: 'classificacao' }
  ];

  private CIDADEFORN_COLUMNS = [
    { header: 'Fornecedor', field: 'forn_codigo' },
    { header: 'Nome do fornecedor', field: 'forn_nome' },
    { header: 'Rua', field: 'rua' },
    { header: 'País', field: 'pais' },
    { header: 'Código postal', field: 'codigo_postal' },
    { header: 'Local', field: 'localidade' },
    { header: 'Rg', field: 'estado_uf' }
  ];


  private ESTOQUE_COLUMNS = [
    { header: 'Cen.', field: 'centro' },
    { header: 'Dep.', field: 'deposito' },
    { header: 'Tipo de material', field: 'tipo_material' },
    { header: 'Material', field: 'material' },
    { header: 'Referência Fabricante', field: 'referencia_fabricante' },
    { header: 'TxtBreveMaterial', field: 'txt_breve_material' },
    { header: 'Stock UL (Dep)', field: 'quantidade' },
    { header: 'UMB', field: 'umb' },
    { header: 'PMM', field: 'preco_medio' },
    { header: 'Val.Total (depósito)', field: 'valor_total' },
    { header: 'GrpMercad', field: 'grp_mercad' },
    { header: 'Class. Item', field: 'class_item' },
    { header: 'Grupo de mercadorias', field: 'grupo_mercadorias' },
    { header: 'Grupo de mercadorias', field: 'aplicacao' },
    { header: 'Texto Pedido Compra', field: 'texto_pedido_compra' },
    { header: 'Nome 1', field: 'empresa' }
  ];

  private ME3N_COLUMNS = [
    { header: 'Documento de compras', field: 'documento_compras' },
    { header: 'Data do documento', field: 'data_documento' },
    { header: 'Fornecedor/centro fornecedor', field: 'fornecedor' },
    { header: 'Centro', field: 'centro' },
    { header: 'Item', field: 'item' },
    { header: 'Material', field: 'material' },
    { header: 'Texto breve', field: 'texto_breve' },
    { header: 'Qtd.solicit.anterior', field: 'qtd_solicit_anterior' },
    { header: 'Unidade de preço', field: 'unidade_preco' },
    { header: 'Preço líquido', field: 'preco_liquido' },
    { header: 'Valor solicitado', field: 'valor_solicitado' },
    { header: 'Valor efetivo', field: 'valor_efetivo' },
    { header: 'Qtd.prev.pendente', field: 'qtd_prev_pendente' },
    { header: 'Valor pendente', field: 'valor_pendente' },
    { header: 'a ser fornecida (quantidade)', field: 'a_fornecer_qtd' },
    { header: 'a ser fornecido (valor', field: 'a_fornecer_valor' },
    { header: 'Ãinda a faturar (quantidade)', field: 'ainda_faturar_qtd' },
    { header: 'Ainda a faturar (valor)', field: 'ainda_faturar_valor' },
    { header: 'Fim da validade', field: 'fim_validade' },
    { header: 'Início per.validade', field: 'inicio_validade' },
    { header: 'Código de eliminação', field: 'codigo_eliminacao' },
    { header: 'UM pedido', field: 'um_pedido' },
    { header: 'Moeda', field: 'moeda' },
    { header: 'Estado de liberação', field: 'estado_liberacao' },
    { header: 'Código de liberação', field: 'codigo_liberacao' },
    { header: 'Valor líquido pedido', field: 'valor_liquido_pedido' },
    { header: 'Requisitante', field: 'requisitante' },
    { header: 'Histórico pedido/docum.SolRem.', field: 'historico_pedido' },
    { header: 'Criado por', field: 'criado_por' }
  ];

  private ZL0132_COLUMNS = [
    { header: 'Nº acomp.', field: 'n_acomp' },
    { header: 'Eflag_e', field: 'eflag_e' },
    { header: 'E', field: 'eflag_e' },
    { header: 'E.', field: 'eflag_e' },
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
    { header: 'por', field: 'por' },
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

  // Planilhas importadas podem trazer múltiplos e-mails/telefones em uma única
  // célula usando separadores variados (",", "/", quebra de linha). Normaliza
  // tudo para o formato "; " usado pelo restante do app (tela de Fornecedores,
  // Histórico de Pedidos, etc.).
  private normalizeMultiValue(raw: any): string | null {
    const value = String(raw || '').trim();
    if (!value) return null;
    const parts = value.split(/[;,/\n]+/).map(v => v.trim()).filter(Boolean);
    return parts.length ? parts.join('; ') : null;
  }

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
      const remoteReqs = await this.fetchAllFromTable<any>('requisicoes', '*', 1000, q => q.gte('data_da_solicitacao', '2026-01-01'), 'ri');
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

        const merged: any = {
          ...existing,
          ...record,
          qtd_requisicao: record.qtd_solicitada,
          presente_ultima_carga: true,
          eliminado: isEliminated,
          campos_extras: { ...existing.campos_extras, ...campos_extras }
        };
        // O registro existente carrega os apelidos normalizados (grupo_comprador,
        // material_code, ...) e sobrevive ao spread do `record`, que traz apenas os
        // nomes crus do SAP. Como a gravação prioriza o apelido, um valor alterado
        // no ME5A — típico do grupo de compradores, que muda de dono — seria
        // descartado. Por isso os apelidos são redefinidos a cada importação.
        this.ME5A_ALIASES.forEach(([alias, raw]) => {
          if (raw in record) merged[alias] = record[raw];
        });
        newReqsMap.set(ri, merged);
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
      await this.refreshMaterialSinais();
      await supabase.from('import_logs').insert(logObj);
      onProgress?.(90);

      const updatedReqs = await this.fetchAllFromTable<any>('view_enriched_requisicoes', '*', 1000, q => q.gte('data_da_solicitacao', '2026-01-01'), 'ri');
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
    // sem filtro de data para garantir que registros mais antigos ou sem data_rc
    // também sejam atualizados no banco quando excluídos/modificados no SAP.
    let current = this.getPedidos();
    try {
      const remotePeds = await this.fetchAllFromTable<any>('pedidosforn', '*', 1000, undefined, 'id');
      if (remotePeds.length > 0) current = remotePeds.map(p => this.normalizePedidoRow(p));
    } catch (err) {
      console.warn('Não foi possível buscar os pedidos atuais (pedidosforn) do Supabase antes da importação; usando cache local.', err);
    }
    onProgress?.(10);
    const currentMap = new Map<string, any>();
    current.forEach(p => {
      if (p.ri) {
        currentMap.set(p.ri, p);
        if (p.documento_compra) {
          currentMap.set(p.ri + '_' + p.documento_compra, p);
        }
      }
    });
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

      // detecta pedidos excluidos (Eflag_e = 'L')
      let isExcludedPO = false;
      let eflagVal = '';
      if (eflagColIdx !== -1 && row[eflagColIdx] !== undefined && row[eflagColIdx] !== null) {
        eflagVal = String(row[eflagColIdx]).trim().toUpperCase();
      }

      if (eflagVal !== 'L') {
        row.slice(0, 10).forEach((cVal, cIdx) => {
          const s = String(cVal || '').trim().toUpperCase();
          if (s === 'L') {
            const h = String(headers[cIdx] || '').trim().toUpperCase();
            if (h === 'E' || h === 'E.' || h === 'EFLAG_E' || h === 'EFLAG' || h.includes('ELIMIN')) {
              eflagVal = 'L';
            }
          }
        });
      }

      if (eflagVal === 'L') {
        isExcludedPO = true;
        ignoredRows.push({
          row: fileRowIndex,
          identifier: ri,
          reason: 'Pedido excluído no SAP (Eflag_e = L)'
        });
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

      if (isExcludedPO || eflagVal === 'L') {
        record.eflag_e = 'L';
        campos_extras.eflag_e = 'L';
      } else if (eflagVal) {
        record.eflag_e = eflagVal;
        campos_extras.eflag_e = eflagVal;
      }

      const docCompraVal = record.doc_compra || '';
      const compositeKey = ri + '_' + docCompraVal;
      const existing = currentMap.get(compositeKey) || currentMap.get(ri);

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
            eflag_e: record.eflag_e || (isExcludedPO ? 'L' : undefined),
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
          eflag_e: record.eflag_e || (isExcludedPO ? 'L' : undefined),
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

    const generateUUID = gerarUUID;

    try {
      const usedIdsInBatch = new Set<string>();
      const dbRows = newPedidosArray.map(p => {
        const extr = p.campos_extras || {};
        const docCompraVal = p.documento_compra || extr.doc_compra || '';
        const compositeKey = p.ri + '_' + docCompraVal;
        let existing = currentMap.get(compositeKey);
        if (!existing || (existing.id && usedIdsInBatch.has(existing.id))) {
          existing = currentMap.get(p.ri);
        }

        let assignedId = (existing && existing.id && !usedIdsInBatch.has(existing.id))
          ? existing.id
          : generateUUID();
        usedIdsInBatch.add(assignedId);

        const mergedExtras = existing && existing.campos_extras 
          ? { ...existing.campos_extras, ...extr }
          : extr;

        const eflagFinal = p.eflag_e || extr.eflag_e || (extr['E'] ? String(extr['E']).trim().toUpperCase() : null) || (extr['E.'] ? String(extr['E.']).trim().toUpperCase() : null) || null;

        return {
          ri: p.ri,
          n_acomp: extr.n_acomp || null,
          eflag_e: eflagFinal,
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

      // Atualiza cidadeforn.estado_uf a partir da coluna Rg da ZL0132.
      // A ZL0132 e a fonte primaria do estado do fornecedor - mais confiavel que
      // qualquer outra planilha porque vem do cadastro do fornecedor no SAP.
      // Deduplica por fornecedor_codigo e grava so UF validas (2 letras),
      // ignorando codigos numericos de regioes estrangeiras (ex: 120 = Qingdao).
      const ufPorForn = new Map();
      for (const row of dbRows) {
        const cod = row.fornecedor_codigo;
        const uf = row.regiao_uf;
        if (cod && uf && /^[A-Za-z]{2}$/.test(uf) && !ufPorForn.has(cod)) {
          ufPorForn.set(cod, uf.toUpperCase());
        }
      }
      if (ufPorForn.size > 0) {
        const cidadeUfRows = Array.from(ufPorForn.entries()).map(([forn_codigo, estado_uf]) => ({
          forn_codigo,
          estado_uf,
          updated_at: new Date().toISOString()
        }));
        for (let i = 0; i < cidadeUfRows.length; i += 100) {
          // onConflict so atualiza estado_uf no registro existente, nao cria
          // novos registros - um fornecedor sem linha na cidadeforn tera o
          // estado lido via regiao_uf da propria view pelo dashboard.
          await supabase
            .from('cidadeforn')
            .upsert(cidadeUfRows.slice(i, i + 100), { onConflict: 'forn_codigo' })
            .catch(() => { /* nao bloqueia importacao se cidadeforn nao tiver o fornecedor */ });
        }
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
      await this.refreshMaterialSinais();
      await supabase.from('import_logs').insert(logObj);
      onProgress?.(90);

      // Sincroniza a tabela local de pedidosforn e vw_historico_pedidos
      await this.syncSimpleTable('pedidosforn', this.pedidosFornKey, true, q => q.gte('data_rc', '2026-01-01'));
      await this.refreshPedidosMatViews();
      await this.syncSimpleTable('vw_historico_pedidos', this.historicoPedidosKey, true);

      const updatedReqs = await this.fetchAllFromTable<any>('view_enriched_requisicoes', '*', 1000, q => q.gte('data_da_solicitacao', '2026-01-01'), 'ri');
      const updatedPeds = await this.fetchAllFromTable<any>('view_enriched_pedidos', '*', 1000, q => q.gte('data_rc', '2026-01-01'), 'ri');

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

    const generateUUID = gerarUUID;

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

      // Detecta registros com flag de exclusão (Eflag_e = L)
      if (eflagColIdx !== -1) {
        const eflagVal = String(row[eflagColIdx] || '').trim().toUpperCase();
        if (eflagVal === 'L') {
          ignoredRows.push({
            row: fileRowIndex,
            identifier: ri,
            reason: 'Pedido excluído no SAP (Eflag_e = L)'
          });
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
          allExistingRows.forEach(r => {
            if (r.ri) {
              existingMap.set(r.ri, r);
              if (r.doc_compra) {
                existingMap.set(r.ri + '_' + r.doc_compra, r);
              }
            }
          });
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

      let eflagVal = eflagColIdx !== -1 && row[eflagColIdx] !== undefined && row[eflagColIdx] !== null
        ? String(row[eflagColIdx]).trim().toUpperCase()
        : '';

      if (eflagVal !== 'L') {
        row.slice(0, 10).forEach((cVal, cIdx) => {
          const s = String(cVal || '').trim().toUpperCase();
          if (s === 'L') {
            const h = String(headers[cIdx] || '').trim().toUpperCase();
            if (h === 'E' || h === 'E.' || h === 'EFLAG_E' || h === 'EFLAG' || h.includes('ELIMIN')) {
              eflagVal = 'L';
            }
          }
        });
      }

      if (eflagVal === 'L') {
        record.eflag_e = 'L';
        campos_extras.eflag_e = 'L';
      } else if (eflagVal) {
        record.eflag_e = eflagVal;
        campos_extras.eflag_e = eflagVal;
      }

      const docCompraVal = record.doc_compra || docCompra || '';
      const compositeKey = ri + '_' + docCompraVal;
      const existing = existingMap.get(compositeKey) || existingMap.get(ri);

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
            eflag_e: record.eflag_e || null,
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
          eflag_e: record.eflag_e || null,
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
    const usedIdsInBatch = new Set<string>();
    const dbRowsToUpsert = Array.from(newPedidosMap.values()).map(p => {
      const extr = p.campos_extras || {};
      const docCompraVal = p.record?.doc_compra || extr.doc_compra || '';
      const compositeKey = p.ri + '_' + docCompraVal;
      let existing = existingMap.get(compositeKey);
      if (!existing || (existing.id && usedIdsInBatch.has(existing.id))) {
        existing = existingMap.get(p.ri);
      }

      let assignedId = (existing && existing.id && !usedIdsInBatch.has(existing.id))
        ? existing.id
        : generateUUID();
      usedIdsInBatch.add(assignedId);
      
      // Mescla com campos_extras antigos se o registro já existia para preservar dados históricos
      const mergedExtras = existing && existing.campos_extras 
        ? { ...existing.campos_extras, ...extr }
        : extr;

      const eflagFinal = p.eflag_e || extr.eflag_e || (extr['E'] ? String(extr['E']).trim().toUpperCase() : null) || (extr['E.'] ? String(extr['E.']).trim().toUpperCase() : null) || null;

      return {
        ri: p.ri,
        n_acomp: extr.n_acomp || null,
        eflag_e: eflagFinal,
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
      
      // Sincroniza a tabela local e recalcula a materialized view do Histórico de Pedidos
      onProgress?.(95, 'Sincronizando cache local...');
      await this.syncSimpleTable('pedidosforn', this.pedidosFornKey, true, q => q.gte('data_rc', '2026-01-01'));
      await this.refreshPedidosMatViews();
      await this.syncSimpleTable('vw_historico_pedidos', this.historicoPedidosKey, true);

      // pedidosforn alimenta view_enriched_pedidos/view_enriched_requisicoes (status_requisicao,
      // documento_compra, data_pedido, criado_por_pedido) — sem reidratar e bumpar 'requisicoes'/
      // 'pedidos' aqui, essa importação atualiza o PO no Supabase mas nenhum cliente (nem o que
      // importou) nota, porque o gate de sincronização só olha a versão de 'requisicoes'.
      onProgress?.(96, 'Atualizando requisições e pedidos com os novos POs...');
      const updatedReqs = await this.fetchAllFromTable<any>('view_enriched_requisicoes', '*', 1000, q => q.gte('data_da_solicitacao', '2026-01-01'), 'ri');
      const updatedPeds = await this.fetchAllFromTable<any>('view_enriched_pedidos', '*', 1000, q => q.gte('data_rc', '2026-01-01'), 'ri');

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
    const contatoColIdx = mappedFields.findIndex(f => f === 'nome_contato');
    const nomeFantasiaColIdx = mappedFields.findIndex(f => f === 'nome_fantasia');
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
        nome_contato: contatoColIdx !== -1 ? String(row[contatoColIdx] || '').trim() : null,
        nome_fantasia: nomeFantasiaColIdx !== -1 ? String(row[nomeFantasiaColIdx] || '').trim() : null,
        telefone: telColIdx !== -1 ? this.normalizeMultiValue(row[telColIdx]) : null,
        email: emailColIdx !== -1 ? this.normalizeMultiValue(row[emailColIdx]) : null,
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

  public getCidadeForn(): CidadeForn[] {
    return this.getStorageItem<CidadeForn[]>(this.cidadeFornKey, []);
  }

  public getGruposMercadoria(): GrupoMercadoria[] {
    return this.getStorageItem<GrupoMercadoria[]>(this.gruposMercadoriaKey, []);
  }

  public async importCidadeForn(rawRows: any[][], filename: string): Promise<SAPImportLog> {
    if (rawRows.length < 2) {
      throw new Error('Formato rejeitado: Linhas insuficientes no arquivo.');
    }

    const headers = rawRows[0].map(h => String(h || '').trim());
    const dataRows = rawRows.slice(1).filter(r => r.some(c => c !== ''));

    const { mappedFields, missingColumns, newColumns } = this.reconcileSchema(headers, this.CIDADEFORN_COLUMNS);

    const fornCodColIdx = mappedFields.findIndex(f => f === 'forn_codigo');
    if (fornCodColIdx === -1) {
      throw new Error('Formato rejeitado: Coluna obrigatória "Fornecedor" não encontrada.');
    }

    const user = this.getCurrentUser();
    let inserted = 0;
    let updated = 0;
    const dbRows: any[] = [];
    const ignoredRows: any[] = [];

    const fornNomeColIdx = mappedFields.findIndex(f => f === 'forn_nome');
    const ruaColIdx = mappedFields.findIndex(f => f === 'rua');
    const paisColIdx = mappedFields.findIndex(f => f === 'pais');
    const codPostalColIdx = mappedFields.findIndex(f => f === 'codigo_postal');
    const localidadeColIdx = mappedFields.findIndex(f => f === 'localidade');
    const estadoUfColIdx = mappedFields.findIndex(f => f === 'estado_uf');

    dataRows.forEach((row, index) => {
      const fileRowIndex = index + 2;
      const fornCodigo = String(row[fornCodColIdx] || '').trim();

      if (!fornCodigo) {
        ignoredRows.push({
          row: fileRowIndex,
          identifier: 'N/A',
          reason: 'Código do Fornecedor (Fornecedor) vazio.'
        });
        return;
      }

      const rawUf = estadoUfColIdx !== -1 ? String(row[estadoUfColIdx] || '').trim() : null;
      // So grava estado_uf se for UF brasileira valida (2 letras) para nao
      // sobrescrever com codigos numericos de fornecedores estrangeiros
      const estadoUf = rawUf && /^[A-Za-z]{2}$/.test(rawUf) ? rawUf.toUpperCase() : null;

      dbRows.push({
        forn_codigo: fornCodigo,
        forn_nome: fornNomeColIdx !== -1 ? String(row[fornNomeColIdx] || '').trim() : null,
        rua: ruaColIdx !== -1 ? String(row[ruaColIdx] || '').trim() : null,
        pais: paisColIdx !== -1 ? String(row[paisColIdx] || '').trim() : null,
        codigo_postal: codPostalColIdx !== -1 ? String(row[codPostalColIdx] || '').trim() : null,
        localidade: localidadeColIdx !== -1 ? String(row[localidadeColIdx] || '').trim() : null,
        estado_uf: estadoUf,
        updated_at: new Date().toISOString()
      });
    });

    // Deduplica em memória pelo código do fornecedor
    const uniqueDbRowsMap = new Map<string, any>();
    dbRows.forEach(item => {
      uniqueDbRowsMap.set(item.forn_codigo, item);
    });
    const finalDbRows = Array.from(uniqueDbRowsMap.values());

    try {
      for (let i = 0; i < finalDbRows.length; i += 50) {
        const batch = finalDbRows.slice(i, i + 50);
        let { error } = await supabase.from('cidadeforn').upsert(batch, { onConflict: 'forn_codigo' });
        if (error) {
          // Se falhar o upsert por causa do onConflict ou RLS/permissão do upsert, tenta o insert direto
          const { error: insertErr } = await supabase.from('cidadeforn').insert(batch);
          if (insertErr) {
            console.error('Erro no Supabase ao salvar cidadeforn:', insertErr);
            throw new Error(`Erro no Supabase: ${insertErr.message || 'Falha de permissão RLS ou chave única na tabela cidadeforn'}`);
          }
        }
      }




      inserted = finalDbRows.length;

      const logId = 'il_' + Math.random().toString(36).substr(2, 9);
      const logObj = {
        id: logId,
        type: 'CIDADEFORN',
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
      await this.syncSimpleTable('cidadeforn', this.cidadeFornKey, true);
      await this.bumpDatasetVersion('cidadeforn', this.getCidadeForn().length);

      const logs = this.getStorageItem<SAPImportLog[]>(this.importLogsKey, []);
      logs.unshift(logObj as any);
      this.setStorageItem(this.importLogsKey, logs);

      this.logActivity(user?.id || 'sistema', 'Suprimentos', 'Importar Cidades Fornecedores', `Importou Endereços/Cidades Fornecedores (${filename}). Lidos: ${dataRows.length}, salvos: ${dbRows.length}.`);

      return logObj as any;
    } catch (e) {
      console.error('Erro ao salvar importação de cidadeforn no Supabase:', e);
      throw e;
    }
  }


  // Posição de estoque (ZL0024): é uma foto do momento, não um histórico
  // incremental — diferente das demais importações SAP, a carga mais recente
  // é sempre a única fonte de verdade. Por isso substitui o conteúdo inteiro
  // da tabela (delete + insert) em vez de comparar/mesclar com o que já existe.
  public async importZL0024Raw(rawRows: any[][], filename: string, onProgress?: (percent: number) => void): Promise<SAPImportLog> {
    if (rawRows.length < 2) {
      throw new Error('Formato rejeitado: Linhas insuficientes no arquivo.');
    }
    onProgress?.(0);

    const headers = rawRows[0].map(h => String(h || '').trim());
    const dataRows = rawRows.slice(1).filter(r => r.some(c => c !== ''));

    const { mappedFields, missingColumns, newColumns } = this.reconcileSchema(headers, this.ESTOQUE_COLUMNS);

    const materialColIdx = mappedFields.findIndex(f => f === 'material');
    if (materialColIdx === -1) {
      throw new Error('Formato rejeitado: Coluna obrigatória "Material" não encontrada.');
    }

    const colIdx = (field: string) => mappedFields.findIndex(f => f === field);
    const centroColIdx = colIdx('centro');
    const depositoColIdx = colIdx('deposito');
    const tipoMaterialColIdx = colIdx('tipo_material');
    const refFabricanteColIdx = colIdx('referencia_fabricante');
    const txtBreveColIdx = colIdx('txt_breve_material');
    const quantidadeColIdx = colIdx('quantidade');
    const umbColIdx = colIdx('umb');
    const precoMedioColIdx = colIdx('preco_medio');
    const valorTotalColIdx = colIdx('valor_total');
    const grpMercadColIdx = colIdx('grp_mercad');
    const classItemColIdx = colIdx('class_item');
    const grupoMercadoriasColIdx = colIdx('grupo_mercadorias');
    const aplicacaoColIdx = colIdx('aplicacao');
    const textoPedidoCompraColIdx = colIdx('texto_pedido_compra');
    const empresaColIdx = colIdx('empresa');

    const user = this.getCurrentUser();
    const dbRows: any[] = [];
    const ignoredRows: any[] = [];

    const strAt = (row: any[], idx: number) => idx !== -1 ? String(row[idx] ?? '').trim() || null : null;
    const numAt = (row: any[], idx: number) => idx !== -1 ? (Number(row[idx]) || 0) : null;

    dataRows.forEach((row, index) => {
      const fileRowIndex = index + 2;
      const material = strAt(row, materialColIdx);

      if (!material) {
        ignoredRows.push({
          row: fileRowIndex,
          identifier: 'N/A',
          reason: 'Material vazio.'
        });
        return;
      }

      dbRows.push({
        centro: strAt(row, centroColIdx),
        deposito: strAt(row, depositoColIdx),
        tipo_material: strAt(row, tipoMaterialColIdx),
        material,
        referencia_fabricante: strAt(row, refFabricanteColIdx),
        txt_breve_material: strAt(row, txtBreveColIdx),
        quantidade: numAt(row, quantidadeColIdx),
        umb: strAt(row, umbColIdx),
        preco_medio: numAt(row, precoMedioColIdx),
        valor_total: numAt(row, valorTotalColIdx),
        grp_mercad: strAt(row, grpMercadColIdx),
        class_item: strAt(row, classItemColIdx),
        grupo_mercadorias: strAt(row, grupoMercadoriasColIdx),
        aplicacao: strAt(row, aplicacaoColIdx),
        texto_pedido_compra: strAt(row, textoPedidoCompraColIdx),
        empresa: strAt(row, empresaColIdx),
        imported_at: new Date().toISOString()
      });
    });

    onProgress?.(10);

    try {
      const { count: previousCount } = await supabase
        .from('estoque')
        .select('id', { count: 'exact', head: true });

      const { error: deleteError } = await supabase.from('estoque').delete().gte('id', 0);
      if (deleteError) throw deleteError;
      onProgress?.(20);

      const totalBatches = Math.ceil(dbRows.length / 500) || 1;
      for (let i = 0; i < dbRows.length; i += 500) {
        const { error } = await supabase.from('estoque').insert(dbRows.slice(i, i + 500));
        if (error) throw error;
        const batchIndex = Math.floor(i / 500) + 1;
        onProgress?.(20 + Math.round((batchIndex / totalBatches) * 70));
      }

      const logId = 'il_' + Math.random().toString(36).substr(2, 9);
      const logObj = {
        id: logId,
        type: 'ZL0024',
        user_name: user?.name || 'Sistema',
        filename,
        records_read: dataRows.length,
        records_inserted: dbRows.length,
        records_updated: 0,
        records_unchanged: 0,
        records_eliminated: previousCount || 0,
        columns_missing: missingColumns,
        columns_new: newColumns,
        quantity_changes: [],
        missing_ris: [],
        ignored_rows: ignoredRows,
        created_at: new Date().toISOString()
      };

      await this.refreshMaterialSinais();
      await supabase.from('import_logs').insert(logObj);
      onProgress?.(95);

      const logs = this.getStorageItem<SAPImportLog[]>(this.importLogsKey, []);
      logs.unshift(logObj as any);
      this.setStorageItem(this.importLogsKey, logs);

      await this.bumpDatasetVersion('estoque', dbRows.length);

      this.logActivity(user?.id || 'sistema', 'Suprimentos', 'Importar Posição de Estoque', `Importou Posição de Estoque ZL0024 (${filename}). Lidos: ${dataRows.length}, substituídos: ${previousCount || 0}, novos: ${dbRows.length}.`);

      onProgress?.(100);
      return logObj as any;
    } catch (e) {
      console.error('Erro ao salvar importação de posição de estoque (ZL0024) no Supabase:', e);
      throw e;
    }
  }

  // Contas a Pagar (FBL1N): assim como ZL0024/estoque, é uma foto do momento
  // (partidas em aberto/compensadas na data da extração) — não um histórico
  // incremental. Cada carga substitui integralmente o conteúdo anterior.
  public async importFBL1NRaw(rawRows: any[][], filename: string, onProgress?: (percent: number) => void): Promise<SAPImportLog> {
    if (rawRows.length < 2) {
      throw new Error('Formato rejeitado: Linhas insuficientes no arquivo.');
    }
    onProgress?.(0);

    const headers = rawRows[0].map(h => String(h || '').trim());
    const dataRows = rawRows.slice(1).filter(r => r.some(c => c !== ''));

    const { mappedFields, missingColumns, newColumns } = this.reconcileSchema(headers, FBL1N_COLUMNS);

    if (!mappedFields.includes('numero_documento') || !mappedFields.includes('empresa')) {
      throw new Error('Formato rejeitado: Colunas obrigatórias do SAP ("Nº documento" e "Empresa") não encontradas.');
    }

    const user = this.getCurrentUser();
    const dbRows: any[] = [];
    const ignoredRows: any[] = [];

    dataRows.forEach((row, index) => {
      const fileRowIndex = index + 2;
      const { record, camposExtras } = mapFbl1nRow(headers, mappedFields, row);

      if (!record.numero_documento || !record.empresa) {
        ignoredRows.push({
          row: fileRowIndex,
          identifier: record.numero_documento || 'N/A',
          reason: 'Nº documento ou Empresa vazio.'
        });
        return;
      }

      dbRows.push({
        ...record,
        campos_extras: Object.keys(camposExtras).length ? camposExtras : null,
        imported_at: new Date().toISOString()
      });
    });

    onProgress?.(10);

    try {
      const { count: previousCount } = await supabase
        .from('fbl1n_c_pagar')
        .select('id', { count: 'exact', head: true });

      const { error: deleteError } = await supabase.from('fbl1n_c_pagar').delete().gte('id', 0);
      if (deleteError) throw deleteError;
      onProgress?.(20);

      const totalBatches = Math.ceil(dbRows.length / 500) || 1;
      for (let i = 0; i < dbRows.length; i += 500) {
        const { error } = await supabase.from('fbl1n_c_pagar').insert(dbRows.slice(i, i + 500));
        if (error) throw error;
        const batchIndex = Math.floor(i / 500) + 1;
        onProgress?.(20 + Math.round((batchIndex / totalBatches) * 70));
      }

      const logId = 'il_' + Math.random().toString(36).substr(2, 9);
      const logObj = {
        id: logId,
        type: 'FBL1N',
        user_name: user?.name || 'Sistema',
        filename,
        records_read: dataRows.length,
        records_inserted: dbRows.length,
        records_updated: 0,
        records_unchanged: 0,
        records_eliminated: previousCount || 0,
        columns_missing: missingColumns,
        columns_new: newColumns,
        quantity_changes: [],
        missing_ris: [],
        ignored_rows: ignoredRows,
        created_at: new Date().toISOString()
      };

      await supabase.from('import_logs').insert(logObj);
      onProgress?.(95);

      const logs = this.getStorageItem<SAPImportLog[]>(this.importLogsKey, []);
      logs.unshift(logObj as any);
      this.setStorageItem(this.importLogsKey, logs);

      await this.bumpDatasetVersion('fbl1n_c_pagar', dbRows.length);

      this.logActivity(user?.id || 'sistema', 'Suprimentos', 'Importar Contas a Pagar', `Importou Contas a Pagar FBL1N (${filename}). Lidos: ${dataRows.length}, substituídos: ${previousCount || 0}, novos: ${dbRows.length}.`);

      onProgress?.(100);
      return logObj as any;
    } catch (e) {
      console.error('Erro ao salvar importação de contas a pagar (FBL1N) no Supabase:', e);
      throw e;
    }
  }

  // Contratos (ME3N): upsert por (documento_compras, item) — atualiza o que
  // mudou, insere o que é novo, e nunca apaga. Diferente de ZL0024/estoque
  // (foto do momento, delete+insert): aqui a tela de Contratos guarda campos
  // complementares em `contratos_detalhes`/`contrato_anexos` amarrados ao
  // `documento_compras`, e um delete+insert quebraria essa referência a cada
  // reimportação.
  public async importME3NRaw(rawRows: any[][], filename: string, onProgress?: (percent: number) => void): Promise<SAPImportLog> {
    if (rawRows.length < 2) {
      throw new Error('Formato rejeitado: Linhas insuficientes no arquivo.');
    }
    onProgress?.(0);

    const headers = rawRows[0].map(h => String(h || '').trim());
    const dataRows = rawRows.slice(1).filter(r => r.some(c => c !== ''));

    const { mappedFields, missingColumns, newColumns } = this.reconcileSchema(headers, this.ME3N_COLUMNS);

    const documentoColIdx = mappedFields.findIndex(f => f === 'documento_compras');
    if (documentoColIdx === -1) {
      throw new Error('Formato rejeitado: Coluna obrigatória "Documento de compras" não encontrada.');
    }

    const colIdx = (field: string, aliases: string[] = []) => {
      let idx = mappedFields.findIndex(f => f === field);
      if (idx !== -1) return idx;
      for (const alias of aliases) {
        const aliasKey = alias.toLowerCase().trim();
        idx = headers.findIndex(h => h && h.toLowerCase().trim() === aliasKey);
        if (idx !== -1) return idx;
      }
      return -1;
    };

    const dataDocumentoColIdx = colIdx('data_documento', ['data do documento', 'data documento', 'data doc', 'data doc.', 'dt.documento']);
    const fornecedorColIdx = colIdx('fornecedor');
    const centroColIdx = colIdx('centro');
    const itemColIdx = colIdx('item');
    const materialColIdx = colIdx('material');
    const textoBreveColIdx = colIdx('texto_breve');
    const qtdSolicitAnteriorColIdx = colIdx('qtd_solicit_anterior');
    const unidadePrecoColIdx = colIdx('unidade_preco');
    const precoLiquidoColIdx = colIdx('preco_liquido');
    const valorSolicitadoColIdx = colIdx('valor_solicitado');
    const valorEfetivoColIdx = colIdx('valor_efetivo');
    const qtdPrevPendenteColIdx = colIdx('qtd_prev_pendente');
    const valorPendenteColIdx = colIdx('valor_pendente');
    const aFornecerQtdColIdx = colIdx('a_fornecer_qtd');
    const aFornecerValorColIdx = colIdx('a_fornecer_valor');
    const aindaFaturarQtdColIdx = colIdx('ainda_faturar_qtd');
    const aindaFaturarValorColIdx = colIdx('ainda_faturar_valor');
    const fimValidadeColIdx = colIdx('fim_validade', ['fim da validade', 'fim de validade', 'fim validade', 'fim per.validade', 'fim per. validade', 'fim do período de validade', 'dt.fim validade', 'data fim validade', 'data fim']);
    const inicioValidadeColIdx = colIdx('inicio_validade', ['início per.validade', 'inicio per.validade', 'início validade', 'inicio validade', 'início per. validade', 'início do período de validade', 'dt.início validade', 'data início validade', 'data inicio validade', 'data inicio']);
    const codigoEliminacaoColIdx = colIdx('codigo_eliminacao');
    const umPedidoColIdx = colIdx('um_pedido');
    const moedaColIdx = colIdx('moeda');
    const estadoLiberacaoColIdx = colIdx('estado_liberacao');
    const codigoLiberacaoColIdx = colIdx('codigo_liberacao');
    const valorLiquidoPedidoColIdx = colIdx('valor_liquido_pedido');
    const requisitanteColIdx = colIdx('requisitante');
    const historicoPedidoColIdx = colIdx('historico_pedido');
    const criadoPorColIdx = colIdx('criado_por');

    const user = this.getCurrentUser();
    const dbRows: any[] = [];
    const ignoredRows: any[] = [];

    const strAt = (row: any[], idx: number) => idx !== -1 ? String(row[idx] ?? '').trim() || null : null;
    const numAt = (row: any[], idx: number) => idx !== -1 ? (Number(row[idx]) || 0) : null;

    const dateAt = (row: any[], idx: number): string | null => {
      if (idx === -1) return null;
      const raw = row[idx];
      if (raw === null || raw === undefined || raw === '') return null;

      if (typeof raw === 'number') {
        if (isNaN(raw) || raw <= 0) return null;
        const dateObj = new Date((raw - 25569) * 86400 * 1000);
        return isNaN(dateObj.getTime()) ? null : dateObj.toISOString().split('T')[0];
      }

      if (raw instanceof Date) {
        return isNaN(raw.getTime()) ? null : raw.toISOString().split('T')[0];
      }

      const str = String(raw).trim();
      if (!str) return null;

      // Formato YYYY-MM-DD
      if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
        return str.substring(0, 10);
      }

      // Formato BR: DD/MM/YYYY, DD.MM.YYYY ou DD-MM-YYYY
      const brMatch = str.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
      if (brMatch) {
        const day = brMatch[1].padStart(2, '0');
        const month = brMatch[2].padStart(2, '0');
        const year = brMatch[3];
        return `${year}-${month}-${day}`;
      }

      const d = new Date(str);
      return !isNaN(d.getTime()) ? d.toISOString().split('T')[0] : null;
    };

    dataRows.forEach((row, index) => {
      const fileRowIndex = index + 2;
      const documentoCompras = strAt(row, documentoColIdx);

      if (!documentoCompras) {
        ignoredRows.push({
          row: fileRowIndex,
          identifier: 'N/A',
          reason: 'Documento de compras vazio.'
        });
        return;
      }

      dbRows.push({
        documento_compras: documentoCompras,
        data_documento: dateAt(row, dataDocumentoColIdx),
        fornecedor: strAt(row, fornecedorColIdx),
        centro: strAt(row, centroColIdx),
        item: strAt(row, itemColIdx),
        material: strAt(row, materialColIdx),
        texto_breve: strAt(row, textoBreveColIdx),
        qtd_solicit_anterior: numAt(row, qtdSolicitAnteriorColIdx),
        unidade_preco: strAt(row, unidadePrecoColIdx),
        preco_liquido: numAt(row, precoLiquidoColIdx),
        valor_solicitado: numAt(row, valorSolicitadoColIdx),
        valor_efetivo: numAt(row, valorEfetivoColIdx),
        qtd_prev_pendente: numAt(row, qtdPrevPendenteColIdx),
        valor_pendente: numAt(row, valorPendenteColIdx),
        a_fornecer_qtd: numAt(row, aFornecerQtdColIdx),
        a_fornecer_valor: numAt(row, aFornecerValorColIdx),
        ainda_faturar_qtd: numAt(row, aindaFaturarQtdColIdx),
        ainda_faturar_valor: numAt(row, aindaFaturarValorColIdx),
        fim_validade: dateAt(row, fimValidadeColIdx),
        inicio_validade: dateAt(row, inicioValidadeColIdx),
        codigo_eliminacao: strAt(row, codigoEliminacaoColIdx),
        um_pedido: strAt(row, umPedidoColIdx),
        moeda: strAt(row, moedaColIdx),
        estado_liberacao: strAt(row, estadoLiberacaoColIdx),
        codigo_liberacao: strAt(row, codigoLiberacaoColIdx),
        valor_liquido_pedido: numAt(row, valorLiquidoPedidoColIdx),
        requisitante: strAt(row, requisitanteColIdx),
        historico_pedido: strAt(row, historicoPedidoColIdx),
        criado_por: strAt(row, criadoPorColIdx),
        imported_at: new Date().toISOString()
      });
    });

    onProgress?.(10);

    const isTableMissingError = (err: any) => {
      if (!err) return false;
      const code = String(err.code || '');
      const status = err.status || err.statusCode;
      const msg = String(err.message || '').toLowerCase();
      return status === 404 || code === 'PGRST204' || code === '42P01' || msg.includes('not find') || msg.includes('does not exist');
    };

    try {
      // Tenta a nova tabela me3n_contratos com fallback transparente para me3m_contratos se necessário
      let targetTable = 'me3n_contratos';

      // Chaves já existentes (documento_compras + item), para diferenciar
      // inserção de atualização e apontar o que saiu do arquivo — sem apagar
      // nada: o upsert abaixo só toca as linhas que vieram nesta importação.
      let existingRes = await supabase.from(targetTable).select('documento_compras, item');
      if (isTableMissingError(existingRes.error)) {
        targetTable = 'me3m_contratos';
        existingRes = await supabase.from(targetTable).select('documento_compras, item');
      }
      const chave = (doc: string, item: string | null) => `${doc}||${item ?? ''}`;
      const existingKeys = new Set<string>();
      (existingRes.data || []).forEach((r: any) => existingKeys.add(chave(r.documento_compras, r.item)));

      const newKeys = new Set<string>();
      let recordsInserted = 0;
      let recordsUpdated = 0;
      dbRows.forEach(r => {
        const k = chave(r.documento_compras, r.item);
        newKeys.add(k);
        if (existingKeys.has(k)) recordsUpdated++; else recordsInserted++;
      });
      let recordsEliminated = 0;
      existingKeys.forEach(k => { if (!newKeys.has(k)) recordsEliminated++; });

      onProgress?.(20);

      const totalBatches = Math.ceil(dbRows.length / 500) || 1;
      for (let i = 0; i < dbRows.length; i += 500) {
        const batch = dbRows.slice(i, i + 500);
        const { error } = await supabase.from(targetTable).upsert(batch, { onConflict: 'documento_compras,item' });
        if (error) {
          if (isTableMissingError(error) && targetTable === 'me3n_contratos') {
            targetTable = 'me3m_contratos';
            const retryUpsert = await supabase.from(targetTable).upsert(batch, { onConflict: 'documento_compras,item' });
            if (retryUpsert.error) throw retryUpsert.error;
          } else {
            throw error;
          }
        }
        const batchIndex = Math.floor(i / 500) + 1;
        onProgress?.(20 + Math.round((batchIndex / totalBatches) * 70));
      }

      const logId = 'il_' + Math.random().toString(36).substr(2, 9);
      const logObj = {
        id: logId,
        type: 'ME3N',
        user_name: user?.name || 'Sistema',
        filename,
        records_read: dataRows.length,
        records_inserted: recordsInserted,
        records_updated: recordsUpdated,
        records_unchanged: 0,
        records_eliminated: recordsEliminated,
        columns_missing: missingColumns,
        columns_new: newColumns,
        quantity_changes: [],
        missing_ris: [],
        ignored_rows: ignoredRows,
        created_at: new Date().toISOString()
      };

      await supabase.from('import_logs').insert(logObj);
      onProgress?.(95);

      const logs = this.getStorageItem<SAPImportLog[]>(this.importLogsKey, []);
      logs.unshift(logObj as any);
      this.setStorageItem(this.importLogsKey, logs);

      await this.bumpDatasetVersion('contratos', dbRows.length);

      this.logActivity(user?.id || 'sistema', 'Suprimentos', 'Importar Contratos', `Importou Contratos ME3N (${filename}). Lidos: ${dataRows.length}, novos: ${recordsInserted}, atualizados: ${recordsUpdated}, ausentes neste arquivo: ${recordsEliminated}.`);

      onProgress?.(100);
      return logObj as any;
    } catch (e) {
      console.error('Erro ao salvar importação de contratos (ME3N) no Supabase:', e);
      throw e;
    }
  }

  // Alias para retrocompatibilidade
  public async importME3MRaw(rawRows: any[][], filename: string, onProgress?: (percent: number) => void): Promise<SAPImportLog> {
    return this.importME3NRaw(rawRows, filename, onProgress);
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

  private TABELA_FRETE_COLUMNS = [
    { header: 'ORIGEM', field: 'origem' },
    { header: 'UF', field: 'uf' },
    { header: 'DESTINO', field: 'destino' },
    { header: 'ROTAS', field: 'rotas' },
    { header: '1 - 10 kg', field: 'kg_1_10' },
    { header: '11 - 20 kg', field: 'kg_11_20' },
    { header: '21 - 30 kg', field: 'kg_21_30' },
    { header: '31 - 50 kg', field: 'kg_31_50' },
    { header: '51 - 70 kg', field: 'kg_51_70' },
    { header: '71 - 100 kg', field: 'kg_71_100' },
    { header: 'Acima de 100 kg', field: 'kg_acima_100' },
    { header: 'LEAD-TIME ENTREGA', field: 'lead_time_entrega' },
    { header: 'AD. VALORES', field: 'ad_valores' },
    { header: 'Pedagio a cada fração de 100kg', field: 'pedagio_fracao_100kg' },
    { header: 'CAT', field: 'cat' },
    { header: 'ITR/TAS', field: 'itr_tas' },
    { header: 'Taxa Fixa ITR/ REDESPACHO', field: 'taxa_fixa_itr_redespacho' },
    { header: 'FIORINO', field: 'fiorino' },
    { header: '3/4 (ate 2,5 ton)', field: 'veiculo_3_4_ate_2_5t' },
    { header: 'TOCO (ate 5,5 ton)', field: 'toco_ate_5_5t' },
    { header: 'TRUCK (até 14 ton)', field: 'truck_ate_14t' },
    { header: 'CARRETA (ate 25ton)', field: 'carreta_ate_25t' },
    { header: 'CARRETA (acima 27001 ton)', field: 'carreta_acima_27t' },
    { header: 'LEAD TIME ENTREGA', field: 'lead_time_entrega_2' },
    { header: 'ICMS APLICADO', field: 'icms_aplicado' }
  ];

  public getTabelaFrete(): any[] {
    return this.getStorageItem<any[]>(this.tabelaFreteKey, []);
  }

  public async importTabelaFreteRaw(
    rawRows: any[][],
    filename: string,
    onProgress?: (percent: number, message?: string) => void
  ): Promise<SAPImportLog> {
    if (rawRows.length < 2) {
      throw new Error('Formato rejeitado: Linhas insuficientes no arquivo.');
    }

    onProgress?.(5, 'Reconciliando colunas da Tabela de Frete...');
    const headers = rawRows[0].map(h => String(h || '').trim());
    const dataRows = rawRows.slice(1).filter(r => r.some(c => c !== ''));

    const { mappedFields, missingColumns, newColumns } = this.reconcileSchema(headers, this.TABELA_FRETE_COLUMNS);

    const colIdx = (field: string) => mappedFields.findIndex(f => f === field);

    const ltIndices: number[] = [];
    headers.forEach((h, idx) => {
      const cleanH = h.toLowerCase().trim();
      if (cleanH.includes('lead-time') || cleanH.includes('lead time')) {
        ltIndices.push(idx);
      }
    });

    const origemIdx = colIdx('origem');
    const ufIdx = colIdx('uf');
    const destinoIdx = colIdx('destino');
    const rotasIdx = colIdx('rotas');
    const kg1_10Idx = colIdx('kg_1_10');
    const kg11_20Idx = colIdx('kg_11_20');
    const kg21_30Idx = colIdx('kg_21_30');
    const kg31_50Idx = colIdx('kg_31_50');
    const kg51_70Idx = colIdx('kg_51_70');
    const kg71_100Idx = colIdx('kg_71_100');
    const kgAcima100Idx = colIdx('kg_acima_100');
    const lt1Idx = colIdx('lead_time_entrega') !== -1 ? colIdx('lead_time_entrega') : (ltIndices[0] ?? -1);
    const adValoresIdx = colIdx('ad_valores');
    const pedagioIdx = colIdx('pedagio_fracao_100kg');
    const catIdx = colIdx('cat');
    const itrTasIdx = colIdx('itr_tas');
    const taxaFixaItrIdx = colIdx('taxa_fixa_itr_redespacho');
    const fiorinoIdx = colIdx('fiorino');
    const v3_4Idx = colIdx('veiculo_3_4_ate_2_5t');
    const tocoIdx = colIdx('toco_ate_5_5t');
    const truckIdx = colIdx('truck_ate_14t');
    const carreta25tIdx = colIdx('carreta_ate_25t');
    const carretaAcima27tIdx = colIdx('carreta_acima_27t');
    const lt2Idx = colIdx('lead_time_entrega_2') !== -1 ? colIdx('lead_time_entrega_2') : (ltIndices[1] ?? -1);
    const icmsIdx = colIdx('icms_aplicado');

    const user = this.getCurrentUser();
    const dbRows: any[] = [];
    const ignoredRows: any[] = [];

    const parseNum = (val: any): number => {
      if (val === null || val === undefined || val === '') return 0;
      if (typeof val === 'number') return isNaN(val) ? 0 : val;
      let str = String(val).trim().replace(/R\$\s?/, '').replace(/%\s?/, '').replace(/\s/g, '');
      if (!str) return 0;
      if (str.includes(',') && str.includes('.')) {
        str = str.replace(/\./g, '').replace(',', '.');
      } else if (str.includes(',')) {
        str = str.replace(',', '.');
      }
      const n = parseFloat(str);
      return isNaN(n) ? 0 : n;
    };

    const strVal = (row: any[], idx: number) => idx !== -1 ? String(row[idx] ?? '').trim() : '';

    dataRows.forEach((row, index) => {
      const fileRowIndex = index + 2;
      const origem = strVal(row, origemIdx);
      const destino = strVal(row, destinoIdx);

      if (!origem && !destino) {
        ignoredRows.push({
          row: fileRowIndex,
          identifier: 'N/A',
          reason: 'Linha sem Origem e sem Destino.'
        });
        return;
      }

      dbRows.push({
        origem,
        uf: strVal(row, ufIdx),
        destino,
        rotas: strVal(row, rotasIdx),
        kg_1_10: parseNum(row[kg1_10Idx]),
        kg_11_20: parseNum(row[kg11_20Idx]),
        kg_21_30: parseNum(row[kg21_30Idx]),
        kg_31_50: parseNum(row[kg31_50Idx]),
        kg_51_70: parseNum(row[kg51_70Idx]),
        kg_71_100: parseNum(row[kg71_100Idx]),
        kg_acima_100: parseNum(row[kgAcima100Idx]),
        lead_time_entrega: strVal(row, lt1Idx),
        ad_valores: parseNum(row[adValoresIdx]),
        pedagio_fracao_100kg: parseNum(row[pedagioIdx]),
        cat: parseNum(row[catIdx]),
        itr_tas: parseNum(row[itrTasIdx]),
        taxa_fixa_itr_redespacho: parseNum(row[taxaFixaItrIdx]),
        fiorino: parseNum(row[fiorinoIdx]),
        veiculo_3_4_ate_2_5t: parseNum(row[v3_4Idx]),
        toco_ate_5_5t: parseNum(row[tocoIdx]),
        truck_ate_14t: parseNum(row[truckIdx]),
        carreta_ate_25t: parseNum(row[carreta25tIdx]),
        carreta_acima_27t: parseNum(row[carretaAcima27tIdx]),
        lead_time_entrega_2: strVal(row, lt2Idx),
        icms_aplicado: strVal(row, icmsIdx),
        updated_at: new Date().toISOString()
      });
    });

    onProgress?.(30, `Preparando ${dbRows.length} registros de frete para envio ao Supabase...`);

    try {
      if (supabase) {
        const { error: deleteError } = await supabase.from('tabela_frete').delete().neq('origem', '___INVALID_KEY___');
        if (deleteError) console.warn('Aviso ao limpar tabela_frete anterior:', deleteError.message);

        for (let i = 0; i < dbRows.length; i += 50) {
          const pct = Math.floor(30 + ((i / dbRows.length) * 60));
          onProgress?.(pct, `Salvando lote ${Math.floor(i / 50) + 1}...`);
          const { error } = await supabase.from('tabela_frete').insert(dbRows.slice(i, i + 50));
          if (error) throw error;
        }
      }

      const logId = 'il_' + Math.random().toString(36).substr(2, 9);
      const logObj = {
        id: logId,
        type: 'TABELA_FRETE',
        user_name: user?.name || 'Sistema',
        filename,
        records_read: dataRows.length,
        records_inserted: dbRows.length,
        records_updated: 0,
        records_unchanged: 0,
        records_eliminated: 0,
        columns_missing: missingColumns,
        columns_new: newColumns,
        quantity_changes: [],
        missing_ris: [],
        created_at: new Date().toISOString(),
        ignored_rows: ignoredRows
      };

      if (supabase) {
        await supabase.from('import_logs').insert(logObj);
      }

      this.setStorageItem(this.tabelaFreteKey, dbRows);

      const logs = this.getStorageItem<SAPImportLog[]>(this.importLogsKey, []);
      logs.unshift(logObj as any);
      this.setStorageItem(this.importLogsKey, logs);

      await this.bumpDatasetVersion('tabela_frete', dbRows.length);

      this.logActivity(user?.id || 'sistema', 'Suprimentos', 'Importar Tabela de Frete', `Importou Tabela de Frete (${filename}). Lidos: ${dataRows.length}, salvos: ${dbRows.length}.`);

      onProgress?.(100, 'Importação concluída com sucesso!');
      return logObj as any;
    } catch (e: any) {
      console.error('Erro ao importar Tabela de Frete no Supabase:', e);
      throw e;
    }
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

  // Busca leve dos logs de importação: sem `ignored_rows`/`missing_ris` (jsonb
  // que concentra quase todo o peso da tabela — ver plano de egress, P0) e
  // limitada aos 50 mais recentes. `ignored_rows_count`/`missing_ris_count`
  // (colunas geradas no banco) permitem manter os badges "N ignorados" na
  // listagem sem baixar o conteúdo completo.
  private async syncImportLogs(): Promise<void> {
    if (!supabase) return;
    const { data, error } = await supabase
      .from('import_logs')
      .select('id,type,filename,user_name,created_at,records_read,records_inserted,records_updated,records_unchanged,records_eliminated,columns_new,columns_missing,quantity_changes,ignored_rows_count,missing_ris_count')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    this.setStorageItem(this.importLogsKey, data || []);
  }

  // Busca sob demanda o conteúdo pesado (`ignored_rows`, `missing_ris`) de UM
  // log de importação — chamada quando o usuário expande a linha no AdminPanel,
  // em vez de baixar isso para todos os logs em todo sync.
  public async fetchImportLogDetail(id: string): Promise<{ ignored_rows: SAPImportLog['ignored_rows']; missing_ris: string[] } | null> {
    if (!supabase) return null;
    const { data, error } = await supabase
      .from('import_logs')
      .select('ignored_rows, missing_ris')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data as { ignored_rows: SAPImportLog['ignored_rows']; missing_ris: string[] } | null;
  }

  // --- SYSTEM UTILITY ADDITIONS ---

  public async updateUserStatus(userId: string, status: 'ativo' | 'rejeitado' | 'inativo'): Promise<boolean> {
    const users = this.getProfiles();
    const idx = users.findIndex(u => u.id === userId);
    if (idx === -1) return false;

    const prevStatus = users[idx].status;
    const prevRoles = users[idx].roles;

    users[idx].status = status as any;
    if (status === 'ativo' && users[idx].roles.includes('pendente')) {
      users[idx].roles = ['visualizador'];
    }
    this.setStorageItem(this.profilesKey, users);

    if (supabase) {
      const { error } = await supabase.from('profiles')
        .update({
          status: status,
          roles: users[idx].roles
        })
        .eq('id', userId);

      if (error) {
        console.error('Erro ao sincronizar status do usuário no Supabase:', error);
        // Reverte o cache local: sem isso o admin veria a mudança como aplicada
        // enquanto o Supabase (visto por todos os outros usuários) mantém o valor antigo.
        const revertUsers = this.getProfiles();
        const revertIdx = revertUsers.findIndex(u => u.id === userId);
        if (revertIdx !== -1) {
          revertUsers[revertIdx].status = prevStatus;
          revertUsers[revertIdx].roles = prevRoles;
          this.setStorageItem(this.profilesKey, revertUsers);
        }
        return false;
      }
    }

    this.logActivity('admin', 'Administração', 'Aprovar Usuário', `Usuário ${users[idx].name} status atualizado para ${status}.`);
    return true;
  }

  public async updateUserRole(userId: string, role: string): Promise<boolean> {
    const users = this.getProfiles();
    const idx = users.findIndex(u => u.id === userId);
    if (idx === -1) return false;

    const prevRoles = users[idx].roles;
    const prevStatus = users[idx].status;

    users[idx].roles = [role as any];
    if (users[idx].status === 'pendente' && role !== 'pendente') {
      users[idx].status = 'ativo';
    }
    this.setStorageItem(this.profilesKey, users);

    if (supabase) {
      const { error } = await supabase.from('profiles')
        .update({
          roles: [role],
          status: users[idx].status
        })
        .eq('id', userId);

      if (error) {
        console.error('Erro ao sincronizar papéis do usuário no Supabase:', error);
        const revertUsers = this.getProfiles();
        const revertIdx = revertUsers.findIndex(u => u.id === userId);
        if (revertIdx !== -1) {
          revertUsers[revertIdx].roles = prevRoles;
          revertUsers[revertIdx].status = prevStatus;
          this.setStorageItem(this.profilesKey, revertUsers);
        }
        return false;
      }
    }

    this.logActivity('admin', 'Administração', 'Editar Perfil', `Perfil de ${users[idx].name} alterado para papel ${role}.`);
    return true;
  }

  // Define o grupo de compras SAP (ex.: 314, 358) associado a este usuário,
  // editável na tela de Gestão de Usuários (Admin). Vazio remove a associação.
  public async updateUserGrupoCompras(userId: string, grupoCompras: string): Promise<boolean> {
    const users = this.getProfiles();
    const idx = users.findIndex(u => u.id === userId);
    if (idx === -1) return false;

    const prevValue = users[idx].grupo_compras;
    const value = grupoCompras.trim() || null;
    users[idx].grupo_compras = value;
    this.setStorageItem(this.profilesKey, users);

    if (supabase) {
      const { error } = await supabase.from('profiles')
        .update({ grupo_compras: value })
        .eq('id', userId);

      if (error) {
        console.error('Erro ao sincronizar grupo de compras no Supabase:', error);
        const revertUsers = this.getProfiles();
        const revertIdx = revertUsers.findIndex(u => u.id === userId);
        if (revertIdx !== -1) {
          revertUsers[revertIdx].grupo_compras = prevValue;
          this.setStorageItem(this.profilesKey, revertUsers);
        }
        return false;
      }
    }

    this.logActivity('admin', 'Administração', 'Editar Perfil', `Grupo de compras de ${users[idx].name} definido como "${value ?? '—'}".`);
    return true;
  }

  // Define a lista de setores solicitantes que este usuário pode aprovar
  // (solicitações de compra), editável na coluna "Aprovador" de Gestão de
  // Usuários. É a única regra usada em Approvals/notificações para decidir
  // quem vê e é notificado de cada solicitação.
  public async updateUserAprovadorSetores(userId: string, sectorIds: string[]): Promise<boolean> {
    const users = this.getProfiles();
    const idx = users.findIndex(u => u.id === userId);
    if (idx === -1) return false;

    const prevSectorIds = users[idx].aprovador_setores;
    users[idx].aprovador_setores = sectorIds;
    this.setStorageItem(this.profilesKey, users);

    if (supabase) {
      const { error } = await supabase.from('profiles')
        .update({ aprovador_setores: sectorIds })
        .eq('id', userId);

      if (error) {
        console.error('Erro ao sincronizar setores de aprovação no Supabase:', error);
        const revertUsers = this.getProfiles();
        const revertIdx = revertUsers.findIndex(u => u.id === userId);
        if (revertIdx !== -1) {
          revertUsers[revertIdx].aprovador_setores = prevSectorIds;
          this.setStorageItem(this.profilesKey, revertUsers);
        }
        return false;
      }
    }

    this.logActivity('admin', 'Administração', 'Editar Perfil', `Setores de aprovação de ${users[idx].name} atualizados (${sectorIds.length} setor(es)).`);
    return true;
  }

  // Marca/desmarca este usuário como aprovador de Cadastro SAP, editável no
  // mesmo modal "Aprovador" de Gestão de Usuários. Aditivo: soma com a
  // notificação automática por role (coordenador_suprimentos/comprador) em
  // submitRequest/saveRequestEdit, não a substitui.
  public async updateUserAprovadorCadastroSap(userId: string, value: boolean): Promise<boolean> {
    const users = this.getProfiles();
    const idx = users.findIndex(u => u.id === userId);
    if (idx === -1) return false;

    const prevValue = users[idx].aprovador_cadastro_sap;
    users[idx].aprovador_cadastro_sap = value;
    this.setStorageItem(this.profilesKey, users);

    if (supabase) {
      const { error } = await supabase.from('profiles')
        .update({ aprovador_cadastro_sap: value })
        .eq('id', userId);

      if (error) {
        console.error('Erro ao sincronizar aprovador de Cadastro SAP no Supabase:', error);
        const revertUsers = this.getProfiles();
        const revertIdx = revertUsers.findIndex(u => u.id === userId);
        if (revertIdx !== -1) {
          revertUsers[revertIdx].aprovador_cadastro_sap = prevValue;
          this.setStorageItem(this.profilesKey, revertUsers);
        }
        return false;
      }
    }

    this.logActivity('admin', 'Administração', 'Editar Perfil', `${users[idx].name} ${value ? 'marcado' : 'desmarcado'} como aprovador de Cadastro SAP.`);
    return true;
  }

  // Persiste que o usuário já viu um tour guiado específico (ex.: 'nova-solicitacao'),
  // gravando no cache local do usuário logado e na coluna tours_seen da tabela profiles.
  public async markTourSeen(tourId: string): Promise<boolean> {
    const user = this.getCurrentUser();
    if (!user) return false;

    const users = this.getProfiles();
    const idx = users.findIndex(u => u.id === user.id);

    const currentTours: Record<string, boolean> = {
      ...(user.tours_seen || {}),
      ...(idx !== -1 ? users[idx].tours_seen || {} : {}),
      [tourId]: true,
    };

    user.tours_seen = currentTours;
    this.setStorageItem(this.currentUserKey, user);

    if (idx !== -1) {
      users[idx].tours_seen = currentTours;
      this.setStorageItem(this.profilesKey, users);
    }

    if (supabase) {
      try {
        const { error } = await supabase
          .from('profiles')
          .update({ tours_seen: currentTours })
          .eq('id', user.id);

        if (error) {
          console.warn('Coluna tours_seen indisponível em profiles ou erro ao atualizar no Supabase:', error);
          await supabase.auth.updateUser({
            data: { tours_seen: currentTours }
          }).catch(console.error);
        }
      } catch (err) {
        console.warn('Erro ao persistir tour visto no Supabase:', err);
      }
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

  public async updateRequestStatus(reqId: string, status: RequestStatus, actorId?: string, comment?: string): Promise<boolean> {
    if (status === 'em_atendimento' && actorId) {
      const user = this.getProfiles().find(u => u.id === actorId);
      if (user) {
        await this.assignAtendente(reqId, actorId, user.name);
        return true;
      }
    }
    return await this.transitionRequestStatus(reqId, status, comment);
  }

  /** Prazo de conclusão do quadro Kanban (Contratos > Demandas). `prazo` em ISO (YYYY-MM-DD) ou null para limpar. */
  public async updateRequestPrazoConclusao(reqId: string, prazo: string | null): Promise<void> {
    const requests = this.getRequests();
    const idx = requests.findIndex(r => r.id === reqId);
    if (idx === -1) return;

    requests[idx] = { ...requests[idx], prazo_conclusao: prazo, updated_at: new Date().toISOString() };
    this.setStorageItem(this.requestsKey, requests);
    await this.publishRequestRow(requests[idx]);
    this.notifyListeners();
  }

  /** Título editável do card do Kanban (Contratos > Demandas). */
  public async updateRequestTitulo(reqId: string, titulo: string): Promise<void> {
    const requests = this.getRequests();
    const idx = requests.findIndex(r => r.id === reqId);
    if (idx === -1) return;

    requests[idx] = { ...requests[idx], titulo: titulo || null, updated_at: new Date().toISOString() };
    this.setStorageItem(this.requestsKey, requests);
    await this.publishRequestRow(requests[idx]);
    this.notifyListeners();
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

  public async addComment(reqId: string, userId: string, text: string, type: string): Promise<void> {
    const user = this.getProfiles().find(u => u.id === userId);
    if (!user) return;
    const comments = this.getStorageItem<RequestComment[]>(this.commentsKey, []);
    const novo: RequestComment = {
      id: 'c_' + gerarUUID(),
      request_id: reqId,
      user_id: userId,
      user_name: user.name,
      user_roles: user.roles,
      content: text,
      is_internal: type === 'internal',
      created_at: new Date().toISOString()
    };
    comments.push(novo);
    this.setStorageItem(this.commentsKey, comments);

    await this.publishChildRow('request_comments', novo);
  }

  /* Anexos ---------------------------------------------------------------- */

  /**
   * @param itemId Quando informado, devolve só os anexos daquele item de compra.
   *   Omitido, devolve todos os da solicitação (é o caso do Cadastro SAP, que
   *   não tem itens, e da galeria geral em Minhas Solicitações).
   */
  public getAttachments(reqId: string, itemId?: string): RequestAttachment[] {
    const list = this.getStorageItem<RequestAttachment[]>(this.attachmentsKey, []);
    const daSolicitacao = list.filter(a => a.request_id === reqId);
    return itemId ? daSolicitacao.filter(a => a.request_item_id === itemId) : daSolicitacao;
  }

  /**
   * Sobe os anexos já comprimidos para o Storage e grava a metadata.
   *
   * Uma falha isolada não aborta as demais: neste ponto a solicitação já foi
   * criada, e perder um anexo não pode desfazê-la. Os nomes que falharam voltam
   * para a UI avisar o usuário.
   */
  public async uploadAttachments(
    reqId: string,
    entries: { prepared: PreparedAttachment; requestItemId?: string }[]
  ): Promise<{ uploaded: number; failed: string[] }> {
    const failed: string[] = [];
    let uploaded = 0;

    if (entries.length === 0) return { uploaded, failed };
    if (!supabase) {
      return { uploaded, failed: entries.map(e => e.prepared.name) };
    }

    // `request_attachments.request_id` tem FK para `requests`: sem a
    // solicitação publicada, o insert da metadata falha depois que os bytes já
    // foram para o Storage, deixando arquivo órfão. Publicar antes cobre também
    // o anexo tardio em solicitação antiga, criada quando nada subia.
    const parente = this.getRequests().find(r => r.id === reqId);
    if (!parente || !(await this.publishRequest(parente))) {
      console.error(`Anexos não enviados: a solicitação ${reqId} não pôde ser publicada no Supabase.`);
      return { uploaded, failed: entries.map(e => e.prepared.name) };
    }

    const user = this.getCurrentUser();
    const list = this.getStorageItem<RequestAttachment[]>(this.attachmentsKey, []);

    for (const { prepared, requestItemId } of entries) {
      try {
        // Prefixo por solicitação para que uma futura policy de Storage por dono
        // possa ser escrita sem precisar mover arquivo.
        const ext = prepared.name.split('.').pop() || 'bin';
        const path = `${reqId}/${requestItemId || '_geral'}/${gerarUUID()}.${ext}`;

        const { error: upErr } = await supabase.storage
          .from(ATTACHMENTS_BUCKET)
          .upload(path, prepared.blob, { contentType: prepared.mimeType, upsert: false });
        if (upErr) throw upErr;

        const row: RequestAttachment = {
          id: 'att_' + gerarUUID(),
          request_id: reqId,
          request_item_id: requestItemId,
          name: prepared.name,
          url: path,
          storage_path: path,
          mime_type: prepared.mimeType,
          size: prepared.sizeCompressed,
          size_original: prepared.sizeOriginal,
          uploaded_by: user?.id,
          created_at: new Date().toISOString()
        };

        const { error: dbErr } = await supabase.from('request_attachments').insert(row);
        if (dbErr) throw dbErr;

        list.push(row);
        uploaded++;
      } catch (err) {
        console.error(`Falha ao enviar o anexo "${prepared.name}".`, err);
        failed.push(prepared.name);
      }
    }

    this.setStorageItem(this.attachmentsKey, list);
    this.notifyListeners();
    return { uploaded, failed };
  }

  /**
   * Exclui um anexo — arquivo no Storage e registro.
   *
   * Definitiva: não há soft delete nem lixeira. Só o autor da solicitação pode
   * excluir; a policy do bucket é permissiva para autenticado, como as demais
   * do projeto, então este é o gate que vale.
   *
   * Se o objeto já não estiver no Storage, o registro é apagado assim mesmo: o
   * que não pode sobreviver é a linha sem o arquivo, que viraria miniatura
   * quebrada para sempre.
   *
   * @returns Erro em texto quando recusada; null em caso de sucesso.
   */
  public async deleteAttachment(anexoId: string): Promise<string | null> {
    const user = this.getCurrentUser();
    if (!user) return 'Não autenticado.';
    if (!supabase) return 'Sem conexão com o servidor.';

    const lista = this.getStorageItem<RequestAttachment[]>(this.attachmentsKey, []);
    const anexo = lista.find(a => a.id === anexoId);
    if (!anexo) return 'Anexo não encontrado.';

    const solicitacao = this.getRequests().find(r => r.id === anexo.request_id);
    if (!solicitacao) return 'Solicitação não encontrada.';
    if (solicitacao.solicitante_id !== user.id) {
      return 'Apenas quem abriu a solicitação pode excluir seus anexos.';
    }

    const caminho = anexo.storage_path || anexo.url;

    try {
      // Falha aqui não interrompe: o registro precisa sair de qualquer forma,
      // senão a tela continuaria mostrando um anexo que o usuário mandou apagar.
      const { error: storageErr } = await supabase.storage.from(ATTACHMENTS_BUCKET).remove([caminho]);
      if (storageErr) console.error(`Falha ao remover o arquivo "${caminho}" do Storage.`, storageErr);

      const { error: dbErr } = await supabase.from('request_attachments').delete().eq('id', anexoId);
      if (dbErr) throw dbErr;
    } catch (err) {
      console.error('Falha ao excluir o anexo.', err);
      return 'Não foi possível excluir o anexo. Tente novamente.';
    }

    this.signedUrlCache.delete(caminho);
    this.setStorageItem(this.attachmentsKey, lista.filter(a => a.id !== anexoId));
    this.logActivity(user.id, 'Solicitações', 'Excluir Anexo', `Excluiu o anexo "${anexo.name}" da solicitação #${solicitacao.number}.`);
    this.notifyListeners();
    return null;
  }

  /**
   * URL assinada para exibir um anexo do bucket privado.
   *
   * Cacheada em memória por caminho: a galeria re-renderiza a cada tecla digitada
   * na tela, e assinar de novo a cada render seria uma request por miniatura. O
   * TTL do cache é metade do da assinatura, para nunca entregar uma URL que
   * expire enquanto está na tela.
   */
  public async getAttachmentUrl(path: string): Promise<string | null> {
    if (!supabase || !path) return null;

    const cached = this.signedUrlCache.get(path);
    if (cached && cached.expiresAt > Date.now()) return cached.url;

    const { data, error } = await supabase.storage
      .from(ATTACHMENTS_BUCKET)
      .createSignedUrl(path, SIGNED_URL_TTL_SEGUNDOS);

    if (error || !data?.signedUrl) {
      console.error('Falha ao gerar URL do anexo.', error);
      return null;
    }

    this.signedUrlCache.set(path, {
      url: data.signedUrl,
      expiresAt: Date.now() + (SIGNED_URL_TTL_SEGUNDOS / 2) * 1000
    });
    return data.signedUrl;
  }

  /**
   * Envia um reporte de bug/sugestão. Sobe o print (quando houver) primeiro;
   * só insere a linha da tabela depois — sem FK entre os dois, essa ordem
   * evita uma linha "órfã" apontando para um arquivo que falhou ao subir.
   */
  public async submitFeedbackReport(input: {
    type: 'bug' | 'sugestao';
    description: string;
    pagePath: string;
    screenshotBlob?: Blob | null;
    consoleLogs: FeedbackLogEntry[];
    errorStack?: string;
  }): Promise<boolean> {
    if (!supabase) return false;
    const user = this.getCurrentUser();
    if (!user) return false;

    const id = gerarUUID();
    let screenshotPath: string | null = null;

    if (input.screenshotBlob) {
      const path = `${id}/screenshot.webp`;
      const { error: upErr } = await supabase.storage
        .from(FEEDBACK_BUCKET)
        .upload(path, input.screenshotBlob, { contentType: input.screenshotBlob.type || 'image/webp', upsert: false });
      if (upErr) {
        console.error('Falha ao enviar o print do reporte.', upErr);
      } else {
        screenshotPath = path;
      }
    }

    const row: FeedbackReport = {
      id,
      type: input.type,
      status: 'novo',
      description: input.description,
      page_path: input.pagePath,
      user_id: user.id,
      user_name: user.name,
      user_email: user.email,
      screenshot_path: screenshotPath,
      console_logs: input.consoleLogs,
      error_stack: input.errorStack || null,
      user_agent: navigator.userAgent,
      admin_notes: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { error: dbErr } = await supabase.from('feedback_reports').insert(row);
    if (dbErr) {
      console.error('Falha ao registrar o reporte.', dbErr);
      return false;
    }
    return true;
  }

  /** Busca sob demanda para o painel admin — não entra no ciclo de sync geral (baixo volume, só admin lê). */
  public async getFeedbackReports(): Promise<FeedbackReport[]> {
    if (!supabase) return [];
    const { data, error } = await supabase
      .from('feedback_reports')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      console.error('Falha ao carregar reportes.', error);
      return [];
    }
    return (data || []) as FeedbackReport[];
  }

  public async updateFeedbackReport(id: string, patch: { status?: FeedbackReport['status']; admin_notes?: string }): Promise<boolean> {
    if (!supabase) return false;
    const { error } = await supabase
      .from('feedback_reports')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) {
      console.error('Falha ao atualizar o reporte.', error);
      return false;
    }
    return true;
  }

  /** URL assinada do print de um reporte — mesmo cache em memória e TTL dos anexos de solicitação. */
  public async getFeedbackScreenshotUrl(path: string): Promise<string | null> {
    if (!supabase || !path) return null;

    const cached = this.signedUrlCache.get(path);
    if (cached && cached.expiresAt > Date.now()) return cached.url;

    const { data, error } = await supabase.storage
      .from(FEEDBACK_BUCKET)
      .createSignedUrl(path, SIGNED_URL_TTL_SEGUNDOS);

    if (error || !data?.signedUrl) {
      console.error('Falha ao gerar URL do print.', error);
      return null;
    }

    this.signedUrlCache.set(path, {
      url: data.signedUrl,
      expiresAt: Date.now() + (SIGNED_URL_TTL_SEGUNDOS / 2) * 1000
    });
    return data.signedUrl;
  }

  // Profile Management methods
  public async updateProfileFields(userId: string, name: string, cargo: string): Promise<Profile | null> {
    const users = this.getProfiles();
    const idx = users.findIndex(u => u.id === userId);
    if (idx === -1) return null;

    const prevName = users[idx].name;
    const prevCargo = users[idx].cargo;

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

    if (supabase) {
      const { error } = await supabase.from('profiles')
        .update({ name, cargo })
        .eq('id', userId);

      if (error) {
        console.error('Erro ao sincronizar dados do perfil no Supabase:', error);
        // Reverte cache local e sessão: sem isso o usuário veria o novo nome/cargo
        // aplicado enquanto o Supabase mantém o valor antigo.
        const revertUsers = this.getProfiles();
        const revertIdx = revertUsers.findIndex(u => u.id === userId);
        if (revertIdx !== -1) {
          revertUsers[revertIdx].name = prevName;
          revertUsers[revertIdx].cargo = prevCargo;
          this.setStorageItem(this.profilesKey, revertUsers);
        }
        if (currentUser && currentUser.id === userId) {
          currentUser.name = prevName;
          currentUser.cargo = prevCargo;
          this.setStorageItem(this.currentUserKey, currentUser);
        }
        return null;
      }
    }

    this.logActivity(userId, 'Perfil', 'Atualização', `Nome atualizado para "${name}" e cargo para "${cargo}".`);
    return users[idx];
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
