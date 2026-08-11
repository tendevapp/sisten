-- Adiciona a compradora Giulia (Grupo de Compras 610) na tabela compradores.
INSERT INTO public.compradores (grupo_compras, nome_comprador)
VALUES ('610', 'Giulia')
ON CONFLICT (grupo_compras) 
DO UPDATE SET nome_comprador = EXCLUDED.nome_comprador;
