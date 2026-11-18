-- Regularização das fichas de EPI das saídas manuais no balcão
--
-- Antes da trava de 18/11 (20261118150000_epi_baixa_so_pela_ficha) o almoxarifado
-- baixava EPI direto na Requisição no Balcão, sem ficha. Essas requisições já
-- estão na fila do SAP (a maioria exportada): a ficha que falta é lançada agora
-- SEM gerar nova requisição — a baixa continua sendo a RQB manual.
--
-- O vínculo é por ITEM da requisição (ssma_fichas_epi_regularizacao), e não
-- trocando a origem da RQB para 'ficha_epi': uma RQB só aponta para uma ficha,
-- várias misturam EPI com material comum, e a contingência "Ficha de EPI
-- diferente da saída" soma todos os itens da RQB ligada.
--
--   ficha_existente  o mesmo EPI já está numa ficha do mesmo dia (ou do seguinte)
--                    que nunca teve baixa própria: a RQB manual foi a baixa dela.
--   ficha_nova       sem ficha do EPI em ±7 dias: cria a ficha com a data da RQB,
--                    função/setor da ficha mais próxima do colaborador, itens do
--                    Book, ASSINATURA PENDENTE (o SSMA colhe depois).
--   revisar          ficha próxima que já baixou o EPI (possível baixa em dobro),
--                    ficha a mais de 1 dia, ou quantidade maior que a da ficha:
--                    não mexe, devolve para o SSMA decidir.
--
-- ssma_epi_regularizar_saidas_manuais(false) só mostra o plano;
-- (true, por_id, por_nome) executa. Idempotente: item já registrado sai da conta.

create table if not exists public.ssma_fichas_epi_regularizacao (
  rqb_item_id uuid primary key,          -- sem FK: a edição da RQB recria os itens
  requisicao_id uuid not null,
  rqb_codigo text not null,
  ficha_id uuid not null references public.ssma_fichas_epi(id),
  ficha_codigo text not null,
  tipo text not null check (tipo in ('ficha_existente', 'ficha_nova')),
  material text not null,
  quantidade numeric not null,
  criado_por text,
  criado_por_nome text,
  created_at timestamptz not null default now()
);
create index if not exists ssma_fichas_epi_regularizacao_ficha_idx on public.ssma_fichas_epi_regularizacao (ficha_id);
create index if not exists ssma_fichas_epi_regularizacao_rqb_idx on public.ssma_fichas_epi_regularizacao (requisicao_id);

alter table public.ssma_fichas_epi_regularizacao enable row level security;
drop policy if exists ssma_fichas_epi_regularizacao_select on public.ssma_fichas_epi_regularizacao;
create policy ssma_fichas_epi_regularizacao_select on public.ssma_fichas_epi_regularizacao
  for select to authenticated using (true);
revoke all on public.ssma_fichas_epi_regularizacao from anon;
grant select on public.ssma_fichas_epi_regularizacao to authenticated;

comment on table public.ssma_fichas_epi_regularizacao is
  'Item de RQB manual (EPI sem ficha) que é a baixa de uma ficha lançada depois. A ficha não gera requisição.';

-- Contingência "EPI entregue sem requisição": ficha regularizada já tem a baixa
-- (a RQB manual registrada acima).
do $$
declare
  v_def text := pg_get_functiondef('public.alm_contingencias_achados()'::regprocedure);
  v_ancora text := E'     where f.status = ''ATIVA'' and f.itens_sap > 0\n';
begin
  if position('ssma_fichas_epi_regularizacao' in v_def) > 0 then
    return;
  end if;
  if (length(v_def) - length(replace(v_def, v_ancora, ''))) / length(v_ancora) <> 1 then
    raise exception 'alm_contingencias_achados mudou: ajuste a migration da regularização.';
  end if;
  v_def := replace(v_def, v_ancora, v_ancora
    || E'       and not exists (select 1 from public.ssma_fichas_epi_regularizacao g where g.ficha_id = f.id)\n');
  execute v_def;
end $$;

