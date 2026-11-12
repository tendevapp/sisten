-- Catálogo ZL0169 (sap_zl0169_162_catalogo, 454 mil linhas, 510 MB) mais
-- enxuto para a instância Micro de 1 GB.
--
-- 1) `busca_texto` (descrição + texto técnico sem acento, ~157 bytes por linha,
--    ~70 MB) sai da tabela principal para sap_catalogo_busca_tecnica. Só a
--    busca com "incluir texto técnico" usa essa coluna, e sem índice: cada
--    busca dessas lia a tabela principal inteira (354 MB). Agora lê só a
--    tabela de busca, e a principal — usada o dia todo por código e
--    descrição — fica menor.
-- 2) A chave primária passa do `id` (uuid, índice de 36 MB nunca usado em
--    leitura) para `material_code`, que já era único e é a chave de toda
--    importação (upsert on conflict material_code).
-- 3) VACUUM FULL agendado para a madrugada devolve o espaço (sem ele a coluna
--    removida continua ocupando as páginas antigas).

-- ---------------------------------------------------------------------------
-- 1) Tabela de busca técnica
-- ---------------------------------------------------------------------------
create table if not exists public.sap_catalogo_busca_tecnica (
  material_code text primary key,
  busca_texto   text not null
);
comment on table public.sap_catalogo_busca_tecnica is
  'Texto de busca (descrição + texto técnico, sem acento, maiúsculo) do catálogo ZL0169. Mantida por gatilho em sap_zl0169_162_catalogo; lida por buscar_materiais e buscar_materiais_catalogo.';

alter table public.sap_catalogo_busca_tecnica enable row level security;
drop policy if exists sap_catalogo_busca_tecnica_leitura on public.sap_catalogo_busca_tecnica;
create policy sap_catalogo_busca_tecnica_leitura on public.sap_catalogo_busca_tecnica
  for select to authenticated using (true);
revoke all on public.sap_catalogo_busca_tecnica from anon, authenticated;
grant select on public.sap_catalogo_busca_tecnica to authenticated;
grant all on public.sap_catalogo_busca_tecnica to service_role;

insert into public.sap_catalogo_busca_tecnica (material_code, busca_texto)
select material_code, busca_texto from public.sap_zl0169_162_catalogo
on conflict (material_code) do update set busca_texto = excluded.busca_texto;

-- Gatilhos por comando (não por linha): a importação grava em lotes de mil e
-- cada lote vira um único INSERT … ON CONFLICT aqui.
create or replace function private.catalogo_busca_tecnica_sync()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if tg_op = 'TRUNCATE' then
    truncate public.sap_catalogo_busca_tecnica;
    return null;
  end if;

  -- Cada ramo só cita as tabelas de transição que o gatilho dele declara
  -- (new_rows não existe no DELETE, old_rows não existe no INSERT).
  if tg_op = 'DELETE' then
    delete from public.sap_catalogo_busca_tecnica b
     using old_rows o
     where b.material_code = o.material_code;
    return null;
  end if;

  if tg_op = 'UPDATE' then
    -- Código trocado num UPDATE: a linha do código antigo sai.
    delete from public.sap_catalogo_busca_tecnica b
     using old_rows o
     where b.material_code = o.material_code
       and not exists (select 1 from new_rows n where n.material_code = o.material_code);
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    insert into public.sap_catalogo_busca_tecnica as b (material_code, busca_texto)
    select n.material_code,
           f_unaccent(upper(coalesce(n.description, '') || ' ' || coalesce(n.technical_text, '')))
      from new_rows n
    on conflict (material_code) do update
      set busca_texto = excluded.busca_texto
      where b.busca_texto is distinct from excluded.busca_texto;
  end if;

  return null;
end;
$$;
revoke all on function private.catalogo_busca_tecnica_sync() from public, anon, authenticated;

drop trigger if exists catalogo_busca_tecnica_ins on public.sap_zl0169_162_catalogo;
drop trigger if exists catalogo_busca_tecnica_upd on public.sap_zl0169_162_catalogo;
drop trigger if exists catalogo_busca_tecnica_del on public.sap_zl0169_162_catalogo;
drop trigger if exists catalogo_busca_tecnica_trunc on public.sap_zl0169_162_catalogo;
create trigger catalogo_busca_tecnica_ins after insert on public.sap_zl0169_162_catalogo
  referencing new table as new_rows
  for each statement execute function private.catalogo_busca_tecnica_sync();
create trigger catalogo_busca_tecnica_upd after update on public.sap_zl0169_162_catalogo
  referencing old table as old_rows new table as new_rows
  for each statement execute function private.catalogo_busca_tecnica_sync();
