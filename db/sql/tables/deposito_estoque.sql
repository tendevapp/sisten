-- ==============================================================================
-- Tabela: deposito_estoque
-- Descrição: Depósitos de estoque (SAP MM) com a descrição funcional de cada um.
--
-- Contexto: os relatórios do SAP trazem só o código de quatro dígitos ("0004",
-- "0105"), que não diz nada a quem não decorou a lista. As telas do almoxarifado
-- passam a exibir "código - descrição" a partir daqui.
--
-- O espelho no frontend é `DEPOSITO_DESCRICAO` + `DEPOSITOS_INATIVOS` em
-- src/lib/almoxarifado.ts — ao incluir, renomear ou inativar um depósito,
-- atualize os dois.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.deposito_estoque (
    deposito VARCHAR(10) PRIMARY KEY,
    descricao TEXT NOT NULL,
    -- FALSE = status "Exclusão" no SAP: não recebe material novo. O histórico
    -- de movimentação desses depósitos permanece intacto (a MB51 ainda tem
    -- lançamentos em 0202, 0120, 0100 e 0030); o flag só marca o cadastro.
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.deposito_estoque
    ADD COLUMN IF NOT EXISTS ativo BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE public.deposito_estoque ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deposito_estoque_read" ON public.deposito_estoque;
CREATE POLICY "deposito_estoque_read" ON public.deposito_estoque
    FOR SELECT TO authenticated, anon
    USING (true);

INSERT INTO public.deposito_estoque (deposito, descricao, ativo)
VALUES
    ('0001', 'Consumíveis Solda', TRUE),
    ('0002', 'EPIs + Consumíveis', TRUE),
    ('0003', 'Projeto Atual (Goldwing)', TRUE),
    ('0004', 'Manutenção', TRUE),
    ('0005', 'Kits Montados (Materiais de Projeto)', TRUE),
    ('0006', 'Inventário (Ajuste Sistêmico do estoque)', TRUE),
    ('0050', 'Recebimento Compra direta', TRUE),
    ('0090', 'CAPS - Depósito Virtual de faturamento dos Tramo (Contabilidade)', TRUE),
    ('0105', 'Transferência Produção (Material consumo)', TRUE),
    ('0200', 'Químicos', TRUE),
    ('0300', 'Segregados (materiais com validade vencidas ou materiais segregados)', TRUE),
    ('1000', 'Recebimento Materiais Estoque', TRUE),
    -- Depósitos com status "Exclusão" no SAP.
    ('0030', 'Dep. Refeitório', FALSE),
    ('0070', 'EPI´S', FALSE),
    ('0080', 'CAP Acabados', FALSE),
    ('0100', 'Serviços Gerais', FALSE),
    ('0110', 'Mat.Proj.GE101', FALSE),
    ('0120', 'Mat.Proj.GE302', FALSE),
    ('0126', 'Mat.Proj.GE126', FALSE),
    ('0201', 'Mat. Elaboração', FALSE),
    ('0202', 'MAT.Elab.Vestas', FALSE),
    ('0203', 'MAT.Elab.Gamesa', FALSE),
    ('0210', 'Ferramentaria', FALSE)
ON CONFLICT (deposito) DO UPDATE SET
    descricao = EXCLUDED.descricao,
    ativo = EXCLUDED.ativo,
    updated_at = NOW();
