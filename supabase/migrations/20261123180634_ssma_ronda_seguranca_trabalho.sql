-- FRM.SEG-0041, revisão 00. O índice da Ronda reinicia a cada dia.
create function public.ssma_ronda_pode_acessar() returns boolean
language sql stable security invoker set search_path = '' as $$
  select exists (
    select 1 from public.core_perfis p
    where p.id = (select auth.uid())::text and p.status = 'ativo'
      and ('admin' = any(p.roles) or (
        p.sector_id = '13' and coalesce(p.page_access->>'formularios','true') = 'true'
        and coalesce(p.page_access->>'form_ssma_ronda',p.page_access->>'form_ssma','true') = 'true'))
  )
$$;

create table public.ssma_rondas (
  id uuid primary key,
  data date not null,
  indice integer not null check (indice > 0),
  hora time not null,
  frentes text not null check (length(trim(frentes)) between 1 and 4000),
  gerente text not null check (length(trim(gerente)) between 1 and 150),
  assinatura_gerente text,
  epi integer not null check (epi between 0 and 9999),
  queda integer not null check (queda between 0 and 9999),
  organizacao integer not null check (organizacao between 0 and 9999),
  protecao_coletiva integer not null check (protecao_coletiva between 0 and 9999),
  boas_praticas text not null check (length(boas_praticas) <= 8000),
  observacoes text not null check (length(observacoes) <= 8000),
  criado_por uuid not null,
  criado_em timestamptz not null default now(),
  hash_envio text not null,
  unique(data, indice),
  check (assinatura_gerente is null or (length(assinatura_gerente) <= 524288 and assinatura_gerente ~ '^data:image/png;base64,iVBORw0KGgo[A-Za-z0-9+/]+=*$'))
);

create table public.ssma_ronda_participantes (
  ronda_id uuid not null references public.ssma_rondas(id) on delete cascade,
  ordem integer not null check (ordem > 0),
  nome text not null check (length(trim(nome)) between 1 and 150),
  assinatura text check (assinatura is null or (length(assinatura) <= 524288 and assinatura ~ '^data:image/png;base64,iVBORw0KGgo[A-Za-z0-9+/]+=*$')),
  primary key(ronda_id, ordem)
);

alter table public.ssma_rondas enable row level security;
alter table public.ssma_ronda_participantes enable row level security;
revoke all on public.ssma_rondas, public.ssma_ronda_participantes from public, anon, authenticated;
grant select on public.ssma_rondas, public.ssma_ronda_participantes to authenticated;
create policy ronda_leitura on public.ssma_rondas for select to authenticated using ((select public.ssma_ronda_pode_acessar()));
create policy ronda_participantes_leitura on public.ssma_ronda_participantes for select to authenticated using ((select public.ssma_ronda_pode_acessar()));

create function public.ssma_ronda_registrar(p_id uuid, p_dados jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_data date;
  v_indice integer;
  v_existente public.ssma_rondas%rowtype;
begin
  if not public.ssma_ronda_pode_acessar() then
    raise exception 'Perfil sem acesso à Ronda de Segurança.' using errcode = '42501';
  end if;
  if p_id is null or jsonb_typeof(p_dados->'participantes') is distinct from 'array' then
    raise exception 'Envio de ronda inválido.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('ssma_ronda_id:' || p_id, 0));
  select * into v_existente from public.ssma_rondas where id = p_id;
  if found then
    if v_existente.criado_por = auth.uid() and v_existente.hash_envio = md5(p_dados::text) then return; end if;
    raise exception 'Este envio já foi registrado com outros dados.';
  end if;
  v_data := (p_dados->>'data')::date;
  perform pg_advisory_xact_lock(hashtextextended('ssma_ronda_dia:' || (v_data - date '2000-01-01'), 0));
  select coalesce(max(indice), 0) + 1 into v_indice from public.ssma_rondas where data = v_data;
  insert into public.ssma_rondas (id,data,indice,hora,frentes,gerente,assinatura_gerente,epi,queda,organizacao,protecao_coletiva,boas_praticas,observacoes,criado_por,hash_envio)
  values (p_id,v_data,v_indice,(p_dados->>'hora')::time,trim(p_dados->>'frentes'),trim(p_dados->>'gerente'),p_dados->>'assinatura_gerente',
    (p_dados->>'epi')::integer,(p_dados->>'queda')::integer,(p_dados->>'organizacao')::integer,(p_dados->>'protecao_coletiva')::integer,
    coalesce(p_dados->>'boas_praticas',''),coalesce(p_dados->>'observacoes',''),auth.uid(),md5(p_dados::text));
  insert into public.ssma_ronda_participantes(ronda_id,ordem,nome,assinatura)
  select p_id,ordem,trim(p->>'nome'),p->>'assinatura' from jsonb_array_elements(p_dados->'participantes') with ordinality as item(p,ordem);
end
$$;
revoke all on function public.ssma_ronda_pode_acessar(), public.ssma_ronda_registrar(uuid,jsonb) from public, anon;
grant execute on function public.ssma_ronda_pode_acessar(), public.ssma_ronda_registrar(uuid,jsonb) to authenticated;
