-- Relatório "Prazo por etapa" (Geral › Relatórios, abaixo do Faturamento).
--
-- Meta: os 115 tramos da 1ª fase (SP01) prontos na W49 — cada etapa tem uma
-- data final. Não há apontamento novo: o relatório sai do razão por tramo
-- (prod_apt_tramo_eventos), que a Produção já alimenta em Apontamentos.
--
-- Uma etapa está "pronta" para o tramo quando ele chega ao ponto seguinte do
-- fluxo. O ponto é um marco (ex.: Liberado p/ Jato conclui Internos) ou o
-- primeiro setor de situação seguinte (ex.: chegar em Pintura conclui o Jato).
-- O fluxo é ordenado por prod_apt_situacoes.ordem; cada marco vale a primeira
-- situação da etapa que ele abre.

create table if not exists public.prod_apt_relatorio_etapas (
  codigo text primary key,
  nome text not null,
  ordem integer not null,
  -- 'marco': pronto quando o tramo tem o marco; 'setor': quando chega a esse setor (ou além).
  regra_tipo text not null check (regra_tipo in ('marco', 'setor')),
  regra_valor text not null,
  -- 'T1': conta só os T1 (Marco Porta é feito no T1, um por torre).
  escopo text not null default 'todos' check (escopo in ('todos', 'T1')),
  data_final date,
  ativo boolean not null default true,
  atualizado_por uuid default auth.uid(),
  atualizado_em timestamptz not null default now()
);

alter table public.prod_apt_relatorio_etapas enable row level security;
revoke all on public.prod_apt_relatorio_etapas from anon;
grant select, update on public.prod_apt_relatorio_etapas to authenticated;

create policy prod_apt_relatorio_etapas_sel on public.prod_apt_relatorio_etapas
  for select to authenticated using (true);
-- Datas finais: o Planejamento (mesma flag das metas por marco).
create policy prod_apt_relatorio_etapas_upd on public.prod_apt_relatorio_etapas
  for update to authenticated
  using ((select private.prod_apt_pode('prod_apt_programar')))
  with check ((select private.prod_apt_pode('prod_apt_programar')));

-- Etapas e datas finais da planilha de acompanhamento (09/10/2026).
insert into public.prod_apt_relatorio_etapas (codigo, nome, ordem, regra_tipo, regra_valor, escopo, data_final) values
  ('corte',        'Corte',                 10, 'marco', 'inicio',                'todos', date '2026-10-31'),
  ('nav01',        'NAV01',                 20, 'marco', 'liberado_nav02',        'todos', date '2026-11-07'),
  ('marco_porta',  'Marco Porta',           30, 'setor', 'SAW03',                 'T1',    date '2026-11-11'),
  ('saw03',        'SAW03',                 40, 'setor', 'Internos',              'todos', date '2026-11-14'),
  ('internos',     'Internos',              50, 'marco', 'liberado_jato',         'todos', date '2026-11-20'),
  ('jato',         'Jato',                  60, 'setor', 'Pintura',               'todos', date '2026-11-21'),
  ('pintura',      'Pintura',               70, 'setor', 'Acabamento de Pintura', 'todos', date '2026-11-25'),
  ('acabamento',   'Acabamento de Pintura', 80, 'setor', 'Montagem',              'todos', date '2026-12-01'),
  ('montagem',     'Montagem Final',        90, 'marco', 'liberado_patio',        'todos', date '2026-12-05')
on conflict (codigo) do nothing;

-- Números agregados para a página de Relatórios (aberta a todos): total,
-- data em que cada tramo concluiu cada etapa e os feriados do calendário do
-- Planejamento. Não expõe o razão linha a linha.
create or replace function public.prod_relatorio_etapas_tramos()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with sit as (
    select id, setor, etapa, ordem from public.prod_apt_situacoes
  ),
  rank_etapa as (
    select etapa, min(ordem) as r from sit group by etapa
  ),
  rank_marco as (
    select m.marco, re.r
      from (values ('inicio', 'nav01'), ('liberado_nav02', 'nav02'), ('liberado_jato', 'jato'),
                   ('liberado_patio', 'patio'), ('expedido', 'expedido')) as m(marco, etapa)
      join rank_etapa re on re.etapa = m.etapa
  ),
  tramos as (
    select id, tramo from public.proj_tramos_gwjaco where subprojeto_id = 'SP01'
  ),
  ev as (
    select e.tramo_id, e.data_operacional, coalesce(rm.r, s.ordem) as r
      from public.prod_apt_tramo_eventos e
      left join rank_marco rm on e.tipo = 'marco' and rm.marco = e.marco
      left join sit s on e.tipo = 'situacao' and s.id = e.situacao_id
     where e.excluido_em is null and e.tipo in ('marco', 'situacao')
  ),
  cfg as (
    select c.*,
           case when c.regra_tipo = 'marco'
                then (select r from rank_marco where marco = c.regra_valor)
                else (select min(ordem) from sit where lower(setor) = lower(c.regra_valor)) end as limiar
      from public.prod_apt_relatorio_etapas c
     where c.ativo
  ),
  conclusao as (
    select c.codigo, t.id as tramo_id,
           (select min(ev.data_operacional) from ev where ev.tramo_id = t.id and ev.r >= c.limiar) as data
      from cfg c
      join tramos t on c.escopo = 'todos' or t.tramo = 'T1'
  )
  select case when auth.uid() is null then null else jsonb_build_object(
    'hoje', (now() at time zone 'America/Sao_Paulo')::date,
    'etapas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'codigo', c.codigo,
               'nome', c.nome,
               'ordem', c.ordem,
               'escopo', c.escopo,
               'dataFinal', c.data_final,
               'regraValida', c.limiar is not null,
               'total', (select count(*) from conclusao k where k.codigo = c.codigo),
               'datas', (select coalesce(jsonb_agg(k.data order by k.data), '[]'::jsonb)
                           from conclusao k where k.codigo = c.codigo and k.data is not null)
             ) order by c.ordem)
        from cfg c), '[]'::jsonb),
    'feriados', coalesce((
      select jsonb_agg(f.data order by f.data)
        from public.planejamento_acomp_diario_feriados f
       where f.data >= (now() at time zone 'America/Sao_Paulo')::date - 120), '[]'::jsonb)
  ) end
$$;

revoke all on function public.prod_relatorio_etapas_tramos() from public, anon;
grant execute on function public.prod_relatorio_etapas_tramos() to authenticated;
