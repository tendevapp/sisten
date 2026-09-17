-- =====================================================================
-- Revisao do de-para usando classificacao_nivel1/nivel2 do
-- cadastro_grupo_mercadoria.
--
-- Decisoes confirmadas com o usuario:
-- - Copa e Limpeza -> Alimentacao (mistura itens de copa/refeitorio com
--   limpeza; tratado como alimentacao).
-- - Estruturas Metalicas, Equipamentos de Processo, Ferramentas, Eletrica e
--   Instrumentacao, Quimicos e Gases, Tubulacao e Conexoes, Materiais de
--   Construcao: NAO mapeados - sao custo direto de material de fabricacao
--   (aco/estrutura das torres), fora do escopo deste relatorio de despesas
--   de apoio operacional. Ficam como "Sem rubrica" propositalmente.
--
-- Adicionais de baixo risco identificados na mesma analise:
-- - Manutencao e Assistencia Tecnica -> Despesas Manutencao.
-- - Ensaios e Controle Tecnologico -> Consultoria Qualidade.
-- =====================================================================

insert into public.fin_rubrica_mapeamentos (rubrica_id, tipo_chave, chave_valor, chave_descricao)
select r.id, 'grupo_mercadoria', g.codigo, g.denominacao
from public.cadastro_grupo_mercadoria g
join (values
  ('Copa e Limpeza', 'alimentacao'),
  ('Manutenção e Assistência Técnica', 'despesas_manutencao'),
  ('Ensaios e Controle Tecnológico', 'consultoria_qualidade')
) as vinculo(nivel2, rubrica_codigo) on vinculo.nivel2 = g.classificacao_nivel2
join public.fin_rubricas r on r.codigo = vinculo.rubrica_codigo
on conflict (tipo_chave, chave_valor) do nothing;
