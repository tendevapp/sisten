-- Remove o comprador Wellington / Grupo de Compras 588 da tabela de compradores e desativa o papel de comprador no perfil.
DELETE FROM public.compradores WHERE grupo_compras = '588' OR nome_comprador ILIKE '%wellington%';
DELETE FROM public.buyer_groups WHERE group_code = '588';
UPDATE public.profiles SET roles = ARRAY['visualizador']::text[], grupo_compras = NULL WHERE email = 'wellington.neto@ten.ind.br';
