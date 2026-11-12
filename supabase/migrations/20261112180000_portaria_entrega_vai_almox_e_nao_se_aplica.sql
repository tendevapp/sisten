-- Portaria decide se a entrega vai para o Almoxarifado; ficha cega ganha "Não se aplica".
--
-- 1. `port_relatorio_ocorrencias.vai_almoxarifado`: ao marcar entrega de
--    material, a portaria responde "Vai para o Almoxarifado?". Sim → abre a
--    ficha cega (como antes); Não → só fica no livro, com a NF. Nulo =
--    lançamento antigo ou aparelho com versão anterior do app: vale a regra
--    da PRC (20261112120000) — PRC não vai, o resto vai.
--
-- 2. Ficha cega aberta pela portaria que não faz sentido para o almoxarifado
--    (material de outro setor, entrega marcada por engano): o almox fecha como
--    `nao_se_aplica`, com motivo. Não é divergência nem "não chegou" — sai da
--    fila sem contar contra o almoxarifado. Se o material for mesmo do almox,
--    "Confirmar e preencher" ainda funciona a partir desse status.

-- 1. Colunas --------------------------------------------------------------------
alter table public.port_relatorio_ocorrencias
  add column if not exists vai_almoxarifado boolean;

comment on column public.port_relatorio_ocorrencias.vai_almoxarifado is
  'Entrega de material: a portaria indicou se vai para o Almoxarifado (abre ficha cega). Nulo = antigo; vale a regra da PRC.';

alter table public.alm_receb_cargas
  add column if not exists nao_se_aplica_motivo text,
  add column if not exists nao_se_aplica_em timestamptz,
  add column if not exists nao_se_aplica_por text;

alter table public.alm_receb_cargas drop constraint if exists alm_receb_cargas_status_check;
alter table public.alm_receb_cargas
  add constraint alm_receb_cargas_status_check
  check (status in ('recebida', 'em_conferencia', 'conferida', 'divergente', 'aguardando_almox', 'nao_chegou', 'nao_se_aplica'));

alter table public.alm_receb_cargas drop constraint if exists alm_receb_cargas_contada_check;
alter table public.alm_receb_cargas
  add constraint alm_receb_cargas_contada_check
  check (qtd_volumes_contada is not null or status in ('aguardando_almox', 'nao_chegou', 'nao_se_aplica'));

-- 2. Trigger da portaria: respeita "Vai para o Almoxarifado?" -------------------
create or replace function public.port_ocorrencia_sincronizar_ficha_cega()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_carga public.alm_receb_cargas;
  v_vai boolean := coalesce(new.vai_almoxarifado, not public.port_empresa_sem_ficha_cega(new.empresa));
  v_ativa boolean := coalesce(new.entrega_material, false) and new.excluido_em is null and v_vai;
  v_fotos jsonb;
  v_data date;
  v_codigo text;
  v_id uuid;
  v_transp text := coalesce(nullif(btrim(new.empresa), ''), 'NÃO INFORMADA');
  v_motorista text := coalesce(nullif(btrim(new.nome_pessoa), ''), nullif(btrim(new.pessoas -> 0 ->> 'nome'), ''));
