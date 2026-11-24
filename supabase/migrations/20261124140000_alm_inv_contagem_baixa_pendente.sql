-- Inventário Cíclico: contagem de material com "Baixa pendente" (a tag do
-- Cadastro de Itens) continua permitida, mas sai da acuracidade e fica à parte
-- para validar depois que as baixas forem regularizadas no SAP.
--
-- Cada contagem guarda o retrato do que estava sem baixa no momento em que foi
-- feita (`baixa_pendente`, null = nada pendente). O retrato é por MATERIAL,
-- igual à tag; cada movimento leva o depósito para a tela calcular a diferença
-- ajustada do depósito contado.
--
-- Não mexe em `pendencias_sap` (só na divergência, regra da contingência por
-- corte da ZL0024) nem na RPC de contagem: o gatilho preenche antes do insert.

-- 1. A função da tag passa a devolver quando o documento foi criado — o
--    retroativo abaixo só aceita o que já existia na hora da contagem.
drop function if exists public.alm_baixas_pendentes_por_material();

create function public.alm_baixas_pendentes_por_material()
returns table (
  material text,
  origem text,
  codigo text,
  data date,
  tipo_movimento text,
  deposito text,
  deposito_destino text,
  quantidade numeric,
  unidade text,
  aguardando_confirmacao boolean,
  criado_em timestamptz
)
language sql stable security definer set search_path = public as $$
  select i.material, 'balcao'::text, r.codigo, r.data, r.tipo_movimento,
         coalesce(i.deposito, r.deposito_origem), coalesce(i.deposito_destino, r.deposito_destino),
         i.quantidade, i.unidade, coalesce(r.pendente_confirmacao, false), r.created_at
    from public.alm_req_balcao r
    join public.alm_req_balcao_itens i on i.requisicao_id = r.id
   where not r.excluido
     and nullif(btrim(i.doc_sap), '') is null
     and (
       nullif(btrim(r.doc_sap), '') is null
       or exists (
         select 1 from public.alm_req_balcao_itens o
          where o.requisicao_id = r.id and nullif(btrim(o.doc_sap), '') is not null
       )
     )
  union all
  select it->>'material', 'extraordinaria'::text, s.codigo, s.data, 'saida'::text,
         null::text, null::text,
         case when (it->>'quantidade') ~ '^-?[0-9]+(\.[0-9]+)?$' then (it->>'quantidade')::numeric end,
         it->>'unidade', false, s.created_at
    from public.alm_solicitacao_extra s
   cross join lateral jsonb_array_elements(coalesce(s.itens, '[]'::jsonb)) it
   where s.status = 'PENDENTE'
     and s.excluido_em is null
     and nullif(btrim(it->>'material'), '') is not null
     and not exists (
       select 1 from public.alm_req_balcao r
        where not r.excluido and r.origem = 'sol_extra_sem_saldo' and r.origem_ref = s.codigo
     )
$$;

revoke all on function public.alm_baixas_pendentes_por_material() from public, anon;
grant execute on function public.alm_baixas_pendentes_por_material() to authenticated;

-- 2. Retrato na contagem.
alter table public.alm_inventario_contagens add column if not exists baixa_pendente jsonb;
grant select (baixa_pendente) on public.alm_inventario_contagens to authenticated;

comment on column public.alm_inventario_contagens.baixa_pendente is
  'Movimentos do balcão/extraordinária sem doc. SAP do material na hora da contagem (null = nenhum). Item cuja última contagem tem isto sai da acuracidade.';

create or replace function public.alm_inv_baixa_pendente_do_material(p_material text, p_ate timestamptz default null)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_agg(jsonb_build_object(
           'codigo', b.codigo, 'origem', b.origem, 'data', b.data, 'tipo_movimento', b.tipo_movimento,
           'deposito', b.deposito, 'deposito_destino', b.deposito_destino,
           'quantidade', b.quantidade, 'unidade', b.unidade,
           'aguardando_confirmacao', b.aguardando_confirmacao
         ) order by b.data, b.codigo)
    from public.alm_baixas_pendentes_por_material() b
   where regexp_replace(btrim(b.material), '^0+', '') = regexp_replace(btrim(p_material), '^0+', '')
     and (p_ate is null or b.criado_em <= p_ate)
$$;

revoke all on function public.alm_inv_baixa_pendente_do_material(text, timestamptz) from public, anon, authenticated;

create or replace function public.alm_inv_contagem_baixa_pendente()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_material text;
begin
  select material into v_material from public.alm_inventario_itens where id = new.item_id;
  begin
    new.baixa_pendente := public.alm_inv_baixa_pendente_do_material(v_material, null);
  exception when others then
    new.baixa_pendente := null; -- a contagem não depende disto
  end;
  return new;
end;
$$;

revoke all on function public.alm_inv_contagem_baixa_pendente() from public, anon, authenticated;

drop trigger if exists trg_alm_inv_contagem_baixa_pendente on public.alm_inventario_contagens;
create trigger trg_alm_inv_contagem_baixa_pendente
  before insert on public.alm_inventario_contagens
  for each row execute function public.alm_inv_contagem_baixa_pendente();

-- 3. Retroativo: contagem já feita de material com requisição criada antes
--    dela e AINDA sem baixa — certamente estava pendente na hora. (O que já
--    foi regularizado depois não dá para reconstruir; essas ficam como estão.)
update public.alm_inventario_contagens c
   set baixa_pendente = public.alm_inv_baixa_pendente_do_material(i.material, c.created_at)
  from public.alm_inventario_itens i
 where i.id = c.item_id
   and c.baixa_pendente is null
   and c.created_at >= timestamptz '2026-09-24'
   and public.alm_inv_baixa_pendente_do_material(i.material, c.created_at) is not null;
