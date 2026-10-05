-- Pendências de Recebimento — decisão "Abrir RNC e verificar com o fornecedor"
-- e abertura automática da RNC (NCR do formulário de Recebimento do Almoxarifado).
--
-- Quando o comprador responde com uma destas decisões:
--   · abrir_rnc       — Abrir RNC e verificar com o fornecedor (nova; vale para todo motivo)
--   · devolver        — Recusar e devolver ao fornecedor
--   · devolver_repor  — Devolver ao fornecedor para reposição
-- a NCR é aberta sozinha em `alm_receb_nc`, sem o almoxarifado digitar nada:
--   · a conferência já tem NCR (divergência) → reaproveita, só registra a tratativa;
--   · não tem (ex.: entrega parcial sem divergência) → cria 1 NCR por conferência,
--     'em_tratativa', com os itens e as fotos da pendência. Os demais itens da
--     mesma conferência decididos depois caem na mesma NCR.
-- A pendência guarda nc_id/nc_codigo da NCR aberta.
--
-- "Abrir RNC" não fecha a NCR quando o almoxarifado confirma a execução: a
-- verificação com o fornecedor continua na NCR (Recebimento > Não conformidades).
-- Nas devoluções o comportamento antigo fica: NCR resolvida quando tudo fecha.
--
-- Catálogo espelhado em src/lib/pendenciasRecebimento.ts (o teste lê esta migration).

-- ---------------------------------------------------------------------------
-- Catálogo
-- ---------------------------------------------------------------------------

do $$
declare
  v_nome text;
begin
  for v_nome in
    select conname from pg_constraint
     where conrelid = 'public.sup_pend_recebimento'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) like '%receber_parcial_aguardar%'
  loop
    execute format('alter table public.sup_pend_recebimento drop constraint %I', v_nome);
  end loop;
end $$;

alter table public.sup_pend_recebimento
  add constraint sup_pend_recebimento_decisao_check check (decisao in (
    'receber_parcial_aguardar', 'receber_parcial_encerrar', 'assumir_nc', 'aceitar_excedente',
    'aceitar_substituto', 'vincular_po', 'devolver_repor', 'devolver', 'abrir_rnc', 'outro'));

create or replace function public.sup_receb_decisoes_validas(p_motivo text)
returns text[] language sql immutable set search_path = public, pg_temp as $$
  select case p_motivo
    when 'parcial'         then array['receber_parcial_aguardar', 'receber_parcial_encerrar', 'devolver', 'abrir_rnc', 'outro']
    when 'falta'           then array['receber_parcial_aguardar', 'receber_parcial_encerrar', 'devolver', 'abrir_rnc', 'outro']
    when 'avaria'          then array['assumir_nc', 'devolver_repor', 'devolver', 'abrir_rnc', 'outro']
    when 'excedente'       then array['aceitar_excedente', 'devolver', 'abrir_rnc', 'outro']
    when 'material_errado' then array['devolver_repor', 'aceitar_substituto', 'devolver', 'abrir_rnc', 'outro']
    when 'sem_pedido'      then array['vincular_po', 'devolver', 'abrir_rnc', 'outro']
    else                        array['assumir_nc', 'devolver_repor', 'devolver', 'abrir_rnc', 'outro']
  end
$$;

create or replace function public.sup_receb_decisao_abre_rnc(p_decisao text)
returns boolean language sql immutable set search_path = public, pg_temp as $$
  select coalesce(p_decisao in ('abrir_rnc', 'devolver', 'devolver_repor'), false)
$$;

