-- =====================================================================
-- Almoxarifado > posição no depósito (Pos.dpst. da ZL0024) que sobrevive
-- ao item zerar.
--
-- A importação da ZL0024 apaga a tabela inteira e reinsere em lotes de 500;
-- material sem saldo some e leva a posição junto — mas a prateleira continua
-- a mesma. Este histórico anota cada par (material, posição) visto em
-- qualquer importação.
--
-- Um trigger por comando (com a tabela de linhas novas) grava a cada lote,
-- sem depender de alguém abrir o catálogo. Como o mesmo material pode cair em
-- lotes diferentes, a posição "atual" não é a do último lote: a view devolve
-- as posições vistas na última importação em que o material apareceu
-- (janela de 1 hora ao redor do último registro).
-- =====================================================================

create table if not exists public.alm_posicao_material (
  codigo_sap text not null,
  posicao text not null,
  visto_em timestamptz not null default now(),
  primary key (codigo_sap, posicao)
);

alter table public.alm_posicao_material enable row level security;

revoke all on public.alm_posicao_material from anon;
grant select on public.alm_posicao_material to authenticated;

create policy alm_posicao_material_sel on public.alm_posicao_material
  for select to authenticated using (true);

-- Escrita só pelo trigger (security definer): nenhum grant de insert/update.

create or replace function public.alm_posicao_material_registrar()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.alm_posicao_material (codigo_sap, posicao, visto_em)
  select distinct btrim(material::text), btrim(posicao_estoque::text), now()
    from novas
   where btrim(coalesce(material::text, '')) <> ''
     and btrim(coalesce(posicao_estoque::text, '')) <> ''
  on conflict (codigo_sap, posicao) do update set visto_em = excluded.visto_em;
  return null;
end;
$$;

revoke all on function public.alm_posicao_material_registrar() from public, anon, authenticated;

drop trigger if exists trg_alm_posicao_material on public.sap_zl0024_stk;
create trigger trg_alm_posicao_material
  after insert on public.sap_zl0024_stk
  referencing new table as novas
  for each statement
  execute function public.alm_posicao_material_registrar();

-- Estado atual da ZL0024 como ponto de partida.
insert into public.alm_posicao_material (codigo_sap, posicao, visto_em)
select distinct btrim(material::text), btrim(posicao_estoque::text), now()
  from public.sap_zl0024_stk
 where btrim(coalesce(material::text, '')) <> ''
   and btrim(coalesce(posicao_estoque::text, '')) <> ''
on conflict (codigo_sap, posicao) do update set visto_em = excluded.visto_em;

create or replace view public.alm_posicao_material_atual
with (security_invoker = true) as
select p.codigo_sap, p.posicao, p.visto_em
  from public.alm_posicao_material p
 where p.visto_em >= (
   select max(u.visto_em) - interval '1 hour'
     from public.alm_posicao_material u
    where u.codigo_sap = p.codigo_sap
 );

revoke all on public.alm_posicao_material_atual from anon;
grant select on public.alm_posicao_material_atual to authenticated;
