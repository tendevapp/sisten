-- Um item pode ter vários pares lote × validade. O par único antigo é preservado.
alter table public.alm_catalogo_itens add column lotes_validade jsonb not null default '[]'::jsonb;
alter table public.alm_catalogo_itens add constraint alm_catalogo_lotes_array check (jsonb_typeof(lotes_validade)='array');

create function public.alm_catalogo_normalizar_lotes(p_lotes jsonb) returns jsonb
language plpgsql immutable set search_path=public,pg_temp as $$
declare v jsonb; v_lote text; v_validade text; v_data date; v_resultado jsonb:='[]'::jsonb;
begin
  if jsonb_typeof(coalesce(p_lotes,'[]'::jsonb))<>'array' then raise exception 'Lotes e validades devem formar uma lista.'; end if;
  for v in select * from jsonb_array_elements(coalesce(p_lotes,'[]'::jsonb)) loop
    if jsonb_typeof(v)<>'object' then raise exception 'Cada linha deve conter lote e validade.'; end if;
    v_lote:=nullif(trim(v->>'lote'),''); v_validade:=nullif(trim(v->>'validade'),'');
    if v_validade is not null then
      if v_validade !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Informe a validade no formato AAAA-MM-DD.'; end if;
      v_data:=v_validade::date;
      if to_char(v_data,'YYYY-MM-DD')<>v_validade then raise exception 'Data de validade inválida.'; end if;
    end if;
    if v_lote is not null or v_validade is not null then
      v_resultado:=v_resultado||jsonb_build_array(jsonb_build_object('lote',v_lote,'validade',v_validade));
    end if;
  end loop;
  return v_resultado;
end;
$$;

update public.alm_catalogo_itens set lotes_validade=public.alm_catalogo_normalizar_lotes(jsonb_build_array(jsonb_build_object('lote',lote,'validade',validade)))
where lote is not null or validade is not null;

create function public.alm_catalogo_sincronizar_lotes() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
  if tg_op='INSERT' then
    if coalesce(new.lotes_validade,'[]'::jsonb)='[]'::jsonb and (new.lote is not null or new.validade is not null) then
      new.lotes_validade:=jsonb_build_array(jsonb_build_object('lote',new.lote,'validade',new.validade));
    end if;
  elsif new.lotes_validade is not distinct from old.lotes_validade
    and (new.lote is distinct from old.lote or new.validade is distinct from old.validade) then
    -- Clientes antigos só editam a primeira linha: nunca apagam as demais.
    new.lotes_validade:=jsonb_build_array(jsonb_build_object('lote',new.lote,'validade',new.validade))||(old.lotes_validade-0);
  end if;
  new.lotes_validade:=public.alm_catalogo_normalizar_lotes(new.lotes_validade);
  new.lote:=new.lotes_validade->0->>'lote';
  new.validade:=(new.lotes_validade->0->>'validade')::date;
  return new;
end;
$$;
-- Normalizar antes do trigger que registra a última alteração do cadastro.
create trigger trg_alm_catalogo_00_lotes before insert or update on public.alm_catalogo_itens
  for each row execute function public.alm_catalogo_sincronizar_lotes();
comment on column public.alm_catalogo_itens.lotes_validade is 'Lista opcional de pares lote e validade; não aparece na etiqueta.';
comment on column public.alm_catalogo_itens.lote is 'Compatibilidade: espelha o lote da primeira linha de lotes_validade.';
comment on column public.alm_catalogo_itens.validade is 'Compatibilidade: espelha a validade da primeira linha de lotes_validade.';
revoke all on function public.alm_catalogo_normalizar_lotes(jsonb),public.alm_catalogo_sincronizar_lotes() from public,anon;
grant execute on function public.alm_catalogo_normalizar_lotes(jsonb) to authenticated;
