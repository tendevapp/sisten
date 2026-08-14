-- ==============================================================================
-- Função: public.obter_maiores_codigos_catalogo
-- Objetivo: Retornar o maior código de material cadastrado para as duas faixas
--           principais de consulta do SAP:
--           1) Faixa Padrão (7 dígitos, 1.xxx.xxx) -> ex: 1487950
--           2) Faixa Longa (18 dígitos, iniciados em 100000...) -> ex: 100000000000047981
--           Além do total de materiais e carimbo da última inclusão.
-- ==============================================================================

create or replace function public.obter_maiores_codigos_catalogo()
returns json
language sql
stable
security definer
as $$
  select json_build_object(
    'max_padrao_7d', (
      select material_code 
      from materials 
      where length(material_code) = 7 and material_code >= '1000000' and material_code < '2000000'
      order by material_code desc 
      limit 1
    ),
    'max_longo_18d', (
      select material_code 
      from materials 
      where length(material_code) = 18 and material_code like '100000%'
      order by material_code desc 
      limit 1
    ),
    'total_materiais', (
      select count(*) 
      from materials
    ),
    'ultimo_cadastro', (
      select max(created_at)
      from materials
    )
  );
$$;

grant execute on function public.obter_maiores_codigos_catalogo() to anon, authenticated, service_role;
