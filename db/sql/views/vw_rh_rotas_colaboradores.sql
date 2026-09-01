-- Módulo RH — View que vincula todas as pessoas cadastradas com suas rotas correspondentes
-- Aplicado via Supabase MCP em 2026-08-27 (migration create_vw_rh_ase_itens_and_rotas).
-- 2026-08-30: passa a ignorar rotas com exclusão lógica (excluido_em).

create or replace view public.vw_rh_rotas_colaboradores as
select
  p.id as pessoa_id,
  p.registro,
  p.nome,
  p.cargo,
  p.ativo as pessoa_ativa,
  r.id as rota_id,
  r.rota,
  r.ponto_embarque,
  r.horario as horario_embarque,
  r.contato,
  r.ativo as rota_ativa
from public.rh_pessoas p
left join lateral (
  select
    rot.id,
    rot.rota,
    rot.ponto_embarque,
    rot.horario,
    rot.contato,
    rot.ativo
  from public.rh_rotas rot
  where rot.ativo = true
    and rot.excluido_em is null
    and translate(lower(trim(rot.funcionario)), 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn')
      = translate(lower(trim(p.nome)), 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn')
  order by
    case when rot.rota = 'Rota Turno' then 2 else 1 end,
    rot.created_at desc
  limit 1
) r on true;
