-- =====================================================================
-- Cadastro de serviços de Facilities — lista mestre editável em
-- "Facilities > Cadastros > Lista de Serviços".
--
-- Contexto: a categoria do chamado de Facilities em Nova Solicitação
-- (`getHelpdeskCategories` para o setor 3) era uma lista fixa no código
-- ('Elétrica', 'Hidráulica', 'Climatização', 'Mobiliário', 'Limpeza',
-- 'Chaves/Acesso', 'Outro'). Qualquer serviço novo exigia deploy. Passa a
-- vir desta tabela: o gestor de Facilities cadastra, edita, reordena e
-- inativa os serviços, e o formulário reflete na hora.
--
-- `ordem` controla a posição no select ("Outro" fica por último, em 99);
-- `ativo` esconde o serviço do formulário sem perder o histórico dos
-- chamados que já o usaram. Exclusão é lógica (`excluido_em`), no mesmo
-- padrão das demais tabelas de cadastro do módulo.
-- =====================================================================

create table if not exists public.fac_servicos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  descricao text,
  ordem integer not null default 0,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  excluido_em timestamptz,
  excluido_por text references public.core_perfis(id),
  unique (nome)
);

create index if not exists idx_fac_servicos_ativo on public.fac_servicos (ativo) where excluido_em is null;

alter table public.fac_servicos enable row level security;

-- Mesma política das demais tabelas mestre do módulo: leitura e escrita
-- liberadas ao app (o acesso à tela de cadastro já é filtrado por `pages.ts`).
drop policy if exists fac_servicos_all on public.fac_servicos;
create policy fac_servicos_all on public.fac_servicos
  for all to anon, authenticated using (true) with check (true);

grant select, insert, update, delete on public.fac_servicos to anon, authenticated;

insert into public.fac_servicos (nome, descricao, ordem) values
  ('Elétrica',      'Iluminação, tomadas, quadros e instalações elétricas prediais.', 1),
  ('Hidráulica',    'Vazamentos, entupimentos, torneiras, caixas d''água e sanitários.', 2),
  ('Climatização',  'Ar-condicionado, ventilação e exaustão.', 3),
  ('Mobiliário',    'Mesas, cadeiras, armários e divisórias.', 4),
  ('Limpeza',       'Higienização de áreas, coleta de resíduos e conservação predial.', 5),
  ('Chaves/Acesso', 'Chaves, fechaduras, crachás e liberação de acesso a áreas.', 6),
  ('Outro',         'Serviço não listado — descreva na justificativa do chamado.', 99)
on conflict (nome) do nothing;
