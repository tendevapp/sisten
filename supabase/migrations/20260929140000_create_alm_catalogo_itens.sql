-- =====================================================================
-- Almoxarifado > Catálogo de Itens (FRM.ALM-0016).
--
-- O vínculo foto × material ficava só no localStorage de quem cadastrou:
-- a foto subia ao Storage, mas nenhum outro usuário ou aparelho sabia a que
-- material ela pertencia. Esta tabela é o catálogo compartilhado.
--
-- As fotos continuam no bucket `request-attachments`, pasta `almox-catalogo/`
-- (já tem leitura/inclusão/remoção para autenticados e é de onde Compras
-- abre a imagem como anexo). Esta versão substitui a primeira deste arquivo,
-- que nunca foi aplicada e criava um bucket próprio sem uso no código.
--
-- Um registro ativo por material (`codigo_sap`); excluir é desativar
-- (`ativo = false`), e o material pode voltar ao catálogo com registro novo.
--
-- Código `CAT-DDMMYY-NN` (regra 2 do CLAUDE.md), índice reiniciando POR DIA,
-- gerado no banco pelo trigger abaixo quando o cliente não manda — assim
-- dois aparelhos cadastrando ao mesmo tempo não disputam o mesmo número.
--
-- Cadastro compartilhado do almoxarifado: qualquer usuário autenticado lê,
-- inclui e atualiza (troca de foto é o uso normal). Não há DELETE.
-- =====================================================================

create table if not exists public.alm_catalogo_itens (
  id uuid primary key default gen_random_uuid(),
  codigo_registro text not null unique,
  codigo_sap text not null,
  descricao text not null,
  texto_tecnico text,
  grp_mercad text,
  grupo_mercadorias text,
  classificacao_nivel1 text,
  classificacao_nivel2 text,
  umb text,
  saldo_zl0024 numeric,
  imagem_path text,
  imagem_nome text,
  imagem_mime text,
  imagem_tamanho integer,
  observacao text,
  ativo boolean not null default true,
  criado_por text,
  criado_por_nome text,
  atualizado_por text,
  atualizado_por_nome text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_alm_catalogo_itens_sap_ativo
  on public.alm_catalogo_itens (codigo_sap) where ativo;

-- ---------------------------------------------------------------------
-- Código e updated_at
-- ---------------------------------------------------------------------
create or replace function public.alm_catalogo_itens_antes_gravar()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_ddmmyy text;
  v_max int;
begin
  if tg_op = 'INSERT' and coalesce(trim(new.codigo_registro), '') = '' then
    -- Serializa a geração do dia: sem isso, dois inserts simultâneos leem o
    -- mesmo máximo e o segundo cai no unique.
    perform pg_advisory_xact_lock(hashtext('alm_catalogo_itens_codigo'));
    v_ddmmyy := to_char((now() at time zone 'America/Bahia')::date, 'DDMMYY');
    select coalesce(max((regexp_match(codigo_registro, '^CAT-\d{6}-(\d+)$'))[1]::int), 0)
      into v_max
      from public.alm_catalogo_itens
     where codigo_registro like 'CAT-' || v_ddmmyy || '-%';
    new.codigo_registro := 'CAT-' || v_ddmmyy || '-' || lpad((v_max + 1)::text, 2, '0');
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_alm_catalogo_itens_antes_gravar on public.alm_catalogo_itens;
create trigger trg_alm_catalogo_itens_antes_gravar
  before insert or update on public.alm_catalogo_itens
  for each row execute function public.alm_catalogo_itens_antes_gravar();

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.alm_catalogo_itens enable row level security;

drop policy if exists alm_catalogo_itens_sel on public.alm_catalogo_itens;
create policy alm_catalogo_itens_sel on public.alm_catalogo_itens
  for select to authenticated using (true);

drop policy if exists alm_catalogo_itens_ins on public.alm_catalogo_itens;
create policy alm_catalogo_itens_ins on public.alm_catalogo_itens
  for insert to authenticated with check (auth.uid() is not null);

drop policy if exists alm_catalogo_itens_upd on public.alm_catalogo_itens;
create policy alm_catalogo_itens_upd on public.alm_catalogo_itens
  for update to authenticated using (true) with check (auth.uid() is not null);

revoke all on public.alm_catalogo_itens from anon;
revoke delete on public.alm_catalogo_itens from authenticated;
grant select, insert, update on public.alm_catalogo_itens to authenticated;

notify pgrst, 'reload schema';
