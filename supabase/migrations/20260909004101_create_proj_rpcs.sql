-- =====================================================================
-- Almoxarifado > Projetos — RPCs transacionais dos formulários
--
-- Por que RPC e não insert direto do cliente: cada formulário grava em três
-- ou quatro tabelas ao mesmo tempo (documento + itens + razão + status do
-- tramo). Meio lançamento gravado é pior que nenhum — a posição de estoque
-- ficaria mentindo. Aqui ou entra tudo ou não entra nada.
--
-- E, principalmente: `proj_validar_saldo` roda DENTRO da transação da baixa.
-- É o que impede o estoque negativo que a planilha aceitava (-1, -12, -14 na
-- aba consolidada), onde ninguém sabia se era erro de digitação ou ruptura.
-- =====================================================================

-- Recebe [{item_id, quantidade}] com quantidade POSITIVA (o quanto se
-- pretende consumir) e levanta exceção listando o que falta. O detalhe da
-- exceção sai como JSON para a tela montar o painel de bloqueio.
create or replace function public.proj_validar_saldo(p_itens jsonb)
returns void
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_faltantes jsonb;
  v_resumo text;
  v_qtd integer;
begin
  with pedido as (
    select (x->>'item_id')::uuid as item_id, sum((x->>'quantidade')::numeric) as necessario
    from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) x
    group by 1
  ),
  saldo as (
    select p.item_id, p.necessario, coalesce(s.saldo, 0) as saldo,
           i.part_number, coalesce(i.descricao, i.description) as descricao, i.localizador
    from pedido p
    join public.proj_itens i on i.id = p.item_id
    left join public.vw_proj_saldo_almox s on s.item_id = p.item_id
  )
  select jsonb_agg(jsonb_build_object(
           'item_id', item_id, 'part_number', part_number, 'descricao', descricao,
           'localizador', localizador, 'necessario', necessario, 'saldo', saldo,
           'falta', necessario - saldo) order by (necessario - saldo) desc)
    into v_faltantes
  from saldo
  where necessario > saldo;

  if v_faltantes is null then
    return;
  end if;

  v_qtd := jsonb_array_length(v_faltantes);

  select string_agg(
           (f->>'part_number') || ' (falta ' || trim(to_char((f->>'falta')::numeric, 'FM999999990.###')) ||
           ' de ' || trim(to_char((f->>'necessario')::numeric, 'FM999999990.###')) || ')',
           '; ')
    into v_resumo
  from (select f from jsonb_array_elements(v_faltantes) f limit 8) t(f);

  raise exception 'Saldo insuficiente em % item(ns): %', v_qtd,
    v_resumo || case when v_qtd > 8 then ' e mais ' || (v_qtd - 8) || '...' else '' end
    using detail = v_faltantes::text, errcode = 'check_violation';
end;
$$;

