-- =====================================================================
-- SSMA — Ficha de EPI: fichas em papel convertidas (histórico)
--
-- As fichas antigas foram preenchidas à mão e não têm a assinatura digital
-- que a tela captura. Para entrarem no histórico (e na análise de consumo)
-- sem falsificar assinatura, a ficha ganha uma origem:
--   DIGITAL          assinada na tela — a assinatura PNG continua obrigatória
--   HISTORICO_PAPEL  convertida da ficha manual — sem imagem de assinatura
--
-- O cliente continua só inserindo ficha DIGITAL (policy e RPC). A ficha de
-- histórico só entra por script de importação, com o papel dono do banco.
-- =====================================================================

alter table public.ssma_fichas_epi
  add column origem text not null default 'DIGITAL'
    check (origem in ('DIGITAL', 'HISTORICO_PAPEL'));

alter table public.ssma_fichas_epi alter column assinatura_colaborador drop not null;

alter table public.ssma_fichas_epi drop constraint ssma_fichas_epi_assinatura_colaborador_check;

-- coalesce: sem ele, assinatura nula passaria no CHECK (NULL não reprova) e
-- uma ficha DIGITAL poderia nascer sem assinatura.
alter table public.ssma_fichas_epi
  add constraint ssma_fichas_epi_assinatura_check check (
    origem = 'HISTORICO_PAPEL'
    or coalesce(assinatura_colaborador like 'data:image/png;base64,%', false)
  );

drop policy ssma_fichas_epi_insert on public.ssma_fichas_epi;
create policy ssma_fichas_epi_insert on public.ssma_fichas_epi for insert to authenticated
with check (
  (select public.ssma_book_epis_pode_acessar())
  and criado_por = (select auth.uid())::text
  and status = 'ATIVA'
  and origem = 'DIGITAL'
);

-- ---------------------------------------------------------------------
-- Linhas originais da ficha em papel, como vieram da conversão. A ficha e o
-- item gravados são a versão padronizada (Book/SAP); aqui fica o que estava
-- escrito à mão (descrição, CA, devolução) para conferência.
-- ---------------------------------------------------------------------
create table public.ssma_fichas_epi_import_legado (
  id bigint generated always as identity primary key,
  linha integer not null,
  colaborador text not null,
  matricula_arquivo text,
  cargo_arquivo text,
  setor_arquivo text,
  data_entrega date not null,
  ca_arquivo text,
  descricao_ficha text,
  quantidade numeric(10, 2),
  codigo_material text,
  devolucao_arquivo text,
  ficha_id uuid references public.ssma_fichas_epi(id) on delete set null,
  item_id uuid references public.ssma_fichas_epi_itens(id) on delete set null,
  importado_por text,
  importado_em timestamptz not null default now()
);

create index ssma_fichas_epi_import_legado_ficha_idx on public.ssma_fichas_epi_import_legado (ficha_id);

revoke all on table public.ssma_fichas_epi_import_legado from anon, authenticated;
grant select on table public.ssma_fichas_epi_import_legado to authenticated;

alter table public.ssma_fichas_epi_import_legado enable row level security;
create policy ssma_fichas_epi_import_legado_select on public.ssma_fichas_epi_import_legado
  for select to authenticated using ((select public.ssma_book_epis_pode_acessar()));

notify pgrst, 'reload schema';
