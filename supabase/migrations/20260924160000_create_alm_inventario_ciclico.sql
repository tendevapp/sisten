-- =====================================================================
-- Almoxarifado > Inventário Cíclico (FRM.ALM-0015).
--
-- Digitaliza a "Ficha de Inventário Cíclico" em papel: escolhe-se uma
-- lista de itens (normalmente os 80/20 do almoxarifado), o almoxarife conta
-- cada um e o sistema compara com o saldo da ZL0024 (`sap_zl0024_stk`).
--
--   alm_inventarios           — cabeçalho (data, responsável, conferente).
--   alm_inventario_itens      — material × depósito a contar e o desfecho.
--   alm_inventario_contagens  — cada contagem, IMUTÁVEL: a 2ª não
--                               substitui a 1ª, fica ao lado dela.
--
-- Contagem CEGA: o saldo do sistema não chega ao aparelho enquanto o item
-- pode ser recontado. A RPC compara no banco e só devolve "bateu / não
-- bateu". O saldo usado em cada comparação fica em
-- `alm_inventario_contagens.saldo_ref`, coluna sem grant de leitura, e só
-- é copiado para `alm_inventario_itens.saldo_sistema` quando o item
-- encerra — a partir daí não cabe nova contagem.
--
-- Fluxo do item:
--   pendente ──contagem──▶ conferido            (bateu com a ZL0024)
--            └──────────▶ aguardando_decisao    (divergiu: recontar?)
--   aguardando_decisao ──nova contagem──▶ conferido | aguardando_decisao
--                      └──encerrar─────▶ divergente (saldo revelado + alerta)
--   Na 3ª contagem divergente o item encerra sozinho como divergente.
--
-- Código `INV-DDMMYY-NN` (regra 2 do CLAUDE.md), índice por DIA via
-- `alm_receb_proximo_codigo` — mesmo recorte das outras fichas do almox.
-- =====================================================================