-- F1 — Entrada de NF. O cliente já resolveu a explosão (proj_previa_explosao)
-- e o conferente ajustou o que contou; aqui a nota, os pais faturados e os
-- créditos entram numa transação só.
create or replace function public.proj_registrar_entrada_nf(
  p_nota jsonb,
  p_pais jsonb,
  p_movimentos jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_nota_id uuid;
  v_codigo text := p_nota->>'codigo';
  v_projeto text := coalesce(p_nota->>'projeto', 'GW_JACOBINA');
  v_total numeric;
  v_itens integer;
begin
  if coalesce(jsonb_array_length(p_movimentos), 0) = 0 then
    raise exception 'A nota precisa creditar ao menos um item.';
  end if;

  if exists (select 1 from jsonb_array_elements(p_movimentos) m where (m->>'quantidade')::numeric <= 0) then
    raise exception 'Entrada de NF so aceita quantidade positiva.';
  end if;

  select sum((m->>'quantidade')::numeric), count(*)
    into v_total, v_itens
  from jsonb_array_elements(p_movimentos) m;

  insert into public.proj_notas_entrada
    (projeto, codigo, data_entrada, numero_nf, fornecedor, subprojeto_id, observacao,
     total_itens, total_quantidade, criado_por_id, criado_por_nome)
  values
    (v_projeto, v_codigo, (p_nota->>'data_entrada')::date, p_nota->>'numero_nf',
     p_nota->>'fornecedor', nullif(p_nota->>'subprojeto_id',''), nullif(p_nota->>'observacao',''),
     v_itens, v_total, nullif(p_nota->>'criado_por_id','')::uuid, p_nota->>'criado_por_nome')
  returning id into v_nota_id;

  insert into public.proj_notas_entrada_pais
    (nota_id, bom_linha_id, part_number, cod_sap, descricao, quantidade_recebida,
     explodir, torres_equivalentes, divergencia)
  select
    v_nota_id, nullif(x->>'bom_linha_id','')::bigint, x->>'part_number', nullif(x->>'cod_sap',''),
    x->>'descricao', (x->>'quantidade_recebida')::numeric,
    coalesce((x->>'explodir')::boolean, true), nullif(x->>'torres_equivalentes','')::numeric,
    coalesce((x->>'divergencia')::boolean, false)
  from jsonb_array_elements(coalesce(p_pais, '[]'::jsonb)) x;

  insert into public.proj_movimentos
    (projeto, tipo, item_id, quantidade, documento_tipo, documento_id, documento_codigo,
     secao, tramo, bom_linha_id, origem_pai_pn, observacao, criado_por_id, criado_por_nome)
  select
    v_projeto, 'entrada_nf', (m->>'item_id')::uuid, (m->>'quantidade')::numeric,
    'nota', v_nota_id, v_codigo,
    nullif(m->>'secao',''), nullif(m->>'tramo',''),
    nullif(m->>'bom_linha_id','')::bigint, nullif(m->>'origem_pai_pn',''), nullif(m->>'observacao',''),
    nullif(p_nota->>'criado_por_id','')::uuid, p_nota->>'criado_por_nome'
  from jsonb_array_elements(p_movimentos) m;

  return jsonb_build_object('id', v_nota_id, 'codigo', v_codigo, 'total_itens', v_itens, 'total_quantidade', v_total);
end;
$$;

-- F2 — Ordem de separação para a pré-montagem. Congela o romaneio, debita o
-- almoxarifado e abre um kit por unidade de tramo alvo.
create or replace function public.proj_registrar_saida_premontagem(
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
    where t.id = a and t.tramo = v_tramo and t.status = 'pendente'
  );

  if v_invalidos is not null then
    raise exception 'Tramo(s) indisponivel(is) para separacao: %. Confira o tramo e se ja nao estao em processo.', v_invalidos;
  end if;

  perform public.proj_validar_saldo(
    (select jsonb_agg(jsonb_build_object('item_id', x->>'item_id', 'quantidade', x->>'qtd_total'))
     from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) x)
  );

  insert into public.proj_ordens_premontagem
    (projeto, codigo, subprojeto_id, tramo, quantidade_kits, observacao, criado_por_id, criado_por_nome)
  values
    (v_projeto, v_codigo, nullif(p_ordem->>'subprojeto_id',''), v_tramo, v_kits,
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

  insert into public.proj_movimentos
    (projeto, tipo, item_id, quantidade, documento_tipo, documento_id, documento_codigo,
     tramo, criado_por_id, criado_por_nome)
  select
    v_projeto, 'saida_premontagem', (x->>'item_id')::uuid, -(x->>'qtd_total')::numeric,
    'ordem', v_ordem_id, v_codigo, v_tramo,
    nullif(p_ordem->>'criado_por_id','')::uuid, p_ordem->>'criado_por_nome'
  from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) x;

  insert into public.proj_kits
    (projeto, rastreio, tramo, tramo_unidade_id, ordem_id, status, criado_por_id, criado_por_nome)
  select v_projeto, 'KIT-' || a, v_tramo, a, v_ordem_id, 'em_premontagem',
         nullif(p_ordem->>'criado_por_id','')::uuid, p_ordem->>'criado_por_nome'
  from unnest(p_alvos) a;

  update public.proj_tramos_gwjaco
     set status = 'em_premontagem', updated_at = now()
   where id = any(p_alvos);

  return jsonb_build_object('id', v_ordem_id, 'codigo', v_codigo);
