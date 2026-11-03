-- Referência de Códigos SAP para Nova Importação: 3ª consulta — ativos.
-- Itens de ativo são cadastrados no SAP com 5 dígitos começando em 4
-- (40000–46110 na carga de 13/08/2026). O painel do Admin mostra o maior
-- para o filtro incremental da extração (> maior código).
create or replace function public.obter_maiores_codigos_catalogo()
 returns json
 language sql
 stable security definer
 set search_path to 'public'
 set work_mem to '32MB'
as $function$
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
    'max_ativo_4', (
      select material_code
      from materials
      where length(material_code) = 5 and material_code >= '40000' and material_code < '50000'
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
$function$;
