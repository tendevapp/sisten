-- Migration: 20260917155000_create_fin_pep.sql
-- Criação da tabela fin_pep (Estrutura Analítica do Projeto / WBS Element do Financeiro/SAP)

CREATE TABLE IF NOT EXISTS public.fin_pep (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  centro_lucro text,
  definicao_projeto text,
  wbs_element text NOT NULL,
  nome text,
  nivel integer,
  unidade_medida text,
  moeda text,
  empresa text,
  classificacao_contabil text,
  elemento_faturamento text,
  status text,
  ifrs15_od text,
  importado_em timestamptz DEFAULT now(),
  importado_por text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT fin_pep_wbs_element_key UNIQUE (wbs_element)
);

CREATE INDEX IF NOT EXISTS idx_fin_pep_wbs_element ON public.fin_pep (wbs_element);
CREATE INDEX IF NOT EXISTS idx_fin_pep_definicao_projeto ON public.fin_pep (definicao_projeto);
CREATE INDEX IF NOT EXISTS idx_fin_pep_nivel ON public.fin_pep (nivel);
CREATE INDEX IF NOT EXISTS idx_fin_pep_centro_lucro ON public.fin_pep (centro_lucro);

ALTER TABLE public.fin_pep ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'fin_pep' AND policyname = 'fin_pep_select_all'
  ) THEN
    CREATE POLICY fin_pep_select_all ON public.fin_pep FOR SELECT TO authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'fin_pep' AND policyname = 'fin_pep_all_authenticated'
  ) THEN
    CREATE POLICY fin_pep_all_authenticated ON public.fin_pep FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
