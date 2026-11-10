-- =====================================================================
-- Almoxarifado: contingências que protegem o inventário contábil.
--
-- Toda saída física (Extraordinária de Projeto SEM, Retirada sem saldo RSS,
-- Ficha de EPI) só chega ao SAP pela Requisição no Balcão (RQB) exportada e
-- com documento SAP. Se um elo some no meio — requisição excluída, gerada com
-- falha, confirmada com quantidade diferente, exportada e nunca lançada — a
-- ZL0024 fica com saldo a mais e o inventário diverge sem explicação.
--
-- Levantamento de 10/11/2026 que motivou isto:
--   - RSS-041126-28 pendente com a RQB-041126-01 excluída;
--   - 18 Fichas de EPI entregues sem requisição viva (17 com a RQB excluída
--     sem motivo, 1 que nunca gerou);
--   - 4 retiradas com quantidade/material diferente da requisição confirmada
--     (RSS-051126-50: retirou 3, requisição lançou 75);
--   - ~120 RQBs exportadas sem documento SAP (70 do lote de 01/10).
--
-- O que esta migration faz:
--   1. Log da Solicitação Extraordinária (alm_sol_extra_alteracoes), por
--      trigger, com campo/de/para — a RQB já tinha o dela.
--   2. Exclusão da RQB com trava: a de uma retirada viva é recusada (exclua a
--      retirada, a requisição sai junto); a de Ficha de EPI entregue exige
--      motivo. O motivo vai para o log.
--   3. Falha ao sincronizar RSS → RQB deixa de ser só um WARNING: grava evento
--      e avisa os administradores.
--   4. alm_contingencias_verificar(): verificações de integridade do fluxo,
--      com severidade e ação sugerida. Tratativa (justificativa) tira o achado
--      da lista sem apagá-lo; correção automática onde ela é segura.
--   5. Inventário: contagem divergente grava e devolve as movimentações do
--      material ainda sem baixa no SAP (só códigos, sem quantidade — a
--      contagem continua cega).
--   6. Aviso diário: a cada importação da ZL0024 os responsáveis recebem uma
--      notificação com o total de críticas/altas em aberto (1 por dia).
--
-- Acesso: feature flag `alm_contingencias` (regra 4 do CLAUDE.md: nasce só
-- admin; o almoxarifado recebe pela Gestão de Acessos).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Quem trata as contingências
-- ---------------------------------------------------------------------
create or replace function public.alm_contingencia_pode()
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists(
    select 1 from public.profiles p
     where p.id = auth.uid()::text
       and coalesce(p.status, 'ativo') = 'ativo'
       and ('admin' = any(p.roles) or p.page_access->>'alm_contingencias' = 'true'));
$$;

-- ---------------------------------------------------------------------
-- 1. Log da Solicitação Extraordinária
-- ---------------------------------------------------------------------
create table if not exists public.alm_sol_extra_alteracoes (
  id uuid primary key default gen_random_uuid(),
  solicitacao_id uuid not null references public.alm_solicitacao_extra(id) on delete cascade,
  codigo text,
  acao text not null,
  alteracoes jsonb not null default '[]'::jsonb,
  resumo text,
  alterado_por_id text,
  alterado_por_nome text,
  created_at timestamptz not null default now()
);
create index if not exists alm_sol_extra_alteracoes_sol_idx on public.alm_sol_extra_alteracoes (solicitacao_id, created_at);
create index if not exists alm_sol_extra_alteracoes_codigo_idx on public.alm_sol_extra_alteracoes (codigo);
alter table public.alm_sol_extra_alteracoes enable row level security;
revoke all on public.alm_sol_extra_alteracoes from anon, authenticated;
-- Leitura pela RPC alm_contingencia_historico (security definer).

create or replace function public.alm_sol_extra_registrar_log()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  -- Fotos e assinatura ficam de fora (base64/listas grandes); entram como "alterado".
  v_campos text[] := array['data','hora','turno','projeto','tramo','itens','motivo','motivo_detalhe','area_reparada_m2',
    'rugosidade_um','observacao','status','doc_sap','regularizacao_obs','retirante_nome','retirante_matricula',
    'setor_solicitante_nome','aprovacao_status','aprovacao_obs','requisicao_balcao_codigo','aplicacao_pep','aplicacao','excluido_em'];
  v_old jsonb;
  v_new jsonb := to_jsonb(new);
  v_diff jsonb := '[]'::jsonb;
  c text;
  v_acao text;
  v_uid text := auth.uid()::text;
  v_nome text;
  v_resumo text;
begin
  begin
    if tg_op = 'UPDATE' then
      v_old := to_jsonb(old);
      foreach c in array v_campos loop
        if v_old->c is distinct from v_new->c then
          v_diff := v_diff || jsonb_build_array(jsonb_build_object('campo', c, 'de', v_old->c, 'para', v_new->c));
        end if;
      end loop;
      if new.fotos is distinct from old.fotos then
        v_diff := v_diff || jsonb_build_array(jsonb_build_object('campo', 'fotos',
          'de', jsonb_array_length(coalesce(old.fotos, '[]'::jsonb)), 'para', jsonb_array_length(coalesce(new.fotos, '[]'::jsonb))));
      end if;
      if new.assinatura_retirante is distinct from old.assinatura_retirante then
        v_diff := v_diff || jsonb_build_array(jsonb_build_object('campo', 'assinatura_retirante',
          'de', old.assinatura_retirante is not null, 'para', new.assinatura_retirante is not null));
      end if;
      if jsonb_array_length(v_diff) = 0 then
        return null;
      end if;
      v_acao := case
        when new.excluido_em is not null and old.excluido_em is null then 'exclusao'
        when new.excluido_em is null and old.excluido_em is not null then 'restauracao'
        when new.status is distinct from old.status and new.status = 'REGULARIZADA' then 'regularizacao'
        when new.status is distinct from old.status then 'status'
        when new.aprovacao_status is distinct from old.aprovacao_status then 'aprovacao'
        else 'edicao' end;
      select string_agg(x->>'campo', ', ') into v_resumo from jsonb_array_elements(v_diff) x;
      v_resumo := case v_acao
        when 'exclusao' then 'Excluída (permanece no banco).'
        when 'restauracao' then 'Restaurada.'
        when 'regularizacao' then format('Regularizada%s.', coalesce(' — doc. SAP ' || nullif(new.doc_sap, ''), coalesce(' pela ' || new.requisicao_balcao_codigo, '')))
        when 'aprovacao' then format('Aprovação: %s.', lower(coalesce(new.aprovacao_status, '-')))
        else 'Campos alterados: ' || v_resumo || '.' end;
    else
      v_acao := 'criacao';
      v_resumo := format('Registrada com %s item(ns).', jsonb_array_length(coalesce(new.itens, '[]'::jsonb)));
    end if;

    select name into v_nome from public.profiles where id = v_uid;
    insert into public.alm_sol_extra_alteracoes (solicitacao_id, codigo, acao, alteracoes, resumo, alterado_por_id, alterado_por_nome)
    values (new.id, new.codigo, v_acao, v_diff, v_resumo, v_uid,
            coalesce(v_nome, case when tg_op = 'INSERT' then new.criado_por_nome end));
  exception when others then
    -- O log nunca trava o formulário.
    raise warning 'alm_sol_extra: falha ao gravar o log de %: %', new.codigo, sqlerrm;
  end;
  return null;