create table if not exists public.alm_inventarios (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  data date not null,
  criterio text,
  observacao text,
  conferente_nome text,
  status text not null default 'aberto' check (status in ('aberto','concluido')),
  concluido_em timestamptz,
  criado_por_id uuid,
  criado_por_nome text,
  excluido boolean not null default false,
  excluido_em timestamptz,
  excluido_por text,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create index if not exists idx_alm_inventarios_data on public.alm_inventarios (data desc) where not excluido;

create table if not exists public.alm_inventario_itens (
  id uuid primary key default gen_random_uuid(),
  inventario_id uuid not null references public.alm_inventarios(id) on delete cascade,
  ordem int not null default 0,
  material text not null,
  descricao text,
  unidade text,
  deposito text not null,
  -- Classe da curva no momento da seleção (A/B/C) — só informativo.
  classe text,
  status text not null default 'pendente'
    check (status in ('pendente','aguardando_decisao','conferido','divergente')),
  -- Preenchidos só quando o item encerra.
  saldo_sistema numeric,
  qtd_final numeric,
  diferenca numeric,
  alerta text,
  encerrado_em timestamptz,
  encerrado_por text,
  created_at timestamptz not null default now(),
  unique (inventario_id, material, deposito)
);

create index if not exists idx_alm_inventario_itens_inv on public.alm_inventario_itens (inventario_id);
create index if not exists idx_alm_inventario_itens_material on public.alm_inventario_itens (material);

create table if not exists public.alm_inventario_contagens (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.alm_inventario_itens(id) on delete cascade,
  numero int not null check (numero between 1 and 3),
  quantidade numeric not null check (quantidade >= 0),
  divergente boolean not null,
  saldo_ref numeric not null,
  endereco_encontrado text,
  validade date,
  observacao text,
  contado_por_id uuid,
  contado_por_nome text,
  created_at timestamptz not null default now(),
  unique (item_id, numero)
);

create index if not exists idx_alm_inventario_contagens_item on public.alm_inventario_contagens (item_id);

-- RLS: leitura para autenticados; escrita só pelas RPCs (security definer).
alter table public.alm_inventarios enable row level security;
alter table public.alm_inventario_itens enable row level security;
alter table public.alm_inventario_contagens enable row level security;

drop policy if exists alm_inventarios_sel on public.alm_inventarios;
create policy alm_inventarios_sel on public.alm_inventarios for select to authenticated using (true);
drop policy if exists alm_inventario_itens_sel on public.alm_inventario_itens;
create policy alm_inventario_itens_sel on public.alm_inventario_itens for select to authenticated using (true);
drop policy if exists alm_inventario_contagens_sel on public.alm_inventario_contagens;
create policy alm_inventario_contagens_sel on public.alm_inventario_contagens for select to authenticated using (true);

revoke all on public.alm_inventarios from anon;
revoke all on public.alm_inventario_itens from anon;
revoke all on public.alm_inventario_contagens from anon;
revoke insert, update, delete on public.alm_inventarios from authenticated;
revoke insert, update, delete on public.alm_inventario_itens from authenticated;
revoke all on public.alm_inventario_contagens from authenticated;
-- `saldo_ref` fica de fora: é o que mantém a contagem cega.
grant select (id, item_id, numero, quantidade, divergente, endereco_encontrado, validade,
              observacao, contado_por_id, contado_por_nome, created_at)
  on public.alm_inventario_contagens to authenticated;

-- Máximo de contagens por item. Na última, divergência encerra o item.
create or replace function public.alm_inv_max_contagens()
returns int language sql immutable as $$ select 3 $$;

-- Saldo atual do material no depósito, somando as linhas da ZL0024.
create or replace function public.alm_inv_saldo_zl0024(p_material text, p_deposito text)
returns numeric
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(sum(quantidade), 0)
    from public.sap_zl0024_stk
   where material = p_material
     and lpad(deposito, 4, '0') = lpad(p_deposito, 4, '0');
$$;

-- Fecha o inventário quando não sobra item pendente nem aguardando decisão.
create or replace function public.alm_inv_atualizar_status(p_inventario uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.alm_inventarios i set
    status = case when exists (
      select 1 from public.alm_inventario_itens t
       where t.inventario_id = i.id and t.status in ('pendente','aguardando_decisao')
    ) then 'aberto' else 'concluido' end,
    concluido_em = case when exists (
      select 1 from public.alm_inventario_itens t
       where t.inventario_id = i.id and t.status in ('pendente','aguardando_decisao')
    ) then null else coalesce(i.concluido_em, now()) end,
    updated_at = now()
  where i.id = p_inventario;
end;
$$;

-- Insere itens num inventário. p_itens: [{material, deposito, classe}] —
-- descrição e unidade vêm da ZL0024, não do cliente. Ignora repetidos.
create or replace function public.alm_inv_inserir_itens(p_inventario uuid, p_itens jsonb)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_item jsonb;
  v_mat text;
  v_dep text;
  v_ordem int;
  v_est record;
  v_n int := 0;
begin
  select coalesce(max(ordem), 0) into v_ordem from public.alm_inventario_itens where inventario_id = p_inventario;
  for v_item in select * from jsonb_array_elements(p_itens) loop
    v_mat := trim(v_item->>'material');
    v_dep := lpad(trim(v_item->>'deposito'), 4, '0');
    if coalesce(v_mat, '') = '' or coalesce(trim(v_item->>'deposito'), '') = '' then
      raise exception 'Item sem material ou depósito.';
    end if;
    select max(txt_breve_material) as descricao, max(umb) as umb, count(*) as n
      into v_est
      from public.sap_zl0024_stk
     where material = v_mat and lpad(deposito, 4, '0') = v_dep;
    if v_est.n = 0 then
      raise exception 'Material % não consta na ZL0024 do depósito %.', v_mat, v_dep;
    end if;
    if exists (select 1 from public.alm_inventario_itens
                where inventario_id = p_inventario and material = v_mat and deposito = v_dep) then
      continue;
    end if;
    v_ordem := v_ordem + 1;
    insert into public.alm_inventario_itens (inventario_id, ordem, material, descricao, unidade, deposito, classe)
    values (p_inventario, v_ordem, v_mat, v_est.descricao, v_est.umb, v_dep, nullif(v_item->>'classe', ''));
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

-- Cria o inventário com a lista de itens.
-- p_inv: {data, criterio, observacao, conferente_nome, criado_por_nome}
create or replace function public.alm_inv_criar(p_inv jsonb, p_itens jsonb)
returns public.alm_inventarios
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.alm_inventarios;
  v_data date := coalesce(nullif(p_inv->>'data','')::date, current_date);
begin
  if auth.uid() is null then
    raise exception 'Sessão expirada. Entre novamente.';
  end if;
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Selecione ao menos um item para contar.';
  end if;

  insert into public.alm_inventarios
    (codigo, data, criterio, observacao, conferente_nome, criado_por_id, criado_por_nome)
  values
    (public.alm_receb_proximo_codigo('INV', v_data, 'alm_inventarios'), v_data,
     nullif(trim(p_inv->>'criterio'),''), nullif(trim(p_inv->>'observacao'),''),
     nullif(upper(trim(p_inv->>'conferente_nome')),''), auth.uid(), nullif(p_inv->>'criado_por_nome',''))
  returning * into v_row;

  perform public.alm_inv_inserir_itens(v_row.id, p_itens);
  return v_row;
end;
$$;

-- Acrescenta itens a um inventário aberto (autor/admin).
create or replace function public.alm_inv_adicionar_itens(p_id uuid, p_itens jsonb)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.alm_inventarios;
  v_n int;
begin
  select * into v_row from public.alm_inventarios where id = p_id and not excluido for update;
  if not found then raise exception 'Inventário não encontrado.'; end if;
  if not public.form_pode_editar(v_row.criado_por_id::text) then
    raise exception 'Só quem abriu o inventário (ou um admin) pode mudar a lista de itens.';
  end if;
  v_n := public.alm_inv_inserir_itens(p_id, p_itens);
  perform public.alm_inv_atualizar_status(p_id);
  return v_n;
end;
$$;

-- Tira da lista um item ainda não contado (autor/admin).
create or replace function public.alm_inv_remover_item(p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_item public.alm_inventario_itens;
  v_dono uuid;
begin
  select * into v_item from public.alm_inventario_itens where id = p_item_id for update;
  if not found then raise exception 'Item não encontrado.'; end if;
  select criado_por_id into v_dono from public.alm_inventarios where id = v_item.inventario_id;
  if not public.form_pode_editar(v_dono::text) then
    raise exception 'Só quem abriu o inventário (ou um admin) pode mudar a lista de itens.';
  end if;
  if exists (select 1 from public.alm_inventario_contagens where item_id = p_item_id) then
    raise exception 'O item % já foi contado — a contagem não pode ser desfeita.', v_item.material;
  end if;
  delete from public.alm_inventario_itens where id = p_item_id;
  perform public.alm_inv_atualizar_status(v_item.inventario_id);
end;
$$;

-- Registra uma contagem. Não há update nem delete de contagem: a próxima
-- entra ao lado. Qualquer usuário logado conta (o conferente nem sempre é
-- quem abriu o inventário). Devolve o desfecho — o saldo só quando o item
-- encerrou.
create or replace function public.alm_inv_registrar_contagem(
  p_item_id uuid, p_quantidade numeric, p_endereco text, p_validade date, p_observacao text, p_por text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_item public.alm_inventario_itens;
  v_numero int;
  v_saldo numeric;
  v_div boolean;
  v_max int := public.alm_inv_max_contagens();
begin
  if auth.uid() is null then
    raise exception 'Sessão expirada. Entre novamente.';
  end if;
  if p_quantidade is null or p_quantidade < 0 then
    raise exception 'Informe a quantidade contada (zero ou mais).';
  end if;

  select * into v_item from public.alm_inventario_itens where id = p_item_id for update;
  if not found then raise exception 'Item não encontrado.'; end if;
  if exists (select 1 from public.alm_inventarios where id = v_item.inventario_id and excluido) then
    raise exception 'Inventário excluído.';
  end if;
  if v_item.status not in ('pendente','aguardando_decisao') then
    raise exception 'O item % já foi encerrado — não cabe nova contagem.', v_item.material;
  end if;

  select coalesce(max(numero), 0) + 1 into v_numero from public.alm_inventario_contagens where item_id = p_item_id;
  if v_numero > v_max then
    raise exception 'O item % já tem % contagens.', v_item.material, v_max;
  end if;

  v_saldo := public.alm_inv_saldo_zl0024(v_item.material, v_item.deposito);
  v_div := round(p_quantidade, 3) <> round(v_saldo, 3);

  insert into public.alm_inventario_contagens
    (item_id, numero, quantidade, divergente, saldo_ref, endereco_encontrado, validade, observacao,
     contado_por_id, contado_por_nome)
  values
    (p_item_id, v_numero, p_quantidade, v_div, v_saldo, nullif(upper(trim(p_endereco)),''), p_validade,
     nullif(trim(p_observacao),''), auth.uid(), nullif(p_por,''));

  if not v_div then
    update public.alm_inventario_itens set
      status = 'conferido', saldo_sistema = v_saldo, qtd_final = p_quantidade, diferenca = 0,
      alerta = null, encerrado_em = now(), encerrado_por = nullif(p_por,'')
    where id = p_item_id returning * into v_item;
  elsif v_numero >= v_max then
    update public.alm_inventario_itens set
      status = 'divergente', saldo_sistema = v_saldo, qtd_final = p_quantidade,
      diferenca = p_quantidade - v_saldo,
      alerta = format('Divergente após %s contagens: contado %s, ZL0024 %s (diferença %s).',
                      v_numero, p_quantidade, v_saldo, p_quantidade - v_saldo),
      encerrado_em = now(), encerrado_por = nullif(p_por,'')
    where id = p_item_id returning * into v_item;
  else
    update public.alm_inventario_itens set status = 'aguardando_decisao'
    where id = p_item_id returning * into v_item;
  end if;

  perform public.alm_inv_atualizar_status(v_item.inventario_id);

  return jsonb_build_object(
    'numero', v_numero,
    'divergente', v_div,
    'status', v_item.status,
    'pode_recontar', v_item.status = 'aguardando_decisao',
    'saldo_sistema', v_item.saldo_sistema,
    'diferenca', v_item.diferenca
  );
end;
$$;

-- "Não quero recontar": revela o saldo comparado na última contagem e
-- grava o alerta. Depois disso o item não aceita contagem.
create or replace function public.alm_inv_encerrar_item(p_item_id uuid, p_por text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_item public.alm_inventario_itens;
  v_ult public.alm_inventario_contagens;
begin
  if auth.uid() is null then
    raise exception 'Sessão expirada. Entre novamente.';
  end if;
  select * into v_item from public.alm_inventario_itens where id = p_item_id for update;
  if not found then raise exception 'Item não encontrado.'; end if;
  if v_item.status <> 'aguardando_decisao' then
    raise exception 'O item % não está aguardando decisão.', v_item.material;
  end if;
  select * into v_ult from public.alm_inventario_contagens where item_id = p_item_id order by numero desc limit 1;

  update public.alm_inventario_itens set
    status = 'divergente', saldo_sistema = v_ult.saldo_ref, qtd_final = v_ult.quantidade,
    diferenca = v_ult.quantidade - v_ult.saldo_ref,
    alerta = format('Divergente, encerrado sem nova contagem após %s contagem(ns): contado %s, ZL0024 %s (diferença %s).',
                    v_ult.numero, v_ult.quantidade, v_ult.saldo_ref, v_ult.quantidade - v_ult.saldo_ref),
    encerrado_em = now(), encerrado_por = nullif(p_por,'')
  where id = p_item_id returning * into v_item;

  perform public.alm_inv_atualizar_status(v_item.inventario_id);

  return jsonb_build_object(
    'status', v_item.status, 'saldo_sistema', v_item.saldo_sistema, 'diferenca', v_item.diferenca,
    'alerta', v_item.alerta
  );
end;
$$;

-- Exclusão lógica, só enquanto nada foi contado (autor/admin).
create or replace function public.alm_inv_excluir(p_id uuid, p_por text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_dono uuid;
begin
  select criado_por_id into v_dono from public.alm_inventarios where id = p_id and not excluido;
  if not found then raise exception 'Inventário não encontrado.'; end if;
  if not public.form_pode_editar(v_dono::text) then
    raise exception 'Só quem abriu o inventário (ou um admin) pode excluí-lo.';
  end if;
  if exists (
    select 1 from public.alm_inventario_contagens c
      join public.alm_inventario_itens t on t.id = c.item_id
     where t.inventario_id = p_id
  ) then
    raise exception 'Inventário com contagem registrada não pode ser excluído.';
  end if;
  update public.alm_inventarios set excluido = true, excluido_em = now(), excluido_por = p_por where id = p_id;
end;
$$;

-- Funções internas: ninguém chama direto.
revoke execute on function public.alm_inv_saldo_zl0024(text, text) from public, anon, authenticated;
revoke execute on function public.alm_inv_atualizar_status(uuid) from public, anon, authenticated;
revoke execute on function public.alm_inv_inserir_itens(uuid, jsonb) from public, anon, authenticated;
-- RPCs da tela: só logado.
revoke execute on function public.alm_inv_criar(jsonb, jsonb) from public, anon;
revoke execute on function public.alm_inv_adicionar_itens(uuid, jsonb) from public, anon;
revoke execute on function public.alm_inv_remover_item(uuid) from public, anon;
revoke execute on function public.alm_inv_registrar_contagem(uuid, numeric, text, date, text, text) from public, anon;
revoke execute on function public.alm_inv_encerrar_item(uuid, text) from public, anon;
revoke execute on function public.alm_inv_excluir(uuid, text) from public, anon;
grant execute on function public.alm_inv_criar(jsonb, jsonb) to authenticated;
grant execute on function public.alm_inv_adicionar_itens(uuid, jsonb) to authenticated;
grant execute on function public.alm_inv_remover_item(uuid) to authenticated;
grant execute on function public.alm_inv_registrar_contagem(uuid, numeric, text, date, text, text) to authenticated;
grant execute on function public.alm_inv_encerrar_item(uuid, text) to authenticated;
grant execute on function public.alm_inv_excluir(uuid, text) to authenticated;
