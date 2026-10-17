begin;

-- A carga preserva descrições/códigos SAP procurando o mesmo part number na
-- revisão anterior. O índice evita normalizar toda a BOM para cada nova linha.
create index if not exists idx_proj_bom_gwjaco_projeto_pn_norm
  on public.proj_bom_gwjaco (projeto, public.proj_normalizar_pn(part_number));

-- O payload completo (1.624 linhas) é validado, versionado e sincronizado em
-- uma única transação. O limite vale somente para esta função administrativa.
alter function public.proj_substituir_bom(text, text, text, jsonb)
  set statement_timeout = '60s';

commit;
