-- FRM.SEG-0036, revisão 01. Catálogo imutável desta revisão.
create table public.ssma_isp_itens (
  codigo text primary key,
  ordem smallint not null unique,
  descricao text not null
);
insert into public.ssma_isp_itens (codigo, ordem, descricao) values
  ('G 01', 1, 'Para as atividades em altura (acima de 2 metros) são observados o uso de medidas coletivas de proteção contra queda e uso do cinto de segurança e trava-quedas de forma adequada?'),
  ('G 02', 2, 'Para as atividades que envolvam projeção de partículas é observado o uso de óculos de proteção?'),
  ('G 03', 3, 'As atividades e intervenções em instalações elétricas são realizadas por profissional habilitado, qualificado e/ ou capacitado?'),
  ('G 04', 4, 'As máquinas, equipamentos e circuitos elétricos possuem o conjunto de aterramento instalado adequadamente?'),
  ('G 05', 5, 'Para as atividades que envolvam o uso de substâncias inflamáveis são adotadas medidas para a eliminação do risco de incêndio e explosão?'),
  ('G 06', 6, 'Os checklist estão sendo preenchido corretamente?'),
  ('G 07', 7, 'As atividades estão sendo realizadas de maneira planejada, com a adequada identificação dos perigos, avaliação dos riscos e adoção de medidas de controle?'),
  ('G 08', 8, 'Para as atividades com exposição ao ruído são observados o uso de medidas de proteção coletiva (ex: enclausuramento) e o uso do protetor auricular conforme definido no PPRA?'),
  ('G 09', 9, 'Para as atividades envolvendo o risco de corte são observadas as medidas de proteção coletivas adequadas (ex.: a coifa de proteção) e desempenhadas por profissional habilitado?'),
  ('G 10', 10, 'Os vasos de pressão e as caldeiras estão atendendo à NR-13 e possuem a pressão de abertura ajustada em valor igual ou inferior à PMTA (Pressão Máxima de Trabalho Admissível)?'),
  ('M 01', 11, 'Para as atividades de movimentação e içamento de cargas são adotadas medidas de isolamento de área e sinalização, de modo que não permaneçam funcionários embaixo de cargas suspensas?'),
  ('M 02', 12, 'As atividades realizadas são supervisionadas por profissional capacitado (Encarregado)?'),
  ('M 03', 13, 'Os funcionários conseguem perceber os perigos associados à realização das atividades?'),
  ('M 04', 14, 'Estão sendo utilizados corretamente todos os EPIs adequados ao desempenho das aitivdades, conforme definido no PPRA?'),
  ('M 05', 15, 'Os acessórios dos equipamento de movimentação de carga estão sendo armazenados em locais adequados?'),
  ('M 06', 16, 'As partes móveis dos motores, transmissões e partes perigosas das máquinas e equipamentos possuem proteção e estão devidamente sinalizadas?'),
  ('M 07', 17, 'O local de transporte, carga e descarga de materiais está isolado e sinalizado corretamente?'),
  ('M 08', 18, 'As atividades realizadas em espaços confinados, trabalho em altura e máquinas/equipamento estão adequadas conforme legislação vigente?'),
  ('M 09', 19, 'No local onde existe o risco de incêndio o sistema de combate está adequado, sinalizado e devidamente inspecionado?'),
  ('M 10', 20, 'O abastecimento é realizado com as máquinas e equipamentos desligados?'),
  ('M 11', 21, 'As máquinas e equipamentos são operadas por Operadoes capacitados e qualificados? Possuem carteira de identificação?'),
  ('M 12', 22, 'No local onde existe o risco de incêndio e explosão é observada a proibição de fumar e/ ou utilizar dispositivos que provoquem faíscas?'),
  ('M 13', 23, 'As operações de soldagem e corte à quente são realizadas por funcionáios qualificados e possuem equipamentos e acessórios adequados à NR- 18 item 18.11.'),
  ('L 01', 24, 'O ambiente de trabalho, onde são realizadas as atividades, encontra-se limpo, arrumado e organizado?'),
  ('L 02', 25, 'As máquinas e equipamentos possuem sinalização sonora?'),
  ('L 03', 26, 'A iluminação e ventilação do local de trabalho está adequada?'),
  ('L 04', 27, 'O uniforme está em boas condições de uso?'),
  ('L 05', 28, 'Os equipamentos estão em boas condições de uso?'),
  ('L 06', 29, 'Os funcionários participaram do DDS antes das atividades?'),
  ('L 07', 30, 'Os funcionários participaram dos treinamentos associados e necessários à realização das atividades (ex.: AR, PO, etc)?'),
  ('L 08', 31, 'Todo material armazenado encontra-se em local adequado, organizado e identificado?'),
  ('L 09', 32, 'O local de trabalho é mantido limpo de acordo com as normas de higiene e limpeza?'),
  ('L 10', 33, 'Foram encontradas condições inseguras de trabalho?'),
  ('L 11', 34, 'Os funcionários estão portando o crachá durante a realização das atividades?'),
  ('L 12', 35, 'Existe evidência de improvisação de equipamentos durante a execução das atividades?'),
  ('L 13', 36, 'Os extintores de incêndio, saídas de emergência e rotas de fuga encontram-se desobstruídos?'),
  ('L 14', 37, 'Os funcionários estão se responsabilizando pela guarda e conservação dos EPIs?'),
  ('L 15', 38, 'As condições de acessos ao local de trabalho estão adequadas e não oferecem condições de riscos?'),
  ('L 16', 39, 'As ferramentas à disposição estão em condições adequadas de uso?'),
  ('L 17', 40, 'Os funcionários conhecem a Política da empresa?'),
  ('L 18', 41, 'Existe água potável e sanitários disponibilizados em condições adequadas e atendendo a proporção de funcionários?'),
  ('L 19', 42, 'Foram identificado atos inseguros durante a realização da inspeção?'),
  ('L 20', 43, 'O local de trabalho está sinalizado conforme os perigos e riscos associados às atividades?');

