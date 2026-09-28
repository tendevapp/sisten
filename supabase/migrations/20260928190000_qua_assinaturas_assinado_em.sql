-- Momento exato da assinatura (data e hora da captura no tablet), mostrado na
-- tela e no PDF. Nos Internos a assinatura sobe só ao salvar, então created_at
-- não é a hora em que a pessoa assinou — o cliente envia a hora da captura.

alter table public.qua_internos_mecanicos_assinaturas
  add column if not exists assinado_em timestamptz not null default now();
update public.qua_internos_mecanicos_assinaturas set assinado_em = created_at where assinado_em <> created_at;

alter table public.qua_checklist_expedicao_assinaturas
  add column if not exists assinado_em timestamptz not null default now();
update public.qua_checklist_expedicao_assinaturas set assinado_em = created_at where assinado_em <> created_at;
