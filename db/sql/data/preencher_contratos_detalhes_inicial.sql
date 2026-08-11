-- Carga inicial dos campos complementares de contratos (contratos_detalhes),
-- transcrita a partir de uma planilha/print enviada pelo usuário.
--
-- Revisão 2: conferida contra uma versão de melhor qualidade da mesma
-- planilha. Correções feitas em relação à primeira leitura:
--   - 5200016770 (MOAB BARBOSA): PO e Código do Fornecedor estavam errados
--     (lidos como 4700381827 / vazio; correto é 4700365255 / 1000081827).
--   - 5200017964 (Bahia Security): Status é "Ativo" (lido como vazio antes).
--   - 5200018527 (DAMAZIO): Status é vazio (lido como "Inativo" antes).
--   - 590005811 (PRC): Status é "Ativo" (lido como vazio antes).
--   - 5200020715 (QUALITY INSPECAO): Escopo é "Alidis - Serviço de
--     Engenharia" (antes eu tinha misturado com o nome do fornecedor).
--   - 5200020920 (AION): Parcela ficou vazia (o valor visível era o Valor
--     Global, que não é campo editável).
--
-- IMPORTANTE: ainda é uma leitura de IMAGEM, não do arquivo original —
-- confira sobretudo os textos de Escopo truncados e os valores de Parcela
-- antes de considerar a carga definitiva.
--
-- Cada UPSERT casa pelo N° Contrato (documento_compras). Se o documento não
-- existir em me3n_contratos, a linha ainda é gravada em contratos_detalhes
-- (não há FK) mas só aparece na tela quando uma importação ME3N trouxer esse
-- contrato.
--
-- Execute depois de criar_tabela_contratos_detalhes.sql. Seguro rodar de novo
-- (upsert) mesmo que a primeira versão deste script já tenha sido executada.

insert into public.contratos_detalhes
  (documento_compras, gestor, escopo_servico, po_pedido_compra, codigo_fornecedor, valor_parcela, modalidade, vigencia_label, status, updated_by, updated_at)
