-- Exclusão lógica (soft-delete) dos formulários operacionais.
-- Aplicado via Supabase MCP em 2026-08-30 (migration soft_delete_formularios).
--
-- Cada tabela de formulário ganha:
--   excluido_em  timestamptz  -- nulo = registro vigente; preenchido = oculto das listagens
--   excluido_por text          -- core_perfis(id) de quem ocultou
-- + índice parcial para manter barato o filtro padrão "excluido_em is null".
--
-- O "Excluir" das telas nunca mais apaga a linha (ver src/lib/softDelete.ts);
-- um administrador pode restaurar. DELETE físico só em rotina de expurgo.

do $$
declare
  t text;
  tabelas text[] := array[
    'port_controle_equipamentos','port_registro_transportes','port_controle_carretas',
    'port_relatorio_portaria','port_relatorio_ocorrencias','port_briefing_sessoes',
    'port_briefing_participantes','port_passagem_plantao','port_vigilantes','port_materiais_seguranca',
    'expedicao_carregamentos','expedicao_tramos','expedicao_fotos',
    'rh_ase_solicitacoes','rh_ase_itens','rh_rotas'
  ];
begin
  foreach t in array tabelas loop
    execute format('alter table public.%I add column if not exists excluido_em timestamptz', t);
    execute format('alter table public.%I add column if not exists excluido_por text references public.core_perfis(id)', t);
    execute format(
      'create index if not exists %I on public.%I (excluido_em) where excluido_em is null',
      t || '_excluido_em_idx', t
    );
  end loop;
end $$;
