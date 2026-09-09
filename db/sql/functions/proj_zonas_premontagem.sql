-- =====================================================================
-- ESPELHO DOCUMENTAL — não é executado pelo Supabase CLI.
-- A fonte aplicada é a migration em supabase/migrations/:
--   20260909124221_create_proj_zonas_premontagem.sql
-- Mantido aqui pela convenção de db/README.md.
-- =====================================================================

-- =====================================================================
-- Almoxarifado > Projetos — separação por zona dentro do tramo (T1)
--
-- T1 é o único tramo cuja BOM sustenta mais de uma frente física de
-- montagem simultânea: Escada de Acesso, Plataforma Inferior e Plataforma
-- Superior/Média são bancadas distintas que separam suas peças em momentos
-- diferentes, mas todas compõem o MESMO kit físico do tramo (T1-3143, por
-- exemplo). Os outros tramos (T2..T5) continuam com romaneio único, como
-- antes — a lista de zonas por tramo é decidida no app (src/lib/projetosZonas.ts),
-- não aqui; o banco só sabe que uma ordem PODE ter uma `zona` opcional.
--
-- Isso muda duas regras do RPC de separação:
--
-- 1. Um tramo já `em_premontagem` (primeira zona separada) volta a aceitar
--    separação — desde que seja para uma zona AINDA NÃO separada daquele
--    tramo. Sem zona (tramos sem split), a regra antiga continua: só aceita
--    tramo `pendente`.
-- 2. O kit (`proj_kits`, chave única por `rastreio`) passa a ser criado de
--    forma idempotente — a 2ª e 3ª zona reaproveitam o MESMO kit em vez de
--    tentar inserir uma linha duplicada.
--
-- O apontamento de conclusão (F3) deixa de casar kit por `ordem_id` (que só
-- aponta para a ordem que criou o kit, a primeira zona) e passa a casar por
-- `tramo_unidade_id` através dos alvos da ordem chamada — assim qualquer uma
-- das 3 ordens de zona consegue concluir o kit compartilhado.
--
-- NOTA: o banco não impede apontar conclusão antes das 3 zonas estarem
-- separadas — essa trava fica na tela (só habilita o botão quando as zonas
-- esperadas do tramo, definidas em TS, estiverem todas com ordem registrada).
-- Documentado aqui para quem for auditar o RPC isoladamente.
-- =====================================================================

alter table public.proj_ordens_premontagem add column if not exists zona text;

comment on column public.proj_ordens_premontagem.zona is
  'Fatia do romaneio do tramo coberta por esta ordem (ex.: escada_acesso). Null = romaneio inteiro do tramo, tramos sem zona definida.';

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
          -- tramo já em separação: só reabre se a ORDEM TEM ZONA e essa
          -- zona especificamente ainda não foi separada para este alvo.
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

  perform public.proj_validar_saldo(
    (select jsonb_agg(jsonb_build_object('item_id', x->>'item_id', 'quantidade', x->>'qtd_total'))
     from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) x)
  );

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

  insert into public.proj_movimentos
    (projeto, tipo, item_id, quantidade, documento_tipo, documento_id, documento_codigo,
     tramo, criado_por_id, criado_por_nome)
  select
    v_projeto, 'saida_premontagem', (x->>'item_id')::uuid, -(x->>'qtd_total')::numeric,
    'ordem', v_ordem_id, v_codigo, v_tramo,
    nullif(p_ordem->>'criado_por_id','')::uuid, p_ordem->>'criado_por_nome'
  from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) x;

  -- Idempotente: se outra zona já criou o kit deste tramo, reaproveita —
  -- a 2ª/3ª zona não fabricam um kit novo, só somam peças no mesmo.
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
  select status into v_status from public.proj_ordens_premontagem where id = p_ordem_id and excluido_em is null;
  if not found then
    raise exception 'Ordem de pre-montagem nao encontrada.';
  end if;
  if v_status <> 'em_processamento' then
    raise exception 'A ordem ja esta %.', v_status;
  end if;

  -- Casa por tramo_unidade_id (via os alvos DESTA ordem), não por
  -- proj_kits.ordem_id — o kit pode ter sido criado por uma zona anterior
  -- do mesmo tramo, e ainda assim esta ordem precisa poder concluí-lo.
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