create trigger catalogo_busca_tecnica_del after delete on public.sap_zl0169_162_catalogo
  referencing old table as old_rows
  for each statement execute function private.catalogo_busca_tecnica_sync();
create trigger catalogo_busca_tecnica_trunc after truncate on public.sap_zl0169_162_catalogo
  for each statement execute function private.catalogo_busca_tecnica_sync();

-- A view `materials` continua com a coluna busca_texto (vw_pedidos_conciliacao_detalhes
-- depende da view, e quem pede `*` não quebra), agora calculada só quando
-- alguém a seleciona.
create or replace view public.materials with (security_invoker = true) as
select id,
       material_code,
       description,
       technical_text,
       category,
       company,
       unit,
       is_active,
       created_at,
       f_unaccent(upper(coalesce(description, '') || ' ' || coalesce(technical_text, ''))) as busca_texto,
       busca_desc,
       centro,
       eliminacao,
       elim_nivel_centro,
       status_geral,
       status_centro,
       modificado_por,
       tipo_material,
       tipo_material_desc,
       codigo_controle,
       categoria_item,
       indicador_s,
       grupo_mercadoria_codigo,
       grupo_mercadoria_desc,
       denominacao,
       material_basico,
       classe_fiscal,
       unidade_medida_alt,
       classe_avaliacao,
       numero_pf,
       idioma,
       pais,
       criado_em,
       ultima_modificacao,
       imported_at
  from public.sap_zl0169_162_catalogo;

alter table public.sap_zl0169_162_catalogo drop column busca_texto;

-- ---------------------------------------------------------------------------
-- 2) Chave primária: id → material_code
-- ---------------------------------------------------------------------------
-- Nenhuma FK aponta para o catálogo; o app não grava nem lê o catálogo por id.
-- O id continua na tabela (e na view) como dado.
alter table public.sap_zl0169_162_catalogo
  drop constraint materials_pkey,
  drop constraint materials_material_code_key,
  add constraint materials_pkey primary key (material_code);

-- ---------------------------------------------------------------------------
-- 3) Buscas lendo a tabela de busca técnica
-- ---------------------------------------------------------------------------
-- Mesmo resultado e ordem de antes. SQL dinâmico para cada variante (código,
-- descrição, técnica) ter o próprio plano: com o CASE de antes, um plano
-- genérico do plpgsql podia varrer o catálogo em qualquer variante.
create or replace function public.buscar_materiais(termo text, area_usuario text default null::text, limite integer default 20, deslocamento integer default 0, incluir_tecnico boolean default false)
 returns table(material_code text, description text, technical_text text, unit text, status_geral text, qtd_estoque numeric, depositos text[], rms_12m integer, ultima_rm date, rms_sem_pedido integer, rm_aberta text, qtd_rm_aberta numeric, pedido_aberto text, qtd_pedido_aberto numeric, chega_em date, pedido_pela_area boolean)
 language plpgsql
 stable
 set search_path to 'public'
 set work_mem to '16MB'
as $function$
declare
  norm      text;
  toks      text[];
  pats      text[];
  maior     text;
  eh_cod    boolean;
  teto      int := least(coalesce(limite, 20), 50);
  salto     int := greatest(coalesce(deslocamento, 0), 0);
  tecnico   boolean := coalesce(incluir_tecnico, false);
  v_de      text;
  v_cond    text;
  v_sim     text;
