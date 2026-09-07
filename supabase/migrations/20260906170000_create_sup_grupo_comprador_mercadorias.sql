-- =====================================================================
-- Cadastro e Gestão de Grupo Comprador x Grupos de Mercadorias (SAP)
-- Tabela: sup_grupo_comprador_mercadorias
--
-- Define quais grupos de mercadorias pertencem a cada codigo de comprador
-- (ex.: 358 - Isadora, 575 - Andre, 314 - Itana, 602 - Jamille, 610 - Giulia).
--
-- Carga inicial baseada na analise historica de pedidos e requisicoes
-- no recorte de 05/2026 ate o presente.
-- =====================================================================

create table if not exists public.sup_grupo_comprador_mercadorias (
  id uuid primary key default gen_random_uuid(),
  grupo_compras text not null,
  nome_comprador text not null,
  grupo_mercadoria_codigo text not null unique,
  grupo_mercadoria_nome text not null,
  classificacao_nivel1 text,
  observacao text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indices para performance de consulta
create index if not exists idx_sup_grp_comp_merc_comprador on public.sup_grupo_comprador_mercadorias (grupo_compras);
create index if not exists idx_sup_grp_comp_merc_codigo on public.sup_grupo_comprador_mercadorias (grupo_mercadoria_codigo);

-- Trigger de updated_at
drop trigger if exists tr_sup_grp_comp_merc_updated_at on public.sup_grupo_comprador_mercadorias;
create trigger tr_sup_grp_comp_merc_updated_at
  before update on public.sup_grupo_comprador_mercadorias
  for each row execute function public.update_updated_at_column();

-- Permissoes
grant select, insert, update, delete on public.sup_grupo_comprador_mercadorias to anon, authenticated, service_role;

-- RLS
alter table public.sup_grupo_comprador_mercadorias enable row level security;

drop policy if exists "sup_grupo_comprador_mercadorias_select_all" on public.sup_grupo_comprador_mercadorias;
create policy "sup_grupo_comprador_mercadorias_select_all"
  on public.sup_grupo_comprador_mercadorias
  for select
  using (true);

drop policy if exists "sup_grupo_comprador_mercadorias_all_authenticated" on public.sup_grupo_comprador_mercadorias;
create policy "sup_grupo_comprador_mercadorias_all_authenticated"
  on public.sup_grupo_comprador_mercadorias
  for all
  using (true)
  with check (true);

-- Carga inicial gerada a partir da analise de pedidos e requisicoes desde 05/2026
-- com as diretrizes explicitas (EPI M11003002 -> 358 Isadora, Medicamentos M04001003 -> 575 Andre)
with pedidos_raw as (
  select 
    p.grp_mercads as codigo,
    case 
      when p.grp_mercads = 'M04001003' then '575'
      when p.grp_mercads = 'M11003002' then '358'
      when trim(p.criado_por_pedido) = 'IVALOIS' then '314'
      when trim(p.criado_por_pedido) = 'ISANTOS' then '358'
      when trim(p.criado_por_pedido) = 'AMURITIBA' then '575'
      when trim(p.criado_por_pedido) = 'JSBATISTA' then '602'
      when trim(p.criado_por_pedido) = 'GAQUINO' then '610'
      else '358'
    end as grupo_compras,
    count(*) as qtd_pedidos,
    sum(coalesce(p.valor_liquido, 0)) as total_valor
  from pedidos p
  where p.data_doc >= '2026-05-01' and p.grp_mercads is not null and p.grp_mercads != ''
  group by p.grp_mercads, grupo_compras
),
pedidos_ranked as (
  select 
    codigo,
    grupo_compras,
    qtd_pedidos,
    total_valor,
    row_number() over(partition by codigo order by 
      case 
        when codigo = 'M04001003' and grupo_compras = '575' then 999999
        when codigo = 'M11003002' and grupo_compras = '358' then 999999
        else qtd_pedidos 
      end desc, total_valor desc) as rnk
  from pedidos_raw
),
reqs_raw as (
  select 
    r.grupo_de_mercadorias as codigo,
    case 
      when r.grupo_de_mercadorias = 'M04001003' then '575'
      when r.grupo_de_mercadorias = 'M11003002' then '358'
      when r.grupo_de_compradores in ('314', '358', '575', '602', '610') then r.grupo_de_compradores
      else '358'
    end as grupo_compras,
    count(*) as qtd_reqs
  from requisicoes r
  where r.data_da_solicitacao >= '2026-05-01' 
    and r.grupo_de_mercadorias is not null 
    and r.grupo_de_mercadorias != ''
    and r.grupo_de_mercadorias not in (select codigo from pedidos_ranked where rnk = 1)
  group by r.grupo_de_mercadorias, grupo_compras
),
reqs_ranked as (
  select 
    codigo,
    grupo_compras,
    qtd_reqs,
    row_number() over(partition by codigo order by qtd_reqs desc) as rnk
  from reqs_raw
),
unificado as (
  select p.codigo, p.grupo_compras from pedidos_ranked p where p.rnk = 1
  union all
  select r.codigo, r.grupo_compras from reqs_ranked r where r.rnk = 1
)
insert into public.sup_grupo_comprador_mercadorias (
  grupo_compras,
  nome_comprador,
  grupo_mercadoria_codigo,
  grupo_mercadoria_nome,
  classificacao_nivel1
)
select 
  u.grupo_compras,
  case 
    when u.grupo_compras = '314' then 'Itana'
    when u.grupo_compras = '358' then 'Isadora'
    when u.grupo_compras = '575' then 'André'
    when u.grupo_compras = '602' then 'Jamille'
    when u.grupo_compras = '610' then 'Giulia'
    else 'Comprador ' || u.grupo_compras
  end as nome_comprador,
  u.codigo as grupo_mercadoria_codigo,
  coalesce(cgm.denominacao, u.codigo) as grupo_mercadoria_nome,
  cgm.classificacao_nivel1
from unificado u
left join cadastro_grupo_mercadoria cgm on cgm.codigo = u.codigo
on conflict (grupo_mercadoria_codigo) do update set
  grupo_compras = excluded.grupo_compras,
  nome_comprador = excluded.nome_comprador,
  grupo_mercadoria_nome = excluded.grupo_mercadoria_nome,
  classificacao_nivel1 = excluded.classificacao_nivel1,
  updated_at = now();
