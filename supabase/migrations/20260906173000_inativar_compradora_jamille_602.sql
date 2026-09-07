-- =====================================================================
-- Inativação da compradora Jamille (código 602)
--
-- Adiciona a coluna 'ativo' na tabela sup_compradores e na view compradores.
-- Marca o código '602' (Jamille) como inativo (ativo = false).
-- Inativa quaisquer vínculos remanescentes do grupo comprador 602 em
-- sup_grupo_comprador_mercadorias.
-- =====================================================================

-- 1. Coluna ativo em sup_compradores
alter table public.sup_compradores add column if not exists ativo boolean not null default true;

-- 2. Atualizar view compradores para incluir a coluna ativo
create or replace view public.compradores as
  select grupo_compras, nome_comprador, usuario_sistema, email, ativo
  from public.sup_compradores;

-- 3. Inativar Jamille (602)
update public.sup_compradores
set ativo = false,
    usuario_sistema = trim(usuario_sistema),
    email = trim(email)
where grupo_compras = '602';

-- 4. Inativar vínculos de 602 em sup_grupo_comprador_mercadorias
update public.sup_grupo_comprador_mercadorias
set ativo = false
where grupo_compras = '602';
