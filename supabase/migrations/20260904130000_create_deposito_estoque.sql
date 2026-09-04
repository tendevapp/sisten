-- ==============================================================================
-- Tabela: deposito_estoque
-- Descrição: Depósitos de estoque (SAP MM) com a descrição funcional de cada um.
--
-- Contexto: os relatórios do SAP trazem só o código de quatro dígitos ("0004",
-- "0105"), que não diz nada a quem não decorou a lista. As telas do almoxarifado
-- passam a exibir "código - descrição" a partir daqui.
--
-- O espelho no frontend é `DEPOSITO_DESCRICAO` em src/lib/almoxarifado.ts —
-- ao incluir ou renomear um depósito, atualize os dois.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.deposito_estoque (
    deposito VARCHAR(10) PRIMARY KEY,
    descricao TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.deposito_estoque ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deposito_estoque_read" ON public.deposito_estoque;
CREATE POLICY "deposito_estoque_read" ON public.deposito_estoque
    FOR SELECT TO authenticated, anon
    USING (true);

INSERT INTO public.deposito_estoque (deposito, descricao)
VALUES
    ('0001', 'Consumíveis Solda'),
    ('0002', 'EPIs + Consumíveis'),
    ('0003', 'Projeto Atual (Goldwing)'),
    ('0004', 'Manutenção'),
    ('0005', 'Kits Montados (Materiais de Projeto)'),
    ('0006', 'Inventário (Ajuste Sistêmico do estoque)'),
    ('0050', 'Recebimento Compra direta'),
    ('0090', 'CAPS - Depósito Virtual de faturamento dos Tramo (Contabilidade)'),
    ('0105', 'Transferência Produção (Material consumo)'),
    ('0200', 'Químicos'),
    ('0300', 'Segregados (materiais com validade vencidas ou materiais segregados)'),
    ('1000', 'Recebimento Materiais Estoque')
ON CONFLICT (deposito) DO UPDATE SET
    descricao = EXCLUDED.descricao,
    updated_at = NOW();
