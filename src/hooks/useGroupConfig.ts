import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useInstance } from "@/contexts/InstanceContext";

export function useGroupConfig() {
  const { selected } = useInstance();
  const [aplicarRegrasGrupo, setAplicarRegrasGrupo] = useState(false);
  const [loading, setLoading] = useState(true);

  const configKey = selected ? `aplicar_regras_grupo_${selected.id}` : null;

  const fetchConfig = useCallback(async () => {
    if (!configKey) return;
    setLoading(true);
    const { data } = await supabase
      .from("configuracoes")
      .select("valor")
      .eq("chave", configKey)
      .maybeSingle();
    setAplicarRegrasGrupo(data?.valor === "true");
    setLoading(false);
  }, [configKey]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const toggleConfig = useCallback(async (value: boolean) => {
    if (!configKey) return;
    setAplicarRegrasGrupo(value);
    const { data: existing } = await supabase
      .from("configuracoes")
      .select("id")
      .eq("chave", configKey)
      .maybeSingle();
    if (existing) {
      await supabase.from("configuracoes").update({ valor: String(value) }).eq("id", existing.id);
    } else {
      await supabase.from("configuracoes").insert({ chave: configKey, valor: String(value) });
    }
  }, [configKey]);

  return { aplicarRegrasGrupo, loading, toggleConfig };
}