values
  ('5200012579', 'Arthur Araujo de Souza', 'SISTEMA GESTÃO DE ATIVOS', '4700377396', '1000067374', 24581.64, 'Anual', '7° Aditivo', 'Ativo', 'Importação inicial (planilha)', now()),
  ('5200015166', 'Maycon Douglas Pereira', 'FORNECIMENTO DE GÁS / CANDEIAS', '4100293446', '1000057347', null, 'Por Demanda', '1° Aditivo', 'Ativo', 'Importação inicial (planilha)', now()),
  ('5200020327', 'Maycon Douglas Pereira', 'LOCAÇÃO CILINDRO', '4700439161', '1000046288', null, 'Por Demanda', '3° Aditivo', 'Ativo', 'Importação inicial (planilha)', now()),
  ('5200012397', 'Maycon Douglas Pereira', 'MANUTENÇÃO PREVENTIVA', '4700369672', '1000046288', null, 'Por Demanda', null, 'Ativo', 'Importação inicial (planilha)', now()),
  ('5200017964', 'Arthur Araujo de Souza', 'Segurança Patrimonial', '4700388137', '1000084396', 56175.98, 'Mensal', '3° aditivo', 'Ativo', 'Importação inicial (planilha)', now()),
  ('5200014579', 'Maycon Douglas Pereira', 'GLP', '4100331166', '1000046391', null, 'Por Demanda', 'Contrato', 'Em Processamento', 'Importação inicial (planilha)', now()),
  ('5200016323', 'Arthur Araujo de Souza', 'Gerenciamento de Energia', '4700393226', '1000080252', 4150.00, 'Mensal', '4° Aditivo', 'Ativo', 'Importação inicial (planilha)', now()),
  ('5200010463', 'Arthur Araujo de Souza', 'Transmissão de Energia', '4700367189', '1000009138', 20000.00, 'Mensalidade', 'Aditivo', 'Ativo', 'Importação inicial (planilha)', now()),
  ('5200018464', 'Maycon Douglas Pereira', 'Manutenção fabril', '4700387762', '1000086383', 10023.54, 'Mensal', 'Contrato', null, 'Importação inicial (planilha)', now()),
  ('5200018417', 'Arthur Araujo de Souza', 'Serviço Advocatício', '4700386024', '1000086239', 8000.00, 'Mensal', 'Contrato', 'Inativo', 'Importação inicial (planilha)', now()),
  ('5200018527', 'Arthur Araujo de Souza', 'Serviço de RH', '4700389650', '1000086687', 6300.00, 'Mensal', '1° Aditivo', null, 'Importação inicial (planilha)', now()),
  ('5200013911', 'Arthur Araujo de Souza', 'SERVIÇO DE REVISÃO INSS', '4700346938', '1000072032', 8700.00, 'Por Demanda', '1° Aditivo', null, 'Importação inicial (planilha)', now()),
  ('5200013219', 'Arthur Araujo de Souza', 'SERVIÇO CONFIGURAÇÃO SWITCH', '4700364223', '1000037879', 300.00, 'Mensal', '3° Aditivo', 'Em Processamento', 'Importação inicial (planilha)', now()),
  ('5200012994', 'Arthur Araujo de Souza', 'LOCAÇÃO PABX', '4700364223', '1000037879', 100.00, 'Mensal', null, 'Em Processamento', 'Importação inicial (planilha)', now()),
  ('5200017889', 'Jose Alberto Teixeira da Silva', 'Locação de carro de frota - Arthur', '4700370863', '1000083286', 5497.10, 'Mensal', '1° Aditivo', null, 'Importação inicial (planilha)', now()),
  ('5200015262', 'Elaine Cunha Saad Abdulnur', 'Serviço de Advocacia', '4700292581', '1000077370', null, 'Por Demanda', 'Contrato', null, 'Importação inicial (planilha)', now()),
  ('5200018429', 'Arthur Araujo de Souza', 'Serviço de Fiscal', '4700386026', '1000086217', 7087.50, 'Mensal', '3° Aditivo', 'Inativo', 'Importação inicial (planilha)', now()),
  ('5200018813', 'Maycon Douglas Pereira', 'Serviço de apoio Adm', '4700398016', '1000087566', 4200.00, 'Mensal', '1° Aditivo', 'Inativo', 'Importação inicial (planilha)', now()),
  ('5200006901', 'Elaine Cunha Saad Abdulnur', 'Advocacia', '4700376300', '1000008361', 3386.82, 'Mensal', 'Contrato', null, 'Importação inicial (planilha)', now()),
  ('5200016770', 'Arthur Araujo de Souza', 'Serviço de TI', '4700365255', '1000081827', 7441.88, null, '5° ADITIVO', 'Ativo', 'Importação inicial (planilha)', now()),
  ('5200016564', 'Elaine Cunha Saad Abdulnur', 'PRESTAÇÃO DE SERVIÇO - PRC', '4700333789', '1000080658', null, null, 'CONTRATO', null, 'Importação inicial (planilha)', now()),
  ('5200008130', 'Arthur Araujo de Souza', 'Aluguel de Impressora', '4700376954', '1000014149', 980.00, 'Fixo Mensal', '15° ADITIVO', 'Inativo', 'Importação inicial (planilha)', now()),
  ('5200014450', 'Gabriel Weber Thomas', 'SERVIÇO DE ADVOCACIA', '4700353623', '1000008377', 310.00, 'Fixo Mensal', '3° ADITIVO', null, 'Importação inicial (planilha)', now()),
  ('5200010462', 'Arthur Araujo de Souza', 'VALE ALIMENTAÇÃO', '4700330967', '1000007788', null, 'FIXO MENSAL', '-', null, 'Importação inicial (planilha)', now()),
  ('5200011239', 'Arthur Araujo de Souza', 'CARTÃO VALE COMBUSTIVEL', '4700328008', '1000053969', 2500.00, 'FIXO MENSAL', '5° ADITIVO', 'Inativo', 'Importação inicial (planilha)', now()),
  ('5200011520', 'Maycon Douglas Pereira', 'LICENCIAMENTO/CESSÃO -SW', '4700363745', '1000012364', 4265.00, 'FIXO MENSAL', '9° ADTIVO', 'Inativo', 'Importação inicial (planilha)', now()),
  ('5200014424', 'Arthur Araujo de Souza', 'FORNECIMENTO DE INTERNET', '4700363036', '1000062335', 3485.00, 'FIXO MENSAL', '3° ADITIVO', 'Ativo', 'Importação inicial (planilha)', now()),
  ('5200019006', 'Arthur Araujo de Souza', 'Compra de Energia', '4700403408', '1000088008', 20000.00, 'Fixo Mensal', '1° Aditivo', null, 'Importação inicial (planilha)', now()),
  ('5200018974', 'Maycon Douglas Pereira', 'Software de Corte e Usinagem', '4700402166', '1000088007', null, null, 'Contrato', 'Inativo', 'Importação inicial (planilha)', now()),
  ('5200019029', 'Arthur Araujo de Souza', 'Aluguel de imóvel - Arthur', '4700403574', '1000088133', 2400.00, 'Fixo Mensal', 'Contrato', 'Ativo', 'Importação inicial (planilha)', now()),
  ('5200019076', 'Maycon Douglas Pereira', 'Locação de veículo', '4700405243', '1000063410', 3052.91, 'Fixo Mensal', 'Contrato', 'Ativo', 'Importação inicial (planilha)', now()),
  ('5200018925', 'Arthur Araujo de Souza', 'site da TEN', '4700400674', '1000083966', 145.00, 'Fixo Mensal', 'Contrato', 'Ativo', 'Importação inicial (planilha)', now()),
  ('5200019933', 'Arthur Araujo de Souza', 'Advogado', '4700427036', '1000091352', 12000.00, 'Mensal', '1° Aditivo', 'Ativo', 'Importação inicial (planilha)', now()),
  ('5200019969', 'Arthur Araujo de Souza', 'Auditoria Financeira 2025/1', '4700427859', '1000063486', 6000.00, 'FIXO MENSAL', 'Contrato', 'Inativo', 'Importação inicial (planilha)', now()),
  ('5200020763', 'Itana Souza Rocha Valois', 'Transporte de colaboradores', '4700455804', '1000009931', 136150.00, 'Por medição', 'Contrato', 'Ativo', 'Importação inicial (planilha)', now()),
  ('5200020773', 'Itana Souza Rocha Valois', 'Locação de veículos - hatches', '4700454746', '1000009931', 21300.00, 'Mensal', 'Contrato', 'Ativo', 'Importação inicial (planilha)', now()),
  ('590005811', 'Adriano da Silva Costa Oliveira', 'Fornecimento de refeição', '4100446449', '1000094634', null, 'Mensal', 'Contrato', 'Ativo', 'Importação inicial (planilha)', now()),
  ('5200020776', 'Adriano da Silva Costa Oliveira', 'MANUTENÇÃO PREVENTIVA', '4700454768', '1000014812', 12693.00, 'Trimestral', 'Contrato', 'Ativo', 'Importação inicial (planilha)', now()),
  ('5200020659', 'Arthur Araujo de Souza', 'SERVIÇOS ADMINISTRATIVOS', '4700451853', '1000094231', 14000.00, 'MENSAL', 'Contrato', 'Ativo', 'Importação inicial (planilha)', now()),
  ('5200020760', 'Pedro Advincula Falcao', 'EXAMES ADMISSIONAIS', '4700454131', '1000008786', 5075.00, 'Mensal', '12 meses', 'Ativo', 'Importação inicial (planilha)', now()),
  ('5200020828', 'Pedro Advincula Falcao', 'EXAMES ADMISSIONAIS', null, '1000015347', 7281.00, 'Mensal', '12 meses', 'Em Processamento', 'Importação inicial (planilha)', now()),
  ('5200020970', 'Pedro Advincula Falcao', 'EXAMES AMBULATORIAIS', '4700461158', '1000015345', 46360.83, 'Mensal', '12 meses', 'Ativo', 'Importação inicial (planilha)', now()),
  ('5200020863', 'Pedro Henrique da Costa Maciel', 'Locação de 02 equipamentos', '4700457927', '1000062786', 54000.00, 'Mensal', '18 meses', 'Ativo', 'Importação inicial (planilha)', now()),
  ('5200020742', 'Arthur Araujo de Souza', 'Fornecimento de energia', null, '1000080252', null, null, null, null, 'Importação inicial (planilha)', now()),
  ('5200020819', 'Pedro Henrique da Costa Maciel', 'Suporte técnico especializado', '4700455633', '1000070292', 44000.00, 'Mensal', '12 Meses', 'Ativo', 'Importação inicial (planilha)', now()),
  ('5200020772', 'Rafael Oliveira Dourado', 'Comunicação Corporativa', '4700454474', '1000079279', 1454.84, 'Mensal', '12 meses', 'Ativo', 'Importação inicial (planilha)', now()),
  ('5200020675', 'Pedro Henrique da Costa Maciel', 'SERVIÇOS TÉCNICOS ESPECIALIZADOS', '4700451891', '1000093042', 4000.00, 'Mensal', '12 meses', 'Ativo', 'Importação inicial (planilha)', now()),
  ('5200020715', 'Pedro Henrique da Costa Maciel', 'Alidis - Serviço de Engenharia', '4700453037', '1000094366', 15000.00, 'Mensal', '12 meses', 'Ativo', 'Importação inicial (planilha)', now()),
  ('5200020792', 'Arthur Araujo de Souza', 'ALUGUEL IMÓVEL COLABORADOR', '4700454879', '1000094551', 2500.00, 'Mensal', 'Contrato', 'Ativo', 'Importação inicial (planilha)', now()),
  ('5200020796', 'Rafael Oliveira Dourado', 'Prestação dos serviços especializados', '4700455411', '1000073088', 4100.00, 'Mensal', '12 meses', 'Ativo', 'Importação inicial (planilha)', now()),
  ('5200020774', null, 'Serviços contínuos de limpeza', '4700454752', '1000088119', 57668.50, 'Mensal', '24 meses', 'Inativo', 'Importação inicial (planilha)', now()),
  ('5200020831', 'Arthur Araujo de Souza', 'Locação de pequenos equipamentos', null, '1000014149', 2950.00, 'Mensal', '12 meses', null, 'Importação inicial (planilha)', now()),
  ('5200020788', 'Pedro Advincula Falcao', 'Locação de pequeno equipamento', '4700454890', '1000094723', 1400.00, 'mensal', '6 meses', 'Ativo', 'Importação inicial (planilha)', now()),
  ('5200020786', 'Arthur Araujo de Souza', 'LICENCIAMENTO E SUPORTE TÉCNICO', '4700454759', '1000088007', 2778.00, 'MENSAL', '36 MESES', 'Ativo', 'Importação inicial (planilha)', now()),
  ('5200020820', 'Ramon da Silva Santos', 'Dedetização Fábrica (geral)', '4700455680', '1000054128', 12977.50, 'DEMANDA', '12 MESES', 'Ativo', 'Importação inicial (planilha)', now()),
  ('5200020920', 'Maycon Douglas Pereira', 'SERVIÇO DE DILICENCIAMENTO', '4700459456', '1000094976', null, 'MENSAL', 'Contrato 12 meses', 'Inativo', 'Importação inicial (planilha)', now()),
  ('5200020919', 'Gilmara Moura de Souza', 'LOCAÇÃO DE CAMINHÃO MUNCK', '4700459453', '1000063536', 20000.00, 'MENSAL', 'Contrato - 24 meses', 'Ativo', 'Importação inicial (planilha)', now()),
  ('5200020938', 'Moab Jesus Barbosa', 'ramis e pbx', '4700460368', '1000037879', 1000.00, null, '12 meses', 'Ativo', 'Importação inicial (planilha)', now()),
  ('5200021064', 'Ademir Xavier de Santana', 'LIMPEZA E DESTINAÇÃO DE EFLUENTES', '4700464759', '1000063536', 7400.00, 'POR DEMANDA', '12 MESES', 'Ativo', 'Importação inicial (planilha)', now()),
  ('5200020804', 'Arthur Araujo de Souza', 'Serviço de Engenharia de Segurança', '4700455382', '1000094788', 15000.00, 'Mensal', 'Contrato', 'Ativo', 'Importação inicial (planilha)', now()),
  ('5200021037', 'Pedro Henrique da Costa Maciel', 'Inspeção de qualidade - Cenc', '4700464223', '1000095168', 18000.00, 'Contrato', '12 Meses', 'Ativo', 'Importação inicial (planilha)', now()),
  ('5200020957', 'Pedro Henrique da Costa Maciel', 'Inspetor de qualidade - Otaci', '4700460613', '1000095387', 18000.00, '12 Meses', '12 Meses', 'Ativo', 'Importação inicial (planilha)', now()),
  ('5200021084', 'Ramon da Silva Santos', 'COLETA E RECICLAGEM DE RESÍDUOS', '4700465379', '1000095004', 3500.00, 'MENSAL', '24M', 'Ativo', 'Importação inicial (planilha)', now())
