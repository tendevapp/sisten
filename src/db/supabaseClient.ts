import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const supabaseServiceKey = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'Supabase URL ou Anon Key não configuradas no arquivo .env. ' +
    'O aplicativo SISTEN apresentará falhas de comunicação com o backend.'
  );
}

export const supabase: SupabaseClient<Database> = supabaseUrl && supabaseAnonKey
  ? createClient<Database>(supabaseUrl, supabaseAnonKey)
  : null as any;

const chaveAdmin = supabaseServiceKey || supabaseAnonKey;

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
  : supabase;
