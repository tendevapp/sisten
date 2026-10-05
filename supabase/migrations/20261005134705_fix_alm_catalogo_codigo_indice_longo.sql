-- O índice do código precisa ter no mínimo dois dígitos, sem truncar após 99.
create or replace function public.alm_catalogo_itens_antes_gravar()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
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
  new.updated_at := now();
  return new;
end;
$$;
