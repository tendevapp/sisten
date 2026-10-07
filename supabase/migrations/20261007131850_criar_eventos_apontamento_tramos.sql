create table public.prod_apt_tramo_eventos (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  tramo_id text not null references public.proj_tramos_gwjaco(id),
  tipo text not null check (tipo in ('marco', 'situacao')),
  marco text check (marco in ('inicio', 'liberado_nav02', 'liberado_jato', 'liberado_patio', 'expedido')),
  data_operacional date not null check (data_operacional <= current_date),
  setor text,
  atividade text,
  reparos_solda integer check (reparos_solda >= 0),
  observacao text,
  origem text not null default 'manual' check (origem in ('manual', 'importacao')),
  importacao_id uuid references public.prod_apt_importacoes_tramos(id),
  criado_por uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  excluido_em timestamptz,
  excluido_por uuid references auth.users(id),
  check ((tipo = 'marco' and marco is not null) or (tipo = 'situacao' and marco is null))
);

create unique index prod_apt_tramo_eventos_marco_ativo_unico
  on public.prod_apt_tramo_eventos(tramo_id, marco)
  where excluido_em is null and tipo = 'marco';
create index idx_prod_apt_tramo_eventos_atual
  on public.prod_apt_tramo_eventos(tramo_id, data_operacional desc)
  where excluido_em is null;

alter table public.prod_apt_tramo_eventos enable row level security;
grant select on public.prod_apt_tramo_eventos to authenticated;
revoke all on public.prod_apt_tramo_eventos from anon;
revoke insert, update, delete on public.prod_apt_tramo_eventos from authenticated;

create policy prod_apt_tramo_eventos_select on public.prod_apt_tramo_eventos
  for select to authenticated
  using (public.has_role('admin') or public.has_page_access('prod_apontamentos') or public.has_page_access('producao_home'));

create or replace function public.prod_apt_proximo_codigo_tramo(p_data date)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prefix text := 'APT-' || to_char(p_data, 'DDMMYY') || '-';
  v_indice integer;
begin
  select coalesce(max((regexp_match(codigo, '^APT-[0-9]{6}-([0-9]+)$'))[1]::integer), 0) + 1
    into v_indice
    from public.prod_apt_tramo_eventos
   where codigo like v_prefix || '%';
  return v_prefix || lpad(v_indice::text, 2, '0');
end;
$$;

create or replace function public.prod_apt_exigir_apontamento_tramos()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Autenticação obrigatória.'; end if;
  if not (public.has_role('admin') or public.has_page_access('prod_apontamentos') or public.has_page_access('producao_home')) then
    raise exception 'Acesso negado ao apontamento de produção.';
  end if;
end;
$$;

create or replace function public.prod_apt_salvar_evento_tramo(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tramo text := nullif(p->>'tramoId', '');
  v_tipo text := coalesce(nullif(p->>'tipo', ''), case when p ? 'marco' then 'marco' else 'situacao' end);
  v_marco text := nullif(p->>'marco', '');
  v_data date := nullif(p->>'dataOperacional', '')::date;
  v_id uuid;
  v_codigo text;
begin
  perform public.prod_apt_exigir_apontamento_tramos();
  if v_tramo is null or not exists (select 1 from public.proj_tramos_gwjaco where id = v_tramo) then raise exception 'Tramo inválido.'; end if;
  if v_data is null or v_data > current_date then raise exception 'Data operacional inválida.'; end if;
  if v_tipo not in ('marco', 'situacao') then raise exception 'Tipo de evento inválido.'; end if;
  if v_tipo = 'marco' and v_marco not in ('inicio','liberado_nav02','liberado_jato','liberado_patio','expedido') then raise exception 'Marco inválido.'; end if;
  if v_marco = 'liberado_jato' and exists (select 1 from public.prod_apt_tramo_eventos where tramo_id = v_tramo and marco = 'liberado_nav02' and excluido_em is null and data_operacional > v_data) then
    raise exception 'Jato não pode anteceder a liberação para NAV02.';
  end if;
  v_codigo := public.prod_apt_proximo_codigo_tramo(v_data);
  insert into public.prod_apt_tramo_eventos (codigo, tramo_id, tipo, marco, data_operacional, setor, atividade, reparos_solda, observacao, criado_por)
  values (v_codigo, v_tramo, v_tipo, case when v_tipo = 'marco' then v_marco else null end, v_data, nullif(p->>'setor',''), nullif(p->>'atividade',''), nullif(p->>'reparosSolda','')::integer, nullif(p->>'observacao',''), auth.uid())
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'codigo', v_codigo);
end;
$$;

