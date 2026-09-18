-- =====================================================================
-- Almoxarifado > Projetos — Matriz de Autonomia de Kits: só manual + log
--
-- A matriz deixou de puxar status automaticamente do Faturamento
-- (fin_fat_gwjaco) e da Portaria/Expedição (expedicao_tramos) — isso vivia
-- só no TS (calcularMatrizAutonomia) e já foi removido de lá. Esta migration
-- cuida do lado do banco: toda escrita passa a ir por
-- `proj_matriz_salvar_celula` (security definer), que grava o diff em
-- `proj_matriz_autonomia_log`. Sem policy de INSERT/UPDATE direta na tabela
-- para o cliente: assim não existe caminho para alterar uma célula sem
-- deixar rastro no log (mesmo padrão de `alm_receb_alteracoes` /
-- `fin_fat_alteracoes`).
-- =====================================================================

-- 1) Log de alterações -------------------------------------------------------
create table if not exists public.proj_matriz_autonomia_log (
  id uuid primary key default gen_random_uuid(),
  subprojeto_id text not null,
  torre_numero integer not null,
  tramo text not null,
  subkit text not null,
  -- [{campo, de, para}]
  alteracoes jsonb not null default '[]'::jsonb,
  resumo text,
  alterado_por_id uuid,
  alterado_por_nome text,
  created_at timestamptz not null default now()
);
create index if not exists idx_proj_matriz_autonomia_log_subproj
  on public.proj_matriz_autonomia_log (subprojeto_id, created_at desc);

grant select on public.proj_matriz_autonomia_log to authenticated;
grant all on public.proj_matriz_autonomia_log to service_role;
alter table public.proj_matriz_autonomia_log enable row level security;
drop policy if exists proj_matriz_autonomia_log_sel on public.proj_matriz_autonomia_log;
create policy proj_matriz_autonomia_log_sel on public.proj_matriz_autonomia_log
  for select to authenticated using (true);
-- Sem policy de INSERT: só a RPC security definer grava.

-- 2) Fecha a escrita direta na tabela de células -----------------------------
drop policy if exists proj_matriz_autonomia_kits_insert on public.proj_matriz_autonomia_kits;
drop policy if exists proj_matriz_autonomia_kits_update on public.proj_matriz_autonomia_kits;
revoke insert, update, delete on public.proj_matriz_autonomia_kits from authenticated, anon;

-- 3) RPC — única porta de escrita, grava diff quando muda status ou série ----
create or replace function public.proj_matriz_salvar_celula(
  p_subprojeto_id text,
  p_torre_numero integer,
  p_tramo text,
  p_subkit text,
  p_status integer,
  p_serie text default null,
  p_observacao text default null,
  p_user jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old public.proj_matriz_autonomia_kits;
  v_alt jsonb := '[]'::jsonb;
begin
  select * into v_old from public.proj_matriz_autonomia_kits
   where subprojeto_id = p_subprojeto_id
     and torre_numero = p_torre_numero
     and tramo = p_tramo
     and subkit = p_subkit;

  if found then
    if coalesce(v_old.status::text, '') is distinct from coalesce(p_status::text, '') then
      v_alt := v_alt || jsonb_build_object('campo', 'status', 'de', v_old.status::text, 'para', p_status::text);
    end if;
    if coalesce(v_old.serie, '') is distinct from coalesce(p_serie, '') then
      v_alt := v_alt || jsonb_build_object('campo', 'serie', 'de', v_old.serie, 'para', p_serie);
    end if;
  else
    v_alt := v_alt || jsonb_build_object('campo', 'status', 'de', null, 'para', p_status::text);
    if p_serie is not null then
      v_alt := v_alt || jsonb_build_object('campo', 'serie', 'de', null, 'para', p_serie);
    end if;
  end if;

  insert into public.proj_matriz_autonomia_kits
    (subprojeto_id, torre_numero, tramo, subkit, status, serie, observacao, atualizado_por_nome, updated_at)
  values
    (p_subprojeto_id, p_torre_numero, p_tramo, p_subkit, p_status, p_serie, p_observacao, p_user->>'nome', now())
  on conflict (subprojeto_id, torre_numero, tramo, subkit) do update
  set status = excluded.status,
      serie = excluded.serie,
      observacao = excluded.observacao,
      atualizado_por_nome = excluded.atualizado_por_nome,
      updated_at = now();

  if jsonb_array_length(v_alt) > 0 then
    insert into public.proj_matriz_autonomia_log
      (subprojeto_id, torre_numero, tramo, subkit, alteracoes, resumo, alterado_por_id, alterado_por_nome)
    values
      (p_subprojeto_id, p_torre_numero, p_tramo, p_subkit, v_alt,
       jsonb_array_length(v_alt) || ' campo(s) alterado(s)',
       nullif(p_user->>'id', '')::uuid, p_user->>'nome');
  end if;

  return jsonb_build_object(
    'torre_numero', p_torre_numero, 'tramo', p_tramo, 'subkit', p_subkit,
    'alteracoes', jsonb_array_length(v_alt)
  );
end;
$$;

revoke all on function public.proj_matriz_salvar_celula(text, integer, text, text, integer, text, text, jsonb) from public, anon;
grant execute on function public.proj_matriz_salvar_celula(text, integer, text, text, integer, text, text, jsonb) to authenticated, service_role;
