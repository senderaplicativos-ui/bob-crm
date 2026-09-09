
-- Configuração Meta por instância (Pixel + Token)
CREATE TABLE public.meta_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instancia_id uuid REFERENCES instancias(id) NOT NULL UNIQUE,
  pixel_id text NOT NULL,
  access_token text NOT NULL,
  ativo boolean DEFAULT true,
  criado_em timestamptz DEFAULT now(),
  atualizado_em timestamptz DEFAULT now()
);

ALTER TABLE public.meta_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to meta_config" ON public.meta_config FOR ALL USING (true) WITH CHECK (true);

-- Mapeamento: qual estágio do funil dispara qual evento Meta
CREATE TABLE public.mapeamento_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instancia_id uuid REFERENCES instancias(id) NOT NULL,
  estagio_nome text NOT NULL,
  evento_meta text NOT NULL,
  ativo boolean DEFAULT true,
  criado_em timestamptz DEFAULT now(),
  UNIQUE(instancia_id, estagio_nome)
);

ALTER TABLE public.mapeamento_eventos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to mapeamento_eventos" ON public.mapeamento_eventos FOR ALL USING (true) WITH CHECK (true);

-- Log de eventos disparados
CREATE TABLE public.log_eventos_meta (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instancia_id uuid REFERENCES instancias(id),
  conversa_id uuid REFERENCES conversas(id),
  telefone text,
  evento_meta text NOT NULL,
  estagio_origem text,
  status_resposta integer,
  resposta text,
  criado_em timestamptz DEFAULT now()
);

ALTER TABLE public.log_eventos_meta ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to log_eventos_meta" ON public.log_eventos_meta FOR ALL USING (true) WITH CHECK (true);
