-- Módulo Portaria — Sessões do "Briefing de Segurança & Lista de Presença" (FRM.SGP-0013).
-- Cabeçalho da turma/sessão de integração e briefing de segurança na portaria.

create table if not exists public.port_briefing_sessoes (
  id uuid primary key default gen_random_uuid(),
  codigo_formulario text not null default 'FRM.SGP-0013',
  numero_protocolo text not null unique,
  tema_treinamento text not null default 'BRIEFING DE SEGURANÇA',
  tipo text not null default 'INTERNO' check (tipo in ('INTERNO', 'EXTERNO')),
  data date not null default current_date,
  instrutor_responsavel text not null,
  conteudo_programatico text not null default '1. Apresentação do Layout da Fábrica TEN - Vídeo institucional e vídeo de segurança;
2. Apresentação dos procedimentos e rotinas de segurança;
3. Protocolo de proibição do uso do celular nas áreas produtivas da TEN.',
  termo_responsabilidade text not null default 'Declaro ter recebido as orientações de segurança aplicáveis à minha visita ou atividade, estar ciente das regras gerais de conduta da fábrica e portar as documentações e EPIs exigidos para a minha atuação. Assumo a responsabilidade por qualquer irregularidade constatada em minhas documentações e/ou desvios de conduta durante minha permanência.',
  status text not null default 'ABERTA' check (status in ('ABERTA', 'CONCLUIDA', 'CANCELADA')),
  observacoes text,
  criado_por text references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  excluido_em timestamptz,
  excluido_por text references public.core_perfis(id)
);

create index if not exists port_briefing_sessoes_data_idx on public.port_briefing_sessoes (data desc);
create index if not exists port_briefing_sessoes_status_idx on public.port_briefing_sessoes (status);

alter table public.port_briefing_sessoes enable row level security;

drop policy if exists port_briefing_sessoes_rw on public.port_briefing_sessoes;
create policy port_briefing_sessoes_rw on public.port_briefing_sessoes
  for all to authenticated using (true) with check (true);
