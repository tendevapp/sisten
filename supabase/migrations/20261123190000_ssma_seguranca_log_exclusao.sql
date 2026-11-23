-- Formulários da Segurança — ISP (FRM.SEG-0036), Ronda (FRM.SEG-0041) e
-- Observação Comportamental (FRM.SEG-0042): exclusão lógica com motivo e log
-- de auditoria.
--
-- Exclusão: nunca apaga. Grava excluido_em/excluido_por/motivo_exclusao pela
-- RPC ssma_seg_excluir_registro (autor ou administrador). O registro some do
-- histórico e da exportação, mas fica no banco e pode ser restaurado. O índice
-- do código não é reaproveitado.
--
-- Log: toda inclusão, exclusão, restauração e alteração vira uma linha em
-- ssma_seg_formularios_log, gravada por trigger. `antes`/`depois` guardam o
-- registro inteiro com os filhos (respostas e ações do ISP, participantes da
-- Ronda, marcações e desvios da Observação). Assinaturas e fotos entram como
-- rótulo ("assinada", "2 foto(s)"): o dado completo continua no próprio
-- registro, que não é apagado. Ninguém altera nem apaga o log pela API.
--
-- O trigger de inclusão/alteração é DEFERRABLE: roda no fim da transação, quando
-- a RPC de registro já gravou os filhos. Mesmo modelo de port_alcoolemia_testes_log.

alter table public.ssma_isp_inspecoes
  add column excluido_em timestamptz,
  add column excluido_por uuid,
  add column motivo_exclusao text,
  add constraint ssma_isp_inspecoes_exclusao_ck check (excluido_em is null or (excluido_por is not null and length(btrim(coalesce(motivo_exclusao, ''))) between 3 and 1000));
alter table public.ssma_rondas
  add column excluido_em timestamptz,
  add column excluido_por uuid,
  add column motivo_exclusao text,
  add constraint ssma_rondas_exclusao_ck check (excluido_em is null or (excluido_por is not null and length(btrim(coalesce(motivo_exclusao, ''))) between 3 and 1000));
alter table public.ssma_oc_registros
  add column excluido_em timestamptz,
  add column excluido_por uuid,
  add column motivo_exclusao text,
  add constraint ssma_oc_registros_exclusao_ck check (excluido_em is null or (excluido_por is not null and length(btrim(coalesce(motivo_exclusao, ''))) between 3 and 1000));

-- ---------------------------------------------------------------------------
-- Log
-- ---------------------------------------------------------------------------

create table public.ssma_seg_formularios_log (
  id bigint generated always as identity primary key,
  formulario text not null check (formulario in ('isp', 'ronda', 'oc')),
  registro_id uuid not null,
  codigo text,
  operacao text not null check (operacao in ('inclusao', 'alteracao', 'exclusao', 'restauracao', 'exclusao_definitiva')),
  -- [{ "campo": "motivo_exclusao", "de": null, "para": "Lançado em duplicidade" }, ...]
  alteracoes jsonb not null default '[]'::jsonb,
  antes jsonb,
  depois jsonb,
  alterado_por uuid,
  alterado_por_nome text,
  -- 'app' = usuário logado; 'sistema' = migration, script ou rotina sem usuário.
  origem text not null check (origem in ('app', 'sistema')),
  created_at timestamptz not null default now()
);
create index ssma_seg_formularios_log_registro_idx on public.ssma_seg_formularios_log (formulario, registro_id, created_at desc);

create function private.ssma_seg_pode_acessar(p_formulario text) returns boolean
language sql stable security invoker set search_path = '' as $$
  select case p_formulario
    when 'isp' then public.ssma_isp_pode_acessar()
    when 'ronda' then public.ssma_ronda_pode_acessar()
    when 'oc' then public.ssma_oc_pode_acessar()
    else false end
$$;
revoke all on function private.ssma_seg_pode_acessar(text) from public, anon;
grant execute on function private.ssma_seg_pode_acessar(text) to authenticated;

alter table public.ssma_seg_formularios_log enable row level security;
revoke all on public.ssma_seg_formularios_log from public, anon, authenticated;
grant select on public.ssma_seg_formularios_log to authenticated;
create policy ssma_seg_log_leitura on public.ssma_seg_formularios_log for select to authenticated
  using ((select private.ssma_seg_pode_acessar(formulario)));

-- Código MODULO-DDMMYY-NN (mesma regra de gerarCodigoFormulario; lpad cortaria o índice 100).
create function private.ssma_seg_codigo(p_prefixo text, p_data date, p_indice integer) returns text
language sql immutable set search_path = '' as $$
  select p_prefixo || '-' || to_char(p_data, 'DDMMYY') || '-' ||
    case when p_indice < 10 then '0' || p_indice::text else p_indice::text end
