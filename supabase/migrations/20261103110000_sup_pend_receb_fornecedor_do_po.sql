-- Pendências de Recebimento: fornecedor vem do PO, não do cabeçalho da conferência.
--
-- A conferência é multi-PO (uma NF/carga pode cobrir POs de vários
-- fornecedores) e guarda um único `fornecedor` no cabeçalho. A pendência
-- copiava esse valor para todos os POs — ex.: RCM-291026-02 (15 POs) gravou
-- SUPRE no PO 4100472484, que no SAP é da RITEC. 21 de 32 pendências estavam
-- com o fornecedor de outro PO.
--
-- Agora o nome sai da ZL0132 do próprio PO; o da conferência/NCR fica só
-- como reserva quando o PO ainda não está importado.

create or replace function public.sup_receb_fornecedor_do_po(p_po text)
returns text
language sql
stable security definer
set search_path to 'public', 'pg_temp'
as $$
  select f
    from (
      select coalesce(nullif(btrim(z.fornecedor_nome), ''), nullif(btrim(z.fornecedor), '')) as f
        from public.sap_zl0132_po z
       where z.doc_compra = btrim(p_po)
    ) s
   where f is not null
   group by f
   order by count(*) desc
   limit 1;
$$;

revoke all on function public.sup_receb_fornecedor_do_po(text) from public, anon;
grant execute on function public.sup_receb_fornecedor_do_po(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Conferência → pendências (só muda o fornecedor do insert)
-- ---------------------------------------------------------------------------
create or replace function public.sup_receb_pend_sincronizar_conferencia(p_conf uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_flag text := 'sup_pend.c_' || replace(p_conf::text, '-', '');
  v_conf public.alm_receb_conferencias;
  v_nc public.alm_receb_nc;
  v_pend public.sup_pend_recebimento;
  v_grupo text;
  v_cid uuid;
  v_cnome text;
  r record;
  v_chave text;
  v_chaves text[] := '{}';
  v_codigo text;
  v_id uuid;
  v_novas jsonb := '[]'::jsonb;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if current_setting(v_flag, true) = txid_current()::text then return; end if;
  perform set_config(v_flag, txid_current()::text, true);

  select * into v_conf from public.alm_receb_conferencias where id = p_conf;
  if not found then return; end if;

  -- Retorno de remessa não possui PO nem comprador de Suprimentos: não abre pendência
  if coalesce(v_conf.retorno_remessa, false) then
    delete from public.sup_pend_recebimento where conferencia_id = p_conf;
    return;
  end if;

  select * into v_nc from public.alm_receb_nc
   where conferencia_id = p_conf and not excluido order by created_at limit 1;

  if not coalesce(v_conf.excluido, false) then
    for r in
      select i.*,
             coalesce(nullif(i.nro_pedido, ''), v_conf.nro_pedido) as po,
             case
               when i.divergencia then
                 case when i.tipo_divergencia in ('falta', 'excedente', 'avaria', 'material_errado', 'sem_pedido')
                      then i.tipo_divergencia else 'outros' end
               when i.parcial and i.qtd_pedido is not null
                    and i.qtd_recebida < i.qtd_pedido - coalesce(i.qtd_ja_fornecida, 0) - 0.001 then 'parcial'
             end as motivo
        from public.alm_receb_conferencia_itens i
       where i.conferencia_id = p_conf
       order by i.created_at
    loop
      continue when r.motivo is null;
      v_chave := 'c:' || p_conf || '|' || coalesce(r.po, '') || '|'
                 || coalesce(r.linha_ref, r.material_code, upper(r.descricao), '') || '|' || r.motivo;
      continue when v_chave = any(v_chaves);
      v_chaves := v_chaves || v_chave;

      select * into v_pend from public.sup_pend_recebimento where chave = v_chave;

      if not found then
        perform pg_advisory_xact_lock(hashtext('sup_pend_recebimento_codigo'));
        v_codigo := public.alm_receb_proximo_codigo('PRE', v_hoje, 'sup_pend_recebimento');
        select * into v_grupo, v_cid, v_cnome from public.sup_receb_comprador_do_po(r.po);
        insert into public.sup_pend_recebimento (
          codigo, origem, chave, conferencia_id, conferencia_codigo, nc_id, nc_codigo, carga_id,
          nro_pedido, linha_ref, material_code, descricao, unidade, fornecedor, motivo,
          qtd_pedido, qtd_ja_fornecida, qtd_recebida, observacao_almox, evidencias,
          grupo_compras, comprador_id, comprador_nome, aberto_por_id, aberto_por_nome, historico)
        values (
          v_codigo, 'conferencia', v_chave, p_conf, v_conf.codigo, v_nc.id, v_nc.codigo, v_conf.carga_id,
          r.po, r.linha_ref, r.material_code, r.descricao, r.unidade,
          coalesce(public.sup_receb_fornecedor_do_po(r.po), v_conf.fornecedor), r.motivo,
          r.qtd_pedido, r.qtd_ja_fornecida, r.qtd_recebida, r.observacao, coalesce(r.evidencias, '[]'::jsonb),
          v_grupo, v_cid, v_cnome, v_conf.criado_por_id, v_conf.criado_por_nome,
          public.sup_receb_evento('aberta',
            public.sup_receb_rotulo_motivo(r.motivo) || ' na conferência ' || v_conf.codigo
              || coalesce(' — comprador: ' || v_cnome, ' — comprador do PO não identificado'),
            v_conf.criado_por_id, v_conf.criado_por_nome))
        returning id into v_id;
        v_novas := v_novas || jsonb_build_object('id', v_id, 'comprador_id', v_cid, 'po', r.po, 'motivo', r.motivo);

      elsif v_pend.status = 'cancelada' and v_pend.cancelamento = 'auto' then
        update public.sup_pend_recebimento set
          status = 'aguardando_comprador', cancelamento = null,
          decisao = null, decisao_obs = null, pedido_vinculado = null,
          decidido_por_id = null, decidido_por_nome = null, decidido_em = null,
          qtd_pedido = r.qtd_pedido, qtd_ja_fornecida = r.qtd_ja_fornecida, qtd_recebida = r.qtd_recebida,
          observacao_almox = r.observacao, evidencias = coalesce(r.evidencias, '[]'::jsonb),
          nc_id = v_nc.id, nc_codigo = v_nc.codigo,
          historico = historico || public.sup_receb_evento('reaberta',
            'A divergência voltou na edição da conferência.', v_conf.criado_por_id, v_conf.criado_por_nome),
          updated_at = now()
         where id = v_pend.id;
        v_novas := v_novas || jsonb_build_object('id', v_pend.id, 'comprador_id', v_pend.comprador_id, 'po', r.po, 'motivo', r.motivo);

      elsif v_pend.status = 'aguardando_almox' and v_pend.qtd_recebida is distinct from r.qtd_recebida then
        update public.sup_pend_recebimento set
          status = 'aguardando_comprador',
          qtd_pedido = r.qtd_pedido, qtd_ja_fornecida = r.qtd_ja_fornecida, qtd_recebida = r.qtd_recebida,
          observacao_almox = r.observacao, evidencias = coalesce(r.evidencias, '[]'::jsonb),
          historico = historico || public.sup_receb_evento('reaberta',
            'Conferência editada depois da decisão: recebido de ' || coalesce(v_pend.qtd_recebida::text, '—')
              || ' para ' || r.qtd_recebida || '. Confirme a decisão.',
            v_conf.criado_por_id, v_conf.criado_por_nome),
          updated_at = now()
         where id = v_pend.id;
        v_novas := v_novas || jsonb_build_object('id', v_pend.id, 'comprador_id', coalesce(v_pend.decidido_por_id, v_pend.comprador_id), 'po', r.po, 'motivo', r.motivo);

      elsif v_pend.status = 'concluida' then
        if v_pend.qtd_recebida is distinct from r.qtd_recebida then
          update public.sup_pend_recebimento set
            qtd_recebida = r.qtd_recebida,
            historico = historico || public.sup_receb_evento('editada',
              'Conferência editada depois da conclusão: recebido de ' || coalesce(v_pend.qtd_recebida::text, '—')
                || ' para ' || r.qtd_recebida || '.',
              v_conf.criado_por_id, v_conf.criado_por_nome),
            updated_at = now()
           where id = v_pend.id;
        end if;
      end if;
    end loop;
  end if;

  update public.sup_pend_recebimento set
    status = 'cancelada', cancelamento = 'auto',
    historico = historico || public.sup_receb_evento('cancelada',
      case when coalesce(v_conf.excluido, false) then 'Conferência excluída.'
           else 'A divergência saiu da conferência na edição.' end,
      null, 'Sistema'),
    updated_at = now()
   where conferencia_id = p_conf
     and status in ('aguardando_comprador', 'aguardando_almox')
     and not (chave = any(v_chaves));

  if jsonb_array_length(v_novas) > 0 then
    perform public.sup_receb_pend_notificar_novas(v_novas, v_conf.codigo, 'conf=' || p_conf);
  end if;
end;
$function$;

-- ---------------------------------------------------------------------------
-- NCR avulsa → pendência (fornecedor do PO da NCR)
-- ---------------------------------------------------------------------------
create or replace function public.sup_receb_pend_sincronizar_nc(p_nc uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_nc public.alm_receb_nc;
  v_pend public.sup_pend_recebimento;
  v_grupo text;
  v_cid uuid;
  v_cnome text;
  v_chave text := 'nc:' || p_nc;
  v_motivo text;
  v_codigo text;
  v_id uuid;
  v_forn text;
begin
  select * into v_nc from public.alm_receb_nc where id = p_nc;
  if not found then return; end if;
  if v_nc.conferencia_id is not null then
    perform public.sup_receb_pend_sincronizar_conferencia(v_nc.conferencia_id);
    return;
  end if;

  v_motivo := case when v_nc.tipo in ('falta', 'excedente', 'avaria', 'material_errado', 'sem_pedido')
                   then v_nc.tipo else 'outros' end;
  select * into v_pend from public.sup_pend_recebimento where chave = v_chave;

  if v_nc.excluido or coalesce(btrim(v_nc.nro_pedido), '') = '' then
    update public.sup_pend_recebimento set
      status = 'cancelada', cancelamento = 'auto',
      historico = historico || public.sup_receb_evento('cancelada',
        case when v_nc.excluido then 'NCR excluída.' else 'A NCR ficou sem PO.' end, null, 'Sistema'),
      updated_at = now()
     where chave = v_chave and status in ('aguardando_comprador', 'aguardando_almox');
    return;
  end if;

  v_forn := coalesce(public.sup_receb_fornecedor_do_po(v_nc.nro_pedido), v_nc.fornecedor);

  if v_pend.id is null then
    perform pg_advisory_xact_lock(hashtext('sup_pend_recebimento_codigo'));
    v_codigo := public.alm_receb_proximo_codigo('PRE', (now() at time zone 'America/Sao_Paulo')::date, 'sup_pend_recebimento');
    select * into v_grupo, v_cid, v_cnome from public.sup_receb_comprador_do_po(v_nc.nro_pedido);
    insert into public.sup_pend_recebimento (
      codigo, origem, chave, nc_id, nc_codigo, carga_id, nro_pedido, descricao, fornecedor, motivo,
      observacao_almox, evidencias, grupo_compras, comprador_id, comprador_nome,
      aberto_por_id, aberto_por_nome, historico)
    values (
      v_codigo, 'nc', v_chave, v_nc.id, v_nc.codigo, v_nc.carga_id, v_nc.nro_pedido, v_nc.descricao,
      v_forn, v_motivo, v_nc.descricao, coalesce(v_nc.evidencias, '[]'::jsonb),
      v_grupo, v_cid, v_cnome, v_nc.criado_por_id, v_nc.criado_por_nome,
      public.sup_receb_evento('aberta',
        public.sup_receb_rotulo_motivo(v_motivo) || ' na NCR ' || v_nc.codigo
          || coalesce(' — comprador: ' || v_cnome, ' — comprador do PO não identificado'),
        v_nc.criado_por_id, v_nc.criado_por_nome))
    returning id into v_id;
    perform public.sup_receb_pend_notificar_novas(
      jsonb_build_array(jsonb_build_object('id', v_id, 'comprador_id', v_cid, 'po', v_nc.nro_pedido, 'motivo', v_motivo)),
      v_nc.codigo, 'id=' || v_id);

  elsif v_pend.status = 'aguardando_comprador' then
    if v_pend.nro_pedido is distinct from v_nc.nro_pedido or v_pend.comprador_id is null then
      select * into v_grupo, v_cid, v_cnome from public.sup_receb_comprador_do_po(v_nc.nro_pedido);
    else
      v_grupo := null; v_cid := null; v_cnome := null;
    end if;
    update public.sup_pend_recebimento set
      nro_pedido = v_nc.nro_pedido, descricao = v_nc.descricao, fornecedor = v_forn,
      motivo = v_motivo, observacao_almox = v_nc.descricao, evidencias = coalesce(v_nc.evidencias, '[]'::jsonb),
      grupo_compras = case when v_cid is not null then v_grupo else grupo_compras end,
      comprador_id = coalesce(v_cid, comprador_id),
      comprador_nome = coalesce(v_cnome, comprador_nome),
      updated_at = now()
     where id = v_pend.id
       and (nro_pedido, descricao, fornecedor, motivo, evidencias, comprador_id)
           is distinct from
           (v_nc.nro_pedido, v_nc.descricao, v_forn, v_motivo, coalesce(v_nc.evidencias, '[]'::jsonb),
            coalesce(v_cid, comprador_id));
  end if;
end;
$function$;

-- ---------------------------------------------------------------------------
-- Corrige as pendências já gravadas (só o nome; não mexe em status/histórico)
-- ---------------------------------------------------------------------------
update public.sup_pend_recebimento p
   set fornecedor = f.forn
  from (
    select id, public.sup_receb_fornecedor_do_po(nro_pedido) as forn
      from public.sup_pend_recebimento
  ) f
 where f.id = p.id
   and f.forn is not null
   and p.fornecedor is distinct from f.forn;
