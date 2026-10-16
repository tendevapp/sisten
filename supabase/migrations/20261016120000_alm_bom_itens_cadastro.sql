-- =====================================================================
-- Almoxarifado > Cadastro de Itens > Itens BOM.
--
-- A etiqueta de identificação dos itens da BOM do projeto (peça, código
-- equivalente Qingdao, quantidade por seção S1..S5) precisa de foto e
-- localização, que a BOM importada não tem. Este cadastro guarda só o que o
-- almoxarifado completa; descrição, Qingdao e quantidades continuam vindo da
-- BOM (`proj_bom_gwjaco` / `vw_proj_bom_arvore`) — reimportar a BOM não apaga
-- o que foi cadastrado aqui.
--
-- Chave: projeto + part number normalizado (mesma regra de
-- `proj_normalizar_pn` / `normalizarPartNumber`: só letras e números, em
-- maiúsculas), porque a BOM traz o mesmo item escrito de jeitos diferentes.
--
-- Foto no bucket `request-attachments`, pasta `almox-bom/` (comprimida antes
-- de subir, regra 1 do CLAUDE.md). Separada do catálogo de itens SAP
-- (`alm_catalogo_itens`): peça da BOM nem sempre tem código SAP.
--
-- Cadastro compartilhado do almoxarifado: qualquer autenticado lê, inclui e
-- atualiza. Não há DELETE.
-- =====================================================================

create table if not exists public.alm_bom_itens_cadastro (
  id uuid primary key default gen_random_uuid(),
  projeto text not null default 'GW_JACOBINA',
  part_number_norm text not null,
  part_number text not null,
  posicao_estoque text,
  etiqueta_descricao text,
  observacao text,
  imagem_path text,
  imagem_nome text,
  imagem_mime text,
  imagem_tamanho integer,
  etiqueta_impressa_em timestamptz,
  criado_por text,
  criado_por_nome text,
  atualizado_por text,
  atualizado_por_nome text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_alm_bom_itens_cadastro unique (projeto, part_number_norm)
);

create or replace function public.alm_bom_itens_cadastro_antes_gravar()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_alm_bom_itens_cadastro_antes_gravar on public.alm_bom_itens_cadastro;
create trigger trg_alm_bom_itens_cadastro_antes_gravar
  before insert or update on public.alm_bom_itens_cadastro
  for each row execute function public.alm_bom_itens_cadastro_antes_gravar();

alter table public.alm_bom_itens_cadastro enable row level security;

drop policy if exists alm_bom_itens_cadastro_sel on public.alm_bom_itens_cadastro;
create policy alm_bom_itens_cadastro_sel on public.alm_bom_itens_cadastro
  for select to authenticated using (true);

drop policy if exists alm_bom_itens_cadastro_ins on public.alm_bom_itens_cadastro;
create policy alm_bom_itens_cadastro_ins on public.alm_bom_itens_cadastro
  for insert to authenticated with check (auth.uid() is not null);

drop policy if exists alm_bom_itens_cadastro_upd on public.alm_bom_itens_cadastro;
create policy alm_bom_itens_cadastro_upd on public.alm_bom_itens_cadastro
  for update to authenticated using (true) with check (auth.uid() is not null);

-- O schema concede tudo por padrão; aqui só leitura, inclusão e atualização.
revoke all on public.alm_bom_itens_cadastro from anon, authenticated;
grant select, insert, update on public.alm_bom_itens_cadastro to authenticated;

notify pgrst, 'reload schema';
