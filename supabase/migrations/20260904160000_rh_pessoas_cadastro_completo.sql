-- =====================================================================
-- RH > Colaboradores (`rh_pessoas`) — cadastro completo
--
-- A tabela nasceu com o mínimo que o formulário de ASE precisava (matrícula,
-- nome e cargo). A planilha do RH traz a estrutura organizacional inteira, e
-- ela é o que permite filtrar por área, turno e situação nas telas — hoje isso
-- se perde na importação.
--
-- Colunas novas, na ordem da planilha:
--   CHAVE DO NOME → chave_nome    MACROÁREA → macroarea      ÁREA → area
--   SUBSETOR      → subsetor      LIDERANÇA → lideranca      TURNO → turno
--   SITUAÇÃO      → situacao
-- (MATRÍCULA, COLABORADOR e CARGO já existiam como `registro`, `nome` e `cargo`.)
--
-- `updated_at` passa a ser mantido por gatilho: a página de edição do cadastro
-- que virá depois não pode depender de cada chamada lembrar de preencher a
-- data, e o valor precisa ser confiável para mostrar "atualizado em" na tela.
-- `atualizado_por` guarda quem fez a última alteração — na importação fica
-- nulo, porque quem alterou foi a carga, não uma pessoa.
-- =====================================================================

alter table public.rh_pessoas
  add column if not exists chave_nome text,
  add column if not exists macroarea text,
  add column if not exists area text,
  add column if not exists subsetor text,
  add column if not exists lideranca text,
  add column if not exists turno text,
  add column if not exists situacao text,
  add column if not exists atualizado_por text references public.core_perfis(id);

-- Filtros previstos para a página de cadastro (área, turno e situação são os
-- cortes naturais de uma lista de colaboradores).
create index if not exists idx_rh_pessoas_area on public.rh_pessoas (area);
create index if not exists idx_rh_pessoas_turno on public.rh_pessoas (turno);
create index if not exists idx_rh_pessoas_situacao on public.rh_pessoas (situacao);

-- Gatilho genérico de `updated_at`, reaproveitável por outras tabelas.
create or replace function public.tocar_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_rh_pessoas_updated_at on public.rh_pessoas;
create trigger trg_rh_pessoas_updated_at
  before update on public.rh_pessoas
  for each row execute function public.tocar_updated_at();
