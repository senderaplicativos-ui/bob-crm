ALTER TABLE conversas ADD COLUMN is_grupo boolean DEFAULT false;
UPDATE conversas SET is_grupo = true WHERE LENGTH(telefone) > 15;