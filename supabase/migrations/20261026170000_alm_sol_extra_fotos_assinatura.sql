-- =====================================================================
-- Solicitação Extraordinária — fotos dos itens, assinatura de quem retira
-- e admins avisados de toda retirada sem saldo
-- =====================================================================
-- * `fotos`: [{ path, nome, tipo }] no bucket `alm-recebimento` (privado, só
--   imagem, já registrado na fila offline), pasta `solicitacao-extra/<id>/`.
--   Comprimidas e carimbadas com data/hora no aparelho antes de subir.
-- * `assinatura_retirante`: PNG (data URL) desenhado na tela por quem retira
--   — mesmo formato da Ficha de EPI, cabe no insert único da fila offline.
-- * Aprovação: o admin já aprovava pela RPC; agora também é avisado de toda
--   retirada sem saldo, junto com os aprovadores do setor.

alter table public.alm_solicitacao_extra
  add column if not exists fotos jsonb not null default '[]'::jsonb,
  add column if not exists assinatura_retirante text,
  add column if not exists assinatura_retirante_em timestamptz;

alter table public.alm_solicitacao_extra drop constraint if exists alm_sol_extra_fotos_chk;
alter table public.alm_solicitacao_extra
  add constraint alm_sol_extra_fotos_chk check (jsonb_typeof(fotos) = 'array' and jsonb_array_length(fotos) <= 12);

-- Data URL de PNG e tamanho de assinatura (não de foto).
alter table public.alm_solicitacao_extra drop constraint if exists alm_sol_extra_assinatura_chk;
alter table public.alm_solicitacao_extra
  add constraint alm_sol_extra_assinatura_chk check (
    assinatura_retirante is null
    or (assinatura_retirante like 'data:image/png;base64,%' and length(assinatura_retirante) <= 400000)
  );

-- Aprovadores do setor + admins (sem duplicar quem é as duas coisas).
create or replace function public.alm_sol_extra_aprovadores(p_setor text)
returns text[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(array_agg(distinct id), '{}')
    from public.core_perfis
   where coalesce(status, 'ativo') not in ('inativo', 'pendente')
     and ('admin' = any(roles) or aprovador_setores ? p_setor)
$$;

revoke all on function public.alm_sol_extra_aprovadores(text) from public, anon;
