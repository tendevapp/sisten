-- "Servicos de transporte municipal" (codigo de servico 3000265) e prestado
-- so pela Transportadora e Locadora de Veiculos MCR (1000009931), que a
-- planilha do Financeiro identifica como "LOCACAO VEIC. Guimaraes" - transporte
-- de pessoal. Sai de Frete (herdado do grupo de mercadoria) para Transporte.
insert into public.fin_rubrica_mapeamentos (rubrica_id, tipo_chave, chave_valor, chave_descricao)
select r.id, 'servico', '3000265', 'SERVICOS DE TRANSPORTE MUNICIPAL (MCR / Guimaraes)'
from public.fin_rubricas r
where r.codigo = 'transporte'
on conflict (tipo_chave, chave_valor) do update set rubrica_id = excluded.rubrica_id, ativo = true;
