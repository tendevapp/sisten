-- Pendências de Recebimento (Suprimentos ⇄ Almoxarifado)
--
-- Divergência na conferência do recebimento (avaria, falta, excedente,
-- material errado, sem pedido) ou item marcado como entrega parcial vira uma
-- pendência para o COMPRADOR DO PO decidir (receber o parcial, assumir a NC,
-- devolver...). A decisão volta para o almoxarifado, que confirma a execução.
--
--   aguardando_comprador → (decisão) → aguardando_almox → (execução) → concluida
--                                  ↘ cancelada (divergência saiu na edição / cancelada por Suprimentos)
--
-- Granularidade: 1 pendência por PO × linha × motivo — uma conferência pode ter
-- vários POs, cada um de um comprador. NCR avulsa (sem conferência) com PO vira
-- 1 pendência própria.
--
-- Quem cria é o BANCO (constraint triggers adiadas para o commit), não a tela:
-- a conferência gravada sem rede sobe pela fila e a pendência nasce do mesmo
-- jeito. A edição da conferência apaga e recria as linhas (ids mudam), por isso
-- a chave é natural (conferência|PO|linha_ref|motivo) e a sincronização é
-- idempotente. Falha aqui nunca derruba a gravação do recebimento.
--
-- Comprador do PO: quem colocou o PO no SAP (criado_por_pedido da ZL0132 →
-- sup_compradores.usuario_sistema), como em resolveComprador (demandas.ts); se
-- inativo ou não mapeado, o grupo de compradores da RC; depois o perfil com
-- profiles.grupo_compras. Sem comprador → notifica coordenação/admin.
--
-- Código PRE-DDMMYY-NN (alm_receb_proximo_codigo): índice reinicia por dia,
-- igual aos demais códigos do recebimento.

