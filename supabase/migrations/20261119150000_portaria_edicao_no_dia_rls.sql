-- Modulo Portaria & Seguranca Patrimonial:
-- Usuarios vinculados ao setor Portaria (core_setores.id = '19') podem alterar
-- registros da portaria durante o proprio dia em que o registro foi realizado
-- (inclusive a partir de outros aparelhos/usuarios do setor Portaria).
-- Apos finalizar o dia (dia seguinte no fuso America/Bahia), somente admin pode alterar.
-- Acoes operacionais que atravessam a virada do dia (encerrar plantao em andamento,
-- registrar saida de veiculo/carreta/equipamento no patio e concluir bafometro pendente)
-- continuam permitidas.

create or replace function public.port_pode_editar_no_dia(
  p_dono text,
  p_data date,
  p_created_at timestamptz default null
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with me as (
    select id, roles, sector_id
    from public.core_perfis
    where id = (select auth.uid())::text
      and status = 'ativo'
  ),
  ref as (
    select
      coalesce(p_data, (p_created_at at time zone 'America/Bahia')::date) as dia_reg,
      (now() at time zone 'America/Bahia')::date as hoje
  )
  select exists (
    select 1
    from me, ref
    where 'admin' = any(me.roles)
       or (
         ref.dia_reg = ref.hoje
         and (
           me.sector_id = '19'
           or (p_dono is not null and p_dono = me.id)
         )
       )
  );
$$;

revoke execute on function public.port_pode_editar_no_dia(text, date, timestamptz) from public, anon;
grant execute on function public.port_pode_editar_no_dia(text, date, timestamptz) to authenticated, service_role;

-- 1) port_alcoolemia_testes
drop policy if exists port_alcoolemia_testes_upd on public.port_alcoolemia_testes;
create policy port_alcoolemia_testes_upd on public.port_alcoolemia_testes
  for update to authenticated
  using (
    public.port_pode_editar_no_dia(criado_por, data, created_at)
    or resultado = 'PENDENTE'
  )
  with check (auth.uid() is not null);

drop policy if exists port_alcoolemia_testes_del on public.port_alcoolemia_testes;
create policy port_alcoolemia_testes_del on public.port_alcoolemia_testes
  for delete to authenticated
  using (public.port_pode_editar_no_dia(criado_por, data, created_at));

-- 2) port_relatorio_portaria (livro de ocorrencias)
drop policy if exists port_relatorio_portaria_rw on public.port_relatorio_portaria;
drop policy if exists port_relatorio_portaria_sel on public.port_relatorio_portaria;
drop policy if exists port_relatorio_portaria_ins on public.port_relatorio_portaria;
drop policy if exists port_relatorio_portaria_upd on public.port_relatorio_portaria;
drop policy if exists port_relatorio_portaria_del on public.port_relatorio_portaria;

create policy port_relatorio_portaria_sel on public.port_relatorio_portaria
  for select to authenticated using (true);
create policy port_relatorio_portaria_ins on public.port_relatorio_portaria
  for insert to authenticated with check (auth.uid() is not null);
create policy port_relatorio_portaria_upd on public.port_relatorio_portaria
  for update to authenticated
  using (
    public.port_pode_editar_no_dia(criado_por, data, created_at)
    or status = 'EM_ANDAMENTO'
  )
  with check (auth.uid() is not null);
create policy port_relatorio_portaria_del on public.port_relatorio_portaria
  for delete to authenticated
  using (public.port_pode_editar_no_dia(criado_por, data, created_at));

-- 3) port_relatorio_ocorrencias (lancamentos do livro)
drop policy if exists port_relatorio_ocorrencias_rw on public.port_relatorio_ocorrencias;
drop policy if exists port_relatorio_ocorrencias_sel on public.port_relatorio_ocorrencias;
drop policy if exists port_relatorio_ocorrencias_ins on public.port_relatorio_ocorrencias;
drop policy if exists port_relatorio_ocorrencias_upd on public.port_relatorio_ocorrencias;
drop policy if exists port_relatorio_ocorrencias_del on public.port_relatorio_ocorrencias;

create policy port_relatorio_ocorrencias_sel on public.port_relatorio_ocorrencias
  for select to authenticated using (true);
create policy port_relatorio_ocorrencias_ins on public.port_relatorio_ocorrencias
  for insert to authenticated with check (auth.uid() is not null);
create policy port_relatorio_ocorrencias_upd on public.port_relatorio_ocorrencias
  for update to authenticated
  using (
    exists (
      select 1
      from public.port_relatorio_portaria r
      where r.id = relatorio_id
        and public.port_pode_editar_no_dia(r.criado_por, r.data, coalesce(port_relatorio_ocorrencias.created_at, r.created_at))
    )
    or status_permanencia in ('NO_PATIO', 'AGUARDANDO_RETORNO')
  )
  with check (auth.uid() is not null);
create policy port_relatorio_ocorrencias_del on public.port_relatorio_ocorrencias
  for delete to authenticated
  using (
    exists (
      select 1
      from public.port_relatorio_portaria r
      where r.id = relatorio_id
        and public.port_pode_editar_no_dia(r.criado_por, r.data, coalesce(port_relatorio_ocorrencias.created_at, r.created_at))
    )
  );

