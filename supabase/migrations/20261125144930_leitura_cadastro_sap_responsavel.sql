-- Cada perfil lê os cadastros do tipo para o qual está no campo Para.
create policy requests_read_responsavel_cadastro_sap on public.core_solicitacoes
for select to authenticated using (
  type = 'cadastro_sap' and status <> 'rascunho'
  and (case when registration_type = 'Fornecedor' then 'cadastro_sap_fornecedor' else 'cadastro_sap' end) in (
    select lower(c.chave)
    from public.core_perfis p
    join public.config_envio_emails c on lower(c.chave) in ('cadastro_sap', 'cadastro_sap_fornecedor')
    cross join lateral regexp_split_to_table(c.destinatarios, E'[,;\n\r]+') as d(email)
    where p.id = (select auth.uid())::text and p.status = 'ativo'
      and nullif(btrim(d.email), '') is not null and lower(btrim(d.email)) = lower(btrim(p.email))
  )
);

-- Os três campos Para conferem visibilidade. Todos seguem a permissão de Cadastros Gerais.
alter function public.proteger_config_responsavel_servico() rename to proteger_config_responsaveis_solicitacoes;
alter trigger proteger_config_responsavel_servico on public.config_envio_emails rename to proteger_config_responsaveis_solicitacoes;
create or replace function public.proteger_config_responsaveis_solicitacoes()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  chaves constant text[] := array['compra_servico','cadastro_sap','cadastro_sap_fornecedor'];
begin
  if current_user = 'authenticated' and (
    (tg_op <> 'INSERT' and lower(old.chave) = any(chaves)) or
    (tg_op <> 'DELETE' and lower(new.chave) = any(chaves))
  ) and not exists (
    select 1 from public.core_perfis p
    where p.id = (select auth.uid())::text and p.status = 'ativo'
      and p.roles && array['admin', 'coordenador_suprimentos']::text[]
  ) then
    raise exception 'A alteração do responsável exige acesso a Cadastros Gerais.' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