begin
  norm := regexp_replace(trim(f_unaccent(upper(coalesce(termo, '')))), '\s+', ' ', 'g');
  if norm = '' then return; end if;

  eh_cod := norm ~ '^\d+$';
  toks   := array_remove(string_to_array(norm, ' '), '');
  select t into maior from unnest(toks) t order by length(t) desc limit 1;
  select array_agg('%' || escapar_like(t) || '%') into pats from unnest(toks) t;

  -- $1 area_usuario, $2 maior, $3 teto, $4 salto, $5 norm, $6 padrões, $7 padrão do maior termo
  if eh_cod then
    v_de   := 'materials m';
    v_cond := 'm.material_code like $5 || ''%''';
    v_sim  := 'similarity(m.description, $5)';
  elsif tecnico then
    v_de   := 'sap_catalogo_busca_tecnica b join materials m on m.material_code = b.material_code';
    v_cond := 'b.busca_texto like $7 and b.busca_texto like all ($6)';
    v_sim  := 'greatest(similarity(m.description, $5), similarity(m.technical_text, $5))';
  else
    v_de   := 'materials m';
    v_cond := 'm.busca_desc like $7 and m.busca_desc like all ($6)';
    v_sim  := 'similarity(m.description, $5)';
  end if;

  return query execute
    'select m.material_code, m.description, m.technical_text, m.unit, m.status_geral,
            s.qtd_estoque, s.depositos, s.rms_12m, s.ultima_rm,
            s.rms_sem_pedido, s.rm_aberta, s.qtd_rm_aberta,
            s.pedido_aberto, s.qtd_pedido_aberto, s.chega_em,
            coalesce($1 is not null and s.areas @> array[$1], false) as pedido_pela_area
       from ' || v_de || '
       left join mv_material_sinais s on s.material_code = m.material_code
      where m.is_active
        and m.material_code !~ ''^[9a-zA-Z]''
        and ' || v_cond || '
      order by
        (coalesce(s.qtd_estoque, 0) > 0) desc,
        coalesce($1 is not null and s.areas @> array[$1], false) desc,
        nullif(strpos(m.busca_desc, $2), 0) asc nulls last,
        coalesce(s.rms_12m, 0) desc,
        ' || v_sim || ' desc,
        m.material_code
      limit $3 offset $4'
    using area_usuario, maior, teto, salto, norm, pats, '%' || escapar_like(maior) || '%';

  if found or salto > 0 then return; end if;

  return query
  select m.material_code, m.description, m.technical_text, m.unit, m.status_geral,
         s.qtd_estoque, s.depositos, s.rms_12m, s.ultima_rm,
         s.rms_sem_pedido, s.rm_aberta, s.qtd_rm_aberta,
         s.pedido_aberto, s.qtd_pedido_aberto, s.chega_em,
         coalesce(area_usuario is not null and s.areas @> array[area_usuario], false)
           as pedido_pela_area
  from materials m
  left join mv_material_sinais s on s.material_code = m.material_code
  where m.is_active
    and m.material_code !~ '^[9a-zA-Z]'
    and m.busca_desc % norm
  order by similarity(m.busca_desc, norm) desc, m.material_code
  limit teto;
end;
$function$;

create or replace function public.buscar_materiais_catalogo(termos text[] default null::text[], categoria text default null::text, empresa text default null::text, apenas_codigos text[] default null::text[], limite integer default 50, deslocamento integer default 0, incluir_tecnico boolean default false, unidade text default null::text, tmat text default null::text, ncm text default null::text, status_filtro text default null::text)
 returns table(id text, material_code text, description text, technical_text text, category text, company text, unit text, tipo_material text, codigo_controle text, status_geral text, status_centro text, status_sap text, total_count bigint)
 language plpgsql
 stable
 set search_path to 'public'
 set work_mem to '16MB'
