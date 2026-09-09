-- =====================================================================
-- Reverte `proj_registrar_saida_avulsa` (criada na migration anterior,
-- nunca usada por nenhum dado real — confirmado: 0 movimentos tipo
-- 'saida_avulsa' no banco).
--
-- Decisão do usuário: toda saída importada da planilha é uma ordem de
-- separação para pré-montagem de verdade (F2) — cria kit, avança o status
-- do tramo — não um débito avulso sem rastro. `proj_registrar_saida_premontagem`
-- já cobre isso; a rota "avulsa" fica sem propósito.
-- =====================================================================

drop function if exists public.proj_registrar_saida_avulsa(jsonb, jsonb);

alter table public.proj_movimentos drop constraint proj_movimentos_tipo_check;
alter table public.proj_movimentos add constraint proj_movimentos_tipo_check
  check (tipo = any (array['entrada_nf','saida_premontagem','retorno_premontagem','saida_sobressalente','ajuste']));
