-- =====================================================================
-- Almoxarifado > Requisição no Balcão (FRM.ALM-0014).
--
-- Digitaliza o "Formulário de Retirada de Materiais do Almoxarifado" que o
-- almoxarife preenchia à mão: quem retira, para qual aplicação (setor) e
-- quais itens. Quem preenche é o almoxarife; o colaborador vem de
-- `rh_pessoas` e a aplicação de `rh_setores`.
--
--   alm_req_balcao        — cabeçalho: tipo de movimento (saída ou
--                           transferência), depósito de saída, colaborador,
--                           aplicação, e o nº do documento SAP quando a
--                           baixa for lançada (antes era "Baixa nº ..." no
--                           rodapé da folha).
--   alm_req_balcao_itens  — itens baixados.
--
-- Só sai item que TEM estoque na ZL0024 (`sap_zl0024_stk`) no depósito de
-- saída, e nunca mais que o saldo importado. A RPC confere isso no banco —
-- a tela já filtra, mas a regra não pode depender dela.
--
-- Código `RQB-DDMMYY-NN` (regra 2 do CLAUDE.md), índice reiniciando POR
-- DIA: o balcão atende dezenas de retiradas por dia e um sequencial mensal
-- passaria de três dígitos. Gerado na RPC via `alm_receb_proximo_codigo`.
-- =====================================================================

