-- Chamado com destino Suprimentos — categoria "Pendência de Processamento".
-- Uma linha por registro pendente; o protocolo SUP-DDMMAA-NN é o mesmo para
-- todas as linhas de um chamado (também gravado em core_solicitacoes.titulo).
-- O texto colado da planilha é reconhecido em src/lib/supPendenciasProcessamento.ts.
--
-- Três modelos, discriminados por `modelo`:
--   'nfse'          → relação de NFS-e com valor e mês de competência;
--   'documento'     → lançamentos com erro/ação necessária no SAP (nº de documento
--                     de 9 posições, série, UF, PO, comprador, data de envio);
--   'ajuste_pedido' → chamado "Ajuste de Pedido": demanda em `observacao`, NF em
--                     `numero_nfse`, pedido em `documento_compras`, fornecedor em
--                     `nome_fornecedor`, imagens comprimidas em `imagem_paths`
--                     (a primeira também em `imagem_path`, por compat).
-- Colunas próprias de um modelo ficam nulas nos outros.
-- Aplicado via Supabase MCP em 2026-09-01 (migrations create_sup_pend_processamento_nf
--   + sup_pend_processamento_nf_modelo_documento + sup_pend_processamento_nf_modelo_ajuste_pedido
--   + sup_pend_processamento_nf_imagem_paths).

create table if not exists public.sup_pend_processamento_nf (
  id uuid primary key default gen_random_uuid(),
  request_id text not null references public.core_solicitacoes(id) on delete cascade,
  protocolo text not null,
  modelo text not null default 'nfse' check (modelo in ('nfse', 'documento', 'ajuste_pedido')),
  numero_nfse text not null,          -- nº da NFS-e ('nfse') / nº do documento ('documento') / nº da NF ('ajuste_pedido')
  data_emissao_nfse text,
  nome_fornecedor text,
  observacao text,                    -- também guarda a "demanda" no modelo 'ajuste_pedido'
  -- modelo 'nfse'
  nfse_cancelada text,
  fornecedor text,
  valor_nfse numeric,
  valor_nfse_raw text,
  mes_competencia text,
  -- modelo 'documento'
  documento_status text,
  serie text,
  uf_emissor text,
  chegou text,
  documento_compras text,             -- também guarda o "nº do pedido" no modelo 'ajuste_pedido'
  comprador text,
  data_envio text,
  -- modelo 'ajuste_pedido'
  imagem_paths text[],                -- caminhos no bucket request-attachments
  imagem_path text,                   -- primeiro caminho (compat com imagem única)
  -- classificação da demanda (modelos 'nfse' / 'documento') — repetida em todas
  -- as linhas da submissão; alimenta análise de causas.
  observacao_chamado text,
  classif_causa text,
  classif_responsavel text,
  classif_impacto text,
  classif_recorrencia text,
  status text not null default 'pendente' check (status in ('pendente', 'concluido')),
  resolucao text,
  resolvido_por text references public.core_perfis(id),
  resolvido_em timestamptz,
  ordem int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists sup_pend_proc_nf_request_idx on public.sup_pend_processamento_nf (request_id);
create index if not exists sup_pend_proc_nf_protocolo_idx on public.sup_pend_processamento_nf (protocolo);
create index if not exists sup_pend_proc_nf_status_idx on public.sup_pend_processamento_nf (status);
create index if not exists sup_pend_proc_nf_modelo_idx on public.sup_pend_processamento_nf (modelo);
create index if not exists sup_pend_proc_nf_classif_causa_idx on public.sup_pend_processamento_nf (classif_causa);

alter table public.sup_pend_processamento_nf enable row level security;

create policy sup_pend_proc_nf_rw on public.sup_pend_processamento_nf
  for all to authenticated using (true) with check (true);