on conflict (documento_compras) do update set
  gestor = excluded.gestor,
  escopo_servico = excluded.escopo_servico,
  po_pedido_compra = excluded.po_pedido_compra,
  codigo_fornecedor = excluded.codigo_fornecedor,
  valor_parcela = excluded.valor_parcela,
  modalidade = excluded.modalidade,
  vigencia_label = excluded.vigencia_label,
  status = excluded.status,
  updated_by = excluded.updated_by,
  updated_at = excluded.updated_at;

-- ---------------------------------------------------------------------
-- NÃO incluídas acima — precisam de revisão manual (mesmo na versão de
-- melhor qualidade da planilha):
--
-- 1. Quatro linhas vieram com N° Contrato em branco na planilha (não dá para
--    casar sem essa chave):
--      - "ISRAEL GONÇALVES DA SILVA SOARES" (Coordenador de Produção,
--        R$ 240.000,00 / parcela R$ 20.000,00 mensal, PO em branco, cód.
--        fornecedor 1000094399 — mesmo cód. da linha 5200020678 abaixo).
--      - "RODRIGUES & SANGALOS SERVIÇOS" (Transporte e Destinação Final,
--        Ademir Xavier de Santana, modalidade "Medição", PO em branco).
--      - "COMPANHIA EMPÓRIO DE ARMAZENAGEM" (Serviço de Armazenagem, Maycon
--        Douglas Pereira, R$ 1.000.000,00, Por Demanda, Em Processamento —
--        PO e código do fornecedor também em branco).
--      - "Iury Pimenta Moreira" (Locação de Equipamento, PO 4700459765,
--        cód. fornecedor 1000077303, R$ 12.500,00, 30 dias).
--
-- 2. Duas chaves aparecem duplicadas NA PRÓPRIA PLANILHA (mesmo N° Contrato
--    em duas linhas com PO, fornecedor e valores diferentes — não é erro de
--    leitura da imagem, as duas linhas existem mesmo na fonte). Não dei
--    upsert em nenhuma das duas para não sobrescrever a errada:
--      - 5200020664: uma linha com PO 4700452189 / Maycon Douglas Pereira /
--        MS ADMINISTRATIVO LTDA / "SERVIÇOS ESPECIALIZADOS DE..." /
--        R$ 240.000,00 (parcela R$ 20.000,00); outra com PO 4700451876 /
--        Pedro Henrique da Costa Maciel / IPM ENGENHARIA LTDA / "SERVIÇO DE
--        ENGENHARIA DA..." / R$ 216.000,00 (parcela R$ 18.000,00).
--      - 5200020678: uma linha com PO 4700452885 / Pedro Henrique da Costa
--        Maciel / I GONÇALVES DA SILVA SOARES LTDA / "SERVIÇO DE
--        COORDENAÇÃO D..." / R$ 240.000,00 (parcela R$ 20.000,00); outra com
--        PO 4700452160 / mesmo gestor / M.SAVIOCUNHA / "Inspeção de END -
--        Ensaios Na..." / R$ 528.000,00 (parcela R$ 44.000,00).
--    Confirme com a fonte de origem (provavelmente um dos dois N° Contrato
--    da planilha está errado) e rode um UPDATE à parte para cada um.
-- ---------------------------------------------------------------------
