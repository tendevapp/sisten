-- Relatório de Ocorrências: o lançamento "Saída de Colaborador" virou
-- "Colaborador" com Entrada ou Saída. A Saída continua SAIDA_COLABORADOR
-- (aguarda retorno); a Entrada é um tipo novo, sem saída a registrar
-- (status_permanencia NAO_APLICA), e aceita entrega de material — o trigger
-- trg_port_ocorrencia_ficha_cega não filtra por tipo, então a ficha cega do
-- almoxarifado abre igual aos outros tipos.

alter table public.port_relatorio_ocorrencias
  drop constraint if exists port_relatorio_ocorrencias_tipo_registro_check;
alter table public.port_relatorio_ocorrencias
  add constraint port_relatorio_ocorrencias_tipo_registro_check
  check (tipo_registro in (
    'ENTRADA_VEICULO', 'VEICULO_LEVE', 'ENTRADA_VISITANTE',
    'SAIDA_COLABORADOR', 'ENTRADA_COLABORADOR',
    'RONDA_PATRIMONIAL', 'OCORRENCIA_GERAL', 'OUTRO_REGISTRO'
  ));
