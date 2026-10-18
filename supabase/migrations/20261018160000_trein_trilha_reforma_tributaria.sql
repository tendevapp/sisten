-- =====================================================================
-- Treinamentos › Contab / Fin — trilha "Reforma Tributária"
-- =====================================================================
-- Comparar NF e Comparar cotação ao longo da transição 2026–2033, adaptados
-- do TEN-Jornada-Tributaria.html (gerador em
-- scripts/gerar-trilha-reforma-tributaria.py). Duas etapas = duas missões.
--
-- A área "Contab / Fin" é só agrupamento de tela (Contabilidade, Controladoria
-- e Financeiro); a trilha fica gravada no setor Contabilidade (7).

insert into public.trein_trilhas (
  setor_id, codigo, titulo, descricao, revisao,
  total_missoes, duracao_min, arquivo_origem, arquivo_path, ordem
) values (
  '7',
  'LC 214/2025',
  'Reforma Tributária',
  'A mesma NF e o mesmo mapa de cotação comparados ano a ano, de hoje a 2033: ICMS, PIS/Cofins, CBS e IBS, créditos, preço líquido e decisão de compra. Casos fictícios, com fontes oficiais e a apostila da Jornada Tributária.',
  'Out/2026',
  2,
  40,
  'app',
  'treinamentos/trilha-reforma-tributaria.html',
  1
)
on conflict (setor_id, codigo) do nothing;
