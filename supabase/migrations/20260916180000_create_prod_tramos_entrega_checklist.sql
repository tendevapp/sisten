-- =====================================================================
-- Produção > Controle de Entrega — Checklist de liberação (White → Expedido)
--
-- Histórico de apontamento das etapas finais de liberação de cada tramo,
-- entre o tratamento de superfície (white) e a expedição para o parque
-- eólico: montagem final, limpeza, liberação de qualidade, carregamento,
-- registros fotográfico/vídeo, fechamento, documentação, fatura e
-- início do transporte. Cada linha é um apontamento com data/hora e
-- responsável; desmarcar uma etapa não apaga o registro (soft delete
-- via excluido_em), preservando o histórico/auditoria.
-- =====================================================================

create table if not exists public.prod_tramos_entrega_checklist (
  id uuid primary key default gen_random_uuid(),
  tramo_entrega_id text not null references public.prod_tramos_entrega (id) on delete cascade,
  etapa_codigo text not null check (etapa_codigo in (
    'estrutura_multiviga',
    'tampas_flange',
    'limpeza',
    'liberacao_qualidade',
    'carregamento_veiculo',
    'registro_fotografico',
    'video_gravado',
    'fechamento_final',
    'documentacao_liberada',
    'fatura_liberada',
    'transporte_iniciado'
  )),
  concluida_em timestamptz not null default now(),
  concluida_por text,
  observacao text,
  excluido_em timestamptz,
  created_at timestamptz not null default now()
);

-- Só uma etapa ativa (não desmarcada) por tramo — reabrir depois de desmarcar cria novo apontamento
create unique index if not exists prod_tramos_entrega_checklist_ativa_uk
  on public.prod_tramos_entrega_checklist (tramo_entrega_id, etapa_codigo)
  where excluido_em is null;

create index if not exists idx_prod_tramos_entrega_checklist_tramo
  on public.prod_tramos_entrega_checklist (tramo_entrega_id);

grant select, insert, update, delete on public.prod_tramos_entrega_checklist to anon, authenticated, service_role;
alter table public.prod_tramos_entrega_checklist enable row level security;
drop policy if exists "prod_tramos_entrega_checklist_all" on public.prod_tramos_entrega_checklist;
create policy "prod_tramos_entrega_checklist_all" on public.prod_tramos_entrega_checklist for all using (true) with check (true);
