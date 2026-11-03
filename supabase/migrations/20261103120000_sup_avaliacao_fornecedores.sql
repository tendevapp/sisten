-- =====================================================================
-- Suprimentos › Ava. Fornecedor
-- =====================================================================
-- Dois registros:
--
-- 1) Ocorrências (rotina do comprador): um lançamento por fornecimento
--    (fornecedor + PO opcional) com VÁRIAS ocorrências dentro — ex.: entregou
--    parcial sem alinhar E a NF veio em desacordo. Código OCF-DDMMYY-NN.
--    Nasce das pendências de recebimento / de NF ou é lançado à mão.
--
-- 2) Avaliação periódica FRM.SUP-0005 (questionário de materiais, ao menos
--    1x/ano por fornecedor). Código AVF-DDMMYY-NN. A tela sugere as
--    respostas a partir das ocorrências do período.
--
-- Índice dos dois códigos reinicia por MÊS (mesmo recorte do RID/Kaizen).
-- `ocorrencias` é jsonb (um insert só — entra inteiro pela fila offline);
-- vw_sup_aval_ocorrencias_itens abre uma linha por ocorrência para
-- relatórios e para o futuro FMEA (gravidade = S, detecção = D, frequência = O).

-- ---------------------------------------------------------------------------
-- Acesso: Suprimentos (papéis) ou quem o admin liberou na Gestão de Acessos
-- ---------------------------------------------------------------------------
create or replace function public.sup_aval_pode_acessar()
returns boolean
language sql
stable security definer
set search_path to 'public', 'pg_temp'
as $$
  select public.has_role('admin')
      or public.has_role('comprador')
      or public.has_role('coordenador_suprimentos')
      or public.has_page_access('sup_avaliacao_fornecedores');
$$;

revoke all on function public.sup_aval_pode_acessar() from public, anon;
grant execute on function public.sup_aval_pode_acessar() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------
create table if not exists public.sup_aval_ocorrencias (
  id uuid primary key default gen_random_uuid(),
  codigo text unique,
  data_registro date not null default ((now() at time zone 'America/Bahia')::date),
  fornecedor_codigo text,
  fornecedor_nome text not null,
  fornecedor_cnpj text,
  nro_pedido text,
  nota_fiscal text,
  material_resumo text,
  -- "Como foi este fornecimento?" 1 (péssimo) a 5 (ótimo)
  estrelas smallint check (estrelas between 1 and 5),
  -- [{ id, tipo, categoria, gravidade: 1|2|3, deteccao, descricao, ref }]
  ocorrencias jsonb not null default '[]'::jsonb
    check (jsonb_typeof(ocorrencias) = 'array' and jsonb_array_length(ocorrencias) >= 1),
  impactos text[] not null default '{}'::text[],
  acoes text[] not null default '{}'::text[],
  acao_descricao text,
  -- Recado para o próximo comprador que for fazer PO com este fornecedor
  recomendacao text,
  origem text not null default 'MANUAL' check (origem in ('MANUAL', 'PENDENCIAS')),
  -- 'REC:<id sup_pend_recebimento>' / 'NF:<id sup_pend_processamento_nf>'
  origem_refs text[] not null default '{}'::text[],
  criado_por text default (auth.uid())::text references public.core_perfis(id),
  criado_por_nome text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  excluido_em timestamptz,
  excluido_por text references public.core_perfis(id)
);

create index if not exists idx_sup_aval_oc_data on public.sup_aval_ocorrencias (data_registro desc);
create index if not exists idx_sup_aval_oc_forn on public.sup_aval_ocorrencias (fornecedor_codigo);
create index if not exists idx_sup_aval_oc_po on public.sup_aval_ocorrencias (nro_pedido);
create index if not exists idx_sup_aval_oc_refs on public.sup_aval_ocorrencias using gin (origem_refs);

