-- =====================================================================
-- Treinamentos › Almoxarifado — trilha PO.ALM-0007 (Controle de Processos, Produtos e Serviços Providos Externamente)
-- =====================================================================
-- 9 missões: por que controlar provedores (itens críticos da torre),
-- os 4 critérios de qualificação (ISO 9001, sistema AG, auditoria TEN, experiência aceita)
-- e análise de risco conjunta (Qualidade/Engenharia/Suprimentos), plano de processos MPP
-- e aprovação antes de fabricar, RM no SAP e diligenciamento, alçadas de aprovação (materiais x serviços)
-- com simulador interativo, informações obrigatórias no Pedido de Compra,
-- recebimento e inspeção no Almoxarifado com entrega ao solicitante,
-- avaliação anual de desempenho no portal AG e matriz RACI,
-- e desafio final.
-- HTML integrado versionado em public/treinamentos/trilha-po-alm-0007.html.

insert into public.trein_trilhas (
  id, setor_id, codigo, titulo, descricao, revisao,
  total_missoes, duracao_min, arquivo_origem, arquivo_path, ordem, ativo
) values (
  'f39b1a07-a42e-4cb2-8113-750000000007',
  '2',
  'PO.ALM-0007',
  'Controle de Processos, Produtos e Serviços Providos Externamente',
  'Diretrizes completas para qualificação e seleção de fornecedores (ISO 9001, sistema AG, auditoria TEN), análise de risco conjunta (Qualidade/Engenharia/Suprimentos), aprovação de MPP, alçadas de aprovação de materiais e serviços, informações mandatórias no Pedido de Compra, recebimento e inspeção no Almoxarifado e avaliação anual no portal AG.',
  'Rev. 00',
  9,
  45,
  'app',
  'treinamentos/trilha-po-alm-0007.html',
  5,
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
