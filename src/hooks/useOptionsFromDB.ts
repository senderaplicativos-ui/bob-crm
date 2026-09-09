import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useInstance } from "@/contexts/InstanceContext";

export function useOptionsFromDB() {
  const { selected } = useInstance();
  const [statuses, setStatuses] = useState<string[]>(["NOVO"]);
  const [origins, setOrigins] = useState<string[]>([]);

  useEffect(() => {
    const fetch = async () => {
      let query = supabase.from("regras").select("tipo_regra, resultado, instancia_id");
      if (selected?.id) {
        query = query.eq("instancia_id", selected.id);
      }
      const { data: regras } = await query;

      const allStatuses = new Set(["NOVO"]);
      const allOrigins = new Set<string>();

      if (regras) {
        regras.forEach((r) => {
          if (r.tipo_regra === "STATUS" && r.resultado) allStatuses.add(r.resultado);
          if (r.tipo_regra === "ORIGEM" && r.resultado) allOrigins.add(r.resultado);
        });
      }

      setStatuses([...allStatuses]);
      setOrigins([...allOrigins]);
    };
    fetch();
  }, [selected?.id]);

  return { statuses, origins };
}
