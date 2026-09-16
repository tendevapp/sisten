-- =====================================================================
-- Catalogo de Rubricas Orcamentarias (Financeiro)
-- Tabela: fin_rubricas
--
-- 1a etapa do relatorio de Realizado por Rubrica: cadastro hierarquico das
-- rubricas de custo do projeto (Vigilancia, Limpeza, Transporte, EPIs,
-- Manutencao, contratos de sistemas, alugueis, consultorias etc.), sem a
-- separacao contabil DIRETO/INDIRETO (fica para uma proxima etapa, quando
-- houver fonte confiavel dessa classificacao) e sem valor orcado (o
-- orcamento ainda esta em planilha fora do banco).
-- =====================================================================

create table if not exists public.fin_rubricas (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nome text not null,
  rubrica_pai_id uuid references public.fin_rubricas(id) on delete set null,
  ordem integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_fin_rubricas_pai on public.fin_rubricas (rubrica_pai_id);

drop trigger if exists tr_fin_rubricas_updated_at on public.fin_rubricas;
create trigger tr_fin_rubricas_updated_at
  before update on public.fin_rubricas
  for each row execute function public.tocar_updated_at();

grant select, insert, update, delete on public.fin_rubricas to anon, authenticated, service_role;

alter table public.fin_rubricas enable row level security;

drop policy if exists "fin_rubricas_select_all" on public.fin_rubricas;
create policy "fin_rubricas_select_all"
  on public.fin_rubricas
  for select
  using (true);

drop policy if exists "fin_rubricas_all_authenticated" on public.fin_rubricas;
create policy "fin_rubricas_all_authenticated"
  on public.fin_rubricas
  for all
  using (true)
  with check (true);

-- =====================================================================
-- Carga inicial: rubricas de nivel 1 (sem pai)
-- =====================================================================
insert into public.fin_rubricas (codigo, nome, ordem) values
  ('vigilancia', 'Vigilância', 10),
  ('limpeza', 'Limpeza', 20),
  ('hospitais_clinicas_aso', 'Hospitais e Clínicas (ASO)', 30),
  ('transporte', 'Transporte', 40),
  ('alimentacao', 'Alimentação', 50),
  ('despesas_manutencao', 'Despesas Manutenção', 60),
  ('epis', 'EPIS', 70),
  ('material_informatica', 'Material Informática (Internet/Impressora/Suporte TI/Telefone)', 80),
  ('licencas_softwares_producao', 'Licenças e Softwares Produção', 90),
  ('empresas_terceirizadas', 'Empresas Terceirizadas', 100),
  ('cg_andrade', 'CG Andrade', 110),
  ('materiais_diversos', 'Materiais Diversos', 120),
  ('aluguel_equipamento', 'Aluguel de Equipamento', 130),
  ('contratos_consultorias', 'Contratos, Serviços e Consultorias e Certificações', 140),
  ('energia', 'Energia', 150),
  ('tinta', 'Tinta', 160),
  ('solda', 'Solda', 170),
  ('insumos', 'Insumos', 180),
  ('internos', 'Internos', 190),
  ('frete', 'Frete', 200)
on conflict (codigo) do nothing;

-- =====================================================================
-- Carga inicial: rubricas filhas dos itens compostos
-- =====================================================================
insert into public.fin_rubricas (codigo, nome, rubrica_pai_id, ordem)
select v.codigo, v.nome, p.id, v.ordem
from (values
  ('manutencao_preventiva_fabrica', 'Manutenção Preventiva Equipam. Fábrica', 'despesas_manutencao', 61),
  ('manutencao_corretiva_fabrica', 'Manutenção Corretiva Equipam. Fábrica', 'despesas_manutencao', 62),
  ('manutencao_predial', 'Manutenção Predial', 'despesas_manutencao', 63),

  ('compliance', 'Compliance', 'empresas_terceirizadas', 101),
  ('representacao_comercial', 'Representação Comercial', 'empresas_terceirizadas', 102),
  ('gerenciamento_energia', 'Gerenciamento de Energia', 'empresas_terceirizadas', 103),
  ('sistema_ponto', 'Sistema de Ponto', 'empresas_terceirizadas', 104),
  ('sistema_apontamento', 'Sistema de Apontamento', 'empresas_terceirizadas', 105),
  ('se_suit', 'SE Suit', 'empresas_terceirizadas', 106),
  ('portal_seguranca_trabalho', 'Portal de Segurança do Trabalho', 'empresas_terceirizadas', 107),
  ('portal_comunicacao', 'Portal de Comunicação', 'empresas_terceirizadas', 108),

  ('cg_ti', 'CG TI (Licenças softw., Usuários SAP, etc)', 'cg_andrade', 111),
  ('cg_processamento_nfs', 'CG - Processamento de NFs', 'cg_andrade', 112),
  ('cg_contabilidade', 'CG - Contabilidade', 'cg_andrade', 113),
  ('cg_contas_a_pagar', 'CG - Contas a Pagar', 'cg_andrade', 114),

  ('materiais_escritorio', 'Materiais de Escritório', 'materiais_diversos', 121),
  ('materiais_facilities', 'Materiais para Facilities (água, reposições)', 'materiais_diversos', 122),
  ('medicamentos_ambulatorio', 'Medicamentos e Materiais de Ambulatório', 'materiais_diversos', 123),
  ('materiais_comunicacao', 'Materiais de Comunicação', 'materiais_diversos', 124),

  ('aluguel_qualidade', 'Aluguel Qualidade (Phased, etc)', 'aluguel_equipamento', 131),
  ('aluguel_equip_producao', 'Aluguel Equip. de Produção (Tesourinha)', 'aluguel_equipamento', 132),
  ('aluguel_equip_manutencao', 'Aluguel Equip. Manutenção (PTA, etc)', 'aluguel_equipamento', 133),

  ('consultoria_seguranca', 'Consultorias, Serviços, Trein. e Certificações Segurança', 'contratos_consultorias', 141),
  ('consultoria_meio_ambiente', 'Consultorias, Serviços, Trein. e Certificações Meio Ambiente', 'contratos_consultorias', 142),
  ('consultoria_saude', 'Consultorias, Serviços, Trein. e Certificações Saúde', 'contratos_consultorias', 143),
  ('consultoria_qualidade', 'Consultorias, Serviços, Trein. e Certificações Qualidade', 'contratos_consultorias', 144),
  ('consultoria_contabilidade', 'Consultorias, Serviços, Trein. Contabilidade', 'contratos_consultorias', 145),
  ('consultoria_producao', 'Consultorias, Serviços, Trein. Produção', 'contratos_consultorias', 146)
) as v(codigo, nome, pai_codigo, ordem)
join public.fin_rubricas p on p.codigo = v.pai_codigo
on conflict (codigo) do nothing;
