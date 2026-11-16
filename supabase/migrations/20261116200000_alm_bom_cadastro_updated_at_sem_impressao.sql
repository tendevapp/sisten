-- Itens BOM: a "data de atualização" (updated_at) é a da última alteração do
-- cadastro da peça (foto, localização, descrição da etiqueta, observação).
-- Carimbar a impressão da etiqueta (etiqueta_impressa_em) não conta: senão o
-- filtro por data de atualização traria tudo o que só foi impresso.

create or replace function public.alm_bom_itens_cadastro_antes_gravar()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
begin
  if tg_op = 'UPDATE'
     and (to_jsonb(new) - 'etiqueta_impressa_em' - 'updated_at')
       = (to_jsonb(old) - 'etiqueta_impressa_em' - 'updated_at') then
    new.updated_at := old.updated_at;
  else
    new.updated_at := now();
  end if;
  return new;
end;
$function$;
