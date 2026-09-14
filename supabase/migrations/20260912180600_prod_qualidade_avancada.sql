-- Produção — Blocos 3 a 5: qualidade dimensional, UT/reparos e flange.
-- Satélites normalizados por lançamento: evitam uma coleção por etapa e mantêm
-- a ficha da virola, a auditoria e os indicadores sobre a mesma espinha.

create table if not exists public.prod_tolerancias (
  id uuid primary key default gen_random_uuid(),
  etapa_id text not null references public.prod_etapas(id),
  tramo text,
  virola text,
  medida text not null,
  minimo numeric,
  maximo numeric,
  unidade text not null default 'mm',
  ativa boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (minimo is null or maximo is null or minimo <= maximo)
);
create unique index if not exists uq_prod_tolerancias_escopo
  on public.prod_tolerancias(etapa_id, coalesce(tramo, ''), coalesce(virola, ''), medida);
create index if not exists idx_prod_tolerancias_busca
  on public.prod_tolerancias(etapa_id, tramo, virola) where ativa;

create table if not exists public.prod_evs_medicoes (
  lancamento_id uuid primary key references public.prod_lancamentos(id) on delete cascade,
  altura_interna numeric,
  altura_externa numeric,
  comprimento numeric,
  "offset" numeric,
  perimetro numeric,
  curvatura numeric,
  medicoes jsonb not null default '{}'::jsonb,
  fora_tolerancia jsonb not null default '[]'::jsonb,
  completo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.prod_defeitos (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nome text not null,
  descricao text,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);
insert into public.prod_defeitos (codigo, nome) values
  ('POROSIDADE', 'Porosidade'),
  ('FALTA_FUSAO', 'Falta de fusão'),
  ('MORDEDURA', 'Mordedura'),
  ('OVALIZACAO', 'Ovalização'),
  ('EMPENO', 'Empeno'),
  ('DESALINHAMENTO', 'Desalinhamento')
on conflict (codigo) do nothing;

create table if not exists public.prod_ut_reparos (
  id uuid primary key default gen_random_uuid(),
  lancamento_id uuid not null references public.prod_lancamentos(id) on delete cascade,
  sequencia integer not null,
  defeito_id uuid references public.prod_defeitos(id),
  largura numeric,
  comprimento numeric,
  profundidade numeric,
  angulo numeric,
  amplitude numeric,
  distancia_x numeric,
  procedimento text,
  reparado_por_pessoa_id uuid references public.rh_pessoas(id),
  reparado_por_nome text,
  reparado_em timestamptz,
  observacao text,
  created_at timestamptz not null default now(),
  unique (lancamento_id, sequencia)
);

create table if not exists public.prod_flange_medicoes (
  lancamento_id uuid primary key references public.prod_lancamentos(id) on delete cascade,
  raiz_1 numeric,
  raiz_2 numeric,
  raiz_3 numeric,
  raiz_4 numeric,
  offsets jsonb not null default '{}'::jsonb,
  completo boolean not null default false,
  aceite_pendencia boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.prod_lancamentos
  add column if not exists defeito_id uuid references public.prod_defeitos(id),
  add column if not exists motivo_refugo text,
  add column if not exists refugado_em timestamptz,
  add column if not exists assinatura_inspetor text,
  add column if not exists assinatura_inspetor_por text references public.core_perfis(id),
  add column if not exists assinatura_inspetor_em timestamptz;

create index if not exists idx_prod_lancamentos_defeito
  on public.prod_lancamentos(defeito_id) where excluido_em is null;

-- Os cadastros de qualidade são visíveis para quem lança, mas somente admins
-- os alteram. As medições seguem a visibilidade do lançamento-pai.
grant select on public.prod_tolerancias, public.prod_defeitos, public.prod_evs_medicoes,
  public.prod_ut_reparos, public.prod_flange_medicoes to authenticated;
grant insert, update on public.prod_tolerancias, public.prod_defeitos to authenticated;
grant all on public.prod_tolerancias, public.prod_defeitos, public.prod_evs_medicoes,
  public.prod_ut_reparos, public.prod_flange_medicoes to service_role;

alter table public.prod_tolerancias enable row level security;
alter table public.prod_defeitos enable row level security;
alter table public.prod_evs_medicoes enable row level security;
alter table public.prod_ut_reparos enable row level security;
alter table public.prod_flange_medicoes enable row level security;

drop policy if exists prod_tolerancias_sel on public.prod_tolerancias;
create policy prod_tolerancias_sel on public.prod_tolerancias for select to authenticated using (true);
drop policy if exists prod_tolerancias_admin on public.prod_tolerancias;
create policy prod_tolerancias_admin on public.prod_tolerancias for all to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));

