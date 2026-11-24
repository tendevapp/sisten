-- Cadastro de Itens: tag "Baixa pendente" nos materiais com retirada do
-- balcão que ainda não tem documento no SAP. A ZL0024 só abate o que foi
-- lançado; até lá a contagem física sai menor que o saldo e dá divergência.
--
-- Entra:
--   * item de Requisição no Balcão (saída ou transferência, inclusive a
--     aguardando confirmação vinda da Ficha de EPI ou da Retirada sem Saldo)
--     sem doc. SAP. Doc. informado só no cabeçalho cobre todos os itens,
--     exceto na importação parcial (outro item da mesma RQB tem doc. e este
--     não) — mesma regra de `etapaSapBalcao`/`itensSemDocParcial`;
--   * Solicitação Extraordinária PENDENTE que não tem RQB (o tipo Projeto, e
--     a Sem Saldo que por algum motivo ficou sem a RQB automática). A Sem
--     Saldo com RQB conta pela RQB, para não somar duas vezes.
--
-- Security definer: quem usa o cadastro (ex.: Jovens Aprendizes) não lê as
-- tabelas do balcão; a função devolve só material, quantidade e o código.

create or replace function public.alm_baixas_pendentes_por_material()
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
  aguardando_confirmacao boolean
)
language sql stable security definer set search_path = public as $$
  select i.material, 'balcao'::text, r.codigo, r.data, r.tipo_movimento,
         coalesce(i.deposito, r.deposito_origem), coalesce(i.deposito_destino, r.deposito_destino),
         i.quantidade, i.unidade, coalesce(r.pendente_confirmacao, false)
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
         it->>'unidade', false
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
