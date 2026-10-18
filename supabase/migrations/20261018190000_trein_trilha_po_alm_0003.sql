-- =====================================================================
-- Treinamentos › Almoxarifado — trilha PO.ALM-0003 (Preservação de Materiais)
-- =====================================================================
-- 9 missões: por que preservar (guardião da torre), fatores de contaminação,
-- químicos, validade e soldagem, regra de ouro FIFO & FEFO, acondicionamento e
-- manuseio seguro, rondas 5S e estrutura predial, incidentes internos e fluxo de
-- segregação, propriedades de clientes (FRM.SUP-0001) e desafio final.
-- HTML integrado versionado em public/treinamentos/trilha-po-alm-0003.html.

insert into public.trein_trilhas (
  id, setor_id, codigo, titulo, descricao, revisao,
  total_missoes, duracao_min, arquivo_origem, arquivo_path, ordem, ativo
) values (
  'd14f49b2-a42e-4cb2-8113-750000000003',
  '2',
  'PO.ALM-0003',
  'Preservação de Materiais',
  'Metodologia completa de conservação e proteção de insumos: riscos de contaminação (tintas, granalhas, fluxos e oxidação de arames), controle formal de validade (FRM.ALM-0023), diretrizes de solda (PO.ENG-0001), rotatividade FIFO/FEFO, empilhamento e manuseio, rondas prediais 5S, fluxo de segregação de 5 passos para danos internos e salvaguarda de patrimônio de clientes e terceiros (FRM.SUP-0001).',
  'Rev. 03',
  9,
  45,
  'app',
  'treinamentos/trilha-po-alm-0003.html',
  2,
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