$$;

-- Assinatura e fotos viram rótulo no log.
create function private.ssma_seg_valor_log(p_campo text, p_valor jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select case
    when p_valor is null or p_valor = 'null'::jsonb then p_valor
    when p_campo like 'assinatura%' then to_jsonb('assinada'::text)
    when p_campo = 'fotos' and jsonb_typeof(p_valor) = 'array' then to_jsonb(jsonb_array_length(p_valor) || ' foto(s)')
    else p_valor end
$$;

-- Registro + filhos, para `antes`/`depois`.
create function private.ssma_seg_snapshot(p_formulario text, p_linha jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_id uuid := (p_linha ->> 'id')::uuid;
  v jsonb := '{}'::jsonb;
  k text;
begin
  for k in select jsonb_object_keys(p_linha) loop
    if k not in ('hash_envio', 'pedido_hash') then
      v := v || jsonb_build_object(k, private.ssma_seg_valor_log(k, p_linha -> k));
    end if;
  end loop;
  if p_formulario = 'isp' then
    v := v || jsonb_build_object(
      'respostas', coalesce((select jsonb_object_agg(r.item, r.quantidade) from public.ssma_isp_respostas r where r.inspecao_id = v_id), '{}'::jsonb),
      'acoes', coalesce((select jsonb_agg(to_jsonb(a) - 'inspecao_id' order by a.ordem) from public.ssma_isp_acoes a where a.inspecao_id = v_id), '[]'::jsonb));
  elsif p_formulario = 'ronda' then
    v := v || jsonb_build_object('participantes', coalesce((select jsonb_agg(jsonb_build_object(
      'ordem', p.ordem, 'nome', p.nome, 'assinatura', case when p.assinatura is null then null else 'assinada' end) order by p.ordem)
      from public.ssma_ronda_participantes p where p.ronda_id = v_id), '[]'::jsonb));
  elsif p_formulario = 'oc' then
    v := v || jsonb_build_object(
      'itens', coalesce((select jsonb_agg(m.item_id order by m.item_id) from public.ssma_oc_marcacoes m where m.registro_id = v_id), '[]'::jsonb),
      'desvios', coalesce((select jsonb_agg(d.descricao order by d.ordem) from public.ssma_oc_desvios d where d.registro_id = v_id), '[]'::jsonb));
  end if;
  return v;
end $$;
revoke all on function private.ssma_seg_snapshot(text, jsonb) from public, anon, authenticated;

-- tg_argv[0] = formulário ('isp' | 'ronda' | 'oc'); tg_argv[1] = prefixo do código.
create function private.ssma_seg_registrar_log() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_form text := tg_argv[0];
  v_antes jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) - 'hash_envio' - 'pedido_hash' end;
  v_depois jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) - 'hash_envio' - 'pedido_hash' end;
  v_linha jsonb := coalesce(v_depois, v_antes);
  v_alteracoes jsonb;
  v_operacao text;
  v_uid uuid := auth.uid();
  v_nome text;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
           'campo', k,
           'de', private.ssma_seg_valor_log(k, v_antes -> k),
           'para', private.ssma_seg_valor_log(k, v_depois -> k)) order by k), '[]'::jsonb)
    into v_alteracoes
    from (select jsonb_object_keys(coalesce(v_antes, '{}'::jsonb)) as k
          union select jsonb_object_keys(coalesce(v_depois, '{}'::jsonb))) chaves
   where (v_antes -> k) is distinct from (v_depois -> k);

  if tg_op = 'UPDATE' and jsonb_array_length(v_alteracoes) = 0 then return null; end if;

  v_operacao := case
    when tg_op = 'INSERT' then 'inclusao'
    when tg_op = 'DELETE' then 'exclusao_definitiva'
    when (v_antes ->> 'excluido_em') is null and (v_depois ->> 'excluido_em') is not null then 'exclusao'
    when (v_antes ->> 'excluido_em') is not null and (v_depois ->> 'excluido_em') is null then 'restauracao'
    else 'alteracao' end;

  if v_uid is not null then
    select perfil.name into v_nome from public.core_perfis perfil where perfil.id = v_uid::text;
  end if;

  insert into public.ssma_seg_formularios_log
    (formulario, registro_id, codigo, operacao, alteracoes, antes, depois, alterado_por, alterado_por_nome, origem)
  values (
    v_form,
    (v_linha ->> 'id')::uuid,
    private.ssma_seg_codigo(tg_argv[1], (v_linha ->> 'data')::date, (v_linha ->> 'indice')::integer),
    v_operacao,
    -- Na inclusão o resumo seria o registro inteiro; ele já está em `depois`.
    case when tg_op = 'INSERT' then '[]'::jsonb else v_alteracoes end,
    case when v_antes is null then null else private.ssma_seg_snapshot(v_form, v_antes) end,
    case when v_depois is null then null else private.ssma_seg_snapshot(v_form, v_depois) end,
    v_uid,
    v_nome,
    case when v_uid is null then 'sistema' else 'app' end
  );
  return case when tg_op = 'DELETE' then old else null end;
