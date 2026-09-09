import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useInstance } from "@/contexts/InstanceContext";
import { EstagioFunil } from "@/hooks/useFunnelStages";

interface RegraColor {
  tipo_regra: string;
  resultado: string;
  cor: string | null;
}

const NOVO_COLOR = "#3B82F6";
const GRUPO_COLOR = "#9CA3AF";
const FALLBACK_COLOR = "#6B7280";

export function useRegraColors() {
  const { selected } = useInstance();
  const [regraColors, setRegraColors] = useState<RegraColor[]>([]);

  const fetchColors = async () => {
    if (!selected) return;
    const { data } = await supabase
      .from("regras")
      .select("tipo_regra, resultado, cor")
      .or(`instancia_id.eq.${selected.id},instancia_id.is.null`)
      .not("cor", "is", null);
    if (data) setRegraColors(data as RegraColor[]);
  };

  useEffect(() => {
    fetchColors();
  }, [selected]);

  const getStatusColor = (status: string, stages: EstagioFunil[]): string => {
    if (status === "NOVO") return NOVO_COLOR;
    if (status === "GRUPO") return GRUPO_COLOR;
    // Priority 1: rule color (regra tem prioridade)
    const regra = regraColors.find((r) => r.tipo_regra === "STATUS" && r.resultado === status);
    if (regra?.cor) return regra.cor;
    // Priority 2: funnel stage color
    const stage = stages.find((s) => s.nome === status);
    if (stage?.cor) return stage.cor;
    return FALLBACK_COLOR;
  };

  const getOrigemColor = (origem: string): string => {
    const regra = regraColors.find((r) => r.tipo_regra === "ORIGEM" && r.resultado === origem);
    if (regra?.cor) return regra.cor;
    return FALLBACK_COLOR;
  };

  return { getStatusColor, getOrigemColor, regraColors, refreshColors: fetchColors };
}