create table public.ssma_isp_inspecoes (
  id uuid primary key,
  data date not null,
  indice integer not null check (indice > 0),
  area text not null check (length(trim(area)) > 0),
  responsavel_area text not null check (length(trim(responsavel_area)) > 0),
  inspetor text not null check (length(trim(inspetor)) > 0),
  tst text not null check (length(trim(tst)) > 0),
  inicio time not null,
  duracao_min integer not null check (duracao_min > 0),
  inspecionados integer not null check (inspecionados >= 0),
  hhi numeric check (hhi >= 0),
  comentarios text not null default '',
  fotos text[] not null default '{}',
  criado_por uuid not null,
  criado_em timestamptz not null default now(),
  pedido_hash text not null,
  unique (data, indice)
);
create table public.ssma_isp_respostas (
  inspecao_id uuid not null references public.ssma_isp_inspecoes,
  item text not null references public.ssma_isp_itens,
  quantidade integer not null check (quantidade >= 0),
  primary key (inspecao_id, item)
);
create table public.ssma_isp_acoes (
  inspecao_id uuid not null,
  ordem integer not null,
  item text not null,
  quantidade integer not null check (quantidade > 0),
  descricao text not null check (trim(descricao) <> ''),
  responsavel text not null check (trim(responsavel) <> ''),
  prazo date not null,
  rnc text,
  primary key (inspecao_id, ordem),
  foreign key (inspecao_id, item) references public.ssma_isp_respostas
);

create function public.ssma_isp_pode_acessar() returns boolean
language sql stable security invoker set search_path = '' as $$
  select exists (select 1 from public.core_perfis p
    where p.id = (select auth.uid())::text and p.status = 'ativo' and p.sector_id = '13'
      and coalesce(p.page_access->>'formularios','true') = 'true'
      and coalesce(p.page_access->>'form_ssma_isp', p.page_access->>'form_ssma','true') = 'true')
$$;
revoke all on function public.ssma_isp_pode_acessar() from public, anon;
grant execute on function public.ssma_isp_pode_acessar() to authenticated;

alter table public.ssma_isp_itens enable row level security;
revoke all on public.ssma_isp_itens from public, anon, authenticated;
grant select on public.ssma_isp_itens to authenticated;
create policy isp_leitura_seguranca on public.ssma_isp_itens for select to authenticated
  using ((select public.ssma_isp_pode_acessar()));

alter table public.ssma_isp_inspecoes enable row level security;
revoke all on public.ssma_isp_inspecoes from public, anon, authenticated;
grant select on public.ssma_isp_inspecoes to authenticated;
create policy isp_leitura_seguranca on public.ssma_isp_inspecoes for select to authenticated
  using ((select public.ssma_isp_pode_acessar()));

alter table public.ssma_isp_respostas enable row level security;
revoke all on public.ssma_isp_respostas from public, anon, authenticated;
grant select on public.ssma_isp_respostas to authenticated;
create policy isp_leitura_seguranca on public.ssma_isp_respostas for select to authenticated
  using ((select public.ssma_isp_pode_acessar()));

alter table public.ssma_isp_acoes enable row level security;
revoke all on public.ssma_isp_acoes from public, anon, authenticated;
grant select on public.ssma_isp_acoes to authenticated;
create policy isp_leitura_seguranca on public.ssma_isp_acoes for select to authenticated
  using ((select public.ssma_isp_pode_acessar()));