create table if not exists public.sup_aval_frm (
  id uuid primary key default gen_random_uuid(),
  codigo text unique,
  data_avaliacao date not null default ((now() at time zone 'America/Bahia')::date),
  periodo_meses smallint not null default 12 check (periodo_meses between 1 and 36),
  tipo text not null default 'MATERIAIS' check (tipo in ('MATERIAIS')),
  fornecedor_codigo text,
  fornecedor_nome text not null,
  fornecedor_cnpj text,
  -- {"1.1": 2, "1.2": 2, ...} — número da opção, como na planilha do FRM
  respostas jsonb not null default '{}'::jsonb,
  justificativas jsonb not null default '{}'::jsonb,
  notas_criterio jsonb not null default '{}'::jsonb,
  nota_final numeric(6, 4) not null check (nota_final between 0 and 1),
  classificacao text not null,
  decisao text not null check (decisao in ('MANTER', 'DESENVOLVER', 'DESQUALIFICAR')),
  justificativa_final text,
  resp_avaliacao text,
  -- Retrato do período no momento da avaliação (pedidos, itens, ocorrências...)
  resumo_periodo jsonb not null default '{}'::jsonb,
  criado_por text default (auth.uid())::text references public.core_perfis(id),
  criado_por_nome text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  excluido_em timestamptz,
  excluido_por text references public.core_perfis(id)
);

create index if not exists idx_sup_aval_frm_data on public.sup_aval_frm (data_avaliacao desc);
create index if not exists idx_sup_aval_frm_forn on public.sup_aval_frm (fornecedor_codigo);