create table if not exists public.sup_pend_recebimento (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  origem text not null check (origem in ('conferencia', 'nc')),
  chave text not null unique,
  conferencia_id uuid references public.alm_receb_conferencias(id),
  conferencia_codigo text,
  nc_id uuid references public.alm_receb_nc(id),
  nc_codigo text,
  carga_id uuid,
  nro_pedido text,
  linha_ref text,
  material_code text,
  descricao text,
  unidade text,
  fornecedor text,
  motivo text not null check (motivo in ('parcial', 'falta', 'excedente', 'avaria', 'material_errado', 'sem_pedido', 'outros')),
  qtd_pedido numeric,
  qtd_ja_fornecida numeric,
  qtd_recebida numeric,
  observacao_almox text,
  evidencias jsonb not null default '[]'::jsonb,
  grupo_compras text,
  comprador_id uuid,
  comprador_nome text,
  status text not null default 'aguardando_comprador'
    check (status in ('aguardando_comprador', 'aguardando_almox', 'concluida', 'cancelada')),
  cancelamento text check (cancelamento in ('auto', 'manual')),
  decisao text check (decisao in (
    'receber_parcial_aguardar', 'receber_parcial_encerrar', 'assumir_nc', 'aceitar_excedente',
    'aceitar_substituto', 'vincular_po', 'devolver_repor', 'devolver', 'outro')),
  decisao_obs text,
  pedido_vinculado text,
  decidido_por_id uuid,
  decidido_por_nome text,
  decidido_em timestamptz,
  execucao_obs text,
  executado_por_id uuid,
  executado_por_nome text,
  executado_em timestamptz,
  aberto_por_id uuid,
  aberto_por_nome text,
  historico jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sup_pend_receb_status_idx on public.sup_pend_recebimento (status);
create index if not exists sup_pend_receb_comprador_idx on public.sup_pend_recebimento (comprador_id);
create index if not exists sup_pend_receb_conf_idx on public.sup_pend_recebimento (conferencia_id);
create index if not exists sup_pend_receb_nc_idx on public.sup_pend_recebimento (nc_id);

alter table public.sup_pend_recebimento enable row level security;
drop policy if exists sup_pend_receb_select on public.sup_pend_recebimento;
create policy sup_pend_receb_select on public.sup_pend_recebimento
  for select to authenticated using (true);
-- Gravação só pelas RPCs (security definer) e pela sincronização.
revoke all on public.sup_pend_recebimento from public, anon, authenticated;
grant select on public.sup_pend_recebimento to authenticated;

-- ---------------------------------------------------------------------------
-- Catálogo (espelha src/lib/pendenciasRecebimento.ts)
-- ---------------------------------------------------------------------------

create or replace function public.sup_receb_decisoes_validas(p_motivo text)
returns text[] language sql immutable set search_path = public, pg_temp as $$
  select case p_motivo
    when 'parcial'         then array['receber_parcial_aguardar', 'receber_parcial_encerrar', 'devolver', 'outro']
    when 'falta'           then array['receber_parcial_aguardar', 'receber_parcial_encerrar', 'devolver', 'outro']
    when 'avaria'          then array['assumir_nc', 'devolver_repor', 'devolver', 'outro']
    when 'excedente'       then array['aceitar_excedente', 'devolver', 'outro']
    when 'material_errado' then array['devolver_repor', 'aceitar_substituto', 'devolver', 'outro']
    when 'sem_pedido'      then array['vincular_po', 'devolver', 'outro']
    else                        array['assumir_nc', 'devolver_repor', 'devolver', 'outro']
  end
$$;

create or replace function public.sup_receb_rotulo_motivo(p_motivo text)
returns text language sql immutable set search_path = public, pg_temp as $$
  select case p_motivo
    when 'parcial' then 'Entrega parcial'
    when 'falta' then 'Falta'
    when 'excedente' then 'Excedente'
    when 'avaria' then 'Avaria'
    when 'material_errado' then 'Material errado'
    when 'sem_pedido' then 'Sem pedido'
    else 'Outra NC'
  end
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
    when 'outro' then 'Outra tratativa'
    else coalesce(p_decisao, '')
  end
$$;

-- ---------------------------------------------------------------------------
-- Comprador do PO e destinatários
-- ---------------------------------------------------------------------------

create or replace function public.sup_receb_comprador_do_po(
  p_po text, out grupo text, out comprador_id uuid, out comprador_nome text)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_email text;
  v_nome_cad text;
begin
  if coalesce(btrim(p_po), '') = '' then return; end if;

  -- 1) quem colocou o PO no SAP
  select c.grupo_compras into grupo
    from public.sap_zl0132_po z
    join public.sup_compradores c
      on upper(btrim(c.usuario_sistema, E' \t\r\n')) = upper(btrim(z.criado_por_pedido, E' \t\r\n'))
     and coalesce(c.ativo, true)
   where z.doc_compra = p_po
   group by c.grupo_compras
   order by count(*) desc
   limit 1;

  -- 2) grupo de compradores da RC que originou o PO
  if grupo is null then
    select c.grupo_compras into grupo
      from public.sap_zl0132_po z
      join public.requisicoes r on r.ri = z.ri
      join public.sup_compradores c
        on c.grupo_compras = btrim(r.grupo_de_compradores) and coalesce(c.ativo, true)
     where z.doc_compra = p_po
     group by c.grupo_compras
     order by count(*) desc
     limit 1;
  end if;

  if grupo is null then return; end if;

  select p.id::uuid, p.name into comprador_id, comprador_nome
    from public.profiles p
   where p.grupo_compras = grupo and coalesce(p.status, 'ativo') <> 'inativo'
   order by ('comprador' = any(p.roles)) desc, p.created_at
   limit 1;

  if comprador_id is null then
    select lower(btrim(c.email, E' \t\r\n')), c.nome_comprador into v_email, v_nome_cad
      from public.sup_compradores c where c.grupo_compras = grupo limit 1;
    select p.id::uuid, p.name into comprador_id, comprador_nome
      from public.profiles p
     where lower(p.email) = v_email and coalesce(p.status, 'ativo') <> 'inativo'
     limit 1;
    comprador_nome := coalesce(comprador_nome, v_nome_cad);
  end if;
end;
$$;

