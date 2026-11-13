-- Livro de Ocorrências da Portaria (FRM.SGP-0010): um livro por PLANTÃO.
--
-- Antes o livro era escolhido só pela data: o primeiro lançamento do dia
-- (geralmente a ronda da madrugada, ainda no plantão noturno) abria o livro
-- "Turno NOITE" e todo o plantão diurno caía nele. Em 13/11 o plantão do
-- Edinei foi encerrado às 05:46 e o diurno abriu às 05:54, mas o livro
-- REL-131126-NOI seguiu recebendo o dia inteiro.
--
-- Agora o livro pertence ao plantão em aberto da Passagem de Plantão
-- (`plantao_id`). Encerrar o plantão encerra o livro dele (trigger), e o
-- próximo lançamento abre o livro do plantão seguinte.

alter table public.port_relatorio_portaria
  add column if not exists plantao_id uuid
  references public.port_passagem_plantao(id) on delete set null;

create index if not exists port_relatorio_portaria_plantao_id_idx
  on public.port_relatorio_portaria (plantao_id);

-- O livro herda o turno do plantão (DIURNO/NOTURNO).
alter table public.port_relatorio_portaria drop constraint if exists port_relatorio_portaria_turno_check;
alter table public.port_relatorio_portaria add constraint port_relatorio_portaria_turno_check
  check (turno = any (array['MANHA','TARDE','NOITE','DIURNO','NOTURNO','TURNO_A','TURNO_B','TURNO_C']));

-- Plantão encerrado fecha o livro dele.
create or replace function public.port_plantao_encerra_livro()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status = 'CONCLUIDO' and old.status is distinct from 'CONCLUIDO' then
    update public.port_relatorio_portaria
       set status = 'CONCLUIDO', updated_at = now()
     where plantao_id = new.id
       and status = 'EM_ANDAMENTO';
  end if;
  return new;
end;
$$;

revoke all on function public.port_plantao_encerra_livro() from public, anon, authenticated;

drop trigger if exists trg_port_plantao_encerra_livro on public.port_passagem_plantao;
create trigger trg_port_plantao_encerra_livro
  after update of status on public.port_passagem_plantao
  for each row execute function public.port_plantao_encerra_livro();

-- Correção de 13/11/2026: separa REL-131126-NOI por plantão.
--  * a ronda das 04:55 (criada antes do encerramento do noturno) fica no
--    REL-131126-NOI, ligado ao plantão noturno do Edinei (PLT-121126-D3DO);
--  * o que foi lançado depois que o diurno abriu (PLT-131126-DIU) vai para o
--    livro novo REL-131126-DIU.
do $$
declare
  v_noturno public.port_passagem_plantao%rowtype;
  v_diurno  public.port_passagem_plantao%rowtype;
  v_livro_noite uuid;
  v_livro_dia uuid;
begin
  select * into v_noturno from public.port_passagem_plantao where numero_protocolo = 'PLT-121126-D3DO';
  select * into v_diurno  from public.port_passagem_plantao where numero_protocolo = 'PLT-131126-DIU';
  select id into v_livro_noite from public.port_relatorio_portaria where numero_protocolo = 'REL-131126-NOI';

  if v_noturno.id is null or v_diurno.id is null or v_livro_noite is null then
    raise notice 'Correção de 13/11 ignorada: plantões ou livro não encontrados.';
    return;
  end if;

  if exists (select 1 from public.port_relatorio_portaria where plantao_id = v_diurno.id) then
    raise notice 'Correção de 13/11 já aplicada.';
    return;
  end if;

  update public.port_relatorio_portaria
     set plantao_id = v_noturno.id,
         horario_inicio = v_noturno.horario_inicio,
         horario_fim = v_noturno.horario_fim,
         status = case when v_noturno.status = 'CONCLUIDO' then 'CONCLUIDO' else status end,
         updated_at = now()
   where id = v_livro_noite;

  insert into public.port_relatorio_portaria (
    codigo_formulario, numero_protocolo, data, turno, horario_inicio, horario_fim,
    vigilante_principal, vigilante_ronda01, vigilante_ronda02, status, criado_por, plantao_id
  ) values (
    'FRM.SGP-0010', 'REL-131126-DIU', v_diurno.data, 'DIURNO', v_diurno.horario_inicio, v_diurno.horario_fim,
    coalesce(v_diurno.vigilante_portaria, ''), v_diurno.vigilante_ronda01, v_diurno.vigilante_ronda02,
    case when v_diurno.status = 'CONCLUIDO' then 'CONCLUIDO' else 'EM_ANDAMENTO' end,
    v_diurno.criado_por, v_diurno.id
  ) returning id into v_livro_dia;

  update public.port_relatorio_ocorrencias
     set relatorio_id = v_livro_dia
   where relatorio_id = v_livro_noite
     and created_at >= coalesce(v_noturno.encerrado_em, v_diurno.created_at);
end;
$$;
