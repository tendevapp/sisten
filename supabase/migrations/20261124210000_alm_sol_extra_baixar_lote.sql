-- Geral › Pendências: baixa em lote das retiradas sem saldo (RSS) que a
-- ZL0024 já cobre. Antes era uma a uma: abrir a Requisição no Balcão pendente,
-- conferir depósito e PEP e confirmar (24/11/2026: 89 prontas, 77 delas a
-- mesma luva, 1 par cada).
--
-- Mesmas regras do 1 a 1: cada requisição é confirmada pela própria
-- `alm_req_balcao_salvar` (valida saldo, grava log, regulariza a RSS, confere
-- EPI). Antes, `alm_req_balcao_atualizar_saldos` reparte o saldo da ZL0024 de
-- hoje entre as pendentes (mais antiga primeiro, um depósito por item) — a
-- regra do selo "Já pode regularizar"; item que ficou sem saldo nessa
-- partilha não é confirmado.
--
-- Uma falha não derruba as outras (cada requisição em seu bloco). PEP vazio
-- recebe o PEP do lote (`p_pep`), quando informado.

create or replace function public.alm_sol_extra_baixar_lote(
  p_rss text[],
  p_pep text default null,
  p_por text default null
)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
set statement_timeout = '120s'
as $$
declare
  v_uid text := (auth.uid())::text;
  v_pep text := nullif(upper(btrim(p_pep)), '');
  v_pep_nome text;
  v_por text;
  v_r public.alm_req_balcao;
  v_res jsonb := '[]'::jsonb;
  v_req jsonb;
  v_itens jsonb;
  v_falta text;
  v_sem_pep boolean;
  v_pep_req text;
begin
  if v_uid is null then
    raise exception 'Sessão expirada. Entre novamente.';
  end if;
  if not exists (select 1 from public.core_perfis
                  where id = v_uid and ('admin' = any(roles) or sector_id = '2')) then
    raise exception 'Só o Almoxarifado (ou um admin) dá baixa nas retiradas sem saldo.';
  end if;
  if coalesce(array_length(p_rss, 1), 0) = 0 then
    return '[]'::jsonb;
  end if;
  if coalesce(array_length(p_rss, 1), 0) > 300 then
    raise exception 'Lote grande demais (máximo 300 retiradas por vez).';
  end if;
  if v_pep is not null then
    select nome into v_pep_nome from public.alm_balcao_aplicacoes where wbs = v_pep and ativo;
    if v_pep_nome is null then
      raise exception 'O PEP % não está na lista de aplicações do balcão.', v_pep;
    end if;
  end if;
  v_por := coalesce(nullif(btrim(p_por), ''), (select name from public.core_perfis where id = v_uid));

  -- Um lote por vez: dois lotes juntos contariam o mesmo saldo.
  perform pg_advisory_xact_lock(hashtext('alm_sol_extra_baixar_lote'));
  perform public.alm_req_balcao_atualizar_saldos();

  -- Retirada sem requisição (não deveria acontecer: o gatilho cria).
  select v_res || coalesce(jsonb_agg(jsonb_build_object('rss', c, 'ok', false,
           'erro', 'Requisição no Balcão da retirada não encontrada — use o "Dar baixa" individual.')), '[]'::jsonb)
    into v_res
    from unnest(p_rss) c
   where not exists (select 1 from public.alm_req_balcao r
                      where r.origem = 'sol_extra_sem_saldo' and r.origem_ref = c and not r.excluido);

  for v_r in
    select r.* from public.alm_req_balcao r
     where r.origem = 'sol_extra_sem_saldo' and r.origem_ref = any(p_rss) and not r.excluido
     order by r.data, r.created_at
  loop
    begin
      if not v_r.pendente_confirmacao then
        v_res := v_res || jsonb_build_object('rss', v_r.origem_ref, 'rqb', v_r.codigo, 'ok', false,
          'erro', 'A requisição já estava confirmada.');
        continue;
      end if;

      select string_agg(format('%s (precisa %s, saldo %s no %s)', i.material, i.quantidade,
                               coalesce(i.saldo_zl0024, 0), i.deposito), '; ')
        into v_falta
        from public.alm_req_balcao_itens i
       where i.requisicao_id = v_r.id and coalesce(i.sem_saldo, false);
      if v_falta is not null then
        v_res := v_res || jsonb_build_object('rss', v_r.origem_ref, 'rqb', v_r.codigo, 'ok', false,
          'erro', 'Sem saldo na ZL0024 de hoje: ' || v_falta);
        continue;
      end if;

      v_pep_req := nullif(upper(btrim(v_r.aplicacao_pep)), '');
      v_sem_pep := v_r.tipo_movimento = 'saida' and v_pep_req is null and exists (
        select 1 from public.alm_req_balcao_itens i
         where i.requisicao_id = v_r.id and nullif(btrim(i.aplicacao_pep), '') is null);
      if v_sem_pep and v_pep is null then
        v_res := v_res || jsonb_build_object('rss', v_r.origem_ref, 'rqb', v_r.codigo, 'ok', false,
          'erro', 'Sem PEP — escolha o PEP do lote.');
        continue;
      end if;

      v_req := jsonb_build_object(
        'data', v_r.data,
        'turno', v_r.turno,
        'tipo_movimento', v_r.tipo_movimento,
        'deposito_origem', (select i.deposito from public.alm_req_balcao_itens i
                             where i.requisicao_id = v_r.id order by i.ordem limit 1),
        'deposito_destino', v_r.deposito_destino,
        'colaborador_id', v_r.colaborador_id,
        'colaborador_nome', v_r.colaborador_nome,
        'colaborador_registro', v_r.colaborador_registro,
        'aplicacao_pep', coalesce(v_pep_req, v_pep),
        'aplicacao', case when v_pep_req is not null then v_r.aplicacao else v_pep_nome end,
        'observacao', v_r.observacao,
        'criado_por_nome', v_por,
        'confirmar', true);

      select jsonb_agg(jsonb_build_object(
               'material', i.material,
               'quantidade', i.quantidade,
               'descricao', i.descricao,
               'unidade', i.unidade,
               'deposito', i.deposito,
               'deposito_destino', i.deposito_destino,
               'aplicacao_pep', coalesce(nullif(upper(btrim(i.aplicacao_pep)), ''), v_pep_req, v_pep),
               'aplicacao', case when nullif(btrim(i.aplicacao_pep), '') is not null then i.aplicacao end)
             order by i.ordem)
        into v_itens
        from public.alm_req_balcao_itens i
       where i.requisicao_id = v_r.id;

      perform public.alm_req_balcao_salvar(v_r.id, v_req, v_itens);
      perform public.alm_req_balcao_log(v_r.id, 'edicao', '[]'::jsonb,
        format('Confirmada na baixa em lote (Pendências) por %s.', v_por), v_por);

      v_res := v_res || jsonb_build_object('rss', v_r.origem_ref, 'rqb', v_r.codigo, 'id', v_r.id, 'ok', true);
    exception when others then
      v_res := v_res || jsonb_build_object('rss', v_r.origem_ref, 'rqb', v_r.codigo, 'ok', false, 'erro', sqlerrm);
    end;
  end loop;

  return v_res;
end;
$$;

revoke all on function public.alm_sol_extra_baixar_lote(text[], text, text) from public, anon;
grant execute on function public.alm_sol_extra_baixar_lote(text[], text, text) to authenticated;
