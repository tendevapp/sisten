-- =====================================================================
-- Mercado Livre — dados da compra e do boleto informados pelo comprador
-- =====================================================================
-- Ao gravar o nº da compra na Central de Compras, o comprador cola o
-- "Detalhe da compra" do ML (total, frete, pagamento, pacotes) e informa o
-- boleto (valor, vencimento, linha digitável). Tudo vai para fin_ml_compras,
-- a mesma linha que o Financeiro completa com pagamento e documento SAP.
--
-- O comprador não tem a permissão de lançar baixa (fin_ml_pode_lancar), por
-- isso grava pela RPC sup_ml_registrar_detalhe_compra: ela só aceita nº de
-- compra que exista em sup_ml_itens e, depois que o Financeiro marcou o
-- boleto como pago, não deixa o comprador trocar valor/vencimento/linha.

alter table public.fin_ml_compras
  add column if not exists data_compra date,
  add column if not exists qtd_produtos integer,
  add column if not exists valor_produtos numeric(14,2),
  add column if not exists valor_frete numeric(14,2),
  add column if not exists valor_total numeric(14,2),
  add column if not exists forma_pagamento text,
  add column if not exists numero_pagamento text,
  add column if not exists status_pagamento_ml text,
  add column if not exists endereco_entrega text,
  add column if not exists pacotes jsonb,
  add column if not exists detalhe_texto text,
  add column if not exists linha_digitavel text,
  add column if not exists detalhe_registrado_por_nome text,
  add column if not exists detalhe_registrado_em timestamptz;

comment on column public.fin_ml_compras.pacotes is
  'Pacotes do "Detalhe da compra" do ML: [{descricao, valor (total do pacote), quantidade}].';

create or replace function public.sup_ml_registrar_detalhe_compra(p_numero text, p_dados jsonb, p_por_nome text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
$$;

revoke all on function public.sup_ml_registrar_detalhe_compra(text, jsonb, text) from public, anon;
grant execute on function public.sup_ml_registrar_detalhe_compra(text, jsonb, text) to authenticated;
