-- Campos específicos do chamado jurídico (destino "Jurídico" em Nova Solicitação).
-- Nulos para todos os outros tipos/destinos de solicitação.

alter table public.requests
  add column if not exists contrato_tipo text,
  add column if not exists fornecedor_terceiro text;
