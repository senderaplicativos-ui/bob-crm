DROP POLICY IF EXISTS "Acesso Total Usuario Autenticado" ON public.regras;
DROP POLICY IF EXISTS "Allow all access to regras" ON public.regras;

CREATE POLICY "Allow all access to regras"
ON public.regras
FOR ALL
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Acesso Total Usuario Autenticado" ON public.cliques_rastreavel;
DROP POLICY IF EXISTS "Allow all access to cliques_rastreavel" ON public.cliques_rastreavel;
CREATE POLICY "Allow all access to cliques_rastreavel"
ON public.cliques_rastreavel
FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Acesso Total Usuario Autenticado" ON public.mensagens;
DROP POLICY IF EXISTS "Allow all access to mensagens" ON public.mensagens;
CREATE POLICY "Allow all access to mensagens"
ON public.mensagens
FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Acesso Total Usuario Autenticado" ON public.estagios_funil;