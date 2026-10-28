-- =====================================================================
-- Central de Compras — chamado de Validação Técnica de item
-- =====================================================================
-- O comprador tem dúvida técnica sobre um item (é este modelo? serve este
-- similar?) e abre um chamado para o gestor da área validar, com descrição,
-- links, fotos e ficha técnica (PDF). Ao abrir, a tela põe o status do item
-- em "Validação Técnica". O chamado aparece em Solicitações › Aprovações ›
-- Validação técnica para os aprovadores do setor escolhido
-- (core_perfis.aprovador_setores — a mesma lista das compras e retiradas),
-- para o admin e para os usuários marcados no chamado. Ao decidir, o item
-- volta ao comprador ("Aguardando Cotação") com a tag Aprovado/Reprovado.
--
-- Código VTC-DDMMYY-NN (regra 2 do app), índice reinicia por mês.
-- Anexos em request-attachments/validacao-tecnica/<id>/ (sobem comprimidos
-- antes do insert, por isso o id vem do cliente).

create table if not exists public.sup_validacao_tecnica (
  id uuid primary key default gen_random_uuid(),
  codigo text unique,
  data_registro date not null default (now() at time zone 'America/Bahia')::date,
  ri text not null,
  rm text,
  item_reqc text,
  material_code text,
  texto_breve text,
  qtd numeric,
  unidade text,
  setor_id text not null,
  setor_nome text,
  descricao text not null,
  links text[] not null default '{}',
  anexos jsonb not null default '[]'::jsonb,
  marcados jsonb not null default '[]'::jsonb,
  marcados_ids text[] not null default '{}',
  status text not null default 'PENDENTE' check (status in ('PENDENTE', 'APROVADA', 'REPROVADA')),
  parecer text,
  decidido_por text,
  decidido_por_nome text,
  decidido_em timestamptz,
  criado_por text not null default (auth.uid())::text,
  criado_por_nome text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_sup_validacao_tecnica_ri on public.sup_validacao_tecnica (ri);
create index if not exists idx_sup_validacao_tecnica_status on public.sup_validacao_tecnica (status);

create or replace function public.sup_validacao_tecnica_antes_gravar()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_inicio date;
  v_max int;
  v_indice text;
begin
  if tg_op = 'INSERT' then
    -- Quem abre sempre nasce pendente, com a própria autoria.
    new.status := 'PENDENTE';
    new.parecer := null;
    new.decidido_por := null;
    new.decidido_por_nome := null;
    new.decidido_em := null;
    if coalesce(trim(new.codigo), '') = '' then
      perform pg_advisory_xact_lock(hashtext('sup_validacao_tecnica_codigo'));
      v_inicio := date_trunc('month', new.data_registro)::date;
      select coalesce(max((regexp_match(codigo, '^VTC-\d{6}-(\d+)$'))[1]::int), 0)
        into v_max
        from public.sup_validacao_tecnica
       where data_registro >= v_inicio
         and data_registro < (v_inicio + interval '1 month')::date;
      v_indice := (v_max + 1)::text;
      new.codigo := 'VTC-' || to_char(new.data_registro, 'DDMMYY') || '-' || lpad(v_indice, greatest(2, length(v_indice)), '0');
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_sup_validacao_tecnica_antes_gravar on public.sup_validacao_tecnica;
create trigger trg_sup_validacao_tecnica_antes_gravar
  before insert or update on public.sup_validacao_tecnica
  for each row execute function public.sup_validacao_tecnica_antes_gravar();

-- Leitura para todo autenticado (comprador acompanha, aprovador decide);
-- inserção só com a própria autoria; decisão só pela RPC abaixo.
alter table public.sup_validacao_tecnica enable row level security;
drop policy if exists sup_validacao_tecnica_select on public.sup_validacao_tecnica;
create policy sup_validacao_tecnica_select on public.sup_validacao_tecnica
  for select to authenticated using (true);
drop policy if exists sup_validacao_tecnica_insert on public.sup_validacao_tecnica;
create policy sup_validacao_tecnica_insert on public.sup_validacao_tecnica
  for insert to authenticated with check (criado_por = (auth.uid())::text);

revoke all on public.sup_validacao_tecnica from anon;
grant select, insert on public.sup_validacao_tecnica to authenticated;

-- ---------------------------------------------------------------------------
-- Aviso aos aprovadores da área e aos marcados
-- ---------------------------------------------------------------------------

create or replace function public.sup_validacao_tecnica_notificar()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  begin
    insert into public.core_notificacoes (id, user_id, title, description, type, is_read, created_at, context_key)
    select 'n_' || replace(gen_random_uuid()::text, '-', ''), u,
           'Validação técnica aguardando você',
           format('%s — %s pede validação técnica de RM %s / item %s: %s',
                  new.codigo, coalesce(new.criado_por_nome, 'O comprador'), coalesce(new.rm, '—'),
                  coalesce(new.item_reqc, '—'), coalesce(new.texto_breve, new.material_code, '')),
           'info', false, now(),
           '/solicitacoes/aprovacoes?tipo=validacao&id=' || new.id
      from (
        select unnest(public.alm_sol_extra_aprovadores(new.setor_id)) as u
        union
        select unnest(new.marcados_ids)
      ) d
     where u is distinct from new.criado_por;
  exception when others then
    raise warning 'sup_validacao_tecnica: falha ao notificar %: %', new.codigo, sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists trg_sup_validacao_tecnica_notificar on public.sup_validacao_tecnica;
create trigger trg_sup_validacao_tecnica_notificar
  after insert on public.sup_validacao_tecnica
  for each row execute function public.sup_validacao_tecnica_notificar();

-- ---------------------------------------------------------------------------
-- Decisão: aprovador do setor, admin ou usuário marcado
-- ---------------------------------------------------------------------------

create or replace function public.sup_validacao_tecnica_decidir(
  p_id uuid,
  p_aprovar boolean,
  p_parecer text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid text := (auth.uid())::text;
  v_nome text;
  v_setores jsonb;
  v_reg public.sup_validacao_tecnica%rowtype;
  v_parecer text := nullif(trim(coalesce(p_parecer, '')), '');
  v_status text := case when p_aprovar then 'APROVADA' else 'REPROVADA' end;
begin
  if auth.uid() is null then
    raise exception 'Sem sessão' using errcode = '42501';
  end if;
  if not p_aprovar and v_parecer is null then
    raise exception 'Informe o motivo da reprovação.' using errcode = '22023';
  end if;

  select * into v_reg from public.sup_validacao_tecnica where id = p_id for update;
  if not found then
    raise exception 'Chamado não encontrado.' using errcode = 'P0002';
  end if;
  if v_reg.status <> 'PENDENTE' then
    raise exception 'O chamado % já foi decidido.', v_reg.codigo using errcode = '22023';
  end if;

  select name, aprovador_setores into v_nome, v_setores from public.core_perfis where id = v_uid;
  if not (public.has_role('admin')
          or coalesce(v_setores ? v_reg.setor_id, false)
          or v_uid = any(v_reg.marcados_ids)) then
    raise exception 'Você não é aprovador da área nem foi marcado no chamado %.', v_reg.codigo using errcode = '42501';
  end if;

  update public.sup_validacao_tecnica
     set status = v_status,
         parecer = v_parecer,
         decidido_por = v_uid,
         decidido_por_nome = v_nome,
         decidido_em = now()
   where id = p_id;

  -- O item volta para o comprador (só se ainda estiver parado na validação).
  update public.sap_me5a_rc
     set item_status = 'Aguardando Cotação',
         item_status_updated_at = now(),
         item_status_updated_by = v_nome
   where ri = v_reg.ri
     and item_status = 'Validação Técnica';
  if found then
    insert into public.sap_requisicoes_observacoes (id, ri, campo_alterado, valor_anterior, valor_novo, user_name, created_at)
    values ('oh_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 9), v_reg.ri, 'item_status',
            json_build_object('status', 'Validação Técnica')::text,
            json_build_object('status', 'Aguardando Cotação', 'validacao', v_reg.codigo, 'resultado', v_status)::text,
            v_nome, now());
  end if;

  if v_reg.criado_por <> v_uid then
    insert into public.core_notificacoes (id, user_id, title, description, type, is_read, created_at, context_key)
    values ('n_' || replace(gen_random_uuid()::text, '-', ''), v_reg.criado_por,
            case when p_aprovar then 'Validação técnica aprovada' else 'Validação técnica reprovada' end,
            format('%s — RM %s / item %s %s por %s%s', v_reg.codigo, coalesce(v_reg.rm, '—'), coalesce(v_reg.item_reqc, '—'),
                   case when p_aprovar then 'aprovado' else 'reprovado' end, v_nome,
                   case when v_parecer is not null then ': ' || v_parecer else '' end),
            case when p_aprovar then 'success' else 'alert' end, false, now(),
            '/suprimentos/compras');
  end if;
end;
$$;

revoke all on function public.sup_validacao_tecnica_decidir(uuid, boolean, text) from public, anon;
grant execute on function public.sup_validacao_tecnica_decidir(uuid, boolean, text) to authenticated;