insert into storage.buckets (id, name, public, allowed_mime_types, file_size_limit)
values ('ssma-isp','ssma-isp',false,array['image/jpeg','image/png','image/webp'],10485760);
create policy isp_foto_leitura on storage.objects for select to authenticated
using (bucket_id = 'ssma-isp' and (select public.ssma_isp_pode_acessar()));
create policy isp_foto_envio on storage.objects for insert to authenticated
with check (bucket_id = 'ssma-isp' and (select public.ssma_isp_pode_acessar())
  and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy isp_foto_descartar on storage.objects for delete to authenticated
using (bucket_id = 'ssma-isp' and (select public.ssma_isp_pode_acessar())
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and not exists (select 1 from public.ssma_isp_inspecoes i where storage.objects.name = any(i.fotos)));

-- Só a operação completa grava. O invocador não recebe DML direto em tabela.
create schema if not exists private;
create function private.ssma_isp_registrar(p_id uuid, p_dados jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  dia date;
  sequencia integer;
  anexos text[];
  existente public.ssma_isp_inspecoes;
begin
  if not public.ssma_isp_pode_acessar() then raise exception 'Acesso restrito à Segurança' using errcode = '42501'; end if;
  dia := (p_dados->>'data')::date;
  -- Índice reinicia por dia. A trava serializa a numeração e os reenvios.
  perform pg_advisory_xact_lock(365036, dia - date '2000-01-01');
  select * into existente from public.ssma_isp_inspecoes where id = p_id;
  if found then
    if existente.criado_por = auth.uid() and existente.pedido_hash = md5(p_dados::text) then return p_id; end if;
    raise exception 'Este identificador já foi registrado. Consulte o histórico.';
  end if;
  if jsonb_typeof(p_dados->'respostas') is distinct from 'object'
    or jsonb_typeof(p_dados->'acoes') is distinct from 'array'
    or jsonb_typeof(p_dados->'fotos') is distinct from 'array' then raise exception 'Estrutura de inspeção inválida'; end if;
  if exists (select 1 from public.ssma_isp_itens where not (p_dados->'respostas' ? codigo)) then
    raise exception 'Preencha todos os itens de verificação';
  end if;
  select array(select jsonb_array_elements_text(p_dados->'fotos')) into anexos;
  if exists (select 1 from unnest(anexos) f where f is null or split_part(f,'/',1) <> auth.uid()::text
    or split_part(f,'/',2) <> p_id::text or not exists (select 1 from storage.objects o where o.bucket_id = 'ssma-isp' and o.name = f)) then
    raise exception 'Foto da inspeção indisponível';
  end if;
  select coalesce(max(indice),0)+1 into sequencia from public.ssma_isp_inspecoes where data = dia;
  insert into public.ssma_isp_inspecoes (id,data,indice,area,responsavel_area,inspetor,tst,inicio,duracao_min,inspecionados,hhi,comentarios,fotos,criado_por,pedido_hash)
  values (p_id,dia,sequencia,trim(p_dados->>'area'),trim(p_dados->>'responsavel_area'),trim(p_dados->>'inspetor'),trim(p_dados->>'tst'),
    (p_dados->>'inicio')::time,(p_dados->>'duracao_min')::integer,(p_dados->>'inspecionados')::integer,(p_dados->>'hhi')::numeric,
    coalesce(p_dados->>'comentarios',''),anexos,auth.uid(),md5(p_dados::text));
  insert into public.ssma_isp_respostas (inspecao_id,item,quantidade)
    select p_id,key,value::integer from jsonb_each_text(p_dados->'respostas');
  insert into public.ssma_isp_acoes (inspecao_id,ordem,item,quantidade,descricao,responsavel,prazo,rnc)
    select p_id,ordem,a->>'item',(a->>'quantidade')::integer,a->>'descricao',a->>'responsavel',(a->>'prazo')::date,nullif(a->>'rnc','')
    from jsonb_array_elements(p_dados->'acoes') with ordinality as ac(a,ordem);
  return p_id;
end $$;
revoke all on function private.ssma_isp_registrar(uuid,jsonb) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.ssma_isp_registrar(uuid,jsonb) to authenticated;
create function public.ssma_isp_registrar(p_id uuid, p_dados jsonb) returns uuid
language sql security invoker set search_path = '' as $$
  select private.ssma_isp_registrar(p_id,p_dados)
$$;
revoke all on function public.ssma_isp_registrar(uuid,jsonb) from public, anon;
grant execute on function public.ssma_isp_registrar(uuid,jsonb) to authenticated;
