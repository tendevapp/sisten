-- =====================================================================
-- De-para Pedidos/Pagamentos -> Rubrica (Financeiro)
-- Tabela: fin_rubrica_mapeamentos
--
-- Liga um fornecedor SAP ou um grupo de mercadoria SAP a uma rubrica de
-- `fin_rubricas`. Prioridade de resolucao (ver views vw_fin_pedidos_por_rubrica
-- e vw_fin_pagamentos_por_rubrica): fornecedor primeiro, grupo_mercadoria como
-- fallback. Carga inicial e um ponto de partida best-effort - o usuario ajusta
-- pela tela de manutencao a medida que valida os numeros reais.
-- =====================================================================

create table if not exists public.fin_rubrica_mapeamentos (
  id uuid primary key default gen_random_uuid(),
  rubrica_id uuid not null references public.fin_rubricas(id) on delete cascade,
  tipo_chave text not null check (tipo_chave in ('fornecedor', 'grupo_mercadoria')),
  chave_valor text not null,
  chave_descricao text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tipo_chave, chave_valor)
);

create index if not exists idx_fin_rubrica_map_rubrica on public.fin_rubrica_mapeamentos (rubrica_id);
create index if not exists idx_fin_rubrica_map_chave on public.fin_rubrica_mapeamentos (tipo_chave, chave_valor);

drop trigger if exists tr_fin_rubrica_mapeamentos_updated_at on public.fin_rubrica_mapeamentos;
create trigger tr_fin_rubrica_mapeamentos_updated_at
  before update on public.fin_rubrica_mapeamentos
  for each row execute function public.tocar_updated_at();

grant select, insert, update, delete on public.fin_rubrica_mapeamentos to anon, authenticated, service_role;

alter table public.fin_rubrica_mapeamentos enable row level security;

drop policy if exists "fin_rubrica_mapeamentos_select_all" on public.fin_rubrica_mapeamentos;
create policy "fin_rubrica_mapeamentos_select_all"
  on public.fin_rubrica_mapeamentos
  for select
  using (true);

drop policy if exists "fin_rubrica_mapeamentos_all_authenticated" on public.fin_rubrica_mapeamentos;
create policy "fin_rubrica_mapeamentos_all_authenticated"
  on public.fin_rubrica_mapeamentos
  for all
  using (true)
  with check (true);

-- =====================================================================
-- Carga inicial por FORNECEDOR (achados consultando sap_zl0132_po /
-- sap_fbl1n_pagar por nome do fornecedor)
-- =====================================================================
insert into public.fin_rubrica_mapeamentos (rubrica_id, tipo_chave, chave_valor, chave_descricao)
select r.id, 'fornecedor', v.codigo, v.descricao
from (values
  ('1000010928', 'GESTALT VIGILANCIA PATRIMONIAL', 'vigilancia'),
  ('1000048921', 'SEMEQ - SERVICOS DE MONITORAMENTO', 'vigilancia'),
  ('1000009680', 'SIGOWEB INFORMATICA LTDA ME', 'sistema_apontamento'),
  ('1000012364', 'SOFTEXPERT SOFTWARE S A', 'compliance')
) as v(codigo, descricao, rubrica_codigo)
join public.fin_rubricas r on r.codigo = v.rubrica_codigo
on conflict (tipo_chave, chave_valor) do nothing;

-- =====================================================================
-- Carga inicial por GRUPO DE MERCADORIA especifico (Tinta e Solda: a
-- categoria nivel2 do cadastro_grupo_mercadoria e ampla demais - "MRO -
-- Manutencao" e "Estruturas Metalicas" - entao aqui mapeamos os codigos
-- exatos de tinta/solda em vez da categoria inteira)
-- =====================================================================
insert into public.fin_rubrica_mapeamentos (rubrica_id, tipo_chave, chave_valor, chave_descricao)
select r.id, 'grupo_mercadoria', g.codigo, g.denominacao
from public.cadastro_grupo_mercadoria g
join public.fin_rubricas r on r.codigo = 'tinta'
where g.codigo in ('B7502', 'B7503', 'B7504', 'B7505', 'M08007005', 'B75')
on conflict (tipo_chave, chave_valor) do nothing;

insert into public.fin_rubrica_mapeamentos (rubrica_id, tipo_chave, chave_valor, chave_descricao)
select r.id, 'grupo_mercadoria', g.codigo, g.denominacao
from public.cadastro_grupo_mercadoria g
join public.fin_rubricas r on r.codigo = 'solda'
where g.codigo in ('B5506', 'M14002004', 'M08008003', 'B55', 'B73')
on conflict (tipo_chave, chave_valor) do nothing;

-- =====================================================================
-- Carga inicial por GRUPO DE MERCADORIA via classificacao_nivel2 (categorias
-- do cadastro_grupo_mercadoria com correspondencia razoavelmente direta a
-- uma rubrica generica)
-- =====================================================================
insert into public.fin_rubrica_mapeamentos (rubrica_id, tipo_chave, chave_valor, chave_descricao)
select r.id, 'grupo_mercadoria', g.codigo, g.denominacao
from public.cadastro_grupo_mercadoria g
join (values
  ('Segurança Patrimonial', 'vigilancia'),
  ('EPI - Segurança', 'epis'),
  ('Limpeza e Conservação', 'limpeza'),
  ('Conservação Predial e Facilities', 'manutencao_predial'),
  ('Materiais de Escritório', 'materiais_escritorio'),
  ('Medicamentos', 'medicamentos_ambulatorio'),
  ('Hospitalar', 'medicamentos_ambulatorio'),
  ('TI e Informática', 'material_informatica'),
  ('MRO - Manutenção', 'despesas_manutencao'),
  ('Locação de Equipamentos', 'aluguel_equipamento'),
  ('Frete e Logística', 'frete'),
  ('Veículos e Transporte', 'transporte'),
  ('Manutenção de Frotas e Veículos', 'transporte'),
  ('Utilidades e Telecomunicações', 'energia'),
  ('Consultoria e Outros', 'contratos_consultorias')
) as vinculo(nivel2, rubrica_codigo) on vinculo.nivel2 = g.classificacao_nivel2
join public.fin_rubricas r on r.codigo = vinculo.rubrica_codigo
on conflict (tipo_chave, chave_valor) do nothing;
