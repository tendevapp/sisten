/** Gera apenas a carga inicial; usa exatamente o parser do botão. Não executa SQL. */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { lerBaseLancamento } from '../src/lib/inventarioCiclicoImportacao.ts';

const [arquivo, destino] = process.argv.slice(2);
if (!arquivo || !destino) throw new Error('Uso: node --experimental-strip-types scripts/gerar-migration-inventario-base.ts arquivo.xlsm migration.sql');
const bytes = readFileSync(arquivo);
const linhas = lerBaseLancamento(bytes);
const hash = createHash('sha256').update(bytes).digest('hex');
const schema = readFileSync(new URL('../supabase/migrations/20261031104911_alm_inv_importacao_incremental.sql', import.meta.url), 'utf8');
const rpc = schema.slice(schema.indexOf('create function public.alm_inv_importar_base')).replace('create function', 'create or replace function');
const sql = `-- Fonte: Controle Inventario Ciclíco - V1.0.xlsm / Base lançamento / cabeçalho na linha 3.
-- SHA-256: ${hash}
-- ${linhas.length} linhas. Substitui SOMENTE o lote histórico anterior; registros manuais preservados.
-- Backup integral restrito no banco e resumo de diferenças no log da importação.
${rpc}

-- Tipos numéricos antigos podem ter vindo como texto. Comparar valores, não o tipo JSON.
create or replace function public.alm_inv_normalizar_origem(p_dados jsonb) returns jsonb
language sql immutable set search_path = public, pg_temp as $normalizar$
  select coalesce(jsonb_object_agg(key, case
    when value in ('""'::jsonb, 'null'::jsonb) then 'null'::jsonb
    when key in ('Qtde Física','Stock UL (Dep)','Diferença','Valor Divergente','Nº Contagem') then
      to_jsonb(round((case when value #>> '{}' like '%,%' then replace(replace(value #>> '{}','.',''),',','.') else value #>> '{}' end)::numeric,
        case when key='Valor Divergente' then 2 else 8 end))
    when key in ('Material','Depósito','Data Validade') then to_jsonb(trim(value #>> '{}'))
    else value end), '{}'::jsonb) from jsonb_each(p_dados);
$normalizar$;

create table public.alm_inv_backup_base_20261031 (conteudo jsonb not null);
alter table public.alm_inv_backup_base_20261031 enable row level security;
revoke all on public.alm_inv_backup_base_20261031 from public, anon, authenticated;

do $carga$
declare
  v_linhas jsonb := $base$${JSON.stringify(linhas)}$base$::jsonb;
  v_antes jsonb;
  v_depois jsonb;
begin
  perform pg_advisory_xact_lock(hashtext('alm_inv_importar_base'));
  if (select count(*) from public.alm_inventarios where origem='importacao_historica') <> 18
    or (select count(*) from public.alm_inventario_itens i join public.alm_inventarios v on v.id=i.inventario_id where v.origem='importacao_historica') <> 1593
    or exists(select 1 from public.alm_inventarios where origem='importacao_historica' and lote_importacao is distinct from 'base-inventario-21cbbc9a99f0fefd') then
    raise exception 'O histórico mudou desde a conferência: revisar a substituição antes de prosseguir.';
  end if;
  insert into public.alm_inv_backup_base_20261031(conteudo)
  select jsonb_agg(to_jsonb(v) || jsonb_build_object('itens',(
    select jsonb_agg(to_jsonb(i) || jsonb_build_object('contagens',(
      select jsonb_agg(to_jsonb(c)) from public.alm_inventario_contagens c where c.item_id=i.id
    ))) from public.alm_inventario_itens i where i.inventario_id=v.id
  ))) from public.alm_inventarios v where v.origem='importacao_historica';
  with chaves as (
    select i.id, concat(v.data,'|',i.material,'|',i.deposito,'|',row_number() over(partition by v.data,i.material,i.deposito order by i.origem_linha,i.id)) chave
    from public.alm_inventario_itens i join public.alm_inventarios v on v.id=i.inventario_id where v.origem='importacao_historica'
  ) update public.alm_inventario_itens i set origem_chave=c.chave from chaves c where i.id=c.id;
  v_antes := public.alm_inv_importar_base(v_linhas,'Controle Inventario Ciclíco - V1.0.xlsm',false);
  delete from public.alm_inventarios where origem='importacao_historica' and lote_importacao='base-inventario-21cbbc9a99f0fefd';
  v_depois := public.alm_inv_importar_base(v_linhas,'Controle Inventario Ciclíco - V1.0.xlsm',true);
  if (v_depois->>'inseridos')::int <> ${linhas.length} then raise exception 'Carga incompleta.'; end if;
  -- Registra a comparação ANTES da substituição, com o total efetivamente carregado.
  update public.alm_inv_importacoes set resumo=v_antes || jsonb_build_object('inseridos',${linhas.length})
    where id=(select id from public.alm_inv_importacoes order by created_at desc limit 1);
end;
$carga$;
`;
writeFileSync(destino, sql, 'utf8');
console.log(JSON.stringify({ linhas: linhas.length, datas: new Set(linhas.map(l => l.data)).size, de: linhas[0].data, ate: linhas.at(-1)?.data, divergencias: linhas.filter(l => l.dados.Status === 'Divergência').length, semQuantidade: linhas.filter(l => l.dados['Qtde Física'] == null).length, bytesSQL: Buffer.byteLength(sql), hash }));
