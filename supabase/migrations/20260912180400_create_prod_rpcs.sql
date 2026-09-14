-- =====================================================================
-- Produção — RPCs transacionais.
--
-- Por que RPC e não insert direto: o registro precisa (a) gerar o código
-- lendo os lançamentos do próprio dia, (b) validar a cadeia (RN-02 do NAV1
-- — só avança quem tem a etapa anterior aprovada) e (c) atualizar o status
-- da virola, tudo isso ou entra junto ou não entra nada.
--
-- E o registro é IDEMPOTENTE por `client_id`: o outbox (src/lib/outbox.ts)
-- gera esse id no aparelho antes de tentar enviar; se a rede cair depois do
-- INSERT mas antes da resposta chegar, o reenvio automático bate no client_id
-- já gravado e devolve o registro existente em vez de duplicar.
-- =====================================================================

-- Próximo código do dia no padrão `PREFIXO-DDMMYY-NN` (regra 2 do CLAUDE.md,
-- índice por dia — o chão de fábrica lança várias peças por turno).
create or replace function public.prod_proximo_codigo(p_prefixo text, p_data date)
returns text
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_ddmmyy text := to_char(p_data, 'DDMMYY');
  v_prefixo text := upper(p_prefixo);
  v_max int;
begin
  select coalesce(max((regexp_match(codigo, '^' || v_prefixo || '-\d{6}-(\d+)$'))[1]::int), 0)
    into v_max
    from public.prod_lancamentos
   where codigo like v_prefixo || '-' || v_ddmmyy || '-%';
  return v_prefixo || '-' || v_ddmmyy || '-' || lpad((coalesce(v_max, 0) + 1)::text, 2, '0');
end;
$$;

-- Fila de uma etapa: virolas com a etapa anterior aprovada (ou 1ª etapa da
-- cadeia) que ainda não têm lançamento nesta etapa, ou cujo último
-- lançamento aqui foi reprovado ("Corrigir"). `p_subprojeto_id` filtra a
-- visão do dia a dia ao que está em fabricação (SP01) sem esconder o resto
-- do projeto do banco.
create or replace function public.prod_fila_etapa(
  p_etapa_id text,
  p_projeto text default 'GW_JACOBINA',
  p_subprojeto_id text default null
)
returns table (
  virola_id text,
  torre_numero integer,
  tramo text,
  virola text,
  rastreabilidade_herdada text,
  corrigir boolean,
  ultimo_lancamento_id uuid
)
language sql
stable
set search_path = public, pg_temp
as $$
  with etapa as (
    select id, etapa_anterior_id from public.prod_etapas where id = p_etapa_id
  ),
  ultimo_atual as (
    select distinct on (l.virola_id) l.virola_id, l.id, l.status, l.rastreabilidade
      from public.prod_lancamentos l cross join etapa e
     where l.etapa_id = e.id and l.excluido_em is null
     order by l.virola_id, l.created_at desc
  ),
  ultimo_anterior as (
    select distinct on (l.virola_id) l.virola_id, l.status, l.rastreabilidade
      from public.prod_lancamentos l cross join etapa e
     where e.etapa_anterior_id is not null and l.etapa_id = e.etapa_anterior_id and l.excluido_em is null
     order by l.virola_id, l.created_at desc
  )
  select
    v.id,
    v.torre_numero,
    v.tramo,
    v.virola,
    coalesce(ua_atual.rastreabilidade, ua_ant.rastreabilidade) as rastreabilidade_herdada,
    coalesce(ua_atual.status = 'reprovado', false) as corrigir,
    ua_atual.id as ultimo_lancamento_id
  from public.prod_virolas v cross join etapa e
  left join ultimo_atual ua_atual on ua_atual.virola_id = v.id
  left join ultimo_anterior ua_ant on ua_ant.virola_id = v.id
  where v.projeto = p_projeto
    and (p_subprojeto_id is null or v.subprojeto_id = p_subprojeto_id)
    and (ua_atual.virola_id is null or ua_atual.status = 'reprovado')
    and (
      e.etapa_anterior_id is null
      or (ua_ant.virola_id is not null and ua_ant.status = 'aprovado')
    )
  order by v.torre_numero, v.tramo, v.ordem;
$$;

