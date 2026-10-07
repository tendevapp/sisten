-- Apontamento por tramo — quadro por etapa, correção auditável e metas por marco.
-- Design: docs/superpowers/specs/2026-10-07-apontamento-tramos-indicadores-design.md
--
-- 1. prod_apt_situacoes: "Setor + Atividade" da planilha TRAMOS vira lista
--    fechada por etapa (o texto livre fica na observação).
-- 2. prod_apt_tramo_eventos ganha situação, reparo (incremento), lote e
--    correção. Cronologia validada para os 5 marcos nos dois sentidos.
-- 3. Código APT-DDMMYY-NN: um contador só para lançamentos por etapa e
--    eventos por tramo, com advisory lock (antes eram dois contadores).
-- 4. RPCs: registrar (um ou vários tramos, idempotente por lote), corrigir e
--    a carga histórica refeita (contagem real, reparos, situação do catálogo).
-- 5. O razão alimenta prod_tramos_entrega (cilindros, WIP, Expedição).
-- 6. Metas por marco (mensal e semanal opcional) + prazo, do Planejamento.

-- ---------------------------------------------------------------------
-- 1. Situações
-- ---------------------------------------------------------------------

create table if not exists public.prod_apt_situacoes (
  id uuid primary key default gen_random_uuid(),
  -- Etapa macro em que a situação acontece (decorre dos marcos do tramo).
  etapa text not null check (etapa in ('corte', 'nav01', 'nav02', 'jato', 'patio', 'expedido')),
  setor text not null,
  atividade text not null,
  -- Categoria do Controle de Entrega (cilindros) que a situação representa.
  categoria_entrega text not null
    check (categoria_entrega in ('pendente', 'nav01', 'saw02', 'saw03', 'internos', 'white', 'patio', 'expedido')),
  ordem integer not null default 0,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  unique (setor, atividade)
);

alter table public.prod_apt_situacoes enable row level security;
revoke all on public.prod_apt_situacoes from anon;
grant select, insert, update on public.prod_apt_situacoes to authenticated;

create policy prod_apt_situacoes_sel on public.prod_apt_situacoes for select to authenticated using (true);
create policy prod_apt_situacoes_ins on public.prod_apt_situacoes for insert to authenticated
  with check ((select private.prod_apt_pode('prod_apt_cadastros')));
create policy prod_apt_situacoes_upd on public.prod_apt_situacoes for update to authenticated
  using ((select private.prod_apt_pode('prod_apt_cadastros')))
  with check ((select private.prod_apt_pode('prod_apt_cadastros')));

-- Valores que aparecem na planilha de 07/10/2026, na ordem do fluxo.
insert into public.prod_apt_situacoes (etapa, setor, atividade, categoria_entrega, ordem) values
  ('corte',    'CORTE',                 'Corte',                             'pendente', 10),
  ('nav01',    'CALANDRA',              'Calandra',                          'nav01',    20),
  ('nav01',    'NAV01',                 'Visual NAV01',                      'nav01',    30),
  ('nav02',    'SAW02',                 'SAW02',                             'saw02',    40),
  ('nav02',    'SAW03',                 'SAW03',                             'saw03',    50),
  ('nav02',    'Internos',              'Laudo UT',                          'internos', 60),
  ('nav02',    'Internos',              'Solda de Reparo',                   'internos', 70),
  ('nav02',    'Internos',              'Iniciar Visual',                    'internos', 80),
  ('nav02',    'Internos',              'Visual em Andamento',               'internos', 90),
  ('nav02',    'Internos',              'Iniciar Visual (Pátio)',            'internos', 100),
  ('nav02',    'Internos',              'Easy Laser',                        'internos', 110),
  ('jato',     'Jato',                  'Liberado p/ Jato (Pátio)',          'white',    120),
  ('jato',     'Jato',                  'Jato em Andamento',                 'white',    130),
  ('jato',     'Pintura',               'Pintura em Andamento',              'white',    140),
  ('jato',     'Acabamento de Pintura', 'Reparo de Pintura em Andamento',    'white',    150),
  ('jato',     'Acabamento de Pintura', 'Reparo de Pintura (Pátio)',         'white',    160),
  ('jato',     'Montagem',              'Iniciar Montagem',                  'white',    170),
  ('jato',     'Montagem',              'Montagem em Andamento',             'white',    180),
  ('patio',    'Pátio',                 'Liberado p/ Pátio',                 'patio',    190),
  ('patio',    'Pátio',                 'Liberado p/ Pátio (Retrabalho Flange)', 'patio', 200),
  ('expedido', 'Expedido',              'Expedido',                          'expedido', 210)
on conflict (setor, atividade) do nothing;

-- ---------------------------------------------------------------------
-- 2. Razão por tramo
-- ---------------------------------------------------------------------

