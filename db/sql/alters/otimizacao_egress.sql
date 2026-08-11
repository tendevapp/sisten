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
  ('contatos'),
  ('cidadeforn'),
  ('historico_sem_po')
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

-- =====================================================================
-- v2 — import_logs: contagens geradas + retenção (ver plano.md, FASE 1 / P0)
--
-- `ignored_rows` (jsonb) sozinha chegou a 12 MB no total da tabela e era
-- baixada inteira em TODO sync (sem gate, a cada troca de rota/foco/polling).
-- As colunas geradas abaixo permitem manter os badges de contagem na
-- listagem sem precisar do conteúdo completo — que agora só é buscado sob
-- demanda (fetchImportLogDetail), ao expandir um log específico no AdminPanel.
-- =====================================================================

alter table public.import_logs
  add column if not exists ignored_rows_count integer
    generated always as (coalesce(jsonb_array_length(ignored_rows), 0)) stored,
  add column if not exists missing_ris_count integer
    generated always as (coalesce(jsonb_array_length(missing_ris), 0)) stored;

-- Retenção: zera o jsonb pesado de cargas com mais de 90 dias (as contagens
-- continuam corretas). Rodar periodicamente (ex.: cron mensal) para a coluna
-- não voltar a crescer sem limite.
update public.import_logs
set ignored_rows = '[]'::jsonb,
    missing_ris = '[]'::jsonb
where created_at < now() - interval '90 days'
  and (ignored_rows is not null and ignored_rows <> '[]'::jsonb
       or missing_ris is not null and missing_ris <> '[]'::jsonb);
