-- Serviço: "Regularização de Serviço" (serviço já executado que precisa de RM
-- para regularizar). Exige documento anexado no formulário (cotação, NF,
-- print do e-mail). Fica separado de is_generic, que é do catálogo de material.
alter table public.core_solicitacoes_itens
  add column if not exists regularizacao_servico boolean not null default false;
