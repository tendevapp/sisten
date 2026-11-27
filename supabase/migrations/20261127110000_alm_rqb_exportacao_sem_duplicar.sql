-- Requisição no Balcão: a mesma requisição não pode ir para duas planilhas.
--
-- 27/11/2026: dois almoxarifes exportaram as mesmas 30 requisições (61 itens)
-- com 90 s de diferença. A tela do segundo mostrava a lista de antes, e
-- alm_req_balcao_registrar_exportacao trocava o exportacao_id sem conferir —
-- o primeiro lote ficou "30 reaberta(s)" e havia duas planilhas para o SAP.
--
-- Agora, depois do lock das linhas (que já serializa exportações
-- simultâneas), recusa a requisição que está noutro lote, a não ser que a
-- pessoa tenha confirmado "Exportar de novo" para ela (`p_reexportar`). O
-- XLSX só é baixado depois deste registro, então a recusa impede o arquivo.
--
-- A função interna deixa de ser chamável direto pelo app (não tinha a trava
-- nem a exigência do original) — só por esta.

drop function if exists public.alm_rqb_registrar_exportacao_original(uuid[], text, text, text, integer);

create or replace function public.alm_rqb_registrar_exportacao_original(
  p_ids uuid[], p_arquivo text, p_por text, p_original_path text, p_total_itens integer,
  p_reexportar uuid[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  lote public.alm_req_balcao_exportacoes;
  v_total_ids int;
  v_total_itens int;
  v_conflito text;
begin
  if not public.alm_rqb_pode_acessar_originais() then
    raise exception 'Sem acesso à exportação da Requisição no Balcão.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from storage.objects o
    where o.bucket_id = 'alm-rqb-exportacoes' and o.name = p_original_path
      and o.owner_id = auth.uid()::text and o.created_at > now() - interval '1 day'
  ) then
    raise exception 'Envie o XLSX original antes de registrar o lote.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_original_path, 0));
  select e.id into lote.id from public.alm_req_balcao_exportacoes e
  where e.original_path = p_original_path;
  if found then
    return lote.id;
  end if;

  -- Serializa com reabertura, edição e pedido de exportação concorrentes.
  perform r.id from public.alm_req_balcao r
    where r.id = any(p_ids) and not r.excluido order by r.id for update;
  get diagnostics v_total_ids = row_count;
  select count(*) into v_total_itens from public.alm_req_balcao_itens
    where requisicao_id = any(p_ids);
  if v_total_ids = 0 or v_total_ids <> cardinality(p_ids)
    or v_total_itens = 0 or v_total_itens is distinct from p_total_itens then
    raise exception 'A seleção mudou durante a exportação. Atualize a lista e tente de novo.';
  end if;

  -- Já está noutro lote e a pessoa não pediu para exportar de novo: outra
  -- pessoa exportou enquanto a lista dela estava aberta.
  select string_agg(format('%s (lote %s, %s às %s)', g.codigos, g.arquivo, coalesce(g.por, '?'), g.quando), '; ')
    into v_conflito
    from (
      select e.arquivo, e.exportado_por_nome as por,
             to_char(e.created_at at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') as quando,
             string_agg(r.codigo, ', ' order by r.codigo) as codigos
        from public.alm_req_balcao r
        join public.alm_req_balcao_exportacoes e on e.id = r.exportacao_id
       where r.id = any(p_ids) and not r.excluido
         and not (r.id = any(coalesce(p_reexportar, '{}')))
       group by e.arquivo, e.exportado_por_nome, e.created_at
    ) g;
  if v_conflito is not null then
    raise exception 'Já exportadas por outra pessoa — não lance esta seleção no SAP: %. Atualize a lista.', v_conflito
      using errcode = 'P0001';
  end if;

  lote := public.alm_req_balcao_registrar_exportacao(p_ids, p_arquivo, p_por);
  update public.alm_req_balcao_exportacoes set original_path = p_original_path where id = lote.id;
  return lote.id;
end;
$function$;

revoke all on function public.alm_rqb_registrar_exportacao_original(uuid[], text, text, text, integer, uuid[]) from public, anon;
grant execute on function public.alm_rqb_registrar_exportacao_original(uuid[], text, text, text, integer, uuid[]) to authenticated, service_role;

revoke execute on function public.alm_req_balcao_registrar_exportacao(uuid[], text, text) from authenticated;
