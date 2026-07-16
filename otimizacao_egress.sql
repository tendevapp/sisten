-- =====================================================================
-- Otimização de Egress — cache local versionado por importação.
--
-- Cada base pesada (Catálogo SAP, Histórico de Pedidos, Pedidos/Itens sem PO,
-- Contatos, Requisições) só muda quando alguém faz uma importação. Esta tabela
-- guarda um "carimbo de versão" por base. O app baixa apenas o carimbo (poucos
-- bytes) e só rebaixa a base inteira quando a versão muda — em vez de rebaixar
-- tudo a cada boot/navegação.
-- =====================================================================

create table if not exists public.dataset_versions (
  dataset      text primary key,
  version      bigint      not null default 1,
  row_count    bigint,
  updated_at   timestamptz not null default now(),
  updated_by   text
);

grant select on public.dataset_versions to anon, authenticated;

-- Linhas iniciais (version = 1) para todos os datasets versionados.
-- Sem isto o carimbo não existiria e o app cairia no modo degradado
-- (baixa uma vez por navegador e mantém local, sem revalidação entre clientes).
insert into public.dataset_versions (dataset) values
  ('materials'),
  ('requisicoes'),
  ('pedidos'),
  ('historico_pedidos'),
  ('pedidosforn'),
  ('contatos')
on conflict (dataset) do nothing;

-- Incrementa a versão de um dataset. Chamado ao fim de cada importação.
create or replace function public.bump_dataset_version(
  p_dataset text,
  p_rows    bigint default null,
  p_user    text   default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new bigint;
begin
  insert into public.dataset_versions (dataset, version, row_count, updated_at, updated_by)
  values (p_dataset, 1, p_rows, now(), p_user)
  on conflict (dataset) do update
    set version    = dataset_versions.version + 1,
        row_count  = coalesce(excluded.row_count, dataset_versions.row_count),
        updated_at = now(),
        updated_by = excluded.updated_by
  returning version into v_new;

  return v_new;
end;
$$;

grant execute on function public.bump_dataset_version(text, bigint, text) to anon, authenticated;