end;
$$;

drop trigger if exists trg_alm_sol_extra_log on public.alm_solicitacao_extra;
create trigger trg_alm_sol_extra_log
  after insert or update on public.alm_solicitacao_extra
  for each row execute function public.alm_sol_extra_registrar_log();

-- ---------------------------------------------------------------------
-- 2. Tratativas e eventos das contingências
-- ---------------------------------------------------------------------
create table if not exists public.alm_contingencias_tratativas (
  id uuid primary key default gen_random_uuid(),
  verificacao text not null,
  referencia text not null,
  justificativa text not null,
  tratado_por_id text,
  tratado_por_nome text,
  created_at timestamptz not null default now(),
  revogada_em timestamptz,
  revogada_por_nome text,
  revogacao_motivo text
);
create unique index if not exists alm_contingencias_tratativas_ativa_uidx
  on public.alm_contingencias_tratativas (verificacao, referencia) where revogada_em is null;
alter table public.alm_contingencias_tratativas enable row level security;
revoke all on public.alm_contingencias_tratativas from anon, authenticated;

create table if not exists public.alm_contingencias_eventos (
  id uuid primary key default gen_random_uuid(),
  acao text not null,           -- justificativa | reabertura | correcao | falha_sincronizacao
  verificacao text,
  referencia text,
  resumo text,
  detalhe jsonb,
  por_id text,
  por_nome text,
  created_at timestamptz not null default now()
);
create index if not exists alm_contingencias_eventos_ref_idx on public.alm_contingencias_eventos (referencia, created_at);
alter table public.alm_contingencias_eventos enable row level security;
revoke all on public.alm_contingencias_eventos from anon, authenticated;

-- Grava um evento e avisa os administradores. Nunca levanta erro.
create or replace function public.alm_contingencia_registrar_falha(p_verificacao text, p_referencia text, p_erro text)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  begin
    insert into public.alm_contingencias_eventos (acao, verificacao, referencia, resumo, detalhe, por_id)
    values ('falha_sincronizacao', p_verificacao, p_referencia,
            format('Falha automática em %s: %s', p_referencia, p_erro), jsonb_build_object('erro', p_erro), auth.uid()::text);
    insert into public.core_notificacoes (id, user_id, title, description, type, is_read, created_at, context_key)
    select 'n_' || replace(gen_random_uuid()::text, '-', ''), p.id,
           'Almoxarifado: falha ao gerar requisição',
           format('%s — a Requisição no Balcão não foi atualizada automaticamente (%s). Veja em Pendências › Contingências.', p_referencia, left(p_erro, 160)),
           'warning', false, now(), '/pendencias?aba=contingencias'
      from public.profiles p
     where coalesce(p.status, 'ativo') = 'ativo' and 'admin' = any(p.roles);
  exception when others then
    raise warning 'alm_contingencia_registrar_falha: %', sqlerrm;
  end;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. Sincronização RSS → RQB: a falha agora fica registrada
-- (corpo igual ao de 20261030100000; só o bloco de exceção mudou)
-- ---------------------------------------------------------------------
create or replace function public.alm_sol_extra_sincronizar_rqb()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $function$
declare
  v_rqb public.alm_req_balcao;
  v_manter jsonb;
  v_pep text;
  v_aplicacao text;
begin
  if new.tipo <> 'SEM_SALDO' then
    return new;
  end if;
  begin
    if tg_op = 'INSERT' then
      perform public.alm_sol_extra_criar_rqb(new);
      return new;
    end if;

    select * into v_rqb from public.alm_req_balcao
     where origem = 'sol_extra_sem_saldo' and origem_ref = new.codigo and not excluido and pendente_confirmacao
     limit 1;
    if not found then
      return new;
    end if;

    if new.excluido_em is not null and old.excluido_em is null then
      update public.alm_req_balcao set excluido = true, excluido_em = now(), excluido_por = new.excluido_por, updated_at = now() where id = v_rqb.id;
      perform public.alm_req_balcao_log(v_rqb.id, 'exclusao', '[]'::jsonb, format('Excluída junto com a retirada sem saldo %s.', new.codigo), null);
      return new;
    elsif new.itens is distinct from old.itens
       or new.retirante_nome is distinct from old.retirante_nome
       or new.retirante_id is distinct from old.retirante_id then
      select coalesce(jsonb_object_agg(material, jsonb_build_object('deposito', deposito, 'deposito_destino', deposito_destino,
                                                                    'aplicacao_pep', aplicacao_pep, 'aplicacao', aplicacao)), '{}'::jsonb)
        into v_manter from public.alm_req_balcao_itens where requisicao_id = v_rqb.id;
      perform public.alm_sol_extra_itens_rqb(new.itens, v_rqb.id, v_manter);
      update public.alm_req_balcao set
        colaborador_id = new.retirante_id, colaborador_nome = upper(trim(new.retirante_nome)),
        colaborador_registro = new.retirante_matricula, updated_at = now()
       where id = v_rqb.id;
      perform public.alm_req_balcao_log(v_rqb.id, 'edicao', '[]'::jsonb, format('Itens/colaborador atualizados a partir da retirada %s.', new.codigo), null);
    end if;

    -- Transferência não tem PEP: a troca de PEP na RSS só vale para a RQB de saída.
    if v_rqb.tipo_movimento = 'saida' then
      v_pep := nullif(trim(new.aplicacao_pep), '');
      v_aplicacao := coalesce(nullif(trim(new.aplicacao), ''), 'A definir na confirmação');
      if new.aplicacao_pep is distinct from old.aplicacao_pep or new.aplicacao is distinct from old.aplicacao then
        update public.alm_req_balcao set aplicacao_pep = v_pep, aplicacao = v_aplicacao, updated_at = now() where id = v_rqb.id;
        update public.alm_req_balcao_itens set aplicacao_pep = v_pep, aplicacao = v_aplicacao where requisicao_id = v_rqb.id;
        perform public.alm_req_balcao_log(v_rqb.id, 'edicao',
          jsonb_build_array(jsonb_build_object('campo', 'aplicacao_pep', 'de', old.aplicacao_pep, 'para', v_pep)),
          format('PEP atualizado a partir da retirada %s.', new.codigo), null);
      elsif v_pep is not null and new.itens is distinct from old.itens then
        update public.alm_req_balcao_itens set aplicacao_pep = v_pep, aplicacao = v_aplicacao
         where requisicao_id = v_rqb.id and aplicacao_pep is null;
      end if;
    end if;
  exception when others then
    raise warning 'alm_sol_extra: falha ao sincronizar a requisição no balcão de %: %', new.codigo, sqlerrm;
    perform public.alm_contingencia_registrar_falha(
      case when tg_op = 'INSERT' then 'rss_sem_requisicao' else 'rss_itens_divergentes' end, new.codigo, sqlerrm);
  end;
  return new;
