-- =====================================================================
-- Formulários › Planejamento — Aqui TEN Melhoria! (Kaizen, FRM.ENG-0017)
-- =====================================================================
-- O colaborador descreve o desperdício/problema, a causa, a melhoria e o
-- resultado, com fotos. O Responsável pelo Setor valida depois, quando o
-- Kaizen estiver implantado (assinatura do rodapé do formulário em papel).
--
-- Código KZN-DDMMYY-NN, índice reiniciado por MÊS (mesmo recorte do RID),
-- gerado no banco: a gravação pode chegar pela fila offline sem código.

create table if not exists public.plan_kaizen (
  id uuid primary key default gen_random_uuid(),
  codigo text unique,
  data_registro date not null default ((now() at time zone 'America/Bahia')::date),
  pessoa_id uuid references public.rh_pessoas(id) on delete set null,
  nome_profissional text not null,
  matricula text,
  setor text not null,
  responsavel_setor text,
  impactos text[] not null default '{}'::text[]
    check (impactos <@ array['SEGURANCA', 'MEIO_AMBIENTE', 'QUALIDADE', 'PRODUTIVIDADE', 'CUSTO']::text[]),
  problema text not null,
  causa text not null,
  solucao text not null,
  resultado text,
  ganho_estimado numeric(14, 2),
  -- [{ id, path, name, size, mime_type, tipo: 'problema' | 'solucao' | 'resultado', created_at }]
  fotos jsonb not null default '[]'::jsonb,
  status text not null default 'REGISTRADO' check (status in ('REGISTRADO', 'IMPLANTADO', 'CANCELADO')),
  aplicavel_outros_setores boolean,
  validacao_obs text,
  validado_por text references public.core_perfis(id),
  validado_por_nome text,
  validado_em timestamptz,
  criado_por text default (auth.uid())::text references public.core_perfis(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  excluido_em timestamptz,
  excluido_por text references public.core_perfis(id)
);

create index if not exists idx_plan_kaizen_data_registro on public.plan_kaizen (data_registro desc);
create index if not exists idx_plan_kaizen_setor on public.plan_kaizen (setor);
create index if not exists idx_plan_kaizen_status on public.plan_kaizen (status);
create index if not exists idx_plan_kaizen_criado_por on public.plan_kaizen (criado_por);

-- Código + updated_at. O índice olha o mês de data_registro: KZN-171026-05
-- é o 5º Kaizen de outubro/26, qualquer que seja o dia.
create or replace function public.plan_kaizen_antes_gravar()
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
    perform pg_advisory_xact_lock(hashtext('plan_kaizen_codigo'));
    v_inicio := date_trunc('month', new.data_registro)::date;
    select coalesce(max((regexp_match(codigo, '^KZN-\d{6}-(\d+)$'))[1]::int), 0)
      into v_max
      from public.plan_kaizen
     where data_registro >= v_inicio
       and data_registro < (v_inicio + interval '1 month')::date;

    v_indice := (v_max + 1)::text;
    new.codigo := 'KZN-' || to_char(new.data_registro, 'DDMMYY') || '-' || lpad(v_indice, greatest(2, length(v_indice)), '0');
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_plan_kaizen_antes_gravar on public.plan_kaizen;
create trigger trg_plan_kaizen_antes_gravar
  before insert or update on public.plan_kaizen
  for each row execute function public.plan_kaizen_antes_gravar();

-- RLS: todos com login veem; só o autor ou admin altera/exclui
-- (regra dos formulários, ver public.form_pode_editar).
alter table public.plan_kaizen enable row level security;

drop policy if exists plan_kaizen_sel on public.plan_kaizen;
create policy plan_kaizen_sel on public.plan_kaizen
  for select to authenticated using (true);

drop policy if exists plan_kaizen_ins on public.plan_kaizen;
create policy plan_kaizen_ins on public.plan_kaizen
  for insert to authenticated
  with check (criado_por is null or criado_por = (select auth.uid())::text or public.has_role('admin'));

drop policy if exists plan_kaizen_upd on public.plan_kaizen;
create policy plan_kaizen_upd on public.plan_kaizen
  for update to authenticated
  using (public.form_pode_editar(criado_por))
  with check (public.form_pode_editar(criado_por));

drop policy if exists plan_kaizen_del on public.plan_kaizen;
create policy plan_kaizen_del on public.plan_kaizen
  for delete to authenticated
  using (public.form_pode_editar(criado_por));

grant select, insert, update, delete on public.plan_kaizen to authenticated;

-- Validação do Responsável pelo Setor. Quem valida normalmente não é o
-- autor, então passa por RPC: admin ou quem tem a flag plan_kaizen_validar
-- (liberada pelo admin na Gestão de Acessos).
create or replace function public.plan_kaizen_validar(
  p_id uuid,
  p_aplicavel_outros_setores boolean,
  p_obs text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_nome text;
begin
  if not (public.has_role('admin') or public.has_page_access('plan_kaizen_validar')) then
    raise exception 'Sem permissão para validar Kaizen' using errcode = '42501';
  end if;

  select name into v_nome from public.core_perfis where id = (auth.uid())::text;

  update public.plan_kaizen
     set status = 'IMPLANTADO',
         aplicavel_outros_setores = p_aplicavel_outros_setores,
         validacao_obs = nullif(trim(coalesce(p_obs, '')), ''),
         validado_por = (auth.uid())::text,
         validado_por_nome = v_nome,
         validado_em = now()
   where id = p_id
     and excluido_em is null;

  if not found then
    raise exception 'Kaizen não encontrado' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.plan_kaizen_validar(uuid, boolean, text) from public, anon;
grant execute on function public.plan_kaizen_validar(uuid, boolean, text) to authenticated;

-- Fotos (comprimidas no cliente antes de subir)
insert into storage.buckets (id, name, public)
values ('plan-kaizen', 'plan-kaizen', false)
on conflict (id) do nothing;

drop policy if exists "plan_kaizen_objects_insert" on storage.objects;
create policy "plan_kaizen_objects_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'plan-kaizen');

drop policy if exists "plan_kaizen_objects_read" on storage.objects;
create policy "plan_kaizen_objects_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'plan-kaizen');

drop policy if exists "plan_kaizen_objects_delete" on storage.objects;
create policy "plan_kaizen_objects_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'plan-kaizen' and owner_id = (auth.uid())::text);

-- Liberado para todos, como o RID: o padrão no código é só admin (regra 4
-- do app) e o acesso vem de page_access, que o admin pode tirar por usuário.
update public.core_perfis
   set page_access = coalesce(page_access, '{}'::jsonb) || '{"form_planejamento_kaizen": true}'::jsonb
 where coalesce(page_access ->> 'form_planejamento_kaizen', '') = '';
