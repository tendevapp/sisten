-- =====================================================================
-- Almoxarifado > Cadastro de Itens: todo material que já teve saldo na
-- ZL0024 fica no catálogo, mesmo depois de zerar.
--
-- A lista do Cadastro de Itens era montada uma vez, no aparelho, a partir da
-- ZL0024 daquele dia; material que entrava depois (nova compra) nunca
-- aparecia, e cada celular tinha a sua lista. Este registro anota, a cada
-- importação, os materiais com saldo — e nunca apaga. O catálogo lê daqui +
-- ZL0024 atual + itens cadastrados à mão (alm_catalogo_itens).
--
-- Mesmo desenho de alm_posicao_material: trigger por comando na tabela da
-- ZL0024 (que é apagada e reinserida em lotes de 500), escrita só por ele.
-- Fora: depósito 0105 (transferência para a Produção, não é almoxarifado) e
-- itens de projeto (código 100000…, ficam na aba BOM).
-- =====================================================================

create table if not exists public.alm_catalogo_material_visto (
  codigo_sap text primary key,
  descricao text,
  texto_tecnico text,
  grp_mercad text,
  grupo_mercadorias text,
  umb text,
  primeiro_visto_em timestamptz not null default now(),
  ultimo_visto_em timestamptz not null default now()
);

alter table public.alm_catalogo_material_visto enable row level security;

revoke all on public.alm_catalogo_material_visto from anon;
grant select on public.alm_catalogo_material_visto to authenticated;

create policy alm_catalogo_material_visto_sel on public.alm_catalogo_material_visto
  for select to authenticated using (true);

-- Escrita só pelo trigger (security definer): nenhum grant de insert/update.

create or replace function public.alm_catalogo_material_visto_registrar()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.alm_catalogo_material_visto
    (codigo_sap, descricao, texto_tecnico, grp_mercad, grupo_mercadorias, umb, primeiro_visto_em, ultimo_visto_em)
  select distinct on (btrim(material::text))
         btrim(material::text),
         nullif(btrim(txt_breve_material::text), ''),
         nullif(btrim(texto_pedido_compra::text), ''),
         nullif(btrim(grp_mercad::text), ''),
         nullif(btrim(grupo_mercadorias::text), ''),
         nullif(btrim(umb::text), ''),
         now(), now()
    from novas
   where btrim(coalesce(material::text, '')) <> ''
     and coalesce(quantidade, 0) > 0
     and lpad(btrim(coalesce(deposito::text, '')), 4, '0') <> '0105'
     and ltrim(btrim(material::text), '0') not like '100000%'
   order by btrim(material::text), quantidade desc
  on conflict (codigo_sap) do update set
    descricao = coalesce(excluded.descricao, alm_catalogo_material_visto.descricao),
    texto_tecnico = coalesce(excluded.texto_tecnico, alm_catalogo_material_visto.texto_tecnico),
    grp_mercad = coalesce(excluded.grp_mercad, alm_catalogo_material_visto.grp_mercad),
    grupo_mercadorias = coalesce(excluded.grupo_mercadorias, alm_catalogo_material_visto.grupo_mercadorias),
    umb = coalesce(excluded.umb, alm_catalogo_material_visto.umb),
    ultimo_visto_em = excluded.ultimo_visto_em;
  return null;
end;
$$;

revoke all on function public.alm_catalogo_material_visto_registrar() from public, anon, authenticated;

drop trigger if exists trg_alm_catalogo_material_visto on public.sap_zl0024_stk;
create trigger trg_alm_catalogo_material_visto
  after insert on public.sap_zl0024_stk
  referencing new table as novas
  for each statement
  execute function public.alm_catalogo_material_visto_registrar();

-- Ponto de partida: a ZL0024 atual e os materiais com posição já anotada
-- (alm_posicao_material guarda os vistos desde 13/10, inclusive os que zeraram).
insert into public.alm_catalogo_material_visto
  (codigo_sap, descricao, texto_tecnico, grp_mercad, grupo_mercadorias, umb)
select distinct on (btrim(material::text))
       btrim(material::text),
       nullif(btrim(txt_breve_material::text), ''),
       nullif(btrim(texto_pedido_compra::text), ''),
       nullif(btrim(grp_mercad::text), ''),
       nullif(btrim(grupo_mercadorias::text), ''),
       nullif(btrim(umb::text), '')
  from public.sap_zl0024_stk
 where btrim(coalesce(material::text, '')) <> ''
   and coalesce(quantidade, 0) > 0
   and lpad(btrim(coalesce(deposito::text, '')), 4, '0') <> '0105'
   and ltrim(btrim(material::text), '0') not like '100000%'
 order by btrim(material::text), quantidade desc
on conflict (codigo_sap) do nothing;

insert into public.alm_catalogo_material_visto (codigo_sap, primeiro_visto_em, ultimo_visto_em)
select p.codigo_sap, min(p.visto_em), max(p.visto_em)
  from public.alm_posicao_material p
 where ltrim(p.codigo_sap, '0') not like '100000%'
 group by p.codigo_sap
on conflict (codigo_sap) do nothing;

-- Quem veio só pela posição (já zerou) não tem descrição: completa pelo mestre de materiais.
update public.alm_catalogo_material_visto v
   set descricao = coalesce(v.descricao, nullif(btrim(m.description), '')),
       texto_tecnico = coalesce(v.texto_tecnico, nullif(btrim(m.technical_text), '')),
       grp_mercad = coalesce(v.grp_mercad, nullif(btrim(m.grupo_mercadoria_codigo), '')),
       grupo_mercadorias = coalesce(v.grupo_mercadorias, nullif(btrim(m.grupo_mercadoria_desc), '')),
       umb = coalesce(v.umb, nullif(btrim(m.unit), ''))
  from (
    select distinct on (ltrim(btrim(material_code), '0')) *
      from public.materials
     order by ltrim(btrim(material_code), '0'), imported_at desc nulls last
  ) m
 where ltrim(btrim(m.material_code), '0') = ltrim(v.codigo_sap, '0')
   and (v.descricao is null or v.grp_mercad is null or v.umb is null);
