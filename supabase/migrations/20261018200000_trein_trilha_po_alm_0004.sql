-- =====================================================================
-- Treinamentos › Almoxarifado — trilha PO.ALM-0004 (Mobilização e Desmobilização de Equipamentos de Terceiros)
-- =====================================================================
-- 9 missões: por que mobilizar (suporte à operação), chegada e NF de remessa,
-- check-list de avaliação da condição, etiqueta de rastreabilidade e dossiê,
-- entrada no SAP MIGO depósito de terceiros 0070, operação e manutenções,
-- incidentes e tratativa de danos (FRM.SUP-0001), fim de vigência e desmobilização (SEMINFE)
-- e desafio final.
-- HTML integrado versionado em public/treinamentos/trilha-po-alm-0004.html.

insert into public.trein_trilhas (
  id, setor_id, codigo, titulo, descricao, revisao,
  total_missoes, duracao_min, arquivo_origem, arquivo_path, ordem, ativo
) values (
  'f39b1a04-a42e-4cb2-8113-750000000004',
  '2',
  'PO.ALM-0004',
  'Mobilização e Desmobilização de Equipamentos de Terceiros',
  'Critérios completos para locação e custódia de maquinários de terceiros na TEN: NF de remessa, check-list com fotos, SAP MIGO depósito 0070, etiqueta de rastreabilidade, controle de manutenções, tratativa de danos (FRM.SUP-0001), SEMINFE e dossiê de operação.',
  'Rev. 01',
  9,
  45,
  'app',
  'treinamentos/trilha-po-alm-0004.html',
  3,
  true
)
on conflict (id) do update set
  titulo = excluded.titulo,
  descricao = excluded.descricao,
  revisao = excluded.revisao,
  total_missoes = excluded.total_missoes,
  duracao_min = excluded.duracao_min,
  arquivo_path = excluded.arquivo_path,
  ordem = excluded.ordem,
  ativo = excluded.ativo;
