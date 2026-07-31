-- Prazo de conclusão definido manualmente no quadro Kanban de Demandas
-- (Contratos > Demandas). Genérico em `requests` — nulo em todo o resto.

alter table public.requests add column if not exists prazo_conclusao date;
