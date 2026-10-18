-- =====================================================================
-- Treinamentos › Almoxarifado — trilha PO.ALM-0006 (Procedimento Operacional e Sistêmico Chapas)
-- =====================================================================
-- 9 missões: o coração de aço da torre (alinhamento comercial quadripartite),
-- portaria e rádio, triagem de pátios (Pátio A - Ponte Rolante x Pátio B - Pórtico Mag 75 Ton),
-- inspeção da Qualidade e RNC, descarregamento seguro e empilhamento com caibros alinhados,
-- mapeamento de tramos e virolas com simulador interativo, controle de faturamento em planilhas,
-- encaminhamento protocolado à Controladoria, digitalização e arquivo por data ascendente,
-- e desafio final.
-- HTML integrado versionado em public/treinamentos/trilha-po-alm-0006.html.

insert into public.trein_trilhas (
  id, setor_id, codigo, titulo, descricao, revisao,
  total_missoes, duracao_min, arquivo_origem, arquivo_path, ordem, ativo
) values (
  'f39b1a06-a42e-4cb2-8113-750000000006',
  '2',
  'PO.ALM-0006',
  'Procedimento Operacional e Sistêmico Chapas',
  'Recebimento físico e controle sistêmico de chapas de aço: triagem de pátios (Pátio A com Ponte Rolante para projetos em linha x Pátio B com Pórtico Mag 75 Ton para fora de linha), inspeção da Qualidade, gestão de RNC, mapeamento de tramos e virolas, planilhas de controle, protocolo com a Controladoria e arquivamento por data ascendente.',
  'Rev. 00',
  9,
  45,
  'app',
  'treinamentos/trilha-po-alm-0006.html',
  4,
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
