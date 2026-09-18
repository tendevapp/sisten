-- =====================================================================
-- Almoxarifado > Projetos — Matriz de Autonomia: recarga da posição atual
--
-- Substitui todo o estado manual do subprojeto SP01 pela posição real lida
-- da planilha de controle em 18/09/2026 (Torres 1 a 12 — além disso é
-- estoque/BOM automático: só gravamos aqui o que é Montagem final (3) ou
-- Expedido (4); Não atende (0) e Estoque (1) continuam calculados pelo
-- saldo do almoxarifado, sem célula manual).
-- =====================================================================

delete from public.proj_matriz_autonomia_kits where subprojeto_id = 'SP01';

insert into public.proj_matriz_autonomia_kits
  (subprojeto_id, torre_numero, tramo, subkit, status, serie, atualizado_por_nome)
values
  -- T5 — Fixadores / Plataforma / Escada | Avanti
  ('SP01', 1, 'T5', 'fixadores', 4, '3147', 'Carga posição atual'),
  ('SP01', 1, 'T5', 'plataforma', 4, '3147', 'Carga posição atual'),
  ('SP01', 1, 'T5', 'escada_avanti', 4, '3147', 'Carga posição atual'),
  ('SP01', 2, 'T5', 'fixadores', 4, '3182', 'Carga posição atual'),
  ('SP01', 2, 'T5', 'plataforma', 4, '3182', 'Carga posição atual'),
  ('SP01', 2, 'T5', 'escada_avanti', 4, '3182', 'Carga posição atual'),
  ('SP01', 3, 'T5', 'fixadores', 4, '3192', 'Carga posição atual'),
  ('SP01', 3, 'T5', 'plataforma', 4, '3192', 'Carga posição atual'),
  ('SP01', 3, 'T5', 'escada_avanti', 4, '3192', 'Carga posição atual'),
  ('SP01', 4, 'T5', 'fixadores', 3, '3187', 'Carga posição atual'),
  ('SP01', 4, 'T5', 'plataforma', 3, '3187', 'Carga posição atual'),
  ('SP01', 4, 'T5', 'escada_avanti', 3, '3187', 'Carga posição atual'),

  -- T4
  ('SP01', 1, 'T4', 'fixadores', 4, '3146', 'Carga posição atual'),
  ('SP01', 1, 'T4', 'plataforma', 4, '3146', 'Carga posição atual'),
  ('SP01', 1, 'T4', 'escada_avanti', 4, '3146', 'Carga posição atual'),
  ('SP01', 2, 'T4', 'fixadores', 4, '3156', 'Carga posição atual'),
  ('SP01', 2, 'T4', 'plataforma', 4, '3156', 'Carga posição atual'),
  ('SP01', 2, 'T4', 'escada_avanti', 4, '3156', 'Carga posição atual'),
  ('SP01', 3, 'T4', 'fixadores', 4, '3151', 'Carga posição atual'),
  ('SP01', 3, 'T4', 'plataforma', 4, '3151', 'Carga posição atual'),
  ('SP01', 3, 'T4', 'escada_avanti', 4, '3151', 'Carga posição atual'),
  ('SP01', 4, 'T4', 'fixadores', 3, '3186', 'Carga posição atual'),
  ('SP01', 4, 'T4', 'plataforma', 3, '3186', 'Carga posição atual'),
  ('SP01', 4, 'T4', 'escada_avanti', 3, '3186', 'Carga posição atual'),

  -- T3
  ('SP01', 1, 'T3', 'fixadores', 4, '3145', 'Carga posição atual'),
  ('SP01', 1, 'T3', 'plataforma', 4, '3145', 'Carga posição atual'),
  ('SP01', 1, 'T3', 'escada_avanti', 4, '3145', 'Carga posição atual'),
  ('SP01', 2, 'T3', 'fixadores', 4, '3160', 'Carga posição atual'),
  ('SP01', 2, 'T3', 'plataforma', 4, '3160', 'Carga posição atual'),
  ('SP01', 2, 'T3', 'escada_avanti', 4, '3160', 'Carga posição atual'),
  ('SP01', 3, 'T3', 'fixadores', 4, '3195', 'Carga posição atual'),
  ('SP01', 3, 'T3', 'plataforma', 4, '3195', 'Carga posição atual'),
  ('SP01', 3, 'T3', 'escada_avanti', 4, '3195', 'Carga posição atual'),
  ('SP01', 4, 'T3', 'fixadores', 3, '3150', 'Carga posição atual'),
  ('SP01', 4, 'T3', 'plataforma', 3, '3150', 'Carga posição atual'),
  ('SP01', 4, 'T3', 'escada_avanti', 3, '3150', 'Carga posição atual'),
  ('SP01', 5, 'T3', 'fixadores', 3, '3200', 'Carga posição atual'),
  ('SP01', 5, 'T3', 'plataforma', 3, '3200', 'Carga posição atual'),
  ('SP01', 5, 'T3', 'escada_avanti', 3, '3200', 'Carga posição atual'),

  -- T2
  ('SP01', 1, 'T2', 'fixadores', 4, '3144', 'Carga posição atual'),
  ('SP01', 1, 'T2', 'plataforma', 4, '3144', 'Carga posição atual'),
  ('SP01', 1, 'T2', 'escada_avanti', 4, '3144', 'Carga posição atual'),
  ('SP01', 2, 'T2', 'fixadores', 4, '3169', 'Carga posição atual'),
  ('SP01', 2, 'T2', 'plataforma', 4, '3169', 'Carga posição atual'),
  ('SP01', 2, 'T2', 'escada_avanti', 4, '3169', 'Carga posição atual'),
  ('SP01', 3, 'T2', 'fixadores', 4, '3149', 'Carga posição atual'),
  ('SP01', 3, 'T2', 'plataforma', 4, '3149', 'Carga posição atual'),
  ('SP01', 3, 'T2', 'escada_avanti', 4, '3149', 'Carga posição atual'),
  ('SP01', 4, 'T2', 'fixadores', 3, '3159', 'Carga posição atual'),
  ('SP01', 4, 'T2', 'plataforma', 3, '3159', 'Carga posição atual'),
  ('SP01', 4, 'T2', 'escada_avanti', 3, '3159', 'Carga posição atual'),
  ('SP01', 5, 'T2', 'fixadores', 3, '3194', 'Carga posição atual'),
  ('SP01', 5, 'T2', 'plataforma', 3, '3194', 'Carga posição atual'),
  ('SP01', 5, 'T2', 'escada_avanti', 3, '3194', 'Carga posição atual'),

  -- T1 — Fixadores / Plataforma / Escada | Avanti
  ('SP01', 1, 'T1', 'fixadores', 4, '3143', 'Carga posição atual'),
  ('SP01', 1, 'T1', 'plataforma', 4, '3143', 'Carga posição atual'),
  ('SP01', 1, 'T1', 'escada_avanti', 4, '3143', 'Carga posição atual'),
  ('SP01', 2, 'T1', 'fixadores', 3, '3148', 'Carga posição atual'),
  ('SP01', 2, 'T1', 'plataforma', 3, '3148', 'Carga posição atual'),
  ('SP01', 2, 'T1', 'escada_avanti', 3, '3148', 'Carga posição atual'),
  ('SP01', 3, 'T1', 'fixadores', 3, '3153', 'Carga posição atual'),
  ('SP01', 3, 'T1', 'plataforma', 3, '3153', 'Carga posição atual'),
  ('SP01', 3, 'T1', 'escada_avanti', 3, '3153', 'Carga posição atual'),

  -- T1 — Escada Acesso (Torre 1 acompanha o tramo; Torres 2-12 em Montagem final sem série própria)
  ('SP01', 1, 'T1', 'escada_acesso', 4, '3143', 'Carga posição atual'),
  ('SP01', 2, 'T1', 'escada_acesso', 3, null, 'Carga posição atual'),
  ('SP01', 3, 'T1', 'escada_acesso', 3, null, 'Carga posição atual'),
  ('SP01', 4, 'T1', 'escada_acesso', 3, null, 'Carga posição atual'),
  ('SP01', 5, 'T1', 'escada_acesso', 3, null, 'Carga posição atual'),
  ('SP01', 6, 'T1', 'escada_acesso', 3, null, 'Carga posição atual'),
  ('SP01', 7, 'T1', 'escada_acesso', 3, null, 'Carga posição atual'),
  ('SP01', 8, 'T1', 'escada_acesso', 3, null, 'Carga posição atual'),
  ('SP01', 9, 'T1', 'escada_acesso', 3, null, 'Carga posição atual'),
  ('SP01', 10, 'T1', 'escada_acesso', 3, null, 'Carga posição atual'),
  ('SP01', 11, 'T1', 'escada_acesso', 3, null, 'Carga posição atual'),
  ('SP01', 12, 'T1', 'escada_acesso', 3, null, 'Carga posição atual'),

  -- T1 — Plataforma Inferior (mesmo padrão da Escada de Acesso)
  ('SP01', 1, 'T1', 'plataforma_inferior', 4, '3143', 'Carga posição atual'),
  ('SP01', 2, 'T1', 'plataforma_inferior', 3, null, 'Carga posição atual'),
  ('SP01', 3, 'T1', 'plataforma_inferior', 3, null, 'Carga posição atual'),
  ('SP01', 4, 'T1', 'plataforma_inferior', 3, null, 'Carga posição atual'),
  ('SP01', 5, 'T1', 'plataforma_inferior', 3, null, 'Carga posição atual'),
  ('SP01', 6, 'T1', 'plataforma_inferior', 3, null, 'Carga posição atual'),
  ('SP01', 7, 'T1', 'plataforma_inferior', 3, null, 'Carga posição atual'),
  ('SP01', 8, 'T1', 'plataforma_inferior', 3, null, 'Carga posição atual'),
  ('SP01', 9, 'T1', 'plataforma_inferior', 3, null, 'Carga posição atual'),
  ('SP01', 10, 'T1', 'plataforma_inferior', 3, null, 'Carga posição atual'),
  ('SP01', 11, 'T1', 'plataforma_inferior', 3, null, 'Carga posição atual'),
  ('SP01', 12, 'T1', 'plataforma_inferior', 3, null, 'Carga posição atual')
on conflict (subprojeto_id, torre_numero, tramo, subkit) do update
set status = excluded.status,
    serie = excluded.serie,
    atualizado_por_nome = excluded.atualizado_por_nome,
    updated_at = now();

-- Uma única entrada de log documentando a recarga em massa (em vez de ~90
-- linhas individuais, que não ajudariam ninguém a entender o que mudou).
insert into public.proj_matriz_autonomia_log
  (subprojeto_id, torre_numero, tramo, subkit, alteracoes, resumo, alterado_por_nome)
values
  ('SP01', 0, 'T1', 'fixadores', '[]'::jsonb,
   'Recarga em massa: posição atual conforme planilha de controle (18/09/2026) — Torres 1 a 12 marcadas manualmente (Montagem final/Expedido), demais status seguem o cálculo automático de estoque.',
   'Carga posição atual');
