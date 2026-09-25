-- =====================================================================
-- Produção › Apontamentos — RPCs.
--
-- Toda escrita de execução/evento/checklist/green tag passa por aqui porque
-- precisa, na mesma transação: validar a cadeia (a peça só entra na etapa
-- com a anterior finalizada, ou com o Green Tag da nave anterior), a posição
-- livre e o checklist; gerar o código; e gravar o evento com a hora do toque.
--
-- `prod_apt_registrar_evento` é IDEMPOTENTE por `client_id` — é o handler do
-- outbox (src/lib/outbox.ts): o reenvio de um toque feito offline devolve o
-- que já foi gravado em vez de duplicar.
-- =====================================================================

-- Próximo código `PREFIXO-DDMMYY-NN` (regra 2 do CLAUDE.md). Recorte do
-- índice: POR DIA — são dezenas de apontamentos por turno, e o dia bate com o
-- relatório diário. Lê as duas tabelas numeradas (APT em execuções, GT em
-- green tags). O advisory lock serializa dois apontamentos simultâneos do
-- mesmo prefixo/dia, que de outro modo pegariam o mesmo índice.
create or replace function public.prod_apt_proximo_codigo(p_prefixo text, p_data date)
returns text
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_ddmmyy text := to_char(p_data, 'DDMMYY');
  v_prefixo text := upper(p_prefixo);
  v_max int;
begin
  perform pg_advisory_xact_lock(hashtext('prod_apt_codigo:' || v_prefixo || v_ddmmyy));
  select coalesce(max((regexp_match(c.codigo, '^' || v_prefixo || '-\d{6}-(\d+)$'))[1]::int), 0)
    into v_max
    from (
      select codigo from public.prod_apt_execucoes
      union all
      select codigo from public.prod_apt_green_tags
    ) c
   where c.codigo like v_prefixo || '-' || v_ddmmyy || '-%';
  return v_prefixo || '-' || v_ddmmyy || '-' || lpad((v_max + 1)::text, 2, '0');
end;
$$;

-- A peça (virola ou tramo) já cumpriu a etapa? Regras:
--   * etapa por chapa ou inativa, ou que não se aplica ao tipo do tramo → sim;
--   * por virola com virola informada → aquela virola finalizada;
--   * por virola SEM virola (pergunta feita por um tramo) → TODAS as virolas
--     do tramo finalizadas — é o ponto em que o tramo "se forma";
--   * por tramo → o tramo finalizado.
create or replace function public.prod_apt_etapa_concluida(p_etapa_id text, p_virola_id text, p_tramo_id text)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce((
    select case
      when e.nivel = 'chapa' or not e.ativa then true
      when e.tramos is not null and not exists (
        select 1 from public.proj_tramos_gwjaco g where g.id = p_tramo_id and g.tramo = any(e.tramos)
      ) then true
      when e.nivel = 'virola' and p_virola_id is not null then exists (
        select 1 from public.prod_apt_execucoes x
         where x.etapa_id = e.id and x.virola_id = p_virola_id
           and x.status = 'finalizada' and x.excluido_em is null
      )
      when e.nivel = 'virola' then
        exists (select 1 from public.prod_virolas v where v.tramo_unidade_id = p_tramo_id)
        and not exists (
          select 1 from public.prod_virolas v
           where v.tramo_unidade_id = p_tramo_id
             and not exists (
               select 1 from public.prod_apt_execucoes x
                where x.etapa_id = e.id and x.virola_id = v.id
                  and x.status = 'finalizada' and x.excluido_em is null
             )
        )
      else exists (
        select 1 from public.prod_apt_execucoes x
         where x.etapa_id = e.id and x.tramo_id = p_tramo_id and x.virola_id is null
           and x.status = 'finalizada' and x.excluido_em is null
      )
    end
    from public.prod_apt_etapas e
   where e.id = p_etapa_id
  ), false);
$$;

-- A peça pode entrar na etapa? Com etapa anterior → a anterior concluída.
-- Sem anterior: livre na Nave 1; na Nave 2/White exige o Green Tag da nave
-- anterior.
create or replace function public.prod_apt_liberado_para(p_etapa_id text, p_virola_id text, p_tramo_id text)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce((
    select case
      when e.etapa_anterior_id is not null then public.prod_apt_etapa_concluida(e.etapa_anterior_id, p_virola_id, p_tramo_id)
      when e.nave = 'nave1' then true
      else exists (
        select 1 from public.prod_apt_green_tags gt
         where gt.tramo_id = p_tramo_id and gt.excluido_em is null
           and gt.passagem = case e.nave when 'nave2' then 'n1_n2' else 'n2_white' end
      )
    end
    from public.prod_apt_etapas e
   where e.id = p_etapa_id
  ), false);
