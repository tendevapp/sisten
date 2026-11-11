-- Abrir RM: solicitação cancelada ou excluída depois de exportada.
--
-- A RM pode já existir no SAP. Sem aviso, ela continua lá viva e entra na
-- Central de Compras como se ainda fosse comprada. A marca de exportação
-- (almox_rm_exportacao_solicitacoes) não tem FK para core_solicitacoes, então
-- sobrevive à exclusão: é nela que fica o carimbo, junto com o número da RM
-- (a solicitação excluída leva o linked_rm_number embora).
--
-- O almoxarifado confirma em Abrir RM que eliminou a RM no SAP
-- (sap_baixa_*), e o aviso sai da fila.

alter table public.almox_rm_exportacao_solicitacoes
  add column if not exists solicitacao_situacao text,
  add column if not exists solicitacao_situacao_em timestamptz,
  add column if not exists solicitacao_situacao_por_nome text,
  add column if not exists rm_numero text,
  add column if not exists sap_baixa_em timestamptz,
  add column if not exists sap_baixa_por_id uuid,
  add column if not exists sap_baixa_por_nome text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'almox_rm_exp_sol_situacao_ck'
      and conrelid = 'public.almox_rm_exportacao_solicitacoes'::regclass
  ) then
    alter table public.almox_rm_exportacao_solicitacoes
      add constraint almox_rm_exp_sol_situacao_ck
      check (solicitacao_situacao is null or solicitacao_situacao in ('cancelada', 'excluida'));
  end if;
end $$;

create index if not exists almox_rm_exp_sol_request_idx
  on public.almox_rm_exportacao_solicitacoes (request_id, created_at desc);

create or replace function public.almox_rm_marcar_solicitacao_encerrada()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sit text;
  v_req public.core_solicitacoes;
  v_marca public.almox_rm_exportacao_solicitacoes;
  v_nome text;
begin
  if tg_op = 'DELETE' then
    v_sit := 'excluida';
    v_req := old;
  elsif new.status = 'cancelada' and old.status is distinct from 'cancelada' then
    v_sit := 'cancelada';
    v_req := new;
  elsif old.status = 'cancelada' and new.status is distinct from 'cancelada' then
    -- Reativada: o aviso que ninguém tratou no SAP deixa de valer.
    update public.almox_rm_exportacao_solicitacoes
       set solicitacao_situacao = null,
           solicitacao_situacao_em = null,
           solicitacao_situacao_por_nome = null
     where request_id = new.id
       and solicitacao_situacao = 'cancelada'
       and sap_baixa_em is null;
    return null;
  else
    return null;
  end if;

  if v_req.type is distinct from 'compra' then
    return null;
  end if;

  -- Última exportação da solicitação: é ela que a tela lê.
  select * into v_marca
    from public.almox_rm_exportacao_solicitacoes
   where request_id = v_req.id
   order by created_at desc
   limit 1;

  if v_marca.id is null then
    return null; -- nunca saiu numa planilha: não há RM no SAP
  end if;

  -- Liberada para exportar de novo (a RM nunca existiu) e sem RM vinculada:
  -- também não há o que eliminar no SAP.
  if v_marca.liberado_exportar_em is not null
     and coalesce(trim(v_req.linked_rm_number), '') = '' then
    return null;
  end if;

  if v_marca.sap_baixa_em is not null then
    return null; -- já eliminada no SAP (ex.: cancelada e depois excluída)
  end if;

  select p.name into v_nome
    from public.profiles p
   where p.id::text = auth.uid()::text;

  update public.almox_rm_exportacao_solicitacoes
     set solicitacao_situacao = v_sit,
         solicitacao_situacao_em = now(),
         solicitacao_situacao_por_nome = coalesce(v_nome, solicitacao_situacao_por_nome),
         rm_numero = coalesce(nullif(trim(v_req.linked_rm_number), ''), rm_numero)
   where id = v_marca.id;

  return null;
end;
$$;

revoke all on function public.almox_rm_marcar_solicitacao_encerrada() from public, anon;

drop trigger if exists trg_core_solicitacoes_rm_encerrada on public.core_solicitacoes;
create trigger trg_core_solicitacoes_rm_encerrada
  after update of status or delete on public.core_solicitacoes
  for each row execute function public.almox_rm_marcar_solicitacao_encerrada();

-- Canceladas antes deste gatilho que já tinham saído numa planilha.
with ultima as (
  select distinct on (m.request_id) m.id, m.request_id, m.liberado_exportar_em
    from public.almox_rm_exportacao_solicitacoes m
   order by m.request_id, m.created_at desc
)
update public.almox_rm_exportacao_solicitacoes m
   set solicitacao_situacao = 'cancelada',
       solicitacao_situacao_em = s.updated_at,
       solicitacao_situacao_por_nome = (
         select h.user_name
           from public.core_solicitacoes_historico_status h
          where h.request_id = s.id and h.to_status = 'cancelada'
          order by h.created_at desc
          limit 1
       ),
       rm_numero = nullif(trim(s.linked_rm_number), '')
  from ultima u
  join public.core_solicitacoes s on s.id = u.request_id
 where m.id = u.id
   and s.type = 'compra'
   and s.status = 'cancelada'
   and m.solicitacao_situacao is null
   and (u.liberado_exportar_em is null or coalesce(trim(s.linked_rm_number), '') <> '');
