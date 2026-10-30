-- Teste de alcoolemia: código ALC-DDMMYY-NN único.
--
-- O código é calculado no cliente (gerarProximoCodigoAlcoolemia) sobre os
-- códigos do dia. Sem rede, essa leitura sai da cópia guardada no aparelho e
-- a gravação vai para a fila: em 30/10 um teste aberto às 06:59 sem rede
-- recebeu ALC-301026-01, que já era do teste das 06:57, e subiu às 07:19
-- repetido — a tabela não tinha unique.
--
-- Com o unique, a fila offline recebe 23505 e regenera o código (regra em
-- configFormularios.ts) e a gravação online tenta o próximo índice
-- (criarTesteAlcoolemia).
--
-- Repetidos: o mais antigo de cada código fica (no caso de 30/10, o das 06:57,
-- com termo impresso e assinado); os mais novos ganham o próximo índice do
-- mesmo dia (o das 06:59 estava aguardando teste, termo nunca impresso).
do $$
declare
  r record;
  v_base text;
  v_prox int;
begin
  for r in
    select id, codigo_formulario
      from (select id, codigo_formulario,
                   row_number() over (partition by codigo_formulario order by created_at, id) as n
              from public.port_alcoolemia_testes) x
     where n > 1
     order by codigo_formulario
  loop
    v_base := regexp_replace(r.codigo_formulario, '-\d+$', '');
    select coalesce(max(substring(codigo_formulario from '-(\d+)$')::int), 0) + 1 into v_prox
      from public.port_alcoolemia_testes
     where codigo_formulario like v_base || '-%';
    update public.port_alcoolemia_testes
       set codigo_formulario = v_base || '-' || lpad(v_prox::text, 2, '0'), updated_at = now()
     where id = r.id;
  end loop;
end $$;

-- Inclui excluídos: o gerador conta os códigos excluídos e nunca os reaproveita.
create unique index if not exists port_alcoolemia_testes_codigo_formulario_key
  on public.port_alcoolemia_testes (codigo_formulario);

drop index if exists public.idx_port_alcoolemia_codigo;
