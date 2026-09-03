-- =====================================================================
-- Formulários — RLS "só o autor ou um admin edita".
--
-- Antes, toda tabela de formulário tinha uma única policy permissiva
--   for all to authenticated using (true) with check (true)
-- ou seja: qualquer usuário autenticado podia editar/apagar QUALQUER
-- resposta chamando o supabase-js direto do navegador. O bloqueio feito
-- na UI era só cosmético.
--
-- Agora, por tabela:
--   SELECT  — liberado a todo autenticado (as respostas continuam
--             visíveis para os demais; o recorte de quem vê o módulo
--             segue sendo a gate de página no cliente).
--   INSERT  — o autor só pode criar registros em nome dele mesmo
--             (ou admin). O `criado_por`/`solicitante_id` passa a ter
--             default = auth.uid(), então o cliente nem precisa mandar.
--   UPDATE  — só o autor (criado_por = auth.uid()) ou um admin.
--             Cobre também o soft-delete e o "restaurar", que são UPDATE.
--   DELETE  — idem UPDATE (hard delete raramente é usado, mas fica travado).
--
-- Tabelas-filhas (itens/ocorrências/participantes/tramos/fotos) herdam
-- o dono da linha-pai.
--
-- Fora de escopo: port_vigilantes e port_materiais_seguranca são
-- cadastros administrados só pelas telas de Admin/Facilities, não são
-- "respostas de formulário" — ficam como estão.
-- =====================================================================

-- Helper: dono informado bate com o usuário logado, ou o usuário é admin.
-- security invoker + stable: o Postgres cacheia por statement e a checagem
-- de admin reaproveita public.has_role('admin').
create or replace function public.form_pode_editar(p_dono text)
returns boolean
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select public.has_role('admin')
      or (p_dono is not null and p_dono = (select auth.uid())::text);
$$;

revoke all on function public.form_pode_editar(text) from public, anon;
grant execute on function public.form_pode_editar(text) to authenticated;

-- =====================================================================
-- PORTARIA — tabelas-pai (dono = criado_por)
-- =====================================================================

-- 1. Controle de Equipamentos de Terceiros (FRM.SGP-0011)
drop policy if exists port_controle_equipamentos_rw on public.port_controle_equipamentos;
alter table public.port_controle_equipamentos
  alter column criado_por set default (auth.uid())::text;
create policy port_controle_equipamentos_sel on public.port_controle_equipamentos
  for select to authenticated using (true);
create policy port_controle_equipamentos_ins on public.port_controle_equipamentos
  for insert to authenticated
  with check (criado_por is null or criado_por = (select auth.uid())::text or public.has_role('admin'));
create policy port_controle_equipamentos_upd on public.port_controle_equipamentos
  for update to authenticated
  using (public.form_pode_editar(criado_por))
  with check (public.form_pode_editar(criado_por));
create policy port_controle_equipamentos_del on public.port_controle_equipamentos
  for delete to authenticated
  using (public.form_pode_editar(criado_por));

-- 2. Registro de Chegada de Transportes (FRM.SGP-0009)
drop policy if exists port_registro_transportes_rw on public.port_registro_transportes;
alter table public.port_registro_transportes
  alter column criado_por set default (auth.uid())::text;
create policy port_registro_transportes_sel on public.port_registro_transportes
  for select to authenticated using (true);
create policy port_registro_transportes_ins on public.port_registro_transportes
  for insert to authenticated
  with check (criado_por is null or criado_por = (select auth.uid())::text or public.has_role('admin'));
create policy port_registro_transportes_upd on public.port_registro_transportes
  for update to authenticated
  using (public.form_pode_editar(criado_por))
  with check (public.form_pode_editar(criado_por));
create policy port_registro_transportes_del on public.port_registro_transportes
  for delete to authenticated
  using (public.form_pode_editar(criado_por));

-- 3. Controle de Carretas de Chapas (FRM.SGP-0020)
drop policy if exists port_controle_carretas_rw on public.port_controle_carretas;
alter table public.port_controle_carretas
  alter column criado_por set default (auth.uid())::text;
create policy port_controle_carretas_sel on public.port_controle_carretas
  for select to authenticated using (true);
create policy port_controle_carretas_ins on public.port_controle_carretas
  for insert to authenticated
  with check (criado_por is null or criado_por = (select auth.uid())::text or public.has_role('admin'));
create policy port_controle_carretas_upd on public.port_controle_carretas
  for update to authenticated
  using (public.form_pode_editar(criado_por))
  with check (public.form_pode_editar(criado_por));
create policy port_controle_carretas_del on public.port_controle_carretas
  for delete to authenticated
  using (public.form_pode_editar(criado_por));

