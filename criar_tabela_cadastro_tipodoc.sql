-- Criação da tabela cadastro_tipodoc
CREATE TABLE IF NOT EXISTS public.cadastro_tipodoc (
    codigo TEXT PRIMARY KEY,
    tipo_documento TEXT NOT NULL,
    categoria_modulo TEXT,
    descricao_operacional TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ativar RLS
ALTER TABLE public.cadastro_tipodoc ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS
DROP POLICY IF EXISTS "cadastro_tipodoc_read" ON public.cadastro_tipodoc;
CREATE POLICY "cadastro_tipodoc_read" ON public.cadastro_tipodoc
    FOR SELECT TO authenticated, anon
    USING (true);

-- Inserção dos dados cadastrais
INSERT INTO public.cadastro_tipodoc (codigo, tipo_documento, categoria_modulo, descricao_operacional)
VALUES
    ('KR', 'Fatura de Fornecedor', 'Fornecedores (FI-AP)', 'Lançamento manual direto na contabilidade, sem pedido de compras.'),
    ('RE', 'Fatura de Logística', 'Fornecedores (MM-MIRO)', 'Fatura gerada a partir do recebimento de NF vinculada a Pedido de Compra.'),
    ('KZ', 'Pagamento a Fornecedor', 'Fornecedores (FI-AP)', 'Baixa de título manual ou pagamento automático (F110).'),
    ('KG', 'Nota de Crédito de Fornecedor', 'Fornecedores (FI-AP)', 'Descontos, abatimentos ou créditos enviados pelo fornecedor.'),
    ('KA', 'Documento de Fornecedor', 'Fornecedores (FI-AP)', 'Lançamentos gerais, adiantamentos e acertos de contas de fornecedor.'),
    ('KS', 'Estorno de Fornecedor', 'Fornecedores (FI-AP)', 'Gerado automaticamente ao estornar um documento de fornecedor.'),
    ('KN', 'Fornecedores Líquido', 'Fornecedores (FI-AP)', 'Lançamento de faturas considerando o desconto por pronto pagamento.'),
    ('KP', 'Manutenção de Conta', 'Fornecedores (FI-AP)', 'Ajustes internos na conta corrente do fornecedor.'),
    ('DR', 'Fatura de Cliente', 'Clientes (FI-AR)', 'Lançamento manual de faturamento direto em finanças.'),
    ('RV', 'Fatura de Vendas', 'Clientes (SD-BIL)', 'Faturamento logístico integrado ao módulo de Vendas e Distribuição.'),
    ('DZ', 'Pagamento de Cliente', 'Clientes (FI-AR)', 'Recebimento de valores e baixa de títulos de clientes.'),
    ('DG', 'Nota de Crédito de Cliente', 'Clientes (FI-AR)', 'Devoluções ou créditos concedidos ao comprador.'),
    ('DA', 'Documento de Cliente', 'Clientes (FI-AR)', 'Lançamentos gerais, adiantamentos e acertos de contas de clientes.'),
    ('DS', 'Estorno de Cliente', 'Clientes (FI-AR)', 'Gerado automaticamente ao estornar um documento de cliente.'),
    ('SA', 'Documento do Razão', 'Geral (FI-GL)', 'Lançamentos contábeis manuais gerais de partidas dobradas (FB50).'),
    ('AB', 'Documento de Compensação', 'Geral (FI)', 'Gerado pelo sistema ao limpar/vincular faturas a pagamentos.'),
    ('SB', 'Lançamento de Provisão', 'Geral (FI-GL)', 'Lançamentos manuais ou automáticos de apropriação mensal.'),
    ('SK', 'Livro de Caixa', 'Geral (FI-BL)', 'Movimentações manuais de dinheiro em espécie (caixa interno).'),
    ('SU', 'Documento de Ajuste', 'Geral (FI)', 'Reclassificações e correções contábeis gerais.'),
    ('UE', 'Transferência de Dados', 'Geral (FI)', 'Carga inicial de saldos durante a implantação do sistema.'),
    ('ZP', 'Lançamento de Pagamento', 'Geral (FI-AP/AR)', 'Lançamento automático de pagamento gerado por rotinas de banco.'),
    ('ZR', 'Conciliação Bancária', 'Geral (FI-BL)', 'Documento gerado no processamento do extrato bancário.'),
    ('ZS', 'Pagamento por Cheque', 'Geral (FI-BL)', 'Emissão e registro de cheques para pagamento.'),
    ('WE', 'Entrada de Mercadorias', 'Estoque (MM-IM)', 'Gerado automaticamente na MIGO ao receber materiais no estoque.'),
    ('WA', 'Saída de Mercadorias', 'Estoque (MM-IM)', 'Baixa de estoque para consumo, ordens de produção ou perdas.'),
    ('WI', 'Inventário Físico', 'Estoque (MM-IM)', 'Ajustes automáticos de ganho ou perda após contagem de estoque.'),
    ('WL', 'Saída para Entrega', 'Estoque (MM/SD)', 'Saída física do estoque associada a uma entrega de vendas.'),
    ('WN', 'Entrada Líquida', 'Estoque (MM-IM)', 'Entrada de mercadorias com cálculo de valor líquido.'),
    ('PR', 'Alteração de Preço', 'Estoque (MM-VAL)', 'Reavaliação de custo ou alteração no cadastro de preço do material.'),
    ('AA', 'Lançamento de Ativo', 'Imobilizado (FI-AA)', 'Aquisição, baixa ou transferência manual de um bem patrimonial.'),
    ('AF', 'Lançamento de Depreciação', 'Imobilizado (FI-AA)', 'Execução mensal automática de depreciação acumulada (AFAB).'),
    ('AI', 'Amortização Extraordinária', 'Imobilizado (FI-AA)', 'Baixas por desvalorização (Impairment) ou ajustes especiais de ativos.'),
    ('ML', 'Ledger de Materiais', 'Controladoria (CO-PC)', 'Liquidação periódica e fechamento do custo real de materiais.'),
    ('P1', 'Cartão de Compras', 'Compras (MM)', 'Lançamento de despesas via cartão corporativo da empresa.'),
    ('P3', 'Folha de Pagamento', 'Recursos Humanos (HCM)', 'Integração contábil automática dos custos e provisões de pessoal.')
ON CONFLICT (codigo) DO UPDATE SET
    tipo_documento = EXCLUDED.tipo_documento,
    categoria_modulo = EXCLUDED.categoria_modulo,
    descricao_operacional = EXCLUDED.descricao_operacional,
    updated_at = NOW();