end;
$$;

-- F3 — Apontamento de conclusão: o kit existe fisicamente e passou na qualidade.
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
  v_prontos integer;
  v_restantes integer;
begin
  select status into v_status from public.proj_ordens_premontagem where id = p_ordem_id and not excluido;
  if not found then
    raise exception 'Ordem de pre-montagem nao encontrada.';
  end if;
  if v_status <> 'em_processamento' then
    raise exception 'A ordem ja esta %.', v_status;
  end if;

  update public.proj_kits k
     set status = 'pronto',
         codigo = coalesce(nullif(x->>'codigo',''), k.codigo),
         qualidade_ok = coalesce((x->>'qualidade_ok')::boolean, true),
         nao_conformidade = nullif(x->>'nao_conformidade',''),
         observacao = nullif(x->>'observacao',''),
         concluido_em = now(),
         concluido_por_nome = p_usuario->>'nome'
    from jsonb_array_elements(coalesce(p_kits, '[]'::jsonb)) x
   where k.ordem_id = p_ordem_id
     and k.tramo_unidade_id = x->>'tramo_unidade_id'
     and k.status = 'em_premontagem';

  get diagnostics v_prontos = row_count;

  if v_prontos = 0 then
    raise exception 'Nenhum kit desta ordem estava aguardando apontamento.';
  end if;

  update public.proj_tramos_gwjaco t
     set status = 'kit_pronto', updated_at = now()
   from public.proj_kits k
   where k.ordem_id = p_ordem_id and k.status = 'pronto' and t.id = k.tramo_unidade_id;

  select count(*) into v_restantes
  from public.proj_kits where ordem_id = p_ordem_id and status = 'em_premontagem' and not excluido;

  if v_restantes = 0 then
    update public.proj_ordens_premontagem
       set status = 'concluida', concluida_em = now(), concluida_por_nome = p_usuario->>'nome'
     where id = p_ordem_id;
  end if;

  return jsonb_build_object('kits_concluidos', v_prontos, 'kits_restantes', v_restantes);
end;
$$;

