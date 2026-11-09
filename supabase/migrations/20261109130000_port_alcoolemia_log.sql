-- Log de alterações do Teste de Alcoolemia (Portaria e SSMA).
--
-- Toda inclusão, alteração, exclusão (lógica ou física) e restauração em
-- port_alcoolemia_testes vira uma linha aqui, gravada por trigger — vale para
-- as duas telas, a fila offline, scripts e qualquer acesso direto à API.
-- Para auditoria, cada linha guarda a LINHA INTEIRA antes e depois (`antes` /
-- `depois`): uma edição ou exclusão nunca perde o dado anterior, mesmo que o
-- teste seja apagado de vez. `alteracoes` resume campo a campo (de → para)
-- para a tela. Ninguém altera nem apaga o log pela API.
--
-- Mesmo modelo de prod_tramos_entrega_log (20261007175327).

create table if not exists public.port_alcoolemia_testes_log (
  id bigint generated always as identity primary key,
  teste_id uuid not null,
  codigo_formulario text,
  operacao text not null check (operacao in ('inclusao', 'alteracao', 'exclusao', 'restauracao', 'exclusao_definitiva')),
  -- [{ "campo": "resultado", "de": "PENDENTE", "para": "NEGATIVO" }, ...]
  alteracoes jsonb not null default '[]'::jsonb,
  antes jsonb,
  depois jsonb,
  alterado_por uuid,
  alterado_por_nome text,
  -- 'app' = usuário logado; 'sistema' = migration, script ou rotina sem usuário.
  origem text not null check (origem in ('app', 'sistema')),
  created_at timestamptz not null default now()
);

create index if not exists idx_port_alcoolemia_log_teste on public.port_alcoolemia_testes_log (teste_id, created_at desc);
create index if not exists idx_port_alcoolemia_log_data on public.port_alcoolemia_testes_log (created_at desc);

alter table public.port_alcoolemia_testes_log enable row level security;
revoke all on public.port_alcoolemia_testes_log from anon, authenticated;
grant select on public.port_alcoolemia_testes_log to authenticated;

-- Mesma leitura do próprio teste (port_alcoolemia_testes_sel = true para logado).
drop policy if exists port_alcoolemia_testes_log_sel on public.port_alcoolemia_testes_log;
create policy port_alcoolemia_testes_log_sel on public.port_alcoolemia_testes_log
  for select to authenticated
  using (true);

create or replace function private.port_alcoolemia_registrar_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_antes jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_depois jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  -- Campos de controle não contam como alteração.
  v_ignorar text[] := array['updated_at', 'created_at'];
  v_alteracoes jsonb;
  v_operacao text;
  v_uid uuid := auth.uid();
  v_nome text;
begin
  -- Resumo campo a campo. A assinatura (PNG em base64) e as fotos ficam
  -- inteiras em antes/depois; no resumo viram um rótulo legível.
  select coalesce(jsonb_agg(jsonb_build_object(
           'campo', k,
           'de', case when k = 'assinatura_sorteado' then case when v_antes -> k is null or v_antes -> k = 'null'::jsonb then null else to_jsonb('assinada'::text) end
                      when k = 'fotos' then to_jsonb(coalesce(jsonb_array_length(v_antes -> k), 0) || ' foto(s)')
                      else v_antes -> k end,
           'para', case when k = 'assinatura_sorteado' then case when v_depois -> k is null or v_depois -> k = 'null'::jsonb then null else to_jsonb('assinada'::text) end
                        when k = 'fotos' then to_jsonb(coalesce(jsonb_array_length(v_depois -> k), 0) || ' foto(s)')
                        else v_depois -> k end
         ) order by k), '[]'::jsonb)
    into v_alteracoes
    from (
      select distinct k from (
        select jsonb_object_keys(coalesce(v_antes, '{}'::jsonb)) as k
        union
        select jsonb_object_keys(coalesce(v_depois, '{}'::jsonb))
      ) chaves
    ) c
   where not (k = any(v_ignorar))
     and (v_antes -> k) is distinct from (v_depois -> k);

  if tg_op = 'UPDATE' and jsonb_array_length(v_alteracoes) = 0 then
    return null;
  end if;

  v_operacao := case
    when tg_op = 'INSERT' then 'inclusao'
    when tg_op = 'DELETE' then 'exclusao_definitiva'
    when (v_antes ->> 'excluido_em') is null and (v_depois ->> 'excluido_em') is not null then 'exclusao'
    when (v_antes ->> 'excluido_em') is not null and (v_depois ->> 'excluido_em') is null then 'restauracao'
    else 'alteracao'
  end;

  if v_uid is not null then
    select perfil.name into v_nome from public.core_perfis perfil where perfil.id = v_uid::text;
  end if;

  insert into public.port_alcoolemia_testes_log
    (teste_id, codigo_formulario, operacao, alteracoes, antes, depois, alterado_por, alterado_por_nome, origem)
  values (
    coalesce(v_depois ->> 'id', v_antes ->> 'id')::uuid,
    coalesce(v_depois ->> 'codigo_formulario', v_antes ->> 'codigo_formulario'),
    v_operacao,
    -- Na inclusão o resumo seria a ficha inteira; a linha completa já está em `depois`.
    case when tg_op = 'INSERT' then '[]'::jsonb else v_alteracoes end,
    v_antes,
    v_depois,
    v_uid,
    v_nome,
    case when v_uid is null then 'sistema' else 'app' end
  );
  return null;
end;
$$;

revoke all on function private.port_alcoolemia_registrar_log() from public, anon, authenticated;

drop trigger if exists trg_port_alcoolemia_log on public.port_alcoolemia_testes;
create trigger trg_port_alcoolemia_log
  after insert or update or delete on public.port_alcoolemia_testes
  for each row execute function private.port_alcoolemia_registrar_log();
