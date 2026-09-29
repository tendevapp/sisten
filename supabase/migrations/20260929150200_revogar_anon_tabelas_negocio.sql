-- Tira o acesso sem login (anon / PUBLIC) de tabelas de negócio.
--
-- A chave anon vai dentro do bundle do site: qualquer pessoa na internet lia,
-- gravava e apagava estas tabelas via /rest/v1/<tabela>. O app inteiro exige
-- sessão, então as policies passam a valer só para `authenticated`, com a
-- mesma semântica de hoje (using true). Restringir a escrita por perfil é a
-- fase 2 e depende de alinhar com os `defaultRoles` de pages.ts.

-- ---------------------------------------------------------------------------
-- sup_fretes: policies sem `TO` (= PUBLIC)
-- ---------------------------------------------------------------------------
drop policy if exists "Permitir leitura total para tabela_frete" on public.sup_fretes;
drop policy if exists "Permitir inserção total para tabela_frete" on public.sup_fretes;
drop policy if exists "Permitir atualização total para tabela_frete" on public.sup_fretes;
drop policy if exists "Permitir exclusão total para tabela_frete" on public.sup_fretes;

create policy "sup_fretes_read" on public.sup_fretes
  for select to authenticated using (true);
create policy "sup_fretes_insert" on public.sup_fretes
  for insert to authenticated with check (true);
create policy "sup_fretes_update" on public.sup_fretes
  for update to authenticated using (true) with check (true);
create policy "sup_fretes_delete" on public.sup_fretes
  for delete to authenticated using (true);

-- ---------------------------------------------------------------------------
-- sap_mb51_mov
-- ---------------------------------------------------------------------------
drop policy if exists "mb51_mov_estoque_read" on public.sap_mb51_mov;
drop policy if exists "mb51_mov_estoque_insert" on public.sap_mb51_mov;
drop policy if exists "mb51_mov_estoque_update" on public.sap_mb51_mov;
drop policy if exists "mb51_mov_estoque_delete" on public.sap_mb51_mov;

create policy "mb51_mov_estoque_read" on public.sap_mb51_mov
  for select to authenticated using (true);
create policy "mb51_mov_estoque_insert" on public.sap_mb51_mov
  for insert to authenticated with check (true);
create policy "mb51_mov_estoque_update" on public.sap_mb51_mov
  for update to authenticated using (true) with check (true);
create policy "mb51_mov_estoque_delete" on public.sap_mb51_mov
  for delete to authenticated using (true);

-- ---------------------------------------------------------------------------
-- sup_bahiasul_entregas
-- ---------------------------------------------------------------------------
drop policy if exists "sup_bahiasul_entregas_read" on public.sup_bahiasul_entregas;
drop policy if exists "sup_bahiasul_entregas_insert" on public.sup_bahiasul_entregas;
drop policy if exists "sup_bahiasul_entregas_update" on public.sup_bahiasul_entregas;
drop policy if exists "sup_bahiasul_entregas_delete" on public.sup_bahiasul_entregas;

create policy "sup_bahiasul_entregas_read" on public.sup_bahiasul_entregas
  for select to authenticated using (true);
create policy "sup_bahiasul_entregas_insert" on public.sup_bahiasul_entregas
  for insert to authenticated with check (true);
create policy "sup_bahiasul_entregas_update" on public.sup_bahiasul_entregas
  for update to authenticated using (true) with check (true);
create policy "sup_bahiasul_entregas_delete" on public.sup_bahiasul_entregas
  for delete to authenticated using (true);

-- ---------------------------------------------------------------------------
-- sup_transportadoras
-- ---------------------------------------------------------------------------
drop policy if exists "sup_transportadoras_read" on public.sup_transportadoras;
drop policy if exists "sup_transportadoras_insert" on public.sup_transportadoras;
drop policy if exists "sup_transportadoras_update" on public.sup_transportadoras;
drop policy if exists "sup_transportadoras_delete" on public.sup_transportadoras;

create policy "sup_transportadoras_read" on public.sup_transportadoras
  for select to authenticated using (true);
create policy "sup_transportadoras_insert" on public.sup_transportadoras
  for insert to authenticated with check (true);
