-- Migração para higienização de textos técnicos de materiais SAP.
-- Substitui artefatos de truncamento/codificação gerados pelo SAP GUI (ex: '旰掳籷' ou ideogramas) por '...'.

DO $$
DECLARE
  v_rows_updated integer := 1;
BEGIN
  WHILE v_rows_updated > 0 LOOP
    UPDATE public.materials
    SET technical_text = regexp_replace(
      regexp_replace(technical_text, '旰掳籷', '...', 'g'),
      '[\s\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]+$',
      '...'
    )
    WHERE id IN (
      SELECT id FROM public.materials 
      WHERE technical_text ~ '[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]|旰掳籷'
      LIMIT 3000
    );
    GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
    COMMIT;
  END LOOP;
END $$;
