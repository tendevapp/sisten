-- Chamados ao Suprimentos ("Pendência de Processamento" e "Ajuste de Pedido")
-- abertos pela área financeira: Financeiro (6), Contabilidade (7),
-- Controladoria (18) e Fiscal (setor ainda não existe — entra pelo nome
-- quando for criado). Um colega de qualquer desses setores altera e reabre o
-- chamado aberto por outro — a pendência é da área, não da pessoa que colou a
-- planilha.
--
-- As linhas do chamado (sup_pend_processamento_nf) já são abertas a todo
-- autenticado; o que faltava era o UPDATE em core_solicitacoes, que hoje só
-- passa para o próprio solicitante (os usuários desses setores são, na
-- maioria, "visualizador"). Política nova, somada às existentes (OR).
--
-- Espelho no app: src/lib/chamadosSuprimentosGrupo.ts.

create or replace function public.sol_setor_grupo_fiscal(p_sector_id text)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select p_sector_id is not null and (
    p_sector_id in ('6', '7', '18')
    or exists (
      select 1 from public.core_setores s
      where s.id = p_sector_id and lower(s.name) like '%fiscal%'
    )
  );
$$;

create or replace function public.sol_grupo_fiscal_pode_alterar(p_solicitante_sector_id text)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select public.sol_setor_grupo_fiscal(p_solicitante_sector_id)
    and exists (
      select 1 from public.core_perfis p
      where p.id = (select auth.uid())::text
        and p.status = 'ativo'
        and public.sol_setor_grupo_fiscal(p.sector_id)
    );
$$;

revoke all on function public.sol_setor_grupo_fiscal(text) from public, anon;
revoke all on function public.sol_grupo_fiscal_pode_alterar(text) from public, anon;
grant execute on function public.sol_setor_grupo_fiscal(text) to authenticated;
grant execute on function public.sol_grupo_fiscal_pode_alterar(text) to authenticated;

drop policy if exists requests_update_grupo_fiscal on public.core_solicitacoes;
create policy requests_update_grupo_fiscal on public.core_solicitacoes
  for update to authenticated
  using (
    type = 'chamado'
    and category_id in ('Pendência de Processamento', 'Ajuste de Pedido')
    and public.sol_grupo_fiscal_pode_alterar(solicitante_sector_id)
  )
  with check (
    type = 'chamado'
    and category_id in ('Pendência de Processamento', 'Ajuste de Pedido')
    and public.sol_grupo_fiscal_pode_alterar(solicitante_sector_id)
  );