drop policy if exists prod_defeitos_sel on public.prod_defeitos;
create policy prod_defeitos_sel on public.prod_defeitos for select to authenticated using (true);
drop policy if exists prod_defeitos_admin on public.prod_defeitos;
create policy prod_defeitos_admin on public.prod_defeitos for all to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));

drop policy if exists prod_evs_medicoes_sel on public.prod_evs_medicoes;
create policy prod_evs_medicoes_sel on public.prod_evs_medicoes for select to authenticated using (true);
drop policy if exists prod_ut_reparos_sel on public.prod_ut_reparos;
create policy prod_ut_reparos_sel on public.prod_ut_reparos for select to authenticated using (true);
drop policy if exists prod_flange_medicoes_sel on public.prod_flange_medicoes;
create policy prod_flange_medicoes_sel on public.prod_flange_medicoes for select to authenticated using (true);

-- As escritas dos satélites vêm exclusivamente pela RPC de lançamento, que
-- grava cabeçalho e detalhes na mesma transação.
revoke all on public.prod_tolerancias, public.prod_defeitos, public.prod_evs_medicoes,
  public.prod_ut_reparos, public.prod_flange_medicoes from anon;

update public.prod_etapas set ativa = true where id in ('evs', 'ut', 'flange');

-- Controle de Entrega: a prontidão de cada tramo é a aprovação de UT em todas
-- as suas virolas. A Expedição pode casar a série do tramo com seu número de
-- tramo sem copiar dado nem manter planilha paralela.
create or replace view public.prod_entrega_matriz
with (security_invoker = true) as
select
  v.projeto,
  v.subprojeto_id,
  v.torre_numero,
  v.tramo,
  count(*)::integer as total_virolas,
  count(u.virola_id)::integer as virolas_liberadas,
  (count(*) = count(u.virola_id)) as pronto_expedicao
from public.prod_virolas v
left join lateral (
  select l.virola_id
  from public.prod_lancamentos l
  where l.virola_id = v.id and l.etapa_id = 'ut' and l.status = 'aprovado'
    and l.excluido_em is null
  order by l.created_at desc
  limit 1
) u on true
group by v.projeto, v.subprojeto_id, v.torre_numero, v.tramo;

grant select on public.prod_entrega_matriz to authenticated;

