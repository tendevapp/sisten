-- =====================================================================
-- Suprimentos > mapa de cotação: notas fiscais da "Menor compra".
--
-- Para comparar a melhor compra passada com a oferta atual na mesma base
-- (custo de aquisição: nota + DIFAL + frete − crédito), o comprador precisa
-- dos dados da NF do pedido: número, série, modelo (55 = NF-e da mercadoria,
-- 57 = CT-e do frete), quantidade, total e impostos.
--
-- A ZL0136 (sap_zl0136_nf) só é legível por admin, Financeiro (6),
-- Contabilidade (7) e Controladoria (18). Esta função devolve só as notas
-- dos pedidos pedidos (no máximo 500) e só para esses setores mais
-- Suprimentos (5) — sem abrir a tabela inteira.
-- =====================================================================

drop function if exists public.sup_notas_dos_pedidos(text[]);

create function public.sup_notas_dos_pedidos(p_pedidos text[])
returns table(
  pedido text, material text, nota text, serie text, modelo text, data_documento date,
  quantidade numeric, total numeric, valor_icms numeric, valor_ipi numeric,
  valor_pis numeric, valor_cofins numeric, valor_difal numeric,
  cfop text, codigo_imposto text, uf_origem text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'Sessão expirada. Entre novamente.'; end if;
  if not (public.has_role('admin') or exists (
    select 1 from public.core_perfis p
     where p.id = auth.uid()::text and p.status = 'ativo' and p.sector_id = any (array['5', '6', '7', '18'])
  )) then
    raise exception 'Sem acesso às notas fiscais.';
  end if;
  if coalesce(array_length(p_pedidos, 1), 0) > 500 then raise exception 'No máximo 500 pedidos por consulta.'; end if;
  return query
    select
      btrim(n.pedido),
      ltrim(btrim(n.material), '0'),
      btrim(n.numero_documento_nove_posicoes),
      nullif(btrim(n.series), ''),
      nullif(btrim(n.modelo_nota_fiscal), ''),
      n.data_documento,
      n.quantidade, n.total, n.valor_icms_total, n.valor_ipi,
      n.valor_pis, n.valor_cofins, n.valor_difal,
      nullif(btrim(n.cfop), ''), nullif(btrim(n.codigo_imposto), ''), nullif(btrim(n.uf_origem), '')
    from public.sap_zl0136_nf n
    where n.pedido = any(p_pedidos)
      and nullif(btrim(n.numero_documento_nove_posicoes), '') is not null;
end;
$$;

revoke all on function public.sup_notas_dos_pedidos(text[]) from public, anon;
grant execute on function public.sup_notas_dos_pedidos(text[]) to authenticated;
