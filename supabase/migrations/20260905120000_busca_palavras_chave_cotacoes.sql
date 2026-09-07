-- =====================================================================
-- Busca por palavras-chave no Histórico de Cotações
--
-- A busca era um `ilike` de trecho contíguo sobre cada campo. Quem procurava
-- "cabo flexivel 2,5" não achava "CABO PP 2,5MM FLEXÍVEL 750V": as palavras
-- estão lá, na ordem errada e com acento. Fornecedor descreve o mesmo produto
-- de dez jeitos, então exigir a frase inteira, na ordem, com acento, é exigir
-- que o comprador adivinhe a redação da proposta.
--
-- `busca_norm` junta os campos que identificam o item — descrição, marca,
-- código do fornecedor, material SAP e NCM — já sem acento, sem pontuação e
-- em caixa alta (mesma normalização do casamento de vínculos,
-- `f_norm_cotacao`). A tela quebra o que foi digitado em palavras e exige
-- todas nesta coluna, em qualquer ordem.
--
-- Coluna gerada: acompanha sozinha a edição da proposta e o `material_code`
-- que o casamento de vínculos grava depois, sem trigger para manter.
-- =====================================================================

alter table public.sup_cotacao_proposta_itens
  add column if not exists busca_norm text
  generated always as (
    public.f_norm_cotacao(
      coalesce(descricao_produto, '') || ' ' ||
      coalesce(marca_fabricante, '') || ' ' ||
      coalesce(codigo_produto, '') || ' ' ||
      coalesce(material_code, '') || ' ' ||
      coalesce(ncm, '') || ' ' ||
      coalesce(unidade_medida, '')
    )
  ) stored;

-- Trigrama: cada palavra é procurada como `%PALAVRA%`, e é o índice que
-- impede que isso vire varredura da tabela inteira a cada tecla digitada.
create index if not exists idx_cot_proposta_itens_busca_trgm
  on public.sup_cotacao_proposta_itens using gin (busca_norm gin_trgm_ops);

-- Mesmo raciocínio do lado da proposta, onde se busca por fornecedor,
-- número, vendedor ou nome do arquivo.
alter table public.sup_cotacao_propostas
  add column if not exists busca_norm text
  generated always as (
    public.f_norm_cotacao(
      coalesce(fornecedor_razao_social, '') || ' ' ||
      coalesce(fornecedor_cnpj, '') || ' ' ||
      coalesce(numero_proposta, '') || ' ' ||
      coalesce(vendedor_nome, '') || ' ' ||
      coalesce(arquivo_origem, '') || ' ' ||
      coalesce(fornecedor_cidade, '') || ' ' ||
      coalesce(fornecedor_uf, '')
    )
  ) stored;

create index if not exists idx_cot_propostas_busca_trgm
  on public.sup_cotacao_propostas using gin (busca_norm gin_trgm_ops);
