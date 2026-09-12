-- Migration: Criação da tabela de logs de movimentações da página de Contratos (Demandas e Contratos)
-- Data: 2026-09-11
--
-- Armazena o histórico auditável de cada movimentação (de qual coluna/status para qual,
-- data e hora exata, usuário, duração na etapa anterior e contexto) para cálculo de
-- indicadores de desempenho (Lead Time, Cycle Time, Tempo por Fase e Throughput).

CREATE TABLE IF NOT EXISTS public.sup_contratos_movimentacoes (
  id text PRIMARY KEY,
  tipo_entidade text NOT NULL DEFAULT 'demanda', -- 'demanda' | 'contrato'
  item_id text NOT NULL, -- request_id ou documento_compras
  identificador text NOT NULL, -- ex: '#2609001' ou '4600012345'
  titulo text NOT NULL,
  status_anterior text NOT NULL,
  status_novo text NOT NULL,
  status_anterior_label text,
  status_novo_label text,
  data_hora timestamptz NOT NULL DEFAULT now(),
  usuario_id text,
  usuario_nome text,
  duracao_etapa_segundos bigint DEFAULT 0,
  observacao text,
  origem text NOT NULL DEFAULT 'kanban_drag', -- 'kanban_drag' | 'card_select' | 'modal_detail' | 'nova_demanda' | 'contrato_modal'
  metadados jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sup_contratos_mov_item ON public.sup_contratos_movimentacoes(item_id, data_hora DESC);
CREATE INDEX IF NOT EXISTS idx_sup_contratos_mov_tipo ON public.sup_contratos_movimentacoes(tipo_entidade, data_hora DESC);
CREATE INDEX IF NOT EXISTS idx_sup_contratos_mov_data ON public.sup_contratos_movimentacoes(data_hora DESC);

ALTER TABLE public.sup_contratos_movimentacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sup_contratos_movimentacoes_read" ON public.sup_contratos_movimentacoes;
CREATE POLICY "sup_contratos_movimentacoes_read" ON public.sup_contratos_movimentacoes
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "sup_contratos_movimentacoes_insert" ON public.sup_contratos_movimentacoes;
CREATE POLICY "sup_contratos_movimentacoes_insert" ON public.sup_contratos_movimentacoes
  FOR INSERT TO authenticated WITH CHECK (true);

GRANT ALL ON TABLE public.sup_contratos_movimentacoes TO anon, authenticated, service_role;
