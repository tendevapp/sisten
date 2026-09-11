-- =====================================================================
-- Financeiro > Faturamento GW Jacobina — controle de faturamento por tramo.
--
-- É o mesmo universo de torres/tramos do Almoxarifado > Projetos
-- (`proj_tramos_gwjaco`), mas o faturamento é lançado numa tabela própria
-- (`fin_fat_gwjaco`): quem fatura não mexe no fluxo de fabricação/kits, e o
-- financeiro pode cadastrar torre/tramo além do que já está semeado em
-- `proj_tramos_gwjaco` (projeto novo, ou faixa de torres ainda não
-- cadastrada lá). Por isso `tramo_id` é um link best-effort (preenchido
-- quando existe a linha correspondente), não uma FK obrigatória.
--
-- Segue o mesmo desenho de edição do Almoxarifado > Recebimento
-- (`20260909170500_alm_recebimento_edicao_e_log.sql`): RLS autor-ou-admin
-- via `form_pode_editar`, e cada edição grava um diff em
-- `fin_fat_alteracoes`.
--
-- Não usa o código `MODULO-DDMMYY-INDICE` de `codigosFormulario.ts`: o
-- registro aqui não é uma submissão sequencial, é uma linha por torre+tramo
-- (chave natural), igual a `proj_tramos_gwjaco`.
-- =====================================================================

create table if not exists public.fin_fat_gwjaco (
  id uuid primary key default gen_random_uuid(),
  projeto text not null default 'GW_JACOBINA',
  torre_numero integer not null,
  tramo text not null check (tramo in ('T1','T2','T3','T4','T5')),
  serie integer,
  tramo_id text references public.proj_tramos_gwjaco (id),
  codigo_cliente text,
  projeto_codigo text,
  nota_fiscal text,
  data_faturado date,
  semana_faturamento integer,
  data_expedido date,
  data_tramos_previstos date,
  observacao text,
  criado_por_id uuid default auth.uid(),
  criado_por_nome text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (projeto, torre_numero, tramo)
);

create index if not exists idx_fin_fat_gwjaco_torre on public.fin_fat_gwjaco (projeto, torre_numero);
create index if not exists idx_fin_fat_gwjaco_semana on public.fin_fat_gwjaco (semana_faturamento);

comment on table public.fin_fat_gwjaco is
  'Faturamento por tramo do GW Jacobina — espelha as chaves de proj_tramos_gwjaco (torre/tramo/série) numa tabela própria do Financeiro.';

-- 1) Log de alterações -------------------------------------------------------
create table if not exists public.fin_fat_alteracoes (
  id uuid primary key default gen_random_uuid(),
  fat_id uuid not null,
  -- [{campo, de, para}]
  alteracoes jsonb not null default '[]'::jsonb,
  resumo text,
  alterado_por_id uuid,
  alterado_por_nome text,
  created_at timestamptz not null default now()
);
create index if not exists idx_fin_fat_alteracoes_fat
  on public.fin_fat_alteracoes (fat_id, created_at desc);

grant select on public.fin_fat_alteracoes to authenticated;
grant all on public.fin_fat_alteracoes to service_role;
alter table public.fin_fat_alteracoes enable row level security;
drop policy if exists fin_fat_alteracoes_sel on public.fin_fat_alteracoes;
create policy fin_fat_alteracoes_sel on public.fin_fat_alteracoes
  for select to authenticated using (true);
-- Sem policy de INSERT: só a RPC security definer grava.

-- 2) RLS autor-ou-admin -------------------------------------------------------
-- `form_pode_editar` já existe (criada em 20260902160000 / 20260909170500);
-- `create or replace` deixa esta migration independente da ordem de aplicação.
create or replace function public.form_pode_editar(p_dono text)
returns boolean
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select public.has_role('admin')
      or (p_dono is not null and p_dono = (select auth.uid())::text);
$$;
revoke all on function public.form_pode_editar(text) from public, anon;
grant execute on function public.form_pode_editar(text) to authenticated;

