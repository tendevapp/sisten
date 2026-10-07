-- Produção: lote auditável para reconciliar a matriz TORRE com o catálogo.
-- A identidade do tramo (id e série) não muda; somente a posição torre/tramo
-- e as cópias denormalizadas dependentes dela são sincronizadas.

create table if not exists public.prod_apt_importacoes_tramos (
  id uuid primary key default gen_random_uuid(),
  arquivo text not null,
  sha256 text not null unique,
  status text not null default 'preparado' check (status in ('preparado', 'reconciliado', 'historico_importado', 'cancelado')),
  criado_por uuid not null references auth.users(id),
  criado_em timestamptz not null default now(),
  reconciliado_em timestamptz,
  observacao text
);

create table if not exists public.prod_apt_importacoes_tramos_itens (
  id uuid primary key default gen_random_uuid(),
  importacao_id uuid not null references public.prod_apt_importacoes_tramos(id) on delete cascade,
  linha_origem integer not null check (linha_origem > 0),
  serie integer not null,
  torre_numero integer not null check (torre_numero between 1 and 69),
  tramo text not null check (tramo in ('T1', 'T2', 'T3', 'T4', 'T5')),
  antes_json jsonb,
  depois_json jsonb,
  unique (importacao_id, serie),
  unique (importacao_id, torre_numero, tramo)
);

create index if not exists idx_prod_apt_importacoes_tramos_itens_lote
  on public.prod_apt_importacoes_tramos_itens(importacao_id, serie);

alter table public.prod_apt_importacoes_tramos enable row level security;
alter table public.prod_apt_importacoes_tramos_itens enable row level security;

grant select on public.prod_apt_importacoes_tramos, public.prod_apt_importacoes_tramos_itens to authenticated;
revoke all on public.prod_apt_importacoes_tramos, public.prod_apt_importacoes_tramos_itens from anon;
revoke insert, update, delete on public.prod_apt_importacoes_tramos, public.prod_apt_importacoes_tramos_itens from authenticated;

drop policy if exists prod_apt_importacoes_tramos_select on public.prod_apt_importacoes_tramos;
create policy prod_apt_importacoes_tramos_select on public.prod_apt_importacoes_tramos
  for select to authenticated
  using (public.has_role('admin') or public.has_page_access('prod_apt_cadastros'));

drop policy if exists prod_apt_importacoes_tramos_itens_select on public.prod_apt_importacoes_tramos_itens;
create policy prod_apt_importacoes_tramos_itens_select on public.prod_apt_importacoes_tramos_itens
  for select to authenticated
  using (public.has_role('admin') or public.has_page_access('prod_apt_cadastros'));

create or replace function public.prod_apt_exigir_cadastro_tramos()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Autenticação obrigatória.';
  end if;
  if not (public.has_role('admin') or public.has_page_access('prod_apt_cadastros')) then
    raise exception 'Acesso negado ao cadastro de apontamento de tramos.';
  end if;
end;
$$;

