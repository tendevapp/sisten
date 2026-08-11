-- Título curto e editável da solicitação — usado no card do quadro Kanban
-- (Contratos > Demandas) e opcionalmente preenchido na criação do chamado.
-- Genérico em `requests`; nulo em todo o resto.

alter table public.requests add column if not exists titulo text;