-- 4. Relatório de Portaria e Ocorrências (FRM.SGP-0010) — cabeçalho
drop policy if exists port_relatorio_portaria_rw on public.port_relatorio_portaria;
alter table public.port_relatorio_portaria
  alter column criado_por set default (auth.uid())::text;
create policy port_relatorio_portaria_sel on public.port_relatorio_portaria
  for select to authenticated using (true);
create policy port_relatorio_portaria_ins on public.port_relatorio_portaria
  for insert to authenticated
  with check (criado_por is null or criado_por = (select auth.uid())::text or public.has_role('admin'));
create policy port_relatorio_portaria_upd on public.port_relatorio_portaria
  for update to authenticated
  using (public.form_pode_editar(criado_por))
  with check (public.form_pode_editar(criado_por));
create policy port_relatorio_portaria_del on public.port_relatorio_portaria
  for delete to authenticated
  using (public.form_pode_editar(criado_por));

-- 5. Briefing de Segurança & Lista de Presença (FRM.SGP-0013) — sessão
drop policy if exists port_briefing_sessoes_rw on public.port_briefing_sessoes;
alter table public.port_briefing_sessoes
  alter column criado_por set default (auth.uid())::text;
create policy port_briefing_sessoes_sel on public.port_briefing_sessoes
  for select to authenticated using (true);
create policy port_briefing_sessoes_ins on public.port_briefing_sessoes
  for insert to authenticated
  with check (criado_por is null or criado_por = (select auth.uid())::text or public.has_role('admin'));
create policy port_briefing_sessoes_upd on public.port_briefing_sessoes
  for update to authenticated
  using (public.form_pode_editar(criado_por))
  with check (public.form_pode_editar(criado_por));
create policy port_briefing_sessoes_del on public.port_briefing_sessoes
  for delete to authenticated
  using (public.form_pode_editar(criado_por));

-- 6. Passagem de Plantão da Portaria — criado_por é uuid aqui, cast p/ text
drop policy if exists port_passagem_all on public.port_passagem_plantao;
drop policy if exists port_passagem_select on public.port_passagem_plantao;
alter table public.port_passagem_plantao
  alter column criado_por set default auth.uid();
create policy port_passagem_plantao_sel on public.port_passagem_plantao
  for select to authenticated using (true);
create policy port_passagem_plantao_ins on public.port_passagem_plantao
  for insert to authenticated
  with check (criado_por is null or criado_por::text = (select auth.uid())::text or public.has_role('admin'));
create policy port_passagem_plantao_upd on public.port_passagem_plantao
  for update to authenticated
  using (public.form_pode_editar(criado_por::text))
  with check (public.form_pode_editar(criado_por::text));
create policy port_passagem_plantao_del on public.port_passagem_plantao
  for delete to authenticated
  using (public.form_pode_editar(criado_por::text));

-- =====================================================================
-- PORTARIA — tabelas-filhas (dono herdado da linha-pai)
-- =====================================================================

-- Ocorrências do relatório → dono = port_relatorio_portaria.criado_por
drop policy if exists port_relatorio_ocorrencias_rw on public.port_relatorio_ocorrencias;
create policy port_relatorio_ocorrencias_sel on public.port_relatorio_ocorrencias
  for select to authenticated using (true);
create policy port_relatorio_ocorrencias_ins on public.port_relatorio_ocorrencias
  for insert to authenticated with check (true);
create policy port_relatorio_ocorrencias_upd on public.port_relatorio_ocorrencias
  for update to authenticated
  using (public.form_pode_editar((select r.criado_por from public.port_relatorio_portaria r where r.id = relatorio_id)))
  with check (public.form_pode_editar((select r.criado_por from public.port_relatorio_portaria r where r.id = relatorio_id)));
create policy port_relatorio_ocorrencias_del on public.port_relatorio_ocorrencias
  for delete to authenticated
  using (public.form_pode_editar((select r.criado_por from public.port_relatorio_portaria r where r.id = relatorio_id)));

-- Participantes do briefing → dono = port_briefing_sessoes.criado_por
drop policy if exists port_briefing_participantes_rw on public.port_briefing_participantes;
create policy port_briefing_participantes_sel on public.port_briefing_participantes
  for select to authenticated using (true);
create policy port_briefing_participantes_ins on public.port_briefing_participantes
  for insert to authenticated with check (true);
create policy port_briefing_participantes_upd on public.port_briefing_participantes
  for update to authenticated
  using (public.form_pode_editar((select s.criado_por from public.port_briefing_sessoes s where s.id = sessao_id)))
  with check (public.form_pode_editar((select s.criado_por from public.port_briefing_sessoes s where s.id = sessao_id)));