-- Sugestão que o comprador decidiu não registrar (não é falha do fornecedor)
create table if not exists public.sup_aval_sugestoes_dispensadas (
  ref text primary key,
  nro_pedido text,
  motivo text,
  dispensado_por text default (auth.uid())::text references public.core_perfis(id),
  dispensado_por_nome text,
  dispensado_em timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Código + autor + updated_at (genérico para as duas tabelas)
-- tg_argv[0] = prefixo, tg_argv[1] = coluna de data do registro
-- ---------------------------------------------------------------------------
create or replace function public.sup_aval_antes_gravar()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_prefixo text := tg_argv[0];
  v_coluna text := tg_argv[1];
  v_data date;
  v_inicio date;
  v_max int;
  v_indice text;
begin
  if tg_op = 'INSERT' then
    if coalesce(trim(new.codigo), '') = '' then
      v_data := (to_jsonb(new) ->> v_coluna)::date;
      perform pg_advisory_xact_lock(hashtext(tg_table_name || '_codigo'));
      v_inicio := date_trunc('month', v_data)::date;
      execute format(
        'select coalesce(max((regexp_match(codigo, %L))[1]::int), 0) from public.%I where %I >= $1 and %I < $2',
        '^' || v_prefixo || '-\d{6}-(\d+)$', tg_table_name, v_coluna, v_coluna)
        into v_max
        using v_inicio, (v_inicio + interval '1 month')::date;
      v_indice := (v_max + 1)::text;
      new.codigo := v_prefixo || '-' || to_char(v_data, 'DDMMYY') || '-' || lpad(v_indice, greatest(2, length(v_indice)), '0');
    end if;
    if new.criado_por_nome is null and new.criado_por is not null then
      select name into new.criado_por_nome from public.core_perfis where id = new.criado_por;
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_sup_aval_oc_antes_gravar on public.sup_aval_ocorrencias;
create trigger trg_sup_aval_oc_antes_gravar
  before insert or update on public.sup_aval_ocorrencias
  for each row execute function public.sup_aval_antes_gravar('OCF', 'data_registro');

drop trigger if exists trg_sup_aval_frm_antes_gravar on public.sup_aval_frm;
create trigger trg_sup_aval_frm_antes_gravar
  before insert or update on public.sup_aval_frm
  for each row execute function public.sup_aval_antes_gravar('AVF', 'data_avaliacao');

-- ---------------------------------------------------------------------------
-- RLS: Suprimentos lê tudo (o histórico serve ao próximo comprador);
-- só o autor ou admin altera/exclui (regra dos formulários).
-- ---------------------------------------------------------------------------
alter table public.sup_aval_ocorrencias enable row level security;
alter table public.sup_aval_frm enable row level security;
alter table public.sup_aval_sugestoes_dispensadas enable row level security;

drop policy if exists sup_aval_oc_sel on public.sup_aval_ocorrencias;
create policy sup_aval_oc_sel on public.sup_aval_ocorrencias
  for select to authenticated using ((select public.sup_aval_pode_acessar()));
drop policy if exists sup_aval_oc_ins on public.sup_aval_ocorrencias;
create policy sup_aval_oc_ins on public.sup_aval_ocorrencias
  for insert to authenticated
  with check ((select public.sup_aval_pode_acessar())
              and (criado_por is null or criado_por = (select auth.uid())::text or (select public.has_role('admin'))));
drop policy if exists sup_aval_oc_upd on public.sup_aval_ocorrencias;
create policy sup_aval_oc_upd on public.sup_aval_ocorrencias
  for update to authenticated
  using (public.form_pode_editar(criado_por)) with check (public.form_pode_editar(criado_por));
drop policy if exists sup_aval_oc_del on public.sup_aval_ocorrencias;
create policy sup_aval_oc_del on public.sup_aval_ocorrencias
  for delete to authenticated using (public.form_pode_editar(criado_por));

drop policy if exists sup_aval_frm_sel on public.sup_aval_frm;
create policy sup_aval_frm_sel on public.sup_aval_frm
  for select to authenticated using ((select public.sup_aval_pode_acessar()));
drop policy if exists sup_aval_frm_ins on public.sup_aval_frm;
create policy sup_aval_frm_ins on public.sup_aval_frm
  for insert to authenticated
  with check ((select public.sup_aval_pode_acessar())
              and (criado_por is null or criado_por = (select auth.uid())::text or (select public.has_role('admin'))));
drop policy if exists sup_aval_frm_upd on public.sup_aval_frm;
create policy sup_aval_frm_upd on public.sup_aval_frm
  for update to authenticated
  using (public.form_pode_editar(criado_por)) with check (public.form_pode_editar(criado_por));
drop policy if exists sup_aval_frm_del on public.sup_aval_frm;
create policy sup_aval_frm_del on public.sup_aval_frm
  for delete to authenticated using (public.form_pode_editar(criado_por));

drop policy if exists sup_aval_disp_sel on public.sup_aval_sugestoes_dispensadas;
create policy sup_aval_disp_sel on public.sup_aval_sugestoes_dispensadas
  for select to authenticated using ((select public.sup_aval_pode_acessar()));
drop policy if exists sup_aval_disp_ins on public.sup_aval_sugestoes_dispensadas;
create policy sup_aval_disp_ins on public.sup_aval_sugestoes_dispensadas
  for insert to authenticated
  with check ((select public.sup_aval_pode_acessar()) and dispensado_por = (select auth.uid())::text);
drop policy if exists sup_aval_disp_del on public.sup_aval_sugestoes_dispensadas;
create policy sup_aval_disp_del on public.sup_aval_sugestoes_dispensadas
  for delete to authenticated using (public.form_pode_editar(dispensado_por));

revoke all on public.sup_aval_ocorrencias, public.sup_aval_frm, public.sup_aval_sugestoes_dispensadas from anon;
grant select, insert, update, delete on public.sup_aval_ocorrencias to authenticated;
grant select, insert, update, delete on public.sup_aval_frm to authenticated;
grant select, insert, delete on public.sup_aval_sugestoes_dispensadas to authenticated;

-- ---------------------------------------------------------------------------
-- Uma linha por ocorrência (relatórios / base do FMEA)
-- ---------------------------------------------------------------------------
create or replace view public.vw_sup_aval_ocorrencias_itens
with (security_invoker = true) as
select
  o.id as registro_id,
  o.codigo,
  o.data_registro,
  o.fornecedor_codigo,
  o.fornecedor_nome,
  o.nro_pedido,
  o.nota_fiscal,
  o.estrelas,
  o.impactos,
  o.acoes,
  o.criado_por_nome,
  e.ordem::int as ordem,
  e.item ->> 'tipo' as tipo,
  e.item ->> 'categoria' as categoria,
  nullif(e.item ->> 'gravidade', '')::int as gravidade,
  e.item ->> 'deteccao' as deteccao,
  e.item ->> 'descricao' as descricao
from public.sup_aval_ocorrencias o
cross join lateral jsonb_array_elements(o.ocorrencias) with ordinality as e(item, ordem)
where o.excluido_em is null;

revoke all on public.vw_sup_aval_ocorrencias_itens from anon;
grant select on public.vw_sup_aval_ocorrencias_itens to authenticated;

-- ---------------------------------------------------------------------------
-- Busca de fornecedor (ZL0132) e pedidos do fornecedor
-- ---------------------------------------------------------------------------
create or replace function public.sup_aval_buscar_fornecedores(p_termo text, p_limite int default 20)
returns table (
  fornecedor_codigo text, fornecedor_nome text, cnpj text, pedidos bigint, ultimo_pedido date
)
language sql
stable security definer
set search_path to 'public', 'pg_temp'
as $$
  with t as (
    select btrim(coalesce(p_termo, '')) as termo,
           regexp_replace(coalesce(p_termo, ''), '\D', '', 'g') as digitos
  )
  select z.fornecedor_codigo,
         max(btrim(z.fornecedor_nome)),
         max(nullif(btrim(z.cnpj_fornecedor), '')),
         count(distinct z.doc_compra),
         max(z.data_doc)
    from public.sap_zl0132_po z, t
   where public.sup_aval_pode_acessar()
     and nullif(btrim(z.fornecedor_codigo), '') is not null
     and (
       t.termo = ''
       or z.fornecedor_nome ilike '%' || t.termo || '%'
       or z.fornecedor_codigo = t.termo
       or (length(t.digitos) >= 4 and regexp_replace(coalesce(z.cnpj_fornecedor, ''), '\D', '', 'g') like t.digitos || '%')
     )
   group by z.fornecedor_codigo
   order by max(z.data_doc) desc nulls last
   limit greatest(1, least(coalesce(p_limite, 20), 50));
$$;

create or replace function public.sup_aval_pedidos(p_fornecedor_codigo text default null, p_po text default null)
returns table (
  nro_pedido text, data_pedido date, fornecedor_codigo text, fornecedor_nome text, cnpj text,
  itens bigint, valor numeric, resumo text, comprador text
)
language sql
stable security definer
set search_path to 'public', 'pg_temp'
as $$
  select z.doc_compra,
         max(z.data_doc),
         max(z.fornecedor_codigo),
         max(btrim(z.fornecedor_nome)),
         max(nullif(btrim(z.cnpj_fornecedor), '')),
         count(*),
         sum(coalesce(z.valor_liquido, 0)),
         string_agg(distinct btrim(z.txt_breve), ' · '),
         max(z.criado_por_pedido)
    from public.sap_zl0132_po z
   where public.sup_aval_pode_acessar()
     and nullif(btrim(z.doc_compra), '') is not null
     and (nullif(btrim(p_fornecedor_codigo), '') is null or z.fornecedor_codigo = btrim(p_fornecedor_codigo))
     and (nullif(btrim(p_po), '') is null or z.doc_compra like btrim(p_po) || '%')
     and (nullif(btrim(p_fornecedor_codigo), '') is not null or nullif(btrim(p_po), '') is not null)
   group by z.doc_compra
   order by max(z.data_doc) desc nulls last
   limit 60;
$$;

-- ---------------------------------------------------------------------------
-- Sugestões: POs com pendência de recebimento / de NF ainda sem registro
-- ---------------------------------------------------------------------------
create or replace function public.sup_aval_sugestoes(p_dias int default 120)
returns table (
  nro_pedido text, fornecedor_codigo text, fornecedor_nome text,
  comprador_id uuid, comprador_nome text, data date, refs jsonb
)
language sql
stable security definer
set search_path to 'public', 'pg_temp'
as $$
  with usados as (
    select unnest(o.origem_refs) as ref from public.sup_aval_ocorrencias o where o.excluido_em is null
    union
    select d.ref from public.sup_aval_sugestoes_dispensadas d
  ),
  rec as (
    select 'REC:' || p.id as ref,
           btrim(p.nro_pedido) as po,
           p.fornecedor,
           p.comprador_id,
           p.comprador_nome,
           p.created_at,
           jsonb_build_object(
             'ref', 'REC:' || p.id, 'origem', 'PEND_RECEBIMENTO', 'codigo', p.codigo,
             'motivo', p.motivo, 'descricao', p.descricao, 'material_code', p.material_code,
             'qtd_pedido', p.qtd_pedido, 'qtd_recebida', p.qtd_recebida, 'unidade', p.unidade,
             'observacao', p.observacao_almox, 'nc_codigo', p.nc_codigo, 'conferencia', p.conferencia_codigo,
             'status', p.status, 'data', p.created_at
           ) as item
      from public.sup_pend_recebimento p
     where p.status <> 'cancelada'
       and p.created_at >= now() - make_interval(days => greatest(coalesce(p_dias, 120), 1))
       and nullif(btrim(p.nro_pedido), '') is not null
  ),
  nf as (
    select 'NF:' || n.id as ref,
           btrim(n.documento_compras) as po,
           n.nome_fornecedor as fornecedor,
           null::uuid as comprador_id,
           n.comprador as comprador_nome,
           n.created_at,
           jsonb_build_object(
             'ref', 'NF:' || n.id, 'origem', 'PEND_NF', 'codigo', coalesce(n.protocolo, n.numero_nfse),
             'causa', n.classif_causa, 'nota_fiscal', n.numero_nfse,
             'observacao', coalesce(nullif(n.observacao_chamado, ''), n.observacao),
             'status', n.status, 'data', n.created_at
           ) as item
      from public.sup_pend_processamento_nf n
     where btrim(coalesce(n.documento_compras, '')) ~ '^4\d{9}$'
       and n.created_at >= now() - make_interval(days => greatest(coalesce(p_dias, 120), 1))
       and (
         n.classif_causa in (
           'Nota fiscal em desacordo com o pedido',
           'Divergência de valor, ICMS ou base de cálculo',
           'Frete ou condição de frete',
           'Documentação ou anexo faltando'
         )
         or n.classif_responsavel = 'Fornecedor'
         or n.classif_recorrencia = 'Recorrente com este fornecedor'
       )
  ),
  livres as (
    select t.* from (select * from rec union all select * from nf) t
     where not exists (select 1 from usados u where u.ref = t.ref)
  )
  select l.po,
         z.fornecedor_codigo,
         coalesce(z.fornecedor_nome, max(l.fornecedor)),
         (array_agg(l.comprador_id) filter (where l.comprador_id is not null))[1],
         coalesce(
           (array_agg(l.comprador_nome) filter (where l.comprador_id is not null and l.comprador_nome is not null))[1],
           max(l.comprador_nome)
         ),
         max(l.created_at)::date,
         jsonb_agg(l.item order by l.created_at)
    from livres l
    left join lateral (
      select z.fornecedor_codigo, btrim(z.fornecedor_nome) as fornecedor_nome
        from public.sap_zl0132_po z
       where z.doc_compra = l.po and nullif(btrim(z.fornecedor_nome), '') is not null
       limit 1
    ) z on true
   where public.sup_aval_pode_acessar()
   group by l.po, z.fornecedor_codigo, z.fornecedor_nome
   order by max(l.created_at) desc;
$$;

-- ---------------------------------------------------------------------------
-- Painel por fornecedor: X itens comprados × Y ocorrências no período
-- ---------------------------------------------------------------------------
create or replace function public.sup_aval_painel(
  p_inicio date,
  p_fim date,
  p_fornecedor_codigo text default null
)
returns table (
  chave text, fornecedor_codigo text, fornecedor_nome text, cnpj text,
  pedidos bigint, itens bigint, valor numeric, itens_entregues bigint, itens_no_prazo bigint,
  registros bigint, ocorrencias bigint, pedidos_com_ocorrencia bigint, por_categoria jsonb, por_tipo jsonb,
  estrelas_media numeric, ultimo_registro date,
  frm_codigo text, frm_nota numeric, frm_data date, frm_decisao text
)
language sql
stable security definer
set search_path to 'public', 'pg_temp'
as $$
  with filtro as (select nullif(btrim(p_fornecedor_codigo), '') as cod),
  compras as (
    select z.fornecedor_codigo as chave,
           max(btrim(z.fornecedor_nome)) as nome,
           max(nullif(btrim(z.cnpj_fornecedor), '')) as cnpj,
           count(distinct z.doc_compra) as pedidos,
           count(*) as itens,
           sum(coalesce(z.valor_liquido, 0)) as valor,
           count(*) filter (where z.data_migo is not null and z.dt_remessa is not null) as entregues,
           count(*) filter (where z.data_migo is not null and z.dt_remessa is not null and z.data_migo <= z.dt_remessa) as no_prazo
      from public.sap_zl0132_po z, filtro f
     where z.data_doc between p_inicio and p_fim
       and nullif(btrim(z.fornecedor_codigo), '') is not null
       and (f.cod is null or z.fornecedor_codigo = f.cod)
     group by z.fornecedor_codigo
  ),
  regs as (
    select coalesce(nullif(btrim(o.fornecedor_codigo), ''), 'NOME:' || upper(btrim(o.fornecedor_nome))) as chave, o.*
      from public.sup_aval_ocorrencias o, filtro f
     where o.excluido_em is null
       and o.data_registro between p_inicio and p_fim
       and (f.cod is null or o.fornecedor_codigo = f.cod)
  ),
  oc as (
    select r.chave,
           max(r.fornecedor_nome) as nome,
           max(r.fornecedor_codigo) as cod,
           max(r.fornecedor_cnpj) as cnpj,
           count(*) as registros,
           sum(jsonb_array_length(r.ocorrencias)) as ocorrencias,
           count(distinct nullif(btrim(r.nro_pedido), '')) as pedidos_oc,
           avg(r.estrelas) as estrelas,
           max(r.data_registro) as ultimo
      from regs r
     group by r.chave
  ),
  itens as (
    select r.chave, e ->> 'categoria' as categoria, e ->> 'tipo' as tipo
      from regs r cross join lateral jsonb_array_elements(r.ocorrencias) e
  ),
  cat as (
    select chave, jsonb_object_agg(categoria, n) as por_categoria
      from (select chave, coalesce(categoria, 'OUTROS') as categoria, count(*) as n from itens group by 1, 2) s
     group by chave
  ),
  tip as (
    select chave, jsonb_object_agg(tipo, n) as por_tipo
      from (select chave, coalesce(tipo, 'OUTRA') as tipo, count(*) as n from itens group by 1, 2) s
     group by chave
  ),
  frm as (
    select distinct on (k) k as chave, f.codigo, f.nota_final, f.data_avaliacao, f.decisao
      from (
        select coalesce(nullif(btrim(f.fornecedor_codigo), ''), 'NOME:' || upper(btrim(f.fornecedor_nome))) as k, f.*
          from public.sup_aval_frm f
         where f.excluido_em is null
      ) f
     order by k, f.data_avaliacao desc, f.created_at desc
  ),
  base as (
    select coalesce(c.chave, oc.chave) as chave,
           coalesce(c.chave, oc.cod) as cod,
           coalesce(c.nome, oc.nome) as nome,
           coalesce(c.cnpj, oc.cnpj) as cnpj,
           c.pedidos, c.itens, c.valor, c.entregues, c.no_prazo,
           oc.registros, oc.ocorrencias, oc.pedidos_oc, oc.estrelas, oc.ultimo
      from compras c
      full join oc on oc.chave = c.chave
  )
  select b.chave, b.cod, b.nome, b.cnpj,
         coalesce(b.pedidos, 0), coalesce(b.itens, 0), coalesce(b.valor, 0),
         coalesce(b.entregues, 0), coalesce(b.no_prazo, 0),
         coalesce(b.registros, 0), coalesce(b.ocorrencias, 0), coalesce(b.pedidos_oc, 0),
         coalesce(cat.por_categoria, '{}'::jsonb), coalesce(tip.por_tipo, '{}'::jsonb),
         round(b.estrelas, 2), b.ultimo,
         frm.codigo, frm.nota_final, frm.data_avaliacao, frm.decisao
    from base b
    left join cat on cat.chave = b.chave
    left join tip on tip.chave = b.chave
    left join frm on frm.chave = b.chave
   where public.sup_aval_pode_acessar();
$$;

revoke all on function public.sup_aval_buscar_fornecedores(text, int) from public, anon;
revoke all on function public.sup_aval_pedidos(text, text) from public, anon;
revoke all on function public.sup_aval_sugestoes(int) from public, anon;
revoke all on function public.sup_aval_painel(date, date, text) from public, anon;
grant execute on function public.sup_aval_buscar_fornecedores(text, int) to authenticated;
grant execute on function public.sup_aval_pedidos(text, text) to authenticated;
grant execute on function public.sup_aval_sugestoes(int) to authenticated;
grant execute on function public.sup_aval_painel(date, date, text) to authenticated;
