-- =====================================================================
-- SSMA — Ficha de EPI: lançar e fechar com a assinatura PENDENTE
--
-- O EPI já foi entregue mas o colaborador ainda não assinou (ex.: retirou
-- na correria do turno). A ficha é gravada sem imagem, marcada
-- `assinatura_pendente = true`, e a assinatura é coletada depois pela RPC
-- `ssma_ficha_epi_assinar` — uma única vez, depois disso a ficha volta a ser
-- documento imutável como sempre.
--
-- Regra que continua valendo: ficha DIGITAL sem assinatura só existe enquanto
-- estiver pendente; assinada, a imagem PNG é obrigatória.
-- =====================================================================

alter table public.ssma_fichas_epi
  add column if not exists assinatura_pendente boolean not null default false;

-- Pendente ainda não tem hora de assinatura.
alter table public.ssma_fichas_epi alter column assinado_em drop not null;
alter table public.ssma_fichas_epi alter column assinado_em drop default;

alter table public.ssma_fichas_epi drop constraint if exists ssma_fichas_epi_assinatura_check;
alter table public.ssma_fichas_epi
  add constraint ssma_fichas_epi_assinatura_check check (
    origem = 'HISTORICO_PAPEL'
    or (assinatura_pendente and assinatura_colaborador is null)
    or (not assinatura_pendente
        and coalesce(assinatura_colaborador like 'data:image/png;base64,%', false))
  );

create index if not exists ssma_fichas_epi_pendente_idx
  on public.ssma_fichas_epi (data_entrega desc) where assinatura_pendente and status = 'ATIVA';

-- ---------------------------------------------------------------------
-- Criação: aceita `assinatura_pendente = true` no cabeçalho (sem imagem).
-- Igual à versão de 20260921223627, exceto pela assinatura.
-- ---------------------------------------------------------------------
create or replace function public.ssma_ficha_epi_criar(p_ficha jsonb, p_itens jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_nome_autor text;
  v_pendente boolean := coalesce((p_ficha ->> 'assinatura_pendente')::boolean, false);
begin
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'A ficha precisa de ao menos um EPI.' using errcode = '22023';
  end if;

  select name into v_nome_autor from public.core_perfis where id = (auth.uid())::text;

  insert into public.ssma_fichas_epi (
    codigo, pessoa_id, registro, nome, cargo_rh, setor, funcao_id, funcao_nome,
    data_admissao, data_demissao, data_entrega, assinatura_colaborador,
    assinatura_pendente, assinado_em,
    observacoes, criado_por, criado_por_nome
  ) values (
    p_ficha ->> 'codigo',
    (p_ficha ->> 'pessoa_id')::uuid,
    p_ficha ->> 'registro',
    p_ficha ->> 'nome',
    nullif(p_ficha ->> 'cargo_rh', ''),
    nullif(p_ficha ->> 'setor', ''),
    (p_ficha ->> 'funcao_id')::uuid,
    p_ficha ->> 'funcao_nome',
    nullif(p_ficha ->> 'data_admissao', '')::date,
    nullif(p_ficha ->> 'data_demissao', '')::date,
    coalesce(nullif(p_ficha ->> 'data_entrega', '')::date, current_date),
    case when v_pendente then null else p_ficha ->> 'assinatura_colaborador' end,
    v_pendente,
    case when v_pendente then null else now() end,
    nullif(p_ficha ->> 'observacoes', ''),
    (auth.uid())::text,
    v_nome_autor
  )
  returning id into v_id;

  insert into public.ssma_fichas_epi_itens (
    ficha_id, ordem, epi_book_id, requisito_id, grupo_epi, categoria, descricao,
    ca, codigo_sap, tamanho, quantidade, motivo, fora_da_matriz
  )
  select
    v_id,
    (item.ordinality - 1)::smallint,
    nullif(item.value ->> 'epi_book_id', '')::uuid,
    nullif(item.value ->> 'requisito_id', '')::uuid,
    item.value ->> 'grupo_epi',
    nullif(item.value ->> 'categoria', ''),
    item.value ->> 'descricao',
    nullif(item.value ->> 'ca', ''),
    nullif(item.value ->> 'codigo_sap', ''),
    nullif(item.value ->> 'tamanho', ''),
    (item.value ->> 'quantidade')::numeric,
    (item.value ->> 'motivo')::smallint,
    coalesce((item.value ->> 'fora_da_matriz')::boolean, false)
  from jsonb_array_elements(p_itens) with ordinality as item(value, ordinality);

  return v_id;
end;
$$;

revoke all on function public.ssma_ficha_epi_criar(jsonb, jsonb) from public, anon;
grant execute on function public.ssma_ficha_epi_criar(jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- Assinar depois: qualquer usuário do SSMA coleta a assinatura de uma ficha
-- pendente (normalmente quem está com o colaborador na frente). Só ficha
-- ATIVA e ainda pendente; grava a imagem e a hora e trava de novo.
-- ---------------------------------------------------------------------
create or replace function public.ssma_ficha_epi_assinar(p_ficha_id uuid, p_assinatura text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ficha record;
begin
  if not public.ssma_book_epis_pode_acessar() then
    raise exception 'Sem acesso ao SSMA.' using errcode = '42501';
  end if;
  if coalesce(p_assinatura like 'data:image/png;base64,%', false) is not true then
    raise exception 'Assinatura inválida.' using errcode = '22023';
  end if;

  select id, status, assinatura_pendente into v_ficha
    from public.ssma_fichas_epi where id = p_ficha_id for update;

  if not found then
    raise exception 'Ficha não encontrada.' using errcode = 'P0002';
  end if;
  if v_ficha.status <> 'ATIVA' then
    raise exception 'Ficha cancelada não pode ser assinada.' using errcode = '22023';
  end if;
  if not v_ficha.assinatura_pendente then
    raise exception 'Esta ficha já está assinada.' using errcode = '22023';
  end if;

  update public.ssma_fichas_epi
     set assinatura_colaborador = p_assinatura,
         assinatura_pendente = false,
         assinado_em = now()
   where id = p_ficha_id;
end;
$$;

revoke all on function public.ssma_ficha_epi_assinar(uuid, text) from public, anon;
grant execute on function public.ssma_ficha_epi_assinar(uuid, text) to authenticated;

notify pgrst, 'reload schema';
