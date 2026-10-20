-- =====================================================================
-- Almoxarifado — Solicitação Extraordinária de Materiais Estruturais
-- (FRM.ALM-0013)
-- =====================================================================
-- Saída de material que está sem saldo na ZL0024 porque a NF ainda não foi
-- lançada. O material sai agora e a baixa é regularizada no SAP depois:
-- o registro nasce PENDENTE e vira REGULARIZADA quando alguém do
-- almoxarifado informa o documento SAP da baixa.
--
-- Itens em jsonb (código SAP, descrição, unidade, quantidade): um insert só,
-- o que deixa o formulário inteiro passar pela fila offline.
--
-- Código SEM-DDMMYY-NN, índice reiniciado por MÊS (mesmo recorte do RID e do
-- Kaizen), gerado no banco: a gravação pode chegar pela fila offline sem código.

create table if not exists public.alm_solicitacao_extra (
  id uuid primary key default gen_random_uuid(),
  codigo text unique,
  data date not null default ((now() at time zone 'America/Bahia')::date),
  hora time,
  turno text check (turno in ('1', '2', '3')),
  projeto text,
  tramo text,
  -- [{ material, descricao, unidade, quantidade }]
  itens jsonb not null default '[]'::jsonb
    check (jsonb_typeof(itens) = 'array' and jsonb_array_length(itens) between 1 and 50),
  motivo text not null check (motivo in (
    'REPARO_PINTURA', 'PERDA_PREPARACAO', 'PERDA_ACIDENTAL', 'PERDA_QUEBRA_EQUIPAMENTO',
    'PERDA_RUGOSIDADE', 'MIST_COAT', 'QUANTIDADE_INSUFICIENTE', 'REPINTURA_RETRABALHO',
    'LIMPEZA', 'OUTROS'
  )),
  -- Reparo de pintura: "motivo:" da folha; Outros motivos: o "especificar".
  motivo_detalhe text,
  area_reparada_m2 numeric(12, 2),
  rugosidade_um numeric(10, 1),
  observacao text,
  status text not null default 'PENDENTE' check (status in ('PENDENTE', 'REGULARIZADA')),
  doc_sap text,
  regularizacao_obs text,
  regularizado_por text references public.core_perfis(id),
  regularizado_por_nome text,
  regularizado_em timestamptz,
  criado_por text default (auth.uid())::text references public.core_perfis(id),
  criado_por_nome text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  excluido_em timestamptz,
  excluido_por text references public.core_perfis(id)
);

create index if not exists idx_alm_sol_extra_data on public.alm_solicitacao_extra (data desc);
create index if not exists idx_alm_sol_extra_status on public.alm_solicitacao_extra (status) where excluido_em is null;
create index if not exists idx_alm_sol_extra_criado_por on public.alm_solicitacao_extra (criado_por);

-- Código + updated_at + trava do que já foi regularizado.
create or replace function public.alm_sol_extra_antes_gravar()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_inicio date;
  v_max int;
  v_indice text;
begin
  if tg_op = 'INSERT' and coalesce(trim(new.codigo), '') = '' then
    perform pg_advisory_xact_lock(hashtext('alm_solicitacao_extra_codigo'));
    v_inicio := date_trunc('month', new.data)::date;
    select coalesce(max((regexp_match(codigo, '^SEM-\d{6}-(\d+)$'))[1]::int), 0)
      into v_max
      from public.alm_solicitacao_extra
     where data >= v_inicio
       and data < (v_inicio + interval '1 month')::date;

    v_indice := (v_max + 1)::text;
    new.codigo := 'SEM-' || to_char(new.data, 'DDMMYY') || '-' || lpad(v_indice, greatest(2, length(v_indice)), '0');
  end if;

  -- Baixa já regularizada no SAP: o conteúdo fica como foi baixado.
  -- Só o admin mexe (ex.: corrigir o doc SAP digitado errado).
  if tg_op = 'UPDATE' and old.status = 'REGULARIZADA' and not public.has_role('admin')
     and (new.itens is distinct from old.itens
       or new.motivo is distinct from old.motivo
       or new.data is distinct from old.data
       or new.excluido_em is distinct from old.excluido_em) then
    raise exception 'Solicitação % já regularizada no SAP — não pode ser alterada.', old.codigo
      using errcode = '42501';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_alm_sol_extra_antes_gravar on public.alm_solicitacao_extra;
create trigger trg_alm_sol_extra_antes_gravar
  before insert or update on public.alm_solicitacao_extra
  for each row execute function public.alm_sol_extra_antes_gravar();

-- RLS: todos com login veem; só o autor ou admin altera/exclui
-- (regra dos formulários, ver public.form_pode_editar).
alter table public.alm_solicitacao_extra enable row level security;

drop policy if exists alm_sol_extra_sel on public.alm_solicitacao_extra;
create policy alm_sol_extra_sel on public.alm_solicitacao_extra
  for select to authenticated using (true);

drop policy if exists alm_sol_extra_ins on public.alm_solicitacao_extra;
create policy alm_sol_extra_ins on public.alm_solicitacao_extra
  for insert to authenticated
  with check (criado_por is null or criado_por = (select auth.uid())::text or public.has_role('admin'));

drop policy if exists alm_sol_extra_upd on public.alm_solicitacao_extra;
create policy alm_sol_extra_upd on public.alm_solicitacao_extra
  for update to authenticated
  using (public.form_pode_editar(criado_por))
  with check (public.form_pode_editar(criado_por));

drop policy if exists alm_sol_extra_del on public.alm_solicitacao_extra;
create policy alm_sol_extra_del on public.alm_solicitacao_extra
  for delete to authenticated
  using (public.form_pode_editar(criado_por));

grant select, insert, update, delete on public.alm_solicitacao_extra to authenticated;

-- Regularização: quem lança a baixa no SAP normalmente não é quem registrou a
-- saída, então passa por RPC (sem trava de autor, como o doc SAP da
-- Requisição no Balcão). Vale para várias de uma vez — a baixa no SAP
-- costuma juntar as saídas do mesmo material.
create or replace function public.alm_sol_extra_regularizar(
  p_ids uuid[],
  p_doc_sap text,
  p_obs text default null
)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_nome text;
  v_qtd int;
begin
  if auth.uid() is null then
    raise exception 'Sem sessão' using errcode = '42501';
  end if;
  if coalesce(trim(p_doc_sap), '') = '' then
    raise exception 'Informe o documento SAP da baixa.' using errcode = '22023';
  end if;

  select name into v_nome from public.core_perfis where id = (auth.uid())::text;

  update public.alm_solicitacao_extra
     set status = 'REGULARIZADA',
         doc_sap = trim(p_doc_sap),
         regularizacao_obs = nullif(trim(coalesce(p_obs, '')), ''),
         regularizado_por = (auth.uid())::text,
         regularizado_por_nome = v_nome,
         regularizado_em = now()
   where id = any(p_ids)
     and excluido_em is null
     and status = 'PENDENTE';

  get diagnostics v_qtd = row_count;
  return v_qtd;
end;
$$;

revoke all on function public.alm_sol_extra_regularizar(uuid[], text, text) from public, anon;
grant execute on function public.alm_sol_extra_regularizar(uuid[], text, text) to authenticated;
