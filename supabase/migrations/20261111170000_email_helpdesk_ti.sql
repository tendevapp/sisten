-- Gatilho de e-mail do chamado para a TI: ao enviar um chamado com destino TI
-- (Nova Solicitação > Helpdesk), o SISTEN abre o Outlook para a equipe.
-- Destinatários editáveis em Cadastros > E-mails.

insert into public.config_envio_emails (chave, nome, modulo, descricao, destinatarios, assunto_padrao, ativo)
values (
  'helpdesk_ti',
  'Abertura de Chamado para a TI',
  'HELPDESK',
  'Disparado ao enviar um chamado com destino TI (Nova Solicitação > Helpdesk). Abre o Outlook com o conteúdo do chamado.',
  'moab.barbosa@ten.ind.br; elaine.luz@ten.ind.br',
  'Chamado TI',
  true
)
on conflict (chave) do update
  set destinatarios = excluded.destinatarios,
      updated_at = now();
