-- =====================================================================
-- Produção › Apontamentos — versão simplificada (25/09/2026).
--
-- A primeira versão (20260925120000/120100) modelava início/pausa/fim por
-- peça, cadeia chapa→virola→tramo e Green Tag. Decisão do usuário: começar
-- só apontando o REALIZADO por etapa, sem travar etapas nem vincular peças.
-- Esta migration desmonta aquela estrutura e cria:
--
--   * prod_apt_etapas            — catálogo por nave (Nave 1, Nave 2, White);
--   * prod_apt_programacao       — PROGRAMADO por semana ISO e etapa, lançado
--                                  pelo Planejamento (flag prod_apt_programar);
--   * prod_apt_lancamentos/itens — REALIZADO: cada envio do formulário de uma
--                                  nave é um registro APT-DDMMYY-NN com a
--                                  quantidade de cada etapa no dia;
--   * prod_apt_realizado_semanal — soma por semana ISO, base da tabela
--                                  Programado × Realizado e dos relatórios.
--
-- Quem lança o realizado: qualquer usuário com acesso à página (que herda o
-- acesso ao módulo Produção, como o Plano de Expedição).
-- =====================================================================

-- As tabelas antigas só tinham 6 apontamentos de teste do próprio usuário
-- (25/09), descartados com a confirmação dele.

drop function if exists public.prod_apt_registrar_evento(jsonb);
drop function if exists public.prod_apt_marcar_checklist(jsonb);
drop function if exists public.prod_apt_emitir_green_tag(jsonb);
drop function if exists public.prod_apt_cancelar_green_tag(uuid, text);
drop function if exists public.prod_apt_cancelar_execucao(uuid, text);
drop function if exists public.prod_apt_corrigir_evento(uuid, timestamptz, uuid, text, text);
drop function if exists public.prod_apt_fila(text, text, boolean, integer);
drop function if exists public.prod_apt_candidatos_green_tag(text);
drop function if exists public.prod_apt_pendencias_green_tag(text, text);
drop function if exists public.prod_apt_liberado_para(text, text, text);
drop function if exists public.prod_apt_etapa_concluida(text, text, text);
drop function if exists public.prod_apt_proximo_codigo(text, date);

drop table if exists public.prod_apt_alteracoes;
drop table if exists public.prod_apt_checklist_marcas;
drop table if exists public.prod_apt_eventos;
drop table if exists public.prod_apt_green_tags;
drop table if exists public.prod_apt_execucoes;
drop table if exists public.prod_apt_checklist_itens;
drop table if exists public.prod_apt_posicoes;
drop table if exists public.prod_apt_motivos_pausa;
drop table if exists public.prod_apt_diario;
drop table if exists public.prod_apt_programacao;
drop table if exists public.prod_apt_etapas;

-- ---------------------------------------------------------------------
-- Autorização
-- ---------------------------------------------------------------------

create schema if not exists private;

-- Admin ou flag ligada em page_access (FEATURE_FLAGS sem defaultRoles).
create or replace function private.prod_apt_pode(p_flag text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.core_perfis perfil
     where perfil.id = (select auth.uid())::text
       and perfil.status = 'ativo'
       and (
         'admin' = any(perfil.roles)
         or coalesce((perfil.page_access ->> p_flag)::boolean, false)
       )
  );
$$;

-- Lançar o realizado: quem acessa a página. A página herda o acesso ao hub
-- de Produção, salvo bloqueio explícito — espelha `canAccessPage` no cliente.
create or replace function private.prod_apt_pode_lancar()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.core_perfis perfil
     where perfil.id = (select auth.uid())::text
       and perfil.status = 'ativo'
       and (
         'admin' = any(perfil.roles)
         or coalesce(
           (perfil.page_access ->> 'prod_apontamentos')::boolean,
           (perfil.page_access ->> 'producao_home')::boolean,
           false
         )
       )
  );
$$;