-- Registrar um lançamento de qualquer etapa. Idempotente por client_id;
-- valida a cadeia (RN-02); gera o código; atualiza a virola.
create or replace function public.prod_registrar_lancamento(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_client_id uuid := nullif(p->>'client_id','')::uuid;
  v_existente record;
  v_id uuid;
  v_codigo text;
  v_etapa record;
  v_virola record;
  v_data date := coalesce((p->>'data_liberacao')::date, current_date);
  v_status text := p->>'status';
  v_anterior_id uuid;
  v_tentativa int;
  v_criado_por text := (select auth.uid())::text;
begin
  if v_client_id is null then
    raise exception 'client_id é obrigatório.';
  end if;

  select id, codigo into v_existente from public.prod_lancamentos where client_id = v_client_id;
  if found then
    return jsonb_build_object('id', v_existente.id, 'codigo', v_existente.codigo, 'ja_existia', true);
  end if;

  if v_status not in ('aprovado','reprovado','pendente') then
    raise exception 'Situação inválida.';
  end if;

  select * into v_etapa from public.prod_etapas where id = p->>'etapa_id';
  if not found then
    raise exception 'Etapa desconhecida: %', p->>'etapa_id';
  end if;

  select * into v_virola from public.prod_virolas where id = p->>'virola_id';
  if not found then
    raise exception 'Virola desconhecida: %', p->>'virola_id';
  end if;

  -- RN-02 do PRD NAV1, repetida no servidor: dois aparelhos que lançaram
  -- offline não furam a cadeia — a fila já filtra isso no cliente, aqui é
  -- a rede final.
  if v_etapa.etapa_anterior_id is not null then
    select l.id into v_anterior_id
      from public.prod_lancamentos l
     where l.virola_id = v_virola.id
       and l.etapa_id = v_etapa.etapa_anterior_id
       and l.status = 'aprovado'
       and l.excluido_em is null
     order by l.created_at desc
     limit 1;
    if v_anterior_id is null then
      raise exception 'Etapa anterior ainda não aprovada para esta peça.';
    end if;
  end if;

  select count(*) + 1 into v_tentativa
    from public.prod_lancamentos
   where virola_id = v_virola.id and etapa_id = v_etapa.id and excluido_em is null;

  v_codigo := public.prod_proximo_codigo(v_etapa.prefixo_codigo, v_data);

  insert into public.prod_lancamentos (
    codigo, client_id, etapa_id, virola_id, projeto, torre_numero, tramo, virola,
    data_liberacao, hora, turno, status, rastreabilidade, recurso_id, execucao_empresa,
    executante_pessoa_id, executante_nome, inspetor_pessoa_id, inspetor_nome,
    observacao, evidencias, anterior_id, tentativa, criado_por, criado_por_nome
  ) values (
    v_codigo, v_client_id, v_etapa.id, v_virola.id, v_virola.projeto, v_virola.torre_numero, v_virola.tramo, v_virola.virola,
    v_data, nullif(p->>'hora','')::time, nullif(p->>'turno',''), v_status,
    nullif(p->>'rastreabilidade',''), nullif(p->>'recurso_id','')::uuid, nullif(p->>'execucao_empresa',''),
    nullif(p->>'executante_pessoa_id','')::uuid, nullif(p->>'executante_nome',''),
    nullif(p->>'inspetor_pessoa_id','')::uuid, nullif(p->>'inspetor_nome',''),
    nullif(p->>'observacao',''), coalesce(p->'evidencias', '[]'::jsonb),
    v_anterior_id, v_tentativa, v_criado_por, nullif(p->>'criado_por_nome','')
  )
  returning id into v_id;

  update public.prod_virolas
     set status_atual = v_status,
         etapa_atual_id = v_etapa.id,
         updated_at = now()
   where id = v_virola.id;

  return jsonb_build_object('id', v_id, 'codigo', v_codigo, 'ja_existia', false);
end;
$$;

-- Editar um lançamento existente — só autor ou admin (form_pode_editar), com
-- log de diff campo a campo em prod_alteracoes.
create or replace function public.prod_editar_lancamento(
  p_id uuid,
  p_campos jsonb,
  p_alterado_por_nome text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_atual public.prod_lancamentos;
  v_alteracoes jsonb := '[]'::jsonb;
  v_alterado_por_id text := (select auth.uid())::text;
begin
  select * into v_atual from public.prod_lancamentos where id = p_id and excluido_em is null;
  if not found then
    raise exception 'Lançamento não encontrado.';
  end if;

  if not public.form_pode_editar(v_atual.criado_por) then
    raise exception 'Usuário Sem Permissão Para Esta Alteração.';
  end if;

  if p_campos ? 'status' and nullif(p_campos->>'status','') is distinct from v_atual.status then
    v_alteracoes := v_alteracoes || jsonb_build_object('campo', 'status', 'de', v_atual.status, 'para', p_campos->>'status');
  end if;
  if p_campos ? 'data_liberacao' and (p_campos->>'data_liberacao')::date is distinct from v_atual.data_liberacao then
    v_alteracoes := v_alteracoes || jsonb_build_object('campo', 'data_liberacao', 'de', v_atual.data_liberacao::text, 'para', p_campos->>'data_liberacao');
  end if;
  if p_campos ? 'rastreabilidade' and nullif(p_campos->>'rastreabilidade','') is distinct from v_atual.rastreabilidade then
    v_alteracoes := v_alteracoes || jsonb_build_object('campo', 'rastreabilidade', 'de', v_atual.rastreabilidade, 'para', p_campos->>'rastreabilidade');
  end if;
  if p_campos ? 'recurso_id' and nullif(p_campos->>'recurso_id','')::uuid is distinct from v_atual.recurso_id then
    v_alteracoes := v_alteracoes || jsonb_build_object('campo', 'recurso_id', 'de', v_atual.recurso_id::text, 'para', p_campos->>'recurso_id');
  end if;
  if p_campos ? 'execucao_empresa' and nullif(p_campos->>'execucao_empresa','') is distinct from v_atual.execucao_empresa then
    v_alteracoes := v_alteracoes || jsonb_build_object('campo', 'execucao_empresa', 'de', v_atual.execucao_empresa, 'para', p_campos->>'execucao_empresa');
  end if;
  if p_campos ? 'observacao' and nullif(p_campos->>'observacao','') is distinct from v_atual.observacao then
    v_alteracoes := v_alteracoes || jsonb_build_object('campo', 'observacao', 'de', v_atual.observacao, 'para', p_campos->>'observacao');
  end if;

  update public.prod_lancamentos set
    data_liberacao = coalesce(nullif(p_campos->>'data_liberacao','')::date, data_liberacao),
    hora = case when p_campos ? 'hora' then nullif(p_campos->>'hora','')::time else hora end,
    turno = case when p_campos ? 'turno' then nullif(p_campos->>'turno','') else turno end,
    status = coalesce(nullif(p_campos->>'status',''), status),
    rastreabilidade = case when p_campos ? 'rastreabilidade' then nullif(p_campos->>'rastreabilidade','') else rastreabilidade end,
    recurso_id = case when p_campos ? 'recurso_id' then nullif(p_campos->>'recurso_id','')::uuid else recurso_id end,
    execucao_empresa = case when p_campos ? 'execucao_empresa' then nullif(p_campos->>'execucao_empresa','') else execucao_empresa end,
    executante_pessoa_id = case when p_campos ? 'executante_pessoa_id' then nullif(p_campos->>'executante_pessoa_id','')::uuid else executante_pessoa_id end,
    executante_nome = case when p_campos ? 'executante_nome' then nullif(p_campos->>'executante_nome','') else executante_nome end,
    inspetor_pessoa_id = case when p_campos ? 'inspetor_pessoa_id' then nullif(p_campos->>'inspetor_pessoa_id','')::uuid else inspetor_pessoa_id end,
    inspetor_nome = case when p_campos ? 'inspetor_nome' then nullif(p_campos->>'inspetor_nome','') else inspetor_nome end,
    observacao = case when p_campos ? 'observacao' then nullif(p_campos->>'observacao','') else observacao end,
    evidencias = coalesce(p_campos->'evidencias', evidencias),
    updated_at = now()
  where id = p_id;

  -- Situação mudou: a virola espelha o novo status desta mesma etapa.
  if p_campos ? 'status' then
    update public.prod_virolas set status_atual = p_campos->>'status', updated_at = now()
     where id = v_atual.virola_id;
  end if;

  if jsonb_array_length(v_alteracoes) > 0 then
    insert into public.prod_alteracoes (lancamento_id, codigo, alteracoes, resumo, alterado_por_id, alterado_por_nome)
    values (p_id, v_atual.codigo, v_alteracoes, 'Alteração de lançamento', v_alterado_por_id, p_alterado_por_nome);
  end if;

  return jsonb_build_object('id', p_id, 'alteracoes', v_alteracoes);
end;
$$;

-- Chave anon está no bundle do app; estas funções mexem em qualidade de
-- produção e exigem login. `revoke ... from public` sozinho não basta — o
-- Supabase concede EXECUTE a `anon` diretamente (mesma pegadinha resolvida
-- em `alm_receb_rpcs_revogar_anon` / `proj_rpcs_revogar_anon`) — por isso o
-- revoke de anon já entra nesta mesma migration.
revoke all on function public.prod_proximo_codigo(text, date) from public, anon;
revoke all on function public.prod_fila_etapa(text, text, text) from public, anon;
revoke all on function public.prod_registrar_lancamento(jsonb) from public, anon;
revoke all on function public.prod_editar_lancamento(uuid, jsonb, text) from public, anon;

grant execute on function public.prod_proximo_codigo(text, date) to authenticated, service_role;
grant execute on function public.prod_fila_etapa(text, text, text) to authenticated, service_role;
grant execute on function public.prod_registrar_lancamento(jsonb) to authenticated, service_role;
grant execute on function public.prod_editar_lancamento(uuid, jsonb, text) to authenticated, service_role;

-- Pendências (Controle de Liberações): última avaliação de cada
-- (virola, etapa) quando ela foi reprovada. RN-04 do PRD NAV1 — permanece
-- visível até ser corrigida (nova liberação aprovada substitui a reprovada
-- como "última avaliação" e o item sai daqui sozinho).
create or replace view public.prod_pendencias
with (security_invoker = true) as
with ultimo as (
  select distinct on (virola_id, etapa_id) *
    from public.prod_lancamentos
   where excluido_em is null
   order by virola_id, etapa_id, created_at desc
)
select
  u.virola_id, u.etapa_id, e.nome as etapa_nome, u.id as lancamento_id, u.codigo,
  u.status, u.projeto, u.torre_numero, u.tramo, u.virola, u.observacao, u.created_at
from ultimo u
join public.prod_etapas e on e.id = u.etapa_id
where u.status = 'reprovado';

grant select on public.prod_pendencias to authenticated;
