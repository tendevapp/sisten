-- Importação histórica: identidade = data/material/depósito/ocorrência na ordem da fonte.
-- A ocorrência preserva linhas repetidas no mesmo dia. Linha física não é a identidade.
alter table public.alm_inventario_itens add column origem_chave text;
create unique index uq_alm_inv_origem_chave on public.alm_inventario_itens(origem_chave) where origem_chave is not null;

create table public.alm_inv_importacoes (
  id uuid primary key default gen_random_uuid(),
  arquivo text not null,
  created_at timestamptz not null default now(),
  criado_por uuid,
  resumo jsonb not null
);
alter table public.alm_inv_importacoes enable row level security;
revoke all on public.alm_inv_importacoes from anon, authenticated;
grant select on public.alm_inv_importacoes to authenticated;
create policy alm_inv_importacoes_sel on public.alm_inv_importacoes for select to authenticated
using (public.has_role('admin') or public.has_page_access('almox_importar_planilhas'));

-- Normaliza apenas vazios; números, sinais e diferenças da fonte são preservados.
create function public.alm_inv_normalizar_origem(p_dados jsonb) returns jsonb
language sql immutable set search_path = public, pg_temp as $$
  select coalesce(jsonb_object_agg(key, case when value = '""'::jsonb then 'null'::jsonb
    when key in ('Material','Depósito','Data Validade') and value <> 'null'::jsonb then to_jsonb(trim(value #>> '{}')) else value end), '{}'::jsonb)
  from jsonb_each(p_dados);
$$;
revoke all on function public.alm_inv_normalizar_origem(jsonb) from public, anon, authenticated;

create function public.alm_inv_importar_base(p_linhas jsonb, p_arquivo text, p_gravar boolean default false)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_resumo jsonb;
  v_inv uuid;
  v_item uuid;
  v_data date;
  v_lote text := 'base-lancamento-' || gen_random_uuid()::text;
  v_nome text;
  v_r record;
  v_qtd numeric;
  v_saldo numeric;
begin
  if not (auth.uid() is null and session_user in ('postgres','supabase_admin')) and not exists (
    select 1 from public.profiles where id = auth.uid()::text and status = 'ativo'
      and ('admin' = any(roles) or page_access->>'almox_importar_planilhas' = 'true')
  ) then raise exception 'Sem permissão para importar inventário.'; end if;
  if jsonb_typeof(p_linhas) is distinct from 'array' or jsonb_array_length(p_linhas) not between 1 and 20000 then
    raise exception 'A importação deve conter de 1 a 20.000 registros.';
  end if;
  if nullif(trim(p_arquivo), '') is null then raise exception 'Informe o arquivo de origem.'; end if;
  select name into v_nome from public.profiles where id = auth.uid()::text;
  v_nome := coalesce(v_nome, 'MIGRAÇÃO HISTÓRICA');
  -- Serializa importações, incluindo a análise final imediatamente antes de gravar.
  perform pg_advisory_xact_lock(hashtext('alm_inv_importar_base'));
  drop table if exists pg_temp.alm_inv_entrada;
  create temp table alm_inv_entrada on commit drop as
    select x.*, concat(x.data, '|', x.material, '|', x.deposito, '|',
      row_number() over(partition by x.data,x.material,x.deposito order by x.linha)) chave
    from jsonb_to_recordset(p_linhas) as x(linha int,data date,material text,deposito text,dados jsonb);
  if exists (select 1 from pg_temp.alm_inv_entrada where linha < 4 or data is null
      or nullif(trim(material),'') is null or deposito !~ '^[0-9]{4}$' or deposito is null
      or jsonb_typeof(dados) is distinct from 'object'
      or dados->>'Status' is null or dados->>'Status' not in ('OK','Divergência')
      or (dados->>'Qtde Física')::numeric < 0
      or dados->>'Material' is distinct from material or (dados->>'Data')::date is distinct from data)
    or (select count(*) <> count(distinct linha) from pg_temp.alm_inv_entrada) then
    raise exception 'Registros inválidos na Base Lançamento.';
  end if;
  create unique index on alm_inv_entrada(chave);
  select jsonb_build_object(
    'total', (select count(*) from pg_temp.alm_inv_entrada),
    'novos', count(*) filter (where i.id is null),
    'iguais', count(*) filter (where i.id is not null and public.alm_inv_normalizar_origem(i.dados_origem) = public.alm_inv_normalizar_origem(e.dados)),
    'alterados', count(*) filter (where i.id is not null and public.alm_inv_normalizar_origem(i.dados_origem) <> public.alm_inv_normalizar_origem(e.dados)),
    'ausentes', 0, 'inseridos', 0
  ) into v_resumo
  from pg_temp.alm_inv_entrada e left join public.alm_inventario_itens i on i.origem_chave=e.chave;

  v_resumo := v_resumo || jsonb_build_object('ausentes', (
    select count(*) from public.alm_inventario_itens i join public.alm_inventarios v on v.id=i.inventario_id
    where i.origem_chave is not null and not v.excluido and not exists(select 1 from pg_temp.alm_inv_entrada e where e.chave=i.origem_chave)
  ), 'diferencas', coalesce((
    select jsonb_agg(d order by d->>'data',d->>'chave') from (
      select jsonb_build_object('chave', e.chave,'linha',e.linha,'data',e.data,'material',e.material,'deposito',e.deposito,'tipo','alterado',
        'campos',(select jsonb_agg(jsonb_build_object('campo',k,'anterior',i.dados_origem->k,'planilha',e.dados->k) order by k)
          from jsonb_object_keys(e.dados || i.dados_origem) k
          where public.alm_inv_normalizar_origem(e.dados)->k is distinct from public.alm_inv_normalizar_origem(i.dados_origem)->k)) d
      from pg_temp.alm_inv_entrada e join public.alm_inventario_itens i on i.origem_chave=e.chave
      where public.alm_inv_normalizar_origem(i.dados_origem) <> public.alm_inv_normalizar_origem(e.dados)
      union all
      select jsonb_build_object('chave',i.origem_chave,'linha',null,'data',v.data,'material',i.material,'deposito',i.deposito,'tipo','ausente','campos','[]'::jsonb)
      from public.alm_inventario_itens i join public.alm_inventarios v on v.id=i.inventario_id
      where i.origem_chave is not null and not v.excluido and not exists(select 1 from pg_temp.alm_inv_entrada e where e.chave=i.origem_chave)
    ) dif
  ), '[]'::jsonb));
  if not p_gravar then return v_resumo; end if;

  for v_data in select distinct e.data from pg_temp.alm_inv_entrada e
    where not exists(select 1 from public.alm_inventario_itens i where i.origem_chave=e.chave) order by e.data loop
    -- Índice reinicia por dia, usando o gerador único já utilizado pelo módulo.
    insert into public.alm_inventarios(codigo,data,criterio,observacao,status,concluido_em,criado_por_id,criado_por_nome,origem,lote_importacao)
    values(public.alm_receb_proximo_codigo('INV',v_data,'alm_inventarios'),v_data,'Histórico importado',
      'Base Lançamento: ' || p_arquivo,'concluido',v_data + time '12:00',auth.uid(),v_nome,'importacao_historica',v_lote)
    returning id into v_inv;
    for v_r in select e.* from pg_temp.alm_inv_entrada e where e.data=v_data
      and not exists(select 1 from public.alm_inventario_itens i where i.origem_chave=e.chave) order by e.linha loop
      v_qtd := (v_r.dados->>'Qtde Física')::numeric;
      v_saldo := (v_r.dados->>'Stock UL (Dep)')::numeric;
      insert into public.alm_inventario_itens(inventario_id,ordem,material,descricao,deposito,status,saldo_sistema,qtd_final,diferenca,
        alerta,encerrado_em,encerrado_por,origem_linha,dados_origem,origem_chave)
      values(v_inv,v_r.linha-3,v_r.material,v_r.dados->>'Descrição',v_r.deposito,
        case when v_r.dados->>'Status'='OK' then 'conferido' else 'divergente' end,v_saldo,v_qtd,(v_r.dados->>'Diferença')::numeric,
        case when v_r.deposito='0000' then 'Depósito ausente na fonte.' when v_qtd is null then 'Quantidade física ausente na fonte.' end,
        v_data + time '12:00',v_nome,v_r.linha,v_r.dados,v_r.chave) returning id into v_item;
      -- A fonte contém só o resultado final, não as quantidades de cada recontagem.
      -- Nº Contagem (inclusive 4/5) fica integral em dados_origem para a análise.
      if v_qtd is not null then
        insert into public.alm_inventario_contagens(item_id,numero,quantidade,divergente,saldo_ref,endereco_encontrado,validade,observacao,contado_por_nome,created_at)
        values(v_item,1,v_qtd,v_r.dados->>'Status'<>'OK',coalesce(v_saldo,0),v_r.dados->>'Endereço Encontrado',
          case when v_r.dados->>'Data Validade' ~ '^\d{4}-\d{2}-\d{2}$' then (v_r.dados->>'Data Validade')::date end,
          'Resultado final da planilha; recontagens e validade original preservadas em dados_origem.',v_nome,v_data + time '12:00');
      end if;
    end loop;
  end loop;
  v_resumo := v_resumo || jsonb_build_object('inseridos',v_resumo->'novos');
  insert into public.alm_inv_importacoes(arquivo,criado_por,resumo) values(p_arquivo,auth.uid(),v_resumo);
  return v_resumo;
end;
$$;
revoke all on function public.alm_inv_importar_base(jsonb,text,boolean) from public, anon;
grant execute on function public.alm_inv_importar_base(jsonb,text,boolean) to authenticated;
