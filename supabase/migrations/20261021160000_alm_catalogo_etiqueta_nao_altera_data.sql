-- Cadastro de Itens: marcar a etiqueta como impressa não conta como alteração.
--
-- A tela ordena pelo último alterado e filtra por data de alteração
-- (updated_at). Imprimir um lote de etiquetas mexia em updated_at de todos e
-- jogava esses itens para o topo, misturados com as alterações de verdade.
-- A data da impressão continua em etiqueta_impressa_em.
--
-- Mesma função de 20261005134705, só muda o bloco do updated_at.

create or replace function public.alm_catalogo_itens_antes_gravar()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_ddmmyy text;
  v_max int;
  v_indice text;
begin
  if tg_op = 'INSERT' and coalesce(trim(new.codigo_registro), '') = '' then
    perform pg_advisory_xact_lock(hashtext('alm_catalogo_itens_codigo'));
    v_ddmmyy := to_char((now() at time zone 'America/Bahia')::date, 'DDMMYY');
    select coalesce(max((regexp_match(codigo_registro, '^CAT-\d{6}-(\d+)$'))[1]::int), 0)
      into v_max
      from public.alm_catalogo_itens
     where codigo_registro like 'CAT-' || v_ddmmyy || '-%';

    v_indice := (v_max + 1)::text;
    new.codigo_registro := 'CAT-' || v_ddmmyy || '-' || lpad(v_indice, greatest(2, length(v_indice)), '0');
  end if;

  if tg_op = 'UPDATE'
     and (to_jsonb(new) - 'etiqueta_impressa_em' - 'updated_at')
       = (to_jsonb(old) - 'etiqueta_impressa_em' - 'updated_at') then
    -- Só a etiqueta (ou nada) mudou: mantém a data da última alteração.
    new.updated_at := old.updated_at;
  else
    new.updated_at := now();
  end if;
  return new;
end;
$function$;