create or replace function public.sup_receb_destinatarios_sem_comprador()
returns uuid[] language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v uuid[];
begin
  select coalesce(array_agg(id::uuid), '{}') into v from public.profiles
   where coalesce(status, 'ativo') <> 'inativo' and roles && array['coordenador_suprimentos'];
  if coalesce(array_length(v, 1), 0) = 0 then
    select coalesce(array_agg(id::uuid), '{}') into v from public.profiles
     where coalesce(status, 'ativo') <> 'inativo' and roles && array['admin'];
  end if;
  return v;
end;
$$;

create or replace function public.sup_receb_eh_suprimentos(p_uid uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.profiles
     where id = p_uid::text and roles && array['admin', 'comprador', 'coordenador_suprimentos'])
$$;

create or replace function public.sup_receb_notificar(
  p_users uuid[], p_titulo text, p_descricao text, p_tipo text, p_contexto text, p_exceto uuid default null)
returns void language sql security definer set search_path = public, pg_temp as $$
  insert into public.core_notificacoes (id, user_id, title, description, type, is_read, created_at, context_key)
  select 'n_' || replace(gen_random_uuid()::text, '-', ''), u::text, p_titulo, p_descricao, p_tipo, false, now(), p_contexto
    from (select distinct unnest(p_users) as u) x
   where u is not null and u is distinct from p_exceto
$$;

create or replace function public.sup_receb_evento(p_evento text, p_texto text, p_por_id uuid, p_por_nome text)
returns jsonb language sql stable set search_path = public, pg_temp as $$
  select jsonb_build_array(jsonb_build_object(
    'em', now(), 'evento', p_evento, 'texto', p_texto, 'por_id', p_por_id, 'por_nome', p_por_nome))
$$;

-- ---------------------------------------------------------------------------
-- Sincronização (chamada pelos triggers)
-- ---------------------------------------------------------------------------

