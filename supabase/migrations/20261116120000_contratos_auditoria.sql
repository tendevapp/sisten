-- Auditoria de contratos (Suprimentos › Contratos › Auditoria).
--
-- Cruza o contrato (ME3N) com o que o Financeiro lançou e pagou (FBL1N).
-- A FBL1N chega com "Documento de compras" vazio em todas as linhas, então o
-- vínculo é indireto:
--
--   contrato (ME3N) → pedidos de call-off (ZL0132.contrato; ME2L.contrato_basico
--   para os ~67% que faltam na ZL0132) → MIRO (ZL0170.numero_pedido) →
--   documento contábil (ZL0170.numero_doc_contabil = FBL1N.numero_documento).
--
-- A ZL0170 cruza cada MIRO com cada MIGO do pedido (10 MIGOs = 10 linhas com o
-- mesmo montante_miro), então ela entra só como PONTE. Valor lançado e pago vem
-- da FBL1N deduplicada. O valor da MIRO só é estimado (distintos por
-- pedido/item/montante/qtd) para quem não tem partida na FBL1N extraída.
--
-- Valor do pedido: ZL0132 (soma por item + linha de divisão, sem eliminados);
-- sem ZL0132, o valor líquido do item na ZL0170 — a ME2L não traz valor nesses
-- pedidos de serviço (qtd 1, valor nulo).
--
-- Alterações de valor: a ME3N é importada por upsert (documento, item), então
-- um gatilho compara a linha antiga com a nova e grava o que mudou em
-- sup_contratos_alteracoes. O mesmo para os campos editados à mão no cadastro
-- (contratos_detalhes). O histórico começa a partir desta migration.

create index if not exists idx_sap_zl0132_po_contrato on public.sap_zl0132_po (contrato);

-- ---------------------------------------------------------------------------
-- 1. Pedidos de call-off por contrato
-- ---------------------------------------------------------------------------
create or replace view public.vw_contratos_aud_pedidos
with (security_invoker = true) as
with contratos as (
  select distinct documento_compras as contrato
  from public.sap_me3n_contrato
  where documento_compras is not null
),
zl_linhas as (
  select z.contrato,
         z.doc_compra as pedido,
         z.item,
         z.itm_liberacao,
         max(z.valor_liquido) as valor,
         bool_or(upper(btrim(coalesce(z.eflag_e, ''))) = 'L') as eliminado,
         min(z.data_doc) as data_pedido,
         max(z.modificado_em) as modificado_em,
         max(z.fornecedor_codigo) as fornecedor_codigo,
         max(z.fornecedor_nome) as fornecedor_nome,
         max(z.txt_breve) as texto
  from public.sap_zl0132_po z
  join contratos c on c.contrato = z.contrato
  where z.doc_compra is not null
  group by 1, 2, 3, 4
),
zl as (
  select contrato, pedido,
         'ZL0132'::text as origem,
         coalesce(sum(valor) filter (where not eliminado), 0) as valor,
         'ZL0132'::text as valor_fonte,
         coalesce(sum(valor) filter (where eliminado), 0) as valor_eliminado,
         min(data_pedido) as data_pedido,
         max(modificado_em) as modificado_em,
         max(fornecedor_codigo) as fornecedor_codigo,
         max(fornecedor_nome) as fornecedor_nome,
         max(texto) as texto
  from zl_linhas
  group by 1, 2
),
miro_valor as (
  select numero_pedido, sum(v) as valor
  from (
    select numero_pedido, item, max(valor_liquido) as v
    from public.sap_zl0170_miro
    where numero_pedido is not null
    group by 1, 2
  ) x
  group by 1
),
me2l as (
  select m.contrato_basico as contrato,
         m.documento_compras as pedido,
         'ME2L'::text as origem,
         sum(m.valor_liquido_pedido) as valor_me2l,
         min(m.data_documento) as data_pedido,
         max(m.fornecedor) as fornecedor,
         max(m.texto_breve) as texto
  from public.sap_me2l_pedido m
  join contratos c on c.contrato = m.contrato_basico
  where m.documento_compras is not null
    and upper(btrim(coalesce(m.codigo_eliminacao, ''))) <> 'L'
    and not exists (select 1 from public.sap_zl0132_po z where z.doc_compra = m.documento_compras)
  group by 1, 2
)
select contrato, pedido, origem, valor, valor_fonte, valor_eliminado, data_pedido,
       modificado_em, fornecedor_codigo, fornecedor_nome, texto
