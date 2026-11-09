-- =====================================================================
-- Códigos MODULO-DDMMYY-NN: o índice 100 virava "10"
-- =====================================================================
-- `lpad(texto, 2, '0')` CORTA o texto maior que 2: o 100º registro do dia
-- saía com índice "10", que já existe, e o unique recusava. Em 06/11 a
-- Requisição no Balcão chegou a 99 (RQB-061126-99) e o 100º envio — da fila
-- offline do aparelho do almoxarifado — ficou travado com
-- "duplicate key value violates unique constraint alm_req_balcao_codigo_key",
-- segurando todo o resto da fila atrás dele.
--
-- Mesmo padrão dos geradores por trigger (KZN, SEM, OCF, CAT…):
-- lpad(n, greatest(2, length(n)), '0') — mínimo dois dígitos, sem teto.
-- Só a linha do lpad muda; o resto é a definição atual de cada função.

create or replace function public.alm_receb_proximo_codigo(p_prefixo text, p_data date, p_tabela text)
 returns text
 language plpgsql
 stable
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_ddmmyy text := to_char(p_data, 'DDMMYY');
  v_prefixo text := upper(p_prefixo);
  v_max int;
  v_indice text;
begin
  execute format(
    'select coalesce(max((regexp_match(codigo, %L))[1]::int), 0) from public.%I where codigo like %L',
    '^' || v_prefixo || '-\d{6}-(\d+)$', p_tabela, v_prefixo || '-' || v_ddmmyy || '-%'
  ) into v_max;
  v_indice := (coalesce(v_max, 0) + 1)::text;
  return v_prefixo || '-' || v_ddmmyy || '-' || lpad(v_indice, greatest(2, length(v_indice)), '0');
end;
$function$;

create or replace function public.prod_apt_proximo_codigo(p_data date)
 returns text
 language plpgsql
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_ddmmyy text := to_char(p_data, 'DDMMYY');
  v_max int;
  v_indice text;
begin
  perform pg_advisory_xact_lock(hashtext('prod_apt_codigo:' || v_ddmmyy));
  select coalesce(max((regexp_match(codigo, '^APT-\d{6}-(\d+)$'))[1]::int), 0)
    into v_max
    from (
      select codigo from public.prod_apt_lancamentos where codigo like 'APT-' || v_ddmmyy || '-%'
      union all
      select codigo from public.prod_apt_tramo_eventos where codigo like 'APT-' || v_ddmmyy || '-%'
    ) codigos;
  v_indice := (v_max + 1)::text;
  return 'APT-' || v_ddmmyy || '-' || lpad(v_indice, greatest(2, length(v_indice)), '0');
end;
$function$;

create or replace function public.prod_proximo_codigo(p_prefixo text, p_data date)
 returns text
 language plpgsql
 stable
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_ddmmyy text := to_char(p_data, 'DDMMYY');
  v_prefixo text := upper(p_prefixo);
  v_max int;
  v_indice text;
begin
  select coalesce(max((regexp_match(codigo, '^' || v_prefixo || '-\d{6}-(\d+)$'))[1]::int), 0)
    into v_max
    from public.prod_lancamentos
   where codigo like v_prefixo || '-' || v_ddmmyy || '-%';
  v_indice := (coalesce(v_max, 0) + 1)::text;
  return v_prefixo || '-' || v_ddmmyy || '-' || lpad(v_indice, greatest(2, length(v_indice)), '0');
end;
$function$;
