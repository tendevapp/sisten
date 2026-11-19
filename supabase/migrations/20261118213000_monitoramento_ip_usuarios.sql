-- Monitoramento de IP por usuario no controle de acessos (Admin > Usuarios).
-- Captura server-side via headers da requisicao (cf-connecting-ip / x-forwarded-for / x-real-ip),
-- whitelist corporativa em CIDR nativo e aprovacao de IPs confiaveis por usuario.

create table if not exists public.core_ips_confiaveis (
  id uuid primary key default gen_random_uuid(),
  cidr cidr not null unique,
  rotulo text not null,
  descricao text,
  ativo boolean not null default true,
  criado_por text references public.core_perfis(id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists public.core_usuarios_ips_conhecidos (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.core_perfis(id) on delete cascade,
  ip_address inet not null,
  rotulo text,
  aprovado_por text references public.core_perfis(id) on delete set null,
  aprovado_em timestamptz not null default now(),
  unique (user_id, ip_address)
);

create table if not exists public.core_acessos_ip (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.core_perfis(id) on delete cascade,
  user_name text,
  email text,
  ip_address inet not null,
  session_id text,
  tipo_evento text not null default 'sessao'
    check (tipo_evento in ('login', 'sessao', 'troca_ip')),
  user_agent text,
  pais text,
  ocorrencias integer not null default 1 check (ocorrencias >= 1),
  primeiro_visto_em timestamptz not null default now(),
  ultimo_visto_em timestamptz not null default now()
);

create index if not exists idx_core_acessos_ip_ultimo_visto
  on public.core_acessos_ip (ultimo_visto_em desc);

create index if not exists idx_core_acessos_ip_user_ultimo
  on public.core_acessos_ip (user_id, ultimo_visto_em desc);

create index if not exists idx_core_acessos_ip_user_ip
  on public.core_acessos_ip (user_id, ip_address);

create index if not exists idx_core_acessos_ip_session_ip
  on public.core_acessos_ip (user_id, session_id, ip_address)
  where session_id is not null;

-- RLS estrita: somente administradores leem/gerenciam logs e whitelists.
-- Escrita em core_acessos_ip acontece exclusivamente via RPC SECURITY DEFINER.
alter table public.core_ips_confiaveis enable row level security;
alter table public.core_usuarios_ips_conhecidos enable row level security;
alter table public.core_acessos_ip enable row level security;

drop policy if exists core_ips_confiaveis_admin_all on public.core_ips_confiaveis;
create policy core_ips_confiaveis_admin_all
  on public.core_ips_confiaveis
  for all
  to authenticated
  using (public.has_role('admin'))
  with check (public.has_role('admin'));

drop policy if exists core_usuarios_ips_conhecidos_admin_all on public.core_usuarios_ips_conhecidos;
create policy core_usuarios_ips_conhecidos_admin_all
  on public.core_usuarios_ips_conhecidos
  for all
  to authenticated
  using (public.has_role('admin'))
  with check (public.has_role('admin'));

drop policy if exists core_acessos_ip_admin_select on public.core_acessos_ip;
create policy core_acessos_ip_admin_select
  on public.core_acessos_ip
  for select
  to authenticated
  using (public.has_role('admin'));

revoke all on public.core_ips_confiaveis from public, anon;
revoke all on public.core_usuarios_ips_conhecidos from public, anon;
revoke all on public.core_acessos_ip from public, anon;

grant select, insert, update, delete on public.core_ips_confiaveis to authenticated, service_role;
grant select, insert, update, delete on public.core_usuarios_ips_conhecidos to authenticated, service_role;
grant select on public.core_acessos_ip to authenticated;
grant select, insert, update, delete on public.core_acessos_ip to service_role;

-- View com avaliacao dinamica da whitelist (CIDR mais especifico) e IPs confiaveis por usuario.
-- security_invoker = on garante respeito a RLS admin-only das tabelas base.
create or replace view public.vw_core_acessos_ip_monitor
with (security_invoker = on) as
select
  a.id,
  a.user_id,
  coalesce(p.name, a.user_name) as user_name,
  coalesce(p.email, a.email) as email,
  p.sector_id,
  p.status as usuario_status,
  p.roles as usuario_roles,
  host(a.ip_address) as ip_texto,
  a.session_id,
  a.tipo_evento,
  a.user_agent,
  a.pais,
  a.ocorrencias,
  a.primeiro_visto_em,
  a.ultimo_visto_em,
  case
    when corp.id is not null then 'corporativo'
    when usr_ip.id is not null then 'confiavel_usuario'
    else 'desconhecido'
  end as classificacao,
  coalesce(corp.rotulo, usr_ip.rotulo) as regra_rotulo,
  corp.cidr::text as regra_cidr,
  usr_ip.id as user_ip_conhecido_id
from public.core_acessos_ip a
left join public.core_perfis p
  on p.id = a.user_id
left join lateral (
  select c.id, c.cidr, c.rotulo
  from public.core_ips_confiaveis c
  where c.ativo = true
    and a.ip_address <<= c.cidr
  order by masklen(c.cidr) desc
  limit 1
) corp on true
left join public.core_usuarios_ips_conhecidos usr_ip
  on usr_ip.user_id = a.user_id
 and usr_ip.ip_address = a.ip_address;

revoke all on public.vw_core_acessos_ip_monitor from public, anon;
grant select on public.vw_core_acessos_ip_monitor to authenticated, service_role;

-- RPC server-side que extrai o IP real da requisicao HTTP (headers PostgREST/Cloudflare)
-- sem confiar em valor informado pelo cliente.
create or replace function public.registrar_acesso_ip(
  p_tipo_evento text default 'sessao',
  p_session_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid text;
  v_headers jsonb;
  v_raw_ip text;
  v_clean_ip text;
  v_ip inet;
  v_ua text;
  v_pais text;
  v_tipo text;
  v_session text;
  v_user_name text;
  v_email text;
  v_ultimo_ip inet;
  v_existing_id uuid;
begin
  v_uid := auth.uid()::text;
  if v_uid is null or v_uid = '' then
    return jsonb_build_object('ok', false, 'motivo', 'nao_autenticado');
  end if;

  v_tipo := case
    when p_tipo_evento in ('login', 'sessao', 'troca_ip') then p_tipo_evento
    else 'sessao'
  end;
  v_session := nullif(left(trim(coalesce(p_session_id, '')), 120), '');

  begin
    v_headers := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);
  exception when others then
    v_headers := '{}'::jsonb;
  end;

  v_raw_ip := nullif(trim(coalesce(v_headers->>'cf-connecting-ip', '')), '');
  if v_raw_ip is null then
    v_raw_ip := nullif(trim(split_part(coalesce(v_headers->>'x-forwarded-for', ''), ',', 1)), '');
  end if;
  if v_raw_ip is null then
    v_raw_ip := nullif(trim(coalesce(v_headers->>'x-real-ip', '')), '');
  end if;

  if v_raw_ip is null then
    return jsonb_build_object('ok', false, 'motivo', 'ip_indisponivel');
  end if;

  -- Normaliza IPv4:porta e [IPv6]:porta antes de converter para inet.
  v_clean_ip := v_raw_ip;
  if v_clean_ip ~ '^\[[0-9a-fA-F:]+\](:\d+)?$' then
    v_clean_ip := regexp_replace(v_clean_ip, '^\[([0-9a-fA-F:]+)\](:\d+)?$', '\1');
  elsif v_clean_ip ~ '^\d{1,3}(\.\d{1,3}){3}:\d+$' then
    v_clean_ip := split_part(v_clean_ip, ':', 1);
  end if;

  begin
    v_ip := v_clean_ip::inet;
  exception when others then
    return jsonb_build_object('ok', false, 'motivo', 'ip_invalido');
  end;

  v_ua := nullif(left(trim(coalesce(v_headers->>'user-agent', '')), 300), '');
  v_pais := nullif(upper(left(trim(coalesce(v_headers->>'cf-ipcountry', '')), 10)), '');

  select p.name, p.email
    into v_user_name, v_email
  from public.core_perfis p
  where p.id = v_uid;

  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'perfil_nao_encontrado');
  end if;

  -- Detecta troca de IP em relacao ao ultimo acesso registrado do usuario.
  select a.ip_address
    into v_ultimo_ip
  from public.core_acessos_ip a
  where a.user_id = v_uid
  order by a.ultimo_visto_em desc
  limit 1;

  if v_tipo = 'sessao' and v_ultimo_ip is not null and v_ultimo_ip <> v_ip then
    v_tipo := 'troca_ip';
  end if;

  -- Deduplicacao: agrupa renovacoes da mesma sessao+IP (ou janela curta) em um registro.
  if v_tipo = 'login' then
    select a.id
      into v_existing_id
    from public.core_acessos_ip a
    where a.user_id = v_uid
      and a.ip_address = v_ip
      and a.ultimo_visto_em >= now() - interval '2 minutes'
    order by a.ultimo_visto_em desc
    limit 1;
  else
    select a.id
      into v_existing_id
    from public.core_acessos_ip a
    where a.user_id = v_uid
      and a.ip_address = v_ip
      and (
        (v_session is not null and a.session_id = v_session)
        or a.ultimo_visto_em >= now() - interval '30 minutes'
      )
    order by a.ultimo_visto_em desc
    limit 1;
  end if;

  if v_existing_id is not null then
    update public.core_acessos_ip
       set ultimo_visto_em = now(),
           ocorrencias = ocorrencias + 1,
           user_name = coalesce(v_user_name, user_name),
           email = coalesce(v_email, email),
           user_agent = coalesce(v_ua, user_agent),
           pais = coalesce(v_pais, pais),
           session_id = coalesce(v_session, session_id)
     where id = v_existing_id;
  else
    insert into public.core_acessos_ip (
      user_id,
      user_name,
      email,
      ip_address,
      session_id,
      tipo_evento,
      user_agent,
      pais
    ) values (
      v_uid,
      v_user_name,
      v_email,
      v_ip,
      v_session,
      v_tipo,
      v_ua,
      v_pais
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'ip', host(v_ip),
    'tipo_evento', v_tipo,
    'pais', v_pais
  );
end;
$$;

revoke execute on function public.registrar_acesso_ip(text, text) from public, anon;
grant execute on function public.registrar_acesso_ip(text, text) to authenticated, service_role;