-- 4) port_passagem_plantao
drop policy if exists port_passagem_all on public.port_passagem_plantao;
drop policy if exists port_passagem_ins on public.port_passagem_plantao;
drop policy if exists port_passagem_upd on public.port_passagem_plantao;
drop policy if exists port_passagem_del on public.port_passagem_plantao;

create policy port_passagem_ins on public.port_passagem_plantao
  for insert to authenticated with check (auth.uid() is not null);
create policy port_passagem_upd on public.port_passagem_plantao
  for update to authenticated
  using (
    public.port_pode_editar_no_dia(criado_por::text, data, created_at)
    or status = 'EM_ANDAMENTO'
  )
  with check (auth.uid() is not null);
create policy port_passagem_del on public.port_passagem_plantao
  for delete to authenticated
  using (public.port_pode_editar_no_dia(criado_por::text, data, created_at));

-- 5) port_controle_carretas
drop policy if exists port_controle_carretas_rw on public.port_controle_carretas;
drop policy if exists port_controle_carretas_sel on public.port_controle_carretas;
drop policy if exists port_controle_carretas_ins on public.port_controle_carretas;
drop policy if exists port_controle_carretas_upd on public.port_controle_carretas;
drop policy if exists port_controle_carretas_del on public.port_controle_carretas;

create policy port_controle_carretas_sel on public.port_controle_carretas
  for select to authenticated using (true);
create policy port_controle_carretas_ins on public.port_controle_carretas
  for insert to authenticated with check (auth.uid() is not null);
create policy port_controle_carretas_upd on public.port_controle_carretas
  for update to authenticated
  using (
    public.port_pode_editar_no_dia(criado_por, data_entrada, created_at)
    or status <> 'FINALIZADO'
  )
  with check (auth.uid() is not null);
create policy port_controle_carretas_del on public.port_controle_carretas
  for delete to authenticated
  using (public.port_pode_editar_no_dia(criado_por, data_entrada, created_at));

-- 6) port_controle_equipamentos
drop policy if exists port_controle_equipamentos_rw on public.port_controle_equipamentos;
drop policy if exists port_controle_equipamentos_sel on public.port_controle_equipamentos;
drop policy if exists port_controle_equipamentos_ins on public.port_controle_equipamentos;
drop policy if exists port_controle_equipamentos_upd on public.port_controle_equipamentos;
drop policy if exists port_controle_equipamentos_del on public.port_controle_equipamentos;

create policy port_controle_equipamentos_sel on public.port_controle_equipamentos
  for select to authenticated using (true);
create policy port_controle_equipamentos_ins on public.port_controle_equipamentos
  for insert to authenticated with check (auth.uid() is not null);
create policy port_controle_equipamentos_upd on public.port_controle_equipamentos
  for update to authenticated
  using (
    public.port_pode_editar_no_dia(criado_por, data_entrada, created_at)
    or status <> 'FINALIZADO'
  )
  with check (auth.uid() is not null);
create policy port_controle_equipamentos_del on public.port_controle_equipamentos
  for delete to authenticated
  using (public.port_pode_editar_no_dia(criado_por, data_entrada, created_at));

-- 7) port_registro_transportes
drop policy if exists port_registro_transportes_rw on public.port_registro_transportes;
drop policy if exists port_registro_transportes_sel on public.port_registro_transportes;
drop policy if exists port_registro_transportes_ins on public.port_registro_transportes;
drop policy if exists port_registro_transportes_upd on public.port_registro_transportes;
drop policy if exists port_registro_transportes_del on public.port_registro_transportes;

create policy port_registro_transportes_sel on public.port_registro_transportes
  for select to authenticated using (true);
create policy port_registro_transportes_ins on public.port_registro_transportes
  for insert to authenticated with check (auth.uid() is not null);
create policy port_registro_transportes_upd on public.port_registro_transportes
  for update to authenticated
  using (
    public.port_pode_editar_no_dia(criado_por, data, created_at)
    or status <> 'FINALIZADO'
  )
  with check (auth.uid() is not null);
create policy port_registro_transportes_del on public.port_registro_transportes
  for delete to authenticated
  using (public.port_pode_editar_no_dia(criado_por, data, created_at));

-- 8) port_briefing_sessoes
drop policy if exists port_briefing_sessoes_rw on public.port_briefing_sessoes;
drop policy if exists port_briefing_sessoes_sel on public.port_briefing_sessoes;
drop policy if exists port_briefing_sessoes_ins on public.port_briefing_sessoes;
drop policy if exists port_briefing_sessoes_upd on public.port_briefing_sessoes;
drop policy if exists port_briefing_sessoes_del on public.port_briefing_sessoes;

create policy port_briefing_sessoes_sel on public.port_briefing_sessoes
  for select to authenticated using (true);
create policy port_briefing_sessoes_ins on public.port_briefing_sessoes
  for insert to authenticated with check (auth.uid() is not null);
create policy port_briefing_sessoes_upd on public.port_briefing_sessoes
  for update to authenticated
  using (public.port_pode_editar_no_dia(criado_por, data, created_at))
  with check (auth.uid() is not null);
create policy port_briefing_sessoes_del on public.port_briefing_sessoes
  for delete to authenticated
  using (public.port_pode_editar_no_dia(criado_por, data, created_at));

