-- =====================================================================
-- Requisição no Balcão — aplicação por lista fixa de centros de custo (PEP).
--
-- Em vez dos ~430 PEPs de nível 3 do `fin_pep`, o balcão usa a folha
-- "CENTRO DE CUSTOS (PEP) 1130" afixada no almoxarifado: um PEP por área.
-- A linha PRODUÇÃO (TEN001202001604) está riscada na folha e fica de fora.
-- `nome` é o que vai como Descricao_PEP na planilha de baixa.
-- =====================================================================

create table if not exists public.alm_balcao_aplicacoes (
  wbs text primary key,
  nome text not null,
  ordem int not null default 0,
  ativo boolean not null default true
);

alter table public.alm_balcao_aplicacoes enable row level security;
drop policy if exists alm_balcao_aplicacoes_sel on public.alm_balcao_aplicacoes;
create policy alm_balcao_aplicacoes_sel on public.alm_balcao_aplicacoes
  for select to authenticated using (true);
drop policy if exists alm_balcao_aplicacoes_admin on public.alm_balcao_aplicacoes;
create policy alm_balcao_aplicacoes_admin on public.alm_balcao_aplicacoes
  for all to authenticated using (public.has_role('admin')) with check (public.has_role('admin'));
revoke all on public.alm_balcao_aplicacoes from anon;

insert into public.alm_balcao_aplicacoes (ordem, nome, wbs) values
  (1,  'ADMINISTRATIVO',            'TEN001201003402'),
  (2,  'ALMOÇO/JANTA',              'TEN001601010100'),
  (3,  'ALMOXARIFADO',              'TEN001201016505'),
  (4,  'AMBULATÓRIO',               'TEN001201053509'),
  (5,  'ARMAZEM - EXPEDIÇÃO',       'TEN001127035000'),
  (6,  'CAFÉ/LANCHE',               'TEN001601010101'),
  (7,  'CALDERARIA',                'TEN001202001607'),
  (8,  'COMUNICAÇÃO',               'TEN001201004000'),
  (9,  'CONSTRUÇÃO',                'TEN001301002020'),
  (10, 'CONTABILIDADE',             'TEN001201033000'),
  (11, 'DIRETORIA',                 'TEN001201039401'),
  (12, 'ENGENHARIA',                'TEN001201034507'),
  (13, 'FINANCEIRO',                'TEN001201037403'),
  (14, 'LEAN',                      'TEN001202001605'),
  (15, 'MANUTENÇÃO',                'TEN001202001606'),
  (16, 'MEIO AMBIENTE',             'TEN001201053510'),
  (17, 'PEQUENOS EQUIPAMENTOS',     'TEN001132001000'),
  (18, 'PLANEJAMENTO',              'TEN001201052505'),
  (19, 'QUALIDADE',                 'TEN001201053507'),
  (20, 'RAZÃO SOCIAL',              'TEN001201053511'),
  (21, 'REFEITÓRIO',                'TEN001201014407'),
  (22, 'RH',                        'TEN001201005404'),
  (23, 'SEGURANÇA DO TRABALHO',     'TEN001201053508'),
  (24, 'SERVIÇOS GERAIS',           'TEN001201005014'),
  (25, 'SUPRIMENTOS',               'TEN001201016503'),
  (26, 'TI',                        'TEN001201057408'),
  (27, 'EPI - PRODUÇÃO',            'TEN001134003000'),
  (28, 'EPI - DEMAIS SETORES (ADM, MANUT, ETC.)', 'TEN001201090000')
on conflict (wbs) do update set nome = excluded.nome, ordem = excluded.ordem;

-- A RPC de gravação passa a validar contra esta lista (antes: fin_pep).
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
  v_pep text := nullif(upper(trim(p_req->>'aplicacao_pep')),'');
  v_pep_nome text;
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
  if v_pep is null then
    raise exception 'Informe a aplicação (centro de custo / PEP).';
  end if;
  select nome into v_pep_nome from public.alm_balcao_aplicacoes where wbs = v_pep and ativo;
  if not found then
    raise exception 'PEP % não está na lista de aplicações do balcão.', v_pep;
  end if;
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Adicione ao menos um item.';
  end if;

  if p_id is null then
    insert into public.alm_req_balcao
      (codigo, data, turno, tipo_movimento, deposito_origem, deposito_destino,
       colaborador_id, colaborador_nome, colaborador_registro, aplicacao_pep, aplicacao,
       observacao, criado_por_id, criado_por_nome)
    values
      (public.alm_receb_proximo_codigo('RQB', v_data, 'alm_req_balcao'), v_data,
       nullif(p_req->>'turno',''), v_tipo, v_dep, case when v_tipo = 'transferencia' then v_dest end,
       nullif(p_req->>'colaborador_id','')::uuid, upper(trim(p_req->>'colaborador_nome')),
       nullif(p_req->>'colaborador_registro',''), v_pep, v_pep_nome,
       nullif(trim(p_req->>'observacao'),''), auth.uid(), nullif(p_req->>'criado_por_nome',''))
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
      aplicacao_setor_id = null,
      aplicacao_pep = v_pep,
      aplicacao = v_pep_nome,
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

revoke all on function public.alm_req_balcao_salvar(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.alm_req_balcao_salvar(uuid, jsonb, jsonb) to authenticated;
