-- =====================================================================
-- SSMA — Ficha de EPI (FRM.SEG-0008, Termo de Responsabilidade de EPI)
--
-- Cada lançamento é uma ficha: uma entrega a um colaborador, assinada por
-- ele. Várias fichas do mesmo colaborador compõem o histórico que a tela
-- consulta ("há quantos dias pegou") e a base da análise de consumo.
--
-- A ficha assinada é documento: o cliente só insere pela RPC de criação e,
-- depois disso, as únicas mudanças possíveis são a devolução de um item e o
-- cancelamento (autor ou admin), ambas por RPC que grava quem e quando.
-- Não há UPDATE/DELETE direto nas tabelas.
--
-- O colaborador, a função e o EPI são gravados como snapshot (nome, cargo,
-- CA, código SAP...) além das FKs: o Book e o RH mudam, a ficha impressa não.
-- =====================================================================

create table public.ssma_fichas_epi (
  id uuid primary key default gen_random_uuid(),
  -- EPI-DDMMYY-NN, índice reiniciado por mês (ver ssmaFichaEpiApi.ts).
  codigo text not null unique,
  pessoa_id uuid not null references public.rh_pessoas(id) on delete restrict,
  registro text not null,
  nome text not null,
  cargo_rh text,
  setor text,
  funcao_id uuid not null references public.ssma_epi_funcoes(id) on delete restrict,
  funcao_nome text not null,
  data_admissao date,
  data_demissao date,
  data_entrega date not null default current_date,
  assinatura_colaborador text not null
    check (assinatura_colaborador like 'data:image/png;base64,%'),
  assinado_em timestamptz not null default now(),
  observacoes text,
  status text not null default 'ATIVA' check (status in ('ATIVA', 'CANCELADA')),
  cancelamento_motivo text,
  cancelado_por text,
  cancelado_por_nome text,
  cancelado_em timestamptz,
  criado_por text not null default (auth.uid())::text,
  criado_por_nome text,
  created_at timestamptz not null default now()
);

create index ssma_fichas_epi_pessoa_idx on public.ssma_fichas_epi (pessoa_id, data_entrega desc);
create index ssma_fichas_epi_data_idx on public.ssma_fichas_epi (data_entrega desc);
create index ssma_fichas_epi_funcao_idx on public.ssma_fichas_epi (funcao_id);

create table public.ssma_fichas_epi_itens (
  id uuid primary key default gen_random_uuid(),
  ficha_id uuid not null references public.ssma_fichas_epi(id) on delete cascade,
  ordem smallint not null default 0,
  epi_book_id uuid references public.ssma_book_epis(id) on delete restrict,
  requisito_id uuid references public.ssma_epi_por_funcao(id) on delete set null,
  -- Chave de agrupamento da análise: tamanhos diferentes do mesmo EPI contam
  -- como o mesmo item consumido.
  grupo_epi text not null,
  categoria text,
  descricao text not null,
  ca text,
  codigo_sap text,
  tamanho text,
  quantidade numeric(10, 2) not null check (quantidade > 0),
  -- Legenda M.E.D. do formulário: 1 Admissão, 2 Substituição por dano
  -- justificado, 3 Substituição por dano injustificado/perda,
  -- 4 Mudança de função/Necessidade primária.
  motivo smallint not null check (motivo between 1 and 4),
  -- Entregue sem constar da matriz EPI por função do colaborador.
  fora_da_matriz boolean not null default false,
  data_devolucao date,
  devolucao_observacao text,
  devolucao_registrada_por text,
  devolucao_registrada_por_nome text,
  devolucao_registrada_em timestamptz,
  created_at timestamptz not null default now()
);

create index ssma_fichas_epi_itens_ficha_idx on public.ssma_fichas_epi_itens (ficha_id, ordem);
create index ssma_fichas_epi_itens_grupo_idx on public.ssma_fichas_epi_itens (grupo_epi);
create index ssma_fichas_epi_itens_book_idx on public.ssma_fichas_epi_itens (epi_book_id) where epi_book_id is not null;
create index ssma_fichas_epi_itens_requisito_idx on public.ssma_fichas_epi_itens (requisito_id) where requisito_id is not null;

-- ---------------------------------------------------------------------
-- Acesso: mesmas regras do Book/EPI por função (quem acessa SSMA lê e
-- lança). Escrita de cliente só em INSERT, e o INSERT só no nome próprio.
-- ---------------------------------------------------------------------
revoke all on table public.ssma_fichas_epi, public.ssma_fichas_epi_itens from anon, authenticated;
grant select, insert on table public.ssma_fichas_epi, public.ssma_fichas_epi_itens to authenticated;

alter table public.ssma_fichas_epi enable row level security;
alter table public.ssma_fichas_epi_itens enable row level security;

create policy ssma_fichas_epi_select on public.ssma_fichas_epi for select to authenticated
using ((select public.ssma_book_epis_pode_acessar()));
create policy ssma_fichas_epi_insert on public.ssma_fichas_epi for insert to authenticated
with check (
  (select public.ssma_book_epis_pode_acessar())
  and criado_por = (select auth.uid())::text
  and status = 'ATIVA'
);

create policy ssma_fichas_epi_itens_select on public.ssma_fichas_epi_itens for select to authenticated
using ((select public.ssma_book_epis_pode_acessar()));
create policy ssma_fichas_epi_itens_insert on public.ssma_fichas_epi_itens for insert to authenticated
with check (
  (select public.ssma_book_epis_pode_acessar())
  and data_devolucao is null
  and exists (
    select 1 from public.ssma_fichas_epi f
     where f.id = ficha_id and f.criado_por = (select auth.uid())::text
  )
);

