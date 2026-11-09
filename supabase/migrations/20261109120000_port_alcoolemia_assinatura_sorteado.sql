-- Teste de Alcoolemia (Portaria/SSMA): assinatura do sorteado.
-- Mesmo formato das outras assinaturas do app (briefing, ficha de EPI,
-- produção): PNG em data URL, gerado pelo SignaturePadModal em escala fixa 2x.
-- Fica na própria linha (e não no Storage) para entrar junto na fila offline
-- do fetchOffline: o vigilante coleta a assinatura sem sinal no pátio.

alter table public.port_alcoolemia_testes
  add column if not exists assinatura_sorteado text,
  add column if not exists assinatura_sorteado_em timestamptz;

comment on column public.port_alcoolemia_testes.assinatura_sorteado is
  'Assinatura do sorteado (PNG em data URL). Nula enquanto não assinou.';
comment on column public.port_alcoolemia_testes.assinatura_sorteado_em is
  'Quando a assinatura do sorteado foi coletada.';