create or replace function public.prod_preparar_importacao_catalogo_tramos(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lote uuid;
  v_arquivo text := nullif(trim(p->>'arquivo'), '');
  v_sha256 text := lower(nullif(trim(p->>'sha256'), ''));
begin
  perform public.prod_apt_exigir_cadastro_tramos();
  if v_arquivo is null or v_sha256 is null or v_sha256 !~ '^[a-f0-9]{64}$' then
    raise exception 'Arquivo e SHA-256 válido são obrigatórios.';
  end if;
  if jsonb_typeof(p->'itens') <> 'array' then
    raise exception 'Itens da matriz são obrigatórios.';
  end if;

  insert into public.prod_apt_importacoes_tramos (arquivo, sha256, criado_por)
  values (v_arquivo, v_sha256, auth.uid())
  returning id into v_lote;

  insert into public.prod_apt_importacoes_tramos_itens
    (importacao_id, linha_origem, serie, torre_numero, tramo, antes_json)
  select
    v_lote,
    (item->>'linhaOrigem')::integer,
    (item->>'sequencial')::integer,
    (item->>'torreNumero')::integer,
    item->>'tramo',
    jsonb_build_object(
      'torreNumero', catalogo.torre_numero,
      'tramo', catalogo.tramo,
      'serie', catalogo.serie
    )
  from jsonb_array_elements(p->'itens') item
  join public.proj_tramos_gwjaco catalogo on catalogo.serie = (item->>'sequencial')::integer
  where catalogo.subprojeto_id = 'SP01';

  if (select count(*) from public.prod_apt_importacoes_tramos_itens where importacao_id = v_lote) <> 115 then
    raise exception 'A matriz deve possuir exatamente 115 séries válidas do SP01.';
  end if;
  if exists (
    select 1 from public.prod_apt_importacoes_tramos_itens
    where importacao_id = v_lote and serie = 3102
  ) then
    raise exception 'Série 3102 não é aceita; Torre 8/T5 foi confirmada como 3202.';
  end if;
  return v_lote;
end;
$$;

create or replace function public.prod_reconciliar_catalogo_tramos(
  p_lote uuid,
  p_confirmacao_3202 boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  perform public.prod_apt_exigir_cadastro_tramos();
  select status into v_status
  from public.prod_apt_importacoes_tramos
  where id = p_lote
  for update;
  if not found then raise exception 'Lote de importação inexistente.'; end if;
  if v_status <> 'preparado' then raise exception 'Lote não está preparado para reconciliação.'; end if;
  if not p_confirmacao_3202 then raise exception 'A confirmação explícita da série 3202 é obrigatória.'; end if;

  if (select count(distinct serie) from public.prod_apt_importacoes_tramos_itens where importacao_id = p_lote) <> 115
     or (select count(distinct (torre_numero, tramo)) from public.prod_apt_importacoes_tramos_itens where importacao_id = p_lote) <> 115
     or not exists (select 1 from public.prod_apt_importacoes_tramos_itens where importacao_id = p_lote and serie = 3202 and torre_numero = 8 and tramo = 'T5') then
    raise exception 'Lote não contém o cadastro canônico completo do SP01.';
  end if;
  if (select count(*) from public.proj_tramos_gwjaco where subprojeto_id = 'SP01') <> 115 then
    raise exception 'Catálogo SP01 inválido: esperado 115 tramos.';
  end if;

  -- Evita colisão temporária na restrição (projeto, torre_numero, tramo).
  update public.proj_tramos_gwjaco catalogo
     set torre_numero = -catalogo.serie,
         updated_at = now()
    from public.prod_apt_importacoes_tramos_itens item
   where item.importacao_id = p_lote
     and catalogo.serie = item.serie;

  update public.proj_tramos_gwjaco catalogo
     set torre_numero = item.torre_numero,
         tramo = item.tramo,
         secao = 'S' || substring(item.tramo from 2),
         updated_at = now()
    from public.prod_apt_importacoes_tramos_itens item
   where item.importacao_id = p_lote
     and catalogo.serie = item.serie;

  update public.prod_virolas virola
     set torre_numero = catalogo.torre_numero,
         tramo = catalogo.tramo
    from public.proj_tramos_gwjaco catalogo
   where virola.tramo_unidade_id = catalogo.id
     and catalogo.subprojeto_id = 'SP01'
     and (virola.torre_numero, virola.tramo) is distinct from (catalogo.torre_numero, catalogo.tramo);

  -- As cópias também têm chave única por torre/tramo; movê-las antes para
  -- torres negativas evita colisão enquanto a nova matriz é aplicada.
  update public.prod_tramos_entrega entrega
     set torre_numero = -catalogo.serie
    from public.proj_tramos_gwjaco catalogo
   where entrega.id = catalogo.id
     and catalogo.subprojeto_id = 'SP01';

  update public.prod_tramos_entrega entrega
     set torre_numero = catalogo.torre_numero,
         tramo = catalogo.tramo,
         serie = catalogo.serie
    from public.proj_tramos_gwjaco catalogo
   where entrega.id = catalogo.id
     and catalogo.subprojeto_id = 'SP01'
     and (entrega.torre_numero, entrega.tramo, entrega.serie) is distinct from (catalogo.torre_numero, catalogo.tramo, catalogo.serie);

  update public.fin_fat_gwjaco faturamento
     set torre_numero = -catalogo.serie
    from public.proj_tramos_gwjaco catalogo
   where faturamento.tramo_id = catalogo.id
     and catalogo.subprojeto_id = 'SP01';

  update public.fin_fat_gwjaco faturamento
     set torre_numero = catalogo.torre_numero,
         tramo = catalogo.tramo,
         serie = catalogo.serie
    from public.proj_tramos_gwjaco catalogo
   where faturamento.tramo_id = catalogo.id
     and catalogo.subprojeto_id = 'SP01'
     and (faturamento.torre_numero, faturamento.tramo, faturamento.serie) is distinct from (catalogo.torre_numero, catalogo.tramo, catalogo.serie);

  update public.prod_apt_importacoes_tramos_itens item
     set depois_json = jsonb_build_object('torreNumero', item.torre_numero, 'tramo', item.tramo, 'serie', item.serie)
   where item.importacao_id = p_lote;

  update public.prod_apt_importacoes_tramos
     set status = 'reconciliado', reconciliado_em = now()
   where id = p_lote;
end;
$$;

revoke all on function public.prod_apt_exigir_cadastro_tramos() from public;
revoke all on function public.prod_preparar_importacao_catalogo_tramos(jsonb) from public;
revoke all on function public.prod_reconciliar_catalogo_tramos(uuid, boolean) from public;
grant execute on function public.prod_preparar_importacao_catalogo_tramos(jsonb) to authenticated;
grant execute on function public.prod_reconciliar_catalogo_tramos(uuid, boolean) to authenticated;
