-- Migration: Cadastro SAP — número do ticket em plataforma externa
--
-- O atendente de Cadastro SAP abre o chamado real em outra plataforma
-- (Astrein, service desk da controladoria, etc.). Guardar esse número na
-- própria solicitação fecha o vínculo: quem acompanha aqui sabe para onde
-- olhar lá fora, sem depender de garimpar a conversa. Opcional — nem todo
-- cadastro passa por plataforma externa.
ALTER TABLE core_solicitacoes
  ADD COLUMN IF NOT EXISTS ticket_externo text DEFAULT NULL;
