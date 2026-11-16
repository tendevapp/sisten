-- Chegada de Transporte (FRM.SGP-0009): documento do motorista — CNH ou CPF.
-- Opcional. Quando o vigilante marca "Fará teste de bafômetro?", o documento
-- vai junto para o teste pendente no livro de alcoolemia (port_alcoolemia_testes.documento),
-- e na tela do teste só falta registrar o resultado.

alter table public.port_registro_transportes
  add column if not exists motorista_doc_tipo text,
  add column if not exists motorista_documento text;

alter table public.port_registro_transportes
  drop constraint if exists port_registro_transportes_motorista_doc_tipo_check;
alter table public.port_registro_transportes
  add constraint port_registro_transportes_motorista_doc_tipo_check
  check (motorista_doc_tipo is null or motorista_doc_tipo in ('CNH', 'CPF'));

comment on column public.port_registro_transportes.motorista_doc_tipo is 'Tipo do documento do motorista: CNH ou CPF.';
comment on column public.port_registro_transportes.motorista_documento is 'Número do documento do motorista (CPF com máscara 000.000.000-00; CNH só dígitos).';
