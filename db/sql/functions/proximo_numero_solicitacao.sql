-- ============================================================================
-- Contador atômico para número de solicitação (requests.number), no mesmo
-- padrão já usado por public.proximo_numero_cotacao() sobre a tabela
-- public.sequences.
--
-- Por que existe: o app gerava o número no cliente (incrementando uma cópia
-- local do contador em localStorage/IndexedDB) e só depois tentava publicar a
-- solicitação no Supabase. Dois clientes que sincronizaram o mesmo valor-base
-- de public.sequences geram o mesmo próximo número; o segundo a publicar
-- recebe 23505 (duplicate key em requests_number_key) e a solicitação fica
-- presa só localmente — some para todo mundo, apesar de aparecer criada para
-- quem abriu.
--
-- Esta função resolve o incremento inteiro dentro do Postgres (INSERT ...
-- ON CONFLICT ... DO UPDATE é atômico por linha), então duas chamadas
-- concorrentes nunca recebem o mesmo valor.
-- ============================================================================
create or replace function public.proximo_numero_solicitacao(p_criticidade int)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  chave text := p_criticidade::text;
  proximo int;
begin
  insert into public.sequences (key, value)
  values (chave, 1001)
  on conflict (key) do update set value = public.sequences.value + 1
  returning value into proximo;

  -- Mesmo formato que o cliente já usava: criticidade + sequência com 6 dígitos.
  return p_criticidade::text || lpad(proximo::text, 6, '0');
end;
$$;

grant execute on function public.proximo_numero_solicitacao(int) to authenticated;
