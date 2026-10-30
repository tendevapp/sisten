-- =====================================================================
-- Validação Técnica — redirecionar o chamado para outra área
-- =====================================================================
-- Quem pode decidir (admin, aprovador do setor ou marcado) também pode
-- passar o chamado adiante: escolhe a nova área e marca ao menos um usuário.
-- O chamado continua PENDENTE; área e marcados passam a ser os novos (quem
-- estava antes deixa de decidir) e cada passagem fica em `redirecionamentos`
-- — quem redirecionou continua vendo o chamado em Aprovações, só leitura.
-- Avisa os novos responsáveis (aprovadores da área + marcados) e o comprador.

alter table public.sup_validacao_tecnica
  add column if not exists redirecionamentos jsonb not null default '[]'::jsonb,
  add column if not exists redirecionado_por_ids text[] not null default '{}';

create or replace function public.sup_validacao_tecnica_redirecionar(
  p_id uuid,
  p_setor_id text,
  p_setor_nome text,
  p_marcados jsonb,
  p_motivo text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid text := (auth.uid())::text;
  v_nome text;
  v_setores jsonb;
  v_reg public.sup_validacao_tecnica%rowtype;
  v_motivo text := nullif(trim(coalesce(p_motivo, '')), '');
  v_ids text[];
  v_nomes text;
begin
  if auth.uid() is null then
    raise exception 'Sem sessão' using errcode = '42501';
  end if;
  if coalesce(trim(p_setor_id), '') = '' then
    raise exception 'Escolha a área para onde o chamado vai.' using errcode = '22023';
  end if;
  select coalesce(array_agg(distinct m->>'id'), '{}'), string_agg(m->>'nome', ', ')
    into v_ids, v_nomes
    from jsonb_array_elements(coalesce(p_marcados, '[]'::jsonb)) m
   where coalesce(m->>'id', '') <> '';
  if cardinality(v_ids) = 0 then
    raise exception 'Marque ao menos um usuário para receber o chamado.' using errcode = '22023';
  end if;

  select * into v_reg from public.sup_validacao_tecnica where id = p_id for update;
  if not found then
    raise exception 'Chamado não encontrado.' using errcode = 'P0002';
  end if;
  if v_reg.status <> 'PENDENTE' then
    raise exception 'O chamado % já foi decidido.', v_reg.codigo using errcode = '22023';
  end if;

  select name, aprovador_setores into v_nome, v_setores from public.core_perfis where id = v_uid;
  if not (public.has_role('admin')
          or coalesce(v_setores ? v_reg.setor_id, false)
          or v_uid = any(v_reg.marcados_ids)) then
    raise exception 'Você não é aprovador da área nem foi marcado no chamado %.', v_reg.codigo using errcode = '42501';
  end if;

  update public.sup_validacao_tecnica
     set setor_id = p_setor_id,
         setor_nome = p_setor_nome,
         marcados = p_marcados,
         marcados_ids = v_ids,
         redirecionado_por_ids = array(select distinct unnest(redirecionado_por_ids || v_uid)),
         redirecionamentos = redirecionamentos || jsonb_build_array(jsonb_build_object(
           'de_setor_id', v_reg.setor_id,
           'de_setor_nome', v_reg.setor_nome,
           'para_setor_id', p_setor_id,
           'para_setor_nome', p_setor_nome,
           'para', p_marcados,
           'motivo', v_motivo,
           'por', v_uid,
           'por_nome', v_nome,
           'em', now()
         ))
   where id = p_id;

  begin
    insert into public.core_notificacoes (id, user_id, title, description, type, is_read, created_at, context_key)
    select 'n_' || replace(gen_random_uuid()::text, '-', ''), u,
           'Validação técnica aguardando você',
           format('%s — %s redirecionou para você a validação técnica de RM %s / item %s: %s%s',
                  v_reg.codigo, coalesce(v_nome, 'Um aprovador'), coalesce(v_reg.rm, '—'),
                  coalesce(v_reg.item_reqc, '—'), coalesce(v_reg.texto_breve, v_reg.material_code, ''),
                  case when v_motivo is not null then ' (' || v_motivo || ')' else '' end),
           'info', false, now(),
           '/solicitacoes/aprovacoes?tipo=validacao&id=' || v_reg.id
      from (
        select unnest(public.alm_sol_extra_aprovadores(p_setor_id)) as u
        union
        select unnest(v_ids)
      ) d
     where u is distinct from v_uid;

    if v_reg.criado_por <> v_uid then
      insert into public.core_notificacoes (id, user_id, title, description, type, is_read, created_at, context_key)
      values ('n_' || replace(gen_random_uuid()::text, '-', ''), v_reg.criado_por,
              'Validação técnica redirecionada',
              format('%s — RM %s / item %s: %s passou para %s (%s)%s', v_reg.codigo, coalesce(v_reg.rm, '—'),
                     coalesce(v_reg.item_reqc, '—'), coalesce(v_nome, 'o aprovador'), coalesce(p_setor_nome, p_setor_id),
                     v_nomes, case when v_motivo is not null then ': ' || v_motivo else '' end),
              'info', false, now(),
              '/suprimentos/compras');
    end if;
  exception when others then
    raise warning 'sup_validacao_tecnica: falha ao notificar redirecionamento %: %', v_reg.codigo, sqlerrm;
  end;
end;
$$;

revoke all on function public.sup_validacao_tecnica_redirecionar(uuid, text, text, jsonb, text) from public, anon;
grant execute on function public.sup_validacao_tecnica_redirecionar(uuid, text, text, jsonb, text) to authenticated;