create or replace function public.sup_receb_rotulo_decisao(p_decisao text, p_motivo text)
returns text language sql immutable set search_path = public, pg_temp as $$
  select case p_decisao
    when 'receber_parcial_aguardar' then 'Receber o parcial — o saldo segue aberto no PO'
    when 'receber_parcial_encerrar' then 'Receber o parcial e encerrar o saldo do PO'
    when 'assumir_nc' then 'Assumir a NC — receber como está'
    when 'aceitar_excedente' then 'Receber o excedente — Suprimentos ajusta o PO'
    when 'aceitar_substituto' then 'Aceitar o material entregue como substituto'
    when 'vincular_po' then 'Receber vinculando a outro PO'
    when 'devolver_repor' then 'Devolver ao fornecedor para reposição'
    when 'devolver' then case when p_motivo = 'excedente' then 'Devolver o excedente ao fornecedor'
                              else 'Recusar e devolver ao fornecedor' end
    when 'abrir_rnc' then 'Abrir RNC e verificar com o fornecedor'
    when 'outro' then 'Outra tratativa'
    else coalesce(p_decisao, '')
  end
$$;

-- ---------------------------------------------------------------------------
-- Abertura da NCR
-- ---------------------------------------------------------------------------

-- Devolve a NCR da pendência: a que já existe (da pendência ou da conferência)
-- ou uma nova. Interna — só as RPCs de decisão chamam.
create or replace function public.sup_receb_pend_garantir_ncr(
  p_pend_id uuid, p_uid uuid, p_nome text,
  out nc_id uuid, out nc_codigo text, out criada boolean)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_pend public.sup_pend_recebimento;
  v_conf public.alm_receb_conferencias;
  v_nc public.alm_receb_nc;
  v_tipo text;
  v_descricao text;
  v_codigo text;
  v_id uuid;
  v_tentativa int;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  criada := false;
  select * into v_pend from public.sup_pend_recebimento where id = p_pend_id;
  if not found then return; end if;

  if v_pend.nc_id is not null then
    select * into v_nc from public.alm_receb_nc where id = v_pend.nc_id and not excluido;
  end if;
  if v_nc.id is null and v_pend.conferencia_id is not null then
    select * into v_nc from public.alm_receb_nc
     where conferencia_id = v_pend.conferencia_id and not excluido
     order by created_at limit 1;
  end if;

  if v_nc.id is not null then
    -- NCR já resolvida volta para tratativa: há uma nova ação de Suprimentos
    if v_nc.status = 'resolvida' then
      update public.alm_receb_nc set status = 'em_tratativa', resolvida_em = null where id = v_nc.id;
    end if;
    nc_id := v_nc.id; nc_codigo := v_nc.codigo;
    return;
  end if;

  -- NCR de conferência só nasce ligada a ela (sem conferência, o sincronizador
  -- trataria como NCR avulsa e criaria outra pendência).
  if v_pend.conferencia_id is null then return; end if;
  select * into v_conf from public.alm_receb_conferencias where id = v_pend.conferencia_id;

  v_tipo := case when v_pend.motivo = 'parcial' then 'falta'
                 when v_pend.motivo in ('falta', 'excedente', 'avaria', 'material_errado', 'sem_pedido') then v_pend.motivo
                 else 'outros' end;
  v_descricao := 'RNC aberta por Suprimentos a partir da pendência ' || v_pend.codigo
    || coalesce(' (PO ' || v_pend.nro_pedido || ')', '') || ': '
    || public.sup_receb_rotulo_motivo(v_pend.motivo) || ' — '
    || coalesce(v_pend.material_code || ' · ', '') || coalesce(v_pend.descricao, 'item sem descrição')
    || case when v_pend.qtd_pedido is not null
            then '. Pedido ' || v_pend.qtd_pedido || ', recebido ' || coalesce(v_pend.qtd_recebida::text, '—')
                 || coalesce(' ' || v_pend.unidade, '')
            else '' end
    || coalesce('. Observação do almoxarifado: ' || nullif(btrim(v_pend.observacao_almox), ''), '');

  for v_tentativa in 1..5 loop
    v_codigo := public.alm_receb_proximo_codigo('NCR', v_hoje, 'alm_receb_nc');
    begin
      insert into public.alm_receb_nc (
        codigo, conferencia_id, carga_id, nro_pedido, fornecedor, tipo, severidade, descricao,
        itens_resumo, evidencias, status, criado_por_id, criado_por_nome
      ) values (
        v_codigo, v_pend.conferencia_id, coalesce(v_conf.carga_id, v_pend.carga_id),
        coalesce(v_conf.nro_pedido, v_pend.nro_pedido), coalesce(v_conf.fornecedor, v_pend.fornecedor),
        v_tipo, 'media', v_descricao,
        jsonb_build_array(jsonb_build_object(
          'material_code', v_pend.material_code, 'descricao', v_pend.descricao,
          'qtd_pedido', v_pend.qtd_pedido, 'qtd_recebida', v_pend.qtd_recebida, 'tipo_divergencia', v_pend.motivo)),
        coalesce(v_pend.evidencias, '[]'::jsonb), 'em_tratativa', p_uid, p_nome
      ) returning id into v_id;
      exit;
    exception when unique_violation then
      if v_tentativa = 5 then raise; end if;
    end;
  end loop;

  insert into public.alm_receb_alteracoes (
    entidade, entidade_id, codigo, alteracoes, resumo, alterado_por_id, alterado_por_nome
  ) values (
    'nc', v_id, v_codigo,
    jsonb_build_array(jsonb_build_object('campo', 'criação', 'de', '', 'para', 'RNC aberta pela pendência ' || v_pend.codigo)),
    'RNC aberta por Suprimentos (' || v_pend.codigo || ')', p_uid, p_nome
  );

  nc_id := v_id; nc_codigo := v_codigo; criada := true;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

