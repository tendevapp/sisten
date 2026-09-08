/**
 * Edge Function "admin-reset-password" — redefinição de senha de um usuário
 * feita por um administrador.
 *
 * A Admin API do Supabase (`auth.admin.updateUserById`) exige a chave
 * `service_role`. Deixá-la no bundle do navegador expõe acesso total ao banco,
 * então a operação roda aqui: a função recebe o JWT do administrador logado,
 * confirma que o perfil dele tem o papel `admin` e só então usa a service_role
 * (disponível apenas no ambiente da função) para trocar a senha e marcar
 * `must_change_password`.
 *
 * Payload: { "userId": "<uuid>", "newPassword": "<min. 6 chars>" }
 * Resposta: { "ok": true } | { "error": "<mensagem>" }
 *
 * Deploy: npx supabase functions deploy admin-reset-password
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Método não permitido. Utilize POST.' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return json({ error: 'Função sem SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY configuradas.' }, 500);
  }

  // 1. Identifica o chamador pelo JWT enviado pelo client.
  const authHeader = req.headers.get('Authorization') || '';
  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    return json({ error: 'Sessão não enviada. Faça login novamente.' }, 401);
  }
  const supabaseCaller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: userErr } = await supabaseCaller.auth.getUser();
  if (userErr || !userData?.user) {
    return json({ error: 'Sessão inválida ou expirada.' }, 401);
  }
  const callerId = userData.user.id;

  // 2. Confirma que o chamador é administrador ativo.
  const supabaseService = createClient(supabaseUrl, serviceKey);
  const { data: perfil, error: perfilErr } = await supabaseService
    .from('core_perfis')
    .select('roles, status')
    .eq('id', callerId)
    .maybeSingle();
  if (perfilErr) {
    return json({ error: 'Falha ao verificar o perfil do administrador.' }, 500);
  }
  const roles: string[] = perfil?.roles ?? [];
  if (perfil?.status !== 'ativo' || !roles.includes('admin')) {
    return json({ error: 'Apenas administradores podem redefinir a senha de outro usuário.' }, 403);
  }

  // 3. Valida o payload.
  const body = await req.json().catch(() => ({}));
  const userId = String(body?.userId || '').trim();
  const newPassword = String(body?.newPassword || '');
  if (!userId) return json({ error: 'userId não informado.' }, 400);
  if (newPassword.length < 6) return json({ error: 'A senha provisória deve ter pelo menos 6 caracteres.' }, 400);

  // 4. Troca a senha via Admin API.
  const { error: pwErr } = await supabaseService.auth.admin.updateUserById(userId, { password: newPassword });
  if (pwErr) {
    console.error('admin-reset-password: updateUserById falhou', pwErr);
    return json({ error: pwErr.message || 'Falha ao redefinir a senha no servidor.' }, 500);
  }

  // 5. Marca troca obrigatória no próximo login.
  const { error: flagErr } = await supabaseService
    .from('core_perfis')
    .update({ must_change_password: true })
    .eq('id', userId);
  if (flagErr) {
    console.error('admin-reset-password: não marcou must_change_password', flagErr);
    return json({ error: 'A senha foi alterada, mas não foi possível marcar a exigência de troca.' }, 500);
  }

  return json({ ok: true });
});
