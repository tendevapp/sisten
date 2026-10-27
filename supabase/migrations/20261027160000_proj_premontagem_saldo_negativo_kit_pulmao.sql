-- Pré-montagem: separar sem saldo e kit "pulmão" sem número de tramo.
--
-- 1) Saldo negativo. Peças de projeto aparecem com saldo 0 só porque a
--    planilha de recebimento ainda não foi importada; travar a separação por
--    isso parava a bancada. Confirmar a separação (e corrigir a quantidade de
--    um item já confirmado) agora debita mesmo sem saldo — o saldo fica
--    negativo e a entrada (entrada_nf) regulariza sozinha, porque
--    vw_proj_saldo_almox é a soma dos movimentos. A confirmação devolve
--    quantos itens ficaram negativos, para a tela avisar.
--
-- 2) Kit pulmão. A bancada às vezes monta kit sem saber para qual torre vai.
--    A ordem passa a aceitar menos tramos numerados que kits: o que faltar
--    vira kit com tramo_unidade_id nulo (rastreio KIT-<ordem>-P<n>). O número
--    do tramo pode ser dado depois, na entrega à produção.

alter table public.proj_kits alter column tramo_unidade_id drop not null;
alter table public.proj_entregas_producao alter column tramo_unidade_id drop not null;

create or replace function public.proj_abrir_ordem_premontagem(p_ordem jsonb, p_itens jsonb, p_alvos text[])
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_ordem_id uuid;
  v_codigo text := p_ordem->>'codigo';
  v_projeto text := coalesce(p_ordem->>'projeto', 'GW_JACOBINA');
  v_tramo text := p_ordem->>'tramo';
  v_zona text := nullif(p_ordem->>'zona', '');
  v_kits integer := (p_ordem->>'quantidade_kits')::integer;
  v_numerados integer := coalesce(array_length(p_alvos, 1), 0);
  v_invalidos text;
begin
  if coalesce(v_kits, 0) < 1 then
    raise exception 'Informe ao menos 1 kit.';
  end if;
  if v_numerados > v_kits then
    raise exception 'A ordem pede % kit(s) mas recebeu % tramo(s) numerado(s).', v_kits, v_numerados;
  end if;
  if v_numerados <> (select count(distinct a) from unnest(p_alvos) a) then
    raise exception 'Tramo repetido na numeração da ordem.';
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

  -- Kits pulmão: sem número de tramo, identificados pela ordem.
  insert into public.proj_kits
    (projeto, rastreio, tramo, tramo_unidade_id, ordem_id, status, criado_por_id, criado_por_nome)
  select v_projeto, 'KIT-' || v_codigo || '-P' || g, v_tramo, null, v_ordem_id, 'em_premontagem',
         nullif(p_ordem->>'criado_por_id','')::uuid, p_ordem->>'criado_por_nome'
  from generate_series(1, v_kits - v_numerados) g;

  update public.proj_tramos_gwjaco
     set status = 'em_premontagem', updated_at = now()
   where id = any(p_alvos);

  return jsonb_build_object('id', v_ordem_id, 'codigo', v_codigo);
end;
$function$;

