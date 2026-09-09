import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useInstance } from "@/contexts/InstanceContext";

export interface EstagioFunil {
  id: string;
  instancia_id: string | null;
  nome: string;
  ordem: number;
  cor: string;
  ativo: boolean | null;
  criado_em: string | null;
}

const DEFAULT_STAGES = [
  { nome: "NOVO", ordem: 1, cor: "#6B7280" },
  { nome: "LEAD", ordem: 2, cor: "#3B82F6" },
  { nome: "CONTATO", ordem: 3, cor: "#F59E0B" },
  { nome: "COMPROU", ordem: 4, cor: "#10B981" },
];

export function useFunnelStages() {
  const { selected } = useInstance();
  const [stages, setStages] = useState<EstagioFunil[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchStages = useCallback(async () => {
    if (!selected) return;
    setLoading(true);
    const { data } = await supabase
      .from("estagios_funil")
      .select("*")
      .eq("instancia_id", selected.id)
      .eq("ativo", true)
      .order("ordem", { ascending: true });
    if (data) setStages(data as EstagioFunil[]);
    setLoading(false);
  }, [selected]);

  const createDefaults = useCallback(async () => {
    if (!selected) return;
    const rows = DEFAULT_STAGES.map((s) => ({ ...s, instancia_id: selected.id }));
    await supabase.from("estagios_funil").insert(rows);
    await fetchStages();
  }, [selected, fetchStages]);

  useEffect(() => {
    fetchStages();
  }, [fetchStages]);

  return { stages, loading, fetchStages, createDefaults };
}
