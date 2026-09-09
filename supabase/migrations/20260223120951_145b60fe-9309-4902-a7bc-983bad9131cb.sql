
CREATE TABLE IF NOT EXISTS public.log_erros (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tipo text NOT NULL DEFAULT 'webhook',
  mensagem text,
  detalhes text,
  criado_em timestamp with time zone DEFAULT now()
);

CREATE INDEX idx_log_erros_criado ON public.log_erros(criado_em DESC);

ALTER TABLE public.log_erros ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to log_erros"
ON public.log_erros
FOR ALL
USING (true)
WITH CHECK (true);