create or replace function public.sup_receb_pend_decidir(
  p_ids uuid[], p_decisao text, p_obs text default null, p_pedido text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_nome text;
  v_pend public.sup_pend_recebimento;
  v_obs text := nullif(btrim(coalesce(p_obs, '')), '');
  v_pedido text := nullif(regexp_replace(coalesce(p_pedido, ''), '\D', '', 'g'), '');
  v_abre_rnc boolean := public.sup_receb_decisao_abre_rnc(p_decisao);
  v_rotulo text;
  v_ncid uuid;
  v_nccodigo text;
  v_nc_criada boolean;
  v_ncs_novas text[] := '{}';
  v_ncs_todas text[] := '{}';
  v_feitas uuid[] := '{}';
  n record;
begin
  if v_uid is null then raise exception 'Sessão inválida.'; end if;
  if not public.sup_receb_eh_suprimentos(v_uid) then
    raise exception 'Só Suprimentos (comprador, coordenação ou admin) dá a devolutiva.';
  end if;
  if coalesce(array_length(p_ids, 1), 0) = 0 then raise exception 'Nenhuma pendência selecionada.'; end if;
  if p_decisao = 'outro' and v_obs is null then raise exception 'Descreva a tratativa em "Outra tratativa".'; end if;
  if p_decisao = 'vincular_po' and v_pedido is null then raise exception 'Informe o PO a vincular.'; end if;
  select name into v_nome from public.profiles where id = v_uid::text;

  for v_pend in select * from public.sup_pend_recebimento where id = any(p_ids) order by codigo for update loop
    if v_pend.status not in ('aguardando_comprador', 'aguardando_almox') then
      raise exception 'A pendência % já está %.', v_pend.codigo, replace(v_pend.status, '_', ' ');
    end if;
    if not (p_decisao = any(public.sup_receb_decisoes_validas(v_pend.motivo))) then
      raise exception 'Essa decisão não se aplica à pendência % (%).', v_pend.codigo, public.sup_receb_rotulo_motivo(v_pend.motivo);
    end if;
    v_rotulo := public.sup_receb_rotulo_decisao(p_decisao, v_pend.motivo);

    v_ncid := v_pend.nc_id;
    v_nccodigo := v_pend.nc_codigo;
    v_nc_criada := false;
    if v_abre_rnc then
      select g.nc_id, g.nc_codigo, g.criada into v_ncid, v_nccodigo, v_nc_criada
        from public.sup_receb_pend_garantir_ncr(v_pend.id, v_uid, v_nome) g;
      v_ncid := coalesce(v_ncid, v_pend.nc_id);
      v_nccodigo := coalesce(v_nccodigo, v_pend.nc_codigo);
      if v_nc_criada then v_ncs_novas := v_ncs_novas || v_nccodigo; end if;
    end if;

    update public.sup_pend_recebimento set
      status = 'aguardando_almox',
      decisao = p_decisao, decisao_obs = v_obs,
      pedido_vinculado = case when p_decisao = 'vincular_po' then v_pedido end,
      decidido_por_id = v_uid, decidido_por_nome = v_nome, decidido_em = now(),
      comprador_id = coalesce(comprador_id, v_uid), comprador_nome = coalesce(comprador_nome, v_nome),
      nc_id = v_ncid, nc_codigo = v_nccodigo,
      historico = historico
        || public.sup_receb_evento(
             case when v_pend.status = 'aguardando_almox' then 'decisao_alterada' else 'decisao' end,
             v_rotulo || coalesce(' — PO ' || case when p_decisao = 'vincular_po' then v_pedido end, '') || coalesce('. ' || v_obs, ''),
             v_uid, v_nome)
        || case when v_nc_criada
                then public.sup_receb_evento('rnc_aberta', 'RNC ' || v_nccodigo || ' aberta no Recebimento do Almoxarifado.', v_uid, v_nome)
                else '[]'::jsonb end,
      updated_at = now()
     where id = v_pend.id;

    if v_ncid is not null then
      update public.alm_receb_nc set
        acoes = coalesce(acoes, '[]'::jsonb) || jsonb_build_object(
          'texto', 'Suprimentos — ' || v_pend.codigo || coalesce(' · ' || v_pend.material_code, '')
                   || ': ' || v_rotulo || coalesce('. ' || v_obs, ''),
          'evidencias', '[]'::jsonb, 'por_id', v_uid::text, 'por_nome', v_nome, 'em', now()),
        status = case when status = 'aberta' then 'em_tratativa' else status end
       where id = v_ncid and not excluido;
      v_ncs_todas := v_ncs_todas || v_nccodigo;
    end if;
    v_feitas := v_feitas || v_pend.id;
  end loop;

  for n in
    select aberto_por_id, count(*) as qtd, string_agg(distinct nro_pedido, ', ') as pos,
           min(motivo) as motivo, min(id::text) as um_id
      from public.sup_pend_recebimento where id = any(v_feitas)
     group by aberto_por_id
  loop
    perform public.sup_receb_notificar(
      array[n.aberto_por_id],
      'Devolutiva de Suprimentos — PO ' || coalesce(n.pos, 's/ nº'),
      coalesce(v_nome, 'Suprimentos') || ' respondeu ' || n.qtd || ' pendência(s): '
        || public.sup_receb_rotulo_decisao(p_decisao, n.motivo) || coalesce('. ' || v_obs, '')
        || case when v_abre_rnc and cardinality(v_ncs_todas) > 0
                then '. RNC ' || (select string_agg(distinct c, ', ') from unnest(v_ncs_todas) c) || ' aberta no Recebimento'
                else '' end
        || '. Confirme a execução no Almoxarifado.',
      'info',
      '/formularios/almoxarifado?vista=devolutivas' || case when n.qtd = 1 then '&id=' || n.um_id else '' end,
      v_uid);
  end loop;

  return jsonb_build_object(
    'decididas', coalesce(array_length(v_feitas, 1), 0),
    'ncs_abertas', to_jsonb(coalesce((select array_agg(distinct c) from unnest(v_ncs_novas) c), '{}'::text[])));
end;
$$;

-- Idêntica à anterior, exceto: NCR de pendência "Abrir RNC" não é resolvida
-- sozinha — a verificação com o fornecedor continua nela.
create or replace function public.sup_receb_pend_executar(p_ids uuid[], p_obs text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_nome text;
  v_pend public.sup_pend_recebimento;
  v_obs text := nullif(btrim(coalesce(p_obs, '')), '');
  v_feitas uuid[] := '{}';
  n record;
begin
  if v_uid is null then raise exception 'Sessão inválida.'; end if;
  if coalesce(array_length(p_ids, 1), 0) = 0 then raise exception 'Nenhuma pendência selecionada.'; end if;
  select name into v_nome from public.profiles where id = v_uid::text;

  for v_pend in
    select * from public.sup_pend_recebimento
     where id = any(p_ids) and status = 'aguardando_almox' order by codigo for update
  loop
    update public.sup_pend_recebimento set
      status = 'concluida', execucao_obs = v_obs,
      executado_por_id = v_uid, executado_por_nome = v_nome, executado_em = now(),
      historico = historico || public.sup_receb_evento('executada', coalesce(v_obs, 'Executado conforme a decisão.'), v_uid, v_nome),
      updated_at = now()
     where id = v_pend.id;

    if v_pend.nc_id is not null then
      update public.alm_receb_nc set
        acoes = coalesce(acoes, '[]'::jsonb) || jsonb_build_object(
          'texto', 'Almoxarifado — ' || v_pend.codigo || coalesce(' · ' || v_pend.material_code, '')
                   || ': executado (' || public.sup_receb_rotulo_decisao(v_pend.decisao, v_pend.motivo) || ')'
                   || coalesce('. ' || v_obs, ''),
          'evidencias', '[]'::jsonb, 'por_id', v_uid::text, 'por_nome', v_nome, 'em', now())
       where id = v_pend.nc_id and not excluido;
    end if;
    v_feitas := v_feitas || v_pend.id;
  end loop;

  -- NCR cujas pendências fecharam todas: resolvida, com o resumo das decisões
  -- (menos quando algum item foi encaminhado como "Abrir RNC": segue em tratativa).
  update public.alm_receb_nc nc set
    status = 'resolvida',
    resolvida_em = now(),
    resolucao = coalesce(nc.resolucao, 'Tratada com Suprimentos: ' || (
      select string_agg(p.codigo || ' ' || public.sup_receb_rotulo_decisao(p.decisao, p.motivo), '; ' order by p.codigo)
        from public.sup_pend_recebimento p where p.nc_id = nc.id and p.status = 'concluida'))
   where nc.id in (select nc_id from public.sup_pend_recebimento where id = any(v_feitas) and nc_id is not null)
     and not nc.excluido
     and nc.status <> 'resolvida'
     and not exists (
       select 1 from public.sup_pend_recebimento p
        where p.nc_id = nc.id and p.status in ('aguardando_comprador', 'aguardando_almox'))
     and not exists (
       select 1 from public.sup_pend_recebimento p
        where p.nc_id = nc.id and p.decisao = 'abrir_rnc' and p.status <> 'cancelada');

  for n in
    select coalesce(decidido_por_id, comprador_id) as destino, count(*) as qtd,
           string_agg(distinct nro_pedido, ', ') as pos, min(id::text) as um_id
      from public.sup_pend_recebimento where id = any(v_feitas)
     group by 1
  loop
    perform public.sup_receb_notificar(
      array[n.destino],
      'Almoxarifado executou a devolutiva — PO ' || coalesce(n.pos, 's/ nº'),
      coalesce(v_nome, 'Almoxarifado') || ' confirmou ' || n.qtd || ' pendência(s) de recebimento' || coalesce(': ' || v_obs, '.'),
      'success',
      '/suprimentos/pendencias-recebimento?' || case when n.qtd = 1 then 'id=' || n.um_id else 'status=concluida' end,
      v_uid);
  end loop;

  return jsonb_build_object('concluidas', coalesce(array_length(v_feitas, 1), 0));
end;
$$;

-- ---------------------------------------------------------------------------
-- Permissões (create or replace mantém as das RPCs; as novas funções são internas)
-- ---------------------------------------------------------------------------

revoke execute on function
  public.sup_receb_pend_garantir_ncr(uuid, uuid, text),
  public.sup_receb_decisao_abre_rnc(text)
from public, anon, authenticated;

notify pgrst, 'reload schema';
