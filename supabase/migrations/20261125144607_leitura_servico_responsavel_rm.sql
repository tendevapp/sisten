-- O responsável pode ter apenas o papel de solicitante, inclusive em outro setor.
create policy requests_read_responsavel_servico on public.core_solicitacoes
for select to authenticated using (
  type = 'compra' and status <> 'rascunho'
  and translate(lower(btrim(tipo_compra)), 'ç', 'c') = 'servico'
  and (select exists (
    select 1 from public.core_perfis p
    join public.config_envio_emails c on lower(c.chave) = 'compra_servico'
    cross join lateral regexp_split_to_table(c.destinatarios, E'[,;\n\r]+') as d(email)
    where p.id = (select auth.uid())::text and p.status = 'ativo'
      and nullif(btrim(d.email), '') is not null and lower(btrim(d.email)) = lower(btrim(p.email))
  ))
);

-- Esse destinatário agora concede acesso operacional. Sua edição pelo app
-- segue os papéis da página Cadastros Gerais.
create function public.proteger_config_responsavel_servico()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if current_user = 'authenticated' and (
    (tg_op <> 'INSERT' and lower(old.chave) = 'compra_servico') or
    (tg_op <> 'DELETE' and lower(new.chave) = 'compra_servico')
  ) and not exists (
    select 1 from public.core_perfis p
    where p.id = (select auth.uid())::text and p.status = 'ativo'
      and p.roles && array['admin', 'coordenador_suprimentos']::text[]
  ) then
    raise exception 'A alteração do responsável pelo serviço exige acesso a Cadastros Gerais.' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.proteger_config_responsavel_servico() from public, anon, authenticated;
create trigger proteger_config_responsavel_servico before insert or update or delete
on public.config_envio_emails for each row execute function public.proteger_config_responsavel_servico();