begin
  -- Notas primeiro: é o que o almoxarifado precisa ver.
  select coalesce(jsonb_agg(f), '[]'::jsonb) into v_fotos
  from (
    select jsonb_build_object('path', x->>'path', 'nome', coalesce(x->>'name', 'nota-fiscal.jpg'),
                              'tipo', coalesce(x->>'mime_type', 'image/jpeg'), 'categoria', 'nf') f
    from jsonb_array_elements(coalesce(new.fotos_nf, '[]'::jsonb)) x
    union all
    select jsonb_build_object('path', x->>'path', 'nome', coalesce(x->>'name', 'foto.jpg'),
                              'tipo', coalesce(x->>'mime_type', 'image/jpeg'), 'categoria', 'registro')
    from jsonb_array_elements(coalesce(new.fotos, '[]'::jsonb)) x
  ) s;

  select * into v_carga from public.alm_receb_cargas where port_ocorrencia_id = new.id;

  if not found then
    if not v_ativa then return null; end if;
    select r.data into v_data from public.port_relatorio_portaria r where r.id = new.relatorio_id;
    v_data := coalesce(v_data, (now() at time zone 'America/Bahia')::date);
    v_codigo := public.alm_receb_proximo_codigo('RCV', v_data, 'alm_receb_cargas');

    insert into public.alm_receb_cargas
      (codigo, data, hora, transportadora, veiculo_placa, motorista, qtd_volumes_contada,
       evidencias, divergencia, status, origem, port_ocorrencia_id, fotos_portaria, portaria_resumo,
       criado_por_id, criado_por_nome)
    values
      (v_codigo, v_data, new.horario, v_transp, nullif(btrim(new.placa), ''), v_motorista, null,
       '[]'::jsonb, false, 'aguardando_almox', 'portaria', new.id, v_fotos, new.descricao,
       auth.uid(), 'PORTARIA — ' || coalesce(new.vigilante, ''))
    returning id into v_id;

    insert into public.alm_receb_alteracoes
      (entidade, entidade_id, codigo, alteracoes, resumo, alterado_por_id, alterado_por_nome)
    values ('carga', v_id, v_codigo, '[]'::jsonb,
            'Aberta pela Portaria: entrega de material às ' || left(new.horario::text, 5)
              || case when new.nf_verificada then ' (NF verificada)' else '' end,
            auth.uid(), new.vigilante);
    return null;
  end if;

  perform set_config('sisten.port_entrega_sync', '1', true);

  if v_carga.status = 'aguardando_almox' then
    if not v_ativa then
      -- Desmarcou a entrega, excluiu o lançamento ou disse que não vai ao almox:
      -- a ficha sai da tela (fica no banco).
      if not v_carga.excluido then
        update public.alm_receb_cargas
           set excluido = true, excluido_em = now(),
               excluido_por = case
                 when coalesce(new.entrega_material, false) and new.excluido_em is null
                   then 'PORTARIA (entrega não vai para o almoxarifado)'
                 else 'PORTARIA (lançamento sem entrega de material)' end
         where id = v_carga.id;
      end if;
    else
      update public.alm_receb_cargas set
        hora = new.horario,
        transportadora = v_transp,
        veiculo_placa = nullif(btrim(new.placa), ''),
        motorista = v_motorista,
        fotos_portaria = v_fotos,
        portaria_resumo = new.descricao,
        excluido = case when excluido and excluido_por like 'PORTARIA%' then false else excluido end,
        excluido_em = case when excluido and excluido_por like 'PORTARIA%' then null else excluido_em end,
        excluido_por = case when excluido and excluido_por like 'PORTARIA%' then null else excluido_por end
      where id = v_carga.id;
    end if;
  else
    -- Já confirmada, "não chegou" ou "não se aplica": só o que é da portaria acompanha.
    update public.alm_receb_cargas
       set fotos_portaria = v_fotos, portaria_resumo = new.descricao
     where id = v_carga.id;
  end if;

  perform set_config('sisten.port_entrega_sync', '', true);
  return null;
end;
$$;

revoke execute on function public.port_ocorrencia_sincronizar_ficha_cega() from public, anon;

drop trigger if exists trg_port_ocorrencia_ficha_cega on public.port_relatorio_ocorrencias;
create trigger trg_port_ocorrencia_ficha_cega
  after insert or update of entrega_material, vai_almoxarifado, nf_verificada, fotos, fotos_nf, empresa, placa,
                            nome_pessoa, pessoas, horario, descricao, excluido_em
  on public.port_relatorio_ocorrencias
  for each row execute function public.port_ocorrencia_sincronizar_ficha_cega();