end $$;
revoke all on function private.ssma_seg_registrar_log() from public, anon, authenticated;

-- Inclusão/alteração no fim da transação (filhos já gravados); apagar, antes
-- (filhos ainda existem para o retrato).
create constraint trigger trg_ssma_isp_log after insert or update on public.ssma_isp_inspecoes
  deferrable initially deferred for each row execute function private.ssma_seg_registrar_log('isp', 'ISP');
create trigger trg_ssma_isp_log_del before delete on public.ssma_isp_inspecoes
  for each row execute function private.ssma_seg_registrar_log('isp', 'ISP');
create constraint trigger trg_ssma_ronda_log after insert or update on public.ssma_rondas
  deferrable initially deferred for each row execute function private.ssma_seg_registrar_log('ronda', 'RST');
create trigger trg_ssma_ronda_log_del before delete on public.ssma_rondas
  for each row execute function private.ssma_seg_registrar_log('ronda', 'RST');
create constraint trigger trg_ssma_oc_log after insert or update on public.ssma_oc_registros
  deferrable initially deferred for each row execute function private.ssma_seg_registrar_log('oc', 'OC');
create trigger trg_ssma_oc_log_del before delete on public.ssma_oc_registros
  for each row execute function private.ssma_seg_registrar_log('oc', 'OC');

-- ---------------------------------------------------------------------------
-- Excluir / restaurar (autor ou administrador). Fica fora da fila offline:
-- é ação de escritório (CLAUDE.md §3).
-- ---------------------------------------------------------------------------

create function private.ssma_seg_tabela(p_formulario text) returns text
language sql immutable set search_path = '' as $$
  select case p_formulario when 'isp' then 'ssma_isp_inspecoes' when 'ronda' then 'ssma_rondas' when 'oc' then 'ssma_oc_registros' end
$$;

create function private.ssma_seg_checar_dono(p_formulario text, p_id uuid, out o_tabela text, out o_excluido timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  v_dono uuid;
  v_achou boolean;
begin
  o_tabela := private.ssma_seg_tabela(p_formulario);
  if o_tabela is null then raise exception 'Formulário inválido.'; end if;
  if not private.ssma_seg_pode_acessar(p_formulario) then
    raise exception 'Perfil sem acesso a este formulário.' using errcode = '42501';
  end if;
  execute format('select true, criado_por, excluido_em from public.%I where id = $1 for update', o_tabela)
    into v_achou, v_dono, o_excluido using p_id;
  if v_achou is null then raise exception 'Registro não encontrado.'; end if;
  if v_dono is distinct from auth.uid() and not exists (
    select 1 from public.core_perfis p where p.id = (select auth.uid())::text and p.status = 'ativo' and 'admin' = any(p.roles)) then
    raise exception 'Só quem registrou ou um administrador pode excluir ou restaurar.' using errcode = '42501';
  end if;
end $$;
revoke all on function private.ssma_seg_checar_dono(text, uuid) from public, anon, authenticated;

create function public.ssma_seg_excluir_registro(p_formulario text, p_id uuid, p_motivo text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_tabela text;
  v_excluido timestamptz;
begin
  if length(btrim(coalesce(p_motivo, ''))) < 3 then raise exception 'Informe o motivo da exclusão.'; end if;
  select o_tabela, o_excluido into v_tabela, v_excluido from private.ssma_seg_checar_dono(p_formulario, p_id);
  if v_excluido is not null then return; end if;
  execute format('update public.%I set excluido_em = now(), excluido_por = auth.uid(), motivo_exclusao = $2 where id = $1', v_tabela)
    using p_id, left(btrim(p_motivo), 1000);
end $$;

create function public.ssma_seg_restaurar_registro(p_formulario text, p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_tabela text;
  v_excluido timestamptz;
begin
  select o_tabela, o_excluido into v_tabela, v_excluido from private.ssma_seg_checar_dono(p_formulario, p_id);
  if v_excluido is null then return; end if;
  execute format('update public.%I set excluido_em = null, excluido_por = null, motivo_exclusao = null where id = $1', v_tabela)
    using p_id;
end $$;

revoke all on function public.ssma_seg_excluir_registro(text, uuid, text), public.ssma_seg_restaurar_registro(text, uuid) from public, anon;
grant execute on function public.ssma_seg_excluir_registro(text, uuid, text), public.ssma_seg_restaurar_registro(text, uuid) to authenticated;
