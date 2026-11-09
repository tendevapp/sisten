-- Passagem de Plantão: quem encerrou, quando e com que observação.
--
-- Antes, encerrar só trocava o status e GRAVAVA A OBSERVAÇÃO DE ENCERRAMENTO
-- POR CIMA de `observacoes` — o que a equipe tinha anotado no turno se perdia.
-- Agora a nota de encerramento tem coluna própria e o encerramento guarda o
-- autor e a hora. `passado_para_id` liga o plantão encerrado ao que o recebeu,
-- quando o encerramento acontece ao abrir o plantão seguinte.

alter table public.port_passagem_plantao
  add column if not exists encerrado_em timestamptz,
  add column if not exists encerrado_por text,
  add column if not exists observacoes_encerramento text,
  add column if not exists passado_para_id uuid references public.port_passagem_plantao(id) on delete set null;

comment on column public.port_passagem_plantao.encerrado_em is 'Quando o plantão foi encerrado.';
comment on column public.port_passagem_plantao.encerrado_por is 'Nome de quem encerrou.';
comment on column public.port_passagem_plantao.observacoes_encerramento is 'Nota do encerramento (não sobrescreve as observações do turno).';
comment on column public.port_passagem_plantao.passado_para_id is 'Plantão seguinte que recebeu este, quando encerrado na abertura do próximo.';