create policy "sup_transportadoras_update" on public.sup_transportadoras
  for update to authenticated using (true) with check (true);
create policy "sup_transportadoras_delete" on public.sup_transportadoras
  for delete to authenticated using (true);

-- ---------------------------------------------------------------------------
-- sup_prazos_transporte
-- ---------------------------------------------------------------------------
drop policy if exists "sup_prazos_transporte_read" on public.sup_prazos_transporte;
drop policy if exists "sup_prazos_transporte_insert" on public.sup_prazos_transporte;
drop policy if exists "sup_prazos_transporte_update" on public.sup_prazos_transporte;
drop policy if exists "sup_prazos_transporte_delete" on public.sup_prazos_transporte;

create policy "sup_prazos_transporte_read" on public.sup_prazos_transporte
  for select to authenticated using (true);
create policy "sup_prazos_transporte_insert" on public.sup_prazos_transporte
  for insert to authenticated with check (true);
create policy "sup_prazos_transporte_update" on public.sup_prazos_transporte
  for update to authenticated using (true) with check (true);
create policy "sup_prazos_transporte_delete" on public.sup_prazos_transporte
  for delete to authenticated using (true);

-- ---------------------------------------------------------------------------
-- sup_diligenciamento_itens
-- ---------------------------------------------------------------------------
drop policy if exists "sup_diligenciamento_itens_read" on public.sup_diligenciamento_itens;
drop policy if exists "sup_diligenciamento_itens_insert" on public.sup_diligenciamento_itens;
drop policy if exists "sup_diligenciamento_itens_update" on public.sup_diligenciamento_itens;
drop policy if exists "sup_diligenciamento_itens_delete" on public.sup_diligenciamento_itens;

create policy "sup_diligenciamento_itens_read" on public.sup_diligenciamento_itens
  for select to authenticated using (true);
create policy "sup_diligenciamento_itens_insert" on public.sup_diligenciamento_itens
  for insert to authenticated with check (true);
create policy "sup_diligenciamento_itens_update" on public.sup_diligenciamento_itens
  for update to authenticated using (true) with check (true);
create policy "sup_diligenciamento_itens_delete" on public.sup_diligenciamento_itens
  for delete to authenticated using (true);

-- ---------------------------------------------------------------------------
-- fac_servicos (FOR ALL to anon, authenticated)
-- ---------------------------------------------------------------------------
drop policy if exists "fac_servicos_all" on public.fac_servicos;
create policy "fac_servicos_all" on public.fac_servicos
  for all to authenticated using (true) with check (true);

-- ---------------------------------------------------------------------------
-- cadastro_grupo_mercadoria: a policy de anon é redundante — `_read` e
-- `_write` já cobrem authenticated.
-- ---------------------------------------------------------------------------
drop policy if exists "cadastro_grupo_mercadoria_write_anon" on public.cadastro_grupo_mercadoria;

-- ---------------------------------------------------------------------------
-- sup_ddp / sup_impostos: `_all` já cobre authenticated; só some a leitura anon.
-- ---------------------------------------------------------------------------
drop policy if exists "ddp_read_policy" on public.sup_ddp;
create policy "ddp_read_policy" on public.sup_ddp
  for select to authenticated using (true);

drop policy if exists "impostos_read_policy" on public.sup_impostos;
create policy "impostos_read_policy" on public.sup_impostos
  for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- Grants: anon não precisa tocar nestas tabelas.
-- ---------------------------------------------------------------------------
revoke all on table
  public.sup_fretes,
  public.sap_mb51_mov,
  public.sup_bahiasul_entregas,
  public.sup_transportadoras,
  public.sup_prazos_transporte,
  public.sup_diligenciamento_itens,
  public.fac_servicos,
  public.cadastro_grupo_mercadoria,
  public.sup_ddp,
  public.sup_impostos
from anon;

-- Objetos novos no schema public deixam de nascer com grant para anon.
-- (O dump inicial concede ALL a anon por padrão; cada módulo novo precisava
-- lembrar de revogar.) Não altera o que já existe.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on functions from anon;
