-- Pendência de Processamento (lançamentos SAP): o comprador responsável sai do
-- PO, não da coluna COMPRADOR digitada na planilha.
--
-- Regra única com as Pendências de Recebimento (`sup_receb_comprador_do_po`):
-- quem criou o PO na ZL0132 (`criado_por_pedido` → sup_compradores.usuario_sistema,
-- ativo) → grupo de compras → perfil do comprador; na falta, o grupo da RC.
-- PO não encontrado na ZL0132 (ex.: "SN") mantém o nome da planilha.
--
-- A partir de agora cada documento é um chamado próprio (NewRequest); o gatilho
-- também vincula o chamado (`core_solicitacoes.comprador_id`) ao comprador.

alter table public.sup_pend_processamento_nf
  add column if not exists comprador_id text,
  add column if not exists comprador_grupo text,
  add column if not exists comprador_planilha text;

comment on column public.sup_pend_processamento_nf.comprador_id is
  'Perfil do comprador que colocou o PO (documento_compras), por sup_receb_comprador_do_po. Null = PO não encontrado na ZL0132.';
comment on column public.sup_pend_processamento_nf.comprador_planilha is
  'Comprador como veio digitado na planilha colada (auditoria; `comprador` passa a ser o do PO).';

-- 1. Gatilho: resolve o comprador do PO na gravação.
create or replace function public.sup_pend_proc_nf_comprador_do_po()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_grupo text;
  v_cid uuid;
  v_cnome text;
begin
  if new.modelo is distinct from 'documento' then return new; end if;
  if tg_op = 'INSERT' then
    new.comprador_planilha := coalesce(new.comprador_planilha, nullif(btrim(new.comprador), ''));
  elsif new.documento_compras is not distinct from old.documento_compras then
    return new;
  end if;

  begin
    select * into v_grupo, v_cid, v_cnome
      from public.sup_receb_comprador_do_po(btrim(coalesce(new.documento_compras, '')));
  exception when others then
    return new; -- o chamado não depende disto
  end;

  new.comprador_grupo := v_grupo;
  new.comprador_id := v_cid::text;
  if v_cnome is not null then
    new.comprador := v_cnome;
  elsif tg_op = 'UPDATE' then
    new.comprador := coalesce(new.comprador, new.comprador_planilha);
  end if;
  return new;
end;
$$;

revoke all on function public.sup_pend_proc_nf_comprador_do_po() from public, anon, authenticated;

drop trigger if exists trg_sup_pend_proc_nf_comprador_do_po on public.sup_pend_processamento_nf;
create trigger trg_sup_pend_proc_nf_comprador_do_po
  before insert or update of documento_compras on public.sup_pend_processamento_nf
  for each row execute function public.sup_pend_proc_nf_comprador_do_po();

-- 2. Vincula o chamado ao comprador. Chamado antigo com documentos de mais de
--    um comprador fica sem vínculo (o chamado novo tem um documento só).
create or replace function public.sup_pend_proc_nf_vincular_chamado()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.comprador_id is not null then
    begin
      update public.core_solicitacoes
         set comprador_id = new.comprador_id
       where id = new.request_id and comprador_id is null
         and not exists (
           select 1 from public.sup_pend_processamento_nf o
            where o.request_id = new.request_id and o.id <> new.id
              and o.comprador_id is not null and o.comprador_id <> new.comprador_id
         );
    exception when others then
      null;
    end;
  end if;
  return null;
end;
$$;

revoke all on function public.sup_pend_proc_nf_vincular_chamado() from public, anon, authenticated;

drop trigger if exists trg_sup_pend_proc_nf_vincular_chamado on public.sup_pend_processamento_nf;
create trigger trg_sup_pend_proc_nf_vincular_chamado
  after insert or update of comprador_id on public.sup_pend_processamento_nf
  for each row execute function public.sup_pend_proc_nf_vincular_chamado();

-- 3. Prévia no formulário: comprador de cada PO colado.
create or replace function public.sup_pend_compradores_dos_pos(p_pos text[])
returns table (po text, grupo text, comprador_id text, comprador_nome text)
language sql stable security definer set search_path = public, pg_temp as $$
  select x.po, b.grupo, b.comprador_id::text, b.comprador_nome
    from (select distinct btrim(u) as po from unnest(coalesce(p_pos, '{}'::text[])) u
           where nullif(btrim(u), '') is not null) x
   cross join lateral public.sup_receb_comprador_do_po(x.po) b
   where b.grupo is not null
$$;

revoke all on function public.sup_pend_compradores_dos_pos(text[]) from public, anon;
grant execute on function public.sup_pend_compradores_dos_pos(text[]) to authenticated;

-- 4. Retroativo: notas de lançamento já gravadas.
update public.sup_pend_processamento_nf n
   set comprador_planilha = coalesce(n.comprador_planilha, nullif(btrim(n.comprador), '')),
       comprador_grupo = b.grupo,
       comprador_id = b.comprador_id::text,
       comprador = coalesce(b.comprador_nome, n.comprador)
  from (select id, (public.sup_receb_comprador_do_po(btrim(coalesce(documento_compras, '')))).*
          from public.sup_pend_processamento_nf where modelo = 'documento') b
 where b.id = n.id and n.modelo = 'documento';

-- O retroativo passa linha a linha pelo gatilho do passo 2: chamado antigo com
-- documentos de mais de um comprador pode ter pegado o primeiro. Desfaz (até
-- aqui nenhum chamado de pendência tinha comprador_id).
update public.core_solicitacoes s
   set comprador_id = null
 where s.type = 'chamado'
   and s.comprador_id is not null
   and s.id in (
     select request_id from public.sup_pend_processamento_nf
      where modelo = 'documento' and comprador_id is not null
      group by request_id having count(distinct comprador_id) > 1
   );