-- Detalhes especializados são gravados após o cabeçalho idempotente. Caso a
-- rede caia entre as duas RPCs, o reenvio usa o mesmo client_id, recupera o
-- lançamento existente e conclui este passo sem criar duplicidade.
create or replace function public.prod_salvar_detalhes_lancamento(
  p_lancamento_id uuid,
  p_detalhes jsonb
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_l public.prod_lancamentos;
  v_evs jsonb := p_detalhes->'evs';
  v_flg jsonb := p_detalhes->'flange';
  v_reparo jsonb;
  v_i integer := 0;
begin
  select * into v_l from public.prod_lancamentos where id = p_lancamento_id and excluido_em is null;
  if not found then raise exception 'Lançamento não encontrado.'; end if;
  if not public.form_pode_editar(v_l.criado_por) then raise exception 'Usuário sem permissão para alterar este lançamento.'; end if;

  if v_evs is not null then
    if v_l.etapa_id <> 'evs' then raise exception 'Medições EVS só podem ser gravadas em lançamento EVS.'; end if;
    insert into public.prod_evs_medicoes (lancamento_id, altura_interna, altura_externa, comprimento, "offset", perimetro, curvatura, medicoes, completo, updated_at)
    values (p_lancamento_id, nullif(v_evs->>'altura_interna','')::numeric, nullif(v_evs->>'altura_externa','')::numeric,
      nullif(v_evs->>'comprimento','')::numeric, nullif(v_evs->>'offset','')::numeric,
      nullif(v_evs->>'perimetro','')::numeric, nullif(v_evs->>'curvatura','')::numeric,
      v_evs, (v_evs ? 'altura_interna' and v_evs ? 'altura_externa' and v_evs ? 'comprimento'), now())
    on conflict (lancamento_id) do update set altura_interna = excluded.altura_interna, altura_externa = excluded.altura_externa,
      comprimento = excluded.comprimento, "offset" = excluded."offset", perimetro = excluded.perimetro, curvatura = excluded.curvatura,
      medicoes = excluded.medicoes, completo = excluded.completo, updated_at = now();
  end if;

  if v_flg is not null then
    if v_l.etapa_id <> 'flange' then raise exception 'Medições de flange só podem ser gravadas em lançamento Flange.'; end if;
    insert into public.prod_flange_medicoes (lancamento_id, raiz_1, raiz_2, raiz_3, raiz_4, offsets, completo, aceite_pendencia, updated_at)
    values (p_lancamento_id, nullif(v_flg->>'raiz_1','')::numeric, nullif(v_flg->>'raiz_2','')::numeric,
      nullif(v_flg->>'raiz_3','')::numeric, nullif(v_flg->>'raiz_4','')::numeric,
      coalesce(v_flg->'offsets', '{}'::jsonb), (v_flg ? 'raiz_1' and v_flg ? 'raiz_2' and v_flg ? 'raiz_3' and v_flg ? 'raiz_4'),
      coalesce((v_flg->>'aceite_pendencia')::boolean, false), now())
    on conflict (lancamento_id) do update set raiz_1 = excluded.raiz_1, raiz_2 = excluded.raiz_2, raiz_3 = excluded.raiz_3,
      raiz_4 = excluded.raiz_4, offsets = excluded.offsets, completo = excluded.completo,
      aceite_pendencia = excluded.aceite_pendencia, updated_at = now();
  end if;

  if p_detalhes ? 'defeitoId' or p_detalhes ? 'motivoRefugo' then
    update public.prod_lancamentos set defeito_id = nullif(p_detalhes->>'defeitoId','')::uuid,
      motivo_refugo = nullif(p_detalhes->>'motivoRefugo',''),
      refugado_em = case when nullif(p_detalhes->>'motivoRefugo','') is not null then now() else refugado_em end,
      updated_at = now() where id = p_lancamento_id;
  end if;

  if p_detalhes ? 'utReparos' then
    if v_l.etapa_id <> 'ut' then raise exception 'Reparos só podem ser gravados em lançamento UT.'; end if;
    delete from public.prod_ut_reparos where lancamento_id = p_lancamento_id;
    for v_reparo in select value from jsonb_array_elements(p_detalhes->'utReparos') loop
      v_i := v_i + 1;
      insert into public.prod_ut_reparos (lancamento_id, sequencia, defeito_id, largura, comprimento, profundidade, procedimento)
      values (p_lancamento_id, v_i, nullif(v_reparo->>'defeitoId','')::uuid, nullif(v_reparo->>'largura','')::numeric,
        nullif(v_reparo->>'comprimento','')::numeric, nullif(v_reparo->>'profundidade','')::numeric, nullif(v_reparo->>'procedimento',''));
    end loop;
  end if;
end;
$$;

revoke all on function public.prod_salvar_detalhes_lancamento(uuid, jsonb) from public, anon;
grant execute on function public.prod_salvar_detalhes_lancamento(uuid, jsonb) to authenticated, service_role;