end;
$function$;

-- ---------------------------------------------------------------------
-- 4. Exclusão da RQB com trava e motivo
-- ---------------------------------------------------------------------
-- O log da RQB passa a aceitar a restauração feita pelas Contingências.
alter table public.alm_req_balcao_alteracoes drop constraint if exists alm_req_balcao_alteracoes_acao_check;
alter table public.alm_req_balcao_alteracoes add constraint alm_req_balcao_alteracoes_acao_check check (acao in
  ('criacao','edicao','exclusao','doc_sap','exportacao','reabertura','importacao_sap','restauracao'));

drop function if exists public.alm_req_balcao_excluir(uuid, text);
create function public.alm_req_balcao_excluir(p_id uuid, p_por text, p_motivo text default null)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_r public.alm_req_balcao;
  v_motivo text := nullif(trim(coalesce(p_motivo, '')), '');
  v_rss text;
  v_ficha text;
begin
  select * into v_r from public.alm_req_balcao where id = p_id and not excluido;
  if not found then
    raise exception 'Requisição não encontrada.';
  end if;
  if not v_r.pendente_confirmacao and not public.form_pode_editar(v_r.criado_por_id::text) then
    raise exception 'Só quem registrou a requisição (ou um admin) pode excluí-la.';
  end if;

  if v_r.origem = 'sol_extra_sem_saldo' then
    select codigo into v_rss from public.alm_solicitacao_extra
     where codigo = v_r.origem_ref and tipo = 'SEM_SALDO' and excluido_em is null;
    if v_rss is not null then
      raise exception 'A % dá a baixa da retirada sem saldo % — o material já saiu do almoxarifado. Para cancelar, exclua a retirada % (a requisição sai junto).',
        v_r.codigo, v_rss, v_rss using errcode = '42501';
    end if;
  elsif v_r.origem = 'ficha_epi' then
    select codigo into v_ficha from public.ssma_fichas_epi
     where codigo = v_r.origem_ref and status <> 'CANCELADA';
    if v_ficha is not null and length(coalesce(v_motivo, '')) < 10 then
      raise exception 'O EPI da ficha % foi entregue: sem a % a saída não chega ao SAP. Informe o motivo da exclusão (mínimo 10 caracteres).',
        v_ficha, v_r.codigo using errcode = '22023';
    end if;
  end if;

  update public.alm_req_balcao
     set excluido = true, excluido_em = now(), excluido_por = p_por
   where id = p_id;
  perform public.alm_req_balcao_log(p_id, 'exclusao',
    case when v_motivo is null then '[]'::jsonb
         else jsonb_build_array(jsonb_build_object('campo', 'motivo', 'de', null, 'para', v_motivo)) end,
    'Excluída (permanece no banco).' || coalesce(' Motivo: ' || v_motivo, ''), p_por);
