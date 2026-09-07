-- =====================================================================
-- Usuários sem e-mail corporativo
--
-- Parte do efetivo de campo não tem caixa de e-mail e precisa entrar no
-- SISTEN. Para essa gente o administrador cria o acesso com identificador
-- `nome.sobrenome` e senha provisória — não existe auto-cadastro nem link de
-- confirmação, porque não há para onde mandar.
--
-- O Supabase Auth autentica por e-mail, então o identificador vira
-- `nome.sobrenome@sisten.local`. O domínio não é roteável: nada é enviado e o
-- endereço nunca colide com uma caixa real.
--
-- `login_sem_email` marca esses perfis para a tela não oferecer o que não
-- funciona para eles (recuperar senha por e-mail, notificação por e-mail) e
-- para o admin saber que a redefinição de senha passa por ele.
-- =====================================================================

alter table public.core_perfis
  add column if not exists login_sem_email boolean not null default false;

comment on column public.core_perfis.login_sem_email is
  'Acesso criado pelo admin com identificador nome.sobrenome@sisten.local; não há caixa de e-mail real.';

-- Perfis já existentes com endereço interno (se houver) ficam marcados.
update public.core_perfis
   set login_sem_email = true
 where email ilike '%@sisten.local'
   and login_sem_email = false;
