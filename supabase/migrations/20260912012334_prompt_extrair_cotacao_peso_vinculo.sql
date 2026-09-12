-- O prompt editável de extração passa a declarar os três campos novos do item
-- (peso estimado, RI sugerido e divergências do vínculo).
--
-- A Edge Function já anexa essas instruções ao conteúdo enviado à IA, então
-- a extração funciona mesmo com o prompt antigo — isto aqui é para o admin
-- que abre Gestão de APIs & IA ver o formato completo e não apagar os campos
-- sem saber ao editar o resto.

update public.ops_ia_prompts
   set prompt = replace(
         prompt,
         '"Aliquota_COFINS_Pct":null,"Aliquota_IPI_pct":null',
         '"Aliquota_COFINS_Pct":null,"Aliquota_IPI_pct":null,
    "Peso_Unitario_Kg":null,"Vinculo_RI":null,"Vinculo_Divergencias":null'
       ),
       versao = versao + 1
 where chave = 'extrair-cotacao'
   and prompt like '%"Aliquota_COFINS_Pct":null,"Aliquota_IPI_pct":null%'
   and prompt not like '%Peso_Unitario_Kg%';