create or replace function public.proj_confirmar_separacao_premontagem(p_ordem_id uuid, p_usuario jsonb default '{}'::jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_ordem record;
  v_total_itens integer;
  v_itens_separados integer;
  v_total_pecas numeric;
  v_negativos integer;
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

  -- Sem trava de saldo: o débito pode deixar o saldo negativo até a entrada
  -- ser importada (ver cabeçalho da migration).
  insert into public.proj_movimentos
    (projeto, tipo, item_id, quantidade, documento_tipo, documento_id, documento_codigo,
     tramo, criado_por_id, criado_por_nome)
  select
    v_ordem.projeto, 'saida_premontagem', oi.item_id, -oi.qtd_separada,
    'ordem', v_ordem.id, v_ordem.codigo, v_ordem.tramo,
    nullif(p_usuario->>'id','')::uuid, p_usuario->>'nome'
  from public.proj_ordens_premontagem_itens oi
  where oi.ordem_id = p_ordem_id and oi.separado and oi.qtd_separada > 0;

  select count(*) into v_negativos
  from public.proj_ordens_premontagem_itens oi
  join public.vw_proj_saldo_almox s on s.item_id = oi.item_id
  where oi.ordem_id = p_ordem_id and oi.separado and oi.qtd_separada > 0 and s.saldo < 0;

  update public.proj_ordens_premontagem
     set separacao_confirmada_em = now(), separacao_confirmada_por_nome = p_usuario->>'nome'
   where id = p_ordem_id;

  return jsonb_build_object(
    'itens_totais', v_total_itens,
    'itens_separados', v_itens_separados,
    'itens_faltantes', v_total_itens - v_itens_separados,
    'total_pecas_debitadas', v_total_pecas,
    'itens_saldo_negativo', v_negativos
  );
end;
$function$;

create or replace function public.proj_editar_item_premontagem(p_ordem_item_id uuid, p_nova_qtd_separada numeric, p_usuario jsonb default '{}'::jsonb)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_item record;
  v_qtd_antiga numeric;
begin
  select oi.id, oi.ordem_id, oi.item_id, oi.qtd_separada,
         o.criado_por_id, o.separacao_confirmada_em, o.codigo, o.projeto, o.tramo, o.status
    into v_item
  from public.proj_ordens_premontagem_itens oi
  join public.proj_ordens_premontagem o on o.id = oi.ordem_id
  where oi.id = p_ordem_item_id;

  if not found then
    raise exception 'Item da ordem de pré-montagem não encontrado.';
  end if;
  if not public.form_pode_editar(v_item.criado_por_id::text) then
    raise exception 'Você não tem permissão para editar esta ordem.';
  end if;
  if v_item.status = 'cancelada' then
    raise exception 'Ordem cancelada não pode ser editada.';
  end if;
  if v_item.separacao_confirmada_em is null then
    raise exception 'A separação desta ordem ainda não foi confirmada — use o check físico normal, não esta correção.';
  end if;
  if p_nova_qtd_separada < 0 then
    raise exception 'Quantidade separada não pode ser negativa.';
  end if;

  v_qtd_antiga := v_item.qtd_separada;
  if v_qtd_antiga = p_nova_qtd_separada then
    return;
  end if;

  update public.proj_movimentos
     set excluido_em = now(), excluido_por = p_usuario->>'nome'
   where documento_id = v_item.ordem_id
     and item_id = v_item.item_id
     and tipo = 'saida_premontagem'
     and excluido_em is null;

  -- Sem trava de saldo, como na confirmação da separação.
  if p_nova_qtd_separada > 0 then
    insert into public.proj_movimentos
      (projeto, tipo, item_id, quantidade, documento_tipo, documento_id, documento_codigo,
       tramo, criado_por_id, criado_por_nome)
    values
      (v_item.projeto, 'saida_premontagem', v_item.item_id, -p_nova_qtd_separada,
       'ordem', v_item.ordem_id, v_item.codigo, v_item.tramo,
       nullif(p_usuario->>'id', '')::uuid, p_usuario->>'nome');
  end if;

  update public.proj_ordens_premontagem_itens
     set qtd_separada = p_nova_qtd_separada,
         separado = (p_nova_qtd_separada > 0),
         separado_em = case when p_nova_qtd_separada > 0 then now() else null end,
         separado_por_nome = case when p_nova_qtd_separada > 0 then p_usuario->>'nome' else null end
   where id = p_ordem_item_id;

  insert into public.proj_ordens_premontagem_alteracoes (ordem_id, tipo, alteracoes, criado_por_id, criado_por_nome)
  values (
    v_item.ordem_id, 'item',
    jsonb_build_array(jsonb_build_object('campo', 'qtd_separada:' || v_item.item_id::text, 'de', v_qtd_antiga, 'para', p_nova_qtd_separada)),
    nullif(p_usuario->>'id', '')::uuid, p_usuario->>'nome'
  );
end;
$function$;

-- Apontamento: o kit é identificado por kit_id (pulmão não tem tramo); quem
-- ainda manda só tramo_unidade_id continua funcionando.
create or replace function public.proj_concluir_premontagem(p_ordem_id uuid, p_kits jsonb, p_usuario jsonb default '{}'::jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
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
     where k.status = 'em_premontagem'
       and k.excluido_em is null
       and (
         -- kit pulmão desta ordem
         (nullif(x->>'kit_id','') is not null and k.id = (x->>'kit_id')::uuid
            and k.tramo_unidade_id is null and k.ordem_id = p_ordem_id)
         -- kit numerado: vale pelo alvo da ordem (zonas do T1 reaproveitam o kit)
         or (k.tramo_unidade_id is not null
            and k.tramo_unidade_id = coalesce(nullif(x->>'tramo_unidade_id',''),
                  (select k2.tramo_unidade_id from public.proj_kits k2 where k2.id = nullif(x->>'kit_id','')::uuid))
            and exists (select 1 from public.proj_ordens_premontagem_alvos al
                         where al.ordem_id = p_ordem_id and al.tramo_unidade_id = k.tramo_unidade_id))
       )
    returning k.id
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

  select
    (select count(*)
       from public.proj_ordens_premontagem_alvos al
       join public.proj_kits k on k.tramo_unidade_id = al.tramo_unidade_id
      where al.ordem_id = p_ordem_id and k.status = 'em_premontagem' and k.excluido_em is null)
    +
    (select count(*)
       from public.proj_kits k
      where k.ordem_id = p_ordem_id and k.tramo_unidade_id is null
        and k.status = 'em_premontagem' and k.excluido_em is null)
    into v_restantes;

  if v_restantes = 0 then
    update public.proj_ordens_premontagem
       set status = 'concluida', concluida_em = now(), concluida_por_nome = p_usuario->>'nome'
     where id = p_ordem_id;
  end if;

  return jsonb_build_object('kits_concluidos', v_prontos, 'kits_restantes', v_restantes);
end;
$function$;

-- Entrega: kit pulmão pode receber o número do tramo aqui (opcional).
create or replace function public.proj_entregar_producao(p_entrega jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_id uuid;
  v_kit_id uuid := (p_entrega->>'kit_id')::uuid;
  v_projeto text := coalesce(p_entrega->>'projeto', 'GW_JACOBINA');
  v_unidade text := nullif(p_entrega->>'tramo_unidade_id', '');
  v_kit record;
begin
  select k.* into v_kit from public.proj_kits k where k.id = v_kit_id and k.excluido_em is null;
  if not found then
    raise exception 'Kit nao encontrado.';
  end if;
  if v_kit.status <> 'pronto' then
    raise exception 'O kit % esta com status "%" — so kit pronto no buffer pode ser entregue.', v_kit.rastreio, v_kit.status;
  end if;

  if v_kit.tramo_unidade_id is not null then
    v_unidade := v_kit.tramo_unidade_id;
  elsif v_unidade is not null then
    if not exists (
      select 1 from public.proj_tramos_gwjaco t
      where t.id = v_unidade and t.tramo = v_kit.tramo and t.status = 'pendente'
    ) then
      raise exception 'Tramo % indisponivel para o kit pulmao % — precisa ser um % ainda pendente.', v_unidade, v_kit.rastreio, v_kit.tramo;
    end if;
  end if;

  insert into public.proj_entregas_producao
    (projeto, codigo, data, turno, subprojeto_id, kit_id, tramo, tramo_unidade_id,
     recebido_por_nome, observacao, criado_por_id, criado_por_nome)
  values
    (v_projeto, p_entrega->>'codigo', (p_entrega->>'data')::date, nullif(p_entrega->>'turno',''),
     nullif(p_entrega->>'subprojeto_id',''), v_kit_id, v_kit.tramo, v_unidade,
     p_entrega->>'recebido_por_nome', nullif(p_entrega->>'observacao',''),
     nullif(p_entrega->>'criado_por_id','')::uuid, p_entrega->>'criado_por_nome')
  returning id into v_id;

  update public.proj_kits
     set status = 'entregue', entrega_id = v_id, entregue_em = now(),
         tramo_unidade_id = v_unidade
   where id = v_kit_id;

  if v_unidade is not null then
    update public.proj_tramos_gwjaco
       set status = 'entregue', updated_at = now()
     where id = v_unidade;
  end if;

  return jsonb_build_object('id', v_id, 'codigo', p_entrega->>'codigo', 'rastreio', v_kit.rastreio);
end;
$function$;
