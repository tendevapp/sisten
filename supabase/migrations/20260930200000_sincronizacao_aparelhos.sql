-- Central de Sincronizacao (admin): o que cada aparelho tem na fila offline.
--
-- As filas offline (formularios, checklists da Qualidade, outbox da Producao)
-- vivem so no IndexedDB do aparelho; o servidor nao sabe de uma fila parada ate
-- alguem reclamar. Cada aparelho passa a reportar um resumo (contagens, o mais
-- antigo, o ultimo erro) e o admin enxerga tudo numa tela.
--
-- O que trafega: so contagens, o rotulo do formulario e a mensagem do ultimo
-- erro. NUNCA o payload das gravacoes.
--
-- Escrita: apenas pela RPC registrar_sincronizacao_aparelho, que grava sempre
-- com user_id = auth.uid() (ninguem reporta em nome de outro). Leitura: admin.

create table if not exists public.ops_sincronizacao_aparelhos (
  device_id text not null,
  user_id uuid not null,
  user_name text,
  plataforma text,
  online boolean not null default true,
  pendentes integer not null default 0 check (pendentes >= 0),
  com_erro integer not null default 0 check (com_erro >= 0),
  mais_antigo_em timestamptz,
  ultimo_erro text,
  ultimo_erro_rotulo text,
  detalhes jsonb not null default '{}'::jsonb,
  reportado_em timestamptz not null default now(),
  primary key (device_id, user_id)
);

comment on table public.ops_sincronizacao_aparelhos is
  'Resumo da fila offline de cada aparelho/usuario, reportado pelo proprio cliente (Central de Sincronizacao, so admin).';

create index if not exists ops_sincronizacao_aparelhos_reportado_idx
  on public.ops_sincronizacao_aparelhos (reportado_em desc);

alter table public.ops_sincronizacao_aparelhos enable row level security;

drop policy if exists ops_sincronizacao_aparelhos_select on public.ops_sincronizacao_aparelhos;
create policy ops_sincronizacao_aparelhos_select
  on public.ops_sincronizacao_aparelhos
  for select to authenticated
  using (public.has_role('admin'));

-- Sem insert/update/delete direto: so a RPC (security definer) escreve.
revoke all on table public.ops_sincronizacao_aparelhos from anon;
revoke all on table public.ops_sincronizacao_aparelhos from authenticated;
grant select on table public.ops_sincronizacao_aparelhos to authenticated;

create or replace function public.registrar_sincronizacao_aparelho(
  p_device_id text,
  p_user_name text,
  p_plataforma text,
  p_online boolean,
  p_pendentes integer,
  p_com_erro integer,
  p_mais_antigo_em timestamptz,
  p_ultimo_erro text,
  p_ultimo_erro_rotulo text,
  p_detalhes jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_nome text;
begin
  if v_uid is null then
    raise exception 'Nao autenticado' using errcode = '28000';
  end if;
  if p_device_id is null or char_length(p_device_id) < 8 or char_length(p_device_id) > 80 then
    raise exception 'device_id invalido' using errcode = '22023';
  end if;

  -- O nome vem do cadastro, nao do cliente: a tela do admin nao deve exibir o que o aparelho inventar.
  select name into v_nome from public.profiles where id = v_uid::text;

  insert into public.ops_sincronizacao_aparelhos as a (
    device_id, user_id, user_name, plataforma, online,
    pendentes, com_erro, mais_antigo_em, ultimo_erro, ultimo_erro_rotulo,
    detalhes, reportado_em
  ) values (
    p_device_id,
    v_uid,
    left(coalesce(v_nome, p_user_name), 120),
    left(p_plataforma, 80),
    coalesce(p_online, true),
    greatest(coalesce(p_pendentes, 0), 0),
    greatest(coalesce(p_com_erro, 0), 0),
    p_mais_antigo_em,
    left(p_ultimo_erro, 300),
    left(p_ultimo_erro_rotulo, 120),
    coalesce(p_detalhes, '{}'::jsonb),
    now()
  )
  on conflict (device_id, user_id) do update set
    user_name = excluded.user_name,
    plataforma = excluded.plataforma,
    online = excluded.online,
    pendentes = excluded.pendentes,
    com_erro = excluded.com_erro,
    mais_antigo_em = excluded.mais_antigo_em,
    ultimo_erro = excluded.ultimo_erro,
    ultimo_erro_rotulo = excluded.ultimo_erro_rotulo,
    detalhes = excluded.detalhes,
    reportado_em = excluded.reportado_em;

  -- Faxina: aparelho que nao reporta ha 60 dias saiu de circulacao.
  delete from public.ops_sincronizacao_aparelhos
  where reportado_em < now() - interval '60 days';
end;
$$;

revoke all on function public.registrar_sincronizacao_aparelho(text, text, text, boolean, integer, integer, timestamptz, text, text, jsonb) from public, anon;
grant execute on function public.registrar_sincronizacao_aparelho(text, text, text, boolean, integer, integer, timestamptz, text, text, jsonb) to authenticated;

notify pgrst, 'reload schema';
