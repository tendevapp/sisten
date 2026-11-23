-- FRM.SEG-0042, revisão 04. O índice do cartão reinicia a cada dia.
create function public.ssma_oc_pode_acessar() returns boolean
language sql stable security invoker set search_path = '' as $$
  select exists (
    select 1 from public.core_perfis p
    where p.id = (select auth.uid())::text and p.status = 'ativo'
      and ('admin' = any(p.roles) or (
        p.sector_id = '13' and coalesce(p.page_access->>'formularios','true') = 'true'
        and coalesce(p.page_access->>'form_ssma_oc',p.page_access->>'form_ssma','true') = 'true'))
  )
$$;

create table public.ssma_oc_itens (
  id smallint primary key,
  grupo text not null,
  descricao text not null
);
insert into public.ssma_oc_itens(id,grupo,descricao) values
  (1,'Reação das pessoas','Ajustando o EPI'),
  (2,'Reação das pessoas','Mudando de posição'),
  (3,'Reação das pessoas','Reorganizando o trabalho'),
  (4,'Reação das pessoas','Interrompendo o trabalho'),
  (5,'Reação das pessoas','Conectando o aterramento'),
  (6,'Reação das pessoas','Travando o equipamento'),
  (7,'Procedimentos','Disponíveis'),
  (8,'Procedimentos','Adequados'),
  (9,'Procedimentos','Conhecidos'),
  (10,'Procedimentos','Compreendidos'),
  (11,'Procedimentos','Seguidos'),
  (12,'Posições das pessoas — causas de lesões','Bater em objetos ou ser atingido por eles'),
  (13,'Posições das pessoas — causas de lesões','Ficar preso dentro, sobre ou entre objetos'),
  (14,'Posições das pessoas — causas de lesões','Queda'),
  (15,'Posições das pessoas — causas de lesões','Contato com temperaturas extremas'),
  (16,'Posições das pessoas — causas de lesões','Contato com corrente elétrica'),
  (17,'Posições das pessoas — causas de lesões','Inalar, absorver ou ingerir uma substância perigosa'),
  (18,'Posições das pessoas — causas de lesões','Movimentos repetitivos'),
  (19,'Posições das pessoas — causas de lesões','Posições inadequadas/ posturas estáticas'),
  (20,'EPI — verificação completa','Cabeça'),
  (21,'EPI — verificação completa','Olhos e rosto'),
  (22,'EPI — verificação completa','Ouvidos'),
  (23,'EPI — verificação completa','Sistema respiratório'),
  (24,'EPI — verificação completa','Braço e mãos'),
  (25,'EPI — verificação completa','Tronco'),
  (26,'EPI — verificação completa','Pés e pernas'),
  (27,'Ferramentas e equipamentos','Adequados para o trabalho'),
  (28,'Ferramentas e equipamentos','Utilizados corretamente'),
  (29,'Ferramentas e equipamentos','Em condições seguras'),
  (30,'Ferramentas e equipamentos','Inspecionadas / Check list'),
  (31,'Ferramentas e equipamentos','Inspecionadas / Cor do mês'),
  (32,'Ambiente','Limpo'),
  (33,'Ambiente','Organizado'),
  (34,'Ambiente','Em condições seguras'),
  (35,'Ambiente','Isolado');

create table public.ssma_oc_registros (
  id uuid primary key,
  data date not null,
  indice integer not null check (indice > 0),
  nome text not null check (length(btrim(nome)) between 1 and 200),
  local text not null check (length(btrim(local)) between 1 and 300),
  turno_letra text not null check (length(btrim(turno_letra)) between 1 and 100),
  lider_area text not null check (length(btrim(lider_area)) between 1 and 200),
  duracao_min integer not null check (duracao_min > 0),
  pessoas_contatadas integer not null check (pessoas_contatadas >= 0),
  pessoas_observadas integer not null check (pessoas_observadas >= 0),
  praticas_seguras text not null check (length(praticas_seguras) <= 8000),
  criado_em timestamptz not null default now(),
  criado_por uuid not null,
  hash_envio text not null,
  unique(data, indice)
);
create table public.ssma_oc_marcacoes (
  registro_id uuid not null references public.ssma_oc_registros(id) on delete cascade,
  item_id smallint not null references public.ssma_oc_itens(id),
  primary key(registro_id,item_id)
);
create index ssma_oc_marcacoes_item_idx on public.ssma_oc_marcacoes(item_id);
create table public.ssma_oc_desvios (
  registro_id uuid not null references public.ssma_oc_registros(id) on delete cascade,
  ordem integer not null check (ordem > 0),
  descricao text not null check (length(btrim(descricao)) between 1 and 4000),
  primary key(registro_id,ordem)
);

