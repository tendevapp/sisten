-- Compra direta: o solicitante indica, em cada item, o setor que vai receber o
-- material. O almoxarifado vê a tag no recebimento e sabe para quem separar.
-- Guarda o nome do setor (lista do cadastro de setores do RH, a mesma da ASE),
-- não o id: a informação precisa ser legível mesmo se o setor for renomeado.
ALTER TABLE public.core_solicitacoes_itens
  ADD COLUMN IF NOT EXISTS setor_destinatario text;