grant select, insert, update, delete on public.fin_fat_gwjaco to authenticated, service_role;
alter table public.fin_fat_gwjaco enable row level security;

drop policy if exists "fin_fat_gwjaco_all" on public.fin_fat_gwjaco;
create policy fin_fat_gwjaco_sel on public.fin_fat_gwjaco
  for select to authenticated using (true);
create policy fin_fat_gwjaco_ins on public.fin_fat_gwjaco
  for insert to authenticated
  with check (criado_por_id is null or criado_por_id = (select auth.uid()) or public.has_role('admin'));
create policy fin_fat_gwjaco_upd on public.fin_fat_gwjaco
  for update to authenticated
  using (public.form_pode_editar(criado_por_id::text))
  with check (public.form_pode_editar(criado_por_id::text));
create policy fin_fat_gwjaco_del on public.fin_fat_gwjaco
  for delete to authenticated
  using (public.form_pode_editar(criado_por_id::text));

-- 3) RPC — editar lançamento, com diff logado --------------------------------
create or replace function public.fin_fat_editar(
  p_id uuid, p_patch jsonb, p_user jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old public.fin_fat_gwjaco;
  v_alt jsonb := '[]'::jsonb;
  v_campos text[] := array['torre_numero','tramo','serie','codigo_cliente','projeto_codigo',
                           'nota_fiscal','data_faturado','semana_faturamento',
                           'data_expedido','data_tramos_previstos','observacao'];
  k text;
  v_de text;
  v_para text;
begin
  select * into v_old from public.fin_fat_gwjaco where id = p_id;
  if not found then raise exception 'Lançamento não encontrado.'; end if;
  if not public.form_pode_editar(v_old.criado_por_id::text) then
    raise exception 'Só o autor do registro ou um admin pode editar.';
  end if;

  foreach k in array v_campos loop
    if p_patch ? k then
      v_de := (to_jsonb(v_old) ->> k);
      v_para := (p_patch ->> k);
      if coalesce(v_de,'') is distinct from coalesce(v_para,'') then
        v_alt := v_alt || jsonb_build_object('campo', k, 'de', v_de, 'para', v_para);
      end if;
    end if;
  end loop;

  update public.fin_fat_gwjaco set
    torre_numero = coalesce((p_patch->>'torre_numero')::int, torre_numero),
    tramo = coalesce(nullif(p_patch->>'tramo',''), tramo),
    serie = case when p_patch ? 'serie' then nullif(p_patch->>'serie','')::int else serie end,
    codigo_cliente = case when p_patch ? 'codigo_cliente' then nullif(p_patch->>'codigo_cliente','') else codigo_cliente end,
    projeto_codigo = case when p_patch ? 'projeto_codigo' then nullif(p_patch->>'projeto_codigo','') else projeto_codigo end,
    nota_fiscal = case when p_patch ? 'nota_fiscal' then nullif(p_patch->>'nota_fiscal','') else nota_fiscal end,
    data_faturado = case when p_patch ? 'data_faturado' then nullif(p_patch->>'data_faturado','')::date else data_faturado end,
    semana_faturamento = case when p_patch ? 'semana_faturamento' then nullif(p_patch->>'semana_faturamento','')::int else semana_faturamento end,
    data_expedido = case when p_patch ? 'data_expedido' then nullif(p_patch->>'data_expedido','')::date else data_expedido end,
    data_tramos_previstos = case when p_patch ? 'data_tramos_previstos' then nullif(p_patch->>'data_tramos_previstos','')::date else data_tramos_previstos end,
    observacao = case when p_patch ? 'observacao' then nullif(p_patch->>'observacao','') else observacao end,
    updated_at = now()
  where id = p_id;

  if jsonb_array_length(v_alt) > 0 then
    insert into public.fin_fat_alteracoes (fat_id, alteracoes, resumo, alterado_por_id, alterado_por_nome)
    values (p_id, v_alt, jsonb_array_length(v_alt) || ' campo(s) alterado(s)',
            nullif(p_user->>'id','')::uuid, p_user->>'nome');
  end if;

  return jsonb_build_object('id', p_id, 'alteracoes', jsonb_array_length(v_alt));
end;
$$;

revoke all on function public.fin_fat_editar(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.fin_fat_editar(uuid, jsonb, jsonb) to authenticated, service_role;

-- 4) Carga inicial — torres 1 a 18 (o que já está faturado/lançado hoje) -----
insert into public.fin_fat_gwjaco
  (torre_numero, tramo, serie, codigo_cliente, projeto_codigo, nota_fiscal,
   data_faturado, semana_faturamento, data_expedido, data_tramos_previstos)
values
  (1,'T1',3143,'S1 SEC GW5S120M','GW5S120M-001','21016-1','2026-08-31',36,'2026-09-04','2026-09-04'),
  (1,'T2',3144,'S2 SEC GW5S120M','GW5S120M-001','21020-1','2026-08-31',36,'2026-09-01','2026-09-01'),
  (1,'T3',3145,'S3 SEC GW5S120M','GW5S120M-001','20990-1','2026-08-25',35,'2026-09-02','2026-09-02'),
  (1,'T4',3146,'S4 SEC GW5S120M','GW5S120M-001','20981-1','2026-08-21',34,'2026-08-27','2026-08-27'),
  (1,'T5',3147,'S5 SEC GW5S120M','GW5S120M-001','20967-1','2026-08-19',34,'2026-08-28','2026-08-28'),
  (2,'T1',3148,'S1 SEC GW5S120M','GW5S120M-001','21017-1','2026-08-31',36,null,null),
  (2,'T2',3149,'S2 SEC GW5S120M','GW5S120M-001','20949-1','2026-08-13',33,null,null),
  (2,'T3',3150,'S3 SEC GW5S120M','GW5S120M-001','20966-1','2026-08-19',34,null,null),
  (2,'T4',3151,'S4 SEC GW5S120M','GW5S120M-001','20962-1','2026-08-15',33,null,null),
  (2,'T5',3152,'S5 SEC GW5S120M','GW5S120M-001',null,null,null,null,null),
  (3,'T1',3153,'S1 SEC GW5S120M','GW5S120M-001','21018-1','2026-08-31',36,null,null),
  (3,'T2',3154,'S2 SEC GW5S120M','GW5S120M-001',null,null,null,null,null),
  (3,'T3',3155,'S3 SEC GW5S120M','GW5S120M-001',null,null,null,null,null),
  (3,'T4',3156,'S4 SEC GW5S120M','GW5S120M-001','21050-1','2026-09-08',37,'2026-09-09','2026-09-09'),
  (3,'T5',3157,'S5 SEC GW5S120M','GW5S120M-001',null,null,null,null,null),
  (4,'T1',3158,'S1 SEC GW5S120M','GW5S120M-001','21019-1','2026-08-31',36,null,null),
  (4,'T2',3159,'S2 SEC GW5S120M','GW5S120M-001','20950-1','2026-08-13',33,null,null),
  (4,'T3',3160,'S3 SEC GW5S120M','GW5S120M-001','21012-1','2026-08-29',35,'2026-09-09','2026-09-09'),
  (4,'T4',3161,'S4 SEC GW5S120M','GW5S120M-001',null,null,null,null,null),
  (4,'T5',3162,'S5 SEC GW5S120M','GW5S120M-001',null,null,null,null,null),
  (5,'T1',3163,'S1 SEC GW5S120M','GW5S120M-001',null,null,null,null,null),
  (5,'T2',3164,'S2 SEC GW5S120M','GW5S120M-001',null,null,null,null,null),
  (5,'T3',3165,'S3 SEC GW5S120M','GW5S120M-001',null,null,null,null,null),
  (5,'T4',3166,'S4 SEC GW5S120M','GW5S120M-001',null,null,null,null,null),
  (5,'T5',3167,'S5 SEC GW5S120M','GW5S120M-001',null,null,null,null,null),
  (6,'T1',3168,'S1 SEC GW5S120M','GW5S120M-001',null,null,null,null,null),
  (6,'T2',3169,'S2 SEC GW5S120M','GW5S120M-001','20997-1','2026-08-25',35,null,null),
  (6,'T3',3170,'S3 SEC GW5S120M','GW5S120M-001',null,null,null,null,null),
  (6,'T4',3171,'S4 SEC GW5S120M','GW5S120M-001',null,null,null,null,null),
  (6,'T5',3172,'S5 SEC GW5S120M','GW5S120M-001',null,null,null,null,null),
  (7,'T1',3173,'S1 SEC GW5S120M','GW5S120M-001',null,null,null,null,null),
  (7,'T2',3174,'S2 SEC GW5S120M','GW5S120M-001',null,null,null,null,null),
  (7,'T3',3175,'S3 SEC GW5S120M','GW5S120M-001',null,null,null,null,null),
  (7,'T4',3176,'S4 SEC GW5S120M','GW5S120M-001',null,null,null,null,null),
  (7,'T5',3177,'S5 SEC GW5S120M','GW5S120M-001',null,null,null,null,null),
  (8,'T1',3178,'S1 SEC GW5S120M','GW5S120M-001',null,null,null,null,null),
  (8,'T2',3179,'S2 SEC GW5S120M','GW5S120M-001',null,null,null,null,null),
  (8,'T3',3180,'S3 SEC GW5S120M','GW5S120M-001',null,null,null,null,null),
  (8,'T4',3181,'S4 SEC GW5S120M','GW5S120M-001',null,null,null,null,null),
  (8,'T5',3182,'S5 SEC GW5S120M','GW5S120M-001',null,null,null,null,null),
  (9,'T1',3183,'S1 SEC GW5S120M','GW5S120M-001',null,null,null,null,null),
  (9,'T2',3184,'S2 SEC GW5S120M','GW5S120M-001',null,null,null,null,null),
  (9,'T3',3185,'S3 SEC GW5S120M','GW5S120M-001',null,null,null,null,null),
  (9,'T4',3186,'S4 SEC GW5S120M','GW5S120M-001',null,null,null,null,null),
  (9,'T5',3187,'S5 SEC GW5S120M','GW5S120M-001',null,null,null,null,null),
  (10,'T1',3188,'S1 SEC GW5S120M','GW5S120M-001',null,null,null,null,null),
  (10,'T2',3189,'S2 SEC GW5S120M','GW5S120M-001',null,null,null,null,null),
  (10,'T3',3190,'S3 SEC GW5S120M','GW5S120M-001',null,null,null,null,null),
  (10,'T4',3191,'S4 SEC GW5S120M','GW5S120M-001',null,null,null,null,null),
  (10,'T5',3192,'S5 SEC GW5S120M','GW5S120M-001',null,null,null,null,null),
  (11,'T1',3193,'S1 SEC GW5S120M','GW5S120M-001',null,null,null,null,null),
  (11,'T2',3194,'S2 SEC GW5S120M','GW5S120M-001',null,null,null,null,null),
  (11,'T3',3195,'S3 SEC GW5S120M','GW5S120M-001',null,null,null,null,null),
  (11,'T4',3196,'S4 SEC GW5S120M','GW5S120M-001',null,null,null,null,null),
  (11,'T5',3197,'S5 SEC GW5S120M','GW5S120M-001',null,null,null,null,null),
  (12,'T1',3198,'S1 SEC GW5S120M','GW5S120M-001',null,null,null,null,null),
  (12,'T2',3199,'S2 SEC GW5S120M','GW5S120M-001',null,null,null,null,null),
  (12,'T3',3200,'S3 SEC GW5S120M','GW5S120M-001',null,null,null,null,null),
  (12,'T4',3201,'S4 SEC GW5S120M','GW5S120M-001',null,null,null,null,null),
  (12,'T5',3202,'S5 SEC GW5S120M','GW5S120M-001',null,null,null,null,null),
  (13,'T1',3203,'S1 SEC GW5S120M','GW5S120M-001',null,null,null,null,null),
  (13,'T2',3204,'S2 SEC GW5S120M','GW5S120M-001',null,null,null,null,null),
  (13,'T3',3205,'S3 SEC GW5S120M','GW5S120M-001',null,null,null,null,null),
  (13,'T4',3206,'S4 SEC GW5S120M','GW5S120M-001',null,null,null,null,null),
  (13,'T5',3207,'S5 SEC GW5S120M','GW5S120M-001',null,null,null,null,null),
  (14,'T1',3208,'S1 SEC GW5S120M','GW5S120M-001',null,null,null,null,null),
  (14,'T2',3209,'S2 SEC GW5S120M','GW5S120M-001',null,null,null,null,null),
  (14,'T3',3210,'S3 SEC GW5S120M','GW5S120M-001',null,null,null,null,null),
  (14,'T4',3211,'S4 SEC GW5S120M','GW5S120M-001',null,null,null,null,null),
  (14,'T5',3212,'S5 SEC GW5S120M','GW5S120M-001',null,null,null,null,null),
  (15,'T1',3213,'S1 SEC GW5S120M','GW5S120M-001',null,null,null,null,null),
  (15,'T2',3214,'S2 SEC GW5S120M','GW5S120M-001',null,null,null,null,null),
  (15,'T3',3215,'S3 SEC GW5S120M','GW5S120M-001',null,null,null,null,null),
  (15,'T4',3216,'S4 SEC GW5S120M','GW5S120M-001',null,null,null,null,null),
  (15,'T5',3217,'S5 SEC GW5S120M','GW5S120M-001',null,null,null,null,null),
  (16,'T1',3218,'S1 SEC GW5S120M','GW5S120M-001',null,null,null,null,null),
  (16,'T2',3219,'S2 SEC GW5S120M','GW5S120M-001',null,null,null,null,null),
  (16,'T3',3220,'S3 SEC GW5S120M','GW5S120M-001',null,null,null,null,null),
  (16,'T4',3221,'S4 SEC GW5S120M','GW5S120M-001',null,null,null,null,null),
  (16,'T5',3222,'S5 SEC GW5S120M','GW5S120M-001',null,null,null,null,null),
  (17,'T1',3223,'S1 SEC GW5S120M','GW5S120M-001',null,null,null,null,null),
  (17,'T2',3224,'S2 SEC GW5S120M','GW5S120M-001',null,null,null,null,null),
  (17,'T3',3225,'S3 SEC GW5S120M','GW5S120M-001',null,null,null,null,null),
  (17,'T4',3226,'S4 SEC GW5S120M','GW5S120M-001',null,null,null,null,null),
  (17,'T5',3227,'S5 SEC GW5S120M','GW5S120M-001',null,null,null,null,null),
  (18,'T1',3228,'S1 SEC GW5S120M','GW5S120M-001',null,null,null,null,null),
  (18,'T2',3229,'S2 SEC GW5S120M','GW5S120M-001',null,null,null,null,null),
  (18,'T3',3230,'S3 SEC GW5S120M','GW5S120M-001',null,null,null,null,null),
  (18,'T4',3231,'S4 SEC GW5S120M','GW5S120M-001',null,null,null,null,null),
  (18,'T5',3232,'S5 SEC GW5S120M','GW5S120M-001',null,null,null,null,null)
on conflict (projeto, torre_numero, tramo) do nothing;

-- Vincula tramo_id ao catálogo de proj_tramos_gwjaco onde já existir a mesma
-- torre+tramo (deriva de 'T'||tramo||'-'||serie, ver db/sql/tables/proj_subprojetos_tramos.sql).
update public.fin_fat_gwjaco f
set tramo_id = p.id
from public.proj_tramos_gwjaco p
where f.projeto = p.projeto and f.torre_numero = p.torre_numero and f.tramo = p.tramo
  and f.tramo_id is null;
