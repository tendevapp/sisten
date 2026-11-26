import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
import { configurarFilaOffline, fetchOffline } from '../lib/offline/filaSupabase';
import { medirFetch } from '../lib/desempenho/medidorFetch';
import { usuarioDaSessaoGuardada } from '../lib/offline/redePatio';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

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
//
// `medirFetch` por fora: cada chamada entra no Monitor de Desempenho (tempo,
// erro, volume) com o tempo que o usuário sentiu, cópia offline incluída
// (ver lib/desempenho/medidorFetch.ts).
//
// Este é o único cliente do navegador. Não existe cliente `service_role` aqui:
// tudo que começa com `VITE_` vai para o JavaScript público, então uma chave de
// serviço no build dá a qualquer visitante acesso total ao banco. Operações
// administrativas (criar usuário, redefinir senha) rodam nas Edge Functions
// `admin-criar-usuario` e `admin-reset-password`, e a edição de perfis por
// admin passa pela RLS/trigger de `core_perfis` com o JWT do próprio admin.
export const supabase: SupabaseClient<Database> = supabaseUrl && supabaseAnonKey
  ? createClient<Database>(supabaseUrl, supabaseAnonKey, { global: { fetch: medirFetch(fetchOffline) } })
  : null as any;

if (supabase) {
  configurarFilaOffline({
    urlSupabase: supabaseUrl.replace(/\/$/, ''),
    chaveAnon: supabaseAnonKey,
    fetchReal: (entrada, init) => fetch(entrada, init),
    obterToken: async () => (await supabase.auth.getSession()).data.session?.access_token ?? null,
    renovarToken: async () => (await supabase.auth.refreshSession()).data.session?.access_token ?? null,
    // Sessão que o Supabase guarda no aparelho: identifica quem estava logado
    // mesmo com o token vencido e sem rede para renovar (ver redePatio.ts).
    usuarioGuardado: () => {
      try {
        const entradas: [string, string | null][] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const chave = localStorage.key(i);
          if (chave) entradas.push([chave, localStorage.getItem(chave)]);
        }
        return usuarioDaSessaoGuardada(entradas);
      } catch {
        return null;
      }
    },
  });
}