alter table public.prod_apt_tramo_eventos
  add column if not exists situacao_id uuid references public.prod_apt_situacoes(id),
  add column if not exists lote_id uuid,
  add column if not exists corrige_evento_id uuid references public.prod_apt_tramo_eventos(id),
  add column if not exists motivo_exclusao text;

alter table public.prod_apt_tramo_eventos drop constraint if exists prod_apt_tramo_eventos_tipo_check;
alter table public.prod_apt_tramo_eventos drop constraint if exists prod_apt_tramo_eventos_check;
alter table public.prod_apt_tramo_eventos
  add constraint prod_apt_tramo_eventos_tipo_check check (tipo in ('marco', 'situacao', 'reparo')),
  add constraint prod_apt_tramo_eventos_check check (
    (tipo = 'marco' and marco is not null)
    or (tipo = 'situacao' and marco is null)
    or (tipo = 'reparo' and marco is null and reparos_solda > 0)
  );

create index if not exists idx_prod_apt_tramo_eventos_lote on public.prod_apt_tramo_eventos(lote_id) where lote_id is not null;
create unique index if not exists prod_apt_tramo_eventos_reparo_importacao_unica
  on public.prod_apt_tramo_eventos(importacao_id, tramo_id, tipo)
  where tipo = 'reparo' and importacao_id is not null and excluido_em is null;

-- ---------------------------------------------------------------------
-- 3. Código APT único para as duas tabelas
-- ---------------------------------------------------------------------

-- Recorte do índice: POR DIA da data operacional (regra 2 do CLAUDE.md). O
-- lock por dia serializa lançamentos por etapa e eventos por tramo juntos.
create or replace function public.prod_apt_proximo_codigo(p_data date)
returns text
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_ddmmyy text := to_char(p_data, 'DDMMYY');
  v_max int;
begin
  perform pg_advisory_xact_lock(hashtext('prod_apt_codigo:' || v_ddmmyy));
  select coalesce(max((regexp_match(codigo, '^APT-\d{6}-(\d+)$'))[1]::int), 0)
    into v_max
    from (
      select codigo from public.prod_apt_lancamentos where codigo like 'APT-' || v_ddmmyy || '-%'
      union all
      select codigo from public.prod_apt_tramo_eventos where codigo like 'APT-' || v_ddmmyy || '-%'
    ) codigos;
  return 'APT-' || v_ddmmyy || '-' || lpad((v_max + 1)::text, 2, '0');
end;
$$;

create or replace function public.prod_apt_proximo_codigo_tramo(p_data date)
returns text
language sql
security definer
set search_path = public, pg_temp
as $$ select public.prod_apt_proximo_codigo(p_data) $$;

revoke all on function public.prod_apt_proximo_codigo(date) from public, anon, authenticated;
revoke all on function public.prod_apt_proximo_codigo_tramo(date) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. Regras
-- ---------------------------------------------------------------------

-- Lança quem lança o realizado por etapa (mesma regra, respeita bloqueio explícito).
create or replace function public.prod_apt_exigir_apontamento_tramos()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Autenticação obrigatória.'; end if;
  if not private.prod_apt_pode_lancar() then
    raise exception 'Acesso negado ao apontamento de produção.';
  end if;
end;
$$;

