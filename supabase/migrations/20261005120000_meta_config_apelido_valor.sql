-- Apelido local do pixel + moeda/valor padrão para eventos de venda.
-- (O banco de produção é Mongo/schemaless; esta migration mantém o schema
-- legado do Supabase documentado para novos ambientes.)
ALTER TABLE public.meta_config ADD COLUMN IF NOT EXISTS apelido text;
ALTER TABLE public.meta_config ADD COLUMN IF NOT EXISTS moeda text;
ALTER TABLE public.meta_config ADD COLUMN IF NOT EXISTS valor_padrao numeric;
