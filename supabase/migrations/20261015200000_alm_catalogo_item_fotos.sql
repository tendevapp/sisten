-- =====================================================================
-- Almoxarifado > Catálogo de Itens: fotos adicionais do item.
--
-- O item do catálogo tem UMA foto principal (`alm_catalogo_itens.imagem_path`),
-- que o Recebimento também alimenta (fotos do recebimento viram a foto do
-- catálogo). As fotos adicionais ficam nesta tabela, à parte, de propósito:
-- são inseridas e removidas só na tela de Cadastro de Itens e NÃO vêm do
-- Recebimento — nada que o Recebimento faz toca esta tabela.
--
-- Arquivos no mesmo bucket da foto principal (`request-attachments`, pasta
-- `almox-catalogo/`), que já permite leitura, inclusão e remoção aos usuários
-- autenticados.
--
-- Cadastro compartilhado do almoxarifado: qualquer autenticado lê, inclui e
-- remove (como a troca da foto principal). Desativar o item não apaga estas
-- linhas — o app as remove junto com os arquivos ao excluir o item.
-- =====================================================================

create table if not exists public.alm_catalogo_item_fotos (
  id uuid primary key default gen_random_uuid(),
  catalogo_item_id uuid not null references public.alm_catalogo_itens(id) on delete cascade,
  imagem_path text not null,
  imagem_nome text,
  imagem_mime text,
  imagem_tamanho integer,
  ordem integer not null default 0,
  criado_por text,
  criado_por_nome text,
  created_at timestamptz not null default now()
);

create index if not exists idx_alm_catalogo_item_fotos_item
  on public.alm_catalogo_item_fotos (catalogo_item_id, ordem, created_at);

alter table public.alm_catalogo_item_fotos enable row level security;

drop policy if exists alm_catalogo_item_fotos_sel on public.alm_catalogo_item_fotos;
create policy alm_catalogo_item_fotos_sel on public.alm_catalogo_item_fotos
  for select to authenticated using (true);

drop policy if exists alm_catalogo_item_fotos_ins on public.alm_catalogo_item_fotos;
create policy alm_catalogo_item_fotos_ins on public.alm_catalogo_item_fotos
  for insert to authenticated with check (auth.uid() is not null);

drop policy if exists alm_catalogo_item_fotos_del on public.alm_catalogo_item_fotos;
create policy alm_catalogo_item_fotos_del on public.alm_catalogo_item_fotos
  for delete to authenticated using (auth.uid() is not null);

-- O schema concede tudo por padrão; aqui só leitura, inclusão e remoção.
revoke all on public.alm_catalogo_item_fotos from anon, authenticated;
grant select, insert, delete on public.alm_catalogo_item_fotos to authenticated;

notify pgrst, 'reload schema';
