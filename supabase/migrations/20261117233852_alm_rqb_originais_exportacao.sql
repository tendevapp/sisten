-- Arquivo original de cada lote. Reabrir ou editar a requisição não altera o XLSX.
alter table public.alm_req_balcao_exportacoes add column if not exists original_path text;

create unique index if not exists alm_rqb_exportacoes_original_path
  on public.alm_req_balcao_exportacoes(original_path) where original_path is not null;

insert into storage.buckets (id, name, public, allowed_mime_types)
values ('alm-rqb-exportacoes', 'alm-rqb-exportacoes', false,
  array['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do nothing;

-- Espelha o acesso à rota de Requisição no Balcão (incluindo o acesso via Ficha de EPI).
create or replace function public.alm_rqb_pode_acessar_originais()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    left join public.sectors s on s.id = p.sector_id
    where p.id = (select auth.uid())::text and p.status = 'ativo'
      and (
        'admin' = any(p.roles)
        or (
          coalesce((p.page_access ->> 'formularios')::boolean, true)
          and exists (
            select 1
            from (values
              ('form_almoxarifado_requisicao_balcao', 'form_almoxarifado', true),
              ('form_almoxarifado_ficha_epi', 'form_almoxarifado', true),
              ('form_ssma_ficha_epi', 'form_ssma', false)
            ) as f(formulario, grupo, almoxarifado)
            where coalesce(
              (p.page_access ->> f.formulario)::boolean,
              (p.page_access ->> f.grupo)::boolean,
              case when f.almoxarifado then
                p.sector_id = '2' or s.name ilike '%almox%'
                  or not ('visualizador' = any(coalesce(p.roles, '{}')))
              else
                p.sector_id in ('12', '13')
                  or lower(s.name) ~ '(ssma|saúde|saude|segurança|seguranca|meio ambiente)'
              end, false
            )
          )
        )
      )
  );
$$;

revoke all on function public.alm_rqb_pode_acessar_originais() from public, anon;
grant execute on function public.alm_rqb_pode_acessar_originais() to authenticated;

drop policy if exists alm_rqb_original_upload on storage.objects;
create policy alm_rqb_original_upload on storage.objects
  for insert to authenticated with check (
    bucket_id = 'alm-rqb-exportacoes'
    and (select public.alm_rqb_pode_acessar_originais())
    and name ~ ('^' || (select auth.uid())::text || '/[0-9a-f-]{36}\.xlsx$')
  );

drop policy if exists alm_rqb_original_download on storage.objects;
create policy alm_rqb_original_download on storage.objects
  for select to authenticated using (
    bucket_id = 'alm-rqb-exportacoes'
    and (select public.alm_rqb_pode_acessar_originais())
    and exists (
      select 1 from public.alm_req_balcao_exportacoes lote
      where lote.original_path = storage.objects.name
        and lote.created_at > now() - interval '720 hours'
    )
  );

create or replace function public.alm_rqb_registrar_exportacao_original(
  p_ids uuid[], p_arquivo text, p_por text, p_original_path text, p_total_itens int
)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  lote public.alm_req_balcao_exportacoes;
  v_total_ids int;
  v_total_itens int;
begin
  if not public.alm_rqb_pode_acessar_originais() then
    raise exception 'Sem acesso à exportação da Requisição no Balcão.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from storage.objects o
    where o.bucket_id = 'alm-rqb-exportacoes' and o.name = p_original_path
      and o.owner_id = auth.uid()::text and o.created_at > now() - interval '1 day'
  ) then
    raise exception 'Envie o XLSX original antes de registrar o lote.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_original_path, 0));
  select e.id into lote.id from public.alm_req_balcao_exportacoes e
  where e.original_path = p_original_path;
  if found then
    return lote.id;
  end if;

  -- Serializa com reabertura, edição e pedido de exportação concorrentes.
  perform r.id from public.alm_req_balcao r
    where r.id = any(p_ids) and not r.excluido order by r.id for update;
  get diagnostics v_total_ids = row_count;
  select count(*) into v_total_itens from public.alm_req_balcao_itens
    where requisicao_id = any(p_ids);
  if v_total_ids = 0 or v_total_ids <> cardinality(p_ids)
    or v_total_itens = 0 or v_total_itens is distinct from p_total_itens then
    raise exception 'A seleção mudou durante a exportação. Atualize a lista e tente de novo.';
  end if;

  lote := public.alm_req_balcao_registrar_exportacao(p_ids, p_arquivo, p_por);
  update public.alm_req_balcao_exportacoes set original_path = p_original_path where id = lote.id;
  return lote.id;
end;
$$;

revoke all on function public.alm_rqb_registrar_exportacao_original(uuid[], text, text, text, int) from public, anon;
grant execute on function public.alm_rqb_registrar_exportacao_original(uuid[], text, text, text, int) to authenticated;

create extension if not exists pg_net with schema extensions;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'alm_rqb_originais_cron_token') then
    perform vault.create_secret(
      replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
      'alm_rqb_originais_cron_token'
    );
  end if;
end;
$$;

-- A rotina remove pelo Storage API para apagar também os bytes do objeto.
-- Um envio que não chegou a registrar lote pode ser limpo após 24h.
create or replace function public.alm_rqb_originais_expirados(p_token text)
returns text[]
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from vault.decrypted_secrets
    where name = 'alm_rqb_originais_cron_token' and decrypted_secret = p_token
  ) then
    raise exception 'Chave de limpeza inválida.' using errcode = '42501';
  end if;
  return array(
    select o.name from storage.objects o
    left join public.alm_req_balcao_exportacoes lote on lote.original_path = o.name
    where o.bucket_id = 'alm-rqb-exportacoes'
      and coalesce(lote.created_at <= now() - interval '720 hours', o.created_at <= now() - interval '1 day')
    order by o.created_at
    limit 1000
  );
end;
$$;

revoke all on function public.alm_rqb_originais_expirados(text) from public, anon, authenticated;
grant execute on function public.alm_rqb_originais_expirados(text) to service_role;

select cron.schedule('sisten-alm-rqb-expirar-originais', '23 * * * *', $cron$
  select net.http_post(
    url := 'https://fwezzgduywgyhxinjurn.supabase.co/functions/v1/limpar-originais-rqb',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-rqb-cron-token', (select decrypted_secret from vault.decrypted_secrets
                          where name = 'alm_rqb_originais_cron_token')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
$cron$);
