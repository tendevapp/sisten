-- =====================================================================
-- Almoxarifado — Solicitação Extraordinária: tipo "Sem Saldo"
-- =====================================================================
-- A Solicitação Extraordinária ganha dois tipos:
--   * PROJETO   — o formulário de sempre (FRM.ALM-0013: projeto, tramo,
--                 motivo), código SEM-DDMMYY-NN;
--   * SEM_SALDO — retirada de item ainda sem saldo na ZL0024 por um
--                 colaborador de qualquer setor: quem retira (matrícula ou
--                 nome), itens, data/hora e setor solicitante. Código
--                 RSS-DDMMYY-NN, índice reiniciado por MÊS (igual ao SEM).
--
-- Fluxo da SEM_SALDO:
--   1. Registrada no balcão → aprovação PENDENTE, notificação aos aprovadores
--      do setor solicitante (core_perfis.aprovador_setores — a mesma lista que
--      decide quem aprova as compras do setor); sem aprovador, vai aos admins.
--   2. Gestor aprova/reprova em Solicitações › Aprovações
--      (RPC alm_sol_extra_aprovar), com nome e hora gravados para o PDF.
--   3. Quando a NF é lançada e o item ganha saldo na ZL0024, o almoxarifado
--      dá baixa em Geral › Pendências: gera a Requisição no Balcão e grava o
--      código RQB aqui (RPC alm_sol_extra_baixar) → status REGULARIZADA.
--
-- Aprovação, baixa e status só mudam pelas RPCs (o trigger recusa update
-- direto nessas colunas), senão o próprio autor se aprovaria pela RLS.

alter table public.alm_solicitacao_extra
  add column if not exists tipo text not null default 'PROJETO',
  add column if not exists retirante_id uuid,
  add column if not exists retirante_nome text,
  add column if not exists retirante_matricula text,
  add column if not exists setor_solicitante_id text,
  add column if not exists setor_solicitante_nome text,
  add column if not exists aprovacao_status text,
  add column if not exists aprovado_por text references public.core_perfis(id),
  add column if not exists aprovado_por_nome text,
  add column if not exists aprovado_em timestamptz,
  add column if not exists aprovacao_obs text,
  add column if not exists requisicao_balcao_codigo text;

alter table public.alm_solicitacao_extra drop constraint if exists alm_sol_extra_tipo_chk;
alter table public.alm_solicitacao_extra
  add constraint alm_sol_extra_tipo_chk check (tipo in ('PROJETO', 'SEM_SALDO'));

alter table public.alm_solicitacao_extra drop constraint if exists alm_sol_extra_aprovacao_chk;
alter table public.alm_solicitacao_extra
  add constraint alm_sol_extra_aprovacao_chk check (aprovacao_status in ('PENDENTE', 'APROVADA', 'REPROVADA'));

-- Motivo é da folha de Projeto; a retirada sem saldo pede quem retira e o setor.
alter table public.alm_solicitacao_extra alter column motivo drop not null;
alter table public.alm_solicitacao_extra drop constraint if exists alm_sol_extra_campos_tipo_chk;
alter table public.alm_solicitacao_extra
  add constraint alm_sol_extra_campos_tipo_chk check (
    case tipo
      when 'PROJETO' then motivo is not null
      else coalesce(trim(retirante_nome), '') <> '' and setor_solicitante_id is not null
    end
  ) not valid;
alter table public.alm_solicitacao_extra validate constraint alm_sol_extra_campos_tipo_chk;

create index if not exists idx_alm_sol_extra_aprovacao
  on public.alm_solicitacao_extra (setor_solicitante_id, aprovacao_status)
  where excluido_em is null and tipo = 'SEM_SALDO';

-- Código + updated_at + travas.
create or replace function public.alm_sol_extra_antes_gravar()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_inicio date;
  v_max int;
  v_indice text;
  v_prefixo text;
  v_pela_rpc boolean := coalesce(current_setting('sisten.alm_sol_extra_rpc', true), '') = '1';
