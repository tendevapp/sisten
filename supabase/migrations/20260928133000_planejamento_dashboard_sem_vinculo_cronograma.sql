create or replace view public.vw_planejamento_acompanhamento_base
with (security_invoker = true)
as
with atual as (
  select id
  from public.planejamento_importacoes
  where status = 'sucesso'
  order by concluido_em desc nulls last, iniciado_em desc
  limit 1
)
select b.id, b.importacao_id, b.linha_origem, b.bd, b.sequencial, b.tramo, b.projeto, b.descricao,
       case
         when nullif(b.marcador_x_expedicao, '') is not null then 'EXPEDIDO'
         when nullif(b.marcador_x, '') is not null then 'PATIO'
         else coalesce(nullif(b.posto_origem, ''), 'ERRO')
       end as posto_atual,
       b.posto_origem, b.inicio, b.turno_inicio, b.calandra, b.termino_nav01, b.turno_termino_nav01,
       b.total_nav01, b.data_inicio_internos, b.turno_inicio_internos, b.data_termino_saw3,
       b.turno_termino_saw3, b.total_turno_saw3, b.data_termino_internos, b.turno_lib_jato,
       b.qtd_reparos, b.metragem_reparos, b.total_turno_internos, b.termino_final,
       b.turno_termino_final, b.total_turno_final, b.marcador_x, b.data_expedicao,
       b.cort_x_expedicao, b.marcador_x_expedicao, b.numero_torre, b.lead_time_corte,
       b.lead_time_calandra, b.tempo_armazenagem, b.raw_data
from public.bd_acompanhamento_geral b
join atual a on a.id = b.importacao_id;

notify pgrst, 'reload schema';
