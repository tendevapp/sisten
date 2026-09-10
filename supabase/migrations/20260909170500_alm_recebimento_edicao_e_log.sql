-- =====================================================================
-- Recebimento — edição pelo autor + log de alterações.
--
-- Regra (igual aos demais formulários, `form_pode_editar`): **só quem
-- abriu o registro, ou um admin, edita**. Exclusão continua sendo lógica
-- (`excluido_em`) — some do front, permanece no banco.
--
--   - RLS por tabela: SELECT livre; INSERT/UPDATE/DELETE só autor/admin
--     em `alm_receb_cargas` e `alm_receb_conferencias` (e nos itens, dono
--     herdado da conferência). `alm_receb_nc` fica aberta: a tratativa da
--     não conformidade é de quem trata, não de quem abriu a conferência.
--   - `alm_receb_alteracoes`: uma linha por edição, com o diff campo a
--     campo. Escrita só pelas RPCs `alm_receb_editar_*` (security definer).
-- =====================================================================

-- 0) Helper `form_pode_editar` — dono bate com o logado, ou é admin.
--    Idêntico ao de `20260902160000_formularios_rls_autor_ou_admin.sql`
--    (que ainda não foi aplicado neste banco); `create or replace` deixa
--    as duas migrations conviverem.
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

-- 1) Log de alterações -------------------------------------------------------
create table if not exists public.alm_receb_alteracoes (
  id uuid primary key default gen_random_uuid(),
  entidade text not null check (entidade in ('carga','conferencia')),
  entidade_id uuid not null,
  codigo text,
  -- [{campo, de, para}]
  alteracoes jsonb not null default '[]'::jsonb,
  resumo text,
  alterado_por_id uuid,
  alterado_por_nome text,
  created_at timestamptz not null default now()
);
create index if not exists idx_alm_receb_alteracoes_ent
  on public.alm_receb_alteracoes (entidade, entidade_id, created_at desc);

grant select on public.alm_receb_alteracoes to authenticated;
grant all on public.alm_receb_alteracoes to service_role;
alter table public.alm_receb_alteracoes enable row level security;
drop policy if exists alm_receb_alteracoes_sel on public.alm_receb_alteracoes;
create policy alm_receb_alteracoes_sel on public.alm_receb_alteracoes
  for select to authenticated using (true);
-- Sem policy de INSERT: só as RPCs security definer (dona = postgres) gravam.

-- 2) RLS autor-ou-admin nas tabelas de formulário --------------------------
alter table public.alm_receb_cargas alter column criado_por_id set default auth.uid();
alter table public.alm_receb_conferencias alter column criado_por_id set default auth.uid();

drop policy if exists "alm_receb_cargas_all" on public.alm_receb_cargas;
create policy alm_receb_cargas_sel on public.alm_receb_cargas
  for select to authenticated using (true);
create policy alm_receb_cargas_ins on public.alm_receb_cargas
  for insert to authenticated
  with check (criado_por_id is null or criado_por_id = (select auth.uid()) or public.has_role('admin'));
create policy alm_receb_cargas_upd on public.alm_receb_cargas
  for update to authenticated
  using (public.form_pode_editar(criado_por_id::text))
  with check (public.form_pode_editar(criado_por_id::text));
create policy alm_receb_cargas_del on public.alm_receb_cargas
  for delete to authenticated
  using (public.form_pode_editar(criado_por_id::text));

drop policy if exists "alm_receb_conferencias_all" on public.alm_receb_conferencias;
create policy alm_receb_conferencias_sel on public.alm_receb_conferencias
  for select to authenticated using (true);
create policy alm_receb_conferencias_ins on public.alm_receb_conferencias
  for insert to authenticated
  with check (criado_por_id is null or criado_por_id = (select auth.uid()) or public.has_role('admin'));
create policy alm_receb_conferencias_upd on public.alm_receb_conferencias
  for update to authenticated
  using (public.form_pode_editar(criado_por_id::text))
  with check (public.form_pode_editar(criado_por_id::text));
create policy alm_receb_conferencias_del on public.alm_receb_conferencias
  for delete to authenticated
  using (public.form_pode_editar(criado_por_id::text));

-- Itens — dono herdado da conferência.
drop policy if exists "alm_receb_conferencia_itens_all" on public.alm_receb_conferencia_itens;
create policy alm_receb_conf_itens_sel on public.alm_receb_conferencia_itens
  for select to authenticated using (true);
