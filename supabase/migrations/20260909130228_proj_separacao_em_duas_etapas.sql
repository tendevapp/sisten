-- =====================================================================
-- Almoxarifado > Projetos — separação em duas etapas (check físico → debita)
--
-- Antes: abrir a ordem já debitava o almoxarifado inteiro de uma vez.
-- Agora: abrir a ordem só congela o romaneio e cria o kit — SEM debitar.
-- Quem separa fisicamente vai dando check item a item (`separado`,
-- `qtd_separada`), inclusive parcial. Só quando confirma a separação
-- (ação explícita, uma vez) o sistema debita o que foi de fato separado —
-- itens não marcados simplesmente não debitam, e a tela alerta sobre eles
-- antes de confirmar.
--
-- O apontamento de conclusão (F3, qualidade) passa a exigir que a
-- separação já tenha sido confirmada — não dá pra apontar um kit que
-- ainda nem foi debitado do almoxarifado.
-- =====================================================================

alter table public.proj_ordens_premontagem_itens
  add column if not exists separado boolean not null default false,
  add column if not exists qtd_separada numeric not null default 0,
  add column if not exists separado_em timestamptz,
  add column if not exists separado_por_nome text;

alter table public.proj_ordens_premontagem
  add column if not exists separacao_confirmada_em timestamptz,
  add column if not exists separacao_confirmada_por_nome text;

comment on column public.proj_ordens_premontagem_itens.separado is
  'Marcado por quem separa fisicamente. Não debita o almoxarifado por si só — só na confirmação da ordem.';
comment on column public.proj_ordens_premontagem.separacao_confirmada_em is
  'Quando a separação foi confirmada e o débito de estoque aplicado. Null = ordem ainda em picking, sem nenhum débito.';

-- Abre a ordem: congela romaneio, cria kit(s), NÃO debita. Mesma trava de
-- tramo/zona de antes (permite reabrir tramo em_premontagem só para zona
-- ainda não separada).
create or replace function public.proj_abrir_ordem_premontagem(
  p_ordem jsonb,
  p_itens jsonb,
  p_alvos text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ordem_id uuid;
  v_codigo text := p_ordem->>'codigo';
  v_projeto text := coalesce(p_ordem->>'projeto', 'GW_JACOBINA');
  v_tramo text := p_ordem->>'tramo';
  v_zona text := nullif(p_ordem->>'zona', '');
  v_kits integer := (p_ordem->>'quantidade_kits')::integer;
  v_invalidos text;
begin
  if coalesce(array_length(p_alvos, 1), 0) <> v_kits then
    raise exception 'A ordem pede % kit(s) mas recebeu % tramo(s) alvo.', v_kits, coalesce(array_length(p_alvos, 1), 0);
  end if;

  select string_agg(a, ', ') into v_invalidos
  from unnest(p_alvos) a
  where not exists (
    select 1 from public.proj_tramos_gwjaco t
    where t.id = a and t.tramo = v_tramo
      and (
        t.status = 'pendente'
        or (
          v_zona is not null
          and t.status = 'em_premontagem'
          and not exists (
            select 1
            from public.proj_ordens_premontagem po
            join public.proj_ordens_premontagem_alvos al on al.ordem_id = po.id
            where al.tramo_unidade_id = a
              and po.zona = v_zona
              and po.excluido_em is null
          )
        )
      )
  );

  if v_invalidos is not null then
    raise exception 'Tramo(s) indisponivel(is) para separacao: %. Confira o tramo, a zona e se ja nao estao em processo.', v_invalidos;
  end if;

  insert into public.proj_ordens_premontagem
    (projeto, codigo, subprojeto_id, tramo, zona, quantidade_kits, observacao, criado_por_id, criado_por_nome)
  values
    (v_projeto, v_codigo, nullif(p_ordem->>'subprojeto_id',''), v_tramo, v_zona, v_kits,
     nullif(p_ordem->>'observacao',''), nullif(p_ordem->>'criado_por_id','')::uuid, p_ordem->>'criado_por_nome')
  returning id into v_ordem_id;

  insert into public.proj_ordens_premontagem_itens
    (ordem_id, item_id, subconjunto, qtd_por_kit, qtd_total, localizador, saldo_no_momento)
  select
    v_ordem_id, (x->>'item_id')::uuid, nullif(x->>'subconjunto',''),
    (x->>'qtd_por_kit')::numeric, (x->>'qtd_total')::numeric,
    nullif(x->>'localizador',''),
    (select s.saldo from public.vw_proj_saldo_almox s where s.item_id = (x->>'item_id')::uuid)
  from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) x;

  insert into public.proj_ordens_premontagem_alvos (ordem_id, tramo_unidade_id)
  select v_ordem_id, a from unnest(p_alvos) a;

  insert into public.proj_kits
    (projeto, rastreio, tramo, tramo_unidade_id, ordem_id, status, criado_por_id, criado_por_nome)
  select v_projeto, 'KIT-' || a, v_tramo, a, v_ordem_id, 'em_premontagem',
         nullif(p_ordem->>'criado_por_id','')::uuid, p_ordem->>'criado_por_nome'
  from unnest(p_alvos) a
  on conflict (projeto, rastreio) do nothing;

  update public.proj_tramos_gwjaco
     set status = 'em_premontagem', updated_at = now()
   where id = any(p_alvos);

  return jsonb_build_object('id', v_ordem_id, 'codigo', v_codigo);
