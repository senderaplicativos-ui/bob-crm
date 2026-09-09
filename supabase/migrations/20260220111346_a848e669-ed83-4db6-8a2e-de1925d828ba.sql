
CREATE TABLE public.instancias (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome text NOT NULL,
  telefone_conectado text,
  evolution_url text,
  evolution_api_key text,
  evolution_instance_name text,
  ativo boolean DEFAULT true,
  criado_em timestamp with time zone DEFAULT now(),
  atualizado_em timestamp with time zone DEFAULT now()
);

ALTER TABLE public.instancias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to instancias" ON public.instancias FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE conversas ADD COLUMN IF NOT EXISTS instancia_id uuid REFERENCES instancias(id);
ALTER TABLE mensagens ADD COLUMN IF NOT EXISTS instancia_id uuid REFERENCES instancias(id);
ALTER TABLE regras ADD COLUMN IF NOT EXISTS instancia_id uuid REFERENCES instancias(id);

CREATE INDEX IF NOT EXISTS idx_conversas_instancia ON conversas(instancia_id);
CREATE INDEX IF NOT EXISTS idx_mensagens_instancia ON mensagens(instancia_id);
CREATE INDEX IF NOT EXISTS idx_regras_instancia ON regras(instancia_id);