-- ---------------------------------------------------------------------
-- Criação atômica: cabeçalho + itens na mesma transação. SECURITY INVOKER,
-- então as policies acima continuam valendo.
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
begin
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'A ficha precisa de ao menos um EPI.' using errcode = '22023';
  end if;

  select name into v_nome_autor from public.core_perfis where id = (auth.uid())::text;

  insert into public.ssma_fichas_epi (
    codigo, pessoa_id, registro, nome, cargo_rh, setor, funcao_id, funcao_nome,
    data_admissao, data_demissao, data_entrega, assinatura_colaborador,
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
    p_ficha ->> 'assinatura_colaborador',
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
-- Devolução (colunas DEVOLUÇÃO / ASS. DO TST do formulário). Qualquer
-- usuário do SSMA registra — normalmente é o técnico, não quem entregou.
-- Desfazer (p_data nulo) só quem registrou ou admin.
-- ---------------------------------------------------------------------
create or replace function public.ssma_ficha_epi_registrar_devolucao(
  p_item_id uuid,
  p_data date,
  p_observacao text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_item record;
  v_uid text := (auth.uid())::text;
begin
  if not public.ssma_book_epis_pode_acessar() then
    raise exception 'Sem acesso ao SSMA.' using errcode = '42501';
  end if;

  select i.id, i.devolucao_registrada_por, f.data_entrega, f.status
    into v_item
    from public.ssma_fichas_epi_itens i
    join public.ssma_fichas_epi f on f.id = i.ficha_id
   where i.id = p_item_id
   for update of i;

  if not found then
    raise exception 'Item da ficha não encontrado.' using errcode = 'P0002';
  end if;
  if v_item.status <> 'ATIVA' then
    raise exception 'Ficha cancelada não aceita devolução.' using errcode = '22023';
  end if;

  if p_data is null then
    if not (public.has_role('admin') or v_item.devolucao_registrada_por = v_uid) then
      raise exception 'Só quem registrou a devolução ou um administrador pode desfazê-la.' using errcode = '42501';
    end if;
    update public.ssma_fichas_epi_itens
       set data_devolucao = null, devolucao_observacao = null,
           devolucao_registrada_por = null, devolucao_registrada_por_nome = null,
           devolucao_registrada_em = null
     where id = p_item_id;
    return;
  end if;

  if p_data < v_item.data_entrega then
    raise exception 'A devolução não pode ser anterior à entrega.' using errcode = '22023';
  end if;

  update public.ssma_fichas_epi_itens
     set data_devolucao = p_data,
         devolucao_observacao = nullif(trim(coalesce(p_observacao, '')), ''),
         devolucao_registrada_por = v_uid,
         devolucao_registrada_por_nome = (select name from public.core_perfis where id = v_uid),
         devolucao_registrada_em = now()
   where id = p_item_id;
end;
$$;

revoke all on function public.ssma_ficha_epi_registrar_devolucao(uuid, date, text) from public, anon;
grant execute on function public.ssma_ficha_epi_registrar_devolucao(uuid, date, text) to authenticated;

-- ---------------------------------------------------------------------
-- Cancelamento: autor ou admin, com motivo. A ficha continua visível e
-- sai da análise de consumo.
-- ---------------------------------------------------------------------
create or replace function public.ssma_ficha_epi_cancelar(p_ficha_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ficha record;
  v_uid text := (auth.uid())::text;
begin
  if nullif(trim(coalesce(p_motivo, '')), '') is null then
    raise exception 'Informe o motivo do cancelamento.' using errcode = '22023';
  end if;

  select id, criado_por, status into v_ficha
    from public.ssma_fichas_epi where id = p_ficha_id for update;

  if not found then
    raise exception 'Ficha não encontrada.' using errcode = 'P0002';
  end if;
  if not (public.has_role('admin') or v_ficha.criado_por = v_uid) then
    raise exception 'Só o autor da ficha ou um administrador pode cancelá-la.' using errcode = '42501';
  end if;
  if v_ficha.status = 'CANCELADA' then
    return;
  end if;

  update public.ssma_fichas_epi
     set status = 'CANCELADA',
         cancelamento_motivo = trim(p_motivo),
         cancelado_por = v_uid,
         cancelado_por_nome = (select name from public.core_perfis where id = v_uid),
         cancelado_em = now()
   where id = p_ficha_id;
end;
$$;

revoke all on function public.ssma_ficha_epi_cancelar(uuid, text) from public, anon;
grant execute on function public.ssma_ficha_epi_cancelar(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- Base da análise de consumo: uma linha por EPI entregue em ficha ativa.
-- security_invoker para herdar a RLS das tabelas.
-- ---------------------------------------------------------------------
create view public.ssma_fichas_epi_consumo
with (security_invoker = true) as
select
  i.id as item_id,
  f.id as ficha_id,
  f.codigo,
  f.pessoa_id,
  f.registro,
  f.nome,
  f.setor,
  f.funcao_id,
  f.funcao_nome,
  f.data_entrega,
  i.epi_book_id,
  i.grupo_epi,
  i.categoria,
  i.descricao,
  i.ca,
  i.codigo_sap,
  i.tamanho,
  i.quantidade,
  i.motivo,
  i.fora_da_matriz,
  i.data_devolucao
from public.ssma_fichas_epi_itens i
join public.ssma_fichas_epi f on f.id = i.ficha_id
where f.status = 'ATIVA';

revoke all on public.ssma_fichas_epi_consumo from anon, authenticated;
grant select on public.ssma_fichas_epi_consumo to authenticated;

notify pgrst, 'reload schema';
