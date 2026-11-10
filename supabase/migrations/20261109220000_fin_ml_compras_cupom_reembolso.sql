-- =====================================================================
-- Compra do ML: desconto, cupom e reembolso do "Detalhes da transação"
-- =====================================================================
-- A compra #2000015901343333 (06/11) veio com "Desconto −57,59" (já embutido
-- no preço dos itens), "Cupons / Desconto −2,28" (este sai do total pago) e
-- "Total do reembolso 93,89" (o ML devolveu um item — as 48 pilhas AA, cuja
-- linha da RM foi eliminada no SAP). O leitor do texto só via o primeiro
-- desconto e acusava conta que não fecha; o reembolso não ia ao Financeiro.
--
-- Três colunas novas em fin_ml_compras e a RPC de gravação passa a aceitá-las
-- (mesma regra das demais: o que o texto novo não trouxer continua como está).

alter table public.fin_ml_compras
  add column if not exists valor_desconto numeric,
  add column if not exists valor_cupom numeric,
  add column if not exists valor_reembolso numeric;

comment on column public.fin_ml_compras.valor_desconto is 'Desconto do ML na compra (positivo), como no "Detalhes da transação".';
comment on column public.fin_ml_compras.valor_cupom is 'Cupom aplicado na compra (positivo) — sai do total pago.';
comment on column public.fin_ml_compras.valor_reembolso is 'Total devolvido pelo ML ao comprador ("Total do reembolso").';

create or replace function public.sup_ml_registrar_detalhe_compra(p_numero text, p_dados jsonb, p_por_nome text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_pago date;
  v_pode_boleto boolean;
begin
  if (select auth.uid()) is null then
    raise exception 'Sessão expirada.';
  end if;
  if not exists (select 1 from public.sup_ml_itens where numero_compra = p_numero) then
    raise exception 'Compra % não está gravada em nenhum item da Central de Compras.', p_numero;
  end if;

  select pago_em into v_pago from public.fin_ml_compras where numero_compra = p_numero;
  v_pode_boleto := v_pago is null or public.fin_ml_pode_lancar();

  insert into public.fin_ml_compras as c (numero_compra) values (p_numero)
    on conflict (numero_compra) do nothing;

  update public.fin_ml_compras c set
    data_compra = coalesce((p_dados->>'data_compra')::date, c.data_compra),
    qtd_produtos = coalesce((p_dados->>'qtd_produtos')::integer, c.qtd_produtos),
    valor_produtos = coalesce((p_dados->>'valor_produtos')::numeric, c.valor_produtos),
    valor_frete = coalesce((p_dados->>'valor_frete')::numeric, c.valor_frete),
    valor_desconto = coalesce((p_dados->>'valor_desconto')::numeric, c.valor_desconto),
    valor_cupom = coalesce((p_dados->>'valor_cupom')::numeric, c.valor_cupom),
    valor_reembolso = coalesce((p_dados->>'valor_reembolso')::numeric, c.valor_reembolso),
    valor_total = coalesce((p_dados->>'valor_total')::numeric, c.valor_total),
    forma_pagamento = coalesce(nullif(p_dados->>'forma_pagamento', ''), c.forma_pagamento),
    numero_pagamento = coalesce(nullif(p_dados->>'numero_pagamento', ''), c.numero_pagamento),
    status_pagamento_ml = coalesce(nullif(p_dados->>'status_pagamento_ml', ''), c.status_pagamento_ml),
    endereco_entrega = coalesce(nullif(p_dados->>'endereco_entrega', ''), c.endereco_entrega),
    pacotes = coalesce(p_dados->'pacotes', c.pacotes),
    detalhe_texto = coalesce(nullif(p_dados->>'detalhe_texto', ''), c.detalhe_texto),
    valor_boleto = case when v_pode_boleto and p_dados ? 'valor_boleto'
                        then (p_dados->>'valor_boleto')::numeric else c.valor_boleto end,
    vencimento = case when v_pode_boleto and p_dados ? 'vencimento'
                      then (p_dados->>'vencimento')::date else c.vencimento end,
    linha_digitavel = case when v_pode_boleto and p_dados ? 'linha_digitavel'
                           then nullif(p_dados->>'linha_digitavel', '') else c.linha_digitavel end,
    detalhe_registrado_por_nome = p_por_nome,
    detalhe_registrado_em = now(),
    updated_at = now()
  where c.numero_compra = p_numero;
end;
$function$;