begin
  if tg_op = 'INSERT' then
    -- Aprovação e baixa nascem limpas, venha o que vier no payload.
    new.status := 'PENDENTE';
    new.doc_sap := null;
    new.regularizacao_obs := null;
    new.regularizado_por := null;
    new.regularizado_por_nome := null;
    new.regularizado_em := null;
    new.requisicao_balcao_codigo := null;
    new.aprovacao_status := case when new.tipo = 'SEM_SALDO' then 'PENDENTE' end;
    new.aprovado_por := null;
    new.aprovado_por_nome := null;
    new.aprovado_em := null;
    new.aprovacao_obs := null;

    if coalesce(trim(new.codigo), '') = '' then
      v_prefixo := case when new.tipo = 'SEM_SALDO' then 'RSS' else 'SEM' end;
      perform pg_advisory_xact_lock(hashtext('alm_solicitacao_extra_codigo_' || v_prefixo));
      v_inicio := date_trunc('month', new.data)::date;
      select coalesce(max((regexp_match(codigo, '^' || v_prefixo || '-\d{6}-(\d+)$'))[1]::int), 0)
        into v_max
        from public.alm_solicitacao_extra
       where data >= v_inicio
         and data < (v_inicio + interval '1 month')::date;

      v_indice := (v_max + 1)::text;
      new.codigo := v_prefixo || '-' || to_char(new.data, 'DDMMYY') || '-' || lpad(v_indice, greatest(2, length(v_indice)), '0');
    end if;
  end if;

  if tg_op = 'UPDATE' then
    if new.tipo is distinct from old.tipo then
      raise exception 'O tipo da solicitação não muda depois de registrada.' using errcode = '42501';
    end if;

    -- Status, aprovação e baixa: só pelas RPCs.
    if not v_pela_rpc and (
         new.status is distinct from old.status
      or new.doc_sap is distinct from old.doc_sap
      or new.regularizado_por is distinct from old.regularizado_por
      or new.regularizado_em is distinct from old.regularizado_em
      or new.requisicao_balcao_codigo is distinct from old.requisicao_balcao_codigo
      or new.aprovacao_status is distinct from old.aprovacao_status
      or new.aprovado_por is distinct from old.aprovado_por
      or new.aprovado_em is distinct from old.aprovado_em) then
      raise exception 'Aprovação e baixa da solicitação % só mudam pelos botões da tela.', old.codigo
        using errcode = '42501';
    end if;

    -- Baixa já regularizada: o conteúdo fica como foi baixado.
    -- Só o admin mexe (ex.: corrigir o doc SAP digitado errado).
    if old.status = 'REGULARIZADA' and not public.has_role('admin')
       and (new.itens is distinct from old.itens
         or new.motivo is distinct from old.motivo
         or new.data is distinct from old.data
         or new.excluido_em is distinct from old.excluido_em) then
      raise exception 'Solicitação % já regularizada — não pode ser alterada.', old.codigo
        using errcode = '42501';
    end if;

    -- Retirada já decidida pelo gestor: o que ele aprovou não muda.
    if old.tipo = 'SEM_SALDO' and old.aprovacao_status <> 'PENDENTE' and not v_pela_rpc
       and not public.has_role('admin')
       and (new.itens is distinct from old.itens
         or new.data is distinct from old.data
         or new.hora is distinct from old.hora
         or new.retirante_nome is distinct from old.retirante_nome
         or new.retirante_matricula is distinct from old.retirante_matricula
         or new.setor_solicitante_id is distinct from old.setor_solicitante_id
         or new.excluido_em is distinct from old.excluido_em) then
      raise exception 'Retirada % já % pelo gestor — não pode ser alterada.', old.codigo, lower(old.aprovacao_status)
        using errcode = '42501';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Notificação aos aprovadores do setor solicitante
-- ---------------------------------------------------------------------------

create or replace function public.alm_sol_extra_aprovadores(p_setor text)
returns text[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    nullif(
      (select array_agg(id) from public.core_perfis
        where coalesce(status, 'ativo') not in ('inativo', 'pendente')
          and aprovador_setores ? p_setor),
      '{}'),
    (select coalesce(array_agg(id), '{}') from public.core_perfis
      where coalesce(status, 'ativo') <> 'inativo' and 'admin' = any(roles)))
$$;

revoke all on function public.alm_sol_extra_aprovadores(text) from public, anon;

create or replace function public.alm_sol_extra_notificar_aprovadores()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.tipo <> 'SEM_SALDO' then
    return new;
  end if;
  begin
    insert into public.core_notificacoes (id, user_id, title, description, type, is_read, created_at, context_key)
    select 'n_' || replace(gen_random_uuid()::text, '-', ''), u,
           'Retirada sem saldo aguardando aprovação',
           format('%s — %s retirou material para %s. Aprove ou reprove a retirada.',
                  new.codigo, new.retirante_nome, coalesce(new.setor_solicitante_nome, 'o seu setor')),
           'info', false, now(),
           '/solicitacoes/aprovacoes?tipo=sem-saldo&id=' || new.id
      from unnest(public.alm_sol_extra_aprovadores(new.setor_solicitante_id)) as u
     where u is distinct from new.criado_por;
  exception when others then
    -- Notificação não pode travar o registro que chegou do balcão (ou da fila offline).
    raise warning 'alm_sol_extra: falha ao notificar aprovadores de %: %', new.codigo, sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists trg_alm_sol_extra_notificar on public.alm_solicitacao_extra;
create trigger trg_alm_sol_extra_notificar
  after insert on public.alm_solicitacao_extra
  for each row execute function public.alm_sol_extra_notificar_aprovadores();

-- ---------------------------------------------------------------------------
-- Aprovação do gestor (uma ou várias)
-- ---------------------------------------------------------------------------

create or replace function public.alm_sol_extra_aprovar(
  p_ids uuid[],
  p_aprovar boolean,
  p_obs text default null
)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid text := (auth.uid())::text;
  v_nome text;
  v_setores jsonb;
  v_admin boolean := public.has_role('admin');
  v_negadas text;
  v_qtd int;
  v_obs text := nullif(trim(coalesce(p_obs, '')), '');
