-- Cadastro de Itens: data da ultima saida/consumo de cada material na MB51.
-- Conta apenas baixas de consumo (TMV 201..291 impares) e transferencias para
-- producao (TMV 311 com quantidade negativa), ignorando entradas (101/501) e
-- estornos. Permite destacar itens de alto giro vs parados sem baixar a MB51
-- inteira para o navegador.

create or replace function public.alm_ultimo_movimento_por_material()
returns table (
  material text,
  ultima_data date,
  tipo_movimento text
)
language sql stable security invoker set search_path = public as $$
  select distinct on (btrim(m.material))
    btrim(m.material) as material,
    m.data_lancamento as ultima_data,
    btrim(m.tipo_movimento) as tipo_movimento
  from public.sap_mb51_mov m
  where nullif(btrim(m.material), '') is not null
    and m.data_lancamento is not null
    and (
      btrim(m.tipo_movimento) = any (array['201','221','231','241','251','261','281','291'])
      or (btrim(m.tipo_movimento) = '311' and m.qtd_um_registro < 0)
    )
  order by btrim(m.material), m.data_lancamento desc, m.id desc;
$$;

revoke all on function public.alm_ultimo_movimento_por_material() from public, anon;
grant execute on function public.alm_ultimo_movimento_por_material() to authenticated;