$$;

-- Fila de uma etapa: peças liberadas, sem execução aberta e ainda não
-- finalizadas aqui. Com `p_retrabalho`, o inverso: as já finalizadas (para
-- reabrir como Recalandra/Repintura...). Etapas por chapa não têm fila.
create or replace function public.prod_apt_fila(
  p_etapa_id text,
  p_busca text default null,
  p_retrabalho boolean default false,
  p_limite integer default 300
)
returns table (
  virola_id text,
  tramo_id text,
  tramo text,
  serie integer,
  virola text,
  ordem integer,
  status_qualidade text
)
language sql
stable
set search_path = public, pg_temp
as $$
  with e as (
    select * from public.prod_apt_etapas where id = p_etapa_id and ativa
  ),
  b as (
    select nullif(btrim(coalesce(p_busca, '')), '') as termo
  )
  select q.virola_id, q.tramo_id, q.tramo, q.serie, q.virola, q.ordem, q.status_qualidade
  from (
    select v.id as virola_id, v.tramo_unidade_id as tramo_id, v.tramo, g.serie, v.virola, v.ordem, v.status_atual as status_qualidade
      from e
      cross join b
      join public.prod_virolas v on e.nivel = 'virola'
      join public.proj_tramos_gwjaco g on g.id = v.tramo_unidade_id
     where (e.tramos is null or v.tramo = any(e.tramos))
       and (b.termo is null or v.id ilike '%' || b.termo || '%')
       and not exists (
         select 1 from public.prod_apt_execucoes x
          where x.etapa_id = e.id and x.virola_id = v.id
            and x.status in ('em_andamento','pausada') and x.excluido_em is null
       )
       and case
         when p_retrabalho then public.prod_apt_etapa_concluida(e.id, v.id, v.tramo_unidade_id)
         else not public.prod_apt_etapa_concluida(e.id, v.id, v.tramo_unidade_id)
              and public.prod_apt_liberado_para(e.id, v.id, v.tramo_unidade_id)
       end
    union all
    select null, g.id, g.tramo, g.serie, null, 0, null
      from e
      cross join b
      join public.proj_tramos_gwjaco g on e.nivel = 'tramo'
     where (e.tramos is null or g.tramo = any(e.tramos))
       and (b.termo is null or g.id ilike '%' || b.termo || '%')
       and not exists (
         select 1 from public.prod_apt_execucoes x
          where x.etapa_id = e.id and x.tramo_id = g.id and x.virola_id is null
            and x.status in ('em_andamento','pausada') and x.excluido_em is null
       )
       and case
         when p_retrabalho then public.prod_apt_etapa_concluida(e.id, null, g.id)
         else not public.prod_apt_etapa_concluida(e.id, null, g.id)
              and public.prod_apt_liberado_para(e.id, null, g.id)
       end
  ) q
  order by q.serie, q.ordem
  limit greatest(coalesce(p_limite, 300), 1);
$$;

-- Requisitos do Green Tag de saída de uma nave para um tramo: cada etapa
-- marcada `requisito_green_tag` que se aplica ao tipo do tramo, com quanto
-- já foi concluído (virolas finalizadas / total, ou 0/1 para etapa de tramo).
create or replace function public.prod_apt_pendencias_green_tag(p_tramo_id text, p_passagem text)
returns table (etapa_id text, etapa_nome text, nivel text, concluidas integer, total integer)
language sql
stable
set search_path = public, pg_temp
as $$
  select
    e.id,
    e.nome,
    e.nivel,
    case when e.nivel = 'virola' then (
      select count(*)::int from public.prod_virolas v
       where v.tramo_unidade_id = g.id
         and exists (
           select 1 from public.prod_apt_execucoes x
            where x.etapa_id = e.id and x.virola_id = v.id
              and x.status = 'finalizada' and x.excluido_em is null
         )
    ) else (
      exists (
        select 1 from public.prod_apt_execucoes x
         where x.etapa_id = e.id and x.tramo_id = g.id and x.virola_id is null
           and x.status = 'finalizada' and x.excluido_em is null
      )
    )::int end,
    case when e.nivel = 'virola' then (
      select count(*)::int from public.prod_virolas v where v.tramo_unidade_id = g.id
    ) else 1 end
  from public.proj_tramos_gwjaco g
  join public.prod_apt_etapas e
    on e.ativa and e.requisito_green_tag and e.nivel <> 'chapa'
   and e.nave = case p_passagem when 'n1_n2' then 'nave1' when 'n2_white' then 'nave2' end
   and (e.tramos is null or g.tramo = any(e.tramos))
  where g.id = p_tramo_id
  order by e.ordem;
