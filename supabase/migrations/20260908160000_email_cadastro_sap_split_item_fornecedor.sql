-- Separa o gatilho de e-mail do Cadastro SAP: itens continuam com o Jeff
-- (jefferson.santana), fornecedor passa a ir para a Ana Leite.

update public.config_envio_emails
set nome = 'Solicitação de Cadastro SAP — Itens',
    descricao = 'Disparado ao enviar uma solicitação de cadastro de ITEM no SAP (aba Cadastro SAP em Nova Solicitação, tipo "Item").',
    updated_at = now()
where chave = 'cadastro_sap';

insert into public.config_envio_emails (chave, nome, modulo, descricao, destinatarios, assunto_padrao, ativo)
values (
  'cadastro_sap_fornecedor',
  'Solicitação de Cadastro SAP — Fornecedor',
  'SUPRIMENTOS',
  'Disparado ao enviar uma solicitação de cadastro de FORNECEDOR no SAP (aba Cadastro SAP em Nova Solicitação, tipo "Fornecedor").',
  'ana.leite@ten.ind.br',
  'Cadastro SAP - Fornecedor',
  true
)
on conflict (chave) do nothing;