as $function$
-- Busca do Cadastro de Itens (chips = E). Reescrita em 11/11/2026: conta e
-- ordena só (código, casa na descrição, posição) e busca as colunas largas
-- apenas das linhas da página; sem termo, lê pelo índice do código; SQL
-- dinâmico para o plano ver os filtros de verdade. Em 12/11/2026 a busca com
-- texto técnico passou a ler sap_catalogo_busca_tecnica em vez do catálogo.
declare
  teto        int := least(coalesce(limite, 50), 200);
  salto       int := greatest(coalesce(deslocamento, 0), 0);
  toks        text[];
  pats        text[];
  usa_tecnico boolean;
  col         text;
  de          text;
  norm_ncm    text;
  norm_status text := upper(trim(coalesce(status_filtro, 'Todos')));
  filtros     text;
  colunas     text := 'm.id, m.material_code, m.description, m.technical_text, m.category, m.company, m.unit,
                       m.tipo_material, m.codigo_controle, m.status_geral, m.status_centro,
                       case when coalesce(trim(m.status_geral), '''') = ''Z1'' or coalesce(trim(m.status_centro), '''') = ''Z1''
                            then ''Obsoleto'' else ''Ativo'' end';
  total       bigint;
begin
  select array_agg(regexp_replace(trim(f_unaccent(upper(t))), '\s+', ' ', 'g') order by n)
    into toks
  from unnest(coalesce(termos, '{}')) with ordinality as u(t, n)
  where trim(t) <> '';

  if toks is not null then
    select array_agg('%' || escapar_like(t) || '%' order by n) into pats
    from unnest(toks) with ordinality as u(t, n);
  end if;

  usa_tecnico := coalesce(incluir_tecnico, false) and toks is not null;
  col := case when usa_tecnico then 'b.busca_texto' else 'm.busca_desc' end;
  -- Candidatos primeiro: o 1º termo casa no texto (varre só a tabela de busca)
  -- ou no código (índice trigram do código). Sem isso o OR entre código e
  -- texto obrigava a juntar as duas tabelas inteiras antes de filtrar (11 s).
  de  := case when usa_tecnico
              then 'materials m
                    join sap_catalogo_busca_tecnica b on b.material_code = m.material_code
                    join (select t.material_code from sap_catalogo_busca_tecnica t where t.busca_texto like $9
                          union
                          select c.material_code from materials c where c.material_code ilike $9) cand
                      on cand.material_code = m.material_code'
              else 'materials m' end;

  norm_ncm := regexp_replace(trim(coalesce(ncm, '')), '[^0-9a-zA-Z]', '', 'g');

  -- $1 categoria, $2 empresa, $3 unidade, $4 tmat, $5 ncm, $6 status,
  -- $7 apenas_codigos, $8 padrões (todos), $9 primeiro padrão.
  -- Cada termo casa no código OU na descrição (no texto técnico, se marcado);
  -- chr(1) separa as duas partes para um termo não casar "atravessando" as duas.
  filtros := format(
    '     m.is_active
      and m.material_code !~ ''^[9a-zA-Z]''
      and ($1 is null or $1 = ''Todas'' or m.category = $1)
      and ($2 is null or $2 = ''Todas'' or m.company = $2 or m.company = ''AMBAS'')
      and ($3 is null or $3 = ''Todas'' or m.unit = $3)
      and ($4 is null or $4 = ''Todos'' or m.tipo_material = $4)
      and ($5 = '''' or regexp_replace(coalesce(m.codigo_controle, ''''), ''[^0-9a-zA-Z]'', '''', ''g'') like $5 || ''%%'')
      and (
        $6 in (''TODOS'', '''')
        or ($6 = ''OBSOLETO'' and (coalesce(trim(m.status_geral), '''') = ''Z1'' or coalesce(trim(m.status_centro), '''') = ''Z1''))
        or ($6 = ''ATIVO'' and coalesce(trim(m.status_geral), '''') <> ''Z1'' and coalesce(trim(m.status_centro), '''') <> ''Z1'')
      )
      and ($7 is null or m.material_code = any($7))
      and ($8 is null or (
            (m.material_code ilike $9 or %1$s like $9)
            and (upper(m.material_code) || chr(1) || %1$s) like all ($8)
          ))', col);

  if toks is null then
    execute 'select count(*) from ' || de || ' where ' || filtros
      into total
      using categoria, empresa, unidade, tmat, norm_ncm, norm_status, apenas_codigos, pats, null::text;

    return query execute
      'select ' || colunas || ', $10::bigint from ' || de || ' where ' || filtros ||
      ' order by m.material_code limit $11 offset $12'
      using categoria, empresa, unidade, tmat, norm_ncm, norm_status, apenas_codigos, pats, null::text,
            total, teto, salto;
    return;
  end if;

  return query execute
    'with f as (
       select m.material_code as cod,
              m.busca_desc like all ($8) as casa,
              nullif(strpos(m.busca_desc, $10), 0) as pos
         from ' || de || '
        where ' || filtros || '
     ), pg as (
       select f.cod, f.casa, f.pos, count(*) over () as total
         from f
        order by f.casa desc, f.pos asc nulls last, f.cod
        limit $11 offset $12
     )
     select ' || colunas || ', pg.total
       from pg join materials m on m.material_code = pg.cod
      order by pg.casa desc, pg.pos asc nulls last, pg.cod'
    using categoria, empresa, unidade, tmat, norm_ncm, norm_status, apenas_codigos, pats, pats[1],
          toks[1], teto, salto;
end;
$function$;

analyze public.sap_catalogo_busca_tecnica;
analyze public.sap_zl0169_162_catalogo;

-- ---------------------------------------------------------------------------
-- 4) VACUUM FULL na madrugada de 13/11 (03:30 em Brasília = 06:30 UTC)
-- ---------------------------------------------------------------------------
-- Reescreve a tabela sem a coluna removida (~70 MB) e reconstrói os índices.
-- Trava o catálogo por 1–3 min: por isso de madrugada. Depois um VACUUM simples
-- refaz o mapa de visibilidade (as leituras só pelo índice dependem dele) e o
-- último job remove os três agendamentos.
select cron.unschedule(jobid) from cron.job
 where jobname in ('sisten-catalogo-vacuum-full', 'sisten-catalogo-vacuum', 'sisten-catalogo-vacuum-limpeza');
select cron.schedule('sisten-catalogo-vacuum-full', '30 6 13 11 *',
                     'vacuum full public.sap_zl0169_162_catalogo');
select cron.schedule('sisten-catalogo-vacuum', '50 6 13 11 *',
                     'vacuum (analyze) public.sap_zl0169_162_catalogo');
select cron.schedule('sisten-catalogo-vacuum-limpeza', '30 7 13 11 *',
                     $$select cron.unschedule(jobid) from cron.job where jobname in ('sisten-catalogo-vacuum-full', 'sisten-catalogo-vacuum', 'sisten-catalogo-vacuum-limpeza')$$);