from zl
union all
select e.contrato, e.pedido, e.origem,
       coalesce(e.valor_me2l, mv.valor) as valor,
       case when e.valor_me2l is not null then 'ME2L'
            when mv.valor is not null then 'ZL0170'
            else null end as valor_fonte,
       0::numeric as valor_eliminado,
       e.data_pedido,
       null::timestamptz as modificado_em,
       split_part(btrim(e.fornecedor), ' ', 1) as fornecedor_codigo,
       nullif(btrim(substr(btrim(e.fornecedor), length(split_part(btrim(e.fornecedor), ' ', 1)) + 1)), '') as fornecedor_nome,
       e.texto
from me2l e
left join miro_valor mv on mv.numero_pedido = e.pedido;

comment on view public.vw_contratos_aud_pedidos is
  'Auditoria de contratos: pedidos de call-off por contrato (ZL0132 + ME2L), com valor e origem do valor.';

-- ---------------------------------------------------------------------------
-- 2. FBL1N deduplicada com marca de partida anulada
-- ---------------------------------------------------------------------------
-- Estorno de MIRO (MR8M, texto "/TCNH/MONITOR") gera um RE positivo que é
-- compensado contra o RE original num documento 65xxxx, sem pagamento. As
-- duas partidas aparecem "compensadas" — sem esta marca, o original contava
-- como lançado e pago, e o relançamento da mesma NF parecia duplicidade.
-- Regra: grupo (fornecedor, doc. de compensação) com líquido zero, com crédito
-- que não é pagamento (KZ/ZP) e sem pagamento no grupo.
create or replace view public.vw_contratos_aud_fbl1n
with (security_invoker = true) as
with g as (
  select f.*,
         sum(f.montante_moeda_doc) over w as liquido_compensacao,
         bool_or(f.montante_moeda_doc > 0 and coalesce(f.tipo_documento, '') not in ('KZ', 'ZP')) over w as tem_credito,
         bool_or(coalesce(f.tipo_documento, '') in ('KZ', 'ZP')) over w as tem_pagamento
  from public.vw_fin_fbl1n_deduplicado f
  window w as (partition by f.fornecedor, nullif(btrim(f.doc_compensacao), ''))
)
select g.id, g.empresa, g.numero_documento, g.tipo_documento, g.montante_moeda_doc, g.montante_irf,
       g.referencia, g.data_documento, g.data_lancamento, g.vencimento_liquido,
       g.data_compensacao, g.doc_compensacao, g.bloqueio_pagamento, g.estorno_com,
       g.fornecedor, g.razao_social_fornecedor, g.texto,
       (nullif(btrim(g.doc_compensacao), '') is not null
        and abs(coalesce(g.liquido_compensacao, 0)) < 0.01
        and g.tem_credito and not g.tem_pagamento) as anulada
from g;

comment on view public.vw_contratos_aud_fbl1n is
  'FBL1N deduplicada com a marca "anulada": compensada contra crédito/estorno (MR8M) sem pagamento no grupo.';

-- ---------------------------------------------------------------------------
-- 3. Partidas da FBL1N vinculadas ao contrato via MIRO
-- ---------------------------------------------------------------------------
-- Uma linha por (contrato, MIRO, partida FBL1N). MIRO sem partida na FBL1N
-- extraída aparece uma vez com as colunas da FBL1N nulas.
create or replace view public.vw_contratos_aud_partidas
with (security_invoker = true) as
with ped as (
  select distinct contrato, pedido from public.vw_contratos_aud_pedidos
),
miro as (
  select p.contrato, m.doc_miro, m.ano_miro,
         max(m.numero_doc_contabil) as numero_doc_contabil,
         string_agg(distinct m.numero_pedido, ', ') as pedidos,
         max(m.referencia) as referencia_miro,
         min(m.data_lancamento_miro) as data_lancamento_miro,
         max(m.doc_pagamento) as doc_pagamento_miro,
         max(m.data_pagamento) as data_pagamento_miro,
         max(m.fornecedor) as fornecedor_miro
  from public.sap_zl0170_miro m
  join ped p on p.pedido = m.numero_pedido
  where m.doc_miro is not null
  group by 1, 2, 3
),
miro_valor as (
  select contrato, doc_miro, ano_miro, sum(montante_miro) as valor
  from (
    select distinct p.contrato, m.doc_miro, m.ano_miro, m.numero_pedido, m.item, m.montante_miro, m.qtd_miro
    from public.sap_zl0170_miro m
    join ped p on p.pedido = m.numero_pedido
    where m.doc_miro is not null
  ) d
  group by 1, 2, 3
)
select mi.contrato, mi.pedidos, mi.doc_miro, mi.ano_miro, mi.numero_doc_contabil,
       mi.referencia_miro, mi.data_lancamento_miro, mv.valor as valor_miro_estimado,
       mi.doc_pagamento_miro, mi.data_pagamento_miro, mi.fornecedor_miro,
       f.id as fbl_id, f.empresa, f.tipo_documento, f.montante_moeda_doc, f.montante_irf,
       f.referencia, f.data_documento, f.data_lancamento, f.vencimento_liquido,
       f.data_compensacao, f.doc_compensacao, f.bloqueio_pagamento,
       f.fornecedor, f.razao_social_fornecedor, f.texto, f.estorno_com, f.anulada
