-- Versão das tabelas "pequenas" do sync do app (ver src/lib/sincronizacaoPequenas.ts).
--
-- Todo aparelho ativo baixava cada uma inteira a cada 15 min, mudasse ou não
-- (~3,7 GB em 4 dias pelo Monitor de Desempenho). Agora qualquer gravação na
-- tabela sobe a versão dela em `dataset_versions` (mesmo mecanismo das bases
-- SAP), e o aparelho só rebaixa quando a versão mudou.
--
-- Gatilho por COMANDO (for each statement), não por linha: um update de 500
-- linhas sobe a versão uma vez. Security definer para chamar
-- bump_dataset_version com o privilégio do dono, seja quem for que gravou.

create or replace function private.tg_versao_tabela_pequena()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.bump_dataset_version(tg_table_name::text, null, 'gatilho');
  return null;
end;
$$;

revoke all on function private.tg_versao_tabela_pequena() from public, anon, authenticated;

do $$
declare
  v_tabela text;
begin
  foreach v_tabela in array array[
    'core_setores', 'core_perfis', 'core_grupos_compradores', 'sup_compradores', 'sup_rastreio_prioridades',
    'almoxarifado_chegadas', 'sup_fretes', 'core_solicitacoes', 'core_solicitacoes_itens', 'core_solicitacoes_anexos',
    'core_solicitacoes_comentarios', 'core_solicitacoes_historico_status', 'cadastro_grupo_mercadoria'
  ] loop
    execute format('drop trigger if exists trg_versao_tabela_pequena on public.%I', v_tabela);
    execute format(
      'create trigger trg_versao_tabela_pequena after insert or update or delete or truncate on public.%I '
      'for each statement execute function private.tg_versao_tabela_pequena()', v_tabela);
    -- Marcador inicial: sem ele o aparelho baixaria em toda rodada (modo antigo).
    perform public.bump_dataset_version(v_tabela, null, 'migration');
  end loop;
end;
$$;
