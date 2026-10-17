-- =====================================================================
-- Almoxarifado > Inventário Cíclico — linhas históricas importadas.
--
-- A planilha antiga pode ter mais de uma linha para o mesmo material e
-- depósito no mesmo dia. Cada linha continua sendo uma evidência independente
-- do inventário, identificada pela linha original da planilha. Itens criados
-- normalmente pela aplicação preservam a regra de uma linha por material ×
-- depósito.
-- =====================================================================

alter table public.alm_inventarios
  add column if not exists origem text not null default 'manual',
  add column if not exists lote_importacao text;

alter table public.alm_inventario_itens
  add column if not exists origem_linha integer,
  add column if not exists dados_origem jsonb;

alter table public.alm_inventario_itens
  drop constraint if exists alm_inventario_itens_inventario_id_material_deposito_key;

-- Regra operacional dos itens criados pela tela.
create unique index if not exists uq_alm_inv_item_manual_material_deposito
  on public.alm_inventario_itens (inventario_id, material, deposito)
  where origem_linha is null;

-- Uma linha importada só pode entrar uma vez em seu inventário de origem.
create unique index if not exists uq_alm_inv_item_importado_linha
  on public.alm_inventario_itens (inventario_id, origem_linha)
  where origem_linha is not null;

-- Impede a repetição acidental do mesmo dia de um lote histórico.
create unique index if not exists uq_alm_inventarios_lote_data
  on public.alm_inventarios (lote_importacao, data)
  where lote_importacao is not null;

comment on column public.alm_inventario_itens.origem_linha is
  'Linha da planilha-fonte, usada somente para evidências históricas importadas.';
comment on column public.alm_inventario_itens.dados_origem is
  'Valores originais da planilha que não pertencem ao fluxo operacional atual.';
