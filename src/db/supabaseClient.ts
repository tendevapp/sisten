import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
import { configurarFilaOffline, fetchOffline } from '../lib/offline/filaSupabase';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const supabaseServiceKey = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'Supabase URL ou Anon Key não configuradas no arquivo .env. ' +
    'O aplicativo SISTEN apresentará falhas de comunicação com o backend.'
  );
}

// `fetchOffline`: os formulários seguem funcionando sem rede — leituras saem
// da última cópia guardada no aparelho e as gravações entram numa fila que
// sobe quando a conexão volta (ver lib/offline/filaSupabase.ts). Fora das
// tabelas dos formulários é o `fetch` de sempre.
export const supabase: SupabaseClient<Database> = supabaseUrl && supabaseAnonKey
  ? createClient<Database>(supabaseUrl, supabaseAnonKey, { global: { fetch: fetchOffline } })
  : null as any;

if (supabase) {
  configurarFilaOffline({
    urlSupabase: supabaseUrl.replace(/\/$/, ''),
    chaveAnon: supabaseAnonKey,
    fetchReal: (entrada, init) => fetch(entrada, init),
    obterToken: async () => (await supabase.auth.getSession()).data.session?.access_token ?? null,
    renovarToken: async () => (await supabase.auth.refreshSession()).data.session?.access_token ?? null,
  });
}

// Uma chave anônima nunca pode ser promovida a cliente de serviço. Quando a
// service_role não está disponível (o esperado no browser), operações comuns
// devem usar `supabase`, que carrega a sessão autenticada do usuário.
const chaveAdmin = supabaseServiceKey;

/**
 * Cliente de serviço, usado nas operações administrativas (criar usuário,
 * redefinir senha, gravar o perfil de outra pessoa).
 *
 * As opções abaixo não são detalhe: sem elas, os dois clientes dividem a mesma
 * chave de sessão no `localStorage` e este aqui "adota" a sessão do usuário
 * logado. As chamadas ao PostgREST passam então a sair com o JWT dele em vez
 * da service_role, caem na RLS e voltam **403** — enquanto `auth.admin.*`
 * continua funcionando, porque a Admin API manda a chave de serviço
 * explicitamente. O resultado é o pior tipo de bug: metade da operação passa,
 * metade é barrada.
 *
 * `storageKey` próprio + `persistSession: false` deixam este cliente sem
 * sessão nenhuma, e aí o supabase-js usa a própria chave como token.
 */
export const supabaseAdmin: SupabaseClient<Database> = supabaseUrl && chaveAdmin
  ? createClient<Database>(supabaseUrl, chaveAdmin, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        storageKey: 'sisten-service-role',
      },
      global: {
        headers: { Authorization: `Bearer ${chaveAdmin}` },
      },
    })
  : null as any;