alter table public.ssma_oc_itens enable row level security;
revoke all on public.ssma_oc_itens from public, anon, authenticated;
grant select on public.ssma_oc_itens to authenticated;
create policy oc_itens_leitura on public.ssma_oc_itens for select to authenticated using ((select public.ssma_oc_pode_acessar()));
alter table public.ssma_oc_registros enable row level security;
revoke all on public.ssma_oc_registros from public, anon, authenticated;
grant select on public.ssma_oc_registros to authenticated;
create policy oc_registros_leitura on public.ssma_oc_registros for select to authenticated using ((select public.ssma_oc_pode_acessar()));
alter table public.ssma_oc_marcacoes enable row level security;
revoke all on public.ssma_oc_marcacoes from public, anon, authenticated;
grant select on public.ssma_oc_marcacoes to authenticated;
create policy oc_marcacoes_leitura on public.ssma_oc_marcacoes for select to authenticated using ((select public.ssma_oc_pode_acessar()));
alter table public.ssma_oc_desvios enable row level security;
revoke all on public.ssma_oc_desvios from public, anon, authenticated;
grant select on public.ssma_oc_desvios to authenticated;
create policy oc_desvios_leitura on public.ssma_oc_desvios for select to authenticated using ((select public.ssma_oc_pode_acessar()));

create function public.ssma_oc_registrar(p_id uuid, p_dados jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_data date;
  v_indice integer;
  v_existente public.ssma_oc_registros%rowtype;
begin
  if not public.ssma_oc_pode_acessar() then
    raise exception 'Perfil sem acesso à Observação Comportamental.' using errcode = '42501';
  end if;
  if p_id is null or jsonb_typeof(p_dados->'itens') is distinct from 'array'
    or jsonb_typeof(p_dados->'desvios') is distinct from 'array' then
    raise exception 'Envio de observação inválido.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('ssma_oc_id:' || p_id,0));
  select * into v_existente from public.ssma_oc_registros where id = p_id;
  if found then
    if v_existente.criado_por = auth.uid() and v_existente.hash_envio = md5(p_dados::text) then return; end if;
    raise exception 'Este envio já foi registrado com outros dados.';
  end if;
  v_data := (p_dados->>'data')::date;
  perform pg_advisory_xact_lock(hashtextextended('ssma_oc_dia:' || (v_data - date '2000-01-01'),0));
  select coalesce(max(indice),0)+1 into v_indice from public.ssma_oc_registros where data = v_data;
  insert into public.ssma_oc_registros(id,data,indice,nome,local,turno_letra,lider_area,duracao_min,pessoas_contatadas,pessoas_observadas,praticas_seguras,criado_por,hash_envio)
  values (p_id,v_data,v_indice,btrim(p_dados->>'nome'),btrim(p_dados->>'local'),btrim(p_dados->>'turno_letra'),btrim(p_dados->>'lider_area'),
    (p_dados->>'duracao_min')::integer,(p_dados->>'pessoas_contatadas')::integer,(p_dados->>'pessoas_observadas')::integer,
    coalesce(p_dados->>'praticas_seguras',''),auth.uid(),md5(p_dados::text));
  insert into public.ssma_oc_marcacoes(registro_id,item_id)
    select p_id, valor::smallint from jsonb_array_elements_text(p_dados->'itens') as itens(valor);
  insert into public.ssma_oc_desvios(registro_id,ordem,descricao)
    select p_id,ordem,btrim(valor) from jsonb_array_elements_text(p_dados->'desvios') with ordinality as d(valor,ordem);
end
$$;
revoke all on function public.ssma_oc_pode_acessar(), public.ssma_oc_registrar(uuid,jsonb) from public, anon;
grant execute on function public.ssma_oc_pode_acessar(), public.ssma_oc_registrar(uuid,jsonb) to authenticated;
