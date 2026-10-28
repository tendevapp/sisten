-- O arquivo fica no bucket privado já usado pelas cotações. Trocar/remover
-- o vínculo na Central não apaga o arquivo preservado em processos anteriores.
alter table public.sup_ml_itens add column if not exists comprovante jsonb;
alter table public.sup_cotacao_processo_itens
  add column if not exists comprovante_ml jsonb,
  add column if not exists link_ml text;

create or replace function public.copiar_comprovante_ml_cotacao()
returns trigger language plpgsql security invoker set search_path = public
as $$
begin
  select m.comprovante, m.link into new.comprovante_ml, new.link_ml
    from public.sup_ml_itens m where m.ri = new.ri;
  if new.comprovante_ml is not null then
    update public.sup_cotacao_processos set mercado_livre = true
      where id = new.processo_id and not mercado_livre;
  end if;
  return new;
end;
$$;

revoke all on function public.copiar_comprovante_ml_cotacao() from public, anon;
grant execute on function public.copiar_comprovante_ml_cotacao() to authenticated;
create trigger copiar_comprovante_ml_cotacao
  before insert on public.sup_cotacao_processo_itens
  for each row execute function public.copiar_comprovante_ml_cotacao();

comment on column public.sup_cotacao_processo_itens.comprovante_ml is
  'Print do Mercado Livre copiado por RI na inclusão do item. Snapshot {nome,path,mime_type,tamanho_bytes} no bucket privado cotacoes-arquivos.';
