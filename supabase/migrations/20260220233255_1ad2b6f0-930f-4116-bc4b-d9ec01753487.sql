
ALTER TABLE conversas ADD COLUMN IF NOT EXISTS campanha text;
ALTER TABLE conversas ADD COLUMN IF NOT EXISTS anuncio text;
ALTER TABLE conversas ADD COLUMN IF NOT EXISTS ref_code text;

CREATE TABLE public.links_rastreavel (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  instancia_id uuid REFERENCES instancias(id),
  nome text NOT NULL,
  source text NOT NULL,
  campaign text,
  ad text,
  mensagem_personalizada text,
  url_gerada text,
  cliques integer DEFAULT 0,
  ativo boolean DEFAULT true,
  criado_em timestamp with time zone DEFAULT now()
);

ALTER TABLE public.links_rastreavel ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON public.links_rastreavel FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX idx_links_instancia ON links_rastreavel(instancia_id);
