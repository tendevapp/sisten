/**
 * Edge Function "admin-criar-usuario" — cria acesso para quem não tem e-mail
 * (Administração > Usuários > Novo usuário).
 *
 * Criar usuário já confirmado exige a Admin API do Supabase, isto é, a chave
 * `service_role`. Deixá-la no bundle do navegador expõe acesso total ao banco,
 * então a operação roda aqui: a função recebe o JWT do administrador logado,
 * confirma que o perfil dele tem o papel `admin` e só então usa a service_role
 * (disponível apenas no ambiente da função). Mesmo desenho da
 * `admin-reset-password`.
 *
 * O identificador `nome.sobrenome` vira `nome.sobrenome@sisten.local` — domínio
 * não roteável, nada é enviado por e-mail. O usuário nasce ativo, com
 * `must_change_password` e `login_sem_email`.
 *
 * Payload: { "nome", "usuario", "senha", "cargo"?, "sectorId"?, "role"? }
 * Resposta: { "ok": true, "profile": {...} } | { "error": "<mensagem>" }
 *
 * Deploy: npx supabase functions deploy admin-criar-usuario
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

const DOMINIO_SEM_EMAIL = 'sisten.local';
// Espelha `usuarioLoginValido` (src/lib/loginSemEmail.ts).
const USUARIO_VALIDO = /^[a-z0-9]+(\.[a-z0-9]+)+$/;
// Papéis que a tela oferece. `admin` fica de fora de propósito: conceder
// administrador não é para nascer junto com um acesso sem e-mail.
const PAPEIS_PERMITIDOS = ['visualizador', 'solicitante', 'requisitante', 'atendente', 'gestor', 'comprador'];

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
  const supabaseService = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: perfilAdmin, error: perfilErr } = await supabaseService
    .from('core_perfis')
    .select('roles, status')
    .eq('id', callerId)
    .maybeSingle();
  if (perfilErr) {
    return json({ error: 'Falha ao verificar o perfil do administrador.' }, 500);
  }
  const rolesAdmin: string[] = perfilAdmin?.roles ?? [];
  if (perfilAdmin?.status !== 'ativo' || !rolesAdmin.includes('admin')) {
    return json({ error: 'Apenas administradores podem criar usuários.' }, 403);
  }

  // 3. Valida o payload.
  const body = await req.json().catch(() => ({}));
  const nome = String(body?.nome || '').trim().toUpperCase();
  const usuario = String(body?.usuario || '').trim().toLowerCase();
  const senha = String(body?.senha || '');
  const cargo = String(body?.cargo || '').trim();
  const sectorId = body?.sectorId ? String(body.sectorId) : null;
  const role = String(body?.role || 'visualizador');

  if (nome.length < 3) return json({ error: 'Informe o nome completo do usuário.' }, 400);
  if (!USUARIO_VALIDO.test(usuario)) {
    return json({ error: 'Identificador inválido. Use o padrão nome.sobrenome, só letras minúsculas, números e ponto.' }, 400);
  }
  if (senha.length < 6) return json({ error: 'A senha provisória deve ter pelo menos 6 caracteres.' }, 400);
  if (!PAPEIS_PERMITIDOS.includes(role)) return json({ error: `Papel inicial inválido: ${role}.` }, 400);

  const email = `${usuario}@${DOMINIO_SEM_EMAIL}`;

  // 4. Cria o acesso já confirmado (sem caixa de e-mail não há como confirmar).
  const { data: criado, error: createErr } = await supabaseService.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
    user_metadata: { name: nome, cargo, sector_id: sectorId },
  });
  if (createErr) {
    console.error('admin-criar-usuario: createUser falhou', createErr);
    if (/already been registered|already exists|duplicate/i.test(createErr.message || '')) {
      return json({ error: `O identificador "${usuario}" já está em uso. Tente incluir o nome do meio.` }, 409);
    }
    return json({ error: createErr.message || 'Falha ao criar o usuário no servidor.' }, 500);
  }
  const novoId = criado.user?.id;
  if (!novoId) return json({ error: 'O servidor não devolveu o usuário criado.' }, 500);

  // 5. O trigger `handle_new_user` já criou o perfil com papel padrão; aqui
  //    vale o que o administrador escolheu.
  const profile = {
    id: novoId,
    email,
    name: nome,
    cargo,
    sector_id: sectorId,
    roles: [role],
    page_access: {},
    status: 'ativo',
    must_change_password: true,
    login_sem_email: true,
    created_at: new Date().toISOString(),
  };
  const { error: upsertErr } = await supabaseService.from('core_perfis').upsert(profile, { onConflict: 'id' });
  if (upsertErr) {
    console.error('admin-criar-usuario: perfil não gravado', upsertErr);
    // Não deixa meio-usuário: apagar do Auth não apaga a linha que o trigger
    // já criou em `core_perfis`, então a limpeza é dos dois lados.
    await supabaseService.auth.admin.deleteUser(novoId).catch(() => undefined);
    await supabaseService.from('core_perfis').delete().eq('id', novoId).then(
      () => undefined,
      () => undefined,
    );
    return json({ error: 'Usuário criado no login, mas falhou ao gravar o perfil. Nada foi mantido; tente novamente.' }, 500);
  }

  return json({ ok: true, profile });
});
