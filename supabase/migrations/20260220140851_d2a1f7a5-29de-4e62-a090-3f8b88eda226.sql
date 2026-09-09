CREATE TABLE public.estagios_funil (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  instancia_id uuid REFERENCES instancias(id),
  nome text NOT NULL,
  ordem integer NOT NULL DEFAULT 0,
  cor text DEFAULT '#3B82F6',
  ativo boolean DEFAULT true,
  criado_em timestamp with time zone DEFAULT now()
);

ALTER TABLE public.estagios_funil ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to estagios_funil" ON public.estagios_funil FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_estagios_instancia ON estagios_funil(instancia_id);