from miro mi
left join miro_valor mv
  on mv.contrato = mi.contrato and mv.doc_miro = mi.doc_miro and mv.ano_miro is not distinct from mi.ano_miro
left join public.vw_contratos_aud_fbl1n f
  on f.numero_documento = mi.numero_doc_contabil
 and (mi.ano_miro is null or f.data_lancamento is null
      or extract(year from f.data_lancamento)::int::text = mi.ano_miro);

comment on view public.vw_contratos_aud_partidas is
  'Auditoria de contratos: MIROs dos pedidos do contrato e as partidas FBL1N do documento contábil.';

-- ---------------------------------------------------------------------------
-- 4. Partidas do fornecedor do contrato sem pedido (lançamento direto)
-- ---------------------------------------------------------------------------
-- Partida negativa (obrigação) de fornecedor que tem contrato, cujo documento
-- contábil não sai de nenhuma MIRO da ZL0170: lançado direto no FI, ou MIRO
-- posterior ao último corte da ZL0170. Não prova que é do contrato — a tela
-- atribui ao contrato só quando o fornecedor tem um contrato só, "a conferir".
create or replace view public.vw_contratos_aud_partidas_sem_pedido
with (security_invoker = true) as
with forn as (
  select split_part(btrim(fornecedor), ' ', 1) as fornecedor_codigo,
         string_agg(distinct documento_compras, ', ' order by documento_compras) as contratos
  from public.sap_me3n_contrato
  where upper(btrim(coalesce(codigo_eliminacao, ''))) <> 'L'
    and coalesce(btrim(fornecedor), '') <> ''
  group by 1
)
select fo.contratos, f.id as fbl_id, f.empresa, f.numero_documento, f.tipo_documento,
       f.montante_moeda_doc, f.referencia, f.data_documento, f.data_lancamento,
       f.vencimento_liquido, f.data_compensacao, f.doc_compensacao, f.bloqueio_pagamento,
       f.fornecedor, f.razao_social_fornecedor, f.texto, f.estorno_com, f.anulada
from public.vw_contratos_aud_fbl1n f
join forn fo on fo.fornecedor_codigo = f.fornecedor
where f.montante_moeda_doc < 0
  and not exists (
    select 1 from public.sap_zl0170_miro m
    where m.numero_doc_contabil = f.numero_documento
  );

comment on view public.vw_contratos_aud_partidas_sem_pedido is
  'Auditoria de contratos: lançamentos FBL1N de fornecedores com contrato que não vêm de MIRO (sem pedido).';

grant select on public.vw_contratos_aud_pedidos, public.vw_contratos_aud_fbl1n,
  public.vw_contratos_aud_partidas, public.vw_contratos_aud_partidas_sem_pedido to authenticated;
revoke all on public.vw_contratos_aud_pedidos, public.vw_contratos_aud_fbl1n,
  public.vw_contratos_aud_partidas, public.vw_contratos_aud_partidas_sem_pedido from anon;

-- Cobertura: data de importação e período de cada extração. A tela usa para
-- avisar quando a ME3N está velha ou a ZL0170 para antes da FBL1N (MIRO
-- posterior ao corte fica sem ponte e cai em "sem pedido").
create or replace view public.vw_contratos_aud_cobertura
with (security_invoker = true) as
select
  (select max(imported_at) from public.sap_me3n_contrato) as me3n_importado_em,
  (select max(imported_at) from public.sap_zl0170_miro) as zl0170_importado_em,
  (select min(data_lancamento_miro) from public.sap_zl0170_miro) as zl0170_de,
  (select max(data_lancamento_miro) from public.sap_zl0170_miro) as zl0170_ate,
  (select max(imported_at) from public.sap_fbl1n_pagar) as fbl1n_importado_em,
  (select min(data_lancamento) from public.sap_fbl1n_pagar) as fbl1n_de,
  (select max(data_lancamento) from public.sap_fbl1n_pagar) as fbl1n_ate,
  (select max(imported_at) from public.sap_me2l_pedido) as me2l_importado_em;

