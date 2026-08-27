-- =====================================================================
-- TABELA DE CONFIGURAÇÃO DE ENVIOS DE E-MAILS & OUTLOOK (SISTEN)
-- =====================================================================
-- Permite aos administradores configurar os destinatários padrão (Para, CC, BCC)
-- e assuntos utilizados na abertura do Outlook (mailto:) pelos módulos do sistema.

create table if not exists public.config_envio_emails (
  id uuid primary key default gen_random_uuid(),
  chave text not null unique,
  nome text not null,
  modulo text not null default 'GERAL', -- 'SUPRIMENTOS', 'LOGISTICA', 'PORTARIA', 'RH', 'HELPDESK', 'GERAL'
  descricao text,
  destinatarios text not null, -- e-mails separados por vírgula ou ponto e vírgula
  copia text, -- CC (opcional)
  copia_oculta text, -- BCC (opcional)
  assunto_padrao text,
  ativo boolean not null default true,
  criado_por text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists config_envio_emails_chave_idx on public.config_envio_emails (chave);
create index if not exists config_envio_emails_modulo_idx on public.config_envio_emails (modulo);
create index if not exists config_envio_emails_ativo_idx on public.config_envio_emails (ativo);

alter table public.config_envio_emails enable row level security;

-- Política de RLS: Todos os usuários autenticados podem ler para disparar os e-mails
drop policy if exists config_envio_emails_read on public.config_envio_emails;
create policy config_envio_emails_read on public.config_envio_emails
  for select to authenticated using (true);

-- Política de RLS: Apenas usuários autenticados podem inserir/atualizar/excluir
drop policy if exists config_envio_emails_write on public.config_envio_emails;
create policy config_envio_emails_write on public.config_envio_emails
  for all to authenticated using (true) with check (true);

-- =====================================================================
-- CARGA INICIAL (SEEDS COM GATILHOS ATUAIS DO SISTEN)
-- =====================================================================

insert into public.config_envio_emails (chave, nome, modulo, descricao, destinatarios, copia, copia_oculta, assunto_padrao, ativo)
values
  (
    'cadastro_sap',
    'Solicitação de Cadastro SAP (Itens / Fornecedores)',
    'SUPRIMENTOS',
    'Disparado após o preenchimento de uma solicitação de cadastro no SAP (aba Cadastro SAP em Nova Solicitação).',
    'jefferson.santana@ten.ind.br',
    null,
    null,
    'Cadastro SAP',
    true
  ),
  (
    'expedicao_chegada',
    'Aviso de Chegada de Veículo na Portaria (Expedição)',
    'LOGISTICA',
    'Disparado no momento em que o caminhão/veículo encosta na portaria para carregamento de tramos.',
    'andre.araujo@ten.ind.br',
    null,
    null,
    'Chegada na portaria',
    true
  ),
  (
    'expedicao_tramos',
    'Relatório de Carregamento de Tramos (Expedição Completa)',
    'LOGISTICA',
    'Disparado ao concluir e salvar o relatório de expedição com tramos, placas, motorista e links de fotos.',
    'andre.araujo@ten.ind.br',
    null,
    null,
    'Carregamento Tramos',
    true
  ),
  (
    'portaria_relatorio',
    'Relatório de Turno e Ocorrências da Portaria',
    'PORTARIA',
    'Disparado para envio do fechamento de turno e ocorrências operacionais da portaria da fábrica.',
    'andre.araujo@ten.ind.br',
    null,
    null,
    'Relatório de Turno - Portaria TEN',
    true
  ),
  (
    'helpdesk_juridico',
    'Avisos de Chamados do Jurídico & Contratos',
    'HELPDESK',
    'Notificação de novos chamados e solicitações direcionadas ao setor Jurídico.',
    'juridico@ten.ind.br',
    null,
    null,
    'Chamado Jurídico - SISTEN',
    true
  )
on conflict (chave) do nothing;
