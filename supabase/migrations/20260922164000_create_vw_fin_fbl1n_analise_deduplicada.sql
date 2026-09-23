-- Base deduplicada para o relatório geral de Contas a Pagar.
-- Mantém o enriquecimento de tipos documentais da view anterior, mas remove
-- as linhas FBL1N exatamente repetidas no snapshot antes dos indicadores.

create or replace view public.vw_fin_fbl1n_analise_deduplicada
with (security_invoker = true) as
select
  f.*,
  t.tipo_documento as tipo_documento_descricao,
  t.categoria_modulo as tipo_documento_categoria_modulo,
  t.descricao_operacional as tipo_documento_descricao_operacional
from public.vw_fin_fbl1n_deduplicado f
left join public.cadastro_tipodoc t on t.codigo = f.tipo_documento;

grant select on public.vw_fin_fbl1n_analise_deduplicada to authenticated;
revoke all on public.vw_fin_fbl1n_analise_deduplicada from anon;

notify pgrst, 'reload schema';
