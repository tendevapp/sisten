-- Portaria → Almoxarifado: entrada com entrega de material abre a ficha cega.
--
-- Quando a portaria grava um lançamento do Relatório de Ocorrências com
-- `entrega_material`, um trigger cria a ficha cega (RCV) no estado
-- `aguardando_almox`, com transportadora/placa/motorista do lançamento e as
-- fotos da portaria (registro + notas) referenciadas em `fotos_portaria`
-- (bucket port-ocorrencias — não copia arquivo). Por ser trigger, vale também
-- para lançamento feito sem rede: a ficha nasce quando a fila sobe.
--
-- O almoxarifado então:
--   * confirma e preenche (contagem cega) pelo alm_receb_editar_carga → status
--     recebida/divergente, com almox_confirmado_em/por; ou
--   * informa que não chegou (alm_receb_carga_nao_chegou) → status nao_chegou.
--
-- Enquanto aguarda, a ficha acompanha o lançamento: editar o lançamento
-- atualiza os dados; desmarcar a entrega (ou excluir o lançamento) tira a
-- ficha da tela; remarcar devolve. Depois de confirmada, só as fotos e o
-- resumo da portaria continuam sincronizando.

-- 1. Colunas -------------------------------------------------------------------
alter table public.alm_receb_cargas
  add column if not exists origem text not null default 'almox',
  add column if not exists port_ocorrencia_id uuid references public.port_relatorio_ocorrencias(id) on delete set null,
  add column if not exists fotos_portaria jsonb not null default '[]'::jsonb,
  add column if not exists portaria_resumo text,
  add column if not exists almox_confirmado_em timestamptz,
  add column if not exists almox_confirmado_por text,
  add column if not exists nao_chegou_motivo text,
  add column if not exists nao_chegou_em timestamptz,
  add column if not exists nao_chegou_por text;

alter table public.alm_receb_cargas drop constraint if exists alm_receb_cargas_origem_check;
alter table public.alm_receb_cargas
  add constraint alm_receb_cargas_origem_check check (origem in ('almox', 'portaria'));

comment on column public.alm_receb_cargas.fotos_portaria is
  'Fotos tiradas pela portaria (bucket port-ocorrencias): [{path,nome,tipo,categoria:nf|registro}]';

create unique index if not exists uq_alm_receb_cargas_port_ocorrencia
  on public.alm_receb_cargas (port_ocorrencia_id) where port_ocorrencia_id is not null;

-- Ficha aberta pela portaria ainda não tem contagem.
alter table public.alm_receb_cargas alter column qtd_volumes_contada drop not null;

alter table public.alm_receb_cargas drop constraint if exists alm_receb_cargas_status_check;
alter table public.alm_receb_cargas
  add constraint alm_receb_cargas_status_check
  check (status in ('recebida', 'em_conferencia', 'conferida', 'divergente', 'aguardando_almox', 'nao_chegou'));

alter table public.alm_receb_cargas drop constraint if exists alm_receb_cargas_contada_check;
alter table public.alm_receb_cargas
  add constraint alm_receb_cargas_contada_check
  check (qtd_volumes_contada is not null or status in ('aguardando_almox', 'nao_chegou'));

-- 2. Guarda de exclusão: a sincronização da portaria pode tirar/devolver a ficha -
create or replace function public.alm_receb_guarda_exclusao()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if coalesce(current_setting('sisten.port_entrega_sync', true), '') = '1' then
    return new;
  end if;
  if new.excluido is distinct from old.excluido
     and not public.form_pode_editar(old.criado_por_id::text) then
    raise exception 'So o autor do registro ou um admin pode excluir.';
  end if;
  if new.criado_por_id is distinct from old.criado_por_id
     and not public.has_role('admin') then
    raise exception 'O autor do registro nao pode ser alterado.';
  end if;
  return new;
end;
$$;

-- 3. Trigger na ocorrência da portaria -----------------------------------------
create or replace function public.port_ocorrencia_sincronizar_ficha_cega()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_carga public.alm_receb_cargas;
  v_ativa boolean := coalesce(new.entrega_material, false) and new.excluido_em is null;
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
      -- Desmarcou a entrega ou excluiu o lançamento: a ficha sai da tela (fica no banco).
      if not v_carga.excluido then
        update public.alm_receb_cargas
           set excluido = true, excluido_em = now(),
               excluido_por = 'PORTARIA (lançamento sem entrega de material)'
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
    -- Já confirmada (ou "não chegou"): só o que é da portaria acompanha.
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
  after insert or update of entrega_material, nf_verificada, fotos, fotos_nf, empresa, placa,
                            nome_pessoa, pessoas, horario, descricao, excluido_em
  on public.port_relatorio_ocorrencias
  for each row execute function public.port_ocorrencia_sincronizar_ficha_cega();

-- 4. Editar ficha cega: aceita a ficha sem contagem e registra a confirmação ----
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
                   when v_contada is null then v_old.status          -- aguardando / não chegou sem contagem
                   when v_diverg then 'divergente' else 'recebida' end;
  v_confirmou := v_old.status in ('aguardando_almox', 'nao_chegou') and v_contada is not null;
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

-- 5. "Não chegou" ---------------------------------------------------------------
create or replace function public.alm_receb_carga_nao_chegou(p_id uuid, p_motivo text, p_user jsonb default '{}'::jsonb)
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
    raise exception 'Só a entrega aguardando o almoxarifado pode ser marcada como não chegou (status atual: %).', v_old.status;
  end if;
  if v_motivo is null or length(v_motivo) < 5 then
    raise exception 'Explique o que aconteceu (mínimo 5 caracteres).';
  end if;

  update public.alm_receb_cargas
     set status = 'nao_chegou', nao_chegou_motivo = upper(v_motivo),
         nao_chegou_em = now(), nao_chegou_por = p_user->>'nome'
   where id = p_id;

  insert into public.alm_receb_alteracoes
    (entidade, entidade_id, codigo, alteracoes, resumo, alterado_por_id, alterado_por_nome)
  values ('carga', p_id, v_old.codigo,
          jsonb_build_array(jsonb_build_object('campo', 'status', 'de', v_old.status, 'para', 'nao_chegou'),
                            jsonb_build_object('campo', 'nao_chegou_motivo', 'de', null, 'para', upper(v_motivo))),
          'Almoxarifado informou que o material não chegou',
          nullif(p_user->>'id','')::uuid, p_user->>'nome');

  return jsonb_build_object('id', p_id, 'codigo', v_old.codigo, 'status', 'nao_chegou');
end;
$$;

revoke execute on function public.alm_receb_carga_nao_chegou(uuid, text, jsonb) from public, anon;
grant execute on function public.alm_receb_carga_nao_chegou(uuid, text, jsonb) to authenticated;
