-- =====================================================================
-- Chegada física no almoxarifado de itens com PO emitida mas ainda sem
-- MIGO lançado no SAP.
--
-- Contexto: o fluxo real de recebimento é chegada física no almoxarifado
-- -> conferência/entrada -> envio da NF para lançamento -> MIGO aparece
-- no SAP. Essa tabela registra o intervalo entre a chegada física e o
-- MIGO, para a equipe do almoxarifado (aba "Almoxarifado" em Rastreio
-- Compras) e para auditoria na Central de Compras (filtro "Sem MIGO").
--
-- Modelo por presença: uma linha = item marcado como chegado. Desfazer a
-- marcação apaga a linha (sem coluna booleana "chegou").
-- =====================================================================

create table if not exists public.almoxarifado_chegadas (
  ri text primary key,
  rm text,
  data_chegada date not null,
  registrado_por_id text,
  registrado_por_nome text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.almoxarifado_chegadas to anon, authenticated;