create table if not exists public.alm_req_balcao (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  data date not null,
  turno text,
  tipo_movimento text not null check (tipo_movimento in ('saida','transferencia')),
  deposito_origem text not null,
  -- Só na transferência; opcional porque o destino às vezes só é
  -- definido no lançamento do SAP.
  deposito_destino text,
  colaborador_id uuid references public.rh_pessoas(id) on delete set null,
  colaborador_nome text not null,
  colaborador_registro text,
  aplicacao_setor_id uuid references public.rh_setores(id) on delete set null,
  aplicacao text not null,
  observacao text,
  doc_sap text,
  doc_sap_em timestamptz,
  doc_sap_por text,
  criado_por_id uuid,
  criado_por_nome text,
  excluido boolean not null default false,
  excluido_em timestamptz,
  excluido_por text,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create index if not exists idx_alm_req_balcao_data on public.alm_req_balcao (data desc) where not excluido;
create index if not exists idx_alm_req_balcao_pendente on public.alm_req_balcao (data) where not excluido and doc_sap is null;

create table if not exists public.alm_req_balcao_itens (
  id uuid primary key default gen_random_uuid(),
  requisicao_id uuid not null references public.alm_req_balcao(id) on delete cascade,
  ordem int not null default 0,
  material text not null,
  descricao text,
  unidade text,
  quantidade numeric not null check (quantidade > 0),
  -- Saldo da ZL0024 no momento da baixa — explica depois por que o sistema
  -- deixou (ou não) sair aquela quantidade.
  saldo_zl0024 numeric,
  created_at timestamptz not null default now()
);

create index if not exists idx_alm_req_balcao_itens_req on public.alm_req_balcao_itens (requisicao_id);
create index if not exists idx_alm_req_balcao_itens_material on public.alm_req_balcao_itens (material);

-- RLS: leitura livre para autenticados; escrita só pelas RPCs abaixo
-- (security definer), que aplicam a regra autor/admin.
alter table public.alm_req_balcao enable row level security;
alter table public.alm_req_balcao_itens enable row level security;

drop policy if exists alm_req_balcao_sel on public.alm_req_balcao;
create policy alm_req_balcao_sel on public.alm_req_balcao
  for select to authenticated using (true);
drop policy if exists alm_req_balcao_itens_sel on public.alm_req_balcao_itens;
create policy alm_req_balcao_itens_sel on public.alm_req_balcao_itens
  for select to authenticated using (true);

revoke insert, update, delete on public.alm_req_balcao from anon, authenticated;
revoke insert, update, delete on public.alm_req_balcao_itens from anon, authenticated;
revoke all on public.alm_req_balcao from anon;
revoke all on public.alm_req_balcao_itens from anon;

-- ---------------------------------------------------------------------
-- Salvar (criar ou editar). p_id nulo = nova requisição.
--
-- p_req:   {data, turno, tipo_movimento, deposito_origem, deposito_destino,
--           colaborador_id, colaborador_nome, colaborador_registro,
--           aplicacao_setor_id, aplicacao, observacao, criado_por_nome}
-- p_itens: [{material, quantidade}] — descrição, unidade e saldo vêm da
--          ZL0024, não do cliente.
-- ---------------------------------------------------------------------
create or replace function public.alm_req_balcao_salvar(p_id uuid, p_req jsonb, p_itens jsonb)
returns public.alm_req_balcao
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.alm_req_balcao;
  v_data date := coalesce(nullif(p_req->>'data','')::date, current_date);
  v_tipo text := p_req->>'tipo_movimento';
  v_dep text := nullif(trim(p_req->>'deposito_origem'),'');
  v_dest text := nullif(trim(p_req->>'deposito_destino'),'');
  v_item jsonb;
  v_ordem int := 0;
  v_mat text;
  v_qtd numeric;
  v_estoque record;
begin
  if auth.uid() is null then
    raise exception 'Sessão expirada. Entre novamente.';
  end if;
  if v_tipo not in ('saida','transferencia') then
    raise exception 'Escolha o tipo de movimento: saída ou transferência.';
  end if;
  if v_dep is null then
    raise exception 'Informe o depósito de saída.';
  end if;
  if v_tipo = 'transferencia' and v_dest is not null and v_dest = v_dep then
    raise exception 'O depósito de destino precisa ser diferente do de saída.';
  end if;
  if coalesce(trim(p_req->>'colaborador_nome'),'') = '' then
    raise exception 'Informe o colaborador que está retirando.';
  end if;
  if coalesce(trim(p_req->>'aplicacao'),'') = '' then
    raise exception 'Informe a aplicação (setor).';
  end if;
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Adicione ao menos um item.';
  end if;

  if p_id is null then
    insert into public.alm_req_balcao
      (codigo, data, turno, tipo_movimento, deposito_origem, deposito_destino,
       colaborador_id, colaborador_nome, colaborador_registro, aplicacao_setor_id, aplicacao,
       observacao, criado_por_id, criado_por_nome)
    values
      (public.alm_receb_proximo_codigo('RQB', v_data, 'alm_req_balcao'), v_data,
       nullif(p_req->>'turno',''), v_tipo, v_dep, case when v_tipo = 'transferencia' then v_dest end,
       nullif(p_req->>'colaborador_id','')::uuid, upper(trim(p_req->>'colaborador_nome')),
       nullif(p_req->>'colaborador_registro',''), nullif(p_req->>'aplicacao_setor_id','')::uuid,
       upper(trim(p_req->>'aplicacao')), nullif(trim(p_req->>'observacao'),''),
       auth.uid(), nullif(p_req->>'criado_por_nome',''))
    returning * into v_row;
  else
    select * into v_row from public.alm_req_balcao where id = p_id and not excluido for update;
    if not found then
      raise exception 'Requisição não encontrada.';
    end if;
    if not public.form_pode_editar(v_row.criado_por_id::text) then
      raise exception 'Só quem registrou a requisição (ou um admin) pode editá-la.';
    end if;
    update public.alm_req_balcao set
      data = v_data,
      turno = nullif(p_req->>'turno',''),
      tipo_movimento = v_tipo,
      deposito_origem = v_dep,
      deposito_destino = case when v_tipo = 'transferencia' then v_dest end,
      colaborador_id = nullif(p_req->>'colaborador_id','')::uuid,
      colaborador_nome = upper(trim(p_req->>'colaborador_nome')),
      colaborador_registro = nullif(p_req->>'colaborador_registro',''),
      aplicacao_setor_id = nullif(p_req->>'aplicacao_setor_id','')::uuid,
      aplicacao = upper(trim(p_req->>'aplicacao')),
      observacao = nullif(trim(p_req->>'observacao'),''),
      updated_at = now()
    where id = p_id
    returning * into v_row;
    delete from public.alm_req_balcao_itens where requisicao_id = p_id;
  end if;

  for v_item in select * from jsonb_array_elements(p_itens) loop
    v_ordem := v_ordem + 1;
    v_mat := trim(v_item->>'material');
    v_qtd := nullif(v_item->>'quantidade','')::numeric;
    if v_qtd is null or v_qtd <= 0 then
      raise exception 'Item %: quantidade precisa ser maior que zero.', v_mat;
    end if;

    select max(txt_breve_material) as descricao, max(umb) as umb, sum(quantidade) as saldo
      into v_estoque
      from public.sap_zl0024_stk
     where material = v_mat
       and lpad(deposito, 4, '0') = lpad(v_dep, 4, '0');

    if v_estoque.saldo is null or v_estoque.saldo <= 0 then
      raise exception 'Material % não tem estoque no depósito % (ZL0024).', v_mat, v_dep;
    end if;
    if v_qtd > v_estoque.saldo then
      raise exception 'Material %: quantidade % maior que o saldo % no depósito %.', v_mat, v_qtd, v_estoque.saldo, v_dep;
    end if;

    insert into public.alm_req_balcao_itens
      (requisicao_id, ordem, material, descricao, unidade, quantidade, saldo_zl0024)
    values
      (v_row.id, v_ordem, v_mat, v_estoque.descricao, v_estoque.umb, v_qtd, v_estoque.saldo);
  end loop;

  return v_row;
end;
$$;

-- Nº do documento SAP da baixa/transferência — o almoxarife lança no SAP no
-- fim do turno e informa um documento para várias requisições de uma vez
-- (como o "Baixa nº" único no rodapé da folha). Sem trava de autor: quem
-- lança no SAP nem sempre é quem atendeu no balcão. Documento vazio desfaz.
create or replace function public.alm_req_balcao_informar_doc_sap(p_ids uuid[], p_doc text, p_por text)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_n int;
begin
  if auth.uid() is null then
    raise exception 'Sessão expirada. Entre novamente.';
  end if;
  update public.alm_req_balcao set
    doc_sap = nullif(trim(p_doc),''),
    doc_sap_em = case when nullif(trim(p_doc),'') is null then null else now() end,
    doc_sap_por = case when nullif(trim(p_doc),'') is null then null else p_por end
  where id = any(p_ids) and not excluido;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- Exclusão lógica — some da tela, permanece no banco.
create or replace function public.alm_req_balcao_excluir(p_id uuid, p_por text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_dono uuid;
begin
  select criado_por_id into v_dono from public.alm_req_balcao where id = p_id and not excluido;
  if not found then
    raise exception 'Requisição não encontrada.';
  end if;
  if not public.form_pode_editar(v_dono::text) then
    raise exception 'Só quem registrou a requisição (ou um admin) pode excluí-la.';
  end if;
  update public.alm_req_balcao
     set excluido = true, excluido_em = now(), excluido_por = p_por
   where id = p_id;
end;
$$;

-- `revoke from public` não basta no Supabase: `anon` tem grant direto.
revoke all on function public.alm_req_balcao_salvar(uuid, jsonb, jsonb) from public, anon;
revoke all on function public.alm_req_balcao_informar_doc_sap(uuid[], text, text) from public, anon;
revoke all on function public.alm_req_balcao_excluir(uuid, text) from public, anon;
grant execute on function public.alm_req_balcao_salvar(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.alm_req_balcao_informar_doc_sap(uuid[], text, text) to authenticated;
grant execute on function public.alm_req_balcao_excluir(uuid, text) to authenticated;
