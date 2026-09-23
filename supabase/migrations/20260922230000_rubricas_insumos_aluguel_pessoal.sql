-- =====================================================================
-- Decisoes de classificacao do Realizado por Rubrica (22/09/2026), apos a
-- analise por NF (ver 20260922220000 e 20260922221000):
--
-- 1. Consumiveis de fabrica sem rubrica (uso e consumo) -> Insumos.
--    Itens de obra civil do mesmo lote (piso, cimento, esquadria, jardim,
--    luminaria) -> Manutencao Predial.
--    Ficam de fora de proposito:
--    - grupos que tambem aparecem como MATERIAL DE PRODUCAO (x101) - mapear
--      por grupo levaria custo direto para Insumos: M08008001 gases
--      industriais, M08018002 vergalhao, M08018008 parafuso/porca,
--      M08018005 cerca/tela;
--    - moveis e eletrodomesticos (M05001*), que nao sao insumo.
-- 2. Nova rubrica "Aluguel de Imoveis e Hospedagem".
-- 3. Nova rubrica "Custo de Pessoal (Beneficios)"; vale-alimentacao sai de
--    Alimentacao e vai para ela.
-- =====================================================================

-- 2 e 3. Novas rubricas de nivel 1
insert into public.fin_rubricas (codigo, nome, ordem) values
  ('aluguel_imoveis_hospedagem', 'Aluguel de Imóveis e Hospedagem', 135),
  ('custo_pessoal', 'Custo de Pessoal (Benefícios)', 195)
on conflict (codigo) do nothing;

-- 1. Consumiveis de fabrica -> Insumos; obra civil -> Manutencao Predial
insert into public.fin_rubrica_mapeamentos (rubrica_id, tipo_chave, chave_valor, chave_descricao)
select r.id, 'grupo_mercadoria', v.grupo, coalesce(g.denominacao, v.grupo)
from (values
  -- Insumos: ferramentas
  ('M14001002', 'insumos'), ('M14001003', 'insumos'), ('M14001004', 'insumos'), ('M14001005', 'insumos'),
  ('M14001006', 'insumos'), ('M14001007', 'insumos'), ('M14001008', 'insumos'),
  -- Insumos: maquinas, equipamentos de processo e movimentacao de carga
  ('E01005001', 'insumos'), ('E01005006', 'insumos'), ('M14002002', 'insumos'), ('M14002005', 'insumos'),
  ('M14002009', 'insumos'), ('M03001001', 'insumos'), ('M03001003', 'insumos'), ('M03001020', 'insumos'),
  ('M03002002', 'insumos'),
  -- Insumos: quimicos
  ('M10001002', 'insumos'), ('M10001005', 'insumos'), ('M10002003', 'insumos'), ('M10003001', 'insumos'),
  ('M10003002', 'insumos'),
  -- Insumos: eletrica e instrumentacao
  ('M02001007', 'insumos'), ('M02001012', 'insumos'), ('M02002002', 'insumos'), ('M02002004', 'insumos'),
  ('M02002012', 'insumos'), ('M02003003', 'insumos'), ('M12001003', 'insumos'), ('M12001010', 'insumos'),
  ('B4204', 'insumos'), ('B4401', 'insumos'),
  -- Insumos: tubulacao e conexoes
  ('M07001001', 'insumos'), ('M07001006', 'insumos'), ('M07001008', 'insumos'), ('M07001009', 'insumos'),
  ('M07002005', 'insumos'), ('M07002010', 'insumos'), ('M07002018', 'insumos'), ('M07003003', 'insumos'),
  ('M07003005', 'insumos'), ('M07003011', 'insumos'),
  -- Insumos: consumiveis metalicos, plasticos, embalagem e sinalizacao
  ('M08018001', 'insumos'), ('M08018006', 'insumos'), ('M08018007', 'insumos'), ('M08018010', 'insumos'),
  ('M08016002', 'insumos'), ('M08016003', 'insumos'), ('M08012003', 'insumos'), ('M08011001', 'insumos'),
  ('M08011004', 'insumos'), ('M08015001', 'insumos'), ('M08007002', 'insumos'), ('M05002004', 'insumos'),
  ('B6902', 'insumos'), ('B6904', 'insumos'),
  -- Manutencao Predial: obra civil, jardinagem e iluminacao
  ('M08010002', 'manutencao_predial'), ('M08010004', 'manutencao_predial'), ('M08010006', 'manutencao_predial'),
  ('M08001003', 'manutencao_predial'), ('M08001005', 'manutencao_predial'), ('M08014001', 'manutencao_predial'),
  ('M09001001', 'manutencao_predial'), ('M09001004', 'manutencao_predial'), ('M02003015', 'manutencao_predial')
) as v(grupo, rubrica_codigo)
join public.fin_rubricas r on r.codigo = v.rubrica_codigo
left join public.cadastro_grupo_mercadoria g on g.codigo = v.grupo
on conflict (tipo_chave, chave_valor) do nothing;

-- 2. Aluguel de imoveis e hospedagem: codigos de servico e grupos
insert into public.fin_rubrica_mapeamentos (rubrica_id, tipo_chave, chave_valor, chave_descricao)
select r.id, 'servico', v.codigo, v.descricao
from (values
  ('3000520', 'ALUGUEL DE IMOVEL (MORADIA)'),
  ('3000136', 'HOSPEDAGEM DE QUALQUER NATUREZA')
) as v(codigo, descricao)
join public.fin_rubricas r on r.codigo = 'aluguel_imoveis_hospedagem'
on conflict (tipo_chave, chave_valor) do nothing;

update public.fin_rubrica_mapeamentos m
set rubrica_id = r.id, ativo = true
from public.fin_rubricas r
where r.codigo = 'aluguel_imoveis_hospedagem'
  and m.tipo_chave = 'grupo_mercadoria'
  and m.chave_valor in ('S0026', 'S0022'); -- Aluguer de imoveis; Reserva de quartos

-- 3. Vale-alimentacao -> Custo de Pessoal
update public.fin_rubrica_mapeamentos m
set rubrica_id = r.id
from public.fin_rubricas r
where r.codigo = 'custo_pessoal'
  and m.tipo_chave = 'servico'
  and m.chave_valor = '3000612';
