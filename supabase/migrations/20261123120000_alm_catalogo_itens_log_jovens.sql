-- Log do Cadastro de Itens (FRM.ALM-0016) e atividade dos Jovens Aprendizes.
--
-- alm_catalogo_itens guarda só o último autor (atualizado_por), então não dá
-- para saber o que cada pessoa fez ao longo do tempo. Este log grava toda
-- inclusão, alteração, etiqueta impressa, foto adicional e exclusão, com
-- autor (auth.uid()), campos mexidos e valores antes/depois. Vale para todos
-- os usuários; o recorte "Jovens" é feito na leitura pelo cargo do perfil
-- (JOVEM APRENDIZ), sem papel novo.
--
-- As contagens do Inventário Cíclico já gravam contado_por_id em
-- alm_inventario_contagens; a RPC junta as duas fontes sem expor saldo_ref
-- nem a quantidade contada (contagem cega).

create table if not exists public.alm_catalogo_itens_log (
  id uuid primary key default gen_random_uuid(),
  catalogo_item_id uuid,
  codigo_sap text not null,
  descricao text,
  -- cadastro | alteracao | etiqueta_impressa | foto_adicional | foto_adicional_removida | exclusao
  acao text not null,
  campos text[] not null default '{}',
  antes jsonb,
  depois jsonb,
  usuario_id text,
  usuario_nome text,
  -- Cargo no momento da ação: quem deixar de ser aprendiz continua rastreável.
  usuario_cargo text,
  created_at timestamptz not null default now()
);

create index if not exists alm_catalogo_itens_log_created_idx on public.alm_catalogo_itens_log (created_at desc);
create index if not exists alm_catalogo_itens_log_usuario_idx on public.alm_catalogo_itens_log (usuario_id, created_at desc);
create index if not exists alm_catalogo_itens_log_codigo_idx on public.alm_catalogo_itens_log (codigo_sap);

alter table public.alm_catalogo_itens_log enable row level security;

drop policy if exists alm_catalogo_itens_log_select on public.alm_catalogo_itens_log;
create policy alm_catalogo_itens_log_select on public.alm_catalogo_itens_log
  for select to authenticated using (true);

-- Só as triggers (security definer) escrevem; ninguém edita nem apaga.
revoke insert, update, delete on public.alm_catalogo_itens_log from anon, authenticated;
grant select on public.alm_catalogo_itens_log to authenticated;

-- ---------------------------------------------------------------------------
-- Autor da ação: sessão do Supabase; sem ela (script/service_role), o autor
-- gravado na própria linha.
-- ---------------------------------------------------------------------------
create or replace function public.alm_catalogo_log_autor(p_fallback text)
returns table (id text, nome text, cargo text)
language sql stable security definer set search_path = public as $$
  select p.id, p.name, p.cargo
    from public.profiles p
   where p.id = coalesce(auth.uid()::text, p_fallback)
  union all
  select coalesce(auth.uid()::text, p_fallback), null, null
   where not exists (select 1 from public.profiles p where p.id = coalesce(auth.uid()::text, p_fallback))
  limit 1;
$$;

revoke all on function public.alm_catalogo_log_autor(text) from public, anon, authenticated;

create or replace function public.alm_catalogo_itens_registrar_log()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  -- Campos que a pessoa mexe no cadastro. Os que vêm do SAP (descrição,
  -- saldo, grupos) e as datas de controle ficam de fora.
  v_rastreados constant text[] := array[
    'imagem_path', 'posicao_estoque', 'etiqueta_descricao', 'etiqueta_aplicacao',
    'estoque_minimo', 'observacao', 'lotes_validade', 'lote', 'validade', 'etiqueta_impressa_em'
  ];
  v_novo jsonb := to_jsonb(new);
  v_velho jsonb;
  v_campo text;
  v_campos text[] := '{}';
  v_antes jsonb := '{}'::jsonb;
  v_depois jsonb := '{}'::jsonb;
  v_acao text;
  v_autor record;
begin
  if tg_op = 'INSERT' then
    v_acao := 'cadastro';
    foreach v_campo in array v_rastreados loop
      if v_novo -> v_campo is not null and v_novo -> v_campo <> 'null'::jsonb then
        v_campos := v_campos || v_campo;
        v_depois := v_depois || jsonb_build_object(v_campo, v_novo -> v_campo);
      end if;
    end loop;
  else
    v_velho := to_jsonb(old);
    foreach v_campo in array v_rastreados loop
      if (v_velho -> v_campo) is distinct from (v_novo -> v_campo) then
        v_campos := v_campos || v_campo;
        v_antes := v_antes || jsonb_build_object(v_campo, v_velho -> v_campo);
        v_depois := v_depois || jsonb_build_object(v_campo, v_novo -> v_campo);
      end if;
    end loop;

    if coalesce(old.ativo, true) and not coalesce(new.ativo, true) then
      v_acao := 'exclusao';
    elsif not coalesce(old.ativo, true) and coalesce(new.ativo, true) then
      v_acao := 'cadastro';
    elsif cardinality(v_campos) = 0 then
      return null; -- nada que a pessoa tenha mexido (ex.: saldo do SAP)
    elsif v_campos = array['etiqueta_impressa_em'] then
      v_acao := 'etiqueta_impressa';
    else
      v_acao := 'alteracao';
    end if;
  end if;

  select * into v_autor
    from public.alm_catalogo_log_autor(case when tg_op = 'INSERT' then new.criado_por else coalesce(new.atualizado_por, new.criado_por) end);

  insert into public.alm_catalogo_itens_log
    (catalogo_item_id, codigo_sap, descricao, acao, campos, antes, depois, usuario_id, usuario_nome, usuario_cargo)
  values
    (new.id, new.codigo_sap, new.descricao, v_acao, v_campos,
     nullif(v_antes, '{}'::jsonb), nullif(v_depois, '{}'::jsonb),
     v_autor.id, coalesce(v_autor.nome, case when tg_op = 'INSERT' then new.criado_por_nome else new.atualizado_por_nome end), v_autor.cargo);

  return null;
