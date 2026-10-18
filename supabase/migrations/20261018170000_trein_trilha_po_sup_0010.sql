-- =====================================================================
-- Treinamentos › Suprimentos — trilha PO.SUP-0010 (Gestão de Contratos e Serviços)
-- =====================================================================
-- 12 missões: papéis, cadastro e homologação, bloqueio, requisição de
-- serviço, cotação, pedido e alçadas, quando fazer contrato, assinatura e
-- início, medição e pagamento, aditivo e encerramento, avaliação e desafio
-- final. HTML versionado em public/treinamentos/ (gerado por
-- scripts/integrar-trilha-sisten.py a partir do HTML original).

insert into public.trein_trilhas (
  setor_id, codigo, titulo, descricao, revisao,
  total_missoes, duracao_min, arquivo_origem, arquivo_path, ordem
) values (
  '5',
  'PO.SUP-0010',
  'Gestão de Contratos e Serviços',
  'Contratação de serviços em 12 missões: cadastro e homologação de prestadores, requisição de serviço, cotação, pedido e alçadas, quando fazer contrato, assinatura e início, medição e pagamento, aditivo, encerramento e avaliação de prestadores.',
  'Rev. 07',
  12,
  55,
  'app',
  'treinamentos/trilha-po-sup-0010.html',
  2
)
on conflict (setor_id, codigo) do nothing;
