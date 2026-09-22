-- =====================================================================
-- Compras × Book de EPIs: situação de EPI de cada material da solicitação.
--
-- A Nova Solicitação avisa se um item de EPI está no Book (e leva o CA para
-- a observação) ou se precisa passar pela Segurança do Trabalho. Quem abre
-- compra nem sempre acessa o SSMA, e a RLS do Book devolveria "não
-- cadastrado" por falta de permissão — por isso SECURITY DEFINER, expondo só
-- o necessário: grupo, presença no Book e CA.
--
-- É EPI quando o código está no Book ou quando o grupo de mercadoria do SAP
-- é de EPI (M11003002 / B7001, "PROTECAO INDIVIDUAL"). Uniformes só contam
-- quando estão no Book: os grupos de uniforme têm muita roupa que não é EPI.
-- =====================================================================

create or replace function public.sup_epi_status_materiais(p_codigos text[])
returns table (
  codigo text,
  eh_grupo_epi boolean,
  no_book boolean,
  book_inativo boolean,
  cas text[],
  descricao_book text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with pedidos as (
    select distinct trim(c) as codigo, ltrim(trim(c), '0') as chave
      from unnest(coalesce(p_codigos, '{}')) as c
     where nullif(trim(c), '') is not null
     limit 200
  ),
  grupos as (
    select p.codigo,
           bool_or(
             m.grupo_mercadoria_codigo in ('M11003002', 'B7001')
             or m.grupo_mercadoria_desc ilike '%PROTECAO INDIVIDUAL%'
             or upper(trim(m.grupo_mercadoria_desc)) = 'EPI'
           ) as eh_grupo_epi
      from pedidos p
      join public.materials m on ltrim(trim(m.material_code), '0') = p.chave
     group by p.codigo
  ),
  book as (
    select p.codigo,
           bool_or(b.ativo) as tem_ativo,
           array_agg(distinct nullif(trim(b.ca), '')) filter (where b.ativo and nullif(trim(b.ca), '') is not null) as cas,
           min(b.descricao_epi) filter (where b.ativo) as descricao
      from pedidos p
      join public.ssma_book_epis b on ltrim(trim(b.codigo_sap), '0') = p.chave
     group by p.codigo
  )
  select p.codigo,
         coalesce(g.eh_grupo_epi, false),
         coalesce(bk.tem_ativo, false),
         bk.codigo is not null and not coalesce(bk.tem_ativo, false),
         coalesce(bk.cas, '{}'),
         bk.descricao
    from pedidos p
    left join grupos g on g.codigo = p.codigo
    left join book bk on bk.codigo = p.codigo;
$$;

revoke all on function public.sup_epi_status_materiais(text[]) from public, anon;
grant execute on function public.sup_epi_status_materiais(text[]) to authenticated;