create or replace function private.prod_apt_rotulo_marco(p_marco text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_marco
    when 'inicio' then 'Início'
    when 'liberado_nav02' then 'Liberado p/ NAV02'
    when 'liberado_jato' then 'Liberado p/ Jato'
    when 'liberado_patio' then 'Liberado p/ Pátio'
    when 'expedido' then 'Expedido'
    else p_marco
  end
$$;

-- Os marcos seguem a ordem do fluxo: cada um exige o anterior e fica entre o
-- anterior e o seguinte (quando existem). p_ignorar: evento sendo corrigido.
create or replace function private.prod_apt_validar_marco(p_tramo text, p_marco text, p_data date, p_ignorar uuid default null)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_ordem text[] := array['inicio', 'liberado_nav02', 'liberado_jato', 'liberado_patio', 'expedido'];
  v_pos int := array_position(v_ordem, p_marco);
  v_data date;
begin
  if v_pos is null then raise exception 'Marco inválido.'; end if;
  if exists (
    select 1 from public.prod_apt_tramo_eventos
     where tramo_id = p_tramo and tipo = 'marco' and marco = p_marco and excluido_em is null
       and id is distinct from p_ignorar
  ) then
    raise exception 'O tramo já tem o marco "%". Use Corrigir para mudar a data.', private.prod_apt_rotulo_marco(p_marco);
  end if;
  if v_pos > 1 then
    select data_operacional into v_data from public.prod_apt_tramo_eventos
     where tramo_id = p_tramo and tipo = 'marco' and marco = v_ordem[v_pos - 1] and excluido_em is null
       and id is distinct from p_ignorar;
    if v_data is null then
      raise exception '"%" exige "%" antes.', private.prod_apt_rotulo_marco(p_marco), private.prod_apt_rotulo_marco(v_ordem[v_pos - 1]);
    end if;
    if p_data < v_data then
      raise exception '"%" (%) não pode ser antes de "%" (%).',
        private.prod_apt_rotulo_marco(p_marco), to_char(p_data, 'DD/MM/YY'),
        private.prod_apt_rotulo_marco(v_ordem[v_pos - 1]), to_char(v_data, 'DD/MM/YY');
    end if;
  end if;
  if v_pos < array_length(v_ordem, 1) then
    select data_operacional into v_data from public.prod_apt_tramo_eventos
     where tramo_id = p_tramo and tipo = 'marco' and marco = v_ordem[v_pos + 1] and excluido_em is null
       and id is distinct from p_ignorar;
    if v_data is not null and p_data > v_data then
      raise exception '"%" (%) não pode ser depois de "%" (%).',
        private.prod_apt_rotulo_marco(p_marco), to_char(p_data, 'DD/MM/YY'),
        private.prod_apt_rotulo_marco(v_ordem[v_pos + 1]), to_char(v_data, 'DD/MM/YY');
    end if;
  end if;
end;
$$;

create or replace function private.prod_apt_validar_data(p_data date, p_observacao text)
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if p_data is null then raise exception 'Informe a data.'; end if;
  if p_data > v_hoje then raise exception 'A data não pode ser futura.'; end if;
  if p_data < date '2026-01-01' then raise exception 'Data fora do período do projeto.'; end if;
  -- Lançamento muito atrasado costuma ser erro de digitação: pede justificativa.
  if p_data < v_hoje - 7 and coalesce(btrim(p_observacao), '') = '' then
    raise exception 'Data com mais de 7 dias exige observação.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 5. Estado atual por tramo
-- ---------------------------------------------------------------------

drop view if exists public.prod_apt_tramos_atual;
create view public.prod_apt_tramos_atual with (security_invoker = true) as
with ev as (
  select e.* from public.prod_apt_tramo_eventos e where e.excluido_em is null
),
marcos as (
  select tramo_id,
    max(data_operacional) filter (where marco = 'inicio') as inicio_em,
    max(data_operacional) filter (where marco = 'liberado_nav02') as liberado_nav02_em,
    max(data_operacional) filter (where marco = 'liberado_jato') as liberado_jato_em,
    max(data_operacional) filter (where marco = 'liberado_patio') as liberado_patio_em,
    max(data_operacional) filter (where marco = 'expedido') as expedido_em,
    coalesce(sum(reparos_solda) filter (where tipo = 'reparo'), 0)::int as reparos_solda,
    max(created_at) as ultimo_evento_em,
    count(*)::int as eventos
  from ev group by tramo_id
),
situacao as (
  select distinct on (tramo_id) tramo_id, situacao_id, setor, atividade, data_operacional as situacao_em
    from ev where tipo = 'situacao'
   order by tramo_id, data_operacional desc, created_at desc
)
select
  t.id as tramo_id, t.serie, t.torre_numero, t.tramo,
  m.inicio_em, m.liberado_nav02_em, m.liberado_jato_em, m.liberado_patio_em, m.expedido_em,
  case
    when m.expedido_em is not null then 'expedido'
    when m.liberado_patio_em is not null then 'patio'
    when m.liberado_jato_em is not null then 'jato'
    when m.liberado_nav02_em is not null then 'nav02'
    when m.inicio_em is not null then 'nav01'
    else 'corte'
  end as etapa,
  s.situacao_id, s.setor as setor_atual, s.atividade as atividade_atual, s.situacao_em,
  coalesce(m.reparos_solda, 0) as reparos_solda,
  m.ultimo_evento_em,
  coalesce(m.eventos, 0) as eventos
from public.proj_tramos_gwjaco t
left join marcos m on m.tramo_id = t.id
left join situacao s on s.tramo_id = t.id
where t.subprojeto_id = 'SP01';

revoke all on public.prod_apt_tramos_atual from anon;
grant select on public.prod_apt_tramos_atual to authenticated;

-- ---------------------------------------------------------------------
-- 6. Sincroniza o Controle de Entrega (cilindros, WIP, Visão Expedição)
-- ---------------------------------------------------------------------

-- A etapa macro vem dos marcos; o detalhe (SAW02, Internos…) vem da situação
-- quando ela pertence à etapa atual. p_so_avancar: a carga histórica nunca
-- faz o cilindro voltar (o controle manual pode estar mais adiantado).
create or replace function private.prod_apt_sincronizar_entrega(p_tramo text, p_so_avancar boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ordem text[] := array['pendente', 'nav01', 'saw02', 'saw03', 'internos', 'white', 'patio', 'expedido'];
  v_atual record;
  v_sit record;
  v_categoria text;
  v_nome text;
  v_status text;
  v_desde date;
  v_antes text;
begin
  select * into v_atual from public.prod_apt_tramos_atual where tramo_id = p_tramo;
  if not found or v_atual.eventos = 0 then return; end if;

  select * into v_sit from public.prod_apt_situacoes where id = v_atual.situacao_id;
  if v_sit.id is not null and v_sit.etapa = v_atual.etapa then
    v_categoria := v_sit.categoria_entrega;
    v_nome := upper(v_sit.setor);
    v_status := v_sit.atividade;
  else
    v_categoria := case v_atual.etapa
      when 'corte' then 'pendente' when 'nav01' then 'nav01' when 'nav02' then 'saw02'
      when 'jato' then 'white' when 'patio' then 'patio' else 'expedido' end;
    v_nome := upper(private.prod_apt_rotulo_marco(case v_atual.etapa
      when 'nav01' then 'inicio' when 'nav02' then 'liberado_nav02' when 'jato' then 'liberado_jato'
      when 'patio' then 'liberado_patio' when 'expedido' then 'expedido' else 'inicio' end));
    v_status := null;
  end if;
  v_desde := greatest(
    coalesce(v_atual.situacao_em, date '2000-01-01'),
    coalesce(v_atual.expedido_em, v_atual.liberado_patio_em, v_atual.liberado_jato_em, v_atual.liberado_nav02_em, v_atual.inicio_em, date '2000-01-01')
  );

  select etapa_categoria into v_antes from public.prod_tramos_entrega where id = p_tramo;
  if not found then return; end if;
  if p_so_avancar and coalesce(array_position(v_ordem, v_categoria), 0) <= coalesce(array_position(v_ordem, v_antes), 0) then
    return;
  end if;

  update public.prod_tramos_entrega
     set etapa_categoria = v_categoria,
         etapa_nome = v_nome,
         status_aguardando = v_status,
         data_entrada_etapa = case when p_so_avancar
           then (v_desde + time '12:00') at time zone 'America/Sao_Paulo'
           else now() end,
         dias_espera = greatest(0, (now() at time zone 'America/Sao_Paulo')::date - v_desde),
         updated_at = now()
   where id = p_tramo
     and (etapa_categoria, etapa_nome, coalesce(status_aguardando, '')) is distinct from (v_categoria, v_nome, coalesce(v_status, ''));
end;
$$;

create or replace function private.prod_apt_tramo_evento_sincronizar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Inserção manual ou correção (que marca excluido_em, inclusive em evento importado).
  if tg_op = 'UPDATE' or new.origem = 'manual' then
    perform private.prod_apt_sincronizar_entrega(new.tramo_id, false);
  end if;
  return null;
end;
$$;

drop trigger if exists prod_apt_tramo_eventos_sincronizar on public.prod_apt_tramo_eventos;
create trigger prod_apt_tramo_eventos_sincronizar
  after insert or update of excluido_em on public.prod_apt_tramo_eventos
  for each row execute function private.prod_apt_tramo_evento_sincronizar();

revoke all on function private.prod_apt_sincronizar_entrega(text, boolean) from public, anon, authenticated;
revoke all on function private.prod_apt_tramo_evento_sincronizar() from public, anon, authenticated;
-- Helpers chamados só de dentro das RPCs security definer.
revoke all on function private.prod_apt_validar_marco(text, text, date, uuid) from public, anon, authenticated;
revoke all on function private.prod_apt_validar_data(date, text) from public, anon, authenticated;
revoke all on function private.prod_apt_rotulo_marco(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 7. RPCs
-- ---------------------------------------------------------------------

drop function if exists public.prod_apt_salvar_evento_tramo(jsonb);

-- Registra o mesmo apontamento para um ou vários tramos: marco, situação e/ou
-- reparos (incremento). Tudo ou nada. Idempotente por loteId (gerado no
-- aparelho): o reenvio da fila offline devolve o que já foi gravado.
create or replace function public.prod_apt_registrar_tramos(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_lote uuid := nullif(p->>'loteId', '')::uuid;
  v_data date := nullif(p->>'dataOperacional', '')::date;
  v_marco text := nullif(p->>'marco', '');
  v_situacao uuid := nullif(p->>'situacaoId', '')::uuid;
  v_reparos int := coalesce(nullif(p->>'reparos', '')::int, 0);
  v_obs text := nullif(btrim(p->>'observacao'), '');
  v_tramos text[];
  v_tramo text;
  v_sit public.prod_apt_situacoes%rowtype;
  v_codigo text;
  v_codigos text[] := '{}';
begin
  perform public.prod_apt_exigir_apontamento_tramos();
  if v_lote is null then raise exception 'Lote obrigatório.'; end if;

  if exists (select 1 from public.prod_apt_tramo_eventos where lote_id = v_lote) then
    select coalesce(array_agg(codigo order by codigo), '{}') into v_codigos from public.prod_apt_tramo_eventos where lote_id = v_lote;
    return jsonb_build_object('id', v_lote, 'codigos', to_jsonb(v_codigos), 'jaRegistrado', true);
  end if;

  perform private.prod_apt_validar_data(v_data, v_obs);
  if v_marco is null and v_situacao is null and v_reparos = 0 then
    raise exception 'Informe o marco, a situação ou os reparos.';
  end if;
  if v_reparos < 0 then raise exception 'Reparos devem ser positivos. Para reduzir, corrija o lançamento.'; end if;
  if v_situacao is not null then
    select * into v_sit from public.prod_apt_situacoes where id = v_situacao and ativo;
    if not found then raise exception 'Situação inválida.'; end if;
  end if;

  select array_agg(distinct x) into v_tramos from jsonb_array_elements_text(coalesce(p->'tramoIds', '[]'::jsonb)) x;
  if coalesce(array_length(v_tramos, 1), 0) = 0 then raise exception 'Selecione ao menos um tramo.'; end if;
  if array_length(v_tramos, 1) > 200 then raise exception 'Máximo de 200 tramos por lançamento.'; end if;

  foreach v_tramo in array v_tramos loop
    if not exists (select 1 from public.proj_tramos_gwjaco where id = v_tramo and subprojeto_id = 'SP01') then
      raise exception 'Tramo % inválido.', v_tramo;
    end if;
    if v_marco is not null then
      perform private.prod_apt_validar_marco(v_tramo, v_marco, v_data);
      v_codigo := public.prod_apt_proximo_codigo(v_data);
      insert into public.prod_apt_tramo_eventos (codigo, tramo_id, tipo, marco, data_operacional, observacao, lote_id, criado_por, created_at)
      values (v_codigo, v_tramo, 'marco', v_marco, v_data, v_obs, v_lote, auth.uid(), clock_timestamp());
      v_codigos := v_codigos || v_codigo;
    end if;
    if v_situacao is not null then
      v_codigo := public.prod_apt_proximo_codigo(v_data);
      insert into public.prod_apt_tramo_eventos (codigo, tramo_id, tipo, situacao_id, setor, atividade, data_operacional, observacao, lote_id, criado_por, created_at)
      values (v_codigo, v_tramo, 'situacao', v_sit.id, v_sit.setor, v_sit.atividade, v_data, v_obs, v_lote, auth.uid(), clock_timestamp());
      v_codigos := v_codigos || v_codigo;
    end if;
    if v_reparos > 0 then
      v_codigo := public.prod_apt_proximo_codigo(v_data);
      insert into public.prod_apt_tramo_eventos (codigo, tramo_id, tipo, reparos_solda, data_operacional, observacao, lote_id, criado_por, created_at)
      values (v_codigo, v_tramo, 'reparo', v_reparos, v_data, v_obs, v_lote, auth.uid(), clock_timestamp());
      v_codigos := v_codigos || v_codigo;
    end if;
  end loop;

  return jsonb_build_object('id', v_lote, 'codigos', to_jsonb(v_codigos));
end;
$$;

-- Corrige (nova data / situação / reparos) ou exclui um evento. Só o autor ou
-- admin. Nada é apagado: o antigo recebe excluido_em + motivo e o novo aponta
-- para ele em corrige_evento_id.
create or replace function public.prod_apt_corrigir_evento_tramo(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid := nullif(p->>'eventoId', '')::uuid;
  v_motivo text := nullif(btrim(p->>'motivo'), '');
  v_excluir boolean := coalesce((p->>'excluir')::boolean, false);
  v_ev public.prod_apt_tramo_eventos%rowtype;
  v_sit public.prod_apt_situacoes%rowtype;
  v_data date;
  v_reparos int;
  v_novo uuid;
  v_codigo text;
  v_ordem text[] := array['inicio', 'liberado_nav02', 'liberado_jato', 'liberado_patio', 'expedido'];
begin
  perform public.prod_apt_exigir_apontamento_tramos();
  if v_motivo is null or length(v_motivo) < 3 then raise exception 'Informe o motivo da correção.'; end if;
  select * into v_ev from public.prod_apt_tramo_eventos where id = v_id for update;
  if not found then raise exception 'Lançamento não encontrado.'; end if;
  -- Reenvio da fila: a correção já foi aplicada.
  if v_ev.excluido_em is not null then
    select id, codigo into v_novo, v_codigo from public.prod_apt_tramo_eventos where corrige_evento_id = v_id order by created_at desc limit 1;
    return jsonb_build_object('id', v_novo, 'codigo', v_codigo, 'jaCorrigido', true);
  end if;
  if not public.form_pode_editar(v_ev.criado_por::text) then
    raise exception 'Só quem lançou ou um administrador pode corrigir.';
  end if;

  if v_ev.tipo = 'marco' and v_excluir and exists (
    select 1 from public.prod_apt_tramo_eventos
     where tramo_id = v_ev.tramo_id and tipo = 'marco' and excluido_em is null
       and marco = v_ordem[array_position(v_ordem, v_ev.marco) + 1]
  ) then
    raise exception 'Exclua primeiro o marco seguinte.';
  end if;

  update public.prod_apt_tramo_eventos
     set excluido_em = now(), excluido_por = auth.uid(), motivo_exclusao = v_motivo
   where id = v_id;
  if v_excluir then
    return jsonb_build_object('id', null, 'codigo', null, 'excluido', true);
  end if;

  v_data := coalesce(nullif(p->>'dataOperacional', '')::date, v_ev.data_operacional);
  perform private.prod_apt_validar_data(v_data, coalesce(v_ev.observacao, v_motivo));
  v_codigo := public.prod_apt_proximo_codigo(v_data);

  if v_ev.tipo = 'marco' then
    perform private.prod_apt_validar_marco(v_ev.tramo_id, v_ev.marco, v_data, v_id);
    insert into public.prod_apt_tramo_eventos (codigo, tramo_id, tipo, marco, data_operacional, observacao, lote_id, corrige_evento_id, criado_por, created_at)
    values (v_codigo, v_ev.tramo_id, 'marco', v_ev.marco, v_data, v_ev.observacao, v_ev.lote_id, v_id, auth.uid(), clock_timestamp())
    returning id into v_novo;
  elsif v_ev.tipo = 'situacao' then
    select * into v_sit from public.prod_apt_situacoes where id = coalesce(nullif(p->>'situacaoId', '')::uuid, v_ev.situacao_id);
    insert into public.prod_apt_tramo_eventos (codigo, tramo_id, tipo, situacao_id, setor, atividade, data_operacional, observacao, lote_id, corrige_evento_id, criado_por, created_at)
    values (v_codigo, v_ev.tramo_id, 'situacao', v_sit.id, coalesce(v_sit.setor, v_ev.setor), coalesce(v_sit.atividade, v_ev.atividade),
            v_data, v_ev.observacao, v_ev.lote_id, v_id, auth.uid(), clock_timestamp())
    returning id into v_novo;
  else
    v_reparos := coalesce(nullif(p->>'reparos', '')::int, v_ev.reparos_solda);
    if v_reparos <= 0 then raise exception 'Para zerar os reparos, exclua o lançamento.'; end if;
    insert into public.prod_apt_tramo_eventos (codigo, tramo_id, tipo, reparos_solda, data_operacional, observacao, lote_id, corrige_evento_id, criado_por, created_at)
    values (v_codigo, v_ev.tramo_id, 'reparo', v_reparos, v_data, v_ev.observacao, v_ev.lote_id, v_id, auth.uid(), clock_timestamp())
    returning id into v_novo;
  end if;
  return jsonb_build_object('id', v_novo, 'codigo', v_codigo);
end;
$$;

-- Carga histórica (refeita): conta só o que entrou, grava os reparos como
-- evento e liga a situação ao catálogo. Depois avança os cilindros sem
-- regredir nenhum.
create or replace function public.prod_apt_importar_snapshot_tramos(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_lote uuid := (p->>'loteId')::uuid;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_item jsonb;
  v_tramo text;
  v_marco text;
  v_data date;
  v_ultima date;
  v_sit public.prod_apt_situacoes%rowtype;
  v_reparos int;
  v_n int;
  v_inseridos int := 0;
  v_tramos text[] := '{}';
begin
  perform public.prod_apt_exigir_cadastro_tramos();
  if exists (select 1 from public.prod_apt_importacoes_tramos where id = v_lote and status = 'historico_importado') then
    return jsonb_build_object('eventosInseridos', 0, 'jaImportado', true);
  end if;
  if not exists (select 1 from public.prod_apt_importacoes_tramos where id = v_lote and status = 'reconciliado') then
    raise exception 'Lote deve estar reconciliado antes da carga histórica.';
  end if;
  if jsonb_typeof(p->'snapshots') <> 'array' then raise exception 'Snapshots obrigatórios.'; end if;

  for v_item in select value from jsonb_array_elements(p->'snapshots') loop
    select id into v_tramo from public.proj_tramos_gwjaco where serie = (v_item->>'sequencial')::int and subprojeto_id = 'SP01';
    if v_tramo is null then raise exception 'Série % não localizada.', v_item->>'sequencial'; end if;
    v_tramos := v_tramos || v_tramo;

    foreach v_marco in array array['inicio', 'liberado_nav02', 'liberado_jato', 'liberado_patio', 'expedido'] loop
      v_data := nullif(v_item->'marcos'->>v_marco, '')::date;
      continue when v_data is null;
      insert into public.prod_apt_tramo_eventos (codigo, tramo_id, tipo, marco, data_operacional, origem, importacao_id, criado_por, created_at)
      values (public.prod_apt_proximo_codigo(v_data), v_tramo, 'marco', v_marco, v_data, 'importacao', v_lote, auth.uid(), clock_timestamp())
      on conflict (tramo_id, marco) where excluido_em is null and tipo = 'marco' do nothing;
      get diagnostics v_n = row_count;
      v_inseridos := v_inseridos + v_n;
    end loop;

    select max(value::date) into v_ultima from jsonb_each_text(coalesce(v_item->'marcos', '{}'::jsonb)) where value <> '';
    v_ultima := coalesce(v_ultima, v_hoje);

    if coalesce(v_item->>'setor', '') <> '' or coalesce(v_item->>'atividade', '') <> '' then
      select * into v_sit from public.prod_apt_situacoes
       where lower(setor) = lower(btrim(v_item->>'setor')) and lower(atividade) = lower(btrim(v_item->>'atividade'));
      insert into public.prod_apt_tramo_eventos (codigo, tramo_id, tipo, situacao_id, setor, atividade, data_operacional, origem, importacao_id, criado_por, created_at)
      values (public.prod_apt_proximo_codigo(v_ultima), v_tramo, 'situacao', v_sit.id,
              coalesce(v_sit.setor, nullif(btrim(v_item->>'setor'), '')), coalesce(v_sit.atividade, nullif(btrim(v_item->>'atividade'), '')),
              v_ultima, 'importacao', v_lote, auth.uid(), clock_timestamp())
      on conflict (importacao_id, tramo_id, tipo) where tipo = 'situacao' and importacao_id is not null and excluido_em is null do nothing;
      get diagnostics v_n = row_count;
      v_inseridos := v_inseridos + v_n;
    end if;

    -- O total de reparos da planilha vira um evento na liberação para o Jato
    -- (os reparos de solda acontecem antes dela).
    v_reparos := coalesce(nullif(v_item->>'reparosSolda', '')::int, 0);
    if v_reparos > 0 then
      v_data := coalesce(nullif(v_item->'marcos'->>'liberado_jato', '')::date, v_ultima);
      insert into public.prod_apt_tramo_eventos (codigo, tramo_id, tipo, reparos_solda, data_operacional, origem, importacao_id, criado_por, created_at)
      values (public.prod_apt_proximo_codigo(v_data), v_tramo, 'reparo', v_reparos, v_data, 'importacao', v_lote, auth.uid(), clock_timestamp())
      on conflict (importacao_id, tramo_id, tipo) where tipo = 'reparo' and importacao_id is not null and excluido_em is null do nothing;
      get diagnostics v_n = row_count;
      v_inseridos := v_inseridos + v_n;
    end if;
  end loop;

  foreach v_tramo in array v_tramos loop
    perform private.prod_apt_sincronizar_entrega(v_tramo, true);
  end loop;

  update public.prod_apt_importacoes_tramos set status = 'historico_importado' where id = v_lote;
  return jsonb_build_object('eventosInseridos', v_inseridos);
end;
$$;

revoke all on function public.prod_apt_registrar_tramos(jsonb) from public, anon;
revoke all on function public.prod_apt_corrigir_evento_tramo(jsonb) from public, anon;
revoke all on function public.prod_apt_importar_snapshot_tramos(jsonb) from public, anon;
grant execute on function public.prod_apt_registrar_tramos(jsonb), public.prod_apt_corrigir_evento_tramo(jsonb),
  public.prod_apt_importar_snapshot_tramos(jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 8. Metas por marco
-- ---------------------------------------------------------------------

-- Mensal = a meta da planilha (NAV01, Jato, Greentag). Semanal é opcional
-- (hoje só o Jato tem); nada é rateado de mês para semana.
create table if not exists public.prod_apt_metas_marco (
  marco text not null check (marco in ('inicio', 'liberado_nav02', 'liberado_jato', 'liberado_patio', 'expedido')),
  granularidade text not null check (granularidade in ('mes', 'semana')),
  ano integer not null check (ano between 2020 and 2100),
  periodo integer not null check (periodo between 1 and 53),
  quantidade integer not null check (quantidade >= 0),
  atualizado_por uuid default auth.uid(),
  atualizado_em timestamptz not null default now(),
  primary key (marco, granularidade, ano, periodo),
  check (granularidade = 'semana' or periodo <= 12)
);

-- Total do marco e prazo final (base do ritmo necessário).
create table if not exists public.prod_apt_prazos_marco (
  marco text primary key check (marco in ('inicio', 'liberado_nav02', 'liberado_jato', 'liberado_patio', 'expedido')),
  total integer not null default 115 check (total > 0),
  prazo date,
  atualizado_por uuid default auth.uid(),
  atualizado_em timestamptz not null default now()
);

alter table public.prod_apt_metas_marco enable row level security;
alter table public.prod_apt_prazos_marco enable row level security;
revoke all on public.prod_apt_metas_marco, public.prod_apt_prazos_marco from anon;
grant select, insert, update, delete on public.prod_apt_metas_marco, public.prod_apt_prazos_marco to authenticated;

create policy prod_apt_metas_marco_sel on public.prod_apt_metas_marco for select to authenticated using (true);
create policy prod_apt_metas_marco_ins on public.prod_apt_metas_marco for insert to authenticated
  with check ((select private.prod_apt_pode('prod_apt_programar')));
create policy prod_apt_metas_marco_upd on public.prod_apt_metas_marco for update to authenticated
  using ((select private.prod_apt_pode('prod_apt_programar')))
  with check ((select private.prod_apt_pode('prod_apt_programar')));
create policy prod_apt_metas_marco_del on public.prod_apt_metas_marco for delete to authenticated
  using ((select private.prod_apt_pode('prod_apt_programar')));

create policy prod_apt_prazos_marco_sel on public.prod_apt_prazos_marco for select to authenticated using (true);
create policy prod_apt_prazos_marco_ins on public.prod_apt_prazos_marco for insert to authenticated
  with check ((select private.prod_apt_pode('prod_apt_programar')));
create policy prod_apt_prazos_marco_upd on public.prod_apt_prazos_marco for update to authenticated
  using ((select private.prod_apt_pode('prod_apt_programar')))
  with check ((select private.prod_apt_pode('prod_apt_programar')));

-- Metas da planilha "PROD — Avanço de Produção" (07/10/2026).
insert into public.prod_apt_metas_marco (marco, granularidade, ano, periodo, quantidade) values
  ('liberado_nav02', 'mes', 2026, 6, 25), ('liberado_nav02', 'mes', 2026, 7, 25), ('liberado_nav02', 'mes', 2026, 8, 25),
  ('liberado_nav02', 'mes', 2026, 9, 25), ('liberado_nav02', 'mes', 2026, 10, 15),
  ('liberado_jato', 'mes', 2026, 6, 4), ('liberado_jato', 'mes', 2026, 7, 18), ('liberado_jato', 'mes', 2026, 8, 25),
  ('liberado_jato', 'mes', 2026, 9, 27), ('liberado_jato', 'mes', 2026, 10, 25), ('liberado_jato', 'mes', 2026, 11, 16),
  ('liberado_patio', 'mes', 2026, 7, 1), ('liberado_patio', 'mes', 2026, 8, 25), ('liberado_patio', 'mes', 2026, 9, 25),
  ('liberado_patio', 'mes', 2026, 10, 25), ('liberado_patio', 'mes', 2026, 11, 25), ('liberado_patio', 'mes', 2026, 12, 14),
  ('liberado_jato', 'semana', 2026, 32, 6), ('liberado_jato', 'semana', 2026, 33, 6), ('liberado_jato', 'semana', 2026, 34, 6),
  ('liberado_jato', 'semana', 2026, 35, 6), ('liberado_jato', 'semana', 2026, 36, 6), ('liberado_jato', 'semana', 2026, 37, 5),
  ('liberado_jato', 'semana', 2026, 38, 6), ('liberado_jato', 'semana', 2026, 39, 6), ('liberado_jato', 'semana', 2026, 40, 6),
  ('liberado_jato', 'semana', 2026, 41, 6), ('liberado_jato', 'semana', 2026, 42, 6), ('liberado_jato', 'semana', 2026, 43, 6),
  ('liberado_jato', 'semana', 2026, 44, 6), ('liberado_jato', 'semana', 2026, 45, 4), ('liberado_jato', 'semana', 2026, 46, 4),
  ('liberado_jato', 'semana', 2026, 47, 4), ('liberado_jato', 'semana', 2026, 48, 4)
on conflict do nothing;

-- Prazo inicial = fim do último mês com meta. Planejamento ajusta na tela.
insert into public.prod_apt_prazos_marco (marco, total, prazo) values
  ('inicio', 115, null),
  ('liberado_nav02', 115, date '2026-10-31'),
  ('liberado_jato', 115, date '2026-11-30'),
  ('liberado_patio', 115, date '2026-12-31'),
  ('expedido', 115, null)
on conflict (marco) do nothing;
