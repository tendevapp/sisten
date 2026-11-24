-- Requisição no Balcão: editar e excluir requisições de outras pessoas.
--
-- Antes só o autor ou o admin (`form_pode_editar`) mexia numa requisição já
-- confirmada. Agora também quem tem a flag `almox_requisicao_balcao_editar_todas`
-- em `page_access` — liberada pessoa a pessoa na Gestão de Acessos (sem role
-- padrão). Pedido de 24/11/2026: liberar para o Ayron (Almoxarifado).
--
-- A pendente de confirmação continua editável por qualquer um, como antes.

do $$
declare
  v_def text;
  v_ant text;
begin
  v_def := pg_get_functiondef('public.alm_req_balcao_salvar(uuid,jsonb,jsonb)'::regprocedure);
  v_ant := v_def;
  v_def := replace(v_def,
    'not public.form_pode_editar(v_old.criado_por_id::text)',
    'not (public.form_pode_editar(v_old.criado_por_id::text) or public.has_page_access(''almox_requisicao_balcao_editar_todas''))');
  if v_def = v_ant then raise exception 'alm_req_balcao_salvar: trecho não encontrado'; end if;
  execute v_def;

  v_def := pg_get_functiondef('public.alm_req_balcao_excluir(uuid,text,text)'::regprocedure);
  v_ant := v_def;
  v_def := replace(v_def,
    'not public.form_pode_editar(v_r.criado_por_id::text)',
    'not (public.form_pode_editar(v_r.criado_por_id::text) or public.has_page_access(''almox_requisicao_balcao_editar_todas''))');
  if v_def = v_ant then raise exception 'alm_req_balcao_excluir: trecho não encontrado'; end if;
  execute v_def;
end $$;

-- Liberação do Ayron (AYRON CLEBER ANGELINO MEDINA, Almoxarifado).
update public.core_perfis
   set page_access = coalesce(page_access, '{}'::jsonb) || jsonb_build_object('almox_requisicao_balcao_editar_todas', true)
 where id = '2b47ee93-55c7-4983-ad36-b8c550113d95';
