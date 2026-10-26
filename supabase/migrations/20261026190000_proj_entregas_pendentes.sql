-- =====================================================================
-- Projetos › Recebimento — itens não entregues e itens fora da BOM
-- =====================================================================
-- Na importação da planilha de recebimento, linha com CHECK vazio, 0 ou "-"
-- é item que estava na NF/romaneio mas não veio no carregamento. Ele vai para
-- `proj_entregas_pendentes` e é acompanhado até chegar num carregamento
-- seguinte (a importação seguinte sugere a baixa quando o mesmo part number —
-- e o mesmo PO, se houver — é creditado) ou até alguém dizer que não virá.
--
-- `chave` (NF|PN|PO|kit|aplicação) deduplica: reimportar a mesma planilha não
-- duplica a pendência.
--
-- `proj_itens.fora_da_bom`: item cadastrado pela importação porque chegou mas
-- não existe na BOM. A sincronização da BOM só insere o que falta, então
-- nunca o apaga.

create table if not exists public.proj_entregas_pendentes (
  id uuid primary key default gen_random_uuid(),
  projeto text not null default 'GW_JACOBINA',
  chave text not null,
  item_id uuid references public.proj_itens(id),
  part_number text not null,
  part_number_norm text not null,
  cod_sap text,
  descricao text,
  quantidade_esperada numeric,
  uom text,
  numero_nf text not null,
  data_nf date,
  pedido text,
  numero_kit text,
  aplicacao text,
  fornecedor text,
  observacao text,
  linha_planilha int,
  status text not null default 'PENDENTE' check (status in ('PENDENTE', 'ENTREGUE', 'NAO_VIRA')),
  resolvido_em timestamptz,
  resolvido_por_id text,
  resolvido_por_nome text,
  resolucao_nf text,
  resolucao_nota_codigo text,
  resolucao_obs text,
  criado_por_id text,
  criado_por_nome text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (projeto, chave)
);

create index if not exists idx_proj_entregas_pend_status on public.proj_entregas_pendentes (projeto, status);
create index if not exists idx_proj_entregas_pend_pn on public.proj_entregas_pendentes (projeto, part_number_norm) where status = 'PENDENTE';

create or replace function public.proj_entregas_pendentes_touch()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_proj_entregas_pendentes_touch on public.proj_entregas_pendentes;
create trigger trg_proj_entregas_pendentes_touch
  before update on public.proj_entregas_pendentes
  for each row execute function public.proj_entregas_pendentes_touch();

-- Mesmo acesso das demais tabelas do módulo Projetos (a tela decide quem lança).
alter table public.proj_entregas_pendentes enable row level security;
drop policy if exists proj_entregas_pendentes_all on public.proj_entregas_pendentes;
create policy proj_entregas_pendentes_all on public.proj_entregas_pendentes
  for all to authenticated using (true) with check (true);

revoke all on public.proj_entregas_pendentes from anon;
grant select, insert, update on public.proj_entregas_pendentes to authenticated;

alter table public.proj_itens add column if not exists fora_da_bom boolean not null default false;

-- Editar/excluir na tela: exclusão é lógica (some da lista, fica no banco).
-- A chave continua ocupada, então reimportar a mesma planilha não ressuscita
-- uma pendência excluída de propósito.
alter table public.proj_entregas_pendentes
  add column if not exists excluido_em timestamptz,
  add column if not exists excluido_por_id text,
  add column if not exists excluido_por_nome text,
  add column if not exists editado_por_nome text,
  add column if not exists editado_em timestamptz;
