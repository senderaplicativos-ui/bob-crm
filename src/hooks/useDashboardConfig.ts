import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useInstance } from "@/contexts/InstanceContext";

export type DashboardWidgetType =
  | "leads_por_status"
  | "leads_por_origem"
  | "leads_por_campanha"
  | "funil_vendas"
  | "sem_classificacao"
  | "sem_status"
  | "conversas_por_dia"
  | "mensagens_por_dia"
  | "count_by_status"
  | "count_by_origin";

export interface DashboardWidget {
  id: string;
  type: DashboardWidgetType;
  label: string;
  /** For count_by_status / count_by_origin: the specific value to count */
  filterValue?: string;
}

export const WIDGET_OPTIONS: { type: DashboardWidgetType; label: string; description: string }[] = [
  { type: "leads_por_status", label: "Leads por Status", description: "Gráfico mostrando leads em cada status" },
  { type: "leads_por_origem", label: "Leads por Origem", description: "Gráfico mostrando leads por origem" },
  { type: "leads_por_campanha", label: "Leads por Campanha", description: "Gráfico mostrando leads por campanha" },
  { type: "funil_vendas", label: "Funil de Vendas", description: "Gráfico funil mostrando conversão entre estágios" },
  { type: "sem_classificacao", label: "Sem classificação", description: "Conversas SEM origem definida" },
  { type: "sem_status", label: "Sem status definido", description: "Conversas ainda como NOVO" },
  { type: "conversas_por_dia", label: "Conversas por dia", description: "Volume de conversas por dia" },
  { type: "mensagens_por_dia", label: "Mensagens por dia", description: "Volume de mensagens por dia" },
  { type: "count_by_status", label: "Contagem por Status", description: "Card numérico para um status específico" },
  { type: "count_by_origin", label: "Contagem por Origem", description: "Card numérico para uma origem específica" },
];

const DEFAULT_WIDGETS: DashboardWidget[] = [
  { id: "w1", type: "leads_por_status", label: "Leads por Status" },
  { id: "w2", type: "leads_por_origem", label: "Leads por Origem" },
  { id: "w3", type: "funil_vendas", label: "Funil de Vendas" },
];

let counter = 0;
const genId = () => `w_${Date.now()}_${++counter}`;

export function useDashboardConfig() {
  const { selected } = useInstance();
  const [widgets, setWidgets] = useState<DashboardWidget[]>(DEFAULT_WIDGETS);
  const [loading, setLoading] = useState(true);

  const configKey = selected ? `dashboard_config_${selected.id}` : null;

  const fetchConfig = useCallback(async () => {
    if (!configKey) return;
    setLoading(true);
    const { data } = await supabase
      .from("configuracoes")
      .select("valor")
      .eq("chave", configKey)
      .maybeSingle();
    if (data?.valor) {
      try {
        const parsed = JSON.parse(data.valor) as DashboardWidget[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setWidgets(parsed);
        } else {
          setWidgets(DEFAULT_WIDGETS);
        }
      } catch {
        setWidgets(DEFAULT_WIDGETS);
      }
    } else {
      setWidgets(DEFAULT_WIDGETS);
    }
    setLoading(false);
  }, [configKey]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const saveConfig = useCallback(async (newWidgets: DashboardWidget[]) => {
    if (!configKey) return;
    setWidgets(newWidgets);
    const valor = JSON.stringify(newWidgets);
    const { data: existing } = await supabase
      .from("configuracoes")
      .select("id")
      .eq("chave", configKey)
      .maybeSingle();
    if (existing) {
      await supabase.from("configuracoes").update({ valor }).eq("id", existing.id);
    } else {
      await supabase.from("configuracoes").insert({ chave: configKey, valor });
    }
  }, [configKey]);

  const addWidget = (type: DashboardWidgetType, label?: string, filterValue?: string) => {
    const opt = WIDGET_OPTIONS.find((o) => o.type === type);
    if (!opt) return;
    const updated = [...widgets, { id: genId(), type, label: label || opt.label, filterValue }];
    setWidgets(updated);
    return updated;
  };

  const removeWidget = (id: string) => {
    const updated = widgets.filter((w) => w.id !== id);
    setWidgets(updated);
    return updated;
  };

  return { widgets, loading, saveConfig, addWidget, removeWidget, setWidgets };
}
