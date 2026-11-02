-- =====================================================================
-- Admin > Equipes: volumetria, cronoanálise e indicadores por equipe.
--
-- Junta, num período, os registros que cada formulário já grava (quem fez e
-- quando) num formato só de evento:
--   t  tipo do evento          u  id da pessoa (core_perfis.id)
--   em instante (timestamptz)  q  quantidade (itens, volumes…)
--   d  segundos de ciclo (lead time do processo), quando houver
--   f  marcador do processo (divergente, resolvida, lançada no SAP…)
--   n  número (ex.: nº da contagem do inventário)
--   v  valor em R$ (Suprimentos: valor dos pedidos do item de RM, propostas)
-- O uso do SISTEN (ops_eventos_uso) vem agregado por pessoa × dia.
--
-- Almoxarifado: recebimento, cadastro, inventário, balcão, extraordinária,
-- projetos. Suprimentos: item de RM convertido em pedido (ZL0132, comprador
-- pelo login SAP → sup_compradores → perfil), entregas recebidas (OTD),
-- compra assumida e pedido emitido (histórico de status das solicitações),
-- chamados resolvidos, cotações, propostas, decisões do mapa,
-- diligenciamento e a carteira aberta HOJE (ME5A N/A, pelo grupo de compras).
--
-- Uma chamada, um jsonb: sem o corte de 1.000 linhas do PostgREST e sem
-- depender da RLS de cada tabela. Só administrador.
-- Campos de autor gravados como NOME (doc_sap_por, confirmada_por) são
-- casados com core_perfis.name.
-- =====================================================================

