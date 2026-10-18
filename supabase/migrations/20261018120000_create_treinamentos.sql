-- =====================================================================
-- GERAL › Treinamentos — trilhas de treinamento por setor
-- =====================================================================
-- Cada trilha é uma página HTML interativa (missões, jogo, quiz e
-- certificado) que roda isolada num iframe sandbox dentro do SISTEN. A
-- trilha avisa o SISTEN a cada missão concluída (postMessage) e o
-- progresso fica gravado POR USUÁRIO aqui — o mesmo colaborador continua
-- de onde parou em qualquer aparelho.
--
-- trein_trilhas    catálogo: setor (core_setores), procedimento-base, arquivo
-- trein_progresso  uma linha por usuário × trilha × missão, guardando o melhor
--                  resultado (XP e estrelas nunca diminuem ao refazer)
--
-- O arquivo da trilha vem do próprio app (arquivo_origem = 'app', versionado
-- em public/treinamentos/) ou do bucket 'treinamentos' (arquivo_origem =
-- 'storage', subido pela tela por quem gerencia treinamentos).

create table if not exists public.trein_trilhas (
  id uuid primary key default gen_random_uuid(),
  setor_id text not null references public.core_setores(id),
  -- Procedimento ou documento-base da trilha (ex.: PO.SUP-0004)
  codigo text not null,
  titulo text not null,
  descricao text,
  revisao text,
  total_missoes int not null check (total_missoes between 1 and 100),
  duracao_min int check (duracao_min is null or duracao_min > 0),
  arquivo_origem text not null default 'storage' check (arquivo_origem in ('app', 'storage')),
  arquivo_path text not null,
  ordem int not null default 0,
  ativo boolean not null default true,
  criado_por text default (auth.uid())::text references public.core_perfis(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (setor_id, codigo)
);

create index if not exists idx_trein_trilhas_setor on public.trein_trilhas (setor_id, ordem);

create or replace function public.trein_trilhas_antes_gravar()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_trein_trilhas_antes_gravar on public.trein_trilhas;
create trigger trg_trein_trilhas_antes_gravar
  before update on public.trein_trilhas
  for each row execute function public.trein_trilhas_antes_gravar();

create table if not exists public.trein_progresso (
  id uuid primary key default gen_random_uuid(),
  trilha_id uuid not null references public.trein_trilhas(id) on delete cascade,
  usuario_id text not null default (auth.uid())::text references public.core_perfis(id) on delete cascade,
  missao int not null check (missao >= 1),
  titulo_missao text,
  insignia text,
  xp int not null default 0 check (xp between 0 and 1000),
  estrelas smallint not null default 0 check (estrelas between 0 and 3),
  -- Acertos/erros da tentativa que deu o melhor XP
  acertos int,
  perguntas int,
  erros_jogo int,
  tentativas int not null default 1,
  -- Primeira vez que a missão foi concluída; não muda ao refazer
  concluida_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (trilha_id, usuario_id, missao)
);

create index if not exists idx_trein_progresso_usuario on public.trein_progresso (usuario_id, trilha_id);

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
-- Catálogo: todos com login leem as trilhas ativas; admin ou a flag
-- trein_gerenciar (Gestão de Acessos) cadastram e veem as inativas.
alter table public.trein_trilhas enable row level security;

drop policy if exists trein_trilhas_sel on public.trein_trilhas;
create policy trein_trilhas_sel on public.trein_trilhas
  for select to authenticated
  using (ativo or public.has_role('admin') or public.has_page_access('trein_gerenciar'));

drop policy if exists trein_trilhas_ins on public.trein_trilhas;
create policy trein_trilhas_ins on public.trein_trilhas
  for insert to authenticated
  with check (public.has_role('admin') or public.has_page_access('trein_gerenciar'));

drop policy if exists trein_trilhas_upd on public.trein_trilhas;
create policy trein_trilhas_upd on public.trein_trilhas
  for update to authenticated
  using (public.has_role('admin') or public.has_page_access('trein_gerenciar'))
  with check (public.has_role('admin') or public.has_page_access('trein_gerenciar'));

drop policy if exists trein_trilhas_del on public.trein_trilhas;
create policy trein_trilhas_del on public.trein_trilhas
  for delete to authenticated
  using (public.has_role('admin'));

grant select, insert, update, delete on public.trein_trilhas to authenticated;

-- Progresso: cada um lê e grava só o seu; quem gerencia lê o de todos.
-- Apagar progresso (zerar um colaborador) é só do admin.
alter table public.trein_progresso enable row level security;

drop policy if exists trein_progresso_sel on public.trein_progresso;
create policy trein_progresso_sel on public.trein_progresso
  for select to authenticated
  using (
    usuario_id = (select auth.uid())::text
    or public.has_role('admin')
    or public.has_page_access('trein_gerenciar')
  );

drop policy if exists trein_progresso_ins on public.trein_progresso;
create policy trein_progresso_ins on public.trein_progresso
  for insert to authenticated
  with check (usuario_id = (select auth.uid())::text);

drop policy if exists trein_progresso_upd on public.trein_progresso;
create policy trein_progresso_upd on public.trein_progresso
  for update to authenticated
  using (usuario_id = (select auth.uid())::text)
  with check (usuario_id = (select auth.uid())::text);

drop policy if exists trein_progresso_del on public.trein_progresso;
create policy trein_progresso_del on public.trein_progresso
  for delete to authenticated
  using (public.has_role('admin'));

grant select, insert, update, delete on public.trein_progresso to authenticated;

-- ---------------------------------------------------------------------
-- RPC: registrar missão concluída (chamada pelo SISTEN ao receber o aviso
-- da trilha). Idempotente — o reenvio da fila offline não duplica nem
-- piora o resultado: XP e estrelas ficam com o maior valor.
-- ---------------------------------------------------------------------
create or replace function public.trein_registrar_missao(
  p_trilha_id uuid,
  p_missao int,
  p_xp int,
  p_estrelas int,
  p_acertos int default null,
  p_perguntas int default null,
  p_erros_jogo int default null,
  p_titulo_missao text default null,
  p_insignia text default null
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_uid text := (auth.uid())::text;
  v_total int;
  v_xp int := least(greatest(coalesce(p_xp, 0), 0), 1000);
  v_estrelas int := least(greatest(coalesce(p_estrelas, 0), 0), 3);
begin
  if v_uid is null then
    raise exception 'Sessão expirada' using errcode = '42501';
  end if;

  select total_missoes into v_total
    from public.trein_trilhas
   where id = p_trilha_id and ativo;
  if v_total is null then
    raise exception 'Trilha não encontrada ou inativa' using errcode = 'P0002';
  end if;
  if p_missao is null or p_missao < 1 or p_missao > v_total then
    raise exception 'Missão % fora da trilha (1 a %)', p_missao, v_total using errcode = '22023';
  end if;

  insert into public.trein_progresso as tp (
    trilha_id, usuario_id, missao, titulo_missao, insignia,
    xp, estrelas, acertos, perguntas, erros_jogo
  ) values (
    p_trilha_id, v_uid, p_missao, p_titulo_missao, p_insignia,
    v_xp, v_estrelas, p_acertos, p_perguntas, p_erros_jogo
  )
  on conflict (trilha_id, usuario_id, missao) do update set
    titulo_missao = coalesce(excluded.titulo_missao, tp.titulo_missao),
    insignia = coalesce(excluded.insignia, tp.insignia),
    acertos = case when excluded.xp >= tp.xp then excluded.acertos else tp.acertos end,
    perguntas = case when excluded.xp >= tp.xp then excluded.perguntas else tp.perguntas end,
    erros_jogo = case when excluded.xp >= tp.xp then excluded.erros_jogo else tp.erros_jogo end,
    xp = greatest(tp.xp, excluded.xp),
    estrelas = greatest(tp.estrelas, excluded.estrelas),
    tentativas = tp.tentativas + 1,
    atualizado_em = now();
end;
$$;

revoke all on function public.trein_registrar_missao(uuid, int, int, int, int, int, int, text, text) from public, anon;
grant execute on function public.trein_registrar_missao(uuid, int, int, int, int, int, int, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- RPC: participantes de uma trilha (painel de quem gerencia). Junta nome e
-- setor de core_perfis sem abrir a tabela de perfis para o cliente.
-- ---------------------------------------------------------------------
create or replace function public.trein_participantes(p_trilha_id uuid)
returns table (
  usuario_id text,
  nome text,
  email text,
  setor text,
  missoes_concluidas int,
  total_missoes int,
  xp int,
  estrelas int,
  ultima_atividade timestamptz,
  concluida_em timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not (public.has_role('admin') or public.has_page_access('trein_gerenciar')) then
    raise exception 'Sem permissão para ver os participantes' using errcode = '42501';
  end if;

  return query
  select
    p.usuario_id,
    cp.name,
    cp.email,
    s.name,
    count(*)::int,
    t.total_missoes,
    sum(p.xp)::int,
    sum(p.estrelas)::int,
    max(p.atualizado_em),
    case when count(*) >= t.total_missoes then max(p.concluida_em) end
  from public.trein_progresso p
  join public.trein_trilhas t on t.id = p.trilha_id
  join public.core_perfis cp on cp.id = p.usuario_id
  left join public.core_setores s on s.id = cp.sector_id
  where p.trilha_id = p_trilha_id
  group by p.usuario_id, cp.name, cp.email, s.name, t.total_missoes
  order by count(*) desc, sum(p.xp) desc, cp.name;
end;
$$;

revoke all on function public.trein_participantes(uuid) from public, anon;
grant execute on function public.trein_participantes(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Arquivos das trilhas (HTML) subidos pela tela
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('treinamentos', 'treinamentos', false)
on conflict (id) do nothing;

drop policy if exists "treinamentos_objects_read" on storage.objects;
create policy "treinamentos_objects_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'treinamentos');

drop policy if exists "treinamentos_objects_insert" on storage.objects;
create policy "treinamentos_objects_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'treinamentos' and (public.has_role('admin') or public.has_page_access('trein_gerenciar')));

drop policy if exists "treinamentos_objects_update" on storage.objects;
create policy "treinamentos_objects_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'treinamentos' and (public.has_role('admin') or public.has_page_access('trein_gerenciar')));

drop policy if exists "treinamentos_objects_delete" on storage.objects;
create policy "treinamentos_objects_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'treinamentos' and (public.has_role('admin') or public.has_page_access('trein_gerenciar')));

-- ---------------------------------------------------------------------
-- Primeira trilha: Suprimentos › PO.SUP-0004 (Processo de Compras)
-- ---------------------------------------------------------------------
insert into public.trein_trilhas (
  setor_id, codigo, titulo, descricao, revisao,
  total_missoes, duracao_min, arquivo_origem, arquivo_path, ordem
) values (
  '5',
  'PO.SUP-0004',
  'Trilha de Compras',
  'Processo de Compras em 11 missões: regras de ouro, tipos de compra, fluxo normal e urgente, cotações e QQP, alçadas N1–N7, fornecedores A/B/C, qualificação, cadastro e avaliação de desempenho.',
  'Rev. 08',
  11,
  50,
  'app',
  'treinamentos/trilha-po-sup-0004.html',
  1
)
on conflict (setor_id, codigo) do nothing;