-- 3. "Não se aplica" ------------------------------------------------------------
create or replace function public.alm_receb_carga_nao_se_aplica(p_id uuid, p_motivo text, p_user jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old public.alm_receb_cargas;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  if auth.uid() is null then raise exception 'Sessao invalida.'; end if;
  select * into v_old from public.alm_receb_cargas where id = p_id and not excluido;
  if not found then raise exception 'Ficha cega nao encontrada.'; end if;
  if v_old.status <> 'aguardando_almox' then
    raise exception 'Só a entrega aguardando o almoxarifado pode ser marcada como não se aplica (status atual: %).', v_old.status;
  end if;
  if v_motivo is null or length(v_motivo) < 5 then
    raise exception 'Explique por que não se aplica (mínimo 5 caracteres).';
  end if;

  update public.alm_receb_cargas
     set status = 'nao_se_aplica', nao_se_aplica_motivo = upper(v_motivo),
         nao_se_aplica_em = now(), nao_se_aplica_por = p_user->>'nome'
   where id = p_id;

  insert into public.alm_receb_alteracoes
    (entidade, entidade_id, codigo, alteracoes, resumo, alterado_por_id, alterado_por_nome)
  values ('carga', p_id, v_old.codigo,
          jsonb_build_array(jsonb_build_object('campo', 'status', 'de', v_old.status, 'para', 'nao_se_aplica'),
                            jsonb_build_object('campo', 'nao_se_aplica_motivo', 'de', null, 'para', upper(v_motivo))),
          'Almoxarifado fechou como "não se aplica" (entrega não era para o almoxarifado)',
          nullif(p_user->>'id','')::uuid, p_user->>'nome');

  return jsonb_build_object('id', p_id, 'codigo', v_old.codigo, 'status', 'nao_se_aplica');
end;
$$;

revoke execute on function public.alm_receb_carga_nao_se_aplica(uuid, text, jsonb) from public, anon;
grant execute on function public.alm_receb_carga_nao_se_aplica(uuid, text, jsonb) to authenticated;

-- 4. Editar ficha cega: contar a partir de "não se aplica" também confirma -------
create or replace function public.alm_receb_editar_carga(p_id uuid, p_patch jsonb, p_user jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_old public.alm_receb_cargas;
  v_alt jsonb := '[]'::jsonb;
  v_contada int;
  v_declarada int;
  v_avaria boolean;
  v_diverg boolean;
  v_status text;
  v_confirmou boolean;
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
  if auth.uid() is null then
    raise exception 'Sessao invalida.';
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
  v_diverg := v_avaria or coalesce(v_declarada is not null and v_contada is not null and v_declarada <> v_contada, false);

  v_status := case when v_old.status = 'conferida' then v_old.status
                   when v_contada is null then v_old.status          -- aguardando / não chegou / não se aplica sem contagem
                   when v_diverg then 'divergente' else 'recebida' end;
  v_confirmou := v_old.status in ('aguardando_almox', 'nao_chegou', 'nao_se_aplica') and v_contada is not null;
  if v_status is distinct from v_old.status then
    v_alt := v_alt || jsonb_build_object('campo', 'status', 'de', v_old.status, 'para', v_status);
  end if;

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
    status = v_status,
    almox_confirmado_em = case when v_confirmou then now() else almox_confirmado_em end,
    almox_confirmado_por = case when v_confirmou then p_user->>'nome' else almox_confirmado_por end
  where id = p_id;

  if jsonb_array_length(v_alt) > 0 then
    insert into public.alm_receb_alteracoes
      (entidade, entidade_id, codigo, alteracoes, resumo, alterado_por_id, alterado_por_nome)
    values ('carga', p_id, v_old.codigo, v_alt,
            case when v_confirmou then 'Entrega da portaria confirmada pelo almoxarifado'
                 else jsonb_array_length(v_alt) || ' campo(s) alterado(s)' end,
            nullif(p_user->>'id','')::uuid, p_user->>'nome');
  end if;

  return jsonb_build_object('id', p_id, 'codigo', v_old.codigo, 'alteracoes', jsonb_array_length(v_alt),
                            'status', v_status);
end;
$function$;

revoke execute on function public.alm_receb_editar_carga(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.alm_receb_editar_carga(uuid, jsonb, jsonb) to authenticated;