create or replace function public.prod_apt_importar_snapshot_tramos(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lote uuid := (p->>'loteId')::uuid;
  v_item jsonb;
  v_marco text;
  v_data text;
  v_tramo text;
  v_inseridos integer := 0;
begin
  perform public.prod_apt_exigir_cadastro_tramos();
  if not exists (select 1 from public.prod_apt_importacoes_tramos where id = v_lote and status = 'reconciliado') then raise exception 'Lote deve estar reconciliado antes da carga histórica.'; end if;
  if jsonb_typeof(p->'snapshots') <> 'array' then raise exception 'Snapshots obrigatórios.'; end if;
  for v_item in select value from jsonb_array_elements(p->'snapshots') loop
    select id into v_tramo from public.proj_tramos_gwjaco where serie = (v_item->>'sequencial')::integer;
    if v_tramo is null then raise exception 'Série % não localizada.', v_item->>'sequencial'; end if;
    for v_marco, v_data in select key, value from jsonb_each_text(coalesce(v_item->'marcos', '{}'::jsonb)) loop
      if v_data is not null and v_data <> '' then
        insert into public.prod_apt_tramo_eventos (codigo, tramo_id, tipo, marco, data_operacional, origem, importacao_id, criado_por)
        values (public.prod_apt_proximo_codigo_tramo(v_data::date), v_tramo, 'marco', v_marco, v_data::date, 'importacao', v_lote, auth.uid())
        on conflict (tramo_id, marco) where excluido_em is null and tipo = 'marco' do nothing;
        v_inseridos := v_inseridos + 1;
      end if;
    end loop;
    insert into public.prod_apt_tramo_eventos (codigo, tramo_id, tipo, data_operacional, setor, atividade, reparos_solda, origem, importacao_id, criado_por)
    values (public.prod_apt_proximo_codigo_tramo((select max(value)::date from jsonb_each_text(coalesce(v_item->'marcos','{}'::jsonb))), v_tramo, 'situacao', coalesce((select max(value)::date from jsonb_each_text(coalesce(v_item->'marcos','{}'::jsonb))), current_date), nullif(v_item->>'setor',''), nullif(v_item->>'atividade',''), nullif(v_item->>'reparosSolda','')::integer, 'importacao', v_lote, auth.uid());
  end loop;
  update public.prod_apt_importacoes_tramos set status = 'historico_importado' where id = v_lote;
  return jsonb_build_object('eventosInseridos', v_inseridos);
end;
$$;

create view public.prod_apt_tramos_atual with (security_invoker = true) as
select
  t.id as tramo_id, t.serie, t.torre_numero, t.tramo,
  max(e.data_operacional) filter (where e.marco = 'inicio') as inicio_em,
  max(e.data_operacional) filter (where e.marco = 'liberado_nav02') as liberado_nav02_em,
  max(e.data_operacional) filter (where e.marco = 'liberado_jato') as liberado_jato_em,
  max(e.data_operacional) filter (where e.marco = 'liberado_patio') as liberado_patio_em,
  max(e.data_operacional) filter (where e.marco = 'expedido') as expedido_em,
  (array_agg(e.setor order by e.data_operacional desc, e.created_at desc) filter (where e.tipo = 'situacao' and e.setor is not null))[1] as setor_atual,
  (array_agg(e.atividade order by e.data_operacional desc, e.created_at desc) filter (where e.tipo = 'situacao' and e.atividade is not null))[1] as atividade_atual,
  (array_agg(e.reparos_solda order by e.data_operacional desc, e.created_at desc) filter (where e.tipo = 'situacao' and e.reparos_solda is not null))[1] as reparos_solda
from public.proj_tramos_gwjaco t
left join public.prod_apt_tramo_eventos e on e.tramo_id = t.id and e.excluido_em is null
where t.subprojeto_id = 'SP01'
group by t.id, t.serie, t.torre_numero, t.tramo;

grant select on public.prod_apt_tramos_atual to authenticated;
revoke all on function public.prod_apt_proximo_codigo_tramo(date) from public;
revoke all on function public.prod_apt_exigir_apontamento_tramos() from public;
revoke all on function public.prod_apt_salvar_evento_tramo(jsonb) from public;
revoke all on function public.prod_apt_importar_snapshot_tramos(jsonb) from public;
grant execute on function public.prod_apt_salvar_evento_tramo(jsonb), public.prod_apt_importar_snapshot_tramos(jsonb) to authenticated;