create policy port_briefing_participantes_del on public.port_briefing_participantes
  for delete to authenticated
  using (public.form_pode_editar((select s.criado_por from public.port_briefing_sessoes s where s.id = sessao_id)));

-- =====================================================================
-- RH — ASE Hora Extra (dono = solicitante_id)
-- =====================================================================

drop policy if exists rh_ase_solicitacoes_rw on public.rh_ase_solicitacoes;
alter table public.rh_ase_solicitacoes
  alter column solicitante_id set default (auth.uid())::text;
create policy rh_ase_solicitacoes_sel on public.rh_ase_solicitacoes
  for select to authenticated using (true);
create policy rh_ase_solicitacoes_ins on public.rh_ase_solicitacoes
  for insert to authenticated
  with check (solicitante_id is null or solicitante_id = (select auth.uid())::text or public.has_role('admin'));
create policy rh_ase_solicitacoes_upd on public.rh_ase_solicitacoes
  for update to authenticated
  using (public.form_pode_editar(solicitante_id))
  with check (public.form_pode_editar(solicitante_id));
create policy rh_ase_solicitacoes_del on public.rh_ase_solicitacoes
  for delete to authenticated
  using (public.form_pode_editar(solicitante_id));

-- Itens da ASE → dono = rh_ase_solicitacoes.solicitante_id
drop policy if exists rh_ase_itens_rw on public.rh_ase_itens;
create policy rh_ase_itens_sel on public.rh_ase_itens
  for select to authenticated using (true);
create policy rh_ase_itens_ins on public.rh_ase_itens
  for insert to authenticated with check (true);
create policy rh_ase_itens_upd on public.rh_ase_itens
  for update to authenticated
  using (public.form_pode_editar((select s.solicitante_id from public.rh_ase_solicitacoes s where s.id = solicitacao_id)))
  with check (public.form_pode_editar((select s.solicitante_id from public.rh_ase_solicitacoes s where s.id = solicitacao_id)));
create policy rh_ase_itens_del on public.rh_ase_itens
  for delete to authenticated
  using (public.form_pode_editar((select s.solicitante_id from public.rh_ase_solicitacoes s where s.id = solicitacao_id)));

-- =====================================================================
-- EXPEDIÇÃO — Carregamento de Tramos (dono = criado_por)
-- =====================================================================

drop policy if exists expedicao_carregamentos_rw on public.expedicao_carregamentos;
create policy expedicao_carregamentos_sel on public.expedicao_carregamentos
  for select to authenticated using (true);
create policy expedicao_carregamentos_ins on public.expedicao_carregamentos
  for insert to authenticated
  with check (criado_por = (select auth.uid())::text or public.has_role('admin'));
create policy expedicao_carregamentos_upd on public.expedicao_carregamentos
  for update to authenticated
  using (public.form_pode_editar(criado_por))
  with check (public.form_pode_editar(criado_por));
create policy expedicao_carregamentos_del on public.expedicao_carregamentos
  for delete to authenticated
  using (public.form_pode_editar(criado_por));

-- Tramos → dono = expedicao_carregamentos.criado_por
drop policy if exists expedicao_tramos_rw on public.expedicao_tramos;
create policy expedicao_tramos_sel on public.expedicao_tramos
  for select to authenticated using (true);
create policy expedicao_tramos_ins on public.expedicao_tramos
  for insert to authenticated with check (true);
create policy expedicao_tramos_upd on public.expedicao_tramos
  for update to authenticated
  using (public.form_pode_editar((select c.criado_por from public.expedicao_carregamentos c where c.id = carregamento_id)))
  with check (public.form_pode_editar((select c.criado_por from public.expedicao_carregamentos c where c.id = carregamento_id)));
create policy expedicao_tramos_del on public.expedicao_tramos
  for delete to authenticated
  using (public.form_pode_editar((select c.criado_por from public.expedicao_carregamentos c where c.id = carregamento_id)));

-- Fotos → dono = expedicao_carregamentos.criado_por
drop policy if exists expedicao_fotos_rw on public.expedicao_fotos;
create policy expedicao_fotos_sel on public.expedicao_fotos
  for select to authenticated using (true);
create policy expedicao_fotos_ins on public.expedicao_fotos
  for insert to authenticated with check (true);
create policy expedicao_fotos_upd on public.expedicao_fotos
  for update to authenticated
  using (public.form_pode_editar((select c.criado_por from public.expedicao_carregamentos c where c.id = carregamento_id)))
  with check (public.form_pode_editar((select c.criado_por from public.expedicao_carregamentos c where c.id = carregamento_id)));
create policy expedicao_fotos_del on public.expedicao_fotos
  for delete to authenticated
  using (public.form_pode_editar((select c.criado_por from public.expedicao_carregamentos c where c.id = carregamento_id)));
