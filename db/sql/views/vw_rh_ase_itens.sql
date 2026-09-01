-- Módulo RH — View que une os itens de ASE com o cadastro de rotas e pontos de embarque de transporte pelo nome do colaborador
-- Aplicado via Supabase MCP em 2026-08-27 (migration create_vw_rh_ase_itens_and_rotas).
-- 2026-08-30: passa a ignorar itens e rotas com exclusão lógica (excluido_em).

create or replace view public.vw_rh_ase_itens as
select
  i.id,
  i.solicitacao_id,
  i.pessoa_id,
  i.registro,
  i.nome,
  i.cargo,
  i.transporte,
  i.refeicao,
  i.hora_entrada,
  i.hora_saida,
  i.intervalo_minutos,
  i.percentual_he,
  i.total_horas,
  i.observacao,
  r.rota as rota_transporte,
  r.ponto_embarque as ponto_embarque_transporte,
  r.horario as horario_embarque_transporte,
  r.contato as contato_transporte,
  i.created_at
from public.rh_ase_itens i
left join lateral (
  select
    rot.rota,
    rot.ponto_embarque,
    rot.horario,
    rot.contato
  from public.rh_rotas rot
  where rot.ativo = true
    and rot.excluido_em is null
    and translate(lower(trim(rot.funcionario)), 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn')
      = translate(lower(trim(i.nome)), 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn')
  order by
    case when rot.rota = 'Rota Turno' then 2 else 1 end,
    rot.created_at desc
  limit 1
) r on true
where i.excluido_em is null;