comment on view public.vw_contratos_aud_cobertura is
  'Auditoria de contratos: data de importação e período coberto por cada extração SAP usada.';

grant select on public.vw_contratos_aud_cobertura to authenticated;
revoke all on public.vw_contratos_aud_cobertura from anon;

-- ---------------------------------------------------------------------------
-- 5. Log de alterações de valor do contrato
-- ---------------------------------------------------------------------------
create table if not exists public.sup_contratos_alteracoes (
  id bigserial primary key,
  documento_compras text not null,
  item text,
  origem text not null check (origem in ('ME3N', 'Cadastro')),
  campo text not null,
  valor_anterior text,
  valor_novo text,
  alterado_por text,
  alterado_em timestamptz not null default now()
);

create index if not exists idx_sup_contratos_alteracoes_doc
  on public.sup_contratos_alteracoes (documento_compras, alterado_em desc);

alter table public.sup_contratos_alteracoes enable row level security;

drop policy if exists sup_contratos_alteracoes_read on public.sup_contratos_alteracoes;
create policy sup_contratos_alteracoes_read on public.sup_contratos_alteracoes
  for select to authenticated using (true);

-- Só os gatilhos (security definer) gravam; ninguém edita nem apaga o log.
revoke all on public.sup_contratos_alteracoes from anon;
revoke insert, update, delete on public.sup_contratos_alteracoes from authenticated;
grant select on public.sup_contratos_alteracoes to authenticated;

-- Compara campo a campo via jsonb: número compara por valor (168000 = 168000.00).
create or replace function public.trg_sup_contratos_alteracoes_me3n()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quem text;
  v_old jsonb;
  v_new jsonb;
  c text;
  campos constant text[] := array[
    'valor_efetivo', 'valor_solicitado', 'preco_liquido', 'qtd_solicit_anterior',
    'valor_pendente', 'inicio_validade', 'fim_validade', 'codigo_eliminacao', 'fornecedor'
  ];
begin
  -- profiles.id é text; auth.uid() é uuid.
  select p.name into v_quem from public.profiles p where p.id = auth.uid()::text;
  v_quem := coalesce(v_quem, 'Importação ME3N');

  if tg_op = 'INSERT' then
    insert into public.sup_contratos_alteracoes
      (documento_compras, item, origem, campo, valor_anterior, valor_novo, alterado_por)
    values
      (new.documento_compras, new.item, 'ME3N', 'item_incluido', null,
       coalesce(new.valor_efetivo::text, new.valor_solicitado::text), v_quem);
    return new;
  end if;

  v_old := to_jsonb(old);
  v_new := to_jsonb(new);
  foreach c in array campos loop
    if (v_old -> c) is distinct from (v_new -> c) then
      insert into public.sup_contratos_alteracoes
        (documento_compras, item, origem, campo, valor_anterior, valor_novo, alterado_por)
      values
        (new.documento_compras, new.item, 'ME3N', c, v_old ->> c, v_new ->> c, v_quem);
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists trg_sup_contratos_alteracoes_me3n on public.sap_me3n_contrato;
create trigger trg_sup_contratos_alteracoes_me3n
  after insert or update on public.sap_me3n_contrato
  for each row execute function public.trg_sup_contratos_alteracoes_me3n();

create or replace function public.trg_sup_contratos_alteracoes_detalhes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old jsonb;
  v_new jsonb;
  c text;
  campos constant text[] := array[
    'valor_parcela', 'status', 'vigencia_label', 'po_pedido_compra',
    'modalidade', 'gestor', 'tipo', 'codigo_fornecedor'
  ];
begin
  v_old := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  v_new := to_jsonb(new);
  foreach c in array campos loop
    if nullif(v_old ->> c, '') is distinct from nullif(v_new ->> c, '')
       and (v_old -> c) is distinct from (v_new -> c) then
      insert into public.sup_contratos_alteracoes
        (documento_compras, item, origem, campo, valor_anterior, valor_novo, alterado_por)
      values
        (new.documento_compras, null, 'Cadastro', c, v_old ->> c, v_new ->> c, new.updated_by);
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists trg_sup_contratos_alteracoes_detalhes on public.contratos_detalhes;
create trigger trg_sup_contratos_alteracoes_detalhes
  after insert or update on public.contratos_detalhes
  for each row execute function public.trg_sup_contratos_alteracoes_detalhes();

revoke execute on function public.trg_sup_contratos_alteracoes_me3n() from public, anon, authenticated;
revoke execute on function public.trg_sup_contratos_alteracoes_detalhes() from public, anon, authenticated;