end;
$$;

drop trigger if exists trg_alm_catalogo_itens_log on public.alm_catalogo_itens;
create trigger trg_alm_catalogo_itens_log
  after insert or update on public.alm_catalogo_itens
  for each row execute function public.alm_catalogo_itens_registrar_log();

create or replace function public.alm_catalogo_item_fotos_registrar_log()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_linha public.alm_catalogo_item_fotos;
  v_item record;
  v_autor record;
begin
  if tg_op = 'DELETE' then v_linha := old; else v_linha := new; end if;
  select ci.codigo_sap, ci.descricao into v_item
    from public.alm_catalogo_itens ci where ci.id = v_linha.catalogo_item_id;
  if v_item.codigo_sap is null then
    return null; -- item apagado junto (cascade): a exclusão já foi logada
  end if;

  select * into v_autor from public.alm_catalogo_log_autor(v_linha.criado_por);

  insert into public.alm_catalogo_itens_log
    (catalogo_item_id, codigo_sap, descricao, acao, campos, antes, depois, usuario_id, usuario_nome, usuario_cargo)
  values
    (v_linha.catalogo_item_id, v_item.codigo_sap, v_item.descricao,
     case when tg_op = 'DELETE' then 'foto_adicional_removida' else 'foto_adicional' end,
     array['foto_adicional'],
     case when tg_op = 'DELETE' then jsonb_build_object('imagem_path', v_linha.imagem_path) end,
     case when tg_op = 'INSERT' then jsonb_build_object('imagem_path', v_linha.imagem_path) end,
     v_autor.id, coalesce(v_autor.nome, case when tg_op = 'INSERT' then v_linha.criado_por_nome end), v_autor.cargo);

  return null;
end;
$$;

drop trigger if exists trg_alm_catalogo_item_fotos_log on public.alm_catalogo_item_fotos;
create trigger trg_alm_catalogo_item_fotos_log
  after insert or delete on public.alm_catalogo_item_fotos
  for each row execute function public.alm_catalogo_item_fotos_registrar_log();

-- ---------------------------------------------------------------------------
-- Atividade dos Jovens Aprendizes: cadastro (log) + contagens do inventário.
-- Sem quantidade contada nem saldo: a contagem é cega.
-- PostgREST corta em 1.000 linhas — o cliente pagina com range().
-- ---------------------------------------------------------------------------
create or replace function public.alm_atividade_jovens(
  p_desde timestamptz default null,
  p_ate timestamptz default null
)
returns table (
  ocorrido_em timestamptz,
  usuario_id text,
  usuario_nome text,
  origem text,
  acao text,
  codigo_sap text,
  descricao text,
  campos text[],
  referencia text,
  detalhe jsonb
)
language sql stable security definer set search_path = public as $$
  with jovens as (
    select p.id, p.name from public.profiles p where p.cargo ilike '%aprendiz%'
  )
  select * from (
    select l.created_at, l.usuario_id, coalesce(j.name, l.usuario_nome), 'cadastro'::text, l.acao,
           l.codigo_sap, l.descricao, l.campos, null::text,
           jsonb_strip_nulls(jsonb_build_object('antes', l.antes, 'depois', l.depois))
      from public.alm_catalogo_itens_log l
      left join jovens j on j.id = l.usuario_id
     where (j.id is not null or l.usuario_cargo ilike '%aprendiz%')
       and (p_desde is null or l.created_at >= p_desde)
       and (p_ate is null or l.created_at < p_ate)
    union all
    select c.created_at, c.contado_por_id::text, coalesce(j.name, c.contado_por_nome), 'contagem'::text,
           'contagem'::text, i.material, i.descricao, '{}'::text[], inv.codigo,
           jsonb_strip_nulls(jsonb_build_object(
             'numero', c.numero, 'deposito', i.deposito, 'endereco', c.endereco_encontrado,
             'duracao_segundos', c.duracao_segundos, 'causa', c.causa))
      from public.alm_inventario_contagens c
      join jovens j on j.id = c.contado_por_id::text
      join public.alm_inventario_itens i on i.id = c.item_id
      join public.alm_inventarios inv on inv.id = i.inventario_id
     where coalesce(inv.excluido, false) = false
       and (p_desde is null or c.created_at >= p_desde)
       and (p_ate is null or c.created_at < p_ate)
  ) a
  order by 1 desc;
$$;

revoke all on function public.alm_atividade_jovens(timestamptz, timestamptz) from public, anon;
grant execute on function public.alm_atividade_jovens(timestamptz, timestamptz) to authenticated;
