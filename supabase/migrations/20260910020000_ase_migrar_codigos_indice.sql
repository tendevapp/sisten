-- Migração dos códigos de protocolo da ASE para a Opção B (Com Setor e Índice Obrigatório): ASE-DDMMYY-SETOR-INDICE

-- 1. Garante que protocolos de registros excluídos não colidam com os ativos
UPDATE rh_ase_solicitacoes 
SET numero_protocolo = 'ASE-DEL-' || substr(id::text, 1, 8)
WHERE excluido_em IS NOT NULL 
  AND (numero_protocolo NOT LIKE 'ASE-DEL-%' OR numero_protocolo IS NULL);

-- 2. Atualização dos 17 registros vigentes para o padrão com setor e índice obrigatório (-01, etc.)
-- 01/09/2026
UPDATE rh_ase_solicitacoes SET numero_protocolo = 'ASE-010926-QUAL-01' WHERE id = '3078eb74-0a72-4d1b-a0af-6ab16aed12b1';

-- 03/09/2026
UPDATE rh_ase_solicitacoes SET numero_protocolo = 'ASE-030926-PROD-01' WHERE id = 'af0d35c0-58d4-4d06-bd2f-ec6da325c1c3';
UPDATE rh_ase_solicitacoes SET numero_protocolo = 'ASE-030926-MANUT-01' WHERE id = '7547a857-f6b0-4260-ad40-7625d8bc7deb';
UPDATE rh_ase_solicitacoes SET numero_protocolo = 'ASE-030926-QUAL-01' WHERE id = '241d4973-60d9-4d01-9597-a77362c1daf9';

-- 04/09/2026
UPDATE rh_ase_solicitacoes SET numero_protocolo = 'ASE-040926-PROD-01' WHERE id = '49655803-7f13-4ec7-9d9f-48616d3afaa6';
UPDATE rh_ase_solicitacoes SET numero_protocolo = 'ASE-040926-ALMOX-01' WHERE id = '3fb96f1d-aff6-4f0d-8780-54782ad40a6b';

-- 05/09/2026
UPDATE rh_ase_solicitacoes SET numero_protocolo = 'ASE-050926-SEG-01' WHERE id = 'ca0b7851-b790-4a91-a625-d4f00b190fa6';
UPDATE rh_ase_solicitacoes SET numero_protocolo = 'ASE-050926-FACILI-01' WHERE id = '5e7b8e16-0b1c-4b5d-b8f5-9ad7dbb9c4c6';
UPDATE rh_ase_solicitacoes SET numero_protocolo = 'ASE-050926-ALMOX-01' WHERE id = '88ad3f70-bccf-44dd-87e3-ebc1540f53bc';

-- 08/09/2026
UPDATE rh_ase_solicitacoes SET numero_protocolo = 'ASE-080926-PROD-01' WHERE id = 'd266186c-5c79-426b-bf7e-24089b33d77c';
UPDATE rh_ase_solicitacoes SET numero_protocolo = 'ASE-080926-QUAL-01' WHERE id = '5dbda403-4da9-4001-a582-f4d018cd9f8f';
UPDATE rh_ase_solicitacoes SET numero_protocolo = 'ASE-080926-ALMOX-01' WHERE id = 'a2efb4a3-fe24-4029-b2b5-87e3c0037609';

-- 09/09/2026
UPDATE rh_ase_solicitacoes SET numero_protocolo = 'ASE-090926-PROD-01' WHERE id = '4cbc1978-b592-4228-980f-2d660ce77e4a';
UPDATE rh_ase_solicitacoes SET numero_protocolo = 'ASE-090926-ALMOX-01' WHERE id = '0fe42e9a-964f-4132-8045-8c07981ce967';
UPDATE rh_ase_solicitacoes SET numero_protocolo = 'ASE-090926-QUAL-01' WHERE id = '1881910e-78ca-411d-aa3e-4805a6f39d3f';

-- 12/09/2026
UPDATE rh_ase_solicitacoes SET numero_protocolo = 'ASE-120926-ALMOX-01' WHERE id = '6b694125-6c71-4117-b1e3-20f859329c2e';
UPDATE rh_ase_solicitacoes SET numero_protocolo = 'ASE-120926-PROD-01' WHERE id = '69f97ff7-6169-4256-8bc7-1f24119f1b73';
