-- =====================================================================
-- Setor Portaria
--
-- A Portaria já tem módulo próprio no SISTEN (chegada de transporte,
-- carretas, passagem de plantão), mas não existia como setor: quem trabalha
-- lá era cadastrado em "Segurança" ou ficava sem setor, e o setor é o que
-- decide o que aparece na tela inicial, quem aprova o quê e para onde vai a
-- notificação.
--
-- `is_support = false` e `helpdesk_enabled = false`: a Portaria não recebe
-- chamado de helpdesk, ela preenche os próprios formulários.
--
-- Mantém o mesmo id da lista semente do app (`src/data/sectors.ts`), para a
-- base local e a remota não divergirem.
-- =====================================================================

insert into public.core_setores (id, name, is_support, helpdesk_enabled)
values ('19', 'Portaria', false, false)
on conflict (id) do nothing;