$$;

-- Tramos prontos para receber o Green Tag: todos os requisitos concluídos,
-- sem tag ativa nesta passagem (e, para N2→White, já com o de N1→N2).
create or replace function public.prod_apt_candidatos_green_tag(p_passagem text)
returns table (tramo_id text, tramo text, serie integer)
language sql
stable
set search_path = public, pg_temp
as $$
  select g.id, g.tramo, g.serie
    from public.proj_tramos_gwjaco g
   where not exists (
           select 1 from public.prod_apt_green_tags gt
            where gt.tramo_id = g.id and gt.passagem = p_passagem and gt.excluido_em is null
         )
     and (p_passagem = 'n1_n2' or exists (
           select 1 from public.prod_apt_green_tags gt
            where gt.tramo_id = g.id and gt.passagem = 'n1_n2' and gt.excluido_em is null
         ))
     -- Só quem já começou a nave: sem isso, uma nave sem requisitos
     -- cadastrados listaria os 345 tramos.
     and exists (
           select 1 from public.prod_apt_execucoes x
            where x.tramo_id = g.id and x.excluido_em is null and x.status = 'finalizada'
              and x.nave = case p_passagem when 'n1_n2' then 'nave1' else 'nave2' end
         )
     and not exists (
           select 1 from public.prod_apt_pendencias_green_tag(g.id, p_passagem) pp
            where pp.concluidas < pp.total
         )
   order by g.serie;
$$;

-- ---------------------------------------------------------------------
-- Escrita
-- ---------------------------------------------------------------------

