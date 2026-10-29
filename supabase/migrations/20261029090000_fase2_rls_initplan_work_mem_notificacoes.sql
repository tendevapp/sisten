-- =====================================================================
-- Redução de carga no Supabase — Fase 2 (ver plano de 28/10/2026)
-- =====================================================================
-- 1) RLS: `has_role('x')` / `has_page_access('x')` com argumento fixo eram
--    avaliadas UMA VEZ POR LINHA (são SECURITY DEFINER e leem core_perfis;
--    o Postgres não as inlina). Envolver em `(SELECT ...)` vira InitPlan:
--    avaliada uma vez por consulta, mesmo resultado. core_perfis tinha 32 M
--    de idx_scan para 75 linhas. Só chamadas com argumento literal — as que
--    recebem coluna da linha precisam continuar por linha. Idempotente: o
--    lookbehind não casa o que já está embrulhado. Em 29/10/2026: 75
--    policies, 48 tabelas, 179 chamadas.
-- 2) work_mem 32 MB só nas funções pesadas (busca do catálogo, recálculos da
--    importação, maiores códigos). O global segue 3,5 MB: num plano de 1 GB
--    com 60 conexões, subir para todos arriscaria a memória. Desde 07/10
--    foram 252 GB de arquivos temporários por falta de work_mem.
-- 3) Índice das notificações por usuário (a consulta mais chamada do banco
--    fazia seq scan: só existia a pkey). Tabela de ~3 MB: o CREATE INDEX
--    comum trava escrita por milissegundos.

do $$
declare
  pol record;
  padrao constant text := '(?<!SELECT )((has_role|has_page_access)\(''[^'']*''::text\))';
  sql text;
begin
  for pol in
    select tablename, policyname, qual, with_check
      from pg_policies
     where schemaname = 'public'
       and (coalesce(qual, '') || coalesce(with_check, '')) ~ padrao
  loop
    sql := format('alter policy %I on public.%I', pol.policyname, pol.tablename);
    if pol.qual is not null then
      sql := sql || ' using (' || regexp_replace(pol.qual, padrao, '(SELECT \1)', 'g') || ')';
    end if;
    if pol.with_check is not null then
      sql := sql || ' with check (' || regexp_replace(pol.with_check, padrao, '(SELECT \1)', 'g') || ')';
    end if;
    execute sql;
  end loop;
end $$;

alter function public.buscar_materiais_catalogo(text[], text, text, text[], integer, integer, boolean, text, text, text, text) set work_mem = '32MB';
alter function public.buscar_materiais(text, text, integer, integer, boolean) set work_mem = '32MB';
alter function public.obter_maiores_codigos_catalogo() set work_mem = '32MB';
alter function public.refresh_material_sinais() set work_mem = '32MB';
alter function public.refresh_historico_pedidos() set work_mem = '32MB';

create index if not exists idx_core_notificacoes_user_created
  on public.core_notificacoes (user_id, created_at desc);
