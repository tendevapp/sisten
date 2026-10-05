-- Carga inicial das Pendências de Recebimento (ver 20261002120000).
-- Separada da estrutura de propósito: aplicar DEPOIS que a tela
-- /suprimentos/pendencias-recebimento estiver publicada — ela notifica os
-- compradores e a notificação leva até a tela.

-- ---------------------------------------------------------------------------
-- Carga inicial: só a última semana — o que é mais antigo já foi tratado fora
-- do sistema e só geraria aviso velho para o comprador.
-- ---------------------------------------------------------------------------

do $$
declare
  r record;
begin
  for r in
    select c.id from public.alm_receb_conferencias c
     where not c.excluido and c.data >= current_date - 7
       and (c.tem_nc or exists (select 1 from public.alm_receb_conferencia_itens i where i.conferencia_id = c.id and i.parcial))
  loop
    perform public.sup_receb_pend_sincronizar_conferencia(r.id);
  end loop;
  for r in
    select n.id from public.alm_receb_nc n
     where n.conferencia_id is null and not n.excluido and n.created_at >= now() - interval '7 days'
  loop
    perform public.sup_receb_pend_sincronizar_nc(r.id);
  end loop;
end $$;