create or replace function public.prod_apt_registrar_evento(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid text := (select auth.uid())::text;
  v_client_id uuid := nullif(p->>'client_id', '')::uuid;
  v_tipo text := p->>'tipo';
  v_quando timestamptz := coalesce(nullif(p->>'ocorrido_em', '')::timestamptz, now());
  v_obs text := nullif(btrim(coalesce(p->>'observacao', '')), '');
  v_retrabalho boolean := coalesce((p->>'retrabalho')::boolean, false);
  v_nome text;
  v_ja record;
  v_exec public.prod_apt_execucoes%rowtype;
  v_etapa public.prod_apt_etapas%rowtype;
  v_virola public.prod_virolas%rowtype;
  v_tramo public.proj_tramos_gwjaco%rowtype;
  v_posicao public.prod_apt_posicoes%rowtype;
  v_motivo public.prod_apt_motivos_pausa%rowtype;
  v_exec_id uuid;
  v_tramo_id text;
  v_peca text;
  v_ocupante text;
  v_pendentes int;
  v_quantidade numeric;
  v_situacao text;
begin
  if v_uid is null then
    raise exception 'Sessão expirada — entre novamente para apontar.';
  end if;
  if v_client_id is null then
    raise exception 'client_id é obrigatório.';
  end if;
  if v_tipo is null or v_tipo not in ('inicio','pausa','retomada','fim','situacao') then
    raise exception 'Tipo de apontamento inválido: %', coalesce(v_tipo, '(vazio)');
  end if;

  select e.execucao_id, x.codigo, x.status into v_ja
    from public.prod_apt_eventos e
    join public.prod_apt_execucoes x on x.id = e.execucao_id
   where e.client_id = v_client_id;
  if found then
    return jsonb_build_object('execucao_id', v_ja.execucao_id, 'codigo', v_ja.codigo, 'status', v_ja.status, 'ja_existia', true);
  end if;

  -- Relógio do aparelho adiantado não cria evento no futuro.
  if v_quando > now() + interval '5 minutes' then
    v_quando := now();
  end if;
  select name into v_nome from public.core_perfis where id = v_uid;
  v_nome := coalesce(nullif(p->>'usuario_nome', ''), v_nome);

  if v_tipo = 'inicio' then
    select * into v_etapa from public.prod_apt_etapas where id = p->>'etapa_id';
    if not found or not v_etapa.ativa then
      raise exception 'Etapa desconhecida ou inativa: %', p->>'etapa_id';
    end if;
    if not private.prod_apt_pode('prod_apontar_' || v_etapa.nave) then
      raise exception 'Sem permissão para apontar nesta nave.';
    end if;
    if v_retrabalho and not v_etapa.permite_retrabalho then
      raise exception 'A etapa % não admite retrabalho.', v_etapa.nome;
    end if;

    v_exec_id := coalesce(nullif(p->>'execucao_id', '')::uuid, gen_random_uuid());
    if exists (select 1 from public.prod_apt_execucoes where id = v_exec_id) then
      raise exception 'Execução já registrada com outro apontamento.';
    end if;

    if v_etapa.nivel = 'virola' then
      select * into v_virola from public.prod_virolas where id = p->>'virola_id';
      if not found then
        raise exception 'Virola desconhecida: %', coalesce(p->>'virola_id', '(vazia)');
      end if;
      v_tramo_id := v_virola.tramo_unidade_id;
      v_peca := v_virola.id;
      if v_etapa.tramos is not null and not (v_virola.tramo = any(v_etapa.tramos)) then
        raise exception '% não se aplica ao %.', v_etapa.nome, v_virola.tramo;
      end if;
    elsif v_etapa.nivel = 'tramo' then
      select * into v_tramo from public.proj_tramos_gwjaco where id = p->>'tramo_id';
      if not found then
        raise exception 'Tramo desconhecido: %', coalesce(p->>'tramo_id', '(vazio)');
      end if;
      v_tramo_id := v_tramo.id;
      v_peca := v_tramo.id;
      if v_etapa.tramos is not null and not (v_tramo.tramo = any(v_etapa.tramos)) then
        raise exception '% não se aplica ao %.', v_etapa.nome, v_tramo.tramo;
      end if;
    end if;

    if v_etapa.nivel <> 'chapa' then
      if exists (
        select 1 from public.prod_apt_execucoes x
         where x.etapa_id = v_etapa.id and coalesce(x.virola_id, x.tramo_id) = v_peca
           and x.status in ('em_andamento','pausada') and x.excluido_em is null
      ) then
        raise exception '% já está em andamento em %.', v_peca, v_etapa.nome;
      end if;
      if v_retrabalho then
        if not public.prod_apt_etapa_concluida(v_etapa.id, v_virola.id, v_tramo_id) then
          raise exception 'Retrabalho só depois de % ter sido finalizado(a) em %.', v_peca, v_etapa.nome;
        end if;
      else
        if public.prod_apt_etapa_concluida(v_etapa.id, v_virola.id, v_tramo_id) then
          raise exception '% já foi finalizado(a) em %. Para refazer, inicie como retrabalho.', v_peca, v_etapa.nome;
        end if;
        if not public.prod_apt_liberado_para(v_etapa.id, v_virola.id, v_tramo_id) then
          raise exception '% ainda não está liberado(a) para %: %.', v_peca, v_etapa.nome,
            case when v_etapa.etapa_anterior_id is null then 'falta o Green Tag da nave anterior'
                 else 'falta concluir a etapa anterior' end;
        end if;
      end if;
    end if;

    if nullif(p->>'posicao_id', '') is not null then
      select * into v_posicao from public.prod_apt_posicoes
       where id = (p->>'posicao_id')::uuid and etapa_id = v_etapa.id and ativo;
      if not found then
        raise exception 'Posição inválida para %.', v_etapa.nome;
      end if;
      select coalesce(x.virola_id, x.tramo_id, x.codigo) into v_ocupante
        from public.prod_apt_execucoes x
       where x.posicao_id = v_posicao.id and x.status in ('em_andamento','pausada') and x.excluido_em is null
       limit 1;
      if v_ocupante is not null then
        raise exception 'Posição % ocupada por %.', v_posicao.nome, v_ocupante;
      end if;
    elsif v_etapa.exige_posicao then
      raise exception 'Informe a posição de %.', v_etapa.nome;
    end if;

    insert into public.prod_apt_execucoes (
      id, codigo, etapa_id, nave, virola_id, tramo_id, posicao_id, retrabalho,
      status, observacao, iniciada_em, criado_por, criado_por_nome
    ) values (
      v_exec_id,
      public.prod_apt_proximo_codigo('APT', (v_quando at time zone 'America/Sao_Paulo')::date),
      v_etapa.id, v_etapa.nave, v_virola.id, v_tramo_id, v_posicao.id, v_retrabalho,
      'em_andamento', v_obs, v_quando, v_uid, v_nome
    )
    returning * into v_exec;
  else
    select * into v_exec from public.prod_apt_execucoes
     where id = nullif(p->>'execucao_id', '')::uuid
     for update;
    if not found then
      raise exception 'Apontamento não encontrado — o início pode ainda não ter sincronizado.';
    end if;
    if v_exec.excluido_em is not null or v_exec.status = 'cancelada' then
      raise exception 'O apontamento % foi cancelado.', v_exec.codigo;
    end if;
    if not private.prod_apt_pode('prod_apontar_' || v_exec.nave) then
      raise exception 'Sem permissão para apontar nesta nave.';
    end if;
    select * into v_etapa from public.prod_apt_etapas where id = v_exec.etapa_id;

    if v_tipo = 'pausa' then
      if v_exec.status <> 'em_andamento' then
        raise exception '% não está em andamento.', v_exec.codigo;
      end if;
      select * into v_motivo from public.prod_apt_motivos_pausa
       where id = nullif(p->>'motivo_pausa_id', '')::uuid and ativo;
      if not found then
        raise exception 'Informe o motivo da pausa.';
      end if;
      if v_motivo.exige_observacao and v_obs is null then
        raise exception 'O motivo "%" exige observação.', v_motivo.nome;
      end if;
      update public.prod_apt_execucoes set status = 'pausada', updated_at = now() where id = v_exec.id;

    elsif v_tipo = 'retomada' then
      if v_exec.status <> 'pausada' then
        raise exception '% não está pausado.', v_exec.codigo;
      end if;
      update public.prod_apt_execucoes set status = 'em_andamento', updated_at = now() where id = v_exec.id;

    elsif v_tipo = 'fim' then
      if v_exec.status not in ('em_andamento','pausada') then
        raise exception '% já foi finalizado.', v_exec.codigo;
      end if;
      if v_quando < v_exec.iniciada_em then
        raise exception 'O horário de fim é anterior ao início.';
      end if;
      if v_etapa.nivel = 'chapa' then
        v_quantidade := nullif(p->>'quantidade', '')::numeric;
        if v_quantidade is null or v_quantidade <= 0 then
          raise exception 'Informe a quantidade produzida.';
        end if;
      end if;
      select count(*) into v_pendentes
        from public.prod_apt_checklist_itens i
       where i.etapa_id = v_etapa.id and i.ativo
         and not exists (
           select 1 from public.prod_apt_checklist_marcas m
            where m.execucao_id = v_exec.id and m.item_id = i.id and m.status = 'concluido'
         );
      if v_pendentes > 0 and not coalesce((p->>'forcar')::boolean, false) then
        raise exception 'Checklist com % item(ns) pendente(s).', v_pendentes;
      end if;
      if v_pendentes > 0 and v_obs is null then
        raise exception 'Finalizar com checklist pendente exige observação.';
      end if;
      update public.prod_apt_execucoes
         set status = 'finalizada',
             finalizada_em = v_quando,
             quantidade = coalesce(v_quantidade, quantidade),
             updated_at = now()
       where id = v_exec.id;

    elsif v_tipo = 'situacao' then
      if v_exec.status not in ('em_andamento','pausada') then
        raise exception '% não está aberto.', v_exec.codigo;
      end if;
      v_situacao := nullif(btrim(coalesce(p->>'situacao', '')), '');
      update public.prod_apt_execucoes set situacao = v_situacao, updated_at = now() where id = v_exec.id;
      v_obs := coalesce(v_situacao, '(situação limpa)');
    end if;
  end if;

  insert into public.prod_apt_eventos (
    client_id, execucao_id, tipo, ocorrido_em, motivo_pausa_id, quantidade, observacao, usuario, usuario_nome
  ) values (
    v_client_id, v_exec.id, v_tipo, v_quando, v_motivo.id, v_quantidade, v_obs, v_uid, v_nome
  );

  return jsonb_build_object(
    'execucao_id', v_exec.id,
    'codigo', v_exec.codigo,
    'status', (select status from public.prod_apt_execucoes where id = v_exec.id),
    'ja_existia', false
  );
end;
$$;

-- Marca um item do checklist (✅ 🚸 ❌). Última marcação vale — reenvio do
-- outbox é naturalmente idempotente.
create or replace function public.prod_apt_marcar_checklist(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid text := (select auth.uid())::text;
  v_exec public.prod_apt_execucoes%rowtype;
  v_status text := p->>'status';
  v_quando timestamptz := least(coalesce(nullif(p->>'ocorrido_em', '')::timestamptz, now()), now());
  v_nome text;
begin
  if v_uid is null then
    raise exception 'Sessão expirada — entre novamente para apontar.';
  end if;
  if v_status is null or v_status not in ('concluido','andamento','nao_iniciado') then
    raise exception 'Situação de checklist inválida.';
  end if;
  select * into v_exec from public.prod_apt_execucoes where id = nullif(p->>'execucao_id', '')::uuid;
  if not found or v_exec.excluido_em is not null then
    raise exception 'Apontamento não encontrado — o início pode ainda não ter sincronizado.';
  end if;
  if v_exec.status not in ('em_andamento','pausada') then
    raise exception 'O checklist só muda enquanto % está aberto.', v_exec.codigo;
  end if;
  if not private.prod_apt_pode('prod_apontar_' || v_exec.nave) then
    raise exception 'Sem permissão para apontar nesta nave.';
  end if;
  if not exists (
    select 1 from public.prod_apt_checklist_itens
     where id = nullif(p->>'item_id', '')::uuid and etapa_id = v_exec.etapa_id
  ) then
    raise exception 'Item de checklist não pertence a esta etapa.';
  end if;
  select name into v_nome from public.core_perfis where id = v_uid;

  insert into public.prod_apt_checklist_marcas (execucao_id, item_id, status, marcado_em, por, por_nome)
  values (v_exec.id, (p->>'item_id')::uuid, v_status, v_quando, v_uid, v_nome)
  on conflict (execucao_id, item_id) do update
    set status = excluded.status,
        marcado_em = excluded.marcado_em,
        por = excluded.por,
        por_nome = excluded.por_nome;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.prod_apt_emitir_green_tag(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid text := (select auth.uid())::text;
  v_client_id uuid := nullif(p->>'client_id', '')::uuid;
  v_passagem text := p->>'passagem';
  v_tramo public.proj_tramos_gwjaco%rowtype;
  v_ja record;
  v_faltam text;
  v_codigo text;
  v_id uuid;
  v_nome text;
begin
  if v_uid is null then
    raise exception 'Sessão expirada — entre novamente para apontar.';
  end if;
  if v_client_id is null then
    raise exception 'client_id é obrigatório.';
  end if;
  if v_passagem is null or v_passagem not in ('n1_n2','n2_white') then
    raise exception 'Passagem inválida.';
  end if;

  select id, codigo into v_ja from public.prod_apt_green_tags where client_id = v_client_id;
  if found then
    return jsonb_build_object('id', v_ja.id, 'codigo', v_ja.codigo, 'ja_existia', true);
  end if;

  if not private.prod_apt_pode(case v_passagem when 'n1_n2' then 'prod_green_tag_n1' else 'prod_green_tag_n2' end) then
    raise exception 'Sem permissão para emitir este Green Tag.';
  end if;

  select * into v_tramo from public.proj_tramos_gwjaco where id = p->>'tramo_id';
  if not found then
    raise exception 'Tramo desconhecido: %', coalesce(p->>'tramo_id', '(vazio)');
  end if;
  if exists (
    select 1 from public.prod_apt_green_tags
     where tramo_id = v_tramo.id and passagem = v_passagem and excluido_em is null
  ) then
    raise exception '% já tem este Green Tag.', v_tramo.id;
  end if;
  if v_passagem = 'n2_white' and not exists (
    select 1 from public.prod_apt_green_tags
     where tramo_id = v_tramo.id and passagem = 'n1_n2' and excluido_em is null
  ) then
    raise exception '% ainda não tem o Green Tag da Nave 1.', v_tramo.id;
  end if;

  select string_agg(pp.etapa_nome || ' (' || pp.concluidas || '/' || pp.total || ')', ', ')
    into v_faltam
    from public.prod_apt_pendencias_green_tag(v_tramo.id, v_passagem) pp
   where pp.concluidas < pp.total;
  if v_faltam is not null then
    raise exception 'Faltam etapas para o Green Tag de %: %.', v_tramo.id, v_faltam;
  end if;

  select name into v_nome from public.core_perfis where id = v_uid;
  v_codigo := public.prod_apt_proximo_codigo('GT', (now() at time zone 'America/Sao_Paulo')::date);

  insert into public.prod_apt_green_tags (client_id, codigo, tramo_id, passagem, liberado_por, liberado_por_nome, observacao)
  values (v_client_id, v_codigo, v_tramo.id, v_passagem, v_uid, v_nome, nullif(btrim(coalesce(p->>'observacao', '')), ''))
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'codigo', v_codigo, 'ja_existia', false);
end;
$$;

create or replace function public.prod_apt_cancelar_green_tag(p_id uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid text := (select auth.uid())::text;
  v_gt public.prod_apt_green_tags%rowtype;
begin
  if v_uid is null then
    raise exception 'Sessão expirada — entre novamente.';
  end if;
  if nullif(btrim(coalesce(p_motivo, '')), '') is null then
    raise exception 'Informe o motivo do cancelamento.';
  end if;
  select * into v_gt from public.prod_apt_green_tags where id = p_id for update;
  if not found or v_gt.excluido_em is not null then
    raise exception 'Green Tag não encontrado ou já cancelado.';
  end if;
  if not public.form_pode_editar(v_gt.liberado_por) then
    raise exception 'Só quem emitiu o Green Tag (ou um admin) pode cancelá-lo.';
  end if;
  if exists (
    select 1 from public.prod_apt_execucoes x
     where x.tramo_id = v_gt.tramo_id and x.excluido_em is null and x.status <> 'cancelada'
       and x.nave = case v_gt.passagem when 'n1_n2' then 'nave2' else 'white' end
  ) then
    raise exception '% já tem apontamento na nave seguinte — cancele esses apontamentos antes.', v_gt.tramo_id;
  end if;

  update public.prod_apt_green_tags set excluido_em = now(), excluido_por = v_uid where id = v_gt.id;
  insert into public.prod_apt_alteracoes (green_tag_id, codigo, acao, alteracoes, resumo, alterado_por_id, alterado_por_nome)
  values (
    v_gt.id, v_gt.codigo, 'cancelar_green_tag',
    jsonb_build_array(jsonb_build_object('campo', 'situacao', 'de', 'ativo', 'para', 'cancelado')),
    btrim(p_motivo), v_uid, (select name from public.core_perfis where id = v_uid)
  );
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.prod_apt_cancelar_execucao(p_id uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid text := (select auth.uid())::text;
  v_exec public.prod_apt_execucoes%rowtype;
  v_nome text;
begin
  if v_uid is null then
    raise exception 'Sessão expirada — entre novamente.';
  end if;
  if nullif(btrim(coalesce(p_motivo, '')), '') is null then
    raise exception 'Informe o motivo do cancelamento.';
  end if;
  select * into v_exec from public.prod_apt_execucoes where id = p_id for update;
  if not found or v_exec.excluido_em is not null then
    raise exception 'Apontamento não encontrado ou já cancelado.';
  end if;
  if not public.form_pode_editar(v_exec.criado_por) then
    raise exception 'Só quem abriu o apontamento (ou um admin) pode cancelá-lo.';
  end if;
  -- Não desfaz um passo que já liberou o seguinte: cancele de trás para frente.
  if v_exec.status = 'finalizada' and exists (
    select 1
      from public.prod_apt_execucoes d
      join public.prod_apt_etapas de on de.id = d.etapa_id
     where de.etapa_anterior_id = v_exec.etapa_id
       and d.excluido_em is null and d.status <> 'cancelada'
       and (d.virola_id = v_exec.virola_id or (d.virola_id is null and d.tramo_id = v_exec.tramo_id))
  ) then
    raise exception 'A etapa seguinte já foi apontada para esta peça — cancele aquele apontamento antes.';
  end if;

  select name into v_nome from public.core_perfis where id = v_uid;
  update public.prod_apt_execucoes
     set status = 'cancelada', excluido_em = now(), excluido_por = v_uid, updated_at = now()
   where id = v_exec.id;
  insert into public.prod_apt_eventos (client_id, execucao_id, tipo, ocorrido_em, observacao, usuario, usuario_nome)
  values (gen_random_uuid(), v_exec.id, 'cancelamento', now(), btrim(p_motivo), v_uid, v_nome);
  insert into public.prod_apt_alteracoes (execucao_id, codigo, acao, alteracoes, resumo, alterado_por_id, alterado_por_nome)
  values (
    v_exec.id, v_exec.codigo, 'cancelar_execucao',
    jsonb_build_array(jsonb_build_object('campo', 'status', 'de', v_exec.status, 'para', 'cancelada')),
    btrim(p_motivo), v_uid, v_nome
  );
  return jsonb_build_object('ok', true);
end;
$$;

-- Corrige hora/motivo/observação de um evento (ex.: esqueceu de apontar a
-- pausa na hora). Autor do evento ou admin, com justificativa e diff no log.
create or replace function public.prod_apt_corrigir_evento(
  p_evento_id uuid,
  p_ocorrido_em timestamptz,
  p_motivo_pausa_id uuid,
  p_observacao text,
  p_justificativa text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid text := (select auth.uid())::text;
  v_ev public.prod_apt_eventos%rowtype;
  v_exec public.prod_apt_execucoes%rowtype;
  v_diff jsonb := '[]'::jsonb;
  v_nome text;
  v_obs text := nullif(btrim(coalesce(p_observacao, '')), '');
begin
  if v_uid is null then
    raise exception 'Sessão expirada — entre novamente.';
  end if;
  if nullif(btrim(coalesce(p_justificativa, '')), '') is null then
    raise exception 'Informe a justificativa da correção.';
  end if;
  select * into v_ev from public.prod_apt_eventos where id = p_evento_id for update;
  if not found then
    raise exception 'Evento não encontrado.';
  end if;
  select * into v_exec from public.prod_apt_execucoes where id = v_ev.execucao_id for update;
  if v_exec.excluido_em is not null then
    raise exception 'O apontamento % foi cancelado.', v_exec.codigo;
  end if;
  if not public.form_pode_editar(coalesce(v_ev.usuario, v_exec.criado_por)) then
    raise exception 'Só quem fez o apontamento (ou um admin) pode corrigi-lo.';
  end if;
  if p_ocorrido_em is null or p_ocorrido_em > now() + interval '5 minutes' then
    raise exception 'Horário inválido.';
  end if;
  if v_ev.tipo = 'pausa' and not exists (
    select 1 from public.prod_apt_motivos_pausa where id = p_motivo_pausa_id
  ) then
    raise exception 'Informe o motivo da pausa.';
  end if;

  if p_ocorrido_em is distinct from v_ev.ocorrido_em then
    v_diff := v_diff || jsonb_build_object('campo', 'ocorrido_em', 'de', v_ev.ocorrido_em, 'para', p_ocorrido_em);
  end if;
  if v_ev.tipo = 'pausa' and p_motivo_pausa_id is distinct from v_ev.motivo_pausa_id then
    v_diff := v_diff || jsonb_build_object('campo', 'motivo_pausa_id', 'de', v_ev.motivo_pausa_id, 'para', p_motivo_pausa_id);
  end if;
  if v_obs is distinct from v_ev.observacao then
    v_diff := v_diff || jsonb_build_object('campo', 'observacao', 'de', v_ev.observacao, 'para', v_obs);
  end if;
  if jsonb_array_length(v_diff) = 0 then
    return jsonb_build_object('ok', true, 'alterado', false);
  end if;

  update public.prod_apt_eventos
     set ocorrido_em = p_ocorrido_em,
         motivo_pausa_id = case when v_ev.tipo = 'pausa' then p_motivo_pausa_id else motivo_pausa_id end,
         observacao = v_obs
   where id = v_ev.id;
  if v_ev.tipo = 'inicio' then
    update public.prod_apt_execucoes set iniciada_em = p_ocorrido_em, updated_at = now() where id = v_exec.id;
  elsif v_ev.tipo = 'fim' then
    update public.prod_apt_execucoes set finalizada_em = p_ocorrido_em, updated_at = now() where id = v_exec.id;
  end if;

  select name into v_nome from public.core_perfis where id = v_uid;
  insert into public.prod_apt_alteracoes (execucao_id, codigo, acao, alteracoes, resumo, alterado_por_id, alterado_por_nome)
  values (v_exec.id, v_exec.codigo, 'corrigir_evento', v_diff, btrim(p_justificativa), v_uid, v_nome);
  return jsonb_build_object('ok', true, 'alterado', true);
end;
$$;

-- ---------------------------------------------------------------------
-- Grants. Revogar de `public` não basta no Supabase: `anon` tem grant
-- direto, por isso o revoke explícito.
-- ---------------------------------------------------------------------

revoke execute on function public.prod_apt_proximo_codigo(text, date) from public, anon, authenticated;

do $$
declare f text;
begin
  foreach f in array array[
    'public.prod_apt_etapa_concluida(text, text, text)',
    'public.prod_apt_liberado_para(text, text, text)',
    'public.prod_apt_fila(text, text, boolean, integer)',
    'public.prod_apt_pendencias_green_tag(text, text)',
    'public.prod_apt_candidatos_green_tag(text)',
    'public.prod_apt_registrar_evento(jsonb)',
    'public.prod_apt_marcar_checklist(jsonb)',
    'public.prod_apt_emitir_green_tag(jsonb)',
    'public.prod_apt_cancelar_green_tag(uuid, text)',
    'public.prod_apt_cancelar_execucao(uuid, text)',
    'public.prod_apt_corrigir_evento(uuid, timestamptz, uuid, text, text)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