begin
  if auth.uid() is null then
    raise exception 'Sem sessão' using errcode = '42501';
  end if;
  if not p_aprovar and v_obs is null then
    raise exception 'Informe o motivo da reprovação.' using errcode = '22023';
  end if;

  select name, aprovador_setores into v_nome, v_setores from public.core_perfis where id = v_uid;

  select string_agg(codigo, ', ') into v_negadas
    from public.alm_solicitacao_extra
   where id = any(p_ids)
     and not v_admin
     and not coalesce(v_setores ? setor_solicitante_id, false);
  if v_negadas is not null then
    raise exception 'Você não é aprovador do setor solicitante de: %.', v_negadas using errcode = '42501';
  end if;

  perform set_config('sisten.alm_sol_extra_rpc', '1', true);
  update public.alm_solicitacao_extra
     set aprovacao_status = case when p_aprovar then 'APROVADA' else 'REPROVADA' end,
         aprovado_por = v_uid,
         aprovado_por_nome = v_nome,
         aprovado_em = now(),
         aprovacao_obs = v_obs
   where id = any(p_ids)
     and tipo = 'SEM_SALDO'
     and excluido_em is null
     and aprovacao_status = 'PENDENTE';
  get diagnostics v_qtd = row_count;
  perform set_config('sisten.alm_sol_extra_rpc', '', true);

  -- Avisa quem registrou.
  insert into public.core_notificacoes (id, user_id, title, description, type, is_read, created_at, context_key)
  select 'n_' || replace(gen_random_uuid()::text, '-', ''), s.criado_por,
         case when p_aprovar then 'Retirada sem saldo aprovada' else 'Retirada sem saldo reprovada' end,
         format('%s — %s por %s%s', s.codigo, case when p_aprovar then 'aprovada' else 'reprovada' end, v_nome,
                case when v_obs is not null then ': ' || v_obs else '' end),
         case when p_aprovar then 'success' else 'warning' end, false, now(),
         '/formularios/almoxarifado-solicitacao-extra'
    from public.alm_solicitacao_extra s
   where s.id = any(p_ids)
     and s.aprovado_por = v_uid
     and s.aprovado_em = now()
     and s.criado_por is not null
     and s.criado_por <> v_uid;

  return v_qtd;
end;
$$;

revoke all on function public.alm_sol_extra_aprovar(uuid[], boolean, text) from public, anon;
grant execute on function public.alm_sol_extra_aprovar(uuid[], boolean, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Baixa pelo almoxarifado: NF lançada, item com saldo, requisição no balcão feita
-- ---------------------------------------------------------------------------

create or replace function public.alm_sol_extra_baixar(
  p_id uuid,
  p_requisicao_codigo text,
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
  if coalesce(trim(p_requisicao_codigo), '') = '' then
    raise exception 'Informe a requisição no balcão da baixa.' using errcode = '22023';
  end if;

  select name into v_nome from public.core_perfis where id = (auth.uid())::text;

  perform set_config('sisten.alm_sol_extra_rpc', '1', true);
  update public.alm_solicitacao_extra
     set status = 'REGULARIZADA',
         requisicao_balcao_codigo = trim(p_requisicao_codigo),
         regularizacao_obs = nullif(trim(coalesce(p_obs, '')), ''),
         regularizado_por = (auth.uid())::text,
         regularizado_por_nome = v_nome,
         regularizado_em = now()
   where id = p_id
     and tipo = 'SEM_SALDO'
     and excluido_em is null
     and status = 'PENDENTE';
  get diagnostics v_qtd = row_count;
  perform set_config('sisten.alm_sol_extra_rpc', '', true);
  return v_qtd;
end;
$$;

revoke all on function public.alm_sol_extra_baixar(uuid, text, text) from public, anon;
grant execute on function public.alm_sol_extra_baixar(uuid, text, text) to authenticated;

-- Regularização por doc SAP: continua só para a de Projeto (a Sem Saldo baixa
-- pela requisição no balcão). Agora passa pela flag, porque o trigger recusa
-- mudança de status fora das RPCs.
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

  perform set_config('sisten.alm_sol_extra_rpc', '1', true);
  update public.alm_solicitacao_extra
     set status = 'REGULARIZADA',
         doc_sap = trim(p_doc_sap),
         regularizacao_obs = nullif(trim(coalesce(p_obs, '')), ''),
         regularizado_por = (auth.uid())::text,
         regularizado_por_nome = v_nome,
         regularizado_em = now()
   where id = any(p_ids)
     and tipo = 'PROJETO'
     and excluido_em is null
     and status = 'PENDENTE';
  get diagnostics v_qtd = row_count;
  perform set_config('sisten.alm_sol_extra_rpc', '', true);
  return v_qtd;
end;
$$;

revoke all on function public.alm_sol_extra_regularizar(uuid[], text, text) from public, anon;
grant execute on function public.alm_sol_extra_regularizar(uuid[], text, text) to authenticated;
