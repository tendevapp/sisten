-- Trigger para garantir que numero_protocolo em rh_ase_solicitacoes seja sempre unico
-- Caso ocorra concorrencia ou envio de protocolo ja existente, calcula automaticamente o proximo sequencial (-01, -02, etc.)

CREATE OR REPLACE FUNCTION trg_rh_ase_garantir_protocolo_unico()
RETURNS trigger AS $$
DECLARE
  v_conflito boolean;
  v_base text;
  v_maior_seq integer;
BEGIN
  IF NEW.numero_protocolo IS NULL OR trim(NEW.numero_protocolo) = '' THEN
    RETURN NEW;
  END IF;

  -- Verifica se existe outra solicitacao com o mesmo numero_protocolo
  SELECT EXISTS (
    SELECT 1 FROM rh_ase_solicitacoes
    WHERE numero_protocolo = NEW.numero_protocolo
      AND id <> NEW.id
  ) INTO v_conflito;

  IF v_conflito THEN
    -- Extrai a base do protocolo (ex: de 'ASE-090926-PROD' ou 'ASE-090926-PROD-01' extrai 'ASE-090926-PROD')
    IF NEW.numero_protocolo ~ '^(.+)-(\d+)$' THEN
      v_base := regexp_replace(NEW.numero_protocolo, '-(\d+)$', '');
    ELSE
      v_base := NEW.numero_protocolo;
    END IF;

    -- Procura o maior sequencial existente para esta base
    SELECT COALESCE(MAX(
      CASE 
        WHEN numero_protocolo ~ ('^' || v_base || '-(\d+)$') 
        THEN (regexp_match(numero_protocolo, '^' || v_base || '-(\d+)$'))[1]::integer
        ELSE 0
      END
    ), 0)
    INTO v_maior_seq
    FROM rh_ase_solicitacoes
    WHERE id <> NEW.id
      AND (numero_protocolo = v_base OR numero_protocolo ~ ('^' || v_base || '-(\d+)$'));

    -- Atribui o proximo sequencial
    NEW.numero_protocolo := v_base || '-' || LPAD((v_maior_seq + 1)::text, 2, '0');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_rh_ase_garantir_protocolo_unico ON rh_ase_solicitacoes;

CREATE TRIGGER trg_rh_ase_garantir_protocolo_unico
BEFORE INSERT OR UPDATE OF numero_protocolo ON rh_ase_solicitacoes
FOR EACH ROW
EXECUTE FUNCTION trg_rh_ase_garantir_protocolo_unico();