create or replace function public.ssma_epi_regularizar_saidas_manuais(
  p_executar boolean default false,
  p_por_id text default null,
  p_por_nome text default null
)
returns table (acao text, ficha text, colaborador text, data date, rqbs text, itens text, motivo smallint, detalhe text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_por_id text := coalesce(p_por_id, (auth.uid())::text);
  v_por_nome text := coalesce(nullif(p_por_nome, ''), (select name from public.core_perfis where id = (auth.uid())::text));
  v_g record;
  v_ref public.ssma_fichas_epi;
  v_adm date;
  v_motivo smallint;
  v_n int;
  v_codigo text;
  v_ficha_id uuid;
  v_obs text;
  v_r record;
  v_novas int := 0;
  v_vinculadas int := 0;
begin
  if auth.uid() is not null and not public.has_role('admin') then
    raise exception 'Só o administrador regulariza fichas de EPI.' using errcode = '42501';
  end if;
  if p_executar and v_por_id is null then
    raise exception 'Informe quem executa a regularização (p_por_id).';
  end if;

  drop table if exists _reg;
  create temp table _reg on commit drop as
  with base as (
    select i.id item_id, r.id rqb_id, r.codigo rqb, r.data dt, r.colaborador_id pessoa_id, r.colaborador_nome nome,
           public.alm_chave_material(i.material) mat, i.material, i.quantidade q
      from public.alm_req_balcao r
      join public.alm_req_balcao_itens i on i.requisicao_id = r.id
      left join public.alm_solicitacao_extra s on r.origem = 'sol_extra_sem_saldo' and s.codigo = r.origem_ref
     where not r.excluido and r.tipo_movimento = 'saida' and r.colaborador_id is not null
       and public.alm_eh_epi_book(i.material)
       and (r.origem is null
            or (r.origem = 'sol_extra_sem_saldo' and coalesce(s.origem, '') <> 'ficha_epi')
            or r.origem not in ('ficha_epi', 'sol_extra_sem_saldo'))
       and not exists (select 1 from public.ssma_fichas_epi_regularizacao g where g.rqb_item_id = i.id)
  ),
  ficha_mat as (
    select f.id ficha_id, f.codigo, f.pessoa_id, f.data_entrega, public.alm_chave_material(fi.codigo_sap) mat, sum(fi.quantidade) q
      from public.ssma_fichas_epi f
      join public.ssma_fichas_epi_itens fi on fi.ficha_id = f.id
     where f.status = 'ATIVA' and nullif(trim(fi.codigo_sap), '') is not null
     group by 1, 2, 3, 4, 5
  ),
  casada as (
    select b.item_id, fm.ficha_id, fm.codigo ficha, fm.q qtd_ficha, abs(fm.data_entrega - b.dt) dias,
           -- baixa da própria ficha: RQB dela ou RQB da Retirada sem Saldo aberta por ela
           (select coalesce(sum(ri.quantidade), 0)
              from public.alm_req_balcao r2 join public.alm_req_balcao_itens ri on ri.requisicao_id = r2.id
             where not r2.excluido and r2.tipo_movimento = 'saida'
               and public.alm_chave_material(ri.material) = b.mat
               and ((r2.origem = 'ficha_epi' and (r2.origem_id = fm.ficha_id or r2.origem_ref = fm.codigo))
                 or (r2.origem = 'sol_extra_sem_saldo' and r2.origem_ref in (
                       select s2.codigo from public.alm_solicitacao_extra s2
                        where s2.origem = 'ficha_epi' and (s2.origem_id = fm.ficha_id or s2.origem_ref = fm.codigo))))) baixa_propria,
           row_number() over (partition by b.item_id order by abs(fm.data_entrega - b.dt), fm.data_entrega) rn
      from base b
      join ficha_mat fm on fm.pessoa_id = b.pessoa_id and fm.mat = b.mat
                       and fm.data_entrega between b.dt - 7 and b.dt + 7
  )
  select b.*, c.ficha_id, c.ficha, c.qtd_ficha, c.dias, c.baixa_propria,
         case when c.ficha_id is null then 'ficha_nova'
              when c.baixa_propria = 0 and c.dias <= 1 then 'ficha_existente'
              else 'revisar' end classe,
         case when c.ficha_id is null then null
              when c.baixa_propria > 0 then format('a ficha %s (%s dia(s) de diferença) já baixou este EPI — possível baixa em dobro', c.ficha, c.dias)
              when c.dias > 1 then format('a ficha %s tem o mesmo EPI a %s dias — confirmar se é a mesma entrega', c.ficha, c.dias)
         end motivo_revisar
    from base b left join casada c on c.item_id = b.item_id and c.rn = 1;

  -- Mais unidades nas RQBs do que na ficha existente: não cabe como baixa dela.
  update _reg x set classe = 'revisar',
         motivo_revisar = format('as requisições somam %s un. e a ficha %s entregou %s', t.q, x.ficha, trim_scale(x.qtd_ficha))
    from (select ficha_id, mat, sum(q) q from _reg where classe = 'ficha_existente' group by 1, 2) t
   where x.classe = 'ficha_existente' and t.ficha_id = x.ficha_id and t.mat = x.mat and t.q > x.qtd_ficha;

  -- 1. Revisar (não mexe) -----------------------------------------------------
  for v_r in
    select x.rqb, x.dt, x.nome, x.material, x.q, x.motivo_revisar from _reg x where x.classe = 'revisar' order by x.dt, x.rqb
  loop
    acao := 'revisar'; ficha := null; colaborador := v_r.nome; data := v_r.dt; rqbs := v_r.rqb;
    itens := v_r.material || ' × ' || trim_scale(v_r.q); motivo := null; detalhe := v_r.motivo_revisar;
    return next;
  end loop;

  -- 2. Ficha que já existe: a RQB manual foi a baixa dela ---------------------
  for v_g in
    select x.ficha_id, x.ficha, min(x.nome) nome, min(x.dt) dt,
           string_agg(distinct x.rqb, ', ') rqbs,
           string_agg(x.material || ' × ' || trim_scale(x.q), ', ' order by x.material) itens
      from _reg x where x.classe = 'ficha_existente' group by 1, 2 order by 4, 2
  loop
    if p_executar then
      insert into public.ssma_fichas_epi_regularizacao
        (rqb_item_id, requisicao_id, rqb_codigo, ficha_id, ficha_codigo, tipo, material, quantidade, criado_por, criado_por_nome)
      select x.item_id, x.rqb_id, x.rqb, x.ficha_id, x.ficha, 'ficha_existente', x.material, x.q, v_por_id, v_por_nome
        from _reg x where x.classe = 'ficha_existente' and x.ficha_id = v_g.ficha_id;
      v_vinculadas := v_vinculadas + 1;
    end if;
    acao := 'vincular'; ficha := v_g.ficha; colaborador := v_g.nome; data := v_g.dt; rqbs := v_g.rqbs;
    itens := v_g.itens; motivo := null; detalhe := 'EPI já está nesta ficha; a requisição manual passa a ser a baixa dela.';
    return next;
  end loop;

  -- 3. Sem ficha: cria, com assinatura pendente, sem requisição --------------
  if p_executar then
    perform pg_advisory_xact_lock(hashtext('ssma_fichas_epi_codigo'));
  end if;
  for v_g in
    select x.pessoa_id, x.dt, min(x.nome) nome, string_agg(distinct x.rqb, ', ') rqbs
      from _reg x where x.classe = 'ficha_nova' group by 1, 2 order by 2, 3
  loop
    -- Função, setor e cargo da ficha mais próxima (de preferência a anterior).
    select f.* into v_ref from public.ssma_fichas_epi f
     where f.pessoa_id = v_g.pessoa_id and f.status = 'ATIVA'
     order by (f.data_entrega > v_g.dt), abs(f.data_entrega - v_g.dt), f.created_at desc
     limit 1;
    if v_ref.id is null then
      acao := 'revisar'; ficha := null; colaborador := v_g.nome; data := v_g.dt; rqbs := v_g.rqbs;
      itens := null; motivo := null; detalhe := 'colaborador sem nenhuma ficha para copiar a função';
      return next;
      continue;
    end if;
    select f.data_admissao into v_adm from public.ssma_fichas_epi f
     where f.pessoa_id = v_g.pessoa_id and f.data_admissao is not null
     order by f.data_entrega desc limit 1;
    -- Mesmo critério da tela (motivoPadrao): 1ª entrega = admissão; depois, reposição.
    v_motivo := case when exists (select 1 from public.ssma_fichas_epi f
                                   where f.pessoa_id = v_g.pessoa_id and f.status = 'ATIVA' and f.data_entrega < v_g.dt)
                     then 2 else 1 end;
    v_obs := format('Regularização em %s: EPI entregue no balcão sem ficha (%s). A baixa no SAP é dessa(s) requisição(ões) — esta ficha não gera outra.',
                    to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM/YYYY'), v_g.rqbs);

    if p_executar then
      select coalesce(max(split_part(f.codigo, '-', 3)::int), 0) + 1 into v_n
        from public.ssma_fichas_epi f
       where f.codigo like 'EPI-__' || to_char(v_g.dt, 'MMYY') || '-%'
         and split_part(f.codigo, '-', 3) ~ '^\d+$';
      v_codigo := 'EPI-' || to_char(v_g.dt, 'DDMMYY') || '-' || case when v_n < 10 then '0' || v_n else v_n::text end;

      insert into public.ssma_fichas_epi (
        codigo, pessoa_id, registro, nome, cargo_rh, setor, funcao_id, funcao_nome,
        data_admissao, data_entrega, assinatura_colaborador, assinatura_pendente, assinado_em,
        observacoes, origem, criado_por, criado_por_nome
      ) values (
        v_codigo, v_g.pessoa_id, v_ref.registro, v_ref.nome, v_ref.cargo_rh, v_ref.setor, v_ref.funcao_id, v_ref.funcao_nome,
        v_adm, v_g.dt, null, true, null,
        v_obs, 'DIGITAL', v_por_id, v_por_nome
      ) returning id into v_ficha_id;

      insert into public.ssma_fichas_epi_itens (
        ficha_id, ordem, epi_book_id, requisito_id, grupo_epi, categoria, descricao,
        ca, codigo_sap, tamanho, quantidade, motivo, fora_da_matriz
      )
      select v_ficha_id, (row_number() over (order by bk.grupo_epi, m.mat) - 1)::smallint,
             bk.id, rq.id, bk.grupo_epi, bk.categoria, bk.descricao_epi,
             bk.ca, bk.codigo_sap, bk.tamanho, m.q, v_motivo, rq.id is null
        from (select x.mat, sum(x.q) q from _reg x
               where x.classe = 'ficha_nova' and x.pessoa_id = v_g.pessoa_id and x.dt = v_g.dt group by 1) m
        join lateral (select b.* from public.ssma_book_epis b
                       where b.ativo and public.alm_chave_material(b.codigo_sap) = m.mat
                       order by b.updated_at desc nulls last limit 1) bk on true
        left join lateral (select p.id from public.ssma_epi_por_funcao p
                             join public.ssma_book_epis b2 on b2.id = p.epi_book_id
                            where p.funcao_id = v_ref.funcao_id and p.ativo
                              and upper(trim(b2.grupo_epi)) = upper(trim(bk.grupo_epi))
                              and upper(trim(coalesce(b2.categoria, ''))) = upper(trim(coalesce(bk.categoria, '')))
                            limit 1) rq on true;

      insert into public.ssma_fichas_epi_regularizacao
        (rqb_item_id, requisicao_id, rqb_codigo, ficha_id, ficha_codigo, tipo, material, quantidade, criado_por, criado_por_nome)
      select x.item_id, x.rqb_id, x.rqb, v_ficha_id, v_codigo, 'ficha_nova', x.material, x.q, v_por_id, v_por_nome
        from _reg x where x.classe = 'ficha_nova' and x.pessoa_id = v_g.pessoa_id and x.dt = v_g.dt;
      v_novas := v_novas + 1;
    else
      v_codigo := 'EPI-' || to_char(v_g.dt, 'DDMMYY') || '-??';
    end if;

    acao := 'criar'; ficha := v_codigo; colaborador := v_g.nome; data := v_g.dt; rqbs := v_g.rqbs; motivo := v_motivo;
    select string_agg(x.material || ' × ' || trim_scale(x.q), ', ' order by x.material) into itens
      from _reg x where x.classe = 'ficha_nova' and x.pessoa_id = v_g.pessoa_id and x.dt = v_g.dt;
    detalhe := format('função %s (da ficha %s), assinatura pendente', v_ref.funcao_nome, v_ref.codigo);
    return next;
  end loop;

  if p_executar then
    -- Histórico de cada RQB envolvida.
    for v_r in
      select g.requisicao_id, string_agg(distinct g.ficha_codigo, ', ') fichas
        from public.ssma_fichas_epi_regularizacao g
       where g.created_at >= now() - interval '1 minute' and g.criado_por = v_por_id
       group by 1
    loop
      perform public.alm_req_balcao_log(v_r.requisicao_id, 'edicao',
        jsonb_build_array(jsonb_build_object('campo', 'ficha_epi', 'de', null, 'para', v_r.fichas)),
        'EPI registrado na ficha ' || v_r.fichas || ' (regularização). A baixa no SAP continua sendo esta requisição.', v_por_nome);
    end loop;

    if v_novas + v_vinculadas > 0 then
      insert into public.alm_contingencias_eventos (acao, verificacao, referencia, resumo, detalhe, por_id, por_nome)
      values ('correcao', 'regularizacao_ficha_epi', 'EPI sem ficha',
              format('Regularização das saídas manuais de EPI: %s ficha(s) criada(s) com assinatura pendente, %s ficha(s) existente(s) vinculada(s).', v_novas, v_vinculadas),
              jsonb_build_object('fichas_novas', v_novas, 'fichas_vinculadas', v_vinculadas), v_por_id, v_por_nome);
    end if;
  end if;
end;
$$;
revoke all on function public.ssma_epi_regularizar_saidas_manuais(boolean, text, text) from public, anon, authenticated;
