-- Classificação de nível 1/2 do grupo de mercadoria no Histórico de Pedidos
-- (filtro por categoria na Recorrência de Compras, igual ao cadastro de
-- grupo de mercadoria já usado em Suprimentos).
--
-- `vw_historico_pedidos` já faz LEFT JOIN cadastro_grupo_mercadoria gm ON
-- gm.codigo = h.grp_mercads (para grp_mercads_desc) — só falta expor
-- gm.classificacao_nivel1/2, que já existem na tabela. Diferente da
-- migration anterior, aqui não é preciso mexer na materialized view: é só
-- acrescentar colunas no fim do SELECT da própria vw_historico_pedidos.
-- Mesmo padrão de segurança: ler a definição viva com pg_get_viewdef e achar
-- uma marca conhecida antes de substituir.

do $$
declare
  d text;
  marca constant text := '    h.area_solicitante' || chr(10) || '   FROM mv_historico_pedidos h';
begin
  select pg_get_viewdef('public.vw_historico_pedidos'::regclass, true) into d;
  if position(marca in d) = 0 then
    raise exception 'vw_historico_pedidos mudou de forma; revisar esta migration';
  end if;

  execute 'create or replace view public.vw_historico_pedidos as ' || replace(d, marca,
    '    h.area_solicitante,' || chr(10) ||
    '    gm.classificacao_nivel1,' || chr(10) ||
    '    gm.classificacao_nivel2' || chr(10) ||
    '   FROM mv_historico_pedidos h');
end $$;
