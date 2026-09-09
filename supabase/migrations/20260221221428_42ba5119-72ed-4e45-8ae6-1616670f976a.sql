
ALTER TABLE conversas DROP CONSTRAINT IF EXISTS conversas_telefone_key;
ALTER TABLE conversas ADD CONSTRAINT conversas_telefone_instancia_key UNIQUE(telefone, instancia_id);
