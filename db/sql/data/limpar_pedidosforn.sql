-- Script para limpar todos os dados da tabela pedidosforn no Supabase
-- ATENÇÃO: script destrutivo, execução manual apenas. Apaga TODO o histórico
-- de pedidos (ZL0132). Até 27/08/2026 apontava para `pedidosforn`, que virou
-- view na reestruturação de nomenclatura — o TRUNCATE falhava. Agora aponta
-- para a tabela real de novo, então voltou a ser capaz de apagar tudo.
TRUNCATE TABLE public.sap_zl0132_po RESTART IDENTITY CASCADE;
