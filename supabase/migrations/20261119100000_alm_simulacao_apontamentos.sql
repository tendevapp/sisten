-- Apontamento de contagem da Simulação de baixas (TEMPORÁRIO)
--
-- Auditoria RQB × MB51 › Simulação de baixas: lista para conferir o físico dos
-- itens com baixa divergente, na ordem do galpão, com o físico esperado à
-- vista. NÃO é inventário: sem travas, sem segunda contagem, sem mexer em
-- alm_inventarios nem no saldo. Só recebe o que foi contado.
--
-- Uma rodada = um corte da ZL0024 (`zl_em`, a data da importação usada na
-- simulação). Recontar o mesmo material × depósito × UM na mesma rodada
-- sobrescreve o apontamento anterior.

create table if not exists public.alm_simulacao_apontamentos (
  id uuid primary key default gen_random_uuid(),
  zl_em timestamptz not null,
  material text not null,
  deposito text not null,
  unidade text not null default '',
  descricao text,
  posicao text,
  esperado numeric,
  contado numeric not null check (contado >= 0),
  observacao text,
  contado_por text default (auth.uid())::text,
  contado_por_nome text,
  contado_em timestamptz not null default now(),
  unique (zl_em, material, deposito, unidade)
);

alter table public.alm_simulacao_apontamentos enable row level security;
drop policy if exists alm_simulacao_apontamentos_sel on public.alm_simulacao_apontamentos;
create policy alm_simulacao_apontamentos_sel on public.alm_simulacao_apontamentos
  for select to authenticated using (true);
drop policy if exists alm_simulacao_apontamentos_ins on public.alm_simulacao_apontamentos;
create policy alm_simulacao_apontamentos_ins on public.alm_simulacao_apontamentos
  for insert to authenticated with check (true);
drop policy if exists alm_simulacao_apontamentos_upd on public.alm_simulacao_apontamentos;
create policy alm_simulacao_apontamentos_upd on public.alm_simulacao_apontamentos
  for update to authenticated using (true) with check (true);
drop policy if exists alm_simulacao_apontamentos_del on public.alm_simulacao_apontamentos;
create policy alm_simulacao_apontamentos_del on public.alm_simulacao_apontamentos
  for delete to authenticated using (public.has_role('admin'));
revoke all on public.alm_simulacao_apontamentos from anon;
grant select, insert, update, delete on public.alm_simulacao_apontamentos to authenticated;

comment on table public.alm_simulacao_apontamentos is
  'TEMPORÁRIO — contagem de conferência da Simulação de baixas (não é inventário).';