create or replace function public.sup_receb_pend_notificar_novas(p_novas jsonb, p_origem text, p_contexto_grupo text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  n record;
begin
  for n in
    select nullif(x->>'comprador_id', '')::uuid as comprador_id,
           count(*) as qtd,
           string_agg(distinct x->>'po', ', ') as pos,
           string_agg(distinct public.sup_receb_rotulo_motivo(x->>'motivo'), ', ') as motivos,
           min(x->>'id') as um_id
      from jsonb_array_elements(p_novas) x
     group by 1
  loop
    perform public.sup_receb_notificar(
      case when n.comprador_id is null then public.sup_receb_destinatarios_sem_comprador()
           else array[n.comprador_id] end,
      'Pendência de recebimento — PO ' || coalesce(n.pos, 's/ nº'),
      p_origem || ': ' || n.qtd || ' item(ns) com ' || lower(n.motivos)
        || ' aguardando a devolutiva de Suprimentos'
        || case when n.comprador_id is null then ' (comprador do PO não identificado — atribua).' else '.' end,
      'alert',
      '/suprimentos/pendencias-recebimento?'
        || case when n.qtd = 1 then 'id=' || n.um_id else p_contexto_grupo end);
  end loop;
end;
$$;

create or replace function public.sup_receb_pend_sincronizar_conferencia(p_conf uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
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
  -- Os triggers são por linha e adiados: todos disparam no commit, já vendo o
  -- estado final. Basta a primeira passada por conferência e transação.
  if current_setting(v_flag, true) = txid_current()::text then return; end if;
  perform set_config(v_flag, txid_current()::text, true);

  select * into v_conf from public.alm_receb_conferencias where id = p_conf;
  if not found then return; end if;
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
          r.po, r.linha_ref, r.material_code, r.descricao, r.unidade, v_conf.fornecedor, r.motivo,
          r.qtd_pedido, r.qtd_ja_fornecida, r.qtd_recebida, r.observacao, coalesce(r.evidencias, '[]'::jsonb),
          v_grupo, v_cid, v_cnome, v_conf.criado_por_id, v_conf.criado_por_nome,
          public.sup_receb_evento('aberta',
            public.sup_receb_rotulo_motivo(r.motivo) || ' na conferência ' || v_conf.codigo
              || coalesce(' — comprador: ' || v_cnome, ' — comprador do PO não identificado'),
            v_conf.criado_por_id, v_conf.criado_por_nome))
        returning id into v_id;
        v_novas := v_novas || jsonb_build_object('id', v_id, 'comprador_id', v_cid, 'po', r.po, 'motivo', r.motivo);

      elsif v_pend.status = 'cancelada' and v_pend.cancelamento = 'auto' then
        -- a divergência voltou numa edição: reabre do zero
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
        -- quantidade mudou depois da decisão: a decisão pode não valer mais
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

      elsif v_pend.status <> 'cancelada' then
        -- aguardando: atualiza a foto da linha (e tenta achar o comprador de novo)
        if v_pend.comprador_id is null then
          select * into v_grupo, v_cid, v_cnome from public.sup_receb_comprador_do_po(r.po);
        else
          v_grupo := null; v_cid := null; v_cnome := null;
        end if;
        update public.sup_pend_recebimento set
          qtd_pedido = r.qtd_pedido, qtd_ja_fornecida = r.qtd_ja_fornecida, qtd_recebida = r.qtd_recebida,
          descricao = r.descricao, unidade = r.unidade, fornecedor = v_conf.fornecedor,
          observacao_almox = r.observacao, evidencias = coalesce(r.evidencias, '[]'::jsonb),
          nc_id = coalesce(v_nc.id, nc_id), nc_codigo = coalesce(v_nc.codigo, nc_codigo),
          conferencia_codigo = v_conf.codigo,
          grupo_compras = coalesce(grupo_compras, v_grupo),
          comprador_id = coalesce(comprador_id, v_cid),
          comprador_nome = coalesce(comprador_nome, v_cnome),
          updated_at = now()
         where id = v_pend.id
           and (qtd_recebida, qtd_pedido, qtd_ja_fornecida, descricao, observacao_almox, evidencias, nc_id, comprador_id)
               is distinct from
               (r.qtd_recebida, r.qtd_pedido, r.qtd_ja_fornecida, r.descricao, r.observacao,
                coalesce(r.evidencias, '[]'::jsonb), coalesce(v_nc.id, nc_id), coalesce(comprador_id, v_cid));
      end if;
    end loop;
  end if;

  -- O que estava aberto e não é mais divergência (edição) ou a conferência foi excluída
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
$$;

create or replace function public.sup_receb_pend_sincronizar_nc(p_nc uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
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
      v_nc.fornecedor, v_motivo, v_nc.descricao, coalesce(v_nc.evidencias, '[]'::jsonb),
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
      nro_pedido = v_nc.nro_pedido, descricao = v_nc.descricao, fornecedor = v_nc.fornecedor,
      motivo = v_motivo, observacao_almox = v_nc.descricao, evidencias = coalesce(v_nc.evidencias, '[]'::jsonb),
      grupo_compras = case when v_cid is not null then v_grupo else grupo_compras end,
      comprador_id = coalesce(v_cid, comprador_id),
      comprador_nome = coalesce(v_cnome, comprador_nome),
      updated_at = now()
     where id = v_pend.id
       and (nro_pedido, descricao, fornecedor, motivo, evidencias, comprador_id)
           is distinct from
           (v_nc.nro_pedido, v_nc.descricao, v_nc.fornecedor, v_motivo, coalesce(v_nc.evidencias, '[]'::jsonb),
            coalesce(v_cid, comprador_id));
  end if;
end;
$$;

-- Triggers: adiados para o commit e blindados — o recebimento grava mesmo se a pendência falhar.

create or replace function public.sup_receb_pend_trg_itens()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  begin
    perform public.sup_receb_pend_sincronizar_conferencia(coalesce(new.conferencia_id, old.conferencia_id));
  exception when others then
    raise warning 'sup_pend_recebimento: falha ao sincronizar a conferencia %: %',
      coalesce(new.conferencia_id, old.conferencia_id), sqlerrm;
  end;
  return null;
end;
$$;

create or replace function public.sup_receb_pend_trg_conf()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  begin
    perform public.sup_receb_pend_sincronizar_conferencia(new.id);
  exception when others then
    raise warning 'sup_pend_recebimento: falha ao sincronizar a conferencia %: %', new.id, sqlerrm;
  end;
  return null;
end;
$$;

create or replace function public.sup_receb_pend_trg_nc()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  begin
    perform public.sup_receb_pend_sincronizar_nc(new.id);
  exception when others then
    raise warning 'sup_pend_recebimento: falha ao sincronizar a NCR %: %', new.id, sqlerrm;
  end;
  return null;
end;
$$;

drop trigger if exists sup_pend_receb_itens on public.alm_receb_conferencia_itens;
create constraint trigger sup_pend_receb_itens
  after insert or update or delete on public.alm_receb_conferencia_itens
  deferrable initially deferred
  for each row execute function public.sup_receb_pend_trg_itens();

drop trigger if exists sup_pend_receb_conf on public.alm_receb_conferencias;
create constraint trigger sup_pend_receb_conf
  after update on public.alm_receb_conferencias
  deferrable initially deferred
  for each row
  when (old.excluido is distinct from new.excluido
        or old.nro_pedido is distinct from new.nro_pedido
        or old.fornecedor is distinct from new.fornecedor)
  execute function public.sup_receb_pend_trg_conf();

drop trigger if exists sup_pend_receb_nc on public.alm_receb_nc;
create constraint trigger sup_pend_receb_nc
  after insert or update on public.alm_receb_nc
  deferrable initially deferred
  for each row execute function public.sup_receb_pend_trg_nc();

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- Comprador dá a devolutiva (1 ou várias pendências com a mesma decisão).
-- Pode trocar a decisão enquanto o almoxarifado não executou.
create or replace function public.sup_receb_pend_decidir(
  p_ids uuid[], p_decisao text, p_obs text default null, p_pedido text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_nome text;
  v_pend public.sup_pend_recebimento;
  v_obs text := nullif(btrim(coalesce(p_obs, '')), '');
  v_pedido text := nullif(regexp_replace(coalesce(p_pedido, ''), '\D', '', 'g'), '');
  v_rotulo text;
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

    update public.sup_pend_recebimento set
      status = 'aguardando_almox',
      decisao = p_decisao, decisao_obs = v_obs,
      pedido_vinculado = case when p_decisao = 'vincular_po' then v_pedido end,
      decidido_por_id = v_uid, decidido_por_nome = v_nome, decidido_em = now(),
      comprador_id = coalesce(comprador_id, v_uid), comprador_nome = coalesce(comprador_nome, v_nome),
      historico = historico || public.sup_receb_evento(
        case when v_pend.status = 'aguardando_almox' then 'decisao_alterada' else 'decisao' end,
        v_rotulo || coalesce(' — PO ' || case when p_decisao = 'vincular_po' then v_pedido end, '') || coalesce('. ' || v_obs, ''),
        v_uid, v_nome),
      updated_at = now()
     where id = v_pend.id;

    if v_pend.nc_id is not null then
      update public.alm_receb_nc set
        acoes = coalesce(acoes, '[]'::jsonb) || jsonb_build_object(
          'texto', 'Suprimentos — ' || v_pend.codigo || coalesce(' · ' || v_pend.material_code, '')
                   || ': ' || v_rotulo || coalesce('. ' || v_obs, ''),
          'evidencias', '[]'::jsonb, 'por_id', v_uid::text, 'por_nome', v_nome, 'em', now()),
        status = case when status = 'aberta' then 'em_tratativa' else status end
       where id = v_pend.nc_id and not excluido;
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
        || '. Confirme a execução no Almoxarifado.',
      'info',
      '/formularios/almoxarifado?vista=devolutivas' || case when n.qtd = 1 then '&id=' || n.um_id else '' end,
      v_uid);
  end loop;

  return jsonb_build_object('decididas', coalesce(array_length(v_feitas, 1), 0));
end;
$$;

-- Almoxarifado confirma que executou a decisão (receber, devolver...).
-- Idempotente: o que já foi concluído é ignorado (reenvio da fila offline).
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
        where p.nc_id = nc.id and p.status in ('aguardando_comprador', 'aguardando_almox'));

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

-- Troca o comprador responsável (cobertura, PO sem comprador identificado).
create or replace function public.sup_receb_pend_reatribuir(p_ids uuid[], p_comprador uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_nome text;
  v_dest public.profiles;
  v_qtd int;
  v_um text;
begin
  if v_uid is null then raise exception 'Sessão inválida.'; end if;
  if not public.sup_receb_eh_suprimentos(v_uid) then raise exception 'Só Suprimentos reatribui pendências.'; end if;
  select * into v_dest from public.profiles where id = p_comprador::text;
  if not found then raise exception 'Comprador não encontrado.'; end if;
  select name into v_nome from public.profiles where id = v_uid::text;

  with alvo as (
    update public.sup_pend_recebimento set
      comprador_id = v_dest.id::uuid, comprador_nome = v_dest.name,
      grupo_compras = coalesce(nullif(v_dest.grupo_compras, ''), grupo_compras),
      historico = historico || public.sup_receb_evento('reatribuida', 'Atribuída a ' || v_dest.name || '.', v_uid, v_nome),
      updated_at = now()
     where id = any(p_ids)
       and status in ('aguardando_comprador', 'aguardando_almox')
       and comprador_id is distinct from v_dest.id::uuid
    returning id
  )
  select count(*), min(id::text) into v_qtd, v_um from alvo;

  if v_qtd > 0 then
    perform public.sup_receb_notificar(
      array[v_dest.id::uuid],
      'Pendência de recebimento atribuída a você',
      coalesce(v_nome, 'Suprimentos') || ' atribuiu ' || v_qtd || ' pendência(s) de recebimento a você.',
      'alert',
      '/suprimentos/pendencias-recebimento?' || case when v_qtd = 1 then 'id=' || v_um else 'status=aguardando_comprador' end,
      v_uid);
  end if;
  return jsonb_build_object('reatribuidas', v_qtd);
end;
$$;

-- Cancela (duplicada, lançada por engano). Não volta sozinha numa edição.
create or replace function public.sup_receb_pend_cancelar(p_ids uuid[], p_motivo text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_nome text;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_qtd int;
begin
  if v_uid is null then raise exception 'Sessão inválida.'; end if;
  if not public.sup_receb_eh_suprimentos(v_uid) then raise exception 'Só Suprimentos cancela pendências.'; end if;
  if v_motivo is null then raise exception 'Informe o motivo do cancelamento.'; end if;
  select name into v_nome from public.profiles where id = v_uid::text;

  update public.sup_pend_recebimento set
    status = 'cancelada', cancelamento = 'manual',
    historico = historico || public.sup_receb_evento('cancelada', v_motivo, v_uid, v_nome),
    updated_at = now()
   where id = any(p_ids) and status in ('aguardando_comprador', 'aguardando_almox');
  get diagnostics v_qtd = row_count;
  return jsonb_build_object('canceladas', v_qtd);
end;
$$;

-- ---------------------------------------------------------------------------
-- Permissões: no Supabase o anon tem grant direto, `from public` não basta.
-- ---------------------------------------------------------------------------

revoke execute on function
  public.sup_receb_comprador_do_po(text),
  public.sup_receb_destinatarios_sem_comprador(),
  public.sup_receb_eh_suprimentos(uuid),
  public.sup_receb_notificar(uuid[], text, text, text, text, uuid),
  public.sup_receb_evento(text, text, uuid, text),
  public.sup_receb_pend_notificar_novas(jsonb, text, text),
  public.sup_receb_pend_sincronizar_conferencia(uuid),
  public.sup_receb_pend_sincronizar_nc(uuid),
  public.sup_receb_pend_trg_itens(),
  public.sup_receb_pend_trg_conf(),
  public.sup_receb_pend_trg_nc()
from public, anon, authenticated;

revoke execute on function
  public.sup_receb_pend_decidir(uuid[], text, text, text),
  public.sup_receb_pend_executar(uuid[], text),
  public.sup_receb_pend_reatribuir(uuid[], uuid),
  public.sup_receb_pend_cancelar(uuid[], text)
from public, anon;

grant execute on function
  public.sup_receb_pend_decidir(uuid[], text, text, text),
  public.sup_receb_pend_executar(uuid[], text),
  public.sup_receb_pend_reatribuir(uuid[], uuid),
  public.sup_receb_pend_cancelar(uuid[], text)
to authenticated;
