-- Depois da queda de 24/11 (11h17 local). Ver o Monitor de Desempenho.
--
-- 1) sup_epi_status_materiais varria o catálogo inteiro a cada chamada.
--    O join era por ltrim(trim(material_code), '0'), que não usa índice:
--    446 mil linhas, 74 mil blocos lidos do disco (~580 MB) numa chamada de
--    2,6 s. Numa máquina de 1 GB, isso expulsa do cache o que os outros
--    usuários estavam lendo.
--    Nenhum código do catálogo tem zero à esquerda nem espaço (conferido em
--    24/11: 0 de 455 mil), então ltrim(trim(material_code), '0') é o próprio
--    material_code. O join passa a usar a PK (materials_pkey).
--
-- 2) VACUUM (ANALYZE) noturno das tabelas que a importação SAP reescreve.
--    Quando o Postgres cai, ele perde as estatísticas acumuladas
--    (n_dead_tup, n_mod_since_analyze). Depois de 24/11, as tabelas grandes
--    ficaram com n_live_tup = 0, e o autovacuum não tinha como saber que
--    precisava rodar. O mapa de visibilidade envelhece: um count(*) no
--    catálogo fazia 146 mil heap fetches (obter_maiores_codigos_catalogo
--    levou de 6 a 10 s). O vacuum pula páginas já limpas, então custa pouco
--    quando não há o que fazer.
--    Roda às 06:40 UTC (03:40 local), fora do expediente. SKIP_LOCKED: se
--    alguma tabela estiver em uso, ela fica para a noite seguinte em vez de
--    esperar.

create or replace function public.sup_epi_status_materiais(p_codigos text[])
returns table(codigo text, eh_grupo_epi boolean, no_book boolean, book_inativo boolean, cas text[], descricao_book text)
language sql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
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
      -- Pela PK: o catálogo não guarda zero à esquerda (ver o cabeçalho).
      join public.materials m on m.material_code = p.chave
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
$function$;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'sisten-vacuum-noturno') then
    perform cron.unschedule('sisten-vacuum-noturno');
  end if;
  perform cron.schedule(
    'sisten-vacuum-noturno',
    '40 6 * * *',
    $cmd$vacuum (analyze, skip_locked)
      public.sap_zl0169_162_catalogo,
      public.sap_catalogo_busca_tecnica,
      public.sap_zl0132_po,
      public.sap_me5a_rc,
      public.sap_me2l_pedido,
      public.sap_mb51_mov,
      public.sap_zl0024_stk,
      public.sap_zl0136_nf,
      public.sap_zl0170_miro,
      public.sap_fbl1n_pagar,
      public.sup_fornecedores_cidades,
      public.sap_requisicoes_enriquecidas_sync,
      public.mv_historico_pedidos,
      public.mv_pedidos_por_ri,
      public.mv_pedido_atual_por_ri,
      public.mv_material_sinais,
      private.mv_sap_requisicoes_po,
      private.mv_almox_controle_estoque$cmd$
  );
end $$;
