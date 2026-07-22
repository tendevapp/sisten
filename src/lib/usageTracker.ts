/**
 * Telemetria de uso do app (logins + navegação de páginas).
 *
 * Escreve direto no Supabase, fire-and-forget: nunca lança erro para a UI e
 * nunca bloqueia a navegação. Se estiver offline ou o Supabase indisponível, o
 * evento é simplesmente descartado — comportamento aceitável para analytics.
 *
 * O tempo de permanência em cada página NÃO é registrado aqui; é derivado no
 * SQL (função usage_page_ranking) pela diferença entre eventos consecutivos da
 * mesma sessão.
 */
import { supabase } from '../db/supabaseClient';
import { Profile } from '../types';

const SESSION_KEY = 'usage_session_id';

/** Rótulos amigáveis por rota, para exibição nos dashboards. */
const PATH_LABELS: Record<string, string> = {
  '/': 'Início',
  '/materiais/busca': 'Busca de Materiais',
  '/rastreio': 'Rastreio Compras',
  '/solicitacoes/nova': 'Nova Solicitação',
  '/solicitacoes/minhas': 'Minhas Solicitações',
  '/solicitacoes/aprovacoes': 'Aprovações',
  '/suprimentos/painel': 'Painel SAP',
  '/suprimentos/dashboards': 'Dashboards SAP',
  '/suprimentos/demandas': 'Demandas',
  '/suprimentos/fornecedores-sem-po': 'Central Compras',
  '/suprimentos/historico': 'Histórico',
  '/suprimentos/fornecedores': 'Fornecedores',
  '/suprimentos/cadastros-sap': 'Cadastros SAP',
  '/suprimentos/importar': 'Importar SAP',
  '/suprimentos/importar/log': 'Log Importação SAP',
  '/suprimentos/grupos-comprador': 'Grupos Comprador',
  '/helpdesk': 'Helpdesk (Atendimento)',
  '/helpdesk/relatorios': 'Relatórios Helpdesk',
  '/perfil': 'Perfil',
  '/relatorios': 'Relatórios',
  '/admin/usuarios': 'Admin: Usuários',
  '/admin/setores': 'Admin: Setores',
  '/admin/permissoes': 'Admin: Permissões',
  '/admin/importacao-materiais': 'Admin: Importação Materiais',
  '/admin/helpdesk': 'Admin: Config. Helpdesk',
  '/admin/uso': 'Admin: Uso do App',
};

export function labelForPath(path: string): string {
  return PATH_LABELS[path] || path;
}

/** Retorna o session_id da aba atual, criando um se ainda não existir. */
function getOrCreateSessionId(): { id: string; isNew: boolean } {
  try {
    const existing = sessionStorage.getItem(SESSION_KEY);
    if (existing) return { id: existing, isNew: false };
    const id =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `sess_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    sessionStorage.setItem(SESSION_KEY, id);
    return { id, isNew: true };
  } catch {
    // sessionStorage indisponível: sessão volátil só nesta chamada.
    return { id: `sess_${Date.now()}`, isNew: true };
  }
}

async function insertEvent(row: Record<string, unknown>): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.from('usage_events').insert(row);
  } catch (err) {
    // Telemetria nunca deve interromper a experiência do usuário.
    console.debug('usageTracker: falha ao registrar evento (ignorado)', err);
  }
}

/**
 * Registra um login. Só grava uma vez por sessão de aba (não re-registra em
 * refresh de página nem em refresh de token do Supabase).
 */
export function trackLogin(user: Profile | null): void {
  if (!user) return;
  const { id, isNew } = getOrCreateSessionId();
  if (!isNew) return;
  void insertEvent({
    user_id: user.id,
    user_name: user.name,
    email: user.email,
    session_id: id,
    event_type: 'login',
    path: null,
    page_label: null,
  });
}

/** Registra a visita a uma página. */
export function trackPageView(user: Profile | null, path: string): void {
  if (!user) return;
  const { id } = getOrCreateSessionId();
  void insertEvent({
    user_id: user.id,
    user_name: user.name,
    email: user.email,
    session_id: id,
    event_type: 'page_view',
    path,
    page_label: labelForPath(path),
  });
}
