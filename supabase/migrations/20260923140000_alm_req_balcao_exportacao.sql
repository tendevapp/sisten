-- =====================================================================
-- Requisição no Balcão — exportação da planilha de baixa para o SAP.
--
-- Mesmo processo do Abrir RM: o almoxarife seleciona requisições salvas,
-- baixa a planilha (uma linha por item) e o lote fica registrado.
-- `alm_req_balcao.exportacao_id` aponta para o lote vigente — é o que
-- responde ao filtro "Não exportadas". "Reabrir" zera o vínculo e devolve a
-- requisição à fila; o lote continua no histórico.
--
-- Requisição exportada não se edita: a planilha já saiu com aqueles itens.
-- Para corrigir, reabre, edita e exporta de novo.
--
-- De carona: o depósito 0105 passa a se chamar só "Transferência Produção"
-- (espelho de DEPOSITO_DESCRICAO em src/lib/almoxarifado.ts).
-- =====================================================================

update public.deposito_estoque
   set descricao = 'Transferência Produção', updated_at = now()
 where deposito = '0105';

create table if not exists public.alm_req_balcao_exportacoes (
  id uuid primary key default gen_random_uuid(),
  arquivo text not null,
  exportado_por_id uuid,
  exportado_por_nome text,
  total_requisicoes int not null default 0,
  total_itens int not null default 0,
  -- Códigos RQB do lote, para o histórico não depender do vínculo vigente
  -- (que some quando a requisição é reaberta).
  codigos text[] not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.alm_req_balcao
  add column if not exists exportacao_id uuid references public.alm_req_balcao_exportacoes(id) on delete set null;
create index if not exists idx_alm_req_balcao_exportacao on public.alm_req_balcao (exportacao_id);

alter table public.alm_req_balcao_exportacoes enable row level security;
drop policy if exists alm_req_balcao_exportacoes_sel on public.alm_req_balcao_exportacoes;
create policy alm_req_balcao_exportacoes_sel on public.alm_req_balcao_exportacoes
  for select to authenticated using (true);
revoke insert, update, delete on public.alm_req_balcao_exportacoes from anon, authenticated;
revoke all on public.alm_req_balcao_exportacoes from anon;

-- Registra o lote e vincula as requisições. Chamado depois que o navegador
-- gerou o arquivo.
create or replace function public.alm_req_balcao_registrar_exportacao(p_ids uuid[], p_arquivo text, p_por text)
returns public.alm_req_balcao_exportacoes
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_lote public.alm_req_balcao_exportacoes;
begin
  if auth.uid() is null then
    raise exception 'Sessão expirada. Entre novamente.';
  end if;
  if coalesce(array_length(p_ids, 1), 0) = 0 then
    raise exception 'Selecione ao menos uma requisição.';
  end if;

  insert into public.alm_req_balcao_exportacoes
    (arquivo, exportado_por_id, exportado_por_nome, total_requisicoes, total_itens, codigos)
  select p_arquivo, auth.uid(), p_por, count(*),
         (select count(*) from public.alm_req_balcao_itens i where i.requisicao_id = any(p_ids)),
         array_agg(r.codigo order by r.codigo)
    from public.alm_req_balcao r
   where r.id = any(p_ids) and not r.excluido
  returning * into v_lote;

  update public.alm_req_balcao set exportacao_id = v_lote.id
   where id = any(p_ids) and not excluido;

  return v_lote;
end;
$$;

-- Devolve requisições à fila de exportação (lote inteiro ou avulsas).
create or replace function public.alm_req_balcao_reabrir_exportacao(p_ids uuid[])
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_n int;
begin
  if auth.uid() is null then
    raise exception 'Sessão expirada. Entre novamente.';
  end if;
  update public.alm_req_balcao set exportacao_id = null
   where id = any(p_ids) and exportacao_id is not null;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke all on function public.alm_req_balcao_registrar_exportacao(uuid[], text, text) from public, anon;
revoke all on function public.alm_req_balcao_reabrir_exportacao(uuid[]) from public, anon;
grant execute on function public.alm_req_balcao_registrar_exportacao(uuid[], text, text) to authenticated;
grant execute on function public.alm_req_balcao_reabrir_exportacao(uuid[]) to authenticated;

-- Editar/excluir requisição já exportada: bloqueado.
create or replace function public.alm_req_balcao_bloquear_exportada()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.exportacao_id is not null and new.exportacao_id is not distinct from old.exportacao_id
     and (new.excluido is distinct from old.excluido
          or new.updated_at is distinct from old.updated_at) then
    raise exception 'A requisição % já foi exportada. Reabra a exportação para alterá-la.', old.codigo;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_alm_req_balcao_bloquear_exportada on public.alm_req_balcao;
create trigger trg_alm_req_balcao_bloquear_exportada
  before update on public.alm_req_balcao
  for each row execute function public.alm_req_balcao_bloquear_exportada();