create or replace function public.adm_equipes_eventos(p_de date, p_ate date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_ini timestamptz := (p_de::timestamp) at time zone 'America/Bahia';
  v_fim timestamptz := ((p_ate + 1)::timestamp) at time zone 'America/Bahia';
  v_eventos jsonb;
  v_pessoas jsonb;
begin
  if auth.uid() is null or not public.has_role('admin') then
    raise exception 'Somente administradores.';
  end if;
  if p_de is null or p_ate is null or p_ate < p_de then raise exception 'Período inválido.'; end if;
  if p_ate - p_de > 400 then raise exception 'Período máximo de 400 dias.'; end if;

  with nomes as (
    select distinct on (upper(btrim(name))) upper(btrim(name)) nome, id
      from public.core_perfis
     where coalesce(btrim(name), '') <> ''
     order by upper(btrim(name)), (status = 'ativo') desc
  ),
  -- Comprador (login SAP / grupo de compras) → perfil: pelo e-mail; sem ele,
  -- pelo primeiro nome no setor de Suprimentos.
  compradores as (
    select btrim(c.usuario_sistema) usuario, btrim(c.grupo_compras) grupo,
      coalesce(
        (select p.id from public.core_perfis p where lower(btrim(p.email)) = lower(btrim(c.email)) limit 1),
        (select p.id from public.core_perfis p
          where p.sector_id = '5' and upper(btrim(p.name)) like upper(btrim(c.nome_comprador)) || ' %'
          order by (p.status = 'ativo') desc limit 1)
      ) perfil
      from public.sup_compradores c
  ),
  ev_sup as (
    -- Item de RM convertido em pedido: o 1º pedido de cada RI (como os
    -- dashboards contam); d = lead time RM→PO; v = valor de todos os pedidos da RI
    select 'sup_pedido' t, cp.perfil u, (z.data_doc::timestamp + interval '12 hours') at time zone 'America/Bahia' em,
           1::numeric q, ((z.data_doc - z.data_rc) * 86400)::numeric d, null::boolean f, null::int n, z.valor v
      from (
        select distinct on (btrim(ri)) btrim(ri) ri, data_doc, data_rc, btrim(criado_por_pedido) usuario,
               sum(valor_em_brl) over (partition by btrim(ri)) valor
          from public.sap_zl0132_po
         where nullif(btrim(ri), '') is not null and data_doc is not null
         order by btrim(ri), data_doc, id
      ) z
      join compradores cp on cp.usuario = z.usuario
     where z.data_doc between p_de and p_ate
    union all
    -- Entrega recebida (MIGO) no período: f = no prazo (OTD)
    select 'sup_entrega', cp.perfil, (z.data_migo::timestamp + interval '12 hours') at time zone 'America/Bahia',
           1, null, z.data_migo <= z.dt_remessa, null, null
      from public.sap_zl0132_po z
      join compradores cp on cp.usuario = btrim(z.criado_por_pedido)
     where z.data_migo between p_de and p_ate and z.dt_remessa is not null
    union all
    -- Compra assumida (aprovada → em cotação): d = tempo desde a aprovação
    select 'sup_assumiu', h.user_id, h.created_at, 1,
           extract(epoch from h.created_at - (
             select max(a.created_at) from public.core_solicitacoes_historico_status a
              where a.request_id = h.request_id and a.to_status = 'aprovada' and a.created_at <= h.created_at)),
           null, null, null
      from public.core_solicitacoes_historico_status h
     where h.to_status = 'em_cotacao' and h.created_at >= v_ini and h.created_at < v_fim
    union all
    -- Pedido emitido na solicitação: d = tempo desde que assumiu
    select 'sup_pedido_emitido', h.user_id, h.created_at, 1,
           extract(epoch from h.created_at - (
             select max(a.created_at) from public.core_solicitacoes_historico_status a
              where a.request_id = h.request_id and a.to_status = 'em_cotacao' and a.created_at <= h.created_at)),
           null, null, null
      from public.core_solicitacoes_historico_status h
     where h.to_status = 'pedido_emitido' and h.created_at >= v_ini and h.created_at < v_fim
    union all
    -- Chamado / cadastro SAP resolvido: d = tempo desde a abertura
    select 'sup_chamado_resolvido', h.user_id, h.created_at, 1, extract(epoch from h.created_at - s.created_at), null, null, null
      from public.core_solicitacoes_historico_status h
      join public.core_solicitacoes s on s.id = h.request_id
     where h.to_status = 'resolvido' and s.type in ('chamado', 'cadastro_sap')
       and h.created_at >= v_ini and h.created_at < v_fim
    union all
    select 'sup_cotacao', pc.criado_por, pc.created_at, 1, null, null, null, null
      from public.sup_cotacao_processos pc
     where pc.created_at >= v_ini and pc.created_at < v_fim
    union all
    select 'sup_proposta', pr.criado_por, pr.created_at, 1, null, null, null, pr.valor_total_orcamento
      from public.sup_cotacao_propostas pr
     where pr.created_at >= v_ini and pr.created_at < v_fim
    union all
    -- Item decidido no mapa de cotação (autor gravado pelo nome)
    select 'sup_mapa_decisao', coalesce(nm.id, pi.mapa_selecionado_por), pi.mapa_selecionado_em, 1, null, null, null, null
      from public.sup_cotacao_proposta_itens pi
      left join nomes nm on nm.nome = upper(btrim(pi.mapa_selecionado_por))
     where pi.mapa_selecionado_em >= v_ini and pi.mapa_selecionado_em < v_fim
    union all
    select 'sup_diligenciamento', dl.atualizado_por_id, dl.updated_at, 1, null, null, null, null
      from public.sup_diligenciamento_itens dl
     where dl.updated_at >= v_ini and dl.updated_at < v_fim
    union all
    -- Carteira aberta HOJE (não depende do período): d = idade; f = crítico (> 30 dias)
    select 'sup_carteira', cp.perfil, now(), 1,
           ((current_date - r.data_da_solicitacao) * 86400)::numeric, (current_date - r.data_da_solicitacao) > 30, null, null
      from public.sap_me5a_rc r
      join compradores cp on cp.grupo = btrim(r.grupo_de_compradores)
     where r.status_processamento in ('N', 'A') and r.data_da_solicitacao is not null
  ),
  ev as (
    -- Recebimento: conferência (q = itens conferidos)
    select 'receb_conferencia' t, c.criado_por_id::text u, c.created_at em,
           (select count(*) from public.alm_receb_conferencia_itens i where i.conferencia_id = c.id)::numeric q,
           null::numeric d, null::boolean f, null::int n
      from public.alm_receb_conferencias c
     where c.excluido_em is null and c.created_at >= v_ini and c.created_at < v_fim
    union all
    -- Recebimento: não conformidade (d = tempo até resolver)
    select 'receb_nc', nc.criado_por_id::text, nc.created_at, 1,
           extract(epoch from nc.resolvida_em - nc.created_at), nc.resolvida_em is not null, null
      from public.alm_receb_nc nc
     where nc.excluido_em is null and nc.created_at >= v_ini and nc.created_at < v_fim
    union all
    -- Recebimento: chegada registrada
    select 'chegada', ch.registrado_por_id, ch.created_at, 1, null, null, null
      from public.almoxarifado_chegadas ch
     where ch.created_at >= v_ini and ch.created_at < v_fim
    union all
    -- Cadastro de itens: novo cadastro
    select 'cadastro_item', ci.criado_por, ci.created_at, 1, null, null, null
      from public.alm_catalogo_itens ci
     where ci.created_at >= v_ini and ci.created_at < v_fim
    union all
    -- Cadastro de itens: última alteração (a tabela guarda só a mais recente)
    select 'cadastro_alteracao', ci.atualizado_por, ci.updated_at, 1, null, null, null
      from public.alm_catalogo_itens ci
     where ci.updated_at >= v_ini and ci.updated_at < v_fim
       and ci.updated_at > ci.created_at + interval '1 minute'
    union all
    -- Cadastro de itens: foto adicional
    select 'cadastro_foto', fo.criado_por, fo.created_at, 1, null, null, null
      from public.alm_catalogo_item_fotos fo
     where fo.created_at >= v_ini and fo.created_at < v_fim
    union all
    -- Inventário: contagem (d = duração da contagem; f = divergente)
    select 'inv_contagem', ct.contado_por_id::text, ct.created_at, 1,
           ct.duracao_segundos::numeric, ct.divergente, ct.numero
      from public.alm_inventario_contagens ct
     where ct.created_at >= v_ini and ct.created_at < v_fim
    union all
    -- Balcão: requisição (q = itens; d = até o doc SAP; f = já lançada no SAP)
    select 'balcao_requisicao', rq.criado_por_id::text, rq.created_at,
           (select count(*) from public.alm_req_balcao_itens it where it.requisicao_id = rq.id)::numeric,
           extract(epoch from rq.doc_sap_em - rq.created_at), rq.doc_sap_em is not null, null
      from public.alm_req_balcao rq
     where rq.excluido_em is null and rq.created_at >= v_ini and rq.created_at < v_fim
    union all
    -- Balcão: baixa lançada no SAP (autor gravado pelo nome)
    select 'balcao_baixa_sap', coalesce(nm.id, rq.doc_sap_por), rq.doc_sap_em, 1,
           extract(epoch from rq.doc_sap_em - rq.created_at), null, null
      from public.alm_req_balcao rq
      left join nomes nm on nm.nome = upper(btrim(rq.doc_sap_por))
     where rq.excluido_em is null and rq.doc_sap_em >= v_ini and rq.doc_sap_em < v_fim
    union all
    -- Balcão: retirada confirmada (autor gravado pelo nome)
    select 'balcao_confirmacao', coalesce(nm.id, rq.confirmada_por), rq.confirmada_em, 1,
           extract(epoch from rq.confirmada_em - rq.created_at), null, null
      from public.alm_req_balcao rq
      left join nomes nm on nm.nome = upper(btrim(rq.confirmada_por))
     where rq.excluido_em is null and rq.confirmada_em >= v_ini and rq.confirmada_em < v_fim
    union all
    -- Solicitação extraordinária (d = até regularizar; f = regularizada)
    select 'sol_extra', se.criado_por, se.created_at, 1,
           extract(epoch from se.regularizado_em - se.created_at), se.regularizado_em is not null, null
      from public.alm_solicitacao_extra se
     where se.excluido_em is null and se.created_at >= v_ini and se.created_at < v_fim
    union all
    select 'sol_extra_regularizacao', se.regularizado_por, se.regularizado_em, 1,
           extract(epoch from se.regularizado_em - se.created_at), null, null
      from public.alm_solicitacao_extra se
     where se.excluido_em is null and se.regularizado_em >= v_ini and se.regularizado_em < v_fim
    union all
    -- Projetos: movimento de peça
    select 'proj_movimento', pm.criado_por_id::text, pm.created_at, 1, null, null, null
      from public.proj_movimentos pm
     where pm.excluido_em is null and pm.created_at >= v_ini and pm.created_at < v_fim
    union all
    -- Uso do SISTEN por pessoa × dia: q = telas abertas, n = sessões,
    -- d = primeira → última atividade do dia (jornada no sistema)
    select 'uso_dia', o.user_id,
           (date_trunc('day', o.created_at at time zone 'America/Bahia') + interval '12 hours') at time zone 'America/Bahia',
           count(*) filter (where o.event_type = 'page_view'),
           extract(epoch from max(o.created_at) - min(o.created_at)), null,
           count(distinct o.session_id)::int
      from public.ops_eventos_uso o
     where o.created_at >= v_ini and o.created_at < v_fim and o.user_id is not null
     group by o.user_id, date_trunc('day', o.created_at at time zone 'America/Bahia')
  )
  , todos as (
    select t, u, em, q, d, f, n, null::numeric v from ev
    union all
    select t, u, em, q, d, f, n, v from ev_sup
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           't', ev.t, 'u', ev.u, 'em', ev.em, 'q', ev.q,
           'd', case when ev.d is null or ev.d < 0 then null else round(ev.d) end,
           'f', ev.f, 'n', ev.n, 'v', ev.v) order by ev.em), '[]'::jsonb)
    into v_eventos
    from todos ev
   where ev.u is not null and ev.em is not null;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id, 'nome', p.name, 'setor', p.sector_id, 'status', p.status, 'cargo', p.cargo)
           order by p.name), '[]'::jsonb)
    into v_pessoas
    from public.core_perfis p;

  return jsonb_build_object('de', p_de, 'ate', p_ate, 'pessoas', v_pessoas, 'eventos', v_eventos);
end;
$$;

revoke all on function public.adm_equipes_eventos(date, date) from public, anon;
grant execute on function public.adm_equipes_eventos(date, date) to authenticated;
