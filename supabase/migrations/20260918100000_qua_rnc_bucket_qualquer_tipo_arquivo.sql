-- =====================================================================
-- Qualidade — RNC aceita qualquer tipo de arquivo como evidência (foto,
-- PDF de boletim/RFI, planilha de medição, ZIP de fotos etc.), não só
-- imagem/PDF. Remove a lista de MIME permitidos (null = sem restrição no
-- Storage do Supabase) e sobe o teto de 10 MB para 25 MB — planilha e ZIP
-- de evidências passam fácil do limite pensado só para foto.
-- =====================================================================

update storage.buckets
set allowed_mime_types = null,
    file_size_limit = 26214400
where id = 'qua-rnc-evidencias';