revoke all on function private.prod_apt_pode(text) from public, anon;
revoke all on function private.prod_apt_pode_lancar() from public, anon;
grant usage on schema private to authenticated, service_role;
grant execute on function private.prod_apt_pode(text) to authenticated, service_role;
grant execute on function private.prod_apt_pode_lancar() to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------

create table public.prod_apt_etapas (
  id text primary key,
  nave text not null check (nave in ('nave1','nave2','white')),
  nome text not null,
  ordem integer not null,
  ativa boolean not null default true,
  created_at timestamptz not null default now()
);

-- Programado por semana ISO (ano ISO + semana), como a planilha W32..W36.
create table public.prod_apt_programacao (
  ano integer not null check (ano between 2020 and 2100),
  semana integer not null check (semana between 1 and 53),
  etapa_id text not null references public.prod_apt_etapas(id),
  quantidade integer not null check (quantidade >= 0),
  atualizado_por text default (auth.uid())::text,
  atualizado_por_nome text,
  updated_at timestamptz not null default now(),
  primary key (ano, semana, etapa_id)
);

create table public.prod_apt_lancamentos (
  -- Gerado no aparelho: o reenvio do outbox cai no mesmo registro.
  id uuid primary key,
  -- APT-DDMMYY-NN pela data de produção; índice reinicia por dia.
  codigo text not null unique,
  data date not null,
  nave text not null check (nave in ('nave1','nave2','white')),
  observacao text,
  criado_por text references public.core_perfis(id) default (auth.uid())::text,
  criado_por_nome text,
  atualizado_por_nome text,
  excluido_em timestamptz,
  excluido_por text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index prod_apt_lancamentos_data_idx on public.prod_apt_lancamentos (data, nave);

create table public.prod_apt_lancamento_itens (
  lancamento_id uuid not null references public.prod_apt_lancamentos(id) on delete cascade,
  etapa_id text not null references public.prod_apt_etapas(id),
  quantidade integer not null check (quantidade > 0),
  primary key (lancamento_id, etapa_id)
);

-- Realizado por semana ISO. security_invoker: respeita a RLS de quem consulta.
create view public.prod_apt_realizado_semanal
with (security_invoker = true) as
select
  extract(isoyear from l.data)::int as ano,
  extract(week from l.data)::int as semana,
  i.etapa_id,
  sum(i.quantidade)::int as quantidade
from public.prod_apt_lancamento_itens i
join public.prod_apt_lancamentos l on l.id = i.lancamento_id
where l.excluido_em is null
group by 1, 2, 3;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------

alter table public.prod_apt_etapas enable row level security;
alter table public.prod_apt_programacao enable row level security;
alter table public.prod_apt_lancamentos enable row level security;
alter table public.prod_apt_lancamento_itens enable row level security;

create policy prod_apt_etapas_sel on public.prod_apt_etapas for select to authenticated using (true);
create policy prod_apt_etapas_ins on public.prod_apt_etapas for insert to authenticated
  with check ((select private.prod_apt_pode('prod_apt_cadastros')));
create policy prod_apt_etapas_upd on public.prod_apt_etapas for update to authenticated
  using ((select private.prod_apt_pode('prod_apt_cadastros')))
  with check ((select private.prod_apt_pode('prod_apt_cadastros')));

create policy prod_apt_programacao_sel on public.prod_apt_programacao for select to authenticated using (true);
create policy prod_apt_programacao_ins on public.prod_apt_programacao for insert to authenticated
  with check ((select private.prod_apt_pode('prod_apt_programar')));
create policy prod_apt_programacao_upd on public.prod_apt_programacao for update to authenticated
  using ((select private.prod_apt_pode('prod_apt_programar')))
  with check ((select private.prod_apt_pode('prod_apt_programar')));
create policy prod_apt_programacao_del on public.prod_apt_programacao for delete to authenticated
  using ((select private.prod_apt_pode('prod_apt_programar')));

create policy prod_apt_lancamentos_sel on public.prod_apt_lancamentos for select to authenticated using (true);
create policy prod_apt_lancamento_itens_sel on public.prod_apt_lancamento_itens for select to authenticated using (true);

-- Lançamentos: escrita só pelas RPCs (código do dia + itens na mesma transação).
revoke all on public.prod_apt_etapas, public.prod_apt_programacao,
  public.prod_apt_lancamentos, public.prod_apt_lancamento_itens,
  public.prod_apt_realizado_semanal from anon;
revoke delete on public.prod_apt_etapas from authenticated;
revoke insert, update, delete on public.prod_apt_lancamentos, public.prod_apt_lancamento_itens from authenticated;

-- ---------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------

-- Próximo `APT-DDMMYY-NN` (regra 2 do CLAUDE.md). Recorte: POR DIA da data de
-- produção — cada nave manda um ou poucos lançamentos por dia. O advisory
-- lock serializa dois envios simultâneos do mesmo dia.
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
    from public.prod_apt_lancamentos
   where codigo like 'APT-' || v_ddmmyy || '-%';
  return 'APT-' || v_ddmmyy || '-' || lpad((v_max + 1)::text, 2, '0');
end;
$$;

-- Cria ou edita um lançamento (id gerado no aparelho). Editar: só autor ou
-- admin (form_pode_editar). Idempotente: o reenvio do outbox com o mesmo id
-- regrava os mesmos itens.
create or replace function public.prod_apt_salvar_lancamento(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid text := (select auth.uid())::text;
  v_id uuid := nullif(p->>'id', '')::uuid;
  v_data date := nullif(p->>'data', '')::date;
  v_nave text := p->>'nave';
  v_obs text := nullif(btrim(coalesce(p->>'observacao', '')), '');
  v_atual public.prod_apt_lancamentos%rowtype;
  v_nome text;
  v_codigo text;
  v_item jsonb;
  v_qtd int;
  v_n int := 0;
begin
  if v_uid is null then
    raise exception 'Sessão expirada — entre novamente para lançar.';
  end if;
  if not private.prod_apt_pode_lancar() then
    raise exception 'Sem acesso aos apontamentos de produção.';
  end if;
  if v_id is null then
    raise exception 'id do lançamento é obrigatório.';
  end if;
  if v_data is null or v_data > (now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'Data de produção inválida.';
  end if;
  if v_nave is null or v_nave not in ('nave1','nave2','white') then
    raise exception 'Nave inválida.';
  end if;

  -- Valida os itens antes de gravar qualquer coisa.
  for v_item in select * from jsonb_array_elements(coalesce(p->'itens', '[]'::jsonb)) loop
    v_qtd := nullif(v_item->>'quantidade', '')::int;
    if v_qtd is null or v_qtd = 0 then
      continue;
    end if;
    if v_qtd < 0 then
      raise exception 'Quantidade negativa não é permitida.';
    end if;
    if not exists (
      select 1 from public.prod_apt_etapas where id = v_item->>'etapa_id' and nave = v_nave
    ) then
      raise exception 'Etapa % não pertence a esta nave.', v_item->>'etapa_id';
    end if;
    v_n := v_n + 1;
  end loop;
  if v_n = 0 then
    raise exception 'Informe a quantidade de pelo menos uma etapa.';
  end if;

  select name into v_nome from public.core_perfis where id = v_uid;
  select * into v_atual from public.prod_apt_lancamentos where id = v_id for update;

  if found then
    if v_atual.excluido_em is not null then
      raise exception 'O lançamento % foi excluído.', v_atual.codigo;
    end if;
    if not public.form_pode_editar(v_atual.criado_por) then
      raise exception 'Só quem lançou (ou um admin) pode editar este lançamento.';
    end if;
    if v_atual.nave <> v_nave then
      raise exception 'Não é possível mudar a nave de um lançamento.';
    end if;
    update public.prod_apt_lancamentos
       set data = v_data, observacao = v_obs, atualizado_por_nome = v_nome, updated_at = now()
     where id = v_id;
    delete from public.prod_apt_lancamento_itens where lancamento_id = v_id;
    v_codigo := v_atual.codigo;
  else
    v_codigo := public.prod_apt_proximo_codigo(v_data);
    insert into public.prod_apt_lancamentos (id, codigo, data, nave, observacao, criado_por, criado_por_nome)
    values (v_id, v_codigo, v_data, v_nave, v_obs, v_uid, v_nome);
  end if;

  insert into public.prod_apt_lancamento_itens (lancamento_id, etapa_id, quantidade)
  select v_id, x->>'etapa_id', sum((x->>'quantidade')::int)
    from jsonb_array_elements(p->'itens') x
   where nullif(x->>'quantidade', '')::int > 0
   group by x->>'etapa_id';

  return jsonb_build_object('id', v_id, 'codigo', v_codigo);
end;
$$;

create or replace function public.prod_apt_excluir_lancamento(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid text := (select auth.uid())::text;
  v_atual public.prod_apt_lancamentos%rowtype;
begin
  if v_uid is null then
    raise exception 'Sessão expirada — entre novamente.';
  end if;
  select * into v_atual from public.prod_apt_lancamentos where id = p_id for update;
  if not found or v_atual.excluido_em is not null then
    raise exception 'Lançamento não encontrado ou já excluído.';
  end if;
  if not public.form_pode_editar(v_atual.criado_por) then
    raise exception 'Só quem lançou (ou um admin) pode excluir este lançamento.';
  end if;
  update public.prod_apt_lancamentos
     set excluido_em = now(), excluido_por = v_uid, updated_at = now()
   where id = p_id;
  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.prod_apt_proximo_codigo(date) from public, anon, authenticated;
revoke execute on function public.prod_apt_salvar_lancamento(jsonb) from public, anon;
revoke execute on function public.prod_apt_excluir_lancamento(uuid) from public, anon;
grant execute on function public.prod_apt_salvar_lancamento(jsonb) to authenticated;
grant execute on function public.prod_apt_excluir_lancamento(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Seed — as etapas dos relatórios diários de WhatsApp. Editável na página.
-- ---------------------------------------------------------------------

insert into public.prod_apt_etapas (id, nave, nome, ordem) values
  ('corte',                 'nave1', 'Corte',                          10),
  ('pre_jato',              'nave1', 'Pré-Jato',                       20),
  ('chanfro',               'nave1', 'Chanfro',                        30),
  ('calandra',              'nave1', 'Calandra',                       40),
  ('recalandra',            'nave1', 'Recalandra',                     50),
  ('lw',                    'nave1', 'LW (Solda)',                     60),
  ('liberacao_virola',      'nave1', 'Liberação de Virola',            70),
  ('montagem_flange',       'nave1', 'Montagem de Flange',             80),
  ('montagem_bipartida',    'nave1', 'Montagem da Bi-Partida',         90),
  ('passagem_virola',       'nave1', 'Passagem de Virola',            100),
  ('marco_porta',           'nave1', 'Marco Porta',                   110),
  ('montagem_virola_saw',   'nave1', 'Montagem de Virola SAW 2 e 3',  120),
  ('solda_virola_saw',      'nave1', 'Solda de Virola SAW 2 e 3',     130),
  ('tramos_liberados_saw',  'nave1', 'Tramos Liberados p/ SAW 2 e 3', 140),
  ('saw03',                 'nave2', 'SAW 03',                         10),
  ('internos_soldaveis',    'nave2', 'Internos Soldáveis',             20),
  ('tramos_liberados_jato', 'nave2', 'Tramos Liberados p/ Jato',       30),
  ('jato',                  'white', 'Jato',                           10),
  ('metalizacao',           'white', 'Metalização',                    20),
  ('pintura',               'white', 'Pintura',                        30),
  ('reparo',                'white', 'Reparo / Montagem Final',        40)
on conflict (id) do nothing;

notify pgrst, 'reload schema';
