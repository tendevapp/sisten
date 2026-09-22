-- A auditoria precisa ocorrer depois da inserção do EPI, pois o histórico tem
-- chave estrangeira para a linha recém-criada.
create or replace function public.ssma_book_epis_preparar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.criado_por := coalesce(new.criado_por, (auth.uid())::text, 'IMPORTAÇÃO SISTEN');
  new.atualizado_por := coalesce((auth.uid())::text, 'IMPORTAÇÃO SISTEN');
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.ssma_book_epis_auditar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.ssma_book_epis_historico (
    epi_id, operacao, valores_anteriores, valores_novos, alterado_por
  ) values (
    new.id,
    case when tg_op = 'INSERT' then 'CRIACAO' else 'ALTERACAO' end,
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    to_jsonb(new),
    coalesce((auth.uid())::text, 'IMPORTAÇÃO SISTEN')
  );
  return new;
end;
$$;

revoke all on function public.ssma_book_epis_preparar() from public, anon, authenticated;
revoke all on function public.ssma_book_epis_auditar() from public, anon, authenticated;

drop trigger if exists ssma_book_epis_preparo on public.ssma_book_epis;
create trigger ssma_book_epis_preparo
before insert or update on public.ssma_book_epis
for each row execute function public.ssma_book_epis_preparar();

drop trigger if exists ssma_book_epis_auditoria on public.ssma_book_epis;
create trigger ssma_book_epis_auditoria
after insert or update on public.ssma_book_epis
for each row execute function public.ssma_book_epis_auditar();

notify pgrst, 'reload schema';
