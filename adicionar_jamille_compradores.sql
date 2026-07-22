-- Adiciona a compradora Jamille (Grupo de Compras 602) na tabela compradores.
INSERT INTO public.compradores (grupo_compras, nome_comprador)
VALUES ('602', 'Jamille')
ON CONFLICT (grupo_compras) 
DO UPDATE SET nome_comprador = EXCLUDED.nome_comprador;
