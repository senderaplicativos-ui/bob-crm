import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useInstance } from "@/contexts/InstanceContext";
import { EstagioFunil } from "@/hooks/useFunnelStages";

/**
 * Returns STATUS rule results that don't exist as funnel stages.
 */
export function useMissingStages(stages: EstagioFunil[]) {
  const { selected } = useInstance();
  const [missingStatuses, setMissingStatuses] = useState<string[]>([]);

  const check = useCallback(async () => {
    if (!selected) return;
    const { data } = await supabase
      .from("regras")
      .select("resultado")
      .eq("tipo_regra", "STATUS")
      .or(`instancia_id.eq.${selected.id},instancia_id.is.null`)
      .eq("ativo", true);
    if (!data) return;
    const stageNames = new Set(stages.map((s) => s.nome));
    const unique = [...new Set(data.map((r) => r.resultado))].filter((r) => !stageNames.has(r));
    setMissingStatuses(unique);
  }, [selected, stages]);

  useEffect(() => {
    check();
  }, [check]);

  return { missingStatuses, refresh: check };
}
