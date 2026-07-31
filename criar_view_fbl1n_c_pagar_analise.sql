-- =====================================================================
-- Cruzamento dos lançamentos de Contas a Pagar (FBL1N) com o cadastro de
-- tipos de documento SAP (`cadastro_tipodoc`), para análise: cada código
-- de "Tipo de documento" (ex.: KR, RE, KZ) ganha a descrição de negócio,
-- a categoria/módulo SAP e a descrição operacional cadastradas.
--
-- security_invoker = on: sem essa opção a view roda com privilégios do
-- dono e ignora as políticas de RLS de `fbl1n_c_pagar` (restrita a
-- authenticated), expondo fornecedor e valores em aberto sem login. Ver
-- Security Advisor do Supabase (security_definer_view) e o mesmo cuidado
-- em `vw_estoque_analise`.
-- =====================================================================

create or replace view public.vw_fbl1n_c_pagar_analise as
select
  f.*,
  t.tipo_documento as tipo_documento_descricao,
  t.categoria_modulo as tipo_documento_categoria_modulo,
  t.descricao_operacional as tipo_documento_descricao_operacional
from public.fbl1n_c_pagar f
left join public.cadastro_tipodoc t on t.codigo = f.tipo_documento;

alter view public.vw_fbl1n_c_pagar_analise set (security_invoker = on);

grant select on public.vw_fbl1n_c_pagar_analise to authenticated;
revoke all on public.vw_fbl1n_c_pagar_analise from anon;
