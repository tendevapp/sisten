-- =====================================================================
-- Fila offline: RPC enviada duas vezes não grava duas vezes
-- =====================================================================
-- A gravação dos formulários desiste de esperar o servidor depois de 25 s
-- (rede do pátio "conectada" mas muda) e vai para a fila do aparelho. Se o
-- servidor tiver gravado mesmo assim, o reenvio da fila gravava de novo — em
-- 06/11 a requisição RQB-061126-99 (Hercules, 4 pilhas) nasceu às 22:55:36 e a
-- mesma requisição entrou na fila às 22:55:39.
--
-- Insert direto em tabela já era seguro (o id nasce no aparelho e a pkey
-- recusa o reenvio). Faltavam as RPCs (requisição no balcão, ficha cega,
-- conferência, inventário, ficha de EPI…). Em vez de mexer em cada uma, o
-- app chama todas por este porteiro com uma chave gerada no aparelho e
-- guardada junto da operação na fila:
--
--   ops_executar_idempotente(p_chave, p_rpc, p_args)
--
--   1. grava a chave (ON CONFLICT DO NOTHING — se a primeira chamada ainda
--      está rodando, espera ela terminar);
--   2. se a chave já existia: devolve a resposta guardada, sem chamar a RPC;
--   3. senão chama a RPC com os argumentos nomeados e guarda a resposta.
--
-- Tudo na mesma transação: se a RPC falhar, a chave some junto e o reenvio
-- tenta de verdade. SECURITY INVOKER — a RPC roda com as permissões de quem
-- chamou, igual à chamada direta pelo PostgREST.

create table if not exists public.ops_rpc_idempotencia (
  chave uuid primary key,
  user_id uuid not null default auth.uid(),
  rpc text not null,
  resposta jsonb,
  criado_em timestamptz not null default now()
);

create index if not exists idx_ops_rpc_idempotencia_usuario
  on public.ops_rpc_idempotencia (user_id, criado_em);

comment on table public.ops_rpc_idempotencia is
  'Chaves de envio das RPCs dos formulários (fila offline): o reenvio devolve a resposta guardada em vez de gravar de novo. Limpa após 60 dias.';

alter table public.ops_rpc_idempotencia enable row level security;

drop policy if exists ops_rpc_idempotencia_proprias on public.ops_rpc_idempotencia;
create policy ops_rpc_idempotencia_proprias on public.ops_rpc_idempotencia
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

revoke all on public.ops_rpc_idempotencia from anon, public;
grant select, insert, update, delete on public.ops_rpc_idempotencia to authenticated;

create or replace function public.ops_executar_idempotente(p_chave uuid, p_rpc text, p_args jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security invoker
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_oid oid;
  v_ret oid;
  v_modos "char"[];
  v_qtd int;
  v_lista text;
  v_resposta jsonb;
  v_existente public.ops_rpc_idempotencia;
  v_args jsonb := coalesce(p_args, '{}'::jsonb);
begin
  if v_uid is null then
    raise exception 'Sessão expirada. Entre novamente.';
  end if;
  if p_chave is null then
    raise exception 'Chave de envio ausente.';
  end if;

  select count(*) into v_qtd
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = p_rpc;
  if v_qtd <> 1 or p_rpc = 'ops_executar_idempotente' then
    raise exception 'Função % não disponível para envio pela fila.', p_rpc;
  end if;

  select p.oid, p.prorettype, p.proargmodes into v_oid, v_ret, v_modos
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = p_rpc and p.prokind = 'f' and not p.proretset;
  if not found or (v_modos is not null and exists (select 1 from unnest(v_modos) m where m <> 'i')) then
    raise exception 'Função % não disponível para envio pela fila.', p_rpc;
  end if;
  if not has_function_privilege(v_oid, 'execute') then
    raise exception 'permission denied for function %', p_rpc using errcode = '42501';
  end if;

  insert into public.ops_rpc_idempotencia (chave, user_id, rpc)
  values (p_chave, v_uid, p_rpc)
  on conflict (chave) do nothing;

  if not found then
    select * into v_existente from public.ops_rpc_idempotencia where chave = p_chave;
    if not found or v_existente.rpc <> p_rpc then
      raise exception 'Chave de envio já usada por outra gravação.';
    end if;
    return v_existente.resposta;
  end if;

  -- Argumentos nomeados, só os que vieram (os omitidos usam o DEFAULT da função).
  select string_agg(
           format('%I => %s', a.nome,
             case
               when t.typcategory = 'A' then
                 format('(case when jsonb_typeof($1->%L) = ''array'' then array(select jsonb_array_elements_text($1->%L)) end)::%s',
                        a.nome, a.nome, format_type(a.tipo, null))
               when a.tipo in ('jsonb'::regtype, 'json'::regtype) then
                 format('($1->%L)::%s', a.nome, format_type(a.tipo, null))
               else
                 format('($1->>%L)::%s', a.nome, format_type(a.tipo, null))
             end),
           ', ' order by a.ord)
    into v_lista
    from pg_proc p
    cross join lateral unnest(p.proargtypes::oid[]) with ordinality as a0(tipo, ord)
    cross join lateral (select a0.tipo, a0.ord, p.proargnames[a0.ord] as nome) a
    join pg_type t on t.oid = a.tipo
   where p.oid = v_oid
     and a.nome is not null
     and v_args ? a.nome;

  if v_ret = 'void'::regtype then
    execute format('select public.%I(%s)', p_rpc, coalesce(v_lista, '')) using v_args;
    v_resposta := null;
  else
    execute format('select to_jsonb(public.%I(%s))', p_rpc, coalesce(v_lista, '')) using v_args into v_resposta;
  end if;

  update public.ops_rpc_idempotencia set resposta = v_resposta where chave = p_chave;

  -- Limpeza das chaves antigas do próprio usuário (a fila não guarda nada por tanto tempo).
  delete from public.ops_rpc_idempotencia
   where user_id = v_uid and criado_em < now() - interval '60 days';

  return v_resposta;
end;
$function$;

revoke all on function public.ops_executar_idempotente(uuid, text, jsonb) from public, anon;
grant execute on function public.ops_executar_idempotente(uuid, text, jsonb) to authenticated;

comment on function public.ops_executar_idempotente(uuid, text, jsonb) is
  'Porteiro das RPCs dos formulários (filaSupabase.ts): mesma chave = mesma gravação; o reenvio devolve a resposta guardada.';

notify pgrst, 'reload schema';