end;
$$;
revoke all on function public.alm_req_balcao_excluir(uuid, text, text) from public, anon;
grant execute on function public.alm_req_balcao_excluir(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 5. Verificações
-- ---------------------------------------------------------------------
-- Prazos (dias corridos) — mudar aqui muda a lista e o aviso diário:
--   RSS aguardando NF ........... 10 (média) / 20 (alta)
--   SEM de Projeto pendente ...... 5 (média) / 15 (alta)
--   RQB de EPI sem confirmação ... 2 (média) / 7 (alta)
--   RQB confirmada não exportada . 2 (média) / 5 (alta)
--   RQB exportada sem doc SAP .... 3 (alta)  / 10 (crítica)
-- Fichas de EPI: só as digitais criadas a partir de 02/10/2026 (início da
-- requisição automática); as importadas do legado não geram requisição.
create or replace function public.alm_contingencias_achados()
returns table(verificacao text, severidade text, entidade text, referencia text, ref_id uuid, data date, dias int,
              titulo text, detalhe text, acao text, acao_ref text)
language sql stable security definer
set search_path = public, pg_temp
as $$
  with
  rqb_viva as (select * from public.alm_req_balcao where not excluido),
  rss_itens as (
    select s.codigo, ltrim(upper(trim(x->>'material')), '0') mat, sum(nullif(x->>'quantidade', '')::numeric) q
      from public.alm_solicitacao_extra s cross join jsonb_array_elements(coalesce(s.itens, '[]'::jsonb)) x
     where s.tipo = 'SEM_SALDO' and s.excluido_em is null
     group by 1, 2),
  rqb_itens as (
    select r.origem_ref codigo, ltrim(upper(trim(i.material)), '0') mat, sum(i.quantidade) q
      from rqb_viva r join public.alm_req_balcao_itens i on i.requisicao_id = r.id
     where r.origem = 'sol_extra_sem_saldo'
     group by 1, 2),
  -- Por retirada (não por requisição): material só de um dos lados também conta.
  divergencias_rss as (
    select coalesce(a.codigo, b.codigo) codigo,
           string_agg(format('%s: retirada %s × requisição %s', coalesce(a.mat, b.mat),
                             coalesce(trim_scale(a.q)::text, '—'), coalesce(trim_scale(b.q)::text, '—')), '; '
                      order by coalesce(a.mat, b.mat)) lista
      from rss_itens a
      full join rqb_itens b on a.codigo = b.codigo and a.mat = b.mat
     where a.q is null or b.q is null or round(a.q, 3) <> round(b.q, 3)
     group by 1),
  fichas as (
    select f.*, (select count(*) from public.ssma_fichas_epi_itens i where i.ficha_id = f.id and coalesce(trim(i.codigo_sap), '') <> '') itens_sap
      from public.ssma_fichas_epi f
     where f.origem = 'DIGITAL' and f.created_at >= '2026-10-02'
       and not exists (select 1 from public.ssma_fichas_epi_import_legado l where l.ficha_id = f.id)),
  achados as (
    -- Retirada sem saldo pendente sem a requisição que daria a baixa.
    select 'rss_sem_requisicao'::text v, 'critica'::text sev, 'sol_extra'::text ent, s.codigo ref, s.id rid, s.data dt,
           'Retirada sem saldo sem Requisição no Balcão'::text tit,
           format('%s está pendente, mas a requisição que daria a baixa %s. O material saiu e a saída não vai chegar ao SAP.',
                  s.codigo, coalesce((select 'foi excluída (' || string_agg(r.codigo || coalesce(' por ' || r.excluido_por, ''), ', ') || ')'
                                        from public.alm_req_balcao r where r.origem = 'sol_extra_sem_saldo' and r.origem_ref = s.codigo and r.excluido),
                                     'não foi gerada')) det,
           'recriar_rqb'::text ac, null::text acref
      from public.alm_solicitacao_extra s
     where s.tipo = 'SEM_SALDO' and s.excluido_em is null and s.status = 'PENDENTE' and s.codigo is not null
       and not exists (select 1 from rqb_viva r where r.origem = 'sol_extra_sem_saldo' and r.origem_ref = s.codigo)

    union all
    -- Requisição já confirmada, retirada ainda pendente.
    select 'rss_nao_regularizada', 'alta', 'sol_extra', s.codigo, s.id, s.data,
           'Requisição confirmada, retirada ainda pendente',
           format('A %s já foi confirmada, mas a retirada %s continua pendente em Pendências.', r.codigo, s.codigo),
           'regularizar_rss', r.codigo
      from rqb_viva r
      join public.alm_solicitacao_extra s on s.codigo = r.origem_ref and s.tipo = 'SEM_SALDO' and s.excluido_em is null
     where r.origem = 'sol_extra_sem_saldo' and not r.pendente_confirmacao and s.status = 'PENDENTE'

    union all
    -- Retirada regularizada apontando para requisição que não existe mais.
    select 'rss_regularizada_sem_requisicao', 'critica', 'sol_extra', s.codigo, s.id, s.data,
           'Retirada regularizada sem requisição',
           format('%s consta como regularizada pela %s, que %s. Confira no SAP se a saída foi lançada.',
                  s.codigo, coalesce(s.requisicao_balcao_codigo, '(sem código)'),
                  case when exists (select 1 from public.alm_req_balcao r where r.codigo = s.requisicao_balcao_codigo) then 'foi excluída' else 'não existe' end),
           null, null
      from public.alm_solicitacao_extra s
     where s.tipo = 'SEM_SALDO' and s.status = 'REGULARIZADA' and s.excluido_em is null
       and not exists (select 1 from rqb_viva r where r.codigo = s.requisicao_balcao_codigo)

    union all
    -- O que saiu (retirada) ≠ o que vai ao SAP (requisição).
    select 'rss_itens_divergentes', 'alta', 'req_balcao', r.codigo, r.id, r.data,
           'Requisição diferente da retirada',
           format('A %s não bate com a retirada %s — %s. Se a correção foi intencional, justifique; senão, ajuste a requisição.', r.codigo, d.codigo, d.lista),
           null, d.codigo
      from divergencias_rss d
      join lateral (
        select r.codigo, r.id, r.data from rqb_viva r
         where r.origem = 'sol_extra_sem_saldo' and r.origem_ref = d.codigo
         order by r.created_at desc limit 1) r on true
     where exists (select 1 from public.alm_solicitacao_extra s where s.codigo = d.codigo and s.tipo = 'SEM_SALDO' and s.excluido_em is null)

    union all
    -- Retirada excluída, requisição ainda valendo.
    select 'rss_excluida_requisicao_viva', 'alta', 'req_balcao', r.codigo, r.id, r.data,
           'Requisição de retirada excluída',
           format('A retirada %s foi excluída, mas a %s continua valendo. Se o material voltou, exclua a requisição; se saiu, justifique.', s.codigo, r.codigo),
           null, s.codigo
      from rqb_viva r
      join public.alm_solicitacao_extra s on s.codigo = r.origem_ref and s.excluido_em is not null
     where r.origem = 'sol_extra_sem_saldo'
       and not exists (select 1 from public.alm_solicitacao_extra s2 where s2.codigo = r.origem_ref and s2.excluido_em is null)

    union all
    -- EPI entregue sem requisição viva.
    select 'epi_sem_requisicao', 'critica', 'ficha_epi', f.codigo, f.id, f.data_entrega,
           'EPI entregue sem Requisição no Balcão',
           format('A ficha %s (%s) entregou %s item(ns) com código SAP, mas %s.%s',
                  f.codigo, f.nome, f.itens_sap,
                  coalesce('a requisição foi excluída (' || x.lista || ')', 'nenhuma requisição foi gerada'),
                  coalesce(' Possível substituta: ' || sub.lista || ' — confira antes de restaurar.', '')),
           case when x.ultima is not null then 'restaurar_rqb' end, x.ultima
      from fichas f
      left join lateral (
        select string_agg(r.codigo || coalesce(' por ' || r.excluido_por, ''), ', ' order by r.excluido_em) lista,
               (array_agg(r.codigo order by r.excluido_em desc) filter (where r.exportacao_id is null))[1] ultima
          from public.alm_req_balcao r
         where r.origem = 'ficha_epi' and r.origem_ref = f.codigo and r.excluido) x on true
      left join lateral (
        select string_agg(distinct r.codigo, ', ') lista
          from rqb_viva r
          join public.alm_req_balcao_itens i on i.requisicao_id = r.id
          join public.ssma_fichas_epi_itens fi on fi.ficha_id = f.id and ltrim(trim(fi.codigo_sap), '0') = ltrim(trim(i.material), '0')
         where (r.colaborador_id = f.pessoa_id or r.colaborador_registro = f.registro)
           and r.data between f.data_entrega - 3 and f.data_entrega + 3) sub on true
     where f.status = 'ATIVA' and f.itens_sap > 0
       and not exists (select 1 from rqb_viva r where r.origem = 'ficha_epi' and r.origem_ref = f.codigo)
       and not exists (select 1 from public.alm_solicitacao_extra s where s.origem_ref = f.codigo and s.excluido_em is null)

    union all
    -- Ficha cancelada, requisição ainda valendo.
    select 'epi_cancelada_requisicao_viva', 'alta', 'req_balcao', r.codigo, r.id, r.data,
           'Ficha de EPI cancelada com requisição',
           format('A ficha %s foi cancelada, mas a %s continua valendo%s.', r.origem_ref, r.codigo,
                  case when coalesce(nullif(r.doc_sap, ''), '') <> '' then ' e já tem doc. SAP ' || r.doc_sap || ' — peça o estorno no SAP'
                       else ' — exclua a requisição se o EPI voltou ao estoque' end),
           null, r.origem_ref
      from rqb_viva r
      join public.ssma_fichas_epi f on f.codigo = r.origem_ref and f.status = 'CANCELADA'
     where r.origem = 'ficha_epi'

    union all
    -- Requisição de EPI esperando confirmação.
    select 'rqb_aguardando_confirmacao', case when current_date - r.data > 7 then 'alta' else 'media' end, 'req_balcao', r.codigo, r.id, r.data,
           'Requisição de EPI aguardando confirmação',
           format('%s, gerada pela ficha %s, está há %s dias sem confirmação — o EPI saiu, a baixa não foi exportada.', r.codigo, r.origem_ref, current_date - r.data),
           null, r.origem_ref
      from rqb_viva r
     where r.pendente_confirmacao and r.origem = 'ficha_epi' and current_date - r.data > 2

    union all
    -- Confirmada e não exportada.
    -- Conta da confirmação (a de retirada nasce com a data da retirada e fica dias pendente).
    select 'rqb_nao_exportada', case when current_date - coalesce(r.confirmada_em::date, r.data) > 5 then 'alta' else 'media' end,
           'req_balcao', r.codigo, r.id, coalesce(r.confirmada_em::date, r.data),
           'Requisição não exportada para o SAP',
           format('%s está confirmada há %s dias e ainda não foi exportada.', r.codigo, current_date - coalesce(r.confirmada_em::date, r.data)),
           null, null
      from rqb_viva r
     where not r.pendente_confirmacao and r.exportacao_id is null and current_date - coalesce(r.confirmada_em::date, r.data) > 2

    union all
    -- Exportada e sem documento SAP.
    select 'rqb_exportada_sem_doc', case when current_date - e.created_at::date > 10 then 'critica' else 'alta' end, 'req_balcao', r.codigo, r.id, r.data,
           'Exportada sem documento SAP',
           format('%s foi exportada em %s (%s) e o documento SAP não voltou. Lance no SAP e importe a planilha concluída, ou informe o doc.',
                  r.codigo, to_char(e.created_at at time zone 'America/Bahia', 'DD/MM/YYYY'), e.arquivo),
           null, e.arquivo
      from rqb_viva r
      join public.alm_req_balcao_exportacoes e on e.id = r.exportacao_id
     where coalesce(nullif(r.doc_sap, ''), '') = '' and current_date - e.created_at::date > 3

    union all
    -- Documento SAP em parte dos itens.
    select 'rqb_doc_parcial', 'alta', 'req_balcao', r.codigo, r.id, r.data,
           'Documento SAP em parte dos itens',
           format('%s tem doc. SAP %s, mas %s de %s item(ns) ficaram sem documento: %s.', r.codigo, r.doc_sap, p.sem_doc, p.total, p.materiais),
           null, null
      from rqb_viva r
      join lateral (
        select count(*) total, count(*) filter (where coalesce(nullif(i.doc_sap, ''), '') = '') sem_doc,
               string_agg(i.material, ', ') filter (where coalesce(nullif(i.doc_sap, ''), '') = '') materiais
          from public.alm_req_balcao_itens i where i.requisicao_id = r.id) p on true
     where coalesce(nullif(r.doc_sap, ''), '') <> '' and p.sem_doc > 0

    union all
    -- Extraordinária de Projeto (regularizada à mão com doc SAP).
    select 'sem_aguardando_regularizacao', case when current_date - s.data > 15 then 'alta' else 'media' end, 'sol_extra', s.codigo, s.id, s.data,
           'Extraordinária de Projeto sem regularização',
           format('%s (%s) está há %s dias sem documento SAP de regularização.', s.codigo, coalesce(s.projeto, 'sem projeto'), current_date - s.data),
           null, null
      from public.alm_solicitacao_extra s
     where s.tipo = 'PROJETO' and s.status = 'PENDENTE' and s.excluido_em is null and current_date - s.data > 5

    union all
    -- Retirada sem saldo esperando NF há muito tempo.
    select 'rss_aguardando_nf', case when current_date - s.data > 20 then 'alta' else 'media' end, 'sol_extra', s.codigo, s.id, s.data,
           'Retirada sem saldo aguardando NF',
           format('%s está há %s dias sem saldo para baixa. Verifique com Suprimentos se a NF foi lançada (MIGO).', s.codigo, current_date - s.data),
           null, null
      from public.alm_solicitacao_extra s
     where s.tipo = 'SEM_SALDO' and s.status = 'PENDENTE' and s.excluido_em is null and current_date - s.data > 10
       and exists (select 1 from rqb_viva r where r.origem = 'sol_extra_sem_saldo' and r.origem_ref = s.codigo and r.pendente_confirmacao)
  )
  select a.v, a.sev, a.ent, a.ref, a.rid, a.dt, (current_date - a.dt)::int, a.tit, a.det, a.ac, a.acref from achados a;
$$;
revoke all on function public.alm_contingencias_achados() from public, anon, authenticated;

create or replace function public.alm_contingencias_verificar(p_incluir_tratadas boolean default false)
returns table(verificacao text, severidade text, entidade text, referencia text, ref_id uuid, data date, dias int,
              titulo text, detalhe text, acao text, acao_ref text, tratativa jsonb)
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  if not public.alm_contingencia_pode() then
    raise exception 'Sem acesso às contingências do almoxarifado.' using errcode = '42501';
  end if;
  return query
    select a.verificacao, a.severidade, a.entidade, a.referencia, a.ref_id, a.data, a.dias, a.titulo, a.detalhe, a.acao, a.acao_ref,
           case when t.id is not null then jsonb_build_object('id', t.id, 'justificativa', t.justificativa,
                                                            'por', t.tratado_por_nome, 'em', t.created_at) end
      from public.alm_contingencias_achados() a
      left join public.alm_contingencias_tratativas t
        on t.verificacao = a.verificacao and t.referencia = a.referencia and t.revogada_em is null
     where p_incluir_tratadas or t.id is null
     order by case a.severidade when 'critica' then 0 when 'alta' then 1 else 2 end, a.data nulls last, a.referencia;
end;
$$;
revoke all on function public.alm_contingencias_verificar(boolean) from public, anon;
grant execute on function public.alm_contingencias_verificar(boolean) to authenticated;

-- Justificar (uma ou várias referências da mesma verificação): o achado sai da
-- lista, a justificativa fica registrada. Só vale para o que está aparecendo agora.
create or replace function public.alm_contingencia_justificar(p_verificacao text, p_referencias text[], p_justificativa text)
returns int
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_nome text;
  v_txt text := trim(coalesce(p_justificativa, ''));
  v_refs text[];
begin
  if not public.alm_contingencia_pode() then
    raise exception 'Sem acesso às contingências do almoxarifado.' using errcode = '42501';
  end if;
  if length(v_txt) < 15 then
    raise exception 'Descreva a justificativa (mínimo 15 caracteres): o que foi conferido e onde.' using errcode = '22023';
  end if;
  select array_agg(distinct a.referencia) into v_refs
    from public.alm_contingencias_achados() a
   where a.verificacao = p_verificacao and a.referencia = any(coalesce(p_referencias, '{}'))
     and not exists (select 1 from public.alm_contingencias_tratativas t
                      where t.verificacao = a.verificacao and t.referencia = a.referencia and t.revogada_em is null);
  if v_refs is null then
    raise exception 'Estas contingências já não aparecem na verificação — atualize a lista.' using errcode = '22023';
  end if;
  select name into v_nome from public.profiles where id = auth.uid()::text;
  insert into public.alm_contingencias_tratativas (verificacao, referencia, justificativa, tratado_por_id, tratado_por_nome)
  select p_verificacao, r, v_txt, auth.uid()::text, v_nome from unnest(v_refs) r;
  insert into public.alm_contingencias_eventos (acao, verificacao, referencia, resumo, por_id, por_nome)
  select 'justificativa', p_verificacao, r, v_txt, auth.uid()::text, v_nome from unnest(v_refs) r;
  return cardinality(v_refs);
end;
$$;
revoke all on function public.alm_contingencia_justificar(text, text[], text) from public, anon;
grant execute on function public.alm_contingencia_justificar(text, text[], text) to authenticated;

-- Reabrir: a justificativa é revogada (fica no histórico) e o achado volta.
create or replace function public.alm_contingencia_reabrir(p_tratativa uuid, p_motivo text)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_t public.alm_contingencias_tratativas;
  v_nome text;
begin
  if not public.alm_contingencia_pode() then
    raise exception 'Sem acesso às contingências do almoxarifado.' using errcode = '42501';
  end if;
  select name into v_nome from public.profiles where id = auth.uid()::text;
  update public.alm_contingencias_tratativas
     set revogada_em = now(), revogada_por_nome = v_nome, revogacao_motivo = nullif(trim(coalesce(p_motivo, '')), '')
   where id = p_tratativa and revogada_em is null
  returning * into v_t;
  if v_t.id is null then
    raise exception 'Justificativa não encontrada ou já reaberta.';
  end if;
  insert into public.alm_contingencias_eventos (acao, verificacao, referencia, resumo, por_id, por_nome)
  values ('reabertura', v_t.verificacao, v_t.referencia, coalesce(nullif(trim(coalesce(p_motivo, '')), ''), 'Justificativa revogada.'), auth.uid()::text, v_nome);
end;
$$;
revoke all on function public.alm_contingencia_reabrir(uuid, text) from public, anon;
grant execute on function public.alm_contingencia_reabrir(uuid, text) to authenticated;

-- Correção automática — só onde não há escolha a fazer:
--   recriar_rqb ...... RSS pendente sem requisição → gera a requisição pendente de novo (itens da RSS atual);
--   regularizar_rss .. requisição já confirmada → marca a RSS como regularizada por ela;
--   restaurar_rqb .... ficha de EPI sem requisição → restaura a última requisição excluída (não exportada).
create or replace function public.alm_contingencia_corrigir(p_verificacao text, p_referencia text)
returns text
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_a record;
  v_sol public.alm_solicitacao_extra;
  v_rqb uuid;
  v_codigo text;
  v_nome text;
  v_resumo text;
begin
  if not public.alm_contingencia_pode() then
    raise exception 'Sem acesso às contingências do almoxarifado.' using errcode = '42501';
  end if;
  select * into v_a from public.alm_contingencias_achados() a
   where a.verificacao = p_verificacao and a.referencia = p_referencia and a.acao is not null
   limit 1;
  if v_a.verificacao is null then
    raise exception 'Esta contingência já não aparece na verificação — atualize a lista.' using errcode = '22023';
  end if;
  select name into v_nome from public.profiles where id = auth.uid()::text;

  if v_a.acao = 'recriar_rqb' then
    select * into v_sol from public.alm_solicitacao_extra where id = v_a.ref_id for update;
    v_rqb := public.alm_sol_extra_criar_rqb(v_sol);
    select codigo into v_codigo from public.alm_req_balcao where id = v_rqb;
    -- Reescolhe o depósito pelo saldo atual (a criação já registra no log da RQB).
    perform public.alm_req_balcao_atualizar_saldos();
    v_resumo := format('%s gerada para a retirada %s (pendente de confirmação).', v_codigo, v_sol.codigo);

  elsif v_a.acao = 'regularizar_rss' then
    perform set_config('sisten.alm_sol_extra_rpc', '1', true);
    update public.alm_solicitacao_extra
       set status = 'REGULARIZADA', requisicao_balcao_codigo = v_a.acao_ref,
           regularizacao_obs = 'Regularizada pelas Contingências: requisição já confirmada.',
           regularizado_por = auth.uid()::text, regularizado_por_nome = v_nome, regularizado_em = now()
     where id = v_a.ref_id and status = 'PENDENTE';
    perform set_config('sisten.alm_sol_extra_rpc', '', true);
    v_resumo := format('%s regularizada pela %s.', p_referencia, v_a.acao_ref);

  elsif v_a.acao = 'restaurar_rqb' then
    update public.alm_req_balcao
       set excluido = false, excluido_em = null, excluido_por = null, updated_at = now()
     where codigo = v_a.acao_ref and excluido and exportacao_id is null
    returning id into v_rqb;
    if v_rqb is null then
      raise exception 'A requisição % não pode ser restaurada.', v_a.acao_ref;
    end if;
    perform public.alm_req_balcao_log(v_rqb, 'restauracao', '[]'::jsonb,
      format('Restaurada pelas Contingências: a ficha %s estava sem requisição.', p_referencia), v_nome);
    v_resumo := format('%s restaurada para a ficha %s.', v_a.acao_ref, p_referencia);
  else
    raise exception 'Ação % sem correção automática.', v_a.acao;
  end if;

  insert into public.alm_contingencias_eventos (acao, verificacao, referencia, resumo, detalhe, por_id, por_nome)
  values ('correcao', p_verificacao, p_referencia, v_resumo, jsonb_build_object('acao', v_a.acao, 'acao_ref', coalesce(v_codigo, v_a.acao_ref)),
          auth.uid()::text, v_nome);
  return v_resumo;
end;
$$;
revoke all on function public.alm_contingencia_corrigir(text, text) from public, anon;
grant execute on function public.alm_contingencia_corrigir(text, text) to authenticated;

-- Histórico de um código: logs da RQB, da Extraordinária e das contingências,
-- incluindo os registros ligados por origem (RSS ↔ RQB, ficha ↔ RQB).
create or replace function public.alm_contingencia_historico(p_codigo text)
returns table(em timestamptz, fonte text, codigo text, acao text, resumo text, por text, alteracoes jsonb)
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  if not public.alm_contingencia_pode() then
    raise exception 'Sem acesso às contingências do almoxarifado.' using errcode = '42501';
  end if;
  return query
  with codigos as (
    select p_codigo c
    union select r.codigo from public.alm_req_balcao r where r.origem_ref = p_codigo
    union select r.origem_ref from public.alm_req_balcao r where r.codigo = p_codigo and r.origem_ref is not null
    union select s.requisicao_balcao_codigo from public.alm_solicitacao_extra s where s.codigo = p_codigo and s.requisicao_balcao_codigo is not null
  )
  select l.created_at, 'Requisição no Balcão'::text, l.codigo, l.acao, l.resumo, l.alterado_por_nome, l.alteracoes
    from public.alm_req_balcao_alteracoes l where l.codigo in (select c from codigos)
  union all
  select l.created_at, 'Solicitação extraordinária', l.codigo, l.acao, l.resumo, l.alterado_por_nome, l.alteracoes
    from public.alm_sol_extra_alteracoes l where l.codigo in (select c from codigos)
  union all
  select e.created_at, 'Contingências', e.referencia, e.acao, e.resumo, e.por_nome, coalesce(e.detalhe, '[]'::jsonb)
    from public.alm_contingencias_eventos e where e.referencia in (select c from codigos)
  order by 1 desc
  limit 200;
end;
$$;
revoke all on function public.alm_contingencia_historico(text) from public, anon;
grant execute on function public.alm_contingencia_historico(text) to authenticated;

-- Justificativas registradas (ativas e revogadas), mais recentes primeiro.
create or replace function public.alm_contingencias_tratativas_listar(p_limite int default 200)
returns setof public.alm_contingencias_tratativas
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  if not public.alm_contingencia_pode() then
    raise exception 'Sem acesso às contingências do almoxarifado.' using errcode = '42501';
  end if;
  return query select * from public.alm_contingencias_tratativas order by created_at desc limit greatest(1, least(coalesce(p_limite, 200), 1000));
end;
$$;
revoke all on function public.alm_contingencias_tratativas_listar(int) from public, anon;
grant execute on function public.alm_contingencias_tratativas_listar(int) to authenticated;

-- ---------------------------------------------------------------------
-- 6. Aviso diário a cada importação da ZL0024
-- ---------------------------------------------------------------------
create or replace function public.alm_contingencias_apos_zl0024()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_criticas int;
  v_altas int;
begin
  begin
    select count(*) filter (where a.severidade = 'critica'), count(*) filter (where a.severidade = 'alta')
      into v_criticas, v_altas
      from public.alm_contingencias_achados() a
     where not exists (select 1 from public.alm_contingencias_tratativas t
                        where t.verificacao = a.verificacao and t.referencia = a.referencia and t.revogada_em is null);
    if coalesce(v_criticas, 0) + coalesce(v_altas, 0) = 0 then
      return null;
    end if;
    insert into public.core_notificacoes (id, user_id, title, description, type, is_read, created_at, context_key)
    select 'n_' || replace(gen_random_uuid()::text, '-', ''), p.id,
           'Almoxarifado: contingências do estoque',
           format('%s crítica(s) e %s alta(s) em aberto — saídas que podem não chegar ao SAP e virar diferença no inventário.', v_criticas, v_altas),
           case when v_criticas > 0 then 'warning' else 'info' end, false, now(), '/pendencias?aba=contingencias'
      from public.profiles p
     where coalesce(p.status, 'ativo') = 'ativo'
       and ('admin' = any(p.roles) or p.page_access->>'alm_contingencias' = 'true')
       and not exists (select 1 from public.core_notificacoes n
                        where n.user_id = p.id and n.context_key = '/pendencias?aba=contingencias'
                          and n.title = 'Almoxarifado: contingências do estoque'
                          and n.created_at >= date_trunc('day', now() at time zone 'America/Bahia') at time zone 'America/Bahia');
  exception when others then
    raise warning 'alm_contingencias_apos_zl0024: %', sqlerrm;
  end;
  return null;
end;
$$;

drop trigger if exists trg_alm_contingencias_zl0024 on public.ops_importacoes;
create trigger trg_alm_contingencias_zl0024
  after insert on public.ops_importacoes
  for each row when (new.type = 'ZL0024')
  execute function public.alm_contingencias_apos_zl0024();

revoke all on function public.alm_contingencia_pode(), public.alm_sol_extra_registrar_log(),
  public.alm_contingencia_registrar_falha(text, text, text), public.alm_contingencias_apos_zl0024() from public, anon;
grant execute on function public.alm_contingencia_pode() to authenticated;

-- ---------------------------------------------------------------------
-- 7. Inventário: divergência mostra o que ainda não chegou ao SAP
-- ---------------------------------------------------------------------
alter table public.alm_inventario_contagens add column if not exists pendencias_sap jsonb;
grant select (pendencias_sap) on public.alm_inventario_contagens to authenticated;

-- Corpo igual ao de 20261031170000; acrescenta v_pend (gravado e devolvido).
create or replace function public.alm_inv_registrar_contagem_auditada(
  p_item_id uuid, p_quantidade numeric, p_endereco text, p_validade date, p_observacao text, p_por text,
  p_causa text, p_causa_detalhe text, p_preparacao uuid, p_iniciada_em timestamptz, p_sem_movimentacao boolean)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_i public.alm_inventario_itens; v_ctx jsonb; v_num int; v_saldo numeric; v_div boolean; v_nome text;
  v_prep uuid; v_inicio timestamptz; v_base timestamptz; v_corte timestamptz; v_pend jsonb;
begin
  perform pg_advisory_xact_lock(hashtext('alm_inv_reservas'));
  if not public.alm_inv_pode_operar() then raise exception 'Sem acesso ao inventário.'; end if;
  lock table public.sap_zl0024_stk in share mode;
  select updated_at into v_base from public.dataset_versions where dataset='estoque' for share;
  select * into v_i from public.alm_inventario_itens where id=p_item_id for update;
  if not found or exists(select 1 from public.alm_inventarios where id=v_i.inventario_id and excluido) then raise exception 'Item não encontrado ou inventário excluído.'; end if;
  if v_i.status not in ('pendente','aguardando_decisao') then raise exception 'Item já encerrado.'; end if;

  -- Rodada liberada e válida, com o item na foto da liberação: vale a foto.
  v_ctx := public.alm_inv_contexto_auditoria(v_i.inventario_id);
  if coalesce((v_ctx->>'pronta')::boolean, false) then
    select s.saldo, s.preparacao_id into v_saldo, v_prep
      from public.alm_inv_preparo_saldos s
     where s.preparacao_id=(v_ctx->'preparacao'->>'id')::uuid and s.item_id=p_item_id;
  end if;
  -- Sem rodada: a ZL0024 atual.
  if v_prep is null then
    v_saldo := public.alm_inv_saldo_zl0024(v_i.material, v_i.deposito);
  end if;

  select coalesce(max(numero),0)+1 into v_num from public.alm_inventario_contagens where item_id=p_item_id;
  if v_num>3 then raise exception 'Limite de três contagens atingido.'; end if;
  if p_quantidade is null or p_quantidade<0 or p_quantidade::text in ('NaN','Infinity','-Infinity') then raise exception 'Quantidade inválida.'; end if;
  if (v_num>=2 or p_causa is not null) and (not coalesce(public.alm_inv_causa_valida(p_causa),false) or length(trim(coalesce(p_causa_detalhe,'')))<5) then raise exception 'Informe a causa provável e o detalhe da recontagem (mínimo 5 caracteres).'; end if;

  select name into v_nome from public.profiles where id=auth.uid()::text;
  v_inicio := least(coalesce(p_iniciada_em, clock_timestamp()), clock_timestamp());
  v_div := round(p_quantidade,3)<>round(v_saldo,3);

  -- Divergiu: o que deste material × depósito ainda não está (ou entrou depois) na ZL0024 comparada.
  -- Só códigos e situação — nenhuma quantidade, para não quebrar a contagem cega.
  if v_div then
    v_corte := case when v_prep is not null then coalesce((v_ctx->'preparacao'->>'extracao_em')::timestamptz, v_base) else v_base end;
    begin
      select jsonb_agg(distinct jsonb_build_object('codigo', p.codigo, 'tipo', p.tipo, 'motivo', p.motivo))
        into v_pend
        from public.alm_inv_pendencias_corte(coalesce(v_corte, '-infinity'::timestamptz)) p
       where p.material = regexp_replace(trim(v_i.material), '^0+', '')
         and (p.deposito is null or lpad(p.deposito, 4, '0') = lpad(v_i.deposito, 4, '0'));
    exception when others then
      v_pend := null; -- a contagem não depende disto
    end;
  end if;

  insert into public.alm_inventario_contagens(item_id,numero,quantidade,divergente,saldo_ref,endereco_encontrado,validade,observacao,contado_por_id,contado_por_nome,
    causa,causa_detalhe,preparacao_id,iniciada_em,duracao_segundos,movimentacoes_controladas,pendencias_sap)
  values(p_item_id,v_num,p_quantidade,v_div,v_saldo,nullif(upper(trim(p_endereco)),''),p_validade,nullif(trim(p_observacao),''),auth.uid(),v_nome,
    p_causa,nullif(trim(p_causa_detalhe),''),v_prep,v_inicio,greatest(0,extract(epoch from clock_timestamp()-v_inicio)::int),coalesce(p_sem_movimentacao,false),v_pend);
  update public.alm_inventario_itens set status=case when not v_div then 'conferido' when v_num=3 then 'divergente' else 'aguardando_decisao' end,
    saldo_sistema=case when not v_div or v_num=3 then v_saldo else null end,qtd_final=case when not v_div or v_num=3 then p_quantidade else null end,
    diferenca=case when not v_div or v_num=3 then p_quantidade-v_saldo else null end,
    encerrado_em=case when not v_div or v_num=3 then clock_timestamp() end,encerrado_por=case when not v_div or v_num=3 then v_nome end,
    alerta=case when v_div and v_num=3 then 'Divergência após três contagens. Causa provável declarada; exige investigação e conciliação pela gestão.'
                  || case when v_pend is not null then ' Movimentações sem baixa no SAP: ' || (select string_agg(x->>'codigo', ', ') from jsonb_array_elements(v_pend) x) || '.' else '' end end
  where id=p_item_id returning * into v_i;
  perform public.alm_inv_atualizar_status(v_i.inventario_id);
  return jsonb_build_object('numero',v_num,'divergente',v_div,'status',v_i.status,'pode_recontar',v_i.status='aguardando_decisao',
    'saldo_sistema',v_i.saldo_sistema,'diferenca',v_i.diferenca,'zl0024_importada_em',v_base,'pendencias_sap',coalesce(v_pend,'[]'::jsonb));
end;
$function$;