end;
$$;

-- Marca um item do romaneio como separado (ou desmarca) — chamado a cada
-- check físico na bancada. Não mexe em estoque.
create or replace function public.proj_marcar_item_ordem_premontagem(
  p_ordem_item_id uuid,
  p_separado boolean,
  p_qtd_separada numeric,
  p_usuario jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if exists (
    select 1 from public.proj_ordens_premontagem_itens oi
    join public.proj_ordens_premontagem o on o.id = oi.ordem_id
    where oi.id = p_ordem_item_id and o.separacao_confirmada_em is not null
  ) then
    raise exception 'Esta ordem já teve a separação confirmada — não é possível alterar o check dos itens.';
  end if;

  update public.proj_ordens_premontagem_itens
     set separado = p_separado,
         qtd_separada = case when p_separado then coalesce(p_qtd_separada, qtd_total) else 0 end,
         separado_em = case when p_separado then now() else null end,
         separado_por_nome = case when p_separado then p_usuario->>'nome' else null end
   where id = p_ordem_item_id;
end;
$$;

-- Confirma a separação: debita o almoxarifado só pelo que foi de fato
-- separado. Ação única por ordem — depois de confirmada, os checks travam.
create or replace function public.proj_confirmar_separacao_premontagem(
  p_ordem_id uuid,
  p_usuario jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ordem record;
  v_total_itens integer;
  v_itens_separados integer;
  v_total_pecas numeric;
begin
  select * into v_ordem from public.proj_ordens_premontagem where id = p_ordem_id and excluido_em is null;
  if not found then
    raise exception 'Ordem de pré-montagem não encontrada.';
  end if;
  if v_ordem.separacao_confirmada_em is not null then
    raise exception 'A separação desta ordem já foi confirmada em %.', to_char(v_ordem.separacao_confirmada_em, 'DD/MM/YYYY HH24:MI');
  end if;

  select count(*), count(*) filter (where separado and qtd_separada > 0), coalesce(sum(qtd_separada) filter (where separado), 0)
    into v_total_itens, v_itens_separados, v_total_pecas
  from public.proj_ordens_premontagem_itens where ordem_id = p_ordem_id;

  if v_itens_separados = 0 then
    raise exception 'Nenhum item foi marcado como separado — não há o que confirmar.';
  end if;

  perform public.proj_validar_saldo(
    (select jsonb_agg(jsonb_build_object('item_id', item_id, 'quantidade', qtd_separada))
     from public.proj_ordens_premontagem_itens
     where ordem_id = p_ordem_id and separado and qtd_separada > 0)
  );

  insert into public.proj_movimentos
    (projeto, tipo, item_id, quantidade, documento_tipo, documento_id, documento_codigo,
     tramo, criado_por_id, criado_por_nome)
  select
    v_ordem.projeto, 'saida_premontagem', oi.item_id, -oi.qtd_separada,
    'ordem', v_ordem.id, v_ordem.codigo, v_ordem.tramo,
    nullif(p_usuario->>'id','')::uuid, p_usuario->>'nome'
  from public.proj_ordens_premontagem_itens oi
  where oi.ordem_id = p_ordem_id and oi.separado and oi.qtd_separada > 0;

  update public.proj_ordens_premontagem
     set separacao_confirmada_em = now(), separacao_confirmada_por_nome = p_usuario->>'nome'
   where id = p_ordem_id;

  return jsonb_build_object(
    'itens_totais', v_total_itens,
    'itens_separados', v_itens_separados,
    'itens_faltantes', v_total_itens - v_itens_separados,
    'total_pecas_debitadas', v_total_pecas
  );
end;
$$;

-- F3 agora exige separação confirmada antes de apontar conclusão.
create or replace function public.proj_concluir_premontagem(
  p_ordem_id uuid,
  p_kits jsonb,
  p_usuario jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status text;
  v_separacao_confirmada timestamptz;
  v_prontos integer;
  v_restantes integer;
begin
  select status, separacao_confirmada_em into v_status, v_separacao_confirmada
  from public.proj_ordens_premontagem where id = p_ordem_id and excluido_em is null;
  if not found then
    raise exception 'Ordem de pre-montagem nao encontrada.';
  end if;
  if v_status <> 'em_processamento' then
    raise exception 'A ordem ja esta %.', v_status;
  end if;
  if v_separacao_confirmada is null then
    raise exception 'Confirme a separação (débito do almoxarifado) antes de apontar a conclusão.';
  end if;

  with atualizados as (
    update public.proj_kits k
       set status = 'pronto',
           codigo = coalesce(nullif(x->>'codigo',''), k.codigo),
           qualidade_ok = coalesce((x->>'qualidade_ok')::boolean, true),
           nao_conformidade = nullif(x->>'nao_conformidade',''),
           observacao = nullif(x->>'observacao',''),
           concluido_em = now(),
           concluido_por_nome = p_usuario->>'nome'
      from jsonb_array_elements(coalesce(p_kits, '[]'::jsonb)) x
      join public.proj_ordens_premontagem_alvos al
        on al.tramo_unidade_id = x->>'tramo_unidade_id' and al.ordem_id = p_ordem_id
     where k.tramo_unidade_id = x->>'tramo_unidade_id'
       and k.status = 'em_premontagem'
    returning k.tramo_unidade_id
  )
  select count(*) into v_prontos from atualizados;

  if v_prontos = 0 then
    raise exception 'Nenhum kit desta ordem estava aguardando apontamento.';
  end if;

  update public.proj_tramos_gwjaco t
     set status = 'kit_pronto', updated_at = now()
   from public.proj_ordens_premontagem_alvos al
   join public.proj_kits k on k.tramo_unidade_id = al.tramo_unidade_id
   where al.ordem_id = p_ordem_id and k.status = 'pronto' and t.id = k.tramo_unidade_id;

  select count(*) into v_restantes
  from public.proj_ordens_premontagem_alvos al
  join public.proj_kits k on k.tramo_unidade_id = al.tramo_unidade_id
  where al.ordem_id = p_ordem_id and k.status = 'em_premontagem' and k.excluido_em is null;

  if v_restantes = 0 then
    update public.proj_ordens_premontagem
       set status = 'concluida', concluida_em = now(), concluida_por_nome = p_usuario->>'nome'
     where id = p_ordem_id;
  end if;

  return jsonb_build_object('kits_concluidos', v_prontos, 'kits_restantes', v_restantes);
end;
$$;

drop function if exists public.proj_registrar_saida_premontagem(jsonb, jsonb, text[]);

revoke execute on function public.proj_abrir_ordem_premontagem(jsonb, jsonb, text[]) from public, anon;
revoke execute on function public.proj_marcar_item_ordem_premontagem(uuid, boolean, numeric, jsonb) from public, anon;
revoke execute on function public.proj_confirmar_separacao_premontagem(uuid, jsonb) from public, anon;
grant execute on function public.proj_abrir_ordem_premontagem(jsonb, jsonb, text[]) to authenticated, service_role;
grant execute on function public.proj_marcar_item_ordem_premontagem(uuid, boolean, numeric, jsonb) to authenticated, service_role;
grant execute on function public.proj_confirmar_separacao_premontagem(uuid, jsonb) to authenticated, service_role;
