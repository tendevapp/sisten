-- =====================================================================
-- Treinamentos › Almoxarifado — trilha PO.ALM-0001 (Rotinas do Almoxarifado)
-- =====================================================================
-- 10 missões: por que o processo existe, gestão e ressuprimento, chegada e
-- recepção, conferência e destino, recusa e devolução, armazenagem e endereço,
-- atendimento no balcão, avarias e terceiros, inventário periódico e desafio final.
-- HTML versionado em public/treinamentos/trilha-po-alm-0001.html.

insert into public.trein_trilhas (
  setor_id, codigo, titulo, descricao, revisao,
  total_missoes, duracao_min, arquivo_origem, arquivo_path, ordem
) values (
  '2',
  'PO.ALM-0001',
  'Rotinas do Almoxarifado',
  'Processos e controles do Almoxarifado em 10 missões: gestão de ressuprimento (FRM.ALM-0015), recepção segura de cargas, conferência e carimbos, devolução no ato e pós-MIGO, lógica de armazenagem e endereçamento (ZL0024), atendimento no balcão (FRM.ALM-0014), avarias e terceiros (TE2T) e o ciclo completo do inventário periódico no SAP.',
  'Rev. 05',
  10,
  50,
  'app',
  'treinamentos/trilha-po-alm-0001.html',
  1
)
on conflict (setor_id, codigo) do nothing;