-- F4 — Baixa do kit para a produção. Só sai kit que está pronto no buffer.
create or replace function public.proj_entregar_producao(p_entrega jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_kit_id uuid := (p_entrega->>'kit_id')::uuid;
  v_projeto text := coalesce(p_entrega->>'projeto', 'GW_JACOBINA');
  v_kit record;
begin
  select k.* into v_kit from public.proj_kits k where k.id = v_kit_id and not k.excluido;
  if not found then
    raise exception 'Kit nao encontrado.';
  end if;
  if v_kit.status <> 'pronto' then
    raise exception 'O kit % esta com status "%" — so kit pronto no buffer pode ser entregue.', v_kit.rastreio, v_kit.status;
  end if;

  insert into public.proj_entregas_producao
    (projeto, codigo, data, turno, subprojeto_id, kit_id, tramo, tramo_unidade_id,
     recebido_por_nome, observacao, criado_por_id, criado_por_nome)
  values
    (v_projeto, p_entrega->>'codigo', (p_entrega->>'data')::date, nullif(p_entrega->>'turno',''),
     nullif(p_entrega->>'subprojeto_id',''), v_kit_id, v_kit.tramo, v_kit.tramo_unidade_id,
     p_entrega->>'recebido_por_nome', nullif(p_entrega->>'observacao',''),
     nullif(p_entrega->>'criado_por_id','')::uuid, p_entrega->>'criado_por_nome')
  returning id into v_id;

  update public.proj_kits
     set status = 'entregue', entrega_id = v_id, entregue_em = now()
   where id = v_kit_id;

  update public.proj_tramos_gwjaco
     set status = 'entregue', updated_at = now()
   where id = v_kit.tramo_unidade_id;

  return jsonb_build_object('id', v_id, 'codigo', p_entrega->>'codigo', 'rastreio', v_kit.rastreio);
end;
$$;

-- F5 — Sobressalente / refugo: debita avulso sem avançar kit nenhum.
create or replace function public.proj_registrar_sobressalente(p_cab jsonb, p_itens jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_projeto text := coalesce(p_cab->>'projeto', 'GW_JACOBINA');
  v_codigo text := p_cab->>'codigo';
begin
  if coalesce(jsonb_array_length(p_itens), 0) = 0 then
    raise exception 'Informe ao menos um item.';
  end if;

  perform public.proj_validar_saldo(p_itens);

  insert into public.proj_sobressalentes
    (projeto, codigo, data, subprojeto_id, tramo, tramo_unidade_id, motivo, motivo_detalhe,
     aprovador_nome, aprovador_id, status, evidencias, observacao, criado_por_id, criado_por_nome)
  values
    (v_projeto, v_codigo, (p_cab->>'data')::date, nullif(p_cab->>'subprojeto_id',''),
     nullif(p_cab->>'tramo',''), nullif(p_cab->>'tramo_unidade_id',''), p_cab->>'motivo',
     nullif(p_cab->>'motivo_detalhe',''), p_cab->>'aprovador_nome', nullif(p_cab->>'aprovador_id','')::uuid,
     coalesce(nullif(p_cab->>'status',''), 'aprovado'), coalesce(p_cab->'evidencias', '[]'::jsonb),
     nullif(p_cab->>'observacao',''), nullif(p_cab->>'criado_por_id','')::uuid, p_cab->>'criado_por_nome')
  returning id into v_id;

  insert into public.proj_sobressalentes_itens (sobressalente_id, item_id, quantidade)
  select v_id, (x->>'item_id')::uuid, (x->>'quantidade')::numeric
  from jsonb_array_elements(p_itens) x;

  insert into public.proj_movimentos
    (projeto, tipo, item_id, quantidade, documento_tipo, documento_id, documento_codigo,
     tramo, tramo_unidade_id, observacao, criado_por_id, criado_por_nome)
  select
    v_projeto, 'saida_sobressalente', (x->>'item_id')::uuid, -(x->>'quantidade')::numeric,
    'sobressalente', v_id, v_codigo, nullif(p_cab->>'tramo',''), nullif(p_cab->>'tramo_unidade_id',''),
    p_cab->>'motivo', nullif(p_cab->>'criado_por_id','')::uuid, p_cab->>'criado_por_nome'
  from jsonb_array_elements(p_itens) x;

  return jsonb_build_object('id', v_id, 'codigo', v_codigo);
end;
$$;

-- Estas funções mexem em estoque: exigem login. A chave anon está no bundle
-- do app, então `anon` fica de fora (ver db/README.md).
revoke all on function public.proj_validar_saldo(jsonb) from public;
revoke all on function public.proj_registrar_entrada_nf(jsonb, jsonb, jsonb) from public;
revoke all on function public.proj_registrar_saida_premontagem(jsonb, jsonb, text[]) from public;
revoke all on function public.proj_concluir_premontagem(uuid, jsonb, jsonb) from public;
revoke all on function public.proj_entregar_producao(jsonb) from public;
revoke all on function public.proj_registrar_sobressalente(jsonb, jsonb) from public;

grant execute on function public.proj_validar_saldo(jsonb) to authenticated, service_role;
grant execute on function public.proj_registrar_entrada_nf(jsonb, jsonb, jsonb) to authenticated, service_role;
grant execute on function public.proj_registrar_saida_premontagem(jsonb, jsonb, text[]) to authenticated, service_role;
grant execute on function public.proj_concluir_premontagem(uuid, jsonb, jsonb) to authenticated, service_role;
grant execute on function public.proj_entregar_producao(jsonb) to authenticated, service_role;
grant execute on function public.proj_registrar_sobressalente(jsonb, jsonb) to authenticated, service_role;