create policy alm_receb_conf_itens_wr on public.alm_receb_conferencia_itens
  for all to authenticated
  using (exists (
    select 1 from public.alm_receb_conferencias c
    where c.id = conferencia_id and public.form_pode_editar(c.criado_por_id::text)))
  with check (exists (
    select 1 from public.alm_receb_conferencias c
    where c.id = conferencia_id and public.form_pode_editar(c.criado_por_id::text)));

-- NC — fica aberta (tratativa é de terceiros), mas RLS ligada.
drop policy if exists "alm_receb_nc_all" on public.alm_receb_nc;
create policy alm_receb_nc_all on public.alm_receb_nc
  for all to authenticated using (true) with check (true);

-- 3) RPC — editar ficha cega ---------------------------------------------------
create or replace function public.alm_receb_editar_carga(
  p_id uuid, p_patch jsonb, p_user jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old public.alm_receb_cargas;
  v_alt jsonb := '[]'::jsonb;
  v_contada int;
  v_declarada int;
  v_avaria boolean;
  v_diverg boolean;
  v_campos text[] := array['data','hora','transportadora','veiculo_placa','motorista','doc_transporte',
                           'nota_fiscal','nro_pedido','qtd_volumes_declarada','qtd_volumes_contada',
                           'tipo_embalagem','lacre_integro','avaria_aparente','avaria_descricao',
                           'peso_declarado','destino_previsto','observacao'];
  k text;
  v_de text;
  v_para text;
  v_fotos_old int;
  v_fotos_new int;
begin
  select * into v_old from public.alm_receb_cargas where id = p_id and not excluido;
  if not found then raise exception 'Ficha cega nao encontrada.'; end if;
  if not public.form_pode_editar(v_old.criado_por_id::text) then
    raise exception 'So o autor do registro ou um admin pode editar.';
  end if;

  foreach k in array v_campos loop
    if p_patch ? k then
      v_de := (to_jsonb(v_old) ->> k);
      v_para := (p_patch ->> k);
      if coalesce(v_de,'') is distinct from coalesce(v_para,'') then
        v_alt := v_alt || jsonb_build_object('campo', k, 'de', v_de, 'para', v_para);
      end if;
    end if;
  end loop;

  if p_patch ? 'evidencias' then
    v_fotos_old := coalesce(jsonb_array_length(v_old.evidencias), 0);
    v_fotos_new := coalesce(jsonb_array_length(p_patch->'evidencias'), 0);
    if v_fotos_old <> v_fotos_new then
      v_alt := v_alt || jsonb_build_object('campo','evidencias','de', v_fotos_old||' foto(s)','para', v_fotos_new||' foto(s)');
    end if;
  end if;

  v_contada := coalesce(nullif(p_patch->>'qtd_volumes_contada','')::int, v_old.qtd_volumes_contada);
  v_declarada := case when p_patch ? 'qtd_volumes_declarada'
                      then nullif(p_patch->>'qtd_volumes_declarada','')::int
                      else v_old.qtd_volumes_declarada end;
  v_avaria := coalesce((p_patch->>'avaria_aparente')::boolean, v_old.avaria_aparente);
  v_diverg := v_avaria or (v_declarada is not null and v_declarada <> v_contada);

  update public.alm_receb_cargas set
    data = coalesce((p_patch->>'data')::date, data),
    hora = case when p_patch ? 'hora' then nullif(p_patch->>'hora','')::time else hora end,
    transportadora = coalesce(nullif(p_patch->>'transportadora',''), transportadora),
    veiculo_placa = case when p_patch ? 'veiculo_placa' then nullif(p_patch->>'veiculo_placa','') else veiculo_placa end,
    motorista = case when p_patch ? 'motorista' then nullif(p_patch->>'motorista','') else motorista end,
    doc_transporte = case when p_patch ? 'doc_transporte' then nullif(p_patch->>'doc_transporte','') else doc_transporte end,
    nota_fiscal = case when p_patch ? 'nota_fiscal' then nullif(p_patch->>'nota_fiscal','') else nota_fiscal end,
    nro_pedido = case when p_patch ? 'nro_pedido' then nullif(p_patch->>'nro_pedido','') else nro_pedido end,
    qtd_volumes_declarada = v_declarada,
    qtd_volumes_contada = v_contada,
    tipo_embalagem = case when p_patch ? 'tipo_embalagem' then nullif(p_patch->>'tipo_embalagem','') else tipo_embalagem end,
    lacre_integro = case when p_patch ? 'lacre_integro' then (p_patch->>'lacre_integro')::boolean else lacre_integro end,
    avaria_aparente = v_avaria,
    avaria_descricao = case when p_patch ? 'avaria_descricao' then nullif(p_patch->>'avaria_descricao','') else avaria_descricao end,
    peso_declarado = case when p_patch ? 'peso_declarado' then nullif(p_patch->>'peso_declarado','')::numeric else peso_declarado end,
    destino_previsto = coalesce(nullif(p_patch->>'destino_previsto',''), destino_previsto),
    observacao = case when p_patch ? 'observacao' then nullif(p_patch->>'observacao','') else observacao end,
    evidencias = coalesce(p_patch->'evidencias', evidencias),
    divergencia = v_diverg,
    status = case when status = 'conferida' then status
                  when v_diverg then 'divergente' else 'recebida' end
  where id = p_id;

  if jsonb_array_length(v_alt) > 0 then
    insert into public.alm_receb_alteracoes
      (entidade, entidade_id, codigo, alteracoes, resumo, alterado_por_id, alterado_por_nome)
    values ('carga', p_id, v_old.codigo, v_alt,
            jsonb_array_length(v_alt) || ' campo(s) alterado(s)',
            nullif(p_user->>'id','')::uuid, p_user->>'nome');
  end if;

  return jsonb_build_object('id', p_id, 'codigo', v_old.codigo, 'alteracoes', jsonb_array_length(v_alt));
end;
$$;

-- 4) RPC — editar conferência (cabeçalho + recontagem de itens) --------------
create or replace function public.alm_receb_editar_conferencia(
  p_id uuid, p_cab jsonb, p_itens jsonb default null, p_user jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old public.alm_receb_conferencias;
  v_alt jsonb := '[]'::jsonb;
  v_total int;
  v_ok int;
  v_div int;
  v_tem_nc boolean;
  v_campos text[] := array['nro_pedido','fornecedor','rm','deposito','observacao','tipo_item'];
  k text;
  v_nc_codigo text;
  v_nc_existe boolean;
begin
  select * into v_old from public.alm_receb_conferencias where id = p_id and not excluido;
  if not found then raise exception 'Conferencia nao encontrada.'; end if;
  if not public.form_pode_editar(v_old.criado_por_id::text) then
    raise exception 'So o autor do registro ou um admin pode editar.';
  end if;

  foreach k in array v_campos loop
    if p_cab ? k then
      if coalesce((to_jsonb(v_old) ->> k),'') is distinct from coalesce((p_cab ->> k),'') then
        v_alt := v_alt || jsonb_build_object('campo', k, 'de', to_jsonb(v_old) ->> k, 'para', p_cab ->> k);
      end if;
    end if;
  end loop;

  if p_itens is not null then
    select count(*),
           count(*) filter (where coalesce((x->>'conferido')::boolean,false) and not coalesce((x->>'divergencia')::boolean,false)),
           count(*) filter (where coalesce((x->>'divergencia')::boolean,false))
      into v_total, v_ok, v_div
    from jsonb_array_elements(p_itens) x;

    delete from public.alm_receb_conferencia_itens where conferencia_id = p_id;
    insert into public.alm_receb_conferencia_itens
      (conferencia_id, linha_ref, material_code, descricao, unidade, qtd_pedido, qtd_ja_fornecida,
       qtd_recebida, conferido, divergencia, tipo_divergencia, item_manual, observacao, evidencias)
    select
      p_id, nullif(x->>'linha_ref',''), nullif(x->>'material_code',''), nullif(x->>'descricao',''),
      nullif(x->>'unidade',''), nullif(x->>'qtd_pedido','')::numeric, nullif(x->>'qtd_ja_fornecida','')::numeric,
      coalesce((x->>'qtd_recebida')::numeric, 0), coalesce((x->>'conferido')::boolean, false),
      coalesce((x->>'divergencia')::boolean, false), nullif(x->>'tipo_divergencia',''),
      coalesce((x->>'item_manual')::boolean, false), nullif(x->>'observacao',''),
      coalesce(x->'evidencias', '[]'::jsonb)
    from jsonb_array_elements(p_itens) x;

    v_tem_nc := v_div > 0;
    if v_old.total_itens <> v_total or v_old.itens_divergentes <> v_div then
      v_alt := v_alt || jsonb_build_object(
        'campo','itens',
        'de', v_old.total_itens || ' itens / ' || v_old.itens_divergentes || ' diverg.',
        'para', v_total || ' itens / ' || v_div || ' diverg.');
    end if;
  else
    v_total := v_old.total_itens; v_ok := v_old.itens_ok;
    v_div := v_old.itens_divergentes; v_tem_nc := v_old.tem_nc;
  end if;

  update public.alm_receb_conferencias set
    nro_pedido = case when p_cab ? 'nro_pedido' then nullif(p_cab->>'nro_pedido','') else nro_pedido end,
    fornecedor = case when p_cab ? 'fornecedor' then nullif(p_cab->>'fornecedor','') else fornecedor end,
    rm = case when p_cab ? 'rm' then nullif(p_cab->>'rm','') else rm end,
    deposito = case when p_cab ? 'deposito' then nullif(p_cab->>'deposito','') else deposito end,
    observacao = case when p_cab ? 'observacao' then nullif(p_cab->>'observacao','') else observacao end,
    carga_id = case when p_cab ? 'carga_id' then nullif(p_cab->>'carga_id','')::uuid else carga_id end,
    tipo_item = coalesce(nullif(p_cab->>'tipo_item',''), tipo_item),
    evidencias = coalesce(p_cab->'evidencias', evidencias),
    total_itens = v_total, itens_ok = v_ok, itens_divergentes = v_div, tem_nc = v_tem_nc
  where id = p_id;

  if v_tem_nc then
    select exists(select 1 from public.alm_receb_nc where conferencia_id = p_id and not excluido) into v_nc_existe;
    if not v_nc_existe then
      v_nc_codigo := public.alm_receb_proximo_codigo('NCR', coalesce(v_old.data, current_date), 'alm_receb_nc');
      insert into public.alm_receb_nc
        (codigo, conferencia_id, carga_id, nro_pedido, fornecedor, tipo, severidade,
         descricao, itens_resumo, status, criado_por_id, criado_por_nome)
      values
        (v_nc_codigo, p_id, v_old.carga_id,
         coalesce(nullif(p_cab->>'nro_pedido',''), v_old.nro_pedido),
         coalesce(nullif(p_cab->>'fornecedor',''), v_old.fornecedor),
         'outros', 'media', 'Divergencia detectada na edicao da conferencia.',
         coalesce((select jsonb_agg(jsonb_build_object(
             'material_code', x->>'material_code', 'descricao', x->>'descricao',
             'qtd_pedido', x->>'qtd_pedido', 'qtd_recebida', x->>'qtd_recebida',
             'tipo_divergencia', x->>'tipo_divergencia'))
           from jsonb_array_elements(coalesce(p_itens,'[]'::jsonb)) x
           where coalesce((x->>'divergencia')::boolean, false)), '[]'::jsonb),
         'aberta', nullif(p_user->>'id','')::uuid, p_user->>'nome');
    end if;
  end if;

  if jsonb_array_length(v_alt) > 0 then
    insert into public.alm_receb_alteracoes
      (entidade, entidade_id, codigo, alteracoes, resumo, alterado_por_id, alterado_por_nome)
    values ('conferencia', p_id, v_old.codigo, v_alt,
            jsonb_array_length(v_alt) || ' alteracao(oes)',
            nullif(p_user->>'id','')::uuid, p_user->>'nome');
  end if;

  return jsonb_build_object('id', p_id, 'codigo', v_old.codigo,
                            'nc_codigo', v_nc_codigo, 'tem_nc', v_tem_nc,
                            'alteracoes', jsonb_array_length(v_alt));
end;
$$;

revoke all on function public.alm_receb_editar_carga(uuid, jsonb, jsonb) from public, anon;
revoke all on function public.alm_receb_editar_conferencia(uuid, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.alm_receb_editar_carga(uuid, jsonb, jsonb) to authenticated, service_role;
grant execute on function public.alm_receb_editar_conferencia(uuid, jsonb, jsonb, jsonb) to authenticated, service_role;
