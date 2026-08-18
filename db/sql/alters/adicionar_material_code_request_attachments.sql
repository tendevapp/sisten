-- Vínculo direto anexo → material SAP, sem depender de join com
-- request_items. Habilita, no futuro, puxar automaticamente uma imagem já
-- anexada anteriormente para o mesmo material_code ao abrir uma nova
-- solicitação com o mesmo código SAP.
--
-- Preenchida a partir de request_items.sap_code no momento do upload
-- (localDb.uploadAttachments); nula nos anexos de Cadastro SAP, que não têm
-- item vinculado. Backfill abaixo cobre os anexos já existentes.

alter table public.request_attachments add column if not exists material_code text;

create index if not exists request_attachments_material_code_idx
  on public.request_attachments (material_code);

update public.request_attachments ra
set material_code = ri.sap_code
from public.request_items ri
where ra.request_item_id = ri.id
  and ra.material_code is null
  and ri.sap_code is not null
  and ri.sap_code <> '';
