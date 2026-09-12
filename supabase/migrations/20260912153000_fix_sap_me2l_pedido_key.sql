-- Correção: "Nº acompanhamento" da ME2L não é chave de linha.
-- Data: 2026-09-12
--
-- No relatório real, "Nº acompanhamento" vem em branco na grande maioria das
-- linhas e só aparece preenchido (com o texto "ADMIN", não um número) numa
-- fração pequena. A primeira versão da tabela assumiu por engano que era um
-- identificador único por linha (NOT NULL + UNIQUE), o que colapsou ~1940
-- linhas de uma importação real em 1 e gerou erro 500 do Postgres
-- ("ON CONFLICT DO UPDATE command cannot affect row a second time") quando
-- várias linhas com a mesma chave apareciam no mesmo lote de upsert.
--
-- A importação (localDb.importME2LRaw) passou a ser por substituição total
-- (delete + insert do arquivo inteiro), então a coluna também não precisa
-- mais de restrição de unicidade.

ALTER TABLE public.sap_me2l_pedido DROP CONSTRAINT IF EXISTS sap_me2l_pedido_n_acompanhamento_key;
ALTER TABLE public.sap_me2l_pedido ALTER COLUMN n_acompanhamento DROP NOT NULL;
