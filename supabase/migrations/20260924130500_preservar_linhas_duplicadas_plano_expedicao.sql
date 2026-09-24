-- A planilha possui duas programações distintas para as mesmas combinações
-- torre/tramo. A identidade do plano é a linha, não apenas torre + tramo.

alter table public.prod_plano_expedicao
  drop constraint if exists prod_plano_expedicao_torre_numero_tramo_key;

insert into public.prod_plano_expedicao (
  semana, torre_numero, tramo, identificador,
  nf_faturamento_emitida, nf_gw_emitida, nf_expedicao_emitida,
  data_carregamento, data_expedicao
)
select v.semana, v.torre_numero, v.tramo, v.identificador,
       v.nf_faturamento_emitida, v.nf_gw_emitida, v.nf_expedicao_emitida,
       v.data_carregamento, v.data_expedicao
from (values
  (38, 2, 'T1'::text, 3158, true, true, true, '2026-09-18'::date, '2026-09-21'::date),
  (39, 4, 'T3'::text, 3150, true, true, true, '2026-09-22'::date, '2026-09-23'::date)
) as v(semana, torre_numero, tramo, identificador, nf_faturamento_emitida, nf_gw_emitida, nf_expedicao_emitida, data_carregamento, data_expedicao)
where not exists (
  select 1
    from public.prod_plano_expedicao atual
   where atual.semana = v.semana
     and atual.torre_numero = v.torre_numero
     and atual.tramo = v.tramo
     and atual.identificador is not distinct from v.identificador
     and atual.data_carregamento is not distinct from v.data_carregamento
     and atual.data_expedicao is not distinct from v.data_expedicao
);
