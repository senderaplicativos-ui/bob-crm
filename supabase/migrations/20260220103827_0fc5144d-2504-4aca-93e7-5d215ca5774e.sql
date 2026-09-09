-- Change atualizado_em to timestamptz (it's currently timestamp without time zone)
ALTER TABLE conversas ALTER COLUMN atualizado_em TYPE timestamp with time zone USING atualizado_em AT TIME ZONE 'UTC';
ALTER TABLE conversas ALTER COLUMN atualizado_em SET DEFAULT now();

-- Also fix criado_em while we're at it
ALTER TABLE conversas ALTER COLUMN criado_em TYPE timestamp with time zone USING criado_em AT TIME ZONE 'UTC';
ALTER TABLE conversas ALTER COLUMN criado_em SET DEFAULT now();

-- Fix mensagens timestamps too
ALTER TABLE mensagens ALTER COLUMN criado_em TYPE timestamp with time zone USING criado_em AT TIME ZONE 'UTC';
ALTER TABLE mensagens ALTER COLUMN criado_em SET DEFAULT now();

-- Fix regras timestamps
ALTER TABLE regras ALTER COLUMN criado_em TYPE timestamp with time zone USING criado_em AT TIME ZONE 'UTC';
ALTER TABLE regras ALTER COLUMN criado_em SET DEFAULT now();

-- Fix configuracoes timestamps
ALTER TABLE configuracoes ALTER COLUMN criado_em TYPE timestamp with time zone USING criado_em AT TIME ZONE 'UTC';
ALTER TABLE configuracoes ALTER COLUMN criado_em SET DEFAULT now();
ALTER TABLE configuracoes ALTER COLUMN atualizado_em TYPE timestamp with time zone USING atualizado_em AT TIME ZONE 'UTC';
ALTER TABLE configuracoes ALTER COLUMN atualizado_em SET DEFAULT now();