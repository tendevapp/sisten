-- Portaria: entrega de material da PRC não abre ficha cega no almoxarifado.
--
-- A PRC (refeitório) entrega mercadoria para a cozinha. O lançamento continua
-- marcado como entrega de material, com NF verificada e foto, mas o
-- almoxarifado não recebe ficha cega para conferir.
--
-- A regra é por empresa do lançamento (`empresa` = "PRC", "PRC REFEIÇÕES",
-- "P.R.C."...). Espelho no front: empresaSemFichaCega em
-- src/lib/portariaFotosOcorrencia.ts — mudar os dois juntos.
--
-- Ficha da PRC ainda aguardando o almoxarifado sai da tela (exclusão lógica,
-- excluido_por 'PORTARIA ...'); se a empresa do lançamento for corrigida para
-- outra, o trigger devolve a ficha.

create or replace function public.port_empresa_sem_ficha_cega(p_empresa text)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select upper(coalesce(p_empresa, '')) ~ '(^|[^A-Z0-9])P\.?R\.?C($|[^A-Z0-9])';
$$;

comment on function public.port_empresa_sem_ficha_cega(text) is
  'Empresas cuja entrega de material na portaria não abre ficha cega (PRC/refeitório). Espelho: empresaSemFichaCega no front.';

create or replace function public.port_ocorrencia_sincronizar_ficha_cega()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_carga public.alm_receb_cargas;
  v_sem_ficha boolean := public.port_empresa_sem_ficha_cega(new.empresa);
  v_ativa boolean := coalesce(new.entrega_material, false) and new.excluido_em is null and not v_sem_ficha;
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
      -- Desmarcou a entrega, excluiu o lançamento ou é da PRC: a ficha sai da tela (fica no banco).
      if not v_carga.excluido then
        update public.alm_receb_cargas
           set excluido = true, excluido_em = now(),
               excluido_por = case when v_sem_ficha
                                   then 'PORTARIA (entrega da PRC — não passa pelo almoxarifado)'
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

-- Fichas da PRC que já estão aguardando o almoxarifado saem da tela.
do $$
begin
  perform set_config('sisten.port_entrega_sync', '1', true);
  update public.alm_receb_cargas c
     set excluido = true, excluido_em = now(),
         excluido_por = 'PORTARIA (entrega da PRC — não passa pelo almoxarifado)'
    from public.port_relatorio_ocorrencias o
   where o.id = c.port_ocorrencia_id
     and c.status = 'aguardando_almox'
     and not c.excluido
     and public.port_empresa_sem_ficha_cega(o.empresa);
  perform set_config('sisten.port_entrega_sync', '', true);
end $$;
